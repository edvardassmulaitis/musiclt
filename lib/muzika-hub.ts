// lib/muzika-hub.ts
//
// Duomenų sluoksnis /muzika hub'ui ir /zanrai stilių landing puslapiams.
// VISI fetch'ai server-side, cache'inami (react cache + ISR revalidate),
// ir apgaubti try/catch — kaip sitemap.ts, kad build-time DB nepasiekiamumas
// NEgriautų puslapio (degrade į tuščią, runtime užsipildo per revalidate).
//
// SEO mindset: hub render'inamas serveryje su tikrais <a> link'ais į atlikėjus,
// albumus, dainas, stilius ir šalis — tankus vidinių nuorodų tinklas paskirsto
// crawl equity į ~12k entity puslapių. Patys sąrašai čia tik „pjūviai" (po
// nedidelį kiekį iš kategorijos), o gilus naršymas lieka facet puslapiuose
// (/atlikejai?country=, ?genre=) su savo canonical'ais — taip vengiam duplicate
// content'o tarp /muzika ir /atlikejai.

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
export type CountryCount = { country: string; n: number }

const ARTIST_COLS =
  'id, slug, name, country, type, cover_image_url, cover_image_position, is_verified, score'

/* ────────────────────────── Trending atlikėjai ────────────────────────── */

/** Populiariausi atlikėjai pagal `score` (all-time). `scope`: lt / world. */
export const getTrendingArtists = cache(
  async (scope: 'lt' | 'world', limit = 12): Promise<HubArtist[]> => {
    try {
      const sb = createAdminClient()
      let q = sb
        .from('artists')
        .select(ARTIST_COLS)
        .order('score', { ascending: false, nullsFirst: false })
        .order('name', { ascending: true })
        .limit(limit)
      q = scope === 'lt' ? q.eq('country', LT_COUNTRY) : q.neq('country', LT_COUNTRY)
      const { data } = await q
      return (data || []) as HubArtist[]
    } catch {
      return []
    }
  }
)

/* ──────────────────────────── Žanrai / šalys ──────────────────────────── */

/** Top-level žanrai su atlikėjų skaičiumi (artist_genre_counts RPC). */
export const getGenreCounts = cache(async (): Promise<GenreCount[]> => {
  try {
    const sb = createAdminClient()
    const { data } = await sb.rpc('artist_genre_counts')
    return ((data || []) as GenreCount[]).filter((g) => g.name && g.n > 0)
  } catch {
    return []
  }
})

/** Šalys su atlikėjų skaičiumi (artist_country_counts RPC), be Lietuvos
 *  (ji rodoma atskirai kaip pagrindinė auditorija). */
export const getCountryCounts = cache(async (): Promise<CountryCount[]> => {
  try {
    const sb = createAdminClient()
    const { data } = await sb.rpc('artist_country_counts')
    return ((data || []) as CountryCount[]).filter((c) => c.country && c.country !== LT_COUNTRY)
  } catch {
    return []
  }
})

/** Žanro slug → GenreCount (reverse lookup /zanrai/[slug] puslapiui). */
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

/** Naujausi albumai (su viršeliu + metais), naujausi viršuje. */
export const getLatestAlbums = cache(async (limit = 12): Promise<HubAlbum[]> => {
  try {
    const sb = createAdminClient()
    const { data } = await sb
      .from('albums')
      .select('id, slug, title, year, cover_image_url, artist_id, artists!albums_artist_id_fkey(name, slug)')
      .not('cover_image_url', 'is', null)
      .not('year', 'is', null)
      .eq('is_upcoming', false)
      .order('year', { ascending: false })
      .order('month', { ascending: false, nullsFirst: false })
      .limit(limit)
    return ((data || []) as any[]).map(mapAlbumRow)
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

/** Populiariausios dainos pagal YouTube peržiūras (su video + viršeliu). */
export const getPopularTracks = cache(async (limit = 12): Promise<HubTrack[]> => {
  try {
    const sb = createAdminClient()
    const { data } = await sb
      .from('tracks')
      .select(
        'id, slug, title, cover_url, video_views, artist_id, artists!tracks_artist_id_fkey(name, slug, country)'
      )
      .not('video_url', 'is', null)
      .not('video_views', 'is', null)
      .order('video_views', { ascending: false, nullsFirst: false })
      .limit(limit * 3) // fetch extra → dedupe per artist
    const rows = ((data || []) as any[]).filter((t) => t.artists && t.title)
    // Dedupe per atlikėją (kad nerodytume 5 tos pačios grupės dainų).
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

/* ──────────────────────── Per-style agregacija ──────────────────────── */
// /zanrai/[slug] landing'ams: top atlikėjai + naujausi albumai + populiarios
// dainos KONKRETAUS stiliaus. Junction per artist_genres!inner.

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
      .select(
        'id, slug, title, year, cover_image_url, artist_id, artists!inner(name, slug, artist_genres!inner(genre_id))'
      )
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
      .select(
        'id, slug, title, cover_url, video_views, artist_id, artists!inner(name, slug, artist_genres!inner(genre_id))'
      )
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
  return `/zanrai/${ltSlugify(g.name)}`
}
