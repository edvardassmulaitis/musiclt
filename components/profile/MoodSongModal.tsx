'use client'

// components/profile/MoodSongModal.tsx
//
// Atskira lightweight modal'as nario "Nuotaikos daina" reprezentacijai —
// rodo track info, YouTube embed (jei yra video_url) ir link'us į pilną
// daina/atlikėjo puslapį. Nesinaudoja TrackInfoModal'u, kuris turi
// gerokai daugiau dependencies (player state, lyrics tab'ai, komentarai),
// kad apsisaugotume nuo profile bundle'io išsipūtimo.

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'

function getYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}

export function MoodSongModal({
  track, username, onClose,
}: {
  track: any
  username: string
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  if (typeof window === 'undefined') return null

  const artist = Array.isArray(track.artists) ? track.artists[0] : track.artists
  const ytId = getYouTubeId(track.video_url)
  const cover = track.cover_url || artist?.cover_image_url || null
  const fullTrackHref = artist
    ? `/atlikejai/${artist.slug}/${track.slug || track.id}`
    : `/lt/daina/${track.slug || ''}/${track.id}`

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 backdrop-blur-md"
      style={{ background: 'rgba(0,0,0,0.65)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl"
        style={{
          background: 'var(--modal-bg)',
          border: '1px solid var(--modal-border)',
          boxShadow: 'var(--modal-shadow)',
        }}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-9 h-9 flex items-center justify-center rounded-full transition hover:opacity-80"
          style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(6px)' }}
          aria-label="Uždaryti"
        >
          <span style={{ color: '#fff' }}>✕</span>
        </button>

        {/* Hero — YouTube embed arba cover */}
        <div className="relative aspect-video w-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
          {ytId ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${ytId}?rel=0&modestbranding=1`}
              className="absolute inset-0 w-full h-full"
              allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              loading="lazy"
              title={track.title}
            />
          ) : cover ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cover} alt="" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
              <div className="absolute inset-0 flex items-center justify-center text-6xl text-white/70">♬</div>
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-7xl" style={{ color: 'var(--text-faint)' }}>♬</div>
          )}
        </div>

        <div className="p-5 sm:p-7">
          <p
            className="text-[12px] font-extrabold uppercase tracking-[0.2em] mb-2"
            style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--accent-orange)' }}
          >
            {username} nuotaikos daina
          </p>
          <h2
            className="font-black leading-tight tracking-[-0.02em]"
            style={{
              fontFamily: "'Outfit', sans-serif",
              color: 'var(--text-primary)',
              fontSize: 'clamp(1.4rem, 3vw, 2rem)',
            }}
          >
            {track.title}
          </h2>
          {artist && (
            <Link
              href={`/atlikejai/${artist.slug}`}
              className="inline-block mt-1.5 text-sm sm:text-base font-bold transition hover:opacity-80"
              style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-secondary)' }}
            >
              {artist.name}
            </Link>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs" style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}>
            {track.release_year && <span>{track.release_year} m.</span>}
            {typeof track.like_count === 'number' && track.like_count > 0 && (
              <span>♥ {track.like_count.toLocaleString('lt-LT')}</span>
            )}
          </div>

          {track.lyrics && (
            <div
              className="mt-5 p-4 rounded-xl max-h-40 overflow-y-auto text-sm leading-relaxed whitespace-pre-line"
              style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                fontFamily: "'Outfit', sans-serif",
              }}
            >
              {track.lyrics.slice(0, 600)}
              {track.lyrics.length > 600 ? '…' : ''}
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <Link
              href={fullTrackHref}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-xs sm:text-sm font-extrabold uppercase tracking-wider transition hover:scale-[1.02]"
              style={{
                fontFamily: "'Outfit', sans-serif",
                background: 'var(--accent-orange)',
                color: '#000',
              }}
            >
              Atidaryti dainą →
            </Link>
            {artist && (
              <Link
                href={`/atlikejai/${artist.slug}`}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-xs sm:text-sm font-bold transition hover:opacity-80"
                style={{
                  fontFamily: "'Outfit', sans-serif",
                  background: 'var(--card-bg)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-secondary)',
                }}
              >
                {artist.name} profilis →
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
