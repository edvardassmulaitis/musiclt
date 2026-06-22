import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/admin/duplikatai/action
 *
 * Body:
 *   { group_id: number, action: 'merge', keeper_id?: number }
 *   { group_id: number, action: 'dismiss' }
 *
 * merge   — merges every other member of the group INTO the keeper via the
 *           merge_tracks() RPC (loser rows hard-deleted, albums/featuring
 *           unioned, snapshot saved to track_merges for revert). Group is then
 *           marked 'merged'.
 * dismiss — marks the group 'dismissed' (won't reappear on rescan).
 */
export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const groupId = Number(body.group_id)
  const action = String(body.action || '')
  if (!groupId) return NextResponse.json({ error: 'group_id required' }, { status: 400 })

  const sb = createAdminClient()

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const userId = String((session.user as any)?.id || '')
  const resolvedBy = uuidRe.test(userId) ? userId : null

  const { data: group, error: gErr } = await sb
    .from('track_dup_groups')
    .select('id, track_ids, suggested_keeper_id, status')
    .eq('id', groupId)
    .single()
  if (gErr || !group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })
  if (group.status !== 'pending') return NextResponse.json({ error: 'Group already resolved' }, { status: 409 })

  if (action === 'dismiss') {
    await sb.from('track_dup_groups')
      .update({ status: 'dismissed', resolved_at: new Date().toISOString(), resolved_by: resolvedBy, updated_at: new Date().toISOString() })
      .eq('id', groupId)
    return NextResponse.json({ ok: true, action: 'dismiss' })
  }

  const allIds0 = (group.track_ids as number[]) || []

  // Link the group as versions of one main track: keeper = original, the rest
  // are remix/live/etc. recorded in track_relations (loser → keeper).
  if (action === 'link_versions') {
    const keeper = Number(body.keeper_id) || Number(group.suggested_keeper_id) || allIds0[0]
    if (!allIds0.includes(keeper)) return NextResponse.json({ error: 'keeper not in group' }, { status: 400 })
    const losers = allIds0.filter(id => id !== keeper)
    const { data, error: relErr } = await sb.rpc('link_versions', { p_keeper: keeper, p_losers: losers })
    if (relErr) return NextResponse.json({ ok: false, error: relErr.message }, { status: 500 })
    await sb.from('track_dup_groups').update({
      status: 'versioned', resolved_at: new Date().toISOString(), resolved_by: resolvedBy, updated_at: new Date().toISOString(),
    }).eq('id', groupId)
    return NextResponse.json({ ok: true, action: 'link_versions', keeper, linked: data })
  }

  // Merge ONE loser into the keeper (the rest of the group stays pending).
  if (action === 'merge_one') {
    const keeper = Number(body.keeper_id)
    const loser = Number(body.loser_id)
    if (!keeper || !loser || keeper === loser) return NextResponse.json({ error: 'keeper_id and loser_id required' }, { status: 400 })
    if (!allIds0.includes(keeper) || !allIds0.includes(loser)) return NextResponse.json({ error: 'ids must be in group' }, { status: 400 })

    const { error: mErr } = await sb.rpc('merge_tracks', {
      p_winner_id: keeper, p_loser_id: loser, p_field_choices: {}, p_merged_by: resolvedBy,
    })
    if (mErr) return NextResponse.json({ ok: false, error: mErr.message }, { status: 500 })

    const remaining = allIds0.filter(id => id !== loser)
    const done = remaining.length < 2
    await sb.from('track_dup_groups').update({
      track_ids: remaining,
      member_count: remaining.length,
      status: done ? 'merged' : 'pending',
      resolved_at: done ? new Date().toISOString() : null,
      resolved_by: done ? resolvedBy : null,
      updated_at: new Date().toISOString(),
    }).eq('id', groupId)
    return NextResponse.json({ ok: true, action: 'merge_one', remaining_ids: remaining, group_done: done })
  }

  // Clear the YouTube video off a track AND zero its (now junk) views.
  if (action === 'clear_video') {
    const trackId = Number(body.track_id)
    if (!trackId || !allIds0.includes(trackId)) return NextResponse.json({ error: 'track_id must be in group' }, { status: 400 })
    const { error: cErr } = await sb.from('tracks').update({
      video_url: null,
      video_embeddable: null,
      video_views: 0,
      video_views_checked_at: new Date().toISOString(),
    }).eq('id', trackId)
    if (cErr) return NextResponse.json({ ok: false, error: cErr.message }, { status: 500 })
    return NextResponse.json({ ok: true, action: 'clear_video', track_id: trackId })
  }

  // Hard-DELETE one track (junk), then drop it from the group.
  if (action === 'delete_one') {
    const trackId = Number(body.track_id)
    if (!trackId || !allIds0.includes(trackId)) return NextResponse.json({ error: 'track_id must be in group' }, { status: 400 })
    const { error: dErr } = await sb.rpc('delete_track', { p_id: trackId })
    if (dErr) return NextResponse.json({ ok: false, error: dErr.message }, { status: 500 })
    const remaining = allIds0.filter(id => id !== trackId)
    const done = remaining.length < 2
    await sb.from('track_dup_groups').update({
      track_ids: remaining,
      member_count: remaining.length,
      status: done ? 'merged' : 'pending',
      resolved_at: done ? new Date().toISOString() : null,
      resolved_by: done ? resolvedBy : null,
      updated_at: new Date().toISOString(),
    }).eq('id', groupId)
    return NextResponse.json({ ok: true, action: 'delete_one', remaining_ids: remaining, group_done: done })
  }

  // Remove ONE track from the group ("leave as separate" — not a duplicate).
  if (action === 'separate_one') {
    const trackId = Number(body.track_id)
    if (!trackId || !allIds0.includes(trackId)) return NextResponse.json({ error: 'track_id must be in group' }, { status: 400 })
    const remaining = allIds0.filter(id => id !== trackId)
    const done = remaining.length < 2
    await sb.from('track_dup_groups').update({
      track_ids: remaining,
      member_count: remaining.length,
      status: done ? 'dismissed' : 'pending',
      resolved_at: done ? new Date().toISOString() : null,
      resolved_by: done ? resolvedBy : null,
      updated_at: new Date().toISOString(),
    }).eq('id', groupId)
    return NextResponse.json({ ok: true, action: 'separate_one', remaining_ids: remaining, group_done: done })
  }

  if (action === 'merge') {
    const ids = (group.track_ids as number[]) || []
    let keeper = Number(body.keeper_id) || Number(group.suggested_keeper_id) || ids[0]
    if (!ids.includes(keeper)) keeper = ids[0]
    const losers = ids.filter(id => id !== keeper)

    const results: Array<{ loser: number; ok: boolean; error?: string }> = []
    for (const loser of losers) {
      const { error } = await sb.rpc('merge_tracks', {
        p_winner_id: keeper,
        p_loser_id: loser,
        p_field_choices: {},
        p_merged_by: resolvedBy,
      })
      results.push({ loser, ok: !error, error: error?.message })
    }

    const allOk = results.every(r => r.ok)
    await sb.from('track_dup_groups')
      .update({
        status: allOk ? 'merged' : 'pending',
        resolved_at: allOk ? new Date().toISOString() : null,
        resolved_by: allOk ? resolvedBy : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', groupId)

    return NextResponse.json({ ok: allOk, action: 'merge', keeper, merged: results.filter(r => r.ok).length, results })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
