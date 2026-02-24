'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Artist = { id: number; name: string; slug: string; photo_url?: string }
type Album = { id: number; title: string; year: number | null; artist_name: string; cover_url?: string }
type Track = { id: number; title: string; artist_name: string; release_year: number | null; video_url?: string; albums_list: any[] }

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
      <div className="w-full px-6 py-8">

        {/* Top bar */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black text-gray-900">🎵 music.lt admin</h1>
            <p className="text-gray-400 text-sm mt-0.5">Sveiki, {session?.user?.name || session?.user?.email}</p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/artists"
              className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2">
              🎤 Atlikėjai
            </Link>
            <Link href="/admin/users"
              className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2">
              👥 Vartotojai
            </Link>
            <Link href="/admin/settings"
              className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2">
              ⚙️ Nustatymai
            </Link>
          </div>
        </div>

        {/* Search */}
        <div className="max-w-2xl mx-auto mb-8">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl pointer-events-none">🔍</span>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Ieškoti atlikėjų, albumų, dainų..."
              className="w-full pl-12 pr-12 py-4 text-lg bg-white border-2 border-gray-200 rounded-2xl text-gray-900 focus:outline-none focus:border-music-blue shadow-sm transition-colors"
            />
            {query && (
              <button onClick={() => setQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xl">×</button>
            )}
          </div>
          {loading && (
            <div className="flex justify-center mt-4">
              <div className="w-6 h-6 border-2 border-music-blue border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {noResults && (
            <p className="text-center text-gray-400 mt-6">Nieko nerasta pagal „{query}"</p>
          )}
        </div>

        {/* Empty state – shortcuts */}
        {!searched && !loading && (
          <div className="max-w-2xl mx-auto">
            <p className="text-center text-gray-400 text-sm mb-6">arba eik tiesiai į:</p>
            <div className="grid grid-cols-3 gap-4">
              {[
                { href: '/admin/artists', icon: '🎤', label: 'Atlikėjai', desc: 'Tvarkyti atlikėjų sąrašą' },
                { href: '/admin/albums', icon: '💿', label: 'Albumai', desc: 'Peržiūrėti visus albumus' },
                { href: '/admin/tracks', icon: '🎵', label: 'Dainos', desc: 'Redaguoti dainas' },
              ].map(item => (
                <Link key={item.href} href={item.href}
                  className="bg-white border border-gray-200 rounded-2xl p-6 hover:border-music-blue hover:shadow-md transition-all text-center group">
                  <div className="text-4xl mb-3">{item.icon}</div>
                  <div className="font-bold text-gray-900 group-hover:text-music-blue">{item.label}</div>
                  <div className="text-xs text-gray-400 mt-1">{item.desc}</div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Results – 3 columns */}
        {hasResults && (
          <div className="grid grid-cols-3 gap-6">

            {/* Artists */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-gray-700 flex items-center gap-2">
                  🎤 Atlikėjai
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{artists.length}</span>
                </h2>
                {artists.length >= 6 && (
                  <Link href={`/admin/artists?search=${encodeURIComponent(query)}`}
                    className="text-xs text-music-blue hover:underline">visi →</Link>
                )}
              </div>
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                {artists.length === 0 ? (
                  <div className="px-4 py-8 text-center text-gray-300 text-sm">Nerasta</div>
                ) : artists.map((a, i) => (
                  <Link key={a.id} href={`/admin/artists/${a.slug || a.id}`}
                    className={`flex items-center gap-3 px-4 py-3 hover:bg-blue-50 transition-colors ${i > 0 ? 'border-t border-gray-50' : ''}`}>
                    {a.photo_url ? (
                      <img src={a.photo_url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-lg shrink-0">🎤</div>
                    )}
                    <span className="text-sm font-medium text-gray-900 truncate">{a.name}</span>
                  </Link>
                ))}
              </div>
              {artists.length > 0 && (
                <Link href="/admin/artists/new"
                  className="mt-2 flex items-center justify-center gap-1 w-full py-2 text-xs text-music-blue border border-dashed border-blue-200 rounded-xl hover:bg-blue-50 transition-colors">
                  + Naujas atlikėjas
                </Link>
              )}
            </div>

            {/* Albums */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-gray-700 flex items-center gap-2">
                  💿 Albumai
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{albums.length}</span>
                </h2>
                {albums.length >= 6 && (
                  <Link href={`/admin/albums?search=${encodeURIComponent(query)}`}
                    className="text-xs text-music-blue hover:underline">visi →</Link>
                )}
              </div>
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                {albums.length === 0 ? (
                  <div className="px-4 py-8 text-center text-gray-300 text-sm">Nerasta</div>
                ) : albums.map((a, i) => (
                  <Link key={a.id} href={`/admin/albums/${a.id}`}
                    className={`flex items-center gap-3 px-4 py-3 hover:bg-blue-50 transition-colors ${i > 0 ? 'border-t border-gray-50' : ''}`}>
                    {a.cover_url ? (
                      <img src={a.cover_url} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center text-lg shrink-0">💿</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{a.title}</div>
                      <div className="text-xs text-gray-400 truncate">{a.artist_name}{a.year ? ` · ${a.year}` : ''}</div>
                    </div>
                  </Link>
                ))}
              </div>
              {albums.length > 0 && (
                <Link href="/admin/albums/new"
                  className="mt-2 flex items-center justify-center gap-1 w-full py-2 text-xs text-music-blue border border-dashed border-blue-200 rounded-xl hover:bg-blue-50 transition-colors">
                  + Naujas albumas
                </Link>
              )}
            </div>

            {/* Tracks */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-gray-700 flex items-center gap-2">
                  🎵 Dainos
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{tracks.length}</span>
                </h2>
                {tracks.length >= 8 && (
                  <Link href={`/admin/tracks?search=${encodeURIComponent(query)}`}
                    className="text-xs text-music-blue hover:underline">visos →</Link>
                )}
              </div>
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                {tracks.length === 0 ? (
                  <div className="px-4 py-8 text-center text-gray-300 text-sm">Nerasta</div>
                ) : tracks.map((t, i) => (
                  <Link key={t.id} href={`/admin/tracks/${t.id}`}
                    className={`flex items-center gap-3 px-4 py-3 hover:bg-blue-50 transition-colors ${i > 0 ? 'border-t border-gray-50' : ''}`}>
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0 ${t.video_url ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-gray-400'}`}>
                      {t.video_url ? '▶' : '♪'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{t.title}</div>
                      <div className="text-xs text-gray-400 truncate">
                        {t.artist_name}
                        {t.albums_list?.[0]?.title ? ` · ${t.albums_list[0].title}` : ''}
                      </div>
                    </div>
                    {t.release_year && <span className="text-xs text-gray-300 shrink-0">{t.release_year}</span>}
                  </Link>
                ))}
              </div>
              {tracks.length > 0 && (
                <Link href="/admin/tracks/new"
                  className="mt-2 flex items-center justify-center gap-1 w-full py-2 text-xs text-music-blue border border-dashed border-blue-200 rounded-xl hover:bg-blue-50 transition-colors">
                  + Nauja daina
                </Link>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
