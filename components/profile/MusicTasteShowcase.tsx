'use client'

// components/profile/MusicTasteShowcase.tsx
//
// Hero-style „mėgstamiausių stilių" blokas. Du dalys:
//   1) ANIMUOTAS equalizer — 8 broad style bars (Rokas, Sunkioji...) — central
//      visual focus. CSS height su native pixels (ne procentais) kad veiktų
//      stabiliai be flex-1 inheritance bug'o.
//   2) Pagrindiniai stiliai — chip'ai apatinėje juostoje, click'as expanded
//      panel su substiliais ir top dainų sąrašu (jei DB turi mapping'ą).
//
// Naudoja „mėgsta" terminologiją (ne „klauso") — žmonės like'ina, ne streamina.

import { useState } from 'react'
import Link from 'next/link'

type Style = { legacy_style_id: number; style_slug: string; style_name: string; sort_order: number }
type MeterEntry = { slug: string; name: string; legacy_id: number; percent?: number; width_px?: number }

type Props = {
  favoriteStyles: Style[]
  musicMeter: MeterEntry[] | null
  topArtists?: any[]    // per-style breakdown (future)
}

const METER_PALETTE: Record<string, { from: string; to: string }> = {
  'Rokas':        { from: '#f97316', to: '#dc2626' },
  'Sunkioji':     { from: '#dc2626', to: '#991b1b' },
  'Alternatyva':  { from: '#a78bfa', to: '#7c3aed' },
  'Pop, R&B':     { from: '#f472b6', to: '#db2777' },
  'Pop-RB':       { from: '#f472b6', to: '#db2777' },
  'Rimtoji':      { from: '#60a5fa', to: '#2563eb' },
  'Elektronika':  { from: '#34d399', to: '#059669' },
  'Hip-hop':      { from: '#fbbf24', to: '#d97706' },
  'Kita':         { from: '#94a3b8', to: '#475569' },
}

