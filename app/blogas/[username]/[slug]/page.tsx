// app/blogas/[username]/[slug]/page.tsx
//
// Single blog post puslapis. Player'is (sidebar) VISADA naudoja mūsų DB
// suvestas susijusias dainas ir groja per YouTube — Spotify embed'ai atmetami
// (žr. lib/blog-player.ts buildBlogPlayerTracks). Stilius = atlikėjo puslapio
// PlayerCard. Komentarai per unified EntityCommentsBlock.
//
// GREITAVEIKA (2026-06-18): (a) ISR cache `revalidate` — puslapis cache'inamas
// per URL, pakartotiniai užkrovimai akimirksniu (stale-while-revalidate);
// (b) DB užklausos paraleliai (Promise.all); (c) NEbedarom lėtų oEmbed network
// call'ų — player'is naudoja DB dainas, o body YouTube embed'ai naudojami tik
// kaip fallback'as (YT thumbnail + id pakanka be oEmbed).

import { notFound } from 'next/navigation'
import {
  getPost,
  getPostMusicAttachments,
  getReviewTargetInfo,
} from '@/lib/supabase-blog'
import { extractMusicFromBody } from '@/lib/blog-content'
import { buildTopasPlaylist } from '@/lib/topas-resolve'
import { buildBlogPlayerTracks, extractedToPlayerTrack, type BlogPlayerTrack } from '@/lib/blog-player'
import { createAdminClient } from '@/lib/supabase'
import BlogPostPageClient from './page-client'
import { POST_TYPE_OPTIONS, type BlogPostType } from '@/components/blog/post-types'

// ISR — blog'o įrašai keičiasi retai; cache'inam 5 min. (like/comment skaitliukai
// atsinaujina klientinėje pusėje per atskirus fetch'us, tad nedingsta švieži).
export const revalidate = 300

export async function generateMetadata({ params }: { params: Promise<{ username: string; slug: string }> }) {
  const { username, slug } = await params
  const post = await getPost(username, slug)
  if (!post) return { title: 'Nerasta' }
  return {
    title: `${post.title} — Music.lt`,
    description: post.summary || post.title,
    openGraph: {
      title: post.title,
      description: post.summary || '',
      type: 'article',
      ...(post.cover_image_url ? { images: [post.cover_image_url] } : {}),
    },
  }
}

