/**
 * GET /api/admin/import/artists/[legacyId]
 *
 * Grąžina pilną atlikėjo import'o būseną:
 *   - artist row (all cols iš public.artists)
 *   - jobs: last 20 import jobs su reports
 *   - albums: visi + source field + track_count
 *   - tracks: be albumo (standalone)
 *   - photos: foto count + preview
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'

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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ legacyId: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { legacyId: legacyIdStr } = await params
  const legacyId = Number(legacyIdStr)
  if (!legacyId) return NextResponse.json({ error: 'Bad legacyId' }, { status: 400 })

  const { data: artist, error: aErr } = await supabase
    .from('artists')
    .select('*')
    .eq('legacy_id', legacyId)
    .maybeSingle()

  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 })
  if (!artist) return NextResponse.json({ error: 'Artist not found' }, { status: 404 })

  const [jobs, albums, tracks, photos, legacyLikes] = await Promise.all([
    supabase.from('import_jobs')
      .select('*')
      .eq('artist_legacy_id', legacyId)
      .order('requested_at', { ascending: false })
      .limit(20),
    supabase.from('albums')
      .select('id, legacy_id, title, year, source, cover_image_url, type_studio, type_ep, type_single, type_live, type_compilation, type_remix, type_soundtrack')
      .eq('artist_id', artist.id)
      .order('year', { ascending: false, nullsFirst: false }),
    supabase.from('tracks')
      .select('id, legacy_id, title, duration_seconds, source')
      .eq('artist_id', artist.id)
      .is('album_id', null)
      .limit(500),
    supabase.from('artist_photos')
      .select('id, url, caption, source_url, photographer_id, taken_at, sort_order')
      .eq('artist_id', artist.id)
      .order('sort_order'),
    // Count likes from unified likes table for this artist's modern ID
    supabase.from('likes')
      .select('id', { count: 'exact', head: true })
      .eq('entity_type', 'artist')
      .eq('entity_id', artist.id),
  ])

  return NextResponse.json({
    artist,
    jobs: jobs.data || [],
    albums: albums.data || [],
    standalone_tracks: tracks.data || [],
    photos: photos.data || [],
    legacy_like_count: legacyLikes.count || 0,
  })
}
