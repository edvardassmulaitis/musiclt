// app/dainos/page.tsx
//
// Dainų naršymo katalogas — SERVER-RENDERED (SEO). Anksčiau /dainos turėjo tik
// [slugId] detales, indekso nebuvo (404). Filtrai (šalis / stilius) + rūšiavimas
// (populiarios / naujausios) URL query string'e → crawlinami variantai su
// canonical'ais; paginacija per <Link>.

import type { Metadata } from 'next'
import Link from 'next/link'
import { cache, type ReactNode } from 'react'
import { createAdminClient } from '@/lib/supabase'
import { LT_COUNTRY, SITE_URL, ltSlugify, resolveCountry, type CountryResolution } from '@/lib/artist-browse'
import { getGenreCounts, getCountryCounts, trackHref, type HubTrack } from '@/lib/muzika-hub'
import { muzikaStyles, TrackList } from '@/components/muzika-ui'

const PER_PAGE = 60

type SP = Record<string, string | undefined>
type PageProps = { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }

function normSP(raw: { [k: string]: string | string[] | undefined }): SP {
  const out: SP = {}
  for (const k of Object.keys(raw)) { const v = raw[k]; out[k] = Array.isArray(v) ? v[0] : v }
  return out
}

type Filters = {
  country: CountryResolution; genreId?: number; genreName?: string
  sort: 'popular' | 'newest'; page: number
}

const resolveFilters = cache(async (sp: SP): Promise<Filters & { genres: any[]; countries: any[] }> => {
  const [genres, countries] = await Promise.all([getGenreCounts(), getCountryCounts()])
  const country = resolveCountry(sp.country ?? 'all', countries.map((c) => c.country))
  const genre = sp.genre ? genres.find((g) => ltSlugify(g.name) === ltSlugify(sp.genre!)) : undefined
  const sort = sp.sort === 'newest' ? 'newest' : 'popular'
  const page = Math.max(1, parseInt(sp.page || '1', 10) || 1)
  return { genres, countries, country, genreId: genre?.genre_id, genreName: genre?.name, sort, page }
})

async function fetchTracks(f: Filters): Promise<{ items: HubTrack[]; total: number }> {
  try {
    const sb = createAdminClient()
    const base = 'id, slug, title, cover_url, video_views, video_uploaded_at, artist_id'
    const artistEmbed = f.genreId
      ? 'artists!tracks_artist_id_fkey!inner(name, slug, country, artist_genres!inner(genre_id))'
      : 'artists!tracks_artist_id_fkey!inner(name, slug, country)'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = sb.from('tracks').select(`${base}, ${artistEmbed}`, { count: 'exact' })
      .not('video_url', 'is', null)

    if (f.genreId) q = q.eq('artists.artist_genres.genre_id', f.genreId)
    if (f.country.mode === 'lt') q = q.eq('artists.country', LT_COUNTRY)
    else if (f.country.mode === 'world') q = q.neq('artists.country', LT_COUNTRY)
    else if (f.country.mode === 'name') q = q.eq('artists.country', f.country.name)

    if (f.sort === 'newest') q = q.order('video_uploaded_at', { ascending: false, nullsFirst: false }).order('id', { ascending: false })
    else q = q.order('video_views', { ascending: false, nullsFirst: false }).order('id', { ascending: false })

    const from = (f.page - 1) * PER_PAGE
    q = q.range(from, from + PER_PAGE - 1)
    const { data, count } = await q
    const items: HubTrack[] = ((data || []) as any[])
      .filter((t) => t.artists && t.title && t.title !== t.artists.name)
      .map((t) => ({
        id: t.id, slug: t.slug ?? null, title: t.title, cover_url: t.cover_url ?? null,
        video_views: t.video_views ?? null, artist_id: t.artist_id,
        artist_name: t.artists?.name || '', artist_slug: t.artists?.slug || '',
      }))
    return { items, total: count || 0 }
  } catch {
    return { items: [], total: 0 }
  }
}

