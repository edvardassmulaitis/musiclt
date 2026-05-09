'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ConversationDetail } from '@/lib/chat-types'
import { Modal } from './NewConversationModal'
import { ChatAvatar } from './ChatAvatar'

type Props = {
  conversation: ConversationDetail
  viewerId: string
  onClose: () => void
  onUpdated: () => void
}

export function ConversationSettingsModal({ conversation, viewerId, onClose, onUpdated }: Props) {
  const router = useRouter()
  const [name, setName] = useState(conversation.name || '')
  const [topic, setTopic] = useState(conversation.topic || '')
  const [saving, setSaving] = useState(false)
  const [addingMembers, setAddingMembers] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])

  const isGroup = conversation.type === 'group'
  const me = conversation.participants.find(p => p.user_id === viewerId)
  const isAdmin = me?.role === 'admin'
  const activeParticipants = conversation.participants.filter(p => !p.left_at)

  useEffect(() => {
    if (!addingMembers) return
    fetch(`/api/chat/users/search?q=${encodeURIComponent(searchQuery)}`).then(r => r.json()).then(json => {
      const existing = new Set(activeParticipants.map(p => p.user_id))
      setSearchResults((json.users || []).filter((u: any) => !existing.has(u.id)))
    })
  }, [searchQuery, addingMembers, activeParticipants])

  async function saveBasics() {
    if (!isGroup || !isAdmin) return
    setSaving(true)
    try {
      const res = await fetch(`/api/chat/conversations/${conversation.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || null, topic: topic.trim() || null }),
      })
      if (!res.ok) throw new Error((await res.json())?.error)
      onUpdated()
    } catch (e: any) {
      alert(e?.message || 'Nepavyko išsaugoti')
    } finally {
      setSaving(false)
    }
  }

  async function addMember(userId: string) {
    const res = await fetch(`/api/chat/conversations/${conversation.id}/participants`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_ids: [userId] }),
    })
    if (!res.ok) {
      alert('Nepavyko pridėti')
      return
    }
    onUpdated()
  }

  async function removeMember(userId: string) {
    if (!confirm('Pašalinti narį iš grupės?')) return
    const res = await fetch(`/api/chat/conversations/${conversation.id}/participants?user_id=${userId}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      alert('Nepavyko pašalinti')
      return
    }
    onUpdated()
  }

  async function leaveConversation() {
    if (!confirm('Ar tikrai nori palikti šį pokalbį?')) return
    await fetch(`/api/chat/conversations/${conversation.id}`, { method: 'DELETE' })
    onClose()
    router.push('/pokalbiai')
  }

  return (
    <Modal onClose={onClose}>
      <div style={{ padding: 18, overflow: 'auto' }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 12 }}>
          {isGroup ? 'Grupės nustatymai' : 'Pokalbio info'}
        </div>

        {/* Basics — tik grupėms ir tik adminams */}
        {isGroup && (
          <div style={{ marginBottom: 18 }}>
            <Label>Pavadinimas</Label>
            <input
              type="text"
              name={`zwx-${Math.random().toString(36).slice(2, 9)}`}
              autoComplete="new-password"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-1p-ignore="true"
              data-lpignore="true"
              data-form-type="other"
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={!isAdmin || saving}
              placeholder="Grupės pavadinimas"
              style={fieldStyle(isAdmin)}
            />
            <Label>Tema</Label>
            <input
              type="text"
              name={`zwx-${Math.random().toString(36).slice(2, 9)}`}
              autoComplete="new-password"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-1p-ignore="true"
              data-lpignore="true"
              data-form-type="other"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              disabled={!isAdmin || saving}
              placeholder="Apie ką šita grupė?"
              style={fieldStyle(isAdmin)}
            />
            {isAdmin && (
              <button onClick={saveBasics} disabled={saving}
                style={{ marginTop: 6, padding: '7px 14px', borderRadius: 8, background: 'var(--accent-orange)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                {saving ? 'Saugoma…' : 'Išsaugoti'}
              </button>
            )}
          </div>
        )}

        {/* Members */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Dalyviai ({activeParticipants.length})
            </div>
            {isGroup && isAdmin && (
              <button onClick={() => setAddingMembers(s => !s)}
                style={{ fontSize: 12, color: 'var(--accent-link)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                {addingMembers ? 'Atšaukti' : '+ Pridėti'}
              </button>
            )}
          </div>

          {addingMembers && (
            <div style={{ marginBottom: 12 }}>
              <input
                type="search"
                name="chat-member-search"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-1p-ignore="true"
                data-lpignore="true"
                data-form-type="other"
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Ieškoti narių..."
                style={fieldStyle(true)}
              />
              <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
                {searchResults.length === 0 ? (
                  <div style={{ padding: 14, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>—</div>
                ) : searchResults.map((u: any) => (
                  <button key={u.id} onClick={() => addMember(u.id)}
                    style={{ width: '100%', textAlign: 'left', padding: 8, background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <ChatAvatar url={u.avatar_url} fallbackName={u.full_name || u.username} size={28} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{u.full_name || u.username}</div>
                      {u.username && u.full_name && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>@{u.username}</div>}
                    </div>
                    <span style={{ fontSize: 16, color: 'var(--accent-orange)' }}>+</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
            {activeParticipants.map(p => (
              <div key={p.user_id} style={{
                display: 'flex', gap: 10, alignItems: 'center', padding: 10,
                borderBottom: '1px solid var(--border-subtle)',
              }}>
                <ChatAvatar url={p.profile?.avatar_url || null} fallbackName={p.profile?.full_name || p.profile?.username} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {p.profile?.full_name || p.profile?.username || 'Vartotojas'}
                    {p.user_id === viewerId && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-muted)' }}>(tu)</span>}
                    {p.role === 'admin' && <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'rgba(249,115,22,0.18)', color: 'var(--accent-orange)', fontWeight: 800 }}>ADMIN</span>}
                  </div>
                  {p.profile?.username && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>@{p.profile.username}</div>}
                </div>
                {isGroup && isAdmin && p.user_id !== viewerId && (
                  <button onClick={() => removeMember(p.user_id)}
                    style={{ padding: '4px 8px', fontSize: 11, color: 'var(--text-muted)', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 6, cursor: 'pointer' }}>
                    Pašalinti
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose}
            style={{ padding: '8px 14px', borderRadius: 8, background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Uždaryti
          </button>
          {isGroup && (
            <button onClick={leaveConversation}
              style={{ padding: '8px 14px', borderRadius: 8, background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Palikti grupę
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, marginTop: 8 }}>
      {children}
    </div>
  )
}

function fieldStyle(enabled: boolean): React.CSSProperties {
  return {
    width: '100%', padding: '10px 12px', marginBottom: 8,
    // 16px+ — iOS Safari nezoom'ina į input'ą gavus fokusa.
    fontSize: 16, color: 'var(--text-primary)',
    background: enabled ? 'var(--bg-elevated)' : 'var(--bg-hover)',
    border: '1px solid var(--border-default)', borderRadius: 8, outline: 'none',
    opacity: enabled ? 1 : 0.7,
  }
}
