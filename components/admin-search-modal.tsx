'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

type Artist = { id: number; name: string; cover_image_url?: string }
type Album = { id: number; title: string; year: number | null; artist_name: string; cover_url?: string }
type Track = { id: number; title: string; type: string; artist_name: string; cover_url?: string; video_url?: string; spotify_id?: string; has_lyrics?: boolean }

export default function AdminSearchModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [artists, setArtists] = useState<Artist[]>([])
  const [albums, setAlbums] = useState<Album[]>([])
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50) }, [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setArtists([]); setAlbums([]); setTracks([]); setSearched(false)
      return
    }
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const [ar, al, tr] = await Promise.all([
          fetch(`/api/artists?search=${encodeURIComponent(query)}&limit=10`).then(r => r.json()),
          fetch(`/api/albums?search=${encodeURIComponent(query)}&limit=10`).then(r => r.json()),
          fetch(`/api/tracks?search=${encodeURIComponent(query)}&limit=12`).then(r => r.json()),
        ])
        setArtists(ar.artists || [])
        setAlbums(al.albums || [])
        setTracks(tr.tracks || [])
        setSearched(true)
      } finally { setLoading(false) }
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  const hasResults = artists.length > 0 || albums.length > 0 || tracks.length > 0
  const noResults = searched && !loading && !hasResults

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">

      {/* Search bar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 shrink-0">
        <span className="text-xl shrink-0">🔍</span>
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Ieškoti atlikėjų, albumų, dainų..."
          className="flex-1 text-base text-gray-900 bg-transparent focus:outline-none placeholder-gray-400"
        />
        {loading && <div className="w-4 h-4 border-2 border-music-blue border-t-transparent rounded-full animate-spin shrink-0" />}
        <button onClick={onClose}
          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors shrink-0 text-xl"
          title="Uždaryti (Esc)">
          ×
        </button>
      </div>

      {/* Empty hint */}
      {!searched && !loading && (
        <div className="flex-1 flex items-center justify-center text-gray-300 text-sm">
          Pradėkite rašyti...
        </div>
      )}

      {noResults && (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          Nieko nerasta pagal „{query}"
        </div>
      )}

      {/* Results - responsive: stack on mobile, 3 cols on desktop */}
      {hasResults && (
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row md:divide-x md:divide-gray-100">

          {/* Artists */}
          <div className="md:w-1/3 flex flex-col border-b md:border-b-0 border-gray-100">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-50 shrink-0">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">🎤 Atlikėjai ({artists.length})</span>
              <Link href="/admin/artists/new" onClick={onClose} className="text-xs text-music-blue hover:underline">+ naujas</Link>
            </div>
            <div className="overflow-y-auto flex-1">
              {artists.length === 0
                ? <div className="px-4 py-4 text-xs text-gray-300 text-center">Nerasta</div>
                : artists.map((a, i) => (
                  <Link key={a.id} href={`/admin/artists/${a.id}`} onClick={onClose}
                    className={`flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 transition-colors ${i > 0 ? 'border-t border-gray-50' : ''}`}>
                    {a.cover_image_url
                      ? <img src={a.cover_image_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                      : <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm shrink-0">🎤</div>
                    }
                    <span className="text-sm font-medium text-gray-900 truncate">{a.name}</span>
                  </Link>
                ))
              }
            </div>
          </div>

          {/* Albums */}
          <div className="md:w-1/3 flex flex-col border-b md:border-b-0 border-gray-100">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-50 shrink-0">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">💿 Albumai ({albums.length})</span>
              <Link href="/admin/albums/new" onClick={onClose} className="text-xs text-music-blue hover:underline">+ naujas</Link>
            </div>
            <div className="overflow-y-auto flex-1">
              {albums.length === 0
                ? <div className="px-4 py-4 text-xs text-gray-300 text-center">Nerasta</div>
                : albums.map((a, i) => (
                  <Link key={a.id} href={`/admin/albums/${a.id}`} onClick={onClose}
                    className={`flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 transition-colors ${i > 0 ? 'border-t border-gray-50' : ''}`}>
                    {a.cover_url
                      ? <img src={a.cover_url} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                      : <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-sm shrink-0">💿</div>
                    }
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{a.title}</div>
                      <div className="text-xs text-gray-400 truncate">{a.artist_name}{a.year ? ` · ${a.year}` : ''}</div>
                    </div>
                  </Link>
                ))
              }
            </div>
          </div>

          {/* Tracks */}
          <div className="md:w-1/3 flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-50 shrink-0">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">🎵 Dainos ({tracks.length})</span>
              <Link href="/admin/tracks/new" onClick={onClose} className="text-xs text-music-blue hover:underline">+ nauja</Link>
            </div>
            <div className="overflow-y-auto flex-1">
              {tracks.length === 0
                ? <div className="px-4 py-4 text-xs text-gray-300 text-center">Nerasta</div>
                : tracks.map((t, i) => (
                  <Link key={t.id} href={`/admin/tracks/${t.id}`} onClick={onClose}
                    className={`flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 transition-colors ${i > 0 ? 'border-t border-gray-50' : ''}`}>
                    {t.cover_url
                      ? <img src={t.cover_url} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                      : <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-sm shrink-0">{t.type === 'single' ? '💿' : '🎵'}</div>
                    }
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{t.title}</div>
                      <div className="text-xs text-gray-400 truncate">{t.artist_name}</div>
                    </div>
                    <div className="flex gap-1 shrink-0 text-xs">
                      {t.video_url && <span className="text-red-400" title="YouTube">▶</span>}
                      {t.spotify_id && <span className="text-green-500" title="Spotify">♫</span>}
                      {t.has_lyrics && <span className="text-blue-400" title="Žodžiai">T</span>}
                    </div>
                  </Link>
                ))
              }
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
