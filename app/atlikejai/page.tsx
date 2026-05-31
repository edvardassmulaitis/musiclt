// app/atlikejai/page.tsx
//
// Atlikėjų naršymo puslapis — SERVER-RENDERED, kad Google galėtų indeksuoti
// visus ~12k atlikėjų. Filtrai (šalis / žanras / tipas) ir rūšiavimas
// (populiarumas all-time / recent / abėcėlė) gyvena URL query string'e, todėl
// kiekviena kombinacija yra atskiras crawlinamas puslapis su savo
// canonical'u. Rezultatai paginuoti su <Link> pagination — crawler'is gali
// pereiti visus puslapius; papildomai sitemap.ts išvardina kiekvieną atlikėją.
//
// Architektūra: pati kortelių mozaika render'inama serveryje (realūs <a>
// link'ai → SEO). Interaktyvus filtrų bar'as (artists-filter-bar.tsx) yra
// mažas client island'as, kuris keisdamas filtrą daro router.push į naują
// URL — taip rezultatai lieka server-rendered.

import type { Metadata } from 'next'
import { cache } from 'react'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase'
import ArtistsFilterBar from './artists-filter-bar'
import {
  LT_COUNTRY, SITE_URL, normSort, ltSlugify, resolveCountry, flagFor,
  type SortKey, type CountryResolution,
} from '@/lib/artist-browse'

// Puslapis dinamiškas (priklauso nuo searchParams), tad revalidate neeksportuojam.
const PER_PAGE = 48

// ── Filter option fetchers (cached, dalinami su generateMetadata) ──────
const getCountryCounts = cache(async (): Promise<{ country: string; n: number }[]> => {
  const sb = createAdminClient()
  const { data } = await sb.rpc('artist_country_counts')
  return (data || []) as { country: string; n: number }[]
})

const getGenreCounts = cache(async (): Promise<{ genre_id: number; name: string; n: number }[]> => {
  const sb = createAdminClient()
  const { data } = await sb.rpc('artist_genre_counts')
  return (data || []) as { genre_id: number; name: string; n: number }[]
})

type Artist = {
  id: number; slug: string; name: string; country: string | null; type: string
  cover_image_url: string | null; cover_image_position: string | null
  is_verified: boolean | null; score: number | null; recent_score: number | null
}

type Params = {
  country?: CountryResolution; genreId?: number; type?: string
  sort: SortKey; page: number
}

async function fetchArtists(p: Params): Promise<{ items: Artist[]; total: number }> {
  const sb = createAdminClient()
  const cols = 'id, slug, name, country, type, cover_image_url, cover_image_position, is_verified, score, recent_score'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = p.genreId
    ? sb.from('artists').select(`${cols}, artist_genres!inner(genre_id)`, { count: 'exact' }).eq('artist_genres.genre_id', p.genreId)
    : sb.from('artists').select(cols, { count: 'exact' })

  // Šalies filtras
  if (p.country?.mode === 'lt') q = q.eq('country', LT_COUNTRY)
  else if (p.country?.mode === 'world') q = q.neq('country', LT_COUNTRY)
  else if (p.country?.mode === 'name') q = q.eq('country', p.country.name)

  // Tipo filtras
  if (p.type === 'solo' || p.type === 'group') q = q.eq('type', p.type)

  // Rūšiavimas — secondary tiebreaker name ASC, kad pozicijos būtų stabilios.
  // nullsFirst:false — kad NULL score'ai nenukristų į viršų (DESC default = NULLS FIRST).
  if (p.sort === 'name') q = q.order('name', { ascending: true })
  else if (p.sort === 'recent') q = q.order('recent_score', { ascending: false, nullsFirst: false }).order('name', { ascending: true })
  else q = q.order('score', { ascending: false, nullsFirst: false }).order('name', { ascending: true })

  const from = (p.page - 1) * PER_PAGE
  q = q.range(from, from + PER_PAGE - 1)

  const { data, count } = await q
  return { items: (data || []) as any as Artist[], total: count || 0 }
}

// ── SEO metadata pagal filtrus ─────────────────────────────────────────
type RawSearchParams = { [key: string]: string | string[] | undefined }
type PageProps = { searchParams: Promise<RawSearchParams> }
type SP = Record<string, string | undefined>

