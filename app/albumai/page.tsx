// app/albumai/page.tsx
//
// Albumų naršymo katalogas — SERVER-RENDERED (SEO). Filtrai (šalis / stilius /
// dešimtmetis / tipas) ir rūšiavimas gyvena URL query string'e → kiekviena
// kombinacija = atskiras crawlinamas puslapis su canonical'u. Paginacija per
// <Link> (crawler'is pereina visus puslapius). Pakeičia buvusį PlaceholderPage.

import type { Metadata } from 'next'
import Link from 'next/link'
import { cache, type ReactNode } from 'react'
import { createAdminClient } from '@/lib/supabase'
import { LT_COUNTRY, SITE_URL, ltSlugify, resolveCountry, type CountryResolution } from '@/lib/artist-browse'
import { getGenreCounts, getCountryCounts, albumHref, type HubAlbum } from '@/lib/muzika-hub'
import { muzikaStyles, AlbumCard } from '@/components/muzika-ui'

const PER_PAGE = 48

// Albumo tipo filtras → boolean stulpelis.
const TYPE_OPTS: { key: string; label: string; col: string }[] = [
  { key: 'studio', label: 'Albumai', col: 'type_studio' },
  { key: 'ep', label: 'EP', col: 'type_ep' },
  { key: 'single', label: 'Singlai', col: 'type_single' },
  { key: 'live', label: 'Koncertiniai', col: 'type_live' },
  { key: 'compilation', label: 'Rinkiniai', col: 'type_compilation' },
]
const DECADES = [2020, 2010, 2000, 1990, 1980, 1970]

type SP = Record<string, string | undefined>
type PageProps = { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }

function normSP(raw: { [k: string]: string | string[] | undefined }): SP {
  const out: SP = {}
  for (const k of Object.keys(raw)) { const v = raw[k]; out[k] = Array.isArray(v) ? v[0] : v }
  return out
}

type Filters = {
  country: CountryResolution; genreId?: number; genreName?: string
  decade?: number; type?: string; sort: 'newest' | 'popular'; page: number
}

const resolveFilters = cache(async (sp: SP): Promise<Filters & { genres: any[]; countries: any[] }> => {
  const [genres, countries] = await Promise.all([getGenreCounts(), getCountryCounts()])
  const country = resolveCountry(sp.country ?? 'all', countries.map((c) => c.country))
  const genre = sp.genre ? genres.find((g) => ltSlugify(g.name) === ltSlugify(sp.genre!)) : undefined
  const decade = sp.decade && /^\d{4}$/.test(sp.decade) ? parseInt(sp.decade, 10) : undefined
  const type = TYPE_OPTS.find((t) => t.key === sp.type)?.key
  const sort = sp.sort === 'popular' ? 'popular' : 'newest'
  const page = Math.max(1, parseInt(sp.page || '1', 10) || 1)
  return { genres, countries, country, genreId: genre?.genre_id, genreName: genre?.name, decade, type, sort, page }
})

async function fetchAlbums(f: Filters): Promise<{ items: HubAlbum[]; total: number }> {
  try {
    const sb = createAdminClient()
    const base = 'id, slug, title, year, month, cover_image_url, page_view_count, artist_id'
    const artistEmbed = f.genreId
      ? 'artists!albums_artist_id_fkey!inner(name, slug, country, artist_genres!inner(genre_id))'
      : 'artists!albums_artist_id_fkey!inner(name, slug, country)'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = sb.from('albums').select(`${base}, ${artistEmbed}`, { count: 'exact' })
      .not('cover_image_url', 'is', null)
      .not('year', 'is', null)
      .eq('is_upcoming', false)

    if (f.genreId) q = q.eq('artists.artist_genres.genre_id', f.genreId)
    if (f.country.mode === 'lt') q = q.eq('artists.country', LT_COUNTRY)
    else if (f.country.mode === 'world') q = q.neq('artists.country', LT_COUNTRY)
    else if (f.country.mode === 'name') q = q.eq('artists.country', f.country.name)
    if (f.decade) q = q.gte('year', f.decade).lt('year', f.decade + 10)
    if (f.type) { const col = TYPE_OPTS.find((t) => t.key === f.type)!.col; q = q.eq(col, true) }

    if (f.sort === 'popular') q = q.order('page_view_count', { ascending: false, nullsFirst: false }).order('year', { ascending: false })
    else q = q.order('year', { ascending: false }).order('month', { ascending: false, nullsFirst: false }).order('id', { ascending: false })

    const from = (f.page - 1) * PER_PAGE
    q = q.range(from, from + PER_PAGE - 1)
    const { data, count } = await q
    const items: HubAlbum[] = ((data || []) as any[]).map((a) => ({
      id: a.id, slug: a.slug ?? null, title: a.title, year: a.year ?? null,
      cover_image_url: a.cover_image_url ?? null, artist_id: a.artist_id,
      artist_name: a.artists?.name || '', artist_slug: a.artists?.slug || '',
    }))
    return { items, total: count || 0 }
  } catch {
    return { items: [], total: 0 }
  }
}

