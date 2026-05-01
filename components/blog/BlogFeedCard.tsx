'use client'
// components/blog/BlogFeedCard.tsx
//
// Universalus feed card komponentas — type-aware. Vienas card layout'as
// kuris elgiasi šiek tiek skirtingai pagal post_type:
//   - quick   : iškart parodom embed thumbnail viršuje, be summary
//   - review  : viršuj badge su rating, paminim atlikėją/albumą po pavadinimu
//   - article/journal/creation/translation : klasikinis card

import Link from 'next/link'
import { POST_TYPE_OPTIONS, type BlogPostType } from './post-types'

export type FeedPost = {
  id: string
  slug: string
  title: string
  summary: string | null
  content: string | null
  cover_image_url: string | null
  post_type: BlogPostType
  embed_url: string | null
  embed_thumbnail_url: string | null
  embed_type: string | null
  embed_title: string | null
  rating: number | null
  target_artist_id: number | null
  target_album_id: number | null
  target_track_id: number | null
  tags: string[]
  published_at: string
  reading_time_min: number
  view_count: number
  like_count: number
  comment_count: number
  blogs: {
    slug: string
    title: string
    profiles: {
      id: string
      username: string
      full_name: string | null
      avatar_url: string | null
    } | null
  } | null
}

export function BlogFeedCard({ post }: { post: FeedPost }) {
  const profile = post.blogs?.profiles
  const blogSlug = post.blogs?.slug
  const url = blogSlug ? `/blogas/${blogSlug}/${post.slug}` : '#'
  const typeMeta = POST_TYPE_OPTIONS.find(t => t.type === post.post_type)
  const cover = post.post_type === 'quick' ? post.embed_thumbnail_url : post.cover_image_url

  return (
    <Link
      href={url}
      className="block rounded-xl transition-all hover:scale-[1.005] group"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
    >
      <div className="flex gap-4 p-4">
        {cover && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={cover}
            alt=""
            className="w-32 h-24 rounded-lg object-cover flex-shrink-0 group-hover:opacity-90 transition"
          />
        )}

        <div className="flex-1 min-w-0">
          {/* Type badge + rating */}
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            {typeMeta && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                style={{ background: `${typeMeta.accent}22`, color: typeMeta.accent }}
              >
                {typeMeta.icon} {typeMeta.label}
              </span>
            )}
            {post.post_type === 'review' && post.rating !== null && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider"
                style={{ background: 'rgba(234,179,8,0.18)', color: '#eab308' }}
              >
                ⭐ {post.rating}/10
              </span>
            )}
          </div>

          {/* Title */}
          <h3 className="text-base font-bold leading-tight group-hover:text-[#f97316] transition mb-1"
              style={{ fontFamily: "'Outfit', sans-serif", color: '#f2f4f8' }}>
            {post.title}
          </h3>

          {/* Summary or content excerpt */}
          {post.post_type !== 'quick' && post.summary && (
            <p className="text-xs line-clamp-2 mb-2" style={{ color: '#8aa8cc' }}>
              {post.summary}
            </p>
          )}
          {post.post_type === 'quick' && post.content && (
            <p className="text-xs line-clamp-2 mb-2" style={{ color: '#8aa8cc' }}>
              {post.content.slice(0, 200)}
            </p>
          )}

          {/* Tags */}
          {post.tags && post.tags.length > 0 && (
            <div className="flex gap-1 flex-wrap mb-2">
              {post.tags.slice(0, 4).map(tag => (
                <span key={tag}
                  className="px-1.5 py-0.5 rounded text-[9px] font-semibold"
                  style={{ background: 'rgba(59,130,246,0.12)', color: '#93c5fd' }}>
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Meta */}
          <div className="flex items-center gap-2 text-[10px] flex-wrap" style={{ color: '#5e7290' }}>
            {profile && (
              <span className="flex items-center gap-1">
                {profile.avatar_url
                  /* eslint-disable-next-line @next/next/no-img-element */
                  ? <img src={profile.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover" />
                  : <span className="w-4 h-4 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }} />
                }
                <span className="font-semibold">{profile.full_name || profile.username}</span>
              </span>
            )}
            <span>·</span>
            <span>{new Date(post.published_at).toLocaleDateString('lt-LT', { day: 'numeric', month: 'long' })}</span>
            {post.like_count > 0 && <><span>·</span><span>♥ {post.like_count}</span></>}
            {post.comment_count > 0 && <><span>·</span><span>💬 {post.comment_count}</span></>}
            {post.view_count > 0 && <><span>·</span><span>👁 {post.view_count}</span></>}
          </div>
        </div>
      </div>
    </Link>
  )
}
