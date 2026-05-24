'use client'

// components/profile/GenreFilterModal.tsx
//
// V8 — vietoj kad keičiusi profile turinį, equalizer click atidarymą
// rodom modal'e su atfiltruotais atlikėjais ir dienos dainomis.

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { FULL_TO_SHORT } from './SideEqualizer'

export function GenreFilterModal({
  genre, artists, picks, onClose,
}: {
  genre: string
  artists: any[]
  picks: any[]
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

  const shortName = FULL_TO_SHORT[genre] || genre

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 backdrop-blur-md"
      style={{ background: 'rgba(0,0,0,0.62)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl"
        style={{
          background: 'var(--modal-bg)',
          border: '1px solid var(--modal-border)',
          boxShadow: 'var(--modal-shadow)',
        }}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-9 h-9 flex items-center justify-center rounded-full transition hover:opacity-80"
          style={{ background: 'var(--card-bg)', border: '1px solid var(--border-default)' }}
          aria-label="Uždaryti"
        >
          <span style={{ color: 'var(--text-secondary)' }}>✕</span>
        </button>

        <div className="p-6 sm:p-8">
          <div
            className="text-[10px] font-extrabold uppercase tracking-[0.22em] mb-1.5"
            style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--accent-orange)' }}
          >
            Filtruota pagal stilių
          </div>
          <h2
            className="font-black tracking-[-0.025em] leading-tight"
            style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: 'clamp(1.5rem, 3vw, 2rem)',
              color: 'var(--text-primary)',
            }}
          >
            „{shortName}" muzika
          </h2>
          <p
            className="mt-1 text-xs sm:text-sm"
            style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}
          >
            {artists.length} atlikėjų · {picks.length} dienos dainų
          </p>

          {artists.length === 0 && picks.length === 0 && (
            <div
              className="mt-6 p-5 rounded-xl text-center text-sm"
              style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-muted)',
                fontFamily: "'Outfit', sans-serif",
              }}
            >
              Pagal šį stilių dar nieko nepriskirta — atlikėjai turi turėti pagrindinį žanrą,
              kad atsidurtų šiame sąraše.
            </div>
          )}

          {artists.length > 0 && (
            <div className="mt-5">
              <SubLabel>Atlikėjai</SubLabel>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-2.5">
                {artists.slice(0, 15).map((a: any) => (
                  <Link
                    key={a.id}
                    href={`/atlikejai/${a.slug}`}
                    className="group relative aspect-square rounded-xl overflow-hidden"
                    style={{ background: 'var(--card-bg)' }}
                  >
                    {a.cover_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.cover_image_url}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                      />
                    ) : (
                      <div
                        className="w-full h-full bg-gradient-to-br from-[#1a2436] to-[#080c12] flex items-center justify-center text-2xl font-black"
                        style={{ fontFamily: "'Outfit', sans-serif", color: 'rgba(255,255,255,0.15)' }}
                      >
                        {a.name[0]?.toUpperCase() || '?'}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-2">
                      <p className="text-[11px] font-extrabold text-white leading-tight truncate" style={{ fontFamily: "'Outfit', sans-serif" }}>
                        {a.name}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {picks.length > 0 && (
            <div className="mt-6">
              <SubLabel>Dienos dainos</SubLabel>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-2.5">
                {picks.slice(0, 12).map((p: any) => {
                  const t = p.tracks
                  const artist = t && (Array.isArray(t.artists) ? t.artists[0] : t.artists)
                  const cover = artist?.cover_image_url
                  return (
                    <Link
                      key={p.id}
                      href={artist ? `/atlikejai/${artist.slug}` : '#'}
                      className="group block relative aspect-square rounded-xl overflow-hidden"
                      style={{ background: 'var(--card-bg)' }}
                    >
                      {cover && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={cover}
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition duration-500"
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 p-2">
                        <p className="text-[9px] font-extrabold uppercase tracking-widest text-orange-300 truncate" style={{ fontFamily: "'Outfit', sans-serif" }}>
                          {artist?.name || ''}
                        </p>
                        <h3 className="text-xs font-bold text-white leading-tight line-clamp-2" style={{ fontFamily: "'Outfit', sans-serif" }}>
                          {t?.title || '—'}
                        </h3>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[10px] font-extrabold uppercase tracking-widest mb-2.5"
      style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}
    >
      {children}
    </div>
  )
}
