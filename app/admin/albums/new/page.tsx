'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { AlbumFull, TrackInAlbum } from '@/lib/supabase-albums'

const ALBUM_TYPE_FIELDS = [
  { key: 'type_studio', label: 'Studijinis' },
  { key: 'type_compilation', label: 'Kompiliacija' },
  { key: 'type_ep', label: 'EP' },
  { key: 'type_single', label: 'Singlas' },
  { key: 'type_live', label: 'Gyvas' },
  { key: 'type_remix', label: 'Remix' },
  { key: 'type_covers', label: 'Coveriai' },
  { key: 'type_holiday', label: 'Šventinis' },
  { key: 'type_soundtrack', label: 'Soundtrack' },
  { key: 'type_demo', label: 'Demo' },
]

const TRACK_TYPES = ['normal','remix','live','mashup','instrumental'] as const
const CY = new Date().getFullYear()
const YEARS = Array.from({ length: CY - 1950 + 2 }, (_, i) => CY + 1 - i)
const MONTHS = ['Sausis','Vasaris','Kovas','Balandis','Gegužė','Birželis','Liepa','Rugpjūtis','Rugsėjis','Spalis','Lapkritis','Gruodis']
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

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

function Inp({ label, value, onChange, placeholder }: any) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">{label}</label>
      <input value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 border border-[var(--input-border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-music-blue bg-[var(--bg-surface)]" />
    </div>
  )
}

function Sel({ label, value, onChange, children }: any) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">{label}</label>
      <select value={value || ''} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-[var(--input-border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-music-blue bg-[var(--bg-surface)]">
        {children}
      </select>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--bg-surface)] rounded-xl shadow-sm border border-[var(--input-border)]">
      <div className="px-5 py-3 border-b border-[var(--border-subtle)]">
        <h2 className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-wide">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

