'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

type Comment = {
  id: number; entity_type: string; entity_id: number
  user_id: string | null; author_name: string | null
  body: string; is_deleted: boolean; reported_count: number
  like_count: number; created_at: string; depth: number
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins} min.`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} val.`
  return `${Math.floor(hrs / 24)} d.`
}

const ENTITY_LABELS: Record<string, string> = {
  artist: '🎤 Atlikėjas',
  album: '💿 Albumas',
  track: '🎵 Daina',
  news: '📰 Naujiena',
  event: '📅 Renginys',
  blog: '📝 Blogas',
  discussion: '💬 Diskusija',
}

export default function AdminCommentsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'reported' | 'deleted'>('all')
  const [entityFilter, setEntityFilter] = useState<string>('all')
  const [selected, setSelected] = useState<number[]>([])
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/auth/signin'); return }
    if (status === 'authenticated' && !isAdmin) { router.push('/'); return }
  }, [status, isAdmin, router])

  const load = useCallback(async () => {
    if (!isAdmin) return
    setLoading(true)
    const params = new URLSearchParams({ limit: '100' })
    if (entityFilter !== 'all') params.set('entity_type', entityFilter)
    const supabaseQuery = filter === 'reported'
      ? '&reported=true'
      : filter === 'deleted' ? '&deleted=true' : ''
    const res = await fetch(`/api/admin/comments?${params}${supabaseQuery}`)
    const data = await res.json()
    setComments(data.comments || [])
    setLoading(false)
  }, [isAdmin, filter, entityFilter])

  useEffect(() => { if (status === 'authenticated') load() }, [status, load])

  const deleteComment = async (id: number) => {
    await fetch(`/api/comments?id=${id}`, { method: 'DELETE' })
    setComments(prev => prev.map(c => c.id === id ? { ...c, is_deleted: true } : c))
    setMsg('Pašalinta ✓')
    setTimeout(() => setMsg(''), 2000)
  }

  const bulkDelete = async () => {
    if (!selected.length || !confirm(`Šalinti ${selected.length} komentarų?`)) return
    await Promise.all(selected.map(id => fetch(`/api/comments?id=${id}`, { method: 'DELETE' })))
    setComments(prev => prev.map(c => selected.includes(c.id) ? { ...c, is_deleted: true } : c))
    setSelected([])
    setMsg(`Pašalinti ${selected.length} komentarai ✓`)
    setTimeout(() => setMsg(''), 3000)
  }

  const toggleSelect = (id: number) => {
    setSelected(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  if (status === 'loading') return (
    <div className="min-h-screen bg-[var(--bg-elevated)] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-music-blue border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const visibleComments = comments.filter(c => {
    if (filter === 'reported') return c.reported_count > 0 && !c.is_deleted
    if (filter === 'deleted') return c.is_deleted
    return !c.is_deleted
  })

  return (
    <div className="min-h-screen bg-[var(--bg-elevated)]">
      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Komentarų moderavimas</h1>
            <p className="text-[var(--text-muted)] text-sm mt-1">{visibleComments.length} komentarų</p>
          </div>
        </div>

        {msg && (
          <div className="mb-4 px-4 py-2.5 rounded-xl bg-[var(--status-success-bg)] border border-[var(--status-success-text)]/20 text-[var(--status-success-text)] text-sm">{msg}</div>
        )}

        {/* Filters + bulk */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="flex gap-1 p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--input-border)]">
            {([
              ['all', 'Visi'],
              ['reported', '⚠️ Pranešti'],
              ['deleted', 'Pašalinti'],
            ] as const).map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filter === k ? 'bg-music-blue text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
                {l}
              </button>
            ))}
          </div>

          <select value={entityFilter} onChange={e => setEntityFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-sm text-[var(--input-text)] focus:outline-none">
            <option value="all">Visos vietos</option>
            {Object.entries(ENTITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>

          {selected.length > 0 && (
            <button onClick={bulkDelete}
              className="ml-auto px-4 py-2 rounded-xl text-xs font-bold text-[var(--status-error-text)] bg-[var(--status-error-bg)] hover:opacity-80 border border-[var(--status-error-text)]/20 transition-colors">
              Šalinti {selected.length} pažymėtų
            </button>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-music-blue border-t-transparent rounded-full animate-spin" />
          </div>
        ) : visibleComments.length === 0 ? (
          <div className="bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-xl p-12 text-center">
            <p className="text-[var(--text-muted)]">Nėra komentarų šiame filtre.</p>
          </div>
        ) : (
          <div className="bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-left text-xs text-[var(--text-muted)] uppercase tracking-wide font-medium">
                  <th className="px-4 py-3 w-8">
                    <input type="checkbox" onChange={e => setSelected(e.target.checked ? visibleComments.map(c => c.id) : [])}
                      checked={selected.length === visibleComments.length && visibleComments.length > 0}
                      className="rounded" />
                  </th>
                  <th className="px-4 py-3">Komentaras</th>
                  <th className="px-4 py-3 w-28">Vieta</th>
                  <th className="px-4 py-3 w-16 text-center">⚠️</th>
                  <th className="px-4 py-3 w-20">Laikas</th>
                  <th className="px-4 py-3 w-24 text-right">Veiksmai</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {visibleComments.map(c => (
                  <tr key={c.id} className={`hover:bg-[var(--bg-hover)] transition-colors ${selected.includes(c.id) ? 'bg-music-blue/5' : ''}`}>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggleSelect(c.id)} className="rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-semibold text-[var(--text-muted)] mb-0.5">{c.author_name || 'Archyvinis'}</p>
                      <p className="text-sm text-[var(--text-primary)] line-clamp-2">{c.body || '[Pašalintas]'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-[var(--text-muted)]">{ENTITY_LABELS[c.entity_type] || c.entity_type}</span>
                      <p className="text-xs text-[var(--text-faint)]">#{c.entity_id}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {c.reported_count > 0 && (
                        <span className="text-xs font-bold text-[var(--status-error-text)] bg-[var(--status-error-bg)] px-2 py-0.5 rounded-full">
                          {c.reported_count}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--text-faint)]">{timeAgo(c.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      {!c.is_deleted && (
                        <button onClick={() => deleteComment(c.id)}
                          className="text-xs text-[var(--status-error-text)]/60 hover:text-[var(--status-error-text)] transition-colors px-2 py-1 rounded hover:bg-[var(--status-error-bg)]">
                          Šalinti
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
