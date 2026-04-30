'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChatAvatar } from './ChatAvatar'

type SearchUser = {
  id: string
  username: string | null
  full_name: string | null
  avatar_url: string | null
}

type Props = {
  onClose: () => void
}

export function NewConversationModal({ onClose }: Props) {
  const router = useRouter()
  const [mode, setMode] = useState<'dm' | 'group'>('dm')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchUser[]>([])
  const [selected, setSelected] = useState<SearchUser[]>([])
  const [groupName, setGroupName] = useState('')
  const [creating, setCreating] = useState(false)
  const [searchingDebounce, setSearchingDebounce] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => setSearchingDebounce(searchingDebounce + 1), 200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/chat/users/search?q=${encodeURIComponent(query)}&limit=20`)
      .then(r => r.json()).then(json => { if (!cancelled) setResults(json.users || []) })
      .catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchingDebounce])

  // ESC to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  function toggle(u: SearchUser) {
    if (mode === 'dm') {
      // Single select — start DM iškart.
      startDM(u)
      return
    }
    setSelected(prev => prev.find(s => s.id === u.id) ? prev.filter(s => s.id !== u.id) : [...prev, u])
  }

  async function startDM(u: SearchUser) {
    setCreating(true)
    try {
      const res = await fetch('/api/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'dm', user_id: u.id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      onClose()
      router.push(`/pokalbiai/${json.id}`)
    } catch (e: any) {
      alert(e?.message || 'Klaida')
      setCreating(false)
    }
  }

  async function createGroup() {
    if (selected.length === 0) return
    setCreating(true)
    try {
      const res = await fetch('/api/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'group',
          name: groupName.trim() || null,
          member_ids: selected.map(s => s.id),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      onClose()
      router.push(`/pokalbiai/${json.id}`)
    } catch (e: any) {
      alert(e?.message || 'Klaida')
      setCreating(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <div style={{ padding: 18 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 12 }}>
          {mode === 'dm' ? 'Naujas pokalbis' : 'Nauja grupė'}
        </div>

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--bg-elevated)', borderRadius: 8, marginBottom: 14 }}>
          <ModeButton active={mode === 'dm'} onClick={() => { setMode('dm'); setSelected([]) }}>Privatus</ModeButton>
          <ModeButton active={mode === 'group'} onClick={() => setMode('group')}>Grupė</ModeButton>
        </div>

        {mode === 'group' && (
          <input
            type="text"
            value={groupName}
            onChange={e => setGroupName(e.target.value)}
            placeholder="Grupės pavadinimas (neprivalomas)"
            style={{
              width: '100%', padding: '10px 12px', marginBottom: 10,
              fontSize: 13, color: 'var(--text-primary)',
              background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
              borderRadius: 8, outline: 'none',
            }}
          />
        )}

        {mode === 'group' && selected.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {selected.map(u => (
              <span key={u.id}
                onClick={() => toggle(u)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 4px 4px 4px', borderRadius: 16,
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
                  fontSize: 12, color: 'var(--text-primary)', cursor: 'pointer',
                }}
              >
                <ChatAvatar url={u.avatar_url} fallbackName={u.full_name || u.username} size={20} />
                <span>{u.full_name || u.username}</span>
                <span style={{ paddingRight: 8, color: 'var(--text-muted)' }}>×</span>
              </span>
            ))}
          </div>
        )}

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Ieškoti vartotojų pagal vardą arba @username…"
          style={{
            width: '100%', padding: '10px 12px', marginBottom: 10,
            fontSize: 13, color: 'var(--text-primary)',
            background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
            borderRadius: 8, outline: 'none',
          }}
        />

        <div style={{ maxHeight: 320, overflowY: 'auto', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
          {results.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
              {query ? 'Niekas neatitiko' : 'Pradėk vesti vartotojo vardą…'}
            </div>
          ) : (
            results.map(u => {
              const sel = selected.find(s => s.id === u.id)
              return (
                <button
                  key={u.id}
                  onClick={() => toggle(u)}
                  disabled={creating}
                  style={{
                    width: '100%', textAlign: 'left',
                    padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10,
                    background: sel ? 'rgba(249,115,22,0.1)' : 'transparent',
                    border: 'none', cursor: 'pointer',
                    borderBottom: '1px solid var(--border-subtle)',
                    transition: 'background .12s',
                  }}
                  onMouseEnter={e => { if (!sel) e.currentTarget.style.background = 'var(--bg-hover)' }}
                  onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent' }}
                >
                  <ChatAvatar url={u.avatar_url} fallbackName={u.full_name || u.username} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {u.full_name || u.username || 'Vartotojas'}
                    </div>
                    {u.username && u.full_name && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>@{u.username}</div>
                    )}
                  </div>
                  {sel && (
                    <div style={{ color: 'var(--accent-orange)', fontSize: 16 }}>✓</div>
                  )}
                </button>
              )
            })
          )}
        </div>

        {mode === 'group' && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button
              onClick={onClose}
              disabled={creating}
              style={{
                padding: '8px 14px', borderRadius: 8,
                background: 'transparent', border: '1px solid var(--border-default)',
                color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Atšaukti
            </button>
            <button
              onClick={createGroup}
              disabled={creating || selected.length === 0}
              style={{
                padding: '8px 16px', borderRadius: 8,
                background: selected.length === 0 ? 'var(--bg-hover)' : 'var(--accent-orange)',
                border: 'none', color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: selected.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              Sukurti grupę {selected.length > 0 && `(${selected.length + 1})`}
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}

function ModeButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '7px 12px', borderRadius: 6, border: 'none',
        background: active ? 'var(--bg-surface)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-muted)',
        fontSize: 12, fontWeight: 700, cursor: 'pointer',
        boxShadow: active ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
        transition: 'all .12s',
      }}
    >
      {children}
    </button>
  )
}

export function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'var(--overlay-bg, rgba(0,0,0,0.6))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, backdropFilter: 'blur(2px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
          background: 'var(--modal-bg)',
          border: '1px solid var(--modal-border)',
          borderRadius: 14,
          boxShadow: 'var(--modal-shadow, 0 16px 48px rgba(0,0,0,0.5))',
          maxHeight: '85vh', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {children}
      </div>
    </div>
  )
}
