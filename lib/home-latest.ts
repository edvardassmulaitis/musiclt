/**
 * Homepage'o „Naujos dainos" + „Nauji albumai" + „Naujienos" fetcher'iai.
 *
 * Visi sąrašai keshuojami per Next.js `unstable_cache` su tag'ais — admin'as
 * po nauja įrašo INSERT/UPDATE iškviečia `revalidateHomeTag(...)` ir cache
 * iškart išsivalo. Antraip `revalidate: 300` (5 min) atnaujina automatiškai.
 *
 * Reikalavimai (žr. SESSION 2026-05-28 plan):
 *   Naujos dainos:
 *     - Order: `video_uploaded_at DESC` (YT upload date)
 *     - Filter: `video_uploaded_at IS NOT NULL` ir paskutinės 90 dienų
 *     - Country lane split: LT (Lietuva/LT/Lithuania ar NULL) vs World
 *     - Dedupe per artist: jei tas pats atlikėjas turi kelis fresh tracks,
 *       imam tą, kuris turi daugiausiai `video_views`
 *
 *   Nauji albumai:
 *     - Order: `year DESC, month DESC NULLS LAST, day DESC NULLS LAST`
 *     - Filter: `year IS NOT NULL` (kitaip Postgres'as deda NULL'us pradžiai)
 *     - Country lane split: ta pati LT/World logika
 *
 *   Naujienos (modern + legacy):
 *     - Filter: `published_at >= NOW() - 30 days`
 *     - Modern news priority — legacy discussions po jo
 */

