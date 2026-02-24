'use client'

import { useState, useEffect, use } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const TRACK_TYPES = ['normal', 'single', 'remix', 'live', 'mashup', 'instrumental'] as const
const TRACK_TYPE_LABELS: Record<string, string> = {
  normal: 'Įprastinė', single: '💿 Singlas', remix: 'Remix', live: 'Gyva', mashup: 'Mashup', instrumental: 'Instrumentinė'
}

type FeaturingArtist = { artist_id: number; name: string }
type AlbumRef = { album_id: number; album_title: string; album_year: number | null; position: number }
type YTResult = { videoId: string; title: string; channel: string; thumbnail: string }
type SPResult = { id: string; name: string; artists: string; album: string }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="px-5 py-3 border-b border-gray-100">
        <h2 className="text-xs font-bold text-gray-600 uppercase tracking-wide">{title}</h2>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  )
}

function extractYouTubeId(url: string): string {
  return url.match(/(?:v=|youtu\.be\/)([^&?]+)/)?.[1] || ''
}

function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parts = value ? value.split('-') : ['', '', '']
  const year = parts[0] || ''
  const month = parts[1] || ''
  const day = parts[2] || ''

  const update = (y: string, m: string, d: string) => {
    if (!y && !m && !d) { onChange(''); return }
    if (y.length === 4) {
      onChange(`${y}-${(m || '1').padStart(2, '0')}-${(d || '1').padStart(2, '0')}`)
    } else onChange('')
  }

  const cls = "px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:border-music-blue [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"

  return (
    <div className="flex gap-2 items-center">
      <input type="number" min="1900" max="2099" value={year}
        onChange={e => update(e.target.value, month, day)}
        placeholder="Metai" className={`w-24 ${cls}`} />
      <span className="text-gray-400">/</span>
      <input type="number" min="1" max="12" value={month ? String(parseInt(month)) : ''}
        onChange={e => update(year, e.target.value, day)}
        placeholder="Mėn" className={`w-16 ${cls}`} />
      <span className="text-gray-400">/</span>
      <input type="number" min="1" max="31" value={day ? String(parseInt(day)) : ''}
        onChange={e => update(year, month, e.target.value)}
        placeholder="D" className={`w-16 ${cls}`} />
      {value && <button onClick={() => onChange('')} className="text-gray-400 hover:text-red-500 ml-1">✕</button>}
    </div>
  )
}

