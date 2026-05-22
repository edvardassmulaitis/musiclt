'use client'
// app/blogas/[username]/[slug]/page-client.tsx
//
// Blog post puslapio dizainas (rev 2 — pagal user feedback):
//   • NĖRA breadcrumb'o (perteklinis)
//   • Type chip rodomas TIK custom post type'ams (review/translation/event/topas);
//     paprastam 'article' tag'as praleidžiamas
//   • User'is rodomas didžiu avatar'u + vardas + sub-info (member nuo / karma)
//   • Peržiūrų skaitliukas pašalintas iš public hero (rodysim user'io dashboard'e)
//   • Layout: title hero'je per visą plotį, žemiau 2-col grid'as —
//     TEKSTAS KAIRĖJE (max 720px), MUZIKOS PLAYER + atlikėjai/albumai DEŠINĖJE
//     sticky (rev 2 swap, anksčiau buvo atvirkščiai)
//   • Tags filter'inami: auto-importuoti tag'ai 'legacy' ir 'dienoraštis'
//     niekur nerodomi (jie pridėti scraper'io, ne user'io)
//   • „Patinka" mygtukas styled per FollowPill pattern'ą iš artist page'o
//     (heart + count, count'as atidaro likers modal'ą)
//   • Komentarų skaitliukas — mygtukas, paspaudus scroll'inasi į komentarų bloką

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import EntityCommentsBlock from '@/components/EntityCommentsBlock'
import LikesModal, { type LikeUser } from '@/components/LikesModal'
import { PostContent } from './post-content'
import { type BlogPostType } from '@/components/blog/post-types'
import { type ExtractedTrack } from '@/lib/blog-content'

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
  /** Embedded music iš body (Spotify/YouTube iframes + legacy widget rows)
   *  — ekstraktinta server-side per extractMusicFromBody. Body lieka tekstas. */
  embeddedMusic: ExtractedTrack[]
  targetInfo: any | null
  hasSidebar: boolean
}

// Auto-importuoti tag'ai (scraper'io pridėti) — niekur nerodomi.
// Tag'us paliekam tik user'io originalius (jei ką ant music.lt jis pats sudėjo;
// dabartiniame scrape'e nematėm tokių case'ų, bet pasiliekam erdvę plėtrai).
const AUTO_TAGS = new Set(['legacy', 'dienoraštis', 'dienorastis'])

function ytId(url?: string | null) {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
  return m ? m[1] : null
}

