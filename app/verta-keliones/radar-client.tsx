'use client'

import { useMemo, useState, useRef, useEffect, type ReactNode } from 'react'
import {
  flagEmoji, tripCostFrom, fmtDate,
  type Concert, type Destination, type ReachMode,
} from '@/lib/verta-keliones-seed'

type ModeFilter = 'all' | ReachMode
type Sort = 'soon' | 'cheap' | 'popular'

const MONTHS_FULL = ['Sausis', 'Vasaris', 'Kovas', 'Balandis', 'Gegužė', 'Birželis', 'Liepa', 'Rugpjūtis', 'Rugsėjis', 'Spalis', 'Lapkritis', 'Gruodis']

const I = {
  plane: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>,
  car: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0M15 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0M5 17H3v-5l2-4h11l3 4v5h-2M5 12h13"/></svg>,
  pin: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>,
  sort: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5h10M11 9h7M11 13h4M3 17l3 3 3-3M6 18V4"/></svg>,
  cal: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
  chevron: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>,
  arrowR: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>,
}

/* Vibrantiškas plakato gradientas pagal atlikėjo vardą (kol nėra nuotraukų). */
const GRADS = [
  'linear-gradient(150deg,#7c3aed,#1e1b4b)',
  'linear-gradient(150deg,#0ea5e9,#0c2a44)',
  'linear-gradient(150deg,#f43f5e,#3a0a1e)',
  'linear-gradient(150deg,#f59e0b,#3a2206)',
  'linear-gradient(150deg,#ec4899,#3a0a26)',
  'linear-gradient(150deg,#6366f1,#181a3a)',
  'linear-gradient(150deg,#14b8a6,#06231f)',
  'linear-gradient(150deg,#ef4444,#3a0f0f)',
]
function gradFor(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return GRADS[h % GRADS.length]
}

/* ── Dropdown (= /koncertai ev-pop pattern) ────────────────────────── */
function Dropdown({ id, openId, setOpenId, label, icon, children, width }: {
  id: string; openId: string | null; setOpenId: (v: string | null) => void
  label: string; icon?: ReactNode; children: ReactNode; width?: number
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
      <button type="button" onClick={() => setOpenId(open ? null : id)} className={`vk-chip${open ? ' on' : ''}`}>
        {icon}<span>{label}</span><span style={{ opacity: 0.7 }}>{I.chevron}</span>
      </button>
      {open && <div className="vk-pop" style={{ width: width ?? 'auto' }}>{children}</div>}
    </div>
  )
}

