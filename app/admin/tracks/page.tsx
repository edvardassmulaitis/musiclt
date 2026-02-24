'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const TRACK_TYPE_LABELS: Record<string, string> = {
  normal: 'Įprastinė', remix: 'Remix', live: 'Gyva', mashup: 'Mashup', instrumental: 'Instrumentinė'
}

export default function AdminTracksPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [tracks, setTracks] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<number | null>(null)

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  const load = useCallback(async (q = '') => {
    setLoading(true)
    try {
      const res = await fetch(`/api/tracks?search=${encodeURIComponent(q)}&limit=100`)
      const data = await res.json()
      setTracks(data.tracks || [])
      setTotal(data.total || 0)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { if (status === 'unauthenticated') router.push('/') }, [status])
  useEffect(() => { if (isAdmin) load() }, [isAdmin])
  useEffect(() => {
    const t = setTimeout(() => isAdmin && load(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const del = async (id: number, title: string) => {
    if (!confirm(`Ištrinti "${title}"?`)) return
    setDeleting(id)
    await fetch(`/api/tracks/${id}`, { method: 'DELETE' })
    setTracks(p => p.filter(t => t.id !== id))
    setTotal(p => p - 1)
    setDeleting(null)
  }

  if (status === 'loading' || !isAdmin) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/admin" className="text-music-blue hover:text-music-orange text-sm">← Admin</Link>
            <h1 className="text-2xl font-black text-gray-900 mt-1">
              🎵 Dainos <span className="text-gray-400 font-normal text-lg">({total})</span>
            </h1>
          </div>
          <Link href="/admin/tracks/new"
            className="px-5 py-2.5 bg-music-blue text-white rounded-xl font-bold hover:opacity-90">
            + Nauja daina
          </Link>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-4 p-4">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Ieškoti dainų pagal pavadinimą..."
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-music-blue" />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-music-blue border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Daina</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Atlikėjas</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Albumas</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Metai</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipas</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Veiksmai</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {tracks.map(t => (
                  <tr key={t.id} className="hover:bg-gray-50 group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{t.video_url ? '🎬' : '🎵'}</span>
                        <div>
                          <Link href={`/admin/tracks/${t.id}`}
                            className="font-medium text-gray-900 text-sm hover:text-music-blue">
                            {t.title}
                          </Link>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {t.is_new && <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">NEW</span>}
                            {t.featuring_count > 0 && <span className="text-xs text-purple-500">feat. ({t.featuring_count})</span>}
                            {!t.video_url && <span className="text-xs text-amber-500">▷ nėra video</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {t.artists?.name || '–'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {t.albums_list?.length > 0 ? (
                        <div>
                          <Link href={`/admin/albums/${t.albums_list[0].id}`}
                            className="text-music-blue hover:underline text-sm">
                            {t.albums_list[0].title}
                          </Link>
                          {t.albums_list.length > 1 && (
                            <span className="text-gray-400 text-xs ml-1">+{t.albums_list.length - 1}</span>
                          )}
                        </div>
                      ) : <span className="text-gray-400">–</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {t.release_year || t.albums_list?.[0]?.year || '–'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded-full text-xs font-medium">
                        {TRACK_TYPE_LABELS[t.type] || t.type || 'normal'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Link href={`/admin/tracks/${t.id}`}
                          className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition-colors">
                          ✏️ Redaguoti
                        </Link>
                        <button onClick={() => del(t.id, t.title)} disabled={deleting === t.id}
                          className="px-3 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-medium disabled:opacity-50">
                          {deleting === t.id ? '...' : '🗑️'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!tracks.length && (
                  <tr>
                    <td colSpan={6} className="px-4 py-16 text-center text-gray-400">
                      <div className="text-4xl mb-3">🎵</div>
                      <div className="font-medium">Dainų nerasta</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
