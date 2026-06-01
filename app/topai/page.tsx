import { Metadata } from 'next'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase'
import { getCurrentWeekMonday } from '@/lib/top-week'
import { proxyImg } from '@/lib/img-proxy'

export const metadata: Metadata = {
  title: 'Muzikos topai — Lietuva ir pasaulis | music.lt',
  description: 'Visi muzikos topai vienoje vietoje — music.lt TOP 40 ir LT TOP 30, Lietuvos ir pasaulio reitingai, albumai bei trendai.',
}

export const dynamic = 'force-dynamic'

/* ───────────────────────────── Types ───────────────────────────── */
type Entry = { position: number; title: string; artistName: string; coverUrl: string | null }
type Card = {
  key: string
  title: string
  href: string
  country: string | null
  coverImageUrl: string | null
  accent: string | null          // tik brand kortelėms (TOP40/30); kitos neutralios
  entries: Entry[]
  sources: { label: string; slug: string }[]
}

/* Konsensuso šaltinių nuorodos (atitinka scraper/charts/consensus.py grupes). */
const SOURCE_LINKS: Record<string, { label: string; slug: string }[]> = {
  lt: [{ label: 'AGATA', slug: 'agata-singles' }, { label: 'Apple Music', slug: 'apple-lt_songs' }, { label: 'Spotify', slug: 'spotify-lt' }, { label: 'M.A.M.A', slug: 'mama-top40' }],
  us: [{ label: 'Apple Music', slug: 'apple-us_songs' }, { label: 'Spotify', slug: 'spotify-us' }, { label: 'Billboard', slug: 'billboard-hot100' }],
  uk: [{ label: 'Apple Music', slug: 'apple-gb_songs' }, { label: 'Spotify', slug: 'spotify-uk' }, { label: 'Official UK', slug: 'official_uk-singles' }],
  world: [{ label: 'Spotify', slug: 'spotify-global' }, { label: 'Billboard', slug: 'billboard-global200' }],
  trending_lt: [{ label: 'Shazam', slug: 'shazam-lt' }, { label: 'YouTube', slug: 'youtube-lt_music' }],
  trending_global: [{ label: 'Shazam', slug: 'shazam-world' }, { label: 'YouTube', slug: 'youtube-us_music' }],
}

function ytThumb(url: string | null | undefined): string | null {
  if (!url) return null
  const m = String(url).match(/(?:v=|youtu\.be\/|embed\/|shorts\/|\/vi\/)([\w-]{11})/)
  return m ? `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` : null
}

