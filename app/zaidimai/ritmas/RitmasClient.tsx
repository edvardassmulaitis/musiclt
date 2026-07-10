'use client'

// app/zaidimai/ritmas/RitmasClient.tsx
//
// „Skrisk pro bitą" — skrendi pro tunelį, kurio SIENOS formuojamos iš TIKRO
// dainos garsumo (envelope). Laikai — kyli, paleidi — leidiesi. Venk sienų.
//   * GARSAS: HTML5 <audio> (iOS Safari kelias), grojama kilpa.
//   * Sienos ir scenos pulsavimas — iš dainos garsumo (skaičiuojama iš anksto
//     dekodavus ištrauką → patikima ir iOS, be realaus laiko analizės).
//   * 3 gyvybės; greitis auga; canvas 60fps.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import ZaidimoLangas from '@/components/zaidimai/ZaidimoLangas'

type Track = { id: number; title: string; artist: string; previewUrl: string }
type Phase = 'loading' | 'ready' | 'play' | 'results' | 'error'

const FRAME = 0.02   // s — envelope skiriamoji geba

// Garsumo „envelope" (0..1) iš dekoduoto buferio + lengvas išlyginimas
function buildEnvelope(buf: AudioBuffer): { env: Float32Array; dur: number } {
  const ch = buf.getChannelData(0)
  const sr = buf.sampleRate
  const hop = Math.max(1, Math.round(sr * FRAME))
  const n = Math.floor(ch.length / hop)
  const raw = new Float32Array(n)
  let mx = 1e-6
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let j = 0; j < hop; j++) { const v = ch[i * hop + j] || 0; s += v * v }
    raw[i] = Math.sqrt(s / hop)
    if (raw[i] > mx) mx = raw[i]
  }
  // normalizuojam + išlyginam (slenkantis vidurkis)
  const env = new Float32Array(n)
  const win = 4
  for (let i = 0; i < n; i++) {
    let sum = 0, cnt = 0
    for (let k = Math.max(0, i - win); k <= Math.min(n - 1, i + win); k++) { sum += raw[k]; cnt++ }
    env[i] = Math.min(1, (sum / cnt) / mx)
  }
  return { env, dur: buf.duration }
}

