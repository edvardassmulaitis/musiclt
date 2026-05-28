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

    // 5 min CDN cache, plus stale-while-revalidate 5 min — kai `revalidateTag`
    // iškviečiamas, unstable_cache layer iškart išsivalo, bet CDN edge'ai gali
    // turėti seną response'ą iki s-maxage. Trumpinam SWR į 300 (vietoj 600).
    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=300',
        'CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=300',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=300',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
