'use client'

import { useState, useEffect, use } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const TRACK_TYPES = [
  { value: 'normal', label: 'Įprastinė' },
  { value: 'remix', label: 'Remix' },
  { value: 'live', label: 'Gyva' },
  { value: 'mashup', label: 'Mashup' },
  { value: 'instrumental', label: 'Instrumentinė' },
]

const emptyTrack = {
  title: '', artist_id: 0, type: 'normal',
  release_date: '', is_new: false, video_url: '',
  lyrics: '', chords: '', description: '',
  spotify_id: '', show_player: false,
}

function Inp({ label, value, onChange, placeholder, type = 'text' }: any) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>
      <input type={type} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-music-blue bg-white" />
    </div>
  )
}

function Textarea({ label, value, onChange, placeholder, rows = 4 }: any) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>
      <textarea value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-music-blue bg-white resize-none font-mono" />
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="px-5 py-3 border-b border-gray-100">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

export default function AdminTrackEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const isNew = id === 'new'
  const { data: session, status } = useSession()
  const router = useRouter()
  const [form, setForm] = useState<any>(emptyTrack)
  const [artistSearch, setArtistSearch] = useState('')
  const [artistResults, setArtistResults] = useState<any[]>([])
  const [artistName, setArtistName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'
  const set = (f: string, v: any) => setForm((p: any) => ({ ...p, [f]: v }))

  useEffect(() => { if (status === 'unauthenticated') router.push('/') }, [status])

  useEffect(() => {
    if (!isNew && isAdmin) {
      fetch(`/api/tracks/${id}`).then(r => r.json()).then(data => {
        setForm(data)
        if (data.artists?.name) setArtistName(data.artists.name)
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

  const handleSubmit = async () => {
    if (!form.title.trim()) { setError('Pavadinimas privalomas'); return }
    if (!form.artist_id) { setError('Pasirinkite atlikėją'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(isNew ? '/api/tracks' : `/api/tracks/${id}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.push('/admin/tracks')
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }

  if (status === 'loading' || !isAdmin) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/admin/tracks" className="text-music-blue hover:text-music-orange text-sm">← Dainos</Link>
            <h1 className="text-2xl font-black text-gray-900 mt-1">{isNew ? '🎵 Nauja daina' : '✏️ Redaguoti dainą'}</h1>
          </div>
          <button onClick={handleSubmit} disabled={saving}
            className="px-6 py-3 bg-music-blue text-white font-bold rounded-xl hover:opacity-90 disabled:opacity-50">
            {saving ? 'Saugoma...' : '✓ Išsaugoti'}
          </button>
        </div>

        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">❌ {error}</div>}

        <div className="grid grid-cols-2 gap-5">
          {/* LEFT */}
          <div className="space-y-5">
            <Card title="Pagrindinė informacija">
              <div className="space-y-4">
                <Inp label="Pavadinimas *" value={form.title} onChange={(v: string) => set('title', v)} placeholder="Dainos pavadinimas" />

                {/* Artist */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Atlikėjas *</label>
                  {form.artist_id ? (
                    <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                      <span className="flex-1 text-sm font-medium text-gray-900">{artistName}</span>
                      <button type="button" onClick={() => { set('artist_id', 0); setArtistName('') }}
                        className="text-red-400 hover:text-red-600 font-bold">×</button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input type="text" value={artistSearch} onChange={e => setArtistSearch(e.target.value)}
                        placeholder="Ieškoti atlikėjo..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-music-blue" />
                      {artistResults.length > 0 && (
                        <div className="absolute z-20 w-full bg-white border border-gray-200 rounded-xl shadow-lg mt-1">
                          {artistResults.map(a => (
                            <button key={a.id} type="button"
                              onClick={() => { set('artist_id', a.id); setArtistName(a.name); setArtistSearch(''); setArtistResults([]) }}
                              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 text-left text-sm">
                              <span className="font-medium text-gray-900">{a.name}</span>
                              <span className="text-gray-400 text-xs">{a.country}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Type */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tipas</label>
                  <div className="flex flex-wrap gap-2">
                    {TRACK_TYPES.map(t => (
                      <button key={t.value} type="button" onClick={() => set('type', t.value)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          form.type === t.value ? 'bg-music-blue text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}>{t.label}</button>
                    ))}
                  </div>
                </div>

                <Inp label="Išleidimo data" value={form.release_date} onChange={(v: string) => set('release_date', v)} type="date" />

                <div className="flex gap-4">
                  {[['is_new','Nauja'],['show_player','Rodyti player\'ą']].map(([k, l]) => (
                    <label key={k} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={form[k] || false} onChange={e => set(k, e.target.checked)} className="accent-music-blue" />
                      <span className="text-sm text-gray-700">{l}</span>
                    </label>
                  ))}
                </div>
              </div>
            </Card>

            <Card title="Nuorodos">
              <div className="space-y-3">
                <Inp label="Video URL" value={form.video_url} onChange={(v: string) => set('video_url', v)} placeholder="https://youtube.com/..." />
                <Inp label="Spotify ID" value={form.spotify_id} onChange={(v: string) => set('spotify_id', v)} placeholder="0abc123..." />
              </div>
            </Card>

            <Card title="Aprašymas">
              <Textarea label="Aprašymas" value={form.description} onChange={(v: string) => set('description', v)} placeholder="Informacija apie dainą..." rows={3} />
            </Card>
          </div>

          {/* RIGHT */}
          <div className="space-y-5">
            <Card title="Žodžiai">
              <Textarea label="Žodžiai" value={form.lyrics} onChange={(v: string) => set('lyrics', v)} placeholder="Dainos žodžiai..." rows={16} />
            </Card>
            <Card title="Akordai">
              <Textarea label="Akordai" value={form.chords} onChange={(v: string) => set('chords', v)} placeholder="[Am] Vienas [G] du [F] trys..." rows={10} />
            </Card>
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 py-4 bg-music-blue text-white font-bold rounded-xl hover:opacity-90 disabled:opacity-50 text-lg">
            {saving ? 'Saugoma...' : '✓ Išsaugoti dainą'}
          </button>
          <Link href="/admin/tracks"
            className="px-8 py-4 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 flex items-center font-medium">
            Atšaukti
          </Link>
        </div>
      </div>
    </div>
  )
}
