'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import LikesModal, { type LikeUser } from '@/components/LikesModal'
import { LikePill } from '@/components/LikePill'
import BioModal from '@/components/BioModal'
import ScoreCard from '@/components/ScoreCard'
import ArtistAwards, { type AwardRow } from '@/components/ArtistAwards'
import type { LegacyLikeUser } from '@/components/LegacyLikesPanel'
import EntityCommentsBlock from '@/components/EntityCommentsBlock'
import MusicSearchPicker, { AttachmentChips, type AttachmentHit } from '@/components/MusicSearchPicker'
import LyricsWithReactions from '@/components/LyricsWithReactions'
import { proxyImg, proxyImgResized } from '@/lib/img-proxy'
import { normalizeBio } from '@/lib/normalize-bio'
import { formatArtistList } from '@/lib/format-artists'
import DropBar from '@/components/DropBar'
import AlbumInfoModal from '@/components/AlbumInfoModal'
import EventInfoModal, { type EventPreview } from '@/components/EventInfoModal'
import NewsInfoModal, { type NewsPreview } from '@/components/NewsInfoModal'

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
  /** Featuring artists — set server-side in getTracks() via track_artists JOIN.
   *  Used in TrackInfoModal header to render full artist list. */
  featuring?: Array<{ id: number; slug: string; name: string }>
  /** Albums this track belongs to — small chips in the modal's meta row. */
  albums?: Array<{ id: number; slug: string; title: string; cover_image_url: string | null }>
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
  /** Modern discussions.id — leidžia EntityCommentsBlock entityType='discussion'
   *  vienodai veikti kaip canonical /diskusijos/[slug] page'e. Jei null,
   *  thread'as dar nebuvo migrated į canonical discussions table'ą. */
  id?: number
  legacy_id: number; slug: string; source_url: string
  title?: string | null; post_count?: number | null
  first_post_at?: string | null; last_post_at?: string | null
  last_post?: LegacyPost | null
  recent_posts?: LegacyPost[]
  /** Po data migracijos forum_threads → discussions, kortelė nukreipia į
   *  /diskusijos/{canonical_slug} (canonical EntityCommentsBlock UI). Jei
   *  null — fallback'as į legacy bridge'ą /diskusijos/tema/{legacy_id}. */
  canonical_slug?: string | null
}
type Rank = { category: string; rank: number; total: number; scope: 'country' | 'genre' | 'global' }
type Props = {
  artist: any; heroImage: string | null; genres: Genre[]; substyles?: Genre[]
  links: { platform: string; url: string }[]; photos: Photo[]
  albums: Album[]; tracks: Track[]; members: Member[]; memberOf?: Member[]; followers: number; likeCount: number
  news: any[]; events: any[]; similar: any[]
  newTracks: Track[]; topVideos: Track[]; chartData: ChartPt[]; hasNewMusic: boolean
  legacyCommunity?: LegacyCommunity
  legacyThreads?: LegacyThread[]; legacyNews?: LegacyThread[]
  ranks?: Rank[]
  /** Set of track ids that are linked to this artist's albums (via album_tracks
   *  junction). Tracks NOT in this list are considered orphan ("Kitos dainos"). */
  linkedTrackIds?: number[]
  awards?: AwardRow[]
  /** Custom eras for discography periodization (Push 3b). When ≥2 rows,
   *  the album grid is grouped by era instead of flat chronological.
   *  When empty, auto-decade grouping kicks in if albums.count ≥ 10 AND
   *  ≥3 decades have ≥2 albums; otherwise flat grid is used. */
  eras?: Era[]
}
/** Custom era — single period in an artist's career. */
type Era = {
  id: number
  sort_order: number
  title: string
  subtitle: string | null
  year_start: number
  year_end: number | null
  description: string | null
  featured_album_ids: number[] | null
  source: string | null
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

/** „coldplay-l194526" → „Coldplay" (be legacy ID artifact'o uodegoje).
 *  music.lt diskusijų slug'ai dažnai turi `-l\d{5,}` priesagą — ta vidinė ID
 *  nieko nepasako vartotojui. Po išvalymo capitalize'inam pirmą raidę. */
function slugToForumTitle(slug: string): string {
  const cleaned = (slug || '')
    .replace(/\/$/, '')
    .replace(/-l\d{4,}$/i, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return 'Diskusija'
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
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

/** LT relative time format — "ką tik" / "prieš 5 minutes" / "prieš 19 metų".
 *  Atitinka kanoninės /diskusijos/tema/[id] page'os timeAgo formatą. */
function timeAgoLT(iso: string | null): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (isNaN(then)) return ''
  const diff = Math.max(0, Date.now() - then)
  const s = Math.floor(diff / 1000)
  if (s < 45) return 'ką tik'
  const m = Math.floor(s / 60)
  if (m < 60) return `prieš ${m} ${pluralLT(m, ['minutę', 'minutes', 'minučių'])}`
  const h = Math.floor(m / 60)
  if (h < 24) return `prieš ${h} ${pluralLT(h, ['valandą', 'valandas', 'valandų'])}`
  const d = Math.floor(h / 24)
  if (d < 30) return `prieš ${d} ${pluralLT(d, ['dieną', 'dienas', 'dienų'])}`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `prieš ${mo} ${pluralLT(mo, ['mėnesį', 'mėnesius', 'mėnesių'])}`
  const y = Math.floor(d / 365)
  return `prieš ${y} ${pluralLT(y, ['metus', 'metus', 'metų'])}`
}

function pluralLT(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return forms[0]
  if (mod10 >= 2 && mod10 <= 9 && (mod100 < 10 || mod100 > 20)) return forms[1]
  return forms[2]
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
  playing, onRequestPlay, onOpenTrackInfo, hasAnyVideo, artistSlug,
}: {
  tracksAllTime: Track[]; tracksTrending: Track[]
  activeTrackId: number | null; onSelectTrack: (id: number) => void
  /** True once the user has hit our own play button at least once — we swap
   *  the thumbnail overlay for the autoplay-embed iframe. */
  playing: boolean
  onRequestPlay: () => void
  onOpenTrackInfo: (t: Track) => void
  hasAnyVideo: boolean
  /** Artist slug — used to build crawlable `<a href>` URLs for each track
   *  title (SEO). Click is preventDefault'd so the row's onClick (play)
   *  still fires, but Google sees a real link and middle-click opens the
   *  full track page in a new tab. */
  artistSlug?: string
}) {
  // Vienas track sąrašas su filter chip'ais (vietoj 2 tabų).
  // newTrackIds = tracksTrending (jau filtruotas <24 mo); singleTrackIds
  // = tracks su is_single. Filter pakeitimas tik perfiltruoja displayList'ą,
  // nesukinėja sort'o (sort visada same: composite popularity from parent).
  const newTrackIds = useMemo(() => new Set(tracksTrending.map(t => t.id)), [tracksTrending])
  const singleTrackIds = useMemo(() => new Set(tracksAllTime.filter(t => (t as any).is_single).map(t => t.id)), [tracksAllTime])
  const hasNew = newTrackIds.size > 0
  const hasSingles = singleTrackIds.size > 0
  type Filter = 'all' | 'new' | 'singles'
  const [filter, setFilter] = useState<Filter>('all')
  // Snap back kai filter tampa tuščias (pvz. trending dingo po reshuffle).
  useEffect(() => {
    if (filter === 'new' && !hasNew) setFilter('all')
    if (filter === 'singles' && !hasSingles) setFilter('all')
  }, [filter, hasNew, hasSingles])

  const list = useMemo(() => {
    if (filter === 'new') return tracksAllTime.filter(t => newTrackIds.has(t.id))
    if (filter === 'singles') {
      // Singlai sortinami nuo naujausio žemyn (pagal release_year DESC,
      // tiebreak pagal release_month). Be metų — į apačią.
      return tracksAllTime
        .filter(t => singleTrackIds.has(t.id))
        .slice()
        .sort((a, b) => {
          const ay = (a as any).release_year || 0
          const by = (b as any).release_year || 0
          if (by !== ay) return by - ay
          const am = (a as any).release_month || 0
          const bm = (b as any).release_month || 0
          return bm - am
        })
    }
    return tracksAllTime
  }, [filter, tracksAllTime, newTrackIds, singleTrackIds])

  // PopBar relatyvumas per current filter — kai useris filter'is naujausiems,
  // top trending track'as gauna 5 dashes neprikl. nuo all-time top'o.
  const popInfo = useMemo(() => detectPopSignal(list), [list])
  // Singles filter sort'inamas pagal year DESC, todėl idx jame ne
  // popularity rank'as — bar'ai tampa monotoniškai mažėjantys. Sprendimas:
  // skaičiuojam popbar level'į pagal track'o rank'ą `tracksAllTime` list'e
  // (kuris jau sortintas composite desc nuo parent'o), Map'inamas vieną
  // kartą; bet kuris filter view'as paima rank'ą iš mapo.
  const allTimePopLevelById = useMemo(() => {
    const map = new Map<number, number>()
    const N = tracksAllTime.length
    if (N === 0) return map
    tracksAllTime.forEach((t, i) => {
      const p = i / N
      const lvl = p < 0.20 ? 5 : p < 0.40 ? 4 : p < 0.60 ? 3 : p < 0.80 ? 2 : 1
      map.set(t.id, lvl)
    })
    return map
  }, [tracksAllTime])
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
  // Embed-disabled videos: kanalo savininkas (pvz SelMusic) išjungę embed'ą
  // trečioms šalims. YT.Player onError grąžina kodus 101 / 150 šitam case'ui.
  // Saugom Set'ą per session — jei vienas video disabled, mes display'inam
  // fallback iškart, neretrying'inam YT.Player kuris tik vėl meta klaidą.
  const [embedDisabled, setEmbedDisabled] = useState<Set<string>>(new Set())
  const isEmbedDisabled = !!displayVid && embedDisabled.has(displayVid)

  // Mobile mute hint state — kai mobile'e iframe paleidziamas su mute=1,
  // rodom small badge "🔊 Garsui". Paspaudus → playerRef.current.unMute().
  // YT.Player JS API tvarko visa unmute logika natively, jokio postMessage
  // hack'o ne reik.
  const [needsUnmute, setNeedsUnmute] = useState(false)

  // Pre-flight embeddable check — apsisaugom mobile case'e (kur YT.Player
  // onError negaunamas, plain iframe'e tik juodas langas su YouTube error
  // tekstu) ir greitesnis fallback'as desktop'e (nelaukiam YT.Player onError).
  // Server route'as cache'ina rezultatus per HTTP — pakartotini požiūriai cheap.
  useEffect(() => {
    if (!displayVid) return
    if (embedDisabled.has(displayVid)) return // jau pažymėta
    let cancelled = false
    fetch(`/api/yt/embeddable?videoId=${encodeURIComponent(displayVid)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d) return
        if (d.embeddable === false) {
          setEmbedDisabled(s => {
            if (s.has(displayVid)) return s
            const next = new Set(s); next.add(displayVid); return next
          })
        }
      })
      .catch(() => { /* network klaida — paliekam optimistic, YT.Player onError dar gali pagauti */ })
    return () => { cancelled = true }
  }, [displayVid])
  // Mobile detection — Safari iOS / Android Chrome turi griežtas autoplay
  // taisykles: YT.Player(target) sukuriamas useEffect'e (po setState/render),
  // ne tap handler'yje, todėl gesture context prarastas → autoplay blokuojamas.
  // Mobile'e renderinam plain `<iframe>` su autoplay=1 — iframe mount'inamas
  // tame pačiame React render'yje kaip ir click event, Safari leidžia.
  const [isMobileVP, setIsMobileVP] = useState(false)
  useEffect(() => {
    const m = window.matchMedia('(max-width: 1023px)')
    setIsMobileVP(m.matches)
    const h = (e: MediaQueryListEvent) => setIsMobileVP(e.matches)
    m.addEventListener('change', h)
    return () => m.removeEventListener('change', h)
  }, [])

  // Mobile needsUnmute initialization — tik kai pradedame playback su mute=1.
  // YT.Player onReady auto-bandys unmute'inti per 800/1600/3000ms timer'ius;
  // jei pavyks, badge dings (žr. CREATE useEffect onReady).
  useEffect(() => {
    setNeedsUnmute(isMobileVP && playing && !isEmbedDisabled && !!displayVid)
  }, [isMobileVP, playing, displayVid, isEmbedDisabled])

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

  // CREATE YT.Player on apiReady AND when user wants to play (playing=true).
  //
  // Architektūra (2026-05-06 v4):
  //   * Player'is sukuriamas pirma karta paspaudus Play overlay (gesture
  //     context preserved). YT.Player constructor'is paima containerRef
  //     ir pakeičia jį iframe'u — todėl turim STABLE wrapper'į (React
  //     niekad neunmount'ina jo dėl flip'inančio JSX'o).
  //   * Track switching — playerRef.current.loadVideoById(newVid). Vietoj
  //     iframe remount'inant, YT vidiniai pakeičia video. Gesture
  //     preserved iš user'io click'o ant track row.
  //   * State events — events.onStateChange callback'as natively dirba.
  //     state=0 (ended) → auto-skip į kitą track'ą.
  //   * Mobile mute — playerVars.mute=1 (mobile only). Po start'o bandom
  //     unmute().
  //
  // ANKSTESNĖS PROBLEMOS sprendimas: anksčiau player'is buvo sukuriamas
  // useEffect'e [playing,...] PO setState async — gesture prarastas →
  // autoplay block'inamas. Dabar create vyksta tame pačiame click event
  // tick'e (handlePlayClick → directly calls a ref function which creates
  // player synchronously).
  useEffect(() => {
    if (!apiReady || !playing || !displayVid || !containerRef.current) return
    if (isEmbedDisabled) return
    if (playerRef.current) return  // jau sukurta — track switch'ai per loadVideoById

    const W = window as any
    const inner = document.createElement('div')
    inner.style.width = '100%'
    inner.style.height = '100%'
    containerRef.current.innerHTML = ''
    containerRef.current.appendChild(inner)

    const player = new W.YT.Player(inner, {
      videoId: displayVid,
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: 1,
        mute: isMobileVP ? 1 : 0,  // Mobile'e visada mute=1 (iOS strict)
        controls: 1,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
        iv_load_policy: 3,
        enablejsapi: 1,
        origin: typeof window !== 'undefined' ? window.location.origin : undefined,
      },
      events: {
        onReady: (e: any) => {
          try { e.target.playVideo() } catch {}
          // Mobile auto-unmute attempts po start'o.
          if (isMobileVP) {
            const tryUnmute = () => { try { e.target.unMute() } catch {} }
            setTimeout(tryUnmute, 800)
            setTimeout(tryUnmute, 1600)
            setTimeout(tryUnmute, 3000)
          }
        },
        onStateChange: (e: any) => {
          // YT player states: -1=unstarted, 0=ended, 1=playing,
          // 2=paused, 3=buffering, 5=cued.
          setIsPaused(!(e.data === 1 || e.data === 3))
          if (e.data === 0) {
            // Track ended — auto-skip į kitą track'ą sąraše su video,
            // su rollover į pradžią.
            const allTracks = [...tracksAllTime, ...tracksTrending]
            const idx = allTracks.findIndex(t => t.id === activeTrackId)
            if (idx < 0) return
            for (let i = 1; i <= allTracks.length; i++) {
              const candidate = allTracks[(idx + i) % allTracks.length]
              if (candidate && yt(candidate.video_url)) {
                onSelectTrack(candidate.id)
                try {
                  fetch(`/api/tracks/${candidate.id}/play`, { method: 'POST', keepalive: true }).catch(() => {})
                } catch {}
                return
              }
            }
          }
        },
        onError: (e: any) => {
          const code = e?.data
          if (code === 101 || code === 150) {
            // Embedding disabled — switch to fallback overlay
            const vidNow = (player as any)._vid || displayVid
            setEmbedDisabled(s => {
              if (s.has(vidNow)) return s
              const next = new Set(s); next.add(vidNow); return next
            })
            try { playerRef.current?.destroy() } catch {}
            playerRef.current = null
            try { if (containerRef.current) containerRef.current.innerHTML = '' } catch {}
          }
        },
      },
    })
    ;(player as any)._vid = displayVid
    playerRef.current = player
  }, [apiReady, playing, displayVid, isEmbedDisabled, isMobileVP, activeTrackId, tracksAllTime, tracksTrending, onSelectTrack])

  // VIDEO CHANGE — kai displayVid pasikeičia, naudojam loadVideoById vietoj
  // destroy+recreate. Iframe lieka tas pats, gesture context tarp track'ų
  // perduodamas, autoplay veikia natively.
  useEffect(() => {
    if (!playerRef.current || !displayVid) return
    if ((playerRef.current as any)._vid === displayVid) return
    try {
      playerRef.current.loadVideoById?.(displayVid)
      ;(playerRef.current as any)._vid = displayVid
    } catch {}
  }, [displayVid])

  // PAUSE/PLAY toggle (kai user'is paspaudžia external pause btn — kol kas
  // mes neturim to UI, bet API palikta jei reiks vėliau)
  useEffect(() => {
    if (!playerRef.current) return
    try {
      if (playing) playerRef.current.playVideo?.()
      else playerRef.current.pauseVideo?.()
    } catch {}
  }, [playing])

  // UNMOUNT cleanup — destroy player kai paliekam puslapį.
  useEffect(() => {
    return () => {
      try { playerRef.current?.destroy() } catch {}
      playerRef.current = null
    }
  }, [])

  /** Fire-and-forget play-count ping. We don't block the UI on it; failures
   *  are silent since playback is already handled by YT. */
  const pingPlay = (trackId: number) => {
    try {
      fetch(`/api/tracks/${trackId}/play`, { method: 'POST', keepalive: true }).catch(() => {})
    } catch {}
  }

  // Track click — paprasta logika (be pause toggle, nes plain iframe approach
  // neturim programmatic pause API). Click ant track'o:
  //   - Jei tas pats track + jau playing → no-op (user'is gali pausintis YT
  //     chrome'e iframe'o viduje)
  //   - Jei kitas track ARBA dar nepradėjus → start playback (set state
  //     activeTrackId + playing=true, ping play count)
  // Iframe'as pakeičia src per `key` rebuild → autoplay=1 paleidžia.
  const handleSelect = (id: number) => {
    if (id === activeTrackId && playing) return  // already playing this track
    onSelectTrack(id)
    onRequestPlay()
    setIsPaused(false)
    pingPlay(id)
  }

  return (
    // Hardened size lock — multiple defensive layers prevent any size
    // change tarp paused/playing state'u. CSS `contain: size layout`
    // izoliuoja inner content layout from parent (iframe injectai
    // negali push'inti parent dydziui).
    <div
      className="w-full max-w-full overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[0_20px_60px_-20px_rgba(0,0,0,0.4)]"
      style={{ contain: 'layout', boxSizing: 'border-box' }}
    >
      {/* Player area — mobile: aspect-video, desktop: fixed 260px height
          + 100% width. `contain: strict` hard'iest CSS containment —
          iframe negali iseiti is shio box dydziu. min-w/min-h: 0
          prevent intrinsic-size grow. */}
      <div
        className="relative aspect-video lg:aspect-auto lg:h-[260px] w-full max-w-full overflow-hidden bg-black"
        style={{ contain: 'strict', minWidth: 0, minHeight: 0, boxSizing: 'border-box' }}
      >
        {displayVid ? (
          // YT IFrame API replaces an inner div with <iframe>. The OUTER
          // wrapper (containerRef) is React-owned and ALWAYS mounted —
          // we never swap it for a button when paused, because that flip
          // crashed React with "NotFoundError: removeChild" (YT had
          // already replaced the inner DOM, so React couldn't find what
          // it expected to remove). Pause now just calls pauseVideo();
          // the iframe stays in the DOM. The "play" overlay button is
          // rendered on top when !playing.
          <>
            {/* Mobile: visada rodom iframe'ą be overlay mygtuko. Useris valdo
                grojimą per pačios YouTube'o native controls — nereikia
                kovoti su Safari iOS autoplay'aus blokavimu, gesture
                context'u, ar postMessage komandom. Simpler = bulletproof.
                Desktop'as toliau naudoja YT.Player JS API per containerRef. */}
            {/* Unified iframe approach (2026-05-06 v3): mobile + desktop abu
                naudoja plain iframe su autoplay=1. YT.Player JS API anksčiau
                buvo desktop'ui programmatic'iam pause control'ui, bet creation
                useEffect'e prarasdavo user gesture context'ą — autoplay block.
                Plain iframe mount'inamas React render'yje kuris paleistas iš
                click handler'io → gesture preserved → autoplay leidžiamas.
                Pause kontrolė nuėjo į iframe'o vidų (user'is naudoja YT
                chrome controls). Track switching = key changes → React
                remount'ina iframe'ą, senas iframe naikina + sustabdo audio. */}
            {/* YT.Player target wrapper'is — stable React-owned div'as.
                YT.Player(target) constructor'is įdeda iframe'ą JS'u į
                containerRef'ą; React niekad jo neunmount'ina dėl JSX flip'o.
                Visada matomas, kai displayVid yra. Plain iframe BUVO čia
                anksčiau — pasišalintas, kad nebebūtų double-play (YT.Player
                + plain iframe abu groti vienu metu, hidden background = ne-
                kontroliuojamas). */}
            <div
              ref={containerRef}
              className={`absolute inset-0 h-full w-full ${isEmbedDisabled || !playing ? 'hidden' : ''}`}
            />
            {/* Mobile unmute hint — kai mobile'e paleidžiam su mute=1,
                rodom mažą semi-transparent badge top-right kampe.
                Paspaudus — kvieci YT.Player.unMute() (gesture preserved)
                + skipped per session po pirmo unmute'o. */}
            {playing && !isEmbedDisabled && isMobileVP && needsUnmute && (
              <button
                type="button"
                onClick={() => {
                  try { playerRef.current?.unMute?.() } catch {}
                  setNeedsUnmute(false)
                }}
                className="absolute right-2 top-2 z-20 flex items-center gap-1.5 rounded-full bg-black/70 backdrop-blur-sm px-3 py-1.5 text-white text-xs font-bold shadow-lg ring-1 ring-white/20 hover:bg-black/85 transition-colors"
                title="Įjungti garsą"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                </svg>
                Garsui
              </button>
            )}
            {/* Fallback kai embed'as išjungtas (Klaida 153 / kodai 101, 150).
                Rodom thumbnail + "Žiūrėti YouTube'e" CTA. Veikia tiek desktop
                (po YT.Player onError), tiek mobile (po pre-flight check'o
                jei pridėtas — kol kas mobile fallback'inasi tik per natural
                YouTube error puslapį iframe'e). */}
            {isEmbedDisabled && (
              <div className="absolute inset-0 flex items-center justify-center bg-black overflow-hidden">
                {showThumb && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`https://i.ytimg.com/vi/${displayVid}/hqdefault.jpg`}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="absolute inset-0 h-full w-full object-cover opacity-70"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/40" />
                <a
                  href={`https://www.youtube.com/watch?v=${displayVid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative z-10 flex flex-col items-center gap-3 text-white text-center px-6"
                >
                  <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-red-600 shadow-[0_10px_40px_rgba(0,0,0,0.5)] ring-[6px] ring-white/10">
                    <svg viewBox="0 0 24 24" width="32" height="32" fill="#fff" aria-hidden>
                      <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/>
                    </svg>
                  </span>
                  <div className="text-sm font-medium">Žiūrėti YouTube'e</div>
                  <div className="text-xs text-white/70 max-w-xs">
                    Šio video savininkas išjungęs įterpimą trečiose svetainėse
                  </div>
                </a>
              </div>
            )}
            {!playing && (
              <button
                type="button"
                onClick={() => {
                  const target = activeTrackId ?? firstWithVideo?.id
                  if (target != null && target !== activeTrackId) onSelectTrack(target)
                  onRequestPlay()
                  if (target != null) pingPlay(target)
                }}
                aria-label="Paleisti"
                className="group absolute inset-0 z-10 block cursor-pointer overflow-hidden border-0 p-0"
                style={{ background: 'var(--player-placeholder-bg, linear-gradient(135deg, #1a2436 0%, #0f1825 50%, #0a0f1a 100%))' }}
              >
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
                {showThumb && (
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-black/30" />
                )}
                {!showThumb && (
                  <div className="absolute inset-0 opacity-[0.03]" style={{
                    backgroundImage: 'radial-gradient(circle at center, transparent 30%, rgba(249,115,22,0.4) 30.5%, transparent 31.5%, transparent 60%, rgba(249,115,22,0.2) 60.5%, transparent 61.5%)',
                    backgroundSize: '400px 400px',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                  }} />
                )}
                {/* Play overlay — kampe (bottom-right), kad neuždengtų
                    video thumbnail kompozicijos. Anksčiau buvo centre per
                    `left-1/2 top-1/2 -translate`, blokuodavo veidus/scenos. */}
                <span className="absolute bottom-3 right-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-orange)] shadow-[0_8px_24px_rgba(249,115,22,0.5)] ring-[3px] ring-white/15 transition-transform duration-200 group-hover:scale-110 sm:h-14 sm:w-14">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="#fff" aria-hidden className="ml-0.5">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
              </button>
            )}
          </>
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

      {/* Filter — segmented pill stilius (kaip LikePill), CENTERED.
          Order: Visos | Singlai | Naujausios. Visos/Naujausios feminine
          plural (matches „dainos"), Singlai masculine (atskira reikšmė). */}
      <div className="flex justify-center border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2">
        <div className="inline-flex overflow-hidden rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] font-['Outfit',sans-serif] text-[11.5px] font-bold">
          <button
            onClick={() => setFilter('all')}
            className={[
              'px-3 py-1.5 transition-colors',
              filter === 'all'
                ? 'bg-[var(--accent-orange)] text-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
            ].join(' ')}
          >
            Top · {tracksAllTime.length}
          </button>
          {hasSingles && (
            <button
              onClick={() => setFilter('singles')}
              className={[
                'border-l border-[var(--border-subtle)] px-3 py-1.5 transition-colors',
                filter === 'singles'
                  ? 'bg-[var(--accent-orange)] text-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
              ].join(' ')}
            >
              Singlai · {singleTrackIds.size}
            </button>
          )}
          {hasNew && (
            <button
              onClick={() => setFilter('new')}
              className={[
                'border-l border-[var(--border-subtle)] px-3 py-1.5 transition-colors',
                filter === 'new'
                  ? 'bg-[var(--accent-orange)] text-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
              ].join(' ')}
            >
              Naujausios · {newTrackIds.size}
            </button>
          )}
        </div>
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
              {filter === 'new' ? 'Per 2 metus naujų nebuvo' : filter === 'singles' ? 'Singlų nėra' : 'Dainų nėra'}
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {list.map((t, i) => {
              const v = yt(t.video_url)
              const isActive = t.id === activeTrackId
              // Be programmatic YT.Player API'os neturime tikslaus play/pause
              // state'o. UI rodo selected indicator kai `isActive`, bet
              // nesimuluojame "playing" arba pause'inimo logikos — user'is
              // valdys YT chrome'e iframe'o viduje.
              const isActivelyPlaying = false
              // Popularity bar — vieninga logika su signal'o fallback'u.
              // Hierarchy: like_count → score → video_views (log) →
              // position. Naujai importuotam intl atlikėjui (kol nėra
              // likes) bar'ai rodomi pagal score arba YT views, ne 0.
              // 2026-05-13 Push 3b fix: visada naudojam ALL-TIME popularity
              // rank'ą iš `allTimePopLevelById` — taip singles tab'e (sortinta
              // pagal year DESC) bar'ai atspindi tikrą populiarumą, ne idx
              // chronologinį. Jei track'as nepasitaiko mapose (edge case),
              // fallback'as į senąją idx-percentile logiką.
              const pop = allTimePopLevelById.get(t.id) ?? popLevelWithFallback(t, i, list.length, popInfo)
              return (
                <li key={t.id} className="group/row">
                  {/* Spotify-style split row (2026-05-10 UX):
                       • Click row body (#, title, popbar) → PLAY (if video)
                       • Click ▶ button → PLAY (explicit)
                       • Click ⋯ button → MODAL (lyrics + comments)
                      Anksciau title btn atidarydavo modal'a, ▶ btn play —
                      du tap targets, inconsistent. Dabar row visada PLAY,
                      ⋯ menu atskirai info'i. */}
                  <div
                    onClick={() => v && handleSelect(t.id)}
                    role={v ? 'button' : undefined}
                    tabIndex={v ? 0 : undefined}
                    onKeyDown={(e) => { if (v && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); handleSelect(t.id) } }}
                    aria-label={v ? `Leisti ${t.title}` : `${t.title} — video nėra`}
                    className={[
                      'flex w-full items-center gap-2 px-3 py-2 transition-colors',
                      isActive ? 'bg-[rgba(249,115,22,0.08)]' : 'hover:bg-[var(--bg-hover)]',
                      v ? 'cursor-pointer' : '',
                    ].join(' ')}
                  >
                    {/* Position number */}
                    <span
                      className={[
                        'w-5 shrink-0 text-center font-["Outfit",sans-serif] text-[12px] font-bold tabular-nums',
                        isActive ? 'text-[var(--accent-orange)]' : 'text-[var(--text-faint)]',
                      ].join(' ')}
                      aria-hidden
                    >
                      {i + 1}
                    </span>

                    {/* Title + PopBar — plain text (ne button); click'as
                        bubble'ina į row'ą. Release date badge ant svežių. */}
                    <div className="flex min-w-0 flex-1 flex-col items-start">
                      <div className={[
                        'flex w-full items-center gap-1.5 font-["Outfit",sans-serif] text-[13px] font-bold leading-tight',
                        isActive ? 'text-[var(--accent-orange)]' : 'text-[var(--text-primary)]',
                      ].join(' ')}>
                        {/* SEO: title kaip <a href> — crawler sees a real link
                            to the track page. User click → preventDefault →
                            bubble'inasi į parent row (play). Middle-click /
                            cmd-click natūraliai atidaro track page naujam
                            tab'e. Color/decoration inherit'inami iš parent
                            div'o (kad atrodytų identiškai senam <span>). */}
                        {artistSlug ? (
                          <a
                            href={`/dainos/${artistSlug}-${t.slug}-${t.id}`}
                            onClick={(e) => e.preventDefault()}
                            className="truncate text-inherit no-underline hover:underline"
                          >
                            {t.title}
                          </a>
                        ) : (
                          <span className="truncate">{t.title}</span>
                        )}
                        {(() => {
                          const yr = (t as any).release_year
                          const mo = (t as any).release_month
                          const dy = (t as any).release_day
                          if (!yr) return null
                          const showAlways = filter === 'singles'
                          const showAsNew = newTrackIds.has(t.id)
                          if (!showAlways && !showAsNew) return null
                          const pad = (n: number) => String(n).padStart(2, '0')
                          // Singles filter → tik metai (kompaktiškiau, exact dates
                          // čia ne tiek svarbu). Naujausios filter → pilna data.
                          const dateLabel = showAlways
                            ? String(yr)
                            : mo && dy
                              ? `${yr}-${pad(mo)}-${pad(dy)}`
                              : mo
                                ? `${yr}-${pad(mo)}`
                                : String(yr)
                          return (
                            <span
                              className="shrink-0 rounded bg-[rgba(59,130,246,0.16)] px-1.5 py-0.5 font-['Outfit',sans-serif] text-[9.5px] font-extrabold tabular-nums tracking-wider text-[#60a5fa]"
                              title={`Išleista ${dateLabel}`}
                            >
                              {dateLabel}
                            </span>
                          )
                        })()}
                      </div>
                      <PopBar level={pop} />
                    </div>

                    {/* Lyrics/info button — visada matomas (anksčiau ⋯ buvo
                        opacity-0 desktop'e, neryški). Dabar — pillow su
                        „♪ Žodžiai" tekstu, aiškiai komunikuoja, kas atsidarys
                        modal'e. Subtilus card-bg, hover gauna orange tint. */}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onOpenTrackInfo(t) }}
                      aria-label={`${t.title} — daugiau informacijos`}
                      title="Daugiau: žodžiai, komentarai, video"
                      className="flex shrink-0 items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] px-2.5 py-1 font-['Outfit',sans-serif] text-[10.5px] font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-orange)] hover:bg-[rgba(249,115,22,0.1)] hover:text-[var(--accent-orange)]"
                    >
                      {/* Burger/text-lines icon — universal "open details" */}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                        <line x1="4" y1="7" x2="20" y2="7" />
                        <line x1="4" y1="12" x2="20" y2="12" />
                        <line x1="4" y1="17" x2="14" y2="17" />
                      </svg>
                      <span className="hidden sm:inline">Daugiau</span>
                    </button>

                    {/* Play / pause — explicit target (taip pat veikia row click).
                        stopPropagation kad nesusidublina su row handler. */}
                    <button
                      onClick={(e) => { e.stopPropagation(); if (v) handleSelect(t.id) }}
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

/** Hierarchinis populiarumo signalas tarp atlikėjo trekų. Naujam intl
 *  atlikėjui (pvz. Coldplay'ui ką tik importavus) like_count'ai 0 — todėl
 *  fallback'inam į score, paskui video_views (log scale, kad 1B vs 21M
 *  nebūtų iškraipyta), galiausiai į position-based hint'ą. Kiekvienam
 *  track'ui skaičiuojam su tuo pačiu signalu, kad palyginimai būtų
 *  prasmingi (mix'inti likes su score nelygintų niekuo).
 *
 *  signal: 'likes' | 'score' | 'views' | 'none'
 *  popValue(t): išversta į max-comparable skalę
 *  maxValue:    didžiausia value tarp visų artist trekų
 */
type PopSignal = 'composite' | 'none'

/** Composite popularity score — identiškas tracksAllTime sort formule.
 *  Vienas šaltinis truth tiek sortinimui, tiek PopBar level'iui →
 *  visada konsistentinga: kuo aukščiau sąraše, tuo daugiau dashes. */
export function trackCompositeScore(t: any): number {
  const viewsLog = Math.log10((t?.video_views || 0) + 1) * 50
  const likesLog = Math.log10((t?.like_count || 0) + 1) * 10
  const single = t?.is_single ? 10 : 0
  const video = t?.video_url ? 5 : 0
  return viewsLog + likesLog + single + video
}

/** Adaptive variant — LT-like atlikėjams (Mamontovas, Mikutavičius) views
 *  dengia tik kelis track'us iš šimtų (YT enrichment dar nepravažiavo per
 *  legacy LT scrape), todėl views-dominant default'as nestabiliai eilėje
 *  iškelia 1-2 atsitiktinius YT-su-views track'us virš visų klasikinių
 *  community-love hit'ų.
 *
 *  Coverage threshold (≥30% tracks su >0 views) skiria INTL nuo LT case'o:
 *    - INTL (≥30% coverage) → standard views-dominant trackCompositeScore.
 *    - LT (<30%)           → likes-dominant: like_count×100 + viewsLog×5.
 *
 *  Sukurta vienos eilės factory'oje, kad ta pati formulė naudotų sort'ą,
 *  popbar percentile, ir player'io „top dainos" iškėlimą. */
export function makeArtistTrackScorer(tracks: any[]): (t: any) => number {
  const N = tracks.length
  if (N === 0) return trackCompositeScore
  let withViews = 0
  for (const t of tracks) if ((t?.video_views || 0) > 0) withViews++
  const coverage = withViews / N
  if (coverage >= 0.30) return trackCompositeScore
  // LT-like artist — like_count dominates, views only break ties.
  return (t: any) => {
    const likesLog = Math.log10((t?.like_count || 0) + 1) * 100
    const viewsLog = Math.log10((t?.video_views || 0) + 1) * 5
    const single = t?.is_single ? 10 : 0
    const video = t?.video_url ? 5 : 0
    return likesLog + viewsLog + single + video
  }
}

function detectPopSignal(allTracks: any[]): { signal: PopSignal; max: number } {
  let max = 0
  for (const t of allTracks) {
    const c = trackCompositeScore(t)
    if (c > max) max = c
  }
  return { signal: max > 0 ? 'composite' : 'none', max }
}

function trackPopValue(t: any, signal: PopSignal): number {
  if (signal === 'composite') return trackCompositeScore(t)
  return 0
}

/** PopBar level — PERCENTILE-based (rank tarp esamo list'o). Sąrašas
 *  jau atrūšiuotas pagal composite score desc (trackSortVal), todėl idx
 *  yra rank'as: idx=0 → top track, idx=N-1 → bottom track.
 *  Kvintiliais (20% kiekvienam level'iui):
 *    • Top 20%   → 5/5
 *    • 20–40%    → 4/5
 *    • 40–60%    → 3/5
 *    • 60–80%    → 2/5
 *    • Bottom 20%→ 1/5
 *  Tai garantuoja UNIFORM dashes distribuciją per visą list'ą — anksčiau
 *  value/max ratio versija sukurdavo skewed bias kai top track turėjo
 *  daug daugiau composite nei vidurys (everyone got 1-2/5).
 *
 *  popInfo paliktas signature'oj (legacy callers), bet jo signal'as
 *  naudojamas TIK tam, kad nutart, ar yra bent kokia data:
 *    • 'none' → grąžinam 0 (tuščias bar, "neturime info")
 *    • bet kas kita → percentile'as iš idx/total.
 */
function popLevelWithFallback(
  _t: any,
  idx: number,
  total: number,
  popInfo: { signal: PopSignal; max: number }
): number {
  if (popInfo.signal === 'none' || total <= 0) {
    if (total <= 1) return 3
    const ratio = (total - idx) / total
    return Math.max(1, Math.min(5, Math.ceil(ratio * 5)))
  }
  const p = idx / total
  if (p < 0.20) return 5
  if (p < 0.40) return 4
  if (p < 0.60) return 3
  if (p < 0.80) return 2
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
  track, artistName, artistSlug, artistThumbUrl, onClose,
  activeTrackId, playing,
  onMobileInlineChange,
  onPrevTrack, onNextTrack, onDockedPlayerChange,
  artistTracks, onSelectTrack,
}: {
  track: Track | null; artistName: string; artistSlug: string
  /** Artist'o profilio nuotrauka headeryje šalia title + name. */
  artistThumbUrl?: string | null
  onClose: () => void
  /** Legacy props — play/pause control moved to YouTube iframe native UI.
   *  Accepted but unused to avoid breaking call sites mid-refactor. */
  onPlay?: (t: Track) => void
  onPause?: () => void
  activeTrackId?: number | null
  playing?: boolean
  /** Fires when the modal owns an inline mobile player (mobile only). Parent
   *  uses this to suppress the hero player iframe so audio doesn't double up. */
  onMobileInlineChange?: (active: boolean) => void
  /** Navigate to previous/next track with video. Parent computes order from
   *  its full tracks list. Passed null when no neighbor available. */
  onPrevTrack?: (() => void) | null
  onNextTrack?: (() => void) | null
  /** Fires when the modal renders a docked player on desktop (≥1280px) —
   *  parent suppresses the hero player to avoid duplicate audio. */
  onDockedPlayerChange?: (active: boolean) => void
  /** All artist tracks — naudojam dock'e kaip "Daugiau iš {atlikėjo}"
   *  rekomendacijų sąrašą. Modal'as pats filtruoja ir surūšiuoja. */
  artistTracks?: Track[]
  /** Direct switch to any track — naudojam kai useris paspaudžia
   *  dock'o "panašios dainos" sąrašo įrašą. */
  onSelectTrack?: (t: Track) => void
}) {
  // (removed: `mounted` state + rAF entrance animation — replaced with
  //  always-visible aside. Reason: opacity-0 + translate-y-full initial state
  //  could get stuck on iOS Safari if rAF/setMounted didn't propagate, leaving
  //  user with backdrop-blur but invisible aside.)
  // Local "self liked" toggle for the LikePill — track page'as pats turi pilną
  // optimistic-update logiką. Drawer'is paprastesnis: vizualus toggle, kad
  // user'is matytų reakciją; pilnas like persist'inimas vyksta track puslapyje.
  const [selfLiked, setSelfLiked] = useState(false)
  // Likers modal valdymas — atidarymas iš LikePill onOpenModal callback'o.
  const [likersOpen, setLikersOpen] = useState(false)
  const [likersUsers, setLikersUsers] = useState<Array<{ user_username: string; user_rank: string | null; user_avatar_url: string | null }> | null>(null)
  // Mobile tab — split-column layout netelpa siaurame ekrane (lyrics +
  // komentarai vienu metu uždusina abu, scroll'ai painiojasi). Mobile'e
  // rodom tik VIENĄ skiltį per kartą su tab toggle viršuje.
  const [mobileTab, setMobileTab] = useState<'lyrics' | 'comments'>('lyrics')
  // Comment count emitted from EntityCommentsBlock — pajamas mobile tab chip.
  const [commentTotal, setCommentTotal] = useState(0)
  // Mobile inline player. Mobile'e modal'as fullscreen → hero player'is
  // (desktop dešiniajame stulpelyje) lieka uz nugaros, useris nemato. Vietoj
  // hero, mobile'e renderinam inline iframe modal'o body top'e. Parent
  // pranešam per `onMobileInlineChange`, kad jis suppress'intų hero — kitaip
  // audio dvigubintų.
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const m = window.matchMedia('(max-width: 1023px)')
    setIsMobile(m.matches)
    const h = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    m.addEventListener('change', h)
    return () => m.removeEventListener('change', h)
  }, [])
  // Mobile'e modal'o iframe'as visada matomas (kai track turi video) — tai
  // suppress'inam hero player'į kad audio nedvigubėtų. Desktop'e flag false
  // (hero player'is veikia normaliai šalia modal'o).
  const trackVid = yt(track?.video_url || null)
  // (Dock mode pašalintas — visi viewport'ai naudoja standard modal.)
  // onDockedPlayerChange visad fire'inamas false, kad parent suppression
  // logic'as nelaužtųsi. onMobileInlineChange dabar pažymi kai modal'o
  // VIDEO TOGGLE įjungtas (cross-viewport) — declared žemiau, todėl
  // effect yra dar žemiau (po showVideo state'o).
  useEffect(() => {
    onDockedPlayerChange?.(false)
    return () => onDockedPlayerChange?.(false)
  }, [onDockedPlayerChange])
  // userNavigated — true po pirmo prev/next click'o. Naudojam tam, kad
  // pradinio modal'o atidarymo metu iframe nepradėtų groti automatiškai
  // (autoplay=0), o tik kai useris aktyviai pereina į kitą dainą — gestūra
  // → autoplay=1, naršyklė leidžia. Reset'inam kai modal'as užda (track=null).
  const [userNavigated, setUserNavigated] = useState(false)
  useEffect(() => { if (!track) setUserNavigated(false) }, [track])

  // Ref body scroll container'ui — scroll position reset'ui kai tab keičiasi.
  const bodyScrollRef = useRef<HTMLDivElement>(null)
  // Ref iframe'ui — naudojam postMessage'ą trigger'inti playVideo iš user gesture.
  // Anksčiau iframe key=trackVid + autoplay=1 — bet kai kuriose Safari versijose
  // autoplay neveikia despite user gesture. postMessage('playVideo') via
  // YouTube IFrame API yra patikimas būdas — iframe jau load'inta, click → play.
  const videoIframeRef = useRef<HTMLIFrameElement>(null)
  // videoStarted — false default, rodom thumbnail + orange play overlay.
  // Click → postMessage play + hide overlay. Iframe always-mounted (background).
  const [videoStarted, setVideoStarted] = useState(false)

  // Reset scroll position kai user perjungia tab — naujas tab visada start'uoja viršuje.
  useEffect(() => {
    bodyScrollRef.current?.scrollTo({ top: 0 })
  }, [mobileTab])

  // Notify parent SUPPRESS hero player tik kai modal video AKTYVIAI groja.
  // Default modal open + thumbnail showing → hero gali toliau groti (audio +
  // matosi pro lighter desktop backdrop). Tik kai user paspaudžia modal'o
  // orange play → setVideoStarted(true) → onMobileInlineChange(true) →
  // hero pause'inamas (kad audio nedvigubėtų).
  useEffect(() => {
    onMobileInlineChange?.(!!(trackVid && videoStarted))
    return () => onMobileInlineChange?.(false)
  }, [trackVid, videoStarted, onMobileInlineChange])

  useEffect(() => {
    if (!track) return
    // Escape key handler.
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', h)
    // Body scroll lock — position:fixed pattern (iOS-safe). Plain overflow:hidden
    // ant body'o neveikia patikimai iOS Safari'e — kai modal'as portaled į body,
    // jis pats sukuria scrollable area aukščiau body'o limito. position:fixed
    // pin'ina body į dabartinę scrollY poziciją.
    const scrollY = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.left = '0'
    document.body.style.right = '0'
    document.body.style.width = '100%'
    // Per-track state reset.
    setSelfLiked(false)
    setMobileTab('lyrics')
    setVideoStarted(false)
    return () => {
      window.removeEventListener('keydown', h)
      // Atstatom body į normalų state ir grąžinam į prieš tai buvusią scroll poziciją.
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.left = ''
      document.body.style.right = ''
      document.body.style.width = ''
      window.scrollTo(0, scrollY)
    }
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
    onClose()
  }

  if (!track) return null
  // createPortal lower down needs document.body — bail on SSR.
  if (typeof document === 'undefined') return null

  const dur = fmtDur(track.duration)
  const year = track.release_year || (track.release_date ? new Date(track.release_date).getFullYear() : null)
  // Tikslesnė LT data, kai turim mėnesį/dieną — singlams ji rodoma
  // orange spalva (pabrėžimas), kitiems — tik metai muted.
  const ltMonths = ['sausio','vasario','kovo','balandžio','gegužės','birželio','liepos','rugpjūčio','rugsėjo','spalio','lapkričio','gruodžio']
  const fullDate = track.release_date
    ? (() => { const d = new Date(track.release_date!); return isNaN(d.getTime()) ? null : `${d.getFullYear()} m. ${ltMonths[d.getMonth()]} ${d.getDate()} d.` })()
    : (track.release_year && track.release_month ? `${track.release_year} m. ${ltMonths[track.release_month - 1]} mėn.` : null)
  const dateLabel = fullDate || (year ? `${year} m.` : null)
  const baseLikes = typeof track.like_count === 'number' ? track.like_count : 0
  const likes = baseLikes + (selfLiked ? 1 : 0)
  const lyrics = (track.lyrics || '').trim()
  const lyricsText = lyrics ? lyrics.replace(/<[^>]+>/g, '').trim() : null
  const trackHref = `/dainos/${artistSlug}-${track.slug}-${track.id}`
  // Side-video iframe disabled for now — duplicating the YouTube embed
  // (one in hero, one in modal area) caused two audio streams to play
  // and the second iframe's teardown threw NotFoundError when the user
  // hit pause. Hero player handles playback; modal stays on lyrics +
  // comments. Future: portal hero player into a modal-aware container
  // instead of duplicating.

  // ── Likers Modal (shared between dock + standard) ──────────────────
  const LikersOverlay = likersOpen ? (
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
  ) : null

  // (Removed: separate dock mode for ≥1280px. Reason: useriai sakė, kad
  //  full-screen dock layout atrodė kaip page'as, ne modalas. Dabar visi
  //  viewport'ai naudoja standard modal — bottom sheet mobile, centered
  //  card desktop. Vienodas elgesys = bulletproof, vienodi mental model.)

  // ════════════════════════════════════════════════════════════════════
  // STANDARD MODAL — mobile bottom sheet + desktop centered card.
  // KEY FIX: aside turi FIXED aukštį (h-[90vh]/h-[85vh]) ir overflow-hidden.
  // Anksčiau max-h be overflow-hidden — content galėjo overflow, aside neturėjo
  // griežto bounding box, body flex-1 min-h-0 neturėjo aiškios space'o.
  // Dabar:
  //   • aside h-[90vh] sm:h-[85vh] = griežtas aukštis
  //   • aside overflow-hidden = vaikai negali iškritti
  //   • visi vaikai išskyrus body — shrink-0 (header, meta, player, tabs)
  //   • body = flex-1 min-h-0 = užima likusią aukštį, leidžia shrink'intis
  //   • body vaikai (lyrics/comments cols) — overflow-y-auto kiekvienas
  // Mobile useris paskrolint gali lyrics text'ą lengvai.
  // ════════════════════════════════════════════════════════════════════
  return createPortal(
    <div
      className={[
        'fixed inset-0 z-[9999] flex items-end justify-center backdrop-blur-sm sm:items-center',
        // Backdrop dimming: stiprus mobile (focus modal), švelnesnis desktop'e
        // (kad user'is matytų artist'o page'ą + hero player'į pro modal'ą).
        'bg-black/60 sm:bg-black/30',
        // Wide desktop (≥lg) — modal'as align'inamas kairiau nei center, bet
        // ne į kraštą — kad hero player'is dešinėj liktų aiškiai matomas.
        'lg:justify-start lg:pl-[10%]',
      ].join(' ')}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      {/* ════════════════════════════════════════════════════════════════
          STANDARD MODAL ASIDE — bulletproof scroll-everywhere approach.

          Filosofija:
          • max-h-[90vh] (NE fixed h-[90vh]) — modal'as user-content-sized,
            nesistengia užimti pilnos 90vh kai content trumpas. Tai elgesys,
            kurio user'is tikisi — small content → small modal.
          • overflow-hidden ant aside (kad rounded corner'iai apkirptų vaikus).
          • Header'is + meta + mobile player + tabs — visi shrink-0, sticky'ish
            viršuje. Niekada nedingsta — visada matomi.
          • Body — VIENA scroll kolona (overflow-y-auto). VISKAS body'je
            scroll'inasi kartu — be nested scroll'ų, be flex-row split'ų.
          • Mobile tabs perjungia lyrics ↔ komentarai TAME PAČIAME body'je.
            Desktop ≤lg taip pat — vienodas elgesys, nesusiveda į edge case'us.
          • Wide desktop (≥lg) su lyrics → split UI gyvena tik dock mode'e
            (≥1280px). Ten useris turi pakankamai vietos pilnam takeover'iui.
          • overscroll-contain — iOS Safari'e nepralaužia į body scroll. */}
      <aside
        role="dialog"
        aria-label={`Apie dainą ${track.title}`}
        onClick={(e) => e.stopPropagation()}
        className={[
          'flex w-full flex-col overflow-hidden bg-[var(--bg-surface)] shadow-[0_24px_60px_-10px_rgba(0,0,0,0.5)]',
          // FIXED height (NE max-h) — kad content swap (tab perjungimas)
          // neresize'intų modal'o. User'is mato stabilią modal box dimension'ą.
          'h-[90vh] rounded-t-2xl',
          'sm:h-[85vh] sm:rounded-2xl sm:mx-4 sm:max-w-[720px]',
        ].join(' ')}
      >
        {/* Mobile handle bar */}
        <div className="flex shrink-0 justify-center pt-2 pb-1 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-[var(--border-default)]" />
        </div>

        {/* Header — thumb + title + artist + external link + close. */}
        <div className="flex shrink-0 items-center gap-2.5 border-b border-[var(--border-subtle)] px-4 py-2">
          {artistThumbUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={proxyImg(artistThumbUrl)}
              alt={artistName}
              referrerPolicy="no-referrer"
              style={{ objectPosition: 'center top' }}
              className="h-9 w-9 shrink-0 rounded-lg border border-[var(--border-subtle)] object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate font-['Outfit',sans-serif] text-[15px] font-extrabold leading-tight text-[var(--text-primary)]">
              {track.title}
            </div>
            <div className="truncate text-[11.5px] leading-tight">
              {formatArtistList(
                { id: -1, slug: artistSlug, name: artistName },
                track.featuring || [],
              )}
            </div>
          </div>
          <Link
            href={trackHref}
            target="_blank"
            rel="noopener"
            title="Atidaryti dainos puslapį naujame lange"
            aria-label="Atidaryti dainos puslapį"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          >
            <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 3h7v7M21 3l-9 9M5 5h6M5 5v14h14v-6" />
            </svg>
          </Link>
          <button
            onClick={handleClose}
            aria-label="Uždaryti"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          >
            <svg viewBox="0 0 16 16" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        {/* Row 2: 2-col split — video LEFT (60%), meta stack RIGHT (40%).
            Video visada matomas (mažas), useris gali click'inti native play
            arba YouTube fullscreen'inti. Meta — popbar (reactions) +
            likes + data + albums vertikaliai dešinėj. */}
        <div className="grid shrink-0 grid-cols-[minmax(0,3fr)_minmax(0,2fr)] border-b border-[var(--border-subtle)]">
          {/* Left: video.
              ARCHITEKTURA: iframe always-mounted (background) su enablejsapi=1.
              Overlay (thumbnail + orange play button) covers iframe kol
              user'is nepaspaudė. Click → postMessage('playVideo') → iframe
              start'uoja groti + overlay fade out. User gesture preserved.
              max-h apsaugo nuo per-tall video kai grid leidžia per-wide. */}
          <div className="relative aspect-video max-h-[220px] w-full overflow-hidden bg-black sm:max-h-[340px]">
            {trackVid ? (
              <>
                {/* Background iframe — always loaded so postMessage veiks be delay. */}
                <iframe
                  ref={videoIframeRef}
                  key={`modal-video-${trackVid}`}
                  src={`https://www.youtube.com/embed/${trackVid}?playsinline=1&rel=0&modestbranding=1&iv_load_policy=3&enablejsapi=1&origin=${typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : ''}`}
                  title={`${track.title} — ${artistName}`}
                  className="absolute inset-0 h-full w-full"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                />
                {/* Overlay — thumbnail + orange play button. Click → postMessage play. */}
                {!videoStarted && (
                  <button
                    type="button"
                    onClick={() => {
                      setVideoStarted(true)
                      // postMessage YouTube IFrame API: trigger play. Source/target
                      // origin '*' yra OK čia, nes komandą siunčiam į mūsų pačių
                      // embed'intą iframe'ą (saugumas iframe leidžia/blokuoja).
                      videoIframeRef.current?.contentWindow?.postMessage(
                        JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
                        '*',
                      )
                    }}
                    aria-label={`Leisti ${track.title} vaizdo įrašą`}
                    className="group absolute inset-0 block h-full w-full overflow-hidden"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://i.ytimg.com/vi/${trackVid}/hqdefault.jpg`}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/25 transition-colors group-hover:bg-black/40" />
                    {/* Site orange play button — matchina artist page hero stilių. */}
                    <span className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--accent-orange)] shadow-[0_8px_24px_rgba(249,115,22,0.5)] ring-[3px] ring-white/15 transition-transform group-hover:scale-110 sm:h-14 sm:w-14">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </span>
                  </button>
                )}
              </>
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
                Vaizdo įrašo nėra
              </div>
            )}
          </div>

          {/* Right: meta stack — likes (fixed width), tarpas, data + albumai.
              items-start kad LikePill nesistretchintų per visą col plotį. */}
          <div className="flex flex-col items-start gap-1 border-l border-[var(--border-subtle)] px-2.5 py-2 text-[11px]">
            {/* DropBar (emoji reactions) paslėpta — re-enable kai user'iui jis taps relevant. */}
            <LikePill
              likes={likes}
              selfLiked={selfLiked}
              onToggle={() => setSelfLiked(v => !v)}
              onOpenModal={() => setLikersOpen(true)}
              variant="surface"
            />
            {dateLabel && (
              <span className="mt-2 font-['Outfit',sans-serif] text-[11px] font-extrabold leading-tight text-[var(--text-primary)]">
                {dateLabel}
              </span>
            )}
            {dur && (
              <span className="truncate font-['Outfit',sans-serif] text-[11px] font-bold tabular-nums text-[var(--text-muted)]">
                {dur}
              </span>
            )}
            {(track.albums || []).slice(0, 2).map((al) => (
              <Link
                key={al.id}
                href={`/lt/albumas/${al.slug}/${al.id}`}
                target="_blank"
                rel="noopener"
                title={al.title}
                className="flex min-w-0 items-center gap-1.5 no-underline"
              >
                <span className="h-5 w-5 shrink-0 overflow-hidden rounded bg-[var(--cover-placeholder)]">
                  {al.cover_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={proxyImg(al.cover_image_url)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                  ) : null}
                </span>
                <span className="line-clamp-2 font-['Outfit',sans-serif] text-[10.5px] font-extrabold leading-tight text-[var(--text-secondary)]">
                  {al.title}
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* Tabs — tik kai lyrics yra. Visiems viewport'ams. */}
        {lyricsText && (
          <div className="flex shrink-0 items-center gap-4 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-1.5">
            <button
              type="button"
              onClick={() => setMobileTab('lyrics')}
              className={[
                "relative flex items-center gap-1.5 px-1 py-1 font-['Outfit',sans-serif] text-[12px] font-bold transition-colors",
                mobileTab === 'lyrics'
                  ? 'text-[var(--accent-orange)] after:absolute after:inset-x-0 after:-bottom-[8px] after:h-[2px] after:bg-[var(--accent-orange)]'
                  : 'text-[var(--text-muted)]',
              ].join(' ')}
            >
              Tekstas
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('comments')}
              className={[
                "relative flex items-center gap-1.5 px-1 py-1 font-['Outfit',sans-serif] text-[12px] font-bold transition-colors",
                mobileTab === 'comments'
                  ? 'text-[var(--accent-orange)] after:absolute after:inset-x-0 after:-bottom-[8px] after:h-[2px] after:bg-[var(--accent-orange)]'
                  : 'text-[var(--text-muted)]',
              ].join(' ')}
            >
              <span>Komentarai</span>
              {commentTotal > 0 && (
                <span className="rounded-full bg-[var(--accent-orange)] px-1.5 py-px text-[10px] font-extrabold leading-none text-white">
                  {commentTotal}
                </span>
              )}
            </button>
          </div>
        )}

        {/* ── BODY — VIENA scroll kolona ─────────────────────────────────
            flex-1 min-h-0 (užima likusią vietą), overflow-y-auto (scroll'as
            čia ir tik čia), overscroll-contain (iOS Safari fix — scroll'as
            neprasprūsta į pagrindinį page'ą). Vidus — jokio kito overflow,
            jokios flex tricks, tik content stack'as.

            Kas matoma:
            • Jei lyrics yra IR mobileTab='lyrics' → lyrics
            • Jei lyrics yra IR mobileTab='comments' → komentarai
            • Jei lyrics nėra → komentarai (visada).
            Vienoda taisyklė visiems viewport'ams = bulletproof. */}
        <div ref={bodyScrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4">
          {/* Lyrics — always mounted (rodom/slepiam pagal tab), kad
              reactions counts būtų laiku užkrauti. */}
          {lyricsText && (
            <div className={mobileTab === 'lyrics' ? 'block' : 'hidden'}>
              <div className="mb-4 flex items-baseline gap-2">
                <div className="font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  Dainos tekstas
                </div>
                <span className="font-['Outfit',sans-serif] text-[9px] font-extrabold uppercase tracking-wider text-[var(--accent-orange)]">
                  pažymėk → reaguok
                </span>
              </div>
              <LyricsWithReactions trackId={track.id} lyrics={lyricsText} compact />
            </div>
          )}
          {/* Komentarai — taip pat always mounted, kad count badge'as
              būtų populated iškart kai modal'as atsidaro (anksčiau load'inosi
              tik kai user'is paspaudžia tab'ą → 0 rodydavo iki click'o). */}
          <div className={!lyricsText || mobileTab === 'comments' ? 'block' : 'hidden'}>
            <EntityCommentsBlock
              entityType="track"
              entityId={track.id}
              compact
              title="Komentarai"
              onCountChange={setCommentTotal}
            />
          </div>
        </div>
      </aside>

      {LikersOverlay}
    </div>,
    document.body,
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

/** Compact filter chip naudojamas PlayerCard'e — orange-fill kai active,
 *  border kai inactive. Stilius matchina Muzika sekcijos FilterChip
 *  komponentą (ten gyvena per FilterChip), bet šitas padarytas mažesnis,
 *  kad telpa player'io header juostoje. */
function FilterChipMini({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-["Outfit",sans-serif] text-[11px] font-bold transition-all',
        active
          ? 'border-[var(--accent-orange)] bg-[var(--accent-orange)] text-white shadow-[0_2px_8px_rgba(249,115,22,0.25)]'
          : 'border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

// ── Hero: split photo + player, title + likes below title ──────────

function Hero({
  artist, heroImage, loaded, likes, selfLiked, onToggleLike, onOpenLikersModal, selfLikePending,
  tracksAllTime, tracksTrending, activeTrackId, onSelectTrack,
  playing, onRequestPlay, onOpenTrackInfo, hasAnyVideo,
  upcomingEvents, onOpenEventsModal, onOpenHeroLightbox, onOpenEvent,
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
  /** Open photo lightbox at index 0. Optional — kai gallery nėra, hero click nieko nedaro. */
  onOpenHeroLightbox?: () => void
  /** Open EventInfoModal for given event. Forwarded to EventCard variants. */
  onOpenEvent?: (e: any) => void
}) {
  const coverPos = parseCoverPos(artist.cover_image_position || 'center 30%')
  // Hero foto FIXED width 600px desktop'e — be JS-based dimension detection.
  // Anksčiau buvo adaptyvus (380/480/720 pagal natural aspect ratio onLoad'e),
  // bet tai sukeldavo CLS (Cumulative Layout Shift): SSR render'inosi 480px
  // default, paskui image load'as triggerindavo state pakeitimą → container
  // width keisdavosi → visa hero zona reflow'inosi. Vartotojui atrodydavo
  // kaip „cropped" pradžioj, „pilnesni" po refresh'o (cache).
  // Fixed 600px middle-ground — landscape photos look great, portrait
  // get center-cropped pagal cover_image_position. Object-cover handles
  // crop'inimą, nereikia JS measurement'o. */
  const heroWidth = 600

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
                Maskuoja low-res music.lt thumb upscale artifacts.
                BackgroundPosition align'intas su layer 2 objectPosition,
                kad layer 1 (kuris load'as greičiau) iš anksto pozicionuoja
                tinkamą foto dalį — be „crop jump" kai layer 2 atvyksta. */}
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                backgroundImage: `url(${proxyImgResized(heroImage, 400)})`,
                backgroundSize: 'cover',
                backgroundPosition: `${coverPos.x}% ${coverPos.y}%`,
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
              // Resize iki 1200px width — Wikimedia/Supabase originals dažnai
              // 4K+ (~5MB), bet hero render'inasi max 720px desktop / 380px
              // mobile. Su weserv.nl &w=1200&output=webp grąžina ~150-300KB
              // versiją. Mobile load'as nuo 5s+ → <1s.
              src={proxyImgResized(heroImage, 1200)}
              alt={artist.name}
              referrerPolicy="no-referrer"
              loading="eager"
              fetchPriority="high"
              onClick={() => {
                // Open Lightbox at photo[0] (cursor-zoom-in expectation match).
                // Anksčiau buvo desktop-only scrollIntoView('#galerija') — mobile
                // useris nieko negaudavo, o desktop cursor:zoom-in painiojo
                // semantiką (zoom != scroll). Dabar zoom = lightbox visur.
                onOpenHeroLightbox?.()
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
                  <EventCard e={e} variant="vertical" onOpen={onOpenEvent} />
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
          {/* Player wrapper — fixed max-width nepriklausomai nuo playing
              state'o. Anksčiau buvo `playing ? 640px : 440px` toggle su
              300ms transition (intencionali „expansion paleidžiant", bet
              user'iui sukeldavo nemalonų layout shift'ą). Lock'inta į
              640px — column constrain'a iki 460px bet kuriuo atveju. */}
          <div className="w-full lg:max-w-[640px]">
            <PlayerCard
              tracksAllTime={tracksAllTime}
              tracksTrending={tracksTrending}
              activeTrackId={activeTrackId}
              onSelectTrack={onSelectTrack}
              playing={playing}
              onRequestPlay={onRequestPlay}
              onOpenTrackInfo={onOpenTrackInfo}
              hasAnyVideo={hasAnyVideo}
              artistSlug={artist.slug}
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
                <EventCard e={e} variant="upcoming" onOpen={onOpenEvent} />
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
            // MOBILE: leidžiam socials/website wrap'intis į kitą eilutę
            // (visa eilutė 6 icons + website chip dažnai > 400px → mobile'e
            // horizontal scroll). DESKTOP (sm+): ml-auto right-align + nowrap.
            <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-1.5 sm:ml-auto sm:w-auto sm:flex-nowrap">
              {links.filter(l => SOC[l.platform]).map(l => {
                const p = SOC[l.platform]
                return (
                  <a
                    key={l.platform}
                    href={l.url}
                    target="_blank"
                    rel="noopener"
                    title={p.l}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
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
                    className="flex h-10 items-center gap-1.5 rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] px-3 text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" /></svg>
                    <span className="max-w-[160px] truncate font-['Outfit',sans-serif] text-[12.5px] font-bold tracking-tight sm:max-w-none">{domain}</span>
                  </a>
                )
              })()}
            </div>
          )}
        </div>
        {/* Substyles on their own subtle line so the top row stays clean. */}
        {substyles.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {substyles.map(s => (
              <Link
                key={s.name}
                href={`/zanrai/${encodeURIComponent(s.name.toLowerCase().replace(/\s+/g, "-"))}`}
                className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] px-2.5 py-1 font-['Outfit',sans-serif] text-[11px] font-bold text-[var(--text-secondary)] no-underline transition-colors hover:border-[var(--accent-orange)] hover:text-[var(--accent-orange)]"
              >
                {s.name}
              </Link>
            ))}
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
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {substyles.map(s => (
                <Link
                  key={s.name}
                  href={`/zanrai/${encodeURIComponent(s.name.toLowerCase().replace(/\s+/g, "-"))}`}
                  className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] px-2 py-0.5 font-['Outfit',sans-serif] text-[10.5px] font-bold text-[var(--text-secondary)] no-underline transition-colors hover:border-[var(--accent-orange)] hover:text-[var(--accent-orange)]"
                >
                  {s.name}
                </Link>
              ))}
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
  // Apply mojibake fixes BEFORE excerpt processing — anksčiau tik BioModal
  // kviesdavo normalizeBio, todėl hero excerpt'as rodydavo "kĠji"/"pasisekimĠ"
  // BPE artifact'us net kai modal'as juos paslėpdavo. Idempotent — Britney
  // tipo įrašai su mojibake DB'jeje gauna fix'ą display-time.
  const normalized = normalizeBio(html)
  // Whitelist inline tags (<strong>, <em>, <b>, <i>, <a>) — strip block tags
  // (<p>, <ul>, <li>, <h*>, <blockquote>, <img>, <iframe>). Anksčiau stripHtml
  // šalindavo VISKĄ → wall of text be emphasis'ų ar links'ų.
  const cleaned = normalized
    .replace(/<(?:p|div|h[1-6]|li|blockquote)[^>]*>/gi, '')
    .replace(/<\/(?:p|div|h[1-6]|li|blockquote)>/gi, ' ')
    .replace(/<(?:br|hr)\s*\/?>(?=)/gi, ' ')
    .replace(/<(\/?)(?:ul|ol|img|iframe|table|tr|td|th|tbody|thead|figure|figcaption)[^>]*>/gi, '')
    .replace(/\son[a-z]+="[^"]*"/gi, '')
    .replace(/\son[a-z]+='[^']*'/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  const plainLen = cleaned.replace(/<[^>]+>/g, '').length
  let excerpt = cleaned
  let isLong = false
  if (plainLen > maxChars) {
    // Walk through, count visible chars, cut at boundary (avoid mid-tag cut).
    let plainCount = 0
    let cut = 0
    let inTag = false
    for (let i = 0; i < cleaned.length; i++) {
      const ch = cleaned[i]
      if (ch === '<') inTag = true
      else if (ch === '>') { inTag = false; continue }
      if (!inTag) plainCount++
      if (plainCount >= maxChars) { cut = i + 1; break }
    }
    if (cut > 0) {
      excerpt = cleaned.slice(0, cut)
      const lastLt = excerpt.lastIndexOf('<')
      const lastGt = excerpt.lastIndexOf('>')
      if (lastLt > lastGt) excerpt = excerpt.slice(0, lastLt)
      isLong = true
    }
  }
  return (
    <div className="text-[15px] leading-[1.72] text-[var(--text-secondary)] [&_a]:text-[var(--accent-orange)] [&_a]:no-underline hover:[&_a]:underline [&_strong]:text-[var(--text-primary)] [&_b]:text-[var(--text-primary)]">
      <span dangerouslySetInnerHTML={{ __html: excerpt }} />
      {isLong && '…'}
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
  // 2026-05-13 redesign per user feedback: vietoj atsitiktinai išsidėsčiusių
  // pill'ių (kažkurie su data, kažkurie be — atrodė chaosas), padarytas
  // horizontal snap-scroll grid'as su didesniais portretiniais card'ais.
  // Avatar 56px, vardas + metai virš dėliojami vertikaliai. Tiek mobile,
  // tiek desktop'e tas pats stilius — tik mobile turi -mx-4 + px-4 padding
  // edge-to-edge swipe'ui.
  return (
    <div className="mt-5">
      <div className="mb-2 font-['Outfit',sans-serif] text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]">
        Nariai
      </div>
      <div
        className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{
          scrollSnapType: 'x mandatory',
          scrollPaddingLeft: '1rem',
          overscrollBehaviorX: 'contain',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {members.map(m => (
          <Link
            key={m.id}
            href={`/atlikejai/${m.slug}`}
            style={{ scrollSnapAlign: 'start' }}
            className="group flex w-[120px] shrink-0 flex-col items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-3 no-underline transition-all hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.18)]"
          >
            {m.cover_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={proxyImg(m.cover_image_url)}
                alt={m.name}
                className="h-14 w-14 shrink-0 rounded-full object-cover transition-transform group-hover:scale-105"
              />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--cover-placeholder)] font-['Outfit',sans-serif] text-[18px] font-black text-[var(--text-faint)]">
                {m.name[0]}
              </div>
            )}
            <span className="mt-2 line-clamp-2 text-center font-['Outfit',sans-serif] text-[12px] font-bold leading-tight text-[var(--text-primary)]">
              {m.name}
            </span>
            {m.member_from && (
              <span className="mt-0.5 text-[10px] font-semibold tabular-nums text-[var(--text-muted)]">
                {m.member_from}–{m.member_until || 'dabar'}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}

function MemberOfInline({ groups }: { groups: Member[] }) {
  if (!groups.length) return null
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <span className="mr-1 inline-flex items-center font-['Outfit',sans-serif] text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]">
        Narys grupėse
      </span>
      {groups.map(g => (
        <Link
          key={g.id}
          href={`/atlikejai/${g.slug}`}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] py-1 pl-1 pr-3 no-underline transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
        >
          {g.cover_image_url ? (
            <img src={proxyImg(g.cover_image_url)} alt={g.name} className="h-7 w-7 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--cover-placeholder)] font-['Outfit',sans-serif] text-[11px] font-black text-[var(--text-faint)]">
              {g.name[0]}
            </div>
          )}
          <span className="font-['Outfit',sans-serif] text-[13px] font-bold text-[var(--text-primary)]">{g.name}</span>
          {g.member_from && (
            <span className="text-[11px] font-semibold text-[var(--text-muted)]">{g.member_from}–{g.member_until || 'dabar'}</span>
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
    // position:fixed body lock (iOS-safe). Anksčiau body.overflow=hidden
    // neveikė kai modal'as portaled į body — page'as scroll'indavosi.
    const scrollY = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.left = '0'
    document.body.style.right = '0'
    document.body.style.width = '100%'
    return () => {
      window.removeEventListener('keydown', h)
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.left = ''
      document.body.style.right = ''
      document.body.style.width = ''
      window.scrollTo(0, scrollY)
    }
  }, [index, photos.length, onClose, onIndex])

  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/95 p-4 backdrop-blur-xl"
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
      {/* Year badge — top-left, jei photo turi datą */}
      {photos[index].taken_at && (() => {
        const d = new Date(photos[index].taken_at!)
        if (isNaN(d.getTime())) return null
        return (
          <div className="absolute left-4 top-4 rounded-md bg-black/70 px-2.5 py-1 font-['Outfit',sans-serif] text-[11px] font-bold text-white backdrop-blur-sm">
            {d.getFullYear()}
          </div>
        )
      })()}
    </div>,
    document.body,
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
      <div className="relative min-h-[160px] w-full flex-1 overflow-hidden bg-gradient-to-br from-[var(--card-bg)] to-[var(--bg-elevated)]">
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
        {venue && <div className="flex items-center gap-1 text-[12px] text-[var(--text-secondary)]"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block shrink-0 text-[var(--text-faint)]" aria-hidden><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg><span className="line-clamp-1">{venue}</span></div>}
      </div>
    </Link>
  )
}

function EventCard({ e, variant = 'upcoming', onOpen }: { e: any; variant?: 'upcoming' | 'past' | 'compact' | 'vertical'; onOpen?: (e: any) => void }) {
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
    const ac = e.attendee_count || 0
    const cc = e.comment_count || 0
    return (
      <Link
        href={href}
        onClick={onOpen ? (ev) => { ev.preventDefault(); onOpen(e) } : undefined}
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
          {(ac > 0 || cc > 0) && (
            <div className="mt-1 flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
              {ac > 0 && (
                <span className="inline-flex items-center gap-1" title="Eis (dalyviai)">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                  {ac}
                </span>
              )}
              {cc > 0 && (
                <span className="inline-flex items-center gap-1" title="Komentarai">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  {cc}
                </span>
              )}
            </div>
          )}
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
        onClick={onOpen ? (ev) => { ev.preventDefault(); onOpen(e) } : undefined}
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
            <div className="mt-1 flex items-center gap-1 text-[12px] text-[var(--text-secondary)]"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block shrink-0 text-[var(--text-faint)]" aria-hidden><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg><span className="truncate">{venue}</span></div>
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
        onClick={onOpen ? (ev) => { ev.preventDefault(); onOpen(e) } : undefined}
      className="group flex min-h-[130px] w-full items-stretch gap-0 overflow-hidden rounded-2xl border border-[var(--border-subtle)] no-underline transition-all hover:-translate-y-0.5 hover:border-[var(--border-default)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.2)]"
      style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.16), rgba(249,115,22,0.04) 70%), var(--bg-elevated)' }}
    >
      {/* Cover area: backdrop fallback ALWAYS rendered (calendar + orange
          gradient). img layer ant viršaus jei yra cover_image_url. Jei img
          krenta — slepiam su display:none, ir matosi backdrop. Vengiame
          conditional rendering kuris paliktų browser native broken-image
          ikoną iki onError fire. */}
      <div className="relative w-[42%] min-w-[120px] max-w-[190px] shrink-0 overflow-hidden bg-gradient-to-br from-[var(--card-bg)] to-[var(--bg-elevated)]">
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
            <span className="inline-flex items-center gap-1"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block shrink-0 text-[var(--text-faint)]" aria-hidden><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>{venue}</span>
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
  open, events, onClose, onOpenEvent,
}: { open: boolean; events: any[]; onClose: () => void; onOpenEvent?: (e: any) => void }) {
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
            {events.map((e: any) => <EventBigCard key={e.id} e={e} onOpen={onOpenEvent} />)}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Larger hero-style event card used inside EventsModal so the full list
 *  showcases each event with cover art + more visual weight. */
function EventBigCard({ e, onOpen }: { e: any; onOpen?: (e: any) => void }) {
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
      className="group flex flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)] no-underline transition-all hover:-translate-y-0.5 hover:border-[var(--border-default)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.2)]"
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
        {venue && <div className="mt-1 flex items-center gap-1 text-[12px] text-[var(--text-secondary)] sm:text-[13px]"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block shrink-0 text-[var(--text-faint)]" aria-hidden><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg><span className="truncate">{venue}</span></div>}
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

// ── SpotlightAlbumRow ──────────────────────────────────────────────
//
// Naujausio albumo „Latest release" promo'as virš grupavimo zonos.
// Renderinasi tik kai albumas išleistas paskutiniais ~12 mėn (lookup
// gyvena ArtistProfileClient'e — `latestAlbum` useMemo'oje). Vizualas:
// horizontalus kortelės blokas su didesniu cover'iu kairėje + meta dešinėje
// (pavadinimas, metai, top dainos, play CTA). Mobile'e stack'inasi
// vertikaliai — cover viršuje, meta apačioje.
//
// Click ant cover'io ar pavadinimo → atidaro AlbumInfoModal. Play CTA →
// startuoja pirmą top track'ą.

function SpotlightAlbumRow({ album, artistSlug, topTracks, onOpen, onPlayTrack, onTrackClick }: {
  album: Album
  artistSlug?: string
  topTracks: Track[]
  onOpen: () => void
  /** Klausyti CTA — direct play in hero player. */
  onPlayTrack: (t: Track) => void
  /** Track chip click — opens TrackInfoModal. */
  onTrackClick: (t: Track) => void
}) {
  const coverUrl = (album as any).cover_image_url
  const [coverFailed, setCoverFailed] = useState(false)
  const type = aType(album)
  const showCover = !!coverUrl && !coverFailed
  const href = artistSlug ? `/albumai/${artistSlug}-${album.slug}-${album.id}` : `/albumai/${album.slug}-${album.id}`
  const firstTrack = topTracks[0]
  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-[var(--border-default)] bg-gradient-to-r from-[rgba(249,115,22,0.08)] via-[var(--bg-surface)] to-[var(--bg-surface)] p-3 sm:mb-8 sm:p-5">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex h-5 items-center rounded-full bg-[var(--accent-orange)] px-2 font-['Outfit',sans-serif] text-[9.5px] font-extrabold uppercase tracking-[0.15em] text-white">
          Naujausias
        </span>
        <span className="font-['Outfit',sans-serif] text-[10.5px] font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]">
          {type}
        </span>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
        {/* Cover — link su preventDefault → onOpen (modal). */}
        <a
          href={href}
          onClick={(e) => { e.preventDefault(); onOpen() }}
          className="block w-full max-w-[180px] shrink-0 sm:max-w-[200px]"
          aria-label={`Atidaryti albumą ${album.title}`}
        >
          <div className="aspect-square overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--cover-placeholder)] shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
            {showCover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={proxyImg(coverUrl)}
                alt={album.title}
                referrerPolicy="no-referrer"
                onError={() => setCoverFailed(true)}
                className="h-full w-full object-cover"
                style={{ filter: 'saturate(1.05) contrast(1.02)' }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-3xl text-[var(--text-faint)]">💿</div>
            )}
          </div>
        </a>
        <div className="min-w-0 flex-1">
          <a
            href={href}
            onClick={(e) => { e.preventDefault(); onOpen() }}
            className="block text-inherit no-underline"
          >
            <div className="font-['Outfit',sans-serif] text-[20px] font-extrabold leading-tight text-[var(--text-primary)] sm:text-[24px]">
              {album.title}
            </div>
          </a>
          <div className="mt-1 font-['Outfit',sans-serif] text-[12px] font-bold text-[var(--text-muted)] sm:text-[13px]">
            {album.year || '—'}
          </div>
          {topTracks.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 font-['Outfit',sans-serif] text-[12px] font-medium text-[var(--text-secondary)] sm:text-[13px]">
              {topTracks.slice(0, 4).map((t, i) => (
                <span key={t.id} className="inline-flex items-center">
                  {i > 0 && <span aria-hidden className="mr-2 text-[var(--text-muted)]">·</span>}
                  <a
                    href={artistSlug ? `/dainos/${artistSlug}-${t.slug}-${t.id}` : `/dainos/${t.slug}-${t.id}`}
                    onClick={(e) => { e.preventDefault(); onTrackClick(t) }}
                    className="text-inherit no-underline transition-colors hover:text-[var(--accent-orange)]"
                  >
                    {t.title}
                  </a>
                </span>
              ))}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {firstTrack && (
              <button
                type="button"
                onClick={() => onPlayTrack(firstTrack)}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-orange)] px-3.5 py-1.5 font-['Outfit',sans-serif] text-[12px] font-extrabold text-white shadow-[0_4px_14px_rgba(249,115,22,0.35)] transition-transform hover:scale-105"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff" aria-hidden><path d="M8 5v14l11-7z" /></svg>
                Klausyti
              </button>
            )}
            <button
              type="button"
              onClick={onOpen}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] px-3.5 py-1.5 font-['Outfit',sans-serif] text-[12px] font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-orange)] hover:text-[var(--accent-orange)]"
            >
              Albumas
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── AlbumGroupBox ─────────────────────────────────────────────────
//
// Vienos eros / dekados albumų „dėžutė" — su header'iu (title + range +
// count) ir vidaus grid'u (3-4 col responsive). Pati dėžutė yra padded
// bordered container'is, kad eras / dekados aiškiai matytųsi kaip atskiri
// blokai. Outer grid (parent komponentas) sustato dėžutes po 1-2 col
// pagal viewport'ą, kad jos nesudėtų vertikalaus scroll'o.

function AlbumGroupBox({ title, subtitle, description, rangeLabel, count, children }: {
  title: string
  subtitle?: string | null
  description?: string | null
  rangeLabel?: string
  count: number
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 sm:p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <h3 className="truncate font-['Outfit',sans-serif] text-[14px] font-extrabold text-[var(--text-primary)] sm:text-[15px]">
            {title}
          </h3>
          {subtitle && (
            <span className="truncate font-['Outfit',sans-serif] text-[12px] font-medium text-[var(--text-secondary)]">
              — {subtitle}
            </span>
          )}
          {rangeLabel && (
            <span className="shrink-0 font-['Outfit',sans-serif] text-[11px] font-bold text-[var(--text-muted)]">
              · {rangeLabel}
            </span>
          )}
        </div>
        <span className="shrink-0 font-['Outfit',sans-serif] text-[10.5px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          {count} {count === 1 ? 'albumas' : count < 10 ? 'albumai' : 'albumų'}
        </span>
      </div>
      {description && (
        <p className="mb-3 max-w-prose font-['Outfit',sans-serif] text-[12px] font-medium leading-snug text-[var(--text-secondary)]">
          {description}
        </p>
      )}
      {children}
    </div>
  )
}

// ── AlbumCard ──────────────────────────────────────────────────────

/** Weight tier for an album card — drives subtle scaling/opacity so the
 *  most viewed releases visually dominate over deep cuts / live / EP'ai.
 *  Computed parent-side per artist (relative tier).
 *  - 'full' : top 25% pagal aggregate views — full size, full saturation
 *  - 'mid'  : likę "real" albumai — full size, slight dim
 *  - 'dim'  : live / EP / kompilacijos / 0-view releases — 85% size + dim
 */
type AlbumWeight = 'full' | 'mid' | 'dim'

function AlbumCard({ a, popularity, artistSlug, maxPop, onOpen, topTracks, weight = 'full', onTrackClick, aggregateViews, composite, popBarLevel }: {
  a: Album; popularity?: number; artistSlug?: string; maxPop?: number
  onOpen?: (a: Album) => void
  /** Top 2–3 tracks for this album (by video_views desc) — shown below title
   *  as small clickable strip. Click → fires onTrackClick (parent opens
   *  TrackInfoModal). */
  topTracks?: Track[]
  weight?: AlbumWeight
  onTrackClick?: (t: Track) => void
  /** Aggregate YouTube views for ALL tracks in this album. */
  aggregateViews?: number
  /** Composite popularity score — same formula as /admin/artists/[id]/albums-debug
   *  (log10 agg_views + log10 track_likes_sum + album_likes + scores).
   *  This is the PRIMARY popbar signal — admin and public stay in sync. */
  composite?: number
  /** Pre-computed PopBar level (1..5) — when provided, used directly
   *  instead of recomputing from value/max ratio. Matches admin debug
   *  percentile-based ranking. */
  popBarLevel?: number
}) {
  const type = aType(a)
  const href = artistSlug ? `/albumai/${artistSlug}-${a.slug}-${a.id}` : `/albumai/${a.slug}-${a.id}`
  const [coverFailed, setCoverFailed] = useState(false)
  const coverUrl = (a as any).cover_image_url
  const showCover = !!coverUrl && !coverFailed
  // Album popularity signal hierarchy (2026-05-13 v4 — aligned with admin):
  //   1. composite — same formula as /admin/artists/[id]/albums-debug
  //   2. aggregate_views — fallback if composite not provided
  //   3. like_count — tikra fan rinkliava
  //   4. score — last resort (often uniform per artist)
  const albumScore = (a as any).score
  const albumLikes = (a as any).like_count
  const value =
    typeof composite === 'number' && composite > 0 ? composite :
    typeof aggregateViews === 'number' && aggregateViews > 0 ? aggregateViews :
    typeof albumLikes === 'number' && albumLikes > 0 ? albumLikes :
    (typeof albumScore === 'number' ? albumScore : 0)
  // Explicit override takes priority — parent precomputes percentile-based
  // levels matching /admin/artists/[id]/albums-debug.
  const albumPop =
    typeof popBarLevel === 'number' && popBarLevel > 0 ? popBarLevel :
    (maxPop && maxPop > 0)
      ? popLevelRelative(value, maxPop)
      : (typeof popularity === 'number' ? popularity : 0)
  // Modal-mode: jei parent perdavė `onOpen` callback, atidarom slide-in
  // modal'ą nepalikus artist page'o. Antraip — fallback į Link (legacy /
  // direct-link case'as kai komponentas naudojamas iš kitur).
  const cardClassName = 'group block w-full cursor-pointer border-0 bg-transparent p-0 text-left no-underline'
  const inner = (
    <>
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
        {/* Top tracks strip — 2–3 dainos su video peak views. Kiekvienas
            track pavadinimas yra `<a href>` (SEO + middle-click new tab) +
            preventDefault'as → fires onPlayTrack(t) jei perduotas. Click'as
            ant track NESPAUDŽIA album'o, nes stopPropagation atskirai
            saugo. Truncate'inam pavadinimus, kad netiltų horizontaliai. */}
        {/* Top tracks strip — DESKTOP ONLY (mobile hides per user feedback:
            track listas užima per daug vertikalaus ploto). Desktop'e tracks
            stack'inami vertikaliai (kiekvienas savo eilutėje), be `·`
            separator'ių — kortelė tampa skaitytelnesnė. */}
        {topTracks && topTracks.length > 0 && (
          <div
            className="mt-1 hidden flex-col gap-0.5 font-['Outfit',sans-serif] text-[11px] font-medium leading-snug text-[var(--text-secondary)] sm:flex sm:text-[11.5px]"
            onClick={(e) => e.stopPropagation()}
          >
            {topTracks.slice(0, 3).map((t) => (
              <a
                key={t.id}
                href={artistSlug ? `/dainos/${artistSlug}-${t.slug}-${t.id}` : `/dainos/${t.slug}-${t.id}`}
                onClick={(e) => {
                  if (onTrackClick) { e.preventDefault(); e.stopPropagation(); onTrackClick(t) }
                }}
                className="block truncate text-inherit no-underline transition-colors hover:text-[var(--accent-orange)]"
                title={t.title}
              >
                {t.title}
              </a>
            ))}
          </div>
        )}
      </div>
    </>
  )
  // 2026-05-13 (Push 3a fix): weight tier scaling pašalintas — skirtingo
  // dydžio cover'iai sukūrė chaosą. Populiarumą jau perteikia PopBar dash'ai
  // po albumo pavadinimo. `weight` prop'as palieka tik backwards-compat
  // (gali būti naudojamas era grouping context'e). Visi card'ai full-size.
  void weight
  const wrapperClass = cardClassName
  if (onOpen) {
    // Modal-mode: SEO-friendly <a> with real href so crawlers index the
    // album page. Click → preventDefault → onOpen(a) opens slide-in modal.
    // Middle-click / cmd-click → natural new-tab navigation to /albumai/…
    return (
      <a
        href={href}
        onClick={(e) => { e.preventDefault(); onOpen(a) }}
        aria-label={`Atidaryti albumą ${a.title}`}
        className={wrapperClass}
      >
        {inner}
      </a>
    )
  }
  return (
    <Link href={href} className={wrapperClass}>
      {inner}
    </Link>
  )
}

// ── TrackRow: compact row for orphan tracks (no big placeholder square) ─

function TrackRow({ t, popularity, artistSlug, onOpen }: { t: Track; popularity?: number; artistSlug?: string; onOpen?: (t: Track) => void }) {
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
  const sharedClass = 'group flex items-center gap-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2 text-left no-underline transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]'
  const inner = (
    <>
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
    </>
  )
  if (onOpen) {
    // Modal-mode: SEO-friendly <a href> so crawlers index the track page.
    // Click → preventDefault → onOpen(t); middle-click → new tab as usual.
    return (
      <a
        href={href}
        onClick={(e) => { e.preventDefault(); onOpen(t) }}
        className={sharedClass}
      >
        {inner}
      </a>
    )
  }
  return <Link href={href} className={sharedClass}>{inner}</Link>
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
  // music.lt diskusijų title kartais turi vidinį legacy ID artifact'ą
  // („Coldplay l194526"). Jei title atrodo kaip auto-slug — perleidžiam
  // per slugToForumTitle clean'inimą (kuris nukerpa `-l\d+` priesagą).
  const rawTitle = t.title || slugToForumTitle(t.slug)
  const looksAutoSlug = /\sl\d{4,}$/i.test(rawTitle) || /^[a-zĄČĘĖĮŠŲŪŽąčęėįšųūž][a-zĄČĘĖĮŠŲŪŽąčęėįšųūž\s\-_]*$/.test(rawTitle)
  const title = looksAutoSlug ? slugToForumTitle(t.slug) : rawTitle
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

      {/* Comments preview — iki 2 paskutinių, su realiais avatarais.
          „Dar nekomentuota" placeholder rodomas TIK kai pc === 0. Anksčiau
          jis ir su `pc > 0` rodydavosi (kai recent_posts nesipareina iš db),
          tada apačioj būdavo „27 komentarų" — internal contradiction. */}
      <div className="flex flex-1 flex-col gap-2">
        {recent.length === 0 ? (
          pc === 0
            ? <div className="text-[11.5px] leading-tight text-[var(--text-faint)]">Dar nekomentuota</div>
            : null
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
  // Po migracijos forum_threads → discussions, naudojam canonical_slug.
  // Fallback'as legacy bridge'ui jei dar nemigruota.
  const href = t.canonical_slug
    ? `/diskusijos/${t.canonical_slug}`
    : `/diskusijos/tema/${t.legacy_id}`
  return (
    <Link href={href} className={sharedClassName}>
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
  const [sort, setSort] = useState<'oldest' | 'newest' | 'popular'>('oldest')
  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState<{ author: string; text: string } | null>(null)
  const [attached, setAttached] = useState<AttachmentHit[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [postLikers, setPostLikers] = useState<Record<number, LikeUser[]>>({})
  const [likesModalPostId, setLikesModalPostId] = useState<number | null>(null)
  const draftRef = useRef<HTMLTextAreaElement | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (thread) {
      const r = requestAnimationFrame(() => setMounted(true))
      const h = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
      window.addEventListener('keydown', h)
      setPosts(null)
      setDraft('')
      setReplyTo(null)
      setSort('oldest')
      setAttached([])
      setShowPicker(false)
      // Scroll modal į viršų atidarius naują thread'ą — anksčiau scroll
      // pozicija persistdavo iš ankstesnio modal'o.
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0
      }
      setPostLikers({})
      setLikesModalPostId(null)
      fetch(`/api/threads/${thread.legacy_id}/posts`)
        .then(r => r.json())
        .then(d => {
          setPosts(d.posts || [])
          setPostLikers(d.postLikers || {})
          // Po duomenų load'o dar kartą reset'inam scroll'ą — kad pradėtume
          // skaityti nuo pirmo (seniausio) komentaro, kaip kanoniniame page'e.
          requestAnimationFrame(() => {
            if (scrollContainerRef.current) {
              scrollContainerRef.current.scrollTop = 0
            }
          })
        })
        .catch(() => setPosts([]))
      const scrollY = window.scrollY
      document.body.style.position = 'fixed'
      document.body.style.top = `-${scrollY}px`
      document.body.style.left = '0'
      document.body.style.right = '0'
      document.body.style.width = '100%'
      return () => {
        cancelAnimationFrame(r)
        window.removeEventListener('keydown', h)
        document.body.style.position = ''
        document.body.style.top = ''
        document.body.style.left = ''
        document.body.style.right = ''
        document.body.style.width = ''
        window.scrollTo(0, scrollY)
      }
    }
    setMounted(false)
    return
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.legacy_id])

  const handleClose = () => {
    onClose()
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

  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      className={[
        'fixed inset-0 z-[9999] flex items-end justify-center backdrop-blur-sm sm:items-center',
        'bg-black/60 sm:bg-black/30',
        'lg:justify-start lg:pl-[10%]',
      ].join(' ')}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <aside
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={[
          'flex w-full flex-col overflow-hidden bg-[var(--bg-surface)] shadow-[0_24px_60px_-10px_rgba(0,0,0,0.5)]',
          'h-[90vh] rounded-t-2xl',
          'sm:h-[85vh] sm:rounded-2xl sm:mx-4 sm:max-w-[720px]',
        ].join(' ')}
      >
        {/* Mobile handle bar */}
        <div className="flex shrink-0 justify-center pt-2 pb-1 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-[var(--border-default)]" />
        </div>
        {/* Top bar — minimal close + open-full action. Title stays in
            scrollable hero area (canonical-style). */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-2.5">
          <div className="font-['Outfit',sans-serif] text-[11px] font-bold text-[var(--text-faint)]">
            ← Diskusijos
          </div>
          <div className="flex items-center gap-1">
            <a
              href={`/diskusijos/tema/${thread.legacy_id}`}
              target="_blank"
              rel="noopener"
              title="Atidaryti pilname puslapyje"
              className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
            >
              <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 3h7v7M21 3l-9 9M5 5h6M5 5v14h14v-6" />
              </svg>
            </a>
            <button
              onClick={handleClose}
              aria-label="Uždaryti"
              className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
            >
              <svg viewBox="0 0 16 16" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M3 3l10 10M13 3L3 13" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable hero + posts area. Hero atvaizdavimas atitinka kanoninę
            /diskusijos/[slug]: didelis H1, comment count subline, sort row;
            tada — posts list (visa scroll'ina kartu, kaip kanoninej page'e). */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
          {/* Hero — title + count */}
          <div className="mb-4 border-b border-[var(--border-subtle)] pb-4">
            <div className="font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              Diskusija
            </div>
            <h1 className="mt-2 font-['Outfit',sans-serif] text-[20px] font-black leading-[1.15] text-[var(--text-primary)] sm:text-[24px]">
              {title}
            </h1>
            {pc > 0 && (
              <div className="mt-2 font-['Outfit',sans-serif] text-[12px] font-bold text-[var(--text-muted)]">
                <span className="text-[var(--accent-orange)]">{pc.toLocaleString()}</span>{' '}
                {pc === 1 ? 'komentaras' : (pc < 10 ? 'komentarai' : 'komentarų')}
              </div>
            )}
          </div>

          {/* Comments — naudojam tą patį EntityCommentsBlock'ą kaip canonical
              /diskusijos/[slug] page'ai. Vienas šaltinis truth: same composer,
              same comment cards, same like UI. Reikalauja modern discussion.id,
              kurį page.tsx server-side load'as įdeda į LegacyThread'ą. */}
          {thread.id ? (
            <EntityCommentsBlock
              entityType="discussion"
              entityId={thread.id}
              title=""
            />
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-8 text-center text-[12px] text-[var(--text-faint)]">
              Diskusija dar nemigracinta į naują formatą.{' '}
              <a
                href={`/diskusijos/tema/${thread.legacy_id}`}
                target="_blank"
                rel="noopener"
                className="text-[var(--accent-orange)] underline"
              >
                Atidaryti pilname puslapyje
              </a>
            </div>
          )}
        </div>
      </aside>

      {/* LikesModal — overlay'inamas virš drawer'io kai user'is paspaudžia
          ant ♥ count'o ant komentaro. Rodo kas like'ino tą komentarą su
          username, rank, avatar (data iš /api/threads/{id}/posts postLikers).
          Kanoninej /diskusijos/tema/{id} page'ai tas pats UI. */}
      <LikesModal
        open={likesModalPostId !== null}
        onClose={() => setLikesModalPostId(null)}
        title="Patiko"
        count={likesModalPostId !== null ? (postLikers[likesModalPostId]?.length || 0) : 0}
        users={likesModalPostId !== null ? (postLikers[likesModalPostId] || []) : []}
      />
    </div>,
    document.body,
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
  artist, heroImage, genres, substyles = [], links, photos, albums, tracks, members, memberOf = [], followers, likeCount,
  events, similar, newTracks,
  legacyCommunity, legacyThreads = [], legacyNews = [], ranks = [],
  linkedTrackIds = [], awards = [], eras = [],
}: Props) {
  const [pid, setPid] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [trackInfoOpen, setTrackInfoOpen] = useState<Track | null>(null)
  // AlbumInfoModal — slide-in drawer'is su album turiniu. Saugom tik
  // hint'ą (id + title + cover) — modal'as pats fetch'ina pilnus duomenis.
  const [albumModalOpen, setAlbumModalOpen] = useState<Album | null>(null)
  const [eventsModalOpen, setEventsModalOpen] = useState(false)
  const [discussionsModalOpen, setDiscussionsModalOpen] = useState(false)
  // activeThread — wired back (2026-05-12): visi diskusijų click'ai dabar
  // atidaro DiscussionThreadModal artist page'e (user'is pageidavo, kad
  // visi linkai atsidarytų modaluose, nereiktų išeit iš main page).
  const [activeThread, setActiveThread] = useState<LegacyThread | null>(null)
  const [activeEvent, setActiveEvent] = useState<EventPreview | null>(null)
  const [activeNews, setActiveNews] = useState<NewsPreview | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [likesModalOpen, setLikesModalOpen] = useState(false)
  const [bioModalOpen, setBioModalOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  // Mobile'e modal'as turi savo inline iframe'ą — kai jis aktyvus, hero
  // player'is turi būti suppress'intas (audio dvigubėjimas).
  const [modalUsesInline, setModalUsesInline] = useState(false)
  // Desktop'e modal'as gali turėti dock'uotą player'į (≥1280px viewport) —
  // tuomet hero player'is taip pat suppress'inamas.
  const [modalUsesDocked, setModalUsesDocked] = useState(false)

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

  // Page-view ping — fire-and-forget. 30 min cookie dedup'as.
  useEffect(() => {
    if (!artist?.id) return
    fetch(`/api/artists/${artist.id}/page-view`, { method: 'POST', keepalive: true }).catch(() => {})
  }, [artist?.id])

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
  // Aggregate YouTube views + track likes + track score sums per album —
  // sumuojam per album_tracks junction. Tracks turi `.albums` array iš
  // page.tsx — invertuojam į Map<albumId, sums>. 2026-05-13 v2: pridėta
  // composite formulė, identiška /admin/artists/[id]/albums-debug.
  const trackAggregatesByAlbum = useMemo(() => {
    const map = new Map<number, { views: number; likes: number; score: number }>()
    for (const t of tracks) {
      const v = (t as any).video_views || 0
      const lk = (t as any).like_count || 0
      const sc = (t as any).score || 0
      const ta = ((t as any).albums || []) as Array<{ id: number }>
      for (const al of ta) {
        const prev = map.get(al.id) || { views: 0, likes: 0, score: 0 }
        prev.views += v
        prev.likes += lk
        prev.score += sc
        map.set(al.id, prev)
      }
    }
    return map
  }, [tracks])
  const aggregateViewsByAlbum = useMemo(() => {
    const m = new Map<number, number>()
    for (const [k, v] of trackAggregatesByAlbum) m.set(k, v.views)
    return m
  }, [trackAggregatesByAlbum])
  // Composite popularity score — IDENTICAL formula to admin albums-debug,
  // so public PopBar matches what admin debugger shows. Forma:
  //   log10(agg_views+1)*30 + log10(track_likes_sum+1)*10 +
  //   album_likes*5 + track_score_sum*0.05 + album.score*0.5
  const compositeByAlbum = useMemo(() => {
    const m = new Map<number, number>()
    for (const a of albums) {
      const agg = trackAggregatesByAlbum.get(a.id) || { views: 0, likes: 0, score: 0 }
      const albumLikes = (a as any).like_count || 0
      const albumScore = (a as any).score || 0
      const composite =
        Math.log10(agg.views + 1) * 30 +
        Math.log10(agg.likes + 1) * 10 +
        albumLikes * 5 +
        agg.score * 0.05 +
        albumScore * 0.5
      m.set(a.id, composite)
    }
    return m
  }, [albums, trackAggregatesByAlbum])
  // PopBar level per album — PERCENTILE-based across the whole artist
  // discography, identiškai kaip /admin/artists/[id]/albums-debug. Tai
  // garantuoja, kad public bar'as visada matchina admin debug'erį (anksčiau
  // public naudojo ratio-thresholds, admin — percentile, ir jie nesutapdavo).
  const popLevelByAlbum = useMemo(() => {
    const m = new Map<number, number>()
    const ranked = albums.slice().sort((a, b) =>
      (compositeByAlbum.get(b.id) || 0) - (compositeByAlbum.get(a.id) || 0))
    const N = ranked.length
    ranked.forEach((a, i) => {
      if (N === 0) { m.set(a.id, 0); return }
      const p = i / N
      const lvl = p < 0.20 ? 5 : p < 0.40 ? 4 : p < 0.60 ? 3 : p < 0.80 ? 2 : 1
      m.set(a.id, lvl)
    })
    return m
  }, [albums, compositeByAlbum])
  const maxAlbumPop = useMemo(() => {
    let max = 0
    for (const a of albums) {
      const c = compositeByAlbum.get(a.id) || 0
      if (c > max) max = c
    }
    return max
  }, [albums, compositeByAlbum])

  // Top 2–3 dainos kiekvienam albumui — pagal video_views desc (fallback į
  // like_count). Tracks turi `.albums` array per page.tsx, todėl matchin'am
  // album_id'us. Map(albumId → Track[]) — užkrauta vieną kartą per render.
  // 2026-05-13 (Push 3a): top track strip po album card'u, padaro „Viva
  // la Vida or Death and All His Friends" iškart suprantamu kontekste.
  const topTracksByAlbum = useMemo(() => {
    const map = new Map<number, Track[]>()
    // Sukuriam track lookup pagal album.id
    const allTracks = tracks // tracks already include top picks
    for (const t of allTracks) {
      const trackAlbums = ((t as any).albums || []) as Array<{ id: number }>
      for (const al of trackAlbums) {
        const arr = map.get(al.id) || []
        arr.push(t)
        map.set(al.id, arr)
      }
    }
    // Sort kiekvieno albumo tracks pagal views (fallback: likes)
    for (const [k, arr] of map) {
      arr.sort((a, b) => {
        const va = (a as any).video_views || 0
        const vb = (b as any).video_views || 0
        if (vb !== va) return vb - va
        return ((b as any).like_count || 0) - ((a as any).like_count || 0)
      })
      map.set(k, arr.slice(0, 3))
    }
    return map
  }, [tracks])

  // Weight tier per album — relyvac'us tier'iuoja albumus pagal AGGREGATE
  // top-track views. Top 25% (jei ≥4 albumai) — 'full', vidurys — 'mid',
  // apačia + visi live/EP/kompilacijos — 'dim'. Mažiems atlikėjams (≤3
  // albumai) — viskas 'full' (neverta zoom'inti hierarchijų).
  const weightByAlbum = useMemo(() => {
    const map = new Map<number, AlbumWeight>()
    if (albums.length === 0) return map
    // Skaičiuojam aggregate per album'ą: sumuojam top-3 track views
    const aggregateByAlbum = new Map<number, number>()
    for (const a of albums) {
      const topTs = topTracksByAlbum.get(a.id) || []
      const sum = topTs.reduce((s, t) => s + ((t as any).video_views || 0), 0)
      aggregateByAlbum.set(a.id, sum)
    }
    // Mažas atlikėjas — viskas 'full'.
    if (albums.length <= 3) {
      for (const a of albums) map.set(a.id, 'full')
      return map
    }
    // Sort'om pagal aggregate desc, top 25% → 'full', vidurys 50% → 'mid',
    // apačia 25% + ne-studio → 'dim'.
    const studioAlbums = albums.filter(a => aType(a) === 'Studijinis')
    const nonStudioAlbums = albums.filter(a => aType(a) !== 'Studijinis')
    const sorted = [...studioAlbums].sort((a, b) => (aggregateByAlbum.get(b.id) || 0) - (aggregateByAlbum.get(a.id) || 0))
    const topN = Math.max(1, Math.ceil(sorted.length * 0.25))
    const midN = Math.max(1, Math.ceil(sorted.length * 0.5))
    sorted.forEach((a, i) => {
      const tier: AlbumWeight = i < topN ? 'full' : i < topN + midN ? 'mid' : 'dim'
      map.set(a.id, tier)
    })
    // Visi non-studio (EP, Live, Remix, OST, Demo, Single, Kompilacija) →
    // 'dim' (kad nedraskytų akies vs studijinių).
    for (const a of nonStudioAlbums) map.set(a.id, 'dim')
    return map
  }, [albums, topTracksByAlbum])

  // ── Era / decade grouping (Push 3b, 2026-05-13) ──────────────────
  //
  // Trijų pakopų sprendimas:
  //   (a) Custom eras (≥2 admin rows) — naudoja exact'us year_start/year_end
  //       boundary'us. Albumai už ribų — į "Be eros" katalizatorių apačioje.
  //   (b) Auto-decade grouping — kai albums.count ≥ 10 IR ≥3 dekados turi ≥2
  //       albumus. Default'iniu vis dar kompaktiškas, bet duoda struktūrą
  //       dideliems atlikėjams be admin intervention.
  //   (c) Flat grid — likusiems (≤9 albumai arba sparse dekados). Nedrumzta
  //       LT atlikėjams su 3–5 release'iais.
  //
  // Spotlight slot'as (naujausias albumas <12 mo) renderinasi atskirai virš
  // grupavimo zonos, todėl jis dingsta iš era'os, kuriai chronologiškai
  // priklausytų — nepasidubliuoja.
  type AlbumGroup = {
    key: string
    title: string
    subtitle?: string | null
    description?: string | null
    year_start: number | null
    year_end: number | null
    albums: Album[]
    featured_ids?: number[]
    /** If true, omit the extra „· YEAR–YEAR" pill in the header — used by
     *  auto-bucket groups where the title itself is already the year range. */
    rangeInTitle?: boolean
  }
  /** Pad year range į vieną string'ą — pvz. „2008–2015". Kai range
   *  apima current_year (ongoing era / current bucket), rodom „2020–dabar"
   *  vietoj „2020–2029" — kad decade'as dar nebūtų „uždarytas". */
  const yearRangeLabel = (s: number | null, e: number | null) => {
    if (s === null) return ''
    const curYear = new Date().getFullYear()
    if (e === null) return `${s}–dabar`
    if (s === e) return String(s)
    if (curYear >= s && curYear <= e) return `${s}–dabar`
    return `${s}–${e}`
  }
  /** 20-year (double-decade) bucket start, aligned to current decade.
   *  In 2026 (current decade = 2020), the buckets are:
   *    [2010, 2029] — current double-decade
   *    [1990, 2009]
   *    [1970, 1989]
   *    ...
   *  Pora dekadų į vieną grupavimą yra geriau didelėms diskografijoms
   *  (Coldplay 22 albumai / 4 dekados → 2 grupavimai, ne 4 sparse) —
   *  per user feedback 2026-05-13. */
  const doubleDecadeStart = (() => {
    const anchor = Math.floor(new Date().getFullYear() / 10) * 10 - 10
    return (y: number) => {
      if (y >= anchor) return anchor
      const stepsBack = Math.ceil((anchor - y) / 20)
      return anchor - stepsBack * 20
    }
  })()

  /** Latest album spotlight: naujausias studijinis ar EP albumas, jei jis
   *  išleistas <=12 mo atgal. Naudojam current_year-1 kaip threshold'ą
   *  (paprastas ir veikia per visus laiko zonos quirk'us). */
  const latestAlbum = useMemo<Album | null>(() => {
    const currentYear = new Date().getFullYear()
    const threshold = currentYear - 1
    const recent = albums
      .filter(a => a.year && a.year >= threshold)
      .filter(a => {
        const t = aType(a)
        return t === 'Studijinis' || t === 'EP' || t === 'Singlas'
      })
      .sort((a, b) => (b.year || 0) - (a.year || 0))
    return recent[0] || null
  }, [albums])

  /** Albums considered for grouping (excludes the spotlight album if any —
   *  it renders separately above to avoid duplication). */
  const groupableAlbums = useMemo(() => {
    if (!latestAlbum) return visibleAlbums
    return visibleAlbums.filter(a => a.id !== latestAlbum.id)
  }, [visibleAlbums, latestAlbum])

  const albumGroups = useMemo<AlbumGroup[] | null>(() => {
    // (a) Custom eras — admin override. ≥2 rows required (1 lone era beats
    // the purpose of grouping).
    if (eras.length >= 2) {
      const groups: AlbumGroup[] = eras.map(e => ({
        key: `era-${e.id}`,
        title: e.title,
        subtitle: e.subtitle,
        description: e.description,
        year_start: e.year_start,
        year_end: e.year_end,
        albums: [],
        featured_ids: e.featured_album_ids || [],
      }))
      const orphans: Album[] = []
      for (const a of groupableAlbums) {
        if (!a.year) { orphans.push(a); continue }
        const era = eras.find(e => {
          const end = e.year_end ?? 9999
          return a.year! >= e.year_start && a.year! <= end
        })
        if (era) {
          groups.find(g => g.key === `era-${era.id}`)!.albums.push(a)
        } else {
          orphans.push(a)
        }
      }
      if (orphans.length > 0) {
        groups.push({
          key: 'orphans',
          title: 'Kiti įrašai',
          year_start: null, year_end: null,
          albums: orphans,
        })
      }
      // Drop empty eras + per-era sort by year DESC
      return groups
        .filter(g => g.albums.length > 0)
        .map(g => ({ ...g, albums: g.albums.slice().sort((a, b) => (b.year || 0) - (a.year || 0)) }))
    }

    // (b) Auto-decade grouping. Threshold sumažintas 2026-05-13: bet kuris
    // atlikėjas su albumais bent 2 skirtinguose dešimtmečiuose gauna boxes
    // (anksčiau buvo ≥10 albumų reikalavimas, dėl ko Britney Spears 7-8
    // studio albumai liko be grupavimo). LT atlikėjams su 3 albumais
    // viename dekade vis tiek lieka flat.
    const yeared = groupableAlbums.filter(a => typeof a.year === 'number')
    const byBucket = new Map<number, Album[]>()
    for (const a of yeared) {
      const start = Math.floor(a.year! / 10) * 10
      const arr = byBucket.get(start) || []
      arr.push(a)
      byBucket.set(start, arr)
    }
    // Reikia bent 2 bucket'ų, kad turėtų prasmę. Single-bucket = flat grid.
    if (byBucket.size < 2) return null
    const sorted = [...byBucket.entries()].sort((a, b) => b[0] - a[0])
    const groups: AlbumGroup[] = sorted.map(([start, arr]) => ({
      key: `bucket-${start}`,
      title: yearRangeLabel(start, start + 9),
      year_start: start, year_end: start + 9,
      albums: arr.slice().sort((a, b) => (b.year || 0) - (a.year || 0)),
      rangeInTitle: true,
    }))
    // No-year orphans — į „Be metų" group
    const noYear = groupableAlbums.filter(a => !a.year)
    if (noYear.length > 0) {
      groups.push({
        key: 'no-year', title: 'Be metų',
        year_start: null, year_end: null,
        albums: noYear,
      })
    }
    return groups
  }, [eras, groupableAlbums, doubleDecadeStart])

  // Pop signal'as su fallback hierarchy — taip pat kaip HeroPlayer'yje.
  // Garantuoja, kad orphan ("Kitos dainos") sąraše bar'ai rodomi net jei
  // like_count'ai 0 (naujai importuotam intl atlikėjui).
  const popInfoTracks = useMemo(() => (
    detectPopSignal([...tracks, ...newTracks])
  ), [tracks, newTracks])

  // Player'is rodo tracks be cap'o — vartotojas gali scroll'inti per visą
  // diskografiją. Anksčiau buvo .slice(0, 100), bet kai kurie atlikėjai
  // (Mamontovas 220+, didžiosios DJ'jaus kompiliacijos 1000+) turi gerokai
  // daugiau dainų. Filtruojam, kad video-turintys keliautų į priekį, bet
  // visus rodom.
  // Composite popularity score — VIEWS-DOMINANT (2026-05-10 v2 simplify).
  //
  // Iš v1 pašalinta:
  //  - score × 0.2 (uniform per artist'ą, nedifferencijuoja — Coldplay'aus
  //    173 tracks visi gauna ~5.8 score'o, nieko negalima ranko'inti)
  //  - year_recency (penalizuodavo klasikus — Yellow 2000 gaudavo 0,
  //    My Universe 2021 gaudavo +25, todėl naujesni track'ai neteisingai
  //    aukščiau už klasikinius hit'us)
  //
  // Liko (data-resilient — veikia ir kai 86% tracks turi 0 likes):
  //   views_log × 50    — dominuoja (1.3B views ≈ 456 pts)
  //   likes_log × 10    — small bonus kai turim (200 likes ≈ 23 pts)
  //   is_single ? 10 : 0   — official release smaller bonus
  //   has_video ? 5 : 0    — playable bonus (UX preference)
  //
  // YT views — globalus, all-time, geriausias TIKRAS-populiarumo rodiklis.
  // Music.lt likes — sparse, skewed (deklinuojanti platforma); naudojam tik
  // kaip subtle tiebreaker kai data prieinama.
  // Adaptive scorer — INTL atlikėjams (Coldplay) views dominuoja, LT
  // atlikėjams (Mamontovas, kur YT views per scrape neapseidžia) likes
  // dominuoja. Coverage threshold (≥30% tracks su >0 views) skiria
  // case'us. Vienas šaltinis tiek sort'ui, tiek popbar percentile lygiui.
  const trackSortVal = useMemo(() => makeArtistTrackScorer(tracks), [tracks])

  const tracksAllTime = useMemo(() => {
    // With-video tracks pirmiau (UX — instant play), bet kiekvienoje
    // grupėje sortinama pagal composite populiarumą. Anksčiau buvo tik
    // grupavimas + DB created_at desc — dėl to track'ai su daugiau
    // populiarumo dashes pasirodydavo žemiau už track'us su mažiau.
    const withVideo = tracks.filter(t => yt(t.video_url)).slice().sort((a, b) => trackSortVal(b) - trackSortVal(a))
    const rest = tracks.filter(t => !yt(t.video_url)).slice().sort((a, b) => trackSortVal(b) - trackSortVal(a))
    return [...withVideo, ...rest]
  }, [tracks, trackSortVal])

  const tracksTrending = useMemo(() => {
    const withVideo = newTracks.filter(t => yt(t.video_url)).slice().sort((a, b) => trackSortVal(b) - trackSortVal(a))
    const rest = newTracks.filter(t => !yt(t.video_url)).slice().sort((a, b) => trackSortVal(b) - trackSortVal(a))
    return [...withVideo, ...rest]
  }, [newTracks, trackSortVal])

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
    // Naudojam TIK first_post_at (real publication date). last_post_at
    // (DB: last_comment_at) būna scraper'io artifact'as kai komentarų nebuvo
    // — set'intas į NOW(), todėl naujienos be tikros datos klaidingai
    // patekdavo į "fresh" sekciją. Be first_post_at → archive.
    const raw = n.first_post_at
    if (!raw) return false
    const ts = new Date(raw).getTime()
    return isFinite(ts) && ts >= freshnessCutoff
  })
  const archivedPastEvents = allPastEvents.filter((e: any) => new Date(e.start_date).getTime() < freshnessCutoff)
  const archivedLegacyNews = (legacyNews || []).filter((n: any) => {
    const raw = n.first_post_at
    if (!raw) return true  // be tikros datos → archyvas
    const ts = new Date(raw).getTime()
    return !isFinite(ts) || ts < freshnessCutoff
  })
  const [showArchive, setShowArchive] = useState(false)
  void allLegacyNews // keep var to avoid lint
  // Bio source: page.tsx jau handle'ina Wiki canonical (description) vs music.lt
  // (description_legacy) fallback'ą — perduoda final value kaip artist.description.
  // Žr. page.tsx:1056-1060 — fallback į description_legacy jei Wiki <20 chars.
  const bioHtml: string = artist.description || ''

  // Galerija — visos aktyvios nuotraukos. Anksčiau filtruodavom hero foto
  // (kad nesi-dubliuotų), bet jei active'ių tik 2 ir viena tampa hero'jum,
  // galerija lieka su 1. Dabar paliekam visas — vartotojas mato pilną
  // foto sąrašą + lengvai matosi kuri yra hero (ji dažnai pirma sort_order).
  const galleryPhotos = useMemo(() => {
    // Sort by taken_at DESC (newest first); photos be datos eina į galą.
    return [...photos].sort((a, b) => {
      const ta = a.taken_at ? new Date(a.taken_at).getTime() : 0
      const tb = b.taken_at ? new Date(b.taken_at).getTime() : 0
      return tb - ta
    })
  }, [photos])

  // BioModal subtitle — TIK active periodas (anksčiau dubliavo SideInfo
  // stilių info: 'Pop, R&B muzika · Pop'. Stilius ir taip rodomas SideInfo
  // strip'e + chips'uose žemiau, nereikia kartoti modal'o subtitle'yje).
  const bioSubtitle = active || undefined

  const scrollToGalerija = () => {
    galerijaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    // route-enter: 280ms fade+slide-in kai loading.tsx (equalizer skeleton'as)
    // pakeičiamas faktiniu content'u. Be šitos klasės swap'as matosi kaip
    // abrupt blink — naudotojas pastebėjo, kad atrodo "lyg viskas persikrauna".
    <div className="route-enter min-h-screen bg-[var(--bg-body)] font-['DM_Sans',system-ui,sans-serif] text-[var(--text-primary)] antialiased">
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
        // Hero player'is suppress'inamas, kai modal'as turi savo player'į
        // (mobile inline arba desktop docked). Kitaip audio dvigubėtų.
        playing={playing && !modalUsesInline && !modalUsesDocked}
        onRequestPlay={() => setPlaying(true)}
        onOpenTrackInfo={(t) => setTrackInfoOpen(t)}
        hasAnyVideo={hasAnyVideo}
        upcomingEvents={upcomingEvents}
        onOpenEventsModal={() => setEventsModalOpen(true)}
        onOpenHeroLightbox={() => { if (galleryPhotos.length > 0) setLightboxIndex(0) }}
        onOpenEvent={setActiveEvent}
      />

      <EventsModal
        open={eventsModalOpen}
        events={upcomingEvents}
        onClose={() => setEventsModalOpen(false)}
        onOpenEvent={(e) => { setEventsModalOpen(false); setActiveEvent(e) }}
      />

      <DiscussionsModal
        open={discussionsModalOpen}
        threads={legacyThreads}
        onClose={() => setDiscussionsModalOpen(false)}
        onOpenThread={(t) => { setDiscussionsModalOpen(false); setActiveThread(t) }}
      />

      {/* DiscussionThreadModal — pilnas thread'as artist page'e (nebereikia exit'inti). */}
      <DiscussionThreadModal
        thread={activeThread}
        onClose={() => setActiveThread(null)}
      />

      {/* EventInfoModal — pilnas renginys (data, vieta, dalyviai, source). */}
      <EventInfoModal
        event={activeEvent}
        onClose={() => setActiveEvent(null)}
      />

      {/* NewsInfoModal — naujiena su tekstu + komentarais. */}
      <NewsInfoModal
        news={activeNews}
        onClose={() => setActiveNews(null)}
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
        artistTracks={tracks}
        onClose={() => setTrackInfoOpen(null)}
        onPlay={(t) => { setPid(t.id); setPlaying(true) }}
        onPause={() => setPlaying(false)}
        onSelectTrack={(t) => { setPid(t.id); setPlaying(true); setTrackInfoOpen(t) }}
        onMobileInlineChange={setModalUsesInline}
        onDockedPlayerChange={setModalUsesDocked}
        activeTrackId={pid}
        playing={playing}
        onPrevTrack={(() => {
          if (!trackInfoOpen) return null
          // Navigate per visus track'us su video — surūšiuoti pagal score
          // (tracksAllTime jau atrūšiuotas). Wrap'inasi: jei dabartinis
          // pirmas, prev nukelia į paskutinį (atvirkštinis ciklas). Tai
          // mygtukas niekada nebūna disabled, kol yra ≥2 video track'ai.
          const navList = tracks.filter(t => yt(t.video_url))
          if (navList.length < 2) return null
          const idx = navList.findIndex(t => t.id === trackInfoOpen.id)
          const prev = idx <= 0 ? navList[navList.length - 1] : navList[idx - 1]
          return () => { setPid(prev.id); setPlaying(true); setTrackInfoOpen(prev) }
        })()}
        onNextTrack={(() => {
          if (!trackInfoOpen) return null
          // Wrap'inasi: jei dabartinis paskutinis (arba neskonis sąraše),
          // next nukelia atgal į PIRMĄ (populiariausia score'u). Tai
          // useris peržengia į „pirmas dainas" pasiekęs apatinį galą.
          const navList = tracks.filter(t => yt(t.video_url))
          if (navList.length < 2) return null
          const idx = navList.findIndex(t => t.id === trackInfoOpen.id)
          const next = idx < 0 || idx >= navList.length - 1 ? navList[0] : navList[idx + 1]
          return () => { setPid(next.id); setPlaying(true); setTrackInfoOpen(next) }
        })()}
      />

      <AlbumInfoModal
        albumId={albumModalOpen?.id ?? null}
        preview={albumModalOpen ? {
          title: albumModalOpen.title,
          cover_image_url: (albumModalOpen as any).cover_image_url || null,
          year: albumModalOpen.year ?? null,
        } : null}
        onClose={() => setAlbumModalOpen(null)}
        onMobileInlineChange={setModalUsesInline}
        onDockedPlayerChange={setModalUsesDocked}
        onPrev={(() => {
          if (!albumModalOpen) return null
          // Cikliškai pereinam per visibleAlbums (tas pats sąrašas, kurį
          // useris matė discography section'e). Wrap'inasi į galą.
          if (albums.length < 2) return null
          const idx = albums.findIndex(a => a.id === albumModalOpen.id)
          const prev = idx <= 0 ? albums[albums.length - 1] : albums[idx - 1]
          return () => setAlbumModalOpen(prev)
        })()}
        onNext={(() => {
          if (!albumModalOpen) return null
          if (albums.length < 2) return null
          const idx = albums.findIndex(a => a.id === albumModalOpen.id)
          const next = idx < 0 || idx >= albums.length - 1 ? albums[0] : albums[idx + 1]
          return () => setAlbumModalOpen(next)
        })()}
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
          const bioHeader = `Apie ${artist.name}`

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
                      {/* maxChars 700 → mobile per ilga (~10 eilučių),
                          sutrumpinta iki 420 (~6 eilučių); paspaudus
                          „Skaityti daugiau" atsiveria BioModal su pilnu
                          tekstu. Desktop'e dažniausiai vis tiek ne mažiau
                          plati erdvė, todėl rodom tą patį limit'ą. */}
                      <BioPreview html={bioHtml} onOpen={() => setBioModalOpen(true)} maxChars={420} />
                    </>
                  )}
                  {!solo && members.length > 0 && <MembersInline members={members} />}
                  {memberOf && memberOf.length > 0 && <MemberOfInline groups={memberOf} />}
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
              <SectionTitle label={`${artist.name} albumai`} />

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

              {/* Latest-album spotlight — naujausias studijinis / EP albumas
                  paskutinių 12 mėn (current_year-1 threshold). Renderinasi
                  virš grupavimo zonos, kad nepasiklysų tarp 22 albumų grid'e.
                  Jei nieko naujo nėra — slot'as dingsta. */}
              {latestAlbum && visibleAlbums.length > 0 && (
                <SpotlightAlbumRow
                  album={latestAlbum}
                  artistSlug={artist.slug}
                  topTracks={topTracksByAlbum.get(latestAlbum.id) || []}
                  onOpen={() => setAlbumModalOpen(latestAlbum)}
                  onPlayTrack={(t) => { setPid(t.id); setPlaying(true) }}
                  onTrackClick={(t) => setTrackInfoOpen(t)}
                />
              )}

              {/* Grupes (eras / decades) — kiekviena gauna „dėžutę".
                  MOBILE: dėžutės eina vertikaliai stack'u; viduje albumai
                  slide'inasi į šoną (horizontal snap-scroll), kad vienas
                  era box nebūtų aukštas.
                  DESKTOP (lg+): grid 2-col stack, viduje albumai grid 3-4 col. */}
              {albumGroups && albumGroups.length > 0 ? (
                <div className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {albumGroups.map(g => (
                    <AlbumGroupBox
                      key={g.key}
                      title={g.title}
                      subtitle={g.subtitle}
                      description={g.description}
                      rangeLabel={g.rangeInTitle ? '' : yearRangeLabel(g.year_start, g.year_end)}
                      count={g.albums.length}
                    >
                      {/* Mobile: horizontal scroll inside box. Desktop (lg+):
                          regular 3-4 col grid. */}
                      <div
                        className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0 lg:pb-0 xl:grid-cols-4 [&::-webkit-scrollbar]:hidden"
                        style={{
                          scrollSnapType: 'x mandatory',
                          scrollPaddingLeft: '0.75rem',
                          overscrollBehaviorX: 'contain',
                          WebkitOverflowScrolling: 'touch',
                        }}
                      >
                        {g.albums.map((a, i) => (
                          <div
                            key={a.id}
                            // 36vw ant mobile (vietoj 42vw) — du pilnai matomi
                            // ir trečiojo lentelės kraštas peek'inasi, kad
                            // useris suprastų jog galima slinkti į šoną.
                            className="w-[36vw] max-w-[140px] shrink-0 lg:w-auto lg:max-w-none lg:shrink"
                            style={{ scrollSnapAlign: 'start' }}
                          >
                            <AlbumCard
                              a={a}
                              artistSlug={artist.slug}
                              maxPop={maxAlbumPop}
                              popularity={popLevel(i, g.albums.length)}
                              onOpen={setAlbumModalOpen}
                              topTracks={topTracksByAlbum.get(a.id)}
                              weight={weightByAlbum.get(a.id) || 'full'}
                              onTrackClick={(t) => setTrackInfoOpen(t)}
                              aggregateViews={aggregateViewsByAlbum.get(a.id)}
                              composite={compositeByAlbum.get(a.id)}
                              popBarLevel={popLevelByAlbum.get(a.id)}
                            />
                          </div>
                        ))}
                      </div>
                    </AlbumGroupBox>
                  ))}
                </div>
              ) : (
                groupableAlbums.length > 0 && (
                  <div className={latestAlbum ? 'mt-4' : ''}>
                    {/* Flat grid — small / medium artists (<10 albums or sparse
                        decades). Mobile = snap scroll, desktop = compact grid. */}
                    <div
                      className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                      style={{
                        scrollSnapType: 'x mandatory',
                        scrollPaddingLeft: '1rem',
                        overscrollBehaviorX: 'contain',
                        WebkitOverflowScrolling: 'touch',
                      }}
                    >
                      {groupableAlbums.map((a, i) => (
                        <div
                          key={a.id}
                          className="w-[46vw] max-w-[180px] shrink-0"
                          style={{ scrollSnapAlign: 'start' }}
                        >
                          <AlbumCard
                            a={a}
                            artistSlug={artist.slug}
                            maxPop={maxAlbumPop}
                            popularity={popLevel(i, groupableAlbums.length)}
                            onOpen={setAlbumModalOpen}
                            topTracks={topTracksByAlbum.get(a.id)}
                            weight={weightByAlbum.get(a.id) || 'full'}
                            onTrackClick={(t) => setTrackInfoOpen(t)}
                            aggregateViews={aggregateViewsByAlbum.get(a.id)}
                            composite={compositeByAlbum.get(a.id)}
                            popBarLevel={popLevelByAlbum.get(a.id)}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="hidden gap-3 sm:grid sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8">
                      {groupableAlbums.map((a, i) => (
                        <AlbumCard
                          key={a.id}
                          a={a}
                          artistSlug={artist.slug}
                          maxPop={maxAlbumPop}
                          popularity={popLevel(i, groupableAlbums.length)}
                          onOpen={setAlbumModalOpen}
                          topTracks={topTracksByAlbum.get(a.id)}
                          weight={weightByAlbum.get(a.id) || 'full'}
                          onTrackClick={(t) => setTrackInfoOpen(t)}
                          aggregateViews={aggregateViewsByAlbum.get(a.id)}
                          composite={compositeByAlbum.get(a.id)}
                          popBarLevel={popLevelByAlbum.get(a.id)}
                        />
                      ))}
                    </div>
                  </div>
                )
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
                    {orphanTracks.map((t, i) => (
                      <TrackRow
                        key={t.id}
                        t={t}
                        artistSlug={artist.slug}
                        popularity={popLevelWithFallback(t, i, orphanTracks.length, popInfoTracks)}
                        onOpen={setTrackInfoOpen}
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

        {/* Galerija (masonry) */}
        {galleryPhotos.length > 0 && (
          <section ref={galerijaRef} id="galerija">
            <SectionTitle label={`${artist.name} nuotraukos`} count={galleryPhotos.length} />
            <MasonryGallery
              photos={galleryPhotos}
              onOpen={(i) => setLightboxIndex(i)}
            />
          </section>
        )}

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
                  {/* Cards link directly to canonical /diskusijos/tema/{legacy_id}
                      page (kuris renderuoja pilną thread-page-client su likes,
                      replies, composer, sort). Anksčiau buvo custom drawer su
                      limited UI — user'is teisingai pastebėjo, kad geriau
                      naudoti vieną komponentą visur. */}
                  {previewThreads.map((t) => (
                    <DiscussionRow key={t.legacy_id} t={t} onOpen={setActiveThread} />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-[var(--border-default)] p-8 text-center">
                  <div className="mb-1 text-[14px] font-bold text-[var(--text-muted)]">Dar nėra diskusijų apie {artist.name}</div>
                  <div className="text-[12px] text-[var(--text-faint)]">Diskusijų kūrimo funkcija ruošiama.</div>
                </div>
              )}
            </section>
          )
        })()}

        {/* Past events — fresh only; archyvas atidaromas pagal showArchive */}
        {(pastEvents.length > 0 || archivedPastEvents.length > 0) && (
          <section>
            <div className="flex items-center justify-between">
              <SectionTitle label="Renginių archyvas" />
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
              {(showArchive ? [...pastEvents, ...archivedPastEvents] : pastEvents).map((e: any) => <EventCard key={e.id} e={e} variant="past" onOpen={setActiveEvent} />)}
            </div>
          </section>
        )}

        {/* Legacy news — fresh only by default; archyvas via showArchive */}
        {(freshLegacyNews.length > 0 || archivedLegacyNews.length > 0) && (
          <section>
            <div className="flex items-center justify-between">
              <SectionTitle label="Naujienų archyvas" />
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
                const pc = (n as any).post_count ?? 0
                const lc = (n as any).like_count ?? 0
                // Migration timestamp detection — Coldplay/intl artistų visi
                // naujienų įrašai turėjo `first_post_at = NOW()` IR
                // `last_post_at = NOW()` (tas pats), nes legacy scrape'as
                // nemigravo originalios datos. Heuristika: jei (a) data
                // jaunesnė nei 30 dienų IR (b) first_post_at ≈ last_post_at
                // (skirtumas <60s — abu set'inti tame pačiame migration
                // call'e), tai NOW() artifact'as, ne real news date.
                // Mikutavičiui: news properly migrated su real datomis
                // (2002, 2008 ir t.t.) — ageDays >> 30, praeina filtrą.
                const rawDate = n.first_post_at
                const lastAct = (n as any).last_post_at
                const dateStr = (() => {
                  if (!rawDate) return null
                  const d = new Date(rawDate)
                  if (isNaN(d.getTime())) return null
                  const ageDays = (Date.now() - d.getTime()) / 86400000
                  if (ageDays < 30) {
                    if (!lastAct) return null
                    const lastD = new Date(lastAct)
                    if (!isNaN(lastD.getTime())) {
                      const gapSec = Math.abs(lastD.getTime() - d.getTime()) / 1000
                      if (gapSec < 60) return null
                    }
                  }
                  return d.toLocaleDateString('lt-LT', { year: 'numeric', month: 'short', day: 'numeric' })
                })()
                // News kortelės nukreipia į /news/{slug} (canonical news UI
                // su gallery, related news, music player). canonical_slug =
                // discussions.slug po canonical pipeline migracijos.
                const newsHref = n.canonical_slug
                  ? `/news/${n.canonical_slug}`
                  : `/diskusijos/tema/${n.legacy_id}`
                return (
                  <Link
                    key={n.legacy_id}
                    href={newsHref}
                    onClick={(ev) => {
                      ev.preventDefault()
                      setActiveNews({
                        id: (n as any).id || n.legacy_id,
                        slug: n.canonical_slug || undefined,
                        title,
                        legacy_id: n.legacy_id,
                      })
                    }}
                    className="group flex flex-col gap-3 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 no-underline transition-all hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.2)]"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[rgba(249,115,22,0.2)] bg-[rgba(249,115,22,0.1)] text-[var(--accent-orange)]">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M20 3H4a2 2 0 00-2 2v14a2 2 0 002 2h16a2 2 0 002-2V5a2 2 0 00-2-2z" /></svg>
                      </div>
                      <div className="font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--accent-orange)]">Naujiena</div>
                      {dateStr && <div className="ml-auto text-[11px] font-medium text-[var(--text-muted)]">{dateStr}</div>}
                    </div>
                    <div className="text-[14px] font-bold leading-snug text-[var(--text-primary)] sm:text-[15px]">{title}</div>
                    {(pc > 0 || lc > 0) && (
                      <div className="mt-auto flex items-center gap-3 pt-1 text-[11px] text-[var(--text-muted)]">
                        {lc > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                            </svg>
                            {lc}
                          </span>
                        )}
                        {pc > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                            {pc}
                          </span>
                        )}
                      </div>
                    )}
                  </Link>
                )
              })}
            </div>
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
