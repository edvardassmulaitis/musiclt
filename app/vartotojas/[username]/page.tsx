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
import EditMyMusicFab from '@/components/profile/EditMyMusicFab'

type Props = { params: Promise<{ username: string }> }

// PERF (2026-06-02): ISR — profilis yra share-worthy puslapis (daug žiūrovų,
// reti pakeitimai). 120s revalidate'as leidžia pakartotiniams vizitams būti
// serve'inamiems iš full-route cache be re-render'io. Savininko pakeitimai
// (mood daina, dienos pasirinkimai) atsispindi per ≤2 min.
export const revalidate = 120

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params
  const profile = await getProfileByUsername(username)
  if (!profile) return { title: 'Nerastas — music.lt' }
  const canonical = `/@${profile.username}`
  const title = `${profile.full_name || profile.username} — music.lt`
  const description = profile.bio || `${profile.full_name || username} muzikos profilis`
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'profile',
      // og:image teikia file-based opengraph-image.tsx (dinaminė kortelė)
    },
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
    // PERF V16 (2026-06-11): 100→48. Klientas rodo max 12 grid'e + 5 sidebar
    // „Neseniai pamėgta"; likusius atidaro MoreItemsModal iš to paties masyvo.
    // 48 pakanka modalui, o serialized payload'as perpus mažesnis.
    getProfileFavoriteAlbums(profile.username, 48),
    getProfileFavoriteTracks(profile.username, 48),
    getProfileLikesCounts(profile.username),
    getProfileFriends(profile.id, 24),
    getBlogByUserId(profile.id),
    getUserContentStats(profile.id),
    getMoodSongTrack(profile.mood_song_track_id ?? null),
    // 21 = ~3 savaitės dienos dainų klasteriams feed'e
    getDailySongPicks(profile.id, 21),
    getUserTranslations(profile.id, 12),
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

  // PERF (2026-06-02): album_tracks enrichment'as ir blog posts block'as
  // nepriklauso vienas nuo kito — leidžiam juos lygiagrečiai (anksčiau buvo
  // sekvenciniai po pirmo Promise.all). album_tracks užpildo
  // albumLikedTrackCount; blog promise grąžina regular/topas postus.
  const albumTracksPromise = (async () => {
    if (trackIds.length === 0) return
    const sb = createAdminClient()
    const { data: atRows } = await sb
      .from('album_tracks')
      .select('album_id, track_id')
      .in('track_id', trackIds)
    for (const row of (atRows || []) as any[]) {
      albumLikedTrackCount.set(row.album_id, (albumLikedTrackCount.get(row.album_id) || 0) + 1)
    }
  })()

  const blogPromise = loadBlogPosts(blog)

  await albumTracksPromise

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

  const { lanes: postLanes, counts: postTypeCounts } = await blogPromise

  const memberSinceDate = profile.joined_legacy_at ? new Date(profile.joined_legacy_at) : new Date(profile.created_at)
  const memberSinceYear = memberSinceDate.getFullYear()

  return (
    <>
    <EditMyMusicFab profileId={profile.id} />
    <ProfileClient
      profile={profile}
      favoriteArtists={enrichedArtists}
      favoriteStyles={favoriteStyles}
      favoriteAlbums={favoriteAlbums}
      favoriteTracks={favoriteTracks}
      likesCounts={likesCounts}
      friends={friends}
      blog={blog}
      postLanes={postLanes}
      postTypeCounts={postTypeCounts}
      memberSinceYear={memberSinceYear}
      stats={stats}
      moodTrack={moodTrack}
      dailyPicks={dailyPicks}
      translations={translations}
      recentComments={recentComments}
    />
    </>
  )
}

const POST_HEAVY_COLS =
  'id, slug, title, summary, cover_image_url, content, published_at, reading_time_min, like_count, comment_count, post_type, creation_subtype, tags, list_items'

