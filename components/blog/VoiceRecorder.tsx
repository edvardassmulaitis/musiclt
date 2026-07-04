'use client'
// components/blog/VoiceRecorder.tsx
//
// Balso įvestis recenzijoms / renginių apžvalgoms — alternatyva rašymui.
// Srautas:
//   įrašymas (MediaRecorder, webm/opus) -> POST /api/voice-to-review
//   (Groq Whisper transkripcija + Claude sutvarkymas) -> PERŽIŪRA
//   -> vartotojas patvirtina/paredaguoja -> tekstas PRISEGAMAS prie esamo
//   turinio (niekada neperrašo to, kas jau parašyta).
//
// ATSPARUMAS (po prod bug'o, kai antras įrašas užstrigdavo be galimybės
// sustabdyti):
//   • Stop duoda MOMENTINĮ feedback'ą (phase -> processing iškart),
//     nelaukia MediaRecorder.onstop.
//   • Watchdog: jei `onstop` nesuveikia (flaky kai kuriose naršyklėse),
//     po 1.5s priverstinai apdorojam sukauptus chunk'us. Naudojam
//     timeslice (start(1000)) kad chunk'ai kauptųsi įrašymo metu.
//   • `fetch` su AbortController + 45s timeout — „Transkribuojama…" niekada
//     nepakimba amžinai.
//   • „Atšaukti" mygtukas KIEKVIENOJE būsenoje + re-entry guard.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const MAX_SECONDS = 300 // 5 min auto-stop
const MIN_MS = 2000 // < 2s = per trumpas
const UPLOAD_TIMEOUT_MS = 45000
const STOP_WATCHDOG_MS = 1500

type Phase = 'idle' | 'recording' | 'processing' | 'preview' | 'error'

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c
    } catch {
      /* ignore */
    }
  }
  return ''
}

