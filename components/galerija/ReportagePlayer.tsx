'use client'

// components/galerija/ReportagePlayer.tsx
//
// Grotuvas — toks pat kaip naujienų/įrašų MusicPlayer (corner play btn,
// embeddable preflight → „Žiūrėti YouTube'e" fallback, numeruotas sąrašas su
// mini scroll). Desktop'e — antraštės dešinėj. Mobile'e — play mygtukas,
// paspaudus išsiskleidžia tas pats kompaktiškas grotuvas.

import { useEffect, useState } from 'react'
import Link from 'next/link'

export type PlaylistItem = {
  id: number; title: string; artistName: string; artistSlug: string | null
  videoId: string; thumb: string; href: string; isMain: boolean
}

export default function ReportagePlayer({ items }: { items: PlaylistItem[] }) {
  const [activeIdx, setActiveIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [openMobile, setOpenMobile] = useState(false)
  const [embedDisabled, setEmbedDisabled] = useState<Set<string>>(new Set())

  const cur = items[activeIdx]
  const vid = cur?.videoId || ''
  const isBlocked = !!vid && embedDisabled.has(vid)
  const hq = vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : null

  useEffect(() => {
    if (!vid || embedDisabled.has(vid)) return
    let cancelled = false
    fetch(`/api/yt/embeddable?videoId=${encodeURIComponent(vid)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d && d.embeddable === false) setEmbedDisabled((s) => { const n = new Set(s); n.add(vid); return n }) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [vid]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!items.length) return null
  const play = (i: number) => { setActiveIdx(i); setPlaying(true); setOpenMobile(true) }

  const full = (
    <div className="w-full overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[0_20px_60px_-20px_rgba(0,0,0,0.3)]">
      {/* Video zona */}
      <div className="relative aspect-video w-full overflow-hidden bg-black">
        {playing && !isBlocked ? (
          <iframe
            key={vid}
            src={`https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&rel=0`}
            allow="autoplay; encrypted-media" allowFullScreen
            className="absolute inset-0 h-full w-full border-0"
          />
        ) : isBlocked ? (
          <a href={`https://www.youtube.com/watch?v=${vid}`} target="_blank" rel="noopener noreferrer"
            className="absolute inset-0 flex items-center justify-center overflow-hidden no-underline">
            {hq && <img src={hq} alt="" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover opacity-60" />}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/45" />
            <span className="relative z-10 flex flex-col items-center gap-2 px-6 text-center text-white">
              <span className="flex h-[54px] w-[54px] items-center justify-center rounded-full bg-red-600 ring-[4px] ring-white/10">
                <svg viewBox="0 0 24 24" width="26" height="26" fill="#fff" aria-hidden><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" /></svg>
              </span>
              <span className="text-[14px] font-semibold">Žiūrėti YouTube'e</span>
            </span>
          </a>
        ) : (
          <button type="button" onClick={() => vid && play(activeIdx)} aria-label="Paleisti" className="group absolute inset-0 block cursor-pointer overflow-hidden border-0 p-0">
            {hq && <img src={hq} alt="" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" />}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-black/25" />
            <span className="absolute bottom-3 right-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-orange)] shadow-[0_8px_24px_rgba(249,115,22,0.5)] ring-[3px] ring-white/15 transition-transform duration-200 group-hover:scale-110">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="#fff" aria-hidden className="ml-0.5"><path d="M8 5v14l11-7z" /></svg>
            </span>
            <span className="absolute inset-x-0 bottom-0 px-3 pb-3 pr-16 text-left">
              <span className="block truncate text-[14px] font-bold text-white drop-shadow">{cur.title}</span>
              <span className="block truncate text-[14px] text-white/80">{cur.artistName}</span>
            </span>
          </button>
        )}
      </div>

      {/* Dainų sąrašas — mini scroll */}
      <ul className="max-h-[208px] divide-y divide-[var(--border-subtle)] overflow-y-auto bg-[var(--bg-surface)]">
        {items.map((s, i) => {
          const isActive = i === activeIdx
          return (
            <li key={s.id}>
              <div
                onClick={() => play(i)} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(i) } }}
                className={['flex w-full cursor-pointer items-center gap-2 px-2.5 py-2 transition-colors', isActive ? 'bg-[rgba(249,115,22,0.08)]' : 'hover:bg-[var(--bg-hover)]'].join(' ')}
              >
                <span className={['w-4 shrink-0 text-center font-["Outfit",sans-serif] text-[14px] font-bold tabular-nums', isActive ? 'text-[var(--accent-orange)]' : 'text-[var(--text-faint,var(--text-muted))]'].join(' ')} aria-hidden>{i + 1}</span>
                <div className="flex min-w-0 flex-1 flex-col items-start">
                  <span className={['w-full truncate font-["Outfit",sans-serif] text-[14px] font-bold leading-tight', isActive ? 'text-[var(--accent-orange)]' : 'text-[var(--text-primary)]'].join(' ')}>{s.title}</span>
                  <span className="w-full truncate text-[12px] text-[var(--text-muted)]">{s.artistName}</span>
                </div>
                <button onClick={(e) => { e.stopPropagation(); play(i) }} aria-label={`Leisti ${s.title}`}
                  className={['flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors', isActive ? 'bg-[var(--accent-orange)] text-white' : 'bg-[var(--card-bg)] text-[var(--text-primary)] hover:bg-[var(--accent-orange)] hover:text-white'].join(' ')}>
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                </button>
                <Link href={s.href} onClick={(e) => e.stopPropagation()} className="flex-none px-0.5 text-[var(--text-muted)] hover:text-[var(--accent-orange)]" title="Dainos puslapis" aria-label="Dainos puslapis">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M7 7h10v10" /></svg>
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
      {/* MOBILE: play mygtukas (lg paslepta) */}
      {!openMobile && (
        <button onClick={() => play(activeIdx)} className="flex w-full items-center gap-3 rounded-2xl border border-[var(--border-default)] bg-[var(--card-bg)] p-2.5 text-left lg:hidden">
          <span className="relative h-11 w-11 flex-none overflow-hidden rounded-lg bg-[var(--bg-elevated)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cur.thumb} alt="" className="h-full w-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center bg-black/30">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent-orange)] text-white"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg></span>
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-extrabold text-[var(--text-primary)]">Pasiklausyk atlikėjų</span>
            <span className="block truncate text-[14px] text-[var(--text-muted)]">{cur.artistName} ir kt. · {items.length} dainos</span>
          </span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-orange)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="flex-none"><path d="m9 18 6-6-6-6" /></svg>
        </button>
      )}
      <div className={`${openMobile ? 'block' : 'hidden'} lg:block`}>{full}</div>
    </>
  )
}
