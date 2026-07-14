'use client'
// components/gilyn/GilynMap.tsx
//
// Gilyn v3 muzikos žemėlapis — du režimai.
//
// ŽEMĖLAPIS  Lygis 0: 15 pasaulių. Jie NEBEGULI ratu — vietos paskaičiuotos iš
//            auditorijų sankirtos (Jaccard): Metalas prigludęs prie Roko, Popsas
//            šalia Soul, Klasika nuošaliai. Vieta = giminystė, ne dekoracija.
//            Lygis 1: to pasaulio teritorijos per visą lauką; priartinus iš rūko
//            iškyla vis smulkesnės (LOD).
//
//            DYDIS = ŽINOMŲ atlikėjų skaičius (AI fame ≥3), ne katalogo dydis.
//            Kitaip Eurovizijos pop (daug vienadienių) atrodytų svarbesnis už
//            Alternatyvą 90s.
//
// LAIKAS     Pasauliai × dešimtmečiai kaip tinklelis (kiekvienas langelis —
//            juostelė su tavo būsenų proporcijomis). Bakstelėjus langelį —
//            to pasaulio to dešimtmečio teritorijos Gantt'u, kiekviena savo
//            eilutėje. Jokio persiklojimo.

import { useMemo, useRef, useState, useCallback, useEffect } from 'react'

export type MapCell = {
  id: number | string
  name: string
  size?: number
  known?: number
  x?: number | null
  y?: number | null
  eraFrom?: number | null
  eraTo?: number | null
  era?: string | null
  region?: string | null
  essence?: string | null
  beacons: number
  visited: number
  heard: number
  saved: number
  artists: { id: number; n: string; k: 'saved' | 'visited' | 'beacon'; img?: string | null }[]
  top?: { id: number; n: string; img?: string | null }[]
  near?: { id: string; n: string }[]
}
export type MapRegionC = {
  genreId: number
  worldId?: string
  name: string
  color?: string
  substyles: MapCell[]
}
type Cell = MapCell & { world: string; wid: string; wcolor: string }

const C = { liked: '#e0632c', heard: '#3b86d8', fog: '#59636f' }
const state = (c: MapCell): 'liked' | 'heard' | 'fog' =>
  c.beacons || c.saved ? 'liked' : (c.heard || c.visited) ? 'heard' : 'fog'
/** Kiek šios teritorijos jau palietei — 0..1 (naudojama žiedui). */
const touchFrac = (c: MapCell) => {
  const t = (c.beacons || 0) + (c.visited || 0) + (c.heard || 0)
  return Math.min(1, t / Math.max(4, (c.known || 6)))
}
/** Svoris žemėlapyje = ŽINOMI atlikėjai, ne visas katalogas. */
const weight = (c: MapCell) => Math.max(1, c.known || 1)

