// app/vartotojas/[username]/page.tsx
//
// V11 — 3-col hero (avatar+pop | equalizer-mini | mood-song) + 6 full-width
// sekcijos. Mėgstamų atlikėjų KOLIAŽAS reikia counts'ų pagal pamėgtų
// albumų/dainų kiekį atlikėjui. Mėgstamų albumų SORT pagal kiek to albumo
// dainų pamėgtų. Žemiau enrichment'as: per album_tracks junction'ą
// suskaičiuojam kiek user'io patiktų track'ų priklauso kiekvienam albumui,
// ir grupuojam patiktų albumų/track'ų counts'us per artist_id.

import { notFound } from 'next/navigation'
import {
  getProfileByUsername,
  getProfileFavoriteArtists,
  getProfileFavoriteStyles,
  getProfileFavoriteAlbums,
  getProfileFavoriteTracks,
  getProfileLikesCounts,
  getProfileFriends,
  getBlogByUserId,
  getUserContentStats,
  getDailySongPicks,
  getMoodSongTrack,
  getUserTranslations,
  getUserRecentComments,
} from '@/lib/supabase-blog'
import { createAdminClient } from '@/lib/supabase'
import type { Metadata } from 'next'
import { ProfileClient } from './profile-client'

type Props = { params: Promise<{ username: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params
  const profile = await getProfileByUsername(username)
  if (!profile) return { title: 'Nerastas — music.lt' }
  return {
    title: `${profile.full_name || profile.username} — music.lt`,
    description: profile.bio || `${profile.full_name || username} muzikos profilis`,
  }
}

export default async function UserProfilePage({ params }: Props) {
  const { username } = await params
  const profile: any = await getProfileByUsername(username)
  if (!profile || !profile.is_public) notFound()

  const [favoriteArtists, favoriteStyles, favoriteAlbumsRaw, favoriteTracksRaw, likesCounts, friends, blog, stats, moodTrack, dailyPicks, translations, recentComments] = await Promise.all([
    // V11: bump favorites iki 100, kad sekcijos turėtų ką rodyti pilnam
    // grid'e + sort'avimui. Power user'iams (>100) papildomas filtravimas
    // per +Daugiau modal'ą.
    getProfileFavoriteArtists(profile.id),
    getProfileFavoriteStyles(profile.id),
    getProfileFavoriteAlbums(profile.username, 100),
    getProfileFavoriteTracks(profile.username, 100),
    getProfileLikesCounts(profile.username),
    getProfileFriends(profile.id, 24),
    getBlogByUserId(profile.id),
    getUserContentStats(profile.id),
    getMoodSongTrack(profile.mood_song_track_id ?? null),
    getDailySongPicks(profile.id, 18),
    getUserTranslations(profile.id, 4),
    getUserRecentComments(profile.username, 10),
  ])

  // ── V11 ENRICHMENT: artist collage counts + album liked-track counts ──
  // Per album_tracks junction'ą skaičiuojam kiek user'io pamėgtų track'ų
  // priklauso kiekvienam albumui (album sort), tada grupuojam pamėgtų
  // albumų ir track'ų counts'us per artist_id (collage tile sizing).
  const albumLikedTrackCount = new Map<number, number>()
  const artistTrackLikes = new Map<number, number>()
  const artistAlbumLikes = new Map<number, number>()

  // Album track-count: per loaded favoriteTracksRaw → album_tracks join
  const trackIds = (favoriteTracksRaw as any[]).map((t) => t.id).filter(Boolean)
  if (trackIds.length > 0) {
    const sb = createAdminClient()
    const { data: atRows } = await sb
      .from('album_tracks')
      .select('album_id, track_id')
      .in('track_id', trackIds)
    for (const row of (atRows || []) as any[]) {
      albumLikedTrackCount.set(row.album_id, (albumLikedTrackCount.get(row.album_id) || 0) + 1)
    }
  }

  // Per-artist counts (iš loaded favorites — approx, bet pakanka collage'o
  // tile sizing'ui).
  for (const a of (favoriteAlbumsRaw as any[])) {
    const aid = a.artist_id
    if (!aid) continue
    artistAlbumLikes.set(aid, (artistAlbumLikes.get(aid) || 0) + 1)
  }
  for (const t of (favoriteTracksRaw as any[])) {
    const aid = t.artist_id
    if (!aid) continue
    artistTrackLikes.set(aid, (artistTrackLikes.get(aid) || 0) + 1)
  }

  // Annotate kollektivus
  const favoriteAlbums = (favoriteAlbumsRaw as any[]).map((al) => ({
    ...al,
    liked_track_count: albumLikedTrackCount.get(al.id) || 0,
  }))
  const favoriteTracks = favoriteTracksRaw as any[]
  const enrichedArtists = (favoriteArtists as any[]).map((a) => ({
    ...a,
    liked_album_count: artistAlbumLikes.get(a.id) || 0,
    liked_track_count: artistTrackLikes.get(a.id) || 0,
    affinity_score: (artistAlbumLikes.get(a.id) || 0) + (artistTrackLikes.get(a.id) || 0),
  }))

  let regularPosts: any[] = []
  let topasPosts: any[] = []
  if (blog) {
    const sb = createAdminClient()
    const { data } = await sb
      .from('blog_posts')
      .select('id, slug, title, summary, cover_image_url, content, published_at, reading_time_min, like_count, comment_count, post_type, tags, list_items')
      .eq('blog_id', blog.id)
      .eq('status', 'published')
      .lte('published_at', new Date().toISOString())
      .order('published_at', { ascending: false })
      .limit(30)
    const all = data || []

    // V10: post hero image enrichment chain (mirror'ina blog post hero
    // logiką iš app/blogas/[username]/[slug]/page.tsx):
    //   1. cover_image_url (explicit)
    //   2. firstJunctionCover (blog_post_albums → albums.cover_image_url,
    //      blog_post_tracks → tracks.cover_url/YT thumb, blog_post_artists)
    //   3. firstListItemImage (topas list_items[0].image_url)
    // Užtikrinam, kad PROFILE LISTING kortelės atrodytų taip pat „rich"
    // kaip ir pats post page'as.
    const postIds = all.map((p: any) => p.id)
    if (postIds.length > 0) {
      const [trackAttachRes, albumAttachRes, artistAttachRes] = await Promise.all([
        sb.from('blog_post_tracks').select('post_id, tracks:track_id(video_url, cover_url, artist:artist_id(cover_image_url))').in('post_id', postIds),
        sb.from('blog_post_albums').select('post_id, albums:album_id(cover_image_url)').in('post_id', postIds),
        sb.from('blog_post_artists').select('post_id, artists:artist_id(cover_image_url)').in('post_id', postIds),
      ])

      const thumbByPost = new Map<string, string>()

      // 1. tracks (first wins)
      for (const row of (trackAttachRes.data || []) as any[]) {
        if (thumbByPost.has(row.post_id)) continue
        const t = Array.isArray(row.tracks) ? row.tracks[0] : row.tracks
        if (!t) continue
        const yt = t.video_url?.match?.(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/)?.[1]
        const url = yt
          ? `https://img.youtube.com/vi/${yt}/mqdefault.jpg`
          : t.cover_url || (Array.isArray(t.artist) ? t.artist[0]?.cover_image_url : t.artist?.cover_image_url) || null
        if (url) thumbByPost.set(row.post_id, url)
      }
      // 2. albums
      for (const row of (albumAttachRes.data || []) as any[]) {
        if (thumbByPost.has(row.post_id)) continue
        const a = Array.isArray(row.albums) ? row.albums[0] : row.albums
        if (a?.cover_image_url) thumbByPost.set(row.post_id, a.cover_image_url)
      }
      // 3. artists
      for (const row of (artistAttachRes.data || []) as any[]) {
        if (thumbByPost.has(row.post_id)) continue
        const a = Array.isArray(row.artists) ? row.artists[0] : row.artists
        if (a?.cover_image_url) thumbByPost.set(row.post_id, a.cover_image_url)
      }
      // 4. topas list_items first image (jau yra post.list_items)
      for (const p of all) {
        if (!p.cover_image_url && !thumbByPost.has(p.id)
            && p.post_type === 'topas' && Array.isArray(p.list_items)) {
          const firstImg = p.list_items.find((it: any) => it?.image_url)?.image_url
          if (firstImg) thumbByPost.set(p.id, firstImg)
        }
      }

      // 5. V11.2 fallback: extract first <img src="..."> arba YouTube embed
      //    iš `content` (kolona blog_posts'e — ne content_html). Catch'ina
      //    paprastus straipsnius su inline media, kurių junction tables tuščios.
      const IMG_RE = /<img[^>]+src=["']([^"']+)["']/i
      const YT_RE_HTML = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/
      for (const p of all) {
        if (!p.cover_image_url && !thumbByPost.has(p.id) && p.content) {
          const html = String(p.content)
          const yt = html.match(YT_RE_HTML)?.[1]
          if (yt) {
            thumbByPost.set(p.id, `https://img.youtube.com/vi/${yt}/mqdefault.jpg`)
            continue
          }
          const img = html.match(IMG_RE)?.[1]
          if (img && img.startsWith('http')) {
            thumbByPost.set(p.id, img)
          }
        }
      }

      for (const p of all) {
        if (!p.cover_image_url && thumbByPost.has(p.id)) {
          ;(p as any).fallback_thumb_url = thumbByPost.get(p.id)
        }
        // V11.2: nepersiunčiam content'o į client'ą — sutaupom payload.
        delete (p as any).content
      }
    }

    regularPosts = all.filter((p: any) => p.post_type !== 'topas' && p.post_type !== 'translation').slice(0, 6)
    topasPosts = all.filter((p: any) => p.post_type === 'topas').slice(0, 6)
  }

  const memberSinceDate = profile.joined_legacy_at ? new Date(profile.joined_legacy_at) : new Date(profile.created_at)
  const memberSinceYear = memberSinceDate.getFullYear()

  return (
    <ProfileClient
      profile={profile}
      favoriteArtists={enrichedArtists}
      favoriteStyles={favoriteStyles}
      favoriteAlbums={favoriteAlbums}
      favoriteTracks={favoriteTracks}
      likesCounts={likesCounts}
      friends={friends}
      blog={blog}
      regularPosts={regularPosts}
      topasPosts={topasPosts}
      memberSinceYear={memberSinceYear}
      stats={stats}
      moodTrack={moodTrack}
      dailyPicks={dailyPicks}
      translations={translations}
      recentComments={recentComments}
    />
  )
}
