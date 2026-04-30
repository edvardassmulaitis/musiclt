'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HeaderAuth } from '@/components/HeaderAuth'
import { NotificationsBell } from '@/components/NotificationsBell'
import { MessagesBell } from '@/components/MessagesBell'
import { MasterSearch } from '@/components/MasterSearch'
import { useSite } from '@/components/SiteContext'

/* ──────────────────────────────────────────────────────────────────
 * Top meniu — 5 grupės.
 *   Desktop: glass mega-dropdown su gradient kortelėmis ir stagger anim.
 *   Mobile drawer: kompaktinis 2-col grid — visi itemai matomi be scroll'o.
 * ────────────────────────────────────────────────────────────────── */

type SubItem = {
  label: string
  href: string
  desc?: string
  icon: React.ReactNode
  accent: string
  soon?: boolean
}
type NavGroup = {
  label: string
  href?: string
  accent: string                // grupės pirminė spalva (dropdown'o decoration'ui)
  cols?: 1 | 2
  items: SubItem[]
}

/* ── Item icons ── */
const I = {
  artist: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0 1 14 0v1"/>
    </svg>
  ),
  album: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  genre: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12 5 5l7 2 7-2 2 7-2 7-7-2-7 2Z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  song: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
    </svg>
  ),
  trophy: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M17 4h3v3a3 3 0 0 1-3 3M7 4H4v3a3 3 0 0 0 3 3"/>
    </svg>
  ),
  vote: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 12 2 2 4-4"/><rect x="3" y="4" width="18" height="16" rx="2"/>
    </svg>
  ),
  award: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="9" r="6"/><path d="M8.21 13.89 7 22l5-3 5 3-1.21-8.11"/>
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>
    </svg>
  ),
  festival: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21V8l9-5 9 5v13"/><path d="M9 21V12h6v9"/><circle cx="12" cy="9" r="1.5"/>
    </svg>
  ),
  gallery: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>
    </svg>
  ),
  news: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8V6Z"/>
    </svg>
  ),
  boombox: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="8" width="18" height="12" rx="2"/><circle cx="8" cy="14" r="2"/><circle cx="16" cy="14" r="2"/><path d="M7 8V5a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v3"/>
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-3.5-7.1L21 4l-1 4A9 9 0 0 1 21 12Z"/>
    </svg>
  ),
  game: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 12h4M8 10v4"/><circle cx="15" cy="11" r="1" fill="currentColor"/><circle cx="17.5" cy="13.5" r="1" fill="currentColor"/>
      <path d="M17.32 5H6.68A4.68 4.68 0 0 0 2 9.68V14a4 4 0 0 0 6.7 2.95l.6-.55h5.4l.6.55A4 4 0 0 0 22 14V9.68A4.68 4.68 0 0 0 17.32 5Z"/>
    </svg>
  ),
  quiz: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  forum: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 8h2a2 2 0 0 1 2 2v9l-3-3h-7a2 2 0 0 1-2-2v-1"/><path d="M3 13V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6l-3 3Z"/>
    </svg>
  ),
  blog: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3v6h6"/><path d="M19 9v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7Z"/><path d="M9 13h6M9 17h4"/>
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  pencil: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>
    </svg>
  ),
}

