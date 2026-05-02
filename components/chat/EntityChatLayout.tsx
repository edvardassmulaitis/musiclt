'use client'

// EntityChatLayout — generic chat-style komentarų view'as bet kokio entity
// (track/album/news/event) komentarams. Identiškas DiscussionChatLayout
// struktūrai, tik fetch'ina iš /api/comments?entity_type=<type> vietoj
// discussion API'jos.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { ConversationListItem, ChatMessage } from '@/lib/chat-types'
import { ConversationSidebar, type DiscussionItem, type SidebarTab } from './ConversationSidebar'
import { MessageItem } from './MessageItem'
import { MessageComposer } from './MessageComposer'
import { ChatAvatar } from './ChatAvatar'
import { formatDateSeparator, shouldGroup, shouldShowDateSep } from './ChatTime'
import { proxyImg } from '@/lib/img-proxy'

const MOBILE_BREAKPOINT = 768

type EntityType = 'track' | 'album' | 'news' | 'event'

type EntityMeta = {
  id: number
  title: string
  subtitle: string
  image_url: string | null
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
  entityType: EntityType
  entity: EntityMeta
  entityFullUrl: string
  initialComments: CommentRow[]
}

const TYPE_LABEL: Record<EntityType, string> = {
  track: 'Daina',
  album: 'Albumas',
  news: 'Naujiena',
  event: 'Renginys',
}

export function EntityChatLayout({
  viewerId, initialConversations, entityType, entity, entityFullUrl, initialComments,
}: Props) {
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

  useEffect(() => {
    let cancelled = false
    fetch('/api/chat/my-discussions').then(r => r.json()).then(json => {
      if (cancelled) return
      setDiscussions(json.discussions || [])
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

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
        <EntityPane
          viewerId={viewerId}
          entityType={entityType}
          entity={entity}
          entityFullUrl={entityFullUrl}
          initialComments={initialComments}
          onMobileBack={() => router.push('/pokalbiai')}
        />
      </div>
    </div>
  )
}

function EntityPane({
  viewerId, entityType, entity, entityFullUrl, initialComments, onMobileBack,
}: {
  viewerId: string
  entityType: EntityType
  entity: EntityMeta
  entityFullUrl: string
  initialComments: CommentRow[]
  onMobileBack: () => void
}) {
  const [comments, setComments] = useState<CommentRow[]>(initialComments)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const messages: ChatMessage[] = useMemo(() => {
    return comments.filter(c => !c.is_deleted).map(c => ({
      id: c.id,
      conversation_id: entity.id,
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
  }, [comments, entity.id])

  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'auto' }), 0)
  }, [entity.id])

  // Polling refresh — kas 8s.
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/comments?entity_type=${entityType}&entity_id=${entity.id}&sort=oldest&limit=200`, { cache: 'no-store' })
        const json = await res.json()
        if (Array.isArray(json.comments)) setComments(json.comments)
      } catch {}
    }, 8000)
    return () => clearInterval(id)
  }, [entityType, entity.id])

  async function send(body: string) {
    const tempId = -Date.now()
    const optimistic: CommentRow = {
      id: tempId, parent_id: null, author_id: viewerId,
      body, like_count: 0, is_deleted: false,
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
        body: JSON.stringify({ entity_type: entityType, entity_id: entity.id, text: body }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Klaida')
      const listRes = await fetch(`/api/comments?entity_type=${entityType}&entity_id=${entity.id}&sort=oldest&limit=200`, { cache: 'no-store' })
      const listJson = await listRes.json()
      if (Array.isArray(listJson.comments)) setComments(listJson.comments)
    } catch (e: any) {
      setComments(prev => prev.filter(c => c.id !== tempId))
      throw e
    }
  }

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

  async function noopReaction() {}
  async function noopEdit() { throw new Error('Komentarų redagavimas — per pilną entity puslapį') }
  async function noopDelete() { throw new Error('Komentarų trynimas — per pilną entity puslapį') }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%' }}>
      <EntityHeader entityType={entityType} entity={entity} entityFullUrl={entityFullUrl} onMobileBack={onMobileBack} />

      <div ref={scrollerRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', background: 'var(--bg-body)' }}>
        <EntityRoot entityType={entityType} entity={entity} entityFullUrl={entityFullUrl} />

        {messages.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 38, marginBottom: 8 }}>💬</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
              Dar nėra komentarų
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Parašyk pirmą komentarą.
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

      <MessageComposer placeholder={`Komentaras prie ${TYPE_LABEL[entityType].toLowerCase()}…`} onSend={send} />
    </div>
  )
}

function EntityHeader({
  entityType, entity, entityFullUrl, onMobileBack,
}: {
  entityType: EntityType
  entity: EntityMeta
  entityFullUrl: string
  onMobileBack: () => void
}) {
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
        style={{
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
      {entity.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={proxyImg(entity.image_url)}
          alt=""
          style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border-default)' }}
        />
      ) : (
        <ChatAvatar url={null} fallbackName={entity.title} size={36} square />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14.5, fontWeight: 800, color: 'var(--text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {entity.title}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
          {TYPE_LABEL[entityType]}{entity.subtitle ? ` · ${entity.subtitle}` : ''}
        </div>
      </div>
      <Link href={entityFullUrl}
        style={{
          fontSize: 11, color: 'var(--text-muted)', textDecoration: 'none',
          padding: '5px 10px', borderRadius: 6,
          border: '1px solid var(--border-default)',
        }}
        title="Atidaryti pilną entity puslapį"
      >
        Pilnas puslapis →
      </Link>
    </div>
  )
}

function EntityRoot({ entityType, entity, entityFullUrl }: { entityType: EntityType; entity: EntityMeta; entityFullUrl: string }) {
  return (
    <div style={{
      margin: '12px 16px',
      padding: 14,
      borderRadius: 12,
      background: 'rgba(139, 92, 246, 0.06)',
      border: '1px solid rgba(139, 92, 246, 0.25)',
      display: 'flex', gap: 12, alignItems: 'center',
    }}>
      {entity.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <Link href={entityFullUrl}>
          <img
            src={proxyImg(entity.image_url)}
            alt=""
            style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border-default)' }}
          />
        </Link>
      ) : (
        <div style={{
          width: 64, height: 64, borderRadius: 8, flexShrink: 0,
          background: 'var(--bg-elevated)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#c4b5fd', fontSize: 24,
        }}>🎵</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 4,
          background: 'rgba(139, 92, 246, 0.18)', color: '#c4b5fd',
          textTransform: 'uppercase', letterSpacing: '0.05em',
          display: 'inline-block', marginBottom: 4,
        }}>
          {TYPE_LABEL[entityType]}
        </div>
        <Link href={entityFullUrl} style={{ display: 'block', textDecoration: 'none' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 2 }}>
            {entity.title}
          </div>
        </Link>
        {entity.subtitle && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{entity.subtitle}</div>
        )}
      </div>
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
