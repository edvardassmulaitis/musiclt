'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSite } from '@/components/SiteContext'

type BlogPost = {
  id: string
  title: string
  summary: string | null
  slug: string
  published_at: string
  cover_image_url: string | null
  reading_time_min: number
  view_count: number
  like_count: number
  comment_count: number
  blogs: { slug: string } | { slug: string }[]
  profiles: { username: string; full_name: string | null; avatar_url: string | null } | { username: string; full_name: string | null; avatar_url: string | null }[]
}

function getField<T>(val: T | T[]): T {
  return Array.isArray(val) ? val[0] : val
}

export function CommunityPosts() {
  const { dk } = useSite()
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/blog/latest?limit=4')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setPosts(data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-[19px] font-black tracking-tight" style={{ color: dk ? '#f2f4f8' : '#0f1a2e' }}>Iš bendruomenės</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[0,1,2,3].map(i => (
            <div key={i} className="h-28 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.03)' }} />
          ))}
        </div>
      </section>
    )
  }

  if (!posts.length) return null

  const CS = dk
    ? { background: 'rgba(255,255,255,0.028)', border: '1px solid rgba(255,255,255,0.075)' }
    : { background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(0,0,0,0.09)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }

  return (
    <section>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-[19px] font-black tracking-tight" style={{ color: dk ? '#f2f4f8' : '#0f1a2e' }}>Iš bendruomenės</h2>
        <Link href="/blogas/mano" className="text-sm font-semibold transition-colors" style={{ color: '#4a6fa5' }}>Visi blogai →</Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {posts.map(post => {
          const blog = getField(post.blogs)
          const profile = getField(post.profiles)
          const blogSlug = blog?.slug || ''
          const username = profile?.username || ''
          const authorName = profile?.full_name || username

          return (
            <Link key={post.id} href={`/blogas/${blogSlug}/${post.slug}`}
              className="flex gap-3.5 px-4 py-3.5 rounded-xl cursor-pointer group transition-all"
              style={CS}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = dk ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.2)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = dk ? 'rgba(255,255,255,0.075)' : 'rgba(0,0,0,0.09)' }}>
              {/* Author avatar */}
              <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 overflow-hidden"
                style={{ background: `hsl(${(username.charCodeAt(0) || 65) * 17 % 360},28%,15%)`, color: 'rgba(255,255,255,0.22)' }}>
                {profile?.avatar_url
                  ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                  : (authorName[0] || '?').toUpperCase()
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(249,115,22,0.12)', color: '#fb923c' }}>Blogas</span>
                  <span className="text-[10px]" style={{ color: dk ? '#2a3a50' : '#6a85a8' }}>
                    {post.reading_time_min || 1} min. skaitymo
                  </span>
                </div>
                <p className="text-[13px] font-semibold group-hover:text-blue-300 transition-colors leading-snug truncate" style={{ color: dk ? '#c8d8f0' : '#0f1a2e' }}>
                  {post.title}
                </p>
                {post.summary && (
                  <p className="text-[11px] mt-0.5 truncate" style={{ color: dk ? '#3d5878' : '#6a85a8' }}>{post.summary}</p>
                )}
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-[11px]" style={{ color: dk ? '#3d5878' : '#6a85a8' }}>{authorName}</span>
                  {post.like_count > 0 && <span className="text-[10px]" style={{ color: '#2a3a50' }}>♥ {post.like_count}</span>}
                  {post.comment_count > 0 && <span className="text-[10px]" style={{ color: '#2a3a50' }}>💬 {post.comment_count}</span>}
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
