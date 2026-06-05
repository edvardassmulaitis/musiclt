/**
 * POST /api/admin/radar/submission
 *
 * Moderuoja radaro pateikimą (radar_submissions).
 * Body: { id: number, action: 'approve' | 'reject', note?: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Neteisingas body' }, { status: 400 })
  }

  const id = Number(body?.id)
  const action = body?.action
  if (!Number.isFinite(id) || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Neteisingi parametrai' }, { status: 400 })
  }

  const patch = {
    status: action === 'approve' ? 'approved' : 'rejected',
    admin_note: typeof body?.note === 'string' ? body.note.trim().slice(0, 500) || null : null,
    reviewed_at: new Date().toISOString(),
    reviewed_by: (session.user as any)?.id || session.user.email || null,
  }

  try {
    const sb = createAdminClient()
    const { error } = await sb.from('radar_submissions').update(patch).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Serverio klaida' }, { status: 500 })
  }
}
