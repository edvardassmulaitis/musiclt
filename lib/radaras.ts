// lib/radaras.ts
//
// Duomenų sluoksnis „Naujos muzikos radarui" (/nauji-atlikejai) — naujų ir
// mažai žinomų atlikėjų showcase. VISI fetch'ai server-side, react-cache'inami,
// apgaubti try/catch — kaip lib/muzika-hub.ts, kad build-time DB nepasiekiamumas
// NEgriautų puslapio (degrade į tuščią, runtime užsipildo per revalidate).
//
// ── EMERGING DETEKCIJA (hibridas) ──────────────────────────────────────────
// DB neturi švaraus „emerging" flag'o, o `legacy_id IS NULL` poolas yra
// užterštas chartų scaffold'u (užsienio atlikėjai klaidingai country='Lietuva',
// be profilio). `recent_score` neskaičiuojamas (visur 0), bandcamp/soundcloud
// stulpeliai tušti. VIENINTELIS gyvas šviežumo signalas — tracks.video_uploaded_at.
//
// Todėl auto-poolą statome ant:
//   country = 'Lietuva'  +  nesenas dainos įkėlimas (≤ RADAR_WINDOW_DAYS)
//   +  mažas legacy footprint (legacy_likes < RADAR_LIKES_CEIL — atmeta žvaigždes)
//   +  realus profilis (cover_image_url not null)
//   −  admin 'excluded' (paslepia mistag'us)
// Plius admin override per artists.radar_status (žr. 20260605_radaras.sql):
//   'featured' → spotlight viršuje, 'included' → priverstinai tinklelyje.

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase'
import { LT_COUNTRY, ltSlugify } from '@/lib/artist-browse'

/* ─────────────────────────── Tuning ─────────────────────────── */
/** „Šviežumo" langas — kiek dienų atgal dainos įkėlimas dar laikomas naujumu. */
export const RADAR_WINDOW_DAYS = 365
/** legacy_likes lubos — virš jų atlikėjas laikomas jau žinomu (ne radarui). */
export const RADAR_LIKES_CEIL = 250
/** Per kiek dienų nuo paskutinio įkėlimo atlikėjas žymimas „Šviežia".
 *  (created_at = bulk-importo data, todėl nepatikimas — naudojam dainos įkėlimą.) */
const FRESH_BADGE_DAYS = 45

/* ─────────────────────────── Types ─────────────────────────── */
export type RadarArtist = {
  id: number
  slug: string
  name: string
  country: string | null
  cover_image_url: string | null
  cover_image_position: string | null
  is_verified: boolean | null
  legacy_likes: number | null
  score: number | null
  radar_blurb: string | null
  genres: string[]
  latest_title: string | null
  latest_at: string | null
  is_fresh: boolean
}

export type RadarTrack = {
  id: number
  slug: string | null
  title: string
  cover_url: string | null
  video_views: number | null
  uploaded_at: string | null
  artist_id: number
  artist_name: string
  artist_slug: string
}

export type RadarStats = {
  emerging: number
  freshTracks: number
  featured: number
}

const ARTIST_COLS =
  'id, slug, name, country, cover_image_url, cover_image_position, is_verified, legacy_likes, score, radar_status, radar_blurb, radar_sort, radar_set_at, created_at'

const SINCE = () =>
  new Date(Date.now() - RADAR_WINDOW_DAYS * 86_400_000).toISOString()

/* ─────────────────── Genres helper (batch) ─────────────────── */
/** Grąžina map artist_id → iki 2 stilių pavadinimų (radaro kortelės žymei). */
async function genresForArtists(ids: number[]): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>()
  if (ids.length === 0) return out
  try {
    const sb = createAdminClient()
    const { data } = await sb
      .from('artist_genres')
      .select('artist_id, genres(name)')
      .in('artist_id', ids)
    for (const r of (data || []) as any[]) {
      const name = r.genres?.name
      if (!name) continue
      const arr = out.get(r.artist_id) || []
      if (arr.length < 2 && !arr.includes(name)) arr.push(name)
      out.set(r.artist_id, arr)
    }
  } catch { /* degrade — kortelės be žanro žymės */ }
  return out
}

