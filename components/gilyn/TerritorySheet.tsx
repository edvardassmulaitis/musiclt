'use client'
// components/gilyn/TerritorySheet.tsx
//
// Teritorijos lapas — VIZUALUS, ne tekstinis.
//
// Svarbiausia vieta visame žemėlapyje: čia žmogus sprendžia, ar kastis gilyn.
// Todėl pagrindinis turinys — atlikėjų veidų kolažas, ne pastraipos.
//
//   spalvotas veidas + ženkliukas = jau lietei (❤ pamėgai / ✓ aplankei / ▶ perklausei)
//   pilkas (grayscale)            = dar nepažįstamas — čia ir yra kasimosi tikslas
//
// Atlikėjai kraunami atskirai (API), tad žemėlapio payload'as lieka lengvas.

import { useEffect, useState } from 'react'

export type SheetCell = {
  id: number | string
  name: string
  size?: number
  era?: string | null
  region?: string | null
  essence?: string | null
  near?: { id: string; n: string }[]
}
type Artist = { id: number; n: string; img: string | null; fame: number; k: string | null }

export default function TerritorySheet({ cell, onDig, onNeighbour, onClose }: {
  cell: SheetCell
  onDig: (artistId: number, name: string) => void
  onNeighbour: (id: string) => void
  onClose: () => void
}) {
  const [artists, setArtists] = useState<Artist[] | null>(null)
  const [total, setTotal] = useState(cell.size || 0)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let alive = true
    setArtists(null); setShowAll(false)
    fetch(`/api/zaidimai/gilyn/teritorija?id=${encodeURIComponent(String(cell.id))}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { if (alive && !j.error) { setArtists(j.artists || []); setTotal(j.total || 0) } })
      .catch(() => { if (alive) setArtists([]) })
    return () => { alive = false }
  }, [cell.id])

  const known = (artists || []).filter(a => a.k)
  const list = showAll ? (artists || []) : (artists || []).slice(0, 24)

  return (
    <div className="ts-back" onClick={onClose}>
      <div className="ts" onClick={e => e.stopPropagation()}>
        <div className="ts-grip" />

        <header className="ts-head">
          <h3>{cell.name}</h3>
          <p className="ts-meta">
            {cell.era}{cell.era && cell.region ? ' · ' : ''}{cell.region}
            {total ? <><span className="ts-dot">·</span>{total} atlikėjų</> : null}
          </p>
          {cell.essence && <p className="ts-ess">{cell.essence}</p>}
        </header>

        {artists === null ? (
          <div className="ts-grid">
            {Array.from({ length: 12 }).map((_, i) => <div key={i} className="ts-a ts-skel" />)}
          </div>
        ) : (
          <>
            {known.length > 0 && (
              <p className="ts-prog">
                Pažįsti <b>{known.length}</b> iš {total} — likusius dar dengia rūkas.
              </p>
            )}
            <div className="ts-grid">
              {list.map(a => (
                <button key={a.id} type="button"
                  className={`ts-a${a.k ? ' on ' + a.k : ''}`}
                  onClick={() => onDig(a.id, a.n)}
                  title={a.n}>
                  {a.img
                    ? <img src={a.img} alt="" referrerPolicy="no-referrer" loading="lazy" />
                    : <span className="ts-ph">♪</span>}
                  {a.k && <span className="ts-badge">{a.k === 'saved' ? '★' : a.k === 'visited' ? '✓' : '❤'}</span>}
                  <span className="ts-n">{a.n}</span>
                </button>
              ))}
            </div>
            {!showAll && (artists.length > 24) && (
              <button className="ts-more" type="button" onClick={() => setShowAll(true)}>
                Rodyti visus ({artists.length})
              </button>
            )}
          </>
        )}

        {(cell.near || []).length > 0 && (
          <div className="ts-near">
            <span className="ts-nearlbl">Kur eiti toliau</span>
            <div className="ts-nearrow">
              {(cell.near || []).map(n => (
                <button key={n.id} type="button" onClick={() => onNeighbour(n.id)}>{n.n}</button>
              ))}
            </div>
          </div>
        )}

        <button className="ts-close" type="button" onClick={onClose}>Uždaryti</button>
      </div>

      <style>{`
.ts-back { position: fixed; inset: 0; z-index: 70; background: rgba(6,9,14,0.72); backdrop-filter: blur(4px); display: flex; align-items: flex-end; justify-content: center; }
.ts { width: 100%; max-width: 560px; max-height: 88vh; overflow-y: auto; overscroll-behavior: contain; background: #151b24; border-radius: 20px 20px 0 0; padding: 10px 16px calc(18px + env(safe-area-inset-bottom)); }
@media (min-width: 640px) { .ts-back { align-items: center; } .ts { border-radius: 20px; max-height: 84vh; } }
.ts-grip { width: 34px; height: 3px; border-radius: 2px; background: rgba(255,255,255,0.18); margin: 2px auto 12px; }
.ts-head h3 { margin: 0; font-size: 19px; font-weight: 800; color: #eef3f9; letter-spacing: -0.01em; }
.ts-meta { margin: 3px 0 0; font-size: 12px; font-weight: 700; color: #7f8b9c; }
.ts-dot { margin: 0 6px; }
.ts-ess { margin: 8px 0 0; font-size: 13.5px; line-height: 1.5; color: #b6c1d0; }
.ts-prog { margin: 12px 0 6px; font-size: 12px; color: #8794a6; }
.ts-prog b { color: #e0632c; }
.ts-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 8px; margin-top: 12px; }
@media (max-width: 420px) { .ts-grid { grid-template-columns: repeat(3, 1fr); } }
.ts-a { position: relative; padding: 0; border: 0; background: #0e1219; border-radius: 12px; overflow: hidden; cursor: pointer; aspect-ratio: 1; display: flex; align-items: flex-end; }
.ts-a img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: grayscale(1) brightness(0.62); transition: filter 0.2s ease, transform 0.25s ease; }
.ts-a.on img { filter: none; }
.ts-a:hover img { transform: scale(1.06); filter: grayscale(0.25) brightness(0.9); }
.ts-a.on:hover img { filter: none; }
.ts-a.beacon { box-shadow: inset 0 0 0 2px #e0632c; }
.ts-a.visited, .ts-a.saved { box-shadow: inset 0 0 0 2px #3b86d8; }
.ts-ph { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #3c4653; font-size: 22px; }
.ts-badge { position: absolute; top: 5px; right: 5px; width: 18px; height: 18px; border-radius: 50%; background: rgba(10,14,20,0.82); color: #fff; font-size: 10px; display: flex; align-items: center; justify-content: center; }
.ts-n { position: relative; z-index: 1; width: 100%; padding: 14px 5px 4px; font-size: 10.5px; font-weight: 700; line-height: 1.2; color: #e6ecf3; text-align: left; background: linear-gradient(to top, rgba(8,11,16,0.92), rgba(8,11,16,0)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ts-skel { background: #0e1219; animation: tspulse 1.3s ease-in-out infinite; }
@keyframes tspulse { 0%,100% { opacity: 0.45 } 50% { opacity: 0.8 } }
.ts-more { width: 100%; margin-top: 10px; padding: 10px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); background: transparent; color: #b6c1d0; font-size: 13px; font-weight: 700; cursor: pointer; }
.ts-more:hover { background: rgba(255,255,255,0.05); }
.ts-near { margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.07); }
.ts-nearlbl { display: block; font-size: 11px; font-weight: 700; color: #7f8b9c; margin-bottom: 7px; }
.ts-nearrow { display: flex; flex-wrap: wrap; gap: 6px; }
.ts-nearrow button { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #d7e0ec; font-size: 12.5px; font-weight: 700; padding: 7px 11px; border-radius: 999px; cursor: pointer; min-height: 34px; }
.ts-nearrow button:hover { background: rgba(255,255,255,0.1); }
.ts-close { width: 100%; margin-top: 14px; padding: 12px; border-radius: 12px; border: 0; background: rgba(255,255,255,0.06); color: #9aa7b8; font-size: 13px; font-weight: 700; cursor: pointer; min-height: 44px; }
`}</style>
    </div>
  )
}
