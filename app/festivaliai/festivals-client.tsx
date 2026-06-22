'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import Link from 'next/link'
import { festivalHref } from '@/lib/event-href'

/* ────────────────────────────────────────────────────────────────
 * Tipai
 * ──────────────────────────────────────────────────────────────── */
type Artist = { id: number; name: string; slug: string; cover_image_url: string | null; country?: string | null }
type EventArtist = { artist_id: number; is_headliner: boolean; sort_order: number; artists: Artist | Artist[] }

type Festival = {
  id: string
  title: string
  slug: string
  legacy_id?: number | null
  description: string | null
  start_date: string
  end_date: string | null
  venue_name: string | null
  city: string | null
  cover_image_url: string | null
  ticket_url: string | null
  price_from: number | null
  status: string
  is_featured: boolean
  genres?: string[]
  event_artists: EventArtist[]
}

/* ────────────────────────────────────────────────────────────────
 * Pagalbinės
 * ──────────────────────────────────────────────────────────────── */
const MONTHS_GEN = ['sausio', 'vasario', 'kovo', 'balandžio', 'gegužės', 'birželio', 'liepos', 'rugpjūčio', 'rugsėjo', 'spalio', 'lapkričio', 'gruodžio']

function getArtist(ea: EventArtist): Artist | undefined {
  return Array.isArray(ea.artists) ? ea.artists[0] : ea.artists
}

/* Atlikėjai: headlineriai pirma, paskui likę (pagal sort_order). */
function lineup(ev: Festival): { artist: Artist; headliner: boolean }[] {
  return (ev.event_artists || [])
    .slice()
    .sort((a, b) => (Number(b.is_headliner) - Number(a.is_headliner)) || (a.sort_order - b.sort_order))
    .map(ea => ({ artist: getArtist(ea) as Artist, headliner: ea.is_headliner }))
    .filter(x => x.artist)
}

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }

/* „rugpjūčio 16–18, 2024" / „vasario 27, 2026" */
function fmtRange(startIso: string, endIso: string | null): string {
  const s = new Date(startIso)
  const y = s.getFullYear()
  if (endIso) {
    const e = new Date(endIso)
    if (e.getFullYear() === y && e.getMonth() === s.getMonth() && e.getDate() !== s.getDate())
      return `${MONTHS_GEN[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${y}`
    if (e.getTime() !== s.getTime())
      return `${MONTHS_GEN[s.getMonth()]} ${s.getDate()} – ${MONTHS_GEN[e.getMonth()]} ${e.getDate()}, ${y}`
  }
  return `${MONTHS_GEN[s.getMonth()]} ${s.getDate()}, ${y}`
}

function hasLtArtist(ev: Festival): boolean {
  return (ev.event_artists || []).some(ea => getArtist(ea)?.country === 'Lietuva')
}

/* ────────────────────────────────────────────────────────────────
 * Ikonos
 * ──────────────────────────────────────────────────────────────── */
const Icon = {
  search: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>,
  pin: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  cal: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
  note: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
  chevron: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>,
  tent: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 21 14 3M21 21 10.5 3M12 13.5 21 21M12 13.5 3 21M2 21h20"/></svg>,
}

/* ────────────────────────────────────────────────────────────────
 * Popover
 * ──────────────────────────────────────────────────────────────── */
function Popover({ id, openId, setOpenId, label, icon, on, width, children }: {
  id: string; openId: string | null; setOpenId: (v: string | null) => void
  label: string; icon?: React.ReactNode; on: boolean; width?: number; children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const open = openId === id
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpenId(null) }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setOpenId(null) }
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onEsc)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onEsc) }
  }, [open, setOpenId])
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button type="button" onClick={() => setOpenId(open ? null : id)} className={`fs-chip${on ? ' on' : ''}`}>
        {icon}<span>{label}</span><span style={{ opacity: 0.7 }}>{Icon.chevron}</span>
      </button>
      {open && <div className="fs-pop" style={{ width: width ?? 'auto' }}>{children}</div>}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────
 * Lineup avataro krūva (overlapping)
 * ──────────────────────────────────────────────────────────────── */
