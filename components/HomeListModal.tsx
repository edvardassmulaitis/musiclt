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
  // 2026-05-29: rodyklė (chevron) pakeista į filtrų ikoną + „Visi" label'ą.
  // Chevron skaitydavosi kaip „scroll į dešinę"; dabar button'as aiškiai
  // komunikuoja, kad atveria pilną sąrašą modale su filtrais. Žemiems
  // button'ams (height < 110, pvz. tracks 70px) label'as paslepiamas.
  const showLabel = height >= 110
  return (
    <button
      type="button"
      onClick={onClick}
      data-sticky-more="1"
      aria-label={ariaLabel || `Atverti visą sąrašą su filtrais (${count})`}
      title={`Atverti visą sąrašą su filtrais (${count})`}
      className="group flex shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border transition-all hover:-translate-y-px hover:bg-[var(--accent-orange)]/20"
      style={{
        width: 54,
        height,
        background: 'linear-gradient(135deg, rgba(249,115,22,0.16), rgba(249,115,22,0.04))',
        borderColor: 'rgba(249,115,22,0.3)',
        color: 'var(--accent-orange)',
        fontFamily: 'Outfit,sans-serif',
      }}
    >
      {/* Filtrų ikona — signalizuoja, kad modale galima filtruoti sąrašą. */}
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 5h18M6 12h12M10 19h4" />
      </svg>
      <span style={{ fontSize: 17, fontWeight: 900, lineHeight: 1 }}>+{count}</span>
      {showLabel && (
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.85 }}>
          Visi
        </span>
      )}
    </button>
  )
}
