// components/galerija/PhotographerCard.tsx
//
// Fotografo kortelė — /galerija direktorijos juostai. Server-safe.

import Link from 'next/link'
import type { Photographer } from '@/lib/galerija-shared'
import { ltCount } from '@/lib/galerija-shared'

export function PhotographerCard({ p }: { p: Photographer }) {
  return (
    <Link
      href={p.href}
      className="group flex items-center gap-3 rounded-2xl border border-[var(--border-default)] bg-[var(--card-bg)] p-3 no-underline transition-colors hover:border-[#ec4899]/50"
    >
      {p.avatarUrl ? (
        <img
          src={p.avatarUrl}
          alt={p.name}
          loading="lazy"
          className="h-12 w-12 flex-none rounded-full object-cover"
        />
      ) : (
        <div className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-gradient-to-br from-[#ec4899] to-[#8b5cf6] font-['Outfit',sans-serif] text-[18px] font-black text-white">
          {p.name?.charAt(0)?.toUpperCase() || '?'}
        </div>
      )}
      <div className="min-w-0">
        <div className="truncate font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--text-primary)]">
          {p.name}
        </div>
        <div className="truncate text-[14px] text-[var(--text-muted)]">
          Fotografas
          {p.reportageCount > 0 ? ` · ${ltCount(p.reportageCount, ['reportažas', 'reportažai', 'reportažų'])}` : ''}
        </div>
      </div>
    </Link>
  )
}
