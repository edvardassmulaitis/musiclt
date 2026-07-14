'use client'
// components/gilyn/GilynMap.tsx
//
// Gilyn v3 muzikos žemėlapis — du režimai, viena semantika.
//
//   ŽEMĖLAPIS  — teritorijos guli pagal kaimynystę (bendra auditorija + bendri
//                atlikėjai). Koordinatės UŽŠALDYTOS DB (gilyn_terr.map_x/map_y),
//                tad žaidėjo pasaulis kaskart atrodo vienodai ir jis įsimena,
//                kur kas yra. Skaičiuoti naršyklėje būtų klaida.
//
//   LAIKAS     — X ašis metai, Y ašis pasauliai. Apžvalgoje rodomas tik
//                dešimtmečio pulsas (526 teritorijos vardais į telefoną netilptų),
//                priartinus atsiranda vardai.
//
// TRYS BŪSENOS, ne daugiau. Spalva neša būseną, o vieta — žanrą:
//   pamėgta (oranžinė) · perklausyta (mėlyna) · rūkas (pilka)
// Spragos (tuščios teritorijos) žaidėjui NErodomos — jos yra admino reikalas.

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

const C = { liked: '#e0632c', heard: '#3b86d8', fog: '#5b6472' }
const state = (c: MapCell): 'liked' | 'heard' | 'fog' =>
  c.beacons || c.saved ? 'liked' : (c.heard || c.visited) ? 'heard' : 'fog'

const radius = (n: number) => 3 + Math.sqrt(Math.max(1, n)) * 1.25

export default function GilynMap({ regions, onPick }: {
  regions: MapRegionC[]
  onPick: (c: MapCell) => void
}) {
  const [mode, setMode] = useState<'map' | 'time'>('map')

  const cells = useMemo(() => {
    const out: (MapCell & { world: string; wcolor: string })[] = []
    for (const r of regions) for (const c of r.substyles) {
      out.push({ ...c, world: r.name, wcolor: r.color || '#888' })
    }
    return out
  }, [regions])

  const stats = useMemo(() => {
    const liked = cells.filter(c => state(c) === 'liked').length
    const heard = cells.filter(c => state(c) === 'heard').length
    return { liked, heard, total: cells.length, pct: Math.round((liked + heard) / Math.max(1, cells.length) * 100) }
  }, [cells])

  return (
    <div className="gm">
      <div className="gm-bar">
        <div className="gm-tabs" role="tablist">
          <button role="tab" aria-selected={mode === 'map'} className={mode === 'map' ? 'on' : ''} onClick={() => setMode('map')}>Žemėlapis</button>
          <button role="tab" aria-selected={mode === 'time'} className={mode === 'time' ? 'on' : ''} onClick={() => setMode('time')}>Laikas</button>
        </div>
        <span className="gm-pct">{stats.pct}% pažinta</span>
      </div>

      {mode === 'map' ? <MapView cells={cells} onPick={onPick} /> : <TimeView regions={regions} onPick={onPick} />}

      <div className="gm-legend">
        <span><i style={{ background: C.liked }} />pamėgta</span>
        <span><i style={{ background: C.heard }} />perklausyta</span>
        <span><i style={{ background: C.fog }} />rūkas</span>
        <span className="gm-hint">dydis = katalogas</span>
      </div>

      <style>{`
.gm { width: 100%; }
.gm-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.gm-tabs { display: flex; gap: 4px; background: rgba(255,255,255,0.05); border-radius: 999px; padding: 3px; }
.gm-tabs button { border: 0; background: transparent; color: #9aa7b8; font-size: 13px; font-weight: 700; padding: 6px 14px; border-radius: 999px; cursor: pointer; min-height: 32px; }
.gm-tabs button.on { background: #e9eef5; color: #12161f; }
.gm-pct { margin-left: auto; font-size: 12px; color: #8794a6; font-weight: 700; }
.gm-stage { position: relative; width: 100%; height: min(64vh, 560px); background: #0e1219; border-radius: 16px; overflow: hidden; touch-action: none; }
.gm-stage svg { width: 100%; height: 100%; display: block; }
.gm-node { cursor: pointer; }
.gm-node:hover circle, .gm-node:focus circle { stroke: #fff; stroke-width: 1.6; }
.gm-lbl { font-size: 9px; font-weight: 800; fill: #c8d3e2; pointer-events: none; paint-order: stroke; stroke: #0e1219; stroke-width: 2.4px; }
.gm-wlbl { font-size: 13px; font-weight: 900; pointer-events: none; paint-order: stroke; stroke: #0e1219; stroke-width: 4px; letter-spacing: -0.01em; }
.gm-zoom { position: absolute; right: 10px; bottom: 10px; display: flex; flex-direction: column; gap: 6px; }
.gm-zoom button { width: 34px; height: 34px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.14); background: rgba(14,18,25,0.82); color: #dbe4ef; font-size: 17px; font-weight: 700; cursor: pointer; }
.gm-legend { display: flex; align-items: center; gap: 12px; margin-top: 8px; font-size: 12px; color: #8794a6; flex-wrap: wrap; }
.gm-legend span { display: inline-flex; align-items: center; gap: 5px; }
.gm-legend i { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.gm-hint { margin-left: auto; opacity: 0.7; }
.gm-back { display: inline-flex; align-items: center; gap: 6px; background: transparent; border: 0; color: #9aa7b8; font-size: 13px; font-weight: 700; cursor: pointer; padding: 6px 0; min-height: 32px; }
.gm-decgrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; padding: 10px; }
.gm-dec { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 8px 6px; cursor: pointer; text-align: left; }
.gm-dec:hover { border-color: rgba(255,255,255,0.2); }
.gm-dec b { display: block; font-size: 13px; color: #e9eef5; font-weight: 800; margin-bottom: 5px; }
.gm-dots { display: flex; flex-wrap: wrap; gap: 3px; }
.gm-dots i { width: 6px; height: 6px; border-radius: 50%; display: block; }
.gm-dec small { display: block; margin-top: 5px; font-size: 10.5px; color: #7f8b9c; }
@media (max-width: 520px) { .gm-decgrid { grid-template-columns: repeat(2, 1fr); } }
`}</style>
    </div>
  )
}

