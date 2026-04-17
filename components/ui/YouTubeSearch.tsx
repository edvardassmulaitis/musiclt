'use client'

import { useState, useEffect } from 'react'

type YTResult = { videoId: string; title: string; channel: string; thumbnail: string }

type Props = {
  initialQuery: string
  onSelect: (url: string) => void
}

export default function YouTubeSearch({ initialQuery, onSelect }: Props) {
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<YTResult[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { setQuery(initialQuery) }, [initialQuery])

  const search = async () => {
    if (!query.trim()) return
    setLoading(true); setResults([])
    try {
      const res = await fetch(`/api/search/youtube?q=${encodeURIComponent(query)}&type=video`)
      setResults((await res.json()).results || [])
    } finally { setLoading(false) }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Ieškoti YouTube..."
          className="flex-1 px-2.5 py-1.5 border rounded-lg text-sm focus:outline-none transition-colors
            border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--input-text)] placeholder:text-[var(--input-placeholder)]
            focus:border-blue-400"
        />
        <button
          type="button"
          onClick={search}
          disabled={loading}
          className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm disabled:opacity-50 transition-colors shrink-0"
        >
          {loading ? (
            <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          )}
        </button>
      </div>
      {results.length > 0 && (
        <div className="rounded-lg border overflow-hidden border-[var(--border-subtle)]">
          {results.map(r => (
            <div
              key={r.videoId}
              onClick={() => { onSelect(`https://www.youtube.com/watch?v=${r.videoId}`); setResults([]) }}
              className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer transition-colors
                hover:bg-[var(--bg-hover)] border-b last:border-0 border-[var(--border-subtle)]"
            >
              <img src={r.thumbnail} alt="" className="w-12 h-8 object-cover rounded shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium line-clamp-1 text-[var(--text-primary)]">{r.title}</p>
                <p className="text-xs truncate text-[var(--text-muted)]">{r.channel}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
