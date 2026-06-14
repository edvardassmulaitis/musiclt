'use client'

// Atlikėjo puslapio „Koncertų įrašai" sekcija — horizontali kortelių eilė su
// embed modalu. Rodoma po Galerija. Vienam įrašui — inline player (per visą
// plotį mobile). Duomenys ateina propu (server fetch getArtistRecordings).

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import {
  type ConcertRecording,
  recordingTypeLabel, formatDuration, recordingPlaceLine, formatViews, ytEmbedUrl, recordingHref,
} from '@/lib/concert-recordings-shared'

export default function ArtistConcertRow({ recordings, artistName }: {
  recordings: ConcertRecording[]
  artistName: string
}) {
  const [active, setActive] = useState<ConcertRecording | null>(null)
  if (!recordings || recordings.length === 0) return null

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-['Outfit',sans-serif] text-[22px] font-black leading-none tracking-[-0.01em] text-[var(--text-primary)] sm:text-[26px] lg:text-[28px]">
          Koncertų įrašai
          <span className="ml-2 text-[14px] font-bold text-[var(--text-faint)]">{recordings.length}</span>
        </h2>
        <Link href="/koncertu-irasai" className="shrink-0 text-[12.5px] font-semibold text-[var(--accent-link)]">Visi įrašai →</Link>
      </div>

      {recordings.length === 1 ? (
        /* Vienas įrašas → inline player (per visą plotį mobile) */
        <FeaturedPlayer rec={recordings[0]} artistName={artistName} />
      ) : (
        <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
          {recordings.map((r) => {
            const place = recordingPlaceLine(r)
            const views = formatViews(r.view_count)
            return (
              <div key={r.id} className="group w-[230px] shrink-0 snap-start sm:w-[260px]">
                <div className="relative w-full overflow-hidden rounded-xl bg-[var(--bg-elevated)]">
                  <button onClick={() => setActive(r)} className="block w-full" aria-label={`Žiūrėti: ${r.title}`}>
                    <div className="aspect-video w-full">
                      {r.thumbnail_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.thumbnail_url} alt={r.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" referrerPolicy="no-referrer" loading="lazy" />
                      )}
                      <span className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/15" />
                    </div>
                  </button>
                  <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-[var(--accent-orange)] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">{recordingTypeLabel(r.recording_type)}</span>
                  {r.duration_seconds != null && (
                    <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/80 px-1.5 py-0.5 font-['Outfit',sans-serif] text-[11px] font-bold tabular-nums text-white">{formatDuration(r.duration_seconds)}</span>
                  )}
                  <button onClick={() => setActive(r)} aria-label="Groti" className="absolute bottom-2 right-2 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-orange)] text-white shadow-[0_6px_18px_rgba(249,115,22,0.5)] ring-2 ring-white/15 transition-transform hover:scale-110">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                  </button>
                </div>
                <button onClick={() => setActive(r)} className="mt-2 block w-full text-left">
                  <h3 className="line-clamp-2 font-['Outfit',sans-serif] text-[13.5px] font-bold leading-snug text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{r.title}</h3>
                </button>
                <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-[var(--text-faint)]">
                  {place && <span className="truncate">{place}</span>}
                  {place && views && <span>·</span>}
                  {views && <span className="shrink-0">{views} perž.</span>}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {active && <ConcertModal rec={active} artistName={artistName} onClose={() => setActive(null)} />}
    </section>
  )
}

function FeaturedPlayer({ rec, artistName }: { rec: ConcertRecording; artistName: string }) {
  const place = recordingPlaceLine(rec)
  const views = formatViews(rec.view_count)
  return (
    <div>
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
        <iframe
          src={ytEmbedUrl(rec.youtube_id, false)}
          className="absolute inset-0 h-full w-full"
          title={rec.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-[var(--accent-orange)] px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-white">{recordingTypeLabel(rec.recording_type)}</span>
        {rec.duration_seconds != null && <span className="text-[13px] font-bold tabular-nums text-[var(--text-muted)]">{formatDuration(rec.duration_seconds)}</span>}
        {views && <span className="text-[13px] text-[var(--text-faint)]">{views} peržiūrų</span>}
      </div>
      <h3 className="mt-1.5 font-['Outfit',sans-serif] text-[17px] font-extrabold leading-tight text-[var(--text-primary)]">{rec.title}</h3>
      {place && <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{place}</p>}
    </div>
  )
}

function ConcertModal({ rec, artistName, onClose }: { rec: ConcertRecording; artistName: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])

  const place = recordingPlaceLine(rec)
  const views = formatViews(rec.view_count)
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3 sm:p-6" onClick={onClose}>
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl bg-[var(--bg-surface)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="relative aspect-video w-full bg-black">
          <iframe
            src={ytEmbedUrl(rec.youtube_id, true)}
            className="absolute inset-0 h-full w-full"
            title={rec.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
        <div className="flex items-start justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded-full bg-[var(--accent-orange)] px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wide text-white">{recordingTypeLabel(rec.recording_type)}</span>
              {rec.duration_seconds != null && <span className="text-[12px] font-bold tabular-nums text-[var(--text-muted)]">{formatDuration(rec.duration_seconds)}</span>}
              {views && <span className="text-[12px] text-[var(--text-faint)]">{views} perž.</span>}
            </div>
            <h2 className="font-['Outfit',sans-serif] text-[17px] font-extrabold leading-tight text-[var(--text-primary)]">{rec.title}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-[var(--text-muted)]">
              <span className="font-semibold">{artistName}</span>
              {place && <span>· {place}</span>}
            </div>
            <Link href={recordingHref(rec)} className="mt-2 inline-block text-[12.5px] font-semibold text-[var(--accent-link)]">Atskiras puslapis →</Link>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-full bg-[var(--bg-elevated)] p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]" aria-label="Uždaryti">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
