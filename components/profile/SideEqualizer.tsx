'use client'

// components/profile/SideEqualizer.tsx
//
// V11.5 — perdarytas iš ikonų atgal į tekstinius pavadinimus:
//   • DISPLAY_ORDER su user'io pageidaujama tvarka: Pop / Elektronika /
//     Hip-hop / Alternatyva / Rokas / Sunkioji / Klasika / Kita
//   • SHORT_LABELS — trumpinti lietuviški pavadinimai, kad tilptų bar'ų
//     pločiuose (max ~8 simbolių, 8.5px font)
//   • Mobile (<640px) automatiškai rodom tik top N (default 4) — kiti
//     agreguojami į „Kita"; click bet kuriame bar atidaro full modal
//   • Modal'as priima orientation='horizontal' — bars tampa horizontalūs
//     rows (mobile screen'ui patogiau skaityti)
//   • Brighter snap-in load animacija su bounce + glow flash
//
// Du dydžiai mini (hero stulpelis) ir large (modal'as). Visi LED-style
// segmentai (gap-0, susiglaudę), 1px dark separator tarp bars.

import { useEffect, useState } from 'react'
import { GENRE_COLORS, type GenreColor } from '@/lib/genre-colors'

type MeterEntry = { slug: string; name: string; legacy_id: number; percent?: number; width_px?: number }

// Display order — Edvardas pageidaujama tvarka.
const DISPLAY_ORDER: string[] = [
  'Pop, R&B muzika',
  'Elektroninė, šokių muzika',
  "Hip-hop'o muzika",
  'Alternatyvioji muzika',
  'Roko muzika',
  'Sunkioji muzika',
  'Rimtoji muzika',
  'Kitų stilių muzika',
]

// Trumpi LT pavadinimai, kad tilptų ant siaurų bar'ų.
const SHORT_LABELS: Record<string, string> = {
  'Pop, R&B muzika':           'Pop',
  'Elektroninė, šokių muzika': 'Elektronika',
  "Hip-hop'o muzika":          'Hip-hop',
  'Alternatyvioji muzika':     'Alternatyva',
  'Roko muzika':               'Rokas',
  'Sunkioji muzika':           'Sunkioji',
  'Rimtoji muzika':            'Klasika',
  'Kitų stilių muzika':        'Kita',
}

const SHORT_TO_FULL: Record<string, string> = {
  'Alternatyva': 'Alternatyvioji muzika',
  'Elektronika': 'Elektroninė, šokių muzika',
  'Hip-hop':     "Hip-hop'o muzika",
  'Kita':        'Kitų stilių muzika',
  'Pop, R&B':    'Pop, R&B muzika',
  'Pop-RB':      'Pop, R&B muzika',
  'Klasika':     'Rimtoji muzika',
  'Rimtoji':     'Rimtoji muzika',
  'Rokas':       'Roko muzika',
  'Sunkioji':    'Sunkioji muzika',
}

// V11.5.1 fix: FULL_TO_SHORT VEIKIA kaip data lookup (atitinka meter
// entries `name` lauką iš senos music.lt). Display names atskirai per
// SHORT_LABELS. Anksčiau Rimtoji muzika → 'Klasika' (display name) laužė
// lookup'ą, nes meter.name = 'Rimtoji'.
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
  topN?: number
  mobileTopN?: number
  orientation?: 'vertical' | 'horizontal'
  ledSelectedGenre?: string | null
  hideHeader?: boolean
}

type Bar = {
  fullName: string
  short: string
  label: string
  percent: number
  hex: string
  rgb: string
}

function buildBars(meter: MeterEntry[], topN: number): Bar[] {
  // Index meter by FULL_TO_SHORT short key
  const byShort = new Map<string, MeterEntry>()
  for (const m of meter) byShort.set(m.name, m)

  // Build bars in DISPLAY_ORDER (NOT canonical GENRE_COLORS order)
  const all = DISPLAY_ORDER.map((fullName) => {
    const gc: GenreColor | undefined = GENRE_COLORS.find((g) => g.name === fullName)
    if (!gc) return null
    const short = FULL_TO_SHORT[fullName]
    const entry = byShort.get(short) || (short === 'Pop, R&B' ? byShort.get('Pop-RB') : null)
    return {
      fullName,
      short: gc.short,
      label: SHORT_LABELS[fullName] || gc.short,
      percent: entry?.percent ?? 0,
      hex: gc.hex,
      rgb: gc.rgb,
    } as Bar
  }).filter(Boolean) as Bar[]

  if (topN >= 8) return all

  // Pick top N pagal percent; like, „Kita" aggregates the rest (non-zero only)
  const nonZero = all.filter((b) => b.percent > 0)
  const topSet = new Set([...nonZero].sort((a, b) => b.percent - a.percent).slice(0, topN).map((b) => b.fullName))
  const selected = all.filter((b) => topSet.has(b.fullName))
  const restPercent = nonZero.filter((b) => !topSet.has(b.fullName)).reduce((acc, b) => acc + b.percent, 0)
  const result = [...selected]
  if (restPercent > 0.5) {
    result.push({
      fullName: '__rest__',
      short: 'Kita',
      label: 'Kita',
      percent: restPercent,
      hex: '#8b95a5',
      rgb: '139, 149, 165',
    })
  }
  return result
}

