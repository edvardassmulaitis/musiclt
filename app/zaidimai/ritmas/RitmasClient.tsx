'use client'

// app/zaidimai/ritmas/RitmasClient.tsx
//
// „Pataikyk į taktą" — taikiniai atsiranda TIKSLIAI ant dainos bitų (onset'ai
// surandami iš anksto dekodavus ištrauką). Aplink taikinį traukiasi žiedas;
// bakstelėk tą akimirką, kai žiedas užsidaro — o tai ir yra bitas.
//   * Timing: Perfect / Gerai / Pro šalį; serija augina daugiklį.
//   * GARSAS: HTML5 <audio> (iOS Safari kelias), grojama kilpa.
//   * 3 gyvybės; 20 iš eilės → +1 gyvybė; kartojant dainą greitėja žiedas.
//   * Canvas 60fps; fonas pulsuoja pagal tikrą dainos garsumą.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import ZaidimoLangas from '@/components/zaidimai/ZaidimoLangas'

type Track = { id: number; title: string; artist: string; previewUrl: string }
type Phase = 'loading' | 'ready' | 'play' | 'results' | 'error'
type Target = { hitT: number; x: number; y: number; resolved: boolean; judge: '' | 'perfect' | 'good' | 'miss'; deadAt: number }

const MAX_LIVES = 5
const PERFECT = 0.075   // s — puikaus pataikymo langas
const GOOD = 0.155      // s — gero pataikymo langas
const MISS_AFTER = 0.19 // s po bito — praleista

// Garsumo envelope (0..1) fonui + onset'ai (bitai) žaidimui — viskas iš vieno dekodavimo.
function analyze(buf: AudioBuffer): { env: Float32Array; frameT: number; onsets: number[]; dur: number } {
  const ch = buf.getChannelData(0)
  const sr = buf.sampleRate
  const hop = Math.max(1, Math.round(sr * 0.011))
  const frameT = hop / sr
  const n = Math.floor(ch.length / hop)
  const e = new Float32Array(n)
  let mx = 1e-6
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let j = 0; j < hop; j++) { const v = ch[i * hop + j] || 0; s += v * v }
    e[i] = Math.sqrt(s / hop)
    if (e[i] > mx) mx = e[i]
  }
  // fono envelope — normalizuota + išlyginta
  const env = new Float32Array(n)
  const win = 4
  for (let i = 0; i < n; i++) {
    let sum = 0, cnt = 0
    for (let k = Math.max(0, i - win); k <= Math.min(n - 1, i + win); k++) { sum += e[k]; cnt++ }
    env[i] = Math.min(1, (sum / cnt) / mx)
  }
  // onset'ai — teigiamas energijos pokytis (flux) + adaptyvus slenkstis
  const flux = new Float32Array(n)
  for (let i = 1; i < n; i++) flux[i] = Math.max(0, e[i] - e[i - 1])
  const W = Math.round(0.22 / frameT)
  const minGap = Math.round(0.26 / frameT)
  const pick = (k: number): number[] => {
    const out: number[] = []
    let last = -1e9
    for (let i = 1; i < n - 1; i++) {
      let sum = 0, cnt = 0
      for (let m = Math.max(0, i - W); m <= Math.min(n - 1, i + W); m++) { sum += flux[m]; cnt++ }
      const thr = (sum / cnt) * k + 1e-4
      if (flux[i] > thr && flux[i] >= flux[i - 1] && flux[i] >= flux[i + 1] && (i - last) >= minGap) {
        out.push(i * frameT); last = i
      }
    }
    return out
  }
  let onsets = pick(1.7)
  if (onsets.length < 20) onsets = pick(1.3)
  if (onsets.length < 12) onsets = pick(1.0)
  if (onsets.length < 8) { onsets = []; for (let t = 0.5; t < buf.duration - 0.2; t += 0.5) onsets.push(t) }
  return { env, frameT, onsets, dur: buf.duration }
}

