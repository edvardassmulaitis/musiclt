'use client'
// app/blogas/[username]/[slug]/page-client.tsx
//
// Blog post puslapis (rev 4):
//   • LIGHT/DARK per CSS theme vars.
//   • Autorius/meta/Patinka/Komentarai + susiję atlikėjai = horizontali juosta
//     po title. Autoriaus NUOTRAUKA (ne raidė), USERNAME (ne vardas), PopBar
//     identiškas atlikėjo/vartotojo puslapio stiliui (tik užpildyti dash'ai).
//   • Susiję = švarūs pill'ai (be „Susiję"/„Atlikėjas" žymų).
//   • PLAYER = atlikėjo puslapio PlayerCard stilius (video viršuje + dainų
//     sąrašas su PopBar). VISADA mūsų DB dainos + YouTube (jokio Spotify).
//   • Patinka — leidžiama net neprisijungus (anoniminis „pliusas"), po to
//     pasiūloma užsiregistruoti ir „paskatinti kūrėją".
//   • Mobile: player nėra auto-aktyvus — juostos „Klausyti" mygtukas atidaro
//     minimalią apatinę sticky juostą.

import { useState, useRef, useMemo, useEffect } from 'react'
import { useSession, signIn } from 'next-auth/react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import EntityCommentsBlock from '@/components/EntityCommentsBlock'
import LikesModal, { type LikeUser } from '@/components/LikesModal'
import { LikePill } from '@/components/LikePill'
import AlbumInfoModal from '@/components/AlbumInfoModal'
import { HomeTrackModal } from '@/components/HomeTrackModal'
import { PostContent } from './post-content'
import { type BlogPostType } from '@/components/blog/post-types'
import { makeArtistTrackLeveler } from '@/lib/track-popbar'
import { type BlogPlayerTrack } from '@/lib/blog-player'

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
    like_count: number
    comment_count: number
    rating: number | null
    tags: string[]
    list_items: any[]
    creation_subtype?: string | null
    topas_meta?: { intro?: string | null; outro?: string | null } | null
  }
  postType: BlogPostType
  typeLabel: string
  username: string
  authorName: string
  authorUsername: string
  authorAvatar: string | null
  authorKarma: number | null
  authorJoinedYear: number | null
  blogTitle: string | null
  heroImage: string | null
  attachments: Attachments
  /** Player grojaraštis — visada DB dainos + YouTube (lib/blog-player.ts). */
  playerTracks: BlogPlayerTrack[]
  targetInfo: any | null
  hasSidebar: boolean
  /** Thread C 3b: susieta foto galerija (reportages.blog_post_id = post.id). */
  gallery: { slug: string; photoCount: number; coverUrl: string | null } | null
}

const AUTO_TAGS = new Set([
  'legacy', 'dienoraštis', 'dienorastis',
  'vertimas', 'kūryba', 'kuryba',
  'eilėraštis', 'eilerastis',
  'novelė', 'novele',
  'miniatiūra', 'miniatiura',
  'apsakymas', 'esė', 'ese', 'proza', 'daina',
])

// Karma → PopBar level (0..5) — atitinka vartotojo profilio rodymą.
function karmaToLevel(k: number | null): number {
  const v = k || 0
  if (v >= 20000) return 5
  if (v >= 5000) return 4
  if (v >= 1500) return 3
  if (v >= 300) return 2
  if (v >= 50) return 1
  return 0
}

