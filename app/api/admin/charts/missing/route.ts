import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { normalizeForMatch, primaryArtist, linkSongAcrossCharts } from '@/lib/chart-resolve'
import { commitChartTrack } from '@/lib/quick-add'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Agreguotas trūkstamų (nesusietų su katalogu) dainų sąrašas per VISUS dainų
 * topus. Dedupe pagal normalizuotą atlikėją|pavadinimą; rodo, keliuose topuose
 * daina figūruoja (didžiausias poveikis viršuje). Sutvarkius vieną kartą —
 * propaguojama į visus topus per linkSongAcrossCharts.
 */
export async function GET() {
  const sb = createAdminClient()
  const { data: charts } = await sb
    .from('external_charts')
    .select('id, title, chart_key, source')
    .eq('is_current', true).neq('source', 'consensus')
  const songCharts = (charts || []).filter((c: any) => c.chart_key !== 'albums')
  const ids = songCharts.map((c: any) => c.id)
  if (ids.length === 0) return NextResponse.json({ missing: [] })
  const titleById = new Map<number, string>(songCharts.map((c: any) => [c.id, c.title]))

  const rows: any[] = []
  let from = 0
  for (;;) {
    const { data } = await sb
      .from('external_chart_entries')
      .select('chart_id, artist_name, title, resolve_state, track_id')
      .in('chart_id', ids)
      .is('track_id', null)
      .in('resolve_state', ['pending', 'ambiguous', 'text_only'])
      .range(from, from + 999)
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < 1000) break
    from += 1000
  }

  const map = new Map<string, { artist: string; title: string; charts: Set<string> }>()
  for (const e of rows) {
    const key = normalizeForMatch(primaryArtist(e.artist_name)) + '|' + normalizeForMatch(e.title)
    if (!key.replace(/\|/g, '').trim()) continue
    let m = map.get(key)
    if (!m) { m = { artist: e.artist_name, title: e.title, charts: new Set() }; map.set(key, m) }
    m.charts.add(titleById.get(e.chart_id) || String(e.chart_id))
  }
  const missing = Array.from(map.values())
    .map(m => ({ artist: m.artist, title: m.title, chartCount: m.charts.size, charts: Array.from(m.charts).slice(0, 8) }))
    .sort((a, b) => b.chartCount - a.chartCount)
    .slice(0, 300)
  return NextResponse.json({ missing })
}

/** POST { artist, title, action:'create'|'link', trackId? } — sutvarko ir propaguoja. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const artist = String(body.artist || '').trim()
  const title = String(body.title || '').trim()
  const action = String(body.action || '')
  if (!artist || !title) return NextResponse.json({ error: 'artist + title required' }, { status: 400 })

  const sb = createAdminClient()

  if (action === 'create') {
    const r = await commitChartTrack(artist, title, req.nextUrl.origin, { enrich: true })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 })
    const linked = await linkSongAcrossCharts(sb, { trackId: r.trackId, artistId: r.artistId, rawArtist: artist, rawTitle: title }).catch(() => 0)
    return NextResponse.json({ ok: true, trackId: r.trackId, artistId: r.artistId, artistCreated: r.artistCreated, linked })
  }

  if (action === 'link') {
    const trackId = typeof body.trackId === 'number' ? body.trackId : parseInt(body.trackId, 10)
    if (!trackId) return NextResponse.json({ error: 'trackId required' }, { status: 400 })
    const { data: tr } = await sb.from('tracks').select('id, artist_id').eq('id', trackId).maybeSingle()
    if (!tr) return NextResponse.json({ error: 'track not found' }, { status: 404 })
    const linked = await linkSongAcrossCharts(sb, { trackId: (tr as any).id, artistId: (tr as any).artist_id, rawArtist: artist, rawTitle: title }).catch(() => 0)
    return NextResponse.json({ ok: true, trackId: (tr as any).id, linked })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
