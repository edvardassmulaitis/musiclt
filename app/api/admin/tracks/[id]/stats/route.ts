/**
 * GET /api/admin/tracks/[id]/stats
 *
 * Aggreguota statistika vienai dainai admin edit puslapiui.
 * Trackinam viską ką žinom apie dainą — be jokios CACHE
 * (admin'as turi matyti aktualų state'ą po enrich/update'ų).
 *
 * Response:
 *   {
 *     ok: true,
 *     trackId, legacyId, slug, source,
 *     views: {
 *       current: number | null,
 *       checked_at: ISO | null,
 *       embeddable: boolean | null,
 *       history: [{ captured_at: ISO, views: number, video_id: string | null }, ...] (asc)
 *     },
 *     score: { value: number | null, breakdown: object | null, updated_at: ISO | null },
 *     engagement: {
 *       likes: number,            // public.likes WHERE entity_type='track' AND entity_id=trackId
 *       comments: number,         // public.comments WHERE track_id=trackId
 *       plays: number,            // public.track_plays WHERE track_id=trackId
 *       top_appearances: number,  // public.top_entries WHERE track_id=trackId (kiek savaičių charts)
 *       votes: number,            // public.daily_song_votes WHERE track_id=trackId (kiek balsų istoriškai)
 *     },
 *     timestamps: { imported_at, updated_at, score_updated_at }
 *   }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: idStr } = await params
  const trackId = Number(idStr)
  if (!Number.isFinite(trackId) || trackId <= 0) {
    return NextResponse.json({ error: 'Bad track id' }, { status: 400 })
  }

  const sb = createAdminClient()

  // ── 1. Track core ─────────────────────────────────────────────────────────
  // page_view_count gali nebūti — migracija 20260506_page_view_tracking.sql
  // dar neaplikuota. Jei kolonėlė trūksta, mažesnis SELECT'as fallback'inasi.
  let trackData: any = null
  let tErr: any = null
  {
    const r = await sb
      .from('tracks')
      .select('id, legacy_id, slug, source, source_url, video_views, video_views_checked_at, video_embeddable, page_view_count, score, score_breakdown, score_updated_at, imported_at, updated_at, created_at')
      .eq('id', trackId)
      .maybeSingle()
    if (r.error && /page_view_count/.test(r.error.message)) {
      // Fallback be page_view_count
      const r2 = await sb
        .from('tracks')
        .select('id, legacy_id, slug, source, source_url, video_views, video_views_checked_at, video_embeddable, score, score_breakdown, score_updated_at, imported_at, updated_at, created_at')
        .eq('id', trackId)
        .maybeSingle()
      trackData = r2.data
      tErr = r2.error
    } else {
      trackData = r.data
      tErr = r.error
    }
  }
  const track = trackData

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })
  if (!track) return NextResponse.json({ error: 'Track not found' }, { status: 404 })

  const t: any = track

  // ── 2. Views history ──────────────────────────────────────────────────────
  // Asc'inam pagal captured_at, kad UI galėtų pieš sparkline iš seniausio →
  // naujausio. Limit'as 100 — 30+ snapshot'ų retai pasitaiko (per dieną/savaitę).
  const { data: histRows } = await sb
    .from('track_video_views_history')
    .select('captured_at, views, video_id')
    .eq('track_id', trackId)
    .order('captured_at', { ascending: true })
    .limit(100)

  // ── 3. Engagement counts (parallel) ───────────────────────────────────────
  // Naudojam HEAD count'us (count: 'exact', head: true) — greičiausi būdas.
  // top_entries — vietoj count'o pasiimam visus position'us, kad galėtume
  // suskaičiuoti peak + weeks_at_1 + weeks_top10 lokaliai.
  const [likesRes, commentsRes, playsRes, topRowsRes, votesRes] = await Promise.all([
    sb.from('likes').select('*', { count: 'exact', head: true })
      .eq('entity_type', 'track').eq('entity_id', trackId),
    sb.from('comments').select('*', { count: 'exact', head: true })
      .eq('track_id', trackId),
    sb.from('track_plays').select('*', { count: 'exact', head: true })
      .eq('track_id', trackId),
    sb.from('top_entries').select('position')
      .eq('track_id', trackId),
    sb.from('daily_song_votes').select('*', { count: 'exact', head: true })
      .eq('track_id', trackId),
  ])

  // Chart performance aggregation
  const positions = (topRowsRes.data || []).map((r: any) => r.position).filter((p: any) => Number.isFinite(p)) as number[]
  const weeksTotal = positions.length
  const peakPosition = positions.length > 0 ? Math.min(...positions) : null
  const weeksAt1 = positions.filter(p => p === 1).length
  const weeksTop10 = positions.filter(p => p <= 10).length
  // Chart score: each week earns (101 - position) points (peak #1 = 100pts).
  // Sum gives a single number that combines weeks + best position.
  const chartScore = positions.reduce((s, p) => s + Math.max(0, 101 - p), 0)

  return NextResponse.json({
    ok: true,
    trackId,
    legacyId: t.legacy_id ?? null,
    slug: t.slug ?? null,
    source: t.source ?? null,
    sourceUrl: t.source_url ?? null,
    views: {
      current: t.video_views ?? null,
      checked_at: t.video_views_checked_at ?? null,
      embeddable: t.video_embeddable ?? null,
      history: histRows || [],
    },
    pageViews: t.page_view_count ?? null,  // null = migracija neaplikuota
    score: {
      value: t.score ?? null,
      breakdown: t.score_breakdown ?? null,
      updated_at: t.score_updated_at ?? null,
    },
    engagement: {
      likes: likesRes.count ?? 0,
      comments: commentsRes.count ?? 0,
      plays: playsRes.count ?? 0,
      votes: votesRes.count ?? 0,
    },
    chartPerformance: {
      weeks_total: weeksTotal,
      peak_position: peakPosition,    // null jei nė karto chart'uose
      weeks_at_1: weeksAt1,
      weeks_top10: weeksTop10,
      chart_score: chartScore,        // sum((101 - position)) per week
    },
    timestamps: {
      created_at: t.created_at ?? null,
      imported_at: t.imported_at ?? null,
      updated_at: t.updated_at ?? null,
      score_updated_at: t.score_updated_at ?? null,
    },
  })
}