const NAV: NavGroup[] = [
  {
    label: 'Muzika',
    href: '/atlikejai',
    accent: '#f59e0b',
    cols: 2,
    items: [
      { label: 'Atlikėjai ir grupės', href: '/atlikejai',    desc: 'Lietuvos scenos žemėlapis',          icon: I.artist, accent: '#f59e0b' },
      { label: 'Albumai',             href: '/albumai',      desc: 'Visi albumai vienoje vietoje',       icon: I.album,  accent: '#f97316', soon: true },
      { label: 'Žanrai ir stiliai',   href: '/zanrai',       desc: 'Naršyk pagal stiliaus paletę',       icon: I.genre,  accent: '#a855f7', soon: true },
      { label: 'Dienos daina',        href: '/dienos-daina', desc: 'Redakcijos pasirinkimas šiandien',   icon: I.song,   accent: '#10b981' },
    ],
  },
  {
    label: 'Topai ir balsavimai',
    href: '/topas',
    accent: '#ef4444',
    cols: 1,
    items: [
      { label: 'Topai',         href: '/topas',         desc: 'Savaitės, mėnesio ir visų laikų reitingai', icon: I.trophy, accent: '#ef4444' },
      { label: 'Balsavimai',    href: '/balsavimai',    desc: 'Aktualūs balsavimai ir reitingai',          icon: I.vote,   accent: '#ec4899' },
      { label: 'Apdovanojimai', href: '/apdovanojimai', desc: 'M.A.M.A., Bravo ir kiti laureatai',         icon: I.award,  accent: '#eab308', soon: true },
    ],
  },
  {
    label: 'Renginiai',
    href: '/renginiai',
    accent: '#3b82f6',
    cols: 2,
    items: [
      { label: 'Visi renginiai', href: '/renginiai',   desc: 'Artimiausi koncertai ir vakarėliai',  icon: I.calendar, accent: '#3b82f6' },
      { label: 'Festivaliai',    href: '/festivaliai', desc: 'Vasaros festivaliai ir line-up\'ai',   icon: I.festival, accent: '#06b6d4', soon: true },
      { label: 'Foto galerija',  href: '/galerija',    desc: 'Reportažai iš koncertų ir užkulisių', icon: I.gallery,  accent: '#ec4899', soon: true },
      { label: 'Naujienos',      href: '/naujienos',   desc: 'Scenos pulsas, releases, interviu',   icon: I.news,     accent: '#0ea5e9', soon: true },
    ],
  },
  {
    label: 'Pramogos',
    href: '/boombox',
    accent: '#f97316',
    cols: 1,
    items: [
      { label: 'Boombox',  href: '/boombox',  desc: 'Atrask atlikėjus swipe stiliumi',     icon: I.boombox, accent: '#f97316' },
      { label: 'Žaidimai', href: '/zaidimai', desc: 'Atspėk dainą, chronologijos iššūkis', icon: I.game,    accent: '#6366f1', soon: true },
      { label: 'Kvizai',   href: '/kvizai',   desc: 'Testai LT muzikos žinovams',          icon: I.quiz,    accent: '#14b8a6', soon: true },
    ],
  },
  {
    label: 'Žmonės',
    href: '/pokalbiai',
    accent: '#8b5cf6',
    cols: 2,
    items: [
      { label: 'Pokalbiai',     href: '/pokalbiai',     desc: 'Privačios žinutės ir grupės',     icon: I.chat,   accent: '#06b6d4' },
      { label: 'Diskusijos',    href: '/diskusijos',    desc: 'Forumo temos ir debatai',         icon: I.forum,  accent: '#8b5cf6' },
      { label: 'Tinklaraščiai', href: '/blogas',        desc: 'Vartotojų straipsniai',           icon: I.blog,   accent: '#a855f7', soon: true },
      { label: 'Vartotojai',    href: '/vartotojai',    desc: 'Aktyviausi bendruomenės nariai',  icon: I.users,  accent: '#f97316', soon: true },
      { label: 'Rašyti įrašą',  href: '/blogas/rasyti', desc: 'Pradėk savo blogą',               icon: I.pencil, accent: '#14b8a6' },
    ],
  },
]

/* ── Header chrome ── */
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
const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
)
const ChevronIcon = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 4 }}>
    <polyline points="6 9 12 15 18 9"/>
  </svg>
)

/* hex (#rrggbb) → "r, g, b" */
function hexToRgb(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `${r}, ${g}, ${b}`
}

