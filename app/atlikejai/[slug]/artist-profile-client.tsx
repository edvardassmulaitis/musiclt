'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import LikesModal from '@/components/LikesModal'
import { LikePill } from '@/components/LikePill'
import BioModal from '@/components/BioModal'
import ScoreCard from '@/components/ScoreCard'
import ArtistAwards, { type AwardRow } from '@/components/ArtistAwards'
import type { LegacyLikeUser } from '@/components/LegacyLikesPanel'
import EntityCommentsBlock from '@/components/EntityCommentsBlock'
import MusicSearchPicker, { AttachmentChips, type AttachmentHit } from '@/components/MusicSearchPicker'
import { proxyImg } from '@/lib/img-proxy'

/* ═══════════════════════════════════════════════════════════════════
   Artist profile — v10.
   - Hero: split (photo + player), no middle strip.
   - HORIZONTAL InfoBar below hero: country(#rank), genre(#rank) + subtle
     substyles, socials, website. Spans full content width.
   - Below: 2-col. Left = bio preview + compact members. Right = gallery
     collage (player-width, below the player visually).
   - Like button toggles without opening modal. Separate "Kam patinka"
     link opens LikesModal.
   - Discography: no count in header, filters renamed with "albumai",
     added "Kitos dainos" tab for orphan tracks.
   - Diskusijos: no ID, shows last comment preview on the right.
   ═══════════════════════════════════════════════════════════════════ */

// ── Types ───────────────────────────────────────────────────────────

type Genre = { id: number; name: string }
type Album = {
  id: number; slug: string; title: string; year?: number; cover_image_url?: string
  type_studio?: boolean; type_ep?: boolean; type_single?: boolean; type_live?: boolean
  type_compilation?: boolean; type_remix?: boolean; type_soundtrack?: boolean; type_demo?: boolean
}
type Track = {
  id: number; slug: string; title: string; type?: string
  legacy_id?: number | null
  video_url?: string; cover_url?: string
  album_id?: number | null; release_year?: number; release_month?: number
  release_date?: string | null
  /** Duration in seconds (integer) or "mm:ss" string — we handle both at render time. */
  duration?: number | string | null
  lyrics?: string | null
  /** Aggregated like count iš `likes` lentelės (entity_type='track').
   *  Set server-side in getTracks(). */
  like_count?: number | null
}
type Member = { id: number; slug: string; name: string; cover_image_url?: string; member_from?: number; member_until?: number }
type Photo = {
  url: string
  /** Legacy JSON blob — {"a":"author · license","s":"source url"}. Parsed via parsePhotoCaption. */
  caption?: string
  /** Date the photo was taken (preferred) — ISO string. */
  taken_at?: string | null
  /** Canonical source URL (Wikimedia file page, Flickr page, etc.). */
  source_url?: string | null
  license?: string | null
  /** Resolved photographer row — only present once the photographer_id FK lands. */
  photographer_slug?: string | null
  photographer_name?: string | null
}
type ChartPt = { year: number; value: number }
type LegacyCommunity = {
  totalEvents: number; distinctUsers: number; artistLikes: number
  topFans: (LegacyLikeUser & { like_count: number })[]
  allArtistFans: LegacyLikeUser[]
}
type LegacyPost = {
  body: string
  author_username: string | null
  author_avatar_url?: string | null
  created_at: string | null
}
type LegacyThread = {
  legacy_id: number; slug: string; source_url: string
  title?: string | null; post_count?: number | null
  first_post_at?: string | null; last_post_at?: string | null
  last_post?: LegacyPost | null
  recent_posts?: LegacyPost[]
}
type Rank = { category: string; rank: number; total: number; scope: 'country' | 'genre' | 'global' }
type Props = {
  artist: any; heroImage: string | null; genres: Genre[]; substyles?: Genre[]
  links: { platform: string; url: string }[]; photos: Photo[]
  albums: Album[]; tracks: Track[]; members: Member[]; followers: number; likeCount: number
  news: any[]; events: any[]; similar: any[]
  newTracks: Track[]; topVideos: Track[]; chartData: ChartPt[]; hasNewMusic: boolean
  legacyCommunity?: LegacyCommunity
  legacyThreads?: LegacyThread[]; legacyNews?: LegacyThread[]
  ranks?: Rank[]
  /** Set of track ids that are linked to this artist's albums (via album_tracks
   *  junction). Tracks NOT in this list are considered orphan ("Kitos dainos"). */
  linkedTrackIds?: number[]
  awards?: AwardRow[]
}

// ── Helpers ─────────────────────────────────────────────────────────

function parseCoverPos(pos: string): { x: number; y: number; zoom: number } {
  const parts = pos.trim().split(/\s+/)
  if (parts[0] === 'center') {
    const yMatch = pos.match(/(\d+)%/)
    const y = yMatch ? parseInt(yMatch[1]) : 30
    const last = parseFloat(parts[parts.length - 1])
    const zoom = (!isNaN(last) && last >= 1 && !parts[parts.length - 1].includes('%')) ? last : 1
    return { x: 50, y, zoom }
  }
  const pcts = pos.match(/(\d+)%/g) || []
  const x = pcts[0] ? parseInt(pcts[0]) : 50
  const y = pcts[1] ? parseInt(pcts[1]) : 30
  const last = parseFloat(parts[parts.length - 1])
  const zoom = (!isNaN(last) && last >= 1 && !parts[parts.length - 1].includes('%')) ? last : 1
  return { x, y, zoom }
}

const yt = (u?: string | null) => {
  if (!u) return null
  const m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
  return m ? m[1] : null
}

/** Format track duration as "m:ss". Accepts integer seconds or "mm:ss" strings
 *  (the column sometimes stores one, sometimes the other). Returns null when
 *  the input is unusable. */
function fmtDur(d: number | string | null | undefined): string | null {
  if (d == null) return null
  if (typeof d === 'string') {
    // Already "m:ss" or "h:mm:ss" — return as-is if it looks valid.
    if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(d.trim())) return d.trim()
    const n = Number(d)
    if (!isFinite(n) || n <= 0) return null
    d = n
  }
  if (typeof d !== 'number' || !isFinite(d) || d <= 0) return null
  const s = Math.round(d)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

/** Format a date in Lithuanian convention — year first. Two variants:
 *    short: "2026 04 30"              (compact cards, numeric, no trailing dot)
 *    long:  "2026 m. balandžio 6 d."  (modal / hero variant)
 *
 *  Lithuanian reads year→month→day. We intentionally avoid ISO ("2026-04-06")
 *  because bare spaces read more naturally in prose. */
function formatLtDate(d: Date, opts: { long?: boolean } = {}): string {
  if (opts.long) {
    return d.toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' })
  }
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y} ${m} ${day}`
}

/** Year-only rendering for a photo's `taken_at`. Returns null for missing
 *  or unparseable dates so callers can fall back silently. */
function photoYear(raw?: string | null): number | null {
  if (!raw) return null
  const t = new Date(raw).getTime()
  if (!isFinite(t)) return null
  return new Date(t).getFullYear()
}

function slugToForumTitle(slug: string): string {
  return (slug || '').replace(/\/$/, '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim() || 'Diskusija'
}

const aType = (a: Album) => {
  if (a.type_ep) return 'EP'
  if (a.type_single) return 'Singlas'
  if (a.type_live) return 'Live'
  if (a.type_compilation) return 'Rinkinys'
  if (a.type_remix) return 'Remix'
  if (a.type_soundtrack) return 'OST'
  if (a.type_demo) return 'Demo'
  return 'Studijinis'
}

/** Filter-tab labels. 'all' acts as reset-to-everything. */
const FILTER_LABEL: Record<string, string> = {
  all: 'Visi įrašai',
  Studijinis: 'Studijiniai albumai',
  EP: 'EP albumai',
  Singlas: 'Singlai',
  Live: 'Gyvai įrašyti albumai',
  Rinkinys: 'Rinkiniai',
  Remix: 'Remiksų albumai',
  OST: 'OST albumai',
  Demo: 'Demo albumai',
  orphan: 'Kitos dainos',
}

function stripHtml(html: string): string {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

/** "2014-12-15 21:20" — naudojam absoliučią datą diskusijos modal'e, kad
 *  istoriniai komentarai (5+ metų seni) nesuvienodėtų į beverčią
 *  "prieš 11 m.". Outfit tabular nums tinka šiam stiliui. */
function formatPostDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}

/** Sanitize forum_posts.content_html — strip dangerous tags + on* handlers,
 *  keep formatting + emoji <img>. Music.lt nesta'ina cituotas žinutes
 *  per <div class="quote1">…</div> (su inline border-left styling), todėl
 *  `style` atributai paliekami — bet mūsų .forum-html .quote1 CSS rule'ai
 *  turi !important ir override'ina inline style'us prie naujos design temos.
 *  Emoji <img> URL'ai eina per proxy, kad veiktų mobile'e (music.lt
 *  blokuoja kai kuriuos klientus). */
function sanitizeForumHtml(raw: string): string {
  if (!raw) return ''
  let s = raw
  // Strip dangerous block tags wholesale.
  s = s.replace(/<(script|style|iframe|object|embed|form|input|button|meta|link)\b[\s\S]*?<\/\1>/gi, '')
  s = s.replace(/<(script|style|iframe|object|embed|form|input|button|meta|link)\b[^>]*\/?>/gi, '')
  // Strip on* event handlers.
  s = s.replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
  s = s.replace(/\son\w+\s*=\s*'[^']*'/gi, '')
  s = s.replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
  // Strip javascript: in href / src.
  s = s.replace(/(href|src)\s*=\s*"javascript:[^"]*"/gi, '$1="#"')
  s = s.replace(/(href|src)\s*=\s*'javascript:[^']*'/gi, "$1='#'")
  // Proxy <img src> through our weserv image proxy when music.lt-hosted
  // (mobile + Vercel block direct music.lt CDN).
  s = s.replace(/<img\b([^>]*)\bsrc\s*=\s*"(https?:\/\/(?:www\.)?music\.lt\/[^"]+)"/gi, (_, pre, url) => {
    const proxied = `https://images.weserv.nl/?url=${encodeURIComponent(url.replace(/^https?:\/\//, ''))}`
    return `<img${pre}src="${proxied}"`
  })
  return s
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (isNaN(t)) return ''
  const diff = Date.now() - t
  const day = 86400000
  if (diff < day) return 'šiandien'
  if (diff < 2 * day) return 'vakar'
  if (diff < 7 * day) return `prieš ${Math.floor(diff / day)} d.`
  if (diff < 30 * day) return `prieš ${Math.floor(diff / (7 * day))} sav.`
  if (diff < 365 * day) return `prieš ${Math.floor(diff / (30 * day))} mėn.`
  return `prieš ${Math.floor(diff / (365 * day))} m.`
}

const FLAGS: Record<string, string> = {
  'Lietuva': '🇱🇹', 'Latvija': '🇱🇻', 'Estija': '🇪🇪', 'Lenkija': '🇵🇱',
  'Vokietija': '🇩🇪', 'Prancūzija': '🇫🇷', 'Italija': '🇮🇹', 'Ispanija': '🇪🇸',
  'Didžioji Britanija': '🇬🇧', 'JAV': '🇺🇸', 'Kanada': '🇨🇦', 'Australija': '🇦🇺',
  'Japonija': '🇯🇵', 'Švedija': '🇸🇪', 'Norvegija': '🇳🇴', 'Danija': '🇩🇰',
  'Suomija': '🇫🇮', 'Airija': '🇮🇪', 'Olandija': '🇳🇱', 'Rusija': '🇷🇺', 'Ukraina': '🇺🇦',
}

/** Brand colors for social icons. `null` means "inherit current text color"
 *  — we use that for X/Twitter which has a white-on-black glyph and needs to
 *  adapt to the theme instead of being hardcoded white (invisible on light). */
