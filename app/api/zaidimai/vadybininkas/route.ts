// app/api/zaidimai/vadybininkas/route.ts
//
// Muzikos vadybininkas v2 — TĘSTINĖ FANTASY LYGA (ne quick-sim).
//
//   GET  → mano komanda (roster su realiais atlikėjų taškais: praėjusi
//          savaitė oficiali + einamoji LIVE), biudžetas, transferai,
//          lygos lentelės (savaitė / mėnuo / sezonas) + mano vieta.
//   POST { action: 'create', name }          → sukurti komandą (+40 XP)
//        { action: 'sign', artistId }        → pasirašyti atlikėją
//        { action: 'release', artistId }     → paleisti atlikėją (grąžina kainą)
//
// Taisyklės: 5 atlikėjai, biudžetas 220, iki 3 paleidimų per savaitę.
// Taškus komanda gauna kas pirmadienį iš realių rezultatų (cron).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { bumpStreakAndXp } from '@/lib/boombox'
import { resolveViewer } from '@/lib/zaidimai'
import {
  FANTASY_BUDGET,
  ROSTER_SIZE,
  TRANSFERS_PER_WEEK,
  priceOf,
  weekStartOf,
  prevWeekStart,
  computeArtistWeekPoints,
} from '@/lib/fantasy'

export const dynamic = 'force-dynamic'

