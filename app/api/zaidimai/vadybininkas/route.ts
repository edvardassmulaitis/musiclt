// app/api/zaidimai/vadybininkas/route.ts
//
// „Muzikos vadybininkas" v1 — testuotojo minėtos idėjos realizacija.
//
// Žaidimo ciklas (viena sesija ~2 min):
//   1. GET  → „rinka": 9 REALŪS LT atlikėjai (iš artists lentelės, su tikrais
//      populiarumo duomenimis) 3 kainų pakopose. Biudžetas 100 tšk.
//   2. Žaidėjas pasirašo sutartis su 3 atlikėjais (turi tilpti į biudžetą —
//      superžvaigždė + vidutinis + kylantis, arba rizikingas pigus trio...).
//   3. POST → server'is simuliuoja 4 ketvirčius: pajamos + įvykiai
//      (festivaliai, TikTok virusai, skandalai...), įtakojami REALIŲ atlikėjo
//      duomenų (score, score_trending, švieži релizai). Deterministinis RNG
//      iš token'o seed'o — rezultato nesuklastosi perkraudamas.
//   4. Agentūros vertė = likęs biudžetas + pajamos + roster'io perpardavimas.
//
// Taškai: pirmi 2 žaidimai per dieną (nariams ×1.5), toliau — treniruotė.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { bumpStreakAndXp } from '@/lib/boombox'
import {
  resolveViewer,
  signPayload,
  verifyPayload,
  countRunsToday,
  insertGameScore,
  shuffleArr,
  mulberry32,
} from '@/lib/zaidimai'

export const dynamic = 'force-dynamic'

const BUDGET = 100
const XP_RUNS_PER_DAY = 2
const TOKEN_TTL_MS = 60 * 60 * 1000

function jsonErr(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

type MarketArtist = {
  id: number
  name: string
  slug: string
  image: string | null
  tier: 'A' | 'B' | 'C'
  tierLabel: string
  price: number
  stars: number          // 1–5, iš tikro score
  trending: boolean      // score_trending aukštas
}

// ── GET: rinka ────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  const viewer = await resolveViewer()
  const sb = createAdminClient()

  const { data: artists } = await sb
    .from('artists')
    .select('id, name, slug, cover_image_url, score, score_trending')
    .eq('country', 'Lietuva')
    .not('cover_image_url', 'is', null)
    .not('score', 'is', null)
    .order('score', { ascending: false })
    .limit(80)

  if (!artists || artists.length < 30) return jsonErr('Per mažai atlikėjų rinkai', 503)

  const scores = artists.map(a => a.score || 0)
  const maxS = Math.max(...scores)
  const minS = Math.min(...scores)
  const starsOf = (s: number) => 1 + Math.round(4 * ((s - minS) / Math.max(1, maxS - minS)))

  const tierA = shuffleArr(artists.slice(0, 15)).slice(0, 3)
  const tierB = shuffleArr(artists.slice(15, 40)).slice(0, 3)
  const tierC = shuffleArr(artists.slice(40, 80)).slice(0, 3)

  const trendVals = artists.map(a => a.score_trending || 0).sort((x, y) => y - x)
  const trendCut = trendVals[Math.floor(trendVals.length * 0.2)] || 0

  const mk = (a: any, tier: 'A' | 'B' | 'C'): MarketArtist => {
    const price = tier === 'A'
      ? 40 + Math.floor(Math.random() * 16)   // 40–55
      : tier === 'B'
      ? 20 + Math.floor(Math.random() * 13)   // 20–32
      : 8 + Math.floor(Math.random() * 9)     // 8–16
    return {
      id: a.id,
      name: a.name,
      slug: a.slug,
      image: a.cover_image_url,
      tier,
      tierLabel: tier === 'A' ? 'Superžvaigždė' : tier === 'B' ? 'Scenos vardas' : 'Kylantis',
      price,
      stars: starsOf(a.score || 0),
      trending: (a.score_trending || 0) >= trendCut && (a.score_trending || 0) > 0,
    }
  }

  const market: MarketArtist[] = [
    ...tierA.map(a => mk(a, 'A')),
    ...tierB.map(a => mk(a, 'B')),
    ...tierC.map(a => mk(a, 'C')),
  ]

  const seed = Math.floor(Math.random() * 2 ** 31)
  const token = signPayload({
    g: 'vadyb',
    seed,
    budget: BUDGET,
    a: market.map(m => [m.id, m.price]),
    exp: Date.now() + TOKEN_TTL_MS,
  })

  const runsToday = await countRunsToday(viewer, 'vadybininkas')

  return NextResponse.json({
    budget: BUDGET,
    market,
    token,
    xpRunsLeft: Math.max(0, XP_RUNS_PER_DAY - runsToday),
  })
}

