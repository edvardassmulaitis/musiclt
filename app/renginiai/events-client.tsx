'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useSite } from '@/components/SiteContext'

/* ────────────────────────────────────────────────────────────────
 * Tipai
 * ──────────────────────────────────────────────────────────────── */
type Artist = { id: number; name: string; slug: string; cover_image_url: string | null; country?: string | null }
type EventArtist = { artist_id: number; is_headliner: boolean; sort_order: number; artists: Artist | Artist[] }

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
  is_festival?: boolean
  genres?: string[]
  event_artists: EventArtist[]
}

/* ────────────────────────────────────────────────────────────────
 * Pagalbinės funkcijos
 * ──────────────────────────────────────────────────────────────── */
function getArtist(ea: EventArtist): Artist | undefined {
  return Array.isArray(ea.artists) ? ea.artists[0] : ea.artists
}

const MONTHS_SHORT = ['saus', 'vas', 'kov', 'bal', 'geg', 'birž', 'liep', 'rugp', 'rugs', 'spal', 'lapkr', 'gruod']
const MONTHS_FULL = ['Sausis', 'Vasaris', 'Kovas', 'Balandis', 'Gegužė', 'Birželis', 'Liepa', 'Rugpjūtis', 'Rugsėjis', 'Spalis', 'Lapkritis', 'Gruodis']
const WEEKDAYS = ['Pr', 'An', 'Tr', 'Kt', 'Pn', 'Št', 'Sk']

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
function ymKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}` }

function fmtDay(d: string) { return new Date(d).getDate().toString().padStart(2, '0') }
function fmtMonth(d: string) { return MONTHS_SHORT[new Date(d).getMonth()].toUpperCase() }
function fmtWeekday(d: string) { return new Date(d).toLocaleDateString('lt-LT', { weekday: 'short' }).replace('.', '') }
function fmtShort(d: Date) { return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}` }
function fmtTime(d: string) {
  const dt = new Date(d)
  if (dt.getHours() === 0 && dt.getMinutes() === 0) return null
  return dt.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' })
}

function formatPrice(from: number | null, to: number | null) {
  if (from === 0 && !to) return 'Nemokama'
  if (!from && !to) return null
  if (from && to && from !== to) return `${from}–${to} €`
  return `${from || to} €`
}

/* Renginio LT/užsienio klasifikacija pagal atlikėjų šalis. */
function eventCountries(ev: Event): { hasLt: boolean; hasForeign: boolean } {
  let hasLt = false, hasForeign = false
  for (const ea of ev.event_artists || []) {
    const c = getArtist(ea)?.country
    if (c === 'Lietuva') hasLt = true
    else if (c) hasForeign = true
  }
  return { hasLt, hasForeign }
}

/* Kainos kibiras pagal pradinę kainą. */
function priceBucket(ev: Event): 'free' | 'lt30' | 'mid' | 'gt60' | 'unknown' {
  const p = ev.price_from
  if (p === 0) return 'free'
  if (p == null) return 'unknown'
  if (p < 30) return 'lt30'
  if (p <= 60) return 'mid'
  return 'gt60'
}

/* ────────────────────────────────────────────────────────────────
 * Mažos ikonos
 * ──────────────────────────────────────────────────────────────── */
const Icon = {
  calendar: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
  pin: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  globe: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z"/></svg>,
  euro: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 7a6 6 0 1 0 0 10M4 11h8M4 14h7"/></svg>,
  note: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
  tent: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 21 14 3M21 21 10.5 3M12 13.5 21 21M12 13.5 3 21M2 21h20"/></svg>,
  chevron: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>,
  dots: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>,
  x: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>,
  arrowL: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>,
  arrowR: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>,
}

/* ────────────────────────────────────────────────────────────────
 * Popover — trigeris + absoliutus skydelis, užsidaro paspaudus už ribų
 * ──────────────────────────────────────────────────────────────── */