function useIsMobile(breakpoint = 960): boolean {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`)
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [breakpoint])
  return isMobile
}

export default function BlogPostPageClient(props: Props) {
  const { post, postType, typeLabel, authorName, authorUsername, authorAvatar,
          authorKarma, blogTitle, heroImage, attachments, playerTracks, targetInfo, gallery } = props
  void props.hasSidebar
  void blogTitle
  void authorName

  const karmaLevel = karmaToLevel(authorKarma)
  const isMobile = useIsMobile()
  const hasPlayer = playerTracks.length > 0

  // Per-list PopBar leveler — identiška logika kaip atlikėjo puslapyje.
  const levelOf = useMemo(() => {
    const lev = makeArtistTrackLeveler(
      playerTracks.map(t => ({
        id: t.key,
        video_views: t.video_views || 0,
        like_count: 0,
        release_year: t.release_year ?? undefined,
        release_month: t.release_month ?? undefined,
        release_day: t.release_day ?? undefined,
        release_date: t.release_date ?? undefined,
        is_single: t.is_single,
      })),
    )
    return (t: BlogPlayerTrack) => lev({ id: t.key })
  }, [playerTracks])

  // Shared player state (desktop sidebar + mobile sticky).
  const [active, setActive] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const openMobilePlayer = () => { setMobileOpen(true); setPlaying(true) }

  const showChip = postType !== 'article'
  const visibleTags = (post.tags || []).filter(t => !AUTO_TAGS.has((t || '').toLowerCase()))

  // Susiję pill'ai (atlikėjai + albumai), be žymų.
  const related: { id: string; href: string; title: string; img: string | null; fallback: string; round: boolean }[] = [
    ...attachments.artists.map((a: any) => ({
      id: `ar:${a.id}`,
      href: `/atlikejai/${a.slug || a.id}`,
      title: a.name as string,
      img: a.cover_image_url || null,
      fallback: (a.name || '?')[0]?.toUpperCase() || '?',
      round: true,
    })),
    ...attachments.albums.map((al: any) => ({
      id: `al:${al.id}`,
      href: `/albumai/${al.slug || al.id}`,
      title: al.title as string,
      img: al.cover_image_url || null,
      fallback: (al.title || '?')[0]?.toUpperCase() || '?',
      round: false,
    })),
  ]

  const showSummary = (() => {
    if (!post.summary || !post.content) return !!post.summary
    const norm = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
    const sum = norm(post.summary)
    const body = norm(post.content)
    if (!sum || !body) return !!post.summary
    return !body.startsWith(sum.slice(0, Math.min(sum.length, 100)))
  })()

  const scrollToComments = () => {
    document.getElementById('bp-comments')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <>
      <style jsx global>{`
        .bp-root { background:var(--bg-body); color:var(--text-secondary); font-family:'DM Sans',sans-serif;
                   -webkit-font-smoothing:antialiased; min-height:100vh; }

        /* ── HERO ── */
        .bp-hero { position:relative; min-height:240px; overflow:hidden;
                   background:linear-gradient(180deg, var(--bg-surface) 0%, var(--bg-body) 100%);
                   display:flex; align-items:flex-end; }
        .bp-hero::after { content:''; position:absolute; inset:0; pointer-events:none;
                          background:radial-gradient(ellipse at 75% 30%, rgba(249,115,22,0.06) 0%, transparent 60%); }
        .bp-hero-photo { position:absolute; top:0; right:0; bottom:0; width:45%; overflow:hidden; z-index:1; }
        .bp-hero-photo img { width:100%; height:100%; object-fit:cover; object-position:center 25%;
                              animation:bp-hero-zoom 18s ease-out forwards;
                              -webkit-mask-image:linear-gradient(to left, black 35%, transparent 100%);
                              mask-image:linear-gradient(to left, black 35%, transparent 100%); }
        .bp-hero-photo-fade { position:absolute; inset:0;
                              background:linear-gradient(to top, rgba(var(--bg-body-rgb),0.45) 0%, transparent 60%); }
        @keyframes bp-hero-zoom { from { transform:scale(1) } to { transform:scale(1.06) } }
        .bp-hero-content { position:relative; z-index:2; width:100%; max-width:1400px; margin:0 auto; padding:36px 32px 28px; }
        .bp-hero-inner { max-width:55%; animation:bp-in .6s ease-out both; }
        @keyframes bp-in { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }

        .bp-chip { display:inline-block; font-family:'Outfit',sans-serif; font-size:10px; font-weight:900; letter-spacing:.08em;
                   text-transform:uppercase; color:var(--accent-orange); padding:4px 12px; border-radius:20px;
                   background:rgba(249,115,22,0.14); border:1px solid rgba(249,115,22,0.3); }
        .bp-rating { display:inline-flex; align-items:center; gap:4px; background:var(--bg-hover); border-radius:6px;
                     padding:3px 8px; font-family:'Outfit',sans-serif; font-size:11px; font-weight:900; color:var(--text-primary); margin-left:8px; }
        .bp-h1 { font-family:'Outfit',sans-serif; font-size:clamp(1.6rem,2.6vw,2.4rem); font-weight:900; line-height:1.08;
                 letter-spacing:-.03em; color:var(--text-primary); margin:10px 0 0; }

        /* ── HORIZONTAL BAR ── */
        .bp-bar-wrap { border-bottom:1px solid var(--border-subtle); background:var(--bg-body); }
        .bp-bar { max-width:1400px; margin:0 auto; padding:13px 32px; display:flex; align-items:center; gap:12px 18px; flex-wrap:wrap; }
        .bp-bar-author { display:inline-flex; align-items:center; gap:11px; text-decoration:none; color:inherit; }
        .bp-bar-av { width:42px; height:42px; border-radius:50%; overflow:hidden; flex-shrink:0; display:flex;
                     align-items:center; justify-content:center; font-family:'Outfit',sans-serif; font-size:15px; font-weight:900; color:#fff; }
        .bp-bar-av img { width:100%; height:100%; object-fit:cover; }
        .bp-bar-author-text { display:flex; flex-direction:column; gap:5px; }
        .bp-bar-name { font-family:'Outfit',sans-serif; font-size:14px; font-weight:800; color:var(--text-primary);
                       letter-spacing:-.01em; line-height:1; transition:color .15s; }
        .bp-bar-author:hover .bp-bar-name { color:var(--accent-orange); }
        .bp-bar-meta { font-size:12.5px; color:var(--text-muted); display:flex; align-items:center; gap:7px; white-space:nowrap; }
        .bp-bar-dot { color:var(--text-faint); }
        .bp-bar-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .bp-bar-related { display:flex; align-items:center; gap:8px; margin-left:auto; max-width:100%; overflow-x:auto;
                          padding-bottom:2px; scrollbar-width:thin; }
        .bp-bar-related::-webkit-scrollbar { height:5px; }
        .bp-bar-related::-webkit-scrollbar-thumb { background:var(--border-strong); border-radius:3px; }
        .bp-bar-pill { display:inline-flex; align-items:center; gap:8px; padding:5px 14px 5px 5px; border-radius:100px;
                       background:var(--card-bg); border:1px solid var(--border-subtle); text-decoration:none; color:inherit;
                       flex-shrink:0; transition:background .15s, border-color .15s; }
        .bp-bar-pill:hover { background:var(--bg-hover); border-color:var(--accent-orange); }
        .bp-bar-pill-thumb { width:30px; height:30px; object-fit:cover; flex-shrink:0; background:var(--card-bg); }
        .bp-bar-pill-thumb.round { border-radius:50%; }
        .bp-bar-pill-thumb.sq { border-radius:7px; }
        .bp-bar-pill-fallback { width:30px; height:30px; flex-shrink:0; display:flex; align-items:center; justify-content:center;
                                font-family:'Outfit',sans-serif; font-size:12px; font-weight:900; background:var(--bg-hover); color:var(--text-muted); }
        .bp-bar-pill-name { font-family:'Outfit',sans-serif; font-size:13px; font-weight:700; color:var(--text-primary);
                            white-space:nowrap; max-width:170px; overflow:hidden; text-overflow:ellipsis; }
        .bp-bar-play { display:inline-flex; align-items:center; gap:7px; padding:8px 14px; border-radius:100px; border:none; cursor:pointer;
                       font-family:'Outfit',sans-serif; font-size:13px; font-weight:800; color:#fff; background:var(--accent-orange);
                       box-shadow:0 6px 18px rgba(249,115,22,0.32); transition:transform .15s, box-shadow .15s; }
        .bp-bar-play:hover { transform:translateY(-1px); box-shadow:0 9px 24px rgba(249,115,22,0.4); }

        /* ── PAGE LAYOUT ── */
        .bp-page { max-width:1400px; margin:0 auto; padding:0 32px; }
        .bp-grid { display:grid; gap:32px; align-items:start; padding:22px 0 80px; }
        .bp-grid.has-sb { grid-template-columns:minmax(0,1fr) 380px; }
        .bp-sidebar { position:sticky; top:80px; display:flex; flex-direction:column; gap:14px; min-width:0; }
        .bp-sb-card { background:var(--card-bg); border:1px solid var(--border-subtle); border-radius:14px; overflow:hidden; }

        /* ── PROSE ── */
        .bp-prose { color:var(--text-secondary); font-size:1.06rem; line-height:1.88; }
        .bp-prose p { margin-bottom:22px; }
        .bp-prose a { color:var(--accent-link); text-decoration:underline; }
        .bp-prose h2 { font-family:'Outfit',sans-serif; font-size:1.5rem; font-weight:900; color:var(--text-primary); margin:40px 0 16px; letter-spacing:-.025em; }
        .bp-prose h3 { font-family:'Outfit',sans-serif; font-size:1.18rem; font-weight:800; color:var(--text-primary); margin:32px 0 12px; }
        .bp-prose blockquote { border-left:3px solid var(--accent-orange); padding:14px 22px; margin:32px 0;
                               background:rgba(249,115,22,.05); border-radius:0 12px 12px 0; }
        .bp-prose blockquote p { font-size:1.08rem; font-weight:700; font-style:italic; color:var(--text-primary); line-height:1.55; margin:0; }
        .bp-prose ul, .bp-prose ol { margin:16px 0 24px 22px; }
        .bp-prose li { margin-bottom:6px; line-height:1.78; color:var(--text-secondary); }
        .bp-prose strong { color:var(--text-primary); font-weight:700; }
        .bp-prose img { max-width:100%; border-radius:10px; }
        .bp-summary { font-size:1.12rem; line-height:1.5; color:var(--text-secondary); font-weight:500; margin:0 0 16px;
                      padding-bottom:14px; border-bottom:1px solid var(--border-subtle); font-family:'Outfit',sans-serif; }

        /* ── TAGS ── */
        .bp-tags { display:flex; flex-wrap:wrap; gap:6px; }
        .bp-tag { padding:5px 11px; border-radius:14px; background:var(--card-bg); border:1px solid var(--border-subtle);
                  color:var(--text-muted); font-size:11.5px; font-weight:700; text-decoration:none; transition:background .15s; font-family:'Outfit',sans-serif; }
        .bp-tag:hover { background:var(--bg-hover); color:var(--text-primary); }

        /* ── LIKE pill (FollowPill-style) ── */
        .bp-pill { display:inline-flex; align-items:stretch; overflow:hidden; border-radius:999px; border:1px solid var(--border-default);
                   background:var(--card-bg); transition:border-color .15s, background-color .15s; }
        .bp-pill.is-on { border-color:var(--accent-orange); background:var(--accent-orange); box-shadow:0 6px 18px rgba(249,115,22,0.35); }
        .bp-pill-side { display:inline-flex; align-items:center; gap:6px; padding:8px 14px; cursor:pointer; background:none; border:none;
                       color:var(--text-secondary); font-family:'Outfit',sans-serif; font-size:13px; font-weight:800; transition:background .15s; }
        .bp-pill.is-on .bp-pill-side { color:#fff; }
        .bp-pill-side:hover { background:var(--bg-hover); }
        .bp-pill.is-on .bp-pill-side:hover { background:rgba(0,0,0,0.08); }
        .bp-pill-side[disabled] { cursor:not-allowed; opacity:0.7; }
        .bp-pill-icon { padding:8px 11px; }
        .bp-pill-count { display:inline-flex; align-items:center; padding:8px 14px; border-left:1px solid var(--border-default);
                         font-family:'Outfit',sans-serif; font-size:13px; font-weight:800; font-variant-numeric:tabular-nums; }
        .bp-pill.is-on .bp-pill-count { border-color:rgba(255,255,255,0.3); color:#fff; }
        .bp-pill-count.is-link { cursor:pointer; background:none; border:none; border-left:1px solid var(--border-default);
                                 color:var(--text-secondary); transition:background .15s; }
        .bp-pill.is-on .bp-pill-count.is-link { color:#fff; border-color:rgba(255,255,255,0.3); }
        .bp-pill-count.is-link:hover { background:var(--bg-hover); }
        .bp-like-nudge { font-size:12px; color:var(--text-muted); margin-top:7px; }
        .bp-like-nudge button { background:none; border:none; padding:0; cursor:pointer; color:var(--accent-orange);
                                font-weight:700; font-family:inherit; text-decoration:underline; }

        /* ── Topas list ── */
        .bp-topas { list-style:none; padding:0; margin:36px 0; display:flex; flex-direction:column; gap:16px; }
        .bp-topas-item { display:grid; grid-template-columns:auto 1fr; grid-template-areas:"title title" "cover comment"; column-gap:20px; row-gap:14px; align-items:start; padding:18px; border-radius:18px;
                         background:var(--card-bg); border:1px solid var(--border-subtle); text-decoration:none; color:inherit;
                         transition:transform .16s, background .16s, border-color .16s, box-shadow .16s; }
        .bp-topas-item.is-link { cursor:pointer; }
        .bp-topas-item.is-link:hover { transform:translateY(-2px); border-color:rgba(249,115,22,0.32); box-shadow:0 12px 30px rgba(0,0,0,0.18); }
        .bp-topas-cover-wrap { grid-area:cover; position:relative; flex-shrink:0; width:150px; height:150px; border-radius:14px; overflow:hidden; box-shadow:0 6px 20px rgba(0,0,0,0.2); }
        .bp-topas-cover { width:150px; height:150px; border-radius:14px; object-fit:cover; display:block; background:var(--card-bg); transition:transform .3s ease; }
        .bp-topas-cover-empty { display:flex; align-items:center; justify-content:center; font-family:'Outfit',sans-serif; font-size:2.6rem; font-weight:900; color:var(--text-faint); background:var(--bg-hover); }
        .bp-topas-play { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; border:0; cursor:pointer; color:#fff;
                         background:linear-gradient(to top, rgba(0,0,0,0.5), rgba(0,0,0,0.1)); opacity:0; transition:opacity .2s ease; }
        .bp-topas-item.is-link:hover .bp-topas-play, .bp-topas-play:focus-visible { opacity:1; }
        .bp-topas-play > svg { width:38px; height:38px; box-sizing:border-box; filter:drop-shadow(0 2px 8px rgba(0,0,0,0.5));
                               background:rgba(249,115,22,0.96); border-radius:50%; padding:10px; transform:scale(0.82); transition:transform .2s cubic-bezier(0.22,1,0.36,1); }
        .bp-topas-item.is-link:hover .bp-topas-play > svg { transform:scale(1); }
        .bp-topas-item.is-link:hover .bp-topas-cover { transform:scale(1.04); }
        .bp-topas-titlerow { grid-area:title; display:flex; align-items:baseline; gap:14px; }
        .bp-topas-rank { font-family:'Outfit',sans-serif; font-weight:900; font-size:1.7rem; letter-spacing:-.03em; line-height:1; flex-shrink:0; }
        .bp-topas-title { font-family:'Outfit',sans-serif; font-size:1.18rem; font-weight:800; color:var(--text-primary); line-height:1.25; letter-spacing:-.01em; margin:0; }
        .bp-topas-title-main { display:block; color:var(--accent-orange); }
        .bp-topas-title-artist { display:block; color:var(--text-secondary); font-weight:600; font-size:.9em; margin-top:2px; }
        .bp-topas-genres { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
        .bp-topas-genre { font-family:'Outfit',sans-serif; font-size:.7rem; font-weight:700; letter-spacing:.02em; text-transform:lowercase;
                          color:var(--text-secondary); background:var(--card-bg); border:1px solid var(--border-subtle); border-radius:100px; padding:2px 9px; }
        .bp-topas-comment { grid-area:comment; min-width:0; font-size:.94rem; color:var(--text-secondary); margin:0; line-height:1.7; }

        .bp-comments { margin-top:48px; padding-top:28px; border-top:1px solid var(--border-subtle); }

        /* ── RESPONSIVE ── */
        @media (max-width: 1100px) { .bp-grid.has-sb { grid-template-columns:minmax(0,1fr) 340px; } }
        @media (max-width: 960px) {
          .bp-grid.has-sb { grid-template-columns:1fr; }
          .bp-grid.has-sb main { order:2; }
          .bp-grid.has-sb .bp-sidebar { order:1; position:static; top:auto; flex-direction:column; gap:14px; }
          .bp-hero { min-height:auto; flex-direction:column; }
          .bp-hero-photo { position:relative; width:100%; height:160px; }
          .bp-hero-photo img { -webkit-mask-image:linear-gradient(to top, transparent 0%, black 50%); mask-image:linear-gradient(to top, transparent 0%, black 50%); }
          .bp-hero-content { padding:14px 18px 18px; max-width:100%; }
          .bp-hero-inner { max-width:100%; }
          .bp-bar { padding:12px 18px; }
          .bp-bar-related { margin-left:0; flex-basis:100%; }
          .bp-page { padding:0 18px; }
          .bp-grid { padding:18px 0 92px; gap:20px; }
        }
        @media (max-width: 540px) {
          .bp-hero-photo { height:130px; }
          .bp-h1 { font-size:1.5rem; }
          .bp-topas { gap:12px; margin:26px 0; }
          .bp-topas-item { padding:13px; column-gap:13px; row-gap:12px; border-radius:15px; grid-template-areas:"cover title" "comment comment"; align-items:center; }
          .bp-topas-cover-wrap { width:92px; height:92px; border-radius:12px; }
          .bp-topas-cover { width:92px; height:92px; border-radius:12px; }
          .bp-topas-comment { font-size:.88rem; line-height:1.62; }
          .bp-topas-play { opacity:1; background:transparent; align-items:flex-end; justify-content:flex-end; padding:5px; }
          .bp-topas-play > svg { width:26px; height:26px; padding:6px; }
          .bp-topas-titlerow { gap:9px; }
          .bp-topas-rank { font-size:1.3rem; }
          .bp-topas-title { font-size:1rem; }
          .bp-topas-genre { font-size:.66rem; padding:2px 8px; }
        }
      `}</style>

      <div className="bp-root">
        {/* ══════════ HERO ══════════ */}
        <section className="bp-hero">
          {heroImage && (
            <div className="bp-hero-photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={proxyImg(heroImage)} alt="" />
              <div className="bp-hero-photo-fade" />
            </div>
          )}
          <div className="bp-hero-content">
            <div className="bp-hero-inner">
              {showChip && typeLabel && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="bp-chip">{typeLabel}</span>
                  {postType === 'creation' && post.creation_subtype && (
                    <span className="bp-chip" style={{ background: 'var(--bg-hover)', borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}>{post.creation_subtype}</span>
                  )}
                  {postType === 'review' && post.rating !== null && post.rating !== undefined && (
                    <span className="bp-rating">{post.rating}/10</span>
                  )}
                </div>
              )}
              <h1 className="bp-h1">{post.title}</h1>
            </div>
          </div>
        </section>

        {/* ══════════ HORIZONTAL BAR ══════════ */}
        <div className="bp-bar-wrap">
          <div className="bp-bar">
            <Link href={`/@${authorUsername}`} className="bp-bar-author">
              <div className="bp-bar-av" style={{ background: `hsl(${(authorUsername.charCodeAt(0) || 65) * 17 % 360},35%,40%)` }}>
                {authorAvatar
                  /* eslint-disable-next-line @next/next/no-img-element */
                  ? <img src={proxyImg(authorAvatar)} alt="" />
                  : (authorUsername[0] || '?').toUpperCase()
                }
              </div>
              <div className="bp-bar-author-text">
                <span className="bp-bar-name">{authorUsername}</span>
                {karmaLevel > 0 && (
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full border pf-hero-chip backdrop-blur-md px-2 py-0.5" title="Karma — istoriniai music.lt taškai">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-[var(--accent-orange)]" aria-hidden>
                      <path d="M12 2l2.39 7.36H22l-6.18 4.48L18.21 22 12 17.27 5.79 22l2.39-8.16L2 9.36h7.61z" />
                    </svg>
                    <PopBar level={karmaLevel} size="sm" />
                  </span>
                )}
              </div>
            </Link>

            <div className="bp-bar-meta">
              {post.published_at && <span>{new Date(post.published_at).toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' })}</span>}
              {post.reading_time_min > 0 && (
                <>
                  <span className="bp-bar-dot">·</span>
                  <span>{post.reading_time_min} min. skaitymo</span>
                </>
              )}
            </div>

            <div className="bp-bar-actions">
              <BlogLikePill postId={post.id} initialCount={post.like_count} />
              <button
                type="button"
                onClick={scrollToComments}
                className="bp-pill"
                style={{ cursor: 'pointer', background: 'none', padding: 0, font: 'inherit' }}
                title="Pereiti į komentarus" aria-label="Komentarai"
              >
                <span className="bp-pill-side bp-pill-icon" style={{ pointerEvents: 'none' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </span>
                <span className="bp-pill-count" style={{ pointerEvents: 'none' }}>{post.comment_count.toLocaleString('lt-LT')}</span>
              </button>

              {isMobile && hasPlayer && (
                <button type="button" className="bp-bar-play" onClick={openMobilePlayer}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                  Klausyti
                </button>
              )}
            </div>

            {related.length > 0 && (
              <div className="bp-bar-related">
                {related.map(r => (
                  <Link key={r.id} href={r.href} className="bp-bar-pill" title={r.title}>
                    {r.img
                      /* eslint-disable-next-line @next/next/no-img-element */
                      ? <img src={proxyImg(r.img)} alt="" className={`bp-bar-pill-thumb ${r.round ? 'round' : 'sq'}`} />
                      : <span className="bp-bar-pill-fallback" style={{ borderRadius: r.round ? '50%' : 7 }}>{r.fallback}</span>
                    }
                    <span className="bp-bar-pill-name">{r.title}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ══════════ MAIN + SIDEBAR ══════════ */}
        <div className="bp-page">
          <div className="bp-grid has-sb">
            <main style={{ minWidth: 0 }}>
              {showSummary && <p className="bp-summary">{post.summary}</p>}

              {postType === 'topas' && post.list_items.length > 0 && (post.topas_meta?.intro || post.topas_meta?.outro) ? (
                <>
                  {(post.topas_meta?.intro || post.content) && (<div className="bp-prose"><EnrichedProse html={post.topas_meta?.intro || post.content || ''} /></div>)}
                  <TopasList items={post.list_items} />
                  {post.topas_meta?.outro && (<div className="bp-prose" style={{ marginTop: 32 }}><EnrichedProse html={post.topas_meta.outro} /></div>)}
                </>
              ) : (
                <>
                  {post.content && (<div className="bp-prose"><EnrichedProse html={post.content} /></div>)}
                  {postType === 'topas' && post.list_items.length > 0 && (<TopasList items={post.list_items} />)}
                </>
              )}

              {postType === 'review' && post.list_items.length > 0 && (<ReviewTrackList items={post.list_items} />)}

              {visibleTags.length > 0 && (
                <div className="bp-tags" style={{ marginTop: 32 }}>
                  {visibleTags.map((tag: string) => (
                    <Link key={tag} href={`/blogas?tag=${encodeURIComponent(tag)}`} className="bp-tag">#{tag}</Link>
                  ))}
                </div>
              )}

              {gallery && (
                <Link href={`/galerija/${gallery.slug}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 32, padding: 12,
                    borderRadius: 14, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)',
                    textDecoration: 'none', color: 'var(--text-primary)' }}>
                  {gallery.coverUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={proxyImg(gallery.coverUrl, 200)} alt="" width={72} height={72}
                      style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 10, flex: 'none' }} />
                  )}
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontWeight: 800 }}>📸 Nuotraukos iš renginio</span>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      Foto galerija{gallery.photoCount ? ` · ${gallery.photoCount} nuotr.` : ''}
                    </span>
                  </span>
                </Link>
              )}

              <div id="bp-comments" className="bp-comments">
                <EntityCommentsBlock
                  entityType="blog_post"
                  entityId={post.id}
                  title={post.comment_count > 0 ? `${post.comment_count.toLocaleString()} komentarai` : 'Komentarai'}
                  skipLegacy
                />
              </div>
            </main>

            <aside className="bp-sidebar">
              {!isMobile && hasPlayer && (
                <PlayerCard tracks={playerTracks} levelOf={levelOf} active={active} setActive={setActive} playing={playing} setPlaying={setPlaying} />
              )}
              {targetInfo && (targetInfo.artist || targetInfo.album || targetInfo.track || targetInfo.event) && (
                <TargetEntityCard target={targetInfo} postType={postType} />
              )}
            </aside>
          </div>
        </div>
      </div>

      {isMobile && mobileOpen && hasPlayer && (
        <MobileStickyPlayer tracks={playerTracks} active={active} setActive={setActive} playing={playing} setPlaying={setPlaying} onClose={() => { setMobileOpen(false); setPlaying(false) }} />
      )}
    </>
  )
}

