// app/api/admin/eventai/route.ts
//
// Admin-only: visų activity_events stats + paskutinių 200 įrašų sąrašas.
//   GET /api/admin/eventai            — visi tipai
//   GET /api/admin/eventai?type=X     — filtruoti pagal tipą
//   DELETE /api/admin/eventai?id=N    — pašalinti vieną įrašą

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

function isAdmin(role: string | undefined): boolean {
  return role === 'admin' || role === 'super_admin'
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!isAdmin((session?.user as any)?.role)) {
    return NextResponse.json({ error: 'Reikia admin teisių' }, { status: 403 })
  }
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')

  const sb = createAdminClient()

  // 1. Per-type aggregate count'ai (visiems tipams iš karto, vienu užklausimu)
  // Naudojam RPC nesuteiktą — manual GROUP BY per direct SQL nepasiekiamas su
  // PostgREST'u. Alternatyva: gauti visus event_type'us lengvai (limit 5000),
  // skaičiuoti client-side. Praktiškai event'ų bus < 50k iš pradžių.
  const counts: Record<string, number> = {}
  let notifications_total: number | null = null
  try {
    const { data: typeRows } = await sb
      .from('activity_events')
      .select('event_type')
      .limit(20000)
    for (const r of (typeRows || []) as Array<{ event_type: string }>) {
      counts[r.event_type] = (counts[r.event_type] || 0) + 1
    }
  } catch (_e) { /* ignore — table may not exist */ }

  try {
    const { count } = await sb
      .from('notifications')
      .select('*', { count: 'exact', head: true })
    notifications_total = count || 0
  } catch (_e) { /* ignore */ }

  // 2. Naujausių 200 įrašų sąrašas (su filtruotu tipu jeigu nurodytas).
  // entity_image — fallback'inam į be jos, jeigu migracija dar neaplikuota.
  async function fetchEvents(includeImage: boolean) {
    const cols = includeImage
      ? 'id, event_type, user_id, actor_name, actor_avatar, entity_type, entity_id, entity_title, entity_url, entity_image, metadata, is_public, created_at'
      : 'id, event_type, user_id, actor_name, actor_avatar, entity_type, entity_id, entity_title, entity_url, metadata, is_public, created_at'
    let q = sb
      .from('activity_events')
      .select(cols)
      .order('created_at', { ascending: false })
      .limit(200)
    if (type) q = q.eq('event_type', type)
    return await q
  }
  let { data: events, error } = await fetchEvents(true)
  if (error && /entity_image/.test(error.message || '')) {
    const fb = await fetchEvents(false)
    events = fb.data
    error = fb.error
  }
  if (error && !/relation .* does not exist/i.test(error.message)) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    events: events || [],
    counts,
    notifications_total,
  })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!isAdmin((session?.user as any)?.role)) {
    return NextResponse.json({ error: 'Reikia admin teisių' }, { status: 403 })
  }
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Reikia ?id=' }, { status: 400 })

  const sb = createAdminClient()
  const { error } = await sb.from('activity_events').delete().eq('id', Number(id))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
