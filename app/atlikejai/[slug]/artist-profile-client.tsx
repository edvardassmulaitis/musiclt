'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import LikesModal from '@/components/LikesModal'
import type { LegacyLikeUser } from '@/components/LegacyLikesPanel'

/* ═══════════════════════════════════════════════════════════════════
   Artist profile — full redesign (desktop + mobile).
   Sections: Hero · ActionBar · StatsStrip · Music · Discography ·
             About · Events · Gallery · Community · Similar
   ═══════════════════════════════════════════════════════════════════ */

// ── Types ───────────────────────────────────────────────────────────

type Genre = { id: number; name: string }
type Album = {
  id: number; slug: string; title: string; year?: number; cover_image_url?: string
  type_studio?: boolean; type_ep?: boolean; type_single?: boolean; type_live?: boolean
  type_compilation?: boolean; type_remix?: boolean; type_soundtrack?: boolean; type_demo?: boolean
}
type Track = { id: number; slug: string; title: string; type?: string; video_url?: string; cover_url?: string }
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
}
type Props = {
  artist: any; heroImage: string | null; genres: Genre[]
  links: { platform: string; url: string }[]; photos: { url: string; caption?: string }[]
  albums: Album[]; tracks: Track[]; members: Member[]; followers: number; likeCount: number
  news: any[]; events: any[]; similar: any[]
  newTracks: Track[]; topVideos: Track[]; chartData: ChartPt[]; hasNewMusic: boolean
  legacyCommunity?: LegacyCommunity
  legacyThreads?: LegacyThread[]; legacyNews?: LegacyThread[]
}

// ── Helpers ─────────────────────────────────────────────────────────

function parseCoverPos(pos: string): { x: number; y: number; zoom: number } {
  const parts = pos.trim().split(/\s+/)
  if (parts[0] === 'center') {
    const yMatch = pos.match(/(\d+)%/)
    const y = yMatch ? parseInt(yMatch[1]) : 20
    const last = parseFloat(parts[parts.length - 1])
    const zoom = (!isNaN(last) && last >= 1 && !parts[parts.length - 1].includes('%')) ? last : 1
    return { x: 50, y, zoom }
  }
  const pcts = pos.match(/(\d+)%/g) || []
  const x = pcts[0] ? parseInt(pcts[0]) : 50
  const y = pcts[1] ? parseInt(pcts[1]) : 20
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
  return 'Albumas'
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

// ── Section components ─────────────────────────────────────────────

function SectionTitle({ label, count, cta }: { label: string; count?: number; cta?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4 sm:mb-6">
      <div className="flex items-baseline gap-3">
        <h2 className="font-['Outfit',sans-serif] text-[20px] font-black leading-none text-[var(--text-primary)] sm:text-[24px] lg:text-[28px]">
          {label}
        </h2>
        {typeof count === 'number' && (
          <span className="font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--text-faint)] sm:text-[16px]">
            {count}
          </span>
        )}
      </div>
      {cta}
    </div>
  )
}

// ── Hero: cinematic, minimal content (name + genre + country only) ──

function Hero({
  artist, heroImage, genres, loaded, flag, active,
}: {
  artist: any; heroImage: string | null; genres: Genre[]; loaded: boolean; flag: string; active: string | null
}) {
  return (
    <section className="relative overflow-hidden" style={{ height: 'clamp(380px,60vw,620px)' }}>
      {heroImage ? (
        <div className="absolute inset-0">
          <img
            src={heroImage}
            alt=""
            className="block h-full w-full animate-[apHeroZoom_28s_ease-in-out_infinite_alternate] object-cover"
            style={(() => {
              const p = parseCoverPos(artist.cover_image_position || 'center 20%')
              return {
                objectPosition: `${p.x}% ${p.y}%`,
                transformOrigin: `${p.x}% ${p.y}%`,
              }
            })()}
          />
        </div>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--bg-body)] to-[var(--bg-surface)]" />
      )}

      {/* Strong bottom-up gradient for legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-body)] via-[var(--bg-body)]/70 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-[var(--bg-body)]/60 to-transparent lg:from-[var(--bg-body)]/40" />

      <div
        className={[
          'relative mx-auto flex h-full max-w-[1200px] flex-col justify-end px-4 pb-6 sm:px-6 sm:pb-8 lg:px-8 lg:pb-12',
          'transition-[opacity,transform] duration-700 ease-out',
          loaded ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
        ].join(' ')}
      >
        {/* small meta above name */}
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-['Outfit',sans-serif] text-[11px] font-bold uppercase tracking-[0.18em] text-white/70 sm:text-[12px]">
          {artist.country && (
            <span>
              {flag && <span className="mr-1.5 text-[1.3em] leading-none">{flag}</span>}
              {artist.country}
            </span>
          )}
          {active && <span>· {active}</span>}
          {artist.type === 'solo' && <span>· Atlikėjas</span>}
          {artist.type === 'group' && <span>· Grupė</span>}
        </div>

        <h1
          className="mb-4 font-['Outfit',sans-serif] font-black leading-[0.95] tracking-[-0.03em] text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
          style={{ fontSize: 'clamp(2.2rem,7.5vw,5rem)' }}
        >
          {artist.name}
          {artist.is_verified && (
            <span className="ml-3 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#3b82f6] align-middle sm:h-7 sm:w-7">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="#fff"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
            </span>
          )}
        </h1>

        {/* genres */}
        {genres.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {genres.slice(0, 6).map(g => (
              <span
                key={g.id}
                className="rounded-full border border-white/15 bg-white/10 px-3 py-1 font-['Outfit',sans-serif] text-[12px] font-semibold text-white/85 backdrop-blur-[6px]"
              >
                {g.name}
              </span>
            ))}
          </div>
        )}
      </div>

      <style>{`@keyframes apHeroZoom{0%{transform:scale(1)}100%{transform:scale(1.06)}}`}</style>
    </section>
  )
}

