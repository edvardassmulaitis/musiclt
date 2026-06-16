'use client'

import { useState } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import { ChartYtPlayer } from '@/components/ChartYtPlayer'

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
  country: string | null   // šalies kodas vėliavai (null → pasaulio ikona)
  sourceCharts: { title: string; slug: string }[]
}

/* Vėliava header'yje — kaip /topai kortelėse. 2 raidžių kodas → flagcdn,
   kitaip (pasaulis/global) → švari linijinė ikona. */
const FLAG_ALIAS: Record<string, string> = { uk: 'gb', en: 'gb' }
function Flag({ country }: { country: string | null }) {
  let cc = (country || '').toLowerCase()
  cc = FLAG_ALIAS[cc] || cc
  if (/^[a-z]{2}$/.test(cc))
    return <span className="cfv-pflag" style={{ backgroundImage: `url(https://flagcdn.com/w40/${cc}.png)` }} aria-hidden />
  return (
    <span className="cfv-pflag cfv-pflag-globe" aria-hidden>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M3.5 9.5h17M3.5 14.5h17" /><path d="M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18" /></svg>
    </span>
  )
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
  const playable = !chart.isAlbum
  const current = entries[sel]

  // Grojimą valdo bendras ChartYtPlayer (YT IFrame API). Čia tik parenkam
  // dainą + playing=true; track switch'ai per loadVideoById player'io viduje.
  const play = (idx: number) => {
    setSel(idx)
    setPlaying(true)
  }
  // Pasibaigus dainai — kita su video/užklausa (rollover).
  const advanceNext = () => {
    for (let i = 1; i <= entries.length; i++) {
      const cand = entries[(sel + i) % entries.length]
      if (cand && (cand.videoId || cand.query)) { play((sel + i) % entries.length); return }
    }
  }

  return (
    <div className="cfv" style={{ ['--c' as any]: chart.accent || '#6366f1' }}>
      <style>{styles}</style>

      <div className={`cfv-body${playable ? '' : ' is-album'}`}>
        {/* Player — viršuje (mobile) / dešinėje (desktop), prilimpa prie viršaus.
            Topo pavadinimas uždėtas ant player'io (nebėra atskiro bulky header'io). */}
        {playable && (
          <aside className="cfv-aside">
            <div className="cfv-player">
              {/* Topo pavadinimas — header juosta VIRŠ player'io (ne overlay ant
                  video, kad gerai skaitytųsi). */}
              <div className="cfv-phead"><Flag country={chart.country} /><h1 className="cfv-h1">{chart.title}</h1></div>
              <ChartYtPlayer
                videoId={current?.videoId ?? null}
                query={current?.query}
                playing={playing}
                posterUrl={current?.coverUrl ? proxyImg(current.coverUrl, 320) : null}
                accentHex={chart.accent || '#f97316'}
                title={current?.title}
                onActivate={() => setPlaying(true)}
                onEnded={advanceNext}
              />
            </div>
          </aside>
        )}

        {/* Albumų topai — be player'io; pavadinimas atskirame bloke (SEO h1). */}
        {!playable && (
          <div className="cfv-albumhead">
            <Flag country={chart.country} /><h1 className="cfv-h1 cfv-h1-dark">{chart.title}</h1>
          </div>
        )}

        {/* Sąrašas */}
        <ol className="cfv-list">
          {entries.map((e, i) => {
            const t = trendGlyph(e.position, e.prevPosition)
            return (
              <li key={e.position} className={`cfv-row${i === sel && playable ? ' is-active' : ''}`}>
                <button className="cfv-rowmain" onClick={() => play(i)} type="button" title={playable ? 'Groti' : undefined}>
                  <span className="cfv-pos">{e.position}</span>
                  <span className="cfv-cover">
                    {e.coverUrl ? <img src={proxyImg(e.coverUrl, 120)} alt="" /> : <span className="cfv-ph">♪</span>}
                    {playable && <span className="cfv-play" aria-hidden>▶</span>}
                  </span>
                  <span className="cfv-info">
                    <span className="cfv-song">{e.title}</span>
                    <span className="cfv-artist">{e.artistName}</span>
                  </span>
                </button>
                {!chart.isConsensus && t && <span className={`cfv-trend ${t.cls}`}>{t.ch}</span>}
                {e.href && <Link href={e.href} className="cfv-go" title="Atidaryti puslapį">›</Link>}
              </li>
            )
          })}
        </ol>
      </div>

      {chart.isConsensus && chart.sourceCharts.length > 0 && (
        <div className="cfv-sources">
          <h2 className="cfv-sources-title">Sudaryta iš šaltinių</h2>
          <div className="cfv-sources-grid">
            {chart.sourceCharts.map(s => <Link key={s.slug} href={`/topai/${s.slug}`} className="cfv-source-link">{s.title} →</Link>)}
          </div>
        </div>
      )}

      {/* Atnaujinimo data — apačioje prie info apie topą (perkelta nuo player'io). */}
      {chart.periodLabel && <p className="cfv-foot">Atnaujinta {chart.periodLabel}</p>}
    </div>
  )
}

