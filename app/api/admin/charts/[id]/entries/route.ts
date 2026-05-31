import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/** GET /api/admin/charts/[id]/entries — vieno topo įrašai su (jei susieta)
 *  track info. Naudoja /admin/charts review lentelė. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const chartId = parseInt(id, 10)
  if (!chartId) return NextResponse.json({ error: 'bad id' }, { status: 400 })

  const sb = createAdminClient()
  const { data: chart } = await sb
    .from('external_charts')
    .select('id, source, chart_key, title, scope, period_label, country')
    .eq('id', chartId).maybeSingle()
  if (!chart) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const entries: any[] = []
  let from = 0
  for (;;) {
    const { data } = await sb
      .from('external_chart_entries')
      .select(`
        id, position, prev_position, weeks_on_chart, is_new,
        artist_name, title, cover_url, resolve_state, track_id, artist_id,
        tracks:track_id ( id, slug, title, artists:artist_id ( id, slug, name ) )
      `)
      .eq('chart_id', chartId)
      .order('position', { ascending: true })
      .range(from, from + 999)
    if (!data || data.length === 0) break
    entries.push(...data)
    if (data.length < 1000) break
    from += 1000
  }

  const norm = entries.map((e: any) => {
    const tr = Array.isArray(e.tracks) ? e.tracks[0] : e.tracks
    const ar = tr ? (Array.isArray(tr.artists) ? tr.artists[0] : tr.artists) : null
    return {
      id: e.id, position: e.position, prevPosition: e.prev_position,
      weeksOnChart: e.weeks_on_chart, isNew: e.is_new,
      artistName: e.artist_name, title: e.title, coverUrl: e.cover_url,
      resolveState: e.resolve_state,
      track: tr ? { id: tr.id, slug: tr.slug, title: tr.title, artist: ar?.name ?? null, artistSlug: ar?.slug ?? null } : null,
    }
  })

  return NextResponse.json({ chart, entries: norm })
}
