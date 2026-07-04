'use client'
// components/blog/TagInput.tsx
//
// Free-form tagai. Enter / kablelis prideda. Subtle, jokio per-tag spalvos —
// vienodi small chip'ai.

import { useState, type KeyboardEvent } from 'react'

const MAX_TAGS = 20
const TAG_MAX_LEN = 24

export function TagInput({
  value, onChange,
}: {
  value: string[]
  onChange: (tags: string[]) => void
}) {
  const [draft, setDraft] = useState('')

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase().slice(0, TAG_MAX_LEN)
    if (!tag) return
    if (value.includes(tag)) return
    if (value.length >= MAX_TAGS) return
    onChange([...value, tag])
    setDraft('')
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(draft)
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div>
      <label className="text-[11px] font-bold uppercase tracking-wider mb-2 block" style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}>
        Tagai
      </label>
      <div
        className="flex flex-wrap gap-1 px-3 py-2 rounded-lg min-h-[38px] focus-within:border-[#f97316]/30 transition"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
      >
        {value.map(tag => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[12px] font-semibold"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(value.filter(t => t !== tag))}
              className="opacity-50 hover:opacity-100 transition"
              aria-label={`Pašalinti ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKey}
          onBlur={() => addTag(draft)}
          placeholder={value.length === 0 ? 'jazz, koncertas, lt-pop...' : ''}
          className="flex-1 min-w-[100px] bg-transparent text-sm outline-none"
          style={{ color: 'var(--text-primary)' }}
        />
      </div>
    </div>
  )
}
