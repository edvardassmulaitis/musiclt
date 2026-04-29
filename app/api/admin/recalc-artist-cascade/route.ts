import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  calculateArtistScore,
  computeAlbumScore,
  computeTrackScore,
} from '@/lib/scoring'

/**
 * Cascading recalc for one artist:
 *  1. Recalc artist score (so album/track scoring inherits the right value)
 *  2. Recalc score for every album of this artist
 *  3. Recalc score for every track of this artist
 *
 * Designed for the post-import flow — after a UI Wikipedia import inserts
 * everything, the browser POSTs here once and walks away.
 *
 * Splits the work into batches that comfortably fit Vercel free tier
 * (60s max). For artists with hundreds of tracks the caller can call this
 * multiple times — second call is a no-op since rows are already scored.
 *
 * Auth: admin session OR INTERNAL_API_SECRET header.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const isAdmin = session?.user?.role && ['admin', 'super_admin'].includes(session.user.role)
  const secret = req.headers.get('x-internal-secret')
  const isInternal = !!secret && secret === process.env.INTERNAL_API_SECRET
  if (!isAdmin && !isInternal) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const artistIdRaw = url.searchParams.get('artist_id')
  if (!artistIdRaw) return NextResponse.json({ error: 'Missing artist_id' }, { status: 400 })
  const artistId = parseInt(artistIdRaw)
  if (Number.isNaN(artistId)) return NextResponse.json({ error: 'Bad artist_id' }, { status: 400 })

  const supabase = createAdminClient()
  const now = new Date().toISOString()
  const stats = { artist: 0, albums: 0, tracks: 0, errors: [] as string[] }

  // ── 1. Artist score ───────────────────────────────────────────
  let artistScore = 0
  try {
    const artistBreakdown = await calculateArtistScore(supabase, artistId)
    artistScore = artistBreakdown.final_score
    await supabase
      .from('artists')
      .update({
        score: artistBreakdown.final_score,
        score_override: artistBreakdown.score_override,
        score_breakdown: artistBreakdown,
        score_updated_at: now,
      })
      .eq('id', artistId)
    stats.artist = artistBreakdown.final_score
  } catch (e: any) {
    stats.errors.push(`artist: ${e?.message || e}`)
  }

  // ── 2. Albums ──────────────────────────────────────────────────
  const { data: albums } = await supabase
    .from('albums')
    .select('id, type_studio, type_ep, type_compilation, type_remix, type_live, type_single, certifications, peak_chart_position, track_count, year')
    .eq('artist_id', artistId)

  const albumYearById = new Map<number, number | null>()
  for (const a of (albums || []) as any[]) {
    try {
      const r = computeAlbumScore(a, artistScore)
      await supabase
        .from('albums')
        .update({
          score: r.final_score,
          score_breakdown: r.breakdown,
          score_updated_at: now,
        })
        .eq('id', a.id)
      albumYearById.set(a.id, a.year ?? null)
      stats.albums++
    } catch (e: any) {
      stats.errors.push(`album ${a.id}: ${e?.message || e}`)
    }
  }

  // ── 3. Tracks ──────────────────────────────────────────────────
  const { data: tracks } = await supabase
    .from('tracks')
    .select('id, type, peak_chart_position, certifications, lyrics, video_url, release_year')
    .eq('artist_id', artistId)

  // Junction lookup: which tracks are primary on which album (= "single")
  const trackIds = (tracks || []).map((t: any) => t.id)
  const isSingleByTrack = new Map<number, boolean>()
  const albumIdByTrack = new Map<number, number>()
  if (trackIds.length > 0) {
    const { data: at } = await supabase
      .from('album_tracks')
      .select('track_id, album_id, is_primary')
      .in('track_id', trackIds)
    for (const r of (at || []) as any[]) {
      if (r.is_primary) isSingleByTrack.set(r.track_id, true)
      // First album wins as "primary album" for year fallback purposes.
      if (!albumIdByTrack.has(r.track_id)) albumIdByTrack.set(r.track_id, r.album_id)
    }
  }

  for (const t of (tracks || []) as any[]) {
    try {
      const isSingle = isSingleByTrack.get(t.id) || false
      const albumId = albumIdByTrack.get(t.id)
      const albumYear = albumId ? albumYearById.get(albumId) : null
      const r = computeTrackScore(
        { ...t, is_single: isSingle },
        { year: albumYear ?? null },
        artistScore
      )
      await supabase
        .from('tracks')
        .update({
          score: r.final_score,
          score_breakdown: r.breakdown,
          score_updated_at: now,
        })
        .eq('id', t.id)
      stats.tracks++
    } catch (e: any) {
      stats.errors.push(`track ${t.id}: ${e?.message || e}`)
    }
  }

  return NextResponse.json({
    ok: true,
    artist_id: artistId,
    artist_score: stats.artist,
    albums_scored: stats.albums,
    tracks_scored: stats.tracks,
    errors: stats.errors.slice(0, 10),
  })
}

// GET = peek without recalc (handy for debugging)
export async function GET(req: NextRequest) {
  return POST(req)
}
