'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Venue = {
  id: number
  legacy_id: number | null
  slug: string | null
  name: string
  city: string | null
  address: string | null
  phone: string | null
  cover_image_url: string | null
}

export default function AdminVenuesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  const [venues, setVenues] = useState<Venue[]>([])
  const [search, setSearch] = useState('')
  const [cityFilter, setCityFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (status === 'unauthenticated') router.push('/') }, [status, router])
  useEffect(() => { if (isAdmin) load() }, [isAdmin])

  async function load() {
    setLoading(true)
    const r = await fetch('/api/venues')
    const data = await r.json()
    setVenues(data.venues || [])
    setLoading(false)
  }

  async function remove(id: number) {
    if (!confirm('Tikrai ištrinti šią vietą? Renginiai, prie kurių ji buvo priskirta, liks rodomi su grynu vardu.')) return
    await fetch(`/api/venues/${id}`, { method: 'DELETE' })
    setVenues(vs => vs.filter(v => v.id !== id))
  }

  if (status === 'loading' || !isAdmin) return null

  const cities = Array.from(new Set(venues.map(v => v.city).filter(Boolean))) as string[]
  const filtered = venues.filter(v => {
    if (cityFilter !== 'all' && v.city !== cityFilter) return false
    const q = search.toLowerCase()
    if (q && !v.name.toLowerCase().includes(q) && !(v.city || '').toLowerCase().includes(q) && !(v.address || '').toLowerCase().includes(q)) return false
    return true
  })

  return (
    <div className="min-h-screen bg-[var(--bg-elevated)]">
      <div className="bg-[var(--bg-surface)]/95 backdrop-blur border-b border-[var(--input-border)]">
        <div className="flex items-center justify-between gap-2 px-4 py-2">
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/admin" className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]">Admin</Link>
            <span className="text-[var(--text-faint)]">/</span>
            <span className="text-[var(--text-primary)] font-semibold">Vietos</span>
            {!loading && <span className="bg-[var(--bg-elevated)] text-[var(--text-muted)] text-xs font-bold px-1.5 py-0.5 rounded-full ml-1">{venues.length}</span>}
          </nav>
          <Link
            href="/admin/venues/new"
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition-colors"
          >
            + Nauja vieta
          </Link>
        </div>
      </div>

      <div className="px-4 py-4 max-w-5xl mx-auto">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Ieškoti pagal pavadinimą, miestą, adresą…"
            className="flex-1 min-w-[220px] px-3 py-1.5 bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-lg text-sm text-[var(--text-primary)]"
          />
          <select
            value={cityFilter}
            onChange={e => setCityFilter(e.target.value)}
            className="px-3 py-1.5 bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-lg text-sm text-[var(--text-primary)]"
          >
            <option value="all">Visi miestai</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-[var(--text-muted)] text-sm">Kraunu…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-[var(--text-muted)] text-sm">Neturime tinkamų vietų.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-[var(--text-muted)] text-xs uppercase tracking-wide border-b border-[var(--input-border)]">
                <tr>
                  <th className="px-4 py-2">Pavadinimas</th>
                  <th className="px-4 py-2">Miestas</th>
                  <th className="px-4 py-2">Adresas</th>
                  <th className="px-4 py-2 w-32"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(v => (
                  <tr key={v.id} className="border-b border-[var(--input-border)]/60 hover:bg-[var(--bg-hover)]">
                    <td className="px-4 py-2">
                      <Link href={`/admin/venues/${v.id}`} className="text-[var(--text-primary)] font-semibold hover:text-blue-500">
                        {v.name}
                      </Link>
                      {v.legacy_id && (
                        <span className="ml-2 text-[10px] text-[var(--text-faint)]">#{v.legacy_id}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-[var(--text-secondary)]">{v.city || '—'}</td>
                    <td className="px-4 py-2 text-[var(--text-muted)] text-xs">{v.address || '—'}</td>
                    <td className="px-4 py-2 text-right">
                      <Link
                        href={`/admin/venues/${v.id}`}
                        className="text-blue-500 hover:text-blue-600 text-xs font-semibold mr-2"
                      >Redaguoti</Link>
                      <button
                        onClick={() => remove(v.id)}
                        className="text-red-500 hover:text-red-600 text-xs font-semibold"
                      >Ištrinti</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