import { unstable_cache, revalidateTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase'

/* ────────────────────────────── Constants ────────────────────────────── */

const LT_COUNTRIES = ['Lietuva', 'LT', 'Lithuania']

// 90 dienų — pakankamai šviežių LT releasų. Jei keisti, taip pat atnaujinti
// memory.md ir homepage SectionHead label'ą („Naujausios").
export const LATEST_TRACK_WINDOW_DAYS = 90
export const LATEST_ALBUM_WINDOW_DAYS = 90 * 4  // ~12 mėn (albumai retesni)
export const LATEST_NEWS_WINDOW_DAYS = 30

// Per lane'ą rodom 10 įrašų. Fetch'inam daugiau kandidatų prieš dedupe.
export const HOME_LANE_LIMIT = 10
const TRACKS_CANDIDATE_FETCH_LIMIT = 200
const ALBUMS_CANDIDATE_FETCH_LIMIT = 200

/* ────────────────────────────── Tags ────────────────────────────── */

export const HOME_TAGS = {
  tracks: 'home:tracks-latest',
  albums: 'home:albums-latest',
  news: 'home:news-latest',
  events: 'home:events-latest',
} as const

/** Iškviečiamas iš POST/PUT/DELETE endpoint'ų po naujo track/album/news/event. */
export function revalidateHomeTag(kind: keyof typeof HOME_TAGS) {
  try {
    revalidateTag(HOME_TAGS[kind])
  } catch {
    /* dev mode silently no-ops */
  }
}

/* ────────────────────────────── Entity page tags ──────────────────────────────
   Atskiri tag'ai entity page'ams (artist, album, track, user). Kviečiama iš
   admin PATCH/PUT/DELETE endpoint'ų — ISR cache iškart išvalo, kitas user'is
   gauna fresh duomenis. Skiriasi nuo HOME_TAGS tuo, kad šitie taikomi
   detail puslapiams, ne homepage'o lane'ams.
*/
export const ENTITY_TAGS = {
  artist: 'artist',
  album: 'album',
  track: 'track',
  user: 'user',
} as const

export function revalidateEntityTag(kind: keyof typeof ENTITY_TAGS) {
  try {
    revalidateTag(ENTITY_TAGS[kind])
  } catch {
    /* dev mode silently no-ops */
  }
}

/* ────────────────────────────── Types ────────────────────────────── */

type LatestTrackArtist = {
  id: number
  name: string
  slug: string
  cover_image_url: string | null
  country: string | null
}

type LatestTrackRow = {
  id: number
  title: string
  slug: string | null
  cover_url: string | null
  video_url: string | null
  video_views: number | null
  video_uploaded_at: string | null
  artist_id: number
  artists: LatestTrackArtist | null
}

type LatestAlbumRow = {
  id: number
  title: string
  slug: string | null
  cover_image_url: string | null
  year: number | null
  month: number | null
  day: number | null
  is_upcoming: boolean | null
  artist_id: number
  artists: { id: number; name: string; slug: string; cover_image_url: string | null; country: string | null } | null
}

/* ────────────────────────────── Helpers ────────────────────────────── */

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

function isLT(country: string | null | undefined): boolean {
  if (!country) return true
  return LT_COUNTRIES.includes(country)
}

/* ────────────────────────────── Tracks ────────────────────────────── */

async function fetchLatestTracksRaw(): Promise<LatestTrackRow[]> {
  const supabase = createAdminClient()
  const since = isoDaysAgo(LATEST_TRACK_WINDOW_DAYS)
  const { data, error } = await supabase
    .from('tracks')
    .select(
      'id, title, slug, cover_url, video_url, video_views, video_uploaded_at, artist_id, ' +
        'artists!tracks_artist_id_fkey(id, name, slug, cover_image_url, country)'
    )
    .not('video_uploaded_at', 'is', null)
    .gte('video_uploaded_at', since)
    .order('video_uploaded_at', { ascending: false })
    .limit(TRACKS_CANDIDATE_FETCH_LIMIT)
  if (error) throw error
  return (data || []) as unknown as LatestTrackRow[]
}

/** Cache'inta raw fetch'inimo funkcija. Vidinis arg pirmiausia veikia kaip
 *  hash-key komponentas (pliusas Vercel'iui), bet versija „v1" leis ateityje
 *  bump'inti cache'ą be tag invalidation'o. */
const cachedFetchLatestTracksRaw = unstable_cache(
  async (_version: string) => fetchLatestTracksRaw(),
  ['home-latest-tracks-raw'],
  { tags: [HOME_TAGS.tracks], revalidate: 300 }
)

/**
 * Grąžina LT + World lane'us su top N (po dedupe per artist).
 * Dedupe taisyklė: kai artist'as turi >=2 šviežius tracks, paliekam tą su
 * didžiausiu video_views skaičiumi. Po dedupe rūšiuojam vėl pagal datą DESC.
 */
export async function getLatestTracksForHome(): Promise<{
  lt: LatestTrackRow[]
  world: LatestTrackRow[]
}> {
  const rows = await cachedFetchLatestTracksRaw('v1')

  // Filtruojam mojibake / placeholder titles, kur title == artist name.
  const valid = rows.filter(r => r.artists && r.title && r.title !== r.artists.name)

  const dedupe = (arr: LatestTrackRow[]) => {
    const byArtist = new Map<number, LatestTrackRow>()
    for (const r of arr) {
      const existing = byArtist.get(r.artist_id)
      if (!existing) {
        byArtist.set(r.artist_id, r)
        continue
      }
      const exV = existing.video_views ?? 0
      const rV = r.video_views ?? 0
      if (rV > exV) byArtist.set(r.artist_id, r)
    }
    // Atstatom rūšiavimą pagal upload datą DESC (Map saugojo paskutinį, ne tvarką).
    return Array.from(byArtist.values()).sort((a, b) => {
      const ta = a.video_uploaded_at ? Date.parse(a.video_uploaded_at) : 0
      const tb = b.video_uploaded_at ? Date.parse(b.video_uploaded_at) : 0
      return tb - ta
    })
  }

  const lt = dedupe(valid.filter(r => isLT(r.artists?.country))).slice(0, HOME_LANE_LIMIT)
  const world = dedupe(valid.filter(r => !isLT(r.artists?.country))).slice(0, HOME_LANE_LIMIT)
  return { lt, world }
}

/* ────────────────────────────── Albums ────────────────────────────── */

async function fetchLatestAlbumsRaw(): Promise<LatestAlbumRow[]> {
  const supabase = createAdminClient()
  // Pinam ne tik 90d back ranges — albumai turi tik year/month/day be timestamp'o.
  // Skirta filter'is — bent metai turi būti šių arba praeitų metų (current-1 ar
  // current). Be šito „latest" rodytų visus kurie turi year != NULL.
  const currentYear = new Date().getFullYear()
  const { data, error } = await supabase
    .from('albums')
    .select(
      'id, title, slug, cover_image_url, year, month, day, is_upcoming, artist_id, ' +
        'artists!albums_artist_id_fkey(id, name, slug, cover_image_url, country)'
    )
    .not('year', 'is', null)
    .gte('year', currentYear - 1)
    .order('year', { ascending: false })
    .order('month', { ascending: false, nullsFirst: false })
    .order('day', { ascending: false, nullsFirst: false })
    .limit(ALBUMS_CANDIDATE_FETCH_LIMIT)
  if (error) throw error
  return (data || []) as unknown as LatestAlbumRow[]
}

const cachedFetchLatestAlbumsRaw = unstable_cache(
  async (_version: string) => fetchLatestAlbumsRaw(),
  ['home-latest-albums-raw'],
  { tags: [HOME_TAGS.albums], revalidate: 300 }
)

export async function getLatestAlbumsForHome(): Promise<{
  lt: LatestAlbumRow[]
  world: LatestAlbumRow[]
}> {
  const rows = await cachedFetchLatestAlbumsRaw('v1')
  const lt = rows.filter(r => r.artists && isLT(r.artists.country)).slice(0, HOME_LANE_LIMIT)
  const world = rows.filter(r => r.artists && !isLT(r.artists.country)).slice(0, HOME_LANE_LIMIT)
  return { lt, world }
}

/* ────────────────────────────── Map helpers ──────────────────────────────
   Backward-compat'us output'o formavimas — homepage UI'ui reikalingi `artists`
   nested objektai + flat aliases (artist_slug, artist_name). Adapt'inam į tą
   patį shape'ą, kaip ir esamas /api/tracks ir /api/albums.
*/

export function mapTrackForHome(t: LatestTrackRow) {
  return {
    id: t.id,
    title: t.title,
    slug: t.slug,
    cover_url: t.cover_url,
    video_url: t.video_url,
    video_views: t.video_views ?? null,
    video_uploaded_at: t.video_uploaded_at,
    artist_id: t.artist_id,
    artists: t.artists,
    artist_name: t.artists?.name || '',
    artist_slug: t.artists?.slug || '',
  }
}

export function mapAlbumForHome(a: LatestAlbumRow) {
  const release_date =
    a.year && a.month && a.day
      ? `${a.year}-${String(a.month).padStart(2, '0')}-${String(a.day).padStart(2, '0')}`
      : a.year && a.month
        ? `${a.year}-${String(a.month).padStart(2, '0')}-01`
        : null
  return {
    id: a.id,
    title: a.title,
    slug: a.slug,
    cover_image_url: a.cover_image_url,
    cover_url: a.cover_image_url,
    year: a.year,
    month: a.month,
    day: a.day,
    is_upcoming: a.is_upcoming,
    release_date,
    artist_id: a.artist_id,
    artists: a.artists,
    artist_name: a.artists?.name || '',
    artist_slug: a.artists?.slug || '',
  }
}
