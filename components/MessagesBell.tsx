'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import Image from 'next/image'
import { proxyImg } from '@/lib/img-proxy'
import { useGlobalChatRealtime } from '@/lib/chat-realtime'
import {
  conversationDisplayName,
  conversationDisplayAvatar,
  type ConversationListItem,
} from '@/lib/chat-types'
import { formatSidebarTime } from '@/components/chat/ChatTime'

const POLL_MS = 60_000
const SHOUT_POLL_MS = 12_000

type ShoutMsg = {
  id: number
  author_name: string
  author_avatar: string | null
  body: string
  created_at: string
  user_id: string
}

function strHue(s: string) {
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h
}

function shortAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return 'ką tik'
  if (m < 60) return `${m} min.`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} val.`
  const days = Math.floor(h / 24)
  return `${days} d.`
}

export function MessagesBell() {
  const { data: session, status } = useSession()
  const userId = (session?.user as any)?.id || null
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'personal' | 'general'>('personal')
  const [unread, setUnread] = useState(0)
  const [conversations, setConversations] = useState<ConversationListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [shoutMsgs, setShoutMsgs] = useState<ShoutMsg[]>([])
  const [shoutLoading, setShoutLoading] = useState(false)
  const shoutLoaded = useRef(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Mobile detection — < 600px → renderinam dropdown'ą per portal'ą į
  // document.body, kad backdrop-filter (header) nesukurtų containing block'o
  // Safari'iuje. Anksčiau dropdown'as buvo mounted header'io viduje, todėl
  // mobile Safari'is su header'io backdrop-filter padarydavo dropdown'ą
  // nematomą (bound'inamas prie header'io stacking context).
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 600px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  const isAuth = !!userId

  const fetchUnread = useCallback(async () => {
    if (!isAuth) return
    try {
      const res = await fetch('/api/chat/unread', { cache: 'no-store' })
      const json = await res.json()
      setUnread(json.unread || 0)
    } catch { /* swallow */ }
  }, [isAuth])

  const fetchConversations = useCallback(async () => {
    if (!isAuth) return
    setLoading(true)
    try {
      const res = await fetch('/api/chat/conversations', { cache: 'no-store' })
      const json = await res.json()
      setConversations(json.conversations || [])
      const sum = (json.conversations || []).reduce((acc: number, c: any) => acc + (c.notifications_muted ? 0 : c.unread_count || 0), 0)
      setUnread(sum)
    } finally {
      setLoading(false)
    }
  }, [isAuth])

  useEffect(() => {
    if (!isAuth) return
    fetchUnread()
    const id = setInterval(fetchUnread, POLL_MS)
    return () => clearInterval(id)
  }, [isAuth, fetchUnread])

  // Realtime — atnaujinam unread kai naujos žinutės.
  useGlobalChatRealtime({
    viewerId: userId,
    onAnyNewMessage: () => fetchUnread(),
    onParticipantChange: () => fetchUnread(),
    onConversationChange: () => fetchUnread(),
  })

  // Outside click → close
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const fetchShout = useCallback(async () => {
    setShoutLoading(true)
    try {
      const res = await fetch('/api/live/shoutbox?limit=20', { cache: 'no-store' })
      const json = await res.json()
      setShoutMsgs((json.messages || []).reverse())
      shoutLoaded.current = true
    } finally {
      setShoutLoading(false)
    }
  }, [])

  // Bendrai feed polling — tik kai dropdown atidarytas + general tab'as aktyvus.
  useEffect(() => {
    if (!open || tab !== 'general') return
    fetchShout()
    const id = setInterval(fetchShout, SHOUT_POLL_MS)
    return () => clearInterval(id)
  }, [open, tab, fetchShout])

  const onToggle = () => {
    const next = !open
    setOpen(next)
    if (next) {
      if (tab === 'personal') fetchConversations()
      else if (!shoutLoaded.current) fetchShout()
    }
  }

  if (status !== 'authenticated' || !isAuth) return null

  const iconColor = 'var(--text-muted)'
  const iconHover = 'var(--text-primary)'

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>
      <Link
        href="/pokalbiai"
        aria-label="Žinutės"
        style={{
          width: 34, height: 34,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: 'none', background: 'transparent', cursor: 'pointer',
          color: iconColor, borderRadius: 8, position: 'relative',
          transition: 'color .15s, background .15s',
          textDecoration: 'none',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = iconHover; e.currentTarget.style.background = 'var(--bg-hover)' }}
        onMouseLeave={e => { e.currentTarget.style.color = iconColor; e.currentTarget.style.background = 'transparent' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
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
      </Link>

      {/* DESKTOP dropdown — DISABLED (ikonos paspaudimas dabar veda į /pokalbiai) */}
      {false && open && !isMobile && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          width: 360, maxHeight: 520, overflow: 'hidden',
          background: 'var(--modal-bg)',
          border: '1px solid var(--modal-border)',
          borderRadius: 14,
          boxShadow: 'var(--modal-shadow, 0 10px 40px rgba(0,0,0,0.25))',
          zIndex: 250,
          display: 'flex', flexDirection: 'column',
        }}>
          {renderDropdownContent({
            tab, setTab, isAuth, unread, conversations, loading,
            shoutMsgs, shoutLoading, userId, fetchConversations, fetchShout,
            shoutLoaded, setOpen,
          })}
        </div>
      )}

      {/* MOBILE — fullscreen modal per portal į document.body, kad backdrop-filter
          ant header'io (kuris sukuria containing block) neapribotų position: fixed
          dropdown'o į header'io stacking context'ą Safari'iuje. */}
      {false && open && isMobile && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed', top: 56, left: 0, right: 0, bottom: 0,
            zIndex: 9999, background: 'var(--bg-body)',
            display: 'flex', flexDirection: 'column',
          }}
        >
          {renderDropdownContent({
            tab, setTab, isAuth, unread, conversations, loading,
            shoutMsgs, shoutLoading, userId, fetchConversations, fetchShout,
            shoutLoaded, setOpen,
          })}
        </div>,
        document.body
      )}
    </div>
  )
}

// Helper that renders the shared dropdown content (tabs + list + footer).
// Used by both desktop inline dropdown and mobile portal modal so the markup
// stays in one place.
function renderDropdownContent(p: {
  tab: 'personal' | 'general'
  setTab: (t: 'personal' | 'general') => void
  isAuth: boolean
  unread: number
  conversations: ConversationListItem[]
  loading: boolean
  shoutMsgs: ShoutMsg[]
  shoutLoading: boolean
  userId: string | null
  fetchConversations: () => void
  fetchShout: () => void
  shoutLoaded: { current: boolean }
  setOpen: (v: boolean) => void
}) {
  const {
    tab, setTab, isAuth, unread, conversations, loading,
    shoutMsgs, shoutLoading, userId, fetchConversations, fetchShout,
    shoutLoaded, setOpen,
  } = p
  return (
    <>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        {([
          ['personal', 'Tavo pokalbiai', isAuth ? unread : 0],
          ['general', 'Bendros diskusijos', 0],
        ] as const).map(([k, label, badge]) => {
          const active = tab === k
          return (
            <button
              key={k}
              onClick={() => {
                setTab(k)
                if (k === 'personal' && conversations.length === 0) fetchConversations()
                if (k === 'general' && !shoutLoaded.current) fetchShout()
              }}
              style={{
                flex: 1, padding: '12px 14px',
                border: 'none', background: 'transparent', cursor: 'pointer',
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
                  minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8,
                  background: 'var(--accent-orange)', color: '#fff',
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

      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
        {tab === 'personal' ? (
          loading && conversations.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Kraunasi…</div>
          ) : conversations.length === 0 ? (
            <div style={{ padding: '36px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Pokalbių dar nėra
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Pradėk privačią žinutę arba grupę.
              </div>
            </div>
          ) : (
            conversations.slice(0, 12).map(c => (
              <ConversationRow key={c.id} c={c} viewerId={userId!} onClick={() => setOpen(false)} />
            ))
          )
        ) : (
          shoutLoading && shoutMsgs.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Kraunasi…</div>
          ) : shoutMsgs.length === 0 ? (
            <div style={{ padding: '36px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📣</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Bendra diskusija tyli
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Užsuk į bendruomenę ir įmesk pirmą žinutę.
              </div>
            </div>
          ) : (
            shoutMsgs.slice(-20).map(m => <ShoutRow key={m.id} m={m} />)
          )
        )}
      </div>

      <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-subtle)', textAlign: 'center' }}>
        <Link
          href={tab === 'personal' ? '/pokalbiai' : '/bendruomene'}
          onClick={() => setOpen(false)}
          style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textDecoration: 'none' }}
        >
          {tab === 'personal' ? 'Visi pokalbiai →' : 'Pilna bendruomenė →'}
        </Link>
      </div>
    </>
  )
}

function ShoutRow({ m }: { m: ShoutMsg }) {
  const hue = strHue(m.author_name || '?')
  return (
    <div
      style={{
        display: 'flex', gap: 10, padding: '10px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        transition: 'background .12s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {m.author_avatar ? (
        <Image
          src={proxyImg(m.author_avatar)}
          alt=""
          width={28}
          height={28}
          unoptimized
          style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        />
      ) : (
        <div
          style={{
            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
            background: `hsl(${hue},32%,18%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: `hsl(${hue},48%,55%)`, fontSize: 12, fontWeight: 800,
            fontFamily: 'Outfit, sans-serif',
          }}
        >
          {(m.author_name || '?').charAt(0).toUpperCase()}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', marginBottom: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-link)' }}>{m.author_name}</span>
          <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{shortAgo(m.created_at)}</span>
        </div>
        <p
          style={{
            fontSize: 12.5, color: 'var(--text-secondary)',
            margin: 0, lineHeight: 1.4,
            overflow: 'hidden',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          } as any}
        >
          {m.body}
        </p>
      </div>
    </div>
  )
}

