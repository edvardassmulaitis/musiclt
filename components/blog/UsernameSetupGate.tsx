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

      {/* HIDDEN TRAP fieldai PRIEŠ tikrąjį input'ą — Chrome/Safari/1Password
          autofill targeting'as targetina pirmą username/password lauką
          formoje. Įdedam apgaulingą porą (off-screen su tabIndex=-1, kad
          tab'as juos preskočia ir aria-hidden, kad screen reader nepaminetu),
          tad password manager'is "užkimba" čia, o tikrasis blog handle laukas
          lieka švarus. */}
      <input
        type="text"
        name="username"
        autoComplete="username"
        tabIndex={-1}
        aria-hidden="true"
        style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', opacity: 0 }}
        readOnly
      />
      <input
        type="password"
        name="password"
        autoComplete="current-password"
        tabIndex={-1}
        aria-hidden="true"
        style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', opacity: 0 }}
        readOnly
      />

      {/* Tikrasis input'as — ne form'oje, su nestandartiniu name'u, kad
          autofill heuristika neatpažintu kaip login lauko. */}
      <input
        type="text"
        name="ml-blog-handle-67ab"
        autoComplete="off"
        data-1p-ignore="true"
        data-lpignore="true"
        data-form-type="other"
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
