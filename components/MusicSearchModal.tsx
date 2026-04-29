'use client'
// components/MusicSearchModal.tsx
//
// Wraps the inline MusicSearchPicker in a centered overlay modal so the
// picker doesn't push surrounding layout (composer, comments) when it
// expands. Used by EntityCommentsBlock + DiscussionThreadModal — both want
// the SAME picker but never with inline layout shifts.
//
// Behaviour:
//   - Click backdrop or press Esc to close
//   - Picker stays mounted while modal is open so the user can stack multiple
//     attachments without re-opening
//   - "Done" button at the bottom returns control to the parent

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import MusicSearchPicker, { AttachmentChips, type AttachmentHit } from './MusicSearchPicker'

type Props = {
  open: boolean
  onClose: () => void
  attached: AttachmentHit[]
  onAdd: (hit: AttachmentHit) => void
  onRemove: (index: number) => void
}

export default function MusicSearchModal({ open, onClose, attached, onAdd, onRemove }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null
  if (typeof window === 'undefined') return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-[10005] flex items-start justify-center bg-black/60 px-4 pt-[10vh] backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-[560px] flex-col gap-3 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.55)]"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-['Outfit',sans-serif] text-[14px] font-extrabold tracking-[-0.01em] text-[var(--text-primary)]">
            Pridėti muzikos
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Uždaryti"
            className="flex h-7 w-7 items-center justify-center rounded text-[var(--text-faint)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <svg viewBox="0 0 16 16" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        <MusicSearchPicker
          attached={attached}
          onAdd={onAdd}
          placeholder="Surask atlikėją, albumą ar dainą..."
        />

        {attached.length > 0 && (
          <div className="border-t border-[var(--border-subtle)] pt-3">
            <div className="mb-2 font-['Outfit',sans-serif] text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-[var(--text-faint)]">
              Pridėta ({attached.length})
            </div>
            <AttachmentChips items={attached} onRemove={onRemove} />
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-[var(--border-subtle)] pt-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-[var(--accent-orange)] px-4 py-2 font-['Outfit',sans-serif] text-[12px] font-extrabold text-white transition-opacity hover:opacity-90"
          >
            Gerai
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
