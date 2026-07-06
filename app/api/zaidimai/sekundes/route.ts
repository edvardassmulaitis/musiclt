// app/api/zaidimai/sekundes/route.ts
//
// „Atspėk iš sekundės" — groja 1 s dainos ištraukos; neatpažinai — gauni
// dar +3 s, tada +5 s. Kuo mažiau klausei, tuo daugiau taškų (100/60/30).
// Veikia tik su iTunes ištraukomis (HTML5 audio — tikslus 1 s valdymas).
//
//   GET  ?raundai=5 → raundai su užšifruotais vokais
//   POST { quizId } → rezultatas iš game_rounds DB, replay apsauga unique.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { bumpStreakAndXp } from '@/lib/boombox'
import { ensurePreviews } from '@/lib/itunes'
import {
  resolveViewer,
  quizCategory,
  loadQuizPool,
  shuffleArr,
  sealPayload,
  countRunsToday,
  type PoolTrack,
} from '@/lib/zaidimai'

export const dynamic = 'force-dynamic'

const XP_RUNS_PER_DAY = 3
const TOKEN_TTL_MS = 45 * 60 * 1000
const ROUND_MS = 25000

function jsonErr(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

// ── GET ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const roundCount = Math.min(Math.max(parseInt(url.searchParams.get('raundai') || '5') || 5, 3), 10)

  const viewer = await resolveViewer()

  // Mišrus pool'as: LT + pasaulio hitai (abu cache'uoti)
  const [ltPool, worldPool] = await Promise.all([
    loadQuizPool(quizCategory('lt-mix')!),
    loadQuizPool(quizCategory('pasaulis')!),
  ])
  const pool = [...ltPool, ...worldPool]
  if (pool.length < roundCount * 6) return jsonErr('Trūksta dainų — pabandyk vėliau', 503)

  // Kandidatai (2×, skirtingi atlikėjai) → paliekam tik su iTunes ištrauka
  const shuffled = shuffleArr(pool)
  const candidates: PoolTrack[] = []
  const usedArtists = new Set<number>()
  for (const t of shuffled) {
    if (candidates.length >= roundCount * 3) break
    if (usedArtists.has(t.artist_id)) continue
    usedArtists.add(t.artist_id)
    candidates.push(t)
  }
  const previews = await ensurePreviews(candidates.map(t => ({ id: t.id, title: t.title, artist: t.artist })))
  const withAudio = candidates.filter(t => previews.get(t.id))
  if (withAudio.length < roundCount) return jsonErr('Trūksta dainų su ištraukomis — pabandyk vėliau', 503)

  const corrects = withAudio.slice(0, roundCount)
  const quizId = `s-${Math.random().toString(36).slice(2, 10)}`
  const exp = Date.now() + TOKEN_TTL_MS

  const rounds = corrects.map((correct, idx) => {
    // Klaidinantys — iš tos pačios scenos (LT arba pasaulio)
    const sameScene = (ltPool.includes(correct) ? ltPool : worldPool)
    const decoys: PoolTrack[] = []
    const decoyArtists = new Set<number>([correct.artist_id])
    for (const t of shuffleArr(sameScene)) {
      if (decoys.length >= 3) break
      if (t.id === correct.id || decoyArtists.has(t.artist_id)) continue
      decoyArtists.add(t.artist_id)
      decoys.push(t)
    }
    const options = shuffleArr([
      { id: correct.id, title: correct.title, artist: correct.artist },
      ...decoys.map(d => ({ id: d.id, title: d.title, artist: d.artist })),
    ])
    return {
      r: idx,
      audioUrl: previews.get(correct.id)!,
      options,
      token: sealPayload({ g: 'sekundes', q: quizId, r: idx, c: correct.id, exp }),
    }
  })

  const runsToday = await countRunsToday(viewer, 'sekundes')

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
  if (!body) return jsonErr('Netinkama užklausa — perkrauk puslapį')
  const { quizId } = body as { quizId: string }
  if (typeof quizId !== 'string' || !quizId.startsWith('s-') || quizId.length > 40) {
    return jsonErr('Netinkama užklausa — perkrauk puslapį')
  }

  const viewer = await resolveViewer()
  const sb = createAdminClient()

  let rq = sb
    .from('game_rounds')
    .select('r, answer_id, ms, correct, points')
    .eq('game', 'sekundes')
    .eq('quiz_id', quizId)
    .order('r', { ascending: true })
  rq = viewer.userId ? rq.eq('user_id', viewer.userId) : rq.eq('anon_id', viewer.anonId!)
  const { data: roundRows } = await rq

  if (!roundRows || roundRows.length < 3) {
    return jsonErr('Per mažai atsakytų raundų — sužaisk iki galo', 400)
  }

  const score = roundRows.reduce((s, r) => s + (r.points || 0), 0)
  const correctCount = roundRows.filter(r => r.correct).length

  const runsToday = await countRunsToday(viewer, 'sekundes')
  const xpEligible = runsToday < XP_RUNS_PER_DAY

  let xp = 0
  if (xpEligible && score > 0) {
    xp = Math.round(score / 10)
    if (viewer.userId) xp = Math.round(xp * 1.5)
  }

  const { error: insertErr } = await sb.from('game_scores').insert({
    user_id: viewer.userId,
    anon_id: viewer.userId ? null : viewer.anonId,
    game: 'sekundes',
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
