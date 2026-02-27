'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

type Artist = { id: number; name: string; cover_image_url?: string }
type Album = { id: number; title: string; year: number | null; artist_name: string; cover_url?: string }
type Track = { id: number; title: string; type: string; artist_name: string; cover_url?: string; video_url?: string; spotify_id?: string; has_lyrics?: boolean }
type NewsItem = { id: number; title: string; type: string; image_small_url?: string; published_at: string }

export default function AdminSearchModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [artists, setArtists] = useState<Artist[]>([])
  const [albums, setAlbums] = useState<Album[]>([])
  const [tracks, setTracks] = useState<Track[]>([])
  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setArtists([]); setAlbums([]); setTracks([]); setNews([]); setSearched(false)
      return
    }
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const [ar, al, tr, nw] = await Promise.all([
          fetch(`/api/artists?search=${encodeURIComponent(query)}&limit=10`).then(r => r.json()),
          fetch(`/api/albums?search=${encodeURIComponent(query)}&limit=10`).then(r => r.json()),
          fetch(`/api/tracks?search=${encodeURIComponent(query)}&limit=12`).then(r => r.json()),
          fetch(`/api/news?search=${encodeURIComponent(query)}&limit=8`).then(r => r.json()),
        ])
        setArtists(ar.artists || [])
        setAlbums(al.albums || [])
        setTracks(tr.tracks || [])
        setNews(nw.news || [])
        setSearched(true)
      } finally { setLoading(false) }
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  const hasResults = artists.length > 0 || albums.length > 0 || tracks.length > 0 || news.length > 0
  const noResults = searched && !loading && !hasResults

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">

      {/* Search bar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 shrink-0">
        <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0 fill-none stroke-current stroke-2 text-gray-400">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          ref={inputRef}
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Ieškoti atlikėjų, albumų, dainų, naujienų..."
          className="flex-1 text-base text-gray-900 bg-transparent focus:outline-none placeholder-gray-400"
          style={{ fontSize: 16 }}
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

      {/* Results - 4 cols on desktop */}
      {hasResults && (
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row md:divide-x md:divide-gray-100">

          {/* Artists */}
          <div className="md:w-1/4 flex flex-col border-b md:border-b-0 border-gray-100">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-50 shrink-0">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Atlikėjai ({artists.length})</span>
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
                      : <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 shrink-0">
                          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        </div>
                    }
                    <span className="text-sm font-medium text-gray-900 truncate">{a.name}</span>
                  </Link>
                ))
              }
            </div>
          </div>

          {/* Albums */}
          <div className="md:w-1/4 flex flex-col border-b md:border-b-0 border-gray-100">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-50 shrink-0">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Albumai ({albums.length})</span>
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
                      : <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 shrink-0">
                          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
                        </div>
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
          <div className="md:w-1/4 flex flex-col border-b md:border-b-0 border-gray-100">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-50 shrink-0">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Dainos ({tracks.length})</span>
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
                      : <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 shrink-0">
                          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                        </div>
                    }
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{t.title}</div>
                      <div className="text-xs text-gray-400 truncate">{t.artist_name}</div>
                    </div>
                    <div className="flex gap-1 shrink-0 text-xs">
                      {t.video_url && <span className="text-blue-400" title="YouTube">▶</span>}
                      {t.spotify_id && <span className="text-green-500" title="Spotify">♫</span>}
                      {t.has_lyrics && <span className="text-green-600 font-bold" title="Žodžiai">T</span>}
                    </div>
                  </Link>
                ))
              }
            </div>
          </div>

          {/* News */}
          <div className="md:w-1/4 flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-50 shrink-0">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Naujienos ({news.length})</span>
              <Link href="/admin/news/new" onClick={onClose} className="text-xs text-music-blue hover:underline">+ nauja</Link>
            </div>
            <div className="overflow-y-auto flex-1">
              {news.length === 0
                ? <div className="px-4 py-4 text-xs text-gray-300 text-center">Nerasta</div>
                : news.map((n, i) => (
                  <Link key={n.id} href={`/admin/news/${n.id}`} onClick={onClose}
                    className={`flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 transition-colors ${i > 0 ? 'border-t border-gray-50' : ''}`}>
                    {n.image_small_url
                      ? <img src={n.image_small_url} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                      : <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 text-base">📰</div>
                    }
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{n.title}</div>
                      <div className="text-xs text-gray-400">{new Date(n.published_at).toLocaleDateString('lt-LT')}</div>
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
