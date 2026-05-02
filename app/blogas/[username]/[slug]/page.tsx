import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPost, getPostRelatedArtists, getReviewTargetInfo } from '@/lib/supabase-blog'
import { PostContent } from './post-content'
import PostInteractions from './post-interactions'
import { PostTypeBadge } from '@/components/blog/PostTypeBadge'
import type { BlogPostType } from '@/components/blog/post-types'

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

  const postType: BlogPostType = (post.post_type as BlogPostType) || 'article'
  const artists = await getPostRelatedArtists(post.id)

  // Pakraunam target entity info pagal post tipą — review/translation/event
  const targetInfo = (postType === 'review' || postType === 'translation' || postType === 'event')
    ? await getReviewTargetInfo({
        artist_id: post.target_artist_id ?? null,
        album_id:  post.target_album_id  ?? null,
        track_id:  post.target_track_id  ?? null,
        event_id:  post.target_event_id  ?? null,
      })
    : null

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

  const cover = post.cover_image_url

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <article className="max-w-2xl mx-auto px-6 py-10">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs mb-6" style={{ color: '#3d5878' }}>
          <Link href="/blogas" className="hover:text-blue-400 transition">Blogas</Link>
          <span>/</span>
          <Link href={`/blogas/${username}`} className="hover:text-blue-400 transition">{blog?.title || username}</Link>
          <span>/</span>
          <span style={{ color: '#5e7290' }}>{post.title}</span>
        </div>

        {/* Type badge + rating */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <PostTypeBadge type={postType} />
          {postType === 'review' && post.rating !== null && post.rating !== undefined && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black tracking-wider"
              style={{ background: 'rgba(249,115,22,0.15)', color: '#f97316' }}
            >
              {post.rating}/10
            </span>
          )}
        </div>

        {/* Cover — natural ratio, no crop */}
        {cover && (
          <div className="rounded-2xl overflow-hidden mb-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover} alt={post.title} className="w-full h-auto block" />
          </div>
        )}

        {/* Title */}
        <h1 className="text-3xl sm:text-4xl font-black leading-tight tracking-tight mb-4"
          style={{ fontFamily: "'Outfit', sans-serif", color: '#f2f4f8' }}>
          {post.title}
        </h1>

        {/* Target entity card — review/translation/event */}
        {targetInfo && (targetInfo.artist || targetInfo.album || targetInfo.track || targetInfo.event) && (
          <TargetEntityCard target={targetInfo} postType={postType} />
        )}

        {/* Meta */}
        <div className="flex items-center gap-4 mb-8 flex-wrap">
          <Link href={`/vartotojas/${(profile as any)?.username || username}`} className="flex items-center gap-2 group">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold overflow-hidden"
              style={{ background: `hsl(${(authorName.charCodeAt(0) || 65) * 17 % 360},28%,15%)`, color: 'rgba(255,255,255,0.3)' }}>
              {(profile as any)?.avatar_url
                /* eslint-disable-next-line @next/next/no-img-element */
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

        {post.summary && (
          <p className="text-lg mb-6 leading-relaxed" style={{ color: '#a4b8d4' }}>
            {post.summary}
          </p>
        )}

        {/* Main content */}
        {post.content && <PostContent html={post.content} />}

        {/* Topas list rendering */}
        {postType === 'topas' && Array.isArray(post.list_items) && post.list_items.length > 0 && (
          <TopasList items={post.list_items} />
        )}

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-8 mt-4">
            {post.tags.map((tag: string) => (
              <Link
                key={tag}
                href={`/blogas?tag=${encodeURIComponent(tag)}`}
                className="px-2 py-0.5 rounded text-xs font-semibold transition hover:bg-white/[.06]"
                style={{ background: 'rgba(255,255,255,0.04)', color: '#8aa8cc', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                #{tag}
              </Link>
            ))}
          </div>
        )}

        {/* Related artists (cross-cut su BlogPost.artists tabele) */}
        {artists && artists.length > 0 && (
          <div className="mb-8 p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-[10px] font-black uppercase tracking-[0.12em] mb-3" style={{ color: '#334058' }}>Susiję atlikėjai</p>
            <div className="flex gap-2 flex-wrap">
              {artists.map((a: any) => (
                <Link key={a.id} href={`/atlikejai/${a.slug || a.id}`}
                  className="px-3 py-1.5 rounded-full text-xs font-bold transition-all hover:bg-white/[.06]"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#8aa8cc' }}>
                  {a.name}
                </Link>
              ))}
            </div>
          </div>
        )}

        <PostInteractions postId={post.id} initialLikeCount={post.like_count || 0} initialComments={[]} />
      </article>
    </>
  )
}

