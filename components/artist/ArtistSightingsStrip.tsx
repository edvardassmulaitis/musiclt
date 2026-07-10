'use client'
// components/artist/ArtistSightingsStrip.tsx
// ────────────────────────────────────────────────────────────────────────────
// Atlikėjo puslapio sekcija „Koncertų akimirkos" — narių įkeltos nuotraukos/
// video (Matyti gyvai) tam atlikėjui. Savarankiškas: pats fetch'ina. Tuščias —
// nesirodo.
// ────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { proxyImg } from '@/lib/img-proxy'
import SeenLiveMediaViewer from '@/components/seen-live/SeenLiveMediaViewer'
import type { SeenLiveRecent } from '@/lib/seen-live'

export default function ArtistSightingsStrip({ artistId }: { artistId: number }) {
  const [items, setItems] = useState<SeenLiveRecent[]>([])
  const [viewer, setViewer] = useState<SeenLiveRecent | null>(null)

  useEffect(() => {
    let dead = false
    fetch(`/api/artists/${artistId}/sightings`)
      .then((r) => r.json())
      .then((d) => { if (!dead) setItems(Array.isArray(d.items) ? d.items : []) })
      .catch(() => {})
    return () => { dead = true }
  }, [artistId])

  if (items.length === 0) return null

  return (
    <section className="mx-auto mt-8 w-full max-w-3xl px-4">
      <h3 className="mb-3 font-['Outfit',sans-serif] text-base font-bold text-[var(--text-primary)]">Koncertų akimirkos</h3>
      <p className="mb-3 text-[13px] text-[var(--text-muted)]">Narių nuotraukos ir video iš šio atlikėjo koncertų.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((it) => {
          const media = it.media[0]
          const isVideo = media?.type === 'video'
          const thumb = media?.type === 'image' ? media.url : (it.media.find((m) => m.type === 'image')?.url || it.media.find((m) => m.poster)?.poster || null)
          const y = it.seen_year || (it.event?.start_date ? Number(String(it.event.start_date).slice(0, 4)) : null)
          return (
            <button key={it.id} onClick={() => setViewer(it)} className="group block text-left">
              <div className="relative overflow-hidden rounded-xl bg-[var(--bg-elevated)]" style={{ aspectRatio: '16/9' }}>
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={proxyImg(thumb)} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center" style={{ background: 'linear-gradient(160deg,#2a2f3a,#171a22)' }}>
                    <svg viewBox="0 0 24 24" width={20} height={20} fill="#fff"><polygon points="6 4 20 12 6 20 6 4" /></svg>
                  </div>
                )}
                {isVideo && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white"><svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor"><polygon points="6 4 20 12 6 20 6 4" /></svg></span>
                  </div>
                )}
                {it.media.length > 1 && <span className="absolute right-1.5 top-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[11px] font-bold text-white">{it.media.length}</span>}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-2 pt-6">
                  <div className="truncate text-[12px] font-semibold text-white/85">{[it.user?.username ? `@${it.user.username}` : null, y ? String(y) : null].filter(Boolean).join(' · ')}</div>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {viewer && <SeenLiveMediaViewer row={viewer} onClose={() => setViewer(null)} />}
    </section>
  )
}
