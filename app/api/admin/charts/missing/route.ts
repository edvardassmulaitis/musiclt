import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { normalizeForMatch, primaryArtist, linkSongAcrossCharts } from '@/lib/chart-resolve'
import { commitChartTrack } from '@/lib/quick-add'
import { searchYouTube } from '@/lib/yt-innertube'

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

  type MItem = { artist: string; title: string; charts: Set<string>; videoId: string | null; artistId: number | null; artistScore: number | null; artistSlug: string | null }
  const map = new Map<string, MItem>()
  for (const e of rows) {
    const key = normalizeForMatch(primaryArtist(e.artist_name)) + '|' + normalizeForMatch(e.title)
    if (!key.replace(/\|/g, '').trim()) continue
    let m = map.get(key)
    if (!m) { m = { artist: e.artist_name, title: e.title, charts: new Set(), videoId: null, artistId: null, artistScore: null, artistSlug: null }; map.set(key, m) }
    m.charts.add(titleById.get(e.chart_id) || String(e.chart_id))
  }

  // Sujungiam YouTube discovery kandidatus (playlist'ų scan) — tas pats „trūksta"
  // sąrašas. Dedupe pagal tą patį artist|title raktą, tad ta pati daina nesidubliuoja.
  // Discovery items turi tikrą video_id, tad siūlymas rodomas be papildomos paieškos.
  try {
    const { data: disc } = await sb
      .from('yt_discovery_candidates')
      .select('artist_raw, title_raw, video_id, scope, matched_artist_id, artists:matched_artist_id(id, score, slug)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(400)
    for (const d of (disc || []) as any[]) {
      const artist = (d.artist_raw || '').trim()
      const title = (d.title_raw || '').trim()
      // Be atlikėjo NErodom — Edvardo pastaba: „jei nėra atlikėjo, kažin ar verta
      // rodyti". Su tikru video kanalu (parseYtTitle fix) dauguma gauna atlikėją;
      // likę (title-only + agregatoriaus kanalas) tiesiog triukšmas.
      if (!title || !artist) continue
      const key = normalizeForMatch(primaryArtist(artist)) + '|' + normalizeForMatch(title)
      if (!key.replace(/\|/g, '').trim()) continue
      const aInfo = Array.isArray(d.artists) ? d.artists[0] : d.artists
      let m = map.get(key)
      if (!m) { m = { artist, title, charts: new Set(), videoId: d.video_id || null, artistId: d.matched_artist_id ?? null, artistScore: aInfo?.score ?? null, artistSlug: aInfo?.slug ?? null }; map.set(key, m) }
      else {
        if (!m.videoId && d.video_id) m.videoId = d.video_id
        if (m.artistId == null && d.matched_artist_id) { m.artistId = d.matched_artist_id; m.artistScore = aInfo?.score ?? null; m.artistSlug = aInfo?.slug ?? null }
      }
      m.charts.add('YouTube')
    }
  } catch { /* lentelės gali nebūti — praleidžiam */ }

  const missing = Array.from(map.values())
    .map(m => ({ artist: m.artist, title: m.title, chartCount: m.charts.size, charts: Array.from(m.charts).slice(0, 8), videoId: m.videoId, artistId: m.artistId, artistScore: m.artistScore, artistSlug: m.artistSlug }))
    .sort((a, b) => b.chartCount - a.chartCount)
    .slice(0, 400)
  return NextResponse.json({ missing })
}

