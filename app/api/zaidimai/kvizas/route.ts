// app/api/zaidimai/kvizas/route.ts
//
// „Atspėk dainą" audio kvizas (songtrivia2.io įkvėpimas, LT turinys).
//
//   GET  ?kategorija=lt-mix&raundai=10
//        → sugeneruoja kvizą iš tracks pool'o (top pagal video_views):
//          10 raundų, kiekvienam — YT video ID (audio ištrauka), 4 atsakymai,
//          HMAC token'as su teisingu atsakymu (server-side verifikacijai).
//
//   POST { kategorija, rounds: [{ token, answerId|null, ms }] }
//        → server'is verifikuoja token'us, suskaičiuoja rezultatą, skiria
//          taškus (XP) į boombox_streaks + įrašo game_scores.
//
// Anti-farm: XP tik už pirmus 3 kvizus per dieną (toliau — „treniruotė").
// Taškavimas: teisingas atsakymas 50 + greičio bonusas iki 50 (15 s laikrodis).

import { NextRequest, NextResponse } from 'next/server'
import { bumpStreakAndXp } from '@/lib/boombox'
import {
  resolveViewer,
  quizCategory,
  loadQuizPool,
  shuffleArr,
  signPayload,
  verifyPayload,
  countRunsToday,
  insertGameScore,
  QUIZ_CATEGORIES,
} from '@/lib/zaidimai'

export const dynamic = 'force-dynamic'

const ROUND_MS = 15000
const XP_RUNS_PER_DAY = 3
const TOKEN_TTL_MS = 45 * 60 * 1000

function jsonErr(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

// ── GET: kvizo generavimas ────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const catKey = url.searchParams.get('kategorija') || 'lt-mix'
  const cat = quizCategory(catKey)
  if (!cat) return jsonErr('Nežinoma kategorija')

  const roundCount = Math.min(Math.max(parseInt(url.searchParams.get('raundai') || '10') || 10, 5), 15)

  const viewer = await resolveViewer()
  const pool = await loadQuizPool(cat)
  if (pool.length < roundCount * 4) {
    return jsonErr('Šiai kategorijai dar trūksta dainų — pabandyk kitą', 503)
  }

  // Teisingi atsakymai — skirtingi atlikėjai per visą kvizą
  const shuffled = shuffleArr(pool)
  const corrects: typeof pool = []
  const usedArtists = new Set<number>()
  for (const t of shuffled) {
    if (corrects.length >= roundCount) break
    if (usedArtists.has(t.artist_id)) continue
    usedArtists.add(t.artist_id)
    corrects.push(t)
  }
  if (corrects.length < roundCount) return jsonErr('Per mažai skirtingų atlikėjų pool\'e', 503)

  const quizId = Math.random().toString(36).slice(2, 10)
  const exp = Date.now() + TOKEN_TTL_MS

  const rounds = corrects.map((correct, idx) => {
    // 3 decoy'ai — kiti atlikėjai nei teisingas IR nei vienas kito
    const decoys: typeof pool = []
    const decoyArtists = new Set<number>([correct.artist_id])
    for (const t of shuffleArr(pool)) {
      if (decoys.length >= 3) break
      if (t.id === correct.id || decoyArtists.has(t.artist_id)) continue
      decoyArtists.add(t.artist_id)
      decoys.push(t)
    }
    const options = shuffleArr([
      { id: correct.id, title: correct.title, artist: correct.artist },
      ...decoys.map(d => ({ id: d.id, title: d.title, artist: d.artist })),
    ])
    // Ištraukos pradžia — 25–70 s (praleidžiam intro)
    const startSec = 25 + Math.floor(Math.random() * 46)
    return {
      r: idx,
      ytId: correct.ytId,
      startSec,
      correctId: correct.id, // klientas rodo feedback'ą iškart; server'is vis tiek verifikuoja token'u
      options,
      token: signPayload({ g: 'kvizas', q: quizId, r: idx, c: correct.id, exp }),
    }
  })

  const runsToday = await countRunsToday(viewer, 'kvizas')

  return NextResponse.json({
    quizId,
    category: cat.key,
    roundMs: ROUND_MS,
    rounds,
    xpRunsLeft: Math.max(0, XP_RUNS_PER_DAY - runsToday),
    categories: QUIZ_CATEGORIES.map(c => ({ key: c.key, label: c.label })),
  })
}

// ── POST: rezultato užskaitymas ───────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return jsonErr('Bad JSON')

  const { kategorija, rounds } = body as {
    kategorija: string
    rounds: Array<{ token: string; answerId: number | null; ms: number }>
  }
  const cat = quizCategory(kategorija || '')
  if (!cat) return jsonErr('Nežinoma kategorija')
  if (!Array.isArray(rounds) || rounds.length < 5 || rounds.length > 15) return jsonErr('Bad rounds')

  // Verifikuojam token'us: visi to paties kvizo, unikalūs raundai
  let quizId: string | null = null
  const seenR = new Set<number>()
  const scored: Array<{ r: number; correctId: number; answerId: number | null; correct: boolean; points: number }> = []
  let score = 0
  let correctCount = 0

  for (const round of rounds) {
    const p = verifyPayload<{ g: string; q: string; r: number; c: number; exp: number }>(round?.token || '')
    if (!p || p.g !== 'kvizas') return jsonErr('Blogas raundo token\'as')
    if (quizId === null) quizId = p.q
    if (p.q !== quizId) return jsonErr('Raundai iš skirtingų kvizų')
    if (seenR.has(p.r)) return jsonErr('Dubliuotas raundas')
    seenR.add(p.r)

    const answerId = typeof round.answerId === 'number' ? round.answerId : null
    const ms = Math.min(Math.max(typeof round.ms === 'number' ? round.ms : ROUND_MS, 0), ROUND_MS)
    const correct = answerId !== null && answerId === p.c
    let points = 0
    if (correct) {
      points = 50 + Math.round(50 * (ROUND_MS - ms) / ROUND_MS)
      correctCount++
    }
    score += points
    scored.push({ r: p.r, correctId: p.c, answerId, correct, points })
  }

  const maxScore = rounds.length * 100

  const viewer = await resolveViewer()
  const runsToday = await countRunsToday(viewer, 'kvizas')
  const xpEligible = runsToday < XP_RUNS_PER_DAY

  let xp = 0
  if (xpEligible && score > 0) {
    xp = Math.round(score / 10)
    if (viewer.userId) xp = Math.round(xp * 1.5) // narių bonusas kaip boombox'e
  }

  await insertGameScore({
    viewer,
    game: 'kvizas',
    category: cat.key,
    score,
    maxScore,
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
    maxScore,
    correctCount,
    roundCount: rounds.length,
    xp,
    xpEligible,
    xpRunsLeft: Math.max(0, XP_RUNS_PER_DAY - runsToday - 1),
    streak: streakInfo.current,
    totalXp: streakInfo.total_xp,
    answers: scored,
  })
}
