// app/api/admin/music-requests/route.ts
//
// Vieninga „trūkstamos muzikos" eilė. Įvairūs šaltiniai (topai, radaras, top40,
// atradimai, įrašai) rašo į music_requests. Adminas mato išparsintą requestą +
// automatch + patogiai prideda atlikėją / albumą / dainą / susieja / atmeta.
//
//   GET ?status=pending|resolved|all & source=...
//   POST { action }
//     collect_topas                      — surinkti netur. įrašus iš vidinių topų
//     automatch { id } / automatch_all   — DB automatch
//     create_artist|create_album|create_track { id }
//     link { id, hit }                   — susieti su esama (search hit)
//     reject { id }

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  findConfidentMatch, findConfidentAlbumMatch, findOrCreateArtist,
  createTrackForArtist, createAlbumForArtist, normalizeForMatch, primaryArtist,
} from '@/lib/chart-resolve'
import { findArtistByName } from '@/lib/topas-resolve'

export const maxDuration = 60

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user as any).role || '')) return null
  return session
}
const isNew = (e: any) => !!e && ('rank' in e || 'entity_id' in e)
const normKey = (artist: string, title: string | null) => `${normalizeForMatch(primaryArtist(artist || ''))}|${normalizeForMatch(title || '')}`

// Viešos / admin nuorodos
function links(type: string | null, id: number | null, slug: string | null, artistSlug: string | null) {
  if (!type || !id) return { web: null as string | null, admin: null as string | null }
  if (type === 'artist') return { web: slug ? `/atlikejai/${slug}` : null, admin: `/admin/artists/${id}` }
  if (type === 'album') return { web: `/albumai/${[artistSlug, slug].filter(Boolean).join('-')}-${id}`, admin: `/admin/albums/${id}` }
  return { web: slug ? `/dainos/${slug}-${id}` : null, admin: `/admin/tracks/${id}` }
}