/** POST { artist, title, action:'create'|'link', trackId? } — sutvarko ir propaguoja. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const artist = String(body.artist || '').trim()
  const title = String(body.title || '').trim()
  const action = String(body.action || '')
  const sb = createAdminClient()
  const videoId = String(body.videoId || '').trim() || null

  // Atmesti pasiūlymą — reikia TIK videoId. Tvarkom PRIEŠ artist/title reikalavimą,
  // nes discovery daina gali neturėti atlikėjo (artist_raw null) — anksčiau tokiu
  // atveju grąžindavo 400 ir atmestis nepersistindavo (daina grįždavo po refresh).
  if (action === 'reject') {
    if (videoId) {
      try {
        await sb.from('yt_discovery_candidates')
          .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
          .eq('video_id', videoId).eq('status', 'pending')
      } catch { /* lentelės gali nebūti */ }
    }
    return NextResponse.json({ ok: true, rejected: true })
  }

  if (!artist || !title) return NextResponse.json({ error: 'artist + title required' }, { status: 400 })

  // Pažymim YouTube discovery kandidatą 'approved', kad po pridėjimo dingtų iš
  // sąrašo ir nebegrįžtų perkrovus (anksčiau likdavo 'pending').
  async function markDiscoveryDone(vid: string | null, trackId: number | null) {
    if (!vid) return
    try {
      await sb.from('yt_discovery_candidates')
        .update({ status: 'approved', published_track_id: trackId, reviewed_at: new Date().toISOString() })
        .eq('video_id', vid).eq('status', 'pending')
    } catch { /* lentelės gali nebūti */ }
  }

  // Ar daina JAU kataloge pagal atlikėją+pavadinimą (ne tik video URL) — kad
  // jau turimų dainų nebekurtume iš naujo ir nerodytume kaip trūkstamų.
  async function findExistingByArtistTitle(): Promise<{ id: number; artist_id: number } | null> {
    const pa = primaryArtist(artist)
    if (!pa || !title) return null
    const { data: arts } = await sb.from('artists').select('id').ilike('name', pa).limit(1)
    if (!arts || !(arts as any[]).length) return null
    const { data: tr } = await sb.from('tracks').select('id, artist_id').eq('artist_id', (arts as any[])[0].id).ilike('title', title).limit(1)
    return tr && (tr as any[]).length ? { id: (tr as any[])[0].id, artist_id: (tr as any[])[0].artist_id } : null
  }

  if (action === 'create') {
    // DEDUP #1 — atlikėjas+pavadinimas jau kataloge → susiejam, nekuriam.
    const byName = await findExistingByArtistTitle()
    if (byName) {
      const linked = await linkSongAcrossCharts(sb, { trackId: byName.id, artistId: byName.artist_id, rawArtist: artist, rawTitle: title }).catch(() => 0)
      await markDiscoveryDone(videoId, byName.id)
      return NextResponse.json({ ok: true, trackId: byName.id, linked, deduped: true })
    }

    // DEDUP #2 — YouTube video jau priskirtas kokiai nors dainai → susiejam.
    try {
      const vids = await searchYouTube(`${artist} ${title}`)
      const top = vids[0]
      const vid = top?.videoId || videoId
      if (vid) {
        const { data: existing } = await sb.from('tracks').select('id, artist_id').ilike('video_url', `%${vid}%`).limit(1)
        if (existing && (existing as any[]).length) {
          const tr = (existing as any[])[0]
          const linked = await linkSongAcrossCharts(sb, { trackId: tr.id, artistId: tr.artist_id, rawArtist: artist, rawTitle: title }).catch(() => 0)
          await markDiscoveryDone(videoId, tr.id)
          return NextResponse.json({ ok: true, trackId: tr.id, linked, deduped: true })
        }
      }
    } catch { /* paieška nepavyko — tęsiam su create */ }

    const r = await commitChartTrack(artist, title, req.nextUrl.origin, { enrich: true })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 })
    const linked = await linkSongAcrossCharts(sb, { trackId: r.trackId, artistId: r.artistId, rawArtist: artist, rawTitle: title }).catch(() => 0)
    await markDiscoveryDone(videoId, r.trackId)
    return NextResponse.json({ ok: true, trackId: r.trackId, artistId: r.artistId, artistCreated: r.artistCreated, linked })
  }

  if (action === 'link') {
    const trackId = typeof body.trackId === 'number' ? body.trackId : parseInt(body.trackId, 10)
    if (!trackId) return NextResponse.json({ error: 'trackId required' }, { status: 400 })
    const { data: tr } = await sb.from('tracks').select('id, artist_id').eq('id', trackId).maybeSingle()
    if (!tr) return NextResponse.json({ error: 'track not found' }, { status: 404 })
    const linked = await linkSongAcrossCharts(sb, { trackId: (tr as any).id, artistId: (tr as any).artist_id, rawArtist: artist, rawTitle: title }).catch(() => 0)
    await markDiscoveryDone(videoId, (tr as any).id)
    return NextResponse.json({ ok: true, trackId: (tr as any).id, linked })
  }

  // YouTube siūlymas peržiūrai (embed) + dedup būsena + atlikėjo populiarumas.
  if (action === 'suggest') {
    let video: any = null
    try {
      const vids = await searchYouTube(`${artist} ${title}`)
      if (vids[0]?.videoId) video = { videoId: vids[0].videoId, title: vids[0].title, channel: vids[0].channel, duration: vids[0].duration }
    } catch { /* InnerTube gali būti blokuotas — grąžinam be video */ }

    // Atlikėjo populiarumas + ar jau kataloge (score)
    let artistInfo: any = null
    const pa = primaryArtist(artist)
    if (pa) {
      const { data: art } = await sb.from('artists').select('id, name, slug, score').ilike('name', pa).limit(1)
      if (art && (art as any[]).length) {
        const a = (art as any[])[0]
        artistInfo = { id: a.id, name: a.name, slug: a.slug, score: a.score ?? null }
      }
    }

    // Dedup: pirma pagal video URL, tada pagal atlikėją+pavadinimą (jau kataloge).
    let existingTrackId: number | null = null
    const vid = video?.videoId || videoId
    if (vid) {
      const { data } = await sb.from('tracks').select('id').ilike('video_url', `%${vid}%`).limit(1)
      if (data && (data as any[]).length) existingTrackId = (data as any[])[0].id
    }
    if (!existingTrackId) {
      const byName = await findExistingByArtistTitle()
      if (byName) existingTrackId = byName.id
    }
    return NextResponse.json({ ok: true, video, existingTrackId, artist: artistInfo })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