export default function RitmasClient() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [track, setTrack] = useState<Track | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [results, setResults] = useState<{ score: number; best: number } | null>(null)

  const tracksRef = useRef<Track[]>([])
  const trackIdxRef = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const envRef = useRef<Float32Array>(new Float32Array([0]))
  const durRef = useRef(30)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef(0)

  const holdingRef = useRef(false)
  const gtRef = useRef(0)          // žaidimo laikas (nepertraukiamas)
  const lastTsRef = useRef(0)
  const flyRef = useRef(0.5)       // 0..1 (santykinis y)
  const vyRef = useRef(0)
  const scoreRef = useRef(0)
  const livesRef = useRef(3)
  const invulnRef = useRef(0)
  const graceRef = useRef(0)       // starto malonės laikas (be kliūčių)
  const flashRef = useRef(0)
  const endedRef = useRef(false)

  useEffect(() => {
    const a = new Audio()
    a.preload = 'auto'; a.crossOrigin = 'anonymous'; a.loop = true
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
      const { env, dur } = buildEnvelope(buf)
      envRef.current = env; durRef.current = dur
      try { await ctx.close() } catch { /* ok */ }
      audioRef.current!.src = t.previewUrl
      audioRef.current!.load()
      setPhase('ready')
    } catch { setErr('Nepavyko paruošti dainos — bandyk kitą'); setPhase('error') }
  }

  function envAt(t: number): number {
    const dur = durRef.current
    let tt = t % dur; if (tt < 0) tt += dur
    const env = envRef.current
    const f = tt / FRAME
    const i = Math.floor(f)
    const frac = f - i
    const a = env[i] || 0, b = env[(i + 1) % env.length] || 0
    return a + (b - a) * frac
  }

  function start() {
    const a = audioRef.current!
    gtRef.current = 0; lastTsRef.current = 0; flyRef.current = 0.5; vyRef.current = 0
    scoreRef.current = 0; livesRef.current = 3; invulnRef.current = 0; graceRef.current = 2.2; flashRef.current = 0
    endedRef.current = false; holdingRef.current = false
    a.currentTime = 0
    const p = a.play()
    if (p?.catch) p.catch(() => { setErr('Naršyklė neleido paleisti garso — bakstelk dar kartą'); setPhase('error') })
    setPhase('play')
  }

  function finish() {
    endedRef.current = true
    cancelAnimationFrame(rafRef.current)
    try { audioRef.current?.pause() } catch { /* ok */ }
    const best = Math.max(scoreRef.current, Number(lsGet('ritmas_best') || 0))
    lsSet('ritmas_best', String(best))
    setResults({ score: scoreRef.current, best })
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

  // tunelio kraštai laikui t (santykiniai 0..1 nuo aukščio)
  // Platus, atlaidus koridorius; garsumas jį truputį siaurina, centras lėtai banguoja.
  function walls(t: number, difficulty: number): { top: number; bot: number } {
    const e = envAt(t)
    const center = 0.5 + Math.sin(t * 0.55) * 0.10
    const baseHalf = 0.34 - difficulty * 0.05   // tylu → platu
    const minHalf = 0.23 - difficulty * 0.04    // garsu → siauriau (bet vis dar atlaidu)
    const half = minHalf + (1 - e) * (baseHalf - minHalf)
    return { top: center - half, bot: center + half }
  }

  function loop(ts: number) {
    const c = canvasRef.current, a = audioRef.current
    if (!c || !a) { rafRef.current = requestAnimationFrame(loop); return }
    const g = c.getContext('2d')!
    const w = c.clientWidth, h = c.clientHeight
    if (!lastTsRef.current) lastTsRef.current = ts
    let dt = (ts - lastTsRef.current) / 1000
    lastTsRef.current = ts
    if (dt > 0.05) dt = 0.05
    gtRef.current += dt
    const gt = gtRef.current

    const difficulty = Math.min(0.55, gt / 120)        // labai pamažu sunkėja
    const pps = 115 + gt * 2.6                          // px/s (greitis lėtai auga)
    const flyerX = w * 0.28

    // fizika — su oro pasipriešinimu (drag), kad būtų sklandu ir valdoma (Copter jausmas):
    // laikai → kyla iki pastovaus greičio, paleidi → leidiesi iki pastovaus greičio.
    const grav = h * 1.5
    const thrust = h * 3.0
    vyRef.current += (holdingRef.current ? -thrust : grav) * dt
    vyRef.current -= vyRef.current * 2.4 * dt          // drag → nėra staigių šuolių
    vyRef.current = Math.max(-h * 0.55, Math.min(h * 0.55, vyRef.current))
    flyRef.current += (vyRef.current / h) * dt
    const flyerY = flyRef.current

    // taškai — už nuskristą atstumą
    scoreRef.current += Math.round(pps * dt / 12)
    if (invulnRef.current > 0) invulnRef.current -= dt
    if (graceRef.current > 0) graceRef.current -= dt
    if (flashRef.current > 0) flashRef.current -= dt

    // kolizija ties flyerX (laikas = gt)
    const wl = walls(gt, difficulty)
    const R = 0.028
    if (invulnRef.current <= 0 && graceRef.current <= 0) {
      if (flyerY - R < wl.top || flyerY + R > wl.bot) {
        livesRef.current--; invulnRef.current = 1.1; flashRef.current = 0.3
        vyRef.current = 0; flyRef.current = (wl.top + wl.bot) / 2   // į koridoriaus vidurį
        if (livesRef.current <= 0) { finish(); return }
      }
    }
    // neišskristi pro viršų/apačią
    if (flyRef.current < 0.02) { flyRef.current = 0.02; vyRef.current = 0 }
    if (flyRef.current > 0.98) { flyRef.current = 0.98; vyRef.current = 0 }

    // ── piešimas ──
    const eNow = envAt(gt)
    g.clearRect(0, 0, w, h)
    // fonas — pulsuoja pagal garsumą
    g.fillStyle = `rgb(${10 + eNow * 24},${16 + eNow * 20},${30 + eNow * 26})`
    g.fillRect(0, 0, w, h)

    // sienos (iš envelope) — imam stulpelius per visą plotį
    const step = 6
    g.fillStyle = 'rgba(139,92,246,0.6)'
    // viršus
    g.beginPath(); g.moveTo(0, 0)
    for (let x = 0; x <= w; x += step) { const t = gt + (x - flyerX) / pps; g.lineTo(x, walls(t, difficulty).top * h) }
    g.lineTo(w, 0); g.closePath(); g.fill()
    // apačia
    g.beginPath(); g.moveTo(0, h)
    for (let x = 0; x <= w; x += step) { const t = gt + (x - flyerX) / pps; g.lineTo(x, walls(t, difficulty).bot * h) }
    g.lineTo(w, h); g.closePath(); g.fill()
    // sienų kraštų linija (ryškesnė)
    g.strokeStyle = 'rgba(196,181,253,0.7)'; g.lineWidth = 2
    g.beginPath(); for (let x = 0; x <= w; x += step) { const t = gt + (x - flyerX) / pps; const y = walls(t, difficulty).top * h; x === 0 ? g.moveTo(x, y) : g.lineTo(x, y) } g.stroke()
    g.beginPath(); for (let x = 0; x <= w; x += step) { const t = gt + (x - flyerX) / pps; const y = walls(t, difficulty).bot * h; x === 0 ? g.moveTo(x, y) : g.lineTo(x, y) } g.stroke()

    // flyeris (mirksi kai invuln)
    const blink = invulnRef.current > 0 && (Math.floor(gt * 12) % 2 === 0)
    if (!blink) {
      const fy = flyerY * h
      g.shadowColor = '#22d3ee'; g.shadowBlur = 16
      g.fillStyle = '#22d3ee'; g.beginPath(); g.arc(flyerX, fy, R * h, 0, Math.PI * 2); g.fill()
      g.shadowBlur = 0
    }

    // blyksnis susidūrus
    if (flashRef.current > 0) { g.fillStyle = `rgba(239,68,68,${flashRef.current})`; g.fillRect(0, 0, w, h) }

    // HUD
    g.fillStyle = '#e7ebf2'; g.font = '900 22px Outfit, system-ui, sans-serif'; g.textAlign = 'left'
    g.fillText(`${scoreRef.current}`, 16, 34)
    g.textAlign = 'right'; g.font = '900 19px Outfit, system-ui, sans-serif'; g.fillStyle = '#f87171'
    g.fillText('❤'.repeat(Math.max(0, livesRef.current)), w - 14, 32)

    // starto malonė — užuomina + centro linija, kad spėtum susigaudyti
    if (graceRef.current > 0) {
      g.globalAlpha = Math.min(1, graceRef.current / 0.6)
      g.fillStyle = '#f59e0b'; g.font = '900 26px Outfit, system-ui, sans-serif'; g.textAlign = 'center'
      g.fillText(holdingRef.current ? 'kyli ↑' : 'laikyk — kilk ↑', w / 2, h * 0.30)
      g.font = '800 13px Outfit, system-ui, sans-serif'; g.fillStyle = '#cbd5e1'
      g.fillText('paleisk — leidiesi ↓', w / 2, h * 0.30 + 24)
      g.globalAlpha = 1
    }

    if (!endedRef.current) rafRef.current = requestAnimationFrame(loop)
  }

  const setHold = (v: boolean) => () => { holdingRef.current = v }

  function nextSong() {
    trackIdxRef.current = (trackIdxRef.current + 1) % tracksRef.current.length
    setResults(null); void prepareTrack(trackIdxRef.current)
  }

  return (
    <ZaidimoLangas title="Skrisk pro bitą" backHref="/zaidimai/testai" maxWidth={560}>
      <style>{css}</style>

      {phase === 'loading' && <div className="rt-center"><div className="rt-spinner" /><p className="rt-note">{track ? `Ruošiam: ${track.artist} — ${track.title}` : 'Renkam dainą…'}</p></div>}
      {phase === 'error' && <div className="rt-center"><div className="rt-error">{err}</div><button className="rt-cta" onClick={() => void init()}>Bandyti dar</button></div>}

      {phase === 'ready' && track && (
        <div className="rt-ready">
          <div className="rt-badge">SKRYDŽIO ŽAIDIMAS</div>
          <h1 className="rt-h1">Skrisk pro bitą</h1>
          <div className="rt-demo">
            <span className="rt-demo-top" /><span className="rt-demo-bot" /><span className="rt-demo-fly" />
          </div>
          <p className="rt-lead">Tunelio sienos formuojamos iš <b>tikro dainos garsumo</b>. <b>Laikyk pirštą — kyli, paleisk — leidiesi.</b> Skrisk pro tarpą, neatsitrenk į sienas. Turi <b>3 gyvybes</b> — nuskrisk kuo toliau!</p>
          <div className="rt-song">🎵 {track.artist} — {track.title}</div>
          <button className="rt-cta big" onClick={start}>▶ Pradėti</button>
          <p className="rt-tiny">Įsijunk garsą 🔊 — sienos juda pagal dainą.</p>
        </div>
      )}

      {phase === 'play' && (
        <div className="rt-stage"
          onPointerDown={setHold(true)} onPointerUp={setHold(false)}
          onPointerLeave={setHold(false)} onPointerCancel={setHold(false)}>
          <canvas ref={canvasRef} className="rt-canvas" />
          <div className="rt-taphint">laikyk — kyli · paleisk — leidiesi</div>
        </div>
      )}

      {phase === 'results' && results && (
        <div className="rt-ready">
          <div className="rt-badge">REZULTATAS</div>
          <div className="rt-score">{results.score}</div>
          <p className="rt-lead">Geriausias tavo rezultatas: <b>{results.best}</b></p>
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

function lsGet(k: string): string | null { try { return window.localStorage.getItem(k) } catch { return null } }
function lsSet(k: string, v: string) { try { window.localStorage.setItem(k, v) } catch { /* ok */ } }

const css = `
.rt-center { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 80px 0; }
.rt-spinner { width: 40px; height: 40px; border-radius: 50%; border: 3px solid rgba(148,163,184,0.25); border-top-color: var(--accent-orange); animation: rtspin .8s linear infinite; }
@keyframes rtspin { to { transform: rotate(360deg); } }
.rt-note { font-size: 13px; color: var(--text-muted); }
.rt-error { font-size: 14px; color: var(--accent-red); background: rgba(248,113,113,0.1); border-radius: 10px; padding: 10px 14px; }
.rt-ready { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 22px 0; }
.rt-badge { font-size: 11px; font-weight: 900; letter-spacing: 0.1em; color: var(--accent-orange); }
.rt-h1 { font-size: 28px; font-weight: 900; letter-spacing: -0.02em; margin: 8px 0 14px; color: var(--text-primary); }
.rt-demo { position: relative; width: 160px; height: 100px; border-radius: 12px; overflow: hidden; background: #0f1424; border: 1px solid rgba(140,160,190,0.2); margin-bottom: 14px; }
.rt-demo-top, .rt-demo-bot { position: absolute; left: -20%; width: 140%; height: 34px; background: rgba(139,92,246,0.6); }
.rt-demo-top { top: 0; border-radius: 0 0 60% 40%; animation: rtwave 2.4s ease-in-out infinite; }
.rt-demo-bot { bottom: 0; border-radius: 40% 60% 0 0; animation: rtwave 2.4s ease-in-out infinite reverse; }
@keyframes rtwave { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-8px) } }
.rt-demo-fly { position: absolute; left: 30%; top: 45%; width: 14px; height: 14px; border-radius: 50%; background: #22d3ee; box-shadow: 0 0 12px #22d3ee; animation: rtfly 1.4s ease-in-out infinite; }
@keyframes rtfly { 0%,100% { top: 32% } 50% { top: 56% } }
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
.rt-stage { position: relative; width: 100%; height: 72vh; touch-action: none; user-select: none; cursor: pointer; }
.rt-canvas { width: 100%; height: 100%; display: block; }
.rt-taphint { position: absolute; bottom: 12px; left: 0; right: 0; text-align: center; font-size: 12px; color: rgba(231,235,242,0.7); pointer-events: none; }
`
