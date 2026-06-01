import { Metadata } from 'next'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase'
import { getCurrentWeekMonday } from '@/lib/top-week'
import { proxyImg } from '@/lib/img-proxy'

export const metadata: Metadata = {
  title: 'Muzikos topai — Lietuva ir pasaulis | music.lt',
  description: 'Visi muzikos topai vienoje vietoje — music.lt TOP 40 ir LT TOP 30, Lietuvos ir pasaulio dainų bei albumų reitingai.',
}

export const dynamic = 'force-dynamic'

/* ───────────────────────────── Types ───────────────────────────── */
type Entry = { position: number; title: string; artistName: string; coverUrl: string | null }
type Card = {
  key: string; title: string; href: string; country: string | null
  coverImageUrl: string | null; accent: string | null
  entries: Entry[]; sources: { label: string; slug: string }[]
}

const SOURCE_LINKS: Record<string, { label: string; slug: string }[]> = {
  lt: [{ label: 'AGATA', slug: 'agata-singles' }, { label: 'Apple Music', slug: 'apple-lt_songs' }, { label: 'Spotify', slug: 'spotify-lt' }, { label: 'M.A.M.A', slug: 'mama-top40' }],
  us: [{ label: 'Apple Music', slug: 'apple-us_songs' }, { label: 'Spotify', slug: 'spotify-us' }, { label: 'Billboard', slug: 'billboard-hot100' }],
  uk: [{ label: 'Apple Music', slug: 'apple-gb_songs' }, { label: 'Spotify', slug: 'spotify-uk' }, { label: 'Official UK', slug: 'official_uk-singles' }],
  world: [{ label: 'Spotify', slug: 'spotify-global' }, { label: 'Billboard', slug: 'billboard-global200' }],
  albums: [{ label: 'Billboard 200', slug: 'billboard-albums' }, { label: 'Official UK', slug: 'official_uk-albums' }],
}

function ytThumb(url: string | null | undefined): string | null {
  if (!url) return null
  const m = String(url).match(/(?:v=|youtu\.be\/|embed\/|shorts\/|\/vi\/)([\w-]{11})/)
  return m ? `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` : null
}

async function getMiniChart(sb: any, topType: string, limit = 5): Promise<Entry[]> {
  const monday = getCurrentWeekMonday()
  const { data: week } = await sb.from('top_weeks').select('id, is_finalized')
    .eq('top_type', topType).eq('week_start', monday).maybeSingle()
  if (!week) return []
  const { data: rows } = await sb.from('top_entries')
    .select('position, total_votes, tracks:track_id ( slug, title, cover_url, artists:artist_id ( slug, name ) )')
    .eq('week_id', week.id)
    .order(week.is_finalized ? 'position' : 'total_votes', { ascending: !!week.is_finalized })
    .limit(limit)
  return (rows || []).map((r: any, i: number) => {
    const tr = Array.isArray(r.tracks) ? r.tracks[0] : r.tracks
    const ar = tr ? (Array.isArray(tr.artists) ? tr.artists[0] : tr.artists) : null
    return { position: r.position ?? i + 1, title: tr?.title ?? '—', artistName: ar?.name ?? '—', coverUrl: tr?.cover_url ?? null }
  })
}

async function getExternalCharts(sb: any) {
  const { data: charts } = await sb.from('external_charts')
    .select('id, source, chart_key, title, country, cover_image_url')
    .eq('is_current', true)
  if (!charts || charts.length === 0) return new Map<string, any>()
  const ids = charts.map((c: any) => c.id)
  const { data: entries } = await sb.from('external_chart_entries')
    .select(`chart_id, position, artist_name, title, cover_url,
      tracks:track_id ( cover_url, video_url ), albums:album_id ( cover_image_url )`)
    .in('chart_id', ids).lte('position', 5).order('position', { ascending: true })
  const byChart = new Map<number, Entry[]>()
  for (const e of (entries || []) as any[]) {
    const tr = Array.isArray(e.tracks) ? e.tracks[0] : e.tracks
    const al = Array.isArray(e.albums) ? e.albums[0] : e.albums
    const arr = byChart.get(e.chart_id) || []
    arr.push({ position: e.position, title: e.title, artistName: e.artist_name, coverUrl: tr?.cover_url || al?.cover_image_url || ytThumb(tr?.video_url) || e.cover_url || null })
    byChart.set(e.chart_id, arr)
  }
  const map = new Map<string, any>()
  for (const c of charts as any[]) {
    map.set(`${c.source}-${c.chart_key}`, { title: c.title, country: c.country, coverImageUrl: c.cover_image_url, entries: byChart.get(c.id) || [] })
  }
  return map
}

