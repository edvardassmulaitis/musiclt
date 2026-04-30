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
 * Top meniu — 5 paprastos sekcijos. Kiekviena veda į savo overview
 * page'ą, o gilesnė navigacija gyvena viduje (su tabs / tile grid).
 *
 *   Desktop:  inline links su subtle accent indicator hover'iu
 *             (jokių mega-dropdown'ų — neperkrauname akies)
 *   Mobile:   5 didelės gradient kortelės — viskas matoma be scroll'o
 *
 * Filosofija: top nav atsako į "kuriame kambaryje aš esu", o ne
 * "kokia visa svetainės sitemap'a".
 * ────────────────────────────────────────────────────────────────── */

type NavItem = {
  label: string
  href: string
  match: string[]               // paths that activate this top item
  desc: string                  // mobile card description
  accent: string                // hex
  icon: React.ReactNode
}

const I = {
  music: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>
    </svg>
  ),
  fun: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  community: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  market: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3h18l-2 13H5L3 3z"/><circle cx="9" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/>
    </svg>
  ),
}

const NAV: NavItem[] = [
  {
    label: 'Muzika',
    href: '/muzika',
    match: ['/muzika', '/atlikejai', '/albumai', '/topas', '/balsavimai', '/dienos-daina', '/zanrai', '/apdovanojimai', '/dainos', '/lt'],
    desc: 'Atlikėjai, albumai, topai',
    accent: '#f59e0b',
    icon: I.music,
  },
  {
    label: 'Renginiai',
    href: '/renginiai',
    match: ['/renginiai', '/festivaliai', '/galerija'],
    desc: 'Koncertai, festivaliai, galerijos',
    accent: '#3b82f6',
    icon: I.calendar,
  },
  {
    label: 'Pramogos',
    href: '/pramogos',
    match: ['/pramogos', '/boombox', '/zaidimai', '/kvizai'],
    desc: 'Boombox, žaidimai, kvizai',
    accent: '#f97316',
    icon: I.fun,
  },
  {
    label: 'Bendruomenė',
    href: '/bendruomene',
    match: ['/bendruomene', '/diskusijos', '/blogas', '/pokalbiai', '/vartotojai', '/naujienos'],
    desc: 'Pokalbiai, diskusijos, blogai',
    accent: '#8b5cf6',
    icon: I.community,
  },
  {
    label: 'Skelbimai',
    href: '/skelbimai',
    match: ['/skelbimai'],
    desc: 'Vinilas, instrumentai, paslaugos',
    accent: '#10b981',
    icon: I.market,
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

  const isActive = (item: NavItem) => {
    return item.match.some(m => m === '/' ? pathname === '/' : pathname.startsWith(m))
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
          background: var(--nav-accent);
          transform: scaleX(0);
          transform-origin: center;
          transition: transform .25s cubic-bezier(.4,0,.2,1);
        }
        .sh-navlink:hover {
          color: ${navHover};
        }
        .sh-navlink:hover::after {
          transform: scaleX(1);
        }
        .sh-navlink.active {
          color: ${navHover};
        }
        .sh-navlink.active::after {
          transform: scaleX(1);
        }

        /* ── Responsive ── */
        .sh-desktop-search { display: flex; }
        .sh-desktop-nav    { display: flex; }
        @media (max-width: 1080px) {
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

        /* Mobile: 5 didelės gradient kortelės */
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
        .sh-mcard:active {
          transform: scale(0.98);
        }
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
          box-shadow:
            0 8px 18px rgba(var(--it-rgb), 0.35),
            inset 0 1px 0 rgba(255,255,255,0.25);
        }
        .sh-mcard-icon svg { width: 22px; height: 22px; }
        .sh-mcard-text {
          flex: 1; min-width: 0;
        }
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
        }
      `}</style>

      {/* ─── HEADER BAR ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50" style={{ background: bg, backdropFilter: 'blur(22px)', borderBottom: bdr }}>
        <div style={{ maxWidth: 1360, margin: '0 auto', padding: '0 20px', height: 56, display: 'flex', alignItems: 'center', gap: 14 }}>

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

          {/* Desktop nav — paprasta inline su accent indicator */}
          <nav className="sh-desktop-nav" style={{ alignItems: 'center', gap: 2, marginLeft: 10, flexShrink: 0 }}>
            {NAV.map(n => {
              const active = isActive(n)
              return (
                <Link
                  key={n.label}
                  href={n.href}
                  className={`sh-navlink${active ? ' active' : ''}`}
                  style={{ ['--nav-accent' as any]: n.accent }}
                >
                  {n.label}
                </Link>
              )
            })}
          </nav>

          {/* Search */}
          <button
            type="button"
            onClick={openSearch}
            className="sh-desktop-search"
            aria-label="Atidaryti paiešką"
            style={{
              flex: '0 1 320px', marginLeft: 'auto',
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

        {/* Drawer top */}
        <div style={{ height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px', borderBottom: bdr, flexShrink: 0 }}>
          <Link href="/" onClick={() => setMenuOpen(false)} style={{ textDecoration: 'none' }}>
            <span style={{ fontWeight: 900, fontSize: 19, color: logoColor }}>music</span>
            <span style={{ fontWeight: 900, fontSize: 19, color: 'var(--accent-orange)' }}>.lt</span>
          </Link>
          <button onClick={() => setMenuOpen(false)}
            style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', color: mutedIcon, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Drawer search trigger */}
        <div style={{ padding: '12px 14px', borderBottom: bdr, flexShrink: 0 }}>
          <button
            onClick={openSearch}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              borderRadius: 11, background: inputBg, border: inputBdr,
              width: '100%', height: 40, padding: '0 14px',
              cursor: 'pointer', fontFamily: 'inherit',
              color: 'var(--text-muted)',
            }}>
            <SearchIcon />
            <span style={{ fontSize: 13, fontWeight: 500 }}>Ieškoti visko…</span>
          </button>
        </div>

        {/* Drawer nav — 5 didelės gradient kortelės, NO scroll */}
        <nav className="sh-mnav">
          {NAV.map(n => {
            const active = isActive(n)
            const rgb = hexToRgb(n.accent)
            return (
              <Link
                key={n.label}
                href={n.href}
                onClick={() => setMenuOpen(false)}
                className={`sh-mcard${active ? ' active' : ''}`}
                style={{ ['--it-rgb' as any]: rgb }}
              >
                <span className="sh-mcard-icon">{n.icon}</span>
                <span className="sh-mcard-text">
                  <span className="sh-mcard-title">{n.label}</span>
                  <span className="sh-mcard-desc">{n.desc}</span>
                </span>
                <span className="sh-mcard-arrow">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </span>
              </Link>
            )
          })}
        </nav>

        {/* Drawer bottom: theme toggle */}
        <div style={{ padding: '10px 14px', borderTop: bdr, flexShrink: 0 }}>
          <button onClick={() => { setTheme(theme === 'dark' ? 'light' : 'dark'); setMenuOpen(false) }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '10px 14px', borderRadius: 10, border: 'none', background: 'var(--bg-hover)', color: navColor, fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'background .12s' }}
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