export default function RadarClient({ concerts, destinations }: { concerts: Concert[]; destinations: Destination[] }) {
  const [mode, setMode] = useState<ModeFilter>('all')
  const [dest, setDest] = useState<string>('all')
  const [month, setMonth] = useState<number | 'all'>('all')
  const [sort, setSort] = useState<Sort>('soon')
  const [openId, setOpenId] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)

  // Deep-link iš /srautas: /verta-keliones#vk-<id> → nuscroll'inam + pažymim kortelę.
  useEffect(() => {
    const h = typeof window !== 'undefined' ? window.location.hash.replace('#', '') : ''
    if (!h || !h.startsWith('vk-')) return
    setFocusId(h)
    const t1 = setTimeout(() => {
      const el = document.getElementById(h)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 250)
    const t2 = setTimeout(() => setFocusId(null), 3200)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  const destMap = useMemo(
    () => Object.fromEntries(destinations.map(d => [d.key, d])) as Record<string, Destination>,
    [destinations],
  )

  const monthsPresent = useMemo(() => {
    const s = new Set<number>()
    concerts.forEach(c => s.add(new Date(c.date).getMonth()))
    return Array.from(s).sort((a, b) => a - b)
  }, [concerts])

  const flightDests = destinations.filter(d => d.reach === 'flight')
  const carDests = destinations.filter(d => d.reach === 'car')

  const list = useMemo(() => {
    const r = concerts.filter(c => {
      const d = destMap[c.destKey]
      if (!d) return false
      if (mode !== 'all' && d.reach !== mode) return false
      if (dest !== 'all' && c.destKey !== dest) return false
      if (month !== 'all' && new Date(c.date).getMonth() !== month) return false
      return true
    })
    return r.sort((a, b) => {
      if (sort === 'cheap') return tripCostFrom(a, destMap[a.destKey]) - tripCostFrom(b, destMap[b.destKey])
      if (sort === 'popular') return b.popularity - a.popularity
      return +new Date(a.date) - +new Date(b.date)
    })
  }, [concerts, destMap, mode, dest, month, sort])

  const anyFilter = mode !== 'all' || dest !== 'all' || month !== 'all'
  const destLabel = dest === 'all' ? 'Kryptis' : destMap[dest]?.city || 'Kryptis'
  const sortLabel = sort === 'soon' ? 'Artimiausi' : sort === 'cheap' ? 'Pigiausia kelionė' : 'Populiariausi'

  function reset() { setMode('all'); setDest('all'); setMonth('all') }

  return (
    <div className="vk-wrap">
      <style>{CSS}</style>

      {/* Head */}
      <div className="vk-head">
        <h1>Verta kelionės</h1>
        <p>Top atlikėjų ir festivalių koncertai užsienyje, pasiekiami pigiu skrydžiu arba mašina iš Lietuvos. Kiekvienam — apytikslė visos kelionės kaina.</p>
      </div>

      {/* Filtrų juosta — viena eilutė */}
      <div className="vk-fbar">
        <button className={`vk-chip${mode === 'all' ? ' on' : ''}`} onClick={() => setMode('all')}>Visi</button>
        <button className={`vk-chip${mode === 'flight' ? ' on' : ''}`} onClick={() => setMode(mode === 'flight' ? 'all' : 'flight')}>{I.plane}<span>Skrydžiu</span></button>
        <button className={`vk-chip${mode === 'car' ? ' on' : ''}`} onClick={() => setMode(mode === 'car' ? 'all' : 'car')}>{I.car}<span>Mašina</span></button>

        <span className="vk-divider" />

        <Dropdown id="dest" openId={openId} setOpenId={setOpenId} label={destLabel} icon={I.pin} width={230}>
          <p className="vk-pop-lbl">Visos kryptys</p>
          <div className="vk-pop-list">
            <button className={`vk-opt${dest === 'all' ? ' on' : ''}`} onClick={() => { setDest('all'); setOpenId(null) }}>Visos kryptys</button>
          </div>
          <p className="vk-pop-lbl">{I.plane} Skrydžiu</p>
          <div className="vk-pop-list">
            {flightDests.map(d => (
              <button key={d.key} className={`vk-opt${dest === d.key ? ' on' : ''}`} onClick={() => { setDest(d.key); setMode('all'); setOpenId(null) }}>
                <span>{flagEmoji(d.countryCode)} {d.city}</span>
                <span className="vk-opt-meta">nuo €{d.priceFrom}</span>
              </button>
            ))}
          </div>
          <p className="vk-pop-lbl">{I.car} Mašina</p>
          <div className="vk-pop-list">
            {carDests.map(d => (
              <button key={d.key} className={`vk-opt${dest === d.key ? ' on' : ''}`} onClick={() => { setDest(d.key); setMode('all'); setOpenId(null) }}>
                <span>{flagEmoji(d.countryCode)} {d.city}</span>
                <span className="vk-opt-meta">{d.driveHours} val</span>
              </button>
            ))}
          </div>
        </Dropdown>

        <Dropdown id="month" openId={openId} setOpenId={setOpenId} label={month === 'all' ? 'Mėnuo' : MONTHS_FULL[month]} icon={I.cal} width={170}>
          <div className="vk-pop-list">
            <button className={`vk-opt${month === 'all' ? ' on' : ''}`} onClick={() => { setMonth('all'); setOpenId(null) }}>Visi mėnesiai</button>
            {monthsPresent.map(m => (
              <button key={m} className={`vk-opt${month === m ? ' on' : ''}`} onClick={() => { setMonth(m); setOpenId(null) }}>{MONTHS_FULL[m]}</button>
            ))}
          </div>
        </Dropdown>

        <Dropdown id="sort" openId={openId} setOpenId={setOpenId} label={sortLabel} icon={I.sort} width={190}>
          <div className="vk-pop-list">
            {([['soon', 'Artimiausi'], ['cheap', 'Pigiausia kelionė'], ['popular', 'Populiariausi']] as [Sort, string][]).map(([k, l]) => (
              <button key={k} className={`vk-opt${sort === k ? ' on' : ''}`} onClick={() => { setSort(k); setOpenId(null) }}>{l}</button>
            ))}
          </div>
        </Dropdown>

        {anyFilter && <button className="vk-reset" onClick={reset}>Išvalyti ✕</button>}
        <span className="vk-count">{list.length} koncertai</span>
      </div>

      {/* Tinklelis */}
      {list.length === 0 ? (
        <div className="vk-empty"><p className="vk-empty-ic">{I.plane}</p><h3>Nieko nerasta</h3><p>Pakeisk filtrus.</p></div>
      ) : (
        <div className="vk-grid">
          {list.map(c => <Card key={c.id} c={c} d={destMap[c.destKey]} focused={focusId === `vk-${c.id}`} />)}
        </div>
      )}

      <p className="vk-note">Demonstraciniai duomenys · realus atlikėjų turų pipeline ruošiamas</p>
    </div>
  )
}

function Card({ c, d, focused }: { c: Concert; d?: Destination; focused?: boolean }) {
  const cost = tripCostFrom(c, d)
  const flight = d?.reach === 'flight'
  const posterStyle = c.image
    ? { backgroundImage: `url(${c.image})` }
    : { background: gradFor(c.artist) }
  const ticket = c.ticketUrl ||
    `https://www.google.com/search?q=${encodeURIComponent(`${c.artist} ${d?.city || ''} 2026 tickets`)}`
  return (
    <a id={`vk-${c.id}`} href={ticket} target="_blank" rel="noopener noreferrer" className={`vk-card${focused ? ' vk-card-focus' : ''}`}>
      <div className={`vk-thumb${c.image ? ' has-img' : ''}`} style={posterStyle}>
        {!c.image && <span className="vk-thumb-name">{c.artist}</span>}
      </div>
      <div className="vk-body">
        <div className="vk-body-top">
          <span className="vk-reach">{flight ? I.plane : I.car}<span>{flagEmoji(d?.countryCode || '')} {d?.city}</span></span>
          {c.isFestival && <span className="vk-fest">FESTIVALIS</span>}
        </div>
        <span className="vk-name">{c.artist}</span>
        <span className="vk-place">{d?.country} · {c.venue}</span>
        <span className="vk-when">{fmtDate(c.date, c.endDate)}{c.verified && <i className="vk-ok" title="Data patvirtinta">✓</i>}</span>
        <div className="vk-foot">
          <span className="vk-price">Kelionė nuo €{cost}</span>
          <span className="vk-cta">Bilietai {I.arrowR}</span>
        </div>
      </div>
    </a>
  )
}

const CSS = `
.vk-wrap { max-width:var(--page-max); margin:0 auto; padding:var(--page-pad-top) var(--page-pad-x) var(--page-pad-bottom); font-family:'DM Sans',system-ui,sans-serif; }
@media(max-width:640px){ .vk-wrap { padding-left:var(--page-pad-x-sm); padding-right:var(--page-pad-x-sm); } }

.vk-head { margin-bottom:var(--page-head-gap); }
.vk-head h1 { font-family:'Outfit',sans-serif; font-weight:var(--page-h1-weight); letter-spacing:var(--page-h1-tracking); font-size:var(--page-h1-size); line-height:var(--page-h1-line); color:var(--text-primary); }
.vk-head p { color:var(--page-sub-color); font-size:var(--page-sub-size); line-height:var(--page-sub-line); margin-top:6px; max-width:var(--page-sub-max); }

/* Filtrų juosta — viena kompaktiška eilutė (= /koncertai) */
.vk-fbar { display:flex; flex-wrap:wrap; gap:7px; align-items:center; padding:11px 12px; border-radius:14px;
  background:var(--bg-surface); border:1px solid var(--border-default,rgba(255,255,255,0.08)); margin-bottom:22px; }
.vk-divider { width:1px; height:22px; background:var(--border-default,rgba(255,255,255,0.1)); margin:0 2px; }

.vk-chip { display:inline-flex; align-items:center; gap:6px; padding:6px 13px; border-radius:100px; font-size:12.5px; font-weight:600;
  font-family:'Outfit',sans-serif; background:var(--bg-hover); border:1px solid var(--border-default,rgba(255,255,255,0.08));
  color:var(--text-secondary); transition:all .15s; white-space:nowrap; cursor:pointer; line-height:1.3; }
.vk-chip:hover { color:var(--text-primary); border-color:rgba(249,115,22,0.4); }
.vk-chip.on { background:var(--accent-orange); border-color:var(--accent-orange); color:#fff; }
.vk-chip svg { display:block; }

.vk-reset { padding:6px 11px; border-radius:100px; font-size:12px; font-weight:700; font-family:'Outfit',sans-serif;
  color:var(--accent-orange); background:transparent; border:none; cursor:pointer; white-space:nowrap; }
.vk-count { margin-left:auto; font-size:12px; font-weight:700; color:var(--text-faint); font-family:'Outfit',sans-serif;
  background:var(--bg-hover); border-radius:100px; padding:4px 11px; }

/* Popover */
.vk-pop { position:absolute; top:calc(100% + 8px); left:0; z-index:50; padding:13px;
  background:var(--bg-surface); border:1px solid var(--border-default,rgba(255,255,255,0.1)); border-radius:14px;
  box-shadow:0 14px 40px rgba(0,0,0,0.32); }
.vk-pop-lbl { display:flex; align-items:center; gap:5px; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; color:var(--text-faint); margin:0 0 8px; font-family:'Outfit',sans-serif; }
.vk-pop-lbl:not(:first-child){ margin-top:13px; }
.vk-pop-lbl svg { width:11px; height:11px; }
.vk-pop-list { display:flex; flex-direction:column; gap:2px; max-height:280px; overflow-y:auto; }
.vk-opt { display:flex; align-items:center; justify-content:space-between; gap:10px; text-align:left; width:100%; padding:8px 10px; border-radius:9px; font-size:13px;
  font-weight:600; font-family:'Outfit',sans-serif; cursor:pointer; background:transparent; border:none; color:var(--text-secondary); transition:all .12s; }
.vk-opt:hover { background:var(--bg-hover); color:var(--text-primary); }
.vk-opt.on { color:var(--accent-orange); }
.vk-opt-meta { font-size:11px; font-weight:700; color:var(--text-faint); }

/* Tinklelis — horizontalios kortelės (2 eilėje desktop, 1 mobile) */
.vk-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(430px,1fr)); gap:16px; }
@media(max-width:920px){ .vk-grid { grid-template-columns:1fr; } }

.vk-card { display:flex; flex-direction:row; border-radius:16px; overflow:hidden; background:var(--bg-surface); text-decoration:none;
  border:1px solid var(--border-default,rgba(255,255,255,0.07)); transition:transform .16s, border-color .16s, box-shadow .16s; }
.vk-card:hover { transform:translateY(-3px); border-color:rgba(249,115,22,0.45); box-shadow:0 14px 32px rgba(0,0,0,0.28); }
.vk-card { scroll-margin-top:90px; }
.vk-card-focus { border-color:var(--accent-orange)!important; box-shadow:0 0 0 3px rgba(249,115,22,0.45), 0 14px 32px rgba(0,0,0,0.28); }

.vk-thumb { position:relative; flex-shrink:0; width:172px; align-self:stretch; min-height:176px;
  background-size:cover; background-position:center 20%; display:flex; align-items:center; justify-content:center; padding:12px; }
@media(max-width:520px){ .vk-thumb { width:124px; min-height:160px; } }
.vk-card:hover .vk-thumb.has-img { background-position:center 16%; }
.vk-thumb-name { font-family:'Outfit',sans-serif; font-weight:900; font-size:clamp(15px,4vw,19px); line-height:1.08; text-align:center; color:#fff;
  text-shadow:0 2px 14px rgba(0,0,0,.5); display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }

.vk-body { flex:1; min-width:0; padding:14px 16px; display:flex; flex-direction:column; gap:3px; }
.vk-body-top { display:flex; align-items:center; gap:6px; margin-bottom:3px; }
.vk-reach { display:inline-flex; align-items:center; gap:5px; padding:4px 9px; border-radius:100px; font-family:'Outfit',sans-serif; font-size:11px; font-weight:700;
  color:var(--text-secondary); background:var(--bg-hover); border:1px solid var(--border-default,rgba(255,255,255,0.08)); }
.vk-reach svg { width:12px; height:12px; }
.vk-fest { font-family:'Outfit',sans-serif; font-weight:800; font-size:9px; letter-spacing:.05em; padding:4px 8px; border-radius:100px; color:#0c2a44; background:#67e8f9; }

.vk-name { font-family:'Outfit',sans-serif; font-weight:900; letter-spacing:-.02em; font-size:20px; line-height:1.1; color:var(--text-primary);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.vk-card:hover .vk-name { color:var(--accent-orange); }
.vk-place { font-size:12.5px; color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.vk-when { font-family:'Outfit',sans-serif; font-weight:700; font-size:12px; color:var(--accent-orange); margin-top:1px; }
.vk-ok { font-style:normal; margin-left:5px; }
.vk-foot { margin-top:auto; padding-top:10px; display:flex; align-items:center; justify-content:space-between; gap:10px; }
.vk-price { font-family:'Outfit',sans-serif; font-weight:800; font-size:12px; color:#fff; padding:5px 11px; border-radius:100px;
  background:rgba(249,115,22,0.92); box-shadow:0 4px 12px rgba(249,115,22,0.3); white-space:nowrap; }
.vk-cta { display:inline-flex; align-items:center; gap:5px; font-family:'Outfit',sans-serif; font-weight:800; font-size:12.5px; color:var(--accent-orange); white-space:nowrap; }
.vk-cta svg { transition:transform .15s; }
.vk-card:hover .vk-cta svg { transform:translateX(3px); }

.vk-empty { max-width:520px; margin:60px auto; text-align:center; }
.vk-empty-ic { font-size:46px; opacity:.5; display:flex; justify-content:center; }
.vk-empty-ic svg { width:42px; height:42px; }
.vk-empty h3 { font-family:'Outfit',sans-serif; font-weight:800; font-size:19px; margin:8px 0 4px; color:var(--text-primary); }
.vk-empty p { color:var(--text-muted); font-size:13px; }

.vk-note { margin-top:26px; text-align:center; font-size:11.5px; color:var(--text-faint); }
`
