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
import { resolveTopasItems, linkTopasEntry, isNewItem, parseTopasFromContent, createEntityForEntry } from '@/lib/topas-resolve'

export const maxDuration = 60

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user as any).role || '')) return null
  return session
}

// list_item → UI entry su state
function entryView(e: any, i: number) {
  const isNew = isNewItem(e)
  if (!isNew) {
    return {
      rank: e?.position ?? i + 1,
      title: e?.track_title || e?.artist_name || '?',
      artist: e?.artist_name || null,
      type: e?.track_title ? 'track' : 'artist',
      entity_id: null, entity_slug: null, image_url: null,
      state: 'legacy' as const,
    }
  }
  const connected = e.entity_id != null
  const state = connected ? 'matched' : (e.match_state === 'artist_only' ? 'artist_only' : 'unmatched')
  return {
    rank: e.rank ?? i + 1,
    title: e.title || e.artist || '?',
    artist: e.artist || null,
    type: e.type || 'track',
    entity_id: e.entity_id ?? null,
    entity_slug: e.entity_slug ?? null,
    image_url: e.image_url ?? null,
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
      content_entries: parseTopasFromContent(b.content || '').length,
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

  // Importuoti įrašus iš content HTML (paryškintos „N. Atlikėjas – Pavadinimas" eilutės), tada automatch.
  if (action === 'import_from_content') {
    const parsed = parseTopasFromContent(post.content || '')
    if (!parsed.length) return NextResponse.json({ error: 'Tekste nerasta „N. Atlikėjas – Pavadinimas" įrašų' }, { status: 400 })
    const { items } = await resolveTopasItems(sb, parsed, { create: false })
    const { error } = await sb.from('blog_posts').update({ list_items: items, homepage_reviewed_at: new Date().toISOString() }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, imported: parsed.length, ...summarize(items) })
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

  // Sukurti ghost entitetą vienam įrašui (pagal rank).
  if (action === 'create_entry') {
    const rank = body.rank
    const e = list.find((x: any) => (x?.rank ?? x?.position) === rank)
    if (!e) return NextResponse.json({ error: 'įrašas nerastas' }, { status: 404 })
    const artist = e.artist || e.artist_name || ''
    const title = e.type === 'artist' ? null : (e.title || e.track_title || null)
    if (!artist) return NextResponse.json({ error: 'nėra atlikėjo' }, { status: 400 })
    const ent = await createEntityForEntry(sb, artist, title, e.type === 'artist')
    const items = list.map((x: any) => ((x?.rank ?? x?.position) === rank
      ? { rank, type: ent.type, entity_id: ent.entity_id, entity_slug: ent.entity_slug, title: x.title || x.track_title || artist, artist, image_url: ent.image_url, comment: x.comment ?? x.description ?? null, rating: x.rating ?? null, match_state: 'created' }
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
