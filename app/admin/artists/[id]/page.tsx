'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import WikipediaImportDiscography from '@/components/WikipediaImportDiscography'
import WikipediaImport from '@/components/WikipediaImport'
import ArtistForm, { ArtistFormData, emptyArtistForm } from '@/components/ArtistForm'

const GENRE_BY_ID: Record<number, string> = {
  1000001: 'Alternatyvioji muzika',
  1000002: 'Elektroninė, šokių muzika',
  1000003: "Hip-hop'o muzika",
  1000004: 'Kitų stilių muzika',
  1000005: 'Pop, R&B muzika',
  1000006: 'Rimtoji muzika',
  1000007: 'Roko muzika',
  1000008: 'Sunkioji muzika',
}

function dbToForm(data: any): ArtistFormData {
  return {
    ...emptyArtistForm,
    name:        data.name || '',
    type:        data.type || 'group',
    country:     data.country || 'Lietuva',
    genre:       data.genres?.[0] ? (GENRE_BY_ID[data.genres[0]] || '') : '',
    substyles:   data.substyleNames || [],
    description: data.description || '',
    yearStart:   data.active_from ? String(data.active_from) : '',
    yearEnd:     data.active_until ? String(data.active_until) : '',
    breaks:      data.breaks || [],
    avatar:      data.cover_image_url || '',
    avatarWide:  data.cover_image_wide_url || '',
    photos:      (data.photos || []).filter((p: any, i: number, a: any[]) => p?.url && a.findIndex((x: any) => x.url === p.url) === i),
    website:     data.website || '',
    subdomain:   data.subdomain || '',
    gender:      data.gender || '',
    birthYear:   data.birth_date ? data.birth_date.split('-')[0] : '',
    birthMonth:  data.birth_date ? data.birth_date.split('-')[1] : '',
    birthDay:    data.birth_date ? data.birth_date.split('-')[2] : '',
    deathYear:   data.death_date ? data.death_date.split('-')[0] : '',
    deathMonth:  data.death_date ? data.death_date.split('-')[1] : '',
    deathDay:    data.death_date ? data.death_date.split('-')[2] : '',
    facebook:    data.links?.facebook || '',
    instagram:   data.links?.instagram || '',
    youtube:     data.links?.youtube || '',
    tiktok:      data.links?.tiktok || '',
    spotify:     data.links?.spotify || '',
    soundcloud:  data.links?.soundcloud || '',
    bandcamp:    data.links?.bandcamp || '',
    twitter:     data.links?.twitter || '',
    members:     data.related?.filter((r: any) => r.type === 'solo') || [],
    groups:      data.related?.filter((r: any) => r.type === 'group') || [],
  }
}

const GENRE_IDS: Record<string, number> = {
  'Alternatyvioji muzika': 1000001,
  'Elektroninė, šokių muzika': 1000002,
  "Hip-hop'o muzika": 1000003,
  'Kitų stilių muzika': 1000004,
  'Pop, R&B muzika': 1000005,
  'Rimtoji muzika': 1000006,
  'Roko muzika': 1000007,
  'Sunkioji muzika': 1000008,
}

function formToDb(form: ArtistFormData) {
  const genreIds: number[] = []
  if (form.genre && GENRE_IDS[form.genre]) genreIds.push(GENRE_IDS[form.genre])
  const birthDate = form.birthYear
    ? `${form.birthYear}-${String(form.birthMonth||1).padStart(2,'0')}-${String(form.birthDay||1).padStart(2,'0')}`
    : null
  const deathDate = form.deathYear
    ? `${form.deathYear}-${String(form.deathMonth||1).padStart(2,'0')}-${String(form.deathDay||1).padStart(2,'0')}`
    : null
  return {
    name: form.name, type: form.type, country: form.country,
    type_music: true, type_film: false, type_dance: false, type_books: false,
    active_from: form.yearStart ? parseInt(form.yearStart) : null,
    active_until: form.yearEnd ? parseInt(form.yearEnd) : null,
    description: form.description, cover_image_url: form.avatar, cover_image_wide_url: form.avatarWide || null,
    website: form.website, subdomain: form.subdomain, gender: form.gender,
    birth_date: birthDate, death_date: deathDate,
    genres: genreIds, substyleNames: form.substyles || [],
    breaks: form.breaks, photos: form.photos,
    links: {
      facebook: form.facebook, instagram: form.instagram, youtube: form.youtube,
      tiktok: form.tiktok, spotify: form.spotify, soundcloud: form.soundcloud,
      bandcamp: form.bandcamp, twitter: form.twitter,
    },
    related: [
      ...(form.members||[]).map(m=>({ id: typeof m.id==='string' ? parseInt(m.id) : Number(m.id), yearFrom: m.yearFrom, yearTo: m.yearTo })),
      ...(form.groups||[]).map(g=>({ id: typeof g.id==='string' ? parseInt(g.id) : Number(g.id), yearFrom: g.yearFrom, yearTo: g.yearTo })),
    ],
  }
}

// FIX #5: upload external/Wikipedia image to Supabase on save
async function fetchAndStoreWikiAvatar(rawUrl: string): Promise<string> {
  try {
    const res = await fetch('/api/fetch-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: rawUrl }),
    })
    if (res.ok) {
      const d = await res.json()
      if (d.url && !d.url.startsWith('data:')) return d.url
    }
  } catch {}
  return rawUrl
}

// ── Track row ────────────────────────────────────────────────────────────────
function TrackRow({ track }: { track: any }) {
  const trackId = track.track_id || track.id
  const hasVideo = !!track.video_url
  const hasLyrics = typeof track.lyrics === 'string' && track.lyrics.trim().length > 0
  const featuring: string[] = (track.featuring || []).map((f: any) => typeof f === 'string' ? f : f.name || '')
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 border-b border-gray-50 last:border-0 hover:bg-gray-50/80 group transition-colors">
      <span className="text-gray-300 text-xs w-5 text-right shrink-0 tabular-nums">{track.sort_order || track.position}.</span>
      <div className="flex-1 min-w-0 flex items-baseline gap-1 flex-wrap">
        <span className="text-sm text-gray-800 truncate">{track.title}</span>
        {featuring.length > 0 && <span className="text-xs text-gray-400 whitespace-nowrap">su {featuring.join(', ')}</span>}
      </div>
      {hasVideo && <span className="text-blue-400 text-xs shrink-0">▶</span>}
      {hasLyrics && <span className="text-green-500 text-xs font-bold shrink-0">T</span>}
      {trackId && (
        <a href={`/admin/tracks/${trackId}`} target="_blank" rel="noopener noreferrer"
          className="opacity-0 group-hover:opacity-100 shrink-0 px-1.5 py-0.5 text-xs text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded transition-all font-medium">
          Redaguoti ↗
        </a>
      )}
    </div>
  )
}

