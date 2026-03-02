'use client'

import Link from 'next/link'
import { HeaderAuth } from '@/components/HeaderAuth'
import { useSite } from '@/components/SiteContext'

const NAV = [
  { label: 'Topai', href: '/#topai' },
  { label: 'Muzika', href: '/#muzika' },
  { label: 'Renginiai', href: '/#renginiai' },
  { label: 'Atlikėjai', href: '/atlikejai' },
  { label: 'Bendruomenė', href: '/#bendruomene' },
  { label: 'Blogai', href: '/blogas/mano' },
]

export function SiteHeader() {
  const { lens, setLens, theme, setTheme, dk } = useSite()

  return (
    <header className="sticky top-0 z-50" style={{ background: dk ? 'rgba(13,17,23,0.97)' : 'rgba(245,248,255,0.97)', backdropFilter: 'blur(24px)', borderBottom: dk ? 'none' : '1px solid rgba(0,0,0,0.08)' }}>

      {/* Row 1: Logo + Search + Lens + Auth */}
      <div className="max-w-[1360px] mx-auto px-5 lg:px-8 h-14 flex items-center gap-6">
        <Link href="/" className="flex-shrink-0">
          <span className="font-black text-[22px] tracking-tight" style={{ color: dk ? '#f2f4f8' : '#0f1a2e' }}>music</span>
          <span className="font-black text-[22px] tracking-tight text-orange-400">.lt</span>
        </Link>

        {/* Search */}
        <div className="flex-1 hidden md:flex items-center rounded-full overflow-hidden transition-all"
          style={{ background: dk ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.05)', border: dk ? '1px solid rgba(255,255,255,0.09)' : '1px solid rgba(0,0,0,0.1)' }}>
          <input type="text" placeholder="Ieškok atlikėjų, albumų, dainų, renginių…"
            className="flex-1 h-9 px-4 text-sm bg-transparent focus:outline-none"
            style={{ color: dk ? '#c8d8f0' : '#1a2540' }} />
          <button className="flex-shrink-0 w-9 h-9 flex items-center justify-center transition-colors hover:text-white"
            style={{ color: dk ? '#6a88b0' : '#4a6080' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </button>
        </div>

        {/* Lens switch */}
        <div className="flex-shrink-0 flex items-center rounded-full p-0.5" style={{ background: dk ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.05)', border: dk ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)' }}>
          {([
            ['lt',    '🇱🇹 LT'],
            ['world', 'Pasaulis'],
            ['all',   'Visi'],
          ] as const).map(([v, l]) => (
            <button key={v} onClick={() => setLens(v)}
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-bold tracking-wide transition-all ${
                lens === v ? 'bg-[#1d4ed8] text-white shadow-md' : 'hover:text-white'
              }`}
              style={{ color: lens === v ? 'white' : '#8aa8cc' }}>
              {l}
            </button>
          ))}
        </div>

        <HeaderAuth />
      </div>

      {/* Row 2: Navigation */}
      <div style={{ borderTop: dk ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.07)', background: dk ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.025)' }}>
        <div className="max-w-[1360px] mx-auto px-5 lg:px-8 h-9 flex items-center gap-1">
          {NAV.map(n => (
            <Link key={n.label} href={n.href}
              className="px-3.5 py-1 text-[12px] font-semibold rounded-md transition-all"
              style={{ color: dk ? '#8aa8cc' : '#4a6080' }}
              onMouseEnter={e => { e.currentTarget.style.color = dk ? '#e2eaf8' : '#0f1a2e'; e.currentTarget.style.background = dk ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}
              onMouseLeave={e => { e.currentTarget.style.color = dk ? '#8aa8cc' : '#4a6080'; e.currentTarget.style.background = 'transparent' }}>
              {n.label}
            </Link>
          ))}
          {/* Theme toggle */}
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="ml-auto w-8 h-8 flex items-center justify-center rounded-lg transition-all"
            style={{ color: dk ? '#4a6580' : '#6a85a8', background: 'transparent' }}
            onMouseEnter={e => { e.currentTarget.style.background = dk ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'; e.currentTarget.style.color = dk ? '#c8d8f0' : '#1a2540' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = dk ? '#4a6580' : '#6a85a8' }}
            title={dk ? 'Perjungti į šviesią' : 'Perjungti į tamsią'}>
            {dk
              ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            }
          </button>
        </div>
      </div>
    </header>
  )
}
