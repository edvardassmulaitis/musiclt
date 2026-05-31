import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { findOrCreateArtist, createTrackForArtist, createAlbumForArtist } from '@/lib/chart-resolve'

export const dynamic = 'force-dynamic'

/** POST /api/admin/charts/entry — vieno įrašo veiksmas:
 *   { entryId, action: 'link', trackId|albumId }    — susieti su esama daina/albumu
 *   { entryId, action: 'create' }                   — sukurti atlikėją+dainą/albumą (find-or-create)
 *   { entryId, action: 'skip' }                     — palikti text_only
 *   { entryId, action: 'unlink' }                   — atrišti (atgal į pending)
 *  Albumų chart'ams (chart_key='albums') link/create operuoja albumais.
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

  const { data: chart } = await sb.from('external_charts')
    .select('chart_key, scope, country').eq('id', entry.chart_id).maybeSingle()
  const isAlbum = chart?.chart_key === 'albums'

  if (action === 'skip') {
    await sb.from('external_chart_entries').update({ resolve_state: 'text_only' }).eq('id', entryId)
    return NextResponse.json({ ok: true, resolveState: 'text_only' })
  }

  if (action === 'unlink') {
    await sb.from('external_chart_entries')
      .update({ resolve_state: 'pending', track_id: null, album_id: null, artist_id: null }).eq('id', entryId)
    return NextResponse.json({ ok: true, resolveState: 'pending' })
  }

  if (action === 'link') {
    if (isAlbum) {
      const albumId = typeof body.albumId === 'number' ? body.albumId : parseInt(body.albumId ?? body.trackId, 10)
      if (!albumId) return NextResponse.json({ error: 'albumId required' }, { status: 400 })
      const { data: al } = await sb.from('albums').select('id, artist_id').eq('id', albumId).maybeSingle()
      if (!al) return NextResponse.json({ error: 'album not found' }, { status: 404 })
      await sb.from('external_chart_entries').update({
        album_id: al.id, track_id: null, artist_id: al.artist_id, resolve_state: 'matched',
      }).eq('id', entryId)
      return NextResponse.json({ ok: true, resolveState: 'matched', albumId: al.id })
    }
    const trackId = typeof body.trackId === 'number' ? body.trackId : parseInt(body.trackId, 10)
    if (!trackId) return NextResponse.json({ error: 'trackId required' }, { status: 400 })
    const { data: tr } = await sb.from('tracks').select('id, artist_id').eq('id', trackId).maybeSingle()
    if (!tr) return NextResponse.json({ error: 'track not found' }, { status: 404 })
    await sb.from('external_chart_entries').update({
      track_id: tr.id, album_id: null, artist_id: tr.artist_id, resolve_state: 'matched',
    }).eq('id', entryId)
    return NextResponse.json({ ok: true, resolveState: 'matched', trackId: tr.id })
  }

  if (action === 'create') {
    const country = chart?.country || (chart?.scope === 'lt' ? 'LT' : null)
    try {
      const artistId = await findOrCreateArtist(sb, entry.artist_name, country)
      if (isAlbum) {
        const albumId = await createAlbumForArtist(sb, artistId, entry.title)
        await sb.from('external_chart_entries').update({
          album_id: albumId, track_id: null, artist_id: artistId, resolve_state: 'created',
        }).eq('id', entryId)
        return NextResponse.json({ ok: true, resolveState: 'created', albumId, artistId })
      }
      const trackId = await createTrackForArtist(sb, artistId, entry.title)
      await sb.from('external_chart_entries').update({
        track_id: trackId, album_id: null, artist_id: artistId, resolve_state: 'created',
      }).eq('id', entryId)
      return NextResponse.json({ ok: true, resolveState: 'created', trackId, artistId })
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || 'create failed' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
