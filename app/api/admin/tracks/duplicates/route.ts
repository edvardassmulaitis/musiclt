/**
 * GET  /api/admin/tracks/duplicates?track_id=123
 *   → candidates that might be duplicates of track 123 (based on main + featuring overlap and normalized title match).
 *
 * POST /api/admin/tracks/duplicates
 *   body: { title: string, artist_ids: number[], exclude_track_id?: number }
 *   → used by import-time checks (caller passes what it's *about to insert*).
 *
 * Both return { candidates: DuplicateCandidate[] } (see lib/track-dedup.ts).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'
import { findDuplicateTracks, trackArtistIds } from '@/lib/track-dedup'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return null
  }
  return session
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const trackId = Number(new URL(req.url).searchParams.get('track_id') || '')
  if (!trackId) return NextResponse.json({ error: 'track_id required' }, { status: 400 })

  // Load the reference track's artist set
  const { data: track, error } = await supabase
    .from('tracks')
    .select('id, title, artist_id, track_artists(artist_id)')
    .eq('id', trackId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!track) return NextResponse.json({ error: 'track not found' }, { status: 404 })

  const artistIds = trackArtistIds(
    track.artist_id,
    (track.track_artists || []).map((ta: any) => ta.artist_id),
  )

  const candidates = await findDuplicateTracks(supabase, {
    title: track.title,
    artistIds,
    excludeTrackId: trackId,
    limit: 20,
  })

  return NextResponse.json({ candidates })
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const title: string = String(body.title || '').trim()
  const artistIdsRaw: any[] = Array.isArray(body.artist_ids) ? body.artist_ids : []
  const artistIds = artistIdsRaw.map(x => Number(x)).filter(x => Number.isFinite(x) && x > 0)
  const excludeTrackId = body.exclude_track_id ? Number(body.exclude_track_id) : undefined

  if (!title || artistIds.length === 0) {
    return NextResponse.json({ candidates: [] })
  }

  const candidates = await findDuplicateTracks(supabase, {
    title,
    artistIds,
    excludeTrackId,
    limit: 20,
  })

  return NextResponse.json({ candidates })
}
