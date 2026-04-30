'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { ConversationListItem } from '@/lib/chat-types'
import { conversationDisplayName, conversationDisplayAvatar } from '@/lib/chat-types'
import { ChatAvatar, ChatGroupAvatar } from './ChatAvatar'
import { formatSidebarTime } from './ChatTime'

type Props = {
  viewerId: string
  conversations: ConversationListItem[]
  activeId: number | null
  onNewConversation: () => void
  loading?: boolean
}

export function ConversationSidebar({ viewerId, conversations, activeId, onNewConversation, loading }: Props) {
  const [filter, setFilter] = useState('')

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter(c => {
      const name = conversationDisplayName(c, viewerId).toLowerCase()
      if (name.includes(q)) return true
      return c.participants.some(p =>
        (p.full_name || '').toLowerCase().includes(q) ||
        (p.username || '').toLowerCase().includes(q)
      )
    })
  }, [conversations, filter, viewerId])

  const dms = filtered.filter(c => c.type === 'dm')
  const groups = filtered.filter(c => c.type === 'group')

  return (
    <aside style={{
      width: 300, flexShrink: 0,
      borderRight: '1px solid var(--border-default)',
      background: 'var(--bg-surface)',
      display: 'flex', flexDirection: 'column',
      height: '100%',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>Pokalbiai</div>
        <button
          onClick={onNewConversation}
          aria-label="Naujas pokalbis"
          style={{
            width: 30, height: 30, borderRadius: 8, border: 'none',
            background: 'var(--accent-orange)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', fontSize: 16, fontWeight: 700,
            transition: 'transform .12s',
          }}
          onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.06)')}
          onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
        <input
          type="text"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filtruoti pokalbius…"
          style={{
            width: '100%', height: 34, padding: '0 12px',
            fontSize: 13, color: 'var(--text-primary)',
            background: 'var(--input-bg, var(--bg-elevated))',
            border: '1px solid var(--input-border, var(--border-default))',
            borderRadius: 8, outline: 'none',
          }}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && conversations.length === 0 ? (
          <div style={{ padding: 24, fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
            Kraunasi…
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState onNew={onNewConversation} />
        ) : (
          <>
            {dms.length > 0 && <SectionHeader label="Privačios žinutės" />}
            {dms.map(c => <ConversationRow key={c.id} c={c} viewerId={viewerId} active={c.id === activeId} />)}
            {groups.length > 0 && <SectionHeader label="Grupės" />}
            {groups.map(c => <ConversationRow key={c.id} c={c} viewerId={viewerId} active={c.id === activeId} />)}
          </>
        )}
      </div>
    </aside>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{
      padding: '14px 16px 6px', fontSize: 10, fontWeight: 800,
      letterSpacing: '0.1em', textTransform: 'uppercase',
      color: 'var(--text-muted)',
    }}>{label}</div>
  )
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div style={{ padding: '36px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
        Pokalbių dar nėra
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
        Pradėk privatų pokalbį arba sukurk grupę.
      </div>
      <button
        onClick={onNew}
        style={{
          padding: '8px 16px', borderRadius: 8, border: 'none',
          background: 'var(--accent-orange)', color: '#fff',
          fontSize: 12, fontWeight: 700, cursor: 'pointer',
        }}
      >
        Naujas pokalbis
      </button>
    </div>
  )
}

function ConversationRow({ c, viewerId, active }: { c: ConversationListItem; viewerId: string; active: boolean }) {
  const name = conversationDisplayName(c, viewerId)
  const avatarUrl = conversationDisplayAvatar(c, viewerId)
  const time = formatSidebarTime(c.last_message_at)
  const sender = c.last_message_user_id === viewerId
    ? 'Tu'
    : c.participants.find(p => p.user_id === c.last_message_user_id)?.full_name?.split(' ')[0] || ''
  const preview = c.last_message_preview
    ? (sender ? `${sender}: ${c.last_message_preview}` : c.last_message_preview)
    : 'Dar nėra žinučių'

  return (
    <Link
      href={`/pokalbiai/${c.id}`}
      style={{
        display: 'flex', gap: 10, alignItems: 'center',
        padding: '10px 14px',
        background: active ? 'var(--bg-active)' : 'transparent',
        borderLeft: active ? '3px solid var(--accent-orange)' : '3px solid transparent',
        textDecoration: 'none', color: 'inherit',
        transition: 'background .12s',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-hover)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      {c.type === 'group' ? (
        c.photo_url
          ? <ChatAvatar url={c.photo_url} fallbackName={name} size={40} square />
          : <ChatGroupAvatar participants={c.participants.filter(p => p.user_id !== viewerId)} size={40} />
      ) : (
        <ChatAvatar url={avatarUrl} fallbackName={name} size={40} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
          <div style={{
            flex: 1, minWidth: 0, fontSize: 13.5,
            fontWeight: c.unread_count > 0 ? 800 : 600,
            color: 'var(--text-primary)',
            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
          }}>
            {name}
            {c.notifications_muted && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-muted)' }}>🔕</span>}
          </div>
          <div style={{ fontSize: 10.5, color: c.unread_count > 0 ? 'var(--accent-orange)' : 'var(--text-muted)', flexShrink: 0 }}>
            {time}
          </div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <div style={{
            flex: 1, minWidth: 0, fontSize: 12,
            fontWeight: c.unread_count > 0 ? 600 : 400,
            color: c.unread_count > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
          }}>
            {preview}
          </div>
          {c.unread_count > 0 && (
            <span style={{
              flexShrink: 0, minWidth: 18, height: 18, padding: '0 5px',
              borderRadius: 9, background: 'var(--accent-orange)',
              color: '#fff', fontSize: 10, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
            }}>
              {c.unread_count > 99 ? '99+' : c.unread_count}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
