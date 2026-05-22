// app/blogas/[username]/[slug]/page.tsx
//
// Single blog post puslapis — naujas dizainas paimtas iš news straipsnio
// pattern'o (.na-* klasės), su sticky kairiu sidebar'u skirtu prisegtai
// muzikai + target entity'ui. Plotis 1300px, full-bleed hero su nuotrauka
// dešinėje, content + sidebar grid 2 kolonomis. Komentarai render'inami
// per unified EntityCommentsBlock — tą patį komponentą kaip diskusijos,
// dainos, news (modern + legacy mix, replies, likes, attachments).

import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  getPost,
  getPostMusicAttachments,
  getReviewTargetInfo,
} from '@/lib/supabase-blog'
import { proxyImg } from '@/lib/img-proxy'
import { PostContent } from './post-content'
import BlogPostPageClient from './page-client'
import { POST_TYPE_OPTIONS, type BlogPostType } from '@/components/blog/post-types'

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
  const [attachments, targetInfo] = await Promise.all([
    getPostMusicAttachments(post.id),
    (postType === 'review' || postType === 'translation' || postType === 'event')
      ? getReviewTargetInfo({
          artist_id: post.target_artist_id ?? null,
          album_id:  post.target_album_id  ?? null,
          track_id:  post.target_track_id  ?? null,
          event_id:  post.target_event_id  ?? null,
        })
      : Promise.resolve(null),
  ])

  // getPost grąžina post + nested `blog` (singular), kuriame yra `profiles`
  // su author meta. Supabase JOIN'as gali grąžinti arr or object — handle abu.
  const blog = (post as any).blog
  const profile = Array.isArray(blog?.profiles) ? blog.profiles[0] : blog?.profiles
  const authorName = (profile as any)?.full_name || (profile as any)?.username || username
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://musiclt.vercel.app'

  // Hero image priority: cover_image → first attached entity image → target entity image → first list item (topas)
  const firstAttachImage =
    (attachments.tracks[0] as any)?.cover_image_url ||
    (attachments.albums[0] as any)?.cover_image_url ||
    (attachments.artists[0] as any)?.cover_image_url || null
  const targetEntityImage =
    targetInfo?.event?.cover_image_url ||
    (targetInfo?.album as any)?.cover_image_url ||
    (targetInfo?.track as any)?.cover_image_url ||
    (targetInfo?.artist as any)?.cover_image_url ||
    null
  const firstListItemImage = postType === 'topas' && Array.isArray(post.list_items) && post.list_items.length > 0
    ? post.list_items[0]?.image_url
    : null
  const heroImage = post.cover_image_url || firstAttachImage || targetEntityImage || firstListItemImage

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
      url: `${siteUrl}/vartotojas/${(profile as any)?.username || username}`,
    },
    publisher: { '@type': 'Organization', name: 'Music.lt', url: siteUrl },
    mainEntityOfPage: `${siteUrl}/blogas/${username}/${slug}`,
    ...(post.cover_image_url ? { image: post.cover_image_url } : {}),
  }

  // Has sidebar = any attachment OR target entity present
  const hasSidebar =
    attachments.artists.length > 0 ||
    attachments.albums.length > 0 ||
    attachments.tracks.length > 0 ||
    !!targetInfo

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <BlogPostPageClient
        post={{
          id: post.id,
          title: post.title,
          summary: post.summary,
          content: post.content,
          published_at: post.published_at,
          reading_time_min: post.reading_time_min,
          like_count: post.like_count || 0,
          comment_count: post.comment_count || 0,
          rating: post.rating ?? null,
          tags: post.tags || [],
          list_items: Array.isArray(post.list_items) ? post.list_items : [],
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
        targetInfo={targetInfo}
        hasSidebar={hasSidebar}
      />
    </>
  )
}
