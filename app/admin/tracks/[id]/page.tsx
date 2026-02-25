'use client'

import { useState, useEffect, use, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const TRACK_TYPES = ['normal', 'single', 'remix', 'live', 'mashup', 'instrumental'] as const
const TRACK_TYPE_LABELS: Record<string, { label: string; icon: string }> = {
  normal:       { label: 'Įprastinė', icon: '🎵' },
  single:       { label: 'Singlas',   icon: '💿' },
  remix:        { label: 'Remix',     icon: '🔄' },
  live:         { label: 'Gyva',      icon: '🎸' },
  mashup:       { label: 'Mashup',    icon: '🎛️' },
  instrumental: { label: 'Instr.',    icon: '🎼' },
}

type FeaturingArtist = { artist_id: number; name: string }
type AlbumRef = { album_id: number; album_title: string; album_year: number | null; position: number }
type YTResult = { videoId: string; title: string; channel: string; thumbnail: string }
type LyricsTab = 'lyrics' | 'chords'

function extractYouTubeId(url: string): string {
  return url.match(/(?:v=|youtu\.be\/)([^&?]+)/)?.[1] || ''
}

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
    else setRaw(value)
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
    <div className="space-y-1.5">
      {value ? (
        <div className="relative rounded-lg overflow-hidden group cursor-pointer"
          onClick={() => !uploading && fileRef.current?.click()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) upload(f) }}
          onDragOver={e => e.preventDefault()}>
          <img src={value} alt="" referrerPolicy="no-referrer" className="w-full object-contain bg-gray-900 group-hover:opacity-90 transition-opacity" style={{ height: '160px' }} />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span className="text-white text-sm font-medium">Keisti ↗</span>
          </div>
          {uploading && <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>}
        </div>
      ) : (
        <div className="relative w-full rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 cursor-pointer hover:border-blue-400 transition-colors flex items-center justify-center" style={{ height: '160px' }}
          onClick={() => !uploading && fileRef.current?.click()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) upload(f) }}
          onDragOver={e => e.preventDefault()}>
          <div className="text-center text-gray-400">
            <svg className="w-8 h-8 mx-auto mb-1 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-xs">Įkelti viršelį</span>
          </div>
          {uploading && <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-lg">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>}
        </div>
      )}
      <div className="flex gap-1.5">
        <input type="text" value={urlInput} onChange={e => setUrlInput(e.target.value)}
          onBlur={e => commitUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && commitUrl(urlInput)}
          placeholder="https://..." className="flex-1 min-w-0 px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:border-blue-400 bg-white" />
        <button type="button" onClick={() => fileRef.current?.click()}
          className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-xs font-medium transition-colors shrink-0">📁</button>
        {value && <button type="button" onClick={() => { onChange(''); setUrlInput('') }}
          className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg text-xs transition-colors shrink-0">✕</button>}
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }} />
    </div>
  )
}

