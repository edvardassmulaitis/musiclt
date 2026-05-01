'use client'
// components/blog/UsernameSetupGate.tsx
//
// Inline gate: jei vartotojas neturi username, parodom formą JĮ NUSTATYTI
// CIA PAT — be redirect'o. Kai pavyks, tėvas iškart eis į editor'ių.

import { useState } from 'react'

export function UsernameSetupGate({
  onReady,
}: {
  onReady: (username: string) => void
}) {
  const [username, setUsername] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    const clean = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')
    if (clean.length < 3) {
      setError('Mažiausiai 3 simboliai')
      return
    }
    setError(''); setSaving(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: clean }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || 'Klaida')
        return
      }
      onReady(clean)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-md mx-auto px-6 py-12">
      <h2 className="text-xl font-black mb-2" style={{ fontFamily: "'Outfit', sans-serif", color: '#f2f4f8' }}>
        Pasirink username
      </h2>
      <p className="text-xs mb-6" style={{ color: '#5e7290' }}>
        Tavo blogas atrodys taip: <span style={{ color: '#dde8f8' }} className="font-mono">music.lt/blogas/{username || 'tavo-vardas'}</span>
      </p>

      {/* Specifiškai vengiam password-manager trigger'io: name="blog-handle"
          (ne "username"), autoComplete="off", data-1p-ignore (1Password)
          ir data-lpignore (LastPass). Tai pat NE inside <form>, kad
          browser'is netiktrintų submit handler'io. */}
      <input
        type="text"
        name="blog-handle"
        autoComplete="off"
        data-1p-ignore="true"
        data-lpignore="true"
        spellCheck={false}
        value={username}
        onChange={e => setUsername(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && save()}
        placeholder="pvz. edvardas"
        autoFocus
        className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:border-[#f97316]/30 transition mb-3"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#dde8f8' }}
      />

      {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

      <button
        onClick={save}
        disabled={saving || username.trim().length < 3}
        className="w-full py-2 rounded-full text-xs font-bold bg-[#f97316] text-white hover:bg-[#ea580c] disabled:opacity-40 transition"
        style={{ fontFamily: "'Outfit', sans-serif" }}
      >
        {saving ? '...' : 'Tęsti'}
      </button>
    </div>
  )
}
