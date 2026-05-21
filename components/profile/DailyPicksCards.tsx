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
    // RESOLVED — cover image hero
    return (
      <Link
        href={`/atlikejai/${artist.slug}`}
        className="group relative aspect-square rounded-xl overflow-hidden block transition hover:-translate-y-0.5"
        style={{ background: 'var(--card-surface, var(--bg-elevated))', border: '1px solid var(--border-subtle)' }}
      >
        <img
          src={cover}
          alt=""
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
        />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/10" />

        {/* Date — top-right minimal */}
        <div className="absolute top-2 right-2 text-right">
          <div className="text-xl font-black leading-none text-white drop-shadow"
               style={{ fontFamily: "'Outfit', sans-serif" }}>{day}</div>
          <div className="text-[9px] uppercase tracking-wider text-white/70 font-bold mt-0.5">
            {monthShort} {String(year).slice(2)}
          </div>
        </div>

        {/* Like — top-left small */}
        {(pick.like_count || 0) > 0 && (
          <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-full backdrop-blur-sm text-[10px] font-extrabold text-white"
               style={{ background: 'rgba(0,0,0,0.5)' }}>
            ♥ {pick.like_count}
          </div>
        )}

        {/* Track info — bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-2.5">
          <p className="text-[9px] font-extrabold uppercase tracking-widest text-orange-300 mb-0.5 truncate"
             style={{ fontFamily: "'Outfit', sans-serif" }}>
            {artist?.name}
          </p>
          <h3 className="text-xs sm:text-sm font-extrabold text-white leading-tight line-clamp-2 group-hover:text-orange-200 transition"
              style={{ fontFamily: "'Outfit', sans-serif" }}>
            {track!.title}
          </h3>
        </div>
      </Link>
    )
  }

  // PENDING — subtle theme card, date is the hero
  return (
    <div
      className="group relative aspect-square rounded-xl overflow-hidden flex flex-col p-3 sm:p-4"
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--border-subtle)',
        boxShadow: `inset 0 0 60px ${tintColor}`,
      }}
      title={track ? track.title : pick.comment || ''}
    >
      {/* Day — typography-driven hero */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-3xl sm:text-4xl font-black leading-none tracking-tight"
               style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-primary)' }}>
            {day}
          </div>
          <div className="text-[10px] uppercase tracking-wider font-bold mt-1"
               style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}>
            {monthFull} {year}
          </div>
        </div>
        {(pick.like_count || 0) > 0 && (
          <div className="text-[10px] font-bold flex-shrink-0"
               style={{ color: 'var(--text-muted)' }}>
            ♥ {pick.like_count}
          </div>
        )}
      </div>

      <div className="flex-1" />

      {/* Bottom — track title (if known but no cover) arba pending placeholder */}
      <div className="min-w-0">
        {track ? (
          <>
            <p className="text-[9px] font-extrabold uppercase tracking-widest mb-0.5 truncate"
               style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--accent-orange)' }}>
              {artist?.name || 'Daina'}
            </p>
            <h3 className="text-xs font-bold leading-tight line-clamp-2"
                style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-secondary)' }}>
              {track.title}
            </h3>
          </>
        ) : (
          <>
            <p className="text-[9px] font-extrabold uppercase tracking-widest mb-0.5"
               style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-faint)' }}>
              Laukia importavimo
            </p>
            <p className="text-xs font-mono"
               style={{ color: 'var(--text-muted)' }}>
              music.lt #{pick.legacy_track_id}
            </p>
          </>
        )}
        {pick.comment && (
          <p className="mt-1.5 text-[10px] italic line-clamp-2"
             style={{ color: 'var(--text-faint)', fontFamily: "'Outfit', sans-serif" }}>
            „{pick.comment}"
          </p>
        )}
      </div>
    </div>
  )
}
