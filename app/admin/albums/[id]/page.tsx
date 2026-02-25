'use client'

import { useState, useEffect, use, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { AlbumFull, TrackInAlbum } from '@/lib/supabase-albums'

const ALBUM_TYPE_FIELDS = [
  { key: 'type_studio', label: 'Studijinis', icon: '🎵' },
  { key: 'type_ep', label: 'EP', icon: '🎼' },
  { key: 'type_compilation', label: 'Kompiliacija', icon: '📀' },
  { key: 'type_live', label: 'Gyvas', icon: '🎸' },
  { key: 'type_remix', label: 'Remix', icon: '🔄' },
  { key: 'type_covers', label: 'Coveriai', icon: '🎭' },
  { key: 'type_holiday', label: 'Šventinis', icon: '🎄' },
  { key: 'type_soundtrack', label: 'Soundtrack', icon: '🎬' },
  { key: 'type_demo', label: 'Demo', icon: '🎙️' },
]

const TRACK_TYPES = ['normal', 'remix', 'live', 'mashup', 'instrumental'] as const

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

// ── Number input for year/month/day ──────────────────────────────────────────
function DateNumberInput({
  label, value, onChange, min, max, placeholder,
}: { label: string; value: number | undefined | null; onChange: (v: number | null) => void; min: number; max: number; placeholder: string }) {
  const [raw, setRaw] = useState(value ? String(value) : '')
  useEffect(() => { setRaw(value ? String(value) : '') }, [value])

  const commit = (s: string) => {
    const n = parseInt(s)
    if (!s || isNaN(n)) { onChange(null); setRaw('') }
    else if (n >= min && n <= max) { onChange(n); setRaw(String(n)) }
    else { setRaw(value ? String(value) : '') } // revert invalid
  }

  return (
    <div>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <input
        type="number" value={raw}
        onChange={e => setRaw(e.target.value)}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && commit(raw)}
        placeholder={placeholder} min={min} max={max}
        className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-blue-400 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
    </div>
  )
}

// ── Cover Image Field ─────────────────────────────────────────────────────────
function CoverImageField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [urlInput, setUrlInput] = useState(value || '')

  useEffect(() => { setUrlInput(value || '') }, [value])

  const handleFileUpload = async (file: File) => {
    setUploading(true); setUploadError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
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
        const res = await fetch('/api/fetch-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: v }),
        })
        if (res.ok) {
          const data = await res.json()
          const uploadedUrl = data.url || data.dataUrl
          if (uploadedUrl && !uploadedUrl.startsWith('data:')) {
            onChange(uploadedUrl); setUrlInput(uploadedUrl); return
          }
        }
      } catch {} finally { setUploading(false) }
    }
    onChange(v)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file?.type.startsWith('image/')) handleFileUpload(file)
  }

  return (
    <div className="flex gap-3 items-start">
      <div
        className="relative w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 overflow-hidden bg-gray-50 cursor-pointer group hover:border-blue-400 transition-colors shrink-0"
        onClick={() => !uploading && fileRef.current?.click()}
        onDrop={handleDrop} onDragOver={e => e.preventDefault()}
      >
        {value
          ? <><img src={value} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="text-white text-xs">Keisti</span>
              </div></>
          : <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-1">
              <span className="text-xl">💿</span>
              <span className="text-xs">Spausti</span>
            </div>}
        {uploading && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
      <div className="flex-1 space-y-1.5 min-w-0">
        <input type="text" value={urlInput}
          onChange={e => setUrlInput(e.target.value)}
          onBlur={e => handleUrlCommit(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleUrlCommit(urlInput)}
          placeholder="https://... arba spausti viršelį"
          className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:border-blue-400 bg-white" />
        <div className="flex gap-1.5">
          <button type="button" onClick={() => fileRef.current?.click()}
            className="flex-1 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-xs font-medium transition-colors">
            📁 Įkelti
          </button>
          {value && (
            <button type="button" onClick={() => { onChange(''); setUrlInput('') }}
              className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg text-xs transition-colors">✕</button>
          )}
        </div>
        {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f) }} />
    </div>
  )
}

