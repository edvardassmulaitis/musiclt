'use client'

// DiscussionChatLayout — kompozicija /pokalbiai/d/[slug] page'ui.
// Identiškas ChatLayout sidebar'as (DM/grupių sąrašas + tabs), bet pane'as
// rodo diskusiją kaip chat'ą:
//   - Header: temos pavadinimas + body (kaip pinned žinutė)
//   - Žinutės: komentarai sumapinti į ChatMessage shape
//   - Composer: post'ina /api/comments su entity_type='discussion'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { ConversationListItem, ChatMessage } from '@/lib/chat-types'
import { ConversationSidebar, type DiscussionItem, type SidebarTab } from './ConversationSidebar'
import { MessageItem } from './MessageItem'
import { MessageComposer } from './MessageComposer'
import { ChatAvatar } from './ChatAvatar'
import { formatDateSeparator, shouldGroup, shouldShowDateSep } from './ChatTime'

const MOBILE_BREAKPOINT = 768

type DiscussionRow = {
  id: number
  slug: string
  title: string
  body: string | null
  user_id: string | null
  author_name: string | null
  author_avatar: string | null
  tags: string[] | null
  is_locked: boolean
  comment_count: number
  created_at: string
}

type CommentRow = {
  id: number
  parent_id: number | null
  author_id: string | null
  body: string
  like_count: number
  is_deleted: boolean
  created_at: string
  updated_at: string
  profiles?: {
    username: string | null
    full_name: string | null
    avatar_url: string | null
    email: string | null
  } | null
}

type Props = {
  viewerId: string
  initialConversations: ConversationListItem[]
  discussion: DiscussionRow
  initialComments: CommentRow[]
}

