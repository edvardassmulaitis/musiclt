'use client'

// app/admin/teksto-pasiulymai/page.tsx
// Vartotojų pasiūlytų dainų tekstų peržiūra. Approve → įrašo į tracks.lyrics.

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Item = {
  id: number
  track_id: number
  track_title: string
  artist_name: string | null
  track_href: string | null
  track_has_lyrics: boolean
  lyrics: string
  status: string
  suggested_by_username: string | null
  created_at: string
}

function fmt(ts: string): string {
  try { return new Date(ts).toLocaleString('lt-LT', { dateStyle: 'medium', timeStyle: 'short' }) } catch { return ts }
}

export default function AdminLyricsSuggestions() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const role = (session?.user as any)?.role
  const isAdmin = role === 'editor' || role === 'admin' || role === 'super_admin'

  const [tab, setTab] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<number | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/auth/signin'); return }
    if (status === 'authenticated' && !isAdmin) { router.push('/'); return }
  }, [status, isAdmin, router])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/lyrics-suggestions?status=${tab}`, { cache: 'no-store' })
      const d = await res.json()
      setItems(d.items || [])
    } catch { setItems([]) }
    setLoading(false)
  }, [tab])

  useEffect(() => { if (isAdmin) load() }, [isAdmin, load])

  const act = async (id: number, action: 'approve' | 'reject') => {
    if (busy) return
    if (action === 'reject' && !confirm('Atmesti šį teksto pasiūlymą?')) return
    setBusy(id); setMsg('')
    try {
      const res = await fetch('/api/admin/lyrics-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      })
      const d = await res.json()
      if (!res.ok) { setMsg(d.error || 'Klaida'); setBusy(null); return }
      setItems(prev => prev.filter(it => it.id !== id))
      setMsg(action === 'approve' ? 'Tekstas patvirtintas ir įrašytas.' : 'Pasiūlymas atmestas.')
    } catch { setMsg('Tinklo klaida') }
    setBusy(null)
  }

  if (status === 'loading' || !isAdmin) {
    return <div className="p-8 text-sm text-[var(--text-muted)]">Kraunama…</div>
  }

  return (
    <div className="mx-auto max-w-[900px] px-4 py-6">
      <div className="mb-4">
        <Link href="/admin" className="text-[13px] font-bold text-[var(--text-muted)] no-underline hover:text-[var(--accent-orange)]">← Admin</Link>
        <h1 className="mt-1 font-['Outfit',sans-serif] text-[22px] font-extrabold text-[var(--text-primary)]">📝 Dainų tekstų pasiūlymai</h1>
        <p className="mt-1 text-[14px] text-[var(--text-muted)]">Vartotojų pasiūlyti tekstai. Patvirtinus — įrašoma į dainą.</p>
      </div>

      <div className="mb-4 flex items-center gap-2">
        {(['pending', 'approved', 'rejected'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              "rounded-full px-3 py-1 font-['Outfit',sans-serif] text-[13px] font-bold transition-colors",
              tab === t ? 'bg-[var(--accent-orange)] text-white' : 'bg-[var(--bg-hover)] text-[var(--text-muted)]',
            ].join(' ')}
          >
            {t === 'pending' ? 'Laukia' : t === 'approved' ? 'Patvirtinti' : 'Atmesti'}
          </button>
        ))}
        <button onClick={load} className="ml-auto rounded-full border border-[var(--border-subtle)] px-3 py-1 text-[13px] font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)]">↻ Atnaujinti</button>
      </div>

      {msg && <div className="mb-3 rounded-lg bg-[rgba(249,115,22,0.1)] px-3 py-2 text-[13px] font-semibold text-[var(--accent-orange)]">{msg}</div>}

      {loading ? (
        <div className="py-10 text-center text-[14px] text-[var(--text-muted)]">Kraunama…</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-subtle)] py-12 text-center text-[14px] text-[var(--text-faint)]">
          Nėra pasiūlymų.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map(it => (
            <div key={it.id} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
              <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                {it.track_href ? (
                  <Link href={it.track_href} target="_blank" rel="noopener" className="font-['Outfit',sans-serif] text-[15px] font-extrabold text-[var(--text-primary)] no-underline hover:text-[var(--accent-orange)]">
                    {it.track_title}
                  </Link>
                ) : (
                  <span className="font-['Outfit',sans-serif] text-[15px] font-extrabold text-[var(--text-primary)]">{it.track_title}</span>
                )}
                {it.artist_name && <span className="text-[14px] text-[var(--text-muted)]">— {it.artist_name}</span>}
                {it.track_has_lyrics && (
                  <span className="rounded-full bg-[rgba(234,179,8,0.15)] px-2 py-0.5 text-[11px] font-bold text-[#b45309]">jau turi tekstą — pakeis</span>
                )}
              </div>
              <div className="mb-2 text-[12px] text-[var(--text-faint)]">
                {it.suggested_by_username ? `@${it.suggested_by_username}` : 'nežinomas'} · {fmt(it.created_at)}
              </div>
              <pre className="mb-3 max-h-[320px] overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--bg-elevated)] p-3 font-['DM_Sans',sans-serif] text-[13.5px] leading-[1.6] text-[var(--text-secondary)]">
                {it.lyrics}
              </pre>
              {tab === 'pending' && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => act(it.id, 'approve')}
                    disabled={busy === it.id}
                    className="rounded-lg bg-[var(--accent-orange)] px-3.5 py-1.5 font-['Outfit',sans-serif] text-[13px] font-extrabold text-white disabled:opacity-50"
                  >
                    {busy === it.id ? '…' : '✓ Patvirtinti'}
                  </button>
                  <button
                    onClick={() => act(it.id, 'reject')}
                    disabled={busy === it.id}
                    className="rounded-lg border border-[var(--border-subtle)] px-3.5 py-1.5 font-['Outfit',sans-serif] text-[13px] font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-50"
                  >
                    Atmesti
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
