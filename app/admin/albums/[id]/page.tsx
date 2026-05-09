'use client'

import { useState, useEffect, use, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { AlbumFull, TrackInAlbum } from '@/lib/supabase-albums'
import ArtistSearchInput from '@/components/ui/ArtistSearchInput'
import DateNumberInput from '@/components/ui/DateNumberInput'
import YouTubeSearch from '@/components/ui/YouTubeSearch'
import DescriptionEditor from '@/components/ui/DescriptionEditor'
import { extractYouTubeId } from '@/components/ui/helpers'

const ALBUM_TYPE_FIELDS = [
  { key: 'type_studio', label: 'Studijinis', icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth={2}/><circle cx="12" cy="12" r="3" strokeWidth={2}/><path strokeLinecap="round" strokeWidth={2} d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg> },
  { key: 'type_ep', label: 'EP', icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth={2}/><circle cx="12" cy="12" r="2" strokeWidth={2}/></svg> },
  { key: 'type_compilation', label: 'Kompiliacija', icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg> },
  { key: 'type_live', label: 'Gyvas', icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V5l3 3 3-3v14" /><path strokeLinecap="round" strokeWidth={2} d="M3 12h2m14 0h2"/></svg> },
  { key: 'type_remix', label: 'Remix', icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> },
  { key: 'type_covers', label: 'Coveriai', icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg> },
  { key: 'type_holiday', label: 'Šventinis', icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" /></svg> },
  { key: 'type_soundtrack', label: 'Soundtrack', icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" /></svg> },
  { key: 'type_demo', label: 'Demo', icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg> },
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
  description: '',
  tracks: [],
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
    <div className="flex flex-col gap-1.5">
      <div
        className="relative w-24 h-24 rounded-lg overflow-hidden border border-[var(--input-border)] bg-[var(--bg-elevated)] cursor-pointer shrink-0 group"
        onClick={() => !uploading && fileRef.current?.click()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) handleFileUpload(f) }}
        onDragOver={e => e.preventDefault()}>
        {value ? (
          <>
            <img src={value} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover group-hover:opacity-80 transition-opacity" />
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-[var(--text-muted)] group-hover:text-blue-400 transition-colors">
            <svg className="w-7 h-7 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" /></svg>
            <span className="text-[10px]">Viršelis</span>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-[var(--bg-surface)]/80 flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
      <div className="flex gap-1">
        <input type="text" value={urlInput} onChange={e => setUrlInput(e.target.value)}
          onBlur={e => handleUrlCommit(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleUrlCommit(urlInput)}
          placeholder="https://..." className="flex-1 min-w-0 px-2 py-1 border border-[var(--input-border)] rounded-lg text-xs text-[var(--text-secondary)] focus:outline-none focus:border-blue-400 bg-[var(--bg-surface)]" />
        <button type="button" onClick={() => fileRef.current?.click()}
          className="px-2 py-1 bg-[var(--bg-elevated)] hover:bg-[var(--bg-active)] text-[var(--text-muted)] rounded-lg text-xs transition-colors shrink-0" title="Įkelti failą">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
        </button>
        {value && (
          <button type="button" onClick={() => { onChange(''); setUrlInput('') }}
            className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-400 rounded-lg text-xs transition-colors shrink-0">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        )}
      </div>
      {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f) }} />
    </div>
  )
}

// ── TrackList ─────────────────────────────────────────────────────────────────
function TrackList({ tracks, isMobile, onAdd, onUpdate, onRemove, onHardDelete, onReorder, onSave }: {
  tracks: TrackInAlbum[]
  isMobile: boolean
  onAdd: () => void
  onUpdate: (i: number, f: keyof TrackInAlbum, v: any) => void
  onRemove: (i: number) => void
  onHardDelete: (i: number) => void
  onReorder: (from: number, to: number) => void
  onSave: () => void
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
        const hasLyrics = typeof (t as any).lyrics === 'string' && (t as any).lyrics.trim().length > 0
        const rawFeat = (t as any).featuring || []
        const featuring: string[] = Array.isArray(rawFeat) ? rawFeat.map((f: any) => typeof f === 'string' ? f : f.name || '').filter(Boolean) : []
        const isSaved = !!trackId

        return (
          <div key={i}
            draggable={false}
            onDragEnter={() => !isMobile && onDragEnter(i)}
            onDragOver={e => { if (!isMobile) e.preventDefault() }}
            className={`flex items-center gap-1.5 px-2.5 border-b border-[var(--border-subtle)] transition-colors group ${
              isMobile ? 'py-2' : 'py-1'
            } ${dragOver === i ? 'bg-blue-50 border-t-2 border-blue-400' : 'hover:bg-[var(--bg-elevated)]/80'}`}>

            {isMobile ? (
              <div className="flex flex-col shrink-0">
                <button type="button" onClick={() => i > 0 && onReorder(i, i - 1)} disabled={i === 0}
                  className="w-5 h-4 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-secondary)] disabled:opacity-20">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                </button>
                <button type="button" onClick={() => i < tracks.length - 1 && onReorder(i, i + 1)} disabled={i === tracks.length - 1}
                  className="w-5 h-4 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-secondary)] disabled:opacity-20">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
              </div>
            ) : (
              <span draggable={true}
                onDragStart={e => { e.stopPropagation(); onDragStart(i) }}
                onDragEnd={e => { e.stopPropagation(); onDragEnd() }}
                className="cursor-grab active:cursor-grabbing">
                <svg className="w-3.5 h-3.5 text-[var(--text-faint)] hover:text-[var(--text-muted)] shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M8 6a2 2 0 100-4 2 2 0 000 4zm0 8a2 2 0 100-4 2 2 0 000 4zm0 8a2 2 0 100-4 2 2 0 000 4zm8-16a2 2 0 100-4 2 2 0 000 4zm0 8a2 2 0 100-4 2 2 0 000 4zm0 8a2 2 0 100-4 2 2 0 000 4z" /></svg>
              </span>
            )}

            <span className="text-xs text-[var(--text-muted)] w-4 text-right shrink-0 tabular-nums">{i + 1}</span>

            <div className="flex-1 min-w-0 flex items-baseline gap-1 flex-wrap">
              <input value={t.title} onChange={e => onUpdate(i, 'title', e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onSave() } }}
                onMouseDown={e => e.stopPropagation()}
                onDragStart={e => e.preventDefault()}
                placeholder="Dainos pavadinimas"
                size={t.title ? Math.max(8, t.title.length + 2) : 20}
                className="px-1 py-0.5 border border-transparent hover:border-[var(--input-border)] focus:border-blue-300 rounded text-sm text-[var(--text-primary)] focus:outline-none bg-transparent focus:bg-[var(--bg-surface)] transition-all" />
              {featuring.length > 0 && (
                <span className="text-xs text-[var(--text-muted)] leading-tight whitespace-nowrap">su {featuring.join(', ')}</span>
              )}
            </div>

            {hasVideo && (
              <svg className="w-3 h-3 text-blue-400 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            )}
            {hasLyrics && <span className="text-green-500 text-xs font-bold shrink-0">T</span>}

            <label className="flex items-center gap-0.5 cursor-pointer shrink-0">
              <input type="checkbox" checked={t.is_single || false}
                onChange={e => onUpdate(i, 'is_single', e.target.checked)}
                className="accent-blue-600 w-3 h-3" />
              <span className="text-xs text-[var(--text-muted)]">S</span>
            </label>

            {trackEditUrl && (
              <a href={trackEditUrl} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="shrink-0 px-2 py-0.5 text-xs text-blue-500 hover:text-blue-700 hover:bg-[var(--hover-blue)] rounded transition-colors font-medium whitespace-nowrap">
                {isMobile ? '↗' : 'Redaguoti ↗'}
              </a>
            )}

            <button type="button" onClick={() => onRemove(i)} title="Pašalinti iš albumo"
              className="w-5 h-5 flex items-center justify-center text-[var(--text-faint)] hover:text-orange-500 hover:bg-orange-50 rounded transition-colors shrink-0 text-sm">
              ×
            </button>

            {isSaved && (
              <button type="button" onClick={() => onHardDelete(i)} title="Ištrinti dainą visiškai"
                className="w-5 h-5 flex items-center justify-center text-[var(--text-faint)] hover:text-red-600 hover:bg-red-50 rounded transition-colors shrink-0 opacity-0 group-hover:opacity-100">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            )}
          </div>
        )
      })}

      {!tracks.length && (
        <div className="py-10 text-center">
          <svg className="w-8 h-8 text-[var(--text-faint)] mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" /></svg>
          <p className="text-sm text-[var(--text-muted)]">Nėra dainų</p>
        </div>
      )}

      <div className="p-2.5">
        <button type="button" onClick={onAdd}
          className="w-full py-2 border-2 border-dashed border-[var(--input-border)] text-[var(--text-muted)] rounded-xl text-sm hover:border-blue-300 hover:text-blue-500 active:bg-blue-50 transition-colors">
          + Pridėti dainą
        </button>
      </div>
    </div>
  )
}

function TracksHeader({ count }: { count: number }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] sticky top-0 z-10">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-bold text-[var(--text-secondary)]">Dainų sąrašas</span>
        <span className="bg-[var(--bg-active)] text-[var(--text-secondary)] text-xs font-bold px-1.5 py-0.5 rounded-full">{count}</span>
      </div>
      <span className="text-xs text-[var(--text-muted)] flex items-center gap-1">
        <svg className="w-3 h-3 text-blue-400" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
        video · T žodžiai · S singlas
      </span>
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
  const formRef = useRef<AlbumFull>(emptyAlbum)
  const [artistName, setArtistName] = useState('')
  const [artistId, setArtistId] = useState<number | null>(null)
  const [artistAvatar, setArtistAvatar] = useState('')
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
  const set = (f: keyof AlbumFull, v: any) => setForm(p => {
    const next = { ...p, [f]: v }
    formRef.current = next
    return next
  })

  useEffect(() => { if (status === 'unauthenticated') router.push('/') }, [status])

  useEffect(() => {
    if (!isNew && isAdmin) {
      fetch(`/api/albums/${id}`).then(r => r.json()).then(data => {
        const loaded = { ...data, tracks: data.tracks || [] }
        setForm(loaded)
        formRef.current = loaded
        if (data.artists?.name) { setArtistName(data.artists.name); setArtistId(data.artist_id); setArtistAvatar(data.artists.avatar || data.artists.cover_image_url || '') }
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
    setForm(p => {
      const t = [...(p.tracks || [])]; t[i] = { ...t[i], [f]: v }
      const next = { ...p, tracks: t }
      formRef.current = next
      return next
    })
  }

  const rmTrack = (i: number) => {
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
      try { await fetch(`/api/tracks/${trackId}`, { method: 'DELETE' }) }
      catch (e: any) { setError(e.message); return }
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

  const featuredArtistsRef = useRef(featuredArtists)
  featuredArtistsRef.current = featuredArtists

  const handleSubmit = useCallback(async () => {
    const cur = formRef.current
    if (!cur.title.trim()) { setError('Pavadinimas privalomas'); return }
    if (!cur.artist_id) { setError('Pasirinkite atlikėją'); return }
    setSaving(true); setError('')
    try {
      const payload = { ...cur, featured_artist_ids: featuredArtistsRef.current.map(a => a.id) }
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
  }, [id, isNew])

  const handleDelete = async () => {
    if (!confirm(`Ištrinti albumą "${form.title}"?`)) return

    // Paklausti ar trinti dainas kartu
    const trackCount = form.tracks?.length || 0
    let deleteTracks = false
    if (trackCount > 0) {
      deleteTracks = confirm(
        `Albumas turi ${trackCount} dainų.\n\n` +
        `Spustelėkite OK — ištrinti albumą IR visas jo dainas.\n` +
        `Spustelėkite Atšaukti — ištrinti tik albumą (dainos liks kaip nepriskirtos).`
      )
    }

    setDeleting(true)
    try {
      const url = `/api/albums/${id}${deleteTracks ? '?deleteTracks=true' : ''}`
      await fetch(url, { method: 'DELETE' })
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
    <div className="space-y-2.5 p-3 pb-4">
      <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] shadow-sm p-3 space-y-2.5">
        <div className="grid grid-cols-[1fr_auto] gap-3 items-start">
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Pavadinimas *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Albumo pavadinimas"
              className="w-full px-2.5 py-1.5 border border-[var(--input-border)] rounded-lg text-[var(--text-primary)] text-sm font-medium focus:outline-none focus:border-blue-400 bg-[var(--bg-surface)] transition-colors" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Data</label>
            <div className="flex gap-1">
              <div className="w-16"><DateNumberInput value={form.year} onChange={v => set('year', v)} min={1900} max={CY + 2} placeholder="Metai" /></div>
              <div className="w-10"><DateNumberInput value={form.month} onChange={v => set('month', v)} min={1} max={12} placeholder="Mėn" /></div>
              <div className="w-9"><DateNumberInput value={form.day} onChange={v => set('day', v)} min={1} max={31} placeholder="D" /></div>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Atlikėjai *</label>
          <div className="flex flex-wrap items-center gap-1.5">
            {form.artist_id ? (
              <div className="flex items-center gap-1.5 bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-xl px-2 py-1 shadow-sm shrink-0">
                <div className="w-6 h-6 rounded-full overflow-hidden bg-[var(--bg-active)] shrink-0">
                  {artistAvatar
                    ? <img src={artistAvatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-400 to-indigo-500 text-white text-xs font-bold">{artistName[0]}</div>
                  }
                </div>
                <span className="text-[var(--text-primary)] text-sm font-semibold">{artistName}</span>
                <button type="button" onClick={() => { set('artist_id', 0); setArtistName(''); setArtistId(null); setArtistAvatar('') }}
                  className="text-[var(--text-faint)] hover:text-red-500 transition-colors ml-0.5 text-base leading-none">×</button>
              </div>
            ) : null}
            {featuredArtists.map((a, i) => (
              <div key={a.id} className="flex items-center gap-1 bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-xl px-2 py-1 text-xs shadow-sm shrink-0">
                <span className="text-[var(--text-muted)] text-[10px]">su</span>
                <span className="text-[var(--text-secondary)] font-medium">{a.name}</span>
                <button type="button" onClick={() => setFeaturedArtists(p => p.filter((_, j) => j !== i))}
                  className="text-[var(--text-faint)] hover:text-red-500 ml-0.5 leading-none">×</button>
              </div>
            ))}
            <div className="flex-1 min-w-[120px]">
              <ArtistSearchInput
                placeholder={form.artist_id ? '+ su atlikėju...' : 'Ieškoti atlikėjo...'}
                onSelect={(id, name, avatar) => {
                  if (!form.artist_id) { set('artist_id', id); setArtistName(name); setArtistId(id); setArtistAvatar(avatar || '') }
                  else if (id !== form.artist_id && !featuredArtists.find(a => a.id === id))
                    setFeaturedArtists(p => [...p, { id, name }])
                }} />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Tipas</label>
          <div className="flex flex-wrap gap-1">
            {ALBUM_TYPE_FIELDS.map(t => (
              <button key={t.key} type="button" onClick={() => setType(t.key)}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                  (form as any)[t.key] ? 'bg-blue-600 text-white shadow-sm' : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-active)]'
                }`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] shadow-sm p-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-semibold text-[var(--text-muted)] mb-1.5">Viršelis</p>
            <CoverImageField value={form.cover_image_url || ''} onChange={url => set('cover_image_url', url)} />
          </div>

          <div className="space-y-2.5 min-w-0">
            <div>
              <p className="text-xs font-semibold text-[var(--text-muted)] mb-1 flex items-center gap-1">
                <svg className="w-3.5 h-3.5 text-red-500" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                YouTube
              </p>
              <div className="flex gap-1 mb-1">
                <input value={form.video_url || ''} onChange={e => set('video_url', e.target.value)}
                  placeholder="youtube.com/watch?v=..."
                  className="flex-1 min-w-0 px-2 py-1.5 border border-[var(--input-border)] rounded-lg text-xs text-[var(--text-secondary)] focus:outline-none focus:border-blue-400 bg-[var(--bg-surface)]" />
                {ytId && (
                  <button type="button" onClick={() => set('video_url', '')}
                    className="px-2 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg text-xs transition-colors shrink-0">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
              </div>
              {ytId && (
                <a href={form.video_url || ''} target="_blank" rel="noopener noreferrer"
                  className="block relative rounded-lg overflow-hidden group mb-1">
                  <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt=""
                    className="w-full aspect-video object-cover group-hover:opacity-90 transition-opacity" />
                  <span className="absolute bottom-1 right-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">↗</span>
                </a>
              )}
              <YouTubeSearch initialQuery={ytSearchQuery} onSelect={url => set('video_url', url)} />
            </div>

            <div>
              <p className="text-xs font-semibold text-[var(--text-muted)] mb-1 flex items-center gap-1">
                <svg className="w-3.5 h-3.5 text-green-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
                Spotify
              </p>
              <input value={form.spotify_id || ''} onChange={e => set('spotify_id', e.target.value)}
                placeholder="Album ID..."
                className="w-full px-2 py-1.5 border border-[var(--input-border)] rounded-lg text-[var(--text-primary)] text-xs focus:outline-none focus:border-blue-400 font-mono transition-colors" />
              {form.spotify_id && (
                <a href={`https://open.spotify.com/album/${form.spotify_id}`} target="_blank" rel="noopener noreferrer"
                  className="mt-1 flex items-center gap-1 text-xs text-green-600 hover:text-green-700 transition-colors">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  Atidaryti Spotify
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="mt-2.5">
          <p className="text-xs font-semibold text-[var(--text-muted)] mb-1">Aprašymas</p>
          <DescriptionEditor value={form.description || ''} onChange={v => set('description', v)} />
        </div>
      </div>
    </div>
  )

  const trackCount = form.tracks?.length || 0

  return (
    <div className="min-h-screen bg-[#f8f7f5]">
      <div className="sticky top-0 z-40 bg-[var(--bg-surface)]/95 backdrop-blur border-b border-[var(--input-border)]">
        <div className="flex items-center justify-between gap-3 px-4 py-2">
          <nav className="hidden sm:flex items-center gap-1 text-sm min-w-0">
            <Link href="/admin" className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] shrink-0">Admin</Link>
            <span className="text-[var(--text-faint)]">/</span>
            <Link href="/admin/artists" className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] shrink-0">Atlikėjai</Link>
            {artistName && artistId && <>
              <span className="text-[var(--text-faint)]">/</span>
              <Link href={`/admin/artists/${artistId}`} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] shrink-0">{artistName}</Link>
            </>}
            <span className="text-[var(--text-faint)]">/</span>
            <Link href={artistId ? `/admin/albums?artist=${artistId}` : "/admin/albums"} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] shrink-0">Albumai</Link>
            <span className="text-[var(--text-faint)]">/</span>
            <span className="text-[var(--text-secondary)] truncate max-w-[160px]">{isNew ? 'Naujas' : (form.title || '...')}</span>
            {!isNew && artistId && <>
              <span className="text-[var(--text-faint)]">/</span>
              <Link href={`/admin/tracks?artistId=${artistId}`} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] shrink-0">Dainos</Link>
            </>}
          </nav>
          <div className="flex sm:hidden items-center gap-2 min-w-0">
            <Link href={artistId ? `/admin/artists/${artistId}` : '/admin/albums'}
              className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </Link>
            <span className="text-[var(--text-primary)] font-semibold truncate">{isNew ? 'Naujas albumas' : (form.title || '...')}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {!isNew && (
              <button onClick={handleDelete} disabled={deleting}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-red-500 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                <span className="hidden sm:inline">Ištrinti</span>
              </button>
            )}
            <Link href={artistId ? `/admin/artists/${artistId}` : '/admin/albums'}
              className="px-3 py-1.5 border border-[var(--input-border)] text-[var(--text-secondary)] rounded-lg text-sm font-medium hover:bg-[var(--bg-elevated)] transition-colors">
              Atšaukti
            </Link>
            <button onClick={handleSubmit} disabled={saving}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${saved ? 'bg-green-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'} disabled:opacity-50`}>
              {saving
                ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" /> Saugoma...</>
                : saved
                ? <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> Išsaugota!</>
                : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> Išsaugoti</>
              }
            </button>
          </div>
        </div>

        <div className="flex lg:hidden border-t border-[var(--border-subtle)]">
          <button onClick={() => setTab('info')}
            className={`flex-1 py-2 text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${tab === 'info' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-[var(--text-muted)]'}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
            Informacija
          </button>
          <button onClick={() => setTab('tracks')}
            className={`flex-1 py-2 text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${tab === 'tracks' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-[var(--text-muted)]'}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" /></svg>
            Dainos {trackCount > 0 && <span className="bg-[var(--bg-active)] text-[var(--text-secondary)] text-xs font-bold px-1.5 py-0.5 rounded-full">{trackCount}</span>}
          </button>
        </div>
      </div>

      {error && (
        <div className="px-3 pt-2">
          <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {error}
            <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}

      <div className="lg:hidden">
        {tab === 'info' && InfoPanel}
        {tab === 'tracks' && (
          <div className="bg-[var(--bg-surface)] min-h-screen">
            <TracksHeader count={trackCount} />
            <TrackList tracks={form.tracks || []} isMobile={true}
              onAdd={addTrack} onUpdate={upTrack} onRemove={rmTrack} onHardDelete={hardDeleteTrack} onReorder={reorderTracks} onSave={handleSubmit} />
          </div>
        )}
      </div>

      <div className="hidden lg:grid lg:grid-cols-2 items-start">
        <div className="border-r border-[var(--input-border)]">{InfoPanel}</div>
        <div className="bg-[#f8f7f5] sticky top-[41px]" style={{ height: 'calc(100vh - 41px)', overflowY: 'auto' }}>
          <div className="m-3 bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] shadow-sm overflow-hidden">
            <TracksHeader count={trackCount} />
            <TrackList tracks={form.tracks || []} isMobile={false}
              onAdd={addTrack} onUpdate={upTrack} onRemove={rmTrack} onHardDelete={hardDeleteTrack} onReorder={reorderTracks} onSave={handleSubmit} />
          </div>
        </div>
      </div>
    </div>
  )
}
