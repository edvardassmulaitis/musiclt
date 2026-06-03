'use client'

/**
 * MobileBottomNav — app-stiliaus apatinis meniu (tik mobile, ≤1080px).
 *
 * 3 vietos su centriniu „+" FAB:
 *   Srautas (♥, personalizuotas feed) · + (QuickCreate) · Boombox (žaidimas)
 *
 * Profilis / meniu / paieška / žinutės / pranešimai lieka viršuje (SiteHeader).
 * Slepiamas desktop'e (CSS), ir /admin /pokalbiai (render gate SiteShell'yje).
 * Ikonos — inline SVG.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { openQuickCreate } from '@/components/QuickCreate'

export function MobileBottomNav() {
  const pathname = usePathname() || '/'
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

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
          backdrop-filter: blur(12px) saturate(160%);
        }
        @media (max-width: 1080px) { .mbn { display: flex; } }
        .mbn-item {
          flex: 1; border: none; background: transparent; cursor: pointer;
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
          color: var(--text-muted); font-family: inherit;
          text-decoration: none; transition: color .14s;
          -webkit-tap-highlight-color: transparent;
        }
        .mbn-item.active { color: var(--accent-orange); }
        .mbn-item svg { width: 23px; height: 23px; }
        .mbn-label { font-size: 10px; font-weight: 700; letter-spacing: -0.01em; }
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
        <Link href="/srautas" className={`mbn-item${isActive('/srautas') ? ' active' : ''}`}>
          <svg viewBox="0 0 24 24" fill={isActive('/srautas') ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />
          </svg>
          <span className="mbn-label">Srautas</span>
        </Link>

        <div className="mbn-fab-wrap">
          <button type="button" className="mbn-fab" aria-label="Pridėti" onClick={() => openQuickCreate()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
        </div>

        <Link href="/boombox" className={`mbn-item${isActive('/boombox') ? ' active' : ''}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="8" width="18" height="12" rx="2" /><circle cx="8" cy="14" r="2" /><circle cx="16" cy="14" r="2" /><path d="M7 8V5a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v3" />
          </svg>
          <span className="mbn-label">Boombox</span>
        </Link>
      </nav>
    </>
  )
}