/* ─── PopBar — atlikėjo/vartotojo puslapio stilius (tik užpildyti dash'ai) ─ */
function PopBar({ level, size = 'sm' }: { level: number; size?: 'sm' | 'md' }) {
  if (level <= 0) return null
  const total = 5
  const h = size === 'md' ? 4 : 3
  const w = size === 'md' ? 22 : 14
  return (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }} aria-hidden>
      {Array.from({ length: total }).map((_, i) => {
        const filled = i < level
        return (
          <span key={i} style={{ height: h, width: w, borderRadius: 2, background: filled ? 'var(--accent-orange)' : 'var(--popbar-empty)', opacity: filled ? 0.55 + 0.45 * (i + 1) / total : 1 }} />
        )
      })}
    </span>
  )
}

/* ─── PlayerCard — atlikėjo puslapio PlayerCard stilius (controlled) ─ */
function PlayerCard({ tracks, levelOf, active, setActive, playing, setPlaying }: {
  tracks: BlogPlayerTrack[]
  levelOf: (t: BlogPlayerTrack) => number
  active: number; setActive: (i: number) => void
  playing: boolean; setPlaying: (p: boolean) => void
}) {
  const cur = tracks[active]
  const vid = cur?.youtube_id || null
  const moreHref = (t: BlogPlayerTrack) =>
    t.track_id && t.artist_slug && t.track_slug ? `/dainos/${t.artist_slug}-${t.track_slug}-${t.track_id}`
    : t.track_id ? `/dainos/${t.track_slug || t.track_id}` : null

  return (
    <div className="w-full max-w-full overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[0_20px_60px_-20px_rgba(0,0,0,0.4)]">
      {/* Video area */}
      <div className="relative aspect-video w-full max-w-full overflow-hidden bg-black">
        {playing && vid ? (
          <iframe
            key={vid + ':' + active}
            src={`https://www.youtube-nocookie.com/embed/${vid}?rel=0&autoplay=1`}
            allow="autoplay; encrypted-media; clipboard-write"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0"
          />
        ) : (
          <button
            type="button"
            onClick={() => vid && setPlaying(true)}
            aria-label="Paleisti"
            className="group absolute inset-0 block cursor-pointer overflow-hidden border-0 p-0"
            style={{ background: 'var(--player-placeholder-bg, linear-gradient(135deg, #1a2436 0%, #0f1825 50%, #0a0f1a 100%))' }}
          >
            {vid && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={`https://i.ytimg.com/vi/${vid}/hqdefault.jpg`} alt="" referrerPolicy="no-referrer"
                   className="absolute inset-0 h-full w-full object-cover" style={{ filter: 'saturate(1.1) contrast(1.05)' }} />
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-black/30" />
            <span className="absolute bottom-3 right-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-orange)] shadow-[0_8px_24px_rgba(249,115,22,0.5)] ring-[3px] ring-white/15 transition-transform duration-200 group-hover:scale-110">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="#fff" aria-hidden className="ml-0.5"><path d="M8 5v14l11-7z" /></svg>
            </span>
          </button>
        )}
      </div>

      {/* Track list */}
      <div className="overflow-y-auto bg-[var(--bg-surface)]" style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border-default) transparent', height: tracks.length > 1 ? '260px' : 'auto' }}>
        <ul className="divide-y divide-[var(--border-subtle)]">
          {tracks.map((t, i) => {
            const isActive = i === active
            const isActivelyPlaying = isActive && playing
            const pop = levelOf(t)
            const href = moreHref(t)
            return (
              <li key={t.key + ':' + i} className="group/row">
                <div
                  onClick={() => { setActive(i); setPlaying(true) }}
                  role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActive(i); setPlaying(true) } }}
                  aria-label={`Leisti ${t.title}`}
                  className={[
                    'flex w-full cursor-pointer items-center gap-2 px-3 py-2 transition-colors',
                    isActive ? 'bg-[rgba(249,115,22,0.08)]' : 'hover:bg-[var(--bg-hover)]',
                  ].join(' ')}
                >
                  <span className={['w-5 shrink-0 text-center font-["Outfit",sans-serif] text-[12px] font-bold tabular-nums', isActive ? 'text-[var(--accent-orange)]' : 'text-[var(--text-faint)]'].join(' ')} aria-hidden>
                    {i + 1}
                  </span>

                  <div className="flex min-w-0 flex-1 flex-col items-start">
                    <div className={['flex w-full items-center gap-1.5 font-["Outfit",sans-serif] text-[13px] font-bold leading-tight', isActive ? 'text-[var(--accent-orange)]' : 'text-[var(--text-primary)]'].join(' ')}>
                      {href ? (
                        <a href={href} onClick={(e) => e.preventDefault()} className="truncate text-inherit no-underline hover:underline">{t.title}</a>
                      ) : (
                        <span className="truncate">{t.title}</span>
                      )}
                    </div>
                    {pop > 0 && (
                      <span className="mt-1 flex gap-[3px]" aria-hidden>
                        {Array.from({ length: pop }).map((_, j) => (
                          <span key={j} className="h-[3px] w-[14px] rounded-[2px] bg-[var(--accent-orange)]" style={{ opacity: 0.55 + 0.45 * (j + 1) / 5 }} />
                        ))}
                      </span>
                    )}
                    {t.artist_name && <span className="mt-0.5 truncate text-[10.5px] text-[var(--text-muted)]">{t.artist_name}</span>}
                  </div>

                  {href && (
                    <a href={href} onClick={(e) => e.stopPropagation()} title="Daugiau: žodžiai, komentarai, video"
                       className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-orange)] hover:bg-[rgba(249,115,22,0.1)] hover:text-[var(--accent-orange)]">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                        <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="14" y2="17" />
                      </svg>
                    </a>
                  )}

                  <button
                    onClick={(e) => { e.stopPropagation(); setActive(i); setPlaying(true) }}
                    aria-label={`Leisti ${t.title}`}
                    className={['flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors',
                      isActive ? 'bg-[var(--accent-orange)] text-white shadow-[0_4px_14px_rgba(249,115,22,0.35)]' : 'bg-[var(--card-bg)] text-[var(--text-primary)] hover:bg-[var(--accent-orange)] hover:text-white'].join(' ')}
                  >
                    {isActivelyPlaying ? (
                      <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden>
                        <rect x="1.5" y="3" width="1.6" height="6" fill="currentColor"><animate attributeName="height" values="6;2;6" dur="1s" repeatCount="indefinite" /></rect>
                        <rect x="5.2" y="2" width="1.6" height="8" fill="currentColor"><animate attributeName="height" values="8;3;8" dur=".8s" repeatCount="indefinite" /></rect>
                        <rect x="8.9" y="4" width="1.6" height="4" fill="currentColor"><animate attributeName="height" values="4;7;4" dur="1.2s" repeatCount="indefinite" /></rect>
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>
                    )}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

/* ─── MobileStickyPlayer — minimali apatinė juosta (controlled) ─ */
function MobileStickyPlayer({ tracks, active, setActive, playing, setPlaying, onClose }: {
  tracks: BlogPlayerTrack[]
  active: number; setActive: (i: number) => void
  playing: boolean; setPlaying: (p: boolean) => void
  onClose: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const cur = tracks[active]
  const vid = cur?.youtube_id || null
  const hasNext = active < tracks.length - 1

  return (
    <div className="fixed inset-x-0 z-[200] border-t border-[var(--border-default)] bg-[var(--bg-surface)] shadow-[0_-6px_24px_rgba(0,0,0,0.22)]"
         style={{ bottom: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}
         role="region" aria-label="Muzikos grotuvas">
      {vid && playing && (
        <div className="overflow-hidden bg-black transition-[height] duration-300" style={{ height: expanded ? 200 : 0 }}>
          <iframe
            key={vid + ':' + active}
            src={`https://www.youtube-nocookie.com/embed/${vid}?rel=0&autoplay=1`}
            allow="autoplay; encrypted-media; clipboard-write"
            allowFullScreen
            className="h-full w-full border-0"
          />
        </div>
      )}
      <div className="flex items-center gap-3 px-3.5 py-2.5">
        {cur?.cover_url
          /* eslint-disable-next-line @next/next/no-img-element */
          ? <img src={cur.cover_url} alt="" className="h-[42px] w-[42px] shrink-0 rounded-[9px] object-cover" />
          : <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[9px] bg-[var(--bg-hover)] text-[20px] text-[var(--text-muted)]">♪</span>
        }
        <div className="min-w-0 flex-1">
          <p className="truncate font-['Outfit',sans-serif] text-[13px] font-extrabold text-[var(--text-primary)]">{cur?.title || 'Takelis'}</p>
          {cur?.artist_name && <p className="truncate text-[11px] text-[var(--text-muted)]">{cur.artist_name}</p>}
        </div>

        <button type="button" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pristabdyti' : 'Leisti'}
          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-[var(--accent-orange)] text-white shadow-[0_4px_14px_rgba(249,115,22,0.4)]">
          {playing ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}><path d="M8 5v14l11-7z" /></svg>
          )}
        </button>

        {tracks.length > 1 && (
          <button type="button" onClick={() => { setActive(hasNext ? active + 1 : 0); setPlaying(true) }} aria-label="Kita daina" title="Kita daina"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5l9 7-9 7V5zm10 0h2v14h-2z" /></svg>
          </button>
        )}

        <button type="button" onClick={() => setExpanded(e => !e)} aria-label={expanded ? 'Sutraukti vaizdą' : 'Rodyti vaizdą'} title="Vaizdas"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>

        <button type="button" onClick={onClose} aria-label="Uždaryti grotuvą" title="Uždaryti"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
        </button>
      </div>
    </div>
  )
}

/* ─── Like pill — leidžia anoniminį „pliusą" + siūlo registruotis ─ */
function BlogLikePill({ postId, initialCount }: { postId: string; initialCount: number }) {
  const { data: session } = useSession()
  const [liked, setLiked] = useState(false)
  const [count, setCount] = useState(initialCount || 0)
  const [likers, setLikers] = useState<LikeUser[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [showNudge, setShowNudge] = useState(false)
  const authed = !!session?.user
  const lsKey = `bp-liked-${postId}`

  useEffect(() => {
    try { if (localStorage.getItem(lsKey)) setLiked(true) } catch {}
  }, [lsKey])

  async function loadLikers() {
    try {
      const r = await fetch(`/api/blog/posts/${postId}/likers`)
      if (r.ok) {
        const d = await r.json()
        setLikers(d.users || [])
        setCount(d.count ?? count)
        const me = (session?.user as any)?.name || (session?.user as any)?.email
        if (me) setLiked((d.users || []).some((u: any) => (u.user_username || '').toLowerCase() === String(me).toLowerCase()))
      }
    } catch {}
  }

  async function toggle() {
    if (pending) return
    // ── Anoniminis like ── leidžiam „pliusą", bet tik kartą per įrenginį.
    if (!authed) {
      if (liked) { setShowNudge(true); return }
      setPending(true)
      setLiked(true)
      setCount(c => c + 1)
      try { localStorage.setItem(lsKey, '1') } catch {}
      try { await fetch(`/api/blog/posts/${postId}/like`, { method: 'POST' }) } catch {}
      setShowNudge(true)
      setPending(false)
      return
    }
    // ── Prisijungęs ──
    setPending(true)
    const wasLiked = liked
    setLiked(!wasLiked)
    setCount(c => wasLiked ? Math.max(0, c - 1) : c + 1)
    try {
      await fetch(`/api/blog/posts/${postId}/like`, { method: 'POST' })
      loadLikers()
    } catch {}
    setPending(false)
  }

  return (
    <div>
      <LikePill
        likes={count}
        selfLiked={liked}
        onToggle={toggle}
        onOpenModal={count > 0 ? () => { loadLikers(); setModalOpen(true) } : undefined}
        pending={pending}
        variant="surface"
      />
      {showNudge && !authed && (
        <div className="bp-like-nudge">
          Ačiū! <button type="button" onClick={() => signIn(undefined, { callbackUrl: typeof window !== 'undefined' ? window.location.href : '/' })}>Užsiregistruok</button> ir paskatink kūrėją.
        </div>
      )}
      <LikesModal open={modalOpen} onClose={() => setModalOpen(false)} title="Patinka" count={count} users={likers} />
    </div>
  )
}

/* ─── Enrichinta proza ── */
type EnrichPreview = { type: string; title: string; subtitle: string | null; cover: string | null; genres: string[]; metric: number; metric_label: string; href: string }
function parseEnrichHref(href: string): { type: string; q: string } | null {
  let m = href.match(/\/albumai\/.*-(\d+)$/); if (m) return { type: 'album', q: `id=${m[1]}` }
  m = href.match(/\/dainos\/.*-(\d+)$/); if (m) return { type: 'track', q: `id=${m[1]}` }
  m = href.match(/\/atlikejai\/([^/?#]+)/); if (m) return { type: 'artist', q: `slug=${encodeURIComponent(m[1])}` }
  return null
}
function EnrichedProse({ html }: { html: string }) {
  const [albumId, setAlbumId] = useState<number | null>(null)
  const [track, setTrack] = useState<{ id: number; title: string } | null>(null)
  const [hover, setHover] = useState<{ left: number; top: number; data: EnrichPreview } | null>(null)
  const cacheRef = useRef<Map<string, EnrichPreview>>(new Map())
  const timerRef = useRef<any>(null)

  const onClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest?.('a.bp-enrich') as HTMLAnchorElement | null
    if (!a) return
    const href = a.getAttribute('href') || ''
    const p = parseEnrichHref(href)
    if (p?.type === 'album') { e.preventDefault(); setAlbumId(parseInt(p.q.slice(3), 10)); return }
    if (p?.type === 'track') { e.preventDefault(); setTrack({ id: parseInt(p.q.slice(3), 10), title: (a.textContent || '').trim() }); return }
    if (p?.type === 'artist') { e.preventDefault(); window.open(href, '_blank', 'noopener,noreferrer') }
  }
  const onOver = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest?.('a.bp-enrich') as HTMLAnchorElement | null
    if (!a || typeof window === 'undefined' || !window.matchMedia?.('(hover: hover)').matches) return
    const p = parseEnrichHref(a.getAttribute('href') || ''); if (!p) return
    const key = `${p.type}:${p.q}`
    clearTimeout(timerRef.current)
    const rect = a.getBoundingClientRect()
    const show = (data: EnrichPreview) => setHover({ left: Math.min(rect.left, window.innerWidth - 280), top: rect.top, data })
    if (cacheRef.current.has(key)) { timerRef.current = setTimeout(() => show(cacheRef.current.get(key)!), 180); return }
    timerRef.current = setTimeout(async () => {
      try { const r = await fetch(`/api/entity-preview?type=${p.type}&${p.q}`); const d = await r.json(); if (d?.title) { cacheRef.current.set(key, d); show(d) } } catch {}
    }, 240)
  }
  const onOut = () => { clearTimeout(timerRef.current); timerRef.current = setTimeout(() => setHover(null), 120) }
  const rendered = useMemo(() => <PostContent html={html} />, [html])

  return (
    <div onClick={onClick} onMouseOver={onOver} onMouseOut={onOut} style={{ position: 'relative' }}>
      {rendered}
      {hover && (
        <div style={{ position: 'fixed', left: hover.left, top: hover.top, transform: 'translateY(-100%) translateY(-10px)', zIndex: 60, width: 264, pointerEvents: 'none' }}>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 14, padding: 12, boxShadow: 'var(--modal-shadow)', display: 'flex', gap: 11 }}>
            {hover.data.cover
              /* eslint-disable-next-line @next/next/no-img-element */
              ? <img src={proxyImg(hover.data.cover)} alt="" style={{ width: 56, height: 56, borderRadius: 9, objectFit: 'cover', flexShrink: 0 }} />
              : <div style={{ width: 56, height: 56, borderRadius: 9, background: 'var(--card-bg)', flexShrink: 0 }} />}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hover.data.title}</div>
              {hover.data.subtitle && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>{hover.data.subtitle}</div>}
              {hover.data.genres.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                  {hover.data.genres.slice(0, 3).map((g, i) => <span key={i} style={{ fontSize: 9.5, color: 'var(--text-secondary)', background: 'var(--card-bg)', borderRadius: 100, padding: '1px 7px' }}>{g}</span>)}
                </div>
              )}
              <div style={{ fontSize: 11, color: 'var(--accent-orange)', marginTop: 6, fontWeight: 600 }}>♥ {hover.data.metric.toLocaleString('lt-LT')} {hover.data.metric_label}</div>
            </div>
          </div>
        </div>
      )}
      <AlbumInfoModal albumId={albumId} onClose={() => setAlbumId(null)} />
      <HomeTrackModal track={track as any} onClose={() => setTrack(null)} />
    </div>
  )
}

