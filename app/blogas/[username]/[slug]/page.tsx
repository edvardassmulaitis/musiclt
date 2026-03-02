// app/blogas/[username]/[slug]/page.tsx
import { notFound } from 'next/navigation'
import { getPost, getPostComments, getPostRelatedArtists, incrementPostViews } from '@/lib/supabase-blog'
import Link from 'next/link'
import type { Metadata } from 'next'
import PostInteractions from './post-interactions'

type Props = { params: Promise<{ username: string; slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username, slug } = await params
  const post = await getPost(username, slug)
  if (!post) return { title: 'Nerastas' }
  return {
    title: `${post.title} — ${post.blog.title}`,
    description: post.summary || post.meta_description || '',
    openGraph: {
      title: post.title,
      description: post.summary || '',
      type: 'article',
      images: post.og_image_url || post.cover_image_url ? [post.og_image_url || post.cover_image_url] : [],
      publishedTime: post.published_at,
    },
  }
}

export default async function BlogPostPage({ params }: Props) {
  const { username, slug } = await params
  const post = await getPost(username, slug)
  if (!post) notFound()
  if (post.status !== 'published') notFound()

  // Increment view count (fire and forget)
  incrementPostViews(post.id).catch(() => {})

  const [comments, relatedArtists] = await Promise.all([
    getPostComments(post.id),
    getPostRelatedArtists(post.id),
  ])

  const author = (post.blog as any).profiles
  const blogSlug = post.blog.slug

  return (
    <div className="min-h-screen bg-[#080c12] text-[#f0f2f5]">
      {/* Cover image */}
      {post.cover_image_url && (
        <div className="relative h-64 md:h-80">
          <img src={post.cover_image_url} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#080c12] via-[#080c12]/50 to-transparent" />
        </div>
      )}

      <article className="max-w-2xl mx-auto px-6 py-8">
        {/* Header */}
        <header className="mb-8">
          <Link href={`/blogas/${blogSlug}`} className="text-xs text-[#f97316] font-bold uppercase tracking-wider hover:underline" style={{ fontFamily: "'Outfit', sans-serif" }}>
            ← {post.blog.title}
          </Link>
          <h1 className="text-3xl md:text-4xl font-black mt-3 leading-tight" style={{ fontFamily: "'Outfit', sans-serif", letterSpacing: '-.04em' }}>
            {post.title}
          </h1>
          <div className="flex items-center gap-3 mt-4">
            {author && (
              <Link href={`/vartotojas/${author.username}`} className="flex items-center gap-2 text-sm text-[#b0bdd4] hover:text-white transition">
                {author.avatar_url ? <img src={author.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" /> : <div className="w-8 h-8 rounded-full bg-[#111822]" />}
                <span className="font-semibold">{author.full_name || author.username}</span>
              </Link>
            )}
            <span className="text-xs text-[#334058]">·</span>
            <span className="text-xs text-[#5e7290]">{new Date(post.published_at).toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            <span className="text-xs text-[#334058]">·</span>
            <span className="text-xs text-[#5e7290]">{post.reading_time_min || 1} min</span>
          </div>
        </header>

        {/* Content */}
        <div
          className="prose prose-invert prose-sm max-w-none"
          style={{ color: '#b0bdd4', lineHeight: '1.85', fontSize: '15px' }}
          dangerouslySetInnerHTML={{ __html: post.content || '<p>Turinys ruošiamas...</p>' }}
        />

        {/* Related artists */}
        {relatedArtists.length > 0 && (
          <div className="mt-10 pt-6 border-t border-white/[.06]">
            <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-[#334058] mb-3" style={{ fontFamily: "'Outfit', sans-serif" }}>
              Susiję atlikėjai
            </h3>
            <div className="flex flex-wrap gap-2">
              {relatedArtists.map((a: any) => (
                <Link key={a.id} href={`/atlikejai/${a.slug}`} className="flex items-center gap-2 bg-white/[.03] border border-white/[.06] rounded-lg px-3 py-2 hover:border-white/[.1] transition text-sm font-semibold">
                  {a.cover_image_url ? <img src={a.cover_image_url} alt="" className="w-6 h-6 rounded-full object-cover" /> : <div className="w-6 h-6 rounded-full bg-[#111822]" />}
                  {a.name}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Likes + Comments (client component) */}
        <PostInteractions postId={post.id} initialLikeCount={post.like_count} initialComments={comments} />
      </article>
    </div>
  )
}
