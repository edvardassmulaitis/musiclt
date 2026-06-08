// app/api/home/community/route.ts
//
// GET /api/home/community → { items: CommunityItem[] }
//
// items[0] visada = Dienos daina (šiandien lyderis arba vakarykštis laimėtojas)
// items[1..] = blog įrašai + diskusijos, 2:1 santykiu, maks 12 iš viso
//
// Blog įrašų cover sprendimas (prioritetais):
//   1. cover_image_url (tiesioginė nuotrauka)
//   2. blog_post_tracks → YT thumb → track cover → artist cover
//   3. blog_post_albums → album cover
//   4. blog_post_artists → artist cover
//   5. target_track_id → track/YT/artist cover  (review / translation)
//   6. target_album_id → album cover
//   7. target_artist_id → artist cover
//   8. topas: list_items[0].image_url (naujasis formatas)
//   9. gradiento rezervas (komponentas rodo inicialą)
//
// Diskusijų cover: artist_id FK → artists.cover_image_url

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const revalidate = 180

const YT_RE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/

function todayLT(): string {
  return new Date()
    .toLocaleDateString('lt-LT', { timeZone: 'Europe/Vilnius', year: 'numeric', month: '2-digit', day: '2-digit' })
    .split('.').reverse().join('-')
}
function ytThumb(url?: string | null): string | null {
  const m = url?.match?.(YT_RE)?.[1]
  return m ? `https://img.youtube.com/vi/${m}/mqdefault.jpg` : null
}

