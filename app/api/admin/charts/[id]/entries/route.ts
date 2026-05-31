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
  const isAlbum = chart.chart_key === 'albums'

  const entries: any[] = []
  let from = 0
  for (;;) {
    const { data } = await sb
      .from('external_chart_entries')
      .select(`
        id, position, prev_position, weeks_on_chart, is_new,
        artist_name, title, cover_url, resolve_state, track_id, album_id, artist_id,
        tracks:track_id ( id, slug, title, artists:artist_id ( id, slug, name ) ),
        albums:album_id ( id, slug, title, artists:artist_id ( id, slug, name ) )
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
    const al = Array.isArray(e.albums) ? e.albums[0] : e.albums
    const ent = isAlbum ? al : tr            // susieto įrašo entitetas pagal chart tipą
    const ar = ent ? (Array.isArray(ent.artists) ? ent.artists[0] : ent.artists) : null
    // Teisinga nuoroda: /dainos|albumai/{artistSlug}-{slug}-{id} (fallback be artistSlug).
    let href: string | null = null
    if (ent) {
      const base = isAlbum ? 'albumai' : 'dainos'
      href = ar?.slug
        ? `/${base}/${ar.slug}-${ent.slug}-${ent.id}`
        : `/${base}/${ent.slug}-${ent.id}`
    }
    return {
      id: e.id, position: e.position, prevPosition: e.prev_position,
      weeksOnChart: e.weeks_on_chart, isNew: e.is_new,
      artistName: e.artist_name, title: e.title, coverUrl: e.cover_url,
      resolveState: e.resolve_state,
      entityType: isAlbum ? 'album' : 'track',
      track: ent ? { id: ent.id, slug: ent.slug, title: ent.title, artist: ar?.name ?? null, artistSlug: ar?.slug ?? null, href } : null,
    }
  })

  return NextResponse.json({ chart, isAlbum, entries: norm })
}
