// lib/muzika-hub.ts
//
// Duomenų sluoksnis /muzika hub'ui ir /muzikos-stilius stilių landing puslapiams.
// VISI fetch'ai server-side, cache'inami (react cache + ISR revalidate),
// ir apgaubti try/catch — kaip sitemap.ts, kad build-time DB nepasiekiamumas
// NEgriautų puslapio (degrade į tuščią, runtime užsipildo per revalidate).
//
// SEO mindset: hub render'inamas serveryje su tikrais <a> link'ais į atlikėjus,
// albumus, dainas, stilius ir šalis — tankus vidinių nuorodų tinklas paskirsto
// crawl equity į entity puslapius. Gilus naršymas lieka /atlikejai, /albumai,
// /dainos facet puslapiuose su savo canonical'ais.
//
// „Trending" filosofija (žr. Edvardo feedback 2026-06-02): NENAUDOJAM all-time
// `score` (rodytų legendas kaip Mamontovas, ne dabar populiarius kaip Jessica
// Shy). Vietoj to — dabartiniai topai (external_charts is_current + voting
// top_entries) PLIUS naujausi pasirodymai (video_uploaded_at). Score lieka tik
// kaip paskutinis fallback, kad sekcija niekada nebūtų tuščia.

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase'
import { LT_COUNTRY, ltSlugify } from '@/lib/artist-browse'

/* ────────────────────────────── Types ────────────────────────────── */

export type HubArtist = {
  id: number
  slug: string
  name: string
  country: string | null
  type: string
  cover_image_url: string | null
  cover_image_position: string | null
  is_verified: boolean | null
  score: number | null
}

export type HubAlbum = {
  id: number
  slug: string | null
  title: string
  year: number | null
  cover_image_url: string | null
  artist_id: number
  artist_name: string
  artist_slug: string
}

export type HubTrack = {
  id: number
  slug: string | null
  title: string
  cover_url: string | null
  video_views: number | null
  artist_id: number
  artist_name: string
  artist_slug: string
}

export type GenreCount = { genre_id: number; name: string; n: number }
export type SubstyleCount = { substyle_id: number; name: string; slug: string; n: number }
export type CountryCount = { country: string; n: number }

/** Hub apimtis: visa / tik Lietuva / tik užsienis. */
export type HubScope = 'all' | 'lt' | 'world'

const ARTIST_COLS =
  'id, slug, name, country, type, cover_image_url, cover_image_position, is_verified, score'

const LT_COUNTRIES = [LT_COUNTRY, 'LT', 'Lithuania']
function isLT(country: string | null | undefined): boolean {
  return !country || LT_COUNTRIES.includes(country)
}

/* ───────────────────────── Artist by-ids (order preserved) ───────────────────────── */

/** Paima atlikėjus pagal id sąrašą ir grąžina TA PAČIA tvarka (signalų rank). */
async function fetchArtistsByIds(ids: number[]): Promise<HubArtist[]> {
  if (ids.length === 0) return []
  try {
    const sb = createAdminClient()
    const { data } = await sb.from('artists').select(ARTIST_COLS).in('id', ids)
    const byId = new Map<number, HubArtist>()
    for (const a of (data || []) as HubArtist[]) byId.set(a.id, a)
    return ids.map((id) => byId.get(id)).filter(Boolean) as HubArtist[]
  } catch {
    return []
  }
}

/* ───────────────────────── Trending signalai ───────────────────────── */

/** Atlikėjų id iš DABARTINIŲ external charts (is_current), pagal geriausią
 *  poziciją. scope: 'lt' → LT topai, 'world' → pasaulio. */
