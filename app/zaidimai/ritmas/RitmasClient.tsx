'use client'

// app/zaidimai/ritmas/RitmasClient.tsx
//
// „Pataikyk į bitą" — ritmo žaidimas su realia 30 s ištrauka.
//   * ištrauka atsisiunčiama, dekoduojama (Web Audio) ir analizuojama —
//     aptinkami bitai (energijos onset'ai), tad žaidimas eina pagal TIKRĄ dainą
//   * ratilai traukiasi į centrinį taikinį; baksteli, kai ratilas sutampa
//   * grojama per AudioBufferSource → sample-tikslus laikas, sklandu (canvas 60fps)
// Kol kas be serverio scoringo — žaidžiama /testai zonoje.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import ZaidimoLangas from '@/components/zaidimai/ZaidimoLangas'

type Track = { id: number; title: string; artist: string; previewUrl: string }
type Phase = 'loading' | 'ready' | 'play' | 'results' | 'error'

const LEAD = 1.5            // s — kiek anksti ratilas pasirodo
const W_PERFECT = 0.085     // s
const W_GOOD = 0.19         // s
const W_HIT = 0.24          // s — didžiausias langas užskaitymui

// ── Bitų aptikimas (offline, iš dekoduoto buferio) ──
function detectBeats(buf: AudioBuffer): number[] {
  const ch = buf.getChannelData(0)
  const sr = buf.sampleRate
  const hop = 512
  const frames = Math.floor(ch.length / hop)
  const energy = new Float32Array(frames)
  for (let i = 0; i < frames; i++) {
    let s = 0
    for (let j = 0; j < hop; j++) { const v = ch[i * hop + j] || 0; s += v * v }
    energy[i] = Math.sqrt(s / hop)
  }
  // energijos flux (tik teigiami pokyčiai)
  const flux = new Float32Array(frames)
  for (let i = 1; i < frames; i++) { const d = energy[i] - energy[i - 1]; flux[i] = d > 0 ? d : 0 }
  const win = 22
  const beats: number[] = []
  let last = -1
  for (let i = 1; i < frames - 1; i++) {
    let sum = 0, cnt = 0
    for (let k = Math.max(0, i - win); k <= Math.min(frames - 1, i + win); k++) { sum += flux[k]; cnt++ }
    const thresh = (sum / cnt) * 1.6 + 0.0007
    if (flux[i] > thresh && flux[i] >= flux[i - 1] && flux[i] >= flux[i + 1]) {
      const t = (i * hop) / sr
      if (t > 0.4 && t < buf.duration - 0.3 && (last < 0 || t - last > 0.24)) { beats.push(t); last = t }
    }
  }
  // Atsarginis variantas — jei per reta, dedam tolygų tinklelį
  if (beats.length < 10) {
    const grid: number[] = []
    for (let t = 0.6; t < buf.duration - 0.3; t += 0.5) grid.push(t)
    return grid
  }
  return beats
}

