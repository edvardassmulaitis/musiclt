'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import Image from 'next/image'

type Notification = {
  id: number
  type: string
  actor_id: string | null
  actor_username: string | null
  actor_full_name: string | null
  actor_avatar_url: string | null
  entity_type: string | null
  entity_id: number | null
  url: string | null
  title: string | null
  snippet: string | null
  data: Record<string, any> | null
  read_at: string | null
  created_at: string
}

const POLL_INTERVAL_MS = 60_000

const TYPE_ICON: Record<string, string> = {
  comment_reply: '💬',
  entity_comment: '💬',
  comment_like: '♥',
  blog_like: '♥',
  blog_comment: '✍️',
  favorite_artist_track: '🎵',
  daily_song_winner: '🏆',
  system: '🔔',
}

function relTime(iso: string): string {
  const d = new Date(iso).getTime()
  const diff = Math.max(0, Date.now() - d)
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'ką tik'
  if (m < 60) return `prieš ${m} min.`
  const h = Math.floor(m / 60)
  if (h < 24) return `prieš ${h} val.`
  const days = Math.floor(h / 24)
  if (days < 7) return `prieš ${days} d.`
  return new Date(iso).toLocaleDateString('lt-LT')
}

function defaultTitle(n: Notification): string {
  if (n.title) return n.title
  const who = n.actor_full_name || n.actor_username || 'Kažkas'
  switch (n.type) {
    case 'comment_reply':         return `${who} atsakė į tavo komentarą`
    case 'entity_comment':        return `${who} pakomentavo`
    case 'comment_like':          return `${who} palaikino tavo komentarą`
    case 'blog_like':             return `${who} palaikino tavo įrašą`
    case 'blog_comment':          return `${who} pakomentavo tavo įrašą`
    case 'favorite_artist_track': return `Naujas track'as nuo mėgstamos grupės`
    case 'daily_song_winner':     return `Tavo nominacija laimėjo dienos dainą`
    case 'system':                return 'Pranešimas'
    default:                      return 'Naujas pranešimas'
  }
}