async function currentChartArtistIds(scope: 'lt' | 'world'): Promise<number[]> {
  try {
    const sb = createAdminClient()
    const { data: charts } = await sb
      .from('external_charts')
      .select('id, scope')
      .eq('is_current', true)
      .eq('scope', scope)
    const chartIds = ((charts || []) as any[]).map((c) => c.id)
    if (chartIds.length === 0) return []
    const { data: entries } = await sb
      .from('external_chart_entries')
      .select('artist_id, position')
      .in('chart_id', chartIds)
      .not('artist_id', 'is', null)
      .order('position', { ascending: true })
      .limit(400)
    const best = new Map<number, number>()
    for (const e of (entries || []) as any[]) {
      const cur = best.get(e.artist_id)
      if (cur === undefined || e.position < cur) best.set(e.artist_id, e.position)
    }
    return [...best.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id)
  } catch {
    return []
  }
}

/** Atlikėjų id iš naujausių pasirodymų (video_uploaded_at, paskutiniai ~180 d.),
 *  dedup per atlikėją, filtruoti pagal scope (LT/pasaulis). */
async function recentReleaseArtistIds(scope: 'lt' | 'world'): Promise<number[]> {
  try {
    const sb = createAdminClient()
    const since = new Date(Date.now() - 180 * 86_400_000).toISOString()
    const { data } = await sb
      .from('tracks')
      .select('artist_id, video_uploaded_at, artists!tracks_artist_id_fkey(country)')
      .not('video_uploaded_at', 'is', null)
      .gte('video_uploaded_at', since)
      .order('video_uploaded_at', { ascending: false })
      .limit(300)
    const out: number[] = []
    const seen = new Set<number>()
    for (const t of (data || []) as any[]) {
      if (!t.artist_id || seen.has(t.artist_id)) continue
      const lt = isLT(t.artists?.country)
      if ((scope === 'lt') !== lt) continue
      seen.add(t.artist_id)
      out.push(t.artist_id)
    }
    return out
  } catch {
    return []
  }
}

/** Fallback — top atlikėjai pagal all-time score (kad sekcija nebūtų tuščia). */
async function topScoreArtistIds(scope: 'lt' | 'world', limit: number): Promise<number[]> {
  try {
    const sb = createAdminClient()
    let q = sb
      .from('artists')
      .select('id')
      .order('score', { ascending: false, nullsFirst: false })
      .order('name', { ascending: true })
      .limit(limit)
    q = scope === 'lt' ? q.eq('country', LT_COUNTRY) : q.neq('country', LT_COUNTRY)
    const { data } = await q
    return ((data || []) as any[]).map((a) => a.id)
  } catch {
    return []
  }
}

/** „Šiuo metu populiaru" atlikėjai: charts → naujausi releases → score fallback.
 *  Dedup, scope (country) garantuotas po fetch'o. */
export const getTrendingArtists = cache(
  async (scope: 'lt' | 'world', limit = 12): Promise<HubArtist[]> => {
    const [chartIds, recentIds] = await Promise.all([
      currentChartArtistIds(scope),
      recentReleaseArtistIds(scope),
    ])
    // Merge: charts pirma (autoritetas), tada naujausi releases.
    const merged: number[] = []
    const seen = new Set<number>()
    for (const id of [...chartIds, ...recentIds]) {
      if (!seen.has(id)) { seen.add(id); merged.push(id) }
    }
    let artists = await fetchArtistsByIds(merged)
    // Scope filtras (charts country gali nesutapti su artist country).
    artists = artists.filter((a) => (scope === 'lt') === isLT(a.country))
    // Fallback jei tuščia / per mažai.
    if (artists.length < limit) {
      const have = new Set(artists.map((a) => a.id))
      const fillIds = (await topScoreArtistIds(scope, limit * 2)).filter((id) => !have.has(id))
      const fill = await fetchArtistsByIds(fillIds)
      artists = [...artists, ...fill]
    }
    return artists.slice(0, limit)
  }
)

/** All-time populiariausi atlikėjai pagal score DESC (NE trending). Naudojam
 *  „Populiariausi visų laikų" bloke — legendos, ne dabar populiarūs. */
export const getPopularArtists = cache(
  async (scope: 'lt' | 'world', limit = 12): Promise<HubArtist[]> => {
    const ids = await topScoreArtistIds(scope, limit)
    return fetchArtistsByIds(ids)
  }
)

