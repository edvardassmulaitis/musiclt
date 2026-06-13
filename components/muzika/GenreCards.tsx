// components/muzika/GenreCards.tsx
//
// Stilių kortelės su brand spalvomis (GENRE_COLORS) → /muzikos-stilius/[slug].
// Server component, tikri <Link>'ai — SEO link juice į stilių landing'us.

import Link from 'next/link'
import type { CSSProperties } from 'react'
import { GENRE_COLORS } from '@/lib/genre-colors'
import type { GenreCount } from '@/lib/muzika-hub'

export function GenreCards({ genres }: { genres: GenreCount[] }) {
  const countByName = new Map(genres.map((g) => [g.name, g.n]))
  return (
    <div className="mz-gcards">
      {GENRE_COLORS.map((g) => {
        const n = countByName.get(g.name)
        return (
          <Link
            key={g.name}
            href={g.href}
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
