'use client'

// components/profile/DailyPicksCards.tsx
//
// V6 — vizualios kortelės dienos dainoms, panašios į artist page'o track
// tiles. Naudoja artist cover_image_url kaip background; pending dainoms
// (kurios neturi track_id) — gradient placeholder pagal mėnesio spalvą.
//
// Layout: 3-col grid desktop, 2-col tablet, 1-col mobile. Hover lift +
// gradient overlay. Klik atveda į atlikėjo puslapį, jei žinomas, kitaip
// — placeholder.

import Link from 'next/link'

// Mėnesių spalvos (12 spalvų sezonams) — naudojama pending placeholder'iams.
const MONTH_COLORS = [
  ['#3b82f6', '#1e3a8a'], // sausis  — winter blue
  ['#6366f1', '#312e81'], // vasaris — late winter indigo
  ['#06b6d4', '#0e7490'], // kovas   — spring cyan
  ['#10b981', '#065f46'], // balandis — fresh green
  ['#84cc16', '#4d7c0f'], // gegužė  — bright lime
  ['#eab308', '#854d0e'], // birželis — summer yellow
  ['#f97316', '#9a3412'], // liepa   — summer orange
  ['#ef4444', '#991b1b'], // rugpjūtis — peak summer red
  ['#a855f7', '#6b21a8'], // rugsėjis — autumn purple
  ['#ec4899', '#9d174d'], // spalis  — pink/rose
  ['#64748b', '#334155'], // lapkritis — slate
  ['#475569', '#1e293b'], // gruodis — winter dark
]

const MONTH_LT = ['sau', 'vas', 'kov', 'bal', 'geg', 'bir', 'lie', 'rgp', 'rgs', 'spl', 'lap', 'grd']

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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
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
  const month = MONTH_LT[monthIdx]
  const year = date.getFullYear()
  const [c1, c2] = MONTH_COLORS[monthIdx]

  const body = (
    <div className="group relative aspect-[4/5] rounded-2xl overflow-hidden border transition-all hover:-translate-y-1"
         style={{
           background: 'var(--card-surface, var(--bg-elevated))',
           borderColor: 'var(--border-subtle)',
           boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
         }}>
      {/* Background — cover image arba month gradient */}
      {cover ? (
        <img
          src={cover}
          alt=""
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
        />
      ) : (
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
        >
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage: 'radial-gradient(circle at 20% 30%, rgba(255,255,255,0.15), transparent 40%), radial-gradient(circle at 80% 70%, rgba(0,0,0,0.2), transparent 50%)',
            }}
          />
        </div>
      )}

      {/* Bottom gradient — užtikrina text legibility */}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/10" />

      {/* Day badge — top-left */}
      <div className="absolute top-3 left-3 flex flex-col items-start">
        <div className="px-2 py-1 rounded-md backdrop-blur-md bg-black/50 border border-white/15">
          <div className="font-black leading-none text-white text-2xl sm:text-3xl tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>
            {day}
          </div>
          <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-white/70 mt-0.5">
            {month} {year}
          </div>
        </div>
      </div>

      {/* Like badge — top-right */}
      {pick.like_count != null && pick.like_count > 0 && (
        <div className="absolute top-3 right-3 px-2 py-1 rounded-full backdrop-blur-md bg-black/50 border border-white/15">
          <div className="text-[10px] font-extrabold text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>
            ♥ {pick.like_count}
          </div>
        </div>
      )}

      {/* Track info — bottom */}
      <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4">
        {known ? (
          <>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-orange-300 mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>
              {artist?.name}
            </p>
            <h3 className="text-sm sm:text-base font-extrabold text-white leading-tight line-clamp-2 group-hover:text-orange-200 transition" style={{ fontFamily: "'Outfit', sans-serif" }}>
              {track!.title}
            </h3>
          </>
        ) : (
          <>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-white/60 mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>
              Daina laukia importavimo
            </p>
            <h3 className="text-sm font-bold text-white/90 leading-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>
              music.lt #{pick.legacy_track_id}
            </h3>
          </>
        )}
        {pick.comment && (
          <p className="mt-1.5 text-[11px] italic text-white/70 line-clamp-2" style={{ fontFamily: "'Outfit', sans-serif" }}>
            „{pick.comment}"
          </p>
        )}
      </div>
    </div>
  )

  if (known && artist) {
    return (
      <Link href={`/atlikejai/${artist.slug}`} className="block">
        {body}
      </Link>
    )
  }
  return body
}
