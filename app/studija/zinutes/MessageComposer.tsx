'use client'

import { useState } from 'react'

type Update = { id: string; kind: string; title: string; body: string | null; recipients: number; created_at: string }

const KINDS: { key: string; label: string; icon: string }[] = [
  { key: 'message', label: 'Žinutė', icon: '💬' },
  { key: 'release', label: 'Naujas leidinys', icon: '🎵' },
  { key: 'concert', label: 'Koncertas', icon: '🎤' },
  { key: 'milestone', label: 'Pasiekimas', icon: '🏆' },
]

export default function MessageComposer({ artistId, followerCount, initial }: { artistId: number; followerCount: number; initial: Update[] }) {
  const [kind, setKind] = useState('message')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [updates, setUpdates] = useState<Update[]>(initial)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function send() {
    if (!title.trim()) { setMsg({ ok: false, text: 'Įrašyk antraštę' }); return }
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/studija/updates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistId, kind, title, body, channels: ['push', 'feed'] }),
      })
      const d = await r.json()
      if (d.ok) {
        setMsg({ ok: true, text: `Išsiųsta ${d.recipients} fanams ✓` })
        setUpdates((p) => [{ id: d.id, kind, title, body, recipients: d.recipients, created_at: new Date().toISOString() }, ...p])
        setTitle(''); setBody('')
      } else setMsg({ ok: false, text: d.error || 'Nepavyko' })
    } catch { setMsg({ ok: false, text: 'Klaida' }) }
    setBusy(false)
  }

  const inputCls = 'w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-faint)]'

  return (
    <div className="max-w-2xl">
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5">
        <div className="flex items-center justify-between">
          <div className="font-['Outfit',sans-serif] text-base font-bold text-[var(--text-primary)]">Žinutė fanams</div>
          <span className="text-xs text-[var(--text-muted)]">{followerCount} gavėjų</span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {KINDS.map((k) => (
            <button key={k.key} onClick={() => setKind(k.key)}
              className={`rounded-full px-3 py-1.5 text-sm ${kind === k.key ? 'bg-[var(--accent-orange)] text-white' : 'bg-[var(--bg-surface)] text-[var(--text-secondary)]'}`}>
              {k.icon} {k.label}
            </button>
          ))}
        </div>

        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Antraštė (pvz. „Naujas singlas jau išėjo!“)" className={`mt-3 ${inputCls}`} />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Tekstas (nebūtina)" className={`mt-2 ${inputCls} resize-y`} />

        <div className="mt-3 flex items-center gap-3">
          <button onClick={send} disabled={busy}
            className="rounded-full bg-[var(--accent-orange)] px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? 'Siunčiama…' : `Siųsti ${followerCount} fanams`}
          </button>
          {msg && <span className={`text-sm ${msg.ok ? 'text-[var(--accent-green)]' : 'text-[var(--accent-red)]'}`}>{msg.text}</span>}
        </div>
        <p className="mt-2 text-xs text-[var(--text-muted)]">Gauna in-app pranešimą + push. El. laiškai — netrukus.</p>
      </div>

      <h2 className="mt-7 font-['Outfit',sans-serif] text-lg font-bold text-[var(--text-primary)]">Išsiųstos žinutės</h2>
      {updates.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--text-muted)]">Dar nieko nesiuntei.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {updates.map((u) => (
            <li key={u.id} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
              <div className="text-sm font-medium text-[var(--text-primary)]">{u.title}</div>
              {u.body && <div className="mt-0.5 line-clamp-2 text-sm text-[var(--text-secondary)]">{u.body}</div>}
              <div className="mt-1 text-xs text-[var(--text-muted)]">{new Date(u.created_at).toLocaleDateString('lt-LT')} · {u.recipients} gavėjų</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
