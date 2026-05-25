// app/vartotojas/[username]/page.tsx
//
// V5 — dense dashboard layout:
//   - Hero kompaktiškas, minimum stats (tik kelios chip'ai), bio paslėpta
//     po expand button'u
//   - Side equalizer su FIXED canonical order (GENRE_COLORS array =
//     top menu Muzika tvarka), bars CLICKABLE — pasirinkus stilių, rodomi
//     to stiliaus mėgstami atlikėjai dešinėje
//   - Po hero — content sekcijos 2-col layout, nepilkam plotis
//
// Client component (vartotojas-profile-client.tsx) reikia state'ui equalizer
// selectedGenre + filtered artists rendering.

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

  const [favoriteArtists, favoriteStyles, favoriteAlbums, favoriteTracks, likesCounts, friends, blog, stats, moodTrack, dailyPicks, translations, recentComments] = await Promise.all([
    // V10: rodome platesnius mėgstamų sąrašus, +Daugiau modal'as įgalina
    // pilną filtravimą.
    getProfileFavoriteArtists(profile.id),
    getProfileFavoriteStyles(profile.id),
    getProfileFavoriteAlbums(profile.username, 36),
    getProfileFavoriteTracks(profile.username, 36),
    getProfileLikesCounts(profile.username),
    getProfileFriends(profile.id, 24),
    getBlogByUserId(profile.id),
    getUserContentStats(profile.id),
    getMoodSongTrack(profile.mood_song_track_id ?? null),
    getDailySongPicks(profile.id, 18),
    getUserTranslations(profile.id, 4),
    getUserRecentComments(profile.username, 10),
  ])

  let regularPosts: any[] = []
  let topasPosts: any[] = []
  if (blog) {
    const sb = createAdminClient()
    const { data } = await sb
      .from('blog_posts')
      .select('id, slug, title, summary, cover_image_url, published_at, reading_time_min, like_count, comment_count, post_type, tags, list_items')
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

      for (const p of all) {
        if (!p.cover_image_url && thumbByPost.has(p.id)) {
          ;(p as any).fallback_thumb_url = thumbByPost.get(p.id)
        }
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
      favoriteArtists={favoriteArtists}
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
