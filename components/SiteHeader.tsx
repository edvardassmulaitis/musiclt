'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HeaderAuth } from '@/components/HeaderAuth'
import { useSite } from '@/components/SiteContext'

const NAV = [
  { label: 'Topai',       href: '/topas' },
  { label: 'Muzika',      href: '/#muzika' },
  { label: 'Renginiai',   href: '/#renginiai' },
  { label: 'Atlikėjai',   href: '/atlikejai' },
  { label: 'Bendruomenė', href: '/#bendruomene' },
  { label: 'Blogai',      href: '/blogas/mano' },
]

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

  const bdr = dk ? '1px solid rgba(255,255,255,0.07)' : '1px solid rgba(0,0,0,0.09)'

  return (
    <>
      <style>{`
        .sh-navlink {
          font-size: 12.5px; font-weight: 600; padding: 5px 10px;
          border-radius: 7px; text-decoration: none;
          transition: color .13s, background .13s; white-space: nowrap;
        }
        .sh-ham { display: none !important; }
        @media (max-width: 768px) {
          .sh-desktop-search { display: none !important; }
          .sh-desktop-nav    { display: none !important; }
          .sh-ham            { display: flex !important; }
        }
        .sh-overlay {
          position: fixed; inset: 0; z-index: 200;
          background: rgba(0,0,0,0.5); backdrop-filter: blur(3px);
          opacity: 0; pointer-events: none; transition: opacity .2s;
        }
        .sh-overlay.open { opacity: 1; pointer-events: all; }
        .sh-drawer {
          position: fixed; top: 0; left: 0; bottom: 0; z-index: 201;
          width: 258px;
          transform: translateX(-100%);
          transition: transform .22s cubic-bezier(.4,0,.2,1);
          display: flex; flex-direction: column;
        }
        .sh-drawer.open { transform: translateX(0); }
      `}</style>

      {/* ─── HEADER ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50"
        style={{ background: dk ? 'rgba(10,14,22,0.97)' : 'rgba(245,248,255,0.97)', backdropFilter: 'blur(22px)', borderBottom: bdr }}>
        <div className="max-w-[1360px] mx-auto px-4 lg:px-8 h-14 flex items-center gap-3">

          {/* Hamburger — mobile only */}
          <button className="sh-ham flex-shrink-0 w-8 h-8 items-center justify-center rounded-lg"
            onClick={() => setMenuOpen(true)} aria-label="Meniu"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: dk ? '#8aa8cc' : '#4a6080' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>

          {/* Logo */}
          <Link href="/" className="flex-shrink-0">
            <span style={{ fontWeight: 900, fontSize: 21, letterSpacing: '-0.02em', color: dk ? '#f2f4f8' : '#0f1a2e' }}>music</span>
            <span style={{ fontWeight: 900, fontSize: 21, letterSpacing: '-0.02em', color: '#fb923c' }}>.lt</span>
          </Link>

          {/* Search — desktop */}
          <div className="sh-desktop-search"
            style={{ flex: 1, display: 'flex', alignItems: 'center', borderRadius: 22, overflow: 'hidden', maxWidth: 540, background: dk ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.05)', border: dk ? '1px solid rgba(255,255,255,0.09)' : '1px solid rgba(0,0,0,0.1)' }}>
            <input type="text" placeholder="Ieškok atlikėjų, albumų, dainų, renginių…"
              style={{ flex: 1, height: 36, padding: '0 16px', fontSize: 13, background: 'transparent', border: 'none', outline: 'none', color: dk ? '#c8d8f0' : '#1a2540' }} />
            <button style={{ flexShrink: 0, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', cursor: 'pointer', color: dk ? '#6a88b0' : '#4a6080' }}>
              <SearchIcon />
            </button>
          </div>

          {/* Desktop nav */}
          <nav className="sh-desktop-nav" style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {NAV.map(n => {
              const active = pathname === n.href
              return (
                <Link key={n.label} href={n.href} className="sh-navlink"
                  style={{ color: active ? '#60a5fa' : (dk ? '#8aa8cc' : '#4a6080'), background: active ? 'rgba(96,165,250,0.1)' : 'transparent' }}
                  onMouseEnter={e => { if (!active) { e.currentTarget.style.color = dk ? '#e2eaf8' : '#0f1a2e'; e.currentTarget.style.background = dk ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}}
                  onMouseLeave={e => { if (!active) { e.currentTarget.style.color = dk ? '#8aa8cc' : '#4a6080'; e.currentTarget.style.background = 'transparent' }}}>
                  {n.label}
                </Link>
              )
            })}
          </nav>

          {/* Theme toggle */}
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            style={{ flexShrink: 0, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: dk ? '#4a6580' : '#6a85a8', transition: 'color .15s, background .15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = dk ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'; e.currentTarget.style.color = dk ? '#c8d8f0' : '#1a2540' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = dk ? '#4a6580' : '#6a85a8' }}
            title={dk ? 'Šviesi tema' : 'Tamsi tema'}>
            {dk ? <SunIcon /> : <MoonIcon />}
          </button>

          {/* Auth */}
          <HeaderAuth />
        </div>
      </header>

      {/* ─── MOBILE DRAWER ───────────────────────────────────────────── */}
      <div className={`sh-overlay${menuOpen ? ' open' : ''}`} onClick={() => setMenuOpen(false)} />

      <div className={`sh-drawer${menuOpen ? ' open' : ''}`}
        style={{ background: dk ? '#0d1118' : '#f5f8ff', borderRight: bdr }}>

        {/* Drawer top */}
        <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', borderBottom: bdr, flexShrink: 0 }}>
          <Link href="/" onClick={() => setMenuOpen(false)}>
            <span style={{ fontWeight: 900, fontSize: 20, color: dk ? '#f2f4f8' : '#0f1a2e' }}>music</span>
            <span style={{ fontWeight: 900, fontSize: 20, color: '#fb923c' }}>.lt</span>
          </Link>
          <button onClick={() => setMenuOpen(false)}
            style={{ width: 28, height: 28, borderRadius: 7, border: 'none', background: 'transparent', color: dk ? '#6a88b0' : '#6a85a8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Drawer search */}
        <div style={{ padding: '12px 14px', borderBottom: bdr }}>
          <div style={{ display: 'flex', alignItems: 'center', borderRadius: 10, overflow: 'hidden', background: dk ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', border: dk ? '1px solid rgba(255,255,255,0.09)' : '1px solid rgba(0,0,0,0.1)' }}>
            <input type="text" placeholder="Ieškoti…"
              style={{ flex: 1, height: 38, padding: '0 14px', fontSize: 13, background: 'transparent', border: 'none', outline: 'none', color: dk ? '#c8d8f0' : '#1a2540' }} />
            <span style={{ padding: '0 12px', color: dk ? '#4a6580' : '#6a85a8', display: 'flex', alignItems: 'center' }}>
              <SearchIcon />
            </span>
          </div>
        </div>

        {/* Drawer nav */}
        <nav style={{ flex: 1, padding: '8px 10px', overflowY: 'auto' }}>
          {NAV.map(n => {
            const active = pathname === n.href
            return (
              <Link key={n.label} href={n.href} onClick={() => setMenuOpen(false)}
                style={{ display: 'block', padding: '11px 14px', borderRadius: 10, fontSize: 14, fontWeight: 700, textDecoration: 'none', marginBottom: 2, color: active ? '#60a5fa' : (dk ? '#8aa8cc' : '#4a6080'), background: active ? 'rgba(96,165,250,0.1)' : 'transparent', transition: 'background .12s, color .12s' }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = dk ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'; e.currentTarget.style.color = dk ? '#e2eaf8' : '#0f1a2e' }}}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = dk ? '#8aa8cc' : '#4a6080' }}}>
                {n.label}
              </Link>
            )
          })}
        </nav>

        {/* Drawer bottom: theme */}
        <div style={{ padding: '12px 14px', borderTop: bdr }}>
          <button onClick={() => { setTheme(theme === 'dark' ? 'light' : 'dark'); setMenuOpen(false) }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px', borderRadius: 10, border: 'none', background: dk ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', color: dk ? '#8aa8cc' : '#4a6080', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            {dk ? <><SunIcon /> Šviesi tema</> : <><MoonIcon /> Tamsi tema</>}
          </button>
        </div>
      </div>
    </>
  )
}