/* ──────────────────────────── Žanrai / stiliai / šalys ──────────────────────────── */

export const getGenreCounts = cache(async (): Promise<GenreCount[]> => {
  try {
    const sb = createAdminClient()
    const { data } = await sb.rpc('artist_genre_counts')
    return ((data || []) as GenreCount[]).filter((g) => g.name && g.n > 0)
  } catch {
    return []
  }
})

export const getSubstyleCounts = cache(async (): Promise<SubstyleCount[]> => {
  try {
    const sb = createAdminClient()
    const { data } = await sb.rpc('artist_substyle_counts')
    return ((data || []) as SubstyleCount[]).filter((s) => s.name && s.slug && s.n > 0)
  } catch {
    return []
  }
})

export const getCountryCounts = cache(async (): Promise<CountryCount[]> => {
  try {
    const sb = createAdminClient()
    const { data } = await sb.rpc('artist_country_counts')
    return ((data || []) as CountryCount[]).filter((c) => c.country && c.country !== LT_COUNTRY)
  } catch {
    return []
  }
})

export const findGenreBySlug = cache(async (slug: string): Promise<GenreCount | null> => {
  const s = (slug || '').trim().toLowerCase()
  if (!s) return null
  const genres = await getGenreCounts()
  return genres.find((g) => ltSlugify(g.name) === s) || null
})

/* ────────────────────────────── Albumai ────────────────────────────── */

function mapAlbumRow(a: any): HubAlbum {
  return {
    id: a.id,
    slug: a.slug ?? null,
    title: a.title,
    year: a.year ?? null,
    cover_image_url: a.cover_image_url ?? null,
    artist_id: a.artist_id,
    artist_name: a.artists?.name || '',
    artist_slug: a.artists?.slug || '',
  }
}

/** Naujausi albumai (su viršeliu + metais). scope → atlikėjo šalies filtras. */
export const getLatestAlbums = cache(async (scope: HubScope = 'all', limit = 12): Promise<HubAlbum[]> => {
  try {
    const sb = createAdminClient()
    // scope filtravimui reikia atlikėjo country → inner join. 'all' → paliekam
    // outer join (greičiau, neribojam).
    const join = scope === 'all'
      ? 'artists!albums_artist_id_fkey(name, slug)'
      : 'artists!inner(name, slug, country)'
    let q = sb
      .from('albums')
      .select(`id, slug, title, year, cover_image_url, artist_id, ${join}`)
      .not('cover_image_url', 'is', null)
      .not('year', 'is', null)
      .eq('is_upcoming', false)
    // Filtrai PRIEŠ .order/.range (žr. memory: supabase-js filter order).
    if (scope === 'lt') q = q.eq('artists.country', LT_COUNTRY)
    else if (scope === 'world') q = q.neq('artists.country', LT_COUNTRY)
    const { data } = await q
      .order('year', { ascending: false })
      .order('month', { ascending: false, nullsFirst: false })
      .limit(limit)
    return ((data || []) as any[]).map(mapAlbumRow)
  } catch {
    return []
  }
})

/** All-time populiariausi albumai: albumai daugiausiai klausomų (score) atlikėjų,
 *  po 1 albumą atlikėjui (šviežiausias su viršeliu), atlikėjo populiarumo tvarka.
 *  Albumai DB neturi atskiro popularumo metrikos, todėl naudojam atlikėjo score
 *  kaip proxy — „populiariausių atlikėjų albumai". */
