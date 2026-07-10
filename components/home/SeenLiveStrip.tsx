'use client'
// components/home/SeenLiveStrip.tsx
// ────────────────────────────────────────────────────────────────────────────
// Homepage „Iš koncertų" juosta — naujausios narių nuotraukos/video iš koncertų
// (Matyti gyvai). Horizontalus Scroller su media kortelėmis; paspaudus atsidaro
// peržiūra (lightbox). Savarankiškas: pats fetch'ina /api/seen-live/recent.
// ────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Scroller from '@/components/ui/Scroller'
import { proxyImg } from '@/lib/img-proxy'
import type { SeenLiveRecent } from '@/lib/seen-live'

function yearOf(r: SeenLiveRecent): number | null {
  if (r.seen_year) return r.seen_year
  const d = r.event?.start_date || r.seen_date
  if (d) { const y = Number(String(d).slice(0, 4)); if (Number.isFinite(y)) return y }
  return null
}

export default function SeenLiveStrip() {
  const [items, setItems] = useState<SeenLiveRecent[]>([])
  const [loading, setLoading] = useState(true)
  const [viewer, setViewer] = useState<SeenLiveRecent | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/seen-live/recent')
      .then((r) => r.json())
      .then((d) => { if (alive) { setItems(Array.isArray(d.items) ? d.items : []); setLoading(false) } })
      .catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!viewer) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [viewer])

  if (!loading && items.length === 0) return null

  return (
    <section>
      <div className="mb-3.5 flex items-center justify-between">
        <h2 className="m-0 font-['Outfit',sans-serif] text-[20px] font-extrabold tracking-[-0.01em] text-[var(--text-primary)]">
          Iš koncertų
        </h2>
      </div>

      <Scroller gap={12} ariaLabel="Iš koncertų">
        {loading
          ? Array(6).fill(null).map((_, i) => (
              <div key={i} className="w-[150px] shrink-0 animate-pulse">
                <div className="h-[200px] w-full rounded-xl" style={{ background: 'var(--bg-elevated)' }} />
              </div>
            ))
          : items.map((it) => {
              const media = it.media[0]
              const isVideo = media?.type === 'video'
              const name = it.artist?.name || it.raw_artist_name || '—'
              const y = yearOf(it)
              return (
                <button key={it.id} onClick={() => setViewer(it)} className="w-[150px] shrink-0 text-left">
                  <div className="relative h-[200px] w-full overflow-hidden rounded-xl" style={{ background: 'var(--cover-placeholder)' }}>
                    {media && !isVideo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={proxyImg(media.url)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                    ) : media && isVideo ? (
                      <video src={media.url} preload="metadata" muted playsInline className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[32px]">🎤</div>
                    )}
                    {isVideo && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white">
                          <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor"><polygon points="6 4 20 12 6 20 6 4" /></svg>
                        </span>
                      </div>
                    )}
                    {it.media.length > 1 && (
                      <span className="absolute right-1.5 top-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[11px] font-bold text-white">{it.media.length}</span>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-6">
                      <div className="truncate font-['Outfit',sans-serif] text-[14px] font-extrabold text-white">{name}</div>
                      <div className="truncate text-[11px] text-white/75">{[it.user?.username ? `@${it.user.username}` : null, y ? String(y) : null].filter(Boolean).join(' · ')}</div>
                    </div>
                  </div>
                </button>
              )
            })}
      </Scroller>

      {viewer && <StripViewer row={viewer} onClose={() => setViewer(null)} />}
    </section>
  )
}

function StripViewer({ row, onClose }: { row: SeenLiveRecent; onClose: () => void }) {
  const name = row.artist?.name || row.raw_artist_name || '—'
  const artistHref = row.artist?.slug ? `/atlikejai/${row.artist.slug}` : null
  const eventHref = row.event?.slug ? `/renginiai/${row.event.slug}` : null
  const evLabel = row.event?.title || row.raw_event_title || (row.raw_event_is_festival ? 'Festivalis' : null)
  const place = [row.event?.city || row.raw_event_city, (row.raw_event_country && row.raw_event_country !== 'Lietuva') ? row.raw_event_country : null].filter(Boolean).join(', ')
  const y = yearOf(row)

  return (
    <div className="fixed inset-0 z-[300] overflow-y-auto overscroll-contain" style={{ background: 'rgba(0,0,0,0.92)' }} onClick={onClose}>
      <div className="mx-auto min-h-full w-full max-w-2xl px-3 py-4" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-['Outfit',sans-serif] text-[22px] font-extrabold leading-tight text-white">{name}</div>
            <div className="mt-0.5 text-[13px] text-white/70">
              {[row.user?.username ? `@${row.user.username}` : null, evLabel, place || null, y ? String(y) : null].filter(Boolean).join(' · ') || 'Matyta gyvai'}
            </div>
          </div>
          <button onClick={onClose} aria-label="Uždaryti" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white">
            <svg viewBox="0 0 16 16" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M3 3l10 10M13 3L3 13" /></svg>
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {row.media.map((m, i) => (
            <div key={i} className="overflow-hidden rounded-xl bg-black">
              {m.type === 'video' ? (
                <video src={m.url} controls playsInline preload="metadata" className="max-h-[75vh] w-full" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={proxyImg(m.url)} alt="" referrerPolicy="no-referrer" className="max-h-[75vh] w-full object-contain" />
              )}
            </div>
          ))}
        </div>

        {row.note && <p className="mt-3 whitespace-pre-wrap text-[14px] text-white/85">{row.note}</p>}

        <div className="mt-4 flex flex-wrap gap-2 pb-6">
          {row.user?.username && <Link href={`/vartotojas/${row.user.username}`} className="rounded-full bg-white/15 px-3.5 py-2 text-[13px] font-bold text-white">Profilis @{row.user.username}</Link>}
          {artistHref && <Link href={artistHref} className="rounded-full bg-white/15 px-3.5 py-2 text-[13px] font-bold text-white">Atlikėjas: {name}</Link>}
          {eventHref && <Link href={eventHref} className="rounded-full bg-white/15 px-3.5 py-2 text-[13px] font-bold text-white">Renginys</Link>}
        </div>
      </div>
    </div>
  )
}
