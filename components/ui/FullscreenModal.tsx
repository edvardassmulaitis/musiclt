'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'

/**
 * Universal modal component.
 * - Mobile: fullscreen white panel with X button
 * - Desktop: centered card with backdrop
 * - Always rendered via portal to document.body (escapes overflow:hidden)
 * - Locks body scroll while open
 */
export default function FullscreenModal({
  onClose,
  title,
  titleRight,
  children,
  maxWidth = 'max-w-lg',
  noPadding = false,
}: {
  onClose: () => void
  title?: React.ReactNode
  titleRight?: React.ReactNode
  children: React.ReactNode
  maxWidth?: string
  noPadding?: boolean
}) {
  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const modal = (
    <div className="fixed inset-0 z-[9999]" data-theme="light">
      {/* Backdrop — hidden on mobile (fullscreen), visible on desktop */}
      <div className="hidden sm:block absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal panel: fullscreen mobile, centered card desktop */}
      <div className={`absolute inset-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[calc(100%-2rem)] ${maxWidth} sm:max-h-[85vh] sm:rounded-2xl sm:shadow-2xl sm:border sm:border-[var(--border-subtle)] bg-white flex flex-col overflow-hidden`}>
        {/* Header with close button */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)] shrink-0 bg-white">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {typeof title === 'string'
              ? <span className="text-sm font-bold text-[var(--text-secondary)] truncate">{title}</span>
              : title
            }
            {titleRight}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors shrink-0 ml-2"
            aria-label="Uždaryti"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className={`flex-1 overflow-y-auto ${noPadding ? '' : 'p-4'}`}>
          {children}
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(modal, document.body)
}
