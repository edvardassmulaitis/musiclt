'use client'

// components/profile/SideEqualizer.tsx
//
// V11 — pridėtas 'hero-mini' variant'as profile hero stulpeliui:
//   - Tik TOP 3 dominuojantys bars (paliečiamomis title'ėmis), likę
//     agreguojami į „Kita" stulpelį
//   - Maža expand ikona viršuje-dešinėje → onExpand() callback'as
//     atidaro pilną MusicTasteModal'ą (su visais 8 bars + substyles)
//   - Click ant bar'o taip pat triggerina onExpand su pre-selected genre
//
// Originalūs variantai paliekami:
//   - 'hero'    — didelis (220px), legacy
//   - 'side'    — 140px (legacy compact)
//   - 'compact' — 120px, kompaktiškas pločiui + tighter labels
//
// Animation flow:
//   1. Bars rise (700ms ease-out, staggered 60ms)
//   2. Shimmer line sweeps every 6s
//   3. Hover → translate-y -2px + glow expansion
//   4. Click → onSelect(fullGenreName) arba onExpand(genre|null) modal'ui

import { GENRE_COLORS } from '@/lib/genre-colors'

type MeterEntry = { slug: string; name: string; legacy_id: number; percent?: number; width_px?: number }

// V11.3: minimalistinės SVG ikonos per genre — naudojamos mini equalizer'e
// vietoj truncated text label'ių. Visi paths fit'ina 24×24 viewbox.
function GenreIcon({ genreName, size = 14 }: { genreName: string; size?: number }) {
  const stroke = 1.8
  const common = {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor', strokeWidth: stroke,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    'aria-hidden': true as any,
  }
  switch (genreName) {
    case 'Alternatyvioji muzika':
      // hexagon (alternatyvi forma)
      return <svg {...common}><polygon points="12 2 21 7 21 17 12 22 3 17 3 7" /></svg>
    case 'Elektroninė, šokių muzika':
      // square wave (synth)
      return <svg {...common}><path d="M2 16 V10 H8 V16 H14 V8 H20 V14" /></svg>
    case "Hip-hop'o muzika":
      // microphone
      return <svg {...common}><rect x="9" y="2" width="6" height="11" rx="3" /><path d="M5 11 a7 7 0 0 0 14 0" /><line x1="12" y1="18" x2="12" y2="22" /></svg>
    case 'Kitų stilių muzika':
      // 3 dots horizontal
      return <svg {...common} fill="currentColor" stroke="none"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
    case 'Pop, R&B muzika':
      // heart filled
      return <svg {...{ ...common, fill: 'currentColor', stroke: 'none' }}><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>
    case 'Rimtoji muzika':
      // musical note (filled head + stem)
      return <svg {...common}><circle cx="7" cy="18" r="3" fill="currentColor" stroke="none" /><line x1="10" y1="18" x2="10" y2="4" /><path d="M10 4 Q16 5 18 8" fill="none" /></svg>
    case 'Roko muzika':
      // lightning bolt
      return <svg {...{ ...common, fill: 'currentColor', stroke: 'none' }}><path d="M13 2 L4 14 H11 L10 22 L20 9 H13 L14 2 Z" /></svg>
    case 'Sunkioji muzika':
      // filled diamond (mass/weight)
      return <svg {...{ ...common, fill: 'currentColor', stroke: 'none' }}><path d="M12 2 L22 12 L12 22 L2 12 Z" /></svg>
    default:
      // dot
      return <svg {...common} fill="currentColor" stroke="none"><circle cx="12" cy="12" r="3" /></svg>
  }
}

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
  variant?: 'side' | 'hero' | 'compact' | 'hero-mini' | 'led-mini' | 'led-large'
  onExpand?: (preSelectedGenre?: string | null) => void
  /** Kiek bars rodyti. Default 8 (visi). Jei < 8 — likusi dalis agreguojama į „Kita". */
  topN?: number
  /** Naudoja LED equalizer'is — kuri bar yra aktyvi (genre full name). */
  ledSelectedGenre?: string | null
}

