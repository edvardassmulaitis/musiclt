'use client'
// components/MusicSearchPicker.tsx
//
// Reusable inline search picker for attaching artists / albums / tracks to
// a comment, forum post, or whatever takes attachments. Backed by the
// existing /api/search-entities endpoint (already used elsewhere). Returns
// hits the parent can display + remove. Stays inline (not a modal) so it
// composes well inside textarea-driven composers.
//
// Usage:
//   <MusicSearchPicker
//     attached={attached}
//     onAdd={(hit) => setAttached(a => [...a, hit])}
//     onRemove={(idx) => setAttached(a => a.filter((_, i) => i !== idx))}
//   />
//
// The parent renders the chip strip however it wants — picker only renders
// the input + dropdown of hits.

import { useEffect, useRef, useState } from 'react'
import { proxyImg } from '@/lib/img-proxy'

export type AttachmentHit = {
  type: 'daina' | 'albumas' | 'grupe'
  id: number
  legacy_id: number | null
  slug: string
  title: string
  artist: string | null
  image_url: string | null
}

type Props = {
  /** Already-attached items — picker hides these in results to avoid dupes. */
  attached?: AttachmentHit[]
  onAdd: (hit: AttachmentHit) => void
  /** Optional placeholder copy. */
  placeholder?: string
  /** Compact (smaller padding/text) for use inside modals. */
  compact?: boolean
  /** Filtruoti rezultatus tik tam tikram tipui (vertimui — tik 'daina'). */
  typeFilter?: AttachmentHit['type']
}

const TYPE_LABEL: Record<AttachmentHit['type'], string> = {
  grupe: 'Atlikėjas',
  albumas: 'Albumas',
  daina: 'Daina',
}

export default function MusicSearchPicker({
  attached = [], onAdd, placeholder = 'Pridėk muzikos...', compact = false, typeFilter,
}: Props) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<AttachmentHit[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Debounced search — short delay (120ms) since results refresh feels
  // sluggish at 220ms. AbortController so a previous slow request doesn't
  // overwrite a newer one's results.
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search-entities?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        const data = await res.json()
        setResults(data.results || [])
      } catch (e: any) {
        if (e?.name !== 'AbortError') setResults([])
      } finally {
        setLoading(false)
      }
    }, 120)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [q])

  // Close on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const attachedKey = (h: AttachmentHit) => `${h.type}:${h.id}`
  const attachedSet = new Set(attached.map(attachedKey))
  const filtered = results
    .filter(h => !attachedSet.has(attachedKey(h)))
    .filter(h => !typeFilter || h.type === typeFilter)

  const fontSize = compact ? 12 : 13
  const padY = compact ? 'py-1.5' : 'py-2'

  return (
    <div ref={wrapRef} className="relative w-full">
      <div className={[
        'flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3',
        padY,
        'focus-within:border-[var(--accent-orange)]',
      ].join(' ')}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-[var(--text-faint)]">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          type="text"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
          style={{ fontSize }}
        />
        {q && (
          <button
            type="button"
            onClick={() => { setQ(''); setResults([]) }}
            aria-label="Išvalyti"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--text-faint)] hover:text-[var(--text-primary)]"
          >
            <svg viewBox="0 0 16 16" width={10} height={10} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        )}
      </div>

      {/* Dropdown — hits list. Position absolute, scrolls. */}
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 z-50 mt-1.5 max-h-[360px] overflow-y-auto rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-[0_18px_40px_-10px_rgba(0,0,0,0.45)]">
          {loading ? (
            <div className="flex items-center justify-center gap-2.5 px-3 py-5 text-[11px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
              <EqualizerLoader />
              <span>Ieškoma</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-[12px] text-[var(--text-faint)]">
              {results.length > 0 ? 'Visi rasti jau pridėti.' : 'Nieko nerasta.'}
            </div>
          ) : (
            <ul className="flex flex-col">
              {filtered.map((hit) => (
                <li key={`${hit.type}-${hit.id}`}>
                  <button
                    type="button"
                    onClick={() => {
                      onAdd(hit)
                      setQ('')
                      setResults([])
                      setOpen(false)
                    }}
                    className="flex w-full items-center gap-2.5 border-b border-[var(--border-subtle)] px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-[var(--bg-hover)]"
                  >
                    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-[var(--cover-placeholder)]">
                      {hit.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={proxyImg(hit.image_url)}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[14px] text-[var(--text-faint)]">
                          {hit.type === 'grupe' ? '👤' : hit.type === 'albumas' ? '💿' : '🎵'}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-['Outfit',sans-serif] text-[12.5px] font-bold text-[var(--text-primary)]">
                        {hit.title}
                      </div>
                      <div className="truncate text-[10.5px] text-[var(--text-muted)]">
                        {hit.artist || TYPE_LABEL[hit.type]}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 font-['Outfit',sans-serif] text-[9px] font-extrabold uppercase tracking-wider text-[var(--text-faint)]">
                      {TYPE_LABEL[hit.type]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

/** Equalizer-style loading indicator — 4 vertical bars bouncing in
 *  staggered pulses. Themed in orange to match the rest of the UI. Uses
 *  inline keyframes so the component is self-contained. */
function EqualizerLoader() {
  return (
    <span className="inline-flex h-3 items-end gap-[2px]">
      {[0, 0.12, 0.24, 0.36].map((delay, i) => (
        <span
          key={i}
          style={{ animationDelay: `${delay}s` }}
          className="block w-[3px] rounded-sm bg-[var(--accent-orange)]"
        />
      ))}
      <style jsx>{`
        span > span {
          animation: eqBar 0.85s ease-in-out infinite alternate;
          height: 30%;
        }
        @keyframes eqBar {
          0% { height: 30%; }
          50% { height: 100%; }
          100% { height: 50%; }
        }
      `}</style>
    </span>
  )
}

/** Helper — small chip strip for showing already-attached items with a remove
 *  button. Keep render-side decoupled from picker so parents can style how
 *  they want; this is just a sensible default. */
export function AttachmentChips({
  items, onRemove, compact = false,
}: { items: AttachmentHit[]; onRemove: (index: number) => void; compact?: boolean }) {
  if (items.length === 0) return null
  const fontSize = compact ? 11 : 12
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((hit, i) => (
        <span
          key={`${hit.type}-${hit.id}-${i}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] py-1 pl-1 pr-2"
        >
          <span className="h-5 w-5 shrink-0 overflow-hidden rounded-sm bg-[var(--cover-placeholder)]">
            {hit.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={proxyImg(hit.image_url)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
            ) : null}
          </span>
          <span className="font-['Outfit',sans-serif] font-bold text-[var(--text-primary)]" style={{ fontSize }}>
            {hit.title}
          </span>
          <button
            type="button"
            onClick={() => onRemove(i)}
            aria-label="Pašalinti"
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[var(--text-faint)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <svg viewBox="0 0 16 16" width={9} height={9} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </span>
      ))}
    </div>
  )
}
