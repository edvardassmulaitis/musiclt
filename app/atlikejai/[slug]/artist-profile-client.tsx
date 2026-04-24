'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import LikesModal from '@/components/LikesModal'
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
  album_id?: number | null; release_year?: number
}
type Member = { id: number; slug: string; name: string; cover_image_url?: string; member_from?: number; member_until?: number }
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
  links: { platform: string; url: string }[]; photos: { url: string; caption?: string }[]
  albums: Album[]; tracks: Track[]; members: Member[]; followers: number; likeCount: number
  news: any[]; events: any[]; similar: any[]
  newTracks: Track[]; topVideos: Track[]; chartData: ChartPt[]; hasNewMusic: boolean
  legacyCommunity?: LegacyCommunity
  legacyThreads?: LegacyThread[]; legacyNews?: LegacyThread[]
  ranks?: Rank[]
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

/** Filter-tab labels — user asked filters read as "* albumai" where it makes
 *  sense, plus a distinct "Kitos dainos" bucket. "all" = all albums of any type. */
const FILTER_LABEL: Record<string, string> = {
  all: 'Visi albumai',
  Studijinis: 'Studijiniai albumai',
  EP: 'EP albumai',
  Singlas: 'Singlai',
  Live: 'Live albumai',
  Rinkinys: 'Rinkinių albumai',
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

const SOC: Record<string, { l: string; c: string; d: string }> = {
  spotify: { l: 'Spotify', c: '#1DB954', d: 'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.52 17.34c-.24.36-.66.48-1.02.24-2.82-1.74-6.36-2.1-10.56-1.14-.42.12-.78-.18-.9-.54-.12-.42.18-.78.54-.9 4.56-1.02 8.52-.6 11.64 1.32.42.18.48.66.3 1.02z' },
  youtube: { l: 'YouTube', c: '#FF0000', d: 'M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.38.55A3.02 3.02 0 0 0 .5 6.19 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.81 3.02 3.02 0 0 0 2.12 2.14c1.88.55 9.38.55 9.38.55s7.5 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14A31.6 31.6 0 0 0 24 12a31.6 31.6 0 0 0-.5-5.81zM9.54 15.57V8.43L15.82 12l-6.28 3.57z' },
  tiktok: { l: 'TikTok', c: '#00f2ea', d: 'M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.96-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z' },
  facebook: { l: 'Facebook', c: '#1877F2', d: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z' },
  twitter: { l: 'X', c: '#fff', d: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' },
  soundcloud: { l: 'SoundCloud', c: '#FF5500', d: 'M1.175 12.225c-.051 0-.094.046-.101.1l-.233 2.154.233 2.105c.007.058.05.098.101.098.05 0 .09-.04.099-.098l.255-2.105-.27-2.154c-.009-.06-.05-.1-.084-.1z' },
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

function PlayerCard({
  tracksAllTime, tracksTrending, activeTrackId, onSelectTrack, hasAnyVideo,
}: {
  tracksAllTime: Track[]; tracksTrending: Track[]
  activeTrackId: number | null; onSelectTrack: (id: number) => void; hasAnyVideo: boolean
}) {
  const [tab, setTab] = useState<'all' | 'trending'>(
    tracksTrending.length > 0 ? 'trending' : 'all'
  )
  const list = tab === 'trending' ? tracksTrending : tracksAllTime
  const activeTrack = [...tracksAllTime, ...tracksTrending].find(t => t.id === activeTrackId)
  const activeVid = yt(activeTrack?.video_url)
  const firstWithVideo = list.find(t => yt(t.video_url)) || tracksAllTime.find(t => yt(t.video_url))
  const displayVid = activeVid || yt(firstWithVideo?.video_url)
  const displayTrack = activeTrack || firstWithVideo

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[0_20px_60px_-20px_rgba(0,0,0,0.4)]">
      <div className="relative aspect-video overflow-hidden bg-black">
        {displayVid ? (
          <iframe
            key={displayVid}
            src={`https://www.youtube.com/embed/${displayVid}?rel=0${activeVid ? '&autoplay=1' : ''}`}
            allow="autoplay;encrypted-media"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0"
          />
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

      {displayTrack && (
        <div className="flex items-center gap-3 border-b border-[var(--border-default)] bg-[var(--bg-elevated)] px-4 py-2.5">
          <div className={[
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
            activeVid ? 'bg-[var(--accent-orange)] shadow-[0_4px_14px_rgba(249,115,22,0.4)]' : 'bg-[var(--card-bg)]',
          ].join(' ')}>
            {activeVid ? (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-[var(--text-muted)]"><path d="M8 5v14l11-7z" /></svg>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-['Outfit',sans-serif] text-[13px] font-bold text-[var(--text-primary)]">
              {displayTrack.title}
            </div>
            <div className="font-['Outfit',sans-serif] text-[9px] font-extrabold uppercase tracking-[0.18em] text-[var(--accent-orange)]">
              {activeVid ? 'Groja' : 'Paruošta'}
            </div>
          </div>
        </div>
      )}

      <div className="flex border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-2 pt-1">
        <TabButton active={tab === 'all'} onClick={() => setTab('all')}>
          Populiariausios <span className="ml-1 text-[var(--text-faint)]">·{tracksAllTime.length}</span>
        </TabButton>
        <TabButton
          active={tab === 'trending'}
          disabled={tracksTrending.length === 0}
          onClick={() => setTab('trending')}
        >
          Trending <span className="ml-1 text-[var(--text-faint)]">·{tracksTrending.length}</span>
        </TabButton>
      </div>

      <div
        className="overflow-y-auto bg-[var(--bg-surface)]"
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border-default) transparent', maxHeight: '240px' }}
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
              return (
                <li key={t.id}>
                  <button
                    onClick={() => v && onSelectTrack(t.id)}
                    disabled={!v}
                    className={[
                      'flex w-full items-center gap-3 border-0 bg-transparent px-4 py-2 text-left transition-colors',
                      v ? 'cursor-pointer' : 'cursor-default opacity-55',
                      isActive ? 'bg-[rgba(249,115,22,0.08)]' : 'hover:bg-[var(--bg-hover)]',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'w-6 shrink-0 text-center font-["Outfit",sans-serif] text-[12px] font-bold tabular-nums',
                        isActive ? 'text-[var(--accent-orange)]' : 'text-[var(--text-faint)]',
                      ].join(' ')}
                    >
                      {isActive && v ? (
                        <span className="inline-flex h-5 w-5 items-center justify-center">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                        </span>
                      ) : (
                        i + 1
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className={[
                        'truncate font-["Outfit",sans-serif] text-[13px] font-bold leading-tight',
                        isActive ? 'text-[var(--accent-orange)]' : 'text-[var(--text-primary)]',
                      ].join(' ')}>
                        {t.title}
                      </div>
                    </div>
                    {v ? (
                      <div className={[
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors',
                        isActive ? 'bg-[var(--accent-orange)] text-white' : 'bg-[var(--card-bg)] text-[var(--text-muted)]',
                      ].join(' ')}>
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                      </div>
                    ) : (
                      <div className="shrink-0 font-['Outfit',sans-serif] text-[9px] font-bold uppercase tracking-wider text-[var(--text-faint)]">—</div>
                    )}
                  </button>
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

function TabButton({ active, disabled, onClick, children }: {
  active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        'relative border-0 bg-transparent px-4 py-2.5 font-["Outfit",sans-serif] text-[11px] font-extrabold uppercase tracking-[0.15em] transition-colors',
        active ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
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
  tracksAllTime, tracksTrending, activeTrackId, onSelectTrack, hasAnyVideo,
}: {
  artist: any; heroImage: string | null; loaded: boolean
  likes: number; selfLiked?: boolean
  onToggleLike: () => void; onOpenLikersModal: () => void; selfLikePending: boolean
  tracksAllTime: Track[]; tracksTrending: Track[]
  activeTrackId: number | null; onSelectTrack: (id: number) => void; hasAnyVideo: boolean
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

      <div className="relative mx-auto grid max-w-[1400px] grid-cols-1 gap-6 px-4 pb-10 pt-5 sm:px-6 lg:grid-cols-[1fr_460px] lg:gap-10 lg:min-h-[580px] lg:px-10 lg:py-10">
        {/* Title column */}
        <div
          className={[
            'flex min-w-0 flex-col justify-end',
            'transition-[opacity,transform] duration-700 ease-out',
            loaded ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
          ].join(' ')}
        >
          <h1
            className="mb-4 font-['Outfit',sans-serif] font-black leading-[0.9] tracking-[-0.04em] text-[var(--text-primary)] lg:text-white lg:drop-shadow-[0_6px_32px_rgba(0,0,0,0.8)]"
            style={{ fontSize: 'clamp(2.25rem,6.5vw,5rem)' }}
          >
            {artist.name}
            {artist.is_verified && (
              <span className="ml-3 inline-flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#3b82f6] to-[#1d4ed8] align-middle shadow-[0_4px_16px_rgba(59,130,246,0.5)] sm:h-8 sm:w-8">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
              </span>
            )}
          </h1>

          {/* Like (toggle) + "Kam patinka" (modal) — two separate actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onToggleLike}
              disabled={selfLikePending}
              className={[
                'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 font-["Outfit",sans-serif] text-[12px] font-extrabold uppercase tracking-[0.1em] backdrop-blur-md transition-all sm:text-[13px]',
                selfLikePending ? 'cursor-wait opacity-70' : 'cursor-pointer',
                selfLiked
                  ? 'border-[var(--accent-orange)] bg-[var(--accent-orange)] text-white shadow-[0_6px_18px_rgba(249,115,22,0.4)] hover:opacity-90'
                  : 'border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] lg:border-white/20 lg:bg-white/10 lg:text-white lg:hover:bg-white/20',
              ].join(' ')}
              title={selfLiked ? 'Tau patinka (paspausk, kad atšauktum)' : 'Paspausk „Patinka"'}
            >
              <svg viewBox="0 0 24 24" fill={selfLiked ? '#fff' : 'currentColor'} className={['h-3.5 w-3.5', selfLiked ? 'text-white' : 'text-[var(--accent-orange)]'].join(' ')}>
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              {likes > 0 ? likes.toLocaleString('lt-LT') : 'Patinka'}
            </button>

            {likes > 0 && (
              <button
                onClick={onOpenLikersModal}
                className="inline-flex items-center gap-1.5 rounded-full border border-transparent bg-transparent px-2.5 py-1.5 font-['Outfit',sans-serif] text-[12px] font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] lg:text-white/70 lg:hover:bg-white/10 lg:hover:text-white"
                title="Pamatyk kam patinka"
              >
                Kam patinka →
              </button>
            )}
          </div>
        </div>

        {/* Player column */}
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
              hasAnyVideo={hasAnyVideo}
            />
          </div>
        </div>
      </div>
    </section>
  )
}

// ── InfoBar: horizontal strip below hero ───────────────────────────

function InfoBar({
  artist, flag, genres, substyles, ranks, links, website,
}: {
  artist: any; flag: string; genres: Genre[]; substyles: Genre[]
  ranks: Rank[]
  links: { platform: string; url: string }[]; website?: string | null
}) {
  const countryRank = ranks.find(r => r.scope === 'country')
  const genreRank = ranks.find(r => r.scope === 'genre')
  const globalRank = ranks.find(r => r.scope === 'global')
  const hasSocials = links.some(l => SOC[l.platform]) || !!website

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3 sm:gap-x-6 sm:px-5 sm:py-4">
      {/* Country + rank */}
      {artist.country && (
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="inline-flex items-center gap-2 font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--text-primary)] sm:text-[15px]">
            <span className="text-[18px] leading-none">{flag}</span>
            <span>{artist.country}</span>
          </span>
          {countryRank && (
            <span className="inline-flex items-center rounded-full bg-[rgba(249,115,22,0.14)] px-2 py-0.5 font-['Outfit',sans-serif] text-[11px] font-extrabold text-[var(--accent-orange)]">
              #{countryRank.rank}
            </span>
          )}
        </div>
      )}

      {/* Genre + rank + subtle substyles */}
      {genres[0] && (
        <div className="flex min-w-0 flex-wrap items-baseline gap-2">
          <span className="font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--text-primary)] sm:text-[15px]">
            {genres[0].name}
          </span>
          {genreRank && (
            <span className="inline-flex items-center rounded-full bg-[rgba(249,115,22,0.14)] px-2 py-0.5 font-['Outfit',sans-serif] text-[11px] font-extrabold text-[var(--accent-orange)]">
              #{genreRank.rank}
            </span>
          )}
          {substyles.length > 0 && (
            <span className="text-[12px] text-[var(--text-muted)]">
              + {substyles.map(s => s.name).join(', ')}
            </span>
          )}
        </div>
      )}

      {/* Global rank if present */}
      {globalRank && (
        <div className="flex items-baseline gap-2">
          <span className="font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--text-primary)] sm:text-[15px]">Pasaulyje</span>
          <span className="inline-flex items-center rounded-full bg-[rgba(249,115,22,0.14)] px-2 py-0.5 font-['Outfit',sans-serif] text-[11px] font-extrabold text-[var(--accent-orange)]">
            #{globalRank.rank}
          </span>
        </div>
      )}

      {/* Push right: socials */}
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
                <svg viewBox="0 0 24 24" fill={p.c} width="14" height="14"><path d={p.d} /></svg>
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

// ── BioPreview + MembersInline ─────────────────────────────────────

function BioPreview({ html, onOpen }: { html: string; onOpen: () => void }) {
  const plain = stripHtml(html)
  const excerpt = plain.slice(0, 320)
  const isLong = plain.length > 320
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
        Nariai · {members.length}
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
  photos: { url: string; caption?: string }[]
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

function Lightbox({
  photos, index, onClose, onIndex,
}: {
  photos: { url: string; caption?: string }[]
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
        {photos[index].caption && <p className="mt-2 text-[12px] text-white/50">{photos[index].caption}</p>}
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

function MasonryGallery({ photos, onOpen }: { photos: { url: string; caption?: string }[]; onOpen: (i: number) => void }) {
  const limited = photos.slice(0, 24)
  if (!limited.length) return null
  return (
    <div className="columns-2 gap-2 sm:columns-3 md:gap-3 lg:columns-4">
      {limited.map((p, i) => (
        <button
          key={i}
          onClick={() => onOpen(i)}
          className="mb-2 block w-full overflow-hidden rounded-xl border-0 bg-transparent p-0 md:mb-3"
          style={{ breakInside: 'avoid' }}
        >
          <img
            src={p.url}
            alt={p.caption || ''}
            loading="lazy"
            className="block w-full cursor-zoom-in object-cover transition-transform duration-500 hover:scale-[1.02]"
          />
        </button>
      ))}
    </div>
  )
}

// ── EventCard ──────────────────────────────────────────────────────

function EventCard({ e, variant = 'upcoming' }: { e: any; variant?: 'upcoming' | 'past' }) {
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

function AlbumCard({ a }: { a: Album }) {
  const type = aType(a)
  return (
    <Link href={`/lt/albumas/${a.slug}/${a.id}/`} className="group block no-underline">
      <div className="relative overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--cover-placeholder)] transition-all group-hover:border-[var(--border-strong)] group-hover:shadow-[0_12px_32px_rgba(0,0,0,0.3)]">
        <div className="aspect-square">
          {a.cover_image_url ? (
            <img src={a.cover_image_url} alt={a.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-4xl text-[var(--text-faint)]">💿</div>
          )}
        </div>
        {type !== 'Studijinis' && (
          <span className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-1 font-['Outfit',sans-serif] text-[9px] font-extrabold uppercase tracking-wider text-white backdrop-blur-sm">
            {type}
          </span>
        )}
        {a.year && (
          <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-2 py-1 font-['Outfit',sans-serif] text-[10px] font-bold text-white backdrop-blur-sm">
            {a.year}
          </span>
        )}
      </div>
      <div className="mt-2.5 px-1">
        <div className="truncate font-['Outfit',sans-serif] text-[13px] font-bold text-[var(--text-primary)] sm:text-[14px]">{a.title}</div>
      </div>
    </Link>
  )
}

// ── TrackCard: for "Kitos dainos" filter ───────────────────────────

function TrackCard({ t }: { t: Track }) {
  const v = yt(t.video_url)
  const cover = t.cover_url || (v ? `https://img.youtube.com/vi/${v}/mqdefault.jpg` : null)
  return (
    <Link href={`/lt/daina/${t.slug}/${t.id}/`} className="group block no-underline">
      <div className="relative overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--cover-placeholder)] transition-all group-hover:border-[var(--border-strong)] group-hover:shadow-[0_12px_32px_rgba(0,0,0,0.3)]">
        <div className="aspect-square">
          {cover ? (
            <img src={cover} alt={t.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-4xl text-[var(--text-faint)]">♪</div>
          )}
        </div>
        {v && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-orange)] shadow-[0_6px_20px_rgba(249,115,22,0.5)]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
            </div>
          </div>
        )}
      </div>
      <div className="mt-2.5 px-1">
        <div className="truncate font-['Outfit',sans-serif] text-[13px] font-bold text-[var(--text-primary)] sm:text-[14px]">{t.title}</div>
      </div>
    </Link>
  )
}

// ── DiscussionRow: title + last post preview on the right ──────────

function DiscussionRow({ t, isLast }: { t: LegacyThread; isLast: boolean }) {
  const title = t.title || slugToForumTitle(t.slug)
  const pc = t.post_count ?? 0
  const lastPost = t.last_post
  const lastText = lastPost?.body ? stripHtml(lastPost.body).slice(0, 120) : ''

  return (
    <Link
      href={`/diskusijos/tema/${t.legacy_id}`}
      className={[
        'flex items-stretch gap-4 px-4 py-4 no-underline transition-colors hover:bg-[var(--bg-hover)] sm:px-5',
        !isLast ? 'border-b border-[var(--border-subtle)]' : '',
      ].join(' ')}
    >
      {/* Left: icon */}
      <div className="flex h-11 w-11 shrink-0 items-center justify-center self-start rounded-xl border border-[rgba(59,130,246,0.2)] bg-[rgba(59,130,246,0.1)] text-[#3b82f6] sm:h-12 sm:w-12">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" /></svg>
      </div>

      {/* Middle: title + meta */}
      <div className="flex min-w-0 flex-1 flex-col justify-center sm:flex-[1.5]">
        <div className="line-clamp-1 font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--text-primary)] sm:text-[15px]">{title}</div>
        <div className="mt-1 text-[12px] text-[var(--text-muted)]">
          {pc > 0 ? `${pc} komentarai` : 'Dar nekomentuota'}
          {lastPost?.created_at && <> · {timeAgo(lastPost.created_at)}</>}
        </div>
      </div>

      {/* Right: last post preview (hidden on small screens) */}
      {lastText && (
        <div className="hidden min-w-0 flex-1 items-start sm:flex">
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-2">
            {lastPost?.author_username && (
              <div className="mb-0.5 font-['Outfit',sans-serif] text-[11px] font-bold text-[var(--text-secondary)]">
                {lastPost.author_username}
              </div>
            )}
            <div className="line-clamp-2 text-[12px] leading-[1.45] text-[var(--text-muted)]">
              {lastText}
            </div>
          </div>
        </div>
      )}

      <svg className="self-center text-[var(--text-faint)]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 18l6-6-6-6" />
      </svg>
    </Link>
  )
}

// ── Main ────────────────────────────────────────────────────────────

export default function ArtistProfileClient({
  artist, heroImage, genres, substyles = [], links, photos, albums, tracks, members, followers, likeCount,
  events, similar, newTracks,
  legacyCommunity, legacyThreads = [], legacyNews = [], ranks = [],
}: Props) {
  const [pid, setPid] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [likesModalOpen, setLikesModalOpen] = useState(false)
  const [bioModalOpen, setBioModalOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const galerijaRef = useRef<HTMLDivElement>(null)

  // Self-like state
  const [selfLiked, setSelfLiked] = useState<boolean | undefined>(undefined)
  const [authed, setAuthed] = useState<boolean | undefined>(undefined)
  const [modernLikeCount, setModernLikeCount] = useState<number>(likeCount)
  const [selfLikePending, setSelfLikePending] = useState(false)

  useEffect(() => { setLoaded(true) }, [])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/artists/${artist.id}/like`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data) return
        if (typeof data.liked === 'boolean') setSelfLiked(data.liked)
        if (typeof data.count === 'number') setModernLikeCount(data.count)
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
      if (res.status === 401) {
        setSelfLiked(prev)
        setModernLikeCount(c => c - (prev ? -1 : 1))
        setAuthed(false)
        // Open modal so user sees the "Prisijunk" CTA
        setLikesModalOpen(true)
      } else if (res.ok) {
        const data = await res.json()
        if (typeof data.liked === 'boolean') setSelfLiked(data.liked)
        if (typeof data.count === 'number') setModernLikeCount(data.count)
        setAuthed(true)
      } else {
        setSelfLiked(prev)
        setModernLikeCount(c => c - (prev ? -1 : 1))
      }
    } catch {
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

  // Discography filters — types present in albums + "orphan" tracks bucket
  const atypes = [...new Set(albums.map(aType))]
  const hasStudio = atypes.includes('Studijinis')
  // orphan tracks: tracks not linked to an album (album_id null/undefined)
  const orphanTracks = useMemo(
    () => tracks.filter(t => t.album_id == null),
    [tracks],
  )
  const hasOrphanTracks = orphanTracks.length > 0
  const [df, setDf] = useState<string>(hasStudio ? 'Studijinis' : 'all')
  const fAlbums = df === 'all' ? albums : albums.filter(a => aType(a) === df)

  const tracksAllTime = useMemo(() => {
    const withVideo = tracks.filter(t => yt(t.video_url))
    if (withVideo.length >= 10) return withVideo.slice(0, 30)
    const rest = tracks.filter(t => !yt(t.video_url))
    return [...withVideo, ...rest].slice(0, 30)
  }, [tracks])

  const tracksTrending = useMemo(() => {
    const withVideo = newTracks.filter(t => yt(t.video_url))
    const rest = newTracks.filter(t => !yt(t.video_url))
    return [...withVideo, ...rest].slice(0, 30)
  }, [newTracks])

  const hasAnyVideo = tracksAllTime.some(t => yt(t.video_url)) || tracksTrending.some(t => yt(t.video_url))

  const now = Date.now()
  const upcomingEvents = events.filter((e: any) => new Date(e.start_date).getTime() >= now)
  const pastEvents = events.filter((e: any) => new Date(e.start_date).getTime() < now)
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
        hasAnyVideo={hasAnyVideo}
      />

      <LikesModal
        open={likesModalOpen}
        onClose={() => setLikesModalOpen(false)}
        title={`„${artist.name}" patinka`}
        count={likes}
        users={allLikesUsers}
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

      {lightboxIndex !== null && galleryPhotos.length > 0 && (
        <Lightbox
          photos={galleryPhotos}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndex={setLightboxIndex}
        />
      )}

      <main className="mx-auto max-w-[1400px] space-y-10 px-4 pb-24 pt-8 sm:space-y-14 sm:px-6 lg:px-10">

        {/* Horizontal info strip below hero */}
        <InfoBar
          artist={artist}
          flag={flag}
          genres={genres}
          substyles={substyles}
          ranks={ranks}
          links={links}
          website={artist.website}
        />

        {/* Upcoming events */}
        {upcomingEvents.length > 0 && (
          <section>
            <SectionTitle label="Artimiausi renginiai" count={upcomingEvents.length} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {upcomingEvents.map((e: any) => <EventCard key={e.id} e={e} variant="upcoming" />)}
            </div>
          </section>
        )}

        {/* BIO + MEMBERS on left, GALLERY COLLAGE on right (player-width) */}
        {(hasBio || members.length > 0 || galleryPhotos.length > 0) && (
          <section className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_460px] lg:gap-10">
            <div className="min-w-0">
              {hasBio && (
                <BioPreview html={bioHtml} onOpen={() => setBioModalOpen(true)} />
              )}
              {!solo && members.length > 0 && <MembersInline members={members} />}
            </div>

            {galleryPhotos.length > 0 && (
              <GalleryCollage
                photos={galleryPhotos}
                totalCount={galleryPhotos.length}
                onOpen={(i) => setLightboxIndex(i)}
                onScrollToFull={scrollToGalerija}
              />
            )}
          </section>
        )}

        {/* Diskografija — no count; renamed filters; +Kitos dainos */}
        {(albums.length > 0 || hasOrphanTracks) && (
          <section>
            <SectionTitle label="Diskografija" />
            <div className="mb-5 flex flex-wrap gap-1.5 sm:gap-2">
              {atypes.map(t => {
                const count = albums.filter(a => aType(a) === t).length
                const active = df === t
                return (
                  <button
                    key={t}
                    onClick={() => setDf(t)}
                    className={[
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-["Outfit",sans-serif] text-[12px] font-bold transition-all',
                      active
                        ? 'border-[var(--accent-orange)] bg-[var(--accent-orange)] text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)]'
                        : 'border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]',
                    ].join(' ')}
                  >
                    {FILTER_LABEL[t] || t}
                    <span className={active ? 'opacity-80' : 'text-[var(--text-faint)]'}>· {count}</span>
                  </button>
                )
              })}
              {hasOrphanTracks && (
                <button
                  onClick={() => setDf('orphan')}
                  className={[
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-["Outfit",sans-serif] text-[12px] font-bold transition-all',
                    df === 'orphan'
                      ? 'border-[var(--accent-orange)] bg-[var(--accent-orange)] text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)]'
                      : 'border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]',
                  ].join(' ')}
                >
                  {FILTER_LABEL.orphan}
                  <span className={df === 'orphan' ? 'opacity-80' : 'text-[var(--text-faint)]'}>· {orphanTracks.length}</span>
                </button>
              )}
              {atypes.length > 1 && (
                <button
                  onClick={() => setDf('all')}
                  className={[
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-["Outfit",sans-serif] text-[12px] font-bold transition-all',
                    df === 'all'
                      ? 'border-[var(--accent-orange)] bg-[var(--accent-orange)] text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)]'
                      : 'border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]',
                  ].join(' ')}
                >
                  {FILTER_LABEL.all}
                  <span className={df === 'all' ? 'opacity-80' : 'text-[var(--text-faint)]'}>· {albums.length}</span>
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {df === 'orphan'
                ? orphanTracks.map(t => <TrackCard key={t.id} t={t} />)
                : fAlbums.map(a => <AlbumCard key={a.id} a={a} />)
              }
            </div>
          </section>
        )}

        {/* Diskusijos — no #ID, last comment preview on right */}
        <section>
          <SectionTitle label="Diskusijos" count={legacyThreads.length || undefined} />
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
            <SectionTitle label="Įvykę renginiai" count={pastEvents.length} />
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {pastEvents.map((e: any) => <EventCard key={e.id} e={e} variant="past" />)}
            </div>
          </section>
        )}

        {/* Legacy news */}
        {legacyNews.length > 0 && (
          <section>
            <SectionTitle label="Naujienų archyvas" count={legacyNews.length} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {legacyNews.slice(0, 12).map(n => {
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
