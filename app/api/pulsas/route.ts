// app/api/pulsas/route.ts
//
// GET /api/pulsas — naujausi UGC įrašai iš visų vartotojų aktyvumo šaltinių:
//   - Blog įrašai (post_type: article, review, creation, translation, topas, event)
//   - Naujausios diskusijos (forum)
//   - Naujausi komentarai
//
// Rikiuojama pagal created_at DESC, viskas suvienodinama į vieną Pulsas feed'ą.
// Homepage'as rodo top N įrašų mažomis korteles (panašiai kaip news cards).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

// Cache 5 min — homepage'as gali kvietuoti dažnai, bet UGC feed'as 5 min
// freshness pakanka. unstable_cache nereikia, nes nieko nepriklauso nuo
// tag invalidation'o (priešingai nei home tracks/albums).
export const revalidate = 300

type PulsasItem = {
  id: string
  type: 'blog' | 'discussion' | 'comment'
  subtype?: string | null // blog post_type ar comment entity type
  title: string
  excerpt: string | null
  href: string
  cover: string | null
  author_name: string | null
  author_slug: string | null
  author_avatar: string | null
  created_at: string
  meta?: string | null // additional context (vieta, suma, etc.)
}

export async function GET(req: NextRequest) {
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '12'), 150)
  const sb = createAdminClient()

  try {
    // ── Blog feed: visus post types (jau publikuoti). Imam DIDELĮ pool'ą
    // (250 naujausių) — turim 16k+ įrašų per 385 blog'us; vienas produktyvus
    // useris turi 1000+ → be dedup'o jis užfloodintų. Žemiau dedup'inam per
    // blog'ą paliekant tik naujausią įrašą iš kiekvieno autoriaus. ──
    const blogQ = sb
      .from('blog_posts')
      .select('id, slug, title, summary, content, post_type, cover_image_url, blog_id, created_at, published_at, ' +
        'blogs:blog_id(slug, title, profiles:user_id(username, full_name, avatar_url))')
      .eq('status', 'published')
      .not('published_at', 'is', null)
      .order('published_at', { ascending: false })
      .limit(250)

    // ── Diskusijos: naujausi threads ──
    const discQ = sb
      .from('forum_threads')
      .select('id, slug, title, author_name, author_username, created_at, comment_count')
      .order('created_at', { ascending: false })
      .limit(30)

    // ── Komentarai: paskutiniai entity komentarai (track/album/artist) ──
    const commentsQ = sb
      .from('entity_comments')
      .select('id, content_text, entity_type, entity_id, author_username, author_avatar_url, created_at')
      .not('content_text', 'is', null)
      .order('created_at', { ascending: false })
      .limit(40)

    const [blogRes, discRes, commentsRes] = await Promise.all([blogQ, discQ, commentsQ])

    const items: PulsasItem[] = []

    // Dedup per blog'ą (autorių) — paliekam tik NAUJAUSIĄ įrašą iš kiekvieno
    // blog'o (pool surūšiuotas published_at desc → pirmas sutiktas = naujausias).
    const seenBlog = new Set<string>()
    const blogRows: any[] = []
    for (const b of ((blogRes.data || []) as any[])) {
      const bid = b.blog_id || `solo-${b.id}`
      if (seenBlog.has(bid)) continue
      seenBlog.add(bid)
      blogRows.push(b)
    }
    // Vizualo fallback'as (kaip user profile page): cover → prikabintos dainos
    // YT thumb/cover → albumo cover → atlikėjo cover → first <img>/YT iš body.
    const postIds = blogRows.map(b => b.id)
    const thumbByPost = new Map<number, string>()
    if (postIds.length) {
      const YT_RE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/
      try {
        const [tj, aj, arj] = await Promise.all([
          sb.from('blog_post_tracks').select('post_id, tracks:track_id(video_url, cover_url, artist:artist_id(cover_image_url))').in('post_id', postIds),
          sb.from('blog_post_albums').select('post_id, albums:album_id(cover_image_url)').in('post_id', postIds),
          sb.from('blog_post_artists').select('post_id, artists:artist_id(cover_image_url)').in('post_id', postIds),
        ])
        for (const row of (tj.data || []) as any[]) {
          if (thumbByPost.has(row.post_id)) continue
          const t = Array.isArray(row.tracks) ? row.tracks[0] : row.tracks
          if (!t) continue
          const yt = t.video_url?.match?.(YT_RE)?.[1]
          const thumb = yt
            ? `https://img.youtube.com/vi/${yt}/mqdefault.jpg`
            : (t.cover_url || (Array.isArray(t.artist) ? t.artist[0]?.cover_image_url : t.artist?.cover_image_url) || null)
          if (thumb) thumbByPost.set(row.post_id, thumb)
        }
        for (const row of (aj.data || []) as any[]) {
          if (thumbByPost.has(row.post_id)) continue
          const a = Array.isArray(row.albums) ? row.albums[0] : row.albums
          if (a?.cover_image_url) thumbByPost.set(row.post_id, a.cover_image_url)
        }
        for (const row of (arj.data || []) as any[]) {
          if (thumbByPost.has(row.post_id)) continue
          const a = Array.isArray(row.artists) ? row.artists[0] : row.artists
          if (a?.cover_image_url) thumbByPost.set(row.post_id, a.cover_image_url)
        }
      } catch {}
    }
    for (const b of blogRows) {
      const author = b.blogs?.profiles
      const blogSlug = b.blogs?.slug
      items.push({
        id: `blog-${b.id}`,
        type: 'blog',
        subtype: b.post_type || null,
        title: b.title || '',
        excerpt: b.summary || null,
        href: blogSlug ? `/blogai/${blogSlug}/${b.slug || b.id}` : `/blogai/${b.id}`,
        cover: b.cover_image_url || thumbByPost.get(b.id) || firstContentThumb(b.content) || null,
        author_name: author?.full_name || author?.username || null,
        author_slug: author?.username || null,
        author_avatar: author?.avatar_url || null,
        created_at: b.published_at || b.created_at,
        meta: postTypeLabel(b.post_type),
      })
    }

    // Diskusijos
    for (const d of (discRes.data || []) as any[]) {
      items.push({
        id: `disc-${d.id}`,
        type: 'discussion',
        subtype: null,
        title: d.title || '',
        excerpt: null,
        href: `/diskusijos/${d.slug || d.id}`,
        cover: null,
        author_name: d.author_name || d.author_username || null,
        author_slug: d.author_username || null,
        author_avatar: null,
        created_at: d.created_at,
        meta: typeof d.comment_count === 'number' ? `${d.comment_count} atsak.` : null,
      })
    }

    // Komentarai
    for (const c of (commentsRes.data || []) as any[]) {
      const text = (c.content_text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      if (!text) continue
      const excerpt = text.length > 140 ? text.slice(0, 140) + '…' : text
      // Be tikslaus entity URL'o čia (entity_id → slug lookup brangu); rodom
      // generic puslapį pagal entity_type.
      const href =
        c.entity_type === 'track' ? `/dainos`
        : c.entity_type === 'album' ? `/albumai`
        : c.entity_type === 'artist' ? `/atlikejai`
        : '/'
      items.push({
        id: `comm-${c.id}`,
        type: 'comment',
        subtype: c.entity_type,
        title: excerpt,
        excerpt: null,
        href,
        cover: null,
        author_name: c.author_username || null,
        author_slug: c.author_username || null,
        author_avatar: c.author_avatar_url || null,
        created_at: c.created_at,
        meta: entityTypeLabel(c.entity_type),
      })
    }

    // Sortuojam pagal datą DESC
    items.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))

    return NextResponse.json({ items: items.slice(0, limit) }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ items: [], error: e.message }, { status: 200 })
  }
}

/** Ištraukia vizualą iš įrašo body HTML: pirma <img src>, antra — YouTube
 *  nuoroda → thumbnail. Naudojama kai postas neturi cover'io nei prikabintos
 *  muzikos. */
function firstContentThumb(html: string | null | undefined): string | null {
  if (!html) return null
  const img = html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1]
  if (img && /^https?:\/\//i.test(img)) return img
  const yt = html.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/)?.[1]
  if (yt) return `https://img.youtube.com/vi/${yt}/mqdefault.jpg`
  return null
}

function postTypeLabel(t: string | null | undefined): string | null {
  if (!t) return null
  const map: Record<string, string> = {
    article: 'Blogas',
    review: 'Recenzija',
    creation: 'Kūryba',
    translation: 'Vertimas',
    event: 'Renginys',
    topas: 'Topas',
    quick: 'Įrašas',
  }
  return map[t] || 'Įrašas'
}

function entityTypeLabel(t: string | null | undefined): string | null {
  if (!t) return null
  const map: Record<string, string> = {
    track: 'Daina',
    album: 'Albumas',
    artist: 'Atlikėjas',
    news: 'Naujiena',
    event: 'Renginys',
  }
  return map[t] || 'Komentaras'
}
