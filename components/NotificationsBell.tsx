'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import Image from 'next/image'
import { createPortal } from 'react-dom'
import { formatActivityEvent } from '@/lib/activity-logger'

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

type ActivityEvent = {
  id: number
  event_type: string
  actor_name: string | null
  actor_avatar: string | null
  entity_title: string | null
  entity_url: string | null
  metadata: any
  created_at: string
}

const POLL_INTERVAL_MS = 60_000
const ACTIVITY_POLL_INTERVAL_MS = 30_000

/* ── Modernios SVG ikonos (vietoje emoji) ─────────────────────────── */
const SVG = {
  bell: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  ),
  comment: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  reply: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
    </svg>
  ),
  heart: (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  ),
  pencil: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>
    </svg>
  ),
  music: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
    </svg>
  ),
  trophy: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M17 4h3v3a3 3 0 0 1-3 3M7 4H4v3a3 3 0 0 0 3 3"/>
    </svg>
  ),
  star: (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  ),
  album: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  news: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 22h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/>
      <path d="M18 14h-8M15 18h-5M10 6h8v4h-8V6Z"/>
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>
    </svg>
  ),
  sparkle: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>
    </svg>
  ),
  guest: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  empty: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  ),
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  comment_reply: SVG.reply,
  entity_comment: SVG.comment,
  comment_like: SVG.heart,
  blog_like: SVG.heart,
  blog_comment: SVG.pencil,
  favorite_artist_track: SVG.music,
  daily_song_winner: SVG.trophy,
  system: SVG.sparkle,
  guest_signin: SVG.guest,
}

const TYPE_TINT: Record<string, string> = {
  comment_reply: '#3b82f6',
  entity_comment: '#3b82f6',
  comment_like: '#ec4899',
  blog_like: '#ec4899',
  blog_comment: '#8b5cf6',
  favorite_artist_track: '#10b981',
  daily_song_winner: '#eab308',
  system: '#f97316',
  guest_signin: '#f97316',
}

const ACTIVITY_ICON: Record<string, React.ReactNode> = {
  track_like: SVG.heart,
  album_like: SVG.heart,
  artist_like: SVG.star,
  comment: SVG.comment,
  daily_nomination: SVG.music,
  top_vote: SVG.trophy,
  news: SVG.news,
  event_created: SVG.calendar,
  blog_post: SVG.pencil,
}

const ACTIVITY_TINT: Record<string, string> = {
  track_like: '#ec4899',
  album_like: '#ec4899',
  artist_like: '#eab308',
  comment: '#3b82f6',
  daily_nomination: '#10b981',
  top_vote: '#eab308',
  news: '#06b6d4',
  event_created: '#3b82f6',
  blog_post: '#8b5cf6',
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
    case 'comment_like':          return `${who} pamėgo tavo komentarą`
    case 'blog_like':             return `${who} pamėgo tavo įrašą`
    case 'blog_comment':          return `${who} pakomentavo tavo įrašą`
    case 'favorite_artist_track': return `Nauja daina nuo mėgstamo atlikėjo`
    case 'daily_song_winner':     return `Tavo nominacija laimėjo dienos dainą`
    case 'system':                return 'Pranešimas'
    default:                      return 'Naujas pranešimas'
  }
}

// Default notification rodomas neprisijungusiems user'iams. Kviečia
// prisijungti, kad galėtum gauti personalizuotus pranešimus.
const GUEST_NOTIFICATION: Notification = {
  id: -1,
  type: 'guest_signin',
  actor_id: null,
  actor_username: null,
  actor_full_name: null,
  actor_avatar_url: null,
  entity_type: null,
  entity_id: null,
  url: null,
  title: 'Prisijunk, kad gautum savo pranešimus',
  snippet: 'Personalizuoti pranešimai apie mėgstamus atlikėjus, dienos dainos rezultatus, atsakymus į tavo komentarus ir daugiau.',
  data: null,
  read_at: null,
  created_at: new Date().toISOString(),
}

