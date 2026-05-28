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

export const dynamic = 'force-dynamic'
export const revalidate = 300 // 5 min

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
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '12'), 30)
  const sb = createAdminClient()

  try {
    // ── Blog feed: visus post types (jau publikuoti) ──
    const blogQ = sb
      .from('blog_posts')
      .select('id, slug, title, summary, post_type, cover_image_url, created_at, published_at, ' +
        'blogs:blog_id(slug, title, profiles:user_id(username, full_name, avatar_url))')
      .eq('status', 'published')
      .not('published_at', 'is', null)
      .order('published_at', { ascending: false })
      .limit(20)

    // ── Diskusijos: naujausi threads ──
    const discQ = sb
      .from('forum_threads')
      .select('id, slug, title, author_name, author_username, created_at, comment_count')
      .order('created_at', { ascending: false })
      .limit(15)

    // ── Komentarai: paskutiniai entity komentarai (track/album/artist) ──
    const commentsQ = sb
      .from('entity_comments')
      .select('id, content_text, entity_type, entity_id, author_username, author_avatar_url, created_at')
      .not('content_text', 'is', null)
      .order('created_at', { ascending: false })
      .limit(15)

    const [blogRes, discRes, commentsRes] = await Promise.all([blogQ, discQ, commentsQ])

    const items: PulsasItem[] = []

    // Blog įrašai
    for (const b of (blogRes.data || []) as any[]) {
      const author = b.blogs?.profiles
      const blogSlug = b.blogs?.slug
      items.push({
        id: `blog-${b.id}`,
        type: 'blog',
        subtype: b.post_type || null,
        title: b.title || '',
        excerpt: b.summary || null,
        href: blogSlug ? `/blogai/${blogSlug}/${b.slug || b.id}` : `/blogai/${b.id}`,
        cover: b.cover_image_url || null,
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
