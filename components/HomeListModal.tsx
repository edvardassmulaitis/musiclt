'use client'

// components/HomeListModal.tsx
//
// Universalus „pilno sąrašo" modalas homepage'o sekcijoms. Atidaromas paspaudus
// elegantišką siaurą „+N" elementą horizontalios juostos pabaigoje, kuris yra
// VISADA matomas dešinėje (sticky outside scroll'inamo container'io).
//
// `StickyMoreButton` — kompaktiškas siauras vertikalus button'as (50px pločio)
// su tik skaičiumi. Stovi šalia scroll'inamo content'o, ne jame.
//
// Generic — `HomeListModal` priima vaikų funkciją (render prop), kad konkreti
// sekcija pati nuspręstų kaip rodyti kiekvieną item'ą.

import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export function HomeListModal({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string | null
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const scrollY = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.left = '0'
    document.body.style.right = '0'
    document.body.style.width = '100%'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.left = ''
      document.body.style.right = ''
      document.body.style.width = ''
      window.scrollTo(0, scrollY)
    }
  }, [open, onClose])

  if (!open) return null
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[1250] flex items-center justify-center p-3 sm:p-6 backdrop-blur-md"
      style={{ background: 'rgba(0,0,0,0.65)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-5xl max-h-[88vh] rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: 'var(--modal-bg)',
          border: '1px solid var(--modal-border)',
          boxShadow: 'var(--modal-shadow)',
        }}
      >
        <div
          className="flex items-center justify-between gap-3 px-5 py-4 border-b"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="min-w-0">
            <h2
              className="m-0 truncate font-black tracking-[-0.01em]"
              style={{
                fontFamily: "'Outfit', sans-serif",
                color: 'var(--text-primary)',
                fontSize: 'clamp(1.05rem, 2vw, 1.35rem)',
              }}
            >
              {title}
            </h2>
            {subtitle && (
              <p
                className="m-0 mt-0.5 truncate text-[12px]"
                style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}
              >
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Uždaryti"
            className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full transition hover:opacity-80"
            style={{ background: 'var(--bg-active)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
          >
            ✕
          </button>
        </div>

        <div
          className="flex-1 overflow-y-auto p-5"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Kompaktiškas siauras vertikalus „+N" button'as. Stovi šalia scroll'inamo
 *  content'o, ne jame — todėl visada matomas dešinėje sekcijos pusėje, kai
 *  user'is dar nepradėjo scroll'inti.
 *
 *  Naudojimas:
 *  ```tsx
 *  <div className="flex items-stretch gap-3">
 *    <div className="flex-1 min-w-0 hp-scroll flex gap-3">...items</div>
 *    <StickyMoreButton count={42} onClick={...} height={130} />
 *  </div>
 *  ```
 */
export function StickyMoreButton({
  count,
  onClick,
  height,
  ariaLabel,
}: {
  count: number
  onClick: () => void
  /** Container height (= scroll item aukštis), kad button'as tampa lygus
   *  kortelei. Pvz. albumams 184px (cover+text), tracks 70px, events 130px. */
  height: number
  ariaLabel?: string
}) {
  if (count <= 0) return null
  // 2026-05-29 v2: minimalistinis „expand" mygtukas — BE skaičiaus ir BE žodžio
  // (Edvardas: ikona turi pati aiškiai reikšti „atverti pilną vaizdą"). Naudojam
  // standartinę diagonal-arrows fullscreen/expand ikoną.
  return (
    <button
      type="button"
      onClick={onClick}
      data-sticky-more="1"
      aria-label={ariaLabel || 'Atverti visą sąrašą'}
      title="Atverti visą sąrašą su filtrais"
      className="group flex shrink-0 items-center justify-center rounded-xl border transition-all hover:-translate-y-px hover:border-[var(--accent-orange)]/45 hover:bg-[var(--accent-orange)]/12"
      style={{
        width: 44,
        height,
        background: 'var(--bg-surface)',
        borderColor: 'var(--border-default)',
        color: 'var(--text-muted)',
        fontFamily: 'Outfit,sans-serif',
      }}
    >
      {/* Desktop (≥640px): 2x2 grid ikona — „peržiūrėti visą sąrašą". Mobile:
          „list" ikona (eilutės+taškai), kaip artist page player'io dainų sąraše.
          Edvardo prašymu 2026-05-31 — mobile button'as turi atrodyti kitaip. */}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="hidden sm:block transition-colors group-hover:fill-[var(--accent-orange)]">
        <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" />
        <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" />
        <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" />
        <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" />
      </svg>
      {/* Mobile — toks pat paprastas 3-eilučių „list" ikona kaip artist page'o
          dainų eilutėse (paskutinė eilutė trumpesnė). 2026-05-31. */}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="block sm:hidden transition-colors group-hover:stroke-[var(--accent-orange)]">
        <line x1="4" y1="7" x2="20" y2="7" />
        <line x1="4" y1="12" x2="20" y2="12" />
        <line x1="4" y1="17" x2="14" y2="17" />
      </svg>
    </button>
  )
}
