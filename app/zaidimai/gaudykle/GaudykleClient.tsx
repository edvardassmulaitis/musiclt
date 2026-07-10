'use client'

// app/zaidimai/gaudykle/GaudykleClient.tsx
//
// „Atlikėjų gaudyklė" — parenkamas STILIUS; gaudyk TIK to stiliaus atlikėjus,
// kitus praleisk. Krentantys atlikėjai su mini nuotrauka + vardu.
//   * pagavai tinkamą → taškai (serija augina daugiklį)
//   * pagavai ne to stiliaus → minus gyvybė (3 gyvybės)
//   * praleistas tinkamas → tik serija nutrūksta (nebaudžia)
//   * lygiai: greitis pamažu auga → kuo toliau, tuo sunkiau (ilgesnis žaidimas)
//   * groja foninė ištrauka (garsas nebūtinas). Canvas 60fps.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import ZaidimoLangas from '@/components/zaidimai/ZaidimoLangas'

type Phase = 'loading' | 'ready' | 'play' | 'results' | 'error'
type Artist = { name: string; image: string; target: boolean }
type Item = { x: number; y: number; vy: number; a: Artist }

export default function GaudykleClient() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [genre, setGenre] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [results, setResults] = useState<{ score: number; level: number; best: number; missed: number } | null>(null)

  const poolRef = useRef<Artist[]>([])
  const imgRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const musicRef = useRef<HTMLAudioElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef(0)
  const itemsRef = useRef<Item[]>([])
  const catcherXRef = useRef(0.5)
  const scoreRef = useRef(0)
  const comboRef = useRef(0)
  const livesRef = useRef(3)
  const levelRef = useRef(1)
  const caughtRef = useRef(0)
  const lastRef = useRef(0)
  const spawnAccRef = useRef(0)
  const elapsedRef = useRef(0)
  const spawnIdxRef = useRef(0)
  const floatsRef = useRef<{ x: number; y: number; text: string; color: string; at: number }[]>([])
  const levelFlashRef = useRef(-9)
  const missFlashRef = useRef(-9)
  const missedRef = useRef(0)

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
      poolRef.current = j.artists
      setGenre(j.genre || '')
      // Preload nuotraukų
      const m = new Map<string, HTMLImageElement>()
      for (const a of j.artists as Artist[]) {
        if (m.has(a.name)) continue
        const img = new Image()
        img.src = proxyImg(a.image, 96)
        m.set(a.name, img)
      }
      imgRef.current = m
      if (j.musicUrl) { const au = new Audio(j.musicUrl); au.loop = true; au.volume = 0.6; musicRef.current = au }
      setPhase('ready')
    } catch { setErr('Tinklo klaida'); setPhase('error') }
  }

  function start() {
    itemsRef.current = []; floatsRef.current = []
    scoreRef.current = 0; comboRef.current = 0; livesRef.current = 3; levelRef.current = 1; caughtRef.current = 0
    elapsedRef.current = 0; spawnAccRef.current = 0; lastRef.current = 0; spawnIdxRef.current = 0; levelFlashRef.current = -9
    missFlashRef.current = -9; missedRef.current = 0
    catcherXRef.current = 0.5
    try { if (musicRef.current) { musicRef.current.currentTime = 0; void musicRef.current.play().catch(() => {}) } } catch { /* nebūtina */ }
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
    setResults({ score: scoreRef.current, level: levelRef.current, best, missed: missedRef.current })
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

    // lygis pagal pagautų skaičių — greitis auga
    const level = 1 + Math.floor(caughtRef.current / 8)
    if (level !== levelRef.current) { levelRef.current = level; levelFlashRef.current = elapsedRef.current }
    const speedMul = 1 + (level - 1) * 0.16
    const spawnEvery = Math.max(0.55, 1.15 - (level - 1) * 0.06)

    spawnAccRef.current += dt
    if (spawnAccRef.current >= spawnEvery && poolRef.current.length) {
      spawnAccRef.current = 0
      // ~48% tinkamų
      const wantTarget = Math.random() < 0.48
      const pool = poolRef.current.filter(a => a.target === wantTarget)
      const a = (pool.length ? pool : poolRef.current)[(spawnIdxRef.current++ ) % (pool.length || poolRef.current.length)]
      itemsRef.current.push({ x: 0.09 + Math.random() * 0.82, y: -34, vy: (95 + Math.random() * 35) * speedMul, a })
    }

    const catcherY = h - 50
    const catcherW = Math.max(78, w * 0.26)
    const catcherX = catcherXRef.current * w
    const R = 24

    const keep: Item[] = []
    for (const it of itemsRef.current) {
      it.y += it.vy * dt * (h / 560)
      const caught = it.y > catcherY - 28 && it.y < catcherY + 30 && Math.abs(it.x * w - catcherX) < catcherW / 2 + R
      if (caught) {
        if (it.a.target) {
          comboRef.current++; caughtRef.current++
          const mult = 1 + Math.min(comboRef.current, 20) * 0.05
          const pts = Math.round(20 * mult)
          scoreRef.current += pts
          floatsRef.current.push({ x: it.x * w, y: catcherY - 12, text: `+${pts}`, color: '#22c55e', at: elapsedRef.current })
        } else {
          livesRef.current--; comboRef.current = 0
          floatsRef.current.push({ x: it.x * w, y: catcherY - 12, text: '✕ ne tas stilius', color: '#f87171', at: elapsedRef.current })
        }
        continue
      }
      if (it.y > h + 34) {
        if (it.a.target) {
          // praleidai teisingą — serija nutrūksta + aiškus ženklas
          comboRef.current = 0; missedRef.current++
          missFlashRef.current = elapsedRef.current
          const nm = it.a.name.length > 14 ? it.a.name.slice(0, 13) + '…' : it.a.name
          floatsRef.current.push({ x: Math.max(60, Math.min(w - 60, it.x * w)), y: h - 66, text: `praleidai: ${nm}`, color: '#f59e0b', at: elapsedRef.current })
        }
        continue
      }
      keep.push(it)
    }
    itemsRef.current = keep

    if (livesRef.current <= 0) { finish(); return }

    // ── piešimas ──
    g.clearRect(0, 0, w, h)

    for (const it of itemsRef.current) {
      const x = it.x * w, y = it.y
      const img = imgRef.current.get(it.a.name)
      // nuotrauka apskritime
      g.save()
      g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.closePath(); g.clip()
      if (img && img.complete && img.naturalWidth > 0) {
        g.drawImage(img, x - R, y - R, R * 2, R * 2)
      } else {
        g.fillStyle = '#243044'; g.fillRect(x - R, y - R, R * 2, R * 2)
        g.fillStyle = '#8ea0b8'; g.font = '900 18px Outfit, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
        g.fillText(it.a.name[0] || '?', x, y + 1); g.textBaseline = 'alphabetic'
      }
      g.restore()
      // žiedas
      g.lineWidth = 2.5; g.strokeStyle = 'rgba(231,235,242,0.5)'
      g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.stroke()
      // vardas
      g.fillStyle = '#cbd5e1'; g.font = '800 11px Outfit, system-ui, sans-serif'; g.textAlign = 'center'
      const nm = it.a.name.length > 16 ? it.a.name.slice(0, 15) + '…' : it.a.name
      g.fillText(nm, x, y + R + 13)
    }

    // krepšelis
    g.fillStyle = '#f97316'; roundRect(g, catcherX - catcherW / 2, catcherY, catcherW, 14, 7); g.fill()
    g.fillStyle = 'rgba(249,115,22,0.22)'; roundRect(g, catcherX - catcherW / 2 - 5, catcherY - 5, catcherW + 10, 24, 11); g.fill()

    // plaukiantys taškai
    const nf: typeof floatsRef.current = []
    for (const f of floatsRef.current) {
      const age = elapsedRef.current - f.at
      if (age > 0.9) continue
      g.globalAlpha = Math.max(0, 1 - age / 0.9)
      g.fillStyle = f.color; g.font = '900 15px Outfit, system-ui, sans-serif'; g.textAlign = 'center'
      g.fillText(f.text, f.x, f.y - age * 40); g.globalAlpha = 1
      nf.push(f)
    }
    floatsRef.current = nf

    // HUD
    g.fillStyle = '#e7ebf2'; g.font = '900 22px Outfit, system-ui, sans-serif'; g.textAlign = 'left'
    g.fillText(`${scoreRef.current}`, 16, 34)
    g.textAlign = 'right'; g.font = '900 19px Outfit, system-ui, sans-serif'; g.fillStyle = '#f87171'
    g.fillText('❤'.repeat(Math.max(0, livesRef.current)), w - 14, 32)
    g.fillStyle = 'var(--text-muted)'; g.fillStyle = '#8ea0b8'; g.font = '800 12px Outfit, system-ui, sans-serif'
    g.fillText(`Lygis ${level}`, w - 14, 52)

    // lygio blyksnis
    const lage = elapsedRef.current - levelFlashRef.current
    if (lage >= 0 && lage < 1.1 && level > 1) {
      g.globalAlpha = Math.max(0, 1 - lage / 1.1)
      g.fillStyle = '#f59e0b'; g.font = '900 30px Outfit, system-ui, sans-serif'; g.textAlign = 'center'
      g.fillText(`LYGIS ${level}`, w / 2, h * 0.28); g.globalAlpha = 1
    }

    // praleisto teisingo blyksnis — apatinis gintarinis kraštas
    const mage = elapsedRef.current - missFlashRef.current
    if (mage >= 0 && mage < 0.5) {
      g.globalAlpha = Math.max(0, (1 - mage / 0.5) * 0.6)
      const grad = g.createLinearGradient(0, h, 0, h - 80)
      grad.addColorStop(0, 'rgba(245,158,11,0.9)'); grad.addColorStop(1, 'rgba(245,158,11,0)')
      g.fillStyle = grad; g.fillRect(0, h - 80, w, 80); g.globalAlpha = 1
    }

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
          <div className="gd-target">🎯 Gaudyk tik: <b>{genre}</b></div>
          <p className="gd-lead"><b>Tempk krepšelį pirštu</b> ir gaudyk tik nurodyto stiliaus atlikėjus. Kitus <b>praleisk</b> — pagavai ne tą stilių, minus gyvybė. Turi <b>3 gyvybes</b>; greitis auga su lygiais.</p>
          <button className="gd-cta big" onClick={start}>▶ Pradėti</button>
          <p className="gd-tiny">🔊 Fone groja <b>{genre}</b> stiliaus daina (garsas nebūtinas).</p>
        </div>
      )}

      {phase === 'play' && (
        <div className="gd-stage" onPointerMove={movePointer} onPointerDown={movePointer}>
          <div className="gd-banner">🎯 Gaudyk: <b>{genre}</b></div>
          <canvas ref={canvasRef} className="gd-canvas" />
        </div>
      )}

      {phase === 'results' && results && (
        <div className="gd-ready">
          <div className="gd-badge">REZULTATAS</div>
          <div className="gd-score">{results.score}</div>
          <p className="gd-lead">Pasiektas lygis <b>{results.level}</b> · praleista teisingų <b>{results.missed}</b> · geriausias rezultatas <b>{results.best}</b></p>
          <div className="gd-actions">
            <button className="gd-cta" onClick={start}>Dar kartą</button>
            <button className="gd-cta ghost" onClick={() => void init()}>Kitas stilius →</button>
          </div>
          <Link href="/zaidimai/testai" className="gd-back">← Į testavimą</Link>
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
.gd-ready { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 28px 0; }
.gd-badge { font-size: 11px; font-weight: 900; letter-spacing: 0.1em; color: var(--accent-orange); }
.gd-h1 { font-size: 30px; font-weight: 900; letter-spacing: -0.02em; margin: 8px 0 10px; color: var(--text-primary); }
.gd-target { font-size: 15px; color: var(--text-secondary); background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.25); border-radius: 999px; padding: 8px 18px; margin-bottom: 14px; }
.gd-target b { color: var(--accent-orange); }
.gd-lead { font-size: 14px; color: var(--text-secondary); line-height: 1.6; max-width: 380px; margin: 0 0 20px; }
.gd-lead b { color: var(--text-primary); }
.gd-score { font-size: 60px; font-weight: 900; color: var(--accent-orange); line-height: 1; margin: 6px 0; }
.gd-cta { font-size: 16px; font-weight: 800; color: #fff; cursor: pointer; border: 0; border-radius: 999px; padding: 13px 28px; background: var(--accent-orange); }
.gd-cta.big { font-size: 19px; padding: 16px 46px; }
.gd-cta.ghost { background: var(--bg-surface); color: var(--text-primary); border: 1px solid rgba(140,160,190,0.3); }
.gd-actions { display: flex; gap: 12px; align-items: center; justify-content: center; flex-wrap: wrap; margin-bottom: 12px; }
.gd-tiny { font-size: 12px; color: var(--text-muted); margin: 12px 0 0; }
.gd-back { font-size: 14px; color: var(--text-secondary); text-decoration: none; }
.gd-stage { position: relative; width: 100%; height: 72vh; touch-action: none; user-select: none; }
.gd-canvas { width: 100%; height: 100%; display: block; }
.gd-banner { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); z-index: 3; font-size: 12px; font-weight: 800; color: var(--text-secondary); background: rgba(11,15,24,0.7); border: 1px solid rgba(140,160,190,0.2); border-radius: 999px; padding: 5px 14px; pointer-events: none; }
.gd-banner b { color: var(--accent-orange); }
`
