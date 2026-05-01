// components/blog/PostTypeBadge.tsx — server-safe (jokio 'use client')
import { POST_TYPE_OPTIONS, type BlogPostType } from './post-types'

export function PostTypeBadge({ type }: { type: BlogPostType }) {
  const meta = POST_TYPE_OPTIONS.find(o => o.type === type)
  if (!meta) return null
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
      style={{ background: `${meta.accent}22`, color: meta.accent }}
    >
      {meta.icon} {meta.label}
    </span>
  )
}
