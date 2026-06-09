// app/api/admin/topai-vidiniai/route.ts
//
// Vidinių narių topų susiejimo + patvirtinimo eilė (kaip išoriniai topai).
// Topas patenka čia automatiškai, kai įrašas pažymimas post_type='topas'.
//
//   GET ?view=todo|approved|all & include_hidden=0|1 & offset & limit
//       → topas postai su entries (per-įrašo match state) ir approval būsena.
//   POST { id, action }
//       action='automatch'      — DB automatch (be kūrimo)
//       action='create_missing' — sukurti ghost atlikėją+dainą trūkstamiems
//       action='link_entry', rank, hit  — susieti vieną įrašą su konkrečiu entitetu
//       action='approve' | 'unapprove'  — patvirtinti / atšaukti (homepage gate)

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveTopasItems, linkTopasEntry, isNewItem, parseTopasArticle, createEntityForEntry, findArtistByName } from '@/lib/topas-resolve'
import { findConfidentMatch, findOrCreateArtist } from '@/lib/chart-resolve'

const YT_RE2 = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/
const ytThumb2 = (u?: string | null) => { const m = u?.match?.(YT_RE2)?.[1]; return m ? `https://img.youtube.com/vi/${m}/mqdefault.jpg` : null }
const firstOf = (v: any) => Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

export const maxDuration = 60

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user as any).role || '')) return null
  return session
}

// list_item → UI entry su state (+ atskiri atlikėjo / entiteto statusai ir nuorodos)
function entryView(e: any, i: number) {
  const isNew = isNewItem(e)
  const rank = isNew ? (e.rank ?? i + 1) : (e?.position ?? i + 1)
  const type = isNew ? (e.type || 'track') : (e?.track_title ? 'track' : 'artist')
  const title = isNew ? (e.title || e.artist || '?') : (e?.track_title || e?.artist_name || '?')
  const artist = isNew ? (e.artist || null) : (e?.artist_name || null)
  const entity_id = isNew ? (e.entity_id ?? null) : null
  const entity_slug = isNew ? (e.entity_slug ?? null) : null
  const artist_id = isNew ? (e.artist_id ?? e.artist_id_hint ?? null) : null
  const artist_slug = isNew ? (e.artist_slug ?? null) : null

  const artist_ok = artist_id != null
  const entity_ok = entity_id != null
  // Viešos + admin nuorodos (open in new tab)
  const web_href =
    type === 'artist' ? (artist_slug ? `/atlikejai/${artist_slug}` : null)
    : type === 'album' && entity_id ? `/albumai/${[artist_slug, entity_slug].filter(Boolean).join('-')}-${entity_id}`
    : type === 'track' && entity_id && entity_slug ? `/dainos/${entity_slug}-${entity_id}`
    : null
  const admin_href =
    type === 'artist' && artist_id ? `/admin/artists/${artist_id}`
    : type === 'album' && entity_id ? `/admin/albums/${entity_id}`
    : type === 'track' && entity_id ? `/admin/tracks/${entity_id}`
    : null
  const artist_web = artist_slug ? `/atlikejai/${artist_slug}` : null
  const artist_admin = artist_id ? `/admin/artists/${artist_id}` : null

  const state = isNew
    ? (entity_ok ? 'matched' : (artist_ok ? 'artist_only' : 'unmatched'))
    : 'legacy' as const
  return {
    rank, title, artist, type,
    entity_id, entity_slug, image_url: isNew ? (e.image_url ?? null) : null,
    artist_id, artist_slug, artist_ok, entity_ok,
    web_href, admin_href, artist_web, artist_admin,
    state,
  }
}

function summarize(list: any[]) {
  const arr = Array.isArray(list) ? list : []
  const entries = arr.map(entryView)
  const connected = entries.filter(e => e.entity_id != null).length
  const legacy = entries.filter(e => e.state === 'legacy').length
  return { entries, total: entries.length, connected, unconnected: entries.length - connected, legacy }
}

