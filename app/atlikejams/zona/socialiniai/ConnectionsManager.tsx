'use client'

import { useState } from 'react'

type Conn = { id: string; platform: string; external_id: string | null; username: string | null; status: string; last_synced_at: string | null; last_error: string | null }

export default function ConnectionsManager({ artistId, initial, defaultYoutube }: {
  artistId: number; initial: Conn[]; defaultYoutube?: string | null
}) {
  const [conns, setConns] = useState<Conn[]>(initial)
  const [ytInput, setYtInput] = useState(defaultYoutube || '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const yt = conns.find((c) => c.platform === 'youtube')

  async function connectYouTube() {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/studija/connections', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistId, platform: 'youtube', input: ytInput }),
      })
      const d = await r.json()
      if (d.ok) {
        setMsg({ ok: true, text: `Prijungta: ${d.username || 'kanalas'} — ${d.items} video ✓` })
        setConns((p) => [...p.filter((c) => c.platform !== 'youtube'), {
          id: 'new', platform: 'youtube', external_id: d.channelId, username: d.username,
          status: 'active', last_synced_at: new Date().toISOString(), last_error: d.syncError || null,
        }])
      } else setMsg({ ok: false, text: d.error || 'Nepavyko' })
    } catch { setMsg({ ok: false, text: 'Klaida' }) }
    setBusy(false)
  }

  async function refresh() {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/studija/connections', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistId, platform: 'youtube', input: yt?.external_id || ytInput }),
      })
      const d = await r.json()
      setMsg(d.ok ? { ok: true, text: `Atnaujinta — ${d.items} video ✓` } : { ok: false, text: d.error || 'Nepavyko' })
    } catch { setMsg({ ok: false, text: 'Klaida' }) }
    setBusy(false)
  }

  async function disconnect() {
    if (!confirm('Atjungti YouTube auto-feed?')) return
    setBusy(true); setMsg(null)
    try {
      await fetch('/api/studija/connections', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistId, platform: 'youtube' }),
      })
      setConns((p) => p.filter((c) => c.platform !== 'youtube'))
    } finally { setBusy(false) }
  }

  const inputCls = 'w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-faint)]'

  return (
    <div className="max-w-2xl">
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5">
        <div className="flex items-center gap-2">
          <span className="text-xl">▶️</span>
          <div className="font-['Outfit',sans-serif] text-base font-bold text-[var(--text-primary)]">YouTube — automatinis feed'as</div>
        </div>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Prijunk kanalą vieną kartą — naujausi vaizdo įrašai patys atsiras tavo anketoje ir atsinaujins.
        </p>

        {yt ? (
          <div className="mt-3">
            <div className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2">
              <div className="text-sm text-[var(--text-primary)]">
                ✓ Prijungta{yt.username ? `: ${yt.username}` : ''}
                {yt.last_synced_at && <span className="ml-2 text-xs text-[var(--text-muted)]">atnaujinta {new Date(yt.last_synced_at).toLocaleDateString('lt-LT')}</span>}
              </div>
            </div>
            {yt.last_error && <p className="mt-1 text-xs text-[var(--accent-red)]">Klaida: {yt.last_error}</p>}
            <div className="mt-3 flex gap-2">
              <button onClick={refresh} disabled={busy} className="rounded-full bg-[var(--accent-orange)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy ? '…' : 'Atnaujinti dabar'}</button>
              <button onClick={disconnect} disabled={busy} className="rounded-full border border-[var(--border-default)] px-4 py-2 text-sm text-[var(--text-secondary)] disabled:opacity-60">Atjungti</button>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <input value={ytInput} onChange={(e) => setYtInput(e.target.value)} placeholder="https://youtube.com/@tavokanalas arba /channel/UC..." className={inputCls} />
            <button onClick={connectYouTube} disabled={busy || !ytInput.trim()} className="mt-2 rounded-full bg-[var(--accent-orange)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {busy ? 'Jungiama…' : 'Įjungti'}
            </button>
          </div>
        )}
        {msg && <p className={`mt-2 text-sm ${msg.ok ? 'text-[var(--accent-green)]' : 'text-[var(--accent-red)]'}`}>{msg.text}</p>}
      </div>

      <div className="mt-3 rounded-2xl border border-dashed border-[var(--border-default)] p-4 text-sm text-[var(--text-muted)]">
        📷 Instagram · 📘 Facebook · 🎵 TikTok įrašus kol kas dėk <b>rankiniu būdu žemiau</b> (automatinė jungtis šiems tinklams negalima be Meta verifikacijos). Spotify naujausi leidiniai — planuose.
      </div>
    </div>
  )
}