function Popover({ id, openId, setOpenId, trigger, children, align = 'left', width }: {
  id: string
  openId: string | null
  setOpenId: (v: string | null) => void
  trigger: (open: boolean) => React.ReactNode
  children: React.ReactNode
  align?: 'left' | 'right'
  width?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const open = openId === id
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpenId(null) }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setOpenId(null) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onEsc) }
  }, [open, setOpenId])

  return (
    <div ref={ref} className="relative" style={{ display: 'inline-flex' }}>
      <button onClick={() => setOpenId(open ? null : id)} type="button">{trigger(open)}</button>
      {open && (
        <div
          className="ev-pop"
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', zIndex: 50,
            left: align === 'left' ? 0 : undefined,
            right: align === 'right' ? 0 : undefined,
            width: width ?? 'auto',
            background: 'var(--modal-bg, var(--bg-surface))',
            border: '1px solid var(--modal-border, var(--input-border))',
            borderRadius: 16,
            boxShadow: '0 12px 40px rgba(0,0,0,0.28)',
            padding: 14,
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────
 * Datų diapazono kalendorius
 * ──────────────────────────────────────────────────────────────── */
function RangeCalendar({ from, to, onPick }: { from: Date | null; to: Date | null; onPick: (f: Date | null, t: Date | null) => void }) {
  const [view, setView] = useState<Date>(() => from || startOfDay(new Date()))
  const y = view.getFullYear(), m = view.getMonth()
  const lead = (new Date(y, m, 1).getDay() + 6) % 7
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const today = startOfDay(new Date())

  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  function pick(day: number) {
    const d = startOfDay(new Date(y, m, day))
    if (!from || (from && to)) onPick(d, null)
    else if (d < from) onPick(d, from)
    else onPick(from, d)
  }

  function inRange(day: number) {
    const d = startOfDay(new Date(y, m, day)).getTime()
    if (from && to) return d >= from.getTime() && d <= to.getTime()
    if (from) return d === from.getTime()
    return false
  }
  function isEnd(day: number) {
    const d = startOfDay(new Date(y, m, day)).getTime()
    return (from && d === from.getTime()) || (to && d === to.getTime())
  }

  return (
    <div style={{ width: 260 }}>
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => setView(new Date(y, m - 1, 1))}
          className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-secondary)' }}>{Icon.arrowL}</button>
        <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{MONTHS_FULL[m]} {y}</span>
        <button type="button" onClick={() => setView(new Date(y, m + 1, 1))}
          className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-secondary)' }}>{Icon.arrowR}</button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {WEEKDAYS.map(w => <div key={w} className="text-center text-[10px] font-bold py-1" style={{ color: 'var(--text-muted)' }}>{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />
          const sel = inRange(day)
          const end = isEnd(day)
          const isToday = startOfDay(new Date(y, m, day)).getTime() === today.getTime()
          return (
            <button key={i} type="button" onClick={() => pick(day)}
              className="text-xs font-semibold rounded-lg transition-colors"
              style={{
                height: 32,
                background: end ? 'var(--accent-blue, #1d4ed8)' : sel ? 'rgba(29,78,216,0.16)' : 'transparent',
                color: end ? '#fff' : sel ? 'var(--accent-blue, #2563eb)' : 'var(--text-secondary)',
                border: isToday && !sel ? '1px solid var(--accent-blue, #1d4ed8)' : '1px solid transparent',
              }}
            >{day}</button>
          )
        })}
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────
 * Pagrindinis komponentas
 * ──────────────────────────────────────────────────────────────── */
const PRICE_OPTS = [
  { k: 'free', l: 'Nemokami' },
  { k: 'lt30', l: 'Iki 30 €' },
  { k: 'mid', l: '30–60 €' },
  { k: 'gt60', l: '60 € ir daugiau' },
] as const

