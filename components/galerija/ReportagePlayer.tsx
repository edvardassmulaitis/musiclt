'use client'

// components/galerija/ReportagePlayer.tsx
//
// Šoninis grotuvas: pagrindinio atlikėjo top dainos + po vieną iš papildomų.
// Video zona VISADA matoma (pirmos dainos thumbnail iškart) — kad nebūtų
// layout shift'o paspaudus (kaip atlikėjo psl.). Paspaudus — groja embed.

import { useState } from 'react'
import Link from 'next/link'

export type PlaylistItem = {
  id: number; title: string; artistName: string; artistSlug: string | null
  videoId: string; thumb: string; href: string; isMain: boolean
}

export default function ReportagePlayer({ items }: { items: PlaylistItem[] }) {
  const [activeId, setActiveId] = useState<number>(items[0]?.id ?? 0)
  const [playing, setPlaying] = useState(false)
  if (!items.length) return null
  const active = items.find((t) => t.id === activeId) || items[0]
  const play = (t: PlaylistItem) => { setActiveId(t.id); setPlaying(true) }

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--card-bg)]">
      <div className="flex items-center gap-2 border-b border-[var(--border-default)] px-3.5 py-2.5">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-orange)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        <span className="font-['Outfit',sans-serif] text-[13px] font-extrabold text-[var(--text-primary)]">Pasiklausyk</span>
      </div>

      {/* Video zona — visada rezervuota (stable height) */}
      <div className="relative aspect-video w-full bg-black">
        {playing ? (
          <iframe
            key={active.videoId}
            src={`https://www.youtube-nocookie.com/embed/${active.videoId}?autoplay=1&rel=0`}
            title={active.title}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <button onClick={() => play(active)} className="group absolute inset-0 h-full w-full" aria-label={`Groti ${active.title}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`https://img.youtube.com/vi/${active.videoId}/hqdefault.jpg`} alt="" className="h-full w-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center bg-black/25 transition-colors group-hover:bg-black/15">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-orange)] text-white shadow-lg transition-transform group-hover:scale-105">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              </span>
            </span>
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-6 text-left">
              <span className="block truncate text-[13px] font-bold text-white">{active.title}</span>
              <span className="block truncate text-[11px] text-white/80">{active.artistName}</span>
            </span>
          </button>
        )}
      </div>

      <ul className="max-h-[360px] divide-y divide-[var(--border-default)] overflow-y-auto">
        {items.map((t) => {
          const isActive = active.id === t.id
          return (
            <li key={t.id} className={isActive ? 'bg-[color-mix(in_srgb,var(--accent-orange)_10%,transparent)]' : 'hover:bg-[var(--bg-hover)]'}>
              <div className="flex items-center gap-2.5 px-2.5 py-2">
                <button onClick={() => play(t)} className="relative h-10 w-[60px] flex-none overflow-hidden rounded-md bg-[var(--bg-elevated)]" aria-label="Groti">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t.thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">
                    {isActive && playing
                      ? <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
                      : <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>}
                  </span>
                </button>
                <button onClick={() => play(t)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[13px] font-bold text-[var(--text-primary)]">{t.title}</span>
                  <span className="block truncate text-[11px] text-[var(--text-muted)]">{t.artistName}</span>
                </button>
                <Link href={t.href} className="flex-none px-1 text-[var(--text-muted)] hover:text-[var(--accent-orange)]" title="Dainos puslapis" aria-label="Dainos puslapis">
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
