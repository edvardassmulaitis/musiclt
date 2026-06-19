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
import { trackCompositeScore, trackArtistSortVal, makeArtistTrackScorer, makeArtistTrackLeveler } from '@/lib/track-popbar'
import { normalizeBio } from '@/lib/normalize-bio'
import { formatArtistList } from '@/lib/format-artists'
import { accusativeArtistName, genitiveArtistName } from '@/lib/text-utils'
import { countryFlag } from '@/lib/country-flags'
import { relativeLt } from '@/lib/discoveries'
import DropBar from '@/components/DropBar'
import AlbumInfoModal from '@/components/AlbumInfoModal'
import EventInfoModal, { type EventPreview } from '@/components/EventInfoModal'
import NewsInfoModal, { type NewsPreview } from '@/components/NewsInfoModal'
import { TrackInfoModal } from '@/components/TrackInfoModal'
import ArtistConcertRow from './ArtistConcertRow'
import type { ConcertRecording } from '@/lib/concert-recordings-shared'

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
type Member = { id: number; slug: string; name: string; cover_image_url?: string; member_from?: number; member_until?: number; is_current?: boolean; type?: string }
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
/** „Muzikos atradimai" įrašas apie šį atlikėją (discoveries lentelė, žr.
 *  lib/discoveries.ts). Rodomas Diskusijų sekcijoje kaip speciali kortelė +
 *  modalas su pilnais komentarais ir veikiančiais embed'ais. */
