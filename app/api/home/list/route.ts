/**
 * GET /api/home/list
 *
 * Pilnas (paginuotas) sąrašas homepage'o „Naujos dainos" / „Nauji albumai" /
 * „Greitai pasirodys" modalams. Praplečia /api/home/latest (kuris grąžina tik
 * ~10 įrašų per lane) — čia grąžinam VISĄ filtruotą rinkinį su žanro facet'ais,
 * like_count'ais ir rūšiavimu, + offset/limit pagination ("Rodyti daugiau").
 *
 * Query params:
 *   type   = tracks | albums | upcoming   (default tracks)
 *   lane   = lt | world                   (upcoming nepaiso lane)
 *   genre  = žanro pavadinimas (filtras)  (tuščias = visi)
 *   sort   = new | liked | az             (default new)
 *   offset = 0                            (pagination)
 *   limit  = 100                          (max 200)
 *
 * Atsakas: { items: [...], total, genres: [{ name, count }] }
 *   - genres facet'ai skaičiuojami per VISĄ rinkinį (prieš filtrą), kad chip'ai
 *     būtų stabilūs nepriklausomai nuo pasirinkto žanro.
 *
 * ⚡ PERFORMANCE (2026-06-29, Edvardo prašymu „daugiau modalas ilgai loadina"):
 *   Visas SUNKUS darbas (pilno rinkinio fetch'as + artist_genres + like_count
 *   RPC + album_tracks peržiūros) suvyniotas į `unstable_cache` per type+lane
 *   raktą (revalidate 300s + HOME_TAGS invalidacija). Šie duomenys keičiasi retai
 *   (naujos dainos retos), todėl po pirmo apskaičiavimo modalas atsidaro IŠKART
 *   iš cache'o. Žanro filtras + rūšiavimas + pagination daromi atmintyje ant
 *   cache'into rinkinio (greita). Admin'as pridėjus track/album — revalidateHomeTag
 *   išvalo ir šitą cache'ą.
 */

import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase'
import {
  getLatestTracksForHome,
  getLatestAlbumsForHome,
  getUpcomingAlbumsForHome,
  mapTrackForHome,
  mapAlbumForHome,
  HOME_TAGS,
} from '@/lib/home-latest'

type Sort = 'new' | 'liked' | 'az'
type ListType = 'tracks' | 'albums' | 'upcoming'
type Lane = 'lt' | 'world'

/** SUNKUS pilno rinkinio + enrichment apskaičiavimas. Kviečiamas TIK per
 *  `cachedEnrichedList` (unstable_cache). Grąžina visą surūšiuotą-pagal-„new"
 *  rinkinį su žanrais, like_count, views, pop + žanro facet'ais. */
async function buildEnrichedList(type: ListType, lane: Lane): Promise<{ rows: any[]; genres: { name: string; count: number }[] }> {
  const sb = createAdminClient()

  // 1) Pilnas rinkinys pagal type + lane (jau surūšiuotas „new" tvarka libe).
  let rows: any[] = []
  let entityType: 'track' | 'album' = 'track'
  if (type === 'albums') {
    const a = await getLatestAlbumsForHome()
    rows = (lane === 'world' ? a.worldFull : a.ltFull).map(mapAlbumForHome)
    entityType = 'album'
  } else if (type === 'upcoming') {
    const u = await getUpcomingAlbumsForHome()
    rows = u.full.map(mapAlbumForHome)
    entityType = 'album'
  } else {
    const t = await getLatestTracksForHome()
    // Modal'e rodom VIENĄ dainą per atlikėją (Full = per-artist dedup), kaip ir
    // homepage juostoje, tik be 10 įrašų limito.
    rows = (lane === 'world' ? t.worldFull : t.ltFull).map(mapTrackForHome)
    entityType = 'track'
  }

  // 2) Žanrai per atlikėją (artist_genres → genres).
  const artistIds = Array.from(new Set(rows.map(r => r.artist_id).filter(Boolean)))
  const genreByArtist = new Map<number, string[]>()
  if (artistIds.length) {
    const { data: agRows } = await sb
      .from('artist_genres')
      .select('artist_id, genres(name)')
      .in('artist_id', artistIds)
    for (const r of (agRows || []) as any[]) {
      const name = r.genres?.name
      if (!name) continue
      const list = genreByArtist.get(r.artist_id) || []
      if (!list.includes(name)) list.push(name)
      genreByArtist.set(r.artist_id, list)
    }
  }
  for (const r of rows) r.genres = genreByArtist.get(r.artist_id) || []

  // 3) like_count batch per RPC like_counts_by_entity.
  const ids = rows.map(r => r.id)
  const likeMap = new Map<number, number>()
  if (ids.length) {
    try {
      const { data: lc } = await sb.rpc('like_counts_by_entity', {
        p_entity_type: entityType,
        p_entity_ids: ids,
      })
      for (const r of (lc || []) as any[]) likeMap.set(Number(r.entity_id), Number(r.like_count))
    } catch {
      /* RPC nesukurta — like_count lieka 0, nelaužiam sąrašo */
    }
  }
  for (const r of rows) r.like_count = likeMap.get(r.id) || 0

  // 3b) „Hot" popularumas pagal YouTube peržiūras → pop lygis 1-5.
  if (entityType === 'album') {
    const albIds = rows.map(r => r.id)
    const viewByAlbum = new Map<number, number>()
    if (albIds.length) {
      const { data: atRows } = await sb
        .from('album_tracks')
        .select('album_id, tracks(video_views)')
        .in('album_id', albIds)
      for (const r of (atRows || []) as any[]) {
        const v = Number(r.tracks?.video_views || 0)
        if (v > (viewByAlbum.get(r.album_id) || 0)) viewByAlbum.set(r.album_id, v)
      }
    }
    for (const r of rows) r.views = viewByAlbum.get(r.id) || 0
  } else {
    for (const r of rows) r.views = Number(r.video_views || 0)
  }
  const popTier = (v: number) => (v >= 5e6 ? 5 : v >= 1e6 ? 4 : v >= 2e5 ? 3 : v >= 3e4 ? 2 : v > 0 ? 1 : 0)
  for (const r of rows) r.pop = popTier(r.views)

  // 4) Žanro facet'ai (per visą rinkinį, prieš filtrą).
  const facet = new Map<string, number>()
  for (const r of rows) {
    for (const name of r.genres as string[]) facet.set(name, (facet.get(name) || 0) + 1)
  }
  const genres = Array.from(facet.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'lt'))

  // Numatytasis „new" rūšiavimas iškart cache'inam (dažniausias atvejis →
  // route'ui nereikia rūšiuoti). Kiti sort'ai daromi ant šito atmintyje.
  rows.sort((a, b) => {
    const da = new Date(a.video_uploaded_at || a.release_date || (a.year ? `${a.year}-01-01` : '1970-01-01')).getTime()
    const db = new Date(b.video_uploaded_at || b.release_date || (b.year ? `${b.year}-01-01` : '1970-01-01')).getTime()
    return db - da
  })

  return { rows, genres }
}

