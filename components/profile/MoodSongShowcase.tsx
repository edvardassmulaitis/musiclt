'use client'

// components/profile/MoodSongShowcase.tsx
//
// Full-width vinyl-style mood song display. Vienas LARGE block po listening
// identity'o, kuris vizualiai patraukia žiūrovą:
//
//   - Backdrop'as = atlikėjo cover'as blur'intas plačiai
//   - Centre = mažas track cover + animuotas vinyl ring (spinning gradient)
//   - Big type: track title + artist name
//   - Pre-title eyebrow: "[Username] dabar klauso"
//
// Visualus impact'as toks pat kaip albumo "now playing" displėjus iOS Music
// app'e arba Spotify Connect modale.

import Link from 'next/link'

type Track = {
  id: number
  slug: string
  title: string
  artists?: any
}

export function MoodSongShowcase({ track, username }: { track: Track; username: string }) {
  const artist = Array.isArray(track.artists) ? track.artists[0] : track.artists
  const coverImage = artist?.cover_image_url

  return (
    <section className="relative my-12 sm:my-16 overflow-hidden">
      {/* Backdrop full-bleed */}
      <div className="absolute inset-0 -z-10">
        {coverImage ? (
          <>
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                backgroundImage: `url(${coverImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                filter: 'blur(80px) saturate(1.8) brightness(0.4)',
                transform: 'scale(1.4)',
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[var(--bg-surface,#080c12)]/40 via-transparent to-[var(--bg-surface,#080c12)]" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-orange-900/20 via-rose-900/15 to-[#080c12]" />
        )}
      </div>

      <div className="max-w-[1200px] mx-auto px-5 sm:px-8 py-16 sm:py-24 lg:py-32">
        <div className="flex flex-col items-center text-center">

          {/* Vinyl with cover */}
          <div className="relative mb-8">
            {/* Outer ring — rotating gradient */}
            <div
              className="absolute -inset-6 sm:-inset-8 rounded-full opacity-60"
              style={{
                background: 'conic-gradient(from 0deg, #f97316, #dc2626, #a78bfa, #60a5fa, #34d399, #fbbf24, #f97316)',
                animation: 'moodSpin 12s linear infinite',
                filter: 'blur(8px)',
              }}
            />
            {/* Inner ring solid border */}
            <div className="absolute -inset-2 rounded-full border-2 border-white/10" />
            {/* Cover */}
            {coverImage ? (
              <img
                src={coverImage}
                alt=""
                className="relative w-44 h-44 sm:w-56 sm:h-56 lg:w-64 lg:h-64 rounded-full object-cover shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
                style={{ animation: 'moodSpin 40s linear infinite' }}
              />
            ) : (
              <div className="relative w-44 h-44 sm:w-56 sm:h-56 lg:w-64 lg:h-64 rounded-full bg-gradient-to-br from-orange-500/30 to-rose-600/30 flex items-center justify-center text-6xl shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
                ♬
              </div>
            )}
            {/* Center hole (vinyl style) */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 sm:w-7 sm:h-7 rounded-full bg-[#080c12] border-2 border-white/20" />
          </div>

          {/* Eyebrow */}
          <div className="text-[12px] sm:text-[14px] font-extrabold uppercase tracking-[0.3em] text-orange-400 mb-3" style={{ fontFamily: "'Outfit', sans-serif" }}>
            ♬ {username} nuotaikos daina
          </div>

          {/* Title */}
          <Link href={artist ? `/atlikejai/${artist.slug}` : '#'} className="group">
            <h2
              className="font-black leading-[0.95] tracking-[-0.04em] text-white drop-shadow-[0_8px_32px_rgba(0,0,0,0.7)] group-hover:text-orange-400 transition"
              style={{ fontFamily: "'Outfit', sans-serif", fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}
            >
              {track.title}
            </h2>
            <p className="text-base sm:text-lg lg:text-xl text-[#dde8f8] mt-3 font-semibold" style={{ fontFamily: "'Outfit', sans-serif" }}>
              {artist?.name || 'Nežinomas atlikėjas'}
            </p>
          </Link>
        </div>
      </div>

      <style>{`@keyframes moodSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </section>
  )
}