export async function GET() {
  const sb = createAdminClient()
  const today = todayLT()
  const blog60d = new Date(Date.now() - 60 * 86400000).toISOString()

  try {
    const [nomRes, votesRes, pastWinnerRes, blogRes, discRes] = await Promise.all([
      // Šiandieninės nominacijos (DD lyderio nustatymui)
      sb.from('daily_song_nominations')
        .select('id, tracks!track_id(title, slug, cover_url, video_url, artists!artist_id(name, slug, cover_image_url))')
        .eq('date', today)
        .is('removed_at', null)
        .limit(20),

      // Balsai šiandien (weighted — nariai 3x, anonai 1x)
      sb.from('daily_song_votes')
        .select('nomination_id, weight')
        .eq('date', today),

      // Vakarykštis laimėtojas (fallback jei šiandien nėra nominacijų)
      sb.from('daily_song_winners')
        .select('id, date, tracks!track_id(title, slug, cover_url, video_url, artists!artist_id(name, slug, cover_image_url))')
        .lt('date', today)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle(),

      // Blog įrašai (last 60d) — visi tipai, engagement desc
      sb.from('blog_posts')
        .select('id, slug, title, post_type, cover_image_url, like_count, comment_count, published_at, list_items, target_track_id, target_album_id, target_artist_id, blogs:blog_id(slug, profiles:user_id(id, username, full_name, avatar_url))')
        .eq('status', 'published')
        .not('published_at', 'is', null)
        .gte('published_at', blog60d)
        .order('published_at', { ascending: false })
        .limit(80),

      // Diskusijos su atlikėjo cover (all-time, ≥1 komentaras, top by comment_count)
      sb.from('discussions')
        .select('id, slug, title, author_name, author_avatar, comment_count, created_at, artist:artists!discussions_artist_id_fkey(name, cover_image_url)')
        .eq('is_deleted', false)
        .or('legacy_kind.is.null,legacy_kind.eq.discussion')
        .gte('comment_count', 1)
        .order('comment_count', { ascending: false })
        .limit(20),
    ])

    // ── Dienos daina (šiandien lyderis arba vakarykštis laimėtojas) ──────────
    // Agreguojam balsus
    const voteTotals: Record<number, number> = {}
    for (const v of (votesRes.data || []) as any[]) {
      voteTotals[v.nomination_id] = (voteTotals[v.nomination_id] || 0) + v.weight
    }
    const noms = [...((nomRes.data || []) as any[])]
      .sort((a, b) => (voteTotals[b.id] || 0) - (voteTotals[a.id] || 0))
    const topNom = noms[0] || null

    let ddItem: any = null
    if (topNom) {
      // Šiandien lyderis
      const track = topNom.tracks
      const artist = Array.isArray(track?.artists) ? track.artists[0] : track?.artists
      ddItem = {
        id: `dd_today_${topNom.id}`,
        type: 'dd',
        subtype: 'today_leader',
        title: track?.title || 'Dienos daina',
        href: '/dienos-daina',
        cover: ytThumb(track?.video_url) || track?.cover_url || artist?.cover_image_url || null,
        author_name: artist?.name || null,
        author_slug: artist?.slug || null,
        author_avatar: null,
        created_at: today,
        vote_count: voteTotals[topNom.id] || 0,
        vote_total: noms.length,
      }
    } else if (pastWinnerRes.data) {
      // Vakarykštis laimėtojas
      const w = pastWinnerRes.data as any
      const track = w.tracks
      const artist = Array.isArray(track?.artists) ? track.artists[0] : track?.artists
      ddItem = {
        id: `dd_past_${w.id}`,
        type: 'dd',
        subtype: 'yesterday_winner',
        title: track?.title || 'Dienos daina',
        href: '/dienos-daina',
        cover: ytThumb(track?.video_url) || track?.cover_url || artist?.cover_image_url || null,
        author_name: artist?.name || null,
        author_slug: artist?.slug || null,
        author_avatar: null,
        created_at: w.date,
        vote_count: null,
        vote_total: null,
      }
    }

    // ── Blog įrašai — thumbnail resolve ──────────────────────────────────────
    const blogRows = (blogRes.data || []) as any[]
    const needThumb = blogRows.filter(b => !b.cover_image_url).map(b => b.id)
    const thumbByPost = new Map<number, string>()

    if (needThumb.length) {
      const tgtTracks = new Set<number>(), tgtAlbums = new Set<number>(), tgtArtists = new Set<number>()
      for (const b of blogRows) {
        if (thumbByPost.has(b.id) || b.cover_image_url) continue
        if (b.target_track_id) tgtTracks.add(b.target_track_id)
        if (b.target_album_id) tgtAlbums.add(b.target_album_id)
        if (b.target_artist_id) tgtArtists.add(b.target_artist_id)
      }
      try {
        const [tj, aj, arj, tgtT, tgtA, tgtAr] = await Promise.all([
          sb.from('blog_post_tracks').select('post_id, tracks:track_id(video_url, cover_url, artist:artist_id(cover_image_url))').in('post_id', needThumb),
          sb.from('blog_post_albums').select('post_id, albums:album_id(cover_image_url)').in('post_id', needThumb),
          sb.from('blog_post_artists').select('post_id, artists:artist_id(cover_image_url)').in('post_id', needThumb),
          tgtTracks.size ? sb.from('tracks').select('id, cover_url, video_url, artist:artist_id(cover_image_url)').in('id', [...tgtTracks]) : Promise.resolve({ data: [] }),
          tgtAlbums.size ? sb.from('albums').select('id, cover_image_url').in('id', [...tgtAlbums]) : Promise.resolve({ data: [] }),
          tgtArtists.size ? sb.from('artists').select('id, cover_image_url').in('id', [...tgtArtists]) : Promise.resolve({ data: [] }),
        ])
        for (const row of (tj.data || []) as any[]) {
          if (thumbByPost.has(row.post_id)) continue
          const t = Array.isArray(row.tracks) ? row.tracks[0] : row.tracks
          if (!t) continue
          const img = ytThumb(t.video_url) || t.cover_url || (Array.isArray(t.artist) ? t.artist[0]?.cover_image_url : t.artist?.cover_image_url) || null
          if (img) thumbByPost.set(row.post_id, img)
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
        // target_* resolve
        const trackImgById = new Map<number, string | null>()
        for (const t of (tgtT.data || []) as any[]) {
          const img = ytThumb(t.video_url) || t.cover_url || (Array.isArray(t.artist) ? t.artist[0]?.cover_image_url : t.artist?.cover_image_url) || null
          trackImgById.set(t.id, img)
        }
        const albumImgById = new Map<number, string>((tgtA.data || []).map((a: any) => [a.id, a.cover_image_url]))
        const artistImgById = new Map<number, string>((tgtAr.data || []).map((a: any) => [a.id, a.cover_image_url]))
        for (const b of blogRows) {
          if (thumbByPost.has(b.id) || b.cover_image_url) continue
          const img =
            (b.target_track_id && trackImgById.get(b.target_track_id)) ||
            (b.target_album_id && albumImgById.get(b.target_album_id)) ||
            (b.target_artist_id && artistImgById.get(b.target_artist_id)) || null
          if (img) thumbByPost.set(b.id, img)
        }
      } catch {}
    }

    // Topas tipo įrašai: bandome gauti pirmą list_items[0].image_url
    for (const b of blogRows) {
      if (thumbByPost.has(b.id) || b.cover_image_url || b.post_type !== 'topas') continue
      const items = Array.isArray(b.list_items) ? b.list_items : []
      const first = items[0]
      if (first?.image_url) thumbByPost.set(b.id, first.image_url)
    }

    // ── Blog items array ──────────────────────────────────────────────────────
    // Legacy UGC įrašai neturi blog_id → blogs/profiles = null → neskipinam,
    // naudojam post-level dedup key (mirror atradimai/feed).
    const seenAuthors = new Set<string>()
    const blogItems: any[] = []
    for (const b of blogRows) {
      if (!b.title) continue
      const cover = b.cover_image_url || thumbByPost.get(b.id) || null
      const author = b.blogs?.profiles || null
      const key = author?.username || author?.id || `post-${b.id}`
      if (seenAuthors.has(key)) continue
      seenAuthors.add(key)
      const blogSlug = b.blogs?.slug || author?.username || null
      blogItems.push({
        id: `blog-${b.id}`,
        type: 'blog',
        subtype: b.post_type || null,
        title: b.title,
        href: blogSlug ? `/blogas/${blogSlug}/${b.slug || b.id}` : '/blogas',
        cover,
        author_name: author?.full_name || author?.username || null,
        author_slug: author?.username || null,
        author_avatar: author?.avatar_url || null,
        created_at: b.published_at,
        engagement: (b.like_count || 0) + (b.comment_count || 0),
      })
    }
    blogItems.sort((a, b) => b.engagement - a.engagement || (a.created_at < b.created_at ? 1 : -1))

    // ── Diskusijų items array ─────────────────────────────────────────────────
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

    // ── Merge 2:1 (blog:disc), maks 12, DD kortelė į priekį ─────────────────
    const merged: any[] = []
    let bi = 0, di = 0
    while (merged.length < 12 && (bi < blogItems.length || di < discItems.length)) {
      if (bi < blogItems.length) merged.push(blogItems[bi++])
      if (bi < blogItems.length && merged.length < 12) merged.push(blogItems[bi++])
      if (di < discItems.length && merged.length < 12) merged.push(discItems[di++])
    }

    const items = ddItem ? [ddItem, ...merged] : merged

    return NextResponse.json({ items }, {
      headers: { 'Cache-Control': 'public, s-maxage=180, stale-while-revalidate=360' },
    })
  } catch (e: any) {
    return NextResponse.json({ items: [] }, { status: 200 })
  }
}