export const getPopularAlbums = cache(async (scope: HubScope = 'all', limit = 12): Promise<HubAlbum[]> => {
  try {
    const sb = createAdminClient()
    let aq = sb.from('artists').select('id')
    if (scope === 'lt') aq = aq.eq('country', LT_COUNTRY)
    else if (scope === 'world') aq = aq.neq('country', LT_COUNTRY)
    const { data: arts } = await aq
      .order('score', { ascending: false, nullsFirst: false })
      .limit(limit * 3)
    const ids = ((arts || []) as any[]).map((a) => a.id)
    if (ids.length === 0) return []
    const { data } = await sb
      .from('albums')
      .select('id, slug, title, year, cover_image_url, artist_id, artists!albums_artist_id_fkey(name, slug)')
      .in('artist_id', ids)
      .not('cover_image_url', 'is', null)
      .not('year', 'is', null)
      .eq('is_upcoming', false)
      .order('year', { ascending: false })
    const byArtist = new Map<number, any>()
    for (const r of (data || []) as any[]) if (!byArtist.has(r.artist_id)) byArtist.set(r.artist_id, r)
    const out: HubAlbum[] = []
    for (const id of ids) {
      const a = byArtist.get(id)
      if (a) out.push(mapAlbumRow(a))
      if (out.length >= limit) break
    }
    return out
  } catch {
    return []
  }
})

/* ────────────────────────────── Dainos ────────────────────────────── */

function mapTrackRow(t: any): HubTrack {
  return {
    id: t.id,
    slug: t.slug ?? null,
    title: t.title,
    cover_url: t.cover_url ?? null,
    video_views: t.video_views ?? null,
    artist_id: t.artist_id,
    artist_name: t.artists?.name || '',
    artist_slug: t.artists?.slug || '',
  }
}

/** Naujausi pasirodymai (video_uploaded_at DESC), dedup per atlikėją. Dinamiška
 *  — atsinaujina su kiekvienu nauju release'u (priešingai nei statiškas
 *  „daugiausiai klausomų" all-time sąrašas). */
export const getNewestTracks = cache(async (scope: HubScope = 'all', limit = 12): Promise<HubTrack[]> => {
  try {
    const sb = createAdminClient()
    const since = new Date(Date.now() - 180 * 86_400_000).toISOString()
    const join = scope === 'all'
      ? 'artists!tracks_artist_id_fkey(name, slug)'
      : 'artists!inner(name, slug, country)'
    let q = sb
      .from('tracks')
      .select(`id, slug, title, cover_url, video_views, video_uploaded_at, artist_id, ${join}`)
      .not('video_uploaded_at', 'is', null)
      .gte('video_uploaded_at', since)
    if (scope === 'lt') q = q.eq('artists.country', LT_COUNTRY)
    else if (scope === 'world') q = q.neq('artists.country', LT_COUNTRY)
    const { data } = await q
      .order('video_uploaded_at', { ascending: false })
      .limit(limit * 4)
    const rows = ((data || []) as any[]).filter((t) => t.artists && t.title && t.title !== t.artists.name)
    const seen = new Set<number>()
    const out: HubTrack[] = []
    for (const r of rows) {
      if (seen.has(r.artist_id)) continue
      seen.add(r.artist_id)
      out.push(mapTrackRow(r))
      if (out.length >= limit) break
    }
    return out
  } catch {
    return []
  }
})

/** All-time populiariausios dainos pagal video_views DESC, dedup per atlikėją.
 *  scope → atlikėjo šalies filtras (DB lygyje per inner join). */
export const getPopularTracks = cache(async (scope: HubScope = 'all', limit = 12): Promise<HubTrack[]> => {
  try {
    const sb = createAdminClient()
    const join = scope === 'all'
      ? 'artists!tracks_artist_id_fkey(name, slug)'
      : 'artists!inner(name, slug, country)'
    let q = sb
      .from('tracks')
      .select(`id, slug, title, cover_url, video_views, artist_id, ${join}`)
      .not('video_views', 'is', null)
    if (scope === 'lt') q = q.eq('artists.country', LT_COUNTRY)
    else if (scope === 'world') q = q.neq('artists.country', LT_COUNTRY)
    const { data } = await q
      .order('video_views', { ascending: false, nullsFirst: false })
      .limit(limit * 5)
    const rows = ((data || []) as any[]).filter((t) => t.artists && t.title && t.title !== t.artists.name)
    const seen = new Set<number>()
    const out: HubTrack[] = []
    for (const r of rows) {
      if (seen.has(r.artist_id)) continue
      seen.add(r.artist_id)
      out.push(mapTrackRow(r))
      if (out.length >= limit) break
    }
    return out
  } catch {
    return []
  }
})

