import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { findOrCreateArtist, createTrackForArtist } from '@/lib/chart-resolve'

export const dynamic = 'force-dynamic'

/** POST /api/admin/charts/entry — vieno įrašo veiksmas:
 *   { entryId, action: 'link', trackId }            — susieti su esama daina
 *   { entryId, action: 'create' }                   — sukurti atlikėją+dainą
 *   { entryId, action: 'skip' }                     — palikti text_only
 *   { entryId, action: 'unlink' }                   — atrišti (atgal į pending)
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const entryId = typeof body.entryId === 'number' ? body.entryId : parseInt(body.entryId, 10)
  const action = String(body.action || '')
  if (!entryId || !action) return NextResponse.json({ error: 'entryId + action required' }, { status: 400 })

  const sb = createAdminClient()
  const { data: entry } = await sb
    .from('external_chart_entries')
    .select('id, chart_id, artist_name, title')
    .eq('id', entryId).maybeSingle()
  if (!entry) return NextResponse.json({ error: 'entry not found' }, { status: 404 })

  if (action === 'skip') {
    await sb.from('external_chart_entries').update({ resolve_state: 'text_only' }).eq('id', entryId)
    return NextResponse.json({ ok: true, resolveState: 'text_only' })
  }

  if (action === 'unlink') {
    await sb.from('external_chart_entries')
      .update({ resolve_state: 'pending', track_id: null, artist_id: null }).eq('id', entryId)
    return NextResponse.json({ ok: true, resolveState: 'pending' })
  }

  if (action === 'link') {
    const trackId = typeof body.trackId === 'number' ? body.trackId : parseInt(body.trackId, 10)
    if (!trackId) return NextResponse.json({ error: 'trackId required' }, { status: 400 })
    const { data: tr } = await sb.from('tracks').select('id, artist_id').eq('id', trackId).maybeSingle()
    if (!tr) return NextResponse.json({ error: 'track not found' }, { status: 404 })
    await sb.from('external_chart_entries').update({
      track_id: tr.id, artist_id: tr.artist_id, resolve_state: 'matched',
    }).eq('id', entryId)
    return NextResponse.json({ ok: true, resolveState: 'matched', trackId: tr.id })
  }

  if (action === 'create') {
    const { data: chart } = await sb.from('external_charts')
      .select('scope, country').eq('id', entry.chart_id).maybeSingle()
    const country = chart?.country || (chart?.scope === 'lt' ? 'LT' : null)
    try {
      const artistId = await findOrCreateArtist(sb, entry.artist_name, country)
      const trackId = await createTrackForArtist(sb, artistId, entry.title)
      await sb.from('external_chart_entries').update({
        track_id: trackId, artist_id: artistId, resolve_state: 'created',
      }).eq('id', entryId)
      return NextResponse.json({ ok: true, resolveState: 'created', trackId, artistId })
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || 'create failed' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
