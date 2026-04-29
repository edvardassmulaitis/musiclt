'use client'
// components/DropBar.tsx
//
// Emoji reaction strip (a.k.a. "Drops") rodomas top bar'e prie LikePill.
// Keturios pasirinkimo: 🔥 (fire), 🐐 (goat), 😭 (cry), 😬 (yikes).
//
// Vizualinis principas: proportional bar — kiekvienas emoji segment'as
// užima tokią dalį pločio kokia yra to emoji proporcija visų reakcijų
// total'e. Tavo selection turi orange ring + subtle glow, bouncena kai
// click'ini, count'as +1 atsiranda kaip floating label.
//
// Kai jokių reakcijų nėra (total === 0), visi 4 segment'ai užima lygiai
// po 25%, atrodo kaip pasirinkimo paletė (ne nuobodu zero state).
//
// API per /api/tracks/[id]/drops — auth + anon (cookie-based fingerprint).

import { useEffect, useRef, useState } from 'react'

type DropEmoji = 'fire' | 'goat' | 'cry' | 'yikes'

const EMOJI_LIST: { key: DropEmoji; label: string; emoji: string; tone: { bg: string; ring: string } }[] = [
  { key: 'fire',  label: 'Fire',   emoji: '🔥', tone: { bg: 'rgba(249,115,22,0.16)',  ring: 'rgba(249,115,22,0.7)' } },
  { key: 'goat',  label: 'GOAT',   emoji: '🐐', tone: { bg: 'rgba(234,179,8,0.16)',   ring: 'rgba(234,179,8,0.7)' } },
  { key: 'cry',   label: 'Cry',    emoji: '😭', tone: { bg: 'rgba(99,102,241,0.16)',  ring: 'rgba(99,102,241,0.7)' } },
  { key: 'yikes', label: 'Yikes',  emoji: '😬', tone: { bg: 'rgba(148,163,184,0.16)', ring: 'rgba(148,163,184,0.7)' } },
]

type Props = {
  trackId: number
  /** Initial counts can be passed by parent for SSR; component still
   *  re-fetches on mount to get current state + viewer's selection. */
  initial?: { counts: Record<DropEmoji, number>; viewer_emoji: DropEmoji | null }
  /** Compact mode — slightly tighter for narrow viewports. */
  compact?: boolean
}

