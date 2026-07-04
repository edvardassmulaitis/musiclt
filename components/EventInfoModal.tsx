'use client'
// components/EventInfoModal.tsx
//
// Lightweight event modal — atitinka song/album modal pattern'ą:
//   • Portal'd to document.body (escape route-enter transform)
//   • Fixed h-[90vh] mobile / sm:h-[85vh] desktop
//   • Bottom sheet mobile / centered card sm: / left-aligned lg:
//   • Body scroll lock via position:fixed pattern
//   • Tabs: Aprašymas / Komentarai (jei yra comments endpoint)
//
// Data fetch'inam iš /api/events/{id} kai eventId pasikeičia. Modal
// rodo skeleton'ą su preview duomenimis (title, cover) kol fetch'inasi.

import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'

type EventDetails = {
  id: number
  slug: string
  title: string
  description: string | null
  cover_image_url: string | null
  starts_at: string | null
  ends_at: string | null
  venue: string | null
  city: string | null
  source_url: string | null
  artists?: Array<{ id: number; slug: string; name: string }>
}

export type EventPreview = {
  id: number | string
  slug?: string
  title: string
  cover_image_url?: string | null
  starts_at?: string | null
  venue?: string | null
}

export default function EventInfoModal({
  event, onClose,
}: {
  event: EventPreview | null
  onClose: () => void
}) {
  const [details, setDetails] = useState<EventDetails | null>(null)
  const [loading, setLoading] = useState(false)
  const bodyScrollRef = useRef<HTMLDivElement>(null)

  // Fetch details when event changes
  useEffect(() => {
    if (!event) { setDetails(null); return }
    let cancelled = false
    setLoading(true)
    fetch(`/api/events/${event.id}`)
      .then(r => r.ok ? r.json() : null)
      .then((d) => {
        if (cancelled) return
        if (d) setDetails(d)
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [event?.id])

  // ESC + body scroll lock (position:fixed pattern)
  useEffect(() => {
    if (!event) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const scrollY = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.left = '0'
    document.body.style.right = '0'
    document.body.style.width = '100%'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.left = ''
      document.body.style.right = ''
      document.body.style.width = ''
      window.scrollTo(0, scrollY)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id])

  if (!event) return null
  if (typeof document === 'undefined') return null

  const titleNow = details?.title || event.title || 'Renginys'
  const coverNow = details?.cover_image_url || event.cover_image_url || null
  const venue = details?.venue || event.venue || null
  const city = details?.city || null
  const starts = details?.starts_at || event.starts_at || null
  const startDate = starts ? new Date(starts) : null
  const ltMonths = ['sausio','vasario','kovo','balandžio','gegužės','birželio','liepos','rugpjūčio','rugsėjo','spalio','lapkričio','gruodžio']
  const dateLabel = startDate && !isNaN(startDate.getTime())
    ? `${startDate.getFullYear()} m. ${ltMonths[startDate.getMonth()]} ${startDate.getDate()} d.`
    : null
  const timeLabel = startDate && !isNaN(startDate.getTime())
    ? `${String(startDate.getHours()).padStart(2,'0')}:${String(startDate.getMinutes()).padStart(2,'0')}`
    : null

  return createPortal(
    <div
      className={[
        'fixed inset-0 z-[9999] flex items-end justify-center backdrop-blur-sm sm:items-center',
        'bg-black/60 sm:bg-black/30',
        'lg:justify-start lg:pl-[10%]',
      ].join(' ')}
      role="dialog"
      aria-modal="true"
      aria-label={`${titleNow} — informacija`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ fontFamily: "'DM Sans',system-ui,sans-serif" }}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className={[
          'flex w-full flex-col overflow-hidden bg-[var(--bg-surface)] shadow-[0_24px_60px_-10px_rgba(0,0,0,0.5)]',
          'h-[90vh] rounded-t-2xl',
          'sm:h-[85vh] sm:rounded-2xl sm:mx-4 sm:max-w-[720px]',
        ].join(' ')}
      >
        {/* Mobile handle */}
        <div className="flex shrink-0 justify-center pt-2 pb-1 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-[var(--border-default)]" />
        </div>

        {/* Header */}
        <div className="flex shrink-0 items-center gap-2.5 border-b border-[var(--border-subtle)] px-4 py-2">
          <div className="min-w-0 flex-1">
            <div className="font-['Outfit',sans-serif] text-[12px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              Renginys
            </div>
            <div className="truncate font-['Outfit',sans-serif] text-[16px] font-extrabold leading-tight text-[var(--text-primary)] sm:text-[16px]">
              {titleNow}
            </div>
          </div>
          {(details?.slug || event.slug) && (
            <Link
              href={`/renginiai/${details?.slug || event.slug}`}
              target="_blank"
              rel="noopener"
              title="Atidaryti pilną renginio puslapį"
              aria-label="Atidaryti renginio puslapį"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
            >
              <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 3h7v7M21 3l-9 9M5 5h6M5 5v14h14v-6" />
              </svg>
            </Link>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Uždaryti"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          >
            <svg viewBox="0 0 16 16" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        {/* Cover + meta */}
        {coverNow && (
          <div className="aspect-[16/9] max-h-[260px] w-full shrink-0 overflow-hidden bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={proxyImg(coverNow)} alt={titleNow} referrerPolicy="no-referrer" className="h-full w-full object-cover" />
          </div>
        )}

        {/* Body */}
        <div ref={bodyScrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          {/* Meta strip */}
          <div className="mb-4 flex flex-wrap items-center gap-2 text-[14px]">
            {dateLabel && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-1 font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--text-primary)]">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                {dateLabel}
                {timeLabel && <span className="ml-1 text-[var(--text-muted)]">· {timeLabel}</span>}
              </span>
            )}
            {venue && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-1 font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--text-primary)]">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                {venue}
                {city && <span className="ml-1 text-[var(--text-muted)]">· {city}</span>}
              </span>
            )}
          </div>

          {/* Description */}
          {loading && !details ? (
            <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-10 text-center text-[14px] text-[var(--text-faint)]">
              Kraunama…
            </div>
          ) : details?.description ? (
            <div
              className="text-[14px] leading-[1.7] text-[var(--text-secondary)] [&_a]:text-[var(--accent-orange)] [&_a]:no-underline hover:[&_a]:underline"
              dangerouslySetInnerHTML={{ __html: details.description }}
            />
          ) : (
            <div className="text-[14px] text-[var(--text-faint)]">Aprašymo nėra.</div>
          )}

          {/* Artists */}
          {details?.artists && details.artists.length > 0 && (
            <div className="mt-5 border-t border-[var(--border-subtle)] pt-4">
              <div className="mb-2 font-['Outfit',sans-serif] text-[16px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Dalyvauja
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {details.artists.map(a => (
                  <Link
                    key={a.id}
                    href={`/atlikejai/${a.slug}`}
                    className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-1 font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--text-secondary)] no-underline transition-colors hover:border-[var(--accent-orange)] hover:text-[var(--accent-orange)]"
                  >
                    {a.name}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* External source */}
          {details?.source_url && (
            <div className="mt-5 border-t border-[var(--border-subtle)] pt-4">
              <a
                href={details.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--accent-orange)] no-underline hover:underline"
              >
                Originalus šaltinis
                <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 3h7v7M21 3l-9 9M5 5h6M5 5v14h14v-6" />
                </svg>
              </a>
            </div>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  )
}
