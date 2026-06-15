'use client'

// components/profile/MoodPlaylistModal.tsx
// Nuotaikos dainų grotuvas — top 20 sąrašas + YouTube embed pasirinktai dainai.
// Atidaromas paspaudus „Nuotaikos dainos" kortelę profilyje.

import { useEffect, useState } from 'react'
import Link from 'next/link'

export type MoodSongItem = {
  id: number
  slug: string
  title: string
  cover_url: string | null
  video_url: string | null
  artist: { slug: string; name: string; cover_image_url?: string | null } | null
}

function ytId(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}
function coverOf(s: MoodSongItem): string | null {
  const yid = ytId(s.video_url)
  return (yid ? `https://img.youtube.com/vi/${yid}/mqdefault.jpg` : null) || s.cover_url || s.artist?.cover_image_url || null
}

export function MoodPlaylistModal({ songs, onClose }: { songs: MoodSongItem[]; onClose: () => void }) {
  const playable = songs.filter((s) => ytId(s.video_url))
  const firstPlayable = playable[0] || songs[0] || null
  const [current, setCurrent] = useState<MoodSongItem | null>(firstPlayable)

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [onClose])

  const curId = current ? ytId(current.video_url) : null
  const curArtist = current?.artist

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-6" style={{ background: 'rgba(2,6,12,0.82)', backdropFilter: 'blur(6px)' }} onClick={onClose}>
      <div className="w-full max-w-[920px] max-h-[92vh] overflow-hidden rounded-2xl flex flex-col"
           style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center gap-2">
            <span style={{ color: 'var(--accent-orange)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M17 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            <h2 className="text-[15px] font-black" style={{ fontFamily: "'Outfit', sans-serif" }}>Nuotaikos dainos <span className="font-bold text-[12px]" style={{ color: 'var(--text-faint)' }}>{songs.length}</span></h2>
          </div>
          <button onClick={onClose} aria-label="Uždaryti" className="h-8 w-8 inline-flex items-center justify-center rounded-lg" style={{ color: 'var(--text-muted)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 5l14 14M19 5L5 19" /></svg>
          </button>
        </div>

        <div className="grid md:grid-cols-[1.3fr_1fr] gap-0 overflow-hidden flex-1 min-h-0">
          {/* Grotuvas */}
          <div className="p-4 sm:p-5 flex flex-col min-h-0">
            <div className="relative w-full rounded-xl overflow-hidden" style={{ aspectRatio: '16 / 9', background: '#000' }}>
              {curId ? (
                <iframe key={curId} className="absolute inset-0 w-full h-full" src={`https://www.youtube-nocookie.com/embed/${curId}?autoplay=1&rel=0`}
                        title={current?.title || ''} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-center px-4 text-[12.5px]" style={{ color: 'rgba(255,255,255,0.6)' }}>Šiai dainai nėra grojamo įrašo.</div>
              )}
            </div>
            {current && (
              <div className="mt-3">
                <div className="font-extrabold text-[16px] leading-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>{current.title}</div>
                {curArtist && <Link href={`/atlikejai/${curArtist.slug}`} className="text-[13px] font-semibold hover:underline" style={{ color: 'var(--text-secondary)' }}>{curArtist.name}</Link>}
              </div>
            )}
          </div>

          {/* Sąrašas */}
          <div className="overflow-y-auto border-t md:border-t-0 md:border-l p-2.5" style={{ borderColor: 'var(--border-subtle)' }}>
            <ul className="flex flex-col gap-1">
              {songs.map((s, i) => {
                const active = current?.id === s.id
                const cov = coverOf(s)
                const hasVid = !!ytId(s.video_url)
                return (
                  <li key={s.id}>
                    <button onClick={() => hasVid && setCurrent(s)} disabled={!hasVid}
                            className="w-full group flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition"
                            style={{ background: active ? 'rgba(249,115,22,0.12)' : 'transparent', opacity: hasVid ? 1 : 0.5, cursor: hasVid ? 'pointer' : 'default' }}>
                      <span className="w-5 shrink-0 text-center text-[11px] font-black tabular-nums" style={{ color: active ? 'var(--accent-orange)' : 'var(--text-faint)' }}>{i + 1}</span>
                      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md flex items-center justify-center" style={{ background: 'var(--bg-elevated)' }}>
                        {cov ? (/* eslint-disable-next-line @next/next/no-img-element */<img src={cov} alt="" className="h-full w-full object-cover" />) : <span style={{ color: 'var(--text-faint)' }}>♬</span>}
                      </div>
                      <div className="min-w-0 flex-1"><div className="truncate text-[12.5px] font-bold">{s.title}</div><div className="truncate text-[10.5px]" style={{ color: 'var(--text-muted)' }}>{s.artist?.name || 'Daina'}</div></div>
                      {active && hasVid && (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--accent-orange)' }} aria-hidden><polygon points="6 4 20 12 6 20 6 4" /></svg>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
