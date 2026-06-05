// app/api/atradimai/feed/route.ts
//
// GET /api/atradimai/feed?type=review|topas|creation|translation|article&limit=14
//
// Narių įrašų feed /atrasti row'ams. Skiriasi nuo /api/blog/feed:
//   1. VIZUALAI — jei post'as neturi cover_image_url, išsprendžiam viršelį iš:
//        a) prikabintų dainų/albumų/atlikėjų (blog_post_* — „article" diary),
//        b) target_* kolonų (review/translation/event sieja konkretų entity),
//        c) topas — list_items įrašų (collage iš top entry vizualų).
//      „Kūryba" sąmoningai lieka be vizualo (nesietina su muzika).
//   2. TOPAS — grąžinam top-5 entries (rank/title/artist/image) mini-topui.
//      DĖMESIO: yra DU list_items formatai:
//        • naujas editor'iaus: {rank, type, entity_id, title, artist, image_url}
//        • legacy importas (237/239): {position, artist_name, track_title,
//          artist_legacy_id, track_legacy_id, album_legacy_id} — vizualus
//          sprendžiam per legacy_id → tracks/albums/artists.
//   3. DEDUP per autorių — vienas (naujausias) įrašas per narį.

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
const num = (v: any): number | null => (typeof v === 'number' ? v : (v != null && /^\d+$/.test(String(v)) ? parseInt(String(v)) : null))

type ListEntry = { rank: number; title: string; artist: string | null; image: string | null }

type OutPost = {
  id: number; slug: string; title: string; post_type: string; rating: number | null
  like_count: number | null; comment_count: number | null; published_at: string | null
  cover: string | null
  collage: string[] | null
  entries: ListEntry[] | null
  blog_slug: string | null
  author: { id: string | null; full_name: string | null; username: string | null; avatar_url: string | null } | null
}