// ─── LED equalizer renderers ──────────────────────────────────────────

function LedVertical({
  bars, size, selectedGenre, isLarge, onBarClick,
}: {
  bars: Bar[]
  size: 'mini' | 'large'
  selectedGenre: string | null | undefined
  isLarge: boolean
  onBarClick: (b: Bar) => void
}) {
  const SEGMENTS = isLarge ? 18 : 11
  const CELL_H = isLarge ? 11 : 9
  const CELL_GAP = 1
  const LABEL_FS = isLarge ? '11px' : '8.5px'
  const PCT_FS = isLarge ? '10px' : '8.5px'
  const maxPct = Math.max(...bars.map((b) => b.percent), 1)

  return (
    <>
      <div
        className="relative flex items-end flex-1 py-1"
        style={{ minHeight: `${SEGMENTS * (CELL_H + CELL_GAP)}px` }}
      >
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
              onClick={() => onBarClick(b)}
              className={`group flex-1 min-w-0 flex flex-col items-center cursor-pointer transition hover:-translate-y-0.5 ${isDimmed ? 'opacity-40' : ''}`}
              title={isRest ? 'Visi kiti stiliai — atidaryti modalą' : `${b.label} — ${b.percent.toFixed(0)}%`}
              style={{
                animation: b.percent > 0 ? `eqBarBounceV11 ${1.8 + bouncePhase * 1.2}s ease-in-out ${bouncePhase * 0.6}s infinite alternate` : undefined,
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
                          : 'var(--eq-unlit)',
                        boxShadow: glow ? `0 0 ${isSelected ? 10 : 6}px rgba(${b.rgb}, ${isSelected ? 0.9 : 0.7})` : 'none',
                        opacity: 0,
                        transform: 'scaleY(0.3)',
                        animation: `eqSegSnapV115 380ms cubic-bezier(0.34, 1.56, 0.64, 1) ${80 + (i * 45) + (segIdx * 26)}ms forwards`,
                      }}
                    />
                  )
                })}
              </div>
            </button>
          )
        })}
      </div>

      <div className={`flex ${isLarge ? 'mt-3' : 'mt-2'}`}>
        {bars.map((b) => {
          const isSelected = selectedGenre === b.fullName
          return (
            <div key={b.fullName} className="flex-1 min-w-0 text-center flex flex-col items-center px-[1px]">
              <span
                className="font-extrabold truncate leading-tight w-full"
                style={{
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: LABEL_FS,
                  color: isSelected ? b.hex : 'var(--text-secondary)',
                  letterSpacing: '-0.015em',
                }}
                title={`${b.label} — ${b.percent.toFixed(0)}%`}
              >
                {b.label}
              </span>
            </div>
          )
        })}
      </div>
    </>
  )
}

