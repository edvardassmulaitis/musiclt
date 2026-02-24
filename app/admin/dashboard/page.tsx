'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Artist = { id: number; name: string; slug: string; photo_url?: string }
type Album = { id: number; title: string; year: number | null; artist_name: string; cover_url?: string; track_count?: number }
type Track = { id: number; title: string; type: string; artist_name: string; release_year: number | null; video_url?: string; spotify_id?: string; lyrics?: string; albums_list: any[] }

export default function AdminDashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [query, setQuery] = useState('')
  const [artists, setArtists] = useState<Artist[]>([])
  const [albums, setAlbums] = useState<Album[]>([])
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  useEffect(() => { if (status === 'unauthenticated') router.push('/') }, [status])
  useEffect(() => { if (isAdmin) inputRef.current?.focus() }, [isAdmin])

  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setArtists([]); setAlbums([]); setTracks([]); setSearched(false)
      return
    }
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const [ar, al, tr] = await Promise.all([
          fetch(`/api/artists?search=${encodeURIComponent(query)}&limit=6`).then(r => r.json()),
          fetch(`/api/albums?search=${encodeURIComponent(query)}&limit=6`).then(r => r.json()),
          fetch(`/api/tracks?search=${encodeURIComponent(query)}&limit=8`).then(r => r.json()),
        ])
        setArtists(ar.artists || [])
        setAlbums(al.albums || [])
        setTracks(tr.tracks || [])
        setSearched(true)
      } finally { setLoading(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  if (status === 'loading' || !isAdmin) return null

  const hasResults = artists.length > 0 || albums.length > 0 || tracks.length > 0
  const noResults = searched && !loading && !hasResults

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full px-6 py-6">

        {/* Compact top bar */}
        <div className="flex items-center justify-between mb-6">
          <Link href="/admin" className="flex items-center gap-2 hover:opacity-70 transition-opacity">
            <span className="text-lg font-black text-gray-900">🎵 music.lt admin</span>
          </Link>
          <div className="flex gap-2">
            <Link href="/admin/users"
              className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-1.5">
              👥 Vartotojai
            </Link>
            <Link href="/admin/settings"
              className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-1.5">
              ⚙️ Nustatymai
            </Link>
          </div>
        </div>

        {/* Search */}
        <div className="max-w-2xl mx-auto mb-6">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl pointer-events-none">🔍</span>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Ieškoti atlikėjų, albumų, dainų..."
              className="w-full pl-12 pr-10 py-3.5 text-base bg-white border-2 border-gray-200 rounded-2xl text-gray-900 focus:outline-none focus:border-music-blue shadow-sm transition-colors"
            />
            {query && (
              <button onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xl w-7 h-7 flex items-center justify-center">×</button>
            )}
          </div>
          {loading && (
            <div className="flex justify-center mt-3">
              <div className="w-5 h-5 border-2 border-music-blue border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {noResults && (
            <p className="text-center text-gray-400 mt-4 text-sm">Nieko nerasta pagal „{query}"</p>
          )}
        </div>

        {/* Empty state */}
        {!searched && !loading && (
          <div className="max-w-2xl mx-auto">
            <p className="text-center text-gray-400 text-sm mb-4">arba eik tiesiai į:</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { href: '/admin/artists', newHref: '/admin/artists/new', icon: '🎤', label: 'Atlikėjai' },
                { href: '/admin/albums', newHref: '/admin/albums/new', icon: '💿', label: 'Albumai' },
                { href: '/admin/tracks', newHref: '/admin/tracks/new', icon: '🎵', label: 'Dainos' },
              ].map(item => (
                <div key={item.href} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <Link href={item.href} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                    <span className="text-xl">{item.icon}</span>
                    <span className="font-semibold text-gray-800">{item.label}</span>
                  </Link>
                  <Link href={item.newHref}
                    className="flex items-center justify-center gap-1 w-full py-2 text-xs text-music-blue border-t border-gray-100 hover:bg-blue-50 transition-colors">
                    + Naujas
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Results – 3 columns */}
        {hasResults && (
          <div className="grid grid-cols-3 gap-5">

            {/* Artists */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-bold text-gray-600 text-sm flex items-center gap-1.5">
                  🎤 Atlikėjai
                  <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-normal">{artists.length}</span>
                </h2>
                <div className="flex items-center gap-2">
                  <Link href="/admin/artists/new" className="text-xs text-music-blue hover:underline">+ naujas</Link>
                  {artists.length >= 6 && (
                    <Link href={`/admin/artists?search=${encodeURIComponent(query)}`}
                      className="text-xs text-gray-400 hover:text-music-blue">visi →</Link>
                  )}
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                {artists.length === 0 ? (
                  <div className="px-4 py-6 text-center text-gray-300 text-sm">Nerasta</div>
                ) : artists.map((a, i) => (
                  <Link key={a.id} href={`/admin/artists/${a.id}`}
                    className={`flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 transition-colors ${i > 0 ? 'border-t border-gray-50' : ''}`}>
                    {a.photo_url ? (
                      <img src={a.photo_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-base shrink-0">🎤</div>
                    )}
                    <span className="text-sm font-medium text-gray-900 truncate">{a.name}</span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Albums */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-bold text-gray-600 text-sm flex items-center gap-1.5">
                  💿 Albumai
                  <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-normal">{albums.length}</span>
                </h2>
                <div className="flex items-center gap-2">
                  <Link href="/admin/albums/new" className="text-xs text-music-blue hover:underline">+ naujas</Link>
                  {albums.length >= 6 && (
                    <Link href={`/admin/albums?search=${encodeURIComponent(query)}`}
                      className="text-xs text-gray-400 hover:text-music-blue">visi →</Link>
                  )}
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                {albums.length === 0 ? (
                  <div className="px-4 py-6 text-center text-gray-300 text-sm">Nerasta</div>
                ) : albums.map((a, i) => (
                  <Link key={a.id} href={`/admin/albums/${a.id}`}
                    className={`flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 transition-colors ${i > 0 ? 'border-t border-gray-50' : ''}`}>
                    {a.cover_url ? (
                      <img src={a.cover_url} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-base shrink-0">💿</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{a.title}</div>
                      <div className="text-xs text-gray-400 truncate">
                        {a.artist_name}
                        {a.year ? ` · ${a.year}` : ''}
                        {a.track_count ? ` · ${a.track_count} d.` : ''}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Tracks */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-bold text-gray-600 text-sm flex items-center gap-1.5">
                  🎵 Dainos
                  <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-normal">{tracks.length}</span>
                </h2>
                <div className="flex items-center gap-2">
                  <Link href="/admin/tracks/new" className="text-xs text-music-blue hover:underline">+ nauja</Link>
                  {tracks.length >= 8 && (
                    <Link href={`/admin/tracks?search=${encodeURIComponent(query)}`}
                      className="text-xs text-gray-400 hover:text-music-blue">visos →</Link>
                  )}
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                {tracks.length === 0 ? (
                  <div className="px-4 py-6 text-center text-gray-300 text-sm">Nerasta</div>
                ) : tracks.map((t, i) => (
                  <Link key={t.id} href={`/admin/tracks/${t.id}`}
                    className={`flex items-center gap-2.5 px-3 py-2.5 hover:bg-blue-50 transition-colors ${i > 0 ? 'border-t border-gray-50' : ''}`}>
                    {/* Type icon */}
                    <div className="text-base shrink-0">
                      {t.type === 'single' ? '💿' : '▶️'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{t.title}</div>
                      <div className="text-xs text-gray-400 truncate">
                        {t.artist_name}
                        {t.albums_list?.[0]?.title ? ` · ${t.albums_list[0].title}` : ''}
                      </div>
                    </div>
                    {/* Media icons */}
                    <div className="flex gap-1 shrink-0">
                      {t.video_url && <span title="YouTube" className="text-xs text-red-400">▶</span>}
                      {t.spotify_id && <span title="Spotify" className="text-xs text-green-500">♫</span>}
                      {t.lyrics && <span title="Žodžiai" className="text-xs text-blue-400">T</span>}
                    </div>
                    {t.release_year && <span className="text-xs text-gray-300 shrink-0">{t.release_year}</span>}
                  </Link>
                ))}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