export default function RitmasClient() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [track, setTrack] = useState<Track | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [results, setResults] = useState<{ score: number; maxCombo: number; perfect: number; best: number } | null>(null)

  const tracksRef = useRef<Track[]>([])
  const trackIdxRef = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const envRef = useRef<Float32Array>(new Float32Array([0]))
  const frameTRef = useRef(0.011)
  const onsetsRef = useRef<number[]>([])
  const durRef = useRef(30)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef(0)

  const gtRef = useRef(0)
  const lastTsRef = useRef(0)
  const loopBaseRef = useRef(0)
  const spawnCursorRef = useRef(0)
  const diffRef = useRef(0)
  const targetsRef = useRef<Target[]>([])
  const lastPosRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 })

  const scoreRef = useRef(0)
  const comboRef = useRef(0)
  const maxComboRef = useRef(0)
  const perfectRef = useRef(0)
  const livesRef = useRef(3)
  const lifeFlashRef = useRef(-9)
  const floatsRef = useRef<{ x: number; y: number; text: string; color: string; at: number }[]>([])
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
      const { env, frameT, onsets, dur } = analyze(buf)
      envRef.current = env; frameTRef.current = frameT; onsetsRef.current = onsets; durRef.current = dur
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
    const f = tt / frameTRef.current
    const i = Math.floor(f)
    const a = env[i] || 0, b = env[(i + 1) % env.length] || 0
    return a + (b - a) * (f - i)
  }

  function nextPos(): { x: number; y: number } {
    // atsitiktinė vieta, bet ne per arti ankstesnės (verčia judinti pirštą)
    const prev = lastPosRef.current
    let x = 0.5, y = 0.5
    for (let tries = 0; tries < 8; tries++) {
      x = 0.15 + Math.random() * 0.70
      y = 0.20 + Math.random() * 0.56
      const dx = x - prev.x, dy = y - prev.y
      if (dx * dx + dy * dy > 0.05) break
    }
    lastPosRef.current = { x, y }
    return { x, y }
  }

  function start() {
    gtRef.current = 0; lastTsRef.current = 0; loopBaseRef.current = 0; spawnCursorRef.current = 0; diffRef.current = 0
    targetsRef.current = []; floatsRef.current = []; lastPosRef.current = { x: 0.5, y: 0.5 }
    scoreRef.current = 0; comboRef.current = 0; maxComboRef.current = 0; perfectRef.current = 0
    livesRef.current = 3; lifeFlashRef.current = -9; endedRef.current = false
    const a = audioRef.current!
    a.loop = true; a.currentTime = 0
    const p = a.play()
    if (p?.catch) p.catch(() => { setErr('Naršyklė neleido paleisti garso — bakstelk dar kartą'); setPhase('error') })
    setPhase('play')
  }

  function finish() {
    endedRef.current = true
    cancelAnimationFrame(rafRef.current)
    try { audioRef.current?.pause() } catch { /* ok */ }
    const best = Math.max(scoreRef.current, Number(lsGet('taktas_best') || 0))
    lsSet('taktas_best', String(best))
    setResults({ score: scoreRef.current, maxCombo: maxComboRef.current, perfect: perfectRef.current, best })
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

  function approachDur(): number { return Math.max(0.60, 1.05 - diffRef.current * 0.08) }

  function multiplier(): number {
    const c = comboRef.current
    if (c >= 35) return 5
    if (c >= 20) return 4
    if (c >= 10) return 3
    if (c >= 5) return 2
    return 1
  }

  function judgeTap(px: number, py: number, w: number, h: number) {
    const gt = gtRef.current
    let bestI = -1, bestDt = 1e9
    for (let i = 0; i < targetsRef.current.length; i++) {
      const t = targetsRef.current[i]
      if (t.resolved) continue
      const dt = Math.abs(gt - t.hitT)
      if (dt > GOOD) continue
      // ar bakstelėta ant taikinio (su atsarga)
      const dx = px - t.x * w, dy = py - t.y * h
      const R = 26
      if (dx * dx + dy * dy > (R * 1.8) * (R * 1.8)) continue
      if (dt < bestDt) { bestDt = dt; bestI = i }
    }
    if (bestI < 0) return
    const t = targetsRef.current[bestI]
    t.resolved = true; t.deadAt = gt + 0.35
    const mult = multiplier()
    if (bestDt <= PERFECT) {
      t.judge = 'perfect'; comboRef.current++; perfectRef.current++
      scoreRef.current += 100 * mult
      floatsRef.current.push({ x: t.x * w, y: t.y * h - 34, text: `PERFECT ×${mult}`, color: '#22c55e', at: gt })
    } else {
      t.judge = 'good'; comboRef.current++
      scoreRef.current += 50 * mult
      floatsRef.current.push({ x: t.x * w, y: t.y * h - 34, text: `Gerai ×${mult}`, color: '#22d3ee', at: gt })
    }
    if (comboRef.current > maxComboRef.current) maxComboRef.current = comboRef.current
    // 20 iš eilės → +1 gyvybė
    if (comboRef.current > 0 && comboRef.current % 20 === 0 && livesRef.current < MAX_LIVES) {
      livesRef.current++; lifeFlashRef.current = gt
      floatsRef.current.push({ x: t.x * w, y: t.y * h - 60, text: '+1 gyvybė ❤', color: '#22c55e', at: gt })
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    const c = canvasRef.current
    if (!c) return
    const rect = c.getBoundingClientRect()
    judgeTap(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height)
  }

  function loop(ts: number) {
    const c = canvasRef.current
    if (!c) { rafRef.current = requestAnimationFrame(loop); return }
    const g = c.getContext('2d')!
    const w = c.clientWidth, h = c.clientHeight
    if (!lastTsRef.current) lastTsRef.current = ts
    let dt = (ts - lastTsRef.current) / 1000
    lastTsRef.current = ts
    if (dt > 0.05) dt = 0.05
    gtRef.current += dt
    const gt = gtRef.current
    const approach = approachDur()

    // spawn'inam taikinius, kai artėja jų bitas
    const onsets = onsetsRef.current
    while (spawnCursorRef.current < onsets.length && gt >= loopBaseRef.current + onsets[spawnCursorRef.current] - approach) {
      const hitT = loopBaseRef.current + onsets[spawnCursorRef.current]
      const pos = nextPos()
      targetsRef.current.push({ hitT, x: pos.x, y: pos.y, resolved: false, judge: '', deadAt: 0 })
      spawnCursorRef.current++
    }
    if (spawnCursorRef.current >= onsets.length && onsets.length) {
      loopBaseRef.current += durRef.current
      spawnCursorRef.current = 0
      diffRef.current++    // kita daina greitesnė
    }

    // praleisti taikiniai (nespėta bakstelėti)
    for (const t of targetsRef.current) {
      if (!t.resolved && gt - t.hitT > MISS_AFTER) {
        t.resolved = true; t.judge = 'miss'; t.deadAt = gt + 0.35
        comboRef.current = 0; livesRef.current--
        floatsRef.current.push({ x: t.x * w, y: t.y * h - 34, text: 'Pro šalį', color: '#f87171', at: gt })
      }
    }
    targetsRef.current = targetsRef.current.filter(t => !(t.resolved && gt > t.deadAt))
    if (livesRef.current <= 0) { finish(); return }

    // ── piešimas ──
    const eNow = envAt(gt)
    g.clearRect(0, 0, w, h)
    g.fillStyle = `rgb(${10 + eNow * 20},${14 + eNow * 16},${26 + eNow * 26})`
    g.fillRect(0, 0, w, h)
    // pulsuojantis švytėjimas centre pagal garsumą
    const glow = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.6)
    glow.addColorStop(0, `rgba(236,72,153,${0.05 + eNow * 0.13})`); glow.addColorStop(1, 'rgba(236,72,153,0)')
    g.fillStyle = glow; g.fillRect(0, 0, w, h)

    const R = 26
    for (const t of targetsRef.current) {
      const cx = t.x * w, cy = t.y * h
      const tth = t.hitT - gt
      if (!t.resolved) {
        // artėjantis žiedas: nuo didelio iki taikinio spindulio ties bitu
        const prog = Math.max(0, Math.min(1, tth / approach))   // 1 = ką tik atsirado, 0 = bitas
        const ringR = R + prog * R * 3.2
        const near = tth < PERFECT * 1.4 && tth > -PERFECT * 1.4
        g.strokeStyle = near ? 'rgba(34,197,94,0.95)' : 'rgba(34,211,238,0.85)'
        g.lineWidth = near ? 4 : 3
        g.beginPath(); g.arc(cx, cy, ringR, 0, Math.PI * 2); g.stroke()
        // taikinys
        g.shadowColor = 'rgba(236,72,153,0.8)'; g.shadowBlur = 16
        g.fillStyle = '#ec4899'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill()
        g.shadowBlur = 0
        g.fillStyle = '#fff'; g.font = '900 20px Outfit, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
        g.fillText('♪', cx, cy + 1); g.textBaseline = 'alphabetic'
      } else if (t.judge === 'perfect' || t.judge === 'good') {
        // trumpas „sprogimo" žiedas pataikius
        const age = gt - (t.deadAt - 0.35)
        const rr = R + age * 120
        g.globalAlpha = Math.max(0, 1 - age / 0.35)
        g.strokeStyle = t.judge === 'perfect' ? 'rgba(34,197,94,0.9)' : 'rgba(34,211,238,0.9)'
        g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1
      }
    }

    // plaukiantys užrašai
    const nf: typeof floatsRef.current = []
    for (const f of floatsRef.current) {
      const age = gt - f.at
      if (age > 0.8) continue
      g.globalAlpha = Math.max(0, 1 - age / 0.8)
      g.fillStyle = f.color; g.font = '900 16px Outfit, system-ui, sans-serif'; g.textAlign = 'center'
      g.fillText(f.text, f.x, f.y - age * 34); g.globalAlpha = 1
      nf.push(f)
    }
    floatsRef.current = nf

    // HUD
    g.fillStyle = '#e7ebf2'; g.font = '900 22px Outfit, system-ui, sans-serif'; g.textAlign = 'left'
    g.fillText(`${scoreRef.current}`, 16, 34)
    g.fillStyle = '#f59e0b'; g.font = '900 14px Outfit, system-ui, sans-serif'
    g.fillText(`×${multiplier()}  serija ${comboRef.current}`, 16, 54)
    g.textAlign = 'right'; g.font = '900 19px Outfit, system-ui, sans-serif'; g.fillStyle = '#f87171'
    g.fillText('❤'.repeat(Math.max(0, livesRef.current)), w - 14, 32)

    // premijinės gyvybės blyksnis
    const gage = gt - lifeFlashRef.current
    if (gage >= 0 && gage < 1) {
      g.globalAlpha = Math.max(0, (1 - gage) * 0.5)
      const gr = g.createLinearGradient(0, 0, 0, 80)
      gr.addColorStop(0, 'rgba(34,197,94,0.9)'); gr.addColorStop(1, 'rgba(34,197,94,0)')
      g.fillStyle = gr; g.fillRect(0, 0, w, 80); g.globalAlpha = 1
    }

    if (!endedRef.current) rafRef.current = requestAnimationFrame(loop)
  }

  function nextSong() {
    trackIdxRef.current = (trackIdxRef.current + 1) % tracksRef.current.length
    setResults(null); void prepareTrack(trackIdxRef.current)
  }

  return (
    <ZaidimoLangas title="Pataikyk į taktą" backHref="/zaidimai/testai" maxWidth={560}>
      <style>{css}</style>

      {phase === 'loading' && <div className="tk-center"><div className="tk-spinner" /><p className="tk-note">{track ? `Ruošiam: ${track.artist} — ${track.title}` : 'Renkam dainą…'}</p></div>}
      {phase === 'error' && <div className="tk-center"><div className="tk-error">{err}</div><button className="tk-cta" onClick={() => void init()}>Bandyti dar</button></div>}

      {phase === 'ready' && track && (
        <div className="tk-ready">
          <div className="tk-badge">MUZIKOS ŽAIDIMAS</div>
          <h1 className="tk-h1">Pataikyk į taktą</h1>
          <div className="tk-demo"><span className="tk-demo-ring" /><span className="tk-demo-dot">♪</span></div>
          <p className="tk-lead">Taikiniai atsiranda <b>tiksliai ant dainos bitų</b>. Aplink kiekvieną <b>traukiasi žiedas</b> — bakstelėk taikinį tą akimirką, kai žiedas jį pasiekia. Kuo tiksliau, tuo daugiau: <b>Perfect</b> arba <b>Gerai</b>. Serija augina daugiklį; <b>20 iš eilės → +1 gyvybė</b>.</p>
          <div className="tk-song">🎵 {track.artist} — {track.title}</div>
          <button className="tk-cta big" onClick={start}>▶ Pradėti</button>
          <p className="tk-tiny">🔊 Įsijunk garsą — taikiniai eina pagal dainą.</p>
        </div>
      )}

      {phase === 'play' && (
        <div className="tk-stage" onPointerDown={onPointerDown}>
          <canvas ref={canvasRef} className="tk-canvas" />
          <div className="tk-taphint">bakstelėk taikinį, kai žiedas užsidaro</div>
        </div>
      )}

      {phase === 'results' && results && (
        <div className="tk-ready">
          <div className="tk-badge">REZULTATAS</div>
          <div className="tk-score">{results.score}</div>
          <p className="tk-lead">Ilgiausia serija <b>{results.maxCombo}</b> · tiksliai (Perfect) <b>{results.perfect}</b> · geriausias <b>{results.best}</b></p>
          {track && <div className="tk-song">🎵 {track.artist} — {track.title}</div>}
          <div className="tk-actions">
            <button className="tk-cta" onClick={() => setPhase('ready')}>Dar kartą</button>
            <button className="tk-cta ghost" onClick={nextSong}>Kita daina →</button>
          </div>
          <Link href="/zaidimai/testai" className="tk-back">← Į testavimą</Link>
        </div>
      )}
    </ZaidimoLangas>
  )
}

