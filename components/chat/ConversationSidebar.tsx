'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { ConversationListItem } from '@/lib/chat-types'
import { conversationDisplayName, conversationDisplayAvatar } from '@/lib/chat-types'
import { ChatAvatar, ChatGroupAvatar } from './ChatAvatar'
import { formatSidebarTime } from './ChatTime'

export type SidebarTab = 'private' | 'discussions'

export type DiscussionItem = {
  id: number
  slug: string
  title: string
  comment_count: number
  last_comment_at: string | null
  created_at: string
  is_author: boolean
  involvement: 'created' | 'commented'
}

type Props = {
  viewerId: string
  conversations: ConversationListItem[]
  discussions?: DiscussionItem[]
  activeId: number | null
  onNewConversation: () => void
  loading?: boolean
  tab: SidebarTab
  onTabChange: (t: SidebarTab) => void
}

export function ConversationSidebar({
  viewerId, conversations, discussions = [], activeId, onNewConversation, loading,
  tab, onTabChange,
}: Props) {
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

  const filteredDiscussions = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return discussions
    return discussions.filter(d => d.title.toLowerCase().includes(q))
  }, [discussions, filter])

  const dms = filtered.filter(c => c.type === 'dm')
  const groups = filtered.filter(c => c.type === 'group')

  // Total unread skaičius per tab — rodomas badge'e ant tab'o.
  const privateUnread = useMemo(() => {
    return conversations.reduce((acc, c) => acc + (c.notifications_muted ? 0 : c.unread_count || 0), 0)
  }, [conversations])

  return (
    <aside style={{
      width: '100%', flexShrink: 0,
      borderRight: '1px solid var(--border-default)',
      background: 'var(--bg-surface)',
      display: 'flex', flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
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

      {/* Tabs — Tavo pokalbiai vs Bendros diskusijos */}
      <div style={{
        display: 'flex', flexShrink: 0,
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <TabButton
          active={tab === 'private'}
          onClick={() => onTabChange('private')}
          badge={privateUnread}
        >
          Tavo pokalbiai
        </TabButton>
        <TabButton
          active={tab === 'discussions'}
          onClick={() => onTabChange('discussions')}
          badge={0}
        >
          Diskusijos
        </TabButton>
      </div>

      {/* Search */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <input
          type="search"
          name="chat-conv-filter"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-1p-ignore="true"
          data-lpignore="true"
          data-form-type="other"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder={tab === 'private' ? 'Filtruoti pokalbius…' : 'Filtruoti diskusijas…'}
          style={{
            width: '100%', height: 36, padding: '0 12px',
            // iOS Safari neskautimas — 16px+ neleidžia auto-zoom'inti.
            fontSize: 16, color: 'var(--text-primary)',
            background: 'var(--input-bg, var(--bg-elevated))',
            border: '1px solid var(--input-border, var(--border-default))',
            borderRadius: 8, outline: 'none',
          }}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
        {tab === 'private' ? (
          <PrivateList
            loading={loading}
            dms={dms} groups={groups}
            viewerId={viewerId}
            activeId={activeId}
            onNew={onNewConversation}
          />
        ) : (
          <DiscussionsList
            loading={loading}
            discussions={filteredDiscussions}
          />
        )}
      </div>
    </aside>
  )
}

function TabButton({
  active, children, onClick, badge,
}: { active: boolean; children: React.ReactNode; onClick: () => void; badge: number }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '11px 10px',
        border: 'none', background: 'transparent', cursor: 'pointer',
        fontSize: 12.5, fontWeight: 700,
        color: active ? 'var(--text-primary)' : 'var(--text-muted)',
        borderBottom: active ? '2px solid var(--accent-orange)' : '2px solid transparent',
        transition: 'color .12s, border-color .12s',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      }}
    >
      {children}
      {badge > 0 && (
        <span style={{
          minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8,
          background: 'var(--accent-orange)', color: '#fff',
          fontSize: 9, fontWeight: 800,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          lineHeight: 1,
        }}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  )
}

function PrivateList({ loading, dms, groups, viewerId, activeId, onNew }: {
  loading?: boolean
  dms: ConversationListItem[]
  groups: ConversationListItem[]
  viewerId: string
  activeId: number | null
  onNew: () => void
}) {
  if (loading && dms.length === 0 && groups.length === 0) {
    return <div style={{ padding: 24, fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>Kraunasi…</div>
  }
  if (dms.length === 0 && groups.length === 0) return <EmptyState onNew={onNew} />
  return (
    <>
      {dms.length > 0 && <SectionHeader label="Privačios žinutės" />}
      {dms.map(c => <ConversationRow key={c.id} c={c} viewerId={viewerId} active={c.id === activeId} />)}
      {groups.length > 0 && <SectionHeader label="Grupės" />}
      {groups.map(c => <ConversationRow key={c.id} c={c} viewerId={viewerId} active={c.id === activeId} />)}
    </>
  )
}

function DiscussionsList({ loading, discussions }: { loading?: boolean; discussions: DiscussionItem[] }) {
  if (loading && discussions.length === 0) {
    return <div style={{ padding: 24, fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>Kraunasi…</div>
  }
  if (discussions.length === 0) {
    return (
      <div style={{ padding: '36px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>💭</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
          Diskusijų dar nėra
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
          Sukurk arba pakomentuok diskusiją — atsiras čia.
        </div>
        <Link href="/diskusijos"
          style={{
            display: 'inline-block', padding: '8px 14px', borderRadius: 8,
            background: 'var(--accent-link)', color: '#fff',
            fontSize: 12, fontWeight: 700, textDecoration: 'none',
          }}>
          Visos diskusijos →
        </Link>
      </div>
    )
  }
  return <>{discussions.map(d => <DiscussionRow key={d.id} d={d} />)}</>
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

function DiscussionRow({ d }: { d: DiscussionItem }) {
  const time = d.last_comment_at
    ? formatSidebarTime(d.last_comment_at)
    : formatSidebarTime(d.created_at)
  const subtitle = d.comment_count > 0
    ? `${d.comment_count} ${d.comment_count === 1 ? 'atsakymas' : 'atsakymai'}`
    : 'Dar nėra atsakymų'
  const involvementBadge = d.involvement === 'created' ? 'autorius' : 'komentavai'
  return (
    <Link
      href={`/pokalbiai/d/${d.slug}`}
      style={{
        display: 'flex', gap: 10, alignItems: 'center',
        padding: '10px 14px',
        textDecoration: 'none', color: 'inherit',
        transition: 'background .12s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{
        width: 40, height: 40, flexShrink: 0,
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
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
          <div style={{
            flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700,
            color: 'var(--text-primary)',
            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
          }}>
            {d.title}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', flexShrink: 0 }}>
            {time}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            flex: 1, minWidth: 0, fontSize: 12, color: 'var(--text-muted)',
            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
          }}>
            {subtitle}
          </div>
          <span style={{
            fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 4,
            background: 'rgba(139, 92, 246, 0.18)',
            color: '#c4b5fd', textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>{involvementBadge}</span>
        </div>
      </div>
    </Link>
  )
}
