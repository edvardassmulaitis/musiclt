'use client'

/**
 * MobileBottomNav — app-stiliaus apatinis meniu (tik mobile, ≤1080px).
 *
 * v6 (5 vietos, „+" CENTRE), TIK IKONOS:
 *   🏠 Pradžia · ❤️ Sekami · ➕ Kurti · 👥 Bendruomenė(/atrasti) · 📊 Topai
 *
 * Kodėl v6: Pokalbiai (💬) perkelti į viršutinį baro (MessagesBell, šalia
 * pranešimų), kad „+" Kurti liktų tiksliai per vidurį (3-ia iš 5). „+" pažymėtas
 * oranžine chip'u kaip pagrindinis kūrimo veiksmas.
 *
 * Ikonos: plonesnės (strokeWidth 1.8, 24px), TIK kontūras (be fill) — aktyvus
 * žymimas tik oranžine spalva, kad pasirinkus ikonos nesusilietų į blob'ą.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { openQuickCreate } from '@/components/QuickCreate'

export function MobileBottomNav() {
  const pathname = usePathname() || '/'
  const isHome = pathname === '/'
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')
  const isTopai = isActive('/topai') || isActive('/top40') || isActive('/top30') || isActive('/topas')

  return (
    <>
      <style>{`
        .mbn {
          display: none;
          position: fixed; left: 0; right: 0; bottom: 0; z-index: 150;
          height: calc(56px + env(safe-area-inset-bottom));
          padding-bottom: env(safe-area-inset-bottom);
          background: var(--bg-surface);
          border-top: 1px solid var(--border-default);
          align-items: stretch;
        }
        @media (max-width: 1080px) { .mbn { display: flex; } }
        .mbn-item {
          flex: 1; border: none; background: transparent; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          color: var(--text-muted); font-family: inherit;
          text-decoration: none; transition: color .14s; position: relative;
          -webkit-tap-highlight-color: transparent; min-width: 0;
        }
        .mbn-item.active { color: var(--accent-orange); }
        .mbn-ico { position: relative; display: flex; }
        .mbn-ico svg { width: 24px; height: 24px; display: block; }
        /* „+" Kurti — oranžinis chip, vienam lygyje su kitais (nepakeltas). */
        .mbn-create-chip {
          display: flex; align-items: center; justify-content: center;
          width: 34px; height: 34px; border-radius: 11px;
          background: var(--accent-orange); color: #fff;
          transition: transform .12s, filter .15s;
        }
        .mbn-create-chip svg { width: 22px; height: 22px; }
        .mbn-item:active .mbn-create-chip { transform: scale(.9); }
      `}</style>
      <nav className="mbn" aria-label="Apatinė navigacija">
        {/* Pradžia (Home) — stroke 2, viena serija su top header ikonomis (I.*) */}
        <Link href="/" className={`mbn-item${isHome ? ' active' : ''}`} aria-label="Pradžia">
          <span className="mbn-ico">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.8 12 3.5l9 6.3V20a1 1 0 0 1-1 1h-4.5v-6.5h-7V21H4a1 1 0 0 1-1-1V9.8Z" /></svg>
          </span>
        </Link>

        {/* Topai — ekvalaizeris (music charts / levels), stroke 2 = ta pati serija */}
        <Link href="/topai" className={`mbn-item${isTopai ? ' active' : ''}`} aria-label="Topai">
          <span className="mbn-ico">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="20" x2="4" y2="12"/><line x1="9.3" y1="20" x2="9.3" y2="6"/><line x1="14.6" y1="20" x2="14.6" y2="14"/><line x1="20" y1="20" x2="20" y2="9"/></svg>
          </span>
        </Link>

        {/* ➕ Kurti — oranžinis chip, CENTRE (3-ia iš 5) */}
        <button type="button" className="mbn-item" aria-label="Kurti" onClick={() => openQuickCreate()}>
          <span className="mbn-create-chip">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </span>
        </button>

        {/* 👥 Bendruomenė (Community) → /atrasti — ta pati ikona kaip top header „Atrasti" */}
        <Link href="/atrasti" className={`mbn-item${isActive('/atrasti') ? ' active' : ''}`} aria-label="Bendruomenė">
          <span className="mbn-ico">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="6.5" r="2.8"/><circle cx="5.5" cy="8.5" r="2.1"/><circle cx="18.5" cy="8.5" r="2.1"/><path d="M12 11c-2.8 0-4.7 1.8-4.7 4.3V17h9.4v-1.7c0-2.5-1.9-4.3-4.7-4.3Z"/><path d="M5.5 12.9c-2.1 0-3.5 1.3-3.5 3.2V17h3.3"/><path d="M18.5 12.9c2.1 0 3.5 1.3 3.5 3.2V17h-3.3"/></svg>
          </span>
        </Link>

        {/* Sekami (❤️ Heart) → /srautas — ta pati širdis kaip top header „Srautas" */}
        <Link href="/srautas" className={`mbn-item${isActive('/srautas') ? ' active' : ''}`} aria-label="Sekami">
          <span className="mbn-ico">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" /></svg>
          </span>
        </Link>
      </nav>
    </>
  )
}
