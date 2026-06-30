'use client'

// components/galerija/ReportagePlayer.tsx
//
// Kompaktiškas grotuvas (be „Pasiklausyk" header'io) — kaip naujienų/įrašų
// player'is: video zona (pirmos dainos thumbnail+play, paspaudus embed) +
// trumpas dainų sąrašas (capped, scroll). Desktop'e — antraštės dešinėj.
// Mobile'e — viršuje tik play mygtukas, paspaudus išsiskleidžia.

import { useState } from 'react'
import Link from 'next/link'

export type PlaylistItem = {
  id: number; title: string; artistName: string; artistSlug: string | null
  videoId: string; thumb: string; href: string; isMain: boolean
}

export default function ReportagePlayer({ items }: { items: PlaylistItem[] }) {
  const [activeId, setActiveId] = useState<number>(items[0]?.id ?? 0)
  const [playing, setPlaying] = useState(false)
  const [openMobile, setOpenMobile] = useState(false)
  if (!items.length) return null
  const active = items.find((t) => t.id === activeId) || items[0]
  const play = (t: PlaylistItem) => { setActiveId(t.id); setPlaying(true); setOpenMobile(true) }

  const full = (
    <div className="overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--card-bg)]">
      {/* Video zona — visada rezervuota (stable) */}
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
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              </span>
            </span>
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-6 text-left">
              <span className="block truncate text-[13px] font-bold text-white">{active.title}</span>
              <span className="block truncate text-[11px] text-white/80">{active.artistName}</span>
            </span>
          </button>
        )}
      </div>
      {/* Dainų sąrašas — capped ~3 eilutės, scroll likusiems */}
      <ul className="max-h-[150px] divide-y divide-[var(--border-default)] overflow-y-auto">
        {items.map((t) => {
          const isActive = active.id === t.id
          return (
            <li key={t.id} className={isActive ? 'bg-[color-mix(in_srgb,var(--accent-orange)_10%,transparent)]' : 'hover:bg-[var(--bg-hover)]'}>
              <div className="flex items-center gap-2.5 px-2.5 py-1.5">
                <button onClick={() => play(t)} className="relative h-9 w-[52px] flex-none overflow-hidden rounded bg-[var(--bg-elevated)]" aria-label="Groti">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t.thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">
                    {isActive && playing
                      ? <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                      : <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>}
                  </span>
                </button>
                <button onClick={() => play(t)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[12.5px] font-bold text-[var(--text-primary)]">{t.title}</span>
                  <span className="block truncate text-[10.5px] text-[var(--text-muted)]">{t.artistName}</span>
                </button>
                <Link href={t.href} className="flex-none px-1 text-[var(--text-muted)] hover:text-[var(--accent-orange)]" title="Dainos puslapis" aria-label="Dainos puslapis">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M7 7h10v10" /></svg>
                </Link>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )

  return (
    <>
      {/* MOBILE: tik play mygtukas, paspaudus išsiskleidžia (lg paslepta) */}
      {!openMobile && (
        <button
          onClick={() => play(active)}
          className="flex w-full items-center gap-3 rounded-2xl border border-[var(--border-default)] bg-[var(--card-bg)] p-2.5 text-left lg:hidden"
        >
          <span className="relative h-12 w-12 flex-none overflow-hidden rounded-lg bg-[var(--bg-elevated)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={active.thumb} alt="" className="h-full w-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center bg-black/30">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent-orange)] text-white">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              </span>
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-extrabold text-[var(--text-primary)]">Pasiklausyk koncerto atlikėjų</span>
            <span className="block truncate text-[11.5px] text-[var(--text-muted)]">{active.artistName} ir kt. · {items.length} dainos</span>
          </span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-orange)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="flex-none"><path d="m9 18 6-6-6-6" /></svg>
        </button>
      )}

      {/* Pilnas grotuvas: mobile — kai atidaryta; desktop — visada */}
      <div className={`${openMobile ? 'block' : 'hidden'} lg:block`}>{full}</div>
    </>
  )
}
