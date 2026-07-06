// app/api/zaidimai/kvizas/route.ts
//
// „Atspėk dainą" audio kvizas.
//
//   GET  ?kategorija=lt-mix|lt-nauja|lt-klasika|pasaulis|dienos&raundai=N
//        → raundai su užšifruotais vokais (teisingas atsakymas NEkeliauja
//          į naršyklę — feedback'as per POST /api/zaidimai/raundas).
//        „dienos" — DIENOS IŠŠŪKIS: visiems identiškas (DB momentinė kopija,
//        nepriklauso nuo instancijų cache), ×2 taškai, 1 užskaitymas/d.
//
//   POST { kategorija, quizId }
//        → rezultatas skaičiuojamas iš game_rounds DB įrašų (ne iš kliento!),
//          replay apsauga per unique (game_scores.quiz_id).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { bumpStreakAndXp, todayLT, ltDayStartUtc } from '@/lib/boombox'
import { ensurePreviews } from '@/lib/itunes'
import {
  resolveViewer,
  quizCategory,
  loadQuizPool,
  shuffleArr,
  seededShuffle,
  sealPayload,
  countRunsToday,
  dailySeed,
  mulberry32,
  QUIZ_CATEGORIES,
  type PoolTrack,
} from '@/lib/zaidimai'

export const dynamic = 'force-dynamic'

const ROUND_MS = 15000
const XP_RUNS_PER_DAY = 3
const COMBO_MIN = 3
const COMBO_BONUS = 15
const DAILY_XP_MULT = 2
const TOKEN_TTL_MS = 45 * 60 * 1000
const DAILY_KEY = 'dienos'

