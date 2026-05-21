'use client'

// components/profile/SideEqualizer.tsx
//
// Kompaktiškas equalizer — kaip artist hero player slot. Bar order'is —
// GENRE_COLORS array sequence (= top menu Muzika alphabetic order), NE pagal
// populiarumą. Spalvos iš genre-colors lib.
//
// Bars clickable — onSelect callback iškviečiamas su main genre name'u,
// parent komponentas (profile page) atvaizduoja favorite artists, kurie
// priklauso tam stiliui.

import { GENRE_COLORS } from '@/lib/genre-colors'

type MeterEntry = { slug: string; name: string; legacy_id: number; percent?: number; width_px?: number }

// Mapping iš music.lt short names į mūsų GENRE_COLORS full names.
// music_meter JSONB iš scraper'io naudoja music.lt UI short names.
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
  selectedGenre?: string | null     // full genre name (kuria filtras aktyvus)
  onSelect?: (fullGenreName: string | null) => void   // null = unselect
}

export function SideEqualizer({ meter, selectedGenre, onSelect }: Props) {
  if (!meter || !Array.isArray(meter) || meter.length === 0) return null

  // Map data į canonical GENRE_COLORS order
  const byShort = new Map<string, MeterEntry>()
  for (const m of meter) byShort.set(m.name, m)

  const bars = GENRE_COLORS.map((g) => {
    const short = FULL_TO_SHORT[g.name]
    const entry = byShort.get(short) || (short === 'Pop, R&B' ? byShort.get('Pop-RB') : null)
    return {
      fullName: g.name,
      short: g.short,                  // 'Pop, R&B', 'Rokas' etc
      percent: entry?.percent ?? 0,
      hex: g.hex,
      rgb: g.rgb,
    }
  })

  const maxPct = Math.max(...bars.map((b) => b.percent), 1)
  const BAR_BASE = 140

  return (
    <div className="rounded-2xl bg-gradient-to-br from-white/[.04] to-white/[.01] border border-white/[.06] p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#f97316]" style={{ fontFamily: "'Outfit', sans-serif" }}>
          Muzikinis skonis
        </div>
        {selectedGenre && onSelect && (
          <button
            onClick={() => onSelect(null)}
            className="text-[9px] font-bold text-[#8aa0c0] hover:text-white uppercase tracking-wider"
            style={{ fontFamily: "'Outfit', sans-serif" }}
          >
            ✕ Atstatyti
          </button>
        )}
      </div>

      {/* Bars — fixed canonical order */}
      <div className="flex items-end gap-1.5" style={{ height: `${BAR_BASE}px` }}>
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
              className={`flex-1 min-w-0 flex flex-col items-stretch transition-opacity ${
                clickable ? 'cursor-pointer hover:opacity-100' : 'cursor-default'
              } ${isDimmed ? 'opacity-30' : 'opacity-100'}`}
              style={{ alignSelf: 'flex-end' }}
              title={b.percent > 0 ? `${b.short} — ${b.percent.toFixed(0)}%` : `${b.short} — 0%`}
            >
              <div
                className="rounded-t relative overflow-hidden animate-[barRiseV5_700ms_cubic-bezier(0.34,1.56,0.64,1)_both]"
                style={{
                  height: `${heightPx}px`,
                  background: `linear-gradient(to top, rgba(${b.rgb}, 0.55), ${b.hex})`,
                  boxShadow: isSelected
                    ? `0 0 24px rgba(${b.rgb}, 0.7), inset 0 1px 0 rgba(255,255,255,0.5)`
                    : `0 0 14px rgba(${b.rgb}, 0.4), inset 0 1px 0 rgba(255,255,255,0.3)`,
                  animationDelay: `${i * 50}ms`,
                  outline: isSelected ? `2px solid ${b.hex}` : 'none',
                  outlineOffset: '2px',
                }}
              >
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/30" />
                <div className="absolute inset-0 flex flex-col-reverse pointer-events-none">
                  {Array.from({ length: Math.min(Math.floor(heightPx / 8), 18) }).map((_, j) => (
                    <div key={j} className="h-[8px] border-b border-black/30" />
                  ))}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Labels */}
      <div className="flex gap-1.5 mt-2">
        {bars.map((b) => {
          const isSelected = selectedGenre === b.fullName
          return (
            <div key={b.fullName} className={`flex-1 min-w-0 text-center ${selectedGenre && !isSelected ? 'opacity-30' : ''}`}>
              <div
                className={`text-[9px] font-bold truncate leading-tight ${isSelected ? 'text-white' : 'text-[#dde8f8]'}`}
                style={{ fontFamily: "'Outfit', sans-serif" }}
              >
                {b.short.replace(', ', '/')}
              </div>
              <div className="text-[9px] text-[#5e7290] font-mono">{b.percent.toFixed(0)}%</div>
            </div>
          )
        })}
      </div>

      {onSelect && (
        <p className="text-[10px] text-[#5e7290] text-center mt-3" style={{ fontFamily: "'Outfit', sans-serif" }}>
          Spauskite stulpelį — pamatysite mėgstamus to stiliaus atlikėjus
        </p>
      )}

      <style>{`@keyframes barRiseV5 { from { transform: scaleY(0.05); transform-origin: bottom; opacity: 0.5; } to { transform: scaleY(1); transform-origin: bottom; opacity: 1; } }`}</style>
    </div>
  )
}

export { SHORT_TO_FULL, FULL_TO_SHORT }
