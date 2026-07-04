'use client'
// components/DiscussionSidebar.tsx
//
// Client-side sidebar fetcher — renders skeleton instantly so page shell
// doesn't block on heavy aggregation queries (top contributors, mentioned
// tracks). Single API call to /api/discussions/[id]/sidebar fills both.

import { useEffect, useState } from 'react'
import Link from 'next/link'

type TopContributor = {
  id: string
  username: string | null
  full_name: string | null
  avatar_url: string | null
  count: number
}

type MentionedTrack = {
  id: number
  legacy_id: number | null
  slug: string
  title: string
  cover_url: string | null
  artist_name: string | null
  artist_slug: string | null
  mention_count: number
}

type SidebarData = {
  topContributors: TopContributor[]
  mentionedTracks: MentionedTrack[]
}

function strHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

function Initials({ name }: { name: string }) {
  const initials = name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'
  const hue = strHash(name) % 360
  return (
    <div
      style={{
        width: 32, height: 32, borderRadius: '50%',
        background: `hsl(${hue}, 40%, 22%)`,
        color: `hsl(${hue}, 60%, 62%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 800, flexShrink: 0,
      }}
    >{initials}</div>
  )
}

function CardSkeleton({ rows }: { rows: number }) {
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
      <div className="mb-3 h-3 w-32 animate-pulse rounded bg-[var(--bg-hover)]" />
      <ul className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <li key={i} className="flex items-center gap-2.5">
            <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-[var(--bg-hover)]" />
            <div className="flex-1 space-y-1.5">
              <div className="h-2.5 w-3/4 animate-pulse rounded bg-[var(--bg-hover)]" />
              <div className="h-2 w-1/2 animate-pulse rounded bg-[var(--bg-active)]" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function DiscussionSidebar({ discussionId }: { discussionId: number }) {
  const [data, setData] = useState<SidebarData | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/discussions/${discussionId}/sidebar`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setData({ topContributors: [], mentionedTracks: [] }) })
    return () => { cancelled = true }
  }, [discussionId])

  if (!data) {
    return (
      <div className="sticky top-6 flex flex-col gap-3">
        <CardSkeleton rows={5} />
        <CardSkeleton rows={6} />
      </div>
    )
  }

  return (
    <div className="sticky top-6 flex flex-col gap-3">
      {data.topContributors.length > 0 && (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
          <div className="mb-3 text-[12px] font-extrabold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            Aktyviausi nariai
          </div>
          <ul className="space-y-2">
            {data.topContributors.map((c, i) => {
              const name = c.full_name || c.username || 'Vartotojas'
              return (
                <li key={c.id} className="flex items-center gap-2.5">
                  <span className="w-3 text-[12px] font-bold text-[var(--text-faint)]">{i + 1}.</span>
                  {c.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.avatar_url} alt="" referrerPolicy="no-referrer"
                         style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <Initials name={name} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-bold text-[var(--text-primary)]">{name}</div>
                    <div className="text-[12px] text-[var(--text-muted)]">
                      {c.count.toLocaleString()} atsakym{c.count % 10 === 1 && c.count !== 11 ? 'as' : 'ai'}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {data.mentionedTracks.length > 0 && (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              Paminėtos dainos
            </div>
            <div className="text-[12px] text-[var(--text-muted)]">{data.mentionedTracks.length}</div>
          </div>
          <ul className="space-y-2">
            {data.mentionedTracks.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/dainos/${t.slug}-${t.id}`}
                  className="flex items-center gap-2.5 rounded-lg p-1.5 transition-colors hover:bg-[var(--bg-hover)]"
                >
                  <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-[var(--bg-active)]">
                    {t.cover_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.cover_url} alt="" referrerPolicy="no-referrer"
                           style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-[var(--text-muted)]">♪</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold text-[var(--text-primary)]">{t.title}</div>
                    <div className="truncate text-[12px] text-[var(--text-muted)]">{t.artist_name || ''}</div>
                  </div>
                  <span className="shrink-0 rounded-full bg-[var(--bg-active)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--text-muted)]">
                    ×{t.mention_count}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Panašios diskusijos placeholder — ateities feature */}
      <div className="rounded-2xl border border-dashed border-[var(--border-default)] bg-[var(--card-bg)] p-4 text-center">
        <div className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-[var(--text-muted)]">
          Panašios diskusijos
        </div>
        <div className="mt-2 text-[13px] italic text-[var(--text-muted)]">netrukus</div>
      </div>
    </div>
  )
}
