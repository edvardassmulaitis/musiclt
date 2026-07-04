'use client'
// components/SharePill.tsx
//
// Bendras „Dalintis" mygtukas — naudojamas dainos/albumo puslapiuose IR
// modaluose (TrackInfoModal, AlbumInfoModal), kad veiksmų eilutė visur
// atrodytų ir veiktų identiškai.
//
// Elgesys: navigator.share (mobile native sheet) → fallback į clipboard
// copy su trumpu „Nukopijuota!" patvirtinimu.

import { useState } from 'react'

type Props = {
  /** Pilnas share title, pvz. "Stronger — Kanye West". */
  title: string
  /** Absoliutus arba relative URL. Relative → prepend'inam window.origin. */
  url: string
  /** 'sm' — modalo header (26px aukštis), 'md' — puslapio header (30px). */
  size?: 'sm' | 'md'
}

export function SharePill({ title, url, size = 'md' }: Props) {
  const [copied, setCopied] = useState(false)

  const doShare = async () => {
    const abs = url.startsWith('http')
      ? url
      : `${typeof window !== 'undefined' ? window.location.origin : ''}${url}`
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title, url: abs })
        return
      }
    } catch {
      // user atšaukė share sheet — nieko nedarom
      return
    }
    try {
      await navigator.clipboard.writeText(abs)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {}
  }

  return (
    <button
      type="button"
      onClick={doShare}
      title="Dalintis nuoroda"
      aria-label="Dalintis"
      className={[
        "inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] font-['Outfit',sans-serif] font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]",
        size === 'sm' ? 'h-[26px] px-2.5 text-[13px]' : 'h-[30px] px-3 text-[14px]',
        copied ? '!border-[rgba(34,197,94,0.4)] !text-[#4ade80]' : '',
      ].join(' ')}
    >
      {copied ? (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 6L9 17l-5-5" />
        </svg>
      ) : (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
        </svg>
      )}
      {copied ? 'Nukopijuota!' : 'Dalintis'}
    </button>
  )
}
