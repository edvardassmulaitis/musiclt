'use client'

// components/profile/DailyPicksCards.tsx
//
// V7 — kompaktiškos elegantiškos kortelės. Atsisakyta loud per-month
// gradient placeholder'ių; pending track'ai (be cover image) rodomi
// subtle dark card'e su date emphasis. Resolved track'ai rodomi su
// cover image kaip background. 4-col grid desktop, kompaktiškas 1:1
// aspect ratio.

import Link from 'next/link'

const MONTH_LT = ['sausio', 'vasario', 'kovo', 'balandžio', 'gegužės', 'birželio',
                  'liepos', 'rugpjūčio', 'rugsėjo', 'spalio', 'lapkričio', 'gruodžio']

// Diskretiškas mėnesio accent (RGB tuple, naudojama vos vos color hint'ui)
const MONTH_TINT = [
  [60, 100, 180],   // sausis — winter cold
  [80, 100, 180],   // vasaris
  [60, 140, 160],   // kovas — early spring
  [80, 160, 120],   // balandis
  [110, 170, 90],   // gegužė — fresh
  [170, 170, 80],   // birželis — warm
  [200, 150, 60],   // liepa — peak summer
  [200, 110, 70],   // rugpjūtis — late summer
  [180, 100, 110],  // rugsėjis — autumn
  [160, 90, 130],   // spalis
  [100, 90, 130],   // lapkritis — late autumn
  [60, 80, 130],    // gruodis — winter
]

type Pick = {
  id: string | number
  picked_on: string
  comment?: string | null
  like_count?: number
  legacy_track_id?: number | null
  track_id?: number | null
  tracks?: {
    id: number; slug: string; title: string
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
  const cover = artist?.cover_image_url || null
  const known = !!track

  const date = new Date(pick.picked_on)
  const day = date.getDate()
  const monthIdx = date.getMonth()
  const monthFull = MONTH_LT[monthIdx]
  const monthShort = monthFull.slice(0, 3)
  const year = date.getFullYear()
  const [tr, tg, tb] = MONTH_TINT[monthIdx]
  const tintColor = `rgba(${tr}, ${tg}, ${tb}, 0.45)`

  if (known && cover) {
    // V10: RESOLVED — cover viršuje + tekstas po apačia, kad komentaras matytųsi
    return (
      <Link
        href={`/atlikejai/${artist.slug}`}
        className="group flex flex-col rounded-xl overflow-hidden transition hover:-translate-y-0.5"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="relative aspect-[4/3] overflow-hidden">
          <img
            src={cover}
            alt=""
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-black/0" />
          {/* Date — top-left */}
          <div className="absolute top-2 left-2 px-2 py-1 rounded-full backdrop-blur-sm flex items-baseline gap-1.5"
               style={{ background: 'rgba(0,0,0,0.5)' }}>
            <span className="text-sm font-black leading-none text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>{day}</span>
            <span className="text-[9px] uppercase tracking-wider text-white/70 font-bold">
              {monthShort} {String(year).slice(2)}
            </span>
          </div>
          {(pick.like_count || 0) > 0 && (
            <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full backdrop-blur-sm text-[10px] font-extrabold text-white"
                 style={{ background: 'rgba(0,0,0,0.5)' }}>
              ♥ {pick.like_count}
            </div>
          )}
        </div>
        <div className="p-2.5 flex flex-col gap-1 min-h-[88px]">
          <p className="text-[9px] font-extrabold uppercase tracking-widest truncate"
             style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--accent-orange)' }}>
            {artist?.name}
          </p>
          <h3 className="text-xs sm:text-sm font-extrabold leading-tight line-clamp-2 group-hover:text-[var(--accent-orange)] transition"
              style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-primary)' }}>
            {track!.title}
          </h3>
          {pick.comment && (
            <p
              className="mt-auto text-[10.5px] italic line-clamp-2 leading-snug"
              style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}
              title={pick.comment}
            >
              „{pick.comment}"
            </p>
          )}
        </div>
      </Link>
    )
  }

  // PENDING — kortelė be cover'io (legacy track dar nerezolvintas)
  return (
    <div
      className="group flex flex-col rounded-xl overflow-hidden"
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--border-subtle)',
        boxShadow: `inset 0 0 80px ${tintColor}`,
      }}
      title={track ? track.title : pick.comment || ''}
    >
      <div className="relative aspect-[4/3] flex items-center justify-center"
           style={{ background: `linear-gradient(135deg, rgba(${MONTH_TINT[monthIdx].join(',')}, 0.35), transparent)` }}>
        <div className="text-center">
          <div className="text-4xl font-black leading-none tracking-tight"
               style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-primary)' }}>
            {day}
          </div>
          <div className="text-[9px] uppercase tracking-wider font-bold mt-1"
               style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}>
            {monthFull} {year}
          </div>
        </div>
        {(pick.like_count || 0) > 0 && (
          <div className="absolute top-2 right-2 text-[10px] font-bold"
               style={{ color: 'var(--text-muted)' }}>
            ♥ {pick.like_count}
          </div>
        )}
      </div>
      <div className="p-2.5 flex flex-col gap-1 min-h-[88px]">
        {track ? (
          <>
            <p className="text-[9px] font-extrabold uppercase tracking-widest truncate"
               style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--accent-orange)' }}>
              {artist?.name || 'Daina'}
            </p>
            <h3 className="text-xs sm:text-sm font-bold leading-tight line-clamp-2"
                style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-primary)' }}>
              {track.title}
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
          <p className="mt-auto text-[10.5px] italic line-clamp-2 leading-snug"
             style={{ color: 'var(--text-faint)', fontFamily: "'Outfit', sans-serif" }}>
            „{pick.comment}"
          </p>
        )}
      </div>
    </div>
  )
}
