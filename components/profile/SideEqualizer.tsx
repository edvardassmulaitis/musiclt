'use client'

// components/profile/SideEqualizer.tsx
//
// V8 — kompaktiškas equalizer su animuotu nuokrypiu, žaibo tarpais ir grid
// overlay'ais. Click ant stulpelio iškviečia onSelect(genre) callback'ą,
// kurį parent (profile-client) konvertuoja į modal'ą — nebekeičia page
// turinio žemiau. Trys variantai:
//   - 'hero'    — didelis (220px), naudotas seniau (paliekam compat)
//   - 'side'    — 140px (legacy compact)
//   - 'compact' — 120px, kompaktiškas pločiui + tighter labels
//
// Animation flow:
//   1. Bars rise (700ms ease-out, staggered 60ms)
//   2. Shimmer line sweeps every 6s
//   3. Hover → translate-y -2px + glow expansion
//   4. Click → onSelect(fullGenreName) ir parent atidaro GenreFilterModal'ą
//
// Labels — flex-1 min-w-0 truncate ant CSS clamp font; jei stulpelių 8,
// 11px font'as visu plotyje fit'isi compact variante (12vw → 11px sm:).

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
  variant?: 'side' | 'hero' | 'compact'
}

export function SideEqualizer({ meter, selectedGenre, onSelect, variant = 'side' }: Props) {
  if (!meter || !Array.isArray(meter) || meter.length === 0) return null

  const isHero = variant === 'hero'
  const isCompact = variant === 'compact'
  const BAR_BASE = isHero ? 220 : isCompact ? 120 : 140
  const titleFs   = isHero ? '12px' : '10px'
  const titleTr   = isHero ? '0.22em' : '0.18em'
  const labelFs   = isHero ? '11px' : isCompact ? '10px' : '9px'
  const pctFs     = isHero ? '11px' : isCompact ? '9px' : '9px'
  const padding   = isHero ? 'p-5 sm:p-6' : isCompact ? 'p-3.5 sm:p-4' : 'p-4 sm:p-5'

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
      className={`relative rounded-2xl border overflow-hidden ${padding}`}
      style={{
        background: 'linear-gradient(135deg, var(--card-bg), transparent 80%)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      {/* Ambient sweep — pridėtas grožiui */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-0 opacity-50">
        <div
          className="absolute inset-y-0 -left-1/3 w-2/3"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)',
            animation: 'eqShimmerSweep 7s linear infinite',
          }}
        />
      </div>

      <div className="relative flex items-center justify-between mb-3">
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
      <div className="relative flex items-end gap-[6px] sm:gap-2" style={{ height: `${BAR_BASE}px` }}>
        {bars.map((b, i) => {
          const heightPx = Math.max((b.percent / maxPct) * BAR_BASE, 6)
          const isSelected = selectedGenre === b.fullName
          const isDimmed = selectedGenre && !isSelected
          const clickable = b.percent > 0 && onSelect

          return (
            <button
              key={b.fullName}
              onClick={clickable ? () => onSelect(b.fullName) : undefined}
              disabled={!clickable}
              className={`group flex-1 min-w-0 flex flex-col items-stretch transition-all duration-300 ${
                clickable ? 'cursor-pointer hover:-translate-y-1' : 'cursor-default'
              } ${isDimmed ? 'opacity-40' : 'opacity-100'}`}
              style={{ alignSelf: 'flex-end' }}
              title={b.percent > 0 ? `${b.short} — ${b.percent.toFixed(0)}%` : `${b.short} — 0%`}
            >
              <div
                className="relative overflow-hidden rounded-t-md"
                style={{
                  height: `${heightPx}px`,
                  background: `linear-gradient(to top, rgba(${b.rgb}, 0.30), rgba(${b.rgb}, 0.95) 80%, ${b.hex})`,
                  boxShadow: isSelected
                    ? `0 0 32px rgba(${b.rgb}, 0.75), inset 0 1px 0 rgba(255,255,255,0.5)`
                    : `0 0 14px rgba(${b.rgb}, 0.35), inset 0 1px 0 rgba(255,255,255,0.25)`,
                  outline: isSelected ? `2px solid ${b.hex}` : 'none',
                  outlineOffset: '3px',
                  transform: 'scaleY(0.05)',
                  transformOrigin: 'bottom',
                  opacity: 0.6,
                  animation: `barRiseV8 800ms cubic-bezier(0.22, 1, 0.36, 1) ${100 + i * 65}ms forwards`,
                }}
              >
                {/* Top highlight */}
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/45" />
                {/* Subtle scan-line grid */}
                <div aria-hidden className="absolute inset-0 flex flex-col-reverse pointer-events-none">
                  {Array.from({ length: Math.min(Math.floor(heightPx / 9), 32) }).map((_, j) => (
                    <div key={j} className="h-[9px] border-b" style={{ borderColor: 'rgba(0,0,0,0.28)' }} />
                  ))}
                </div>
                {/* Hover gloss */}
                <div
                  aria-hidden
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                  style={{
                    background: `linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 50%)`,
                  }}
                />
              </div>
            </button>
          )
        })}
      </div>

      {/* Labels */}
      <div className="flex gap-[6px] sm:gap-2 mt-2.5">
        {bars.map((b) => {
          const isSelected = selectedGenre === b.fullName
          const dimmed = selectedGenre && !isSelected
          // Show shortest possible name; only 1st 3-4 letters for compact
          const shortText = isCompact
            ? b.short.split(/[,\s/-]/)[0].slice(0, 7)
            : b.short.replace(', ', '/')
          return (
            <div key={b.fullName} className={`flex-1 min-w-0 text-center ${dimmed ? 'opacity-30' : ''}`}>
              <div
                className="font-bold truncate leading-tight"
                style={{
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: labelFs,
                  color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
                title={b.short}
              >
                {shortText}
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

      <style>{`
        @keyframes barRiseV8 {
          0%   { transform: scaleY(0.05); opacity: 0.5; }
          60%  { transform: scaleY(1.06); opacity: 1; }
          100% { transform: scaleY(1); opacity: 1; }
        }
        @keyframes eqShimmerSweep {
          0%   { transform: translateX(-30%); }
          100% { transform: translateX(180%); }
        }
      `}</style>
    </div>
  )
}

export { SHORT_TO_FULL, FULL_TO_SHORT }
