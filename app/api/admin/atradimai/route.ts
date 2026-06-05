// app/api/admin/atradimai/route.ts
// Admin veiksmai „Muzikos atradimų" trūkstamų sąrašui.
//   PATCH { type:'report', id, status }        — narių pranešimo būsena
//   PATCH { type:'pending_done', artist_name }  — pažymėti trūkstamą atlikėją sutvarkytu

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user as any).role || '')) return null
  return session
}

export async function PATCH(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const sb = createAdminClient()

  if (body.type === 'report' && body.id) {
    const status = ['new', 'handled', 'rejected'].includes(body.status) ? body.status : 'handled'
    const { error } = await sb.from('missing_reports').update({ status }).eq('id', body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (body.type === 'pending_done' && body.artist_name) {
    const { error } = await sb.from('discovery_pending_artist').update({ status: 'done' }).eq('raw_name', body.artist_name)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // Susieti visus atradimus su raw_name → esamas DB atlikėjas
  if (body.type === 'link_artist' && body.artist_id && body.artist_name) {
    const { error } = await sb.from('discoveries')
      .update({ artist_id: body.artist_id, resolve_state: 'resolved' })
      .eq('artist_name', body.artist_name)
      .eq('thread_id', 128402)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await sb.from('discovery_pending_artist').update({ status: 'done' }).eq('raw_name', body.artist_name)
    return NextResponse.json({ ok: true })
  }

  // Atrišti: grąžinti atradimus į trūkstamų eilę (klaidingo auto-match taisymui)
  if (body.type === 'unlink' && body.artist_id) {
    const { data: ids } = await sb.from('discoveries').select('id').eq('artist_id', body.artist_id)
    const discIds = (ids || []).map((r: any) => r.id)
    if (discIds.length) await sb.from('discovery_tags').delete().in('discovery_id', discIds)
    const { error } = await sb.from('discoveries')
      .update({ artist_id: null, resolve_state: 'needs_import' })
      .eq('artist_id', body.artist_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Bad request' }, { status: 400 })
}
