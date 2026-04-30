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
 * Top meniu — 4 grupės (Muzika / Pramogos / Renginiai / Žmonės).
 * Desktop: hover atveria mega-dropdown'ą su ikonomis ir aprašymais.
 * Mobile drawer: VISI sub-itemai visada matomi (be accordion'o).
 *
 * Visi href'ai patikrinti — neegzistuojantys page'ai pašalinti, kad
 * neliktų 404. Naujus skirtukus pridėti tik kai page.tsx jau yra.
 * ────────────────────────────────────────────────────────────────── */

type SubItem = {
  label: string
  href: string
  desc?: string
  icon: React.ReactNode
  accent: string  // CSS color for the icon pill background
}
type NavGroup = {
  label: string
  href?: string         // top-level click target (jei nenurodyta — eina į items[0])
  cols?: 1 | 2          // 2 = mega-menu grid, default 1 = single column
  items: SubItem[]
}

/* ── Item icons (kompaktinės SVG) ── */
const I = {
  artist: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0 1 14 0v1"/>
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
  song: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
    </svg>
  ),
  boombox: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="8" width="18" height="12" rx="2"/><circle cx="8" cy="14" r="2"/><circle cx="16" cy="14" r="2"/><path d="M7 8V5a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v3"/>
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-3.5-7.1L21 4l-1 4A9 9 0 0 1 21 12Z"/>
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
  pencil: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>
    </svg>
  ),
  game: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 12h4M8 10v4"/><circle cx="15" cy="11" r="1" fill="currentColor"/><circle cx="17.5" cy="13.5" r="1" fill="currentColor"/>
      <path d="M17.32 5H6.68A4.68 4.68 0 0 0 2 9.68V14a4 4 0 0 0 6.7 2.95l.6-.55h5.4l.6.55A4 4 0 0 0 22 14V9.68A4.68 4.68 0 0 0 17.32 5Z"/>
    </svg>
  ),
}

