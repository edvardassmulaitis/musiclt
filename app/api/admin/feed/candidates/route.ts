import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

// Homepage feed kandidatai (žr. /api/cron/feed-candidates).
//
// GET  — pending sąrašas (naujausi pirmi) admin peržiūrai.
// POST — { id, action: 'approve' | 'reject' }  (sprendimą priima admin'as)
export async function GET(_req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  const sb = createAdminClient()
  const { data, error } = await sb.from('home_feed')
    .select('id, item_key, item_type, status, title, image_url, href, first_seen_at, auto_approved, decided_at')
    .eq('kind', 'candidate')
    .order('first_seen_at', { ascending: false })
    .limit(120)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const rows = data || []
  return NextResponse.json({
    pending: rows.filter(r => r.status === 'pending'),
    recent: rows.filter(r => r.status !== 'pending').slice(0, 30),
  })
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const id = Number(body.id)
  const action = String(body.action || '')
  if (!id || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'id ir action (approve/reject) privalomi' }, { status: 400 })
  }
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const actorId = String((session.user as any)?.id || '')
  const sb = createAdminClient()
  const { error } = await sb.from('home_feed')
    .update({
      status: action === 'approve' ? 'approved' : 'rejected',
      decided_at: new Date().toISOString(),
      decided_by: uuidRe.test(actorId) ? actorId : null,
      auto_approved: false,
    })
    .eq('id', id).eq('kind', 'candidate')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id, action })
}
