// components/blog/PostTypeBadge.tsx — server-safe (jokio 'use client')
//
// Subtle subscription badge. Single muted style su pavadinimu, jokios
// emoji ir per-tipas spalvos.

import { POST_TYPE_OPTIONS, type BlogPostType } from './post-types'

export function PostTypeBadge({ type }: { type: BlogPostType }) {
  const meta = POST_TYPE_OPTIONS.find(o => o.type === type)
  if (!meta) return null
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
      style={{ background: 'rgba(255,255,255,0.04)', color: '#8aa8cc', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      {meta.label}
    </span>
  )
}
