'use client'

// Radaro pateikimų moderacijos eilė (/admin/radaras viršuje).
// Approve/Reject → POST /api/admin/radar/submission. Optimistinis šalinimas.

import { useState } from 'react'

export type Submission = {
  id: number
  artist_name: string
  contact_email: string
  links: string | null
  genre: string | null
  city: string | null
  bio: string | null
  message: string | null
  created_at: string
  ip: string | null
}

function linkList(links: string | null) {
  if (!links) return null
  const urls = links.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).slice(0, 8)
  if (urls.length === 0) return null
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
      {urls.map((u, i) => {
        const href = /^https?:\/\//i.test(u) ? u : `https://${u}`
        return <a key={i} href={href} target="_blank" rel="noreferrer noopener"
          className="text-xs text-[var(--accent-link)] underline break-all">{u.replace(/^https?:\/\//, '')}</a>
      })}
    </div>
  )
}

export default function RadarSubmissions({ initial }: { initial: Submission[] }) {
  const [items, setItems] = useState(initial)
  const [busy, setBusy] = useState<number | null>(null)
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [err, setErr] = useState<string | null>(null)

  async function act(id: number, action: 'approve' | 'reject') {
    setBusy(id); setErr(null)
    try {
      const res = await fetch('/api/admin/radar/submission', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, note: notes[id] || '' }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'Klaida') }
      setItems((l) => l.filter((x) => x.id !== id))
    } catch (e: any) { setErr(e?.message || 'Klaida') } finally { setBusy(null) }
  }

  if (items.length === 0) {
    return (
      <section className="mt-2 rounded-xl border border-dashed border-[var(--border-default)] p-4 text-center text-sm text-[var(--text-faint)]">
        Naujų pateikimų nėra.
      </section>
    )
  }

  return (
    <section className="mt-2">
      <h2 className="font-['Outfit',sans-serif] text-lg font-bold text-[var(--text-primary)]">
        📨 Pateikimai <span className="text-sm font-normal text-[var(--text-faint)]">· {items.length} laukia</span>
      </h2>
      <p className="mb-3 text-xs text-[var(--text-muted)]">
        Žmonių pasiūlyti atlikėjai. Patvirtinus — rask atlikėją žemiau (paieška) ir nustatyk Featured/Įtraukti,
        arba sukurk naują per /admin/artists.
      </p>
      {err && <div className="mb-3 rounded-lg bg-[rgba(248,113,113,0.12)] px-3 py-2 text-sm text-[var(--accent-red)]">{err}</div>}
      <ul className="flex flex-col gap-3">
        {items.map((s) => (
          <li key={s.id} className="rounded-xl bg-[var(--bg-surface)] p-4 ring-1 ring-[var(--border-subtle)]">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-['Outfit',sans-serif] text-base font-bold text-[var(--text-primary)]">{s.artist_name}</h3>
              <span className="text-xs text-[var(--text-faint)]">{new Date(s.created_at).toLocaleString('lt-LT')}</span>
            </div>
            <div className="mt-1 text-xs text-[var(--text-muted)]">
              {[s.genre, s.city].filter(Boolean).join(' · ')}
              {(s.genre || s.city) ? ' · ' : ''}
              <a href={`mailto:${s.contact_email}`} className="text-[var(--accent-link)]">{s.contact_email}</a>
            </div>
            {linkList(s.links)}
            {s.bio && <p className="mt-2 text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{s.bio}</p>}
            {s.message && <p className="mt-1 text-xs italic text-[var(--text-muted)] whitespace-pre-wrap">„{s.message}“</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={notes[s.id] || ''}
                onChange={(e) => setNotes((n) => ({ ...n, [s.id]: e.target.value }))}
                placeholder="Pastaba (nebūtina)"
                className="min-w-[140px] flex-1 rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none"
              />
              <button onClick={() => act(s.id, 'approve')} disabled={busy === s.id}
                className="rounded-md bg-[var(--accent-green)] px-3 py-1.5 text-xs font-semibold text-[#04130a] disabled:opacity-50">✓ Patvirtinti</button>
              <button onClick={() => act(s.id, 'reject')} disabled={busy === s.id}
                className="rounded-md bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-red)] ring-1 ring-[var(--border-default)] disabled:opacity-50">✕ Atmesti</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
