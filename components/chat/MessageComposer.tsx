'use client'

import { useState, useRef, useEffect } from 'react'

type Props = {
  placeholder?: string
  onSend: (body: string) => Promise<void> | void
  onTyping?: () => void
  disabled?: boolean
  // Compact mode — naudojamas thread'e (mažesnis padding'as).
  compact?: boolean
}

export function MessageComposer({ placeholder, onSend, onTyping, disabled, compact }: Props) {
  const [value, setValue] = useState('')
  const [sending, setSending] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const lastTypingRef = useRef(0)

  // Auto-resize textarea iki ~6 eilučių.
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(160, ta.scrollHeight) + 'px'
  }, [value])

  async function send() {
    const text = value.trim()
    if (!text || sending || disabled) return
    setSending(true)
    setValue('')
    try {
      await onSend(text)
    } catch (e: any) {
      // Grąžinam tekstą atgal — kad nebūtų prarandama.
      setValue(text)
      alert('Nepavyko išsiųsti: ' + (e?.message || 'klaida'))
    } finally {
      setSending(false)
      taRef.current?.focus()
    }
  }

  function onChange(v: string) {
    setValue(v)
    const now = Date.now()
    if (onTyping && now - lastTypingRef.current > 2500) {
      lastTypingRef.current = now
      onTyping()
    }
  }

  return (
    <div style={{
      borderTop: '1px solid var(--border-default)',
      padding: compact ? '8px 12px' : '12px 16px',
      background: 'var(--bg-surface)',
    }}>
      <div style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        borderRadius: 10,
        padding: '6px 8px 6px 12px',
        display: 'flex', alignItems: 'flex-end', gap: 8,
        transition: 'border-color .15s',
      }}
        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent-orange)' }}
        onBlur={(e)  => { e.currentTarget.style.borderColor = 'var(--border-default)' }}
      >
        <textarea
          ref={taRef}
          rows={1}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder={placeholder || 'Rašyk žinutę…'}
          disabled={disabled}
          style={{
            flex: 1, resize: 'none', border: 'none', outline: 'none',
            background: 'transparent', color: 'var(--text-primary)',
            fontSize: 14, lineHeight: 1.5, padding: '8px 0',
            fontFamily: 'inherit',
            minHeight: 24,
          }}
        />
        <button
          onClick={send}
          disabled={!value.trim() || sending || disabled}
          aria-label="Siųsti"
          style={{
            width: 34, height: 34, borderRadius: 8, border: 'none',
            background: value.trim() && !disabled ? 'var(--accent-orange)' : 'var(--bg-hover)',
            color: value.trim() ? '#fff' : 'var(--text-muted)',
            cursor: value.trim() && !disabled ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background .12s, transform .1s',
            flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--text-faint, var(--text-muted))', marginTop: 4, paddingLeft: 4 }}>
        Enter — siųsti · Shift+Enter — nauja eilutė
      </div>
    </div>
  )
}
