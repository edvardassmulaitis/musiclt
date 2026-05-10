// GET — vartotojo "diskusijų" feed'as /pokalbiai sidebar'ui.
//
// "Diskusijos" čia plačia prasme — visi entity threads, kuriose user'is
// dalyvavo komentuodamas ar kurdamas:
//   • discussions       — forum thread'ai (sukūrė ar komentavo)
//   • tracks/albums/    — entity comments (komentavo prie kūrinio)
//     artists/news/events
//
// Grąžinam unified array sortuotą pagal last activity. Kiekvienas entry
// turi: kind, slug/id, title, count, last_activity_at, involvement.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveViewerId } from '@/lib/chat'
import { createAdminClient } from '@/lib/supabase'

type EntityKind = 'discussion' | 'track' | 'album' | 'artist' | 'news' | 'event'

type Item = {
  id: number
  kind: EntityKind
  slug: string
  title: string
  comment_count: number
  last_comment_at: string | null
  created_at: string
  is_author: boolean
  involvement: 'created' | 'commented'
  // URL kuria click'as veda. Diskusijoms /pokalbiai/d/<slug>; kitiems
  // entity'jams /pokalbiai/e/<type>/<id> — chat-style komentarų view'as.
  url: string
  // Entity-specifinis paveiksliukas (artist photo / album cover / news image).
  // Jei null — sidebar parodo generic ikoną.
  image_url: string | null
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = await resolveViewerId(session)
  if (!userId) return NextResponse.json({ discussions: [], authenticated: false })

  const { searchParams } = new URL(req.url)
  const limit = Math.min(Number(searchParams.get('limit') || 50), 200)

  const sb = createAdminClient()
  const items: Item[] = []

  // 1. DISCUSSIONS — forum thread'ai (sukūrė + commented).
  try {
    // Sukūrtos.
    const { data: created } = await sb
      .from('discussions')
      .select('id, slug, title, comment_count, last_comment_at, created_at')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .order('last_comment_at', { ascending: false, nullsFirst: false })
      .limit(limit)
    for (const d of created || []) {
      items.push({
        id: d.id, kind: 'discussion', slug: d.slug, title: d.title,
        comment_count: d.comment_count || 0,
        last_comment_at: d.last_comment_at, created_at: d.created_at,
        is_author: true, involvement: 'created',
        url: `/pokalbiai/d/${d.slug}`,
        image_url: null,
      })
    }

    // Komentuotos (jei comments.discussion_id egzistuoja).
    const { data: commentedDiscIds } = await sb
      .from('comments')
      .select('discussion_id')
      .eq('author_id', userId)
      .eq('is_deleted', false)
      .not('discussion_id', 'is', null)
      .limit(500)
    const discIds = Array.from(new Set((commentedDiscIds || []).map((c: any) => c.discussion_id).filter(Boolean)))
    if (discIds.length > 0) {
      const existingIds = new Set(items.map(i => i.id))
      const newIds = discIds.filter(id => !existingIds.has(id))
      if (newIds.length > 0) {
        const { data: discs } = await sb
          .from('discussions')
          .select('id, slug, title, comment_count, last_comment_at, created_at')
          .in('id', newIds)
          .eq('is_deleted', false)
        for (const d of discs || []) {
          items.push({
            id: d.id, kind: 'discussion', slug: d.slug, title: d.title,
            comment_count: d.comment_count || 0,
            last_comment_at: d.last_comment_at, created_at: d.created_at,
            is_author: false, involvement: 'commented',
            url: `/pokalbiai/d/${d.slug}`,
            image_url: null,
          })
        }
      }
    }
  } catch { /* discussions table missing → skip */ }

  // 2. TRACK/ALBUM/ARTIST/NEWS/EVENT entity comments.
  // Surenkam visus user'io komentarus su nors vienu entity FK užpildytu.
  try {
    const { data: entityComments } = await sb
      .from('comments')
      .select('track_id, album_id, news_id, event_id, created_at')
      .eq('author_id', userId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(500)

    const trackIds = new Set<number>()
    const albumIds = new Set<number>()
    const newsIds  = new Set<number>()
    const eventIds = new Set<number>()
    const lastByEntity = new Map<string, string>()  // 'track:<id>' → ts

    for (const c of entityComments || []) {
      if (c.track_id) { trackIds.add(c.track_id); pushLast(lastByEntity, `track:${c.track_id}`, c.created_at) }
      if (c.album_id) { albumIds.add(c.album_id); pushLast(lastByEntity, `album:${c.album_id}`, c.created_at) }
      if (c.news_id)  { newsIds.add(c.news_id);   pushLast(lastByEntity, `news:${c.news_id}`,   c.created_at) }
      if (c.event_id) { eventIds.add(c.event_id); pushLast(lastByEntity, `event:${c.event_id}`, c.created_at) }
    }

    // Tracks — paimam ir cover_url, ir artist'o cover_image_url fallback'ui.
    if (trackIds.size > 0) {
      const { data: tracks } = await sb
        .from('tracks')
        .select('id, slug, title, cover_url, artists:artist_id(id, slug, name, cover_image_url)')
        .in('id', Array.from(trackIds))
      for (const t of tracks || []) {
        const artistName = (t as any).artists?.name || ''
        const artistImg = (t as any).artists?.cover_image_url || null
        const cover = (t as any).cover_url || artistImg
        items.push({
          id: t.id, kind: 'track', slug: t.slug || String(t.id),
          title: artistName ? `${t.title} — ${artistName}` : t.title,
          comment_count: 0,
          last_comment_at: lastByEntity.get(`track:${t.id}`) || null,
          created_at: lastByEntity.get(`track:${t.id}`) || new Date().toISOString(),
          is_author: false, involvement: 'commented',
          url: `/pokalbiai/e/track/${t.id}`,
          image_url: cover,
        })
      }
    }

    // Albums
    if (albumIds.size > 0) {
      const { data: albums } = await sb
        .from('albums')
        .select('id, slug, title, cover_image_url, artists:artist_id(id, slug, name, cover_image_url)')
        .in('id', Array.from(albumIds))
      for (const a of albums || []) {
        const artistName = (a as any).artists?.name || ''
        const cover = (a as any).cover_image_url || (a as any).artists?.cover_image_url || null
        items.push({
          id: a.id, kind: 'album', slug: a.slug || String(a.id),
          title: artistName ? `${a.title} — ${artistName}` : a.title,
          comment_count: 0,
          last_comment_at: lastByEntity.get(`album:${a.id}`) || null,
          created_at: lastByEntity.get(`album:${a.id}`) || new Date().toISOString(),
          is_author: false, involvement: 'commented',
          url: `/pokalbiai/e/album/${a.id}`,
          image_url: cover,
        })
      }
    }

    // News
    if (newsIds.size > 0) {
      const { data: news } = await sb
        .from('news')
        .select('id, slug, title, image_small_url, image_title_url')
        .in('id', Array.from(newsIds))
      for (const n of news || []) {
        items.push({
          id: n.id, kind: 'news', slug: n.slug || String(n.id),
          title: n.title,
          comment_count: 0,
          last_comment_at: lastByEntity.get(`news:${n.id}`) || null,
          created_at: lastByEntity.get(`news:${n.id}`) || new Date().toISOString(),
          is_author: false, involvement: 'commented',
          url: `/pokalbiai/e/news/${n.id}`,
          image_url: (n as any).image_small_url || (n as any).image_title_url || null,
        })
      }
    }

    // Events
    if (eventIds.size > 0) {
      const { data: events } = await sb
        .from('events')
        .select('id, slug, title, image_small_url')
        .in('id', Array.from(eventIds))
      for (const e of events || []) {
        items.push({
          id: e.id, kind: 'event', slug: e.slug || String(e.id),
          title: e.title,
          comment_count: 0,
          last_comment_at: lastByEntity.get(`event:${e.id}`) || null,
          created_at: lastByEntity.get(`event:${e.id}`) || new Date().toISOString(),
          is_author: false, involvement: 'commented',
          url: `/pokalbiai/e/event/${e.id}`,
          image_url: (e as any).image_small_url || null,
        })
      }
    }
  } catch { /* per-table errors → skip silently */ }

  // Sort'inam pagal last activity DESC. discussions su last_comment_at NULL —
  // tada created_at. Limit'as.
  items.sort((a, b) => {
    const aTs = a.last_comment_at || a.created_at
    const bTs = b.last_comment_at || b.created_at
    return new Date(bTs).getTime() - new Date(aTs).getTime()
  })

  return NextResponse.json({ discussions: items.slice(0, limit) })
}

function pushLast(map: Map<string, string>, key: string, ts: string) {
  const prev = map.get(key)
  if (!prev || new Date(ts).getTime() > new Date(prev).getTime()) map.set(key, ts)
}