const inp = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:border-music-blue"

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
  const [releaseDate, setReleaseDate] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [spotifyId, setSpotifyId] = useState('')
  const [lyrics, setLyrics] = useState('')
  const [description, setDescription] = useState('')
  const [isNew, setIsNew] = useState(false)
  const [isNewDate, setIsNewDate] = useState<string | null>(null)
  const [coverUrl, setCoverUrl] = useState('')
  const [coverUrlInput, setCoverUrlInput] = useState('')
  const [uploadingCover, setUploadingCover] = useState(false)

  const [artistSearch, setArtistSearch] = useState('')
  const [artistResults, setArtistResults] = useState<any[]>([])
  const [featuring, setFeaturing] = useState<FeaturingArtist[]>([])
  const [albums, setAlbums] = useState<AlbumRef[]>([])
  const [removingFromAlbum, setRemovingFromAlbum] = useState<number | null>(null)
  const [featSearch, setFeatSearch] = useState('')
  const [featResults, setFeatResults] = useState<any[]>([])

  const [ytQuery, setYtQuery] = useState('')
  const [ytResults, setYtResults] = useState<YTResult[]>([])
  const [ytLoading, setYtLoading] = useState(false)

  const [spQuery, setSpQuery] = useState('')
  const [spResults, setSpResults] = useState<SPResult[]>([])
  const [spLoading, setSpLoading] = useState(false)

  const [saving, setSaving] = useState(false)
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
        setReleaseDate(data.release_date?.slice(0, 10) || '')
        setVideoUrl(data.video_url || '')
        setSpotifyId(data.spotify_id || '')
        setLyrics(data.lyrics || '')
        setDescription(data.description || '')
        setIsNew(data.is_new || false)
        setIsNewDate(data.is_new_date || null)
        setCoverUrl(data.cover_url || '')
        setCoverUrlInput(data.cover_url || '')
        if (data.artists?.name) { setArtistName(data.artists.name); setArtistSlug(data.artists.slug || '') }
        if (data.featuring) setFeaturing(data.featuring)
        if (data.albums) setAlbums(data.albums)
        setYtQuery(`${data.artists?.name || ''} ${data.title || ''}`)
        setSpQuery(`${data.artists?.name || ''} ${data.title || ''}`)
      })
      .finally(() => setLoading(false))
  }, [id, isAdmin])

  useEffect(() => {
    if (artistSearch.length < 2) { setArtistResults([]); return }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/artists?search=${encodeURIComponent(artistSearch)}&limit=6`)
      setArtistResults((await r.json()).artists || [])
    }, 200)
    return () => clearTimeout(t)
  }, [artistSearch])

  useEffect(() => {
    if (featSearch.length < 2) { setFeatResults([]); return }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/artists?search=${encodeURIComponent(featSearch)}&limit=6`)
      setFeatResults((await r.json()).artists || [])
    }, 200)
    return () => clearTimeout(t)
  }, [featSearch])

  // Toggle "Naujas" and immediately save
  const toggleNew = async () => {
    const newVal = !isNew
    const newDate = newVal ? new Date().toISOString().slice(0, 10) : null
    setIsNew(newVal)
    setIsNewDate(newDate)
    if (!isNewTrack) {
      await fetch(`/api/tracks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_new: newVal, is_new_date: newDate, _partial: true }),
      })
    }
  }

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingCover(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', 'track')
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.url) { setCoverUrl(data.url); setCoverUrlInput(data.url) }
    } finally { setUploadingCover(false) }
  }

  const applyCoverUrl = async () => {
    const url = coverUrlInput.trim()
    if (!url) return
    // If it's already our own storage URL, just use it
    if (url.includes('supabase.co') || url.startsWith('/')) {
      setCoverUrl(url)
      return
    }
    // Otherwise download and re-upload to our storage
    setUploadingCover(true)
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      if (data.url) { setCoverUrl(data.url); setCoverUrlInput(data.url) }
      else setError(data.error || 'Nepavyko įkelti paveikslėlio')
    } catch (e: any) { setError(e.message) }
    finally { setUploadingCover(false) }
  }

  const removeFromAlbum = async (albumId: number) => {
    if (!confirm('Pašalinti šią dainą iš albumo?')) return
    setRemovingFromAlbum(albumId)
    try {
      await fetch(`/api/album-tracks?track_id=${id}&album_id=${albumId}`, { method: 'DELETE' })
      setAlbums(p => p.filter(a => a.album_id !== albumId))
    } finally { setRemovingFromAlbum(null) }
  }

  const handleYtSearch = async () => {
    if (!ytQuery.trim()) return
    setYtLoading(true); setYtResults([])
    try {
      const r = await fetch(`/api/search/youtube?q=${encodeURIComponent(ytQuery)}`)
      setYtResults((await r.json()).results || [])
    } finally { setYtLoading(false) }
  }

  const handleSpSearch = async () => {
    if (!spQuery.trim()) return
    setSpLoading(true); setSpResults([])
    try {
      const r = await fetch(`/api/search/spotify?q=${encodeURIComponent(spQuery)}`)
      setSpResults((await r.json()).results || [])
    } finally { setSpLoading(false) }
  }

  const handleSave = async () => {
    if (!title.trim()) { setError('Pavadinimas privalomas'); return }
    if (!artistId) { setError('Pasirinkite atlikėją'); return }
    setSaving(true); setError('')
    try {
      const payload = {
        title, artist_id: artistId, type: trackType, release_date: releaseDate,
        video_url: videoUrl, spotify_id: spotifyId, lyrics, description,
        is_new: isNew, is_new_date: isNewDate, cover_url: coverUrl, featuring,
      }
      const res = await fetch(isNewTrack ? '/api/tracks' : `/api/tracks/${id}`, {
        method: isNewTrack ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.push('/admin/tracks')
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!confirm(`Ar tikrai ištrinti "${title}"? Daina bus pašalinta iš visų albumų.`)) return
    setDeleting(true)
    await fetch(`/api/tracks/${id}`, { method: 'DELETE' })
    router.push('/admin/tracks')
  }

  const ytId = extractYouTubeId(videoUrl)

  if (status === 'loading' || !isAdmin) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full px-6 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div>
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-sm text-gray-400 mb-1">
              <Link href="/admin" className="hover:text-music-blue">Admin</Link>
              <span>/</span>
              <Link href="/admin/tracks" className="hover:text-music-blue">Dainos</Link>
              {artistId > 0 && (
                <>
                  <span>/</span>
                  <Link href={`/admin/artists/${artistSlug || artistId}`} className="hover:text-music-blue">{artistName}</Link>
                  <span>/</span>
                  <Link href={`/admin/albums?artist=${artistId}`} className="hover:text-music-blue text-xs">albumai</Link>
                </>
              )}
              <span>/</span>
              <span className="text-gray-600 font-medium">{title || 'Nauja daina'}</span>
            </div>
            <h1 className="text-2xl font-black text-gray-900">
              {isNewTrack ? '🎵 Nauja daina' : '✏️ Redaguoti dainą'}
            </h1>
          </div>
          {/* Action buttons - top only */}
          <div className="flex gap-2">
            <Link href="/admin/tracks"
              className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50">
              Atšaukti
            </Link>
            {!isNewTrack && (
              <button onClick={handleDelete} disabled={deleting}
                className="px-4 py-2.5 border border-red-200 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50 disabled:opacity-50">
                {deleting ? '...' : '🗑️ Ištrinti'}
              </button>
            )}
            <button onClick={handleSave} disabled={saving}
              className="px-6 py-2.5 bg-music-blue text-white font-bold rounded-xl hover:opacity-90 disabled:opacity-50">
              {saving ? 'Saugoma...' : '✓ Išsaugoti'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">❌ {error}</div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-music-blue border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-5 mt-4">

            {/* === COL 1 === */}
            <div className="space-y-5">
              <Card title="Pagrindinė informacija">

                {/* Artist first */}
                <Field label="Atlikėjas *">
                  {artistId ? (
                    <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                      <span className="flex-1 text-sm font-medium text-gray-900">{artistName}</span>
                      <button onClick={() => { setArtistId(0); setArtistName(''); setArtistSlug('') }}
                        className="text-xs text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-300 bg-white rounded px-1.5 py-0.5">
                        keisti
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input value={artistSearch} onChange={e => setArtistSearch(e.target.value)}
                        placeholder="Ieškoti atlikėjo..." className={inp} />
                      {artistResults.length > 0 && (
                        <div className="absolute z-20 w-full bg-white border border-gray-200 rounded-xl shadow-xl mt-1 overflow-hidden">
                          {artistResults.map(a => (
                            <button key={a.id} onClick={() => { setArtistId(a.id); setArtistName(a.name); setArtistSlug(a.slug || ''); setArtistSearch(''); setArtistResults([]) }}
                              className="w-full px-4 py-2.5 hover:bg-blue-50 text-left text-sm font-medium text-gray-900">
                              {a.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </Field>

                {/* Title + cover side by side */}
                <Field label="Pavadinimas *">
                  <div className="flex gap-3 items-start">
                    {/* Cover */}
                    <div className="shrink-0">
                      {coverUrl ? (
                        <div className="relative group w-16 h-16">
                          <img src={coverUrl} alt="" className="w-16 h-16 rounded-lg object-cover border border-gray-200" />
                          <button onClick={() => { setCoverUrl(''); setCoverUrlInput('') }}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs hidden group-hover:flex items-center justify-center">×</button>
                        </div>
                      ) : (
                        <label className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 hover:border-music-blue cursor-pointer flex flex-col items-center justify-center gap-0.5 transition-colors">
                          <span className="text-xl">🖼️</span>
                          <span className="text-xs text-gray-400 text-center leading-tight">viršelis</span>
                          <input type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} disabled={uploadingCover} />
                        </label>
                      )}
                    </div>
                    <input value={title} onChange={e => setTitle(e.target.value)}
                      placeholder="Dainos pavadinimas" className={`flex-1 ${inp}`} />
                  </div>
                </Field>

                {/* Cover URL input */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Viršelio URL</label>
                  <div className="flex gap-2">
                    <input value={coverUrlInput} onChange={e => setCoverUrlInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && applyCoverUrl()}
                      placeholder="https://..." 
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:border-music-blue" />
                    <button onClick={applyCoverUrl}
                      className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium">
                      ✓
                    </button>
                  </div>
                </div>

                {/* Featuring */}
                <Field label="Featuring atlikėjai">
                  {featuring.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {featuring.map(f => (
                        <span key={f.artist_id} className="flex items-center gap-1 bg-purple-50 border border-purple-200 rounded-lg px-2 py-0.5">
                          <span className="text-sm text-purple-800 font-medium">{f.name}</span>
                          <button onClick={() => setFeaturing(p => p.filter(x => x.artist_id !== f.artist_id))}
                            className="text-purple-400 hover:text-purple-700 font-bold text-xs">×</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="relative">
                    <input value={featSearch} onChange={e => setFeatSearch(e.target.value)}
                      placeholder="Pridėti feat. atlikėją..." className={inp} />
                    {featResults.length > 0 && (
                      <div className="absolute z-20 w-full bg-white border border-gray-200 rounded-xl shadow-xl mt-1 overflow-hidden">
                        {featResults.filter(a => a.id !== artistId && !featuring.find(f => f.artist_id === a.id)).map(a => (
                          <button key={a.id} onClick={() => { setFeaturing(p => [...p, { artist_id: a.id, name: a.name }]); setFeatSearch(''); setFeatResults([]) }}
                            className="w-full px-4 py-2.5 hover:bg-purple-50 text-left text-sm font-medium text-gray-900">
                            {a.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </Field>

                {/* Release date */}
                <Field label="Išleidimo data">
                  <DateInput value={releaseDate} onChange={setReleaseDate} />
                  {albums.length > 0 && !releaseDate && albums[0].album_year && (
                    <button onClick={() => setReleaseDate(`${albums[0].album_year}-01-01`)}
                      className="mt-1.5 text-xs text-music-blue hover:underline">
                      ← Naudoti albumo metus ({albums[0].album_year})
                    </button>
                  )}
                </Field>

                {/* Type - now includes Single */}
                <Field label="Tipas">
                  <div className="flex flex-wrap gap-1.5">
                    {TRACK_TYPES.map(tp => (
                      <button key={tp} onClick={() => setTrackType(tp)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                          trackType === tp
                            ? tp === 'single' ? 'bg-amber-500 text-white' : 'bg-music-blue text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}>
                        {TRACK_TYPE_LABELS[tp]}
                      </button>
                    ))}
                  </div>
                </Field>

                {/* Naujas toggle – auto save */}
                <div>
                  <button onClick={toggleNew}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      isNew ? 'bg-green-50 border-green-300 text-green-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}>
                    🆕 Naujas
                    {isNew && isNewDate && (
                      <span className="text-xs text-green-500 font-normal">nuo {isNewDate}</span>
                    )}
                  </button>
                  <p className="text-xs text-gray-400 mt-1">Išsaugoma automatiškai</p>
                </div>
              </Card>

              {/* Albums with remove button */}
              {albums.length > 0 && (
                <Card title={`Albumai (${albums.length})`}>
                  <div className="-my-2">
                    {albums.map(a => (
                      <div key={a.album_id} className="flex items-center gap-2 py-2 border-b border-gray-50 last:border-0 group">
                        <span className="text-gray-300 text-xs w-5 text-right shrink-0">{a.position}.</span>
                        <div className="flex-1 min-w-0">
                          <Link href={`/admin/albums/${a.album_id}`}
                            className="text-sm font-medium text-gray-900 hover:text-music-blue truncate block">
                            {a.album_title}
                          </Link>
                          {a.album_year && <span className="text-xs text-gray-400">{a.album_year}</span>}
                        </div>
                        <button
                          onClick={() => removeFromAlbum(a.album_id)}
                          disabled={removingFromAlbum === a.album_id}
                          title="Pašalinti iš albumo"
                          className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs px-1.5 py-0.5 rounded border border-transparent hover:border-red-200 transition-all disabled:opacity-50">
                          {removingFromAlbum === a.album_id ? '...' : '✕'}
                        </button>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Description */}
              <Card title="📝 Aprašymas">
                <textarea value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="Trumpas aprašymas apie dainą..." rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:border-music-blue resize-none" />
              </Card>
            </div>

            {/* === COL 2: YouTube + Spotify === */}
            <div className="space-y-5">
              <Card title="🎬 YouTube video">
                {ytId && (
                  <div className="rounded-xl overflow-hidden bg-black aspect-video">
                    <iframe src={`https://www.youtube.com/embed/${ytId}`} className="w-full h-full" allowFullScreen />
                  </div>
                )}
                <Field label="Video URL">
                  <div className="flex gap-2">
                    <input value={videoUrl} onChange={e => setVideoUrl(e.target.value)}
                      placeholder="https://youtube.com/watch?v=..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:border-red-400" />
                    {videoUrl && (
                      <button onClick={() => setVideoUrl('')}
                        className="px-2.5 text-red-400 hover:text-red-600 border border-gray-200 bg-white rounded-lg">×</button>
                    )}
                  </div>
                </Field>
                <div className="pt-1 border-t border-gray-100">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Ieškoti YouTube</label>
                  <div className="flex gap-2 mb-2">
                    <input value={ytQuery} onChange={e => setYtQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleYtSearch()}
                      placeholder="Atlikėjas daina..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:border-red-400" />
                    <button onClick={handleYtSearch} disabled={ytLoading}
                      className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold disabled:opacity-50">
                      {ytLoading ? '⏳' : '🔍'}
                    </button>
                  </div>
                  {ytResults.length > 0 && (
                    <div className="space-y-1.5 max-h-72 overflow-y-auto">
                      {ytResults.map(r => (
                        <div key={r.videoId} onClick={() => setVideoUrl(`https://www.youtube.com/watch?v=${r.videoId}`)}
                          className={`flex gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors ${
                            ytId === r.videoId ? 'border-red-400 bg-red-50' : 'border-gray-100 hover:bg-gray-50'
                          }`}>
                          <img src={r.thumbnail} alt="" className="w-20 h-12 object-cover rounded shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-gray-900 line-clamp-2 leading-snug">{r.title}</div>
                            <div className="text-xs text-gray-400 mt-0.5 truncate">{r.channel}</div>
                          </div>
                          {ytId === r.videoId && <span className="text-red-500 shrink-0 font-bold">✓</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>

              <Card title="🎵 Spotify">
                {spotifyId && (
                  <iframe src={`https://open.spotify.com/embed/track/${spotifyId}`}
                    width="100%" height="80" frameBorder="0" allow="encrypted-media" className="rounded-lg" />
                )}
                <Field label="Spotify Track ID">
                  <div className="flex gap-2">
                    <input value={spotifyId} onChange={e => setSpotifyId(e.target.value)}
                      placeholder="0abc123..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:border-green-500" />
                    {spotifyId && (
                      <button onClick={() => setSpotifyId('')}
                        className="px-2.5 text-red-400 hover:text-red-600 border border-gray-200 bg-white rounded-lg">×</button>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">open.spotify.com/track/<strong>ID čia</strong></p>
                </Field>
                <div className="pt-1 border-t border-gray-100">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Ieškoti Spotify</label>
                  <div className="flex gap-2 mb-2">
                    <input value={spQuery} onChange={e => setSpQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSpSearch()}
                      placeholder="Atlikėjas daina..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:border-green-500" />
                    <button onClick={handleSpSearch} disabled={spLoading}
                      className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-bold disabled:opacity-50">
                      {spLoading ? '⏳' : '🔍'}
                    </button>
                  </div>
                  {spResults.length > 0 && (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {spResults.map(r => (
                        <div key={r.id} onClick={() => setSpotifyId(r.id)}
                          className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                            spotifyId === r.id ? 'border-green-400 bg-green-50' : 'border-gray-100 hover:bg-gray-50'
                          }`}>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">{r.name}</div>
                            <div className="text-xs text-gray-500 truncate">{r.artists} · {r.album}</div>
                          </div>
                          {spotifyId === r.id
                            ? <span className="text-green-500 font-bold shrink-0">✓</span>
                            : <span className="text-gray-300 text-xs shrink-0">►</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* === COL 3: Lyrics === */}
            <div>
              <Card title="✍️ Žodžiai / Lyrics">
                <textarea value={lyrics} onChange={e => setLyrics(e.target.value)}
                  placeholder="Dainos žodžiai..."
                  style={{ minHeight: '640px' }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:border-music-blue resize-y font-mono leading-relaxed" />
              </Card>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
