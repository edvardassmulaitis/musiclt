'use client'

// app/zaidimai/ritmas/RitmasClient.tsx
//
// „Ritmo plytelės" (Piano Tiles stilius) su realia 30 s ištrauka.
//   TIKSLAS AIŠKUS: plytelės krenta 4 takeliais; bakstelk takelį, kai plytelė
//   pasiekia liniją. Nepataikei / praleidai — minus gyvybė (3 gyvybės).
//   Goal — išgyvenk kuo ilgiau ir surink daugiausiai.
//
//   GARSAS: HTML5 <audio> (iOS Safari kelias). Bitai — iš dekoduoto garso.
//   Canvas 60fps, imperatyvu (sklandu).

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import ZaidimoLangas from '@/components/zaidimai/ZaidimoLangas'

type Track = { id: number; title: string; artist: string; previewUrl: string }
type Phase = 'loading' | 'ready' | 'play' | 'results' | 'error'
type Tile = { t: number; lane: number; hit: boolean; miss: boolean }

const LANES = 4
const LEAD = 2.0            // s — plytelė krenta nuo viršaus iki linijos
const HIT_WINDOW = 0.22     // s — kiek anksti/vėlai dar užskaito
const MIN_GAP = 0.42        // s — min tarpas tarp plytelių

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
  const flux = new Float32Array(frames)
  for (let i = 1; i < frames; i++) { const d = energy[i] - energy[i - 1]; flux[i] = d > 0 ? d : 0 }
  const win = 22
  const beats: number[] = []
  let last = -1
  for (let i = 1; i < frames - 1; i++) {
    let sum = 0, cnt = 0
    for (let k = Math.max(0, i - win); k <= Math.min(frames - 1, i + win); k++) { sum += flux[k]; cnt++ }
    const thresh = (sum / cnt) * 1.9 + 0.0009
    if (flux[i] > thresh && flux[i] >= flux[i - 1] && flux[i] >= flux[i + 1]) {
      const t = (i * hop) / sr
      if (t > LEAD + 0.4 && t < buf.duration - 0.3 && (last < 0 || t - last > MIN_GAP)) { beats.push(t); last = t }
    }
  }
  if (beats.length < 8) {
    const grid: number[] = []
    for (let t = LEAD + 0.5; t < buf.duration - 0.3; t += 0.6) grid.push(t)
    return grid
  }
  return beats
}

function buildTiles(beats: number[]): Tile[] {
  let prev = -1
  return beats.map(t => {
    let lane = (Math.random() * LANES) | 0
    if (lane === prev) lane = (lane + 1 + ((Math.random() * (LANES - 1)) | 0)) % LANES
    prev = lane
    return { t, lane, hit: false, miss: false }
  })
}

