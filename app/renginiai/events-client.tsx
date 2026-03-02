'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSite } from '@/components/SiteContext'

type EventArtist = {
  artist_id: number
  is_headliner: boolean
  sort_order: number
  artists: { id: number; name: string; slug: string; cover_image_url: string | null } | { id: number; name: string; slug: string; cover_image_url: string | null }[]
}

type Event = {
  id: string
  title: string
  slug: string
  description: string | null
  start_date: string
  end_date: string | null
  venue_name: string | null
  city: string | null
  cover_image_url: string | null
  ticket_url: string | null
  price_from: number | null
  price_to: number | null
  status: string
  is_featured: boolean
  event_artists: EventArtist[]
}

function getArtist(ea: EventArtist) {
  return Array.isArray(ea.artists) ? ea.artists[0] : ea.artists
}

function formatDate(d: string) {
  const date = new Date(d)
  return date.toLocaleDateString('lt-LT', { month: 'short', day: 'numeric' })
}

function formatDay(d: string) {
  return new Date(d).getDate().toString().padStart(2, '0')
}

function formatMonth(d: string) {
  return new Date(d).toLocaleDateString('lt-LT', { month: 'short' }).toUpperCase().replace('.', '')
}

function formatWeekday(d: string) {
  return new Date(d).toLocaleDateString('lt-LT', { weekday: 'short' })
}

function formatPrice(from: number | null, to: number | null) {
  if (!from && !to) return null
  if (from && to && from !== to) return `${from}–${to} €`
  return `${from || to} €`
}

const PERIODS = [
  { k: 'all', l: 'Visi' },
  { k: 'week', l: 'Šią savaitę' },
  { k: 'month', l: 'Šį mėnesį' },
]