// V12 (2026-06-02): hero-image enrichment chain (mirror'ina blog post hero
// logiką iš app/blogas/[username]/[slug]/page.tsx) — paverčia pateiktą postų
// masyvą „rich" (fallback_thumb_url + display_post_type) IN PLACE. Iškelta į
// helper'į, kad galėtume taikyti per-type sample postams (turinio juostoms).
async function enrichPostThumbs(sb: any, posts: any[]) {
  const postIds = posts.map((p: any) => p.id)
  if (postIds.length === 0) return
  const [trackAttachRes, albumAttachRes, artistAttachRes] = await Promise.all([
    sb.from('blog_post_tracks').select('post_id, tracks:track_id(video_url, cover_url, artist:artist_id(cover_image_url))').in('post_id', postIds),
    sb.from('blog_post_albums').select('post_id, albums:album_id(cover_image_url)').in('post_id', postIds),
    sb.from('blog_post_artists').select('post_id, artists:artist_id(cover_image_url)').in('post_id', postIds),
  ])

  const thumbByPost = new Map<string, string>()
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
  for (const row of (albumAttachRes.data || []) as any[]) {
    if (thumbByPost.has(row.post_id)) continue
    const a = Array.isArray(row.albums) ? row.albums[0] : row.albums
    if (a?.cover_image_url) thumbByPost.set(row.post_id, a.cover_image_url)
  }
  for (const row of (artistAttachRes.data || []) as any[]) {
    if (thumbByPost.has(row.post_id)) continue
    const a = Array.isArray(row.artists) ? row.artists[0] : row.artists
    if (a?.cover_image_url) thumbByPost.set(row.post_id, a.cover_image_url)
  }
  for (const p of posts) {
    if (!p.cover_image_url && !thumbByPost.has(p.id)
        && p.post_type === 'topas' && Array.isArray(p.list_items)) {
      const firstImg = p.list_items.find((it: any) => it?.image_url)?.image_url
      if (firstImg) thumbByPost.set(p.id, firstImg)
    }
  }
  const IMG_RE = /<img[^>]+src=["']([^"']+)["']/i
  const YT_RE_HTML = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/
  const BG_IMG_RE = /background-image\s*:\s*url\(['"]?([^'")\s]+)/i
  for (const p of posts) {
    if (!p.cover_image_url && !thumbByPost.has(p.id) && p.content) {
      const html = String(p.content)
      const yt = html.match(YT_RE_HTML)?.[1]
      if (yt) { thumbByPost.set(p.id, `https://img.youtube.com/vi/${yt}/mqdefault.jpg`); continue }
      const img = html.match(IMG_RE)?.[1]
      if (img && img.startsWith('http')) { thumbByPost.set(p.id, img); continue }
      const bg = html.match(BG_IMG_RE)?.[1]
      if (bg && bg.startsWith('http')) thumbByPost.set(p.id, bg)
    }
  }
  const postsWithMusic = new Set<string>()
  for (const r of [
    ...(trackAttachRes.data || []),
    ...(albumAttachRes.data || []),
    ...(artistAttachRes.data || []),
  ] as any[]) {
    if (r.post_id) postsWithMusic.add(r.post_id)
  }
  for (const p of posts) {
    if (!p.cover_image_url && thumbByPost.has(p.id)) p.fallback_thumb_url = thumbByPost.get(p.id)
    if (p.post_type === 'article' && !postsWithMusic.has(p.id)) p.display_post_type = 'self'
    else p.display_post_type = p.post_type
    delete p.content
  }
}

// V12 (2026-06-02): turinio juostos pagal tipą + TIKRI count'ai.
// Anksčiau feed'as load'indavo slice(0,60) ir tab count'ai rodydavo tik
// įkeltą poaibį (25 vietoj 510). Dabar: 1) lengvas count query grupuojam
// per post_type (tikri totalai), 2) kiekvienam tipui atskirai paimam 12
// naujausių sample postų juostai. translation juosta tvarkoma per
// `translations` prop'ą (jau fetch'inta). Tuščio tipo juostos nerodom.
async function loadBlogPosts(blog: any): Promise<{ lanes: { type: string; posts: any[] }[]; counts: Record<string, number> }> {
  if (!blog) return { lanes: [], counts: {} }
  const sb = createAdminClient()
  const nowIso = new Date().toISOString()

  // 1. Tikri count'ai per post_type (lengvas — tik post_type kolona)
  const { data: lite } = await sb
    .from('blog_posts')
    .select('post_type')
    .eq('blog_id', blog.id)
    .eq('status', 'published')
    .lte('published_at', nowIso)
  const counts: Record<string, number> = {}
  for (const r of (lite || []) as any[]) counts[r.post_type] = (counts[r.post_type] || 0) + 1

  // 2. Per-type sample postai juostoms (translation — atskirai per translations prop)
  // V16: +review/+event — feed'as juos rodo atskiromis vaizdingomis kortelėmis
  const LANE_TYPES = ['article', 'review', 'event', 'creation', 'topas']
  const present = LANE_TYPES.filter((t) => (counts[t] || 0) > 0)
  const laneResults = await Promise.all(present.map(async (t) => {
    const { data } = await sb
      .from('blog_posts')
      .select(POST_HEAVY_COLS)
      .eq('blog_id', blog.id)
      .eq('status', 'published')
      .lte('published_at', nowIso)
      .eq('post_type', t)
      .order('published_at', { ascending: false })
      .limit(12)
    return { type: t, posts: (data || []) as any[] }
  }))

  // 3. Enrichinam visus sample postus vienu batch'u
  await enrichPostThumbs(sb, laneResults.flatMap((l) => l.posts))

  // 4. PERF V16: topas list_items gali turėti po 50 pozicijų su image URL'ais —
  // klientui reikia tik top-3 preview + count. Trim'inam prieš serializaciją.
  // DU list_items formatai: naujas {title, artist, image_url} ir legacy
  // {track_title, artist_name, track_legacy_id} (be image_url — resolvinam
  // per tracks.legacy_id → YT thumb žemiau).
  const trackResolve: { preview: any; legacyId: number }[] = []
  const albumResolve: { preview: any; legacyId: number }[] = []
  for (const lane of laneResults) {
    for (const p of lane.posts) {
      if (Array.isArray(p.list_items) && p.list_items.length > 0) {
        p.list_items_count = p.list_items.length
        p.list_items_preview = p.list_items.slice(0, 3).map((it: any) => {
          const preview = {
            title: it?.title ?? it?.track_title ?? it?.name ?? null,
            artist: it?.artist_name ?? it?.artist ?? it?.subtitle ?? null,
            image_url: it?.image_url ?? null,
          }
          if (it?.track_legacy_id && (!preview.image_url || !preview.title)) {
            trackResolve.push({ preview, legacyId: it.track_legacy_id })
          } else if (it?.album_legacy_id && (!preview.image_url || !preview.title)) {
            albumResolve.push({ preview, legacyId: it.album_legacy_id })
          }
          return preview
        })
      }
      delete p.list_items
    }
  }

  // Legacy preview title/thumb resolve dviem batch'ais (track + album)
  const YT_RE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/
  if (trackResolve.length > 0) {
    const ids = [...new Set(trackResolve.map((x) => x.legacyId))]
    const { data: trs } = await sb
      .from('tracks')
      .select('legacy_id, title, video_url, cover_url')
      .in('legacy_id', ids)
    const byLegacy = new Map<number, any>()
    for (const t of (trs || []) as any[]) if (t.legacy_id != null) byLegacy.set(t.legacy_id, t)
    for (const { preview, legacyId } of trackResolve) {
      const t = byLegacy.get(legacyId)
      if (!t) continue
      if (!preview.title) preview.title = t.title
      if (!preview.image_url) {
        const yt = t.video_url?.match?.(YT_RE)?.[1]
        preview.image_url = yt ? `https://img.youtube.com/vi/${yt}/mqdefault.jpg` : t.cover_url || null
      }
    }
  }
  if (albumResolve.length > 0) {
    const ids = [...new Set(albumResolve.map((x) => x.legacyId))]
    const { data: als } = await sb
      .from('albums')
      .select('legacy_id, title, cover_image_url')
      .in('legacy_id', ids)
    const byLegacy = new Map<number, any>()
    for (const a of (als || []) as any[]) if (a.legacy_id != null) byLegacy.set(a.legacy_id, a)
    for (const { preview, legacyId } of albumResolve) {
      const a = byLegacy.get(legacyId)
      if (!a) continue
      if (!preview.title) preview.title = a.title
      if (!preview.image_url) preview.image_url = a.cover_image_url || null
    }
  }

  return { lanes: laneResults, counts }
}
