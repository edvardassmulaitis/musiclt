'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'

export type FullEntry = {
  position: number
  prevPosition: number | null
  title: string
  artistName: string
  coverUrl: string | null
  href: string | null
  videoId: string | null
  query: string
  sources: string[]
}
export type FullChart = {
  title: string
  subtitle: string | null
  accent: string
  size: number
  attribution: string | null
  periodLabel: string | null
  sourceUrl: string | null
  isConsensus: boolean
  isAlbum: boolean
  sourceCharts: { title: string; slug: string }[]
}

function trendGlyph(pos: number, prev: number | null): { ch: string; cls: string } | null {
  if (prev == null) return { ch: 'NEW', cls: 'is-new' }
  if (prev > pos) return { ch: '▲', cls: 'is-up' }
  if (prev < pos) return { ch: '▼', cls: 'is-down' }
  return { ch: '–', cls: 'is-same' }
}

export default function ChartFullView({ chart, entries }: { chart: FullChart; entries: FullEntry[] }) {
  const [sel, setSel] = useState<number>(() => {
    const i = entries.findIndex(e => e.videoId)
    return i >= 0 ? i : 0
  })
  const [playing, setPlaying] = useState(false)
  const slotRef = useRef<HTMLDivElement>(null)   // JS-owned; JSX NIEKADA neranderina vaikų
  const playable = !chart.isAlbum
  const current = entries[sel]

  // Iframe kuriamas SINKRONIŠKAI click handler'yje (iOS autoplay patikimumui).
  // Slotas JSX'e tuščias → React nereconcilina iframe'o (stable wrapper pattern).
  const play = (idx: number) => {
    setSel(idx)
    setPlaying(true)
    if (!playable || !slotRef.current) return
    const e = entries[idx]
    const src = e.videoId
      ? `https://www.youtube.com/embed/${e.videoId}?autoplay=1&playsinline=1&rel=0&modestbranding=1`
      : `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(e.query)}&autoplay=1&playsinline=1&rel=0&modestbranding=1`
    slotRef.current.innerHTML = ''
    const f = document.createElement('iframe')
    f.src = src
    f.allow = 'autoplay; encrypted-media; picture-in-picture'
    f.allowFullscreen = true
    f.title = e.title
    slotRef.current.appendChild(f)
  }

  return (
    <div className="cfv" style={{ ['--c' as any]: chart.accent || '#6366f1' }}>
      <style>{styles}</style>

      <div className="cfv-head">
        <Link href="/topai" className="cfv-back">← Visi topai</Link>
        <h1 className="cfv-title">{chart.title}</h1>
        <div className="cfv-meta">
          <span className="cfv-size">TOP {chart.size}</span>
          {chart.periodLabel && <span className="cfv-attr">{chart.periodLabel}</span>}
        </div>
      </div>

      <div className={`cfv-body${playable ? '' : ' is-album'}`}>
        {/* Sąrašas */}
        <ol className="cfv-list">
          {entries.map((e, i) => {
            const t = trendGlyph(e.position, e.prevPosition)
            return (
              <li key={e.position} className={`cfv-row${i === sel && playable ? ' is-active' : ''}`}>
                <button className="cfv-rowmain" onClick={() => play(i)} type="button">
                  <span className="cfv-pos">{e.position}</span>
                  <span className="cfv-cover">
                    {e.coverUrl ? <img src={proxyImg(e.coverUrl, 120)} alt="" /> : <span className="cfv-ph">♪</span>}
                    {playable && <span className="cfv-play" aria-hidden>▶</span>}
                  </span>
                  <span className="cfv-info">
                    <span className="cfv-song">{e.title}</span>
                    <span className="cfv-artist">{e.artistName}</span>
                    {chart.isConsensus && e.sources.length > 0 && (
                      <span className="cfv-srcs">{e.sources.map(s => <span key={s} className="cfv-srcbadge">{s}</span>)}</span>
                    )}
                  </span>
                </button>
                {!chart.isConsensus && t && <span className={`cfv-trend ${t.cls}`}>{t.ch}</span>}
                {e.href && <Link href={e.href} className="cfv-go" title="Atidaryti puslapį">›</Link>}
              </li>
            )
          })}
        </ol>

        {/* Sticky player (tik dainų topams) */}
        {playable && (
          <aside className="cfv-aside">
            <div className="cfv-player">
              <div className="cfv-video">
                <div className="cfv-slot" ref={slotRef} />
                {!playing && (
                  <button className="cfv-poster" onClick={() => play(sel)} type="button" aria-label="Groti">
                    {current?.coverUrl
                      ? <img src={proxyImg(current.coverUrl, 320)} alt="" />
                      : <span className="cfv-video-ph">♪</span>}
                    <span className="cfv-bigplay">▶</span>
                  </button>
                )}
              </div>
              {current && (
                <div className="cfv-now">
                  <span className="cfv-now-song">{current.title}</span>
                  <span className="cfv-now-artist">{current.artistName}</span>
                </div>
              )}
              <p className="cfv-hint">Paspausk dainą sąraše — grojama čia.</p>
            </div>
          </aside>
        )}
      </div>

      {chart.isConsensus && chart.sourceCharts.length > 0 && (
        <div className="cfv-sources">
          <h2 className="cfv-sources-title">Sudaryta iš šaltinių</h2>
          <div className="cfv-sources-grid">
            {chart.sourceCharts.map(s => <Link key={s.slug} href={`/topai/${s.slug}`} className="cfv-source-link">{s.title} →</Link>)}
          </div>
        </div>
      )}
    </div>
  )
}