export function DiscussionChatLayout({ viewerId, initialConversations, discussion, initialComments }: Props) {
  const router = useRouter()
  const [conversations] = useState(initialConversations)
  const [discussions, setDiscussions] = useState<DiscussionItem[]>([])
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('discussions')

  useEffect(() => {
    try {
      const saved = localStorage.getItem('chat:sidebarTab')
      if (saved === 'private' || saved === 'discussions') setSidebarTab(saved)
    } catch {}
  }, [])
  useEffect(() => {
    try { localStorage.setItem('chat:sidebarTab', sidebarTab) } catch {}
  }, [sidebarTab])

  // Discussions list for sidebar.
  useEffect(() => {
    let cancelled = false
    fetch('/api/chat/my-discussions').then(r => r.json()).then(json => {
      if (cancelled) return
      setDiscussions(json.discussions || [])
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Mobile detection.
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  // Mobile aktyvi diskusija → 'detail' view'as. Mobile back → /pokalbiai.
  const sidebarStyle: React.CSSProperties = isMobile
    ? { display: 'none' }
    : { width: 300, flexShrink: 0, height: '100%', display: 'flex' }
  const paneStyle: React.CSSProperties = {
    flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column',
  }

  return (
    <div style={{
      display: 'flex',
      height: 'calc(100vh - 56px)',
      background: 'var(--bg-body)',
      overflow: 'hidden',
    }}>
      <div style={sidebarStyle}>
        <ConversationSidebar
          viewerId={viewerId}
          conversations={conversations}
          discussions={discussions}
          activeId={null}
          onNewConversation={() => router.push('/pokalbiai')}
          tab={sidebarTab}
          onTabChange={(t) => { setSidebarTab(t); router.push('/pokalbiai') }}
        />
      </div>
      <div style={paneStyle}>
        <DiscussionPane
          viewerId={viewerId}
          discussion={discussion}
          initialComments={initialComments}
          onMobileBack={() => router.push('/pokalbiai')}
        />
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// DiscussionPane — chat-style render of discussion + comments
// ────────────────────────────────────────────────────────────────────

function DiscussionPane({
  viewerId, discussion, initialComments, onMobileBack,
}: {
  viewerId: string
  discussion: DiscussionRow
  initialComments: CommentRow[]
  onMobileBack: () => void
}) {
  const [comments, setComments] = useState<CommentRow[]>(initialComments)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Convert Comment → ChatMessage shape.
  const messages: ChatMessage[] = useMemo(() => {
    return comments
      .filter(c => !c.is_deleted)
      .map(c => ({
        id: c.id,
        conversation_id: discussion.id,
        user_id: c.author_id || '',
        body: c.body,
        parent_message_id: c.parent_id,
        reply_count: 0,
        last_reply_at: null,
        edited_at: c.updated_at && c.updated_at !== c.created_at ? c.updated_at : null,
        deleted_at: null,
        created_at: c.created_at,
        author: c.author_id ? {
          id: c.author_id,
          username: c.profiles?.username || null,
          full_name: c.profiles?.full_name || c.profiles?.username || 'Vartotojas',
          avatar_url: c.profiles?.avatar_url || null,
        } : undefined,
        reactions: [],
      }))
  }, [comments, discussion.id])

  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'auto' }), 0)
  }, [discussion.id])

  // Polling refresh — kas 8s pasitikrinam ar atsirado naujų komentarų.
  // (Realtime ant comments nepublikuotas, todėl polling.)
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/comments?entity_type=discussion&entity_id=${discussion.id}&sort=oldest&limit=200`, { cache: 'no-store' })
        const json = await res.json()
        if (Array.isArray(json.comments)) setComments(json.comments)
      } catch {}
    }, 8000)
    return () => clearInterval(id)
  }, [discussion.id])

  async function send(body: string) {
    const tempId = -Date.now()
    const optimistic: CommentRow = {
      id: tempId,
      parent_id: null,
      author_id: viewerId,
      body,
      like_count: 0,
      is_deleted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      profiles: null,
    }
    setComments(prev => [...prev, optimistic])
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 30)

    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: 'discussion',
          entity_id: discussion.id,
          text: body,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Klaida')
      // Refresh full list (response shape varies).
      const listRes = await fetch(`/api/comments?entity_type=discussion&entity_id=${discussion.id}&sort=oldest&limit=200`, { cache: 'no-store' })
      const listJson = await listRes.json()
      if (Array.isArray(listJson.comments)) setComments(listJson.comments)
    } catch (e: any) {
      setComments(prev => prev.filter(c => c.id !== tempId))
      throw e
    }
  }

  // Build display rows with date separators.
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

  async function noopReaction() { /* reactions not supported on discussion comments yet */ }
  async function noopEdit() { throw new Error('Komentarų redagavimas — / per /diskusijos puslapį') }
  async function noopDelete() { throw new Error('Komentarų trynimas — per /diskusijos puslapį') }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%' }}>
      {/* Header — diskusijos info */}
      <DiscussionHeader discussion={discussion} onMobileBack={onMobileBack} />

      <div ref={scrollerRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', background: 'var(--bg-body)' }}>
        {/* Body kaip "pinned" pirmas pranešimas */}
        <DiscussionRoot discussion={discussion} />

        {messages.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 38, marginBottom: 8 }}>💬</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
              Dar nėra atsakymų
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Parašyk pirmą atsakymą diskusijai.
            </div>
          </div>
        ) : (
          <div style={{ paddingTop: 8, paddingBottom: 8 }}>
            {rows.map((r, i) => r.kind === 'sep' ? (
              <DateSep key={`sep-${i}`} label={r.date} />
            ) : (
              <MessageItem
                key={r.m.id}
                message={r.m}
                viewerId={viewerId}
                grouped={r.grouped}
                onToggleReaction={noopReaction}
                onEdit={noopEdit}
                onDelete={noopDelete}
              />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {discussion.is_locked ? (
        <div style={{ padding: '14px 16px', background: 'var(--bg-surface)', borderTop: '1px solid var(--border-default)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          🔒 Diskusija užrakinta — naujų komentarų rašyti negalima.
        </div>
      ) : (
        <MessageComposer placeholder="Atsakyti į diskusiją…" onSend={send} />
      )}
    </div>
  )
}

function DiscussionHeader({ discussion, onMobileBack }: { discussion: DiscussionRow; onMobileBack: () => void }) {
  return (
    <div style={{
      flexShrink: 0,
      borderBottom: '1px solid var(--border-default)',
      padding: '10px 16px',
      display: 'flex', alignItems: 'center', gap: 12,
      background: 'var(--bg-surface)',
    }}>
      <button
        onClick={onMobileBack}
        aria-label="Atgal"
        className="chat-mobile-back-btn"
        style={{
          // Visada matomas šitam page — svarbu, nes nėra kitos navigacijos
          display: 'inline-flex', width: 32, height: 32, borderRadius: 8,
          border: 'none', background: 'transparent', color: 'var(--text-secondary)',
          cursor: 'pointer', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <div style={{
        width: 36, height: 36, flexShrink: 0,
        borderRadius: 8,
        background: 'rgba(139, 92, 246, 0.18)',
        border: '1px solid rgba(139, 92, 246, 0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#c4b5fd',
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 8h2a2 2 0 0 1 2 2v9l-3-3h-7a2 2 0 0 1-2-2v-1"/>
          <path d="M3 13V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6l-3 3Z"/>
        </svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14.5, fontWeight: 800, color: 'var(--text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {discussion.title}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
          Diskusija · {discussion.comment_count} {discussion.comment_count === 1 ? 'atsakymas' : 'atsakymai'}
        </div>
      </div>
      <Link href={`/diskusijos/${discussion.slug}`}
        style={{
          fontSize: 11, color: 'var(--text-muted)', textDecoration: 'none',
          padding: '5px 10px', borderRadius: 6,
          border: '1px solid var(--border-default)',
        }}
        title="Atidaryti pilną diskusijos puslapį"
      >
        Forumo puslapis →
      </Link>
    </div>
  )
}

function DiscussionRoot({ discussion }: { discussion: DiscussionRow }) {
  return (
    <div style={{
      margin: '12px 16px',
      padding: 14,
      borderRadius: 12,
      background: 'rgba(139, 92, 246, 0.06)',
      border: '1px solid rgba(139, 92, 246, 0.25)',
    }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
        <ChatAvatar url={discussion.author_avatar} fallbackName={discussion.author_name} size={28} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
            {discussion.author_name || 'Anonimas'}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
            Diskusijos pradžia
          </div>
        </div>
      </div>
      {discussion.body && (
        <div style={{
          fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.5,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {discussion.body}
        </div>
      )}
      {discussion.tags && discussion.tags.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {discussion.tags.map((t, i) => (
            <span key={i} style={{
              fontSize: 10, padding: '2px 7px', borderRadius: 4,
              background: 'rgba(139, 92, 246, 0.18)', color: '#c4b5fd',
              textTransform: 'lowercase',
            }}>#{t}</span>
          ))}
        </div>
      )}
    </div>
  )
}

function DateSep({ label }: { label: string }) {
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
