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
  /** Akcentinė ikonos chip'o spalva (tekstas) */
  color: string
  /** Ikonos chip'o fonas */
  bg: string
}

type Group = { label: string; items: Item[] }

const sv = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
)

// Vieningas kortelės stilius visur — kiekviena kortelė turi savo akcentą,
// kad sekcijos skaitytųsi ramiai ir aiškiai (vietoj 3 skirtingų tinklelių).
const GROUPS: Group[] = [
  {
    label: 'Dalinkis muzika',
    items: [
      { href: '/blogas/rasyti?type=review', label: 'Recenzija', desc: 'Įvertink dainą ar albumą', bg: 'rgba(239,68,68,0.15)', color: '#f87171', icon: sv(<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />) },
      { href: '/blogas/rasyti?type=event', label: 'Koncerto įspūdžiai', desc: 'Buvai koncerte? Papasakok', bg: 'rgba(59,130,246,0.15)', color: '#60a5fa', icon: sv(<path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zM19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8" />) },
      { href: '/blogas/rasyti?type=topas', label: 'Topas', desc: 'Sudaryk savo reitingą', bg: 'rgba(245,158,11,0.15)', color: '#fbbf24', icon: sv(<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 5M17 6h3a3 3 0 0 1-3 5" />) },
      { href: '/muzikos-atradimai/pasidalink', label: 'Atradimas', desc: 'Pasidalink rasta muzika', bg: 'rgba(249,115,22,0.15)', color: '#fb923c', icon: sv(<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" />) },
    ],
  },
  {
    label: 'Kūryba',
    items: [
      { href: '/blogas/rasyti?type=creation', label: 'Kūryba', desc: 'Eilėraštis, tavo kūrinys', bg: 'rgba(139,92,246,0.15)', color: '#a78bfa', icon: sv(<><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>) },
      { href: '/blogas/rasyti?type=translation', label: 'Vertimas', desc: 'Dainos žodžiai', bg: 'rgba(20,184,166,0.15)', color: '#2dd4bf', icon: sv(<><path d="m5 8 6 6" /><path d="m4 14 6-6 2-3" /><path d="M2 5h12" /><path d="M7 2h1" /><path d="m22 22-5-10-5 10" /><path d="M14 18h6" /></>) },
      { href: '/blogas/rasyti?type=article', label: 'Įrašas', desc: 'Straipsnis, mintis', bg: 'rgba(100,116,139,0.18)', color: '#94a3b8', icon: sv(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>) },
    ],
  },
  {
    label: 'Greiti veiksmai',
    items: [
      { href: '/blogas/rasyti?type=daily', label: 'Dienos daina', desc: 'Pasiūlyk dainą', bg: 'rgba(34,197,94,0.15)', color: '#4ade80', icon: sv(<><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /></>) },
      { href: '/blogas/rasyti?type=mood', label: 'Nuotaikos daina', desc: 'Daina tavo profiliui', bg: 'rgba(236,72,153,0.15)', color: '#f472b6', icon: sv(<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />) },
      { href: '/diskusijos', label: 'Diskusija', desc: 'Įsitrauk į pokalbį', bg: 'rgba(99,102,241,0.15)', color: '#818cf8', icon: sv(<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />) },
    ],
  },
]

export function QuickCreate() {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [dailyDone, setDailyDone] = useState(false)
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

  // Kai atidaromas — patikrinam ar jau pasiūlė dienos dainą šiandien.
  useEffect(() => {
    if (!open || !session?.user) return
    let on = true
    fetch('/api/dienos-daina/nominations')
      .then(r => r.json())
      .then(d => { if (on) setDailyDone(!!d.already_nominated) })
      .catch(() => {})
    return () => { on = false }
  }, [open, session?.user])

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

  const Card = ({ it, done }: { it: Item; done?: boolean }) => done ? (
    <div className="qc-card qc-card--done">
      <span className="qc-card-icon" style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      </span>
      <span className="qc-card-text">
        <span className="qc-card-label">{it.label}</span>
        <span className="qc-card-desc" style={{ color: '#4ade80' }}>Pasiūlyta!</span>
      </span>
    </div>
  ) : (
    <button type="button" className="qc-card" onClick={() => go(it.href)}>
      <span className="qc-card-icon" style={{ background: it.bg, color: it.color }}>{it.icon}</span>
      <span className="qc-card-text">
        <span className="qc-card-label">{it.label}</span>
        <span className="qc-card-desc">{it.desc}</span>
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
          color: var(--text-muted); margin: 14px 4px 8px;
        }
        /* Vieningas kortelės stilius — visos sekcijos atrodo vienodai. */
        .qc-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .qc-card {
          display: flex; align-items: center; gap: 11px; text-align: left; cursor: pointer;
          padding: 11px 12px; border-radius: 14px; width: 100%;
          background: var(--bg-elevated); border: 1px solid var(--border-subtle);
          transition: border-color .14s, background .14s, transform .1s;
        }
        .qc-card:not(.qc-card--done):hover { border-color: var(--border-strong); background: var(--bg-active); }
        .qc-card:not(.qc-card--done):active { transform: scale(.97); }
        .qc-card--done { cursor: default; border-color: rgba(34,197,94,0.25); background: rgba(34,197,94,0.06); }
        .qc-card-icon {
          width: 38px; height: 38px; border-radius: 11px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
        }
        .qc-card-icon svg { width: 19px; height: 19px; }
        .qc-card-text { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
        .qc-card-label { font-size: 13px; font-weight: 800; color: var(--text-primary); line-height: 1.25; }
        .qc-card-desc { font-size: 11px; color: var(--text-muted); line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
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

          {GROUPS.map(g => (
            <div key={g.label}>
              <div className="qc-group-label">{g.label}</div>
              <div className="qc-cards">
                {g.items.map(it => (
                  <Card key={it.href} it={it} done={it.href === '/blogas/rasyti?type=daily' && dailyDone} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>,
    document.body
  )
}