// ── YouTube Search ────────────────────────────────────────────────────────────
function YouTubeSearch({ initialQuery, onSelect }: { initialQuery: string; onSelect: (url: string) => void }) {
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<YTResult[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => { setQuery(initialQuery) }, [initialQuery])

  const search = async () => {
    if (!query.trim()) return
    setLoading(true); setResults([])
    try {
      const r = await fetch(`/api/search/youtube?q=${encodeURIComponent(query)}`)
      setResults((await r.json()).results || [])
    } finally { setLoading(false) }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input value={query} onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Ieškoti YouTube..."
          className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400 bg-white" />
        <button type="button" onClick={search} disabled={loading}
          className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm disabled:opacity-50 transition-colors shrink-0">
          {loading ? <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : '🔍'}
        </button>
      </div>
      {results.length > 0 && (
        <div className="rounded-xl border border-gray-100 overflow-hidden">
          {results.map(r => (
            <div key={r.videoId} onClick={() => { onSelect(`https://www.youtube.com/watch?v=${r.videoId}`); setResults([]) }}
              className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-blue-50 active:bg-blue-100 transition-colors border-b border-gray-50 last:border-0">
              <img src={r.thumbnail} alt="" className="w-14 h-9 object-cover rounded shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-900 line-clamp-2 leading-tight">{r.title}</p>
                <p className="text-xs text-gray-400 truncate">{r.channel}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tracklist ─────────────────────────────────────────────────────────────────
function TrackList({
  tracks, isMobile, onAdd, onUpdate, onRemove, onReorder,
}: {
  tracks: TrackInAlbum[]
  isMobile: boolean
  onAdd: () => void
  onUpdate: (i: number, f: keyof TrackInAlbum, v: any) => void
  onRemove: (i: number) => void
  onReorder: (from: number, to: number) => void
}) {
  // Desktop: drag-and-drop
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
        const trackEditUrl = (t.track_id || t.id) ? `/admin/tracks/${t.track_id || t.id}` : null
        const hasVideo = !!(t.video_url)
        const hasLyrics = !!(t as any).has_lyrics
        const featuring: string[] = (t as any).featuring || []

        return (
          <div
            key={i}
            draggable={!isMobile}
            onDragStart={() => !isMobile && onDragStart(i)}
            onDragEnter={() => !isMobile && onDragEnter(i)}
            onDragOver={e => { if (!isMobile) e.preventDefault() }}
            onDragEnd={() => !isMobile && onDragEnd()}
            className={`flex items-center gap-2 px-3 border-b border-gray-100 transition-colors ${
              isMobile ? 'py-3' : 'py-1.5'
            } ${dragOver === i ? 'bg-blue-50 border-t-2 border-blue-400' : 'hover:bg-gray-50'} ${
              !isMobile ? 'cursor-grab active:cursor-grabbing' : ''
            }`}
          >
            {/* Reorder: drag handle on desktop, up/down buttons on mobile */}
            {isMobile ? (
              <div className="flex flex-col gap-0.5 shrink-0">
                <button type="button" onClick={() => i > 0 && onReorder(i, i - 1)}
                  disabled={i === 0}
                  className="w-6 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs rounded transition-colors">▲</button>
                <button type="button" onClick={() => i < tracks.length - 1 && onReorder(i, i + 1)}
                  disabled={i === tracks.length - 1}
                  className="w-6 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs rounded transition-colors">▼</button>
              </div>
            ) : (
              <span className="text-gray-300 hover:text-gray-500 select-none text-sm shrink-0 w-4">⠿</span>
            )}

            {/* Number */}
            <span className="text-xs text-gray-400 w-5 text-right shrink-0 tabular-nums">{i + 1}</span>

            {/* Title + featuring */}
            <div className="flex-1 min-w-0">
              <input value={t.title} onChange={e => onUpdate(i, 'title', e.target.value)}
                placeholder="Dainos pavadinimas"
                size={Math.max(10, t.title?.length || 10)}
                className="px-1.5 py-0.5 border border-transparent hover:border-gray-200 focus:border-blue-300 rounded-lg text-sm text-gray-900 focus:outline-none bg-transparent focus:bg-white transition-all max-w-full" />
              {featuring.length > 0 && (
                <p className="text-xs text-gray-400 px-1.5 truncate">feat. {featuring.join(', ')}</p>
              )}
            </div>

            {/* Indicators */}
            {hasVideo && <span className="text-blue-400 text-xs shrink-0" title="Video">▶</span>}
            {hasLyrics && <span className="text-green-500 text-xs font-bold shrink-0" title="Žodžiai">T</span>}

            {/* Singlas */}
            <label className="flex items-center gap-1 cursor-pointer shrink-0">
              <input type="checkbox" checked={t.is_single || false}
                onChange={e => onUpdate(i, 'is_single', e.target.checked)}
                className="accent-blue-600 w-3.5 h-3.5" />
              <span className="text-xs text-gray-400">S</span>
            </label>

            {/* Edit link — always visible, clear text on desktop */}
            {trackEditUrl && (
              <a href={trackEditUrl} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className={`shrink-0 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors font-medium ${
                  isMobile ? 'px-2 py-1 text-xs' : 'px-2.5 py-1 text-xs'
                }`}>
                {isMobile ? '↗' : 'Redaguoti ↗'}
              </a>
            )}

            {/* Delete */}
            <button type="button" onClick={() => onRemove(i)}
              className="w-7 h-7 flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0">
              ✕
            </button>
          </div>
        )
      })}

      {!tracks.length && (
        <div className="py-12 text-center">
          <span className="text-4xl block mb-2">🎵</span>
          <p className="text-sm text-gray-400">Nėra dainų</p>
        </div>
      )}

      <div className="p-3">
        <button type="button" onClick={onAdd}
          className="w-full py-3 border-2 border-dashed border-gray-200 text-gray-400 rounded-xl text-sm hover:border-blue-300 hover:text-blue-500 active:bg-blue-50 transition-colors">
          + Pridėti dainą
        </button>
      </div>
    </div>
  )
}

// ── Tracks header ─────────────────────────────────────────────────────────────
function TracksHeader({ count }: { count: number }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50/80 sticky top-0 z-10">
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-gray-700">Dainų sąrašas</span>
        <span className="bg-gray-200 text-gray-600 text-xs font-bold px-2 py-0.5 rounded-full">{count}</span>
      </div>
      <span className="text-xs text-gray-400">▶ video · T žodžiai · S singlas</span>
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
  const [artistSearch, setArtistSearch] = useState('')
  const [artistResults, setArtistResults] = useState<any[]>([])
  const [artistName, setArtistName] = useState('')
  const [artistId, setArtistId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [tab, setTab] = useState<'info' | 'tracks'>('info')
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024)
    check()
    window.addEventListener('resize', check)
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
      })
    }
  }, [id, isAdmin])

  useEffect(() => {
    if (artistSearch.length < 2) { setArtistResults([]); return }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/artists?search=${encodeURIComponent(artistSearch)}&limit=6`)
      const data = await res.json()
      setArtistResults(data.artists || [])
    }, 200)
    return () => clearTimeout(t)
  }, [artistSearch])

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
      const res = await fetch(isNew ? '/api/albums' : `/api/albums/${id}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSaved(true); setTimeout(() => setSaved(false), 2000)
      if (isNew) router.push(`/admin/albums/${data.id}`)
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }, [form, id, isNew])

  const handleDelete = async () => {
    if (!confirm(`Ištrinti albumą "${form.title}"?`)) return
    setDeleting(true)
    try {
      await fetch(`/api/albums/${id}`, { method: 'DELETE' })
      router.push(artistId ? `/admin/artists/${artistId}` : '/admin/albums')
    } catch (e: any) { setError(e.message) } finally { setDeleting(false) }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); handleSubmit() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSubmit])

  const activeType = ALBUM_TYPE_FIELDS.find(t => (form as any)[t.key])
  const ytId = extractYouTubeId(form.video_url || '')
  const ytSearchQuery = [artistName, form.title].filter(Boolean).join(' ')
  const CY = new Date().getFullYear()

  if (status === 'loading' || !isAdmin) return null

  // ── Info panel ──────────────────────────────────────────────────────────────
  const InfoPanel = (
    <div className="space-y-3 p-4">

      {/* Pagrindinė info – compact, no blue summary card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        {/* Title + artist inline-ish */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Pavadinimas *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)}
              placeholder="Flamingo"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-gray-900 text-sm font-medium focus:outline-none focus:border-blue-400 bg-white transition-colors" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Atlikėjas *</label>
            {form.artist_id ? (
              <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-xl px-2.5 py-2">
                <span className="flex-1 text-sm font-semibold text-gray-900 truncate">{artistName}</span>
                <button type="button" onClick={() => { set('artist_id', 0); setArtistName(''); setArtistId(null) }}
                  className="text-gray-400 hover:text-red-500 transition-colors text-lg leading-none shrink-0">×</button>
              </div>
            ) : (
              <div className="relative">
                <input type="text" value={artistSearch} onChange={e => setArtistSearch(e.target.value)}
                  placeholder="Ieškoti..."
                  className="w-full px-2.5 py-2 border border-gray-200 rounded-xl text-gray-900 text-sm focus:outline-none focus:border-blue-400 transition-colors" />
                {artistResults.length > 0 && (
                  <div className="absolute z-20 w-full bg-white border border-gray-200 rounded-xl shadow-xl mt-1 overflow-hidden">
                    {artistResults.map(a => (
                      <button key={a.id} type="button"
                        onClick={() => { set('artist_id', a.id); setArtistName(a.name); setArtistId(a.id); setArtistSearch(''); setArtistResults([]) }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-blue-50 text-left transition-colors">
                        <span className="font-semibold text-gray-900 text-sm">{a.name}</span>
                        <span className="text-gray-400 text-xs ml-auto">{a.country}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Date as number inputs */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Išleidimo data</label>
          <div className="grid grid-cols-3 gap-2">
            <DateNumberInput label="Metai" value={form.year} onChange={v => set('year', v)} min={1900} max={CY + 2} placeholder="2010" />
            <DateNumberInput label="Mėnuo" value={form.month} onChange={v => set('month', v)} min={1} max={12} placeholder="9" />
            <DateNumberInput label="Diena" value={form.day} onChange={v => set('day', v)} min={1} max={31} placeholder="3" />
          </div>
        </div>

        {/* Type */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Tipas</label>
          <div className="flex flex-wrap gap-1.5">
            {ALBUM_TYPE_FIELDS.map(t => (
              <button key={t.key} type="button" onClick={() => setType(t.key)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  (form as any)[t.key] ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300'
                }`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Viršelis */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Viršelis</p>
        <CoverImageField value={form.cover_image_url || ''} onChange={url => set('cover_image_url', url)} />
      </div>

      {/* YouTube */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">🎬 YouTube</p>
        {ytId ? (
          <div className="space-y-2 mb-3">
            <div className="aspect-video rounded-xl overflow-hidden bg-black">
              <iframe src={`https://www.youtube.com/embed/${ytId}`} className="w-full h-full" allowFullScreen />
            </div>
            <div className="flex gap-1.5">
              <input value={form.video_url || ''} onChange={e => set('video_url', e.target.value)}
                className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:border-blue-400 bg-white" />
              <button type="button" onClick={() => set('video_url', '')}
                className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg text-xs transition-colors">✕</button>
            </div>
          </div>
        ) : (
          <input value={form.video_url || ''} onChange={e => set('video_url', e.target.value)}
            placeholder="https://youtube.com/watch?v=..."
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-blue-400 bg-white mb-3" />
        )}
        <YouTubeSearch initialQuery={ytSearchQuery} onSelect={url => set('video_url', url)} />
      </div>

      {/* Spotify */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">🎧 Spotify</p>
        <input value={form.spotify_id || ''} onChange={e => set('spotify_id', e.target.value)}
          placeholder="Spotify album ID..."
          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-gray-900 text-sm focus:outline-none focus:border-blue-400 font-mono transition-colors" />
        {form.spotify_id && (
          <a href={`https://open.spotify.com/album/${form.spotify_id}`} target="_blank" rel="noopener noreferrer"
            className="mt-2 flex items-center gap-1.5 text-xs text-green-600 hover:text-green-700 transition-colors">
            🔗 Atidaryti Spotify
          </a>
        )}
      </div>
    </div>
  )

  const trackCount = form.tracks?.length || 0

  return (
    <div className="min-h-screen bg-[#f8f7f5]">
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-gray-200">
        {/* Single compact bar: breadcrumbs left, actions right */}
        <div className="flex items-center justify-between gap-3 px-4 py-2">
          <nav className="flex items-center gap-1 text-sm min-w-0 flex-wrap">
            <Link href="/admin" className="text-gray-400 hover:text-gray-700 shrink-0">Admin</Link>
            <span className="text-gray-300">/</span>
            <Link href="/admin/albums" className="text-gray-400 hover:text-gray-700 shrink-0">Albumai</Link>
            {artistName && artistId && (
              <>
                <span className="text-gray-300">/</span>
                <Link href={`/admin/artists/${artistId}`} className="text-gray-400 hover:text-gray-700 truncate max-w-[80px]">{artistName}</Link>
              </>
            )}
            <span className="text-gray-300">/</span>
            <span className="text-gray-800 font-semibold truncate max-w-[120px]">
              {isNew ? 'Naujas' : (form.title || '...')}
            </span>
          </nav>
          <div className="flex items-center gap-1.5 shrink-0">
            {!isNew && (
              <button onClick={handleDelete} disabled={deleting}
                className="flex items-center gap-1 px-2.5 py-1.5 text-red-500 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                🗑️ <span className="hidden sm:inline">Ištrinti</span>
              </button>
            )}
            <Link href={artistId ? `/admin/artists/${artistId}` : '/admin/albums'}
              className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
              Atšaukti
            </Link>
            <button onClick={handleSubmit} disabled={saving}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${
                saved ? 'bg-green-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
              } disabled:opacity-50`}>
              {saving
                ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" /> Saugoma...</>
                : saved ? '✓ Išsaugota!' : '✓ Išsaugoti'}
            </button>
          </div>
        </div>

        {/* Mobile tabs */}
        <div className="flex lg:hidden border-t border-gray-100">
          <button onClick={() => setTab('info')}
            className={`flex-1 py-2 text-sm font-semibold transition-colors ${
              tab === 'info' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-gray-500'
            }`}>
            📋 Informacija
          </button>
          <button onClick={() => setTab('tracks')}
            className={`flex-1 py-2 text-sm font-semibold transition-colors ${
              tab === 'tracks' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-gray-500'
            }`}>
            🎵 Dainos {trackCount > 0 && <span className="ml-1 bg-gray-200 text-gray-700 text-xs font-bold px-1.5 py-0.5 rounded-full">{trackCount}</span>}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 pt-3">
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-center gap-2">
            ❌ {error}
            <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">✕</button>
          </div>
        </div>
      )}

      {/* ── MOBILE: Tab view ── */}
      <div className="lg:hidden">
        {tab === 'info' && InfoPanel}
        {tab === 'tracks' && (
          <div className="bg-white min-h-screen">
            <TracksHeader count={trackCount} />
            <TrackList
              tracks={form.tracks || []}
              isMobile={true}
              onAdd={addTrack}
              onUpdate={upTrack}
              onRemove={rmTrack}
              onReorder={reorderTracks}
            />
          </div>
        )}
      </div>

      {/* ── DESKTOP: Side by side 40/60 ── */}
      <div className="hidden lg:grid lg:grid-cols-[2fr_3fr]">
        <div className="border-r border-gray-200 overflow-y-auto" style={{ height: 'calc(100vh - 41px)', position: 'sticky', top: '41px' }}>
          {InfoPanel}
        </div>
        <div className="bg-white overflow-y-auto" style={{ height: 'calc(100vh - 41px)', position: 'sticky', top: '41px' }}>
          <TracksHeader count={trackCount} />
          <TrackList
            tracks={form.tracks || []}
            isMobile={false}
            onAdd={addTrack}
            onUpdate={upTrack}
            onRemove={rmTrack}
            onReorder={reorderTracks}
          />
        </div>
      </div>
    </div>
  )
}
