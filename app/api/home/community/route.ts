// app/api/home/community/route.ts
//
// GET /api/home/community — sujungtas bendruomenės strip'as homepage'ui:
//   { dd: DienosDainaWinner | null, items: CommunityItem[] }
//
// dd   = vakarykštis dienos dainos laimėtojas (pinned kortelė)
// items = blog įrašai (su vizualais, last 14d) + aktyvios diskusijos (≥2 kom,
//         last 7d, su atlikėjo cover per artist_id FK), sujungiami 2:1 santykiu.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const revalidate = 300

const YT_RE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/

function todayLT(): string {
  return new Date()
    .toLocaleDateString('lt-LT', { timeZone: 'Europe/Vilnius', year: 'numeric', month: '2-digit', day: '2-digit' })
    .split('.').reverse().join('-')
}

export async function GET() {
  const sb = createAdminClient()
  const today = todayLT()
  const blog14d = new Date(Date.now() - 14 * 86400000).toISOString()
  const disc7d  = new Date(Date.now() -  7 * 86400000).toISOString()

  try {
    const [ddRes, blogRes, discRes] = await Promise.all([
      // 1. Vakarykštis dienos dainos laimėtojas
      sb.from('daily_song_winners')
        .select('id, date, tracks!track_id(title, slug, cover_url, video_url, artists!artist_id(name, slug, cover_image_url))')
        .lt('date', today)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle(),

      // 2. Blog įrašai (last 14d, visi tipai)
      sb.from('blog_posts')
        .select('id, slug, title, post_type, cover_image_url, like_count, comment_count, published_at, blogs:blog_id(slug, profiles:user_id(username, full_name, avatar_url))')
        .eq('status', 'published')
        .not('published_at', 'is', null)
        .gte('published_at', blog14d)
        .order('published_at', { ascending: false })
        .limit(60),

      // 3. Diskusijos su atlikėjo cover (last 7d, min 2 komentarai)
      sb.from('discussions')
        .select('id, slug, title, author_name, author_avatar, comment_count, created_at, artist:artists!discussions_artist_id_fkey(name, cover_image_url)')
        .eq('is_deleted', false)
        .or('legacy_kind.is.null,legacy_kind.eq.discussion')
        .not('author_name', 'is', null)
        .gte('comment_count', 2)
        .gte('created_at', disc7d)
        .order('comment_count', { ascending: false })
        .limit(20),
    ])

    // ── Dienos daina ──────────────────────────────────────────────────────────
    let dd: any = null
    if (ddRes.data) {
      const w = ddRes.data as any
      const track = w.tracks
      const artist = Array.isArray(track?.artists) ? track.artists[0] : track?.artists
      const ytId = track?.video_url?.match?.(YT_RE)?.[1]
      dd = {
        id: `dw_${w.id}`,
        href: '/atrasti#dienos-daina',
        title: track?.title || 'Dienos daina',
        artist: artist?.name || '',
        coverUrl: track?.cover_url || (ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : null) || artist?.cover_image_url || null,
        date: w.date,
      }
    }

    // ── Blog įrašai — thumbnail resolve be cover'io ───────────────────────────
    const blogRows = (blogRes.data || []) as any[]
    const needThumb = blogRows.filter(b => !b.cover_image_url).map(b => b.id)
    const thumbByPost = new Map<number, string>()
    if (needThumb.length) {
      try {
        const [tj, aj, arj] = await Promise.all([
          sb.from('blog_post_tracks').select('post_id, tracks:track_id(video_url, cover_url, artist:artist_id(cover_image_url))').in('post_id', needThumb),
          sb.from('blog_post_albums').select('post_id, albums:album_id(cover_image_url)').in('post_id', needThumb),
          sb.from('blog_post_artists').select('post_id, artists:artist_id(cover_image_url)').in('post_id', needThumb),
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

    const seenAuthors = new Set<string>()
    const blogItems: any[] = []
    for (const b of blogRows) {
      const cover = b.cover_image_url || thumbByPost.get(b.id) || null
      if (!cover) continue               // tik su vizualais
      const author = b.blogs?.profiles
      if (!author) continue              // tik realūs nariai
      const key = author.username || String(b.id)
      if (seenAuthors.has(key)) continue // 1 per autorių
      seenAuthors.add(key)
      const blogSlug = b.blogs?.slug || author.username
      blogItems.push({
        id: `blog-${b.id}`,
        type: 'blog',
        subtype: b.post_type || null,
        title: b.title || '',
        href: blogSlug ? `/blogas/${blogSlug}/${b.slug || b.id}` : '/blogas',
        cover,
        author_name: author.full_name || author.username || null,
        author_slug: author.username || null,
        author_avatar: author.avatar_url || null,
        created_at: b.published_at,
        engagement: (b.like_count || 0) + (b.comment_count || 0),
      })
    }
    // Engagement desc, tada data desc
    blogItems.sort((a, b) => b.engagement - a.engagement || (a.created_at < b.created_at ? 1 : -1))

    // ── Diskusijos su atlikėjo cover ──────────────────────────────────────────
    const discItems: any[] = []
    for (const d of (discRes.data || []) as any[]) {
      const artist = Array.isArray(d.artist) ? d.artist[0] : d.artist
      discItems.push({
        id: `disc-${d.id}`,
        type: 'discussion',
        title: d.title || '',
        href: `/diskusijos/${d.slug || d.id}`,
        cover: artist?.cover_image_url || null,
        author_name: d.author_name || null,
        author_avatar: d.author_avatar || null,
        created_at: d.created_at,
        comment_count: d.comment_count || 0,
      })
    }

    // ── Merge 2:1 (blog:discussion), maks 10 ─────────────────────────────────
    const items: any[] = []
    let bi = 0, di = 0
    while (items.length < 10 && (bi < blogItems.length || di < discItems.length)) {
      if (bi < blogItems.length) items.push(blogItems[bi++])
      if (bi < blogItems.length && items.length < 10) items.push(blogItems[bi++])
      if (di < discItems.length && items.length < 10) items.push(discItems[di++])
    }

    return NextResponse.json({ dd, items }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    })
  } catch (e: any) {
    return NextResponse.json({ dd: null, items: [] }, { status: 200 })
  }
}
