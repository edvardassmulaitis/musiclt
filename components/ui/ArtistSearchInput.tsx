'use client'

import { useState, useEffect, useRef } from 'react'

type Props = {
  placeholder?: string
  onSelect: (id: number, name: string, avatar?: string | null) => void
}

export default function ArtistSearchInput({ placeholder = 'Ieškoti atlikėjo...', onSelect }: Props) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<any[]>([])
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (q.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/artists?search=${encodeURIComponent(q)}&limit=6`)
        setResults((await res.json()).artists || [])
      } catch { setResults([]) }
    }, 200)
    return () => clearTimeout(t)
  }, [q])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setResults([])
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="relative" ref={wrapRef}>
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder={placeholder}
        className="w-full px-2.5 py-1.5 border rounded-lg text-sm focus:outline-none transition-colors
          border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--input-text)] placeholder:text-[var(--input-placeholder)]
          focus:border-blue-400"
      />
      {results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 overflow-hidden rounded-xl shadow-xl
          border border-[var(--border-default)] bg-[var(--bg-surface)]">
          {results.map(a => {
            const avatar = a.cover_image_url || a.avatar || null
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => { onSelect(a.id, a.name, avatar); setQ(''); setResults([]) }}
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
        </div>
      )}
    </div>
  )
}
