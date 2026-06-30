'use client'

// components/galerija/ReportageGallery.tsx
//
// Reportažo nuotraukų galerija — „justified" eilutės (vienodo aukščio, užpildo
// plotį, be apkarpymo, sulygiuotos eilutės — kaip Google Photos / Flickr) +
// grupių filtras (festivaliams: pagal atlikėją arba tagą) + pilno ekrano lightbox.

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReportagePhoto, PhotoGroup } from '@/lib/galerija-shared'

export default function ReportageGallery({
  photos,
  groups = [],
  photographerName,
}: {
  photos: ReportagePhoto[]
  groups?: PhotoGroup[]
  photographerName?: string | null
}) {
  const [active, setActive] = useState<string>('all')
  const [open, setOpen] = useState<number | null>(null)

  const showFilter = groups.length > 1
  const visible = useMemo(
    () => (active === 'all' || !showFilter ? photos : photos.filter((p) => p.groupKey === active)),
    [photos, active, showFilter]
  )

  const close = useCallback(() => setOpen(null), [])
  const go = useCallback(
    (dir: number) => setOpen((i) => (i === null ? i : (i + dir + visible.length) % visible.length)),
    [visible.length]
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
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open, close, go])

  if (!photos.length) return null
  const activePhoto = open !== null ? visible[open] : null

  const chip = (key: string, label: string, count: number) => (
    <button
      key={key}
      type="button"
      onClick={() => { setActive(key); setOpen(null) }}
      className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
        active === key
          ? 'bg-[var(--accent-orange)] text-white'
          : 'border border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-secondary)] hover:border-[var(--accent-orange)]/50'
      }`}
    >
      {label} <span className="opacity-70">{count}</span>
    </button>
  )

  return (
    <>
      {showFilter && (
        <div className="mb-5 flex flex-wrap gap-2">
          {chip('all', 'Visi', photos.length)}
          {groups.map((g) => chip(g.key, g.label, g.count))}
        </div>
      )}

      {/* Justified eilutės: kiekvienas elementas auga proporcingai proporcijai (ar),
          flex-basis = ar × bazinis aukštis → vienoje eilutėje vienodas aukštis. */}
      <div className="flex flex-wrap gap-2.5">
        {visible.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setOpen(i)}
            className="relative h-[200px] cursor-zoom-in overflow-hidden rounded-xl bg-[var(--bg-elevated)] sm:h-[260px] lg:h-[320px]"
            style={{ flexGrow: p.aspectRatio, flexBasis: `${Math.round(p.aspectRatio * 300)}px` }}
          >
            <img
              src={p.thumbUrl}
              alt={p.caption || p.artistName || ''}
              loading={i < 6 ? 'eager' : 'lazy'}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 hover:scale-[1.04]"
            />
            {p.groupLabel && p.groupKey !== 'all' && (
              <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur">
                {p.groupLabel}
              </span>
            )}
          </button>
        ))}
        {/* spacer — sugeria likutį paskutinėje eilutėje, kad nuotraukos neišsitemptų */}
        <span aria-hidden className="h-0 grow-[999]" style={{ flexBasis: '0px' }} />
      </div>

      {activePhoto && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/92 p-4" onClick={close} role="dialog" aria-modal="true">
          <button type="button" onClick={close} aria-label="Uždaryti" className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
          {visible.length > 1 && (
            <button type="button" onClick={(e) => { e.stopPropagation(); go(-1) }} aria-label="Ankstesnė" className="absolute left-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            </button>
          )}
          {visible.length > 1 && (
            <button type="button" onClick={(e) => { e.stopPropagation(); go(1) }} aria-label="Kita" className="absolute right-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </button>
          )}
          <figure className="flex max-h-full max-w-full flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <img src={activePhoto.url} alt={activePhoto.caption || ''} className="max-h-[86vh] max-w-full rounded-lg object-contain" />
            <figcaption className="mt-3 text-center text-[12px] text-white/70">
              {open! + 1} / {visible.length}
              {activePhoto.artistName ? ` · ${activePhoto.artistName}` : activePhoto.tag ? ` · ${activePhoto.tag}` : ''}
              {activePhoto.caption ? ` · ${activePhoto.caption}` : ''}
              {photographerName ? ` · © ${photographerName}` : ''}
            </figcaption>
          </figure>
        </div>
      )}
    </>
  )
}