export default function AdminAlbumNewPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [form, setForm] = useState<AlbumFull>(emptyAlbum)
  const [artistSearch, setArtistSearch] = useState('')
  const [artistResults, setArtistResults] = useState<any[]>([])
  const [artistName, setArtistName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'
  const set = (f: keyof AlbumFull, v: any) => setForm(p => ({ ...p, [f]: v }))

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const artistIdParam = params.get('artist_id')
    if (artistIdParam) {
      const id = parseInt(artistIdParam)
      setForm(p => ({ ...p, artist_id: id }))
      fetch(`/api/artists/${id}`)
        .then(r => r.json())
        .then(data => { if (data.name) setArtistName(data.name) })
        .catch(() => {})
    }
  }, [])

  const setType = (key: string) => {
    const reset = Object.fromEntries(ALBUM_TYPE_FIELDS.map(t => [t.key, false]))
    setForm(p => ({ ...p, ...reset, [key]: true }))
  }

  const addTrack = () => setForm(p => ({
    ...p, tracks: [...(p.tracks || []), { title: '', sort_order: (p.tracks?.length || 0) + 1, type: 'normal', disc_number: 1 }]
  }))
  const upTrack = (i: number, f: keyof TrackInAlbum, v: any) => {
    const t = [...(form.tracks || [])]; t[i] = { ...t[i], [f]: v }; set('tracks', t)
  }
  const rmTrack = (i: number) => set('tracks', (form.tracks || []).filter((_, idx) => idx !== i))
  const moveTrack = (i: number, dir: -1 | 1) => {
    const t = [...(form.tracks || [])]
    const j = i + dir
    if (j < 0 || j >= t.length) return
    ;[t[i], t[j]] = [t[j], t[i]]
    t.forEach((tr, idx) => tr.sort_order = idx + 1)
    set('tracks', t)
  }

  const handleSubmit = async () => {
    if (!form.title.trim()) { setError('Pavadinimas privalomas'); return }
    if (!form.artist_id) { setError('Pasirinkite atlikėją'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/albums', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.push('/admin/albums')
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }

  if (status === 'loading' || !isAdmin) return null

  return (
    <div className="min-h-screen bg-[var(--bg-elevated)]">
      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/admin/albums" className="text-music-blue hover:text-music-orange text-sm">← Albumai</Link>
            <h1 className="text-2xl font-black text-[var(--text-primary)] mt-1">💿 Naujas albumas</h1>
          </div>
          <button onClick={handleSubmit} disabled={saving}
            className="px-6 py-3 bg-music-blue text-white font-bold rounded-xl hover:opacity-90 disabled:opacity-50">
            {saving ? 'Saugoma...' : '✓ Išsaugoti'}
          </button>
        </div>

        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">❌ {error}</div>}

        <div className="grid grid-cols-2 gap-5">
          <div className="space-y-5">
            <Card title="Pagrindinė informacija">
              <div className="space-y-4">
                <Inp label="Pavadinimas *" value={form.title} onChange={(v: string) => set('title', v)} placeholder="Albumo pavadinimas" />

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Atlikėjas *</label>
                  {form.artist_id ? (
                    <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                      <span className="flex-1 text-sm font-medium text-[var(--text-primary)]">{artistName}</span>
                      <button type="button" onClick={() => { set('artist_id', 0); setArtistName('') }}
                        className="text-red-400 hover:text-red-600 font-bold">×</button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input value={artistSearch} onChange={e => {
                        setArtistSearch(e.target.value)
                        if (e.target.value.length >= 2) {
                          fetch(`/api/artists?search=${encodeURIComponent(e.target.value)}&limit=6`)
                            .then(r => r.json()).then(d => setArtistResults(d.artists || []))
                        } else setArtistResults([])
                      }}
                        placeholder="Ieškoti atlikėjo..."
                        className="w-full px-3 py-2 border border-[var(--input-border)] rounded-lg text-sm focus:outline-none focus:border-music-blue" />
                      {artistResults.length > 0 && (
                        <div className="absolute z-20 w-full bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-xl shadow-lg mt-1">
                          {artistResults.map(a => (
                            <button key={a.id} type="button"
                              onClick={() => { set('artist_id', a.id); setArtistName(a.name); setArtistSearch(''); setArtistResults([]) }}
                              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--bg-hover)] text-left text-sm">
                              <span className="font-medium text-[var(--text-primary)]">{a.name}</span>
                              <span className="text-[var(--text-muted)] text-xs">{a.country}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tipas</label>
                  <div className="flex flex-wrap gap-2">
                    {ALBUM_TYPE_FIELDS.map(t => (
                      <button key={t.key} type="button" onClick={() => setType(t.key)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          (form as any)[t.key] ? 'bg-music-blue text-white' : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-active)]'
                        }`}>{t.label}</button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <Sel label="Metai" value={form.year} onChange={(v: string) => set('year', v ? parseInt(v) : undefined)}>
                    <option value="">–</option>
                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </Sel>
                  <Sel label="Mėnuo" value={form.month} onChange={(v: string) => set('month', v ? parseInt(v) : undefined)}>
                    <option value="">–</option>
                    {MONTHS.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
                  </Sel>
                  <Sel label="Diena" value={form.day} onChange={(v: string) => set('day', v ? parseInt(v) : undefined)}>
                    <option value="">–</option>
                    {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                  </Sel>
                </div>
              </div>
            </Card>

            <Card title="Papildoma">
              <div className="space-y-3">
                <Inp label="Spotify ID" value={form.spotify_id} onChange={(v: string) => set('spotify_id', v)} placeholder="0abc123..." />
                <Inp label="Video URL" value={form.video_url} onChange={(v: string) => set('video_url', v)} placeholder="https://youtube.com/..." />
                <Inp label="Viršelio nuotrauka URL" value={form.cover_image_url} onChange={(v: string) => set('cover_image_url', v)} placeholder="https://..." />
                <div className="flex gap-4 pt-1">
                  {[['show_artist_name','Rodyti atlikėjo vardą'],['show_player','Rodyti playerą'],['is_upcoming','Laukiamas']].map(([k,l]) => (
                    <label key={k} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={(form as any)[k] || false} onChange={e => set(k as any, e.target.checked)} className="accent-music-blue" />
                      <span className="text-sm text-gray-700">{l}</span>
                    </label>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          <div>
            <Card title={`Dainų sąrašas (${form.tracks?.length || 0})`}>
              <div className="space-y-2 mb-3 max-h-[500px] overflow-y-auto">
                {(form.tracks || []).map((t, i) => (
                  <div key={i} className="bg-[var(--bg-elevated)] rounded-lg p-2.5 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--text-muted)] w-5 text-right">{i+1}.</span>
                      <input value={t.title} onChange={e => upTrack(i, 'title', e.target.value)}
                        placeholder="Dainos pavadinimas"
                        className="flex-1 px-2 py-1 border border-[var(--input-border)] rounded text-sm text-[var(--text-primary)] focus:outline-none focus:border-music-blue" />
                      <select value={t.type} onChange={e => upTrack(i, 'type', e.target.value)}
                        className="px-2 py-1 border border-[var(--input-border)] rounded text-xs text-[var(--text-secondary)] focus:outline-none bg-[var(--bg-surface)]">
                        {TRACK_TYPES.map(tp => <option key={tp} value={tp}>{tp}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center gap-2 pl-7">
                      <input value={t.duration || ''} onChange={e => upTrack(i, 'duration', e.target.value)}
                        placeholder="3:45" maxLength={6}
                        className="w-16 px-2 py-1 border border-[var(--input-border)] rounded text-xs text-[var(--text-primary)] focus:outline-none text-center" />
                      <label className="flex items-center gap-1 text-xs text-[var(--text-secondary)] cursor-pointer">
                        <input type="checkbox" checked={t.is_single || false} onChange={e => upTrack(i, 'is_single', e.target.checked)} className="accent-music-blue" />
                        Singlas
                      </label>
                      <div className="flex gap-1 ml-auto">
                        <button type="button" onClick={() => moveTrack(i, -1)} className="px-1.5 py-0.5 bg-[var(--bg-active)] rounded text-xs hover:bg-[var(--bg-active)]">↑</button>
                        <button type="button" onClick={() => moveTrack(i, 1)} className="px-1.5 py-0.5 bg-[var(--bg-active)] rounded text-xs hover:bg-[var(--bg-active)]">↓</button>
                        <button type="button" onClick={() => rmTrack(i)} className="px-1.5 py-0.5 bg-red-100 text-red-600 rounded text-xs hover:bg-red-200">×</button>
                      </div>
                    </div>
                  </div>
                ))}
                {!form.tracks?.length && <p className="text-xs text-[var(--text-muted)] italic text-center py-4">Nėra dainų</p>}
              </div>
              <button type="button" onClick={addTrack}
                className="w-full py-2 border-2 border-dashed border-[var(--input-border)] text-[var(--text-muted)] rounded-lg text-sm hover:border-music-blue hover:text-music-blue transition-colors">
                + Pridėti dainą
              </button>
            </Card>
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 py-4 bg-music-blue text-white font-bold rounded-xl hover:opacity-90 disabled:opacity-50 text-lg">
            {saving ? 'Saugoma...' : '✓ Išsaugoti albumą'}
          </button>
          <Link href="/admin/albums" className="px-8 py-4 border border-[var(--input-border)] text-[var(--text-secondary)] rounded-xl hover:bg-[var(--bg-hover)] flex items-center font-medium">
            Atšaukti
          </Link>
        </div>
      </div>
    </div>
  )
}