export function NotificationsBell() {
  const { data: session, status } = useSession()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'personal' | 'activity'>('personal')
  const [items, setItems] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const [activity, setActivity] = useState<ActivityEvent[]>([])
  const [activityLoaded, setActivityLoaded] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const isAuth = !!session?.user

  // ── Mobile detection (matches @media (max-width: 600px)) ─────────────
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 600px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  // ── Data fetching ────────────────────────────────────────────────────
  const fetchPersonal = useCallback(async () => {
    if (!isAuth) {
      // Guest user'iams default notification + 1 unread (kad atkreiptume dėmesį).
      setItems([GUEST_NOTIFICATION])
      setUnread(1)
      return
    }
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

  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch('/api/live/activity?limit=40', { cache: 'no-store' })
      if (!res.ok) return
      const json = await res.json()
      setActivity(json.events || [])
      setActivityLoaded(true)
    } catch {
      /* swallow */
    }
  }, [])

  // Polling personal notifications
  useEffect(() => {
    if (status === 'loading') return
    fetchPersonal()
    const id = setInterval(fetchPersonal, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [status, fetchPersonal])

  // Activity feed — pull when modal opens, then poll while open
  useEffect(() => {
    if (!open) return
    if (!activityLoaded) fetchActivity()
    const id = setInterval(fetchActivity, ACTIVITY_POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [open, activityLoaded, fetchActivity])

  // Outside click → close (DESKTOP only — mobile naudoja overlay click)
  useEffect(() => {
    if (!open || isMobile) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, isMobile])

  // Mobile: lock body scroll kai modal open
  useEffect(() => {
    if (!open || !isMobile) return
    const prev = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    return () => { document.documentElement.style.overflow = prev }
  }, [open, isMobile])

  // ESC closes
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const onToggle = async () => {
    const next = !open
    setOpen(next)
    if (next) {
      setLoading(true)
      await Promise.all([fetchPersonal(), activityLoaded ? Promise.resolve() : fetchActivity()])
      setLoading(false)
    }
  }

  const markAllRead = async () => {
    if (!isAuth || unread === 0) return
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
    if (n.id < 0) return // guest pseudo-item — neturi DB row'o
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

  // Status loading (auth dar nesibaigė) — nekrukinam UI'aus, bet rodom bell
  // be badge'o, kad header layout neperšoktinėtų.
  const showBadge = unread > 0

  const bellColor = 'var(--text-muted)'
  const bellHover = 'var(--text-primary)'

  // ── Modal panel content (shared between desktop dropdown & mobile full-screen) ──
  const renderHeader = (showCloseX: boolean) => (
    <div style={{
      padding: '14px 16px',
      borderBottom: '1px solid var(--border-subtle)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 8,
      flexShrink: 0,
    }}>
      <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
        Pranešimai
        {showBadge && (
          <span style={{
            padding: '2px 7px', borderRadius: 10,
            background: 'rgba(249,115,22,0.15)', color: 'var(--accent-orange)',
            fontSize: 10, fontWeight: 800,
          }}>{unread} naujų</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {isAuth && unread > 0 && (
          <button
            onClick={markAllRead}
            style={{
              border: 'none', background: 'transparent',
              color: 'var(--accent-link)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              padding: 0,
            }}
          >
            Pažymėti visus
          </button>
        )}
        {showCloseX && (
          <button
            onClick={() => setOpen(false)}
            aria-label="Uždaryti"
            style={{
              width: 32, height: 32, borderRadius: 8,
              border: 'none', background: 'var(--bg-hover)',
              color: 'var(--text-secondary)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  )

  const renderTabs = () => (
    <div style={{
      display: 'flex',
      borderBottom: '1px solid var(--border-subtle)',
      flexShrink: 0,
    }}>
      {([
        ['personal', 'Asmeniniai', isAuth ? unread : (unread > 0 ? 1 : 0)],
        ['activity', 'Kas vyksta', 0],
      ] as const).map(([k, label, badge]) => {
        const active = tab === k
        return (
          <button
            key={k}
            onClick={() => setTab(k as 'personal' | 'activity')}
            style={{
              flex: 1, padding: '12px 14px',
              border: 'none', background: 'transparent',
              cursor: 'pointer',
              fontSize: 12.5, fontWeight: 700,
              color: active ? 'var(--text-primary)' : 'var(--text-muted)',
              borderBottom: active ? '2px solid var(--accent-orange)' : '2px solid transparent',
              transition: 'color .12s, border-color .12s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {label}
            {badge > 0 && (
              <span style={{
                minWidth: 16, height: 16, padding: '0 4px',
                borderRadius: 8, background: 'var(--accent-orange)', color: '#fff',
                fontSize: 9, fontWeight: 800,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                lineHeight: 1,
              }}>
                {badge > 9 ? '9+' : badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )

  const renderPersonalList = () => {
    if (loading && items.length === 0) {
      return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Kraunasi…</div>
    }
    if (items.length === 0) {
      return (
        <div style={{ padding: '40px 24px', textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48, margin: '0 auto 12px',
            borderRadius: '50%',
            background: 'var(--bg-hover)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-muted)',
          }}>
            <div style={{ width: 24, height: 24 }}>{SVG.bell}</div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
            Pranešimų dar nėra
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
            Čia matysi naujienas apie savo mėgstamus atlikėjus,
            komentarus, patiktukus ir dienos dainos rezultatus.
          </div>
        </div>
      )
    }
    return items.map(n => {
      const unreadRow = !n.read_at
      // Guest pseudo-item — special design su prisijungimo CTA.
      const isGuest = n.id < 0 && n.type === 'guest_signin'
      const inner = (
        <div style={{
          display: 'flex', gap: 12,
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          background: isGuest
            ? 'linear-gradient(135deg, rgba(96,165,250,0.08), rgba(249,115,22,0.08))'
            : (unreadRow ? 'rgba(96,165,250,0.06)' : 'transparent'),
          cursor: (isGuest || n.url) ? 'pointer' : 'default',
          transition: 'background .12s',
        }}
          onMouseEnter={e => { if (!isGuest) e.currentTarget.style.background = 'var(--bg-hover)' }}
          onMouseLeave={e => {
            if (isGuest) return
            e.currentTarget.style.background = unreadRow ? 'rgba(96,165,250,0.06)' : 'transparent'
          }}
        >
          {/* Avatar / icon */}
          <div style={{ flexShrink: 0, width: 38, height: 38, position: 'relative' }}>
            {n.actor_avatar_url ? (
              <Image
                src={n.actor_avatar_url}
                alt=""
                width={38}
                height={38}
                style={{ borderRadius: '50%', objectFit: 'cover' }}
                unoptimized
              />
            ) : (
              <div style={{
                width: 38, height: 38, borderRadius: '50%',
                background: isGuest
                  ? 'linear-gradient(135deg, #f97316, #2563eb)'
                  : 'linear-gradient(135deg, #2563eb, #f97316)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 800, fontSize: 16,
              }}>
                {isGuest
                  ? <div style={{ width: 20, height: 20 }}>{SVG.guest}</div>
                  : (n.actor_full_name || n.actor_username || '?').charAt(0).toUpperCase()}
              </div>
            )}
            {!isGuest && (
              <div style={{
                position: 'absolute', bottom: -2, right: -2,
                width: 20, height: 20, borderRadius: '50%',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: TYPE_TINT[n.type] || 'var(--text-muted)',
              }}>
                <div style={{ width: 12, height: 12 }}>{TYPE_ICON[n.type] || SVG.bell}</div>
              </div>
            )}
          </div>

          {/* Body */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 13.5, fontWeight: unreadRow ? 700 : 500,
              color: 'var(--text-primary)', lineHeight: 1.35, marginBottom: 2,
            }}>
              {defaultTitle(n)}
            </div>
            {n.snippet && (
              <div style={{
                fontSize: 12, color: 'var(--text-secondary)',
                lineHeight: 1.4, marginBottom: 4,
                overflow: 'hidden', textOverflow: 'ellipsis',
                display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
              }}>
                {n.snippet}
              </div>
            )}
            {!isGuest && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {relTime(n.created_at)}
              </div>
            )}
            {isGuest && (
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setOpen(false)
                  // SiteHeader'is turi own auth modal (per HeaderAuth).
                  // Triggering Prisijungti button'ą per click event programmatically
                  // sudėtinga — paprasčiausia route į /auth/signin (next-auth default).
                  window.location.href = '/auth/signin'
                }}
                style={{
                  marginTop: 4,
                  padding: '6px 14px',
                  borderRadius: 999,
                  border: 'none',
                  background: 'var(--accent-orange)',
                  color: '#fff',
                  fontSize: 12, fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Prisijungti
              </button>
            )}
          </div>

          {unreadRow && !isGuest && (
            <div style={{
              flexShrink: 0, alignSelf: 'center',
              width: 8, height: 8, borderRadius: '50%',
              background: 'var(--accent-orange)',
            }}/>
          )}
        </div>
      )

      if (isGuest) {
        return <div key={n.id}>{inner}</div>
      }
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
  }

  const renderActivityList = () => {
    if (!activityLoaded) {
      return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Kraunasi…</div>
    }
    if (activity.length === 0) {
      return (
        <div style={{ padding: '40px 24px', textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48, margin: '0 auto 12px',
            borderRadius: '50%',
            background: 'var(--bg-hover)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-muted)',
          }}>
            <div style={{ width: 22, height: 22 }}>{SVG.sparkle}</div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
            Veiklos kol kas nėra
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
            Kai kažkas pakomentuos, pamėgs ar paskelbs naujieną — pamatysi čia.
          </div>
        </div>
      )
    }
    return activity.map(ev => {
      const { text, url } = formatActivityEvent(ev)
      const icon = ACTIVITY_ICON[ev.event_type] || SVG.bell
      const tint = ACTIVITY_TINT[ev.event_type] || 'var(--text-muted)'
      const inner = (
        <div style={{
          display: 'flex', gap: 12,
          padding: '11px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          cursor: url ? 'pointer' : 'default',
          transition: 'background .12s',
          alignItems: 'flex-start',
        }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          {ev.actor_avatar ? (
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <Image
                src={ev.actor_avatar}
                alt=""
                width={32}
                height={32}
                style={{ borderRadius: '50%', objectFit: 'cover' }}
                unoptimized
              />
              <div style={{
                position: 'absolute', bottom: -2, right: -2,
                width: 16, height: 16, borderRadius: '50%',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: tint,
              }}>
                <div style={{ width: 10, height: 10 }}>{icon}</div>
              </div>
            </div>
          ) : (
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'var(--bg-hover)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              color: tint,
            }}>
              <div style={{ width: 14, height: 14 }}>{icon}</div>
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 13, color: 'var(--text-primary)',
              lineHeight: 1.4, marginBottom: 2,
              overflow: 'hidden', textOverflow: 'ellipsis',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            }}>{text}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{relTime(ev.created_at)}</div>
          </div>
        </div>
      )
      if (url) {
        return (
          <Link key={ev.id} href={url} onClick={() => setOpen(false)} style={{ textDecoration: 'none' }}>
            {inner}
          </Link>
        )
      }
      return <div key={ev.id}>{inner}</div>
    })
  }

  const renderFooter = () => (
    <div style={{
      padding: '10px 16px',
      borderTop: '1px solid var(--border-subtle)',
      textAlign: 'center',
      flexShrink: 0,
    }}>
      <Link
        href={isAuth ? '/auth/profile/pranesimai' : '/auth/signin'}
        onClick={() => setOpen(false)}
        style={{
          fontSize: 12, fontWeight: 600,
          color: 'var(--text-muted)', textDecoration: 'none',
        }}
      >
        {isAuth ? 'Tvarkyti pranešimų nustatymus' : 'Prisijungti svetainėje'}
      </Link>
    </div>
  )

  // ── Mobile full-screen modal (rendered via portal) ──────────────────
  const mobileModal = open && isMobile && typeof document !== 'undefined' ? createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'var(--bg-body)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {renderHeader(true)}
      {renderTabs()}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {tab === 'personal' ? renderPersonalList() : renderActivityList()}
      </div>
      {renderFooter()}
    </div>,
    document.body
  ) : null

  // ── Desktop dropdown ────────────────────────────────────────────────
  const desktopDropdown = open && !isMobile ? (
    <div
      style={{
        position: 'absolute', top: 'calc(100% + 8px)', right: 0,
        width: 380, maxHeight: 540, overflow: 'hidden',
        background: 'var(--modal-bg)', border: '1px solid var(--modal-border)',
        borderRadius: 14, boxShadow: 'var(--modal-shadow, 0 10px 40px rgba(0,0,0,0.25))',
        zIndex: 250,
        display: 'flex', flexDirection: 'column',
      }}
    >
      {renderHeader(false)}
      {renderTabs()}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {tab === 'personal' ? renderPersonalList() : renderActivityList()}
      </div>
      {renderFooter()}
    </div>
  ) : null

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
        {showBadge && (
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

      {desktopDropdown}
      {mobileModal}
    </div>
  )
}
