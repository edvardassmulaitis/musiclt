import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Tracks whose title names a featuring artist (ft./feat./su/with X) that
 * resolves to a real DB artist but isn't linked in track_artists.
 *
 * GET  ?page=0                       — suggestions (+ total on page 0)
 * POST { action:'link', track_id, feat_id }  — link the featuring artist
 */
export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const page = Math.max(0, parseInt(new URL(req.url).searchParams.get('page') || '0', 10) || 0)
  const pageSize = 50
  const sb = createAdminClient()

  const { data, error } = await sb.rpc('featuring_suggestions', { p_limit: pageSize, p_offset: page * pageSize })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let total: number | null = null
  if (page === 0) {
    const { data: c } = await sb.rpc('featuring_suggestions_count')
    total = typeof c === 'number' ? c : Number(c) || 0
  }

  const tracks = (data || []).map((r: any) => ({
    id: Number(r.track_id), title: r.title,
    main_artist: r.main_artist, main_artist_slug: r.main_artist_slug,
    feat_id: r.feat_id, feat_name: r.feat_name, feat_slug: r.feat_slug,
    video_views: r.video_views,
  }))
  return NextResponse.json({ total, page, pageSize, hasMore: tracks.length === pageSize, tracks })
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (String(body.action) !== 'link') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  const trackId = Number(body.track_id)
  const featId = Number(body.feat_id)
  if (!trackId || !featId) return NextResponse.json({ error: 'track_id and feat_id required' }, { status: 400 })

  const sb = createAdminClient()
  const { error } = await sb.from('track_artists').upsert(
    { track_id: trackId, artist_id: featId, is_primary: false },
    { onConflict: 'track_id,artist_id', ignoreDuplicates: true },
  )
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, track_id: trackId, feat_id: featId })
}
