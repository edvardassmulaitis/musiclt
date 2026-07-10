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
import { bumpStreakAndXp, ltDayStartUtc } from '@/lib/boombox'
import { resolveViewer } from '@/lib/zaidimai'
import {
  FANTASY_BUDGET,
  ROSTER_SIZE,
  ROSTER_MIN,
  TRANSFERS_PER_WEEK,
  priceFor,
  weekStartOf,
  prevWeekStart,
  weekEnd,
  computeArtistWeekPoints,
} from '@/lib/fantasy'

export const dynamic = 'force-dynamic'

function jsonErr(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

function normJoined(raw: any): any {
  return Array.isArray(raw) ? raw[0] ?? null : raw
}

async function fetchAllTeamWeeks(
  sb: ReturnType<typeof createAdminClient>,
  fromWeek: string | null,
): Promise<{ data: Array<{ team_id: number; points: number }> }> {
  const all: Array<{ team_id: number; points: number }> = []
  for (let offset = 0; ; offset += 1000) {
    let q = sb.from('fantasy_team_weeks').select('team_id, points').range(offset, offset + 999)
    if (fromWeek) q = q.gte('week_start', fromWeek)
    const { data } = await q
    all.push(...((data as any[]) || []))
    if (!data || data.length < 1000) break
  }
  return { data: all }
}

async function getTeam(sb: ReturnType<typeof createAdminClient>, userId: string | null, anonId: string | null) {
  let q = sb.from('fantasy_teams').select('id, name, budget, created_at, user_id, anon_id, captain_artist_id')
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
  const { data } = await sb
    .from('fantasy_roster')
    .select('signed_at, released_at')
    .eq('team_id', teamId)
    .gte('released_at', ltDayStartUtc(weekStartOf()))
  // Greitos korekcijos (paleista per 1 val. nuo pasirašymo — pvz. komandos
  // rinkimo vedlyje) mainų limito nedegina.
  return (data || []).filter(r => {
    const held = Date.parse(r.released_at) - Date.parse(r.signed_at)
    return held > 60 * 60 * 1000
  }).length
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

export async function GET(req: NextRequest) {
  const viewer = await resolveViewer()
  const sb = createAdminClient()
  const team = await getTeam(sb, viewer.userId, viewer.anonId)

  const thisWeek = weekStartOf()
  const lastWeek = prevWeekStart(thisWeek)
  // Deadline: kito pirmadienio 00:00 LT — iki tada fiksuojami savaitės taškai
  const deadline = ltDayStartUtc(weekEnd(thisWeek))

  // ── Varžovo komandos peržiūra (?komanda=ID) — scouting'as ──
  const komandaId = parseInt(new URL(req.url).searchParams.get('komanda') || '') || null
  if (komandaId) {
    const { data: t } = await sb.from('fantasy_teams').select('id, name, is_bot, captain_artist_id, created_at').eq('id', komandaId).maybeSingle()
    if (!t) return NextResponse.json({ error: 'Komanda nerasta' }, { status: 404 })
    const { data: ros } = await sb
      .from('fantasy_roster')
      .select('artist_id, price, artists:artist_id ( id, name, slug, cover_image_url )')
      .eq('team_id', t.id)
      .is('released_at', null)
      .order('price', { ascending: false })
    const ids = (ros || []).map((r: any) => r.artist_id)
    const { data: aw } = ids.length
      ? await sb.from('fantasy_artist_weeks').select('artist_id, total_points').eq('week_start', thisWeek).in('artist_id', ids)
      : { data: [] as any[] }
    const ptsBy = new Map(((aw || []) as any[]).map(r => [r.artist_id, r.total_points]))
    const { data: tw } = await sb.from('fantasy_team_weeks').select('points').eq('team_id', t.id).eq('week_start', thisWeek).maybeSingle()
    return NextResponse.json({
      rival: {
        name: t.name,
        isBot: !!(t as any).is_bot,
        weekPoints: tw?.points ?? null,
        roster: (ros || []).map((r: any) => {
          const a = Array.isArray(r.artists) ? r.artists[0] : r.artists
          const isCaptain = (t as any).captain_artist_id === r.artist_id
          const base = ptsBy.get(r.artist_id) || 0
          return { artistId: r.artist_id, name: a?.name || '—', image: a?.cover_image_url || null, price: r.price, isCaptain, livePoints: isCaptain ? base * 2 : base }
        }),
      },
    })
  }

  // Privačios lygos filtras (?lyga=ID) — lentelės tik tarp tos lygos narių
  const lygaId = parseInt(new URL(req.url).searchParams.get('lyga') || '') || null
  let lygaTeamIds: Set<number> | null = null
  if (lygaId) {
    const { data: mem } = await sb.from('fantasy_league_members').select('team_id').eq('league_id', lygaId)
    lygaTeamIds = new Set(((mem || []) as any[]).map(m => m.team_id))
  }

  // Lygos lentelės — visada rodom (net be komandos, kaip motyvacija).
  // Savaitės lentelė = EINAMOJI savaitė LIVE (dienos snapshot iš cron ?live=1).
  const monthStart = `${thisWeek.slice(0, 7)}-01`
  const [liveWeekRows, monthRows, seasonRows, teamsCountRes] = await Promise.all([
    sb.from('fantasy_team_weeks').select('team_id, points').eq('week_start', thisWeek).order('points', { ascending: false }).limit(500),
    fetchAllTeamWeeks(sb, monthStart),
    fetchAllTeamWeeks(sb, null),
    sb.from('fantasy_teams').select('id', { count: 'exact', head: true }),
  ])

  function aggregate(rows: any[]): Array<{ team_id: number; points: number }> {
    const m = new Map<number, number>()
    for (const r of rows || []) m.set(r.team_id, (m.get(r.team_id) || 0) + r.points)
    return Array.from(m.entries()).map(([team_id, points]) => ({ team_id, points })).sort((a, b) => b.points - a.points)
  }

  const inLyga = (tid: number) => !lygaTeamIds || lygaTeamIds.has(tid)
  let weekBoard = ((liveWeekRows.data || []) as any[]).filter(r => inLyga(r.team_id)).map(r => ({ team_id: r.team_id, points: r.points }))
  const monthBoard = aggregate((monthRows.data || []).filter(r => inLyga(r.team_id))).slice(0, 10)
  const seasonBoard = aggregate((seasonRows.data || []).filter(r => inLyga(r.team_id)))
  const seasonTop = seasonBoard.slice(0, 10)

  // Komandų vardai lentelėms
  const makeBoards = async () => {
    const boardTeamIds = Array.from(new Set([
      ...weekBoard.map(r => r.team_id),
      ...monthBoard.map(r => r.team_id),
      ...seasonTop.map(r => r.team_id),
    ]))
    const teamById = new Map<number, { name: string; is_bot: boolean }>()
    if (boardTeamIds.length) {
      const { data } = await sb.from('fantasy_teams').select('id, name, is_bot').in('id', boardTeamIds)
      for (const t of data || []) teamById.set(t.id, { name: t.name, is_bot: !!(t as any).is_bot })
    }
    const withNames = (rows: Array<{ team_id: number; points: number }>) =>
      rows.map(r => ({
        teamId: r.team_id,
        name: teamById.get(r.team_id)?.name || 'Komanda',
        points: r.points,
        isMe: team?.id === r.team_id,
        isBot: teamById.get(r.team_id)?.is_bot || false,
      }))
    return {
      week: withNames(weekBoard.slice(0, 10)),
      month: withNames(monthBoard),
      season: withNames(seasonTop),
      weekLabel: thisWeek,
      weekIsLive: true,
      totalTeams: (teamsCountRes as any).count || 0,
    }
  }

  // Mano privačios lygos (sąrašui)
  const myLeagues: Array<{ id: number; name: string; code: string; members: number }> = []
  if (team) {
    const { data: mem } = await sb.from('fantasy_league_members').select('league_id').eq('team_id', team.id)
    const lids = ((mem || []) as any[]).map(m => m.league_id)
    if (lids.length) {
      const [{ data: lgs }, { data: allMem }] = await Promise.all([
        sb.from('fantasy_leagues').select('id, name, code').in('id', lids),
        sb.from('fantasy_league_members').select('league_id').in('league_id', lids),
      ])
      const cnt = new Map<number, number>()
      for (const m of (allMem || []) as any[]) cnt.set(m.league_id, (cnt.get(m.league_id) || 0) + 1)
      for (const l of (lgs || []) as any[]) myLeagues.push({ id: l.id, name: l.name, code: l.code, members: cnt.get(l.id) || 0 })
    }
  }

  if (!team) {
    return NextResponse.json({
      team: null,
      budget: FANTASY_BUDGET,
      rosterSize: ROSTER_SIZE,
      rosterMin: ROSTER_MIN,
      deadline,
      boards: await makeBoards(),
      leagues: [],
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
  const monthAgg = aggregate(monthRows.data || [])
  const monthPoints = monthAgg.find(r => r.team_id === team.id)?.points || 0
  const monthRank = monthAgg.findIndex(r => r.team_id === team.id)
  const seasonPoints = seasonBoard.find(r => r.team_id === team.id)?.points || 0
  const seasonRank = seasonBoard.findIndex(r => r.team_id === team.id)
  const captainId: number | null = (team as any).captain_artist_id || null
  // LIVE suma = TIK tie, kurie skaičiuosis pirmadienį (naujokai be pirmos
  // savaitės malonės nesumuojami — kitaip pirmadienį skaičius „nukristų")
  const weekStartUtcNow = ltDayStartUtc(thisWeek)
  const graceWeek = team.created_at >= weekStartUtcNow
  const liveTotal = roster.reduce((s: number, r: any) => {
    if (!graceWeek && r.signed_at >= weekStartUtcNow) return s
    const p = livePoints.get(r.artist_id)?.total_points || 0
    return s + (r.artist_id === captainId ? p * 2 : p)
  }, 0)

  // Savaitės LIVE lentelėje mano skaičius = ką tik suskaičiuotas (snapshot gali vėluoti iki paros)
  {
    const idx = weekBoard.findIndex(r => r.team_id === team.id)
    if (idx >= 0) weekBoard[idx] = { team_id: team.id, points: liveTotal }
    else if (!lygaTeamIds || lygaTeamIds.has(team.id)) weekBoard.push({ team_id: team.id, points: liveTotal })
    weekBoard = weekBoard.sort((a, b) => b.points - a.points)
  }

  // ── ŠIOS SAVAITĖS ĮVYKIAI — realūs faktai iš roster'io atlikėjų ──
  const events: Array<{ artistId: number; name: string; image: string | null; cat: string; text: string; pos?: number; pts?: number }> = []
  for (const r of roster) {
    const d: any = livePoints.get(r.artist_id)?.details
    if (!d) continue
    const nm = r.artist?.name || '—'
    const img = r.artist?.cover_image_url || null
    // +tšk. badge rodomas TIK jei atlikėjas šią savaitę skaičiuojasi
    const countsNow = graceWeek || r.signed_at < weekStartUtcNow
    for (const e of (d.chart_entries || []).slice(0, 4)) {
      const chartName = e.chart ? e.chart : e.top === 'top40' ? 'TOP40' : 'LT TOP30'
      const kap = r.artist_id === captainId
      events.push({ artistId: r.artist_id, name: nm, image: img, cat: 'chart', pos: e.pos, pts: countsNow && e.pts ? (kap ? e.pts * 2 : e.pts) : undefined, text: `${chartName}: #${e.pos}${e.title ? ` — „${e.title}“` : ''}` })
    }
    if ((d.releases || 0) > 0) {
      events.push({ artistId: r.artist_id, name: nm, image: img, cat: 'rel', text: d.releases === 1 ? 'Nauja daina šią savaitę' : `Naujos dainos: ${d.releases}` })
    }
    const ytp = livePoints.get(r.artist_id)?.yt_points || 0
    if (ytp >= 8) {
      events.push({ artistId: r.artist_id, name: nm, image: img, cat: 'yt', text: `YouTube augimas → +${ytp} tšk.` })
    }
  }
  events.sort((a, b) => {
    const ord: Record<string, number> = { chart: 0, rel: 1, yt: 2 }
    if (ord[a.cat] !== ord[b.cat]) return ord[a.cat] - ord[b.cat]
    return (a.pos || 999) - (b.pos || 999)
  })

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
      monthPoints,
      monthRank: monthRank >= 0 ? monthRank + 1 : null,
      liveWeekPoints: liveTotal,
      captainArtistId: captainId,
      weeks: (myWeeks || []).map((w: any) => w.week_start === thisWeek ? { ...w, points: liveTotal, live: true } : w),
    },
    deadline,
    events: events.slice(0, 14),
    leagues: myLeagues,
    rosterMin: ROSTER_MIN,
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
        countsFromNextWeek: !graceWeek && r.signed_at >= weekStartUtcNow,
        lastWeekPoints: official?.total_points ?? null,
        isCaptain: r.artist_id === captainId,
        livePoints: live?.total_points ?? 0,
        liveBreakdown: live ? { chart: live.chart_points, yt: live.yt_points, rel: live.release_points, base: live.base_points } : null,
      }
    }),
    rosterSize: ROSTER_SIZE,
    boards: await makeBoards(),
    isAuthenticated: viewer.isAuthenticated,
  })
}

