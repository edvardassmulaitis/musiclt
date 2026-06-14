// components/muzika/GenreCards.tsx
//
// Stilių kortelės su brand spalvomis (GENRE_COLORS).
// Numatytai → /muzikos-stilius/[slug] (SEO link juice). Su `buildHref` —
// /muzika hub'e jos FILTRUOJA vietoje (?stilius=), kad scope+tipas išliktų.
// Server component, tikri <Link>'ai.

import Link from 'next/link'
import type { CSSProperties } from 'react'
import { GENRE_COLORS } from '@/lib/genre-colors'
import type { GenreCount } from '@/lib/muzika-hub'

export function GenreCards({ genres, buildHref }: {
  genres: GenreCount[]
  /** slug = paskutinis g.href segmentas; jei pateiktas — pakeičia nuorodą. */
  buildHref?: (slug: string, name: string) => string
}) {
  const countByName = new Map(genres.map((g) => [g.name, g.n]))
  return (
    <div className="mz-gcards">
      {GENRE_COLORS.map((g) => {
        const n = countByName.get(g.name)
        const slug = g.href.split('/').filter(Boolean).pop() || ''
        return (
          <Link
            key={g.name}
            href={buildHref ? buildHref(slug, g.name) : g.href}
            className="mz-gcard"
            prefetch={false}
            style={{ '--gc': g.hex, '--gcr': g.rgb } as CSSProperties}
          >
            <span className="mz-gcard-name">{g.short}</span>
            {typeof n === 'number' && n > 0 && (
              <span className="mz-gcard-n">{n.toLocaleString('lt-LT')}</span>
            )}
          </Link>
        )
      })}
    </div>
  )
}
