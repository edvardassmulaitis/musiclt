'use client'
// components/blog/UsernameSetupGate.tsx
//
// Inline gate: jei vartotojas neturi username, parodom formą JĮ NUSTATYTI
// CIA PAT — be redirect'o į /blogas/nustatymai. Sėkmės atveju tėvas gauna
// callback'ą ir tęsia normalų editor'iaus flow.

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
      setError('Mažiausiai 3 simboliai (raidės, skaičiai, taškai)')
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
      <div className="rounded-2xl p-6" style={{ background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.2)' }}>
        <div className="text-center mb-5">
          <div className="text-3xl mb-2">✍️</div>
          <h2 className="text-lg font-black" style={{ fontFamily: "'Outfit', sans-serif", color: '#f2f4f8' }}>
            Pirma — pasirink username
          </h2>
          <p className="text-xs mt-1" style={{ color: '#8aa8cc' }}>
            Tavo blogo URL atrodys taip:<br />
            <span className="text-[#f97316] font-mono">music.lt/blogas/{username || 'tavo-vardas'}</span>
          </p>
        </div>

        <input
          value={username}
          onChange={e => setUsername(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && save()}
          placeholder="pvz. edvardas"
          autoFocus
          className="w-full px-4 py-2.5 rounded-lg text-sm outline-none focus:border-[#f97316]/50 transition mb-3"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#dde8f8' }}
        />

        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

        <button
          onClick={save}
          disabled={saving || username.trim().length < 3}
          className="w-full py-2.5 rounded-lg text-sm font-bold transition disabled:opacity-40"
          style={{ background: '#f97316', color: '#fff', fontFamily: "'Outfit', sans-serif" }}
        >
          {saving ? 'Saugoma...' : 'Tęsti rašymą →'}
        </button>

        <p className="text-[10px] text-center mt-3" style={{ color: '#334058' }}>
          Vėliau galėsi keisti per /blogas/nustatymai
        </p>
      </div>
    </div>
  )
}
