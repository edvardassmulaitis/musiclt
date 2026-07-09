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
import { bumpStreakAndXp, todayLT } from '@/lib/boombox'
import {
  resolveViewer,
  shuffleArr,
  sealPayload,
  countRunsToday,
} from '@/lib/zaidimai'

export const dynamic = 'force-dynamic'

const XP_RUNS_PER_DAY = 3
const TOKEN_TTL_MS = 45 * 60 * 1000

// Vieno raundo turinys (be žetono) — tinka ir dienos „snapshot" saugojimui.
type RoundContent = {
  r: number
  image: string
  kind: 'album' | 'artist'
  prompt: string
  reveal: 'puzzle' | 'blur'
  correctId: number
  options: { id: number; name: string }[]
}

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
type ArtistRow = {
  id: number
  name: string
  country: string | null
  cover_image_url: string | null
  score: number | null
}

// kind: 'album' → viršelis; 'artist' → atlikėjo nuotrauka. Klaidinantys
// variantai visada iš tos pačios rūšies, tad etiketės nesimaišo.
type Kind = 'album' | 'artist'
type PoolItem = {
  id: number
  kind: Kind
  label: string
  image: string
  artistId: number
  lt: boolean
}

/** Albumų eilutės → pool'as (max 2 albumai vienam atlikėjui). */
function albumPool(rows: AlbumRow[], lt: boolean): PoolItem[] {
  const perArtist = new Map<number, number>()
  const out: PoolItem[] = []
  for (const r of rows) {
    if (!r.artists || !r.cover_image_url || !r.title) continue
    const n = perArtist.get(r.artists.id) || 0
    if (n >= 2) continue
    perArtist.set(r.artists.id, n + 1)
    out.push({ id: r.id, kind: 'album', label: `${r.artists.name} — ${r.title}`, image: r.cover_image_url, artistId: r.artists.id, lt })
  }
  return out
}

/** Atlikėjų eilutės → pool'as (nuotrauka). */
function artistPhotoPool(rows: ArtistRow[], lt: boolean): PoolItem[] {
  const out: PoolItem[] = []
  for (const r of rows) {
    if (!r.cover_image_url || !r.name) continue
    out.push({ id: r.id, kind: 'artist', label: r.name, image: r.cover_image_url, artistId: r.id, lt })
  }
  return out
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const dienos = url.searchParams.get('dienos') === '1'
  const roundCount = dienos ? 3 : Math.min(Math.max(parseInt(url.searchParams.get('raundai') || '8') || 8, 3), 12)

  const viewer = await resolveViewer()
  const sb = createAdminClient()

  const albumSelect = 'id, title, cover_image_url, score, artists:artist_id!inner(id, name, country, score)'
  const artistSelect = 'id, name, country, cover_image_url, score'

  // Populiariausi: užsienio ir LT — ir albumų viršeliai, ir atlikėjų nuotraukos.
  const [{ data: uzAlb }, { data: ltAlb }, { data: uzArt }, { data: ltArt }] = await Promise.all([
    sb.from('albums').select(albumSelect).not('cover_image_url', 'is', null)
      .gte('score', 45).neq('artists.country', 'Lietuva')
      .order('score', { ascending: false }).limit(400),
    sb.from('albums').select(albumSelect).not('cover_image_url', 'is', null)
      .eq('artists.country', 'Lietuva').gt('artists.score', 45).limit(300),
    sb.from('artists').select(artistSelect).not('cover_image_url', 'is', null)
      .gt('score', 60).neq('country', 'Lietuva')
      .order('score', { ascending: false }).limit(400),
    sb.from('artists').select(artistSelect).not('cover_image_url', 'is', null)
      .eq('country', 'Lietuva').gt('score', 35)
      .order('score', { ascending: false }).limit(200),
  ])

  const albumsAll = [
    ...albumPool(shuffleArr((uzAlb || []) as unknown as AlbumRow[]), false),
    ...albumPool(shuffleArr((ltAlb || []) as unknown as AlbumRow[]), true),
  ]
  const artistsAll = [
    ...artistPhotoPool(shuffleArr((uzArt || []) as unknown as ArtistRow[]), false),
    ...artistPhotoPool(shuffleArr((ltArt || []) as unknown as ArtistRow[]), true),
  ]
  const pool = [...albumsAll, ...artistsAll]

  if (pool.length < roundCount * 4 || albumsAll.length < 3 || artistsAll.length < 3) {
    return jsonErr('Per mažai vaizdų', 503)
  }

  // ── Raundų turinio generavimas (be žetonų) ──
  function buildContent(): RoundContent[] {
    const albWant = Math.round(roundCount / 2)
    const picked = [
      ...shuffleArr(albumsAll).slice(0, albWant),
      ...shuffleArr(artistsAll).slice(0, roundCount - albWant),
    ]
    if (picked.length < roundCount) {
      const have = new Set(picked.map(p => `${p.kind}:${p.id}`))
      for (const p of shuffleArr(pool)) {
        if (picked.length >= roundCount) break
        if (!have.has(`${p.kind}:${p.id}`)) { picked.push(p); have.add(`${p.kind}:${p.id}`) }
      }
    }
    const corrects = shuffleArr(picked).slice(0, roundCount)
    return corrects.map((correct, idx) => {
      let decoySrc = pool.filter(a => a.kind === correct.kind && a.lt === correct.lt && a.artistId !== correct.artistId)
      if (decoySrc.length < 3) decoySrc = pool.filter(a => a.kind === correct.kind && a.artistId !== correct.artistId)
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
        kind: correct.kind,
        prompt: correct.kind === 'album' ? 'Koks šis albumas?' : 'Kas šis atlikėjas?',
        reveal: (idx % 2 === 0 ? 'puzzle' : 'blur') as 'puzzle' | 'blur',
        correctId: correct.id,
        options,
      }
    })
  }

  // Dienos režimas — turinys iš „snapshot", tas pats visiems
  let content: RoundContent[]
  let quizId: string
  if (dienos) {
    const today = todayLT()
    quizId = `v-d${today}`
    const { data: snap } = await sb.from('daily_game_snapshot')
      .select('rounds').eq('day', today).eq('game', 'vaizdas').maybeSingle()
    if (snap?.rounds) {
      content = (snap.rounds as RoundContent[]).slice(0, roundCount)
    } else {
      content = buildContent()
      await sb.from('daily_game_snapshot').upsert(
        { day: today, game: 'vaizdas', rounds: content }, { onConflict: 'day,game', ignoreDuplicates: true })
      const { data: authoritative } = await sb.from('daily_game_snapshot')
        .select('rounds').eq('day', today).eq('game', 'vaizdas').maybeSingle()
      content = ((authoritative?.rounds as RoundContent[]) || content).slice(0, roundCount)
    }
  } else {
    quizId = `v-${Math.random().toString(36).slice(2, 10)}`
    content = buildContent()
  }

  const exp = Date.now() + TOKEN_TTL_MS
  const rounds = content.map(c => ({
    r: c.r,
    image: c.image,
    kind: c.kind,
    prompt: c.prompt,
    reveal: c.reveal,
    options: c.options,
    token: sealPayload({ g: 'vaizdas', q: quizId, r: c.r, c: c.correctId, exp }),
  }))

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
