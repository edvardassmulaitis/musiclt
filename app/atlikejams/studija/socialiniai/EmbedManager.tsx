'use client'

import { useState } from 'react'
import SocialEmbed from '@/components/SocialEmbed'
import { detectPlatform, PLATFORM_LABEL } from '@/lib/social-embed'

type Embed = { id: string; platform: string; url: string; caption: string | null; sort_order: number }

export default function EmbedManager({ artistId, initial }: { artistId: number; initial: Embed[] }) {
  const [embeds, setEmbeds] = useState<Embed[]>(initial)
  const [url, setUrl] = useState('')
  const [caption, setCaption] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const lines = url.split(/[\n\s]+/).map((l) => l.trim()).filter(Boolean)
  const platform = lines[0] ? detectPlatform(lines[0]) : null

  async function add() {
    if (!lines.length) return
    setBusy(true); setErr(null)
    let added = 0; const fails: string[] = []
    for (const u of lines) {
      try {
        const r = await fetch('/api/studija/embeds', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          // Pavadinimą taikom tik kai dedama viena nuoroda.
          body: JSON.stringify({ artistId, url: u, caption: lines.length === 1 ? caption : '' }),
        })
        const d = await r.json()
        if (d.ok && d.embed) { setEmbeds((p) => [d.embed, ...p]); added++ }
        else fails.push(d.error || u)
      } catch { fails.push(u) }
    }
    if (added > 0) { setUrl(''); setCaption('') }
    if (fails.length) setErr(`Pridėta ${added}, nepavyko ${fails.length}: ${fails[0]}`)
    setBusy(false)
  }

  async function remove(id: string) {
    setEmbeds((p) => p.filter((e) => e.id !== id))
    await fetch('/api/studija/embeds', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artistId, id }),
    })
  }

  const inputCls = 'w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-faint)]'

  return (
    <div className="max-w-2xl">
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5">
        <div className="font-['Outfit',sans-serif] text-base font-bold text-[var(--text-primary)]">Pridėti socialinį postą</div>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Įklijuok Instagram, Facebook, TikTok, YouTube ar X posto nuorodą — ji atsiras tavo anketoje.
          Gali dėti <b>kelias iš karto</b> — po vieną nuorodą kiekvienoje eilutėje.
        </p>
        <div className="mt-3 space-y-2">
          <textarea value={url} onChange={(e) => setUrl(e.target.value)} rows={3}
            placeholder={"https://instagram.com/p/...\nhttps://instagram.com/p/...\nhttps://youtu.be/..."}
            className={`${inputCls} resize-y`} />
          {lines.length > 1
            ? <div className="text-xs text-[var(--text-muted)]">{lines.length} nuorodos bus pridėtos</div>
            : platform && <div className="text-xs text-[var(--text-muted)]">Atpažinta: {PLATFORM_LABEL[platform]}</div>}
          {lines.length <= 1 && <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Pavadinimas (nebūtina)" className={inputCls} />}
          <div className="flex items-center gap-3">
            <button onClick={add} disabled={busy || !lines.length}
              className="rounded-full bg-[var(--accent-orange)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {busy ? 'Pridedama…' : (lines.length > 1 ? `Pridėti ${lines.length}` : 'Pridėti')}
            </button>
            {err && <span className="text-sm text-[var(--accent-red)]">{err}</span>}
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {embeds.length === 0 && <p className="text-sm text-[var(--text-muted)]">Dar nepridėjai nė vieno posto.</p>}
        {embeds.map((e) => (
          <div key={e.id} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--text-muted)]">{PLATFORM_LABEL[e.platform as keyof typeof PLATFORM_LABEL] || e.platform}</span>
              <button onClick={() => remove(e.id)} className="text-xs text-[var(--accent-red)]">Pašalinti</button>
            </div>
            <SocialEmbed url={e.url} caption={e.caption} />
          </div>
        ))}
      </div>
    </div>
  )
}