/* ──────────────────────── Per-style agregacija (/muzikos-stilius/[slug]) ──────────────────────── */

export const getStyleArtists = cache(
  async (genreId: number, scope: 'lt' | 'world' | 'all', limit = 12): Promise<HubArtist[]> => {
    try {
      const sb = createAdminClient()
      let q = sb
        .from('artists')
        .select(`${ARTIST_COLS}, artist_genres!inner(genre_id)`)
        .eq('artist_genres.genre_id', genreId)
        .order('score', { ascending: false, nullsFirst: false })
        .order('name', { ascending: true })
        .limit(limit)
      if (scope === 'lt') q = q.eq('country', LT_COUNTRY)
      else if (scope === 'world') q = q.neq('country', LT_COUNTRY)
      const { data } = await q
      return (data || []) as any as HubArtist[]
    } catch {
      return []
    }
  }
)

export const getStyleAlbums = cache(async (genreId: number, limit = 8): Promise<HubAlbum[]> => {
  try {
    const sb = createAdminClient()
    const { data } = await sb
      .from('albums')
      .select('id, slug, title, year, cover_image_url, artist_id, artists!inner(name, slug, artist_genres!inner(genre_id))')
      .eq('artists.artist_genres.genre_id', genreId)
      .not('cover_image_url', 'is', null)
      .not('year', 'is', null)
      .order('year', { ascending: false })
      .limit(limit)
    return ((data || []) as any[]).map(mapAlbumRow)
  } catch {
    return []
  }
})

export const getStyleTracks = cache(async (genreId: number, limit = 10): Promise<HubTrack[]> => {
  try {
    const sb = createAdminClient()
    const { data } = await sb
      .from('tracks')
      .select('id, slug, title, cover_url, video_views, artist_id, artists!inner(name, slug, artist_genres!inner(genre_id))')
      .eq('artists.artist_genres.genre_id', genreId)
      .not('video_url', 'is', null)
      .not('video_views', 'is', null)
      .order('video_views', { ascending: false, nullsFirst: false })
      .limit(limit * 3)
    const rows = ((data || []) as any[]).filter((t) => t.artists && t.title)
    const seen = new Set<number>()
    const out: HubTrack[] = []
    for (const r of rows) {
      if (seen.has(r.artist_id)) continue
      seen.add(r.artist_id)
      out.push(mapTrackRow(r))
      if (out.length >= limit) break
    }
    return out
  } catch {
    return []
  }
})

/* ───────────────────────── Kolekcijos (data) ───────────────────────── */

/** Geriausi albumai kolekcijai: pagal žanrą (artist_genres) ARBA substilį
 *  (album_substyles) ARBA šalį (scope). Realus turinys — ne plonas puslapis. */