function jsonErr(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

function normJoined(raw: any): any {
  return Array.isArray(raw) ? raw[0] ?? null : raw
}

async function getTeam(sb: ReturnType<typeof createAdminClient>, userId: string | null, anonId: string | null) {
  let q = sb.from('fantasy_teams').select('id, name, budget, created_at, user_id, anon_id')
  if (userId) q = q.eq('user_id', userId)
  else if (anonId) q = q.eq('anon_id', anonId)
  else return null
  const { data } = await q.maybeSingle()
  return data || null
}

async function getActiveRoster(sb: ReturnType<typeof createAdminClient>, teamId: number) {
  const { data } = await sb
    .from('fantasy_roster')
    .select('id, artist_id, price, signed_at, artists:artist_id ( id, name, slug, cover_image_url, score, score_trending )')
    .eq('team_id', teamId)
    .is('released_at', null)
    .order('price', { ascending: false })
  return (data || []).map((r: any) => ({ ...r, artist: normJoined(r.artists) }))
}

async function transfersThisWeek(sb: ReturnType<typeof createAdminClient>, teamId: number): Promise<number> {
  const week = weekStartOf()
  const { count } = await sb
    .from('fantasy_roster')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', teamId)
    .gte('released_at', `${week}T00:00:00`)
  return count || 0
}

async function spentBudget(sb: ReturnType<typeof createAdminClient>, teamId: number): Promise<number> {
  const { data } = await sb
    .from('fantasy_roster')
    .select('price')
    .eq('team_id', teamId)
    .is('released_at', null)
  return (data || []).reduce((s, r: any) => s + (r.price || 0), 0)
}

// ── GET ───────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  const viewer = await resolveViewer()
  const sb = createAdminClient()
  const team = await getTeam(sb, viewer.userId, viewer.anonId)

  const thisWeek = weekStartOf()
  const lastWeek = prevWeekStart(thisWeek)

  // Lygos lentelės — visada rodom (net be komandos, kaip motyvacija)
  const monthStart = `${thisWeek.slice(0, 7)}-01`
  const [lastWeekRows, monthRows, seasonRows, teamsCountRes] = await Promise.all([
    sb.from('fantasy_team_weeks').select('team_id, points').eq('week_start', lastWeek).order('points', { ascending: false }).limit(10),
    sb.from('fantasy_team_weeks').select('team_id, points').gte('week_start', monthStart).limit(2000),
    sb.from('fantasy_team_weeks').select('team_id, points').limit(5000),
    sb.from('fantasy_teams').select('id', { count: 'exact', head: true }),
  ])

  function aggregate(rows: any[]): Array<{ team_id: number; points: number }> {
    const m = new Map<number, number>()
    for (const r of rows || []) m.set(r.team_id, (m.get(r.team_id) || 0) + r.points)
    return Array.from(m.entries()).map(([team_id, points]) => ({ team_id, points })).sort((a, b) => b.points - a.points)
  }

  const weekBoard = ((lastWeekRows.data || []) as any[]).map(r => ({ team_id: r.team_id, points: r.points }))
  const monthBoard = aggregate(monthRows.data || []).slice(0, 10)
  const seasonBoard = aggregate(seasonRows.data || [])
  const seasonTop = seasonBoard.slice(0, 10)

  // Komandų vardai lentelėms
  const boardTeamIds = Array.from(new Set([
    ...weekBoard.map(r => r.team_id),
    ...monthBoard.map(r => r.team_id),
    ...seasonTop.map(r => r.team_id),
  ]))
  const teamNameById = new Map<number, string>()
  if (boardTeamIds.length) {
    const { data } = await sb.from('fantasy_teams').select('id, name').in('id', boardTeamIds)
    for (const t of data || []) teamNameById.set(t.id, t.name)
  }
  const withNames = (rows: Array<{ team_id: number; points: number }>) =>
    rows.map(r => ({ name: teamNameById.get(r.team_id) || 'Komanda', points: r.points, isMe: team?.id === r.team_id }))

  const boards = {
    week: withNames(weekBoard),
    month: withNames(monthBoard),
    season: withNames(seasonTop),
    weekLabel: lastWeek,
    totalTeams: (teamsCountRes as any).count || 0,
  }

  if (!team) {
    return NextResponse.json({
      team: null,
      budget: FANTASY_BUDGET,
      rosterSize: ROSTER_SIZE,
      boards,
      isAuthenticated: viewer.isAuthenticated,
    })
  }

  const roster = await getActiveRoster(sb, team.id)
  const spent = roster.reduce((s: number, r: any) => s + r.price, 0)
  const transfers = await transfersThisWeek(sb, team.id)

  // Atlikėjų taškai: praėjusi savaitė (oficiali) + einamoji LIVE
  const artistIds = roster.map((r: any) => r.artist_id)
  const [officialRes, livePoints] = await Promise.all([
    artistIds.length
      ? sb.from('fantasy_artist_weeks').select('artist_id, total_points, chart_points, yt_points, release_points').eq('week_start', lastWeek).in('artist_id', artistIds)
      : Promise.resolve({ data: [] }),
    computeArtistWeekPoints(artistIds, thisWeek, { live: true }),
  ])
  const officialByArtist = new Map(((officialRes as any).data || []).map((r: any) => [r.artist_id, r]))

  // Mano savaitės istorija + sezono suma
  const { data: myWeeks } = await sb
    .from('fantasy_team_weeks')
    .select('week_start, points')
    .eq('team_id', team.id)
    .order('week_start', { ascending: false })
    .limit(12)
  const seasonPoints = seasonBoard.find(r => r.team_id === team.id)?.points || 0
  const seasonRank = seasonBoard.findIndex(r => r.team_id === team.id)
  const liveTotal = artistIds.reduce((s, id) => s + (livePoints.get(id)?.total_points || 0), 0)

  return NextResponse.json({
    team: {
      id: team.id,
      name: team.name,
      createdAt: team.created_at,
      budget: team.budget,
      spent,
      budgetLeft: team.budget - spent,
      transfersLeft: Math.max(0, TRANSFERS_PER_WEEK - transfers),
      seasonPoints,
      seasonRank: seasonRank >= 0 ? seasonRank + 1 : null,
      liveWeekPoints: liveTotal,
      weeks: myWeeks || [],
    },
    roster: roster.map((r: any) => {
      const live = livePoints.get(r.artist_id)
      const official: any = officialByArtist.get(r.artist_id)
      return {
        artistId: r.artist_id,
        name: r.artist?.name || '—',
        slug: r.artist?.slug,
        image: r.artist?.cover_image_url || null,
        price: r.price,
        signedAt: r.signed_at,
        lastWeekPoints: official?.total_points ?? null,
        livePoints: live?.total_points ?? 0,
        liveBreakdown: live ? { chart: live.chart_points, yt: live.yt_points, rel: live.release_points, base: live.base_points } : null,
      }
    }),
    rosterSize: ROSTER_SIZE,
    boards,
    isAuthenticated: viewer.isAuthenticated,
  })
}