/* ───────────────────────── Native voting charts ───────────────────────── */
async function getMiniChart(sb: any, topType: string, limit = 6): Promise<Entry[]> {
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

/* ───────────────────── External charts ───────────────────── */
async function getExternalCharts(sb: any) {
  const { data: charts } = await sb
    .from('external_charts')
    .select('id, source, chart_key, title, country, cover_image_url')
    .eq('is_current', true)
  if (!charts || charts.length === 0) return new Map<string, any>()

  const ids = charts.map((c: any) => c.id)
  const { data: entries } = await sb
    .from('external_chart_entries')
    .select(`chart_id, position, artist_name, title, cover_url,
      tracks:track_id ( cover_url, video_url ), albums:album_id ( cover_image_url )`)
    .in('chart_id', ids)
    .lte('position', 12)
    .order('position', { ascending: true })

  const byChart = new Map<number, Entry[]>()
  for (const e of (entries || []) as any[]) {
    const tr = Array.isArray(e.tracks) ? e.tracks[0] : e.tracks
    const al = Array.isArray(e.albums) ? e.albums[0] : e.albums
    const arr = byChart.get(e.chart_id) || []
    arr.push({
      position: e.position, title: e.title, artistName: e.artist_name,
      coverUrl: tr?.cover_url || al?.cover_image_url || ytThumb(tr?.video_url) || e.cover_url || null,
    })
    byChart.set(e.chart_id, arr)
  }
  const map = new Map<string, any>()
  for (const c of charts as any[]) {
    map.set(`${c.source}-${c.chart_key}`, {
      title: c.title, country: c.country, coverImageUrl: c.cover_image_url,
      chartKey: c.chart_key, entries: byChart.get(c.id) || [],
    })
  }
  return map
}

function toCard(map: Map<string, any>, slug: string, opts: { sourcesKey?: string } = {}): Card | null {
  const c = map.get(slug)
  if (!c || c.entries.length === 0) return null
  return {
    key: slug, title: c.title, href: `/topai/${slug}`, country: c.country,
    coverImageUrl: c.coverImageUrl || null, accent: null, entries: c.entries,
    sources: opts.sourcesKey ? (SOURCE_LINKS[opts.sourcesKey] || []) : [],
  }
}

/* ───────────────────────────── Page ───────────────────────────── */
export default async function TopaiHubPage() {
  const sb = createAdminClient()
  const [top40, top30, ext] = await Promise.all([
    getMiniChart(sb, 'top40', 6),
    getMiniChart(sb, 'lt_top30', 6),
    getExternalCharts(sb),
  ])

  const mainCards: Card[] = [
    { key: 'top40', title: 'TOP 40', href: '/top40', country: null, coverImageUrl: null, accent: '#f97316', entries: top40, sources: [] },
    { key: 'top30', title: 'LT TOP 30', href: '/top30', country: 'LT', coverImageUrl: null, accent: '#22c55e', entries: top30, sources: [] },
  ]

  const lt: Card[] = [
    toCard(ext, 'consensus-lt', { sourcesKey: 'lt' }),
    toCard(ext, 'agata-albums'),
    toCard(ext, 'consensus-trending_lt', { sourcesKey: 'trending_lt' }),
  ].filter(Boolean) as Card[]

  const world: Card[] = [
    toCard(ext, 'consensus-world', { sourcesKey: 'world' }),
    toCard(ext, 'consensus-us', { sourcesKey: 'us' }),
    toCard(ext, 'consensus-uk', { sourcesKey: 'uk' }),
    toCard(ext, 'billboard-albums'),
    toCard(ext, 'official_uk-albums'),
    toCard(ext, 'consensus-trending_global', { sourcesKey: 'trending_global' }),
  ].filter(Boolean) as Card[]

  return (
    <div className="tp">
      <style>{styles}</style>

      <header className="tp-hero">
        <div className="tp-hero-badge"><span className="tp-hero-dot" /> Atnaujinama kas savaitę</div>
        <h1 className="tp-hero-title">Muzikos topai</h1>
      </header>

      {/* music.lt nuosavi (brand) */}
      <div className="tp-main-grid">
        {mainCards.map(c => <ChartCard key={c.key} card={c} variant="strip" count={5} cta="Žiūrėti →" />)}
      </div>

      {lt.length > 0 && (
        <section className="tp-section">
          <h2 className="tp-sec-title">Lietuva</h2>
          <div className="tp-grid">{lt.map(c => <ChartCard key={c.key} card={c} variant="collage" count={10} cta="Pilnas →" />)}</div>
        </section>
      )}

      {world.length > 0 && (
        <section className="tp-section">
          <h2 className="tp-sec-title">Pasaulis</h2>
          <div className="tp-grid">{world.map(c => <ChartCard key={c.key} card={c} variant="collage" count={10} cta="Pilnas →" />)}</div>
        </section>
      )}
    </div>
  )
}

/* ───────────────────────────── Flag ───────────────────────────── */
function Flag({ country, image }: { country: string | null; image: string | null }) {
  if (image) return <span className="tp-flag" style={{ backgroundImage: `url(${proxyImg(image, 96)})` }} />
  const cc = (country || '').toLowerCase()
  if (cc === 'lt' || cc === 'us' || cc === 'gb')
    return <span className="tp-flag" style={{ backgroundImage: `url(https://flagcdn.com/w80/${cc}.png)` }} />
  // Pasaulis / be šalies — gaublys
  return (
    <span className="tp-flag tp-flag-globe">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></svg>
    </span>
  )
}

/* ───────────────────────────── ChartCard ───────────────────────────── */
function ChartCard({ card, variant, count, cta }: {
  card: Card; variant: 'strip' | 'collage'; count: number; cta: string
}) {
  const accent = card.accent
  const entries = card.entries.slice(0, count)
  const empty = entries.length === 0

  return (
    <div className={`tc${accent ? ' tc-brand' : ''}`} style={accent ? { ['--c' as any]: accent } : undefined}>
      <Link href={card.href} className="tc-main">
        <div className="tc-head">
          <Flag country={card.country} image={card.coverImageUrl} />
          <span className="tc-title">{card.title}</span>
          <span className="tc-cta">{cta}</span>
        </div>

        {empty ? (
          <div className="tc-empty">Sąrašas formuojasi</div>
        ) : variant === 'strip' ? (
          <div className="tc-strip">
            {entries.map(e => (
              <span key={e.position} className="tc-scv" title={`${e.position}. ${e.artistName} – ${e.title}`}>
                {e.coverUrl ? <img src={proxyImg(e.coverUrl, 120)} alt="" /> : <span className="tc-ph">♪</span>}
                <span className="tc-rank">{e.position}</span>
              </span>
            ))}
          </div>
        ) : (
          <div className="tc-collage">
            <span className="tc-hero-cv" title={entries[0] ? `1. ${entries[0].artistName} – ${entries[0].title}` : ''}>
              {entries[0]?.coverUrl ? <img src={proxyImg(entries[0].coverUrl, 200)} alt="" /> : <span className="tc-ph">♪</span>}
              <span className="tc-rank">1</span>
            </span>
            <div className="tc-rest">
              {entries.slice(1).map(e => (
                <span key={e.position} className="tc-rcv" title={`${e.position}. ${e.artistName} – ${e.title}`}>
                  {e.coverUrl ? <img src={proxyImg(e.coverUrl, 88)} alt="" /> : <span className="tc-ph">♪</span>}
                  <span className="tc-rank tc-rank-sm">{e.position}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </Link>

      {card.sources.length > 0 && (
        <div className="tc-srcs">
          {card.sources.map((s, i) => (
            <span key={s.slug}>
              {i > 0 && <span className="tc-sep">·</span>}
              <Link href={`/topai/${s.slug}`} className="tc-src">{s.label}</Link>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/* ───────────────────────────── Styles ───────────────────────────── */
const styles = `
  .tp { max-width: 1180px; margin: 0 auto; padding: 40px 20px 80px; color: var(--text-primary); font-family: 'DM Sans', sans-serif; }

  .tp-hero { margin-bottom: 26px; }
  .tp-hero-badge { display: inline-flex; align-items: center; gap: 7px; padding: 5px 12px; border-radius: 999px; margin-bottom: 14px; background: var(--bg-elevated); border: 1px solid var(--border-subtle); font-size: 11.5px; font-weight: 700; color: var(--text-muted); }
  .tp-hero-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent-green); box-shadow: 0 0 0 3px rgba(34,197,94,0.18); }
  .tp-hero-title { margin: 0; font-family: 'Outfit', sans-serif; font-size: clamp(28px, 5vw, 44px); font-weight: 900; letter-spacing: -0.03em; }

  .tp-section { margin-top: 36px; }
  .tp-sec-title { margin: 0 0 14px; font-family: 'Outfit', sans-serif; font-size: 18px; font-weight: 800; letter-spacing: -0.02em; }

  .tp-main-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  @media (max-width: 760px) { .tp-main-grid { grid-template-columns: 1fr; } }
  .tp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; }

  /* Card */
  .tc { display: flex; flex-direction: column; border-radius: 14px; background: var(--bg-surface); border: 1px solid var(--border-subtle); overflow: hidden; transition: transform .16s, box-shadow .16s, border-color .16s; }
  .tc:hover { transform: translateY(-2px); box-shadow: 0 16px 34px rgba(0,0,0,0.09); border-color: var(--border-default); }
  .tc-brand { --c: #6366f1; }
  .tc-brand:hover { border-color: var(--c); }
  .tc-main { display: flex; flex-direction: column; gap: 12px; padding: 14px; text-decoration: none; color: inherit; }

  .tc-head { display: flex; align-items: center; gap: 10px; }
  .tc-flag { width: 34px; height: 24px; flex-shrink: 0; border-radius: 5px; background-size: cover; background-position: center; box-shadow: 0 0 0 1px var(--border-subtle); display: inline-block; }
  .tc-flag-globe { display: inline-flex; align-items: center; justify-content: center; background: var(--bg-elevated); color: var(--text-muted); }
  .tc-title { flex: 1; min-width: 0; font-family: 'Outfit', sans-serif; font-size: 16px; font-weight: 800; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tc-brand .tc-title { color: var(--c); }
  .tc-cta { flex-shrink: 0; font-size: 11.5px; font-weight: 700; color: var(--text-muted); }
  .tc:hover .tc-cta { color: var(--text-secondary); }

  /* Strip (TOP40/30 — top 5 horizontal) */
  .tc-strip { display: flex; gap: 8px; }
  .tc-scv { position: relative; flex: 1; aspect-ratio: 1; border-radius: 9px; overflow: hidden; background: var(--bg-elevated); }
  .tc-scv img { width: 100%; height: 100%; object-fit: cover; }

  /* Collage (#1 big + mosaic) */
  .tc-collage { display: flex; gap: 7px; }
  .tc-hero-cv { position: relative; width: 92px; height: 92px; flex-shrink: 0; border-radius: 10px; overflow: hidden; background: var(--bg-elevated); }
  .tc-hero-cv img { width: 100%; height: 100%; object-fit: cover; }
  .tc-rest { flex: 1; display: grid; grid-template-columns: repeat(auto-fill, minmax(42px, 1fr)); grid-auto-rows: 42px; gap: 6px; max-height: 92px; overflow: hidden; }
  .tc-rcv { position: relative; border-radius: 7px; overflow: hidden; background: var(--bg-elevated); }
  .tc-rcv img { width: 100%; height: 100%; object-fit: cover; }

  .tc-ph { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 16px; }
  .tc-rank { position: absolute; bottom: 3px; left: 3px; font-size: 10px; font-weight: 800; line-height: 1; padding: 2px 5px; border-radius: 5px; background: rgba(0,0,0,0.62); color: #fff; font-variant-numeric: tabular-nums; }
  .tc-rank-sm { font-size: 8.5px; padding: 1px 3px; border-radius: 4px; bottom: 2px; left: 2px; }

  .tc-empty { padding: 26px 0; text-align: center; color: var(--text-muted); font-size: 13px; }

  /* Source links */
  .tc-srcs { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; padding: 9px 14px; margin-top: auto; border-top: 1px solid var(--border-subtle); background: var(--bg-elevated); }
  .tc-src { font-size: 11px; font-weight: 600; color: var(--text-muted); text-decoration: none; }
  .tc-src:hover { color: var(--text-primary); text-decoration: underline; }
  .tc-sep { font-size: 11px; color: var(--text-muted); margin-right: 5px; }
`