// ── ActionBar: primary CTAs (Play / Like / Follow + socials) ────────

function ActionBar({
  likes, onLike, onPlay, canPlay, links, website,
}: {
  likes: number; onLike: () => void; onPlay: () => void; canPlay: boolean
  links: { platform: string; url: string }[]; website?: string | null
}) {
  return (
    <div className="sticky top-0 z-30 -mt-px border-y border-[var(--border-default)] bg-[var(--bg-body)]/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6 sm:py-4 lg:px-8">
        <button
          onClick={onPlay}
          disabled={!canPlay}
          className="group inline-flex h-11 items-center gap-2 rounded-full bg-[var(--accent-orange)] px-5 font-['Outfit',sans-serif] text-[14px] font-extrabold uppercase tracking-wide text-white shadow-[0_6px_24px_rgba(249,115,22,0.35)] transition-all hover:shadow-[0_10px_30px_rgba(249,115,22,0.5)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          <svg className="h-4 w-4 transition-transform group-hover:scale-110" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          Klausytis
        </button>

        <button
          onClick={onLike}
          disabled={!likes}
          className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] px-4 font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)] disabled:cursor-default disabled:opacity-60"
        >
          <svg className="h-4 w-4 text-[var(--accent-orange)]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          {likes.toLocaleString('lt-LT')}
        </button>

        <button
          className="hidden h-11 items-center gap-2 rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] px-4 font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)] sm:inline-flex"
          title="Sekti atlikėją"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
          Sekti
        </button>

        {/* Social links pushed to the right */}
        <div className="ml-auto flex items-center gap-1">
          {links.map(l => {
            const p = SOC[l.platform]
            if (!p) return null
            return (
              <a
                key={l.platform}
                href={l.url}
                target="_blank"
                rel="noopener"
                title={p.l}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
              >
                <svg viewBox="0 0 24 24" fill={p.c} width="16" height="16"><path d={p.d} /></svg>
              </a>
            )
          })}
          {website && (
            <a
              href={website}
              target="_blank"
              rel="noopener"
              title="Oficiali svetainė"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" /></svg>
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// ── StatsStrip: key metrics row ────────────────────────────────────

function StatsStrip({ stats }: { stats: { value: string; label: string }[] }) {
  if (!stats.length) return null
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
      <div className="grid grid-cols-2 gap-4 rounded-2xl border border-[var(--border-default)] bg-[var(--card-bg)] p-6 sm:grid-cols-3 md:grid-cols-5 md:gap-6 md:p-8">
        {stats.map(s => (
          <div key={s.label} className="text-center">
            <div className="font-['Outfit',sans-serif] text-[28px] font-black leading-none text-[var(--text-primary)] sm:text-[32px] lg:text-[38px]">
              {s.value}
            </div>
            <div className="mt-1.5 font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.15em] text-[var(--text-muted)] sm:text-[11px]">
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── TopTracks: numbered Spotify-style list ──────────────────────────

function TopTracks({ tracks, onPlay, playingId }: {
  tracks: Track[]; onPlay: (id: number) => void; playingId: number | null
}) {
  if (!tracks.length) return null
  return (
    <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-2 sm:p-3">
      <div className="divide-y divide-[var(--border-subtle)]">
        {tracks.slice(0, 10).map((t, i) => {
          const v = yt(t.video_url)
          const th = t.cover_url || (v ? `https://img.youtube.com/vi/${v}/mqdefault.jpg` : null)
          const active = playingId === t.id
          return (
            <div
              key={t.id}
              className={[
                'group flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors sm:gap-4 sm:px-3',
                active ? 'bg-[rgba(249,115,22,0.08)]' : 'hover:bg-[var(--bg-hover)]',
              ].join(' ')}
            >
              {/* Number / play button */}
              <button
                onClick={() => v && onPlay(t.id)}
                disabled={!v}
                className={[
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-["Outfit",sans-serif] text-[14px] font-extrabold transition-all sm:h-10 sm:w-10',
                  v ? 'cursor-pointer' : 'cursor-default',
                  active
                    ? 'bg-[var(--accent-orange)] text-white shadow-[0_4px_16px_rgba(249,115,22,0.4)]'
                    : v
                      ? 'bg-transparent text-[var(--text-muted)] group-hover:bg-[var(--accent-orange)] group-hover:text-white'
                      : 'text-[var(--text-faint)]',
                ].join(' ')}
              >
                {active ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                ) : v ? (
                  <>
                    <span className="group-hover:hidden">{i + 1}</span>
                    <svg className="hidden h-3.5 w-3.5 group-hover:block" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                  </>
                ) : (
                  <span>{i + 1}</span>
                )}
              </button>

              {/* Cover */}
              {th ? (
                <img src={th} alt="" className="h-11 w-11 shrink-0 rounded-md object-cover sm:h-12 sm:w-12" />
              ) : (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[var(--cover-placeholder)] text-[var(--text-faint)] sm:h-12 sm:w-12">♪</div>
              )}

              {/* Title */}
              <Link href={`/lt/daina/${t.slug}/${t.id}/`} className="min-w-0 flex-1 no-underline">
                <div className={[
                  'truncate font-["Outfit",sans-serif] text-[14px] font-bold leading-tight sm:text-[15px]',
                  active ? 'text-[var(--accent-orange)]' : 'text-[var(--text-primary)]',
                ].join(' ')}>
                  {t.title}
                </div>
                {t.type && (
                  <div className="mt-0.5 text-[11px] capitalize text-[var(--text-muted)]">{t.type}</div>
                )}
              </Link>

              {/* Video badge */}
              {v && (
                <div className="hidden shrink-0 rounded-full bg-[rgba(249,115,22,0.1)] px-2.5 py-1 font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-wider text-[var(--accent-orange)] sm:block">
                  Video
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── FeaturedPlayer: embedded player for the active track ───────────

function FeaturedPlayer({ track, onClose }: { track: Track; onClose: () => void }) {
  const vid = yt(track.video_url)
  if (!vid) return null
  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-[var(--border-default)] bg-black">
      <div className="flex items-center justify-between border-b border-white/5 bg-black/60 px-4 py-2 backdrop-blur">
        <div className="min-w-0">
          <div className="font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.15em] text-[var(--accent-orange)]">Groja</div>
          <div className="truncate font-['Outfit',sans-serif] text-[14px] font-bold text-white">{track.title}</div>
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/70 transition-colors hover:bg-white/20"
          aria-label="Uždaryti"
        >
          ✕
        </button>
      </div>
      <iframe
        key={vid}
        src={`https://www.youtube.com/embed/${vid}?autoplay=1&rel=0`}
        allow="autoplay;encrypted-media"
        allowFullScreen
        className="block aspect-video w-full border-0"
      />
    </div>
  )
}

// ── VideoCard: grid tile with YouTube thumbnail ────────────────────

function VideoCard({ track, onPlay }: { track: Track; onPlay: (id: number) => void }) {
  const vid = yt(track.video_url)
  if (!vid) return null
  return (
    <button
      onClick={() => onPlay(track.id)}
      className="group relative block overflow-hidden rounded-xl border border-[var(--border-default)] bg-black text-left transition-all hover:-translate-y-0.5 hover:border-[var(--border-strong)]"
    >
      <div className="relative aspect-video overflow-hidden">
        <img
          src={`https://img.youtube.com/vi/${vid}/hqdefault.jpg`}
          alt={track.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-orange)] shadow-[0_6px_24px_rgba(249,115,22,0.5)] transition-transform group-hover:scale-110">
            <svg className="ml-0.5 h-6 w-6 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          </div>
        </div>
      </div>
      <div className="px-3 py-2.5">
        <div className="truncate font-['Outfit',sans-serif] text-[13px] font-bold text-[var(--text-primary)] sm:text-[14px]">{track.title}</div>
      </div>
    </button>
  )
}

// ── AlbumCard: larger grid tile for discography ────────────────────

function AlbumCard({ a }: { a: Album }) {
  const type = aType(a)
  return (
    <Link
      href={`/lt/albumas/${a.slug}/${a.id}/`}
      className="group block no-underline"
    >
      <div className="relative overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--cover-placeholder)] transition-all group-hover:border-[var(--border-strong)] group-hover:shadow-[0_12px_32px_rgba(0,0,0,0.3)]">
        <div className="aspect-square">
          {a.cover_image_url ? (
            <img
              src={a.cover_image_url}
              alt={a.title}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-4xl text-[var(--text-faint)]">💿</div>
          )}
        </div>
        {type !== 'Albumas' && (
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
        <div className="truncate font-['Outfit',sans-serif] text-[13px] font-bold text-[var(--text-primary)] sm:text-[14px]">
          {a.title}
        </div>
      </div>
    </Link>
  )
}

// ── EventCard: compact or full depending on variant ────────────────

function EventCard({ e, variant = 'upcoming' }: { e: any; variant?: 'upcoming' | 'past' }) {
  const d = new Date(e.start_date)
  const venue = [e.venue_name, e.city].filter(Boolean).join(', ')
  const href = `/renginiai/${e.slug}`
  const monthShort = d.toLocaleDateString('lt-LT', { month: 'short' }).replace('.', '')
  const [coverFailed, setCoverFailed] = useState(false)
  const hasCover = !!e.cover_image_url && !coverFailed
  const isPast = variant === 'past'

  if (isPast) {
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
          {venue && (
            <div className="mt-0.5 truncate text-[12px] text-[var(--text-muted)]">{venue}</div>
          )}
        </div>
      </Link>
    )
  }

  // Upcoming — large prominent card
  return (
    <Link
      href={href}
      className="group flex min-w-[280px] flex-col overflow-hidden rounded-2xl border border-[rgba(249,115,22,0.25)] bg-gradient-to-br from-[rgba(249,115,22,0.08)] to-transparent no-underline transition-all hover:-translate-y-0.5 hover:border-[rgba(249,115,22,0.5)] hover:shadow-[0_12px_32px_rgba(249,115,22,0.15)] sm:min-w-0"
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
        {venue && (
          <div className="mt-1 truncate text-[12px] text-[var(--text-secondary)] sm:text-[13px]">📍 {venue}</div>
        )}
      </div>
    </Link>
  )
}

// ── Gallery: responsive grid with lightbox ─────────────────────────

function Gallery({ photos }: { photos: { url: string; caption?: string }[] }) {
  const [lb, setLb] = useState<number | null>(null)
  if (!photos.length) return null
  const limited = photos.slice(0, 12)

  return (
    <>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4 md:gap-2">
        {limited.map((p, i) => (
          <button
            key={i}
            onClick={() => setLb(i)}
            className={[
              'group relative block aspect-square overflow-hidden rounded-xl border-0 bg-transparent p-0',
              i === 0 ? 'md:col-span-2 md:row-span-2' : '',
            ].join(' ')}
          >
            <img
              src={p.url}
              alt={p.caption || ''}
              className="h-full w-full cursor-zoom-in object-cover transition-transform duration-500 group-hover:scale-[1.05]"
            />
            <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
          </button>
        ))}
      </div>

      {lb !== null && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/95 p-4 backdrop-blur-xl"
          onClick={() => setLb(null)}
        >
          <button
            onClick={e => { e.stopPropagation(); setLb(null) }}
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full border-0 bg-white/10 text-xl text-white/70 transition-colors hover:bg-white/20"
          >
            ✕
          </button>
          {lb > 0 && (
            <button
              onClick={e => { e.stopPropagation(); setLb(lb - 1) }}
              className="absolute left-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border-0 bg-white/10 text-3xl text-white/70 transition-colors hover:bg-white/20 sm:left-6"
            >
              ‹
            </button>
          )}
          <div className="flex max-h-[90vh] max-w-[92vw] flex-col items-center" onClick={e => e.stopPropagation()}>
            <img src={limited[lb].url} alt="" className="max-h-[82vh] max-w-full rounded-lg object-contain" />
            {limited[lb].caption && (
              <p className="mt-2 text-[12px] text-white/50">{limited[lb].caption}</p>
            )}
          </div>
          {lb < limited.length - 1 && (
            <button
              onClick={e => { e.stopPropagation(); setLb(lb + 1) }}
              className="absolute right-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border-0 bg-white/10 text-3xl text-white/70 transition-colors hover:bg-white/20 sm:right-6"
            >
              ›
            </button>
          )}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 font-['Outfit',sans-serif] text-[12px] font-bold text-white/40">
            {lb + 1}/{limited.length}
          </div>
        </div>
      )}
    </>
  )
}

// ── Main ────────────────────────────────────────────────────────────

export default function ArtistProfileClient({
  artist, heroImage, genres, links, photos, albums, tracks, members, followers, likeCount,
  news, events, similar, newTracks, topVideos, hasNewMusic,
  legacyCommunity, legacyThreads = [], legacyNews = [],
}: Props) {
  const [pid, setPid] = useState<number | null>(null)
  const [df, setDf] = useState('all')
  const [loaded, setLoaded] = useState(false)
  const [likesModalOpen, setLikesModalOpen] = useState(false)
  useEffect(() => { setLoaded(true) }, [])

  const musicRef = useRef<HTMLDivElement>(null)

  const flag = FLAGS[artist.country] || (artist.country ? '🌍' : '')
  const hasBio = artist.description?.trim().length > 10
  const solo = artist.type === 'solo'
  const age = solo && artist.birth_date
    ? Math.floor((Date.now() - new Date(artist.birth_date).getTime()) / 31557600000)
    : null
  const active = artist.active_from ? `${artist.active_from}–${artist.active_until || 'dabar'}` : null
  const authoritativeLegacy = (artist as any).legacy_like_count ?? legacyCommunity?.artistLikes ?? 0
  const likes = likeCount + followers + authoritativeLegacy
  const allLikesUsers: any[] = legacyCommunity?.allArtistFans || []
  const atypes = [...new Set(albums.map(aType))]
  const fAlbums = df === 'all' ? albums : albums.filter(a => aType(a) === df)

  // Top tracks for list — prefer videos (most engaging) else first N
  const topTracksForList = topVideos.length >= 5 ? topVideos.slice(0, 10) : tracks.slice(0, 10)

  const now = Date.now()
  const upcomingEvents = events.filter((e: any) => new Date(e.start_date).getTime() >= now)
  const pastEvents = events.filter((e: any) => new Date(e.start_date).getTime() < now)

  const playingTrack = pid !== null && pid > 0 ? tracks.find(t => t.id === pid) || topTracksForList.find(t => t.id === pid) : null

  const canPlay = topVideos.length > 0 || newTracks.some(t => yt(t.video_url))

  const handlePlay = () => {
    // Open the first playable track
    const first = topTracksForList.find(t => yt(t.video_url)) || newTracks.find(t => yt(t.video_url))
    if (first) {
      setPid(first.id)
      musicRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  // Stats strip data
  const statsData: { value: string; label: string }[] = []
  if (likes > 0) statsData.push({ value: likes.toLocaleString('lt-LT'), label: 'Gerbėjai' })
  if (albums.length > 0) statsData.push({ value: String(albums.length), label: 'Albumai' })
  if (tracks.length > 0) statsData.push({ value: `${tracks.length}+`, label: 'Dainos' })
  if (events.length > 0) statsData.push({ value: String(events.length), label: 'Renginiai' })
  const totalForumCount = legacyThreads.length + legacyNews.length
  if (totalForumCount > 0) statsData.push({ value: String(totalForumCount), label: 'Diskusijos' })

  return (
    <div className="min-h-screen bg-[var(--bg-body)] font-['DM_Sans',system-ui,sans-serif] text-[var(--text-primary)] antialiased">
      <Hero
        artist={artist}
        heroImage={heroImage}
        genres={genres}
        loaded={loaded}
        flag={flag}
        active={active}
      />

      <ActionBar
        likes={likes}
        onLike={() => likes > 0 && setLikesModalOpen(true)}
        onPlay={handlePlay}
        canPlay={canPlay}
        links={links}
        website={artist.website}
      />

      {statsData.length > 0 && <StatsStrip stats={statsData} />}

      {/* Likes modal */}
      <LikesModal
        open={likesModalOpen}
        onClose={() => setLikesModalOpen(false)}
        title={`„${artist.name}" patinka`}
        count={likes}
        users={allLikesUsers}
      />

      <main className="mx-auto max-w-[1200px] space-y-12 px-4 pb-20 sm:space-y-16 sm:px-6 lg:px-8">

        {/* ═ Upcoming events ═ */}
        {upcomingEvents.length > 0 && (
          <section>
            <SectionTitle label="Artimiausi renginiai" count={upcomingEvents.length} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {upcomingEvents.map((e: any) => <EventCard key={e.id} e={e} variant="upcoming" />)}
            </div>
          </section>
        )}

        {/* ═ Music ═ */}
        {(topTracksForList.length > 0 || topVideos.length > 0) && (
          <section ref={musicRef}>
            <SectionTitle label="Muzika" />

            {/* Featured player when something is playing */}
            {playingTrack && <FeaturedPlayer track={playingTrack} onClose={() => setPid(null)} />}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_minmax(0,440px)]">
              {/* Top tracks list */}
              {topTracksForList.length > 0 && (
                <div>
                  <div className="mb-3 font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.15em] text-[var(--accent-orange)]">
                    {hasNewMusic && newTracks.length > 0 ? 'Populiariausios dainos' : 'Populiariausios dainos'}
                  </div>
                  <TopTracks tracks={topTracksForList} onPlay={setPid} playingId={pid} />
                </div>
              )}

              {/* New releases video grid */}
              {hasNewMusic && newTracks.length > 0 && (
                <div>
                  <div className="mb-3 font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.15em] text-[var(--accent-orange)]">
                    Nauja muzika
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {newTracks.filter(t => yt(t.video_url)).slice(0, 4).map(t => (
                      <VideoCard key={t.id} track={t} onPlay={setPid} />
                    ))}
                  </div>
                </div>
              )}

              {/* Videos grid if no new music */}
              {!(hasNewMusic && newTracks.length > 0) && topVideos.length > 1 && (
                <div>
                  <div className="mb-3 font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.15em] text-[var(--accent-orange)]">
                    Video
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {topVideos.slice(0, 4).map(t => (
                      <VideoCard key={t.id} track={t} onPlay={setPid} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ═ Discography ═ */}
        {albums.length > 0 && (
          <section>
            <SectionTitle label="Diskografija" count={albums.length} />

            {atypes.length > 1 && (
              <div className="mb-5 flex flex-wrap gap-1.5 sm:gap-2">
                {['all', ...atypes].map(t => {
                  const count = t === 'all' ? albums.length : albums.filter(a => aType(a) === t).length
                  return (
                    <button
                      key={t}
                      onClick={() => setDf(t)}
                      className={[
                        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-["Outfit",sans-serif] text-[12px] font-bold transition-all',
                        df === t
                          ? 'border-[var(--accent-orange)] bg-[var(--accent-orange)] text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)]'
                          : 'border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]',
                      ].join(' ')}
                    >
                      {t === 'all' ? 'Visi' : t}
                      <span className={df === t ? 'opacity-80' : 'text-[var(--text-faint)]'}>· {count}</span>
                    </button>
                  )
                })}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {fAlbums.map(a => <AlbumCard key={a.id} a={a} />)}
            </div>
          </section>
        )}

        {/* ═ About ═ */}
        {(hasBio || members.length > 0) && (
          <section>
            <SectionTitle label="Apie" />
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px] lg:gap-12">
              {/* Bio */}
              <div className="min-w-0">
                {hasBio ? (
                  <div
                    className="text-[15px] leading-[1.75] text-[var(--text-secondary)] [&_a:hover]:text-[var(--accent-blue)] [&_a]:text-[var(--accent-link)] [&_a]:underline [&_em]:italic [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-4 [&_strong]:font-bold [&_strong]:text-[var(--text-primary)] [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6"
                    dangerouslySetInnerHTML={{ __html: artist.description }}
                  />
                ) : (
                  <div className="text-[14px] text-[var(--text-muted)]">Biografinio teksto dar nėra.</div>
                )}

                {/* Band members below bio */}
                {!solo && members.length > 0 && (
                  <div className="mt-8">
                    <div className="mb-3 font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.15em] text-[var(--text-muted)]">
                      Nariai · {members.length}
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
                      {members.map(m => (
                        <Link
                          key={m.id}
                          href={`/atlikejai/${m.slug}`}
                          className="flex items-center gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--card-bg)] p-2.5 no-underline transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
                        >
                          {m.cover_image_url ? (
                            <img src={m.cover_image_url} alt={m.name} className="h-10 w-10 shrink-0 rounded-full object-cover" />
                          ) : (
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--cover-placeholder)] font-['Outfit',sans-serif] text-[13px] font-black text-[var(--text-faint)]">
                              {m.name[0]}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-bold text-[var(--text-primary)]">{m.name}</div>
                            {m.member_from && (
                              <div className="text-[10px] text-[var(--text-muted)]">{m.member_from}–{m.member_until || 'dabar'}</div>
                            )}
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Facts sidebar */}
              <aside className="space-y-4 self-start rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 lg:sticky lg:top-24">
                <div className="font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.15em] text-[var(--text-muted)]">
                  Faktai
                </div>
                <dl className="space-y-3">
                  {active && (
                    <Fact label={solo ? 'Karjera' : 'Susikūrę'} value={active} />
                  )}
                  {solo && age && <Fact label="Amžius" value={`${age} m.`} />}
                  {artist.country && <Fact label="Kilmė" value={`${flag} ${artist.country}`} />}
                  {genres.length > 0 && (
                    <div>
                      <dt className="mb-1.5 font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--text-faint)]">Žanrai</dt>
                      <dd className="flex flex-wrap gap-1">
                        {genres.map(g => (
                          <span key={g.id} className="rounded-md border border-[var(--border-default)] bg-[var(--card-bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)]">
                            {g.name}
                          </span>
                        ))}
                      </dd>
                    </div>
                  )}
                  <Fact label="Albumai" value={String(albums.length)} />
                  <Fact label="Dainos" value={`${tracks.length}+`} />
                </dl>
              </aside>
            </div>
          </section>
        )}

        {/* ═ Past events ═ */}
        {pastEvents.length > 0 && (
          <section>
            <SectionTitle label="Įvykę renginiai" count={pastEvents.length} />
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {pastEvents.map((e: any) => <EventCard key={e.id} e={e} variant="past" />)}
            </div>
          </section>
        )}

        {/* ═ Gallery ═ */}
        {photos.length > 0 && (
          <section>
            <SectionTitle label="Galerija" count={photos.length} />
            <Gallery photos={photos} />
          </section>
        )}

        {/* ═ Community: Discussions ═ */}
        <section>
          <SectionTitle label="Diskusijos" count={legacyThreads.length || undefined} />
          {legacyThreads.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
              {legacyThreads.map((t, i) => {
                const title = t.title || slugToForumTitle(t.slug)
                const pc = t.post_count ?? 0
                return (
                  <Link
                    key={t.legacy_id}
                    href={`/diskusijos/tema/${t.legacy_id}`}
                    className={[
                      'flex items-center gap-4 px-4 py-4 no-underline transition-colors hover:bg-[var(--bg-hover)] sm:px-5',
                      i < legacyThreads.length - 1 ? 'border-b border-[var(--border-subtle)]' : '',
                    ].join(' ')}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[rgba(59,130,246,0.2)] bg-[rgba(59,130,246,0.1)] text-[#3b82f6] sm:h-12 sm:w-12">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" /></svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--text-primary)] sm:text-[15px]">{title}</div>
                      <div className="mt-1 text-[12px] text-[var(--text-muted)]">
                        #{t.legacy_id}
                        {pc > 0 && <> · {pc} komentarai</>}
                      </div>
                    </div>
                    <svg className="shrink-0 text-[var(--text-faint)] transition-colors group-hover:text-[var(--text-muted)]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </Link>
                )
              })}
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

        {/* ═ Legacy news ═ */}
        {legacyNews.length > 0 && (
          <section>
            <SectionTitle label="Naujienos" count={legacyNews.length} />
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
                      {pc > 0 && (
                        <div className="ml-auto text-[11px] font-semibold text-[var(--text-muted)]">{pc} komentarai</div>
                      )}
                    </div>
                    <div className="text-[14px] font-bold leading-snug text-[var(--text-primary)] sm:text-[15px]">{title}</div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* ═ Similar artists ═ */}
        {similar.length > 0 && (
          <section>
            <SectionTitle label="Panaši muzika" />
            <div className="flex snap-x gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {similar.map((a: any) => (
                <Link
                  key={a.id}
                  href={`/atlikejai/${a.slug}`}
                  className="w-[110px] shrink-0 snap-start text-center no-underline sm:w-[130px]"
                >
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

// ── Fact: small dl row in facts sidebar ────────────────────────────

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--text-faint)]">
        {label}
      </dt>
      <dd className="mt-0.5 font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--text-primary)]">
        {value}
      </dd>
    </div>
  )
}