export default function RitmasClient() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [track, setTrack] = useState<Track | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [results, setResults] = useState<{ score: number; maxCombo: number; hits: number; total: number } | null>(null)

  const tracksRef = useRef<Track[]>([])
  const trackIdxRef = useRef(0)
  const ctxRef = useRef<AudioContext | null>(null)
  const bufRef = useRef<AudioBuffer | null>(null)
  const beatsRef = useRef<{ t: number; hit: boolean; miss: boolean }[]>([])
  const srcRef = useRef<AudioBufferSourceNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const freqRef = useRef<Uint8Array | null>(null)
  const startRef = useRef(0)
  const rafRef = useRef(0)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const scoreRef = useRef(0)
  const comboRef = useRef(0)
  const maxComboRef = useRef(0)
  const hitsRef = useRef(0)
  const missRef = useRef(0)
  const fbRef = useRef<{ text: string; color: string; at: number }>({ text: '', color: '', at: -9 })
  const endedRef = useRef(false)

  useEffect(() => {
    void init()
    return () => { cleanup() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function cleanup() {
    cancelAnimationFrame(rafRef.current)
    try { srcRef.current?.stop() } catch { /* ok */ }
    try { ctxRef.current?.close() } catch { /* ok */ }
  }

  async function init() {
    setPhase('loading'); setErr(null)
    try {
      const res = await fetch('/api/zaidimai/ritmas')
      const j = await res.json()
      if (!res.ok || !j.tracks?.length) { setErr(j.error || 'Nepavyko įkelti'); setPhase('error'); return }
      tracksRef.current = j.tracks
      trackIdxRef.current = 0
      const AC = (window.AudioContext || (window as any).webkitAudioContext)
      ctxRef.current = new AC()
      await prepareTrack(0)
    } catch { setErr('Tinklo klaida'); setPhase('error') }
  }

  async function prepareTrack(i: number) {
    setPhase('loading')
    const t = tracksRef.current[i % tracksRef.current.length]
    setTrack(t)
    try {
      const ab = await fetch(t.previewUrl).then(r => r.arrayBuffer())
      const buf = await ctxRef.current!.decodeAudioData(ab)
      bufRef.current = buf
      beatsRef.current = detectBeats(buf).map(tt => ({ t: tt, hit: false, miss: false }))
      setPhase('ready')
    } catch { setErr('Nepavyko paruošti dainos — bandyk kitą'); setPhase('error') }
  }

  function start() {
    const ctx = ctxRef.current!, buf = bufRef.current!
    void ctx.resume()
    scoreRef.current = 0; comboRef.current = 0; maxComboRef.current = 0; hitsRef.current = 0; missRef.current = 0
    beatsRef.current.forEach(b => { b.hit = false; b.miss = false })
    endedRef.current = false
    fbRef.current = { text: '', color: '', at: -9 }

    const src = ctx.createBufferSource(); src.buffer = buf
    const an = ctx.createAnalyser(); an.fftSize = 256
    freqRef.current = new Uint8Array(an.frequencyBinCount)
    src.connect(an); an.connect(ctx.destination)
    src.onended = () => { if (!endedRef.current) finish() }
    srcRef.current = src; analyserRef.current = an
    startRef.current = ctx.currentTime
    src.start()
    setPhase('play')   // canvas paruošimas + ciklas — efekte, kai canvas jau DOM'e
  }

  // Kai įsijungia žaidimo fazė — paruošiam canvas ir startuojam 60fps ciklą
  useEffect(() => {
    if (phase !== 'play') return
    setupCanvas()
    const onResize = () => setupCanvas()
    window.addEventListener('resize', onResize)
    rafRef.current = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener('resize', onResize) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  function finish() {
    endedRef.current = true
    cancelAnimationFrame(rafRef.current)
    try { srcRef.current?.stop() } catch { /* ok */ }
    setResults({ score: scoreRef.current, maxCombo: maxComboRef.current, hits: hitsRef.current, total: hitsRef.current + missRef.current })
    setPhase('results')
  }

  function setupCanvas() {
    const c = canvasRef.current!
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const rect = c.getBoundingClientRect()
    c.width = Math.round(rect.width * dpr)
    c.height = Math.round(rect.height * dpr)
    const ctx2d = c.getContext('2d')!
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  function judge() {
    if (phase !== 'play' && !srcRef.current) return
    const now = ctxRef.current!.currentTime - startRef.current
    let best = -1, bestDelta = 999
    const beats = beatsRef.current
    for (let i = 0; i < beats.length; i++) {
      if (beats[i].hit || beats[i].miss) continue
      const d = Math.abs(beats[i].t - now)
      if (d < bestDelta) { bestDelta = d; best = i }
    }
    if (best < 0 || bestDelta > W_HIT) return
    beats[best].hit = true
    hitsRef.current++
    comboRef.current++
    if (comboRef.current > maxComboRef.current) maxComboRef.current = comboRef.current
    const mult = 1 + Math.min(comboRef.current, 30) * 0.05
    if (bestDelta < W_PERFECT) { scoreRef.current += Math.round(100 * mult); fbRef.current = { text: 'PERFECT', color: '#22c55e', at: now } }
    else if (bestDelta < W_GOOD) { scoreRef.current += Math.round(60 * mult); fbRef.current = { text: 'GERAI', color: '#f59e0b', at: now } }
    else { scoreRef.current += Math.round(30 * mult); fbRef.current = { text: 'OK', color: '#8ea0b8', at: now } }
  }

  function loop() {
    const ctx = ctxRef.current!, buf = bufRef.current!
    const now = ctx.currentTime - startRef.current
    const c = canvasRef.current
    if (!c) { rafRef.current = requestAnimationFrame(loop); return }
    const g = c.getContext('2d')!
    const w = c.clientWidth, h = c.clientHeight
    const cx = w / 2, cy = h / 2
    const Rt = Math.min(w, h) * 0.15
    const Rmax = Math.min(w, h) * 0.52

    // praleisti bitai → miss
    const beats = beatsRef.current
    for (const b of beats) {
      if (!b.hit && !b.miss && now > b.t + W_HIT) { b.miss = true; missRef.current++; comboRef.current = 0; fbRef.current = { text: 'PRALEIDAI', color: '#f87171', at: now } }
    }

    g.clearRect(0, 0, w, h)

    // centrinis pulsuojantis „orb" pagal tikrą garsą
    let energy = 0
    if (analyserRef.current && freqRef.current) {
      analyserRef.current.getByteFrequencyData(freqRef.current as any)
      let s = 0; const n = Math.min(24, freqRef.current.length)
      for (let i = 0; i < n; i++) s += freqRef.current[i]
      energy = s / (n * 255)
    }
    const orbR = Rt * (0.5 + energy * 0.7)
    const grd = g.createRadialGradient(cx, cy, 0, cx, cy, orbR)
    grd.addColorStop(0, 'rgba(249,115,22,0.55)')
    grd.addColorStop(1, 'rgba(249,115,22,0)')
    g.fillStyle = grd
    g.beginPath(); g.arc(cx, cy, orbR, 0, Math.PI * 2); g.fill()

    // taikinys
    g.lineWidth = 3
    g.strokeStyle = 'rgba(231,235,242,0.9)'
    g.beginPath(); g.arc(cx, cy, Rt, 0, Math.PI * 2); g.stroke()

    // artėjantys ratilai
    for (const b of beats) {
      const dt = b.t - now
      if (b.hit || b.miss) continue
      if (dt > LEAD || dt < -W_HIT) continue
      const p = dt / LEAD // 1 toli → 0 taikinyje
      const r = Rt + p * (Rmax - Rt)
      const a = Math.max(0, 1 - p) * 0.9 + 0.1
      g.lineWidth = 3.5
      g.strokeStyle = `rgba(245,158,11,${a})`
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke()
    }

    // HUD
    g.fillStyle = '#e7ebf2'
    g.font = '900 22px Outfit, system-ui, sans-serif'
    g.textAlign = 'left'
    g.fillText(`${scoreRef.current}`, 16, 34)
    g.textAlign = 'right'
    g.fillStyle = '#f59e0b'
    g.fillText(comboRef.current > 1 ? `×${comboRef.current}` : '', w - 16, 34)

    // progreso juosta
    const prog = Math.min(1, now / buf.duration)
    g.fillStyle = 'rgba(148,163,184,0.2)'
    g.fillRect(0, h - 5, w, 5)
    g.fillStyle = '#f97316'
    g.fillRect(0, h - 5, w * prog, 5)

    // feedback tekstas
    const fb = fbRef.current
    const age = now - fb.at
    if (fb.text && age < 0.6) {
      g.globalAlpha = Math.max(0, 1 - age / 0.6)
      g.fillStyle = fb.color
      g.font = '900 26px Outfit, system-ui, sans-serif'
      g.textAlign = 'center'
      g.fillText(fb.text, cx, cy - Rmax * 0.72)
      g.globalAlpha = 1
    }

    if (now < buf.duration + 0.1) rafRef.current = requestAnimationFrame(loop)
    else if (!endedRef.current) finish()
  }

  function nextSong() {
    trackIdxRef.current = (trackIdxRef.current + 1) % tracksRef.current.length
    setResults(null)
    void prepareTrack(trackIdxRef.current)
  }

  return (
    <ZaidimoLangas title="Pataikyk į bitą" backHref="/zaidimai/testai" maxWidth={560}>
      <style>{css}</style>

      {phase === 'loading' && (
        <div className="rt-center">
          <div className="rt-spinner" />
          <p className="rt-note">{track ? `Ruošiam: ${track.artist} — ${track.title}` : 'Renkam dainą…'}</p>
        </div>
      )}

      {phase === 'error' && (
        <div className="rt-center">
          <div className="rt-error">{err}</div>
          <button className="rt-cta" onClick={() => void init()}>Bandyti dar</button>
        </div>
      )}

      {phase === 'ready' && track && (
        <div className="rt-ready">
          <div className="rt-badge">RITMO ŽAIDIMAS</div>
          <h1 className="rt-h1">Pataikyk į bitą</h1>
          <p className="rt-lead">Groja tikra ištrauka. Baksteli, kai <b>ratilas sutampa su taikiniu</b>. Kuo tiksliau — tuo daugiau taškų, serija augina daugiklį.</p>
          <div className="rt-song">🎵 {track.artist} — {track.title}</div>
          <button className="rt-cta big" onClick={start}>▶ Pradėti</button>
        </div>
      )}

      {phase === 'play' && (
        <div className="rt-stage" onPointerDown={judge}>
          <canvas ref={canvasRef} className="rt-canvas" />
          <div className="rt-taphint">bakstelk bet kur ritmu</div>
        </div>
      )}

      {phase === 'results' && results && (
        <div className="rt-ready">
          <div className="rt-badge">REZULTATAS</div>
          <div className="rt-score">{results.score}</div>
          <p className="rt-lead">Pataikyta <b>{results.hits}</b> iš {results.total} · ilgiausia serija <b>×{results.maxCombo}</b></p>
          {track && <div className="rt-song">🎵 {track.artist} — {track.title}</div>}
          <div className="rt-actions">
            <button className="rt-cta" onClick={() => setPhase('ready')}>Dar kartą</button>
            <button className="rt-cta ghost" onClick={nextSong}>Kita daina →</button>
          </div>
          <Link href="/zaidimai/testai" className="rt-back">← Į testavimą</Link>
        </div>
      )}
    </ZaidimoLangas>
  )
}

const css = `
.rt-center { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 80px 0; }
.rt-spinner { width: 40px; height: 40px; border-radius: 50%; border: 3px solid rgba(148,163,184,0.25); border-top-color: var(--accent-orange); animation: rtspin .8s linear infinite; }
@keyframes rtspin { to { transform: rotate(360deg); } }
.rt-note { font-size: 13px; color: var(--text-muted); }
.rt-error { font-size: 14px; color: var(--accent-red); background: rgba(248,113,113,0.1); border-radius: 10px; padding: 10px 14px; }

.rt-ready { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 26px 0; }
.rt-badge { font-size: 11px; font-weight: 900; letter-spacing: 0.1em; color: var(--accent-orange); }
.rt-h1 { font-size: 30px; font-weight: 900; letter-spacing: -0.02em; margin: 8px 0 10px; color: var(--text-primary); }
.rt-lead { font-size: 14px; color: var(--text-secondary); line-height: 1.55; max-width: 360px; margin: 0 0 16px; }
.rt-lead b { color: var(--text-primary); }
.rt-song { font-size: 14px; font-weight: 800; color: var(--text-primary); background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.22); border-radius: 999px; padding: 9px 18px; margin-bottom: 20px; }
.rt-score { font-size: 60px; font-weight: 900; color: var(--accent-orange); line-height: 1; margin: 6px 0 6px; }
.rt-cta { font-size: 16px; font-weight: 800; color: #fff; cursor: pointer; border: 0; border-radius: 999px; padding: 13px 28px; background: var(--accent-orange); }
.rt-cta.big { font-size: 19px; padding: 16px 44px; }
.rt-cta.ghost { background: var(--bg-surface); color: var(--text-primary); border: 1px solid rgba(140,160,190,0.3); }
.rt-actions { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; margin-bottom: 14px; }
.rt-back { font-size: 14px; color: var(--text-secondary); text-decoration: none; }

.rt-stage { position: relative; width: 100%; height: 66vh; touch-action: manipulation; user-select: none; }
.rt-canvas { width: 100%; height: 100%; display: block; }
.rt-taphint { position: absolute; bottom: 14px; left: 0; right: 0; text-align: center; font-size: 12px; color: var(--text-muted); pointer-events: none; }
`
