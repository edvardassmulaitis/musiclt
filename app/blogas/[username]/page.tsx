// app/blogas/[username]/page.tsx
//
// V2 (2026-05-25): pagination + post_type tabs. Anksčiau rodė tik 20 įrašų be
// paging'o; einaras13 su 561 įrašu matėsi tik 20. Dabar 20 per puslapį, 26
// puslapių max (kaip ir senas music.lt).
//
// URL pattern: /blogas/<username>?type=article&page=2
//   type — all|article|creation|translation|topas|... (default: all)
//   page — 1-based puslapis (default: 1, page size 20)

import { notFound } from 'next/navigation'
import { getBlogBySlug, getBlogPosts, getBlogPostCountsByType } from '@/lib/supabase-blog'
import Link from 'next/link'
import type { Metadata } from 'next'

type Props = {
  params: Promise<{ username: string }>
  searchParams: Promise<{ page?: string; type?: string }>
}

const PAGE_SIZE = 20

// V11.7: matches /vartotojas/[username] PostTypeTagBar — LT plural forms,
// sentence case (be uppercase), „Visi" → „Visi įrašai".
const TYPE_LABELS: Record<string, string> = {
  all: 'Visi įrašai',
  article: 'Straipsnis',
  creation: 'Kūriniai',
  translation: 'Vertimas',
  topas: 'Topas',
  review: 'Recenzija',
  release: 'Release',
  interview: 'Interviu',
  event: 'Renginys',
}

const TYPE_PLURAL: Record<string, [string, string, string]> = {
  article:     ['straipsnis', 'straipsniai', 'straipsnių'],
  review:      ['recenzija',  'recenzijos',  'recenzijų'],
  event:       ['renginys',   'renginiai',   'renginių'],
  creation:    ['kūrinys',    'kūriniai',    'kūrinių'],
  translation: ['vertimas',   'vertimai',    'vertimų'],
  topas:       ['topas',      'topai',       'topų'],
  release:     ['leidinys',   'leidiniai',   'leidinių'],
  interview:   ['interviu',   'interviu',    'interviu'],
}

function ltPlural(n: number, sg: string, paucal: string, gen: string): string {
  const lastTwo = Math.abs(n) % 100
  const last = Math.abs(n) % 10
  if (last === 1 && lastTwo !== 11) return sg
  if (last >= 2 && last <= 9 && (lastTwo < 10 || lastTwo > 19)) return paucal
  return gen
}

function tabLabel(t: string, n: number): string {
  if (t === 'all') return 'Visi įrašai'
  const forms = TYPE_PLURAL[t]
  if (forms) return `${n} ${ltPlural(n, forms[0], forms[1], forms[2])}`
  return `${TYPE_LABELS[t] || t} · ${n}`
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params
  const blog = await getBlogBySlug(username)
  if (!blog) return { title: 'Nerastas — music.lt' }
  return {
    title: `${blog.title} — music.lt`,
    description: blog.description || `${blog.title} — muzikinis blogas music.lt platformoje`,
    openGraph: { title: blog.title, description: blog.description || '', images: blog.cover_image_url ? [blog.cover_image_url] : [] },
  }
}