function jsonErr(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

// ── Raundų statyba (grynos duomenų struktūros su correctId — lieka serveryje) ──

type BuiltRound = {
  r: number
  ytId: string
  startSec: number
  correctId: number
  audioUrl?: string | null   // iTunes 30 s ištrauka (iOS garsas per <audio>)
  options: Array<{ id: number; title: string; artist: string }>
}

/** Prideda iTunes ištraukas (cache DB) — teisingo atsakymo dainai. */
async function enrichAudio(rounds: BuiltRound[]): Promise<BuiltRound[]> {
  const need = rounds.map(b => {
    const correct = b.options.find(o => o.id === b.correctId)
    return { id: b.correctId, title: correct?.title || '', artist: correct?.artist || '' }
  })
  const previews = await ensurePreviews(need)
  return rounds.map(b => ({ ...b, audioUrl: previews.get(b.correctId) ?? null }))
}

function buildRoundsData(
  pool: PoolTrack[],
  roundCount: number,
  rng?: () => number,
): BuiltRound[] | null {
  const shuf = <T,>(a: T[]) => (rng ? seededShuffle(a, rng) : shuffleArr(a))
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

  return corrects.map((correct, idx) => {
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
    return {
      r: idx,
      ytId: correct.ytId,
      startSec: 25 + Math.floor((rng ? rng() : Math.random()) * 46),
      correctId: correct.id,
      options,
    }
  })
}

/** Dienos iššūkio raundai iš DB momentinės kopijos — visiems identiški. */
async function dailyRounds(roundCount: number): Promise<BuiltRound[] | null> {
  const sb = createAdminClient()
  const today = todayLT()

  const { data: existing } = await sb
    .from('daily_quiz_snapshot')
    .select('rounds')
    .eq('day', today)
    .maybeSingle()
  if (existing?.rounds) {
    let rounds = (existing.rounds as BuiltRound[])
    if (rounds.some(r => r.audioUrl === undefined)) {
      rounds = await enrichAudio(rounds)
      await sb.from('daily_quiz_snapshot').update({ rounds }).eq('day', today)
    }
    return rounds.slice(0, roundCount)
  }

  const cat = quizCategory('lt-mix')!
  const pool = await loadQuizPool(cat)
  if (pool.length < roundCount * 4) return null
  const builtRaw = buildRoundsData(pool, roundCount, mulberry32(dailySeed()))
  if (!builtRaw) return null
  const built = await enrichAudio(builtRaw)

  // Pirmas sugeneravęs įrašo; lygiagretumo atveju laimi pirmasis įrašas
  await sb.from('daily_quiz_snapshot').upsert(
    { day: today, rounds: built },
    { onConflict: 'day', ignoreDuplicates: true },
  )
  const { data: authoritative } = await sb
    .from('daily_quiz_snapshot')
    .select('rounds')
    .eq('day', today)
    .maybeSingle()
  return ((authoritative?.rounds as BuiltRound[]) || built).slice(0, roundCount)
}

// ── GET ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const catKey = url.searchParams.get('kategorija') || 'lt-mix'
  const isDaily = catKey === DAILY_KEY
  const cat = quizCategory(isDaily ? 'lt-mix' : catKey)
  if (!cat) return jsonErr('Nežinoma kategorija — perkrauk puslapį')

  const roundCount = isDaily
    ? Math.min(Math.max(parseInt(url.searchParams.get('raundai') || '5') || 5, 5), 10)
    : Math.min(Math.max(parseInt(url.searchParams.get('raundai') || '10') || 10, 5), 15)

  const viewer = await resolveViewer()
  const today = todayLT()

  let built: BuiltRound[] | null
  let quizId: string
  if (isDaily) {
    built = await dailyRounds(roundCount)
    quizId = `d-${today}`
  } else {
    const pool = await loadQuizPool(cat)
    if (pool.length < roundCount * 4) return jsonErr('Šiai kategorijai dar trūksta dainų — pabandyk kitą', 503)
    const raw = buildRoundsData(pool, roundCount)
    built = raw ? await enrichAudio(raw) : null
    quizId = Math.random().toString(36).slice(2, 10)
  }
  if (!built) return jsonErr('Šiai kategorijai dar trūksta atlikėjų — pabandyk kitą', 503)

  const exp = Date.now() + TOKEN_TTL_MS
  const rounds = built.map(b => ({
    r: b.r,
    ytId: b.ytId,
    startSec: b.startSec,
    audioUrl: b.audioUrl ?? null,
    options: b.options,
    token: sealPayload({ g: 'kvizas', cat: isDaily ? DAILY_KEY : cat.key, d: today, q: quizId, r: b.r, c: b.correctId, exp }),
  }))

  const [regularRuns, dailyRuns] = await Promise.all([
    countRunsToday(viewer, 'kvizas', { neq: DAILY_KEY }),
    countRunsToday(viewer, 'kvizas', { eq: DAILY_KEY }),
  ])

  return NextResponse.json({
    quizId,
    category: isDaily ? DAILY_KEY : cat.key,
    isDaily,
    roundMs: ROUND_MS,
    rounds,
    xpRunsLeft: Math.max(0, XP_RUNS_PER_DAY - regularRuns),
    dailyPlayed: dailyRuns > 0,
    dailyMult: DAILY_XP_MULT,
    categories: QUIZ_CATEGORIES.map(c => ({ key: c.key, label: c.label })),
  })
}

