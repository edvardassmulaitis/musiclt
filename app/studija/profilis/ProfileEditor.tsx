'use client'

import { useState } from 'react'

type Artist = {
  id: number; slug: string; name: string; description: string | null
  website: string | null; facebook: string | null; instagram: string | null; youtube: string | null
  tiktok: string | null; spotify: string | null; soundcloud: string | null; bandcamp: string | null; twitter: string | null
}

const SOCIALS: { key: keyof Artist; label: string; ph: string }[] = [
  { key: 'website', label: 'Svetainė', ph: 'https://...' },
  { key: 'instagram', label: 'Instagram', ph: 'https://instagram.com/...' },
  { key: 'facebook', label: 'Facebook', ph: 'https://facebook.com/...' },
  { key: 'youtube', label: 'YouTube', ph: 'https://youtube.com/@...' },
  { key: 'tiktok', label: 'TikTok', ph: 'https://tiktok.com/@...' },
  { key: 'spotify', label: 'Spotify', ph: 'https://open.spotify.com/artist/...' },
  { key: 'soundcloud', label: 'SoundCloud', ph: 'https://soundcloud.com/...' },
  { key: 'bandcamp', label: 'Bandcamp', ph: 'https://...bandcamp.com' },
  { key: 'twitter', label: 'X / Twitter', ph: 'https://x.com/...' },
]

export default function ProfileEditor({ artist }: { artist: Artist }) {
  const [bio, setBio] = useState(artist?.description || '')
  const [socials, setSocials] = useState<Record<string, string>>(
    Object.fromEntries(SOCIALS.map((s) => [s.key, (artist?.[s.key] as string) || '']))
  )
  const [saving, setSaving] = useState(false)
  const [aiBusy, setAiBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function ai(mode: string) {
    setAiBusy(mode); setMsg(null)
    try {
      const r = await fetch('/api/studija/bio-assist', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistId: artist.id, current: bio, mode, name: artist.name }),
      })
      const d = await r.json()
      if (d.ok && d.text) setBio(d.text)
      else setMsg({ ok: false, text: d.error || 'AI nepavyko' })
    } catch { setMsg({ ok: false, text: 'AI klaida' }) }
    setAiBusy(null)
  }

  async function save() {
    setSaving(true); setMsg(null)
    try {
      const r = await fetch('/api/studija/profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistId: artist.id, description: bio, ...socials }),
      })
      const d = await r.json()
      setMsg(d.ok ? { ok: true, text: 'Išsaugota ✓' } : { ok: false, text: d.error || 'Nepavyko išsaugoti' })
    } catch { setMsg({ ok: false, text: 'Klaida' }) }
    setSaving(false)
  }

  const inputCls = 'w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-faint)]'

  return (
    <div className="max-w-2xl">
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5">
        <div className="flex items-center justify-between">
          <label className="font-['Outfit',sans-serif] text-base font-bold text-[var(--text-primary)]">Aprašymas (bio)</label>
          <div className="flex gap-1.5">
            {[['improve', 'AI: pagerinti'], ['shorten', 'sutrumpinti'], ['expand', 'praplėsti']].map(([m, lbl]) => (
              <button key={m} onClick={() => ai(m)} disabled={!!aiBusy}
                className="rounded-full border border-[var(--border-default)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50">
                {aiBusy === m ? '…' : `✨ ${lbl}`}
              </button>
            ))}
          </div>
        </div>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={8}
          placeholder="Papasakok apie save — kokią muziką kuri, kas svarbiausia…"
          className={`mt-2 ${inputCls} resize-y`} />
        <div className="mt-1 text-right text-xs text-[var(--text-muted)]">{bio.length} simb.</div>
      </div>

      <div className="mt-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5">
        <div className="font-['Outfit',sans-serif] text-base font-bold text-[var(--text-primary)]">Socialinės nuorodos</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {SOCIALS.map((s) => (
            <div key={s.key}>
              <label className="text-xs text-[var(--text-muted)]">{s.label}</label>
              <input value={socials[s.key] || ''} placeholder={s.ph}
                onChange={(e) => setSocials((p) => ({ ...p, [s.key]: e.target.value }))}
                className={`mt-1 ${inputCls}`} />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button onClick={save} disabled={saving}
          className="rounded-full bg-[var(--accent-orange)] px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
          {saving ? 'Saugoma…' : 'Išsaugoti'}
        </button>
        {msg && <span className={`text-sm ${msg.ok ? 'text-[var(--accent-green)]' : 'text-[var(--accent-red)]'}`}>{msg.text}</span>}
      </div>
    </div>
  )
}