export default function GilynMap({ regions, onPick }: {
  regions: MapRegionC[]
  onPick: (c: MapCell) => void
}) {
  const [mode, setMode] = useState<'map' | 'time'>('map')
  const cells = useMemo<Cell[]>(() => regions.flatMap(r =>
    r.substyles.map(c => ({ ...c, world: r.name, wid: r.worldId || String(r.genreId), wcolor: r.color || '#8895a6' }))
  ), [regions])

  const pct = useMemo(() => {
    const t = cells.filter(c => state(c) !== 'fog').length
    return Math.round(t / Math.max(1, cells.length) * 100)
  }, [cells])

  return (
    <div className="gm">
      <div className="gm-bar">
        <div className="gm-tabs">
          <button className={mode === 'map' ? 'on' : ''} onClick={() => setMode('map')}>Žemėlapis</button>
          <button className={mode === 'time' ? 'on' : ''} onClick={() => setMode('time')}>Laikas</button>
        </div>
        <span className="gm-pct">{pct}% pažinta</span>
      </div>

      {mode === 'map'
        ? <MapView cells={cells} regions={regions} onPick={onPick} />
        : <TimeView cells={cells} regions={regions} onPick={onPick} />}

      <div className="gm-legend">
        <span><i style={{ background: C.liked }} />pamėgta</span>
        <span><i style={{ background: C.heard }} />susipažinta</span>
        <span><i style={{ background: C.fog }} />rūkas</span>
        <span className="gm-hint">dydis = žinomi atlikėjai</span>
      </div>

      <style>{`
.gm { width: 100%; }
.gm-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.gm-tabs { display: flex; gap: 3px; background: rgba(255,255,255,0.05); border-radius: 999px; padding: 3px; }
.gm-tabs button { border: 0; background: transparent; color: #9aa7b8; font-size: 13px; font-weight: 700; padding: 7px 15px; border-radius: 999px; cursor: pointer; min-height: 34px; }
.gm-tabs button.on { background: #e9eef5; color: #12161f; }
.gm-pct { margin-left: auto; font-size: 12px; color: #8794a6; font-weight: 700; }
.gm-stage { position: relative; width: 100%; height: min(66vh, 580px); background: #0d1117; border-radius: 16px; overflow: hidden; touch-action: none; }
.gm-stage svg { width: 100%; height: 100%; display: block; }
.gm-crumb { position: absolute; left: 10px; top: 10px; z-index: 2; display: flex; align-items: center; gap: 6px; background: rgba(13,17,23,0.88); border: 1px solid rgba(255,255,255,0.1); border-radius: 999px; padding: 7px 13px; color: #dbe4ef; font-size: 12.5px; font-weight: 700; cursor: pointer; min-height: 36px; }
.gm-zoom { position: absolute; right: 10px; bottom: 10px; z-index: 2; display: flex; flex-direction: column; gap: 6px; }
.gm-zoom button { width: 36px; height: 36px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12); background: rgba(13,17,23,0.86); color: #dbe4ef; font-size: 17px; font-weight: 700; cursor: pointer; }
.gm-node { cursor: pointer; }
.gm-node:hover circle { stroke: #fff; stroke-width: 1.4; }
.gm-lbl { font-weight: 700; fill: #cbd6e4; pointer-events: none; paint-order: stroke; stroke: #0d1117; stroke-width: 2.6px; }
.gm-wname { font-weight: 800; fill: #eef3f9; pointer-events: none; paint-order: stroke; stroke: #0d1117; stroke-width: 3.6px; letter-spacing: -0.01em; }
.gm-wsub { font-weight: 700; fill: #8794a6; pointer-events: none; paint-order: stroke; stroke: #0d1117; stroke-width: 2.6px; }
.gm-legend { display: flex; align-items: center; gap: 12px; margin-top: 8px; font-size: 12px; color: #8794a6; flex-wrap: wrap; }
.gm-legend span { display: inline-flex; align-items: center; gap: 5px; }
.gm-legend i { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.gm-hint { margin-left: auto; opacity: 0.7; }

.tv { background: #0d1117; border-radius: 16px; padding: 12px; }
.tv-head { display: grid; gap: 3px; margin-bottom: 4px; }
.tv-row { display: grid; gap: 3px; align-items: center; }
.tv-w { font-size: 11px; font-weight: 700; text-align: right; padding-right: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tv-c { height: 26px; border-radius: 6px; background: rgba(255,255,255,0.035); display: flex; overflow: hidden; cursor: pointer; border: 1px solid transparent; }
.tv-c:hover { border-color: rgba(255,255,255,0.22); }
.tv-c.empty { cursor: default; opacity: 0.35; }
.tv-c i { display: block; height: 100%; }
.tv-dec { font-size: 10px; font-weight: 700; color: #6d7889; text-align: center; font-family: ui-monospace, monospace; }
.tv-gantt { max-height: min(60vh, 520px); overflow-y: auto; }
.tv-g { display: grid; grid-template-columns: 1fr; gap: 5px; }
.tv-gi { display: grid; grid-template-columns: 140px 1fr; gap: 8px; align-items: center; background: none; border: 0; padding: 0; cursor: pointer; text-align: left; }
.tv-gn { font-size: 12px; font-weight: 700; color: #dbe4ef; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tv-gb { position: relative; height: 22px; background: rgba(255,255,255,0.04); border-radius: 5px; }
.tv-gb i { position: absolute; top: 0; bottom: 0; border-radius: 5px; }
.tv-gb b { position: absolute; right: 6px; top: 3px; font-size: 10px; font-weight: 700; color: #6d7889; font-family: ui-monospace, monospace; }
.tv-back { background: transparent; border: 0; color: #8794a6; font-size: 12.5px; font-weight: 700; cursor: pointer; padding: 4px 0 10px; min-height: 32px; }
.tv-title { font-size: 14px; font-weight: 800; color: #eef3f9; margin: 0 0 10px; }
@media (max-width: 560px) { .tv-gi { grid-template-columns: 104px 1fr; } .tv-w { font-size: 10px; } }
`}</style>
    </div>
  )
}

