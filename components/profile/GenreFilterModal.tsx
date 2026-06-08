'use client'

import { useEffect, useRef, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { SideEqualizer, FULL_TO_SHORT } from './SideEqualizer'

type GenreFilter = { kind: 'genre'; name: string }

type Style = { legacy_style_id: number; style_slug: string; style_name: string; sort_order: number }

export function GenreFilterModal({
  initialFilter, meter, styles, artists, picks, onClose,
}: {
  initialFilter?: { kind: string; name: string } | null
  meter: any
  styles: Style[]
  artists: any[]
  picks: any[]
  onClose: () => void
}) {
  // Genre filter — used to filter artists/picks (only accept genre kind)
  const [genreFilter, setGenreFilter] = useState<GenreFilter | null>(
    initialFilter?.kind === 'genre' ? { kind: 'genre', name: initialFilter.name } : null
  )
  // Substyle selection — visual only (artist_substyles data not yet populated)
  const [selectedSubstyle, setSelectedSubstyle] = useState<number | null>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  // Scroll to results when genre filter changes
  useEffect(() => {
    if (genreFilter && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [genreFilter])

  const filteredArtists = useMemo(() => {
    if (!genreFilter) return artists
    return artists.filter((a: any) =>
      (a.mainGenres || []).some((g: any) => g.name === genreFilter.name),
    )
  }, [artists, genreFilter])

  const filteredPicks = useMemo(() => {
    if (!genreFilter) return picks
    return picks.filter((p: any) => {
      const genres: { id: number; name: string }[] = p.tracks?.artistMainGenres || []
      return genres.some((g) => g.name === genreFilter.name)
    })
  }, [picks, genreFilter])

  const filterLabel = genreFilter
    ? `${FULL_TO_SHORT[genreFilter.name] || genreFilter.name} muzika`
    : null

  if (typeof window === 'undefined') return null

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 backdrop-blur-md"
      style={{ background: 'rgba(0,0,0,0.65)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-5xl max-h-[92vh] sm:max-h-[88vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{ background: 'var(--modal-bg)', border: '1px solid var(--modal-border)', boxShadow: 'var(--modal-shadow)' }}
      >
        {/* Header bar */}
        <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-0 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="font-black tracking-[-0.025em] leading-tight truncate"
                style={{ fontFamily: "'Outfit', sans-serif", fontSize: 'clamp(1.2rem, 4vw, 1.6rem)', color: 'var(--text-primary)' }}>
              {filterLabel ?? 'Muzikinis skonis'}
            </h2>
            {genreFilter && (
              <button type="button" onClick={() => setGenreFilter(null)}
                className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-[11px] transition hover:opacity-80"
                style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.18)', color: 'var(--text-secondary)' }}
                aria-label="Atstatyti filtrą">✕</button>
            )}
          </div>
          <button type="button" onClick={onClose}
            className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full transition hover:opacity-80"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--border-default)' }}
            aria-label="Uždaryti">
            <span style={{ color: 'var(--text-secondary)' }}>✕</span>
          </button>
        </div>

        <div className="overflow-y-auto px-5 pb-5 pt-4 sm:px-7 sm:pb-7">

          {/* Equalizer — hideHeader nes h2 jau rodo "Muzikinis skonis" */}
          {meter && Array.isArray(meter) && meter.length > 0 && (
            <div className="mb-4">
              <SideEqualizer
                meter={meter}
                variant="led-large"
                topN={8}
                ledSelectedGenre={genreFilter?.name ?? null}
                onSelect={(g) => setGenreFilter(g ? { kind: 'genre', name: g } : null)}
                hideHeader
              />
            </div>
          )}

          {/* Detaliau — horizontal scroll */}
          {styles && styles.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] mb-2"
                 style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-muted)' }}>Detaliau</p>
              <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {styles.map((s, i) => {
                  const isSelected = selectedSubstyle === s.legacy_style_id
                  const sz = i < 3 ? { fontSize: '13px', fontWeight: 800 }
                           : i < 7 ? { fontSize: '12px', fontWeight: 700 }
                           : { fontSize: '11px', fontWeight: 600 }
                  return (
                    <button key={s.legacy_style_id} type="button"
                      onClick={() => setSelectedSubstyle(isSelected ? null : s.legacy_style_id)}
                      className="flex-shrink-0 rounded-full px-3 py-1 border transition"
                      style={{
                        fontFamily: "'Outfit', sans-serif",
                        background: isSelected ? 'var(--accent-orange)' : 'rgba(255,255,255,0.05)',
                        color: isSelected ? '#000' : '#dde8f8',
                        borderColor: isSelected ? 'var(--accent-orange)' : 'rgba(255,255,255,0.10)',
                        ...sz,
                      }}>
                      {s.style_name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Results */}
          <div ref={resultsRef}>
            {genreFilter && (
              <p className="text-xs mb-3" style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}>
                {filteredArtists.length} atlikėjų · {filteredPicks.length} dienos dainų
              </p>
            )}

            {genreFilter && filteredArtists.length === 0 && filteredPicks.length === 0 && (
              <div className="p-5 rounded-xl text-center text-sm"
                   style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}>
                Pagal šį stilių dar nieko nepriskirta.
              </div>
            )}

            {filteredArtists.length > 0 && (
              <div className="mt-1">
                <p className="text-[10px] font-extrabold uppercase tracking-widest mb-2.5"
                   style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}>Atlikėjai</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-2.5">
                  {filteredArtists.slice(0, 18).map((a: any) => (
                    <Link key={a.id} href={`/atlikejai/${a.slug}`} onClick={onClose}
                      className="group relative aspect-square rounded-xl overflow-hidden"
                      style={{ background: 'var(--card-bg)' }}>
                      {a.cover_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.cover_image_url} alt=""
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-[#1a2436] to-[#080c12] flex items-center justify-center text-2xl font-black"
                             style={{ fontFamily: "'Outfit', sans-serif", color: 'rgba(255,255,255,0.15)' }}>
                          {a.name?.[0]?.toUpperCase() || '?'}
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 p-2">
                        <p className="text-[11px] font-extrabold text-white leading-tight truncate"
                           style={{ fontFamily: "'Outfit', sans-serif" }}>{a.name}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {filteredPicks.length > 0 && (
              <div className="mt-5">
                <p className="text-[10px] font-extrabold uppercase tracking-widest mb-2.5"
                   style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}>Dienos dainos</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-2.5">
                  {filteredPicks.slice(0, 12).map((p: any) => {
                    const t = p.tracks
                    const artist = t && (Array.isArray(t.artists) ? t.artists[0] : t.artists)
                    const cover = artist?.cover_image_url
                    return (
                      <Link key={p.id} href={artist ? `/atlikejai/${artist.slug}` : '#'} onClick={onClose}
                        className="group block relative aspect-square rounded-xl overflow-hidden"
                        style={{ background: 'var(--card-bg)' }}>
                        {cover && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={cover} alt=""
                            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                        <div className="absolute bottom-0 left-0 right-0 p-2">
                          <p className="text-[9px] font-extrabold uppercase tracking-widest text-orange-300 truncate"
                             style={{ fontFamily: "'Outfit', sans-serif" }}>{artist?.name || ''}</p>
                          <h3 className="text-xs font-bold text-white leading-tight line-clamp-2"
                              style={{ fontFamily: "'Outfit', sans-serif" }}>{t?.title || '—'}</h3>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
