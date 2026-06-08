// app/api/home/community/route.ts
//
// GET /api/home/community → { items: CommunityItem[] }
//
// items[0] = Dienos daina (šiandien lyderis + kiti kandidatai)
// items[1..] = blog + diskusijos, 1 PER TIPĄ taisyklė:
//   tik 1 topas / 1 review / 1 creation / 1 translation / 1 discussion / ...
//
// Filtravimas:
//   - diskusijos: tik su activity paskutiniais 2 metais
//   - forum_posts: latest comment be parent_post_legacy_id filtro

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
function first<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

export async function GET() {
  const sb = createAdminClient()
  const today = todayLT()
  const blog60d = new Date(Date.now() - 60 * 86400000).toISOString()
  const disc2y  = new Date(Date.now() - 2 * 365 * 86400000).toISOString()

  try {
    const [nomRes, votesRes, pastWinnerRes, blogRes, discRes] = await Promise.all([
      // Šiandieninės nominacijos (DD lyderis + kandidatai)
      sb.from('daily_song_nominations')
        .select('id, tracks!track_id(title, slug, cover_url, video_url, artists!artist_id(name, slug, cover_image_url))')
        .eq('date', today)
        .is('removed_at', null)
        .limit(20),

      // Balsai šiandien
      sb.from('daily_song_votes').select('nomination_id, weight').eq('date', today),

      // Vakarykštis laimėtojas (fallback)
      sb.from('daily_song_winners')
        .select('id, date, tracks!track_id(title, slug, cover_url, video_url, artists!artist_id(name, slug, cover_image_url))')
        .lt('date', today).order('date', { ascending: false }).limit(1).maybeSingle(),

      // Blog įrašai
      sb.from('blog_posts')
        .select('id, slug, title, post_type, editorial_type, summary, cover_image_url, like_count, comment_count, published_at, list_items, target_track_id, target_album_id, target_artist_id, target_event_id, blogs:blog_id(slug, profiles:user_id(id, username, full_name, avatar_url))')
        .eq('status', 'published')
        .not('published_at', 'is', null)
        .gte('published_at', blog60d)
        .order('published_at', { ascending: false })
        .limit(80),

      // Diskusijos: activity 2y+, sort by last_comment_at, +legacy_id
      sb.from('discussions')
        .select('id, slug, title, author_name, author_avatar, comment_count, created_at, last_comment_at, legacy_id, artist:artists!discussions_artist_id_fkey(name, cover_image_url)')
        .eq('is_deleted', false)
        .or('legacy_kind.is.null,legacy_kind.eq.discussion')
        .gte('comment_count', 1)
        .gte('last_comment_at', disc2y)
        .order('last_comment_at', { ascending: false, nullsFirst: false })
        .limit(20),
    ])

    // ── Dienos daina ──────────────────────────────────────────────────────────
    const voteTotals: Record<number, number> = {}
    for (const v of (votesRes.data || []) as any[]) {
      voteTotals[v.nomination_id] = (voteTotals[v.nomination_id] || 0) + v.weight
    }
    const noms = [...((nomRes.data || []) as any[])]
      .sort((a, b) => (voteTotals[b.id] || 0) - (voteTotals[a.id] || 0))

    const makeDDCover = (nom: any) => {
      const track = nom.tracks
      const artist = first<any>(track?.artists)
      return ytThumb(track?.video_url) || track?.cover_url || artist?.cover_image_url || null
    }
    const makeDDName = (nom: any) => first<any>(nom.tracks?.artists)?.name || null

    let ddItem: any = null
    if (noms.length) {
      const top = noms[0]
      const track = top.tracks
      const artist = first<any>(track?.artists)
      ddItem = {
        id: `dd_today_${top.id}`,
        type: 'dd', subtype: 'today_leader',
        title: track?.title || 'Dienos daina', href: '/dienos-daina',
        cover: makeDDCover(top),
        author_name: artist?.name || null, author_slug: artist?.slug || null, author_avatar: null,
        created_at: today,
        vote_count: voteTotals[top.id] || 0, vote_total: noms.length,
        // Kiti kandidatai (max 3)
        candidates: noms.slice(1, 4).map(n => ({
          title: n.tracks?.title || '?',
          artist: makeDDName(n),
          cover: makeDDCover(n),
          votes: voteTotals[n.id] || 0,
        })),
      }
    } else if (pastWinnerRes.data) {
      const w = pastWinnerRes.data as any
      const track = w.tracks
      const artist = first<any>(track?.artists)
      ddItem = {
        id: `dd_past_${w.id}`,
        type: 'dd', subtype: 'yesterday_winner',
        title: track?.title || 'Dienos daina', href: '/dienos-daina',
        cover: ytThumb(track?.video_url) || track?.cover_url || artist?.cover_image_url || null,
        author_name: artist?.name || null, author_slug: artist?.slug || null, author_avatar: null,
        created_at: w.date, vote_count: null, vote_total: null, candidates: [],
      }
    }

    // ── Blog — thumbnail resolve ──────────────────────────────────────────────
    const blogRows = (blogRes.data || []) as any[]
    const needThumb = blogRows.filter(b => !b.cover_image_url).map(b => b.id)
    const thumbByPost = new Map<number, string>()

    if (needThumb.length) {
      const tgtTracks = new Set<number>(), tgtAlbums = new Set<number>(), tgtArtists = new Set<number>()
      const topasTracks = new Set<number>(), topasArtists = new Set<number>()
      for (const b of blogRows) {
        if (b.cover_image_url) continue
        if (b.target_track_id) tgtTracks.add(b.target_track_id)
        if (b.target_album_id) tgtAlbums.add(b.target_album_id)
        if (b.target_artist_id) tgtArtists.add(b.target_artist_id)
        if (b.post_type === 'topas' && Array.isArray(b.list_items)) {
          for (const e of b.list_items.slice(0, 3)) {
            if (e.image_url) break
            if (e.entity_id) {
              if (e.type === 'artist') topasArtists.add(e.entity_id)
              else if (e.type === 'track') topasTracks.add(e.entity_id)
            }
          }
        }
      }
      try {
        const [tj, aj, arj, tgtT, tgtA, tgtAr, tpT, tpAr] = await Promise.all([
          sb.from('blog_post_tracks').select('post_id, tracks:track_id(video_url, cover_url, artist:artist_id(cover_image_url))').in('post_id', needThumb),
          sb.from('blog_post_albums').select('post_id, albums:album_id(cover_image_url)').in('post_id', needThumb),
          sb.from('blog_post_artists').select('post_id, artists:artist_id(cover_image_url)').in('post_id', needThumb),
          tgtTracks.size ? sb.from('tracks').select('id, cover_url, video_url, artist:artist_id(cover_image_url)').in('id', [...tgtTracks]) : Promise.resolve({ data: [] }),
          tgtAlbums.size ? sb.from('albums').select('id, cover_image_url').in('id', [...tgtAlbums]) : Promise.resolve({ data: [] }),
          tgtArtists.size ? sb.from('artists').select('id, cover_image_url').in('id', [...tgtArtists]) : Promise.resolve({ data: [] }),
          topasTracks.size ? sb.from('tracks').select('id, cover_url, video_url, artist:artist_id(cover_image_url)').in('id', [...topasTracks]) : Promise.resolve({ data: [] }),
          topasArtists.size ? sb.from('artists').select('id, cover_image_url').in('id', [...topasArtists]) : Promise.resolve({ data: [] }),
        ])
        const trackImgOf = (t: any) => ytThumb(t.video_url) || t.cover_url || first<any>(t.artist)?.cover_image_url || null
        for (const row of (tj.data || []) as any[]) {
          if (thumbByPost.has(row.post_id)) continue
          const t = first<any>(row.tracks); if (!t) continue
          const img = trackImgOf(t); if (img) thumbByPost.set(row.post_id, img)
        }
        for (const row of (aj.data || []) as any[]) {
          if (thumbByPost.has(row.post_id)) continue
          const a = first<any>(row.albums); if (a?.cover_image_url) thumbByPost.set(row.post_id, a.cover_image_url)
        }
        for (const row of (arj.data || []) as any[]) {
          if (thumbByPost.has(row.post_id)) continue
          const a = first<any>(row.artists); if (a?.cover_image_url) thumbByPost.set(row.post_id, a.cover_image_url)
        }
        const tgtTrackImg = new Map<number, string | null>()
        for (const t of (tgtT.data || []) as any[]) tgtTrackImg.set(t.id, trackImgOf(t))
        const tgtAlbumImg = new Map<number, string>((tgtA.data || []).map((a: any) => [a.id, a.cover_image_url]))
        const tgtArtistImg = new Map<number, string>((tgtAr.data || []).map((a: any) => [a.id, a.cover_image_url]))
        const topTrackImg = new Map<number, string | null>()
        for (const t of (tpT.data || []) as any[]) topTrackImg.set(t.id, trackImgOf(t))
        const topArtistImg = new Map<number, string>((tpAr.data || []).map((a: any) => [a.id, a.cover_image_url]))

        for (const b of blogRows) {
          if (thumbByPost.has(b.id) || b.cover_image_url) continue
          const img =
            (b.target_track_id && tgtTrackImg.get(b.target_track_id)) ||
            (b.target_album_id && tgtAlbumImg.get(b.target_album_id)) ||
            (b.target_artist_id && tgtArtistImg.get(b.target_artist_id)) || null
          if (img) { thumbByPost.set(b.id, img); continue }
          if (b.post_type === 'topas' && Array.isArray(b.list_items)) {
            for (const e of b.list_items.slice(0, 3)) {
              if (e.image_url) { thumbByPost.set(b.id, e.image_url); break }
              const eImg = (e.entity_id && e.type === 'artist' && topArtistImg.get(e.entity_id)) ||
                           (e.entity_id && e.type === 'track' && topTrackImg.get(e.entity_id)) || null
              if (eImg) { thumbByPost.set(b.id, eImg); break }
            }
          }
        }
      } catch {}
    }

    // ── Blog items — 1-per-type ───────────────────────────────────────────────
    const typeSeen = new Set<string>()
    const blogItems: any[] = []
    for (const b of blogRows) {
      if (!b.title) continue
      const author = b.blogs?.profiles || null

      // 1-per-type taisyklė (article → skaidome pagal editorial_type)
      const tkey = b.post_type === 'review'
        ? (b.target_event_id ? 'review_event' : b.target_album_id ? 'review_album' : 'review_track')
        : b.post_type === 'article'
          ? `article_${b.editorial_type || 'kita'}`
          : (b.post_type || 'article_kita')
      if (typeSeen.has(tkey)) continue
      typeSeen.add(tkey)

      const cover = b.cover_image_url || thumbByPost.get(b.id) || null
      const blogSlug = b.blogs?.slug || author?.username || null

      // Topas entries (top 3)
      let entries: any[] | null = null
      if (b.post_type === 'topas' && Array.isArray(b.list_items) && b.list_items.length) {
        entries = (b.list_items as any[])
          .sort((a, z) => (a.rank ?? a.position ?? 99) - (z.rank ?? z.position ?? 99))
          .slice(0, 3)
          .map((e, i) => ({
            rank: e.rank ?? e.position ?? i + 1,
            title: e.title || e.track_title || e.artist_name || '',
            artist: e.artist || e.artist_name || null,
            image: e.image_url || null,
          }))
      }

      const excerpt = b.summary
        ? (b.summary.length > 100 ? b.summary.slice(0, 100).trimEnd() + '…' : b.summary)
        : null

      blogItems.push({
        id: `blog-${b.id}`, type: 'blog', subtype: b.post_type || null,
        editorial_type: b.editorial_type || null,
        title: b.title, href: blogSlug ? `/blogas/${blogSlug}/${b.slug || b.id}` : '/blogas',
        cover, excerpt, entries,
        author_name: author?.full_name || author?.username || null,
        author_slug: author?.username || null,
        author_avatar: author?.avatar_url || null,
        created_at: b.published_at,
        engagement: (b.like_count || 0) + (b.comment_count || 0),
      })
    }
    // Kūryba / vertimas į galą (mažiau universal interest)
    const LAST_SUBTYPES = new Set(['creation', 'translation'])
    blogItems.sort((a, b) => {
      const aLast = LAST_SUBTYPES.has(a.subtype || '')
      const bLast = LAST_SUBTYPES.has(b.subtype || '')
      if (aLast !== bLast) return aLast ? 1 : -1
      return b.engagement - a.engagement || (a.created_at < b.created_at ? 1 : -1)
    })

    // ── Diskusijos — 1 vnt, latest comment iš forum_posts ────────────────────
    // SVARBU: nefiltruojam parent_post_legacy_id — norim paskutinį bet kokį postą
    const discRows = (discRes.data || []) as any[]
    const legacyIds = discRows.map(d => d.legacy_id).filter(Boolean) as number[]
    const lastCommentByLegacy = new Map<number, { text: string; author: string | null; avatar: string | null; time: string }>()
    if (legacyIds.length) {
      try {
        const { data: posts } = await sb
          .from('forum_posts')
          .select('thread_legacy_id, content_text, author_username, author_avatar_url, created_at')
          .in('thread_legacy_id', legacyIds)
          // BEZ parent_post_legacy_id filtro — norim PASKUTINĮ komentarą, ne tik top-level
          .order('created_at', { ascending: false })
          .limit(100)
        for (const p of (posts || []) as any[]) {
          if (lastCommentByLegacy.has(p.thread_legacy_id)) continue
          const text = (p.content_text || '').replace(/\s+/g, ' ').trim()
          lastCommentByLegacy.set(p.thread_legacy_id, {
            text: text.length > 110 ? text.slice(0, 110).trimEnd() + '…' : text,
            author: p.author_username || null,
            avatar: p.author_avatar_url || null,
            time: p.created_at,
          })
        }
      } catch {}
    }

    // Tik 1 diskusija (1-per-type)
    const discItems: any[] = []
    for (const d of discRows.slice(0, 1)) {
      const artist = first<any>(d.artist)
      const lastComment = d.legacy_id ? (lastCommentByLegacy.get(d.legacy_id) || null) : null
      discItems.push({
        id: `disc-${d.id}`, type: 'discussion',
        title: d.title || '', href: `/diskusijos/${d.slug || d.id}`,
        cover: artist?.cover_image_url || null,
        author_name: d.author_name || null, author_avatar: d.author_avatar || null,
        created_at: d.last_comment_at || d.created_at,
        comment_count: d.comment_count || 0,
        last_comment: lastComment,
      })
    }

    // ── Merge: blog + disc interleaved, DD pirmasis ───────────────────────────
    const merged: any[] = []
    let bi = 0, di = 0
    while (merged.length < 10 && (bi < blogItems.length || di < discItems.length)) {
      if (bi < blogItems.length) merged.push(blogItems[bi++])
      if (bi < blogItems.length && merged.length < 10) merged.push(blogItems[bi++])
      if (di < discItems.length && merged.length < 10) merged.push(discItems[di++])
    }

    const items = ddItem ? [ddItem, ...merged] : merged
    return NextResponse.json({ items }, {
      headers: { 'Cache-Control': 'public, s-maxage=180, stale-while-revalidate=360' },
    })
  } catch (e: any) {
    return NextResponse.json({ items: [] }, { status: 200 })
  }
}
