'use client'

import { useState, useRef, useEffect } from 'react'
import type { ChatMessage } from '@/lib/chat-types'
import { ChatAvatar } from './ChatAvatar'
import { formatHM } from './ChatTime'
import { ReactionPicker } from './ReactionPicker'

type Props = {
  message: ChatMessage
  viewerId: string
  grouped: boolean        // true → po prieš tai buvusios to paties autoriaus žinutės (be antraštės)
  onOpenThread?: (messageId: number) => void
  onToggleReaction: (messageId: number, emoji: string) => void
  onEdit: (messageId: number, newBody: string) => Promise<void>
  onDelete: (messageId: number) => Promise<void>
  threadView?: boolean    // true → thread panel'yje (kompaktiškiau)
}

export function MessageItem({ message, viewerId, grouped, onOpenThread, onToggleReaction, onEdit, onDelete, threadView }: Props) {
  const [hover, setHover] = useState(false)
  // tap'as ant žinutės mobile'e atveria toolbar'ą — be hover event'o.
  const [tapToolbar, setTapToolbar] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(message.body)
  const [showReactionPicker, setShowReactionPicker] = useState(false)
  const reactionPickerRef = useRef<HTMLDivElement>(null)
  const itemRef = useRef<HTMLDivElement>(null)

  const isMine = message.user_id === viewerId
  const author = message.author
  const name = author?.full_name || author?.username || 'Vartotojas'
  const isDeleted = !!message.deleted_at
  const showToolbar = (hover || tapToolbar) && !editing && !isDeleted

  // Outside click → close tap'inį toolbar'ą
  useEffect(() => {
    if (!tapToolbar) return
    const h = (e: MouseEvent) => {
      if (itemRef.current && !itemRef.current.contains(e.target as Node)) setTapToolbar(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [tapToolbar])

  useEffect(() => { setEditText(message.body) }, [message.body])

  // Outside click reactions picker close
  useEffect(() => {
    if (!showReactionPicker) return
    const handler = (e: MouseEvent) => {
      if (reactionPickerRef.current && !reactionPickerRef.current.contains(e.target as Node)) setShowReactionPicker(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showReactionPicker])

  async function saveEdit() {
    if (!editText.trim() || editText.trim() === message.body) { setEditing(false); return }
    try {
      await onEdit(message.id, editText.trim())
      setEditing(false)
    } catch { /* surface'inama composer'yje */ }
  }

  return (
    <div
      ref={itemRef}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => {
        // Tap'as ant žinutės mobile'e (kur hover neegzistuoja) atveria
        // toolbar'ą. Desktop'e tap'as nieko nedaro — hover jau veikia.
        if (!editing && !isDeleted && typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches) {
          setTapToolbar(t => !t)
        }
      }}
      style={{
        position: 'relative',
        padding: grouped ? '2px 16px 2px 16px' : '8px 16px 4px',
        display: 'flex', gap: 12,
        background: showToolbar ? 'var(--bg-hover)' : 'transparent',
        transition: 'background .1s',
      }}
    >
      {/* Avatar (jei pirma žinutė grupėje arba ne grupėje) */}
      <div style={{ width: 36, flexShrink: 0, paddingTop: grouped ? 0 : 2 }}>
        {!grouped && <ChatAvatar url={author?.avatar_url || null} fallbackName={name} size={36} />}
        {grouped && showToolbar && (
          <div style={{
            fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1, paddingTop: 4,
          }}>
            {formatHM(message.created_at)}
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {!grouped && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{name}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatHM(message.created_at)}</span>
            {message.edited_at && (
              <span style={{ fontSize: 10, color: 'var(--text-faint, var(--text-muted))' }}>(redaguota)</span>
            )}
          </div>
        )}

        {editing ? (
          <div>
            <textarea
              value={editText}
              onChange={e => setEditText(e.target.value)}
              autoFocus
              rows={Math.min(6, editText.split('\n').length)}
              style={{
                width: '100%', resize: 'vertical', minHeight: 60,
                padding: 10, borderRadius: 8,
                background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                border: '1px solid var(--border-strong)', fontSize: 14,
                outline: 'none',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setEditing(false); setEditText(message.body) }
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveEdit() }
              }}
            />
            <div style={{ marginTop: 6, display: 'flex', gap: 8, fontSize: 12 }}>
              <button onClick={() => { setEditing(false); setEditText(message.body) }}
                style={{ padding: '5px 10px', borderRadius: 6, background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12 }}>
                Atšaukti
              </button>
              <button onClick={saveEdit}
                style={{ padding: '5px 12px', borderRadius: 6, background: 'var(--accent-orange)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                Išsaugoti
              </button>
            </div>
          </div>
        ) : isDeleted ? (
          <div style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--text-muted)' }}>— žinutė ištrinta —</div>
        ) : (
          <div style={{
            fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.45,
            wordBreak: 'break-word', whiteSpace: 'pre-wrap',
          }}>
            {linkify(message.body)}
            {message.pending && <span style={{ fontSize: 10, marginLeft: 6, color: 'var(--text-muted)' }}>⌛</span>}
          </div>
        )}

        {/* Reactions */}
        {!isDeleted && message.reactions && message.reactions.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            {message.reactions.map(r => {
              const mine = r.user_ids.includes(viewerId)
              return (
                <button
                  key={r.emoji}
                  onClick={() => onToggleReaction(message.id, r.emoji)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 8px', borderRadius: 12,
                    background: mine ? 'rgba(249, 115, 22, 0.18)' : 'var(--bg-elevated)',
                    border: `1px solid ${mine ? 'var(--accent-orange)' : 'var(--border-default)'}`,
                    color: 'var(--text-primary)', fontSize: 12, lineHeight: 1.2,
                    cursor: 'pointer', height: 22,
                  }}
                >
                  <span style={{ fontSize: 13 }}>{r.emoji}</span>
                  <span style={{ fontSize: 11, fontWeight: 700 }}>{r.count}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* Thread indicator */}
        {!isDeleted && !threadView && message.reply_count > 0 && (
          <button
            onClick={() => onOpenThread?.(message.id)}
            style={{
              marginTop: 4, padding: '4px 10px', borderRadius: 8,
              background: 'transparent', border: '1px solid var(--border-default)',
              color: 'var(--accent-link)', fontSize: 12, fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            💬 {message.reply_count} {message.reply_count === 1 ? 'atsakymas' : 'atsakymai'}
          </button>
        )}
      </div>

      {/* Hover toolbar */}
      {showToolbar && (
        <div
          ref={reactionPickerRef}
          style={{
            position: 'absolute', top: -14, right: 12, zIndex: 5,
            display: 'flex', gap: 2, padding: '2px 4px',
            background: 'var(--modal-bg)', borderRadius: 8,
            border: '1px solid var(--modal-border)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
        >
          <ToolbarButton title="Reaguoti" onClick={() => setShowReactionPicker(s => !s)}>😀</ToolbarButton>
          {!threadView && onOpenThread && (
            <ToolbarButton title="Atsakyti į žinutę" onClick={() => onOpenThread(message.id)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
              </svg>
            </ToolbarButton>
          )}
          {isMine && (
            <>
              <ToolbarButton title="Redaguoti" onClick={() => setEditing(true)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </ToolbarButton>
              <ToolbarButton title="Ištrinti" onClick={() => {
                if (confirm('Ištrinti žinutę?')) onDelete(message.id)
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                </svg>
              </ToolbarButton>
            </>
          )}

          {showReactionPicker && (
            <div style={{ position: 'absolute', top: 32, right: 0 }}>
              <ReactionPicker onSelect={(emoji) => {
                onToggleReaction(message.id, emoji)
                setShowReactionPicker(false)
              }} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ToolbarButton({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 28, height: 28, borderRadius: 6, border: 'none',
        background: 'transparent', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-secondary)', fontSize: 14,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
    >
      {children}
    </button>
  )
}

// Lengvas linkify — be papildomų bibliotekų. Pakeičia http(s)://… į <a>.
const URL_REGEX = /\bhttps?:\/\/[^\s]+/g
function linkify(text: string): React.ReactNode {
  if (!text) return null
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  const re = new RegExp(URL_REGEX)
  let i = 0
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
    const url = match[0]
    parts.push(
      <a key={`l${i++}`} href={url} target="_blank" rel="noopener noreferrer"
        style={{ color: 'var(--accent-link)', textDecoration: 'underline' }}>
        {url}
      </a>
    )
    lastIndex = match.index + url.length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}