export default function AdminTrackEditPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const id = resolvedParams?.id
  const isNewTrack = !id || id === 'new'

  const { data: session, status } = useSession()
  const router = useRouter()

  const [title, setTitle] = useState('')
  const [artistId, setArtistId] = useState(0)
  const [artistName, setArtistName] = useState('')
  const [artistSlug, setArtistSlug] = useState('')
  const [trackType, setTrackType] = useState('normal')
  const [releaseYear, setReleaseYear] = useState('')
  const [releaseMonth, setReleaseMonth] = useState('')
  const [releaseDay, setReleaseDay] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [spotifyId, setSpotifyId] = useState('')
  const [spUrlInput, setSpUrlInput] = useState('')
  const [lyrics, setLyrics] = useState('')
  const [chords, setChords] = useState('')
  const [lyricsTab, setLyricsTab] = useState<LyricsTab>('lyrics')
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
        setChords(data.chords || '')
        setIsNew(data.is_new || false)
        setIsNewDate(data.is_new_date || null)
        setCoverUrl(data.cover_url || '')
        if (data.artists?.name) { setArtistName(data.artists.name); setArtistSlug(data.artists.slug || '') }
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
        lyrics, chords,
        is_new: isNew, is_new_date: isNewDate,
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
  }, [title, artistId, trackType, releaseYear, releaseMonth, releaseDay, videoUrl, spotifyId, lyrics, chords, isNew, isNewDate, coverUrl, featuring, id, isNewTrack])

  const handleDelete = async () => {
    if (!confirm(`Ištrinti "${title}"?`)) return
    setDeleting(true)
    await fetch(`/api/tracks/${id}`, { method: 'DELETE' })
    router.push(artistId ? `/admin/artists/${artistId}` : '/admin/tracks')
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); handleSave() } }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [handleSave])

  const ytId = extractYouTubeId(videoUrl)
  const ytSearchQuery = [artistName, title].filter(Boolean).join(' ')
  const firstAlbumYear = albums[0]?.album_year
  const hasLyrics = lyrics.trim().length > 0
  const hasChords = chords.trim().length > 0

  if (status === 'loading' || !isAdmin) return null

  const InfoPanel = (
    <div className="space-y-2.5 p-3 pb-4">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-2.5">

        {/* Title + Date */}
        <div className="grid grid-cols-[1fr_auto] gap-3 items-start">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Pavadinimas *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Dainos pavadinimas"
              className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-900 text-sm font-medium focus:outline-none focus:border-blue-400 bg-white transition-colors" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Data</label>
            <div className="flex gap-1">
              <DateNum value={releaseYear} onChange={setReleaseYear} min={1900} max={2030} placeholder="Metai" width="w-16" />
              <DateNum value={releaseMonth} onChange={setReleaseMonth} min={1} max={12} placeholder="Mėn" />
              <DateNum value={releaseDay} onChange={setReleaseDay} min={1} max={31} placeholder="D" width="w-11" />
            </div>
            {firstAlbumYear && releaseYear !== String(firstAlbumYear) && (
              <button onClick={() => { setReleaseYear(String(firstAlbumYear)); setReleaseMonth(''); setReleaseDay('') }}
                className="mt-1 text-xs text-blue-500 hover:underline">
                ← Albumo metai ({firstAlbumYear})
              </button>
            )}
          </div>
        </div>

        {/* Artists */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Atlikėjai *</label>
          <div className="flex flex-wrap items-center gap-1.5">
            {artistId ? (
              <div className="flex items-center gap-1 bg-blue-100 text-blue-800 border border-blue-200 rounded-full px-2.5 py-1 text-sm font-semibold shrink-0">
                {artistName}
                <button type="button" onClick={() => { setArtistId(0); setArtistName(''); setArtistSlug('') }}
                  className="text-blue-400 hover:text-red-500 transition-colors leading-none ml-0.5 text-base">×</button>
              </div>
            ) : (
              <div className="flex-1 min-w-[140px]">
                <ArtistSearchInput placeholder="Pagrindinis atlikėjas..." onSelect={(id, name) => { setArtistId(id); setArtistName(name) }} />
              </div>
            )}
            {featuring.map((f, i) => (
              <div key={f.artist_id} className="flex items-center gap-1 bg-gray-100 text-gray-700 border border-gray-200 rounded-full px-2 py-1 text-xs shrink-0">
                <span className="text-gray-400">su</span>
                {f.name}
                <button type="button" onClick={() => setFeaturing(p => p.filter((_, j) => j !== i))}
                  className="text-gray-400 hover:text-red-500 transition-colors leading-none ml-0.5">×</button>
              </div>
            ))}
            {artistId > 0 && (
              <div className="flex-1 min-w-[120px]">
                <ArtistSearchInput placeholder="+ su atlikėju..."
                  onSelect={(id, name) => {
                    if (id === artistId || featuring.find(f => f.artist_id === id)) return
                    setFeaturing(p => [...p, { artist_id: id, name }])
                  }} />
              </div>
            )}
          </div>
        </div>

        {/* Type + Naujas */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Tipas</label>
          <div className="flex flex-wrap gap-1">
            {TRACK_TYPES.map(tp => (
              <button key={tp} type="button" onClick={() => setTrackType(tp)}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                  trackType === tp
                    ? tp === 'single' ? 'bg-amber-500 text-white shadow-sm' : 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {TRACK_TYPE_LABELS[tp].icon} {TRACK_TYPE_LABELS[tp].label}
              </button>
            ))}
            <button type="button" onClick={toggleNew}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                isNew ? 'bg-green-500 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              🆕 Naujas
            </button>
          </div>
          {isNew && isNewDate && <p className="text-xs text-green-500 mt-1">nuo {isNewDate} · išsaugoma automatiškai</p>}
        </div>
      </div>

      {/* Albums */}
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
                <Link href={`/admin/albums/${a.album_id}`} className="text-sm text-gray-900 hover:text-blue-600 truncate block transition-colors">
                  {a.album_title}
                </Link>
                {a.album_year && <span className="text-xs text-gray-400">{a.album_year}</span>}
              </div>
              <button onClick={() => removeFromAlbum(a.album_id)} disabled={removingFromAlbum === a.album_id}
                className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 text-xs px-1 rounded transition-all disabled:opacity-50">
                {removingFromAlbum === a.album_id ? '...' : '✕'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Media */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Media</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1.5">Viršelis</p>
            <CoverMini value={coverUrl} onChange={setCoverUrl} />
          </div>
          <div className="space-y-2.5 min-w-0">
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">🎬 YouTube</p>
              <div className="flex gap-1 mb-1">
                <input value={videoUrl} onChange={e => setVideoUrl(e.target.value)}
                  placeholder="youtube.com/watch?v=..."
                  className="flex-1 min-w-0 px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:border-blue-400 bg-white" />
                {ytId && <button type="button" onClick={() => setVideoUrl('')}
                  className="px-2 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg text-xs transition-colors shrink-0">✕</button>}
              </div>
              {ytId && (
                <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="block relative rounded-lg overflow-hidden group mb-1">
                  <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt=""
                    className="w-full aspect-video object-cover group-hover:opacity-90 transition-opacity" />
                  <span className="absolute bottom-1 right-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">↗</span>
                </a>
              )}
              <YouTubeSearch initialQuery={ytSearchQuery} onSelect={url => setVideoUrl(url)} />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">🎧 Spotify</p>
              <input value={spotifyId} onChange={e => setSpotifyId(e.target.value)} placeholder="Track ID..."
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-gray-900 text-xs focus:outline-none focus:border-blue-400 font-mono transition-colors" />
              {spotifyId && (
                <a href={`https://open.spotify.com/track/${spotifyId}`} target="_blank" rel="noopener noreferrer"
                  className="mt-1 flex items-center gap-1 text-xs text-green-600 hover:text-green-700 transition-colors">
                  🔗 Atidaryti Spotify
                </a>
              )}
              <div className="flex gap-1 mt-1">
                <input value={spUrlInput} onChange={e => setSpUrlInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { const m = spUrlInput.match(/track\/([A-Za-z0-9]+)/); if (m) { setSpotifyId(m[1]); setSpUrlInput('') } } }}
                  placeholder="Spotify URL..."
                  className="flex-1 min-w-0 px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:border-blue-400 bg-white" />
                <button type="button"
                  onClick={() => { const m = spUrlInput.match(/track\/([A-Za-z0-9]+)/); if (m) { setSpotifyId(m[1]); setSpUrlInput('') } }}
                  className="px-2.5 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold transition-colors shrink-0">✓</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    // KEY FIX: h-screen + overflow-hidden on root prevents any page-level scroll
    <div className="h-screen overflow-hidden flex flex-col bg-[#f8f7f5]">

      {/* Sticky header */}
      <div className="shrink-0 bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="flex items-center justify-between gap-3 px-4 py-2">
          <nav className="flex items-center gap-1 text-sm min-w-0">
            <Link href="/admin" className="text-gray-400 hover:text-gray-700 shrink-0">Admin</Link>
            {artistId > 0 && <>
              <span className="text-gray-300">/</span>
              <Link href={`/admin/artists/${artistId}`} className="text-gray-400 hover:text-gray-700 shrink-0">{artistName}</Link>
              <span className="text-gray-300">/</span>
              <Link href={`/admin/albums?artist=${artistId}`} className="text-gray-400 hover:text-gray-700 shrink-0">Albumai</Link>
              <span className="text-gray-300">/</span>
              <Link href={`/admin/tracks?artist=${artistId}`} className="text-gray-400 hover:text-gray-700 shrink-0">Dainos</Link>
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
      </div>

      {/* Error */}
      {error && (
        <div className="shrink-0 px-3 pt-2">
          <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-center gap-2">
            ❌ {error}
            <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">✕</button>
          </div>
        </div>
      )}

      {/* Body — fills remaining height exactly */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-2 min-h-0">

          {/* Left: scrollable info panel */}
          <div className="border-r border-gray-200 overflow-y-auto">
            {InfoPanel}
          </div>

          {/* Right: lyrics — fills height exactly, textarea scrolls internally */}
          <div className="flex flex-col min-h-0 bg-[#f8f7f5] p-3 gap-0">
            {/* Tab bar */}
            <div className="bg-white rounded-t-xl border border-gray-100 shadow-sm shrink-0 flex items-center">
              <button onClick={() => setLyricsTab('lyrics')}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-tl-xl transition-colors ${
                  lyricsTab === 'lyrics' ? 'text-blue-600 bg-blue-50/60' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}>
                Dainos tekstas
                {hasLyrics && <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />}
              </button>
              <div className="w-px h-5 bg-gray-200 shrink-0" />
              <button onClick={() => setLyricsTab('chords')}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold transition-colors ${
                  lyricsTab === 'chords' ? 'text-blue-600 bg-blue-50/60' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}>
                Akordai
                {hasChords && <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />}
              </button>
            </div>
            {/* Textarea — flex-1 fills remaining, overflow-y-auto scrolls internally */}
            <textarea
              key={lyricsTab}
              value={lyricsTab === 'lyrics' ? lyrics : chords}
              onChange={e => lyricsTab === 'lyrics' ? setLyrics(e.target.value) : setChords(e.target.value)}
              placeholder={lyricsTab === 'lyrics' ? 'Dainos žodžiai...' : 'Am  G  F  G\nVerse 1...'}
              className="flex-1 min-h-0 w-full px-3 py-2.5 text-sm text-gray-900 bg-white border border-t-0 border-gray-100 shadow-sm rounded-b-xl focus:outline-none resize-none font-mono leading-relaxed overflow-y-auto"
            />
          </div>
        </div>
      )}
    </div>
  )
}