/* ─── Topas list ── */
function TopasList({ items }: { items: any[] }) {
  const [albumModalId, setAlbumModalId] = useState<number | null>(null)
  return (
    <>
    <ol className="bp-topas">
      {items.map((item, idx) => {
        const isAlbum = item.type === 'album' && item.entity_id
        const href =
          item.type === 'track'  && item.entity_slug && item.entity_id ? `/dainos/${item.entity_slug}-${item.entity_id}` :
          item.type === 'artist' && item.entity_slug ? `/atlikejai/${item.entity_slug}` : null
        const openAlbum = (e: any) => { e.preventDefault(); e.stopPropagation(); setAlbumModalId(item.entity_id) }
        const Wrapper: any = isAlbum ? 'div' : href ? Link : 'div'
        const wrapperProps = isAlbum ? { onClick: openAlbum, role: 'button', tabIndex: 0 } : href ? { href } : {}
        const clickable = isAlbum || !!href
        const rankColor = idx === 0 ? 'var(--accent-orange)' : idx === 1 ? 'var(--text-primary)' : idx === 2 ? 'var(--text-secondary)' : 'var(--text-muted)'
        const genres: string[] = Array.isArray(item.genres) ? item.genres : []
        const hasDesc = !!item.comment
        const playable = isAlbum || (item.type === 'track' && item.entity_id)
        return (
          <li key={idx}>
            <Wrapper {...wrapperProps} className={`bp-topas-item ${clickable ? 'is-link' : ''}`}>
              <div className="bp-topas-titlerow">
                <span className="bp-topas-rank" style={{ color: rankColor }}>{item.rank || (idx + 1)}</span>
                <div className="min-w-0">
                  <p className="bp-topas-title">
                    {item.title ? (
                      <>
                        <span className="bp-topas-title-main">{item.title}</span>
                        {item.artist && <span className="bp-topas-title-artist">{item.artist}</span>}
                      </>
                    ) : (
                      <span className="bp-topas-title-main">{item.artist}</span>
                    )}
                  </p>
                  {genres.length > 0 && (
                    <div className="bp-topas-genres">
                      {genres.map((g, i) => <span key={i} className="bp-topas-genre">{g}</span>)}
                    </div>
                  )}
                </div>
              </div>
              <div className="bp-topas-cover-wrap">
                {item.image_url
                  /* eslint-disable-next-line @next/next/no-img-element */
                  ? <img src={item.image_url} alt="" className="bp-topas-cover" />
                  : <div className="bp-topas-cover bp-topas-cover-empty">{(item.artist || item.title || '?').charAt(0).toUpperCase()}</div>
                }
                {playable && (
                  <button type="button" className="bp-topas-play" aria-label="Klausyti" onClick={(e) => { if (isAlbum) openAlbum(e) }}>
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  </button>
                )}
              </div>
              {hasDesc && <p className="bp-topas-comment">{item.comment}</p>}
            </Wrapper>
          </li>
        )
      })}
    </ol>
    <AlbumInfoModal albumId={albumModalId} onClose={() => setAlbumModalId(null)} />
    </>
  )
}