// searchParams reikšmės gali būti masyvai (?country=a&country=b) — imam pirmą.
function normSP(raw: RawSearchParams): SP {
  const out: SP = {}
  for (const k of Object.keys(raw)) {
    const v = raw[k]
    out[k] = Array.isArray(v) ? v[0] : v
  }
  return out
}

async function resolveFilters(sp: SP) {
  const [countries, genres] = await Promise.all([getCountryCounts(), getGenreCounts()])
  const countryNames = countries.map((c) => c.country)
  const country = resolveCountry(sp.country, countryNames)
  const genreSlug = sp.genre ? ltSlugify(sp.genre) : null
  const genre = genreSlug ? genres.find((g) => ltSlugify(g.name) === genreSlug) || null : null
  const type = sp.type === 'solo' || sp.type === 'group' ? sp.type : null
  // Default'as — „Tendencijos" (recent_score): /atlikejai be sort param rodo
  // trending atlikėjus. ?sort=popular / ?sort=name perrašo.
  const sort = sp.sort ? normSort(sp.sort) : 'recent'
  const page = Math.max(1, parseInt(sp.page || '1', 10) || 1)
  const q = (sp.q || '').trim()
  return { countries, genres, country, genre, type, sort, page, q }
}

function buildHeading(country: CountryResolution, genre: { name: string } | null, type: string | null): string {
  const parts: string[] = []
  if (genre) parts.push(genre.name.replace(/\s*muzika$/i, '').trim())
  if (type === 'solo') parts.push('solo')
  else if (type === 'group') parts.push('grupės')
  if (country.mode === 'lt') return parts.length ? `Lietuvos ${parts.join(' ')} atlikėjai` : 'Lietuvos atlikėjai'
  if (country.mode === 'world') return parts.length ? `Užsienio ${parts.join(' ')} atlikėjai` : 'Užsienio atlikėjai'
  if (country.mode === 'name') return parts.length ? `${country.name} ${parts.join(' ')} atlikėjai` : `${country.name} atlikėjai`
  if (parts.length) return `${parts.join(' ')} atlikėjai`.replace(/^./, (c) => c.toUpperCase())
  return 'Visi atlikėjai'
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const sp = normSP(await searchParams)
  const { country, genre, type, sort: _sort, page, q } = await resolveFilters(sp)
  const heading = buildHeading(country, genre, type)
  const title = `${heading}${page > 1 ? ` (${page} psl.)` : ''} | music.lt`
  const description = `${heading} — naršyk pagal šalį ir žanrą, rūšiuok pagal populiarumą. Dainos, albumai, biografijos ir naujienos music.lt platformoje.`

  // Canonical — tik content'ą apibrėžiantys params (country/genre/type/page).
  // sort ir paieška (q) į canonical neįeina (tai vartotojo vaizdai, ne atskiras
  // turinys) — koncentruojam indeksavimą į šalies/žanro/puslapio variantus.
  const cp = new URLSearchParams()
  if (sp.country && country.mode !== 'all') cp.set('country', sp.country)
  if (genre) cp.set('genre', ltSlugify(genre.name))
  if (type) cp.set('type', type)
  if (page > 1) cp.set('page', String(page))
  const canonical = `${SITE_URL}/atlikejai${cp.toString() ? `?${cp.toString()}` : ''}`

  return {
    title,
    description,
    alternates: { canonical },
    // Paieškos rezultatų variantai neindeksuojami (canonical nukreipia į bazę).
    robots: q ? { index: false, follow: true } : undefined,
    openGraph: { title, description, url: canonical, type: 'website' },
  }
}

// ── Kortelė ────────────────────────────────────────────────────────────
function parseCoverPos(pos: string | null): { x: number; y: number; zoom: number } {
  if (!pos) return { x: 50, y: 20, zoom: 1 }
  const parts = pos.trim().split(/\s+/)
  const pcts = pos.match(/(\d+)%/g) || []
  const isCenter = parts[0] === 'center'
  const xPct = pcts[0]
  const x = isCenter ? 50 : xPct ? parseInt(xPct) : 50
  const yPct = pcts[isCenter ? 0 : 1]
  const y = yPct ? parseInt(yPct) : 20
  const lastStr = parts[parts.length - 1] ?? ''
  const last = parseFloat(lastStr)
  const zoom = !isNaN(last) && last >= 1 && !lastStr.includes('%') ? last : 1
  return { x, y, zoom }
}