function heading(f: Filters): string {
  const parts: string[] = []
  if (f.genreName) parts.push(f.genreName.replace(/\s*muzika$/i, '').trim())
  if (f.country.mode === 'lt') parts.unshift('Lietuvos')
  else if (f.country.mode === 'world') parts.unshift('Pasaulio')
  else if (f.country.mode === 'name') parts.unshift(f.country.name)
  const typeLabel = f.type ? TYPE_OPTS.find((t) => t.key === f.type)!.label.toLowerCase() : 'albumai'
  let h = `${parts.join(' ')} ${typeLabel}`.trim()
  h = h.charAt(0).toUpperCase() + h.slice(1)
  if (f.decade) h += ` (${f.decade}-ųjų)`
  return h
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const sp = normSP(await searchParams)
  const f = await resolveFilters(sp)
  const h = heading(f)
  const title = `${h}${f.page > 1 ? ` (${f.page} psl.)` : ''} | music.lt`
  const description = `${h} — naršyk albumus pagal stilių, šalį, dešimtmetį ir tipą. Viršeliai, dainų sąrašai, išleidimo metai ir įvertinimai music.lt kataloge.`
  const cp = new URLSearchParams()
  if (sp.country && f.country.mode !== 'all') cp.set('country', sp.country)
  if (f.genreId) cp.set('genre', ltSlugify(f.genreName!))
  if (f.decade) cp.set('decade', String(f.decade))
  if (f.type) cp.set('type', f.type)
  if (f.page > 1) cp.set('page', String(f.page))
  const canonical = `${SITE_URL}/albumai${cp.toString() ? `?${cp}` : ''}`
  return { title, description, alternates: { canonical }, openGraph: { title, description, url: canonical, type: 'website' } }
}

function buildHref(sp: SP, over: Partial<SP>): string {
  const u = new URLSearchParams()
  const merged = { ...sp, ...over }
  for (const k of ['country', 'genre', 'decade', 'type', 'sort', 'page']) {
    const v = merged[k]
    if (v && !(k === 'page' && v === '1')) u.set(k, v)
  }
  const s = u.toString()
  return `/albumai${s ? `?${s}` : ''}`
}

