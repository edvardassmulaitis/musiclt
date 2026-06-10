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

type FeatItem = Item & { bg: string; color: string }

const sv = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
)

// ── Svarbiausi — tas pats turinys ir tvarka kaip /atrasti prompt'ai
//    (koncertas → apžvalga → topas → atradimas), tos pačios akcentinės spalvos.
const FEATURED: FeatItem[] = [
  { href: '/blogas/rasyti?type=event', label: 'Koncerto įspūdžiai', desc: 'Buvai koncerte? Papasakok', bg: 'rgba(59,130,246,0.15)', color: '#60a5fa', icon: sv(<path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zM19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8" />) },
  { href: '/blogas/rasyti?type=review', label: 'Recenzija', desc: 'Įvertink dainą ar albumą', bg: 'rgba(239,68,68,0.15)', color: '#f87171', icon: sv(<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />) },
  { href: '/blogas/rasyti?type=topas', label: 'Topas', desc: 'Sudaryk savo reitingą', bg: 'rgba(245,158,11,0.15)', color: '#fbbf24', icon: sv(<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 5M17 6h3a3 3 0 0 1-3 5" />) },
  { href: '/muzikos-atradimai/pasidalink', label: 'Atradimas', desc: 'Pasidalink rasta muzika', bg: 'rgba(249,115,22,0.15)', color: '#fb923c', icon: sv(<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" />) },
]

// ── Kūrybos kampas — kaip /atrasti sekcija (eilėraščiai · vertimai · įrašai).
const CREATE: Item[] = [
  { href: '/blogas/rasyti?type=creation', label: 'Kūryba', desc: 'Eilėraštis, tavo kūrinys', icon: sv(<><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>) },
  { href: '/blogas/rasyti?type=translation', label: 'Vertimas', desc: 'Dainos žodžiai', icon: sv(<><path d="m5 8 6 6" /><path d="m4 14 6-6 2-3" /><path d="M2 5h12" /><path d="M7 2h1" /><path d="m22 22-5-10-5 10" /><path d="M14 18h6" /></>) },
  { href: '/blogas/rasyti?type=article', label: 'Įrašas', desc: 'Straipsnis, mintis', icon: sv(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>) },
]

const PARTICIPATE: Item[] = [
  { href: '/blogas/rasyti?type=daily', label: 'Dienos daina', desc: 'Pasiūlyk dainą', accent: 'var(--accent-orange)', icon: sv(<><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /></>) },
  { href: '/diskusijos', label: 'Diskusija', desc: 'Įsitrauk į pokalbį', accent: 'var(--accent-orange)', icon: sv(<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />) },
  { href: '/boombox', label: 'Boombox', desc: 'Atspėk, žaisk', accent: 'var(--accent-orange)', icon: sv(<><rect x="3" y="8" width="18" height="12" rx="2" /><circle cx="8" cy="14" r="2" /><circle cx="16" cy="14" r="2" /><path d="M7 8V5a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v3" /></>) },
  { href: '/blogas/rasyti?type=mood', label: 'Nuotaikos daina', desc: 'Daina tavo profiliui', accent: 'var(--accent-orange)', icon: sv(<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />) },
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

  const FeatCard = ({ it }: { it: FeatItem }) => (
    <button type="button" className="qc-feat" onClick={() => go(it.href)}>
      <span className="qc-feat-icon" style={{ background: it.bg, color: it.color }}>{it.icon}</span>
      <span className="qc-feat-text">
        <span className="qc-feat-label">{it.label}</span>
        <span className="qc-feat-desc">{it.desc}</span>
      </span>
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
        .qc-featgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .qc-feat {
          display: flex; align-items: center; gap: 10px; text-align: left; cursor: pointer;
          padding: 11px 12px; border-radius: 14px;
          background: var(--bg-elevated); border: 1px solid var(--border-subtle);
          transition: border-color .14s, background .14s, transform .1s;
        }
        .qc-feat:hover { border-color: var(--accent-orange); background: rgba(249,115,22,0.07); }
        .qc-feat:active { transform: scale(.97); }
        .qc-feat-icon {
          width: 36px; height: 36px; border-radius: 11px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
        }
        .qc-feat-icon svg { width: 18px; height: 18px; }
        .qc-feat-text { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
        .qc-feat-label { font-size: 13px; font-weight: 800; color: var(--text-primary); line-height: 1.25; }
        .qc-feat-desc { font-size: 11px; color: var(--text-muted); line-height: 1.25; }
        .qc-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .qc-grid-4 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
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
          .qc-grid-4 { grid-template-columns: repeat(4, 1fr); }
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

          <div className="qc-group-label">Dalinkis muzika</div>
          <div className="qc-featgrid">{FEATURED.map(it => <FeatCard key={it.href} it={it} />)}</div>

          <div className="qc-group-label">Kūrybos kampas</div>
          <div className="qc-grid">{CREATE.map(it => <Tile key={it.href} it={it} />)}</div>

          <div className="qc-group-label">Dalyvauk</div>
          <div className="qc-grid-4">{PARTICIPATE.map(it => <Tile key={it.href} it={it} />)}</div>
        </div>
      </div>
    </>,
    document.body
  )
}
