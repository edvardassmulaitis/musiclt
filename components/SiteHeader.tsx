'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HeaderAuth } from '@/components/HeaderAuth'
import { NotificationsBell } from '@/components/NotificationsBell'
import { MessagesBell } from '@/components/MessagesBell'
import { MasterSearch } from '@/components/MasterSearch'
import { useSite } from '@/components/SiteContext'
import { proxyImg } from '@/lib/img-proxy'
import { GENRE_COLORS } from '@/lib/genre-colors'

/* ──────────────────────────────────────────────────────────────────
 * Top meniu — 5 sekcijos su DINAMINIAIS rich preview dropdown'ais.
 *
 * Desktop hover atveria didelį panel'ą su realiais atlikėjais,
 * albumais, renginiais ar naujienomis (fetch'inta iš /api/nav-preview).
 *
 * Mobile drawer: 5 didelės gradient kortelės.
 * ────────────────────────────────────────────────────────────────── */

type NavItem = {
  key: 'muzika' | 'topai' | 'renginiai' | 'naujienos' | 'pramogos' | 'bendruomene' | 'skelbimai'
  label: string
  href: string
  match: string[]
  desc: string
  accent: string
  icon: React.ReactNode
}

type NavPreview = {
  artistsLt:    { id: number; slug: string; name: string; image: string | null }[]
  artistsWorld: { id: number; slug: string; name: string; image: string | null }[]
  albums:       { id: number; slug: string; title: string; image: string | null; year: number | null; artist: string; artistSlug: string }[]
  tracks:       { id: number; title: string; image: string | null; year: number | null; artist: string; artistSlug: string }[]
  events:       { id: number; slug: string; title: string; date: string; venue: string | null; image: string | null }[]
  news:         { id: number; slug: string; title: string; image: string | null; date: string }[]
}

const I = {
  music: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
  calendar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>,
  fun: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  trophy: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M17 4h3v3a3 3 0 0 1-3 3M7 4H4v3a3 3 0 0 0 3 3"/></svg>,
  vote: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 12 2 2 4-4"/><rect x="3" y="4" width="18" height="16" rx="2"/></svg>,
  award: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="9" r="6"/><path d="M8.21 13.89 7 22l5-3 5 3-1.21-8.11"/></svg>,
  song: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
  community: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  market: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h18l-2 13H5L3 3z"/><circle cx="9" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/></svg>,
  boombox: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="18" height="12" rx="2"/><circle cx="8" cy="14" r="2"/><circle cx="16" cy="14" r="2"/><path d="M7 8V5a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v3"/></svg>,
  game: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 12h4M8 10v4"/><circle cx="15" cy="11" r="1" fill="currentColor"/><circle cx="17.5" cy="13.5" r="1" fill="currentColor"/><path d="M17.32 5H6.68A4.68 4.68 0 0 0 2 9.68V14a4 4 0 0 0 6.7 2.95l.6-.55h5.4l.6.55A4 4 0 0 0 22 14V9.68A4.68 4.68 0 0 0 17.32 5Z"/></svg>,
  quiz: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  chat: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3.5-7.1L21 4l-1 4A9 9 0 0 1 21 12Z"/></svg>,
  forum: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 8h2a2 2 0 0 1 2 2v9l-3-3h-7a2 2 0 0 1-2-2v-1"/><path d="M3 13V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6l-3 3Z"/></svg>,
  blog: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3v6h6"/><path d="M19 9v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7Z"/><path d="M9 13h6M9 17h4"/></svg>,
  vinyl: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>,
  news: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8V6Z"/></svg>,
  trending: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  /* ── Genre / žanro ikonos ── */
  mic: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>,
  headphones: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 14a9 9 0 0 1 18 0"/><rect x="3" y="14" width="4" height="7" rx="1.5"/><rect x="17" y="14" width="4" height="7" rx="1.5"/></svg>,
  equalizer: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="3" x2="6" y2="21"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="18" y1="3" x2="18" y2="21"/><line x1="3" y1="9" x2="9" y2="9"/><line x1="9" y1="15" x2="15" y2="15"/><line x1="15" y1="6" x2="21" y2="6"/></svg>,
  piano: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="18" height="12" rx="1.5"/><line x1="9" y1="6" x2="9" y2="14"/><line x1="15" y1="6" x2="15" y2="14"/><rect x="7" y="6" width="2" height="6" fill="currentColor"/><rect x="13" y="6" width="2" height="6" fill="currentColor"/></svg>,
  flame: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>,
  heart: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/></svg>,
  shuffle: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>,
  guitar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18 6.5 20.5a2.12 2.12 0 0 1-3-3L6 15"/><path d="m9 9 5 5L15 9 9 9z"/><path d="m22 2-9 9"/><path d="M9 9c-.5-1.5-2-2.5-3.5-2-1.5.5-2.5 2-2 3.5L4 12"/></svg>,
  festival: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21V8l9-5 9 5v13"/><path d="M9 21V12h6v9"/><circle cx="12" cy="9" r="1.5"/></svg>,
  gallery: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>,
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
}

const NAV: NavItem[] = [
  {
    key: 'muzika',
    label: 'Muzika',
    href: '/muzika',
    match: ['/muzika', '/atlikejai', '/albumai', '/zanrai', '/dainos', '/lt'],
    desc: 'Atlikėjai, albumai, dainos',
    accent: '#f59e0b',
    icon: I.music,
  },
  {
    key: 'topai',
    label: 'Topai',
    href: '/topai',
    match: ['/topai', '/topas', '/top40', '/top30', '/balsavimai', '/dienos-daina', '/apdovanojimai'],
    desc: 'Reitingai, balsavimai, apdovanojimai',
    accent: '#ef4444',
    icon: I.trophy,
  },
  {
    key: 'renginiai',
    label: 'Renginiai',
    href: '/renginiai',
    match: ['/renginiai', '/festivaliai', '/galerija'],
    desc: 'Koncertai, festivaliai',
    accent: '#3b82f6',
    icon: I.calendar,
  },
  {
    key: 'naujienos',
    label: 'Naujienos',
    href: '/naujienos',
    match: ['/naujienos', '/news'],
    desc: 'Releases, interviu, recenzijos',
    accent: '#0ea5e9',
    icon: I.news,
  },
  {
    key: 'pramogos',
    label: 'Pramogos',
    href: '/pramogos',
    match: ['/pramogos', '/boombox', '/zaidimai', '/kvizai'],
    desc: 'Boombox, žaidimai, kvizai',
    accent: '#f97316',
    icon: I.fun,
  },
  {
    key: 'bendruomene',
    label: 'Bendruomenė',
    href: '/bendruomene',
    match: ['/bendruomene', '/diskusijos', '/blogas', '/pokalbiai', '/vartotojai'],
    desc: 'Pokalbiai, diskusijos, blogai',
    accent: '#8b5cf6',
    icon: I.community,
  },
  {
    key: 'skelbimai',
    label: 'Skelbimai',
    href: '/skelbimai',
    match: ['/skelbimai'],
    desc: 'Vinilas, instrumentai, paslaugos',
    accent: '#10b981',
    icon: I.market,
  },
]

/* ── Header chrome icons ── */
const SunIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
)
const MoonIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
)
const SearchIcon = ({ size = 16 }: { size?: number } = {}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
)
const ArrowRight = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
)

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `${r}, ${g}, ${b}`
}

function formatEventDate(iso: string): string {
  try {
    const d = new Date(iso)
    const months = ['saus', 'vas', 'kov', 'bal', 'geg', 'birž', 'liep', 'rugp', 'rugs', 'spal', 'lapk', 'gruod']
    return `${d.getDate()} ${months[d.getMonth()]}`
  } catch { return '' }
}

/* Image slot su gražiu fallback'u — gradient su accent + glyph ikona centre.
   Naudojama, kai arba nėra duomenų, arba paveiksliukas dar nesisukrovė. */
function ImageBox({
  src, accent, glyph, className, children,
}: {
  src?: string | null
  accent: string
  glyph?: React.ReactNode
  className?: string
  children?: React.ReactNode
}) {
  const proxied = src ? proxyImg(src) : null
  const rgb = hexToRgb(accent)
  const fallbackBg = `
    radial-gradient(circle at 30% 20%, rgba(${rgb}, 0.55) 0%, transparent 50%),
    radial-gradient(circle at 80% 80%, rgba(${rgb}, 0.30) 0%, transparent 60%),
    linear-gradient(135deg, rgba(${rgb}, 0.40) 0%, rgba(${rgb}, 0.15) 100%)
  `
  return (
    <span
      className={className}
      style={proxied ? { backgroundImage: `url(${proxied})` } : { background: fallbackBg }}
    >
      {!proxied && glyph && <span className="sh-fallback-glyph">{glyph}</span>}
      {children}
    </span>
  )
}

/* ────────────────────────────────────────────────────────────────
 * Per-section dropdown content components
 * ──────────────────────────────────────────────────────────────── */

/* LT vėliavos / pasaulio mėlynos juostelės indikatorius eilutės pradžiai. */
function RowStripe({ kind }: { kind: 'lt' | 'world' }) {
  if (kind === 'lt') {
    return (
      <span className="sh-stripe sh-stripe-lt" aria-hidden>
        <span style={{ flex: 1, background: '#FDBA12' }} />
        <span style={{ flex: 1, background: '#006A44' }} />
        <span style={{ flex: 1, background: '#C1272D' }} />
      </span>
    )
  }
  return <span className="sh-stripe sh-stripe-world" aria-hidden />
}