// ── POST: rezultato užskaitymas iš DB raundų ──────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return jsonErr('Netinkama užklausa — perkrauk puslapį')

  const { kategorija, quizId } = body as { kategorija: string; quizId: string }
  const isDaily = kategorija === DAILY_KEY
  if (!isDaily && !quizCategory(kategorija || '')) return jsonErr('Nežinoma kategorija — perkrauk puslapį')
  if (typeof quizId !== 'string' || !quizId || quizId.length > 40) return jsonErr('Netinkama užklausa — perkrauk puslapį')
  if (isDaily && quizId !== `d-${todayLT()}`) return jsonErr('Prasidėjo nauja diena — pradėk dienos iššūkį iš naujo')

  const viewer = await resolveViewer()
  const sb = createAdminClient()

  // Atsakymai — iš DB (registruoti per /api/zaidimai/raundas), ne iš kliento
  let rq = sb
    .from('game_rounds')
    .select('r, answer_id, ms, correct, points')
    .eq('game', 'kvizas')
    .eq('quiz_id', quizId)
    .order('r', { ascending: true })
  rq = viewer.userId ? rq.eq('user_id', viewer.userId) : rq.eq('anon_id', viewer.anonId!)
  const { data: roundRows } = await rq

  if (!roundRows || roundRows.length < 5) {
    return jsonErr('Per mažai atsakytų raundų — sužaisk kvizą iki galo', 400)
  }

  const score = roundRows.reduce((s, r) => s + (r.points || 0), 0)
  const correctCount = roundRows.filter(r => r.correct).length
  let bestCombo = 0
  {
    let run = 0
    for (const r of roundRows) {
      run = r.correct ? run + 1 : 0
      bestCombo = Math.max(bestCombo, run)
    }
  }
  const maxScore = roundRows.length * 100 + Math.max(0, roundRows.length - COMBO_MIN + 1) * COMBO_BONUS

  let xpEligible: boolean
  if (isDaily) {
    xpEligible = (await countRunsToday(viewer, 'kvizas', { eq: DAILY_KEY })) === 0
  } else {
    xpEligible = (await countRunsToday(viewer, 'kvizas', { neq: DAILY_KEY })) < XP_RUNS_PER_DAY
  }

  let xp = 0
  if (xpEligible && score > 0) {
    xp = Math.round(score / 10) * (isDaily ? DAILY_XP_MULT : 1)
    if (viewer.userId) xp = Math.round(xp * 1.5)
  }

  // Replay apsauga: unique (viewer, game, quiz_id) DB lygiu
  const { error: insertErr } = await sb.from('game_scores').insert({
    user_id: viewer.userId,
    anon_id: viewer.userId ? null : viewer.anonId,
    game: 'kvizas',
    category: kategorija,
    quiz_id: quizId,
    score,
    max_score: maxScore,
    correct_count: correctCount,
    round_count: roundRows.length,
    xp_earned: xp,
    details: { bestCombo, rounds: roundRows },
  })
  if (insertErr) {
    if (insertErr.code === '23505') {
      return jsonErr(isDaily ? 'Dienos iššūkis šiandien jau užskaitytas' : 'Šis kvizas jau užskaitytas', 409)
    }
    return jsonErr('Nepavyko užskaityti — pabandyk dar kartą', 500)
  }

  let streakInfo = { current: 0, total_xp: 0 }
  if (xp > 0) {
    streakInfo = await bumpStreakAndXp({ userId: viewer.userId, anonId: viewer.anonId, xp })
  }

  // Dienos konteksto palyginimas (skaičiuojam count'ais — be 1000 eilučių ribos)
  let dailyRank: { better: number; total: number } | null = null
  if (isDaily) {
    const dayStart = ltDayStartUtc()
    const base = () => sb
      .from('game_scores')
      .select('id', { count: 'exact', head: true })
      .eq('game', 'kvizas')
      .eq('category', DAILY_KEY)
      .gte('created_at', dayStart)
    const [totalRes, betterRes] = await Promise.all([base(), base().gt('score', score)])
    dailyRank = { better: betterRes.count || 0, total: totalRes.count || 0 }
  }

  return NextResponse.json({
    ok: true,
    score,
    maxScore,
    correctCount,
    roundCount: roundRows.length,
    bestCombo,
    xp,
    xpEligible,
    isDaily,
    dailyRank,
    streak: streakInfo.current,
    totalXp: streakInfo.total_xp,
    answers: roundRows.map(r => ({ r: r.r, answerId: r.answer_id, correct: r.correct, points: r.points })),
  })
}
