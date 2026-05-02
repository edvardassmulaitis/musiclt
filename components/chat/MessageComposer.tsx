'use client'

import { useState, useRef, useEffect } from 'react'
import { ReactionPicker } from './ReactionPicker'

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
  const [emojiOpen, setEmojiOpen] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const lastTypingRef = useRef(0)
  const emojiWrapRef = useRef<HTMLDivElement>(null)

  // Auto-resize textarea iki ~6 eilučių.
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(160, ta.scrollHeight) + 'px'
  }, [value])

  // Outside click → close emoji picker.
  useEffect(() => {
    if (!emojiOpen) return
    const h = (e: MouseEvent) => {
      if (emojiWrapRef.current && !emojiWrapRef.current.contains(e.target as Node)) setEmojiOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [emojiOpen])

  async function send() {
    const text = value.trim()
    if (!text || sending || disabled) return
    setSending(true)
    setValue('')
    try {
      await onSend(text)
    } catch (e: any) {
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

  function insertEmoji(emoji: string) {
    const ta = taRef.current
    if (!ta) {
      setValue(v => v + emoji)
      return
    }
    const start = ta.selectionStart ?? value.length
    const end = ta.selectionEnd ?? value.length
    const next = value.slice(0, start) + emoji + value.slice(end)
    setValue(next)
    // Po render'o atstatom cursor poziciją.
    requestAnimationFrame(() => {
      ta.focus()
      const pos = start + emoji.length
      try { ta.setSelectionRange(pos, pos) } catch {}
    })
  }

  return (
    <div style={{
      borderTop: '1px solid var(--border-default)',
      padding: compact ? '8px 12px' : '12px 16px',
      background: 'var(--bg-surface)',
      position: 'relative',
    }}>
      {/* Emoji picker — virš composer'io */}
      {emojiOpen && (
        <div
          ref={emojiWrapRef}
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 4px)',
            right: compact ? 12 : 16,
            zIndex: 60,
          }}
        >
          <ReactionPicker
            compact
            onSelect={(e) => { insertEmoji(e); /* picker stays open for multi-emoji */ }}
          />
        </div>
      )}

      <div style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        borderRadius: 10,
        padding: '6px 8px 6px 12px',
        display: 'flex', alignItems: 'flex-end', gap: 6,
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
            // iOS Safari zoom'ina į bet kurį input'ą su font-size < 16px kai
            // gauna fokusa. fontSize 16 sustabdo to elgesį globaliai.
            fontSize: 16, lineHeight: 1.45, padding: '8px 0',
            fontFamily: 'inherit',
            minHeight: 24,
          }}
        />

        {/* Emoji toggle button */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setEmojiOpen(v => !v) }}
          aria-label="Emoji"
          style={{
            width: 34, height: 34, borderRadius: 8, border: 'none',
            background: emojiOpen ? 'var(--bg-hover)' : 'transparent',
            color: 'var(--text-muted)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, flexShrink: 0,
            transition: 'background .12s',
          }}
          onMouseEnter={ev => (ev.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={ev => (ev.currentTarget.style.background = emojiOpen ? 'var(--bg-hover)' : 'transparent')}
        >
          😀
        </button>

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