function MuzikaPanel({ data, accent }: { data: NavPreview | null; accent: string }) {
  const artistsLt    = data?.artistsLt    || []
  const artistsWorld = data?.artistsWorld || []

  // 8 main stiliai iš lib/genre-colors.ts (atitinka GENRES iš constants.ts).
  // Spalvos centralizuotos — vėliau naudosim ir žanro page'uose, badge'uose.
  const styles = GENRE_COLORS

  // Atlikėjų eilutė be header'io — flag stripe (LT vėliava arba pasaulinė
  // mėlyna) kairėje yra pakankamas šalies indikatorius. Daugiau link'as
  // dešinėje (homepage stiliumi — orange, no underline).
  const renderArtistRow = (list: typeof artistsLt, kind: 'lt' | 'world') => (
    <div className="sh-artist-row">
      <RowStripe kind={kind} />
      <div className="sh-strip">
        {(list.length > 0 ? list : Array(6).fill(null)).map((a, i) => (
          <Link
            key={a?.id || `${kind}-${i}`}
            href={a ? `/atlikejai/${a.slug}` : '/atlikejai'}
            className="sh-mini sh-mini-xl"
          >
            <ImageBox
              src={a?.image}
              accent={accent}
              glyph={I.music}
              className="sh-mini-img"
            />
            <span className="sh-mini-title sh-mini-title-2">
              {a?.name || <span style={{ opacity: 0.45 }}>Atlikėjas</span>}
            </span>
          </Link>
        ))}
      </div>
      <Link
        href={kind === 'lt' ? '/atlikejai?country=lt' : '/atlikejai?country=world'}
        className="sh-more-link"
      >
        Daugiau →
      </Link>
    </div>
  )

  // 8 main stiliai su SVG ikonomis (no emojis) — atspindi žanro charakterį
  const STYLE_ICONS: Record<string, React.ReactNode> = {
    'Alternatyvioji muzika':     I.headphones,
    'Elektroninė, šokių muzika': I.equalizer,
    "Hip-hop'o muzika":          I.mic,
    'Kitų stilių muzika':        I.shuffle,
    'Pop, R&B muzika':           I.heart,
    'Rimtoji muzika':            I.piano,
    'Roko muzika':               I.guitar,
    'Sunkioji muzika':           I.flame,
  }

  return (
    <div className="sh-panel sh-panel-muzika" style={{ width: 760 }}>

      {/* ── ATLIKĖJAI: LT + užsienio eilutės be header'ių, su flag stripe ── */}
      {renderArtistRow(artistsLt, 'lt')}
      <div style={{ height: 10 }} />
      {renderArtistRow(artistsWorld, 'world')}

      {/* ── STILIAI — Spotify-style bold colored cards (spalva = vizualas) ── */}
      <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
        <div className="sh-panel-head">
          <h2 className="sh-panel-h2">Stiliai</h2>
          <Link href="/zanrai" className="sh-more-link">Daugiau →</Link>
        </div>
        <div className="sh-style-grid">
          {styles.map(s => (
            <Link
              key={s.name}
              href={s.href}
              className="sh-style-card"
              style={{ ['--it-rgb' as any]: s.rgb }}
              title={s.name}
            >
              <span className="sh-style-card-name">{s.short}</span>
              <span className="sh-style-card-deco" aria-hidden>
                {STYLE_ICONS[s.name] || I.shuffle}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

/* Mini slugify dainos URL kompozavimui */
function quickSlug(s: string): string {
  if (!s) return 'daina'
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim().replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 100)
}

function TopaiPanel({ accent }: { accent: string }) {
  return (
    <div className="sh-panel" style={{ minWidth: 480 }}>
      <div className="sh-panel-section">
        <span className="sh-panel-section-title">Reitingai</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Link href="/topai" className="sh-feature-card" style={{ ['--it-rgb' as any]: hexToRgb('#ef4444') }}>
          <span className="sh-feature-icon-sm">{I.trophy}</span>
          <span className="sh-feature-title-sm">Topai</span>
          <span className="sh-feature-desc-sm">Savaitės, mėnesio, all-time</span>
        </Link>
        <Link href="/balsavimai" className="sh-feature-card" style={{ ['--it-rgb' as any]: hexToRgb('#ec4899') }}>
          <span className="sh-feature-icon-sm">{I.vote}</span>
          <span className="sh-feature-title-sm">Balsavimai</span>
          <span className="sh-feature-desc-sm">Aktualūs reitingai</span>
        </Link>
        <Link href="/dienos-daina" className="sh-feature-card" style={{ ['--it-rgb' as any]: hexToRgb('#10b981') }}>
          <span className="sh-feature-icon-sm">{I.song}</span>
          <span className="sh-feature-title-sm">Dienos daina</span>
          <span className="sh-feature-desc-sm">Redakcijos pasirinkimas</span>
        </Link>
        <Link href="/apdovanojimai" className="sh-feature-card" style={{ ['--it-rgb' as any]: hexToRgb('#eab308') }}>
          <span className="sh-feature-icon-sm">{I.award}</span>
          <span className="sh-feature-title-sm">Apdovanojimai</span>
          <span className="sh-feature-desc-sm">M.A.M.A., Bravo, kt.</span>
          <span className="sh-soon-pill">Greitai</span>
        </Link>
      </div>
    </div>
  )
}

function RenginiaiPanel({ data, accent }: { data: NavPreview | null; accent: string }) {
  const events = data?.events.slice(0, 4) || []
  const placeholderTitles = ['Koncertas', 'Vakarėlis', 'Festivalis', 'Renginys']
  return (
    <div className="sh-panel" style={{ minWidth: 600 }}>
      <div className="sh-panel-section">
        <span className="sh-panel-section-title">Artimiausi renginiai</span>
        <Link href="/renginiai" className="sh-panel-section-more">Daugiau <ArrowRight size={11}/></Link>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {(events.length > 0 ? events : Array(4).fill(null)).map((e, i) => (
          <Link
            key={e?.id || i}
            href={e ? `/renginiai/${e.slug}` : '/renginiai'}
            className="sh-event-card"
          >
            <ImageBox
              src={e?.image}
              accent={accent}
              glyph={I.calendar}
              className="sh-event-img"
            >
              {e?.date && <span className="sh-event-date">{formatEventDate(e.date)}</span>}
            </ImageBox>
            <span className="sh-event-info">
              <span className="sh-event-title">
                {e?.title || <span style={{ opacity: 0.5 }}>{placeholderTitles[i] || 'Renginys'}</span>}
              </span>
              {e?.venue && <span className="sh-event-venue">{e.venue}</span>}
            </span>
          </Link>
        ))}
      </div>
      <div className="sh-panel-shortcuts">
        <Link href="/festivaliai" className="sh-shortcut">Festivaliai →</Link>
        <Link href="/galerija" className="sh-shortcut">Foto galerija →</Link>
      </div>
    </div>
  )
}

function PramogosPanel({ accent }: { accent: string }) {
  return (
    <div className="sh-panel" style={{ minWidth: 640 }}>
      <div className="sh-panel-section">
        <span className="sh-panel-section-title">Pramogos</span>
      </div>

      {/* Boombox hero — abstract gradient su decorative shapes */}
      <Link href="/boombox" className="sh-hero-card" style={{ ['--it-rgb' as any]: hexToRgb('#f97316') }}>
        <span className="sh-hero-deco-circle sh-hero-deco-1" />
        <span className="sh-hero-deco-circle sh-hero-deco-2" />
        <span className="sh-hero-deco-circle sh-hero-deco-3" />
        <span className="sh-hero-content">
          <span className="sh-hero-eyebrow">Šiandien karšta</span>
          <span className="sh-hero-icon">{I.boombox}</span>
          <span className="sh-hero-title">Boombox</span>
          <span className="sh-hero-desc">
            Atrask atlikėjus swipe stiliumi — kaip muzikinis Tinder'is.
            Įvertink, sutik, klausyk.
          </span>
          <span className="sh-hero-cta">Žaisk dabar <ArrowRight size={13}/></span>
        </span>
      </Link>

      {/* Sub feature kortelės */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
        <Link href="/zaidimai" className="sh-feature-card" style={{ ['--it-rgb' as any]: hexToRgb('#6366f1') }}>
          <span className="sh-feature-icon-sm">{I.game}</span>
          <span className="sh-feature-title-sm">Žaidimai</span>
          <span className="sh-feature-desc-sm">Atspėk dainą per 5s</span>
          <span className="sh-soon-pill">Greitai</span>
        </Link>
        <Link href="/kvizai" className="sh-feature-card" style={{ ['--it-rgb' as any]: hexToRgb('#14b8a6') }}>
          <span className="sh-feature-icon-sm">{I.quiz}</span>
          <span className="sh-feature-title-sm">Kvizai</span>
          <span className="sh-feature-desc-sm">LT muzikos žinovams</span>
          <span className="sh-soon-pill">Greitai</span>
        </Link>
      </div>

      <div className="sh-panel-shortcuts">
        <Link href="/dienos-daina" className="sh-shortcut">Dienos daina →</Link>
        <Link href="/topai" className="sh-shortcut">Topai →</Link>
      </div>
    </div>
  )
}

function NaujienosPanel({ data, accent }: { data: NavPreview | null; accent: string }) {
  const news = data?.news.slice(0, 4) || []
  const placeholderTitles = [
    'Naujasis lietuviškos scenos pulsas',
    'Interviu su Lietuvos atlikėjais',
    'Šios savaitės releases ir naujienos',
    'Recenzija: paskutinis albumas',
  ]
  return (
    <div className="sh-panel" style={{ minWidth: 720 }}>
      <div className="sh-panel-section">
        <span className="sh-panel-section-title">Naujausios naujienos</span>
        <Link href="/naujienos" className="sh-panel-section-more">Daugiau <ArrowRight size={11}/></Link>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {(news.length > 0 ? news : Array(4).fill(null)).map((n, i) => (
          <Link
            key={n?.id || i}
            href={n ? `/news/${n.slug}` : '/naujienos'}
            className="sh-album-row"
          >
            <ImageBox
              src={n?.image}
              accent={accent}
              glyph={I.blog}
              className="sh-album-cover"
            />
            <span className="sh-album-info">
              <span className="sh-album-title" style={{ WebkitLineClamp: 2 }}>
                {n?.title || <span style={{ opacity: 0.55 }}>{placeholderTitles[i] || 'Naujiena'}</span>}
              </span>
            </span>
          </Link>
        ))}
      </div>
      <div className="sh-panel-shortcuts">
        <Link href="/naujienos" className="sh-shortcut">Visos →</Link>
        <Link href="/naujienos?type=interview" className="sh-shortcut">Interviu →</Link>
        <Link href="/naujienos?type=review" className="sh-shortcut">Recenzijos →</Link>
        <Link href="/naujienos?type=release" className="sh-shortcut">Releases →</Link>
      </div>
    </div>
  )
}

function BendruomenePanel({ accent }: { data?: NavPreview | null; accent: string }) {
  return (
    <div className="sh-panel" style={{ minWidth: 480 }}>
      <div className="sh-panel-section">
        <span className="sh-panel-section-title">Bendruomenė</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Link href="/pokalbiai" className="sh-bigshortcut" style={{ ['--it-rgb' as any]: hexToRgb('#06b6d4') }}>
          <span className="sh-bigshortcut-icon">{I.chat}</span>
          <span>
            <span className="sh-bigshortcut-title">Pokalbiai</span>
            <span className="sh-bigshortcut-desc">Privačios žinutės ir grupės</span>
          </span>
        </Link>
        <Link href="/diskusijos" className="sh-bigshortcut" style={{ ['--it-rgb' as any]: hexToRgb('#8b5cf6') }}>
          <span className="sh-bigshortcut-icon">{I.forum}</span>
          <span>
            <span className="sh-bigshortcut-title">Diskusijos</span>
            <span className="sh-bigshortcut-desc">Forumo temos ir debatai</span>
          </span>
        </Link>
        <Link href="/blogas" className="sh-bigshortcut" style={{ ['--it-rgb' as any]: hexToRgb('#a855f7') }}>
          <span className="sh-bigshortcut-icon">{I.blog}</span>
          <span>
            <span className="sh-bigshortcut-title">Tinklaraščiai</span>
            <span className="sh-bigshortcut-desc">Vartotojų straipsniai</span>
          </span>
        </Link>
        <Link href="/vartotojai" className="sh-bigshortcut" style={{ ['--it-rgb' as any]: hexToRgb('#f97316') }}>
          <span className="sh-bigshortcut-icon">{I.users}</span>
          <span>
            <span className="sh-bigshortcut-title">Vartotojai</span>
            <span className="sh-bigshortcut-desc">Aktyviausi nariai</span>
          </span>
        </Link>
      </div>
    </div>
  )
}

function SkelbimaiPanel({ accent }: { accent: string }) {
  return (
    <div className="sh-panel" style={{ minWidth: 640 }}>
      <div className="sh-panel-section">
        <span className="sh-panel-section-title">Marketplace</span>
        <span className="sh-soon-pill">Greitai</span>
      </div>

      {/* Hero kortelė — abstract gradient su decorative shapes */}
      <Link href="/skelbimai" className="sh-hero-card" style={{ ['--it-rgb' as any]: hexToRgb('#10b981') }}>
        <span className="sh-hero-deco-circle sh-hero-deco-1" />
        <span className="sh-hero-deco-circle sh-hero-deco-2" />
        <span className="sh-hero-deco-circle sh-hero-deco-3" />
        <span className="sh-hero-content">
          <span className="sh-hero-eyebrow">Music marketplace</span>
          <span className="sh-hero-icon">{I.market}</span>
          <span className="sh-hero-title">Skelbimai</span>
          <span className="sh-hero-desc">
            Pirk, parduok, mainykis. Vinilas, instrumentai, audio įranga
            ir muzikinės paslaugos vienoje vietoje.
          </span>
          <span className="sh-hero-cta">Greitai paleidžiame <ArrowRight size={13}/></span>
        </span>
      </Link>

      {/* Kategorijų plytelės */}
      <div style={{ marginTop: 12 }}>
        <div className="sh-panel-section" style={{ marginBottom: 8 }}>
          <span className="sh-panel-section-title">Kategorijos</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[
            { label: 'Vinilas',         icon: I.vinyl,   rgb: '14, 165, 233' },
            { label: 'CD ir kasetės',   icon: I.boombox, rgb: '6, 182, 212' },
            { label: 'Instrumentai',    icon: I.guitar,  rgb: '245, 158, 11' },
            { label: 'Audio įranga',    icon: I.music,   rgb: '168, 85, 247' },
            { label: 'Studijos',        icon: I.quiz,    rgb: '236, 72, 153' },
            { label: 'Paslaugos',       icon: I.market,  rgb: '16, 185, 129' },
          ].map(t => (
            <Link key={t.label} href="/skelbimai" className="sh-cat-tile" style={{ ['--it-rgb' as any]: t.rgb }}>
              <span className="sh-cat-icon">{t.icon}</span>
              <span className="sh-cat-label">{t.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────
 * Mobile expansion — kompaktinis dropdown'o turinio variantas
 * (po kiekviena top-level NAV kortele drawer'yje)
 * ──────────────────────────────────────────────────────────────── */

function MobileExpansion({
  navKey, data, accent, onLink,
}: {
  navKey: NavItem['key']
  data: NavPreview | null
  accent: string
  onLink: () => void
}) {
  if (navKey === 'muzika') {
    const ltArtists = data?.artistsLt || []
    const wrldArtists = data?.artistsWorld || []
    const albums = data?.albums || []
    const tracks = data?.tracks || []
    return (
      <div className="sh-mexp">
        <div className="sh-mexp-section">
          <span className="sh-mexp-title">
            <span className="sh-trending-glyph sh-trending-mini" title="Trending">{I.trending}</span>
            Atlikėjai
          </span>
          <Link href="/atlikejai" onClick={onLink} className="sh-mexp-more">Daugiau <ArrowRight size={10}/></Link>
        </div>
        <div className="sh-strip-wrap" style={{ marginBottom: 6 }}>
          <RowStripe kind="lt" />
          <div className="sh-strip">
            {(ltArtists.length > 0 ? ltArtists.slice(0, 8) : Array(5).fill(null)).map((a, i) => (
              <Link key={a?.id || `lt-${i}`} href={a ? `/atlikejai/${a.slug}` : '/atlikejai'} onClick={onLink} className="sh-mini sh-mini-xs">
                <ImageBox src={a?.image} accent={accent} glyph={I.music} className="sh-mini-img" />
                <span className="sh-mini-title sh-mini-title-2">{a?.name || 'Atlikėjas'}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="sh-strip-wrap">
          <RowStripe kind="world" />
          <div className="sh-strip">
            {(wrldArtists.length > 0 ? wrldArtists.slice(0, 8) : Array(5).fill(null)).map((a, i) => (
              <Link key={a?.id || `w-${i}`} href={a ? `/atlikejai/${a.slug}` : '/atlikejai'} onClick={onLink} className="sh-mini sh-mini-xs">
                <ImageBox src={a?.image} accent={accent} glyph={I.music} className="sh-mini-img" />
                <span className="sh-mini-title sh-mini-title-2">{a?.name || 'Atlikėjas'}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="sh-mexp-section">
          <span className="sh-mexp-title">
            <span className="sh-trending-glyph sh-trending-mini" title="Trending">{I.trending}</span>
            Albumai
          </span>
          <Link href="/albumai" onClick={onLink} className="sh-mexp-more">Daugiau <ArrowRight size={10}/></Link>
        </div>
        <div className="sh-strip">
          {(albums.length > 0 ? albums.slice(0, 8) : Array(5).fill(null)).map((a, i) => (
            <Link key={a?.id || i} href={a ? `/lt/albumas/${a.slug}/${a.id}` : '/albumai'} onClick={onLink} className="sh-mini sh-mini-xs">
              <ImageBox src={a?.image} accent={accent} glyph={I.vinyl} className="sh-mini-img" />
              <span className="sh-mini-title sh-mini-title-2">{a?.title || 'Albumas'}</span>
            </Link>
          ))}
        </div>

        <div className="sh-mexp-section">
          <span className="sh-mexp-title">
            <span className="sh-trending-glyph sh-trending-mini" title="Trending">{I.trending}</span>
            Dainos
          </span>
          <Link href="/muzika" onClick={onLink} className="sh-mexp-more">Daugiau <ArrowRight size={10}/></Link>
        </div>
        <div className="sh-strip">
          {(tracks.length > 0 ? tracks.slice(0, 8) : Array(5).fill(null)).map((t, i) => (
            <Link key={t?.id || i} href={t ? `/dainos/${t.artistSlug}-${quickSlug(t.title)}-${t.id}` : '/muzika'} onClick={onLink} className="sh-mini sh-mini-xs">
              <ImageBox src={t?.image} accent={accent} glyph={I.song} className="sh-mini-img" />
              <span className="sh-mini-title sh-mini-title-2">{t?.title || 'Daina'}</span>
            </Link>
          ))}
        </div>

        <div className="sh-mexp-section">
          <span className="sh-mexp-title">Stiliai</span>
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {GENRE_COLORS.map(s => (
            <Link key={s.name} href={s.href} onClick={onLink} className="sh-style-pill" style={{ ['--it-rgb' as any]: s.rgb }}>
              {s.short}
            </Link>
          ))}
        </div>
      </div>
    )
  }

  if (navKey === 'topai') {
    return (
      <div className="sh-mexp">
        <div className="sh-mexp-grid">
          <Link href="/topai" onClick={onLink} className="sh-mexp-tile" style={{ ['--it-rgb' as any]: hexToRgb('#ef4444') }}>
            <span className="sh-mexp-tile-icon">{I.trophy}</span>
            <span className="sh-mexp-tile-label">Topai</span>
          </Link>
          <Link href="/balsavimai" onClick={onLink} className="sh-mexp-tile" style={{ ['--it-rgb' as any]: hexToRgb('#ec4899') }}>
            <span className="sh-mexp-tile-icon">{I.vote}</span>
            <span className="sh-mexp-tile-label">Balsavimai</span>
          </Link>
          <Link href="/dienos-daina" onClick={onLink} className="sh-mexp-tile" style={{ ['--it-rgb' as any]: hexToRgb('#10b981') }}>
            <span className="sh-mexp-tile-icon">{I.song}</span>
            <span className="sh-mexp-tile-label">Dienos daina</span>
          </Link>
          <Link href="/apdovanojimai" onClick={onLink} className="sh-mexp-tile" style={{ ['--it-rgb' as any]: hexToRgb('#eab308') }}>
            <span className="sh-mexp-tile-icon">{I.award}</span>
            <span className="sh-mexp-tile-label">Apdovanojimai</span>
          </Link>
        </div>
      </div>
    )
  }

  if (navKey === 'renginiai') {
    const events = data?.events || []
    return (
      <div className="sh-mexp">
        <div className="sh-mexp-section">
          <span className="sh-mexp-title">Artimiausi</span>
          <Link href="/renginiai" onClick={onLink} className="sh-mexp-more">Daugiau <ArrowRight size={10}/></Link>
        </div>
        <div className="sh-strip">
          {(events.length > 0 ? events.slice(0, 6) : Array(4).fill(null)).map((e, i) => (
            <Link key={e?.id || i} href={e ? `/renginiai/${e.slug}` : '/renginiai'} onClick={onLink} className="sh-mini sh-mini-xs">
              <ImageBox src={e?.image} accent={accent} glyph={I.calendar} className="sh-mini-img" />
              <span className="sh-mini-title sh-mini-title-2">{e?.title || 'Renginys'}</span>
            </Link>
          ))}
        </div>
        <div className="sh-mexp-grid" style={{ marginTop: 10 }}>
          <Link href="/festivaliai" onClick={onLink} className="sh-mexp-tile" style={{ ['--it-rgb' as any]: hexToRgb('#06b6d4') }}>
            <span className="sh-mexp-tile-icon">{I.festival}</span>
            <span className="sh-mexp-tile-label">Festivaliai</span>
          </Link>
          <Link href="/galerija" onClick={onLink} className="sh-mexp-tile" style={{ ['--it-rgb' as any]: hexToRgb('#ec4899') }}>
            <span className="sh-mexp-tile-icon">{I.gallery}</span>
            <span className="sh-mexp-tile-label">Galerija</span>
          </Link>
        </div>
      </div>
    )
  }

  if (navKey === 'pramogos') {
    return (
      <div className="sh-mexp">
        <div className="sh-mexp-grid">
          <Link href="/boombox" onClick={onLink} className="sh-mexp-tile" style={{ ['--it-rgb' as any]: hexToRgb('#f97316') }}>
            <span className="sh-mexp-tile-icon">{I.boombox}</span>
            <span className="sh-mexp-tile-label">Boombox</span>
          </Link>
          <Link href="/zaidimai" onClick={onLink} className="sh-mexp-tile" style={{ ['--it-rgb' as any]: hexToRgb('#6366f1') }}>
            <span className="sh-mexp-tile-icon">{I.game}</span>
            <span className="sh-mexp-tile-label">Žaidimai</span>
          </Link>
          <Link href="/kvizai" onClick={onLink} className="sh-mexp-tile" style={{ ['--it-rgb' as any]: hexToRgb('#14b8a6') }}>
            <span className="sh-mexp-tile-icon">{I.quiz}</span>
            <span className="sh-mexp-tile-label">Kvizai</span>
          </Link>
        </div>
      </div>
    )
  }

  if (navKey === 'naujienos') {
    const news = data?.news || []
    return (
      <div className="sh-mexp">
        <div className="sh-mexp-section">
          <span className="sh-mexp-title">Naujausios</span>
          <Link href="/naujienos" onClick={onLink} className="sh-mexp-more">Daugiau <ArrowRight size={10}/></Link>
        </div>
        <div className="sh-strip">
          {(news.length > 0 ? news.slice(0, 8) : Array(5).fill(null)).map((n, i) => (
            <Link key={n?.id || i} href={n ? `/news/${n.slug}` : '/naujienos'} onClick={onLink} className="sh-mini sh-mini-xs">
              <ImageBox src={n?.image} accent={accent} glyph={I.blog} className="sh-mini-img" />
              <span className="sh-mini-title sh-mini-title-2">{n?.title || 'Naujiena'}</span>
            </Link>
          ))}
        </div>
        <div className="sh-mexp-grid" style={{ marginTop: 12 }}>
          <Link href="/naujienos?type=interview" onClick={onLink} className="sh-mexp-tile" style={{ ['--it-rgb' as any]: hexToRgb('#0ea5e9') }}>
            <span className="sh-mexp-tile-icon">{I.chat}</span>
            <span className="sh-mexp-tile-label">Interviu</span>
          </Link>
          <Link href="/naujienos?type=review" onClick={onLink} className="sh-mexp-tile" style={{ ['--it-rgb' as any]: hexToRgb('#a855f7') }}>
            <span className="sh-mexp-tile-icon">{I.blog}</span>
            <span className="sh-mexp-tile-label">Recenzijos</span>
          </Link>
          <Link href="/naujienos?type=release" onClick={onLink} className="sh-mexp-tile" style={{ ['--it-rgb' as any]: hexToRgb('#10b981') }}>
            <span className="sh-mexp-tile-icon">{I.song}</span>
            <span className="sh-mexp-tile-label">Releases</span>
          </Link>
          <Link href="/naujienos" onClick={onLink} className="sh-mexp-tile" style={{ ['--it-rgb' as any]: hexToRgb('#f59e0b') }}>
            <span className="sh-mexp-tile-icon">{I.news}</span>
            <span className="sh-mexp-tile-label">Visos</span>
          </Link>
        </div>
      </div>
    )
  }

  if (navKey === 'bendruomene') {
    return (
      <div className="sh-mexp">
        <div className="sh-mexp-grid">
          <Link href="/pokalbiai" onClick={onLink} className="sh-mexp-tile" style={{ ['--it-rgb' as any]: hexToRgb('#06b6d4') }}>
            <span className="sh-mexp-tile-icon">{I.chat}</span>
            <span className="sh-mexp-tile-label">Pokalbiai</span>
          </Link>
          <Link href="/diskusijos" onClick={onLink} className="sh-mexp-tile" style={{ ['--it-rgb' as any]: hexToRgb('#8b5cf6') }}>
            <span className="sh-mexp-tile-icon">{I.forum}</span>
            <span className="sh-mexp-tile-label">Diskusijos</span>
          </Link>
          <Link href="/blogas" onClick={onLink} className="sh-mexp-tile" style={{ ['--it-rgb' as any]: hexToRgb('#a855f7') }}>
            <span className="sh-mexp-tile-icon">{I.blog}</span>
            <span className="sh-mexp-tile-label">Tinklaraščiai</span>
          </Link>
          <Link href="/vartotojai" onClick={onLink} className="sh-mexp-tile" style={{ ['--it-rgb' as any]: hexToRgb('#f97316') }}>
            <span className="sh-mexp-tile-icon">{I.users}</span>
            <span className="sh-mexp-tile-label">Vartotojai</span>
          </Link>
        </div>
      </div>
    )
  }

  if (navKey === 'skelbimai') {
    return (
      <div className="sh-mexp">
        <div className="sh-mexp-grid">
          {[
            { label: 'Vinilas',         icon: I.vinyl,   rgb: '14, 165, 233' },
            { label: 'CD ir kasetės',   icon: I.boombox, rgb: '6, 182, 212' },
            { label: 'Instrumentai',    icon: I.guitar,  rgb: '245, 158, 11' },
            { label: 'Audio įranga',    icon: I.music,   rgb: '168, 85, 247' },
            { label: 'Studijos',        icon: I.quiz,    rgb: '236, 72, 153' },
            { label: 'Paslaugos',       icon: I.market,  rgb: '16, 185, 129' },
          ].map(t => (
            <Link key={t.label} href="/skelbimai" onClick={onLink} className="sh-mexp-tile" style={{ ['--it-rgb' as any]: t.rgb }}>
              <span className="sh-mexp-tile-icon">{t.icon}</span>
              <span className="sh-mexp-tile-label">{t.label}</span>
            </Link>
          ))}
        </div>
      </div>
    )
  }

  return null
}

/* ────────────────────────────────────────────────────────────────
 * Main component
 * ──────────────────────────────────────────────────────────────── */
export function SiteHeader() {
  const { theme, setTheme, dk } = useSite()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [preview, setPreview] = useState<NavPreview | null>(null)
  // Mobile drill-in state — 'main' = pradinė kortelių sąrašo view,
  // arba konkretus key (muzika/topai/...) = sekcijos turinio full-screen view.
  const [drawerView, setDrawerView] = useState<'main' | NavItem['key']>('main')
  // Desktop dropdown'o "closing" state — paspaudus link'ą uždaro
  // panel'ą iškart, kad nesimatytų po hover'iu kol page'as krautųsi.
  const [closingKey, setClosingKey] = useState<NavItem['key'] | null>(null)
  useEffect(() => { setClosingKey(null) }, [pathname])

  // Body scroll lock kai drawer'is atidarytas (kad puslapio turinys
  // nesleslintų po modalu)
  useEffect(() => {
    if (menuOpen) {
      const orig = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = orig }
    }
  }, [menuOpen])

  // Kai drawer'is užsidaro — atstatom į main view'ą kitam atidarymui
  useEffect(() => { if (!menuOpen) setDrawerView('main') }, [menuOpen])

  // Fetch nav preview data once on mount (cached aggressively)
  useEffect(() => {
    let mounted = true
    fetch('/api/nav-preview')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (mounted && d && !d.error) setPreview(d) })
      .catch(() => {})
    return () => { mounted = false }
  }, [])

  // Cmd/Ctrl+K bei "/" atidaro paiešką
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const inField = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setSearchOpen(true) }
      else if (e.key === '/' && !inField && !searchOpen) { e.preventDefault(); setSearchOpen(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [searchOpen])

  const openSearch = () => { setSearchOpen(true); setMenuOpen(false) }

  const bg          = 'rgba(var(--bg-body-rgb), 0.97)'
  const bdr         = '1px solid var(--border-default)'
  const navColor    = 'var(--text-secondary)'
  const navHover    = 'var(--text-primary)'
  const navHoverBg  = 'var(--bg-hover)'
  const logoColor   = 'var(--text-primary)'
  const inputBg     = 'var(--input-bg)'
  const inputBdr    = '1px solid var(--input-border)'
  const mutedIcon   = 'var(--text-muted)'
  const drawerBg    = 'var(--bg-surface)'
  const hamColor    = 'var(--text-muted)'

  const isActive = (item: NavItem) =>
    item.match.some(m => m === '/' ? pathname === '/' : pathname.startsWith(m))

  const renderPanel = (key: NavItem['key'], accent: string) => {
    switch (key) {
      case 'muzika':       return <MuzikaPanel data={preview} accent={accent} />
      case 'topai':        return <TopaiPanel accent={accent} />
      case 'renginiai':    return <RenginiaiPanel data={preview} accent={accent} />
      case 'naujienos':    return <NaujienosPanel data={preview} accent={accent} />
      case 'pramogos':     return <PramogosPanel accent={accent} />
      case 'bendruomene':  return <BendruomenePanel accent={accent} />
      case 'skelbimai':    return <SkelbimaiPanel accent={accent} />
    }
  }

  return (
    <>
      <style>{`
        /* ── Top-level nav link su accent indicator ── */
        .sh-navlink {
          position: relative;
          display: inline-flex; align-items: center;
          font-size: 13.5px; font-weight: 600;
          padding: 8px 14px;
          text-decoration: none;
          color: ${navColor};
          transition: color .18s ease;
          white-space: nowrap;
          letter-spacing: -0.005em;
        }
        .sh-navlink::after {
          content: '';
          position: absolute;
          left: 14px; right: 14px;
          bottom: 4px;
          height: 2px;
          border-radius: 2px;
          background: var(--accent-orange);
          transform: scaleX(0);
          transition: transform .25s cubic-bezier(.4,0,.2,1);
        }
        .sh-navlink:hover { color: ${navHover}; }
        .sh-navlink:hover::after { transform: scaleX(1); }
        .sh-navlink.active { color: ${navHover}; }
        .sh-navlink.active::after { transform: scaleX(1); }

        /* ── Glass dropdown panel ── */
        .sh-group { position: relative; }
        .sh-dropdown-wrap {
          position: absolute;
          top: 100%; left: 0;
          padding-top: 10px;
          opacity: 0; pointer-events: none;
          transform: translateY(-6px);
          transition: opacity .2s ease, transform .2s ease;
          z-index: 100;
        }
        .sh-group:hover > .sh-dropdown-wrap,
        .sh-group:focus-within > .sh-dropdown-wrap {
          opacity: 1; pointer-events: auto;
          transform: translateY(0);
        }
        /* Closing state — paspaudus link'ą force'iuojam dropdown išnykti
           net jei cursor'is vis dar virš grupės (kad neliktų po hover'iu) */
        .sh-group.closing > .sh-dropdown-wrap,
        .sh-group.closing:hover > .sh-dropdown-wrap,
        .sh-group.closing:focus-within > .sh-dropdown-wrap {
          opacity: 0 !important;
          pointer-events: none !important;
          transform: translateY(-12px) scale(0.96) !important;
          transition: opacity .15s ease, transform .15s ease !important;
        }
        .sh-group:nth-last-of-type(-n+2) > .sh-dropdown-wrap { left: auto; right: 0; }

        .sh-panel {
          padding: 18px;
          background: rgba(var(--bg-surface-rgb), 0.92);
          backdrop-filter: blur(40px) saturate(180%);
          -webkit-backdrop-filter: blur(40px) saturate(180%);
          border: 1px solid var(--border-default);
          border-radius: 20px;
          box-shadow:
            0 30px 80px rgba(0,0,0,0.30),
            0 8px 20px rgba(0,0,0,0.12);
          position: relative;
          overflow: hidden;
        }
        .sh-panel::before {
          content: '';
          position: absolute;
          top: -100px; right: -100px;
          width: 240px; height: 240px;
          background: radial-gradient(circle, var(--panel-accent) 0%, transparent 70%);
          opacity: 0.12;
          pointer-events: none;
        }

        .sh-panel-section {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 8px;
          padding: 0 2px;
        }
        .sh-panel-muzika .sh-panel-section { margin-bottom: 6px; }
        .sh-panel-section-title {
          font-size: 11px; font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--text-muted);
          display: inline-flex; align-items: center; gap: 5px;
        }
        /* Trending glyph — mini up-arrow chart, kursoriaus-spalvotas accent
           kuris vizualiai signalizuoja "trending / curated picks" virš
           Atlikėjai/Albumai/Dainos sekcijų */
        .sh-trending-glyph {
          display: inline-flex; align-items: center;
          color: var(--accent-orange);
        }
        .sh-trending-glyph svg { width: 11px; height: 11px; }
        .sh-trending-mini svg { width: 10px; height: 10px; }
        .sh-panel-section-more {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 11px; font-weight: 700;
          color: var(--text-secondary);
          text-decoration: none;
          padding: 3px 7px;
          border-radius: 6px;
          transition: background .15s, color .15s;
        }
        .sh-panel-section-more:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        /* ── Muzika dropdown'o kompakti­ška versija su horizontal scroll ── */

        /* Muzika panel'as: paliekam padding'ą truputį mažesnį */
        .sh-panel-muzika { padding: 14px; }

        /* LT vėliavos / world mėlynos juostelės indikatorius — kompaktinis,
           ne išskleistas per visą sekcijos aukštį (centered su tile aukščiu) */
        .sh-stripe {
          flex-shrink: 0;
          width: 4px;
          height: 60px;
          border-radius: 3px;
          overflow: hidden;
        }
        .sh-stripe-lt { display: flex; flex-direction: column; }
        .sh-stripe-world { background: #3b82f6; opacity: 0.75; }

        /* Wrapper'is su flag + scroll strip + Daugiau link */
        .sh-strip-wrap {
          display: flex; align-items: center; gap: 10px;
        }
        /* Atlikėjų eilutė — flag (centruota) + scroll juosta + Daugiau link */
        .sh-artist-row {
          display: flex; align-items: center; gap: 10px;
          padding: 4px 0;
        }
        .sh-artist-row .sh-strip { flex: 1; min-width: 0; }

        /* Homepage stiliaus 'Daugiau →' link'as — orange, no underline */
        .sh-more-link {
          flex-shrink: 0;
          font-family: 'Outfit', sans-serif;
          font-size: 11.5px; font-weight: 700;
          color: var(--accent-orange);
          text-decoration: none;
          padding-left: 6px;
          transition: opacity .15s;
        }
        .sh-more-link:hover { opacity: 0.7; }

        /* Homepage stiliaus h2 (section title) */
        .sh-panel-head {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 14px;
        }
        .sh-panel-h2 {
          margin: 0;
          font-family: 'Outfit', sans-serif;
          font-size: 17px; font-weight: 800;
          letter-spacing: -0.01em;
          color: var(--text-primary);
        }

        /* Stiliai grid — Spotify-style bold colored kortelės */
        .sh-style-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
        }
        .sh-style-card {
          position: relative;
          display: block;
          padding: 14px 14px 18px;
          border-radius: 12px;
          text-decoration: none;
          background:
            radial-gradient(circle at 20% 0%, rgba(255,255,255,0.18) 0%, transparent 60%),
            linear-gradient(135deg, rgb(var(--it-rgb)) 0%, rgba(var(--it-rgb), 0.78) 100%);
          color: #fff;
          overflow: hidden;
          min-height: 78px;
          transition: transform .18s ease, box-shadow .18s ease;
          box-shadow:
            0 4px 12px rgba(var(--it-rgb), 0.25),
            inset 0 1px 0 rgba(255, 255, 255, 0.18);
        }
        .sh-style-card:hover {
          transform: translateY(-3px) rotate(-0.5deg);
          box-shadow:
            0 12px 24px rgba(var(--it-rgb), 0.40),
            inset 0 1px 0 rgba(255, 255, 255, 0.20);
        }
        .sh-style-card:hover .sh-style-card-deco {
          transform: rotate(15deg) scale(1.1);
          opacity: 0.40;
        }
        .sh-style-card-name {
          position: relative;
          z-index: 1;
          display: block;
          font-family: 'Outfit', sans-serif;
          font-size: 16px; font-weight: 800;
          letter-spacing: -0.02em;
          color: #fff;
          line-height: 1.15;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
        }
        .sh-style-card-deco {
          position: absolute;
          bottom: -14px; right: -14px;
          width: 64px; height: 64px;
          color: #fff;
          opacity: 0.28;
          transform: rotate(8deg);
          transition: transform .35s cubic-bezier(.4,0,.2,1), opacity .25s;
          pointer-events: none;
        }
        .sh-style-card-deco svg { width: 100%; height: 100%; stroke-width: 1.6; }

        /* Horizontal scroll'inama juosta. Slepiam scrollbar'ą bet leidim scroll. */
        .sh-strip {
          display: flex;
          gap: 6px;
          overflow-x: auto;
          overflow-y: hidden;
          flex: 1;
          padding: 2px 0;
          scrollbar-width: none;
          -ms-overflow-style: none;
          scroll-snap-type: x proximity;
        }
        .sh-strip::-webkit-scrollbar { display: none; }

        /* Bendras mini-tile baseline — su size modifier'ais (-lg / -md / -sm).
           min-width:0 reikalingas truncation'ui flex container'yje. */
        .sh-mini {
          flex-shrink: 0;
          min-width: 0;
          display: flex; flex-direction: column;
          padding: 4px;
          border-radius: 8px;
          text-decoration: none;
          transition: background .15s;
          scroll-snap-align: start;
        }
        .sh-mini:hover { background: var(--bg-hover); }
        .sh-mini:hover .sh-mini-img { transform: scale(1.06); }

        /* Atlikėjai — didžiausi (90×90) */
        .sh-mini-lg { flex-basis: 96px; width: 96px; max-width: 96px; gap: 5px; }
        .sh-mini-lg .sh-mini-img { width: 88px; height: 88px; border-radius: 9px; }
        .sh-mini-lg .sh-mini-title { font-size: 11.5px; text-align: center; }

        /* Atlikėjai XL — kai dropdown'e tik atlikėjai (daugiau erdvės) */
        .sh-mini-xl { flex-basis: 116px; width: 116px; max-width: 116px; gap: 7px; padding: 6px; }
        .sh-mini-xl .sh-mini-img { width: 108px; height: 108px; border-radius: 11px; }
        .sh-mini-xl .sh-mini-title { font-size: 12.5px; text-align: center; }

        /* Albumai — vidutiniai (74×74) */
        .sh-mini-md { flex-basis: 82px; width: 82px; max-width: 82px; gap: 4px; }
        .sh-mini-md .sh-mini-img { width: 74px; height: 74px; border-radius: 8px; }
        .sh-mini-md .sh-mini-title { font-size: 11px; }

        /* Dainos — mažiausi (60×60) */
        .sh-mini-sm { flex-basis: 68px; width: 68px; max-width: 68px; gap: 3px; }
        .sh-mini-sm .sh-mini-img { width: 60px; height: 60px; border-radius: 7px; }
        .sh-mini-sm .sh-mini-title { font-size: 10.5px; }
        .sh-mini-sm .sh-mini-meta { font-size: 9.5px; }

        /* XS — mobile expansion turiniui (52×52) */
        .sh-mini-xs { flex-basis: 60px; width: 60px; max-width: 60px; gap: 3px; padding: 3px; }
        .sh-mini-xs .sh-mini-img { width: 54px; height: 54px; border-radius: 7px; }
        .sh-mini-xs .sh-mini-title { font-size: 10px; }

        .sh-mini-img {
          position: relative;
          display: block;
          margin: 0 auto;
          background-size: cover;
          background-position: center;
          background-color: var(--bg-hover);
          transition: transform .22s ease;
          overflow: hidden;
        }
        /* 2-line clamp — leidžia ilgesnius vardus matyti pilniau */
        .sh-mini-title {
          font-weight: 700;
          color: var(--text-primary);
          line-height: 1.25;
          padding: 0 1px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          word-break: break-word;
          hyphens: auto;
        }
        .sh-mini-title-2 { -webkit-line-clamp: 2; }
        .sh-mini-meta {
          font-size: 10px; font-weight: 500;
          color: var(--text-muted);
          line-height: 1.2;
          padding: 0 1px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* Žanro pill (Stiliai juostelė apačioje).
           Border + bg opacity pakelti, kad ir tamsesnės spalvos
           (Sunkioji muzika #374151) būtų matomos ant dark theme.
           Mažas accent dot kairėje — kad spalvinis kodas akivaizdus. */
        .sh-style-pill {
          display: inline-flex; align-items: center; justify-content: center;
          gap: 7px;
          padding: 8px 14px 8px 12px;
          border-radius: 999px;
          text-decoration: none;
          font-size: 12px; font-weight: 700;
          color: var(--text-primary);
          background: linear-gradient(135deg, rgba(var(--it-rgb), 0.20) 0%, rgba(var(--it-rgb), 0.06) 100%);
          border: 1px solid rgba(var(--it-rgb), 0.45);
          transition: transform .15s, border-color .15s, background .15s;
          line-height: 1.2;
          white-space: nowrap;
        }
        .sh-style-pill::before {
          content: '';
          width: 7px; height: 7px;
          border-radius: 50%;
          background: rgb(var(--it-rgb));
          flex-shrink: 0;
          box-shadow: 0 0 0 1.5px rgba(var(--it-rgb), 0.25);
        }
        .sh-style-pill:hover {
          transform: translateY(-1px);
          border-color: rgba(var(--it-rgb), 0.75);
          background: linear-gradient(135deg, rgba(var(--it-rgb), 0.32) 0%, rgba(var(--it-rgb), 0.12) 100%);
        }

        /* Atlikėjo kortelė (kvadratinė foto + vardas) */
        .sh-artist-card {
          text-decoration: none;
          display: flex; flex-direction: column;
          gap: 6px;
          padding: 6px;
          border-radius: 10px;
          transition: background .15s;
        }
        .sh-artist-card:hover { background: var(--bg-hover); }
        .sh-artist-card:hover .sh-artist-img { transform: scale(1.04); }
        .sh-artist-img {
          position: relative;
          display: block;
          width: 100%; aspect-ratio: 1;
          border-radius: 10px;
          background-size: cover;
          background-position: center;
          background-color: var(--bg-hover);
          transition: transform .25s ease;
          overflow: hidden;
        }
        .sh-artist-name {
          font-size: 12px; font-weight: 700;
          color: var(--text-primary);
          line-height: 1.2;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          padding: 0 2px;
        }

        /* Albumo / naujienos eilutė (cover + 2 lines text) */
        .sh-album-row {
          display: flex; align-items: center; gap: 10px;
          padding: 8px;
          border-radius: 10px;
          text-decoration: none;
          transition: background .15s;
        }
        .sh-album-row:hover { background: var(--bg-hover); }
        .sh-album-row:hover .sh-album-cover { transform: scale(1.05); }
        .sh-album-cover {
          position: relative;
          flex-shrink: 0;
          width: 48px; height: 48px;
          border-radius: 8px;
          background-size: cover;
          background-position: center;
          background-color: var(--bg-hover);
          transition: transform .25s ease;
          overflow: hidden;
        }
        .sh-album-info {
          flex: 1; min-width: 0;
          display: flex; flex-direction: column; gap: 2px;
        }
        .sh-album-title {
          font-size: 13px; font-weight: 700;
          color: var(--text-primary);
          line-height: 1.3;
          display: -webkit-box;
          -webkit-line-clamp: 1;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .sh-album-meta {
          font-size: 11.5px; font-weight: 500;
          color: var(--text-muted);
          line-height: 1.3;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* Fallback glyph — kai nėra paveiksliuko, rodom centrą ikona */
        .sh-fallback-glyph {
          position: absolute;
          inset: 0;
          display: flex; align-items: center; justify-content: center;
          color: rgba(255, 255, 255, 0.7);
          pointer-events: none;
        }
        .sh-fallback-glyph svg {
          width: 38%; height: 38%;
          stroke-width: 1.6;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
        }

        /* Renginio kortelė (poster + info) */
        .sh-event-card {
          display: flex; flex-direction: column;
          gap: 8px;
          padding: 8px;
          border-radius: 12px;
          text-decoration: none;
          transition: background .15s;
        }
        .sh-event-card:hover { background: var(--bg-hover); }
        .sh-event-card:hover .sh-event-img { transform: scale(1.03); }
        .sh-event-img {
          position: relative;
          display: block;
          width: 100%; aspect-ratio: 16/9;
          border-radius: 10px;
          background-size: cover;
          background-position: center;
          background-color: var(--bg-hover);
          transition: transform .25s ease;
          overflow: hidden;
        }
        .sh-event-date {
          position: absolute;
          top: 6px; left: 6px;
          padding: 3px 8px;
          font-size: 10.5px; font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #fff;
          background: rgba(0,0,0,0.7);
          border-radius: 6px;
          backdrop-filter: blur(8px);
        }
        .sh-event-title {
          font-size: 13px; font-weight: 700;
          color: var(--text-primary);
          line-height: 1.3;
          display: -webkit-box;
          -webkit-line-clamp: 1;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .sh-event-venue {
          font-size: 11px;
          color: var(--text-muted);
          margin-top: 2px;
          display: block;
        }

        /* Feature kortelė (Pramogų panel'iui) */
        .sh-feature-card {
          position: relative;
          display: flex; flex-direction: column;
          gap: 6px;
          padding: 16px;
          border-radius: 14px;
          text-decoration: none;
          background: linear-gradient(135deg, rgba(var(--it-rgb), 0.18) 0%, rgba(var(--it-rgb), 0.05) 100%);
          border: 1px solid rgba(var(--it-rgb), 0.3);
          transition: transform .18s, box-shadow .18s, border-color .18s;
          overflow: hidden;
        }
        .sh-feature-card:hover {
          transform: translateY(-2px);
          border-color: rgba(var(--it-rgb), 0.55);
          box-shadow: 0 12px 28px rgba(var(--it-rgb), 0.25);
        }
        .sh-feature-big { padding: 18px; min-height: 180px; justify-content: space-between; }
        .sh-feature-icon {
          display: flex;
          width: 44px; height: 44px;
          border-radius: 12px;
          align-items: center; justify-content: center;
          color: #fff;
          background: linear-gradient(135deg, rgba(var(--it-rgb), 1) 0%, rgba(var(--it-rgb), 0.75) 100%);
          box-shadow: 0 8px 16px rgba(var(--it-rgb), 0.4), inset 0 1px 0 rgba(255,255,255,0.25);
        }
        .sh-feature-icon svg { width: 22px; height: 22px; }
        .sh-feature-icon-sm {
          display: flex;
          width: 32px; height: 32px;
          border-radius: 9px;
          align-items: center; justify-content: center;
          color: #fff;
          background: linear-gradient(135deg, rgba(var(--it-rgb), 1) 0%, rgba(var(--it-rgb), 0.75) 100%);
          box-shadow: 0 4px 10px rgba(var(--it-rgb), 0.3);
          margin-bottom: 4px;
        }
        .sh-feature-icon-sm svg { width: 16px; height: 16px; }
        .sh-feature-title {
          font-size: 18px; font-weight: 800;
          color: var(--text-primary);
          letter-spacing: -0.01em;
          line-height: 1.2;
        }
        .sh-feature-title-sm {
          font-size: 14px; font-weight: 800;
          color: var(--text-primary);
          line-height: 1.2;
        }
        .sh-feature-desc {
          font-size: 13px;
          color: var(--text-secondary);
          line-height: 1.4;
        }
        .sh-feature-desc-sm {
          font-size: 11.5px;
          color: var(--text-muted);
          line-height: 1.35;
        }
        .sh-feature-cta {
          display: inline-block;
          font-size: 12px; font-weight: 700;
          color: rgba(var(--it-rgb), 1);
          margin-top: auto;
        }
        .sh-soon-pill {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 9px; font-weight: 800;
          text-transform: uppercase; letter-spacing: 0.08em;
          padding: 2px 7px;
          border-radius: 999px;
          background: rgba(var(--it-rgb, 156, 163, 175), 0.18);
          color: rgba(var(--it-rgb, 107, 114, 128), 1);
          border: 1px solid rgba(var(--it-rgb, 156, 163, 175), 0.4);
          align-self: flex-start;
        }
        .sh-soon-pill::before {
          content: ''; width: 5px; height: 5px;
          border-radius: 50%; background: currentColor;
          animation: sh-pulse 1.8s infinite;
        }
        @keyframes sh-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.5; transform: scale(1.4); }
        }

        /* Hero kortelė (Pramogos / Skelbimai) — abstract gradient bg + decorative shapes */
        .sh-hero-card {
          position: relative;
          display: block;
          padding: 22px;
          border-radius: 16px;
          text-decoration: none;
          background:
            radial-gradient(circle at 20% 0%, rgba(255,255,255,0.1) 0%, transparent 50%),
            radial-gradient(circle at 80% 100%, rgba(var(--it-rgb), 0.6) 0%, transparent 60%),
            linear-gradient(135deg, rgba(var(--it-rgb), 1) 0%, rgba(var(--it-rgb), 0.7) 100%);
          overflow: hidden;
          color: #fff;
          transition: transform .25s ease, box-shadow .25s ease;
          box-shadow: 0 12px 30px rgba(var(--it-rgb), 0.30), inset 0 1px 0 rgba(255,255,255,0.15);
        }
        .sh-hero-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 18px 40px rgba(var(--it-rgb), 0.40), inset 0 1px 0 rgba(255,255,255,0.20);
        }
        .sh-hero-card:hover .sh-hero-deco-circle { transform: scale(1.08); }
        .sh-hero-deco-circle {
          position: absolute;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 70%);
          pointer-events: none;
          transition: transform .4s cubic-bezier(.4,0,.2,1);
        }
        .sh-hero-deco-1 { width: 200px; height: 200px; top: -50px; right: -30px; }
        .sh-hero-deco-2 { width: 130px; height: 130px; bottom: -40px; left: 30%; opacity: 0.6; }
        .sh-hero-deco-3 { width: 80px; height: 80px; top: 30%; left: -20px; opacity: 0.5; }

        .sh-hero-content {
          position: relative; z-index: 1;
          display: flex; flex-direction: column;
          gap: 4px;
        }
        .sh-hero-eyebrow {
          font-size: 10.5px; font-weight: 800;
          text-transform: uppercase; letter-spacing: 0.12em;
          color: rgba(255,255,255,0.85);
          margin-bottom: 4px;
        }
        .sh-hero-icon {
          display: inline-flex;
          width: 40px; height: 40px;
          border-radius: 11px;
          align-items: center; justify-content: center;
          background: rgba(255,255,255,0.15);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255,255,255,0.25);
          color: #fff;
          margin-bottom: 10px;
        }
        .sh-hero-icon svg { width: 22px; height: 22px; }
        .sh-hero-title {
          font-size: 24px; font-weight: 900;
          letter-spacing: -0.02em;
          color: #fff;
          line-height: 1.05;
          margin-bottom: 6px;
        }
        .sh-hero-desc {
          font-size: 13px;
          color: rgba(255,255,255,0.85);
          line-height: 1.5;
          max-width: 90%;
          margin-bottom: 12px;
        }
        .sh-hero-cta {
          display: inline-flex; align-items: center; gap: 6px;
          align-self: flex-start;
          padding: 7px 14px;
          border-radius: 999px;
          font-size: 12.5px; font-weight: 700;
          background: rgba(255,255,255,0.18);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255,255,255,0.28);
          color: #fff;
          transition: background .15s, transform .15s;
        }
        .sh-hero-card:hover .sh-hero-cta {
          background: rgba(255,255,255,0.28);
          transform: translateX(2px);
        }

        /* Bendruomenė panel — big shortcut links */
        .sh-bigshortcut {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 14px;
          border-radius: 12px;
          text-decoration: none;
          background: linear-gradient(135deg, rgba(var(--it-rgb), 0.13) 0%, rgba(var(--it-rgb), 0.04) 100%);
          border: 1px solid rgba(var(--it-rgb), 0.22);
          transition: transform .15s, border-color .15s;
        }
        .sh-bigshortcut:hover {
          transform: translateX(2px);
          border-color: rgba(var(--it-rgb), 0.5);
        }
        .sh-bigshortcut-icon {
          flex-shrink: 0;
          width: 36px; height: 36px;
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          color: #fff;
          background: linear-gradient(135deg, rgba(var(--it-rgb), 1) 0%, rgba(var(--it-rgb), 0.75) 100%);
          box-shadow: 0 4px 12px rgba(var(--it-rgb), 0.3);
        }
        .sh-bigshortcut-icon svg { width: 18px; height: 18px; }
        .sh-bigshortcut-title {
          display: block;
          font-size: 13.5px; font-weight: 700;
          color: var(--text-primary);
          line-height: 1.2;
        }
        .sh-bigshortcut-desc {
          display: block;
          font-size: 11.5px;
          color: var(--text-muted);
          margin-top: 2px;
        }

        /* Skelbimai panel — kategorijų plytelės */
        .sh-cat-tile {
          display: flex; flex-direction: column; align-items: center;
          gap: 8px;
          padding: 14px 10px;
          border-radius: 12px;
          text-decoration: none;
          background: linear-gradient(135deg, rgba(var(--it-rgb), 0.14) 0%, rgba(var(--it-rgb), 0.04) 100%);
          border: 1px solid rgba(var(--it-rgb), 0.22);
          transition: transform .15s, border-color .15s;
          text-align: center;
        }
        .sh-cat-tile:hover {
          transform: translateY(-2px);
          border-color: rgba(var(--it-rgb), 0.5);
        }
        .sh-cat-icon {
          display: flex;
          width: 32px; height: 32px;
          border-radius: 9px;
          align-items: center; justify-content: center;
          color: #fff;
          background: linear-gradient(135deg, rgba(var(--it-rgb), 1) 0%, rgba(var(--it-rgb), 0.75) 100%);
          box-shadow: 0 4px 10px rgba(var(--it-rgb), 0.3);
        }
        .sh-cat-icon svg { width: 16px; height: 16px; }
        .sh-cat-label {
          font-size: 11.5px; font-weight: 700;
          color: var(--text-primary);
          line-height: 1.2;
        }

        /* CTA shortcuts juosta (panel'o apačia) */
        .sh-panel-shortcuts {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-top: 14px;
          padding-top: 14px;
          border-top: 1px solid var(--border-default);
        }
        .sh-shortcut {
          font-size: 12px; font-weight: 600;
          padding: 5px 10px;
          border-radius: 7px;
          text-decoration: none;
          color: var(--text-secondary);
          transition: background .15s, color .15s;
        }
        .sh-shortcut:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        /* ── Responsive ── */
        .sh-desktop-search { display: flex; }
        .sh-desktop-nav    { display: flex; }
        /* Search icon header'yje — atvirkštinė taisyklė: rodom tik kai
           inline search bar'as paslėptas. Above 1080px → bar matomas, ikona
           paslėpta. Below 1080px → bar paslėptas, ikona matoma. */
        .sh-search-icon { display: none; }
        @media (max-width: 1080px) {
          .sh-desktop-search { display: none !important; }
          .sh-desktop-nav    { display: none !important; }
          .sh-search-icon    { display: flex !important; }
        }
        /* Suppress Safari/Mac fokuso "white ring" ir Firefox dotted outline'ą,
           paliekam tik :hover/active border'į. Be focus-visible custom style'o
           — keyboard-only naviguotojai vis tiek matys, kad button focused per
           jo backgrounds + chevron pointer'į. */
        .sh-desktop-search:focus,
        .sh-desktop-search:focus-visible {
          outline: none !important;
          box-shadow: none !important;
        }
        .sh-desktop-search::-moz-focus-inner { border: 0; }
        /* Hover'is per CSS — JS toggle'as su borderColor palikdavo stuck'ą
           border'į kai kuriose naršyklėse. Inline border shorthand'as +
           hover override'as longhand'u — clean'iau. */
        .sh-desktop-search:hover {
          border-color: var(--accent-orange) !important;
          background: var(--bg-hover) !important;
          box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.12);
        }

        /* ── Mobile drawer (full-screen modal) ── */
        .sh-overlay {
          position: fixed; inset: 0; z-index: 200;
          background: rgba(0,0,0,0.55); backdrop-filter: blur(6px);
          opacity: 0; pointer-events: none; transition: opacity .22s;
        }
        .sh-overlay.open { opacity: 1; pointer-events: all; }
        .sh-drawer {
          position: fixed; top: 0; left: 0; bottom: 0; z-index: 201;
          width: 360px;
          transform: translateX(-100%);
          transition: transform .25s cubic-bezier(.4,0,.2,1);
          display: flex; flex-direction: column;
        }
        .sh-drawer.open { transform: translateX(0); }
        /* Mobile: full-screen */
        @media (max-width: 600px) {
          .sh-drawer { width: 100vw; }
        }

        /* Top bar — kontekstinis */
        .sh-mtop {
          flex-shrink: 0;
          height: 54px;
          display: flex; align-items: center;
          padding: 0 12px;
          gap: 4px;
          border-bottom: 1px solid var(--border-default);
        }
        .sh-mtop-title {
          font-size: 16px; font-weight: 800;
          color: var(--text-primary);
          letter-spacing: -0.01em;
          margin-left: 4px;
        }
        .sh-mtop-btn {
          flex-shrink: 0;
          width: 36px; height: 36px;
          border-radius: 9px;
          border: none; background: transparent;
          color: var(--text-secondary);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          transition: background .12s, color .12s;
        }
        .sh-mtop-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

        /* Body — flex 1, scroll inside */
        .sh-mbody {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }

        /* MAIN VIEW — clean text-row list (no gradients) */
        .sh-mlist {
          display: flex; flex-direction: column;
          padding: 4px 0;
        }
        .sh-mrow {
          display: flex; align-items: center; gap: 14px;
          padding: 14px 16px;
          width: 100%;
          border: none; background: transparent;
          text-align: left;
          font-family: inherit;
          cursor: pointer;
          transition: background .12s;
          border-bottom: 1px solid var(--border-default);
          position: relative;
        }
        .sh-mrow:last-child { border-bottom: none; }
        .sh-mrow:hover, .sh-mrow:active { background: var(--bg-hover); }
        .sh-mrow.active::before {
          content: '';
          position: absolute;
          left: 0; top: 12px; bottom: 12px;
          width: 3px;
          border-radius: 0 3px 3px 0;
          background: var(--accent-orange);
        }

        /* Mobile row ikona — monochrome solid look (be per-section spalvų).
           Subtle dark plate + neutralus icon spalva — atrodo professional
           kaip iOS Settings / macOS sidebar. */
        .sh-mrow-icon {
          flex-shrink: 0;
          width: 38px; height: 38px;
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          color: var(--text-primary);
          background: var(--bg-hover);
          border: 1px solid var(--border-default);
        }
        .sh-mrow-icon svg { width: 19px; height: 19px; stroke-width: 2; }
        /* Active row — accent ring around icon (orange brand color) */
        .sh-mrow.active .sh-mrow-icon {
          color: var(--accent-orange);
          border-color: var(--accent-orange);
          background: rgba(249, 115, 22, 0.08);
        }
        .sh-mrow-text {
          flex: 1; min-width: 0;
          display: flex; flex-direction: column;
          gap: 3px;
        }
        .sh-mrow-title {
          font-size: 15.5px; font-weight: 700;
          color: var(--text-primary);
          line-height: 1.2;
          letter-spacing: -0.01em;
        }
        .sh-mrow-desc {
          font-size: 12.5px; font-weight: 500;
          color: var(--text-muted);
          line-height: 1.3;
        }
        .sh-mrow-arrow {
          flex-shrink: 0;
          color: var(--text-muted);
          opacity: 0.4;
          display: flex;
        }

        /* DRILLED-IN section view — scrollable */
        .sh-msection {
          padding: 12px 14px 16px;
        }

        /* Footer — theme toggle */
        .sh-mfoot {
          flex-shrink: 0;
          padding: 10px 14px;
          border-top: 1px solid var(--border-default);
        }
        .sh-mfoot-btn {
          display: flex; align-items: center; justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 10px 14px;
          border-radius: 10px;
          border: none;
          background: var(--bg-hover);
          color: var(--text-secondary);
          font-size: 13px; font-weight: 700;
          font-family: inherit;
          cursor: pointer;
          transition: background .12s;
        }
        .sh-mfoot-btn:hover { background: var(--border-default); color: var(--text-primary); }

        .sh-mnav {
          flex: 1;
          padding: 14px;
          display: flex; flex-direction: column;
          gap: 10px;
        }
        .sh-mcard {
          position: relative;
          display: flex; align-items: center; gap: 14px;
          padding: 14px 16px;
          border-radius: 16px;
          text-decoration: none;
          background: linear-gradient(135deg, rgba(var(--it-rgb), 0.14) 0%, rgba(var(--it-rgb), 0.04) 100%);
          border: 1px solid rgba(var(--it-rgb), 0.22);
          transition: transform .15s, background .15s, border-color .15s;
          overflow: hidden;
          min-height: 64px;
        }
        .sh-mcard::before {
          content: '';
          position: absolute;
          top: -40px; right: -40px;
          width: 130px; height: 130px;
          background: radial-gradient(circle, rgba(var(--it-rgb), 1) 0%, transparent 70%);
          opacity: 0.10;
          pointer-events: none;
        }
        .sh-mcard:active { transform: scale(0.98); }
        .sh-mcard.active {
          background: linear-gradient(135deg, rgba(var(--it-rgb), 0.25) 0%, rgba(var(--it-rgb), 0.08) 100%);
          border-color: rgba(var(--it-rgb), 0.55);
        }
        .sh-mcard-icon {
          flex-shrink: 0;
          width: 44px; height: 44px;
          border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          color: #fff;
          background: linear-gradient(135deg, rgba(var(--it-rgb), 1) 0%, rgba(var(--it-rgb), 0.75) 100%);
          box-shadow: 0 8px 18px rgba(var(--it-rgb), 0.35), inset 0 1px 0 rgba(255,255,255,0.25);
        }
        .sh-mcard-icon svg { width: 22px; height: 22px; }
        .sh-mcard-text { flex: 1; min-width: 0; }
        .sh-mcard-title {
          font-size: 15.5px; font-weight: 800;
          color: var(--text-primary);
          line-height: 1.2;
          margin-bottom: 3px;
          letter-spacing: -0.01em;
        }
        .sh-mcard-desc {
          font-size: 12.5px; font-weight: 500;
          color: var(--text-secondary);
          line-height: 1.35;
          opacity: 0.85;
        }
        .sh-mcard-arrow {
          flex-shrink: 0;
          color: rgba(var(--it-rgb), 1);
          opacity: 0.6;
          transition: transform .22s ease;
        }
        /* Mobile drawer expansion — kompaktinis dropdown turinys */
        .sh-mwrap { display: flex; flex-direction: column; }
        .sh-mcard.expanded {
          background: linear-gradient(135deg, rgba(var(--it-rgb), 0.22) 0%, rgba(var(--it-rgb), 0.07) 100%);
          border-color: rgba(var(--it-rgb), 0.5);
        }
        .sh-mexp {
          padding: 10px 4px 4px;
          display: flex; flex-direction: column;
          gap: 8px;
        }
        .sh-mexp-cta {
          display: inline-flex; align-items: center; gap: 6px;
          align-self: flex-start;
          padding: 6px 12px;
          border-radius: 999px;
          font-size: 11.5px; font-weight: 700;
          text-decoration: none;
          color: rgba(var(--it-rgb), 1);
          background: rgba(var(--it-rgb), 0.12);
          border: 1px solid rgba(var(--it-rgb), 0.35);
          transition: background .15s, border-color .15s;
        }
        .sh-mexp-cta:hover {
          background: rgba(var(--it-rgb), 0.22);
          border-color: rgba(var(--it-rgb), 0.55);
        }
        .sh-mexp-section {
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 4px;
          margin-top: 4px;
        }
        .sh-mexp-title {
          font-size: 10px; font-weight: 800;
          text-transform: uppercase; letter-spacing: 0.1em;
          color: var(--text-muted);
        }
        .sh-mexp-more {
          display: inline-flex; align-items: center; gap: 3px;
          font-size: 10px; font-weight: 700;
          padding: 2px 6px;
          border-radius: 5px;
          color: var(--text-secondary);
          text-decoration: none;
        }
        .sh-mexp-more:hover { background: var(--bg-hover); color: var(--text-primary); }

        .sh-mexp-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
        }
        .sh-mexp-tile {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 10px;
          border-radius: 10px;
          text-decoration: none;
          background: linear-gradient(135deg, rgba(var(--it-rgb), 0.12) 0%, rgba(var(--it-rgb), 0.04) 100%);
          border: 1px solid rgba(var(--it-rgb), 0.20);
          transition: background .15s, border-color .15s, transform .15s;
        }
        .sh-mexp-tile:active { transform: scale(0.97); }
        .sh-mexp-tile:hover {
          background: linear-gradient(135deg, rgba(var(--it-rgb), 0.20) 0%, rgba(var(--it-rgb), 0.06) 100%);
          border-color: rgba(var(--it-rgb), 0.45);
        }
        .sh-mexp-tile-icon {
          flex-shrink: 0;
          width: 26px; height: 26px;
          border-radius: 7px;
          display: flex; align-items: center; justify-content: center;
          color: #fff;
          background: linear-gradient(135deg, rgba(var(--it-rgb), 1) 0%, rgba(var(--it-rgb), 0.75) 100%);
          box-shadow: 0 3px 8px rgba(var(--it-rgb), 0.3);
        }
        .sh-mexp-tile-icon svg { width: 14px; height: 14px; }
        .sh-mexp-tile-label {
          font-size: 11.5px; font-weight: 700;
          color: var(--text-primary);
          line-height: 1.2;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>

      {/* ─── HEADER BAR ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50" style={{ background: bg, backdropFilter: 'blur(22px)', borderBottom: bdr }}>
        <div style={{ maxWidth: 1360, margin: '0 auto', padding: '0 20px', height: 56, display: 'flex', alignItems: 'center', gap: 14 }}>

          <button onClick={() => setMenuOpen(true)} aria-label="Meniu"
            style={{ flexShrink: 0, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', cursor: 'pointer', color: hamColor, borderRadius: 8, transition: 'color .15s, background .15s' }}
            onMouseEnter={e => { e.currentTarget.style.color = navHover; e.currentTarget.style.background = navHoverBg }}
            onMouseLeave={e => { e.currentTarget.style.color = hamColor; e.currentTarget.style.background = 'transparent' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>

          <Link href="/" style={{ flexShrink: 0, textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
            <span style={{ fontWeight: 900, fontSize: 21, letterSpacing: '-0.02em', color: logoColor }}>music</span>
            <span style={{ fontWeight: 900, fontSize: 21, letterSpacing: '-0.02em', color: 'var(--accent-orange)' }}>.lt</span>
          </Link>

          {/* Desktop nav with rich dropdowns */}
          <nav className="sh-desktop-nav" style={{ alignItems: 'center', gap: 2, marginLeft: 10, flexShrink: 0 }}>
            {NAV.map(n => {
              const active = isActive(n)
              const closing = closingKey === n.key
              return (
                <div key={n.label} className={`sh-group${closing ? ' closing' : ''}`}>
                  <Link
                    href={n.href}
                    className={`sh-navlink${active ? ' active' : ''}`}
                    onClick={() => {
                      setClosingKey(n.key)
                      setTimeout(() => setClosingKey(null), 600)
                    }}
                  >
                    {n.label}
                  </Link>
                  <div
                    className="sh-dropdown-wrap"
                    style={{ ['--panel-accent' as any]: n.accent }}
                    onClick={() => {
                      // Bet koks click'as dropdown'o viduje (paprastai ant Link'o)
                      // — uždaro panel'ą iškart, kad nesimatytų po hover'iu
                      // kol page'as krautųsi.
                      setClosingKey(n.key)
                      setTimeout(() => setClosingKey(null), 600)
                    }}
                  >
                    {renderPanel(n.key, n.accent)}
                  </div>
                </div>
              )
            })}
          </nav>

          {/* Paieškos trigger'is — pagrindinis page elementas. Padidinom
              dydį (380px max), brand orange ikoną, "Ieškoti" tekstą bold'esnį.
              Hover'is per CSS (.sh-desktop-search:hover) — neturi sticky
              border'io bug'o. ⌘K shortcut'as išmestas — tai techninis hint'as,
              kuris apkrovė nav'ą. */}
          <button
            type="button"
            onClick={openSearch}
            className="sh-desktop-search"
            aria-label="Atidaryti paiešką"
            style={{
              flex: '1 1 380px', maxWidth: 460, marginLeft: 'auto',
              alignItems: 'center', borderRadius: 22,
              background: inputBg, border: inputBdr,
              padding: '0 16px',
              height: 38,
              cursor: 'pointer',
              transition: 'border-color .15s, background .15s, box-shadow .15s',
              fontFamily: 'inherit',
              outline: 'none',
              WebkitTapHighlightColor: 'transparent',
              gap: 12,
            }}
          >
            <span style={{ display: 'flex', color: 'var(--accent-orange)', flexShrink: 0 }}>
              <SearchIcon />
            </span>
            <span style={{
              flex: 1, fontSize: 14, fontWeight: 600,
              color: 'var(--text-secondary)', textAlign: 'left',
              letterSpacing: '-0.005em',
            }}>
              Ieškoti
            </span>
          </button>

          <div style={{ flexShrink: 0, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Search icon — rodom tik kai inline search bar'as paslėptas
                (≤1080px), kad neprasidėtų redundancy su sh-desktop-search. */}
            <button
              type="button"
              onClick={openSearch}
              aria-label="Atidaryti paiešką"
              className="sh-search-icon"
              style={{
                width: 34, height: 34,
                // display: paliekam CSS klasėje (display:none default + flex
                // ≤1080px). Inline style'as override'intų klasę ir ikona
                // visada būtų matoma — tai sukėlė dvigubą paiešką desktop'e.
                alignItems: 'center', justifyContent: 'center',
                border: 'none', background: 'transparent', cursor: 'pointer',
                color: 'var(--text-muted)', borderRadius: 8,
                transition: 'color .15s, background .15s',
                outline: 'none',
                WebkitTapHighlightColor: 'transparent',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
              </svg>
            </button>
            <MessagesBell />
            <NotificationsBell />
            <HeaderAuth />
          </div>
        </div>
      </header>

      {/* ─── MOBILE DRAWER (full-screen modal su drill-in pattern) ─── */}
      <div className={`sh-overlay${menuOpen ? ' open' : ''}`} onClick={() => setMenuOpen(false)} />

      <div className={`sh-drawer${menuOpen ? ' open' : ''}`} style={{ background: drawerBg }}>

        {/* TOP BAR — kontekstinis */}
        <div className="sh-mtop">
          {drawerView === 'main' ? (
            <>
              <Link href="/" onClick={() => setMenuOpen(false)} style={{ textDecoration: 'none' }}>
                <span style={{ fontWeight: 900, fontSize: 20, color: logoColor }}>music</span>
                <span style={{ fontWeight: 900, fontSize: 20, color: 'var(--accent-orange)' }}>.lt</span>
              </Link>
              <button onClick={() => setMenuOpen(false)} aria-label="Uždaryti" className="sh-mtop-btn" style={{ marginLeft: 'auto' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setDrawerView('main')} aria-label="Atgal" className="sh-mtop-btn">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
              </button>
              <span className="sh-mtop-title">
                {NAV.find(n => n.key === drawerView)?.label}
              </span>
              <button onClick={() => setMenuOpen(false)} aria-label="Uždaryti" className="sh-mtop-btn" style={{ marginLeft: 'auto' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </>
          )}
        </div>

        {/* CONTENT */}
        <div className="sh-mbody">
          {drawerView === 'main' ? (
            <nav className="sh-mlist">
              {NAV.map(n => {
                const active = isActive(n)
                return (
                  <button
                    key={n.label}
                    type="button"
                    onClick={() => setDrawerView(n.key)}
                    className={`sh-mrow${active ? ' active' : ''}`}
                  >
                    <span className="sh-mrow-icon">{n.icon}</span>
                    <span className="sh-mrow-text">
                      <span className="sh-mrow-title">{n.label}</span>
                      <span className="sh-mrow-desc">{n.desc}</span>
                    </span>
                    <span className="sh-mrow-arrow">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </span>
                  </button>
                )
              })}
            </nav>
          ) : (
            <div className="sh-msection">
              <MobileExpansion
                navKey={drawerView}
                data={preview}
                accent={NAV.find(n => n.key === drawerView)?.accent || '#f59e0b'}
                onLink={() => setMenuOpen(false)}
              />
            </div>
          )}
        </div>

        {/* Theme toggle — fixed footer (rodom tik main view'e) */}
        {drawerView === 'main' && (
          <div className="sh-mfoot">
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="sh-mfoot-btn">
              {dk ? <><SunIcon /> Šviesi tema</> : <><MoonIcon /> Tamsi tema</>}
            </button>
          </div>
        )}
      </div>

      <MasterSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  )
}