export default function RitmasClient() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [track, setTrack] = useState<Track | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [results, setResults] = useState<{ score: number; maxCombo: number } | null>(null)

  const tracksRef = useRef<Track[]>([])
  const trackIdxRef = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const durRef = useRef(30)
  const beatsRef = useRef<number[]>([])
  const tilesRef = useRef<Tile[]>([])
  const rafRef = useRef(0)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const scoreRef = useRef(0)
  const comboRef = useRef(0)
  const maxComboRef = useRef(0)
  const livesRef = useRef(3)
  const fbRef = useRef<{ text: string; color: string; at: number; lane: number }>({ text: '', color: '', at: -9, lane: -1 })
  const flashLaneRef = useRef<{ lane: number; at: number }>({ lane: -1, at: -9 })
  const endedRef = useRef(false)

  useEffect(() => {
    const a = new Audio()
    a.preload = 'auto'; a.crossOrigin = 'anonymous'
    audioRef.current = a
    void init()
    return () => { cancelAnimationFrame(rafRef.current); try { a.pause() } catch { /* ok */ } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function init() {
    setPhase('loading'); setErr(null)
    try {
      const res = await fetch('/api/zaidimai/ritmas')
      const j = await res.json()
      if (!res.ok || !j.tracks?.length) { setErr(j.error || 'Nepavyko įkelti'); setPhase('error'); return }
      tracksRef.current = j.tracks; trackIdxRef.current = 0
      await prepareTrack(0)
    } catch { setErr('Tinklo klaida'); setPhase('error') }
  }

  async function prepareTrack(i: number) {
    setPhase('loading')
    const t = tracksRef.current[i % tracksRef.current.length]
    setTrack(t)
    try {
      const ab = await fetch(t.previewUrl).then(r => r.arrayBuffer())
      const AC = (window.AudioContext || (window as any).webkitAudioContext)
      const ctx = new AC()
      const buf = await ctx.decodeAudioData(ab.slice(0))
      durRef.current = buf.duration
      beatsRef.current = detectBeats(buf)
      try { await ctx.close() } catch { /* ok */ }
      audioRef.current!.src = t.previewUrl
      audioRef.current!.load()
      setPhase('ready')
    } catch { setErr('Nepavyko paruošti dainos — bandyk kitą'); setPhase('error') }
  }

  function start() {
    const a = audioRef.current!
    scoreRef.current = 0; comboRef.current = 0; maxComboRef.current = 0; livesRef.current = 3
    tilesRef.current = buildTiles(beatsRef.current)
    endedRef.current = false
    fbRef.current = { text: '', color: '', at: -9, lane: -1 }
    a.currentTime = 0
    a.onended = () => { if (!endedRef.current) finish() }
    const p = a.play()
    if (p?.catch) p.catch(() => { setErr('Naršyklė neleido paleisti garso — bakstelk dar kartą'); setPhase('error') })
    setPhase('play')
  }

  function finish() {
    endedRef.current = true
    cancelAnimationFrame(rafRef.current)
    try { audioRef.current?.pause() } catch { /* ok */ }
    setResults({ score: scoreRef.current, maxCombo: maxComboRef.current })
    setPhase('results')
  }

  useEffect(() => {
    if (phase !== 'play') return
    setupCanvas()
    const onResize = () => setupCanvas()
    window.addEventListener('resize', onResize)
    rafRef.current = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener('resize', onResize) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  function setupCanvas() {
    const c = canvasRef.current
    if (!c) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const rect = c.getBoundingClientRect()
    c.width = Math.round(rect.width * dpr); c.height = Math.round(rect.height * dpr)
    c.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  function tap(e: React.PointerEvent) {
    if (phase !== 'play') return
    const c = canvasRef.current
    if (!c) return
    const rect = c.getBoundingClientRect()
    const lane = Math.max(0, Math.min(LANES - 1, Math.floor(((e.clientX - rect.left) / rect.width) * LANES)))
    const now = audioRef.current!.currentTime
    flashLaneRef.current = { lane, at: now }
    // artimiausia neįvykdyta plytelė tame takelyje
    let best = -1, bestD = 999
    const tiles = tilesRef.current
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i].hit || tiles[i].miss || tiles[i].lane !== lane) continue
      const d = Math.abs(tiles[i].t - now)
      if (d < bestD) { bestD = d; best = i }
    }
    if (best < 0 || bestD > HIT_WINDOW) {
      comboRef.current = 0
      fbRef.current = { text: 'ne ta', color: '#f87171', at: now, lane }
      return
    }
    tiles[best].hit = true
    comboRef.current++
    if (comboRef.current > maxComboRef.current) maxComboRef.current = comboRef.current
    const mult = 1 + Math.min(comboRef.current, 30) * 0.05
    if (bestD < 0.09) { scoreRef.current += Math.round(100 * mult); fbRef.current = { text: 'PERFECT', color: '#22c55e', at: now, lane } }
    else { scoreRef.current += Math.round(55 * mult); fbRef.current = { text: 'GERAI', color: '#f59e0b', at: now, lane } }
  }

  function loop() {
    const a = audioRef.current, c = canvasRef.current
    if (!a || !c) { rafRef.current = requestAnimationFrame(loop); return }
    const now = a.currentTime
    const g = c.getContext('2d')!
    const w = c.clientWidth, h = c.clientHeight
    const laneW = w / LANES
    const hitY = h * 0.8
    const tileH = 58

    // praleistos plytelės
    const tiles = tilesRef.current
    for (const t of tiles) {
      if (!t.hit && !t.miss && now > t.t + HIT_WINDOW) {
        t.miss = true; livesRef.current--; comboRef.current = 0
        fbRef.current = { text: 'PRALEIDAI', color: '#f87171', at: now, lane: t.lane }
      }
    }
    if (livesRef.current <= 0) { finish(); return }

    g.clearRect(0, 0, w, h)

    // takelių linijos
    g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1
    for (let i = 1; i < LANES; i++) { g.beginPath(); g.moveTo(i * laneW, 0); g.lineTo(i * laneW, h); g.stroke() }

    // takelio blyksnis palietus
    const fl = flashLaneRef.current
    if (fl.lane >= 0 && now - fl.at < 0.15) {
      g.fillStyle = `rgba(249,115,22,${0.18 * (1 - (now - fl.at) / 0.15)})`
      g.fillRect(fl.lane * laneW, 0, laneW, h)
    }

    // pataikymo linija
    g.strokeStyle = 'rgba(231,235,242,0.9)'; g.lineWidth = 3
    g.beginPath(); g.moveTo(0, hitY); g.lineTo(w, hitY); g.stroke()
    g.fillStyle = 'rgba(231,235,242,0.5)'; g.font = '800 11px Outfit, system-ui, sans-serif'; g.textAlign = 'center'
    g.fillText('BAKST ČIA', w / 2, hitY - 8)

    // plytelės
    for (const t of tiles) {
      if (t.hit || t.miss) continue
      const dt = t.t - now
      if (dt > LEAD || dt < -HIT_WINDOW) continue
      const cy = hitY - (dt / LEAD) * (hitY + tileH)   // centro y
      const x = t.lane * laneW + laneW * 0.12
      const bw = laneW * 0.76
      const near = Math.abs(dt) < HIT_WINDOW
      g.fillStyle = near ? '#f97316' : 'rgba(249,115,22,0.82)'
      if (near) { g.shadowColor = '#f97316'; g.shadowBlur = 16 }
      roundRect(g, x, cy - tileH / 2, bw, tileH, 12); g.fill()
      g.shadowBlur = 0
    }

    // HUD: taškai + gyvybės + combo
    g.fillStyle = '#e7ebf2'; g.font = '900 22px Outfit, system-ui, sans-serif'; g.textAlign = 'left'
    g.fillText(`${scoreRef.current}`, 16, 34)
    g.textAlign = 'right'; g.font = '900 18px Outfit, system-ui, sans-serif'; g.fillStyle = '#f87171'
    g.fillText('❤'.repeat(Math.max(0, livesRef.current)), w - 14, 32)
    if (comboRef.current > 2) { g.fillStyle = '#f59e0b'; g.font = '900 15px Outfit, system-ui, sans-serif'; g.fillText(`serija ×${comboRef.current}`, w - 14, 52) }

    // feedback
    const fb = fbRef.current, age = now - fb.at
    if (fb.text && age >= 0 && age < 0.5) {
      g.globalAlpha = Math.max(0, 1 - age / 0.5)
      g.fillStyle = fb.color; g.font = '900 22px Outfit, system-ui, sans-serif'; g.textAlign = 'center'
      const fx = fb.lane >= 0 ? fb.lane * laneW + laneW / 2 : w / 2
      g.fillText(fb.text, fx, hitY - 40)
      g.globalAlpha = 1
    }

    // progresas
    const prog = Math.min(1, now / durRef.current)
    g.fillStyle = 'rgba(148,163,184,0.2)'; g.fillRect(0, h - 4, w, 4)
    g.fillStyle = '#f97316'; g.fillRect(0, h - 4, w * prog, 4)

    if (!endedRef.current && now < durRef.current + 0.15 && !a.ended) rafRef.current = requestAnimationFrame(loop)
    else if (!endedRef.current) finish()
  }

  function nextSong() {
    trackIdxRef.current = (trackIdxRef.current + 1) % tracksRef.current.length
    setResults(null); void prepareTrack(trackIdxRef.current)
  }

  return (
    <ZaidimoLangas title="Ritmo plytelės" backHref="/zaidimai/testai" maxWidth={560}>
      <style>{css}</style>

      {phase === 'loading' && (
        <div className="rt-center"><div className="rt-spinner" /><p className="rt-note">{track ? `Ruošiam: ${track.artist} — ${track.title}` : 'Renkam dainą…'}</p></div>
      )}
      {phase === 'error' && (
        <div className="rt-center"><div className="rt-error">{err}</div><button className="rt-cta" onClick={() => void init()}>Bandyti dar</button></div>
      )}

      {phase === 'ready' && track && (
        <div className="rt-ready">
          <div className="rt-badge">RITMO PLYTELĖS</div>
          <h1 className="rt-h1">Bakstelk plyteles</h1>
          <div className="rt-demo">
            <div className="rt-demo-lanes"><span></span><span></span><span></span><span></span></div>
            <div className="rt-demo-tile" />
            <div className="rt-demo-line"><i>BAKST ČIA</i></div>
          </div>
          <p className="rt-lead">Plytelės krenta 4 takeliais. <b>Bakstelk tą takelį, kai plytelė pasiekia baltą liniją.</b> Praleidai plytelę — minus gyvybė. Turi <b>3 gyvybes</b> — išsilaikyk kuo ilgiau!</p>
          <div className="rt-song">🎵 {track.artist} — {track.title}</div>
          <button className="rt-cta big" onClick={start}>▶ Pradėti</button>
          <p className="rt-tiny">Įsijunk garsą 🔊 — su muzika lengviau pagauti ritmą.</p>
        </div>
      )}

      {phase === 'play' && (
        <div className="rt-stage" onPointerDown={tap}>
          <canvas ref={canvasRef} className="rt-canvas" />
        </div>
      )}

      {phase === 'results' && results && (
        <div className="rt-ready">
          <div className="rt-badge">REZULTATAS</div>
          <div className="rt-score">{results.score}</div>
          <p className="rt-lead">Ilgiausia serija <b>×{results.maxCombo}</b></p>
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

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath()
}

const css = `
.rt-center { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 80px 0; }
.rt-spinner { width: 40px; height: 40px; border-radius: 50%; border: 3px solid rgba(148,163,184,0.25); border-top-color: var(--accent-orange); animation: rtspin .8s linear infinite; }
@keyframes rtspin { to { transform: rotate(360deg); } }
.rt-note { font-size: 13px; color: var(--text-muted); }
.rt-error { font-size: 14px; color: var(--accent-red); background: rgba(248,113,113,0.1); border-radius: 10px; padding: 10px 14px; }

.rt-ready { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 22px 0; }
.rt-badge { font-size: 11px; font-weight: 900; letter-spacing: 0.1em; color: var(--accent-orange); }
.rt-h1 { font-size: 28px; font-weight: 900; letter-spacing: -0.02em; margin: 8px 0 14px; color: var(--text-primary); }
.rt-demo { position: relative; width: 150px; height: 120px; border-radius: 12px; background: #0b0f18; overflow: hidden; margin-bottom: 14px; border: 1px solid rgba(140,160,190,0.2); }
.rt-demo-lanes { position: absolute; inset: 0; display: flex; }
.rt-demo-lanes span { flex: 1; border-right: 1px solid rgba(255,255,255,0.06); }
.rt-demo-tile { position: absolute; left: 52%; width: 18%; height: 26px; border-radius: 6px; background: var(--accent-orange); animation: rtdemo 1.8s ease-in infinite; }
@keyframes rtdemo { 0% { top: -28px } 78% { top: 80px } 88% { top: 80px; opacity: 1 } 100% { top: 80px; opacity: 0 } }
.rt-demo-line { position: absolute; left: 0; right: 0; top: 96px; height: 2px; background: #e7ebf2; }
.rt-demo-line i { position: absolute; right: 4px; top: -12px; font-size: 8px; font-weight: 900; color: rgba(231,235,242,0.6); font-style: normal; }
.rt-lead { font-size: 14px; color: var(--text-secondary); line-height: 1.55; max-width: 360px; margin: 0 0 16px; }
.rt-lead b { color: var(--text-primary); }
.rt-song { font-size: 14px; font-weight: 800; color: var(--text-primary); background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.22); border-radius: 999px; padding: 9px 18px; margin-bottom: 16px; }
.rt-score { font-size: 60px; font-weight: 900; color: var(--accent-orange); line-height: 1; margin: 6px 0; }
.rt-cta { font-size: 16px; font-weight: 800; color: #fff; cursor: pointer; border: 0; border-radius: 999px; padding: 13px 28px; background: var(--accent-orange); }
.rt-cta.big { font-size: 19px; padding: 16px 46px; }
.rt-cta.ghost { background: var(--bg-surface); color: var(--text-primary); border: 1px solid rgba(140,160,190,0.3); }
.rt-actions { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; margin-bottom: 14px; }
.rt-tiny { font-size: 12px; color: var(--text-muted); margin: 12px 0 0; }
.rt-back { font-size: 14px; color: var(--text-secondary); text-decoration: none; }
.rt-stage { position: relative; width: 100%; height: 72vh; touch-action: manipulation; user-select: none; cursor: pointer; }
.rt-canvas { width: 100%; height: 100%; display: block; }
`
