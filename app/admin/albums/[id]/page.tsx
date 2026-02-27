'use client'

import { useState, useEffect, use, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { AlbumFull, TrackInAlbum } from '@/lib/supabase-albums'

const ALBUM_TYPE_FIELDS = [
  { key: 'type_studio', label: 'Studijinis', icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg> },
  { key: 'type_ep', label: 'EP', icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" /></svg> },
  { key: 'type_compilation', label: 'Kompiliacija', icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg> },
  { key: 'type_live', label: 'Gyvas', icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg> },
  { key: 'type_remix', label: 'Remix', icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> },
  { key: 'type_covers', label: 'Coveriai', icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg> },
  { key: 'type_holiday', label: 'Šventinis', icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg> },
  { key: 'type_soundtrack', label: 'Soundtrack', icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" /></svg> },
  { key: 'type_demo', label: 'Demo', icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg> },
]

type YTResult = { videoId: string; title: string; channel: string; thumbnail: string }

const emptyAlbum: AlbumFull = {
  title: '', artist_id: 0,
  year: undefined, month: undefined, day: undefined,
  type_studio: true, type_compilation: false, type_ep: false, type_single: false,
  type_live: false, type_remix: false, type_covers: false, type_holiday: false,
  type_soundtrack: false, type_demo: false,
  cover_image_url: '', spotify_id: '', video_url: '',
  show_artist_name: false, show_player: false, is_upcoming: false,
  tracks: [],
}

function extractYouTubeId(url: string): string {
  return url.match(/(?:v=|youtu\.be\/)([^&?]+)/)?.[1] || ''
}

// ── DateNumberInput ───────────────────────────────────────────────────────────
function DateNumberInput({ value, onChange, min, max, placeholder }: {
  value: number | undefined | null
  onChange: (v: number | null) => void; min: number; max: number; placeholder: string
}) {
  const [raw, setRaw] = useState(value ? String(value) : '')
  useEffect(() => { setRaw(value ? String(value) : '') }, [value])
  const commit = (s: string) => {
    const n = parseInt(s)
    if (!s || isNaN(n)) { onChange(null); setRaw('') }
    else if (n >= min && n <= max) { onChange(n); setRaw(String(n)) }
    else setRaw(value ? String(value) : '')
  }
  return (
    <input type="number" value={raw}
      onChange={e => setRaw(e.target.value)}
      onBlur={e => commit(e.target.value)}
      onKeyDown={e => e.key === 'Enter' && commit(raw)}
      placeholder={placeholder} min={min} max={max}
      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-blue-400 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
  )
}

// ── ArtistSearch ───────────────────────────────────────────────────────────────
function ArtistSearchInput({ placeholder = 'Ieškoti atlikėjo...', onSelect }: {
  placeholder?: string
  onSelect: (id: number, name: string) => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<any[]>([])
  useEffect(() => {
    if (q.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/artists?search=${encodeURIComponent(q)}&limit=6`)
      setResults((await res.json()).artists || [])
    }, 200)
    return () => clearTimeout(t)
  }, [q])
  return (
    <div className="relative">
      <input value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder}
        className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-blue-400 transition-colors" />
      {results.length > 0 && (
        <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-xl shadow-xl mt-1 overflow-hidden">
          {results.map(a => (
            <button key={a.id} type="button"
              onClick={() => { onSelect(a.id, a.name); setQ(''); setResults([]) }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-blue-50 text-left transition-colors">
              <span className="font-medium text-gray-900 text-sm">{a.name}</span>
              <span className="text-gray-400 text-xs ml-auto">{a.country}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── CoverImageField ───────────────────────────────────────────────────────────
function CoverImageField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [urlInput, setUrlInput] = useState(value || '')
  useEffect(() => { setUrlInput(value || '') }, [value])

  const handleFileUpload = async (file: File) => {
    setUploading(true); setUploadError('')
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload nepavyko')
      onChange(data.url); setUrlInput(data.url)
    } catch (e: any) { setUploadError(e.message) } finally { setUploading(false) }
  }

  const handleUrlCommit = async (raw: string) => {
    const v = raw.trim()
    if (!v || v === value) return
    if (v.startsWith('http') && !v.includes('supabase')) {
      setUploading(true); setUploadError('')
      try {
        const res = await fetch('/api/fetch-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: v }) })
        if (res.ok) {
          const data = await res.json()
          const u = data.url || data.dataUrl
          if (u && !u.startsWith('data:')) { onChange(u); setUrlInput(u); return }
        }
      } catch {} finally { setUploading(false) }
    }
    onChange(v)
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* Square cover preview — 96×96 */}
      <div
        className="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-200 bg-gray-100 cursor-pointer shrink-0 group"
        onClick={() => !uploading && fileRef.current?.click()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) handleFileUpload(f) }}
        onDragOver={e => e.preventDefault()}>
        {value ? (
          <>
            <img src={value} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover group-hover:opacity-80 transition-opacity" />
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 group-hover:text-blue-400 transition-colors">
            <svg className="w-7 h-7 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" /></svg>
            <span className="text-[10px]">Viršelis</span>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* URL input + buttons */}
      <div className="flex gap-1">
        <input type="text" value={urlInput} onChange={e => setUrlInput(e.target.value)}
          onBlur={e => handleUrlCommit(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleUrlCommit(urlInput)}
          placeholder="https://..." className="flex-1 min-w-0 px-2 py-1 border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:border-blue-400 bg-white" />
        <button type="button" onClick={() => fileRef.current?.click()}
          className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-lg text-xs transition-colors shrink-0" title="Įkelti failą">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
        </button>
        {value && (
          <button type="button" onClick={() => { onChange(''); setUrlInput('') }}
            className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-400 rounded-lg text-xs transition-colors shrink-0">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        )}
      </div>
      {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f) }} />
    </div>
  )
}

// ── YouTubeSearch ─────────────────────────────────────────────────────────────
function YouTubeSearch({ initialQuery, onSelect }: { initialQuery: string; onSelect: (url: string) => void }) {
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<YTResult[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => { setQuery(initialQuery) }, [initialQuery])
  const search = async () => {
    if (!query.trim()) return
    setLoading(true); setResults([])
    try { setResults((await (await fetch(`/api/search/youtube?q=${encodeURIComponent(query)}`)).json()).results || []) }
    finally { setLoading(false) }
  }
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Ieškoti YouTube..." className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-blue-400 bg-white" />
        <button type="button" onClick={search} disabled={loading}
          className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm disabled:opacity-50 transition-colors shrink-0">
          {loading
            ? <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          }
        </button>
      </div>
      {results.length > 0 && (
        <div className="rounded-lg border border-gray-100 overflow-hidden">
          {results.map(r => (
            <div key={r.videoId} onClick={() => { onSelect(`https://www.youtube.com/watch?v=${r.videoId}`); setResults([]) }}
              className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0">
              <img src={r.thumbnail} alt="" className="w-12 h-8 object-cover rounded shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-900 line-clamp-1">{r.title}</p>
                <p className="text-xs text-gray-400 truncate">{r.channel}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── TrackList ─────────────────────────────────────────────────────────────────
function TrackList({ tracks, isMobile, onAdd, onUpdate, onRemove, onHardDelete, onReorder, onSave }: {
  tracks: TrackInAlbum[]
  isMobile: boolean
  onAdd: () => void
  onUpdate: (i: number, f: keyof TrackInAlbum, v: any) => void
  onRemove: (i: number) => void
  onHardDelete: (i: number) => void
  onReorder: (from: number, to: number) => void
  onSave: () => void
}) {
  const dragIdx = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const onDragStart = (i: number) => { dragIdx.current = i }
  const onDragEnter = (i: number) => setDragOver(i)
  const onDragEnd = () => {
    if (dragIdx.current !== null && dragOver !== null && dragIdx.current !== dragOver)
      onReorder(dragIdx.current, dragOver)
    dragIdx.current = null; setDragOver(null)
  }

  return (
    <div>
      {tracks.map((t, i) => {
        const trackId = t.track_id || t.id
        const trackEditUrl = trackId ? `/admin/tracks/${trackId}` : null
        const hasVideo = !!(t.video_url)
        const hasLyrics = typeof (t as any).lyrics === 'string' && (t as any).lyrics.trim().length > 0
        const rawFeat = (t as any).featuring || []
        const featuring: string[] = Array.isArray(rawFeat) ? rawFeat.map((f: any) => typeof f === 'string' ? f : f.name || '').filter(Boolean) : []
        const isSaved = !!trackId

        return (
          <div key={i}
            draggable={!isMobile}
            onDragStart={() => !isMobile && onDragStart(i)}
            onDragEnter={() => !isMobile && onDragEnter(i)}
            onDragOver={e => { if (!isMobile) e.preventDefault() }}
            onDragEnd={() => !isMobile && onDragEnd()}
            className={`flex items-center gap-1.5 px-2.5 border-b border-gray-100 transition-colors group ${
              isMobile ? 'py-2' : 'py-1'
            } ${dragOver === i ? 'bg-blue-50 border-t-2 border-blue-400' : 'hover:bg-gray-50/80'} ${
              !isMobile ? 'cursor-grab active:cursor-grabbing' : ''
            }`}>

            {/* Reorder */}
            {isMobile ? (
              <div className="flex flex-col shrink-0">
                <button type="button" onClick={() => i > 0 && onReorder(i, i - 1)} disabled={i === 0}
                  className="w-5 h-4 flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-20">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                </button>
                <button type="button" onClick={() => i < tracks.length - 1 && onReorder(i, i + 1)} disabled={i === tracks.length - 1}
                  className="w-5 h-4 flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-20">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
              </div>
            ) : (
              <svg className="w-3.5 h-3.5 text-gray-300 hover:text-gray-500 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M8 6a2 2 0 100-4 2 2 0 000 4zm0 8a2 2 0 100-4 2 2 0 000 4zm0 8a2 2 0 100-4 2 2 0 000 4zm8-16a2 2 0 100-4 2 2 0 000 4zm0 8a2 2 0 100-4 2 2 0 000 4zm0 8a2 2 0 100-4 2 2 0 000 4z" /></svg>
            )}

            {/* Number */}
            <span className="text-xs text-gray-400 w-4 text-right shrink-0 tabular-nums">{i + 1}</span>

            {/* Title */}
            <div className="flex-1 min-w-0 flex items-baseline gap-1 flex-wrap">
              <input value={t.title} onChange={e => onUpdate(i, 'title', e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onSave() } }}
                placeholder="Dainos pavadinimas"
                size={t.title ? Math.max(8, t.title.length + 2) : 20}
                className="px-1 py-0.5 border border-transparent hover:border-gray-200 focus:border-blue-300 rounded text-sm text-gray-900 focus:outline-none bg-transparent focus:bg-white transition-all" />
              {featuring.length > 0 && (
                <span className="text-xs text-gray-400 leading-tight whitespace-nowrap">su {featuring.join(', ')}</span>
              )}
            </div>

            {/* Indicators */}
            {hasVideo && (
              <svg className="w-3 h-3 text-blue-400 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            )}
            {hasLyrics && <span className="text-green-500 text-xs font-bold shrink-0">T</span>}

            {/* Singlas */}
            <label className="flex items-center gap-0.5 cursor-pointer shrink-0">
              <input type="checkbox" checked={t.is_single || false}
                onChange={e => onUpdate(i, 'is_single', e.target.checked)}
                className="accent-blue-600 w-3 h-3" />
              <span className="text-xs text-gray-400">S</span>
            </label>

            {/* Edit link */}
            {trackEditUrl && (
              <a href={trackEditUrl} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="shrink-0 px-2 py-0.5 text-xs text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors font-medium whitespace-nowrap">
                {isMobile ? '↗' : 'Redaguoti ↗'}
              </a>
            )}

            {/* Remove from album */}
            <button type="button" onClick={() => onRemove(i)} title="Pašalinti iš albumo"
              className="w-5 h-5 flex items-center justify-center text-gray-300 hover:text-orange-500 hover:bg-orange-50 rounded transition-colors shrink-0 text-sm">
              ×
            </button>

            {/* Hard delete */}
            {isSaved && (
              <button type="button" onClick={() => onHardDelete(i)} title="Ištrinti dainą visiškai"
                className="w-5 h-5 flex items-center justify-center text-gray-300 hover:text-red-600 hover:bg-red-50 rounded transition-colors shrink-0 opacity-0 group-hover:opacity-100">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            )}
          </div>
        )
      })}

      {!tracks.length && (
        <div className="py-10 text-center">
          <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" /></svg>
          <p className="text-sm text-gray-400">Nėra dainų</p>
        </div>
      )}

      <div className="p-2.5">
        <button type="button" onClick={onAdd}
          className="w-full py-2 border-2 border-dashed border-gray-200 text-gray-400 rounded-xl text-sm hover:border-blue-300 hover:text-blue-500 active:bg-blue-50 transition-colors">
          + Pridėti dainą
        </button>
      </div>
    </div>
  )
}

function TracksHeader({ count }: { count: number }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-white sticky top-0 z-10">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-bold text-gray-700">Dainų sąrašas</span>
        <span className="bg-gray-200 text-gray-600 text-xs font-bold px-1.5 py-0.5 rounded-full">{count}</span>
      </div>
      <span className="text-xs text-gray-400 flex items-center gap-1">
        <svg className="w-3 h-3 text-blue-400" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
        video · T žodžiai · S singlas
      </span>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminAlbumEditPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const id = resolvedParams?.id
  const isNew = !id || id === 'new'
  const { data: session, status } = useSession()
  const router = useRouter()

  const [form, setForm] = useState<AlbumFull>(emptyAlbum)
  const [artistName, setArtistName] = useState('')
  const [artistId, setArtistId] = useState<number | null>(null)
  const [featuredArtists, setFeaturedArtists] = useState<{id: number; name: string}[]>([])
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [tab, setTab] = useState<'info' | 'tracks'>('info')
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'
  const set = (f: keyof AlbumFull, v: any) => setForm(p => ({ ...p, [f]: v }))

  useEffect(() => { if (status === 'unauthenticated') router.push('/') }, [status])

  useEffect(() => {
    if (!isNew && isAdmin) {
      fetch(`/api/albums/${id}`).then(r => r.json()).then(data => {
        setForm({ ...data, tracks: data.tracks || [] })
        if (data.artists?.name) { setArtistName(data.artists.name); setArtistId(data.artist_id) }
        if (data.featured_artists) setFeaturedArtists(data.featured_artists)
      })
    }
  }, [id, isAdmin])

  const setType = (key: string) => {
    const reset = Object.fromEntries(ALBUM_TYPE_FIELDS.map(t => [t.key, false]))
    setForm(p => ({ ...p, ...reset, [key]: true }))
  }

  const addTrack = () => setForm(p => ({
    ...p,
    tracks: [...(p.tracks || []), { title: '', sort_order: (p.tracks?.length || 0) + 1, type: 'normal', disc_number: 1 }]
  }))

  const upTrack = (i: number, f: keyof TrackInAlbum, v: any) => {
    const t = [...(form.tracks || [])]; t[i] = { ...t[i], [f]: v }; set('tracks', t)
  }

  const rmTrack = (i: number) => {
    const t = (form.tracks || []).filter((_, idx) => idx !== i)
    t.forEach((tr, idx) => { tr.sort_order = idx + 1 })
    set('tracks', t)
  }

  const hardDeleteTrack = async (i: number) => {
    const t = form.tracks?.[i]
    const trackId = t?.track_id || t?.id
    const name = t?.title || 'šią dainą'
    if (!confirm(`Visiškai ištrinti dainą "${name}"? Šios operacijos negalima atšaukti.`)) return
    if (trackId) {
      try { await fetch(`/api/tracks/${trackId}`, { method: 'DELETE' }) }
      catch (e: any) { setError(e.message); return }
    }
    rmTrack(i)
  }

  const reorderTracks = (from: number, to: number) => {
    const t = [...(form.tracks || [])]
    const [item] = t.splice(from, 1)
    t.splice(to, 0, item)
    t.forEach((tr, idx) => { tr.sort_order = idx + 1 })
    set('tracks', t)
  }

  const handleSubmit = useCallback(async () => {
    if (!form.title.trim()) { setError('Pavadinimas privalomas'); return }
    if (!form.artist_id) { setError('Pasirinkite atlikėją'); return }
    setSaving(true); setError('')
    try {
      const payload = { ...form, featured_artist_ids: featuredArtists.map(a => a.id) }
      const res = await fetch(isNew ? '/api/albums' : `/api/albums/${id}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSaved(true); setTimeout(() => setSaved(false), 2000)
      if (isNew) router.push(`/admin/albums/${data.id}`)
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }, [form, id, isNew, featuredArtists])

  const handleDelete = async () => {
    if (!confirm(`Ištrinti albumą "${form.title}"?`)) return
    setDeleting(true)
    try {
      await fetch(`/api/albums/${id}`, { method: 'DELETE' })
      router.push(artistId ? `/admin/artists/${artistId}` : '/admin/albums')
    } catch (e: any) { setError(e.message) } finally { setDeleting(false) }
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); handleSubmit() } }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [handleSubmit])

  const ytId = extractYouTubeId(form.video_url || '')
  const ytSearchQuery = [artistName, form.title].filter(Boolean).join(' ')
  const CY = new Date().getFullYear()

  if (status === 'loading' || !isAdmin) return null

  const InfoPanel = (
    <div className="space-y-2.5 p-3 pb-4">
      {/* Main info card */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-2.5">
        {/* Title + Date */}
        <div className="grid grid-cols-[1fr_auto] gap-3 items-start">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Pavadinimas *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Albumo pavadinimas"
              className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-900 text-sm font-medium focus:outline-none focus:border-blue-400 bg-white transition-colors" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Data</label>
            <div className="flex gap-1">
              <div className="w-16"><DateNumberInput value={form.year} onChange={v => set('year', v)} min={1900} max={CY + 2} placeholder="Metai" /></div>
              <div className="w-10"><DateNumberInput value={form.month} onChange={v => set('month', v)} min={1} max={12} placeholder="Mėn" /></div>
              <div className="w-9"><DateNumberInput value={form.day} onChange={v => set('day', v)} min={1} max={31} placeholder="D" /></div>
            </div>
          </div>
        </div>

        {/* Artists */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Atlikėjai *</label>
          <div className="flex flex-wrap items-center gap-1.5">
            {form.artist_id ? (
              <div className="flex items-center gap-1 bg-blue-100 text-blue-800 border border-blue-200 rounded-full px-2.5 py-1 text-sm font-semibold shrink-0">
                {artistName}
                <button type="button" onClick={() => { set('artist_id', 0); setArtistName(''); setArtistId(null) }}
                  className="text-blue-400 hover:text-red-500 transition-colors leading-none ml-0.5 text-base">×</button>
              </div>
            ) : (
              <div className="flex-1 min-w-[140px]">
                <ArtistSearchInput placeholder="Pagrindinis atlikėjas..." onSelect={(id, name) => { set('artist_id', id); setArtistName(name); setArtistId(id) }} />
              </div>
            )}
            {featuredArtists.map((a, i) => (
              <div key={a.id} className="flex items-center gap-1 bg-gray-100 text-gray-700 border border-gray-200 rounded-full px-2 py-1 text-xs shrink-0">
                <span className="text-gray-400">su</span>
                {a.name}
                <button type="button" onClick={() => setFeaturedArtists(p => p.filter((_, j) => j !== i))}
                  className="text-gray-400 hover:text-red-500 transition-colors leading-none ml-0.5">×</button>
              </div>
            ))}
            {form.artist_id && (
              <div className="flex-1 min-w-[120px]">
                <ArtistSearchInput placeholder="+ su atlikėju..."
                  onSelect={(id, name) => {
                    if (id === form.artist_id) return
                    if (!featuredArtists.find(a => a.id === id))
                      setFeaturedArtists(p => [...p, { id, name }])
                  }} />
              </div>
            )}
          </div>
        </div>

        {/* Type */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Tipas</label>
          <div className="flex flex-wrap gap-1">
            {ALBUM_TYPE_FIELDS.map(t => (
              <button key={t.key} type="button" onClick={() => setType(t.key)}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                  (form as any)[t.key] ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Media card */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Media</p>
        <div className="grid grid-cols-2 gap-3">
          {/* Cover */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1.5">Viršelis</p>
            <CoverImageField value={form.cover_image_url || ''} onChange={url => set('cover_image_url', url)} />
          </div>

          {/* YouTube + Spotify */}
          <div className="space-y-2.5 min-w-0">
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                <svg className="w-3.5 h-3.5 text-red-500" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                YouTube
              </p>
              <div className="flex gap-1 mb-1">
                <input value={form.video_url || ''} onChange={e => set('video_url', e.target.value)}
                  placeholder="youtube.com/watch?v=..."
                  className="flex-1 min-w-0 px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:border-blue-400 bg-white" />
                {ytId && (
                  <button type="button" onClick={() => set('video_url', '')}
                    className="px-2 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg text-xs transition-colors shrink-0">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
              </div>
              {ytId && (
                <a href={form.video_url || ''} target="_blank" rel="noopener noreferrer"
                  className="block relative rounded-lg overflow-hidden group mb-1">
                  <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt=""
                    className="w-full aspect-video object-cover group-hover:opacity-90 transition-opacity" />
                  <span className="absolute bottom-1 right-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">↗</span>
                </a>
              )}
              <YouTubeSearch initialQuery={ytSearchQuery} onSelect={url => set('video_url', url)} />
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                <svg className="w-3.5 h-3.5 text-green-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
                Spotify
              </p>
              <input value={form.spotify_id || ''} onChange={e => set('spotify_id', e.target.value)}
                placeholder="Album ID..."
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-gray-900 text-xs focus:outline-none focus:border-blue-400 font-mono transition-colors" />
              {form.spotify_id && (
                <a href={`https://open.spotify.com/album/${form.spotify_id}`} target="_blank" rel="noopener noreferrer"
                  className="mt-1 flex items-center gap-1 text-xs text-green-600 hover:text-green-700 transition-colors">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  Atidaryti Spotify
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  const trackCount = form.tracks?.length || 0

  return (
    <div className="min-h-screen bg-[#f8f7f5]">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="flex items-center justify-between gap-3 px-4 py-2">
          <nav className="flex items-center gap-1 text-sm min-w-0">
            <Link href="/admin" className="text-gray-400 hover:text-gray-700 shrink-0">Admin</Link>
            {artistName && artistId && <>
              <span className="text-gray-300">/</span>
              <Link href={`/admin/artists/${artistId}`} className="text-gray-400 hover:text-gray-700 shrink-0">{artistName}</Link>
            </>}
            <span className="text-gray-300">/</span>
            <Link href={artistId ? `/admin/albums?artist=${artistId}` : "/admin/albums"} className="text-gray-400 hover:text-gray-700 shrink-0">Albumai</Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-800 font-semibold truncate max-w-[160px]">{isNew ? 'Naujas' : (form.title || '...')}</span>
          </nav>
          <div className="flex items-center gap-1.5 shrink-0">
            {!isNew && (
              <button onClick={handleDelete} disabled={deleting}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-red-500 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                <span className="hidden sm:inline">Ištrinti</span>
              </button>
            )}
            <Link href={artistId ? `/admin/artists/${artistId}` : '/admin/albums'}
              className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
              Atšaukti
            </Link>
            <button onClick={handleSubmit} disabled={saving}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${saved ? 'bg-green-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'} disabled:opacity-50`}>
              {saving
                ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" /> Saugoma...</>
                : saved
                ? <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> Išsaugota!</>
                : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> Išsaugoti</>
              }
            </button>
          </div>
        </div>

        {/* Mobile tabs */}
        <div className="flex lg:hidden border-t border-gray-100">
          <button onClick={() => setTab('info')}
            className={`flex-1 py-2 text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${tab === 'info' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-gray-500'}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
            Informacija
          </button>
          <button onClick={() => setTab('tracks')}
            className={`flex-1 py-2 text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${tab === 'tracks' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-gray-500'}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" /></svg>
            Dainos {trackCount > 0 && <span className="bg-gray-200 text-gray-700 text-xs font-bold px-1.5 py-0.5 rounded-full">{trackCount}</span>}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 pt-2">
          <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {error}
            <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}

      {/* Mobile */}
      <div className="lg:hidden">
        {tab === 'info' && InfoPanel}
        {tab === 'tracks' && (
          <div className="bg-white min-h-screen">
            <TracksHeader count={trackCount} />
            <TrackList tracks={form.tracks || []} isMobile={true}
              onAdd={addTrack} onUpdate={upTrack} onRemove={rmTrack} onHardDelete={hardDeleteTrack} onReorder={reorderTracks} onSave={handleSubmit} />
          </div>
        )}
      </div>

      {/* Desktop 50/50 */}
      <div className="hidden lg:grid lg:grid-cols-2 items-start">
        <div className="border-r border-gray-200">{InfoPanel}</div>
        <div className="bg-[#f8f7f5] sticky top-[41px]" style={{ height: 'calc(100vh - 41px)', overflowY: 'auto' }}>
          <div className="m-3 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <TracksHeader count={trackCount} />
            <TrackList tracks={form.tracks || []} isMobile={false}
              onAdd={addTrack} onUpdate={upTrack} onRemove={rmTrack} onHardDelete={hardDeleteTrack} onReorder={reorderTracks} onSave={handleSubmit} />
          </div>
        </div>
      </div>
    </div>
  )
}
