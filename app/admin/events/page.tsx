'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Event = {
  id: string; title: string; slug: string; start_date: string; city: string | null; status: string; is_featured: boolean
}

export default function AdminEventsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  const [events, setEvents] = useState<Event[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (status === 'unauthenticated') router.push('/') }, [status])
  useEffect(() => { if (isAdmin) load() }, [isAdmin])

  async function load() {
    setLoading(true)
    const res = await fetch('/api/events?limit=100&showPast=true')
    const data = await res.json()
    setEvents(data.events || [])
    setLoading(false)
  }

  async function toggleFeatured(id: string, current: boolean) {
    await fetch(`/api/events/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_featured: !current }) })
    setEvents(ev => ev.map(e => e.id === id ? { ...e, is_featured: !current } : e))
  }

  async function setEventStatus(id: string, s: string) {
    await fetch(`/api/events/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: s }) })
    setEvents(ev => ev.map(e => e.id === id ? { ...e, status: s } : e))
  }

  async function remove(id: string) {
    if (!confirm('Tikrai ištrinti šį renginį?')) return
    await fetch(`/api/events/${id}`, { method: 'DELETE' })
    setEvents(ev => ev.filter(e => e.id !== id))
  }

  if (status === 'loading' || !isAdmin) return null

  const filtered = events.filter(e => {
    if (filter !== 'all' && e.status !== filter) return false
    if (search && !e.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const SC: Record<string, string> = { upcoming: 'text-emerald-600 bg-emerald-50', ongoing: 'text-blue-600 bg-blue-50', past: 'text-gray-500 bg-gray-100', cancelled: 'text-red-600 bg-red-50' }
  const SL: Record<string, string> = { all: 'Visi', upcoming: 'Artėjantys', ongoing: 'Vyksta', past: 'Praėję', cancelled: 'Atšaukti' }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Breadcrumb bar — same style as artist edit */}
      <div className="bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="flex items-center justify-between gap-2 px-4 py-2">
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/admin" className="text-gray-400 hover:text-gray-700">Admin</Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-800 font-semibold">Renginiai</span>
            {!loading && <span className="bg-gray-100 text-gray-500 text-xs font-bold px-1.5 py-0.5 rounded-full ml-1">{events.length}</span>}
          </nav>
          <Link href="/admin/events/new"
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition-colors">
            + Naujas renginys
          </Link>
        </div>
      </div>

      <div className="px-4 py-4 max-w-5xl mx-auto">
        {/* Filters */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ieškoti..."
            className="h-8 rounded-lg px-3 text-sm border border-gray-200 bg-white focus:outline-none focus:border-blue-300 text-gray-700 w-48" />
          <div className="flex gap-1">
            {Object.keys(SL).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${filter === f ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                {SL[f]}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-gray-400 mb-2">Renginių nerasta</p>
            <Link href="/admin/events/new" className="text-sm text-blue-500 hover:underline">+ Sukurti pirmą renginį</Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-100 overflow-hidden">
            {filtered.map(ev => (
              <div key={ev.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors group">
                <div className="w-14 text-center flex-shrink-0">
                  <p className="text-xs font-semibold text-gray-700">{new Date(ev.start_date).toLocaleDateString('lt-LT', { month: 'short', day: 'numeric' })}</p>
                  <p className="text-[10px] text-gray-400">{new Date(ev.start_date).getFullYear()}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <Link href={`/admin/events/${ev.id}`} className="text-sm font-semibold text-gray-800 hover:text-blue-600 transition truncate block">{ev.title}</Link>
                  <p className="text-xs text-gray-400">{ev.city || '—'}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${SC[ev.status] || 'text-gray-500 bg-gray-100'}`}>{ev.status}</span>
                <button onClick={() => toggleFeatured(ev.id, ev.is_featured)} title="Featured"
                  className={`text-sm flex-shrink-0 transition ${ev.is_featured ? 'text-orange-400' : 'text-gray-200 hover:text-orange-300'}`}>★</button>
                <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition">
                  {ev.status === 'upcoming' && <button onClick={() => setEventStatus(ev.id, 'cancelled')} className="text-[10px] font-medium px-2 py-0.5 rounded text-red-500 hover:bg-red-50 transition">Atšaukti</button>}
                  {ev.status === 'cancelled' && <button onClick={() => setEventStatus(ev.id, 'upcoming')} className="text-[10px] font-medium px-2 py-0.5 rounded text-emerald-500 hover:bg-emerald-50 transition">Atkurti</button>}
                  <Link href={`/admin/events/${ev.id}`} className="px-2 py-1 text-xs text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors font-medium">Redaguoti ↗</Link>
                  <button onClick={() => remove(ev.id)} className="text-xs px-1.5 py-0.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