export default async function PostPage({ params }: { params: Promise<{ username: string; slug: string }> }) {
  const { username, slug } = await params
  const post = await getPost(username, slug)
  if (!post) notFound()

  const postType: BlogPostType = (post.post_type as BlogPostType) || 'article'
  const sbAdmin = createAdminClient()

  // Body embed'ai ištraukiami sinchroniškai (be tinklo) — body lieka švarus.
  const { cleanedHtml, music: rawEmbeddedMusic } = extractMusicFromBody((post as any).content_enriched || post.content || '')
  const ytRawEmbeds = rawEmbeddedMusic.filter(m => m.source === 'youtube')

  // Viskas paraleliai — attachments + target + rankiniai track id'ai.
  const [attachments, targetInfo, manualRowsRes] = await Promise.all([
    getPostMusicAttachments(post.id),
    (postType === 'review' || postType === 'translation' || postType === 'event')
      ? getReviewTargetInfo({
          artist_id: post.target_artist_id ?? null,
          album_id:  post.target_album_id  ?? null,
          track_id:  post.target_track_id  ?? null,
          event_id:  post.target_event_id  ?? null,
        })
      : Promise.resolve(null),
    sbAdmin.from('blog_post_tracks').select('track_id').eq('post_id', post.id),
  ])
  const manualTrackIds: number[] = ((manualRowsRes as any)?.data || []).map((r: any) => r.track_id).filter(Boolean)

  // Thread C 3b: susieta foto galerija (reportages.blog_post_id = post.id) —
  // rodoma tik recenzijoms (post_type='review').
  let gallery: { slug: string; photoCount: number; coverUrl: string | null } | null = null
  if (postType === 'review') {
    const { data: rep } = await sbAdmin
      .from('reportages')
      .select('slug, photo_count, cover_url')
      .eq('blog_post_id', post.id)
      .eq('is_published', true)
      .limit(1)
      .maybeSingle()
    if (rep) gallery = { slug: rep.slug, photoCount: (rep as any).photo_count ?? 0, coverUrl: (rep as any).cover_url ?? null }
  }

  // ── PLAYER GROJARAŠTIS — visada mūsų DB dainos + YouTube (ne Spotify) ──
  let playerTracks: BlogPlayerTrack[] = []
  if (postType === 'topas') {
    if (manualTrackIds.length) {
      playerTracks = await buildBlogPlayerTracks(sbAdmin, { manualTrackIds })
    }
    if (!playerTracks.length && Array.isArray(post.list_items)) {
      const topasPlayerTracks = await buildTopasPlaylist(sbAdmin, post.list_items)
      playerTracks = (topasPlayerTracks || []).map(extractedToPlayerTrack).filter(Boolean) as BlogPlayerTrack[]
    }
  } else {
    playerTracks = await buildBlogPlayerTracks(sbAdmin, {
      manualTrackIds,
      albumId: post.target_album_id ?? (attachments.albums[0] as any)?.id ?? null,
      artistId: post.target_artist_id ?? (attachments.artists[0] as any)?.id ?? null,
      fallbackEmbeds: ytRawEmbeds,
    })
  }

  const blog = (post as any).blog
  const profile = Array.isArray(blog?.profiles) ? blog.profiles[0] : blog?.profiles
  const authorName = (profile as any)?.full_name || (profile as any)?.username || username
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://musiclt.vercel.app'

  const firstPlayerCover = playerTracks.find(t => !!t.cover_url)?.cover_url || null
  const firstJunctionCover =
    (attachments.tracks[0] as any)?.cover_image_url ||
    (attachments.albums[0] as any)?.cover_image_url || null
  const firstArtistCover = (attachments.artists[0] as any)?.cover_image_url || null
  const targetEntityImage =
    targetInfo?.event?.cover_image_url ||
    (targetInfo?.album as any)?.cover_image_url ||
    (targetInfo?.track as any)?.cover_image_url ||
    (targetInfo?.artist as any)?.cover_image_url ||
    null
  const firstListItemImage = postType === 'topas' && Array.isArray(post.list_items) && post.list_items.length > 0
    ? post.list_items[0]?.image_url
    : null
  const heroImage =
    post.cover_image_url ||
    firstPlayerCover ||
    firstJunctionCover ||
    targetEntityImage ||
    firstListItemImage ||
    firstArtistCover

  const typeMeta = POST_TYPE_OPTIONS.find(o => o.type === postType)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.summary || '',
    datePublished: post.published_at || post.created_at,
    dateModified: post.updated_at || post.created_at,
    author: {
      '@type': 'Person',
      name: authorName,
      url: `${siteUrl}/@${(profile as any)?.username || username}`,
    },
    publisher: { '@type': 'Organization', name: 'Music.lt', url: siteUrl },
    mainEntityOfPage: `${siteUrl}/blogas/${username}/${slug}`,
    ...(post.cover_image_url ? { image: post.cover_image_url } : {}),
  }

  const hasSidebar =
    playerTracks.length > 0 ||
    attachments.artists.length > 0 ||
    attachments.albums.length > 0 ||
    !!targetInfo

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <BlogPostPageClient
        post={{
          id: post.id,
          title: post.title,
          summary: post.summary,
          content: cleanedHtml,
          published_at: post.published_at,
          reading_time_min: post.reading_time_min,
          like_count: post.like_count || 0,
          comment_count: post.comment_count || 0,
          rating: post.rating ?? null,
          tags: post.tags || [],
          list_items: Array.isArray(post.list_items) ? post.list_items : [],
          creation_subtype: (post as any).creation_subtype ?? null,
          topas_meta: (post as any).topas_meta ?? null,
        }}
        postType={postType}
        typeLabel={typeMeta?.label || ''}
        username={username}
        authorName={authorName}
        authorUsername={(profile as any)?.username || username}
        authorAvatar={(profile as any)?.avatar_url || null}
        authorKarma={(profile as any)?.legacy_karma_points ?? null}
        authorJoinedYear={(() => {
          const joined = (profile as any)?.joined_legacy_at
          if (!joined) return null
          const y = parseInt(String(joined).slice(0, 4))
          return Number.isFinite(y) ? y : null
        })()}
        blogTitle={blog?.title || null}
        heroImage={heroImage}
        attachments={attachments}
        playerTracks={playerTracks}
        targetInfo={targetInfo}
        hasSidebar={hasSidebar}
        gallery={gallery}
      />
    </>
  )
}
