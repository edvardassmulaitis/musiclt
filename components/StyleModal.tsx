'use client'

import { useState, useEffect, useRef } from 'react'
import { GENRES, SUBSTYLES } from '@/lib/constants'

type Props = {
  selected: string[]
  onChange: (styles: string[]) => void
}

export default function StyleModal({ selected, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  // Flatten all substyles with genre label
  const allStyles = Object.entries(SUBSTYLES).flatMap(([genre, styles]) =>
    styles.map(s => ({ name: s, genre }))
  )

  const filtered = query.length > 0
    ? allStyles.filter(s => s.name.toLowerCase().includes(query.toLowerCase()))
    : allStyles

  const toggle = (name: string) => {
    onChange(selected.includes(name) ? selected.filter(s => s !== name) : [...selected, name])
  }

  // Group filtered by genre for display
  const grouped = GENRES.reduce((acc, genre) => {
    const items = filtered.filter(s => s.genre === genre)
    if (items.length > 0) acc[genre] = items.map(s => s.name)
    return acc
  }, {} as Record<string, string[]>)

  return (
    <>
      {/* Trigger area */}
      <div>
        <div className="flex flex-wrap gap-2 mb-2">
          {selected.map(s => (
            <span key={s} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
              {s}
              <button type="button" onClick={() => toggle(s)} className="hover:text-red-600 font-bold ml-0.5">×</button>
            </span>
          ))}
          {selected.length === 0 && (
            <span className="text-sm text-gray-400 italic">Nėra pasirinktų stilių</span>
          )}
        </div>
        <button type="button" onClick={() => setOpen(true)}
          className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors">
          🎼 {selected.length > 0 ? `Redaguoti stilius (${selected.length})` : 'Pridėti stilius'}
        </button>
      </div>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center p-5 border-b">
              <h3 className="text-lg font-bold text-gray-900">
                Stilių priskyrimas
                {selected.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-music-blue">({selected.length} pasirinkta)</span>
                )}
              </h3>
              <button type="button" onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-700 text-2xl font-light">×</button>
            </div>

            {/* Search */}
            <div className="p-4 border-b">
              <input ref={inputRef} type="text" value={query} onChange={e => setQuery(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-music-blue"
                placeholder="Ieškoti stiliaus..." />
            </div>

            {/* List */}
            <div className="overflow-y-auto flex-1 p-4 space-y-4">
              {Object.entries(grouped).map(([genre, styles]) => (
                <div key={genre}>
                  <div className="text-xs font-bold text-music-blue uppercase tracking-wide mb-2">{genre}</div>
                  <div className="flex flex-wrap gap-2">
                    {styles.map(style => {
                      const active = selected.includes(style)
                      return (
                        <button key={style} type="button" onClick={() => toggle(style)}
                          className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                            active
                              ? 'bg-music-blue text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-blue-50 hover:text-music-blue'
                          }`}>
                          {active && <span className="mr-1">✓</span>}
                          {style}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
              {Object.keys(grouped).length === 0 && (
                <p className="text-center text-gray-400 py-8">Nieko nerasta pagal „{query}"</p>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t flex justify-between items-center">
              {selected.length > 0 && (
                <button type="button" onClick={() => onChange([])}
                  className="text-sm text-red-500 hover:text-red-700">Išvalyti viską</button>
              )}
              <button type="button" onClick={() => setOpen(false)}
                className="ml-auto px-6 py-2.5 bg-music-blue text-white rounded-lg font-medium hover:opacity-90">
                Patvirtinti ({selected.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
