// lib/discoveries.ts
//
// „Muzikos atradimai" data sluoksnis. ATRADIMAS = KOMENTARAS: discoveries
// jungiasi prie public.comments (pilnas body, like_count, autorius, data,
// atsakymai). Embed'as — iš discoveries (parsed iš forum_posts.content_html).
// Šaltinis: gija 128402 = discussion 47. Skaitymas per service role.

import { createAdminClient } from '@/lib/supabase'

export const ATRADIMAI_THREAD_ID = 128402
export const ATRADIMAI_DISCUSSION_ID = 47

export type Discovery = {
  id: number
  comment_id: number | null
  created_at: string | null
  body: string | null
  like_count: number | null
  author: { username: string | null; full_name: string | null; avatar_url: string | null } | null
  artist_name: string | null
  artist_id: number | null
  artist_slug: string | null
  track_name: string | null
  track_id: number | null
  track_slug: string | null
  album_name: string | null
  album_id: number | null
  album_slug: string | null
  embed_type: string | null
  embed_id: string | null
  resolve_state: string
  is_lt: boolean
  tags: string[]
}

export type DiscoveryReply = {
  id: number
  body: string | null
  created_at: string | null
  like_count: number | null
  author: { username: string | null; full_name: string | null; avatar_url: string | null } | null
}

export type DiscoveryFacets = {
  genres: string[]
  members: string[]
  total: number
}

const SELECT =
  'id, comment_id, created_at, author_id, artist_name, artist_id, track_name, track_id, ' +
  'album_name, album_id, embed_type, embed_id, resolve_state, is_lt, ' +
  'comments:comment_id(body, like_count), ' +
  'artists:artist_id(slug, name), tracks:track_id(slug, title), albums:album_id(slug, title)'

async function attachTagsAndAuthors(sb: any, rows: any[]): Promise<Discovery[]> {
  if (rows.length === 0) return []
  const ids = rows.map(r => r.id)
  const tagMap = new Map<number, string[]>()
  const { data: tagRows } = await sb.from('discovery_tags').select('discovery_id, tag').in('discovery_id', ids)
  for (const t of (tagRows || []) as any[]) {
    const arr = tagMap.get(t.discovery_id) || []; arr.push(t.tag); tagMap.set(t.discovery_id, arr)
  }
  const authorIds = [...new Set(rows.map(r => r.author_id).filter(Boolean))]
  const profMap = new Map<string, any>()
  if (authorIds.length) {
    const { data: profs } = await sb.from('profiles').select('id, username, full_name, avatar_url').in('id', authorIds)
    for (const p of (profs || []) as any[]) profMap.set(p.id, p)
  }
  return rows.map(r => {
    const prof = r.author_id ? profMap.get(r.author_id) : null
    return {
      id: r.id,
      comment_id: r.comment_id,
      created_at: r.created_at,
      body: r.comments?.body ?? null,
      like_count: r.comments?.like_count ?? 0,
      author: prof ? { username: prof.username, full_name: prof.full_name, avatar_url: prof.avatar_url } : null,
      artist_name: r.artist_name ?? r.artists?.name ?? null,
      artist_id: r.artist_id,
      artist_slug: r.artists?.slug ?? null,
      track_name: r.track_name ?? r.tracks?.title ?? null,
      track_id: r.track_id,
      track_slug: r.tracks?.slug ?? null,
      album_name: r.album_name ?? r.albums?.title ?? null,
      album_id: r.album_id,
      album_slug: r.albums?.slug ?? null,
      embed_type: r.embed_type,
      embed_id: r.embed_id,
      resolve_state: r.resolve_state,
      is_lt: !!r.is_lt,
      tags: tagMap.get(r.id) || [],
    } as Discovery
  })
}

// Visi atradimai (naujausi pirma) su komentaru, autoriumi, tagais.
export async function getDiscoveries(threadId: number = ATRADIMAI_THREAD_ID): Promise<Discovery[]> {
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('discoveries')
    .select(SELECT)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
  if (error || !data) return []
  return attachTagsAndAuthors(sb, data as any[])
}

// Vienas atradimas + jo atsakymai (komentarai su parent_id = comment_id).
export async function getDiscovery(id: number): Promise<{ discovery: Discovery; replies: DiscoveryReply[] } | null> {
  const sb = createAdminClient()
  const { data, error } = await sb.from('discoveries').select(SELECT).eq('id', id).maybeSingle()
  if (error || !data) return null
  const [discovery] = await attachTagsAndAuthors(sb, [data as any])
  if (!discovery) return null

  let replies: DiscoveryReply[] = []
  if (discovery.comment_id) {
    const { data: rep } = await sb
      .from('comments')
      .select('id, body, created_at, like_count, author_id')
      .eq('parent_id', discovery.comment_id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
    const rows = (rep || []) as any[]
    const authorIds = [...new Set(rows.map(r => r.author_id).filter(Boolean))]
    const profMap = new Map<string, any>()
    if (authorIds.length) {
      const { data: profs } = await sb.from('profiles').select('id, username, full_name, avatar_url').in('id', authorIds)
      for (const p of (profs || []) as any[]) profMap.set(p.id, p)
    }
    replies = rows.map(r => {
      const prof = r.author_id ? profMap.get(r.author_id) : null
      return {
        id: r.id, body: r.body, created_at: r.created_at, like_count: r.like_count,
        author: prof ? { username: prof.username, full_name: prof.full_name, avatar_url: prof.avatar_url } : null,
      }
    })
  }
  return { discovery, replies }
}

export function buildFacets(items: Discovery[]): DiscoveryFacets {
  const genres = new Set<string>()
  const members = new Set<string>()
  for (const d of items) {
    d.tags.forEach(t => genres.add(t))
    const m = d.author?.username
    if (m) members.add(m)
  }
  return {
    genres: [...genres].sort((a, b) => a.localeCompare(b)),
    members: [...members].sort((a, b) => a.localeCompare(b)),
    total: items.length,
  }
}

// Relatyvi data lietuviškai; >1 metų → null (nerodom).
export function relativeLt(d?: string | null): string | null {
  if (!d) return null
  const ms = Date.now() - new Date(d).getTime()
  if (ms < 0) return 'ką tik'
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'ką tik'
  if (min < 60) return `prieš ${min} min.`
  const h = Math.floor(min / 60)
  if (h < 24) return `prieš ${h} val.`
  const days = Math.floor(h / 24)
  if (days < 7) return `prieš ${days} d.`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `prieš ${weeks} sav.`
  const months = Math.floor(days / 30)
  if (months < 12) return `prieš ${months} mėn.`
  return null // > metų — nerodom
}