const SOC: Record<string, { l: string; c: string | null; d: string }> = {
  spotify: { l: 'Spotify', c: '#1DB954', d: 'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.52 17.34c-.24.36-.66.48-1.02.24-2.82-1.74-6.36-2.1-10.56-1.14-.42.12-.78-.18-.9-.54-.12-.42.18-.78.54-.9 4.56-1.02 8.52-.6 11.64 1.32.42.18.48.66.3 1.02z' },
  youtube: { l: 'YouTube', c: '#FF0000', d: 'M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.38.55A3.02 3.02 0 0 0 .5 6.19 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.81 3.02 3.02 0 0 0 2.12 2.14c1.88.55 9.38.55 9.38.55s7.5 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14A31.6 31.6 0 0 0 24 12a31.6 31.6 0 0 0-.5-5.81zM9.54 15.57V8.43L15.82 12l-6.28 3.57z' },
  tiktok: { l: 'TikTok', c: '#00c8c0', d: 'M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.96-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z' },
  facebook: { l: 'Facebook', c: '#1877F2', d: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z' },
  // X/Twitter: no fixed color — inherits current text color so it's visible on both themes
  twitter: { l: 'X', c: null, d: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' },
  soundcloud: { l: 'SoundCloud', c: '#FF5500', d: 'M11.56 8.87V17h8.76c1.85-.13 3.31-1.65 3.31-3.52 0-1.95-1.58-3.53-3.53-3.53-.48 0-.94.1-1.36.27-.28-3.14-2.92-5.61-6.13-5.61-.78 0-1.54.15-2.23.42-.27.1-.34.21-.34.44V8.87zm-1.04-.05c-.32-.09-.66-.15-1.01-.15-.36 0-.7.05-1.02.14V17h2.03V8.82zm-3.1.92c-.32-.21-.68-.36-1.08-.44V17h1.98V9.96zm-3.13-.17c-.3.04-.59.12-.87.24V17h1.74V9.74c-.28-.12-.57-.2-.87-.24zm-2.95 1.15c-.22-.13-.47-.22-.74-.26V17h1.48V10.5c-.22.05-.5.15-.74.22zM0 14.13c0-.8.14-1.56.39-2.27V17h-.17c-.12-.9-.22-1.8-.22-2.87z' },
  bandcamp: { l: 'Bandcamp', c: '#629aa9', d: 'M0 18.75l7.437-13.5H24l-7.438 13.5H0z' },
}

// ── Shared ──────────────────────────────────────────────────────────

function SectionTitle({ label, count }: { label: string; count?: number }) {
  return (
    <div className="mb-5 flex items-baseline gap-3 sm:mb-6">
      <h2 className="font-['Outfit',sans-serif] text-[22px] font-black leading-none tracking-[-0.01em] text-[var(--text-primary)] sm:text-[26px] lg:text-[28px]">
        {label}
      </h2>
      {typeof count === 'number' && (
        <span className="font-['Outfit',sans-serif] text-[15px] font-bold text-[var(--text-faint)] sm:text-[16px]">{count}</span>
      )}
    </div>
  )
}

// ── PlayerCard ─────────────────────────────────────────────────────
// Behaviour:
//  - Default state: big thumbnail + our own play button (no YouTube chrome).
//    First click starts autoplay inside the embedded iframe.
//  - Once playing, user controls via the iframe itself (we can't observe its
//    state, so we don't claim to — no "Groja"/"Paruošta" label).
//  - List rows show position, title, a 4-dot popularity bar (relative to the
//    list rank), the duration, and an info button that opens a track modal.
//  - Tabs: "Populiaru" and "Nauja" (latter hidden entirely when empty).

function PlayerCard({
  tracksAllTime, tracksTrending, activeTrackId, onSelectTrack,
  playing, onRequestPlay, onOpenTrackInfo, hasAnyVideo,
}: {
  tracksAllTime: Track[]; tracksTrending: Track[]
  activeTrackId: number | null; onSelectTrack: (id: number) => void
  /** True once the user has hit our own play button at least once — we swap
   *  the thumbnail overlay for the autoplay-embed iframe. */
  playing: boolean
  onRequestPlay: () => void
  onOpenTrackInfo: (t: Track) => void
  hasAnyVideo: boolean
}) {
  const hasTrending = tracksTrending.length > 0
  const [tab, setTab] = useState<'all' | 'trending'>(hasTrending ? 'trending' : 'all')
  // If "Nauja" becomes empty (e.g. tracks reshuffle), snap back to "Populiaru".
  useEffect(() => { if (!hasTrending && tab === 'trending') setTab('all') }, [hasTrending, tab])

  const list = tab === 'trending' ? tracksTrending : tracksAllTime
  // Max likes tarp visų atlikėjo trekų — naudojama PopBar relatyviam
  // skaičiavimui (kiekvienas atlikėjas turi savo HIT'us, ne fixed thresholds).
  const maxTrackLikes = useMemo(() => {
    let max = 0
    for (const t of [...tracksAllTime, ...tracksTrending]) {
      const lk = (t as any).like_count
      if (typeof lk === 'number' && lk > max) max = lk
    }
    return max
  }, [tracksAllTime, tracksTrending])
  const activeTrack = [...tracksAllTime, ...tracksTrending].find(t => t.id === activeTrackId)
  const activeVid = yt(activeTrack?.video_url)
  const firstWithVideo = list.find(t => yt(t.video_url)) || tracksAllTime.find(t => yt(t.video_url))
  const displayVid = activeVid || yt(firstWithVideo?.video_url)
  const displayTrack = activeTrack || firstWithVideo

  // YT thumbnail probe — jei displayVid turi gyvą video, naudojam hqdefault.jpg
  // kaip player'io backdrop'ą (didelis 480x360 thumbnail, atrodo cinematic).
  // Dead video grąžina 120x90 → slepiam.
  const [thumbAlive, setThumbAlive] = useState<boolean | null>(null)
  useEffect(() => {
    if (!displayVid) { setThumbAlive(null); return }
    setThumbAlive(null)
    const img = new window.Image()
    img.onload = () => setThumbAlive(img.naturalWidth >= 200)
    img.onerror = () => setThumbAlive(false)
    img.src = `https://i.ytimg.com/vi/${displayVid}/hqdefault.jpg`
  }, [displayVid])
  const showThumb = !!displayVid && thumbAlive === true

  // YouTube IFrame Player API integration.
  //
  // Why not a plain iframe + autoplay=1? On mobile, `autoplay=1` only fires
  // when the iframe is in the DOM at gesture time. Our flow mounts the
  // iframe *after* the tap (React state → rerender), which meant users
  // had to tap twice — first tap loaded YT, second tap played.
  //
  // With the IFrame API we instantiate YT.Player inside the tap handler
  // (via a ref'd container div) so the Player's own API call is still
  // within the user-gesture context; browsers allow playback.
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<any>(null)
  const [apiReady, setApiReady] = useState(false)
  const [isPaused, setIsPaused] = useState(false)

  // Load the IFrame API script once per session.
  useEffect(() => {
    const W = window as any
    if (W.YT && W.YT.Player) { setApiReady(true); return }
    if (!document.getElementById('yt-iframe-api')) {
      const s = document.createElement('script')
      s.id = 'yt-iframe-api'
      s.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(s)
    }
    // YouTube calls this global when the API is ready. Preserve any existing
    // handler other components might have registered.
    const prev = W.onYouTubeIframeAPIReady
    W.onYouTubeIframeAPIReady = () => { if (typeof prev === 'function') prev(); setApiReady(true) }
    // If the script was already injected by a previous instance, poll briefly.
    const iv = window.setInterval(() => {
      if (W.YT && W.YT.Player) { setApiReady(true); window.clearInterval(iv) }
    }, 120)
    return () => window.clearInterval(iv)
  }, [])

  // Create the player when `playing` becomes true and we have a video.
  // Re-creating on each videoId change is simpler than managing loadVideoById
  // (and matches the iframe `key` pattern we used before).
  useEffect(() => {
    if (!apiReady || !playing || !displayVid || !containerRef.current) return

    // Clean up prior player instance (video switch).
    if (playerRef.current) {
      try { playerRef.current.destroy() } catch {}
      playerRef.current = null
    }

    const W = window as any
    playerRef.current = new W.YT.Player(containerRef.current, {
      videoId: displayVid,
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: 1,
        controls: 1,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
        iv_load_policy: 3,
        origin: typeof window !== 'undefined' ? window.location.origin : undefined,
      },
      events: {
        onReady: (e: any) => {
          // Ensure playback starts — on mobile the API call within the
          // same gesture chain is what unlocks it.
          try { e.target.playVideo() } catch {}
        },
        onStateChange: (e: any) => {
          // YT states: -1 unstarted, 0 ended, 1 playing, 2 paused,
          // 3 buffering, 5 cued. Active only when playing or buffering.
          setIsPaused(!(e.data === 1 || e.data === 3))
        },
      },
    })

    return () => {
      try { playerRef.current?.destroy() } catch {}
      playerRef.current = null
    }
  }, [apiReady, playing, displayVid])

  /** Fire-and-forget play-count ping. We don't block the UI on it; failures
   *  are silent since playback is already handled by YT. */
  const pingPlay = (trackId: number) => {
    try {
      fetch(`/api/tracks/${trackId}/play`, { method: 'POST', keepalive: true }).catch(() => {})
    } catch {}
  }

  // Toggle per-track play button: same track + playing → pause; same track
  // + paused → resume; different track → switch + autoplay.
  const handleSelect = (id: number) => {
    if (id === activeTrackId && playing) {
      if (isPaused) {
        try { playerRef.current?.playVideo() } catch {}
        setIsPaused(false)
        pingPlay(id)
      } else {
        try { playerRef.current?.pauseVideo() } catch {}
        setIsPaused(true)
      }
      return
    }
    onSelectTrack(id)
    onRequestPlay()
    setIsPaused(false)
    pingPlay(id)
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[0_20px_60px_-20px_rgba(0,0,0,0.4)]">
      <div className="relative aspect-video overflow-hidden bg-black">
        {displayVid ? (
          playing ? (
            // YT IFrame API mounts an iframe inside this container. We don't
            // render an <iframe> ourselves — YT.Player does, inside the user
            // gesture, which is what unlocks mobile autoplay.
            // NB: NIEKADA neperduokim key={displayVid} čia. Su key, React
            // unmount'indavo divą prie kiekvieno track switch'o, bet
            // YT.Player.destroy() async tarp render'iu bandydavo manipuliuoti
            // jau pašalintu iframe DOM elementu — "NotFoundError: The object
            // can not be found here." Same div'ą reuse'inam — useEffect
            // destroy'na ankstesnį player'į ir sukuria naują toje pačioje
            // DOM vietoje, saugesnis lifecycle'as.
            <div ref={containerRef} className="absolute inset-0 h-full w-full" />
          ) : (
            // Initial / not-yet-played state: thumbnail + big central play
            // button. Clicking the button (or anywhere on the thumbnail)
            // flips to the iframe. No title overlay — it already lives in
            // the list row below. Once the user has hit play the button
            // disappears; YT's native controls + the per-track button take
            // over. This gives a clear "click me" affordance on the video.
            <button
              type="button"
              onClick={() => {
                // Start playback of the first available track if none picked.
                const target = activeTrackId ?? firstWithVideo?.id
                if (target != null && target !== activeTrackId) onSelectTrack(target)
                onRequestPlay()
                if (target != null) pingPlay(target)
              }}
              aria-label="Paleisti"
              className="group absolute inset-0 block cursor-pointer overflow-hidden border-0 p-0"
              style={{ background: 'var(--player-placeholder-bg, linear-gradient(135deg, #1a2436 0%, #0f1825 50%, #0a0f1a 100%))' }}
            >
              {/* YT thumbnail backdrop — TIK kai video gyvas (probe'inta su
                  hqdefault.jpg dimensijomis). Dead/missing → naudojam
                  gradient'ą kaip anksčiau. */}
              {showThumb && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`https://i.ytimg.com/vi/${displayVid}/hqdefault.jpg`}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{ filter: 'saturate(1.1) contrast(1.05)' }}
                />
              )}
              {/* Dark overlay ant thumbnail'o, kad orange play button'as
                  išsiskirtų ir matytusi switching'as tarp tracks. */}
              {showThumb && (
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-black/30" />
              )}
              {/* Subtle vinyl-like centerless ring for visual texture — tik
                  kai nėra thumbnail'o (gradient state). */}
              {!showThumb && (
                <div className="absolute inset-0 opacity-[0.03]" style={{
                  backgroundImage: 'radial-gradient(circle at center, transparent 30%, rgba(249,115,22,0.4) 30.5%, transparent 31.5%, transparent 60%, rgba(249,115,22,0.2) 60.5%, transparent 61.5%)',
                  backgroundSize: '400px 400px',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                }} />
              )}
              <span className="absolute left-1/2 top-1/2 flex h-[72px] w-[72px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--accent-orange)] shadow-[0_10px_40px_rgba(249,115,22,0.5)] ring-[6px] ring-white/10 transition-transform duration-200 group-hover:scale-110">
                <svg viewBox="0 0 24 24" width="26" height="26" fill="#fff" aria-hidden>
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </button>
          )
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/50">
                <path d="M23 7l-7 5 7 5V7z" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            </div>
            <div className="font-['Outfit',sans-serif] text-[12px] font-extrabold uppercase tracking-[0.15em] text-white/60">
              Video dar nėra
            </div>
          </div>
        )}
      </div>

      {/* Tabs — brighter active color + thicker underline */}
      <div className="flex items-center gap-1 border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-3 pt-1">
        <TabButton active={tab === 'all'} onClick={() => setTab('all')}>
          Top dainos
        </TabButton>
        {hasTrending && (
          <TabButton active={tab === 'trending'} onClick={() => setTab('trending')}>
            Naujos dainos
          </TabButton>
        )}
      </div>

      <div
        className="overflow-y-auto bg-[var(--bg-surface)]"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--border-default) transparent',
          // Fixed height (ne max-height) — kad PlayerCard nestumdytų likusio
          // turinio keičiant tab'us. Dvi dainos vs dvidešimt — kortelė lieka
          // tokio paties dydžio; mažas sąrašas tiesiog turi tuščią vietą
          // apačioje, didelis — scroll'inasi.
          height: '260px',
        }}
      >
        {list.length === 0 ? (
          <div className="flex min-h-[160px] flex-col items-center justify-center gap-1 px-6 py-8 text-center">
            <div className="font-['Outfit',sans-serif] text-[12px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">Nieko</div>
            <div className="text-[11px] text-[var(--text-faint)]">
              {tab === 'trending' ? 'Per 2 metus naujų nebuvo' : 'Dainų nėra'}
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {list.map((t, i) => {
              const v = yt(t.video_url)
              const isActive = t.id === activeTrackId
              const isActivelyPlaying = isActive && playing && !isPaused
              // Popularity bar — vieninga logika visur: relatyvus tier
              // pagal track'o likes prieš artist'o didžiausią. Tas pats
              // track gauna tą patį dash skaičių nepriklausomai nuo to,
              // kuriame tab'e (Top / Naujos / Kitos) yra rodomas. Žr.
              // popLevelRelative — ji garantuoja min 1 dash kai artist
              // turi bet kokios like'ų aktyvumo, ir 0 dashes kai
              // duomenų iš viso nėra.
              const pop = popLevelRelative((t as any).like_count || 0, maxTrackLikes)
              return (
                <li key={t.id}>
                  <div
                    className={[
                      'flex w-full items-center gap-2 px-3 py-2 transition-colors',
                      isActive ? 'bg-[rgba(249,115,22,0.08)]' : 'hover:bg-[var(--bg-hover)]',
                    ].join(' ')}
                  >
                    {/* Position / active equalizer — animates only while YT
                        reports the player as playing (not paused/stopped). */}
                    <span
                      className={[
                        'w-5 shrink-0 text-center font-["Outfit",sans-serif] text-[12px] font-bold tabular-nums',
                        isActive ? 'text-[var(--accent-orange)]' : 'text-[var(--text-faint)]',
                      ].join(' ')}
                      aria-hidden
                    >
                      {isActivelyPlaying ? <Equalizer /> : i + 1}
                    </span>

                    {/* Title — click opens the side drawer with duration +
                        full lyrics + likes. */}
                    <button
                      type="button"
                      onClick={() => onOpenTrackInfo(t)}
                      className="flex min-w-0 flex-1 cursor-pointer flex-col items-start border-0 bg-transparent p-0 text-left"
                    >
                      <div className={[
                        'w-full truncate font-["Outfit",sans-serif] text-[13px] font-bold leading-tight',
                        isActive ? 'text-[var(--accent-orange)]' : 'text-[var(--text-primary)]',
                      ].join(' ')}>
                        {t.title}
                      </div>
                      <PopBar level={pop} />
                    </button>

                    {/* Play / pause — right-hand side. On the active track
                        this toggles the YT player; on any other track it
                        switches + autoplays that track. */}
                    <button
                      onClick={() => v && handleSelect(t.id)}
                      disabled={!v}
                      aria-label={
                        !v ? 'Video nėra'
                        : isActivelyPlaying ? `Pauzė ${t.title}`
                        : `Leisti ${t.title}`
                      }
                      title={
                        !v ? ''
                        : isActivelyPlaying ? 'Pauzė'
                        : 'Leisti'
                      }
                      className={[
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors',
                        v
                          ? isActive
                            ? 'bg-[var(--accent-orange)] text-white shadow-[0_4px_14px_rgba(249,115,22,0.35)]'
                            : 'bg-[var(--card-bg)] text-[var(--text-primary)] hover:bg-[var(--accent-orange)] hover:text-white'
                          : 'cursor-default bg-transparent text-[var(--text-faint)] opacity-50',
                      ].join(' ')}
                    >
                      {isActivelyPlaying ? (
                        <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" aria-hidden>
                          <rect x="6" y="5" width="4" height="14" rx="1" />
                          <rect x="14" y="5" width="4" height="14" rx="1" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" aria-hidden>
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {!hasAnyVideo && (
        <div className="border-t border-[var(--border-default)] bg-[var(--bg-elevated)] px-4 py-2 text-center font-['Outfit',sans-serif] text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
          💡 Pridėk YouTube nuorodas dainoms
        </div>
      )}
    </div>
  )
}

/** Relative popularity tier for a track based on position in sorted list.
 *  Top 10% → 4, top 30% → 3, top 60% → 2, rest → 1.
 *  NB: Šis variantas — tik fallback'as kai neturime absolute like count'o. */
function popLevel(index: number, total: number): number {
  if (total <= 1) return 4
  const pct = index / (total - 1)
  if (pct <= 0.1) return 4
  if (pct <= 0.3) return 3
  if (pct <= 0.6) return 2
  return 1
}

/** Absolute popularity tier pagal track'o like_count'ą (DEPRECATED — naudoti
 *  popLevelRelative tarp atlikėjo trekų). Paliktas tik fallback'ui.
 *    0       → 0
 *    1–9     → 1
 *    10–49   → 2
 *    50–199  → 3
 *    200+    → 4
 */
function popLevelByCount(count: number): number {
  if (!count || count <= 0) return 0
  if (count >= 200) return 4
  if (count >= 50) return 3
  if (count >= 10) return 2
  return 1
}

/** Relatyvus popularity tier (5-level) — value PROPORCINGAI didžiausiajam
 *  artist'o scope'e. Kiekvienas atlikėjas turi savo HIT'us; top → 5 dashes,
 *  vidutiniai/silpnesni — proporcingai mažiau. Atlanta'os topas (53 likes)
 *  gauna 5 dashes lygiai kaip Mamontovo topas (322 likes) — abu HIT'ai
 *  savo scope'e. */
function popLevelRelative(value: number, max: number): number {
  // Jei artist'as iš viso neturi likes data (max=0), grąžinam 0 — bar'as
  // tuščias visam sąrašui (sąžiningai sako "neturime info"). Bet jei
  // bent vienas track turi like'ų, kiekvienas track gauna bent 1 dash —
  // 0-likes track'ai yra ne "trūkstami duomenys", o tikrai mažiausi
  // populiariumu. Vienoda logika visur: tas pats track tas pats bar'as,
  // nepriklausomai nuo to, kuriame tab'e ar sąraše rodosi.
  if (!max || max <= 0) return 0
  const v = value || 0
  if (v <= 0) return 1
  const pct = v / max
  if (pct >= 0.80) return 5
  if (pct >= 0.55) return 4
  if (pct >= 0.30) return 3
  if (pct >= 0.10) return 2
  return 1
}

/** Active-track indicator — 3 bars that bounce independently. We use this in
 *  place of a pause icon because we genuinely can't tell if the iframe is
 *  paused; showing "pause" would be a lie. An equalizer just says "this is
 *  the track you picked", which is always true. */
function Equalizer() {
  return (
    <span className="relative inline-flex h-4 w-4 items-end justify-center gap-[2px]" aria-hidden>
      <span
        className="w-[3px] origin-bottom rounded-[1px] bg-[var(--accent-orange)]"
        style={{ animation: 'eqBar 1.0s ease-in-out -0.20s infinite' }}
      />
      <span
        className="w-[3px] origin-bottom rounded-[1px] bg-[var(--accent-orange)]"
        style={{ animation: 'eqBar 1.0s ease-in-out -0.45s infinite' }}
      />
      <span
        className="w-[3px] origin-bottom rounded-[1px] bg-[var(--accent-orange)]"
        style={{ animation: 'eqBar 1.0s ease-in-out -0.10s infinite' }}
      />
      <style>{`@keyframes eqBar { 0%,100% { height: 30%; } 50% { height: 100%; } }`}</style>
    </span>
  )
}

/** 5-dot popularity bar. Anksčiau buvo 4 — su 5 lygiais geriau matosi
 *  skirtumai tarp top hit'o, vidutinio ir silpnesnio įrašo. */
function PopBar({ level }: { level: number }) {
  const total = 5
  return (
    <div className="mt-1 flex gap-[3px]" aria-hidden>
      {Array.from({ length: total }).map((_, i) => {
        const filled = i < level
        return (
          <span
            key={i}
            className={[
              'h-[3px] w-[14px] rounded-[2px] transition-colors',
              filled ? 'bg-[var(--accent-orange)]' : 'bg-[var(--border-default)]',
            ].join(' ')}
            style={{ opacity: filled ? 0.55 + (0.45 * (i + 1) / total) : 1 }}
          />
        )
      })}
    </div>
  )
}

// ── TrackInfoModal ─────────────────────────────────────────────────
//
// Slide-in side drawer (right edge) so the artist page + player remain
// visible behind it. Shows the track's duration, release year, like count,
// and a lyrics preview, plus a link to the full /lt/daina page.

type EntityComment = {
  legacy_id: number
  author_username: string | null
  author_avatar_url: string | null
  created_at: string | null
  content_text: string | null
  content_html: string | null
  like_count: number
}

function TrackInfoModal({
  track, artistName, artistSlug, artistThumbUrl, isSingle, onClose, onPlay,
}: {
  track: Track | null; artistName: string; artistSlug: string
  /** Artist'o profilio nuotrauka headeryje šalia title + name. Padeda
   *  vartotojui akimirksniu suprasti kontekstą (kieno ši daina). */
  artistThumbUrl?: string | null
  /** Track yra single (nepriklauso jokiam albumui)? Jei taip — release
   *  date'ą rodom orange spalva (pabrėžta), kitaip — muted. */
  isSingle?: boolean
  onClose: () => void
  /** Start playback of this track in the main player. Drawer stays open. */
  onPlay?: (t: Track) => void
}) {
  // We use an internal `mounted` flag so the slide-out animation gets a chance
  // to run before the component unmounts. When a new track replaces the
  // previous one, we re-use the mounted drawer.
  const [mounted, setMounted] = useState(false)
  // Local "self liked" toggle for the LikePill — track page'as pats turi pilną
  // optimistic-update logiką. Drawer'is paprastesnis: vizualus toggle, kad
  // user'is matytų reakciją; pilnas like persist'inimas vyksta track puslapyje.
  const [selfLiked, setSelfLiked] = useState(false)
  // Likers modal valdymas — atidarymas iš LikePill onOpenModal callback'o.
  const [likersOpen, setLikersOpen] = useState(false)
  const [likersUsers, setLikersUsers] = useState<Array<{ user_username: string; user_rank: string | null; user_avatar_url: string | null }> | null>(null)
  // Music.lt entity_comments šitai dainai
  const [comments, setComments] = useState<EntityComment[] | null>(null)
  // Ref'as komentarų sekcijai — header'io comment chip'as scroll'ina į ją.
  const commentsRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (track) {
      // Defer to next frame so the element can transition in.
      const r = requestAnimationFrame(() => setMounted(true))
      const h = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
      window.addEventListener('keydown', h)
      // Fetch comments + reset like state per naują track'ą
      setSelfLiked(false)
      setComments(null)
      fetch(`/api/tracks/${track.id}/comments`)
        .then(r => r.json())
        .then(d => setComments(d.comments || []))
        .catch(() => setComments([]))
      return () => {
        cancelAnimationFrame(r)
        window.removeEventListener('keydown', h)
      }
    }
    setMounted(false)
    return
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id])

  // Atidaryti likers modal'ą — fetch'inam list'ą per /api/likes/track/{id}
  useEffect(() => {
    if (!likersOpen || !track) { setLikersUsers(null); return }
    setLikersUsers(null)
    fetch(`/api/likes/track/${track.id}`)
      .then(r => r.json())
      .then(d => setLikersUsers(d.users || []))
      .catch(() => setLikersUsers([]))
  }, [likersOpen, track?.id])

  const handleClose = () => {
    setMounted(false)
    // Let the transition play before actually clearing the track.
    window.setTimeout(onClose, 200)
  }

  if (!track) return null

  const dur = fmtDur(track.duration)
  const year = track.release_year || (track.release_date ? new Date(track.release_date).getFullYear() : null)
  // Tikslesnė LT data, kai turim mėnesį/dieną — singlams ji rodoma
  // orange spalva (pabrėžimas), kitiems — tik metai muted.
  const ltMonths = ['sausio','vasario','kovo','balandžio','gegužės','birželio','liepos','rugpjūčio','rugsėjo','spalio','lapkričio','gruodžio']
  const fullDate = track.release_date
    ? (() => { const d = new Date(track.release_date!); return isNaN(d.getTime()) ? null : `${d.getFullYear()} m. ${ltMonths[d.getMonth()]} ${d.getDate()} d.` })()
    : (track.release_year && track.release_month ? `${track.release_year} m. ${ltMonths[track.release_month - 1]}` : null)
  const dateLabel = fullDate || (year ? `${year} m.` : null)
  const baseLikes = typeof track.like_count === 'number' ? track.like_count : 0
  const likes = baseLikes + (selfLiked ? 1 : 0)
  const lyrics = (track.lyrics || '').trim()
  const lyricsText = lyrics ? lyrics.replace(/<[^>]+>/g, '').trim() : null
  const trackHref = `/dainos/${artistSlug}-${track.slug}-${track.id}`
  const commentsCount = comments?.length ?? 0
  const scrollToComments = () => {
    commentsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    // Backdrop is intentionally subtle + click-through-friendly: we don't
    // want to block the hero/player behind the drawer. Clicking anywhere
    // outside the panel dismisses.
    <div
      className="fixed inset-0 z-[9999]"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div
        className={[
          'absolute inset-0 bg-black/30 transition-opacity duration-200',
          mounted ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
        onClick={handleClose}
      />

      <aside
        role="dialog"
        aria-label={`Apie dainą ${track.title}`}
        className={[
          'absolute left-0 top-0 flex h-full w-full max-w-[440px] flex-col border-r border-[var(--border-default)] bg-[var(--bg-surface)] shadow-[24px_0_60px_-10px_rgba(0,0,0,0.5)]',
          'transition-transform duration-200 ease-out',
          mounted ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        {/* Header — artist'o thumb + title + name + close */}
        <div className="flex items-start gap-3 border-b border-[var(--border-subtle)] px-5 py-4">
          {artistThumbUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={proxyImg(artistThumbUrl)}
              alt={artistName}
              referrerPolicy="no-referrer"
              className="h-11 w-11 shrink-0 rounded-full border border-[var(--border-subtle)] object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate font-['Outfit',sans-serif] text-[18px] font-extrabold leading-tight text-[var(--text-primary)]">
              {track.title}
            </div>
            <div className="mt-0.5 truncate text-[12px] text-[var(--text-muted)]">
              {artistName}
            </div>
          </div>
          <button
            onClick={handleClose}
            aria-label="Uždaryti"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[10px] border border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          >
            <svg viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        {/* Meta chips — LikePill + Comments (su scroll'inimu) + data + duration.
            Singlams data orange ir prominent (release moment akcentuotas);
            albume esantiems track'ams — muted year tik. */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] px-5 py-3">
          <LikePill
            likes={likes}
            selfLiked={selfLiked}
            onToggle={() => setSelfLiked(v => !v)}
            onOpenModal={() => setLikersOpen(true)}
            variant="surface"
          />
          {/* Comments chip — visi komentarų skaičius + scrolls žemyn į
              komentarų sekciją. Pellet'as visada matosi (net kai 0), kad
              vartotojas iš karto suprastų, kur palikti komentarą. */}
          <button
            type="button"
            onClick={scrollToComments}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-1.5 font-['Outfit',sans-serif] text-[12px] font-extrabold text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
            aria-label={`${commentsCount} komentarai — slinkti žemyn`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
            </svg>
            {commentsCount}
          </button>
          {dateLabel && (
            <span
              className={[
                "inline-flex items-center rounded-full border px-3 py-1.5 font-['Outfit',sans-serif] text-[12px] font-extrabold",
                isSingle
                  ? 'border-[rgba(249,115,22,0.4)] bg-[rgba(249,115,22,0.10)] text-[var(--accent-orange)]'
                  : 'border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-primary)]',
              ].join(' ')}
            >
              {dateLabel}
            </span>
          )}
          {dur && (
            <span className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-1.5 font-['Outfit',sans-serif] text-[12px] font-extrabold tabular-nums text-[var(--text-primary)]">
              {dur}
            </span>
          )}
        </div>

        {/* Body — full lyrics + comments (scrollable) */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {lyricsText ? (
            <div>
              <div className="mb-2 font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                Tekstas
              </div>
              <div className="whitespace-pre-wrap font-['DM_Sans',system-ui,sans-serif] text-[14px] leading-[1.6] text-[var(--text-primary)]">
                {lyricsText}
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-[13px] text-[var(--text-muted)]">
              Teksto dar nėra.
            </div>
          )}

          {/* Komentarai — shared EntityCommentsBlock. Renderina BOTH legacy
              entity_comments archyvą IR modern user komentarus, su composer'iu
              + replies + likes apačioj. Tas pats komponentas naudojamas album
              puslapyje + track puslapyje, kad UX visur identiškas. */}
          <div ref={commentsRef} className="mt-6 border-t border-[var(--border-subtle)] pt-5">
            <EntityCommentsBlock
              entityType="track"
              entityId={track.id}
              compact
              title="Komentarai"
            />
          </div>
        </div>

        {/* Footer actions — Play (accent) + secondary link to full page */}
        <div className="flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-5 py-3">
          {onPlay && yt(track.video_url) ? (
            <button
              type="button"
              onClick={() => onPlay(track)}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-orange)] px-4 py-2 font-['Outfit',sans-serif] text-[12px] font-extrabold text-white shadow-[0_4px_14px_rgba(249,115,22,0.35)] transition-transform hover:scale-[1.02]"
            >
              <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
              Klausyti
            </button>
          ) : <span />}
          {/* External-link icon — atidaro pilną dainos puslapį naujame tab'e
              (taip pat kaip diskusijos modal'as daro). Mažas footprint, leng-
              vai randamas, neužima erdvės bekraščiu CTA tekstu. */}
          <Link
            href={trackHref}
            target="_blank"
            rel="noopener"
            title="Atidaryti dainos puslapį"
            aria-label="Atidaryti dainos puslapį"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          >
            <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 3h7v7M21 3l-9 9M5 5h6M5 5v14h14v-6" />
            </svg>
          </Link>
        </div>
      </aside>

      {/* Likers modal — atsidaro paspaudus LikePill count'ą. Z-index aukštesnis
          už drawer'į, kad būtų matomas viršuje. */}
      {likersOpen && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-5"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={() => setLikersOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="max-h-[80vh] w-full max-w-[520px] overflow-auto rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]"
          >
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
              <div className="font-['Outfit',sans-serif] text-[13px] font-extrabold">
                Patiko dainą
                {likersUsers && <span className="ml-2 text-[11px] text-[var(--text-muted)]">({likersUsers.length})</span>}
              </div>
              <button
                onClick={() => setLikersOpen(false)}
                aria-label="Uždaryti"
                className="text-[18px] text-[var(--text-muted)]"
              >✕</button>
            </div>
            <div className="px-4 py-3">
              {likersUsers === null ? (
                <div className="py-7 text-center text-[12px] text-[var(--text-faint)]">Kraunama…</div>
              ) : likersUsers.length === 0 ? (
                <div className="py-7 text-center text-[12px] text-[var(--text-faint)]">Nėra žinomų užliejusių (likers nebuvo importuoti)</div>
              ) : (
                <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))' }}>
                  {likersUsers.map(u => (
                    <div key={u.user_username} className="flex items-center gap-2 rounded-lg bg-[var(--card-hover)] p-1.5">
                      {u.user_avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={proxyImg(u.user_avatar_url)} alt="" className="h-[26px] w-[26px] flex-shrink-0 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-full bg-[rgba(99,102,241,0.18)] font-['Outfit',sans-serif] text-[10px] font-bold text-[#818cf8]">
                          {u.user_username.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-[12px] font-bold text-[var(--text-primary)]">{u.user_username}</div>
                        {u.user_rank && <div className="truncate text-[10px] text-[var(--text-faint)]">{u.user_rank}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
  // artistSlug is kept for future deep-links (e.g. "More from artist")
  void artistSlug
}

function TabButton({ active, disabled, onClick, children }: {
  active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        'relative border-0 bg-transparent px-4 py-3 font-["Outfit",sans-serif] text-[12px] font-extrabold uppercase tracking-[0.14em] transition-colors',
        active ? 'text-[var(--accent-orange)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
        disabled ? 'cursor-not-allowed opacity-30' : 'cursor-pointer',
      ].join(' ')}
    >
      {children}
      {active && (
        <span className="absolute -bottom-px left-3 right-3 h-[2px] rounded-full bg-[var(--accent-orange)]" />
      )}
    </button>
  )
}

// ── Hero: split photo + player, title + likes below title ──────────

function Hero({
  artist, heroImage, loaded, likes, selfLiked, onToggleLike, onOpenLikersModal, selfLikePending,
  tracksAllTime, tracksTrending, activeTrackId, onSelectTrack,
  playing, onRequestPlay, onOpenTrackInfo, hasAnyVideo,
  upcomingEvents, onOpenEventsModal,
}: {
  artist: any; heroImage: string | null; loaded: boolean
  likes: number; selfLiked?: boolean
  onToggleLike: () => void; onOpenLikersModal: () => void; selfLikePending: boolean
  tracksAllTime: Track[]; tracksTrending: Track[]
  activeTrackId: number | null; onSelectTrack: (id: number) => void
  playing: boolean; onRequestPlay: () => void
  onOpenTrackInfo: (t: Track) => void
  hasAnyVideo: boolean
  upcomingEvents: any[]
  onOpenEventsModal: () => void
}) {
  const coverPos = parseCoverPos(artist.cover_image_position || 'center 30%')
  // Adaptyvus hero foto plotis pagal nuotraukos aspect ratio. Anksčiau buvo
  // fixed 420px — gerai portrait'ui, blogai landscape'ui (kraštai nukerpa
  // svarbias dalis). Dabar aptinkam natural dimensions per onLoad ir
  // pritaikom konteinerio plotį:
  //   portrait  (ratio < 0.85)  → 380px (tall narrow)
  //   square    (~0.85–1.30)    → 480px (balansuota)
  //   landscape (ratio > 1.30)  → 720px (wide short)
  const [heroWidth, setHeroWidth] = useState<number>(480)  // default for SSR
  const handleHeroLoad = (ev: React.SyntheticEvent<HTMLImageElement>) => {
    const el = ev.currentTarget
    const w = el.naturalWidth
    const h = el.naturalHeight
    if (!w || !h) return
    const r = w / h
    if (r < 0.85) setHeroWidth(380)
    else if (r > 1.30) setHeroWidth(720)
    else setHeroWidth(480)
  }

  return (
    <section className="relative isolate w-full bg-[var(--bg-surface)]">
      {/* Photo backdrop:
          - Mobile: aspect-[3/2] — siauresnis nei aspect-video, mažiau
            upscale artifact'ų low-res nuotraukoms.
          - Desktop: foto plotis adaptyvus pagal natural aspect ratio
            (portrait 380, square 480, landscape 720) — kraštai nukerpa
            mažiau svarbių dalių, kompozicija išlieka. */}
      <div
        className="relative aspect-[3/2] w-full overflow-hidden bg-black lg:absolute lg:inset-y-0 lg:left-0 lg:right-auto lg:aspect-auto lg:w-[var(--hero-w,480px)]"
        style={{ ['--hero-w' as any]: `${heroWidth}px` } as React.CSSProperties}
      >
        {heroImage ? (
          <>
            {/* Layer 1 — strong blur backdrop (visada matomas kraštuose).
                Maskuoja low-res music.lt thumb upscale artifacts kai original
                paveiksliukis mažas (~600px). */}
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                backgroundImage: `url(${proxyImg(heroImage)})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                filter: 'blur(60px) saturate(1.3) brightness(0.85)',
                transform: 'scale(1.3)',
              }}
            />
            {/* Layer 2 — pati nuotrauka. Subtle blur (1.2px) maskuoja pixel
                grain, contrast/saturate boost suteikia gylį.
                NB: object-cover paliekamas, kad išlaikytų cinematic full-bleed
                hero look. Pridėjus blur(1.2px) — pikseliai susilieja į švelnią
                tekstūrą, nebėra kvadratuko grid'o efekto kuris matosi ant 200px
                upscaling'o iki 1500px. Žiūrovas mato profesionaliai
                "softfocus" tipo nuotrauką, ne pixelated artefaktą. */}
            <img
              id="hero-photo"
              src={proxyImg(heroImage)}
              alt={artist.name}
              referrerPolicy="no-referrer"
              onLoad={handleHeroLoad}
              onClick={() => {
                if (typeof window === 'undefined') return
                if (window.innerWidth < 1024) return
                const el = document.getElementById('galerija')
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              className="relative block h-full w-full animate-[apHeroZoom_36s_ease-in-out_infinite_alternate] cursor-zoom-in object-cover"
              style={{
                objectPosition: `${coverPos.x}% ${coverPos.y}%`,
                transformOrigin: `${coverPos.x}% ${coverPos.y}%`,
                // Anksčiau čia buvo `filter: blur(1.2px)` — turėjo maskuoti
                // pixel grain'ą upscale'inant. Bet su sumažintu hero plotiu
                // upscale'inimas jau minimalus, o blur'as faktiškai pablogina
                // kokybę (ypač mobile). Pašalinta — saturate/contrast palikta
                // šiek tiek pagilinti spalvas.
                filter: 'saturate(1.1) contrast(1.03)',
                imageRendering: 'auto',
              }}
            />
          </>
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-[#1a2436] to-[#0a0f1a]" />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
        {/* Mobile: soft fade at the bottom edge into the page surface so the
            photo doesn't end in a hard horizontal line. Hidden on desktop
            where the right-side fade takes care of blending. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[30%] bg-gradient-to-t from-[var(--bg-surface)] via-[var(--bg-surface)]/70 to-transparent lg:hidden" />
        {/* Desktop overlay — foto dešinė pusė blend'inama į solid bg per
            ~120px gradient juostą. Foto kontaineris yra fix 420px, juosta
            sėdi paskutiniuose 120px ir glotniai pereina į background. */}
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[120px] bg-gradient-to-r from-transparent to-[var(--bg-surface)] lg:block" />
      </div>

      <style>{`@keyframes apHeroZoom{0%{transform:scale(1.02)}100%{transform:scale(1.08)}}`}</style>

      <div
        className={[
          'relative mx-auto grid max-w-[1400px] grid-cols-1 gap-6 px-4 pb-6 pt-5 sm:px-6 lg:gap-6 lg:min-h-[440px] lg:items-end lg:px-10 lg:py-8',
          // Layout greta photo'os (kuri yra absolute). Grid kolonos
          // priklauso nuo:
          //   1) Ar yra player'is (hasAnyVideo)
          //   2) Ar yra renginių (hasUpcomingEvents)
          // Kombinacijos:
          //   yra abu → [title 1fr | events 280px | player 460px]
          //   yra player, ne renginiai → [title 1fr | player 460px] (be 280px slot'o)
          //   yra renginiai, ne player → [title 1fr | events 280px]
          //   nei vieno → [title 1fr]
          // items-end + per-col self-end — content prie apačios.
          (hasAnyVideo && upcomingEvents.length > 0)
            ? 'lg:grid-cols-[1fr_280px_460px]'
            : hasAnyVideo
            ? 'lg:grid-cols-[1fr_460px]'
            : upcomingEvents.length > 0
            ? 'lg:grid-cols-[1fr_280px]'
            : '',
        ].join(' ')}
      >
        {/* Title column — title + likes. Be padding offset'o, todėl ant
            desktop'o overlap'ina su photo'os area kairėje (kaip senuose
            cinematic hero layout'uose). */}
        <div
          className={[
            'flex min-w-0 flex-col justify-end gap-4 lg:self-end',
            'transition-[opacity,transform] duration-700 ease-out',
            loaded ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
          ].join(' ')}
        >
          <h1
            className="font-['Outfit',sans-serif] font-black leading-[0.95] tracking-[-0.04em] text-[var(--text-primary)] lg:text-white lg:drop-shadow-[0_6px_32px_rgba(0,0,0,0.8)]"
            style={{ fontSize: 'clamp(2rem,4vw,3.25rem)' }}
          >
            {artist.name}
            {artist.is_verified && (
              <span className="ml-3 inline-flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#3b82f6] to-[#1d4ed8] align-middle shadow-[0_4px_16px_rgba(59,130,246,0.5)] sm:h-8 sm:w-8">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
            </span>
            )}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <LikePill
              likes={likes}
              selfLiked={selfLiked}
              onToggle={onToggleLike}
              onOpenModal={onOpenLikersModal}
              pending={selfLikePending}
              variant="light"
            />
          </div>
        </div>

        {/* Events column (desktop) — kompaktiškas vertikalus stack'as
            tarp title ir player'io. self-end + mb-0 → kortelė priklijuojama
            prie apačios, lygiuotis su player'io apačia. Mobile lieka
            horizontal scroll žemiau (atskira sekcija). */}
        {upcomingEvents.length > 0 && (() => {
          const MAX_VISIBLE = 1
          const hasOverflow = upcomingEvents.length > MAX_VISIBLE
          const desktopVisible = hasOverflow ? upcomingEvents.slice(0, MAX_VISIBLE) : upcomingEvents
          const overflow = upcomingEvents.length - desktopVisible.length
          return (
            // self-stretch (override grid items-end) — kad event card galėtų
            // užimti pilną grid row'o aukštį ir lygiuotis su player'iu.
            // Vidinis `flex-col` su `flex-1` ant kortelės wrapper'io
            // perduoda aukštį žemyn į pačią kortelę.
            <div className="hidden flex-col gap-2 lg:flex lg:self-stretch">
              <div className="font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/85">
                Artimiausi renginiai
              </div>
              {/* flex-1 wrapper'is — kad kortelė augintų aukštį iki
                  parent'o stretch dydžio (lygiavimas su player'iu). */}
              {desktopVisible.map((e: any) => (
                <div key={e.id} className="flex min-h-[260px] flex-1 flex-col">
                  <EventCard e={e} variant="vertical" />
                </div>
              ))}
              {hasOverflow && (
                <button
                  type="button"
                  onClick={onOpenEventsModal}
                  className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-[rgba(249,115,22,0.4)] bg-[rgba(249,115,22,0.06)] px-3 py-2 text-[11px] font-extrabold text-[var(--accent-orange)] transition-all hover:border-[rgba(249,115,22,0.7)] hover:bg-[rgba(249,115,22,0.10)]"
                >
                  Žiūrėti visus +{overflow}
                </button>
              )}
            </div>
          )
        })()}

        {/* Player column — only rendered when the artist has at least one
            track with a YouTube URL. Without videos the right column would
            be a sad "Video dar nėra" placeholder, so we drop it entirely
            and let the hero breathe. */}
        {hasAnyVideo && (
        <div
          className={[
            'flex min-w-0 lg:items-center',
            'transition-[opacity,transform] duration-700 delay-150 ease-out',
            loaded ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
          ].join(' ')}
        >
          <div className="w-full">
            <PlayerCard
              tracksAllTime={tracksAllTime}
              tracksTrending={tracksTrending}
              activeTrackId={activeTrackId}
              onSelectTrack={onSelectTrack}
              playing={playing}
              onRequestPlay={onRequestPlay}
              onOpenTrackInfo={onOpenTrackInfo}
              hasAnyVideo={hasAnyVideo}
            />
          </div>
        </div>
        )}
      </div>

      {/* Mobile-only events strip — horizontal snap scroll po hero.
          Desktop'e events yra grid'o 2-oje kolonoje, todėl čia paslėpta. */}
      {upcomingEvents.length > 0 && (
        <div className="mx-auto max-w-[1400px] px-4 pb-4 sm:px-6 lg:hidden">
          <div className="mb-2 font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--accent-orange)]">
            Artimiausi renginiai
          </div>
          <div
            className="flex items-stretch gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{
              scrollSnapType: 'x mandatory',
              scrollPaddingLeft: '1rem',
              overscrollBehaviorX: 'contain',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {upcomingEvents.map((e: any) => (
              <div
                key={e.id}
                className="flex w-[86%] shrink-0"
                style={{ scrollSnapAlign: 'start' }}
              >
                <EventCard e={e} variant="upcoming" />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

// ── SideInfo: card beside bio with Kilmė / Stilius / Klausyk ───────

function SideInfo({
  artist, flag, genres, substyles, ranks, links, website, horizontal = false,
}: {
  artist: any; flag: string; genres: Genre[]; substyles: Genre[]
  ranks: Rank[]
  links: { platform: string; url: string }[]; website?: string | null
  /** When true, renders the info card as a horizontal wrap-flow so it can
   *  sit as a full-width strip instead of a tall right sidebar. Used when
   *  bio is short/empty to avoid wasted vertical space. */
  horizontal?: boolean
}) {
  const countryRank = ranks.find(r => r.scope === 'country')
  const genreRank = ranks.find(r => r.scope === 'genre')
  const globalRank = ranks.find(r => r.scope === 'global')
  const hasSocials = links.some(l => SOC[l.platform]) || !!website

  // ── Bio facts: veiklos periodas + gimimo/mirties datos + amžius ──
  // Music.lt teikia visus tris laukus (active_from, birth_date, death_date)
  // ir mes juos importuojam, bet seniau jų niekur nerodėm. Skaičiavimai:
  //   - solo gyvas:  amžius = today.year - birth_year (su tikslia mėnesio/dienos correction)
  //   - solo miręs:  gyveno = death_year - birth_year (-1 jei nebuvo dar gimtadienio)
  //   - grupė:        veiklos pradžia – pabaiga (arba "dabar")
  const isSolo = artist.type === 'solo'
  const yearsBetween = (from: number, until?: number | null): number => {
    const end = until ?? new Date().getFullYear()
    const n = end - from
    return n >= 0 ? n : 0
  }
  const activeYears = artist.active_from ? yearsBetween(artist.active_from, artist.active_until) : 0
  const yearsActiveRange = artist.active_from
    ? `${artist.active_from}–${artist.active_until || 'dabar'}`
    : null
  // "(43 m.)" rodom atskirai — kaip muted tail po pagrindinio reikšmės teksto,
  // kad pagrindinis stilius išliktų vieningas su likusiu sidebar'iu.
  const yearsActiveTail = activeYears > 0 ? `${activeYears} m.` : null
  const ageFromBirth = (birth: string, end?: string | null): number | null => {
    const b = new Date(birth)
    if (isNaN(b.getTime())) return null
    const e = end ? new Date(end) : new Date()
    if (isNaN(e.getTime())) return null
    let age = e.getFullYear() - b.getFullYear()
    const m = e.getMonth() - b.getMonth()
    if (m < 0 || (m === 0 && e.getDate() < b.getDate())) age -= 1
    return age >= 0 && age <= 130 ? age : null
  }
  // Lithuanian-style "1971 m. balandžio 19 d." formatas — daug labiau natural
  // negu ISO. Mėnuo kilmininku.
  const LT_MONTH_GENITIVE = [
    'sausio', 'vasario', 'kovo', 'balandžio', 'gegužės', 'birželio',
    'liepos', 'rugpjūčio', 'rugsėjo', 'spalio', 'lapkričio', 'gruodžio',
  ]
  const fmtLtDate = (iso: string): string => {
    const d = new Date(iso); if (isNaN(d.getTime())) return iso
    return `${d.getFullYear()} m. ${LT_MONTH_GENITIVE[d.getMonth()]} ${d.getDate()} d.`
  }
  // Zodiac iš gimimo datos. Naudojam Unicode astrologines glifas su U+FE0E
  // text-presentation selektoriumi — kad naršyklės renderintų jas kaip
  // monochrome simbolį (currentColor), o ne spalvotą emoji. Tai integruojasi
  // su likusiu UI (visi label'iai uppercase muted, jokios brand'intos
  // emoji spalvos).
  const TEXT_VARIATION = '︎'
  const zodiacOf = (iso: string): { name: string; glyph: string } | null => {
    const d = new Date(iso); if (isNaN(d.getTime())) return null
    const m = d.getMonth() + 1, day = d.getDate()
    const cmp = (mm: number, dd: number, mm2: number, dd2: number) =>
      (m === mm && day >= dd) || (m === mm2 && day <= dd2)
    if (cmp(3, 21, 4, 19)) return { name: 'Avinas', glyph: '♈' + TEXT_VARIATION }
    if (cmp(4, 20, 5, 20)) return { name: 'Jautis', glyph: '♉' + TEXT_VARIATION }
    if (cmp(5, 21, 6, 20)) return { name: 'Dvyniai', glyph: '♊' + TEXT_VARIATION }
    if (cmp(6, 21, 7, 22)) return { name: 'Vėžys', glyph: '♋' + TEXT_VARIATION }
    if (cmp(7, 23, 8, 22)) return { name: 'Liūtas', glyph: '♌' + TEXT_VARIATION }
    if (cmp(8, 23, 9, 22)) return { name: 'Mergelė', glyph: '♍' + TEXT_VARIATION }
    if (cmp(9, 23, 10, 22)) return { name: 'Svarstyklės', glyph: '♎' + TEXT_VARIATION }
    if (cmp(10, 23, 11, 21)) return { name: 'Skorpionas', glyph: '♏' + TEXT_VARIATION }
    if (cmp(11, 22, 12, 21)) return { name: 'Šaulys', glyph: '♐' + TEXT_VARIATION }
    if ((m === 12 && day >= 22) || (m === 1 && day <= 19)) return { name: 'Ožiaragis', glyph: '♑' + TEXT_VARIATION }
    if (cmp(1, 20, 2, 18)) return { name: 'Vandenis', glyph: '♒' + TEXT_VARIATION }
    if (cmp(2, 19, 3, 20)) return { name: 'Žuvys', glyph: '♓' + TEXT_VARIATION }
    return null
  }
  // birthLine'as turi 3 dalis: label ('Gimimo data'), pagrindinis date string,
  // ir tail su amžium "(58 m.)" — pastarasis renderinamas muted, kad būtų
  // matomas, bet nebūtų vienodos svarbos kaip pati data.
  const birthLine: {
    label: string
    main: string
    tail: string | null
    zodiac: { name: string; glyph: string } | null
  } | null = isSolo && artist.birth_date
    ? (() => {
        const yr = ageFromBirth(artist.birth_date, artist.death_date)
        const z = zodiacOf(artist.birth_date)
        if (artist.death_date) {
          const lived = ageFromBirth(artist.birth_date, artist.death_date)
          return {
            label: 'Gyveno',
            main: `${fmtLtDate(artist.birth_date)} – ${fmtLtDate(artist.death_date)}`,
            tail: lived != null ? `${lived} m.` : null,
            zodiac: z,
          }
        }
        return {
          label: 'Gimimo data',
          main: fmtLtDate(artist.birth_date),
          tail: yr != null ? `${yr} m.` : null,
          zodiac: z,
        }
      })()
    : null
  // Solo artist'ams paslėpiam "Veiklos pradžia" row'ą jei jis sutampa su
  // birth_date metais (kartais music.lt užrašo veiklos = gimimo data,
  // kas neinformatyvu).
  const showActive = !!yearsActiveRange && !(isSolo && artist.birth_date && artist.active_from === new Date(artist.birth_date).getFullYear())
  const hasBioFacts = !!birthLine || showActive

  const Label = ({ children }: { children: React.ReactNode }) => (
    <div className="mb-2 font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]">
      {children}
    </div>
  )
  const RankChip = ({ n }: { n: number }) => (
    <span className="inline-flex items-center rounded-full bg-[rgba(249,115,22,0.14)] px-2 py-0.5 font-['Outfit',sans-serif] text-[11px] font-extrabold text-[var(--accent-orange)]">
      #{n}
    </span>
  )

  // ── Horizontal variant — single wrapping row ──────────────────────
  // Primary row: country + main genre + socials. Substyles get their own
  // subtle line below so the top row stays clean on mobile where a long
  // substyle list otherwise wraps awkwardly into the genre cell.
  if (horizontal) {
    return (
      <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 sm:gap-x-6">
          {artist.country && (
            <div className="flex items-baseline gap-2">
              {countryRank && <RankChip n={countryRank.rank} />}
              <span className="inline-flex items-baseline gap-1.5 font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--text-primary)]">
                <span>{artist.country}</span>
                <span className="text-[16px] leading-none">{flag}</span>
              </span>
            </div>
          )}
          {genres[0] && (
            <div className="flex items-baseline gap-2">
              {genreRank && <RankChip n={genreRank.rank} />}
              <span className="font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--text-primary)]">
                {genres[0].name}
              </span>
            </div>
          )}
          {globalRank && (
            <div className="flex items-baseline gap-2">
              <RankChip n={globalRank.rank} />
              <span className="font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--text-primary)]">Pasaulyje</span>
            </div>
          )}
          {hasSocials && (
            <div className="ml-auto flex items-center gap-1.5">
              {links.filter(l => SOC[l.platform]).map(l => {
                const p = SOC[l.platform]
                return (
                  <a
                    key={l.platform}
                    href={l.url}
                    target="_blank"
                    rel="noopener"
                    title={p.l}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
                  >
                    <svg viewBox="0 0 24 24" fill={p.c || 'currentColor'} width="14" height="14" className={p.c ? '' : 'text-[var(--text-primary)]'}><path d={p.d} /></svg>
                  </a>
                )
              })}
              {website && (() => {
                let domain = ''
                try { domain = new URL(website).host.replace(/^www\./, '') } catch { domain = website }
                return (
                  <a
                    href={website}
                    target="_blank"
                    rel="noopener"
                    title="Oficiali svetainė"
                    className="flex h-9 items-center gap-1.5 rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] px-3 text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" /></svg>
                    <span className="font-['Outfit',sans-serif] text-[12.5px] font-bold tracking-tight">{domain}</span>
                  </a>
                )
              })()}
            </div>
          )}
        </div>
        {/* Substyles on their own subtle line so the top row stays clean. */}
        {substyles.length > 0 && (
          <div className="mt-2 text-[12px] leading-[1.5] text-[var(--text-muted)]">
            {substyles.map(s => s.name).join(' · ')}
          </div>
        )}
        {/* Bio facts: veiklos periodas + gimimo/mirties data + amžius
            (+ zodiakas). Visi teksto stiliai vieningi su likusiu strip'u —
            Outfit, no italic, no spalvotos emoji. */}
        {hasBioFacts && (
          <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12px] leading-[1.5] text-[var(--text-muted)]">
            {showActive && (
              <span className="inline-flex items-baseline gap-1.5">
                <span className="font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--text-faint)]">Veikla</span>
                <span className="font-['Outfit',sans-serif] text-[13px] font-bold text-[var(--text-primary)]">{yearsActiveRange}</span>
                {yearsActiveTail && (
                  <span className="font-['Outfit',sans-serif] text-[12px] font-medium text-[var(--text-muted)]">({yearsActiveTail})</span>
                )}
              </span>
            )}
            {birthLine && (
              <span className="inline-flex items-baseline gap-1.5">
                <span className="font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--text-faint)]">{birthLine.label}</span>
                <span className="font-['Outfit',sans-serif] text-[13px] font-bold text-[var(--text-primary)]">{birthLine.main}</span>
                {birthLine.tail && (
                  <span className="font-['Outfit',sans-serif] text-[12px] font-medium text-[var(--text-muted)]">({birthLine.tail})</span>
                )}
                {birthLine.zodiac && (
                  <span title={birthLine.zodiac.name} aria-label={birthLine.zodiac.name} className="ml-0.5 text-[14px] leading-none text-[var(--accent-orange)]">
                    {birthLine.zodiac.glyph}
                  </span>
                )}
              </span>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Vertical variant — sidebar card ──────────────────────────────
  // h-fit + self-start — kortelė nesistump'ina, kad atitiktų bio aukštį.
  // Anksčiau buvo `h-full min-h-[200px]` ir kortelė tempėsi į grid row'o
  // aukštį, paliekant tarpą jei bio trumpas. Dabar — kompaktiška, content-
  // sized: jei bio ilgas, kortelė lieka apačioj; jei trumpas — abu kartu.
  return (
    <aside className="flex h-fit flex-col gap-4 self-start rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5">
      {/* Country — rank chip first, then name, then flag after. Keeps the
          text baselines flush-left between country + genre rows. */}
      {artist.country && (
        <div className="flex flex-wrap items-baseline gap-2">
          {countryRank && <RankChip n={countryRank.rank} />}
          <span className="inline-flex items-baseline gap-1.5 font-['Outfit',sans-serif] text-[15px] font-bold text-[var(--text-primary)]">
            <span>{artist.country}</span>
            <span className="text-[17px] leading-none">{flag}</span>
          </span>
        </div>
      )}

      {/* Main genre — rank chip first, then name, then substyles below */}
      {genres[0] && (
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {genreRank && <RankChip n={genreRank.rank} />}
            <span className="font-['Outfit',sans-serif] text-[15px] font-bold text-[var(--text-primary)]">
              {genres[0].name}
            </span>
          </div>
          {substyles.length > 0 && (
            <div className="mt-1.5 text-[12px] leading-[1.5] text-[var(--text-muted)]">
              {substyles.map(s => s.name).join(' · ')}
            </div>
          )}
        </div>
      )}

      {globalRank && (
        <div className="flex items-center gap-2">
          <RankChip n={globalRank.rank} />
          <span className="font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--text-primary)]">Pasaulyje</span>
        </div>
      )}

      {/* Bio facts: veiklos periodas + gimimo/mirties data (+ amžius +
          zodiakas). Stilius vieningas su likusiu sidebar'iu — Outfit
          everywhere; "(43 m.)" / "(58 m.)" kaip muted tail po pagrindinės
          reikšmės; zodiakas — monochrome simbolis (U+FE0E text-presentation),
          spalvos tos pačios kaip text-faint, ne emoji. */}
      {hasBioFacts && (
        <div className="flex flex-col gap-2.5">
          {showActive && (
            <div>
              <div className="font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--text-faint)]">Veikla</div>
              <div className="mt-0.5 font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--text-primary)]">
                {yearsActiveRange}
                {yearsActiveTail && (
                  <span className="ml-1.5 font-medium text-[12.5px] text-[var(--text-muted)]">({yearsActiveTail})</span>
                )}
              </div>
            </div>
          )}
          {birthLine && (
            <div>
              <div className="font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--text-faint)]">{birthLine.label}</div>
              <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--text-primary)]">
                <span>{birthLine.main}</span>
                {birthLine.tail && (
                  <span className="font-medium text-[12.5px] text-[var(--text-muted)]">({birthLine.tail})</span>
                )}
                {birthLine.zodiac && (
                  <span
                    title={birthLine.zodiac.name}
                    aria-label={birthLine.zodiac.name}
                    className="ml-1 text-[15px] leading-none text-[var(--accent-orange)]"
                  >
                    {birthLine.zodiac.glyph}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {hasSocials && (
        <div className="mt-auto pt-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {links.filter(l => SOC[l.platform]).map(l => {
              const p = SOC[l.platform]
              return (
                <a
                  key={l.platform}
                  href={l.url}
                  target="_blank"
                  rel="noopener"
                  title={p.l}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
                >
                  <svg viewBox="0 0 24 24" fill={p.c || 'currentColor'} width="13" height="13" className={p.c ? '' : 'text-[var(--text-primary)]'}><path d={p.d} /></svg>
                </a>
              )
            })}
            {website && (() => {
              // Domain'ą rodom šalia globe ikonos — vienas pliokštas pill'as,
              // ne tuščias kvadratukas. host'as be www. ir be path'o, kad
              // sidebar'e nesusispaustų ant ilgų URL'ų.
              let domain = ''
              try { domain = new URL(website).host.replace(/^www\./, '') } catch { domain = website }
              return (
                <a
                  href={website}
                  target="_blank"
                  rel="noopener"
                  title="Oficiali svetainė"
                  className="flex h-8 items-center gap-1.5 rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] px-2.5 text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" /></svg>
                  <span className="font-['Outfit',sans-serif] text-[12px] font-bold tracking-tight">{domain}</span>
                </a>
              )
            })()}
          </div>
        </div>
      )}
    </aside>
  )
}

// ── BioPreview + MembersInline ─────────────────────────────────────

function BioPreview({ html, onOpen, maxChars = 700 }: { html: string; onOpen: () => void; maxChars?: number }) {
  const plain = stripHtml(html)
  // Nicer cut at last word boundary within maxChars so the preview doesn't end mid-word.
  let excerpt = plain.slice(0, maxChars)
  if (plain.length > maxChars) {
    const lastSpace = excerpt.lastIndexOf(' ')
    if (lastSpace > maxChars * 0.8) excerpt = excerpt.slice(0, lastSpace)
  }
  const isLong = plain.length > maxChars
  return (
    <div className="text-[15px] leading-[1.72] text-[var(--text-secondary)]">
      {excerpt}{isLong && '…'}
      {isLong && (
        <>
          {' '}
          <button
            onClick={onOpen}
            className="inline-flex items-center gap-1 font-['Outfit',sans-serif] text-[13px] font-bold text-[var(--accent-orange)] transition-colors hover:text-[color-mix(in_srgb,var(--accent-orange)_80%,#fff)]"
          >
            Skaityti daugiau →
          </button>
        </>
      )}
    </div>
  )
}

function MembersInline({ members }: { members: Member[] }) {
  if (!members.length) return null
  return (
    <div className="mt-5 flex flex-wrap gap-2">
      <span className="mr-1 inline-flex items-center font-['Outfit',sans-serif] text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]">
        Nariai
      </span>
      {members.map(m => (
        <Link
          key={m.id}
          href={`/atlikejai/${m.slug}`}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] py-1 pl-1 pr-3 no-underline transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
        >
          {m.cover_image_url ? (
            <img src={proxyImg(m.cover_image_url)} alt={m.name} className="h-7 w-7 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--cover-placeholder)] font-['Outfit',sans-serif] text-[11px] font-black text-[var(--text-faint)]">
              {m.name[0]}
            </div>
          )}
          <span className="font-['Outfit',sans-serif] text-[13px] font-bold text-[var(--text-primary)]">{m.name}</span>
          {m.member_from && (
            <span className="text-[11px] font-semibold text-[var(--text-muted)]">{m.member_from}–{m.member_until || 'dabar'}</span>
          )}
        </Link>
      ))}
    </div>
  )
}

// ── GalleryCollage (beside bio) ────────────────────────────────────

function GalleryCollage({
  photos, totalCount, onOpen, onScrollToFull,
}: {
  photos: Photo[]
  totalCount: number
  onOpen: (i: number) => void           // mobile: lightbox
  onScrollToFull: () => void             // desktop: scroll to galerija
}) {
  if (photos.length === 0) return null
  const shown = photos.slice(0, 4)
  const extra = totalCount - shown.length

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 overflow-hidden rounded-2xl">
        {shown.map((p, i) => {
          const isLast = i === shown.length - 1
          const showOverlay = isLast && extra > 0
          return (
            <button
              key={i}
              onClick={() => {
                if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
                  onScrollToFull()
                } else {
                  onOpen(i)
                }
              }}
              className="group relative block aspect-[4/3] overflow-hidden rounded-xl border-0 bg-transparent p-0"
            >
              <img
                src={proxyImg(p.url)}
                alt={p.caption || ''}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              />
              {showOverlay && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-[1px] transition-colors group-hover:bg-black/45">
                  <span className="font-['Outfit',sans-serif] text-[24px] font-black text-white">
                    +{extra}
                  </span>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Lightbox ───────────────────────────────────────────────────────

/** Parse the photo's caption into a clean { author, source } pair.
 *
 *  The scraper saves a JSON blob in `caption`, shaped {"a": "...", "s": "..."}:
 *    a = author + license label (e.g. "Brianhphoto · CC BY-SA 4.0")
 *    s = source URL (Wikipedia, Flickr, etc.)
 *
 *  Hand-entered captions are plain strings — pass them through. Anything
 *  unparseable falls back to the raw string (or null). */
function parsePhotoCaption(raw?: string): { author: string | null; sourceUrl: string | null; sourceHost: string | null; plain: string | null } {
  if (!raw) return { author: null, sourceUrl: null, sourceHost: null, plain: null }
  const trimmed = raw.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const j = JSON.parse(trimmed)
      const author = typeof j.a === 'string' ? j.a : null
      const sourceUrl = typeof j.s === 'string' ? j.s : null
      let sourceHost: string | null = null
      if (sourceUrl) {
        try { sourceHost = new URL(sourceUrl).hostname.replace(/^www\./, '') } catch {}
      }
      return { author, sourceUrl, sourceHost, plain: null }
    } catch {}
  }
  return { author: null, sourceUrl: null, sourceHost: null, plain: trimmed }
}

/** Lightbox caption renderer — compact: author as a link to their showcase,
 *  source URL as an icon-only button (no visible domain). */
function PhotoCredit({ photo }: { photo: Photo }) {
  const parsed = parsePhotoCaption(photo.caption)
  // Prefer structured DB fields when present; fall back to parsed caption.
  const author = photo.photographer_name || parsed.author
  const sourceUrl = photo.source_url || parsed.sourceUrl
  const authorHref = photo.photographer_slug ? `/fotografas/${photo.photographer_slug}` : null
  const year = photoYear(photo.taken_at)

  if (!author && !sourceUrl && !parsed.plain && !year) return null
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[12px] text-white/60">
      {parsed.plain && <span>{parsed.plain}</span>}
      {author && (
        authorHref ? (
          <a
            href={authorHref}
            target="_blank"
            rel="noopener"
            onClick={(e) => e.stopPropagation()}
            className="text-white/85 underline decoration-white/30 underline-offset-2 hover:text-white hover:decoration-white/80"
            title={`Visos ${author} nuotraukos`}
          >
            {author}
          </a>
        ) : (
          <span className="text-white/80">{author}</span>
        )
      )}
      {year && <span className="text-white/50">· {year}</span>}
      {sourceUrl && (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/70 transition-colors hover:border-white/30 hover:text-white"
          title="Originalas"
          aria-label="Nuotraukos šaltinis"
        >
          <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <path d="M15 3h6v6" />
            <path d="M10 14L21 3" />
          </svg>
        </a>
      )}
    </div>
  )
}

function Lightbox({
  photos, index, onClose, onIndex,
}: {
  photos: Photo[]
  index: number
  onClose: () => void
  onIndex: (i: number) => void
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1)
      if (e.key === 'ArrowRight' && index < photos.length - 1) onIndex(index + 1)
    }
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', h)
      document.body.style.overflow = ''
    }
  }, [index, photos.length, onClose, onIndex])

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/95 p-4 backdrop-blur-xl"
      onClick={onClose}
    >
      <button
        onClick={e => { e.stopPropagation(); onClose() }}
        className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full border-0 bg-white/10 text-xl text-white/70 transition-colors hover:bg-white/20"
      >
        ✕
      </button>
      {index > 0 && (
        <button
          onClick={e => { e.stopPropagation(); onIndex(index - 1) }}
          className="absolute left-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border-0 bg-white/10 text-3xl text-white/70 transition-colors hover:bg-white/20 sm:left-6"
        >
          ‹
        </button>
      )}
      <div className="flex max-h-[90vh] max-w-[92vw] flex-col items-center" onClick={e => e.stopPropagation()}>
        <img src={proxyImg(photos[index].url)} alt="" className="max-h-[82vh] max-w-full rounded-lg object-contain" />
        <PhotoCredit photo={photos[index]} />
      </div>
      {index < photos.length - 1 && (
        <button
          onClick={e => { e.stopPropagation(); onIndex(index + 1) }}
          className="absolute right-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border-0 bg-white/10 text-3xl text-white/70 transition-colors hover:bg-white/20 sm:right-6"
        >
          ›
        </button>
      )}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 font-['Outfit',sans-serif] text-[12px] font-bold text-white/40">
        {index + 1}/{photos.length}
      </div>
    </div>
  )
}

// ── MasonryGallery ─────────────────────────────────────────────────

function MasonryGallery({ photos, onOpen }: { photos: Photo[]; onOpen: (i: number) => void }) {
  const limited = photos.slice(0, 24)
  if (!limited.length) return null
  // CSS-columns masonry — flows naturally by image aspect ratio, no JS
  // measurement, no layout shift, images keep their true shape. Simpler
  // and tidier than a row/col-span grid.
  return (
    <div className="columns-2 gap-2 sm:columns-3 md:gap-3 lg:columns-4">
      {limited.map((p, i) => {
        const year = photoYear(p.taken_at)
        return (
          <button
            key={i}
            onClick={() => onOpen(i)}
            className="group relative mb-2 block w-full overflow-hidden rounded-xl border-0 bg-transparent p-0 md:mb-3"
            style={{ breakInside: 'avoid' }}
          >
            <img
              src={proxyImg(p.url)}
              alt={parsePhotoCaption(p.caption).author || ''}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="block w-full cursor-zoom-in object-cover transition-transform duration-500 group-hover:scale-[1.02]"
            />
            {year && (
              <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/70 px-1.5 py-0.5 font-['Outfit',sans-serif] text-[10px] font-bold text-white backdrop-blur-sm">
                {year}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── EventCard ──────────────────────────────────────────────────────

/** Vertical event card su adaptyviu image aukščiu pagal natural ratio.
 *  Vertikalus poster'is (Atlanta, Mamontovas) gauna aukštesnį konteinerį,
 *  kad matytusi visas vaizdas, ne nukirptas. Landscape gauna trumpesnį.
 *  Bound'ai: 0.5 (ekstremalus portrait) - 1.6 (16:10 landscape). */
function EventVerticalCard({ e, href, hasCover, setCoverFailed, d, venue }: {
  e: any
  href: string
  hasCover: boolean
  setCoverFailed: (v: boolean) => void
  d: Date
  venue: string
}) {
  // BUVO: aspectRatio state'as buvo update'inamas img.onLoad callback'e
  // pagal naturalWidth/Height — dėl to atsirasdavo race: pirmu render'iu
  // kortelė matuodavosi 1.6 (default landscape), o po to, kai
  // browser'is iškodavo paveiksliuką, ratio'as keisdavo'si į 0.66
  // (portrait), ir kortelė pakildavo aukštyn. Cache'inta nuotrauka
  // suload'indavo sync ir race nepasimatydavo, ne-cache'inta — pasimatydavo.
  //
  // DABAR: kortelė užima pilną parent'o aukštį (`h-full`), image area
  // — `flex-1 min-h-0` su `object-cover`. Niekas nepriklauso nuo image
  // dimensijų; kortelė yra deterministinė ir lygiuojama su player'iu
  // (kuris yra pagrindinis aukštį-nustatantis grid'o item'as).
  return (
    <Link
      href={href}
      className="group flex h-full w-full flex-col overflow-hidden rounded-xl border border-[rgba(249,115,22,0.3)] no-underline transition-all hover:-translate-y-0.5 hover:border-[rgba(249,115,22,0.55)] hover:shadow-[0_8px_22px_rgba(249,115,22,0.18)]"
      style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.12), rgba(249,115,22,0.02) 70%), var(--bg-elevated)' }}
    >
      <div className="relative min-h-[160px] w-full flex-1 overflow-hidden bg-gradient-to-br from-[rgba(249,115,22,0.18)] to-[rgba(249,115,22,0.05)]">
        {/* Fallback: calendar icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" className="text-[var(--accent-orange)]/40">
            <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        {hasCover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={proxyImg(e.cover_image_url)}
            alt={e.title}
            referrerPolicy="no-referrer"
            onError={() => setCoverFailed(true)}
            onLoad={(ev) => {
              // Music.lt placeholder PNG (~100x100) detection — jei
              // nuotrauka per maža, traktuojam kaip broken ir rodom
              // calendar fallback'ą.
              const el = ev.currentTarget as HTMLImageElement
              if (el.naturalWidth && el.naturalWidth < 200) setCoverFailed(true)
            }}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-1.5 px-3.5 py-3">
        <div className="font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--accent-orange)]">
          {formatLtDate(d)}
        </div>
        <div className="line-clamp-2 font-['Outfit',sans-serif] text-[14px] font-bold leading-snug text-[var(--text-primary)]">{e.title}</div>
        {venue && <div className="line-clamp-1 text-[12px] text-[var(--text-secondary)]">📍 {venue}</div>}
      </div>
    </Link>
  )
}

function EventCard({ e, variant = 'upcoming' }: { e: any; variant?: 'upcoming' | 'past' | 'compact' | 'vertical' }) {
  const d = new Date(e.start_date)
  const venue = [e.venue_name, e.city].filter(Boolean).join(', ')
  const href = `/renginiai/${e.slug}`
  const monthShort = d.toLocaleDateString('lt-LT', { month: 'short' }).replace('.', '')
  const [coverFailed, setCoverFailed] = useState(false)
  // Music.lt event cover URL'ai TURI realius poster image'us
  // (/renginiai/NN/images/renginiai/NN/<eid>.jpg). Anksčiau buvo blanket
  // filter visiems music.lt URL'ams — klaidinga. Dabar tik onError fallback
  // jei URL'as broken'ija; visi kiti rodomi.
  const hasCover = !!e.cover_image_url && !coverFailed

  if (variant === 'past') {
    return (
      <Link
        href={href}
        className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 no-underline transition-all hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
      >
        <div className="flex min-w-[64px] flex-col items-center justify-center rounded-lg bg-[var(--card-bg)] px-2 py-1.5 text-center">
          <span className="font-['Outfit',sans-serif] text-[9px] font-bold leading-tight text-[var(--text-muted)]">{d.getFullYear()}</span>
          <span className="font-['Outfit',sans-serif] text-[10px] font-bold capitalize leading-tight text-[var(--text-muted)]">{monthShort}</span>
          <span className="font-['Outfit',sans-serif] text-[20px] font-black leading-none text-[var(--text-primary)]">{d.getDate()}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-bold leading-tight text-[var(--text-primary)]">{e.title}</div>
          {venue && <div className="mt-0.5 truncate text-[12px] text-[var(--text-muted)]">{venue}</div>}
        </div>
      </Link>
    )
  }

  if (variant === 'vertical') {
    return <EventVerticalCard e={e} href={href} hasCover={hasCover} setCoverFailed={setCoverFailed} d={d} venue={venue} />
  }

  if (variant === 'compact') {
    // Compact sidebar variant — used when upcoming events sit in a narrow
    // right column beside the bio. Big date block + title, no hero image
    // (sidebar is too narrow to make it flattering).
    return (
      <Link
        href={href}
        className="group flex items-stretch gap-3 overflow-hidden rounded-2xl border border-[rgba(249,115,22,0.3)] p-3 no-underline transition-all hover:-translate-y-0.5 hover:border-[rgba(249,115,22,0.55)] hover:shadow-[0_10px_28px_rgba(249,115,22,0.15)]"
        style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.18), rgba(249,115,22,0.04) 70%), var(--bg-elevated)' }}
      >
        <div className="flex min-w-[62px] flex-col items-center justify-center rounded-xl bg-[rgba(249,115,22,0.15)] px-2 py-2 text-center">
          <span className="font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase leading-tight text-[var(--accent-orange)]">{monthShort}</span>
          <span className="font-['Outfit',sans-serif] text-[26px] font-black leading-none text-[var(--text-primary)]">{d.getDate()}</span>
          <span className="mt-0.5 font-['Outfit',sans-serif] text-[9px] font-bold text-[var(--text-muted)]">{d.getFullYear()}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <div className="font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--accent-orange)]">
            Artimiausias renginys
          </div>
          <div className="mt-1 line-clamp-2 font-['Outfit',sans-serif] text-[14px] font-bold leading-snug text-[var(--text-primary)]">
            {e.title}
          </div>
          {venue && (
            <div className="mt-1 truncate text-[12px] text-[var(--text-secondary)]">📍 {venue}</div>
          )}
        </div>
      </Link>
    )
  }

  // Upcoming event card — horizontal layout. Image on the left (~40% width),
  // date + title + venue on the right. We keep the compact footprint but the
  // card is a bit taller so text has breathing room. Date moved out of the
  // image overlay so it reads naturally with the title.
  return (
    <Link
      href={href}
      className="group flex min-h-[130px] w-full items-stretch gap-0 overflow-hidden rounded-2xl border border-[rgba(249,115,22,0.25)] no-underline transition-all hover:-translate-y-0.5 hover:border-[rgba(249,115,22,0.5)] hover:shadow-[0_12px_32px_rgba(249,115,22,0.15)]"
      style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.16), rgba(249,115,22,0.04) 70%), var(--bg-elevated)' }}
    >
      {/* Cover area: backdrop fallback ALWAYS rendered (calendar + orange
          gradient). img layer ant viršaus jei yra cover_image_url. Jei img
          krenta — slepiam su display:none, ir matosi backdrop. Vengiame
          conditional rendering kuris paliktų browser native broken-image
          ikoną iki onError fire. */}
      <div className="relative w-[42%] min-w-[120px] max-w-[190px] shrink-0 overflow-hidden bg-gradient-to-br from-[rgba(249,115,22,0.18)] to-[rgba(249,115,22,0.05)]">
        {/* Always-on fallback layer */}
        <div className="absolute inset-0 flex items-center justify-center">
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" className="text-[var(--accent-orange)]/40">
            <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        {hasCover && (
          <img
            src={proxyImg(e.cover_image_url)}
            alt={e.title}
            referrerPolicy="no-referrer"
            onError={(ev) => {
              setCoverFailed(true)
              ;(ev.currentTarget as HTMLImageElement).style.display = 'none'
            }}
            onLoad={(ev) => {
              // Music.lt event default placeholder: 100x100 white square ar pan.
              // Patikrinam realias dimensijas — jei akivaizdus stub'as, slepiam.
              const el = ev.currentTarget as HTMLImageElement
              if (el.naturalWidth < 80 || el.naturalHeight < 80) {
                el.style.display = 'none'
              }
            }}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        )}
      </div>

      {/* Right: date + title + venue. Extra vertical padding keeps the card
          from feeling squashed while still remaining compact. */}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 px-4 py-4 sm:px-5">
        <div className="font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--accent-orange)]">
          {formatLtDate(d)}
        </div>
        <div className="line-clamp-2 font-['Outfit',sans-serif] text-[14px] font-bold leading-snug text-[var(--text-primary)] sm:text-[15px]">
          {e.title}
        </div>
        {venue && (
          <div className="line-clamp-2 text-[12px] leading-snug text-[var(--text-secondary)]">
            📍 {venue}
          </div>
        )}
      </div>
    </Link>
  )
}

// ── MoreEventsTile + EventsModal ───────────────────────────────────
//
// Shown when there are more upcoming events than we can fit inline in the
// hero. Clicking opens a portal modal with every event at larger size.

function MoreEventsTile({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center justify-center gap-2 overflow-hidden rounded-2xl border border-dashed border-[rgba(249,115,22,0.4)] bg-gradient-to-br from-[rgba(249,115,22,0.05)] to-transparent px-5 py-5 transition-all hover:-translate-y-0.5 hover:border-[rgba(249,115,22,0.7)] hover:bg-[rgba(249,115,22,0.08)]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-orange)] text-white shadow-[0_4px_14px_rgba(249,115,22,0.35)]">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </span>
      <span className="text-left">
        <span className="block font-['Outfit',sans-serif] text-[15px] font-extrabold text-[var(--accent-orange)]">
          +{count}
        </span>
        <span className="block text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
          daugiau renginių
        </span>
      </span>
    </button>
  )
}

function EventsModal({
  open, events, onClose,
}: { open: boolean; events: any[]; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', h)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-8"
      style={{ background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex max-h-[90vh] w-full max-w-[1100px] flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.6)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-4">
          <div>
            <div className="font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Artimiausi renginiai
            </div>
            <div className="mt-0.5 font-['Outfit',sans-serif] text-[17px] font-extrabold text-[var(--text-primary)]">
              {events.length} renginiai
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Uždaryti"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] border border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          >
            <svg viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((e: any) => <EventBigCard key={e.id} e={e} />)}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Larger hero-style event card used inside EventsModal so the full list
 *  showcases each event with cover art + more visual weight. */
function EventBigCard({ e }: { e: any }) {
  const d = new Date(e.start_date)
  const venue = [e.venue_name, e.city].filter(Boolean).join(', ')
  const href = `/renginiai/${e.slug}`
  const longDate = formatLtDate(d, { long: true })
  const [coverFailed, setCoverFailed] = useState(false)
  // Music.lt event cover URL'ai TURI realius poster image'us
  // (/renginiai/NN/images/renginiai/NN/<eid>.jpg). Anksčiau buvo blanket
  // filter visiems music.lt URL'ams — klaidinga. Dabar tik onError fallback
  // jei URL'as broken'ija; visi kiti rodomi.
  const hasCover = !!e.cover_image_url && !coverFailed
  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-2xl border border-[rgba(249,115,22,0.25)] no-underline transition-all hover:-translate-y-0.5 hover:border-[rgba(249,115,22,0.5)] hover:shadow-[0_12px_32px_rgba(249,115,22,0.15)]"
      style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.16), rgba(249,115,22,0.04) 70%), var(--bg-elevated)' }}
    >
      {hasCover ? (
        <div className="relative aspect-[16/9] overflow-hidden">
          <img
            src={proxyImg(e.cover_image_url)}
            alt={e.title}
            referrerPolicy="no-referrer"
            onError={() => setCoverFailed(true)}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
        </div>
      ) : (
        <div className="flex aspect-[16/9] items-center justify-center bg-[rgba(249,115,22,0.1)]">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" className="text-[var(--accent-orange)]/40">
            <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
      <div className="p-4">
        <div className="font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.1em] text-[var(--accent-orange)]">
          {longDate}
        </div>
        <div className="mt-1 line-clamp-2 font-['Outfit',sans-serif] text-[15px] font-bold leading-snug text-[var(--text-primary)] sm:text-[16px]">{e.title}</div>
        {venue && <div className="mt-1 truncate text-[12px] text-[var(--text-secondary)] sm:text-[13px]">📍 {venue}</div>}
      </div>
    </Link>
  )
}

// ── MobileFilterRow ────────────────────────────────────────────────
// A compact mobile filter bar: shows "Visi įrašai" + any active filters +
// a "…" toggle that reveals the full chip list. Desktop keeps the full
// chip wrap (rendered separately above).

type FilterItem = { key: string; label: string; count: number }

function MobileFilterRow({
  all, items, activeFilters, onToggle,
}: {
  all: FilterItem
  items: FilterItem[]
  activeFilters: Set<string>
  onToggle: (k: string) => void
}) {
  const [open, setOpen] = useState(false)
  // Treat "all" as implicit when nothing else is selected.
  const activeOthers = items.filter((i) => activeFilters.has(i.key))
  const allActive = activeFilters.has('all')
  const visible: FilterItem[] = allActive
    ? [all]
    : activeOthers.length > 0
      ? activeOthers
      : [all]

  const Chip = ({ item, active }: { item: FilterItem; active: boolean }) => (
    <button
      onClick={() => onToggle(item.key)}
      className={[
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-["Outfit",sans-serif] text-[12px] font-bold transition-all',
        active
          ? 'border-[var(--accent-orange)] bg-[var(--accent-orange)] text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)]'
          : 'border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]',
      ].join(' ')}
    >
      {item.label}
      <span className={active ? 'text-white/80' : 'text-[var(--text-faint)]'}>· {item.count}</span>
    </button>
  )

  return (
    <div className="mb-5 sm:hidden">
      <div className="flex flex-wrap items-center gap-1.5">
        {visible.map((item) => (
          <Chip key={item.key} item={item} active={activeFilters.has(item.key) || (item.key === 'all' && allActive)} />
        ))}
        <button
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
          aria-label="Daugiau filtrų"
          title="Daugiau filtrų"
          className={[
            'flex h-8 w-8 items-center justify-center rounded-full border transition-colors',
            open
              ? 'border-[var(--accent-orange)] bg-[rgba(249,115,22,0.15)] text-[var(--accent-orange)]'
              : 'border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]',
          ].join(' ')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </button>
      </div>
      {open && (
        <div className="mt-2 flex flex-wrap gap-1.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
          <Chip item={all} active={allActive} />
          {items.map((item) => (
            <Chip key={item.key} item={item} active={activeFilters.has(item.key)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── AlbumCard ──────────────────────────────────────────────────────

function AlbumCard({ a, popularity, artistSlug, maxPop }: { a: Album; popularity?: number; artistSlug?: string; maxPop?: number }) {
  const type = aType(a)
  const href = artistSlug ? `/albumai/${artistSlug}-${a.slug}-${a.id}` : `/albumai/${a.slug}-${a.id}`
  const [coverFailed, setCoverFailed] = useState(false)
  const coverUrl = (a as any).cover_image_url
  const showCover = !!coverUrl && !coverFailed
  // Album popularity: relative tier per ATLIKĖJO max. PRIORITY like_count —
  // tikras hit indicator'ius (Mamontovo Geltona = 107 likes, Paleisk = 0).
  // Score'as cluster'inasi (~17-18 kone visiems), todėl tik fallback.
  const albumScore = (a as any).score
  const albumLikes = (a as any).like_count
  const value = typeof albumLikes === 'number' && albumLikes > 0
    ? albumLikes
    : (typeof albumScore === 'number' ? albumScore : 0)
  const albumPop = (maxPop && maxPop > 0)
    ? popLevelRelative(value, maxPop)
    : (typeof popularity === 'number' ? popularity : 0)
  return (
    <Link href={href} className="group block no-underline">
      <div className="relative overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--cover-placeholder)] shadow-[0_4px_12px_rgba(0,0,0,0.25)] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-[rgba(249,115,22,0.5)] group-hover:shadow-[0_14px_32px_rgba(249,115,22,0.18)]">
        <div className="aspect-square">
          {showCover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={proxyImg(coverUrl)}
              alt={a.title}
              referrerPolicy="no-referrer"
              loading="lazy"
              onError={() => setCoverFailed(true)}
              className="h-full w-full object-cover transition-all duration-500 group-hover:scale-[1.06]"
              style={{ filter: 'saturate(1.05) contrast(1.02)' }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl text-[var(--text-faint)]">💿</div>
          )}
          {/* Subtle hover gradient overlay — orange tint nuo apačios kai
              hover'inama. Pridėta vaizdo gylio. */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[rgba(249,115,22,0.12)] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        </div>
        {type !== 'Studijinis' && (
          <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 font-['Outfit',sans-serif] text-[8px] font-extrabold uppercase tracking-wider text-white backdrop-blur-sm">
            {type}
          </span>
        )}
        {a.year && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 font-['Outfit',sans-serif] text-[9px] font-bold text-white backdrop-blur-sm">
            {a.year}
          </span>
        )}
      </div>
      <div className="mt-1.5 px-0.5">
        <div className="truncate font-['Outfit',sans-serif] text-[11px] font-bold text-[var(--text-primary)] sm:text-[12px]">{a.title}</div>
        {albumPop > 0 && <PopBar level={albumPop} />}
      </div>
    </Link>
  )
}

// ── TrackRow: compact row for orphan tracks (no big placeholder square) ─

function TrackRow({ t, popularity, artistSlug }: { t: Track; popularity?: number; artistSlug?: string }) {
  const v = yt(t.video_url)
  // YT video availability — dead video grąžina 120x90 placeholder PNG.
  // Naudojam tos pačios cover img'os onLoad — be papildomų request'ų.
  const [vidDead, setVidDead] = useState(false)
  const showPlay = !!v && !vidDead
  // Cover priority: explicit track.cover_url > YT thumbnail (jei video gyvas).
  // Jei cover_url nera ir YT dead — coverNet'as null, rodom music ikoną
  // (same kaip dainai be video). Anksčiau dead YT placeholder PNG'as
  // (mažytis 120x90 stub'as) buvo rodomas — atrodė kaip broken icon.
  const ytCover = v ? `https://img.youtube.com/vi/${v}/mqdefault.jpg` : null
  const cover = t.cover_url || (vidDead ? null : ytCover)
  // Canonical URL su artist prefix'u jei perduotas; antraip page redirect'ins.
  const href = artistSlug
    ? `/dainos/${artistSlug}-${t.slug}-${t.id}`
    : `/dainos/${t.slug}-${t.id}`
  return (
    <Link
      href={href}
      className="group flex items-center gap-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2 no-underline transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
    >
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-[var(--cover-placeholder)]">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={proxyImg(cover)}
            alt={t.title}
            className="h-full w-full object-cover"
            onLoad={(ev) => {
              if (!v || t.cover_url) return  // turime savo cover — nereikia probe
              const el = ev.currentTarget as HTMLImageElement
              // YT dead video thumbnail: 120x90, live: 320x180 (mqdefault).
              if (el.naturalWidth > 0 && el.naturalWidth < 200) setVidDead(true)
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[var(--text-faint)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" /></svg>
          </div>
        )}
        {showPlay && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/45 group-hover:opacity-100">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent-orange)] shadow-[0_4px_12px_rgba(249,115,22,0.5)]">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
            </div>
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-['Outfit',sans-serif] text-[12px] font-bold text-[var(--text-primary)] sm:text-[13px]">
          {t.title}
        </div>
        {typeof popularity === 'number' && <PopBar level={popularity} />}
      </div>
    </Link>
  )
}

// ── DiscussionRow: title + last post preview on the right ──────────

/** UserAvatar — real avatar URL when available, otherwise tinted initial.
 *  Used in DiscussionRow / DiscussionThreadModal. Falls back to initial bubble
 *  if image URL fails to load. */
function UserAvatar({ name, avatarUrl, size = 22 }: { name: string; avatarUrl?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false)
  if (avatarUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={proxyImg(avatarUrl)}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full object-cover"
      />
    )
  }
  return <AvatarBubble name={name} size={size} />
}

/** Discussion preview card — 3 per row desktop. Po pavadinimu rodo iki 2
 *  paskutinių komentarų teaser'ių (avatar + author + 2-eilutė preview).
 *  Apačioje — orange "N komentarų" link'as vietoj corner chip'o, kad iš
 *  kortelės būtų aišku kiek diskusijoje yra komentarų.
 *
 *  Click — atidaro slide-in modal'ą su pilnu thread'u; navigacija į
 *  /diskusijos/tema/... yra fallback'as kai prop'as `onOpen` neperduotas.
 */
function DiscussionRow({ t, onOpen }: { t: LegacyThread; isLast?: boolean; onOpen?: (t: LegacyThread) => void }) {
  const title = t.title || slugToForumTitle(t.slug)
  const pc = t.post_count ?? 0
  const recent = (t.recent_posts && t.recent_posts.length > 0)
    ? t.recent_posts
    : (t.last_post ? [t.last_post] : [])

  const sharedClassName = 'group flex h-full flex-col gap-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-3 text-left no-underline transition-all hover:-translate-y-0.5 hover:border-[var(--border-default)] hover:bg-[var(--bg-hover)] hover:shadow-sm'

  const inner = (
    <>
      {/* Title — fixed 2-line block (min-h reserves space) so visually
          all cards align even when title is single-line. */}
      <div
        className="font-['Outfit',sans-serif] text-[13.5px] font-bold leading-snug text-[var(--text-primary)] line-clamp-2"
        style={{ minHeight: '2.6em' }}
      >
        {title}
      </div>

      {/* Comments preview — iki 2 paskutinių, su realiais avatarais. */}
      <div className="flex flex-1 flex-col gap-2">
        {recent.length === 0 ? (
          <div className="text-[11.5px] leading-tight text-[var(--text-faint)]">Dar nekomentuota</div>
        ) : (
          recent.map((p, i) => {
            const text = stripHtml(p.body || '').slice(0, 140)
            const author = p.author_username || 'Anonimas'
            return (
              <div key={i} className="flex items-start gap-2 border-t border-[var(--border-subtle)] pt-2 first:border-t-0 first:pt-0">
                <UserAvatar name={author} avatarUrl={p.author_avatar_url} size={20} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-['Outfit',sans-serif] text-[10.5px] font-bold text-[var(--text-secondary)]">
                    {author}
                  </div>
                  <div className="line-clamp-2 text-[11.5px] leading-snug text-[var(--text-muted)]">
                    {text}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Orange "N komentarų" link apačioj — pakeičia corner chip'ą,
          aiškus call to action į pilną diskusiją. */}
      {pc > 0 && (
        <div className="border-t border-[var(--border-subtle)] pt-2">
          <span className="font-['Outfit',sans-serif] text-[11.5px] font-extrabold text-[var(--accent-orange)] group-hover:underline">
            {pc} {pc === 1 ? 'komentaras' : (pc < 10 ? 'komentarai' : 'komentarų')} →
          </span>
        </div>
      )}
    </>
  )

  if (onOpen) {
    return (
      <button type="button" onClick={() => onOpen(t)} className={sharedClassName}>
        {inner}
      </button>
    )
  }
  return (
    <Link href={`/diskusijos/tema/${t.legacy_id}`} className={sharedClassName}>
      {inner}
    </Link>
  )
}

/** DiscussionThreadModal — slide-in LEFT drawer su pilnu thread'u.
 *  Idėja kaip ir TrackInfoModal: kontekstas (artist hero) lieka užkulisiuose,
 *  vartotojas perskaito visus komentarus + uždaro be naujo page load'o.
 *  Komentarai keliauja per /api/threads/[legacy_id]/posts — su realiais
 *  avatarais. Sortinimas (newest / oldest / popular) viršuje, sticky
 *  comment input apačioje. */
function DiscussionThreadModal({
  thread, onClose,
}: { thread: LegacyThread | null; onClose: () => void }) {
  const [mounted, setMounted] = useState(false)
  const [posts, setPosts] = useState<Array<{
    legacy_id: number
    author_username: string | null
    author_avatar_url: string | null
    created_at: string | null
    content_text: string
    content_html: string | null
    like_count?: number | null
  }> | null>(null)
  const [sort, setSort] = useState<'oldest' | 'newest' | 'popular'>('newest')
  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState<{ author: string; text: string } | null>(null)
  const [attached, setAttached] = useState<AttachmentHit[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const draftRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (thread) {
      const r = requestAnimationFrame(() => setMounted(true))
      const h = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
      window.addEventListener('keydown', h)
      setPosts(null)
      setDraft('')
      setReplyTo(null)
      setSort('newest')
      setAttached([])
      setShowPicker(false)
      fetch(`/api/threads/${thread.legacy_id}/posts`)
        .then(r => r.json())
        .then(d => setPosts(d.posts || []))
        .catch(() => setPosts([]))
      document.body.style.overflow = 'hidden'
      return () => {
        cancelAnimationFrame(r)
        window.removeEventListener('keydown', h)
        document.body.style.overflow = ''
      }
    }
    setMounted(false)
    return
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.legacy_id])

  const handleClose = () => {
    setMounted(false)
    window.setTimeout(onClose, 200)
  }

  // Sort'inam jau gautus posts'us in-memory (visi 500 jau pull'inami).
  // Server'is grąžina chronologically asc — tai default 'oldest'.
  const sortedPosts = useMemo(() => {
    if (!posts) return null
    const arr = [...posts]
    if (sort === 'newest') {
      arr.sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0
        return tb - ta
      })
    } else if (sort === 'popular') {
      arr.sort((a, b) => (b.like_count || 0) - (a.like_count || 0))
    }
    return arr
  }, [posts, sort])

  if (!thread) return null

  const title = thread.title || slugToForumTitle(thread.slug)
  const pc = thread.post_count ?? (posts?.length ?? 0)

  const SortChip = ({ k, label }: { k: 'oldest' | 'newest' | 'popular'; label: string }) => (
    <button
      type="button"
      onClick={() => setSort(k)}
      className={[
        'rounded-full px-3 py-1 font-["Outfit",sans-serif] text-[11px] font-extrabold transition-colors',
        sort === k
          ? 'bg-[var(--accent-orange)] text-white'
          : 'border border-[var(--border-subtle)] bg-transparent text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]',
      ].join(' ')}
    >
      {label}
    </button>
  )

  return (
    <div
      className="fixed inset-0 z-[9999]"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div
        className={[
          'absolute inset-0 bg-black/30 transition-opacity duration-200',
          mounted ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
        onClick={handleClose}
      />

      <aside
        role="dialog"
        aria-label={title}
        className={[
          'absolute left-0 top-0 flex h-full w-full max-w-[520px] flex-col border-r border-[var(--border-default)] bg-[var(--bg-surface)] shadow-[24px_0_60px_-10px_rgba(0,0,0,0.5)]',
          'transition-transform duration-200 ease-out',
          mounted ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-[var(--border-subtle)] px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              Diskusija
            </div>
            <h2 className="mt-1 font-['Outfit',sans-serif] text-[17px] font-extrabold leading-tight text-[var(--text-primary)]">
              {title}
            </h2>
            {pc > 0 && (
              <div className="mt-1 font-['Outfit',sans-serif] text-[11.5px] font-extrabold text-[var(--accent-orange)]">
                {pc} {pc === 1 ? 'komentaras' : (pc < 10 ? 'komentarai' : 'komentarų')}
              </div>
            )}
          </div>
          <a
            href={`/diskusijos/tema/${thread.legacy_id}`}
            target="_blank"
            rel="noopener"
            title="Atidaryti pilname puslapyje"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          >
            <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 3h7v7M21 3l-9 9M5 5h6M5 5v14h14v-6" />
            </svg>
          </a>
          <button
            onClick={handleClose}
            aria-label="Uždaryti"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          >
            <svg viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        {/* Sort row */}
        <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 px-5 py-2.5">
          <span className="font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--text-muted)]">Rūšiuoti</span>
          <SortChip k="oldest" label="Seniausi" />
          <SortChip k="newest" label="Naujausi" />
          <SortChip k="popular" label="Populiariausi" />
        </div>

        {/* Posts list */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {sortedPosts === null && (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 w-full animate-pulse rounded-lg bg-[var(--bg-elevated)]" />
              ))}
            </div>
          )}
          {sortedPosts !== null && sortedPosts.length === 0 && (
            <div className="py-12 text-center text-[12px] text-[var(--text-faint)]">Komentarų nėra.</div>
          )}
          {sortedPosts && sortedPosts.length > 0 && (
            <ul className="flex flex-col gap-3">
              {sortedPosts.map((p) => {
                const author = p.author_username || 'Anonimas'
                const html = (p.content_html && p.content_html.trim()) || ''
                const plainText = (p.content_text && String(p.content_text).trim()) || (html ? stripHtml(html) : '')
                const dateStr = p.created_at ? formatPostDate(p.created_at) : null
                const likeCount = p.like_count || 0
                return (
                  <li key={p.legacy_id} className="flex items-start gap-2.5 border-b border-[var(--border-subtle)] pb-3 last:border-b-0 last:pb-0">
                    <UserAvatar name={author} avatarUrl={p.author_avatar_url} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="font-['Outfit',sans-serif] text-[12px] font-extrabold text-[var(--text-secondary)]">
                          {author}
                        </span>
                        {dateStr && (
                          <span className="font-['Outfit',sans-serif] text-[10.5px] font-medium tabular-nums text-[var(--text-faint)]">
                            {dateStr}
                          </span>
                        )}
                      </div>
                      {/* Body — render HTML if present (quotes, emojis from
                          music.lt). Stripped of dangerous tags via sanitize.
                          Plain text fallback when no HTML. */}
                      {html ? (
                        <div
                          className="forum-html mt-1 break-words text-[13px] leading-relaxed text-[var(--text-primary)]"
                          dangerouslySetInnerHTML={{ __html: sanitizeForumHtml(html) }}
                        />
                      ) : (
                        <div className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[var(--text-primary)]">
                          {plainText}
                        </div>
                      )}
                      {/* Footer — like count + reply button */}
                      <div className="mt-2 flex items-center gap-3">
                        <span
                          className={[
                            'inline-flex items-center gap-1 font-["Outfit",sans-serif] text-[11px] font-extrabold',
                            likeCount > 0 ? 'text-[var(--accent-orange)]' : 'text-[var(--text-faint)]',
                          ].join(' ')}
                          aria-label={`${likeCount} patiko`}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                          {likeCount}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setReplyTo({ author, text: plainText.slice(0, 200) })
                            // Focus textarea after state update.
                            requestAnimationFrame(() => draftRef.current?.focus())
                          }}
                          className="inline-flex items-center gap-1 font-['Outfit',sans-serif] text-[11px] font-extrabold text-[var(--text-muted)] transition-colors hover:text-[var(--accent-orange)]"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="9 14 4 9 9 4" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" /></svg>
                          Atsakyti
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Forum HTML styles — quote nesting, emoji image sizing, paragraph
            spacing. Scoped to .forum-html via :global() pattern below. */}
        <style jsx global>{`
          .forum-html p { margin: 0 0 0.6em 0; }
          .forum-html p:last-child { margin-bottom: 0; }
          .forum-html br + br { display: none; }
          .forum-html img { display: inline-block; vertical-align: middle; max-height: 18px; width: auto; }
          .forum-html .quote1 {
            padding-left: 10px;
            border-left: 3px solid var(--accent-orange) !important;
            margin: 6px 0 8px 0 !important;
            background: var(--bg-elevated);
            border-radius: 4px;
            padding: 6px 10px;
            color: var(--text-muted);
            font-size: 12px;
          }
          .forum-html .quote1 b { color: var(--text-secondary); }
          .forum-html em { font-style: italic; }
          .forum-html a { color: var(--accent-orange); text-decoration: none; }
          .forum-html a:hover { text-decoration: underline; }
        `}</style>

        {/* Sticky comment composer. Reply pill rodom virš textarea kai
            replyTo set'as — paspaudus X grįžtam į paprastą composer'į. */}
        <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 py-3">
          {replyTo && (
            <div className="mb-2 flex items-start gap-2 rounded-lg border border-[rgba(249,115,22,0.3)] bg-[rgba(249,115,22,0.06)] px-3 py-2">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="mt-0.5 shrink-0 text-[var(--accent-orange)]"><polyline points="9 14 4 9 9 4" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" /></svg>
              <div className="min-w-0 flex-1">
                <div className="font-['Outfit',sans-serif] text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-[var(--accent-orange)]">
                  Atsakant: {replyTo.author}
                </div>
                <div className="mt-0.5 line-clamp-2 text-[11.5px] text-[var(--text-muted)]">
                  {replyTo.text}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                aria-label="Atšaukti atsakymą"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--text-faint)] transition-colors hover:text-[var(--text-primary)]"
              >
                <svg viewBox="0 0 16 16" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M3 3l10 10M13 3L3 13" />
                </svg>
              </button>
            </div>
          )}
          {/* Music attachment chips, jei kažką jau pridėjom */}
          {attached.length > 0 && (
            <div className="mb-2">
              <AttachmentChips
                items={attached}
                onRemove={(idx) => setAttached(a => a.filter((_, i) => i !== idx))}
                compact
              />
            </div>
          )}
          {/* Toggle'inamas search picker'is — atskira eilutė virš textarea */}
          {showPicker && (
            <div className="mb-2">
              <MusicSearchPicker
                attached={attached}
                onAdd={(hit) => setAttached(a => [...a, hit])}
                placeholder="Surask atlikėją, albumą ar dainą..."
                compact
              />
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={draftRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={replyTo ? `Atsakyti @${replyTo.author}...` : 'Rašyk komentarą...'}
              rows={2}
              className="flex-1 resize-none rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-[13px] leading-snug text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--accent-orange)]"
            />
            <div className="flex flex-col gap-1">
              {/* Music attach toggle — natural place šalia textarea, kad
                  vartotojas iš karto matytų galimybę pridėti dainą. */}
              <button
                type="button"
                onClick={() => setShowPicker(v => !v)}
                aria-label={showPicker ? 'Slėpti muzikos paiešką' : 'Pridėti muzikos'}
                title={showPicker ? 'Slėpti' : 'Pridėti muzikos'}
                className={[
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors',
                  showPicker
                    ? 'border-[var(--accent-orange)] bg-[rgba(249,115,22,0.12)] text-[var(--accent-orange)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]',
                ].join(' ')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" /></svg>
              </button>
              <button
                type="button"
                onClick={async () => {
                  const text = draft.trim()
                  if (!text && attached.length === 0) return
                  const finalText = replyTo
                    ? `${replyTo.author} rašė:\n${replyTo.text}\n\n${text}`
                    : text
                  try {
                    const res = await fetch('/api/forum-posts', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        thread_legacy_id: thread.legacy_id,
                        text: finalText || ' ',
                        attachments: attached,
                      }),
                    })
                    if (res.ok) {
                      setDraft('')
                      setReplyTo(null)
                      setAttached([])
                      setShowPicker(false)
                      fetch(`/api/threads/${thread.legacy_id}/posts`)
                        .then(r => r.json())
                        .then(d => setPosts(d.posts || []))
                        .catch(() => {})
                    }
                  } catch { /* silent */ }
                }}
                disabled={!draft.trim() && attached.length === 0}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-orange)] text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Siųsti"
                title="Siųsti"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2z" /></svg>
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}

/** Modalas su pilnu diskusijų sąrašu — atidaromas iš public artist
 *  puslapio, kai threadų yra daugiau nei rodoma preview grid'e. Layout'as
 *  toks pat kaip preview'e (3-col grid kortelių su 2 komentarais), tik
 *  scroll'inamas. */
function DiscussionsModal({
  open, threads, onClose, onOpenThread,
}: { open: boolean; threads: LegacyThread[]; onClose: () => void; onOpenThread?: (t: LegacyThread) => void }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', h)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-8"
      style={{ background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex max-h-[90vh] w-full max-w-[1100px] flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.6)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-4">
          <div>
            <div className="font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Diskusijos
            </div>
            <div className="mt-0.5 font-['Outfit',sans-serif] text-[17px] font-extrabold text-[var(--text-primary)]">
              {threads.length} {threads.length === 1 ? 'tema' : 'temos'}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Uždaryti"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] border border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          >
            <svg viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5">
          <div className="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {threads.map((t) => <DiscussionRow key={t.legacy_id} t={t} onOpen={onOpenThread} />)}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Small circular avatar placeholder — shows the user's first initial on a
 *  deterministically-tinted background so repeat visitors see the same hue
 *  for the same username. Used in DiscussionRow. */
function AvatarBubble({ name, size = 28 }: { name: string; size?: number }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?'
  const hue = (() => {
    let h = 0
    for (let i = 0; i < name.length; i++) h = ((h << 5) - h) + name.charCodeAt(i), h |= 0
    return Math.abs(h) % 360
  })()
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%',
        background: `hsl(${hue}, 40%, 22%)`,
        color: `hsl(${hue}, 60%, 62%)`,
        fontSize: size * 0.42,
      }}
      className="flex shrink-0 items-center justify-center font-['Outfit',sans-serif] font-extrabold"
      aria-hidden
    >
      {initial}
    </div>
  )
}

// ── Main ────────────────────────────────────────────────────────────

export default function ArtistProfileClient({
  artist, heroImage, genres, substyles = [], links, photos, albums, tracks, members, followers, likeCount,
  events, similar, newTracks,
  legacyCommunity, legacyThreads = [], legacyNews = [], ranks = [],
  linkedTrackIds = [], awards = [],
}: Props) {
  const [pid, setPid] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [trackInfoOpen, setTrackInfoOpen] = useState<Track | null>(null)
  const [eventsModalOpen, setEventsModalOpen] = useState(false)
  const [discussionsModalOpen, setDiscussionsModalOpen] = useState(false)
  const [activeThread, setActiveThread] = useState<LegacyThread | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [likesModalOpen, setLikesModalOpen] = useState(false)
  const [bioModalOpen, setBioModalOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const galerijaRef = useRef<HTMLDivElement>(null)

  // Self-like state
  const [selfLiked, setSelfLiked] = useState<boolean | undefined>(undefined)
  const [authed, setAuthed] = useState<boolean | undefined>(undefined)
  const [isAnonLike, setIsAnonLike] = useState<boolean>(false)
  const [modernLikeCount, setModernLikeCount] = useState<number>(likeCount)
  const [selfLikePending, setSelfLikePending] = useState(false)
  // Surfaces DB-schema mismatches (e.g. the FK migration hasn't been applied)
  // so the user sees an actionable toast instead of silent failure.
  const [likeErrorMsg, setLikeErrorMsg] = useState<string | null>(null)
  // One-time nudge after the user's first anonymous like explaining
  // that signing in makes their vote count more.
  const [anonNudge, setAnonNudge] = useState(false)

  useEffect(() => { setLoaded(true) }, [])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/artists/${artist.id}/like`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data) return
        if (typeof data.liked === 'boolean') setSelfLiked(data.liked)
        if (typeof data.count === 'number') setModernLikeCount(data.count)
        if (typeof data.anonymous === 'boolean') setIsAnonLike(data.anonymous)
        // authed derived: if anonymous flag is false and response succeeded, user is signed in
        if (typeof data.anonymous === 'boolean') setAuthed(!data.anonymous)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [artist.id])

  const toggleSelfLike = async () => {
    if (selfLikePending) return
    setSelfLikePending(true)
    const prev = selfLiked
    setSelfLiked(prev ? false : true)
    setModernLikeCount(c => c + (prev ? -1 : 1))
    try {
      const res = await fetch(`/api/artists/${artist.id}/like`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        if (typeof data.liked === 'boolean') setSelfLiked(data.liked)
        if (typeof data.count === 'number') setModernLikeCount(data.count)
        if (typeof data.anonymous === 'boolean') {
          setIsAnonLike(data.anonymous)
          setAuthed(!data.anonymous)
          // First anonymous like from this device — show a one-time sign-in nudge
          if (data.anonymous && data.firstAnon && data.liked) {
            setAnonNudge(true)
          }
        }
      } else {
        // Server error — surface details so we can debug.
        let detail: any = null
        try { detail = await res.json() } catch {}
        // eslint-disable-next-line no-console
        console.error('[like toggle] server error', res.status, detail)
        setSelfLiked(prev)
        setModernLikeCount(c => c - (prev ? -1 : 1))
        const errStr = String(detail?.error || '')
        if (/foreign key constraint/i.test(errStr) && /user_id_fkey/i.test(errStr)) {
          setLikeErrorMsg('Duomenų bazės migracija dar neatlikta: likes.user_id FK turi rodyti į profiles. Paleisk 20260427_unified_likes.sql.')
        } else if (/relation .*likes.* does not exist/i.test(errStr)) {
          setLikeErrorMsg('Lentelė likes nesukurta. Paleisk supabase/migrations/20260427_unified_likes.sql.')
        } else if (errStr) {
          setLikeErrorMsg(`Nepavyko: ${errStr}`)
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[like toggle] network error', err)
      setSelfLiked(prev)
      setModernLikeCount(c => c - (prev ? -1 : 1))
    } finally {
      setSelfLikePending(false)
    }
  }

  const flag = FLAGS[artist.country] || (artist.country ? '🌍' : '')
  const hasBio = artist.description?.trim().length > 10
  const solo = artist.type === 'solo'
  const active = artist.active_from ? `${artist.active_from}–${artist.active_until || 'dabar'}` : null
  // Visi likes count'inami iš `likes` lentelės (jau aggregate'ino getLegacyCommunity).
  // modernLikeCount yra optimistic state nuo toggle'inimų po page load — tik prie
  // jo prideda followers (kurie atskira lentelė).
  // legacyCommunity.artistLikes = total iš `likes` per page-load. Toggle'as
  // updates'ina modernLikeCount += 1, todėl jei jį pridėtumėm prie artistLikes
  // dvigubintų. Sprendimas: jei selfLiked perduotas — modernLikeCount turi
  // diff'ą, kitaip — naudojam tik artistLikes.
  const baseArtistLikes = legacyCommunity?.artistLikes ?? 0
  const likes = baseArtistLikes + followers
  const allLikesUsers: any[] = legacyCommunity?.allArtistFans || []

  // Discography filters — album types + "Kitos dainos" (orphan tracks).
  // Multi-select: Set of active keys. 'all' sentinel = show everything.
  const atypes = [...new Set(albums.map(aType))]
  const hasStudio = atypes.includes('Studijinis')
  const linkedSet = useMemo(() => new Set(linkedTrackIds), [linkedTrackIds])
  const orphanTracks = useMemo(
    () => tracks.filter(t => !linkedSet.has(t.id)),
    [tracks, linkedSet],
  )
  const hasOrphanTracks = orphanTracks.length > 0
  // Default: Studijiniai + Kitos dainos (if any). Fallback to 'all' if no studio.
  const [activeFilters, setActiveFilters] = useState<Set<string>>(() => {
    const init = new Set<string>()
    if (hasStudio) init.add('Studijinis')
    else init.add('all')
    if (hasOrphanTracks) init.add('orphan')
    return init
  })

  const toggleFilter = (key: string) => {
    setActiveFilters(prev => {
      const next = new Set(prev)
      if (key === 'all') {
        // "Visi įrašai" resets — selects only itself
        return new Set(['all'])
      }
      next.delete('all') // selecting a specific type removes the all-reset
      if (next.has(key)) next.delete(key)
      else next.add(key)
      // If nothing left active, fall back to 'all' so content isn't empty
      if (next.size === 0) next.add('all')
      return next
    })
  }

  const showAll = activeFilters.has('all')
  const visibleAlbums = showAll
    ? albums
    : albums.filter(a => activeFilters.has(aType(a)))
  const showOrphans = hasOrphanTracks && (showAll || activeFilters.has('orphan'))

  // Max album popularity tarp visų atlikėjo albumų — relatyviam PopBar.
  // PRIORITY: like_count (atspindi tikrus hit'us — Mamontovo Geltona = 107,
  // Paleisk = 0). Score'as stipriai cluster'inasi (~17-18 kone visiems) ir
  // neduoda skirtumo. Score naudojamas tik kaip fallback'as kai likes data
  // dar nesurinkta.
  const maxAlbumPop = useMemo(() => {
    let max = 0
    for (const a of albums) {
      const likes = (a as any).like_count
      const score = (a as any).score
      const v = typeof likes === 'number' && likes > 0 ? likes : (typeof score === 'number' ? score : 0)
      if (v > max) max = v
    }
    return max
  }, [albums])

  // Max track likes per artist — naudojam tam, kad ir orphan ("Kitos
  // dainos") sąraše PopBar atrodytų vienodai kaip player'io track sąraše.
  // Pasiekiama iš tracks + newTracks visumos (player'is parent'e gauna abu).
  const maxTrackLikes = useMemo(() => {
    let max = 0
    for (const t of [...tracks, ...newTracks]) {
      const lk = (t as any).like_count
      if (typeof lk === 'number' && lk > max) max = lk
    }
    return max
  }, [tracks, newTracks])

  // Player'is rodo tracks be cap'o — vartotojas gali scroll'inti per visą
  // diskografiją. Anksčiau buvo .slice(0, 100), bet kai kurie atlikėjai
  // (Mamontovas 220+, didžiosios DJ'jaus kompiliacijos 1000+) turi gerokai
  // daugiau dainų. Filtruojam, kad video-turintys keliautų į priekį, bet
  // visus rodom.
  const tracksAllTime = useMemo(() => {
    const withVideo = tracks.filter(t => yt(t.video_url))
    const rest = tracks.filter(t => !yt(t.video_url))
    return [...withVideo, ...rest]
  }, [tracks])

  const tracksTrending = useMemo(() => {
    const withVideo = newTracks.filter(t => yt(t.video_url))
    const rest = newTracks.filter(t => !yt(t.video_url))
    return [...withVideo, ...rest]
  }, [newTracks])

  const hasAnyVideo = tracksAllTime.some(t => yt(t.video_url)) || tracksTrending.some(t => yt(t.video_url))

  const now = Date.now()
  // Default rodymas: tik šviežias content (~2 mėn). Vartotojas gali atidaryti
  // archyvą per "Žiūrėti archyvą" mygtuką → matosi visi past events + senos
  // naujienos.
  const TWO_MONTHS_MS = 62 * 24 * 60 * 60 * 1000
  const freshnessCutoff = now - TWO_MONTHS_MS
  const upcomingEvents = events.filter((e: any) => new Date(e.start_date).getTime() >= now)
  const allPastEvents = events.filter((e: any) => new Date(e.start_date).getTime() < now)
  const allLegacyNews = (legacyNews || []).filter((n: any) => {
    const raw = n.last_post_at || n.first_post_at || true
    if (!raw) return true
    return true  // visi naujienų items įtraukti į allLegacyNews; freshness filter taikomas atskirai žemiau
  })
  const pastEvents = allPastEvents.filter((e: any) => new Date(e.start_date).getTime() >= freshnessCutoff)
  const freshLegacyNews = (legacyNews || []).filter((n: any) => {
    const raw = n.last_post_at || n.first_post_at
    if (!raw) return false
    const ts = new Date(raw).getTime()
    return isFinite(ts) && ts >= freshnessCutoff
  })
  const archivedPastEvents = allPastEvents.filter((e: any) => new Date(e.start_date).getTime() < freshnessCutoff)
  const archivedLegacyNews = (legacyNews || []).filter((n: any) => {
    const raw = n.last_post_at || n.first_post_at
    if (!raw) return true  // su null timestamp — į archive, ne fresh
    const ts = new Date(raw).getTime()
    return !isFinite(ts) || ts < freshnessCutoff
  })
  const [showArchive, setShowArchive] = useState(false)
  void allLegacyNews // keep var to avoid lint
  const bioHtml: string = artist.description || ''

  // Galerija — visos aktyvios nuotraukos. Anksčiau filtruodavom hero foto
  // (kad nesi-dubliuotų), bet jei active'ių tik 2 ir viena tampa hero'jum,
  // galerija lieka su 1. Dabar paliekam visas — vartotojas mato pilną
  // foto sąrašą + lengvai matosi kuri yra hero (ji dažnai pirma sort_order).
  const galleryPhotos = useMemo(() => photos, [photos])

  const bioSubtitle = [
    active,
    genres[0]?.name,
    substyles.map(s => s.name).join(', '),
  ].filter(Boolean).join(' · ')

  const scrollToGalerija = () => {
    galerijaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="min-h-screen bg-[var(--bg-body)] font-['DM_Sans',system-ui,sans-serif] text-[var(--text-primary)] antialiased">
      <Hero
        artist={artist}
        heroImage={heroImage}
        loaded={loaded}
        likes={likes}
        selfLiked={selfLiked}
        selfLikePending={selfLikePending}
        onToggleLike={toggleSelfLike}
        onOpenLikersModal={() => setLikesModalOpen(true)}
        tracksAllTime={tracksAllTime}
        tracksTrending={tracksTrending}
        activeTrackId={pid}
        onSelectTrack={setPid}
        playing={playing}
        onRequestPlay={() => setPlaying(true)}
        onOpenTrackInfo={(t) => setTrackInfoOpen(t)}
        hasAnyVideo={hasAnyVideo}
        upcomingEvents={upcomingEvents}
        onOpenEventsModal={() => setEventsModalOpen(true)}
      />

      <EventsModal
        open={eventsModalOpen}
        events={upcomingEvents}
        onClose={() => setEventsModalOpen(false)}
      />

      <DiscussionsModal
        open={discussionsModalOpen}
        threads={legacyThreads}
        onClose={() => setDiscussionsModalOpen(false)}
        onOpenThread={(t) => {
          // Atidarom thread modal'ą tame pačiame fiziniame stack'e —
          // archyvas modal'as lieka užkulisiuose, žiūri pro thread modal'ą.
          // Uždarius thread'ą, archyvas vis dar matomas, kol vartotojas
          // jį uždaro atskirai.
          setActiveThread(t)
        }}
      />

      <DiscussionThreadModal
        thread={activeThread}
        onClose={() => setActiveThread(null)}
      />

      <LikesModal
        open={likesModalOpen}
        onClose={() => setLikesModalOpen(false)}
        title={`„${artist.name}" patinka`}
        count={likes}
        users={allLikesUsers}
        subjectName={artist.name}
        subjectPhoto={artist.cover_image_url || heroImage}
        selfLiked={selfLiked}
        authed={authed}
        onToggleSelfLike={toggleSelfLike}
        selfLikePending={selfLikePending}
      />

      <BioModal
        open={bioModalOpen}
        onClose={() => setBioModalOpen(false)}
        title={`Apie ${artist.name}`}
        subtitle={bioSubtitle}
        html={bioHtml}
      />

      <TrackInfoModal
        track={trackInfoOpen}
        artistName={artist.name}
        artistSlug={artist.slug}
        artistThumbUrl={artist.cover_image_url}
        isSingle={!!trackInfoOpen && !linkedSet.has(trackInfoOpen.id)}
        onClose={() => setTrackInfoOpen(null)}
        onPlay={(t) => { setPid(t.id); setPlaying(true) }}
      />

      {lightboxIndex !== null && galleryPhotos.length > 0 && (
        <Lightbox
          photos={galleryPhotos}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndex={setLightboxIndex}
        />
      )}

      {/* Like-error toast (FK migration hint) */}
      {likeErrorMsg && (
        <div className="fixed bottom-4 left-1/2 z-[2000] -translate-x-1/2 sm:bottom-6">
          <div className="flex max-w-[560px] items-start gap-3 rounded-2xl border border-[rgba(239,68,68,0.35)] bg-[var(--bg-surface)] p-4 shadow-[0_18px_44px_-10px_rgba(0,0,0,0.5)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" className="mt-0.5 shrink-0">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div className="min-w-0 flex-1">
              <div className="mb-1 font-['Outfit',sans-serif] text-[13px] font-extrabold text-[var(--text-primary)]">
                Patinka neišsaugotas
              </div>
              <div className="text-[12px] leading-[1.5] text-[var(--text-secondary)]">
                {likeErrorMsg}
              </div>
            </div>
            <button
              onClick={() => setLikeErrorMsg(null)}
              aria-label="Uždaryti"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Anonymous-like nudge (one-time, after first anon like) */}
      {anonNudge && (
        <div className="fixed bottom-4 left-1/2 z-[2000] -translate-x-1/2 sm:bottom-6">
          <div className="flex max-w-[520px] items-start gap-3 rounded-2xl border border-[rgba(249,115,22,0.35)] bg-[var(--bg-surface)] p-4 shadow-[0_18px_44px_-10px_rgba(0,0,0,0.5)]">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-orange)] shadow-[0_4px_14px_rgba(249,115,22,0.4)]">
              <svg viewBox="0 0 24 24" fill="#fff" width="16" height="16">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 font-['Outfit',sans-serif] text-[13px] font-extrabold text-[var(--text-primary)]">
                Tavo „Patinka" užskaitytas ✓
              </div>
              <div className="text-[12px] leading-[1.5] text-[var(--text-secondary)]">
                Jei prisijungsi, tavo balsas turės didesnę vertę rank'uose ir visoje bendruomenėje.
              </div>
              <a
                href="/auth/signin"
                className="mt-2 inline-flex items-center gap-1 font-['Outfit',sans-serif] text-[12px] font-bold text-[var(--accent-orange)] hover:underline"
              >
                Prisijungti →
              </a>
            </div>
            <button
              onClick={() => setAnonNudge(false)}
              aria-label="Uždaryti"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-[1400px] space-y-10 px-4 pb-24 pt-8 sm:space-y-14 sm:px-6 lg:px-10">

        {/* Upcoming events live in the Hero now (see Hero component) so a
            lone event doesn't leave empty air below the title. Overflow
            opens EventsModal. */}

        {/* BIO + MEMBERS + SIDE INFO — adaptive layout.
            Mobile: stacked — horizontal SideInfo strip on top, bio + members below.
            Desktop: 2-col — [bio | vertical SideInfo 320px].
            The mobile stack surfaces details (country / genre / socials)
            above the bio so they're the first thing seen without scrolling. */}
        {(() => {
          const sideInfoAvailable = !!artist.country || genres.length > 0 || links.length > 0 || artist.website || !!artist.active_from || !!artist.birth_date || !!artist.death_date
          const bioHeader = solo ? 'Apie atlikėją' : 'Apie grupę'

          if (!hasBio && members.length === 0 && !sideInfoAvailable) return null

          return (
            <section>
              {/* Mobile: horizontal strip on top */}
              {sideInfoAvailable && (
                <div className="mb-6 lg:hidden">
                  <SideInfo
                    artist={artist}
                    flag={flag}
                    genres={genres}
                    substyles={substyles}
                    ranks={ranks}
                    links={links}
                    website={artist.website}
                    horizontal
                  />
                </div>
              )}
              {/* Mobile: score card below sideinfo strip */}
              {artist.score !== null && artist.score !== undefined && (
                <div className="mb-6 lg:hidden">
                  <ScoreCard
                    entityType="artist"
                    score={artist.score}
                    breakdown={artist.score_breakdown}
                  />
                </div>
              )}
              {/* Desktop: float right'as info card'ams — bio teksto srautas
                  apgaubia kortelę. Anksčiau buvo 2-col grid'as su fiksuotu
                  320px sidebar'iu, dėl ko atsirasdavo tuščia erdvė po trumpu
                  bio. Su float'u: kai bio trumpas, sidebar'as natūraliai
                  baigia sekciją; kai ilgas — tekstas tęsiasi po info card'o
                  pilnu pločiu (klasikinis žurnalo layout'as).
                  Mobile: sidebar matomas viršuje (horizontal strip), bio
                  apačioj — tas pats kaip ir prieš tai. */}
              <div className="lg:[display:flow-root]">
                {(sideInfoAvailable || (artist.score !== null && artist.score !== undefined)) && (
                  <div className="hidden lg:float-right lg:ml-8 lg:mb-4 lg:flex lg:w-[320px] lg:flex-col lg:gap-4">
                    {sideInfoAvailable && (
                      <SideInfo
                        artist={artist}
                        flag={flag}
                        genres={genres}
                        substyles={substyles}
                        ranks={ranks}
                        links={links}
                        website={artist.website}
                      />
                    )}
                    {artist.score !== null && artist.score !== undefined && (
                      <ScoreCard
                        entityType="artist"
                        score={artist.score}
                        breakdown={artist.score_breakdown}
                      />
                    )}
                  </div>
                )}
                <div className="min-w-0">
                  {hasBio && (
                    <>
                      <h2 className="mb-3 font-['Outfit',sans-serif] text-[18px] font-black tracking-[-0.01em] text-[var(--text-primary)] sm:text-[20px]">
                        {bioHeader}
                      </h2>
                      <BioPreview html={bioHtml} onOpen={() => setBioModalOpen(true)} maxChars={700} />
                    </>
                  )}
                  {!solo && members.length > 0 && <MembersInline members={members} />}
                </div>
              </div>
            </section>
          )
        })()}

        {/* Muzika — multi-select filters. "Visi įrašai" first, then types,
            "Kitos dainos" last. Multiple can be active simultaneously. */}
        {(albums.length > 0 || hasOrphanTracks) && (() => {
          const allCount = albums.length + orphanTracks.length
          const FilterChip = ({ k, label, count }: { k: string; label: string; count: number }) => {
            const active = activeFilters.has(k)
            return (
              <button
                onClick={() => toggleFilter(k)}
                className={[
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-["Outfit",sans-serif] text-[12px] font-bold transition-all',
                  active
                    ? 'border-[var(--accent-orange)] bg-[var(--accent-orange)] text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)]'
                    : 'border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]',
                ].join(' ')}
              >
                {label}
                <span className={active ? 'opacity-80' : 'text-[var(--text-faint)]'}>· {count}</span>
              </button>
            )
          }
          return (
            <section>
              <SectionTitle label="Muzika" />

              {/* Desktop: all filter chips wrap on one row */}
              <div className="mb-5 hidden flex-wrap gap-1.5 sm:flex sm:gap-2">
                <FilterChip k="all" label={FILTER_LABEL.all} count={allCount} />
                {atypes.map(t => (
                  <FilterChip
                    key={t}
                    k={t}
                    label={FILTER_LABEL[t] || t}
                    count={albums.filter(a => aType(a) === t).length}
                  />
                ))}
                {hasOrphanTracks && (
                  <FilterChip k="orphan" label={FILTER_LABEL.orphan} count={orphanTracks.length} />
                )}
              </div>

              {/* Mobile: show only active filters + a "…" toggle that opens
                  the full filter list. Keeps the header tight when many
                  filter types exist (otherwise 6+ chips would eat a lot of
                  vertical space above the albums). */}
              <MobileFilterRow
                all={{ key: 'all', label: FILTER_LABEL.all, count: allCount }}
                items={[
                  ...atypes.map(t => ({ key: t, label: FILTER_LABEL[t] || t, count: albums.filter(a => aType(a) === t).length })),
                  ...(hasOrphanTracks ? [{ key: 'orphan', label: FILTER_LABEL.orphan, count: orphanTracks.length }] : []),
                ]}
                activeFilters={activeFilters}
                onToggle={toggleFilter}
              />

              {/* Albums — horizontal scroll carousel. Card widths sized so
                  exactly 2 recent albums fill the mobile viewport with the
                  next card peeking in; desktop gets bigger tiles. Snap +
                  touch momentum for a smooth swipe feel. */}
              {visibleAlbums.length > 0 && (
                <>
                  {/* Mobile (<sm): horizontal snap scroll. Užima mažiau
                      vertikalaus ploto kai atlikėjas turi daug albumų. */}
                  <div
                    className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    style={{
                      scrollSnapType: 'x mandatory',
                      scrollPaddingLeft: '1rem',
                      overscrollBehaviorX: 'contain',
                      WebkitOverflowScrolling: 'touch',
                    }}
                  >
                    {visibleAlbums.map((a, i) => (
                      <div
                        key={a.id}
                        className="w-[46vw] max-w-[180px] shrink-0"
                        style={{ scrollSnapAlign: 'start' }}
                      >
                        <AlbumCard a={a} artistSlug={artist.slug} maxPop={maxAlbumPop} popularity={popLevel(i, visibleAlbums.length)} />
                      </div>
                    ))}
                  </div>
                  {/* Desktop (sm+): pilnas grid'as, visi albumai matomi.
                      Tankesnis grid (4-8 col), kad cover'iai būtų mažesni
                      ir low-res quality nesimatytų. */}
                  <div className="hidden gap-3 sm:grid sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8">
                    {visibleAlbums.map((a, i) => (
                      <AlbumCard key={a.id} a={a} artistSlug={artist.slug} maxPop={maxAlbumPop} popularity={popLevel(i, visibleAlbums.length)} />
                    ))}
                  </div>
                </>
              )}

              {/* Orphan tracks — compact list below albums when included */}
              {showOrphans && orphanTracks.length > 0 && (
                <div className={visibleAlbums.length > 0 ? 'mt-6' : ''}>
                  {visibleAlbums.length > 0 && (
                    <div className="mb-2.5 font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.15em] text-[var(--text-muted)]">
                      Kitos dainos
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {orphanTracks.map((t) => (
                      <TrackRow
                        key={t.id}
                        t={t}
                        artistSlug={artist.slug}
                        popularity={popLevelRelative((t as any).like_count || 0, maxTrackLikes)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </section>
          )
        })()}

        {/* Apdovanojimai — Wikipedia awards article duomenys */}
        {awards.length > 0 && <ArtistAwards awards={awards} />}

        {/* Diskusijos — preview grid'as (3-col desktop, 2-col tablet, 1-col
            mobile) kortelių su iki 2 paskutinių komentarų. Ribojam 6 kortelėm,
            likusios — modal'e (panašu kaip events archyvas). auto-rows-fr —
            kad visos eilutės kortelėse būtų vienodo aukščio, neprikl. nuo
            komentarų skaičiaus. */}
        {(() => {
          const PREVIEW_LIMIT = 6
          const previewThreads = legacyThreads.slice(0, PREVIEW_LIMIT)
          const overflow = Math.max(0, legacyThreads.length - PREVIEW_LIMIT)
          return (
            <section>
              <div className="flex items-center justify-between">
                <SectionTitle label="Diskusijos" />
                {overflow > 0 && (
                  <button
                    onClick={() => setDiscussionsModalOpen(true)}
                    className="ml-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1.5 text-[11px] font-bold text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                  >
                    Žiūrėti visas (+{overflow})
                  </button>
                )}
              </div>
              {legacyThreads.length > 0 ? (
                <div className="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {previewThreads.map((t) => (
                    <DiscussionRow key={t.legacy_id} t={t} onOpen={setActiveThread} />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-[var(--border-default)] p-8 text-center">
                  <div className="mb-2 text-[14px] font-bold text-[var(--text-muted)]">Dar nėra diskusijų apie {artist.name}</div>
                  <div className="mb-4 text-[12px] text-[var(--text-faint)]">Būk pirmas — pradėk diskusiją!</div>
                  <button className="inline-flex items-center gap-2 rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] px-4 py-2 font-['Outfit',sans-serif] text-[12px] font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
                    Nauja diskusija
                  </button>
                </div>
              )}
            </section>
          )
        })()}

        {/* Past events — fresh only; archyvas atidaromas pagal showArchive */}
        {(pastEvents.length > 0 || archivedPastEvents.length > 0) && (
          <section>
            <div className="flex items-center justify-between">
              <SectionTitle label="Įvykę renginiai" />
              {archivedPastEvents.length > 0 && (
                <button
                  onClick={() => setShowArchive(v => !v)}
                  title={showArchive ? 'Slėpti senesnius' : `Rodyti senus renginius (${archivedPastEvents.length})`}
                  className="ml-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1.5 text-[11px] font-bold text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {showArchive ? 'Slėpti archyvą' : `Archyvas (${archivedPastEvents.length})`}
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {(showArchive ? [...pastEvents, ...archivedPastEvents] : pastEvents).map((e: any) => <EventCard key={e.id} e={e} variant="past" />)}
            </div>
          </section>
        )}

        {/* Legacy news — fresh only by default; archyvas via showArchive */}
        {(freshLegacyNews.length > 0 || archivedLegacyNews.length > 0) && (
          <section>
            <div className="flex items-center justify-between">
              <SectionTitle label="Naujienos" />
              {archivedLegacyNews.length > 0 && (
                <button
                  onClick={() => setShowArchive(v => !v)}
                  title={showArchive ? 'Slėpti senesnes' : `Rodyti senas naujienas (${archivedLegacyNews.length})`}
                  className="ml-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1.5 text-[11px] font-bold text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {showArchive ? 'Slėpti archyvą' : `Archyvas (${archivedLegacyNews.length})`}
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(showArchive ? [...freshLegacyNews, ...archivedLegacyNews].slice(0, 60) : freshLegacyNews.slice(0, 12)).map(n => {
                const title = n.title || slugToForumTitle(n.slug)
                const pc = n.post_count ?? 0
                return (
                  <Link
                    key={n.legacy_id}
                    href={`/diskusijos/tema/${n.legacy_id}`}
                    className="group flex flex-col gap-3 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 no-underline transition-all hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.2)]"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[rgba(249,115,22,0.2)] bg-[rgba(249,115,22,0.1)] text-[var(--accent-orange)]">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M20 3H4a2 2 0 00-2 2v14a2 2 0 002 2h16a2 2 0 002-2V5a2 2 0 00-2-2z" /></svg>
                      </div>
                      <div className="font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--accent-orange)]">Naujiena</div>
                      {pc > 0 && <div className="ml-auto text-[11px] font-semibold text-[var(--text-muted)]">{pc} komentarai</div>}
                    </div>
                    <div className="text-[14px] font-bold leading-snug text-[var(--text-primary)] sm:text-[15px]">{title}</div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* Galerija (masonry) */}
        {galleryPhotos.length > 0 && (
          <section ref={galerijaRef} id="galerija">
            <SectionTitle label="Galerija" count={galleryPhotos.length} />
            <MasonryGallery
              photos={galleryPhotos}
              onOpen={(i) => setLightboxIndex(i)}
            />
          </section>
        )}

        {/* Similar */}
        {similar.length > 0 && (
          <section>
            <SectionTitle label="Panaši muzika" />
            <div className="flex snap-x gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {similar.map((a: any) => (
                <Link key={a.id} href={`/atlikejai/${a.slug}`} className="w-[110px] shrink-0 snap-start text-center no-underline sm:w-[130px]">
                  <div className="relative mx-auto mb-2.5 h-[90px] w-[90px] overflow-hidden rounded-full border-2 border-[var(--border-default)] transition-all hover:scale-105 hover:border-[var(--border-strong)] sm:h-[108px] sm:w-[108px]">
                    {a.cover_image_url ? (
                      <img src={proxyImg(a.cover_image_url)} alt={a.name} referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-[var(--cover-placeholder)] font-['Outfit',sans-serif] text-[24px] font-black text-[var(--text-faint)]">
                        {a.name[0]}
                      </div>
                    )}
                  </div>
                  <div className="truncate font-['Outfit',sans-serif] text-[13px] font-bold text-[var(--text-primary)]">{a.name}</div>
                </Link>
              ))}
            </div>
          </section>
        )}

      </main>
    </div>
  )
}
