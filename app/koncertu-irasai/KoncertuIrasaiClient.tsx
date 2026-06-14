'use client'

import { useMemo, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import {
  type ConcertRecording, type RecordingType, type RecordingStyle,
  recordingTypeLabel, RECORDING_TYPE_ORDER, formatDuration, recordingPlaceLine,
  ytEmbedUrl, recordingHref,
} from '@/lib/concert-recordings-shared'
import { styleLabel } from '@/lib/radaras-shared'

type Props = {
  recordings: ConcertRecording[]
  styles: RecordingStyle[]
}

export default function KoncertuIrasaiClient({ recordings, styles }: Props) {
  const [type, setType] = useState<RecordingType | 'all'>('all')
  const [style, setStyle] = useState<string | 'all'>('all')
  const [active, setActive] = useState<ConcertRecording | null>(null)

  // Tipų skaičiai (chip'ams)
  const typeCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of recordings) m[r.recording_type] = (m[r.recording_type] || 0) + 1
    return m
  }, [recordings])

  const filtered = useMemo(() => {
    return recordings.filter((r) => {
      if (type !== 'all' && r.recording_type !== type) return false
      if (style !== 'all' && !r.styles.includes(style)) return false
      return true
    })
  }, [recordings, type, style])

  return (
    <div>
      {/* ── Filtrai ── */}
      <div className="mb-5 space-y-2.5">
        <div className="flex flex-wrap gap-2">
          <Chip active={type === 'all'} onClick={() => setType('all')}>Visi ({recordings.length})</Chip>
          {RECORDING_TYPE_ORDER.filter((t) => typeCounts[t]).map((t) => (
            <Chip key={t} active={type === t} onClick={() => setType(t)}>
              {recordingTypeLabel(t)} ({typeCounts[t]})
            </Chip>
          ))}
        </div>
        {styles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Chip small active={style === 'all'} onClick={() => setStyle('all')}>Visi stiliai</Chip>
            {styles.slice(0, 18).map((s) => (
              <Chip key={s.name} small active={style === s.name} onClick={() => setStyle(s.name)}>
                {styleLabel(s.name)}
              </Chip>
            ))}
          </div>
        )}
      </div>

      {/* ── Grid ── */}
      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-[var(--text-muted)]">
          Pagal pasirinktus filtrus įrašų nėra.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r) => (
            <RecordingCard key={r.id} rec={r} onPlay={() => setActive(r)} />
          ))}
        </div>
      )}

      {/* ── Modalas su player'iu ── */}
      {active && <PlayerModal rec={active} onClose={() => setActive(null)} />}
    </div>
  )
}

function Chip({ children, active, onClick, small }: {
  children: React.ReactNode; active: boolean; onClick: () => void; small?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'rounded-full border font-bold transition-colors',
        small ? 'px-3 py-1 text-[12px]' : 'px-3.5 py-1.5 text-[13px]',
        active
          ? 'border-[var(--accent-orange)] bg-[var(--accent-orange)] text-white'
          : 'border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function RecordingCard({ rec, onPlay }: { rec: ConcertRecording; onPlay: () => void }) {
  const place = recordingPlaceLine(rec)
  return (
    <div className="group">
      <button onClick={onPlay} className="relative block w-full overflow-hidden rounded-xl bg-[var(--bg-elevated)] text-left">
        <div className="aspect-video w-full">
          {rec.thumbnail_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={rec.thumbnail_url} alt={rec.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" referrerPolicy="no-referrer" loading="lazy" />
          )}
          {/* Play overlay */}
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/25">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55 opacity-90 backdrop-blur-sm transition-transform group-hover:scale-110">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
            </span>
          </span>
          {/* Trukmė */}
          {rec.duration_seconds != null && (
            <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 font-['Outfit',sans-serif] text-[11px] font-bold tabular-nums text-white">
              {formatDuration(rec.duration_seconds)}
            </span>
          )}
          {/* Tipas */}
          <span className="absolute left-2 top-2 rounded-full bg-[var(--accent-orange)] px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wide text-white">
            {recordingTypeLabel(rec.recording_type)}
          </span>
        </div>
      </button>
      <div className="mt-2">
        <button onClick={onPlay} className="block text-left">
          <h3 className="line-clamp-2 font-['Outfit',sans-serif] text-[14.5px] font-bold leading-snug text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">
            {rec.title}
          </h3>
        </button>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-[var(--text-muted)]">
          {rec.artist_slug ? (
            <Link href={`/atlikejai/${rec.artist_slug}`} className="font-semibold text-[var(--text-secondary)] hover:text-[var(--accent-orange)]">
              {rec.artist_name}
            </Link>
          ) : rec.artist_name ? <span className="font-semibold">{rec.artist_name}</span> : null}
        </div>
        {place && <p className="mt-0.5 text-[12px] text-[var(--text-faint)]">{place}</p>}
      </div>
    </div>
  )
}

function PlayerModal({ rec, onClose }: { rec: ConcertRecording; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])

  const place = recordingPlaceLine(rec)
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
              <span className="rounded-full bg-[var(--accent-orange)] px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wide text-white">
                {recordingTypeLabel(rec.recording_type)}
              </span>
              {rec.duration_seconds != null && (
                <span className="text-[12px] font-bold tabular-nums text-[var(--text-muted)]">{formatDuration(rec.duration_seconds)}</span>
              )}
            </div>
            <h2 className="font-['Outfit',sans-serif] text-[17px] font-extrabold leading-tight text-[var(--text-primary)]">{rec.title}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-[var(--text-muted)]">
              {rec.artist_slug ? (
                <Link href={`/atlikejai/${rec.artist_slug}`} className="font-semibold text-[var(--accent-link)]">{rec.artist_name}</Link>
              ) : rec.artist_name ? <span className="font-semibold">{rec.artist_name}</span> : null}
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
    </div>,
    document.body,
  )
}
