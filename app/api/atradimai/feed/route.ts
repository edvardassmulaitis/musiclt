// app/api/atradimai/feed/route.ts
//
// GET /api/atradimai/feed?type=review|topas|creation|translation|article&limit=14
//
// Narių įrašų feed /atrasti row'ams. Skiriasi nuo /api/blog/feed:
//   1. VIZUALAI — jei post'as neturi cover_image_url, išsprendžiam viršelį iš:
//        a) prikabintų dainų/albumų/atlikėjų (blog_post_* — „article" diary),
//        b) target_* kolonų (review/translation/event sieja konkretų entity),
//        c) topas — list_items įrašų (collage iš top entry vizualų).
//      Be šito row'ai atrodo tušti. „Kūryba" sąmoningai lieka be vizualo
//      (nesietina su muzikos įrašais — Edvardo sprendimas 2026-06-05).
//   2. TOPAS — grąžinam top-5 entries (rank/title/artist/image) mini-topui,
//      kaip oficialūs muzikos topai.
//   3. DEDUP per autorių — vienas (naujausias) įrašas per narį.
//
// type praleistas = visi tipai sumaišyti (Naujausi įrašai row).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const revalidate = 120

const YT_RE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/

function ytThumb(url?: string | null): string | null {
  const m = url?.match?.(YT_RE)?.[1]
  return m ? `https://img.youtube.com/vi/${m}/mqdefault.jpg` : null
}
function first<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

type ListEntry = { rank: number; title: string; artist: string | null; image: string | null; type: string; entity_id: number | null }

type OutPost = {
  id: number; slug: string; title: string; post_type: string; rating: number | null
  like_count: number | null; comment_count: number | null; published_at: string | null
  cover: string | null
  collage: string[] | null     // topas: top entry vizualai
  entries: ListEntry[] | null  // topas: top-5 mini-top
  blog_slug: string | null
  author: { id: string | null; full_name: string | null; username: string | null; avatar_url: string | null } | null
}

