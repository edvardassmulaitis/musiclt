'use client'

/**
 * AdminQuickAddModal — „⚡ Greitas pridėjimas" modale, paleidžiamas iš bet kur.
 *
 * Atidaromas per `openAdminQuickAdd()` (window event), kad mygtukas galėtų gyventi
 * tiek public SiteHeader'yje, tiek admin AdminHeader'yje be context plumbing'o.
 * Viduje renderina <AdminQuickAdd bare /> (ta pati YouTube/Wikipedia link → preview
 * → create logika kaip admin dashboard'e).
 *
 * Montuojamas vieną kartą SiteShell'e (apgaubia ir public, ir admin route'us).
 */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import AdminQuickAdd from '@/components/AdminQuickAdd'

const AQA_EVENT = 'musiclt:admin-quickadd'

/** Atidaro greito pridėjimo modalą iš bet kurios vietos. */
export function openAdminQuickAdd() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(AQA_EVENT))
}

export function AdminQuickAddModal() {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const pathname = usePathname()

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener(AQA_EVENT, onOpen)
    return () => window.removeEventListener(AQA_EVENT, onOpen)
  }, [])

  // Užsidaro pasikeitus maršrutui (pvz. paspaudus sukurto įrašo nuorodą rezultate).
  useEffect(() => { setOpen(false) }, [pathname])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (!mounted || !open) return null

  return createPortal(
    <>
      <style>{`
        .aqa-overlay {
          position: fixed; inset: 0; z-index: 1000;
          background: rgba(0,0,0,0.6); backdrop-filter: blur(6px);
          display: flex; align-items: flex-end; justify-content: center;
          animation: aqa-fade .18s ease;
        }
        @keyframes aqa-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes aqa-up { from { transform: translateY(100%) } to { transform: translateY(0) } }
        .aqa-sheet {
          width: 100%; max-width: 600px;
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-bottom: none;
          border-radius: 20px 20px 0 0;
          padding: 14px 16px calc(20px + env(safe-area-inset-bottom));
          box-shadow: 0 -10px 40px rgba(0,0,0,0.4);
          animation: aqa-up .26s cubic-bezier(.4,0,.2,1);
          max-height: 90vh; overflow-y: auto;
        }
        .aqa-grab { width: 38px; height: 4px; border-radius: 2px; background: var(--border-strong); margin: 2px auto 10px; }
        .aqa-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
        .aqa-title { font-size: 16px; font-weight: 800; color: var(--text-primary); letter-spacing: -0.01em; }
        .aqa-close {
          width: 32px; height: 32px; border-radius: 8px; border: none; cursor: pointer;
          background: var(--bg-hover); color: var(--text-secondary);
          display: flex; align-items: center; justify-content: center;
        }
        .aqa-close:hover { color: var(--text-primary); }
        @media (min-width: 720px) {
          .aqa-overlay { align-items: center; }
          .aqa-sheet { border-radius: 18px; border-bottom: 1px solid var(--border-default); animation: aqa-fade .2s ease; }
          .aqa-grab { display: none; }
        }
      `}</style>
      <div
        className="aqa-overlay"
        data-theme="light"
        style={{ colorScheme: 'light' }}
        onClick={() => setOpen(false)}
      >
        <div className="aqa-sheet" onClick={e => e.stopPropagation()}>
          <div className="aqa-grab" />
          <div className="aqa-head">
            <span className="aqa-title">Greitas pridėjimas</span>
            <button className="aqa-close" aria-label="Uždaryti" onClick={() => setOpen(false)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          <AdminQuickAdd bare />
        </div>
      </div>
    </>,
    document.body
  )
}
