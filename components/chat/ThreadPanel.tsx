'use client'

import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '@/lib/chat-types'
import { MessageItem } from './MessageItem'
import { MessageComposer } from './MessageComposer'

type Props = {
  messageId: number
  conversationId: number
  viewerId: string
  onClose: () => void
}

export function ThreadPanel({ messageId, conversationId, viewerId, onClose }: Props) {
  const [root, setRoot] = useState<ChatMessage | null>(null)
  const [replies, setReplies] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setRoot(null); setReplies([])
    fetch(`/api/chat/messages/${messageId}/thread`).then(r => r.json()).then(json => {
      if (cancelled) return
      if (json.error) return
      setRoot(json.root)
      setReplies(json.replies || [])
    }).finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [messageId])

  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'auto' }), 0)
  }, [replies.length])

  // Realtime — naujos žinutės šitam pokalbiui, filtruojam parent_message_id.
  // Subscribe per pop-up — kanalas tas pats kaip MessagePane'ui (jie abu
  // klauso `chat:conv:<id>` channel'io).
  useEffect(() => {
    const handler = (e: any) => {
      const detail = e?.detail
      if (!detail) return
      if (detail.parent_message_id === messageId) {
        // Reload thread (fetch'inam refresh'inta replies).
        fetch(`/api/chat/messages/${messageId}/thread`).then(r => r.json()).then(json => {
          if (json.error) return
          setRoot(json.root)
          setReplies(json.replies || [])
        })
      }
    }
    window.addEventListener('chat:thread-update', handler)
    return () => window.removeEventListener('chat:thread-update', handler)
  }, [messageId])

  async function send(body: string) {
    const optimistic: ChatMessage = {
      id: Date.now() * -1,
      conversation_id: conversationId,
      user_id: viewerId,
      body,
      parent_message_id: messageId,
      reply_count: 0,
      last_reply_at: null,
      edited_at: null,
      deleted_at: null,
      created_at: new Date().toISOString(),
      pending: true,
      reactions: [],
    }
    setReplies(prev => [...prev, optimistic])
    try {
      const res = await fetch(`/api/chat/messages/${messageId}/thread`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Klaida')
      setReplies(prev => prev.map(r => r === optimistic ? json.message : r))
    } catch (e) {
      setReplies(prev => prev.filter(r => r !== optimistic))
      throw e
    }
  }

  async function toggleReaction(mid: number, emoji: string) {
    setRoot(prev => prev ? toggleLocal(prev, mid, emoji, viewerId) : prev)
    setReplies(prev => prev.map(r => toggleLocal(r, mid, emoji, viewerId)))
    fetch(`/api/chat/messages/${mid}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji }),
    }).catch(() => {})
  }
  async function editMessage(mid: number, body: string) {
    const res = await fetch(`/api/chat/messages/${mid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error)
    if (json.message.id === root?.id) setRoot(json.message)
    else setReplies(prev => prev.map(r => r.id === json.message.id ? json.message : r))
  }
  async function deleteMessage(mid: number) {
    if (mid === root?.id) {
      setRoot(prev => prev ? { ...prev, deleted_at: new Date().toISOString(), body: '' } : prev)
    } else {
      setReplies(prev => prev.map(r => r.id === mid ? { ...r, deleted_at: new Date().toISOString(), body: '' } : r))
    }
    await fetch(`/api/chat/messages/${mid}`, { method: 'DELETE' })
  }

  return (
    <aside style={{
      width: 380, flexShrink: 0,
      borderLeft: '1px solid var(--border-default)',
      background: 'var(--bg-surface)',
      display: 'flex', flexDirection: 'column',
      height: '100%',
    }}>
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid var(--border-default)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>Thread</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {replies.length} {replies.length === 1 ? 'atsakymas' : 'atsakymai'}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Uždaryti"
          style={{
            width: 28, height: 28, borderRadius: 6, border: 'none',
            background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-body)' }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>Kraunasi…</div>
        ) : root ? (
          <>
            <MessageItem
              message={root} viewerId={viewerId} grouped={false}
              onToggleReaction={toggleReaction} onEdit={editMessage} onDelete={deleteMessage}
              threadView
            />
            {replies.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                  {replies.length} {replies.length === 1 ? 'atsakymas' : 'atsakymai'}
                </div>
                <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }}/>
              </div>
            )}
            {replies.map(r => (
              <MessageItem key={r.id} message={r} viewerId={viewerId} grouped={false}
                onToggleReaction={toggleReaction} onEdit={editMessage} onDelete={deleteMessage}
                threadView
              />
            ))}
            <div ref={bottomRef} />
          </>
        ) : (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
            Nepavyko įkelti
          </div>
        )}
      </div>

      <MessageComposer placeholder="Atsakyti į thread'ą…" onSend={send} compact />
    </aside>
  )
}

function toggleLocal(m: ChatMessage, mid: number, emoji: string, viewerId: string): ChatMessage {
  if (m.id !== mid) return m
  const reactions = [...(m.reactions || [])]
  const existing = reactions.find(r => r.emoji === emoji)
  if (existing) {
    if (existing.user_ids.includes(viewerId)) {
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
}
