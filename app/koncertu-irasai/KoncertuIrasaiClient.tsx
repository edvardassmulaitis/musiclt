'use client'

import { useMemo, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import {
  type ConcertRecording, type RecordingType, type RecordingStyle,
  recordingTypeLabel, RECORDING_TYPE_ORDER, formatDuration, recordingPlaceLine,
  formatViews, ytEmbedUrl, recordingHref,
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

  const typeCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of recordings) m[r.recording_type] = (m[r.recording_type] || 0) + 1
    return m
  }, [recordings])

  const filtered = useMemo(() => recordings.filter((r) => {
    if (type !== 'all' && r.recording_type !== type) return false
    if (style !== 'all' && !r.styles.includes(style)) return false
    return true
  }), [recordings, type, style])

  // Vienas įrašas visame archyve → rodom inline player (per visą plotį mobile)
  if (recordings.length === 1) {
    return <FeaturedPlayer rec={recordings[0]} />
  }

  return (
    <div>
      {/* ── Filtrų juosta (viena eilutė, /koncertai stilius) ── */}
      <div className="kf-bar">
        <button className={`kf-chip${type === 'all' ? ' on' : ''}`} onClick={() => setType('all')}>
          Visi <span className="kf-n">{recordings.length}</span>
        </button>
        {RECORDING_TYPE_ORDER.filter((t) => typeCounts[t]).map((t) => (
          <button key={t} className={`kf-chip${type === t ? ' on' : ''}`} onClick={() => setType(t)}>
            {recordingTypeLabel(t)} <span className="kf-n">{typeCounts[t]}</span>
          </button>
        ))}
        {styles.length > 0 && <span className="kf-divider" />}
        {styles.length > 0 && (
          <button className={`kf-chip${style === 'all' ? ' on' : ''}`} onClick={() => setStyle('all')}>Visi stiliai</button>
        )}
        {styles.slice(0, 14).map((s) => (
          <button key={s.name} className={`kf-chip${style === s.name ? ' on' : ''}`} onClick={() => setStyle(s.name)}>
            {styleLabel(s.name)}
          </button>
        ))}
        <span className="kf-count">{filtered.length} {filtered.length === 1 ? 'įrašas' : 'įrašai'}</span>
      </div>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-[var(--text-muted)]">Pagal pasirinktus filtrus įrašų nėra.</p>
      ) : (
        <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r) => <RecordingCard key={r.id} rec={r} onPlay={() => setActive(r)} />)}
        </div>
      )}

      {active && <PlayerModal rec={active} onClose={() => setActive(null)} />}
      <FilterStyles />
    </div>
  )
}

/* ── Featured inline player (vienam įrašui) ── */
function FeaturedPlayer({ rec }: { rec: ConcertRecording }) {
  const place = recordingPlaceLine(rec)
  const views = formatViews(rec.view_count)
  return (
    <div className="mx-auto max-w-3xl">
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
      <h2 className="mt-1.5 font-['Outfit',sans-serif] text-[19px] font-black leading-tight tracking-[-0.01em] text-[var(--text-primary)]">{rec.title}</h2>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[13.5px] text-[var(--text-muted)]">
        {rec.artist_slug ? (
          <Link href={`/atlikejai/${rec.artist_slug}`} className="font-bold text-[var(--accent-link)]">{rec.artist_name}</Link>
        ) : rec.artist_name ? <span className="font-bold">{rec.artist_name}</span> : null}
        {place && <span>· {place}</span>}
      </div>
    </div>
  )
}

function RecordingCard({ rec, onPlay }: { rec: ConcertRecording; onPlay: () => void }) {
  const place = recordingPlaceLine(rec)
  const views = formatViews(rec.view_count)
  return (
    <div className="group">
      <div className="relative w-full overflow-hidden rounded-xl bg-[var(--bg-elevated)]">
        <button onClick={onPlay} className="block w-full" aria-label={`Žiūrėti: ${rec.title}`}>
          <div className="aspect-video w-full">
            {rec.thumbnail_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={rec.thumbnail_url} alt={rec.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" referrerPolicy="no-referrer" loading="lazy" />
            )}
            <span className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/15" />
          </div>
        </button>
        {/* Tipas — viršuj kairėj */}
        <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-[var(--accent-orange)] px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wide text-white">
          {recordingTypeLabel(rec.recording_type)}
        </span>
        {/* Trukmė — apačioj kairėj */}
        {rec.duration_seconds != null && (
          <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/80 px-1.5 py-0.5 font-['Outfit',sans-serif] text-[11px] font-bold tabular-nums text-white">
            {formatDuration(rec.duration_seconds)}
          </span>
        )}
        {/* Play — apačioj dešinėj (neuždengia atlikėjo viduryje) */}
        <button
          onClick={onPlay}
          aria-label="Groti"
          className="absolute bottom-2 right-2 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent-orange)] text-white shadow-[0_6px_18px_rgba(249,115,22,0.5)] ring-2 ring-white/15 transition-transform hover:scale-110"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        </button>
      </div>
      <div className="mt-2">
        <button onClick={onPlay} className="block text-left">
          <h3 className="line-clamp-2 font-['Outfit',sans-serif] text-[14.5px] font-bold leading-snug text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{rec.title}</h3>
        </button>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-[var(--text-muted)]">
          {rec.artist_slug ? (
            <Link href={`/atlikejai/${rec.artist_slug}`} className="font-semibold text-[var(--text-secondary)] hover:text-[var(--accent-orange)]">{rec.artist_name}</Link>
          ) : rec.artist_name ? <span className="font-semibold">{rec.artist_name}</span> : null}
        </div>
        <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-[var(--text-faint)]">
          {place && <span>{place}</span>}
          {place && views && <span>·</span>}
          {views && <span className="inline-flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            {views}
          </span>}
        </p>
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
              {rec.artist_slug ? (
                <Link href={`/atlikejai/${rec.artist_slug}`} className="font-semibold text-[var(--accent-link)]">{rec.artist_name}</Link>
              ) : rec.artist_name ? <span className="font-semibold">{rec.artist_name}</span> : null}
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

/* Filtrų juostos stiliai — perimti iš /koncertai (.ev-fbar) */
function FilterStyles() {
  return (
    <style jsx global>{`
      .kf-bar { display:flex; flex-wrap:wrap; gap:7px; align-items:center; padding:11px 12px; border-radius:14px;
        background:var(--bg-surface); border:1px solid var(--border-default,rgba(255,255,255,0.08)); margin-bottom:22px; }
      .kf-divider { width:1px; height:22px; background:var(--border-default,rgba(255,255,255,0.1)); margin:0 2px; }
      .kf-chip { display:inline-flex; align-items:center; gap:6px; padding:6px 13px; border-radius:100px; font-size:12.5px; font-weight:600;
        font-family:'Outfit',sans-serif; background:var(--bg-hover); border:1px solid var(--border-default,rgba(255,255,255,0.08));
        color:var(--text-secondary); transition:all .15s; white-space:nowrap; cursor:pointer; line-height:1.3; }
      .kf-chip:hover { color:var(--text-primary); border-color:rgba(249,115,22,0.4); }
      .kf-chip.on { background:var(--accent-orange); border-color:var(--accent-orange); color:#fff; }
      .kf-n { opacity:.6; font-weight:700; }
      .kf-count { margin-left:auto; font-size:12px; font-weight:700; color:var(--text-faint); font-family:'Outfit',sans-serif;
        background:var(--bg-hover); border-radius:100px; padding:4px 11px; }
    `}</style>
  )
}
