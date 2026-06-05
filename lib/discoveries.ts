// lib/discoveries.ts
//
// „Muzikos atradimai" data sluoksnis. Skaito iš public.discoveries (+ tags,
// + artist join, + author profilis). Šaltinis — forumo gija paversta įrašais
// (žr. migr 20260605b_muzikos_atradimai*). Skaitymas per service role.

import { createAdminClient } from '@/lib/supabase'

export const ATRADIMAI_THREAD_ID = 128402

export type Discovery = {
  id: number
  legacy_msg_id: number | null
  created_at: string | null
  author_username: string | null
  author: { username: string | null; full_name: string | null; avatar_url: string | null } | null
  artist_name: string | null
  artist_id: number | null
  artist_slug: string | null
  artist_cover: string | null
  track_name: string | null
  album_name: string | null
  narrative: string | null
  embed_type: string | null   // youtube | spotify_track | spotify_album | spotify_artist
  embed_id: string | null
  spotify_id: string | null
  resolve_state: string        // resolved | needs_import | unresolved
  is_lt: boolean
  tags: string[]
}

export type DiscoveryFacets = {
  genres: string[]
  members: string[]
  years: string[]
  total: number
  needsImport: number
  withSpotify: number
}

// Visi atradimai (naujausi pirma) su tagais + atlikėjo slug + autoriaus profiliu.
export async function getDiscoveries(threadId: number = ATRADIMAI_THREAD_ID): Promise<Discovery[]> {
  const sb = createAdminClient()

  const { data, error } = await sb
    .from('discoveries')
    .select(
      'id, legacy_msg_id, created_at, author_username, author_id, artist_name, artist_id, ' +
      'track_name, album_name, narrative, embed_type, embed_id, spotify_id, resolve_state, is_lt, ' +
      'artists:artist_id(slug, name, cover_image_url)'
    )
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })

  if (error || !data) return []
  const rows = data as any[]
  if (rows.length === 0) return []

  // ── Tags (vienas query visiems) ──
  const ids = rows.map(r => r.id)
  const tagMap = new Map<number, string[]>()
  const { data: tagRows } = await sb
    .from('discovery_tags')
    .select('discovery_id, tag')
    .in('discovery_id', ids)
  for (const t of (tagRows || []) as any[]) {
    const arr = tagMap.get(t.discovery_id) || []
    arr.push(t.tag)
    tagMap.set(t.discovery_id, arr)
  }

  // ── Autorių profiliai (atskirai — author_id be FK į profiles) ──
  const authorIds = [...new Set(rows.map(r => r.author_id).filter(Boolean))]
  const profMap = new Map<string, any>()
  if (authorIds.length) {
    const { data: profs } = await sb
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .in('id', authorIds)
    for (const p of (profs || []) as any[]) profMap.set(p.id, p)
  }

  return rows.map(r => {
    const prof = r.author_id ? profMap.get(r.author_id) : null
    return {
      id: r.id,
      legacy_msg_id: r.legacy_msg_id,
      created_at: r.created_at,
      author_username: r.author_username,
      author: prof
        ? { username: prof.username, full_name: prof.full_name, avatar_url: prof.avatar_url }
        : (r.author_username ? { username: r.author_username, full_name: null, avatar_url: null } : null),
      artist_name: r.artist_name,
      artist_id: r.artist_id,
      artist_slug: r.artists?.slug ?? null,
      artist_cover: r.artists?.cover_image_url ?? null,
      track_name: r.track_name,
      album_name: r.album_name,
      narrative: r.narrative,
      embed_type: r.embed_type,
      embed_id: r.embed_id,
      spotify_id: r.spotify_id,
      resolve_state: r.resolve_state,
      is_lt: !!r.is_lt,
      tags: tagMap.get(r.id) || [],
    }
  })
}

export function buildFacets(items: Discovery[]): DiscoveryFacets {
  const genres = new Set<string>()
  const members = new Set<string>()
  const years = new Set<string>()
  let needsImport = 0, withSpotify = 0
  for (const d of items) {
    d.tags.forEach(t => genres.add(t))
    const m = d.author?.username || d.author_username
    if (m) members.add(m)
    if (d.created_at) years.add(d.created_at.slice(0, 4))
    if (d.resolve_state === 'needs_import' || d.is_lt) needsImport++
    if (d.spotify_id) withSpotify++
  }
  return {
    genres: [...genres].sort((a, b) => a.localeCompare(b)),
    members: [...members].sort((a, b) => a.localeCompare(b)),
    years: [...years].sort().reverse(),
    total: items.length,
    needsImport,
    withSpotify,
  }
}
