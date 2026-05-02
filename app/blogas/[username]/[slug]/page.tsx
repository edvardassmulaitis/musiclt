// app/blogas/[username]/[slug]/page.tsx
//
// Single blog post puslapis — perdarytas pagal artist page dvasią.
// Hero su backdrop image (cover arba target entity image), platus content
// container, didesni font'ai. Topas tipas turi atskirą full-width list
// rendering'ą, ne kompaktines korteles.

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPost, getPostRelatedArtists, getReviewTargetInfo } from '@/lib/supabase-blog'
import { proxyImg } from '@/lib/img-proxy'
import { PostContent } from './post-content'
import PostInteractions from './post-interactions'
import { POST_TYPE_OPTIONS, type BlogPostType } from '@/components/blog/post-types'

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

  // Backdrop image source priority: explicit cover > target entity image > first list item image (topas)
  const targetEntityImage =
    targetInfo?.event?.cover_image_url ||
    (targetInfo?.album as any)?.cover_image_url ||
    (targetInfo?.track as any)?.cover_image_url ||
    (targetInfo?.artist as any)?.cover_image_url ||
    null
  const firstListItemImage = postType === 'topas' && Array.isArray(post.list_items) && post.list_items.length > 0
    ? post.list_items[0]?.image_url
    : null
  const heroImage = post.cover_image_url || targetEntityImage || firstListItemImage

  const typeMeta = POST_TYPE_OPTIONS.find(o => o.type === postType)

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
    publisher: { '@type': 'Organization', name: 'Music.lt', url: siteUrl },
    mainEntityOfPage: `${siteUrl}/blogas/${username}/${slug}`,
    ...(post.cover_image_url ? { image: post.cover_image_url } : {}),
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <article className="min-h-screen">
        {/* ── Hero ────────────────────────────────────────────────────── */}
        <Hero
          heroImage={heroImage}
          title={post.title}
          typeLabel={typeMeta?.label || ''}
          rating={post.rating ?? null}
          postType={postType}
          authorName={authorName}
          authorUsername={(profile as any)?.username || username}
          authorAvatar={(profile as any)?.avatar_url || null}
          publishedAt={post.published_at}
          readingTime={post.reading_time_min}
          viewCount={post.view_count || 0}
          breadcrumbBlogTitle={blog?.title || username}
          breadcrumbBlogSlug={username}
        />

        {/* ── Body ───────────────────────────────────────────────────── */}
        <div className="max-w-[860px] mx-auto px-5 sm:px-8 py-10 sm:py-14">
          {/* Target entity card */}
          {targetInfo && (targetInfo.artist || targetInfo.album || targetInfo.track || targetInfo.event) && (
            <TargetEntityCard target={targetInfo} postType={postType} />
          )}

          {/* Summary lead-in (jei seni įrašai turi summary) */}
          {post.summary && (
            <p className="text-xl mb-8 leading-relaxed font-medium" style={{ color: '#b0bdd4', fontFamily: "'Outfit', sans-serif" }}>
              {post.summary}
            </p>
          )}

          {/* Article body */}
          {post.content && <PostContent html={post.content} />}

          {/* Topas list */}
          {postType === 'topas' && Array.isArray(post.list_items) && post.list_items.length > 0 && (
            <TopasList items={post.list_items} />
          )}

          {/* Tags */}
          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-10 mb-2 pt-6 border-t border-white/[.05]">
              {post.tags.map((tag: string) => (
                <Link
                  key={tag}
                  href={`/blogas?tag=${encodeURIComponent(tag)}`}
                  className="px-2.5 py-1 rounded text-xs font-semibold transition hover:bg-white/[.08]"
                  style={{ background: 'rgba(255,255,255,0.04)', color: '#8aa8cc' }}
                >
                  #{tag}
                </Link>
              ))}
            </div>
          )}

          {/* Related artists */}
          {artists && artists.length > 0 && (
            <div className="mt-10 pt-6 border-t border-white/[.05]">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] mb-4" style={{ color: '#5e7290' }}>Susiję atlikėjai</p>
              <div className="flex gap-2 flex-wrap">
                {artists.map((a: any) => (
                  <Link key={a.id} href={`/atlikejai/${a.slug || a.id}`}
                    className="px-3 py-1.5 rounded-full text-xs font-bold transition-all hover:bg-white/[.06]"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#dde8f8' }}>
                    {a.name}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Author footer */}
          <AuthorFooter
            username={(profile as any)?.username || username}
            name={authorName}
            avatar={(profile as any)?.avatar_url || null}
            blogTitle={blog?.title || null}
          />

          {/* Interactions (likes + comments) */}
          <div className="mt-10 pt-6 border-t border-white/[.05]">
            <PostInteractions postId={post.id} initialLikeCount={post.like_count || 0} initialComments={[]} />
          </div>
        </div>
      </article>
    </>
  )
}

// ── Hero su backdrop ──────────────────────────────────────────────────────
function Hero({
  heroImage, title, typeLabel, rating, postType, authorName, authorUsername, authorAvatar,
  publishedAt, readingTime, viewCount, breadcrumbBlogTitle, breadcrumbBlogSlug,
}: {
  heroImage: string | null
  title: string
  typeLabel: string
  rating: number | null
  postType: BlogPostType
  authorName: string
  authorUsername: string
  authorAvatar: string | null
  publishedAt: string | null | undefined
  readingTime: number
  viewCount: number
  breadcrumbBlogTitle: string
  breadcrumbBlogSlug: string
}) {
  return (
    <section className="relative isolate w-full overflow-hidden">
      {/* Backdrop image arba subtle gradient */}
      <div className="absolute inset-0 -z-10">
        {heroImage ? (
          <>
            {/* Blur backdrop kraštams */}
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                backgroundImage: `url(${proxyImg(heroImage)})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                filter: 'blur(40px) saturate(1.2) brightness(0.4)',
                transform: 'scale(1.2)',
              }}
            />
            {/* Reali nuotrauka centre */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={proxyImg(heroImage)}
              alt=""
              className="absolute inset-0 w-full h-full object-cover opacity-75"
              style={{ filter: 'saturate(1.05)' }}
            />
            {/* Bottom gradient — content readability */}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(8,12,18,0.20) 0%, rgba(8,12,18,0.55) 50%, rgba(8,12,18,0.95) 100%)' }} />
          </>
        ) : (
          <div className="absolute inset-0" style={{
            background: 'radial-gradient(ellipse at top, rgba(249,115,22,0.08) 0%, rgba(8,12,18,0) 50%), linear-gradient(180deg, #0a0f1a 0%, #080c12 100%)'
          }} />
        )}
      </div>

      <div className="max-w-[860px] mx-auto px-5 sm:px-8 pt-8 pb-10 sm:pt-10 sm:pb-14 min-h-[340px] sm:min-h-[440px] flex flex-col justify-end">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs mb-6" style={{ color: 'rgba(255,255,255,0.45)' }}>
          <Link href="/blogas" className="hover:text-white transition">Blogas</Link>
          <span>/</span>
          <Link href={`/blogas/${breadcrumbBlogSlug}`} className="hover:text-white transition">{breadcrumbBlogTitle}</Link>
        </div>

        {/* Type badge + rating */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {typeLabel && (
            <span
              className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-[0.14em]"
              style={{ background: 'rgba(249,115,22,0.18)', color: '#f97316' }}
            >
              {typeLabel}
            </span>
          )}
          {postType === 'review' && rating !== null && rating !== undefined && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black tracking-wider"
              style={{ background: 'rgba(255,255,255,0.10)', color: '#fff' }}>
              {rating}/10
            </span>
          )}
        </div>

        {/* Title */}
        <h1
          className="text-3xl sm:text-5xl font-black leading-[1.05] mb-5"
          style={{ fontFamily: "'Outfit', sans-serif", letterSpacing: '-.03em', color: '#fff', textShadow: heroImage ? '0 2px 12px rgba(0,0,0,0.5)' : undefined }}
        >
          {title}
        </h1>

        {/* Meta row */}
        <div className="flex items-center gap-3 sm:gap-5 flex-wrap text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
          <Link href={`/vartotojas/${authorUsername}`} className="flex items-center gap-2 hover:text-white transition group">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold overflow-hidden ring-2 ring-white/10"
              style={{ background: `hsl(${(authorName.charCodeAt(0) || 65) * 17 % 360},35%,30%)`, color: 'rgba(255,255,255,0.9)' }}
            >
              {authorAvatar
                /* eslint-disable-next-line @next/next/no-img-element */
                ? <img src={authorAvatar} alt="" className="w-full h-full object-cover" />
                : authorName[0]?.toUpperCase()
              }
            </div>
            <span className="font-semibold">{authorName}</span>
          </Link>
          {publishedAt && (
            <>
              <span style={{ color: 'rgba(255,255,255,0.25)' }}>·</span>
              <span>{new Date(publishedAt).toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </>
          )}
          {readingTime > 0 && (
            <>
              <span style={{ color: 'rgba(255,255,255,0.25)' }}>·</span>
              <span>{readingTime} min. skaitymo</span>
            </>
          )}
          <span style={{ color: 'rgba(255,255,255,0.25)' }}>·</span>
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>👁 {viewCount}</span>
        </div>
      </div>
    </section>
  )
}

// ── Topas list — substantial cards ──────────────────────────────────────
function TopasList({ items }: { items: any[] }) {
  return (
    <ol className="my-8 space-y-3 list-none p-0">
      {items.map((item, idx) => {
        const href =
          item.type === 'artist' ? `/atlikejai/${item.entity_slug || item.entity_id}` :
          item.type === 'album'  ? `/albumai/${item.entity_slug || item.entity_id}` :
          item.type === 'track'  ? `/dainos/${item.entity_slug || item.entity_id}` :
          null
        const Wrapper: any = href ? Link : 'div'
        const wrapperProps = href ? { href } : {}
        return (
          <li key={idx}>
            <Wrapper
              {...wrapperProps}
              className={`flex items-center gap-4 sm:gap-5 p-4 sm:p-5 rounded-xl ${href ? 'transition group hover:scale-[1.005]' : ''}`}
              style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}
            >
              {/* Rank — big and prominent */}
              <div
                className="flex-shrink-0 flex items-center justify-center font-black tabular-nums"
                style={{
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: items.length >= 100 ? '1.5rem' : '2rem',
                  lineHeight: 1,
                  color: idx === 0 ? '#f97316' : idx === 1 ? '#dde8f8' : idx === 2 ? '#a4b8d4' : '#5e7290',
                  width: '52px',
                  letterSpacing: '-.03em',
                }}
              >
                {item.rank || (idx + 1)}
              </div>

              {/* Cover */}
              {item.image_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={item.image_url} alt="" className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg object-cover flex-shrink-0 group-hover:scale-[1.03] transition" />
              ) : (
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg flex-shrink-0" style={{ background: 'rgba(255,255,255,0.04)' }} />
              )}

              {/* Title + artist + comment */}
              <div className="flex-1 min-w-0">
                <p className="text-base sm:text-lg font-bold leading-tight group-hover:text-[#f97316] transition" style={{ color: '#f2f4f8', fontFamily: "'Outfit', sans-serif", letterSpacing: '-.01em' }}>
                  {item.title}
                </p>
                {item.artist && (
                  <p className="text-sm mt-0.5" style={{ color: '#8aa8cc' }}>{item.artist}</p>
                )}
                {item.comment && (
                  <p className="text-sm mt-2 leading-relaxed" style={{ color: '#a4b8d4', fontStyle: 'italic' }}>
                    {item.comment}
                  </p>
                )}
              </div>
            </Wrapper>
          </li>
        )
      })}
    </ol>
  )
}

// ── Target entity card ──────────────────────────────────────────────────
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
      className="flex items-center gap-4 mb-8 p-4 rounded-xl transition hover:bg-white/[.04] group"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      {entity.image && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={entity.image} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0 group-hover:scale-[1.03] transition" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: '#f97316' }}>
          {entity.kind}
        </p>
        <p className="text-base font-bold mt-0.5 truncate" style={{ color: '#f2f4f8', fontFamily: "'Outfit', sans-serif" }}>
          {entity.name}
        </p>
        {entity.subname && (
          <p className="text-sm truncate" style={{ color: '#8aa8cc' }}>{entity.subname}</p>
        )}
      </div>
      <span className="text-base flex-shrink-0" style={{ color: '#5e7290' }}>→</span>
    </Link>
  )
}

// ── Author footer card ─────────────────────────────────────────────────
function AuthorFooter({ username, name, avatar, blogTitle }: { username: string; name: string; avatar: string | null; blogTitle: string | null }) {
  return (
    <div className="mt-12 pt-6 border-t border-white/[.05]">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] mb-4" style={{ color: '#5e7290' }}>Autorius</p>
      <div className="flex items-center gap-4">
        <Link href={`/vartotojas/${username}`} className="flex-shrink-0">
          <div className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center text-lg font-bold ring-2 ring-white/10 hover:ring-white/20 transition"
            style={{ background: `hsl(${(name.charCodeAt(0) || 65) * 17 % 360},35%,30%)`, color: '#fff' }}>
            {avatar
              /* eslint-disable-next-line @next/next/no-img-element */
              ? <img src={avatar} alt="" className="w-full h-full object-cover" />
              : name[0]?.toUpperCase()
            }
          </div>
        </Link>
        <div className="flex-1 min-w-0">
          <Link href={`/vartotojas/${username}`} className="text-base font-bold hover:text-[#f97316] transition" style={{ color: '#f2f4f8', fontFamily: "'Outfit', sans-serif" }}>
            {name}
          </Link>
          {blogTitle && (
            <p className="text-xs" style={{ color: '#5e7290' }}>{blogTitle}</p>
          )}
        </div>
        <Link
          href={`/blogas/${username}`}
          className="px-3 py-1.5 rounded-full text-xs font-bold transition hover:bg-white/[.06]"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#dde8f8' }}
        >
          Visi įrašai
        </Link>
      </div>
    </div>
  )
}