/* ─── Review track list ── */
function ReviewTrackList({ items }: { items: any[] }) {
  return (
    <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 13, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-faint, #5e7290)', marginBottom: 4 }}>
        Įvertintos dainos
      </p>
      {items.map((item, idx) => {
        const href = item.type === 'track' && (item.entity_slug || item.entity_id) ? `/dainos/${item.entity_slug || item.entity_id}` : null
        const Wrapper: any = href ? Link : 'div'
        const wp = href ? { href } : {}
        return (
          <Wrapper key={idx} {...wp} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', textDecoration: 'none' }}>
            <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 900, color: 'var(--text-muted)', fontSize: 14, width: 22, textAlign: 'center', flexShrink: 0 }}>{idx + 1}</span>
            {item.image_url
              /* eslint-disable-next-line @next/next/no-img-element */
              ? <img src={proxyImg(item.image_url)} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
              : <span style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--card-bg)', flexShrink: 0 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</p>
              {item.comment && <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>{item.comment}</p>}
            </div>
            {item.rating !== null && item.rating !== undefined && (
              <span style={{ flexShrink: 0, background: 'rgba(249,115,22,0.15)', color: 'var(--accent-orange)', borderRadius: 8, padding: '3px 9px', fontWeight: 800, fontSize: 14, fontFamily: "'Outfit', sans-serif" }}>{item.rating}</span>
            )}
          </Wrapper>
        )
      })}
    </div>
  )
}