/** Admin 'excluded' atlikėjų id rinkinys (mistag'ams paslėpti). */
const excludedIds = cache(async (): Promise<Set<number>> => {
  try {
    const sb = createAdminClient()
    const { data } = await sb.from('artists').select('id').eq('radar_status', 'excluded')
    return new Set(((data || []) as any[]).map((a) => a.id))
  } catch {
    return new Set()
  }
})

/* ─────────── Latest LT track uploads (šviežumo signalas) ─────────── */
type LatestRow = {
  artist_id: number
  latest_title: string | null
  latest_at: string | null
  legacy_likes: number | null
}

/** Vienas fetch'as: naujausi LT track įkėlimai per langą, su atlikėjo meta.
 *  Grąžina TVARKINGĄ (recency desc) unikalių atlikėjų sąrašą + latest map. */
async function recentLtTrackArtists(limit = 700): Promise<{
  order: number[]
  latest: Map<number, LatestRow>
}> {
  const latest = new Map<number, LatestRow>()
  const order: number[] = []
  try {
    const sb = createAdminClient()
    const { data } = await sb
      .from('tracks')
      .select('artist_id, title, video_uploaded_at, artists!tracks_artist_id_fkey(country, legacy_likes, cover_image_url)')
      .not('video_uploaded_at', 'is', null)
      .gte('video_uploaded_at', SINCE())
      .order('video_uploaded_at', { ascending: false })
      .limit(limit)
    for (const t of (data || []) as any[]) {
      const a = t.artists || {}
      if (!t.artist_id) continue
      if (a.country !== LT_COUNTRY) continue
      if (!a.cover_image_url) continue
      const likes = a.legacy_likes ?? 0
      if (likes >= RADAR_LIKES_CEIL) continue
      if (!latest.has(t.artist_id)) {
        latest.set(t.artist_id, {
          artist_id: t.artist_id,
          latest_title: t.title ?? null,
          latest_at: t.video_uploaded_at ?? null,
          legacy_likes: a.legacy_likes ?? null,
        })
        order.push(t.artist_id)
      }
    }
  } catch { /* degrade */ }
  return { order, latest }
}

/** Paima atlikėjus pagal id sąrašą TA PAČIA tvarka + prilipdo genres / latest / is_new. */
async function hydrate(
  ids: number[],
  latest: Map<number, LatestRow>,
): Promise<RadarArtist[]> {
  if (ids.length === 0) return []
  try {
    const sb = createAdminClient()
    const { data } = await sb.from('artists').select(ARTIST_COLS).in('id', ids)
    const byId = new Map<number, any>()
    for (const a of (data || []) as any[]) byId.set(a.id, a)
    const genres = await genresForArtists(ids)
    const now = Date.now()
    const out: RadarArtist[] = []
    for (const id of ids) {
      const a = byId.get(id)
      if (!a) continue
      const lr = latest.get(id)
      const latestMs = lr?.latest_at ? Date.parse(lr.latest_at) : 0
      out.push({
        id: a.id,
        slug: a.slug,
        name: a.name,
        country: a.country,
        cover_image_url: a.cover_image_url,
        cover_image_position: a.cover_image_position,
        is_verified: a.is_verified,
        legacy_likes: a.legacy_likes,
        score: a.score,
        radar_blurb: a.radar_blurb ?? null,
        genres: genres.get(id) || [],
        latest_title: lr?.latest_title ?? null,
        latest_at: lr?.latest_at ?? null,
        is_fresh: latestMs > 0 && now - latestMs < FRESH_BADGE_DAYS * 86_400_000,
      })
    }
    return out
  } catch {
    return []
  }
}

/* ─────────────────────────── Public API ─────────────────────────── */

/** FEATURED — admin „prisegti" herojai (spotlight viršuje). */
export const getFeaturedArtists = cache(async (): Promise<RadarArtist[]> => {
  try {
    const sb = createAdminClient()
    const { data } = await sb
      .from('artists')
      .select('id')
      .eq('radar_status', 'featured')
      .order('radar_sort', { ascending: false })
      .order('radar_set_at', { ascending: false, nullsFirst: false })
      .limit(8)
    const ids = ((data || []) as any[]).map((a) => a.id)
    if (ids.length === 0) return []
    // latest map featured'ams (kad rodytume naujausią dainą)
    const { latest } = await recentLtTrackArtists()
    return hydrate(ids, latest)
  } catch {
    return []
  }
})