function LedHorizontal({
  bars, selectedGenre, onBarClick,
}: {
  bars: Bar[]
  selectedGenre: string | null | undefined
  onBarClick: (b: Bar) => void
}) {
  const maxPct = Math.max(...bars.map((b) => b.percent), 1)
  return (
    <div className="flex flex-col gap-2">
      {bars.map((b, i) => {
        const pctOfMax = (b.percent / maxPct) * 100
        const isRest = b.fullName === '__rest__'
        const isSelected = selectedGenre === b.fullName
        const isDimmed = selectedGenre && !isSelected && !isRest
        return (
          <button
            key={b.fullName}
            type="button"
            onClick={() => onBarClick(b)}
            className={`group flex items-center gap-3 w-full text-left transition hover:translate-x-0.5 ${isDimmed ? 'opacity-40' : ''}`}
            title={isRest ? 'Visi kiti stiliai' : `${b.label} — ${b.percent.toFixed(0)}%`}
          >
            <span
              className="font-extrabold truncate"
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: '14px',
                color: isSelected ? b.hex : 'var(--text-primary)',
                width: '90px',
                flexShrink: 0,
              }}
            >
              {b.label}
            </span>
            <div className="flex-1 relative h-3.5 rounded-md overflow-hidden"
                 style={{ background: 'rgba(255,255,255,0.05)' }}>
              <div
                className="absolute inset-y-0 left-0 rounded-md transition-all"
                style={{
                  width: `${pctOfMax}%`,
                  background: `linear-gradient(to right, rgba(${b.rgb}, 0.55), rgba(${b.rgb}, 0.95))`,
                  boxShadow: isSelected ? `0 0 14px rgba(${b.rgb}, 0.6)` : `0 0 6px rgba(${b.rgb}, 0.3)`,
                  opacity: 0,
                  transform: 'scaleX(0.05)',
                  transformOrigin: 'left',
                  animation: `eqHorizFillV115 520ms cubic-bezier(0.34, 1.56, 0.64, 1) ${100 + i * 80}ms forwards`,
                }}
              />
            </div>
            <span
              className="font-mono tabular-nums flex-shrink-0"
              style={{ fontSize: '13px', color: isSelected ? b.hex : 'var(--text-muted)', width: '34px', textAlign: 'right' }}
            >
              {b.percent.toFixed(0)}%
            </span>
          </button>
        )
      })}
    </div>
  )
}

function LedEqualizer({
  meter, onExpand, topN = 8, mobileTopN, size = 'mini', selectedGenre, onSelect, orientation, hideHeader,
}: {
  meter: MeterEntry[]
  onExpand?: (preSelectedGenre?: string | null) => void
  topN?: number
  mobileTopN?: number
  size?: 'mini' | 'large'
  selectedGenre?: string | null
  onSelect?: (fullGenreName: string | null) => void
  orientation?: 'vertical' | 'horizontal'
  hideHeader?: boolean
}) {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 639px)')
    setIsMobile(mq.matches)
    const h = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])

  const isLarge = size === 'large'
  // Mobile auto-collapse — naudoja mobileTopN (default 4 mini / 8 large).
  const effectiveTopN = isMobile
    ? (mobileTopN ?? (isLarge ? 8 : 4))
    : topN
  // Modal mobile'e → horizontal layout (geriau matomi LT pavadinimai).
  const effectiveOrientation: 'vertical' | 'horizontal' =
    orientation ? orientation : (isLarge && isMobile ? 'horizontal' : 'vertical')

  const bars = buildBars(meter, effectiveTopN)

  const handleBarClick = (b: Bar) => {
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
      className={`relative rounded-2xl border overflow-hidden ${isLarge ? 'p-5 sm:p-6' : 'px-3 sm:px-4 pt-2.5 pb-3 sm:pb-4'} h-full flex flex-col`}
      style={{
        background: 'linear-gradient(135deg, var(--card-bg), transparent 80%)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        {!hideHeader && (
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
        )}
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
            className="text-[12px] font-bold uppercase tracking-wider transition hover:opacity-80"
            style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-muted)' }}
          >
            ✕ Atstatyti
          </button>
        )}
      </div>

      {effectiveOrientation === 'horizontal'
        ? <LedHorizontal bars={bars} selectedGenre={selectedGenre} onBarClick={handleBarClick} />
        : <LedVertical bars={bars} size={size} selectedGenre={selectedGenre} isLarge={isLarge} onBarClick={handleBarClick} />
      }

      <style>{`
        @keyframes eqSegSnapV115 {
          0%   { opacity: 0; transform: scaleY(0.3); filter: brightness(1); }
          55%  { opacity: 1; transform: scaleY(1.35); filter: brightness(1.7); }
          100% { opacity: 1; transform: scaleY(1); filter: brightness(1); }
        }
        @keyframes eqBarBounceV11 {
          0%   { transform: translateY(0); }
          100% { transform: translateY(-1.5px); }
        }
        @keyframes eqHorizFillV115 {
          0%   { opacity: 0; transform: scaleX(0.05); filter: brightness(1); }
          60%  { opacity: 1; transform: scaleX(1.04); filter: brightness(1.4); }
          100% { opacity: 1; transform: scaleX(1); filter: brightness(1); }
        }
      `}</style>
    </div>
  )
}

