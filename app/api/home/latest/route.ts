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
  mapTrackForHome,
  mapAlbumForHome,
} from '@/lib/home-latest'

export async function GET() {
  try {
    const [tracks, albums] = await Promise.all([
      getLatestTracksForHome(),
      getLatestAlbumsForHome(),
    ])

    const payload = {
      tracks: {
        lt: tracks.lt.map(mapTrackForHome),
        world: tracks.world.map(mapTrackForHome),
      },
      albums: {
        lt: albums.lt.map(mapAlbumForHome),
        world: albums.world.map(mapAlbumForHome),
      },
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