// ── POST: simuliacija ─────────────────────────────────────────────────────

type SimEvent = { artist: string; text: string; delta: number }
type SimQuarter = { q: number; label: string; events: SimEvent[]; income: number }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return jsonErr('Bad JSON')
  const { token, picked } = body as { token: string; picked: number[] }

  const p = verifyPayload<{ g: string; seed: number; budget: number; a: [number, number][]; exp: number }>(token || '')
  if (!p || p.g !== 'vadyb') return jsonErr('Blogas token\'as — atsinaujink rinką')
  if (!Array.isArray(picked) || picked.length !== 3 || new Set(picked).size !== 3) {
    return jsonErr('Pasirink lygiai 3 atlikėjus')
  }

  const priceById = new Map(p.a)
  let spent = 0
  for (const id of picked) {
    const price = priceById.get(id)
    if (typeof price !== 'number') return jsonErr('Atlikėjas ne iš šios rinkos')
    spent += price
  }
  if (spent > p.budget) return jsonErr('Viršytas biudžetas')

  // Realūs pasirašytų atlikėjų duomenys
  const sb = createAdminClient()
  const { data: artistRows } = await sb
    .from('artists')
    .select('id, name, slug, cover_image_url, score, score_trending')
    .in('id', picked)
  if (!artistRows || artistRows.length !== 3) return jsonErr('Atlikėjai nerasti', 404)

  const yearAgo = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10)
  const roster = [] as Array<{
    id: number; name: string; slug: string; image: string | null
    price: number; score: number; trending: number; freshReleases: number
  }>
  for (const a of artistRows) {
    const { count } = await sb
      .from('tracks')
      .select('id', { count: 'exact', head: true })
      .eq('artist_id', a.id)
      .gte('release_date', yearAgo)
    roster.push({
      id: a.id,
      name: a.name,
      slug: a.slug,
      image: a.cover_image_url,
      price: priceById.get(a.id)!,
      score: a.score || 0,
      trending: a.score_trending || 0,
      freshReleases: count || 0,
    })
  }

  // ── Deterministinė simuliacija iš seed'o ──
  const rng = mulberry32(p.seed ^ (picked[0] * 7919) ^ (picked[1] * 104729) ^ (picked[2] * 1299709))

  const maxTrend = Math.max(1, ...roster.map(r => r.trending))
  const quarters: SimQuarter[] = []
  let totalIncome = 0

  const QUARTER_LABELS = ['1 ketvirtis — nauja pradžia', '2 ketvirtis — festivalių sezonas', '3 ketvirtis — rudens tūrai', '4 ketvirtis — apdovanojimų metas']

  for (let q = 0; q < 4; q++) {
    const events: SimEvent[] = []
    let income = 0

    for (const r of roster) {
      // Bazinės ketvirčio pajamos: ~18–30% kainos + trending priedas
      const trendBoost = 1 + 0.35 * (r.trending / maxTrend)
      const base = r.price * (0.16 + rng() * 0.14) * trendBoost
      income += base

      // Įvykiai (0–2 per ketvirtį), tikimybės iš realių duomenų
      const eventRoll = rng()
      if (eventRoll < 0.6) {
        const pool: Array<{ w: number; text: string; lo: number; hi: number }> = [
          { w: 1.5 + r.score / 40, text: q === 1 ? '🎪 pakviestas į didžiąją festivalio sceną' : '🎤 solinis koncertas išparduotas', lo: 6, hi: 14 },
          { w: 1 + 2.5 * (r.trending / maxTrend), text: '📈 daina tapo virusinė TikTok\'e', lo: 6, hi: 18 },
          { w: 1.2, text: '📻 pateko į radijo rotacijos viršūnę', lo: 4, hi: 9 },
          { w: 0.9, text: '🤝 pasirašė reklamos kontraktą', lo: 5, hi: 12 },
          { w: 0.8 + r.freshReleases * 0.6, text: '🆕 išleido naują singlą — streamai auga', lo: 5, hi: 11 },
          { w: 0.7, text: '😬 skandalas socialiniuose tinkluose', lo: -10, hi: -4 },
          { w: 0.6, text: '🤒 atšauktas koncertas paskutinę minutę', lo: -7, hi: -3 },
          { w: 0.5, text: '💸 nesutarimai dėl honoraro — teisininkų išlaidos', lo: -6, hi: -2 },
        ]
        const totalW = pool.reduce((s, e) => s + e.w, 0)
        let roll = rng() * totalW
        let ev = pool[0]
        for (const e of pool) { roll -= e.w; if (roll <= 0) { ev = e; break } }
        const delta = Math.round(ev.lo + rng() * (ev.hi - ev.lo))
        income += delta
        events.push({ artist: r.name, text: ev.text, delta })
      }
    }

    income = Math.round(income)
    totalIncome += income
    quarters.push({ q: q + 1, label: QUARTER_LABELS[q], events, income })
  }

  // Roster'io perpardavimo vertė metų gale
  const resale = roster.map(r => {
    const drift = 0.75 + rng() * 0.5 + 0.25 * (r.trending / maxTrend)
    return { id: r.id, name: r.name, image: r.image, bought: r.price, value: Math.round(r.price * drift) }
  })
  const resaleTotal = resale.reduce((s, r) => s + r.value, 0)

  const finalValue = Math.max(0, p.budget - spent + totalIncome + resaleTotal)

  const grade =
    finalValue < 95 ? { label: 'Garažo vadybininkas', emoji: '🚗' } :
    finalValue < 120 ? { label: 'Klubų tūro vadybininkas', emoji: '🎫' } :
    finalValue < 150 ? { label: 'Radijo eterio vilkas', emoji: '📻' } :
    finalValue < 185 ? { label: 'Arenos magnatas', emoji: '🏟️' } :
    { label: 'Legendinis prodiuseris', emoji: '👑' }

  // ── Taškai ──
  const viewer = await resolveViewer()
  const runsToday = await countRunsToday(viewer, 'vadybininkas')
  const xpEligible = runsToday < XP_RUNS_PER_DAY
  let xp = 0
  if (xpEligible) {
    xp = Math.min(90, Math.max(10, Math.round((finalValue - 80) * 0.5)))
    if (viewer.userId) xp = Math.round(xp * 1.5)
  }

  await insertGameScore({
    viewer,
    game: 'vadybininkas',
    category: null,
    score: finalValue,
    maxScore: null,
    xpEarned: xp,
    details: { picked, spent, totalIncome, resaleTotal, grade: grade.label },
  })

  let streakInfo = { current: 0, total_xp: 0 }
  if (xp > 0) {
    streakInfo = await bumpStreakAndXp({ userId: viewer.userId, anonId: viewer.anonId, xp })
  }

  return NextResponse.json({
    ok: true,
    spent,
    remaining: p.budget - spent,
    quarters,
    resale,
    totalIncome,
    finalValue,
    grade,
    xp,
    xpEligible,
    xpRunsLeft: Math.max(0, XP_RUNS_PER_DAY - runsToday - 1),
    totalXp: streakInfo.total_xp,
  })
}
