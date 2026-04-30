'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import Image from 'next/image'
import { useGlobalChatRealtime } from '@/lib/chat-realtime'
import {
  conversationDisplayName,
  conversationDisplayAvatar,
  type ConversationListItem,
} from '@/lib/chat-types'
import { formatSidebarTime } from '@/components/chat/ChatTime'

const POLL_MS = 60_000

export function MessagesBell() {
  const { data: session, status } = useSession()
  const userId = (session?.user as any)?.id || null
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [conversations, setConversations] = useState<ConversationListItem[]>([])
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

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

  const onToggle = () => {
    const next = !open
    setOpen(next)
    if (next) fetchConversations()
  }

  if (status !== 'authenticated' || !isAuth) return null

  const iconColor = 'var(--text-muted)'
  const iconHover = 'var(--text-primary)'

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={onToggle}
        aria-label="Žinutės"
        style={{
          width: 34, height: 34,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: 'none', background: 'transparent', cursor: 'pointer',
          color: iconColor, borderRadius: 8, position: 'relative',
          transition: 'color .15s, background .15s',
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
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0,
            width: 360, maxHeight: 480, overflow: 'hidden',
            background: 'var(--modal-bg)', border: '1px solid var(--modal-border)',
            borderRadius: 14, boxShadow: 'var(--modal-shadow, 0 10px 40px rgba(0,0,0,0.25))',
            zIndex: 250, display: 'flex', flexDirection: 'column',
          }}
        >
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-primary)' }}>
              Žinutės
              {unread > 0 && (
                <span style={{
                  marginLeft: 8, padding: '2px 7px', borderRadius: 10,
                  background: 'rgba(249,115,22,0.15)', color: 'var(--accent-orange)',
                  fontSize: 10, fontWeight: 800,
                }}>{unread} naujos</span>
              )}
            </div>
            <Link href="/pokalbiai" onClick={() => setOpen(false)}
              style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-link)', textDecoration: 'none' }}>
              Atidaryti
            </Link>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading && conversations.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Kraunasi…</div>
            ) : conversations.length === 0 ? (
              <div style={{ padding: '36px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Pokalbių dar nėra
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Pradėk privačią žinutę.
                </div>
              </div>
            ) : (
              conversations.slice(0, 12).map(c => (
                <ConversationRow key={c.id} c={c} viewerId={userId!} onClick={() => setOpen(false)} />
              ))
            )}
          </div>

          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-subtle)', textAlign: 'center' }}>
            <Link href="/pokalbiai" onClick={() => setOpen(false)}
              style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textDecoration: 'none' }}>
              Visi pokalbiai →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

function ConversationRow({ c, viewerId, onClick }: { c: ConversationListItem; viewerId: string; onClick: () => void }) {
  const name = conversationDisplayName(c, viewerId)
  const url = conversationDisplayAvatar(c, viewerId)
  const isUnread = c.unread_count > 0
  const senderName = c.last_message_user_id === viewerId
    ? 'Tu'
    : c.participants.find(p => p.user_id === c.last_message_user_id)?.full_name?.split(' ')[0] || ''
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
          <Image src={url} alt="" width={36} height={36} unoptimized
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
