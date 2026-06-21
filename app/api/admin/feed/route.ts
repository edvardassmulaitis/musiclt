// app/api/admin/feed/route.ts
//
// POST — nustato override'ą feed įrašui (hide/pin/sort_order) pagal item_key.
//   body: { item_key, hidden?, pinned?, sort_order? (null=auto) }
// Rankinis upsert (be ON CONFLICT — item_key turi tik partial unique index).

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  const item_key = b.item_key
  if (!item_key) return NextResponse.json({ error: 'item_key required' }, { status: 400 })

  const sb = createAdminClient()
  const patch: any = { kind: 'override', item_key, updated_at: new Date().toISOString() }
  if (typeof b.hidden === 'boolean') patch.hidden = b.hidden
  if (typeof b.pinned === 'boolean') patch.pinned = b.pinned
  if ('sort_order' in b) patch.sort_order = b.sort_order

  const { data: existing } = await sb.from('home_feed').select('id').eq('kind', 'override').eq('item_key', item_key).maybeSingle()
  if (existing) {
    const { error } = await sb.from('home_feed').update(patch).eq('id', (existing as any).id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await sb.from('home_feed').insert(patch)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
