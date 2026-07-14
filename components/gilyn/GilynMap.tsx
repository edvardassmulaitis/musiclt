'use client'
// components/gilyn/GilynMap.tsx
//
// Gilyn v3 muzikos žemėlapis — du režimai, viena semantika.
//
// PAGRINDINIS PRINCIPAS: 526 teritorijos NIEKADA nerodomos vienu metu.
// Ankstesnė versija bandė ir virto makalyne. Dabar — hierarchinis zoom:
//
//   ŽEMĖLAPIS   pasauliai (15 kontinentų)
//                 → bakstelėjus: to pasaulio teritorijos užima visą lauką
//                 → priartinus: iš rūko iškyla vis smulkesnės (LOD pagal dydį)
//
//   LAIKAS      tikra laiko ašis: metai viršuje, pasauliai — juostos
//                 → bakstelėjus dešimtmetį: ašis išsiskleidžia, atsiranda vardai
//
// TRYS BŪSENOS: pamėgta (oranžinė) · perklausyta (mėlyna) · rūkas (pilka).
// Spalva neša būseną, vieta — žanrą. Spragos žaidėjui nerodomos.

import { useMemo, useRef, useState, useCallback, useEffect } from 'react'

export type MapCell = {
  id: number | string
  name: string
  size?: number
  x?: number | null
  y?: number | null
  eraFrom?: number | null
  eraTo?: number | null
  era?: string | null
  region?: string | null
  essence?: string | null
  known?: number
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

export default function GilynMap({ regions, onPick }: {
  regions: MapRegionC[]
  onPick: (c: MapCell) => void
}) {
  const [mode, setMode] = useState<'map' | 'time'>('map')

  const cells = useMemo<Cell[]>(() => regions.flatMap(r =>
    r.substyles.map(c => ({ ...c, world: r.name, wid: r.worldId || String(r.genreId), wcolor: r.color || '#8895a6' }))
  ), [regions])

  const pct = useMemo(() => {
    const touched = cells.filter(c => state(c) !== 'fog').length
    return Math.round(touched / Math.max(1, cells.length) * 100)
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
        <span><i style={{ background: C.heard }} />perklausyta</span>
        <span><i style={{ background: C.fog }} />rūkas</span>
        <span className="gm-hint">dydis = katalogas</span>
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
.gm-crumb { position: absolute; left: 10px; top: 10px; z-index: 2; display: flex; align-items: center; gap: 6px; background: rgba(13,17,23,0.86); border: 1px solid rgba(255,255,255,0.1); border-radius: 999px; padding: 6px 13px; color: #dbe4ef; font-size: 12.5px; font-weight: 700; cursor: pointer; min-height: 34px; }
.gm-crumb:hover { border-color: rgba(255,255,255,0.24); }
.gm-zoom { position: absolute; right: 10px; bottom: 10px; z-index: 2; display: flex; flex-direction: column; gap: 6px; }
.gm-zoom button { width: 36px; height: 36px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12); background: rgba(13,17,23,0.86); color: #dbe4ef; font-size: 17px; font-weight: 700; cursor: pointer; }
.gm-node { cursor: pointer; }
.gm-node:hover circle { stroke: #fff; stroke-width: 1.4; }
.gm-lbl { font-weight: 700; fill: #cbd6e4; pointer-events: none; paint-order: stroke; stroke: #0d1117; stroke-width: 2.6px; }
.gm-wname { font-weight: 800; fill: #eef3f9; pointer-events: none; paint-order: stroke; stroke: #0d1117; stroke-width: 3.4px; letter-spacing: -0.01em; }
.gm-wsub { font-weight: 700; fill: #7f8b9c; pointer-events: none; paint-order: stroke; stroke: #0d1117; stroke-width: 2.6px; }
.gm-legend { display: flex; align-items: center; gap: 12px; margin-top: 8px; font-size: 12px; color: #8794a6; flex-wrap: wrap; }
.gm-legend span { display: inline-flex; align-items: center; gap: 5px; }
.gm-legend i { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.gm-hint { margin-left: auto; opacity: 0.7; }
.gm-tl { position: relative; width: 100%; background: #0d1117; border-radius: 16px; overflow: hidden; }
.gm-tlscroll { overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; }
.gm-tip { margin-top: 8px; min-height: 34px; font-size: 12.5px; color: #8794a6; }
.gm-tip b { color: #e6ecf3; }
`}</style>
    </div>
  )
}

// ══ ŽEMĖLAPIS ═════════════════════════════════════════════════════════════
// Du lygiai. Lygyje 0 — 15 pasaulių (dydis = katalogas, žiedas = kiek pažinai).
// Lygyje 1 — pasirinkto pasaulio teritorijos, perskaičiuotos į visą lauką.
// Priartinus vardai atsiranda pakopomis: pirma didžiosios, tada smulkesnės.

function MapView({ cells, regions, onPick }: { cells: Cell[]; regions: MapRegionC[]; onPick: (c: MapCell) => void }) {
  const [world, setWorld] = useState<string | null>(null)
  const [vb, setVb] = useState({ x: 0, y: 0, w: 1000, h: 1000 })
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)
  const moved = useRef(false)

  // Pasaulių kortelės (lygis 0)
  const worlds = useMemo(() => regions.map(r => {
    const cs = cells.filter(c => c.wid === (r.worldId || String(r.genreId)))
    const placed = cs.filter(c => c.x != null)
    const n = Math.max(1, placed.length)
    const cx = placed.reduce((s, c) => s + (c.x || 0), 0) / n
    const cy = placed.reduce((s, c) => s + (c.y || 0), 0) / n
    const touched = cs.filter(c => state(c) !== 'fog').length
    const artists = cs.reduce((s, c) => s + (c.size || 0), 0)
    return {
      id: r.worldId || String(r.genreId), name: r.name, color: r.color || '#8895a6',
      cx, cy, terr: cs.length, touched, artists,
      liked: cs.filter(c => state(c) === 'liked').length,
    }
  }).filter(w => w.terr > 0), [regions, cells])

  // Pasirinkto pasaulio teritorijos, ištemptos į visą lauką
  const inWorld = useMemo(() => {
    if (!world) return []
    const cs = cells.filter(c => c.wid === world && c.x != null && c.y != null)
    if (!cs.length) return []
    const xs = cs.map(c => c.x!), ys = cs.map(c => c.y!)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const sc = 860 / Math.max(60, Math.max(maxX - minX, maxY - minY))
    const ox = (1000 - (maxX - minX) * sc) / 2
    const oy = (1000 - (maxY - minY) * sc) / 2
    return cs.map(c => ({ ...c, px: ox + (c.x! - minX) * sc, py: oy + (c.y! - minY) * sc }))
  }, [world, cells])

  const zoom = useCallback((f: number, ox = 0.5, oy = 0.5) => {
    setVb(v => {
      const w = Math.max(150, Math.min(1000, v.w * f))
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

  const down = (x: number, y: number) => { drag.current = { x, y, vx: vb.x, vy: vb.y }; moved.current = false }
  const move = (x: number, y: number) => {
    const d = drag.current
    if (!d || !svgRef.current || !world) return
    const r = svgRef.current.getBoundingClientRect()
    const dx = (x - d.x) / r.width * vb.w, dy = (y - d.y) / r.height * vb.h
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved.current = true
    setVb(v => ({ ...v, x: d.vx - dx, y: d.vy - dy }))
  }

  // ── Lygis 0: pasauliai ──
  if (!world) {
    const maxA = Math.max(...worlds.map(w => w.artists), 1)
    return (
      <div className="gm-stage">
        <svg viewBox="0 0 1000 1000" role="img" aria-label="Muzikos pasauliai">
          {worlds.map(w => {
            const r = 34 + Math.sqrt(w.artists / maxA) * 56
            const frac = w.touched / Math.max(1, w.terr)
            const circ = 2 * Math.PI * (r + 7)
            return (
              <g key={w.id} className="gm-node" onClick={() => setWorld(w.id)} role="button" tabIndex={0}>
                <circle cx={w.cx} cy={w.cy} r={r} fill={w.color} fillOpacity={0.13} stroke={w.color} strokeOpacity={0.5} strokeWidth={1.2} />
                {/* žiedas = kiek šio pasaulio jau palietei */}
                <circle cx={w.cx} cy={w.cy} r={r + 7} fill="none" stroke={C.liked} strokeOpacity={0.9} strokeWidth={3.5}
                  strokeDasharray={`${circ * frac} ${circ}`} strokeLinecap="round"
                  transform={`rotate(-90 ${w.cx} ${w.cy})`} />
                <text x={w.cx} y={w.cy - 2} textAnchor="middle" className="gm-wname" style={{ fontSize: Math.max(17, r * 0.34) }}>{w.name}</text>
                <text x={w.cx} y={w.cy + 17} textAnchor="middle" className="gm-wsub" style={{ fontSize: 12.5 }}>
                  {w.touched}/{w.terr}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    )
  }

  // ── Lygis 1: vieno pasaulio teritorijos ──
  const w = worlds.find(x => x.id === world)!
  const maxSize = Math.max(...inWorld.map(c => c.size || 1), 1)
  // LOD: kuo giliau priartinai, tuo smulkesnės teritorijos parodo vardus
  const zoomF = 1000 / vb.w
  const nameCut = maxSize / (zoomF * zoomF * 2.6)

  return (
    <div className="gm-stage">
      <button className="gm-crumb" onClick={() => setWorld(null)}>
        ← <span style={{ color: w.color }}>{w.name}</span>
        <span style={{ color: '#7f8b9c', fontWeight: 400 }}>· {w.terr} teritorijų</span>
      </button>

      <svg ref={svgRef} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        onMouseDown={e => down(e.clientX, e.clientY)}
        onMouseMove={e => move(e.clientX, e.clientY)}
        onMouseUp={() => { drag.current = null }}
        onMouseLeave={() => { drag.current = null }}
        onTouchStart={e => down(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchMove={e => move(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchEnd={() => { drag.current = null }}
        role="img" aria-label={w.name}>

        {inWorld.map(c => {
          const st = state(c)
          const r = 5 + Math.sqrt((c.size || 1) / maxSize) * 34
          const showName = (c.size || 0) >= nameCut || st !== 'fog'
          const fs = Math.max(7, vb.w * 0.017)
          return (
            <g key={String(c.id)} className="gm-node" role="button" tabIndex={0}
              onClick={() => { if (!moved.current) onPick(c) }}>
              <circle cx={c.px} cy={c.py} r={r}
                fill={C[st]} fillOpacity={st === 'fog' ? 0.5 : 0.95} />
              {showName && (
                <text x={c.px} y={c.py + r + fs + 1} textAnchor="middle" className="gm-lbl"
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
// Tikra laiko ašis: metai viršuje, pasauliai — horizontalios juostos.
// Bakstelėjus dešimtmetį ašis išsiskleidžia (10 metų per visą plotį) ir
// teritorijos gauna vardus.

const Y0 = 1950, Y1 = 2026

function TimeView({ cells, regions, onPick }: { cells: Cell[]; regions: MapRegionC[]; onPick: (c: MapCell) => void }) {
  const [dec, setDec] = useState<number | null>(null)
  const [tip, setTip] = useState<Cell | null>(null)

  const lanes = useMemo(() => regions
    .map(r => ({
      id: r.worldId || String(r.genreId), name: r.name, color: r.color || '#8895a6',
      cells: cells.filter(c => c.wid === (r.worldId || String(r.genreId)) && (c.eraFrom || c.eraTo)),
    }))
    .filter(l => l.cells.length > 0), [regions, cells])

  const from = dec ?? Y0, to = dec ? dec + 10 : Y1
  const PADL = 96, W = dec ? 900 : 820, LANE = dec ? 40 : 30
  const sx = (y: number) => PADL + (Math.min(to, Math.max(from, y)) - from) / (to - from) * (W - PADL - 16)
  const ticks = dec
    ? Array.from({ length: 6 }, (_, i) => dec + i * 2)
    : [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020]

  const visible = (c: Cell) => {
    const f = c.eraFrom ?? Y0, t = c.eraTo ?? Y1
    return t >= from && f <= to
  }
  const H = lanes.length * LANE + 34

  return (
    <div>
      <div className="gm-tl">
        {dec && (
          <button className="gm-crumb" style={{ position: 'relative', margin: '10px 0 0 10px' }} onClick={() => { setDec(null); setTip(null) }}>
            ← {dec}-ieji
          </button>
        )}
        <div className="gm-tlscroll">
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: dec ? 720 : 620, height: H * (dec ? 1.05 : 1) }}
            role="img" aria-label="Laiko juosta">
            {ticks.map(t => (
              <g key={t}>
                <line x1={sx(t)} y1={20} x2={sx(t)} y2={H - 8} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
                <text x={sx(t)} y={13} textAnchor="middle" className="gm-wsub" style={{ fontSize: 10.5 }}>{t}</text>
              </g>
            ))}

            {lanes.map((l, i) => {
              const y = 34 + i * LANE
              return (
                <g key={l.id}>
                  <text x={0} y={y + 3.5} className="gm-lbl" style={{ fontSize: 10.5, fill: l.color, textAnchor: 'start' }}>{l.name}</text>
                  <line x1={PADL} y1={y} x2={W - 16} y2={y} stroke={l.color} strokeOpacity={0.16} strokeWidth={1} />
                  {l.cells.filter(visible).map(c => {
                    const st = state(c)
                    const f = Math.max(from, c.eraFrom ?? from)
                    const t = Math.min(to, c.eraTo ?? to)
                    const x1 = sx(f), x2 = Math.max(x1 + 5, sx(t))
                    const h = dec ? 9 : 6
                    return (
                      <g key={String(c.id)} className="gm-node"
                        onClick={() => onPick(c)}
                        onMouseEnter={() => setTip(c)}>
                        <rect x={x1} y={y - h / 2} width={x2 - x1} height={h} rx={h / 2}
                          fill={C[st]} fillOpacity={st === 'fog' ? 0.42 : 0.95} />
                        {dec && (x2 - x1) > 34 && (
                          <text x={x1 + 5} y={y + 3} className="gm-lbl" style={{ fontSize: 8.5, textAnchor: 'start' }}>{c.name}</text>
                        )}
                      </g>
                    )
                  })}
                </g>
              )
            })}

            {/* Dešimtmečių paspaudimo zonos — tik apžvalgoje */}
            {!dec && [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020].map(d => (
              <rect key={d} x={sx(d)} y={20} width={sx(d + 10) - sx(d)} height={H - 28}
                fill="transparent" style={{ cursor: 'zoom-in' }} onClick={() => setDec(d)} />
            ))}
          </svg>
        </div>
      </div>

      <div className="gm-tip">
        {tip
          ? <><b>{tip.name}</b> · {tip.era} · {tip.size} atlikėjų — {state(tip) === 'liked' ? 'pamėgta' : state(tip) === 'heard' ? 'perklausyta' : 'dar rūke'}</>
          : dec ? 'Bakstelėk juostą — atversi teritoriją.' : 'Bakstelėk dešimtmetį — ašis išsiskleis ir atsiras vardai.'}
      </div>
    </div>
  )
}
