// app/blogas/[username]/page.tsx
import { notFound } from 'next/navigation'
import { getBlogBySlug, getBlogPosts } from '@/lib/supabase-blog'
import Link from 'next/link'
import type { Metadata } from 'next'

type Props = { params: Promise<{ username: string }> }

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

export default async function BlogPage({ params }: Props) {
  const { username } = await params
  const blog = await getBlogBySlug(username)
  if (!blog) notFound()

  const { posts, total } = await getBlogPosts(blog.id, 20)
  const author = (blog as any).profiles

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
            <Link href={`/vartotojas/${author.username}`} className="inline-flex items-center gap-2 mt-4 text-xs text-[#5e7290] hover:text-[#b0bdd4] transition">
              {author.avatar_url ? <img src={author.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" /> : <div className="w-6 h-6 rounded-full bg-[#111822]" />}
              <span className="font-semibold">{author.full_name || author.username}</span>
            </Link>
          )}
        </div>
      </div>

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
                    <h2 className="text-lg font-bold group-hover:text-[#f97316] transition" style={{ fontFamily: "'Outfit', sans-serif" }}>{p.title}</h2>
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
            <p className="text-sm text-[#334058]">Dar nėra straipsnių</p>
          </div>
        )}
        {total > 20 && <p className="text-center text-xs text-[#334058] mt-8">Rodoma {posts.length} iš {total} straipsnių</p>}
      </div>
    </div>
  )
}