/* ─── Target entity card ── */
function TargetEntityCard({ target, postType }: { target: any; postType: BlogPostType }) {
  let entity: { kind: string; href: string; name: string; subname?: string; image?: string | null } | null = null
  if (target.event) {
    const e = target.event
    const date = e.start_date ? new Date(e.start_date).toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' }) : null
    entity = { kind: 'Renginys', href: `/renginiai/${e.slug || e.id}`, name: e.title, subname: [date, e.city].filter(Boolean).join(' · '), image: e.cover_image_url || null }
  } else if (target.track) {
    const t = target.track
    const a = Array.isArray(t.artist) ? t.artist[0] : t.artist
    entity = { kind: postType === 'translation' ? 'Verčiama daina' : 'Daina', href: `/dainos/${t.slug || t.id}`, name: t.title, subname: a?.name, image: t.cover_image_url || a?.cover_image_url || null }
  } else if (target.album) {
    const al = target.album
    const a = Array.isArray(al.artist) ? al.artist[0] : al.artist
    entity = { kind: 'Albumas', href: `/albumai/${al.slug || al.id}`, name: al.title, subname: a?.name, image: al.cover_image_url || null }
  } else if (target.artist) {
    const a = target.artist
    entity = { kind: 'Atlikėjas', href: `/atlikejai/${a.slug || a.id}`, name: a.name, image: a.cover_image_url || null }
  }
  if (!entity) return null
  return (
    <Link href={entity.href} className="bp-sb-card" style={{ display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none', color: 'inherit', padding: 14 }}>
      {entity.image
        /* eslint-disable-next-line @next/next/no-img-element */
        ? <img src={proxyImg(entity.image)} alt="" style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
        : <div style={{ width: 56, height: 56, borderRadius: 10, background: 'var(--card-bg)', flexShrink: 0 }} />
      }
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: "'Outfit',sans-serif", fontSize: 10, fontWeight: 900, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--accent-orange)', margin: 0 }}>{entity.kind}</p>
        <p style={{ fontFamily: "'Outfit',sans-serif", fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entity.name}</p>
        {entity.subname && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entity.subname}</p>
        )}
      </div>
      <span style={{ color: 'var(--text-muted)', fontSize: 18, flexShrink: 0 }}>→</span>
    </Link>
  )
}
