// lib/fantasy.ts
//
// Muzikos vadybininko FANTASY LYGOS variklis.
//
// Principas (kaip krepšinio rinkos žaidimuose): pasirašai 5 REALIUS LT
// atlikėjus į komandą, o taškus jie neša pagal REALIUS savaitės rezultatus:
//   * chart_points   — finalizuoto top40 / lt_top30 pozicijos tą savaitę
//   * yt_points      — YouTube augimas: views delta iš track_video_views_history
//                      (kai yra) ARBA artists.score_trending (views/d.)
//   * release_points — nauji releizai tą savaitę (+12 už track'ą, max 24)
//   * base_points    — bazinis aktyvumas iš artist.score (0–7)
//
// Savaitė = pirmadienis..sekmadienis (Europe/Vilnius). Oficialus skaičiavimas —
// kas pirmadienį per /api/cron/fantasy-savaite; einamoji savaitė rodoma LIVE
// (tas pats skaičiavimas ant šviežių duomenų, neįrašant).

import { createAdminClient } from '@/lib/supabase'

export const FANTASY_BUDGET = 220
export const ROSTER_SIZE = 5
export const TRANSFERS_PER_WEEK = 3

// ── Savaitės ──────────────────────────────────────────────────────────────

/** Pirmadienis (YYYY-MM-DD) savaitės, kuriai priklauso duota data (LT laiku). */
export function weekStartOf(d: Date = new Date()): string {
  // LT data
  const ltDate = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Vilnius' }))
  const day = ltDate.getDay() // 0=sekmadienis
  const diff = day === 0 ? 6 : day - 1
  ltDate.setDate(ltDate.getDate() - diff)
  const y = ltDate.getFullYear()
  const m = String(ltDate.getMonth() + 1).padStart(2, '0')
  const dd = String(ltDate.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export function prevWeekStart(weekStart: string): string {
  const d = new Date(`${weekStart}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 7)
  return d.toISOString().slice(0, 10)
}

export function weekEnd(weekStart: string): string {
  const d = new Date(`${weekStart}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 7)
  return d.toISOString().slice(0, 10)
}

// ── Kainos ────────────────────────────────────────────────────────────────

/** Atlikėjo kaina iš realaus score (6..76). Biudžetas 220 → max 2 superžvaigždės. */
export function priceOf(score: number | null): number {
  const s = score || 0
  return Math.min(76, Math.max(6, Math.round(s * 1.15)))
}

// ── Atlikėjų savaitės taškai ──────────────────────────────────────────────

export type ArtistWeekPoints = {
  artist_id: number
  chart_points: number
  yt_points: number
  release_points: number
  base_points: number
  total_points: number
  details: any
}

type ArtistRow = { id: number; score: number | null; score_trending: number | null }

/**
 * Suskaičiuoja savaitės taškus atlikėjų rinkiniui.
 * `weekStart`..`weekEnd` — kalendorinė savaitė; live režimu naudoja šios
 * dienos duomenis (topų aktyvi savaitė, šviežias trending).
 */
export async function computeArtistWeekPoints(
  artistIds: number[],
  weekStart: string,
  opts: { live?: boolean } = {},
): Promise<Map<number, ArtistWeekPoints>> {
  const sb = createAdminClient()
  const wEnd = weekEnd(weekStart)
  const out = new Map<number, ArtistWeekPoints>()
  if (artistIds.length === 0) return out

  // 1) Atlikėjai (score, trending)
  const { data: artists } = await sb
    .from('artists')
    .select('id, score, score_trending')
    .in('id', artistIds)
  const artistById = new Map<number, ArtistRow>((artists || []).map((a: any) => [a.id, a]))

  // 2) Topų taškai — tos savaitės top_weeks (live: aktyvi/naujausia; kitaip finalizuota)
  const chartByArtist = new Map<number, { pts: number; entries: any[] }>()
  {
    // Pozicijos atsiranda tik finalizavus savaitę, o kartais finalizuotos
    // savaitės būna BE įrašų (pipeline'o pauzės) — todėl imame naujausią
    // kiekvieno tipo savaitę, KURI TURI įrašų.
    const { data: weeks } = await sb.from('top_weeks').select('id, top_type, week_start, is_finalized')
      .eq('is_finalized', true)
      .lte('week_start', opts.live ? wEnd : weekStart)
      .order('week_start', { ascending: false })
      .limit(16)
    const candidateIds = (weeks || []).map(w => w.id)
    let entriesAll: any[] = []
    if (candidateIds.length) {
      const { data } = await sb
        .from('top_entries')
        .select('week_id, top_type, position, track_id, tracks:track_id ( id, title, artist_id )')
        .in('week_id', candidateIds)
      entriesAll = data || []
    }
    // Naujausia savaitė su įrašais per top_type
    const weekIdsWithEntries = new Set(entriesAll.map(e => e.week_id))
    const byType = new Map<string, any>()
    for (const w of weeks || []) {
      if (!byType.has(w.top_type) && weekIdsWithEntries.has(w.id)) byType.set(w.top_type, w)
    }
    const activeWeekIds = new Set(Array.from(byType.values()).map(w => w.id))
    {
      const entries = entriesAll.filter(e => activeWeekIds.has(e.week_id))
      for (const e of entries || []) {
        const t: any = Array.isArray((e as any).tracks) ? (e as any).tracks[0] : (e as any).tracks
        const aId = t?.artist_id
        if (!aId || !artistById.has(aId)) continue
        const size = e.top_type === 'top40' ? 41 : 31
        const pts = Math.max(0, size - e.position) * (e.top_type === 'top40' ? 1 : 0.8)
        const cur = chartByArtist.get(aId) || { pts: 0, entries: [] }
        cur.pts += pts
        cur.entries.push({ top: e.top_type, pos: e.position, title: t?.title })
        chartByArtist.set(aId, cur)
      }
    }
  }

  // 3) YouTube augimas — views delta iš istorijos (kai padengta)
  const ytDeltaByArtist = new Map<number, number>()
  {
    const { data: hist } = await sb
      .from('track_video_views_history')
      .select('track_id, views, captured_at, tracks:track_id ( artist_id )')
      .gte('captured_at', `${weekStart}T00:00:00`)
      .lt('captured_at', `${wEnd}T00:00:00`)
      .order('captured_at', { ascending: true })
      .limit(20000)
    // pirmo ir paskutinio snapshot'o skirtumas per track'ą
    const firstLast = new Map<number, { first: number; last: number; artist: number }>()
    for (const h of hist || []) {
      const t: any = Array.isArray((h as any).tracks) ? (h as any).tracks[0] : (h as any).tracks
      const aId = t?.artist_id
      if (!aId || !artistById.has(aId)) continue
      const cur = firstLast.get(h.track_id)
      if (!cur) firstLast.set(h.track_id, { first: h.views, last: h.views, artist: aId })
      else cur.last = h.views
    }
    for (const v of firstLast.values()) {
      const delta = Math.max(0, v.last - v.first)
      ytDeltaByArtist.set(v.artist, (ytDeltaByArtist.get(v.artist) || 0) + delta)
    }
  }

  // 4) Releizai tą savaitę
  const releasesByArtist = new Map<number, number>()
  {
    const { data: rel } = await sb
      .from('tracks')
      .select('id, artist_id')
      .in('artist_id', artistIds)
      .gte('release_date', weekStart)
      .lt('release_date', wEnd)
    for (const r of rel || []) {
      releasesByArtist.set(r.artist_id, (releasesByArtist.get(r.artist_id) || 0) + 1)
    }
  }

  // 5) Sudėliojam
  for (const id of artistIds) {
    const a = artistById.get(id)
    if (!a) continue

    const chart = chartByArtist.get(id)
    const chart_points = Math.round(chart?.pts || 0)

    // YT: score_trending yra 0..~90 skalės indikatorius (ne raw views) —
    // konvertuojam tiesiogiai (×0.4 → iki ~35 tšk.). Views istorijos delta
    // (kai padengta) — log skalė. Imamas geresnis iš dviejų.
    const histDelta = ytDeltaByArtist.get(id) || 0
    const histPts = histDelta > 0 ? Math.round(9 * Math.log(1 + histDelta / 2000)) : 0
    const trendPts = Math.round(Math.max(0, a.score_trending || 0) * 0.4)
    const yt_points = Math.max(histPts, trendPts)

    const relCount = releasesByArtist.get(id) || 0
    const release_points = Math.min(24, relCount * 12)

    const base_points = Math.min(7, Math.round((a.score || 0) / 10))

    const total_points = chart_points + yt_points + release_points + base_points
    out.set(id, {
      artist_id: id,
      chart_points,
      yt_points,
      release_points,
      base_points,
      total_points,
      details: {
        chart_entries: chart?.entries || [],
        yt_delta: histDelta,
        trend: a.score_trending || 0,
        releases: relCount,
      },
    })
  }

  return out
}

/**
 * Oficialus savaitės skaičiavimas: visi LT atlikėjai su score>0 →
 * fantasy_artist_weeks; visos komandos → fantasy_team_weeks.
 * Idempotent'iška (upsert).
 */
export async function computeFantasyWeek(weekStart: string, live = false): Promise<{ artists: number; teams: number }> {
  const sb = createAdminClient()

  const { data: ltArtists } = await sb
    .from('artists')
    .select('id')
    .eq('country', 'Lietuva')
    .gt('score', 0)
    .limit(1000)
  const ids = (ltArtists || []).map(a => a.id)

  // Dalimis po 200, kad užklausos neišsipūstų
  const allPoints = new Map<number, ArtistWeekPoints>()
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    const pts = await computeArtistWeekPoints(chunk, weekStart, { live })
    for (const [k, v] of pts) allPoints.set(k, v)
  }

  // Upsert artist weeks
  const rows = Array.from(allPoints.values()).map(p => ({
    artist_id: p.artist_id,
    week_start: weekStart,
    chart_points: p.chart_points,
    yt_points: p.yt_points,
    release_points: p.release_points,
    base_points: p.base_points,
    total_points: p.total_points,
    details: p.details,
    computed_at: new Date().toISOString(),
  }))
  for (let i = 0; i < rows.length; i += 500) {
    await sb.from('fantasy_artist_weeks').upsert(rows.slice(i, i + 500), { onConflict: 'artist_id,week_start' })
  }

  // Komandų savaitės: aktyvus roster'is, pasirašytas iki savaitės pabaigos
  const wEnd = weekEnd(weekStart)
  const { data: teams } = await sb.from('fantasy_teams').select('id')
  let teamCount = 0
  for (const team of teams || []) {
    const { data: roster } = await sb
      .from('fantasy_roster')
      .select('artist_id, signed_at, artists:artist_id ( name )')
      .eq('team_id', team.id)
      .is('released_at', null)
      .lt('signed_at', `${wEnd}T00:00:00`)
    const breakdown = (roster || []).map((r: any) => {
      const a = Array.isArray(r.artists) ? r.artists[0] : r.artists
      const p = allPoints.get(r.artist_id)
      return { artist_id: r.artist_id, name: a?.name || '—', points: p?.total_points || 0 }
    })
    const points = breakdown.reduce((s, b) => s + b.points, 0)
    await sb.from('fantasy_team_weeks').upsert({
      team_id: team.id,
      week_start: weekStart,
      points,
      breakdown,
      computed_at: new Date().toISOString(),
    }, { onConflict: 'team_id,week_start' })
    teamCount++
  }

  return { artists: rows.length, teams: teamCount }
}
