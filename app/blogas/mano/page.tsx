// app/blogas/mano/page.tsx
'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { POST_TYPE_OPTIONS, type BlogPostType } from '@/components/blog/post-types'
import { extractExcerpt } from '@/components/blog/BlogFeedCard'

type Post = {
  id: string
  slug: string
  title: string
  summary: string | null
  content: string | null
  cover_image_url: string | null
  post_type: BlogPostType
  rating: number | null
  status: 'draft' | 'published'
  published_at: string | null
  reading_time_min: number
  view_count: number
  like_count: number
  comment_count: number
  created_at: string
  updated_at: string
  blogs?: { slug: string } | { slug: string }[] | null
}

type Tab = 'latest' | 'top' | 'drafts' | 'all'

export default function MyPostsPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('latest')

  useEffect(() => {
    fetch('/api/blog/posts').then(r => r.json()).then(d => {
      setPosts(Array.isArray(d) ? d : [])
    }).finally(() => setLoading(false))
  }, [])

  // Bendra statistika viršuje
  const stats = useMemo(() => {
    const published = posts.filter(p => p.status === 'published')
    return {
      total: posts.length,
      published: published.length,
      drafts: posts.length - published.length,
      views: published.reduce((s, p) => s + (p.view_count || 0), 0),
      likes: published.reduce((s, p) => s + (p.like_count || 0), 0),
      comments: published.reduce((s, p) => s + (p.comment_count || 0), 0),
    }
  }, [posts])

  const filtered = useMemo(() => {
    if (tab === 'drafts') return posts.filter(p => p.status === 'draft')
    if (tab === 'top') {
      return [...posts.filter(p => p.status === 'published')]
        .sort((a, b) => (b.view_count + b.like_count * 3 + b.comment_count * 2) - (a.view_count + a.like_count * 3 + a.comment_count * 2))
    }
    if (tab === 'latest') {
      return [...posts.filter(p => p.status === 'published')]
        .sort((a, b) => new Date(b.published_at || b.updated_at).getTime() - new Date(a.published_at || a.updated_at).getTime())
    }
    return posts
  }, [posts, tab])

  async function handleDelete(id: string) {
    if (!confirm('Tikrai ištrinti šį įrašą?')) return
    const res = await fetch(`/api/blog/posts/${id}`, { method: 'DELETE' })
    if (res.ok) setPosts(posts.filter(p => p.id !== id))
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-2 gap-4 flex-wrap">
          <div>
            <Link href="/blogas" className="text-xs hover:text-white transition" style={{ color: '#5e7290' }}>← Visi blogai</Link>
            <h1 className="text-2xl font-black mt-2" style={{ fontFamily: "'Outfit', sans-serif", letterSpacing: '-.02em', color: '#f2f4f8' }}>
              Mano įrašai
            </h1>
          </div>
          <Link href="/blogas/rasyti" className="px-4 py-1.5 rounded-full text-xs font-bold text-white bg-[#f97316] hover:bg-[#ea580c] transition" style={{ fontFamily: "'Outfit', sans-serif" }}>
            + Naujas
          </Link>
        </div>

        {/* Stats overview */}
        {!loading && stats.total > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-6">
            <StatBox label="Įrašai" value={stats.published} sub={stats.drafts > 0 ? `+${stats.drafts} juodr.` : undefined} />
            <StatBox label="Peržiūros" value={stats.views} icon="👁" />
            <StatBox label="Patiko" value={stats.likes} icon="♥" />
            <StatBox label="Komentarai" value={stats.comments} icon="💬" />
            <StatBox label="Viso" value={stats.total} sub="su juodraščiais" />
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-5 border-b border-white/[.05]">
          {([
            { key: 'latest',  label: 'Naujausi' },
            { key: 'top',     label: 'Top' },
            { key: 'drafts',  label: `Juodraščiai${stats.drafts ? ` (${stats.drafts})` : ''}` },
            { key: 'all',     label: 'Archyvas' },
          ] as Array<{ key: Tab; label: string }>).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-xs font-bold transition relative ${
                tab === t.key ? 'text-[#f97316]' : 'text-[#8aa8cc] hover:text-[#dde8f8]'
              }`}
              style={{ fontFamily: "'Outfit', sans-serif" }}
            >
              {t.label}
              {tab === t.key && (
                <span className="absolute left-3 right-3 -bottom-px h-px" style={{ background: '#f97316' }} />
              )}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <p className="text-center py-12 text-sm" style={{ color: '#334058' }}>Kraunasi...</p>
        ) : filtered.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          <div className="space-y-3">
            {filtered.map(p => <PostCard key={p.id} post={p} onDelete={() => handleDelete(p.id)} />)}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Stat box (viršuje) ──────────────────────────────────────────────────────
function StatBox({ label, value, sub, icon }: { label: string; value: number; sub?: string; icon?: string }) {
  return (
    <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
      <p className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: '#5e7290' }}>{label}</p>
      <p className="text-xl font-black tabular-nums" style={{ fontFamily: "'Outfit', sans-serif", color: '#f2f4f8' }}>
        {icon && <span className="text-sm mr-1" style={{ color: '#5e7290' }}>{icon}</span>}
        {value.toLocaleString('lt-LT')}
      </p>
      {sub && <p className="text-[10px] mt-0.5" style={{ color: '#5e7290' }}>{sub}</p>}
    </div>
  )
}

// ── Empty state per tab ─────────────────────────────────────────────────────
function EmptyState({ tab }: { tab: Tab }) {
  const messages: Record<Tab, { title: string; sub: string }> = {
    latest:  { title: 'Dar nieko nepublikavai',     sub: 'Pradėk nuo pirmojo įrašo' },
    top:     { title: 'Dar nėra populiariausių',     sub: 'Reikia bent vieno publikuoto įrašo' },
    drafts:  { title: 'Juodraščių nėra',             sub: 'Pradedant rašymą, automatiškai išsaugom kaip juodraštį' },
    all:     { title: 'Archyvas tuščias',            sub: 'Visi tavo įrašai bus matomi čia' },
  }
  const m = messages[tab]
  return (
    <div className="text-center py-16">
      <p className="text-sm font-bold mb-1" style={{ color: '#dde8f8' }}>{m.title}</p>
      <p className="text-xs mb-4" style={{ color: '#5e7290' }}>{m.sub}</p>
      <Link href="/blogas/rasyti" className="inline-block px-4 py-1.5 rounded-full text-xs font-bold bg-[#f97316] text-white hover:bg-[#ea580c] transition">
        Rašyti įrašą
      </Link>
    </div>
  )
}

// ── Post card (eilutė liste) ────────────────────────────────────────────────
function PostCard({ post, onDelete }: { post: Post; onDelete: () => void }) {
  const blog = Array.isArray(post.blogs) ? post.blogs[0] : post.blogs
  const blogSlug = blog?.slug
  const viewUrl = blogSlug && post.status === 'published' ? `/blogas/${blogSlug}/${post.slug}` : null
  const editUrl = `/blogas/rasyti?id=${post.id}`
  const typeMeta = POST_TYPE_OPTIONS.find(o => o.type === post.post_type)
  const excerpt = post.summary || extractExcerpt(post.content, 160)

  return (
    <div className="group rounded-lg p-4 transition" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
      <div className="flex gap-4">
        {/* Cover */}
        {post.cover_image_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={post.cover_image_url} alt="" className="w-28 h-20 rounded-md object-cover flex-shrink-0" />
        ) : (
          <div className="w-28 h-20 rounded-md flex-shrink-0 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#334058' }}>{typeMeta?.label || ''}</span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Status + type + rating */}
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span
              className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={
                post.status === 'published'
                  ? { background: 'rgba(34,197,94,0.12)', color: '#86efac' }
                  : { background: 'rgba(234,179,8,0.12)', color: '#fde047' }
              }
            >
              {post.status === 'published' ? 'Publikuotas' : 'Juodraštis'}
            </span>
            {typeMeta && (
              <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#5e7290' }}>
                {typeMeta.label}
              </span>
            )}
            {post.rating !== null && post.rating !== undefined && (
              <span className="text-[9px] font-black" style={{ color: '#f97316' }}>{post.rating}/10</span>
            )}
          </div>

          {/* Title + excerpt */}
          <h3 className="text-base font-bold leading-tight mb-1" style={{ fontFamily: "'Outfit', sans-serif", color: '#f2f4f8' }}>
            {post.title}
          </h3>
          {excerpt && (
            <p className="text-xs line-clamp-2 mb-2" style={{ color: '#8aa8cc' }}>{excerpt}</p>
          )}

          {/* Stats + meta */}
          <div className="flex items-center gap-3 text-[10px] flex-wrap" style={{ color: '#5e7290' }}>
            <span>{new Date(post.updated_at).toLocaleDateString('lt-LT', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
            {post.status === 'published' && (
              <>
                <span>·</span>
                <span>👁 {post.view_count}</span>
                <span>♥ {post.like_count}</span>
                <span>💬 {post.comment_count}</span>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1.5 items-end">
          {viewUrl ? (
            <Link
              href={viewUrl}
              className="px-2.5 py-1 rounded text-[10px] font-bold hover:bg-white/[.06] transition"
              style={{ background: 'rgba(255,255,255,0.04)', color: '#dde8f8' }}
            >
              Peržiūrėti
            </Link>
          ) : (
            <span className="px-2.5 py-1 text-[10px]" style={{ color: '#334058' }}>—</span>
          )}
          <Link
            href={editUrl}
            className="px-2.5 py-1 rounded text-[10px] font-bold hover:bg-white/[.06] transition"
            style={{ background: 'rgba(255,255,255,0.04)', color: '#8aa8cc' }}
          >
            Redaguoti
          </Link>
          <button
            onClick={onDelete}
            className="px-2.5 py-1 rounded text-[10px] font-bold hover:bg-red-500/10 transition"
            style={{ color: '#5e7290' }}
          >
            Trinti
          </button>
        </div>
      </div>
    </div>
  )
}