// ── ŽEMĖLAPIS: užšaldytas force-directed išdėstymas ───────────────────────
function MapView({ cells, onPick }: { cells: (MapCell & { world: string; wcolor: string })[]; onPick: (c: MapCell) => void }) {
  const placed = useMemo(() => cells.filter(c => c.x != null && c.y != null), [cells])
  const worldCenters = useMemo(() => {
    const m = new Map<string, { x: number; y: number; n: number; color: string }>()
    for (const c of placed) {
      const w = m.get(c.world) || { x: 0, y: 0, n: 0, color: c.wcolor }
      w.x += c.x!; w.y += c.y!; w.n++
      m.set(c.world, w)
    }
    return [...m.entries()].map(([name, w]) => ({ name, x: w.x / w.n, y: w.y / w.n, color: w.color }))
  }, [placed])

  const [vb, setVb] = useState({ x: -40, y: -40, w: 1080, h: 1080 })
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)
  const moved = useRef(false)
  const svgRef = useRef<SVGSVGElement>(null)

  const zoom = useCallback((f: number, ox = 0.5, oy = 0.5) => {
    setVb(v => {
      const w = Math.max(180, Math.min(1400, v.w * f))
      const h = w
      return { x: v.x + (v.w - w) * ox, y: v.y + (v.h - h) * oy, w, h }
    })
  }, [])

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoom(e.deltaY > 0 ? 1.12 : 0.89, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoom])

  const down = (x: number, y: number) => { drag.current = { x, y, vx: vb.x, vy: vb.y }; moved.current = false }
  const move = (x: number, y: number) => {
    const d = drag.current
    if (!d || !svgRef.current) return
    const r = svgRef.current.getBoundingClientRect()
    const dx = (x - d.x) / r.width * vb.w
    const dy = (y - d.y) / r.height * vb.h
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved.current = true
    setVb(v => ({ ...v, x: d.vx - dx, y: d.vy - dy }))
  }
  const up = () => { drag.current = null }

  // Vardai atsiranda tik priartinus — kitaip 526 etiketės virsta triukšmu
  const showNames = vb.w < 620
  const showWorlds = vb.w > 420

  return (
    <div className="gm-stage">
      <svg ref={svgRef} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        onMouseDown={e => down(e.clientX, e.clientY)}
        onMouseMove={e => move(e.clientX, e.clientY)}
        onMouseUp={up} onMouseLeave={up}
        onTouchStart={e => down(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchMove={e => move(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchEnd={up}
        role="img" aria-label="Muzikos žemėlapis">

        {showWorlds && worldCenters.map(w => (
          <text key={w.name} x={w.x} y={w.y} textAnchor="middle" className="gm-wlbl"
            style={{ fill: w.color, opacity: 0.55, fontSize: Math.max(11, vb.w * 0.022) }}>{w.name}</text>
        ))}

        {placed.map(c => {
          const st = state(c)
          const r = radius(c.size || 1)
          return (
            <g key={String(c.id)} className="gm-node" role="button" tabIndex={0}
              onClick={() => { if (!moved.current) onPick(c) }}>
              <circle cx={c.x!} cy={c.y!} r={r} fill={C[st]} fillOpacity={st === 'fog' ? 0.42 : 0.92} />
              {showNames && (
                <text x={c.x!} y={c.y! + r + 8} textAnchor="middle" className="gm-lbl"
                  style={{ fontSize: Math.max(6, vb.w * 0.014) }}>{c.name}</text>
              )}
            </g>
          )
        })}
      </svg>

      <div className="gm-zoom">
        <button onClick={() => zoom(0.75)} aria-label="Priartinti">+</button>
        <button onClick={() => zoom(1.33)} aria-label="Atitolinti">−</button>
      </div>
    </div>
  )
}

// ── LAIKAS: apžvalga → dešimtmetis ────────────────────────────────────────
const DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020]

function inDecade(c: MapCell, d: number) {
  const f = c.eraFrom ?? null, t = c.eraTo ?? null
  if (f == null && t == null) return false
  return (f ?? -9999) <= d + 9 && (t ?? 9999) >= d
}

function TimeView({ regions, onPick }: { regions: MapRegionC[]; onPick: (c: MapCell) => void }) {
  const [dec, setDec] = useState<number | null>(null)

  const all = useMemo(() => regions.flatMap(r => r.substyles.map(c => ({ ...c, world: r.name }))), [regions])

  if (dec == null) {
    return (
      <div className="gm-stage" style={{ height: 'auto', minHeight: 260 }}>
        <div className="gm-decgrid">
          {DECADES.map(d => {
            const inD = all.filter(c => inDecade(c, d))
            const liked = inD.filter(c => state(c) === 'liked').length
            const heard = inD.filter(c => state(c) === 'heard').length
            const fog = inD.length - liked - heard
            const dots = [
              ...Array(Math.min(14, liked)).fill(C.liked),
              ...Array(Math.min(14, heard)).fill(C.heard),
              ...Array(Math.min(20, fog)).fill(C.fog),
            ]
            return (
              <button key={d} className="gm-dec" onClick={() => setDec(d)}>
                <b>{d}-ieji</b>
                <span className="gm-dots">{dots.map((c, i) => <i key={i} style={{ background: c, opacity: c === C.fog ? 0.45 : 1 }} />)}</span>
                <small>{inD.length} teritorijų · {liked + heard} pažinta</small>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const inD = all.filter(c => inDecade(c, dec)).sort((a, b) => (b.size || 0) - (a.size || 0)).slice(0, 60)
  const H = 26
  return (
    <div>
      <button className="gm-back" onClick={() => setDec(null)}>← visi dešimtmečiai</button>
      <div className="gm-stage" style={{ height: Math.min(560, inD.length * H + 30), overflowY: 'auto' }}>
        <svg viewBox={`0 0 320 ${inD.length * H + 16}`} role="img" aria-label={`${dec}-ieji`}>
          {inD.map((c, i) => {
            const st = state(c)
            const y = 16 + i * H
            const f = Math.max(dec, c.eraFrom ?? dec)
            const t = Math.min(dec + 9, c.eraTo ?? dec + 9)
            const x1 = 8 + (f - dec) / 10 * 120
            const x2 = 8 + (t - dec + 1) / 10 * 120
            return (
              <g key={String(c.id)} className="gm-node" role="button" tabIndex={0} onClick={() => onPick(c)}>
                <rect x={x1} y={y - 5} width={Math.max(4, x2 - x1)} height={10} rx={5}
                  fill={C[st]} fillOpacity={st === 'fog' ? 0.4 : 0.9} />
                <text x={136} y={y + 3} className="gm-lbl" style={{ fontSize: 9.5, textAnchor: 'start' }}>{c.name}</text>
                <text x={314} y={y + 3} className="gm-lbl" style={{ fontSize: 8.5, textAnchor: 'end', opacity: 0.6 }}>{c.size}</text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