function toCard(map: Map<string, any>, slug: string, opts: { sourcesKey?: string; title?: string; country?: string | null } = {}): Card | null {
  const c = map.get(slug)
  if (!c || c.entries.length === 0) return null
  return {
    key: slug, title: opts.title || c.title, href: `/topai/${slug}`,
    country: opts.country !== undefined ? opts.country : c.country,
    coverImageUrl: c.coverImageUrl || null, accent: null, entries: c.entries,
    sources: opts.sourcesKey ? (SOURCE_LINKS[opts.sourcesKey] || []) : [],
  }
}

/* ───────────────────────────── Page ───────────────────────────── */
export default async function TopaiHubPage() {
  const sb = createAdminClient()
  const [top40, top30, ext] = await Promise.all([
    getMiniChart(sb, 'top40', 5),
    getMiniChart(sb, 'lt_top30', 5),
    getExternalCharts(sb),
  ])

  const mainCards: Card[] = [
    { key: 'top40', title: 'TOP 40', href: '/top40', country: null, coverImageUrl: null, accent: '#f97316', entries: top40, sources: [] },
    { key: 'top30', title: 'LT TOP 30', href: '/top30', country: 'LT', coverImageUrl: null, accent: '#22c55e', entries: top30, sources: [] },
  ]

  const songCards: Card[] = [
    toCard(ext, 'consensus-world', { sourcesKey: 'world' }),
    toCard(ext, 'consensus-lt', { sourcesKey: 'lt' }),
    toCard(ext, 'consensus-us', { sourcesKey: 'us' }),
    toCard(ext, 'consensus-uk', { sourcesKey: 'uk', title: 'UK TOP 100' }),
    toCard(ext, 'shazam-world'),
    toCard(ext, 'shazam-lt'),
  ].filter(Boolean) as Card[]

  const albumCards: Card[] = [
    toCard(ext, 'consensus-albums', { sourcesKey: 'albums' }),
    toCard(ext, 'agata-albums', { title: 'Lietuvos albumai' }),
  ].filter(Boolean) as Card[]

  return (
    <div className="tp">
      <style>{styles}</style>

      <header className="tp-hero"><h1 className="tp-hero-title">Muzikos topai</h1></header>

      <div className="tp-grid">
        {mainCards.map(c => <ChartCard key={c.key} card={c} cta="Žiūrėti →" />)}
      </div>

      {songCards.length > 0 && (
        <section className="tp-section">
          <h2 className="tp-sec-title">Dainų topai</h2>
          <div className="tp-grid">{songCards.map(c => <ChartCard key={c.key} card={c} cta="Pilnas →" />)}</div>
        </section>
      )}

      {albumCards.length > 0 && (
        <section className="tp-section">
          <h2 className="tp-sec-title">Albumų topai</h2>
          <div className="tp-grid">{albumCards.map(c => <ChartCard key={c.key} card={c} cta="Pilnas →" />)}</div>
        </section>
      )}
    </div>
  )
}

/* ───────────────────────────── Flag ───────────────────────────── */
function Flag({ country, image }: { country: string | null; image: string | null }) {
  if (image) return <span className="tp-flag" style={{ backgroundImage: `url(${proxyImg(image, 120)})` }} />
  const cc = (country || '').toLowerCase()
  if (cc === 'lt' || cc === 'us' || cc === 'gb')
    return <span className="tp-flag" style={{ backgroundImage: `url(https://flagcdn.com/w80/${cc}.png)` }} />
  return (
    <span className="tp-flag tp-flag-globe">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></svg>
    </span>
  )
}