export function VoiceRecorder({
  context,
  onResult,
}: {
  /** Dinaminis prompt kontekstas (atlikėjas / renginys / vieta). */
  context: string
  /** Patvirtintas tekstas — tėvas prisega prie turinio. */
  onResult: (text: string) => void
}) {
  const [supported, setSupported] = useState(true)
  const [phase, setPhase] = useState<Phase>('idle')
  const [seconds, setSeconds] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [preview, setPreview] = useState('')

  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const startRef = useRef<number>(0)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const mimeRef = useRef<string>('')
  const processedRef = useRef<boolean>(false) // ar šis ciklas jau apdorotas
  const mountedRef = useRef<boolean>(true)

  // Feature detect — jei nepalaikoma, komponentas nepiešiamas (lieka rašymas).
  useEffect(() => {
    const ok =
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof window !== 'undefined' &&
      typeof window.MediaRecorder !== 'undefined'
    setSupported(ok)
  }, [])

  // Cleanup unmount'inant.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      abortRef.current?.abort()
      cleanupStream()
      clearTimers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function clearTimers() {
    if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current)
      autoStopRef.current = null
    }
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current)
      watchdogRef.current = null
    }
  }

  function cleanupStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    recRef.current = null
  }

  async function startRecording() {
    // Re-entry guard — nepradedam naujo įrašo per vykstantį.
    if (phase === 'recording' || phase === 'processing') return

    setErrorMsg('')
    processedRef.current = false

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (e: any) {
      setPhase('error')
      setErrorMsg(
        e?.name === 'NotAllowedError' || e?.name === 'SecurityError'
          ? 'Mikrofono leidimas atmestas. Gali rašyti ranka arba leisti mikrofoną naršyklės nustatymuose.'
          : 'Nepavyko pasiekti mikrofono. Gali rašyti ranka.',
      )
      return
    }

    streamRef.current = stream
    chunksRef.current = []
    const mime = pickMime()
    mimeRef.current = mime

    let rec: MediaRecorder
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    } catch {
      cleanupStream()
      setPhase('error')
      setErrorMsg('Naršyklė nepalaiko įrašymo. Gali rašyti ranka.')
      return
    }

    recRef.current = rec
    rec.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data)
    }
    rec.onstop = () => {
      void finishRecording()
    }

    try {
      rec.start(1000) // timeslice: chunk'ai kaupiasi įrašymo metu
    } catch {
      cleanupStream()
      setPhase('error')
      setErrorMsg('Nepavyko pradėti įrašymo. Gali rašyti ranka.')
      return
    }

    startRef.current = Date.now()
    setSeconds(0)
    setPhase('recording')

    tickRef.current = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startRef.current) / 1000))
    }, 250)
    autoStopRef.current = setTimeout(() => requestStop(), MAX_SECONDS * 1000)
  }

  // Sustabdymas: MOMENTINIS feedback + watchdog jei onstop nesuveiks.
  function requestStop() {
    if (phase !== 'recording') return
    clearTimers()
    setPhase('processing') // iškart parodom kad sustojo ir dirba

    const rec = recRef.current
    try {
      if (rec && rec.state !== 'inactive') rec.stop()
    } catch {
      /* onstop gali nesuveikti — watchdog padengs */
    }

    watchdogRef.current = setTimeout(() => {
      if (!processedRef.current) void finishRecording()
    }, STOP_WATCHDOG_MS)
  }

  async function finishRecording() {
    if (processedRef.current) return
    processedRef.current = true
    clearTimers()

    const elapsed = Date.now() - startRef.current
    const blob = new Blob(chunksRef.current, { type: mimeRef.current || 'audio/webm' })
    cleanupStream()

    if (elapsed < MIN_MS || blob.size < 2000) {
      setPhase('error')
      setErrorMsg('Įrašas per trumpas. Pabandyk padiktuoti ilgiau.')
      return
    }

    setPhase('processing')
    await uploadBlob(blob)
  }

  async function uploadBlob(blob: Blob) {
    const ac = new AbortController()
    abortRef.current = ac
    const timeout = setTimeout(() => ac.abort(), UPLOAD_TIMEOUT_MS)

    try {
      const ext = mimeRef.current.includes('mp4')
        ? 'mp4'
        : mimeRef.current.includes('ogg')
          ? 'ogg'
          : 'webm'
      const fd = new FormData()
      fd.append('audio', blob, `irasas.${ext}`)
      fd.append('context', context || '')

      const res = await fetch('/api/voice-to-review', {
        method: 'POST',
        body: fd,
        signal: ac.signal,
      })
      clearTimeout(timeout)
      if (!mountedRef.current) return

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setPhase('error')
        setErrorMsg(data?.error || 'Nepavyko apdoroti įrašo. Pabandyk dar kartą.')
        return
      }

      const text = (data.text || '').trim()
      if (!text) {
        setPhase('error')
        setErrorMsg('Nepavyko nieko atpažinti. Pabandyk dar kartą.')
        return
      }

      setPreview(text)
      setPhase('preview')
    } catch (e: any) {
      clearTimeout(timeout)
      if (!mountedRef.current) return
      setPhase('error')
      setErrorMsg(
        e?.name === 'AbortError'
          ? 'Užtruko per ilgai. Pabandyk trumpesnį įrašą.'
          : 'Tinklo klaida. Pabandyk dar kartą.',
      )
    } finally {
      abortRef.current = null
    }
  }

  // Universalus „atšaukti / iš naujo" — iš bet kurios būsenos atgal į idle.
  function reset() {
    abortRef.current?.abort()
    processedRef.current = true
    clearTimers()
    cleanupStream()
    setPreview('')
    setErrorMsg('')
    setSeconds(0)
    setPhase('idle')
  }

  function acceptPreview() {
    const t = preview.trim()
    if (t) onResult(t)
    setPreview('')
    setPhase('idle')
  }

  if (!supported) return null

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')

  return (
    <div className="mb-3">
      {/* ── Idle: trigger ── */}
      {phase === 'idle' && (
        <button
          type="button"
          onClick={startRecording}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition"
          style={{
            background: 'rgba(249,115,22,0.10)',
            border: '1px solid rgba(249,115,22,0.30)',
            color: '#f97316',
          }}
        >
          <span aria-hidden>🎤</span> Įrašyti balsu
        </button>
      )}

      {/* ── Recording — visa juosta + aiškus Stabdyti, viskas stabdo ── */}
      {phase === 'recording' && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={requestStop}
            className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-full transition hover:opacity-90"
            style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)' }}
          >
            <span className="vr-dot" aria-hidden />
            <span className="text-xs font-bold tabular-nums" style={{ color: '#fca5a5' }}>
              {mm}:{ss}
            </span>
            <span className="text-xs font-bold" style={{ color: '#fecaca' }}>
              ⏹ Stabdyti
            </span>
          </button>
          <span className="text-[12px]" style={{ color: '#5e7290' }}>
            Spausk „Stabdyti", kai baigsi
          </span>
        </div>
      )}

      {/* ── Processing — su escape hatch'u (nebepakimba) ── */}
      {phase === 'processing' && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 text-xs" style={{ color: '#8aa8cc' }}>
            <span className="vr-spin" aria-hidden />
            Transkribuojama…
          </span>
          <button
            type="button"
            onClick={reset}
            className="text-[14px] font-bold transition hover:opacity-80"
            style={{ color: '#6889a8' }}
          >
            Atšaukti
          </button>
        </div>
      )}

      {/* ── Error ── */}
      {phase === 'error' && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs" style={{ color: '#fca5a5' }}>{errorMsg}</p>
          <button
            type="button"
            onClick={startRecording}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition"
            style={{
              background: 'rgba(249,115,22,0.10)',
              border: '1px solid rgba(249,115,22,0.30)',
              color: '#f97316',
            }}
          >
            <span aria-hidden>🎤</span> Bandyti dar kartą
          </button>
        </div>
      )}

      {/* ── Peržiūros langas ── */}
      {phase === 'preview' &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.6)' }}
            onClick={reset}
          >
            <div
              className="w-full max-w-xl rounded-2xl p-6"
              style={{ background: 'var(--modal-bg, #0d1320)', border: '1px solid var(--modal-border, rgba(255,255,255,0.08))' }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-black mb-1" style={{ color: 'var(--text-primary, #f0f4fc)' }}>
                Balso įvesties peržiūra
              </h3>
              <p className="text-xs mb-3" style={{ color: 'var(--text-muted, #6889a8)' }}>
                Peržiūrėk ir, jei reikia, paredaguok. Tekstas bus pridėtas prie esamo turinio — niekas nepublikuojama automatiškai.
              </p>

              <textarea
                value={preview}
                onChange={(e) => setPreview(e.target.value)}
                rows={12}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none focus:border-[#f97316]/30 transition resize-y"
                style={{
                  background: 'var(--input-bg, rgba(255,255,255,0.05))',
                  border: '1px solid var(--input-border, rgba(255,255,255,0.10))',
                  color: 'var(--input-text, #c8d8f0)',
                  fontFamily: "'DM Sans', sans-serif",
                  lineHeight: 1.6,
                }}
              />

              <div className="flex items-center justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={reset}
                  className="px-4 py-2 rounded-lg text-xs font-bold transition"
                  style={{ color: 'var(--text-muted, #6889a8)' }}
                >
                  Atmesti
                </button>
                <button
                  type="button"
                  onClick={acceptPreview}
                  disabled={!preview.trim()}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-white transition disabled:opacity-40"
                  style={{ background: '#f97316' }}
                >
                  Pridėti prie teksto
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      <style jsx>{`
        .vr-dot {
          width: 9px;
          height: 9px;
          border-radius: 9999px;
          background: #ef4444;
          animation: vr-pulse 1.1s ease-in-out infinite;
        }
        .vr-spin {
          width: 12px;
          height: 12px;
          border-radius: 9999px;
          border: 2px solid rgba(138, 168, 204, 0.3);
          border-top-color: #8aa8cc;
          animation: vr-spin 0.7s linear infinite;
        }
        @keyframes vr-pulse {
          0%,
          100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.35;
            transform: scale(0.7);
          }
        }
        @keyframes vr-spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  )
}
