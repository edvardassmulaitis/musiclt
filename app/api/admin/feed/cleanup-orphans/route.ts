// app/api/admin/feed/cleanup-orphans/route.ts
//
// 2026-07-16: „Paslėpiau, bet po kurio laiko vėl išlindo" — priežastis buvo
// UUID-pagrįsti item_key'ai (event::/renginiai/<uuid>, verta::/verta-keliones#vk-<uuid>).
// Perkūrus/atnaujinus renginį ar verta įrašą jo UUID pasikeisdavo, todėl senas
// hidden override tapdavo „našlaičiu" — jokia dabartinė nuoroda jo daugiau
// nepasiekia (event/verta raktai dabar visada generuojami pagal stabilų slug,
// žr. a3df2318), bet pati eilutė liko home_feed lentelėje amžinai (nebuvo
// jokio DELETE/expiry mechanizmo).
//
// GET  — parodo, kiek tokių naujintinų/naujintų eilučių yra (dry-run, be ištrynimo).
// POST — ištrina jas.
//
// Saugu: liečiame TIK kind='override' eilutes, kurių item_key tipas yra
// 'event' arba 'verta' IR href dalyje yra UUID formos segmentas — sistema
// tokio rakto daugiau niekada nebesugeneruos, taigi eilutė yra garantuotai
// nebepasiekiama, ne tik „šiuo metu nerodoma".

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase'

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const ORPHAN_TYPES = ['event::', 'verta::']

function isOrphanKey(itemKey: string | null): boolean {
  if (!itemKey) return false
  const isTargetType = ORPHAN_TYPES.some(t => itemKey.startsWith(t))
  return isTargetType && UUID_RE.test(itemKey)
}

async function findOrphans() {
  const sb = createAdminClient()
  const { data, error } = await sb.from('home_feed').select('id, item_key, hidden, pinned, updated_at').eq('kind', 'override')
  if (error) throw error
  return (data || []).filter((r: any) => isOrphanKey(r.item_key))
}

export async function GET() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  try {
    const orphans = await findOrphans()
    return NextResponse.json({ ok: true, count: orphans.length, orphans })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}

export async function POST() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  try {
    const orphans = await findOrphans()
    if (!orphans.length) return NextResponse.json({ ok: true, removed: 0 })
    const sb = createAdminClient()
    const ids = orphans.map((o: any) => o.id)
    const { error } = await sb.from('home_feed').delete().in('id', ids)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, removed: ids.length, keys: orphans.map((o: any) => o.item_key) })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