function AvatarStack({ artists, max = 5 }: { artists: Artist[]; max?: number }) {
  const show = artists.slice(0, max)
  const extra = artists.length - show.length
  return (
    <div className="fs-stack">
      {show.map((a, i) => (
        <span key={a.id} className="fs-av" style={{ zIndex: max - i, background: `hsl(${(a.name.charCodeAt(0) || 65) * 17 % 360},32%,18%)` }}>
          {a.cover_image_url
            ? <img src={a.cover_image_url} alt={a.name} loading="lazy" />
            : <span className="fs-av-i">{a.name[0]?.toUpperCase()}</span>}
        </span>
      ))}
      {extra > 0 && <span className="fs-av fs-av-more">+{extra}</span>}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────
 * Pagrindinis
 * ──────────────────────────────────────────────────────────────── */
export default function FestivalsClient({ festivals }: { festivals: Festival[] }) {
  const today = startOfDay(new Date())
  const [q, setQ] = useState('')
  const [city, setCity] = useState('Visi')
  const [year, setYear] = useState<string>('Visi')
  const [styles, setStyles] = useState<string[]>([])
  const [ltOnly, setLtOnly] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const isUpcoming = (f: Festival) => startOfDay(new Date(f.end_date || f.start_date)).getTime() >= today.getTime()

  const cities = useMemo(() => {
    const s = new Set<string>()
    for (const f of festivals) if (f.city) s.add(f.city)
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'lt'))
  }, [festivals])

  const years = useMemo(() => {
    const s = new Set<string>()
    for (const f of festivals) if (f.start_date) s.add(f.start_date.slice(0, 4))
    return Array.from(s).sort((a, b) => b.localeCompare(a))
  }, [festivals])

  const availStyles = useMemo(() => {
    const s = new Set<string>()
    for (const f of festivals) for (const g of f.genres || []) s.add(g)
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'lt'))
  }, [festivals])

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return festivals.filter(f => {
      if (ql) {
        const inTitle = f.title.toLowerCase().includes(ql)
        const inArtist = (f.event_artists || []).some(ea => getArtist(ea)?.name.toLowerCase().includes(ql))
        if (!inTitle && !inArtist) return false
      }
      if (city !== 'Visi' && f.city !== city) return false
      if (year !== 'Visi' && f.start_date.slice(0, 4) !== year) return false
      if (ltOnly && !hasLtArtist(f)) return false
      if (styles.length && !(f.genres || []).some(g => styles.includes(g))) return false
      return true
    })
  }, [festivals, q, city, year, ltOnly, styles])

  const upcoming = useMemo(() => filtered.filter(isUpcoming).sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()), [filtered])
  const past = useMemo(() => filtered.filter(f => !isUpcoming(f)).sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()), [filtered])

  // Archyvas pagal metus.
  const byYear = useMemo(() => {
    const m = new Map<string, Festival[]>()
    for (const f of past) {
      const y = f.start_date.slice(0, 4)
      if (!m.has(y)) m.set(y, [])
      m.get(y)!.push(f)
    }
    return Array.from(m.entries())
  }, [past])

  // Hero: pirmas būsimas, kitaip naujausias su cover'iu, kitaip naujausias.
  const hero = useMemo(() => {
    if (upcoming.length) return upcoming[0]
    const withCover = festivals.filter(f => f.cover_image_url)
    return (withCover.sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())[0]) || festivals[0]
  }, [upcoming, festivals])

  const anyFilter = !!q || city !== 'Visi' || year !== 'Visi' || ltOnly || styles.length > 0
  function reset() { setQ(''); setCity('Visi'); setYear('Visi'); setLtOnly(false); setStyles([]) }

  return (
    <div className="fs-wrap">
      <style>{FS_CSS}</style>

      {/* ── HERO ── */}
      {hero && !anyFilter && <HeroFestival ev={hero} upcoming={isUpcoming(hero)} />}

      {/* ── Antraštė ── */}
      <div className="fs-head">
        <h1>Muzikos festivaliai</h1>
        <p>Būsimi ir praėję festivaliai, pilni line-up'ai ir dalyvavę atlikėjai — Granatos, Karklė, Mėnuo Juodaragis, Positivus, Tundra ir kiti vienoje vietoje.</p>
      </div>

      {/* ── Filtrai ── */}
      <div className="fs-fbar">
        <div className="fs-searchbox">
          <span className="fs-search-ic">{Icon.search}</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Ieškoti festivalio ar atlikėjo…" />
          {q && <button className="fs-search-x" onClick={() => setQ('')}>✕</button>}
        </div>

        <span className="fs-divider" />

        <button className={`fs-chip${city === 'Visi' ? ' on' : ''}`} onClick={() => setCity('Visi')}>Visi miestai</button>
        {cities.length > 0 && (
          <Popover id="city" openId={openId} setOpenId={setOpenId} label={city !== 'Visi' ? city : 'Miestas'} icon={Icon.pin} on={city !== 'Visi'} width={200}>
            <div className="fs-pop-list">
              <button type="button" className={`fs-opt${city === 'Visi' ? ' on' : ''}`} onClick={() => { setCity('Visi'); setOpenId(null) }}>Visi miestai</button>
              {cities.map(c => <button key={c} type="button" className={`fs-opt${city === c ? ' on' : ''}`} onClick={() => { setCity(c); setOpenId(null) }}>{c}</button>)}
            </div>
          </Popover>
        )}

        {years.length > 0 && (
          <Popover id="year" openId={openId} setOpenId={setOpenId} label={year !== 'Visi' ? year : 'Metai'} icon={Icon.cal} on={year !== 'Visi'} width={170}>
            <div className="fs-pop-list">
              <button type="button" className={`fs-opt${year === 'Visi' ? ' on' : ''}`} onClick={() => { setYear('Visi'); setOpenId(null) }}>Visi metai</button>
              {years.map(y => <button key={y} type="button" className={`fs-opt${year === y ? ' on' : ''}`} onClick={() => { setYear(y); setOpenId(null) }}>{y}</button>)}
            </div>
          </Popover>
        )}

        {availStyles.length > 0 && (
          <Popover id="style" openId={openId} setOpenId={setOpenId} label={styles.length ? `Stilius · ${styles.length}` : 'Stilius'} icon={Icon.note} on={styles.length > 0} width={220}>
            <div className="fs-pop-list">
              {availStyles.map(g => {
                const on = styles.includes(g)
                return (
                  <button key={g} type="button" className={`fs-opt${on ? ' on' : ''}`} onClick={() => setStyles(on ? styles.filter(x => x !== g) : [...styles, g])}>
                    <span className="fs-check" style={{ background: on ? 'var(--accent-orange)' : 'transparent', borderColor: on ? 'var(--accent-orange)' : 'rgba(255,255,255,0.2)' }}>{on ? '✓' : ''}</span>{g}
                  </button>
                )
              })}
            </div>
            {styles.length > 0 && <button type="button" className="fs-pop-clear" onClick={() => setStyles([])}>Išvalyti</button>}
          </Popover>
        )}

        <button className={`fs-chip${ltOnly ? ' on' : ''}`} onClick={() => setLtOnly(!ltOnly)}><span>🇱🇹</span><span>LT atlikėjai</span></button>

        {anyFilter && <button className="fs-reset" onClick={reset}>Išvalyti ✕</button>}
        <span className="fs-count">{filtered.length} {filtered.length % 10 === 1 && filtered.length % 100 !== 11 ? 'festivalis' : 'festivalių'}</span>
      </div>

      {/* ── Turinys ── */}
      {filtered.length === 0 ? (
        <div className="fs-empty">
          <p className="fs-empty-ic">{Icon.tent}</p>
          <h3>Festivalių nerasta</h3>
          <p>Pabandyk pakeisti paiešką ar filtrus.</p>
          {anyFilter && <button className="fs-mini on" onClick={reset}>Išvalyti filtrus</button>}
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <section className="fs-section">
              <div className="fs-sec-head"><span className="fs-sec-dot" />Būsimi festivaliai<i /></div>
              <div className="fs-grid">{upcoming.map(f => <FestivalCard key={f.id} ev={f} upcoming />)}</div>
            </section>
          )}

          {byYear.length > 0 && (
            <section className="fs-section">
              <div className="fs-sec-head">{upcoming.length > 0 ? 'Festivalių archyvas' : 'Festivaliai'}<i /></div>
              {byYear.map(([y, items]) => (
                <div key={y} className="fs-year">
                  <div className="fs-year-label">{y}<span>{items.length}</span></div>
                  <div className="fs-grid">{items.map(f => <FestivalCard key={f.id} ev={f} />)}</div>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  )
}

/* ── HERO festivalis ── */
function HeroFestival({ ev, upcoming }: { ev: Festival; upcoming: boolean }) {
  const lu = lineup(ev)
  const heads = lu.filter(x => x.headliner).map(x => x.artist)
  const headNames = (heads.length ? heads : lu.map(x => x.artist)).slice(0, 6).map(a => a.name)
  return (
    <Link href={festivalHref(ev)} className="fs-hero">
      <div className="fs-hero-bg" style={ev.cover_image_url ? { backgroundImage: `url(${ev.cover_image_url})` } : undefined} />
      <div className="fs-hero-grad" />
      <div className="fs-hero-inner">
        <span className="fs-hero-badge">{upcoming ? '🎪 Artimiausias festivalis' : '🎪 Iš festivalių archyvo'}</span>
        <h2 className="fs-hero-title">{ev.title}</h2>
        <div className="fs-hero-meta">
          <span>{Icon.cal}{fmtRange(ev.start_date, ev.end_date)}</span>
          {ev.city && <span>{Icon.pin}{ev.city}</span>}
          {lu.length > 0 && <span>{Icon.note}{lu.length} atlikėjai</span>}
        </div>
        {headNames.length > 0 && <p className="fs-hero-lineup">{headNames.join('  •  ')}</p>}
        {lu.length > 0 && <div className="fs-hero-stack"><AvatarStack artists={lu.map(x => x.artist)} max={7} /></div>}
      </div>
    </Link>
  )
}

/* ── Festivalio kortelė: vizualas + fancy line-up ── */
function FestivalCard({ ev, upcoming }: { ev: Festival; upcoming?: boolean }) {
  const lu = lineup(ev)
  const heads = lu.filter(x => x.headliner).map(x => x.artist)
  const headNames = (heads.length ? heads : lu.map(x => x.artist)).slice(0, 3).map(a => a.name)
  const cancelled = ev.status === 'cancelled'

  return (
    <Link href={festivalHref(ev)} className="fs-card">
      <div className="fs-card-img">
        {ev.cover_image_url ? (
          <>
            <span className="fs-card-bg" style={{ backgroundImage: `url(${ev.cover_image_url})` }} />
            <img className="fs-card-fg" src={ev.cover_image_url} alt={ev.title} loading="lazy" />
          </>
        ) : (
          <div className="fs-card-noimg">
            <span className="fs-card-noimg-ic">{Icon.tent}</span>
            <span className="fs-card-noimg-name">{ev.title}</span>
          </div>
        )}
        <div className="fs-card-tags">
          {cancelled && <span className="fs-tag cancel">ATŠAUKTAS</span>}
          {upcoming && !cancelled && <span className="fs-tag up">BŪSIMAS</span>}
        </div>
        <span className="fs-card-date">{fmtRange(ev.start_date, ev.end_date)}</span>
      </div>

      <div className="fs-card-body">
        <h3 className="fs-card-title">{ev.title}</h3>
        {ev.city && <span className="fs-card-city">{Icon.pin}{ev.city}</span>}

        {lu.length > 0 ? (
          <div className="fs-card-lineup">
            <AvatarStack artists={lu.map(x => x.artist)} max={4} />
            <span className="fs-card-lineup-txt">
              {headNames.join(', ')}{lu.length > headNames.length ? ` +${lu.length - headNames.length}` : ''}
            </span>
          </div>
        ) : (
          <span className="fs-card-city" style={{ opacity: 0.6 }}>{Icon.note}Line-up netrukus</span>
        )}
      </div>
    </Link>
  )
}

/* ────────────────────────────────────────────────────────────────
 * CSS
 * ──────────────────────────────────────────────────────────────── */
const FS_CSS = `
.fs-wrap { max-width:var(--page-max); margin:0 auto; padding:var(--page-pad-top) var(--page-pad-x) var(--page-pad-bottom); font-family:'DM Sans',system-ui,sans-serif; }
@media(max-width:640px){ .fs-wrap { padding-left:var(--page-pad-x-sm); padding-right:var(--page-pad-x-sm); } }

/* HERO */
.fs-hero { display:block; position:relative; border-radius:22px; overflow:hidden; margin-bottom:26px; min-height:330px;
  border:1px solid var(--border-default,rgba(255,255,255,0.08)); background:var(--bg-elevated); }
.fs-hero-bg { position:absolute; inset:0; background-size:cover; background-position:center; transform:scale(1.04); transition:transform .6s ease;
  background-color:#0c1622; }
.fs-hero:hover .fs-hero-bg { transform:scale(1.08); }
.fs-hero-grad { position:absolute; inset:0; background:linear-gradient(180deg, rgba(8,12,18,0.15) 0%, rgba(8,12,18,0.55) 45%, rgba(8,12,18,0.94) 100%); }
.fs-hero-inner { position:relative; z-index:2; display:flex; flex-direction:column; align-items:flex-start; justify-content:flex-end; gap:10px;
  min-height:330px; padding:30px clamp(20px,4vw,42px); }
.fs-hero-badge { font-family:'Outfit',sans-serif; font-size:11px; font-weight:800; letter-spacing:.04em; padding:5px 12px; border-radius:100px;
  background:rgba(6,182,212,0.92); color:#04121a; }
.fs-hero-title { font-family:'Outfit',sans-serif; font-weight:900; font-size:clamp(26px,4.4vw,46px); line-height:1.04; letter-spacing:-.02em; color:#fff;
  text-shadow:0 3px 24px rgba(0,0,0,.45); max-width:760px; }
.fs-hero-meta { display:flex; flex-wrap:wrap; gap:16px; }
.fs-hero-meta span { display:inline-flex; align-items:center; gap:6px; font-family:'Outfit',sans-serif; font-size:13px; font-weight:700; color:#dbe7f5; }
.fs-hero-meta svg { opacity:.85; }
.fs-hero-lineup { font-family:'Outfit',sans-serif; font-size:13.5px; font-weight:700; color:rgba(255,255,255,0.78); letter-spacing:.01em; max-width:680px; }
.fs-hero-stack { margin-top:2px; }

/* Antraštė */
.fs-head { margin-bottom:var(--page-head-gap); }
.fs-head h1 { font-family:'Outfit',sans-serif; font-weight:var(--page-h1-weight); letter-spacing:var(--page-h1-tracking); font-size:var(--page-h1-size); line-height:var(--page-h1-line); color:var(--text-primary); }
.fs-head p { color:var(--page-sub-color); font-size:var(--page-sub-size); line-height:var(--page-sub-line); margin-top:6px; max-width:var(--page-sub-max); }

/* Filtrai */
.fs-fbar { display:flex; flex-wrap:wrap; gap:7px; align-items:center; padding:11px 12px; border-radius:14px;
  background:var(--bg-surface); border:1px solid var(--border-default,rgba(255,255,255,0.08)); margin-bottom:24px; }
.fs-divider { width:1px; height:22px; background:var(--border-default,rgba(255,255,255,0.1)); margin:0 2px; }
.fs-searchbox { display:inline-flex; align-items:center; gap:7px; padding:0 11px; height:34px; border-radius:100px; flex:1; min-width:200px; max-width:340px;
  background:var(--bg-hover); border:1px solid var(--border-default,rgba(255,255,255,0.08)); }
.fs-searchbox input { flex:1; background:transparent; border:none; outline:none; color:var(--text-primary); font-size:13px; font-family:'DM Sans',sans-serif; min-width:0; }
.fs-search-ic { color:var(--text-faint); display:flex; }
.fs-search-x { background:none; border:none; color:var(--text-faint); cursor:pointer; font-size:12px; }

.fs-chip { display:inline-flex; align-items:center; gap:6px; padding:6px 13px; border-radius:100px; font-size:12.5px; font-weight:600;
  font-family:'Outfit',sans-serif; background:var(--bg-hover); border:1px solid var(--border-default,rgba(255,255,255,0.08));
  color:var(--text-secondary); transition:all .15s; white-space:nowrap; cursor:pointer; line-height:1.3; }
.fs-chip:hover { color:var(--text-primary); border-color:rgba(249,115,22,0.4); }
.fs-chip.on { background:var(--accent-orange); border-color:var(--accent-orange); color:#fff; }
.fs-chip svg { display:block; }
.fs-reset { padding:6px 11px; border-radius:100px; font-size:12px; font-weight:700; font-family:'Outfit',sans-serif; color:var(--accent-orange); background:transparent; border:none; cursor:pointer; white-space:nowrap; }
.fs-count { margin-left:auto; font-size:12px; font-weight:700; color:var(--text-faint); font-family:'Outfit',sans-serif; background:var(--bg-hover); border-radius:100px; padding:4px 11px; }

/* Popover */
.fs-pop { position:absolute; top:calc(100% + 8px); left:0; z-index:50; padding:11px; background:var(--bg-surface);
  border:1px solid var(--border-default,rgba(255,255,255,0.1)); border-radius:14px; box-shadow:0 14px 40px rgba(0,0,0,0.32); }
.fs-pop-list { display:flex; flex-direction:column; gap:2px; max-height:280px; overflow-y:auto; }
.fs-opt { display:flex; align-items:center; gap:8px; text-align:left; width:100%; padding:8px 10px; border-radius:9px; font-size:13px; font-weight:600;
  font-family:'Outfit',sans-serif; cursor:pointer; background:transparent; border:none; color:var(--text-secondary); transition:all .12s; }
.fs-opt:hover { background:var(--bg-hover); color:var(--text-primary); }
.fs-opt.on { color:var(--accent-orange); }
.fs-check { width:16px; height:16px; border-radius:5px; border:1.5px solid; display:flex; align-items:center; justify-content:center; font-size:10px; color:#fff; flex-shrink:0; }
.fs-pop-clear { margin-top:9px; width:100%; padding:7px; border-radius:9px; font-size:12px; font-weight:700; font-family:'Outfit',sans-serif; cursor:pointer; background:var(--bg-hover); border:none; color:var(--text-secondary); }

/* Sekcijos */
.fs-section { margin-bottom:34px; }
.fs-sec-head { display:flex; align-items:center; gap:10px; margin-bottom:16px; font-family:'Outfit',sans-serif; font-weight:800; font-size:13px;
  text-transform:uppercase; letter-spacing:.07em; color:var(--text-primary); }
.fs-sec-head i { flex:1; height:1px; background:var(--border-default,rgba(255,255,255,0.08)); }
.fs-sec-dot { width:8px; height:8px; border-radius:50%; background:var(--accent-orange); box-shadow:0 0 0 4px rgba(249,115,22,0.18); }
.fs-year { margin-bottom:24px; }
.fs-year-label { display:flex; align-items:center; gap:9px; margin-bottom:12px; font-family:'Outfit',sans-serif; font-weight:800; font-size:15px; color:var(--accent-orange,#f97316); }
.fs-year-label span { font-size:10.5px; font-weight:700; color:var(--text-faint); background:var(--bg-hover); border-radius:100px; padding:2px 8px; }

/* Tinklelis */
.fs-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:18px; }
@media(max-width:640px){ .fs-grid { grid-template-columns:1fr; gap:14px; } }

/* Kortelė */
.fs-card { display:block; border-radius:16px; overflow:hidden; background:var(--bg-surface);
  border:1px solid var(--border-default,rgba(255,255,255,0.07)); transition:transform .18s, border-color .18s, box-shadow .18s; }
.fs-card:hover { transform:translateY(-3px); border-color:rgba(249,115,22,0.4); box-shadow:0 14px 30px rgba(0,0,0,0.24); }
.fs-card-img { position:relative; aspect-ratio:16/9; overflow:hidden; background:var(--bg-elevated); }
.fs-card-bg { position:absolute; inset:0; background-size:cover; background-position:center; filter:blur(20px) brightness(.6); transform:scale(1.25); }
.fs-card-fg { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; z-index:1; transition:transform .45s ease; }
.fs-card:hover .fs-card-fg { transform:scale(1.05); }
.fs-card-noimg { width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:9px; padding:16px;
  background:linear-gradient(150deg, rgba(6,182,212,0.28), rgba(13,20,32,0.96)); }
.fs-card-noimg-ic { color:rgba(255,255,255,0.55); display:flex; }
.fs-card-noimg-ic svg { width:26px; height:26px; }
.fs-card-noimg-name { font-family:'Outfit',sans-serif; font-weight:900; font-size:clamp(15px,2vw,19px); line-height:1.15; text-align:center; color:#fff;
  display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
.fs-card-tags { position:absolute; top:9px; left:9px; z-index:2; display:flex; gap:5px; }
.fs-tag { font-family:'Outfit',sans-serif; font-weight:800; font-size:9px; letter-spacing:.04em; padding:3px 8px; border-radius:100px; color:#fff; box-shadow:0 2px 8px rgba(0,0,0,.25); }
.fs-tag.up { background:#06b6d4; color:#04121a; }
.fs-tag.cancel { background:#ef4444; }
.fs-card-date { position:absolute; bottom:9px; left:11px; z-index:2; font-family:'Outfit',sans-serif; font-weight:800; font-size:11.5px; color:#fff;
  text-shadow:0 1px 8px rgba(0,0,0,.6); background:rgba(8,12,18,0.42); padding:3px 9px; border-radius:100px; backdrop-filter:blur(4px); }

.fs-card-body { padding:12px 14px 14px; display:flex; flex-direction:column; gap:7px; }
.fs-card-title { font-family:'Outfit',sans-serif; font-weight:800; font-size:16px; line-height:1.2; color:var(--text-primary);
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.fs-card:hover .fs-card-title { color:var(--accent-orange); }
.fs-card-city { display:inline-flex; align-items:center; gap:5px; font-size:12px; font-weight:600; color:var(--text-muted); }
.fs-card-city svg { opacity:.7; flex-shrink:0; }
.fs-card-lineup { display:flex; align-items:center; gap:9px; margin-top:2px; }
.fs-card-lineup-txt { font-size:11.5px; font-weight:600; color:var(--text-secondary); line-height:1.25;
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }

/* Avataro krūva */
.fs-stack { display:flex; align-items:center; }
.fs-av { width:30px; height:30px; border-radius:50%; overflow:hidden; flex-shrink:0; margin-left:-9px; border:2px solid var(--bg-surface);
  display:flex; align-items:center; justify-content:center; }
.fs-av:first-child { margin-left:0; }
.fs-av img { width:100%; height:100%; object-fit:cover; }
.fs-av-i { font-family:'Outfit',sans-serif; font-size:11px; font-weight:800; color:rgba(255,255,255,0.55); }
.fs-av-more { background:var(--bg-hover); font-family:'Outfit',sans-serif; font-size:10px; font-weight:800; color:var(--text-secondary); }
.fs-hero-stack .fs-av { width:38px; height:38px; border-color:rgba(8,12,18,0.6); }
.fs-hero-stack .fs-av-i { font-size:13px; }

/* Empty */
.fs-empty { max-width:520px; margin:60px auto; text-align:center; }
.fs-empty-ic { display:flex; justify-content:center; opacity:.45; }
.fs-empty-ic svg { width:46px; height:46px; }
.fs-empty h3 { font-family:'Outfit',sans-serif; font-weight:800; font-size:19px; margin:10px 0 4px; color:var(--text-primary); }
.fs-empty p { color:var(--text-muted); font-size:13px; }
.fs-mini { margin-top:14px; padding:8px 16px; border-radius:100px; font-size:12.5px; font-weight:700; font-family:'Outfit',sans-serif; cursor:pointer; background:var(--accent-orange); color:#fff; border:none; }
`
