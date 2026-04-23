'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import LikesModal from '@/components/LikesModal'
import type { LegacyLikeUser } from '@/components/LegacyLikesPanel'

/* ═══════════════════════════════════════════════════════════════════
   Artist profile — mobile-first responsive layout.
   Tailwind classes for layout + breakpoints; CSS custom properties
   (defined in globals.css) drive theme colors.
   ═══════════════════════════════════════════════════════════════════ */

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

// ── SectionHeader: shared pattern "LABEL · N ━━━━━" ────────────────

function SectionHeader({ label, count, accent }: { label: string; count?: number; accent?: string }) {
  return (
    <div className="mb-3 flex items-center gap-3 font-['Outfit',sans-serif] text-[10px] sm:text-[11px] font-extrabold uppercase tracking-[0.14em] text-[var(--section-label)]">
      <span>
        {label}
        {typeof count === 'number' && <span className="ml-1.5 text-[var(--text-muted)]">· {count}</span>}
      </span>
      <span className="h-px flex-1 bg-[var(--section-line)]" />
      {accent && <span className="text-[var(--accent-orange)]">{accent}</span>}
    </div>
  )
}

// ── Spark: tiny activity graph in hero ─────────────────────────────

function Spark({ data, w = 130, h = 28 }: { data: ChartPt[]; w?: number; h?: number }) {
  if (data.length < 3) return null
  const max = Math.max(...data.map(d => d.value))
  const min = Math.min(...data.map(d => d.value))
  const r = max - min || 1
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * w},${h - ((d.value - min) / r) * (h - 4) - 2}`).join(' ')
  return (
    <svg width={w} height={h + 10} viewBox={`0 0 ${w} ${h + 10}`} className="block">
      <defs>
        <linearGradient id="ap-sg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(249,115,22,.15)" />
          <stop offset="100%" stopColor="rgba(249,115,22,0)" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill="url(#ap-sg)" />
      <polyline points={pts} fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinejoin="round" />
      <text x="0" y={h + 9} fill="var(--text-faint)" fontSize="7" fontFamily="Outfit,sans-serif" fontWeight="700">{data[0].year}</text>
      <text x={w} y={h + 9} fill="var(--text-faint)" fontSize="7" fontFamily="Outfit,sans-serif" fontWeight="700" textAnchor="end">{data[data.length - 1].year}</text>
    </svg>
  )
}

// ── MusicRow: video + playlist (stacks on mobile) ──────────────────

function MusicRow({ label, list, playingId, onPlay }: {
  label: string; list: Track[]; playingId: number | null; onPlay: (id: number) => void
}) {
  const [idx, setIdx] = useState(0)
  if (!list.length) return null
  const cur = list[idx]
  const vid = yt(cur?.video_url)

  return (
    <div className="mb-4">
      {label && (
        <div className="mb-1.5 font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--accent-orange)]">
          {label}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] overflow-hidden rounded-[10px] border border-[var(--border-default)] bg-[var(--player-bg)]">
        {/* Video area */}
        <div className="bg-black">
          {playingId === cur?.id && vid ? (
            <iframe
              src={`https://www.youtube.com/embed/${vid}?autoplay=1&rel=0`}
              allow="autoplay;encrypted-media"
              allowFullScreen
              className="block aspect-video w-full border-0"
            />
          ) : (
            <div className="relative aspect-video cursor-pointer overflow-hidden" onClick={() => vid && onPlay(cur.id)}>
              {vid ? (
                <img src={`https://img.youtube.com/vi/${vid}/hqdefault.jpg`} alt="" className="block h-full w-full object-cover" />
              ) : (
                <div className="aspect-video w-full bg-[#111]" />
              )}
              {vid && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(249,115,22,.85)] shadow-[0_4px_20px_rgba(249,115,22,.35)]">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="border-t border-[rgba(249,115,22,.04)] bg-[rgba(249,115,22,.03)] px-3 py-2 text-[12px] font-extrabold text-[var(--text-primary)] sm:text-[13px]">
            {cur.title}
          </div>
        </div>

        {/* Playlist */}
        <div
          className="max-h-[260px] overflow-y-auto md:max-h-[380px]"
          style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border-default) transparent' }}
        >
          {list.map((t, i) => {
            const v = yt(t.video_url)
            const th = t.cover_url || (v ? `https://img.youtube.com/vi/${v}/default.jpg` : null)
            const active = idx === i
            return (
              <div
                key={t.id}
                onClick={() => { setIdx(i); onPlay(-1) }}
                className={[
                  'flex cursor-pointer items-center gap-2 border-b border-[var(--border-subtle)] px-3 py-2 transition-colors',
                  active ? 'bg-[var(--playlist-active-bg)]' : 'hover:bg-[var(--bg-hover)]',
                ].join(' ')}
              >
                <span
                  className={[
                    'w-5 shrink-0 text-center font-["Outfit",sans-serif] text-[11px] font-semibold',
                    active ? 'text-[var(--accent-orange)]' : 'text-[var(--text-faint)]',
                  ].join(' ')}
                >
                  {i + 1}
                </span>
                {th ? (
                  <img src={th} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
                ) : (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-[var(--cover-placeholder)] text-[11px] text-[var(--text-faint)]">♪</div>
                )}
                <div className="min-w-0 flex-1">
                  <div
                    className={[
                      'truncate text-[12px] font-bold sm:text-[13px]',
                      active ? 'text-[var(--accent-orange)]' : 'text-[var(--text-secondary)]',
                    ].join(' ')}
                  >
                    {t.title}
                  </div>
                </div>
                {v && (
                  <div
                    className={[
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                      active ? 'bg-[var(--accent-orange)] text-white' : 'bg-[var(--cover-placeholder)] text-[var(--text-faint)]',
                    ].join(' ')}
                  >
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Gallery: responsive photo grid with lightbox ──────────────────

function Gallery({ photos }: { photos: { url: string; caption?: string }[] }) {
  const [lb, setLb] = useState<number | null>(null)
  if (!photos.length) return null

  const limited = photos.slice(0, 10)

  return (
    <>
      {/* Mobile: 2-col equal grid; sm: 3-col equal; md+: first photo spans 2×2 */}
      <div className="grid grid-cols-2 gap-1 overflow-hidden rounded-xl sm:grid-cols-3 md:grid-cols-4">
        {limited.map((p, i) => (
          <button
            key={i}
            onClick={() => setLb(i)}
            className={[
              'group relative block aspect-square overflow-hidden border-0 bg-transparent p-0',
              i === 0 ? 'md:col-span-2 md:row-span-2' : '',
            ].join(' ')}
          >
            <img
              src={p.url}
              alt={p.caption || ''}
              className="h-full w-full cursor-zoom-in object-cover transition-transform duration-300 group-hover:scale-[1.04]"
            />
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
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border-0 bg-white/10 text-white/70 hover:bg-white/20"
            aria-label="Uždaryti"
          >
            ✕
          </button>
          {lb > 0 && (
            <button
              onClick={e => { e.stopPropagation(); setLb(lb - 1) }}
              className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border-0 bg-white/10 text-2xl text-white/70 hover:bg-white/20 sm:left-4"
              aria-label="Ankstesnė"
            >
              ‹
            </button>
          )}
          <div className="flex max-h-[90vh] max-w-[92vw] flex-col items-center" onClick={e => e.stopPropagation()}>
            <img src={limited[lb].url} alt="" className="max-h-[80vh] max-w-full rounded object-contain" />
            {limited[lb].caption && (
              <p className="mt-2 text-[11px] text-white/30">{limited[lb].caption}</p>
            )}
          </div>
          {lb < limited.length - 1 && (
            <button
              onClick={e => { e.stopPropagation(); setLb(lb + 1) }}
              className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border-0 bg-white/10 text-2xl text-white/70 hover:bg-white/20 sm:right-4"
              aria-label="Kita"
            >
              ›
            </button>
          )}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 font-['Outfit',sans-serif] text-[10px] font-semibold text-white/30">
            {lb + 1}/{limited.length}
          </div>
        </div>
      )}
    </>
  )
}

// ── EventCard: responsive event row or grid card ──────────────────

function EventCard({ e, variant = 'upcoming-row' }: { e: any; variant?: 'upcoming-row' | 'past-grid' }) {
  const d = new Date(e.start_date)
  const isPast = d.getTime() < Date.now()
  const venue = [e.venue_name, e.city].filter(Boolean).join(', ')
  const href = `/renginiai/${e.slug}`
  const monthShort = d.toLocaleDateString('lt-LT', { month: 'short' }).replace('.', '')
  const [coverFailed, setCoverFailed] = useState(false)
  const hasCover = !!e.cover_image_url && !coverFailed

  if (variant === 'past-grid') {
    return (
      <Link
        href={href}
        className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 no-underline transition-all hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
      >
        {hasCover ? (
          <img
            src={e.cover_image_url}
            alt={e.title}
            referrerPolicy="no-referrer"
            onError={() => setCoverFailed(true)}
            className="h-12 w-12 shrink-0 rounded-lg border border-[var(--border-subtle)] object-cover"
          />
        ) : (
          <div className="min-w-[48px] rounded-lg bg-[var(--card-bg)] px-1 py-1.5 text-center">
            <div className="text-[9px] font-bold capitalize leading-tight text-[var(--text-muted)]">{monthShort} {d.getFullYear()}</div>
            <div className="font-['Outfit',sans-serif] text-[18px] font-black leading-none text-[var(--hero-name)]">{d.getDate()}</div>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-bold leading-tight text-[var(--text-primary)]">{e.title}</div>
          <div className="mt-0.5 truncate font-['Outfit',sans-serif] text-[11px] font-semibold text-[var(--text-muted)]">
            {d.getFullYear()}-{String(d.getMonth() + 1).padStart(2, '0')}-{String(d.getDate()).padStart(2, '0')}
            {venue && <> · {venue}</>}
          </div>
        </div>
      </Link>
    )
  }

  // Upcoming row — horizontal scroll snap
  return (
    <Link
      href={href}
      className={[
        'flex min-w-[260px] shrink-0 snap-start items-center gap-3 rounded-xl border px-4 py-3 no-underline transition-all',
        isPast
          ? 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
          : 'border-[rgba(249,115,22,.22)] bg-[rgba(249,115,22,.04)] hover:border-[rgba(249,115,22,.4)]',
      ].join(' ')}
    >
      <div className={[
        'min-w-[48px] rounded-lg px-1 py-1.5 text-center',
        isPast ? 'bg-[var(--card-bg)]' : 'bg-[rgba(249,115,22,.1)]',
      ].join(' ')}>
        <div className={[
          'text-[9px] font-bold capitalize leading-tight',
          isPast ? 'text-[var(--text-muted)]' : 'text-[var(--accent-orange)]',
        ].join(' ')}>
          {monthShort} {d.getFullYear()}
        </div>
        <div className="font-['Outfit',sans-serif] text-[20px] font-black leading-none text-[var(--hero-name)]">{d.getDate()}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-bold leading-tight text-[var(--hero-name)]">{e.title}</div>
        {venue && (
          <div className="mt-0.5 truncate text-[11px] text-[var(--text-secondary)]">{venue}</div>
        )}
      </div>
    </Link>
  )
}

// ── Main ────────────────────────────────────────────────────────────

export default function ArtistProfileClient({
  artist, heroImage, genres, links, photos, albums, tracks, members, followers, likeCount,
  news, events, similar, newTracks, topVideos, chartData, hasNewMusic,
  legacyCommunity, legacyThreads = [], legacyNews = [],
}: Props) {
  const hasLegacyThreads = legacyThreads.length > 0
  const hasLegacyNews = legacyNews.length > 0
  const [pid, setPid] = useState<number | null>(null)
  const [df, setDf] = useState('all')
  const [loaded, setLoaded] = useState(false)
  const [likesModalOpen, setLikesModalOpen] = useState(false)
  useEffect(() => { setLoaded(true) }, [])

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

  const now = Date.now()
  const upcomingEvents = events.filter((e: any) => new Date(e.start_date).getTime() >= now)
  const pastEvents = events.filter((e: any) => new Date(e.start_date).getTime() < now)

  return (
    <div className="min-h-screen bg-[var(--bg-body)] font-['DM_Sans',system-ui,sans-serif] text-[var(--text-primary)] antialiased">
      {/* ═══ HERO ═══ */}
      <section className="relative h-[clamp(360px,52vw,560px)] overflow-hidden">
        {heroImage ? (
          <div className="absolute inset-0">
            <img
              src={heroImage}
              alt=""
              className="block h-full w-full animate-[apHeroZoom_24s_ease-in-out_infinite_alternate] object-cover"
              style={(() => {
                const p = parseCoverPos(artist.cover_image_position || 'center 20%')
                return {
                  objectPosition: `${p.x}% ${p.y}%`,
                  transform: `scale(${p.zoom})`,
                  transformOrigin: `${p.x}% ${p.y}%`,
                }
              })()}
            />
          </div>
        ) : artist.cover_image_url ? (
          <div className="absolute inset-0">
            <img
              src={artist.cover_image_url}
              alt=""
              className="block h-full w-full object-cover"
              style={{ filter: 'blur(40px) brightness(.2) saturate(1.3)', transform: 'scale(1.4)' }}
            />
          </div>
        ) : (
          <div className="absolute inset-0 bg-[var(--bg-body)]" />
        )}

        {/* Gradient overlays — vertical + horizontal */}
        <div className="absolute inset-0 bg-[var(--hero-gradient-v)]" />
        <div className="absolute inset-0 bg-[var(--hero-gradient-h)]" />

        {/* Content */}
        <div
          className={[
            'relative mx-auto flex h-full max-w-[1280px] items-end justify-between gap-4 px-4 pb-6 sm:px-6 sm:pb-8 lg:px-8',
            'transition-[opacity,transform] duration-500',
            loaded ? 'opacity-100' : 'translate-y-3 opacity-0',
          ].join(' ')}
        >
          <div className="min-w-0 flex-1">
            <h1
              className="mb-2.5 font-['Outfit',sans-serif] font-black leading-[1.05] tracking-[-0.04em] text-[var(--hero-name)] drop-shadow-[0_2px_20px_rgba(0,0,0,0.4)]"
              style={{ fontSize: 'clamp(1.75rem,6.2vw,3.75rem)' }}
            >
              {flag && <span className="mr-1.5 align-middle text-[0.65em]">{flag}</span>}
              {artist.name}
              {artist.is_verified && (
                <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#3b82f6] align-middle">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="#fff"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
                </span>
              )}
            </h1>

            {/* Genre + likes + members pills (wrap) */}
            <div className="flex flex-wrap items-center gap-1.5">
              {genres.map(g => (
                <span
                  key={g.id}
                  className="rounded-full border border-[var(--hero-tag-border)] bg-[var(--hero-tag-bg)] px-2.5 py-1 font-['Outfit',sans-serif] text-[11px] font-bold text-[var(--hero-tag-text)] backdrop-blur-[4px]"
                >
                  {g.name}
                </span>
              ))}

              <button
                onClick={() => likes > 0 && setLikesModalOpen(true)}
                title={likes > 0 ? `Pažiūrėti visus ${likes.toLocaleString('lt-LT')} vartotojus` : 'Dar niekas nepaspaudė'}
                className={[
                  'inline-flex items-center gap-1.5 rounded-full border border-[rgba(249,115,22,.25)]',
                  'bg-[rgba(249,115,22,.1)] px-3 py-1 font-["Outfit",sans-serif] text-[11px] font-extrabold text-[var(--accent-orange)] transition-colors',
                  likes > 0 ? 'cursor-pointer hover:border-[rgba(249,115,22,.45)] hover:bg-[rgba(249,115,22,.2)]' : 'cursor-default',
                ].join(' ')}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
                {likes > 0 ? likes.toLocaleString('lt-LT') : '0'}
              </button>

              {solo && members.map(m => (
                <Link
                  key={m.id}
                  href={`/atlikejai/${m.slug}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--hero-tag-border)] bg-[var(--hero-tag-bg)] px-2.5 py-1 font-['Outfit',sans-serif] text-[11px] font-bold text-[var(--hero-name)] no-underline backdrop-blur-[4px]"
                >
                  {m.cover_image_url ? (
                    <img src={m.cover_image_url} alt="" className="h-4 w-4 rounded-full object-cover" />
                  ) : (
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--hero-tag-bg)] text-[8px]">{m.name[0]}</span>
                  )}
                  <span>{m.name}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Sparkline — hidden on mobile, shown from sm+ */}
          {chartData.length > 5 && (
            <div className="hidden shrink-0 rounded-[10px] border border-[var(--hero-chip-border)] bg-[var(--hero-chip-bg)] px-3 pb-0.5 pt-2 backdrop-blur-[8px] sm:block">
              <div className="mb-0.5 font-['Outfit',sans-serif] text-[7px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-faint)]">Populiarumas</div>
              <Spark data={chartData} />
            </div>
          )}
        </div>

        <style>{`@keyframes apHeroZoom{0%{transform:scale(1)}100%{transform:scale(1.05)}}`}</style>
      </section>

      {/* ═══ CONTENT ═══ */}
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">

        {/* Upcoming events — horizontal scroll */}
        {upcomingEvents.length > 0 && (
          <section className="pt-6 sm:pt-8">
            <SectionHeader label="Artimiausi renginiai" count={upcomingEvents.length} />
            <div
              className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {upcomingEvents.map((e: any) => <EventCard key={e.id} e={e} />)}
            </div>
          </section>
        )}

        {/* Music player */}
        {(topVideos.length > 0 || newTracks.length > 0) && (
          <section className="pt-6 sm:pt-8">
            <SectionHeader label="Muzika" />
            {hasNewMusic && newTracks.length > 0 && (
              <MusicRow label="Nauja muzika" list={newTracks.slice(0, 6)} playingId={pid} onPlay={setPid} />
            )}
            {topVideos.length > 0 && (
              <MusicRow label={hasNewMusic ? 'Populiariausia' : ''} list={topVideos} playingId={pid} onPlay={setPid} />
            )}
          </section>
        )}

        {/* Likes modal trigger */}
        <LikesModal
          open={likesModalOpen}
          onClose={() => setLikesModalOpen(false)}
          title={`„${artist.name}" patinka`}
          count={likes}
          users={allLikesUsers}
        />

        {/* Discography */}
        {albums.length > 0 && (
          <section className="pt-6 sm:pt-8">
            <SectionHeader label="Diskografija" count={albums.length} />

            {atypes.length > 1 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {['all', ...atypes].map(t => (
                  <button
                    key={t}
                    onClick={() => setDf(t)}
                    className={[
                      'rounded-full border px-2.5 py-1 font-["Outfit",sans-serif] text-[10px] font-bold transition-colors',
                      df === t
                        ? 'border-[var(--accent-orange)] bg-[var(--accent-orange)] text-white'
                        : 'border-[var(--border-default)] bg-transparent text-[var(--text-faint)] hover:border-[var(--border-strong)] hover:text-[var(--text-muted)]',
                    ].join(' ')}
                  >
                    {t === 'all' ? 'Visi' : t}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-2.5 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8">
              {fAlbums.map(a => (
                <Link
                  key={a.id}
                  href={`/lt/albumas/${a.slug}/${a.id}/`}
                  className="group block overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--card-bg)] no-underline transition-all hover:-translate-y-0.5 hover:border-[var(--border-strong)]"
                >
                  <div className="relative aspect-square overflow-hidden bg-[var(--cover-placeholder)]">
                    {a.cover_image_url ? (
                      <img src={a.cover_image_url} alt={a.title} className="block h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[15px] text-[var(--text-faint)]">💿</div>
                    )}
                    {aType(a) !== 'Albumas' && (
                      <span className="absolute right-1 top-1 rounded bg-black/60 px-1 py-0.5 text-[8px] font-extrabold uppercase text-[#b0bdd4]">
                        {aType(a)}
                      </span>
                    )}
                  </div>
                  <div className="px-2 py-2">
                    <div className="truncate font-['Outfit',sans-serif] text-[11px] font-bold text-[var(--text-primary)] sm:text-[12px]">
                      {a.title}
                    </div>
                    <div className="mt-0.5 text-[10px] font-semibold text-[var(--text-secondary)] sm:text-[11px]">
                      {a.year || '—'}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Bio + News — stacks on mobile, 2-col at lg */}
        {(hasBio || news.length > 0) && (
          <section className="pt-6 sm:pt-8">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px] lg:items-start lg:gap-8">
              <div className="min-w-0">
                {/* Stats chip row */}
                <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg border border-[var(--border-default)] bg-[rgba(255,255,255,.02)] p-3 sm:inline-flex sm:flex-wrap sm:gap-4">
                  {active && <StatCell label="Aktyvumas" value={active} />}
                  {solo && age && <StatCell label="Amžius" value={`${age} m.`} />}
                  {artist.country && <StatCell label="Šalis" value={`${flag} ${artist.country}`} />}
                  {albums.length > 0 && <StatCell label="Albumai" value={String(albums.length)} />}
                  {tracks.length > 0 && <StatCell label="Dainos" value={`${tracks.length}+`} />}
                </div>

                {hasBio && (
                  <>
                    <SectionHeader label="Apie" />
                    <div
                      className="text-[14px] leading-[1.75] text-[var(--text-secondary)] [&_a]:text-[var(--accent-link)] [&_a]:underline [&_a:hover]:text-[var(--accent-blue)] [&_em]:italic [&_p]:mb-3 [&_strong]:font-bold [&_strong]:text-[var(--text-primary)] [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5"
                      dangerouslySetInnerHTML={{ __html: artist.description }}
                    />
                  </>
                )}

                {/* Social links */}
                {(links.length > 0 || artist.website) && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {links.map(l => {
                      const p = SOC[l.platform]
                      return (
                        <a
                          key={l.platform}
                          href={l.url}
                          target="_blank"
                          rel="noopener"
                          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] px-2.5 py-1.5 no-underline hover:border-[var(--border-strong)]"
                        >
                          {p && (
                            <svg viewBox="0 0 24 24" fill={p.c} width="13" height="13"><path d={p.d} /></svg>
                          )}
                          <span className="font-['Outfit',sans-serif] text-[11px] font-bold text-[var(--text-secondary)]">
                            {p?.l || l.platform}
                          </span>
                        </a>
                      )
                    })}
                    {artist.website && (
                      <a
                        href={artist.website}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] px-2.5 py-1.5 no-underline hover:border-[var(--border-strong)]"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" width="13" height="13"><circle cx="12" cy="12" r="10" /></svg>
                        <span className="font-['Outfit',sans-serif] text-[11px] font-bold text-[var(--text-secondary)]">Svetainė</span>
                      </a>
                    )}
                  </div>
                )}

                {/* Band members */}
                {!solo && members.length > 0 && (
                  <div className="mt-6">
                    <SectionHeader label="Nariai" count={members.length} />
                    <div className="flex flex-wrap gap-2">
                      {members.map(m => (
                        <Link
                          key={m.id}
                          href={`/atlikejai/${m.slug}`}
                          className="flex items-center gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--card-bg)] px-2.5 py-1.5 no-underline hover:border-[var(--border-strong)]"
                        >
                          {m.cover_image_url ? (
                            <img src={m.cover_image_url} alt={m.name} className="h-7 w-7 shrink-0 rounded-full object-cover" />
                          ) : (
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--cover-placeholder)] font-['Outfit',sans-serif] text-[10px] font-black text-[var(--text-faint)]">
                              {m.name[0]}
                            </div>
                          )}
                          <div>
                            <div className="text-[11px] font-bold text-[var(--text-primary)]">{m.name}</div>
                            {m.member_from && (
                              <div className="text-[9px] text-[var(--text-muted)]">
                                {m.member_from}–{m.member_until || 'dabar'}
                              </div>
                            )}
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* News sidebar */}
              {news.length > 0 && (
                <aside className="rounded-xl border border-[var(--border-default)] bg-[var(--card-bg)] p-3">
                  <SectionHeader label="Naujienos" />
                  <div className="space-y-0">
                    {news.map((n, i) => (
                      <Link
                        key={n.id}
                        href={`/news/${n.slug}`}
                        className={[
                          'flex gap-2.5 py-2 no-underline transition-opacity hover:opacity-80',
                          i < news.length - 1 ? 'border-b border-[var(--border-subtle)]' : '',
                        ].join(' ')}
                      >
                        {n.image_small_url ? (
                          <img src={n.image_small_url} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
                        ) : (
                          <div className="h-10 w-10 shrink-0 rounded bg-[var(--cover-placeholder)]" />
                        )}
                        <div className="min-w-0">
                          <div className="text-[11px] font-bold leading-snug text-[var(--text-secondary)]">{n.title}</div>
                          <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                            {new Date(n.published_at).toLocaleDateString('lt-LT')}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </aside>
              )}
            </div>
          </section>
        )}

        {/* Gallery */}
        {photos.length > 0 && (
          <section className="pt-6 sm:pt-8">
            <SectionHeader label="Galerija" count={photos.length} />
            <Gallery photos={photos} />
          </section>
        )}

        {/* Past events */}
        {pastEvents.length > 0 && (
          <section className="pt-6 sm:pt-8">
            <SectionHeader label="Įvykę renginiai" count={pastEvents.length} />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {pastEvents.map((e: any) => <EventCard key={e.id} e={e} variant="past-grid" />)}
            </div>
          </section>
        )}

        {/* Legacy news */}
        {hasLegacyNews && (
          <section className="pt-6 sm:pt-8">
            <SectionHeader label="Naujienos" count={legacyNews.length} />
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {legacyNews.slice(0, 12).map(n => {
                const title = n.title || slugToForumTitle(n.slug)
                const pc = n.post_count ?? 0
                return (
                  <Link
                    key={n.legacy_id}
                    href={`/diskusijos/tema/${n.legacy_id}`}
                    className="flex flex-col gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 no-underline transition-all hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[rgba(249,115,22,.2)] bg-[rgba(249,115,22,.1)] text-[var(--accent-orange)]">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M20 3H4a2 2 0 00-2 2v14a2 2 0 002 2h16a2 2 0 002-2V5a2 2 0 00-2-2zm-9 14H5v-2h6v2zm0-4H5v-2h6v2zm0-4H5V7h6v2zm8 8h-6v-2h6v2zm0-4h-6V7h6v6z" /></svg>
                      </div>
                      <div className="font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">Naujiena</div>
                      {pc > 0 && (
                        <div className="ml-auto font-['Outfit',sans-serif] text-[10px] font-bold text-[var(--text-muted)]">{pc} komentarai</div>
                      )}
                    </div>
                    <div className="text-[13px] font-bold leading-snug text-[var(--text-primary)]">{title}</div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* Discussions */}
        <section className="pt-6 sm:pt-8">
          <SectionHeader label="Diskusijos" count={hasLegacyThreads ? legacyThreads.length : undefined} />
          {hasLegacyThreads ? (
            <div className="overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
              {legacyThreads.map((t, i) => {
                const title = t.title || slugToForumTitle(t.slug)
                const pc = t.post_count ?? 0
                return (
                  <Link
                    key={t.legacy_id}
                    href={`/diskusijos/tema/${t.legacy_id}`}
                    className={[
                      'flex items-center gap-3 px-3 py-3 no-underline transition-colors hover:bg-[var(--bg-hover)] sm:px-4',
                      i < legacyThreads.length - 1 ? 'border-b border-[var(--border-subtle)]' : '',
                    ].join(' ')}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[rgba(59,130,246,.18)] bg-[rgba(59,130,246,.08)] text-[#3b82f6]">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" /></svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-bold text-[var(--text-primary)] sm:text-[13px]">{title}</div>
                      <div className="mt-0.5 font-['Outfit',sans-serif] text-[10px] text-[var(--text-muted)]">
                        diskusija · #{t.legacy_id}
                        {pc > 0 && <> · {pc} komentarai</>}
                      </div>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="2" className="shrink-0">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </Link>
                )
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--border-default)] p-6 text-center">
              <div className="mb-1 text-[13px] font-bold text-[var(--text-muted)]">Dar nėra diskusijų apie {artist.name}</div>
              <div className="text-[11px] text-[var(--text-faint)]">Būk pirmas — pradėk diskusiją!</div>
              <button className="mt-3 cursor-pointer rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] px-4 py-1.5 font-['Outfit',sans-serif] text-[11px] font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)]">
                + Nauja diskusija
              </button>
            </div>
          )}
        </section>

        {/* Similar artists */}
        {similar.length > 0 && (
          <section className="pt-6 pb-12 sm:pt-8">
            <SectionHeader label="Panaši muzika" />
            <div
              className="flex snap-x gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {similar.map((a: any) => (
                <Link
                  key={a.id}
                  href={`/atlikejai/${a.slug}`}
                  className="w-[84px] shrink-0 snap-start text-center no-underline sm:w-[96px]"
                >
                  {a.cover_image_url ? (
                    <img
                      src={a.cover_image_url}
                      alt={a.name}
                      className="mx-auto mb-1.5 block h-[60px] w-[60px] rounded-full border-2 border-[var(--border-default)] object-cover sm:h-[72px] sm:w-[72px]"
                    />
                  ) : (
                    <div className="mx-auto mb-1.5 flex h-[60px] w-[60px] items-center justify-center rounded-full bg-[var(--cover-placeholder)] font-['Outfit',sans-serif] text-[16px] font-black text-[var(--text-faint)] sm:h-[72px] sm:w-[72px]">
                      {a.name[0]}
                    </div>
                  )}
                  <div className="truncate text-[11px] font-bold text-[var(--text-secondary)]">{a.name}</div>
                </Link>
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  )
}

// ── Small utilities ─────────────────────────────────────────────────

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-[60px] flex-col">
      <span className="font-['Outfit',sans-serif] text-[13px] font-extrabold text-[var(--text-primary)]">{value}</span>
      <span className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.05em] text-[var(--text-muted)]">{label}</span>
    </div>
  )
}
