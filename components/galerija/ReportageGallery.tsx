'use client'

// components/galerija/ReportageGallery.tsx
//
// Reportažo nuotraukų tinklelis + lightbox. Naudojamas /galerija/[slug].
// Masonry per CSS columns; paspaudus — pilno ekrano peržiūra su klaviatūros
// navigacija (←/→/Esc).

import { useCallback, useEffect, useState } from 'react'
import type { ReportagePhoto } from '@/lib/galerija-shared'

export default function ReportageGallery({
  photos,
  photographerName,
}: {
  photos: ReportagePhoto[]
  photographerName?: string | null
}) {
  const [open, setOpen] = useState<number | null>(null)

  const close = useCallback(() => setOpen(null), [])
  const go = useCallback(
    (dir: number) => setOpen((i) => (i === null ? i : (i + dir + photos.length) % photos.length)),
    [photos.length]
  )

  useEffect(() => {
    if (open === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, close, go])

  if (!photos.length) return null
  const active = open !== null ? photos[open] : null

  return (
    <>
      <div className="[column-gap:10px] columns-2 sm:columns-3 lg:columns-4">
        {photos.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setOpen(i)}
            className="mb-2.5 block w-full cursor-zoom-in overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)]"
            style={{ breakInside: 'avoid' }}
          >
            <img
              src={p.thumbUrl}
              alt={p.caption || ''}
              loading="lazy"
              className="block w-full object-cover transition-transform duration-500 hover:scale-[1.03]"
            />
          </button>
        ))}
      </div>

      {active && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/92 p-4"
          onClick={close}
          role="dialog"
          aria-modal="true"
        >
          {/* Close */}
          <button
            type="button"
            onClick={close}
            aria-label="Uždaryti"
            className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
          {/* Prev */}
          {photos.length > 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); go(-1) }}
              aria-label="Ankstesnė"
              className="absolute left-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            </button>
          )}
          {/* Next */}
          {photos.length > 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); go(1) }}
              aria-label="Kita"
              className="absolute right-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </button>
          )}

          <figure className="flex max-h-full max-w-full flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <img
              src={active.url}
              alt={active.caption || ''}
              className="max-h-[82vh] max-w-full rounded-lg object-contain"
            />
            <figcaption className="mt-3 text-center text-[12px] text-white/70">
              {open! + 1} / {photos.length}
              {active.caption ? ` · ${active.caption}` : ''}
              {photographerName ? ` · © ${photographerName}` : ''}
            </figcaption>
          </figure>
        </div>
      )}
    </>
  )
}
