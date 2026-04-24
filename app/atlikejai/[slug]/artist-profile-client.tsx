'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import LikesModal from '@/components/LikesModal'
import { LikePill } from '@/components/LikePill'
import BioModal from '@/components/BioModal'
import type { LegacyLikeUser } from '@/components/LegacyLikesPanel'

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
  video_url?: string; cover_url?: string
  album_id?: number | null; release_year?: number; release_month?: number
  release_date?: string | null
  /** Duration in seconds (integer) or "mm:ss" string — we handle both at render time. */
  duration?: number | string | null
  lyrics?: string | null
  /** Aggregated like count — modern track_likes + legacy_likes combined.
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
type LegacyThread = {
  legacy_id: number; slug: string; source_url: string
  title?: string | null; post_count?: number | null
  first_post_at?: string | null; last_post_at?: string | null
  last_post?: { body: string; author_username: string | null; created_at: string | null } | null
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
  const activeTrack = [...tracksAllTime, ...tracksTrending].find(t => t.id === activeTrackId)
  const activeVid = yt(activeTrack?.video_url)
  const firstWithVideo = list.find(t => yt(t.video_url)) || tracksAllTime.find(t => yt(t.video_url))
  const displayVid = activeVid || yt(firstWithVideo?.video_url)
  const displayTrack = activeTrack || firstWithVideo

  // YouTube player plumbing: we use native YT controls (autoplay blockers
  // make hiding them fragile) but keep `enablejsapi=1` so our per-track
  // play button can still play/pause the active track. A message listener
  // keeps local `isPaused` in sync with YT state so the equalizer only
  // animates while the video is actually playing.
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [isPaused, setIsPaused] = useState(false)

  // Re-arm "not paused" whenever the active video changes (user picked a
  // new track). YT will then post state updates that refine it.
  useEffect(() => { setIsPaused(false) }, [displayVid, playing])

  const ytCommand = (func: 'playVideo' | 'pauseVideo') => {
    const w = iframeRef.current?.contentWindow
    if (!w) return
    w.postMessage(JSON.stringify({ event: 'command', func, args: [] }), '*')
  }

  // Subscribe to YT postMessage state events so our equalizer reflects
  // reality (including when the user pauses via YT's own native button).
  //
  // YT player states: -1 unstarted, 0 ended, 1 playing, 2 paused,
  // 3 buffering, 5 cued. We treat anything that isn't 1 or 3 as paused.
  useEffect(() => {
    if (!playing) return
    const onMessage = (e: MessageEvent) => {
      if (!/^https:\/\/(www\.)?youtube(-nocookie)?\.com$/.test(e.origin)) return
      let data: any
      try { data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data } catch { return }
      const state = data?.info?.playerState ?? (data?.event === 'onStateChange' ? data?.info : undefined)
      if (typeof state === 'number') {
        setIsPaused(!(state === 1 || state === 3))
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [playing, displayVid])

  // On iframe load, register as a listener so YT starts posting state events.
  const handleIframeLoad = () => {
    const w = iframeRef.current?.contentWindow
    if (!w) return
    w.postMessage(JSON.stringify({ event: 'listening' }), '*')
  }

  // Toggle per-track play button: same track + playing → pause; same track
  // + paused → resume; different track → switch + autoplay.
  const handleSelect = (id: number) => {
    if (id === activeTrackId && playing) {
      // Pause/resume via YT API
      if (isPaused) { ytCommand('playVideo'); setIsPaused(false) }
      else { ytCommand('pauseVideo'); setIsPaused(true) }
      return
    }
    onSelectTrack(id)
    onRequestPlay()
    setIsPaused(false)
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[0_20px_60px_-20px_rgba(0,0,0,0.4)]">
      <div className="relative aspect-video overflow-hidden bg-black">
        {displayVid ? (
          playing ? (
            // Standard YT controls (play/pause/fullscreen) are reliable and
            // handle autoplay edge cases better than a fully custom overlay.
            // We keep enablejsapi=1 so our per-track play button can still
            // drive pause/resume + our equalizer stays in sync with YT state.
            <iframe
              ref={iframeRef}
              key={displayVid}
              src={`https://www.youtube.com/embed/${displayVid}?rel=0&autoplay=1&modestbranding=1&playsinline=1&iv_load_policy=3&enablejsapi=1`}
              allow="autoplay;encrypted-media"
              allowFullScreen
              onLoad={handleIframeLoad}
              className="absolute inset-0 h-full w-full border-0"
            />
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
                if (!activeTrackId && firstWithVideo) onSelectTrack(firstWithVideo.id)
                onRequestPlay()
              }}
              aria-label="Paleisti"
              className="group absolute inset-0 block cursor-pointer overflow-hidden border-0 bg-black p-0"
            >
              <img
                src={`https://img.youtube.com/vi/${displayVid}/maxresdefault.jpg`}
                alt=""
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                onError={(e) => {
                  const el = e.currentTarget as HTMLImageElement
                  if (!el.dataset.fallback) {
                    el.dataset.fallback = '1'
                    el.src = `https://img.youtube.com/vi/${displayVid}/hqdefault.jpg`
                  }
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />
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
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border-default) transparent', maxHeight: '260px' }}
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
              const pop = popLevel(i, list.length)
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

/** Relative popularity tier for a track based on its position in the list.
 *  Top 10% → 4, top 30% → 3, top 60% → 2, rest → 1. */
