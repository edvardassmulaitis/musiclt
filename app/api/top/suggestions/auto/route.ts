import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getCurrentWeekMonday } from '@/lib/top-week'

/**
 * AUTO-PASIŪLYMAI į būsimus topus (admin-only).
 *
 * GET /api/top/suggestions/auto?type=top40|lt_top30
 *
 * Kandidatai generuojami on-the-fly iš dviejų signalų:
 *
 *   1. NAUJŲ DAINŲ SRAUTAS (homepage logika, lib/home-latest.ts):
 *      tracks.video_uploaded_at per paskutines 90 d., rank pagal video_views.
 *      lt_top30 → tik LT atlikėjai (country Lietuva/LT/Lithuania arba NULL);
 *      top40 → visi (išskyrus blokuotas šalis).
 *
 *   2. EXTERNAL TOPAI (external_charts is_current=true): resolved entries
 *      (track_id NOT NULL). lt_top30 → scope='lt'; top40 → scope IN
 *      ('world','social'). Kuo aukštesnė pozicija ir kuo daugiau šaltinių
 *      (konsensusas) — tuo didesnis balas.
 *
 * ANTI-REPEAT logika:
 *   - HARD exclude: track jau yra top_suggestions (bet kokiu statusu —
 *     rejected reiškia „adminas jau pasakė ne"), track jau buvo top_entries
 *     šiame top tipe, atlikėjas YRA einamosios savaitės tope.
 *   - SOFT penalty (rodom, bet nuleidžiam žemyn + pažymim): atlikėjas buvo
 *     tope arba siūlytas per paskutines 4 savaites.
 *   - Kiekvienam kandidatui grąžinama atlikėjo istorija: kada paskutinį
 *     kartą buvo tope / siūlytas ir su kokia daina.
 *
 * Patvirtinimas/atmetimas vyksta per esamą /api/top/suggestions POST su
 * status='approved'|'rejected' (admin-only param) — atmesti kandidatai
 * daugiau nebesiūlomi.
 */

const LT_COUNTRIES = ['Lietuva', 'LT', 'Lithuania']
const BLOCKED_COUNTRIES = ['Rusija']
const FRESH_WINDOW_DAYS = 90
const SOFT_PENALTY_DAYS = 28
const MAX_CANDIDATES = 30

