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

  // 2026-07-16: BUVO select-then-insert-or-update — TOCTOU race. „Slėpti"
  // (toggleHide) ir „Išsaugoti tvarką" (saveOrder) admin'e dažnai iššaunami
  // beveik vienu metu tam pačiam item_key: abu SELECT'ina, abu mato
  // `existing == null`, abu bando INSERT — vienas laimi, antras krenta su
  // unique constraint klaida IR TA REIKŠMĖ (pvz. hidden:true) TYLIAI
  // PRARANDAMA (klientas klaidos nepatikrina, žr. FeedAdminClient setOverride).
  // Realus simptomas: paslepi renginį, iškart Išsaugoti tvarką → po refresh
  // vėl matomas. Dabar: pirmiausia UPDATE (idempotentiškas, jokio lenktynių
  // lango prieš tai), o jei 0 eilučių paveikta — tada INSERT su fallback'u
  // į UPDATE, jei INSERT vis tiek susikirstų su lygiagrečiu request'u.
  const { data: updated, error: updErr } = await sb
    .from('home_feed')
    .update(patch)
    .eq('kind', 'override')
    .eq('item_key', item_key)
    .select('id')
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  if (!updated || updated.length === 0) {
    const { error: insErr } = await sb.from('home_feed').insert(patch)
    if (insErr) {
      // 23505 = unique_violation (lygiagretus request'as spėjo įterpti pirmas) —
      // eilutė jau yra, patch'inam ją vietoj to, kad klaida nedingtų tyliai.
      if (insErr.code === '23505') {
        const { error: retryErr } = await sb.from('home_feed').update(patch).eq('kind', 'override').eq('item_key', item_key)
        if (retryErr) return NextResponse.json({ error: retryErr.message }, { status: 500 })
      } else {
        return NextResponse.json({ error: insErr.message }, { status: 500 })
      }
    }
  }
  return NextResponse.json({ ok: true })
}
