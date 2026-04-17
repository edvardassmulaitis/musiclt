'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
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
  is_active?: boolean
}

type ConfirmMode = 'deactivate' | 'delete_permanent'

export default function ArtistsAdmin() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [artists, setArtists] = useState<Artist[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [confirmMode, setConfirmMode] = useState<ConfirmMode>('deactivate')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'
  const isSuperAdmin = session?.user?.role === 'super_admin'

  const load = useCallback(async (q: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/artists?limit=100&search=${encodeURIComponent(q)}&includeInactive=true`)
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
    if (status === 'authenticated') load('')
  }, [status, isAdmin, router, load])

  const handleSearch = (value: string) => {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => load(value), 500)
  }

  const handleDeactivate = async (id: number) => {
    setDeleting(id); setConfirmId(null)
    try {
      await fetch(`/api/artists/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      })
      setArtists(prev => prev.map(a => a.id === id ? { ...a, is_active: false } : a))
    } finally { setDeleting(null) }
  }

  const handleRestore = async (id: number) => {
    try {
      await fetch(`/api/artists/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: true }),
      })
      setArtists(prev => prev.map(a => a.id === id ? { ...a, is_active: true } : a))
    } catch {}
  }

  const handleDeletePermanent = async (id: number) => {
    setDeleting(id); setConfirmId(null)
    try {
      const res = await fetch(`/api/artists/${id}`, { method: 'DELETE' })
      if (res.ok) { setArtists(prev => prev.filter(a => a.id !== id)); setTotal(prev => prev - 1) }
    } finally { setDeleting(null) }
  }

  const openConfirm = (id: number, mode: ConfirmMode) => { setConfirmId(id); setConfirmMode(mode) }
  const handleConfirm = () => {
    if (confirmId === null) return
    if (confirmMode === 'delete_permanent') handleDeletePermanent(confirmId)
    else handleDeactivate(confirmId)
  }

  if (status === 'loading') return (
    <div className="min-h-screen bg-[var(--bg-elevated)] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const confirmArtist = artists.find(a => a.id === confirmId)

  return (
    <div className="min-h-screen bg-[var(--bg-elevated)]">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-[var(--bg-surface)] border-b border-[var(--input-border)] px-4 sm:px-6 py-2.5">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm shrink-0">
            <Link href="/admin" className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">Admin</Link>
            <span className="text-[var(--text-faint)]">/</span>
            <span className="text-[var(--text-primary)] font-semibold">Atlikėjai</span>
            {!loading && <><span className="text-[var(--text-faint)]">/</span><span className="text-[var(--text-muted)]">{total}</span></>}
          </div>
          <div className="flex-1 max-w-sm ml-4">
            <input type="text" value={search} onChange={e => handleSearch(e.target.value)}
              placeholder="Ieškoti..."
              className="w-full px-3 py-1.5 bg-[var(--bg-elevated)] border border-[var(--input-border)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-blue-400 text-sm" />
          </div>
          <div className="ml-auto">
            <Link href="/admin/artists/new"
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-sm transition-colors whitespace-nowrap">
              + Naujas
            </Link>
          </div>
        </div>
      </div>

      {/* Confirm modal */}
      {confirmId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setConfirmId(null)}>
          <div className="bg-[var(--bg-surface)] rounded-2xl p-6 max-w-sm w-full shadow-[var(--modal-shadow)]" onClick={e => e.stopPropagation()}>
            {confirmMode === 'delete_permanent' ? (
              <>
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">⚠️</div>
                <h3 className="font-bold text-[var(--text-primary)] text-lg mb-1 text-center">Ištrinti visam laikui?</h3>
                <p className="text-sm font-semibold text-[var(--text-primary)] mb-1 text-center">{confirmArtist?.name}</p>
                <p className="text-sm text-red-500 mb-5 text-center">Veiksmo negalima atšaukti.</p>
                <div className="flex gap-3">
                  <button onClick={() => setConfirmId(null)}
                    className="flex-1 px-4 py-2.5 bg-[var(--bg-elevated)] hover:bg-[var(--bg-active)] text-[var(--text-secondary)] rounded-xl text-sm font-semibold transition-colors">
                    Atšaukti
                  </button>
                  <button onClick={handleConfirm}
                    className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-colors">
                    Ištrinti
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="font-bold text-[var(--text-primary)] text-lg mb-2">Deaktyvuoti atlikėją?</h3>
                <p className="text-sm text-[var(--text-muted)] mb-5">Bus paslėptas iš svetainės, bet liks duomenų bazėje.</p>
                <div className="flex gap-3">
                  <button onClick={() => setConfirmId(null)}
                    className="flex-1 px-4 py-2.5 bg-[var(--bg-elevated)] hover:bg-[var(--bg-active)] text-[var(--text-secondary)] rounded-xl text-sm font-semibold transition-colors">
                    Atšaukti
                  </button>
                  <button onClick={handleConfirm}
                    className="flex-1 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-semibold transition-colors">
                    Deaktyvuoti
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : artists.length === 0 ? (
          <div className="bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-2xl p-14 text-center">
            <div className="text-5xl mb-4">🎤</div>
            <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">Nėra atlikėjų</h3>
            <p className="text-[var(--text-muted)] mb-6 text-sm">{search ? 'Nieko nerasta' : 'Pridėkite pirmą atlikėją'}</p>
            {!search && (
              <Link href="/admin/artists/new"
                className="inline-block px-6 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors">
                + Pridėti atlikėją
              </Link>
            )}
          </div>
        ) : (
          <div className="bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Atlikėjas</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide hidden sm:table-cell">Tipas</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide hidden md:table-cell">Šalis</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide hidden md:table-cell">Aktyvus</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Veiksmai</th>
                </tr>
              </thead>
              <tbody>
                {artists.map(artist => (
                  <tr key={artist.id}
                    className={`border-b border-[var(--border-subtle)] transition-colors ${artist.is_active === false ? 'opacity-50 bg-red-50/30' : 'hover:bg-[var(--bg-hover)]'}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {artist.cover_image_url ? (
                          <Image src={artist.cover_image_url} alt={artist.name} width={34} height={34}
                            className="rounded-full object-cover flex-shrink-0" unoptimized />
                        ) : (
                          <div className="w-[34px] h-[34px] rounded-full bg-gradient-to-br from-blue-500 to-orange-400 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                            {artist.name[0]}
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Link href={`/admin/artists/${artist.id}`}
                              className="font-semibold text-[var(--text-primary)] text-sm hover:text-blue-600 transition-colors">
                              {artist.name}
                            </Link>
                            {artist.is_verified && <span className="text-xs text-green-500">✓</span>}
                            {artist.is_active === false && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-500 rounded-full font-semibold">neaktyvus</span>
                            )}
                          </div>
                          <div className="text-xs text-[var(--text-muted)] sm:hidden mt-0.5">
                            {artist.type === 'group' ? 'Grupė' : 'Solo'}{artist.country ? ` · ${artist.country}` : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--text-secondary)] hidden sm:table-cell">
                      {artist.type === 'group' ? '🎸 Grupė' : '🎤 Solo'}
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--text-secondary)] hidden md:table-cell">{artist.country || '—'}</td>
                    <td className="px-4 py-3 text-sm text-[var(--text-secondary)] hidden md:table-cell">
                      {artist.active_from
                        ? `${artist.active_from}${artist.active_until ? ` – ${artist.active_until}` : ' – dabar'}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5 justify-end">
                        <Link href={`/atlikejai/${artist.slug}`} target="_blank" title="Žiūrėti"
                          className="px-2.5 py-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--bg-active)] rounded-lg text-xs text-[var(--text-secondary)] transition-colors flex items-center">
                          👁
                        </Link>
                        <Link href={`/admin/artists/${artist.id}`} title="Redaguoti"
                          className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs transition-colors flex items-center">
                          ✏️
                        </Link>
                        {artist.is_active === false ? (
                          <button onClick={() => handleRestore(artist.id)} title="Atkurti"
                            className="px-2.5 py-1.5 bg-green-50 hover:bg-green-100 text-green-600 rounded-lg text-xs transition-colors">
                            ↩
                          </button>
                        ) : (
                          <button onClick={() => openConfirm(artist.id, 'deactivate')}
                            disabled={deleting === artist.id} title="Paslėpti"
                            className="px-2.5 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-500 rounded-lg text-xs transition-colors disabled:opacity-50">
                            {deleting === artist.id ? '...' : '🙈'}
                          </button>
                        )}
                        {isSuperAdmin && (
                          <button onClick={() => openConfirm(artist.id, 'delete_permanent')}
                            disabled={deleting === artist.id} title="Ištrinti visam laikui"
                            className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg text-xs transition-colors disabled:opacity-50">
                            {deleting === artist.id ? '...' : '🗑'}
                          </button>
                        )}
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
