'use client'

import { useState, useEffect, useRef } from 'react'

type Props = {
  placeholder?: string
  onSelect: (id: number, name: string, avatar?: string | null) => void
  // 2026-07-16: optional „sukurti naują" fallback — kai paieška nerado tikslaus
  // matcho, admin'as gali iškart sukurti naują atlikėją tuo pačiu query'iu, be
  // atskiro window.prompt() mygtuko. Naudoja /api/artists?check= (word-boundary
  // aware), tad esami panašūs atlikėjai visada parodomi PRIEŠ leidžiant kurti
  // naują — sumažina atsitiktinius dublikatus.
  onCreateNew?: (name: string) => void
  // Prefill'ina paieškos lauką iškart atidarius (pvz. iš AI extracted artist
  // vardo) — atitinka seną window.prompt() defaultName elgesį.
  initialQuery?: string
  autoFocus?: boolean
}

export default function ArtistSearchInput({ placeholder = 'Ieškoti atlikėjo...', onSelect, onCreateNew, initialQuery = '', autoFocus }: Props) {
  const [q, setQ] = useState(initialQuery)
  const [results, setResults] = useState<any[]>([])
  const [searched, setSearched] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); setSearched(false); return }
    const t = setTimeout(async () => {
      try {
        // 2026-07-16: ?check= vietoj ?search= — tikslesnis word-boundary match'as
        // (žr. api/artists/route.ts komentarą), tinkamesnis dublikatų aptikimui
        // nei plain ILIKE, kuris rasdavo „Dara" viduje „Rolandas Kindaravičius".
        const res = await fetch(`/api/artists?check=${encodeURIComponent(q.trim())}`)
        const data = await res.json()
        setResults(Array.isArray(data) ? data : [])
      } catch { setResults([]) } finally { setSearched(true) }
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setResults([]); setSearched(false) }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const showDropdown = results.length > 0 || (onCreateNew && searched && q.trim().length >= 2)

  return (
    <div className="relative" ref={wrapRef}>
      <input
        ref={inputRef}
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder={placeholder}
        className="w-full px-2.5 py-1.5 border rounded-lg text-sm focus:outline-none transition-colors
          border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--input-text)] placeholder:text-[var(--input-placeholder)]
          focus:border-blue-400"
      />
      {showDropdown && (
        <div className="absolute z-50 w-full mt-1 overflow-hidden rounded-xl shadow-xl
          border border-[var(--border-default)] bg-[var(--bg-surface)]">
          {results.length > 0 && (
            <>
              {onCreateNew && (
                <p className="px-3 pt-2 pb-1 text-[11px] font-semibold text-amber-600">⚠️ Panašūs jau yra DB'oje:</p>
              )}
              {results.map(a => {
                const avatar = a.cover_image_url || a.avatar || null
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => { onSelect(a.id, a.name, avatar); setQ(''); setResults([]); setSearched(false) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors
                      hover:bg-[var(--bg-hover)]"
                  >
                    {avatar ? (
                      <img src={avatar} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {a.name?.[0] || '?'}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate text-[var(--text-primary)]">{a.name}</p>
                      {a.country && <p className="text-xs truncate text-[var(--text-muted)]">{a.country}</p>}
                    </div>
                  </button>
                )
              })}
            </>
          )}
          {onCreateNew && (
            <button
              type="button"
              onClick={() => { onCreateNew(q.trim()); setQ(''); setResults([]); setSearched(false) }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors ${results.length > 0 ? 'border-t border-[var(--border-subtle)]' : ''}`}
            >
              <span className="w-7 h-7 rounded-full bg-emerald-200 flex items-center justify-center shrink-0 text-sm">+</span>
              <span className="truncate">Sukurti naują: „{q.trim()}"</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