type DiscoveryItem = {
  id: number
  comment_id: number | null
  created_at: string | null
  body: string | null
  like_count: number | null
  author: { username: string | null; full_name: string | null; avatar_url: string | null } | null
  artist_name: string | null
  track_name: string | null
  track_slug?: string | null
  embed_type: string | null
  embed_id: string | null
  tags: string[]
}
type Props = {
  artist: any; heroImage: string | null; genres: Genre[]; substyles?: Genre[]
  links: { platform: string; url: string }[]; photos: Photo[]
  albums: Album[]; tracks: Track[]; members: Member[]; memberOf?: Member[]; followers: number; likeCount: number
  news: any[]; events: any[]; similar: any[]
  newTracks: Track[]; topVideos: Track[]; chartData: ChartPt[]; hasNewMusic: boolean
  legacyCommunity?: LegacyCommunity
  legacyThreads?: LegacyThread[]; legacyNews?: LegacyThread[]
  /** Bendruomenės „Muzikos atradimų" komentarai, susieti su šiuo atlikėju. */
  discoveries?: DiscoveryItem[]
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
  /** Sritys (occupation+instrument) — jau pritaikyti LT vertimai, dedup'inta
   *  pagal display label'į, hidden values atfiltruoti. Rodom kaip chip'us
   *  infobox sekcijoje, jei sąrašas non-empty. */
  displayRoles?: string[]
  /** Score-based PopBar level (0..5). Šis percentilis tarp VISŲ atlikėjų su
   *  score>0 (server-side compute). 0 = bar'as nerodomas (placeholder/empty
   *  score). 1..5 — dot count. */
  popBarLevel?: number
  /** Recent activity PopBar level (0..5) — 30d like count, fixed thresholds.
   *  Antras bar'as Hero zonoje, žalia spalva, kad būtų aiškus „trending"
   *  signal'as atskirai nuo cumulative score. */
  recentPopBarLevel?: number
  /** Šio atlikėjo koncertų įrašai (live pasirodymai) — rodomi sekcijoje po
   *  galerija. Server fetch per lib/concert-recordings.getArtistRecordings. */
  concertRecordings?: ConcertRecording[]
  /** Pagrindinės atlikėjo diskusijų temos modern `discussions.id` — į ją eina
   *  inline komentaras Diskusijų sekcijoje. Nustatoma serveryje (get-or-create
   *  page.tsx). null — komentaro composer'is nerodomas. */
  mainDiscussionId?: number | null
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

/** Primary type — single canonical label for display badge.
 *  Soundtrack albumai dažnai yra ir type_studio=true (Flash Gordon style)
 *  → grąžinam 'Studijinis' (default), bet aTypes() rodys ir 'Garso takeliai'. */
const aType = (a: Album) => {
  if (a.type_ep) return 'EP'
  if (a.type_single) return 'Singlas'
  if (a.type_live) return 'Live'
  if (a.type_compilation) return 'Rinkinys'
  if (a.type_remix) return 'Remix'
  // type_soundtrack be type_studio → 'Garso takeliai' (pure soundtrack);
  // type_soundtrack + type_studio → 'Studijinis' (dual-purpose album,
  // soundtrack rodomas kaip secondary type per aTypes()).
  if (a.type_soundtrack && !a.type_studio) return 'Garso takeliai'
  if (a.type_demo) return 'Demo'
  return 'Studijinis'
}

/** All applicable types — used for filter membership ir multi-badge.
 *  Dual-type album (Flash Gordon: type_studio + type_soundtrack) rodomas
 *  ir Studijiniai tab, ir Garso takeliai tab. */
const aTypes = (a: Album): string[] => {
  const out: string[] = []
  if (a.type_ep) out.push('EP')
  if (a.type_single) out.push('Singlas')
  if (a.type_live) out.push('Live')
  if (a.type_compilation) out.push('Rinkinys')
  if (a.type_remix) out.push('Remix')
  if (a.type_soundtrack) out.push('Garso takeliai')
  if (a.type_demo) out.push('Demo')
  if (a.type_studio) out.push('Studijinis')
  // Jei nė vienas type_ nesetinta — default 'Studijinis' (legacy data fallback).
  if (out.length === 0) out.push('Studijinis')
  return out
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
  'Garso takeliai': 'Garso takeliai',
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

// Vėliava bet kuriai šaliai — pilnas LT→ISO map'as lib/country-flags.ts.
// Nežinoma šalis (pvz. „Kita") → '' (caller'is rodo 🌍 fallback'ą). Anksčiau
// čia buvo trumpas hardcoded sąrašas be Meksikos ir dešimčių kitų šalių →
// vėliava nerodydavo nieko (bug 2026-06-18).
function flagFor(country?: string | null): string {
  return countryFlag(country) || ''
}

/** Brand colors for social icons. `null` means "inherit current text color"
 *  — we use that for X/Twitter which has a white-on-black glyph and needs to
 *  adapt to the theme instead of being hardcoded white (invisible on light). */
const SOC: Record<string, { l: string; c: string | null; d: string }> = {
  spotify: { l: 'Spotify', c: '#1DB954', d: 'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.52 17.34c-.24.36-.66.48-1.02.24-2.82-1.74-6.36-2.1-10.56-1.14-.42.12-.78-.18-.9-.54-.12-.42.18-.78.54-.9 4.56-1.02 8.52-.6 11.64 1.32.42.18.48.66.3 1.02z' },
  youtube: { l: 'YouTube', c: '#FF0000', d: 'M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.38.55A3.02 3.02 0 0 0 .5 6.19 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.81 3.02 3.02 0 0 0 2.12 2.14c1.88.55 9.38.55 9.38.55s7.5 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14A31.6 31.6 0 0 0 24 12a31.6 31.6 0 0 0-.5-5.81zM9.54 15.57V8.43L15.82 12l-6.28 3.57z' },
  tiktok: { l: 'TikTok', c: '#00c8c0', d: 'M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.96-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z' },
  facebook: { l: 'Facebook', c: '#1877F2', d: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z' },
  // Instagram — gradient'as nepalaikomas SOC objekto schema (single hex
  // color), todėl naudojam approx solid (#E1306C — viduriniojo „rožinio
  // raudonojo" tono). Render'is sky platformų pill'e tas pats kaip kitiems.
  instagram: { l: 'Instagram', c: '#E1306C', d: 'M7.5 2h9A5.5 5.5 0 0 1 22 7.5v9a5.5 5.5 0 0 1-5.5 5.5h-9A5.5 5.5 0 0 1 2 16.5v-9A5.5 5.5 0 0 1 7.5 2zm0 2A3.5 3.5 0 0 0 4 7.5v9A3.5 3.5 0 0 0 7.5 20h9a3.5 3.5 0 0 0 3.5-3.5v-9A3.5 3.5 0 0 0 16.5 4h-9zM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm5.75-2.75a.95.95 0 1 1-1.9 0 .95.95 0 0 1 1.9 0z' },
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
  // 2026-05-25 v6: per-artist percentile leveler. Bar'ai relatyvūs šio
  // atlikėjo kontekstui — kiekvienas atlikėjas turi „top hit'us" (5/5) ir
  // „prastesnes" dainas (1/5), neatsižvelgiant į global popularity.
  // Sprendžia Edvardo skundą, kad LT atlikėjai mažesnės rinkos kontekste
  // visada turėdavo žemus bar'us. Sort'as IR level'is abu išvedami iš
  // `trackCompositeScore` → bar'ai monotoniški.
  const popLeveler = useMemo(
    () => makeArtistTrackLeveler(tracksAllTime),
    [tracksAllTime],
  )
  const allTimePopLevelById = useMemo(() => {
    const map = new Map<number, number>()
    for (const t of tracksAllTime) {
      const lvl = popLeveler(t)
      if (lvl > 0) map.set(t.id, lvl)
    }
    return map
  }, [tracksAllTime, popLeveler])
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
  // 2026-05-21: isPaused state PAŠALINTAS — buvo set'inamas onStateChange
  // callback'e per kiekvieną YT player state change (play/buffer/play
  // sekos kiekviename click'e), bet niekur neskaitomas. Sukurdavo dead
  // React re-render'ius kiekvieną kartą kai user'is interact'indavo
  // su YT controls. Safari pasekmė: iframe pointer capture prarandamas
  // vidury click sekos → progress bar single click nesveik'indavo.
  // Embed-disabled videos: kanalo savininkas (pvz SelMusic) išjungę embed'ą
  // trečioms šalims. YT.Player onError grąžina kodus 101 / 150 šitam case'ui.
  // Saugom Set'ą per session — jei vienas video disabled, mes display'inam
  // fallback iškart, neretrying'inam YT.Player kuris tik vėl meta klaidą.
  const [embedDisabled, setEmbedDisabled] = useState<Set<string>>(new Set())
  const isEmbedDisabled = !!displayVid && embedDisabled.has(displayVid)

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
  // 2026-05-21 STALE CLOSURE FIX: YT.Player sukuriamas vienkartinai,
  // ir jo onStateChange callback'as closure'ina React state'ą iš to
  // momento. Be ref'o, kai track keičiasi (activeTrackId↑), useEffect
  // re-run'ina bet early-returns dėl `playerRef.current` → player'is
  // neperkuriamas → CALLBACK CLOSURE LIEKA SU SENU activeTrackId
  // (pirmojo paleisto track'o ID).
  //
  // Result'as: track 2 baigiasi → callback mano kad active=1 → finds
  // next=2 → setActiveTrack(2) → ne advance, nes state jau 2 → STOPS.
  // Manual play track 7 → callback po jo end'ui mano active=1 → finds
  // next=2 → grįžta į 2-ą track.
  //
  // Fix: laikom „latest" reikšmes ref'uose, kuriuos kiekvienas render
  // atnaujina. onStateChange skaito iš ref.current, gauna up-to-date
  // reikšmę kiekvieną kartą.
  const activeTrackIdRef = useRef(activeTrackId)
  const tracksAllTimeRef = useRef(tracksAllTime)
  const tracksTrendingRef = useRef(tracksTrending)
  const onSelectTrackRef = useRef(onSelectTrack)
  useEffect(() => { activeTrackIdRef.current = activeTrackId }, [activeTrackId])
  useEffect(() => { tracksAllTimeRef.current = tracksAllTime }, [tracksAllTime])
  useEffect(() => { tracksTrendingRef.current = tracksTrending }, [tracksTrending])
  useEffect(() => { onSelectTrackRef.current = onSelectTrack }, [onSelectTrack])
  // Ar vartotojas jau nori groti — kad cued player'is per onReady paleistų
  // tik tada (pre-create vyksta dar prieš pirmą tap'ą).
  const playingRef = useRef(playing)
  useEffect(() => { playingRef.current = playing }, [playing])

  useEffect(() => {
    // PRE-CREATE cued (autoplay=0) kai tik turim displayVid → player'is READY
    // dar prieš pirmą tap'ą. Grojimas paleidžiamas SINKRONIŠKAI tap handler'yje
    // (handleSelect / overlay) → playVideo gesture → 1 tap su garsu (įsk. iOS).
    if (!apiReady || !displayVid || !containerRef.current) return
    if (isEmbedDisabled) return
    if (playerRef.current) return  // jau sukurta — track switch'ai per loadVideoById

    const W = window as any
    const inner = document.createElement('div')
    inner.style.width = '100%'
    inner.style.height = '100%'
    containerRef.current.innerHTML = ''
    containerRef.current.appendChild(inner)

    const player = new W.YT.Player(inner, {
      // 2026-05-21: Privacy-Enhanced Mode (youtube-nocookie.com) —
      // Safari'aus Intelligent Tracking Prevention (ITP) blokuoja
      // youtube.com cookie/storage trečioms šalims, dėl ko YT player
      // grąžina Klaidą 153 („Vaizdo įrašų leistuvės konfigūracijos
      // klaida"). nocookie versija specialiai sukurta embedu — be
      // tracking cookies, su pilnu funkcionalumu, ir veikia su ITP.
      host: 'https://www.youtube-nocookie.com',
      videoId: displayVid,
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: 0,   // cued; grojam per gesture playVideo (su garsu, be mute)
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
          // Jei vartotojas jau paspaudė (dar player'iui kuriantis) — paleidžiam.
          if (playingRef.current) { try { e.target.playVideo() } catch {} }
        },
        onStateChange: (e: any) => {
          // YT player states: -1=unstarted, 0=ended, 1=playing,
          // 2=paused, 3=buffering, 5=cued.
          // NB: nepateikiam React state'o iš čia — vidury YT click sekos
          // (progress bar seek = buffering → playing) re-render'iai
          // ant Safari sukeldavo iframe pointer capture loss.
          if (e.data === 0) {
            // Track ended — auto-skip į kitą track'ą sąraše su video,
            // su rollover į pradžią. Naudojam ref'us, kad gautume
            // CURRENT state (ne stale closure iš player creation moment).
            const currentId = activeTrackIdRef.current
            const allTracks = [...tracksAllTimeRef.current, ...tracksTrendingRef.current]
            const idx = allTracks.findIndex(t => t.id === currentId)
            if (idx < 0) return
            for (let i = 1; i <= allTracks.length; i++) {
              const candidate = allTracks[(idx + i) % allTracks.length]
              if (candidate && yt(candidate.video_url)) {
                onSelectTrackRef.current(candidate.id)
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
          // 101/150 = embed disabled by owner. 153 = player config
          // error (dažnai Safari ITP / cookie blocking issue). Visus
          // tris handle'inam vienodai — fallback į „Žiūrėti YouTube'e"
          // overlay'jų.
          if (code === 101 || code === 150 || code === 153) {
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
    // Po stale closure fix'o deps mažesni — vidiniai callback'ai naudoja
    // ref'us, todėl track sąrašas / activeTrackId nereikalingi triggerinti
    // re-creation. Player'is sukuriamas tik vieną kartą per session.
  }, [apiReady, displayVid, isEmbedDisabled])

  // VIDEO CHANGE — kai displayVid pasikeičia (pvz. perjungus tab'ą, kuris
  // pakeičia firstWithVideo), iframe lieka tas pats. SVARBU: jei vartotojas
  // dar NEGROJA — naudojam cueVideoById (TYLIAI, be autoplay), kad tab'ų
  // perjungimas nepradėtų groti. Jei jau groja — loadVideoById tęsia.
  useEffect(() => {
    if (!playerRef.current || !displayVid) return
    if ((playerRef.current as any)._vid === displayVid) return
    try {
      if (playingRef.current) playerRef.current.loadVideoById?.(displayVid)
      else playerRef.current.cueVideoById?.(displayVid)
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
  // Gesture playback — paleidžiam SINKRONIŠKAI tame pačiame tap'e (1 click,
  // su garsu). playVideo/loadVideoById ant READY player'io per user-gesture
  // leidžiamas visur (įsk. iOS).
  const playInGesture = (id: number) => {
    const tr = [...tracksAllTime, ...tracksTrending].find(t => t.id === id)
    const vid = yt(tr?.video_url)
    const p = playerRef.current
    if (p && vid) {
      try {
        if ((p as any)._vid !== vid) { p.loadVideoById(vid); (p as any)._vid = vid }
        else p.playVideo()
      } catch {}
    }
  }

  const handleSelect = (id: number) => {
    if (id === activeTrackId && playing) return  // already playing this track
    onSelectTrack(id)
    onRequestPlay()
    pingPlay(id)
    playInGesture(id)
  }

  return (
    // Hardened size lock — multiple defensive layers prevent any size
    // change tarp paused/playing state'u. CSS `contain: size layout`
    // izoliuoja inner content layout from parent (iframe injectai
    // negali push'inti parent dydziui).
    <div
      className="w-full max-w-full overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[0_20px_60px_-20px_rgba(0,0,0,0.4)]"
      style={{ boxSizing: 'border-box' }}
    >
      {/* Player area — mobile: aspect-video, desktop: fixed 260px height
          + 100% width.
          2026-05-21 v3: pašalinau `isolation: isolate` (sukurdavo
          stacking context'ą kuris ant Safari blokuodavo YT iframe click
          events). Iframe dydis užtikrintas per explicit dimensions +
          overflow-hidden. */}
      <div
        className="relative aspect-video lg:aspect-auto lg:h-[260px] w-full max-w-full overflow-hidden bg-black"
        style={{ minWidth: 0, minHeight: 0, boxSizing: 'border-box' }}
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
            {/* Play overlay — rodomas tik kai !playing. Conditional render
                (ne CSS toggle) — Safari'jui paprastesnis hit-testing'as,
                kai DOM'e nėra `pointer-events: none` overlay'aus virš YT
                iframe'o. Anksciau bandyta always-mount + opacity-0, bet
                Safari iframe progress-bar click vis tiek prarasdavo. */}
            {!playing && (
            <button
              type="button"
              onClick={() => {
                const target = activeTrackId ?? firstWithVideo?.id
                if (target != null && target !== activeTrackId) onSelectTrack(target)
                onRequestPlay()
                if (target != null) { pingPlay(target); playInGesture(target) }
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
              const pop = allTimePopLevelById.get(t.id) ?? popLevelWithFallback(t, i, list.length, popInfo, popLeveler)
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
                          // Singlų tabe — tik išleidimo metai, ŽALIAI (ne mėlynai).
                          if (filter === 'singles') {
                            if (!yr) return null
                            return (
                              <span
                                className="shrink-0 rounded bg-[rgba(34,197,94,0.16)] px-1.5 py-0.5 font-['Outfit',sans-serif] text-[9.5px] font-extrabold tabular-nums tracking-wider text-[var(--accent-green)]"
                                title={`Išleista ${yr}`}
                              >
                                {yr}
                              </span>
                            )
                          }
                          // Naujos dainos (einamųjų/praėjusių metų) — vietoj metų
                          // badge'o rodom mažą žalią tašką „naujumo" signalui.
                          if (newTrackIds.has(t.id)) {
                            return (
                              <span
                                className="inline-block h-2 w-2 shrink-0 rounded-full bg-[var(--accent-green)]"
                                title="Nauja daina"
                                aria-label="Nauja daina"
                              />
                            )
                          }
                          return null
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
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-orange)] hover:bg-[rgba(249,115,22,0.1)] hover:text-[var(--accent-orange)]"
                    >
                      {/* Burger/text-lines icon — universal "open details" */}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                        <line x1="4" y1="7" x2="20" y2="7" />
                        <line x1="4" y1="12" x2="20" y2="12" />
                        <line x1="4" y1="17" x2="14" y2="17" />
                      </svg>
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

// trackCompositeScore, trackArtistSortVal, makeArtistTrackScorer —
// ekstraktuota į `lib/track-popbar.ts` 2026-05-25 v4, kad admin debug
// puslapis naudotų tą pačią lexicographic sort logic'ą. Žr. lib failą.

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

/** PopBar level su fallback'u — pagrinde per-artist leveler iš
 *  `lib/track-popbar.ts`, bet kai artist'as visiškai neturi jokio signal'o
 *  (signal='none'), grįžtam į position-based proportional kad sąraše vis
 *  tiek matytųsi koks nors bar'as (geriau nei plika eilė nulių). Kai artist
 *  TURI signal'o, tracks be duomenų gauna 0 — bar slepiamas (informatyvu:
 *  „nėra duomenų" vietoj fake proportional rank'o).
 */
function popLevelWithFallback(
  t: any,
  idx: number,
  total: number,
  popInfo: { signal: PopSignal; max: number },
  leveler: (t: any) => number,
): number {
  const abs = leveler(t)
  if (abs > 0) return abs
  if (popInfo.signal === 'none' || total <= 0) {
    if (total <= 1) return 3
    const ratio = (total - idx) / total
    return Math.max(1, Math.min(5, Math.ceil(ratio * 5)))
  }
  return 0
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
 *  skirtumai tarp top hit'o, vidutinio ir silpnesnio įrašo.
 *
 *  Size variants:
 *    'sm' (default) — h-[3px] w-[14px] dashes — track/album cards
 *    'lg'           — h-[6px] w-[32px] dashes — artist hero (po pavadinimu)
 *                     prominence, kad vartotojas iš karto matytų signal'ą. */
function PopBar({ level, size = 'sm', color = 'orange', animate = false, delayMs = 250, fullWidth = false }: { level: number; size?: 'sm' | 'md' | 'lg'; color?: 'orange' | 'blue'; animate?: boolean; delayMs?: number; fullWidth?: boolean }) {
  // 2026-05-21 v6: rodom TIK užpildytus dot'us (nebepalieka tuščių pilkų
  // placeholderių). Bar'o ilgis dabar proporcingas pop level'iui —
  // 2/5 atlikėjas turės trumpą bar'ą, 5/5 — pilną. Anksčiau visada
  // rodėm 5 dot'us su pilkais empty placeholderiais, kas vizualiai
  // atrodė kaip „pusiau tuščias" loading element'as (ypač trending
  // sekcijoj kur dažni 2-3/5 lygiai).
  //
  // v6.1: `fullWidth` — kai true, rodom pilnus 5 dot'us, bet empty
  // slot'ai yra transparent (užima vietą, bet nematomi). Naudojam tik
  // Hero recent 🔥 chip'e: kombinuojam su chip-level reveal animacija,
  // kad useris negalėtų atspėti recent level'io iš chip pločio
  // (kuris dabar atsiranda po score bar pabaigos).
  const total = 5
  // 2026-05-21 v4: ir score bar'as, ir recent bar'as dabar oranžiniai —
  // useris paprašė vienodos spalvos (orange) abiem; recent atskiriamas
  // tik per kitą ikoną (🔥 flame vs ⭐ trophy). `color="blue"` palaikymas
  // paliktas backward-compat (nenaudojamas).
  const filledBg = color === 'blue' ? 'bg-[#3b82f6]' : 'bg-[var(--accent-orange)]'
  // Size variants:
  //   'sm' — tracks/albums cards (kompaktiškas)
  //   'md' — artist Hero zona (tarpinė reikšmė; abu bar'ai šalia vienas kito)
  //   'lg' — buvęs Hero standalone (dabar nenaudojamas po 2026-05-20 compact)
  const dashCls =
    size === 'lg' ? 'h-[6px] w-[32px] rounded-[3px] sm:w-[40px]' :
    size === 'md' ? 'h-[4px] w-[20px] rounded-[2px] sm:w-[24px]' :
    'h-[3px] w-[14px] rounded-[2px]'
  const gapCls = size === 'sm' ? 'mt-1 gap-[3px]' : 'gap-[3px]'
  // Edge case: jei level <= 0 ir ne fullWidth, neretur'inam nieko.
  // fullWidth atveju visada rodom 5 dot'us (gali būti visi empty).
  if (level <= 0 && !fullWidth) return null
  const renderCount = fullWidth ? total : level
  return (
    <div className={`flex ${gapCls}`} aria-hidden>
      {Array.from({ length: renderCount }).map((_, i) => {
        // 2026-05-21 v6: pagreitintos cascade timing'ai (user feedback:
        // v5 per lėtai per du bar'us).
        //
        // Per-dot trukmės:
        //   - Per-dot stagger 220ms (v5: 350ms)
        //   - Per-dot duration 600ms (v5: 900ms)
        //   - Translate-in iš kairės + flash glow (nepasikeitė)
        //
        // Bendra trukmė vienam bar'ui: delayMs + (level-1)*220 + 600
        //   5-dot score bar (delay 250): 250 + 880 + 600 = ~1730ms
        //   5-dot recent bar (delay 1700): 1700 + 880 + 600 = ~3180ms
        // Total cascade per du bar'us ~3.2s (v5 buvo ~5.5s).
        const filled = i < level
        const accentColor = color === 'blue' ? '#3b82f6' : 'var(--accent-orange)'
        // Empty slot'ai (tik fullWidth atveju) — transparent, be animation,
        // užima vietą bet nematomi. Naudojam, kad recent chip'as turėtų
        // pastovų plotį ir useris negalėtų atspėti level'io iš formos.
        if (!filled) {
          return (
            <span
              key={i}
              className={[dashCls, 'bg-transparent'].join(' ')}
              aria-hidden
            />
          )
        }
        const animStyle: React.CSSProperties = animate
          ? {
              opacity: 0,
              transform: 'translateX(-10px) scale(0.3)',
              transformOrigin: 'left center',
              animation: `popBarFill 600ms cubic-bezier(0.22, 1, 0.36, 1) ${delayMs + 220 * i}ms forwards`,
              ['--popbar-flash' as any]: accentColor,
            }
          : { opacity: 0.55 + (0.45 * (i + 1) / total) }
        return (
          <span
            key={i}
            className={[
              dashCls,
              'transition-colors',
              filledBg,
            ].join(' ')}
            style={animStyle}
          />
        )
      })}
    </div>
  )
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
  artist, heroImage, loaded,
  tracksAllTime, tracksTrending, activeTrackId, onSelectTrack,
  playing, onRequestPlay, onOpenTrackInfo, hasAnyVideo,
  upcomingEvents, onOpenEventsModal, onOpenHeroLightbox, onOpenEvent,
  popBarLevel, recentPopBarLevel = 0, genres, substyles = [], ranks = [], onOpenTopArtists,
}: {
  artist: any; heroImage: string | null; loaded: boolean
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
  /** Score-based popularity bar level (0..5). 0 = neradom — bar'as
   *  paslepiamas. Kitos reikšmės — 5-dot bar'as kaip albumams/tracks. */
  popBarLevel: number
  /** Recent activity PopBar level (0..5) — žalias antras bar'as šalia main.
   *  0 = bar'as nerodomas (jokio recent like aktyvumo). */
  recentPopBarLevel?: number
  /** Primary genre + visi žanrai — naudojam pirmajį chip'e po pavadinimu.
   *  Clickable į TopArtistsModal. */
  genres: Genre[]
  /** Substyles — perkelti iš SideInfo į Hero (po main genre chip'o), kad
   *  visi žanrai būtų vienoje vietoje. */
  substyles?: Genre[]
  /** Ranks — naudojam #X chip'ą šalia main genre. LT → country rank,
   *  non-LT → global rank. */
  ranks?: Rank[]
  /** Atidaro TopArtistsModal su filtru — country/genre/substyle ARBA
   *  empty object {} su global=true (visi atlikėjai sort by score), ARBA
   *  recent=true (visi atlikėjai sort by 30d like count). */
  onOpenTopArtists?: (filter: { country?: string; genre?: string; global?: boolean; recent?: boolean }) => void
}) {
  const flag = artist.country ? (flagFor(artist.country) || '🌍') : ''
  // Rank logic: chip'as su #N RODOMAS PAGAL ŽANRO RANK (ne country/global).
  // Anksčiau buvo country/global, bet useris paspaudęs chip'ą atidaro
  // ŽANRO modal'ą — ten matomas genre rank (Muse — #4 iš 51 Roko muzikoj).
  // Kad numeris chip'e ir modal'e SUTAPTŲ, abu naudoja žanro rank'ą.
  const primaryRank = ranks.find(r => r.scope === 'genre')
  // Grayscale efektas hero foto, kai:
  //   - Solo atlikėjas miręs (death_date)
  //   - Grupė pabaigė veiklą (active_until <= currentYear)
  // Vizualus signal'as „nebevyksta nauja kūryba". Foto desaturate'inta,
  // šiek tiek pritamsinta — kad nebūtų grim atmosfera.
  const isSolo = artist.type === 'solo'
  const isInactive = isSolo
    ? !!artist.death_date
    : !!(artist.active_until && Number(artist.active_until) < new Date().getFullYear() + 1)
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
    <section className="relative w-full bg-[var(--bg-surface)]">
      {/* Photo backdrop:
          - Mobile: aspect-[3/2] — siauresnis nei aspect-video, mažiau
            upscale artifact'ų low-res nuotraukoms.
          - Desktop: foto plotis adaptyvus pagal natural aspect ratio
            (portrait 380, square 480, landscape 720) — kraštai nukerpa
            mažiau svarbių dalių, kompozicija išlieka. */}
      <div
        // 2026-05-25: mobile'e (be lg:) jei `heroImage` nėra — hide'inam
        // visą foto container'į. Anksčiau rodydavom 3:2 aspect dark gradient
        // placeholder'į, kuris ant mobile užimdavo ~80vh tuščios vietos
        // ir spaude title žemyn. Dabar — be foto, title pakyla iškart po
        // header'io. Desktop'e (lg:) container'is yra `absolute` ir vis tiek
        // turi gradient backdrop'ą, kad title kolona ant photo'os kolonos
        // krašto nebūtų plika.
        className={[
          'relative overflow-hidden bg-black',
          heroImage ? 'aspect-[3/2] w-full' : 'hidden',
          'lg:block lg:absolute lg:inset-y-0 lg:left-0 lg:right-auto lg:aspect-auto lg:w-[var(--hero-w,480px)]',
        ].join(' ')}
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
                // Inactive (miręs solo / pasibaigusi grupė) → desaturate
                // backdrop'ą iki grayscale, šiek tiek pritamsinti — vizualus
                // signal'as „nebevyksta aktyvi kūryba".
                filter: isInactive
                  ? 'blur(60px) saturate(0) brightness(0.7)'
                  : 'blur(60px) saturate(1.3) brightness(0.85)',
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
              onError={(e) => {
                // Jei weserv.nl proxy lūžta (503/404 — 2026-05-19 bug ant
                // Wikimedia URL'ų be `https://` protocol), pereinam į
                // tiesioginį source URL. Apsauga nuo infinite loop'o per
                // data-fb-tried marker'į.
                const img = e.currentTarget as HTMLImageElement
                if (img.dataset.fbTried) return
                img.dataset.fbTried = '1'
                if (heroImage && img.src !== heroImage) img.src = heroImage
              }}
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
                // Inactive (miręs / pabaigta veikla) → grayscale + slightly
                // darker. Signal'as: nebevyksta aktyvi kūryba.
                filter: isInactive
                  ? 'grayscale(1) contrast(1.05) brightness(0.95)'
                  : 'saturate(1.1) contrast(1.03)',
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

      <style>{`
        @keyframes apHeroZoom{0%{transform:scale(1.02)}100%{transform:scale(1.08)}}
        @keyframes popBarFill {
          0%   { opacity: 0; transform: translateX(-10px) scale(0.3); box-shadow: 0 0 0 0 transparent; }
          55%  { opacity: 1; transform: translateX(0) scale(1.25); box-shadow: 0 0 18px 3px var(--popbar-flash, var(--accent-orange)); }
          100% { opacity: 1; transform: translateX(0) scale(1); box-shadow: 0 0 0 0 transparent; }
        }
        /* v6.1: 🔥 recent chip'as appear'ina po score bar cascade'o
           kaip „boost reveal" — fade + slight scale-up + slight Y-rise.
           Suporuojam su PopBar fullWidth prop'u, kad chip'as turėtų
           pastovų plotį ir useris negalėtų atspėti recent level'io. */
        @keyframes popChipReveal {
          0%   { opacity: 0; transform: translateY(4px) scale(0.92); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

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
          {/* Naujas meta blokas po title — dviejose eilutėse, kad PopBar
              būtų aiškiai prominent'inis (pagrindinis populiarumo signal'as
              dabar) ir nesimaišytų su šalies/žanro info.
                Row 1: didelis 5-dot PopBar (jei score>0)
                Row 2: 🇺🇸 flag chip + main genre #X + substyles
              Visi chip'ai atidaro TopArtistsModal'ą (ne navigaciją) — užtikriną
              vienos sesijos browsing flow. Mobile: solid bg-[var(--card-bg)],
              desktop lg+: white glass over hero photo. */}
          {/* Meta blokas po title — 3 eilutės:
                1) PopBar'ai (compact, side-by-side viename eilutė): pagrindinis
                   oranžinis + recent mėlynas (jei yra 2y performance). Abu
                   clickable -> TopArtistsModal.
                2) Šalies vėliava + main žanro chip'as su #N (genre rank).
                3) Substyles — atskira eilutė, ant mobile horizontal scroll
                   (kad neuzimtu kelias eilutes), ant sm+ wrap normally.
              Po 2026-05-20 user feedback: bars compact (smaller), substyles
              own row su scroll, rank semantika sutampa su modal'u (genre rank). */}
          <div className="flex flex-col gap-2.5">
            {(popBarLevel > 0 || recentPopBarLevel > 0) && (
              <div className="flex flex-wrap items-center gap-2">
                {popBarLevel > 0 && (
                  <button
                    type="button"
                    onClick={() => onOpenTopArtists?.({ global: true })}
                    title="Bendras populiarumas — pasaulinis top atlikėjų sąrašas"
                    aria-label="Atidaryti pasaulinį top sąrašą"
                    className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] px-2.5 py-1 transition-all hover:scale-[1.03] hover:border-[var(--accent-orange)] lg:border-white/15 lg:bg-white/10 lg:backdrop-blur-md lg:hover:border-white/40 lg:hover:bg-white/20"
                  >
                    {/* ⭐ Trophy/star — all-time signal */}
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="text-[var(--accent-orange)]" aria-hidden>
                      <path d="M12 2l2.39 7.36H22l-6.18 4.48L18.21 22 12 17.27 5.79 22l2.39-8.16L2 9.36h7.61z" />
                    </svg>
                    <PopBar level={popBarLevel} size="md" animate />
                  </button>
                )}
                {recentPopBarLevel > 0 && (
                  <button
                    type="button"
                    onClick={() => onOpenTopArtists?.({ recent: true })}
                    title="Naujausi top atlikėjai — pagal pastarųjų 2 metų dainų, albumų ir apdovanojimų rezultatus"
                    aria-label="Atidaryti naujausių top atlikėjų sąrašą"
                    className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] px-2.5 py-1 transition-all hover:scale-[1.03] hover:border-[var(--accent-orange)] lg:border-white/15 lg:bg-white/10 lg:backdrop-blur-md lg:hover:border-white/40 lg:hover:bg-white/20"
                    /* v6.1: chip-level reveal — visas 🔥 element'as
                       (su ikona + tuščia 5-dot juosta) atsiranda po
                       score bar cascade pabaigos (~1730ms). Fade'inasi
                       per 380ms iš opacity 0 + scale 0.92. Cascade'is
                       viduje paleidžiamas su delayMs={1900} (kai chip
                       jau matomas), kad efektas atrodytų natural'iai —
                       chip pop'inasi, ikona shimering'a, dot'ai pildosi.
                       fullWidth=true užtikrina, kad chip'as turi pilną
                       5-dot plotį, kad recent level'is būtų surprise. */
                    style={{
                      opacity: 0,
                      transform: 'translateY(4px) scale(0.92)',
                      animation: 'popChipReveal 380ms cubic-bezier(0.22, 1, 0.36, 1) 1730ms forwards',
                    }}
                  >
                    {/* 🔥 Flame — recent/trending signal. Po 2026-05-21 v4
                        unifikacijos su score bar'u — orange path (užuot
                        prieš tai buvusio mėlyno). */}
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="text-[var(--accent-orange)]" aria-hidden>
                      <path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z" />
                    </svg>
                    <PopBar level={recentPopBarLevel} size="md" animate delayMs={1900} fullWidth />
                  </button>
                )}
              </div>
            )}
            {/* Flag + main genre + substyles vienoje eilutėje. Po stiliaus
                hierarchijos pasikeitimo (main = orange-tinted bg, substyles =
                outline-only) vizualinis skirtumas pakankamas — viskas telpa
                kartu. Mobile: horizontal scroll (-mx-4 padding bleed,
                flex-nowrap, scrollbar paslėptas); sm+: flex-wrap.
                Žanro elementai shrink-0 — kad neperpjautų teksto, lieka
                pilno pločio (scroll'ina visa eilute). */}
            {(flag && artist.country) || genres[0] || substyles.length > 0 ? (
              <div
                className="-mx-4 flex flex-nowrap items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex-wrap sm:px-0 lg:-mx-10 lg:px-10"
              >
                {flag && artist.country && (
                  <button
                    type="button"
                    onClick={() => onOpenTopArtists?.({ country: artist.country })}
                    title={`${artist.country} top atlikėjai ir grupės`}
                    aria-label={`Šalis: ${artist.country}. Atidaryti top sąrašą.`}
                    // 2026-05-21 v3: pašalinau `hover:scale-110` — parent
                    // container'is su `overflow-x-auto` automatiškai
                    // konvertuoja `overflow-y` į `auto` (CSS spec), todėl
                    // scale'inant chip'ą virš/po juo atsirasdavo nukirpimas.
                    // Dabar hover feedback'as tik per border + bg color
                    // change'ą (kas vis tiek aiškiai matosi).
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border-2 border-[var(--border-default)] bg-[var(--card-bg)] text-[18px] leading-none transition-colors hover:border-[var(--accent-orange)] hover:bg-[rgba(249,115,22,0.12)] lg:border-white/25 lg:bg-white/10 lg:backdrop-blur-md lg:hover:border-[var(--accent-orange)] lg:hover:bg-[rgba(249,115,22,0.18)]"
                  >
                    <span aria-hidden>{flag}</span>
                  </button>
                )}
                {genres[0] && (
                  <button
                    type="button"
                    onClick={() => onOpenTopArtists?.({ genre: genres[0].name })}
                    title={`Top atlikėjai: ${genres[0].name}`}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[rgba(249,115,22,0.35)] bg-[rgba(249,115,22,0.12)] py-1.5 pl-3 pr-3.5 font-['Outfit',sans-serif] text-[13px] font-extrabold tracking-tight text-[var(--accent-orange)] transition-colors hover:border-[var(--accent-orange)] hover:bg-[rgba(249,115,22,0.22)] lg:bg-[rgba(249,115,22,0.18)] lg:backdrop-blur-md lg:hover:bg-[rgba(249,115,22,0.28)]"
                  >
                    {primaryRank && primaryRank.rank > 0 && (
                      <span
                        className="inline-flex items-center rounded-full bg-[var(--accent-orange)] px-1.5 py-0.5 font-['Outfit',sans-serif] text-[10.5px] font-black tabular-nums text-white"
                        title={`#${primaryRank.rank} iš ${primaryRank.total} žanre „${genres[0].name}"`}
                      >
                        #{primaryRank.rank}
                      </span>
                    )}
                    <span>{genres[0].name}</span>
                  </button>
                )}
                {substyles.map(s => (
                  <button
                    type="button"
                    key={s.name}
                    onClick={() => onOpenTopArtists?.({ genre: s.name })}
                    title={`Top atlikėjai: ${s.name}`}
                    className="aphchip inline-flex shrink-0 items-center rounded-full border border-[var(--border-subtle)] bg-transparent px-2.5 py-1 font-['Outfit',sans-serif] text-[11px] font-medium text-[var(--text-muted)] transition-colors hover:border-[var(--text-muted)] hover:text-[var(--text-primary)] lg:border-white/15 lg:text-white/65 lg:backdrop-blur-md lg:hover:border-white/40 lg:hover:bg-white/10 lg:hover:text-white/95"
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            ) : null}
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
            'transition-opacity duration-700 delay-150 ease-out',
            loaded ? 'opacity-100' : 'opacity-0',
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

// ── TopArtistsModal — paspaudus šalies vėliavą / žanro chip'ą Hero zonoje
//
// Modal'as fetchina /api/artists/top?country=X arba ?genre=Y, sort by score
// desc, ir rodo gražų top sąrašą (cover'iai + #N pozicija + score bar).
// Vienos sesijos browsing flow (ne navigacija į /atlikejai), nes useris
// gali norėti tyrinėti kelis filtrus iš to paties atlikėjo puslapio.
type TopArtistItem = {
  id: number; slug: string; name: string
  country: string | null; cover_image_url: string | null
  cover_image_position?: string | null
  score: number; type: string; is_verified: boolean
}
function TopArtistsModal({
  filter, currentArtistId, currentArtistName, onClose,
}: {
  filter: { country?: string; genre?: string; global?: boolean; recent?: boolean; zodiac?: string }
  /** Šio atlikėjo ID — naudojamas highlight'inti jo eilutę ir parodyti
   *  poziciją header'yje („Tavo vieta — #N"). */
  currentArtistId?: number
  currentArtistName?: string
  onClose: () => void
}) {
  const [items, setItems] = useState<TopArtistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [myRank, setMyRank] = useState<{ rank: number; total: number } | null>(null)
  // Zodiako glifa tooltip headeryje — Unicode astrologinis simbolis su
  // U+FE0E text-presentation, kad būtų monochrome (currentColor).
  const ZODIAC_GLYPH: Record<string, string> = {
    'Avinas': '♈', 'Jautis': '♉', 'Dvyniai': '♊', 'Vėžys': '♋',
    'Liūtas': '♌', 'Mergelė': '♍', 'Svarstyklės': '♎', 'Skorpionas': '♏',
    'Šaulys': '♐', 'Ožiaragis': '♑', 'Vandenis': '♒', 'Žuvys': '♓',
  }
  const title = filter.recent
    ? '🔥 Naujausi top atlikėjai ir grupės'
    : filter.zodiac
    ? `${ZODIAC_GLYPH[filter.zodiac] || '✶'} ${filter.zodiac} — top atlikėjai ir grupės`
    : filter.country
    ? `${flagFor(filter.country) || '🌍'} ${filter.country} top atlikėjai ir grupės`
    : filter.genre
    ? `${filter.genre} — top atlikėjai ir grupės`
    : 'Pasaulio top atlikėjai ir grupės'

  useEffect(() => {
    let abort = false
    setLoading(true); setError(null); setMyRank(null)
    const params = new URLSearchParams()
    if (filter.country) params.set('country', filter.country)
    if (filter.genre) params.set('genre', filter.genre)
    if (filter.recent) params.set('sort', 'recent')
    if (filter.zodiac) params.set('zodiac', filter.zodiac)
    params.set('limit', '20')
    if (currentArtistId) params.set('includeRankFor', String(currentArtistId))
    fetch(`/api/artists/top?${params.toString()}`)
      .then(r => r.json())
      .then(d => {
        if (abort) return
        if (!d?.ok) throw new Error(d?.error || 'fail')
        setItems(d.items || [])
        if (d.myRank && d.myRank.rank > 0) setMyRank({ rank: d.myRank.rank, total: d.myRank.total })
        setLoading(false)
      })
      .catch(e => {
        if (abort) return
        setError(e?.message || 'Klaida')
        setLoading(false)
      })
    return () => { abort = true }
  }, [filter.country, filter.genre, filter.global, filter.recent, filter.zodiac, currentArtistId])

  // Esc + outside-click uždaro
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  useBodyScrollLock(true)

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="top-artists-modal-title"
    >
      <div className="flex max-h-[85vh] w-full flex-col rounded-t-3xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-2xl sm:max-w-[520px] sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="top-artists-modal-title" className="truncate font-['Outfit',sans-serif] text-[16px] font-extrabold tracking-tight text-[var(--text-primary)]">
              {title}
            </h2>
            {myRank && currentArtistName && (
              <div className="mt-0.5 font-['Outfit',sans-serif] text-[12px] font-bold text-[var(--accent-orange)]">
                {currentArtistName} — #{myRank.rank}
                <span className="ml-1 font-medium text-[var(--text-muted)]">iš {myRank.total.toLocaleString('lt-LT')}</span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Uždaryti"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading && (
            <div className="flex items-center justify-center py-10 text-[13px] text-[var(--text-muted)]">Kraunama…</div>
          )}
          {error && !loading && (
            <div className="flex items-center justify-center py-10 text-[13px] text-red-500">Klaida: {error}</div>
          )}
          {!loading && !error && items.length === 0 && (
            <div className="flex items-center justify-center py-10 text-[13px] text-[var(--text-muted)]">Nieko nerasta</div>
          )}
          {!loading && !error && items.length > 0 && (
            <ul className="flex flex-col">
              {items.map((a, i) => {
                const pos = parseCoverPos(a.cover_image_position || 'center 30%')
                const isCurrent = currentArtistId === a.id
                return (
                  <li key={a.id}>
                    <Link
                      href={`/atlikejai/${a.slug}`}
                      onClick={onClose}
                      className={[
                        'group flex items-center gap-3 rounded-xl px-3 py-2 no-underline transition-colors',
                        isCurrent
                          ? 'bg-[rgba(249,115,22,0.10)] ring-1 ring-[var(--accent-orange)]'
                          : 'hover:bg-[var(--bg-hover)]',
                      ].join(' ')}
                    >
                      <span className="w-7 shrink-0 text-right font-['Outfit',sans-serif] text-[14px] font-extrabold tabular-nums text-[var(--text-faint)] group-hover:text-[var(--accent-orange)]">
                        {i + 1}
                      </span>
                      <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-[var(--card-bg)]">
                        {a.cover_image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={proxyImgResized(a.cover_image_url, 100)}
                            alt={a.name}
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-cover"
                            style={{ objectPosition: `${pos.x}% ${pos.y}%` }}
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-[12px] font-bold uppercase text-[var(--text-faint)]">
                            {a.name.charAt(0)}
                          </span>
                        )}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="flex items-center gap-1.5 truncate font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--text-primary)]">
                          {a.name}
                          {a.is_verified && (
                            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-[#3b82f6] to-[#1d4ed8]">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="#fff"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
                            </span>
                          )}
                        </span>
                        {a.country && (
                          <span className="font-['Outfit',sans-serif] text-[11.5px] font-medium text-[var(--text-muted)]">
                            {flagFor(a.country) || '🌍'} {a.country}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── ShareButton: dalinimosi mygtukas šalia Sekti ────────────────────
//
// Native Web Share API kai palaiko (mobile), kitur — clipboard copy +
// trumpalaikis „Nukopijuota" feedback. Stilius derintas su FollowPill,
// kad SideInfo „Sekti + Dalintis" row atrodytų kaip vienetinis CTA blokas.
function ShareButton({ url, title, fullWidth = false }: { url: string; title: string; fullWidth?: boolean }) {
  const [copied, setCopied] = useState(false)
  const onShare = async () => {
    if (!url) return
    // Web Share API — mobile naršyklėse atidaro native share sheet
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try {
        await (navigator as any).share({ url, title: `${title} — music.lt` })
        return
      } catch {
        // user cancel — fall through to clipboard
      }
    }
    // Fallback — clipboard copy + 1.5s „Nukopijuota" toast'as
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // nieko nedarom — silent fail
    }
  }
  return (
    <button
      type="button"
      onClick={onShare}
      title="Dalintis atlikėju"
      aria-label="Dalintis"
      className={[
        fullWidth ? 'flex w-full justify-center' : 'inline-flex',
        'items-center gap-1.5 rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] px-3.5 py-2 text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]',
      ].join(' ')}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-[16px] w-[16px] text-[var(--accent-orange)]"
        aria-hidden
      >
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
      </svg>
      <span className="font-['Outfit',sans-serif] text-[13px] font-extrabold tracking-tight">
        {copied ? 'Nukopijuota!' : 'Dalintis'}
      </span>
    </button>
  )
}

// ── FollowPill: „Sekti" mygtukas ────────────────────────────────────
//
// Po 2026-05-20 redesign'o buvęs LikePill (Hero zonoje) perkeltas į
// SideInfo kortelę kaip „Sekti" pill su tikrai aiškiu CTA: ❤ + Sekti +
// count. Naudoja TUOS PAČIUS likes lentelės įrašus (entity_type='artist'),
// nieks DB lygyje nesikeičia — tik UX/UI atskirti istorinį like aktyvumą
// nuo realios populiarumo metrikos (PopBar pagal score).
//
// CSS var-based fone — light + dark mode'ai veikia abu, skirtingai nei
// senas LikePill 'light' variant (white/10 background buvo nematomas
// light theme'ai).
function FollowPill({
  likes, selfLiked, onToggle, onOpenModal, pending, fullWidth = false,
}: {
  likes: number; selfLiked: boolean
  onToggle: () => void; onOpenModal: () => void; pending: boolean
  /** When true, pill rendered as full-width flex (vietoj inline-flex). */
  fullWidth?: boolean
}) {
  const heartFilled = !!selfLiked
  const countClickable = likes > 0

  return (
    <div
      className={[
        fullWidth ? 'flex w-full' : 'inline-flex',
        'overflow-hidden rounded-full transition-colors',
        heartFilled
          ? 'border border-[var(--accent-orange)] bg-[var(--accent-orange)] text-white shadow-[0_6px_18px_rgba(249,115,22,0.35)]'
          : 'border border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-primary)]',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={pending}
        title={heartFilled ? 'Sekti — nustoti' : 'Sekti šį atlikėją'}
        aria-label={heartFilled ? 'Nesekti' : 'Sekti'}
        aria-pressed={heartFilled}
        className={[
          fullWidth ? 'flex-1 justify-center' : '',
          'flex items-center gap-1.5 px-3.5 py-2 transition-colors',
          pending ? 'cursor-wait opacity-70' : 'cursor-pointer',
          !heartFilled ? 'hover:bg-[var(--bg-hover)]' : 'hover:opacity-90',
        ].join(' ')}
      >
        <svg
          viewBox="0 0 24 24"
          fill={heartFilled ? '#fff' : 'currentColor'}
          className={['h-[16px] w-[16px] transition-transform', heartFilled ? 'scale-110 text-white' : 'text-[var(--accent-orange)]'].join(' ')}
          aria-hidden
        >
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
        <span className="font-['Outfit',sans-serif] text-[13px] font-extrabold tracking-tight">
          {heartFilled ? 'Seki' : 'Sekti'}
        </span>
      </button>
      {/* Count zona — clickable kai >0 (atidaro likers modal'ą). */}
      {countClickable ? (
        <button
          type="button"
          onClick={onOpenModal}
          title="Pamatyk kas seka"
          className={[
            'flex items-center border-l px-3.5 py-2 font-["Outfit",sans-serif] text-[13px] font-extrabold tabular-nums tracking-wide transition-colors',
            heartFilled
              ? 'border-white/30 hover:opacity-90'
              : 'border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]',
          ].join(' ')}
        >
          {likes.toLocaleString('lt-LT')}
        </button>
      ) : (
        <span className={[
          'flex items-center border-l px-3.5 py-2 font-["Outfit",sans-serif] text-[13px] font-extrabold tabular-nums tracking-wide',
          heartFilled ? 'border-white/30' : 'border-[var(--border-subtle)] opacity-70',
        ].join(' ')}>
          0
        </span>
      )}
    </div>
  )
}

// ── BioFactsInline — Veikla + Gimimo data + zodiakas main column'e ──
//
// Po 2026-05-20 redesign'o šie info bloki perkelti iš SideInfo dešinio
// sidebar'o į main column (po BioPreview). Logika ta pati kaip SideInfo'je
// (yearsActiveRange + birthLine + zodiac), tik render'as horizontal/inline
// kompaktiškai, kaip metaduomenys, ne kortelės.
function BioFactsInline({
  artist, onOpenTopArtists,
}: {
  artist: any
  /** Optional — paspaudus zodiako simbolį atidaro modal'ą su tos pačios
   *  zodiako atlikėjais (top pagal score). */
  onOpenTopArtists?: (filter: { zodiac?: string }) => void
}) {
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
  const LT_MONTH_GENITIVE = [
    'sausio', 'vasario', 'kovo', 'balandžio', 'gegužės', 'birželio',
    'liepos', 'rugpjūčio', 'rugsėjo', 'spalio', 'lapkričio', 'gruodžio',
  ]
  const fmtLtDate = (iso: string): string => {
    const d = new Date(iso); if (isNaN(d.getTime())) return iso
    return `${d.getFullYear()} m. ${LT_MONTH_GENITIVE[d.getMonth()]} ${d.getDate()} d.`
  }
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

  // 2026-05-21 v3: Gyveno (joint range) išskaidytas į 2 atskiras eilutes
  // — „Gimė" + „Mirė" — kad būtų lengviau skaityti ir verifikuoti datas.
  // Zodiakas LIEKA tik prie „Gimė" (kur jis logiškai priklauso).
  const birthInfo = isSolo && artist.birth_date
    ? {
        date: fmtLtDate(artist.birth_date),
        zodiac: zodiacOf(artist.birth_date),
        // Amžius rodom tik kai gyvas (kitaip „Mirė" eilutėj rodysim gyveno-amžių)
        ageTail: !artist.death_date && ageFromBirth(artist.birth_date) != null
          ? `${ageFromBirth(artist.birth_date)} m.`
          : null,
      }
    : null
  const deathInfo = isSolo && artist.death_date
    ? {
        date: fmtLtDate(artist.death_date),
        // „Mirė ... (45 m.)" — gyveno tiek metų. Tail muted.
        livedTail: artist.birth_date && ageFromBirth(artist.birth_date, artist.death_date) != null
          ? `${ageFromBirth(artist.birth_date, artist.death_date)} m.`
          : null,
      }
    : null

  const showActive = !!yearsActiveRange && !(isSolo && artist.birth_date && artist.active_from === new Date(artist.birth_date).getFullYear())
  if (!birthInfo && !showActive) return null

  return (
    <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-8 sm:gap-y-2">
      {showActive && (
        <div className="flex items-baseline gap-2">
          <span className="font-['Outfit',sans-serif] text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]">Veikla</span>
          <span className="font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--text-primary)]">{yearsActiveRange}</span>
          {yearsActiveTail && (
            <span className="font-medium text-[12.5px] text-[var(--text-muted)]">({yearsActiveTail})</span>
          )}
        </div>
      )}
      {birthInfo && (
        <div className="flex items-baseline gap-2">
          <span className="font-['Outfit',sans-serif] text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]">Gimė</span>
          <span className="font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--text-primary)]">{birthInfo.date}</span>
          {birthInfo.ageTail && (
            <span className="font-medium text-[12.5px] text-[var(--text-muted)]">({birthInfo.ageTail})</span>
          )}
          {birthInfo.zodiac && (
            onOpenTopArtists ? (
              <button
                type="button"
                onClick={() => onOpenTopArtists({ zodiac: birthInfo.zodiac!.name })}
                title={`${birthInfo.zodiac.name} — top atlikėjai`}
                aria-label={`Zodiakas: ${birthInfo.zodiac.name}. Atidaryti top sąrašą.`}
                className="ml-0.5 inline-flex items-center justify-center text-[14px] leading-none text-[var(--accent-orange)] transition-transform hover:scale-125"
              >
                {birthInfo.zodiac.glyph}
              </button>
            ) : (
              <span
                title={birthInfo.zodiac.name}
                aria-label={birthInfo.zodiac.name}
                className="ml-0.5 text-[14px] leading-none text-[var(--accent-orange)]"
              >
                {birthInfo.zodiac.glyph}
              </span>
            )
          )}
        </div>
      )}
      {deathInfo && (
        <div className="flex items-baseline gap-2">
          <span className="font-['Outfit',sans-serif] text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]">Mirė</span>
          <span className="font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--text-primary)]">{deathInfo.date}</span>
          {deathInfo.livedTail && (
            <span className="font-medium text-[12.5px] text-[var(--text-muted)]">({deathInfo.livedTail})</span>
          )}
        </div>
      )}
    </div>
  )
}

// FollowAvatarsRow buvo pridėtas 2026-05-21 (social proof overlap'iniai
// avatarai), bet pašalintas v2 redesign'e — skaičiai nesutapdavo (legacy
// fans vs current likes count), value/space ratio prastas. Ateityje
// galim grąžinti su auth'ed user friends layer'iu.

// ── SideInfo: card beside bio with Kilmė / Stilius / Klausyk ───────

function SideInfo({
  artist, flag: _flag, genres: _genres, substyles: _substyles, ranks: _ranks,
  links, website, horizontal = false, displayRoles: _displayRoles = [],
  followControls, onOpenSocialModal,
}: {
  artist: any; flag: string; genres: Genre[]; substyles: Genre[]
  ranks: Rank[]
  links: { platform: string; url: string }[]; website?: string | null
  /** When true, renders the info card as a horizontal wrap-flow so it can
   *  sit as a full-width strip instead of a tall right sidebar. */
  horizontal?: boolean
  /** Sritys/Genres/Ranks props vis dar accept'inami atgaliniam suderinamumui
   *  (parent dar perduoda), bet SideInfo body jų nebenaudoja — visi šie
   *  duomenys perkelti į Hero zoną arba main column'ą. */
  displayRoles?: string[]
  /** „Sekti" pill controls — likes lentelės įrašai šiuo metu naudojami kaip
   *  follow signal. Buvęs LikePill iš Hero zonos perkeltas čia, su žodžiu
   *  „Sekti" + count, nes nauji atlikėjai negali konkuruoti istorinę like'ų
   *  bazę. Real popularumas dabar — PopBar Hero zonoje. */
  followControls?: {
    likes: number
    selfLiked: boolean
    onToggle: () => void
    onOpenModal: () => void
    pending: boolean
  }
  /** Atidaro SocialLinksModal su pilnu sąrašu — naudojam vertical
   *  variant'e kai socials > 5 (overflow „+N" mygtukas). */
  onOpenSocialModal?: () => void
}) {
  // Visi rank chip'ai (country/genre/global) PAŠALINTI iš SideInfo
  // (2026-05-21 redesign'as). Rank metrika gyvuoja Hero zonoje (PopBar +
  // main genre chip'as su #N). Istorinis aktyvumas darydavo neteisingą
  // poveikį naujiems atlikėjams — PopBar percentile yra tinkamesnis
  // populiarumo signal'as.
  const hasSocials = links.some(l => SOC[l.platform]) || !!website

  // Bio facts (Veikla, Gimimo data, zodiakas) PAŠALINTI iš SideInfo
  // (2026-05-21 redesign'as) — gyvuoja BioFactsInline main column'e, po
  // aprašymu. Pagal istoriją: ankstesnis SideInfo turi dengrandavusią logiką
  // dėl visų laukų, kuri dabar atskirame komponente.
  // RankChip taip pat pašalintas — rank metrika gyvuoja Hero zonoje.

  // ── Horizontal variant — mobile „Sekti" kortelė ─────────────────────
  // Po 2026-05-21 v2 redesign'o:
  //   - Socials + website kompaktiškai viršuje (wrap'inasi jei daug)
  //   - Divider line (jei yra abu)
  //   - FollowPill apačioje, items-start ir w-fit'as → niekada nestrechinasi
  // Atitinka vertical variant'o logiką, tik su mažesniais padding'ais.
  if (horizontal) {
    if (!followControls && !hasSocials) return null
    return (
      <div className="flex flex-col items-start gap-3 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3 sm:px-5">
        {hasSocials && (
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
                  title={`Oficiali svetainė — ${domain}`}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" /></svg>
                </a>
              )
            })()}
          </div>
        )}
        {followControls && (
          <>
            {hasSocials && <div className="w-full border-t border-[var(--border-subtle)]" />}
            <div className="flex flex-wrap items-center gap-2">
              <FollowPill {...followControls} />
              <ShareButton url={typeof window !== 'undefined' ? window.location.href : ''} title={artist.name} />
            </div>
          </>
        )}
      </div>
    )
  }

  // ── Vertical variant — sidebar card ──────────────────────────────
  // h-fit + self-start — kortelė nesistump'ina, kad atitiktų bio aukštį.
  // Anksčiau buvo `h-full min-h-[200px]` ir kortelė tempėsi į grid row'o
  // aukštį, paliekant tarpą jei bio trumpas. Dabar — kompaktiška, content-
  // sized: jei bio ilgas, kortelė lieka apačioj; jei trumpas — abu kartu.
  // 2026-05-21 v2: SideInfo card redesign'as iš esmės.
  //
  // Problemos su v1:
  //   - FollowPill stretch'inosi į full width (parent flex-col su default
  //     items-stretch → inline-flex child'as gauna 100% width)
  //   - Avatarai sekėjų — skaičiai nesutapdavo (legacy fans vs total likes)
  //     ir vizualiai atrodė chaotic
  //   - Ant mobile su 1 social link'u (Muse → tik Spotify) card atrodė
  //     pustuščia, bet vis tiek didelio aukščio
  //
  // v2 sprendimas:
  //   - items-start ant aside → children NIEKADA nesistretch'ina, visi
  //     content-sized
  //   - Socials icons grid'as wrap'inasi natūraliai (gap-1.5), veikia su
  //     0/1/2/many platformų
  //   - Website kaip atskira pill kortelė po socials (jei yra)
  //   - Sekti pill apačioje su divider — vizualiai paryškinta kaip CTA
  //   - Avatarai DROP'inti (skaičiai nesutapdavo, value/space ratio prastas)
  //   - Card padding sumažintas iki p-4 (vietoj p-5) — be avatarų zonos
  //     nereikia tiek tarpo

  if (!followControls && !hasSocials) return null

  // 2026-05-21 v5 redesign: always 2 rows max + adaptive labeled mode.
  //   Row 1: jei ≤2 social items (socials + website) — rodom kaip pill
  //          su logo + label tekstu (Spotify, YouTube). Jei daugiau —
  //          kompakt icons (h-9 w-9) be teksto, su +N modal kai overflow.
  //   Row 2: Sekti + Dalintis side by side (ne stacked).
  // User feedback 2026-05-21: kai mažai social → label'as turi parodyt
  // platformos pavadinimą („tilptu parasyti ir Spotify title").
  const socialList = links.filter(l => SOC[l.platform])
  const hasWebsite = !!website
  const totalSocialItems = socialList.length + (hasWebsite ? 1 : 0)
  const useLabels = totalSocialItems > 0 && totalSocialItems <= 2
  // Kiek ikonų telpa į 320px (desktop sidebar) per row'ą — kiekviena
  // ikona ~36px (h-9 w-9 + gap-1.5). Plotis ~ N*36 + (N-1)*6.
  // 320 - 32 (card padding p-4) - 36 (website globe) ≈ 252. N*36+(N-1)*6 ≤ 252 → N ≤ 6
  const ICON_LIMIT = hasWebsite ? 4 : 5
  const overflowCount = !useLabels && socialList.length > ICON_LIMIT ? socialList.length - ICON_LIMIT : 0
  const visibleIconSocials = !useLabels && overflowCount > 0 ? socialList.slice(0, ICON_LIMIT) : socialList

  return (
    <aside className="flex h-fit flex-col items-stretch gap-3 self-start rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
      {/* Row 1a: labeled mode — kai ≤2 items, rodom pill su logo + tekstu */}
      {hasSocials && useLabels && (
        <div className="flex w-full flex-wrap items-center gap-1.5">
          {socialList.map(l => {
            const p = SOC[l.platform]
            return (
              <a
                key={l.platform}
                href={l.url}
                target="_blank"
                rel="noopener"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] py-1.5 pl-2 pr-3 text-[var(--text-primary)] transition-colors hover:border-[var(--accent-orange)] hover:bg-[var(--bg-hover)]"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                  <svg viewBox="0 0 24 24" fill={p.c || 'currentColor'} width="14" height="14" className={p.c ? '' : 'text-[var(--text-primary)]'}><path d={p.d} /></svg>
                </span>
                <span className="font-['Outfit',sans-serif] text-[12.5px] font-bold tracking-tight">{p.l}</span>
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
                title={domain}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] py-1.5 pl-2 pr-3 text-[var(--text-primary)] transition-colors hover:border-[var(--accent-orange)] hover:bg-[var(--bg-hover)]"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center text-[var(--text-muted)]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" /></svg>
                </span>
                <span className="font-['Outfit',sans-serif] text-[12.5px] font-bold tracking-tight">Svetainė</span>
              </a>
            )
          })()}
        </div>
      )}
      {/* Row 1b: compact icons mode — kai >2 items */}
      {hasSocials && !useLabels && (
        <div className="flex w-full flex-nowrap items-center gap-1.5">
          {visibleIconSocials.map(l => {
            const p = SOC[l.platform]
            return (
              <a
                key={l.platform}
                href={l.url}
                target="_blank"
                rel="noopener"
                title={p.l}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-muted)] transition-colors hover:border-[var(--accent-orange)] hover:bg-[var(--bg-hover)]"
              >
                <svg viewBox="0 0 24 24" fill={p.c || 'currentColor'} width="14" height="14" className={p.c ? '' : 'text-[var(--text-primary)]'}><path d={p.d} /></svg>
              </a>
            )
          })}
          {website && overflowCount === 0 && (() => {
            let domain = ''
            try { domain = new URL(website).host.replace(/^www\./, '') } catch { domain = website }
            return (
              <a
                href={website}
                target="_blank"
                rel="noopener"
                title={`Oficiali svetainė — ${domain}`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-muted)] transition-colors hover:border-[var(--accent-orange)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" /></svg>
              </a>
            )
          })()}
          {overflowCount > 0 && (
            <button
              type="button"
              onClick={onOpenSocialModal}
              title="Visi linkai"
              className="flex h-9 shrink-0 items-center gap-1 rounded-full border border-dashed border-[var(--border-default)] bg-transparent px-2.5 font-['Outfit',sans-serif] text-[11px] font-extrabold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-orange)] hover:bg-[rgba(249,115,22,0.08)] hover:text-[var(--accent-orange)]"
            >
              +{overflowCount + (website ? 1 : 0)}
            </button>
          )}
        </div>
      )}

      {/* Row 2: Sekti + Dalintis side by side (ne stacked).
          User feedback 2026-05-21 v2: nereikia full-width stacking'o,
          tilps į vieną eilutę normaliame width'e. */}
      {followControls && (
        <>
          {hasSocials && <div className="w-full border-t border-[var(--border-subtle)]" />}
          <div className="flex w-full flex-wrap items-center gap-2">
            <FollowPill {...followControls} />
            <ShareButton url={typeof window !== 'undefined' ? window.location.href : ''} title={artist.name} />
          </div>
        </>
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
  // 2026-05-20 redesign v3: vienoje horizontal eilėje rodom ESAMUS pirmus
  // (full size 120px), tada vertical separator + label „Buvę", tada FORMER
  // narius mažesniame stiliuje (96px). Gale — „+N daugiau" trigger'is, kuris
  // atidaro pilnaverčio sąrašo modal'ą (esami + buvę gražiai segmentuoti
  // grid'e). Tas pats tiek desktop, tiek mobile — nereikia separate'ų layout'ų.
  //
  // Anksčiau (v2) buvo dvi sekcijos vertikaliai — buvusiems atiteko per daug
  // dėmesio (visi vienoje eilėje su sava antraite). Dabar buvę „stūmiami" iš
  // viewport'o pasibaigus esamams, plius modal'as visam sąrašui.
  const [modalOpen, setModalOpen] = useState(false)
  if (!members.length) return null

  const current = members.filter(m => m.is_current !== false)
  const former  = members.filter(m => m.is_current === false)
  const hasBoth = current.length > 0 && former.length > 0
  const total = members.length
  // Trigger modal'ą jeigu yra daugiau nei 6 narių (mažuose case'uose
  // viskas tilps ekrane be papildomos navigacijos).
  const showAllTrigger = total > 6

  return (
    <>
      <div className="mt-5">
        <div className="mb-2 flex items-baseline justify-between">
          <div className="font-['Outfit',sans-serif] text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]">
            Nariai
          </div>
          {showAllTrigger && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="font-['Outfit',sans-serif] text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--accent-orange)] transition-colors hover:text-[color-mix(in_srgb,var(--accent-orange)_80%,#fff)]"
            >
              Visi ({total}) →
            </button>
          )}
        </div>
        <div
          className="-mx-4 flex items-stretch gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{
            scrollSnapType: 'x mandatory',
            scrollPaddingLeft: '1rem',
            overscrollBehaviorX: 'contain',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {current.map(m => <MemberCard key={m.id} m={m} variant="prominent" />)}
          {hasBoth && <MemberSeparator />}
          {former.map(m => <MemberCard key={m.id} m={m} variant="compact" />)}
          {showAllTrigger && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              style={{ scrollSnapAlign: 'start' }}
              className="flex shrink-0 items-center gap-2.5 rounded-xl border border-dashed border-[var(--border-default)] bg-transparent p-2.5 text-[var(--text-muted)] transition-all hover:border-[var(--accent-orange)] hover:text-[var(--accent-orange)]"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-current font-['Outfit',sans-serif] text-[13px] font-black">
                {total}
              </span>
              <span className="font-['Outfit',sans-serif] text-[12px] font-bold leading-tight">Visi nariai</span>
            </button>
          )}
        </div>
      </div>
      {modalOpen && (
        <MembersModal
          current={current}
          former={former}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}

function MemberCard({ m, variant }: { m: Member; variant: 'prominent' | 'compact' }) {
  // 2026-05-21 v3: horizontal-compact layout (photo kairėje, vardas+metai
  // dešinėje). Anksciau buvo vertikalus stack su w-[120px] kortele ir
  // dideliais 56px foto — užimdavo per daug aukščio. Dabar `min-w-[170px]`
  // (prominent) / `min-w-[150px]` (compact), aukštis ~60px, į šonus
  // ekstensyvesnis. Tinka horizontal scroll-snap'ui.
  const isProm = variant === 'prominent'
  return (
    <Link
      href={`/atlikejai/${m.slug}`}
      style={{ scrollSnapAlign: 'start' }}
      className={`group flex shrink-0 items-center gap-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] no-underline transition-all hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)] ${
        isProm ? 'min-w-[170px] p-2.5' : 'min-w-[150px] p-2 opacity-90'
      }`}
    >
      {m.cover_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={proxyImg(m.cover_image_url)}
          alt={m.name}
          className={`shrink-0 rounded-full object-cover transition-transform group-hover:scale-105 ${
            isProm ? 'h-11 w-11' : 'h-9 w-9'
          }`}
        />
      ) : (
        <div className={`flex shrink-0 items-center justify-center rounded-full bg-[var(--cover-placeholder)] font-['Outfit',sans-serif] font-black text-[var(--text-faint)] ${
          isProm ? 'h-11 w-11 text-[15px]' : 'h-9 w-9 text-[13px]'
        }`}>
          {m.name[0]}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className={`truncate font-['Outfit',sans-serif] font-bold leading-tight text-[var(--text-primary)] ${
          isProm ? 'text-[13px]' : 'text-[12px]'
        }`}>
          {m.name}
        </div>
        {m.member_from && (
          <div className={`mt-0.5 truncate tabular-nums font-semibold text-[var(--text-muted)] ${
            isProm ? 'text-[10.5px]' : 'text-[10px]'
          }`}>
            {m.member_from}–{m.member_until || 'dabar'}
          </div>
        )}
      </div>
    </Link>
  )
}

/** Separator tarp esamų ir buvusių member card'ų horizontal eilėje.
 *  Horizontal „Buvę" label viršuje + thin connector line žemiau, kad atrodytų
 *  kaip card'o pločio antraštė virš pirmojo former card'o. */
function MemberSeparator() {
  return (
    <div className="flex shrink-0 flex-col items-center justify-center self-stretch px-1" aria-hidden>
      <span className="font-['Outfit',sans-serif] text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-faint)] whitespace-nowrap">
        Buvę
      </span>
      <div className="mt-1 h-px w-8 bg-[var(--border-subtle)]" />
    </div>
  )
}

/** Modal'as su pilnu narių sąrašu. Esami / Buvę aiškiai atskirti, grid layout
 *  desktop'e, viena kolona mobile. Portal'inamas į body, kad route-enter
 *  wrapper'is nelaužytų position:fixed (žr. feedback_route_enter_fixed_trap). */
function MembersModal({ current, former, onClose }: {
  current: Member[]
  former: Member[]
  onClose: () => void
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])
  if (!mounted || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-end justify-center overflow-y-auto bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl rounded-t-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5 shadow-2xl sm:rounded-2xl sm:p-7"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: '85vh', overflowY: 'auto' }}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-['Outfit',sans-serif] text-[20px] font-black text-[var(--text-primary)]">
            Nariai ({current.length + former.length})
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Uždaryti"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 6L18 18M6 18L18 6" />
            </svg>
          </button>
        </div>

        {current.length > 0 && (
          <section>
            <h3 className="mb-3 font-['Outfit',sans-serif] text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]">
              Esami nariai ({current.length})
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {current.map(m => <MemberModalCard key={m.id} m={m} />)}
            </div>
          </section>
        )}

        {former.length > 0 && (
          <section className={current.length > 0 ? 'mt-7' : ''}>
            <h3 className="mb-3 font-['Outfit',sans-serif] text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]">
              Buvę nariai ({former.length})
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {former.map(m => <MemberModalCard key={m.id} m={m} />)}
            </div>
          </section>
        )}
      </div>
    </div>,
    document.body
  )
}

function MemberModalCard({ m }: { m: Member }) {
  return (
    <Link
      href={`/atlikejai/${m.slug}`}
      className="group flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.04)] p-3 no-underline transition-all hover:border-[var(--border-strong)] hover:bg-[rgba(255,255,255,0.08)]"
    >
      {m.cover_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={proxyImg(m.cover_image_url)}
          alt={m.name}
          className="h-12 w-12 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--cover-placeholder)] font-['Outfit',sans-serif] text-[16px] font-black text-[var(--text-faint)]">
          {m.name[0]}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 font-['Outfit',sans-serif] text-[13px] font-bold leading-tight text-[var(--text-primary)]">
          {m.name}
        </div>
        {m.member_from && (
          <div className="mt-0.5 text-[11px] font-semibold tabular-nums text-[var(--text-muted)]">
            {m.member_from}–{m.member_until || 'dabar'}
          </div>
        )}
      </div>
    </Link>
  )
}

// ── SocialLinksModal ────────────────────────────────────────────────
//
// 2026-05-21: Modal'as, kuris rodo pilną sąrašą social platformų + website
// + follow/share control'ius. Naudojam dviem scenarijams:
//   1) Desktop: kai socials per daug — pirmi 5 ikonomis SideInfo card'e,
//      „+N daugiau" mygtukas atidaro šitą modal'ą su pilnu sąrašu.
//   2) Mobile: vietoj SideInfo card'o rodom paprastą „Daugiau" link'ą po
//      Nariais — paspaudus atsidaro šitas modal'as su visu turiniu.
//
// Kiekvienas link'as — full row su ikona + platformos pavadinimu + domain'u.
// Atsidaro naujam tab'e (target="_blank" + rel="noopener").

function SocialLinksModal({
  artistName, artistCountry, artistIsBand, links, website, followControls, onClose,
}: {
  artistName: string
  /** LT atlikėjui country='Lietuva' — title konvertuojamas į galininką
   *  („Daugiau apie Andrių Mamontovą"). */
  artistCountry?: string | null
  /** Grupė/projektas — tada pavadinimas nelinksniuojamas. */
  artistIsBand?: boolean
  links: { platform: string; url: string }[]
  website?: string | null
  followControls?: {
    likes: number
    selfLiked: boolean
    onToggle: () => void
    onOpenModal: () => void
    pending: boolean
  }
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  useBodyScrollLock(true)
  const socialList = links.filter(l => SOC[l.platform])
  let websiteDomain = ''
  if (website) {
    try { websiteDomain = new URL(website).host.replace(/^www\./, '') } catch { websiteDomain = website }
  }
  const shareUrl = typeof window !== 'undefined' ? window.location.href : ''
  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="social-links-modal-title"
    >
      <div className="flex max-h-[85vh] w-full flex-col rounded-t-3xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-2xl sm:max-w-[460px] sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-4">
          <h2 id="social-links-modal-title" className="truncate font-['Outfit',sans-serif] text-[16px] font-extrabold tracking-tight text-[var(--text-primary)]">
            Daugiau apie {accusativeArtistName(artistName, artistCountry, artistIsBand)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Uždaryti"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {/* Follow + Share — full width buttons viršuje */}
          {followControls && (
            <div className="mb-3 flex flex-col gap-2">
              <FollowPill {...followControls} fullWidth />
              <ShareButton url={shareUrl} title={artistName} fullWidth />
            </div>
          )}
          {/* Social links — full rows */}
          {socialList.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {socialList.map(l => {
                const p = SOC[l.platform]
                let domain = ''
                try { domain = new URL(l.url).host.replace(/^www\./, '') } catch { domain = l.url }
                return (
                  <a
                    key={l.platform}
                    href={l.url}
                    target="_blank"
                    rel="noopener"
                    className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-2.5 text-left no-underline transition-colors hover:border-[var(--accent-orange)] hover:bg-[var(--bg-hover)]"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--bg-elevated)]">
                      <svg viewBox="0 0 24 24" fill={p.c || 'currentColor'} width="16" height="16" className={p.c ? '' : 'text-[var(--text-primary)]'}><path d={p.d} /></svg>
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-['Outfit',sans-serif] text-[13.5px] font-bold text-[var(--text-primary)]">{p.l}</div>
                      <div className="truncate font-['DM_Sans',sans-serif] text-[11.5px] text-[var(--text-muted)]">{domain}</div>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-[var(--text-faint)]" aria-hidden>
                      <path d="M7 17L17 7M9 7h8v8" />
                    </svg>
                  </a>
                )
              })}
              {website && (
                <a
                  href={website}
                  target="_blank"
                  rel="noopener"
                  className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-2.5 text-left no-underline transition-colors hover:border-[var(--accent-orange)] hover:bg-[var(--bg-hover)]"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--bg-elevated)]">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" /></svg>
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-['Outfit',sans-serif] text-[13.5px] font-bold text-[var(--text-primary)]">Oficiali svetainė</div>
                    <div className="truncate font-['DM_Sans',sans-serif] text-[11.5px] text-[var(--text-muted)]">{websiteDomain}</div>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-[var(--text-faint)]" aria-hidden>
                    <path d="M7 17L17 7M9 7h8v8" />
                  </svg>
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function MemberOfInline({ groups }: { groups: Member[] }) {
  // 2026-05-20 redesign: ta pati horizontalia scroll struktūra kaip
  // MembersInline (foto card'ai + metai + esami/buvę atskirti). Anksciau
  // buvo paprasti pill'ai („Narys grupėse: Queen") — neatitiko grupių UI
  // simetrijos.
  if (!groups.length) return null
  const current = groups.filter(g => g.is_current !== false)
  const former  = groups.filter(g => g.is_current === false)
  const hasBoth = current.length > 0 && former.length > 0
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="font-['Outfit',sans-serif] text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]">
          Grupės
        </div>
      </div>
      <div
        className="-mx-4 flex items-stretch gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{
          scrollSnapType: 'x mandatory',
          scrollPaddingLeft: '1rem',
          overscrollBehaviorX: 'contain',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {current.map(g => <MemberCard key={g.id} m={g} variant="prominent" />)}
        {hasBoth && <MemberSeparator />}
        {former.map(g => <MemberCard key={g.id} m={g} variant="compact" />)}
      </div>
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
  // 2026-05-21: kai mažai photos (1-3), masonry columns palieka tuščius
  // stulpelius dešinėje ir vizualiai atrodo netvarkingai. Naudojam flex
  // justify-center su max'iniu kortelės pločiu — visi photo centruoti
  // ir vienodai išdėstyti. Kai photos >= 4 — palieka masonry (natūralus
  // flow dideliam sąrašui).
  const isSparse = limited.length <= 3
  const photoCard = (p: Photo, i: number) => {
    const year = photoYear(p.taken_at)
    return (
      <button
        key={i}
        onClick={() => onOpen(i)}
        className={[
          'group relative block overflow-hidden rounded-xl border-0 bg-transparent p-0',
          isSparse
            ? 'w-full max-w-[320px] sm:max-w-[300px]'
            : 'mb-2 w-full md:mb-3',
        ].join(' ')}
        style={isSparse ? undefined : { breakInside: 'avoid' }}
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
  }
  if (isSparse) {
    // 1-3 photos: flex justify-center su gap'u; mobile bumps į 1 col
    // jei tik 1 photo, kitur 2-3 col pagal kiekį.
    return (
      <div className="flex flex-wrap items-start justify-center gap-3 md:gap-4">
        {limited.map(photoCard)}
      </div>
    )
  }
  // 4+ photos: CSS-columns masonry — flows naturally by image aspect ratio
  return (
    <div className="columns-2 gap-2 sm:columns-3 md:gap-3 lg:columns-4">
      {limited.map(photoCard)}
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

// ── YTFacade ───────────────────────────────────────────────────────
// Performant YouTube embed: rodom TIK thumbnail + play button. iframe
// (sunkus YT player) kraunamas TIK paspaudus → jokio load-time perf hit
// nors ir 3 embed'ai puslapyje. Native YT player atsidaro po click'o.
function YTFacade({ track }: { track: Track }) {
  const vid = yt(track.video_url)
  const [playing, setPlaying] = useState(false)
  if (!vid) return null
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-black">
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&rel=0&modestbranding=1`}
          title={track.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="group absolute inset-0 h-full w-full"
          aria-label={`Groti „${track.title}" YouTube"`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://img.youtube.com/vi/${vid}/mqdefault.jpg`}
            alt={track.title}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-black/25 transition-colors group-hover:bg-black/10">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-orange)] shadow-lg transition-transform group-hover:scale-110">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff" aria-hidden><path d="M8 5v14l11-7z" /></svg>
            </span>
          </span>
          <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/85 to-transparent px-2 pb-1.5 pt-3 text-left font-['Outfit',sans-serif] text-[11px] font-semibold text-white">
            {track.title}
          </span>
        </button>
      )}
    </div>
  )
}

function SpotlightAlbumRow({ album, artistSlug, topTracks, topVideoTracks = [], onOpen, onPlayTrack, onTrackClick }: {
  album: Album
  artistSlug?: string
  topTracks: Track[]
  /** Artist'o top dainos su YT video — embed'ams dešinėje (desktop). */
  topVideoTracks?: Track[]
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
        <span className="inline-flex h-5 items-center rounded-full bg-[var(--accent-green)] px-2 font-['Outfit',sans-serif] text-[9.5px] font-extrabold uppercase tracking-[0.15em] text-white">
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
        {/* Top singlų YT embed'ai — užpildo tuščią dešinę pusę desktop'e.
            Facade pattern: tik thumbnail + play; iframe TIK po click'o (perf).
            lg: 2 dainos, xl: 3. Mobile/tablet — paslėpta (stack'as per ankštas). */}
        {topVideoTracks.length > 0 && (
          <div className="hidden shrink-0 self-stretch lg:grid lg:max-w-[340px] lg:grid-cols-2 lg:content-center lg:gap-2 xl:max-w-[470px] xl:grid-cols-3">
            {topVideoTracks.slice(0, 3).map((t, i) => (
              <div key={t.id} className={i === 2 ? 'hidden xl:block' : ''}>
                <YTFacade track={t} />
              </div>
            ))}
          </div>
        )}
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

// ── Muzikos atradimai — speciali kortelė Diskusijų grid'e + modalas ──
//
// ATRADIMAS = bendruomenės komentaras iš /muzikos-atradimai, susietas su
// šiuo atlikėju (discoveries.artist_id). Kortelė atrodo kaip DiscussionRow
// (kad grid'as liktų vientisas), tik su oranžiniu akcentu; modalas rodo
// pilnus komentarus su veikiančiais YT/Spotify embed'ais ir like'ais.

/** YT click-to-play / Spotify iframe — kompaktiškas embed modalo kortelei. */
function DiscoveryEmbed({ d }: { d: DiscoveryItem }) {
  const [play, setPlay] = useState(false)
  if (!d.embed_id) return null
  if (d.embed_type === 'youtube') {
    if (play) {
      return (
        <iframe
          className="aspect-video w-full rounded-[10px] border-0"
          src={`https://www.youtube.com/embed/${d.embed_id}?autoplay=1`}
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      )
    }
    return (
      <button
        type="button"
        onClick={() => setPlay(true)}
        aria-label="Paleisti"
        className="relative block aspect-video w-full cursor-pointer overflow-hidden rounded-[10px] border-0 bg-black p-0"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`https://i.ytimg.com/vi/${d.embed_id}/hqdefault.jpg`} loading="lazy" alt="" className="block h-full w-full object-cover opacity-90 transition-opacity hover:opacity-100" />
        <span className="absolute inset-0 flex items-center justify-center" style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,.6))' }}>
          <svg viewBox="0 0 68 48" width="46" height="33" aria-hidden><path fill="#f00" d="M66.5 7.7a8.6 8.6 0 0 0-6-6C55.2 0 34 0 34 0S12.8 0 7.5 1.7a8.6 8.6 0 0 0-6 6A90 90 0 0 0 0 24a90 90 0 0 0 1.5 16.3 8.6 8.6 0 0 0 6 6C12.8 48 34 48 34 48s21.2 0 26.5-1.7a8.6 8.6 0 0 0 6-6A90 90 0 0 0 68 24a90 90 0 0 0-1.5-16.3z"/><path fill="#fff" d="M27 34l18-10-18-10z"/></svg>
        </span>
      </button>
    )
  }
  const kind = d.embed_type?.replace('spotify_', '') || 'track'
  return (
    <iframe
      className="w-full rounded-xl border-0"
      style={{ height: kind === 'track' ? 152 : 232 }}
      src={`https://open.spotify.com/embed/${kind}/${d.embed_id}`}
      loading="lazy"
      allow="autoplay; encrypted-media"
    />
  )
}

/** Širdutė + count — like'ina atradimo komentarą per /api/comments/likes
 *  (atradimas = comments eilutė, tas pats endpoint'as kaip /muzikos-atradimai). */
function DiscoveryLike({ commentId, count, liked }: { commentId: number | null; count: number | null; liked: boolean }) {
  const [n, setN] = useState(count || 0)
  const [self, setSelf] = useState(liked)
  const [pending, setPending] = useState(false)
  useEffect(() => { setSelf(liked) }, [liked])
  async function toggle() {
    if (pending || !commentId) return
    setPending(true)
    try {
      const res = await fetch('/api/comments/likes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment_id: commentId }) })
      if (res.status === 401) return
      const d = await res.json()
      if (res.ok) { setSelf(!!d.liked); setN(x => x + (d.liked ? 1 : -1)) }
    } catch {} finally { setPending(false) }
  }
  if (!commentId && !n) return null
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending || !commentId}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-hover)] px-2.5 py-1 font-['Outfit',sans-serif] text-[11.5px] font-bold transition-colors"
      style={{ color: self ? 'var(--accent-orange)' : 'var(--text-muted)', cursor: commentId ? 'pointer' : 'default' }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill={self ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>
      {n}
    </button>
  )
}

/** Pilna atradimo kortelė Diskusijų sekcijoje — visas turinys iškart matomas
 *  (be modalo): label + autorius + embed + pilnas komentaras + like. */
function DiscoveryFullCard({ d, liked }: { d: DiscoveryItem; liked: boolean }) {
  const uname = d.author?.username
  const when = relativeLt(d.created_at)
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border bg-[var(--bg-surface)]" style={{ borderColor: 'rgba(249,115,22,0.35)' }}>
      <div className="flex items-center gap-2 px-3.5 pb-1.5 pt-3">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ background: 'rgba(249,115,22,0.14)', color: 'var(--accent-orange)' }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="m16.2 7.8-2 6.3-6.3 2 2-6.3z"/></svg>
        </span>
        <span className="font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--accent-orange)]">
          Muzikos atradimas
        </span>
        <span className="ml-auto"><DiscoveryLike commentId={d.comment_id} count={d.like_count} liked={liked} /></span>
      </div>
      <div className="flex items-center gap-2.5 px-3.5 pb-2.5">
        <UserAvatar name={uname || 'Narys'} avatarUrl={d.author?.avatar_url} size={26} />
        <div className="flex min-w-0 flex-1 items-baseline gap-2 leading-tight">
          {uname
            ? <Link href={`/@${uname}`} className="truncate text-[12.5px] font-bold text-[var(--text-primary)] no-underline hover:text-[var(--accent-orange)]">{uname}</Link>
            : <span className="text-[12.5px] font-bold text-[var(--text-primary)]">Narys</span>}
          {when && <span className="shrink-0 text-[10.5px] text-[var(--text-muted)]">{when}</span>}
        </div>
      </div>
      {d.embed_id && <div className="px-3.5"><DiscoveryEmbed d={d} /></div>}
      <div className="flex-1 px-3.5 pb-3.5 pt-2.5">
        {d.track_name && (
          <div className="mb-1 font-['Outfit',sans-serif] text-[13.5px] font-extrabold text-[var(--text-primary)]">
            {d.track_slug
              ? <Link href={`/dainos/${d.track_slug}`} className="no-underline hover:text-[var(--accent-orange)]" style={{ color: 'inherit' }}>{d.track_name} ♪</Link>
              : <>{d.track_name}</>}
          </div>
        )}
        {d.body && <p className="m-0 whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-[var(--text-secondary)]">{d.body}</p>}
      </div>
    </article>
  )
}

/** Atradimų blokas Diskusijų sekcijoje — kiekvienas atradimas atskira pilna
 *  kortelė (be modalo). >6 — „Rodyti visus" toggle. Batch'u pasiimam, kuriuos
 *  komentarus žiūrintysis jau pamėgo. */
function ArtistDiscoveries({ discoveries }: { discoveries: DiscoveryItem[] }) {
  const [likedSet, setLikedSet] = useState<Set<number>>(new Set())
  const [showAll, setShowAll] = useState(false)
  useEffect(() => {
    const ids = discoveries.map(d => d.comment_id).filter(Boolean) as number[]
    if (!ids.length) return
    fetch(`/api/comments/likes?ids=${ids.join(',')}`).then(r => r.json())
      .then(d => setLikedSet(new Set<number>(d.liked_ids || []))).catch(() => {})
  }, [discoveries])
  const shown = showAll ? discoveries : discoveries.slice(0, 6)
  return (
    <div className="mb-3">
      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map(d => (
          <DiscoveryFullCard key={d.id} d={d} liked={d.comment_id ? likedSet.has(d.comment_id) : false} />
        ))}
      </div>
      {discoveries.length > 6 && !showAll && (
        <div className="mt-3 flex justify-center">
          <button
            onClick={() => setShowAll(true)}
            className="rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 font-['Outfit',sans-serif] text-[12px] font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-orange)] hover:text-[var(--text-primary)]"
          >
            Rodyti visus atradimus ({discoveries.length})
          </button>
        </div>
      )}
    </div>
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

// ── useBodyScrollLock ───────────────────────────────────────────────
//
// iOS Safari'jus IGNORUOJA `body { overflow: hidden }` — touch scroll
// vis tiek veikia ant background'o, kai modal'as atidarytas. Vienintelis
// patikimas cross-browser fix'as: `body { position: fixed; top: -scrollY }`,
// kuris „freezina" scroll poziciją. Po close'o atstatom scroll'ą per
// window.scrollTo(0, savedY).
//
// Naudojam visiems modal'iams (TopArtists, Orphan, Social, Lightbox).

function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    if (typeof document === 'undefined') return
    const scrollY = window.scrollY
    const prevPos = document.body.style.position
    const prevTop = document.body.style.top
    const prevWidth = document.body.style.width
    const prevOverflow = document.body.style.overflow
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.position = prevPos
      document.body.style.top = prevTop
      document.body.style.width = prevWidth
      document.body.style.overflow = prevOverflow
      window.scrollTo(0, scrollY)
    }
  }, [active])
}

// ── OrphanTracksModal ───────────────────────────────────────────────
//
// 2026-05-21: Modalas, kuris rodo „Kitos dainos" pilną sąrašą. Pradžioje
// artist puslapyje rodom tik first 4, su „+N daugiau" mygtuku, kuris šitą
// modal'ą atidaro. Reikalingas, kad ilgi orphan track sąrašai (kartais
// kelios dešimtys) nesudarytų ilgo scroll'o profile page'e.

function OrphanTracksModal({
  tracks, artistName, artistSlug, artistCountry, artistIsBand, onClose, onSelectTrack,
}: {
  tracks: Track[]
  artistName: string
  /** LT atlikėjui country='Lietuva' → vardas konvertuojamas į kilmininką
   *  („Andriaus Mamontovo dainos"). Foreign country → vardas as-is. */
  artistCountry?: string | null
  /** Grupė/projektas — tada pavadinimas nelinksniuojamas. */
  artistIsBand?: boolean
  artistSlug: string
  onClose: () => void
  onSelectTrack: (t: Track) => void
}) {
  // Esc handler — body scroll lock per useBodyScrollLock (iOS-safe
  // position:fixed approach; overflow:hidden mobile Safari'jui nepakanka).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  useBodyScrollLock(true)
  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="orphan-tracks-modal-title"
    >
      <div className="flex max-h-[85vh] w-full flex-col rounded-t-3xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-2xl sm:max-w-[560px] sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-4">
          <h2 id="orphan-tracks-modal-title" className="truncate font-['Outfit',sans-serif] text-[16px] font-extrabold tracking-tight text-[var(--text-primary)]">
            Kitos {genitiveArtistName(artistName, artistCountry, artistIsBand)} dainos · {tracks.length}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Uždaryti"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {tracks.map((t) => (
              <TrackRow
                key={t.id}
                t={t}
                artistSlug={artistSlug}
                onOpen={(track) => { onClose(); onSelectTrack(track) }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── Main ────────────────────────────────────────────────────────────

export default function ArtistProfileClient({
  artist, heroImage, genres, substyles = [], links, photos, albums, tracks, members, memberOf = [], followers, likeCount,
  events, similar, newTracks,
  legacyCommunity, legacyThreads = [], legacyNews = [], discoveries = [], ranks = [],
  linkedTrackIds = [], awards = [], eras = [], displayRoles = [], popBarLevel = 0, recentPopBarLevel = 0,
  concertRecordings = [], mainDiscussionId = null,
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
  // TopArtistsModal — atidaromas paspaudus šalies vėliavą/žanro chip'ą Hero
  // zonoje. Modal'as rodo top N atlikėjų pagal score filter'iui (country
  // arba genre). null reiškia closed.
  const [topArtistsFilter, setTopArtistsFilter] = useState<{ country?: string; genre?: string; global?: boolean; recent?: boolean; zodiac?: string } | null>(null)
  const [bioModalOpen, setBioModalOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  // Mobile'e modal'as turi savo inline iframe'ą — kai jis aktyvus, hero
  // player'is turi būti suppress'intas (audio dvigubėjimas).
  const [modalUsesInline, setModalUsesInline] = useState(false)
  // Desktop'e modal'as gali turėti dock'uotą player'į (≥1280px viewport) —
  // tuomet hero player'is taip pat suppress'inamas.
  const [modalUsesDocked, setModalUsesDocked] = useState(false)
  // „Kitos dainos" modal'as — atidaromas su „+N daugiau" mygtuku, kai orphan
  // tracks > 4. Profile page'e rodom tik first 4, modal'e visus.
  const [orphanModalOpen, setOrphanModalOpen] = useState(false)
  // Socials + follow + share modal'as. Naudojam dviems scenarijams:
  //   • Desktop: kai socials > 5 → „+N" overflow mygtukas SideInfo card'e
  //   • Mobile: vietoj horizontal SideInfo strip rodom „Daugiau" punktą
  //     po Nariais — atsiveria visas turinys čia.
  const [socialModalOpen, setSocialModalOpen] = useState(false)

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

  const flag = flagFor(artist.country) || (artist.country ? '🌍' : '')
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
  // 2026-05-19: use aTypes() (multi) so dual-type albums (Flash Gordon)
  // surface ALL their types in tabs list, ne tik primary.
  const atypes = [...new Set(albums.flatMap(aTypes))]
  const hasStudio = atypes.includes('Studijinis')
  const linkedSet = useMemo(() => new Set(linkedTrackIds), [linkedTrackIds])
  const orphanTracks = useMemo(
    () => tracks.filter(t => !linkedSet.has(t.id)),
    [tracks, linkedSet],
  )
  // Per-orphan-list leveler 2026-05-25 v6: orphan tracks turi savo
  // percentile context'ą (atskirai nuo tracksAllTime), kad „Kitos dainos"
  // grid'as turėtų savo top hit'ą su 5/5 ir žemiausias su 1/5.
  const orphanPopLeveler = useMemo(
    () => makeArtistTrackLeveler(orphanTracks),
    [orphanTracks],
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
    // 2026-05-19: filter per aTypes() (multi) — dual-type albums (Flash Gordon
    // studio + soundtrack) rodomi BOTH tab'uose pagal koks aktyvus.
    : albums.filter(a => aTypes(a).some(t => activeFilters.has(t)))
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
        popBarLevel={popBarLevel}
        recentPopBarLevel={recentPopBarLevel}
        genres={genres}
        substyles={substyles}
        ranks={ranks}
        onOpenTopArtists={(filter) => setTopArtistsFilter(filter)}
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

      {topArtistsFilter && (
        <TopArtistsModal
          filter={topArtistsFilter}
          currentArtistId={artist.id}
          currentArtistName={artist.name}
          onClose={() => setTopArtistsFilter(null)}
        />
      )}

      <BioModal
        open={bioModalOpen}
        onClose={() => setBioModalOpen(false)}
        title={`Apie ${accusativeArtistName(artist.name, artist.country, artist.type === 'group')}`}
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

      {orphanModalOpen && (
        <OrphanTracksModal
          tracks={orphanTracks}
          artistName={artist.name}
          artistCountry={artist.country}
          artistIsBand={artist.type === 'group'}
          artistSlug={artist.slug}
          onClose={() => setOrphanModalOpen(false)}
          onSelectTrack={(t) => setTrackInfoOpen(t)}
        />
      )}

      {socialModalOpen && (
        <SocialLinksModal
          artistName={artist.name}
          artistCountry={artist.country}
          artistIsBand={artist.type === 'group'}
          links={links}
          website={artist.website}
          followControls={{
            likes,
            selfLiked: !!selfLiked,
            onToggle: toggleSelfLike,
            onOpenModal: () => setLikesModalOpen(true),
            pending: selfLikePending,
          }}
          onClose={() => setSocialModalOpen(false)}
        />
      )}

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
          // SideInfo card visada renderinamas, nes po 2026-05-20 redesign'o
          // jis turi „Sekti" pill perkeltą iš Hero zonos — vartotojas turi
          // follow'inti net naują/tuščią atlikėją.
          const sideInfoAvailable = true
          const bioHeader = `Apie ${accusativeArtistName(artist.name, artist.country, artist.type === 'group')}`

          if (!hasBio && members.length === 0 && !sideInfoAvailable) return null

          return (
            <section>
              {/* Mobile sidebar strip — PO 2026-05-21 redesign'o perkeltas ant
                  pačio apačios (po nariais/grupėmis), o ne ant viršaus. Tegu
                  vartotojas pirma matys bio + sritys + grupes, ir tik tada
                  socialinę „Sekti" kortelę. Žr. render'inima žemiau, po
                  members/groups. */}
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
                        displayRoles={displayRoles}
                        onOpenSocialModal={() => setSocialModalOpen(true)}
                        followControls={{
                          likes,
                          selfLiked: !!selfLiked,
                          onToggle: toggleSelfLike,
                          onOpenModal: () => setLikesModalOpen(true),
                          pending: selfLikePending,
                        }}
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
                  {/* Bio facts (Veikla, Gimė, Mirė, zodiakas) — perkelta čia
                      iš SideInfo (2026-05-21). Inline-compact stilius, gyvuoja
                      tarp aprašymo ir Sričių. Zodiakas clickable atidaro modal'ą
                      su to paties zodiako top atlikėjais. */}
                  <BioFactsInline
                    artist={artist}
                    onOpenTopArtists={(filter) => setTopArtistsFilter(filter)}
                  />
                  {/* Sritys (solo atlikėjo occupation+instrument) — perkelta čia
                      iš SideInfo kortelės (2026-05-20). Logiškai groups'iuosi
                      su bio: tai apie atlikėją kaip žmogų. Rodoma virš grupių
                      sąrašo. */}
                  {solo && displayRoles.length > 0 && (
                    <div className="mt-5">
                      <div className="mb-2 font-['Outfit',sans-serif] text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]">
                        Veiklos sritys
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {displayRoles.map(r => (
                          <span
                            key={r}
                            className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] px-2.5 py-1 font-['Outfit',sans-serif] text-[11.5px] font-bold text-[var(--text-secondary)]"
                          >{r}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {!solo && members.length > 0 && <MembersInline members={members} />}
                  {/* MemberOfInline rodom TIK solo atlikėjams. Grupė negali būti
                      narys kitos grupės — RHCP DB turėjo broken record
                      (group_id=Jack_Irons, member_id=RHCP) kuris rodė
                      „Narys grupėse: Jack Irons" prie RHCP profilio. Po DB
                      fix'o defensive guard'as gardiečia ateityje. */}
                  {solo && memberOf && memberOf.length > 0 && <MemberOfInline groups={memberOf} />}
                  {/* Mobile-only: flat layout — „DAUGIAU" headeris kaip
                      „Veikla"/„Gimė" style, tada social ikonos + Sekti/
                      Dalintis tiesiogiai apačioje. Be box border'io ar
                      modal pattern'o — vizualiai integralu su likusiu bio
                      content'u. lg+ versija lieka float-right card'as. */}
                  {sideInfoAvailable && (() => {
                    const mobileSocialList = links.filter(l => SOC[l.platform])
                    const mobileWebsite = artist.website
                    const hasMobileSocials = mobileSocialList.length > 0 || !!mobileWebsite
                    if (!hasMobileSocials) return null
                    return (
                      <div className="mt-5 lg:hidden">
                        <div className="mb-2 font-['Outfit',sans-serif] text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]">
                          Daugiau
                        </div>
                        <div className="flex flex-col gap-2.5">
                          {/* Social icons + globe */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            {mobileSocialList.map(l => {
                              const p = SOC[l.platform]
                              return (
                                <a
                                  key={l.platform}
                                  href={l.url}
                                  target="_blank"
                                  rel="noopener"
                                  title={p.l}
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-muted)] transition-colors hover:border-[var(--accent-orange)] hover:bg-[var(--bg-hover)]"
                                >
                                  <svg viewBox="0 0 24 24" fill={p.c || 'currentColor'} width="14" height="14" className={p.c ? '' : 'text-[var(--text-primary)]'}><path d={p.d} /></svg>
                                </a>
                              )
                            })}
                            {mobileWebsite && (() => {
                              let domain = ''
                              try { domain = new URL(mobileWebsite).host.replace(/^www\./, '') } catch { domain = mobileWebsite }
                              return (
                                <a
                                  href={mobileWebsite}
                                  target="_blank"
                                  rel="noopener"
                                  title={`Oficiali svetainė — ${domain}`}
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-muted)] transition-colors hover:border-[var(--accent-orange)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" /></svg>
                                </a>
                              )
                            })()}
                          </div>
                          {/* Sekti + Dalintis side by side */}
                          <div className="flex flex-wrap items-center gap-2">
                            <FollowPill
                              likes={likes}
                              selfLiked={!!selfLiked}
                              onToggle={toggleSelfLike}
                              onOpenModal={() => setLikesModalOpen(true)}
                              pending={selfLikePending}
                            />
                            <ShareButton url={typeof window !== 'undefined' ? window.location.href : ''} title={artist.name} />
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                  {/* Mobile: score card po SideInfo strip. */}
                  {artist.score !== null && artist.score !== undefined && (
                    <div className="mt-4 lg:hidden">
                      <ScoreCard
                        entityType="artist"
                        score={artist.score}
                        breakdown={artist.score_breakdown}
                      />
                    </div>
                  )}
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
              <SectionTitle label={`${genitiveArtistName(artist.name, artist.country, artist.type === 'group')} albumai`} />

              {/* Desktop: all filter chips wrap on one row */}
              <div className="mb-5 hidden flex-wrap gap-1.5 sm:flex sm:gap-2">
                <FilterChip k="all" label={FILTER_LABEL.all} count={allCount} />
                {atypes.map(t => (
                  <FilterChip
                    key={t}
                    k={t}
                    label={FILTER_LABEL[t] || t}
                    count={albums.filter(a => aTypes(a).includes(t)).length}
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
                  ...atypes.map(t => ({ key: t, label: FILTER_LABEL[t] || t, count: albums.filter(a => aTypes(a).includes(t)).length })),
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
                  topVideoTracks={tracks.filter(t => yt(t.video_url)).slice(0, 3)}
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

              {/* Orphan tracks — compact list below albums when included.
                  2026-05-21 v2: jei daugiau nei tilpsta į grid'ą, paskutinis
                  slot'as virsta „+N daugiau" kortele (ne nauja eilutė
                  apačioj). Mobile: 1 col → max 4 items (3 track + 1 +N);
                  tablet 2 col → max 4 items; desktop 4 col → max 4 items.
                  Visada full 4-slot grid'as, nesilauzo į kelias eilutes. */}
              {showOrphans && orphanTracks.length > 0 && (() => {
                const GRID_SLOTS = 4
                const hasOverflow = orphanTracks.length > GRID_SLOTS
                // Jei yra overflow — rodom 3 + +N kortelę kaip 4-ą slot'ą.
                // Jei lygiai 4 ar mažiau — visus tracks be +N.
                const trackSlots = hasOverflow ? GRID_SLOTS - 1 : orphanTracks.length
                const extraOrphans = orphanTracks.length - trackSlots
                const visibleOrphans = orphanTracks.slice(0, trackSlots)
                return (
                  <div className={visibleAlbums.length > 0 ? 'mt-6' : ''}>
                    {visibleAlbums.length > 0 && (
                      <div className="mb-2.5 font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.15em] text-[var(--text-muted)]">
                        Kitos dainos
                      </div>
                    )}
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
                      {visibleOrphans.map((t, i) => (
                        <TrackRow
                          key={t.id}
                          t={t}
                          artistSlug={artist.slug}
                          popularity={popLevelWithFallback(t, i, orphanTracks.length, popInfoTracks, orphanPopLeveler)}
                          onOpen={setTrackInfoOpen}
                        />
                      ))}
                      {hasOverflow && (
                        <button
                          type="button"
                          onClick={() => setOrphanModalOpen(true)}
                          className="flex items-center justify-center rounded-xl border border-[rgba(249,115,22,0.35)] bg-[rgba(249,115,22,0.12)] p-2 font-['Outfit',sans-serif] text-[12.5px] font-extrabold tracking-tight text-[var(--accent-orange)] transition-colors hover:border-[var(--accent-orange)] hover:bg-[rgba(249,115,22,0.22)]"
                          aria-label={`Atidaryti visas dainas (${orphanTracks.length})`}
                        >
                          +{extraOrphans} daugiau
                        </button>
                      )}
                    </div>
                  </div>
                )
              })()}
            </section>
          )
        })()}

        {/* Apdovanojimai — Wikipedia awards article duomenys */}
        {awards.length > 0 && <ArtistAwards awards={awards} />}

        {/* Galerija (masonry) */}
        {galleryPhotos.length > 0 && (
          <section ref={galerijaRef} id="galerija">
            <SectionTitle label={`${genitiveArtistName(artist.name, artist.country, artist.type === 'group')} nuotraukos`} count={galleryPhotos.length} />
            <MasonryGallery
              photos={galleryPhotos}
              onOpen={(i) => setLightboxIndex(i)}
            />
          </section>
        )}

        {/* Koncertų įrašai — live pasirodymų vaizdo įrašai (po galerija) */}
        {concertRecordings.length > 0 && (
          <ArtistConcertRow recordings={concertRecordings} artistName={artist.name} />
        )}

        {/* Diskusijos — preview grid'as (3-col desktop, 2-col tablet, 1-col
            mobile) kortelių su iki 2 paskutinių komentarų. Ribojam 6 kortelėm,
            likusios — modal'e (panašu kaip events archyvas). auto-rows-fr —
            kad visos eilutės kortelėse būtų vienodo aukščio, neprikl. nuo
            komentarų skaičiaus. */}
        {(() => {
          const hasDiscoveries = discoveries.length > 0
          const PREVIEW_LIMIT = 6
          // Pagrindinė atlikėjo/grupės tema (mainDiscussionId) nustatoma serveryje
          // (page.tsx): senoji tema, kurios title == atlikėjo vardas, arba
          // daugiausiai komentarų turinti; jei nė vienos — sukuriama nauja
          // pagrindinė tema. Inline komentaras eina TIESIAI į ją.
          // „Kitos temos" kortelėse — be pagrindinės.
          const otherThreads = mainDiscussionId
            ? legacyThreads.filter(t => t.id !== mainDiscussionId)
            : legacyThreads
          const previewThreads = otherThreads.slice(0, PREVIEW_LIMIT)
          const overflow = Math.max(0, otherThreads.length - PREVIEW_LIMIT)
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

              {/* Inline komentaras — galima rašyti iškart, be navigacijos.
                  Komentaras keliauja į pagrindinę temą (mainDiscussionId). Tas
                  pats EntityCommentsBlock kaip kanoninėje /diskusijos page'ėje. */}
              {mainDiscussionId ? (
                <div className="mb-4 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 sm:p-5">
                  <EntityCommentsBlock
                    entityType="discussion"
                    entityId={mainDiscussionId}
                    title="Komentarai"
                    compact
                  />
                </div>
              ) : null}

              {/* „Muzikos atradimai" — bendruomenės komentarai apie šį atlikėją
                  iš /muzikos-atradimai. Kiekvienas atradimas — atskira pilna
                  kortelė (embed + visas tekstas), be modalo. */}
              {hasDiscoveries && <ArtistDiscoveries discoveries={discoveries} />}
              {previewThreads.length > 0 && (
                <>
                  {/* Antraštė kitoms temoms — kad atskirtų nuo viršuje esančio
                      inline komentaro bloko. */}
                  <div className="mb-3 mt-2 font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.15em] text-[var(--text-muted)]">
                    Kitos temos
                  </div>
                  <div className="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {/* Cards link directly to canonical /diskusijos/tema/{legacy_id}
                        page (kuris renderuoja pilną thread-page-client su likes,
                        replies, composer, sort). */}
                    {previewThreads.map((t) => (
                      <DiscussionRow key={t.legacy_id} t={t} onOpen={setActiveThread} />
                    ))}
                  </div>
                </>
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
