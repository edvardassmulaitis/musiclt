'use client'
// components/events/EventAttendees.tsx
// ────────────────────────────────────────────────────────────────────────────
// Renginio puslapio sekcija „Dalyvavo" — kiek narių pažymėjo „mačiau gyvai" +
// jų avatarai/username + įkeltas turinys (nuotraukos/video). Paspaudus media —
// peržiūra. Serveris paduoda sightings.
// ────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import SeenLiveMediaViewer from '@/components/seen-live/SeenLiveMediaViewer'
import type { SeenLiveRecent } from '@/lib/seen-live'

type RawAttendee = { user_username: string; user_avatar_url?: string | null }

export default function EventAttendees({ sightings, attendees: rawAttendees = [] }: { sightings: SeenLiveRecent[]; attendees?: RawAttendee[] }) {
  const [viewer, setViewer] = useState<SeenLiveRecent | null>(null)

  // Unikalūs dalyviai (username) — sujungiam sightings + event_attendees.
  const map = new Map<string, { username: string; avatar_url: string | null }>()
  for (const s of sightings) {
    const u = s.user
    if (u?.username && !map.has(u.username)) map.set(u.username, { username: u.username, avatar_url: u.avatar_url ?? null })
  }
  for (const a of rawAttendees) {
    if (a.user_username && !map.has(a.user_username)) map.set(a.user_username, { username: a.user_username, avatar_url: a.user_avatar_url ?? null })
  }
  const attendees = [...map.values()]
  const withMedia = sightings.filter((s) => s.media.length > 0)

  if (attendees.length === 0) return null

  return (
    <section className="mx-auto mt-8 w-full max-w-3xl px-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="m-0 font-['Outfit',sans-serif] text-[18px] font-extrabold text-[var(--text-primary)]">Dalyvavo</h2>
        <span className="rounded-full px-2 py-0.5 text-[13px] font-bold" style={{ background: 'var(--accent-orange)', color: '#fff' }}>{attendees.length}</span>
      </div>

      {/* Dalyvių avatarai / username */}
      <div className="mb-4 flex flex-wrap gap-2">
        {attendees.slice(0, 30).map((u) => (
          <Link key={u.username} href={`/vartotojas/${u.username}`} className="inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 ring-1 transition-colors hover:bg-[var(--bg-hover)]"
            style={{ background: 'var(--bg-elevated)', ['--tw-ring-color' as any]: 'var(--border-subtle)' } as any}>
            {u.avatar_url
              ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={proxyImg(u.avatar_url)} alt="" referrerPolicy="no-referrer" className="h-6 w-6 rounded-full object-cover" />
              : <span className="flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-extrabold" style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>{(u.username || '?').charAt(0).toUpperCase()}</span>
            }
            <span className="text-[13px] font-semibold text-[var(--text-secondary)]">@{u.username}</span>
          </Link>
        ))}
      </div>

      {/* Įkeltas turinys */}
      {withMedia.length > 0 && (
        <>
          <h3 className="mb-2 font-['Outfit',sans-serif] text-[15px] font-bold text-[var(--text-primary)]">Akimirkos</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {withMedia.map((s) => {
              const m = s.media[0]
              const isVideo = m?.type === 'video'
              const thumb = m?.type === 'image' ? m.url : (s.media.find((x) => x.type === 'image')?.url || s.media.find((x) => x.poster)?.poster || null)
              return (
                <button key={s.id} onClick={() => setViewer(s)} className="group block text-left">
                  <div className="relative overflow-hidden rounded-xl bg-[var(--bg-elevated)]" style={{ aspectRatio: '1/1' }}>
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={proxyImg(thumb)} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center" style={{ background: 'linear-gradient(160deg,#2a2f3a,#171a22)' }}><svg viewBox="0 0 24 24" width={20} height={20} fill="#fff"><polygon points="6 4 20 12 6 20 6 4" /></svg></div>
                    )}
                    {isVideo && <div className="absolute inset-0 flex items-center justify-center"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white"><svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor"><polygon points="6 4 20 12 6 20 6 4" /></svg></span></div>}
                    {s.media.length > 1 && <span className="absolute right-1.5 top-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[11px] font-bold text-white">{s.media.length}</span>}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 pt-5">
                      <span className="truncate text-[11px] font-semibold text-white/85">{s.user?.username ? `@${s.user.username}` : ''}</span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}

      {viewer && <SeenLiveMediaViewer row={viewer} onClose={() => setViewer(null)} />}
    </section>
  )
}
