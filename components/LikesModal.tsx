'use client'
// components/LikesModal.tsx
//
// Reusable modalas, rodantis visus vartotojus, kurie patiko šį entity
// (atlikėjas / albumas / daina). Gauna pilną users array (gali būti 700+),
// rodo chunked (pirmus 60), infinite-scroll load more, filter pagal rank'ą.

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
  title: string
  count: number
  users: LikeUser[]
  /** Optional self-like integration. When selfLiked is provided (not undefined),
   *  a banner with "Patinka ir man" / "Tau patinka" appears at the top of the
   *  body. If the viewer is not signed in, pass authed=false to render a sign-in
   *  prompt instead of a toggle. */
  selfLiked?: boolean
  authed?: boolean
  onToggleSelfLike?: () => void
  selfLikePending?: boolean
}

const PAGE_SIZE = 60

/** Rank order — matches server rankPriority. */
const RANK_ORDER = [
  'Super narys',
  'Ultra narys',
  'VIP narys',
  'Įsibėgėjantis narys',
  'Aktyvus narys',
  'Narys',
  'Aktyvus naujokas',
  'Naujokas',
]

/** Normalize a rank string into canonical buckets. */
function canonicalRank(r?: string | null): string {
  if (!r) return 'Nežinomas'
  const low = r.toLowerCase()
  for (const bucket of RANK_ORDER) {
    if (low.includes(bucket.toLowerCase())) return bucket
  }
  return r
}

export default function LikesModal({
  open, onClose, title, count, users,
  selfLiked, authed, onToggleSelfLike, selfLikePending,
}: Props) {
  const [rankFilter, setRankFilter] = useState<string>('all')
  const [shown, setShown] = useState(PAGE_SIZE)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Group users by canonical rank (memoized)
  const { filtered, rankBuckets } = useMemo(() => {
    const buckets = new Map<string, number>()
    for (const u of users) {
      const r = canonicalRank(u.user_rank)
      buckets.set(r, (buckets.get(r) || 0) + 1)
    }
    const filt = rankFilter === 'all'
      ? users
      : users.filter((u) => canonicalRank(u.user_rank) === rankFilter)
    return { filtered: filt, rankBuckets: buckets }
  }, [users, rankFilter])

  // Reset pagination when filter changes or modal reopens
  useEffect(() => { setShown(PAGE_SIZE) }, [rankFilter, open])

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

  // Infinite scroll — near bottom of scroll container, load more
  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 250) {
      setShown((s) => Math.min(s + PAGE_SIZE, filtered.length))
    }
  }, [filtered.length])

  if (!open || typeof document === 'undefined') return null

  // Ordered filter tabs — only show buckets with counts
  const tabs = [
    { key: 'all', label: 'Visi', n: users.length },
    ...RANK_ORDER
      .filter((r) => (rankBuckets.get(r) || 0) > 0)
      .map((r) => ({ key: r, label: r, n: rankBuckets.get(r) || 0 })),
    ...Array.from(rankBuckets.keys())
      .filter((r) => !RANK_ORDER.includes(r) && r !== 'Nežinomas')
      .map((r) => ({ key: r, label: r, n: rankBuckets.get(r) || 0 })),
    ...(rankBuckets.get('Nežinomas') ? [{ key: 'Nežinomas', label: 'Be rango', n: rankBuckets.get('Nežinomas') || 0 }] : []),
  ]

  const visibleUsers = filtered.slice(0, shown)

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
          width: '100%', maxWidth: 820, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 20, overflow: 'hidden',
          boxShadow: '0 40px 80px -20px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 22px', borderBottom: '1px solid var(--border-subtle)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <HeartIcon size={18} />
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontFamily: 'Outfit,sans-serif', fontWeight: 800, fontSize: 16,
                color: 'var(--text-primary)', lineHeight: 1.1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{title}</div>
              <div style={{
                fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginTop: 2,
              }}>
                {count.toLocaleString('lt-LT')} patinka
                {rankFilter !== 'all' && ` · ${filtered.length.toLocaleString('lt-LT')} „${rankFilter}"`}
              </div>
            </div>
          </div>
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

        {/* Filter tabs */}
        {tabs.length > 2 && (
          <div style={{
            display: 'flex', gap: 6, padding: '10px 22px', borderBottom: '1px solid var(--border-subtle)',
            overflowX: 'auto', scrollbarWidth: 'thin', flexShrink: 0,
          }}>
            {tabs.map((t) => {
              const isActive = rankFilter === t.key
              return (
                <button
                  key={t.key}
                  onClick={() => setRankFilter(t.key)}
                  style={{
                    flexShrink: 0, padding: '5px 12px', borderRadius: 100,
                    border: `1px solid ${isActive ? '#f97316' : 'var(--border-subtle)'}`,
                    background: isActive ? 'rgba(249,115,22,.15)' : 'var(--card-bg)',
                    color: isActive ? '#f97316' : 'var(--text-secondary)',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    fontFamily: 'Outfit,sans-serif',
                    whiteSpace: 'nowrap', transition: 'all .15s',
                  }}
                >
                  {t.label} <span style={{ opacity: 0.6, marginLeft: 4 }}>{t.n}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* Self-like banner (optional) */}
        {selfLiked !== undefined && (
          <div style={{
            padding: '14px 22px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-elevated)',
            flexShrink: 0,
          }}>
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

        {/* Body — scrollable user grid with infinite load */}
        <div
          ref={scrollRef}
          onScroll={onScroll}
          style={{ flex: 1, overflowY: 'auto', padding: '16px 22px 22px 22px' }}
        >
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', fontSize: 13 }}>
              Nėra vartotojų su pasirinktu statusu.
            </div>
          ) : (
            <>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: 10,
              }}>
                {visibleUsers.map((u) => (
                  <Link
                    key={u.user_username}
                    href={`/vartotojas/ghost/${encodeURIComponent(u.user_username)}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', borderRadius: 10,
                      background: 'var(--card-bg)',
                      border: '1px solid var(--border-subtle)',
                      textDecoration: 'none', minWidth: 0,
                      transition: 'all .15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.background = 'var(--bg-hover)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.background = 'var(--card-bg)' }}
                  >
                    <UserAvatar user={u} size={34} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 700, color: 'var(--text-primary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{u.user_username}</div>
                      {u.user_rank && (
                        <div style={{
                          fontSize: 10, color: 'var(--text-muted)', fontWeight: 600,
                          fontFamily: 'Outfit,sans-serif', letterSpacing: '.02em',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{u.user_rank}</div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
              {shown < filtered.length && (
                <div style={{ padding: '14px 0 2px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
                  Rodoma {shown.toLocaleString('lt-LT')} iš {filtered.length.toLocaleString('lt-LT')} · scrollink žemyn
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
    <svg viewBox="0 0 24 24" width={size} height={size} fill="#f97316" stroke="#f97316">
      <path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9z" />
    </svg>
  )
}

function strHash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}