export function NotificationsBell() {
  const { data: session, status } = useSession()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const isAuth = !!session?.user

  const fetchData = useCallback(async () => {
    if (!isAuth) return
    try {
      const res = await fetch('/api/notifications?limit=20', { cache: 'no-store' })
      if (!res.ok) return
      const json = await res.json()
      setItems(json.notifications || [])
      setUnread(json.unread_count || 0)
    } catch {
      /* swallow */
    }
  }, [isAuth])

  // Polling — kas 60s atnaujinam unread count'ą + sąrašą.
  useEffect(() => {
    if (!isAuth) return
    fetchData()
    const id = setInterval(fetchData, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [isAuth, fetchData])

  // Outside click → close
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const onToggle = async () => {
    const next = !open
    setOpen(next)
    if (next) {
      setLoading(true)
      await fetchData()
      setLoading(false)
    }
  }

  const markAllRead = async () => {
    if (unread === 0) return
    setUnread(0)
    setItems(prev => prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })))
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
    } catch { /* swallow */ }
  }

  const onItemClick = async (n: Notification) => {
    setOpen(false)
    if (!n.read_at) {
      setUnread(c => Math.max(0, c - 1))
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x))
      try {
        await fetch('/api/notifications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: n.id }),
        })
      } catch { /* swallow */ }
    }
  }

  // Hide entirely if not logged in (auth status pending — taip pat nieko nerodom).
  if (status !== 'authenticated' || !isAuth) return null

  const bellColor = 'var(--text-muted)'
  const bellHover = 'var(--text-primary)'

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={onToggle}
        aria-label="Pranešimai"
        style={{
          width: 34, height: 34,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: 'none', background: 'transparent', cursor: 'pointer',
          color: bellColor, borderRadius: 8, position: 'relative',
          transition: 'color .15s, background .15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = bellHover; e.currentTarget.style.background = 'var(--bg-hover)' }}
        onMouseLeave={e => { e.currentTarget.style.color = bellColor; e.currentTarget.style.background = 'transparent' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            minWidth: 16, height: 16, padding: '0 4px',
            borderRadius: 8, background: 'var(--accent-orange)', color: '#fff',
            fontSize: 10, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1, border: '2px solid var(--bg-body)',
          }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0,
            width: 360, maxHeight: 480, overflow: 'hidden',
            background: 'var(--modal-bg)', border: '1px solid var(--modal-border)',
            borderRadius: 14, boxShadow: 'var(--modal-shadow, 0 10px 40px rgba(0,0,0,0.25))',
            zIndex: 250,
            display: 'flex', flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-primary)' }}>
              Pranešimai
              {unread > 0 && (
                <span style={{
                  marginLeft: 8, padding: '2px 7px', borderRadius: 10,
                  background: 'rgba(249,115,22,0.15)', color: 'var(--accent-orange)',
                  fontSize: 10, fontWeight: 800,
                }}>{unread} naujų</span>
              )}
            </div>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                style={{
                  border: 'none', background: 'transparent',
                  color: 'var(--accent-link)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Pažymėti visus
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading && items.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                Kraunasi…
              </div>
            ) : items.length === 0 ? (
              <div style={{ padding: '40px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🔔</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Pranešimų dar nėra
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  Čia matysi naujienas apie savo mėgstamas grupes,
                  komentarus, palaikinimus ir dienos dainos rezultatus.
                </div>
              </div>
            ) : (
              items.map(n => {
                const unreadRow = !n.read_at
                const inner = (
                  <div style={{
                    display: 'flex', gap: 12,
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--border-subtle)',
                    background: unreadRow ? 'rgba(96,165,250,0.06)' : 'transparent',
                    cursor: n.url ? 'pointer' : 'default',
                    transition: 'background .12s',
                  }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = unreadRow ? 'rgba(96,165,250,0.06)' : 'transparent')}
                  >
                    {/* Avatar / icon */}
                    <div style={{ flexShrink: 0, width: 36, height: 36, position: 'relative' }}>
                      {n.actor_avatar_url ? (
                        <Image
                          src={n.actor_avatar_url}
                          alt=""
                          width={36}
                          height={36}
                          style={{ borderRadius: '50%', objectFit: 'cover' }}
                          unoptimized
                        />
                      ) : (
                        <div style={{
                          width: 36, height: 36, borderRadius: '50%',
                          background: 'linear-gradient(135deg, #2563eb, #f97316)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#fff', fontWeight: 800, fontSize: 14,
                        }}>
                          {(n.actor_full_name || n.actor_username || '?').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div style={{
                        position: 'absolute', bottom: -2, right: -2,
                        width: 18, height: 18, borderRadius: '50%',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, lineHeight: 1,
                      }}>
                        {TYPE_ICON[n.type] || '🔔'}
                      </div>
                    </div>

                    {/* Body */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, fontWeight: unreadRow ? 700 : 500,
                        color: 'var(--text-primary)', lineHeight: 1.35, marginBottom: 2,
                      }}>
                        {defaultTitle(n)}
                      </div>
                      {n.snippet && (
                        <div style={{
                          fontSize: 12, color: 'var(--text-secondary)',
                          lineHeight: 1.4, marginBottom: 4,
                          overflow: 'hidden', textOverflow: 'ellipsis',
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                        }}>
                          {n.snippet}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {relTime(n.created_at)}
                      </div>
                    </div>

                    {unreadRow && (
                      <div style={{
                        flexShrink: 0, alignSelf: 'center',
                        width: 8, height: 8, borderRadius: '50%',
                        background: 'var(--accent-orange)',
                      }}/>
                    )}
                  </div>
                )

                if (n.url) {
                  return (
                    <Link key={n.id} href={n.url} onClick={() => onItemClick(n)} style={{ textDecoration: 'none' }}>
                      {inner}
                    </Link>
                  )
                }
                return (
                  <div key={n.id} onClick={() => onItemClick(n)}>
                    {inner}
                  </div>
                )
              })
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: '10px 16px',
            borderTop: '1px solid var(--border-subtle)',
            textAlign: 'center',
          }}>
            <Link
              href="/auth/profile"
              onClick={() => setOpen(false)}
              style={{
                fontSize: 12, fontWeight: 600,
                color: 'var(--text-muted)', textDecoration: 'none',
              }}
            >
              Tvarkyti notification nustatymus
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
