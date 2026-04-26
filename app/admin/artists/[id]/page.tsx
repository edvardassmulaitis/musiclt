'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import WikipediaImportDiscography from '@/components/WikipediaImportDiscography'
import WikipediaImport from '@/components/WikipediaImport'
import WikipediaImportAwards from '@/components/WikipediaImportAwards'
import ArtistForm, { ArtistFormData, emptyArtistForm } from '@/components/ArtistForm'
import { extractYouTubeId } from '@/components/ui/helpers'
import { ScoreBadge } from '@/components/ScoreModal'
import FullscreenModal from '@/components/ui/FullscreenModal'

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
    avatarPosition: data.cover_image_position || 'center 20%',
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
    youtube:     data.links?.youtube || '',
    tiktok:      data.links?.tiktok || '',
    spotify:     data.links?.spotify || '',
    soundcloud:  data.links?.soundcloud || '',
    bandcamp:    data.links?.bandcamp || '',
    twitter:     data.links?.twitter || '',
    members:     data.related?.filter((r: any) => r.type === 'solo').map((r: any) => ({ ...r, avatar: r.cover_image_url || null })) || [],
    groups:      data.related?.filter((r: any) => r.type === 'group').map((r: any) => ({ ...r, avatar: r.cover_image_url || null })) || [],
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
    description: form.description, cover_image_url: form.avatar, cover_image_wide_url: form.avatarWide || null, cover_image_position: form.avatarPosition || 'center 20%',
    website: form.website, subdomain: form.subdomain, gender: form.gender,
    birth_date: birthDate, death_date: deathDate,
    genres: genreIds, substyleNames: form.substyles || [],
    breaks: form.breaks, photos: form.photos,
    facebook: form.facebook || null,
    youtube: form.youtube || null, tiktok: form.tiktok || null,
    spotify: form.spotify || null, soundcloud: form.soundcloud || null,
    bandcamp: form.bandcamp || null, twitter: form.twitter || null,
    related: (() => {
      console.log('[formToDb] members raw:', JSON.stringify(form.members?.map(m => ({ id: m.id, name: m.name }))))
      return (form.members||[]).map(m=>({ id: typeof m.id==='string' ? parseInt(m.id) : Number(m.id), name: m.name, avatar: m.avatar||'', yearFrom: m.yearFrom, yearTo: m.yearTo }))
    })(),
    groups: (form.groups||[]).map(g=>({ id: g.id ? (typeof g.id==='string' ? parseInt(g.id) : Number(g.id)) : null, name: g.name, yearFrom: g.yearFrom, yearTo: g.yearTo })),
  }
}

function TrackRow({ track, onDelete }: { track: any; onDelete?: () => void }) {
  const trackId = track.track_id || track.id
  const hasVideo = !!track.video_url
  const hasLyrics = typeof track.lyrics === 'string' && track.lyrics.trim().length > 0
  const featuring: string[] = (track.featuring || []).map((f: any) => typeof f === 'string' ? f : f.name || '')
  const [confirmDel, setConfirmDel] = useState(false)
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 border-b border-[var(--bg-elevated)] last:border-0 hover:bg-[var(--bg-hover)]/80 group transition-colors">
      <div className="flex items-center justify-end gap-0.5 w-5 shrink-0">
        {track.is_single && <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" title="Singlas" />}
        <span className="text-[var(--text-faint)] text-xs tabular-nums">{track.sort_order || track.position}.</span>
      </div>
      <div className="flex-1 min-w-0 flex items-baseline gap-1 flex-wrap">
        {trackId ? (
          <a href={`/admin/tracks/${trackId}`} target="_blank" rel="noopener noreferrer"
            className="text-sm text-[var(--text-primary)] hover:text-blue-600 truncate transition-colors">{track.title}</a>
        ) : (
          <span className="text-sm text-[var(--text-primary)] truncate">{track.title}</span>
        )}
        {featuring.length > 0 && <span className="text-xs text-[var(--text-muted)] whitespace-nowrap">su {featuring.join(', ')}</span>}
      </div>
      {hasVideo && <span className="text-blue-400 text-xs shrink-0">▶</span>}
      {hasLyrics && <span className="text-green-500 text-xs font-bold shrink-0">T</span>}
      {onDelete && trackId && (
        confirmDel ? (
          <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
            <button onClick={() => { onDelete(); setConfirmDel(false) }} className="px-1.5 py-0.5 text-[10px] bg-red-500 text-white rounded hover:bg-red-600">Taip</button>
            <button onClick={() => setConfirmDel(false)} className="px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)]">Ne</button>
          </div>
        ) : (
          <button onClick={e => { e.stopPropagation(); setConfirmDel(true) }}
            className="opacity-0 group-hover:opacity-100 shrink-0 p-0.5 text-[var(--text-faint)] hover:text-red-400 transition-all"
            title="Ištrinti">
            <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9h8l1-9"/></svg>
          </button>
        )
      )}
    </div>
  )
}