const styles = `
  .cfv { max-width: 1080px; margin: 0 auto; padding: 24px 16px 64px; }
  .cfv-back { display: inline-block; font-size: 13px; font-weight: 600; color: var(--text-muted); text-decoration: none; margin-bottom: 12px; }
  .cfv-back:hover { color: var(--c); }
  .cfv-title { margin: 0; font-family: 'Outfit', sans-serif; font-size: 28px; font-weight: 900; letter-spacing: -0.02em; color: var(--text-primary); }
  .cfv-meta { margin-top: 10px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12px; color: var(--text-muted); }
  .cfv-size { font-weight: 800; color: var(--c); background: color-mix(in srgb, var(--c) 12%, transparent); padding: 3px 9px; border-radius: 999px; }

  .cfv-body { margin-top: 18px; display: grid; grid-template-columns: 1fr 340px; gap: 24px; align-items: start; }
  .cfv-body.is-album { grid-template-columns: 1fr; max-width: 720px; }
  @media (max-width: 860px) { .cfv-body { grid-template-columns: 1fr; } }

  .cfv-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .cfv-row { display: flex; align-items: center; gap: 8px; border-radius: 12px; padding-right: 6px; }
  .cfv-row.is-active { background: color-mix(in srgb, var(--c) 10%, transparent); }
  .cfv-row:hover { background: color-mix(in srgb, var(--c) 6%, transparent); }
  .cfv-rowmain { flex: 1; min-width: 0; display: flex; align-items: center; gap: 13px; padding: 9px 8px; background: none; border: 0; cursor: pointer; text-align: left; color: inherit; font: inherit; }
  .cfv-pos { width: 30px; flex-shrink: 0; text-align: center; font-family: 'Outfit', sans-serif; font-size: 17px; font-weight: 800; color: var(--text-muted); font-variant-numeric: tabular-nums; }
  .cfv-cover { position: relative; width: 56px; height: 56px; flex-shrink: 0; border-radius: 10px; overflow: hidden; background: var(--bg-elevated); }
  .cfv-cover img { width: 100%; height: 100%; object-fit: cover; }
  .cfv-ph { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 18px; }
  .cfv-play { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.42); color: #fff; font-size: 16px; opacity: 0; transition: opacity .14s; }
  .cfv-rowmain:hover .cfv-play { opacity: 1; }
  .cfv-info { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 3px; }
  .cfv-song { font-size: 15px; font-weight: 700; color: var(--text-primary); line-height: 1.25; }
  .cfv-artist { font-size: 13px; color: var(--text-muted); }
  .cfv-srcs { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 3px; }
  .cfv-srcbadge { font-size: 9px; font-weight: 700; color: var(--text-muted); background: var(--bg-elevated); border: 1px solid var(--border-subtle); padding: 1px 6px; border-radius: 999px; }
  .cfv-trend { flex-shrink: 0; font-size: 11px; font-weight: 800; width: 30px; text-align: center; }
  .cfv-trend.is-up { color: #16a34a; } .cfv-trend.is-down { color: #dc2626; }
  .cfv-trend.is-same { color: var(--text-muted); } .cfv-trend.is-new { color: var(--c); font-size: 9px; }
  .cfv-go { flex-shrink: 0; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 700; color: var(--text-muted); text-decoration: none; border-radius: 8px; }
  .cfv-go:hover { color: var(--c); background: color-mix(in srgb, var(--c) 10%, transparent); }

  /* Sticky player */
  .cfv-aside { position: sticky; top: 76px; }
  .cfv-player { border: 1px solid var(--border-subtle); border-radius: 16px; overflow: hidden; background: var(--bg-surface); }
  .cfv-video { position: relative; aspect-ratio: 16/9; background: #000; }
  .cfv-slot { position: absolute; inset: 0; }
  .cfv-slot iframe { width: 100%; height: 100%; border: 0; display: block; }
  .cfv-poster { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; padding: 0; cursor: pointer; background: #000; }
  .cfv-poster img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .cfv-video-ph { display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; color: #555; font-size: 30px; }
  .cfv-bigplay { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 58px; height: 58px; border-radius: 50%; background: rgba(0,0,0,0.6); color: #fff; font-size: 20px; display: flex; align-items: center; justify-content: center; padding-left: 4px; }
  .cfv-now { padding: 12px 14px 4px; }
  .cfv-now-song { display: block; font-size: 14px; font-weight: 700; color: var(--text-primary); }
  .cfv-now-artist { display: block; font-size: 12.5px; color: var(--text-muted); }
  .cfv-hint { margin: 6px 14px 14px; font-size: 11px; color: var(--text-muted); }

  /* Šaltiniai */
  .cfv-sources { margin-top: 28px; padding-top: 20px; border-top: 1px solid var(--border-subtle); }
  .cfv-sources-title { margin: 0 0 12px; font-family: 'Outfit', sans-serif; font-size: 15px; font-weight: 800; color: var(--text-secondary); }
  .cfv-sources-grid { display: flex; flex-wrap: wrap; gap: 8px; }
  .cfv-source-link { font-size: 12.5px; font-weight: 700; color: var(--c); text-decoration: none; padding: 7px 12px; border: 1px solid var(--border-subtle); border-radius: 10px; }
  .cfv-source-link:hover { background: color-mix(in srgb, var(--c) 8%, transparent); border-color: var(--c); }
`
