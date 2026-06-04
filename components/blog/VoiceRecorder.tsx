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
// Tema per CSS kintamuosius. Visa UI lietuviškai. Edge case'ai (spec §9):
// mikrofono leidimas, MediaRecorder nepalaikymas, per trumpas įrašas, serviso
// klaida — visi su aiškia LT žinute; rašyti ranka visada lieka galimybė.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const MAX_SECONDS = 300 // 5 min auto-stop (apsauga nuo per didelių failų)
const MIN_MS = 2000 // < 2s = per trumpas

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
  const mimeRef = useRef<string>('')

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
  useEffect(
    () => () => {
      cleanupStream()
      clearTimers()
    },
    [],
  )

  function clearTimers() {
    if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current)
      autoStopRef.current = null
    }
  }

  function cleanupStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    recRef.current = null
  }

  async function startRecording() {
    setErrorMsg('')
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
    rec.onstop = handleStop
    rec.start()

    startRef.current = Date.now()
    setSeconds(0)
    setPhase('recording')

    tickRef.current = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startRef.current) / 1000))
    }, 250)
    autoStopRef.current = setTimeout(() => stopRecording(), MAX_SECONDS * 1000)
  }

  function stopRecording() {
    clearTimers()
    const rec = recRef.current
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop()
      } catch {
        /* onstop vis tiek nesuveiks — handle'inam defensyviai */
      }
    }
  }

  async function handleStop() {
    const elapsed = Date.now() - startRef.current
    const blob = new Blob(chunksRef.current, { type: mimeRef.current || 'audio/webm' })
    cleanupStream()

    if (elapsed < MIN_MS || blob.size < 2000) {
      setPhase('error')
      setErrorMsg('Įrašas per trumpas. Pabandyk padiktuoti ilgiau.')
      return
    }

    setPhase('processing')
    try {
      const ext = mimeRef.current.includes('mp4')
        ? 'mp4'
        : mimeRef.current.includes('ogg')
          ? 'ogg'
          : 'webm'
      const fd = new FormData()
      fd.append('audio', blob, `irasas.${ext}`)
      fd.append('context', context || '')

      const res = await fetch('/api/voice-to-review', { method: 'POST', body: fd })
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
    } catch {
      setPhase('error')
      setErrorMsg('Tinklo klaida. Pabandyk dar kartą.')
    }
  }

  function acceptPreview() {
    const t = preview.trim()
    if (t) onResult(t)
    setPreview('')
    setPhase('idle')
  }

  function discardPreview() {
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

      {/* ── Recording ── */}
      {phase === 'recording' && (
        <div
          className="inline-flex items-center gap-3 px-3 py-1.5 rounded-full"
          style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)' }}
        >
          <span className="vr-dot" aria-hidden />
          <span className="text-xs font-bold tabular-nums" style={{ color: '#fca5a5' }}>
            {mm}:{ss}
          </span>
          <button
            type="button"
            onClick={stopRecording}
            className="text-xs font-bold transition hover:opacity-80"
            style={{ color: '#fecaca' }}
          >
            ⏹ Stabdyti
          </button>
        </div>
      )}

      {/* ── Processing ── */}
      {phase === 'processing' && (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 text-xs" style={{ color: '#8aa8cc' }}>
          <span className="vr-spin" aria-hidden />
          Transkribuojama…
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
            onClick={discardPreview}
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
                  onClick={discardPreview}
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
