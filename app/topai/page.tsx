import { Metadata } from 'next'
import Link from 'next/link'
import { TopaiTabs } from '@/components/topai/TopaiTabs'
import { createAdminClient } from '@/lib/supabase'
import { resolveDisplayWeek } from '@/lib/top-week'
import { proxyImg } from '@/lib/img-proxy'

export const metadata: Metadata = {
  title: 'Muzikos topai — Lietuva ir pasaulis | Music.lt',
  description: 'Visi muzikos topai vienoje vietoje: Music.lt TOP 40 ir LT TOP 30, Lietuvos, JAV, JK bei pasaulio dainų ir albumų reitingai. Agreguoti AGATA, Spotify, Apple Music, Billboard, Official UK ir Shazam duomenys, atnaujinami kas savaitę.',
  keywords: ['muzikos topai', 'top 40', 'lietuvos topai', 'dainų topai', 'albumų topai', 'AGATA', 'Spotify topai', 'Billboard', 'Shazam', 'music.lt'],
  alternates: { canonical: '/topai' },
  openGraph: {
    title: 'Muzikos topai — Lietuva ir pasaulis',
    description: 'Music.lt TOP 40, LT TOP 30 ir agreguoti Lietuvos bei pasaulio dainų ir albumų topai vienoje vietoje.',
    url: '/topai',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Muzikos topai — Lietuva ir pasaulis | Music.lt',
    description: 'Lietuvos ir pasaulio muzikos topai vienoje vietoje, atnaujinami kas savaitę.',
  },
}

// ISR: topai atnaujinami daugiausia kas savaitę (voting) / kasdien (išoriniai),
// tad 30 min cache stipriai pagerina TTFB ir SEO crawl'ą lyginant su force-dynamic.
export const revalidate = 1800

/* ───────────────────────────── Types ───────────────────────────── */
type Entry = { position: number; title: string; artistName: string; coverUrl: string | null }
type Card = {
  key: string; title: string; href: string; country: string | null
  coverImageUrl: string | null; accent: string | null; noFlag?: boolean
  entries: Entry[]; sources: { label: string; slug: string }[]
}

const SOURCE_LINKS: Record<string, { label: string; slug: string }[]> = {
  lt: [{ label: 'AGATA', slug: 'agata-singles' }, { label: 'Apple Music', slug: 'apple-lt_songs' }, { label: 'Spotify', slug: 'spotify-lt' }, { label: 'M.A.M.A', slug: 'mama-top40' }],
  us: [{ label: 'Apple Music', slug: 'apple-us_songs' }, { label: 'Spotify', slug: 'spotify-us' }, { label: 'Billboard', slug: 'billboard-hot100' }],
  uk: [{ label: 'Apple Music', slug: 'apple-gb_songs' }, { label: 'Spotify', slug: 'spotify-uk' }, { label: 'Official UK', slug: 'official_uk-singles' }],
  world: [{ label: 'Spotify', slug: 'spotify-global' }, { label: 'Billboard', slug: 'billboard-global200' }],
  albums: [{ label: 'Billboard 200', slug: 'billboard-albums' }, { label: 'Official UK', slug: 'official_uk-albums' }],
  shazam_world: [
    { label: 'JAV', slug: 'shazam-us' }, { label: 'UK', slug: 'shazam-uk' }, { label: 'Vokietija', slug: 'shazam-de' },
    { label: 'Prancūzija', slug: 'shazam-fr' }, { label: 'Brazilija', slug: 'shazam-br' },
    { label: 'Ispanija', slug: 'shazam-es' }, { label: 'Meksika', slug: 'shazam-mx' },
  ],
}

function ytThumb(url: string | null | undefined): string | null {
  if (!url) return null
  const m = String(url).match(/(?:v=|youtu\.be\/|embed\/|shorts\/|\/vi\/)([\w-]{11})/)
  return m ? `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` : null
}