const NAV: NavGroup[] = [
  {
    label: 'Muzika',
    href: '/atlikejai',  // klikas ant label'io → atlikėjai (centrinis muzikos hub'as)
    cols: 2,
    items: [
      { label: 'Atlikėjai ir grupės', href: '/atlikejai',    desc: 'Lietuvos scenos žemėlapis',         icon: I.artist, accent: '#f59e0b' },
      { label: 'Topai',               href: '/topas',        desc: 'Savaitės, mėnesio, visų laikų',     icon: I.trophy, accent: '#ef4444' },
      { label: 'Balsavimai',          href: '/balsavimai',   desc: 'Apdovanojimai ir reitingai',        icon: I.vote,   accent: '#a855f7' },
      { label: 'Dienos daina',        href: '/dienos-daina', desc: 'Redakcijos pasirinkimas šiandien',  icon: I.song,   accent: '#10b981' },
    ],
  },
  {
    label: 'Pramogos',
    href: '/boombox',
    cols: 1,
    items: [
      { label: 'Boombox',          href: '/boombox',      desc: 'Atrask atlikėjus swipe stiliumi', icon: I.boombox, accent: '#f97316' },
      { label: 'Greitai: žaidimai', href: '/boombox',     desc: 'Kvizai ir muzikiniai iššūkiai (soon)', icon: I.game, accent: '#6366f1' },
    ],
  },
  {
    label: 'Renginiai',
    href: '/renginiai',
    cols: 1,
    items: [
      { label: 'Visi renginiai', href: '/renginiai', desc: 'Artimiausi koncertai ir festivaliai', icon: I.calendar, accent: '#3b82f6' },
    ],
  },
  {
    label: 'Žmonės',
    href: '/pokalbiai',
    cols: 2,
    items: [
      { label: 'Pokalbiai',    href: '/pokalbiai',     desc: 'Privačios žinutės ir grupės', icon: I.chat,   accent: '#06b6d4' },
      { label: 'Diskusijos',   href: '/diskusijos',    desc: 'Forumo temos ir debatai',     icon: I.forum,  accent: '#8b5cf6' },
      { label: 'Blogai',       href: '/blogas/mano',   desc: 'Vartotojų straipsniai',       icon: I.blog,   accent: '#ec4899' },
      { label: 'Rašyti įrašą', href: '/blogas/rasyti', desc: 'Pradėk savo blogą',           icon: I.pencil, accent: '#14b8a6' },
    ],
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
const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
)
const ChevronIcon = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
       style={{ transition: 'transform .18s', marginLeft: 4 }}>
    <polyline points="6 9 12 15 18 9"/>
  </svg>
)

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
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      } else if (e.key === '/' && !inField && !searchOpen) {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [searchOpen])

  const openSearch = () => { setSearchOpen(true); setMenuOpen(false) }

  /* ── Theme tokens ── */
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
  const sectionLabel= 'var(--text-muted)'
  const ddBg        = 'var(--bg-surface)'
  const ddShadow    = '0 20px 50px rgba(0,0,0,0.22), 0 4px 12px rgba(0,0,0,0.10)'

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

        /* ── Mega-dropdown ── */
        .sh-group { position: relative; }
        .sh-dropdown {
          position: absolute; top: 100%; left: 0;
          padding: 12px;
          background: ${ddBg};
          border: ${bdr};
          border-radius: 16px;
          box-shadow: ${ddShadow};
          opacity: 0; pointer-events: none;
          transform: translateY(-6px);
          transition: opacity .18s ease, transform .18s ease;
          z-index: 100;
          margin-top: 8px;
        }
        .sh-dropdown.cols-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; min-width: 480px; }
        .sh-dropdown.cols-1 { display: flex; flex-direction: column; gap: 2px; min-width: 300px; }
        .sh-dropdown::before {
          content: ''; position: absolute;
          top: -10px; left: 0; right: 0; height: 10px;
        }
        .sh-group:hover > .sh-dropdown,
        .sh-group:focus-within > .sh-dropdown {
          opacity: 1; pointer-events: auto;
          transform: translateY(0);
        }

        /* ── Mega-item card ── */
        .sh-megaitem {
          display: flex; align-items: flex-start; gap: 12px;
          padding: 12px;
          border-radius: 12px;
          text-decoration: none;
          transition: background .14s, transform .14s;
          color: ${navColor};
        }
        .sh-megaitem:hover { background: ${navHoverBg}; }
        .sh-megaitem:hover .sh-megaicon { transform: scale(1.06); }
        .sh-megaitem.active { background: ${activeBg}; }
        .sh-megaitem.active .sh-mega-lbl { color: ${activeColor}; }
        .sh-megaicon {
          flex-shrink: 0;
          width: 38px; height: 38px;
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          color: #fff;
          transition: transform .18s ease;
          box-shadow: 0 2px 8px rgba(0,0,0,0.18);
        }
        .sh-megaicon svg { width: 19px; height: 19px; }
        .sh-mega-text { flex: 1; min-width: 0; }
        .sh-mega-lbl {
          display: block;
          font-size: 14px; font-weight: 700;
          color: ${navHover};
          line-height: 1.25;
          margin-bottom: 3px;
        }
        .sh-mega-desc {
          display: block;
          font-size: 12px; font-weight: 500;
          color: ${navColor};
          line-height: 1.35;
          opacity: 0.85;
        }

        /* ── Responsive ── */
        .sh-desktop-search { display: flex; }
        .sh-desktop-nav    { display: flex; }
        @media (max-width: 1080px) {
          .sh-desktop-search { display: none !important; }
          .sh-desktop-nav    { display: none !important; }
        }

        /* ── Drawer ── */
        .sh-overlay {
          position: fixed; inset: 0; z-index: 200;
          background: rgba(0,0,0,0.5); backdrop-filter: blur(3px);
          opacity: 0; pointer-events: none; transition: opacity .2s;
        }
        .sh-overlay.open { opacity: 1; pointer-events: all; }
        .sh-drawer {
          position: fixed; top: 0; left: 0; bottom: 0; z-index: 201;
          width: 320px;
          transform: translateX(-100%);
          transition: transform .22s cubic-bezier(.4,0,.2,1);
          display: flex; flex-direction: column;
        }
        .sh-drawer.open { transform: translateX(0); }

        /* ── Mobile sub-item su ikona — visi visada matomi ── */
        .sh-msection {
          padding: 14px 14px 6px;
          font-size: 10px; font-weight: 800;
          text-transform: uppercase; letter-spacing: 0.1em;
          color: ${sectionLabel};
        }
        .sh-msubitem {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 14px;
          border-radius: 10px;
          text-decoration: none;
          font-size: 13.5px; font-weight: 600;
          color: ${navColor};
          transition: background .12s, color .12s;
        }
        .sh-msubitem:hover { background: ${navHoverBg}; color: ${navHover}; }
        .sh-msubitem.active { color: ${activeColor}; background: ${activeBg}; }
        .sh-micon {
          flex-shrink: 0;
          width: 28px; height: 28px;
          border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          color: #fff;
        }
        .sh-micon svg { width: 14px; height: 14px; }
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
              flex: '0 1 360px', margin: '0 4px',
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
              Ieškok atlikėjų, dainų, renginių…
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

          {/* Desktop nav — mega-dropdowns */}
          <nav className="sh-desktop-nav" style={{ alignItems: 'center', gap: 2, flexShrink: 0, marginLeft: 'auto' }}>
            {NAV.map(g => {
              const active = isGroupActive(g)
              const target = g.href || g.items[0]?.href || '/'
              const cols = g.cols || 1
              const hasDropdown = g.items.length > 1
              return (
                <div key={g.label} className="sh-group">
                  <Link href={target} className={`sh-navlink${active ? ' active' : ''}`}>
                    {g.label}
                    {hasDropdown && <ChevronIcon />}
                  </Link>
                  {hasDropdown && (
                    <div className={`sh-dropdown cols-${cols}`} role="menu">
                      {g.items.map(it => {
                        const a = isActive(it.href)
                        return (
                          <Link key={it.label} href={it.href} className={`sh-megaitem${a ? ' active' : ''}`}>
                            <span className="sh-megaicon" style={{ background: it.accent }}>{it.icon}</span>
                            <span className="sh-mega-text">
                              <span className="sh-mega-lbl">{it.label}</span>
                              {it.desc && <span className="sh-mega-desc">{it.desc}</span>}
                            </span>
                          </Link>
                        )
                      })}
                    </div>
                  )}
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

      {/* ─── DRAWER ───────────────────────────────────────────────── */}
      <div className={`sh-overlay${menuOpen ? ' open' : ''}`} onClick={() => setMenuOpen(false)} />

      <div className={`sh-drawer${menuOpen ? ' open' : ''}`} style={{ background: drawerBg, borderRight: bdr }}>
        <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', borderBottom: bdr, flexShrink: 0 }}>
          <Link href="/" onClick={() => setMenuOpen(false)} style={{ textDecoration: 'none' }}>
            <span style={{ fontWeight: 900, fontSize: 20, color: logoColor }}>music</span>
            <span style={{ fontWeight: 900, fontSize: 20, color: 'var(--accent-orange)' }}>.lt</span>
          </Link>
          <button onClick={() => setMenuOpen(false)}
            style={{ width: 28, height: 28, borderRadius: 7, border: 'none', background: 'transparent', color: mutedIcon, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Drawer search trigger */}
        <div style={{ padding: '12px 14px', borderBottom: bdr }}>
          <button
            onClick={openSearch}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              borderRadius: 10, background: inputBg, border: inputBdr,
              width: '100%', height: 40, padding: '0 14px',
              cursor: 'pointer', fontFamily: 'inherit',
              color: 'var(--text-muted)',
            }}>
            <SearchIcon />
            <span style={{ fontSize: 13, fontWeight: 500 }}>Ieškoti visko…</span>
          </button>
        </div>

        {/* Drawer nav — VISI sub-itemai visada matomi (be accordion'o) */}
        <nav style={{ flex: 1, padding: '4px 8px 12px', overflowY: 'auto' }}>
          {NAV.map(g => (
            <div key={g.label} style={{ marginBottom: 4 }}>
              <div className="sh-msection">{g.label}</div>
              {g.items.map(it => {
                const a = isActive(it.href)
                return (
                  <Link key={it.label} href={it.href} onClick={() => setMenuOpen(false)}
                    className={`sh-msubitem${a ? ' active' : ''}`}>
                    <span className="sh-micon" style={{ background: it.accent }}>{it.icon}</span>
                    <span>{it.label}</span>
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Drawer bottom: theme toggle */}
        <div style={{ padding: '12px 14px', borderTop: bdr }}>
          <button onClick={() => { setTheme(theme === 'dark' ? 'light' : 'dark'); setMenuOpen(false) }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 14px', borderRadius: 10, border: 'none', background: 'var(--bg-hover)', color: navColor, fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'background .12s' }}
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
