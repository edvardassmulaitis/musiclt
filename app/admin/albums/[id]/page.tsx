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
function DateNumberInput({ label, value, onChange, min, max, placeholder }: {
  label: string; value: number | undefined | null
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
    <div>
      {label && <p className="text-xs text-gray-400 mb-1">{label}</p>}
      <input type="number" value={raw}
        onChange={e => setRaw(e.target.value)}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && commit(raw)}
        placeholder={placeholder} min={min} max={max}
        className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-blue-400 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
    </div>
  )
}

// ── ArtistSearch (reusable for main + featured) ───────────────────────────────
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
    <div className="flex gap-3 items-start">
      <div className="relative w-16 h-16 rounded-lg border-2 border-dashed border-gray-200 overflow-hidden bg-gray-50 cursor-pointer group hover:border-blue-400 transition-colors shrink-0"
        onClick={() => !uploading && fileRef.current?.click()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) handleFileUpload(f) }}
        onDragOver={e => e.preventDefault()}>
        {value
          ? <><img src={value} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="text-white text-xs">Keisti</span></div></>
          : <div className="w-full h-full flex items-center justify-center text-gray-400"><span className="text-xl">💿</span></div>}
        {uploading && <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>}
      </div>
      <div className="flex-1 space-y-1.5 min-w-0">
        <input type="text" value={urlInput} onChange={e => setUrlInput(e.target.value)}
          onBlur={e => handleUrlCommit(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleUrlCommit(urlInput)}
          placeholder="https://..." className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:border-blue-400 bg-white" />
        <div className="flex gap-1.5">
          <button type="button" onClick={() => fileRef.current?.click()}
            className="flex-1 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-xs font-medium transition-colors">📁 Įkelti</button>
          {value && <button type="button" onClick={() => { onChange(''); setUrlInput('') }}
            className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg text-xs transition-colors">✕</button>}
        </div>
        {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
      </div>
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
          {loading ? <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : '🔍'}
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
function TrackList({ tracks, isMobile, onAdd, onUpdate, onRemove, onHardDelete, onReorder }: {
  tracks: TrackInAlbum[]
  isMobile: boolean
  onAdd: () => void
  onUpdate: (i: number, f: keyof TrackInAlbum, v: any) => void
  onRemove: (i: number) => void          // remove from album only
  onHardDelete: (i: number) => void      // delete track from DB
  onReorder: (from: number, to: number) => void
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
        // T icon: true if lyrics text exists and is non-empty
        const hasLyrics = typeof (t as any).lyrics === 'string' && (t as any).lyrics.trim().length > 0
        // Featuring: check multiple possible structures
        const rawFeat = (t as any).featuring || (t as any).featuring_artists || (t as any).track_artists?.filter((ta: any) => ta.role === 'featuring').map((ta: any) => ta.artists?.name || ta.name) || []
        const featuring: string[] = Array.isArray(rawFeat) ? rawFeat.map((f: any) => typeof f === 'string' ? f : f.name || f.artists?.name || '').filter(Boolean) : []
        const isSaved = !!trackId  // track exists in DB

        return (
          <div key={i}
            draggable={!isMobile}
            onDragStart={() => !isMobile && onDragStart(i)}
            onDragEnter={() => !isMobile && onDragEnter(i)}
            onDragOver={e => { if (!isMobile) e.preventDefault() }}
            onDragEnd={() => !isMobile && onDragEnd()}
            className={`flex items-center gap-1.5 px-2.5 border-b border-gray-100 transition-colors group ${
              isMobile ? 'py-2.5' : 'py-1'
            } ${dragOver === i ? 'bg-blue-50 border-t-2 border-blue-400' : 'hover:bg-gray-50/80'} ${
              !isMobile ? 'cursor-grab active:cursor-grabbing' : ''
            }`}
          >
            {/* Reorder */}
            {isMobile ? (
              <div className="flex flex-col shrink-0">
                <button type="button" onClick={() => i > 0 && onReorder(i, i - 1)} disabled={i === 0}
                  className="w-5 h-4 flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs">▲</button>
                <button type="button" onClick={() => i < tracks.length - 1 && onReorder(i, i + 1)} disabled={i === tracks.length - 1}
                  className="w-5 h-4 flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs">▼</button>
              </div>
            ) : (
              <span className="text-gray-300 hover:text-gray-500 select-none text-sm shrink-0 w-3.5">⠿</span>
            )}

            {/* Number */}
            <span className="text-xs text-gray-400 w-4 text-right shrink-0 tabular-nums">{i + 1}</span>

            {/* Title + featuring inline */}
            <div className="flex-1 min-w-0 flex items-baseline gap-1 flex-wrap">
              <input value={t.title} onChange={e => onUpdate(i, 'title', e.target.value)}
                placeholder="Dainos pavadinimas"
                size={Math.max(8, (t.title?.length || 0) + 2)}
                className="px-1 py-0.5 border border-transparent hover:border-gray-200 focus:border-blue-300 rounded text-sm text-gray-900 focus:outline-none bg-transparent focus:bg-white transition-all" />
              {featuring.length > 0 && (
                <span className="text-xs text-gray-400 leading-tight whitespace-nowrap">feat. {featuring.join(', ')}</span>
              )}
            </div>

            {/* Indicators */}
            {hasVideo && <span className="text-blue-400 text-xs shrink-0" title="Video">▶</span>}
            {hasLyrics && <span className="text-green-500 text-xs font-bold shrink-0" title="Turi žodžius">T</span>}

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

            {/* Remove from album (×) */}
            <button type="button" onClick={() => onRemove(i)} title="Pašalinti iš albumo"
              className="w-5 h-5 flex items-center justify-center text-gray-300 hover:text-orange-500 hover:bg-orange-50 rounded transition-colors shrink-0 text-xs">
              ×
            </button>

            {/* Hard delete (🗑) — only for saved tracks */}
            {isSaved && (
              <button type="button" onClick={() => onHardDelete(i)} title="Ištrinti dainą visiškai"
                className="w-5 h-5 flex items-center justify-center text-gray-300 hover:text-red-600 hover:bg-red-50 rounded transition-colors shrink-0 text-xs opacity-0 group-hover:opacity-100">
                🗑
              </button>
            )}
          </div>
        )
      })}

      {!tracks.length && (
        <div className="py-10 text-center">
          <span className="text-3xl block mb-1">🎵</span>
          <p className="text-sm text-gray-400">Nėra dainų</p>
        </div>
      )}

      <div className="p-2.5 bg-gray-50/60">
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
    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50/80 sticky top-0 z-10">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-bold text-gray-700">Dainų sąrašas</span>
        <span className="bg-gray-200 text-gray-600 text-xs font-bold px-1.5 py-0.5 rounded-full">{count}</span>
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
  const [artistName, setArtistName] = useState('')
  const [artistId, setArtistId] = useState<number | null>(null)
  // Featured artists on album level: [{id, name}]
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
    // Remove from album list only (doesn't delete from DB)
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
      try {
        await fetch(`/api/tracks/${trackId}`, { method: 'DELETE' })
      } catch (e: any) { setError(e.message); return }
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
    <div className="space-y-2.5 p-3">
      {/* Main info card */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-2.5">

        {/* Row 1: Title (left) + Date (right) */}
        <div className="grid grid-cols-[1fr_auto] gap-3 items-start">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Pavadinimas *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Albumo pavadinimas"
              className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-900 text-sm font-medium focus:outline-none focus:border-blue-400 bg-white transition-colors" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Data</label>
            <div className="flex gap-1">
              <DateNumberInput label="" value={form.year} onChange={v => set('year', v)} min={1900} max={CY + 2} placeholder="Metai" />
              <DateNumberInput label="" value={form.month} onChange={v => set('month', v)} min={1} max={12} placeholder="Mėn" />
              <DateNumberInput label="" value={form.day} onChange={v => set('day', v)} min={1} max={31} placeholder="D" />
            </div>
          </div>
        </div>

        {/* Row 2: Artists chips (left) + feat search (right) */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Atlikėjai *</label>
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Main artist chip */}
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
            {/* Featured artist chips */}
            {featuredArtists.map((a, i) => (
              <div key={a.id} className="flex items-center gap-1 bg-gray-100 text-gray-700 border border-gray-200 rounded-full px-2 py-1 text-xs shrink-0">
                <span className="text-gray-400">feat.</span>
                {a.name}
                <button type="button" onClick={() => setFeaturedArtists(p => p.filter((_, j) => j !== i))}
                  className="text-gray-400 hover:text-red-500 transition-colors leading-none ml-0.5">×</button>
              </div>
            ))}
            {/* Inline feat search */}
            {form.artist_id && (
              <div className="flex-1 min-w-[120px]">
                <ArtistSearchInput placeholder="+ feat..."
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

      {/* Media card: 2 columns — cover left, YT+Spotify right */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Media</p>
        <div className="grid grid-cols-2 gap-3">

          {/* Left: Cover */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1.5">Viršelis</p>
            <CoverImageField value={form.cover_image_url || ''} onChange={url => set('cover_image_url', url)} />
          </div>

          {/* Right: YouTube + Spotify */}
          <div className="space-y-2.5">
            {/* YouTube */}
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">🎬 YouTube</p>
              <div className="flex gap-1">
                <input value={form.video_url || ''} onChange={e => set('video_url', e.target.value)}
                  placeholder="youtube.com/watch?v=..."
                  className="flex-1 min-w-0 px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:border-blue-400 bg-white" />
                {ytId && (
                  <button type="button" onClick={() => set('video_url', '')}
                    className="px-2 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg text-xs transition-colors shrink-0">✕</button>
                )}
              </div>
              {ytId && (
                <a href={form.video_url || ''} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 mt-1 group">
                  <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt=""
                    className="w-16 h-10 object-cover rounded shrink-0 group-hover:opacity-80 transition-opacity" />
                  <span className="text-xs text-gray-400 group-hover:text-blue-500 transition-colors">Žiūrėti ↗</span>
                </a>
              )}
              <div className="mt-1.5">
                <YouTubeSearch initialQuery={ytSearchQuery} onSelect={url => set('video_url', url)} />
              </div>
            </div>

            {/* Spotify */}
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">🎧 Spotify</p>
              <input value={form.spotify_id || ''} onChange={e => set('spotify_id', e.target.value)}
                placeholder="Album ID..."
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-gray-900 text-xs focus:outline-none focus:border-blue-400 font-mono transition-colors" />
              {form.spotify_id && (
                <a href={`https://open.spotify.com/album/${form.spotify_id}`} target="_blank" rel="noopener noreferrer"
                  className="mt-1 flex items-center gap-1 text-xs text-green-600 hover:text-green-700 transition-colors">
                  🔗 Atidaryti
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
            <span className="text-gray-300">/</span>
            <Link href="/admin/albums" className="text-gray-400 hover:text-gray-700 shrink-0">Albumai</Link>
            {artistName && artistId && <>
              <span className="text-gray-300">/</span>
              <Link href={`/admin/artists/${artistId}`} className="text-gray-400 hover:text-gray-700 truncate max-w-[80px]">{artistName}</Link>
            </>}
            <span className="text-gray-300">/</span>
            <span className="text-gray-800 font-semibold truncate max-w-[120px]">{isNew ? 'Naujas' : (form.title || '...')}</span>
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
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${saved ? 'bg-green-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'} disabled:opacity-50`}>
              {saving ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" /> Saugoma...</> : saved ? '✓ Išsaugota!' : '✓ Išsaugoti'}
            </button>
          </div>
        </div>

        {/* Mobile tabs */}
        <div className="flex lg:hidden border-t border-gray-100">
          <button onClick={() => setTab('info')}
            className={`flex-1 py-2 text-sm font-semibold transition-colors ${tab === 'info' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-gray-500'}`}>
            📋 Informacija
          </button>
          <button onClick={() => setTab('tracks')}
            className={`flex-1 py-2 text-sm font-semibold transition-colors ${tab === 'tracks' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-gray-500'}`}>
            🎵 Dainos {trackCount > 0 && <span className="ml-1 bg-gray-200 text-gray-700 text-xs font-bold px-1.5 py-0.5 rounded-full">{trackCount}</span>}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 pt-2">
          <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-center gap-2">
            ❌ {error}<button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">✕</button>
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
              onAdd={addTrack} onUpdate={upTrack} onRemove={rmTrack} onHardDelete={hardDeleteTrack} onReorder={reorderTracks} />
          </div>
        )}
      </div>

      {/* Desktop 50/50 */}
      <div className="hidden lg:grid lg:grid-cols-2">
        <div className="border-r border-gray-200 overflow-y-auto" style={{ height: 'calc(100vh - 41px)', position: 'sticky', top: '41px' }}>
          {InfoPanel}
        </div>
        <div className="bg-gray-50/40 overflow-y-auto" style={{ height: 'calc(100vh - 41px)', position: 'sticky', top: '41px' }}>
          <TracksHeader count={trackCount} />
          <TrackList tracks={form.tracks || []} isMobile={false}
            onAdd={addTrack} onUpdate={upTrack} onRemove={rmTrack} onHardDelete={hardDeleteTrack} onReorder={reorderTracks} />
        </div>
      </div>
    </div>
  )
}
