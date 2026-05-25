'use client'

// components/profile/DailyPicksCards.tsx
//
// V11.7 — redesign'inta kompaktiška kortelė:
//   ► 16:9 thumbnail (YT mqdefault iš track.video_url → cover_url → artist
//     cover) — overlay'aus date + likes top corners + day rank top-right
//   ► Apačioje: artist name (highlight) + track title + comment (italic)
//   ► Pending kortelė (be track'o): subtle mėnesio tint + Laukia importavimo
//
// h-scroll row'oj kiekviena kortelė ~230px (DailyPicksScrollRow wrapper'is
// nustato kortelės plotį per w-[...]).

import Link from 'next/link'

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
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
      {picks.map((p) => <DailyPickCard key={p.id} pick={p} />)}
    </div>
  )
}

function DailyPickCard({ pick }: { pick: Pick }) {
  const track = pick.tracks
  const artist = track && (Array.isArray((track as any).artists) ? (track as any).artists[0] : track.artists)
  const thumb = ytThumb(track?.video_url) || track?.cover_url || artist?.cover_image_url || null
  const known = !!track

  const date = new Date(pick.picked_on)
  const day = date.getDate()
  const monthIdx = date.getMonth()
  const monthFull = MONTH_LT[monthIdx]
  const monthShort = monthFull.slice(0, 3)
  const year = date.getFullYear()
  const tintRgb = MONTH_TINT[monthIdx].join(',')

  // Resolved track — link į dainos puslapį (su YT iframe + lyrics + komentarai)
  const href = known && artist
    ? `/dainos/${artist.slug}-${track!.slug || track!.id}-${track!.id}`
    : null

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    href
      ? <Link href={href} className="group flex flex-col rounded-xl overflow-hidden transition hover:-translate-y-0.5 h-full"
              style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)' }}>
          {children}
        </Link>
      : <div className="group flex flex-col rounded-xl overflow-hidden h-full"
             style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)' }}>
          {children}
        </div>
  )

  return (
    <Wrapper>
      {/* Hero: 16:9 thumbnail su date overlay + likes */}
      <div className="relative aspect-video w-full overflow-hidden flex-shrink-0"
           style={{ background: thumb ? 'transparent' : `linear-gradient(135deg, rgba(${tintRgb}, 0.30), rgba(${tintRgb}, 0.10))` }}>
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt=""
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-4xl font-black"
                  style={{ fontFamily: "'Outfit', sans-serif", color: `rgba(${tintRgb}, 0.45)` }}>
              {day}
            </span>
          </div>
        )}
        {thumb && (
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-black/40" />
        )}

        {/* Date — top-left pill */}
        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md backdrop-blur-sm flex items-baseline gap-1"
             style={{ background: 'rgba(0,0,0,0.55)' }}>
          <span className="text-[12px] font-black leading-none text-white"
                style={{ fontFamily: "'Outfit', sans-serif" }}>{day}</span>
          <span className="text-[8.5px] uppercase tracking-wider text-white/75 font-bold">
            {monthShort} {String(year).slice(2)}
          </span>
        </div>

        {/* Likes — top-right */}
        {((pick.like_count || 0) > 0 || (track?.like_count || 0) > 0) && (
          <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md backdrop-blur-sm text-[10px] font-extrabold text-white flex items-center gap-1"
               style={{ background: 'rgba(0,0,0,0.55)' }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
            {pick.like_count || track?.like_count}
          </div>
        )}
      </div>

      {/* Bottom: artist + title + comment */}
      <div className="p-2.5 flex flex-col gap-1 flex-1 min-h-[80px]">
        {known ? (
          <>
            <p className="text-[9px] font-extrabold uppercase tracking-widest truncate"
               style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--accent-orange)' }}>
              {artist?.name || 'Atlikėjas'}
            </p>
            <h3 className="text-[13px] font-extrabold leading-tight line-clamp-2 group-hover:text-[var(--accent-orange)] transition"
                style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-primary)' }}>
              {track!.title}
            </h3>
          </>
        ) : (
          <>
            <p className="text-[9px] font-extrabold uppercase tracking-widest"
               style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-faint)' }}>
              Laukia importavimo
            </p>
            <p className="text-[11px] font-mono"
               style={{ color: 'var(--text-muted)' }}>
              music.lt #{pick.legacy_track_id}
            </p>
          </>
        )}
        {pick.comment && (
          <p className="mt-auto text-[11px] italic line-clamp-2 leading-snug"
             style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}
             title={pick.comment}>
            „{pick.comment}"
          </p>
        )}
      </div>
    </Wrapper>
  )
}
