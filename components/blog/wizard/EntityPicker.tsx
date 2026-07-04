'use client'
// components/blog/wizard/EntityPicker.tsx
//
// Wizard'o pagrindinis muzikos rinkiklis. Sujungia:
//   1. „Neseniai pamėgti" pasiūlymus (/api/blog/suggestions) — kai laukas tuščias
//   2. Paiešką (/api/search-entities) — kai narys rašo
// Dideli tap target'ai mobile'ui; optional tipo filtrai (Visi/Atlikėjai/…).
//
// onPick gauna AttachmentHit. Tėvas pats rodo pasirinktą įrašą per
// SelectedEntityCard (žemiau eksportuotas).

import { useEffect, useRef, useState } from 'react'
import { proxyImg } from '@/lib/img-proxy'
import type { AttachmentHit } from '@/components/MusicSearchPicker'

type Kind = 'artist' | 'album' | 'track' | 'all'

const HIT_TYPE: Record<Exclude<Kind, 'all'>, AttachmentHit['type']> = {
  artist: 'grupe', album: 'albumas', track: 'daina',
}
const TYPE_LABEL: Record<AttachmentHit['type'], string> = {
  grupe: 'Atlikėjas', albumas: 'Albumas', daina: 'Daina',
}
const TYPE_GLYPH: Record<AttachmentHit['type'], string> = {
  grupe: '👤', albumas: '💿', daina: '🎵',
}

const FILTERS: Array<{ key: Kind; label: string }> = [
  { key: 'all', label: 'Visi' },
  { key: 'artist', label: 'Atlikėjai' },
  { key: 'album', label: 'Albumai' },
  { key: 'track', label: 'Dainos' },
]