function ArtistCard({ a, big, rank, showRecent }: { a: Artist; big: boolean; rank?: number; showRecent: boolean }) {
  const pos = parseCoverPos(a.cover_image_position)
  const flag = flagFor(a.country)
  return (
    <Link href={`/atlikejai/${a.slug}`} className={`ab-tile${big ? ' ab-tile-big' : ''}`} prefetch={false}>
      <div className="ab-tile-img">
        {a.cover_image_url ? (
          <img
            src={a.cover_image_url}
            alt={a.name}
            loading="lazy"
            style={{ objectPosition: `${pos.x}% ${pos.y}%`, transform: `scale(${pos.zoom})`, transformOrigin: `${pos.x}% ${pos.y}%` }}
          />
        ) : (
          <div className="ab-tile-noimg"><span>{a.name?.[0] || '?'}</span></div>
        )}
        <div className="ab-tile-shade" />
        {typeof rank === 'number' && rank <= 3 && <span className="ab-tile-rank">#{rank}</span>}
        {a.is_verified && (
          <span className="ab-tile-verified" title="Patvirtintas">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
          </span>
        )}
        <div className="ab-tile-meta">
          <div className="ab-tile-name">{a.name}</div>
          <div className="ab-tile-sub">
            <span>{a.type === 'solo' ? '🎤' : '🎸'}</span>
            {flag && <span>{flag}</span>}
            <span>{a.country || ''}</span>
            {showRecent && (a.recent_score || 0) > 0 && <span className="ab-tile-hot">🔥</span>}
          </div>
        </div>
      </div>
    </Link>
  )
}

// ── Pagination ──────────────────────────────────────────────────────────
function pageHref(sp: SP, page: number): string {
  const u = new URLSearchParams()
  if (sp.country) u.set('country', sp.country)
  if (sp.genre) u.set('genre', sp.genre)
  if (sp.type) u.set('type', sp.type)
  if (sp.sort) u.set('sort', sp.sort)
  if (sp.q) u.set('q', sp.q)
  if (page > 1) u.set('page', String(page))
  const s = u.toString()
  return `/atlikejai${s ? `?${s}` : ''}`
}

function Pagination({ sp, page, totalPages }: { sp: SP; page: number; totalPages: number }) {
  if (totalPages <= 1) return null
  const nums: number[] = []
  const add = (n: number) => { if (n >= 1 && n <= totalPages && !nums.includes(n)) nums.push(n) }
  add(1); add(2)
  for (let d = -1; d <= 1; d++) add(page + d)
  add(totalPages - 1); add(totalPages)
  nums.sort((a, b) => a - b)
  return (
    <nav className="ab-pager" aria-label="Puslapiai">
      {page > 1 && <Link href={pageHref(sp, page - 1)} className="ab-pg ab-pg-arrow" rel="prev" prefetch={false}>‹ Atgal</Link>}
      {nums.map((n, i) => {
        const gap = i > 0 && n - nums[i - 1] > 1
        return (
          <span key={n} style={{ display: 'contents' }}>
            {gap && <span className="ab-pg-dots">…</span>}
            {n === page
              ? <span className="ab-pg ab-pg-cur" aria-current="page">{n}</span>
              : <Link href={pageHref(sp, n)} className="ab-pg" prefetch={false}>{n}</Link>}
          </span>
        )
      })}
      {page < totalPages && <Link href={pageHref(sp, page + 1)} className="ab-pg ab-pg-arrow" rel="next" prefetch={false}>Pirmyn ›</Link>}
    </nav>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────
export default async function ArtistsPage({ searchParams }: PageProps) {
  const sp = normSP(await searchParams)
  const { countries, genres, country, genre, sort, page } = await resolveFilters(sp)

  const { items, total } = await fetchArtists({
    country, genreId: genre?.genre_id, sort, page,
  })

  const visible = items
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))
  const heading = buildHeading(country, genre, null)
  const showRecent = sort === 'recent'

  return (
    <div className="ab">
      <style>{abStyles}</style>

      {/* Hero */}
      <header className="ab-hero">
        <div className="ab-hero-inner">
          <h1>{heading}</h1>
          <p>{total.toLocaleString('lt-LT')} atlikėjų · naršyk pagal šalį, žanrą ir populiarumą</p>
        </div>
      </header>

      {/* Kompaktiškas filtrų bar'as: rūšiavimas (mygtukai) + šalis (dropdown)
          + žanras (chip'ai desktop / dropdown mobile) */}
      <ArtistsFilterBar
        countries={countries}
        genres={genres}
        current={{ country: sp.country || 'all', genre: sp.genre || '', sort }}
        resultCount={total}
      />

      {/* Mozaika */}
      {visible.length === 0 ? (
        <div className="ab-empty">
          <div className="ab-empty-ic">🎤</div>
          <h3>Nieko nerasta</h3>
          <p>Pabandyk pakeisti filtrus arba paiešką.</p>
          <Link href="/atlikejai" className="ab-chip on" style={{ marginTop: 14 }} prefetch={false}>Rodyti visus atlikėjus</Link>
        </div>
      ) : (
        <>
          <div className="ab-grid">
            {visible.map((a, i) => (
              <ArtistCard
                key={a.id}
                a={a}
                big={page === 1 && i % 11 === 0}
                rank={sort !== 'name' && page === 1 ? i + 1 : undefined}
                showRecent={showRecent}
              />
            ))}
          </div>
          <Pagination sp={sp} page={page} totalPages={totalPages} />
        </>
      )}

      {/* SEO: vidinės nuorodos į facet puslapius */}
      <section className="ab-seo">
        <h2>Naršyk atlikėjus</h2>
        <div className="ab-seo-grid">
          <div>
            <h3>Pagal žanrą</h3>
            <ul>
              {genres.map((g) => (
                <li key={g.genre_id}><Link href={`/atlikejai?genre=${ltSlugify(g.name)}`} prefetch={false}>{g.name} <em>{g.n.toLocaleString('lt-LT')}</em></Link></li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Pagal šalį</h3>
            <ul>
              <li><Link href="/atlikejai?country=lt" prefetch={false}>Lietuvos atlikėjai <em>{(countries.find((c) => c.country === LT_COUNTRY)?.n || 0).toLocaleString('lt-LT')}</em></Link></li>
              {countries.filter((c) => c.country !== LT_COUNTRY).slice(0, 11).map((c) => (
                <li key={c.country}><Link href={`/atlikejai?country=${ltSlugify(c.country)}`} prefetch={false}>{c.country} <em>{c.n.toLocaleString('lt-LT')}</em></Link></li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  )
}

const abStyles = `
.ab { background:var(--bg-body); color:var(--text-primary); min-height:100vh; font-family:'DM Sans',system-ui,sans-serif; }
.ab a { text-decoration:none; color:inherit; }

.ab-hero { position:relative; overflow:hidden; padding:40px 24px 24px; }
.ab-hero::before { content:''; position:absolute; inset:0; background:radial-gradient(ellipse at 50% -10%, rgba(249,115,22,0.10), transparent 60%); pointer-events:none; }
.ab-hero-inner { max-width:1400px; margin:0 auto; position:relative; }
.ab-crumbs { display:flex; gap:8px; align-items:center; font-size:12px; color:var(--text-muted); margin-bottom:10px; }
.ab-crumbs a:hover { color:var(--accent-orange); }
.ab-hero h1 { font-family:'Outfit',sans-serif; font-weight:900; letter-spacing:-.03em; font-size:clamp(1.8rem,3.6vw,2.8rem); line-height:1.05; }
.ab-hero p { color:var(--text-muted); font-size:14px; margin-top:8px; }

.ab-facets { max-width:1400px; margin:0 auto; padding:0 24px; display:flex; flex-direction:column; gap:8px; }
.ab-facet-row { display:flex; flex-wrap:wrap; gap:7px; align-items:center; }
.ab-facet-lbl { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--text-faint); min-width:48px; }
.ab-chip { padding:6px 13px; border-radius:100px; font-size:12.5px; font-weight:600; background:var(--bg-hover); border:1px solid var(--border-default,rgba(255,255,255,0.08)); color:var(--text-secondary); transition:all .15s; white-space:nowrap; font-family:'Outfit',sans-serif; }
.ab-chip:hover { color:var(--text-primary); border-color:rgba(249,115,22,0.4); }
.ab-chip.on { background:var(--accent-orange); border-color:var(--accent-orange); color:#fff; }

.ab-grid { max-width:1400px; margin:18px auto 0; padding:0 24px; display:grid; grid-template-columns:repeat(auto-fill, minmax(150px,1fr)); grid-auto-rows:170px; grid-auto-flow:dense; gap:12px; }
@media(min-width:640px){ .ab-grid{ grid-auto-rows:185px; } }
.ab-tile { position:relative; border-radius:14px; overflow:hidden; display:block; }
.ab-tile-big { grid-column:span 2; grid-row:span 2; }
.ab-tile-img { position:absolute; inset:0; background:var(--bg-elevated); overflow:hidden; }
.ab-tile-img img { width:100%; height:100%; object-fit:cover; display:block; transition:transform .4s ease; }
.ab-tile:hover .ab-tile-img img { transform:scale(1.06); }
.ab-tile-noimg { width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:linear-gradient(135deg, var(--bg-elevated), rgba(249,115,22,0.08)); }
.ab-tile-noimg span { font-family:'Outfit',sans-serif; font-weight:900; font-size:40px; color:rgba(255,255,255,0.08); }
.ab-tile-shade { position:absolute; inset:0; background:linear-gradient(to top, rgba(5,8,13,0.92) 0%, rgba(5,8,13,0.45) 32%, transparent 62%); }
.ab-tile-meta { position:absolute; left:0; right:0; bottom:0; padding:11px 12px; }
.ab-tile-name { font-family:'Outfit',sans-serif; font-weight:700; color:#fff; font-size:14px; line-height:1.15; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
.ab-tile-big .ab-tile-name { font-size:20px; }
.ab-tile-sub { display:flex; gap:5px; align-items:center; margin-top:4px; font-size:11px; color:rgba(255,255,255,0.72); white-space:nowrap; overflow:hidden; }
.ab-tile-hot { margin-left:auto; }
.ab-tile-rank { position:absolute; top:8px; left:8px; font-family:'Outfit',sans-serif; font-weight:900; font-size:13px; color:#fff; background:var(--accent-orange); padding:2px 8px; border-radius:100px; box-shadow:0 2px 8px rgba(0,0,0,.3); }
.ab-tile-big .ab-tile-rank { font-size:16px; padding:3px 11px; }
.ab-tile-verified { position:absolute; top:8px; right:8px; width:20px; height:20px; border-radius:50%; background:#3b82f6; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 8px rgba(0,0,0,.3); }

.ab-pager { max-width:1400px; margin:28px auto; padding:0 24px; display:flex; flex-wrap:wrap; gap:6px; justify-content:center; align-items:center; }
.ab-pg { min-width:38px; height:38px; padding:0 12px; display:inline-flex; align-items:center; justify-content:center; border-radius:9px; font-size:13px; font-weight:700; font-family:'Outfit',sans-serif; background:var(--bg-hover); border:1px solid var(--border-default,rgba(255,255,255,0.08)); color:var(--text-secondary); transition:all .15s; }
.ab-pg:hover { color:var(--text-primary); border-color:rgba(249,115,22,0.4); }
.ab-pg-cur { background:var(--accent-orange); border-color:var(--accent-orange); color:#fff; }
.ab-pg-dots { color:var(--text-faint); padding:0 2px; }

.ab-empty { max-width:600px; margin:60px auto; text-align:center; display:flex; flex-direction:column; align-items:center; }
.ab-empty-ic { font-size:46px; opacity:.4; }
.ab-empty h3 { font-family:'Outfit',sans-serif; font-weight:800; font-size:20px; margin:12px 0 4px; }
.ab-empty p { color:var(--text-muted); font-size:13px; }

.ab-seo { max-width:1400px; margin:40px auto 80px; padding:24px; border-top:1px solid var(--border-default,rgba(255,255,255,0.07)); }
.ab-seo h2 { font-family:'Outfit',sans-serif; font-weight:800; font-size:16px; margin-bottom:16px; color:var(--text-secondary); }
.ab-seo-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:24px; }
.ab-seo h3 { font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:var(--text-faint); margin-bottom:10px; }
.ab-seo ul { list-style:none; display:flex; flex-direction:column; gap:7px; }
.ab-seo li a { font-size:13.5px; color:var(--text-secondary); display:flex; justify-content:space-between; gap:12px; }
.ab-seo li a:hover { color:var(--accent-orange); }
.ab-seo li em { font-style:normal; color:var(--text-faint); font-size:12px; }

@media(max-width:768px){
  .ab-grid { grid-template-columns:repeat(auto-fill,minmax(118px,1fr)); grid-auto-rows:130px; gap:8px; }
  .ab-tile-big .ab-tile-name { font-size:16px; }
}
`