// ══ ŽEMĖLAPIS ═════════════════════════════════════════════════════════════
function MapView({ cells, regions, onPick }: { cells: Cell[]; regions: MapRegionC[]; onPick: (c: MapCell) => void }) {
  const [world, setWorld] = useState<string | null>(null)
  const [vb, setVb] = useState({ x: 0, y: 0, w: 1000, h: 1000 })
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)
  const pinch = useRef<{ d: number; w: number; cx: number; cy: number; vx: number; vy: number } | null>(null)
  const moved = useRef(false)

  const worlds = useMemo(() => regions.map(r => {
    const wid = r.worldId || String(r.genreId)
    const cs = cells.filter(c => c.wid === wid && c.x != null)
    const n = Math.max(1, cs.length)
    return {
      id: wid, name: r.name, color: r.color || '#8895a6',
      cx: cs.reduce((s, c) => s + (c.x || 0), 0) / n,
      cy: cs.reduce((s, c) => s + (c.y || 0), 0) / n,
      terr: cs.length,
      touched: cs.filter(c => state(c) !== 'fog').length,
      w: cs.reduce((s, c) => s + weight(c), 0),
    }
  }).filter(w => w.terr > 0), [regions, cells])

  const inWorld = useMemo(() => {
    if (!world) return []
    const cs = cells.filter(c => c.wid === world && c.x != null && c.y != null)
    if (!cs.length) return []
    const xs = cs.map(c => c.x!), ys = cs.map(c => c.y!)
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
    const sc = 850 / Math.max(70, Math.max(maxX - minX, maxY - minY))
    const ox = (1000 - (maxX - minX) * sc) / 2, oy = (1000 - (maxY - minY) * sc) / 2
    return cs.map(c => ({ ...c, px: ox + (c.x! - minX) * sc, py: oy + (c.y! - minY) * sc }))
  }, [world, cells])

  const zoom = useCallback((f: number, ox = 0.5, oy = 0.5) => {
    setVb(v => {
      const w = Math.max(140, Math.min(1000, v.w * f))
      return { x: v.x + (v.w - w) * ox, y: v.y + (v.h - w) * oy, w, h: w }
    })
  }, [])

  useEffect(() => { setVb({ x: 0, y: 0, w: 1000, h: 1000 }) }, [world])

  useEffect(() => {
    const el = svgRef.current
    if (!el || !world) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoom(e.deltaY > 0 ? 1.14 : 0.88, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoom, world])

  // ── Lietimas: 1 pirštas = tempimas, 2 pirštai = pinch zoom ──
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]]
      const r = svgRef.current!.getBoundingClientRect()
      pinch.current = {
        d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), w: vb.w,
        cx: ((a.clientX + b.clientX) / 2 - r.left) / r.width,
        cy: ((a.clientY + b.clientY) / 2 - r.top) / r.height,
        vx: vb.x, vy: vb.y,
      }
      drag.current = null
    } else if (e.touches.length === 1) {
      drag.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, vx: vb.x, vy: vb.y }
      moved.current = false
    }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinch.current) {
      e.preventDefault()
      const [a, b] = [e.touches[0], e.touches[1]]
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
      const p = pinch.current
      const w = Math.max(140, Math.min(1000, p.w * (p.d / Math.max(1, d))))
      moved.current = true
      setVb({ x: p.vx + (p.w - w) * p.cx, y: p.vy + (p.w - w) * p.cy, w, h: w })
      return
    }
    if (e.touches.length === 1) move(e.touches[0].clientX, e.touches[0].clientY)
  }
  const move = (x: number, y: number) => {
    const d = drag.current
    if (!d || !svgRef.current || !world) return
    const r = svgRef.current.getBoundingClientRect()
    const dx = (x - d.x) / r.width * vb.w, dy = (y - d.y) / r.height * vb.h
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved.current = true
    setVb(v => ({ ...v, x: d.vx - dx, y: d.vy - dy }))
  }
  const endTouch = () => { pinch.current = null; drag.current = null }

  // ── Lygis 0: pasauliai ──
  if (!world) {
    const maxW = Math.max(...worlds.map(w => w.w), 1)
    return (
      <div className="gm-stage">
        <svg viewBox="0 0 1000 1000" role="img" aria-label="Muzikos pasauliai">
          {worlds.map(w => {
            const r = 32 + Math.sqrt(w.w / maxW) * 58
            const frac = w.touched / Math.max(1, w.terr)
            const circ = 2 * Math.PI * (r + 6)
            return (
              <g key={w.id} className="gm-node" onClick={() => setWorld(w.id)} role="button" tabIndex={0}>
                <circle cx={w.cx} cy={w.cy} r={r} fill={w.color} fillOpacity={0.14} stroke={w.color} strokeOpacity={0.45} strokeWidth={1.2} />
                <circle cx={w.cx} cy={w.cy} r={r + 6} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={3} />
                <circle cx={w.cx} cy={w.cy} r={r + 6} fill="none" stroke={C.liked} strokeWidth={3.5}
                  strokeDasharray={`${circ * frac} ${circ}`} strokeLinecap="round"
                  transform={`rotate(-90 ${w.cx} ${w.cy})`} />
                <text x={w.cx} y={w.cy - 1} textAnchor="middle" className="gm-wname" style={{ fontSize: Math.max(16, r * 0.32) }}>{w.name}</text>
                <text x={w.cx} y={w.cy + 17} textAnchor="middle" className="gm-wsub" style={{ fontSize: 12 }}>{w.touched}/{w.terr}</text>
              </g>
            )
          })}
        </svg>
      </div>
    )
  }

  // ── Lygis 1: teritorijos ──
  const w = worlds.find(x => x.id === world)!
  const maxW = Math.max(...inWorld.map(weight), 1)
  const zf = 1000 / vb.w
  const nameCut = maxW / (zf * zf * 2.4)

  return (
    <div className="gm-stage">
      <button className="gm-crumb" onClick={() => setWorld(null)}>
        ← <span style={{ color: w.color }}>{w.name}</span>
        <span style={{ color: '#7f8b9c', fontWeight: 400 }}>· {w.touched}/{w.terr}</span>
      </button>

      <svg ref={svgRef} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        onMouseDown={e => { drag.current = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y }; moved.current = false }}
        onMouseMove={e => move(e.clientX, e.clientY)}
        onMouseUp={() => { drag.current = null }} onMouseLeave={() => { drag.current = null }}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={endTouch} onTouchCancel={endTouch}
        role="img" aria-label={w.name}>

        {inWorld.map(c => {
          const st = state(c)
          const r = 5 + Math.sqrt(weight(c) / maxW) * 32
          const show = weight(c) >= nameCut || st !== 'fog'
          const fs = Math.max(7, vb.w * 0.017)
          const tf = touchFrac(c)
          const circ = 2 * Math.PI * (r + 3)
          return (
            <g key={String(c.id)} className="gm-node" role="button" tabIndex={0}
              onClick={() => { if (!moved.current) onPick(c) }}>
              <circle cx={c.px} cy={c.py} r={r} fill={C[st]} fillOpacity={st === 'fog' ? 0.5 : 0.9} />
              {/* žiedas = kiek šios teritorijos jau pažinai */}
              {tf > 0 && (
                <circle cx={c.px} cy={c.py} r={r + 3} fill="none" stroke={st === 'liked' ? C.liked : C.heard}
                  strokeWidth={2} strokeDasharray={`${circ * tf} ${circ}`} strokeLinecap="round"
                  transform={`rotate(-90 ${c.px} ${c.py})`} />
              )}
              {show && (
                <text x={c.px} y={c.py + r + fs + 2} textAnchor="middle" className="gm-lbl"
                  style={{ fontSize: fs, fill: st === 'fog' ? '#9aa7b8' : '#eef3f9' }}>{c.name}</text>
              )}
            </g>
          )
        })}
      </svg>

      <div className="gm-zoom">
        <button onClick={() => zoom(0.72)} aria-label="Priartinti">+</button>
        <button onClick={() => zoom(1.4)} aria-label="Atitolinti">−</button>
      </div>
    </div>
  )
}

