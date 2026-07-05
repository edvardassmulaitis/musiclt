// app/api/zaidimai/vaizdas/route.ts
//
// „Atspėk iš vaizdo" (automatinis režimas) — atlikėjo nuotrauka pradžioje
// visiškai išblurinta ir per 12 s ryškėja; kuo greičiau atspėsi, tuo daugiau
// taškų. Turinys generuojasi pats iš artists lentelės (populiariausi LT
// atlikėjai su nuotraukomis) — admin darbo nereikia.
//
//   GET  ?raundai=8 → raundai su HMAC token'ais
//   POST { rounds: [{ token, answerId|null, ms }] } → server-side rezultatas
//
// Taškavimas: teisingas 40 + greičio bonusas iki 60 (12 s). XP už pirmus
// 3 žaidimus per dieną (score/10, nariams ×1.5).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { bumpStreakAndXp } from '@/lib/boombox'
import {
  resolveViewer,
  shuffleArr,
  signPayload,
  verifyPayload,
  countRunsToday,
  insertGameScore,
} from '@/lib/zaidimai'

export const dynamic = 'force-dynamic'

const ROUND_MS = 12000
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

  const quizId = Math.random().toString(36).slice(2, 10)
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
      correctId: correct.id,
      correctSlug: correct.slug,
      options,
      token: signPayload({ g: 'vaizdas', q: quizId, r: idx, c: correct.id, exp }),
    }
  })

  const runsToday = await countRunsToday(viewer, 'vaizdas')

  return NextResponse.json({
    quizId,
    roundMs: ROUND_MS,
    rounds,
    xpRunsLeft: Math.max(0, XP_RUNS_PER_DAY - runsToday),
  })
}

// ── POST ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return jsonErr('Bad JSON')
  const { rounds } = body as { rounds: Array<{ token: string; answerId: number | null; ms: number }> }
  if (!Array.isArray(rounds) || rounds.length < 5 || rounds.length > 12) return jsonErr('Bad rounds')

  let quizId: string | null = null
  const seenR = new Set<number>()
  let score = 0
  let correctCount = 0
  const scored: any[] = []

  for (const round of rounds) {
    const p = verifyPayload<{ g: string; q: string; r: number; c: number; exp: number }>(round?.token || '')
    if (!p || p.g !== 'vaizdas') return jsonErr('Blogas token\'as')
    if (quizId === null) quizId = p.q
    if (p.q !== quizId) return jsonErr('Raundai iš skirtingų žaidimų')
    if (seenR.has(p.r)) return jsonErr('Dubliuotas raundas')
    seenR.add(p.r)

    const answerId = typeof round.answerId === 'number' ? round.answerId : null
    const ms = Math.min(Math.max(typeof round.ms === 'number' ? round.ms : ROUND_MS, 0), ROUND_MS)
    const correct = answerId !== null && answerId === p.c
    let points = 0
    if (correct) {
      correctCount++
      points = 40 + Math.round(60 * (ROUND_MS - ms) / ROUND_MS)
    }
    score += points
    scored.push({ r: p.r, correctId: p.c, answerId, correct, points })
  }

  const viewer = await resolveViewer()
  const runsToday = await countRunsToday(viewer, 'vaizdas')
  const xpEligible = runsToday < XP_RUNS_PER_DAY

  let xp = 0
  if (xpEligible && score > 0) {
    xp = Math.round(score / 10)
    if (viewer.userId) xp = Math.round(xp * 1.5)
  }

  await insertGameScore({
    viewer,
    game: 'vaizdas',
    score,
    maxScore: rounds.length * 100,
    correctCount,
    roundCount: rounds.length,
    xpEarned: xp,
    details: { quizId, rounds: scored },
  })

  let streakInfo = { current: 0, total_xp: 0 }
  if (xp > 0) {
    streakInfo = await bumpStreakAndXp({ userId: viewer.userId, anonId: viewer.anonId, xp })
  }

  return NextResponse.json({
    ok: true,
    score,
    maxScore: rounds.length * 100,
    correctCount,
    roundCount: rounds.length,
    xp,
    xpEligible,
    xpRunsLeft: Math.max(0, XP_RUNS_PER_DAY - runsToday - 1),
    streak: streakInfo.current,
    totalXp: streakInfo.total_xp,
  })
}
