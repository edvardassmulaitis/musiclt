'use client'
// components/blog/EventTargetField.tsx
//
// Renginio apžvalgai pasirenkam renginį iš events lentelės. Naudojam jau
// egzistuojantį /api/events?search=q endpoint'ą — debounced lookup'as,
// dropdown su rezultatais.

import { useEffect, useRef, useState } from 'react'

export type EventHit = {
  id: string         // UUID
  title: string
  slug: string | null
  start_date: string | null
  city: string | null
}

export type EventTarget = {
  event_id: string | null
  display: EventHit | null
}

export function EventTargetField({
  target, onChange,
}: {
  target: EventTarget
  onChange: (t: EventTarget) => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<EventHit[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Debounced search į /api/events?search=
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setResults([]); return }
    setLoading(true)
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/events?search=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        const data = await res.json()
        setResults(Array.isArray(data) ? data : [])
      } catch (e: any) {
        if (e?.name !== 'AbortError') setResults([])
      } finally {
        setLoading(false)
      }
    }, 200)
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

  function pick(hit: EventHit) {
    onChange({ event_id: hit.id, display: hit })
    setQ('')
    setOpen(false)
  }

  function clear() {
    onChange({ event_id: null, display: null })
  }

  return (
    <div className="mb-6" ref={wrapRef}>
      <label className="text-[10px] font-bold uppercase tracking-wider mb-2 block" style={{ color: '#5e7290', fontFamily: "'Outfit', sans-serif" }}>
        Renginys
      </label>

      {target.display ? (
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: '#dde8f8' }}>
              {target.display.title}
            </p>
            <p className="text-xs truncate" style={{ color: '#5e7290' }}>
              {target.display.start_date && new Date(target.display.start_date).toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' })}
              {target.display.city && ` · ${target.display.city}`}
            </p>
          </div>
          <button type="button" onClick={clear} className="px-2 py-1 rounded text-xs hover:text-white transition" style={{ color: '#5e7290' }}>
            ×
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            type="text"
            value={q}
            onChange={e => { setQ(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder="Pasirink renginį..."
            className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:border-[#f97316]/30 transition"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#dde8f8' }}
          />

          {open && (loading || results.length > 0) && (
            <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-lg overflow-hidden max-h-72 overflow-y-auto"
              style={{ background: 'rgba(13,17,23,0.95)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)' }}>
              {loading && <p className="px-3 py-2 text-xs" style={{ color: '#5e7290' }}>Ieškoma...</p>}
              {!loading && results.map(hit => (
                <button
                  key={hit.id}
                  type="button"
                  onClick={() => pick(hit)}
                  className="block w-full text-left px-3 py-2 hover:bg-white/[.04] transition"
                >
                  <p className="text-sm font-semibold" style={{ color: '#dde8f8' }}>{hit.title}</p>
                  <p className="text-[10px]" style={{ color: '#5e7290' }}>
                    {hit.start_date && new Date(hit.start_date).toLocaleDateString('lt-LT', { year: 'numeric', month: 'short', day: 'numeric' })}
                    {hit.city && ` · ${hit.city}`}
                  </p>
                </button>
              ))}
              {!loading && results.length === 0 && q.length >= 2 && (
                <p className="px-3 py-2 text-xs" style={{ color: '#5e7290' }}>Renginių nerasta</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