export default function EventsClient({ events, featured, cities }: {
  events: Event[]
  featured: Event[]
  cities: string[]
}) {
  const { dk } = useSite()

  // ── Filtrų būsena ──
  const [city, setCity] = useState('Visi')
  const [from, setFrom] = useState<Date | null>(null)
  const [to, setTo] = useState<Date | null>(null)
  const [periodLabel, setPeriodLabel] = useState('Visos datos')
  const [scope, setScope] = useState<'all' | 'lt' | 'world'>('all')
  const [price, setPrice] = useState<string | null>(null)
  const [styles, setStyles] = useState<string[]>([])
  const [festOnly, setFestOnly] = useState(false)
  const [archive, setArchive] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [citySearch, setCitySearch] = useState('')

  // ── Aktyvūs vs archyvas ──
  const active = useMemo(() => events.filter(e => e.status === 'upcoming' || e.status === 'ongoing'), [events])
  const past = useMemo(() => events.filter(e => e.status === 'past' || e.status === 'cancelled'), [events])
  const base = archive ? past : active

  // ── Galimi stiliai (iš įkrautų renginių) ──
  const availStyles = useMemo(() => {
    const s = new Set<string>()
    for (const e of events) for (const g of e.genres || []) s.add(g)
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'lt'))
  }, [events])

  // ── Filtravimas ──
  const filtered = useMemo(() => {
    return base.filter(e => {
      if (city !== 'Visi' && e.city !== city) return false
      if (from) {
        const sd = startOfDay(new Date(e.start_date)).getTime()
        const ed = e.end_date ? startOfDay(new Date(e.end_date)).getTime() : sd
        const lo = from.getTime(), hi = (to || from).getTime()
        if (ed < lo || sd > hi) return false
      }
      if (scope !== 'all') {
        const { hasLt, hasForeign } = eventCountries(e)
        if (scope === 'lt' && !hasLt) return false
        if (scope === 'world' && !hasForeign) return false
      }
      if (price && priceBucket(e) !== price) return false
      if (styles.length && !(e.genres || []).some(g => styles.includes(g))) return false
      if (festOnly && !e.is_festival) return false
      return true
    }).sort((a, b) => archive
      ? new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
      : new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
  }, [base, city, from, to, scope, price, styles, festOnly, archive])

  const anyFilter = city !== 'Visi' || !!from || scope !== 'all' || !!price || styles.length > 0 || festOnly
  const showFeatured = !archive && !anyFilter && featured.length > 0

  // ── Mėnesių grupavimas ──
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; items: Event[] }>()
    for (const e of filtered) {
      const d = new Date(e.start_date)
      const key = ymKey(d)
      if (!map.has(key)) map.set(key, { label: `${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`, items: [] })
      map.get(key)!.items.push(e)
    }
    return Array.from(map.values())
  }, [filtered])

  // ── Miestų pills ──
  const TOP_N = 6
  const topCities = cities.slice(0, TOP_N)
  const showSelectedExtra = city !== 'Visi' && !topCities.includes(city)

  function resetAll() {
    setCity('Visi'); setFrom(null); setTo(null); setPeriodLabel('Visos datos')
    setScope('all'); setPrice(null); setStyles([]); setFestOnly(false)
  }
  function applyPreset(label: string, f: Date | null, t: Date | null) {
    setPeriodLabel(label); setFrom(f); setTo(t); setOpenId(null)
  }

  const now = startOfDay(new Date())
  const endOfMonth = startOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0))
  const weekend = (() => {
    const d = new Date(now); const day = (d.getDay() + 6) % 7 // Mon=0
    const sat = startOfDay(new Date(d.getTime() + ((5 - day + 7) % 7) * 86400000))
    const sun = startOfDay(new Date(sat.getTime() + 86400000))
    return { sat, sun }
  })()

  // ── Stiliai (theme) ──
  const pillBase = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-bold transition-all whitespace-nowrap'
  const triggerStyle = (on: boolean): React.CSSProperties => on
    ? { background: 'var(--accent-blue, #1d4ed8)', color: '#fff', border: '1px solid transparent', boxShadow: '0 2px 10px rgba(29,78,216,0.35)' }
    : { background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--input-border, rgba(120,140,170,0.22))' }

  const cardBg = dk
    ? { background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }
    : { background: 'var(--bg-surface)', border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }

  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-5 lg:px-8 py-7">

      {/* ── Hero antraštė ── */}
      <div className="relative overflow-hidden rounded-3xl mb-7 px-6 sm:px-9 py-8 sm:py-10"
        style={{ background: 'linear-gradient(120deg, rgba(29,78,216,0.20), rgba(249,115,22,0.12) 70%, rgba(29,78,216,0.06))', border: '1px solid rgba(29,78,216,0.18)' }}>
        <div className="absolute -right-10 -top-10 opacity-[0.10]" style={{ color: 'var(--accent-blue, #1d4ed8)' }}>
          <svg width="220" height="220" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
        </div>
        <p className="text-[11px] font-black uppercase tracking-[0.18em] mb-2" style={{ color: 'var(--accent-orange, #ea6c0a)' }}>Muzikos kalendorius</p>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight mb-2" style={{ color: 'var(--text-primary)' }}>Renginiai</h1>
        <p className="text-sm sm:text-[15px] max-w-xl" style={{ color: 'var(--text-secondary)' }}>
          Artimiausi koncertai, festivaliai ir muzikos renginiai Lietuvoje — rink pagal datą, miestą, stilių ar kainą.
        </p>
        <div className="flex flex-wrap gap-2.5 mt-5">
          <Link href="/festivaliai" className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-bold transition-transform hover:scale-[1.03]"
            style={{ background: 'rgba(6,182,212,0.14)', color: '#06b6d4', border: '1px solid rgba(6,182,212,0.3)' }}>{Icon.tent} Festivaliai</Link>
          <Link href="/galerija" className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-bold transition-transform hover:scale-[1.03]"
            style={{ background: 'rgba(236,72,153,0.13)', color: '#ec4899', border: '1px solid rgba(236,72,153,0.3)' }}>📸 Foto galerija</Link>
        </div>
      </div>

      {/* ── Išskirtiniai ── */}
      {showFeatured && (
        <div className="mb-8">
          <p className="text-[11px] font-black uppercase tracking-[0.12em] mb-3" style={{ color: 'var(--text-muted)' }}>Išskirtiniai renginiai</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {featured.map(ev => (
              <Link key={ev.id} href={`/renginiai/${ev.slug}`}
                className="group rounded-2xl overflow-hidden relative transition-transform hover:scale-[1.015]"
                style={{ aspectRatio: '4/5', background: 'linear-gradient(160deg, rgba(29,78,216,0.18), rgba(249,115,22,0.08))', border: '1px solid rgba(29,78,216,0.18)' }}>
                {ev.cover_image_url
                  ? <img src={ev.cover_image_url} alt={ev.title} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  : <div className="absolute inset-0 flex items-center justify-center text-5xl" style={{ color: 'rgba(255,255,255,0.08)' }}>🎤</div>}
                <div className="absolute inset-0" style={{ background: 'linear-gradient(transparent 35%, rgba(0,0,0,0.86))' }} />
                <div className="absolute top-3 left-3 flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-orange-500 text-white">★</span>
                  {ev.is_festival && <span className="px-2 py-0.5 rounded-full text-[10px] font-black" style={{ background: 'rgba(6,182,212,0.9)', color: '#fff' }}>Festivalis</span>}
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <p className="text-[11px] font-bold mb-1" style={{ color: 'rgba(255,255,255,0.65)' }}>{fmtShort(new Date(ev.start_date))} · {ev.city}</p>
                  <h3 className="text-[15px] font-black leading-tight line-clamp-2" style={{ color: '#fff' }}>{ev.title}</h3>
                  <p className="text-xs mt-1 truncate" style={{ color: 'rgba(255,255,255,0.5)' }}>{ev.venue_name}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Filtrų juosta ── */}
      <div className="rounded-2xl p-3.5 sm:p-4 mb-6" style={cardBg}>

        {/* Pagrindinė eilutė: laikotarpis + miestai */}
        <div className="flex flex-wrap items-center gap-2">

          {/* Laikotarpis (pirmas) */}
          <Popover id="period" openId={openId} setOpenId={setOpenId} width={288}
            trigger={(o) => (
              <span className={pillBase} style={triggerStyle(!!from)}>
                {Icon.calendar}<span>{periodLabel}</span>{Icon.chevron}
              </span>
            )}>
            <p className="text-[10px] font-black uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Greiti pasirinkimai</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {[
                { l: 'Visos datos', f: null, t: null },
                { l: 'Šią savaitę', f: now, t: startOfDay(new Date(now.getTime() + 7 * 86400000)) },
                { l: 'Šį savaitgalį', f: weekend.sat, t: weekend.sun },
                { l: 'Šį mėnesį', f: now, t: endOfMonth },
              ].map(p => {
                const on = periodLabel === p.l
                return (
                  <button key={p.l} type="button" onClick={() => applyPreset(p.l, p.f as any, p.t as any)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors"
                    style={on ? { background: 'var(--accent-blue, #1d4ed8)', color: '#fff' } : { background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                    {p.l}
                  </button>
                )
              })}
            </div>
            <p className="text-[10px] font-black uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Tikslios datos</p>
            <RangeCalendar from={from} to={to} onPick={(f, t) => {
              setFrom(f); setTo(t)
              setPeriodLabel(f ? (t && t.getTime() !== f.getTime() ? `${fmtShort(f)} – ${fmtShort(t)}` : fmtShort(f)) : 'Visos datos')
            }} />
            {from && (
              <button type="button" onClick={() => applyPreset('Visos datos', null, null)}
                className="mt-2 w-full py-2 rounded-lg text-xs font-bold" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                Išvalyti datas
              </button>
            )}
          </Popover>

          <div className="w-px h-7 mx-0.5" style={{ background: 'var(--input-border, rgba(120,140,170,0.22))' }} />

          {/* Miestai */}
          <button onClick={() => setCity('Visi')} className={pillBase} style={triggerStyle(city === 'Visi')}>
            {Icon.pin} Visi
          </button>
          {topCities.map(c => (
            <button key={c} onClick={() => setCity(c)} className={pillBase} style={triggerStyle(city === c)}>{c}</button>
          ))}
          {showSelectedExtra && (
            <button onClick={() => setCity(city)} className={pillBase} style={triggerStyle(true)}>{city}</button>
          )}
          {cities.length > TOP_N && (
            <Popover id="cities" openId={openId} setOpenId={setOpenId} width={240}
              trigger={() => <span className={pillBase} style={triggerStyle(false)}>{Icon.dots}<span>Daugiau</span></span>}>
              <input autoFocus value={citySearch} onChange={e => setCitySearch(e.target.value)} placeholder="Ieškoti miesto…"
                className="w-full h-9 rounded-lg px-3 text-sm mb-2 focus:outline-none"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)', border: '1px solid var(--input-border)' }} />
              <div className="max-h-64 overflow-y-auto flex flex-col gap-0.5">
                {cities.filter(c => c.toLowerCase().includes(citySearch.toLowerCase())).map(c => (
                  <button key={c} type="button" onClick={() => { setCity(c); setOpenId(null); setCitySearch('') }}
                    className="text-left px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
                    style={{ background: city === c ? 'var(--accent-blue, #1d4ed8)' : 'transparent', color: city === c ? '#fff' : 'var(--text-secondary)' }}>
                    {c}
                  </button>
                ))}
              </div>
            </Popover>
          )}
        </div>

        {/* Antrinė eilutė: papildomi filtrai + archyvas */}
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3" style={{ borderTop: '1px dashed var(--input-border, rgba(120,140,170,0.18))' }}>

          {/* LT / Užsienio */}
          <Popover id="scope" openId={openId} setOpenId={setOpenId} width={190}
            trigger={() => <span className={pillBase} style={triggerStyle(scope !== 'all')}>{Icon.globe}<span>{scope === 'lt' ? 'LT atlikėjai' : scope === 'world' ? 'Užsienio' : 'Atlikėjai'}</span>{Icon.chevron}</span>}>
            {[{ k: 'all', l: 'Visi atlikėjai' }, { k: 'lt', l: '🇱🇹 Lietuvos' }, { k: 'world', l: '🌍 Užsienio' }].map(o => (
              <button key={o.k} type="button" onClick={() => { setScope(o.k as any); setOpenId(null) }}
                className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold mb-0.5 transition-colors"
                style={{ background: scope === o.k ? 'var(--accent-blue, #1d4ed8)' : 'transparent', color: scope === o.k ? '#fff' : 'var(--text-secondary)' }}>
                {o.l}
              </button>
            ))}
          </Popover>

          {/* Kaina */}
          <Popover id="price" openId={openId} setOpenId={setOpenId} width={190}
            trigger={() => <span className={pillBase} style={triggerStyle(!!price)}>{Icon.euro}<span>{price ? PRICE_OPTS.find(p => p.k === price)?.l : 'Kaina'}</span>{Icon.chevron}</span>}>
            <button type="button" onClick={() => { setPrice(null); setOpenId(null) }}
              className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold mb-0.5 transition-colors"
              style={{ background: !price ? 'var(--accent-blue, #1d4ed8)' : 'transparent', color: !price ? '#fff' : 'var(--text-secondary)' }}>Bet kokia</button>
            {PRICE_OPTS.map(o => (
              <button key={o.k} type="button" onClick={() => { setPrice(o.k); setOpenId(null) }}
                className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold mb-0.5 transition-colors"
                style={{ background: price === o.k ? 'var(--accent-blue, #1d4ed8)' : 'transparent', color: price === o.k ? '#fff' : 'var(--text-secondary)' }}>
                {o.l}
              </button>
            ))}
          </Popover>

          {/* Stilius */}
          {availStyles.length > 0 && (
            <Popover id="style" openId={openId} setOpenId={setOpenId} width={230}
              trigger={() => <span className={pillBase} style={triggerStyle(styles.length > 0)}>{Icon.note}<span>{styles.length ? `Stilius · ${styles.length}` : 'Stilius'}</span>{Icon.chevron}</span>}>
              <div className="max-h-64 overflow-y-auto flex flex-col gap-0.5">
                {availStyles.map(g => {
                  const on = styles.includes(g)
                  return (
                    <button key={g} type="button" onClick={() => setStyles(on ? styles.filter(x => x !== g) : [...styles, g])}
                      className="flex items-center gap-2 text-left px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
                      style={{ background: on ? 'rgba(29,78,216,0.14)' : 'transparent', color: on ? 'var(--accent-blue, #2563eb)' : 'var(--text-secondary)' }}>
                      <span className="w-4 h-4 rounded flex items-center justify-center text-[10px]"
                        style={{ border: on ? 'none' : '1.5px solid var(--input-border)', background: on ? 'var(--accent-blue, #1d4ed8)' : 'transparent', color: '#fff' }}>{on ? '✓' : ''}</span>
                      {g}
                    </button>
                  )
                })}
              </div>
              {styles.length > 0 && (
                <button type="button" onClick={() => setStyles([])} className="mt-2 w-full py-2 rounded-lg text-xs font-bold" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>Išvalyti</button>
              )}
            </Popover>
          )}

          {/* Festivaliai */}
          <button onClick={() => setFestOnly(!festOnly)} className={pillBase} style={triggerStyle(festOnly)}>{Icon.tent} Festivaliai</button>

          {anyFilter && (
            <button onClick={resetAll} className="inline-flex items-center gap-1 px-3 py-2 rounded-full text-[13px] font-bold transition-colors"
              style={{ color: 'var(--accent-orange, #ea6c0a)' }}>{Icon.x} Išvalyti</button>
          )}

          {/* Archyvas — kuklus, dešinėje */}
          <button onClick={() => setArchive(!archive)}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold transition-colors"
            style={archive
              ? { background: 'var(--bg-hover)', color: 'var(--text-primary)', border: '1px solid var(--input-border)' }
              : { color: 'var(--text-muted)' }}>
            🗄 {archive ? 'Rodomas archyvas' : 'Archyvas'}
          </button>
        </div>
      </div>

      {/* ── Sąrašas ── */}
      <div className="flex items-baseline justify-between mb-3 px-1">
        <p className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>
          {archive ? 'Praėję renginiai' : 'Renginiai'}
        </p>
        <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{filtered.length} renginių</span>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 rounded-2xl" style={cardBg}>
          <p className="text-5xl mb-4">🎫</p>
          <p className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Renginių pagal filtrą nerasta</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Pabandyk pakeisti datą, miestą ar kitus filtrus.</p>
          {anyFilter && <button onClick={resetAll} className="mt-4 px-4 py-2 rounded-full text-sm font-bold" style={{ background: 'var(--accent-blue, #1d4ed8)', color: '#fff' }}>Išvalyti filtrus</button>}
        </div>
      ) : (
        <div className="space-y-7">
          {groups.map(grp => (
            <div key={grp.label}>
              <div className="flex items-center gap-3 mb-2.5">
                <p className="text-[11px] font-black uppercase tracking-[0.1em]" style={{ color: 'var(--accent-orange, #ea6c0a)' }}>{grp.label}</p>
                <div className="flex-1 h-px" style={{ background: 'var(--input-border, rgba(120,140,170,0.18))' }} />
              </div>
              <div className="space-y-2">
                {grp.items.map(ev => <EventRow key={ev.id} ev={ev} dk={dk} cardBg={cardBg} archive={archive} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Renginio eilutė ── */
function EventRow({ ev, dk, cardBg, archive }: { ev: Event; dk: boolean; cardBg: React.CSSProperties; archive: boolean }) {
  const headliners = ev.event_artists?.filter(ea => ea.is_headliner).map(getArtist).filter(Boolean) as Artist[]
  const others = ev.event_artists?.filter(ea => !ea.is_headliner) || []
  const price = formatPrice(ev.price_from, ev.price_to)
  const time = fmtTime(ev.start_date)
  const isCancelled = ev.status === 'cancelled'

  return (
    <Link href={`/renginiai/${ev.slug}`}
      className={`flex items-center gap-3.5 px-3.5 py-3 rounded-xl group transition-all hover:-translate-y-px ${archive ? 'opacity-70 hover:opacity-100' : ''}`}
      style={cardBg}>

      {/* Data */}
      <div className="text-center w-12 flex-shrink-0">
        <p className="text-xl font-black leading-none" style={{ color: isCancelled ? '#ef4444' : 'var(--text-primary)' }}>{fmtDay(ev.start_date)}</p>
        <p className="text-[9px] font-black uppercase tracking-wide" style={{ color: 'var(--accent-orange, #ea6c0a)' }}>{fmtMonth(ev.start_date)}</p>
        <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{fmtWeekday(ev.start_date)}</p>
      </div>

      {/* Cover */}
      {ev.cover_image_url
        ? <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0"><img src={ev.cover_image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" /></div>
        : <div className="w-16 h-16 rounded-xl flex-shrink-0 flex items-center justify-center text-2xl" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>🎤</div>}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          {isCancelled && <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">ATŠAUKTAS</span>}
          {ev.is_festival && <span className="text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: 'rgba(6,182,212,0.18)', color: '#06b6d4' }}>FESTIVALIS</span>}
          {ev.is_featured && !isCancelled && <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">★</span>}
        </div>
        <p className={`text-sm font-bold truncate group-hover:text-blue-400 transition-colors ${isCancelled ? 'line-through' : ''}`} style={{ color: 'var(--text-primary)' }}>{ev.title}</p>
        <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
          {[ev.venue_name, ev.city].filter(Boolean).join(' · ')}{time ? ` · ${time}` : ''}
        </p>
        {headliners.length > 0 && (
          <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>
            {headliners.map(a => a?.name).filter(Boolean).join(', ')}{others.length > 0 ? ` +${others.length}` : ''}
          </p>
        )}
      </div>

      {/* Kaina / bilietai */}
      <div className="flex-shrink-0 text-right">
        {price && <p className="text-xs font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{price}</p>}
        {ev.ticket_url && !archive && !isCancelled && <span className="text-xs font-bold" style={{ color: 'var(--accent-orange, #ea6c0a)' }}>Bilietai →</span>}
        {archive && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Praėjęs</span>}
      </div>
    </Link>
  )
}
