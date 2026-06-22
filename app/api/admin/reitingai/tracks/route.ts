// ── GET /api/admin/reitingai/tracks?artist_id=ID ─────────────────────────
// Drill-down: kokie klipai (+albumai) subuildino atlikėjo balą.
// Grąžina: top dainos pagal peržiūras (su peržiūros/dieną), top albumai pagal
// sumines peržiūras, + suvestinė (viso peržiūrų, klipų sk., metų tarpsnis).
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  const url = new URL(req.url)
  const artistId = Number(url.searchParams.get('artist_id'))
  if (!artistId) return NextResponse.json({ error: 'Missing artist_id' }, { status: 400 })

  const sb = createAdminClient()
  const { data: rows, error } = await sb
    .from('tracks')
    .select('id, title, slug, video_views, video_uploaded_at, release_year')
    .eq('artist_id', artistId)
    .not('video_views', 'is', null)
    .gt('video_views', 0)
    .order('video_views', { ascending: false })
    .limit(400)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const now = Date.now(), DAY = 86_400_000
  const curYear = new Date().getFullYear()
  const recentCutoff = now - 2 * 365 * DAY   // trending langas = 2 metai
  let total_views = 0, minYear = 0, maxYear = 0
  const tracks = (rows || []).map((t: any) => {
    const v = Number(t.video_views) || 0
    total_views += v
    const ry = Number(t.release_year) || 0
    if (ry >= 1950 && ry <= curYear + 1 && ry !== 1970) {
      if (minYear === 0 || ry < minYear) minYear = ry
      if (ry > maxYear) maxYear = ry
    }
    let uploadTs: number | null = null
    if (t.video_uploaded_at) { const p = Date.parse(t.video_uploaded_at); if (!Number.isNaN(p)) uploadTs = p }
    const ts = uploadTs !== null ? uploadTs : (ry ? Date.UTC(ry, 0, 1) : null)
    const ageDays = ts === null ? null : Math.max(30, (now - ts) / DAY)
    const vpd = ageDays ? Math.round(v / ageDays) : null
    const recent = ry >= 1950 ? (ry >= curYear - 2) : (uploadTs !== null && uploadTs >= recentCutoff)
    return { id: t.id, title: t.title, slug: t.slug, views: v, year: ry || null, vpd, recent }
  })

  const span_years = minYear > 0 && maxYear > minYear ? maxYear - minYear : 0

  return NextResponse.json({
    ok: true,
    summary: { n_videos: tracks.length, total_views, span_years, min_year: minYear || null, max_year: maxYear || null },
    // ALL-TIME drill-down: daugiausiai peržiūrų (bendra aprėptis).
    top_views: tracks.slice(0, 15),
    // TRENDING drill-down: TIK naujos (≤2 m.) dainos pagal peržiūras/dieną.
    top_recent: tracks.filter(t => t.recent && t.vpd != null).sort((a, b) => (b.vpd! - a.vpd!)).slice(0, 15),
  })
}
