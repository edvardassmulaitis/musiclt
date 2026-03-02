import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPost, getPostRelatedArtists } from '@/lib/supabase-blog'
import PostInteractions from './post-interactions'

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

  const artists = await getPostRelatedArtists(post.id)
  const blog = Array.isArray(post.blogs) ? post.blogs[0] : post.blogs
  const profile = Array.isArray(post.profiles) ? post.profiles[0] : post.profiles
  const authorName = (profile as any)?.full_name || (profile as any)?.username || username
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://musiclt.vercel.app'

  // Schema.org Article structured data
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
    publisher: {
      '@type': 'Organization',
      name: 'Music.lt',
      url: siteUrl,
    },
    mainEntityOfPage: `${siteUrl}/blogas/${username}/${slug}`,
    ...(post.cover_image_url ? { image: post.cover_image_url } : {}),
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <article className="max-w-2xl mx-auto px-6 py-10">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs mb-6" style={{ color: '#3d5878' }}>
          <Link href={`/blogas/${username}`} className="hover:text-blue-400 transition">{blog?.title || username}</Link>
          <span>/</span>
          <span style={{ color: '#5e7290' }}>{post.title}</span>
        </div>

        {/* Cover */}
        {post.cover_image_url && (
          <div className="rounded-2xl overflow-hidden mb-8 aspect-[2/1]">
            <img src={post.cover_image_url} alt={post.title} className="w-full h-full object-cover" />
          </div>
        )}

        {/* Title */}
        <h1 className="text-3xl sm:text-4xl font-black leading-tight tracking-tight mb-4"
          style={{ fontFamily: "'Outfit', sans-serif", color: '#f2f4f8' }}>
          {post.title}
        </h1>

        {/* Meta */}
        <div className="flex items-center gap-4 mb-8 flex-wrap">
          <Link href={`/vartotojas/${(profile as any)?.username || username}`} className="flex items-center gap-2 group">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold overflow-hidden"
              style={{ background: `hsl(${(authorName.charCodeAt(0) || 65) * 17 % 360},28%,15%)`, color: 'rgba(255,255,255,0.3)' }}>
              {(profile as any)?.avatar_url
                ? <img src={(profile as any).avatar_url} alt="" className="w-full h-full object-cover" />
                : authorName[0]?.toUpperCase()
              }
            </div>
            <span className="text-sm font-semibold group-hover:text-blue-400 transition" style={{ color: '#8aa8cc' }}>{authorName}</span>
          </Link>
          {post.published_at && (
            <span className="text-xs" style={{ color: '#334058' }}>
              {new Date(post.published_at).toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          )}
          {post.reading_time_min > 0 && (
            <span className="text-xs" style={{ color: '#334058' }}>{post.reading_time_min} min. skaitymo</span>
          )}
          <span className="text-xs" style={{ color: '#1e2e42' }}>👁 {post.view_count || 0}</span>
        </div>

        {/* Content */}
        <div
          className="prose-custom leading-relaxed text-[16px] mb-10"
          style={{ color: '#b0bdd4' }}
          dangerouslySetInnerHTML={{ __html: post.content || '' }}
        />

        {/* Related artists */}
        {artists && artists.length > 0 && (
          <div className="mb-8 p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-[10px] font-black uppercase tracking-[0.12em] mb-3" style={{ color: '#334058' }}>Susiję atlikėjai</p>
            <div className="flex gap-2 flex-wrap">
              {artists.map((a: any) => (
                <Link key={a.id} href={`/atlikejas/${a.slug || a.id}`}
                  className="px-3 py-1.5 rounded-full text-xs font-bold transition-all hover:bg-white/[.06]"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#8aa8cc' }}>
                  {a.name}
                </Link>
              ))}
            </div>
          </div>
        )}

        <PostInteractions postId={post.id} initialLikes={post.like_count || 0} />
      </article>

      <style jsx global>{`
        .prose-custom h2 { font-size: 1.5em; font-weight: 800; margin: 1.5em 0 0.5em; color: #f2f4f8; font-family: 'Outfit', sans-serif; }
        .prose-custom h3 { font-size: 1.2em; font-weight: 700; margin: 1em 0 0.4em; color: #dde8f8; font-family: 'Outfit', sans-serif; }
        .prose-custom p { margin: 0.75em 0; }
        .prose-custom blockquote { border-left: 3px solid rgba(249,115,22,0.5); padding-left: 16px; margin: 20px 0; color: rgba(200,215,240,0.55); font-style: italic; }
        .prose-custom a { color: #3b82f6; text-decoration: underline; }
        .prose-custom a:hover { color: #60a5fa; }
        .prose-custom ul { list-style: disc; padding-left: 24px; margin: 12px 0; }
        .prose-custom img { border-radius: 12px; margin: 20px 0; max-width: 100%; }
        .prose-custom .embed-container { margin: 24px 0; border-radius: 12px; overflow: hidden; }
        .prose-custom iframe { border-radius: 12px; }
      `}</style>
    </>
  )
}
