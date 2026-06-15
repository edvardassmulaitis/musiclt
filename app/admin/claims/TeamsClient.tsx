'use client'

import { useState } from 'react'

export type TeamRow = {
  id: string; role: string; created_at: string
  artist: { id: number; slug: string; name: string; cover_image_url: string | null }
  user: { email: string | null; full_name: string | null; username: string | null; last_seen_at: string | null }
}

function lastSeen(iso: string | null): string {
  if (!iso) return 'niekada'
  const d = new Date(iso); const diff = Date.now() - d.getTime()
  const m = Math.floor(diff / 60000), h = Math.floor(m / 60), days = Math.floor(h / 24)
  if (m < 2) return 'ką tik'
  if (m < 60) return `prieš ${m} min.`
  if (h < 24) return `prieš ${h} val.`
  if (days < 30) return `prieš ${days} d.`
  return d.toLocaleDateString('lt-LT')
}

export default function TeamsClient({ initial }: { initial: TeamRow[] }) {
  const [teams, setTeams] = useState<TeamRow[]>(initial)
  const [busy, setBusy] = useState<string | null>(null)

  async function revoke(id: string, name: string) {
    if (!confirm(`Panaikinti ${name} prieigą prie šio atlikėjo?`)) return
    setBusy(id)
    try {
      const r = await fetch('/api/admin/artist-team', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: id, action: 'revoke' }),
      })
      const d = await r.json()
      if (d.ok) setTeams((p) => p.filter((t) => t.id !== id))
    } finally { setBusy(null) }
  }

  if (teams.length === 0) return <p className="text-sm text-[var(--text-muted)]">Nėra aktyvių komandų.</p>

  return (
    <ul className="divide-y divide-[var(--border-subtle)] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
      {teams.map((t) => (
        <li key={t.id} className="flex items-center gap-3 px-4 py-3">
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-[var(--bg-surface)]">
            {t.artist.cover_image_url ? <img src={t.artist.cover_image_url} alt="" className="h-full w-full object-cover" /> : null}
          </div>
          <div className="min-w-0 flex-1">
            <a href={`/atlikejai/${t.artist.slug}`} target="_blank" rel="noreferrer" className="font-semibold text-[var(--text-primary)] hover:underline">
              {t.artist.name}
            </a>
            <div className="truncate text-xs text-[var(--text-muted)]">
              {t.role === 'owner' ? '👑 Savininkas' : '🛠 Vadybininkas'}: {t.user.full_name || t.user.username || '—'}
              {t.user.email ? ` · ${t.user.email}` : ''}
            </div>
            <div className="text-xs text-[var(--text-faint)]">Paskutinį kartą prisijungė: {lastSeen(t.user.last_seen_at)}</div>
          </div>
          <button onClick={() => revoke(t.id, t.user.full_name || t.user.username || 'narį')} disabled={busy === t.id}
            className="shrink-0 rounded-full border border-[var(--border-default)] px-3 py-1.5 text-xs text-[var(--accent-red)] disabled:opacity-60">
            {busy === t.id ? '…' : 'Panaikinti'}
          </button>
        </li>
      ))}
    </ul>
  )
}
