'use client'

// components/profile/DailyPicksCards.tsx
//
// V12 (2026-06-02) — suvienodinta su HOMEPAGE „Dienos daina" kortele (NomCard
// app/page.tsx). Vizualas:
//   ► „floating" 16:9 thumbnail — rounded-xl + border + shadow, hover glow
//     (orange) + img scale 1.06 + saturate, BE išorinio bordered box'o.
//   ► thumb'as per proxyImg() (kaip homepage — weserv CDN, išvengiam mobile
//     image-block'ų; YT mqdefault chain'as fallback'ui).
//   ► apačioje BARE: track title (Outfit 13px extrabold, hover orange) +
//     artist (11.5px muted) + komentaras (italic, line-clamp-2).
//   ► data — subtilus pill thumbnail'o viršuje (kairėj); likes — dešinėj.
//   ► pending kortelė (be track'o) — mėnesio tint placeholder + „Laukia
//     importavimo".

import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'

const MONTH_LT = ['sausio', 'vasario', 'kovo', 'balandžio', 'gegužės', 'birželio',
                  'liepos', 'rugpjūčio', 'rugsėjo', 'spalio', 'lapkričio', 'gruodžio']

const MONTH_TINT = [
  [60, 100, 180], [80, 100, 180], [60, 140, 160], [80, 160, 120],
  [110, 170, 90], [170, 170, 80], [200, 150, 60], [200, 110, 70],
  [180, 100, 110], [160, 90, 130], [100, 90, 130], [60, 80, 130],
]

const YT_RE = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{11})/

function ytThumb(videoUrl: string | null | undefined): string | null {
  if (!videoUrl) return null
  const m = videoUrl.match(YT_RE)
  return m ? `https://img.youtube.com/vi/${m[1]}/mqdefault.jpg` : null
}

// Sutampa su homepage sanitizeTitle — nuvalo legacy HTML/entity junk'ą.
function sanitizeTitle(raw: string | null | undefined): string {
  return String(raw || '').replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim()
}

type Pick = {
  id: string | number
  picked_on: string
  comment?: string | null
  like_count?: number
  legacy_track_id?: number | null
  track_id?: number | null
  tracks?: {
    id: number; slug: string; title: string
    video_url?: string | null
    cover_url?: string | null
    like_count?: number
    artists?: { id: number; slug: string; name: string; cover_image_url?: string | null }
  } | null
}

export function DailyPicksCards({ picks }: { picks: Pick[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
      {picks.map((p) => <DailyPickCard key={p.id} pick={p} />)}
    </div>
  )
}

export function DailyPickCard({ pick }: { pick: Pick }) {
  const track = pick.tracks
  const artist = track && (Array.isArray((track as any).artists) ? (track as any).artists[0] : track.artists)
  const rawThumb = ytThumb(track?.video_url) || track?.cover_url || artist?.cover_image_url || null
  const thumb = rawThumb ? proxyImg(rawThumb) : null
  const known = !!track

  const date = new Date(pick.picked_on)
  const day = date.getDate()
  const monthIdx = date.getMonth()
  const monthShort = MONTH_LT[monthIdx].slice(0, 3)
  const year = date.getFullYear()
  const tintRgb = MONTH_TINT[monthIdx].join(',')
  const likes = pick.like_count || track?.like_count || 0

  // Resolved track — link į dainos puslapį (su YT iframe + lyrics + komentarai)
  const href = known && artist
    ? `/dainos/${artist.slug}-${track!.slug || track!.id}-${track!.id}`
    : null

  const inner = (
    <>
      {/* „Floating" 16:9 thumbnail — homepage NomCard stilius */}
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--cover-placeholder)] shadow-[0_4px_12px_rgba(0,0,0,0.25)] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-[rgba(249,115,22,0.5)] group-hover:shadow-[0_14px_32px_rgba(249,115,22,0.18)]"
           style={thumb ? undefined : { background: `linear-gradient(135deg, rgba(${tintRgb}, 0.30), rgba(${tintRgb}, 0.10))` }}>
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt={sanitizeTitle(track?.title)}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
            style={{ filter: 'saturate(1.05) contrast(1.02)' }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-4xl font-black"
                  style={{ fontFamily: "'Outfit', sans-serif", color: `rgba(${tintRgb}, 0.45)` }}>
              {day}
            </span>
          </div>
        )}
        {/* Hover orange overlay — kaip homepage */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[rgba(249,115,22,0.12)] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        {/* Data — top-left pill */}
        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md backdrop-blur-sm flex items-baseline gap-1"
             style={{ background: 'rgba(0,0,0,0.55)' }}>
          <span className="text-[14px] font-black leading-none text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>{day}</span>
          <span className="text-[10.5px] uppercase tracking-wider text-white/75 font-bold">{monthShort} {String(year).slice(2)}</span>
        </div>

        {/* Likes — top-right */}
        {likes > 0 && (
          <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md backdrop-blur-sm text-[12px] font-extrabold text-white flex items-center gap-1"
               style={{ background: 'rgba(0,0,0,0.55)' }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
            {likes}
          </div>
        )}
      </div>

      {/* Apačioje BARE — title + artist + comment (homepage tipografija) */}
      <div className="mt-1.5 px-0.5">
        {known ? (
          <>
            <p className="m-0 truncate font-['Outfit',sans-serif] text-[14px] font-extrabold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">
              {sanitizeTitle(track!.title)}
            </p>
            <p className="m-0 mt-0.5 truncate text-[13.5px] text-[var(--text-muted)]">{artist?.name || 'Atlikėjas'}</p>
          </>
        ) : (
          <>
            <p className="m-0 font-['Outfit',sans-serif] text-[12px] font-extrabold uppercase tracking-wider text-[var(--text-faint)]">
              Laukia importavimo
            </p>
            <p className="m-0 mt-0.5 text-[13px] font-mono text-[var(--text-muted)]">music.lt #{pick.legacy_track_id}</p>
          </>
        )}
        {pick.comment && (
          <p className="m-0 mt-1 line-clamp-2 text-[12.5px] italic leading-snug text-[var(--text-muted)]" title={pick.comment}>
            „{pick.comment}"
          </p>
        )}
      </div>
    </>
  )

  return href
    ? <Link href={href} className="group flex flex-col no-underline">{inner}</Link>
    : <div className="group flex flex-col">{inner}</div>
}
