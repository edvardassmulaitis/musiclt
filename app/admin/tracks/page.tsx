'use client'

import { useState, useEffect, use } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const TRACK_TYPES = ['normal', 'remix', 'live', 'mashup', 'instrumental'] as const
const TRACK_TYPE_LABELS: Record<string, string> = {
  normal: 'Įprastinė', remix: 'Remix', live: 'Gyva', mashup: 'Mashup', instrumental: 'Instrumentinė'
}

type FeaturingArtist = { artist_id: number; name: string }
type AlbumRef = { album_id: number; album_title: string; album_year: number | null; position: number; is_single: boolean }
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
  const [releaseDate, setReleaseDate] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [spotifyId, setSpotifyId] = useState('')
  const [lyrics, setLyrics] = useState('')
  const [description, setDescription] = useState('')
  const [isNewFlag, setIsNewFlag] = useState(false)
  const [showPlayer, setShowPlayer] = useState(false)

  const [artistSearch, setArtistSearch] = useState('')
  const [artistResults, setArtistResults] = useState<any[]>([])
  const [featuring, setFeaturing] = useState<FeaturingArtist[]>([])
  const [albums, setAlbums] = useState<AlbumRef[]>([])
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
        setIsNewFlag(data.is_new || false)
        setShowPlayer(data.show_player || false)
        if (data.artists?.name) setArtistName(data.artists.name)
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
        is_new: isNewFlag, show_player: showPlayer, featuring,
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
    if (!confirm(`Ištrinti "${title}"?`)) return
    setDeleting(true)
    await fetch(`/api/tracks/${id}`, { method: 'DELETE' })
    router.push('/admin/tracks')
  }

  const ytId = extractYouTubeId(videoUrl)

  if (status === 'loading' || !isAdmin) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-6 py-6">

        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/admin/tracks" className="text-music-blue text-sm">← Dainos</Link>
            <h1 className="text-2xl font-black text-gray-900 mt-1">
              {isNewTrack ? '🎵 Nauja daina' : '✏️ Redaguoti dainą'}
            </h1>
          </div>
          <div className="flex gap-3">
            {!isNewTrack && (
              <button onClick={handleDelete} disabled={deleting}
                className="px-4 py-2.5 border border-red-200 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50 disabled:opacity-50">
                🗑️ Ištrinti
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
          <div className="grid grid-cols-3 gap-5">

            {/* === COL 1: Basic info === */}
            <div className="space-y-5">
              <Card title="Pagrindinė informacija">
                <Field label="Pavadinimas *">
                  <input value={title} onChange={e => setTitle(e.target.value)}
                    placeholder="Dainos pavadinimas"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-music-blue" />
                </Field>

                <Field label="Atlikėjas *">
                  {artistId ? (
                    <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                      <span className="flex-1 text-sm font-medium text-gray-900">{artistName}</span>
                      <button onClick={() => { setArtistId(0); setArtistName('') }}
                        className="text-red-400 hover:text-red-600 font-bold text-lg leading-none">×</button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input value={artistSearch} onChange={e => setArtistSearch(e.target.value)}
                        placeholder="Ieškoti atlikėjo..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-music-blue" />
                      {artistResults.length > 0 && (
                        <div className="absolute z-20 w-full bg-white border border-gray-200 rounded-xl shadow-xl mt-1 overflow-hidden">
                          {artistResults.map(a => (
                            <button key={a.id} onClick={() => { setArtistId(a.id); setArtistName(a.name); setArtistSearch(''); setArtistResults([]) }}
                              className="w-full px-4 py-2.5 hover:bg-blue-50 text-left text-sm font-medium text-gray-900">
                              {a.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </Field>

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
                      placeholder="Pridėti feat. atlikėją..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-purple-400" />
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

                <Field label="Tipas">
                  <div className="flex flex-wrap gap-1.5">
                    {TRACK_TYPES.map(tp => (
                      <button key={tp} onClick={() => setTrackType(tp)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                          trackType === tp ? 'bg-music-blue text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}>
                        {TRACK_TYPE_LABELS[tp]}
                      </button>
                    ))}
                  </div>
                </Field>

                <Field label="Išleidimo data">
                  <input type="date" value={releaseDate} onChange={e => setReleaseDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-music-blue" />
                  {albums.length > 0 && !releaseDate && albums[0].album_year && (
                    <button onClick={() => setReleaseDate(`${albums[0].album_year}-01-01`)}
                      className="mt-1 text-xs text-music-blue hover:underline">
                      ← Naudoti albumo metus ({albums[0].album_year})
                    </button>
                  )}
                </Field>

                <div className="flex gap-4 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={isNewFlag} onChange={e => setIsNewFlag(e.target.checked)} className="accent-music-blue" />
                    <span className="text-sm text-gray-700">🆕 Naujas</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={showPlayer} onChange={e => setShowPlayer(e.target.checked)} className="accent-music-blue" />
                    <span className="text-sm text-gray-700">▶️ Grotuvą</span>
                  </label>
                </div>
              </Card>

              {/* Albums list */}
              {albums.length > 0 && (
                <Card title={`Albumai (${albums.length})`}>
                  <div className="-my-2">
                    {albums.map(a => (
                      <div key={a.album_id} className="flex items-center gap-2 py-2 border-b border-gray-50 last:border-0">
                        <span className="text-gray-300 text-xs w-5 text-right shrink-0">{a.position}.</span>
                        <div className="flex-1 min-w-0">
                          <Link href={`/admin/albums/${a.album_id}`}
                            className="text-sm font-medium text-gray-900 hover:text-music-blue truncate block">
                            {a.album_title}
                          </Link>
                          {a.album_year && <span className="text-xs text-gray-400">{a.album_year}</span>}
                        </div>
                        {a.is_single && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full shrink-0">Singlas</span>}
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Lyrics */}
              <Card title="✍️ Žodžiai">
                <textarea value={lyrics} onChange={e => setLyrics(e.target.value)}
                  placeholder="Dainos žodžiai..." rows={8}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-music-blue resize-none font-mono" />
              </Card>
            </div>

            {/* === COL 2: YouTube === */}
            <div className="space-y-5">
              <Card title="🎬 YouTube video">
                {/* Preview */}
                {ytId && (
                  <div className="rounded-xl overflow-hidden bg-black aspect-video">
                    <iframe src={`https://www.youtube.com/embed/${ytId}`}
                      className="w-full h-full" allowFullScreen />
                  </div>
                )}

                <Field label="Video URL">
                  <div className="flex gap-2">
                    <input value={videoUrl} onChange={e => setVideoUrl(e.target.value)}
                      placeholder="https://youtube.com/watch?v=..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-red-400" />
                    {videoUrl && (
                      <button onClick={() => setVideoUrl('')}
                        className="px-2.5 text-red-400 hover:text-red-600 border border-gray-200 rounded-lg text-lg leading-none">×</button>
                    )}
                  </div>
                </Field>

                <div className="pt-1 border-t border-gray-100">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Ieškoti YouTube</label>
                  <div className="flex gap-2 mb-2">
                    <input value={ytQuery} onChange={e => setYtQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleYtSearch()}
                      placeholder="Atlikėjas daina..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-red-400" />
                    <button onClick={handleYtSearch} disabled={ytLoading}
                      className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold disabled:opacity-50">
                      {ytLoading ? '⏳' : '🔍'}
                    </button>
                  </div>
                  {ytResults.length > 0 && (
                    <div className="space-y-1.5 max-h-96 overflow-y-auto">
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
            </div>

            {/* === COL 3: Spotify + Description === */}
            <div className="space-y-5">
              <Card title="🎵 Spotify">
                {/* Preview */}
                {spotifyId && (
                  <iframe src={`https://open.spotify.com/embed/track/${spotifyId}`}
                    width="100%" height="80" frameBorder="0" allow="encrypted-media"
                    className="rounded-lg" />
                )}

                <Field label="Spotify Track ID">
                  <div className="flex gap-2">
                    <input value={spotifyId} onChange={e => setSpotifyId(e.target.value)}
                      placeholder="0abc123..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-green-500" />
                    {spotifyId && (
                      <button onClick={() => setSpotifyId('')}
                        className="px-2.5 text-red-400 hover:text-red-600 border border-gray-200 rounded-lg text-lg leading-none">×</button>
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
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-green-500" />
                    <button onClick={handleSpSearch} disabled={spLoading}
                      className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-bold disabled:opacity-50">
                      {spLoading ? '⏳' : '🔍'}
                    </button>
                  </div>
                  {spResults.length > 0 && (
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
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

              <Card title="📝 Aprašymas">
                <textarea value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="Trumpas aprašymas apie dainą..." rows={5}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-music-blue resize-none" />
              </Card>
            </div>
          </div>
        )}

        {!loading && (
          <div className="mt-5 flex gap-3">
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-3.5 bg-music-blue text-white font-bold rounded-xl hover:opacity-90 disabled:opacity-50 text-base">
              {saving ? 'Saugoma...' : '✓ Išsaugoti dainą'}
            </button>
            <Link href="/admin/tracks"
              className="px-8 py-3.5 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 flex items-center font-medium">
              Atšaukti
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
