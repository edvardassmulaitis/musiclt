import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/admin/yt-siuksles/action
 *   { action: 'zero_one', id: number }       — zero one track's views
 *   { action: 'zero_all', min?: number }      — zero ALL junk tracks' views
 *
 * "Zero" = set video_views = 0 and video_views_checked_at = now() for tracks
 * that have views but no usable embed.
 */
const FILTER = 'video_url.is.null,video_url.eq.,video_embeddable.is.false'

export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const action = String(body.action || '')
  const sb = createAdminClient()
  const now = new Date().toISOString()

  if (action === 'zero_one') {
    const id = Number(body.id)
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const { error } = await sb.from('tracks').update({ video_views: 0, video_views_checked_at: now }).eq('id', id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, action, id })
  }

  if (action === 'zero_all') {
    const min = Math.max(0, Number(body.min) || 0)
    const { data, error } = await sb
      .from('tracks')
      .update({ video_views: 0, video_views_checked_at: now })
      .gt('video_views', min)
      .or(FILTER)
      .select('id')
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, action, zeroed: (data || []).length })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
