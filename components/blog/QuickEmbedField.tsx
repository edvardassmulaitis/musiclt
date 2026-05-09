'use client'
// components/blog/QuickEmbedField.tsx
//
// Quick mode core widget. User'is paste'ina YouTube/Spotify/SoundCloud
// nuorodą — auto-fetchina metadata ir parodom paprastą preview kortelę.

import { useState, useEffect, useRef } from 'react'

export type QuickEmbed = {
  embed_url: string
  embed_type: string
  embed_title: string | null
  embed_thumbnail_url: string | null
  embed_html: string | null
}

export function QuickEmbedField({
  value, onChange,
}: {
  value: QuickEmbed | null
  onChange: (e: QuickEmbed | null) => void
}) {
  const [draft, setDraft] = useState(value?.embed_url || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    if (!draft.trim()) {
      onChange(null); setError('')
      return
    }
    debounce.current = setTimeout(async () => {
      setLoading(true); setError('')
      try {
        const res = await fetch(`/api/blog/embed-meta?url=${encodeURIComponent(draft.trim())}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || 'Klaida')
        if (data.type === 'other' && !data.embed_html) {
          setError('Neatpažinta nuoroda. Palaikoma: YouTube, Spotify, SoundCloud, Bandcamp')
          onChange(null)
          return
        }
        onChange({
          embed_url: draft.trim(),
          embed_type: data.type,
          embed_title: data.title,
          embed_thumbnail_url: data.thumbnail_url,
          embed_html: data.embed_html,
        })
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }, 600)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  return (
    <div className="space-y-3 mb-6">
      <div>
        <label className="text-[10px] font-bold uppercase tracking-wider mb-2 block" style={{ color: '#5e7290', fontFamily: "'Outfit', sans-serif" }}>
          Nuoroda
        </label>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="https://youtube.com/... arba https://open.spotify.com/..."
          className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:border-[#f97316]/30 transition"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#dde8f8' }}
          autoFocus
        />
      </div>

      {loading && <p className="text-xs" style={{ color: '#5e7290' }}>Kraunasi preview...</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}

      {value && !loading && !error && (
        <div className="rounded-lg overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {value.embed_thumbnail_url && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={value.embed_thumbnail_url} alt="" className="w-full max-h-48 object-cover" />
          )}
          <div className="px-3 py-2">
            <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#5e7290' }}>
              {value.embed_type}
            </p>
            <p className="text-sm font-semibold mt-0.5 truncate" style={{ color: '#dde8f8' }}>
              {value.embed_title || value.embed_url}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