export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sb = createAdminClient()
  const url = new URL(req.url)
  const view = url.searchParams.get('view') || 'todo' // todo=neapprove'inti, approved, all
  const includeHidden = url.searchParams.get('include_hidden') === '1'
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '40', 10) || 40, 100)
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0)

  const join = includeHidden
    ? 'blogs:blog_id(slug, profiles:user_id(username, full_name, hide_from_homepage))'
    : 'blogs:blog_id!inner(slug, profiles:user_id!inner(username, full_name, hide_from_homepage))'

  let q = sb.from('blog_posts')
    .select(`id, slug, title, status, published_at, created_at, list_items, topas_approved_at, content, ${join}`)
    .eq('post_type', 'topas')
    .eq('status', 'published')
  if (!includeHidden) q = q.not('blogs.profiles.hide_from_homepage', 'is', true)
  if (view === 'todo') q = q.is('topas_approved_at', null)
  if (view === 'approved') q = q.not('topas_approved_at', 'is', null)

  const { data, error } = await q
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const items = (data || []).map((b: any) => {
    const prof = Array.isArray(b.blogs?.profiles) ? b.blogs.profiles[0] : b.blogs?.profiles
    const s = summarize(b.list_items)
    return {
      id: b.id, title: b.title || '(be pavadinimo)',
      blog_slug: b.blogs?.slug || prof?.username || null, slug: b.slug,
      author: prof?.username || prof?.full_name || null,
      hidden: !!prof?.hide_from_homepage,
      approved: !!b.topas_approved_at,
      published_at: b.published_at,
      content_entries: parseTopasArticle(b.content || '').entries.length,
      ...s,
    }
  })
  return NextResponse.json({ items, hasMore: (data || []).length === limit, offset, limit })
}

