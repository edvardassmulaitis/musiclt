'use client'

// components/HomeTrackModal.tsx
//
// Lengvasvoris track modalas homepage'ui. Atidaromas paspaudus ant track
// kortelės naujausių dainų sekcijoje (LT + Intl) — atrodo panašiai kaip
// artist page'o TrackInfoModal (YT embed + title + artist + lyrics + CTA),
// bet be pilno player-state machinery — homepage'ui to nereikia.
//
// Dizainas: centered modal, YT embed viršuje (jei yra video_url), apačioje
// title + artist + metadata + linkai į pilną track puslapį / artist profilį.
//
// Naudoja /api/tracks/[id] endpoint'ą, kad fetch'intų papildomą info
// (lyrics, like_count) — homepage'o tracks payload'as tų laukų neturi.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'

type HomeTrack = {
  id: number
  title: string
  slug?: string | null
  cover_url?: string | null
  video_url?: string | null
  artists?: { id: number; slug: string; name: string; cover_image_url?: string | null } | null
  artist_slug?: string | null
  artist_name?: string | null
}

function getYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}

function sanitizeTitle(raw: string): string {
  return raw.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim()
}

export function HomeTrackModal({ track, onClose }: { track: HomeTrack | null; onClose: () => void }) {
  const [extra, setExtra] = useState<{ lyrics?: string | null; release_year?: number | null; like_count?: number | null } | null>(null)

  useEffect(() => {
    if (!track) { setExtra(null); return }
    let alive = true
    fetch(`/api/tracks/${track.id}`)
      .then(r => r.json())
      .then(d => {
        if (!alive) return
        setExtra({
          lyrics: d.lyrics || null,
          release_year: d.release_year || (d.release_date ? new Date(d.release_date).getFullYear() : null),
          like_count: typeof d.like_count === 'number' ? d.like_count : null,
        })
      })
      .catch(() => { if (alive) setExtra({}) })
    return () => { alive = false }
  }, [track?.id])

  useEffect(() => {
    if (!track) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    // Body scroll lock — position:fixed pattern, iOS-safe (žr. TrackInfoModal).
    const scrollY = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.left = '0'
    document.body.style.right = '0'
    document.body.style.width = '100%'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.left = ''
      document.body.style.right = ''
      document.body.style.width = ''
      window.scrollTo(0, scrollY)
    }
  }, [track?.id, onClose])

  if (!track) return null
  if (typeof document === 'undefined') return null

  const artist = track.artists
  const artistName = artist?.name || track.artist_name || ''
  const artistSlug = artist?.slug || track.artist_slug || ''
  const ytId = getYouTubeId(track.video_url || null)
  const cover = track.cover_url || artist?.cover_image_url || null
  const trackHref = artistSlug && track.slug
    ? `/dainos/${artistSlug}-${track.slug}-${track.id}`
    : `/lt/daina/${track.slug || ''}/${track.id}`
  const title = sanitizeTitle(track.title)

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[1300] flex items-center justify-center p-3 sm:p-6 backdrop-blur-md"
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
              title={title}
            />
          ) : cover ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={proxyImg(cover)} alt="" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
              <div className="absolute inset-0 flex items-center justify-center text-6xl text-white/70">♬</div>
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-7xl" style={{ color: 'var(--text-faint)' }}>♬</div>
          )}
        </div>

        <div className="p-5 sm:p-7">
          <h2
            className="font-black leading-tight tracking-[-0.02em] m-0"
            style={{
              fontFamily: "'Outfit', sans-serif",
              color: 'var(--text-primary)',
              fontSize: 'clamp(1.4rem, 3vw, 2rem)',
            }}
          >
            {title}
          </h2>
          {artistName && (
            artistSlug ? (
              <Link
                href={`/atlikejai/${artistSlug}`}
                className="inline-block mt-1.5 text-sm sm:text-base font-bold transition hover:opacity-80"
                style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-secondary)' }}
              >
                {artistName}
              </Link>
            ) : (
              <p className="m-0 mt-1.5 text-sm sm:text-base font-bold" style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-secondary)' }}>
                {artistName}
              </p>
            )
          )}

          {(extra?.release_year || (typeof extra?.like_count === 'number' && extra.like_count > 0)) && (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs" style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}>
              {extra?.release_year && <span>{extra.release_year} m.</span>}
              {typeof extra?.like_count === 'number' && extra.like_count > 0 && (
                <span>♥ {extra.like_count.toLocaleString('lt-LT')}</span>
              )}
            </div>
          )}

          {extra?.lyrics && (
            <div
              className="mt-5 p-4 rounded-xl max-h-40 overflow-y-auto text-sm leading-relaxed whitespace-pre-line"
              style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                fontFamily: "'Outfit', sans-serif",
              }}
            >
              {extra.lyrics.replace(/<[^>]+>/g, '').slice(0, 600)}
              {extra.lyrics.replace(/<[^>]+>/g, '').length > 600 ? '…' : ''}
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <Link
              href={trackHref}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-xs sm:text-sm font-extrabold uppercase tracking-wider transition hover:scale-[1.02]"
              style={{
                fontFamily: "'Outfit', sans-serif",
                background: 'var(--accent-orange)',
                color: '#fff',
              }}
            >
              Atidaryti dainą →
            </Link>
            {artistSlug && (
              <Link
                href={`/atlikejai/${artistSlug}`}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-xs sm:text-sm font-bold transition hover:opacity-80"
                style={{
                  fontFamily: "'Outfit', sans-serif",
                  background: 'var(--card-bg)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-secondary)',
                }}
              >
                {artistName} profilis →
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