// ── Topas list (numeruotas sąrašas su nuorodomis) ────────────────────────
function TopasList({ items }: { items: any[] }) {
  return (
    <div className="my-8 space-y-2">
      {items.map((item, idx) => {
        const href =
          item.type === 'artist' ? `/atlikejai/${item.entity_slug || item.entity_id}` :
          item.type === 'album'  ? `/albumai/${item.entity_slug || item.entity_id}` :
          item.type === 'track'  ? `/dainos/${item.entity_slug || item.entity_id}` :
          null
        const Wrapper: any = href ? Link : 'div'
        const wrapperProps = href ? { href } : {}
        return (
          <Wrapper
            key={idx}
            {...wrapperProps}
            className={`flex gap-4 p-3 rounded-lg ${href ? 'transition hover:bg-white/[.04]' : ''}`}
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded flex items-center justify-center text-lg sm:text-xl font-black flex-shrink-0"
              style={{ background: 'rgba(249,115,22,0.15)', color: '#f97316', fontFamily: "'Outfit', sans-serif" }}>
              {item.rank || (idx + 1)}
            </div>
            {item.image_url && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={item.image_url} alt="" className="w-12 h-12 sm:w-14 sm:h-14 rounded-md object-cover flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0 self-center">
              <p className="text-base font-bold truncate" style={{ color: '#f2f4f8', fontFamily: "'Outfit', sans-serif" }}>
                {item.title}
              </p>
              {item.artist && (
                <p className="text-xs truncate" style={{ color: '#8aa8cc' }}>{item.artist}</p>
              )}
              {item.comment && (
                <p className="text-xs mt-1.5 leading-relaxed" style={{ color: '#a4b8d4' }}>{item.comment}</p>
              )}
            </div>
          </Wrapper>
        )
      })}
    </div>
  )
}

// ── Target entity card (review/translation/event) ────────────────────────
function TargetEntityCard({ target, postType }: { target: { artist: any; album: any; track: any; event: any }; postType: BlogPostType }) {
  let entity: { kind: string; href: string; name: string; subname?: string; image?: string | null } | null = null

  if (target.event) {
    const e = target.event
    const date = e.start_date ? new Date(e.start_date).toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' }) : null
    entity = {
      kind: 'Renginys',
      href: `/renginiai/${e.slug || e.id}`,
      name: e.title,
      subname: [date, e.city].filter(Boolean).join(' · '),
      image: e.cover_image_url || null,
    }
  } else if (target.track) {
    const t = target.track
    const a = Array.isArray(t.artist) ? t.artist[0] : t.artist
    entity = {
      kind: postType === 'translation' ? 'Verčiama daina' : 'Daina',
      href: `/dainos/${t.slug || t.id}`,
      name: t.title,
      subname: a?.name || undefined,
      image: t.cover_image_url || a?.cover_image_url || null,
    }
  } else if (target.album) {
    const al = target.album
    const a = Array.isArray(al.artist) ? al.artist[0] : al.artist
    entity = {
      kind: 'Albumas',
      href: `/albumai/${al.slug || al.id}`,
      name: al.title,
      subname: a?.name || undefined,
      image: al.cover_image_url || null,
    }
  } else if (target.artist) {
    const a = target.artist
    entity = {
      kind: 'Atlikėjas',
      href: `/atlikejai/${a.slug || a.id}`,
      name: a.name,
      image: a.cover_image_url || null,
    }
  }

  if (!entity) return null

  return (
    <Link
      href={entity.href}
      className="flex items-center gap-3 mb-6 p-3 rounded-lg transition hover:bg-white/[.04]"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      {entity.image && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={entity.image} alt="" className="w-12 h-12 rounded-md object-cover" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#5e7290' }}>
          {entity.kind}
        </p>
        <p className="text-sm font-semibold truncate" style={{ color: '#dde8f8' }}>
          {entity.name}
        </p>
        {entity.subname && (
          <p className="text-xs truncate" style={{ color: '#5e7290' }}>{entity.subname}</p>
        )}
      </div>
      <span className="text-xs" style={{ color: '#5e7290' }}>→</span>
    </Link>
  )
}
