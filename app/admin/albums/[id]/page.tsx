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

function CoverImageField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [urlInput, setUrlInput] = useState(value || '')

  useEffect(() => { setUrlInput(value || '') }, [value])

  const handleUrlBlur = () => { onChange(urlInput) }
  const handleUrlChange = (v: string) => { setUrlInput(v) }

  const handleFileUpload = async (file: File) => {
    if (!file) return
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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) handleFileUpload(file)
  }

  return (
    <div className="space-y-3">
      {/* Large cover preview */}
      <div
        className="relative w-full aspect-square rounded-xl border-2 border-dashed border-gray-200 overflow-hidden bg-gray-50 cursor-pointer group hover:border-blue-400 transition-colors"
        onClick={() => fileRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
      >
        {value ? (
          <>
            <img src={value} alt="Viršelis" referrerPolicy="no-referrer"
              className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
              <span className="text-white text-3xl">📷</span>
              <span className="text-white text-sm font-medium">Keisti viršelį</span>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-3">
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Keliama...</span>
              </div>
            ) : (
              <>
                <span className="text-5xl">💿</span>
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-500">Spausti arba tempti</p>
                  <p className="text-xs text-gray-400">JPG, PNG</p>
                </div>
              </>
            )}
          </div>
        )}
        {uploading && value && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* URL input */}
      <div className="flex gap-2">
        <input type="text" value={urlInput}
          onChange={e => handleUrlChange(e.target.value)}
          onBlur={handleUrlBlur}
          placeholder="https://..."
          className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:border-blue-400 bg-white" />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
          className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-xs font-medium shrink-0 transition-colors">
          📁
        </button>
        {value && (
          <button type="button" onClick={() => { onChange(''); setUrlInput('') }}
            className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg text-xs font-medium shrink-0 transition-colors">
            ✕
          </button>
        )}
      </div>
      {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f) }} />
    </div>
  )
}

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
    t.forEach((tr, idx) => { tr.sort_order = idx + 1 })
    set('tracks', t)
  }

  const handleSubmit = async () => {
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
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      if (isNew) router.push(`/admin/albums/${data.id}`)
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!confirm(`Ištrinti albumą "${form.title}"?`)) return
    setDeleting(true)
    try {
      await fetch(`/api/albums/${id}`, { method: 'DELETE' })
      router.push(artistId ? `/admin/artists/${artistId}` : '/admin/albums')
    } catch (e: any) { setError(e.message) } finally { setDeleting(false) }
  }

  const activeType = ALBUM_TYPE_FIELDS.find(t => (form as any)[t.key])

  // Cmd+S shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); handleSubmit() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [form])

  if (status === 'loading' || !isAdmin) return null

  return (
    <div className="min-h-screen bg-[#f8f7f5]">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-gray-200 px-6 py-3">
        <div className="max-w-screen-xl mx-auto flex items-center justify-between gap-4">
          {/* Breadcrumbs */}
          <nav className="flex items-center gap-1.5 text-sm min-w-0">
            <Link href="/admin" className="text-gray-400 hover:text-gray-700 transition-colors shrink-0">Admin</Link>
            <span className="text-gray-300">/</span>
            <Link href="/admin/albums" className="text-gray-400 hover:text-gray-700 transition-colors shrink-0">Albumai</Link>
            {artistName && (
              <>
                <span className="text-gray-300">/</span>
                {artistId
                  ? <Link href={`/admin/artists/${artistId}`} className="text-gray-400 hover:text-gray-700 transition-colors truncate max-w-[120px]">{artistName}</Link>
                  : <span className="text-gray-400 truncate max-w-[120px]">{artistName}</span>
                }
              </>
            )}
            <span className="text-gray-300">/</span>
            <span className="text-gray-800 font-semibold truncate max-w-[180px]">
              {isNew ? 'Naujas albumas' : (form.title || '...')}
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
              {saving ? (
                <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" /> Saugoma...</>
              ) : saved ? '✓ Išsaugota!' : '✓ Išsaugoti'}
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="max-w-screen-xl mx-auto px-6 pt-4">
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-center gap-2">
            ❌ {error}
            <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">✕</button>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="max-w-screen-xl mx-auto px-6 py-6">
        <div className="grid grid-cols-[220px_1fr_280px] gap-6">

          {/* ── LEFT: Cover + meta ── */}
          <div className="space-y-5">
            {/* Cover */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <CoverImageField value={form.cover_image_url || ''} onChange={url => set('cover_image_url', url)} />
            </div>

            {/* Tipas */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Tipas</p>
              <div className="space-y-1">
                {ALBUM_TYPE_FIELDS.map(t => (
                  <button key={t.key} type="button" onClick={() => setType(t.key)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left ${
                      (form as any)[t.key]
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}>
                    <span>{t.icon}</span>
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Papildoma */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Papildoma</p>
              <div className="space-y-2">
                {[
                  ['show_artist_name', 'Rodyti atlikėjo vardą'],
                  ['show_player', "Rodyti player'ą"],
                  ['is_upcoming', 'Laukiamas'],
                ].map(([k, l]) => (
                  <label key={k} className="flex items-center gap-2.5 cursor-pointer py-1">
                    <input type="checkbox" checked={(form as any)[k] || false}
                      onChange={e => set(k as any, e.target.checked)}
                      className="w-4 h-4 accent-blue-600 rounded" />
                    <span className="text-sm text-gray-700">{l}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* ── MIDDLE: Main info + Tracklist ── */}
          <div className="space-y-5 min-w-0">
            {/* Pagrindinė info */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Pagrindinė informacija</p>
              <div className="space-y-4">
                {/* Title */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Pavadinimas *</label>
                  <input value={form.title} onChange={e => set('title', e.target.value)}
                    placeholder="Albumo pavadinimas"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-gray-900 text-sm font-medium focus:outline-none focus:border-blue-400 bg-white transition-colors" />
                </div>

                {/* Artist */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Atlikėjas *</label>
                  {form.artist_id ? (
                    <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
                      <span className="flex-1 text-sm font-semibold text-gray-900">{artistName}</span>
                      <button type="button" onClick={() => { set('artist_id', 0); setArtistName(''); setArtistId(null) }}
                        className="text-gray-400 hover:text-red-500 transition-colors font-bold text-lg leading-none">×</button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input type="text" value={artistSearch} onChange={e => setArtistSearch(e.target.value)}
                        placeholder="Ieškoti atlikėjo..."
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-gray-900 text-sm focus:outline-none focus:border-blue-400 transition-colors" />
                      {artistResults.length > 0 && (
                        <div className="absolute z-20 w-full bg-white border border-gray-200 rounded-xl shadow-xl mt-1 overflow-hidden">
                          {artistResults.map(a => (
                            <button key={a.id} type="button"
                              onClick={() => { set('artist_id', a.id); setArtistName(a.name); setArtistId(a.id); setArtistSearch(''); setArtistResults([]) }}
                              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 text-left transition-colors">
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
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Išleidimo data</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Metai', value: form.year, key: 'year', options: YEARS.map(y => ({ v: y, l: String(y) })) },
                      { label: 'Mėnuo', value: form.month, key: 'month', options: MONTHS.map((m, i) => ({ v: i+1, l: m })) },
                      { label: 'Diena', value: form.day, key: 'day', options: DAYS.map(d => ({ v: d, l: String(d) })) },
                    ].map(({ label, value, key, options }) => (
                      <div key={key}>
                        <p className="text-xs text-gray-400 mb-1">{label}</p>
                        <select value={value || ''} onChange={e => set(key as any, e.target.value ? parseInt(e.target.value) : null)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-blue-400 bg-white">
                          <option value="">–</option>
                          {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Tracklist */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Dainų sąrašas</p>
                  <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-0.5 rounded-full">
                    {form.tracks?.length || 0}
                  </span>
                </div>
                <button type="button" onClick={addTrack}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold transition-colors">
                  + Pridėti
                </button>
              </div>

              <div className="divide-y divide-gray-50">
                {(form.tracks || []).map((t, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/50 group transition-colors">
                    {/* Number + reorder */}
                    <div className="flex flex-col items-center gap-0.5 w-8 shrink-0">
                      <button type="button" onClick={() => moveTrack(i, -1)} disabled={i === 0}
                        className="text-gray-300 hover:text-gray-600 disabled:opacity-0 transition-colors leading-none text-xs">▲</button>
                      <span className="text-xs font-bold text-gray-400 w-6 text-center">{i + 1}</span>
                      <button type="button" onClick={() => moveTrack(i, 1)} disabled={i === (form.tracks?.length || 0) - 1}
                        className="text-gray-300 hover:text-gray-600 disabled:opacity-0 transition-colors leading-none text-xs">▼</button>
                    </div>

                    {/* Title */}
                    <input value={t.title} onChange={e => upTrack(i, 'title', e.target.value)}
                      placeholder="Dainos pavadinimas"
                      className="flex-1 min-w-0 px-3 py-1.5 border border-transparent hover:border-gray-200 focus:border-blue-300 rounded-lg text-sm text-gray-900 focus:outline-none bg-transparent focus:bg-white transition-all" />

                    {/* Duration */}
                    <input value={t.duration || ''} onChange={e => upTrack(i, 'duration', e.target.value)}
                      placeholder="3:45" maxLength={6}
                      className="w-14 px-2 py-1.5 border border-transparent hover:border-gray-200 focus:border-blue-300 rounded-lg text-xs text-gray-600 focus:outline-none text-center bg-transparent focus:bg-white transition-all" />

                    {/* Type */}
                    <select value={t.type} onChange={e => upTrack(i, 'type', e.target.value)}
                      className="px-2 py-1.5 border border-transparent hover:border-gray-200 focus:border-blue-300 rounded-lg text-xs text-gray-600 focus:outline-none bg-transparent focus:bg-white transition-all cursor-pointer">
                      {TRACK_TYPES.map(tp => <option key={tp} value={tp}>{tp}</option>)}
                    </select>

                    {/* Single */}
                    <label className="flex items-center gap-1.5 cursor-pointer shrink-0" title="Singlas">
                      <input type="checkbox" checked={t.is_single || false}
                        onChange={e => upTrack(i, 'is_single', e.target.checked)}
                        className="accent-blue-600 w-3.5 h-3.5" />
                      <span className="text-xs text-gray-500">S</span>
                    </label>

                    {/* Delete */}
                    <button type="button" onClick={() => rmTrack(i)}
                      className="w-7 h-7 flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100 shrink-0">
                      ✕
                    </button>
                  </div>
                ))}

                {!form.tracks?.length && (
                  <div className="py-12 text-center">
                    <span className="text-3xl block mb-2">🎵</span>
                    <p className="text-sm text-gray-400">Nėra dainų</p>
                    <button type="button" onClick={addTrack}
                      className="mt-3 text-sm text-blue-500 hover:text-blue-700 font-medium transition-colors">
                      + Pridėti pirmą dainą
                    </button>
                  </div>
                )}
              </div>

              {form.tracks && form.tracks.length > 0 && (
                <div className="px-4 py-3 border-t border-gray-100">
                  <button type="button" onClick={addTrack}
                    className="w-full py-2 border-2 border-dashed border-gray-200 text-gray-400 rounded-xl text-sm hover:border-blue-300 hover:text-blue-500 transition-colors">
                    + Pridėti dainą
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT: Spotify + Video + options ── */}
          <div className="space-y-5">
            {/* Album summary card */}
            {!isNew && (
              <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl p-5 text-white">
                <div className="flex items-start gap-3">
                  {form.cover_image_url ? (
                    <img src={form.cover_image_url} alt="" referrerPolicy="no-referrer"
                      className="w-14 h-14 rounded-lg object-cover shrink-0 shadow-lg" />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-white/20 flex items-center justify-center text-2xl shrink-0">💿</div>
                  )}
                  <div className="min-w-0">
                    <p className="font-bold text-white text-sm leading-tight truncate">{form.title || 'Albumas'}</p>
                    <p className="text-blue-200 text-xs mt-0.5">{artistName}</p>
                    <p className="text-blue-300 text-xs mt-1">
                      {form.year && <span>{form.year}</span>}
                      {activeType && <span className="ml-2 bg-white/20 px-2 py-0.5 rounded-full">{activeType.label}</span>}
                    </p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-white/20 flex items-center justify-between text-xs text-blue-200">
                  <span>💿 {form.tracks?.length || 0} dainų</span>
                  {form.spotify_id && <span>🎧 Spotify ✓</span>}
                </div>
              </div>
            )}

            {/* Spotify */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">🎧 Spotify</p>
              <div className="space-y-2">
                <input value={form.spotify_id || ''} onChange={e => set('spotify_id', e.target.value)}
                  placeholder="Spotify album ID..."
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-gray-900 text-sm focus:outline-none focus:border-blue-400 bg-white font-mono transition-colors" />
                {form.spotify_id && (
                  <a href={`https://open.spotify.com/album/${form.spotify_id}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs text-green-600 hover:text-green-700 transition-colors">
                    <span>🔗</span> Atidaryti Spotify
                  </a>
                )}
              </div>
            </div>

            {/* Video */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">🎬 Video URL</p>
              <input value={form.video_url || ''} onChange={e => set('video_url', e.target.value)}
                placeholder="https://youtube.com/..."
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-gray-900 text-sm focus:outline-none focus:border-blue-400 bg-white transition-colors" />
              {form.video_url && (
                <a href={form.video_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 mt-2 text-xs text-blue-500 hover:text-blue-700 transition-colors">
                  <span>🔗</span> Peržiūrėti
                </a>
              )}
            </div>

            {/* Keyboard shortcut hint */}
            <div className="text-center text-xs text-gray-400 py-2">
              <kbd className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-500 font-mono">⌘S</kbd> Išsaugoti
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
