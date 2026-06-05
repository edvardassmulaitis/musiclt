'use client'

import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
import { ListingCard } from '@/components/skelbimai/ListingCard'
import {
  SUBTYPES, CITIES, INSTRUMENTS, GENRES,
  LISTING_TYPES,
  type Listing, type ListingType, type Option,
} from '@/lib/skelbimai'

/* Kategorijos naršyklė — filtrų juosta renginių/naujienų stiliumi (.sk-chip
 * pill'ai + popover'ai). type=null → bendra paieška. */

type Props = {
  type: ListingType | null
  initialListings: Listing[]
  initialQ?: string
}

const chevron = <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>

/* Chip su popover'u (outside-click uždarymas). */
function ChipDropdown({ id, label, on, openId, setOpenId, width, children }: {
  id: string; label: string; on: boolean
  openId: string | null; setOpenId: (v: string | null) => void
  width?: number; children: ReactNode
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
      <button type="button" onClick={() => setOpenId(open ? null : id)} className={`sk-chip${on ? ' on' : ''}`}>
        <span>{label}</span><span style={{ opacity: 0.7 }}>{chevron}</span>
      </button>
      {open && <div className="sk-pop" style={{ width: width ?? 'auto' }}>{children}</div>}
    </div>
  )
}

export function CategoryBrowser({ type, initialListings, initialQ = '' }: Props) {
  const [listings, setListings] = useState<Listing[]>(initialListings)
  const [loading, setLoading] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const [q, setQ] = useState(initialQ)
  const [subtype, setSubtype] = useState('')
  const [city, setCity] = useState('')
  const [instrument, setInstrument] = useState('')
  const [genre, setGenre] = useState('')
  const [sort, setSort] = useState('newest')

  const showInstrument = type === 'rysiai'
  const showGenre = type === 'rysiai' || type === 'ploksteles'
  const showPrice = type === 'paslaugos' || type === 'instrumentai' || type === 'ploksteles' || type === 'kita'
  const subtypes: Option[] = type ? (SUBTYPES[type] || []) : []

  const fetchListings = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams()
    if (type) p.set('type', LISTING_TYPES[type].slug)
    if (q.trim()) p.set('q', q.trim())
    if (subtype) p.set('subtype', subtype)
    if (city) p.set('city', city)
    if (instrument) p.set('instrument', instrument)
    if (genre) p.set('genre', genre)
    if (sort) p.set('sort', sort)
    p.set('limit', '60')
    try {
      const res = await fetch(`/api/skelbimai?${p.toString()}`)
      const json = await res.json()
      setListings(Array.isArray(json.listings) ? json.listings : [])
    } catch { setListings([]) }
    finally { setLoading(false) }
  }, [type, q, subtype, city, instrument, genre, sort])

  useEffect(() => {
    const t = setTimeout(fetchListings, q !== initialQ ? 350 : 0)
    return () => clearTimeout(t)
  }, [subtype, city, instrument, genre, sort, q]) // eslint-disable-line react-hooks/exhaustive-deps

  const activeCount = [subtype, city, instrument, genre].filter(Boolean).length
  function reset() { setSubtype(''); setCity(''); setInstrument(''); setGenre(''); setQ('') }

  return (
    <div>
      {/* Filtrų juosta */}
      <div className="sk-fbar">
        <input className="sk-search" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Ieškoti…" />

        {/* Potipiai — inline chip'ai */}
        {subtypes.length > 0 && (
          <>
            <span className="sk-divider" />
            <button className={`sk-chip${!subtype ? ' on' : ''}`} onClick={() => setSubtype('')}>Visi</button>
            {subtypes.map(o => (
              <button key={o.value} className={`sk-chip${subtype === o.value ? ' on' : ''}`} onClick={() => setSubtype(subtype === o.value ? '' : o.value)}>{o.label}</button>
            ))}
          </>
        )}

        <span className="sk-divider" />

        {/* Miestas */}
        <ChipDropdown id="city" label={city || 'Miestas'} on={!!city} openId={openId} setOpenId={setOpenId} width={180}>
          <div className="sk-pop-list">
            <button className={`sk-opt${!city ? ' on' : ''}`} onClick={() => { setCity(''); setOpenId(null) }}>Visi miestai</button>
            {CITIES.map(c => <button key={c} className={`sk-opt${city === c ? ' on' : ''}`} onClick={() => { setCity(c); setOpenId(null) }}>{c}</button>)}
          </div>
        </ChipDropdown>

        {showInstrument && (
          <ChipDropdown id="instr" label={INSTRUMENTS.find(i => i.value === instrument)?.label || 'Instrumentas'} on={!!instrument} openId={openId} setOpenId={setOpenId} width={190}>
            <div className="sk-pop-list">
              <button className={`sk-opt${!instrument ? ' on' : ''}`} onClick={() => { setInstrument(''); setOpenId(null) }}>Visi instrumentai</button>
              {INSTRUMENTS.map(o => <button key={o.value} className={`sk-opt${instrument === o.value ? ' on' : ''}`} onClick={() => { setInstrument(o.value); setOpenId(null) }}>{o.label}</button>)}
            </div>
          </ChipDropdown>
        )}

        {showGenre && (
          <ChipDropdown id="genre" label={genre || 'Žanras'} on={!!genre} openId={openId} setOpenId={setOpenId} width={170}>
            <div className="sk-pop-list">
              <button className={`sk-opt${!genre ? ' on' : ''}`} onClick={() => { setGenre(''); setOpenId(null) }}>Visi žanrai</button>
              {GENRES.map(g => <button key={g} className={`sk-opt${genre === g ? ' on' : ''}`} onClick={() => { setGenre(g); setOpenId(null) }}>{g}</button>)}
            </div>
          </ChipDropdown>
        )}

        {showPrice && (
          <>
            <span className="sk-divider" />
            <button className={`sk-chip${sort === 'newest' ? ' on' : ''}`} onClick={() => setSort('newest')}>Naujausi</button>
            <button className={`sk-chip${sort === 'price_asc' ? ' on' : ''}`} onClick={() => setSort('price_asc')}>Kaina ↑</button>
            <button className={`sk-chip${sort === 'price_desc' ? ' on' : ''}`} onClick={() => setSort('price_desc')}>Kaina ↓</button>
          </>
        )}

        {activeCount > 0 && <button className="sk-reset" onClick={reset}>Išvalyti</button>}
        <span className="sk-count">{loading ? '…' : `${listings.length}`}</span>
      </div>

      {/* Rezultatai */}
      {loading ? (
        <p style={{ color: 'var(--text-muted)', padding: '32px 0', textAlign: 'center' }}>Kraunama…</p>
      ) : listings.length === 0 ? (
        <div style={{ padding: '48px 24px', textAlign: 'center', borderRadius: 16, border: '1px dashed var(--border-default)', color: 'var(--text-muted)' }}>
          Nieko nerasta. Pabandyk kitus filtrus arba <a href="/skelbimai/naujas" style={{ color: 'var(--accent-orange)' }}>įdėk savo skelbimą</a>.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
          {listings.map(l => <ListingCard key={l.id} listing={l} />)}
        </div>
      )}

      <style jsx global>{`
        .sk-fbar { display:flex; flex-wrap:wrap; gap:7px; align-items:center; padding:11px 12px; border-radius:14px;
          background:var(--bg-surface); border:1px solid var(--border-default); margin-bottom:22px; }
        .sk-divider { width:1px; height:22px; background:var(--border-default); margin:0 2px; }
        .sk-search { height:34px; min-width:160px; flex:1 1 180px; border-radius:9px; padding:0 12px; font-size:13px;
          background:var(--bg-hover); border:1px solid var(--border-default); color:var(--text-primary); outline:none; }
        .sk-chip { display:inline-flex; align-items:center; gap:6px; padding:6px 13px; border-radius:100px; font-size:12.5px; font-weight:600;
          font-family:'Outfit',sans-serif; background:var(--bg-hover); border:1px solid var(--border-default);
          color:var(--text-secondary); transition:all .15s; white-space:nowrap; cursor:pointer; line-height:1.3; }
        .sk-chip:hover { color:var(--text-primary); border-color:rgba(249,115,22,0.4); }
        .sk-chip.on { background:var(--accent-orange); border-color:var(--accent-orange); color:#fff; }
        .sk-reset { padding:6px 11px; border-radius:100px; font-size:12px; font-weight:700; font-family:'Outfit',sans-serif;
          color:var(--accent-orange); background:transparent; border:none; cursor:pointer; white-space:nowrap; }
        .sk-count { margin-left:auto; font-size:12px; font-weight:700; color:var(--text-faint); font-family:'Outfit',sans-serif;
          background:var(--bg-hover); border-radius:100px; padding:4px 11px; }
        .sk-pop { position:absolute; top:calc(100% + 8px); left:0; z-index:50; padding:10px;
          background:var(--bg-surface); border:1px solid var(--border-default); border-radius:14px; box-shadow:0 14px 40px rgba(0,0,0,0.32); }
        .sk-pop-list { display:flex; flex-direction:column; gap:2px; max-height:280px; overflow-y:auto; }
        .sk-opt { text-align:left; width:100%; padding:8px 10px; border-radius:9px; font-size:13px; font-weight:600;
          font-family:'Outfit',sans-serif; cursor:pointer; background:transparent; border:none; color:var(--text-secondary); transition:all .12s; white-space:nowrap; }
        .sk-opt:hover { background:var(--bg-hover); color:var(--text-primary); }
        .sk-opt.on { color:var(--accent-orange); }
      `}</style>
    </div>
  )
}