export function EntityPicker({
  kind = 'all',
  allowFilterChips = false,
  onPick,
  excludeKeys = [],
  placeholder = 'Ieškok atlikėjo, albumo ar dainos…',
  autoFocus = false,
}: {
  kind?: Kind
  allowFilterChips?: boolean
  onPick: (hit: AttachmentHit) => void
  excludeKeys?: string[]   // `${type}:${id}` jau pridėtų — paslepiam
  placeholder?: string
  autoFocus?: boolean
}) {
  const [filter, setFilter] = useState<Kind>(kind)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<AttachmentHit[]>([])
  const [suggestions, setSuggestions] = useState<AttachmentHit[]>([])
  const [loading, setLoading] = useState(false)
  const [loadedSug, setLoadedSug] = useState(false)

  const activeKind: Kind = allowFilterChips ? filter : kind
  const excludeSet = new Set(excludeKeys)

  // Suggestions — neseniai pamėgti (priklauso nuo activeKind)
  useEffect(() => {
    let abort = false
    setLoadedSug(false)
    fetch(`/api/blog/suggestions?kind=${activeKind}&limit=10`)
      .then(r => r.json())
      .then(d => { if (!abort) setSuggestions(Array.isArray(d?.suggestions) ? d.suggestions : []) })
      .catch(() => { if (!abort) setSuggestions([]) })
      .finally(() => { if (!abort) setLoadedSug(true) })
    return () => { abort = true }
  }, [activeKind])

  // Search — debounced
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setResults([]); setLoading(false); return }
    setLoading(true)
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search-entities?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        const data = await res.json()
        setResults(Array.isArray(data?.results) ? data.results : [])
      } catch (e: any) {
        if (e?.name !== 'AbortError') setResults([])
      } finally {
        setLoading(false)
      }
    }, 130)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [q])

  const typeOf = activeKind === 'all' ? null : HIT_TYPE[activeKind]
  const key = (h: AttachmentHit) => `${h.type}:${h.id}`
  const visible = (list: AttachmentHit[]) => list
    .filter(h => !typeOf || h.type === typeOf)
    .filter(h => !excludeSet.has(key(h)))

  const searching = q.trim().length >= 2
  const shownResults = visible(results)
  const shownSuggestions = visible(suggestions)

  return (
    <div className="ep">
      {allowFilterChips && (
        <div className="ep-filters">
          {FILTERS.map(f => (
            <button
              key={f.key}
              type="button"
              className={`ep-chip${filter === f.key ? ' is-active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      <div className="ep-search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ep-search-ico"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="ep-input"
        />
        {q && (
          <button type="button" onClick={() => setQ('')} aria-label="Išvalyti" className="ep-clear">
            <svg viewBox="0 0 16 16" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M3 3l10 10M13 3L3 13" /></svg>
          </button>
        )}
      </div>

      {/* Results / suggestions */}
      {searching ? (
        <div className="ep-list">
          {loading && shownResults.length === 0 ? (
            <p className="ep-hint">Ieškoma…</p>
          ) : shownResults.length === 0 ? (
            <p className="ep-hint">Nieko nerasta.</p>
          ) : (
            shownResults.map(hit => <Row key={key(hit)} hit={hit} onPick={onPick} />)
          )}
        </div>
      ) : (
        <div className="ep-list">
          {!loadedSug ? (
            <p className="ep-hint">Kraunami pasiūlymai…</p>
          ) : shownSuggestions.length > 0 ? (
            <>
              <p className="ep-section">Neseniai pamėgti</p>
              {shownSuggestions.map(hit => <Row key={key(hit)} hit={hit} onPick={onPick} />)}
            </>
          ) : (
            <p className="ep-hint">Pradėk rašyti, kad surastum.</p>
          )}
        </div>
      )}

      <style jsx>{`
        .ep-filters { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
        .ep-chip {
          padding: 7px 14px; border-radius: 999px; font-size: 14px; font-weight: 700;
          font-family: 'Outfit', sans-serif; cursor: pointer;
          background: var(--bg-elevated); border: 1px solid var(--border-subtle); color: var(--text-secondary);
          -webkit-tap-highlight-color: transparent;
        }
        .ep-chip.is-active { background: var(--accent-orange); color: #fff; border-color: transparent; }
        .ep-search {
          display: flex; align-items: center; gap: 9px;
          background: var(--bg-elevated); border: 1px solid var(--border-subtle);
          border-radius: 13px; padding: 0 12px; height: 50px;
        }
        .ep-search:focus-within { border-color: var(--accent-orange); }
        .ep-search-ico { color: var(--text-faint); flex-shrink: 0; }
        .ep-input {
          flex: 1; min-width: 0; background: transparent; border: none; outline: none;
          color: var(--text-primary); font-size: 16px;
        }
        .ep-input::placeholder { color: var(--text-faint); }
        .ep-clear {
          flex-shrink: 0; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
          border: none; background: transparent; color: var(--text-faint); cursor: pointer;
        }
        .ep-list { margin-top: 8px; display: flex; flex-direction: column; }
        .ep-section {
          font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em;
          color: var(--text-faint); font-family: 'Outfit', sans-serif; margin: 8px 2px 6px;
        }
        .ep-hint { padding: 18px 4px; font-size: 14px; color: var(--text-faint); text-align: center; }
      `}</style>
    </div>
  )
}

function Row({ hit, onPick }: { hit: AttachmentHit; onPick: (h: AttachmentHit) => void }) {
  return (
    <button type="button" className="epr" onClick={() => onPick(hit)}>
      <span className="epr-cover">
        {hit.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxyImg(hit.image_url)} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="epr-glyph">{TYPE_GLYPH[hit.type]}</span>
        )}
      </span>
      <span className="epr-text">
        <span className="epr-title">{hit.title}</span>
        <span className="epr-sub">{hit.artist || TYPE_LABEL[hit.type]}</span>
      </span>
      <span className="epr-badge">{TYPE_LABEL[hit.type]}</span>
      <style jsx>{`
        .epr {
          display: flex; align-items: center; gap: 12px; width: 100%; text-align: left;
          padding: 9px 8px; border: none; background: transparent; cursor: pointer; border-radius: 12px;
          -webkit-tap-highlight-color: transparent;
        }
        .epr:hover { background: var(--bg-hover); }
        .epr:active { background: var(--bg-active); }
        .epr-cover {
          flex-shrink: 0; width: 48px; height: 48px; border-radius: 10px; overflow: hidden;
          background: var(--cover-placeholder); display: flex; align-items: center; justify-content: center;
        }
        .epr-cover :global(img) { width: 100%; height: 100%; object-fit: cover; }
        .epr-glyph { font-size: 20px; opacity: .5; }
        .epr-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .epr-title {
          font-family: 'Outfit', sans-serif; font-weight: 700; font-size: 16px; color: var(--text-primary);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .epr-sub { font-size: 12px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .epr-badge {
          flex-shrink: 0; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em;
          font-family: 'Outfit', sans-serif; color: var(--text-faint);
          background: var(--bg-elevated); border-radius: 999px; padding: 4px 9px;
        }
      `}</style>
    </button>
  )
}

/** Pasirinkto įrašo kortelė su „pakeisti" mygtuku. */
export function SelectedEntityCard({
  hit, onClear, clearLabel = 'Keisti',
}: { hit: AttachmentHit; onClear: () => void; clearLabel?: string }) {
  return (
    <div className="sec">
      <span className="sec-cover">
        {hit.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxyImg(hit.image_url)} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="sec-glyph">{TYPE_GLYPH[hit.type]}</span>
        )}
      </span>
      <span className="sec-text">
        <span className="sec-kind">{TYPE_LABEL[hit.type]}</span>
        <span className="sec-title">{hit.title}</span>
        {hit.artist && <span className="sec-sub">{hit.artist}</span>}
      </span>
      <button type="button" className="sec-clear" onClick={onClear}>{clearLabel}</button>
      <style jsx>{`
        .sec {
          display: flex; align-items: center; gap: 14px;
          background: var(--bg-elevated); border: 1px solid var(--border-subtle);
          border-radius: 16px; padding: 14px;
        }
        .sec-cover {
          flex-shrink: 0; width: 64px; height: 64px; border-radius: 12px; overflow: hidden;
          background: var(--cover-placeholder); display: flex; align-items: center; justify-content: center;
        }
        .sec-cover :global(img) { width: 100%; height: 100%; object-fit: cover; }
        .sec-glyph { font-size: 26px; opacity: .5; }
        .sec-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .sec-kind {
          font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em;
          color: var(--accent-orange); font-family: 'Outfit', sans-serif;
        }
        .sec-title {
          font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 16px; color: var(--text-primary);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .sec-sub { font-size: 14px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sec-clear {
          flex-shrink: 0; align-self: flex-start; font-size: 12px; font-weight: 700;
          color: var(--text-secondary); background: var(--bg-hover); border: none;
          border-radius: 8px; padding: 6px 10px; cursor: pointer; font-family: 'Outfit', sans-serif;
        }
      `}</style>
    </div>
  )
}
