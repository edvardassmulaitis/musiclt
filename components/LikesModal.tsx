'use client'
// components/LikesModal.tsx
//
// Modal listing everyone who has liked an entity (artist / album / track).
// Users are auto-sorted by rank priority (Super → Ultra → VIP → ... → Naujokas)
// then alphabetically. No filter tabs — the ordering handles segmentation.
//
// Each user's rank is shown as a 4-dot progress bar (hover shows actual name).
// Header is minimal: just a close button and the self-like pill. Artist name /
// count aren't repeated inside — the user clicked in from the artist page so
// the context is obvious, and the count lives on the pill on that page.

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'

export type LikeUser = {
  user_username: string
  user_rank?: string | null
  user_avatar_url?: string | null
}

type Props = {
  open: boolean
  onClose: () => void
  title: string   // kept in prop signature for other callers; not rendered
  count: number   // kept for compatibility; not rendered
  users: LikeUser[]
  selfLiked?: boolean
  authed?: boolean
  onToggleSelfLike?: () => void
  selfLikePending?: boolean
}

const PAGE_SIZE = 60

/** Rank priority — higher = more senior. Actual music.lt point thresholds:
 *    0–100     Naujokas
 *    100–300   Aktyvus naujokas
 *    300–500   Įsibėgėjantis narys
 *    500–1000  Narys
 *    1000–2000 Aktyvus narys
 *    2000–3000 Ultra narys
 *    3000–5000 Super narys
 *    5000+     VIP narys          ← top
 *  Order of checks matters: more specific strings ("aktyvus narys",
 *  "aktyvus naujokas") are tested BEFORE their shorter suffixes. */
function rankWeight(rank: string | null | undefined): number {
  if (!rank) return 0
  const r = rank.toLowerCase()
  if (r.includes('vip')) return 100
  if (r.includes('super')) return 90
  if (r.includes('ultra')) return 80
  if (r.includes('aktyvus narys')) return 70
  // Check "įsibėgėjantis" BEFORE plain "narys" — contains "narys" substring
  if (r.includes('įsibėgėjantis') || r.includes('isibegejantis')) return 50
  if (r.includes('narys')) return 60
  if (r.includes('aktyvus naujokas')) return 40
  if (r.includes('naujokas')) return 30
  return 10
}

/** Map rank to a 1–4 tier for the progress-bar visualization.
 *  Groups adjacent ranks so bar growth tracks the point ladder evenly:
 *    Tier 4: Super, VIP          (3000+ pts)
 *    Tier 3: Aktyvus narys, Ultra (1000–3000)
 *    Tier 2: Įsibėgėjantis, Narys (300–1000)
 *    Tier 1: Naujokas, Aktyvus naujokas (0–300)   */
function rankLevel(rank: string | null | undefined): number {
  if (!rank) return 0
  const r = rank.toLowerCase()
  if (r.includes('vip') || r.includes('super')) return 4
  if (r.includes('ultra') || r.includes('aktyvus narys')) return 3
  // Check "įsibėgėjantis" + plain "narys" before naujokas branch.
  if (r.includes('įsibėgėjantis') || r.includes('isibegejantis')) return 2
  if (r.includes('narys')) return 2
  if (r.includes('naujokas')) return 1
  return 0
}

