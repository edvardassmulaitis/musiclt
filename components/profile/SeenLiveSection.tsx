'use client'
// components/profile/SeenLiveSection.tsx
// ────────────────────────────────────────────────────────────────────────────
// Profilio sekcija „Matyti gyvai" — atlikėjai, kuriuos narys matė koncertuose.
// Paspaudus kortelę atsidaro PERŽIŪRA (lightbox) su nario nuotraukomis/video +
// info (atlikėjas, renginys, vieta, metai, pastaba). Taip narys mato SAVO
// turinį, o ne iškart nukeliauja į atlikėjo puslapį.
// ────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import type { SeenLiveRow } from '@/lib/seen-live'

function yearOf(r: SeenLiveRow): number | null {
  if (r.seen_year) return r.seen_year
  const d = r.event?.start_date || r.seen_date
  if (d) { const y = Number(String(d).slice(0, 4)); if (Number.isFinite(y)) return y }
  return null
}

function subtitle(r: SeenLiveRow): string {
  const ev = r.event?.title || r.raw_event_title || (r.raw_event_is_festival ? 'Festivalis' : null)
  const place = [
    r.event?.city || r.raw_event_city,
    (r.raw_event_country && r.raw_event_country !== 'Lietuva') ? r.raw_event_country : null,
  ].filter(Boolean).join(', ')
  const y = yearOf(r)
  return [ev, place || null, y ? String(y) : null].filter(Boolean).join(' · ')
}

export function SeenLiveSection({ items }: { items: SeenLiveRow[] }) {
  const [viewer, setViewer] = useState<SeenLiveRow | null>(null)

  useEffect(() => {
    if (!viewer) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [viewer])

  if (!items || items.length === 0) return null

  return (
    <>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((r) => {
          const name = r.artist?.name || r.raw_artist_name || '—'
          const cover = r.artist?.cover_image_url || (r.media.find((m) => m.type === 'image')?.url ?? null)
          const sub = subtitle(r)
          return (
            <button key={r.id} onClick={() => setViewer(r)}
              className="flex items-center gap-3 rounded-xl p-2.5 text-left ring-1 transition-colors hover:bg-[var(--bg-hover)]"
              style={{ background: 'var(--bg-surface)', ['--tw-ring-color' as any]: 'var(--border-subtle)' } as any}>
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg" style={{ background: 'var(--cover-placeholder)' }}>
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={proxyImg(cover)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                ) : <div className="flex h-full w-full items-center justify-center text-[18px]" style={{ color: 'var(--text-faint)' }}>🎤</div>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-['Outfit',sans-serif] text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>{name}</div>
                {sub && <div className="truncate text-[12px]" style={{ color: 'var(--text-muted)' }}>{sub}</div>}
              </div>
              {r.media && r.media.length > 0 && (
                <div className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                  {r.media.some((m) => m.type === 'video') ? '🎬' : '📷'} {r.media.length}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {viewer && <SeenLiveViewer row={viewer} onClose={() => setViewer(null)} />}
    </>
  )
}

// ── Peržiūra (lightbox) ─────────────────────────────────────────────────────
function SeenLiveViewer({ row, onClose }: { row: SeenLiveRow; onClose: () => void }) {
  const name = row.artist?.name || row.raw_artist_name || '—'
  const artistHref = row.artist?.slug ? `/atlikejai/${row.artist.slug}` : null
  const eventHref = row.event?.slug ? `/renginiai/${row.event.slug}` : null
  const evLabel = row.event?.title || row.raw_event_title || (row.raw_event_is_festival ? 'Festivalis' : null)
  const place = [row.event?.city || row.raw_event_city, (row.raw_event_country && row.raw_event_country !== 'Lietuva') ? row.raw_event_country : null].filter(Boolean).join(', ')
  const y = yearOf(row)

  return (
    <div className="fixed inset-0 z-[300] overflow-y-auto overscroll-contain" style={{ background: 'rgba(0,0,0,0.92)' }} onClick={onClose}>
      <div className="mx-auto min-h-full w-full max-w-2xl px-3 py-4" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }} onClick={(e) => e.stopPropagation()}>
        {/* Antraštė */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-['Outfit',sans-serif] text-[22px] font-extrabold leading-tight text-white">{name}</div>
            <div className="mt-0.5 text-[13px] text-white/70">
              {[evLabel, place || null, y ? String(y) : null].filter(Boolean).join(' · ') || 'Matyta gyvai'}
            </div>
          </div>
          <button onClick={onClose} aria-label="Uždaryti" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white">
            <svg viewBox="0 0 16 16" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M3 3l10 10M13 3L3 13" /></svg>
          </button>
        </div>

        {/* Media */}
        {row.media && row.media.length > 0 ? (
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
        ) : (
          <div className="rounded-xl bg-white/5 p-6 text-center text-[14px] text-white/60">Nuotraukų / video nėra.</div>
        )}

        {row.note && <p className="mt-3 whitespace-pre-wrap text-[14px] text-white/85">{row.note}</p>}

        {/* Nuorodos */}
        <div className="mt-4 flex flex-wrap gap-2 pb-6">
          {artistHref && <Link href={artistHref} className="rounded-full bg-white/15 px-3.5 py-2 text-[13px] font-bold text-white">Atlikėjas: {name}</Link>}
          {eventHref && <Link href={eventHref} className="rounded-full bg-white/15 px-3.5 py-2 text-[13px] font-bold text-white">Renginys</Link>}
        </div>
      </div>
    </div>
  )
}
