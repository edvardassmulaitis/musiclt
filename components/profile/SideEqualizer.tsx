'use client'

// components/profile/SideEqualizer.tsx
//
// Equalizer — dual size variant: 'side' (compact, 360px wide) ir 'hero'
// (didelis, užima ~puse hero ploto). Hero variant turi:
//   - 220px BAR_BASE (~stipriai didesni stulpeliai)
//   - Stipriai didesni labels
//   - Aiškesnis emphasis ant pasirinkimo
//
// Bars klauso click'o ir invokes onSelect(fullGenreName | null) callback'ą
// — parent renders filtruotą artist/track sąrašą. Spalvos imamos iš
// GENRE_COLORS lib (top menu Muzika tvarka, NE pagal populiarumą).

import { GENRE_COLORS } from '@/lib/genre-colors'

type MeterEntry = { slug: string; name: string; legacy_id: number; percent?: number; width_px?: number }

const SHORT_TO_FULL: Record<string, string> = {
  'Alternatyva': 'Alternatyvioji muzika',
  'Elektronika': 'Elektroninė, šokių muzika',
  'Hip-hop':     "Hip-hop'o muzika",
  'Kita':        'Kitų stilių muzika',
  'Pop, R&B':    'Pop, R&B muzika',
  'Pop-RB':      'Pop, R&B muzika',
  'Rimtoji':     'Rimtoji muzika',
  'Rokas':       'Roko muzika',
  'Sunkioji':    'Sunkioji muzika',
}

const FULL_TO_SHORT: Record<string, string> = {
  'Alternatyvioji muzika': 'Alternatyva',
  'Elektroninė, šokių muzika': 'Elektronika',
  "Hip-hop'o muzika": 'Hip-hop',
  'Kitų stilių muzika': 'Kita',
  'Pop, R&B muzika': 'Pop, R&B',
  'Rimtoji muzika': 'Rimtoji',
  'Roko muzika': 'Rokas',
  'Sunkioji muzika': 'Sunkioji',
}

type Props = {
  meter: MeterEntry[] | null
  selectedGenre?: string | null
  onSelect?: (fullGenreName: string | null) => void
  variant?: 'side' | 'hero'
}

