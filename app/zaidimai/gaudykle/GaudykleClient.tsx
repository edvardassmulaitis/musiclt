'use client'

// app/zaidimai/gaudykle/GaudykleClient.tsx
//
// „Natų gaudyklė" — paprastas vizualus žaidimas BE GARSO.
//   * krenta natos; tempk krepšelį pirštu (arba pele) ir gaudyk jas
//   * praleista nata / pagauta „bomba" — atimama gyvybė (3 gyvybės)
//   * greitis auga; canvas 60fps, viskas imperatyviai (sklandu).

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import ZaidimoLangas from '@/components/zaidimai/ZaidimoLangas'

type Phase = 'ready' | 'play' | 'results'
type Item = { x: number; y: number; vy: number; bad: boolean; ch: string; r: number }

const GOOD_CH = ['♪', '♫', '♩', '♬']

export default function GaudykleClient() {
  const [phase, setPhase] = useState<Phase>('ready')
  const [results, setResults] = useState<{ score: number; best: number } | null>(null)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef(0)
  const itemsRef = useRef<Item[]>([])
  const catcherXRef = useRef(0.5)      // 0..1 (santykinis)
  const scoreRef = useRef(0)
  const comboRef = useRef(0)
  const livesRef = useRef(3)
  const lastRef = useRef(0)
  const spawnAccRef = useRef(0)
  const elapsedRef = useRef(0)
  const flashRef = useRef<{ text: string; color: string; at: number }>({ text: '', color: '', at: -9 })

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  function start() {
    itemsRef.current = []
    scoreRef.current = 0; comboRef.current = 0; livesRef.current = 3
    elapsedRef.current = 0; spawnAccRef.current = 0; lastRef.current = 0
    catcherXRef.current = 0.5
    flashRef.current = { text: '', color: '', at: -9 }
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
    c.width = Math.round(rect.width * dpr)
    c.height = Math.round(rect.height * dpr)
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
    const best = Math.max(scoreRef.current, Number(localStorageGet('gaudykle_best') || 0))
    localStorageSet('gaudykle_best', String(best))
    setResults({ score: scoreRef.current, best })
    setPhase('results')
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

    // sunkėjimas laikui bėgant
    const diff = 1 + elapsedRef.current / 40
    const spawnEvery = Math.max(0.42, 0.95 - elapsedRef.current * 0.012)
    spawnAccRef.current += dt
    if (spawnAccRef.current >= spawnEvery) {
      spawnAccRef.current = 0
      const bad = Math.random() < 0.16
      itemsRef.current.push({
        x: 0.08 + Math.random() * 0.84,
        y: -30,
        vy: (150 + Math.random() * 70) * diff,
        bad,
        ch: bad ? '✕' : GOOD_CH[(Math.random() * GOOD_CH.length) | 0],
        r: 20,
      })
    }

    const catcherY = h - 46
    const catcherW = Math.max(64, w * 0.22)
    const catcherX = catcherXRef.current * w

    // judinam + tikrinam
    const keep: Item[] = []
    for (const it of itemsRef.current) {
      it.y += it.vy * dt * (h / 520)
      const caught = it.y > catcherY - 22 && it.y < catcherY + 26 && Math.abs(it.x * w - catcherX) < catcherW / 2 + 6
      if (caught) {
        if (it.bad) { livesRef.current--; comboRef.current = 0; flashRef.current = { text: 'BOMBA!', color: '#f87171', at: elapsedRef.current } }
        else { comboRef.current++; const add = 10 + Math.min(comboRef.current, 20); scoreRef.current += add; if (comboRef.current >= 3 && comboRef.current % 5 === 0) flashRef.current = { text: `serija ×${comboRef.current}`, color: '#22c55e', at: elapsedRef.current } }
        continue
      }
      if (it.y > h + 30) {
        if (!it.bad) { livesRef.current--; comboRef.current = 0; flashRef.current = { text: 'PRALEIDAI', color: '#f87171', at: elapsedRef.current } }
        continue
      }
      keep.push(it)
    }
    itemsRef.current = keep

    if (livesRef.current <= 0) { finish(); return }

    // ── piešimas ──
    g.clearRect(0, 0, w, h)

    // natos
    for (const it of itemsRef.current) {
      const x = it.x * w
      g.beginPath(); g.arc(x, it.y, it.r, 0, Math.PI * 2)
      g.fillStyle = it.bad ? 'rgba(239,68,68,0.18)' : 'rgba(249,115,22,0.16)'
      g.fill()
      g.lineWidth = 2; g.strokeStyle = it.bad ? '#ef4444' : '#f97316'; g.stroke()
      g.fillStyle = it.bad ? '#fca5a5' : '#fdba74'
      g.font = '900 20px Outfit, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
      g.fillText(it.ch, x, it.y + 1)
    }
    g.textBaseline = 'alphabetic'

    // krepšelis
    g.fillStyle = '#f97316'
    roundRect(g, catcherX - catcherW / 2, catcherY, catcherW, 14, 7); g.fill()
    g.fillStyle = 'rgba(249,115,22,0.25)'
    roundRect(g, catcherX - catcherW / 2 - 4, catcherY - 4, catcherW + 8, 22, 10); g.fill()

    // HUD
    g.fillStyle = '#e7ebf2'; g.font = '900 22px Outfit, system-ui, sans-serif'; g.textAlign = 'left'; g.fillText(`${scoreRef.current}`, 16, 34)
    g.textAlign = 'right'; g.font = '900 20px Outfit, system-ui, sans-serif'
    g.fillText('❤'.repeat(Math.max(0, livesRef.current)), w - 14, 34)

    // flash
    const fb = flashRef.current, age = elapsedRef.current - fb.at
    if (fb.text && age >= 0 && age < 0.8) {
      g.globalAlpha = Math.max(0, 1 - age / 0.8)
      g.fillStyle = fb.color; g.font = '900 24px Outfit, system-ui, sans-serif'; g.textAlign = 'center'
      g.fillText(fb.text, w / 2, h * 0.3)
      g.globalAlpha = 1
    }

    rafRef.current = requestAnimationFrame(loop)
  }

  return (
    <ZaidimoLangas title="Natų gaudyklė" backHref="/zaidimai/testai" maxWidth={560}>
      <style>{css}</style>

      {phase === 'ready' && (
        <div className="gd-ready">
          <div className="gd-badge">GREITAS ŽAIDIMAS</div>
          <h1 className="gd-h1">Natų gaudyklė</h1>
          <p className="gd-lead">Krenta natos — <b>tempk krepšelį pirštu</b> ir jas gaudyk. Venk raudonų ✕ (bombų). Praleista nata ar pagauta bomba — minus gyvybė. Turi <b>3 gyvybes</b>.</p>
          <button className="gd-cta big" onClick={start}>▶ Pradėti</button>
          <p className="gd-tiny">Be garso — veikia visur.</p>
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
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}
function localStorageGet(k: string): string | null { try { return window.localStorage.getItem(k) } catch { return null } }
function localStorageSet(k: string, v: string) { try { window.localStorage.setItem(k, v) } catch { /* ok */ } }

const css = `
.gd-ready { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 30px 0; }
.gd-badge { font-size: 11px; font-weight: 900; letter-spacing: 0.1em; color: var(--accent-orange); }
.gd-h1 { font-size: 30px; font-weight: 900; letter-spacing: -0.02em; margin: 8px 0 12px; color: var(--text-primary); }
.gd-lead { font-size: 14px; color: var(--text-secondary); line-height: 1.55; max-width: 360px; margin: 0 0 20px; }
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