// ══ LAIKAS ════════════════════════════════════════════════════════════════
// Tinklelis pasauliai × dešimtmečiai. Kiekvienas langelis — proporcijų juostelė
// (kiek pamėgta / susipažinta / rūke). Bakstelėjus — Gantt, kur KIEKVIENA
// teritorija turi savo eilutę. Persiklojimo nebėra.

const DECS = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020]
const inDec = (c: MapCell, d: number) =>
  (c.eraFrom ?? -9999) <= d + 9 && (c.eraTo ?? 9999) >= d

function TimeView({ cells, regions, onPick }: { cells: Cell[]; regions: MapRegionC[]; onPick: (c: MapCell) => void }) {
  const [sel, setSel] = useState<{ wid: string; dec: number } | null>(null)

  const lanes = useMemo(() => regions.map(r => {
    const wid = r.worldId || String(r.genreId)
    return { id: wid, name: r.name, color: r.color || '#8895a6', cells: cells.filter(c => c.wid === wid) }
  }).filter(l => l.cells.length > 0), [regions, cells])

  const grid = `44px repeat(${DECS.length}, 1fr)`

  if (!sel) {
    return (
      <div className="tv">
        <div className="tv-head" style={{ gridTemplateColumns: grid, display: 'grid' }}>
          <span />
          {DECS.map(d => <span key={d} className="tv-dec">{String(d).slice(2)}</span>)}
        </div>
        {lanes.map(l => (
          <div key={l.id} className="tv-row" style={{ gridTemplateColumns: grid, marginBottom: 4 }}>
            <span className="tv-w" style={{ color: l.color }}>{l.name}</span>
            {DECS.map(d => {
              const cs = l.cells.filter(c => inDec(c, d))
              if (!cs.length) return <span key={d} className="tv-c empty" />
              const liked = cs.filter(c => state(c) === 'liked').length
              const heard = cs.filter(c => state(c) === 'heard').length
              const fog = cs.length - liked - heard
              const p = (n: number) => `${n / cs.length * 100}%`
              return (
                <button key={d} className="tv-c" onClick={() => setSel({ wid: l.id, dec: d })}
                  title={`${l.name} · ${d}-ieji · ${cs.length} teritorijų`}>
                  {liked > 0 && <i style={{ width: p(liked), background: C.liked }} />}
                  {heard > 0 && <i style={{ width: p(heard), background: C.heard }} />}
                  {fog > 0 && <i style={{ width: p(fog), background: C.fog, opacity: 0.42 }} />}
                </button>
              )
            })}
          </div>
        ))}
        <p style={{ margin: '10px 0 0', fontSize: 12, color: '#6d7889' }}>
          Bakstelėk langelį — pamatysi to dešimtmečio teritorijas.
        </p>
      </div>
    )
  }

  // ── Gantt: vienas pasaulis, vienas dešimtmetis ──
  const lane = lanes.find(l => l.id === sel.wid)!
  const list = lane.cells.filter(c => inDec(c, sel.dec)).sort((a, b) => weight(b) - weight(a))
  const D0 = sel.dec, D1 = sel.dec + 10

  return (
    <div className="tv">
      <button className="tv-back" onClick={() => setSel(null)}>← visi dešimtmečiai</button>
      <h4 className="tv-title" style={{ color: lane.color }}>
        {lane.name} · {sel.dec}-ieji
        <span style={{ color: '#6d7889', fontWeight: 400 }}> — {list.length} teritorijų</span>
      </h4>
      <div className="tv-gantt">
        <div className="tv-g">
          {list.map(c => {
            const st = state(c)
            const f = Math.max(D0, c.eraFrom ?? D0)
            const t = Math.min(D1, c.eraTo ?? D1)
            const left = (f - D0) / 10 * 100
            const wdt = Math.max(6, (t - f) / 10 * 100)
            return (
              <button key={String(c.id)} className="tv-gi" onClick={() => onPick(c)}>
                <span className="tv-gn" style={{ color: st === 'fog' ? '#8794a6' : '#eef3f9' }}>{c.name}</span>
                <span className="tv-gb">
                  <i style={{ left: `${left}%`, width: `${wdt}%`, background: C[st], opacity: st === 'fog' ? 0.45 : 0.95 }} />
                  <b>{c.known || 0}</b>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