export function SideEqualizer({ meter, selectedGenre, onSelect, variant = 'side' }: Props) {
  if (!meter || !Array.isArray(meter) || meter.length === 0) return null

  const isHero = variant === 'hero'
  const BAR_BASE = isHero ? 220 : 140
  const titleFs   = isHero ? '12px' : '10px'
  const titleTr   = isHero ? '0.22em' : '0.18em'
  const labelFs   = isHero ? '11px' : '9px'
  const pctFs     = isHero ? '11px' : '9px'
  const padding   = isHero ? 'p-5 sm:p-6' : 'p-4 sm:p-5'

  // Map data į canonical GENRE_COLORS order
  const byShort = new Map<string, MeterEntry>()
  for (const m of meter) byShort.set(m.name, m)

  const bars = GENRE_COLORS.map((g) => {
    const short = FULL_TO_SHORT[g.name]
    const entry = byShort.get(short) || (short === 'Pop, R&B' ? byShort.get('Pop-RB') : null)
    return {
      fullName: g.name,
      short: g.short,
      percent: entry?.percent ?? 0,
      hex: g.hex,
      rgb: g.rgb,
    }
  })

  const maxPct = Math.max(...bars.map((b) => b.percent), 1)

  return (
    <div
      className={`relative rounded-2xl border ${padding}`}
      style={{
        background: 'linear-gradient(135deg, var(--card-bg), transparent 80%)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <div
          className="font-extrabold uppercase"
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: titleFs,
            letterSpacing: titleTr,
            color: 'var(--accent-orange)',
          }}
        >
          Muzikinis skonis
        </div>
        {selectedGenre && onSelect && (
          <button
            onClick={() => onSelect(null)}
            className="text-[10px] font-bold uppercase tracking-wider transition hover:opacity-80"
            style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-muted)' }}
          >
            ✕ Atstatyti
          </button>
        )}
      </div>

      {/* Bars — fixed canonical order */}
      <div className="flex items-end gap-1.5 sm:gap-2" style={{ height: `${BAR_BASE}px` }}>
        {bars.map((b, i) => {
          const heightPx = Math.max((b.percent / maxPct) * BAR_BASE, 4)
          const isSelected = selectedGenre === b.fullName
          const isDimmed = selectedGenre && !isSelected
          const clickable = b.percent > 0 && onSelect

          return (
            <button
              key={b.fullName}
              onClick={clickable ? () => onSelect(isSelected ? null : b.fullName) : undefined}
              disabled={!clickable}
              className={`flex-1 min-w-0 flex flex-col items-stretch transition-all ${
                clickable ? 'cursor-pointer hover:opacity-100 hover:-translate-y-0.5' : 'cursor-default'
              } ${isDimmed ? 'opacity-30' : 'opacity-100'}`}
              style={{ alignSelf: 'flex-end' }}
              title={b.percent > 0 ? `${b.short} — ${b.percent.toFixed(0)}%` : `${b.short} — 0%`}
            >
              <div
                className="rounded-t relative overflow-hidden animate-[barRiseV6_700ms_cubic-bezier(0.34,1.56,0.64,1)_both]"
                style={{
                  height: `${heightPx}px`,
                  background: `linear-gradient(to top, rgba(${b.rgb}, 0.55), ${b.hex})`,
                  boxShadow: isSelected
                    ? `0 0 32px rgba(${b.rgb}, 0.7), inset 0 1px 0 rgba(255,255,255,0.5)`
                    : `0 0 18px rgba(${b.rgb}, 0.4), inset 0 1px 0 rgba(255,255,255,0.3)`,
                  animationDelay: `${i * 50}ms`,
                  outline: isSelected ? `2px solid ${b.hex}` : 'none',
                  outlineOffset: '3px',
                }}
              >
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/30" />
                <div className="absolute inset-0 flex flex-col-reverse pointer-events-none">
                  {Array.from({ length: Math.min(Math.floor(heightPx / 8), 32) }).map((_, j) => (
                    <div key={j} className="h-[8px] border-b border-black/30" />
                  ))}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Labels */}
      <div className="flex gap-1.5 sm:gap-2 mt-2.5">
        {bars.map((b) => {
          const isSelected = selectedGenre === b.fullName
          const dimmed = selectedGenre && !isSelected
          return (
            <div key={b.fullName} className={`flex-1 min-w-0 text-center ${dimmed ? 'opacity-30' : ''}`}>
              <div
                className="font-bold truncate leading-tight"
                style={{
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: labelFs,
                  color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                {b.short.replace(', ', '/')}
              </div>
              <div
                className="font-mono"
                style={{ fontSize: pctFs, color: isSelected ? b.hex : 'var(--text-faint)' }}
              >
                {b.percent.toFixed(0)}%
              </div>
            </div>
          )
        })}
      </div>

      {isHero && onSelect && (
        <p
          className="text-center mt-4"
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: '11px',
            color: 'var(--text-muted)',
          }}
        >
          {selectedGenre
            ? `Pasirinkta — žemiau rodomi „${FULL_TO_SHORT[selectedGenre]}" atlikėjai ir dienos dainos`
            : 'Spauskite stulpelį — pamatysite to stiliaus atlikėjus ir dienos dainas'}
        </p>
      )}

      <style>{`@keyframes barRiseV6 { from { transform: scaleY(0.05); transform-origin: bottom; opacity: 0.5; } to { transform: scaleY(1); transform-origin: bottom; opacity: 1; } }`}</style>
    </div>
  )
}

export { SHORT_TO_FULL, FULL_TO_SHORT }
