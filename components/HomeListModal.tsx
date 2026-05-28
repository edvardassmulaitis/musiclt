'use client'

// components/HomeListModal.tsx
//
// Universalus „pilno sąrašo" modalas homepage'o sekcijoms. Atidaromas paspaudus
// elegantišką „+ X" elementą horizontalios juostos pabaigoje. Modal'as parodo
// VISĄ sekcijos sąrašą su patogiu vertical scroll'u — vietoj „Daugiau →"
// nuorodos virš sekcijos (kuri nukreipdavo į kitą puslapį).
//
// Generic — naudoja vaikų funkciją (render prop), kad konkreti sekcija pati
// nuspręstų kaip rodyti kiekvieną item'ą. Šitas modal'as tik suteikia kontenerį
// (header, scrollable body, close button).

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
        {/* Header */}
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

        {/* Scrollable body */}
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

/** „+ X" elegantiškas card'as juostos pabaigoje — atidaro pilną sąrašą.
 *  Tas pats matmenys kaip albumo cover'ių (square ~156x156 default), bet
 *  galima pakeisti per `size` arba `className`. */
export function HomeListMoreCard({
  count,
  onClick,
  variant = 'square',
}: {
  count: number
  onClick: () => void
  /** square — 156x156 + label apačioje; row — kompaktiškas 220px wide row. */
  variant?: 'square' | 'row' | 'compact'
}) {
  if (variant === 'row') {
    return (
      <button
        type="button"
        onClick={onClick}
        className="hp-card flex shrink-0 items-center gap-3 px-3.5 py-3 text-left transition-all hover:-translate-y-px hover:border-[rgba(249,115,22,0.5)]"
        style={{ width: 220 }}
      >
        <div
          className="flex items-center justify-center rounded-[9px] flex-shrink-0"
          style={{
            width: 48, height: 48,
            background: 'linear-gradient(135deg, rgba(249,115,22,0.18), rgba(249,115,22,0.05))',
            border: '1px solid rgba(249,115,22,0.3)',
            fontFamily: 'Outfit,sans-serif', fontWeight: 900, fontSize: 14,
            color: 'var(--accent-orange)',
          }}
        >
          +{count}
        </div>
        <div className="min-w-0 flex-1">
          <p className="m-0 font-['Outfit',sans-serif] text-[13.5px] font-extrabold text-[var(--text-primary)]">Žiūrėti visus</p>
          <p className="m-0 mt-1 text-[12px] text-[var(--text-muted)]">+{count} dar</p>
        </div>
      </button>
    )
  }
  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={onClick}
        className="hp-card flex shrink-0 flex-col items-center justify-center gap-2 px-4 text-center transition-all hover:-translate-y-px hover:border-[rgba(249,115,22,0.5)]"
        style={{ width: 188, height: 290 }}
      >
        <div
          className="flex items-center justify-center rounded-full"
          style={{
            width: 64, height: 64,
            background: 'linear-gradient(135deg, rgba(249,115,22,0.18), rgba(249,115,22,0.05))',
            border: '1px solid rgba(249,115,22,0.3)',
            fontFamily: 'Outfit,sans-serif', fontWeight: 900, fontSize: 20,
            color: 'var(--accent-orange)',
          }}
        >
          +{count}
        </div>
        <p className="m-0 font-['Outfit',sans-serif] text-[13.5px] font-extrabold text-[var(--text-primary)]">Žiūrėti visus</p>
        <p className="m-0 text-[11px] text-[var(--text-muted)]">+{count} dar</p>
      </button>
    )
  }
  // Default — square (atitinka „Nauji albumai" cover'io stilistiką).
  return (
    <button
      type="button"
      onClick={onClick}
      className="group block shrink-0 no-underline text-left p-0 bg-transparent border-0 cursor-pointer"
      style={{ width: 156 }}
    >
      <div
        className="relative aspect-square overflow-hidden rounded-xl flex items-center justify-center transition-all duration-300 group-hover:-translate-y-0.5 group-hover:scale-[1.02]"
        style={{
          background: 'linear-gradient(135deg, rgba(249,115,22,0.18), rgba(249,115,22,0.04) 60%, rgba(249,115,22,0.08))',
          border: '1px dashed rgba(249,115,22,0.35)',
        }}
      >
        <div className="text-center">
          <div
            style={{
              fontFamily: 'Outfit,sans-serif', fontWeight: 900, fontSize: 32,
              color: 'var(--accent-orange)', lineHeight: 1,
            }}
          >
            +{count}
          </div>
          <p className="m-0 mt-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em]" style={{ color: 'var(--accent-orange)', fontFamily: 'Outfit,sans-serif' }}>Žiūrėti visus</p>
        </div>
      </div>
      <div className="mt-2 px-0.5">
        <p className="m-0 truncate font-['Outfit',sans-serif] text-[13.5px] font-extrabold text-[var(--text-primary)]">Daugiau</p>
        <p className="m-0 mt-1 truncate text-[12px] text-[var(--text-muted)]">{count} įrašai</p>
      </div>
    </button>
  )
}
