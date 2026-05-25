'use client'

// components/profile/GenreFilterModal.tsx
//
// V11 — pakeitė rolę iš pre-filtered display į pilną „Muzikinis skonis"
// explorer modal'ą:
//   1. Viršuje — pilnas equalizer (SideEqualizer variant='hero') su click
//      filtravimu pagal genre
//   2. Žemiau — visi substyles chips, click ant chip filtruoja substyles
//   3. Apačioje — filtered atlikėjai + dienos dainos, atnaujinami live'iniai
//   4. "✕ Visi" mygtukas atstato filter
//
// Modal atidarymas iš dviejų vietų:
//   a) Hero-mini equalizer expand ikona → modal'as su filter=null
//   b) Click ant hero-mini bar'o → modal'as su pre-selected genre

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { SideEqualizer, FULL_TO_SHORT } from './SideEqualizer'

type SubstyleFilter = { kind: 'substyle'; legacyId: number; name: string }
type GenreFilter = { kind: 'genre'; name: string }
type AnyFilter = SubstyleFilter | GenreFilter

type Style = { legacy_style_id: number; style_slug: string; style_name: string; sort_order: number }

export function GenreFilterModal({
  initialFilter, meter, styles, artists, picks, onClose,
}: {
  initialFilter?: AnyFilter | null
  meter: any
  styles: Style[]
  artists: any[]
  picks: any[]
  onClose: () => void
}) {
  const [filter, setFilter] = useState<AnyFilter | null>(initialFilter || null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

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
    if (filter.kind !== 'genre') return [] // substyle per pick ne pasiekiamas
    return picks.filter((p: any) => {
      const t = p.tracks
      if (!t) return false
      const genres: { id: number; name: string }[] = t.artistMainGenres || []
      return genres.some((g) => g.name === filter.name)
    })
  }, [picks, filter])

  const headline = useMemo(() => {
    if (!filter) return 'Visi mėgstamiausi stiliai'
    if (filter.kind === 'genre') return `„${FULL_TO_SHORT[filter.name] || filter.name}" muzika`
    return `„${filter.name}" substilas`
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
          <div
            className="text-[10px] font-extrabold uppercase tracking-[0.22em] mb-1.5"
            style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--accent-orange)' }}
          >
            Muzikinis skonis
          </div>
          <div className="flex items-baseline justify-between gap-3 flex-wrap mb-4">
            <h2
              className="font-black tracking-[-0.025em] leading-tight"
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: 'clamp(1.4rem, 3vw, 1.85rem)',
                color: 'var(--text-primary)',
              }}
            >
              {headline}
            </h2>
            {filter && (
              <button
                type="button"
                onClick={() => setFilter(null)}
                className="text-[11px] font-extrabold uppercase tracking-wider transition hover:opacity-80"
                style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--accent-orange)' }}
              >
                ✕ Atstatyti
              </button>
            )}
          </div>

          {/* Full equalizer */}
          {meter && Array.isArray(meter) && meter.length > 0 && (
            <div className="mb-5">
              <SideEqualizer
                meter={meter}
                variant="hero"
                selectedGenre={filter?.kind === 'genre' ? filter.name : null}
                onSelect={(g) => {
                  if (!g) setFilter(null)
                  else setFilter({ kind: 'genre', name: g })
                }}
              />
            </div>
          )}

          {/* Substyles cloud */}
          {styles && styles.length > 0 && (
            <div className="mb-6">
              <div
                className="text-[10px] font-extrabold uppercase tracking-[0.18em] mb-2.5"
                style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-muted)' }}
              >
                Mėgstamiausi substilai · click filtruoja
              </div>
              <SubstyleCloud
                styles={styles}
                selectedId={filter?.kind === 'substyle' ? filter.legacyId : null}
                onSelect={(s) => setFilter({ kind: 'substyle', legacyId: s.legacy_style_id, name: s.style_name })}
              />
            </div>
          )}

          <p
            className="text-xs sm:text-sm mb-3"
            style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}
          >
            {filteredArtists.length} atlikėjų · {filteredPicks.length} dienos dainų
          </p>

          {filteredArtists.length === 0 && filteredPicks.length === 0 && (
            <div
              className="mt-3 p-5 rounded-xl text-center text-sm"
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
            title={`Filtruoti „${s.style_name}"`}
          >
            {s.style_name}
          </button>
        )
      })}
    </div>
  )
}
