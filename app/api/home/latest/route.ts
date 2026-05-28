/**
 * GET /api/home/latest
 *
 * Vienas endpoint'as homepage „Naujos dainos" + „Nauji albumai" sekcijoms.
 * Grąžina LT + World lane'us atskirai, su tag-based cache (žr. lib/home-latest.ts).
 *
 * Anksčiau homepage darydavo:
 *   - /api/tracks?limit=24  (sortino abėcėliškai → LT lane'as dažnai tuščias)
 *   - /api/albums?limit=24  (year DESC su NULL priekyje → foreign be datų priekyje)
 *
 * Dabar — vienas request'as, server-side dedupe per artist'ą, tikras
 * `video_uploaded_at DESC` ordering tracks'ams ir `year IS NOT NULL` filter
 * albumams.
 */

import { NextResponse } from 'next/server'
import {
  getLatestTracksForHome,
  getLatestAlbumsForHome,
  getUpcomingAlbumsForHome,
  mapTrackForHome,
  mapAlbumForHome,
} from '@/lib/home-latest'

export async function GET() {
  try {
    // Atskirai await'iname kiekvieną, kad galėtume parodyti, kuri grandis
    // numirė. Anksčiau Promise.all'as suskaitydavo tik bendrą error message'ą.
    let tracks
    let albums
    let upcoming
    try { tracks = await getLatestTracksForHome() } catch (e: any) { console.error('home/latest tracks failed:', e?.message); throw new Error(`tracks: ${e?.message}`) }
    try { albums = await getLatestAlbumsForHome() } catch (e: any) { console.error('home/latest albums failed:', e?.message); throw new Error(`albums: ${e?.message}`) }
    try { upcoming = await getUpcomingAlbumsForHome() } catch (e: any) { console.error('home/latest upcoming failed:', e?.message); throw new Error(`upcoming: ${e?.message}`) }

    const payload = {
      tracks: {
        lt: tracks.lt.map(mapTrackForHome),
        world: tracks.world.map(mapTrackForHome),
        totalLt: tracks.totalLt,
        totalWorld: tracks.totalWorld,
      },
      albums: {
        lt: albums.lt.map(mapAlbumForHome),
        world: albums.world.map(mapAlbumForHome),
        totalLt: albums.totalLt,
        totalWorld: albums.totalWorld,
      },
      // „Greitai pasirodys" — bendras LT + INTL sąrašas, rikiuotas pagal
      // artimiausią release datą ASC. UI rodo kaip atskirą sekciją po
      // „Nauji albumai" (be lane split).
      upcoming: upcoming.items.map(mapAlbumForHome),
      upcomingTotal: upcoming.total,
    }

    // 15 min CDN cache. Tag invalidation (revalidateHomeTag) instant'iškai
    // išvalo unstable_cache layer'į, o CDN edge'us pasipildys per `s-maxage`.
    // Reali freshness — admin POST'ai ar /admin/settings mygtukai → iškart;
    // antraip max 15 min lag'as (priimtina pagal user'io 2026-05-28 sprendimą).
    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=600',
        'CDN-Cache-Control': 'public, s-maxage=900, stale-while-revalidate=600',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=900, stale-while-revalidate=600',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
