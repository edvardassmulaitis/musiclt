'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Artist = { id: number; name: string; cover_image_url?: string }
type Album = { id: number; title: string; year: number | null; artist_name: string; cover_url?: string }
type Track = { id: number; title: string; type: string; artist_name: string; release_year: number | null; video_url?: string; spotify_id?: string; has_lyrics?: boolean; albums_list: any[] }

export default function AdminSearchModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [artists, setArtists] = useState<Artist[]>([])
  const [albums, setAlbums] = useState<Album[]>([])
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
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
          fetch(`/api/artists?search=${encodeURIComponent(query)}&limit=5`).then(r => r.json()),
          fetch(`/api/albums?search=${encodeURIComponent(query)}&limit=5`).then(r => r.json()),
          fetch(`/api/tracks?search=${encodeURIComponent(query)}&limit=6`).then(r => r.json()),
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
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4"
      onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}>

        {/* Search input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
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
            className="text-gray-400 hover:text-gray-600 text-sm px-2 py-1 rounded border border-gray-200 shrink-0">
            Esc
          </button>
        </div>

        {/* Results */}
        {(hasResults || noResults) && (
          <div className="max-h-[60vh] overflow-y-auto">
            {noResults && (
              <div className="px-5 py-8 text-center text-gray-400">Nieko nerasta pagal „{query}"</div>
            )}
            {hasResults && (
              <div className="grid grid-cols-3 divide-x divide-gray-100">

                {/* Artists */}
                <div>
                  <div className="px-4 py-2 flex items-center justify-between border-b border-gray-50">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">🎤 Atlikėjai</span>
                    {artists.length >= 5 && (
                      <Link href={`/admin/artists?search=${encodeURIComponent(query)}`} onClick={onClose}
                        className="text-xs text-music-blue hover:underline">visi →</Link>
                    )}
                  </div>
                  {artists.length === 0
                    ? <div className="px-4 py-4 text-xs text-gray-300 text-center">Nerasta</div>
                    : artists.map(a => (
                      <Link key={a.id} href={`/admin/artists/${a.id}`} onClick={onClose}
                        className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0">
                        {a.cover_image_url
                          ? <img src={a.cover_image_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                          : <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-sm shrink-0">🎤</div>
                        }
                        <span className="text-sm font-medium text-gray-900 truncate">{a.name}</span>
                      </Link>
                    ))
                  }
                  <Link href="/admin/artists/new" onClick={onClose}
                    className="flex items-center justify-center gap-1 w-full py-2 text-xs text-music-blue hover:bg-blue-50 border-t border-gray-100">
                    + Naujas atlikėjas
                  </Link>
                </div>

                {/* Albums */}
                <div>
                  <div className="px-4 py-2 flex items-center justify-between border-b border-gray-50">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">💿 Albumai</span>
                    {albums.length >= 5 && (
                      <Link href={`/admin/albums?search=${encodeURIComponent(query)}`} onClick={onClose}
                        className="text-xs text-music-blue hover:underline">visi →</Link>
                    )}
                  </div>
                  {albums.length === 0
                    ? <div className="px-4 py-4 text-xs text-gray-300 text-center">Nerasta</div>
                    : albums.map(a => (
                      <Link key={a.id} href={`/admin/albums/${a.id}`} onClick={onClose}
                        className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0">
                        {a.cover_url
                          ? <img src={a.cover_url} alt="" className="w-7 h-7 rounded-lg object-cover shrink-0" />
                          : <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-sm shrink-0">💿</div>
                        }
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">{a.title}</div>
                          <div className="text-xs text-gray-400 truncate">{a.artist_name}{a.year ? ` · ${a.year}` : ''}</div>
                        </div>
                      </Link>
                    ))
                  }
                  <Link href="/admin/albums/new" onClick={onClose}
                    className="flex items-center justify-center gap-1 w-full py-2 text-xs text-music-blue hover:bg-blue-50 border-t border-gray-100">
                    + Naujas albumas
                  </Link>
                </div>

                {/* Tracks */}
                <div>
                  <div className="px-4 py-2 flex items-center justify-between border-b border-gray-50">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">🎵 Dainos</span>
                    {tracks.length >= 6 && (
                      <Link href={`/admin/tracks?search=${encodeURIComponent(query)}`} onClick={onClose}
                        className="text-xs text-music-blue hover:underline">visos →</Link>
                    )}
                  </div>
                  {tracks.length === 0
                    ? <div className="px-4 py-4 text-xs text-gray-300 text-center">Nerasta</div>
                    : tracks.map(t => (
                      <Link key={t.id} href={`/admin/tracks/${t.id}`} onClick={onClose}
                        className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0">
                        <span className="text-base shrink-0">{t.type === 'single' ? '💿' : '🎵'}</span>
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
                  <Link href="/admin/tracks/new" onClick={onClose}
                    className="flex items-center justify-center gap-1 w-full py-2 text-xs text-music-blue hover:bg-blue-50 border-t border-gray-100">
                    + Nauja daina
                  </Link>
                </div>

              </div>
            )}
          </div>
        )}

        {/* Empty state hint */}
        {!searched && !loading && (
          <div className="px-5 py-6 text-center text-gray-400 text-sm">
            Pradėkite rašyti... arba <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">Esc</kbd> uždaryti
          </div>
        )}
      </div>
    </div>
  )
}