type Candidate = {
  track_id: number
  title: string
  artist_id: number | null
  artist_name: string
  cover_url: string | null
  score: number
  reasons: string[]
  penalty: boolean
  history: {
    last_top_week: string | null
    last_top_track: string | null
    last_suggested_at: string | null
    last_suggested_track: string | null
  }
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !['editor', 'admin', 'super_admin'].includes(session.user.role))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const topType = searchParams.get('type') === 'lt_top30' ? 'lt_top30' : 'top40'
  const supabase = createAdminClient()
  const now = new Date()

  /* ── 1. Šviežios dainos (naujų dainų srautas) ─────────────────────── */
  const freshSince = new Date(now.getTime() - FRESH_WINDOW_DAYS * 86400000).toISOString()
  const { data: freshTracks } = await supabase
    .from('tracks')
    .select('id, title, cover_url, video_views, video_uploaded_at, artist_id, artists:artist_id(id, name, country)')
    .not('video_uploaded_at', 'is', null)
    .gte('video_uploaded_at', freshSince)
    .order('video_views', { ascending: false })
    .limit(400)

  /* ── 2. External topų resolved entries ────────────────────────────── */
  const scopes = topType === 'lt_top30' ? ['lt'] : ['world', 'social']
  const { data: extEntries } = await supabase
    .from('external_chart_entries')
    .select('track_id, artist_id, position, artist_name, title, cover_url, external_charts!inner(id, title, source, size, scope, is_current)')
    .eq('external_charts.is_current', true)
    .in('external_charts.scope', scopes)
    .not('track_id', 'is', null)
    .order('position', { ascending: true })
    .limit(1000)

  /* ── 3. Exclusion set'ai ──────────────────────────────────────────── */
  // 3a. Visi suggestions (bet koks statusas) šiam top tipui
  const { data: allSuggestions } = await supabase
    .from('top_suggestions')
    .select('track_id, status, created_at')
    .eq('top_type', topType)
    .not('track_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(2000)
  const suggestedTrackIds = new Set((allSuggestions || []).map((s: any) => s.track_id))

  // 3b. Topo istorija (entries + savaitės) — exclusion + atlikėjo istorijai
  const { data: historyEntries } = await supabase
    .from('top_entries')
    .select('track_id, position, week_id, top_weeks:week_id(week_start)')
    .eq('top_type', topType)
    .order('id', { ascending: false })
    .limit(3000)

  const everInTopTrackIds = new Set((historyEntries || []).map((e: any) => e.track_id))

  // 3c. Einamosios savaitės atlikėjai (hard exclude)
  const thisMonday = getCurrentWeekMonday(now)
  const { data: curWeek } = await supabase
    .from('top_weeks')
    .select('id')
    .eq('top_type', topType)
    .eq('week_start', thisMonday)
    .maybeSingle()

  let currentWeekArtistIds = new Set<number>()
  if (curWeek?.id) {
    const { data: curEntries } = await supabase
      .from('top_entries')
      .select('track_id, tracks:track_id(artist_id)')
      .eq('week_id', curWeek.id)
    currentWeekArtistIds = new Set(
      (curEntries || []).map((e: any) => e.tracks?.artist_id).filter(Boolean)
    )
  }

  /* ── 4. Atlikėjų istorijos map'ai ─────────────────────────────────── */
  // Track→artist žemėlapis istorijos entries'ams (top_entries neturi artist_id)
  const histTrackIds = [...new Set((historyEntries || []).map((e: any) => e.track_id).filter(Boolean))]
  const histTrackMeta = new Map<number, { artist_id: number | null; title: string }>()
  for (let i = 0; i < histTrackIds.length; i += 400) {
    const chunk = histTrackIds.slice(i, i + 400)
    const { data: rows } = await supabase
      .from('tracks')
      .select('id, title, artist_id')
      .in('id', chunk)
    for (const r of (rows || [])) histTrackMeta.set(r.id, { artist_id: r.artist_id, title: r.title })
  }

  // artist_id → paskutinis pasirodymas tope (week_start + track title)
  const lastTopByArtist = new Map<number, { week: string; track: string }>()
  for (const e of (historyEntries || []) as any[]) {
    const meta = histTrackMeta.get(e.track_id)
    if (!meta?.artist_id) continue
    const ws = e.top_weeks?.week_start
    if (!ws) continue
    const prev = lastTopByArtist.get(meta.artist_id)
    if (!prev || ws > prev.week) lastTopByArtist.set(meta.artist_id, { week: ws, track: meta.title })
  }

  // artist_id → paskutinis pasiūlymas (created_at + track title)
  const sugTrackIds = [...new Set((allSuggestions || []).map((s: any) => s.track_id))]
  const sugTrackMeta = new Map<number, { artist_id: number | null; title: string }>()
  for (let i = 0; i < sugTrackIds.length; i += 400) {
    const chunk = sugTrackIds.slice(i, i + 400)
    const { data: rows } = await supabase
      .from('tracks')
      .select('id, title, artist_id')
      .in('id', chunk)
    for (const r of (rows || [])) sugTrackMeta.set(r.id, { artist_id: r.artist_id, title: r.title })
  }
  const lastSuggestedByArtist = new Map<number, { at: string; track: string }>()
  for (const s of (allSuggestions || []) as any[]) {
    const meta = sugTrackMeta.get(s.track_id)
    if (!meta?.artist_id) continue
    const prev = lastSuggestedByArtist.get(meta.artist_id)
    if (!prev || s.created_at > prev.at) lastSuggestedByArtist.set(meta.artist_id, { at: s.created_at, track: meta.title })
  }

  /* ── 5. Kandidatų surinkimas + scoring ────────────────────────────── */
  const candidates = new Map<number, Candidate>()

  const isLT = (country: string | null | undefined) =>
    !country || LT_COUNTRIES.includes(country)
  const isBlocked = (country: string | null | undefined) =>
    !!country && BLOCKED_COUNTRIES.includes(country)

  const ensureCandidate = (trackId: number, title: string, artistId: number | null, artistName: string, cover: string | null): Candidate => {
    let c = candidates.get(trackId)
    if (!c) {
      c = {
        track_id: trackId, title, artist_id: artistId, artist_name: artistName,
        cover_url: cover, score: 0, reasons: [], penalty: false,
        history: { last_top_week: null, last_top_track: null, last_suggested_at: null, last_suggested_track: null },
      }
      candidates.set(trackId, c)
    }
    return c
  }

  // 5a. External charts signalas
  for (const e of (extEntries || []) as any[]) {
    const chart = e.external_charts
    if (!chart || !e.track_id) continue
    if (suggestedTrackIds.has(e.track_id) || everInTopTrackIds.has(e.track_id)) continue
    const c = ensureCandidate(e.track_id, e.title, e.artist_id ?? null, e.artist_name, e.cover_url ?? null)
    const size = chart.size || 100
    const posScore = Math.max(0, (size - (e.position || size) + 1) / size) * 30
    c.score += posScore
    c.reasons.push(`${chart.title} #${e.position}`)
  }

  // 5b. Naujų dainų srautas
  for (const t of (freshTracks || []) as any[]) {
    const artist = Array.isArray(t.artists) ? t.artists[0] : t.artists
    if (!artist) continue
    if (isBlocked(artist.country)) continue
    if (topType === 'lt_top30' && !isLT(artist.country)) continue
    if (suggestedTrackIds.has(t.id) || everInTopTrackIds.has(t.id)) continue

    const ageDays = (now.getTime() - new Date(t.video_uploaded_at).getTime()) / 86400000
    const freshScore = 20 * Math.max(0, 1 - ageDays / FRESH_WINDOW_DAYS)
    const viewScore = Math.min(15, Math.log10((t.video_views || 0) + 1) * 3)

    const c = ensureCandidate(t.id, t.title, artist.id ?? t.artist_id, artist.name, t.cover_url ?? null)
    c.score += freshScore + viewScore
    const views = t.video_views || 0
    const viewsLabel = views >= 1000 ? `${Math.round(views / 1000)}k perž.` : `${views} perž.`
    c.reasons.push(`Naujas klipas (prieš ${Math.max(1, Math.round(ageDays))} d., ${viewsLabel})`)
  }

  /* ── 6. Istorija + anti-repeat penalty ────────────────────────────── */
  const softCutoff = new Date(now.getTime() - SOFT_PENALTY_DAYS * 86400000)
  const result: Candidate[] = []
  for (const c of candidates.values()) {
    if (c.artist_id && currentWeekArtistIds.has(c.artist_id)) continue // hard: atlikėjas jau tope

    if (c.artist_id) {
      const lastTop = lastTopByArtist.get(c.artist_id)
      const lastSug = lastSuggestedByArtist.get(c.artist_id)
      if (lastTop) {
        c.history.last_top_week = lastTop.week
        c.history.last_top_track = lastTop.track
        if (new Date(lastTop.week) >= softCutoff) { c.score -= 25; c.penalty = true }
      }
      if (lastSug) {
        c.history.last_suggested_at = lastSug.at
        c.history.last_suggested_track = lastSug.track
        if (new Date(lastSug.at) >= softCutoff) { c.score -= 15; c.penalty = true }
      }
    }
    result.push(c)
  }

  result.sort((a, b) => b.score - a.score)

  return NextResponse.json({
    top_type: topType,
    generated_at: now.toISOString(),
    candidates: result.slice(0, MAX_CANDIDATES).map(c => ({
      ...c,
      score: Math.round(c.score * 10) / 10,
      reasons: c.reasons.slice(0, 4),
    })),
  })
}
