'use client'

// components/galerija/ReportagePlayer.tsx
//
// Šoninis grotuvas galerijos detalėje: pagrindinio atlikėjo top dainos + po
// vieną iš papildomų. Paspaudus — groja YouTube embed viršuje.

import { useState } from 'react'
import Link from 'next/link'

export type PlaylistItem = {
  id: number; title: string; artistName: string; artistSlug: string | null
  videoId: string; thumb: string; href: string; isMain: boolean
}

export default function ReportagePlayer({ items }: { items: PlaylistItem[] }) {
  const [active, setActive] = useState<PlaylistItem | null>(null)
  if (!items.length) return null

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--card-bg)]">
      <div className="flex items-center gap-2 border-b border-[var(--border-default)] px-3.5 py-2.5">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ec4899" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        <span className="font-['Outfit',sans-serif] text-[13px] font-extrabold text-[var(--text-primary)]">Pasiklausyk</span>
      </div>

      {active && (
        <div className="aspect-video w-full bg-black">
          <iframe
            key={active.videoId}
            src={`https://www.youtube.com/embed/${active.videoId}?autoplay=1&rel=0`}
            title={active.title}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}

      <ul className="max-h-[420px] divide-y divide-[var(--border-default)] overflow-y-auto">
        {items.map((t) => {
          const isPlaying = active?.id === t.id
          return (
            <li key={t.id}>
              <div className={`flex items-center gap-2.5 px-2.5 py-2 ${isPlaying ? 'bg-[#ec4899]/8' : 'hover:bg-[var(--bg-hover)]'}`}>
                <button onClick={() => setActive(t)} className="relative h-10 w-[60px] flex-none overflow-hidden rounded-md bg-[var(--bg-elevated)]" aria-label="Groti">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t.thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">
                    {isPlaying
                      ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
                      : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>}
                  </span>
                </button>
                <button onClick={() => setActive(t)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[13px] font-bold text-[var(--text-primary)]">{t.title}</span>
                  <span className="block truncate text-[11px] text-[var(--text-muted)]">
                    {t.artistName}{!t.isMain && <span className="ml-1 text-[#ec4899]">·</span>}
                  </span>
                </button>
                <Link href={t.href} className="flex-none px-1 text-[var(--text-muted)] hover:text-[#ec4899]" title="Dainos puslapis" aria-label="Dainos puslapis">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M7 7h10v10"/></svg>
                </Link>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
