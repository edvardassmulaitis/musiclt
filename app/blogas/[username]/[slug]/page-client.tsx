'use client'
// app/blogas/[username]/[slug]/page-client.tsx
//
// Blog post puslapio dizainas (rev 3 — light-mode + layout refactor):
//   • LIGHT/DARK — visos spalvos per CSS theme kintamuosius (--bg-*, --text-*,
//     --accent-*, --border-*). Anksčiau buvo hard-coded tamsios → light mode'e
//     viskas atrodė tamsu. Dabar gerbiamas [data-theme].
//   • LAYOUT — autorius, trumpa info, Patinka/Komentarai IR susiję atlikėjai/
//     albumai perkelti į kompaktišką HORIZONTALIĄ JUOSTĄ po title (bp-bar).
//     Dešinėje sidebar'e lieka TIK muzikos player'is (+ target entity card).
//   • Žvaigždutė prieš PopBar dash'us pašalinta.
//   • MOBILE — player'is NĖRA automatiškai aktyvus. Juostoje yra stilingas
//     „Klausyti" mygtukas, kuris atidaro minimalų apatinį sticky player'į
//     (danga + pavadinimas + play/pause + kita; iframe groja paslėptas).
//   • Tags filter'inami: auto-importuoti tag'ai 'legacy' ir 'dienoraštis' slepiami.

import { useState, useRef, useMemo, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import EntityCommentsBlock from '@/components/EntityCommentsBlock'
import LikesModal, { type LikeUser } from '@/components/LikesModal'
import AlbumInfoModal from '@/components/AlbumInfoModal'
import { HomeTrackModal } from '@/components/HomeTrackModal'
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
  /** Embedded music iš body (Spotify/YouTube iframes + legacy widget rows)
   *  — ekstraktinta server-side per extractMusicFromBody. Body lieka tekstas. */
  embeddedMusic: ExtractedTrack[]
  /** Topo grojaraštis — sudarytas iš topo įrašų (daina/albumo top/atlikėjo top).
   *  Naudojamas kai topas neturi manual prisegtos muzikos (tada ta overridina). */
  topasPlayerTracks?: ExtractedTrack[]
  targetInfo: any | null
  hasSidebar: boolean
}

// Auto-importuoti tag'ai (scraper'io pridėti) — niekur nerodomi.
const AUTO_TAGS = new Set([
  'legacy', 'dienoraštis', 'dienorastis',
  'vertimas', 'kūryba', 'kuryba',
  'eilėraštis', 'eilerastis',
  'novelė', 'novele',
  'miniatiūra', 'miniatiura',
  'apsakymas', 'esė', 'ese', 'proza', 'daina',
])

// PopBar lygiai pagal user profile page'ą — karma → 5-dot indikatorius.
function karmaToLevel(k: number | null): number {
  const v = k || 0
  if (v >= 20000) return 5
  if (v >= 5000) return 4
  if (v >= 1500) return 3
  if (v >= 300) return 2
  if (v >= 50) return 1
  return 0
}