// Normalizuojam abu list_item formatus į vieną.
function normEntry(it: any, i: number) {
  const rank = num(it.rank) ?? num(it.position) ?? i + 1
  const trackTitle = it.track_title || null
  const artistName = it.artist_name || null
  // naujas formatas: title/artist; legacy: track_title/artist_name
  const title = (it.title || trackTitle || artistName || '').toString()
  const artist = it.artist || (trackTitle ? artistName : null) || null
  return {
    rank, title, artist,
    image_url: it.image_url || null,
    type: it.type || null,
    entity_id: num(it.entity_id),
    track_legacy_id: num(it.track_legacy_id),
    album_legacy_id: num(it.album_legacy_id),
    artist_legacy_id: num(it.artist_legacy_id),
  }
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

    // ── Dedup per autorių (vienas naujausias įrašas per narį). ──
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

    const thumb = new Map<number, string>()
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

    // ── Surenkam ID'us vizualų sprendimui (target_* + topas list_items). ──
    const trackIds = new Set<number>(), albumIds = new Set<number>(), artistIds = new Set<number>()
    const eventIds = new Set<string>()
    const trackLeg = new Set<number>(), albumLeg = new Set<number>(), artistLeg = new Set<number>()

    for (const r of need) {
      if (thumb.has(r.id)) continue
      if (r.target_track_id) trackIds.add(r.target_track_id)
      if (r.target_album_id) albumIds.add(r.target_album_id)
      if (r.target_artist_id) artistIds.add(r.target_artist_id)
      if (r.target_event_id) eventIds.add(r.target_event_id)
    }

    // Topas entries (normalizuotos, top-5 pagal rank/position).
    const topNormById = new Map<number, ReturnType<typeof normEntry>[]>()
    const topasRows = deduped.filter(r => r.post_type === 'topas' && Array.isArray(r.list_items) && r.list_items.length)
    for (const r of topasRows) {
      const norm = (r.list_items as any[]).map((it, i) => normEntry(it, i)).sort((a, b) => a.rank - b.rank).slice(0, 5)
      topNormById.set(r.id, norm)
      for (const e of norm) {
        if (e.image_url) continue
        if (e.entity_id) {
          if (e.type === 'track') trackIds.add(e.entity_id)
          else if (e.type === 'album') albumIds.add(e.entity_id)
          else if (e.type === 'artist') artistIds.add(e.entity_id)
        }
        if (e.track_legacy_id) trackLeg.add(e.track_legacy_id)
        if (e.album_legacy_id) albumLeg.add(e.album_legacy_id)
        if (e.artist_legacy_id) artistLeg.add(e.artist_legacy_id)
      }
    }

    // ── Batch entity užklausos (pagal id IR legacy_id). ──
    const trackImg = new Map<number, string>(), albumImg = new Map<number, string>(), artistImg = new Map<number, string>()
    const trackImgLeg = new Map<number, string>(), albumImgLeg = new Map<number, string>(), artistImgLeg = new Map<number, string>()
    const eventImg = new Map<string, string>()
    const E = { data: [] as any[] }
    try {
      const [tr, trL, al, alL, ar, arL, ev] = await Promise.all([
        trackIds.size ? sb.from('tracks').select('id, cover_url, video_url, artist:artist_id(cover_image_url)').in('id', [...trackIds]) : Promise.resolve(E),
        trackLeg.size ? sb.from('tracks').select('legacy_id, cover_url, video_url, artist:artist_id(cover_image_url)').in('legacy_id', [...trackLeg]) : Promise.resolve(E),
        albumIds.size ? sb.from('albums').select('id, cover_image_url').in('id', [...albumIds]) : Promise.resolve(E),
        albumLeg.size ? sb.from('albums').select('legacy_id, cover_image_url').in('legacy_id', [...albumLeg]) : Promise.resolve(E),
        artistIds.size ? sb.from('artists').select('id, cover_image_url').in('id', [...artistIds]) : Promise.resolve(E),
        artistLeg.size ? sb.from('artists').select('legacy_id, cover_image_url').in('legacy_id', [...artistLeg]) : Promise.resolve(E),
        eventIds.size ? sb.from('events').select('id, cover_image_url').in('id', [...eventIds]) : Promise.resolve(E),
      ])
      const trackImgOf = (t: any) => ytThumb(t.video_url) || t.cover_url || first<any>(t.artist)?.cover_image_url || null
      for (const t of ((tr as any).data || [])) { const img = trackImgOf(t); if (img) trackImg.set(t.id, img) }
      for (const t of ((trL as any).data || [])) { const img = trackImgOf(t); if (img) trackImgLeg.set(t.legacy_id, img) }
      for (const a of ((al as any).data || [])) if (a.cover_image_url) albumImg.set(a.id, a.cover_image_url)
      for (const a of ((alL as any).data || [])) if (a.cover_image_url) albumImgLeg.set(a.legacy_id, a.cover_image_url)
      for (const a of ((ar as any).data || [])) if (a.cover_image_url) artistImg.set(a.id, a.cover_image_url)
      for (const a of ((arL as any).data || [])) if (a.cover_image_url) artistImgLeg.set(a.legacy_id, a.cover_image_url)
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

    // Topas entries → vizualai.
    const entriesById = new Map<number, ListEntry[]>()
    for (const r of topasRows) {
      const norm = topNormById.get(r.id) || []
      const entries: ListEntry[] = norm.map(e => {
        let image: string | null = e.image_url
        if (!image && e.entity_id) {
          if (e.type === 'track') image = trackImg.get(e.entity_id) || null
          else if (e.type === 'album') image = albumImg.get(e.entity_id) || null
          else if (e.type === 'artist') image = artistImg.get(e.entity_id) || null
        }
        if (!image) {
          image = (e.track_legacy_id && trackImgLeg.get(e.track_legacy_id)) ||
                  (e.album_legacy_id && albumImgLeg.get(e.album_legacy_id)) ||
                  (e.artist_legacy_id && artistImgLeg.get(e.artist_legacy_id)) || null
        }
        return { rank: e.rank, title: e.title, artist: e.artist, image }
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
