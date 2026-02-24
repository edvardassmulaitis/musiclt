'use client'

import { useState, useEffect, use } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const TRACK_TYPES = ['normal', 'remix', 'live', 'mashup', 'instrumental'] as const
const TRACK_TYPE_LABELS: Record<string, string> = {
  normal: 'Įprastinė', remix: 'Remix', live: 'Gyva', mashup: 'Mashup', instrumental: 'Instrumentinė'
}

type TrackForm = {
  title: string
  artist_id: number
  type: string
  release_date: string
  video_url: string
  spotify_id: string
  lyrics: string
  description: string
  is_new: boolean
  show_player: boolean
}

type FeaturingArtist = {
  artist_id: number
  name: string
  slug?: string
}

type AlbumRef = {
  album_id: number
  album_title: string
  album_year: number | null
  position: number
  is_single: boolean
}

const emptyForm: TrackForm = {
  title: '', artist_id: 0, type: 'normal',
  release_date: '', video_url: '', spotify_id: '',
  lyrics: '', description: '', is_new: false, show_player: false,
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
        {label}
      </label>
      {children}
    </div>
  )
}

function TextInput({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <input type={type} value={value || ''} onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900
                 focus:outline-none focus:border-music-blue focus:ring-1 focus:ring-music-blue/20 bg-white" />
  )
}

function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-xs font-bold text-gray-600 uppercase tracking-wide">{title}</h2>
        {action}
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  )
}

