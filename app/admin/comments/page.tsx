'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

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
    // Для admin используем специальный endpoint
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
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const visibleComments = comments.filter(c => {
    if (filter === 'reported') return c.reported_count > 0 && !c.is_deleted
    if (filter === 'deleted') return c.is_deleted
    return !c.is_deleted
  })

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/admin" className="text-gray-500 hover:text-white text-sm transition-colors">← Admin</Link>
          <span className="text-gray-600">/</span>
          <h1 className="text-2xl font-black text-white">💬 Komentarų moderavimas</h1>
        </div>

        {msg && (
          <div className="mb-4 px-4 py-2.5 rounded-xl bg-green-500/15 border border-green-500/25 text-green-400 text-sm">{msg}</div>
        )}

        {/* Filters + bulk */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {([
              ['all', 'Visi'],
              ['reported', '⚠️ Pranešti'],
              ['deleted', 'Pašalinti'],
            ] as const).map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filter === k ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                {l}
              </button>
            ))}
          </div>

          <select value={entityFilter} onChange={e => setEntityFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:outline-none">
            <option value="all">Visos vietos</option>
            {Object.entries(ENTITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>

          {selected.length > 0 && (
            <button onClick={bulkDelete}
              className="ml-auto px-4 py-2 rounded-xl text-xs font-bold text-red-400 bg-red-500/15 hover:bg-red-500/25 border border-red-500/25 transition-colors">
              Šalinti {selected.length} pažymėtų
            </button>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : visibleComments.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
            <p className="text-gray-400">Nėra komentarų šiame filtre.</p>
          </div>
        ) : (
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs text-gray-500 uppercase tracking-wide">
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
              <tbody>
                {visibleComments.map(c => (
                  <tr key={c.id} className={`border-b border-white/5 hover:bg-white/5 transition-colors ${selected.includes(c.id) ? 'bg-blue-500/5' : ''}`}>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggleSelect(c.id)} className="rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-semibold text-gray-400 mb-0.5">{c.author_name || 'Archyvinis'}</p>
                      <p className="text-sm text-white line-clamp-2">{c.body || '[Pašalintas]'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-500">{ENTITY_LABELS[c.entity_type] || c.entity_type}</span>
                      <p className="text-xs text-gray-700">#{c.entity_id}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {c.reported_count > 0 && (
                        <span className="text-xs font-bold text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full">
                          {c.reported_count}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{timeAgo(c.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      {!c.is_deleted && (
                        <button onClick={() => deleteComment(c.id)}
                          className="text-xs text-red-500/60 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-red-500/10">
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