export function SiteHeader() {
  const { theme, setTheme, dk } = useSite()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  // Cmd/Ctrl+K bei "/" atidaro paiešką (ignoruojam type'inant į kitą input'ą).
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
  const activeColor = 'var(--accent-link)'
  const activeBg    = 'rgba(96, 165, 250, 0.1)'
  const logoColor   = 'var(--text-primary)'
  const inputBg     = 'var(--input-bg)'
  const inputBdr    = '1px solid var(--input-border)'
  const mutedIcon   = 'var(--text-muted)'
  const drawerBg    = 'var(--bg-surface)'
  const hamColor    = 'var(--text-muted)'

  const isActive      = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href)
  const isGroupActive = (g: NavGroup) => (g.href && isActive(g.href)) || g.items.some(it => isActive(it.href))

  return (
    <>
      <style>{`
        /* ── Top-level nav button ── */
        .sh-navlink {
          display: inline-flex; align-items: center;
          font-size: 13px; font-weight: 600;
          padding: 6px 11px; border-radius: 8px;
          text-decoration: none;
          transition: color .13s, background .13s;
          white-space: nowrap; cursor: pointer;
          color: ${navColor}; background: transparent;
          border: none; font-family: inherit;
        }
        .sh-navlink:hover { color: ${navHover}; background: ${navHoverBg}; }
        .sh-navlink.active { color: ${activeColor}; background: ${activeBg}; }
        .sh-navlink.active:hover { color: ${activeColor}; background: ${activeBg}; }
        .sh-navlink svg { transition: transform .2s ease; }
        .sh-group:hover .sh-navlink svg { transform: rotate(180deg); }

        /* ── Glass mega-dropdown ── */
        .sh-group { position: relative; }
        .sh-dropdown {
          position: absolute; top: 100%; left: 0;
          padding: 16px;
          background: rgba(var(--bg-surface-rgb), 0.85);
          backdrop-filter: blur(40px) saturate(180%);
          -webkit-backdrop-filter: blur(40px) saturate(180%);
          border: 1px solid rgba(var(--bg-surface-rgb), 0.5);
          border-radius: 22px;
          box-shadow:
            0 30px 80px rgba(0,0,0,0.35),
            0 8px 20px rgba(0,0,0,0.15),
            inset 0 1px 0 rgba(255,255,255,0.06);
          opacity: 0; pointer-events: none;
          transform: translateY(-10px) scale(0.98);
          transition: opacity .22s ease, transform .22s ease;
          z-index: 100;
          margin-top: 10px;
          overflow: hidden;
        }
        /* Spalvotas glow viršutiniame kampe — group accent */
        .sh-dropdown::after {
          content: '';
          position: absolute; top: -120px; right: -120px;
          width: 280px; height: 280px;
          background: radial-gradient(circle, rgba(var(--gp-rgb), 1) 0%, transparent 70%);
          opacity: 0.18;
          pointer-events: none;
          z-index: 0;
        }
        .sh-dropdown.cols-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; min-width: 580px; }
        .sh-dropdown.cols-1 { display: flex; flex-direction: column; gap: 6px; min-width: 360px; }
        .sh-dropdown::before {
          content: ''; position: absolute;
          top: -12px; left: 0; right: 0; height: 12px;
          z-index: 1;
        }
        .sh-group:hover > .sh-dropdown,
        .sh-group:focus-within > .sh-dropdown {
          opacity: 1; pointer-events: auto;
          transform: translateY(0) scale(1);
        }
        /* shift dropdown right for groups near right edge */
        .sh-group:nth-last-of-type(-n+2) > .sh-dropdown { left: auto; right: 0; }

        /* ── Mega-item: gradient + lift + glow ── */
        .sh-megaitem {
          position: relative;
          display: flex; align-items: flex-start; gap: 14px;
          padding: 14px;
          border-radius: 14px;
          text-decoration: none;
          color: ${navColor};
          background: linear-gradient(135deg, rgba(var(--it-rgb), 0.10) 0%, rgba(var(--it-rgb), 0.03) 100%);
          border: 1px solid rgba(var(--it-rgb), 0.18);
          transition: transform .22s ease, border-color .22s ease, box-shadow .22s ease, background .22s ease, opacity .25s ease;
          opacity: 0;
          transform: translateY(8px);
          z-index: 1;
          overflow: hidden;
        }
        .sh-group:hover .sh-megaitem,
        .sh-group:focus-within .sh-megaitem {
          opacity: 1; transform: translateY(0);
        }
        /* stagger animation — kortelės įplaukia po vieną */
        .sh-group:hover .sh-megaitem:nth-child(1),
        .sh-group:focus-within .sh-megaitem:nth-child(1) { transition-delay: 30ms; }
        .sh-group:hover .sh-megaitem:nth-child(2),
        .sh-group:focus-within .sh-megaitem:nth-child(2) { transition-delay: 70ms; }
        .sh-group:hover .sh-megaitem:nth-child(3),
        .sh-group:focus-within .sh-megaitem:nth-child(3) { transition-delay: 110ms; }
        .sh-group:hover .sh-megaitem:nth-child(4),
        .sh-group:focus-within .sh-megaitem:nth-child(4) { transition-delay: 150ms; }
        .sh-group:hover .sh-megaitem:nth-child(5),
        .sh-group:focus-within .sh-megaitem:nth-child(5) { transition-delay: 190ms; }

        .sh-megaitem:hover {
          transform: translateY(-3px);
          border-color: rgba(var(--it-rgb), 0.55);
          background: linear-gradient(135deg, rgba(var(--it-rgb), 0.20) 0%, rgba(var(--it-rgb), 0.06) 100%);
          box-shadow:
            0 14px 32px rgba(var(--it-rgb), 0.25),
            0 4px 10px rgba(var(--it-rgb), 0.10);
        }
        .sh-megaitem.active {
          background: linear-gradient(135deg, rgba(var(--it-rgb), 0.28) 0%, rgba(var(--it-rgb), 0.10) 100%);
          border-color: rgba(var(--it-rgb), 0.6);
        }
        .sh-megaitem.active .sh-mega-lbl { color: ${navHover}; }

        .sh-megaicon {
          flex-shrink: 0;
          width: 44px; height: 44px;
          border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          color: #fff;
          background: linear-gradient(135deg, rgba(var(--it-rgb), 1) 0%, rgba(var(--it-rgb), 0.75) 100%);
          box-shadow:
            0 8px 16px rgba(var(--it-rgb), 0.35),
            inset 0 1px 0 rgba(255, 255, 255, 0.25);
          transition: transform .25s ease;
        }
        .sh-megaitem:hover .sh-megaicon { transform: scale(1.08) rotate(-3deg); }
        .sh-megaicon svg { width: 22px; height: 22px; }

        .sh-mega-text { flex: 1; min-width: 0; padding-top: 2px; }
        .sh-mega-lbl-row { display: flex; align-items: center; gap: 7px; margin-bottom: 4px; flex-wrap: wrap; }
        .sh-mega-lbl {
          font-size: 14.5px; font-weight: 700;
          color: ${navHover};
          line-height: 1.2;
          letter-spacing: -0.01em;
        }
        .sh-mega-soon {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 9px; font-weight: 800;
          text-transform: uppercase; letter-spacing: 0.08em;
          padding: 2px 7px;
          border-radius: 999px;
          background: rgba(var(--it-rgb), 0.15);
          color: rgba(var(--it-rgb), 1);
          border: 1px solid rgba(var(--it-rgb), 0.35);
        }
        .sh-mega-soon::before {
          content: ''; width: 5px; height: 5px;
          border-radius: 50%; background: currentColor;
          animation: sh-pulse 1.8s infinite;
        }
        @keyframes sh-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.5; transform: scale(1.4); }
        }
        .sh-mega-desc {
          display: block;
          font-size: 12.5px; font-weight: 500;
          color: ${navColor};
          line-height: 1.4;
          opacity: 0.85;
        }

        /* ── Responsive ── */
        .sh-desktop-search { display: flex; }
        .sh-desktop-nav    { display: flex; }
        @media (max-width: 1180px) {
          .sh-desktop-search { display: none !important; }
          .sh-desktop-nav    { display: none !important; }
        }

        /* ── Mobile drawer ── */
        .sh-overlay {
          position: fixed; inset: 0; z-index: 200;
          background: rgba(0,0,0,0.55); backdrop-filter: blur(6px);
          opacity: 0; pointer-events: none; transition: opacity .22s;
        }
        .sh-overlay.open { opacity: 1; pointer-events: all; }
        .sh-drawer {
          position: fixed; top: 0; left: 0; bottom: 0; z-index: 201;
          width: 320px;
          transform: translateX(-100%);
          transition: transform .25s cubic-bezier(.4,0,.2,1);
          display: flex; flex-direction: column;
        }
        .sh-drawer.open { transform: translateX(0); }

        /* Mobile: kompaktinis 2-col grid — visi itemai matomi be scroll'o */
        .sh-mgroup { padding: 8px 10px 0; }
        .sh-mgroup-title {
          display: flex; align-items: center; gap: 8px;
          padding: 0 4px 6px;
          font-size: 11px; font-weight: 800;
          letter-spacing: 0.08em;
          color: var(--text-primary);
        }
        .sh-mgroup-title-dot {
          width: 7px; height: 7px;
          border-radius: 50%;
          box-shadow: 0 0 0 3px rgba(var(--gp-rgb), 0.18);
        }
        .sh-mgrid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
        }
        .sh-mcard {
          position: relative;
          display: flex; align-items: center; gap: 8px;
          padding: 8px 10px;
          border-radius: 10px;
          text-decoration: none;
          background: linear-gradient(135deg, rgba(var(--it-rgb), 0.10) 0%, rgba(var(--it-rgb), 0.03) 100%);
          border: 1px solid rgba(var(--it-rgb), 0.16);
          transition: background .15s, border-color .15s, transform .15s;
          min-width: 0;
        }
        .sh-mcard:active { transform: scale(0.97); }
        .sh-mcard:hover { background: linear-gradient(135deg, rgba(var(--it-rgb), 0.18) 0%, rgba(var(--it-rgb), 0.06) 100%); }
        .sh-mcard.active { background: linear-gradient(135deg, rgba(var(--it-rgb), 0.25) 0%, rgba(var(--it-rgb), 0.10) 100%); border-color: rgba(var(--it-rgb), 0.55); }
        .sh-mcard-icon {
          flex-shrink: 0;
          width: 22px; height: 22px;
          border-radius: 7px;
          display: flex; align-items: center; justify-content: center;
          color: #fff;
          background: linear-gradient(135deg, rgba(var(--it-rgb), 1) 0%, rgba(var(--it-rgb), 0.75) 100%);
          box-shadow: 0 2px 6px rgba(var(--it-rgb), 0.3);
        }
        .sh-mcard-icon svg { width: 12px; height: 12px; }
        .sh-mcard-lbl {
          font-size: 11.5px; font-weight: 700;
          color: var(--text-primary);
          line-height: 1.15;
          flex: 1; min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .sh-mcard-soon {
          position: absolute;
          top: 4px; right: 4px;
          width: 5px; height: 5px;
          border-radius: 50%;
          background: rgba(var(--it-rgb), 1);
          box-shadow: 0 0 0 2px rgba(var(--it-rgb), 0.25);
        }
      `}</style>

      {/* ─── HEADER BAR ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50" style={{ background: bg, backdropFilter: 'blur(22px)', borderBottom: bdr }}>
        <div style={{ maxWidth: 1360, margin: '0 auto', padding: '0 20px', height: 56, display: 'flex', alignItems: 'center', gap: 10 }}>

          {/* Hamburger */}
          <button onClick={() => setMenuOpen(true)} aria-label="Meniu"
            style={{ flexShrink: 0, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', cursor: 'pointer', color: hamColor, borderRadius: 8, transition: 'color .15s, background .15s' }}
            onMouseEnter={e => { e.currentTarget.style.color = navHover; e.currentTarget.style.background = navHoverBg }}
            onMouseLeave={e => { e.currentTarget.style.color = hamColor; e.currentTarget.style.background = 'transparent' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>

          {/* Logo */}
          <Link href="/" style={{ flexShrink: 0, textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
            <span style={{ fontWeight: 900, fontSize: 21, letterSpacing: '-0.02em', color: logoColor }}>music</span>
            <span style={{ fontWeight: 900, fontSize: 21, letterSpacing: '-0.02em', color: 'var(--accent-orange)' }}>.lt</span>
          </Link>

          {/* Search */}
          <button
            type="button"
            onClick={openSearch}
            className="sh-desktop-search"
            aria-label="Atidaryti paiešką"
            style={{
              flex: '0 1 320px', margin: '0 4px',
              alignItems: 'center', borderRadius: 22,
              background: inputBg, border: inputBdr,
              padding: '0 4px 0 14px',
              height: 36,
              cursor: 'pointer',
              transition: 'border-color .15s, background .15s',
              fontFamily: 'inherit',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '' }}
          >
            <span style={{ display: 'flex', color: mutedIcon, marginRight: 10 }}><SearchIcon /></span>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', textAlign: 'left' }}>
              Ieškok visko…
            </span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 2,
              fontFamily: 'SF Mono, monospace', fontSize: 10, fontWeight: 600,
              color: 'var(--text-muted)',
              padding: '3px 6px', borderRadius: 5,
              background: 'var(--bg-hover)',
              border: '1px solid var(--border-default)',
              marginRight: 4,
            }}>⌘K</span>
          </button>

          {/* Desktop nav */}
          <nav className="sh-desktop-nav" style={{ alignItems: 'center', gap: 1, flexShrink: 0, marginLeft: 'auto' }}>
            {NAV.map(g => {
              const active = isGroupActive(g)
              const target = g.href || g.items[0]?.href || '/'
              const cols = g.cols || 1
              const grpRgb = hexToRgb(g.accent)
              return (
                <div
                  key={g.label}
                  className="sh-group"
                  style={{ ['--gp-rgb' as any]: grpRgb }}
                >
                  <Link href={target} className={`sh-navlink${active ? ' active' : ''}`}>
                    {g.label}
                    <ChevronIcon />
                  </Link>
                  <div className={`sh-dropdown cols-${cols}`} role="menu">
                    {g.items.map(it => {
                      const a = isActive(it.href)
                      const rgb = hexToRgb(it.accent)
                      return (
                        <Link
                          key={it.label}
                          href={it.href}
                          className={`sh-megaitem${a ? ' active' : ''}`}
                          style={{ ['--it-rgb' as any]: rgb }}
                        >
                          <span className="sh-megaicon">{it.icon}</span>
                          <span className="sh-mega-text">
                            <span className="sh-mega-lbl-row">
                              <span className="sh-mega-lbl">{it.label}</span>
                              {it.soon && <span className="sh-mega-soon">Greitai</span>}
                            </span>
                            {it.desc && <span className="sh-mega-desc">{it.desc}</span>}
                          </span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </nav>

          {/* Right cluster */}
          <div style={{ flexShrink: 0, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <MessagesBell />
            <NotificationsBell />
            <HeaderAuth />
          </div>
        </div>
      </header>

      {/* ─── MOBILE DRAWER ───────────────────────────────────────── */}
      <div className={`sh-overlay${menuOpen ? ' open' : ''}`} onClick={() => setMenuOpen(false)} />

      <div className={`sh-drawer${menuOpen ? ' open' : ''}`} style={{ background: drawerBg, borderRight: bdr }}>

        <div style={{ height: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px', borderBottom: bdr, flexShrink: 0 }}>
          <Link href="/" onClick={() => setMenuOpen(false)} style={{ textDecoration: 'none' }}>
            <span style={{ fontWeight: 900, fontSize: 19, color: logoColor }}>music</span>
            <span style={{ fontWeight: 900, fontSize: 19, color: 'var(--accent-orange)' }}>.lt</span>
          </Link>
          <button onClick={() => setMenuOpen(false)}
            style={{ width: 28, height: 28, borderRadius: 7, border: 'none', background: 'transparent', color: mutedIcon, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div style={{ padding: '8px 12px', borderBottom: bdr, flexShrink: 0 }}>
          <button
            onClick={openSearch}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              borderRadius: 9, background: inputBg, border: inputBdr,
              width: '100%', height: 34, padding: '0 12px',
              cursor: 'pointer', fontFamily: 'inherit',
              color: 'var(--text-muted)',
            }}>
            <SearchIcon />
            <span style={{ fontSize: 12.5, fontWeight: 500 }}>Ieškoti visko…</span>
          </button>
        </div>

        {/* Drawer nav — kompaktinis 2-col grid be scroll'o */}
        <nav style={{ flex: 1, padding: '4px 0 4px', overflowY: 'auto' }}>
          {NAV.map(g => {
            const grpRgb = hexToRgb(g.accent)
            return (
              <div
                key={g.label}
                className="sh-mgroup"
                style={{ ['--gp-rgb' as any]: grpRgb }}
              >
                <div className="sh-mgroup-title">
                  <span className="sh-mgroup-title-dot" style={{ background: g.accent }} />
                  {g.label}
                </div>
                <div className="sh-mgrid">
                  {g.items.map(it => {
                    const a = isActive(it.href)
                    const rgb = hexToRgb(it.accent)
                    return (
                      <Link
                        key={it.label}
                        href={it.href}
                        onClick={() => setMenuOpen(false)}
                        className={`sh-mcard${a ? ' active' : ''}`}
                        style={{ ['--it-rgb' as any]: rgb }}
                      >
                        <span className="sh-mcard-icon">{it.icon}</span>
                        <span className="sh-mcard-lbl">{it.label}</span>
                        {it.soon && <span className="sh-mcard-soon" />}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </nav>

        <div style={{ padding: '8px 12px', borderTop: bdr, flexShrink: 0 }}>
          <button onClick={() => { setTheme(theme === 'dark' ? 'light' : 'dark'); setMenuOpen(false) }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '8px 12px', borderRadius: 9, border: 'none', background: 'var(--bg-hover)', color: navColor, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', transition: 'background .12s' }}
            onMouseEnter={e => (e.currentTarget.style.background = navHoverBg)}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-hover)')}>
            {dk ? <><SunIcon /> Šviesi tema</> : <><MoonIcon /> Tamsi tema</>}
          </button>
        </div>
      </div>

      {/* ─── MASTER SEARCH OVERLAY ───────────────────────────────── */}
      <MasterSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  )
}
