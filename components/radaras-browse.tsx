'use client'

// Radaro tinklelis su VIRŠUJE esančiais funkciniais filtrais (client-side):
// šalis (Visi / Lietuva / Užsienio) + stilius. Be puslapio perkrovimo.

import { useState, useMemo } from 'react'
import type { RadarArtist } from '@/lib/radaras-shared'
import { styleShort, isLtCountry, isMainStyle } from '@/lib/radaras-shared'
import { EmergingTile } from '@/components/radaras-ui'

type Country = 'all' | 'lt' | 'world'

export default function RadarBrowse({ artists, hideCountry = false }: { artists: RadarArtist[]; hideCountry?: boolean }) {
  const [country, setCountry] = useState<Country>('all')
  const [style, setStyle] = useState<string | null>(null)

  const ltCount = useMemo(() => artists.filter((a) => isLtCountry(a.country)).length, [artists])
  const worldCount = artists.length - ltCount
  // Šalies filtrą rodom kai yra užsienio atlikėjų (kitaip viskas LT — nereikia).
  // hideCountry — kai puslapis JAU atskyrė į LT/užsienio sekcijas (toggle nereikalingas).
  const showCountry = worldCount > 0 && !hideCountry

  const byCountry = useMemo(() => {
    if (country === 'all') return artists
    return artists.filter((a) => isLtCountry(a.country) === (country === 'lt'))
  }, [country, artists])

  // Stilių chip'ai — TIK 8 pagrindiniai stiliai (kitus genre'us ignoruojam).
  const styleList = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of byCountry) for (const g of a.genres) if (isMainStyle(g)) m.set(g, (m.get(g) || 0) + 1)
    return [...m.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n)
  }, [byCountry])

  const filtered = useMemo(
    () => (style ? byCountry.filter((a) => a.genres.includes(style)) : byCountry),
    [style, byCountry],
  )

  return (
    <div>
      {/* Šalies filtras */}
      {showCountry && (
        <div className="rd-filterrow">
          <span className="rd-flabel">Šalis</span>
          <button className={`rd-chip${country === 'all' ? ' on' : ''}`} onClick={() => setCountry('all')}>Visi <em>{artists.length}</em></button>
          <button className={`rd-chip${country === 'lt' ? ' on' : ''}`} onClick={() => setCountry('lt')}>🇱🇹 Lietuva <em>{ltCount}</em></button>
          <button className={`rd-chip${country === 'world' ? ' on' : ''}`} onClick={() => setCountry('world')}>🌍 Užsienio <em>{worldCount}</em></button>
        </div>
      )}

      {/* Stiliaus filtras */}
      {styleList.length > 0 && (
        <div className="rd-filterbar" role="tablist" aria-label="Filtruoti pagal stilių">
          <button className={`rd-chip${style === null ? ' on' : ''}`} onClick={() => setStyle(null)}>Visi stiliai <em>{byCountry.length}</em></button>
          {styleList.map((s) => (
            <button key={s.name} className={`rd-chip${style === s.name ? ' on' : ''}`}
              onClick={() => setStyle(style === s.name ? null : s.name)}>
              {styleShort(s.name)} <em>{s.n}</em>
            </button>
          ))}
        </div>
      )}

      {filtered.length > 0 ? (
        <div className="rd-grid">{filtered.map((a) => <EmergingTile key={a.id} a={a} />)}</div>
      ) : (
        <div className="rd-empty">Šioje atrankoje kol kas nieko nėra — pažiūrėk kitą filtrą.</div>
      )}
    </div>
  )
}
