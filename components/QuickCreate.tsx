'use client'

/**
 * QuickCreate — „+" greitas turinio pridėjimas (aktyvumui skatinti).
 *
 * Atidaromas iš:
 *   - MobileBottomNav centrinio „+" mygtuko (mobile)
 *   - SiteHeader „+ Kurti" mygtuko (desktop)
 * per `openQuickCreate()` helper'į (window event), kad nereikėtų context plumbing'o
 * per didelį SiteHeader medį.
 *
 * Mobile → bottom sheet (slide-up). Desktop → centered modal.
 * Ikonos — inline SVG (projektas neturi ikonų bibliotekos; lucide laužo build'ą).
 */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, usePathname } from 'next/navigation'
import { useSession, signIn } from 'next-auth/react'

const QC_EVENT = 'musiclt:quickcreate'

/** Atidaro QuickCreate lapą iš bet kurios vietos. */
export function openQuickCreate() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(QC_EVENT))
}

type Item = {
  href: string
  label: string
  desc: string
  icon: React.ReactNode
  accent?: string
}

const sv = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
)

const CREATE: Item[] = [
  { href: '/blogas/rasyti?type=article', label: 'Įrašas', desc: 'Straipsnis, mintis', icon: sv(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>) },
  { href: '/blogas/rasyti?type=review', label: 'Recenzija', desc: 'Įvertink dainą/albumą', icon: sv(<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z" />) },
  { href: '/blogas/rasyti?type=translation', label: 'Vertimas', desc: 'Dainos žodžiai', icon: sv(<><path d="m5 8 6 6" /><path d="m4 14 6-6 2-3" /><path d="M2 5h12" /><path d="M7 2h1" /><path d="m22 22-5-10-5 10" /><path d="M14 18h6" /></>) },
  { href: '/blogas/rasyti?type=creation', label: 'Kūryba', desc: 'Tavo daina/kūrinys', icon: sv(<><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>) },
  { href: '/blogas/rasyti?type=topas', label: 'Topas', desc: 'Sąrašas, reitingas', icon: sv(<><path d="M10 6h11" /><path d="M10 12h11" /><path d="M10 18h11" /><path d="M4 6h1v4" /><path d="M4 10h2" /><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" /></>) },
  { href: '/blogas/rasyti?type=event', label: 'Renginys', desc: 'Koncerto apžvalga', icon: sv(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></>) },
]

const PARTICIPATE: Item[] = [
  { href: '/dienos-daina', label: 'Dienos daina', desc: 'Siūlyk ir balsuok', accent: 'var(--accent-orange)', icon: sv(<><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /></>) },
  { href: '/boombox', label: 'Boombox', desc: 'Atspėk, žaisk', accent: 'var(--accent-orange)', icon: sv(<><rect x="3" y="8" width="18" height="12" rx="2" /><circle cx="8" cy="14" r="2" /><circle cx="16" cy="14" r="2" /><path d="M7 8V5a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v3" /></>) },
  { href: '/pokalbiai', label: 'Diskusija', desc: 'Parašyk bendruomenei', accent: 'var(--accent-orange)', icon: sv(<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />) },
]

export function QuickCreate() {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const { data: session } = useSession()

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener(QC_EVENT, onOpen)
    return () => window.removeEventListener(QC_EVENT, onOpen)
  }, [])

  // Užsidaro pasikeitus maršrutui (kad nelikt' kabantis po navigacijos).
  useEffect(() => { setOpen(false) }, [pathname])

  // ESC uždaro. NB: NEblokuojam body/html overflow — overlay'us pats dengia
  // foną, o overflow lock'as buvo paliekamas „stuck" po navigacijos ir laužė
  // viso puslapio scroll'ą mobile'e.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (!mounted || !open) return null

  const go = (href: string) => { setOpen(false); router.push(href) }

  const Tile = ({ it }: { it: Item }) => (
    <button type="button" className="qc-tile" onClick={() => go(it.href)}>
      <span className="qc-tile-icon" style={it.accent ? { color: it.accent } : undefined}>{it.icon}</span>
      <span className="qc-tile-label">{it.label}</span>
      <span className="qc-tile-desc">{it.desc}</span>
    </button>
  )

  return createPortal(
    <>
      <style>{`
        .qc-overlay {
          position: fixed; inset: 0; z-index: 1000;
          background: rgba(0,0,0,0.6); backdrop-filter: blur(6px);
          display: flex; align-items: flex-end; justify-content: center;
          animation: qc-fade .18s ease;
        }
        @keyframes qc-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes qc-up { from { transform: translateY(100%) } to { transform: translateY(0) } }
        .qc-sheet {
          width: 100%; max-width: 560px;
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-bottom: none;
          border-radius: 20px 20px 0 0;
          padding: 14px 16px calc(18px + env(safe-area-inset-bottom));
          box-shadow: 0 -10px 40px rgba(0,0,0,0.4);
          animation: qc-up .26s cubic-bezier(.4,0,.2,1);
          max-height: 88vh; overflow-y: auto;
        }
        .qc-grab { width: 38px; height: 4px; border-radius: 2px; background: var(--border-strong); margin: 2px auto 12px; }
        .qc-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
        .qc-title { font-size: 17px; font-weight: 800; color: var(--text-primary); letter-spacing: -0.01em; }
        .qc-close {
          width: 32px; height: 32px; border-radius: 8px; border: none; cursor: pointer;
          background: var(--bg-hover); color: var(--text-secondary);
          display: flex; align-items: center; justify-content: center;
        }
        .qc-close:hover { color: var(--text-primary); }
        .qc-banner {
          display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
          background: var(--bg-hover); border: 1px solid var(--border-subtle);
          border-radius: 12px; padding: 10px 12px; margin: 8px 0 4px;
          font-size: 13px; color: var(--text-secondary);
        }
        .qc-banner button {
          margin-left: auto; border: none; cursor: pointer; font-weight: 700; font-size: 13px;
          background: var(--accent-orange); color: #fff; padding: 7px 14px; border-radius: 8px;
        }
        .qc-group-label {
          font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
          color: var(--text-muted); margin: 16px 4px 8px;
        }
        .qc-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .qc-tile {
          display: flex; flex-direction: column; align-items: center; text-align: center; gap: 4px;
          padding: 12px 6px; cursor: pointer;
          background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: 14px;
          transition: border-color .14s, background .14s, transform .1s;
        }
        .qc-tile:hover { border-color: var(--border-strong); background: var(--bg-active); }
        .qc-tile:active { transform: scale(.97); }
        .qc-tile-icon { color: var(--accent-link); }
        .qc-tile-icon svg { width: 22px; height: 22px; }
        .qc-tile-label { font-size: 12.5px; font-weight: 700; color: var(--text-primary); }
        .qc-tile-desc { font-size: 10.5px; color: var(--text-muted); line-height: 1.2; }
        @media (min-width: 720px) {
          .qc-overlay { align-items: center; }
          .qc-sheet { border-radius: 18px; border-bottom: 1px solid var(--border-default); animation: qc-fade .2s ease; }
          .qc-grab { display: none; }
        }
      `}</style>
      <div className="qc-overlay" onClick={() => setOpen(false)}>
        <div className="qc-sheet" onClick={e => e.stopPropagation()}>
          <div className="qc-grab" />
          <div className="qc-head">
            <span className="qc-title">Pridėti</span>
            <button className="qc-close" aria-label="Uždaryti" onClick={() => setOpen(false)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>

          {!session?.user && (
            <div className="qc-banner">
              <span>Prisijunk, kad galėtum kurti turinį.</span>
              <button onClick={() => signIn()}>Prisijungti</button>
            </div>
          )}

          <div className="qc-group-label">Kurk</div>
          <div className="qc-grid">{CREATE.map(it => <Tile key={it.href} it={it} />)}</div>

          <div className="qc-group-label">Dalyvauk</div>
          <div className="qc-grid">{PARTICIPATE.map(it => <Tile key={it.href} it={it} />)}</div>
        </div>
      </div>
    </>,
    document.body
  )
}
