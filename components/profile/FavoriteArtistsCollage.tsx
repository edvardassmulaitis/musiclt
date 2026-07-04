'use client'

// components/profile/FavoriteArtistsCollage.tsx
//
// V11.7 — redesign'inta į kvadratinius tiles (anksčiau buvo per daug ištemptų
// stačiakampių, žmonių foto nukerpdavo veidus). Bento layout'as:
//   • Top atlikėjas (didžiausias affinity) — 2x2 didelis kvadratas
//   • Top 2-3 — 2x2 vidutiniai kvadratai? Ne — paliekam vieną didelį, kiti
//     1x1 maži kvadratai
//   • Likę — 1x1 kvadratai
//   • Paskutinis matomas tile — „+N daugiau"
//
// Grid: 4-col desktop, mažesni screens 3-col / 2-col. Visi tiles aspect-square
// arba spans 2x2 (still square). Niekas ne-elongated.

import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'

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
  // V18: rodom nario PASIRINKTA tvarka (sort_order iš „Mano muzika" topo) —
  // #1 = didelis hero tile. NEBE re-sort'inam pagal affinity (anksčiau rodė ne tuos).
  const shown = artists.slice(0, maxShown)
  const remaining = Math.max(totalCount - shown.length, 0)

  return (
    <div
      className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-2.5"
      style={{ gridAutoFlow: 'dense' }}
    >
      {shown.map((a, i) => {
        // Top 1 — 2x2 didelis tile (square shape per 2 cols/rows).
        const isHero = i === 0
        const cls = isHero
          ? 'col-span-2 row-span-2 aspect-square'
          : 'col-span-1 row-span-1 aspect-square'
        const score = a.affinity_score || 0
        return (
          <Link
            key={a.id}
            href={`/atlikejai/${a.slug}`}
            className={`group relative rounded-xl overflow-hidden transition hover:-translate-y-0.5 ${cls}`}
            style={{ background: 'var(--card-surface, var(--bg-elevated))' }}
            title={score > 0 ? `${a.name} · ${score} pamėgti` : a.name}
          >
            {a.cover_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={proxyImg(a.cover_image_url, isHero ? 720 : 360)}
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
                  fontSize: isHero ? '5rem' : '2rem',
                }}
              >
                {a.name?.[0]?.toUpperCase() || '?'}
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/15 to-transparent" />

            {score > 0 && isHero && (
              <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full backdrop-blur-md text-[12px] font-extrabold uppercase tracking-wider flex items-center gap-1"
                   style={{ background: 'rgba(0,0,0,0.45)', color: 'rgba(255,255,255,0.95)', border: '1px solid rgba(255,255,255,0.18)' }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
                {score}
              </div>
            )}

            <div className="absolute bottom-0 left-0 right-0 p-2 sm:p-2.5">
              <p
                className={`font-extrabold text-white leading-tight line-clamp-2 ${isHero ? 'text-base sm:text-lg' : 'text-xs sm:text-sm'}`}
                style={{ fontFamily: "'Outfit', sans-serif" }}
              >
                {a.name}
              </p>
              {isHero && (a.liked_album_count || a.liked_track_count) ? (
                <p
                  className="mt-0.5 text-[12px] uppercase tracking-wider font-bold"
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
          className="aspect-square rounded-xl flex flex-col items-center justify-center transition hover:scale-[1.02] hover:border-[var(--accent-orange)] col-span-1 row-span-1"
          style={{
            background: 'var(--card-bg)',
            border: '1px dashed var(--border-default)',
            color: 'var(--text-secondary)',
          }}
          title={`Atidaryti visus (${totalCount})`}
        >
          <span className="text-xl sm:text-2xl font-black" style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--accent-orange)' }}>
            +{remaining.toLocaleString('lt-LT')}
          </span>
          <span className="mt-0.5 text-[12px] font-bold uppercase tracking-wider" style={{ fontFamily: "'Outfit', sans-serif" }}>
            daugiau
          </span>
        </button>
      )}
    </div>
  )
}