// ── Album accordion ──────────────────────────────────────────────────────────
function AlbumCard({ album, defaultOpen }: { album: any; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const [tracks, setTracks] = useState<any[]>([])
  const [loadingTracks, setLoadingTracks] = useState(false)
  const [tracksLoaded, setTracksLoaded] = useState(false)

  // FIX #3: fetch tracks immediately if this is default-open
  useEffect(() => {
    if (defaultOpen) loadTracks()
  }, []) // eslint-disable-line

  const loadTracks = async () => {
    if (tracksLoaded) return
    setLoadingTracks(true)
    try {
      const res = await fetch(`/api/albums/${album.id}`)
      const data = await res.json()
      setTracks(data.tracks || [])
      setTracksLoaded(true)
    } catch {}
    finally { setLoadingTracks(false) }
  }

  const toggleOpen = async () => {
    if (!open && !tracksLoaded) await loadTracks()
    setOpen(p => !p)
  }

  const typeLabel = album.type_studio ? 'Studijinis'
    : album.type_ep ? 'EP'
    : album.type_compilation ? 'Kompiliacija'
    : album.type_live ? 'Gyvas'
    : album.type_single ? 'Singlas'
    : 'Albumas'

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors select-none" onClick={toggleOpen}>
        {album.cover_image_url
          ? <img src={album.cover_image_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" referrerPolicy="no-referrer" />
          : <div className="w-10 h-10 rounded-lg bg-gray-100 shrink-0 flex items-center justify-center text-gray-300 text-lg">💿</div>
        }
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-gray-900 truncate">{album.title}</span>
            <span className="text-xs text-gray-400 shrink-0">{album.year}</span>
            <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">{typeLabel}</span>
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {tracksLoaded ? `${tracks.length} dainų` : album.track_count ? `${album.track_count} dainų` : ''}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <a href={`/admin/albums/${album.id}`} onClick={e => e.stopPropagation()}
            className="px-2 py-1 text-xs text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors font-medium">
            Redaguoti ↗
          </a>
          <span className={`text-gray-400 text-xs transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>▼</span>
        </div>
      </div>
      {open && (
        <div className="border-t border-gray-100">
          {loadingTracks ? (
            <div className="py-4 flex justify-center">
              <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : tracks.length > 0 ? (
            <>
              {tracks.map((t: any, i: number) => <TrackRow key={t.track_id || t.id || i} track={t} />)}
              <div className="px-3 py-1.5 border-t border-gray-50">
                <a href={`/admin/albums/${album.id}`} className="text-xs text-gray-400 hover:text-blue-500 transition-colors">
                  + Pridėti / redaguoti dainas
                </a>
              </div>
            </>
          ) : (
            <div className="py-4 text-center">
              <p className="text-xs text-gray-400">Nėra dainų</p>
              <a href={`/admin/albums/${album.id}`} className="text-xs text-blue-500 hover:underline mt-1 block">+ Pridėti dainas</a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Discography panel ────────────────────────────────────────────────────────
function DiscographyPanel({ artistId, artistName, refreshKey, onImportClose }: {
  artistId: string; artistName: string; refreshKey: number; onImportClose: () => void
}) {
  const [albums, setAlbums] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/albums?artist_id=${artistId}&limit=100`)
      .then(r => r.json())
      .then(data => {
        const sorted = (data.albums || []).sort((a: any, b: any) => (b.year || 0) - (a.year || 0))
        setAlbums(sorted)
      })
      .finally(() => setLoading(false))
  }, [artistId, refreshKey])

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold text-gray-700">Diskografija</span>
          {albums.length > 0 && (
            <span className="bg-gray-200 text-gray-600 text-xs font-bold px-1.5 py-0.5 rounded-full">{albums.length}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {artistName && (
            <WikipediaImportDiscography
              artistId={parseInt(artistId)}
              artistName={artistName}
              artistWikiTitle={artistName.replace(/ /g, '_')}
              onClose={onImportClose}
              buttonClassName="flex items-center gap-1 px-2 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-xs font-medium transition-colors"
              buttonLabel="📀 Importuoti iš Wiki"
            />
          )}
          <Link href={`/admin/albums/new?artist_id=${artistId}`}
            className="flex items-center gap-1 px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-medium transition-colors">
            + Naujas albumas
          </Link>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : albums.length === 0 ? (
          <div className="py-12 text-center">
            <span className="text-3xl block mb-2">💿</span>
            <p className="text-sm text-gray-400 mb-3">Nėra albumų</p>
            <Link href={`/admin/albums/new?artist_id=${artistId}`}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
              + Sukurti pirmą albumą
            </Link>
          </div>
        ) : (
          // Key includes refreshKey so AlbumCards remount fresh after import
          albums.map((album, i) => <AlbumCard key={`${album.id}-${refreshKey}`} album={album} defaultOpen={i === 0} />)
        )}
      </div>
    </div>
  )
}

// ── DiscographyImportCompact — compact header button for discography import
function DiscographyImportCompact({ artistId, artistName, onClose }: {
  artistId: number; artistName: string; onClose: () => void
}) {
  return (
    <WikipediaImportDiscography
      artistId={artistId}
      artistName={artistName}
      artistWikiTitle={artistName.replace(/ /g, '_')}
      onClose={onClose}
      buttonClassName="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium"
      buttonLabel="📀 Disk."
    />
  )
}

