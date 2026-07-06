// app/api/zaidimai/vaizdas/route.ts
//
// „Atspėk iš vaizdo" — populiaraus albumo viršelis per 12 s ryškėja; kuo
// greičiau atpažinsi, tuo daugiau taškų. Turinys — albumai su viršeliais
// (užsienio populiariausi + lietuvių žinomiausių atlikėjų).
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

type AlbumRow = {
  id: number
  title: string
  cover_image_url: string
  score: number | null
  artists: { id: number; name: string; country: string | null; score: number | null } | null
}

type PoolItem = {
  id: number
  label: string
  image: string
  artistId: number
  lt: boolean
}

/** Iš albumų eilučių padaro pool'ą: max 2 albumai vienam atlikėjui. */
function buildPool(rows: AlbumRow[], lt: boolean): PoolItem[] {
  const perArtist = new Map<number, number>()
  const out: PoolItem[] = []
  for (const r of rows) {
    if (!r.artists || !r.cover_image_url || !r.title) continue
    const n = perArtist.get(r.artists.id) || 0
    if (n >= 2) continue
    perArtist.set(r.artists.id, n + 1)
    out.push({
      id: r.id,
      label: `${r.artists.name} — ${r.title}`,
      image: r.cover_image_url,
      artistId: r.artists.id,
      lt,
    })
  }
  return out
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const roundCount = Math.min(Math.max(parseInt(url.searchParams.get('raundai') || '8') || 8, 3), 12)

  const viewer = await resolveViewer()
  const sb = createAdminClient()

  const albumSelect = 'id, title, cover_image_url, score, artists:artist_id!inner(id, name, country, score)'

  // Užsienio populiariausi albumai (albumo score) + LT žinomiausių atlikėjų albumai.
  const [{ data: uzsienio }, { data: lietuviski }] = await Promise.all([
    sb
      .from('albums')
      .select(albumSelect)
      .not('cover_image_url', 'is', null)
      .gte('score', 30)
      .neq('artists.country', 'Lietuva')
      .order('score', { ascending: false })
      .limit(400),
    sb
      .from('albums')
      .select(albumSelect)
      .not('cover_image_url', 'is', null)
      .eq('artists.country', 'Lietuva')
      .gt('artists.score', 40)
      .limit(300),
  ])

  const uzsienioPool = buildPool(shuffleArr((uzsienio || []) as unknown as AlbumRow[]), false)
  const ltPool = buildPool(shuffleArr((lietuviski || []) as unknown as AlbumRow[]), true)
  const pool = [...uzsienioPool, ...ltPool]

  if (pool.length < roundCount * 4) return jsonErr('Per mažai albumų su viršeliais', 503)

  const quizId = `v-${Math.random().toString(36).slice(2, 10)}`
  const exp = Date.now() + TOKEN_TTL_MS

  // Maždaug trečdalis raundų — lietuviški albumai (kiek jų yra).
  const ltCount = Math.min(Math.round(roundCount / 3), ltPool.length)
  const corrects = shuffleArr([
    ...shuffleArr(ltPool).slice(0, ltCount),
    ...shuffleArr(uzsienioPool).slice(0, roundCount - ltCount),
  ])

  const rounds = corrects.map((correct, idx) => {
    // Klaidinantys variantai — iš tos pačios grupės (LT/užsienio) ir kito atlikėjo.
    let decoySrc = pool.filter(a => a.lt === correct.lt && a.artistId !== correct.artistId)
    if (decoySrc.length < 3) decoySrc = pool.filter(a => a.artistId !== correct.artistId)
    const decoys: PoolItem[] = []
    const usedArtists = new Set<number>([correct.artistId])
    for (const d of shuffleArr(decoySrc)) {
      if (usedArtists.has(d.artistId)) continue
      usedArtists.add(d.artistId)
      decoys.push(d)
      if (decoys.length === 3) break
    }
    const options = shuffleArr([
      { id: correct.id, name: correct.label },
      ...decoys.map(d => ({ id: d.id, name: d.label })),
    ])
    return {
      r: idx,
      image: correct.image,
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

  if (!roundRows || roundRows.length < 3) {
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
