// app/api/zaidimai/vaizdas/route.ts
//
// „Atspėk iš vaizdo" — atlikėjo nuotrauka per 12 s ryškėja; kuo greičiau
// atpažinsi, tuo daugiau taškų. Turinys generuojasi pats iš artists lentelės.
//
//   GET  ?raundai=8 → raundai su užšifruotais vokais (atsakymas nekeliauja
//        į naršyklę; feedback'as per POST /api/zaidimai/raundas)
//   POST { quizId } → rezultatas iš game_rounds DB, replay apsauga unique.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { bumpStreakAndXp } from '@/lib/boombox'
import {
  resolveViewer,
  shuffleArr,
  sealPayload,
  countRunsToday,
} from '@/lib/zaidimai'

export const dynamic = 'force-dynamic'

const XP_RUNS_PER_DAY = 3
const TOKEN_TTL_MS = 45 * 60 * 1000

function jsonErr(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

// ── GET ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const roundCount = Math.min(Math.max(parseInt(url.searchParams.get('raundai') || '8') || 8, 5), 12)

  const viewer = await resolveViewer()
  const sb = createAdminClient()

  const { data: pool } = await sb
    .from('artists')
    .select('id, name, slug, cover_image_url, score')
    .eq('country', 'Lietuva')
    .not('cover_image_url', 'is', null)
    .gt('score', 5)
    .order('score', { ascending: false })
    .limit(160)

  if (!pool || pool.length < roundCount * 4) return jsonErr('Per mažai atlikėjų su nuotraukomis', 503)

  const quizId = `v-${Math.random().toString(36).slice(2, 10)}`
  const exp = Date.now() + TOKEN_TTL_MS

  const corrects = shuffleArr(pool).slice(0, roundCount)
  const rounds = corrects.map((correct, idx) => {
    const decoys = shuffleArr(pool.filter(a => a.id !== correct.id)).slice(0, 3)
    const options = shuffleArr([
      { id: correct.id, name: correct.name },
      ...decoys.map(d => ({ id: d.id, name: d.name })),
    ])
    return {
      r: idx,
      image: correct.cover_image_url,
      options,
      token: sealPayload({ g: 'vaizdas', q: quizId, r: idx, c: correct.id, exp }),
    }
  })

  const runsToday = await countRunsToday(viewer, 'vaizdas')

  return NextResponse.json({
    quizId,
    roundMs: 12000,
    rounds,
    xpRunsLeft: Math.max(0, XP_RUNS_PER_DAY - runsToday),
  })
}

// ── POST ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return jsonErr('Netinkama užklausa — perkrauk puslapį')
  const { quizId } = body as { quizId: string }
  if (typeof quizId !== 'string' || !quizId.startsWith('v-') || quizId.length > 40) {
    return jsonErr('Netinkama užklausa — perkrauk puslapį')
  }

  const viewer = await resolveViewer()
  const sb = createAdminClient()

  let rq = sb
    .from('game_rounds')
    .select('r, answer_id, ms, correct, points')
    .eq('game', 'vaizdas')
    .eq('quiz_id', quizId)
    .order('r', { ascending: true })
  rq = viewer.userId ? rq.eq('user_id', viewer.userId) : rq.eq('anon_id', viewer.anonId!)
  const { data: roundRows } = await rq

  if (!roundRows || roundRows.length < 5) {
    return jsonErr('Per mažai atsakytų raundų — sužaisk iki galo', 400)
  }

  const score = roundRows.reduce((s, r) => s + (r.points || 0), 0)
  const correctCount = roundRows.filter(r => r.correct).length

  const runsToday = await countRunsToday(viewer, 'vaizdas')
  const xpEligible = runsToday < XP_RUNS_PER_DAY

  let xp = 0
  if (xpEligible && score > 0) {
    xp = Math.round(score / 10)
    if (viewer.userId) xp = Math.round(xp * 1.5)
  }

  const { error: insertErr } = await sb.from('game_scores').insert({
    user_id: viewer.userId,
    anon_id: viewer.userId ? null : viewer.anonId,
    game: 'vaizdas',
    quiz_id: quizId,
    score,
    max_score: roundRows.length * 100,
    correct_count: correctCount,
    round_count: roundRows.length,
    xp_earned: xp,
    details: { rounds: roundRows },
  })
  if (insertErr) {
    if (insertErr.code === '23505') return jsonErr('Šis žaidimas jau užskaitytas', 409)
    return jsonErr('Nepavyko užskaityti — pabandyk dar kartą', 500)
  }

  let streakInfo = { current: 0, total_xp: 0 }
  if (xp > 0) {
    streakInfo = await bumpStreakAndXp({ userId: viewer.userId, anonId: viewer.anonId, xp })
  }

  return NextResponse.json({
    ok: true,
    score,
    maxScore: roundRows.length * 100,
    correctCount,
    roundCount: roundRows.length,
    xp,
    xpEligible,
    xpRunsLeft: Math.max(0, XP_RUNS_PER_DAY - runsToday - 1),
    streak: streakInfo.current,
    totalXp: streakInfo.total_xp,
  })
}