// ── WikipediaImportWithHint — wraps WikipediaImport, pre-fills URL input ────
function WikipediaImportWithHint({ artistName, onImport }: { artistName?: string; onImport: (data: any) => void }) {
  // Inject URL into WikipediaImport input after mount
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!artistName) return
    const input = ref.current?.querySelector('input[type="url"], input[type="text"]') as HTMLInputElement | null
    if (input && !input.value) {
      const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(artistName.replace(/ /g, '_'))}`
      const nativeInput = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
      nativeInput?.set?.call(input, url)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }, [artistName])
  return <div ref={ref}><WikipediaImport onImport={onImport} /></div>
}

// ── WikipediaImportCompact ───────────────────────────────────────────────────
function WikipediaImportCompact({ onImport, artistName }: { onImport: (data: any) => void; artistName?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium"
        title="Atnaujinti atlikėjo informaciją iš Wikipedia">
        📖 Wiki atnaujinti
      </button>
      {open && (
        <div className="fixed inset-0 flex items-start justify-center pt-20 px-4" style={{ zIndex: 9999 }} onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}>
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <span className="text-sm font-bold text-gray-700">📖 Atnaujinti iš Wikipedia</span>
              <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1">✕</button>
            </div>
            <div className="p-4">
              <WikipediaImportWithHint
                artistName={artistName}
                onImport={(data: any) => { onImport(data); setOpen(false) }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function EditArtist() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const [initialData, setInitialData] = useState<ArtistFormData | null>(null)
  const [artistName, setArtistName] = useState('')
  const [albumCount, setAlbumCount] = useState<number | null>(null)
  const [trackCount, setTrackCount] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'form' | 'discography'>('form')
  const [discographyKey, setDiscographyKey] = useState(0) // FIX #4

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'
  const artistId = params.id as string

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/auth/signin'); return }
    if (status === 'authenticated' && !isAdmin) { router.push('/'); return }
    if (status !== 'authenticated') return

    fetch(`/api/artists/${artistId}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { alert('Atlikėjas nerastas!'); router.push('/admin/artists'); return }
        setInitialData(dbToForm(data))
        setArtistName(data.name || '')
      })

    fetch(`/api/albums?artist_id=${artistId}&limit=1`)
      .then(r => r.json()).then(d => setAlbumCount(d.total ?? 0)).catch(() => {})

    fetch(`/api/tracks?artist_id=${artistId}&limit=1`)
      .then(r => r.json()).then(d => setTrackCount(d.total ?? null)).catch(() => {})
  }, [status, isAdmin, artistId, router])

  // Full save (submit button)
  const handleSubmit = useCallback(async (form: ArtistFormData) => {
    setSaving(true); setError('')
    try {
      let avatar = form.avatar
      if (avatar && !avatar.includes('supabase') && avatar.startsWith('http')) {
        avatar = await fetchAndStoreWikiAvatar(avatar)
        form = { ...form, avatar }
      }
      const res = await fetch(`/api/artists/${artistId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formToDb(form)),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSaved(true); setTimeout(() => setSaved(false), 2000)
      setArtistName(form.name)
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }, [artistId])

  // Auto-save for photos/avatar (fire-and-forget, no loading indicator)
  const handleAutoSave = useCallback(async (form: ArtistFormData) => {
    // Safety guard: don't save if form doesn't look loaded (no name = not ready)
    if (!form.name) return
    try {
      let avatar = form.avatar
      if (avatar && !avatar.includes('supabase') && avatar.startsWith('http')) {
        avatar = await fetchAndStoreWikiAvatar(avatar)
        form = { ...form, avatar }
      }
      await fetch(`/api/artists/${artistId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formToDb(form)),
      })
    } catch {}
  }, [artistId])

  if (status === 'loading' || !initialData) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="overflow-hidden flex flex-col bg-[#f8f7f5]" style={{ height: 'calc(100vh - 56px)' }}>

      {/* Sticky header */}
      <div className="shrink-0 bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="flex items-center justify-between gap-2 px-4 py-2">

          {/* Left: breadcrumb + compact tool buttons */}
          <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
            {/* FIX #1: breadcrumb with Albumai + Dainos counts */}
            <nav className="flex items-center gap-1 text-sm min-w-0 shrink overflow-hidden">
              <Link href="/admin" className="text-gray-400 hover:text-gray-700 shrink-0">Admin</Link>
              <span className="text-gray-300 shrink-0">/</span>
              <Link href="/admin/artists" className="text-gray-400 hover:text-gray-700 shrink-0">Atlikėjai</Link>
              <span className="text-gray-300 shrink-0">/</span>
              <span className="text-gray-800 font-semibold truncate">{artistName || '...'}</span>
              {albumCount !== null && (
                <>
                  <span className="text-gray-300 shrink-0">/</span>
                  <Link href={`/admin/albums?artist_id=${artistId}`}
                    className="text-gray-400 hover:text-blue-600 shrink-0 flex items-center gap-1 transition-colors">
                    Albumai
                    <span className="bg-gray-100 text-gray-500 text-xs font-bold px-1 py-0.5 rounded leading-none">{albumCount}</span>
                  </Link>
                </>
              )}
              {trackCount !== null && (
                <>
                  <span className="text-gray-300 shrink-0">/</span>
                  <Link href={`/admin/tracks?artist_id=${artistId}`}
                    className="text-gray-400 hover:text-blue-600 shrink-0 flex items-center gap-1 transition-colors">
                    Dainos
                    <span className="bg-gray-100 text-gray-500 text-xs font-bold px-1 py-0.5 rounded leading-none">{trackCount}</span>
                  </Link>
                </>
              )}
            </nav>

            {/* Wiki update button only in header */}
            <div className="hidden lg:flex items-center gap-1 shrink-0 border-l border-gray-200 pl-2 ml-1">
              <WikipediaImportCompact
                artistName={artistName}
                onImport={(data: Partial<ArtistFormData>) => {
                  setInitialData(prev => prev ? { ...prev, ...data } : prev)
                }}
              />
            </div>
          </div>

          {/* Right: action buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Link href="/admin/artists"
              className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
              Atšaukti
            </Link>
            <button
              onClick={() => document.getElementById('submit-btn')?.click()}
              disabled={saving}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${saved ? 'bg-green-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'} disabled:opacity-50`}>
              {saving
                ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" /> Saugoma...</>
                : saved ? '✓ Išsaugota!' : '✓ Išsaugoti'}
            </button>
          </div>
        </div>

        {/* Mobile tabs */}
        <div className="flex lg:hidden border-t border-gray-100">
          <button onClick={() => setTab('form')}
            className={`flex-1 py-2 text-sm font-semibold transition-colors ${tab === 'form' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-gray-500'}`}>
            ✏️ Redagavimas
          </button>
          <button onClick={() => setTab('discography')}
            className={`flex-1 py-2 text-sm font-semibold transition-colors ${tab === 'discography' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-gray-500'}`}>
            💿 Diskografija
          </button>
        </div>
      </div>

      {error && (
        <div className="shrink-0 px-3 pt-2">
          <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-center gap-2">
            ❌ {error}
            <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">✕</button>
          </div>
        </div>
      )}

      {/* Mobile */}
      <div className="lg:hidden flex-1 overflow-y-auto">
        {tab === 'form' && (
          <ArtistFormCompact initialData={initialData} artistId={artistId} onSubmit={handleSubmit} onAutoSave={handleAutoSave} saving={saving} />
        )}
        {tab === 'discography' && (
          <DiscographyPanel artistId={artistId} artistName={artistName} refreshKey={discographyKey}
            onImportClose={() => {
              setDiscographyKey(k => k + 1)
              fetch(`/api/albums?artist_id=${artistId}&limit=1`).then(r => r.json()).then(d => setAlbumCount(d.total ?? 0)).catch(() => {})
              fetch(`/api/tracks?artist_id=${artistId}&limit=1`).then(r => r.json()).then(d => setTrackCount(d.total ?? null)).catch(() => {})
            }}
          />
        )}
      </div>

      {/* Desktop 60/40 */}
      <div className="hidden lg:flex flex-1 min-h-0">
        <div className="border-r border-gray-200 overflow-y-auto" style={{ width: '60%' }}>
          <ArtistFormCompact initialData={initialData} artistId={artistId} onSubmit={handleSubmit} onAutoSave={handleAutoSave} saving={saving} />
        </div>
        <div className="overflow-hidden flex flex-col" style={{ width: '40%' }}>
          <DiscographyPanel artistId={artistId} artistName={artistName} refreshKey={discographyKey}
            onImportClose={() => {
              setDiscographyKey(k => k + 1)
              fetch(`/api/albums?artist_id=${artistId}&limit=1`).then(r => r.json()).then(d => setAlbumCount(d.total ?? 0)).catch(() => {})
              fetch(`/api/tracks?artist_id=${artistId}&limit=1`).then(r => r.json()).then(d => setTrackCount(d.total ?? null)).catch(() => {})
            }}
          />
        </div>
      </div>
    </div>
  )
}