function ConversationRow({ c, viewerId, onClick }: { c: ConversationListItem; viewerId: string; onClick: () => void }) {
  // Defensive: API'as galėtų grąžinti participants kaip undefined jei migracija
  // dar nesusivaidijo arba RPC schema neatitinka. Tegul UI nesugriūna.
  const safe = { ...c, participants: Array.isArray(c.participants) ? c.participants : [] }
  const name = conversationDisplayName(safe, viewerId)
  const url = conversationDisplayAvatar(safe, viewerId)
  const isUnread = (c.unread_count || 0) > 0
  const senderName = c.last_message_user_id === viewerId
    ? 'Tu'
    : safe.participants.find(p => p.user_id === c.last_message_user_id)?.full_name?.split(' ')[0] || ''
  const preview = c.last_message_preview
    ? (senderName ? `${senderName}: ${c.last_message_preview}` : c.last_message_preview)
    : 'Dar nėra žinučių'

  return (
    <Link
      href={`/pokalbiai/${c.id}`}
      onClick={onClick}
      style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
    >
      <div style={{
        display: 'flex', gap: 10, padding: '10px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        background: isUnread ? 'rgba(96,165,250,0.06)' : 'transparent',
        transition: 'background .12s',
      }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={e => (e.currentTarget.style.background = isUnread ? 'rgba(96,165,250,0.06)' : 'transparent')}
      >
        {url ? (
          <Image src={proxyImg(url)} alt="" width={36} height={36} unoptimized
            style={{ borderRadius: c.type === 'group' ? 8 : '50%', objectFit: 'cover', flexShrink: 0 }} />
        ) : (
          <div style={{
            width: 36, height: 36, borderRadius: c.type === 'group' ? 8 : '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, #2563eb, #f97316)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 800, fontSize: 14, lineHeight: 1,
          }}>{(name || '?').charAt(0).toUpperCase()}</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
            <div style={{
              flex: 1, fontSize: 13, fontWeight: isUnread ? 800 : 600,
              color: 'var(--text-primary)',
              overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
            }}>{name}</div>
            <div style={{ fontSize: 10.5, color: isUnread ? 'var(--accent-orange)' : 'var(--text-muted)' }}>
              {formatSidebarTime(c.last_message_at)}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginTop: 2 }}>
            <div style={{
              flex: 1, fontSize: 12,
              color: isUnread ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: isUnread ? 600 : 400,
              overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
            }}>{preview}</div>
            {isUnread && (
              <span style={{
                minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8,
                background: 'var(--accent-orange)', color: '#fff',
                fontSize: 10, fontWeight: 800,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                lineHeight: 1,
              }}>{c.unread_count > 99 ? '99+' : c.unread_count}</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}
