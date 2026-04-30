'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HeaderAuth } from '@/components/HeaderAuth'
import { NotificationsBell } from '@/components/NotificationsBell'
import { MasterSearch } from '@/components/MasterSearch'
import { useSite } from '@/components/SiteContext'

/* ──────────────────────────────────────────────────────────────────
 * Top meniu struktūra — keli "grupiniai" itemai, kiekvienas atveria
 * dropdown'ą on hover (desktop) arba accordion'ą (mobile drawer).
 * Top-level link'as eina į pirmą sub-itemą (arba savo href, jei nustatytas).
 * ────────────────────────────────────────────────────────────────── */

type SubItem = { label: string; href: string; desc?: string }
type NavGroup = { label: string; href?: string; items: SubItem[] }

const NAV: NavGroup[] = [
  {
    label: 'Muzika',
    items: [
      { label: 'Nauja muzika',         href: '/boombox',      desc: 'Šviežiausios dainos ir albumai' },
      { label: 'Atlikėjai ir grupės',  href: '/atlikejai',    desc: 'Lietuvos scenos žemėlapis' },
      { label: 'Albumai',              href: '/albumai',      desc: 'Visi albumai vienoje vietoje' },
      { label: 'Dienos daina',         href: '/dienos-daina', desc: 'Redakcijos pasirinkimas šiandien' },
    ],
  },
  {
    label: 'Topai ir balsavimai',
    items: [
      { label: 'Topai',         href: '/topas',      desc: 'Savaitės, mėnesio ir visų laikų' },
      { label: 'Balsavimai',    href: '/balsavimai', desc: 'Apdovanojimai ir reitingai' },
    ],
  },
  {
    label: 'Renginiai ir naujienos',
    items: [
      { label: 'Renginiai',  href: '/renginiai', desc: 'Artimiausi koncertai' },
      { label: 'Naujienos',  href: '/naujienos', desc: 'Scenos pulsas' },
      { label: 'Galerija',   href: '/galerija',  desc: 'Foto iš renginių' },
    ],
  },
  {
    label: 'Bendruomenė',
    items: [
      { label: 'Diskusijos',     href: '/diskusijos',     desc: 'Forumo temos ir pokalbiai' },
      { label: 'Blogai',         href: '/blogas',         desc: 'Vartotojų straipsniai' },
      { label: 'Gyvi pokalbiai', href: '/bendruomene',    desc: 'Real-time chat'  },
      { label: 'Rašyti įrašą',   href: '/blogas/rasyti',  desc: 'Pradėk savo blogą' },
    ],
  },
]

/* ── Icons ── */
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
const ChevronIcon = ({ open = false }: { open?: boolean }) => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
       style={{ transition: 'transform .18s', transform: open ? 'rotate(180deg)' : 'none', marginLeft: 3 }}>
    <polyline points="6 9 12 15 18 9"/>
  </svg>
)

