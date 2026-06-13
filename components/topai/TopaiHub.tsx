// components/topai/TopaiHub.tsx
//
// Bendras topų hub'o body — naudojamas /topai ir 7 SEO landing'ų
// (/topai/lietuva, /pasaulis, /jav, /uk, /dainos, /albumai, /bendruomene).
// Async server komponentas: pats susirenka duomenis (mini-chart'us +
// external_charts), sutaguoja korteles regionu + tipu, filtruoja pagal
// `view` ir grupuoja su H2 sekcijomis. Music.lt TOP 40 / LT TOP 30
// grąžinti į hub'ą kaip „Music.lt bendruomenės" kortelės (nebėra atskirų
// tab'ų — vietoj jų TopaiFilterBar pill'ai).

import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase'
import { resolveDisplayWeek } from '@/lib/top-week'
import { proxyImg } from '@/lib/img-proxy'
import { TopaiFilterBar, type TopaiView } from '@/components/topai/TopaiFilterBar'

/* ───────────────────────────── Types ───────────────────────────── */
type Region = 'lt' | 'world' | 'us' | 'uk'
type Ctype = 'songs' | 'albums' | 'community'
type Entry = { position: number; title: string; artistName: string; coverUrl: string | null }
type Card = {
  key: string; title: string; href: string; country: string | null
  coverImageUrl: string | null; accent: string | null; noFlag?: boolean
  region: Region; ctype: Ctype
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

function toCard(
  map: Map<string, any>, slug: string,
  region: Region, ctype: Ctype,
  opts: { sourcesKey?: string; title?: string; country?: string | null; globe?: boolean } = {},
): Card | null {
  const c = map.get(slug)
  if (!c || c.entries.length === 0) return null
  return {
    key: slug, title: opts.title || c.title, href: `/topai/${slug}`,
    country: opts.country !== undefined ? opts.country : c.country,
    coverImageUrl: opts.globe ? null : (c.coverImageUrl || null), accent: null,
    region, ctype, entries: c.entries,
    sources: opts.sourcesKey ? (SOURCE_LINKS[opts.sourcesKey] || []) : [],
  }
}

/* ───────────────────── View → tekstas (H1 / JSON-LD / crumb) ───────────────────── */
const VIEW_INFO: Record<TopaiView, { h1: string; desc: string; crumb: string | null }> = {
  all: { h1: 'Muzikos topai — Lietuva ir pasaulis', desc: 'Music.lt TOP 40, LT TOP 30 ir agreguoti Lietuvos bei pasaulio dainų ir albumų topai.', crumb: null },
  lt: { h1: 'Lietuvos muzikos topai', desc: 'Lietuvos dainų ir albumų topai — AGATA, Spotify, Apple Music, Shazam ir Music.lt LT TOP 30.', crumb: 'Lietuva' },
  world: { h1: 'Pasaulio muzikos topai', desc: 'Pasaulio dainų ir albumų topai — Spotify Global, Billboard, Shazam ir Music.lt TOP 40.', crumb: 'Pasaulis' },
  us: { h1: 'JAV muzikos topai', desc: 'JAV dainų topai — Billboard Hot 100, Spotify ir Apple Music duomenys.', crumb: 'JAV' },
  uk: { h1: 'JK (UK) muzikos topai', desc: 'Jungtinės Karalystės dainų topai — Official UK, Spotify ir Apple Music duomenys.', crumb: 'UK' },
  songs: { h1: 'Dainų topai', desc: 'Populiariausių dainų topai — Lietuva, JAV, JK ir pasaulis vienoje vietoje.', crumb: 'Dainos' },
  albums: { h1: 'Albumų topai', desc: 'Populiariausių albumų topai — Lietuvos ir pasaulio reitingai.', crumb: 'Albumai' },
  community: { h1: 'Music.lt bendruomenės topai', desc: 'Music.lt TOP 40 ir LT TOP 30 — bendruomenės balsavimu sudaromi savaitės topai.', crumb: 'Bendruomenė' },
}

/* Sekcijų (tipų) tvarka ir antraštės. */
const GROUPS: { ctype: Ctype; title: string }[] = [
  { ctype: 'songs', title: 'Dainų topai' },
  { ctype: 'albums', title: 'Albumų topai' },
  { ctype: 'community', title: 'Music.lt bendruomenės topai' },
]

/* ───────────────────────────── Hub ───────────────────────────── */
export default async function TopaiHub({ view = 'all' }: { view?: TopaiView }) {
  const sb = createAdminClient()
  const [top40, top30, ext] = await Promise.all([
    getMiniChart(sb, 'top40', 5),
    getMiniChart(sb, 'lt_top30', 5),
    getExternalCharts(sb),
  ])

  // ── Visos kortelės su region + ctype tagais ──
  const songCards: Card[] = [
    toCard(ext, 'consensus-lt', 'lt', 'songs', { sourcesKey: 'lt', country: 'lt' }),
    toCard(ext, 'consensus-world', 'world', 'songs', { sourcesKey: 'world', globe: true }),
    toCard(ext, 'consensus-us', 'us', 'songs', { sourcesKey: 'us', country: 'us' }),
    toCard(ext, 'consensus-uk', 'uk', 'songs', { sourcesKey: 'uk', title: 'UK TOP 100', country: 'gb' }),
    toCard(ext, 'consensus-shazam_world', 'world', 'songs', { sourcesKey: 'shazam_world', globe: true }),
    toCard(ext, 'shazam-lt', 'lt', 'songs', { country: 'lt' }),
  ].filter(Boolean) as Card[]

  const albumCards: Card[] = [
    toCard(ext, 'consensus-albums', 'world', 'albums', { sourcesKey: 'albums', globe: true }),
    toCard(ext, 'agata-albums', 'lt', 'albums', { title: 'Lietuvos albumai', country: 'lt' }),
  ].filter(Boolean) as Card[]

  const communityCards: Card[] = [
    { key: 'top40', title: 'Music.lt TOP 40', href: '/top40', country: null, coverImageUrl: null, accent: null, noFlag: true, region: 'world', ctype: 'community', entries: top40, sources: [] },
    { key: 'top30', title: 'Music.lt LT TOP 30', href: '/top30', country: 'lt', coverImageUrl: null, accent: null, region: 'lt', ctype: 'community', entries: top30, sources: [] },
  ].filter((c) => c.entries.length > 0)

  const allCards = [...songCards, ...albumCards, ...communityCards]

  // ── Filtravimas pagal view ──
  const isRegion = (['lt', 'world', 'us', 'uk'] as TopaiView[]).includes(view)
  const isType = (['songs', 'albums', 'community'] as TopaiView[]).includes(view)
  const visible = allCards.filter((c) => {
    if (isRegion) return c.region === view
    if (isType) return c.ctype === view
    return true
  })

  // ── Grupavimas į sekcijas (tik netuščios) ──
  const sections = GROUPS
    .map((g) => ({ ...g, cards: visible.filter((c) => c.ctype === g.ctype) }))
    .filter((g) => g.cards.length > 0)

  const info = VIEW_INFO[view]
  const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://music.lt'
  const canonicalPath = view === 'all' ? '/topai'
    : view === 'lt' ? '/topai/lietuva' : view === 'world' ? '/topai/pasaulis'
    : view === 'us' ? '/topai/jav' : view === 'uk' ? '/topai/uk'
    : view === 'songs' ? '/topai/dainos' : view === 'albums' ? '/topai/albumai'
    : '/topai/bendruomene'

  // ── JSON-LD: CollectionPage + ItemList (+ BreadcrumbList landing'ams) ──
  const jsonLd: any = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: info.h1,
    description: info.desc,
    url: `${SITE}${canonicalPath}`,
    inLanguage: 'lt',
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: visible.map((c, i) => ({
        '@type': 'ListItem', position: i + 1, name: c.title, url: `${SITE}${c.href}`,
      })),
    },
  }
  const breadcrumbLd = info.crumb && {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Topai', item: `${SITE}/topai` },
      { '@type': 'ListItem', position: 2, name: info.crumb, item: `${SITE}${canonicalPath}` },
    ],
  }

  return (
    <div className="tp">
      <style>{styles}</style>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {breadcrumbLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />}

      <TopaiFilterBar view={view} />

      {/* H1 — SEO (vizualiai paslėptas; matomas hero pašalintas Edvardo
          prašymu). Tekstas keičiasi pagal aktyvų filtrą → kiekvienas
          landing'as turi unikalų H1. */}
      <h1 style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
        {info.h1}
      </h1>

      {sections.length === 0 ? (
        <div className="tp-none">Šios kategorijos topai šiuo metu formuojasi.</div>
      ) : (
        sections.map((s) => (
          <section key={s.ctype} className="tp-section">
            <h2 className="tp-sec-title">{s.title}</h2>
            <div className="tp-grid">{s.cards.map((c) => <ChartCard key={c.key} card={c} cta="Pilnas →" />)}</div>
          </section>
        ))
      )}

      {/* Archyvas — apačioje. */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 28 }}>
        <Link href="/topai/archyvas" className="tp-archive-link">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
          Praėjusių savaičių archyvas →
        </Link>
      </div>
    </div>
  )
}

