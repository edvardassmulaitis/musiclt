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

// V11.4: persvarstytos SVG ikonos. Pop/R&B = mic + širdis (vokalas + meilė),
// hip-hop'ui pakeista į baseball cap, kad nekonkuruotų. Rokas = el. gitara,
// sunkioji = metal horns hand (🤘), klasikinė = smuiko raktas, alternative =
// rotated diamond, elektroninė = ausinės.
function GenreIcon({ genreName, size = 14 }: { genreName: string; size?: number }) {
  const stroke = 1.8
  const baseStrokeProps = {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor', strokeWidth: stroke,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    'aria-hidden': true as any,
  }
  const baseFillProps = {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'currentColor', stroke: 'none',
    'aria-hidden': true as any,
  }

  switch (genreName) {
    case 'Alternatyvioji muzika':
      // Rotated diamond outline (alternative geometry)
      return (
        <svg {...baseStrokeProps}>
          <rect x="4.5" y="4.5" width="15" height="15" transform="rotate(45 12 12)" />
        </svg>
      )
    case 'Elektroninė, šokių muzika':
      // Headphones (DJ/club)
      return (
        <svg {...baseStrokeProps}>
          <path d="M 4 14 V 11 a 8 8 0 0 1 16 0 V 14" />
          <rect x="3" y="14" width="4" height="6" rx="1" fill="currentColor" />
          <rect x="17" y="14" width="4" height="6" rx="1" fill="currentColor" />
        </svg>
      )
    case "Hip-hop'o muzika":
      // Baseball cap (snapback) — universally hip-hop
      return (
        <svg {...baseFillProps}>
          <path d="M 5 14 Q 5 6 12 6 Q 19 6 19 14 Z" />
          <rect x="2" y="14" width="20" height="2.5" rx="1" />
        </svg>
      )
    case 'Kitų stilių muzika':
      // 3 dots horizontal (eclectic mix)
      return (
        <svg {...baseFillProps}>
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      )
    case 'Pop, R&B muzika':
      // Mic with small heart accent (vocal + romance)
      return (
        <svg {...baseFillProps}>
          <rect x="9" y="3" width="5" height="10" rx="2.5" />
          <path d="M 5 11 a 6.5 6.5 0 0 0 12 0 H 15 a 4.5 4.5 0 0 1 -9 0 Z" />
          <rect x="10.5" y="17" width="2" height="4" rx="0.5" />
          {/* Heart accent — top-right corner */}
          <path d="M 19.5 4.5 c -0.9 -0.9 -2.4 0.1 -1.2 1.4 L 19.5 7.4 L 20.7 5.9 c 1.2 -1.3 -0.3 -2.3 -1.2 -1.4 Z" />
        </svg>
      )
    case 'Rimtoji muzika':
      // Treble clef (simplified curlicue) — iconic classical
      return (
        <svg {...baseStrokeProps} strokeWidth="1.6">
          <path d="M 12 4 C 9 4.5 9 9 12 9 C 15 9 14.5 13 11 14 C 7.5 15 8 20 12 20 C 14.5 20 14.5 17 12 17 C 10 17 10 19 12 19" />
          <line x1="12" y1="4" x2="12" y2="21" />
          <circle cx="11" cy="21" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'Roko muzika':
      // Electric guitar — circular body + diagonal neck + headstock
      return (
        <svg {...baseFillProps}>
          <ellipse cx="8" cy="16" rx="5.5" ry="4.5" />
          {/* Neck */}
          <rect x="11.5" y="3" width="2.5" height="13" rx="0.3" transform="rotate(35 12.75 9.5)" />
          {/* Headstock */}
          <path d="M 19.5 2 L 22 3 L 21 5.5 L 18.5 4.5 Z" />
          {/* Sound hole */}
          <circle cx="8" cy="16" r="1.4" fill="rgba(0,0,0,0.55)" />
        </svg>
      )
    case 'Sunkioji muzika':
      // Metal horns hand 🤘 — fist with index + pinky up
      return (
        <svg {...baseFillProps}>
          {/* Fist body */}
          <rect x="5" y="11" width="14" height="11" rx="3" />
          {/* Index finger */}
          <rect x="6.2" y="3" width="2.6" height="9" rx="0.6" />
          {/* Pinky finger */}
          <rect x="15.2" y="3" width="2.6" height="9" rx="0.6" />
          {/* Thumb wrap */}
          <rect x="3.5" y="14" width="2.5" height="4" rx="1" />
        </svg>
      )
    default:
      return (
        <svg {...baseFillProps}><circle cx="12" cy="12" r="3" /></svg>
      )
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
  // V11.4: bars touch (no gap), 1px dark separator tarp jų — kaip tikras
  // LED equalizer'is. Pločiai vienodi per flex-1.
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

      {/* LED-style segmented equalizer — V11.4: bars touching (gap=0),
          1px dark separator tarp jų; vienodi pločiai. */}
      <div className="relative flex items-end flex-1 py-1"
           style={{ minHeight: `${SEGMENTS * (CELL_H + CELL_GAP)}px` }}>
        {bars.map((b, i) => {
          const litCount = Math.max(Math.round((b.percent / maxPct) * SEGMENTS), b.percent > 0 ? 1 : 0)
          const isRest = b.fullName === '__rest__'
          const isSelected = selectedGenre === b.fullName
          const isDimmed = selectedGenre && !isSelected && !isRest
          const bouncePhase = (i * 0.42) % 1
          const isLast = i === bars.length - 1
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
                borderRight: isLast ? 'none' : '1px solid rgba(0,0,0,0.35)',
              }}
            >
              <div className="flex flex-col-reverse gap-[1px] w-full px-[2px]">
                {Array.from({ length: SEGMENTS }).map((_, segIdx) => {
                  const lit = segIdx < litCount
                  const ratio = segIdx / Math.max(SEGMENTS - 1, 1)
                  const alpha = lit ? (0.55 + ratio * 0.45) : 0.08
                  const glow = lit && segIdx >= litCount - 2
                  return (
                    <div
                      key={segIdx}
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

      {/* Labels — vienoda struktūra kaip bars (be gap, vienodi pločiai),
          kad icons + % tiksliai linijuoti virš stulpelių. */}
      <div className={`flex ${isLarge ? 'mt-3' : 'mt-2'}`}>
        {bars.map((b) => {
          const isSelected = selectedGenre === b.fullName
          const isRest = b.fullName === '__rest__'
          return (
            <div key={b.fullName} className="flex-1 min-w-0 text-center flex flex-col items-center gap-0.5">
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
                  className="font-bold truncate leading-tight w-full px-1"
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