// Viewport hook — kad mobile/desktop player'iai NEbūtų abu mount'inti vienu
// metu (display:none iframe vis tiek grotų garsą). Render'inam vieną pagal
// matchMedia. SSR'e default desktop (false).
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
          authorKarma, authorJoinedYear, blogTitle, heroImage, attachments,
          embeddedMusic, topasPlayerTracks, targetInfo } = props
  void props.hasSidebar
  void blogTitle
  void authorJoinedYear

  const karmaLevel = karmaToLevel(authorKarma)
  const isMobile = useIsMobile()

  // Build unified player track list — merge DB-resolved attachments + body embeds.
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

  const effectivePlayerTracks: ExtractedTrack[] =
    postType === 'topas'
      ? (playerTracks.length > 0 ? playerTracks : (topasPlayerTracks || []))
      : playerTracks

  const hasPlayer = effectivePlayerTracks.length > 0

  // ── Shared player state (lifted) — kad desktop sidebar player IR mobile
  //    sticky player dalintųsi ta pačia daina/būsena. ──
  const [active, setActive] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const openMobilePlayer = () => { setMobileOpen(true); setPlaying(true) }

  const showChip = postType !== 'article'   // tik custom type'ams
  const visibleTags = (post.tags || []).filter(t => !AUTO_TAGS.has((t || '').toLowerCase()))

  // Susiję — albumai + atlikėjai sujungti į vieną chip'ų sąrašą juostai.
  const related: { id: string; href: string; title: string; sub: string; img: string | null; fallback: string }[] = [
    ...attachments.albums.map((al: any) => {
      const a = Array.isArray(al.artist) ? al.artist[0] : al.artist
      return {
        id: `al:${al.id}`,
        href: `/albumai/${al.slug || al.id}`,
        title: al.title as string,
        sub: [a?.name, al.release_year].filter(Boolean).join(' · '),
        img: al.cover_image_url || null,
        fallback: (al.title || '?')[0]?.toUpperCase() || '?',
      }
    }),
    ...attachments.artists.map((a: any) => ({
      id: `ar:${a.id}`,
      href: `/atlikejai/${a.slug || a.id}`,
      title: a.name as string,
      sub: 'Atlikėjas',
      img: a.cover_image_url || null,
      fallback: (a.name || '?')[0]?.toUpperCase() || '?',
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

        /* ── HERO — title LEFT, photo RIGHT (fade-out) ── */
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
        .bp-hero-content { position:relative; z-index:2; width:100%; max-width:1400px; margin:0 auto;
                           padding:36px 32px 28px; }
        .bp-hero-inner { max-width:55%; animation:bp-in .6s ease-out both; }
        @keyframes bp-in { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }

        .bp-chip { display:inline-block; font-family:'Outfit',sans-serif; font-size:10px; font-weight:900; letter-spacing:.08em;
                   text-transform:uppercase; color:var(--accent-orange); padding:4px 12px; border-radius:20px;
                   background:rgba(249,115,22,0.14); border:1px solid rgba(249,115,22,0.3); }
        .bp-rating { display:inline-flex; align-items:center; gap:4px; background:var(--bg-hover); border-radius:6px;
                     padding:3px 8px; font-family:'Outfit',sans-serif; font-size:11px; font-weight:900; color:var(--text-primary);
                     margin-left:8px; }
        .bp-h1 { font-family:'Outfit',sans-serif; font-size:clamp(1.6rem,2.6vw,2.4rem); font-weight:900; line-height:1.08;
                 letter-spacing:-.03em; color:var(--text-primary); margin:10px 0 0; }

        /* ── HORIZONTAL BAR — autorius + meta + actions + susiję (po title) ── */
        .bp-bar-wrap { border-bottom:1px solid var(--border-subtle); background:var(--bg-body); }
        .bp-bar { max-width:1400px; margin:0 auto; padding:13px 32px;
                  display:flex; align-items:center; gap:12px 18px; flex-wrap:wrap; }
        .bp-bar-author { display:inline-flex; align-items:center; gap:11px; text-decoration:none; color:inherit; }
        .bp-bar-av { width:40px; height:40px; border-radius:50%; overflow:hidden; flex-shrink:0;
                     display:flex; align-items:center; justify-content:center; font-family:'Outfit',sans-serif;
                     font-size:15px; font-weight:900; color:#fff; }
        .bp-bar-av img { width:100%; height:100%; object-fit:cover; }
        .bp-bar-author-text { display:flex; flex-direction:column; gap:4px; }
        .bp-bar-name { font-family:'Outfit',sans-serif; font-size:14px; font-weight:800; color:var(--text-primary);
                       letter-spacing:-.01em; line-height:1; transition:color .15s; }
        .bp-bar-author:hover .bp-bar-name { color:var(--accent-orange); }
        .bp-bar-meta { font-size:12.5px; color:var(--text-muted); display:flex; align-items:center; gap:7px;
                       white-space:nowrap; }
        .bp-bar-dot { color:var(--text-faint); }
        .bp-bar-actions { display:flex; align-items:center; gap:8px; }
        .bp-bar-related { display:flex; align-items:center; gap:8px; margin-left:auto; max-width:100%;
                          overflow-x:auto; padding-bottom:2px; scrollbar-width:thin; }
        .bp-bar-related::-webkit-scrollbar { height:5px; }
        .bp-bar-related::-webkit-scrollbar-thumb { background:var(--border-strong); border-radius:3px; }
        .bp-bar-related-label { font-family:'Outfit',sans-serif; font-size:10px; font-weight:900; letter-spacing:.12em;
                                text-transform:uppercase; color:var(--text-faint); flex-shrink:0; }
        .bp-bar-chip { display:inline-flex; align-items:center; gap:8px; padding:4px 13px 4px 4px; border-radius:100px;
                       background:var(--card-bg); border:1px solid var(--border-subtle); text-decoration:none;
                       color:inherit; flex-shrink:0; transition:background .15s, border-color .15s; }
        .bp-bar-chip:hover { background:var(--bg-hover); border-color:var(--border-default); }
        .bp-bar-chip-thumb { width:30px; height:30px; border-radius:50%; object-fit:cover; flex-shrink:0;
                             background:var(--card-bg); }
        .bp-bar-chip-fallback { width:30px; height:30px; border-radius:50%; flex-shrink:0; display:flex;
                                align-items:center; justify-content:center; font-family:'Outfit',sans-serif;
                                font-size:12px; font-weight:900; background:var(--bg-hover); color:var(--text-muted); }
        .bp-bar-chip-text { display:flex; flex-direction:column; gap:2px; min-width:0; max-width:160px; }
        .bp-bar-chip-title { font-size:12.5px; font-weight:700; color:var(--text-primary); white-space:nowrap;
                             overflow:hidden; text-overflow:ellipsis; line-height:1.1; }
        .bp-bar-chip-sub { font-size:10.5px; color:var(--text-muted); white-space:nowrap; overflow:hidden;
                           text-overflow:ellipsis; line-height:1.1; }

        /* Mobile „Klausyti" play btn — juostoje, atidaro sticky player'į */
        .bp-bar-play { display:inline-flex; align-items:center; gap:8px; padding:9px 16px; border-radius:100px;
                       border:none; cursor:pointer; font-family:'Outfit',sans-serif; font-size:13px; font-weight:800;
                       color:#fff; background:var(--accent-orange); box-shadow:0 6px 18px rgba(249,115,22,0.32);
                       transition:transform .15s, box-shadow .15s; }
        .bp-bar-play:hover { transform:translateY(-1px); box-shadow:0 9px 24px rgba(249,115,22,0.4); }
        .bp-bar-play svg { flex-shrink:0; }

        /* PopBar — karma indikatorius (be žvaigždutės) */
        .bp-popbar { display:inline-flex; gap:3px; align-items:center; }
        .bp-popbar-dot { display:inline-block; height:4px; width:20px; border-radius:2px; background:var(--border-strong);
                         transition:background .2s; transform-origin:left center; }
        .bp-popbar-dot.is-on { background:var(--accent-orange); }

        /* ── PAGE LAYOUT ── */
        .bp-page { max-width:1400px; margin:0 auto; padding:0 32px; }
        .bp-grid { display:grid; gap:32px; align-items:start; padding:22px 0 80px; }
        .bp-grid.has-sb { grid-template-columns:minmax(0,1fr) 380px; }

        /* ── SIDEBAR — sticky right (tik player + target card) ── */
        .bp-sidebar { position:sticky; top:80px; display:flex; flex-direction:column; gap:14px; min-width:0; }
        .bp-sb-card { background:var(--card-bg); border:1px solid var(--border-subtle); border-radius:14px; overflow:hidden; }
        .bp-sb-card-padded { padding:14px; }
        .bp-sb-heading { font-family:'Outfit',sans-serif; font-size:10px; font-weight:900; letter-spacing:.14em;
                         text-transform:uppercase; color:var(--text-muted); margin:0 0 10px; }

        /* Player */
        .bp-mu-video { background:#000; aspect-ratio:16/9; position:relative; }
        .bp-mu-video.is-spotify { aspect-ratio:auto; height:152px; }
        .bp-mu-video.is-spotify .bp-mu-iframe { height:152px; }
        .bp-mu-src-badge { position:absolute; top:8px; right:8px; padding:3px 8px; border-radius:6px;
                           font-family:'Outfit',sans-serif; font-size:9px; font-weight:900; letter-spacing:.1em;
                           text-transform:uppercase; color:#fff; backdrop-filter:blur(8px); z-index:2; }
        .bp-mu-src-youtube { background:rgba(255,0,0,0.85); }
        .bp-mu-src-spotify { background:rgba(30,215,96,0.9); color:#000; }
        .bp-mu-src-music_lt { background:rgba(249,115,22,0.85); }
        .bp-mu-thumb { width:100%; height:100%; cursor:pointer; position:relative; }
        .bp-mu-thumb img { width:100%; height:100%; object-fit:cover; }
        .bp-mu-thumb-noplay { cursor:default; }
        .bp-mu-no-thumb { width:100%; height:100%; display:flex; align-items:center; justify-content:center;
                          font-size:48px; color:var(--text-muted); background:var(--cover-placeholder); }
        .bp-mu-play-overlay { position:absolute; inset:0;
                              background:linear-gradient(to top, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.15) 30%, transparent 60%);
                              pointer-events:none; }
        .bp-mu-play-btn { position:absolute; bottom:12px; right:12px;
                          width:48px; height:48px; border-radius:50%;
                          background:var(--accent-orange);
                          box-shadow:0 8px 24px rgba(249,115,22,0.5);
                          display:flex; align-items:center; justify-content:center;
                          border:3px solid rgba(255,255,255,0.15);
                          transition:transform .2s; }
        .bp-mu-thumb:hover .bp-mu-play-btn { transform:scale(1.1); }
        .bp-mu-iframe { width:100%; height:100%; border:none; }
        .bp-mu-now { display:flex; align-items:center; gap:10px; padding:10px 14px;
                     background:rgba(249,115,22,.06); border-top:1px solid rgba(249,115,22,.1); }
        .bp-mu-now-info { flex:1; min-width:0; }
        .bp-mu-now-title { font-family:'Outfit',sans-serif; font-size:12px; font-weight:800; color:var(--text-primary); margin:0;
                           white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .bp-mu-now-artist { font-size:10px; color:var(--text-muted); margin:2px 0 0; }
        .bp-mu-yt { background:var(--bg-hover); border:1px solid var(--border-default); border-radius:50%;
                    width:28px; height:28px; display:flex; align-items:center; justify-content:center;
                    color:var(--text-secondary); text-decoration:none; flex-shrink:0; transition:background .15s; }
        .bp-mu-yt:hover { background:var(--bg-active); }

        .bp-mu-list { max-height:240px; overflow-y:auto; padding:6px 0; }
        .bp-mu-list::-webkit-scrollbar { width:6px; }
        .bp-mu-list::-webkit-scrollbar-thumb { background:var(--border-strong); border-radius:3px; }
        .bp-mu-track { display:flex; align-items:center; gap:6px; padding:0 8px 0 0; transition:background .15s; }
        .bp-mu-track:hover { background:var(--bg-hover); }
        .bp-mu-track-on { background:rgba(249,115,22,.10); }
        .bp-mu-track-body { flex:1; min-width:0; display:flex; align-items:center; gap:10px;
                            padding:9px 0 9px 14px; background:transparent; border:none; cursor:pointer;
                            text-align:left; font-family:'DM Sans',sans-serif; color:inherit; }
        .bp-mu-track-num { font-family:'Outfit',sans-serif; font-size:12px; font-weight:800; color:var(--text-muted);
                           min-width:20px; text-align:center; flex-shrink:0; font-variant-numeric:tabular-nums; line-height:1; }
        .bp-mu-track-on .bp-mu-track-num { color:var(--accent-orange); }
        .bp-mu-track-actions { display:flex; align-items:center; gap:4px; flex-shrink:0; }
        .bp-mu-track-more { display:flex; align-items:center; justify-content:center; padding:5px 8px; border-radius:999px;
                            background:var(--card-bg); border:1px solid var(--border-default);
                            color:var(--text-muted); text-decoration:none;
                            transition:background .15s, border-color .15s, color .15s; }
        .bp-mu-track-more:hover { background:rgba(249,115,22,0.1); border-color:rgba(249,115,22,0.4); color:var(--accent-orange); }
        .bp-mu-track-play { display:flex; align-items:center; justify-content:center; width:30px; height:30px; border-radius:50%;
                            background:var(--card-bg); border:1px solid var(--border-default);
                            color:var(--text-secondary); cursor:pointer; transition:all .15s; }
        .bp-mu-track-play:hover { background:var(--accent-orange); border-color:transparent; color:#fff; }
        .bp-mu-track-on .bp-mu-track-play { background:var(--accent-orange); border-color:transparent; color:#fff; }
        .bp-mu-track-info { flex:1; min-width:0; display:flex; flex-direction:column; align-items:flex-start; gap:3px; }
        .bp-mu-track-title { font-family:'Outfit',sans-serif; font-size:13px; font-weight:700; color:var(--text-primary);
                             margin:0; line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }
        .bp-mu-track-on .bp-mu-track-title { color:var(--accent-orange); }
        .bp-mu-track-artist { font-size:10.5px; color:var(--text-muted); margin:0; line-height:1.1;
                              white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }
        .bp-mu-popbar { display:flex; gap:3px; align-items:center; }
        .bp-mu-popbar span { display:inline-block; height:3px; width:14px; border-radius:1.5px; background:var(--border-strong); }
        .bp-mu-popbar span.is-on { background:var(--accent-orange); opacity:0.65; }
        .bp-mu-popbar span.is-on:nth-child(-n+3) { opacity:0.9; }
        .bp-mu-popbar span.is-on:first-child { opacity:1; }

        /* ── MOBILE STICKY PLAYER ── */
        .bp-msp { position:fixed; left:0; right:0; bottom:0; z-index:60;
                  background:var(--bg-surface); border-top:1px solid var(--border-default);
                  box-shadow:0 -6px 24px rgba(0,0,0,0.18); }
        .bp-msp-frame { overflow:hidden; height:0; transition:height .26s ease; background:#000; }
        .bp-msp-frame.is-open { height:200px; }
        .bp-msp-frame.is-open.is-spotify { height:152px; }
        .bp-msp-frame iframe { width:100%; height:100%; border:0; display:block; }
        .bp-msp-strip { display:flex; align-items:center; gap:11px; padding:9px 14px;
                        padding-bottom:calc(9px + env(safe-area-inset-bottom, 0px)); }
        .bp-msp-cover { width:42px; height:42px; border-radius:9px; object-fit:cover; flex-shrink:0; background:var(--card-bg); }
        .bp-msp-cover-fallback { width:42px; height:42px; border-radius:9px; flex-shrink:0; display:flex; align-items:center;
                                 justify-content:center; font-size:20px; color:var(--text-muted); background:var(--bg-hover); }
        .bp-msp-info { flex:1; min-width:0; }
        .bp-msp-title { font-family:'Outfit',sans-serif; font-size:13px; font-weight:800; color:var(--text-primary); margin:0;
                        white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .bp-msp-artist { font-size:11px; color:var(--text-muted); margin:2px 0 0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .bp-msp-btn { display:flex; align-items:center; justify-content:center; flex-shrink:0; cursor:pointer;
                      background:none; border:none; color:var(--text-secondary); padding:6px; border-radius:50%;
                      transition:background .15s, color .15s; }
        .bp-msp-btn:hover { background:var(--bg-hover); color:var(--text-primary); }
        .bp-msp-btn.is-primary { width:42px; height:42px; background:var(--accent-orange); color:#fff;
                                 box-shadow:0 4px 14px rgba(249,115,22,0.4); }
        .bp-msp-btn.is-primary:hover { background:var(--accent-orange); filter:brightness(1.06); }

        /* ── PROSE ── */
        .bp-prose { color:var(--text-secondary); font-size:1.06rem; line-height:1.88; }
        .bp-prose p { margin-bottom:22px; }
        .bp-prose a { color:var(--accent-link); text-decoration:underline; }
        .bp-prose h2 { font-family:'Outfit',sans-serif; font-size:1.5rem; font-weight:900; color:var(--text-primary);
                       margin:40px 0 16px; letter-spacing:-.025em; }
        .bp-prose h3 { font-family:'Outfit',sans-serif; font-size:1.18rem; font-weight:800; color:var(--text-primary); margin:32px 0 12px; }
        .bp-prose blockquote { border-left:3px solid var(--accent-orange); padding:14px 22px; margin:32px 0;
                               background:rgba(249,115,22,.05); border-radius:0 12px 12px 0; }
        .bp-prose blockquote p { font-size:1.08rem; font-weight:700; font-style:italic; color:var(--text-primary); line-height:1.55; margin:0; }
        .bp-prose ul, .bp-prose ol { margin:16px 0 24px 22px; }
        .bp-prose li { margin-bottom:6px; line-height:1.78; color:var(--text-secondary); }
        .bp-prose strong { color:var(--text-primary); font-weight:700; }
        .bp-prose img { max-width:100%; border-radius:10px; }

        .bp-summary { font-size:1.12rem; line-height:1.5; color:var(--text-secondary); font-weight:500;
                      margin:0 0 16px; padding-bottom:14px; border-bottom:1px solid var(--border-subtle);
                      font-family:'Outfit',sans-serif; }

        /* ── TAGS ── */
        .bp-tags { display:flex; flex-wrap:wrap; gap:6px; }
        .bp-tag { padding:5px 11px; border-radius:14px; background:var(--card-bg);
                  border:1px solid var(--border-subtle); color:var(--text-muted); font-size:11.5px; font-weight:700;
                  text-decoration:none; transition:background .15s; font-family:'Outfit',sans-serif; }
        .bp-tag:hover { background:var(--bg-hover); color:var(--text-primary); }

        /* FollowPill-style */
        .bp-pill { display:inline-flex; align-items:stretch; overflow:hidden; border-radius:999px;
                   border:1px solid var(--border-default); background:var(--card-bg);
                   transition:border-color .15s, background-color .15s; }
        .bp-pill.is-on { border-color:var(--accent-orange); background:var(--accent-orange); box-shadow:0 6px 18px rgba(249,115,22,0.35); }
        .bp-pill-side { display:inline-flex; align-items:center; gap:6px; padding:8px 14px; cursor:pointer;
                       background:none; border:none; color:var(--text-secondary); font-family:'Outfit',sans-serif;
                       font-size:13px; font-weight:800; transition:background .15s; }
        .bp-pill.is-on .bp-pill-side { color:#fff; }
        .bp-pill-side:hover { background:var(--bg-hover); }
        .bp-pill.is-on .bp-pill-side:hover { background:rgba(0,0,0,0.08); }
        .bp-pill-side[disabled] { cursor:not-allowed; opacity:0.7; }
        .bp-pill-count { display:inline-flex; align-items:center; padding:8px 14px;
                         border-left:1px solid var(--border-default); font-family:'Outfit',sans-serif;
                         font-size:13px; font-weight:800; font-variant-numeric:tabular-nums; }
        .bp-pill.is-on .bp-pill-count { border-color:rgba(255,255,255,0.3); color:#fff; }
        .bp-pill-count.is-link { cursor:pointer; background:none; border:none; border-left:1px solid var(--border-default);
                                 color:var(--text-secondary); transition:background .15s; }
        .bp-pill.is-on .bp-pill-count.is-link { color:#fff; border-color:rgba(255,255,255,0.3); }
        .bp-pill-count.is-link:hover { background:var(--bg-hover); }
        .bp-pill.is-on .bp-pill-count.is-link:hover { background:rgba(0,0,0,0.08); }

        /* Topas list */
        .bp-topas { list-style:none; padding:0; margin:36px 0; display:flex; flex-direction:column; gap:16px; }
        .bp-topas-item { display:flex; flex-direction:column; gap:14px; padding:18px; border-radius:18px;
                         background:var(--card-bg);
                         border:1px solid var(--border-subtle);
                         text-decoration:none; color:inherit; transition:transform .16s, background .16s, border-color .16s, box-shadow .16s; }
        .bp-topas-lower { display:flex; align-items:flex-start; gap:20px; }
        .bp-topas-item.is-link { cursor:pointer; }
        .bp-topas-item.is-link:hover { transform:translateY(-2px); border-color:rgba(249,115,22,0.32);
                         box-shadow:0 12px 30px rgba(0,0,0,0.18); }
        .bp-topas-cover-wrap { position:relative; flex-shrink:0; width:150px; height:150px; border-radius:14px; overflow:hidden;
                               box-shadow:0 6px 20px rgba(0,0,0,0.2); }
        .bp-topas-cover { width:150px; height:150px; border-radius:14px; object-fit:cover; display:block;
                          background:var(--card-bg); transition:transform .3s ease; }
        .bp-topas-cover-empty { display:flex; align-items:center; justify-content:center; font-family:'Outfit',sans-serif;
                          font-size:2.6rem; font-weight:900; color:var(--text-faint);
                          background:var(--bg-hover); }
        .bp-topas-play { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
                         border:0; cursor:pointer; color:#fff;
                         background:linear-gradient(to top, rgba(0,0,0,0.5), rgba(0,0,0,0.1));
                         opacity:0; transition:opacity .2s ease; }
        .bp-topas-item.is-link:hover .bp-topas-play, .bp-topas-play:focus-visible { opacity:1; }
        .bp-topas-play > svg { width:38px; height:38px; box-sizing:border-box; filter:drop-shadow(0 2px 8px rgba(0,0,0,0.5));
                               background:rgba(249,115,22,0.96); border-radius:50%; padding:10px;
                               transform:scale(0.82); transition:transform .2s cubic-bezier(0.22,1,0.36,1); }
        .bp-topas-item.is-link:hover .bp-topas-play > svg { transform:scale(1); }
        .bp-topas-item.is-link:hover .bp-topas-cover { transform:scale(1.04); }
        .bp-topas-titlerow { display:flex; align-items:baseline; gap:14px; }
        .bp-topas-rank { font-family:'Outfit',sans-serif; font-weight:900; font-size:1.7rem; letter-spacing:-.03em;
                          line-height:1; flex-shrink:0; }
        .bp-topas-title { font-family:'Outfit',sans-serif; font-size:1.18rem; font-weight:800; color:var(--text-primary); line-height:1.25;
                          letter-spacing:-.01em; margin:0; }
        .bp-topas-artist-inline { color:var(--accent-orange); }
        .bp-topas-dash { color:var(--text-muted); }
        .bp-topas-genres { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
        .bp-topas-genre { font-family:'Outfit',sans-serif; font-size:.7rem; font-weight:700; letter-spacing:.02em;
                          text-transform:lowercase; color:var(--text-secondary); background:var(--card-bg);
                          border:1px solid var(--border-subtle); border-radius:100px; padding:2px 9px; }
        .bp-topas-comment { flex:1; min-width:0; font-size:.94rem; color:var(--text-secondary); margin:0; line-height:1.7; }

        /* Comments section */
        .bp-comments { margin-top:48px; padding-top:28px; border-top:1px solid var(--border-subtle); }

        /* ── RESPONSIVE ── */
        @media (max-width: 1100px) {
          .bp-grid.has-sb { grid-template-columns:minmax(0,1fr) 340px; }
        }
        @media (max-width: 960px) {
          .bp-grid.has-sb { grid-template-columns:1fr; }
          .bp-grid.has-sb main { order:2; }
          .bp-grid.has-sb .bp-sidebar { order:1; position:static; top:auto; flex-direction:column; gap:14px; }
          .bp-hero { min-height:auto; flex-direction:column; }
          .bp-hero-photo { position:relative; width:100%; height:160px; }
          .bp-hero-photo img { -webkit-mask-image:linear-gradient(to top, transparent 0%, black 50%);
                                mask-image:linear-gradient(to top, transparent 0%, black 50%); }
          .bp-hero-content { padding:14px 18px 18px; max-width:100%; }
          .bp-hero-inner { max-width:100%; }
          .bp-bar { padding:12px 18px; }
          .bp-bar-related { margin-left:0; flex-basis:100%; }
          .bp-page { padding:0 18px; }
          .bp-grid { padding:18px 0 90px; gap:20px; }
        }
        @media (max-width: 540px) {
          .bp-hero-photo { height:130px; }
          .bp-h1 { font-size:1.5rem; }
          .bp-bar-meta { font-size:12px; }
          .bp-topas { gap:12px; margin:26px 0; }
          .bp-topas-item { padding:13px; gap:12px; border-radius:15px; }
          .bp-topas-lower { gap:13px; }
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
                    <span className="bp-chip" style={{
                      background: 'var(--bg-hover)',
                      borderColor: 'var(--border-default)',
                      color: 'var(--text-secondary)',
                    }}>{post.creation_subtype}</span>
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

        {/* ══════════ HORIZONTAL BAR — autorius + meta + actions + susiję ══════════ */}
        <div className="bp-bar-wrap">
          <div className="bp-bar">
            <Link href={`/@${authorUsername}`} className="bp-bar-author">
              <div className="bp-bar-av" style={{ background: `hsl(${(authorName.charCodeAt(0) || 65) * 17 % 360},35%,40%)` }}>
                {authorAvatar
                  /* eslint-disable-next-line @next/next/no-img-element */
                  ? <img src={authorAvatar} alt="" />
                  : (authorName[0] || '?').toUpperCase()
                }
              </div>
              <div className="bp-bar-author-text">
                <span className="bp-bar-name">{authorName}</span>
                <PopBar level={karmaLevel} />
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

            {/* Mobile play btn — atidaro apatinį sticky player'į */}
            {isMobile && hasPlayer && (
              <button type="button" className="bp-bar-play" onClick={openMobilePlayer}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                Klausyti
              </button>
            )}

            {/* Susiję atlikėjai + albumai — chip'ai dešinėje */}
            {related.length > 0 && (
              <div className="bp-bar-related">
                <span className="bp-bar-related-label">Susiję</span>
                {related.map(r => (
                  <Link key={r.id} href={r.href} className="bp-bar-chip" title={r.title}>
                    {r.img
                      /* eslint-disable-next-line @next/next/no-img-element */
                      ? <img src={proxyImg(r.img)} alt="" className="bp-bar-chip-thumb" />
                      : <span className="bp-bar-chip-fallback">{r.fallback}</span>
                    }
                    <span className="bp-bar-chip-text">
                      <span className="bp-bar-chip-title">{r.title}</span>
                      {r.sub && <span className="bp-bar-chip-sub">{r.sub}</span>}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ══════════ MAIN + SIDEBAR ══════════ */}
        <div className="bp-page">
          <div className="bp-grid has-sb">

            {/* MAIN (left) — tekstas + komentarai */}
            <main style={{ minWidth: 0 }}>
              {showSummary && <p className="bp-summary">{post.summary}</p>}

              {postType === 'topas' && post.list_items.length > 0 && (post.topas_meta?.intro || post.topas_meta?.outro) ? (
                <>
                  {post.topas_meta?.intro && (
                    <div className="bp-prose"><EnrichedProse html={post.topas_meta.intro} /></div>
                  )}
                  <TopasList items={post.list_items} />
                  {post.topas_meta?.outro && (
                    <div className="bp-prose" style={{ marginTop: 32 }}><EnrichedProse html={post.topas_meta.outro} /></div>
                  )}
                </>
              ) : (
                <>
                  {post.content && (
                    <div className="bp-prose">
                      <EnrichedProse html={post.content} />
                    </div>
                  )}
                  {postType === 'topas' && post.list_items.length > 0 && (
                    <TopasList items={post.list_items} />
                  )}
                </>
              )}

              {postType === 'review' && post.list_items.length > 0 && (
                <ReviewTrackList items={post.list_items} />
              )}

              {visibleTags.length > 0 && (
                <div className="bp-tags" style={{ marginTop: 32 }}>
                  {visibleTags.map((tag: string) => (
                    <Link key={tag} href={`/blogas?tag=${encodeURIComponent(tag)}`} className="bp-tag">
                      #{tag}
                    </Link>
                  ))}
                </div>
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

            {/* SIDEBAR (right, sticky) — TIK player (desktop) + target card */}
            <aside className="bp-sidebar">
              {!isMobile && hasPlayer && (
                <UnifiedPlayer
                  tracks={effectivePlayerTracks}
                  active={active} setActive={setActive}
                  playing={playing} setPlaying={setPlaying}
                />
              )}
              {targetInfo && (targetInfo.artist || targetInfo.album || targetInfo.track || targetInfo.event) && (
                <TargetEntityCard target={targetInfo} postType={postType} />
              )}
            </aside>
          </div>
        </div>
      </div>

      {/* ══════════ MOBILE STICKY PLAYER ══════════ */}
      {isMobile && mobileOpen && hasPlayer && (
        <MobileStickyPlayer
          tracks={effectivePlayerTracks}
          active={active} setActive={setActive}
          playing={playing} setPlaying={setPlaying}
          onClose={() => { setMobileOpen(false); setPlaying(false) }}
        />
      )}
    </>
  )
}

/* ─── PopBar — karma indikatorius (5 dash; be žvaigždutės) ─ */
function PopBar({ level }: { level: number }) {
  const total = 5
  return (
    <div className="bp-popbar" aria-label={`Karma: ${level}/5`}>
      {Array.from({ length: total }).map((_, i) => {
        const filled = i < level
        return (
          <span
            key={i}
            className={`bp-popbar-dot ${filled ? 'is-on' : ''}`}
            style={{
              animation: filled
                ? `bpPopBarFill 900ms cubic-bezier(0.22, 1, 0.36, 1) ${450 + 220 * i}ms forwards`
                : undefined,
              opacity: filled ? 0 : 1,
            }}
          />
        )
      })}
      <style>{`
        @keyframes bpPopBarFill {
          0%   { opacity: 0; transform: translateX(-10px) scale(0.3); box-shadow: 0 0 0 0 transparent; }
          55%  { opacity: 1; transform: translateX(0) scale(1.25); box-shadow: 0 0 18px 3px var(--accent-orange, #f97316); }
          100% { opacity: 1; transform: translateX(0) scale(1); box-shadow: 0 0 0 0 transparent; }
        }
      `}</style>
    </div>
  )
}

/* ─── PopBar helper (mini, tracklist) ─ */
function trackPopLevel(total: number, i: number) {
  return Math.max(1, Math.ceil((total - i) / Math.max(1, Math.ceil(total / 5))))
}

/* ─── UnifiedPlayer — desktop sidebar (controlled) ─ */
function UnifiedPlayer({ tracks, active, setActive, playing, setPlaying }: {
  tracks: ExtractedTrack[]
  active: number; setActive: (i: number) => void
  playing: boolean; setPlaying: (p: boolean) => void
}) {
  const cur = tracks[active]
  const isSpotify = cur?.source === 'spotify'
  const thumb = cur?.cover_url || null

  return (
    <div className="bp-sb-card">
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
            {cur?.embed_url && <div className="bp-mu-play-overlay" />}
            <span className={`bp-mu-src-badge bp-mu-src-${cur?.source}`}>
              {cur?.source === 'youtube' ? 'YouTube' : cur?.source === 'spotify' ? 'Spotify' : 'music.lt'}
            </span>
            {cur?.embed_url && (
              <span className="bp-mu-play-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff" style={{ marginLeft: 2 }}>
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            )}
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
          {tracks.map((t, i) => {
            const isOn = active === i
            const popLevel = trackPopLevel(tracks.length, i)
            return (
              <div key={t.key + ':' + i} className={`bp-mu-track ${isOn ? 'bp-mu-track-on' : ''}`}>
                <button
                  type="button"
                  onClick={() => { setActive(i); setPlaying(true) }}
                  className="bp-mu-track-body"
                  aria-label={`Leisti ${t.title || 'takelį'}`}
                >
                  <span className="bp-mu-track-num">{i + 1}</span>
                  <div className="bp-mu-track-info">
                    <p className="bp-mu-track-title">
                      {t.title || (t.source === 'spotify' ? 'Spotify takelis' : t.source === 'youtube' ? 'YouTube vaizdo įrašas' : 'Music.lt įrašas')}
                    </p>
                    <div className="bp-mu-popbar" aria-hidden>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <span key={j} className={j < popLevel ? 'is-on' : ''} />
                      ))}
                    </div>
                    {t.artist_name && <p className="bp-mu-track-artist">{t.artist_name}</p>}
                  </div>
                </button>
                <div className="bp-mu-track-actions">
                  {t.db_track && (
                    <Link
                      href={`/dainos/${t.db_track.artist_slug ? `${t.db_track.artist_slug}-${t.db_track.slug}-${t.db_track.id}` : t.db_track.slug || t.db_track.id}`}
                      className="bp-mu-track-more"
                      title="Daugiau: žodžiai, komentarai, video"
                      onClick={e => e.stopPropagation()}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <line x1="3" y1="12" x2="21" y2="12" />
                        <line x1="3" y1="18" x2="14" y2="18" />
                      </svg>
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => { setActive(i); setPlaying(true) }}
                    className="bp-mu-track-play"
                    title={isOn && playing ? 'Groja' : 'Leisti'}
                    aria-label="Leisti takelį"
                  >
                    {isOn && playing ? (
                      <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
                        <rect x="1.5" y="3" width="1.6" height="6" fill="currentColor"><animate attributeName="height" values="6;2;6" dur="1s" repeatCount="indefinite" /></rect>
                        <rect x="5.2" y="2" width="1.6" height="8" fill="currentColor"><animate attributeName="height" values="8;3;8" dur=".8s" repeatCount="indefinite" /></rect>
                        <rect x="8.9" y="4" width="1.6" height="4" fill="currentColor"><animate attributeName="height" values="4;7;4" dur="1.2s" repeatCount="indefinite" /></rect>
                      </svg>
                    ) : (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ─── MobileStickyPlayer — minimal apatinė juosta (controlled) ─
   Iframe groja paslėptas (height:0 kai sutraukta — garsas tęsiasi).
   „Expand" rodyklė atidaro patį embed'ą (152px Spotify / 200px YT). */
function MobileStickyPlayer({ tracks, active, setActive, playing, setPlaying, onClose }: {
  tracks: ExtractedTrack[]
  active: number; setActive: (i: number) => void
  playing: boolean; setPlaying: (p: boolean) => void
  onClose: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const cur = tracks[active]
  const isSpotify = cur?.source === 'spotify'
  const hasNext = active < tracks.length - 1

  return (
    <div className="bp-msp" role="region" aria-label="Muzikos grotuvas">
      {/* Iframe — visada mount'inamas kai playing (kad garsas tęstųsi sutraukus) */}
      {cur?.embed_url && playing && (
        <div className={`bp-msp-frame ${expanded ? 'is-open' : ''} ${isSpotify ? 'is-spotify' : ''}`}>
          <iframe
            key={cur.key + ':' + active}
            src={cur.embed_url + (cur.source === 'youtube' ? '&autoplay=1' : '')}
            allow="autoplay; encrypted-media; clipboard-write"
            allowFullScreen
          />
        </div>
      )}

      <div className="bp-msp-strip">
        {cur?.cover_url
          /* eslint-disable-next-line @next/next/no-img-element */
          ? <img src={cur.cover_url} alt="" className="bp-msp-cover" />
          : <span className="bp-msp-cover-fallback">{isSpotify ? '♫' : '♪'}</span>
        }
        <div className="bp-msp-info">
          <p className="bp-msp-title">{cur?.title || (isSpotify ? 'Spotify takelis' : 'Takelis')}</p>
          {cur?.artist_name && <p className="bp-msp-artist">{cur.artist_name}</p>}
        </div>

        {/* Play / pause (pause = atjungia iframe → garsas stoja) */}
        <button type="button" className="bp-msp-btn is-primary"
          onClick={() => setPlaying(!playing)}
          aria-label={playing ? 'Pristabdyti' : 'Leisti'}>
          {playing ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}><path d="M8 5v14l11-7z" /></svg>
          )}
        </button>

        {/* Kita daina */}
        {tracks.length > 1 && (
          <button type="button" className="bp-msp-btn"
            onClick={() => { if (hasNext) { setActive(active + 1); setPlaying(true) } else { setActive(0); setPlaying(true) } }}
            aria-label="Kita daina" title="Kita daina">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5l9 7-9 7V5zm10 0h2v14h-2z" /></svg>
          </button>
        )}

        {/* Expand / collapse embed */}
        <button type="button" className="bp-msp-btn" onClick={() => setExpanded(e => !e)}
          aria-label={expanded ? 'Sutraukti grotuvą' : 'Išskleisti grotuvą'} title="Vaizdas">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
               style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>

        {/* Uždaryti */}
        <button type="button" className="bp-msp-btn" onClick={onClose} aria-label="Uždaryti grotuvą" title="Uždaryti">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  )
}

/* ─── FollowPill-style like button ────────── */
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
          item.type === 'artist' && item.entity_slug ? `/atlikejai/${item.entity_slug}` :
          null
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
                    {item.artist && <span className="bp-topas-artist-inline">{item.artist}</span>}
                    {item.artist && <span className="bp-topas-dash"> — </span>}
                    {item.title}
                  </p>
                  {genres.length > 0 && (
                    <div className="bp-topas-genres">
                      {genres.map((g, i) => <span key={i} className="bp-topas-genre">{g}</span>)}
                    </div>
                  )}
                </div>
              </div>
              <div className="bp-topas-lower">
                <div className="bp-topas-cover-wrap">
                  {item.image_url
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={item.image_url} alt="" className="bp-topas-cover" />
                    : <div className="bp-topas-cover bp-topas-cover-empty">{(item.artist || item.title || '?').charAt(0).toUpperCase()}</div>
                  }
                  {playable && (
                    <button type="button" className="bp-topas-play" aria-label="Klausyti"
                      onClick={(e) => { if (isAlbum) openAlbum(e) }}>
                      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </button>
                  )}
                </div>
                {hasDesc && <p className="bp-topas-comment">{item.comment}</p>}
              </div>
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
          <Wrapper key={idx} {...wp} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12,
            background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', textDecoration: 'none',
          }}>
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
        : <div style={{ width: 56, height: 56, borderRadius: 10, background: 'var(--card-bg)', flexShrink: 0 }} />
      }
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: "'Outfit',sans-serif", fontSize: 10, fontWeight: 900, letterSpacing: '.14em',
                    textTransform: 'uppercase', color: 'var(--accent-orange)', margin: 0 }}>{entity.kind}</p>
        <p style={{ fontFamily: "'Outfit',sans-serif", fontSize: 15, fontWeight: 800, color: 'var(--text-primary)',
                    margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entity.name}</p>
        {entity.subname && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0', whiteSpace: 'nowrap',
                      overflow: 'hidden', textOverflow: 'ellipsis' }}>{entity.subname}</p>
        )}
      </div>
      <span style={{ color: 'var(--text-muted)', fontSize: 18, flexShrink: 0 }}>→</span>
    </Link>
  )
}
