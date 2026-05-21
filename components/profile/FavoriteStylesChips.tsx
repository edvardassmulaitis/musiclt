'use client'

// components/profile/FavoriteStylesChips.tsx
//
// Mėgstamiausi stiliai kaip chip cloud su populiarumo flavored sizes —
// dažniausiai pasirinkti (sort_order arčiau 1) gauna didesnį font + bold,
// vėliau įdėti mažėja. Bet ne huge — kompaktiška dashboard'o estetika.

import { useState } from 'react'

type Style = { legacy_style_id: number; style_slug: string; style_name: string; sort_order: number }

export function FavoriteStylesChips({ styles }: { styles: Style[] }) {
  const [expandedId, setExpandedId] = useState<number | null>(null)
  if (!styles || styles.length === 0) return null

  // Size tiers: 0-2 = LG, 3-5 = MD, 6+ = SM
  const sizeFor = (i: number): { font: string; padX: string; padY: string; weight: string; opacity: number } => {
    if (i < 3) return { font: '15px', padX: '14px', padY: '8px', weight: '800', opacity: 1.0 }
    if (i < 6) return { font: '13px', padX: '11px', padY: '6px', weight: '700', opacity: 0.92 }
    if (i < 10) return { font: '12px', padX: '10px', padY: '5px', weight: '600', opacity: 0.78 }
    return { font: '11px', padX: '9px', padY: '4px', weight: '500', opacity: 0.62 }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
      {styles.map((s, i) => {
        const size = sizeFor(i)
        const active = expandedId === s.legacy_style_id
        return (
          <button
            key={s.legacy_style_id}
            onClick={() => setExpandedId(active ? null : s.legacy_style_id)}
            className={`rounded-full border transition ${
              active
                ? 'bg-[#f97316] text-black border-[#f97316] shadow-[0_4px_16px_rgba(249,115,22,0.4)]'
                : 'bg-white/[.04] text-[#dde8f8] border-white/[.08] hover:bg-white/[.08] hover:text-white'
            }`}
            style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: size.font,
              fontWeight: size.weight as any,
              padding: `${size.padY} ${size.padX}`,
              opacity: active ? 1 : size.opacity,
            }}
          >
            {s.style_name}
          </button>
        )
      })}
    </div>
  )
}