function Chip({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return <Link href={href} className={`flt-chip${active ? ' on' : ''}`} prefetch={false}>{children}</Link>
}

export default async function AlbumsIndexPage({ searchParams }: PageProps) {
  const sp = normSP(await searchParams)
  const f = await resolveFilters(sp)
  const { items, total } = await fetchAlbums(f)
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))
  const h = heading(f)
  const topGenres = [...f.genres].sort((a, b) => b.n - a.n).slice(0, 10)

  // Filtrus išlaikom, bet keisdami juos resetinam page.
  const reset = (over: Partial<SP>) => buildHref(sp, { ...over, page: '1' })

  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: `${h} — music.lt`,
    url: `${SITE_URL}/albumai`, isPartOf: { '@type': 'WebSite', name: 'music.lt', url: SITE_URL },
    mainEntity: { '@type': 'ItemList', itemListElement: items.slice(0, 20).map((a, i) => ({
      '@type': 'ListItem', position: i + 1, url: `${SITE_URL}${albumHref(a)}`, name: `${a.title} — ${a.artist_name}`,
    })) },
  }

  return (
    <div className="mz">
      <style>{muzikaStyles}</style>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="mz-hero">
        <div className="mz-hero-inner">
          <h1>{h}</h1>
          <p className="mz-hero-lead">Naršyk Lietuvos ir pasaulio atlikėjų albumus — filtruok pagal stilių, šalį, dešimtmetį ir tipą.</p>
        </div>
      </header>

      <div className="mz-wrap">
        <div className="mz-fbar">
          <div className="mz-frow">
            <span className="mz-flbl">Rūšiuoti</span>
            <Chip href={reset({ sort: undefined })} active={f.sort === 'newest'}>Naujausi</Chip>
            <Chip href={reset({ sort: 'popular' })} active={f.sort === 'popular'}>Populiariausi</Chip>
          </div>
          <div className="mz-frow">
            <span className="mz-flbl">Šalis</span>
            <Chip href={f.country.mode === 'lt' ? reset({ country: undefined }) : reset({ country: 'lt' })} active={f.country.mode === 'lt'}>🇱🇹 Lietuva</Chip>
            <Chip href={f.country.mode === 'world' ? reset({ country: undefined }) : reset({ country: 'world' })} active={f.country.mode === 'world'}>🌍 Pasaulis</Chip>
          </div>
          <div className="mz-frow">
            <span className="mz-flbl">Tipas</span>
            {TYPE_OPTS.map((t) => <Chip key={t.key} href={f.type === t.key ? reset({ type: undefined }) : reset({ type: t.key })} active={f.type === t.key}>{t.label}</Chip>)}
          </div>
          <div className="mz-frow" id="stiliai" style={{ scrollMarginTop: 80 }}>
            <span className="mz-flbl">Stilius</span>
            {topGenres.map((g) => (
              <Chip key={g.genre_id} href={f.genreId === g.genre_id ? reset({ genre: undefined }) : reset({ genre: ltSlugify(g.name) })} active={f.genreId === g.genre_id}>
                {g.name.replace(/\s*muzika$/i, '')}
              </Chip>
            ))}
          </div>
          <div className="mz-frow">
            <span className="mz-flbl">Dešimtmetis</span>
            {DECADES.map((d) => <Chip key={d} href={f.decade === d ? reset({ decade: undefined }) : reset({ decade: String(d) })} active={f.decade === d}>{d}-ieji</Chip>)}
          </div>
        </div>

        <div className="mz-count">{total.toLocaleString('lt-LT')} albumų</div>

        {items.length === 0 ? (
          <div className="mz-empty">
            <div className="mz-empty-ic">💿</div>
            <h3>Nieko nerasta</h3>
            <p>Pabandyk pakeisti filtrus arba <Link href="/albumai" style={{ color: 'var(--accent-link)' }}>peržiūrėti visus albumus</Link>.</p>
          </div>
        ) : (
          <>
            <div className="mz-acard-grid">
              {items.map((al) => <AlbumCard key={al.id} al={al} />)}
            </div>
            <Pagination sp={sp} page={f.page} totalPages={totalPages} />
          </>
        )}
      </div>
    </div>
  )
}

function Pagination({ sp, page, totalPages }: { sp: SP; page: number; totalPages: number }) {
  if (totalPages <= 1) return null
  const nums: number[] = []
  const add = (n: number) => { if (n >= 1 && n <= totalPages && !nums.includes(n)) nums.push(n) }
  add(1); add(2); for (let d = -1; d <= 1; d++) add(page + d); add(totalPages - 1); add(totalPages)
  nums.sort((a, b) => a - b)
  return (
    <nav className="mz-pager" aria-label="Puslapiai">
      {page > 1 && <Link href={buildHref(sp, { page: String(page - 1) })} className="mz-pg" rel="prev" prefetch={false}>‹</Link>}
      {nums.map((n, i) => (
        <span key={n} style={{ display: 'contents' }}>
          {i > 0 && n - nums[i - 1] > 1 && <span className="mz-pg-dots">…</span>}
          {n === page ? <span className="mz-pg mz-pg-cur" aria-current="page">{n}</span>
            : <Link href={buildHref(sp, { page: String(n) })} className="mz-pg" prefetch={false}>{n}</Link>}
        </span>
      ))}
      {page < totalPages && <Link href={buildHref(sp, { page: String(page + 1) })} className="mz-pg" rel="next" prefetch={false}>›</Link>}
    </nav>
  )
}
