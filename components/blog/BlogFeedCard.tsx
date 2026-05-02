'use client'
// components/blog/BlogFeedCard.tsx
//
// Vienas universalus card layout'as, paprastas, matching /blogas/mano
// stilių. Tipas — mažas badge'ukas; rating recenzijoms — orange tag'as.

import Link from 'next/link'
import type { BlogPostType } from './post-types'
import { POST_TYPE_OPTIONS } from './post-types'

export type FeedPost = {
  id: string
  slug: string
  title: string
  summary: string | null
  content: string | null
  cover_image_url: string | null
  post_type: BlogPostType
  rating: number | null
  target_artist_id: number | null
  target_album_id: number | null
  target_track_id: number | null
  target_event_id: string | null
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
  const cover = post.cover_image_url

  return (
    <Link
      href={url}
      className="block p-4 rounded-lg transition group"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
    >
      <div className="flex gap-4">
        {cover && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={cover}
            alt=""
            className="w-28 h-20 rounded-md object-cover flex-shrink-0"
          />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {typeMeta && (
              <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#5e7290' }}>
                {typeMeta.label}
              </span>
            )}
            {post.post_type === 'review' && post.rating !== null && (
              <span className="text-[9px] font-black tracking-wider" style={{ color: '#f97316' }}>
                {post.rating}/10
              </span>
            )}
          </div>

          <h3 className="text-base font-bold leading-tight group-hover:text-[#f97316] transition mb-1"
              style={{ fontFamily: "'Outfit', sans-serif", color: '#f2f4f8' }}>
            {post.title}
          </h3>

          {post.summary && (
            <p className="text-xs line-clamp-2 mb-2" style={{ color: '#8aa8cc' }}>
              {post.summary}
            </p>
          )}

          {post.tags && post.tags.length > 0 && (
            <div className="flex gap-1 flex-wrap mb-2">
              {post.tags.slice(0, 4).map(tag => (
                <span key={tag}
                  className="px-1.5 py-0.5 rounded text-[9px] font-semibold"
                  style={{ background: 'rgba(255,255,255,0.04)', color: '#8aa8cc' }}>
                  #{tag}
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 text-[10px] flex-wrap" style={{ color: '#5e7290' }}>
            {profile && (
              <span className="font-semibold">{profile.full_name || profile.username}</span>
            )}
            {profile && <span>·</span>}
            <span>{new Date(post.published_at).toLocaleDateString('lt-LT', { day: 'numeric', month: 'long' })}</span>
            {post.like_count > 0 && <><span>·</span><span>♥ {post.like_count}</span></>}
            {post.comment_count > 0 && <><span>·</span><span>💬 {post.comment_count}</span></>}
          </div>
        </div>
      </div>
    </Link>
  )
}