function heading(f: Filters): string {
  const parts: string[] = []
  if (f.country.mode === 'lt') parts.push('Lietuvos')
  else if (f.country.mode === 'world') parts.push('Pasaulio')
  else if (f.country.mode === 'name') parts.push(f.country.name)
  if (f.genreName) parts.push(f.genreName.replace(/\s*muzika$/i, '').toLowerCase())
  const h = `${parts.join(' ')} dainos`.trim()
  return h.charAt(0).toUpperCase() + h.slice(1)
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const sp = normSP(await searchParams)
  const f = await resolveFilters(sp)
  const h = heading(f)
  const title = `${h}${f.page > 1 ? ` (${f.page} psl.)` : ''} | music.lt`
  const description = `${h} — klausyk ir naršyk dainas pagal stilių ir šalį, rūšiuok pagal populiarumą ar naujumą. Vaizdo klipai, žodžiai ir įvertinimai music.lt.`
  const cp = new URLSearchParams()
  if (sp.country && f.country.mode !== 'all') cp.set('country', sp.country)
  if (f.genreId) cp.set('genre', ltSlugify(f.genreName!))
  if (f.sort === 'newest') cp.set('sort', 'newest')
  if (f.page > 1) cp.set('page', String(f.page))
  const canonical = `${SITE_URL}/dainos${cp.toString() ? `?${cp}` : ''}`
  return { title, description, alternates: { canonical }, openGraph: { title, description, url: canonical, type: 'website' } }
}

function buildHref(sp: SP, over: Partial<SP>): string {
  const u = new URLSearchParams()
  const merged = { ...sp, ...over }
  for (const k of ['country', 'genre', 'sort', 'page']) {
    const v = merged[k]
    if (v && !(k === 'page' && v === '1')) u.set(k, v)
  }
  const s = u.toString()
  return `/dainos${s ? `?${s}` : ''}`
}

function Chip({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return <Link href={href} className={`flt-chip${active ? ' on' : ''}`} prefetch={false}>{children}</Link>
}

export default async function SongsIndexPage({ searchParams }: PageProps) {
  const sp = normSP(await searchParams)
  const f = await resolveFilters(sp)
  const { items, total } = await fetchTracks(f)
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))
  const h = heading(f)
  const topGenres = [...f.genres].sort((a, b) => b.n - a.n).slice(0, 10)
  const reset = (over: Partial<SP>) => buildHref(sp, { ...over, page: '1' })

  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: `${h} — music.lt`,
    url: `${SITE_URL}/dainos`, isPartOf: { '@type': 'WebSite', name: 'music.lt', url: SITE_URL },
    mainEntity: { '@type': 'ItemList', itemListElement: items.slice(0, 20).map((t, i) => ({
      '@type': 'ListItem', position: i + 1, url: `${SITE_URL}${trackHref(t)}`, name: `${t.title} — ${t.artist_name}`,
    })) },
  }

  return (
    <div className="mz">
      <style>{muzikaStyles}</style>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="mz-hero">
        <div className="mz-hero-inner">
          <h1>{h}</h1>
          <p className="mz-hero-lead">Naršyk dainas iš Lietuvos ir pasaulio — filtruok pagal stilių, šalį ir rūšiuok pagal populiarumą ar naujumą.</p>
        </div>
      </header>

      <div className="mz-wrap">
        <div className="mz-fbar">
          <div className="mz-frow">
            <span className="mz-flbl">Rūšiuoti</span>
            <Chip href={reset({ sort: undefined })} active={f.sort === 'popular'}>Populiariausios</Chip>
            <Chip href={reset({ sort: 'newest' })} active={f.sort === 'newest'}>Naujausios</Chip>
          </div>
          <div className="mz-frow">
            <span className="mz-flbl">Šalis</span>
            <Chip href={f.country.mode === 'lt' ? reset({ country: undefined }) : reset({ country: 'lt' })} active={f.country.mode === 'lt'}>🇱🇹 Lietuva</Chip>
            <Chip href={f.country.mode === 'world' ? reset({ country: undefined }) : reset({ country: 'world' })} active={f.country.mode === 'world'}>🌍 Pasaulis</Chip>
          </div>
          <div className="mz-frow">
            <span className="mz-flbl">Stilius</span>
            {topGenres.map((g) => (
              <Chip key={g.genre_id} href={f.genreId === g.genre_id ? reset({ genre: undefined }) : reset({ genre: ltSlugify(g.name) })} active={f.genreId === g.genre_id}>
                {g.name.replace(/\s*muzika$/i, '')}
              </Chip>
            ))}
          </div>
        </div>

        <div className="mz-count">{total.toLocaleString('lt-LT')} dainų</div>

        {items.length === 0 ? (
          <div className="mz-empty">
            <div className="mz-empty-ic">🎵</div>
            <h3>Nieko nerasta</h3>
            <p>Pabandyk pakeisti filtrus arba <Link href="/dainos" style={{ color: 'var(--accent-link)' }}>peržiūrėti visas dainas</Link>.</p>
          </div>
        ) : (
          <>
            <TrackList tracks={items} />
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
