// app/api/zaidimai/kvizas/route.ts
//
// „Atspėk dainą" audio kvizas (songtrivia2.io + Wordle/Heardle mechanikos).
//
//   GET  ?kategorija=lt-mix|lt-nauja|lt-klasika|pasaulis|dienos&raundai=10
//        → sugeneruoja kvizą iš tracks pool'o. „dienos" — DIENOS IŠŠŪKIS:
//          date-seeded, VISIEMS TAS PATS (Wordle formulė: vienas iššūkis per
//          dieną, bendras palyginimas, share'inamas rezultatas), taškai ×2,
//          užskaitomas 1 bandymas per dieną.
//
//   POST { kategorija, rounds: [{ token, answerId|null, ms }] }
//        → server'is verifikuoja HMAC token'us, skaičiuoja rezultatą su COMBO
//          bonusu (3+ teisingi iš eilės → +15/raundą), skiria taškus.
//
// Anti-farm: XP už pirmus 3 paprastus kvizus/d. + 1 dienos iššūkį/d.
// Taškavimas: teisingas 50 + greičio bonusas iki 50 + combo.

import { NextRequest, NextResponse } from 'next/server'
import { bumpStreakAndXp, todayLT } from '@/lib/boombox'
import {
  resolveViewer,
  quizCategory,
  loadQuizPool,
  shuffleArr,
  seededShuffle,
  signPayload,
  verifyPayload,
  countRunsToday,
  insertGameScore,
  dailySeed,
  mulberry32,
  QUIZ_CATEGORIES,
  type PoolTrack,
} from '@/lib/zaidimai'

export const dynamic = 'force-dynamic'

const ROUND_MS = 15000
const XP_RUNS_PER_DAY = 3          // paprasti kvizai
const COMBO_MIN = 3                // nuo kelinto teisingo iš eilės skaičiuojam combo
const COMBO_BONUS = 15             // + už kiekvieną combo raundą
const DAILY_XP_MULT = 2            // dienos iššūkio taškų daugiklis
const TOKEN_TTL_MS = 45 * 60 * 1000
const DAILY_KEY = 'dienos'