/* ───────────────────────────── ChartCard (spacious list) ───────────────────────────── */
function ChartCard({ card, cta }: { card: Card; cta: string }) {
  const accent = card.accent
  const entries = card.entries.slice(0, 5)
  return (
    <div className={`tc${accent ? ' tc-brand' : ''}`} style={accent ? { ['--c' as any]: accent } : undefined}>
      <Link href={card.href} className="tc-main">
        <div className="tc-head">
          <Flag country={card.country} image={card.coverImageUrl} />
          <span className="tc-title">{card.title}</span>
          <span className="tc-cta">{cta}</span>
        </div>
        {entries.length === 0 ? (
          <div className="tc-empty">Sąrašas formuojasi</div>
        ) : (
          <ol className="tc-list">
            {entries.map(e => (
              <li key={e.position} className={`tc-row${e.position === 1 ? ' tc-row-1' : ''}`}>
                <span className="tc-pos">{e.position}</span>
                <span className="tc-cv">{e.coverUrl ? <img src={proxyImg(e.coverUrl, 96)} alt="" /> : <span className="tc-ph">♪</span>}</span>
                <span className="tc-meta">
                  <span className="tc-song">{e.title}</span>
                  <span className="tc-artist">{e.artistName}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </Link>
      {card.sources.length > 0 && (
        <div className="tc-srcs">
          <span className="tc-srcs-label">Šaltiniai:</span>
          {card.sources.map((s, i) => (
            <span key={s.slug}>{i > 0 && <span className="tc-sep">·</span>}<Link href={`/topai/${s.slug}`} className="tc-src">{s.label}</Link></span>
          ))}
        </div>
      )}
    </div>
  )
}

/* ───────────────────────────── Styles ───────────────────────────── */
const styles = `
  .tp { max-width: 1120px; margin: 0 auto; padding: 40px 20px 80px; color: var(--text-primary); font-family: 'DM Sans', sans-serif; }
  .tp-hero { margin-bottom: 22px; }
  .tp-hero-title { margin: 0; font-family: 'Outfit', sans-serif; font-size: clamp(28px, 5vw, 44px); font-weight: 900; letter-spacing: -0.03em; }

  .tp-section { margin-top: 34px; }
  .tp-sec-title { margin: 0 0 14px; font-family: 'Outfit', sans-serif; font-size: 19px; font-weight: 800; letter-spacing: -0.02em; }

  .tp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 760px) { .tp-grid { grid-template-columns: 1fr; } }

  .tc { display: flex; flex-direction: column; border-radius: 16px; background: var(--bg-surface); border: 1px solid var(--border-subtle); overflow: hidden; transition: transform .16s, box-shadow .16s, border-color .16s; }
  .tc:hover { transform: translateY(-2px); box-shadow: 0 18px 38px rgba(0,0,0,0.10); border-color: var(--border-default); }
  .tc-brand { --c: #6366f1; }
  .tc-brand:hover { border-color: var(--c); }
  .tc-main { display: flex; flex-direction: column; padding: 16px 16px 8px; text-decoration: none; color: inherit; }

  .tc-head { display: flex; align-items: center; gap: 11px; margin-bottom: 12px; }
  .tc-flag { width: 40px; height: 28px; flex-shrink: 0; border-radius: 6px; background-size: cover; background-position: center; box-shadow: 0 0 0 1px var(--border-subtle); display: inline-block; }
  .tc-flag-globe { display: inline-flex; align-items: center; justify-content: center; background: var(--bg-elevated); color: var(--text-muted); }
  .tc-title { flex: 1; min-width: 0; font-family: 'Outfit', sans-serif; font-size: 18px; font-weight: 800; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tc-brand .tc-title { color: var(--c); }
  .tc-cta { flex-shrink: 0; font-size: 12px; font-weight: 700; color: var(--text-muted); }
  .tc:hover .tc-cta { color: var(--text-secondary); }

  .tc-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  .tc-row { display: flex; align-items: center; gap: 12px; padding: 7px 0; border-radius: 10px; }
  .tc-row + .tc-row { border-top: 1px solid var(--border-subtle); }
  .tc-pos { width: 20px; flex-shrink: 0; text-align: center; font-family: 'Outfit', sans-serif; font-size: 15px; font-weight: 800; color: var(--text-muted); font-variant-numeric: tabular-nums; }
  .tc-row-1 .tc-pos { color: var(--text-secondary); }
  .tc-cv { width: 46px; height: 46px; flex-shrink: 0; border-radius: 8px; overflow: hidden; background: var(--bg-elevated); }
  .tc-cv img { width: 100%; height: 100%; object-fit: cover; }
  .tc-ph { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 16px; }
  .tc-meta { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .tc-song { font-size: 14px; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tc-artist { font-size: 12.5px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .tc-empty { padding: 30px 0; text-align: center; color: var(--text-muted); font-size: 13px; }

  .tc-srcs { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; padding: 10px 16px; margin-top: auto; border-top: 1px solid var(--border-subtle); background: var(--bg-elevated); }
  .tc-srcs-label { font-size: 11px; font-weight: 700; color: var(--text-muted); margin-right: 2px; }
  .tc-src { font-size: 11.5px; font-weight: 600; color: var(--text-secondary); text-decoration: none; }
  .tc-src:hover { color: var(--text-primary); text-decoration: underline; }
  .tc-sep { font-size: 11px; color: var(--text-muted); margin-right: 5px; }
`