// ── POST ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return jsonErr('Bad JSON')
  const { action } = body as { action: string }

  const viewer = await resolveViewer()
  const sb = createAdminClient()
  const team = await getTeam(sb, viewer.userId, viewer.anonId)

  // ── Sukurti komandą ──
  if (action === 'create') {
    if (team) return jsonErr('Komandą jau turi')
    const name = String(body.name || '').trim()
    if (name.length < 2 || name.length > 30) return jsonErr('Pavadinimas 2–30 simbolių')

    const { data: created, error } = await sb
      .from('fantasy_teams')
      .insert({
        user_id: viewer.userId,
        anon_id: viewer.userId ? null : viewer.anonId,
        name,
        budget: FANTASY_BUDGET,
      })
      .select('id, name, budget')
      .single()
    if (error) {
      if ((error as any).code === '23505') return jsonErr('Komandą jau turi')
      return jsonErr('Nepavyko sukurti: ' + error.message, 500)
    }

    // Vienkartinis XP už įsijungimą į lygą
    const { current, total_xp } = await bumpStreakAndXp({ userId: viewer.userId, anonId: viewer.anonId, xp: viewer.userId ? 60 : 40 })
    return NextResponse.json({ ok: true, team: created, xp: viewer.userId ? 60 : 40, streak: current, totalXp: total_xp })
  }

  if (!team) return jsonErr('Pirma sukurk komandą', 404)
  const artistId = parseInt(body.artistId)

  // ── Pasirašyti ──
  if (action === 'sign') {
    if (!artistId) return jsonErr('Trūksta artistId')
    const roster = await getActiveRoster(sb, team.id)
    if (roster.length >= ROSTER_SIZE) return jsonErr(`Komandoje jau ${ROSTER_SIZE} atlikėjai — pirma paleisk vieną`)
    if (roster.some((r: any) => r.artist_id === artistId)) return jsonErr('Šis atlikėjas jau tavo komandoje')

    const { data: artist } = await sb
      .from('artists')
      .select('id, name, score, country')
      .eq('id', artistId)
      .maybeSingle()
    if (!artist) return jsonErr('Atlikėjas nerastas', 404)
    if (artist.country !== 'Lietuva') return jsonErr('Lygoje — tik Lietuvos atlikėjai')

    const price = priceOf(artist.score)
    const spent = roster.reduce((s: number, r: any) => s + r.price, 0)
    if (spent + price > team.budget) return jsonErr(`Nepakanka biudžeto: kaina ${price}, liko ${team.budget - spent}`)

    const { error } = await sb.from('fantasy_roster').insert({
      team_id: team.id,
      artist_id: artistId,
      price,
    })
    if (error) {
      if ((error as any).code === '23505') return jsonErr('Šis atlikėjas jau tavo komandoje')
      return jsonErr('Nepavyko pasirašyti: ' + error.message, 500)
    }
    return NextResponse.json({ ok: true, signed: { artistId, name: artist.name, price }, budgetLeft: team.budget - spent - price })
  }

  // ── Paleisti ──
  if (action === 'release') {
    if (!artistId) return jsonErr('Trūksta artistId')
    const transfers = await transfersThisWeek(sb, team.id)
    if (transfers >= TRANSFERS_PER_WEEK) return jsonErr(`Šią savaitę jau ${TRANSFERS_PER_WEEK} transferai — nauji nuo pirmadienio`)

    const { data: row } = await sb
      .from('fantasy_roster')
      .select('id, price')
      .eq('team_id', team.id)
      .eq('artist_id', artistId)
      .is('released_at', null)
      .maybeSingle()
    if (!row) return jsonErr('Šio atlikėjo komandoje nėra', 404)

    await sb.from('fantasy_roster').update({ released_at: new Date().toISOString() }).eq('id', row.id)
    const spent = await spentBudget(sb, team.id)
    return NextResponse.json({ ok: true, released: artistId, budgetLeft: team.budget - spent, transfersLeft: Math.max(0, TRANSFERS_PER_WEEK - transfers - 1) })
  }

  return jsonErr('Bad action')
}
