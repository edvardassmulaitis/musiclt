'use client'
// components/blog/PostTypeSelector.tsx
//
// Chips strip blog editor'iaus viršuje. Kiekvienas tipas turi ikonėlę,
// pavadinimą ir trumpą pavyzdį hint'e. Dizainas — paprasta horizontal scroll
// ant mobile, flex-wrap ant desktop.

import type { CSSProperties } from 'react'
import { POST_TYPE_OPTIONS, type BlogPostType } from './post-types'

export { POST_TYPE_OPTIONS }
export type { BlogPostType }

export function PostTypeSelector({
  value, onChange,
}: {
  value: BlogPostType
  onChange: (t: BlogPostType) => void
}) {
  return (
    <div className="mb-6">
      <label className="text-[10px] font-bold uppercase tracking-wider mb-2 block" style={{ color: '#5e7290', fontFamily: "'Outfit', sans-serif" }}>
        Įrašo tipas
      </label>
      <div className="flex gap-1.5 flex-wrap">
        {POST_TYPE_OPTIONS.map(opt => {
          const active = opt.type === value
          const style: CSSProperties = active
            ? {
                background: opt.accent,
                color: '#fff',
                border: '1px solid transparent',
              }
            : {
                background: 'rgba(255,255,255,0.03)',
                color: '#8aa8cc',
                border: '1px solid rgba(255,255,255,0.06)',
              }
          return (
            <button
              key={opt.type}
              type="button"
              onClick={() => onChange(opt.type)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all hover:scale-[1.02]"
              style={{ ...style, fontFamily: "'Outfit', sans-serif" }}
              title={opt.hint}
            >
              <span>{opt.icon}</span>
              <span>{opt.label}</span>
            </button>
          )
        })}
      </div>
      <p className="text-[10px] mt-2" style={{ color: '#334058' }}>
        {POST_TYPE_OPTIONS.find(o => o.type === value)?.hint}
      </p>
    </div>
  )
}
