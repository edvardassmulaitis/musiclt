'use client'
// components/ArtistOverviewCard.tsx
//
// Vieninga atlikėjo „overview" kortelė — naudojama track/album modaluose IR
// puslapiuose, kai NĖRA komentarų (vietoj „smulkios" išsklaidytos kortelės su
// atskira aprašymo pastraipa). Viena vientisa kortelė:
//
//   ┌──────────────────────────────────────────────┐
//   │ ┌──────┐  ATLIKĖJAS                           │
//   │ │ foto │  Vardas Pavardenis                   │
//   │ │      │  [žanras] [žanras] [žanras]          │
//   │ └──────┘                                      │
//   │  Aprašymas pilnu pločiu, gerai skaitomas,     │
//   │  prijungtas prie tos pačios kortelės…         │
//   │  Daugiau apie atlikėją →                      │
//   └──────────────────────────────────────────────┘
//
// CTA (komentarų kvietimas) lieka ATSKIRAS elementas iškvietimo vietoje —
// kortelė fokusuojasi tik į atlikėją.

import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'

export function ArtistOverviewCard({
  slug, name, photoUrl, genres = [], description, size = 'md', className = '',
}: {
  slug: string
  name: string
  photoUrl?: string | null
  genres?: string[]
  description?: string | null
  /** sm = puslapiuose/kompaktiškose vietose, md = modaluose (default). */
  size?: 'sm' | 'md'
  className?: string
}) {
  const photo = size === 'sm' ? 76 : 88
  const href = `/atlikejai/${slug}`
  return (
    <div className={[
      'overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)]',
      className,
    ].join(' ')}>
      {/* Header row — foto + kicker + vardas + žanrai */}
      <div className="flex items-center gap-3.5 px-3.5 pt-3.5 pb-2.5">
        <Link href={href} aria-label={name} className="group shrink-0">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={proxyImg(photoUrl)}
              alt={name}
              referrerPolicy="no-referrer"
              style={{ objectPosition: 'center top', width: photo, height: photo }}
              className="rounded-xl object-cover ring-1 ring-[var(--border-subtle)] transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div
              style={{ width: photo, height: photo }}
              className="flex items-center justify-center rounded-xl bg-gradient-to-br from-[var(--bg-elevated)] to-[var(--bg-surface)] font-['Outfit',sans-serif] text-[30px] font-bold text-[var(--text-muted)] opacity-50"
            >
              {name.charAt(0)}
            </div>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="font-['Outfit',sans-serif] text-[11.5px] font-extrabold uppercase tracking-[0.16em] text-[var(--text-faint)]">
            Atlikėjas
          </div>
          <Link
            href={href}
            className="mt-0.5 block font-['Outfit',sans-serif] text-[15px] font-extrabold leading-tight text-[var(--text-primary)] no-underline transition-colors hover:text-[var(--accent-orange)]"
          >
            {name}
          </Link>
          {genres.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {genres.map(g => (
                <span
                  key={g}
                  className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 font-['Outfit',sans-serif] text-[12px] font-semibold text-[var(--text-muted)]"
                >
                  {g}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Aprašymas — pilnu pločiu, prijungtas prie kortelės (ne atskira pastraipa) */}
      {description && (
        <div className="px-3.5 pb-3.5">
          <p className="line-clamp-5 text-[14.5px] leading-[1.65] text-[var(--text-secondary)]">
            {description}
          </p>
          <Link
            href={href}
            className="mt-2 inline-flex items-center gap-1 font-['Outfit',sans-serif] text-[13px] font-extrabold text-[var(--accent-orange)] no-underline hover:underline"
          >
            Daugiau apie atlikėją
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>
      )}
    </div>
  )
}

export default ArtistOverviewCard