export default function BlogPostPageClient(props: Props) {
  const { post, postType, typeLabel, authorName, authorUsername, authorAvatar,
          authorKarma, authorJoinedYear, blogTitle, heroImage, attachments,
          embeddedMusic, targetInfo, hasSidebar } = props

  // Build unified player track list — merge DB-resolved attachments + body-
  // extracted embeds. Eilė: DB tracks first (resolved → highest quality),
  // tada body embeds (YT/Spotify) — kurie irgi groja iframe'e.
  const playerTracks: ExtractedTrack[] = [
    ...attachments.tracks.map((t: any): ExtractedTrack => {
      const a = Array.isArray(t.artist) ? t.artist[0] : t.artist
      const ytId = t.youtube_url && t.youtube_url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)?.[1]
      return {
        source: 'youtube' as const,
        key: `db:track:${t.id}`,
        title: t.title,
        artist_name: a?.name,
        cover_url: t.cover_image_url || (ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : undefined),
        embed_url: ytId ? `https://www.youtube-nocookie.com/embed/${ytId}?rel=0` : '',
        source_url: t.youtube_url || undefined,
      }
    }).filter((t: ExtractedTrack) => !!t.embed_url),
    ...embeddedMusic.filter(m => !!m.embed_url),
  ]

  const showChip = postType !== 'article'   // tik custom type'ams
  const visibleTags = (post.tags || []).filter(t => !AUTO_TAGS.has((t || '').toLowerCase()))

  const formatDate = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' }) : ''

  const scrollToComments = () => {
    document.getElementById('bp-comments')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <>
      <style jsx global>{`
        .bp-root { background:#080d14; color:#dde8f8; font-family:'DM Sans',sans-serif; -webkit-font-smoothing:antialiased; min-height:100vh; }

        /* ── HERO ── */
        .bp-hero { position:relative; height:46vh; min-height:300px; max-height:440px; overflow:hidden; background:#080d14;
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
                           width:100%; max-width:1400px; margin:0 auto; padding:0 32px 38px; }
        .bp-hero-inner { max-width:740px; animation:bp-in .7s .05s both; }
        @keyframes bp-in { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }

        .bp-chip { display:inline-block; font-family:'Outfit',sans-serif; font-size:10px; font-weight:900; letter-spacing:.08em;
                   text-transform:uppercase; color:#fff; padding:4px 12px; border-radius:20px;
                   background:rgba(249,115,22,0.2); border:1px solid rgba(249,115,22,0.3); }
        .bp-rating { display:inline-flex; align-items:center; gap:4px; background:rgba(255,255,255,0.12); border-radius:6px;
                     padding:3px 8px; font-family:'Outfit',sans-serif; font-size:11px; font-weight:900; color:#fff;
                     margin-left:8px; }
        .bp-h1 { font-family:'Outfit',sans-serif; font-size:clamp(1.6rem,3vw,2.8rem); font-weight:900; line-height:1.06;
                 letter-spacing:-.03em; color:#fff; margin:14px 0 18px; text-shadow:0 2px 14px rgba(0,0,0,0.4); }

        /* User card hero'je — avatar + name + sub */
        .bp-user { display:inline-flex; align-items:center; gap:12px; background:rgba(255,255,255,0.07);
                   backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,0.12); border-radius:100px;
                   padding:6px 16px 6px 6px; text-decoration:none; color:inherit; transition:background .15s; }
        .bp-user:hover { background:rgba(255,255,255,0.12); }
        .bp-user-av { width:38px; height:38px; border-radius:50%; overflow:hidden; flex-shrink:0;
                      display:flex; align-items:center; justify-content:center; font-family:'Outfit',sans-serif;
                      font-size:15px; font-weight:900; color:#fff; }
        .bp-user-av img { width:100%; height:100%; object-fit:cover; }
        .bp-user-text { display:flex; flex-direction:column; gap:1px; }
        .bp-user-name { font-family:'Outfit',sans-serif; font-size:14px; font-weight:800; color:#fff; letter-spacing:-.01em; }
        .bp-user-sub { font-size:11px; color:rgba(255,255,255,0.65); font-weight:500; }
        .bp-user-meta-dot { display:inline-block; width:3px; height:3px; border-radius:50%; background:rgba(255,255,255,0.3); margin:0 6px; vertical-align:middle; }

        .bp-meta-row { margin-top:14px; display:flex; align-items:center; gap:10px 16px; flex-wrap:wrap; font-size:13px;
                       color:rgba(255,255,255,0.65); font-weight:500; }

        /* ── PAGE LAYOUT ── */
        .bp-page { max-width:1400px; margin:0 auto; padding:0 32px; }
        .bp-grid { display:grid; gap:48px; align-items:start; padding:36px 0 90px; }
        .bp-grid.has-sb { grid-template-columns:minmax(0,1fr) 380px; }
        .bp-grid.no-sb  { grid-template-columns:1fr; max-width:820px; margin:0 auto; }

        /* ── SIDEBAR — sticky right ── */
        .bp-sidebar { position:sticky; top:80px; display:flex; flex-direction:column; gap:14px; min-width:0; }
        .bp-sb-card { background:rgba(255,255,255,0.025); border:1px solid rgba(255,255,255,0.05); border-radius:14px; overflow:hidden; }
        .bp-sb-card-padded { padding:14px; }
        .bp-sb-heading { font-family:'Outfit',sans-serif; font-size:10px; font-weight:900; letter-spacing:.14em;
                         text-transform:uppercase; color:#5e7290; margin:0 0 10px; }

        /* Music player — sidebar variant of news .mu-* */
        .bp-mu-hdr { display:flex; align-items:center; gap:9px; padding:10px 14px;
                     border-bottom:1px solid rgba(255,255,255,0.06); background:rgba(255,255,255,0.02); }
        .bp-mu-hdr-icon { width:26px; height:26px; border-radius:7px;
                          background:linear-gradient(135deg,#f97316,#e05500);
                          display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        .bp-mu-hdr-eq { display:flex; align-items:flex-end; gap:2px; height:12px; }
        .bp-mu-hdr-eq span { width:2.5px; border-radius:2px; background:#fff;
                              transform-origin:bottom; animation:bp-eq .7s ease-in-out infinite alternate; }
        @keyframes bp-eq { from { transform:scaleY(.3) } to { transform:scaleY(1) } }
        .bp-mu-hdr-label { font-family:'Outfit',sans-serif; font-size:10px; font-weight:800; text-transform:uppercase;
                           letter-spacing:.1em; color:#8aa8cc; flex:1; }
        .bp-mu-video { background:#000; aspect-ratio:16/9; position:relative; }
        .bp-mu-video.is-spotify { aspect-ratio:auto; height:120px; }
        .bp-mu-video.is-spotify .bp-mu-iframe { height:120px; }
        .bp-mu-src-badge { position:absolute; top:8px; right:8px; padding:3px 8px; border-radius:6px;
                           font-family:'Outfit',sans-serif; font-size:9px; font-weight:900; letter-spacing:.1em;
                           text-transform:uppercase; color:#fff; backdrop-filter:blur(8px); }
        .bp-mu-src-youtube { background:rgba(255,0,0,0.85); }
        .bp-mu-src-spotify { background:rgba(30,215,96,0.9); color:#000; }
        .bp-mu-src-music_lt { background:rgba(249,115,22,0.85); }
        .bp-mu-thumb { width:100%; height:100%; cursor:pointer; position:relative; }
        .bp-mu-thumb img { width:100%; height:100%; object-fit:cover; }
        .bp-mu-thumb-noplay { cursor:default; }
        .bp-mu-no-thumb { width:100%; height:100%; display:flex; align-items:center; justify-content:center;
                          font-size:48px; color:#5e7290; background:#080d14; }
        .bp-mu-play-overlay { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
                              background:linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.4));
                              transition:background .2s; pointer-events:none; }
        .bp-mu-thumb:hover .bp-mu-play-overlay { background:rgba(0,0,0,0.3); }
        .bp-mu-play-btn { width:54px; height:54px; border-radius:50%; background:#f97316;
                          display:flex; align-items:center; justify-content:center;
                          box-shadow:0 4px 20px rgba(249,115,22,0.4); transform:scale(0.95); transition:transform .2s; }
        .bp-mu-thumb:hover .bp-mu-play-btn { transform:scale(1); }
        .bp-mu-iframe { width:100%; height:100%; border:none; }
        .bp-mu-now { display:flex; align-items:center; gap:10px; padding:10px 14px;
                     background:rgba(249,115,22,.06); border-top:1px solid rgba(249,115,22,.1); }
        .bp-mu-now-info { flex:1; min-width:0; }
        .bp-mu-now-title { font-family:'Outfit',sans-serif; font-size:12px; font-weight:800; color:#f2f4f8; margin:0;
                           white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .bp-mu-now-artist { font-size:10px; color:#8aa8cc; margin:2px 0 0; }
        .bp-mu-yt { background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:50%;
                    width:28px; height:28px; display:flex; align-items:center; justify-content:center;
                    color:#dde8f8; text-decoration:none; flex-shrink:0; transition:background .15s; }
        .bp-mu-yt:hover { background:rgba(255,255,255,0.1); }
        .bp-mu-list { max-height:320px; overflow-y:auto; border-top:1px solid rgba(255,255,255,0.05); }
        .bp-mu-track { width:100%; display:flex; align-items:center; gap:9px; padding:9px 14px;
                       background:transparent; border:none; border-bottom:1px solid rgba(255,255,255,0.04);
                       cursor:pointer; text-align:left; transition:background .15s; font-family:'DM Sans',sans-serif; color:inherit; }
        .bp-mu-track:last-child { border-bottom:none; }
        .bp-mu-track:hover { background:rgba(255,255,255,0.03); }
        .bp-mu-track-on { background:rgba(249,115,22,.06); }
        .bp-mu-track-num { font-family:'Outfit',sans-serif; font-size:10.5px; font-weight:800; color:#5e7290;
                           min-width:14px; text-align:center; flex-shrink:0; }
        .bp-mu-track-on .bp-mu-track-num { color:#f97316; }
        .bp-mu-track-img { width:32px; height:32px; border-radius:5px; object-fit:cover; flex-shrink:0; }
        .bp-mu-track-img-empty { background:rgba(255,255,255,0.04); display:flex; align-items:center; justify-content:center;
                                  font-size:12px; color:#334058; }
        .bp-mu-track-info { flex:1; min-width:0; }
        .bp-mu-track-title { font-size:12px; font-weight:700; color:#dde8f8; margin:0;
                             white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .bp-mu-track-artist { font-size:10px; color:#8aa8cc; margin:2px 0 0;
                              white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

        /* Generic attachment item (artists/albums lists) */
        .bp-att-item { display:flex; align-items:center; gap:10px; padding:7px 6px; border-radius:8px;
                       text-decoration:none; color:inherit; transition:background .15s; }
        .bp-att-item:hover { background:rgba(255,255,255,0.04); }
        .bp-att-thumb { width:40px; height:40px; border-radius:8px; object-fit:cover; flex-shrink:0;
                        background:rgba(255,255,255,0.04); }
        .bp-att-thumb-fallback { width:40px; height:40px; border-radius:8px; flex-shrink:0; display:flex;
                                 align-items:center; justify-content:center; font-family:'Outfit',sans-serif;
                                 font-size:14px; font-weight:900; background:rgba(255,255,255,0.05); color:#5e7290; }
        .bp-att-text { flex:1; min-width:0; }
        .bp-att-title { font-size:13px; font-weight:700; color:#dde8f8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .bp-att-sub { font-size:11px; color:#8aa8cc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:1px; }

        /* ── PROSE ── */
        .bp-prose { color:#b0bdd4; font-size:1.06rem; line-height:1.88; max-width:720px; }
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

        .bp-summary { font-size:1.18rem; line-height:1.55; color:#b0bdd4; font-weight:500;
                      margin-bottom:28px; padding-bottom:24px; border-bottom:1px solid rgba(255,255,255,0.06);
                      font-family:'Outfit',sans-serif; max-width:720px; }

        /* ── TAGS + ACTIONS ── */
        .bp-footer-row { margin:38px 0 0; padding-top:24px; border-top:1px solid rgba(255,255,255,0.06);
                         display:flex; flex-wrap:wrap; gap:14px; align-items:center; max-width:720px; }
        .bp-tags { display:flex; flex-wrap:wrap; gap:6px; }
        .bp-tag { padding:5px 11px; border-radius:14px; background:rgba(255,255,255,0.04);
                  border:1px solid rgba(255,255,255,0.06); color:#8aa8cc; font-size:11.5px; font-weight:700;
                  text-decoration:none; transition:background .15s; font-family:'Outfit',sans-serif; }
        .bp-tag:hover { background:rgba(255,255,255,0.07); color:#dde8f8; }

        /* FollowPill-style (perimta iš artist page'o) */
        .bp-pill { display:inline-flex; align-items:stretch; overflow:hidden; border-radius:999px;
                   border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.04);
                   transition:border-color .15s, background-color .15s; }
        .bp-pill.is-on { border-color:#f97316; background:#f97316; box-shadow:0 6px 18px rgba(249,115,22,0.35); }
        .bp-pill-side { display:inline-flex; align-items:center; gap:6px; padding:8px 14px; cursor:pointer;
                       background:none; border:none; color:#dde8f8; font-family:'Outfit',sans-serif;
                       font-size:13px; font-weight:800; transition:background .15s; }
        .bp-pill.is-on .bp-pill-side { color:#fff; }
        .bp-pill-side:hover { background:rgba(255,255,255,0.06); }
        .bp-pill.is-on .bp-pill-side:hover { background:rgba(0,0,0,0.08); }
        .bp-pill-side[disabled] { cursor:not-allowed; opacity:0.7; }
        .bp-pill-count { display:inline-flex; align-items:center; padding:8px 14px;
                         border-left:1px solid rgba(255,255,255,0.1); font-family:'Outfit',sans-serif;
                         font-size:13px; font-weight:800; font-variant-numeric:tabular-nums; }
        .bp-pill.is-on .bp-pill-count { border-color:rgba(255,255,255,0.3); color:#fff; }
        .bp-pill-count.is-link { cursor:pointer; background:none; border:none; border-left:1px solid rgba(255,255,255,0.1);
                                 color:#dde8f8; transition:background .15s; }
        .bp-pill.is-on .bp-pill-count.is-link { color:#fff; border-color:rgba(255,255,255,0.3); }
        .bp-pill-count.is-link:hover { background:rgba(255,255,255,0.06); }
        .bp-pill.is-on .bp-pill-count.is-link:hover { background:rgba(0,0,0,0.08); }

        /* Topas list */
        .bp-topas { list-style:none; padding:0; margin:36px 0; display:flex; flex-direction:column; gap:10px; max-width:720px; }
        .bp-topas-item { display:flex; align-items:center; gap:18px; padding:14px 16px; border-radius:14px;
                         background:rgba(255,255,255,0.025); border:1px solid rgba(255,255,255,0.05);
                         text-decoration:none; color:inherit; transition:transform .15s; }
        .bp-topas-item.is-link:hover { transform:translateY(-1px); background:rgba(255,255,255,0.035); }
        .bp-topas-rank { font-family:'Outfit',sans-serif; font-weight:900; letter-spacing:-.03em; line-height:1;
                         min-width:48px; text-align:center; }
        .bp-topas-cover { width:62px; height:62px; border-radius:10px; object-fit:cover; flex-shrink:0;
                          background:rgba(255,255,255,0.04); }
        .bp-topas-title { font-family:'Outfit',sans-serif; font-size:1.04rem; font-weight:800; color:#f2f4f8; line-height:1.2;
                          letter-spacing:-.01em; margin:0; }
        .bp-topas-artist { font-size:.85rem; color:#8aa8cc; margin:3px 0 0; }
        .bp-topas-comment { font-size:.88rem; color:#a4b8d4; font-style:italic; margin:8px 0 0; line-height:1.5; }

        /* Author footer */
        .bp-author-footer { margin-top:48px; padding:18px; background:rgba(255,255,255,0.03);
                            border:1px solid rgba(255,255,255,0.06); border-radius:14px; display:flex;
                            align-items:center; gap:14px; max-width:720px; }
        .bp-author-footer .av-lg { width:54px; height:54px; border-radius:50%; flex-shrink:0; overflow:hidden;
                                   display:flex; align-items:center; justify-content:center; font-family:'Outfit',sans-serif;
                                   font-size:18px; font-weight:900; color:#fff; }
        .bp-author-footer .av-lg img { width:100%; height:100%; object-fit:cover; }
        .bp-author-footer-name { font-family:'Outfit',sans-serif; font-size:1.05rem; font-weight:800; color:#f2f4f8;
                                 text-decoration:none; }
        .bp-author-footer-name:hover { color:#f97316; }
        .bp-author-footer-sub { font-size:11.5px; color:#5e7290; margin-top:2px; }
        .bp-author-footer-link { padding:8px 16px; border-radius:100px; background:rgba(255,255,255,0.05);
                                 border:1px solid rgba(255,255,255,0.08); color:#dde8f8; font-family:'Outfit',sans-serif;
                                 font-size:12px; font-weight:700; text-decoration:none; transition:background .15s; }
        .bp-author-footer-link:hover { background:rgba(255,255,255,0.08); }

        /* Comments section */
        .bp-comments { margin-top:56px; padding-top:32px; border-top:1px solid rgba(255,255,255,0.06); max-width:720px; }

        /* ── RESPONSIVE ── */
        @media (max-width: 1100px) {
          .bp-grid.has-sb { grid-template-columns:minmax(0,1fr) 340px; }
        }
        @media (max-width: 960px) {
          .bp-grid.has-sb { grid-template-columns:1fr; }
          .bp-sidebar { position:static; top:auto; }
          .bp-hero { height:auto; min-height:260px; }
          .bp-hero-img { width:100%; height:220px; position:relative; -webkit-mask-image:none; mask-image:none; }
          .bp-hero-overlay { display:none; }
          .bp-hero-content { padding:18px 18px 22px; max-width:100%; }
          .bp-hero-inner { max-width:100%; }
          .bp-page { padding:0 18px; }
          .bp-grid { padding:24px 0 60px; gap:30px; }
          .bp-prose, .bp-topas, .bp-footer-row, .bp-author-footer, .bp-comments { max-width:none; }
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
            <div className="bp-hero-inner">
              {/* Type chip — TIK custom type'ams (review/translation/event/topas/news/article-other) */}
              {showChip && typeLabel && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="bp-chip">{typeLabel}</span>
                  {postType === 'review' && post.rating !== null && post.rating !== undefined && (
                    <span className="bp-rating">{post.rating}/10</span>
                  )}
                </div>
              )}
              <h1 className="bp-h1">{post.title}</h1>

              {/* User card */}
              <Link href={`/vartotojas/${authorUsername}`} className="bp-user">
                <div className="bp-user-av" style={{ background: `hsl(${(authorName.charCodeAt(0) || 65) * 17 % 360},35%,30%)` }}>
                  {authorAvatar
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={authorAvatar} alt="" />
                    : (authorName[0] || '?').toUpperCase()
                  }
                </div>
                <div className="bp-user-text">
                  <span className="bp-user-name">{authorName}</span>
                  <span className="bp-user-sub">
                    {authorJoinedYear ? <>Music.lt narys nuo {authorJoinedYear}</> : <>Music.lt narys</>}
                    {authorKarma && authorKarma > 0 && (
                      <>
                        <span className="bp-user-meta-dot" />
                        ★ {authorKarma.toLocaleString('lt-LT')}
                      </>
                    )}
                  </span>
                </div>
              </Link>

              {/* Date + reading time row */}
              <div className="bp-meta-row">
                {post.published_at && <span>{formatDate(post.published_at)}</span>}
                {post.reading_time_min > 0 && (
                  <>
                    <span style={{ color: 'rgba(255,255,255,0.25)' }}>·</span>
                    <span>{post.reading_time_min} min. skaitymo</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ══════════ MAIN + SIDEBAR ══════════ */}
        <div className="bp-page">
          <div className={`bp-grid ${hasSidebar ? 'has-sb' : 'no-sb'}`}>

            {/* MAIN (left) */}
            <main style={{ minWidth: 0 }}>
              {post.summary && <p className="bp-summary">{post.summary}</p>}

              {post.content && (
                <div className="bp-prose">
                  <PostContent html={post.content} />
                </div>
              )}

              {postType === 'topas' && post.list_items.length > 0 && (
                <TopasList items={post.list_items} />
              )}

              {/* Footer row: tags + Patinka + comments */}
              <div className="bp-footer-row">
                {visibleTags.length > 0 && (
                  <div className="bp-tags">
                    {visibleTags.map((tag: string) => (
                      <Link key={tag} href={`/blogas?tag=${encodeURIComponent(tag)}`} className="bp-tag">
                        #{tag}
                      </Link>
                    ))}
                  </div>
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <BlogLikePill postId={post.id} initialCount={post.like_count} />
                  <button
                    type="button"
                    onClick={scrollToComments}
                    className="bp-pill"
                    style={{ cursor: 'pointer', background: 'none', padding: 0, font: 'inherit' }}
                    title="Pereiti į komentarus"
                  >
                    <span className="bp-pill-side" style={{ pointerEvents: 'none' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                      Komentarai
                    </span>
                    <span className="bp-pill-count" style={{ pointerEvents: 'none' }}>
                      {post.comment_count.toLocaleString('lt-LT')}
                    </span>
                  </button>
                </div>
              </div>

              <AuthorFooter
                username={authorUsername}
                name={authorName}
                avatar={authorAvatar}
                blogTitle={blogTitle}
              />

              <div id="bp-comments" className="bp-comments">
                <EntityCommentsBlock
                  entityType="blog_post"
                  entityId={post.id}
                  title={post.comment_count > 0 ? `${post.comment_count.toLocaleString()} komentarai` : 'Komentarai'}
                  skipLegacy
                />
              </div>
            </main>

            {/* SIDEBAR (right, sticky) */}
            {hasSidebar && (
              <aside className="bp-sidebar">
                {/* Unified player — DB tracks + body-extracted YT/Spotify embeds */}
                {playerTracks.length > 0 && <UnifiedPlayer tracks={playerTracks} />}
                {/* Target entity (recenzija/vertimas/event) */}
                {targetInfo && (targetInfo.artist || targetInfo.album || targetInfo.track || targetInfo.event) && (
                  <TargetEntityCard target={targetInfo} postType={postType} />
                )}
                {/* Albums (atskira kortelė — ne player listed) */}
                {attachments.albums.length > 0 && (
                  <div className="bp-sb-card bp-sb-card-padded">
                    <p className="bp-sb-heading">Albumai · {attachments.albums.length}</p>
                    {attachments.albums.map((al: any) => {
                      const a = Array.isArray(al.artist) ? al.artist[0] : al.artist
                      return (
                        <Link key={al.id} href={`/albumai/${al.slug || al.id}`} className="bp-att-item">
                          {al.cover_image_url
                            /* eslint-disable-next-line @next/next/no-img-element */
                            ? <img src={proxyImg(al.cover_image_url)} alt="" className="bp-att-thumb" />
                            : <div className="bp-att-thumb-fallback">{(al.title || '?')[0]?.toUpperCase()}</div>
                          }
                          <div className="bp-att-text">
                            <div className="bp-att-title">{al.title}</div>
                            <div className="bp-att-sub">{a?.name}{al.release_year ? ` · ${al.release_year}` : ''}</div>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                )}
                {/* Artists */}
                {attachments.artists.length > 0 && (
                  <div className="bp-sb-card bp-sb-card-padded">
                    <p className="bp-sb-heading">Atlikėjai · {attachments.artists.length}</p>
                    {attachments.artists.map((a: any) => (
                      <Link key={a.id} href={`/atlikejai/${a.slug || a.id}`} className="bp-att-item">
                        {a.cover_image_url
                          /* eslint-disable-next-line @next/next/no-img-element */
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
          </div>
        </div>
      </div>
    </>
  )
}

/* ─── UnifiedPlayer ─ embedded YT/Spotify iframes + track list ───────────── */
//
// Vienas player'is visam dėmesys'iui — paima ExtractedTrack[] (gali būti YT,
// Spotify ir music_lt embed mix). Iframe rodomas viršuje, žemiau — track lista.
// Klauso iframe atribut'us 16:9 (YT) arba flexible aspect (Spotify embed yra
// 80px tall, ne video). UX inspiruotas artist page'o hero player + tracks
// section: pirmoji daina iškart "nukreipta" (atrodo kaip parent klaviša),
// thumbnail su orange play btn'u, click → iframe pakeičia src ir grojama.
function UnifiedPlayer({ tracks }: { tracks: ExtractedTrack[] }) {
  const [active, setActive] = useState(0)
  const [playing, setPlaying] = useState(false)
  const cur = tracks[active]
  const isSpotify = cur?.source === 'spotify'
  const thumb = cur?.cover_url || null

  return (
    <div className="bp-sb-card">
      <div className="bp-mu-hdr">
        <div className="bp-mu-hdr-icon">
          <div className="bp-mu-hdr-eq">
            {[6,10,4,8].map((h,i) => (
              <span key={i} style={{ height: h, animationDelay: `${i*0.13}s` }} />
            ))}
          </div>
        </div>
        <span className="bp-mu-hdr-label">Susijusi muzika · {tracks.length}</span>
      </div>

      {/* Video / iframe — Spotify embed yra 80px tall, YT yra 16:9 */}
      <div className={`bp-mu-video ${isSpotify ? 'is-spotify' : ''}`}>
        {playing && cur?.embed_url ? (
          <iframe
            src={cur.embed_url + (cur.source === 'youtube' ? '&autoplay=1' : '')}
            allow="autoplay; encrypted-media; clipboard-write"
            allowFullScreen
            className="bp-mu-iframe"
          />
        ) : (
          <div className={`bp-mu-thumb ${!cur?.embed_url ? 'bp-mu-thumb-noplay' : ''}`}
               onClick={() => cur?.embed_url && setPlaying(true)}>
            {thumb
              /* eslint-disable-next-line @next/next/no-img-element */
              ? <img src={thumb} alt="" />
              : <div className="bp-mu-no-thumb">{cur?.source === 'spotify' ? '♫' : '♪'}</div>
            }
            {cur?.embed_url && (
              <div className="bp-mu-play-overlay">
                <div className="bp-mu-play-btn">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
                </div>
              </div>
            )}
            {/* Source badge */}
            <span className={`bp-mu-src-badge bp-mu-src-${cur?.source}`}>
              {cur?.source === 'youtube' ? 'YouTube' : cur?.source === 'spotify' ? 'Spotify' : 'music.lt'}
            </span>
          </div>
        )}
      </div>

      {cur && (cur.title || cur.artist_name) && (
        <div className="bp-mu-now">
          <div className="bp-mu-now-info">
            <p className="bp-mu-now-title">{cur.title || '(be pavadinimo)'}</p>
            {cur.artist_name && <p className="bp-mu-now-artist">{cur.artist_name}</p>}
          </div>
          {cur.source_url && (
            <a href={cur.source_url} target="_blank" rel="noopener" className="bp-mu-yt"
               title={`Atidaryti ${cur.source === 'youtube' ? 'YouTube' : 'Spotify'}`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          )}
        </div>
      )}

      {tracks.length > 1 && (
        <div className="bp-mu-list">
          {tracks.map((t, i) => (
            <button key={t.key + ':' + i} type="button"
                    onClick={() => { setActive(i); setPlaying(false) }}
                    className={`bp-mu-track ${active === i ? 'bp-mu-track-on' : ''}`}>
              <span className="bp-mu-track-num">{active === i ? '▶' : i + 1}</span>
              {t.cover_url
                /* eslint-disable-next-line @next/next/no-img-element */
                ? <img src={t.cover_url} alt="" className="bp-mu-track-img" />
                : <div className="bp-mu-track-img bp-mu-track-img-empty">
                    {t.source === 'spotify' ? '♫' : '♪'}
                  </div>
              }
              <div className="bp-mu-track-info">
                <p className="bp-mu-track-title">{t.title || (t.source === 'spotify' ? 'Spotify takelis' : t.source === 'youtube' ? 'YouTube vaizdo įrašas' : 'Music.lt įrašas')}</p>
                {t.artist_name
                  ? <p className="bp-mu-track-artist">{t.artist_name}</p>
                  : <p className="bp-mu-track-artist" style={{ opacity: 0.5 }}>{t.source}</p>
                }
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── FollowPill-style like button (per artist page'o pattern'ą) ────────── */
function BlogLikePill({ postId, initialCount }: { postId: string; initialCount: number }) {
  const { data: session } = useSession()
  const [liked, setLiked] = useState(false)
  const [count, setCount] = useState(initialCount || 0)
  const [likers, setLikers] = useState<LikeUser[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const authed = !!session?.user

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

  async function toggle() {
    if (!authed || pending) return
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
    <>
      <div className={`bp-pill ${liked ? 'is-on' : ''}`}>
        <button
          type="button"
          onClick={authed ? toggle : undefined}
          disabled={pending || !authed}
          className="bp-pill-side"
          title={authed ? (liked ? 'Nustoti patikti' : 'Pažymėti, kad patinka') : 'Prisijunk, kad patiktum'}
          aria-pressed={liked}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          {liked ? 'Patiko' : 'Patinka'}
        </button>
        {count > 0 ? (
          <button
            type="button"
            onClick={() => { loadLikers(); setModalOpen(true) }}
            className="bp-pill-count is-link"
            title="Pamatyti kas patiko"
          >
            {count.toLocaleString('lt-LT')}
          </button>
        ) : (
          <span className="bp-pill-count" style={{ opacity: 0.6 }}>0</span>
        )}
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

/* ─── Target entity card ───────────────────────────────────────────────── */
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
    <Link href={entity.href} className="bp-sb-card" style={{
      display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none', color: 'inherit', padding: 14,
    }}>
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

/* ─── Author footer card ───────────────────────────────────────────────── */
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