// LED-style segmented equalizer — V11.2: vieningas dizainas hero stulpeliui
// ir modal'ui. Du dydžiai (mini/large) keičia tik segmentų aukštį ir bar
// pločius — tas pats vizualus stilius. Default rodo visus 8 canonical
// GENRE_COLORS bars (topN=8); kai topN<8, top N pagal percent išskiriami,
// likę non-zero agreguojami į „Kita" bar'ą.
function LedEqualizer({
  meter, onExpand, topN = 8, size = 'mini', selectedGenre, onSelect,
}: {
  meter: MeterEntry[]
  onExpand?: (preSelectedGenre?: string | null) => void
  topN?: number
  size?: 'mini' | 'large'
  selectedGenre?: string | null
  onSelect?: (fullGenreName: string | null) => void
}) {
  const byShort = new Map<string, MeterEntry>()
  for (const m of meter) byShort.set(m.name, m)
  const allBars = GENRE_COLORS.map((g, canonicalIdx) => {
    const short = FULL_TO_SHORT[g.name]
    const entry = byShort.get(short) || (short === 'Pop, R&B' ? byShort.get('Pop-RB') : null)
    return {
      fullName: g.name,
      short: g.short,
      percent: entry?.percent ?? 0,
      hex: g.hex,
      rgb: g.rgb,
      canonicalIdx,
    }
  })

  // Kai topN >= 8 — rodom visus canonical bars, jokio Kita.
  // Kai topN < 8 — top N pagal percent, likę non-zero → Kita.
  let bars: typeof allBars
  if (topN >= 8) {
    bars = [...allBars] // canonical order
  } else {
    const nonZero = allBars.filter((b) => b.percent > 0)
    const selectedSet = new Set(
      [...nonZero].sort((a, b) => b.percent - a.percent).slice(0, topN).map((b) => b.fullName),
    )
    const selected = allBars.filter((b) => selectedSet.has(b.fullName))
    selected.sort((a, b) => a.canonicalIdx - b.canonicalIdx)
    const restPercent = nonZero
      .filter((b) => !selectedSet.has(b.fullName))
      .reduce((acc, b) => acc + b.percent, 0)
    const showRest = restPercent > 0.5
    bars = [
      ...selected,
      ...(showRest ? [{
        fullName: '__rest__',
        short: 'Kita',
        percent: restPercent,
        hex: '#8b95a5',
        rgb: '139, 149, 165',
        canonicalIdx: 999,
      }] : []),
    ]
  }
  const maxPct = Math.max(...bars.map((b) => b.percent), 1)
  const isLarge = size === 'large'
  const SEGMENTS = isLarge ? 18 : 11
  const CELL_H = isLarge ? 11 : 9
  const CELL_GAP = 1
  // V11.3: BAR_W už visą flex-1 plotį; gap mažesnis (3-4px) — atrodo
  // kaip tikras LED equalizer'is be didžiulių tarpų.
  const BAR_MAX_W = isLarge ? 52 : 44
  const LABEL_FS = isLarge ? '11px' : '9px'
  const PCT_FS = isLarge ? '10px' : '9px'

  const handleBarClick = (b: { fullName: string }) => {
    if (b.fullName === '__rest__') {
      onExpand?.(null)
      return
    }
    if (onSelect) {
      onSelect(b.fullName === selectedGenre ? null : b.fullName)
      return
    }
    onExpand?.(b.fullName)
  }

  return (
    <div
      className={`relative rounded-2xl border overflow-hidden ${isLarge ? 'p-5 sm:p-6' : 'p-3 sm:p-4'} h-full flex flex-col`}
      style={{
        background: 'linear-gradient(135deg, var(--card-bg), transparent 80%)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div
          className="font-extrabold uppercase"
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: isLarge ? '11px' : '10px',
            letterSpacing: '0.22em',
            color: 'var(--accent-orange)',
          }}
        >
          Muzikinis skonis
        </div>
        {onExpand && !isLarge && (
          <button
            type="button"
            onClick={() => onExpand(null)}
            className="w-7 h-7 -mr-1 flex items-center justify-center rounded-md transition hover:bg-white/5"
            title="Pilna versija + visi stiliai"
            aria-label="Atidaryti pilną muzikinį skonį"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }} aria-hidden>
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
        )}
        {selectedGenre && onSelect && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="text-[10px] font-bold uppercase tracking-wider transition hover:opacity-80"
            style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-muted)' }}
          >
            ✕ Atstatyti
          </button>
        )}
      </div>

      {/* LED-style segmented equalizer — V11.3: gap-1 (4px) ne gap-2; bars wider */}
      <div className="relative flex items-end justify-between gap-1 sm:gap-1.5 flex-1 py-1"
           style={{ minHeight: `${SEGMENTS * (CELL_H + CELL_GAP)}px` }}>
        {bars.map((b, i) => {
          const litCount = Math.max(Math.round((b.percent / maxPct) * SEGMENTS), b.percent > 0 ? 1 : 0)
          const isRest = b.fullName === '__rest__'
          const isSelected = selectedGenre === b.fullName
          const isDimmed = selectedGenre && !isSelected && !isRest
          const bouncePhase = (i * 0.42) % 1
          return (
            <button
              key={b.fullName}
              type="button"
              onClick={() => handleBarClick(b)}
              className={`group flex-1 min-w-0 flex flex-col items-center cursor-pointer transition hover:-translate-y-0.5 ${isDimmed ? 'opacity-40' : ''}`}
              title={isRest ? 'Visi kiti stiliai — atidaryti modalą' : `${b.short} — ${b.percent.toFixed(0)}%`}
              style={{
                animation: b.percent > 0
                  ? `eqBarBounceV11 ${1.8 + bouncePhase * 1.2}s ease-in-out ${bouncePhase * 0.6}s infinite alternate`
                  : undefined,
              }}
            >
              <div className="flex flex-col-reverse gap-[1px] w-full" style={{ maxWidth: `${BAR_MAX_W}px` }}>
                {Array.from({ length: SEGMENTS }).map((_, segIdx) => {
                  const lit = segIdx < litCount
                  const ratio = segIdx / Math.max(SEGMENTS - 1, 1)
                  const alpha = lit ? (0.55 + ratio * 0.45) : 0.08
                  const glow = lit && segIdx >= litCount - 2
                  return (
                    <div
                      key={segIdx}
                      className="rounded-[1px]"
                      style={{
                        height: `${CELL_H}px`,
                        background: lit
                          ? `rgba(${b.rgb}, ${isSelected ? Math.min(alpha + 0.15, 1) : alpha})`
                          : 'rgba(255,255,255,0.05)',
                        boxShadow: glow ? `0 0 ${isSelected ? 10 : 6}px rgba(${b.rgb}, ${isSelected ? 0.9 : 0.7})` : 'none',
                        opacity: 0,
                        animation: `eqSegFadeV11 250ms ease-out ${120 + (i * 35) + (segIdx * 20)}ms forwards`,
                      }}
                    />
                  )
                })}
              </div>
            </button>
          )
        })}
      </div>

      {/* Labels — V11.3: mini'e icons + %, large'e icon + text + % */}
      <div className={`flex gap-1 sm:gap-1.5 ${isLarge ? 'mt-3' : 'mt-2'} justify-between`}>
        {bars.map((b) => {
          const isSelected = selectedGenre === b.fullName
          const isRest = b.fullName === '__rest__'
          return (
            <div key={b.fullName} className="flex-1 min-w-0 text-center flex flex-col items-center gap-0.5"
                 style={{ maxWidth: `${BAR_MAX_W}px` }}>
              <span style={{
                color: isSelected ? b.hex : isRest ? 'var(--text-muted)' : `rgba(${b.rgb}, 0.85)`,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {isRest ? (
                  <svg width={isLarge ? 16 : 14} height={isLarge ? 16 : 14} viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden>
                    <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
                  </svg>
                ) : (
                  <GenreIcon genreName={b.fullName} size={isLarge ? 16 : 14} />
                )}
              </span>
              {isLarge && (
                <span
                  className="font-bold truncate leading-tight w-full"
                  style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: LABEL_FS,
                    color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                    letterSpacing: '0.02em',
                  }}
                  title={b.short}
                >
                  {b.short.split(',')[0].split('/')[0].slice(0, 12)}
                </span>
              )}
              <span
                className="font-mono"
                style={{ fontSize: PCT_FS, color: isSelected ? b.hex : 'var(--text-faint)' }}
              >
                {b.percent.toFixed(0)}%
              </span>
            </div>
          )
        })}
      </div>

      <style>{`
        @keyframes eqSegFadeV11 {
          0%   { opacity: 0; transform: translateY(2px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes eqBarBounceV11 {
          0%   { transform: translateY(0); }
          100% { transform: translateY(-1.5px); }
        }
      `}</style>
    </div>
  )
}

export function SideEqualizer({ meter, selectedGenre, onSelect, variant = 'side', onExpand, topN, ledSelectedGenre }: Props) {
  if (!meter || !Array.isArray(meter) || meter.length === 0) return null

  // V11.2: visi LED-style variantai per LedEqualizer (vienodas dizainas)
  if (variant === 'hero-mini' || variant === 'led-mini') {
    return <LedEqualizer meter={meter} onExpand={onExpand} topN={topN ?? 8} size="mini" />
  }
  if (variant === 'led-large') {
    return <LedEqualizer
      meter={meter}
      onExpand={onExpand}
      topN={topN ?? 8}
      size="large"
      selectedGenre={ledSelectedGenre ?? null}
      onSelect={onSelect}
    />
  }

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