export function SiteHeader() {
  const { theme, setTheme, dk } = useSite()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)

  // Global keyboard shortcuts — Cmd/Ctrl+K bei "/" atidaro paiešką.
  // "/" ignore'uojam kai user'is type'ina į kitą input/textarea.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const inField = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      )
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

  /* ── Theme-aware tokens ── */
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
  const inputColor  = 'var(--input-text)'
  const mutedIcon   = 'var(--text-muted)'
  const drawerBg    = 'var(--bg-surface)'
  const hamColor    = 'var(--text-muted)'
  const sectionLabel= 'var(--text-muted)'
  const ddBg        = 'var(--bg-surface)'
  const ddShadow    = '0 12px 36px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08)'

  const isActive       = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href)
  const isGroupActive  = (g: NavGroup) => (g.href && isActive(g.href)) || g.items.some(it => isActive(it.href))

  return (
    <>
      <style>{`
        /* ── Top-level nav button ── */
        .sh-navlink {
          display: inline-flex; align-items: center;
          font-size: 12.5px; font-weight: 600;
          padding: 5px 10px; border-radius: 7px;
          text-decoration: none;
          transition: color .13s, background .13s;
          white-space: nowrap; cursor: pointer;
          color: ${navColor}; background: transparent;
          border: none; font-family: inherit;
        }
        .sh-navlink:hover { color: ${navHover}; background: ${navHoverBg}; }
        .sh-navlink.active { color: ${activeColor}; background: ${activeBg}; }
        .sh-navlink.active:hover { color: ${activeColor}; background: ${activeBg}; }

        /* ── Group wrapper + dropdown ── */
        .sh-group { position: relative; }
        .sh-dropdown {
          position: absolute; top: 100%; left: 0;
          min-width: 260px;
          padding: 8px;
          background: ${ddBg};
          border: ${bdr};
          border-radius: 12px;
          box-shadow: ${ddShadow};
          opacity: 0; pointer-events: none;
          transform: translateY(-4px);
          transition: opacity .15s ease, transform .15s ease;
          z-index: 100;
          /* tiny invisible bridge to prevent gap-flicker */
          margin-top: 6px;
        }
        .sh-dropdown::before {
          content: ''; position: absolute;
          top: -8px; left: 0; right: 0; height: 8px;
        }
        .sh-group:hover > .sh-dropdown,
        .sh-group:focus-within > .sh-dropdown {
          opacity: 1; pointer-events: auto;
          transform: translateY(0);
        }
        .sh-dditem {
          display: block; padding: 9px 12px; border-radius: 8px;
          text-decoration: none; transition: background .12s, color .12s;
          color: ${navColor};
        }
        .sh-dditem:hover { background: ${navHoverBg}; color: ${navHover}; }
        .sh-dditem.active { color: ${activeColor}; background: ${activeBg}; }
        .sh-dditem .lbl { font-size: 13.5px; font-weight: 700; line-height: 1.25; display: block; }
        .sh-dditem .desc { font-size: 11px; font-weight: 500; line-height: 1.3; opacity: 0.7; margin-top: 2px; display: block; }

        /* ── Responsive ── */
        .sh-desktop-search { display: flex; }
        .sh-desktop-nav    { display: flex; }
        @media (max-width: 1000px) {
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
          width: 300px;
          transform: translateX(-100%);
          transition: transform .22s cubic-bezier(.4,0,.2,1);
          display: flex; flex-direction: column;
        }
        .sh-drawer.open { transform: translateX(0); }

        /* ── Mobile group toggle ── */
        .sh-mgroup {
          display: flex; align-items: center; justify-content: space-between;
          width: 100%; padding: 11px 14px;
          border: none; background: transparent;
          border-radius: 10px;
          font-size: 14px; font-weight: 700;
          color: ${navColor}; text-align: left; cursor: pointer;
          font-family: inherit;
        }
        .sh-mgroup:hover { background: ${navHoverBg}; color: ${navHover}; }
        .sh-mgroup.active { color: ${activeColor}; }
        .sh-msublist {
          overflow: hidden;
          max-height: 0;
          transition: max-height .25s ease;
        }
        .sh-msublist.open { max-height: 600px; }
        .sh-msubitem {
          display: block;
          padding: 9px 14px 9px 28px;
          border-radius: 8px;
          font-size: 13px; font-weight: 600;
          text-decoration: none;
          color: ${navColor};
          transition: background .12s, color .12s;
        }
        .sh-msubitem:hover { background: ${navHoverBg}; color: ${navHover}; }
        .sh-msubitem.active { color: ${activeColor}; background: ${activeBg}; }
      `}</style>

      {/* ─── HEADER BAR ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50" style={{ background: bg, backdropFilter: 'blur(22px)', borderBottom: bdr }}>
        <div style={{ maxWidth: 1360, margin: '0 auto', padding: '0 20px', height: 56, display: 'flex', alignItems: 'center', gap: 10 }}>

          {/* Hamburger — always visible */}
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

          {/* Search trigger — desktop. Atidaro full-screen MasterSearch overlay'ą.
              Atrodo kaip įprastas search bar, bet click'as / focus'as → modal. */}
          <button
            type="button"
            onClick={openSearch}
            className="sh-desktop-search"
            aria-label="Atidaryti paiešką"
            style={{
              flex: '0 1 380px', margin: '0 4px',
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

          {/* Desktop nav — hover dropdowns */}
          <nav className="sh-desktop-nav" style={{ alignItems: 'center', gap: 1, flexShrink: 0, marginLeft: 'auto' }}>
            {NAV.map(g => {
              const active = isGroupActive(g)
              const target = g.href || g.items[0]?.href || '/'
              return (
                <div key={g.label} className="sh-group">
                  <Link href={target} className={`sh-navlink${active ? ' active' : ''}`}>
                    {g.label}
                    <ChevronIcon />
                  </Link>
                  <div className="sh-dropdown" role="menu">
                    {g.items.map(it => {
                      const a = isActive(it.href)
                      return (
                        <Link key={it.href} href={it.href} className={`sh-dditem${a ? ' active' : ''}`}>
                          <span className="lbl">{it.label}</span>
                          {it.desc && <span className="desc">{it.desc}</span>}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </nav>

          {/* Notifications + Auth */}
          <div style={{ flexShrink: 0, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <NotificationsBell />
            <HeaderAuth />
          </div>
        </div>
      </header>

      {/* ─── DRAWER ───────────────────────────────────────────────── */}
      <div className={`sh-overlay${menuOpen ? ' open' : ''}`} onClick={() => setMenuOpen(false)} />

      <div className={`sh-drawer${menuOpen ? ' open' : ''}`} style={{ background: drawerBg, borderRight: bdr }}>
        {/* Drawer top */}
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

        {/* Drawer search trigger — atidaro overlay vietoj inline input'o. */}
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

        {/* Drawer nav — accordion */}
        <nav style={{ flex: 1, padding: '8px 10px', overflowY: 'auto' }}>
          <div style={{ padding: '4px 14px 8px', fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: sectionLabel }}>Meniu</div>

          {NAV.map(g => {
            const active = isGroupActive(g)
            const open = mobileExpanded === g.label || active
            return (
              <div key={g.label} style={{ marginBottom: 2 }}>
                <button
                  onClick={() => setMobileExpanded(mobileExpanded === g.label ? null : g.label)}
                  className={`sh-mgroup${active ? ' active' : ''}`}
                  aria-expanded={open}>
                  <span>{g.label}</span>
                  <ChevronIcon open={open} />
                </button>
                <div className={`sh-msublist${open ? ' open' : ''}`}>
                  {g.items.map(it => {
                    const a = isActive(it.href)
                    return (
                      <Link key={it.href} href={it.href} onClick={() => setMenuOpen(false)}
                        className={`sh-msubitem${a ? ' active' : ''}`}>
                        {it.label}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
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
