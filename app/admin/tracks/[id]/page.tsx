'use client'

import { useState, useEffect, use, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const TRACK_TYPES = ['normal', 'remix', 'live', 'mashup', 'instrumental'] as const
const TRACK_TYPE_LABELS: Record<string, { label: string; icon: string }> = {
  normal:       { label: 'Įprastinė', icon: '🎵' },
  remix:        { label: 'Remix',     icon: '🔄' },
  live:         { label: 'Gyva',      icon: '🎸' },
  mashup:       { label: 'Mashup',    icon: '🎛️' },
  instrumental: { label: 'Instr.',    icon: '🎼' },
}

type FeaturingArtist = { artist_id: number; name: string }
type AlbumRef = { album_id: number; album_title: string; album_year: number | null; position: number }
type YTResult = { videoId: string; title: string; channel: string; thumbnail: string }

function extractYouTubeId(url: string): string {
  return url.match(/(?:v=|youtu\.be\/)([^&?]+)/)?.[1] || ''
}

// ── Compact number input ──────────────────────────────────────────────────────
function DateNum({ value, onChange, min, max, placeholder, width = 'w-14' }: {
  value: string; onChange: (v: string) => void
  min: number; max: number; placeholder: string; width?: string
}) {
  const [raw, setRaw] = useState(value)
  useEffect(() => setRaw(value), [value])
  const commit = (s: string) => {
    const n = parseInt(s)
    if (!s || isNaN(n)) { onChange(''); setRaw('') }
    else if (n >= min && n <= max) { onChange(String(n)); setRaw(String(n)) }
    else { setRaw(value) }
  }
  return (
    <input type="number" value={raw}
      onChange={e => setRaw(e.target.value)}
      onBlur={e => commit(e.target.value)}
      onKeyDown={e => e.key === 'Enter' && commit(raw)}
      placeholder={placeholder} min={min} max={max}
      className={`${width} px-2 py-1.5 border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-blue-400 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`} />
  )
}

// ── Artist search input ───────────────────────────────────────────────────────
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

// ── YouTube search ────────────────────────────────────────────────────────────
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
        <div className="rounded-lg border border-gray-100 overflow-hidden max-h-48 overflow-y-auto">
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

// ── Cover image mini field ────────────────────────────────────────────────────
function CoverMini({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [urlInput, setUrlInput] = useState(value || '')
  useEffect(() => setUrlInput(value || ''), [value])

  const upload = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('type', 'track')
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.url) { onChange(data.url); setUrlInput(data.url) }
    } finally { setUploading(false) }
  }

  const commitUrl = async (raw: string) => {
    const v = raw.trim()
    if (!v || v === value) return
    if (v.startsWith('http') && !v.includes('supabase')) {
      setUploading(true)
      try {
        const res = await fetch('/api/fetch-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: v }) })
        if (res.ok) { const d = await res.json(); if (d.url && !d.url.startsWith('data:')) { onChange(d.url); setUrlInput(d.url); return } }
      } catch {} finally { setUploading(false) }
    }
    onChange(v)
  }

  return (
    <div className="flex gap-2 items-start">
      {/* Square preview */}
      <div className="relative shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-gray-200 bg-gray-50 cursor-pointer group"
        onClick={() => !uploading && fileRef.current?.click()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) upload(f) }}
        onDragOver={e => e.preventDefault()}>
        {value
          ? <img src={value} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover group-hover:opacity-80 transition-opacity" />
          : <div className="w-full h-full flex items-center justify-center text-gray-300 text-2xl group-hover:text-gray-400 transition-colors">🖼️</div>
        }
        {uploading && <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>}
      </div>
      {/* URL input */}
      <div className="flex-1 min-w-0 space-y-1">
        <input type="text" value={urlInput} onChange={e => setUrlInput(e.target.value)}
          onBlur={e => commitUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && commitUrl(urlInput)}
          placeholder="https://..." className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:border-blue-400 bg-white" />
        <div className="flex gap-1">
          <button type="button" onClick={() => fileRef.current?.click()}
            className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded text-xs transition-colors">📁 Įkelti</button>
          {value && <button type="button" onClick={() => { onChange(''); setUrlInput('') }}
            className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-500 rounded text-xs transition-colors">✕</button>}
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }} />
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminTrackEditPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const id = resolvedParams?.id
  const isNewTrack = !id || id === 'new'

  const { data: session, status } = useSession()
  const router = useRouter()

  const [title, setTitle] = useState('')
  const [artistId, setArtistId] = useState(0)
  const [artistName, setArtistName] = useState('')
  const [trackType, setTrackType] = useState('normal')
  const [releaseYear, setReleaseYear] = useState('')
  const [releaseMonth, setReleaseMonth] = useState('')
  const [releaseDay, setReleaseDay] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [spotifyId, setSpotifyId] = useState('')
  const [spUrlInput, setSpUrlInput] = useState('')
  const [lyrics, setLyrics] = useState('')
  const [isNew, setIsNew] = useState(false)
  const [isNewDate, setIsNewDate] = useState<string | null>(null)
  const [coverUrl, setCoverUrl] = useState('')
  const [featuring, setFeaturing] = useState<FeaturingArtist[]>([])
  const [albums, setAlbums] = useState<AlbumRef[]>([])
  const [removingFromAlbum, setRemovingFromAlbum] = useState<number | null>(null)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(!isNewTrack)

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  useEffect(() => { if (status === 'unauthenticated') router.push('/') }, [status])

  useEffect(() => {
    if (isNewTrack || !isAdmin) return
    setLoading(true)
    fetch(`/api/tracks/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return }
        setTitle(data.title || '')
        setArtistId(data.artist_id || 0)
        setTrackType(data.type || 'normal')
        setReleaseYear(data.release_year ? String(data.release_year) : '')
        setReleaseMonth(data.release_month ? String(data.release_month) : '')
        setReleaseDay(data.release_day ? String(data.release_day) : '')
        setVideoUrl(data.video_url || '')
        setSpotifyId(data.spotify_id || '')
        setLyrics(data.lyrics || '')
        setIsNew(data.is_new || false)
        setIsNewDate(data.is_new_date || null)
        setCoverUrl(data.cover_url || '')
        if (data.artists?.name) setArtistName(data.artists.name)
        if (data.featuring) setFeaturing(data.featuring)
        if (data.albums) setAlbums(data.albums)
      })
      .finally(() => setLoading(false))
  }, [id, isAdmin])

  const toggleNew = async () => {
    const newVal = !isNew
    const newDate = newVal ? new Date().toISOString().slice(0, 10) : null
    setIsNew(newVal); setIsNewDate(newDate)
    if (!isNewTrack) {
      await fetch(`/api/tracks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_new: newVal, is_new_date: newDate, _partial: true }),
      })
    }
  }

  const removeFromAlbum = async (albumId: number) => {
    if (!confirm('Pašalinti iš albumo?')) return
    setRemovingFromAlbum(albumId)
    try {
      await fetch(`/api/album-tracks?track_id=${id}&album_id=${albumId}`, { method: 'DELETE' })
      setAlbums(p => p.filter(a => a.album_id !== albumId))
    } finally { setRemovingFromAlbum(null) }
  }

  const handleSave = useCallback(async () => {
    if (!title.trim()) { setError('Pavadinimas privalomas'); return }
    if (!artistId) { setError('Pasirinkite atlikėją'); return }
    setSaving(true); setError('')
    try {
      const payload = {
        title, artist_id: artistId, type: trackType,
        release_year: releaseYear || null,
        release_month: releaseMonth || null,
        release_day: releaseDay || null,
        video_url: videoUrl, spotify_id: spotifyId,
        lyrics, is_new: isNew, is_new_date: isNewDate,
        cover_url: coverUrl, featuring,
      }
      const res = await fetch(isNewTrack ? '/api/tracks' : `/api/tracks/${id}`, {
        method: isNewTrack ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSaved(true); setTimeout(() => setSaved(false), 2000)
      if (isNewTrack) router.push(`/admin/tracks/${data.id}`)
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }, [title, artistId, trackType, releaseYear, releaseMonth, releaseDay, videoUrl, spotifyId, lyrics, isNew, isNewDate, coverUrl, featuring, id, isNewTrack])

  const handleDelete = async () => {
    if (!confirm(`Ištrinti "${title}"?`)) return
    setDeleting(true)
    await fetch(`/api/tracks/${id}`, { method: 'DELETE' })
    router.push(artistId ? `/admin/artists/${artistId}` : '/admin/tracks')
  }

  // Cmd+S
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); handleSave() } }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [handleSave])

  const ytId = extractYouTubeId(videoUrl)
  const ytSearchQuery = [artistName, title].filter(Boolean).join(' ')
  const firstAlbumYear = albums[0]?.album_year

  if (status === 'loading' || !isAdmin) return null

  return (
    <div className="h-screen flex flex-col bg-[#f8f7f5] overflow-hidden">

      {/* ── Sticky header ── */}
      <div className="shrink-0 bg-white/95 backdrop-blur border-b border-gray-200 px-4 py-2 flex items-center justify-between gap-3">
        <nav className="flex items-center gap-1 text-sm min-w-0">
          <Link href="/admin" className="text-gray-400 hover:text-gray-700 shrink-0">Admin</Link>
          <span className="text-gray-300">/</span>
          <Link href="/admin/tracks" className="text-gray-400 hover:text-gray-700 shrink-0">Dainos</Link>
          {artistId > 0 && <>
            <span className="text-gray-300">/</span>
            <Link href={`/admin/artists/${artistId}`} className="text-gray-400 hover:text-gray-700 shrink-0">{artistName}</Link>
          </>}
          <span className="text-gray-300">/</span>
          <span className="text-gray-800 font-semibold truncate max-w-[200px]">{isNewTrack ? 'Nauja' : (title || '...')}</span>
        </nav>
        <div className="flex items-center gap-1.5 shrink-0">
          {!isNewTrack && (
            <button onClick={handleDelete} disabled={deleting}
              className="flex items-center gap-1 px-2.5 py-1.5 text-red-500 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
              🗑️ <span className="hidden sm:inline">Ištrinti</span>
            </button>
          )}
          <Link href={artistId ? `/admin/artists/${artistId}` : '/admin/tracks'}
            className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            Atšaukti
          </Link>
          <button onClick={handleSave} disabled={saving}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${saved ? 'bg-green-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'} disabled:opacity-50`}>
            {saving
              ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" /> Saugoma...</>
              : saved ? '✓ Išsaugota!' : '✓ Išsaugoti'}
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="shrink-0 mx-3 mt-2">
          <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-center gap-2">
            ❌ {error}
            <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">✕</button>
          </div>
        </div>
      )}

      {/* ── 3-col body ── */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-[320px_1fr_1fr] min-h-0">

          {/* ════ COL 1: Info ════ */}
          <div className="border-r border-gray-200 overflow-y-auto bg-white">
            <div className="p-3 space-y-2.5">

              {/* Main info card */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-2.5">

                {/* Artist */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1">Atlikėjas *</p>
                  {artistId ? (
                    <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5">
                      <span className="flex-1 text-sm font-semibold text-blue-900">{artistName}</span>
                      <button onClick={() => { setArtistId(0); setArtistName('') }}
                        className="text-xs text-blue-400 hover:text-red-500 border border-blue-200 hover:border-red-300 bg-white rounded px-1.5 py-0.5 transition-colors">
                        keisti
                      </button>
                    </div>
                  ) : (
                    <ArtistSearchInput placeholder="Ieškoti atlikėjo..." onSelect={(id, name) => { setArtistId(id); setArtistName(name) }} />
                  )}
                </div>

                {/* Title */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1">Pavadinimas *</p>
                  <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Dainos pavadinimas"
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-900 text-sm font-medium focus:outline-none focus:border-blue-400 bg-white transition-colors" />
                </div>

                {/* Cover */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1">Viršelis</p>
                  <CoverMini value={coverUrl} onChange={setCoverUrl} />
                </div>

                {/* Featuring */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1">Featuring</p>
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {featuring.map(f => (
                      <span key={f.artist_id} className="flex items-center gap-1 bg-gray-100 text-gray-700 border border-gray-200 rounded-full px-2 py-0.5 text-xs">
                        {f.name}
                        <button onClick={() => setFeaturing(p => p.filter(x => x.artist_id !== f.artist_id))}
                          className="text-gray-400 hover:text-red-500 ml-0.5">×</button>
                      </span>
                    ))}
                  </div>
                  <ArtistSearchInput placeholder="+ feat. atlikėjas..."
                    onSelect={(id, name) => {
                      if (id === artistId || featuring.find(f => f.artist_id === id)) return
                      setFeaturing(p => [...p, { artist_id: id, name }])
                    }} />
                </div>

                {/* Date */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1">Data</p>
                  <div className="flex gap-1 items-center">
                    <DateNum value={releaseYear} onChange={setReleaseYear} min={1900} max={2030} placeholder="Metai" width="w-20" />
                    <span className="text-gray-300 text-sm">/</span>
                    <DateNum value={releaseMonth} onChange={setReleaseMonth} min={1} max={12} placeholder="Mėn" width="w-14" />
                    <span className="text-gray-300 text-sm">/</span>
                    <DateNum value={releaseDay} onChange={setReleaseDay} min={1} max={31} placeholder="D" width="w-11" />
                    {(releaseYear || releaseMonth || releaseDay) && (
                      <button onClick={() => { setReleaseYear(''); setReleaseMonth(''); setReleaseDay('') }}
                        className="text-gray-400 hover:text-red-500 text-sm ml-0.5">✕</button>
                    )}
                  </div>
                  {firstAlbumYear && releaseYear !== String(firstAlbumYear) && (
                    <button onClick={() => { setReleaseYear(String(firstAlbumYear)); setReleaseMonth(''); setReleaseDay('') }}
                      className="mt-1 text-xs text-blue-500 hover:underline">
                      ← Albumo metai ({firstAlbumYear})
                    </button>
                  )}
                </div>

                {/* Type */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1">Tipas</p>
                  <div className="flex flex-wrap gap-1">
                    {TRACK_TYPES.map(tp => (
                      <button key={tp} type="button" onClick={() => setTrackType(tp)}
                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                          trackType === tp ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}>
                        {TRACK_TYPE_LABELS[tp].icon} {TRACK_TYPE_LABELS[tp].label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Naujas toggle */}
                <div>
                  <button onClick={toggleNew}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                      isNew ? 'bg-green-50 border-green-300 text-green-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}>
                    🆕 Naujas
                    {isNew && isNewDate && <span className="text-green-400 font-normal">nuo {isNewDate}</span>}
                  </button>
                  <p className="text-xs text-gray-400 mt-0.5">Išsaugoma automatiškai</p>
                </div>
              </div>

              {/* Albums card */}
              {albums.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-1.5">
                    <span className="text-xs font-bold text-gray-600">Albumai</span>
                    <span className="bg-gray-200 text-gray-600 text-xs font-bold px-1.5 py-0.5 rounded-full">{albums.length}</span>
                  </div>
                  {albums.map(a => (
                    <div key={a.album_id} className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-50 last:border-0 group hover:bg-gray-50 transition-colors">
                      <span className="text-gray-300 text-xs w-4 text-right shrink-0">{a.position}.</span>
                      <div className="flex-1 min-w-0">
                        <Link href={`/admin/albums/${a.album_id}`}
                          className="text-sm text-gray-900 hover:text-blue-600 truncate block transition-colors">
                          {a.album_title}
                        </Link>
                        {a.album_year && <span className="text-xs text-gray-400">{a.album_year}</span>}
                      </div>
                      <button onClick={() => removeFromAlbum(a.album_id)}
                        disabled={removingFromAlbum === a.album_id}
                        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 text-xs px-1 rounded transition-all disabled:opacity-50">
                        {removingFromAlbum === a.album_id ? '...' : '✕'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ════ COL 2: Media ════ */}
          <div className="border-r border-gray-200 overflow-y-auto bg-[#f8f7f5]">
            <div className="p-3 space-y-2.5">

              {/* YouTube card */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-2">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">🎬 YouTube</p>

                {/* URL input */}
                <div className="flex gap-1.5">
                  <input value={videoUrl} onChange={e => setVideoUrl(e.target.value)}
                    placeholder="youtube.com/watch?v=..."
                    className="flex-1 min-w-0 px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:border-blue-400 bg-white" />
                  {ytId && (
                    <button type="button" onClick={() => setVideoUrl('')}
                      className="px-2 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg text-xs transition-colors shrink-0">✕</button>
                  )}
                </div>

                {/* Thumbnail */}
                {ytId ? (
                  <a href={videoUrl} target="_blank" rel="noopener noreferrer"
                    className="block relative rounded-lg overflow-hidden group">
                    <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt=""
                      className="w-full aspect-video object-cover group-hover:opacity-90 transition-opacity" />
                    <span className="absolute bottom-1 right-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">↗</span>
                  </a>
                ) : null}

                {/* Search */}
                <YouTubeSearch initialQuery={ytSearchQuery} onSelect={url => setVideoUrl(url)} />
              </div>

              {/* Spotify card */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-2">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">🎧 Spotify</p>

                <div>
                  <p className="text-xs text-gray-500 mb-1">Track ID</p>
                  <input value={spotifyId} onChange={e => setSpotifyId(e.target.value)}
                    placeholder="0abc123..."
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-gray-900 text-xs focus:outline-none focus:border-blue-400 font-mono transition-colors" />
                  {spotifyId && (
                    <a href={`https://open.spotify.com/track/${spotifyId}`} target="_blank" rel="noopener noreferrer"
                      className="mt-1 flex items-center gap-1 text-xs text-green-600 hover:text-green-700 transition-colors">
                      🔗 Atidaryti Spotify
                    </a>
                  )}
                </div>

                {/* Spotify embed */}
                {spotifyId && (
                  <iframe src={`https://open.spotify.com/embed/track/${spotifyId}`}
                    width="100%" height="80" frameBorder="0" allow="encrypted-media" className="rounded-lg" />
                )}

                {/* URL → ID */}
                <div>
                  <p className="text-xs text-gray-500 mb-1">URL → ID</p>
                  <div className="flex gap-1.5">
                    <input value={spUrlInput} onChange={e => setSpUrlInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { const m = spUrlInput.match(/track\/([A-Za-z0-9]+)/); if (m) setSpotifyId(m[1]) } }}
                      placeholder="https://open.spotify.com/track/..."
                      className="flex-1 min-w-0 px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:border-blue-400 bg-white" />
                    <button type="button"
                      onClick={() => { const m = spUrlInput.match(/track\/([A-Za-z0-9]+)/); if (m) setSpotifyId(m[1]) }}
                      className="px-2.5 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold transition-colors shrink-0">✓</button>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">Share → Copy Link</p>
                </div>
              </div>
            </div>
          </div>

          {/* ════ COL 3: Lyrics ════ */}
          <div className="flex flex-col min-h-0 bg-[#f8f7f5]">
            <div className="flex-1 p-3 flex flex-col min-h-0">
              <div className="flex-1 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                <div className="px-3 py-2 border-b border-gray-100 shrink-0">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">✍️ Žodžiai / Lyrics</p>
                </div>
                <textarea
                  value={lyrics}
                  onChange={e => setLyrics(e.target.value)}
                  placeholder="Dainos žodžiai..."
                  className="flex-1 w-full px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none resize-none font-mono leading-relaxed"
                />
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
