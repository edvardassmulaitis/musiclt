// components/galerija/ReportageCard.tsx
//
// Reportažo kortelė — naudojama /galerija hub'e ir fotografo profilyje.
// Server-safe (jokio 'use client'): tik markup + Link.

import Link from 'next/link'
import type { Reportage } from '@/lib/galerija-shared'
import { formatEventDate, reportagePlaceLine } from '@/lib/galerija-shared'

const CAMERA = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
    <circle cx="12" cy="13" r="3" />
  </svg>
)

export function ReportageCard({ r, priority = false }: { r: Reportage; priority?: boolean }) {
  const place = reportagePlaceLine(r)
  const date = formatEventDate(r.eventDate)
  const meta = [place, date].filter(Boolean).join(' · ')

  return (
    <Link
      href={r.href}
      className="group block overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--card-bg)] no-underline transition-shadow hover:shadow-lg"
    >
      <div className="relative aspect-[3/2] overflow-hidden bg-[var(--bg-elevated)]">
        {r.coverUrl ? (
          <img
            src={r.coverUrl}
            alt={r.title}
            loading={priority ? 'eager' : 'lazy'}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#ec4899]/15 to-[#8b5cf6]/15 text-[var(--text-muted)]">
            {CAMERA}
          </div>
        )}
        {/* Foto skaičiaus badge */}
        {r.photoCount > 0 && (
          <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-[3px] text-[11px] font-bold text-white backdrop-blur">
            {CAMERA}
            {r.photoCount}
          </span>
        )}
      </div>
      <div className="p-3.5">
        {r.artistName && (
          <div className="mb-1 truncate font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#ec4899]">
            {r.artistName}
          </div>
        )}
        <h3 className="line-clamp-2 font-['Outfit',sans-serif] text-[15px] font-bold leading-snug text-[var(--text-primary)]">
          {r.title.replace(/^FOTO\s+(REPORTA[ŽZ]AS|GALERIJA)\s*\|\s*/i, '')}
        </h3>
        {meta && <div className="mt-1.5 text-[12px] text-[var(--text-muted)]">{meta}</div>}
        {r.photographerName && (
          <div className="mt-1 text-[12px] text-[var(--text-secondary)]">
            Fotografas: <span className="font-semibold">{r.photographerName}</span>
          </div>
        )}
      </div>
    </Link>
  )
}