export default function DropBar({ trackId, initial, compact = false }: Props) {
  const [counts, setCounts] = useState<Record<DropEmoji, number>>(
    initial?.counts || { fire: 0, goat: 0, cry: 0, yikes: 0 },
  )
  const [viewerEmoji, setViewerEmoji] = useState<DropEmoji | null>(initial?.viewer_emoji ?? null)
  const [loading, setLoading] = useState(!initial)
  const [pending, setPending] = useState(false)
  const [pulse, setPulse] = useState<DropEmoji | null>(null)
  const pulseTimer = useRef<number | null>(null)

  // Initial fetch — gauk counts + viewer's selection
  useEffect(() => {
    if (initial) return
    let abort = false
    fetch(`/api/tracks/${trackId}/drops`, { credentials: 'include' })
      .then(r => r.json())
      .then((d: { counts: Record<DropEmoji, number>; viewer_emoji: DropEmoji | null }) => {
        if (abort) return
        if (d?.counts) setCounts(d.counts)
        setViewerEmoji(d?.viewer_emoji ?? null)
        setLoading(false)
      })
      .catch(() => { if (!abort) setLoading(false) })
    return () => { abort = true }
  }, [trackId, initial])

  const total = counts.fire + counts.goat + counts.cry + counts.yikes

  /** Toggle viewer's drop:
   *   - jei click'ini ant tos pačios emoji ką jau pasirinkai → DELETE (toggle off)
   *   - kitaip → siunčiam naują emoji (server'is handle'ina switch via UPSERT). */
  const click = async (emoji: DropEmoji) => {
    if (pending) return
    const isToggleOff = viewerEmoji === emoji
    const targetEmoji: DropEmoji | null = isToggleOff ? null : emoji
    setPending(true)
    // Optimistic update
    const prevViewer = viewerEmoji
    const prevCounts = { ...counts }
    const nextCounts = { ...counts }
    if (prevViewer) nextCounts[prevViewer] = Math.max(0, nextCounts[prevViewer] - 1)
    if (targetEmoji) nextCounts[targetEmoji] = (nextCounts[targetEmoji] || 0) + 1
    setCounts(nextCounts)
    setViewerEmoji(targetEmoji)
    // Pulse animation on tapped emoji (also when toggling off — visual feedback).
    setPulse(emoji)
    if (pulseTimer.current) window.clearTimeout(pulseTimer.current)
    pulseTimer.current = window.setTimeout(() => setPulse(null), 450)
    try {
      const res = await fetch(`/api/tracks/${trackId}/drops`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ emoji: targetEmoji }),
      })
      if (!res.ok) throw new Error('post failed')
      const d: { counts: Record<DropEmoji, number>; viewer_emoji: DropEmoji | null } = await res.json()
      // Server'is grąžina source-of-truth — naudojam vietoj optimistinių skaičių
      if (d?.counts) setCounts(d.counts)
      setViewerEmoji(d?.viewer_emoji ?? null)
    } catch {
      // Rollback
      setCounts(prevCounts)
      setViewerEmoji(prevViewer)
    } finally {
      setPending(false)
    }
  }

  // Compute proportions. When total=0, all four show equal 25% — looks like
  // a clean palette of options. Otherwise proportional to count.
  const segments = EMOJI_LIST.map(e => ({
    ...e,
    count: counts[e.key],
    pct: total === 0 ? 25 : (counts[e.key] / total) * 100,
  }))

  return (
    <div
      className={[
        'inline-flex items-stretch overflow-hidden rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)]',
        compact ? 'h-9 min-w-[260px]' : 'h-9 min-w-[320px]',
        loading ? 'opacity-60' : '',
      ].join(' ')}
      role="group"
      aria-label="Reakcija į dainą"
    >
      {segments.map((s, i) => {
        const selected = viewerEmoji === s.key
        const pulsing = pulse === s.key
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => click(s.key)}
            disabled={pending}
            aria-pressed={selected}
            aria-label={`${s.label} — ${s.count}`}
            title={`${s.label} (${s.count})`}
            className={[
              'group relative flex shrink-0 items-center justify-center gap-1 px-2 transition-[width,background-color,flex-grow] duration-300 ease-out',
              i > 0 ? 'border-l border-[var(--border-subtle)]' : '',
              selected ? 'z-[1]' : '',
              pending ? 'cursor-wait' : 'cursor-pointer',
            ].join(' ')}
            style={{
              flexGrow: total === 0 ? 1 : Math.max(0.6, s.pct / 25),
              flexBasis: 0,
              minWidth: 56,
              background: selected ? s.tone.bg : 'transparent',
              boxShadow: selected ? `inset 0 0 0 2px ${s.tone.ring}` : undefined,
            }}
          >
            <span
              className="text-[16px] leading-none"
              style={{
                display: 'inline-block',
                transformOrigin: 'center',
                animation: pulsing ? 'dropbar-bounce 0.45s ease-out' : undefined,
              }}
            >
              {s.emoji}
            </span>
            <span
              className={[
                "font-['Outfit',sans-serif] text-[11px] font-extrabold tabular-nums tracking-tight",
                selected ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]',
              ].join(' ')}
            >
              {s.count}
            </span>
            {/* Floating +1 indicator on tap */}
            {pulsing && (
              <span
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-3 text-[10px] font-extrabold text-[var(--accent-orange)]"
                style={{ animation: 'dropbar-floatup 0.6s ease-out forwards' }}
              >
                +1
              </span>
            )}
          </button>
        )
      })}
      {/* Keyframes — globalūs, kad veiktų. Inline'inam, kad nereikėtų
          tailwind config pakeisti vienam component'ui. */}
      <style jsx>{`
        @keyframes dropbar-bounce {
          0%   { transform: scale(1); }
          30%  { transform: scale(1.45); }
          60%  { transform: scale(0.92); }
          100% { transform: scale(1); }
        }
        @keyframes dropbar-floatup {
          0%   { opacity: 0; transform: translate(-50%, -8px); }
          20%  { opacity: 1; }
          100% { opacity: 0; transform: translate(-50%, -28px); }
        }
      `}</style>
    </div>
  )
}
