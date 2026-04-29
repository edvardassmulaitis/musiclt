/**
 * POST /api/admin/yt/artist/[id]/clear
 *
 * Iš artist'o track'ų išvalo YT enrichment laukus, kad būtų galima
 * iš naujo paleisti enrich'mą su griežtesniu match scoring'u
 * (pvz Atlanta — pirmas pass'as buvo prieš threshold ir prikalinėjo
 * random video).
 *
 * Body (JSON, optional):
 *   {
 *     wipeViews?: boolean,    // default true — išvalyti video_views + checked_at
 *     wipeHistory?: boolean,  // default false — ar trinti track_video_views_history rows
 *   }
 *
 * Response:
 *   { ok: true, artistId, affected, historyDeleted }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

const supabase = createAdminClient()

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return null
  }
  return session
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: idStr } = await params
  const artistId = Number(idStr)
  if (!Number.isFinite(artistId) || artistId <= 0) {
    return NextResponse.json({ error: 'Bad artist id' }, { status: 400 })
  }

  let body: any = {}
  try { body = await req.json() } catch { /* empty body OK */ }
  const wipeViews = body?.wipeViews !== false
  const wipeHistory = body?.wipeHistory === true

  // 1) Surenkam visus artist'o track id'us — reikia history delete'ui ir affected count'ui
  const { data: tracks, error: tErr } = await supabase
    .from('tracks')
    .select('id')
    .eq('artist_id', artistId)
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })
  const trackIds = (tracks || []).map((t: any) => t.id)

  if (trackIds.length === 0) {
    return NextResponse.json({ ok: true, artistId, affected: 0, historyDeleted: 0 })
  }

  // 2) Wipe per artist track'us
  const updates: Record<string, any> = {
    video_url: null,
    youtube_searched_at: null,
  }
  if (wipeViews) {
    updates.video_views = null
    updates.video_views_checked_at = null
  }

  const { error: uErr, count } = await (supabase
    .from('tracks') as any)
    .update(updates, { count: 'exact' })
    .eq('artist_id', artistId)

  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })

  // 3) Optional history delete — paprastai NE'darom, kad neprarastume snapshot'ų
  let historyDeleted = 0
  if (wipeHistory) {
    const { error: hErr, count: hCount } = await (supabase
      .from('track_video_views_history') as any)
      .delete({ count: 'exact' })
      .in('track_id', trackIds)
    if (hErr) return NextResponse.json({ error: hErr.message }, { status: 500 })
    historyDeleted = hCount || 0
  }

  return NextResponse.json({
    ok: true,
    artistId,
    affected: count ?? trackIds.length,
    historyDeleted,
  })
}
