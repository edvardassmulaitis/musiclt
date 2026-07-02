import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireFullAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// POST /api/admin/duplikatai-atlikejai/action
//
// DESTRUKTYVU (hard-delete loser'ių) → tik pilnas admin (requireFullAdmin).
// Body: { keeper_id: number, loser_ids: number[] }
//   Kiekvienas loser sujungiamas į keeper per merge_artists() RPC
//   (perkelia visas nuorodas + likes, tada ištrina loser'į). Idempotentiška.
export async function POST(req: NextRequest) {
  const session = await requireFullAdmin()
  if (!session) return NextResponse.json({ error: 'Reikia pilno admin' }, { status: 403 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const keeperId = Number(body.keeper_id)
  const loserIds: number[] = Array.isArray(body.loser_ids) ? body.loser_ids.map(Number).filter(Boolean) : []
  if (!keeperId || !loserIds.length) {
    return NextResponse.json({ error: 'keeper_id ir loser_ids privalomi' }, { status: 400 })
  }
  if (loserIds.includes(keeperId)) {
    return NextResponse.json({ error: 'keeper negali būti tarp loser_ids' }, { status: 400 })
  }

  const sb = createAdminClient()
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const actorId = String((session.user as any)?.id || '')
  const actor = uuidRe.test(actorId) ? actorId : null

  const results: Array<{ loser_id: number; ok: boolean; error?: string; likes_moved?: number }> = []
  for (const loserId of loserIds) {
    const { data, error } = await sb.rpc('merge_artists', { p_keeper: keeperId, p_loser: loserId, p_actor: actor })
    if (error) results.push({ loser_id: loserId, ok: false, error: error.message })
    else results.push({ loser_id: loserId, ok: true, likes_moved: (data as any)?.likes_moved ?? 0 })
  }

  const merged = results.filter(r => r.ok).length
  return NextResponse.json({ ok: merged > 0, keeper_id: keeperId, merged, results })
}
