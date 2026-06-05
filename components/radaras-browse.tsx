'use client'

// Radaro tinklelis su VIRŠUJE esančiu funkciniu stilių filtru (client-side).
// Chip'ai filtruoja emerging atlikėjus pagal žanrą — be puslapio perkrovimo.

import { useState, useMemo } from 'react'
import type { RadarArtist, RadarStyle } from '@/lib/radaras-shared'
import { styleLabel } from '@/lib/radaras-shared'
import { EmergingTile } from '@/components/radaras-ui'

export default function RadarBrowse({
  artists, styles,
}: { artists: RadarArtist[]; styles: RadarStyle[] }) {
  const [active, setActive] = useState<string | null>(null)

  const filtered = useMemo(
    () => (active ? artists.filter((a) => a.genres.includes(active)) : artists),
    [active, artists],
  )

  return (
    <div>
      {styles.length > 0 && (
        <div className="rd-filterbar" role="tablist" aria-label="Filtruoti pagal stilių">
          <button
            className={`rd-chip${active === null ? ' on' : ''}`}
            onClick={() => setActive(null)}
            aria-pressed={active === null}
          >
            Visi <em>{artists.length}</em>
          </button>
          {styles.map((s) => (
            <button
              key={s.name}
              className={`rd-chip${active === s.name ? ' on' : ''}`}
              onClick={() => setActive(active === s.name ? null : s.name)}
              aria-pressed={active === s.name}
            >
              {styleLabel(s.name)} <em>{s.n}</em>
            </button>
          ))}
        </div>
      )}

      {filtered.length > 0 ? (
        <div className="rd-grid">
          {filtered.map((a) => <EmergingTile key={a.id} a={a} />)}
        </div>
      ) : (
        <div className="rd-empty">Šiame stiliuje kol kas nieko nėra — pažiūrėk kitą.</div>
      )}
    </div>
  )
}
