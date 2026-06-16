'use client'
// app/admin/substiliai/page.tsx
//
// Substilių peržiūros eilė. Importai/kūrimas nerastiems žanrams kuria
// 'pending' substilius — čia adminas juos sujungia su esamais (geriausia),
// patvirtina kaip naujus arba ištrina (šiukšlės).

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Approved = { id: number; name: string; slug?: string | null }
type Genre = { id: number; name: string }
type Item = {
  id: number; name: string; slug: string; genre_id: number | null; review_note: string | null
  links: number; suggestMergeId: number | null; suggestMergeName: string | null; suggestGenreId: number | null
}

export default function AdminSubstyleReview() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [items, setItems] = useState<Item[]>([])
  const [approved, setApproved] = useState<Approved[]>([])
  const [genres, setGenres] = useState<Genre[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState('')

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'
  useEffect(() => { if (status === 'unauthenticated') router.push('/') }, [status, router])

  const load = () => {
    setLoading(true)
    fetch('/api/admin/substiliai')
      .then(r => r.json())
      .then(d => { setItems(d.items || []); setApproved(d.approved || []); setGenres(d.genres || []) })
      .finally(() => setLoading(false))
  }
  useEffect(() => { if (isAdmin) load() }, [isAdmin])

  const genreName = (id: number | null) => genres.find(g => g.id === id)?.name || '—'
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? items.filter(i => i.name.toLowerCase().includes(s)) : items
  }, [items, q])

  const act = async (payload: any, removeId: number) => {
    setBusy(removeId); setMsg('')
    const r = await fetch('/api/admin/substiliai', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    const d = await r.json()
    setBusy(null)
    if (r.ok) { setItems(prev => prev.filter(i => i.id !== removeId)); setMsg('✓ Atlikta') }
    else setMsg('Klaida: ' + (d.error || 'nepavyko'))
  }

  const autoMergeAll = async () => {
    const withSug = filtered.filter(i => i.suggestMergeId)
    if (!withSug.length) return
    if (!confirm(`Sujungti ${withSug.length} substilius su pasiūlytais atitikmenimis?`)) return
    for (const i of withSug) {
      // eslint-disable-next-line no-await-in-loop
      await act({ action: 'merge', id: i.id, targetId: i.suggestMergeId }, i.id)
    }
  }

  if (status === 'loading' || (isAdmin && loading)) return <div className="p-8 text-[var(--text-muted)]">Kraunama…</div>
  if (!isAdmin) return <div className="p-8">Tik administratoriams.</div>

  const sugCount = filtered.filter(i => i.suggestMergeId).length

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Substilių peržiūra</h1>
        <Link href="/admin/genres" className="text-sm text-blue-600 hover:underline">← Žanrai</Link>
      </div>
      <p className="text-sm text-[var(--text-muted)] mb-4">
        Naujai sukurti / nerasti substiliai. Sujunk su esamu (geriausia), patvirtink kaip naują
        po pagrindiniu žanru, arba ištrink šiukšlę. Liko: <b>{items.length}</b>
      </p>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Ieškoti…"
          className="px-3 py-1.5 border border-[var(--input-border)] rounded-lg text-sm w-48" />
        <button onClick={autoMergeAll} disabled={!sugCount}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 text-white disabled:opacity-40">
          Auto-sujungti su pasiūlymais ({sugCount})
        </button>
        {msg && <span className="text-sm text-[var(--text-muted)]">{msg}</span>}
      </div>

      {filtered.length === 0
        ? <p className="text-[var(--text-muted)] py-8 text-center">Nieko nelaukia peržiūros 🎉</p>
        : <div className="space-y-2">
            {filtered.map(i => (
              <ReviewRow key={i.id} item={i} approved={approved} genres={genres} busy={busy === i.id}
                genreName={genreName} onMerge={(t) => act({ action: 'merge', id: i.id, targetId: t }, i.id)}
                onApprove={(g) => act({ action: 'approve', id: i.id, genreId: g }, i.id)}
                onDelete={() => { if (confirm(`Ištrinti „${i.name}"? (${i.links} ryšiai)`)) act({ action: 'delete', id: i.id }, i.id) }} />
            ))}
          </div>}
    </div>
  )
}

function ReviewRow({ item, approved, genres, busy, genreName, onMerge, onApprove, onDelete }: {
  item: Item; approved: Approved[]; genres: Genre[]; busy: boolean
  genreName: (id: number | null) => string
  onMerge: (targetId: number) => void; onApprove: (genreId: number | null) => void; onDelete: () => void
}) {
  const [mergeId, setMergeId] = useState<string>(item.suggestMergeId ? String(item.suggestMergeId) : '')
  const [genreId, setGenreId] = useState<string>(item.suggestGenreId ? String(item.suggestGenreId) : '')

  return (
    <div className={`border border-[var(--border-subtle)] rounded-xl p-3 ${busy ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="min-w-0">
          <span className="font-semibold text-[var(--text-primary)]">{item.name}</span>
          <span className="ml-2 text-xs text-[var(--text-muted)]">{item.links} ryšiai · siūlomas žanras: {genreName(item.suggestGenreId)}</span>
          {item.suggestMergeName &&
            <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
              panašu į „{item.suggestMergeName}"
            </span>}
        </div>
        <button onClick={onDelete} disabled={busy}
          className="shrink-0 text-xs px-2 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50">Ištrinti</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="flex items-center gap-1.5">
          <select value={mergeId} onChange={e => setMergeId(e.target.value)}
            className="flex-1 min-w-0 px-2 py-1.5 border border-[var(--input-border)] rounded-lg text-sm">
            <option value="">Sujungti su…</option>
            {approved.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button onClick={() => mergeId && onMerge(Number(mergeId))} disabled={busy || !mergeId}
            className="shrink-0 text-sm px-3 py-1.5 rounded-lg bg-blue-600 text-white font-medium disabled:opacity-40">Sujungti</button>
        </div>
        <div className="flex items-center gap-1.5">
          <select value={genreId} onChange={e => setGenreId(e.target.value)}
            className="flex-1 min-w-0 px-2 py-1.5 border border-[var(--input-border)] rounded-lg text-sm">
            <option value="">Pagrindinis žanras…</option>
            {genres.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <button onClick={() => onApprove(genreId ? Number(genreId) : null)} disabled={busy || !genreId}
            className="shrink-0 text-sm px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-medium disabled:opacity-40">Patvirtinti naują</button>
        </div>
      </div>
    </div>
  )
}
