'use client'
// components/seen-live/SeenLiveMediaViewer.tsx
// ────────────────────────────────────────────────────────────────────────────
// Bendra „Matyti gyvai" media peržiūra (lightbox). Naudojama profilyje ir
// „Bendruomenės" juostoje. Rodo nuotraukas + video (su fallback nuoroda, jei
// naršyklė nepajėgia atkurti .mov/HEVC), atlikėją, renginį, pastabą.
// ────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import type { SeenLiveRow } from '@/lib/seen-live'

export type ViewerRow = SeenLiveRow & { user?: { username: string | null; avatar_url?: string | null } | null }

function yearOf(r: ViewerRow): number | null {
  if (r.seen_year) return r.seen_year
  const d = r.event?.start_date || r.seen_date
  if (d) { const y = Number(String(d).slice(0, 4)); if (Number.isFinite(y)) return y }
  return null
}

export default function SeenLiveMediaViewer({ row, onClose }: { row: ViewerRow; onClose: () => void }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const name = row.artist?.name || row.raw_artist_name || '—'
  const artistHref = row.artist?.slug ? `/atlikejai/${row.artist.slug}` : null
  const eventHref = row.event?.slug ? `/renginiai/${row.event.slug}` : null
  const evLabel = row.event?.title || row.raw_event_title || (row.raw_event_is_festival ? 'Festivalis' : null)
  const place = [row.event?.city || row.raw_event_city, (row.raw_event_country && row.raw_event_country !== 'Lietuva') ? row.raw_event_country : null].filter(Boolean).join(', ')
  const y = yearOf(row)
  const username = row.user?.username || null

  if (!mounted) return null

  const overlay = (
    <div className="fixed inset-0 z-[300] overflow-y-auto overscroll-contain" style={{ background: 'rgba(0,0,0,0.92)' }} onClick={onClose}>
      <div className="mx-auto min-h-full w-full max-w-2xl px-3 py-4" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-['Outfit',sans-serif] text-[22px] font-extrabold leading-tight text-white">{name}</div>
            <div className="mt-0.5 text-[13px] text-white/70">
              {[username ? `@${username}` : null, evLabel, place || null, y ? String(y) : null].filter(Boolean).join(' · ') || 'Matyta gyvai'}
            </div>
          </div>
          <button onClick={onClose} aria-label="Uždaryti" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white">
            <svg viewBox="0 0 16 16" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M3 3l10 10M13 3L3 13" /></svg>
          </button>
        </div>

        {row.media && row.media.length > 0 ? (
          <div className="flex flex-col gap-3">
            {row.media.map((m, i) => (
              <div key={i} className="overflow-hidden rounded-xl bg-black">
                {m.type === 'video' ? (
                  <div className="bg-black">
                    <video src={m.url} poster={m.poster ? proxyImg(m.poster) : undefined} controls playsInline preload="metadata" className="block max-h-[75vh] min-h-[240px] w-full bg-black" />
                    <a href={m.url} target="_blank" rel="noreferrer noopener" className="flex items-center justify-center gap-2 border-t border-white/10 px-3 py-2.5 text-[13px] font-bold text-white">
                      <svg viewBox="0 0 24 24" width={14} height={14} fill="currentColor"><polygon points="6 4 20 12 6 20 6 4" /></svg>
                      Atidaryti / groti pilnu ekranu
                    </a>
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={proxyImg(m.url)} alt="" referrerPolicy="no-referrer" className="max-h-[75vh] w-full object-contain" />
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl bg-white/5 p-6 text-center text-[14px] text-white/60">Nuotraukų / video nėra.</div>
        )}

        {row.note && <p className="mt-3 whitespace-pre-wrap text-[14px] text-white/85">{row.note}</p>}

        <div className="mt-4 flex flex-wrap gap-2 pb-6">
          {username && <Link href={`/vartotojas/${username}`} className="rounded-full bg-white/15 px-3.5 py-2 text-[13px] font-bold text-white">Profilis @{username}</Link>}
          {artistHref && <Link href={artistHref} className="rounded-full bg-white/15 px-3.5 py-2 text-[13px] font-bold text-white">Atlikėjas: {name}</Link>}
          {eventHref && <Link href={eventHref} className="rounded-full bg-white/15 px-3.5 py-2 text-[13px] font-bold text-white">Renginys</Link>}
        </div>
      </div>
    </div>
  )

  return createPortal(overlay, document.body)
}
