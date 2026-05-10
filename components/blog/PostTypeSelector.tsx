'use client'
// components/blog/PostTypeSelector.tsx
//
// Paprastas chip strip su single-accent (orange) active state. Jokio
// rainbow per tipą — paliekam vizualiai tylų.

import { POST_TYPE_OPTIONS, type BlogPostType } from './post-types'

export { POST_TYPE_OPTIONS }
export type { BlogPostType }

export function PostTypeSelector({
  value, onChange,
}: {
  value: BlogPostType
  onChange: (t: BlogPostType) => void
}) {
  const active = POST_TYPE_OPTIONS.find(o => o.type === value)
  return (
    <div className="mb-6">
      <div className="flex gap-1 flex-wrap">
        {POST_TYPE_OPTIONS.map(opt => {
          const isActive = opt.type === value
          return (
            <button
              key={opt.type}
              type="button"
              onClick={() => onChange(opt.type)}
              className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                isActive ? 'bg-[#f97316] text-white' : 'text-[#8aa8cc] bg-white/[.04] hover:bg-white/[.06]'
              }`}
              style={{ fontFamily: "'Outfit', sans-serif" }}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
      {active && (
        <p className="text-[10px] mt-2" style={{ color: '#334058' }}>{active.hint}</p>
      )}
    </div>
  )
}
