'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Event = {
  id: string; title: string; slug: string; start_date: string; city: string | null; status: string; is_featured: boolean
  is_abroad?: boolean; is_festival?: boolean
}

export default function AdminEventsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  const [events, setEvents] = useState<Event[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all') // all | local | abroad | festival
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (status === 'unauthenticated') router.push('/') }, [status])
  useEffect(() => { if (isAdmin) load() }, [isAdmin])

  async function load() {
    setLoading(true)
    // order=desc → naujausi/būsimi renginiai (scrape'inti 2026) viršuje, ne 1997-ųjų.
    const res = await fetch('/api/events?limit=300&showPast=true&order=desc')
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
    if (typeFilter === 'abroad' && !e.is_abroad) return false
    if (typeFilter === 'local' && e.is_abroad) return false
    if (typeFilter === 'festival' && !e.is_festival) return false
    if (search && !e.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const SC: Record<string, string> = { upcoming: 'text-emerald-600 bg-emerald-50', ongoing: 'text-blue-600 bg-blue-50', past: 'text-gray-500 bg-gray-100', cancelled: 'text-red-600 bg-red-50' }
  const SL: Record<string, string> = { all: 'Visi', upcoming: 'Artėjantys', ongoing: 'Vyksta', past: 'Praėję', cancelled: 'Atšaukti' }
  const TL: Record<string, string> = { all: 'Visur', local: 'Lietuvoje', abroad: '🌍 Užsienio', festival: '🎪 Festivaliai' }

  return (
    <div className="min-h-screen bg-[var(--bg-elevated)]">
      {/* Sticky viršutinė juosta */}
      <div className="sticky top-0 z-20 bg-[var(--bg-surface)]/95 backdrop-blur border-b border-[var(--input-border)]">
        <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 max-w-6xl mx-auto">
          <nav className="flex items-center gap-1 text-sm min-w-0">
            <Link href="/admin" className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] hidden sm:inline">Admin</Link>
            <span className="text-[var(--text-faint)] hidden sm:inline">/</span>
            <span className="text-[var(--text-primary)] font-semibold truncate">Renginiai</span>
            {!loading && <span className="bg-[var(--bg-elevated)] text-[var(--text-muted)] text-xs font-bold px-1.5 py-0.5 rounded-full ml-1">{filtered.length}</span>}
          </nav>
          <Link href="/admin/events/new"
            className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition-colors whitespace-nowrap flex-shrink-0">
            <span className="sm:hidden text-base leading-none">+</span><span className="hidden sm:inline">+ Naujas renginys</span>
          </Link>
        </div>
      </div>

      <div className="px-3 sm:px-4 py-4 max-w-6xl mx-auto">
        {/* Paieška */}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ieškoti renginio..."
          className="w-full h-10 rounded-lg px-3.5 text-sm border border-[var(--input-border)] bg-[var(--bg-surface)] focus:outline-none focus:border-blue-300 text-[var(--text-primary)] mb-3" />
        {/* Filtrai — slenkamos juostos mobile */}
        <div className="space-y-2 mb-4">
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
            {Object.keys(SL).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap flex-shrink-0 ${filter === f ? 'bg-blue-600 text-white' : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--input-border)] hover:bg-[var(--bg-hover)]'}`}>
                {SL[f]}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
            {Object.keys(TL).map(f => (
              <button key={f} onClick={() => setTypeFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap flex-shrink-0 ${typeFilter === f ? 'bg-orange-500 text-white' : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--input-border)] hover:bg-[var(--bg-hover)]'}`}>
                {TL[f]}
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
          <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--input-border)] shadow-sm divide-y divide-[var(--border-subtle)] overflow-hidden">
            {filtered.map(ev => (
              <div key={ev.id} className="flex items-center gap-3 px-3 sm:px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors">
                {/* Data */}
                <div className="w-12 sm:w-14 text-center flex-shrink-0">
                  <p className="text-xs font-bold text-[var(--text-primary)] leading-tight">{new Date(ev.start_date).toLocaleDateString('lt-LT', { month: 'short', day: 'numeric' })}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">{new Date(ev.start_date).getFullYear()}</p>
                </div>
                {/* Pavadinimas + meta */}
                <div className="flex-1 min-w-0">
                  <Link href={`/admin/events/${ev.id}`} className="text-sm font-semibold text-[var(--text-primary)] hover:text-blue-600 transition truncate block">
                    {ev.is_abroad && <span title="Verta kelionės (užsienis)" className="mr-1">🌍</span>}
                    {ev.is_festival && <span title="Festivalis" className="mr-1">🎪</span>}
                    {ev.title}
                  </Link>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${SC[ev.status] || 'text-gray-500 bg-gray-100'}`}>{ev.status}</span>
                    <span className="text-xs text-[var(--text-muted)] truncate">{ev.city || '—'}</span>
                  </div>
                </div>
                {/* Veiksmai — visada matomi (mobile draugiška) */}
                <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
                  <button onClick={() => toggleFeatured(ev.id, ev.is_featured)} title="Featured"
                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-base transition ${ev.is_featured ? 'text-orange-400 bg-orange-50' : 'text-gray-300 hover:text-orange-300 hover:bg-[var(--bg-hover)]'}`}>★</button>
                  {ev.status === 'upcoming' && <button onClick={() => setEventStatus(ev.id, 'cancelled')} title="Atšaukti" className="hidden sm:inline-flex text-[11px] font-medium px-2 py-1 rounded-lg text-red-500 hover:bg-red-50 transition">Atšaukti</button>}
                  {ev.status === 'cancelled' && <button onClick={() => setEventStatus(ev.id, 'upcoming')} title="Atkurti" className="hidden sm:inline-flex text-[11px] font-medium px-2 py-1 rounded-lg text-emerald-500 hover:bg-emerald-50 transition">Atkurti</button>}
                  <Link href={`/admin/events/${ev.id}`} title="Redaguoti" className="w-8 h-8 flex items-center justify-center rounded-lg text-blue-500 hover:text-blue-700 hover:bg-blue-50 transition">✎</Link>
                  <button onClick={() => remove(ev.id)} title="Ištrinti" className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
