'use client'

// components/profile/SideEqualizer.tsx
//
// Kompaktiškas equalizer šone — kaip player slot atlikėjo hero'je.
// Fixed canonical order, fiksuotos spalvos iš lib/genre-colors.ts (Sunkioji=
// dark, Rokas=red, etc), nedidelis container'is.

import { GENRE_COLOR_BY_NAME } from '@/lib/genre-colors'

type MeterEntry = { slug: string; name: string; legacy_id: number; percent?: number; width_px?: number }

// Fiksuotas canonical eiliškumas — kaip music.lt nav (Rokas pirma, Sunkioji
// antra, etc). NE pagal populiarumą — visada šis order'is. 'name' atitinka
// music_meter JSONB short names.
const CANONICAL_ORDER = [
  { short: 'Rokas',       full: 'Roko muzika' },
  { short: 'Sunkioji',    full: 'Sunkioji muzika' },
  { short: 'Alternatyva', full: 'Alternatyvioji muzika' },
  { short: 'Pop, R&B',    full: 'Pop, R&B muzika' },
  { short: 'Pop-RB',      full: 'Pop, R&B muzika' },     // alt key
  { short: 'Rimtoji',     full: 'Rimtoji muzika' },
  { short: 'Elektronika', full: 'Elektroninė, šokių muzika' },
  { short: 'Hip-hop',     full: "Hip-hop'o muzika" },
  { short: 'Kita',        full: 'Kitų stilių muzika' },
]

export function SideEqualizer({ meter }: { meter: MeterEntry[] | null }) {
  if (!meter || !Array.isArray(meter) || meter.length === 0) return null

  // Map data į canonical order, paimam % iš data, spalva iš GENRE_COLOR_BY_NAME
  const byName = new Map<string, MeterEntry>()
  for (const m of meter) byName.set(m.name, m)

  const bars = CANONICAL_ORDER
    .filter((c, i, arr) => arr.findIndex((x) => x.full === c.full) === i)   // dedup Pop alt
    .map((c) => {
      const entry = byName.get(c.short) || (c.short === 'Pop, R&B' ? byName.get('Pop-RB') : null)
      const percent = entry?.percent ?? 0
      const color = GENRE_COLOR_BY_NAME[c.full]
      return {
        short: c.short === 'Pop-RB' ? 'Pop, R&B' : c.short,
        percent,
        hex: color?.hex ?? '#5e7290',
        rgb: color?.rgb ?? '94, 114, 144',
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
        <div className="text-[9px] font-bold text-[#5e7290] uppercase tracking-wider">muzikometras</div>
      </div>

      {/* Bars — fixed order, fixed colors, compact */}
      <div className="flex items-end gap-1.5" style={{ height: `${BAR_BASE}px` }}>
        {bars.map((b, i) => {
          const heightPx = Math.max((b.percent / maxPct) * BAR_BASE, 4)
          return (
            <div key={b.short} className="flex-1 min-w-0 flex flex-col items-stretch group" style={{ alignSelf: 'flex-end' }}>
              <div
                className="rounded-t relative overflow-hidden animate-[barRiseV4_700ms_cubic-bezier(0.34,1.56,0.64,1)_both]"
                style={{
                  height: `${heightPx}px`,
                  background: `linear-gradient(to top, rgba(${b.rgb}, 0.55), ${b.hex})`,
                  boxShadow: `0 0 14px rgba(${b.rgb}, 0.4), inset 0 1px 0 rgba(255,255,255,0.3)`,
                  animationDelay: `${i * 50}ms`,
                }}
                title={`${b.short} — ${b.percent.toFixed(0)}%`}
              >
                {/* Top highlight */}
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/30" />
                {/* Subtle horizontal lines */}
                <div className="absolute inset-0 flex flex-col-reverse pointer-events-none">
                  {Array.from({ length: Math.min(Math.floor(heightPx / 8), 18) }).map((_, j) => (
                    <div key={j} className="h-[8px] border-b border-black/30" />
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Compact labels — angled subtle */}
      <div className="flex gap-1.5 mt-2">
        {bars.map((b) => (
          <div key={b.short} className="flex-1 min-w-0 text-center">
            <div className="text-[9px] font-bold text-[#dde8f8] truncate leading-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>
              {b.short.replace(', ', '/')}
            </div>
            <div className="text-[9px] text-[#5e7290] font-mono">{b.percent.toFixed(0)}%</div>
          </div>
        ))}
      </div>

      <style>{`@keyframes barRiseV4 { from { transform: scaleY(0.05); transform-origin: bottom; opacity: 0.5; } to { transform: scaleY(1); transform-origin: bottom; opacity: 1; } }`}</style>
    </div>
  )
}
