'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

type Artist = {
  id: number
  slug: string
  name: string
  country?: string
  type: string
  active_from?: number
  active_until?: number
  cover_image_url?: string
  is_verified?: boolean
}

export default function ArtistsAdmin() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [artists, setArtists] = useState<Artist[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<number | null>(null)

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  const load = useCallback(async (q = '') => {
    setLoading(true)
    try {
      const res = await fetch(`/api/artists?limit=50&search=${encodeURIComponent(q)}`)
      const data = await res.json()
      setArtists(data.artists || [])
      setTotal(data.total || 0)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/auth/signin'); return }
    if (status === 'authenticated' && !isAdmin) { router.push('/'); return }
    if (status === 'authenticated') load()
  }, [status, isAdmin, router, load])

  useEffect(() => {
    const t = setTimeout(() => load(search), 300)
    return () => clearTimeout(t)
  }, [search, load])

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Ar tikrai norite ištrinti "${name}"?`)) return
    setDeleting(id)
    try {
      await fetch(`/api/artists/${id}`, { method: 'DELETE' })
      setArtists(prev => prev.filter(a => a.id !== id))
      setTotal(prev => prev - 1)
    } finally {
      setDeleting(null)
    }
  }

  if (status === 'loading' || loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-music-blue border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <Link href="/admin/dashboard" className="text-gray-400 hover:text-white mb-2 inline-block text-sm">
              ← Dashboard
            </Link>
            <h1 className="text-4xl font-black">🎤 Atlikėjai</h1>
            <p className="text-gray-400 mt-1">Iš viso: {total}</p>
          </div>
          <Link href="/admin/artists/new"
            className="px-6 py-3 bg-music-blue hover:bg-blue-600 rounded-xl font-bold transition-colors">
            + Naujas atlikėjas
          </Link>
        </div>

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Ieškoti atlikėjo..."
            className="w-full max-w-md px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-music-blue"
          />
        </div>

        {/* List */}
        {artists.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-16 text-center">
            <div className="text-6xl mb-4">🎤</div>
            <h3 className="text-2xl font-bold mb-2">Nėra atlikėjų</h3>
            <p className="text-gray-400 mb-6">
              {search ? 'Nieko nerasta pagal paiešką' : 'Pridėkite pirmą atlikėją'}
            </p>
            {!search && (
              <Link href="/admin/artists/new"
                className="inline-block px-8 py-3 bg-music-blue rounded-xl font-bold hover:opacity-90">
                + Pridėti atlikėją
              </Link>
            )}
          </div>
        ) : (
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3">Atlikėjas</th>
                  <th className="px-4 py-3">Tipas</th>
                  <th className="px-4 py-3">Šalis</th>
                  <th className="px-4 py-3">Aktyvus</th>
                  <th className="px-4 py-3 text-right">Veiksmai</th>
                </tr>
              </thead>
              <tbody>
                {artists.map(artist => (
                  <tr key={artist.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {artist.cover_image_url ? (
                          <Image src={artist.cover_image_url} alt={artist.name}
                            width={36} height={36} className="rounded-full object-cover" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-music-blue to-music-orange flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                            {artist.name[0]}
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-white flex items-center gap-2">
                            {artist.name}
                            {artist.is_verified && <span className="text-xs text-green-400">✓</span>}
                          </div>
                          <div className="text-xs text-gray-500">ID: {artist.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {artist.type === 'group' ? '🎸 Grupė' : '🎤 Solo'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">{artist.country || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {artist.active_from ? `${artist.active_from}${artist.active_until ? ` – ${artist.active_until}` : ' – dabar'}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
                        <Link href={`/lt/grupe/${artist.slug}/${artist.id}/`}
                          target="_blank"
                          className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs text-gray-400 transition-colors">
                          👁 Peržiūrėti
                        </Link>
                        <Link href={`/admin/artists/${artist.id}`}
                          className="px-3 py-1.5 bg-music-blue/20 hover:bg-music-blue/30 text-music-blue rounded-lg text-xs transition-colors">
                          ✏️ Redaguoti
                        </Link>
                        <button
                          onClick={() => handleDelete(artist.id, artist.name)}
                          disabled={deleting === artist.id}
                          className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-xs transition-colors disabled:opacity-50">
                          {deleting === artist.id ? '...' : '🗑'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
