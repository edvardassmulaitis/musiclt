'use client'
// components/geo/GeoPicker.tsx
// ────────────────────────────────────────────────────────────────────────────
// Sujungtas vietos pickeris: ŠALIS → MIESTAS → VIETA. Kiekvienas laukas —
// „select arba naujo įvedimas" (datalist). Grąžina ID (kai sutampa su esamu)
// arba pavadinimą (naujam), o serveris (lib/geo.resolveLocation) find-or-
// create'ina trūkstamus, kad DB liktų švari ir sujungta.
//
// Naudojama: /admin/matyti-gyvai approve + /admin/events forma.
// ────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'

export type GeoValue = {
  countryId: number | null
  countryName: string | null
  cityId: number | null
  cityName: string | null
  venueId: number | null
  venueName: string | null
  address: string | null
}

export const EMPTY_GEO: GeoValue = {
  countryId: null, countryName: 'Lietuva', cityId: null, cityName: null,
  venueId: null, venueName: null, address: null,
}

type Country = { id: number; name: string; code: string | null }
type City = { id: number; name: string; country_id: number | null }
type Venue = { id: number; name: string; city: string | null; city_id: number | null; country_id: number | null; address?: string | null }

const norm = (s: string) => s.trim().toLowerCase()

export default function GeoPicker({
  value, onChange, showAddress = false, compact = false,
}: {
  value: GeoValue
  onChange: (v: GeoValue) => void
  showAddress?: boolean
  compact?: boolean
}) {
  const [countries, setCountries] = useState<Country[]>([])
  const [cities, setCities] = useState<City[]>([])
  const [venues, setVenues] = useState<Venue[]>([])

  useEffect(() => {
    let alive = true
    Promise.all([
      fetch('/api/countries').then((r) => r.json()).catch(() => ({ countries: [] })),
      fetch('/api/cities').then((r) => r.json()).catch(() => ({ cities: [] })),
      fetch('/api/venues').then((r) => r.json()).catch(() => ({ venues: [] })),
    ]).then(([c, ci, v]) => {
      if (!alive) return
      setCountries(c.countries || [])
      setCities(ci.cities || [])
      setVenues(v.venues || [])
    })
    return () => { alive = false }
  }, [])

  const citiesForCountry = useMemo(
    () => value.countryId ? cities.filter((c) => c.country_id === value.countryId || c.country_id == null) : cities,
    [cities, value.countryId],
  )
  const venuesForCity = useMemo(
    () => value.cityId ? venues.filter((v) => v.city_id === value.cityId) : venues,
    [venues, value.cityId],
  )

  const inputCls = [
    'w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-primary)] outline-none',
    compact ? 'px-2.5 py-1.5 text-[13px]' : 'px-3 py-2 text-[14px]',
  ].join(' ')
  const labelCls = 'mb-1 block text-[11px] font-bold uppercase tracking-wide text-[var(--text-faint)]'

  // ── Šalis ──
  function onCountry(name: string) {
    const match = countries.find((c) => norm(c.name) === norm(name))
    onChange({
      ...value,
      countryId: match?.id ?? null,
      countryName: name || null,
      // pakeitus šalį — išvalom miestą/vietą, kad neliktų nesuderinta
      cityId: null, cityName: value.cityName, venueId: null, venueName: value.venueName,
    })
  }
  // ── Miestas ──
  function onCity(name: string) {
    const pool = value.countryId ? cities.filter((c) => c.country_id === value.countryId) : cities
    const match = pool.find((c) => norm(c.name) === norm(name)) || cities.find((c) => norm(c.name) === norm(name))
    onChange({ ...value, cityId: match?.id ?? null, cityName: name || null, venueId: null })
  }
  // ── Vieta ──
  function onVenue(name: string) {
    const match = venues.find((v) => norm(v.name) === norm(name))
    if (match) {
      const city = cities.find((c) => c.id === match.city_id)
      onChange({
        ...value,
        venueId: match.id, venueName: match.name,
        cityId: match.city_id ?? value.cityId, cityName: city?.name ?? value.cityName,
        countryId: match.country_id ?? value.countryId,
      })
    } else {
      onChange({ ...value, venueId: null, venueName: name || null })
    }
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className={labelCls}>Šalis</label>
        <select value={value.countryName || 'Lietuva'} onChange={(e) => onCountry(e.target.value)} className={inputCls}>
          {!countries.some((c) => c.name === (value.countryName || 'Lietuva')) && <option value={value.countryName || 'Lietuva'}>{value.countryName || 'Lietuva'}</option>}
          {countries.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls}>Miestas</label>
        <input list="geo-cities" value={value.cityName || ''} onChange={(e) => onCity(e.target.value)} placeholder="Miestas" className={inputCls} />
        <datalist id="geo-cities">{citiesForCountry.map((c) => <option key={c.id} value={c.name} />)}</datalist>
      </div>
      <div className={showAddress ? '' : 'col-span-2'}>
        <label className={labelCls}>Vieta / arena</label>
        <input list="geo-venues" value={value.venueName || ''} onChange={(e) => onVenue(e.target.value)} placeholder="Vieta" className={inputCls} />
        <datalist id="geo-venues">{venuesForCity.map((v) => <option key={v.id} value={v.name} />)}</datalist>
      </div>
      {showAddress && (
        <div>
          <label className={labelCls}>Adresas</label>
          <input value={value.address || ''} onChange={(e) => onChange({ ...value, address: e.target.value || null })} placeholder="Adresas" className={inputCls} />
        </div>
      )}
      {(value.cityName && !value.cityId) && (
        <p className="col-span-2 text-[11px] text-[var(--accent-orange)]">Naujas miestas „{value.cityName}" bus sukurtas.</p>
      )}
      {(value.venueName && !value.venueId) && (
        <p className="col-span-2 text-[11px] text-[var(--accent-orange)]">Nauja vieta „{value.venueName}" bus sukurta.</p>
      )}
    </div>
  )
}
