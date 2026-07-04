'use client'

// components/profile/ListeningIdentity.tsx
//
// Poster-style hero block immediately under the main hero. Visualizes the
// user's musical identity as a magazine-style layout:
//
//   left:  three top styles set in MASSIVE Outfit-black type, stacked
//          vertically, each in a different brand color. This is the
//          "shareable" centerpiece — looks like a Spotify Wrapped card.
//   right: animated equalizer bars showing music_meter proportions
//          across the 8 broad style buckets.
//
// Both blend together with a subtle gradient + noise overlay. The whole
// section is one wide horizontal band so it visually anchors the page.

import { useEffect, useState } from 'react'

type Style = { legacy_style_id: number; style_slug: string; style_name: string; sort_order: number }
type MeterEntry = { slug: string; name: string; legacy_id: number; percent?: number; width_px?: number }

type Props = {
  favoriteStyles: Style[]
  musicMeter: MeterEntry[] | null
  username: string
}

const STYLE_COLORS = [
  { from: '#f97316', to: '#dc2626' }, // orange → red
  { from: '#a78bfa', to: '#7c3aed' }, // violet → purple
  { from: '#34d399', to: '#059669' }, // emerald
  { from: '#60a5fa', to: '#2563eb' }, // blue
  { from: '#f472b6', to: '#db2777' }, // pink
]

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

export function ListeningIdentity({ favoriteStyles, musicMeter, username }: Props) {
  const top3 = (favoriteStyles || []).slice(0, 3)
  const hasMeter = musicMeter && Array.isArray(musicMeter) && musicMeter.length > 0

  // Animation kick on mount
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // Sort meter by percent desc
  const sortedMeter = hasMeter
    ? [...musicMeter!].sort((a, b) => (b.percent || b.width_px || 0) - (a.percent || a.width_px || 0))
    : []
  const maxPercent = sortedMeter.length ? Math.max(...sortedMeter.map((s) => s.percent || 0)) : 0

  return (
    <section className="relative my-12 sm:my-20">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8">
        <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-[#111822] via-[#0a1018] to-[#080c12] border border-white/[.06]">
          {/* Top eyebrow */}
          <div className="absolute top-5 sm:top-8 left-5 sm:left-10 right-5 sm:right-10 flex items-center justify-between">
            <div className="text-[12px] sm:text-[13px] font-extrabold uppercase tracking-[0.22em] text-[#f97316]" style={{ fontFamily: "'Outfit', sans-serif" }}>
              Klausymo identitetas
            </div>
            <div className="text-[12px] text-[#5e7290] uppercase tracking-wider font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>
              {username}
            </div>
          </div>

          {/* Decorative noise / grain — simulated with radial gradients */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-30 pointer-events-none"
            style={{
              background: `
                radial-gradient(ellipse 80% 50% at 0% 50%, rgba(249,115,22,0.08), transparent 50%),
                radial-gradient(ellipse 60% 60% at 100% 100%, rgba(167,139,250,0.07), transparent 50%),
                radial-gradient(ellipse 40% 40% at 50% 0%, rgba(52,211,153,0.05), transparent 50%)
              `,
            }}
          />

          <div className="relative grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-8 lg:gap-12 p-6 sm:p-10 lg:p-14 pt-16 sm:pt-20 lg:pt-24">

            {/* LEFT — TOP 3 styles MASSIVE typography */}
            <div className="flex flex-col justify-center">
              {top3.length > 0 ? (
                <>
                  <div className="text-[13px] font-extrabold uppercase tracking-widest text-[#5e7290] mb-4" style={{ fontFamily: "'Outfit', sans-serif" }}>
                    Pagrindiniai stiliai
                  </div>
                  <div className="space-y-1 sm:space-y-2">
                    {top3.map((s, i) => {
                      const c = STYLE_COLORS[i % STYLE_COLORS.length]
                      return (
                        <h2
                          key={s.legacy_style_id}
                          className={`font-black leading-[0.85] tracking-[-0.04em] transition-all duration-700 ${
                            mounted ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'
                          }`}
                          style={{
                            fontFamily: "'Outfit', sans-serif",
                            fontSize: 'clamp(2.5rem, 7vw, 5.5rem)',
                            background: `linear-gradient(135deg, ${c.from}, ${c.to})`,
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                            transitionDelay: `${i * 100}ms`,
                          }}
                        >
                          {s.style_name.toLowerCase()}
                        </h2>
                      )
                    })}
                  </div>

                  {/* Additional styles as muted line below */}
                  {favoriteStyles.length > 3 && (
                    <div className="mt-6 flex flex-wrap gap-1.5">
                      {favoriteStyles.slice(3, 12).map((s) => (
                        <span key={s.legacy_style_id} className="text-[12px] sm:text-xs text-[#5e7290] font-semibold" style={{ fontFamily: "'Outfit', sans-serif" }}>
                          {s.style_name}{' '}<span className="text-[#334058]">·</span>
                        </span>
                      ))}
                      {favoriteStyles.length > 12 && (
                        <span className="text-[12px] text-[#334058] font-bold">+{favoriteStyles.length - 12} dar</span>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-[#5e7290] italic">Stiliai nenurodyti</div>
              )}
            </div>

            {/* RIGHT — equalizer */}
            {hasMeter && (
              <div className="flex flex-col justify-end">
                <div className="text-[13px] font-extrabold uppercase tracking-widest text-[#5e7290] mb-3 lg:text-right" style={{ fontFamily: "'Outfit', sans-serif" }}>
                  Klausymo pasiskirstymas
                </div>
                <div className="flex items-end justify-between gap-1 h-[180px] sm:h-[220px]">
                  {sortedMeter.map((s, i) => {
                    const pct = s.percent ?? 0
                    const heightRel = maxPercent > 0 ? (pct / maxPercent) * 100 : 0
                    const colors = METER_PALETTE[s.name] || { from: '#5e7290', to: '#334058' }
                    return (
                      <div key={s.legacy_id} className="flex flex-col items-center flex-1 min-w-0 group">
                        <div className="w-full flex flex-col justify-end h-full relative">
                          <div
                            className="w-full rounded-t-md relative overflow-hidden transition-all"
                            style={{
                              height: mounted ? `${Math.max(heightRel, 2)}%` : '2%',
                              background: `linear-gradient(to top, ${colors.from}, ${colors.to})`,
                              boxShadow: `0 0 28px ${colors.from}40, inset 0 1px 0 rgba(255,255,255,0.3)`,
                              transitionDuration: '900ms',
                              transitionDelay: `${i * 60}ms`,
                              transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                            }}
                          >
                            {/* Segmented effect — horizontal lines */}
                            <div className="absolute inset-0 flex flex-col-reverse">
                              {Array.from({ length: Math.min(Math.floor(heightRel / 6), 20) }).map((_, j) => (
                                <div key={j} className="h-[6px] border-b border-black/30" />
                              ))}
                            </div>
                          </div>
                        </div>
                        {/* Label */}
                        <div className="w-full text-center mt-2">
                          <div className="text-[11px] sm:text-[12px] font-bold text-[#dde8f8] truncate" style={{ fontFamily: "'Outfit', sans-serif" }}>
                            {s.name}
                          </div>
                          <div className="text-[11px] text-[#5e7290] font-mono">{(s.percent || 0).toFixed(0)}%</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