// ── ArtistFormCompact — hides ArtistForm's own header, footer, wiki, instagram
function ArtistFormCompact({ initialData, artistId, onSubmit, onAutoSave, saving }: {
  initialData: ArtistFormData; artistId: string
  onSubmit: (d: ArtistFormData) => void
  onAutoSave?: (d: ArtistFormData) => void
  saving: boolean
}) {
  return (
    <div className="artist-form-compact">
      <style>{`
        .artist-form-compact .min-h-screen { min-height: unset !important; }
        .artist-form-compact .max-w-7xl { max-width: unset !important; padding: 0 !important; }
        .artist-form-compact > div > div > .flex.items-center.justify-between.mb-6 { display: none !important; }
        .artist-form-compact > div > div > form > .mt-6 { display: none !important; }
        .artist-form-compact > div { background: transparent !important; }
        /* Hide WikipediaImport and InstagramConnect - they appear as .mb-5 direct children of form, before the grid */
        .artist-form-compact form > .mb-5 { display: none !important; }
      `}</style>
      <ArtistForm
        title=""
        submitLabel={saving ? 'Saugoma...' : 'Išsaugoti pakeitimus'}
        backHref="/admin/artists"
        initialData={initialData}
        artistId={artistId}
        onSubmit={onSubmit}
        onChange={onAutoSave}
      />
    </div>
  )
}  onUpdate, onRemove,
  dragHandlers, isDragOver,
}: {
  photo: Photo; index: number; total: number
  onUpdate: (p: Photo) => void
  onRemove: () => void
  dragHandlers: { onDragStart: () => void; onDragEnter: () => void; onDragEnd: () => void }
  isDragOver: boolean
}) {
  const [editingAuthor, setEditingAuthor] = useState(false)

  return (
    <div
      className={`group relative rounded-xl overflow-hidden border-2 transition-all bg-gray-100 cursor-grab active:cursor-grabbing
        ${isDragOver ? 'border-music-blue scale-[1.02] shadow-lg' : 'border-gray-200 hover:border-gray-300'}`}
      style={{ aspectRatio: '3/2' }}
      draggable
      onDragStart={dragHandlers.onDragStart}
      onDragEnter={dragHandlers.onDragEnter}
      onDragEnd={dragHandlers.onDragEnd}
      onDragOver={e => e.preventDefault()}
    >
      {/* Image fills entire card */}
      <img
        src={photo.url}
        alt={photo.caption || ''}
        referrerPolicy="no-referrer"
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Top bar — index + remove (visible on hover) */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-1.5 pt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="bg-black/50 text-white text-xs px-1.5 py-0.5 rounded-md font-mono leading-none">
          {index + 1}/{total}
        </span>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onRemove() }}
          className="w-5 h-5 bg-red-500/80 hover:bg-red-500 text-white rounded-md text-xs leading-none flex items-center justify-center transition-colors"
        >✕</button>
      </div>

      {/* Bottom author bar */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent pt-4 pb-1.5 px-2">
        {editingAuthor ? (
          <div className="space-y-1" onClick={e => e.stopPropagation()}>
            <input
              autoFocus
              type="text"
              value={photo.author || ''}
              onChange={e => onUpdate({ ...photo, author: e.target.value })}
              onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLElement).blur(); if (e.key === 'Escape') setEditingAuthor(false) }}
              placeholder="Autorius / © šaltinis"
              className="w-full text-xs px-1.5 py-0.5 rounded-md focus:outline-none bg-white/90 text-gray-800"
            />
            <input
              type="text"
              value={photo.authorUrl || ''}
              onChange={e => onUpdate({ ...photo, authorUrl: e.target.value })}
              onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') setEditingAuthor(false) }}
              onBlur={() => setEditingAuthor(false)}
              placeholder="URL (autorius / licencija)"
              className="w-full text-xs px-1.5 py-0.5 rounded-md focus:outline-none bg-white/80 text-gray-800"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setEditingAuthor(true) }}
            className="w-full text-left leading-none"
            title="Spustelėkite norėdami nurodyti autorių"
          >
            {photo.author ? (
              <span className="text-xs text-white/80 hover:text-white transition-colors truncate block">
                © {photo.author}{photo.authorUrl ? ' 🔗' : ''}
              </span>
            ) : (
              <span className="text-xs text-white/40 hover:text-white/70 transition-colors italic">© autorius</span>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

// ── PhotoGallery — main export ────────────────────────────────────────────────
export default function PhotoGallery({
  photos,
  onChange,
  onOriginalAdded,
  artistName,
}: {
  photos: Photo[]
  onChange: (photos: Photo[]) => void
  onOriginalAdded?: (url: string) => void
  artistName?: string
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [showWikimedia, setShowWikimedia] = useState(false)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  const { onDragStart, onDragEnter, onDragEnd } = useDragReorder(photos, items => {
    setDragOverIdx(null)
    onChange(items)
  })

  const uploadFile = async (file: File): Promise<string | null> => {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/upload', { method: 'POST', body: fd })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Upload nepavyko')
    return data.url
  }

  const handleFiles = async (files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/'))
    if (!imageFiles.length) return
    setUploading(true); setError('')
    try {
      const urls = await Promise.all(imageFiles.map(uploadFile))
      const newPhotos: Photo[] = urls.filter(Boolean).map(url => ({ url: url! }))
      onChange([...photos, ...newPhotos])
    } catch (e: any) { setError(e.message) }
    finally { setUploading(false) }
  }

  const addUrl = async () => {
    const v = urlInput.trim()
    if (!v) return
    setUploading(true); setError('')
    try {
      // Extract domain for auto-author
      let autoDomain = ''
      try { autoDomain = new URL(v).hostname.replace(/^www\./, '') } catch {}

      const res = await fetch('/api/fetch-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: v }),
      })
      const d = await res.json()
      if (!res.ok || !d.url) throw new Error(d.error || 'Nepavyko')
      onChange([...photos, {
        url: d.url,
        authorUrl: v,                      // original URL as source link
        author: autoDomain || undefined,   // domain as default author
      }])
      setUrlInput('')
      setShowUrlInput(false)
    } catch (e: any) { setError(e.message) }
    finally { setUploading(false) }
  }

  const update = (i: number, p: Photo) => {
    const next = [...photos]; next[i] = p; onChange(next)
  }
  const remove = (i: number) => onChange(photos.filter((_, idx) => idx !== i))

  return (
    <div className="space-y-3">
      {showWikimedia && (
        <WikimediaSearch
          artistName={artistName || ''}
          onAddMultiple={newPhotos => onChange([...photos, ...newPhotos])}
          onClose={() => setShowWikimedia(false)}
        />
      )}

      {/* Grid */}
      {photos.length > 0 && (
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
          {photos.map((photo, i) => (
            <PhotoCard
              key={`${photo.url}-${i}`}
              photo={photo}
              index={i}
              total={photos.length}
              onUpdate={p => update(i, p)}
              onRemove={() => remove(i)}
              isDragOver={dragOverIdx === i}
              dragHandlers={{
                onDragStart: () => { onDragStart(i) },
                onDragEnter: () => { onDragEnter(i); setDragOverIdx(i) },
                onDragEnd:   () => { onDragEnd(); setDragOverIdx(null) },
              }}
            />
          ))}

          {/* Add more — same 3:2 ratio as photos */}
          <div
            className="rounded-xl border-2 border-dashed border-gray-200 hover:border-music-blue transition-colors cursor-pointer flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-music-blue"
            style={{ aspectRatio: '3/2' }}
            onClick={() => fileRef.current?.click()}
            onDrop={e => { e.preventDefault(); handleFiles(Array.from(e.dataTransfer.files)) }}
            onDragOver={e => e.preventDefault()}
          >
            {uploading
              ? <div className="w-5 h-5 border-2 border-music-blue border-t-transparent rounded-full animate-spin" />
              : <><span className="text-lg">+</span><span className="text-xs">Pridėti</span></>
            }
          </div>
        </div>
      )}

      {/* Empty state */}
      {photos.length === 0 && (
        <div
          className="rounded-xl border-2 border-dashed border-gray-200 hover:border-music-blue transition-colors cursor-pointer py-6 flex flex-col items-center gap-1.5 text-gray-400 hover:text-music-blue"
          onClick={() => fileRef.current?.click()}
          onDrop={e => { e.preventDefault(); handleFiles(Array.from(e.dataTransfer.files)) }}
          onDragOver={e => e.preventDefault()}
        >
          {uploading
            ? <div className="w-6 h-6 border-2 border-music-blue border-t-transparent rounded-full animate-spin" />
            : (
              <>
                <span className="text-2xl">🖼️</span>
                <span className="text-xs font-medium">Įkelti nuotraukas</span>
                <span className="text-xs opacity-70">JPG, PNG · vilkite arba spustelėkite</span>
              </>
            )
          }
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
        >
          📁 Įkelti failus
        </button>
        {artistName && (
          <button
            type="button"
            onClick={() => setShowWikimedia(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-medium transition-colors"
          >
            🔍 Wikimedia
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowUrlInput(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition-colors"
        >
          🔗 Pridėti URL
        </button>
      </div>

      {/* URL input */}
      {showUrlInput && (
        <div className="flex gap-1.5">
          <input
            type="text"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addUrl() } if (e.key === 'Escape') setShowUrlInput(false) }}
            placeholder="https://..."
            autoFocus
            className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:border-music-blue bg-white"
          />
          <button type="button" onClick={addUrl}
            className="px-3 py-1.5 bg-music-blue text-white rounded-lg text-xs font-medium hover:opacity-90 transition-opacity">
            Pridėti
          </button>
          <button type="button" onClick={() => setShowUrlInput(false)}
            className="px-2 py-1.5 bg-gray-100 text-gray-500 rounded-lg text-xs hover:bg-gray-200 transition-colors">
            ✕
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => { if (e.target.files) handleFiles(Array.from(e.target.files)) }}
      />
    </div>
  )
}    website:     data.website || '',
    subdomain:   data.subdomain || '',
    gender:      data.gender || '',
    birthYear:   data.birth_date ? data.birth_date.split('-')[0] : '',
    birthMonth:  data.birth_date ? data.birth_date.split('-')[1] : '',
    birthDay:    data.birth_date ? data.birth_date.split('-')[2] : '',
    deathYear:   data.death_date ? data.death_date.split('-')[0] : '',
    deathMonth:  data.death_date ? data.death_date.split('-')[1] : '',
    deathDay:    data.death_date ? data.death_date.split('-')[2] : '',
    facebook:    data.links?.facebook || '',
    instagram:   data.links?.instagram || '',
    youtube:     data.links?.youtube || '',
    tiktok:      data.links?.tiktok || '',
    spotify:     data.links?.spotify || '',
    soundcloud:  data.links?.soundcloud || '',
    bandcamp:    data.links?.bandcamp || '',
    twitter:     data.links?.twitter || '',
    members:     data.related?.filter((r: any) => r.type === 'solo') || [],
    groups:      data.related?.filter((r: any) => r.type === 'group') || [],
  }
}

const GENRE_IDS: Record<string, number> = {
  'Alternatyvioji muzika': 1000001,
  'Elektroninė, šokių muzika': 1000002,
  "Hip-hop'o muzika": 1000003,
  'Kitų stilių muzika': 1000004,
  'Pop, R&B muzika': 1000005,
  'Rimtoji muzika': 1000006,
  'Roko muzika': 1000007,
  'Sunkioji muzika': 1000008,
}

function formToDb(form: ArtistFormData) {
  const genreIds: number[] = []
  if (form.genre && GENRE_IDS[form.genre]) genreIds.push(GENRE_IDS[form.genre])
  const birthDate = form.birthYear
    ? `${form.birthYear}-${String(form.birthMonth||1).padStart(2,'0')}-${String(form.birthDay||1).padStart(2,'0')}`
    : null
  const deathDate = form.deathYear
    ? `${form.deathYear}-${String(form.deathMonth||1).padStart(2,'0')}-${String(form.deathDay||1).padStart(2,'0')}`
    : null
  return {
    name: form.name, type: form.type, country: form.country,
    type_music: true, type_film: false, type_dance: false, type_books: false,
    active_from: form.yearStart ? parseInt(form.yearStart) : null,
    active_until: form.yearEnd ? parseInt(form.yearEnd) : null,
    description: form.description, cover_image_url: form.avatar, cover_image_wide_url: form.avatarWide || null,
    website: form.website, subdomain: form.subdomain, gender: form.gender,
    birth_date: birthDate, death_date: deathDate,
    genres: genreIds, substyleNames: form.substyles || [],
    breaks: form.breaks, photos: form.photos,
    links: {
      facebook: form.facebook, instagram: form.instagram, youtube: form.youtube,
      tiktok: form.tiktok, spotify: form.spotify, soundcloud: form.soundcloud,
      bandcamp: form.bandcamp, twitter: form.twitter,
    },
    related: [
      ...(form.members||[]).map(m=>({ id: typeof m.id==='string' ? parseInt(m.id) : Number(m.id), yearFrom: m.yearFrom, yearTo: m.yearTo })),
      ...(form.groups||[]).map(g=>({ id: typeof g.id==='string' ? parseInt(g.id) : Number(g.id), yearFrom: g.yearFrom, yearTo: g.yearTo })),
    ],
  }
}

// FIX #5: upload external/Wikipedia image to Supabase on save
async function fetchAndStoreWikiAvatar(rawUrl: string): Promise<string> {
  try {
    const res = await fetch('/api/fetch-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: rawUrl }),
    })
    if (res.ok) {
      const d = await res.json()
      if (d.url && !d.url.startsWith('data:')) return d.url
    }
  } catch {}
  return rawUrl
}

// ── Track row ────────────────────────────────────────────────────────────────
function TrackRow({ track }: { track: any }) {
  const trackId = track.track_id || track.id
  const hasVideo = !!track.video_url
  const hasLyrics = typeof track.lyrics === 'string' && track.lyrics.trim().length > 0
  const featuring: string[] = (track.featuring || []).map((f: any) => typeof f === 'string' ? f : f.name || '')
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 border-b border-gray-50 last:border-0 hover:bg-gray-50/80 group transition-colors">
      <span className="text-gray-300 text-xs w-5 text-right shrink-0 tabular-nums">{track.sort_order || track.position}.</span>
      <div className="flex-1 min-w-0 flex items-baseline gap-1 flex-wrap">
        <span className="text-sm text-gray-800 truncate">{track.title}</span>
        {featuring.length > 0 && <span className="text-xs text-gray-400 whitespace-nowrap">su {featuring.join(', ')}</span>}
      </div>
      {hasVideo && <span className="text-blue-400 text-xs shrink-0">▶</span>}
      {hasLyrics && <span className="text-green-500 text-xs font-bold shrink-0">T</span>}
      {trackId && (
        <a href={`/admin/tracks/${trackId}`} target="_blank" rel="noopener noreferrer"
          className="opacity-0 group-hover:opacity-100 shrink-0 px-1.5 py-0.5 text-xs text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded transition-all font-medium">
          Redaguoti ↗
        </a>
      )}
    </div>
  )
}

// ── Album accordion ──────────────────────────────────────────────────────────
function AlbumCard({ album, defaultOpen }: { album: any; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const [tracks, setTracks] = useState<any[]>([])
  const [loadingTracks, setLoadingTracks] = useState(false)
  const [tracksLoaded, setTracksLoaded] = useState(false)

  // FIX #3: fetch tracks immediately if this is default-open
  useEffect(() => {
    if (defaultOpen) loadTracks()
  }, []) // eslint-disable-line

  const loadTracks = async () => {
    if (tracksLoaded) return
    setLoadingTracks(true)
    try {
      const res = await fetch(`/api/albums/${album.id}`)
      const data = await res.json()
      setTracks(data.tracks || [])
      setTracksLoaded(true)
    } catch {}
    finally { setLoadingTracks(false) }
  }

  const toggleOpen = async () => {
    if (!open && !tracksLoaded) await loadTracks()
    setOpen(p => !p)
  }

  const typeLabel = album.type_studio ? 'Studijinis'
    : album.type_ep ? 'EP'
    : album.type_compilation ? 'Kompiliacija'
    : album.type_live ? 'Gyvas'
    : album.type_single ? 'Singlas'
    : 'Albumas'

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors select-none" onClick={toggleOpen}>
        {album.cover_image_url
          ? <img src={album.cover_image_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" referrerPolicy="no-referrer" />
          : <div className="w-10 h-10 rounded-lg bg-gray-100 shrink-0 flex items-center justify-center text-gray-300 text-lg">💿</div>
        }
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-gray-900 truncate">{album.title}</span>
            <span className="text-xs text-gray-400 shrink-0">{album.year}</span>
            <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">{typeLabel}</span>
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {tracksLoaded ? `${tracks.length} dainų` : album.track_count ? `${album.track_count} dainų` : ''}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <a href={`/admin/albums/${album.id}`} onClick={e => e.stopPropagation()}
            className="px-2 py-1 text-xs text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors font-medium">
            Redaguoti ↗
          </a>
          <span className={`text-gray-400 text-xs transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>▼</span>
        </div>
      </div>
      {open && (
        <div className="border-t border-gray-100">
          {loadingTracks ? (
            <div className="py-4 flex justify-center">
              <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : tracks.length > 0 ? (
            <>
              {tracks.map((t: any, i: number) => <TrackRow key={t.track_id || t.id || i} track={t} />)}
              <div className="px-3 py-1.5 border-t border-gray-50">
                <a href={`/admin/albums/${album.id}`} className="text-xs text-gray-400 hover:text-blue-500 transition-colors">
                  + Pridėti / redaguoti dainas
                </a>
              </div>
            </>
          ) : (
            <div className="py-4 text-center">
              <p className="text-xs text-gray-400">Nėra dainų</p>
              <a href={`/admin/albums/${album.id}`} className="text-xs text-blue-500 hover:underline mt-1 block">+ Pridėti dainas</a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Discography panel ────────────────────────────────────────────────────────
function DiscographyPanel({ artistId, artistName, refreshKey, onImportClose }: {
  artistId: string; artistName: string; refreshKey: number; onImportClose: () => void
}) {
  const [albums, setAlbums] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/albums?artist_id=${artistId}&limit=100`)
      .then(r => r.json())
      .then(data => {
        const sorted = (data.albums || []).sort((a: any, b: any) => (b.year || 0) - (a.year || 0))
        setAlbums(sorted)
      })
      .finally(() => setLoading(false))
  }, [artistId, refreshKey])

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold text-gray-700">Diskografija</span>
          {albums.length > 0 && (
            <span className="bg-gray-200 text-gray-600 text-xs font-bold px-1.5 py-0.5 rounded-full">{albums.length}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {artistName && (
            <WikipediaImportDiscography
              artistId={parseInt(artistId)}
              artistName={artistName}
              artistWikiTitle={artistName.replace(/ /g, '_')}
              onClose={onImportClose}
              buttonClassName="flex items-center gap-1 px-2 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-xs font-medium transition-colors"
              buttonLabel="📀 Importuoti iš Wiki"
            />
          )}
          <Link href={`/admin/albums/new?artist_id=${artistId}`}
            className="flex items-center gap-1 px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-medium transition-colors">
            + Naujas albumas
          </Link>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : albums.length === 0 ? (
          <div className="py-12 text-center">
            <span className="text-3xl block mb-2">💿</span>
            <p className="text-sm text-gray-400 mb-3">Nėra albumų</p>
            <Link href={`/admin/albums/new?artist_id=${artistId}`}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
              + Sukurti pirmą albumą
            </Link>
          </div>
        ) : (
          // Key includes refreshKey so AlbumCards remount fresh after import
          albums.map((album, i) => <AlbumCard key={`${album.id}-${refreshKey}`} album={album} defaultOpen={i === 0} />)
        )}
      </div>
    </div>
  )
}

// ── DiscographyImportCompact — compact header button for discography import
function DiscographyImportCompact({ artistId, artistName, onClose }: {
  artistId: number; artistName: string; onClose: () => void
}) {
  return (
    <WikipediaImportDiscography
      artistId={artistId}
      artistName={artistName}
      artistWikiTitle={artistName.replace(/ /g, '_')}
      onClose={onClose}
      buttonClassName="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium"
      buttonLabel="📀 Disk."
    />
  )
}

// ── WikipediaImportWithHint — wraps WikipediaImport, pre-fills URL input ────
function WikipediaImportWithHint({ artistName, onImport }: { artistName?: string; onImport: (data: any) => void }) {
  // Inject URL into WikipediaImport input after mount
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!artistName) return
    const input = ref.current?.querySelector('input[type="url"], input[type="text"]') as HTMLInputElement | null
    if (input && !input.value) {
      const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(artistName.replace(/ /g, '_'))}`
      const nativeInput = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
      nativeInput?.set?.call(input, url)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }, [artistName])
  return <div ref={ref}><WikipediaImport onImport={onImport} /></div>
}

// ── WikipediaImportCompact ───────────────────────────────────────────────────
function WikipediaImportCompact({ onImport, artistName }: { onImport: (data: any) => void; artistName?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium"
        title="Atnaujinti atlikėjo informaciją iš Wikipedia">
        📖 Wiki atnaujinti
      </button>
      {open && (
        <div className="fixed inset-0 flex items-start justify-center pt-20 px-4" style={{ zIndex: 9999 }} onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}>
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <span className="text-sm font-bold text-gray-700">📖 Atnaujinti iš Wikipedia</span>
              <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1">✕</button>
            </div>
            <div className="p-4">
              <WikipediaImportWithHint
                artistName={artistName}
                onImport={(data: any) => { onImport(data); setOpen(false) }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function EditArtist() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const [initialData, setInitialData] = useState<ArtistFormData | null>(null)
  const [artistName, setArtistName] = useState('')
  const [albumCount, setAlbumCount] = useState<number | null>(null)
  const [trackCount, setTrackCount] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'form' | 'discography'>('form')
  const [discographyKey, setDiscographyKey] = useState(0) // FIX #4

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'
  const artistId = params.id as string

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/auth/signin'); return }
    if (status === 'authenticated' && !isAdmin) { router.push('/'); return }
    if (status !== 'authenticated') return

    fetch(`/api/artists/${artistId}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { alert('Atlikėjas nerastas!'); router.push('/admin/artists'); return }
        setInitialData(dbToForm(data))
        setArtistName(data.name || '')
      })

    fetch(`/api/albums?artist_id=${artistId}&limit=1`)
      .then(r => r.json()).then(d => setAlbumCount(d.total ?? 0)).catch(() => {})

    fetch(`/api/tracks?artist_id=${artistId}&limit=1`)
      .then(r => r.json()).then(d => setTrackCount(d.total ?? null)).catch(() => {})
  }, [status, isAdmin, artistId, router])

  // Full save (submit button)
  const handleSubmit = useCallback(async (form: ArtistFormData) => {
    setSaving(true); setError('')
    try {
      let avatar = form.avatar
      if (avatar && !avatar.includes('supabase') && avatar.startsWith('http')) {
        avatar = await fetchAndStoreWikiAvatar(avatar)
        form = { ...form, avatar }
      }
      const res = await fetch(`/api/artists/${artistId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formToDb(form)),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSaved(true); setTimeout(() => setSaved(false), 2000)
      setArtistName(form.name)
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }, [artistId])

  // Auto-save for photos/avatar (fire-and-forget, no loading indicator)
  const handleAutoSave = useCallback(async (form: ArtistFormData) => {
    try {
      let avatar = form.avatar
      if (avatar && !avatar.includes('supabase') && avatar.startsWith('http')) {
        avatar = await fetchAndStoreWikiAvatar(avatar)
        form = { ...form, avatar }
      }
      await fetch(`/api/artists/${artistId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formToDb(form)),
      })
    } catch {}
  }, [artistId])

  if (status === 'loading' || !initialData) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="overflow-hidden flex flex-col bg-[#f8f7f5]" style={{ height: 'calc(100vh - 56px)' }}>

      {/* Sticky header */}
      <div className="shrink-0 bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="flex items-center justify-between gap-2 px-4 py-2">

          {/* Left: breadcrumb + compact tool buttons */}
          <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
            {/* FIX #1: breadcrumb with Albumai + Dainos counts */}
            <nav className="flex items-center gap-1 text-sm min-w-0 shrink overflow-hidden">
              <Link href="/admin" className="text-gray-400 hover:text-gray-700 shrink-0">Admin</Link>
              <span className="text-gray-300 shrink-0">/</span>
              <Link href="/admin/artists" className="text-gray-400 hover:text-gray-700 shrink-0">Atlikėjai</Link>
              <span className="text-gray-300 shrink-0">/</span>
              <span className="text-gray-800 font-semibold truncate">{artistName || '...'}</span>
              {albumCount !== null && (
                <>
                  <span className="text-gray-300 shrink-0">/</span>
                  <Link href={`/admin/albums?artist_id=${artistId}`}
                    className="text-gray-400 hover:text-blue-600 shrink-0 flex items-center gap-1 transition-colors">
                    Albumai
                    <span className="bg-gray-100 text-gray-500 text-xs font-bold px-1 py-0.5 rounded leading-none">{albumCount}</span>
                  </Link>
                </>
              )}
              {trackCount !== null && (
                <>
                  <span className="text-gray-300 shrink-0">/</span>
                  <Link href={`/admin/tracks?artist_id=${artistId}`}
                    className="text-gray-400 hover:text-blue-600 shrink-0 flex items-center gap-1 transition-colors">
                    Dainos
                    <span className="bg-gray-100 text-gray-500 text-xs font-bold px-1 py-0.5 rounded leading-none">{trackCount}</span>
                  </Link>
                </>
              )}
            </nav>

            {/* Wiki update button only in header */}
            <div className="hidden lg:flex items-center gap-1 shrink-0 border-l border-gray-200 pl-2 ml-1">
              <WikipediaImportCompact
                artistName={artistName}
                onImport={(data: Partial<ArtistFormData>) => {
                  setInitialData(prev => prev ? { ...prev, ...data } : prev)
                }}
              />
            </div>
          </div>

          {/* Right: action buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Link href="/admin/artists"
              className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
              Atšaukti
            </Link>
            <button
              onClick={() => document.getElementById('submit-btn')?.click()}
              disabled={saving}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${saved ? 'bg-green-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'} disabled:opacity-50`}>
              {saving
                ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" /> Saugoma...</>
                : saved ? '✓ Išsaugota!' : '✓ Išsaugoti'}
            </button>
          </div>
        </div>

        {/* Mobile tabs */}
        <div className="flex lg:hidden border-t border-gray-100">
          <button onClick={() => setTab('form')}
            className={`flex-1 py-2 text-sm font-semibold transition-colors ${tab === 'form' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-gray-500'}`}>
            ✏️ Redagavimas
          </button>
          <button onClick={() => setTab('discography')}
            className={`flex-1 py-2 text-sm font-semibold transition-colors ${tab === 'discography' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-gray-500'}`}>
            💿 Diskografija
          </button>
        </div>
      </div>

      {error && (
        <div className="shrink-0 px-3 pt-2">
          <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-center gap-2">
            ❌ {error}
            <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">✕</button>
          </div>
        </div>
      )}

      {/* Mobile */}
      <div className="lg:hidden flex-1 overflow-y-auto">
        {tab === 'form' && (
          <ArtistFormCompact initialData={initialData} artistId={artistId} onSubmit={handleSubmit} onAutoSave={handleAutoSave} saving={saving} />
        )}
        {tab === 'discography' && (
          <DiscographyPanel artistId={artistId} artistName={artistName} refreshKey={discographyKey}
            onImportClose={() => {
              setDiscographyKey(k => k + 1)
              fetch(`/api/albums?artist_id=${artistId}&limit=1`).then(r => r.json()).then(d => setAlbumCount(d.total ?? 0)).catch(() => {})
              fetch(`/api/tracks?artist_id=${artistId}&limit=1`).then(r => r.json()).then(d => setTrackCount(d.total ?? null)).catch(() => {})
            }}
          />
        )}
      </div>

      {/* Desktop 60/40 */}
      <div className="hidden lg:flex flex-1 min-h-0">
        <div className="border-r border-gray-200 overflow-y-auto" style={{ width: '60%' }}>
          <ArtistFormCompact initialData={initialData} artistId={artistId} onSubmit={handleSubmit} onAutoSave={handleAutoSave} saving={saving} />
        </div>
        <div className="overflow-hidden flex flex-col" style={{ width: '40%' }}>
          <DiscographyPanel artistId={artistId} artistName={artistName} refreshKey={discographyKey}
            onImportClose={() => {
              setDiscographyKey(k => k + 1)
              fetch(`/api/albums?artist_id=${artistId}&limit=1`).then(r => r.json()).then(d => setAlbumCount(d.total ?? 0)).catch(() => {})
              fetch(`/api/tracks?artist_id=${artistId}&limit=1`).then(r => r.json()).then(d => setTrackCount(d.total ?? null)).catch(() => {})
            }}
          />
        </div>
      </div>
    </div>
  )
}

