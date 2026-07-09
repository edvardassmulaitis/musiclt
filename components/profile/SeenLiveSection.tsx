'use client'
// components/profile/SeenLiveSection.tsx
// ────────────────────────────────────────────────────────────────────────────
// Profilio sekcija „Matyti gyvai" — atlikėjai, kuriuos narys matė koncertuose.
// Rodo TIK approved įrašus (serveris paduoda per getProfileSeenLive). Kur
// susieta su renginiu — rodo renginį; kur ne — vietą/metus (jei nurodyta).
// ────────────────────────────────────────────────────────────────────────────

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
  const ev = r.event?.title || r.raw_event_title
  const place = [
    r.event?.city || r.raw_event_city,
    (r.raw_event_country && r.raw_event_country !== 'Lietuva') ? r.raw_event_country : null,
  ].filter(Boolean).join(', ')
  const y = yearOf(r)
  return [ev, place || null, y ? String(y) : null].filter(Boolean).join(' · ')
}

export function SeenLiveSection({ items }: { items: SeenLiveRow[] }) {
  if (!items || items.length === 0) return null

  return (
    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((r) => {
        const name = r.artist?.name || r.raw_artist_name || '—'
        const cover = r.artist?.cover_image_url || null
        const artistHref = r.artist?.slug ? `/atlikejai/${r.artist.slug}` : null
        const eventHref = r.event?.slug ? `/renginiai/${r.event.slug}` : null
        const sub = subtitle(r)

        const inner = (
          <div className="flex items-center gap-3 rounded-xl p-2.5 ring-1 transition-colors hover:bg-[var(--bg-hover)]"
            style={{ background: 'var(--bg-surface)', ['--tw-ring-color' as any]: 'var(--border-subtle)' }}>
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg" style={{ background: 'var(--cover-placeholder)' }}>
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={proxyImg(cover)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[18px]" style={{ color: 'var(--text-faint)' }}>🎤</div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-['Outfit',sans-serif] text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>{name}</div>
              {sub && <div className="truncate text-[12px]" style={{ color: 'var(--text-muted)' }}>{sub}</div>}
            </div>
            {eventHref && (
              <Link href={eventHref} onClick={(e) => e.stopPropagation()}
                className="shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ring-1"
                style={{ color: 'var(--accent-link)', ['--tw-ring-color' as any]: 'var(--border-subtle)' }}>
                renginys
              </Link>
            )}
          </div>
        )

        return artistHref
          ? <Link key={r.id} href={artistHref} className="block">{inner}</Link>
          : <div key={r.id}>{inner}</div>
      })}
    </div>
  )
}