export const getCollectionAlbums = cache(async (
  opts: { genreName?: string; scope?: HubScope; substyleSlug?: string },
  limit = 30,
): Promise<HubAlbum[]> => {
  try {
    const sb = createAdminClient()
    if (opts.genreName) {
      const genres = await getGenreCounts()
      const genreId = genres.find((g) => g.name === opts.genreName)?.genre_id
      if (genreId == null) return []
      // 2 ŽINGSNIAI: gilus 3-lygių join'as (albums→artists→artist_genres)
      // grąžina tuščia (plg. getStyleAlbums), o 2-lygių atlikėjų filtras VEIKIA.
      // Todėl: (1) top žanro atlikėjų id, (2) jų albumai per .in().
      const { data: arts } = await sb
        .from('artists')
        .select('id, artist_genres!inner(genre_id)')
        .eq('artist_genres.genre_id', genreId)
        .order('score', { ascending: false, nullsFirst: false })
        .limit(150)
      const ids = ((arts || []) as any[]).map((a) => a.id)
      if (ids.length === 0) return []
      const { data } = await sb
        .from('albums')
        .select('id, slug, title, year, cover_image_url, artist_id, artists!albums_artist_id_fkey(name, slug)')
        .in('artist_id', ids)
        .not('cover_image_url', 'is', null)
        .not('year', 'is', null)
        .order('year', { ascending: false })
        .limit(limit)
      return ((data || []) as any[]).map(mapAlbumRow)
    }
    if (opts.substyleSlug) {
      // (1) substilio albumų id per album_substyles, (2) albumai per .in().
      const { data: links } = await sb
        .from('album_substyles')
        .select('album_id, substyles!inner(slug)')
        .eq('substyles.slug', opts.substyleSlug)
        .limit(400)
      const ids = ((links || []) as any[]).map((l) => l.album_id).filter(Boolean)
      if (ids.length === 0) return []
      const { data } = await sb
        .from('albums')
        .select('id, slug, title, year, cover_image_url, artist_id, artists!albums_artist_id_fkey(name, slug)')
        .in('id', ids)
        .not('cover_image_url', 'is', null)
        .not('year', 'is', null)
        .order('year', { ascending: false })
        .limit(limit)
      return ((data || []) as any[]).map(mapAlbumRow)
    }
    // Tik šalies apimtis → „geriausi" = populiariausių atlikėjų albumai.
    return getPopularAlbums(opts.scope ?? 'all', limit)
  } catch {
    return []
  }
})

/** Kuruotos dainos kolekcijai (collection_tracks lentelė) rankine tvarka.
 *  Jei lentelės nėra / tuščia → [] (puslapis pereina į noindex + browse). */
export const getCollectionTracks = cache(async (slug: string, limit = 80): Promise<HubTrack[]> => {
  try {
    const sb = createAdminClient()
    const { data: rows } = await sb
      .from('collection_tracks')
      .select('track_id, position')
      .eq('collection_slug', slug)
      .order('position', { ascending: true })
      .limit(limit)
    const ids = ((rows || []) as any[]).map((r) => r.track_id).filter(Boolean)
    if (ids.length === 0) return []
    const { data } = await sb
      .from('tracks')
      .select('id, slug, title, cover_url, video_views, artist_id, artists!tracks_artist_id_fkey(name, slug)')
      .in('id', ids)
    const byId = new Map<number, any>()
    for (const t of (data || []) as any[]) byId.set(t.id, t)
    return ids.map((id) => byId.get(id)).filter(Boolean).map(mapTrackRow)
  } catch {
    return []
  }
})

/** collection_slug → kuruotų dainų skaičius. Hub'e rodom tik užpildytas
 *  kolekcijas; sitemap'e indeksuojam tik tas, kurios turi turinio. */
export const getSongCollectionCounts = cache(async (): Promise<Record<string, number>> => {
  try {
    const sb = createAdminClient()
    const { data } = await sb.from('collection_tracks').select('collection_slug')
    const out: Record<string, number> = {}
    for (const r of (data || []) as any[]) out[r.collection_slug] = (out[r.collection_slug] || 0) + 1
    return out
  } catch {
    return {}
  }
})

/* ────────────────────────────── URL helpers ────────────────────────────── */

export function artistHref(a: { slug: string }): string {
  return `/atlikejai/${a.slug}`
}

// URL parser'iai (albumai/[slugId], dainos/[slugId]) tikisi `{anything}-{id}`
// — todėl fallback'as VISADA baigiasi `-{id}`.
export function albumHref(a: HubAlbum): string {
  if (a.artist_slug && a.slug) return `/albumai/${a.artist_slug}-${a.slug}-${a.id}`
  return `/albumai/${a.slug ? `${a.slug}-` : ''}${a.id}`
}

export function trackHref(t: HubTrack): string {
  if (t.artist_slug && t.slug) return `/dainos/${t.artist_slug}-${t.slug}-${t.id}`
  return `/dainos/${t.slug ? `${t.slug}-` : ''}${t.id}`
}

export function genreHref(g: { name: string }): string {
  return `/muzikos-stilius/${ltSlugify(g.name)}`
}