/** Cache'inta enrichment funkcija — raktas = type+lane (per argumentus).
 *  revalidate 300s + HOME_TAGS (admin pakeitimas iškart išvalo). */
const cachedEnrichedList = unstable_cache(
  async (type: ListType, lane: Lane) => buildEnrichedList(type, lane),
  ['home-list-enriched-v1'],
  { tags: [HOME_TAGS.tracks, HOME_TAGS.albums], revalidate: 300 },
)

export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams
    const type = (sp.get('type') || 'tracks') as ListType
    const lane = (sp.get('lane') || 'lt') as Lane
    const genre = (sp.get('genre') || '').trim()
    const sort = (sp.get('sort') || 'new') as Sort
    const offset = Math.max(0, parseInt(sp.get('offset') || '0', 10) || 0)
    const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') || '100', 10) || 100))

    // Cache'intas pilnas (enriched, „new" tvarka) rinkinys + žanro facet'ai.
    const { rows, genres } = await cachedEnrichedList(type, lane)

    // 5) Filtras pagal žanrą.
    let filtered = genre
      ? rows.filter(r => (r.genres as string[]).includes(genre))
      : rows

    // 6) Rūšiavimas (rows jau „new" tvarka; perrūšiuojam tik jei kitas sort).
    if (sort === 'liked') {
      const nowMs = Date.now()
      const windowMs = 90 * 86_400_000
      filtered = [...filtered].sort((a, b) => {
        const scoreOf = (r: any) => {
          const dateMs = new Date(r.video_uploaded_at || r.release_date || (r.year ? `${r.year}-01-01` : '1970-01-01')).getTime()
          const freshness = Math.max(0, Math.min(1, (dateMs - (nowMs - windowMs)) / windowMs))
          const popArtist = Math.min(1, (r.artists?.score || 0) / 80)
          const popViews = (r.views || 0) > 0 ? Math.min(1, Math.log10(r.views) / 8) : 0
          const popularity = popArtist * 0.7 + popViews * 0.3
          return freshness * 0.7 + popularity * 0.3
        }
        return scoreOf(b) - scoreOf(a)
      })
    } else if (sort === 'az') {
      filtered = [...filtered].sort((a, b) =>
        String(a.title || '').localeCompare(String(b.title || ''), 'lt'),
      )
    }

    const total = filtered.length
    const items = filtered.slice(offset, offset + limit)

    return NextResponse.json(
      { items, total, genres },
      {
        headers: {
          // Duomenys cache'inti serveryje (unstable_cache) — CDN'ą galim laikyti
          // ilgiau (rinkinys stabilus, keičiasi retai).
          'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600',
          'CDN-Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600',
          'Vercel-CDN-Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600',
        },
      },
    )
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
