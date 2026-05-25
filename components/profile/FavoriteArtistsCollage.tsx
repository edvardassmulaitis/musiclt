'use client'

// components/profile/FavoriteArtistsCollage.tsx
//
// V11 — bento-grid'as user'io mėgstamiems atlikėjams. Tile dydžiai pagal
// affinity_score (kiek pamėgtų albumų + dainų to atlikėjo). Top 1 — didelis
// 2x2 tile, top 2-3 — 2x1 tile, likę — 1x1. Paskutinis matomas tile —
// „+N daugiau" → atidaro MoreItemsModal'ą.
//
// Default sortavimas: pagal `affinity_score DESC` (page.tsx enrichment'as
// jau pridėjo). Tile size'as taip pat pagal score'ą.

import Link from 'next/link'

type Artist = {
  id: number
  slug: string
  name: string
  cover_image_url: string | null
  liked_album_count?: number
  liked_track_count?: number
  affinity_score?: number
}

export function FavoriteArtistsCollage({
  artists, maxShown = 12, totalCount, onOpenMore,
}: {
  artists: Artist[]
  maxShown?: number
  totalCount: number
  onOpenMore: () => void
}) {
  // Sortuojam pagal affinity_score (jei yra), kitaip pagal sort_order'ą iš serverio.
  const sorted = [...artists].sort((a, b) => (b.affinity_score || 0) - (a.affinity_score || 0))
  const shown = sorted.slice(0, maxShown)
  const remaining = Math.max(totalCount - shown.length, 0)

  // 6-col grid: tile spans skirtingi pagal poziciją
  // Pozicija → {colSpan, rowSpan}
  const spanFor = (idx: number): { col: number; row: number } => {
    if (idx === 0) return { col: 3, row: 2 } // hero
    if (idx === 1 || idx === 2) return { col: 3, row: 1 } // sub-hero (greta hero, top + bottom)
    // Likę — 2x1 (3 tiles per row) — bent kol < 9, paskui 1x1 jeigu maxShown didesnis
    if (idx < 9) return { col: 2, row: 1 }
    return { col: 2, row: 1 } // visi vienodi small
  }

  return (
    <div
      className="grid grid-cols-6 gap-2 sm:gap-2.5 auto-rows-[80px] sm:auto-rows-[110px]"
    >
      {shown.map((a, i) => {
        const sp = spanFor(i)
        const isBig = sp.col >= 3 && sp.row >= 2
        const score = a.affinity_score || 0
        return (
          <Link
            key={a.id}
            href={`/atlikejai/${a.slug}`}
            className="group relative rounded-xl overflow-hidden transition hover:-translate-y-0.5"
            style={{
              gridColumn: `span ${sp.col} / span ${sp.col}`,
              gridRow: `span ${sp.row} / span ${sp.row}`,
              background: 'var(--card-surface, var(--bg-elevated))',
            }}
            title={score > 0 ? `${a.name} · ${score} pamėgti` : a.name}
          >
            {a.cover_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={a.cover_image_url}
                alt=""
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
              />
            ) : (
              <div
                className="w-full h-full bg-gradient-to-br from-[#1a2436] to-[#080c12] flex items-center justify-center font-black"
                style={{
                  fontFamily: "'Outfit', sans-serif",
                  color: 'rgba(255,255,255,0.16)',
                  fontSize: isBig ? '4.5rem' : sp.row > 1 ? '3rem' : '2rem',
                }}
              >
                {a.name?.[0]?.toUpperCase() || '?'}
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

            {score > 0 && isBig && (
              <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full backdrop-blur-md text-[10px] font-extrabold uppercase tracking-wider"
                   style={{ background: 'rgba(0,0,0,0.42)', color: 'rgba(255,255,255,0.92)', border: '1px solid rgba(255,255,255,0.15)' }}>
                ♥ {score}
              </div>
            )}

            <div className="absolute bottom-0 left-0 right-0 p-2 sm:p-2.5">
              <p
                className={`font-extrabold text-white leading-tight line-clamp-2 ${isBig ? 'text-base sm:text-lg' : sp.row > 1 ? 'text-sm sm:text-base' : 'text-xs sm:text-sm'}`}
                style={{ fontFamily: "'Outfit', sans-serif" }}
              >
                {a.name}
              </p>
              {isBig && (a.liked_album_count || a.liked_track_count) ? (
                <p
                  className="mt-0.5 text-[10px] uppercase tracking-wider font-bold"
                  style={{ color: 'rgba(255,255,255,0.65)', fontFamily: "'Outfit', sans-serif" }}
                >
                  {(a.liked_album_count || 0) > 0 && `${a.liked_album_count} alb.`}
                  {(a.liked_album_count || 0) > 0 && (a.liked_track_count || 0) > 0 && ' · '}
                  {(a.liked_track_count || 0) > 0 && `${a.liked_track_count} d.`}
                </p>
              ) : null}
            </div>
          </Link>
        )
      })}

      {remaining > 0 && (
        <button
          type="button"
          onClick={onOpenMore}
          className="rounded-xl flex flex-col items-center justify-center transition hover:scale-[1.02] hover:border-[var(--accent-orange)]"
          style={{
            gridColumn: 'span 2 / span 2',
            gridRow: 'span 1 / span 1',
            background: 'var(--card-bg)',
            border: '1px dashed var(--border-default)',
            color: 'var(--text-secondary)',
          }}
          title={`Atidaryti visus (${totalCount})`}
        >
          <span className="text-xl sm:text-2xl font-black" style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--accent-orange)' }}>
            +{remaining.toLocaleString('lt-LT')}
          </span>
          <span className="mt-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ fontFamily: "'Outfit', sans-serif" }}>
            daugiau
          </span>
        </button>
      )}
    </div>
  )
}
