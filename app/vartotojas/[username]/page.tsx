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
  getProfileFriends,
  getBlogByUserId,
  getUserContentStats,
  getDailySongPicks,
  getMoodSongTrack,
  getUserTranslations,
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

  const [favoriteArtists, favoriteStyles, friends, blog, stats, moodTrack, dailyPicks, translations] = await Promise.all([
    getProfileFavoriteArtists(profile.id),
    getProfileFavoriteStyles(profile.id),
    getProfileFriends(profile.id, 24),
    getBlogByUserId(profile.id),
    getUserContentStats(profile.id),
    getMoodSongTrack(profile.mood_song_track_id ?? null),
    getDailySongPicks(profile.id, 12),
    getUserTranslations(profile.id, 4),
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
      friends={friends}
      blog={blog}
      regularPosts={regularPosts}
      topasPosts={topasPosts}
      memberSinceYear={memberSinceYear}
      stats={stats}
      moodTrack={moodTrack}
      dailyPicks={dailyPicks}
      translations={translations}
    />
  )
}