function AlbumCard({ album, defaultOpen, onDeleted }: { album: any; defaultOpen: boolean; onDeleted?: () => void }) {
  const [open, setOpen] = useState(defaultOpen)
  const [tracks, setTracks] = useState<any[]>([])
  const [loadingTracks, setLoadingTracks] = useState(false)
  const [tracksLoaded, setTracksLoaded] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  const handleDelete = async () => {
    try {
      await fetch(`/api/albums/${album.id}?deleteTracks=true`, { method: 'DELETE' })
      onDeleted?.()
    } catch {}
  }

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
    : album.type_remix ? 'Remix'
    : album.type_covers ? 'Coveriai'
    : album.type_holiday ? 'Šventinis'
    : album.type_soundtrack ? 'Soundtrack'
    : album.type_demo ? 'Demo'
    : 'Studijinis'

  return (
    <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] shadow-sm overflow-hidden group">
      <div className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors select-none" onClick={toggleOpen}>
        {album.cover_image_url
          ? <img src={album.cover_image_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" referrerPolicy="no-referrer" />
          : <div className="w-10 h-10 rounded-lg bg-[var(--bg-elevated)] shrink-0 flex items-center justify-center text-[var(--text-faint)]">
            <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor"><circle cx="12" cy="12" r="10" opacity=".4"/><circle cx="12" cy="12" r="6" opacity=".6"/><circle cx="12" cy="12" r="2.5" opacity=".9"/><circle cx="12" cy="12" r="1" fill="white"/></svg>
          </div>
        }
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <Link href={`/admin/albums/${album.id}`}
              onClick={e => e.stopPropagation()}
              className="text-sm font-semibold text-[var(--text-primary)] hover:text-blue-600 truncate transition-colors">{album.title}</Link>
            <span className="text-xs text-[var(--text-muted)] shrink-0">{album.year}</span>
            <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-elevated)] px-1.5 py-0.5 rounded shrink-0">{typeLabel}</span>
          </div>
          <div className="text-xs text-[var(--text-muted)] mt-0.5">
            {tracksLoaded ? `${tracks.length} dainų` : album.track_count ? `${album.track_count} dainų` : ''}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {!confirmDel ? (
            <button type="button" onClick={e => { e.stopPropagation(); setConfirmDel(true) }}
              className="opacity-0 group-hover:opacity-100 p-1 text-[var(--text-faint)] hover:text-red-400 rounded transition-all" title="Ištrinti albumą">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9h8l1-9"/></svg>
            </button>
          ) : (
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
              <span className="text-xs text-red-500">Trinti?</span>
              <button onClick={handleDelete} className="px-1.5 py-0.5 text-xs bg-red-500 text-white rounded hover:bg-red-600">Taip</button>
              <button onClick={() => setConfirmDel(false)} className="px-1.5 py-0.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]">Ne</button>
            </div>
          )}
          <span className={`text-[var(--text-muted)] text-xs transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>▼</span>
        </div>
      </div>
      {open && (
        <div className="border-t border-[var(--border-subtle)]">
          {loadingTracks ? (
            <div className="py-4 flex justify-center">
              <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : tracks.length > 0 ? (
            <>
              {tracks.map((t: any, i: number) => (
                <TrackRow key={t.track_id || t.id || i} track={t}
                  onDelete={() => {
                    const tid = t.track_id || t.id
                    setTracks(p => p.filter((_, idx) => idx !== i))
                    if (tid) fetch(`/api/tracks/${tid}`, { method: 'DELETE' }).catch(() => {})
                  }}
                />
              ))}
              <div className="px-3 py-1.5 border-t border-[var(--bg-elevated)]">
                <a href={`/admin/albums/${album.id}`} className="text-xs text-[var(--text-muted)] hover:text-blue-500 transition-colors">
                  + Pridėti / redaguoti dainas
                </a>
              </div>
            </>
          ) : (
            <div className="py-4 text-center">
              <p className="text-xs text-[var(--text-muted)]">Nėra dainų</p>
              <a href={`/admin/albums/${album.id}`} className="text-xs text-blue-500 hover:underline mt-1 block">+ Pridėti dainas</a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SingleRow({ track, onDelete }: { track: any; onDelete: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--bg-hover)]/80 group transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <a href={`/admin/tracks/${track.id}`} target="_blank" rel="noopener noreferrer"
            className="text-sm text-[var(--text-primary)] hover:text-blue-600 truncate transition-colors">
            {track.title}
          </a>
          {track.release_year && <span className="text-xs text-[var(--text-muted)] shrink-0">{track.release_year}</span>}
          {track.video_url && <span className="text-blue-400 text-xs shrink-0">▶</span>}
          {track.has_lyrics && <span className="text-green-500 text-xs font-bold shrink-0">T</span>}

        </div>
        {track.albums_list?.[0] && <div className="text-[11px] text-[var(--text-muted)] truncate">{track.albums_list[0].title}</div>}
      </div>
      {confirmDelete ? (
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs text-red-500">Tikrai?</span>
          <button onClick={onDelete} className="px-1.5 py-0.5 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors">Taip</button>
          <button onClick={() => setConfirmDelete(false)} className="px-1.5 py-0.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">Ne</button>
        </div>
      ) : (
        <button onClick={() => setConfirmDelete(true)}
          className="opacity-0 group-hover:opacity-100 shrink-0 p-1 text-[var(--text-faint)] hover:text-red-400 rounded transition-all"
          title="Ištrinti">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9h8l1-9"/>
          </svg>
        </button>
      )}
    </div>
  )
}

function DiscographyPanel({ artistId, artistName, artistType, refreshKey, onImportClose }: {
  artistId: string; artistName: string; artistType?: 'solo'|'group'; refreshKey: number; onImportClose: () => void
}) {
  const [albums, setAlbums] = useState<any[]>([])
  const [singles, setSingles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/albums?artist_id=${artistId}&limit=100`).then(r => r.json()),
      fetch(`/api/tracks?artist_id=${artistId}&limit=200`).then(r => r.json()),
    ]).then(([albumData, trackData]) => {
      const sorted = (albumData.albums || []).sort((a: any, b: any) => (b.year || 0) - (a.year || 0))
      setAlbums(sorted)
      const allTracks = (trackData.tracks || [])
      const singlesOnly = allTracks.filter((t: any) => t.album_count === 0)
      setSingles(singlesOnly.sort((a: any, b: any) => (b.release_year || 0) - (a.release_year || 0)))
    }).finally(() => setLoading(false))
  }, [artistId])

  useEffect(() => { loadData() }, [artistId, refreshKey, loadData])

  // Klausyti discography-updated event'o (iš importo)
  useEffect(() => {
    const handler = () => loadData()
    window.addEventListener('discography-updated', handler)
    return () => window.removeEventListener('discography-updated', handler)
  }, [loadData])

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 px-3 py-2 border-b border-[var(--input-border)] bg-white/80 backdrop-blur sticky top-0 z-10">
        {/* Mobile: viena eilutė su visais mygtukais */}
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold text-[var(--text-secondary)] hidden lg:inline">Diskografija</span>
          {albums.length > 0 && (
            <span className="bg-[var(--bg-active)] text-[var(--text-secondary)] text-xs font-bold px-1.5 py-0.5 rounded-full hidden lg:inline-flex">{albums.length}</span>
          )}
          {/* ⚡ Automatinis — užima likusią vietą ant mobile */}
          {artistName && (
            <div className="flex-1 lg:flex-none lg:ml-auto">
              <WikipediaImportDiscography
                artistId={parseInt(artistId)}
                artistName={artistName}
                artistWikiTitle={artistName.replace(/ /g, '_')}
                isSolo={artistType === 'solo'}
                onClose={onImportClose}
                buttonClassName="w-full lg:w-auto flex items-center justify-center gap-1.5 px-2 py-1.5 bg-violet-50 hover:bg-violet-100 text-violet-600 rounded-lg text-xs font-medium transition-colors"
                buttonLabel="⚡ Automatinis įkėlimas"
              />
            </div>
          )}
          {/* 🏆 Apdovanojimai — disabled kol nėra diskografijos */}
          {artistName && (
            <WikipediaImportAwards
              artistId={parseInt(artistId)}
              artistName={artistName}
              disabled={albums.length === 0}
              onClose={onImportClose}
            />
          )}
          {/* + Albumas / + Daina — tik ikona ant mobile, tekstas ant desktop */}
          <Link href={`/admin/albums/new?artist_id=${artistId}`} title="Naujas albumas"
            className="shrink-0 flex items-center gap-1 px-1.5 lg:px-2 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-medium transition-colors">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="8" cy="8" r="6.5"/><path d="M8 5v6M5 8h6"/></svg>
            <span className="hidden lg:inline">Albumas</span>
          </Link>
          <Link href={`/admin/tracks/new?artist_id=${artistId}`} title="Nauja daina"
            className="shrink-0 flex items-center gap-1 px-1.5 lg:px-2 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg text-xs font-medium transition-colors">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="8" cy="8" r="6.5"/><path d="M8 5v6M5 8h6"/></svg>
            <span className="hidden lg:inline">Daina</span>
          </Link>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : albums.length === 0 && singles.length === 0 ? (
          <div className="py-12 text-center">
            <div className="flex justify-center mb-3">
              <svg viewBox="0 0 48 48" className="w-12 h-12 text-[var(--text-faint)]" fill="currentColor">
                <circle cx="24" cy="24" r="22" opacity=".4"/>
                <circle cx="24" cy="24" r="14" opacity=".6"/>
                <circle cx="24" cy="24" r="5" opacity=".9"/>
                <circle cx="24" cy="24" r="2" fill="white"/>
              </svg>
            </div>
            <p className="text-sm text-[var(--text-muted)] mb-3">Nėra albumų</p>
            <Link href={`/admin/albums/new?artist_id=${artistId}`}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
              + Sukurti pirmą albumą
            </Link>
            <Link href={`/admin/tracks/new?artist_id=${artistId}`}
              className="inline-flex items-center gap-1 px-3 py-1.5 border border-green-300 text-green-700 rounded-lg text-sm font-medium hover:bg-green-50 transition-colors mt-2">
              + Pridėti dainą
            </Link>
          </div>
        ) : (
          <>
            {albums.map((album, i) => (
              <AlbumCard key={`${album.id}-${refreshKey}`} album={album} defaultOpen={i === 0 && singles.length === 0}
                onDeleted={loadData} />
            ))}
            {singles.length > 0 && (
              <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50">
                  <span className="text-sm font-semibold text-[var(--text-secondary)]">Dainos be albumo</span>
                  <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-active)] px-1.5 py-0.5 rounded-full font-bold">{singles.length}</span>
                  <Link href={`/admin/tracks?artist_id=${artistId}`}
                    className="ml-auto text-xs text-blue-500 hover:underline">Visos dainos →</Link>
                </div>
                <div className="divide-y divide-[var(--bg-elevated)]">
                  {singles.slice(0, 30).map((track: any) => (
                    <SingleRow key={track.id} track={track} onDelete={() => {
                      setSingles(p => p.filter(s => s.id !== track.id))
                      fetch(`/api/tracks/${track.id}`, { method: 'DELETE' }).catch(() => {})
                    }} />
                  ))}
                  {singles.length > 30 && (
                    <div className="px-3 py-2 text-center">
                      <Link href={`/admin/tracks?artist_id=${artistId}`} className="text-xs text-blue-500 hover:underline">
                        Rodyti visas {singles.length} dainas →
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function MobileBreadcrumb({ artistName, artistId, albumCount, trackCount, onWikiImport }: {
  artistName: string; artistId: string
  albumCount: number | null; trackCount: number | null
  onWikiImport: (data: any) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="lg:hidden flex items-center gap-1.5 min-w-0 flex-1">
      <Link href="/admin/artists" className="text-[var(--text-muted)] shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--bg-elevated)]">
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
      </Link>
      <div className="relative">
        <button type="button" onClick={() => setOpen(p => !p)}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--bg-elevated)] transition-colors text-[var(--text-secondary)]">
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="fixed top-[104px] left-4 right-4 bg-[var(--bg-surface)] rounded-xl shadow-2xl border border-[var(--border-subtle)] z-50 overflow-hidden">
              <div className="px-3 py-2.5 border-b border-[var(--border-subtle)]">
                <p className="text-xs font-semibold text-[var(--text-secondary)] truncate">{artistName}</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">Navigacija</p>
              </div>
              <Link href="/admin/artists" onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-2 text-[var(--text-muted)]"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                Visi atlikėjai
              </Link>
              {albumCount !== null && (
                <Link href={`/admin/albums?artist_id=${artistId}`} onClick={() => setOpen(false)}
                  className="flex items-center justify-between px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">
                  <span className="flex items-center gap-2">
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-2 text-[var(--text-muted)]"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
                    Albumai
                  </span>
                  <span className="bg-[var(--bg-elevated)] text-[var(--text-secondary)] text-xs font-bold px-1.5 py-0.5 rounded-full">{albumCount}</span>
                </Link>
              )}
              {trackCount !== null && (
                <Link href={`/admin/tracks?artist_id=${artistId}`} onClick={() => setOpen(false)}
                  className="flex items-center justify-between px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">
                  <span className="flex items-center gap-2">
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-2 text-[var(--text-muted)]"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                    Dainos
                  </span>
                  <span className="bg-[var(--bg-elevated)] text-[var(--text-secondary)] text-xs font-bold px-1.5 py-0.5 rounded-full">{trackCount}</span>
                </Link>
              )}
              <div className="border-t border-[var(--border-subtle)]">
                <WikipediaImportCompact artistName={artistName} onImport={(data) => { onWikiImport(data); setOpen(false) }} />
              </div>
              <div className="border-t border-[var(--border-subtle)] px-3 py-2">
                <Link href={`/admin/albums/new?artist_id=${artistId}`} onClick={() => setOpen(false)}
                  className="flex items-center gap-2 py-1 text-sm text-[var(--text-secondary)] hover:text-blue-600">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-2 text-[var(--text-muted)] shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                  Naujas albumas
                </Link>
                <Link href={`/admin/tracks/new?artist_id=${artistId}`} onClick={() => setOpen(false)}
                  className="flex items-center gap-2 py-1 text-sm text-[var(--text-secondary)] hover:text-green-600">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-2 text-[var(--text-muted)] shrink-0"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Nauja daina
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function WikipediaImportWithHint({ artistName, onImport }: { artistName?: string; onImport: (data: any) => void }) {
  return <WikipediaImport onImport={onImport} initialSearch={artistName} />
}

/** Manual cascade recalc — recomputes artist + all its albums + tracks scores.
 *  Useful for entities that were imported before the TS scoring layer existed.
 *  One click, fire-and-forget; UI shows last result inline. */
function RecalcCascadeButton({ artistId }: { artistId: string }) {
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<{ artist: number; albums: number; tracks: number } | null>(null)

  const run = async () => {
    setStatus('running')
    setResult(null)
    try {
      const r = await fetch(`/api/admin/recalc-artist-cascade?artist_id=${artistId}`, { method: 'POST' })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || 'fail')
      setResult({
        artist: j.artist_score ?? 0,
        albums: j.albums_scored ?? 0,
        tracks: j.tracks_scored ?? 0,
      })
      setStatus('done')
      setTimeout(() => setStatus('idle'), 4000)
    } catch {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 4000)
    }
  }

  const label = status === 'running' ? 'Skaičiuoja…'
              : status === 'done' && result
                ? `✓ ${result.artist} / ${result.albums} alb. / ${result.tracks} d.`
              : status === 'error' ? 'Klaida'
              : '↻ Perskaičiuoti balus'

  return (
    <button
      type="button"
      onClick={run}
      disabled={status === 'running'}
      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
        status === 'done'  ? 'bg-green-50 text-green-700 border border-green-200'
        : status === 'error' ? 'bg-red-50 text-red-700 border border-red-200'
        : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200'
      } disabled:opacity-50`}
      title="Perskaičiuoja artist + visų albumų + visų dainų balus"
    >
      {label}
    </button>
  )
}

function WikipediaImportCompact({ onImport, artistName }: { onImport: (data: any) => void; artistName?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-2 py-1 text-xs text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors font-medium"
        title="Atnaujinti atlikėjo informaciją iš Wikipedia">
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" fill="currentColor" aria-hidden="true">
          <path d="M22 2h-3.5l-3 9-3-9h-1l-3 9-3-9H2l4.5 13h1L11 6l3.5 9h1L20 2h2z"/>
        </svg>
        Įkelti Wiki info
      </button>
      {open && (
        <FullscreenModal onClose={() => setOpen(false)} title="Atnaujinti iš Wikipedia" maxWidth="max-w-2xl">
          <WikipediaImportWithHint
            artistName={artistName}
            onImport={(data: any) => { onImport(data); setOpen(false) }}
          />
        </FullscreenModal>
      )}
    </>
  )
}

export default function EditArtist() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const [initialData, setInitialData] = useState<ArtistFormData | null>(null)
  const [artistName, setArtistName] = useState('')
  const [artistType, setArtistType] = useState<'solo'|'group'>('group')
  const [albumCount, setAlbumCount] = useState<number | null>(null)
  const [trackCount, setTrackCount] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'form' | 'discography'>('form')
  const [discographyKey, setDiscographyKey] = useState(0)
  const [formKey, setFormKey] = useState(0)
  const [artistScore, setArtistScore] = useState<number | null>(null)
  const submitFnRef = useRef<{ fn: (() => void) | null }>({ fn: null })

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
        setArtistType(data.type === 'solo' ? 'solo' : 'group')
      })

    fetch(`/api/albums?artist_id=${artistId}&limit=1`)
      .then(r => r.json()).then(d => setAlbumCount(d.total ?? 0)).catch(() => {})

    fetch(`/api/tracks?artist_id=${artistId}&limit=1`)
      .then(r => r.json()).then(d => setTrackCount(d.total ?? null)).catch(() => {})

    fetch(`/api/artists/${artistId}/score`)
      .then(r => r.json()).then(d => setArtistScore(d.score ?? null)).catch(() => {})
  }, [status, isAdmin, artistId, router])

  const handleSubmit = useCallback(async (form: ArtistFormData) => {
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/artists/${artistId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formToDb(form)),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSaved(true); setTimeout(() => setSaved(false), 2000)
      setArtistName(form.name)
      setInitialData(form)
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }, [artistId])

  if (status === 'loading' || !initialData) return (
    <div className="min-h-screen bg-[var(--bg-elevated)] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="flex flex-col bg-[#f8f7f5]" style={{ height: "calc(100vh - 56px)", overflow: "hidden", maxWidth: "100vw" }}>

      <div className="shrink-0 bg-white/95 backdrop-blur border-b border-[var(--input-border)]" style={{ overflow: "visible" }}>
        <div className="flex items-center justify-between gap-2 px-4 py-2">

          <div className="flex items-center gap-2 min-w-0 flex-1">
            <nav className="hidden lg:flex items-center gap-1 text-sm min-w-0 shrink overflow-hidden">
              <Link href="/admin" className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] shrink-0">Admin</Link>
              <span className="text-[var(--text-faint)] shrink-0">/</span>
              <Link href="/admin/artists" className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] shrink-0">Atlikėjai</Link>
              <span className="text-[var(--text-faint)] shrink-0">/</span>
              <span className="text-[var(--text-primary)] font-semibold truncate">{artistName || '...'}</span>
              {albumCount !== null && (
                <>
                  <span className="text-[var(--text-faint)] shrink-0">/</span>
                  <Link href={`/admin/albums?artist_id=${artistId}`}
                    className="text-[var(--text-muted)] hover:text-blue-600 shrink-0 flex items-center gap-1 transition-colors">
                    Albumai
                    <span className="bg-[var(--bg-elevated)] text-[var(--text-secondary)] text-xs font-bold px-1 py-0.5 rounded leading-none">{albumCount}</span>
                  </Link>
                </>
              )}
              {trackCount !== null && (
                <>
                  <span className="text-[var(--text-faint)] shrink-0">/</span>
                  <Link href={`/admin/tracks?artist_id=${artistId}`}
                    className="text-[var(--text-muted)] hover:text-blue-600 shrink-0 flex items-center gap-1 transition-colors">
                    Dainos
                    <span className="bg-[var(--bg-elevated)] text-[var(--text-secondary)] text-xs font-bold px-1 py-0.5 rounded leading-none">{trackCount}</span>
                  </Link>
                </>
              )}
            </nav>

            <MobileBreadcrumb
              artistName={artistName}
              artistId={artistId}
              albumCount={albumCount}
              trackCount={trackCount}
              onWikiImport={(data: Partial<ArtistFormData>) => {
                setInitialData(prev => {
                  if (!prev) return prev
                  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== null && v !== ''))
                  const result = { ...prev, ...clean }
                  if (Array.isArray(data.members)) result.members = data.members
                  if (Array.isArray(data.groups)) result.groups = data.groups
                  return result
                })
              }}
            />

            <div className="hidden lg:flex items-center gap-1 shrink-0 border-l border-[var(--input-border)] pl-2 ml-1">
              <WikipediaImportCompact
                artistName={artistName}
                onImport={(data: Partial<ArtistFormData>) => {
                  setInitialData(prev => {
                    const base = prev || {
                      name:'', type:'solo' as const, country:'Lietuva', genre:'', substyles:[],
                      description:'', avatar:'', avatarWide:'', avatarPosition:'center 20%', website:'', photos:[],
                      yearStart:'', yearEnd:'', breaks:[], members:[],
                      birthYear:'', birthMonth:'', birthDay:'',
                      deathYear:'', deathMonth:'', deathDay:'', gender:'' as const,
                      facebook:'', twitter:'', youtube:'',
                      spotify:'', soundcloud:'', tiktok:'', bandcamp:'',
                      groups:[], subdomain:'',
                    }
                    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== null && v !== ''))
                    const result = { ...base, ...clean }
                    if (Array.isArray(data.members)) result.members = data.members
                    if (Array.isArray(data.groups)) result.groups = data.groups
                    return result
                  })
                }}
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <ScoreBadge artistId={artistId} score={artistScore} />
            <RecalcCascadeButton artistId={artistId} />
            <Link href="/admin/artists"
              className="px-3 py-1.5 border border-[var(--input-border)] text-[var(--text-secondary)] rounded-lg text-sm font-medium hover:bg-[var(--bg-hover)] transition-colors">
              Atšaukti
            </Link>
            <button
              onClick={() => submitFnRef.current.fn?.()}
              disabled={saving}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${saved ? 'bg-green-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'} disabled:opacity-50`}>
              {saving
                ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" /> Saugoma...</>
                : saved ? '✓ Išsaugota!' : '✓ Išsaugoti'}
            </button>
          </div>
        </div>

        <div className="flex lg:hidden border-t border-[var(--border-subtle)]">
          <button onClick={() => setTab('form')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors ${tab === 'form' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/30' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}>
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-2 shrink-0">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Redagavimas
          </button>
          <button onClick={() => setTab('discography')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors ${tab === 'discography' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/30' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}>
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-2 shrink-0">
              <circle cx="12" cy="12" r="10"/>
              <circle cx="12" cy="12" r="4"/>
              <circle cx="12" cy="12" r="1.5" className="fill-current stroke-none"/>
            </svg>
            Diskografija
          </button>
        </div>
      </div>

      {error && (
        <div className="shrink-0 px-3 pt-2">
          <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-center gap-2">
            ❌ {error}
            <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600 transition-colors">✕</button>
          </div>
        </div>
      )}

      <div className="lg:hidden flex-1 overflow-y-auto overflow-x-hidden">
        {tab === 'form' && (
          <ArtistFormCompact key={formKey} initialData={initialData} artistId={artistId} onSubmit={handleSubmit} saving={saving} onRegisterSubmit={fn => { submitFnRef.current.fn = fn }} />
        )}
        {tab === 'discography' && (
          <DiscographyPanel artistId={artistId} artistName={artistName} artistType={artistType} refreshKey={discographyKey}
            onImportClose={() => {
              setDiscographyKey(k => k + 1)
              fetch(`/api/albums?artist_id=${artistId}&limit=1`).then(r => r.json()).then(d => setAlbumCount(d.total ?? 0)).catch(() => {})
              fetch(`/api/tracks?artist_id=${artistId}&limit=1`).then(r => r.json()).then(d => setTrackCount(d.total ?? null)).catch(() => {})
              // Cascade-recalc scores for artist + all albums + all tracks.
              // Fire-and-forget: success state shown next time admin refreshes.
              fetch(`/api/admin/recalc-artist-cascade?artist_id=${artistId}`, { method: 'POST' }).catch(() => {})
            }}
          />
        )}
      </div>

      <div className="hidden lg:flex flex-1 min-h-0">
        <div className="border-r border-[var(--input-border)] overflow-y-auto" style={{ width: '60%' }}>
          <ArtistFormCompact key={formKey} initialData={initialData} artistId={artistId} onSubmit={handleSubmit} saving={saving} onRegisterSubmit={fn => { submitFnRef.current.fn = fn }} />
        </div>
        <div className="overflow-hidden flex flex-col" style={{ width: '40%' }}>
          <DiscographyPanel artistId={artistId} artistName={artistName} artistType={artistType} refreshKey={discographyKey}
            onImportClose={() => {
              setDiscographyKey(k => k + 1)
              fetch(`/api/albums?artist_id=${artistId}&limit=1`).then(r => r.json()).then(d => setAlbumCount(d.total ?? 0)).catch(() => {})
              fetch(`/api/tracks?artist_id=${artistId}&limit=1`).then(r => r.json()).then(d => setTrackCount(d.total ?? null)).catch(() => {})
              // Cascade-recalc scores for artist + all albums + all tracks.
              // Fire-and-forget: success state shown next time admin refreshes.
              fetch(`/api/admin/recalc-artist-cascade?artist_id=${artistId}`, { method: 'POST' }).catch(() => {})
            }}
          />
        </div>
      </div>
    </div>
  )
}

function ArtistFormCompact({ initialData, artistId, onSubmit, saving, onRegisterSubmit }: {
  initialData: ArtistFormData; artistId: string
  onSubmit: (d: ArtistFormData) => void
  saving: boolean
  onRegisterSubmit?: (fn: () => void) => void
}) {
  return (
    <div className="artist-form-compact">
      <style>{`
        .artist-form-compact { overflow-x: hidden; max-width: 100vw; }
        @media (max-width: 640px) { .artist-form-compact input, .artist-form-compact select, .artist-form-compact textarea { font-size: 16px !important; } }
        .artist-form-compact .min-h-screen { min-height: unset !important; }
        .artist-form-compact .max-w-7xl { max-width: 100% !important; padding: 0 !important; width: 100% !important; }
        .artist-form-compact > div > div > .flex.items-center.justify-between.mb-6 { display: none !important; margin: 0 !important; }
        .artist-form-compact > div { background: transparent !important; }
      `}</style>
      <ArtistForm
        title=""
        submitLabel={saving ? 'Saugoma...' : 'Išsaugoti pakeitimus'}
        backHref="/admin/artists"
        initialData={initialData}
        artistId={artistId}
        onSubmit={onSubmit}
        hideButtons
        onRegisterSubmit={onRegisterSubmit}
      />
    </div>
  )
}