function jsonErr(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

// ── Raundų statyba (bendra random ir seeded režimams) ────────────────────

function buildRounds(
  pool: PoolTrack[],
  roundCount: number,
  opts: { rng?: () => number; cat: string; date: string },
) {
  const rng = opts.rng
  const shuf = <T,>(a: T[]) => (rng ? seededShuffle(a, rng) : shuffleArr(a))

  // Teisingi atsakymai — skirtingi atlikėjai per visą kvizą.
  // Seeded režimui pool'ą pirma stabilizuojam pagal id (kad visiems būtų
  // identiška nepriklausomai nuo DB eiliškumo smulkmenų).
  const base = rng ? [...pool].sort((a, b) => a.id - b.id) : pool
  const shuffled = shuf(base)
  const corrects: PoolTrack[] = []
  const usedArtists = new Set<number>()
  for (const t of shuffled) {
    if (corrects.length >= roundCount) break
    if (usedArtists.has(t.artist_id)) continue
    usedArtists.add(t.artist_id)
    corrects.push(t)
  }
  if (corrects.length < roundCount) return null

  const quizId = rng ? `d-${opts.date}` : Math.random().toString(36).slice(2, 10)
  const exp = Date.now() + TOKEN_TTL_MS

  const rounds = corrects.map((correct, idx) => {
    const decoys: PoolTrack[] = []
    const decoyArtists = new Set<number>([correct.artist_id])
    for (const t of shuf(base)) {
      if (decoys.length >= 3) break
      if (t.id === correct.id || decoyArtists.has(t.artist_id)) continue
      decoyArtists.add(t.artist_id)
      decoys.push(t)
    }
    const options = shuf([
      { id: correct.id, title: correct.title, artist: correct.artist },
      ...decoys.map(d => ({ id: d.id, title: d.title, artist: d.artist })),
    ])
    const startSec = 25 + Math.floor((rng ? rng() : Math.random()) * 46)
    return {
      r: idx,
      ytId: correct.ytId,
      startSec,
      correctId: correct.id, // greitas client feedback; server'is verifikuoja token'u
      options,
      token: signPayload({ g: 'kvizas', cat: opts.cat, d: opts.date, q: quizId, r: idx, c: correct.id, exp }),
    }
  })

  return { quizId, rounds }
}

// ── GET: kvizo generavimas ────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const catKey = url.searchParams.get('kategorija') || 'lt-mix'
  const isDaily = catKey === DAILY_KEY
  const cat = quizCategory(isDaily ? 'lt-mix' : catKey)
  if (!cat) return jsonErr('Nežinoma kategorija')

  // Dienos iššūkis — 5 raundai (dalis Dienos iššūkio wizard'o /zaidimai/dienos)
  const roundCount = isDaily
    ? Math.min(Math.max(parseInt(url.searchParams.get('raundai') || '5') || 5, 5), 10)
    : Math.min(Math.max(parseInt(url.searchParams.get('raundai') || '10') || 10, 5), 15)

  const viewer = await resolveViewer()
  const pool = await loadQuizPool(cat)
  if (pool.length < roundCount * 4) {
    return jsonErr('Šiai kategorijai dar trūksta dainų — pabandyk kitą', 503)
  }

  const today = todayLT()
  const built = buildRounds(pool, roundCount, {
    rng: isDaily ? mulberry32(dailySeed()) : undefined,
    cat: isDaily ? DAILY_KEY : cat.key,
    date: today,
  })
  if (!built) return jsonErr('Per mažai skirtingų atlikėjų pool\'e', 503)

  const [regularRuns, dailyRuns] = await Promise.all([
    countRunsToday(viewer, 'kvizas', { neq: DAILY_KEY }),
    countRunsToday(viewer, 'kvizas', { eq: DAILY_KEY }),
  ])

  return NextResponse.json({
    quizId: built.quizId,
    category: isDaily ? DAILY_KEY : cat.key,
    isDaily,
    roundMs: ROUND_MS,
    rounds: built.rounds,
    xpRunsLeft: Math.max(0, XP_RUNS_PER_DAY - regularRuns),
    dailyPlayed: dailyRuns > 0,
    dailyMult: DAILY_XP_MULT,
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
  const isDaily = kategorija === DAILY_KEY
  if (!isDaily && !quizCategory(kategorija || '')) return jsonErr('Nežinoma kategorija')
  if (!Array.isArray(rounds) || rounds.length < 5 || rounds.length > 15) return jsonErr('Bad rounds')

  const today = todayLT()

  // Verifikuojam token'us: visi to paties kvizo/kategorijos, unikalūs raundai
  let quizId: string | null = null
  const seenR = new Set<number>()
  const parsed: Array<{ r: number; correctId: number; answerId: number | null; ms: number }> = []

  for (const round of rounds) {
    const p = verifyPayload<{ g: string; cat: string; d: string; q: string; r: number; c: number; exp: number }>(round?.token || '')
    if (!p || p.g !== 'kvizas') return jsonErr('Blogas raundo token\'as')
    if ((p.cat || '') !== kategorija) return jsonErr('Token\'as ne šios kategorijos')
    if (isDaily && p.d !== today) return jsonErr('Dienos iššūkio token\'as pasenęs — nauja diena!')
    if (quizId === null) quizId = p.q
    if (p.q !== quizId) return jsonErr('Raundai iš skirtingų kvizų')
    if (seenR.has(p.r)) return jsonErr('Dubliuotas raundas')
    seenR.add(p.r)

    const answerId = typeof round.answerId === 'number' ? round.answerId : null
    const ms = Math.min(Math.max(typeof round.ms === 'number' ? round.ms : ROUND_MS, 0), ROUND_MS)
    parsed.push({ r: p.r, correctId: p.c, answerId, ms })
  }

  // Skaičiavimas raundų eile su combo
  parsed.sort((a, b) => a.r - b.r)
  let score = 0
  let correctCount = 0
  let comboBonus = 0
  let streakRun = 0
  let bestCombo = 0
  const scored = parsed.map(p => {
    const correct = p.answerId !== null && p.answerId === p.correctId
    let points = 0
    let combo = 0
    if (correct) {
      correctCount++
      streakRun++
      bestCombo = Math.max(bestCombo, streakRun)
      points = 50 + Math.round(50 * (ROUND_MS - p.ms) / ROUND_MS)
      if (streakRun >= COMBO_MIN) { combo = COMBO_BONUS; comboBonus += COMBO_BONUS }
    } else {
      streakRun = 0
    }
    score += points + combo
    return { r: p.r, correctId: p.correctId, answerId: p.answerId, correct, points: points + combo }
  })

  const maxScore = rounds.length * 100 + Math.max(0, rounds.length - COMBO_MIN + 1) * COMBO_BONUS

  const viewer = await resolveViewer()
  let xpEligible: boolean
  if (isDaily) {
    const dailyRuns = await countRunsToday(viewer, 'kvizas', { eq: DAILY_KEY })
    xpEligible = dailyRuns === 0
  } else {
    const regularRuns = await countRunsToday(viewer, 'kvizas', { neq: DAILY_KEY })
    xpEligible = regularRuns < XP_RUNS_PER_DAY
  }

  let xp = 0
  if (xpEligible && score > 0) {
    xp = Math.round(score / 10) * (isDaily ? DAILY_XP_MULT : 1)
    if (viewer.userId) xp = Math.round(xp * 1.5) // narių bonusas kaip boombox'e
  }

  await insertGameScore({
    viewer,
    game: 'kvizas',
    category: kategorija,
    score,
    maxScore,
    correctCount,
    roundCount: rounds.length,
    xpEarned: xp,
    details: { quizId, comboBonus, bestCombo, rounds: scored },
  })

  let streakInfo = { current: 0, total_xp: 0 }
  if (xp > 0) {
    streakInfo = await bumpStreakAndXp({ userId: viewer.userId, anonId: viewer.anonId, xp })
  }

  // Dienos iššūkio bendruomenės kontekstas (palyginimui + share'ui)
  let dailyRank: { better: number; total: number } | null = null
  if (isDaily) {
    const { createAdminClient } = await import('@/lib/supabase')
    const sb = createAdminClient()
    const { data: todays } = await sb
      .from('game_scores')
      .select('score')
      .eq('game', 'kvizas')
      .eq('category', DAILY_KEY)
      .gte('created_at', `${today}T00:00:00+03:00`)
    const all = (todays || []).map(r => r.score)
    dailyRank = { better: all.filter(s => s > score).length, total: all.length }
  }

  return NextResponse.json({
    ok: true,
    score,
    maxScore,
    correctCount,
    roundCount: rounds.length,
    comboBonus,
    bestCombo,
    xp,
    xpEligible,
    isDaily,
    dailyRank,
    streak: streakInfo.current,
    totalXp: streakInfo.total_xp,
    answers: scored,
  })
}
