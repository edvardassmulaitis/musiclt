'use client'
// components/LikesModal.tsx
//
// Reusable modalas, rodantis visus vartotojus, kurie patiko šį entity
// (atlikėjas / albumas / daina). Duomenys iš legacy_likes (per music.lt scrape'ą)
// arba iš modern artist_likes/album_likes/track_likes. UI toks pats — nėra
// „archyvo" ar „modern" skirstymo, tiesiog user listas su avatar'ais + rank.
//
// Atidaromas kai user paspaudžia main ♥ button'ą.

import { useEffect } from 'react'
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
  title: string             // pvz. „Depeche Mode" likes
  count: number
  users: LikeUser[]
}

export default function LikesModal({ open, onClose, title, count, users }: Props) {
  // Escape close
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

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="likes-modal-backdrop"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '32px 16px', overflowY: 'auto',
        background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(8px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          width: '100%', maxWidth: 720, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
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
                {count.toLocaleString('lt-LT')} {plural(count, 'patinka', 'patinka', 'patinka')}
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

        {/* Body — scrollable user grid */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '16px 22px 22px 22px',
        }}>
          {users.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', fontSize: 13 }}>
              Dar niekas nepaspaudė „patinka".
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 10,
            }}>
              {users.map((u) => (
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
                  <UserAvatar user={u} size={32} />
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
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function UserAvatar({ user, size = 32 }: { user: LikeUser; size?: number }) {
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

function plural(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10, mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 9 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}
