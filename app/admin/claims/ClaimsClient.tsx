'use client'

import { useState } from 'react'

export type ClaimRow = {
  id: string; method: string; proof_url: string | null; message: string | null; created_at: string
  artist: { id: number; slug: string; name: string; cover_image_url: string | null; is_claimed: boolean }
  user: { email: string | null; full_name: string | null; username: string | null }
}

export default function ClaimsClient({ initial }: { initial: ClaimRow[] }) {
  const [claims, setClaims] = useState<ClaimRow[]>(initial)
  const [busy, setBusy] = useState<string | null>(null)

  async function act(id: string, action: 'approve' | 'reject') {
    setBusy(id)
    try {
      const r = await fetch('/api/admin/claims', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimId: id, action }),
      })
      const d = await r.json()
      if (d.ok) setClaims((p) => p.filter((c) => c.id !== id))
    } finally { setBusy(null) }
  }

  if (claims.length === 0) return <p className="text-sm text-[var(--text-muted)]">Nėra laukiančių prašymų.</p>

  return (
    <ul className="space-y-3">
      {claims.map((c) => (
        <li key={c.id} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 overflow-hidden rounded-full bg-[var(--bg-surface)]">
              {c.artist.cover_image_url ? <img src={c.artist.cover_image_url} alt="" className="h-full w-full object-cover" /> : null}
            </div>
            <div className="min-w-0 flex-1">
              <a href={`/atlikejai/${c.artist.slug}`} target="_blank" rel="noreferrer" className="font-semibold text-[var(--text-primary)] hover:underline">
                {c.artist.name}
              </a>
              {c.artist.is_claimed && <span className="ml-2 text-xs text-[var(--accent-yellow)]">⚠ jau pasiimta kažkieno</span>}
              <div className="text-xs text-[var(--text-muted)]">
                {c.user.full_name || c.user.username || '—'} · {c.user.email || '—'}
              </div>
            </div>
            <div className="text-xs text-[var(--text-faint)]">{new Date(c.created_at).toLocaleDateString('lt-LT')}</div>
          </div>

          {c.proof_url && (
            <div className="mt-2 text-sm">
              <span className="text-[var(--text-muted)]">Įrodymas: </span>
              <a href={c.proof_url} target="_blank" rel="noreferrer" className="text-[var(--accent-link)] break-all">{c.proof_url}</a>
            </div>
          )}
          {c.message && <div className="mt-1 text-sm text-[var(--text-secondary)]">„{c.message}"</div>}

          <div className="mt-3 flex gap-2">
            <button onClick={() => act(c.id, 'approve')} disabled={busy === c.id}
              className="rounded-full bg-[var(--accent-green)] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60">
              {busy === c.id ? '…' : 'Patvirtinti'}
            </button>
            <button onClick={() => act(c.id, 'reject')} disabled={busy === c.id}
              className="rounded-full border border-[var(--border-default)] px-4 py-1.5 text-sm text-[var(--text-secondary)] disabled:opacity-60">
              Atmesti
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}
