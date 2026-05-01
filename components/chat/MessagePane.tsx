'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChatMessage, ConversationDetail } from '@/lib/chat-types'
import { MessageItem } from './MessageItem'
import { MessageComposer } from './MessageComposer'
import { useConversationRealtime } from '@/lib/chat-realtime'
import { ChatAvatar, ChatGroupAvatar } from './ChatAvatar'
import { formatDateSeparator, shouldGroup, shouldShowDateSep } from './ChatTime'

type Props = {
  conversation: ConversationDetail
  viewerId: string
  initialMessages: ChatMessage[]
  onOpenThread: (messageId: number) => void
  onOpenSettings: () => void
  onMobileBack?: () => void
}

export function MessagePane({ conversation, viewerId, initialMessages, onOpenThread, onOpenSettings, onMobileBack }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(initialMessages.length >= 50)
  const [typingUsers, setTypingUsers] = useState<Map<string, { name: string; ts: number }>>(new Map())
  const scrollerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)

  // Reset state kai keičiasi pokalbis.
  useEffect(() => {
    setMessages(initialMessages)
    setHasMore(initialMessages.length >= 50)
    setTypingUsers(new Map())
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'auto' }), 0)
  }, [conversation.id, initialMessages])

  // Stebim ar user'is yra apačioje (auto-scroll only when at bottom).
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      isAtBottomRef.current = atBottom
    }
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Realtime — naujos žinutės šitam pokalbiui.
  const handleInsert = useCallback(async (row: any) => {
    if (row.parent_message_id) {
      // Thread reply — bumpinam parent reply_count viewer'iui.
      setMessages(prev => prev.map(m => m.id === row.parent_message_id
        ? { ...m, reply_count: (m.reply_count || 0) + 1, last_reply_at: row.created_at }
        : m))
      return
    }
    // Top-level — fetch'inam pilną hydratuotą message (su author + reactions).
    try {
      const res = await fetch(`/api/chat/conversations/${conversation.id}/messages?before=${row.id + 1}&limit=1`)
      if (!res.ok) return
      const json = await res.json()
      const msg = json.messages?.[0]
      if (!msg) return
      setMessages(prev => {
        // Jei jau yra (optimistic) — pakeičiam.
        if (prev.some(m => m.id === msg.id)) return prev
        // Pakeičiam optimistinį (pending) jei buvo iš to paties autoriaus su tuo pačiu body.
        const optimisticIdx = prev.findIndex(m => m.pending && m.user_id === msg.user_id && m.body === msg.body)
        if (optimisticIdx >= 0) {
          const next = [...prev]
          next[optimisticIdx] = msg
          return next
        }
        return [...prev, msg]
      })
      if (isAtBottomRef.current) {
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      }
      // Mark as read (ne sender'iui).
      if (row.user_id !== viewerId) {
        fetch(`/api/chat/conversations/${conversation.id}/read`, { method: 'POST' }).catch(() => {})
      }
    } catch { /* noop */ }
  }, [conversation.id, viewerId])

  const handleUpdate = useCallback((row: any) => {
    setMessages(prev => prev.map(m => m.id === row.id ? {
      ...m,
      body: row.deleted_at ? '' : row.body,
      edited_at: row.edited_at,
      deleted_at: row.deleted_at,
      reply_count: row.reply_count ?? m.reply_count,
      last_reply_at: row.last_reply_at ?? m.last_reply_at,
    } : m))
  }, [])

  const handleDelete = useCallback((row: any) => {
    setMessages(prev => prev.filter(m => m.id !== row.id))
  }, [])

  const handleReactionChange = useCallback(async (row: any, _kind: 'INSERT' | 'DELETE') => {
    // Re-fetch'inam reakcijas šitai vienai žinutei. Galima optimizuoti — bet
    // greitai atvyks postgres_changes ir kitiems klientams, o GET /reactions
    // nėra (pagal default reactions yra atached prie message GET'o). Vietoj
    // refetch'o, pataisom lokaliai.
    const messageId = row.message_id
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m
      const reactions = [...(m.reactions || [])]
      const existing = reactions.find(r => r.emoji === row.emoji)
      if (_kind === 'INSERT') {
        if (existing) {
          if (!existing.user_ids.includes(row.user_id)) {
            existing.user_ids = [...existing.user_ids, row.user_id]
            existing.count = existing.user_ids.length
          }
        } else {
          reactions.push({ emoji: row.emoji, count: 1, user_ids: [row.user_id] })
        }
      } else {
        if (existing) {
          existing.user_ids = existing.user_ids.filter(uid => uid !== row.user_id)
          existing.count = existing.user_ids.length
          if (existing.count === 0) {
            const idx = reactions.indexOf(existing)
            reactions.splice(idx, 1)
          }
        }
      }
      return { ...m, reactions }
    }))
  }, [])

  const handleTyping = useCallback((userId: string, name: string) => {
    setTypingUsers(prev => {
      const next = new Map(prev)
      next.set(userId, { name, ts: Date.now() })
      return next
    })
  }, [])

  // Auto-cleanup typing >4s old.
  useEffect(() => {
    const id = setInterval(() => {
      setTypingUsers(prev => {
        const now = Date.now()
        const next = new Map<string, { name: string; ts: number }>()
        for (const [uid, v] of prev.entries()) {
          if (now - v.ts < 4000) next.set(uid, v)
        }
        return next.size === prev.size ? prev : next
      })
    }, 1500)
    return () => clearInterval(id)
  }, [])

  const { broadcastTyping } = useConversationRealtime({
    conversationId: conversation.id,
    viewerId,
    onInsert: handleInsert,
    onUpdate: handleUpdate,
    onDelete: handleDelete,
    onReactionChange: handleReactionChange,
    onTyping: handleTyping,
  })

  // Mark read on initial load.
  useEffect(() => {
    fetch(`/api/chat/conversations/${conversation.id}/read`, { method: 'POST' }).catch(() => {})
  }, [conversation.id])

  async function loadMore() {
    if (loadingMore || !hasMore || messages.length === 0) return
    setLoadingMore(true)
    const oldest = messages[0]
    try {
      const res = await fetch(`/api/chat/conversations/${conversation.id}/messages?before=${oldest.id}`)
      const json = await res.json()
      const older: ChatMessage[] = json.messages || []
      if (older.length === 0) setHasMore(false)
      else setMessages(prev => [...older, ...prev])
    } finally {
      setLoadingMore(false)
    }
  }

  // Infinite scroll up — kai user'is scroll'ina iki viršaus.
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const onScroll = () => {
      if (el.scrollTop < 60 && !loadingMore && hasMore) {
        const prevHeight = el.scrollHeight
        loadMore().then(() => {
          requestAnimationFrame(() => {
            const diff = el.scrollHeight - prevHeight
            el.scrollTop = diff
          })
        })
      }
    }
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingMore, hasMore, messages])

  async function send(body: string) {
    // Optimistinis update'as.
    const optimistic: ChatMessage = {
      id: Date.now() * -1,
      conversation_id: conversation.id,
      user_id: viewerId,
      body,
      parent_message_id: null,
      reply_count: 0,
      last_reply_at: null,
      edited_at: null,
      deleted_at: null,
      created_at: new Date().toISOString(),
      // Pasiimam viewer'io profile iš conversation.participants — taip
      // optimistinė žinutė iš karto rodo realų vardą + avatarą, ne 'Tu'/null.
      author: (() => {
        const viewerProfile = conversation.participants.find(p => p.user_id === viewerId)?.profile
        return {
          id: viewerId,
          username: viewerProfile?.username || null,
          full_name: viewerProfile?.full_name || viewerProfile?.username || 'Tu',
          avatar_url: viewerProfile?.avatar_url || null,
        }
      })(),
      reactions: [],
      pending: true,
    }
    setMessages(prev => [...prev, optimistic])
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 30)

    try {
      const res = await fetch(`/api/chat/conversations/${conversation.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Klaida')
      const real: ChatMessage = json.message
      setMessages(prev => prev.map(m => m === optimistic ? real : m))
    } catch (e: any) {
      setMessages(prev => prev.filter(m => m !== optimistic))
      throw e
    }
  }

  async function toggleReaction(messageId: number, emoji: string) {
    // Optimistic — server vis tiek atsiųs realtime update.
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m
      const reactions = [...(m.reactions || [])]
      const existing = reactions.find(r => r.emoji === emoji)
      if (existing) {
        const mine = existing.user_ids.includes(viewerId)
        if (mine) {
          existing.user_ids = existing.user_ids.filter(u => u !== viewerId)
          existing.count = existing.user_ids.length
          if (existing.count === 0) reactions.splice(reactions.indexOf(existing), 1)
        } else {
          existing.user_ids = [...existing.user_ids, viewerId]
          existing.count = existing.user_ids.length
        }
      } else {
        reactions.push({ emoji, count: 1, user_ids: [viewerId] })
      }
      return { ...m, reactions }
    }))
    try {
      await fetch(`/api/chat/messages/${messageId}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      })
    } catch { /* realtime atstatys */ }
  }

  async function editMessage(messageId: number, newBody: string) {
    const res = await fetch(`/api/chat/messages/${messageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: newBody }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      throw new Error(json.error || 'Nepavyko redaguoti')
    }
  }

  async function deleteMessage(messageId: number) {
    setMessages(prev => prev.map(m => m.id === messageId
      ? { ...m, deleted_at: new Date().toISOString(), body: '' }
      : m))
    await fetch(`/api/chat/messages/${messageId}`, { method: 'DELETE' })
  }

  // Build display rows with date separators
  const rows = useMemo(() => {
    const out: Array<{ kind: 'sep'; date: string } | { kind: 'msg'; m: ChatMessage; grouped: boolean }> = []
    let prev: ChatMessage | null = null
    for (const m of messages) {
      if (shouldShowDateSep(prev, m)) out.push({ kind: 'sep', date: formatDateSeparator(m.created_at) })
      out.push({ kind: 'msg', m, grouped: !shouldShowDateSep(prev, m) && shouldGroup(prev, m) })
      prev = m
    }
    return out
  }, [messages])

  const meName = conversation.participants.find(p => p.user_id === viewerId)?.profile?.full_name?.split(' ')[0] || 'Tu'
  const typingArr = Array.from(typingUsers.values()).map(t => t.name).filter(Boolean)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%' }}>
      <ConversationHeader conversation={conversation} viewerId={viewerId} onOpenSettings={onOpenSettings} onMobileBack={onMobileBack} />

      {/* Messages scroller */}
      <div
        ref={scrollerRef}
        style={{
          flex: 1, overflowY: 'auto', overflowX: 'hidden',
          background: 'var(--bg-body)',
        }}
      >
        {loadingMore && (
          <div style={{ padding: 12, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
            Kraunama daugiau…
          </div>
        )}

        {messages.length === 0 ? (
          <div style={{ padding: '60px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 38, marginBottom: 8 }}>👋</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
              Pradėkite pokalbį
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Parašykite pirmą žinutę.
            </div>
          </div>
        ) : (
          <div style={{ paddingTop: 8, paddingBottom: 8 }}>
            {rows.map((r, i) => r.kind === 'sep' ? (
              <DateSeparator key={`sep-${i}`} label={r.date} />
            ) : (
              <MessageItem
                key={r.m.id}
                message={r.m}
                viewerId={viewerId}
                grouped={r.grouped}
                onOpenThread={onOpenThread}
                onToggleReaction={toggleReaction}
                onEdit={editMessage}
                onDelete={deleteMessage}
              />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Typing indicator */}
      {typingArr.length > 0 && (
        <div style={{ padding: '4px 16px 0', fontSize: 11.5, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          {typingArr.length === 1
            ? `${typingArr[0]} rašo…`
            : typingArr.length === 2
              ? `${typingArr[0]} ir ${typingArr[1]} rašo…`
              : `${typingArr.length} žmonių rašo…`}
        </div>
      )}

      <MessageComposer
        placeholder={conversation.type === 'group'
          ? `Žinutė grupei ${conversation.name || ''}`.trim() + '…'
          : 'Žinutė…'}
        onSend={send}
        onTyping={() => broadcastTyping(meName)}
      />
    </div>
  )
}

function DateSeparator({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px 6px' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }}/>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </div>
      <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }}/>
    </div>
  )
}

function ConversationHeader({ conversation, viewerId, onOpenSettings, onMobileBack }: { conversation: ConversationDetail; viewerId: string; onOpenSettings: () => void; onMobileBack?: () => void }) {
  const isGroup = conversation.type === 'group'
  const others = conversation.participants.filter(p => p.user_id !== viewerId && !p.left_at)
  const dmOther = others[0]?.profile

  const title = isGroup
    ? (conversation.name || 'Grupė be pavadinimo')
    : (dmOther?.full_name || dmOther?.username || 'Pokalbis')

  const subtitle = isGroup
    ? `${conversation.participants.filter(p => !p.left_at).length} dalyvių${conversation.topic ? ` · ${conversation.topic}` : ''}`
    : (dmOther?.username ? `@${dmOther.username}` : '')

  return (
    <div style={{
      flexShrink: 0,
      borderBottom: '1px solid var(--border-default)',
      padding: '10px 16px',
      display: 'flex', alignItems: 'center', gap: 12,
      background: 'var(--bg-surface)',
    }}>
      {/* Mobile back button — matomas tik mobile (per CSS klasę chat-mobile-back-btn) */}
      {onMobileBack && (
        <button
          onClick={onMobileBack}
          aria-label="Atgal į pokalbių sąrašą"
          className="chat-mobile-back-btn"
          style={{
            display: 'none', width: 32, height: 32, borderRadius: 8,
            border: 'none', background: 'transparent', color: 'var(--text-secondary)',
            cursor: 'pointer', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
      )}
      {isGroup
        ? (conversation.photo_url
            ? <ChatAvatar url={conversation.photo_url} fallbackName={title} size={36} square />
            : <ChatGroupAvatar participants={others.map(p => ({ avatar_url: p.profile?.avatar_url || null, full_name: p.profile?.full_name || null, username: p.profile?.username || null }))} size={36} />)
        : <ChatAvatar url={dmOther?.avatar_url || null} fallbackName={title} size={36} />}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {subtitle}
          </div>
        )}
      </div>

      <button
        onClick={onOpenSettings}
        aria-label="Nustatymai"
        style={{
          width: 32, height: 32, borderRadius: 8, border: 'none',
          background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>
        </svg>
      </button>
    </div>
  )
}
