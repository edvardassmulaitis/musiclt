// POST /api/admin/artist-team — admin valdo atlikėjų komandos prieigą.
// Body: { teamId: string, action: 'revoke' | 'restore' }

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['editor', 'admin', 'super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Blogas body' }, { status: 400 }) }
  const teamId = String(body?.teamId || '')
  const action = body?.action
  if (!teamId || !['revoke', 'restore'].includes(action)) {
    return NextResponse.json({ error: 'Blogi parametrai' }, { status: 400 })
  }

  try {
    const sb = createAdminClient()
    const { data: row } = await sb.from('artist_team').select('id, artist_id').eq('id', teamId).maybeSingle()
    if (!row) return NextResponse.json({ error: 'Nerasta' }, { status: 404 })

    const status = action === 'revoke' ? 'revoked' : 'active'
    await sb.from('artist_team').update({ status }).eq('id', teamId)

    // is_claimed denorm: true jei liko bent vienas aktyvus narys.
    const { count } = await sb.from('artist_team')
      .select('*', { count: 'exact', head: true })
      .eq('artist_id', row.artist_id).eq('status', 'active')
    await sb.from('artists').update({ is_claimed: (count || 0) > 0 }).eq('id', row.artist_id)

    return NextResponse.json({ ok: true, status })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Serverio klaida' }, { status: 500 })
  }
}
