// app/api/zaidimai/metai/route.ts
//
// „Kurie metai?" — rodomas populiaraus albumo viršelis su pavadinimu,
// reikia atspėti išleidimo metus (4 variantai). answer_id = metai.
//
//   GET  ?raundai=8 → raundai su užšifruotais vokais
//   POST { quizId } → rezultatas iš game_rounds DB, replay apsauga unique.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { bumpStreakAndXp, todayLT } from '@/lib/boombox'
import {
  resolveViewer,
  shuffleArr,
  sealPayload,
  countRunsToday,
  styleOfDay,
  fetchArtistGenreGroups,
} from '@/lib/zaidimai'

export const dynamic = 'force-dynamic'

const XP_RUNS_PER_DAY = 3
const TOKEN_TTL_MS = 45 * 60 * 1000

type RoundContent = {
  r: number
  image: string
  label: string
  correctYear: number
  options: { id: number; name: string }[]
}

function jsonErr(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

// ── GET ───────────────────────────────────────────────────────────────────

type AlbumRow = {
  id: number
  title: string
  year: number | null
  cover_image_url: string
  score: number | null
  artists: { id: number; name: string; country: string | null; score: number | null } | null
}

/** 3 klaidinantys metai aplink teisingus — unikalūs, ne ateity. */
function yearDecoys(correct: number, rng: () => number = Math.random): number[] {
  const maxYear = new Date().getFullYear()
  const out = new Set<number>()
  let guard = 0
  while (out.size < 3 && guard++ < 60) {
    const off = Math.floor(rng() * 8) + 1        // 1..8 metų
    const sign = rng() < 0.5 ? -1 : 1
    const y = correct + sign * off
    if (y === correct || y > maxYear || y < 1950) continue
    out.add(y)
  }
  // atsarginis kelias, jei atsitiktinumas nesuveikė
  let fill = correct - 1
  while (out.size < 3) {
    if (fill !== correct && fill >= 1950) out.add(fill)
    fill--
  }
  return Array.from(out)
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const dienos = url.searchParams.get('dienos') === '1'
  const roundCount = dienos ? 3 : Math.min(Math.max(parseInt(url.searchParams.get('raundai') || '8') || 8, 3), 12)

  const viewer = await resolveViewer()
  const sb = createAdminClient()

  const albumSelect = 'id, title, year, cover_image_url, score, artists:artist_id!inner(id, name, country, score)'

  const [{ data: uzsienio }, { data: lietuviski }] = await Promise.all([
    sb
      .from('albums')
      .select(albumSelect)
      .not('cover_image_url', 'is', null)
      .not('year', 'is', null)
      .gte('score', 45)
      .neq('artists.country', 'Lietuva')
      .order('score', { ascending: false })
      .limit(300),
    sb
      .from('albums')
      .select(albumSelect)
      .not('cover_image_url', 'is', null)
      .not('year', 'is', null)
      .eq('artists.country', 'Lietuva')
      .gt('artists.score', 48)
      .limit(200),
  ])

  const dedupe = (rows: AlbumRow[]) => {
    const perArtist = new Map<number, number>()
    const out: AlbumRow[] = []
    for (const r of rows) {
      if (!r.artists || !r.year || r.year < 1950) continue
      const n = perArtist.get(r.artists.id) || 0
      if (n >= 2) continue
      perArtist.set(r.artists.id, n + 1)
      out.push(r)
    }
    return out
  }
  const uzsienioPool = dedupe(shuffleArr((uzsienio || []) as unknown as AlbumRow[]))
  const ltPool = dedupe(shuffleArr((lietuviski || []) as unknown as AlbumRow[]))

  if (uzsienioPool.length + ltPool.length < roundCount) {
    return jsonErr('Per mažai albumų su metais', 503)
  }

  // Stiliaus rotacija — dienos režime kasdien kitas „dienos stilius"
  const preferStyle = dienos ? styleOfDay(todayLT()) : null
  const genreMap = preferStyle
    ? await fetchArtistGenreGroups([...uzsienioPool, ...ltPool].map(a => a.artists!.id))
    : new Map<number, number>()
  const inStyle = (a: AlbumRow) => preferStyle != null && genreMap.get(a.artists!.id) === preferStyle
  // dienos stiliaus albumus dedam į priekį (bet paliekam ir kitus atsargai)
  const bias = (arr: AlbumRow[]) => preferStyle ? [...arr.filter(inStyle), ...arr.filter(a => !inStyle(a))] : arr

  function buildContent(): RoundContent[] {
    const lt = bias(ltPool), uz = bias(uzsienioPool)
    const ltCount = Math.min(Math.round(roundCount / 3), lt.length)
    const corrects = shuffleArr([
      ...lt.slice(0, ltCount),
      ...uz.slice(0, roundCount - ltCount),
    ]).slice(0, roundCount)
    return corrects.map((al, idx) => {
      const years = shuffleArr([al.year!, ...yearDecoys(al.year!)])
      return {
        r: idx,
        image: al.cover_image_url,
        label: `${al.artists!.name} — ${al.title}`,
        correctYear: al.year!,
        options: years.map(y => ({ id: y, name: String(y) })),
      }
    })
  }

  let content: RoundContent[]
  let quizId: string
  if (dienos) {
    const today = todayLT()
    quizId = `m-d${today}`
    const { data: snap } = await sb.from('daily_game_snapshot')
      .select('rounds').eq('day', today).eq('game', 'metai').maybeSingle()
    if (snap?.rounds) {
      content = (snap.rounds as RoundContent[]).slice(0, roundCount)
    } else {
      content = buildContent()
      await sb.from('daily_game_snapshot').upsert(
        { day: today, game: 'metai', rounds: content }, { onConflict: 'day,game', ignoreDuplicates: true })
      const { data: authoritative } = await sb.from('daily_game_snapshot')
        .select('rounds').eq('day', today).eq('game', 'metai').maybeSingle()
      content = ((authoritative?.rounds as RoundContent[]) || content).slice(0, roundCount)
    }
  } else {
    quizId = `m-${Math.random().toString(36).slice(2, 10)}`
    content = buildContent()
  }

  const exp = Date.now() + TOKEN_TTL_MS
  const rounds = content.map(c => ({
    r: c.r,
    image: c.image,
    label: c.label,
    options: c.options,
    token: sealPayload({ g: 'metai', q: quizId, r: c.r, c: c.correctYear, exp }),
  }))

  const runsToday = await countRunsToday(viewer, 'metai')

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
  if (typeof quizId !== 'string' || !quizId.startsWith('m-') || quizId.length > 40) {
    return jsonErr('Netinkama užklausa — perkrauk puslapį')
  }

  const viewer = await resolveViewer()
  const sb = createAdminClient()

  let rq = sb
    .from('game_rounds')
    .select('r, answer_id, ms, correct, points')
    .eq('game', 'metai')
    .eq('quiz_id', quizId)
    .order('r', { ascending: true })
  rq = viewer.userId ? rq.eq('user_id', viewer.userId) : rq.eq('anon_id', viewer.anonId!)
  const { data: roundRows } = await rq

  if (!roundRows || roundRows.length < 3) {
    return jsonErr('Per mažai atsakytų raundų — sužaisk iki galo', 400)
  }

  const score = roundRows.reduce((s, r) => s + (r.points || 0), 0)
  const correctCount = roundRows.filter(r => r.correct).length

  const runsToday = await countRunsToday(viewer, 'metai')
  const xpEligible = runsToday < XP_RUNS_PER_DAY

  let xp = 0
  if (xpEligible && score > 0) {
    xp = Math.round(score / 10)
    if (viewer.userId) xp = Math.round(xp * 1.5)
  }

  const { error: insertErr } = await sb.from('game_scores').insert({
    user_id: viewer.userId,
    anon_id: viewer.userId ? null : viewer.anonId,
    game: 'metai',
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
