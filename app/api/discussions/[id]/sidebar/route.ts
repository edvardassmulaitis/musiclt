// app/api/discussions/[id]/sidebar/route.ts
//
// Sidebar metadata for a discussion page — top contributors + mentioned tracks.
// Used to be inline server-side fetch in the page, but blocked SSR for 2-3s on
// big threads (paginated counts over 17k+ comments). Now: page renders shell
// instantly, this endpoint fills sidebar via client-side fetch.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

type TopContributor = {
  id: string
  username: string | null
  full_name: string | null
  avatar_url: string | null
  count: number
}

type MentionedTrack = {
  id: number
  legacy_id: number | null
  slug: string
  title: string
  cover_url: string | null
  artist_name: string | null
  artist_slug: string | null
  mention_count: number
}

async function getTopContributors(discussionId: number): Promise<TopContributor[]> {
  const sb = createAdminClient()
  const counts = new Map<string, number>()
  let offset = 0
  const limit = 1000
  for (let page = 0; page < 50; page++) {
    const { data } = await sb
      .from('comments')
      .select('author_id')
      .eq('discussion_id', discussionId)
      .eq('is_deleted', false)
      .not('author_id', 'is', null)
      .range(offset, offset + limit - 1)
    if (!data || data.length === 0) break
    for (const r of data as Array<{ author_id: string | null }>) {
      if (r.author_id) counts.set(r.author_id, (counts.get(r.author_id) || 0) + 1)
    }
    if (data.length < limit) break
    offset += limit
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  if (top.length === 0) return []
  const ids = top.map(([id]) => id)
  const { data: profiles } = await sb
    .from('profiles')
    .select('id,username,full_name,avatar_url')
    .in('id', ids)
  const profMap = new Map<string, any>((profiles || []).map((p: any) => [p.id, p]))
  return top.map(([id, count]) => {
    const p = profMap.get(id) || {}
    return {
      id, count,
      username: p.username || null,
      full_name: p.full_name || null,
      avatar_url: p.avatar_url || null,
    }
  })
}

async function getMentionedTracks(discussionId: number): Promise<MentionedTrack[]> {
  const sb = createAdminClient()
  const modernIdCounts = new Map<number, { count: number; preview: any }>()
  const legacyIdCounts = new Map<number, number>()

  let offset = 0
  const limit = 1000
  for (let page = 0; page < 50; page++) {
    const { data } = await sb
      .from('comments')
      .select('body, music_attachments')
      .eq('discussion_id', discussionId)
      .eq('is_deleted', false)
      .or('body.ilike.%/lt/daina/%,music_attachments.not.is.null')
      .range(offset, offset + limit - 1)
    if (!data || data.length === 0) break
    for (const r of data as Array<{ body: string | null; music_attachments: any }>) {
      const atts = Array.isArray(r.music_attachments) ? r.music_attachments : null
      if (atts) {
        const seenInComment = new Set<number>()
        for (const a of atts) {
          if (a?.type === 'daina' && typeof a.id === 'number') {
            if (seenInComment.has(a.id)) continue
            seenInComment.add(a.id)
            const cur = modernIdCounts.get(a.id)
            if (cur) cur.count += 1
            else modernIdCounts.set(a.id, { count: 1, preview: a })
          }
        }
      }
      const body = r.body || ''
      if (body.includes('/lt/daina/')) {
        const re = /\/lt\/daina\/[^/\s]+\/(\d+)\//g
        let m: RegExpExecArray | null
        const seen = new Set<number>()
        while ((m = re.exec(body)) !== null) {
          const id = parseInt(m[1], 10)
          if (!Number.isFinite(id) || seen.has(id)) continue
          seen.add(id)
          legacyIdCounts.set(id, (legacyIdCounts.get(id) || 0) + 1)
        }
      }
    }
    if (data.length < limit) break
    offset += limit
  }

  const modernIds = [...modernIdCounts.keys()]
  const legacyIds = [...legacyIdCounts.keys()]

  const lookups = await Promise.all([
    modernIds.length
      ? sb.from('tracks').select('id,legacy_id,slug,title,cover_url,artists!tracks_artist_id_fkey(name,slug)').in('id', modernIds)
      : Promise.resolve({ data: [] }),
    legacyIds.length
      ? sb.from('tracks').select('id,legacy_id,slug,title,cover_url,artists!tracks_artist_id_fkey(name,slug)').in('legacy_id', legacyIds)
      : Promise.resolve({ data: [] }),
  ])

  const merged = new Map<number, MentionedTrack>()
  const addOrBump = (t: any, addCount: number) => {
    if (!t) return
    const key = t.id as number
    const ex = merged.get(key)
    if (ex) {
      ex.mention_count += addCount
    } else {
      merged.set(key, {
        id: t.id,
        legacy_id: t.legacy_id ?? null,
        slug: t.slug,
        title: t.title,
        cover_url: t.cover_url ?? null,
        artist_name: t.artists?.name || null,
        artist_slug: t.artists?.slug || null,
        mention_count: addCount,
      })
    }
  }
  for (const t of (lookups[0].data || []) as any[]) {
    const c = modernIdCounts.get(t.id)?.count || 0
    if (c) addOrBump(t, c)
  }
  for (const t of (lookups[1].data || []) as any[]) {
    if (t.legacy_id == null) continue
    const c = legacyIdCounts.get(t.legacy_id) || 0
    if (c) addOrBump(t, c)
  }

  return [...merged.values()]
    .sort((a, b) => b.mention_count - a.mention_count)
    .slice(0, 12)
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const discussionId = parseInt(id, 10)
  if (!Number.isFinite(discussionId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  // Run both queries in parallel
  const [topContributors, mentionedTracks] = await Promise.all([
    getTopContributors(discussionId),
    getMentionedTracks(discussionId),
  ])

  return NextResponse.json(
    { topContributors, mentionedTracks },
    {
      headers: {
        // 5 min CDN cache; sidebar data shifts slowly
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    },
  )
}
