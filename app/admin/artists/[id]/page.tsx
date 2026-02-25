'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import WikipediaImportDiscography from '@/components/WikipediaImportDiscography'
import WikipediaImport from '@/components/WikipediaImport'
import InstagramConnect from '@/components/InstagramConnect'
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
    photos:      data.photos || [],
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
    description: form.description, cover_image_url: form.avatar,
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
function DiscographyPanel({ artistId, artistName, refreshKey }: {
  artistId: string; artistName: string; refreshKey: number
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
  }, [artistId, refreshKey]) // FIX #4: re-fetch on refreshKey change

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

// ── WikipediaImportCompact ───────────────────────────────────────────────────
function WikipediaImportCompact({ onImport }: { onImport: (data: any) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(p => !p)}
        className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        title="Importuoti atlikėjo info iš Wikipedia">
        📖 Wiki
      </button>
      {open && (
        <div className="absolute top-8 left-0 z-50 w-[420px] bg-white rounded-xl shadow-2xl border border-gray-200 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-600">Importuoti iš Wikipedia</span>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
          </div>
          <WikipediaImport onImport={(data: any) => { onImport(data); setOpen(false) }} />
        </div>
      )}
    </div>
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

  const handleSubmit = useCallback(async (form: ArtistFormData) => {
    setSaving(true); setError('')
    try {
      // FIX #5: store external avatar URL in Supabase before saving
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

            {/* FIX #2: compact tool buttons inline */}
            <div className="hidden lg:flex items-center gap-1 shrink-0">
              <WikipediaImportCompact onImport={(data: Partial<ArtistFormData>) => {
                setInitialData(prev => prev ? { ...prev, ...data } : prev)
              }} />
              {/* FIX #4: discography import — polling for refresh after modal closes */}
              <DiscographyImportWrapper
                artistId={artistId}
                artistName={artistName}
                onImported={() => {
                  setDiscographyKey(k => k + 1)
                  fetch(`/api/albums?artist_id=${artistId}&limit=1`)
                    .then(r => r.json()).then(d => setAlbumCount(d.total ?? 0)).catch(() => {})
                  fetch(`/api/tracks?artist_id=${artistId}&limit=1`)
                    .then(r => r.json()).then(d => setTrackCount(d.total ?? null)).catch(() => {})
                }}
              />
              <InstagramConnect artistId={artistId} artistName={artistName} />
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
          <ArtistFormCompact initialData={initialData} artistId={artistId} onSubmit={handleSubmit} saving={saving} />
        )}
        {tab === 'discography' && (
          <DiscographyPanel artistId={artistId} artistName={artistName} refreshKey={discographyKey} />
        )}
      </div>

      {/* Desktop 60/40 */}
      <div className="hidden lg:flex flex-1 min-h-0">
        <div className="border-r border-gray-200 overflow-y-auto" style={{ width: '60%' }}>
          <ArtistFormCompact initialData={initialData} artistId={artistId} onSubmit={handleSubmit} saving={saving} />
        </div>
        <div className="overflow-hidden flex flex-col" style={{ width: '40%' }}>
          <DiscographyPanel artistId={artistId} artistName={artistName} refreshKey={discographyKey} />
        </div>
      </div>
    </div>
  )
}

// ── ArtistFormCompact — hides ArtistForm's own header, footer, wiki, instagram
function ArtistFormCompact({ initialData, artistId, onSubmit, saving }: {
  initialData: ArtistFormData; artistId: string
  onSubmit: (d: ArtistFormData) => void; saving: boolean
}) {
  return (
    <div className="artist-form-compact">
      <style>{`
        .artist-form-compact .min-h-screen { min-height: unset !important; }
        .artist-form-compact .max-w-7xl { max-width: unset !important; padding: 0 !important; }
        .artist-form-compact > div > div > .flex.items-center.justify-between.mb-6 { display: none !important; }
        .artist-form-compact > div > div > form > .mt-6 { display: none !important; }
        .artist-form-compact > div { background: transparent !important; }
      `}</style>
      <ArtistForm
        title=""
        submitLabel={saving ? 'Saugoma...' : 'Išsaugoti pakeitimus'}
        backHref="/admin/artists"
        initialData={initialData}
        artistId={artistId}
        onSubmit={onSubmit}
      />
    </div>
  )
}

// ── DiscographyImportWrapper — shows the import button and polls for new albums
// after user clicks it (every 4s for 30s), without needing onClose prop
function DiscographyImportWrapper({ artistId, artistName, onImported }: {
  artistId: string; artistName: string; onImported: () => void
}) {
  const [polling, setPolling] = useState(false)
  const [baseCount, setBaseCount] = useState<number | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const attemptsRef = useRef(0)

  const startPolling = useCallback((knownCount: number) => {
    if (polling) return
    setPolling(true)
    attemptsRef.current = 0
    intervalRef.current = setInterval(async () => {
      attemptsRef.current++
      try {
        const res = await fetch(`/api/albums?artist_id=${artistId}&limit=1`)
        const d = await res.json()
        const newCount = d.total ?? 0
        if (newCount !== knownCount) {
          clearInterval(intervalRef.current!)
          setPolling(false)
          onImported()
          return
        }
      } catch {}
      if (attemptsRef.current >= 8) { // stop after ~32s
        clearInterval(intervalRef.current!)
        setPolling(false)
      }
    }, 4000)
  }, [artistId, polling, onImported])

  // Get current album count when wrapper mounts
  useEffect(() => {
    fetch(`/api/albums?artist_id=${artistId}&limit=1`)
      .then(r => r.json()).then(d => setBaseCount(d.total ?? 0)).catch(() => {})
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [artistId])

  return (
    <div onClick={() => {
      // When user clicks anything inside (the import button), start polling
      if (baseCount !== null && !polling) startPolling(baseCount)
    }}>
      {polling && <span className="text-xs text-blue-500 animate-pulse mr-1">⟳</span>}
      <WikipediaImportDiscography
        artistId={parseInt(artistId)}
        artistName={artistName}
        artistWikiTitle={artistName.replace(/ /g, '_')}
      />
    </div>
  )
}
