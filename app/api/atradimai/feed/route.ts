// app/api/atradimai/feed/route.ts
//
// GET /api/atradimai/feed?type=review|topas|creation|translation|article&limit=14
//
// Narių įrašų feed /atradimai row'ams. Skiriasi nuo /api/blog/feed dviem dalykais:
//   1. VIZUALAI — jei post'as neturi cover_image_url (dauguma migruotų „article"
//      diary įrašų neturi), išsprendžiam viršelį iš prikabintų dainų / albumų /
//      atlikėjų (kaip homepage Pulsas). Be šito row'ai atrodo tušti (🎵 placeholder).
//   2. DEDUP per autorių — vienas (naujausias) įrašas per narį, kad produktyvus
//      narys neužfloodintų row'o. Imam didelį pool'ą (200) ir dedup'inam.
//
// type praleistas = visi tipai sumaišyti (Naujausi įrašai row).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const revalidate = 120

const YT_RE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/

type OutPost = {
  id: number; slug: string; title: string; post_type: string; rating: number | null
  like_count: number | null; comment_count: number | null; published_at: string | null
  cover: string | null
  blog_slug: string | null
  author: { id: string | null; full_name: string | null; username: string | null; avatar_url: string | null } | null
}

export async function GET(req: NextRequest) {
  const sb = createAdminClient()
  const type = req.nextUrl.searchParams.get('type')
  const limit = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('limit') || '14'), 1), 30)

  try {
    let q = sb
      .from('blog_posts')
      .select('id, slug, title, cover_image_url, post_type, rating, like_count, comment_count, published_at, blog_id, ' +
        'blogs:blog_id(slug, profiles:user_id(id, full_name, username, avatar_url))')
      .eq('status', 'published')
      .not('published_at', 'is', null)
      .lte('published_at', new Date().toISOString())
      .order('published_at', { ascending: false })
      .limit(200)
    if (type) q = q.eq('post_type', type)

    const { data, error } = await q
    if (error) return NextResponse.json({ posts: [], error: error.message }, { status: 200 })

    const rows = (data || []) as any[]

    // ── Dedup per autorių (vienas naujausias įrašas per narį) PRIEŠ cover resolve,
    //    kad nesprendžiame viršelių įrašams, kurių vis tiek nerodysim. ──
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

    // ── Cover resolve tiems, kurie neturi cover_image_url (kaip Pulsas). ──
    const need = deduped.filter(r => !r.cover_image_url).map(r => r.id)
    const thumb = new Map<number, string>()
    if (need.length) {
      try {
        const [tj, aj, arj] = await Promise.all([
          sb.from('blog_post_tracks').select('post_id, tracks:track_id(video_url, cover_url, artist:artist_id(cover_image_url))').in('post_id', need),
          sb.from('blog_post_albums').select('post_id, albums:album_id(cover_image_url)').in('post_id', need),
          sb.from('blog_post_artists').select('post_id, artists:artist_id(cover_image_url)').in('post_id', need),
        ])
        for (const row of (tj.data || []) as any[]) {
          if (thumb.has(row.post_id)) continue
          const t = Array.isArray(row.tracks) ? row.tracks[0] : row.tracks
          if (!t) continue
          const yt = t.video_url?.match?.(YT_RE)?.[1]
          const art = Array.isArray(t.artist) ? t.artist[0] : t.artist
          const img = yt ? `https://img.youtube.com/vi/${yt}/mqdefault.jpg` : (t.cover_url || art?.cover_image_url || null)
          if (img) thumb.set(row.post_id, img)
        }
        for (const row of (aj.data || []) as any[]) {
          if (thumb.has(row.post_id)) continue
          const a = Array.isArray(row.albums) ? row.albums[0] : row.albums
          if (a?.cover_image_url) thumb.set(row.post_id, a.cover_image_url)
        }
        for (const row of (arj.data || []) as any[]) {
          if (thumb.has(row.post_id)) continue
          const a = Array.isArray(row.artists) ? row.artists[0] : row.artists
          if (a?.cover_image_url) thumb.set(row.post_id, a.cover_image_url)
        }
      } catch {}
    }

    const posts: OutPost[] = deduped.map(r => {
      const prof = r.blogs?.profiles
      return {
        id: r.id, slug: r.slug, title: r.title || '', post_type: r.post_type || 'article',
        rating: r.rating ?? null, like_count: r.like_count ?? null, comment_count: r.comment_count ?? null,
        published_at: r.published_at,
        cover: r.cover_image_url || thumb.get(r.id) || null,
        blog_slug: r.blogs?.slug || prof?.username || null,
        author: prof ? { id: prof.id || null, full_name: prof.full_name || null, username: prof.username || null, avatar_url: prof.avatar_url || null } : null,
      }
    })

    return NextResponse.json({ posts })
  } catch (e: any) {
    return NextResponse.json({ posts: [], error: e?.message || 'error' }, { status: 200 })
  }
}
