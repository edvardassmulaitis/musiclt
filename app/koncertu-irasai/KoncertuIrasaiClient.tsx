'use client'

import { useMemo, useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import {
  type ConcertRecording, type RecordingStyle, type DurationBucket,
  formatDurationRough, durationBucket, DURATION_BUCKETS, recordingRegion,
  viewsPopLevel, formatViews, isFreshRecording, relativeAppeared,
  ytEmbedUrl, recordingHref,
} from '@/lib/concert-recordings-shared'
import { styleLabel } from '@/lib/radaras-shared'

type Props = { recordings: ConcertRecording[]; styles: RecordingStyle[] }
type Region = 'all' | 'lt' | 'world'
type Sort = 'new' | 'popular'

export default function KoncertuIrasaiClient({ recordings, styles }: Props) {
  const [region, setRegion] = useState<Region>('all')
  const [sort, setSort] = useState<Sort>('new')
  const [dur, setDur] = useState<DurationBucket | 'all'>('all')
  const [style, setStyle] = useState<string | 'all'>('all')
  const [active, setActive] = useState<ConcertRecording | null>(null)

  const filtered = useMemo(() => {
    let list = recordings.filter((r) => {
      if (region !== 'all' && recordingRegion(r) !== region) return false
      if (dur !== 'all' && durationBucket(r.duration_seconds) !== dur) return false
      if (style !== 'all' && !r.styles.includes(style)) return false
      return true
    })
    list = [...list].sort((a, b) => {
      if (sort === 'popular') return (b.view_count ?? 0) - (a.view_count ?? 0)
      // 'new' — naujausi pridėti pirmi, populiarumas pastumia
      const fa = isFreshRecording(a.created_at) ? 1 : 0
      const fb = isFreshRecording(b.created_at) ? 1 : 0
      if (fa !== fb) return fb - fa
      const ca = a.created_at ? Date.parse(a.created_at) : 0
      const cb = b.created_at ? Date.parse(b.created_at) : 0
      if (cb !== ca) return cb - ca
      return (b.view_count ?? 0) - (a.view_count ?? 0)
    })
    return list
  }, [recordings, region, sort, dur, style])

  if (recordings.length === 1) return <FeaturedPlayer rec={recordings[0]} />

  return (
    <div>
      <div className="kf-bar">
        {/* Regionas */}
        <button className={`kf-chip${region === 'all' ? ' on' : ''}`} onClick={() => setRegion('all')}>Visi</button>
        <button className={`kf-chip${region === 'lt' ? ' on' : ''}`} onClick={() => setRegion('lt')}>🇱🇹 Lietuva</button>
        <button className={`kf-chip${region === 'world' ? ' on' : ''}`} onClick={() => setRegion('world')}>Pasaulis</button>
        <span className="kf-divider" />
        {/* Rikiavimas */}
        <button className={`kf-chip${sort === 'new' ? ' on' : ''}`} onClick={() => setSort('new')}>Naujausi</button>
        <button className={`kf-chip${sort === 'popular' ? ' on' : ''}`} onClick={() => setSort('popular')}>Populiariausi</button>
        <span className="kf-divider" />
        {/* Trukmė */}
        <button className={`kf-chip${dur === 'all' ? ' on' : ''}`} onClick={() => setDur('all')}>Visos trukmės</button>
        {DURATION_BUCKETS.map((b) => (
          <button key={b.key} className={`kf-chip${dur === b.key ? ' on' : ''}`} onClick={() => setDur(b.key)}>{b.label}</button>
        ))}
        {/* Stilius — dropdown */}
        {styles.length > 0 && <><span className="kf-divider" /><StyleDropdown styles={styles} value={style} onChange={setStyle} /></>}
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

/* ── Stilių dropdown ── */
function StyleDropdown({ styles, value, onChange }: { styles: RecordingStyle[]; value: string | 'all'; onChange: (v: string | 'all') => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  const label = value === 'all' ? 'Stilius' : styleLabel(value)
  return (
    <div className="kf-dd" ref={ref}>
      <button className={`kf-chip${value !== 'all' ? ' on' : ''}`} onClick={() => setOpen((o) => !o)}>
        {label}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && (
        <div className="kf-pop">
          <button className={`kf-opt${value === 'all' ? ' on' : ''}`} onClick={() => { onChange('all'); setOpen(false) }}>Visi stiliai</button>
          {styles.map((s) => (
            <button key={s.name} className={`kf-opt${value === s.name ? ' on' : ''}`} onClick={() => { onChange(s.name); setOpen(false) }}>
              {styleLabel(s.name)} <span className="kf-optn">{s.n}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Popbar (peržiūros → 5 dashai, kaip visur kitur) ── */
function PopBar({ views }: { views: number | null }) {
  const lvl = viewsPopLevel(views)
  if (lvl <= 0) return null
  return (
    <span className="flex shrink-0 items-center gap-[3px]" title={`${formatViews(views)} peržiūrų`} aria-label={`Populiarumas ${lvl}/5`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className="h-[3px] w-[14px] rounded-[2px]"
          style={i < lvl
            ? { background: 'var(--accent-orange)', opacity: 0.55 + 0.45 * (i + 1) / 5 }
            : { background: 'var(--border-default)', opacity: 0.5 }} />
      ))}
    </span>
  )
}

function ThumbOverlays({ rec }: { rec: ConcertRecording }) {
  const rel = relativeAppeared(rec.uploaded_at)
  const fresh = isFreshRecording(rec.created_at)
  return (
    <>
      {rel && (
        <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10.5px] font-bold text-white backdrop-blur-sm">
          {fresh && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
          {rel}
        </span>
      )}
      {rec.duration_seconds != null && (
        <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/80 px-1.5 py-0.5 font-['Outfit',sans-serif] text-[11px] font-bold text-white">
          {formatDurationRough(rec.duration_seconds)}
        </span>
      )}
    </>
  )
}

function RecordingCard({ rec, onPlay }: { rec: ConcertRecording; onPlay: () => void }) {
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
        <ThumbOverlays rec={rec} />
        <button onClick={onPlay} aria-label="Groti" className="absolute bottom-2 right-2 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent-orange)] text-white shadow-[0_6px_18px_rgba(249,115,22,0.5)] ring-2 ring-white/15 transition-transform hover:scale-110">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        </button>
      </div>
      <div className="mt-2">
        <button onClick={onPlay} className="block text-left">
          <h3 className="line-clamp-2 font-['Outfit',sans-serif] text-[14.5px] font-bold leading-snug text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{rec.title}</h3>
        </button>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          {rec.artist_slug ? (
            <Link href={`/atlikejai/${rec.artist_slug}`} className="truncate text-[12.5px] font-semibold text-[var(--text-secondary)] hover:text-[var(--accent-orange)]">{rec.artist_name}</Link>
          ) : rec.artist_name ? <span className="truncate text-[12.5px] font-semibold text-[var(--text-muted)]">{rec.artist_name}</span> : <span />}
          <PopBar views={rec.view_count} />
        </div>
      </div>
    </div>
  )
}

/* ── Featured inline player (vienam įrašui) ── */
function FeaturedPlayer({ rec }: { rec: ConcertRecording }) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
        <iframe src={ytEmbedUrl(rec.youtube_id, false)} className="absolute inset-0 h-full w-full" title={rec.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {rec.duration_seconds != null && <span className="text-[13px] font-bold text-[var(--text-muted)]">{formatDurationRough(rec.duration_seconds)}</span>}
        {relativeAppeared(rec.uploaded_at) && <span className="text-[13px] text-[var(--text-faint)]">{relativeAppeared(rec.uploaded_at)}</span>}
        <PopBar views={rec.view_count} />
      </div>
      <h2 className="mt-1.5 font-['Outfit',sans-serif] text-[19px] font-black leading-tight tracking-[-0.01em] text-[var(--text-primary)]">{rec.title}</h2>
      <div className="mt-1 text-[13.5px] text-[var(--text-muted)]">
        {rec.artist_slug ? <Link href={`/atlikejai/${rec.artist_slug}`} className="font-bold text-[var(--accent-link)]">{rec.artist_name}</Link> : rec.artist_name}
        {rec.recorded_year && <span> · {rec.recorded_year} m.</span>}
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
  const rel = relativeAppeared(rec.uploaded_at)
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3 sm:p-6" onClick={onClose}>
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl bg-[var(--bg-surface)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="relative aspect-video w-full bg-black">
          <iframe src={ytEmbedUrl(rec.youtube_id, true)} className="absolute inset-0 h-full w-full" title={rec.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
        </div>
        <div className="flex items-start justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-3">
              {rec.duration_seconds != null && <span className="text-[12px] font-bold text-[var(--text-muted)]">{formatDurationRough(rec.duration_seconds)}</span>}
              {rel && <span className="text-[12px] text-[var(--text-faint)]">{rel}</span>}
              <PopBar views={rec.view_count} />
            </div>
            <h2 className="font-['Outfit',sans-serif] text-[17px] font-extrabold leading-tight text-[var(--text-primary)]">{rec.title}</h2>
            <div className="mt-1 text-[13px] text-[var(--text-muted)]">
              {rec.artist_slug ? <Link href={`/atlikejai/${rec.artist_slug}`} className="font-semibold text-[var(--accent-link)]">{rec.artist_name}</Link> : rec.artist_name}
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

function FilterStyles() {
  return (
    <style jsx global>{`
      .kf-bar { display:flex; flex-wrap:wrap; gap:7px; align-items:center; padding:11px 12px; border-radius:14px;
        background:var(--bg-surface); border:1px solid var(--border-default,rgba(255,255,255,0.08)); margin-bottom:22px; }
      .kf-divider { width:1px; height:22px; background:var(--border-default,rgba(255,255,255,0.1)); margin:0 2px; }
      .kf-chip { display:inline-flex; align-items:center; gap:5px; padding:6px 13px; border-radius:100px; font-size:12.5px; font-weight:600;
        font-family:'Outfit',sans-serif; background:var(--bg-hover); border:1px solid var(--border-default,rgba(255,255,255,0.08));
        color:var(--text-secondary); transition:all .15s; white-space:nowrap; cursor:pointer; line-height:1.3; }
      .kf-chip:hover { color:var(--text-primary); border-color:rgba(249,115,22,0.4); }
      .kf-chip.on { background:var(--accent-orange); border-color:var(--accent-orange); color:#fff; }
      .kf-count { margin-left:auto; font-size:12px; font-weight:700; color:var(--text-faint); font-family:'Outfit',sans-serif;
        background:var(--bg-hover); border-radius:100px; padding:4px 11px; }
      .kf-dd { position:relative; }
      .kf-pop { position:absolute; top:calc(100% + 8px); left:0; z-index:50; min-width:190px; max-height:300px; overflow-y:auto; padding:7px;
        background:var(--bg-surface); border:1px solid var(--border-default,rgba(255,255,255,0.12)); border-radius:13px; box-shadow:0 14px 40px rgba(0,0,0,0.32); }
      .kf-opt { display:flex; align-items:center; justify-content:space-between; gap:10px; width:100%; text-align:left; padding:8px 10px; border-radius:9px;
        font-size:13px; font-weight:600; font-family:'Outfit',sans-serif; cursor:pointer; background:transparent; border:none; color:var(--text-secondary); transition:all .12s; }
      .kf-opt:hover { background:var(--bg-hover); color:var(--text-primary); }
      .kf-opt.on { color:var(--accent-orange); }
      .kf-optn { font-size:11px; font-weight:700; color:var(--text-faint); }
    `}</style>
  )
}
