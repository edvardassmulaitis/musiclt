import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { createAlbumForArtist, findOrCreateArtist, linkSongAcrossCharts } from '@/lib/chart-resolve'
import { commitChartTrack } from '@/lib/quick-add'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/** Susieto entiteto (daina/albumas) pilna info in-place UI update'ui —
 *  be papildomo /entries reload'o. Grąžina tą pačią struktūrą kaip entries GET
 *  `track` lauke: { id, slug, title, artist, artistSlug, artistId, href }. */
async function buildEntityInfo(sb: any, isAlbum: boolean, entityId: number) {
  const table = isAlbum ? 'albums' : 'tracks'
  const { data: ent } = await sb
    .from(table)
    .select('id, slug, title, artists:artist_id ( id, slug, name )')
    .eq('id', entityId).maybeSingle()
  if (!ent) return null
  const ar = Array.isArray(ent.artists) ? ent.artists[0] : ent.artists
  const base = isAlbum ? 'albumai' : 'dainos'
  const href = ar?.slug
    ? `/${base}/${ar.slug}-${ent.slug}-${ent.id}`
    : `/${base}/${ent.slug}-${ent.id}`
  return {
    id: ent.id, slug: ent.slug, title: ent.title,
    artist: ar?.name ?? null, artistSlug: ar?.slug ?? null,
    artistId: ar?.id ?? null, href,
  }
}

/** POST /api/admin/charts/entry — vieno įrašo veiksmas:
 *   { entryId, action: 'link', trackId|albumId }    — susieti su esama daina/albumu
 *   { entryId, action: 'create' }                   — sukurti atlikėją+dainą/albumą (find-or-create)
 *   { entryId, action: 'skip' }                     — palikti text_only
 *   { entryId, action: 'unlink' }                   — atrišti (atgal į pending)
 *  Albumų chart'ams (chart_key='albums') link/create operuoja albumais.
 */
export async function POST(req: NextRequest) {
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

  // Sukuria TIK atlikėją (ghost) — be dainos. Naudoja resolver UI „Sukurti" prie
  // atlikėjo vardo. body.artistName — konkretus vardas (primary arba featuring);
  // nenurodžius imamas entry primary segmentas. Primary atveju (body.isPrimary !==
  // false ir vardas atitinka segmentą) prikabinam artist_id prie įrašo, bet
  // resolve_state lieka 'pending' (daina dar nesukurta).
  if (action === 'create-artist') {
    // Šalis NEpriskiriama automatiškai — topo šalis ≠ atlikėjo šalis
    // (LT tope pasitaiko užsienio atlikėjų ir atvirkščiai). Admin papildo rankiniu būdu.
    const country = null
    const rawName = (typeof body.artistName === 'string' && body.artistName.trim())
      ? body.artistName.trim() : entry.artist_name
    const isPrimary = body.isPrimary !== false
    try {
      const artistId = await findOrCreateArtist(sb, rawName, country)
      const { data: art } = await sb.from('artists').select('id, name, slug').eq('id', artistId).maybeSingle()
      if (isPrimary) {
        await sb.from('external_chart_entries').update({ artist_id: artistId }).eq('id', entryId)
      }
      return NextResponse.json({ ok: true, artistId, artist: art || null, isPrimary })
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || 'create-artist failed' }, { status: 500 })
    }
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
      const xc = await linkSongAcrossCharts(sb, { albumId: al.id, artistId: al.artist_id, rawArtist: entry.artist_name, rawTitle: entry.title, exceptEntryId: entryId }).catch(() => 0)
      const track = await buildEntityInfo(sb, true, al.id).catch(() => null)
      return NextResponse.json({ ok: true, resolveState: 'matched', albumId: al.id, crossLinked: xc, track })
    }
    const trackId = typeof body.trackId === 'number' ? body.trackId : parseInt(body.trackId, 10)
    if (!trackId) return NextResponse.json({ error: 'trackId required' }, { status: 400 })
    const { data: tr } = await sb.from('tracks').select('id, artist_id').eq('id', trackId).maybeSingle()
    if (!tr) return NextResponse.json({ error: 'track not found' }, { status: 404 })
    await sb.from('external_chart_entries').update({
      track_id: tr.id, album_id: null, artist_id: tr.artist_id, resolve_state: 'matched',
    }).eq('id', entryId)
    const xc = await linkSongAcrossCharts(sb, { trackId: tr.id, artistId: tr.artist_id, rawArtist: entry.artist_name, rawTitle: entry.title, exceptEntryId: entryId }).catch(() => 0)
    const track = await buildEntityInfo(sb, false, tr.id).catch(() => null)
    return NextResponse.json({ ok: true, resolveState: 'matched', trackId: tr.id, crossLinked: xc, track })
  }

  if (action === 'create') {
    // Šalis NEpriskiriama automatiškai (žr. create-artist komentarą).
    const country = null
    try {
      if (isAlbum) {
        // Albumai: ghost atlikėjas + albumas (be YT — albumams netaikoma).
        const artistId = await findOrCreateArtist(sb, entry.artist_name, country)
        const albumId = await createAlbumForArtist(sb, artistId, entry.title)
        await sb.from('external_chart_entries').update({
          album_id: albumId, track_id: null, artist_id: artistId, resolve_state: 'created',
        }).eq('id', entryId)
        const xc = await linkSongAcrossCharts(sb, { albumId, artistId, rawArtist: entry.artist_name, rawTitle: entry.title, exceptEntryId: entryId }).catch(() => 0)
        const track = await buildEntityInfo(sb, true, albumId).catch(() => null)
        return NextResponse.json({ ok: true, resolveState: 'created', albumId, artistId, crossLinked: xc, track })
      }
      // Dainos: pilnas srautas — primary+featuring atlikėjai, YT video+views,
      // lyrics, spotify (kaip „Greitas pridėjimas"). enrich=true (per-row).
      const r = await commitChartTrack(entry.artist_name, entry.title, req.nextUrl.origin, { enrich: true })
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 })
      await sb.from('external_chart_entries').update({
        track_id: r.trackId, album_id: null, artist_id: r.artistId, resolve_state: 'created',
      }).eq('id', entryId)
      const xc = await linkSongAcrossCharts(sb, { trackId: r.trackId, artistId: r.artistId, rawArtist: entry.artist_name, rawTitle: entry.title, exceptEntryId: entryId }).catch(() => 0)
      const track = await buildEntityInfo(sb, false, r.trackId).catch(() => null)
      return NextResponse.json({
        ok: true, resolveState: 'created', trackId: r.trackId, artistId: r.artistId,
        artistCreated: r.artistCreated, featuring: r.featuring, enriched: r.enriched, crossLinked: xc, track,
      })
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || 'create failed' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
