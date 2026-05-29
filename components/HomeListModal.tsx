'use client'

// components/HomeListModal.tsx
//
// Universalus „pilno sąrašo" modalas homepage'o sekcijoms. Atidaromas paspaudus
// „peržiūrėti visą" (grid) elementą horizontalios juostos pabaigoje.
// `StickyMoreButton` — kompaktiškas vertikalus mygtukas su grid ikona.

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

/** Kompaktiškas vertikalus „peržiūrėti visą sąrašą" mygtukas (grid ikona). */
export function StickyMoreButton({
  count,
  onClick,
  height,
  ariaLabel,
}: {
  count: number
  onClick: () => void
  height: number
  ariaLabel?: string
}) {
  if (count <= 0) return null
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
      {/* 2x2 grid ikona — „peržiūrėti visą sąrašą" (view all). */}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="transition-colors group-hover:fill-[var(--accent-orange)]">
        <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" />
        <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" />
        <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" />
        <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" />
      </svg>
    </button>
  )
}