export default async function BlogPage({ params, searchParams }: Props) {
  const { username } = await params
  const { page: pageStr, type: typeStr } = await searchParams
  const blog = await getBlogBySlug(username)
  if (!blog) notFound()

  const currentType = typeStr && TYPE_LABELS[typeStr] ? typeStr : 'all'
  const currentPage = Math.max(1, parseInt(pageStr || '1', 10) || 1)
  const offset = (currentPage - 1) * PAGE_SIZE

  const [{ posts, total }, counts] = await Promise.all([
    getBlogPosts(blog.id, PAGE_SIZE, offset, currentType),
    getBlogPostCountsByType(blog.id),
  ])

  const author = (blog as any).profiles
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // Pagination window: 1, 2, 3, ..., N
  const pages: (number | '...')[] = []
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else {
    pages.push(1)
    if (currentPage > 4) pages.push('...')
    const start = Math.max(2, currentPage - 1)
    const end = Math.min(totalPages - 1, currentPage + 1)
    for (let i = start; i <= end; i++) pages.push(i)
    if (currentPage < totalPages - 3) pages.push('...')
    if (totalPages > 1) pages.push(totalPages)
  }

  const baseUrl = `/blogas/${blog.slug}`
  const buildUrl = (p: number, t: string = currentType) => {
    const params = new URLSearchParams()
    if (t !== 'all') params.set('type', t)
    if (p > 1) params.set('page', String(p))
    const qs = params.toString()
    return qs ? `${baseUrl}?${qs}` : baseUrl
  }

  return (
    <div className="min-h-screen bg-[#080c12] text-[#f0f2f5]">
      {/* Blog header */}
      <div className="relative py-16 px-6">
        {blog.cover_image_url && <img src={blog.cover_image_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-20" />}
        <div className="absolute inset-0 bg-gradient-to-t from-[#080c12] via-[#080c12]/80 to-transparent" />
        <div className="relative max-w-2xl mx-auto text-center">
          <h1 className="text-3xl font-black mb-2" style={{ fontFamily: "'Outfit', sans-serif", letterSpacing: '-.03em' }}>{blog.title}</h1>
          {blog.description && <p className="text-sm text-[#b0bdd4] max-w-md mx-auto">{blog.description}</p>}
          {author && (
            <Link href={`/@${author.username}`} className="inline-flex items-center gap-2 mt-4 text-xs text-[#5e7290] hover:text-[#b0bdd4] transition">
              {author.avatar_url ? <img src={author.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" /> : <div className="w-6 h-6 rounded-full bg-[#111822]" />}
              <span className="font-semibold">{author.full_name || author.username}</span>
            </Link>
          )}
        </div>
      </div>

      {/* Type tabs — V11.7: sentence case, LT plural forms */}
      {Object.keys(counts).length > 1 && (
        <div className="max-w-2xl mx-auto px-6 mb-6 flex flex-wrap gap-2">
          {Object.entries(counts).map(([t, n]) => (
            <Link
              key={t}
              href={buildUrl(1, t)}
              className={`text-[13px] px-3 py-1 rounded-full transition border ${
                currentType === t
                  ? 'bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border-[var(--accent-orange)]/60'
                  : 'bg-transparent text-[#b0bdd4] border-white/[.08] hover:border-white/[.18] hover:bg-white/[.04]'
              }`}
              style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 600 }}
            >
              {tabLabel(t, n)}
            </Link>
          ))}
        </div>
      )}

      {/* Posts list */}
      <div className="max-w-2xl mx-auto px-6 pb-16">
        {posts.length > 0 ? (
          <div className="space-y-4">
            {posts.map((p: any) => (
              <Link key={p.id} href={`/blogas/${blog.slug}/${p.slug}`} className="block p-4 rounded-xl border border-white/[.04] bg-white/[.02] hover:border-white/[.08] hover:bg-white/[.03] transition group">
                <div className="flex gap-4">
                  {p.cover_image_url && (
                    <img src={p.cover_image_url} alt="" className="w-32 h-20 rounded-lg object-cover flex-shrink-0 group-hover:scale-[1.02] transition" />
                  )}
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-bold group-hover:text-[var(--accent-orange)] transition" style={{ fontFamily: "'Outfit', sans-serif" }}>{p.title}</h2>
                    {p.summary && <p className="text-sm text-[#5e7290] mt-1 line-clamp-2">{p.summary}</p>}
                    <div className="text-xs text-[#334058] mt-2 flex items-center gap-3" style={{ fontFamily: "'Outfit', sans-serif" }}>
                      <span>{new Date(p.published_at).toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                      <span>·</span>
                      <span>{p.reading_time_min || 1} min skaitymo</span>
                      <span>·</span>
                      <span>♥ {p.like_count}</span>
                      {p.comment_count > 0 && <><span>·</span><span>💬 {p.comment_count}</span></>}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-sm text-[#334058]">Dar nėra įrašų</p>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-10 flex items-center justify-center gap-1 flex-wrap" style={{ fontFamily: "'Outfit', sans-serif" }}>
            {currentPage > 1 && (
              <Link
                href={buildUrl(currentPage - 1)}
                className="px-3 py-2 text-sm rounded-lg border border-white/[.05] hover:border-white/[.15] hover:bg-white/[.05] text-[#b0bdd4] transition"
              >
                ‹ Atgal
              </Link>
            )}
            {pages.map((p, i) =>
              p === '...' ? (
                <span key={`gap-${i}`} className="px-2 text-[#334058] text-sm">…</span>
              ) : (
                <Link
                  key={p}
                  href={buildUrl(p)}
                  className={`min-w-[36px] text-center px-3 py-2 text-sm rounded-lg transition ${
                    p === currentPage
                      ? 'bg-[var(--accent-orange)] text-white font-bold'
                      : 'border border-white/[.05] hover:border-white/[.15] hover:bg-white/[.05] text-[#b0bdd4]'
                  }`}
                >
                  {p}
                </Link>
              )
            )}
            {currentPage < totalPages && (
              <Link
                href={buildUrl(currentPage + 1)}
                className="px-3 py-2 text-sm rounded-lg border border-white/[.05] hover:border-white/[.15] hover:bg-white/[.05] text-[#b0bdd4] transition"
              >
                Pirmyn ›
              </Link>
            )}
          </div>
        )}

        {total > 0 && (
          <p className="text-center text-xs text-[#334058] mt-6">
            {currentPage > 1 ? `Puslapis ${currentPage} iš ${totalPages} · ` : ''}
            Iš viso {total} {currentType !== 'all' ? `${TYPE_LABELS[currentType]?.toLowerCase()}` : ''} įrašų
          </p>
        )}
      </div>
    </div>
  )
}