const HIT_TYPE: Record<string, 'track' | 'artist' | 'album'> = {
  daina: 'track', grupe: 'artist', albumas: 'album', track: 'track', artist: 'artist', album: 'album',
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const id = body.id; const action = String(body.action || '')
  if (!id || !action) return NextResponse.json({ error: 'id + action required' }, { status: 400 })
  const sb = createAdminClient()

  if (action === 'approve' || action === 'unapprove') {
    const { error } = await sb.from('blog_posts')
      .update({ topas_approved_at: action === 'approve' ? new Date().toISOString() : null }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, approved: action === 'approve' })
  }

  const { data: post } = await sb.from('blog_posts').select('id, post_type, list_items, content').eq('id', id).maybeSingle()
  if (!post || post.post_type !== 'topas') return NextResponse.json({ error: 'ne topas' }, { status: 400 })
  let list = Array.isArray(post.list_items) ? post.list_items : []

  // Importuoti iš content HTML: protingas parseris (aprašymai, žanrai, įžanga/pabaiga),
  // legacy_id nuorodų rezoliucija (tiksli + albumo cover) + text fallback.
  if (action === 'import_from_content') {
    const parsed = parseTopasArticle(post.content || '')
    if (!parsed.entries.length) return NextResponse.json({ error: 'Tekste nerasta „N. Atlikėjas – Pavadinimas" įrašų' }, { status: 400 })

    const albumLids = [...new Set(parsed.entries.filter(e => e.legacyType === 'album' && e.legacyId).map(e => e.legacyId!))]
    const trackLids = [...new Set(parsed.entries.filter(e => e.legacyType === 'track' && e.legacyId).map(e => e.legacyId!))]
    const albumMap = new Map<number, any>(); const trackMap = new Map<number, any>()
    if (albumLids.length) {
      const { data } = await sb.from('albums').select('id, legacy_id, slug, cover_image_url, artist:artist_id(id, name, slug)').in('legacy_id', albumLids)
      for (const a of (data || []) as any[]) albumMap.set(a.legacy_id, a)
    }
    if (trackLids.length) {
      const { data } = await sb.from('tracks').select('id, legacy_id, slug, cover_url, video_url, artist:artist_id(id, name, slug, cover_image_url)').in('legacy_id', trackLids)
      for (const t of (data || []) as any[]) trackMap.set(t.legacy_id, t)
    }

    // Pirmas praėjimas: legacy resolve; nerastiems — text match (chunked).
    const items: any[] = new Array(parsed.entries.length)
    const needText: number[] = []
    parsed.entries.forEach((e, i) => {
      const base = { rank: e.rank, title: e.title, artist: e.artist, comment: e.description || null, genres: e.genres, rating: null }
      if (e.legacyType === 'album' && albumMap.has(e.legacyId!)) {
        const a = albumMap.get(e.legacyId!); const ar = firstOf(a.artist)
        items[i] = { ...base, type: 'album', entity_id: a.id, entity_slug: a.slug || null, image_url: a.cover_image_url || null, artist: ar?.name || e.artist, artist_id: ar?.id || null, artist_slug: ar?.slug || null, match_state: 'matched' }
      } else if (e.legacyType === 'track' && trackMap.has(e.legacyId!)) {
        const t = trackMap.get(e.legacyId!); const ar = firstOf(t.artist)
        items[i] = { ...base, type: 'track', entity_id: t.id, entity_slug: t.slug || null, image_url: ytThumb2(t.video_url) || t.cover_url || ar?.cover_image_url || null, artist: ar?.name || e.artist, artist_id: ar?.id || null, artist_slug: ar?.slug || null, match_state: 'matched' }
      } else {
        items[i] = { ...base, type: e.legacyType === 'album' ? 'album' : 'track', entity_id: null, entity_slug: null, image_url: null, artist_id: null, artist_slug: null, match_state: 'unmatched' }
        needText.push(i)
      }
    })
    // Text match leftovers (tik dainoms) — chunked
    for (let s = 0; s < needText.length; s += 8) {
      await Promise.all(needText.slice(s, s + 8).map(async (i) => {
        const e = parsed.entries[i]
        const fm = await findConfidentMatch(sb, e.artist, e.title).catch(() => null)
        if (fm) items[i] = { ...items[i], type: 'track', entity_id: fm.trackId, artist_id: fm.artistId, match_state: 'matched' }
      }))
    }
    // Cover/slug text-matched dainoms
    const txtIds = [...new Set(items.filter(it => it.match_state === 'matched' && it.type === 'track' && !it.entity_slug && it.entity_id).map(it => it.entity_id))]
    if (txtIds.length) {
      const { data } = await sb.from('tracks').select('id, slug, cover_url, video_url, artist:artist_id(id, slug, cover_image_url)').in('id', txtIds)
      const mp = new Map<number, any>((data || []).map((t: any) => [t.id, t]))
      for (const it of items) {
        if (it.entity_id && mp.has(it.entity_id)) {
          const t = mp.get(it.entity_id); const ar = firstOf(t.artist)
          it.entity_slug = t.slug || null; it.image_url = it.image_url || ytThumb2(t.video_url) || t.cover_url || ar?.cover_image_url || null
          if (!it.artist_id && ar?.id) { it.artist_id = ar.id; it.artist_slug = ar.slug || null }
        }
      }
    }
    // Atlikėjo rezoliucija įrašams, kuriems vis dar nėra artist_id (radom atlikėją, bet ne entitetą)
    const needArtist = items.map((it, i) => (!it.artist_id ? i : -1)).filter(i => i >= 0)
    for (let s = 0; s < needArtist.length; s += 8) {
      await Promise.all(needArtist.slice(s, s + 8).map(async (i) => {
        const a = await findArtistByName(sb, items[i].artist || '').catch(() => null)
        if (a) { items[i].artist_id = a.id; items[i].artist_slug = a.slug || null; if (items[i].match_state === 'unmatched') items[i].match_state = 'artist_only' }
      }))
    }

    const topas_meta = { intro: parsed.intro || null, outro: parsed.outro || null, parsed_at: new Date().toISOString() }
    const { error } = await sb.from('blog_posts')
      .update({ list_items: items, topas_meta, homepage_reviewed_at: new Date().toISOString() }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, imported: parsed.entries.length, ...summarize(items) })
  }

  if (action === 'automatch' || action === 'create_missing') {
    if (!list.length) return NextResponse.json({ error: 'Topas neturi struktūrintų įrašų. Spausk „Importuoti iš teksto" arba pridėk rankiniu būdu.' }, { status: 400 })
    const { items, summary } = await resolveTopasItems(sb, list, { create: action === 'create_missing' })
    const { error } = await sb.from('blog_posts')
      .update({ list_items: items, homepage_reviewed_at: new Date().toISOString() }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, summary, ...summarize(items) })
  }

  if (action === 'link_entry') {
    const rank = body.rank; const h = body.hit
    if (rank == null || !h?.id) return NextResponse.json({ error: 'rank + hit required' }, { status: 400 })
    const hit = { type: HIT_TYPE[h.type] || 'track', id: h.id, slug: h.slug ?? null, title: h.title || '', artist: h.artist ?? null, image_url: h.image_url ?? null }
    const items = await linkTopasEntry(sb, list, rank, hit)
    const { error } = await sb.from('blog_posts').update({ list_items: items }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, ...summarize(items) })
  }

  // Sukurti ghost entitetą vienam įrašui (pagal rank) — atlikėjas + daina/albumas.
  if (action === 'create_entry') {
    const rank = body.rank
    const e = list.find((x: any) => (x?.rank ?? x?.position) === rank)
    if (!e) return NextResponse.json({ error: 'įrašas nerastas' }, { status: 404 })
    const artist = e.artist || e.artist_name || ''
    const title = e.type === 'artist' ? null : (e.title || e.track_title || null)
    if (!artist) return NextResponse.json({ error: 'nėra atlikėjo' }, { status: 400 })
    const ent = await createEntityForEntry(sb, artist, title, e.type === 'artist')
    const a = await findArtistByName(sb, artist).catch(() => null)
    const items = list.map((x: any) => ((x?.rank ?? x?.position) === rank
      ? { ...x, rank, type: ent.type, entity_id: ent.entity_id, entity_slug: ent.entity_slug, title: x.title || x.track_title || artist, artist, image_url: ent.image_url, artist_id: a?.id ?? x.artist_id ?? null, artist_slug: a?.slug ?? x.artist_slug ?? null, comment: x.comment ?? x.description ?? null, rating: x.rating ?? null, genres: x.genres ?? null, match_state: 'created' }
      : x))
    const { error } = await sb.from('blog_posts').update({ list_items: items }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, ...summarize(items) })
  }

  // Sukurti TIK atlikėją (be dainos/albumo) — kaip external topuose.
  if (action === 'create_artist') {
    const rank = body.rank
    const e = list.find((x: any) => (x?.rank ?? x?.position) === rank)
    if (!e) return NextResponse.json({ error: 'įrašas nerastas' }, { status: 404 })
    const artist = e.artist || e.artist_name || ''
    if (!artist) return NextResponse.json({ error: 'nėra atlikėjo' }, { status: 400 })
    const aid = await findOrCreateArtist(sb, artist, null)
    const { data: ar } = await sb.from('artists').select('slug').eq('id', aid).maybeSingle()
    const items = list.map((x: any) => ((x?.rank ?? x?.position) === rank
      ? { ...x, artist_id: aid, artist_slug: ar?.slug ?? null, match_state: x.entity_id ? x.match_state : 'artist_only' }
      : x))
    const { error } = await sb.from('blog_posts').update({ list_items: items }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, ...summarize(items) })
  }

  // Pridėti naują įrašą iš paieškos (append gale).
  if (action === 'add_entry') {
    const h = body.hit
    if (!h?.id) return NextResponse.json({ error: 'hit required' }, { status: 400 })
    const maxRank = list.reduce((mx: number, x: any) => Math.max(mx, x?.rank ?? x?.position ?? 0), 0)
    const newItem = {
      rank: maxRank + 1, type: HIT_TYPE[h.type] || 'track',
      entity_id: h.id, entity_slug: h.slug ?? null,
      title: h.title || '', artist: h.artist ?? null, image_url: h.image_url ?? null,
      comment: null, rating: null, match_state: 'matched',
    }
    const items = [...list, newItem]
    const { error } = await sb.from('blog_posts').update({ list_items: items }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, ...summarize(items) })
  }

  // Pašalinti įrašą (pagal rank).
  if (action === 'remove_entry') {
    const rank = body.rank
    const items = list.filter((x: any) => (x?.rank ?? x?.position) !== rank)
    const { error } = await sb.from('blog_posts').update({ list_items: items }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, ...summarize(items) })
  }

  return NextResponse.json({ error: 'bad action' }, { status: 400 })
}