/* ───────────────────────────── Flag ───────────────────────────── */
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

/* ───────────────────────────── ChartCard ───────────────────────────── */
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
      <Link href={card.href} className="tc-cta-btn">Visas topas →</Link>
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
  .tp-archive-link { flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px; padding: 8px 13px; border-radius: 999px; font-size: 13px; font-weight: 600; color: var(--text-secondary); text-decoration: none; background: var(--bg-surface); border: 1px solid var(--border-subtle); transition: color .15s, border-color .15s, background .15s; }
  .tp-archive-link:hover { color: var(--text-primary); border-color: var(--border-default); background: var(--bg-elevated); }
  .tp-archive-link svg { flex-shrink: 0; }
  @media (max-width: 640px) { .tp { padding-left: var(--page-pad-x-sm); padding-right: var(--page-pad-x-sm); } }

  .tp-none { padding: 60px 0; text-align: center; color: var(--text-muted); font-size: 14px; }
  .tp-section { margin-top: 30px; }
  .tp-section:first-of-type { margin-top: 4px; }
  .tp-sec-title { margin: 0 0 14px; font-family: 'Outfit', sans-serif; font-size: var(--section-title-size); font-weight: var(--section-title-weight); letter-spacing: var(--section-title-tracking); }

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
  .tc-cta-btn { display: flex; align-items: center; justify-content: center; gap: 6px; margin: 4px 16px 14px; padding: 9px 12px; border-radius: 10px; font-size: 13px; font-weight: 800; color: var(--accent-orange); text-decoration: none; background: var(--bg-elevated); border: 1px solid var(--border-subtle); transition: background .14s, border-color .14s; }
  .tc-cta-btn:hover { background: var(--bg-surface); border-color: var(--accent-orange); }

  .tc-ph { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 16px; }

  .tc-feat { display: flex; align-items: center; gap: 14px; padding: 12px; border-radius: 14px; background: var(--bg-elevated); margin-bottom: 8px; }
  .tc-feat-cv { position: relative; width: 92px; height: 92px; flex-shrink: 0; border-radius: 12px; overflow: hidden; background: var(--bg-surface); box-shadow: 0 6px 18px rgba(0,0,0,0.16); }
  .tc-feat-cv img { width: 100%; height: 100%; object-fit: cover; }
  .tc-feat-badge { position: absolute; top: 6px; left: 6px; min-width: 20px; height: 20px; padding: 0 5px; display: inline-flex; align-items: center; justify-content: center; border-radius: 6px; background: var(--c, #6366f1); color: #fff; font-family: 'Outfit', sans-serif; font-size: 12px; font-weight: 900; }
  .tc-feat-meta { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 4px; }
  .tc-feat-song { font-family: 'Outfit', sans-serif; font-size: 18px; font-weight: 800; letter-spacing: -0.01em; color: var(--text-primary); line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .tc-feat-artist { font-size: 13.5px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

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
