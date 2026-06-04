'use client'

import { useEffect, useState, useCallback } from 'react'
import { ListingCard } from '@/components/skelbimai/ListingCard'
import {
  SUBTYPES, CITIES, INSTRUMENTS, GENRES,
  LISTING_TYPES,
  type Listing, type ListingType,
} from '@/lib/skelbimai'

/* Kategorijos naršyklė — filtrai + grid. Fetch'ina /api/skelbimai.
 * type=null → bendra paieška (visi tipai). */

type Props = {
  type: ListingType | null
  initialListings: Listing[]
  initialQ?: string
}

const SORTS = [
  { value: 'newest', label: 'Naujausi' },
  { value: 'price_asc', label: 'Kaina ↑' },
  { value: 'price_desc', label: 'Kaina ↓' },
]

export function CategoryBrowser({ type, initialListings, initialQ = '' }: Props) {
  const [listings, setListings] = useState<Listing[]>(initialListings)
  const [loading, setLoading] = useState(false)
  const [showFilters, setShowFilters] = useState(false)

  const [q, setQ] = useState(initialQ)
  const [subtype, setSubtype] = useState('')
  const [city, setCity] = useState('')
  const [instrument, setInstrument] = useState('')
  const [genre, setGenre] = useState('')
  const [sort, setSort] = useState('newest')

  const showInstrument = type === 'rysiai'
  const showGenre = type === 'rysiai' || type === 'ploksteles'
  const showPrice = type === 'paslaugos' || type === 'instrumentai' || type === 'ploksteles'

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
    } catch {
      setListings([])
    } finally {
      setLoading(false)
    }
  }, [type, q, subtype, city, instrument, genre, sort])

  // Debounce paieškos žodžiui; iškart kitiems filtrams.
  useEffect(() => {
    const t = setTimeout(fetchListings, q !== initialQ ? 350 : 0)
    return () => clearTimeout(t)
  }, [subtype, city, instrument, genre, sort, q]) // eslint-disable-line react-hooks/exhaustive-deps

  const activeCount = [subtype, city, instrument, genre].filter(Boolean).length

  const selectStyle: React.CSSProperties = {
    padding: '9px 12px', fontSize: 14, borderRadius: 9,
    background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
    color: 'var(--text-primary)', outline: 'none', minWidth: 140,
  }

  const filterControls = (
    <>
      {type && SUBTYPES[type] && (
        <select value={subtype} onChange={e => setSubtype(e.target.value)} style={selectStyle}>
          <option value="">Visi potipiai</option>
          {SUBTYPES[type].map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
      {showInstrument && (
        <select value={instrument} onChange={e => setInstrument(e.target.value)} style={selectStyle}>
          <option value="">Visi instrumentai</option>
          {INSTRUMENTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
      <select value={city} onChange={e => setCity(e.target.value)} style={selectStyle}>
        <option value="">Visi miestai</option>
        {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      {showGenre && (
        <select value={genre} onChange={e => setGenre(e.target.value)} style={selectStyle}>
          <option value="">Visi žanrai</option>
          {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      )}
      <select value={sort} onChange={e => setSort(e.target.value)} style={selectStyle}>
        {SORTS.filter(s => showPrice || s.value === 'newest').map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
    </>
  )

  return (
    <div>
      {/* Paieška + filtrų juosta */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Ieškoti…"
          style={{
            flex: '1 1 220px', minWidth: 180, padding: '10px 14px', fontSize: 14, borderRadius: 9,
            background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
            color: 'var(--text-primary)', outline: 'none',
          }}
        />
        {/* Desktop filtrai */}
        <div className="sk-filters-desktop" style={{ gap: 10, flexWrap: 'wrap' }}>
          {filterControls}
        </div>
        {/* Mobile filtrų mygtukas */}
        <button
          type="button" onClick={() => setShowFilters(true)} className="sk-filters-btn"
          style={{
            padding: '10px 16px', fontSize: 14, fontWeight: 700, borderRadius: 9,
            background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
            color: 'var(--text-primary)', cursor: 'pointer',
          }}>
          Filtrai{activeCount ? ` (${activeCount})` : ''}
        </button>
      </div>

      {/* Rezultatai */}
      {loading ? (
        <p style={{ color: 'var(--text-muted)', padding: '32px 0', textAlign: 'center' }}>Kraunama…</p>
      ) : listings.length === 0 ? (
        <div style={{
          padding: '48px 24px', textAlign: 'center', borderRadius: 16,
          border: '1px dashed var(--border-default)', color: 'var(--text-muted)',
        }}>
          Nieko nerasta. Pabandyk kitus filtrus arba <a href="/skelbimai/naujas" style={{ color: 'var(--accent-green)' }}>įdėk savo skelbimą</a>.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
          {listings.map(l => <ListingCard key={l.id} listing={l} />)}
        </div>
      )}

      {/* Mobile filtrų modalas */}
      {showFilters && (
        <div
          onClick={() => setShowFilters(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'flex-end',
          }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', maxHeight: '80vh', overflowY: 'auto', padding: '20px 18px 28px',
            background: 'var(--bg-surface)', borderRadius: '18px 18px 0 0',
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <strong style={{ fontSize: 17, color: 'var(--text-primary)' }}>Filtrai</strong>
              <button onClick={() => setShowFilters(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 22, cursor: 'pointer' }}>×</button>
            </div>
            {filterControls}
            <button onClick={() => setShowFilters(false)} style={{
              marginTop: 8, padding: '12px', fontSize: 15, fontWeight: 700, borderRadius: 10,
              background: 'var(--accent-green)', color: '#04140a', border: 'none', cursor: 'pointer',
            }}>Rodyti rezultatus</button>
          </div>
        </div>
      )}

      <style jsx>{`
        .sk-filters-desktop { display: flex; }
        .sk-filters-btn { display: none; }
        @media (max-width: 760px) {
          .sk-filters-desktop { display: none; }
          .sk-filters-btn { display: inline-block; }
        }
      `}</style>
    </div>
  )
}