/** EMERGING tinklelis — included (admin) + auto-pool (nesenas LT release,
 *  mažas footprint, realus profilis). Featured atskirti viršuje, todėl čia
 *  juos praleidžiam. */
export const getEmergingArtists = cache(
  async (limit = 30): Promise<RadarArtist[]> => {
    try {
      const sb = createAdminClient()
      const [excl, included, recent] = await Promise.all([
        excludedIds(),
        sb.from('artists').select('id, radar_sort').eq('radar_status', 'included')
          .order('radar_sort', { ascending: false }).limit(40),
        recentLtTrackArtists(),
      ])
      const featuredSet = new Set(
        ((await sb.from('artists').select('id').eq('radar_status', 'featured')).data || [])
          .map((a: any) => a.id),
      )
      const includedIds = ((included.data || []) as any[]).map((a) => a.id)
      const ordered: number[] = []
      const seen = new Set<number>()
      const push = (id: number) => {
        if (seen.has(id) || excl.has(id) || featuredSet.has(id)) return
        seen.add(id); ordered.push(id)
      }
      includedIds.forEach(push)       // admin įtraukti — pirmi
      recent.order.forEach(push)      // tada auto-pool pagal šviežumą
      return hydrate(ordered.slice(0, limit), recent.latest)
    } catch {
      return []
    }
  },
)

/** ŠVIEŽIOS DAINOS — naujausi LT track įkėlimai nuo mažiau žinomų atlikėjų. */
export const getFreshTracks = cache(async (limit = 12): Promise<RadarTrack[]> => {
  try {
    const sb = createAdminClient()
    const excl = await excludedIds()
    const { data } = await sb
      .from('tracks')
      .select('id, slug, title, cover_url, video_views, video_uploaded_at, artist_id, artists!tracks_artist_id_fkey(name, slug, country, legacy_likes, cover_image_url)')
      .not('video_uploaded_at', 'is', null)
      .gte('video_uploaded_at', SINCE())
      .order('video_uploaded_at', { ascending: false })
      .limit(120)
    const out: RadarTrack[] = []
    for (const t of (data || []) as any[]) {
      const a = t.artists || {}
      if (a.country !== LT_COUNTRY) continue
      if ((a.legacy_likes ?? 0) >= RADAR_LIKES_CEIL) continue
      if (excl.has(t.artist_id)) continue
      out.push({
        id: t.id,
        slug: t.slug ?? null,
        title: t.title,
        cover_url: t.cover_url ?? a.cover_image_url ?? null,
        video_views: t.video_views ?? null,
        uploaded_at: t.video_uploaded_at ?? null,
        artist_id: t.artist_id,
        artist_name: a.name,
        artist_slug: a.slug,
      })
      if (out.length >= limit) break
    }
    return out
  } catch {
    return []
  }
})

/** Hero statistikos juostai. */
export const getRadarStats = cache(async (): Promise<RadarStats> => {
  try {
    const sb = createAdminClient()
    const [emerging, featured] = await Promise.all([
      getEmergingArtists(60),
      getFeaturedArtists(),
    ])
    // šviežių dainų skaičius lange (apytikslis — count)
    let freshTracks = 0
    try {
      const { count } = await sb
        .from('tracks')
        .select('id', { count: 'exact', head: true })
        .not('video_uploaded_at', 'is', null)
        .gte('video_uploaded_at', SINCE())
      freshTracks = count ?? 0
    } catch { /* ignore */ }
    return { emerging: emerging.length, freshTracks, featured: featured.length }
  } catch {
    return { emerging: 0, freshTracks: 0, featured: 0 }
  }
})

/* ─────────────────────────── Hrefs ─────────────────────────── */
export function radarArtistHref(a: { slug: string }): string {
  return `/atlikejai/${a.slug}`
}
export function radarTrackHref(t: RadarTrack): string {
  // dainos/[slugId] parser tikisi `…-{id}` suffikso.
  if (t.artist_slug && t.slug) return `/dainos/${t.artist_slug}-${t.slug}-${t.id}`
  return `/dainos/${t.slug ? `${t.slug}-` : ''}${t.id}`
}
export function styleHref(name: string): string {
  return `/zanrai/${ltSlugify(name)}`
}