export async function GET(req: NextRequest) {
  const sb = createAdminClient()
  const type = req.nextUrl.searchParams.get('type')
  const editorial = req.nextUrl.searchParams.get('editorial')
  const limit = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('limit') || '14'), 1), 30)

  try {
    let q = sb
      .from('blog_posts')
      .select('id, slug, title, cover_image_url, post_type, rating, like_count, comment_count, published_at, blog_id, ' +
        'target_track_id, target_album_id, target_artist_id, target_event_id, list_items, ' +
        'blogs:blog_id(slug, profiles:user_id(id, full_name, username, avatar_url))')
      .eq('status', 'published')
      .not('published_at', 'is', null)
      .lte('published_at', new Date().toISOString())
      .order('published_at', { ascending: false })
      .limit(200)
    if (type) q = q.eq('post_type', type)
    if (editorial) q = q.eq('editorial_type', editorial)

    const { data, error } = await q
    if (error) return NextResponse.json({ posts: [], error: error.message }, { status: 200 })

    const rows = (data || []) as any[]

    // ── Dedup per autorių (vienas naujausias įrašas per narį) PRIEŠ cover resolve. ──
    const seen = new Set<string>()
    const deduped: any[] = []
    for (const r of rows) {
      const prof = r.blogs?.profiles
      const key = prof?.username || prof?.id || `post-${r.id}`
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push(r)
      if (deduped.length >= limit) break
    }

    // ── Cover resolve tiems, kurie neturi cover_image_url. ──
    const thumb = new Map<number, string>()         // post_id → cover
    const need = deduped.filter(r => !r.cover_image_url && r.post_type !== 'creation')

    // (a) Prikabinti entity (article diary) — blog_post_* lentelės.
    const needAttach = need.filter(r => r.post_type === 'article').map(r => r.id)
    if (needAttach.length) {
      try {
        const [tj, aj, arj] = await Promise.all([
          sb.from('blog_post_tracks').select('post_id, tracks:track_id(video_url, cover_url, artist:artist_id(cover_image_url))').in('post_id', needAttach),
          sb.from('blog_post_albums').select('post_id, albums:album_id(cover_image_url)').in('post_id', needAttach),
          sb.from('blog_post_artists').select('post_id, artists:artist_id(cover_image_url)').in('post_id', needAttach),
        ])
        for (const row of (tj.data || []) as any[]) {
          if (thumb.has(row.post_id)) continue
          const t = first<any>(row.tracks); if (!t) continue
          const art = first<any>(t.artist)
          const img = ytThumb(t.video_url) || t.cover_url || art?.cover_image_url || null
          if (img) thumb.set(row.post_id, img)
        }
        for (const row of (aj.data || []) as any[]) {
          if (thumb.has(row.post_id)) continue
          const a = first<any>(row.albums); if (a?.cover_image_url) thumb.set(row.post_id, a.cover_image_url)
        }
        for (const row of (arj.data || []) as any[]) {
          if (thumb.has(row.post_id)) continue
          const a = first<any>(row.artists); if (a?.cover_image_url) thumb.set(row.post_id, a.cover_image_url)
        }
      } catch {}
    }

    // (b) target_* sieti entity (review / translation / event).
    const trackIds = new Set<number>()
    const albumIds = new Set<number>()
    const artistIds = new Set<number>()
    const eventIds = new Set<string>()
    for (const r of need) {
      if (thumb.has(r.id)) continue
      if (r.target_track_id) trackIds.add(r.target_track_id)
      if (r.target_album_id) albumIds.add(r.target_album_id)
      if (r.target_artist_id) artistIds.add(r.target_artist_id)
      if (r.target_event_id) eventIds.add(r.target_event_id)
    }
    // (c) topas list_items — surenkam top-5 entry entity_id'us be image_url.
    const topasRows = deduped.filter(r => r.post_type === 'topas' && Array.isArray(r.list_items) && r.list_items.length)
    for (const r of topasRows) {
      const top = [...r.list_items].sort((a: any, b: any) => (a.rank || 0) - (b.rank || 0)).slice(0, 5)
      for (const it of top) {
        if (it.image_url) continue
        if (it.type === 'track' && it.entity_id) trackIds.add(it.entity_id)
        else if (it.type === 'album' && it.entity_id) albumIds.add(it.entity_id)
        else if (it.type === 'artist' && it.entity_id) artistIds.add(it.entity_id)
      }
    }

    // Batch entity užklausos → image map'ai pagal tipą.
    const trackImg = new Map<number, string>()
    const albumImg = new Map<number, string>()
    const artistImg = new Map<number, string>()
    const eventImg = new Map<string, string>()
    try {
      const [tr, al, ar, ev] = await Promise.all([
        trackIds.size ? sb.from('tracks').select('id, cover_url, video_url, artist:artist_id(cover_image_url)').in('id', [...trackIds]) : Promise.resolve({ data: [] as any[] }),
        albumIds.size ? sb.from('albums').select('id, cover_image_url').in('id', [...albumIds]) : Promise.resolve({ data: [] as any[] }),
        artistIds.size ? sb.from('artists').select('id, cover_image_url').in('id', [...artistIds]) : Promise.resolve({ data: [] as any[] }),
        eventIds.size ? sb.from('events').select('id, cover_image_url').in('id', [...eventIds]) : Promise.resolve({ data: [] as any[] }),
      ])
      for (const t of ((tr as any).data || [])) {
        const art = first<any>(t.artist)
        const img = ytThumb(t.video_url) || t.cover_url || art?.cover_image_url || null
        if (img) trackImg.set(t.id, img)
      }
      for (const a of ((al as any).data || [])) if (a.cover_image_url) albumImg.set(a.id, a.cover_image_url)
      for (const a of ((ar as any).data || [])) if (a.cover_image_url) artistImg.set(a.id, a.cover_image_url)
      for (const e of ((ev as any).data || [])) if (e.cover_image_url) eventImg.set(e.id, e.cover_image_url)
    } catch {}

    // target_* cover resolve.
    for (const r of need) {
      if (thumb.has(r.id)) continue
      const img =
        (r.target_track_id && trackImg.get(r.target_track_id)) ||
        (r.target_album_id && albumImg.get(r.target_album_id)) ||
        (r.target_artist_id && artistImg.get(r.target_artist_id)) ||
        (r.target_event_id && eventImg.get(r.target_event_id)) || null
      if (img) thumb.set(r.id, img)
    }

    // Topas entries (top-5) su išspręstais vizualais → mini-topui + collage.
    const entriesById = new Map<number, ListEntry[]>()
    for (const r of topasRows) {
      const top = [...r.list_items].sort((a: any, b: any) => (a.rank || 0) - (b.rank || 0)).slice(0, 5)
      const entries: ListEntry[] = top.map((it: any, i: number) => {
        let image: string | null = it.image_url || null
        if (!image) {
          if (it.type === 'track') image = it.entity_id ? (trackImg.get(it.entity_id) || null) : null
          else if (it.type === 'album') image = it.entity_id ? (albumImg.get(it.entity_id) || null) : null
          else if (it.type === 'artist') image = it.entity_id ? (artistImg.get(it.entity_id) || null) : null
        }
        return { rank: it.rank || i + 1, title: it.title || '', artist: it.artist || null, image, type: it.type || 'custom', entity_id: it.entity_id ?? null }
      })
      entriesById.set(r.id, entries)
    }

    const posts: OutPost[] = deduped.map(r => {
      const prof = r.blogs?.profiles
      const entries = entriesById.get(r.id) || null
      const collage = entries ? entries.map(e => e.image).filter((x): x is string => !!x).slice(0, 4) : null
      const topasCover = collage && collage.length ? collage[0] : null
      return {
        id: r.id, slug: r.slug, title: r.title || '', post_type: r.post_type || 'article',
        rating: r.rating ?? null, like_count: r.like_count ?? null, comment_count: r.comment_count ?? null,
        published_at: r.published_at,
        cover: r.cover_image_url || thumb.get(r.id) || topasCover || null,
        collage: collage && collage.length ? collage : null,
        entries,
        blog_slug: r.blogs?.slug || prof?.username || null,
        author: prof ? { id: prof.id || null, full_name: prof.full_name || null, username: prof.username || null, avatar_url: prof.avatar_url || null } : null,
      }
    })

    return NextResponse.json({ posts })
  } catch (e: any) {
    return NextResponse.json({ posts: [], error: e?.message || 'error' }, { status: 200 })
  }
}