export function SideEqualizer({ meter, selectedGenre, onSelect, variant = 'side', onExpand, topN, mobileTopN, orientation, ledSelectedGenre, hideHeader }: Props) {
  if (!meter || !Array.isArray(meter) || meter.length === 0) return null

  // V11.5: visi LED-style variantai per LedEqualizer (vienodas dizainas)
  if (variant === 'hero-mini' || variant === 'led-mini') {
    return <LedEqualizer meter={meter} onExpand={onExpand} topN={topN ?? 8} mobileTopN={mobileTopN ?? 4} size="mini" orientation={orientation} hideHeader={hideHeader} />
  }
  if (variant === 'led-large') {
    return <LedEqualizer
      meter={meter}
      onExpand={onExpand}
      topN={topN ?? 8}
      mobileTopN={mobileTopN}
      size="large"
      orientation={orientation}
      selectedGenre={ledSelectedGenre ?? null}
      onSelect={onSelect}
      hideHeader={hideHeader}
    />
  }

  // Legacy gradient bars (paliktas backwards compat'ui — nebenaudojam)
  const isHero = variant === 'hero'
  const isCompact = variant === 'compact'
  const BAR_BASE = isHero ? 220 : isCompact ? 120 : 140
  const titleFs   = isHero ? '12px' : '10px'
  const titleTr   = isHero ? '0.22em' : '0.18em'
  const labelFs   = isHero ? '11px' : isCompact ? '10px' : '9px'
  const pctFs     = isHero ? '11px' : isCompact ? '9px' : '9px'
  const padding   = isHero ? 'p-5 sm:p-6' : isCompact ? 'p-3.5 sm:p-4' : 'p-4 sm:p-5'

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
      <div className="relative flex items-center justify-between mb-3">
        <div
          className="font-extrabold uppercase"
          style={{ fontFamily: "'Outfit', sans-serif", fontSize: titleFs, letterSpacing: titleTr, color: 'var(--accent-orange)' }}
        >
          Muzikinis skonis
        </div>
        {selectedGenre && onSelect && (
          <button onClick={() => onSelect(null)} className="text-[12px] font-bold uppercase tracking-wider transition hover:opacity-80"
                  style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-muted)' }}>
            ✕ Atstatyti
          </button>
        )}
      </div>
      <div className="relative flex items-end gap-[6px] sm:gap-2" style={{ height: `${BAR_BASE}px` }}>
        {bars.map((b, i) => {
          const heightPx = Math.max((b.percent / maxPct) * BAR_BASE, 6)
          const isSelected = selectedGenre === b.fullName
          const isDimmed = selectedGenre && !isSelected
          const clickable = b.percent > 0 && onSelect
          return (
            <button key={b.fullName} onClick={clickable ? () => onSelect(b.fullName) : undefined} disabled={!clickable}
                    className={`group flex-1 min-w-0 flex flex-col items-stretch transition-all duration-300 ${clickable ? 'cursor-pointer hover:-translate-y-1' : 'cursor-default'} ${isDimmed ? 'opacity-40' : 'opacity-100'}`}
                    style={{ alignSelf: 'flex-end' }} title={`${b.short} — ${b.percent.toFixed(0)}%`}>
              <div className="relative overflow-hidden rounded-t-md" style={{
                height: `${heightPx}px`,
                background: `linear-gradient(to top, rgba(${b.rgb}, 0.30), rgba(${b.rgb}, 0.95) 80%, ${b.hex})`,
                boxShadow: isSelected ? `0 0 32px rgba(${b.rgb}, 0.75), inset 0 1px 0 rgba(255,255,255,0.5)` : `0 0 14px rgba(${b.rgb}, 0.35), inset 0 1px 0 rgba(255,255,255,0.25)`,
                transform: 'scaleY(0.05)', transformOrigin: 'bottom', opacity: 0.6,
                animation: `barRiseV8 800ms cubic-bezier(0.22, 1, 0.36, 1) ${100 + i * 65}ms forwards`,
              }} />
            </button>
          )
        })}
      </div>
      <div className="flex gap-[6px] sm:gap-2 mt-2.5">
        {bars.map((b) => (
          <div key={b.fullName} className="flex-1 min-w-0 text-center">
            <div className="font-bold truncate leading-tight" style={{ fontFamily: "'Outfit', sans-serif", fontSize: labelFs, color: 'var(--text-secondary)' }} title={b.short}>
              {b.short.replace(', ', '/')}
            </div>
            <div className="font-mono" style={{ fontSize: pctFs, color: 'var(--text-faint)' }}>
              {b.percent.toFixed(0)}%
            </div>
          </div>
        ))}
      </div>
      <style>{`@keyframes barRiseV8 { 0% { transform: scaleY(0.05); opacity: 0.5; } 60% { transform: scaleY(1.06); opacity: 1; } 100% { transform: scaleY(1); opacity: 1; } }`}</style>
    </div>
  )
}

export { SHORT_TO_FULL, FULL_TO_SHORT }
