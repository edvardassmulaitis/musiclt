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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <Link href="/admin" className="text-sm text-gray-400 hover:text-gray-600 transition-colors mb-2 inline-block">
              ← Admin
            </Link>
            <h1 className="text-2xl font-black text-gray-900">🎤 Atlikėjai</h1>
            <p className="text-sm text-gray-400 mt-0.5">Iš viso: {total}</p>
          </div>
          <Link href="/admin/artists/new"
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-colors">
            + Naujas atlikėjas
          </Link>
        </div>

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Ieškoti atlikėjo..."
            className="w-full max-w-sm px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-400 text-sm"
          />
        </div>

        {/* List */}
        {artists.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center">
            <div className="text-5xl mb-4">🎤</div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">Nėra atlikėjų</h3>
            <p className="text-gray-400 mb-6">
              {search ? 'Nieko nerasta pagal paiešką' : 'Pridėkite pirmą atlikėją'}
            </p>
            {!search && (
              <Link href="/admin/artists/new"
                className="inline-block px-6 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors">
                + Pridėti atlikėją
              </Link>
            )}
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Atlikėjas</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Tipas</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Šalis</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Aktyvus</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">Veiksmai</th>
                </tr>
              </thead>
              <tbody>
                {artists.map(artist => (
                  <tr key={artist.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {artist.cover_image_url ? (
                          <Image src={artist.cover_image_url} alt={artist.name}
                            width={34} height={34} className="rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-[34px] h-[34px] rounded-full bg-gradient-to-br from-blue-500 to-orange-400 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                            {artist.name[0]}
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
                            {artist.name}
                            {artist.is_verified && <span className="text-xs text-green-500">✓</span>}
                          </div>
                          <div className="text-xs text-gray-400">ID: {artist.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {artist.type === 'group' ? '🎸 Grupė' : '🎤 Solo'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{artist.country || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {artist.active_from
                        ? `${artist.active_from}${artist.active_until ? ` – ${artist.active_until}` : ' – dabar'}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5 justify-end">
                        <Link href={`/lt/grupe/${artist.slug}/${artist.id}/`}
                          target="_blank"
                          className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs text-gray-500 transition-colors">
                          👁 Peržiūrėti
                        </Link>
                        <Link href={`/admin/artists/${artist.id}`}
                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs transition-colors">
                          ✏️ Redaguoti
                        </Link>
                        <button
                          onClick={() => handleDelete(artist.id, artist.name)}
                          disabled={deleting === artist.id}
                          className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg text-xs transition-colors disabled:opacity-50">
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
