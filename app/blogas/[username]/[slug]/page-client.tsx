'use client'
// app/blogas/[username]/[slug]/page-client.tsx
//
// Client-side render layer dėl: (a) EntityCommentsBlock requires session
// context, (b) like button optimistic state'ui, (c) share clipboard.
// Layout follows news-article pattern (.bp-* klasės adaptuotos iš .na-*):
//   - Full-bleed hero su nuotrauka dešinėje, dark fade kairėje
//   - Page max-w 1300px su 28px padding'ais
//   - Grid: 320px sticky sidebar + 1fr main
//   - Sidebar: prisegtos dainos/atlikėjai/albumai + target entity card
//   - Main: body, topas list (jei topas), tags, footer su like/share/source,
//     komentarai per EntityCommentsBlock (entity_type='blog_post')

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import EntityCommentsBlock from '@/components/EntityCommentsBlock'
import LikesModal, { type LikeUser } from '@/components/LikesModal'
import { PostContent } from './post-content'
import { type BlogPostType } from '@/components/blog/post-types'

type Attachments = {
  artists: any[]
  albums:  any[]
  tracks:  any[]
}

type Props = {
  post: {
    id: string
    title: string
    summary: string | null
    content: string | null
    published_at: string | null | undefined
    reading_time_min: number
    view_count: number
    like_count: number
    comment_count: number
    rating: number | null
    tags: string[]
    list_items: any[]
  }
  postType: BlogPostType
  typeLabel: string
  username: string
  authorName: string
  authorUsername: string
  authorAvatar: string | null
  blogTitle: string | null
  heroImage: string | null
  attachments: Attachments
  targetInfo: any | null
  hasSidebar: boolean
}

