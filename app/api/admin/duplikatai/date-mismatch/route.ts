import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

/**
 * Release-year mismatches: a track's release_year is newer than the earliest
 * album it appears on (usually a YouTube upload year overwriting the real
 * release). Fix = snap release_year to the earliest album year.
 *
 * GET  ?minDiff=2&page=0        — list + total count
 * POST { action:'fix_one', id }            — fix one track
 * POST { action:'fix_all', minDiff }       — auto-fix all matching tracks
 */
export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const url = new URL(req.url)
  const minDiff = Math.max(0, parseInt(url.searchParams.get('minDiff') || '2', 10) || 0)
  const page = Math.max(0, parseInt(url.searchParams.get('page') || '0', 10) || 0)
  const pageSize = 50

  const sb = createAdminClient()
  const { data, error } = await sb.rpc('release_year_mismatches', {
    p_min_diff: minDiff, p_limit: pageSize, p_offset: page * pageSize,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let total: number | null = null
  if (page === 0) {
    const { data: c } = await sb.rpc('release_year_mismatch_count', { p_min_diff: minDiff })
    total = typeof c === 'number' ? c : Number(c) || 0
  }

  const tracks = (data || []).map((r: any) => ({
    id: Number(r.track_id),
    title: r.title,
    artist_name: r.artist_name,
    artist_slug: r.artist_slug,
    release_year: r.release_year,
    album_year: r.album_year,
    album_title: r.album_title,
    diff: r.diff,
  }))

  return NextResponse.json({ total, page, pageSize, hasMore: tracks.length === pageSize, tracks })
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const action = String(body.action || '')
  const sb = createAdminClient()

  if (action === 'fix_one') {
    const id = Number(body.id)
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const { data, error } = await sb.rpc('fix_track_release_year', { p_id: id })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, action, id, new_year: data })
  }

  if (action === 'fix_all') {
    const minDiff = Math.max(0, Number(body.minDiff) || 0)
    const { data, error } = await sb.rpc('fix_all_release_years', { p_min_diff: minDiff })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, action, fixed: data })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
