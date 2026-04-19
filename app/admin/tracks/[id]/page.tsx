'use client'

import React, { useState, useEffect, use, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { IcoTrash, IcoCheck, IcoX, IcoAlert, IcoSearch, IcoImage, IcoInfo, IcoText, IcoBack, IcoFolder, IcoYouTube, IcoSpotify } from '@/components/ui/Icons'
import ArtistSearchInput from '@/components/ui/ArtistSearchInput'
import DateNumberInput from '@/components/ui/DateNumberInput'
import YouTubeSearch from '@/components/ui/YouTubeSearch'
import DescriptionEditor from '@/components/ui/DescriptionEditor'
import { extractYouTubeId } from '@/components/ui/helpers'

const TRACK_TYPES = ['normal', 'remix', 'live', 'mashup', 'instrumental'] as const
const TRACK_TYPE_DEFS: Record<string, { label: string; icon: React.ReactNode }> = {
  normal:       { label: 'Įprastinė', icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" /></svg> },
  single:       { label: 'Singlas',   icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth={2}/><circle cx="12" cy="12" r="2" strokeWidth={2}/></svg> },
  remix:        { label: 'Remix',     icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> },
  live:         { label: 'Gyva',      icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V5l3 3 3-3v14" /><path strokeLinecap="round" strokeWidth={2} d="M3 12h2m14 0h2"/></svg> },
  mashup:       { label: 'Mashup',    icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg> },
  instrumental: { label: 'Instr.',    icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" /><line x1="4" y1="4" x2="20" y2="20" strokeWidth={2} strokeLinecap="round"/></svg> },
}

type FeaturingArtist = { artist_id: number; name: string }
type AlbumRef = { album_id: number; album_title: string; album_year: number | null; position: number; cover_url?: string | null }
type YTResult = { videoId: string; title: string; channel: string; thumbnail: string }
type LyricsTab = 'lyrics' | 'chords'

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
          <img src={value} alt="" referrerPolicy="no-referrer"
            className="w-full object-contain bg-[var(--bg-body)] group-hover:opacity-90 transition-opacity" style={{ height: '160px' }} />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span className="text-white text-sm font-medium">Keisti ↗</span>
          </div>
          {uploading && <div className="absolute inset-0 bg-[var(--bg-surface)]/80 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>}
        </div>
      ) : (
        <div className="relative w-full rounded-lg border-2 border-dashed border-[var(--input-border)] bg-[var(--bg-elevated)] cursor-pointer hover:border-blue-400 transition-colors flex items-center justify-center" style={{ height: '160px' }}
          onClick={() => !uploading && fileRef.current?.click()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) upload(f) }}
          onDragOver={e => e.preventDefault()}>
          <div className="text-center text-[var(--text-muted)]">
            <IcoImage />
            <span className="text-xs block mt-1">Įkelti viršelį</span>
          </div>
          {uploading && <div className="absolute inset-0 bg-[var(--bg-surface)]/80 flex items-center justify-center rounded-lg">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>}
        </div>
      )}
      <div className="flex gap-1.5">
        <input type="text" value={urlInput} onChange={e => setUrlInput(e.target.value)}
          onBlur={e => commitUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && commitUrl(urlInput)}
          placeholder="https://..." className="flex-1 min-w-0 px-2 py-1.5 border border-[var(--input-border)] rounded-lg text-xs text-[var(--text-secondary)] focus:outline-none focus:border-blue-400 bg-[var(--bg-surface)]" />
        <button type="button" onClick={() => fileRef.current?.click()}
          className="p-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--bg-active)] text-[var(--text-secondary)] rounded-lg transition-colors shrink-0"><IcoFolder /></button>
        {value && <button type="button" onClick={() => { onChange(''); setUrlInput('') }}
          className="p-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg transition-colors shrink-0"><IcoX /></button>}
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
  const [artistAvatar, setArtistAvatar] = useState<string | null>(null)
  const [trackType, setTrackType] = useState('normal')
  // ── FIX 1: is_single kaip atskiras state ──────────────────────────────────
  const [isSingle, setIsSingle] = useState(false)
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
  const [mobileTab, setMobileTab] = useState<'info' | 'lyrics'>('info')
  const [showMobileNav, setShowMobileNav] = useState(false)
  const mobileNavRef = useRef<HTMLDivElement>(null)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(!isNewTrack)
  const [parsingFeat, setParsingFeat] = useState(false)
  const [parseResult, setParseResult] = useState<string | null>(null)
  const [fetchingCover, setFetchingCover] = useState(false)
  const [coverFetchMsg, setCoverFetchMsg] = useState<string | null>(null)

  const handleFetchWikiCover = async () => {
    if (!title) return
    setFetchingCover(true); setCoverFetchMsg(null)
    try {
      const query1 = [artistName, title, 'song'].filter(Boolean).join(' ')
      const query2 = [artistName, title].filter(Boolean).join(' ')
      let pageTitle = ''
      for (const q of [query1, query2]) {
        const results = (await (await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&origin=*&srlimit=3`)).json())?.query?.search || []
        const match = results.find((r: any) => r.title.toLowerCase().includes(title.toLowerCase())) || results[0]
        if (match) { pageTitle = match.title; break }
      }
      if (!pageTitle) { setCoverFetchMsg('Wikipedia puslapio nerasta'); return }
      const page = Object.values((await (await fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(pageTitle)}&prop=images&format=json&origin=*&imlimit=20`)).json())?.query?.pages || {})[0] as any
      const images: string[] = (page?.images || []).map((i: any) => i.title as string)
      const coverKeywords = ['cover', 'single', 'album', title.toLowerCase().replace(/\s+/g, '_')]
      const bestImage = images.find(img => coverKeywords.some(k => img.toLowerCase().includes(k)) && (img.toLowerCase().endsWith('.jpg') || img.toLowerCase().endsWith('.png')))
        || images.find(img => img.toLowerCase().endsWith('.jpg') || img.toLowerCase().endsWith('.png'))
      if (!bestImage) { setCoverFetchMsg('Tinkamo paveikslėlio nerasta'); return }
      const imgUrl = (Object.values((await (await fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(bestImage)}&prop=imageinfo&iiprop=url&format=json&origin=*`)).json())?.query?.pages || {})[0] as any)?.imageinfo?.[0]?.url
      if (!imgUrl) { setCoverFetchMsg('Nepavyko gauti paveikslėlio URL'); return }
      try {
        const d = await (await fetch('/api/fetch-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: imgUrl }) })).json()
        if (d.url && !d.url.startsWith('data:')) { setCoverUrl(d.url); setCoverFetchMsg('✓ Viršelis pridėtas!'); return }
      } catch {}
      setCoverUrl(imgUrl); setCoverFetchMsg('✓ Viršelis pridėtas!')
    } catch (e: any) { setCoverFetchMsg(`Klaida: ${e.message}`) }
    finally { setFetchingCover(false) }
  }

  const extractFeatFromTitle = (t: string): { cleanTitle: string; names: string[] } => {
    const patterns = [/\s*\(feat(?:uring)?\.?\s+([^)]+)\)/gi, /\s*\(ft\.?\s+([^)]+)\)/gi, /\s*\(su\s+([^)]{2,})\)/gi, /\s*\(with\s+([^)]{2,})\)/gi, /\s*\(ir\s+([^)]{2,})\)/gi]
    let cleanTitle = t; const allNames: string[] = []
    for (const p of patterns) cleanTitle = cleanTitle.replace(p, (_, names) => { allNames.push(...names.split(/\s+(?:and|ir|&)\s+|,\s*/).map((n: string) => n.trim()).filter((n: string) => n.length > 1)); return '' })
    return { cleanTitle: cleanTitle.trim(), names: allNames }
  }

  const handleParseFeaturing = async () => {
    const { cleanTitle, names } = extractFeatFromTitle(title)
    if (names.length === 0) { setParseResult('Nerasta featuring informacijos pavadinime'); return }
    setParsingFeat(true); setParseResult(null)
    try {
      const added: string[] = []; const newFeaturing = [...featuring]
      const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').trim()
      const capitalize = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase())
      for (const rawName of names) {
        const name = capitalize(rawName.trim()); const normName = normalize(name)
        if (newFeaturing.find(f => normalize(f.name) === normName)) continue
        let match: any = null
        for (const variant of [...new Set([name, normName, rawName.trim()])]) {
          const data = await (await fetch(`/api/artists?search=${encodeURIComponent(variant)}&limit=20`)).json()
          match = (data.artists || []).find((a: any) => normalize(a.name) === normName)
          if (match) break
        }
        if (match) {
          if (match.id !== artistId) { newFeaturing.push({ artist_id: match.id, name: match.name }); added.push(match.name) }
        } else {
          const json = await (await fetch('/api/artists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })).json()
          const newArtist = json.artist || json.data || json
          if (newArtist?.id) { newFeaturing.push({ artist_id: newArtist.id, name: newArtist.name || name }); added.push(`${newArtist.name || name} (naujas)`) }
        }
      }
      setFeaturing(newFeaturing); setTitle(cleanTitle)
      setParseResult(added.length > 0 ? `✓ Pridėta: ${added.join(', ')} · Pavadinimas išvalytas` : '✓ Pavadinimas išvalytas')
    } catch (e: any) { setParseResult(`Klaida: ${e.message}`) }
    finally { setParsingFeat(false) }
  }

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  useEffect(() => {
    const h = (e: MouseEvent) => { if (mobileNavRef.current && !mobileNavRef.current.contains(e.target as Node)) setShowMobileNav(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  useEffect(() => { if (status === 'unauthenticated') router.push('/') }, [status])

  useEffect(() => {
    if (isNewTrack || !isAdmin) return
    setLoading(true)
    fetch(`/api/tracks/${id}`).then(r => r.json()).then(data => {
      if (data.error) { setError(data.error); return }
      setTitle(data.title || ''); setArtistId(data.artist_id || 0)
      setTrackType(data.type || 'normal')
      // ── FIX 1: užkrauti is_single ────────────────────────────────────────
      setIsSingle(data.is_single || false)
      setReleaseYear(data.release_year ? String(data.release_year) : '')
      setReleaseMonth(data.release_month ? String(data.release_month) : '')
      setReleaseDay(data.release_day ? String(data.release_day) : '')
      setVideoUrl(data.video_url || ''); setSpotifyId(data.spotify_id || '')
      setLyrics(data.lyrics || ''); setChords(data.chords || '')
      setIsNew(data.is_new || false); setIsNewDate(data.is_new_date || null)
      setCoverUrl(data.cover_url || '')
      // ── FIX 3: gauti atlikėjo nuotrauką ──────────────────────────────────
      if (data.artists?.name) {
        setArtistName(data.artists.name)
        setArtistSlug(data.artists.slug || '')
        // Papildomai krauti atlikėjo duomenis kad gautume cover_image_url
        fetch(`/api/artists/${data.artist_id}`)
          .then(r => r.json())
          .then(artist => { if (artist.cover_image_url) setArtistAvatar(artist.cover_image_url) })
          .catch(() => {})
      }
      if (data.featuring) setFeaturing(data.featuring)
      if (data.albums) setAlbums(data.albums)
    }).finally(() => setLoading(false))
  }, [id, isAdmin])

  const toggleNew = async () => {
    const newVal = !isNew; const newDate = newVal ? new Date().toISOString().slice(0, 10) : null
    setIsNew(newVal); setIsNewDate(newDate)
    if (!isNewTrack) await fetch(`/api/tracks/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_new: newVal, is_new_date: newDate }) })
  }

  const removeFromAlbum = async (albumId: number) => {
    if (!confirm('Pašalinti iš albumo?')) return
    setRemovingFromAlbum(albumId)
    try { await fetch(`/api/album-tracks?track_id=${id}&album_id=${albumId}`, { method: 'DELETE' }); setAlbums(p => p.filter(a => a.album_id !== albumId)) }
    finally { setRemovingFromAlbum(null) }
  }

  const handleSave = useCallback(async () => {
    if (!title.trim()) { setError('Pavadinimas privalomas'); return }
    if (!artistId) { setError('Pasirinkite atlikėją'); return }
    setSaving(true); setError('')
    try {
      // ── FIX 1: siųsti is_single ──────────────────────────────────────────
      const payload = { title, artist_id: artistId, type: trackType, is_single: isSingle, release_year: releaseYear || null, release_month: releaseMonth || null, release_day: releaseDay || null, video_url: videoUrl, spotify_id: spotifyId, lyrics, chords, is_new: isNew, is_new_date: isNewDate, cover_url: coverUrl, featuring }
      const res = await fetch(isNewTrack ? '/api/tracks' : `/api/tracks/${id}`, { method: isNewTrack ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSaved(true); setTimeout(() => setSaved(false), 2000)
      if (isNewTrack) router.push(`/admin/tracks/${data.id}`)
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }, [title, artistId, trackType, isSingle, releaseYear, releaseMonth, releaseDay, videoUrl, spotifyId, lyrics, chords, isNew, isNewDate, coverUrl, featuring, id, isNewTrack])

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
  const hasFeat = /\((feat|featuring|ft\.|su |with |ir )/i.test(title)

  if (status === 'loading' || !isAdmin) return null

  // ── Info Panel ──────────────────────────────────────────────────────────────
  const InfoPanel = (
    <div className="space-y-2.5 p-3 pb-4">
      <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] shadow-sm p-3 space-y-2.5">

        <div className="space-y-2 sm:space-y-0 sm:grid sm:grid-cols-[1fr_auto] sm:gap-3 sm:items-start">
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Pavadinimas *</label>
            <input value={title} onChange={e => { setTitle(e.target.value); setParseResult(null) }} placeholder="Dainos pavadinimas"
              className="w-full px-2.5 py-1.5 border border-[var(--input-border)] rounded-lg text-[var(--text-primary)] text-sm font-medium focus:outline-none focus:border-blue-400 bg-[var(--bg-surface)] transition-colors" />
            {hasFeat && (
              <div className="mt-1">
                <button type="button" onClick={handleParseFeaturing} disabled={parsingFeat}
                  className="text-xs text-blue-500 hover:underline disabled:opacity-50 flex items-center gap-1">
                  {parsingFeat ? <><span className="inline-block w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />Ieškoma...</> : '← Ieškoti papildomų atlikėjų'}
                </button>
              </div>
            )}
            {parseResult && <p className={`text-xs mt-0.5 ${parseResult.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>{parseResult}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Data</label>
            <div className="flex gap-1">
              <DateNumberInput mode="string" value={releaseYear} onChange={setReleaseYear} min={1900} max={2030} placeholder="Metai" width="w-16" />
              <DateNumberInput mode="string" value={releaseMonth} onChange={setReleaseMonth} min={1} max={12} placeholder="Mėn" />
              <DateNumberInput mode="string" value={releaseDay} onChange={setReleaseDay} min={1} max={31} placeholder="D" width="w-11" />
            </div>
            {firstAlbumYear && releaseYear !== String(firstAlbumYear) && (
              <button onClick={() => { setReleaseYear(String(firstAlbumYear)); setReleaseMonth(''); setReleaseDay('') }}
                className="mt-1 text-xs text-blue-500 hover:underline">← Albumo metai ({firstAlbumYear})</button>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Atlikėjai *</label>
          <div className="flex flex-wrap items-center gap-1.5">
            {artistId ? (
              <div className="flex items-center gap-1.5 bg-blue-50 text-blue-800 border border-blue-200 rounded-full pl-1 pr-2.5 py-1 text-sm font-semibold shrink-0">
                {artistAvatar
                  ? <img src={artistAvatar} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
                  : <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold shrink-0">{artistName[0]}</div>
                }
                {artistName}
                <button type="button" onClick={() => { setArtistId(0); setArtistName(''); setArtistSlug(''); setArtistAvatar(null) }}
                  className="text-blue-400 hover:text-red-500 ml-0.5"><IcoX /></button>
              </div>
            ) : (
              <div className="flex-1 min-w-[140px]">
                <ArtistSearchInput placeholder="Pagrindinis atlikėjas..." onSelect={(id, name, avatar) => { setArtistId(id); setArtistName(name); setArtistAvatar(avatar || null) }} />
              </div>
            )}
            {featuring.map((f, i) => (
              <div key={f.artist_id} className="flex items-center gap-1 bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--input-border)] rounded-full px-2 py-1 text-xs shrink-0">
                <span className="text-[var(--text-muted)]">su</span>
                <a href={`/admin/artists/${f.artist_id}`} target="_blank" rel="noreferrer"
                  className="hover:text-blue-600 hover:underline transition-colors">{f.name}</a>
                <button type="button" onClick={() => setFeaturing(p => p.filter((_, j) => j !== i))}
                  className="text-[var(--text-muted)] hover:text-red-500 ml-0.5">×</button>
              </div>
            ))}
            {artistId > 0 && (
              <div className="flex-1 min-w-[120px]">
                <ArtistSearchInput placeholder="+ su atlikėju..." onSelect={(id, name) => {
                  if (id === artistId || featuring.find(f => f.artist_id === id)) return
                  setFeaturing(p => [...p, { artist_id: id, name }])
                }} />
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Tipas</label>
          <div className="flex flex-wrap gap-1">
            {TRACK_TYPES.map(tp => (
              <button key={tp} type="button" onClick={() => setTrackType(tp)}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                  trackType === tp
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-active)]'
                }`}>
                {TRACK_TYPE_DEFS[tp].icon}{TRACK_TYPE_DEFS[tp].label}
              </button>
            ))}
            {/* ── FIX 1: isSingle toggle ────────────────────────────────── */}
            <button type="button" onClick={() => setIsSingle(p => !p)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all ${isSingle ? 'bg-orange-500 text-white shadow-sm' : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-active)]'}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth={2}/><circle cx="12" cy="12" r="3" strokeWidth={2}/></svg>
              Singlas
            </button>
            <button type="button" onClick={toggleNew}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all ${isNew ? 'bg-green-500 text-white shadow-sm' : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-active)]'}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>Naujas
            </button>
          </div>
          {isNew && isNewDate && <p className="text-xs text-green-500 mt-1">nuo {isNewDate} · išsaugoma automatiškai</p>}
        </div>
      </div>

      {albums.length > 0 && (
        <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] shadow-sm overflow-hidden">
          <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex items-center gap-1.5">
            <span className="text-xs font-bold text-[var(--text-secondary)]">Albumai</span>
            <span className="bg-[var(--bg-active)] text-[var(--text-secondary)] text-xs font-bold px-1.5 py-0.5 rounded-full">{albums.length}</span>
          </div>
          {albums.map(a => (
            <div key={a.album_id} className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--border-subtle)] last:border-0 group hover:bg-[var(--bg-elevated)] transition-colors">
              <span className="text-[var(--text-faint)] text-xs w-4 text-right shrink-0">{a.position}.</span>
              <div className="flex-1 min-w-0">
                <Link href={`/admin/albums/${a.album_id}`} className="text-sm text-[var(--text-primary)] hover:text-blue-600 truncate block transition-colors">{a.album_title}</Link>
                {a.album_year && <span className="text-xs text-[var(--text-muted)]">{a.album_year}</span>}
              </div>
              <button onClick={() => removeFromAlbum(a.album_id)} disabled={removingFromAlbum === a.album_id}
                className="opacity-0 group-hover:opacity-100 text-[var(--text-faint)] hover:text-red-500 text-xs px-1 rounded transition-all disabled:opacity-50">
                {removingFromAlbum === a.album_id ? '...' : '✕'}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] shadow-sm p-3 space-y-2.5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-semibold text-[var(--text-muted)] mb-1.5">Viršelis</p>
            <CoverMini value={coverUrl} onChange={v => { setCoverUrl(v); setCoverFetchMsg(null) }} />
            {!coverUrl && (
              <div className="mt-1">
                <button type="button" onClick={handleFetchWikiCover} disabled={fetchingCover}
                  className="text-xs text-blue-500 hover:underline disabled:opacity-50 flex items-center gap-1">
                  {fetchingCover ? <><span className="inline-block w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />Ieškoma...</> : '← Wikipedia viršelis'}
                </button>
                {coverFetchMsg && <p className={`text-xs mt-0.5 ${coverFetchMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>{coverFetchMsg}</p>}
              </div>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--text-muted)] mb-1 flex items-center gap-1"><IcoSpotify className="w-3 h-3 text-green-500" />Spotify</p>
            <input value={spotifyId} onChange={e => setSpotifyId(e.target.value)} placeholder="Track ID..."
              className="w-full px-2 py-1.5 border border-[var(--input-border)] rounded-lg text-[var(--text-primary)] text-xs focus:outline-none focus:border-blue-400 font-mono transition-colors bg-[var(--bg-surface)]" />
            {spotifyId && (
              <a href={`https://open.spotify.com/track/${spotifyId}`} target="_blank" rel="noopener noreferrer"
                className="mt-1 flex items-center gap-1 text-xs text-green-600 hover:text-green-700 transition-colors">🔗 Atidaryti Spotify</a>
            )}
            <div className="flex gap-1 mt-1">
              <input value={spUrlInput} onChange={e => setSpUrlInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { const m = spUrlInput.match(/track\/([A-Za-z0-9]+)/); if (m) { setSpotifyId(m[1]); setSpUrlInput('') } } }}
                placeholder="Spotify URL..."
                className="flex-1 min-w-0 px-2 py-1.5 border border-[var(--input-border)] rounded-lg text-xs text-[var(--text-secondary)] focus:outline-none focus:border-blue-400 bg-[var(--bg-surface)]" />
              <button type="button" onClick={() => { const m = spUrlInput.match(/track\/([A-Za-z0-9]+)/); if (m) { setSpotifyId(m[1]); setSpUrlInput('') } }}
                className="px-2.5 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold transition-colors shrink-0">✓</button>
            </div>
          </div>
        </div>

        <div className="border-t border-[var(--border-subtle)] pt-2.5">
          <p className="text-xs font-semibold text-[var(--text-muted)] mb-1 flex items-center gap-1"><IcoYouTube className="w-3 h-3 text-red-500" />YouTube</p>
          <div className="flex gap-1 mb-1.5">
            <input value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="youtube.com/watch?v=..."
              className="flex-1 min-w-0 px-2 py-1.5 border border-[var(--input-border)] rounded-lg text-xs text-[var(--text-secondary)] focus:outline-none focus:border-blue-400 bg-[var(--bg-surface)]" />
            {ytId && <button type="button" onClick={() => setVideoUrl('')}
              className="px-2 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg text-xs transition-colors shrink-0">✕</button>}
          </div>
          {ytId && (
            <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="block relative rounded-lg overflow-hidden group mb-1.5">
              <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt="" className="w-full aspect-video object-cover group-hover:opacity-90 transition-opacity" />
              <span className="absolute bottom-1 right-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">↗</span>
            </a>
          )}
          <YouTubeSearch initialQuery={ytSearchQuery} onSelect={url => setVideoUrl(url)} />
        </div>
      </div>
    </div>
  )

  const LyricsPanel = (
    <div className="flex flex-col h-full p-3">
      <div className="bg-[var(--bg-surface)] rounded-t-xl border border-[var(--border-subtle)] shadow-sm shrink-0 flex items-center">
        <button onClick={() => setLyricsTab('lyrics')}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-tl-xl transition-colors ${lyricsTab === 'lyrics' ? 'text-blue-600 bg-blue-50/60' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'}`}>
          Dainos tekstas {hasLyrics && <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />}
        </button>
        <div className="w-px h-5 bg-[var(--bg-active)] shrink-0" />
        <button onClick={() => setLyricsTab('chords')}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold transition-colors ${lyricsTab === 'chords' ? 'text-blue-600 bg-blue-50/60' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'}`}>
          Akordai {hasChords && <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />}
        </button>
      </div>
      <textarea key={lyricsTab}
        value={lyricsTab === 'lyrics' ? lyrics : chords}
        onChange={e => lyricsTab === 'lyrics' ? setLyrics(e.target.value) : setChords(e.target.value)}
        placeholder={lyricsTab === 'lyrics' ? 'Dainos žodžiai...' : 'Am  G  F  G\nVerse 1...'}
        className="flex-1 w-full px-3 py-2.5 text-sm text-[var(--text-primary)] bg-[var(--bg-surface)] border border-t-0 border-[var(--border-subtle)] shadow-sm rounded-b-xl focus:outline-none resize-none font-mono leading-relaxed"
      />
    </div>
  )

  return (
    <div className="overflow-hidden flex flex-col bg-[#f8f7f5]" style={{ height: 'calc(100vh - 56px)' }}>

      <div className="shrink-0 bg-[var(--bg-surface)]/95 backdrop-blur border-b border-[var(--input-border)]">
        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <nav className="flex items-center gap-1 text-sm min-w-0">
            <Link href="/admin" className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] shrink-0 hidden lg:block">Admin</Link>
            <span className="text-[var(--text-faint)] hidden lg:block">/</span>
            <Link href="/admin/artists" className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] shrink-0 hidden lg:block">Atlikėjai</Link>
            {artistId > 0 && <>
              <span className="text-[var(--text-faint)] hidden lg:block">/</span>
              <Link href={`/admin/artists/${artistId}`} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] shrink-0 hidden lg:block">{artistName}</Link>
              <span className="text-[var(--text-faint)] hidden lg:block">/</span>
              <Link href={`/admin/albums?artist=${artistId}`} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] shrink-0 hidden lg:block">Albumai</Link>
              <span className="text-[var(--text-faint)] hidden lg:block">/</span>
              <Link href={`/admin/tracks?artist=${artistId}`} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] shrink-0 hidden lg:block">Dainos</Link>
            </>}
            <div className="flex lg:hidden items-center gap-2 min-w-0">
              <Link href={artistId ? `/admin/tracks?artist=${artistId}` : '/admin/tracks'}
                className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] shrink-0"><IcoBack /></Link>
              <span className="text-[var(--text-primary)] font-semibold truncate">{isNewTrack ? 'Nauja daina' : (title || '...')}</span>
              {artistId > 0 && (
                <div className="relative shrink-0" ref={mobileNavRef}>
                  <button onClick={() => setShowMobileNav(p => !p)}
                    className="p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] rounded-lg hover:bg-[var(--bg-elevated)] transition-colors">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
                  </button>
                  {showMobileNav && (
                    <div className="absolute left-0 top-full mt-1 bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-xl shadow-[var(--modal-shadow)] z-50 min-w-[160px] overflow-hidden">
                      <Link href={`/admin/artists/${artistId}`} onClick={() => setShowMobileNav(false)}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors">
                        <svg className="w-4 h-4 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                        {artistName}
                      </Link>
                      <Link href={`/admin/albums?artist=${artistId}`} onClick={() => setShowMobileNav(false)}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors border-t border-[var(--border-subtle)]">
                        <svg className="w-4 h-4 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" /></svg>
                        Albumai
                      </Link>
                      <Link href={`/admin/tracks?artist=${artistId}`} onClick={() => setShowMobileNav(false)}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 font-medium hover:bg-[var(--hover-blue)] transition-colors border-t border-[var(--border-subtle)]">
                        <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h10" /></svg>
                        Dainos
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
            <span className="text-[var(--text-faint)] hidden lg:block">/</span>
            <span className="text-[var(--text-primary)] font-semibold truncate max-w-[260px] hidden lg:block">{isNewTrack ? 'Nauja daina' : (title || '...')}</span>
          </nav>

          <div className="flex items-center gap-1.5 shrink-0">
            {!isNewTrack && (
              <button onClick={handleDelete} disabled={deleting}
                className="flex items-center gap-1 px-2.5 py-1.5 text-red-500 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                <IcoTrash /><span className="hidden sm:inline">Ištrinti</span>
              </button>
            )}
            <Link href={artistId ? `/admin/artists/${artistId}` : '/admin/tracks'}
              className="px-3 py-1.5 border border-[var(--input-border)] text-[var(--text-secondary)] rounded-lg text-sm font-medium hover:bg-[var(--bg-elevated)] transition-colors">
              Atšaukti
            </Link>
            <button onClick={handleSave} disabled={saving}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${saved ? 'bg-green-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'} disabled:opacity-50`}>
              {saving
                ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" />Saugoma...</>
                : saved ? <><IcoCheck />Išsaugota!</> : <><IcoCheck />Išsaugoti</>}
            </button>
          </div>
        </div>

        <div className="flex lg:hidden border-t border-[var(--border-subtle)]">
          <button onClick={() => setMobileTab('info')}
            className={`flex-1 py-2 text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${mobileTab === 'info' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-[var(--text-muted)]'}`}>
            <IcoInfo />Informacija
          </button>
          <button onClick={() => setMobileTab('lyrics')}
            className={`flex-1 py-2 text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${mobileTab === 'lyrics' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-[var(--text-muted)]'}`}>
            <IcoText />Tekstas{(hasLyrics || hasChords) && <span className="w-1.5 h-1.5 rounded-full bg-green-400" />}
          </button>
        </div>
      </div>

      {error && (
        <div className="shrink-0 px-3 pt-2">
          <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-center gap-2">
            <IcoAlert />{error}
            <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600"><IcoX /></button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="hidden lg:grid flex-1 grid-cols-2 min-h-0">
            <div className="border-r border-[var(--input-border)] overflow-y-auto">{InfoPanel}</div>
            <div className="overflow-hidden">{LyricsPanel}</div>
          </div>
          <div className="flex lg:hidden flex-1 min-h-0 overflow-hidden">
            {mobileTab === 'info'
              ? <div className="flex-1 overflow-y-auto">{InfoPanel}</div>
              : <div className="flex-1 overflow-hidden">{LyricsPanel}</div>
            }
          </div>
        </>
      )}
    </div>
  )
}
