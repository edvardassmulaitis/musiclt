'use client'
// app/blogas/page.tsx
//
// Bendras blog feed visų autorių. Pakeitė ankstesnį PlaceholderPage.
// Filter chips pagal post_type + populiariausi tagai. Įraso "+ Naujas"
// mygtukas viršuje (jei prisijungęs).

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { POST_TYPE_OPTIONS, type BlogPostType } from '@/components/blog/PostTypeSelector'
import { BlogFeedCard, type FeedPost } from '@/components/blog/BlogFeedCard'

type FeedResponse = {
  posts: FeedPost[]
  total: number
  popularTags?: Array<{ tag: string; count: number }>
}

export default function BlogIndexPage() {
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [popularTags, setPopularTags] = useState<Array<{ tag: string; count: number }>>([])
  const [activeType, setActiveType] = useState<BlogPostType | null>(null)
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [hasLoadedTags, setHasLoadedTags] = useState(false)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('limit', '20')
    if (activeType) params.set('type', activeType)
    if (activeTag) params.set('tag', activeTag)
    if (!hasLoadedTags) params.set('includeTags', '1')

    fetch(`/api/blog/feed?${params.toString()}`)
      .then(r => r.json() as Promise<FeedResponse>)
      .then(data => {
        setPosts(data.posts || [])
        setTotal(data.total || 0)
        if (data.popularTags) {
          setPopularTags(data.popularTags)
          setHasLoadedTags(true)
        }
      })
      .finally(() => setLoading(false))
  }, [activeType, activeTag, hasLoadedTags])

  return (
    <div className="min-h-screen">
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-black" style={{ fontFamily: "'Outfit', sans-serif", letterSpacing: '-.03em', color: '#f2f4f8' }}>
            Blogas
          </h1>
          <div className="flex gap-2">
            <Link href="/blogas/mano" className="px-3 py-1.5 rounded-full text-xs font-bold transition" style={{ color: '#b0bdd4', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
              Mano
            </Link>
            <Link href="/blogas/rasyti" className="px-3 py-1.5 rounded-full text-xs font-bold text-white bg-[#f97316] hover:bg-[#ea580c] transition">
              + Rašyti
            </Link>
          </div>
        </div>
        <p className="text-sm mb-8" style={{ color: '#5e7290' }}>
          Lietuvos muzikinis substack — recenzijos, vertimai, koncertų patirtys, kūryba.
        </p>

        {/* Type filter chips */}
        <div className="flex gap-1.5 mb-4 flex-wrap">
          <button
            onClick={() => { setActiveType(null); setActiveTag(null) }}
            className="px-3 py-1.5 rounded-full text-xs font-bold transition"
            style={{
              background: activeType === null && activeTag === null ? '#f97316' : 'rgba(255,255,255,0.04)',
              color: activeType === null && activeTag === null ? '#fff' : '#8aa8cc',
              border: '1px solid rgba(255,255,255,0.06)',
              fontFamily: "'Outfit', sans-serif",
            }}
          >
            Visi
          </button>
          {POST_TYPE_OPTIONS.map(opt => (
            <button
              key={opt.type}
              onClick={() => { setActiveType(opt.type); setActiveTag(null) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition"
              style={{
                background: activeType === opt.type ? opt.accent : 'rgba(255,255,255,0.04)',
                color: activeType === opt.type ? '#fff' : '#8aa8cc',
                border: '1px solid rgba(255,255,255,0.06)',
                fontFamily: "'Outfit', sans-serif",
              }}
            >
              <span>{opt.icon}</span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>

        {/* Active tag (jei pasirinktas) */}
        {activeTag && (
          <div className="mb-4 flex items-center gap-2">
            <span className="text-xs" style={{ color: '#5e7290' }}>Filtruojama pagal:</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold"
              style={{ background: 'rgba(59,130,246,0.18)', color: '#93c5fd' }}>
              #{activeTag}
              <button onClick={() => setActiveTag(null)} className="opacity-60 hover:opacity-100">×</button>
            </span>
          </div>
        )}

        {/* Popular tags */}
        {popularTags.length > 0 && !activeTag && (
          <div className="flex gap-1 flex-wrap mb-6">
            {popularTags.slice(0, 12).map(({ tag, count }) => (
              <button
                key={tag}
                onClick={() => setActiveTag(tag)}
                className="px-2 py-0.5 rounded text-[11px] font-semibold hover:bg-blue-500/20 transition"
                style={{ background: 'rgba(59,130,246,0.08)', color: '#93c5fd' }}
              >
                #{tag} <span className="opacity-50">{count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Feed */}
        {loading ? (
          <p className="text-center py-12 text-sm" style={{ color: '#334058' }}>Kraunasi...</p>
        ) : posts.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm mb-4" style={{ color: '#5e7290' }}>
              {activeType || activeTag ? 'Šio filtro įrašų dar nėra.' : 'Dar nėra publikuotų įrašų.'}
            </p>
            <Link href="/blogas/rasyti" className="text-xs text-[#f97316] font-bold hover:underline">
              Parašyk pirmąjį →
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {posts.map(p => <BlogFeedCard key={p.id} post={p} />)}
            </div>
            {total > posts.length && (
              <p className="text-center text-xs mt-6" style={{ color: '#334058' }}>
                Rodoma {posts.length} iš {total}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