// ── ArtistFormCompact — hides ArtistForm's own header, footer, wiki, instagram
function ArtistFormCompact({ initialData, artistId, onSubmit, onAutoSave, saving }: {
  initialData: ArtistFormData; artistId: string
  onSubmit: (d: ArtistFormData) => void
  onAutoSave?: (d: ArtistFormData) => void
  saving: boolean
}) {
  return (
    <div className="artist-form-compact">
      <style>{`
        .artist-form-compact .min-h-screen { min-height: unset !important; }
        .artist-form-compact .max-w-7xl { max-width: unset !important; padding: 0 !important; }
        .artist-form-compact > div > div > .flex.items-center.justify-between.mb-6 { display: none !important; }
        .artist-form-compact > div > div > form > .mt-6 { display: none !important; }
        .artist-form-compact > div { background: transparent !important; }
        /* Hide WikipediaImport and InstagramConnect - they appear as .mb-5 direct children of form, before the grid */
        .artist-form-compact form > .mb-5 { display: none !important; }
      `}</style>
      <ArtistForm
        title=""
        submitLabel={saving ? 'Saugoma...' : 'Išsaugoti pakeitimus'}
        backHref="/admin/artists"
        initialData={initialData}
        artistId={artistId}
        onSubmit={onSubmit}
        onChange={onAutoSave}
      />
    </div>
  )
}