function lsGet(k: string): string | null { try { return window.localStorage.getItem(k) } catch { return null } }
function lsSet(k: string, v: string) { try { window.localStorage.setItem(k, v) } catch { /* ok */ } }

const css = `
.tk-center { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 80px 0; }
.tk-spinner { width: 40px; height: 40px; border-radius: 50%; border: 3px solid rgba(148,163,184,0.25); border-top-color: var(--accent-orange); animation: tkspin .8s linear infinite; }
@keyframes tkspin { to { transform: rotate(360deg); } }
.tk-note { font-size: 13px; color: var(--text-muted); }
.tk-error { font-size: 14px; color: var(--accent-red); background: rgba(248,113,113,0.1); border-radius: 10px; padding: 10px 14px; }
.tk-ready { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 22px 0; }
.tk-badge { font-size: 11px; font-weight: 900; letter-spacing: 0.1em; color: var(--accent-orange); }
.tk-h1 { font-size: 28px; font-weight: 900; letter-spacing: -0.02em; margin: 8px 0 14px; color: var(--text-primary); }
.tk-demo { position: relative; width: 110px; height: 110px; display: flex; align-items: center; justify-content: center; margin-bottom: 14px; }
.tk-demo-ring { position: absolute; width: 44px; height: 44px; border-radius: 50%; border: 3px solid #22d3ee; animation: tkring 1.4s ease-in-out infinite; }
@keyframes tkring { 0% { width: 104px; height: 104px; opacity: .2 } 70% { width: 50px; height: 50px; opacity: 1 } 72% { border-color: #22c55e } 100% { width: 104px; height: 104px; opacity: .2; border-color: #22d3ee } }
.tk-demo-dot { width: 44px; height: 44px; border-radius: 50%; background: #ec4899; box-shadow: 0 0 18px rgba(236,72,153,.7); display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 900; font-size: 20px; }
.tk-lead { font-size: 14px; color: var(--text-secondary); line-height: 1.6; max-width: 380px; margin: 0 0 16px; }
.tk-lead b { color: var(--text-primary); }
.tk-song { font-size: 14px; font-weight: 800; color: var(--text-primary); background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.22); border-radius: 999px; padding: 9px 18px; margin-bottom: 16px; }
.tk-score { font-size: 60px; font-weight: 900; color: var(--accent-orange); line-height: 1; margin: 6px 0; }
.tk-cta { font-size: 16px; font-weight: 800; color: #fff; cursor: pointer; border: 0; border-radius: 999px; padding: 13px 28px; background: var(--accent-orange); }
.tk-cta.big { font-size: 19px; padding: 16px 46px; }
.tk-cta.ghost { background: var(--bg-surface); color: var(--text-primary); border: 1px solid rgba(140,160,190,0.3); }
.tk-actions { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; margin-bottom: 14px; }
.tk-tiny { font-size: 12px; color: var(--text-muted); margin: 12px 0 0; }
.tk-back { font-size: 14px; color: var(--text-secondary); text-decoration: none; }
.tk-stage { position: relative; width: 100%; height: 72vh; touch-action: none; user-select: none; cursor: pointer; }
.tk-canvas { width: 100%; height: 100%; display: block; }
.tk-taphint { position: absolute; bottom: 12px; left: 0; right: 0; text-align: center; font-size: 12px; color: rgba(231,235,242,0.7); pointer-events: none; }
`
