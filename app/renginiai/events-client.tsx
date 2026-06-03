'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import Link from 'next/link'

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
const DOT = ' · '

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
function ymKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}` }

function fmtDay(d: string) { return new Date(d).getDate().toString().padStart(2, '0') }
function fmtMonth(d: string) { return MONTHS_SHORT[new Date(d).getMonth()].toUpperCase() }
function fmtShort(d: Date) { return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}` }
function fmtTime(d: string) {
  const dt = new Date(d)
  if (dt.getHours() === 0 && dt.getMinutes() === 0) return null
  return dt.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' })
}

function hasLtArtist(ev: Event): boolean {
  return (ev.event_artists || []).some(ea => getArtist(ea)?.country === 'Lietuva')
}

function priceBucket(ev: Event): 'free' | 'lt30' | 'mid' | 'gt60' | 'unknown' {
  const p = ev.price_from
  if (p === 0) return 'free'
  if (p == null) return 'unknown'
  if (p < 30) return 'lt30'
  if (p <= 60) return 'mid'
  return 'gt60'
}

/* ────────────────────────────────────────────────────────────────
 * Ikonos
 * ──────────────────────────────────────────────────────────────── */
const Icon = {
  calendar: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
  euro: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 7a6 6 0 1 0 0 10M4 11h8M4 14h7"/></svg>,
  note: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
  tent: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 21 14 3M21 21 10.5 3M12 13.5 21 21M12 13.5 3 21M2 21h20"/></svg>,
  chevron: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>,
  arrowL: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>,
  arrowR: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>,
}

/* ────────────────────────────────────────────────────────────────
 * Popover — kompaktiškas dropdown su outside-click
 * ──────────────────────────────────────────────────────────────── */
