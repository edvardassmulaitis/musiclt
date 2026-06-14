'use client'

import { useState, useRef } from 'react'

type Result = { id: number; slug: string; name: string; cover_image_url: string | null; is_claimed: boolean; country: string | null }

export default function ClaimClient() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [selected, setSelected] = useState<Result | null>(null)
  const [proofUrl, setProofUrl] = useState('')
  const [message, setMessage] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef<any>(null)

  function onSearch(v: string) {
    setQ(v); setSelected(null); setDone(null)
    clearTimeout(timer.current)
    if (v.trim().length < 2) { setResults([]); return }
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/studija/search-artists?q=${encodeURIComponent(v.trim())}`)
        const d = await r.json()
        setResults(d.results || [])
      } catch { setResults([]) }
    }, 250)
  }

  async function submit() {
    if (!selected) return
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/studija/claim', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistId: selected.id, method: 'social', proofUrl, message }),
      })
      const d = await r.json()
      if (d.ok) {
        if (d.already) setDone('Jau valdai šį profilį — eik į apžvalgą.')
        else if (d.pending) setDone('Prašymas jau pateiktas — lauk patvirtinimo.')
        else setDone('Prašymas pateiktas! Patvirtinsime ir pranešime. Paprastai per 1–2 d.')
      } else setErr(d.error || 'Nepavyko')
    } catch { setErr('Klaida') }
    setBusy(false)
  }

  const inputCls = 'w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-faint)]'

  if (done) {
    return (
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 text-center">
        <div className="text-3xl">✅</div>
        <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--text-secondary)]">{done}</p>
        <a href="/studija" className="mt-4 inline-block rounded-full bg-[var(--accent-orange)] px-5 py-2 text-sm font-semibold text-white">Į apžvalgą</a>
      </div>
    )
  }

  return (
    <div>
      <input value={q} onChange={(e) => onSearch(e.target.value)} placeholder="Ieškok savo atlikėjo vardo…" className={inputCls} autoFocus />

      {!selected && results.length > 0 && (
        <ul className="mt-2 divide-y divide-[var(--border-subtle)] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
          {results.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="h-9 w-9 overflow-hidden rounded-full bg-[var(--bg-surface)]">
                {r.cover_image_url ? <img src={r.cover_image_url} alt="" className="h-full w-full object-cover" /> : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-[var(--text-primary)]">{r.name}</div>
                {r.country && <div className="text-xs text-[var(--text-muted)]">{r.country}</div>}
              </div>
              {r.is_claimed
                ? <span className="text-xs text-[var(--text-muted)]">jau pasiimta</span>
                : <button onClick={() => { setSelected(r); setResults([]) }} className="rounded-full bg-[var(--accent-orange)] px-3 py-1 text-xs font-semibold text-white">Tai aš</button>}
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div className="mt-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 overflow-hidden rounded-full bg-[var(--bg-surface)]">
              {selected.cover_image_url ? <img src={selected.cover_image_url} alt="" className="h-full w-full object-cover" /> : null}
            </div>
            <div>
              <div className="font-semibold text-[var(--text-primary)]">{selected.name}</div>
              <button onClick={() => setSelected(null)} className="text-xs text-[var(--accent-link)]">keisti</button>
            </div>
          </div>

          <label className="mt-4 block text-xs text-[var(--text-muted)]">
            Patvirtinimui: įdėk nuorodą į savo oficialų soc. tinklą (kuriame matytume, kad čia tu)
          </label>
          <input value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} placeholder="https://instagram.com/tavo_paskyra" className={`mt-1 ${inputCls}`} />

          <label className="mt-3 block text-xs text-[var(--text-muted)]">Žinutė moderatoriui (nebūtina)</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className={`mt-1 ${inputCls} resize-y`} />

          <div className="mt-4 flex items-center gap-3">
            <button onClick={submit} disabled={busy} className="rounded-full bg-[var(--accent-orange)] px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
              {busy ? 'Siunčiama…' : 'Pateikti prašymą'}
            </button>
            {err && <span className="text-sm text-[var(--accent-red)]">{err}</span>}
          </div>
        </div>
      )}
    </div>
  )
}
