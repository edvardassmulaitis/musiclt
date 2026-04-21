'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

const TRACK_TYPE_LABELS: Record<string, string> = {
  normal: 'Įprastinė', remix: 'Remix', live: 'Gyva', mashup: 'Mashup', instrumental: 'Instrumentinė'
}

function AdminTracksContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const artistId = searchParams.get('artist_id')

  const [tracks, setTracks] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [artistName, setArtistName] = useState<string | null>(null)
  // Bulk action state — checkbox'ai naudojami merge flow'ui (reikia lygiai 2 pažymėtų dainų).
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const toggleSelected = (id: number) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const clearSelection = () => setSelected(new Set())
  const selectedArr = [...selected]

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  const load = useCallback(async (q = '') => {
    setLoading(true)
    try {
      const url = `/api/tracks?search=${encodeURIComponent(q)}&limit=100${artistId ? `&artist_id=${artistId}` : ''}`
      const res = await fetch(url)
      const data = await res.json()
      setTracks(data.tracks || [])
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
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n })
    setDeleting(null)
  }

  // Selection reset kai keičiasi atlikėjas arba paieškos rezultatai — apsauga,
  // kad nesukeltume merge'o tarp dainų iš skirtingų filtrų
  useEffect(() => { clearSelection() }, [artistId])

  const goMergeSelected = () => {
    if (selectedArr.length !== 2) return
    const [a, b] = selectedArr
    router.push(`/admin/tracks/merge?a=${a}&b=${b}`)
  }

  if (status === 'loading' || !isAdmin) return null

  return (
    <div className="min-h-screen bg-[var(--bg-elevated)]">
      <div className="w-full px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            {artistId
              ? <Link href={`/admin/artists/${artistId}`} className="text-music-blue hover:text-music-orange text-sm">← {artistName || 'Atlikėjas'}</Link>
              : <Link href="/admin" className="text-music-blue hover:text-music-orange text-sm">← Admin</Link>
            }
            <h1 className="text-2xl font-black text-[var(--text-primary)] mt-1">
              🎵 {artistName ? `${artistName} — dainos` : 'Dainos'} <span className="text-[var(--text-muted)] font-normal text-lg">({total})</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/tracks/merge"
              className="px-4 py-2.5 bg-[var(--bg-surface)] border border-[var(--input-border)] text-[var(--text-secondary)] rounded-xl font-medium hover:border-music-blue hover:text-music-blue transition-colors"
              title="Atskiras merge įrankis — paieška dviem dainoms iš bet kur"
            >
              🔀 Sulieti dainas
            </Link>
            <Link href={`/admin/tracks/new${artistId ? `?artist_id=${artistId}` : ''}`}
              className="px-5 py-2.5 bg-music-blue text-white rounded-xl font-bold hover:opacity-90">
              + Nauja daina
            </Link>
          </div>
        </div>

        <div className="bg-[var(--bg-surface)] rounded-xl shadow-sm border border-[var(--input-border)] mb-4 p-4">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Ieškoti dainų pagal pavadinimą..."
            className="w-full px-4 py-2.5 border border-[var(--input-border)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-music-blue" />
        </div>

        <div className="bg-[var(--bg-surface)] rounded-xl shadow-sm border border-[var(--input-border)] overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-music-blue border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-[var(--bg-elevated)] border-b border-[var(--border-subtle)]">
                <tr>
                  <th className="px-3 py-3 w-10">
                    <span className="sr-only">Pažymėti</span>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Daina</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Atlikėjas</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Albumas</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Metai</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Tipas</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Veiksmai</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {tracks.map(t => (
                  <tr
                    key={t.id}
                    className={`group ${selected.has(t.id) ? 'bg-music-blue/5' : 'hover:bg-[var(--bg-hover)]'}`}
                  >
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(t.id)}
                        onChange={() => toggleSelected(t.id)}
                        aria-label={`Pažymėti dainą ${t.title}`}
                        className="w-4 h-4 accent-music-blue cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{t.video_url ? '🎬' : '🎵'}</span>
                        <div>
                          <Link href={`/admin/tracks/${t.id}`}
                            className="font-medium text-[var(--text-primary)] text-sm hover:text-music-blue">
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
                    <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">{t.artists?.name || t.artist_name || '–'}</td>
                    <td className="px-4 py-3 text-sm">
                      {t.albums_list?.length > 0 ? (
                        <div>
                          <Link href={`/admin/albums/${t.albums_list[0].id}`} className="text-music-blue hover:underline text-sm">
                            {t.albums_list[0].title}
                          </Link>
                          {t.albums_list.length > 1 && <span className="text-[var(--text-muted)] text-xs ml-1">+{t.albums_list.length - 1}</span>}
                        </div>
                      ) : <span className="text-[var(--text-muted)]">–</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--text-muted)]">{t.release_year || t.albums_list?.[0]?.year || '–'}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded-full text-xs font-medium">
                        {TRACK_TYPE_LABELS[t.type] || t.type || 'normal'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Link href={`/admin/tracks/${t.id}`}
                          className="px-3 py-1 bg-[var(--bg-elevated)] hover:bg-[var(--bg-active)] text-[var(--text-secondary)] rounded-lg text-xs font-medium transition-colors">
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
                    <td colSpan={7} className="px-4 py-16 text-center text-gray-400">
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

      {/* Bulk action bar — atsiranda kai yra bent 1 pažymėta daina.
          Merge reikalauja lygiai 2 pažymėtų; kitaip mygtukas disabled ir rodo hint'ą. */}
      {selected.size > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--input-border)] bg-[var(--bg-surface)] shadow-[0_-4px_16px_rgba(0,0,0,0.06)]"
          role="region"
          aria-label="Masinių veiksmų juosta"
        >
          <div className="max-w-full px-6 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={clearSelection}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm"
                aria-label="Atšaukti žymėjimą"
              >
                ✕
              </button>
              <span className="text-sm font-medium text-[var(--text-primary)]">
                Pažymėta: {selected.size}
              </span>
              {selected.size !== 2 && (
                <span className="text-xs text-[var(--text-muted)]">
                  (merge'ui reikia lygiai 2)
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={goMergeSelected}
                disabled={selected.size !== 2}
                className="px-4 py-2 bg-music-blue text-white rounded-lg font-semibold text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                title={selected.size === 2 ? 'Pereiti į merge preview' : 'Pažymėk lygiai dvi dainas'}
              >
                🔀 Sulieti pažymėtas ({selected.size})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminTracksPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-music-blue border-t-transparent rounded-full animate-spin" /></div>}>
      <AdminTracksContent />
    </Suspense>
  )
}
