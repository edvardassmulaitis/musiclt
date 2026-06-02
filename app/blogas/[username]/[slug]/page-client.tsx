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
    creation_subtype?: string | null
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
// Tag'ai, kurie buvo auto-įdedami legacy migration metu — dabar paslepiami nuo
// chip listing'o. Type badge (KŪRYBA / VERTIMAS / ...) ir creation_subtype
// (Eilėraštis, Novelė, ...) jau rodomi atskirai virš title'o, dubliuoti chip'e
// būtų triukšmas.
const AUTO_TAGS = new Set([
  'legacy', 'dienoraštis', 'dienorastis',
  'vertimas', 'kūryba', 'kuryba',
  'eilėraštis', 'eilerastis',
  'novelė', 'novele',
  'miniatiūra', 'miniatiura',
  'apsakymas', 'esė', 'ese', 'proza', 'daina',
])

function ytId(url?: string | null) {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
  return m ? m[1] : null
}

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

export default function BlogPostPageClient(props: Props) {
  const { post, postType, typeLabel, authorName, authorUsername, authorAvatar,
          authorKarma, authorJoinedYear, blogTitle, heroImage, attachments,
          embeddedMusic, targetInfo } = props
  // hasSidebar prop'as iš page.tsx — paliekam Props type'e backward compat,
  // bet visada renderinam sidebar'ą su InfoBox (info dalis visada matosi).
  void props.hasSidebar

  const karmaLevel = karmaToLevel(authorKarma)

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

  // Hide summary kai jis yra body excerpt'as — anksčiau scraper'is
  // body_excerpt'ą įdėdavo kaip summary, bet kūnas prasideda su tais pačiais
  // sakiniais → dublikacija. Tikrinam ar summary tekstas yra prefix'as
  // strip'into body'o (be HTML tag'ų, sumažintas whitespace).
  const showSummary = (() => {
    if (!post.summary || !post.content) return !!post.summary
    const norm = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
    const sum = norm(post.summary)
    const body = norm(post.content)
    if (!sum || !body) return !!post.summary
    // Jei summary identiškas pradiniam body fragment'ui (~95% match) → hide.
    return !body.startsWith(sum.slice(0, Math.min(sum.length, 100)))
  })()

  const scrollToComments = () => {
    document.getElementById('bp-comments')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <>
      <style jsx global>{`
        .bp-root { background:#080d14; color:#dde8f8; font-family:'DM Sans',sans-serif; -webkit-font-smoothing:antialiased; min-height:100vh; }

        /* ── HERO — split: title LEFT (60%), photo RIGHT (40%, fade-out) ── */
        .bp-hero { position:relative; min-height:240px; overflow:hidden;
                   background:linear-gradient(180deg, #0d1420 0%, #0a0f18 100%);
                   display:flex; align-items:flex-end; }
        .bp-hero::after { content:''; position:absolute; inset:0; pointer-events:none;
                          background:radial-gradient(ellipse at 75% 30%, rgba(249,115,22,0.06) 0%, transparent 60%); }
        /* Photo dešinėje — užima ~45% pločio, fade'inasi į kairę kad tekstas neuždengtų */
        .bp-hero-photo { position:absolute; top:0; right:0; bottom:0; width:45%; overflow:hidden; z-index:1; }
        .bp-hero-photo img { width:100%; height:100%; object-fit:cover; object-position:center 25%;
                              animation:bp-hero-zoom 18s ease-out forwards;
                              -webkit-mask-image:linear-gradient(to left, black 35%, transparent 100%);
                              mask-image:linear-gradient(to left, black 35%, transparent 100%); }
        .bp-hero-photo-fade { position:absolute; inset:0;
                              background:linear-gradient(to top, rgba(8,13,20,0.45) 0%, transparent 60%); }
        @keyframes bp-hero-zoom { from { transform:scale(1) } to { transform:scale(1.06) } }
        .bp-hero-content { position:relative; z-index:2; width:100%; max-width:1400px; margin:0 auto;
                           padding:36px 32px 28px; }
        .bp-hero-inner { max-width:55%; animation:bp-in .6s ease-out both; }
        @keyframes bp-in { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }

        .bp-chip { display:inline-block; font-family:'Outfit',sans-serif; font-size:10px; font-weight:900; letter-spacing:.08em;
                   text-transform:uppercase; color:#fff; padding:4px 12px; border-radius:20px;
                   background:rgba(249,115,22,0.2); border:1px solid rgba(249,115,22,0.3); }
        .bp-rating { display:inline-flex; align-items:center; gap:4px; background:rgba(255,255,255,0.12); border-radius:6px;
                     padding:3px 8px; font-family:'Outfit',sans-serif; font-size:11px; font-weight:900; color:#fff;
                     margin-left:8px; }
        .bp-h1 { font-family:'Outfit',sans-serif; font-size:clamp(1.6rem,2.6vw,2.4rem); font-weight:900; line-height:1.08;
                 letter-spacing:-.03em; color:#fff; margin:10px 0 0; }

        /* User card hero'je — avatar + name + sub */
        .bp-user { display:inline-flex; align-items:center; gap:12px; background:rgba(255,255,255,0.07);
                   backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,0.12); border-radius:100px;
                   padding:6px 16px 6px 6px; text-decoration:none; color:inherit; transition:background .15s; }
        .bp-user:hover { background:rgba(255,255,255,0.12); }
        .bp-user-av { width:38px; height:38px; border-radius:50%; overflow:hidden; flex-shrink:0;
                      display:flex; align-items:center; justify-content:center; font-family:'Outfit',sans-serif;
                      font-size:15px; font-weight:900; color:#fff; }
        .bp-user-av img { width:100%; height:100%; object-fit:cover; }
        .bp-user-text { display:flex; flex-direction:column; gap:3px; }
        .bp-user-name { font-family:'Outfit',sans-serif; font-size:14px; font-weight:800; color:#fff; letter-spacing:-.01em; line-height:1; }
        .bp-user-popbar { display:inline-flex; align-items:center; gap:6px; }
        .bp-user-popbar-icon { font-size:11px; line-height:1; }
        .bp-popbar { display:inline-flex; gap:3px; align-items:center; }
        .bp-popbar-dot { display:inline-block; height:4px; width:22px; border-radius:2px; background:rgba(255,255,255,0.18); transition:background .2s; transform-origin:left center; }
        .bp-popbar-dot.is-on { background:var(--accent-orange, #f97316); }

        .bp-meta-row { margin-top:14px; display:flex; align-items:center; gap:10px 16px; flex-wrap:wrap; font-size:13px;
                       color:rgba(255,255,255,0.65); font-weight:500; }

        /* ── PAGE LAYOUT ── */
        .bp-page { max-width:1400px; margin:0 auto; padding:0 32px; }
        .bp-grid { display:grid; gap:32px; align-items:start; padding:18px 0 80px; }
        .bp-grid.has-sb { grid-template-columns:minmax(0,1fr) 400px; }

        /* ── SIDEBAR — sticky right ── */
        .bp-sidebar { position:sticky; top:80px; display:flex; flex-direction:column; gap:14px; min-width:0; }

        /* InfoBox — pilna info kortelė viršuje sidebar'e (author + meta + actions) */
        .bp-info-box { background:rgba(255,255,255,0.025); border:1px solid rgba(255,255,255,0.05); border-radius:14px;
                       padding:16px; display:flex; flex-direction:column; gap:14px; }
        .bp-info-author { display:flex; align-items:center; gap:12px; text-decoration:none; color:inherit; }
        .bp-info-av { width:44px; height:44px; border-radius:50%; overflow:hidden; flex-shrink:0;
                      display:flex; align-items:center; justify-content:center; font-family:'Outfit',sans-serif;
                      font-size:16px; font-weight:900; color:#fff; }
        .bp-info-av img { width:100%; height:100%; object-fit:cover; }
        .bp-info-author-text { display:flex; flex-direction:column; gap:5px; min-width:0; }
        .bp-info-author-name { font-family:'Outfit',sans-serif; font-size:15px; font-weight:800; color:#f2f4f8;
                               letter-spacing:-.01em; line-height:1; transition:color .15s; }
        .bp-info-author:hover .bp-info-author-name { color:#f97316; }
        .bp-info-meta { display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:12px;
                        color:#8aa8cc; font-weight:500; }
        .bp-info-dot { color:rgba(255,255,255,0.25); }
        .bp-info-actions { display:flex; gap:8px; flex-wrap:wrap; }
        .bp-sb-card { background:rgba(255,255,255,0.025); border:1px solid rgba(255,255,255,0.05); border-radius:14px; overflow:hidden; }
        .bp-sb-card-padded { padding:14px; }
        .bp-sb-heading { font-family:'Outfit',sans-serif; font-size:10px; font-weight:900; letter-spacing:.14em;
                         text-transform:uppercase; color:#5e7290; margin:0 0 10px; }

        /* Player — perimta artist page tracks-table stilistika su rows
           (# | title | popbar). Aspect-video viršuje su orange play overlay. */
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
        /* Video — atskirta aspect ratio dėl Spotify (152px height) vs YT (16:9) */
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
                          font-size:48px; color:#5e7290; background:#080d14; }
        /* Orange play btn — bottom-right corner (artist page hero parity).
           Anksčiau buvo centre — uždengdavo veido/scenos kompoziciją. */
        .bp-mu-play-overlay { position:absolute; inset:0;
                              background:linear-gradient(to top, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.15) 30%, transparent 60%);
                              pointer-events:none; }
        .bp-mu-play-btn { position:absolute; bottom:12px; right:12px;
                          width:48px; height:48px; border-radius:50%;
                          background:var(--accent-orange, #f97316);
                          box-shadow:0 8px 24px rgba(249,115,22,0.5);
                          display:flex; align-items:center; justify-content:center;
                          border:3px solid rgba(255,255,255,0.15);
                          transition:transform .2s; }
        .bp-mu-thumb:hover .bp-mu-play-btn { transform:scale(1.1); }
        .bp-mu-iframe { width:100%; height:100%; border:none; }
        /* Now-playing strip — kompakt'as title + artist */
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

        /* Track list — artist page TracksTable stiliumi.
           Row structure: # | (title + popbar + artist STACKED) | link + play.
           Max-height 240px (~5-6 tracks visible). */
        .bp-mu-list { max-height:240px; overflow-y:auto; padding:6px 0; }
        .bp-mu-list::-webkit-scrollbar { width:6px; }
        .bp-mu-list::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1); border-radius:3px; }
        /* Row container — flex: body button + actions */
        .bp-mu-track { display:flex; align-items:center; gap:6px; padding:0 8px 0 0;
                       transition:background .15s; }
        .bp-mu-track:hover { background:rgba(255,255,255,0.04); }
        .bp-mu-track-on { background:rgba(249,115,22,.10); }
        /* Clickable row body — # + info, fills available width */
        .bp-mu-track-body { flex:1; min-width:0; display:flex; align-items:center; gap:10px;
                            padding:9px 0 9px 14px; background:transparent; border:none; cursor:pointer;
                            text-align:left; font-family:'DM Sans',sans-serif; color:inherit; }
        /* Position number — w-5, 12px Outfit bold, faint text default, orange active */
        .bp-mu-track-num { font-family:'Outfit',sans-serif; font-size:12px; font-weight:800; color:#5e7290;
                           min-width:20px; text-align:center; flex-shrink:0; font-variant-numeric:tabular-nums;
                           line-height:1; }
        .bp-mu-track-on .bp-mu-track-num { color:#f97316; }
        /* Actions on right: external link + play btn */
        .bp-mu-track-actions { display:flex; align-items:center; gap:4px; flex-shrink:0; }
        /* Daugiau pill — burger icon, atidaro /dainos/<slug> (kur lyrics + comments).
           Stiliuje identiškas artist page TrackInfoModal trigger button'ui. */
        .bp-mu-track-more { display:flex; align-items:center; justify-content:center;
                            padding:5px 8px; border-radius:999px;
                            background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08);
                            color:#5e7290; text-decoration:none;
                            transition:background .15s, border-color .15s, color .15s; }
        .bp-mu-track-more:hover { background:rgba(249,115,22,0.1); border-color:rgba(249,115,22,0.4);
                                  color:var(--accent-orange, #f97316); }
        .bp-mu-track-play { display:flex; align-items:center; justify-content:center;
                            width:30px; height:30px; border-radius:50%;
                            background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1);
                            color:#dde8f8; cursor:pointer; transition:all .15s; }
        .bp-mu-track-play:hover { background:var(--accent-orange, #f97316); border-color:transparent; color:#fff; }
        .bp-mu-track-on .bp-mu-track-play { background:var(--accent-orange, #f97316);
                                            border-color:transparent; color:#fff; }
        /* Info col — flex column (title row above popbar row) */
        .bp-mu-track-info { flex:1; min-width:0; display:flex; flex-direction:column; align-items:flex-start; gap:3px; }
        .bp-mu-track-title { font-family:'Outfit',sans-serif; font-size:13px; font-weight:700; color:#dde8f8;
                             margin:0; line-height:1.2;
                             white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }
        .bp-mu-track-on .bp-mu-track-title { color:#f97316; }
        .bp-mu-track-artist { font-size:10.5px; color:#8aa8cc; margin:0; line-height:1.1;
                              white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }
        /* Mini PopBar — POD title (kaip artist page). 3px dash, 14px wide. */
        .bp-mu-popbar { display:flex; gap:3px; align-items:center; }
        .bp-mu-popbar span { display:inline-block; height:3px; width:14px; border-radius:1.5px;
                              background:rgba(255,255,255,0.18); }
        .bp-mu-popbar span.is-on { background:var(--accent-orange, #f97316);
                                    opacity:0.65; }
        .bp-mu-popbar span.is-on:nth-child(-n+3) { opacity:0.9; }
        .bp-mu-popbar span.is-on:first-child { opacity:1; }

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

        /* ── PROSE — be max-width, kad tekstas užpildytų visą main column'ą
           ir tarpas tarp text/player būtų minimalus (anksčiau 720px riba
           palikdavo 200+ px tuščios erdvės dešinėje main column dalyje) ── */
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

        .bp-summary { font-size:1.12rem; line-height:1.5; color:#b0bdd4; font-weight:500;
                      margin:0 0 16px; padding-bottom:14px; border-bottom:1px solid rgba(255,255,255,0.05);
                      font-family:'Outfit',sans-serif; }

        /* ── ACTIONS — TOP row (above body), TAGS row pakeliama čia ── */
        .bp-top-actions { display:flex; flex-wrap:wrap; gap:10px; align-items:center;
                          margin:0 0 18px; max-width:720px; }
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
        .bp-topas { list-style:none; padding:0; margin:36px 0; display:flex; flex-direction:column; gap:10px; }
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
        .bp-comments { margin-top:48px; padding-top:28px; border-top:1px solid rgba(255,255,255,0.06); }

        /* ── RESPONSIVE ── */
        @media (max-width: 1100px) {
          .bp-grid.has-sb { grid-template-columns:minmax(0,1fr) 320px; }
        }
        @media (max-width: 960px) {
          .bp-grid.has-sb { grid-template-columns:1fr; }
          /* Reorder mobile: InfoBox (sidebar) PIRMA (virš teksto), tada main.
             Naudojam display:contents + flex order'ius, bet CSS Grid'e per
             grid-auto-flow ir explicit order ant child'ų. */
          .bp-grid.has-sb main { order:2; }
          .bp-grid.has-sb .bp-sidebar { order:1; position:static; top:auto;
                                         flex-direction:column; gap:14px; }
          /* Mobile'e InfoBox kompaktiškas — tik avatar+meta+actions vienoje
             eilėje, kad netruktų vietos. Player'is su iframe lieka sticky,
             bet rendr'inasi POŽ infoboxu (jau order'įjuje). */
          .bp-info-box { padding:12px 14px; gap:10px; }
          .bp-info-author { gap:10px; }
          .bp-info-av { width:38px; height:38px; }
          /* Sumažinam mobile hero ir gridą */
          .bp-hero { min-height:auto; flex-direction:column; }
          .bp-hero-photo { position:relative; width:100%; height:160px; }
          .bp-hero-photo img { -webkit-mask-image:linear-gradient(to top, transparent 0%, black 50%);
                                mask-image:linear-gradient(to top, transparent 0%, black 50%); }
          .bp-hero-content { padding:14px 18px 18px; max-width:100%; }
          .bp-hero-inner { max-width:100%; }
          .bp-page { padding:0 18px; }
          .bp-grid { padding:18px 0 60px; gap:20px; }
        }
        @media (max-width: 540px) {
          .bp-hero-photo { height:130px; }
          .bp-h1 { font-size:1.5rem; }
        }
      `}</style>

      <div className="bp-root">
        {/* ══════════ HERO — title KAIRĖJE, nuotrauka DEŠINĖJE (mirror of artist page) ═══ */}
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
                      background: 'rgba(255,255,255,0.06)',
                      borderColor: 'rgba(255,255,255,0.12)',
                      color: 'rgba(220,232,248,0.85)',
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

        {/* ══════════ MAIN + SIDEBAR ══════════ */}
        <div className="bp-page">
          <div className="bp-grid has-sb">

            {/* MAIN (left) — tik tekstas + komentarai */}
            <main style={{ minWidth: 0 }}>
              {showSummary && <p className="bp-summary">{post.summary}</p>}

              {post.content && (
                <div className="bp-prose">
                  <PostContent html={post.content} />
                </div>
              )}

              {postType === 'topas' && post.list_items.length > 0 && (
                <TopasList items={post.list_items} />
              )}

              {/* Tags — palieku po body, kad neperkraut info box'o */}
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

            {/* SIDEBAR (right, sticky) — InfoBox viršuje + Player apačioje */}
            <aside className="bp-sidebar">
              {/* InfoBox: author + popbar + date + read time + Patinka + Komentarai.
                  Visada matomas — net jei nėra player tracks (kai nėra musi, sidebar
                  vis tiek turi info card). */}
              <InfoBox
                postId={post.id}
                postLikeCount={post.like_count}
                commentCount={post.comment_count}
                publishedAt={post.published_at}
                readingTime={post.reading_time_min}
                authorName={authorName}
                authorUsername={authorUsername}
                authorAvatar={authorAvatar}
                karmaLevel={karmaLevel}
                onScrollToComments={scrollToComments}
              />
              {playerTracks.length > 0 && <UnifiedPlayer tracks={playerTracks} />}
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
          </div>
        </div>
      </div>
    </>
  )
}