export default function EventsClient({ events, featured, cities, total, initialCity, initialPeriod, showPast }: {
  events: Event[]
  featured: Event[]
  cities: string[]
  total: number
  initialCity: string
  initialPeriod: string
  showPast: boolean
}) {
  const { dk } = useSite()
  const router = useRouter()
  const [city, setCity] = useState(initialCity)
  const [period, setPeriod] = useState(initialPeriod)
  const [past, setPast] = useState(showPast)

  const allCities = ['Visi', ...cities]

  function applyFilters(c: string, p: string, sp: boolean) {
    const params = new URLSearchParams()
    if (c !== 'Visi') params.set('city', c)
    if (p !== 'all') params.set('period', p)
    if (sp) params.set('showPast', 'true')
    router.push(`/renginiai?${params.toString()}`)
  }

  const CS = dk
    ? { background: 'rgba(255,255,255,0.028)', border: '1px solid rgba(255,255,255,0.075)' }
    : { background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(0,0,0,0.09)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }

  const pillActive = 'bg-[#1d4ed8] text-white shadow-md shadow-blue-900/50'
  const pillInactive = 'text-[#7a90b0] border border-white/[0.08] hover:text-[#e2e8f0] hover:border-white/[0.16]'

  return (
    <div className="max-w-[1360px] mx-auto px-5 lg:px-8 py-10">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight mb-2" style={{ color: dk ? '#f2f4f8' : '#0f1a2e' }}>Renginiai</h1>
        <p className="text-sm" style={{ color: dk ? '#4a6580' : '#6a85a8' }}>
          Artimiausi koncertai, festivaliai ir muzikos renginiai Lietuvoje
        </p>
      </div>

      {/* Featured */}
      {featured.length > 0 && (
        <div className="mb-10">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] mb-3" style={{ color: dk ? '#3d5878' : '#6a85a8' }}>Išskirtiniai renginiai</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {featured.map(ev => (
              <Link key={ev.id} href={`/renginiai/${ev.slug}`}
                className="group rounded-2xl overflow-hidden relative transition-transform hover:scale-[1.01]"
                style={{ background: 'linear-gradient(135deg, rgba(29,78,216,0.15), rgba(249,115,22,0.08))', border: '1px solid rgba(29,78,216,0.2)' }}>
                {ev.cover_image_url ? (
                  <div className="h-40 overflow-hidden">
                    <img src={ev.cover_image_url} alt={ev.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute inset-0" style={{ background: 'linear-gradient(transparent 40%, rgba(0,0,0,0.8))' }} />
                  </div>
                ) : (
                  <div className="h-40 flex items-center justify-center text-5xl" style={{ color: 'rgba(255,255,255,0.06)' }}>🎤</div>
                )}
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-orange-500 text-white">★ Featured</span>
                    <span className="text-[10px] font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>{formatDate(ev.start_date)} · {ev.city}</span>
                  </div>
                  <h3 className="text-base font-black leading-tight" style={{ color: '#f2f4f8' }}>{ev.title}</h3>
                  <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{ev.venue_name}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Cities */}
        <div className="flex gap-1.5 flex-wrap">
          {allCities.map(c => (
            <button key={c} onClick={() => { setCity(c); applyFilters(c, period, past) }}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${city === c ? pillActive : pillInactive}`}>
              {c}
            </button>
          ))}
        </div>

        <div className="w-px h-6" style={{ background: 'rgba(255,255,255,0.08)' }} />

        {/* Period */}
        <div className="flex gap-1.5">
          {PERIODS.map(p => (
            <button key={p.k} onClick={() => { setPeriod(p.k); applyFilters(city, p.k, past) }}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${period === p.k ? pillActive : pillInactive}`}>
              {p.l}
            </button>
          ))}
        </div>

        <div className="w-px h-6" style={{ background: 'rgba(255,255,255,0.08)' }} />

        {/* Past toggle */}
        <button onClick={() => { setPast(!past); applyFilters(city, period, !past) }}
          className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${past ? pillActive : pillInactive}`}>
          Archyvas
        </button>

        <span className="ml-auto text-xs" style={{ color: '#334058' }}>{total} renginių</span>
      </div>

      {/* Events list */}
      {events.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-5xl mb-4">🎤</p>
          <p className="text-lg font-bold mb-2" style={{ color: dk ? '#c8d8f0' : '#0f1a2e' }}>Renginių kol kas nėra</p>
          <p className="text-sm" style={{ color: '#4a6580' }}>Greitai čia atsiras koncertų ir festivalių informacija!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map(ev => {
            const headliners = ev.event_artists?.filter(ea => ea.is_headliner).map(ea => getArtist(ea)) || []
            const others = ev.event_artists?.filter(ea => !ea.is_headliner).map(ea => getArtist(ea)) || []
            const price = formatPrice(ev.price_from, ev.price_to)
            const isPast = ev.status === 'past'
            const isCancelled = ev.status === 'cancelled'

            return (
              <Link key={ev.id} href={`/renginiai/${ev.slug}`}
                className={`flex items-center gap-4 px-4 py-4 rounded-xl cursor-pointer group transition-all ${isPast ? 'opacity-50' : ''}`}
                style={CS}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = dk ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.2)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = dk ? 'rgba(255,255,255,0.075)' : 'rgba(0,0,0,0.09)' }}>

                {/* Date block */}
                <div className="text-center w-12 flex-shrink-0">
                  <p className="text-xl font-black leading-none" style={{ color: isCancelled ? '#ef4444' : (dk ? '#f2f4f8' : '#0f1a2e') }}>{formatDay(ev.start_date)}</p>
                  <p className="text-[9px] font-black uppercase tracking-wide text-orange-400">{formatMonth(ev.start_date)}</p>
                  <p className="text-[9px] mt-0.5" style={{ color: '#334058' }}>{formatWeekday(ev.start_date)}</p>
                </div>

                {/* Cover thumb */}
                {ev.cover_image_url && (
                  <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0">
                    <img src={ev.cover_image_url} alt="" className="w-full h-full object-cover" />
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    {isCancelled && <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">ATŠAUKTAS</span>}
                    {ev.is_featured && !isCancelled && <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">★</span>}
                  </div>
                  <p className={`text-sm font-semibold truncate group-hover:text-blue-300 transition-colors ${isCancelled ? 'line-through' : ''}`}
                    style={{ color: dk ? '#dde8f8' : '#0f1a2e' }}>
                    {ev.title}
                  </p>
                  <p className="text-xs truncate" style={{ color: '#3d5878' }}>
                    {ev.venue_name}{ev.city ? ` · ${ev.city}` : ''}
                  </p>
                  {headliners.length > 0 && (
                    <p className="text-[11px] mt-0.5 truncate" style={{ color: '#4a6580' }}>
                      {headliners.map(a => a?.name).filter(Boolean).join(', ')}
                      {others.length > 0 && ` +${others.length}`}
                    </p>
                  )}
                </div>

                {/* Price / ticket */}
                <div className="flex-shrink-0 text-right">
                  {price && <p className="text-xs font-bold mb-1" style={{ color: dk ? '#c8d8f0' : '#0f1a2e' }}>{price}</p>}
                  {ev.ticket_url && !isPast && !isCancelled && (
                    <span className="text-xs font-bold text-orange-400">Bilietai →</span>
                  )}
                  {isPast && <span className="text-[10px]" style={{ color: '#2a3a50' }}>Praėjęs</span>}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
