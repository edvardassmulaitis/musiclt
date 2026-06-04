'use client'

/**
 * MobileBottomNav — app-stiliaus apatinis meniu (tik mobile, ≤1080px).
 *
 * v2 (5 vietos, centrinis „+" FAB):
 *   🏠 Home · ❤️ Sekami · ➕ Kurti · 📈 Topai · 💬 Pokalbiai
 *
 * Pagrindinis principas: Home = muzikos pasaulis, ❤️ = mano muzikos pasaulis.
 *
 * Pakeitimai nuo v1:
 *   - Pridėtas Home (/) ir Topai (/topai).
 *   - Boombox PAŠALINTAS iš baro (pasiekiamas per „+" ir feed item'us).
 *   - Pranešimai PERKELTI į top bar'ą (NotificationsBell header'yje, visada
 *     matomas — kaip Instagram/TikTok). Apatiniame bare jų nebėra.
 *
 * Pokalbiai išlaiko unread badge'ą. Slepiasi desktop'e (CSS) ir /admin
 * (render gate SiteShell'yje). Ikonos — inline SVG. Jokio backdrop-filter.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { openQuickCreate } from '@/components/QuickCreate'

export function MobileBottomNav() {
  const pathname = usePathname() || '/'
  const isHome = pathname === '/'
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')
  // Topai apima ir /top40 /top30 senuosius kelius
  const isTopai = isActive('/topai') || isActive('/top40') || isActive('/top30') || isActive('/topas')
  const [msgs, setMsgs] = useState(0)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const m = await fetch('/api/chat/unread', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null)
        if (!alive) return
        if (m) setMsgs(m.unread || 0)
      } catch { /* ignore */ }
    }
    load()
    const t = setInterval(load, 60000)
    return () => { alive = false; clearInterval(t) }
  }, [pathname])

  const Badge = ({ n }: { n: number }) => n > 0
    ? <span className="mbn-badge">{n > 9 ? '9+' : n}</span>
    : null

  return (
    <>
      <style>{`
        .mbn {
          display: none;
          position: fixed; left: 0; right: 0; bottom: 0; z-index: 150;
          height: calc(58px + env(safe-area-inset-bottom));
          padding-bottom: env(safe-area-inset-bottom);
          background: var(--bg-surface);
          border-top: 1px solid var(--border-default);
          align-items: stretch;
        }
        @media (max-width: 1080px) { .mbn { display: flex; } }
        .mbn-item {
          flex: 1; border: none; background: transparent; cursor: pointer;
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
          color: var(--text-muted); font-family: inherit;
          text-decoration: none; transition: color .14s; position: relative;
          -webkit-tap-highlight-color: transparent; min-width: 0;
        }
        .mbn-item.active { color: var(--accent-orange); }
        .mbn-ico { position: relative; display: flex; }
        .mbn-ico svg { width: 23px; height: 23px; }
        .mbn-label { font-size: 10px; font-weight: 700; letter-spacing: -0.02em; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .mbn-badge {
          position: absolute; top: -5px; right: -9px; min-width: 15px; height: 15px; padding: 0 4px;
          border-radius: 8px; background: var(--accent-red, #f87171); color: #fff;
          font-size: 9.5px; font-weight: 800; line-height: 15px; text-align: center;
        }
        .mbn-fab-wrap { flex: 1; display: flex; align-items: center; justify-content: center; }
        .mbn-fab {
          width: 50px; height: 50px; margin-top: -20px; border-radius: 50%;
          border: 3px solid var(--bg-body); background: var(--accent-orange);
          color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center;
          box-shadow: 0 6px 18px rgba(249,115,22,0.45);
          transition: transform .12s;
          -webkit-tap-highlight-color: transparent;
        }
        .mbn-fab:active { transform: scale(.92); }
        .mbn-fab svg { width: 26px; height: 26px; }
      `}</style>
      <nav className="mbn" aria-label="Apatinė navigacija">
        {/* Home — muzikos pasaulis */}
        <Link href="/" className={`mbn-item${isHome ? ' active' : ''}`}>
          <span className="mbn-ico">
            <svg viewBox="0 0 24 24" fill={isHome ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V9.5Z" /></svg>
          </span>
          <span className="mbn-label">Pradžia</span>
        </Link>

        {/* Sekami (❤️) — mano muzikos pasaulis */}
        <Link href="/srautas" className={`mbn-item${isActive('/srautas') ? ' active' : ''}`}>
          <span className="mbn-ico">
            <svg viewBox="0 0 24 24" fill={isActive('/srautas') ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" /></svg>
          </span>
          <span className="mbn-label">Sekami</span>
        </Link>

        {/* + (centras) — Create Hub */}
        <div className="mbn-fab-wrap">
          <button type="button" className="mbn-fab" aria-label="Kurti" onClick={() => openQuickCreate()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
        </div>

        {/* Topai — charts ir trending */}
        <Link href="/topai" className={`mbn-item${isTopai ? ' active' : ''}`}>
          <span className="mbn-ico">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="m7 14 4-4 3 3 5-6" /></svg>
          </span>
          <span className="mbn-label">Topai</span>
        </Link>

        {/* Pokalbiai — social layer */}
        <Link href="/pokalbiai" className={`mbn-item${isActive('/pokalbiai') ? ' active' : ''}`}>
          <span className="mbn-ico">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" /></svg>
            <Badge n={msgs} />
          </span>
          <span className="mbn-label">Pokalbiai</span>
        </Link>
      </nav>
    </>
  )
}
