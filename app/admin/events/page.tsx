'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

type Event = {
  id: string; title: string; slug: string; start_date: string; city: string | null; status: string; is_featured: boolean
}

export default function AdminEventsPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

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

  async function setStatus(id: string, status: string) {
    await fetch(`/api/events/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    setEvents(ev => ev.map(e => e.id === id ? { ...e, status } : e))
  }

  async function remove(id: string) {
    if (!confirm('Tikrai ištrinti?')) return
    await fetch(`/api/events/${id}`, { method: 'DELETE' })
    setEvents(ev => ev.filter(e => e.id !== id))
  }

  const filtered = events.filter(e => {
    if (filter !== 'all' && e.status !== filter) return false
    if (search && !e.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const statusColors: Record<string, string> = {
    upcoming: '#10b981', ongoing: '#3b82f6', past: '#4a6580', cancelled: '#ef4444',
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black" style={{ color: '#f2f4f8' }}>Renginiai</h1>
        <Link href="/admin/events/new"
          className="px-4 py-2 rounded-full text-xs font-bold bg-orange-500 hover:bg-orange-400 text-white transition">
          + Naujas renginys
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ieškoti..."
          className="h-9 rounded-lg px-3 text-sm flex-1 max-w-xs focus:outline-none"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#c8d8f0' }} />
        {['all', 'upcoming', 'ongoing', 'past', 'cancelled'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${filter === s ? 'bg-[#1d4ed8] text-white' : 'text-[#5e7290]'}`}>
            {s === 'all' ? 'Visi' : s}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm py-10 text-center" style={{ color: '#334058' }}>Kraunasi...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm py-10 text-center" style={{ color: '#334058' }}>Renginių nerasta</p>
      ) : (
        <div className="space-y-1">
          {filtered.map(ev => (
            <div key={ev.id} className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all hover:bg-white/[.03]"
              style={{ border: '1px solid rgba(255,255,255,0.05)' }}>

              <div className="w-16 text-center flex-shrink-0">
                <p className="text-xs font-bold" style={{ color: '#c8d8f0' }}>
                  {new Date(ev.start_date).toLocaleDateString('lt-LT', { month: 'short', day: 'numeric' })}
                </p>
              </div>

              <div className="flex-1 min-w-0">
                <Link href={`/admin/events/${ev.id}`} className="text-sm font-semibold hover:text-blue-300 transition truncate block" style={{ color: '#dde8f8' }}>
                  {ev.title}
                </Link>
                <p className="text-[11px]" style={{ color: '#3d5878' }}>{ev.city || '—'}</p>
              </div>

              <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ color: statusColors[ev.status] || '#999', background: `${statusColors[ev.status] || '#999'}15`, border: `1px solid ${statusColors[ev.status] || '#999'}30` }}>
                {ev.status}
              </span>

              <button onClick={() => toggleFeatured(ev.id, ev.is_featured)} title="Featured"
                className={`text-sm ${ev.is_featured ? 'text-orange-400' : 'text-[#1e2e42]'} hover:text-orange-300 transition`}>★</button>

              <div className="flex gap-1">
                {ev.status === 'upcoming' && (
                  <button onClick={() => setStatus(ev.id, 'cancelled')} className="text-[10px] font-bold px-2 py-1 rounded text-red-400 hover:bg-red-900/20 transition">Atšaukti</button>
                )}
                {ev.status === 'cancelled' && (
                  <button onClick={() => setStatus(ev.id, 'upcoming')} className="text-[10px] font-bold px-2 py-1 rounded text-emerald-400 hover:bg-emerald-900/20 transition">Atkurti</button>
                )}
              </div>

              <Link href={`/admin/events/${ev.id}`} className="text-xs font-bold px-2 py-1 rounded hover:bg-white/[.06] transition" style={{ color: '#4a6fa5' }}>Edit</Link>
              <button onClick={() => remove(ev.id)} className="text-xs font-bold px-2 py-1 rounded text-red-400/50 hover:text-red-400 hover:bg-red-900/20 transition">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