// ── POST ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return jsonErr('Netinkama užklausa — perkrauk puslapį')
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

    const { data: lastPts } = await sb
      .from('fantasy_artist_weeks')
      .select('total_points')
      .eq('artist_id', artistId)
      .eq('week_start', prevWeekStart(weekStartOf()))
      .maybeSingle()
    const price = priceFor(artist.score, lastPts?.total_points ?? 0)
    const spent = roster.reduce((s: number, r: any) => s + r.price, 0)
    if (spent + price > team.budget) return jsonErr(`Nepakanka biudžeto: kaina ${price}, liko ${team.budget - spent}`)

    const { data: inserted, error } = await sb.from('fantasy_roster').insert({
      team_id: team.id,
      artist_id: artistId,
      price,
    }).select('id').single()
    if (error) {
      if ((error as any).code === '23505') return jsonErr('Šis atlikėjas jau tavo komandoje')
      return jsonErr('Nepavyko pasirašyti: ' + error.message, 500)
    }

    // Lygiagretumo apsauga: po įrašo pertikrinam dydį ir biudžetą — jei du
    // vienalaikiai pasirašymai viršijo ribas, atšaukiam savąjį.
    const { data: after } = await sb
      .from('fantasy_roster')
      .select('id, price')
      .eq('team_id', team.id)
      .is('released_at', null)
      .order('signed_at', { ascending: true })
    const activeAfter = after || []
    const spentAfter = activeAfter.reduce((s: number, r: any) => s + (r.price || 0), 0)
    if (activeAfter.length > ROSTER_SIZE || spentAfter > team.budget) {
      await sb.from('fantasy_roster').delete().eq('id', inserted.id)
      return jsonErr(activeAfter.length > ROSTER_SIZE ? 'Komanda jau pilna' : 'Nepakanka biudžeto')
    }

    return NextResponse.json({ ok: true, signed: { artistId, name: artist.name, price }, budgetLeft: team.budget - spentAfter })
  }

  // ── Paleisti ──
  if (action === 'release') {
    if (!artistId) return jsonErr('Trūksta artistId')
    const transfers = await transfersThisWeek(sb, team.id)
    if (transfers >= TRANSFERS_PER_WEEK) return jsonErr(`Šią savaitę jau ${TRANSFERS_PER_WEEK} mainai — nauji galimi nuo pirmadienio`)

    const { data: row } = await sb
      .from('fantasy_roster')
      .select('id, price')
      .eq('team_id', team.id)
      .eq('artist_id', artistId)
      .is('released_at', null)
      .maybeSingle()
    if (!row) return jsonErr('Šio atlikėjo komandoje nėra', 404)

    await sb.from('fantasy_roster').update({ released_at: new Date().toISOString() }).eq('id', row.id)
    const [spent, transfersAfter] = await Promise.all([
      spentBudget(sb, team.id),
      transfersThisWeek(sb, team.id), // perskaičiuojam (1 val. taisyklė gali nedeginti limito)
    ])
    return NextResponse.json({ ok: true, released: artistId, budgetLeft: team.budget - spent, transfersLeft: Math.max(0, TRANSFERS_PER_WEEK - transfersAfter) })
  }

  // ── Kapitonas (×2 taškai) ──
  if (action === 'captain') {
    if (!artistId) {
      await sb.from('fantasy_teams').update({ captain_artist_id: null }).eq('id', team.id)
      return NextResponse.json({ ok: true, captainArtistId: null })
    }
    const { data: row } = await sb
      .from('fantasy_roster')
      .select('id')
      .eq('team_id', team.id)
      .eq('artist_id', artistId)
      .is('released_at', null)
      .maybeSingle()
    if (!row) return jsonErr('Kapitonu gali skirti tik savo komandos atlikėją')
    await sb.from('fantasy_teams').update({ captain_artist_id: artistId }).eq('id', team.id)
    return NextResponse.json({ ok: true, captainArtistId: artistId })
  }

  // ── Privačios lygos ──
  if (action === 'league_create') {
    const name = String(body.name || '').trim()
    if (name.length < 2 || name.length > 40) return jsonErr('Lygos pavadinimas 2–40 simbolių')
    const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = Array.from({ length: 6 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join('')
      const { data: lg, error } = await sb
        .from('fantasy_leagues')
        .insert({ code, name, owner_team_id: team.id })
        .select('id, name, code')
        .single()
      if (error) {
        if ((error as any).code === '23505') continue // kodo kolizija — bandome kitą
        return jsonErr('Nepavyko sukurti lygos: ' + error.message, 500)
      }
      await sb.from('fantasy_league_members').insert({ league_id: lg.id, team_id: team.id })
      return NextResponse.json({ ok: true, league: lg })
    }
    return jsonErr('Nepavyko sugeneruoti lygos kodo — pabandyk dar kartą', 500)
  }

  if (action === 'league_join') {
    const code = String(body.code || '').trim().toUpperCase()
    if (code.length !== 6) return jsonErr('Lygos kodas — 6 simboliai')
    const { data: lg } = await sb.from('fantasy_leagues').select('id, name, code').eq('code', code).maybeSingle()
    if (!lg) return jsonErr('Lyga su tokiu kodu nerasta')
    const { count } = await sb.from('fantasy_league_members').select('team_id', { count: 'exact', head: true }).eq('league_id', lg.id)
    if ((count || 0) >= 200) return jsonErr('Ši lyga jau pilna')
    const { error } = await sb.from('fantasy_league_members').insert({ league_id: lg.id, team_id: team.id })
    if (error && (error as any).code !== '23505') return jsonErr('Nepavyko prisijungti: ' + error.message, 500)
    return NextResponse.json({ ok: true, league: lg })
  }

  if (action === 'league_leave') {
    const leagueId = parseInt(body.leagueId)
    if (!leagueId) return jsonErr('Trūksta leagueId')
    await sb.from('fantasy_league_members').delete().eq('league_id', leagueId).eq('team_id', team.id)
    return NextResponse.json({ ok: true })
  }

  return jsonErr('Netinkama užklausa — perkrauk puslapį')
}
