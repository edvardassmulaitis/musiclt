'use client'

import { useState, useEffect, use, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { AlbumFull, TrackInAlbum } from '@/lib/supabase-albums'

const ALBUM_TYPE_FIELDS = [
  { key: 'type_studio', label: 'Studijinis', icon: '🎵' },
  { key: 'type_ep', label: 'EP', icon: '🎼' },
  { key: 'type_single', label: 'Singlas', icon: '🎤' },
  { key: 'type_compilation', label: 'Kompiliacija', icon: '📀' },
  { key: 'type_live', label: 'Gyvas', icon: '🎸' },
  { key: 'type_remix', label: 'Remix', icon: '🔄' },
  { key: 'type_covers', label: 'Coveriai', icon: '🎭' },
  { key: 'type_holiday', label: 'Šventinis', icon: '🎄' },
  { key: 'type_soundtrack', label: 'Soundtrack', icon: '🎬' },
  { key: 'type_demo', label: 'Demo', icon: '🎙️' },
]

const TRACK_TYPES = ['normal', 'remix', 'live', 'mashup', 'instrumental'] as const

const CY = new Date().getFullYear()
const YEARS = Array.from({ length: CY - 1950 + 2 }, (_, i) => CY + 1 - i)
const MONTHS = ['Sausis','Vasaris','Kovas','Balandis','Gegužė','Birželis','Liepa','Rugpjūtis','Rugsėjis','Spalis','Lapkritis','Gruodis']
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

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

  // Handle URL paste + auto-download to server
  const handleUrlCommit = async (raw: string) => {
    const v = raw.trim()
    if (!v || v === value) return
    if (v.startsWith('http') && !v.includes('/api/upload') && !v.includes('supabase')) {
      // Fetch and re-upload to our server
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
    <div className="space-y-2">
      <div
        className="relative w-full aspect-square rounded-xl border-2 border-dashed border-gray-200 overflow-hidden bg-gray-50 cursor-pointer group hover:border-blue-400 transition-colors"
        onClick={() => !uploading && fileRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
      >
        {value ? (
          <>
            <img src={value} alt="Viršelis" referrerPolicy="no-referrer"
              className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
              <span className="text-white text-3xl">📷</span>
              <span className="text-white text-xs font-medium">Keisti</span>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-2">
            <span className="text-4xl">💿</span>
            <span className="text-xs text-center px-2">Spausti arba tempti nuotrauką</span>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
      <div className="flex gap-1.5">
        <input type="text" value={urlInput}
          onChange={e => setUrlInput(e.target.value)}
          onBlur={e => handleUrlCommit(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleUrlCommit(urlInput)}
          placeholder="https://... (Enter)"
          className="flex-1 min-w-0 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:border-blue-400 bg-white" />
        <button type="button" onClick={() => fileRef.current?.click()}
          className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-xs transition-colors" title="Įkelti failą">
          📁
        </button>
        {value && (
          <button type="button" onClick={() => { onChange(''); setUrlInput('') }}
            className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg text-xs transition-colors">✕</button>
        )}
      </div>
      {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f) }} />
    </div>
  )
}

// ── Drag-and-drop Tracklist ───────────────────────────────────────────────────
function TrackList({
  tracks, artistSlug, albumId,
  onAdd, onUpdate, onRemove, onReorder,
}: {
  tracks: TrackInAlbum[]
  artistSlug?: string
  albumId?: string
  onAdd: () => void
  onUpdate: (i: number, f: keyof TrackInAlbum, v: any) => void
  onRemove: (i: number) => void
  onReorder: (from: number, to: number) => void
}) {
  const dragIdx = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  const onDragStart = (i: number) => { dragIdx.current = i }
  const onDragEnter = (i: number) => setDragOver(i)
  const onDragEnd = () => {
    if (dragIdx.current !== null && dragOver !== null && dragIdx.current !== dragOver) {
      onReorder(dragIdx.current, dragOver)
    }
    dragIdx.current = null; setDragOver(null)
  }

  return (
    <div>
      {tracks.length > 0 && (
        <div className="divide-y divide-gray-50">
          {tracks.map((t, i) => {
            const trackSlug = t.slug || t.title?.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || ''
            const trackUrl = artistSlug && trackSlug ? `/admin/tracks/${t.track_id || t.id || ''}` : null
            const hasVideo = !!(t.video_url)
            const hasLyrics = !!(t as any).has_lyrics

            return (
              <div
                key={i}
                draggable
                onDragStart={() => onDragStart(i)}
                onDragEnter={() => onDragEnter(i)}
                onDragOver={e => e.preventDefault()}
                onDragEnd={onDragEnd}
                className={`flex items-center gap-2 px-3 py-2.5 group transition-colors cursor-grab active:cursor-grabbing ${
                  dragOver === i ? 'bg-blue-50 border-t-2 border-blue-400' : 'hover:bg-gray-50/60'
                }`}
              >
                {/* Drag handle */}
                <span className="text-gray-300 group-hover:text-gray-400 transition-colors select-none text-xs shrink-0 w-4 text-center">⠿</span>

                {/* Number */}
                <span className="text-xs font-bold text-gray-400 w-5 text-right shrink-0">{i + 1}</span>

                {/* Title with link */}
                <div className="flex-1 min-w-0 flex items-center gap-1.5">
                  <input value={t.title} onChange={e => onUpdate(i, 'title', e.target.value)}
                    placeholder="Dainos pavadinimas"
                    className="flex-1 min-w-0 px-2 py-1 border border-transparent hover:border-gray-200 focus:border-blue-300 rounded-lg text-sm text-gray-900 focus:outline-none bg-transparent focus:bg-white transition-all" />
                  {trackUrl && (
                    <a href={trackUrl} target="_blank" rel="noopener noreferrer"
                      className="shrink-0 text-gray-300 hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100"
                      title="Atidaryti dainą" onClick={e => e.stopPropagation()}>
                      ↗
                    </a>
                  )}
                </div>

                {/* Indicators */}
                <div className="flex items-center gap-1 shrink-0">
                  {hasVideo && <span className="text-xs text-blue-400" title="Turi video">▶</span>}
                  {hasLyrics && <span className="text-xs text-green-400" title="Turi žodžius">♪</span>}
                </div>

                {/* Duration */}
                <input value={t.duration || ''} onChange={e => onUpdate(i, 'duration', e.target.value)}
                  placeholder="3:45" maxLength={6}
                  className="w-12 px-1.5 py-1 border border-transparent hover:border-gray-200 focus:border-blue-300 rounded text-xs text-gray-500 focus:outline-none text-center bg-transparent focus:bg-white transition-all" />

                {/* Type */}
                <select value={t.type} onChange={e => onUpdate(i, 'type', e.target.value)}
                  className="px-1.5 py-1 border border-transparent hover:border-gray-200 focus:border-blue-300 rounded text-xs text-gray-500 focus:outline-none bg-transparent focus:bg-white transition-all cursor-pointer">
                  {TRACK_TYPES.map(tp => <option key={tp} value={tp}>{tp}</option>)}
                </select>

                {/* Singlas */}
                <label className="flex items-center gap-1 cursor-pointer shrink-0" title="Singlas">
                  <input type="checkbox" checked={t.is_single || false}
                    onChange={e => onUpdate(i, 'is_single', e.target.checked)}
                    className="accent-blue-600 w-3 h-3" />
                  <span className="text-xs text-gray-400">S</span>
                </label>

                {/* Delete */}
                <button type="button" onClick={() => onRemove(i)}
                  className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-all opacity-0 group-hover:opacity-100 shrink-0 text-xs">
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      )}

      {!tracks.length && (
        <div className="py-10 text-center">
          <span className="text-3xl block mb-2">🎵</span>
          <p className="text-sm text-gray-400 mb-3">Nėra dainų</p>
        </div>
      )}

      {/* Add button at bottom */}
      <div className="px-3 py-2 border-t border-gray-100 mt-1">
        <button type="button" onClick={onAdd}
          className="w-full py-2 border-2 border-dashed border-gray-200 text-gray-400 rounded-xl text-sm hover:border-blue-300 hover:text-blue-500 transition-colors">
          + Pridėti dainą
        </button>
      </div>
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
          className="px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm disabled:opacity-50 transition-colors">
          {loading ? <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : '🔍'}
        </button>
      </div>
      {results.length > 0 && (
        <div className="space-y-1 max-h-56 overflow-y-auto rounded-xl border border-gray-100">
          {results.map(r => (
            <div key={r.videoId} onClick={() => { onSelect(`https://www.youtube.com/watch?v=${r.videoId}`); setResults([]) }}
              className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-blue-50 transition-colors">
              <img src={r.thumbnail} alt="" className="w-16 h-10 object-cover rounded shrink-0" />
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
  const [artistSlug, setArtistSlug] = useState('')
  const [artistId, setArtistId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'
  const set = (f: keyof AlbumFull, v: any) => setForm(p => ({ ...p, [f]: v }))

  useEffect(() => { if (status === 'unauthenticated') router.push('/') }, [status])

  useEffect(() => {
    if (!isNew && isAdmin) {
      fetch(`/api/albums/${id}`).then(r => r.json()).then(data => {
        setForm({ ...data, tracks: data.tracks || [] })
        if (data.artists?.name) {
          setArtistName(data.artists.name)
          setArtistSlug(data.artists.slug || '')
          setArtistId(data.artist_id)
        }
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
  const ytSearchQuery = form.title && artistName ? `${artistName} ${form.title}` : form.title || ''

  if (status === 'loading' || !isAdmin) return null

  return (
    <div className="min-h-screen bg-[#f8f7f5]">
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-gray-200 px-4 py-2.5">
        <div className="flex items-center justify-between gap-4">
          {/* Breadcrumbs */}
          <nav className="flex items-center gap-1 text-sm min-w-0 flex-wrap">
            <Link href="/admin" className="text-gray-400 hover:text-gray-700 transition-colors shrink-0">Admin</Link>
            <span className="text-gray-300">/</span>
            <Link href="/admin/albums" className="text-gray-400 hover:text-gray-700 transition-colors shrink-0">Albumai</Link>
            {artistName && (
              <>
                <span className="text-gray-300">/</span>
                {artistId
                  ? <Link href={`/admin/artists/${artistId}`} className="text-gray-400 hover:text-gray-700 transition-colors truncate max-w-[100px]">{artistName}</Link>
                  : <span className="text-gray-400 truncate max-w-[100px]">{artistName}</span>}
                <span className="text-gray-300">/</span>
                <Link href={`/admin/albums?artist_id=${artistId}`} className="text-gray-400 hover:text-gray-700 transition-colors shrink-0">albumai</Link>
              </>
            )}
            <span className="text-gray-300">/</span>
            <span className="text-gray-800 font-semibold truncate max-w-[160px]">
              {isNew ? 'Naujas' : (form.title || '...')}
            </span>
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {!isNew && (
              <button onClick={handleDelete} disabled={deleting}
                className="flex items-center gap-1.5 px-3 py-2 text-red-500 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                🗑️ Ištrinti
              </button>
            )}
            <Link href={artistId ? `/admin/artists/${artistId}` : '/admin/albums'}
              className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
              Atšaukti
            </Link>
            <button onClick={handleSubmit} disabled={saving}
              className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all ${
                saved ? 'bg-green-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
              } disabled:opacity-50`}>
              {saving
                ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" /> Saugoma...</>
                : saved ? '✓ Išsaugota!' : '✓ Išsaugoti'}
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 pt-3">
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-center gap-2 max-w-screen-xl mx-auto">
            ❌ {error}
            <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">✕</button>
          </div>
        </div>
      )}

      {/* ── Main 2-column layout ── */}
      <div className="grid grid-cols-[1fr_360px] gap-0 h-full">

        {/* ── LEFT: Tracklist ── */}
        <div className="border-r border-gray-200 bg-white">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 sticky top-[49px] bg-white z-10">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-gray-700">Dainų sąrašas</h2>
              <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-0.5 rounded-full">
                {form.tracks?.length || 0}
              </span>
            </div>
            {form.tracks && form.tracks.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span title="▶ = video, ♪ = žodžiai">▶ video &nbsp; ♪ žodžiai &nbsp; S = singlas</span>
              </div>
            )}
          </div>

          <TrackList
            tracks={form.tracks || []}
            artistSlug={artistSlug}
            albumId={id}
            onAdd={addTrack}
            onUpdate={upTrack}
            onRemove={rmTrack}
            onReorder={reorderTracks}
          />
        </div>

        {/* ── RIGHT: Info panel ── */}
        <div className="overflow-y-auto" style={{ height: 'calc(100vh - 49px)', position: 'sticky', top: '49px' }}>
          <div className="p-4 space-y-4">

            {/* Summary card (edit mode only) */}
            {!isNew && (
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-4 text-white">
                <div className="flex items-center gap-3">
                  {form.cover_image_url ? (
                    <img src={form.cover_image_url} alt="" referrerPolicy="no-referrer"
                      className="w-14 h-14 rounded-lg object-cover shrink-0 shadow-lg" />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-white/20 flex items-center justify-center text-2xl shrink-0">💿</div>
                  )}
                  <div className="min-w-0">
                    <p className="font-bold text-white leading-tight truncate">{form.title || 'Albumas'}</p>
                    <p className="text-blue-200 text-xs mt-0.5">{artistName}</p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {form.year && <span className="text-blue-200 text-xs">{form.year}</span>}
                      {activeType && <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">{activeType.icon} {activeType.label}</span>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Pagrindinė informacija */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Pagrindinė informacija</p>

              {/* Title */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Pavadinimas *</label>
                <input value={form.title} onChange={e => set('title', e.target.value)}
                  placeholder="Albumo pavadinimas"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-gray-900 text-sm font-medium focus:outline-none focus:border-blue-400 bg-white transition-colors" />
              </div>

              {/* Artist */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Atlikėjas *</label>
                {form.artist_id ? (
                  <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                    <span className="flex-1 text-sm font-semibold text-gray-900">{artistName}</span>
                    <button type="button" onClick={() => { set('artist_id', 0); setArtistName(''); setArtistId(null); setArtistSlug('') }}
                      className="text-gray-400 hover:text-red-500 transition-colors leading-none text-lg">×</button>
                  </div>
                ) : (
                  <div className="relative">
                    <input type="text" value={artistSearch} onChange={e => setArtistSearch(e.target.value)}
                      placeholder="Ieškoti atlikėjo..."
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-gray-900 text-sm focus:outline-none focus:border-blue-400 transition-colors" />
                    {artistResults.length > 0 && (
                      <div className="absolute z-20 w-full bg-white border border-gray-200 rounded-xl shadow-xl mt-1 overflow-hidden">
                        {artistResults.map(a => (
                          <button key={a.id} type="button"
                            onClick={() => { set('artist_id', a.id); setArtistName(a.name); setArtistSlug(a.slug || ''); setArtistId(a.id); setArtistSearch(''); setArtistResults([]) }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 text-left transition-colors">
                            <span className="font-semibold text-gray-900 text-sm">{a.name}</span>
                            <span className="text-gray-400 text-xs ml-auto">{a.country}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Išleidimo data</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { key: 'year', label: 'Metai', value: form.year, opts: YEARS.map(y => ({ v: y, l: String(y) })) },
                    { key: 'month', label: 'Mėnuo', value: form.month, opts: MONTHS.map((m, i) => ({ v: i+1, l: m })) },
                    { key: 'day', label: 'Diena', value: form.day, opts: DAYS.map(d => ({ v: d, l: String(d) })) },
                  ].map(({ key, label, value, opts }) => (
                    <div key={key}>
                      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                      <select value={value || ''} onChange={e => set(key as any, e.target.value ? parseInt(e.target.value) : null)}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-gray-900 text-xs focus:outline-none focus:border-blue-400 bg-white">
                        <option value="">–</option>
                        {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Type */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Tipas</label>
                <div className="flex flex-wrap gap-1">
                  {ALBUM_TYPE_FIELDS.map(t => (
                    <button key={t.key} type="button" onClick={() => setType(t.key)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                        (form as any)[t.key] ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
                <div className="mb-3">
                  <input value={form.video_url || ''} onChange={e => set('video_url', e.target.value)}
                    placeholder="https://youtube.com/watch?v=..."
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-700 focus:outline-none focus:border-blue-400 bg-white mb-2" />
                </div>
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

            {/* Save hint */}
            <div className="text-center text-xs text-gray-400 py-2">
              <kbd className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-500 font-mono">⌘S</kbd> Išsaugoti
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
