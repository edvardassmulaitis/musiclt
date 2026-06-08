'use client'

import { useEffect, useRef, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { SideEqualizer, FULL_TO_SHORT } from './SideEqualizer'

type SubstyleFilter = { kind: 'substyle'; legacyId: number; name: string }
type GenreFilter = { kind: 'genre'; name: string }
type AnyFilter = SubstyleFilter | GenreFilter

type Style = { legacy_style_id: number; style_slug: string; style_name: string; sort_order: number }

export function GenreFilterModal({
  initialFilter, meter, styles, artists, picks, moodTrack, onClose,
}: {
  initialFilter?: AnyFilter | null
  meter: any
  styles: Style[]
  artists: any[]
  picks: any[]
  moodTrack?: any
  onClose: () => void
}) {
  const [filter, setFilter] = useState<AnyFilter | null>(initialFilter || null)
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

  // (6) Scroll results into view when filter changes
  useEffect(() => {
    if (filter && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [filter])

  const filteredArtists = useMemo(() => {
    if (!filter) return artists
    if (filter.kind === 'genre') {
      return artists.filter((a: any) =>
        (a.mainGenres || []).some((g: any) => g.name === filter.name),
      )
    }
    return artists.filter((a: any) =>
      (a.substyleIds || []).includes(filter.legacyId),
    )
  }, [artists, filter])

  const filteredPicks = useMemo(() => {
    if (!filter) return picks
    if (filter.kind !== 'genre') return []
    return picks.filter((p: any) => {
      const t = p.tracks
      if (!t) return false
      const genres: { id: number; name: string }[] = t.artistMainGenres || []
      return genres.some((g) => g.name === filter.name)
    })
  }, [picks, filter])

  // (5) No quotes, simplified
  const filterLabel = useMemo(() => {
    if (!filter) return null
    if (filter.kind === 'genre') return `${FULL_TO_SHORT[filter.name] || filter.name} muzika`
    return filter.name
  }, [filter])

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
        style={{
          background: 'var(--modal-bg)',
          border: '1px solid var(--modal-border)',
          boxShadow: 'var(--modal-shadow)',
        }}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-9 h-9 flex items-center justify-center rounded-full transition hover:opacity-80"
          style={{ background: 'var(--card-bg)', border: '1px solid var(--border-default)' }}
          aria-label="Uždaryti"
        >
          <span style={{ color: 'var(--text-secondary)' }}>✕</span>
        </button>

        <div className="overflow-y-auto p-5 sm:p-7">

          {/* (1) Header — no duplicate, show filter label when active */}
          <div className="flex items-baseline justify-between gap-3 flex-wrap mb-4 pr-10">
            <h2
              className="font-black tracking-[-0.025em] leading-tight"
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: 'clamp(1.4rem, 3vw, 1.85rem)',
                color: 'var(--text-primary)',
              }}
            >
              {filterLabel ?? 'Muzikinis skonis'}
            </h2>
            {/* (5) Only ✕, no text */}
            {filter && (
              <button
                type="button"
                onClick={() => setFilter(null)}
                className="w-7 h-7 flex items-center justify-center rounded-full transition hover:opacity-80 flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.18)', color: 'var(--text-secondary)' }}
                aria-label="Atstatyti filtrą"
              >
                ✕
              </button>
            )}
          </div>

          {/* (2) Nuotaikos daina VIRŠ equalizer, be "Šiuo metu klausosi" */}
          {moodTrack && (() => {
            const artist = Array.isArray(moodTrack.artists) ? moodTrack.artists[0] : moodTrack.artists
            const href = artist
              ? `/dainos/${artist.slug}-${moodTrack.slug || moodTrack.id}-${moodTrack.id}`
              : `/dainos/${moodTrack.slug || ''}-${moodTrack.id}`
            const cover = moodTrack.cover_url || artist?.cover_image_url || null
            return (
              <div className="mb-5">
                <SubLabel>Nuotaikos daina</SubLabel>
                <Link href={href} onClick={onClose}
                  className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 transition hover:opacity-85"
                  style={{ background: 'linear-gradient(to right, rgba(249,115,22,0.14), rgba(244,114,182,0.08))', border: '1px solid rgba(249,115,22,0.28)' }}>
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center text-xl"
                         style={{ background: 'rgba(249,115,22,0.2)' }}>♬</div>
                  )}
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate" style={{ color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>
                      {moodTrack.title}
                    </p>
                    {artist && (
                      <p className="text-xs truncate" style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}>
                        {artist.name}
                      </p>
                    )}
                  </div>
                </Link>
              </div>
            )
          })()}

          {/* Equalizer */}
          {meter && Array.isArray(meter) && meter.length > 0 && (
            <div className="mb-5">
              <SideEqualizer
                meter={meter}
                variant="led-large"
                topN={8}
                ledSelectedGenre={filter?.kind === 'genre' ? filter.name : null}
                onSelect={(g) => {
                  if (!g) setFilter(null)
                  else setFilter({ kind: 'genre', name: g })
                }}
              />
            </div>
          )}

          {/* (3)(4) Substylai — "Detaliau", bez "click filtruoja" */}
          {styles && styles.length > 0 && (
            <div className="mb-5">
              <SubLabel>Detaliau</SubLabel>
              <SubstyleCloud
                styles={styles}
                selectedId={filter?.kind === 'substyle' ? filter.legacyId : null}
                onSelect={(s) => setFilter({ kind: 'substyle', legacyId: s.legacy_style_id, name: s.style_name })}
              />
            </div>
          )}

          {/* (6) Results section — ref for scroll-into-view */}
          <div ref={resultsRef}>
            <p
              className="text-xs sm:text-sm mb-3"
              style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}
            >
              {filteredArtists.length} atlikėjų · {filteredPicks.length} dienos dainų
            </p>

            {filteredArtists.length === 0 && filteredPicks.length === 0 && filter && (
              <div
                className="p-5 rounded-xl text-center text-sm"
                style={{
                  background: 'var(--card-bg)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-muted)',
                  fontFamily: "'Outfit', sans-serif",
                }}
              >
                Pagal šį filtrą dar nieko nepriskirta.
              </div>
            )}

            {filteredArtists.length > 0 && (
              <div className="mt-2">
                <SubLabel>Atlikėjai</SubLabel>
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-2.5">
                  {filteredArtists.slice(0, 18).map((a: any) => (
                    <Link
                      key={a.id}
                      href={`/atlikejai/${a.slug}`}
                      onClick={onClose}
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
                          {a.name?.[0]?.toUpperCase() || '?'}
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

            {filteredPicks.length > 0 && (
              <div className="mt-6">
                <SubLabel>Dienos dainos</SubLabel>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-2.5">
                  {filteredPicks.slice(0, 12).map((p: any) => {
                    const t = p.tracks
                    const artist = t && (Array.isArray(t.artists) ? t.artists[0] : t.artists)
                    const cover = artist?.cover_image_url
                    return (
                      <Link
                        key={p.id}
                        href={artist ? `/atlikejai/${artist.slug}` : '#'}
                        onClick={onClose}
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

function SubstyleCloud({
  styles, selectedId, onSelect,
}: {
  styles: Style[]
  selectedId: number | null
  onSelect: (s: Style) => void
}) {
  const sizeFor = (i: number): React.CSSProperties => {
    if (i < 3) return { fontSize: '14px', padding: '7px 13px', fontWeight: 800 }
    if (i < 6) return { fontSize: '12px', padding: '5px 10px', fontWeight: 700 }
    if (i < 10) return { fontSize: '11px', padding: '4px 9px', fontWeight: 600, opacity: 0.85 }
    return { fontSize: '10px', padding: '3px 8px', fontWeight: 500, opacity: 0.7 }
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
      {styles.map((s, i) => {
        const isSelected = selectedId === s.legacy_style_id
        return (
          <button
            key={s.legacy_style_id}
            type="button"
            onClick={() => onSelect(s)}
            className="rounded-full border transition hover:scale-[1.04] hover:-translate-y-0.5"
            style={{
              fontFamily: "'Outfit', sans-serif",
              background: isSelected ? 'var(--accent-orange)' : 'rgba(255,255,255,0.04)',
              color: isSelected ? '#000' : '#dde8f8',
              borderColor: isSelected ? 'var(--accent-orange)' : 'rgba(255,255,255,0.10)',
              ...sizeFor(i),
            }}
          >
            {s.style_name}
          </button>
        )
      })}
    </div>
  )
}