async function getMiniChart(sb: any, topType: string, limit = 5): Promise<Entry[]> {
  // Pereinamasis fallback: einamoji savaitė jei turi entries, kitaip naujausia
  // finalizuota (legacy archyvas). Žr. lib/top-week.ts.
  const { week } = await resolveDisplayWeek(sb, topType)
  if (!week) return []
  const { data: rows } = await sb.from('top_entries')
    .select('position, total_votes, artist_name, title, tracks:track_id ( slug, title, cover_url, video_url, artists:artist_id ( slug, name, cover_image_url ) )')
    .eq('week_id', week.id)
    .order(week.is_finalized ? 'position' : 'total_votes', { ascending: !!week.is_finalized })
    .limit(limit)
  return (rows || []).map((r: any, i: number) => {
    const tr = Array.isArray(r.tracks) ? r.tracks[0] : r.tracks
    const ar = tr ? (Array.isArray(tr.artists) ? tr.artists[0] : tr.artists) : null
    // Cover fallback: track cover → YT thumbnail (iš video_url) → atlikėjo nuotrauka
    const cover = tr?.cover_url || ytThumb(tr?.video_url) || ar?.cover_image_url || null
    return { position: r.position ?? i + 1, title: tr?.title ?? r.title ?? '—', artistName: ar?.name ?? r.artist_name ?? '—', coverUrl: cover }
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

function toCard(map: Map<string, any>, slug: string, opts: { sourcesKey?: string; title?: string; country?: string | null; globe?: boolean } = {}): Card | null {
  const c = map.get(slug)
  if (!c || c.entries.length === 0) return null
  return {
    key: slug, title: opts.title || c.title, href: `/topai/${slug}`,
    country: opts.country !== undefined ? opts.country : c.country,
    // globe=true (pasaulio/mišrūs topai) — nerodom DB cover'io, kad būtų švarus
    // gaublio indikatorius vietoj atsitiktinio paveiksliuko.
    coverImageUrl: opts.globe ? null : (c.coverImageUrl || null), accent: null, entries: c.entries,
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
    { key: 'top40', title: 'Music.lt TOP 40', href: '/top40', country: null, coverImageUrl: null, accent: null, noFlag: true, entries: top40, sources: [] },
    { key: 'top30', title: 'Music.lt LT TOP 30', href: '/top30', country: 'lt', coverImageUrl: null, accent: null, entries: top30, sources: [] },
  ]

  const songCards: Card[] = [
    toCard(ext, 'consensus-lt', { sourcesKey: 'lt', country: 'lt' }),   // Lietuvos TOP 100 — VIRŠUJE
    toCard(ext, 'consensus-world', { sourcesKey: 'world', globe: true }),
    toCard(ext, 'consensus-us', { sourcesKey: 'us', country: 'us' }),
    toCard(ext, 'consensus-uk', { sourcesKey: 'uk', title: 'UK TOP 100', country: 'gb' }),
    toCard(ext, 'consensus-shazam_world', { sourcesKey: 'shazam_world', globe: true }),
    toCard(ext, 'shazam-lt', { country: 'lt' }),
  ].filter(Boolean) as Card[]

  const albumCards: Card[] = [
    toCard(ext, 'consensus-albums', { sourcesKey: 'albums', globe: true }),
    toCard(ext, 'agata-albums', { title: 'Lietuvos albumai', country: 'lt' }),
  ].filter(Boolean) as Card[]

  // ── JSON-LD: visi topai kaip ItemList (rich results / Google supratimui) ──
  const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://music.lt'
  const allCards = [...mainCards, ...songCards, ...albumCards]
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Muzikos topai — Lietuva ir pasaulis',
    description: 'Music.lt TOP 40, LT TOP 30 ir agreguoti Lietuvos bei pasaulio dainų ir albumų topai.',
    url: `${SITE}/topai`,
    inLanguage: 'lt',
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: allCards.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: c.title,
        url: `${SITE}${c.href}`,
      })),
    },
  }

  return (
    <div className="tp">
      <style>{styles}</style>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <TopaiTabs />

      {/* H1 — SEO (vizualiai paslėptas, kad taupytume vietą; matomas „header"
          pašalintas Edvardo prašymu). Music.lt TOP 40 / LT TOP 30 dabar tabuose,
          tad jų kortelių hub'e nebėra. */}
      <h1 style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
        Muzikos topai — Lietuva ir pasaulis
      </h1>

      <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '8px 0 4px' }}>
        <Link href="/topai/archyvas" className="tp-archive-link">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
          Praėjusių savaičių archyvas →
        </Link>
      </div>

      {songCards.length > 0 && (
        <section className="tp-section">
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

/* ───────────────────────────── Flag ─────────────────────────────
   Tvarka: žinomas šalies kodas → flagcdn vėliava; antraip custom cover
   paveiksliukas; antraip — pasaulio gaublio ikona. (Klasė buvo „tp-flag",
   bet CSS apibrėžta „tc-flag" → vėliavos rodėsi 0×0px; sutvarkyta.) */
const FLAG_ALIAS: Record<string, string> = { uk: 'gb', en: 'gb' }
function Flag({ country, image }: { country: string | null; image: string | null }) {
  let cc = (country || '').toLowerCase()
  cc = FLAG_ALIAS[cc] || cc
  if (/^[a-z]{2}$/.test(cc))
    return <span className="tc-flag" style={{ backgroundImage: `url(https://flagcdn.com/w80/${cc}.png)` }} aria-hidden />
  if (image) return <span className="tc-flag" style={{ backgroundImage: `url(${proxyImg(image, 120)})` }} aria-hidden />
  return (
    <span className="tc-flag tc-flag-globe" aria-hidden>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></svg>
    </span>
  )
}

/* ───────────────────────────── ChartCard (spacious list) ───────────────────────────── */
function ChartCard({ card, cta }: { card: Card; cta: string }) {
  const accent = card.accent
  const entries = card.entries.slice(0, 5)
  const top = entries[0]
  const rest = entries.slice(1)
  return (
    <div className={`tc${accent ? ' tc-brand' : ''}`} style={accent ? { ['--c' as any]: accent } : undefined}>
      <Link href={card.href} className="tc-main">
        <div className="tc-head">
          {!card.noFlag && <Flag country={card.country} image={card.coverImageUrl} />}
          <span className="tc-title">{card.title}</span>
          <span className="tc-cta">{cta}</span>
        </div>
        {entries.length === 0 ? (
          <div className="tc-empty">Sąrašas formuojasi</div>
        ) : (
          <>
            {/* #1 — featured */}
            <div className="tc-feat">
              <span className="tc-feat-cv">
                {top.coverUrl ? <img src={proxyImg(top.coverUrl, 200)} alt="" /> : <span className="tc-ph">♪</span>}
                <span className="tc-feat-badge">1</span>
              </span>
              <span className="tc-feat-meta">
                <span className="tc-feat-song">{top.title}</span>
                <span className="tc-feat-artist">{top.artistName}</span>
              </span>
            </div>
            {/* #2–5 */}
            {rest.length > 0 && (
              <ol className="tc-rest">
                {rest.map(e => (
                  <li key={e.position} className="tc-r">
                    <span className="tc-r-pos">{e.position}</span>
                    <span className="tc-r-cv">{e.coverUrl ? <img src={proxyImg(e.coverUrl, 80)} alt="" /> : <span className="tc-ph">♪</span>}</span>
                    <span className="tc-r-meta">
                      <span className="tc-r-song">{e.title}</span>
                      <span className="tc-r-artist">{e.artistName}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </>
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
  .tp { max-width: var(--page-max); margin: 0 auto; padding: var(--page-pad-top) var(--page-pad-x) var(--page-pad-bottom); color: var(--text-primary); font-family: 'DM Sans', sans-serif; }
  .tp-hero { margin-bottom: var(--page-head-gap); display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
  .tp-hero-text { max-width: var(--page-sub-max); }
  .tp-hero-title { margin: 0; font-family: 'Outfit', sans-serif; font-size: var(--page-h1-size); font-weight: var(--page-h1-weight); letter-spacing: var(--page-h1-tracking); line-height: var(--page-h1-line); }
  .tp-hero-sub { margin: 6px 0 0; font-size: var(--page-sub-size); line-height: var(--page-sub-line); color: var(--page-sub-color); max-width: var(--page-sub-max); }
  .tp-archive-link { flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px; padding: 8px 13px; border-radius: 999px; font-size: 13px; font-weight: 600; color: var(--text-secondary); text-decoration: none; background: var(--bg-surface); border: 1px solid var(--border-subtle); transition: color .15s, border-color .15s, background .15s; }
  .tp-archive-link:hover { color: var(--text-primary); border-color: var(--border-default); background: var(--bg-elevated); }
  .tp-archive-link svg { flex-shrink: 0; }
  @media (max-width: 760px) { .tp-archive-link { order: -1; } }
  @media (max-width: 640px) { .tp { padding-left: var(--page-pad-x-sm); padding-right: var(--page-pad-x-sm); } }

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

  .tc-ph { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 16px; }

  /* #1 — featured (didelis viršelis + ryškus pavadinimas) */
  .tc-feat { display: flex; align-items: center; gap: 14px; padding: 12px; border-radius: 14px; background: var(--bg-elevated); margin-bottom: 8px; }
  .tc-feat-cv { position: relative; width: 92px; height: 92px; flex-shrink: 0; border-radius: 12px; overflow: hidden; background: var(--bg-surface); box-shadow: 0 6px 18px rgba(0,0,0,0.16); }
  .tc-feat-cv img { width: 100%; height: 100%; object-fit: cover; }
  .tc-feat-badge { position: absolute; top: 6px; left: 6px; min-width: 20px; height: 20px; padding: 0 5px; display: inline-flex; align-items: center; justify-content: center; border-radius: 6px; background: var(--c, #6366f1); color: #fff; font-family: 'Outfit', sans-serif; font-size: 12px; font-weight: 900; }
  .tc-feat-meta { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 4px; }
  .tc-feat-song { font-family: 'Outfit', sans-serif; font-size: 18px; font-weight: 800; letter-spacing: -0.01em; color: var(--text-primary); line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .tc-feat-artist { font-size: 13.5px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* #2–5 */
  .tc-rest { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  .tc-r { display: flex; align-items: center; gap: 12px; padding: 6px 4px; border-radius: 9px; }
  .tc-r + .tc-r { border-top: 1px solid var(--border-subtle); }
  .tc-r-pos { width: 18px; flex-shrink: 0; text-align: center; font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 800; color: var(--text-muted); font-variant-numeric: tabular-nums; }
  .tc-r-cv { width: 38px; height: 38px; flex-shrink: 0; border-radius: 7px; overflow: hidden; background: var(--bg-elevated); }
  .tc-r-cv img { width: 100%; height: 100%; object-fit: cover; }
  .tc-r-meta { min-width: 0; flex: 1; display: flex; flex-direction: column; }
  .tc-r-song { font-size: 13px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tc-r-artist { font-size: 11.5px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .tc-empty { padding: 30px 0; text-align: center; color: var(--text-muted); font-size: 13px; }

  .tc-srcs { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; padding: 10px 16px; margin-top: auto; border-top: 1px solid var(--border-subtle); background: var(--bg-elevated); }
  .tc-srcs-label { font-size: 11px; font-weight: 700; color: var(--text-muted); margin-right: 2px; }
  .tc-src { font-size: 11.5px; font-weight: 600; color: var(--text-secondary); text-decoration: none; }
  .tc-src:hover { color: var(--text-primary); text-decoration: underline; }
  .tc-sep { font-size: 11px; color: var(--text-muted); margin-right: 5px; }
`
