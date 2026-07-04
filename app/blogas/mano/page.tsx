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
  fallback_thumb_url?: string | null
  blogs?: { slug: string } | { slug: string }[] | null
}

type Tab = 'latest' | 'top' | 'drafts' | 'all'

// Tipo spalva — suderinta su /bendruomene kortelėmis (spalvota juostelė + pill).
const TYPE_COLOR: Record<BlogPostType, string> = {
  article: 'var(--accent-orange)',
  review: '#f59e0b',
  topas: '#f59e0b',
  translation: '#3b82f6',
  creation: '#a855f7',
  event: '#ec4899',
}

export default function MyPostsPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('latest')
  const [q, setQ] = useState('')

  useEffect(() => {
    fetch('/api/blog/posts')
      .then(r => r.json())
      .then(d => setPosts(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }, [])

  // Bendra statistika viršuje
  const stats = useMemo(() => {
    const published = posts.filter(p => p.status === 'published')
    const totalViews = published.reduce((s, p) => s + (p.view_count || 0), 0)
    const totalLikes = published.reduce((s, p) => s + (p.like_count || 0), 0)
    return {
      total: posts.length,
      published: published.length,
      drafts: posts.length - published.length,
      views: totalViews,
      likes: totalLikes,
      comments: published.reduce((s, p) => s + (p.comment_count || 0), 0),
    }
  }, [posts])

  const filtered = useMemo(() => {
    let list = posts
    if (tab === 'drafts') list = posts.filter(p => p.status === 'draft')
    else if (tab === 'top') {
      list = [...posts.filter(p => p.status === 'published')].sort(
        (a, b) =>
          b.view_count + b.like_count * 3 + b.comment_count * 2 -
          (a.view_count + a.like_count * 3 + a.comment_count * 2),
      )
    } else if (tab === 'latest') {
      list = [...posts.filter(p => p.status === 'published')].sort(
        (a, b) =>
          new Date(b.published_at || b.updated_at).getTime() -
          new Date(a.published_at || a.updated_at).getTime(),
      )
    }
    const term = q.trim().toLowerCase()
    if (term) {
      list = list.filter(
        p =>
          p.title.toLowerCase().includes(term) ||
          (p.summary || '').toLowerCase().includes(term),
      )
    }
    return list
  }, [posts, tab, q])

  async function handleDelete(id: string) {
    if (!confirm('Tikrai ištrinti šį įrašą? Jis bus paslėptas iš visų puslapių. Prireikus jį gali atstatyti administratorius.')) return
    const res = await fetch(`/api/blog/posts/${id}`, { method: 'DELETE' })
    if (res.ok) setPosts(posts.filter(p => p.id !== id))
  }

  return (
    <div className="page-shell">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="page-head">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1>Mano įrašai</h1>
            <p>Tavo blogo valdymo skydelis — statistika, juodraščiai ir publikuoti įrašai vienoje vietoje.</p>
          </div>
          <Link
            href="/blogas/rasyti"
            className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-bold text-white transition hover:brightness-110"
            style={{ background: 'var(--accent-orange)', fontFamily: "'Outfit', sans-serif" }}
          >
            <span className="text-base leading-none">+</span> Naujas įrašas
          </Link>
        </div>
      </div>

      {/* ── Stats hero ─────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-3 gap-3 mb-7">
          {[0, 1, 2].map(i => <StatSkeleton key={i} />)}
        </div>
      ) : stats.total > 0 ? (
        // Peržiūros sąmoningai NErodomos nariui (maži skaičiai mažina motyvaciją) —
        // jas mato tik adminas /admin/irasai.
        <div className="grid grid-cols-3 gap-3 mb-7">
          <StatBox label="Publikuota" value={stats.published} icon="📄" accent
            sub={stats.drafts > 0 ? `+${stats.drafts} juodraščiai` : 'visi publikuoti'} />
          <StatBox label="Patiko" value={stats.likes} icon="♥" />
          <StatBox label="Komentarai" value={stats.comments} icon="💬" />
        </div>
      ) : null}

      {/* ── Toolbar: tabs + search ─────────────────────────────── */}
      {!loading && stats.total > 0 && (
        <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
          <div
            className="flex gap-1 p-1 rounded-full"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
          >
            {([
              { key: 'latest', label: 'Naujausi' },
              { key: 'top', label: 'Populiariausi' },
              { key: 'drafts', label: `Juodraščiai${stats.drafts ? ` ${stats.drafts}` : ''}` },
              { key: 'all', label: 'Visi' },
            ] as Array<{ key: Tab; label: string }>).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="px-3.5 py-1.5 text-xs font-bold rounded-full transition whitespace-nowrap"
                style={
                  tab === t.key
                    ? { background: 'var(--accent-orange)', color: '#fff', fontFamily: "'Outfit', sans-serif" }
                    : { color: 'var(--text-secondary)', fontFamily: "'Outfit', sans-serif" }
                }
              >
                {t.label}
              </button>
            ))}
          </div>

          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Ieškoti įrašo…"
            className="px-3.5 py-2 rounded-full text-xs flex-1 min-w-[140px] sm:max-w-[220px] outline-none transition"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
      )}

      {/* ── List ───────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-3">{[0, 1, 2].map(i => <CardSkeleton key={i} />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState tab={tab} hasQuery={!!q.trim()} totalEmpty={stats.total === 0} />
      ) : (
        <div className="space-y-3">
          {filtered.map(p => (
            <PostCard key={p.id} post={p} onDelete={() => handleDelete(p.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Stat box ───────────────────────────────────────────────────────────────
function StatBox({
  label, value, sub, icon, accent,
}: { label: string; value: number; sub?: string; icon?: string; accent?: boolean }) {
  return (
    <div
      className="rounded-2xl p-4 transition"
      style={{
        background: accent
          ? 'linear-gradient(135deg, rgba(249,115,22,0.14), rgba(249,115,22,0.04))'
          : 'var(--bg-surface)',
        border: `1px solid ${accent ? 'rgba(249,115,22,0.30)' : 'var(--border-subtle)'}`,
      }}
    >
      <div className="flex items-center gap-1.5 mb-2">
        {icon && <span className="text-sm">{icon}</span>}
        <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          {label}
        </p>
      </div>
      <p
        className="text-2xl sm:text-3xl font-black tabular-nums leading-none"
        style={{ fontFamily: "'Outfit', sans-serif", color: accent ? 'var(--accent-orange)' : 'var(--text-primary)' }}
      >
        {value.toLocaleString('lt-LT')}
      </p>
      {sub && <p className="text-[12px] mt-1.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}

function StatSkeleton() {
  return (
    <div
      className="rounded-2xl p-4 animate-pulse"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', height: 96 }}
    />
  )
}

function CardSkeleton() {
  return (
    <div
      className="rounded-2xl animate-pulse"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', height: 104 }}
    />
  )
}

// ── Empty state ─────────────────────────────────────────────────────────────
function EmptyState({ tab, hasQuery, totalEmpty }: { tab: Tab; hasQuery: boolean; totalEmpty: boolean }) {
  if (hasQuery) {
    return (
      <div className="text-center py-16">
        <p className="text-sm font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>Nieko nerasta</p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Pabandyk kitą paieškos žodį</p>
      </div>
    )
  }
  const messages: Record<Tab, { title: string; sub: string }> = {
    latest: { title: totalEmpty ? 'Dar nieko nepublikavai' : 'Nėra publikuotų įrašų', sub: 'Pradėk nuo pirmojo įrašo' },
    top: { title: 'Dar nėra populiariausių', sub: 'Reikia bent vieno publikuoto įrašo' },
    drafts: { title: 'Juodraščių nėra', sub: 'Pradedant rašyti, įrašas automatiškai išsaugomas kaip juodraštis' },
    all: { title: 'Archyvas tuščias', sub: 'Visi tavo įrašai bus matomi čia' },
  }
  const m = messages[tab]
  return (
    <div
      className="text-center py-16 rounded-2xl"
      style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border-default)' }}
    >
      <div className="text-3xl mb-3">✍️</div>
      <p className="text-base font-bold mb-1" style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-primary)' }}>
        {m.title}
      </p>
      <p className="text-xs mb-5" style={{ color: 'var(--text-muted)' }}>{m.sub}</p>
      <Link
        href="/blogas/rasyti"
        className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-bold text-white transition hover:brightness-110"
        style={{ background: 'var(--accent-orange)', fontFamily: "'Outfit', sans-serif" }}
      >
        <span className="text-base leading-none">+</span> Rašyti įrašą
      </Link>
    </div>
  )
}

// ── Post card ───────────────────────────────────────────────────────────────
function PostCard({ post, onDelete }: { post: Post; onDelete: () => void }) {
  const blog = Array.isArray(post.blogs) ? post.blogs[0] : post.blogs
  const blogSlug = blog?.slug
  const viewUrl = blogSlug && post.status === 'published' ? `/blogas/${blogSlug}/${post.slug}` : null
  const editUrl = `/blogas/rasyti?id=${post.id}`
  const typeMeta = POST_TYPE_OPTIONS.find(o => o.type === post.post_type)
  const excerpt = post.summary || extractExcerpt(post.content, 150)
  const published = post.status === 'published'
  const typeColor = TYPE_COLOR[post.post_type] || 'var(--accent-orange)'
  // Vizualas kaip /bendruomene: cover → susietos muzikos miniatiūra → spalvotas placeholder.
  const thumb = post.cover_image_url || post.fallback_thumb_url || null

  return (
    <div
      className="group rounded-2xl p-3 sm:p-4 transition"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="flex gap-3 sm:gap-4">
        {/* Cover */}
        {thumb ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={thumb}
            alt=""
            loading="lazy"
            className="w-20 h-20 sm:w-28 sm:h-24 rounded-xl object-cover flex-shrink-0"
          />
        ) : (
          <div
            className="w-20 h-20 sm:w-28 sm:h-24 rounded-xl flex-shrink-0 flex items-center justify-center text-2xl"
            style={{ background: `linear-gradient(135deg, ${typeColor}26, ${typeColor}0d)`, color: typeColor }}
          >
            ♬
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Status + type + rating */}
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span
              className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={
                published
                  ? { background: 'rgba(34,197,94,0.14)', color: 'var(--accent-green)' }
                  : { background: 'rgba(251,191,36,0.14)', color: 'var(--accent-yellow)' }
              }
            >
              {published ? 'Publikuotas' : 'Juodraštis'}
            </span>
            {typeMeta && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: typeColor }}>
                <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: typeColor }} />
                {typeMeta.label}
              </span>
            )}
            {post.rating !== null && post.rating !== undefined && (
              <span className="text-[11px] font-black" style={{ color: 'var(--accent-orange)' }}>
                {post.rating}/10
              </span>
            )}
          </div>

          {/* Title + excerpt */}
          <h3
            className="text-[15px] sm:text-base font-bold leading-tight mb-1 line-clamp-2"
            style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-primary)' }}
          >
            {viewUrl ? (
              <Link href={viewUrl} className="hover:underline">{post.title}</Link>
            ) : (
              post.title
            )}
          </h3>
          {excerpt && (
            <p className="text-xs line-clamp-2 mb-2" style={{ color: 'var(--text-secondary)' }}>{excerpt}</p>
          )}

          {/* Meta */}
          <div className="flex items-center gap-2.5 text-[11px] flex-wrap" style={{ color: 'var(--text-muted)' }}>
            <span>
              {new Date(post.published_at || post.updated_at).toLocaleDateString('lt-LT', {
                year: 'numeric', month: 'short', day: 'numeric',
              })}
            </span>
            {published && (
              <>
                <span aria-hidden>·</span>
                <span>♥ {post.like_count.toLocaleString('lt-LT')}</span>
                <span>💬 {post.comment_count.toLocaleString('lt-LT')}</span>
              </>
            )}
          </div>
        </div>

        {/* Actions — desktop */}
        <div className="hidden sm:flex flex-col gap-1.5 items-stretch shrink-0">
          {viewUrl ? (
            <Link href={viewUrl} className="px-3 py-1 rounded-lg text-[12px] font-bold text-center transition hover:brightness-110"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>
              Peržiūrėti
            </Link>
          ) : (
            <span className="px-3 py-1 text-[12px] text-center" style={{ color: 'var(--text-faint)' }}>—</span>
          )}
          <Link href={editUrl} className="px-3 py-1 rounded-lg text-[12px] font-bold text-center transition hover:brightness-110"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
            Redaguoti
          </Link>
          <button onClick={onDelete} className="px-3 py-1 rounded-lg text-[12px] font-bold transition hover:bg-red-500/10"
            style={{ color: 'var(--text-muted)' }}>
            Trinti
          </button>
        </div>
      </div>

      {/* Actions — mobile */}
      <div className="flex sm:hidden gap-2 mt-3 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        {viewUrl && (
          <Link href={viewUrl} className="flex-1 py-1.5 rounded-lg text-[12px] font-bold text-center"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>
            Peržiūrėti
          </Link>
        )}
        <Link href={editUrl} className="flex-1 py-1.5 rounded-lg text-[12px] font-bold text-center"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
          Redaguoti
        </Link>
        <button onClick={onDelete} className="px-3 py-1.5 rounded-lg text-[12px] font-bold"
          style={{ color: 'var(--text-muted)' }}>
          Trinti
        </button>
      </div>
    </div>
  )
}