function Popover({ id, openId, setOpenId, label, icon, on, width, children }: {
  id: string
  openId: string | null
  setOpenId: (v: string | null) => void
  label: string
  icon?: React.ReactNode
  on: boolean
  width?: number
  children: React.ReactNode
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
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button type="button" onClick={() => setOpenId(open ? null : id)} className={`ev-chip${on ? ' on' : ''}`}>
        {icon}<span>{label}</span><span style={{ opacity: 0.7 }}>{Icon.chevron}</span>
      </button>
      {open && <div className="ev-pop" style={{ width: width ?? 'auto' }}>{children}</div>}
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
    <div style={{ width: 250 }}>
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => setView(new Date(y, m - 1, 1))} className="ev-cal-nav">{Icon.arrowL}</button>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{MONTHS_FULL[m]} {y}</span>
        <button type="button" onClick={() => setView(new Date(y, m + 1, 1))} className="ev-cal-nav">{Icon.arrowR}</button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {WEEKDAYS.map(w => <div key={w} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, padding: '3px 0', color: 'var(--text-faint)' }}>{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />
          const sel = inRange(day), end = isEnd(day)
          const isToday = startOfDay(new Date(y, m, day)).getTime() === today.getTime()
          return (
            <button key={i} type="button" onClick={() => pick(day)} className="ev-cal-day"
              style={{
                background: end ? 'var(--accent-orange)' : sel ? 'rgba(249,115,22,0.15)' : 'transparent',
                color: end ? '#fff' : sel ? 'var(--accent-orange)' : 'var(--text-secondary)',
                border: isToday && !sel ? '1px solid var(--accent-orange)' : '1px solid transparent',
              }}>{day}</button>
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

const PRIMARY_CITIES = ['Vilnius', 'Kaunas']

export default function EventsClient({ events, cities }: { events: Event[]; cities: string[] }) {
  const [city, setCity] = useState('Visi')
  const [from, setFrom] = useState<Date | null>(null)
  const [to, setTo] = useState<Date | null>(null)
  const [periodLabel, setPeriodLabel] = useState('Visos datos')
  const [ltOnly, setLtOnly] = useState(false)
  const [price, setPrice] = useState<string | null>(null)
  const [styles, setStyles] = useState<string[]>([])
  const [festOnly, setFestOnly] = useState(false)
  const [archive, setArchive] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [citySearch, setCitySearch] = useState('')

  const today = startOfDay(new Date())

  // Aktyvūs = būsena upcoming/ongoing IR data nuo šiandien (kad nerodytų ką tik
  // praėjusių, dar nepervadintų į „past"). Archyvas = visa kita.
  const active = useMemo(() => events.filter(e =>
    (e.status === 'upcoming' || e.status === 'ongoing') &&
    startOfDay(new Date(e.end_date || e.start_date)).getTime() >= today.getTime()
  ), [events, today])
  const past = useMemo(() => events.filter(e => !active.includes(e)), [events, active])
  const base = archive ? past : active

  const availStyles = useMemo(() => {
    const s = new Set<string>()
    for (const e of base) for (const g of e.genres || []) s.add(g)
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'lt'))
  }, [base])

  const filtered = useMemo(() => {
    return base.filter(e => {
      if (city !== 'Visi' && e.city !== city) return false
      if (from) {
        const sd = startOfDay(new Date(e.start_date)).getTime()
        const ed = e.end_date ? startOfDay(new Date(e.end_date)).getTime() : sd
        const lo = from.getTime(), hi = (to || from).getTime()
        if (ed < lo || sd > hi) return false
      }
      if (ltOnly && !hasLtArtist(e)) return false
      if (price && priceBucket(e) !== price) return false
      if (styles.length && !(e.genres || []).some(g => styles.includes(g))) return false
      if (festOnly && !e.is_festival) return false
      return true
    }).sort((a, b) => archive
      ? new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
      : new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
  }, [base, city, from, to, ltOnly, price, styles, festOnly, archive])

  const anyFilter = city !== 'Visi' || !!from || ltOnly || !!price || styles.length > 0 || festOnly

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

  const moreCities = cities.filter(c => !PRIMARY_CITIES.includes(c))
  const selectedInMore = city !== 'Visi' && !PRIMARY_CITIES.includes(city)

  function resetAll() {
    setCity('Visi'); setFrom(null); setTo(null); setPeriodLabel('Visos datos')
    setLtOnly(false); setPrice(null); setStyles([]); setFestOnly(false)
  }

  const now = today
  const endOfMonth = startOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0))
  const weekend = (() => {
    const d = new Date(now); const day = (d.getDay() + 6) % 7
    const sat = startOfDay(new Date(d.getTime() + ((5 - day + 7) % 7) * 86400000))
    return { sat, sun: startOfDay(new Date(sat.getTime() + 86400000)) }
  })()

  return (
    <div className="ev-wrap">
      <style>{EV_CSS}</style>

      {/* ── Slim antraštė ── */}
      <div className="ev-head">
        <h1>Renginiai</h1>
        <p>Koncertai, festivaliai ir muzikos renginiai Lietuvoje</p>
      </div>

      {/* ── Kompaktiška filtrų juosta (viena eilutė) ── */}
      <div className="ev-fbar">
        {/* Laikotarpis */}
        <Popover id="period" openId={openId} setOpenId={setOpenId} label={periodLabel} icon={Icon.calendar} on={!!from} width={278}>
          <p className="ev-pop-lbl">Greiti pasirinkimai</p>
          <div className="ev-pop-presets">
            {[
              { l: 'Visos datos', f: null, t: null },
              { l: 'Šią savaitę', f: now, t: startOfDay(new Date(now.getTime() + 7 * 86400000)) },
              { l: 'Savaitgalį', f: weekend.sat, t: weekend.sun },
              { l: 'Šį mėnesį', f: now, t: endOfMonth },
            ].map(p => (
              <button key={p.l} type="button" className={`ev-mini${periodLabel === p.l ? ' on' : ''}`}
                onClick={() => { setPeriodLabel(p.l); setFrom(p.f as any); setTo(p.t as any); setOpenId(null) }}>{p.l}</button>
            ))}
          </div>
          <p className="ev-pop-lbl">Tikslios datos</p>
          <RangeCalendar from={from} to={to} onPick={(f, t) => {
            setFrom(f); setTo(t)
            setPeriodLabel(f ? (t && t.getTime() !== f.getTime() ? `${fmtShort(f)} – ${fmtShort(t)}` : fmtShort(f)) : 'Visos datos')
          }} />
          {from && <button type="button" className="ev-pop-clear" onClick={() => { setPeriodLabel('Visos datos'); setFrom(null); setTo(null); setOpenId(null) }}>Išvalyti datas</button>}
        </Popover>

        <span className="ev-divider" />

        {/* Miestai */}
        <button className={`ev-chip${city === 'Visi' ? ' on' : ''}`} onClick={() => setCity('Visi')}>Visi miestai</button>
        {PRIMARY_CITIES.filter(c => cities.includes(c)).map(c => (
          <button key={c} className={`ev-chip${city === c ? ' on' : ''}`} onClick={() => setCity(c)}>{c}</button>
        ))}
        {selectedInMore && <button className="ev-chip on" onClick={() => setCity(city)}>{city}</button>}
        {moreCities.length > 0 && (
          <Popover id="cities" openId={openId} setOpenId={setOpenId} label="Daugiau" on={false} width={230}>
            <input autoFocus value={citySearch} onChange={e => setCitySearch(e.target.value)} placeholder="Ieškoti miesto…" className="ev-search" />
            <div className="ev-pop-list">
              {moreCities.filter(c => c.toLowerCase().includes(citySearch.toLowerCase())).map(c => (
                <button key={c} type="button" className={`ev-opt${city === c ? ' on' : ''}`} onClick={() => { setCity(c); setOpenId(null); setCitySearch('') }}>{c}</button>
              ))}
            </div>
          </Popover>
        )}

        <span className="ev-divider" />

        {/* Kaina */}
        <Popover id="price" openId={openId} setOpenId={setOpenId} label={price ? PRICE_OPTS.find(p => p.k === price)!.l : 'Kaina'} icon={Icon.euro} on={!!price} width={180}>
          <button type="button" className={`ev-opt${!price ? ' on' : ''}`} onClick={() => { setPrice(null); setOpenId(null) }}>Bet kokia</button>
          {PRICE_OPTS.map(o => (
            <button key={o.k} type="button" className={`ev-opt${price === o.k ? ' on' : ''}`} onClick={() => { setPrice(o.k); setOpenId(null) }}>{o.l}</button>
          ))}
        </Popover>

        {/* Stilius */}
        {availStyles.length > 0 && (
          <Popover id="style" openId={openId} setOpenId={setOpenId} label={styles.length ? `Stilius · ${styles.length}` : 'Stilius'} icon={Icon.note} on={styles.length > 0} width={220}>
            <div className="ev-pop-list">
              {availStyles.map(g => {
                const o = styles.includes(g)
                return (
                  <button key={g} type="button" className={`ev-opt${o ? ' on' : ''}`} onClick={() => setStyles(o ? styles.filter(x => x !== g) : [...styles, g])}>
                    <span className="ev-check" style={{ background: o ? 'var(--accent-orange)' : 'transparent', borderColor: o ? 'var(--accent-orange)' : 'var(--border-default,rgba(255,255,255,0.2))' }}>{o ? '✓' : ''}</span>{g}
                  </button>
                )
              })}
            </div>
            {styles.length > 0 && <button type="button" className="ev-pop-clear" onClick={() => setStyles([])}>Išvalyti</button>}
          </Popover>
        )}

        <span className="ev-divider" />

        {/* LT atlikėjai + Festivaliai (toggle'ai, gale) */}
        <button className={`ev-chip${ltOnly ? ' on' : ''}`} onClick={() => setLtOnly(!ltOnly)}><span>🇱🇹</span><span>LT atlikėjai</span></button>
        <button className={`ev-chip${festOnly ? ' on' : ''}`} onClick={() => setFestOnly(!festOnly)}>{Icon.tent}<span>Festivaliai</span></button>

        {anyFilter && <button className="ev-reset" onClick={resetAll}>Išvalyti ✕</button>}
        <span className="ev-count">{filtered.length}</span>
      </div>

      {/* ── Tinklelis ── */}
      {filtered.length === 0 ? (
        <div className="ev-empty">
          <p className="ev-empty-ic">🎫</p>
          <h3>Renginių nerasta</h3>
          <p>Pabandyk pakeisti datą, miestą ar kitus filtrus.</p>
          {anyFilter && <button className="ev-mini on" style={{ marginTop: 14 }} onClick={resetAll}>Išvalyti filtrus</button>}
        </div>
      ) : (
        <div className="ev-months">
          {groups.map(grp => (
            <div key={grp.label}>
              <div className="ev-month-head"><span>{grp.label}</span><i /></div>
              <div className="ev-grid">
                {grp.items.map(ev => <EventCard key={ev.id} ev={ev} archive={archive} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Archyvas (apačioje) ── */}
      {!archive && past.length > 0 && (
        <button className="ev-archive-toggle" onClick={() => { setArchive(true); resetAll(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
          🗄 Praėję renginiai ({past.length}) →
        </button>
      )}
      {archive && (
        <button className="ev-archive-toggle" onClick={() => { setArchive(false); resetAll() }}>
          ← Atgal į artimiausius renginius
        </button>
      )}
    </div>
  )
}

/* ── Renginio kortelė: švarus plakatas, visa info po juo ── */
function EventCard({ ev, archive }: { ev: Event; archive: boolean }) {
  const time = fmtTime(ev.start_date)
  const isCancelled = ev.status === 'cancelled'
  const headliners = (ev.event_artists?.filter(ea => ea.is_headliner).map(getArtist).filter(Boolean) as Artist[]) || []
  const artistLine = headliners.map(a => a.name).join(', ')
  const venueLine = [ev.venue_name, ev.city].filter(Boolean).join(DOT)

  const d = new Date(ev.start_date)
  const weekday = d.toLocaleDateString('lt-LT', { weekday: 'short' }).replace('.', '')
  const whenLine = `${weekday}, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${time ? `${DOT}${time}` : ''}`

  return (
    <Link href={`/renginiai/${ev.slug}`} className={`ev-card${archive ? ' past' : ''}`}>
      <div className="ev-card-img">
        {ev.cover_image_url
          ? <img src={ev.cover_image_url} alt={ev.title} loading="lazy" />
          : <div className="ev-card-noimg"><span>{fmtDay(ev.start_date)}</span><span>{fmtMonth(ev.start_date)}</span></div>}
        <div className="ev-card-tags">
          {isCancelled && <span className="ev-tag cancel">ATŠAUKTAS</span>}
          {ev.is_festival && <span className="ev-tag fest">FESTIVALIS</span>}
          {ev.is_featured && !isCancelled && <span className="ev-tag star">★</span>}
        </div>
      </div>
      <div className="ev-card-body">
        <span className="ev-card-when">{whenLine}</span>
        <h3 className="ev-card-title">{ev.title}</h3>
        {venueLine && <span className="ev-card-where">{venueLine}</span>}
        {artistLine && <span className="ev-card-who">{artistLine}</span>}
      </div>
    </Link>
  )
}

/* ────────────────────────────────────────────────────────────────
 * Stiliai — atitinka /muzika ir /albumai sistemą (oranžinis akcentas,
 * mz-fchip pill'ai, tile tinklelis). CSS kintamieji iš globals.css.
 * ──────────────────────────────────────────────────────────────── */
const EV_CSS = `
.ev-wrap { max-width:1400px; margin:0 auto; padding:18px 24px 80px; font-family:'DM Sans',system-ui,sans-serif; }
@media(max-width:640px){ .ev-wrap { padding:14px 14px 64px; } }

/* Slim head */
.ev-head { margin-bottom:16px; }
.ev-head h1 { font-family:'Outfit',sans-serif; font-weight:900; letter-spacing:-.025em; font-size:clamp(1.5rem,3vw,2rem); line-height:1.05; color:var(--text-primary); }
.ev-head p { color:var(--text-muted); font-size:13px; margin-top:4px; }

/* Filter bar — viena kompaktiška eilutė */
.ev-fbar { display:flex; flex-wrap:wrap; gap:7px; align-items:center; padding:11px 12px; border-radius:14px;
  background:var(--bg-surface); border:1px solid var(--border-default,rgba(255,255,255,0.08)); margin-bottom:22px; }
.ev-divider { width:1px; height:22px; background:var(--border-default,rgba(255,255,255,0.1)); margin:0 2px; }

/* Chip (= mz-fchip) */
.ev-chip { display:inline-flex; align-items:center; gap:6px; padding:6px 13px; border-radius:100px; font-size:12.5px; font-weight:600;
  font-family:'Outfit',sans-serif; background:var(--bg-hover); border:1px solid var(--border-default,rgba(255,255,255,0.08));
  color:var(--text-secondary); transition:all .15s; white-space:nowrap; cursor:pointer; line-height:1.3; }
.ev-chip:hover { color:var(--text-primary); border-color:rgba(249,115,22,0.4); }
.ev-chip.on { background:var(--accent-orange); border-color:var(--accent-orange); color:#fff; }
.ev-chip svg { display:block; }

.ev-reset { padding:6px 11px; border-radius:100px; font-size:12px; font-weight:700; font-family:'Outfit',sans-serif;
  color:var(--accent-orange); background:transparent; border:none; cursor:pointer; white-space:nowrap; }
.ev-count { margin-left:auto; font-size:12px; font-weight:700; color:var(--text-faint); font-family:'Outfit',sans-serif;
  background:var(--bg-hover); border-radius:100px; padding:4px 11px; }

/* Popover */
.ev-pop { position:absolute; top:calc(100% + 8px); left:0; z-index:50; padding:13px;
  background:var(--bg-surface); border:1px solid var(--border-default,rgba(255,255,255,0.1)); border-radius:14px;
  box-shadow:0 14px 40px rgba(0,0,0,0.32); }
.ev-pop-lbl { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; color:var(--text-faint); margin:0 0 8px; font-family:'Outfit',sans-serif; }
.ev-pop-lbl:not(:first-child){ margin-top:13px; }
.ev-pop-presets { display:flex; flex-wrap:wrap; gap:6px; }
.ev-pop-list { display:flex; flex-direction:column; gap:2px; max-height:260px; overflow-y:auto; }
.ev-mini { padding:6px 11px; border-radius:9px; font-size:12px; font-weight:700; font-family:'Outfit',sans-serif; cursor:pointer;
  background:var(--bg-hover); border:1px solid transparent; color:var(--text-secondary); transition:all .15s; }
.ev-mini:hover { color:var(--text-primary); }
.ev-mini.on { background:var(--accent-orange); color:#fff; }
.ev-opt { display:flex; align-items:center; gap:8px; text-align:left; width:100%; padding:8px 10px; border-radius:9px; font-size:13px;
  font-weight:600; font-family:'Outfit',sans-serif; cursor:pointer; background:transparent; border:none; color:var(--text-secondary); transition:all .12s; }
.ev-opt:hover { background:var(--bg-hover); color:var(--text-primary); }
.ev-opt.on { color:var(--accent-orange); }
.ev-check { width:16px; height:16px; border-radius:5px; border:1.5px solid; display:flex; align-items:center; justify-content:center; font-size:10px; color:#fff; flex-shrink:0; }
.ev-search { width:100%; height:34px; border-radius:9px; padding:0 11px; font-size:13px; margin-bottom:8px;
  background:var(--bg-hover); border:1px solid var(--border-default,rgba(255,255,255,0.1)); color:var(--text-primary); outline:none; }
.ev-pop-clear { margin-top:9px; width:100%; padding:7px; border-radius:9px; font-size:12px; font-weight:700; font-family:'Outfit',sans-serif;
  cursor:pointer; background:var(--bg-hover); border:none; color:var(--text-secondary); }
.ev-cal-nav { padding:5px; border-radius:8px; background:transparent; border:none; cursor:pointer; color:var(--text-secondary); display:flex; }
.ev-cal-nav:hover { background:var(--bg-hover); }
.ev-cal-day { height:31px; border-radius:8px; font-size:12px; font-weight:700; font-family:'Outfit',sans-serif; cursor:pointer; transition:background .12s; }

/* Mėnesių grupės */
.ev-months { display:flex; flex-direction:column; gap:30px; }
.ev-month-head { display:flex; align-items:center; gap:12px; margin-bottom:13px; }
.ev-month-head span { font-family:'Outfit',sans-serif; font-weight:800; font-size:12px; text-transform:uppercase; letter-spacing:.08em; color:var(--accent-orange); }
.ev-month-head i { flex:1; height:1px; background:var(--border-default,rgba(255,255,255,0.08)); }

/* Kortelių tinklelis — vizualus plakatas, info po juo */
.ev-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(210px,1fr)); gap:16px; }
@media(max-width:640px){ .ev-grid { grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:11px; } }

.ev-card { display:block; border-radius:15px; overflow:hidden; background:var(--bg-surface);
  border:1px solid var(--border-default,rgba(255,255,255,0.07)); transition:transform .18s, border-color .18s, box-shadow .18s; }
.ev-card:hover { transform:translateY(-3px); border-color:rgba(249,115,22,0.4); box-shadow:0 12px 28px rgba(0,0,0,0.22); }
.ev-card.past { opacity:.72; }
.ev-card.past:hover { opacity:1; }

.ev-card-img { position:relative; aspect-ratio:4/5; overflow:hidden; background:var(--bg-elevated); }
.ev-card-img img { width:100%; height:100%; object-fit:cover; display:block; transition:transform .45s ease; }
.ev-card:hover .ev-card-img img { transform:scale(1.06); }
.ev-card-noimg { width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px;
  background:linear-gradient(150deg, var(--bg-elevated), rgba(249,115,22,0.10)); font-family:'Outfit',sans-serif; }
.ev-card-noimg span:first-child { font-size:42px; font-weight:900; color:var(--text-primary); line-height:1; }
.ev-card-noimg span:last-child { font-size:13px; font-weight:800; letter-spacing:.1em; color:var(--accent-orange); }

.ev-card-tags { position:absolute; top:9px; right:9px; display:flex; flex-direction:column; gap:4px; align-items:flex-end; }
.ev-tag { font-family:'Outfit',sans-serif; font-weight:800; font-size:9px; letter-spacing:.04em; padding:3px 7px; border-radius:100px; color:#fff; box-shadow:0 2px 8px rgba(0,0,0,.25); }
.ev-tag.fest { background:#06b6d4; }
.ev-tag.star { background:var(--accent-orange); }
.ev-tag.cancel { background:#ef4444; }

/* Info po plakatu */
.ev-card-body { padding:11px 13px 13px; display:flex; flex-direction:column; gap:3px; }
.ev-card-when { font-family:'Outfit',sans-serif; font-weight:800; font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:var(--accent-orange); }
.ev-card-title { font-family:'Outfit',sans-serif; font-weight:800; font-size:14.5px; line-height:1.2; color:var(--text-primary);
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; margin-top:1px; }
.ev-card:hover .ev-card-title { color:var(--accent-orange); }
.ev-card-where { font-size:12px; color:var(--text-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:2px; }
.ev-card-who { font-size:11.5px; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

/* Archyvo toggle */
.ev-archive-toggle { display:block; margin:34px auto 0; padding:10px 20px; border-radius:100px; font-size:13px; font-weight:700;
  font-family:'Outfit',sans-serif; cursor:pointer; background:var(--bg-hover); border:1px solid var(--border-default,rgba(255,255,255,0.08));
  color:var(--text-secondary); transition:all .15s; }
.ev-archive-toggle:hover { color:var(--text-primary); border-color:rgba(249,115,22,0.4); }

/* Empty */
.ev-empty { max-width:520px; margin:60px auto; text-align:center; }
.ev-empty-ic { font-size:46px; opacity:.5; }
.ev-empty h3 { font-family:'Outfit',sans-serif; font-weight:800; font-size:19px; margin:8px 0 4px; color:var(--text-primary); }
.ev-empty p { color:var(--text-muted); font-size:13px; }
`
