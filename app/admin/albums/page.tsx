'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

const ALBUM_TYPES = [
  { key: 'type_studio', label: 'Studijinis' },
  { key: 'type_single', label: 'Singlas' },
  { key: 'type_ep', label: 'EP' },
  { key: 'type_compilation', label: 'Kompiliacija' },
  { key: 'type_live', label: 'Gyvas' },
  { key: 'type_remix', label: 'Remix' },
]

function albumType(a: any) {
  for (const t of ALBUM_TYPES) if (a[t.key]) return t.label
  return '–'
}

export default function AdminAlbumsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const artistId = searchParams.get('artist_id')

  const [albums, setAlbums] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [artistName, setArtistName] = useState<string | null>(null)

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  const load = useCallback(async (q = '') => {
    setLoading(true)
    try {
      const url = `/api/albums?search=${encodeURIComponent(q)}&limit=100${artistId ? `&artist_id=${artistId}` : ''}`
      const res = await fetch(url)
      const data = await res.json()
      setAlbums(data.albums || [])
      setTotal(data.total || 0)
    } finally { setLoading(false) }
  }, [artistId])

  useEffect(() => { if (status === 'unauthenticated') router.push('/') }, [status])
  useEffect(() => {
    if (!isAdmin) return
    load()
    if (artistId) {
      fetch(`/api/artists/${artistId}`)
        .then(r => r.json())
        .then(d => { if (d.name) setArtistName(d.name) })
        .catch(() => {})
    }
  }, [isAdmin, artistId])
  useEffect(() => { const t = setTimeout(() => isAdmin && load(search), 300); return () => clearTimeout(t) }, [search])

  const del = async (id: number, title: string) => {
    if (!confirm(`Ištrinti "${title}"?`)) return
    setDeleting(id)
    await fetch(`/api/albums/${id}`, { method: 'DELETE' })
    setAlbums(p => p.filter(a => a.id !== id))
    setDeleting(null)
  }

  if (status === 'loading' || !isAdmin) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            {artistId
              ? <Link href={`/admin/artists/${artistId}`} className="text-music-blue hover:text-music-orange text-sm">← {artistName || 'Atlikėjas'}</Link>
              : <Link href="/admin" className="text-music-blue hover:text-music-orange text-sm">← Admin</Link>
            }
            <h1 className="text-2xl font-black text-gray-900 mt-1">
              💿 {artistName ? `${artistName} — albumai` : 'Albumai'} <span className="text-gray-400 font-normal text-lg">({total})</span>
            </h1>
          </div>
          <Link href={`/admin/albums/new${artistId ? `?artist_id=${artistId}` : ''}`}
            className="px-5 py-2.5 bg-music-blue text-white rounded-xl font-bold hover:opacity-90">
            + Naujas albumas
          </Link>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-4 p-4">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Ieškoti albumų..."
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-music-blue" />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-music-blue border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Albumas</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Atlikėjas</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tipas</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Metai</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Veiksmai</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {albums.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {a.cover_image_url
                          ? <img src={a.cover_image_url} className="w-10 h-10 rounded object-cover" alt="" />
                          : <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center text-lg">💿</div>}
                        <span className="font-medium text-gray-900 text-sm">{a.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{a.artists?.name || '–'}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">{albumType(a)}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{a.year || '–'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Link href={`/admin/albums/${a.id}`}
                          className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium">
                          ✏️ Redaguoti
                        </Link>
                        <button onClick={() => del(a.id, a.title)} disabled={deleting === a.id}
                          className="px-3 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-medium disabled:opacity-50">
                          {deleting === a.id ? '...' : '🗑️'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!albums.length && (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">Albumų nerasta</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
