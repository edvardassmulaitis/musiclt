'use client'

// app/zaidimai/gaudykle/GaudykleClient.tsx
//
// „Atlikėjų gaudyklė" — krenta atlikėjų vardai; tempk krepšelį ir gaudyk.
//   * kuo populiaresnis atlikėjas, tuo daugiau taškų (žvaigždė ⭐ = daugiausiai)
//   * 45 s — surink kuo daugiau; praleisti nebaudžia, bet serija nutrūksta
//   * groja foninė ištrauka (garsas NEBŪTINAS — veikia ir be jo)
//   * canvas 60fps, imperatyvu.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import ZaidimoLangas from '@/components/zaidimai/ZaidimoLangas'

type Phase = 'loading' | 'ready' | 'play' | 'results' | 'error'
type Artist = { name: string; tier: number }
type Item = { x: number; y: number; vy: number; name: string; tier: number; w: number }

const GAME_SEC = 45
const TIER_PTS: Record<number, number> = { 1: 10, 2: 20, 3: 30 }
const TIER_COL: Record<number, string> = { 1: '#8ea0b8', 2: '#60a5fa', 3: '#f59e0b' }

export default function GaudykleClient() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [err, setErr] = useState<string | null>(null)
  const [results, setResults] = useState<{ score: number; best: number } | null>(null)

  const artistsRef = useRef<Artist[]>([])
  const musicRef = useRef<HTMLAudioElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef(0)
  const itemsRef = useRef<Item[]>([])
  const catcherXRef = useRef(0.5)
  const scoreRef = useRef(0)
  const comboRef = useRef(0)
  const livesLeftRef = useRef(GAME_SEC)
  const lastRef = useRef(0)
  const spawnAccRef = useRef(0)
  const elapsedRef = useRef(0)
  const spawnIdxRef = useRef(0)
  const floatsRef = useRef<{ x: number; y: number; text: string; color: string; at: number }[]>([])

  useEffect(() => {
    void init()
    return () => { cancelAnimationFrame(rafRef.current); try { musicRef.current?.pause() } catch { /* ok */ } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function init() {
    setPhase('loading'); setErr(null)
    try {
      const res = await fetch('/api/zaidimai/gaudykle')
      const j = await res.json()
      if (!res.ok || !j.artists?.length) { setErr(j.error || 'Nepavyko įkelti'); setPhase('error'); return }
      artistsRef.current = j.artists
      if (j.musicUrl) { const a = new Audio(j.musicUrl); a.loop = true; a.volume = 0.6; musicRef.current = a }
      setPhase('ready')
    } catch { setErr('Tinklo klaida'); setPhase('error') }
  }

  function start() {
    itemsRef.current = []; floatsRef.current = []
    scoreRef.current = 0; comboRef.current = 0
    elapsedRef.current = 0; spawnAccRef.current = 0; lastRef.current = 0; spawnIdxRef.current = 0
    catcherXRef.current = 0.5
    try { if (musicRef.current) { musicRef.current.currentTime = 0; void musicRef.current.play().catch(() => {}) } } catch { /* garsas nebūtinas */ }
    setPhase('play')
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

  function movePointer(e: React.PointerEvent) {
    const c = canvasRef.current
    if (!c) return
    const rect = c.getBoundingClientRect()
    catcherXRef.current = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  }

  function finish() {
    cancelAnimationFrame(rafRef.current)
    try { musicRef.current?.pause() } catch { /* ok */ }
    const best = Math.max(scoreRef.current, Number(lsGet('gaudykle_best') || 0))
    lsSet('gaudykle_best', String(best))
    setResults({ score: scoreRef.current, best })
    setPhase('results')
  }

  function measure(g: CanvasRenderingContext2D, name: string): number {
    g.font = '800 14px Outfit, system-ui, sans-serif'
    return Math.max(64, g.measureText(name).width + 26)
  }

  function loop(ts: number) {
    const c = canvasRef.current
    if (!c) { rafRef.current = requestAnimationFrame(loop); return }
    const g = c.getContext('2d')!
    const w = c.clientWidth, h = c.clientHeight
    if (!lastRef.current) lastRef.current = ts
    let dt = (ts - lastRef.current) / 1000
    lastRef.current = ts
    if (dt > 0.05) dt = 0.05
    elapsedRef.current += dt
    const left = Math.max(0, GAME_SEC - elapsedRef.current)
    if (left <= 0) { finish(); return }

    // spawn
    const spawnEvery = Math.max(0.5, 0.95 - elapsedRef.current * 0.008)
    spawnAccRef.current += dt
    if (spawnAccRef.current >= spawnEvery && artistsRef.current.length) {
      spawnAccRef.current = 0
      const a = artistsRef.current[spawnIdxRef.current % artistsRef.current.length]
      spawnIdxRef.current++
      const wItem = measure(g, a.name)
      itemsRef.current.push({
        x: 0.06 + Math.random() * 0.88,
        y: -24,
        vy: 120 + Math.random() * 60 + elapsedRef.current * 2,
        name: a.name, tier: a.tier, w: wItem,
      })
    }

    const catcherY = h - 48
    const catcherW = Math.max(74, w * 0.24)
    const catcherX = catcherXRef.current * w

    const keep: Item[] = []
    for (const it of itemsRef.current) {
      it.y += it.vy * dt * (h / 560)
      const caught = it.y > catcherY - 24 && it.y < catcherY + 28 && Math.abs(it.x * w - catcherX) < catcherW / 2 + it.w / 2
      if (caught) {
        comboRef.current++
        const mult = 1 + Math.min(comboRef.current, 20) * 0.05
        const pts = Math.round(TIER_PTS[it.tier] * mult)
        scoreRef.current += pts
        floatsRef.current.push({ x: it.x * w, y: catcherY - 10, text: `+${pts}${it.tier === 3 ? ' ⭐' : ''}`, color: TIER_COL[it.tier], at: elapsedRef.current })
        continue
      }
      if (it.y > h + 26) { comboRef.current = 0; continue }
      keep.push(it)
    }
    itemsRef.current = keep

    // ── piešimas ──
    g.clearRect(0, 0, w, h)

    for (const it of itemsRef.current) {
      const x = it.x * w
      const col = TIER_COL[it.tier]
      g.fillStyle = it.tier === 3 ? 'rgba(245,158,11,0.16)' : it.tier === 2 ? 'rgba(96,165,250,0.14)' : 'rgba(148,163,184,0.12)'
      roundRect(g, x - it.w / 2, it.y - 15, it.w, 30, 15); g.fill()
      g.lineWidth = 1.5; g.strokeStyle = col; g.stroke()
      g.fillStyle = it.tier === 3 ? '#fde68a' : it.tier === 2 ? '#bfdbfe' : '#cbd5e1'
      g.font = '800 14px Outfit, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
      g.fillText((it.tier === 3 ? '⭐ ' : '') + it.name, x, it.y + 1)
    }
    g.textBaseline = 'alphabetic'

    // krepšelis
    g.fillStyle = '#f97316'; roundRect(g, catcherX - catcherW / 2, catcherY, catcherW, 14, 7); g.fill()
    g.fillStyle = 'rgba(249,115,22,0.22)'; roundRect(g, catcherX - catcherW / 2 - 4, catcherY - 4, catcherW + 8, 22, 10); g.fill()

    // plaukiantys taškai
    const nf: typeof floatsRef.current = []
    for (const f of floatsRef.current) {
      const age = elapsedRef.current - f.at
      if (age > 0.9) continue
      g.globalAlpha = Math.max(0, 1 - age / 0.9)
      g.fillStyle = f.color; g.font = '900 15px Outfit, system-ui, sans-serif'; g.textAlign = 'center'
      g.fillText(f.text, f.x, f.y - age * 40)
      g.globalAlpha = 1
      nf.push(f)
    }
    floatsRef.current = nf

    // HUD: taškai + laikas + combo
    g.fillStyle = '#e7ebf2'; g.font = '900 22px Outfit, system-ui, sans-serif'; g.textAlign = 'left'
    g.fillText(`${scoreRef.current}`, 16, 34)
    g.textAlign = 'right'; g.font = '900 20px Outfit, system-ui, sans-serif'
    g.fillStyle = left < 10 ? '#f87171' : '#e7ebf2'
    g.fillText(`${Math.ceil(left)}s`, w - 14, 34)
    if (comboRef.current > 2) { g.fillStyle = '#f59e0b'; g.font = '900 14px Outfit, system-ui, sans-serif'; g.fillText(`serija ×${comboRef.current}`, w - 14, 54) }

    rafRef.current = requestAnimationFrame(loop)
  }

  return (
    <ZaidimoLangas title="Atlikėjų gaudyklė" backHref="/zaidimai/testai" maxWidth={560}>
      <style>{css}</style>

      {phase === 'loading' && <div className="gd-center"><div className="gd-spinner" /></div>}
      {phase === 'error' && <div className="gd-center"><div className="gd-error">{err}</div><button className="gd-cta" onClick={() => void init()}>Bandyti dar</button></div>}

      {phase === 'ready' && (
        <div className="gd-ready">
          <div className="gd-badge">GREITAS ŽAIDIMAS</div>
          <h1 className="gd-h1">Atlikėjų gaudyklė</h1>
          <p className="gd-lead"><b>Tempk krepšelį pirštu</b> ir gaudyk krentančius atlikėjus. Kuo populiaresnis — tuo daugiau taškų: <b style={{ color: '#f59e0b' }}>⭐ žvaigždė 30</b>, žinomas 20, kitas 10. Turi <b>45 sekundes</b> — serija augina taškus!</p>
          <button className="gd-cta big" onClick={start}>▶ Pradėti</button>
          <p className="gd-tiny">🔊 Groja foninė muzika (garsas nebūtinas — veikia ir be jo).</p>
        </div>
      )}

      {phase === 'play' && (
        <div className="gd-stage" onPointerMove={movePointer} onPointerDown={movePointer}>
          <canvas ref={canvasRef} className="gd-canvas" />
          <div className="gd-taphint">tempk pirštą kairėn / dešinėn</div>
        </div>
      )}

      {phase === 'results' && results && (
        <div className="gd-ready">
          <div className="gd-badge">REZULTATAS</div>
          <div className="gd-score">{results.score}</div>
          <p className="gd-lead">Geriausias tavo rezultatas: <b>{results.best}</b></p>
          <div className="gd-actions">
            <button className="gd-cta" onClick={start}>Dar kartą</button>
            <Link href="/zaidimai/testai" className="gd-back">← Į testavimą</Link>
          </div>
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
function lsGet(k: string): string | null { try { return window.localStorage.getItem(k) } catch { return null } }
function lsSet(k: string, v: string) { try { window.localStorage.setItem(k, v) } catch { /* ok */ } }

const css = `
.gd-center { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 80px 0; }
.gd-spinner { width: 40px; height: 40px; border-radius: 50%; border: 3px solid rgba(148,163,184,0.25); border-top-color: var(--accent-orange); animation: gdspin .8s linear infinite; }
@keyframes gdspin { to { transform: rotate(360deg); } }
.gd-error { font-size: 14px; color: var(--accent-red); background: rgba(248,113,113,0.1); border-radius: 10px; padding: 10px 14px; }
.gd-ready { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 30px 0; }
.gd-badge { font-size: 11px; font-weight: 900; letter-spacing: 0.1em; color: var(--accent-orange); }
.gd-h1 { font-size: 30px; font-weight: 900; letter-spacing: -0.02em; margin: 8px 0 12px; color: var(--text-primary); }
.gd-lead { font-size: 14px; color: var(--text-secondary); line-height: 1.6; max-width: 380px; margin: 0 0 20px; }
.gd-lead b { color: var(--text-primary); }
.gd-score { font-size: 60px; font-weight: 900; color: var(--accent-orange); line-height: 1; margin: 6px 0; }
.gd-cta { font-size: 16px; font-weight: 800; color: #fff; cursor: pointer; border: 0; border-radius: 999px; padding: 13px 28px; background: var(--accent-orange); }
.gd-cta.big { font-size: 19px; padding: 16px 46px; }
.gd-actions { display: flex; gap: 14px; align-items: center; justify-content: center; }
.gd-tiny { font-size: 12px; color: var(--text-muted); margin: 12px 0 0; }
.gd-back { font-size: 14px; color: var(--text-secondary); text-decoration: none; }
.gd-stage { position: relative; width: 100%; height: 70vh; touch-action: none; user-select: none; }
.gd-canvas { width: 100%; height: 100%; display: block; }
.gd-taphint { position: absolute; bottom: 12px; left: 0; right: 0; text-align: center; font-size: 12px; color: var(--text-muted); pointer-events: none; }
`