export default function LikesModal({
  open, onClose, users,
  selfLiked, authed, onToggleSelfLike, selfLikePending,
}: Props) {
  const [shown, setShown] = useState(PAGE_SIZE)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-sorted users (by rank desc, then username)
  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) =>
      rankWeight(b.user_rank) - rankWeight(a.user_rank)
      || a.user_username.localeCompare(b.user_username)
    )
  }, [users])

  useEffect(() => { setShown(PAGE_SIZE) }, [open])

  // Escape close + scroll lock
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', h)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 250) {
      setShown((s) => Math.min(s + PAGE_SIZE, sortedUsers.length))
    }
  }, [sortedUsers.length])

  if (!open || typeof document === 'undefined') return null

  const visibleUsers = sortedUsers.slice(0, shown)

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '32px 16px',
        background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(8px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          width: '100%', maxWidth: 820, maxHeight: '88vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 20, overflow: 'hidden',
          boxShadow: '0 40px 80px -20px rgba(0,0,0,0.6)',
        }}
      >
        {/* Close button in its own compact row — no title/subtitle clutter */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 14px 0' }}>
          <button
            onClick={onClose}
            aria-label="Uždaryti"
            style={{
              width: 32, height: 32, borderRadius: 10, border: '1px solid var(--border-subtle)',
              background: 'var(--card-bg)', color: 'var(--text-secondary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'all .15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'var(--border-strong)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
          >
            <svg viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        {/* Self-like pill — prominent at top */}
        {selfLiked !== undefined && (
          <div style={{ padding: '6px 24px 18px', flexShrink: 0 }}>
            {authed === false ? (
              <Link
                href="/auth/signin"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 10,
                  padding: '10px 18px', borderRadius: 100,
                  background: 'var(--accent-orange)', color: '#fff',
                  fontFamily: 'Outfit,sans-serif', fontSize: 13, fontWeight: 800,
                  textDecoration: 'none',
                  boxShadow: '0 6px 20px rgba(249,115,22,0.35)',
                  transition: 'transform .15s, box-shadow .15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 10px 28px rgba(249,115,22,0.5)' }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(249,115,22,0.35)' }}
              >
                <HeartIcon size={14} />
                Prisijunk, kad įdėtum „Patinka"
              </Link>
            ) : (
              <button
                onClick={() => onToggleSelfLike && onToggleSelfLike()}
                disabled={selfLikePending}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 10,
                  padding: '10px 18px', borderRadius: 100,
                  border: `1px solid ${selfLiked ? 'var(--accent-orange)' : 'var(--border-default)'}`,
                  background: selfLiked ? 'var(--accent-orange)' : 'var(--card-bg)',
                  color: selfLiked ? '#fff' : 'var(--text-primary)',
                  fontFamily: 'Outfit,sans-serif', fontSize: 13, fontWeight: 800,
                  cursor: selfLikePending ? 'wait' : 'pointer',
                  opacity: selfLikePending ? 0.7 : 1,
                  transition: 'all .2s',
                  boxShadow: selfLiked ? '0 6px 20px rgba(249,115,22,0.35)' : 'none',
                }}
              >
                <svg viewBox="0 0 24 24" width={14} height={14} fill={selfLiked ? '#fff' : 'none'} stroke={selfLiked ? '#fff' : 'var(--accent-orange)'} strokeWidth={2}>
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
                {selfLiked ? 'Tau patinka' : 'Patinka ir man'}
              </button>
            )}
          </div>
        )}

        {/* Body — sorted user grid with infinite load */}
        <div
          ref={scrollRef}
          onScroll={onScroll}
          style={{ flex: 1, overflowY: 'auto', padding: '4px 22px 22px' }}
        >
          {sortedUsers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', fontSize: 13 }}>
              Dar niekas nepaspaudė.
            </div>
          ) : (
            <>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 10,
              }}>
                {visibleUsers.map((u) => (
                  <Link
                    key={u.user_username}
                    href={`/vartotojas/ghost/${encodeURIComponent(u.user_username)}`}
                    title={u.user_rank || ''}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px', borderRadius: 12,
                      background: 'var(--card-bg)',
                      border: '1px solid var(--border-subtle)',
                      textDecoration: 'none', minWidth: 0,
                      transition: 'all .15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.background = 'var(--bg-hover)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.background = 'var(--card-bg)' }}
                  >
                    <UserAvatar user={u} size={36} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 700, color: 'var(--text-primary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        fontFamily: 'Outfit,sans-serif',
                      }}>{u.user_username}</div>
                      <RankBar level={rankLevel(u.user_rank)} />
                    </div>
                  </Link>
                ))}
              </div>
              {shown < sortedUsers.length && (
                <div style={{ padding: '14px 0 2px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
                  Rodoma {shown.toLocaleString('lt-LT')} iš {sortedUsers.length.toLocaleString('lt-LT')} · scrollink žemyn
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── Rank bar — 4 dots filled up to user's level ──────────────────────

function RankBar({ level }: { level: number }) {
  const total = 4
  return (
    <div style={{ display: 'flex', gap: 3, marginTop: 5 }} aria-hidden>
      {Array.from({ length: total }).map((_, i) => {
        const filled = i < level
        return (
          <span
            key={i}
            style={{
              height: 3,
              width: 16,
              borderRadius: 2,
              background: filled ? 'var(--accent-orange)' : 'var(--border-default)',
              opacity: filled ? 0.6 + (0.4 * (i + 1) / total) : 1,
              transition: 'background .2s',
            }}
          />
        )
      })}
    </div>
  )
}

function UserAvatar({ user, size = 34 }: { user: LikeUser; size?: number }) {
  const initial = user.user_username[0]?.toUpperCase() || '?'
  if (user.user_avatar_url) {
    return (
      <img
        src={user.user_avatar_url}
        alt={user.user_username}
        referrerPolicy="no-referrer"
        style={{
          width: size, height: size, borderRadius: '50%',
          border: '1px solid var(--border-subtle)', objectFit: 'cover',
          flexShrink: 0, background: 'var(--bg-elevated)',
        }}
        onError={(e) => {
          const el = e.currentTarget
          el.style.display = 'none'
          const next = el.nextElementSibling as HTMLElement | null
          if (next) next.style.display = 'flex'
        }}
      />
    )
  }
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%',
        background: `hsl(${strHash(user.user_username) % 360}, 40%, 22%)`,
        color: `hsl(${strHash(user.user_username) % 360}, 60%, 62%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, fontSize: size * 0.42, fontWeight: 800,
        fontFamily: 'Outfit,sans-serif',
      }}
    >{initial}</div>
  )
}

function HeartIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="#fff" stroke="#fff">
      <path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9z" />
    </svg>
  )
}

function strHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}
