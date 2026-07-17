'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import InboxTabs from '@/components/InboxTabs'

type Cand = {
  id: number
  video_url: string
  raw_title: string
  channel_title: string | null
  artist_raw: string | null
  title_raw: string | null
  published_at: string | null
  views_last: number | null
  velocity_vph: number | null
  matched_artist_id: number | null
  match_score: number | null
  scope: string
  status: string
  artists?: { name: string; slug: string; country: string | null } | null
}

const SCOPES: { key: string; label: string }[] = [
  { key: 'lt', label: '🇱🇹 LT' },
  { key: 'foreign', label: '🌍 Užsienio' },
  { key: 'unknown', label: '❔ Nežinomi' },
]

function fmtVph(v: number | null): string {
  if (v == null) return '—'
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k/val`
  return `${Math.round(v)}/val`
}

export default function DiscoveryInboxPage() {
  const [scope, setScope] = useState('lt')
  const [cands, setCands] = useState<Cand[]>([])
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [msg, setMsg] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/yt-discovery/candidates?scope=${scope}&status=pending&limit=150`)
      const data = await res.json()
      setCands(res.ok ? (data.candidates || []) : [])
      if (!res.ok) setMsg(data.error || 'Klaida')
    } catch (e: any) {
      setMsg(e.message || 'Tinklo klaida')
    } finally {
      setLoading(false)
    }
  }, [scope])

  useEffect(() => { load() }, [load])

  async function scan() {
    setScanning(true); setMsg('')
    try {
      const res = await fetch('/api/admin/yt-discovery/trigger', { method: 'POST' })
      const data = await res.json()
      setMsg(data.message ? data.message : `Scan: +${data.fresh ?? 0} naujų, ${data.matched ?? 0} match'intų, ${data.refreshed ?? 0} atnaujintų velocity.`)
      await load()
    } catch (e: any) {
      setMsg(e.message || 'Tinklo klaida')
    } finally {
      setScanning(false)
    }
  }

  async function act(id: number, action: 'approve' | 'reject') {
    setBusyId(id)
    try {
      const res = await fetch('/api/admin/yt-discovery/candidates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      })
      const data = await res.json()
      if (!res.ok) { setMsg(data.error || 'Klaida'); return }
      setCands(prev => prev.filter(c => c.id !== id))
    } catch (e: any) {
      setMsg(e.message || 'Tinklo klaida')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg-elevated)]">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          <Link href="/admin" className="hover:text-[var(--text-secondary)]">Admin</Link>
          <span className="text-[var(--text-faint)]">/</span>
          <span className="font-semibold text-[var(--text-secondary)]">🎵 Muzikos atradimai</span>
        </nav>

        <InboxTabs />

        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-['Outfit',sans-serif] text-2xl font-extrabold text-[var(--text-primary)]">🎵 Muzikos atradimai</h1>
          <button
            onClick={scan}
            disabled={scanning}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {scanning ? 'Skenuojama…' : 'Paleisti scan’ą dabar'}
          </button>
        </div>
        <p className="mt-1 text-[14px] text-[var(--text-muted)]">
          YouTube velocity discovery (punktas A). Rikiuota pagal views/valandą. Kol šaltiniai neaktyvuoti — sąrašas tuščias.
        </p>

        {/* Scope tabs */}
        <div className="mt-4 flex gap-1.5">
          {SCOPES.map(s => (
            <button
              key={s.key}
              onClick={() => setScope(s.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${scope === s.key ? 'bg-blue-600 text-white' : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--input-border)] hover:bg-[var(--bg-hover)]'}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {msg && <div className="mt-3 rounded-lg border border-[var(--input-border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-secondary)]">{msg}</div>}

        <div className="mt-4 space-y-2">
          {loading && <p className="text-sm text-[var(--text-muted)]">Kraunama…</p>}
          {!loading && cands.length === 0 && (
            <p className="text-sm text-[var(--text-muted)]">Nėra kandidatų šioje kategorijoje.</p>
          )}
          {cands.map(c => (
            <div key={c.id} className="rounded-xl border border-[var(--input-border)] bg-[var(--bg-surface)] p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                <span className="rounded-full border border-[var(--input-border)] bg-[var(--bg-elevated)] px-2 py-0.5 font-bold text-[var(--text-secondary)]">⚡ {fmtVph(c.velocity_vph)}</span>
                {c.views_last != null && <span>{c.views_last.toLocaleString('lt-LT')} perž.</span>}
                {c.published_at && <span>{new Date(c.published_at).toLocaleDateString('lt-LT')}</span>}
                {c.artists?.name
                  ? <span className="text-green-700">✓ {c.artists.name}{c.match_score != null ? ` (${c.match_score})` : ''}</span>
                  : <span className="text-orange-600">be atlikėjo</span>}
              </div>
              <div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{c.raw_title}</div>
              <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                {c.channel_title} · <a href={c.video_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">YouTube ↗</a>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => act(c.id, 'approve')}
                  disabled={busyId === c.id || !c.matched_artist_id}
                  title={!c.matched_artist_id ? 'Nėra susieto atlikėjo (naujo kūrimas — v2)' : ''}
                  className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-40"
                >
                  {busyId === c.id ? '…' : 'Pridėti'}
                </button>
                <button
                  onClick={() => act(c.id, 'reject')}
                  disabled={busyId === c.id}
                  className="rounded-lg border border-[var(--input-border)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
                >
                  Atmesti
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