const styles = `
  .cfv { max-width: 1080px; margin: 0 auto; padding: 16px 16px 64px; }

  /* Desktop: sąrašas kairėje, player dešinėje (nors DOM'e player pirmas). */
  .cfv-body { display: grid; grid-template-columns: 1fr 340px; gap: 24px; align-items: start; }
  .cfv-aside { grid-column: 2; grid-row: 1; position: sticky; top: 64px; }
  .cfv-list { grid-column: 1; grid-row: 1; }
  .cfv-body.is-album { grid-template-columns: 1fr; max-width: 720px; }
  .cfv-albumhead { display: flex; flex-direction: row; align-items: center; gap: 12px; margin-bottom: 6px; }
  /* Mobile: player viršuje + prilimpa prie viršaus, iškart po jo — sąrašas. */
  @media (max-width: 860px) {
    .cfv-body { display: flex; flex-direction: column; align-items: stretch; gap: 14px; }
    .cfv-aside { grid-column: auto; grid-row: auto; position: sticky; top: 56px; z-index: 5; margin: 0 -16px; width: auto; }
    .cfv-player { border-radius: 0; border-left: 0; border-right: 0; }
  }

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

  /* Player */
  .cfv-player { border: 1px solid var(--border-subtle); border-radius: 16px; overflow: hidden; background: var(--bg-surface); box-shadow: 0 10px 30px rgba(0,0,0,0.10); }
  .cfv-video { position: relative; aspect-ratio: 16/9; background: #000; }
  .cfv-slot { position: absolute; inset: 0; }
  .cfv-slot iframe { width: 100%; height: 100%; border: 0; display: block; }
  .cfv-poster { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; padding: 0; cursor: pointer; background: #000; }
  .cfv-poster img { width: 100%; height: 100%; object-fit: cover; display: block; opacity: 0.85; }
  .cfv-video-ph { display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; color: #555; font-size: 30px; }
  .cfv-bigplay { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 58px; height: 58px; border-radius: 50%; background: rgba(0,0,0,0.6); color: #fff; font-size: 20px; display: flex; align-items: center; justify-content: center; padding-left: 4px; }
  /* Topo pavadinimas — header juosta VIRŠ video (gerai skaitosi, ne overlay). */
  .cfv-phead { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--border-subtle); background: var(--bg-surface); }
  .cfv-pflag { width: 26px; height: 18px; flex-shrink: 0; border-radius: 4px; background-size: cover; background-position: center; box-shadow: 0 0 0 1px var(--border-subtle); display: inline-block; }
  .cfv-pflag-globe { display: inline-flex; align-items: center; justify-content: center; background: var(--bg-elevated); color: var(--text-muted); }
  .cfv-h1 { margin: 0; flex: 1; min-width: 0; font-family: 'Outfit', sans-serif; font-size: 16px; font-weight: 800; letter-spacing: -0.015em; line-height: 1.2; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cfv-albumhead .cfv-pflag { width: 34px; height: 23px; }
  .cfv-albumhead .cfv-h1 { flex: 0 1 auto; }
  .cfv-h1-dark { font-size: 24px; font-weight: 900; white-space: normal; }
  /* Atnaujinimo data — page footer'is. */
  .cfv-foot { margin: 18px 0 0; font-size: 12px; color: var(--text-muted); }

  /* Šaltiniai */
  .cfv-sources { margin-top: 28px; padding-top: 20px; border-top: 1px solid var(--border-subtle); }
  .cfv-sources-title { margin: 0 0 12px; font-family: 'Outfit', sans-serif; font-size: 15px; font-weight: 800; color: var(--text-secondary); }
  .cfv-sources-grid { display: flex; flex-wrap: wrap; gap: 8px; }
  .cfv-source-link { font-size: 12.5px; font-weight: 700; color: var(--c); text-decoration: none; padding: 7px 12px; border: 1px solid var(--border-subtle); border-radius: 10px; }
  .cfv-source-link:hover { background: color-mix(in srgb, var(--c) 8%, transparent); border-color: var(--c); }
`
