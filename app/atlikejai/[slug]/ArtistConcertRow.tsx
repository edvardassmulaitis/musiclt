'use client'

// Atlikėjo puslapio „Koncertų įrašai" sekcija — horizontali kortelių eilė su
// embed modalu. Rodoma po Galerija. Duomenys ateina propu (server fetch
// getArtistRecordings page.tsx'e).

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  type ConcertRecording,
  recordingTypeLabel, formatDuration, recordingPlaceLine, ytEmbedUrl, recordingHref,
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
        <Link href="/koncertu-irasai" className="shrink-0 text-[12.5px] font-semibold text-[var(--accent-link)]">
          Visi įrašai →
        </Link>
      </div>

      {/* Horizontali scroll eilė */}
      <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
        {recordings.map((r) => {
          const place = recordingPlaceLine(r)
          return (
            <div key={r.id} className="group w-[230px] shrink-0 snap-start sm:w-[260px]">
              <button onClick={() => setActive(r)} className="relative block w-full overflow-hidden rounded-xl bg-[var(--bg-elevated)] text-left">
                <div className="aspect-video w-full">
                  {r.thumbnail_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.thumbnail_url} alt={r.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" referrerPolicy="no-referrer" loading="lazy" />
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/25">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 opacity-90 backdrop-blur-sm transition-transform group-hover:scale-110">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
                    </span>
                  </span>
                  {r.duration_seconds != null && (
                    <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 font-['Outfit',sans-serif] text-[11px] font-bold tabular-nums text-white">
                      {formatDuration(r.duration_seconds)}
                    </span>
                  )}
                  <span className="absolute left-2 top-2 rounded-full bg-[var(--accent-orange)] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">
                    {recordingTypeLabel(r.recording_type)}
                  </span>
                </div>
              </button>
              <button onClick={() => setActive(r)} className="mt-2 block w-full text-left">
                <h3 className="line-clamp-2 font-['Outfit',sans-serif] text-[13.5px] font-bold leading-snug text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">
                  {r.title}
                </h3>
              </button>
              {place && <p className="mt-0.5 text-[12px] text-[var(--text-faint)]">{place}</p>}
            </div>
          )
        })}
      </div>

      {active && <ConcertModal rec={active} artistName={artistName} onClose={() => setActive(null)} />}
    </section>
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
  return (
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
              <span className="rounded-full bg-[var(--accent-orange)] px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wide text-white">
                {recordingTypeLabel(rec.recording_type)}
              </span>
              {rec.duration_seconds != null && (
                <span className="text-[12px] font-bold tabular-nums text-[var(--text-muted)]">{formatDuration(rec.duration_seconds)}</span>
              )}
            </div>
            <h2 className="font-['Outfit',sans-serif] text-[17px] font-extrabold leading-tight text-[var(--text-primary)]">{rec.title}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-[var(--text-muted)]">
              <span className="font-semibold">{artistName}</span>
              {place && <span>· {place}</span>}
            </div>
            <Link href={recordingHref(rec)} className="mt-2 inline-block text-[12.5px] font-semibold text-[var(--accent-link)]">
              Atskiras puslapis →
            </Link>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-full bg-[var(--bg-elevated)] p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]" aria-label="Uždaryti">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
    </div>
  )
}
