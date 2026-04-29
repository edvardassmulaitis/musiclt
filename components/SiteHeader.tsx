'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HeaderAuth } from '@/components/HeaderAuth'
import { NotificationsBell } from '@/components/NotificationsBell'
import { useSite } from '@/components/SiteContext'

const NAV = [
  { label: 'Boombox',           href: '/boombox' },
  { label: 'Muzikos atradimai', href: '/muzika' },
  { label: 'Topai',             href: '/topas' },
  { label: 'Naujienos',         href: '/naujienos' },
  { label: 'Renginiai',         href: '/renginiai' },
  { label: 'Balsavimai',        href: '/balsavimai' },
  { label: 'Diskusijos',        href: '/diskusijos' },
]

const DRAWER_EXTRA = [
  { label: 'Atlikėjai', href: '/atlikejai' },
  { label: 'Albumai', href: '/albumai' },
  { label: 'Dainos', href: '/muzika' },
  { label: 'Galerija', href: '/galerija' },
  { label: 'Apie mus', href: '/apie' },
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

export function SiteHeader() {
  const { theme, setTheme, dk } = useSite()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

  /* ── Theme-aware tokens using CSS variables ── */
  const bg = 'rgba(var(--bg-body-rgb), 0.97)'
  const bdr = '1px solid var(--border-default)'
  const navColor = 'var(--text-secondary)'
  const navHover = 'var(--text-primary)'
  const navHoverBg = 'var(--bg-hover)'
  const activeColor = 'var(--accent-link)'
  const activeBg = 'rgba(96, 165, 250, 0.1)'
  const logoColor = 'var(--text-primary)'
  const inputBg = 'var(--input-bg)'
  const inputBdr = '1px solid var(--input-border)'
  const inputColor = 'var(--input-text)'
  const mutedIcon = 'var(--text-muted)'
  const drawerBg = 'var(--bg-surface)'
  const hamColor = 'var(--text-muted)'
  const sectionLabel = 'var(--text-muted)'

  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <>
      <style>{`
        .sh-navlink {
          font-size: 12.5px; font-weight: 600; padding: 5px 10px;
          border-radius: 7px; text-decoration: none;
          transition: color .13s, background .13s; white-space: nowrap;
        }
        .sh-desktop-search { display: flex; }
        .sh-desktop-nav    { display: flex; }
        @media (max-width: 900px) {
          .sh-desktop-search { display: none !important; }
          .sh-desktop-nav    { display: none !important; }
        }
        .sh-overlay {
          position: fixed; inset: 0; z-index: 200;
          background: rgba(0,0,0,0.5); backdrop-filter: blur(3px);
          opacity: 0; pointer-events: none; transition: opacity .2s;
        }
        .sh-overlay.open { opacity: 1; pointer-events: all; }
        .sh-drawer {
          position: fixed; top: 0; left: 0; bottom: 0; z-index: 201;
          width: 280px;
          transform: translateX(-100%);
          transition: transform .22s cubic-bezier(.4,0,.2,1);
          display: flex; flex-direction: column;
        }
        .sh-drawer.open { transform: translateX(0); }
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

          {/* Search bar — desktop */}
          <div className="sh-desktop-search" style={{ flex: '0 1 420px', margin: '0 4px', alignItems: 'center', borderRadius: 22, overflow: 'hidden', background: inputBg, border: inputBdr, transition: 'border-color .15s' }}>
            <input type="text" placeholder="Ieškok atlikėjų, albumų, dainų, renginių…"
              style={{ flex: 1, height: 36, padding: '0 16px', fontSize: 13, background: 'transparent', border: 'none', outline: 'none', color: inputColor, fontFamily: 'DM Sans, sans-serif' }} />
            <button style={{ flexShrink: 0, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', cursor: 'pointer', color: mutedIcon }}>
              <SearchIcon />
            </button>
          </div>

          {/* Desktop nav — pushed right after search */}
          <nav className="sh-desktop-nav" style={{ alignItems: 'center', gap: 1, flexShrink: 0, marginLeft: 'auto' }}>
            {NAV.map(n => {
              const active = isActive(n.href)
              return (
                <Link key={n.label} href={n.href} className="sh-navlink"
                  style={{ color: active ? activeColor : navColor, background: active ? activeBg : 'transparent' }}
                  onMouseEnter={e => { if (!active) { e.currentTarget.style.color = navHover; e.currentTarget.style.background = navHoverBg } }}
                  onMouseLeave={e => { if (!active) { e.currentTarget.style.color = navColor; e.currentTarget.style.background = 'transparent' } }}>
                  {n.label}
                </Link>
              )
            })}
          </nav>

          {/* Notifications + Auth (avatar / login) — always far right */}
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

        {/* Drawer search */}
        <div style={{ padding: '12px 14px', borderBottom: bdr }}>
          <div style={{ display: 'flex', alignItems: 'center', borderRadius: 10, overflow: 'hidden', background: inputBg, border: inputBdr }}>
            <input type="text" placeholder="Ieškoti…"
              style={{ flex: 1, height: 38, padding: '0 14px', fontSize: 13, background: 'transparent', border: 'none', outline: 'none', color: inputColor }} />
            <span style={{ padding: '0 12px', color: mutedIcon, display: 'flex', alignItems: 'center' }}>
              <SearchIcon />
            </span>
          </div>
        </div>

        {/* Drawer nav */}
        <nav style={{ flex: 1, padding: '8px 10px', overflowY: 'auto' }}>
          {/* Main section */}
          <div style={{ padding: '4px 14px 8px', fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: sectionLabel }}>Meniu</div>
          {NAV.map(n => {
            const active = isActive(n.href)
            return (
              <Link key={n.label} href={n.href} onClick={() => setMenuOpen(false)}
                style={{ display: 'block', padding: '10px 14px', borderRadius: 10, fontSize: 14, fontWeight: 700, textDecoration: 'none', marginBottom: 1, color: active ? activeColor : navColor, background: active ? activeBg : 'transparent', transition: 'background .12s, color .12s' }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = navHoverBg; e.currentTarget.style.color = navHover } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = navColor } }}>
                {n.label}
              </Link>
            )
          })}

          {/* Extra section */}
          <div style={{ padding: '16px 14px 8px', fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: sectionLabel }}>Naršyti</div>
          {DRAWER_EXTRA.map(n => {
            const active = isActive(n.href)
            return (
              <Link key={n.label + n.href} href={n.href} onClick={() => setMenuOpen(false)}
                style={{ display: 'block', padding: '10px 14px', borderRadius: 10, fontSize: 14, fontWeight: 600, textDecoration: 'none', marginBottom: 1, color: active ? activeColor : navColor, background: active ? activeBg : 'transparent', transition: 'background .12s, color .12s' }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = navHoverBg; e.currentTarget.style.color = navHover } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = navColor } }}>
                {n.label}
              </Link>
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
    </>
  )
}