/* ─── InfoBox — author info + post meta + action buttons (right sidebar TOP) ─ */
function InfoBox(props: {
  postId: string
  postLikeCount: number
  commentCount: number
  publishedAt: string | null | undefined
  readingTime: number
  authorName: string
  authorUsername: string
  authorAvatar: string | null
  karmaLevel: number
  onScrollToComments: () => void
}) {
  const { postId, postLikeCount, commentCount, publishedAt, readingTime,
          authorName, authorUsername, authorAvatar, karmaLevel,
          onScrollToComments } = props
  const formatDate = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' }) : ''

  return (
    <div className="bp-info-box">
      {/* Author row — avatar + name + popbar (be rounded pill'o, plain stack) */}
      <Link href={`/@${authorUsername}`} className="bp-info-author">
        <div className="bp-info-av" style={{ background: `hsl(${(authorName.charCodeAt(0) || 65) * 17 % 360},35%,30%)` }}>
          {authorAvatar
            /* eslint-disable-next-line @next/next/no-img-element */
            ? <img src={authorAvatar} alt="" />
            : (authorName[0] || '?').toUpperCase()
          }
        </div>
        <div className="bp-info-author-text">
          <span className="bp-info-author-name">{authorName}</span>
          <div className="bp-user-popbar" aria-label={`Karma: ${karmaLevel}/5`}>
            <span className="bp-user-popbar-icon">⭐</span>
            <PopBar level={karmaLevel} />
          </div>
        </div>
      </Link>

      {/* Meta — date + reading time */}
      <div className="bp-info-meta">
        {publishedAt && <span>{formatDate(publishedAt)}</span>}
        {readingTime > 0 && (
          <>
            <span className="bp-info-dot">·</span>
            <span>{readingTime} min. skaitymo</span>
          </>
        )}
      </div>

      {/* Actions: Patinka + Komentarai */}
      <div className="bp-info-actions">
        <BlogLikePill postId={postId} initialCount={postLikeCount} />
        <button
          type="button"
          onClick={onScrollToComments}
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
            {commentCount.toLocaleString('lt-LT')}
          </span>
        </button>
      </div>
    </div>
  )
}