export default function BlogPostPageClient(props: Props) {
  const { post, postType, typeLabel, username, authorName, authorUsername, authorAvatar,
          blogTitle, heroImage, attachments, targetInfo, hasSidebar } = props

  const formatDate = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' }) : ''

  return (
    <>
      {/* CSS — inline, kad SSR-render'intas markup'as turėtų teisingas tokens */}
      <style jsx global>{`
        .bp-root { background:#080d14; color:#dde8f8; font-family:'DM Sans',sans-serif; -webkit-font-smoothing:antialiased; min-height:100vh; }

        /* ── HERO ── */
        .bp-hero { position:relative; height:52vh; min-height:340px; max-height:480px; overflow:hidden; background:#080d14;
                   display:flex; flex-direction:column; justify-content:flex-end; }
        .bp-hero-img { position:absolute; top:0; right:0; bottom:0; width:60%; object-fit:cover; object-position:center 20%;
                       -webkit-mask-image:linear-gradient(to left, black 40%, transparent 100%);
                       mask-image:linear-gradient(to left, black 40%, transparent 100%); animation:bp-zoom 16s ease-out forwards; }
        @keyframes bp-zoom { from { transform:scale(1) } to { transform:scale(1.07) } }
        .bp-hero-overlay { position:absolute; inset:0; background:linear-gradient(to top, rgba(8,13,20,0.65) 0%, transparent 60%); pointer-events:none; }
        .bp-hero-noimg { position:absolute; inset:0; background:linear-gradient(135deg, #0d1420 0%, #111826 100%); }
        .bp-hero-noimg::after { content:''; position:absolute; inset:0;
                                background:radial-gradient(ellipse at 75% 40%, rgba(249,115,22,0.1) 0%, transparent 55%); }
        .bp-hero-content { position:relative; z-index:2; display:flex; flex-direction:column; justify-content:flex-end;
                           width:100%; max-width:1300px; margin:0 auto; padding:0 28px 36px; }
        .bp-hero-inner { max-width:680px; animation:bp-in .7s .05s both; }
        @keyframes bp-in { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }

        .bp-breadcrumb { display:flex; align-items:center; gap:8px; margin-bottom:12px; font-size:12px; color:rgba(255,255,255,0.45); }
        .bp-breadcrumb a { color:inherit; text-decoration:none; font-weight:600; }
        .bp-breadcrumb a:hover { color:rgba(255,255,255,0.85); }
        .bp-breadcrumb-sep { color:rgba(255,255,255,0.2); }
        .bp-chip { display:inline-block; font-family:'Outfit',sans-serif; font-size:10px; font-weight:900; letter-spacing:.08em;
                   text-transform:uppercase; color:#fff; padding:4px 12px; border-radius:20px;
                   background:rgba(249,115,22,0.2); border:1px solid rgba(249,115,22,0.3); }
        .bp-h1 { font-family:'Outfit',sans-serif; font-size:clamp(1.6rem,3vw,2.8rem); font-weight:900; line-height:1.06;
                 letter-spacing:-.03em; color:#fff; margin:14px 0 16px; text-shadow:0 2px 14px rgba(0,0,0,0.4); }
        .bp-meta { display:flex; align-items:center; gap:10px 14px; flex-wrap:wrap; font-size:12.5px; color:rgba(255,255,255,0.7); }
        .bp-author-pill { display:inline-flex; align-items:center; gap:8px; background:rgba(255,255,255,0.1); backdrop-filter:blur(8px);
                          border:1px solid rgba(255,255,255,0.15); border-radius:100px; padding:4px 12px 4px 4px;
                          text-decoration:none; transition:background .2s; color:inherit; }
        .bp-author-pill:hover { background:rgba(255,255,255,0.18); }
        .bp-author-pill .av { width:22px; height:22px; border-radius:50%; overflow:hidden; flex-shrink:0;
                              display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:900; color:#fff; }
        .bp-author-pill .av img { width:100%; height:100%; object-fit:cover; }
        .bp-author-pill span { font-size:12px; font-weight:700; color:rgba(255,255,255,0.92); }
        .bp-dot { color:rgba(255,255,255,0.25); }
        .bp-rating { display:inline-flex; align-items:center; gap:4px; background:rgba(255,255,255,0.12); border-radius:6px;
                     padding:3px 8px; font-family:'Outfit',sans-serif; font-size:11px; font-weight:900; color:#fff; }

        /* ── PAGE LAYOUT ── */
        .bp-page { max-width:1300px; margin:0 auto; padding:0 28px; }
        .bp-grid { display:grid; gap:44px; align-items:start; padding:36px 0 90px; }
        .bp-grid.has-sb { grid-template-columns:340px 1fr; }
        .bp-grid.no-sb  { grid-template-columns:1fr; max-width:820px; margin:0 auto; }

        /* ── SIDEBAR — sticky left ── */
        .bp-sidebar { position:sticky; top:80px; display:flex; flex-direction:column; gap:14px; }
        .bp-sb-section { background:rgba(255,255,255,0.025); border:1px solid rgba(255,255,255,0.05); border-radius:14px; padding:14px; }
        .bp-sb-heading { font-family:'Outfit',sans-serif; font-size:10px; font-weight:900; letter-spacing:.14em;
                         text-transform:uppercase; color:#5e7290; margin:0 0 10px; }

        .bp-att-item { display:flex; align-items:center; gap:10px; padding:6px; border-radius:10px;
                       text-decoration:none; color:inherit; transition:background .15s; }
        .bp-att-item:hover { background:rgba(255,255,255,0.04); }
        .bp-att-thumb { width:42px; height:42px; border-radius:8px; object-fit:cover; flex-shrink:0;
                        background:rgba(255,255,255,0.04); }
        .bp-att-thumb-fallback { width:42px; height:42px; border-radius:8px; flex-shrink:0; display:flex; align-items:center;
                                 justify-content:center; font-family:'Outfit',sans-serif; font-size:14px; font-weight:900;
                                 background:rgba(255,255,255,0.05); color:#5e7290; }
        .bp-att-text { flex:1; min-width:0; }
        .bp-att-title { font-size:13px; font-weight:700; color:#dde8f8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .bp-att-sub { font-size:11px; color:#8aa8cc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:1px; }
        .bp-att-kind { font-family:'Outfit',sans-serif; font-size:9px; font-weight:900; letter-spacing:.1em;
                       text-transform:uppercase; color:#f97316; flex-shrink:0; padding-left:4px; }

        /* ── PROSE ── */
        .bp-prose { color:#b0bdd4; font-size:1.06rem; line-height:1.88; }
        .bp-prose p { margin-bottom:22px; }
        .bp-prose a { color:#3b82f6; text-decoration:underline; }
        .bp-prose h2 { font-family:'Outfit',sans-serif; font-size:1.5rem; font-weight:900; color:#f2f4f8;
                       margin:40px 0 16px; letter-spacing:-.025em; }
        .bp-prose h3 { font-family:'Outfit',sans-serif; font-size:1.18rem; font-weight:800; color:#f2f4f8; margin:32px 0 12px; }
        .bp-prose blockquote { border-left:3px solid #f97316; padding:14px 22px; margin:32px 0;
                               background:rgba(249,115,22,.05); border-radius:0 12px 12px 0; }
        .bp-prose blockquote p { font-size:1.08rem; font-weight:700; font-style:italic; color:#dde8f8; line-height:1.55; margin:0; }
        .bp-prose ul, .bp-prose ol { margin:16px 0 24px 22px; }
        .bp-prose li { margin-bottom:6px; line-height:1.78; color:#b0bdd4; }
        .bp-prose strong { color:#f2f4f8; font-weight:700; }
        .bp-prose img { max-width:100%; border-radius:10px; }

        /* ── SUMMARY lead-in ── */
        .bp-summary { font-size:1.18rem; line-height:1.55; color:#b0bdd4; font-weight:500;
                      margin-bottom:28px; padding-bottom:24px; border-bottom:1px solid rgba(255,255,255,0.06);
                      font-family:'Outfit',sans-serif; }

        /* ── ACTIONS BAR ── */
        .bp-actions { display:flex; align-items:center; gap:10px; margin-top:36px; padding:14px 0 18px;
                      border-top:1px solid rgba(255,255,255,0.06); border-bottom:1px solid rgba(255,255,255,0.06); flex-wrap:wrap; }
        .bp-action-btn { display:inline-flex; align-items:center; gap:6px; padding:7px 14px; border-radius:100px;
                         background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); color:#dde8f8;
                         font-family:'Outfit',sans-serif; font-size:12px; font-weight:700; cursor:pointer; transition:background .15s; }
        .bp-action-btn:hover { background:rgba(255,255,255,0.07); }
        .bp-action-btn.active { background:rgba(249,115,22,0.15); border-color:rgba(249,115,22,0.35); color:#f97316; }
        .bp-action-count { margin-left:4px; text-decoration:underline; text-decoration-style:dotted; cursor:pointer; }

        /* ── TOPAS list ── */
        .bp-topas { list-style:none; padding:0; margin:36px 0; display:flex; flex-direction:column; gap:10px; }
        .bp-topas-item { display:flex; align-items:center; gap:18px; padding:14px 16px; border-radius:14px;
                         background:rgba(255,255,255,0.025); border:1px solid rgba(255,255,255,0.05);
                         text-decoration:none; color:inherit; transition:transform .15s; }
        .bp-topas-item.is-link:hover { transform:translateY(-1px); background:rgba(255,255,255,0.035); }
        .bp-topas-rank { font-family:'Outfit',sans-serif; font-weight:900; letter-spacing:-.03em; line-height:1;
                         min-width:48px; text-align:center; }
        .bp-topas-cover { width:62px; height:62px; border-radius:10px; object-fit:cover; flex-shrink:0; background:rgba(255,255,255,0.04); }
        .bp-topas-title { font-family:'Outfit',sans-serif; font-size:1.04rem; font-weight:800; color:#f2f4f8; line-height:1.2;
                          letter-spacing:-.01em; margin:0; }
        .bp-topas-artist { font-size:.85rem; color:#8aa8cc; margin:3px 0 0; }
        .bp-topas-comment { font-size:.88rem; color:#a4b8d4; font-style:italic; margin:8px 0 0; line-height:1.5; }

        /* ── TAGS ── */
        .bp-tags { display:flex; flex-wrap:wrap; gap:6px; margin:36px 0 0; padding-top:24px;
                   border-top:1px solid rgba(255,255,255,0.05); }
        .bp-tag { padding:5px 11px; border-radius:14px; background:rgba(255,255,255,0.04);
                  border:1px solid rgba(255,255,255,0.06); color:#8aa8cc; font-size:11.5px; font-weight:700;
                  text-decoration:none; transition:background .15s; font-family:'Outfit',sans-serif; }
        .bp-tag:hover { background:rgba(255,255,255,0.07); color:#dde8f8; }

        /* ── AUTHOR FOOTER ── */
        .bp-author-footer { margin-top:48px; padding:18px; background:rgba(255,255,255,0.03);
                            border:1px solid rgba(255,255,255,0.06); border-radius:14px; display:flex;
                            align-items:center; gap:14px; }
        .bp-author-footer .av-lg { width:54px; height:54px; border-radius:50%; flex-shrink:0; overflow:hidden;
                                   display:flex; align-items:center; justify-content:center; font-family:'Outfit',sans-serif;
                                   font-size:18px; font-weight:900; color:#fff; ring:2px solid rgba(255,255,255,0.1); }
        .bp-author-footer .av-lg img { width:100%; height:100%; object-fit:cover; }
        .bp-author-footer-name { font-family:'Outfit',sans-serif; font-size:1.05rem; font-weight:800; color:#f2f4f8;
                                 text-decoration:none; }
        .bp-author-footer-name:hover { color:#f97316; }
        .bp-author-footer-sub { font-size:11.5px; color:#5e7290; margin-top:2px; }
        .bp-author-footer-link { padding:8px 16px; border-radius:100px; background:rgba(255,255,255,0.05);
                                 border:1px solid rgba(255,255,255,0.08); color:#dde8f8; font-family:'Outfit',sans-serif;
                                 font-size:12px; font-weight:700; text-decoration:none; transition:background .15s; }
        .bp-author-footer-link:hover { background:rgba(255,255,255,0.08); }

        /* ── COMMENTS WRAP ── */
        .bp-comments { margin-top:56px; padding-top:32px; border-top:1px solid rgba(255,255,255,0.06); }

        /* ── RESPONSIVE ── */
        @media (max-width: 960px) {
          .bp-grid.has-sb { grid-template-columns:1fr; }
          .bp-sidebar { position:static; top:auto; order:2; }
          .bp-hero { height:auto; min-height:280px; }
          .bp-hero-img { width:100%; height:240px; position:relative; -webkit-mask-image:none; mask-image:none; }
          .bp-hero-overlay { display:none; }
          .bp-hero-content { padding:18px 18px 22px; }
          .bp-page { padding:0 18px; }
          .bp-grid { padding:24px 0 60px; gap:30px; }
        }
        @media (max-width: 540px) {
          .bp-hero-img { height:180px; }
          .bp-h1 { font-size:1.55rem; }
        }
      `}</style>

      <div className="bp-root">
        {/* ══════════ HERO ══════════ */}
        <div className="bp-hero">
          {heroImage ? (
            <>
              <img src={proxyImg(heroImage)} alt="" className="bp-hero-img" />
              <div className="bp-hero-overlay" />
            </>
          ) : (
            <div className="bp-hero-noimg" />
          )}
          <div className="bp-hero-content">
            <div className="bp-hero-inner" style={{ maxWidth: hasSidebar ? 'calc(100% - 340px - 44px)' : undefined }}>
              <div className="bp-breadcrumb">
                <Link href="/blogas">Blogas</Link>
                <span className="bp-breadcrumb-sep">/</span>
                <Link href={`/blogas/${username}`}>{blogTitle || username}</Link>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {typeLabel && <span className="bp-chip">{typeLabel}</span>}
                {postType === 'review' && post.rating !== null && post.rating !== undefined && (
                  <span className="bp-rating">{post.rating}/10</span>
                )}
              </div>
              <h1 className="bp-h1">{post.title}</h1>
              <div className="bp-meta">
                <Link href={`/vartotojas/${authorUsername}`} className="bp-author-pill">
                  <div className="av" style={{ background: `hsl(${(authorName.charCodeAt(0) || 65) * 17 % 360},35%,30%)` }}>
                    {authorAvatar
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={authorAvatar} alt="" />
                      : (authorName[0] || '?').toUpperCase()
                    }
                  </div>
                  <span>{authorName}</span>
                </Link>
                {post.published_at && <><span className="bp-dot">·</span><span>{formatDate(post.published_at)}</span></>}
                {post.reading_time_min > 0 && <><span className="bp-dot">·</span><span>{post.reading_time_min} min. skaitymo</span></>}
                <span className="bp-dot">·</span>
                <span style={{ color: 'rgba(255,255,255,0.45)' }}>👁 {post.view_count}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ══════════ MAIN + SIDEBAR ══════════ */}
        <div className="bp-page">
          <div className={`bp-grid ${hasSidebar ? 'has-sb' : 'no-sb'}`}>

            {/* SIDEBAR (left, sticky) */}
            {hasSidebar && (
              <aside className="bp-sidebar">
                {/* Target entity (recenzija/vertimas/event) */}
                {targetInfo && (targetInfo.artist || targetInfo.album || targetInfo.track || targetInfo.event) && (
                  <TargetEntityCard target={targetInfo} postType={postType} />
                )}
                {/* Tracks (most contextual; show first if any) */}
                {attachments.tracks.length > 0 && (
                  <div className="bp-sb-section">
                    <p className="bp-sb-heading">Dainos · {attachments.tracks.length}</p>
                    {attachments.tracks.map((t: any) => {
                      const a = Array.isArray(t.artist) ? t.artist[0] : t.artist
                      return (
                        <Link key={t.id} href={`/dainos/${t.slug || t.id}`} className="bp-att-item">
                          {t.cover_image_url
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={proxyImg(t.cover_image_url)} alt="" className="bp-att-thumb" />
                            : <div className="bp-att-thumb-fallback">{(t.title || '?')[0]?.toUpperCase()}</div>
                          }
                          <div className="bp-att-text">
                            <div className="bp-att-title">{t.title}</div>
                            {a?.name && <div className="bp-att-sub">{a.name}</div>}
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                )}
                {/* Albums */}
                {attachments.albums.length > 0 && (
                  <div className="bp-sb-section">
                    <p className="bp-sb-heading">Albumai · {attachments.albums.length}</p>
                    {attachments.albums.map((al: any) => {
                      const a = Array.isArray(al.artist) ? al.artist[0] : al.artist
                      return (
                        <Link key={al.id} href={`/albumai/${al.slug || al.id}`} className="bp-att-item">
                          {al.cover_image_url
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={proxyImg(al.cover_image_url)} alt="" className="bp-att-thumb" />
                            : <div className="bp-att-thumb-fallback">{(al.title || '?')[0]?.toUpperCase()}</div>
                          }
                          <div className="bp-att-text">
                            <div className="bp-att-title">{al.title}</div>
                            <div className="bp-att-sub">
                              {a?.name}{al.release_year ? ` · ${al.release_year}` : ''}
                            </div>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                )}
                {/* Artists */}
                {attachments.artists.length > 0 && (
                  <div className="bp-sb-section">
                    <p className="bp-sb-heading">Atlikėjai · {attachments.artists.length}</p>
                    {attachments.artists.map((a: any) => (
                      <Link key={a.id} href={`/atlikejai/${a.slug || a.id}`} className="bp-att-item">
                        {a.cover_image_url
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={proxyImg(a.cover_image_url)} alt="" className="bp-att-thumb" />
                          : <div className="bp-att-thumb-fallback">{(a.name || '?')[0]?.toUpperCase()}</div>
                        }
                        <div className="bp-att-text">
                          <div className="bp-att-title">{a.name}</div>
                          <div className="bp-att-sub">music.lt atlikėjas</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </aside>
            )}

            {/* MAIN (right) */}
            <main>
              {/* Summary lead-in */}
              {post.summary && <p className="bp-summary">{post.summary}</p>}

              {/* Article body */}
              {post.content && (
                <div className="bp-prose">
                  <PostContent html={post.content} />
                </div>
              )}

              {/* Topas list */}
              {postType === 'topas' && post.list_items.length > 0 && (
                <TopasList items={post.list_items} />
              )}

              {/* Tags */}
              {post.tags.length > 0 && (
                <div className="bp-tags">
                  {post.tags.map((tag: string) => (
                    <Link key={tag} href={`/blogas?tag=${encodeURIComponent(tag)}`} className="bp-tag">
                      #{tag}
                    </Link>
                  ))}
                </div>
              )}

              {/* Action bar — like + share */}
              <BlogActionsBar postId={post.id} initialLikeCount={post.like_count} commentCount={post.comment_count} />

              {/* Author footer */}
              <AuthorFooter
                username={authorUsername}
                name={authorName}
                avatar={authorAvatar}
                blogTitle={blogTitle}
              />

              {/* Komentarai — unified component */}
              <div className="bp-comments">
                <EntityCommentsBlock
                  entityType="blog_post"
                  entityId={post.id}
                  title={post.comment_count > 0 ? `${post.comment_count.toLocaleString()} komentarai` : 'Komentarai'}
                  skipLegacy
                />
              </div>
            </main>
          </div>
        </div>
      </div>
    </>
  )
}

/* ─── Action bar: like + share + Facebook ───────────────────────────────── */
function BlogActionsBar({ postId, initialLikeCount, commentCount }: { postId: string; initialLikeCount: number; commentCount: number }) {
  const { data: session } = useSession()
  const [liked, setLiked] = useState(false)
  const [count, setCount] = useState(initialLikeCount || 0)
  const [likers, setLikers] = useState<LikeUser[]>([])
  const [modalOpen, setModalOpen] = useState(false)

  async function loadLikers() {
    try {
      const r = await fetch(`/api/blog/posts/${postId}/likers`)
      if (r.ok) {
        const d = await r.json()
        setLikers(d.users || [])
        setCount(d.count ?? count)
        const me = (session?.user as any)?.name || (session?.user as any)?.email
        if (me) {
          setLiked((d.users || []).some((u: any) => (u.user_username || '').toLowerCase() === String(me).toLowerCase()))
        }
      }
    } catch {}
  }

  async function toggleLike() {
    if (!session?.user) return
    setLiked(v => !v)
    setCount(c => liked ? Math.max(0, c - 1) : c + 1)
    try {
      await fetch(`/api/blog/posts/${postId}/like`, { method: 'POST' })
      loadLikers()
    } catch {}
  }

  function share() {
    if (typeof window === 'undefined') return
    if (navigator.share) {
      navigator.share({ url: window.location.href }).catch(() => {})
    } else {
      navigator.clipboard.writeText(window.location.href)
      alert('Nuoroda nukopijuota!')
    }
  }

  return (
    <>
      <div className="bp-actions">
        <button
          type="button"
          onClick={session?.user ? toggleLike : undefined}
          className={`bp-action-btn ${liked ? 'active' : ''}`}
          style={{ cursor: session?.user ? 'pointer' : 'not-allowed' }}
          title={session?.user ? 'Patinka' : 'Prisijunk, kad patiktum'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          Patinka
          {count > 0 && (
            <span
              className="bp-action-count"
              onClick={e => { e.stopPropagation(); loadLikers(); setModalOpen(true) }}
              title="Pamatyti kas paspaudė"
            >
              {count}
            </span>
          )}
        </button>
        <button type="button" onClick={share} className="bp-action-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
          Dalintis
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#5e7290', fontFamily: "'Outfit',sans-serif" }}>
          💬 {commentCount} komentarai
        </span>
      </div>
      <LikesModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Patinka"
        count={count}
        users={likers}
      />
    </>
  )
}

/* ─── Topas list ─────────────────────────────────────────────────────────── */
function TopasList({ items }: { items: any[] }) {
  return (
    <ol className="bp-topas">
      {items.map((item, idx) => {
        const href =
          item.type === 'artist' ? `/atlikejai/${item.entity_slug || item.entity_id}` :
          item.type === 'album'  ? `/albumai/${item.entity_slug || item.entity_id}`   :
          item.type === 'track'  ? `/dainos/${item.entity_slug || item.entity_id}`    :
          null
        const Wrapper: any = href ? Link : 'div'
        const wrapperProps = href ? { href } : {}
        const rankColor = idx === 0 ? '#f97316' : idx === 1 ? '#dde8f8' : idx === 2 ? '#a4b8d4' : '#5e7290'
        return (
          <li key={idx}>
            <Wrapper {...wrapperProps} className={`bp-topas-item ${href ? 'is-link' : ''}`}>
              <div className="bp-topas-rank" style={{
                fontSize: items.length >= 100 ? '1.5rem' : '2rem',
                color: rankColor,
              }}>
                {item.rank || (idx + 1)}
              </div>
              {item.image_url
                /* eslint-disable-next-line @next/next/no-img-element */
                ? <img src={item.image_url} alt="" className="bp-topas-cover" />
                : <div className="bp-topas-cover" />
              }
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="bp-topas-title">{item.title}</p>
                {item.artist && <p className="bp-topas-artist">{item.artist}</p>}
                {item.comment && <p className="bp-topas-comment">{item.comment}</p>}
              </div>
            </Wrapper>
          </li>
        )
      })}
    </ol>
  )
}

/* ─── Target entity card (recenzijai / vertimui / event'ui) ────────────── */
function TargetEntityCard({ target, postType }: { target: any; postType: BlogPostType }) {
  let entity: { kind: string; href: string; name: string; subname?: string; image?: string | null } | null = null
  if (target.event) {
    const e = target.event
    const date = e.start_date ? new Date(e.start_date).toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' }) : null
    entity = { kind: 'Renginys', href: `/renginiai/${e.slug || e.id}`, name: e.title,
               subname: [date, e.city].filter(Boolean).join(' · '), image: e.cover_image_url || null }
  } else if (target.track) {
    const t = target.track
    const a = Array.isArray(t.artist) ? t.artist[0] : t.artist
    entity = { kind: postType === 'translation' ? 'Verčiama daina' : 'Daina',
               href: `/dainos/${t.slug || t.id}`, name: t.title, subname: a?.name,
               image: t.cover_image_url || a?.cover_image_url || null }
  } else if (target.album) {
    const al = target.album
    const a = Array.isArray(al.artist) ? al.artist[0] : al.artist
    entity = { kind: 'Albumas', href: `/albumai/${al.slug || al.id}`, name: al.title,
               subname: a?.name, image: al.cover_image_url || null }
  } else if (target.artist) {
    const a = target.artist
    entity = { kind: 'Atlikėjas', href: `/atlikejai/${a.slug || a.id}`, name: a.name,
               image: a.cover_image_url || null }
  }
  if (!entity) return null
  return (
    <Link href={entity.href} className="bp-sb-section" style={{ display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none', color: 'inherit', padding: 12 }}>
      {entity.image
        /* eslint-disable-next-line @next/next/no-img-element */
        ? <img src={proxyImg(entity.image)} alt="" style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
        : <div style={{ width: 56, height: 56, borderRadius: 10, background: 'rgba(255,255,255,0.05)', flexShrink: 0 }} />
      }
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: "'Outfit',sans-serif", fontSize: 10, fontWeight: 900, letterSpacing: '.14em',
                    textTransform: 'uppercase', color: '#f97316', margin: 0 }}>{entity.kind}</p>
        <p style={{ fontFamily: "'Outfit',sans-serif", fontSize: 15, fontWeight: 800, color: '#f2f4f8',
                    margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entity.name}</p>
        {entity.subname && (
          <p style={{ fontSize: 12, color: '#8aa8cc', margin: '2px 0 0', whiteSpace: 'nowrap',
                      overflow: 'hidden', textOverflow: 'ellipsis' }}>{entity.subname}</p>
        )}
      </div>
      <span style={{ color: '#5e7290', fontSize: 18, flexShrink: 0 }}>→</span>
    </Link>
  )
}

/* ─── Author footer card ────────────────────────────────────────────────── */
function AuthorFooter({ username, name, avatar, blogTitle }: { username: string; name: string; avatar: string | null; blogTitle: string | null }) {
  return (
    <div className="bp-author-footer">
      <Link href={`/vartotojas/${username}`}>
        <div className="av-lg" style={{ background: `hsl(${(name.charCodeAt(0) || 65) * 17 % 360},35%,30%)` }}>
          {avatar
            /* eslint-disable-next-line @next/next/no-img-element */
            ? <img src={avatar} alt="" />
            : (name[0] || '?').toUpperCase()
          }
        </div>
      </Link>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Link href={`/vartotojas/${username}`} className="bp-author-footer-name">{name}</Link>
        {blogTitle && <p className="bp-author-footer-sub">{blogTitle}</p>}
      </div>
      <Link href={`/blogas/${username}`} className="bp-author-footer-link">Visi įrašai</Link>
    </div>
  )
}