export default function AdminTrackEditPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const id = resolvedParams?.id
  const isNew = !id || id === 'new'

  const { data: session, status } = useSession()
  const router = useRouter()

  const [form, setForm] = useState<TrackForm>(emptyForm)
  const [artistName, setArtistName] = useState('')
  const [artistSearch, setArtistSearch] = useState('')
  const [artistResults, setArtistResults] = useState<any[]>([])
  const [featuring, setFeaturing] = useState<FeaturingArtist[]>([])
  const [albums, setAlbums] = useState<AlbumRef[]>([])
  const [featSearch, setFeatSearch] = useState('')
  const [featResults, setFeatResults] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(!isNew)

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'
  const set = (f: keyof TrackForm, v: any) => setForm(p => ({ ...p, [f]: v }))

  useEffect(() => { if (status === 'unauthenticated') router.push('/') }, [status])

  // Load existing track
  useEffect(() => {
    if (isNew || !isAdmin) return
    setLoading(true)
    fetch(`/api/tracks/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return }
        setForm({
          title: data.title || '',
          artist_id: data.artist_id || 0,
          type: data.type || 'normal',
          release_date: data.release_date?.slice(0, 10) || '',
          video_url: data.video_url || '',
          spotify_id: data.spotify_id || '',
          lyrics: data.lyrics || '',
          description: data.description || '',
          is_new: data.is_new || false,
          show_player: data.show_player || false,
        })
        if (data.artists?.name) setArtistName(data.artists.name)
        if (data.featuring) setFeaturing(data.featuring)
        if (data.albums) setAlbums(data.albums)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id, isAdmin])

  // Main artist search
  useEffect(() => {
    if (artistSearch.length < 2) { setArtistResults([]); return }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/artists?search=${encodeURIComponent(artistSearch)}&limit=6`)
      const data = await res.json()
      setArtistResults(data.artists || [])
    }, 200)
    return () => clearTimeout(t)
  }, [artistSearch])

  // Featuring artist search
  useEffect(() => {
    if (featSearch.length < 2) { setFeatResults([]); return }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/artists?search=${encodeURIComponent(featSearch)}&limit=6`)
      const data = await res.json()
      setFeatResults(data.artists || [])
    }, 200)
    return () => clearTimeout(t)
  }, [featSearch])

  const addFeaturing = (artist: any) => {
    if (featuring.find(f => f.artist_id === artist.id)) return
    setFeaturing(p => [...p, { artist_id: artist.id, name: artist.name, slug: artist.slug }])
    setFeatSearch('')
    setFeatResults([])
  }

  const removeFeaturing = (artistId: number) => {
    setFeaturing(p => p.filter(f => f.artist_id !== artistId))
  }

  const handleSave = async () => {
    if (!form.title.trim()) { setError('Pavadinimas privalomas'); return }
    if (!form.artist_id) { setError('Pasirinkite atlikėją'); return }
    setSaving(true); setError('')
    try {
      const payload = { ...form, featuring }
      const res = await fetch(isNew ? '/api/tracks' : `/api/tracks/${id}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.push('/admin/tracks')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Ištrinti "${form.title}"? Ši daina bus pašalinta iš visų albumų.`)) return
    setDeleting(true)
    try {
      await fetch(`/api/tracks/${id}`, { method: 'DELETE' })
      router.push('/admin/tracks')
    } catch (e: any) {
      setError(e.message)
      setDeleting(false)
    }
  }

  if (status === 'loading' || !isAdmin) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-6 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/admin/tracks" className="text-music-blue hover:text-music-orange text-sm">
              ← Dainos
            </Link>
            <h1 className="text-2xl font-black text-gray-900 mt-1">
              {isNew ? '🎵 Nauja daina' : '✏️ Redaguoti dainą'}
            </h1>
          </div>
          <div className="flex gap-3">
            {!isNew && (
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
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
            ❌ {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-music-blue border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-5">

            {/* LEFT COLUMN */}
            <div className="space-y-5">

              <Card title="Pagrindinė informacija">

                {/* Title */}
                <Field label="Pavadinimas *">
                  <TextInput value={form.title} onChange={v => set('title', v)}
                    placeholder="Dainos pavadinimas" />
                </Field>

                {/* Main artist */}
                <Field label="Atlikėjas *">
                  {form.artist_id ? (
                    <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                      <span className="flex-1 text-sm font-medium text-gray-900">{artistName}</span>
                      <button type="button"
                        onClick={() => { set('artist_id', 0); setArtistName(''); setArtistSearch('') }}
                        className="text-red-400 hover:text-red-600 font-bold text-lg leading-none">×</button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input type="text" value={artistSearch}
                        onChange={e => setArtistSearch(e.target.value)}
                        placeholder="Ieškoti atlikėjo..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900
                                   focus:outline-none focus:border-music-blue" />
                      {artistResults.length > 0 && (
                        <div className="absolute z-20 w-full bg-white border border-gray-200 rounded-xl shadow-xl mt-1 overflow-hidden">
                          {artistResults.map(a => (
                            <button key={a.id} type="button"
                              onClick={() => {
                                set('artist_id', a.id)
                                setArtistName(a.name)
                                setArtistSearch('')
                                setArtistResults([])
                              }}
                              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 text-left border-b border-gray-50 last:border-0">
                              <span className="font-medium text-gray-900 text-sm">{a.name}</span>
                              {a.country && <span className="text-gray-400 text-xs ml-auto">{a.country}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </Field>

                {/* Featuring artists */}
                <Field label="Featuring atlikėjai">
                  {featuring.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {featuring.map(f => (
                        <div key={f.artist_id}
                          className="flex items-center gap-1.5 bg-purple-50 border border-purple-200 rounded-lg px-2.5 py-1">
                          <span className="text-sm text-purple-800 font-medium">{f.name}</span>
                          <button type="button" onClick={() => removeFeaturing(f.artist_id)}
                            className="text-purple-400 hover:text-purple-600 font-bold leading-none">×</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="relative">
                    <input type="text" value={featSearch}
                      onChange={e => setFeatSearch(e.target.value)}
                      placeholder="Pridėti feat. atlikėją..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900
                                 focus:outline-none focus:border-purple-400" />
                    {featResults.length > 0 && (
                      <div className="absolute z-20 w-full bg-white border border-gray-200 rounded-xl shadow-xl mt-1 overflow-hidden">
                        {featResults
                          .filter(a => a.id !== form.artist_id && !featuring.find(f => f.artist_id === a.id))
                          .map(a => (
                          <button key={a.id} type="button" onClick={() => addFeaturing(a)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-purple-50 text-left border-b border-gray-50 last:border-0">
                            <span className="font-medium text-gray-900 text-sm">{a.name}</span>
                            {a.country && <span className="text-gray-400 text-xs ml-auto">{a.country}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </Field>

                {/* Type */}
                <Field label="Tipas">
                  <div className="flex flex-wrap gap-2">
                    {TRACK_TYPES.map(tp => (
                      <button key={tp} type="button" onClick={() => set('type', tp)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          form.type === tp
                            ? 'bg-music-blue text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}>
                        {TRACK_TYPE_LABELS[tp]}
                      </button>
                    ))}
                  </div>
                </Field>

                {/* Release date */}
                <Field label="Išleidimo data">
                  <TextInput value={form.release_date} onChange={v => set('release_date', v)}
                    placeholder="YYYY-MM-DD" type="date" />
                </Field>

                {/* Flags */}
                <div className="flex gap-5 pt-1">
                  {[
                    ['is_new', '🆕 Naujas'],
                    ['show_player', '▶️ Rodyti grotuvą'],
                  ].map(([k, l]) => (
                    <label key={k} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={(form as any)[k] || false}
                        onChange={e => set(k as keyof TrackForm, e.target.checked)}
                        className="accent-music-blue w-4 h-4" />
                      <span className="text-sm text-gray-700">{l}</span>
                    </label>
                  ))}
                </div>
              </Card>

              <Card title="Nuorodos">
                <Field label="Video URL (YouTube)">
                  <TextInput value={form.video_url} onChange={v => set('video_url', v)}
                    placeholder="https://youtube.com/watch?v=..." />
                </Field>
                <Field label="Spotify ID">
                  <TextInput value={form.spotify_id} onChange={v => set('spotify_id', v)}
                    placeholder="0abc123..." />
                </Field>
              </Card>
            </div>

            {/* RIGHT COLUMN */}
            <div className="space-y-5">

              {/* Albums */}
              {albums.length > 0 && (
                <Card title={`Pasirodo albumuose (${albums.length})`}>
                  <div className="space-y-1 -my-1">
                    {albums.map(a => (
                      <div key={a.album_id}
                        className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                        <span className="text-gray-300 text-xs w-5 text-right shrink-0">{a.position}.</span>
                        <div className="flex-1 min-w-0">
                          <Link href={`/admin/albums/${a.album_id}`}
                            className="text-sm font-medium text-gray-900 hover:text-music-blue truncate block">
                            {a.album_title}
                          </Link>
                          {a.album_year && (
                            <span className="text-xs text-gray-400">{a.album_year}</span>
                          )}
                        </div>
                        {a.is_single && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium shrink-0">
                            Singlas
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Lyrics */}
              <Card title="Žodžiai">
                <textarea value={form.lyrics} onChange={e => set('lyrics', e.target.value)}
                  placeholder="Dainos žodžiai..."
                  rows={albums.length > 0 ? 10 : 14}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900
                             focus:outline-none focus:border-music-blue resize-none font-mono leading-relaxed" />
              </Card>

              {/* Description */}
              <Card title="Aprašymas">
                <textarea value={form.description} onChange={e => set('description', e.target.value)}
                  placeholder="Trumpas aprašymas apie dainą..."
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900
                             focus:outline-none focus:border-music-blue resize-none" />
              </Card>
            </div>
          </div>
        )}

        {/* Bottom save bar */}
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
