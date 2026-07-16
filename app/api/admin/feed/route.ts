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
      if (insErr.code === '23505') {
        // 23505 = unique_violation. `home_feed_item_key_uidx` (žr.
        // 20260621_home_feed.sql) šiuo metu yra GLOBALUS per visus kind'us,
        // o ne per (item_key, kind) — todėl konfliktas DAŽNIAUSIAI yra ne
        // su lygiagrečiu 'override' rašu (originali šito bloko prielaida),
        // o su jau egzistuojančia 'candidate' eilute: cron (feed-candidates)
        // užregistruoja kiekvieną auto-tipo įrašą (news/event/recording/verta)
        // kaip kind='candidate' beveik iškart po pasirodymo, tad tokia eilutė
        // beveik visada jau yra tuo metu, kai admin pirmą kartą bando ką nors
        // paslėpti/prisegti. Senas fallback (`update ... eq('kind','override')`)
        // tokiu atveju atnaujindavo 0 eilučių IR JOKIOS KLAIDOS NEGRĄŽINDAVO —
        // route grąžindavo {ok:true}, o hide/pin realiai NIEKUR neišsisaugodavo
        // (simptomas: paslepi renginį admin'e, po refresh vėl matomas).
        // Tikras pataisymas — migruoti indeksą į (item_key, kind) (žr.
        // 20260716_home_feed_key_per_kind.sql), kad 'override' ir 'candidate'
        // eilutės tam pačiam item_key galėtų egzistuoti nepriklausomai. Kol
        // migracija nepritaikyta gyvai DB, čia — saugus fallback: randame
        // TIKRĄ konfliktuojančią eilutę (nesvarbu koks jos kind) ir ją pačią
        // konvertuojame į 'override' (candidate metaduomenys eilutėje lieka,
        // bet nebenaudojami — tai nekenksminga).
        const { data: existingRow, error: findErr } = await sb
          .from('home_feed')
          .select('id')
          .eq('item_key', item_key)
          .maybeSingle()
        if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 })
        if (existingRow) {
          const { error: convErr } = await sb.from('home_feed').update(patch).eq('id', existingRow.id)
          if (convErr) return NextResponse.json({ error: convErr.message }, { status: 500 })
        } else {
          // Reta race: eilutė spėjo dingti tarp INSERT ir SELECT — bandom
          // originalų fallback'ą dar kartą.
          const { error: retryErr } = await sb.from('home_feed').update(patch).eq('kind', 'override').eq('item_key', item_key)
          if (retryErr) return NextResponse.json({ error: retryErr.message }, { status: 500 })
        }
      } else {
        return NextResponse.json({ error: insErr.message }, { status: 500 })
      }
    }
  }
  return NextResponse.json({ ok: true })
}