export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sb = createAdminClient()
  const url = new URL(req.url)
  const status = url.searchParams.get('status') || 'pending'
  const source = url.searchParams.get('source') || ''

  let q = sb.from('music_requests').select('*')
  if (status !== 'all') q = q.eq('status', status)
  if (source) q = q.eq('source', source)
  const { data, error } = await q.order('created_at', { ascending: false }).limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Matched entitetų nuorodos (batch)
  const rows = (data || []) as any[]
  const albIds = rows.filter(r => r.matched_type === 'album' && r.matched_id).map(r => r.matched_id)
  const trkIds = rows.filter(r => r.matched_type === 'track' && r.matched_id).map(r => r.matched_id)
  const artIds = [...rows.filter(r => r.matched_type === 'artist' && r.matched_id).map(r => r.matched_id), ...rows.filter(r => r.artist_id).map(r => r.artist_id)]
  const albMap = new Map<number, any>(); const trkMap = new Map<number, any>(); const artMap = new Map<number, any>()
  if (albIds.length) { const { data: d } = await sb.from('albums').select('id, slug, cover_image_url, artist:artist_id(slug)').in('id', albIds); for (const a of d || []) albMap.set(a.id, a) }
  if (trkIds.length) { const { data: d } = await sb.from('tracks').select('id, slug, cover_url').in('id', trkIds); for (const t of d || []) trkMap.set(t.id, t) }
  if (artIds.length) { const { data: d } = await sb.from('artists').select('id, slug, name').in('id', [...new Set(artIds)]); for (const a of d || []) artMap.set(a.id, a) }

  const items: any[] = rows.map(r => {
    const art = r.artist_id ? artMap.get(r.artist_id) : null
    let mtype = r.matched_type, mid = r.matched_id, mslug: string | null = null, mArtistSlug: string | null = null, cover: string | null = null
    if (mtype === 'album' && albMap.has(mid)) { const a = albMap.get(mid); mslug = a.slug; mArtistSlug = Array.isArray(a.artist) ? a.artist[0]?.slug : a.artist?.slug; cover = a.cover_image_url }
    else if (mtype === 'track' && trkMap.has(mid)) { const t = trkMap.get(mid); mslug = t.slug; cover = t.cover_url }
    else if (mtype === 'artist' && artMap.has(mid)) { mslug = artMap.get(mid).slug }
    return {
      id: r.id, source: r.source, raw_artist: r.raw_artist, raw_title: r.raw_title,
      kind_hint: r.kind_hint, status: r.status, context: r.context, artist_id: r.artist_id ?? null,
      artist_ok: r.artist_id != null, artist_name: art?.name || r.raw_artist,
      artist_web: art?.slug ? `/atlikejai/${art.slug}` : null, artist_admin: r.artist_id ? `/admin/artists/${r.artist_id}` : null,
      matched_type: mtype, matched_id: mid, matched_cover: cover, ...links(mtype, mid, mslug, mArtistSlug),
    }
  })
  // ── Tuščių atlikėjų KONTEKSTAS + PRIORITETAS ────────────────────────────
  // Kodėl atlikėjas svarbus? Pagal tai, kuriuose renginiuose/festivaliuose jis
  // dalyvauja: būsimo festivalio headlineris = aukščiausias prioritetas.
  const emptyItems = items.filter((it: any) => it.source === 'empty' && it.artist_id)
  if (emptyItems.length) {
    const eIds = emptyItems.map((it: any) => it.artist_id)
    const evByArtist = new Map<number, any[]>()
    for (let i = 0; i < eIds.length; i += 200) {
      const { data: ea } = await sb
        .from('event_artists')
        .select('artist_id, is_headliner, events(title, slug, start_date, end_date, is_festival, status)')
        .in('artist_id', eIds.slice(i, i + 200))
      for (const r of (ea || []) as any[]) {
        const ev = Array.isArray(r.events) ? r.events[0] : r.events
        if (!ev) continue
        const list = evByArtist.get(r.artist_id) || []
        list.push({ ...ev, is_headliner: r.is_headliner })
        evByArtist.set(r.artist_id, list)
      }
    }
    const today = new Date().toISOString().slice(0, 10)
    const isUpcoming = (ev: any) => (ev.end_date || ev.start_date || '').slice(0, 10) >= today
    for (const it of emptyItems) {
      const evs = (evByArtist.get(it.artist_id) || []).sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''))
      let prio = 0
      const events = evs.map(ev => {
        const up = isUpcoming(ev)
        const w = (ev.is_festival ? (up ? (ev.is_headliner ? 100 : 60) : (ev.is_headliner ? 22 : 12))
                                  : (up ? 40 : 5))
        prio = Math.max(prio, w)
        return { title: ev.title, slug: ev.slug, is_festival: !!ev.is_festival, is_headliner: !!ev.is_headliner, upcoming: up }
      })
      // +bonus už dalyvavimų skaičių
      prio += Math.min(15, Math.max(0, events.length - 1) * 3)
      it.events = events
      it.priority = prio
      it.priorityLabel = prio >= 70 ? 'Aukštas' : prio >= 35 ? 'Vidutinis' : 'Žemas'
    }
  }
  // Rikiavimas: tušti atlikėjai pagal prioritetą (svarbiausi viršuje), tada
  // kiti šaltiniai pagal created_at (jau atėjo desc iš užklausos).
  items.sort((a: any, b: any) => {
    const ae = a.source === 'empty', be = b.source === 'empty'
    if (ae && be) return (b.priority || 0) - (a.priority || 0)
    if (ae) return -1
    if (be) return 1
    return 0
  })

  // Šaltinių santrauka
  const { data: counts } = await sb.from('music_requests').select('source').eq('status', 'pending')
  const bySource: Record<string, number> = {}
  for (const c of (counts || []) as any[]) bySource[c.source] = (bySource[c.source] || 0) + 1
  return NextResponse.json({ items, bySource })
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const action = String(body.action || '')
  const sb = createAdminClient()

  // ── Surinkti iš vidinių topų (nesujungti įrašai) ──
  if (action === 'collect_topas') {
    const { data: posts } = await sb.from('blog_posts')
      .select('id, title, list_items').eq('post_type', 'topas').eq('status', 'published').limit(1000)
    const cands: any[] = []
    for (const p of (posts || []) as any[]) {
      const list = Array.isArray(p.list_items) ? p.list_items : []
      for (const e of list) {
        if (!isNew(e) || e.entity_id != null) continue
        const artist = e.artist || e.artist_name || ''
        const title = e.type === 'artist' ? null : (e.title || e.track_title || null)
        if (!artist) continue
        cands.push({
          source: 'topas', source_ref: p.id, raw_artist: artist, raw_title: title,
          kind_hint: e.type || 'track', artist_id: e.artist_id ?? null, artist_slug: e.artist_slug ?? null,
          context: p.title, norm_key: normKey(artist, title), status: 'pending',
        })
      }
    }
    // Dedup: per batch + prieš esamus pending
    const seen = new Set<string>(); const uniq: any[] = []
    for (const c of cands) { if (seen.has(c.norm_key)) continue; seen.add(c.norm_key); uniq.push(c) }
    const { data: existing } = await sb.from('music_requests').select('norm_key').eq('status', 'pending')
    const have = new Set<string>((existing || []).map((x: any) => x.norm_key))
    const toInsert = uniq.filter(c => !have.has(c.norm_key))
    let inserted = 0
    for (let i = 0; i < toInsert.length; i += 200) {
      const chunk = toInsert.slice(i, i + 200)
      const { error } = await sb.from('music_requests').insert(chunk)
      if (!error) inserted += chunk.length
    }
    return NextResponse.json({ ok: true, scanned: cands.length, inserted })
  }

  // ── Surinkti TUŠČIUS atlikėjus (DB yra, bet be muzikos ir nuotraukos) ──
  // Scope: atlikėjai, dalyvaujantys renginiuose (event_artists) — pvz. festivalių
  // line-up'ai — kurie neturi nei cover_image_url, nei dainų. Šitie „stub'ai"
  // šviečia raudonai, kol adminas jų nesutvarko ir nepažymi „Sutvarkyta".
  if (action === 'collect_empty_artists') {
    const { data: ea } = await sb.from('event_artists').select('artist_id')
    const ids = [...new Set(((ea || []) as any[]).map(r => r.artist_id).filter(Boolean))]
    if (!ids.length) return NextResponse.json({ ok: true, scanned: 0, inserted: 0 })
    // atlikėjai be cover'io
    const noCover: any[] = []
    for (let i = 0; i < ids.length; i += 300) {
      const { data } = await sb.from('artists').select('id, name, slug, cover_image_url').in('id', ids.slice(i, i + 300))
      for (const a of (data || []) as any[]) if (!a.cover_image_url) noCover.push(a)
    }
    // kurie neturi dainų
    const haveTracks = new Set<number>()
    const ncIds = noCover.map(a => a.id)
    for (let i = 0; i < ncIds.length; i += 300) {
      const { data } = await sb.from('tracks').select('artist_id').in('artist_id', ncIds.slice(i, i + 300))
      for (const t of (data || []) as any[]) haveTracks.add(t.artist_id)
    }
    const empty = noCover.filter(a => !haveTracks.has(a.id))
    // dedup vs esami (bet kokio statuso — kad sutvarkytų/atmestų nebegrąžintume)
    const { data: existing } = await sb.from('music_requests').select('artist_id').eq('source', 'empty')
    const have = new Set<number>(((existing || []) as any[]).map(x => x.artist_id))
    const toInsert = empty.filter(a => !have.has(a.id)).map(a => ({
      source: 'empty', artist_id: a.id, artist_slug: a.slug, raw_artist: a.name, raw_title: null,
      kind_hint: 'empty', context: 'Atlikėjas be muzikos ir nuotraukos',
      matched_type: 'artist', matched_id: a.id, status: 'pending', norm_key: `empty|${a.id}`,
    }))
    let inserted = 0
    for (let i = 0; i < toInsert.length; i += 200) {
      const { error } = await sb.from('music_requests').insert(toInsert.slice(i, i + 200))
      if (!error) inserted += Math.min(200, toInsert.length - i)
    }
    return NextResponse.json({ ok: true, scanned: empty.length, inserted })
  }

  // ── Bulk automatch ──
  if (action === 'automatch_all') {
    const { data: pend } = await sb.from('music_requests').select('id, raw_artist, raw_title, kind_hint').eq('status', 'pending').limit(300)
    let matched = 0
    const rows = (pend || []) as any[]
    for (let i = 0; i < rows.length; i += 8) {
      await Promise.all(rows.slice(i, i + 8).map(async (r) => {
        const res = await tryMatch(sb, r.raw_artist, r.raw_title, r.kind_hint)
        if (res) { await resolve(sb, r.id, res); matched++ }
      }))
    }
    return NextResponse.json({ ok: true, matched })
  }

  const id = body.id
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data: r } = await sb.from('music_requests').select('*').eq('id', id).maybeSingle()
  if (!r) return NextResponse.json({ error: 'not found' }, { status: 404 })

  if (action === 'reject') {
    await sb.from('music_requests').update({ status: 'rejected', resolved_at: new Date().toISOString() }).eq('id', id)
    return NextResponse.json({ ok: true })
  }
  // Pažymėti „Sutvarkyta" — naudojam tuščių atlikėjų eilei (DB jau yra, adminas
  // pridėjo muziką/nuotrauką ir pažymi, kad išspręsta).
  if (action === 'mark_fixed') {
    await sb.from('music_requests').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', id)
    return NextResponse.json({ ok: true })
  }
  if (action === 'automatch') {
    const res = await tryMatch(sb, r.raw_artist, r.raw_title, r.kind_hint)
    if (!res) return NextResponse.json({ ok: true, matched: false })
    await resolve(sb, id, res)
    return NextResponse.json({ ok: true, matched: true })
  }
  if (action === 'create_artist') {
    const aid = await findOrCreateArtist(sb, r.raw_artist, null)
    const { data: a } = await sb.from('artists').select('slug').eq('id', aid).maybeSingle()
    await sb.from('music_requests').update({ artist_id: aid, artist_slug: a?.slug || null, matched_type: 'artist', matched_id: aid, status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', id)
    return NextResponse.json({ ok: true })
  }
  if (action === 'create_album') {
    const aid = await findOrCreateArtist(sb, r.raw_artist, null)
    const albId = await createAlbumForArtist(sb, aid, r.raw_title || r.raw_artist)
    const { data: a } = await sb.from('artists').select('slug').eq('id', aid).maybeSingle()
    await sb.from('music_requests').update({ artist_id: aid, artist_slug: a?.slug || null, matched_type: 'album', matched_id: albId, status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', id)
    return NextResponse.json({ ok: true })
  }
  if (action === 'create_track') {
    const aid = await findOrCreateArtist(sb, r.raw_artist, null)
    const tId = await createTrackForArtist(sb, aid, r.raw_title || r.raw_artist)
    const { data: a } = await sb.from('artists').select('slug').eq('id', aid).maybeSingle()
    await sb.from('music_requests').update({ artist_id: aid, artist_slug: a?.slug || null, matched_type: 'track', matched_id: tId, status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', id)
    return NextResponse.json({ ok: true })
  }
  if (action === 'link') {
    const h = body.hit
    if (!h?.id) return NextResponse.json({ error: 'hit required' }, { status: 400 })
    const map: Record<string, string> = { daina: 'track', grupe: 'artist', albumas: 'album', track: 'track', artist: 'artist', album: 'album' }
    const mt = map[h.type] || 'track'
    await sb.from('music_requests').update({ matched_type: mt, matched_id: h.id, status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', id)
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'bad action' }, { status: 400 })
}

async function tryMatch(sb: any, artist: string, title: string | null, kind: string): Promise<{ type: string; id: number; artistId?: number } | null> {
  if (kind === 'artist' || !title) {
    const a = await findArtistByName(sb, artist).catch(() => null)
    return a ? { type: 'artist', id: a.id } : null
  }
  const al = await findConfidentAlbumMatch(sb, artist, title).catch(() => null)
  if (al) return { type: 'album', id: al.albumId, artistId: al.artistId }
  const tr = await findConfidentMatch(sb, artist, title).catch(() => null)
  if (tr) return { type: 'track', id: tr.trackId, artistId: tr.artistId }
  const a = await findArtistByName(sb, artist).catch(() => null)
  return a ? { type: 'artist', id: a.id } : null
}
async function resolve(sb: any, id: string, res: { type: string; id: number; artistId?: number }) {
  const upd: any = { matched_type: res.type, matched_id: res.id, status: 'resolved', resolved_at: new Date().toISOString() }
  if (res.type === 'artist') { upd.artist_id = res.id }
  else if (res.artistId) { upd.artist_id = res.artistId }
  await sb.from('music_requests').update(upd).eq('id', id)
}