export function MusicTasteShowcase({ favoriteStyles, musicMeter }: Props) {
  const hasMeter = musicMeter && Array.isArray(musicMeter) && musicMeter.length > 0
  if (!hasMeter && (!favoriteStyles || favoriteStyles.length === 0)) return null

  // Sort meter by percent desc
  const sortedMeter = hasMeter
    ? [...(musicMeter as MeterEntry[])].sort((a, b) => (b.percent || 0) - (a.percent || 0))
    : []
  const maxPercent = sortedMeter.length ? Math.max(...sortedMeter.map((s) => s.percent || 0)) : 100

  // FIXED bar height base (native pixels, ne % — avoid flex inheritance bug)
  const BAR_BASE_PX = 240
  const MIN_BAR_PX  = 8

  const [expandedStyleId, setExpandedStyleId] = useState<number | null>(null)

  return (
    <section className="relative">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8">
        <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-[#111822] via-[#0a1018] to-[#080c12] border border-white/[.06]">

          {/* Decorative radial accents */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-40 pointer-events-none"
            style={{
              background: `
                radial-gradient(ellipse 60% 50% at 0% 0%, rgba(249,115,22,0.10), transparent 60%),
                radial-gradient(ellipse 60% 60% at 100% 100%, rgba(167,139,250,0.10), transparent 60%),
                radial-gradient(ellipse 40% 40% at 50% 50%, rgba(52,211,153,0.06), transparent 60%)
              `,
            }}
          />

          <div className="relative p-6 sm:p-10 lg:p-14">

            {/* Eyebrow + meta */}
            <div className="flex items-center justify-between mb-6 sm:mb-10">
              <div className="text-[12px] sm:text-[13px] font-extrabold uppercase tracking-[0.22em] text-[#f97316]" style={{ fontFamily: "'Outfit', sans-serif" }}>
                Muzikinis skonis
              </div>
              <div className="text-[12px] sm:text-[13px] text-[#5e7290] font-bold uppercase tracking-wider" style={{ fontFamily: "'Outfit', sans-serif" }}>
                {favoriteStyles.length} stiliai
              </div>
            </div>

            {/* EQUALIZER — main focal point, big */}
            {hasMeter && (
              <div className="mb-10 sm:mb-14">
                <div
                  className="flex items-end justify-between gap-1.5 sm:gap-3"
                  style={{ height: `${BAR_BASE_PX}px` }}
                >
                  {sortedMeter.map((s, i) => {
                    const pct = s.percent ?? 0
                    const heightPx = Math.max((pct / Math.max(maxPercent, 1)) * BAR_BASE_PX, MIN_BAR_PX)
                    const colors = METER_PALETTE[s.name] || { from: '#5e7290', to: '#334058' }
                    return (
                      <div
                        key={s.legacy_id}
                        className="flex-1 min-w-0 flex flex-col items-stretch group cursor-default"
                        style={{ alignSelf: 'flex-end' }}
                      >
                        {/* Bar — fixed PIXEL height, not percent */}
                        <div
                          className="rounded-t-md relative overflow-hidden animate-[barRise_900ms_cubic-bezier(0.34,1.56,0.64,1)_both]"
                          style={{
                            height: `${heightPx}px`,
                            background: `linear-gradient(to top, ${colors.from}, ${colors.to})`,
                            boxShadow: `0 0 32px ${colors.from}50, inset 0 1px 0 rgba(255,255,255,0.4)`,
                            animationDelay: `${i * 70}ms`,
                          }}
                        >
                          {/* Top highlight */}
                          <div className="absolute top-0 left-0 right-0 h-1 bg-white/40 rounded-t-md" />
                          {/* Segmented EQ lines */}
                          <div className="absolute inset-0 flex flex-col-reverse">
                            {Array.from({ length: Math.min(Math.floor(heightPx / 10), 24) }).map((_, j) => (
                              <div key={j} className="h-[10px] border-b border-black/25" />
                            ))}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Labels row */}
                <div className="flex justify-between gap-1.5 sm:gap-3 mt-3">
                  {sortedMeter.map((s) => (
                    <div key={s.legacy_id} className="flex-1 min-w-0 text-center">
                      <div className="text-[12px] sm:text-xs font-extrabold text-[#dde8f8] truncate" style={{ fontFamily: "'Outfit', sans-serif" }}>
                        {s.name}
                      </div>
                      <div className="text-[12px] sm:text-[13px] text-[#5e7290] font-mono mt-0.5">{(s.percent || 0).toFixed(0)}%</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pagrindiniai stiliai — expandable chips */}
            {favoriteStyles && favoriteStyles.length > 0 && (
              <div>
                <div className="text-[12px] font-extrabold uppercase tracking-wider text-[#5e7290] mb-3" style={{ fontFamily: "'Outfit', sans-serif" }}>
                  Mėgstamiausi stiliai
                </div>
                <div className="flex flex-wrap gap-2">
                  {favoriteStyles.slice(0, 14).map((s, i) => (
                    <button
                      key={s.legacy_style_id}
                      onClick={() => setExpandedStyleId(expandedStyleId === s.legacy_style_id ? null : s.legacy_style_id)}
                      className={`text-xs sm:text-sm font-bold rounded-full px-3 sm:px-4 py-1.5 sm:py-2 border transition ${
                        expandedStyleId === s.legacy_style_id
                          ? 'bg-[#f97316] text-black border-[#f97316] shadow-[0_4px_16px_rgba(249,115,22,0.4)]'
                          : i < 3
                          ? 'bg-white/[.06] text-white border-white/[.12] hover:bg-white/[.1]'
                          : 'bg-white/[.02] text-[#b0bdd4] border-white/[.06] hover:bg-white/[.05] hover:text-white'
                      }`}
                      style={{ fontFamily: "'Outfit', sans-serif" }}
                    >
                      {s.style_name}
                    </button>
                  ))}
                  {favoriteStyles.length > 14 && (
                    <span className="text-xs text-[#5e7290] self-center px-2">+{favoriteStyles.length - 14} dar</span>
                  )}
                </div>

                {/* Expand panel (jei pasirinktas stilius) */}
                {expandedStyleId !== null && (() => {
                  const s = favoriteStyles.find((x) => x.legacy_style_id === expandedStyleId)
                  if (!s) return null
                  return (
                    <div className="mt-5 p-5 rounded-2xl bg-black/30 border border-white/[.08]">
                      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
                        <h3 className="text-lg font-extrabold text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>
                          {s.style_name}
                        </h3>
                        <Link
                          href={`/atlikejai?stilius=${s.style_slug}`}
                          className="text-xs font-bold text-[#f97316] hover:underline"
                          style={{ fontFamily: "'Outfit', sans-serif" }}
                        >
                          Visi „{s.style_name}" atlikėjai →
                        </Link>
                      </div>
                      <p className="text-sm text-[#5e7290] leading-relaxed" style={{ fontFamily: "'Outfit', sans-serif" }}>
                        Šio stiliaus mėgstamų atlikėjų ir dainų sąrašas atsiras, kai bus suvestas šio nario stiliaus žymėjimas. <span className="text-[#334058]">(palaukia mapping'o)</span>
                      </p>
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes barRise {
          from { transform: scaleY(0.05); transform-origin: bottom; opacity: 0.4; }
          to { transform: scaleY(1); transform-origin: bottom; opacity: 1; }
        }
      `}</style>
    </section>
  )
}
