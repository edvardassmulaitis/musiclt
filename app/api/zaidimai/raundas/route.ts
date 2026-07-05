// app/api/zaidimai/raundas/route.ts
//
// Vieno raundo atsakymo registravimas („Atspėk dainą" ir „Atspėk iš vaizdo").
//
//   POST { token, answerId|null, ms }
//        → { correct, correctId, points, comboNow }
//
// Sąžiningumo modelis:
//   * Teisingas atsakymas gyvena TIK užšifruotame voke (sealPayload) —
//     naršyklė jo neperskaito, todėl feedback'as gaunamas tik ATSAKIUS.
//   * Pirmas atsakymas fiksuojamas game_rounds su unique — pakartotinis
//     bandymas grąžina PIRMĄJĮ rezultatą (atsakymo pakeisti negalima).
//   * Kvizo serijos („iš eilės") bonusas skaičiuojamas serveryje iš DB.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { resolveViewer, openPayload } from '@/lib/zaidimai'

export const dynamic = 'force-dynamic'

const KVIZAS_ROUND_MS = 15000
const VAIZDAS_ROUND_MS = 12000
const COMBO_MIN = 3
const COMBO_BONUS = 15

function jsonErr(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return jsonErr('Netinkama užklausa — perkrauk puslapį')

  const p = openPayload<{ g: string; q: string; r: number; c: number; exp: number }>(body.token || '')
  if (!p || (p.g !== 'kvizas' && p.g !== 'vaizdas')) {
    return jsonErr('Žaidimo sesija pasenusi — pradėk iš naujo', 410)
  }

  const roundMs = p.g === 'kvizas' ? KVIZAS_ROUND_MS : VAIZDAS_ROUND_MS
  const answerId = typeof body.answerId === 'number' ? body.answerId : null
  const ms = Math.min(Math.max(typeof body.ms === 'number' ? body.ms : roundMs, 0), roundMs)
  const correct = answerId !== null && answerId === p.c

  const viewer = await resolveViewer()
  const sb = createAdminClient()

  // Serijos bonusas (tik kvizui): kiek teisingų iš eilės iki šio raundo
  let comboNow = 0
  if (p.g === 'kvizas' && correct) {
    const { data: prev } = await sb
      .from('game_rounds')
      .select('r, correct')
      .eq('game', p.g)
      .eq('quiz_id', p.q)
      .lt('r', p.r)
      .order('r', { ascending: false })
      .limit(15)
      .match(viewer.userId ? { user_id: viewer.userId } : { anon_id: viewer.anonId! })
    let streak = 0
    let expectR = p.r - 1
    for (const row of prev || []) {
      if (row.r !== expectR || !row.correct) break
      streak++
      expectR--
    }
    comboNow = streak + 1
  }

  let points = 0
  if (correct) {
    if (p.g === 'kvizas') {
      points = 50 + Math.round(50 * (roundMs - ms) / roundMs)
      if (comboNow >= COMBO_MIN) points += COMBO_BONUS
    } else {
      points = 40 + Math.round(60 * (roundMs - ms) / roundMs)
    }
  }

  const { error: insertErr } = await sb.from('game_rounds').insert({
    user_id: viewer.userId,
    anon_id: viewer.userId ? null : viewer.anonId,
    game: p.g,
    quiz_id: p.q,
    r: p.r,
    answer_id: answerId,
    ms,
    correct,
    points,
  })

  if (insertErr) {
    if (insertErr.code === '23505') {
      // Jau atsakyta — grąžinam PIRMĄJĮ (galiojantį) rezultatą
      let q = sb
        .from('game_rounds')
        .select('answer_id, correct, points')
        .eq('game', p.g)
        .eq('quiz_id', p.q)
        .eq('r', p.r)
      q = viewer.userId ? q.eq('user_id', viewer.userId) : q.eq('anon_id', viewer.anonId!)
      const { data: existing } = await q.maybeSingle()
      return NextResponse.json({
        ok: true,
        repeated: true,
        correct: existing?.correct ?? false,
        correctId: p.c,
        points: existing?.points ?? 0,
        comboNow: 0,
      })
    }
    return jsonErr('Nepavyko įrašyti atsakymo — pabandyk dar kartą', 500)
  }

  return NextResponse.json({
    ok: true,
    correct,
    correctId: p.c,
    points,
    comboNow: correct ? comboNow : 0,
  })
}
