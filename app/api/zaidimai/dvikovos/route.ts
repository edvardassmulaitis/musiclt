// app/api/zaidimai/dvikovos/route.ts
//
// Dainų dvikovos serijomis — balsavimas per VISĄ boombox_duel_drops archyvą
// (boombox'o „išskaidymas": dienos misija lieka /boombox, o čia gali balsuoti
// kiek nori iš eilės, matai bendruomenės procentus po kiekvieno balso).
//
//   GET  → iki 10 dar nebalsuotų ready dvikovų su track'ų info
//   POST { dropId, choice: 'A'|'B' } → balsas į boombox_completions
//        (unikalumas per DB unique index; dedup su boombox dienos dvikova)
//
// Taškai: pirmi 10 balsų per dieną po 15 XP (nariams ×1.5), toliau — 0
// (balsuoti galima, procentus matai, tik be taškų — anti-farm).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { bumpStreakAndXp, ltDayStartUtc } from '@/lib/boombox'
import { resolveViewer, shuffleArr, ytIdFromUrl } from '@/lib/zaidimai'

export const dynamic = 'force-dynamic'

const XP_PER_VOTE = 15
const XP_VOTES_PER_DAY = 10

function jsonErr(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

function normJoined(raw: any): any {
  if (!raw) return null
  return Array.isArray(raw) ? raw[0] ?? null : raw
}

async function countVotesToday(userId: string | null, anonId: string | null): Promise<number> {
  const sb = createAdminClient()
  let q = sb
    .from('boombox_completions')
    .select('id', { count: 'exact', head: true })
    .eq('mission_type', 'duel')
    .gte('completed_at', ltDayStartUtc())
  if (userId) q = q.eq('user_id', userId)
  else if (anonId) q = q.eq('anon_id', anonId)
  else return 0
  const { count } = await q
  return count || 0
}

// ── GET: nebalsuotų dvikovų porcija ───────────────────────────────────────

export async function GET(_req: NextRequest) {
  const viewer = await resolveViewer()
  const sb = createAdminClient()

  // Viewer'io jau balsuoti duel drop id
  let votedIds = new Set<number>()
  {
    let q = sb
      .from('boombox_completions')
      .select('drop_id')
      .eq('drop_table', 'boombox_duel_drops')
    if (viewer.userId) q = q.eq('user_id', viewer.userId)
    else q = q.eq('anon_id', viewer.anonId!)
    const { data } = await q
    votedIds = new Set((data || []).map(r => r.drop_id))
  }

  const { data: drops } = await sb
    .from('boombox_duel_drops')
    .select('id, matchup_type, track_a_id, track_b_id')
    .eq('status', 'ready')
    .order('sort_order', { ascending: true })
    .limit(200)

  const fresh = shuffleArr((drops || []).filter(d => !votedIds.has(d.id))).slice(0, 10)
  if (fresh.length === 0) {
    return NextResponse.json({ duels: [], votesXpLeft: 0, done: true })
  }

  // Track'ų info vienu select'u
  const trackIds = new Set<number>()
  for (const d of fresh) { trackIds.add(d.track_a_id); trackIds.add(d.track_b_id) }
  const { data: tracks } = await sb
    .from('tracks')
    .select('id, slug, title, cover_url, video_url, release_year, artists:artist_id ( id, slug, name )')
    .in('id', Array.from(trackIds))

  const byId = new Map<number, any>()
  for (const t of tracks || []) {
    const norm = { ...(t as any), artists: normJoined((t as any).artists) }
    byId.set(norm.id, norm)
  }

  const toSide = (t: any) => t && {
    id: t.id,
    title: t.title,
    artist: t.artists?.name || '—',
    cover_url: t.cover_url || null,
    ytId: ytIdFromUrl(t.video_url),
    year: t.release_year || null,
  }

  const duels = fresh
    .map(d => {
      const a = toSide(byId.get(d.track_a_id))
      const b = toSide(byId.get(d.track_b_id))
      if (!a || !b) return null
      return { id: d.id, matchup_type: d.matchup_type, a, b }
    })
    .filter(Boolean)

  const votesToday = await countVotesToday(viewer.userId, viewer.anonId)

  return NextResponse.json({
    duels,
    votesXpLeft: Math.max(0, XP_VOTES_PER_DAY - votesToday),
    xpPerVote: XP_PER_VOTE,
    done: false,
  })
}

// ── POST: balsas ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return jsonErr('Netinkama užklausa — perkrauk puslapį')
  const { dropId, choice } = body as { dropId: number; choice: 'A' | 'B' }
  if (typeof dropId !== 'number') return jsonErr('Netinkama užklausa — perkrauk puslapį')
  if (choice !== 'A' && choice !== 'B') return jsonErr('Netinkama užklausa — perkrauk puslapį')

  const sb = createAdminClient()
  const { data: drop } = await sb
    .from('boombox_duel_drops')
    .select('id, status')
    .eq('id', dropId)
    .maybeSingle()
  if (!drop || drop.status !== 'ready') return jsonErr('Dvikova nerasta', 404)

  const viewer = await resolveViewer()
  const votesBefore = await countVotesToday(viewer.userId, viewer.anonId)

  let xp = 0
  if (votesBefore < XP_VOTES_PER_DAY) {
    xp = XP_PER_VOTE
    if (viewer.userId) xp = Math.round(xp * 1.5)
  }

  const { error: insertErr } = await sb.from('boombox_completions').insert({
    user_id: viewer.userId,
    anon_id: viewer.userId ? null : viewer.anonId,
    mission_type: 'duel',
    drop_id: dropId,
    drop_table: 'boombox_duel_drops',
    payload: { choice, source: 'zaidimai' },
    is_correct: null,
    xp_earned: xp,
  })

  let duplicate = false
  if (insertErr) {
    if (insertErr.code === '23505') { duplicate = true; xp = 0 }
    else return jsonErr('Nepavyko įrašyti: ' + insertErr.message, 500)
  }

  let streakInfo = { current: 0, total_xp: 0 }
  if (xp > 0) {
    streakInfo = await bumpStreakAndXp({ userId: viewer.userId, anonId: viewer.anonId, xp })
  }

  // Bendruomenės pasiskirstymas — skaičiuojam count'ais (be 1000 eilučių ribos)
  const baseCount = () => sb
    .from('boombox_completions')
    .select('id', { count: 'exact', head: true })
    .eq('drop_table', 'boombox_duel_drops')
    .eq('drop_id', dropId)
  const [aRes, bRes] = await Promise.all([
    baseCount().eq('payload->>choice', 'A'),
    baseCount().eq('payload->>choice', 'B'),
  ])
  const aCount = aRes.count || 0
  const bCount = bRes.count || 0
  const total = aCount + bCount

  return NextResponse.json({
    ok: true,
    duplicate,
    xp,
    totalXp: streakInfo.total_xp,
    votesXpLeft: Math.max(0, XP_VOTES_PER_DAY - votesBefore - 1),
    stats: {
      total,
      aPct: total ? Math.round((aCount / total) * 100) : 0,
      bPct: total ? Math.round((bCount / total) * 100) : 0,
    },
  })
}