function popLevel(index: number, total: number): number {
  if (total <= 1) return 4
  const pct = index / (total - 1)
  if (pct <= 0.1) return 4
  if (pct <= 0.3) return 3
  if (pct <= 0.6) return 2
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

/** 4-dot popularity bar — mirrors the rank bar pattern used on liker cards. */
function PopBar({ level }: { level: number }) {
  const total = 4
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

function TrackInfoModal({
  track, artistName, artistSlug, onClose, onPlay,
}: {
  track: Track | null; artistName: string; artistSlug: string; onClose: () => void
  /** Start playback of this track in the main player. Drawer stays open. */
  onPlay?: (t: Track) => void
}) {
  // We use an internal `mounted` flag so the slide-out animation gets a chance
  // to run before the component unmounts. When a new track replaces the
  // previous one, we re-use the mounted drawer.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    if (track) {
      // Defer to next frame so the element can transition in.
      const r = requestAnimationFrame(() => setMounted(true))
      const h = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
      window.addEventListener('keydown', h)
      return () => {
        cancelAnimationFrame(r)
        window.removeEventListener('keydown', h)
      }
    }
    setMounted(false)
    return
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id])

  const handleClose = () => {
    setMounted(false)
    // Let the transition play before actually clearing the track.
    window.setTimeout(onClose, 200)
  }

  if (!track) return null

  const dur = fmtDur(track.duration)
  const year = track.release_year || (track.release_date ? new Date(track.release_date).getFullYear() : null)
  const likes = typeof track.like_count === 'number' ? track.like_count : 0
  const lyrics = (track.lyrics || '').trim()
  const lyricsText = lyrics ? lyrics.replace(/<[^>]+>/g, '').trim() : null
  const trackHref = `/lt/daina/${track.slug}/${track.id}`

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
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Daina
            </div>
            <div className="mt-0.5 truncate font-['Outfit',sans-serif] text-[17px] font-extrabold text-[var(--text-primary)]">
              {track.title}
            </div>
            <div className="truncate text-[12px] text-[var(--text-muted)]">
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

        {/* Meta chips — likes / year / duration / type */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] px-5 py-3">
          <span
            title={likes > 0 ? `${likes.toLocaleString('lt-LT')} patinka` : 'Dar niekas nepaspaudė'}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-1.5 font-['Outfit',sans-serif] text-[12px] font-extrabold tabular-nums text-[var(--text-primary)]"
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" className="text-[var(--accent-orange)]" aria-hidden>
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            {likes.toLocaleString('lt-LT')}
          </span>
          {year && (
            <span className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-1.5 font-['Outfit',sans-serif] text-[12px] font-extrabold text-[var(--text-primary)]">
              {year}
            </span>
          )}
          {dur && (
            <span className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-1.5 font-['Outfit',sans-serif] text-[12px] font-extrabold tabular-nums text-[var(--text-primary)]">
              {dur}
            </span>
          )}
          {track.type && (
            <span className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-1.5 font-['Outfit',sans-serif] text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
              {track.type}
            </span>
          )}
        </div>

        {/* Body — full lyrics (scrollable) */}
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
          <Link
            href={trackHref}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] px-4 py-2 font-['Outfit',sans-serif] text-[12px] font-extrabold text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
          >
            Dainos puslapis
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>
      </aside>
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
}: {
  artist: any; heroImage: string | null; loaded: boolean
  likes: number; selfLiked?: boolean
  onToggleLike: () => void; onOpenLikersModal: () => void; selfLikePending: boolean
  tracksAllTime: Track[]; tracksTrending: Track[]
  activeTrackId: number | null; onSelectTrack: (id: number) => void
  playing: boolean; onRequestPlay: () => void
  onOpenTrackInfo: (t: Track) => void
  hasAnyVideo: boolean
}) {
  const coverPos = parseCoverPos(artist.cover_image_position || 'center 30%')

  return (
    <section className="relative isolate w-full bg-[var(--bg-surface)]">
      {/* Photo backdrop — mobile: aspect-video at top; desktop: absolute left 62%, fades into solid */}
      <div className="relative aspect-video w-full overflow-hidden bg-black sm:aspect-[16/9] lg:absolute lg:inset-y-0 lg:left-0 lg:right-[38%] lg:aspect-auto">
        {heroImage ? (
          <img
            id="hero-photo"
            src={heroImage}
            alt={artist.name}
            onClick={() => {
              // Desktop: scroll to galerija section. Mobile: do nothing (user taps the collage/lightbox instead).
              if (typeof window === 'undefined') return
              if (window.innerWidth < 1024) return
              const el = document.getElementById('galerija')
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
            className="block h-full w-full animate-[apHeroZoom_36s_ease-in-out_infinite_alternate] cursor-zoom-in object-cover"
            style={{
              objectPosition: `${coverPos.x}% ${coverPos.y}%`,
              transformOrigin: `${coverPos.x}% ${coverPos.y}%`,
            }}
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-[#1a2436] to-[#0a0f1a]" />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[35%] bg-gradient-to-r from-transparent to-[var(--bg-surface)] lg:block" />
      </div>

      <style>{`@keyframes apHeroZoom{0%{transform:scale(1.02)}100%{transform:scale(1.08)}}`}</style>

      <div
        className={[
          'relative mx-auto grid max-w-[1400px] grid-cols-1 gap-6 px-4 pb-10 pt-5 sm:px-6 lg:gap-10 lg:min-h-[580px] lg:px-10 lg:py-10',
          hasAnyVideo ? 'lg:grid-cols-[1fr_460px]' : '',
        ].join(' ')}
      >
        {/* Title column */}
        <div
          className={[
            'flex min-w-0 flex-col justify-end',
            'transition-[opacity,transform] duration-700 ease-out',
            loaded ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
          ].join(' ')}
        >
          <h1
            className="mb-6 font-['Outfit',sans-serif] font-black leading-[0.9] tracking-[-0.04em] text-[var(--text-primary)] sm:mb-7 lg:text-white lg:drop-shadow-[0_6px_32px_rgba(0,0,0,0.8)]"
            style={{ fontSize: 'clamp(2.25rem,6.5vw,5rem)' }}
          >
            {artist.name}
            {artist.is_verified && (
              <span className="ml-3 inline-flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#3b82f6] to-[#1d4ed8] align-middle shadow-[0_4px_16px_rgba(59,130,246,0.5)] sm:h-8 sm:w-8">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
              </span>
            )}
          </h1>

          {/* Like pill — single element with two zones (heart toggle + count → modal) */}
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
  if (horizontal) {
    return (
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3 sm:gap-x-6 sm:px-5">
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
            {substyles.length > 0 && (
              <span className="text-[12px] text-[var(--text-muted)]">
                · {substyles.map(s => s.name).join(', ')}
              </span>
            )}
          </div>
        )}
        {globalRank && (
          <div className="flex items-baseline gap-2">
            <RankChip n={globalRank.rank} />
            <span className="font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--text-primary)]">Pasaulyje</span>
          </div>
        )}
        {hasSocials && (
          <div className="ml-auto flex items-center gap-1">
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
            {website && (
              <a
                href={website}
                target="_blank"
                rel="noopener"
                title="Oficiali svetainė"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" /></svg>
              </a>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Vertical variant — sidebar card ──────────────────────────────
  return (
    <aside className="flex h-full min-h-[200px] flex-col gap-4 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5">
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

      {hasSocials && (
        <div className="mt-auto pt-2">
          <div className="flex flex-wrap gap-1">
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
            {website && (
              <a
                href={website}
                target="_blank"
                rel="noopener"
                title="Oficiali svetainė"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" /></svg>
              </a>
            )}
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
            <img src={m.cover_image_url} alt={m.name} className="h-7 w-7 shrink-0 rounded-full object-cover" />
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
                src={p.url}
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
        <img src={photos[index].url} alt="" className="max-h-[82vh] max-w-full rounded-lg object-contain" />
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
              src={p.url}
              alt={parsePhotoCaption(p.caption).author || ''}
              loading="lazy"
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

function EventCard({ e, variant = 'upcoming' }: { e: any; variant?: 'upcoming' | 'past' | 'compact' }) {
  const d = new Date(e.start_date)
  const venue = [e.venue_name, e.city].filter(Boolean).join(', ')
  const href = `/renginiai/${e.slug}`
  const monthShort = d.toLocaleDateString('lt-LT', { month: 'short' }).replace('.', '')
  const [coverFailed, setCoverFailed] = useState(false)
  const hasCover = !!e.cover_image_url && !coverFailed

  if (variant === 'past') {
    return (
      <Link
        href={href}
        className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 no-underline transition-all hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
      >
        <div className="flex min-w-[54px] flex-col items-center justify-center rounded-lg bg-[var(--card-bg)] px-2 py-1.5 text-center">
          <span className="font-['Outfit',sans-serif] text-[10px] font-bold capitalize leading-tight text-[var(--text-muted)]">{monthShort}</span>
          <span className="font-['Outfit',sans-serif] text-[20px] font-black leading-none text-[var(--text-primary)]">{d.getDate()}</span>
          <span className="mt-0.5 font-['Outfit',sans-serif] text-[9px] font-bold text-[var(--text-muted)]">{d.getFullYear()}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-bold leading-tight text-[var(--text-primary)]">{e.title}</div>
          {venue && <div className="mt-0.5 truncate text-[12px] text-[var(--text-muted)]">{venue}</div>}
        </div>
      </Link>
    )
  }

  if (variant === 'compact') {
    // Compact sidebar variant — used when upcoming events sit in a narrow
    // right column beside the bio. Big date block + title, no hero image
    // (sidebar is too narrow to make it flattering).
    return (
      <Link
        href={href}
        className="group flex items-stretch gap-3 overflow-hidden rounded-2xl border border-[rgba(249,115,22,0.3)] bg-gradient-to-br from-[rgba(249,115,22,0.1)] to-transparent p-3 no-underline transition-all hover:-translate-y-0.5 hover:border-[rgba(249,115,22,0.55)] hover:shadow-[0_10px_28px_rgba(249,115,22,0.15)]"
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

  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-2xl border border-[rgba(249,115,22,0.25)] bg-gradient-to-br from-[rgba(249,115,22,0.08)] to-transparent no-underline transition-all hover:-translate-y-0.5 hover:border-[rgba(249,115,22,0.5)] hover:shadow-[0_12px_32px_rgba(249,115,22,0.15)]"
    >
      {hasCover ? (
        <div className="relative aspect-[16/9] overflow-hidden">
          <img
            src={e.cover_image_url}
            alt={e.title}
            referrerPolicy="no-referrer"
            onError={() => setCoverFailed(true)}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          <div className="absolute left-3 top-3 rounded-lg bg-black/70 px-2.5 py-1.5 text-center backdrop-blur-sm">
            <div className="font-['Outfit',sans-serif] text-[9px] font-bold uppercase text-[var(--accent-orange)]">{monthShort} {d.getFullYear()}</div>
            <div className="font-['Outfit',sans-serif] text-[22px] font-black leading-none text-white">{d.getDate()}</div>
          </div>
        </div>
      ) : (
        <div className="flex aspect-[16/9] items-center justify-center bg-[rgba(249,115,22,0.1)]">
          <div className="text-center">
            <div className="font-['Outfit',sans-serif] text-[11px] font-bold uppercase tracking-wider text-[var(--accent-orange)]">{monthShort} {d.getFullYear()}</div>
            <div className="font-['Outfit',sans-serif] text-[56px] font-black leading-none text-[var(--text-primary)]">{d.getDate()}</div>
          </div>
        </div>
      )}
      <div className="p-4">
        <div className="truncate font-['Outfit',sans-serif] text-[15px] font-bold text-[var(--text-primary)] sm:text-[16px]">{e.title}</div>
        {venue && <div className="mt-1 truncate text-[12px] text-[var(--text-secondary)] sm:text-[13px]">📍 {venue}</div>}
      </div>
    </Link>
  )
}

// ── AlbumCard ──────────────────────────────────────────────────────

function AlbumCard({ a, popularity }: { a: Album; popularity?: number }) {
  const type = aType(a)
  return (
    <Link href={`/lt/albumas/${a.slug}/${a.id}/`} className="group block no-underline">
      <div className="relative overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--cover-placeholder)] transition-all group-hover:border-[var(--border-strong)] group-hover:shadow-[0_10px_28px_rgba(0,0,0,0.3)]">
        <div className="aspect-square">
          {a.cover_image_url ? (
            <img src={a.cover_image_url} alt={a.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl text-[var(--text-faint)]">💿</div>
          )}
        </div>
        {type !== 'Studijinis' && (
          <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 font-['Outfit',sans-serif] text-[9px] font-extrabold uppercase tracking-wider text-white backdrop-blur-sm">
            {type}
          </span>
        )}
        {a.year && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 font-['Outfit',sans-serif] text-[10px] font-bold text-white backdrop-blur-sm">
            {a.year}
          </span>
        )}
      </div>
      <div className="mt-2 px-0.5">
        <div className="truncate font-['Outfit',sans-serif] text-[12px] font-bold text-[var(--text-primary)] sm:text-[13px]">{a.title}</div>
        {typeof popularity === 'number' && <PopBar level={popularity} />}
      </div>
    </Link>
  )
}

// ── TrackRow: compact row for orphan tracks (no big placeholder square) ─

function TrackRow({ t, popularity }: { t: Track; popularity?: number }) {
  const v = yt(t.video_url)
  const cover = t.cover_url || (v ? `https://img.youtube.com/vi/${v}/mqdefault.jpg` : null)
  return (
    <Link
      href={`/lt/daina/${t.slug}/${t.id}/`}
      className="group flex items-center gap-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2 no-underline transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
    >
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-[var(--cover-placeholder)]">
        {cover ? (
          <img src={cover} alt={t.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[var(--text-faint)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" /></svg>
          </div>
        )}
        {v && (
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

function DiscussionRow({ t, isLast }: { t: LegacyThread; isLast: boolean }) {
  const title = t.title || slugToForumTitle(t.slug)
  const pc = t.post_count ?? 0
  const lastPost = t.last_post
  const lastText = lastPost?.body ? stripHtml(lastPost.body).slice(0, 90) : ''
  const author = lastPost?.author_username || ''

  return (
    <Link
      href={`/diskusijos/tema/${t.legacy_id}`}
      className={[
        'flex items-center gap-3 px-3 py-2.5 no-underline transition-colors hover:bg-[var(--bg-hover)] sm:px-4 sm:py-3',
        !isLast ? 'border-b border-[var(--border-subtle)]' : '',
      ].join(' ')}
    >
      {/* Thread icon — smaller to save vertical space */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[rgba(59,130,246,0.2)] bg-[rgba(59,130,246,0.1)] text-[#3b82f6]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" /></svg>
      </div>

      {/* Title + plain comment count (no timeago here — that belongs on the
          comment itself so the reader sees "when was this last replied to"
          right next to the text). */}
      <div className="flex min-w-0 flex-[1.2] flex-col justify-center">
        <div className="line-clamp-1 font-['Outfit',sans-serif] text-[13px] font-bold text-[var(--text-primary)] sm:text-[14px]">{title}</div>
        <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
          {pc > 0 ? `${pc} komentarai` : 'Dar nekomentuota'}
        </div>
      </div>

      {/* Last comment — hidden on small screens. Compact single row:
          avatar + (author · timeago) + preview line. */}
      {lastText && (
        <div className="hidden min-w-0 flex-1 items-center gap-2 sm:flex">
          <AvatarBubble name={author} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <span className="truncate font-['Outfit',sans-serif] text-[11px] font-bold text-[var(--text-secondary)]">
                {author || 'Anonimas'}
              </span>
              {lastPost?.created_at && (
                <span className="shrink-0 text-[10px] text-[var(--text-faint)]">
                  · {timeAgo(lastPost.created_at)}
                </span>
              )}
            </div>
            <div className="line-clamp-1 text-[12px] leading-tight text-[var(--text-muted)]">
              {lastText}
            </div>
          </div>
        </div>
      )}

      <svg className="shrink-0 text-[var(--text-faint)]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 18l6-6-6-6" />
      </svg>
    </Link>
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
  linkedTrackIds = [],
}: Props) {
  const [pid, setPid] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [trackInfoOpen, setTrackInfoOpen] = useState<Track | null>(null)
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
          setLikeErrorMsg('Duomenų bazės migracija dar neatlikta: artist_likes FK rodo į auth.users vietoj profiles. Paleisk supabase/migrations/20260424_artist_likes_profile_fk.sql.')
        } else if (/anon_artist_likes/i.test(errStr)) {
          setLikeErrorMsg('Lentelė anon_artist_likes nesukurta. Paleisk supabase/migrations/20260424b_anon_artist_likes.sql.')
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
  const authoritativeLegacy = (artist as any).legacy_like_count ?? legacyCommunity?.artistLikes ?? 0
  const likes = modernLikeCount + followers + authoritativeLegacy
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

  const tracksAllTime = useMemo(() => {
    const withVideo = tracks.filter(t => yt(t.video_url))
    if (withVideo.length >= 10) return withVideo.slice(0, 100)
    const rest = tracks.filter(t => !yt(t.video_url))
    return [...withVideo, ...rest].slice(0, 100)
  }, [tracks])

  const tracksTrending = useMemo(() => {
    const withVideo = newTracks.filter(t => yt(t.video_url))
    const rest = newTracks.filter(t => !yt(t.video_url))
    return [...withVideo, ...rest].slice(0, 100)
  }, [newTracks])

  const hasAnyVideo = tracksAllTime.some(t => yt(t.video_url)) || tracksTrending.some(t => yt(t.video_url))

  const now = Date.now()
  // Keep only fresh past content — anything older than ~2 months is noise
  // that pushes the gallery/discussions out of view without adding value.
  const TWO_MONTHS_MS = 62 * 24 * 60 * 60 * 1000
  const freshnessCutoff = now - TWO_MONTHS_MS
  const upcomingEvents = events.filter((e: any) => new Date(e.start_date).getTime() >= now)
  const pastEvents = events.filter((e: any) => {
    const ts = new Date(e.start_date).getTime()
    return ts < now && ts >= freshnessCutoff
  })
  const freshLegacyNews = (legacyNews || []).filter((n: any) => {
    const raw = n.last_post_at || n.first_post_at
    if (!raw) return false
    const ts = new Date(raw).getTime()
    return isFinite(ts) && ts >= freshnessCutoff
  })
  const bioHtml: string = artist.description || ''

  // Gallery photos excluding the hero image
  const galleryPhotos = useMemo(
    () => photos.filter(p => p.url !== heroImage),
    [photos, heroImage],
  )

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
      />

      <LikesModal
        open={likesModalOpen}
        onClose={() => setLikesModalOpen(false)}
        title={`„${artist.name}" patinka`}
        count={likes}
        users={allLikesUsers}
        subjectName={artist.name}
        subjectPhoto={heroImage}
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

        {/* Upcoming events — full card with cover photo. Events are high-value
            so they deserve visual weight; a single event card fills a third
            of the row and 2-3 events pack the grid. */}
        {upcomingEvents.length > 0 && (
          <section>
            <SectionTitle label="Artimiausi renginiai" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {upcomingEvents.map((e: any) => (
                <EventCard key={e.id} e={e} variant="upcoming" />
              ))}
            </div>
          </section>
        )}

        {/* BIO + MEMBERS + SIDE INFO — adaptive layout.
            With events present, the bio section gets a heading so the two
            sections stay visually separated. */}
        {(() => {
          const bioLen = stripHtml(bioHtml).length
          const isShortBio = bioLen < 200
          const sideInfoAvailable = !!artist.country || genres.length > 0 || links.length > 0 || artist.website
          const bioHeader = solo ? 'Apie atlikėją' : 'Apie grupę'
          const hasUpcoming = upcomingEvents.length > 0

          if (!hasBio && members.length === 0 && !sideInfoAvailable) return null

          if (isShortBio) {
            return (
              <section className="space-y-6">
                {sideInfoAvailable && (
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
                )}
                {(hasBio || members.length > 0) && (
                  <div>
                    {hasUpcoming && hasBio && (
                      <h2 className="mb-3 font-['Outfit',sans-serif] text-[18px] font-black tracking-[-0.01em] text-[var(--text-primary)] sm:text-[20px]">
                        {bioHeader}
                      </h2>
                    )}
                    {hasBio && <BioPreview html={bioHtml} onOpen={() => setBioModalOpen(true)} maxChars={400} />}
                    {!solo && members.length > 0 && <MembersInline members={members} />}
                  </div>
                )}
              </section>
            )
          }

          return (
            <section className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10">
              <div className="min-w-0">
                {hasUpcoming && hasBio && (
                  <h2 className="mb-3 font-['Outfit',sans-serif] text-[18px] font-black tracking-[-0.01em] text-[var(--text-primary)] sm:text-[20px]">
                    {bioHeader}
                  </h2>
                )}
                <BioPreview html={bioHtml} onOpen={() => setBioModalOpen(true)} maxChars={700} />
                {!solo && members.length > 0 && <MembersInline members={members} />}
              </div>
              <SideInfo
                artist={artist}
                flag={flag}
                genres={genres}
                substyles={substyles}
                ranks={ranks}
                links={links}
                website={artist.website}
              />
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
              <div className="mb-5 flex flex-wrap gap-1.5 sm:gap-2">
                {/* "Visi įrašai" first */}
                <FilterChip k="all" label={FILTER_LABEL.all} count={allCount} />
                {/* Album types in natural order */}
                {atypes.map(t => (
                  <FilterChip
                    key={t}
                    k={t}
                    label={FILTER_LABEL[t] || t}
                    count={albums.filter(a => aType(a) === t).length}
                  />
                ))}
                {/* "Kitos dainos" last */}
                {hasOrphanTracks && (
                  <FilterChip k="orphan" label={FILTER_LABEL.orphan} count={orphanTracks.length} />
                )}
              </div>

              {/* Albums grid — tighter columns (more per row) now that
                  each card is smaller. Popularity tier is index-based: the
                  first 10% of visible albums get the fullest bar. */}
              {visibleAlbums.length > 0 && (
                <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
                  {visibleAlbums.map((a, i) => (
                    <AlbumCard key={a.id} a={a} popularity={popLevel(i, visibleAlbums.length)} />
                  ))}
                </div>
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
                      <TrackRow key={t.id} t={t} popularity={popLevel(i, orphanTracks.length)} />
                    ))}
                  </div>
                </div>
              )}
            </section>
          )
        })()}

        {/* Diskusijos — no #ID, last comment preview on right */}
        <section>
          <SectionTitle label="Diskusijos" />
          {legacyThreads.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
              {legacyThreads.map((t, i) => (
                <DiscussionRow key={t.legacy_id} t={t} isLast={i === legacyThreads.length - 1} />
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

        {/* Past events */}
        {pastEvents.length > 0 && (
          <section>
            <SectionTitle label="Įvykę renginiai" />
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {pastEvents.map((e: any) => <EventCard key={e.id} e={e} variant="past" />)}
            </div>
          </section>
        )}

        {/* Legacy news — only recent (<=2mo) to avoid stale archive noise */}
        {freshLegacyNews.length > 0 && (
          <section>
            <SectionTitle label="Naujienos" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {freshLegacyNews.slice(0, 12).map(n => {
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
                      <img src={a.cover_image_url} alt={a.name} className="h-full w-full object-cover" />
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