/* ─── PopBar — perimta iš user profile page'o (animated 5-dot indikatorius) ─ */
function PopBar({ level }: { level: number }) {
  const total = 5
  return (
    <div className="bp-popbar" aria-hidden>
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
      {/* Heading „Susijusi muzika" pašalintas — player atrodo identiškai
          artist page hero player'iui (video → track list, be header'io). */}

      {/* Video / iframe — Spotify embed yra 152px tall, YT yra 16:9 */}
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
            {/* Overlay tints — gradient apačioje, kad play btn matytųsi */}
            {cur?.embed_url && <div className="bp-mu-play-overlay" />}
            {/* Source badge — viršuje dešinėje */}
            <span className={`bp-mu-src-badge bp-mu-src-${cur?.source}`}>
              {cur?.source === 'youtube' ? 'YouTube' : cur?.source === 'spotify' ? 'Spotify' : 'music.lt'}
            </span>
            {/* Play btn — apačioje dešinėje (artist page hero pattern) */}
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
            // PopBar level — descending pagal order'į (pirmas = 5, last = 1).
            // Atspindi „prominence" sąraše (artist page style — top track = pilnas bar).
            const popLevel = Math.max(1, Math.ceil((tracks.length - i) / Math.max(1, Math.ceil(tracks.length / 5))))
            return (
              <div key={t.key + ':' + i} className={`bp-mu-track ${isOn ? 'bp-mu-track-on' : ''}`}>
                {/* Row body clickable — switches active track in player */}
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
                {/* Actions on right side: Daugiau pill (TIK kai resolved) + play btn.
                    Daugiau atidaro /dainos/<slug> kur tas pats UI kaip artist
                    page TrackInfoModal (player + lyrics + komentarai). External
                    link į Spotify/YouTube pašalintas (klaidina UX). */}
                <div className="bp-mu-track-actions">
                  {t.db_track && (
                    <Link
                      href={`/dainos/${t.db_track.artist_slug ? `${t.db_track.artist_slug}-${t.db_track.slug}-${t.db_track.id}` : t.db_track.slug || t.db_track.id}`}
                      className="bp-mu-track-more"
                      title="Daugiau: žodžiai, komentarai, video"
                      onClick={e => e.stopPropagation()}
                    >
                      {/* Burger/text-lines icon — same as artist page TrackInfoModal trigger */}
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

/* AuthorFooter pašalintas — author info dabar gyvena InfoBox sidebar'e. */
