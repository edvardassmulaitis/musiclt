'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const TYPE_LABELS: Record<string, string> = {
  news: 'Naujiena', review: 'Recenzija', report: 'Reportažas',
  interview: 'Interviu', other: 'Kita',
}
const TYPE_COLORS: Record<string, string> = {
  news: 'bg-blue-100 text-blue-700',
  review: 'bg-purple-100 text-purple-700',
  report: 'bg-green-100 text-green-700',
  interview: 'bg-orange-100 text-orange-700',
  other: 'bg-gray-100 text-gray-600',
}

type NewsItem = {
  id: number
  slug: string
  title: string
  type: string
  is_featured: boolean
  is_hidden_home: boolean
  image_small_url?: string
  published_at: string
  artist?: { id: number; name: string; slug: string }
}

export default function NewsAdmin() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [news, setNews] = useState<NewsItem[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<number | null>(null)

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  const load = useCallback(async (q = '', t = '') => {
    setLoading(true)
    try {
      const res = await fetch(`/api/news?limit=50&search=${encodeURIComponent(q)}&type=${t}`)
      const data = await res.json()
      setNews(data.news || [])
      setTotal(data.total || 0)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/auth/signin'); return }
    if (status === 'authenticated' && !isAdmin) { router.push('/'); return }
    if (status === 'authenticated') load()
  }, [status, isAdmin, router, load])

  useEffect(() => {
    const t = setTimeout(() => load(search, typeFilter), 300)
    return () => clearTimeout(t)
  }, [search, typeFilter, load])

  const handleDelete = async (id: number, title: string) => {
    if (!confirm(`Ar tikrai norite ištrinti "${title}"?`)) return
    setDeleting(id)
    try {
      await fetch(`/api/news/${id}`, { method: 'DELETE' })
      setNews(prev => prev.filter(n => n.id !== id))
      setTotal(prev => prev - 1)
    } finally {
      setDeleting(null)
    }
  }

  if (status === 'loading' || loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-elevated)]">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-[#f8f7f5] p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
          <div>
            <Link href="/admin/dashboard" className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] mb-1 inline-block text-sm">
              ← Dashboard
            </Link>
            <h1 className="text-3xl font-black text-[var(--text-primary)]">📰 Naujienos</h1>
            <p className="text-[var(--text-muted)] mt-0.5 text-sm">Iš viso: {total}</p>
          </div>
          <Link href="/admin/news/new"
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-colors">
            + Nauja naujiena
          </Link>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-5">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Ieškoti naujienų..."
            className="flex-1 min-w-[200px] max-w-sm px-4 py-2.5 bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-xl text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-blue-400 text-sm"
          />
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="px-4 py-2.5 bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-blue-400 text-sm"
          >
            <option value="">Visi tipai</option>
            {Object.entries(TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        {/* List */}
        {news.length === 0 ? (
          <div className="bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-2xl p-16 text-center">
            <div className="text-5xl mb-4">📰</div>
            <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">Nėra naujienų</h3>
            <p className="text-[var(--text-muted)] mb-6 text-sm">
              {search ? 'Nieko nerasta pagal paiešką' : 'Pridėkite pirmą naujieną'}
            </p>
            {!search && (
              <Link href="/admin/news/new"
                className="inline-block px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700">
                + Pridėti naujieną
              </Link>
            )}
          </div>
        ) : (
          <div className="bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-left text-xs text-[var(--text-muted)] uppercase tracking-wide">
                  <th className="px-4 py-3">Naujiena</th>
                  <th className="px-4 py-3 hidden sm:table-cell">Tipas</th>
                  <th className="px-4 py-3 hidden md:table-cell">Atlikėjas</th>
                  <th className="px-4 py-3 hidden lg:table-cell">Data</th>
                  <th className="px-4 py-3 text-right">Veiksmai</th>
                </tr>
              </thead>
              <tbody>
                {news.map(item => (
                  <tr key={item.id} className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]/60 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {item.image_small_url ? (
                          <img src={item.image_small_url} alt=""
                            className="w-10 h-10 rounded-lg object-cover shrink-0 bg-[var(--bg-elevated)]" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-[var(--bg-elevated)] shrink-0 flex items-center justify-center text-lg">
                            📰
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-medium text-[var(--text-primary)] text-sm truncate max-w-[280px] flex items-center gap-1.5">
                            {item.is_featured && <span className="text-yellow-500 text-xs">★</span>}
                            {item.is_hidden_home && <span className="text-[var(--text-faint)] text-xs">👁</span>}
                            {item.title}
                          </div>
                          <div className="text-xs text-[var(--text-muted)] mt-0.5">ID: {item.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[item.type] || TYPE_COLORS.other}`}>
                        {TYPE_LABELS[item.type] || item.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {item.artist ? (
                        <span className="text-sm text-[var(--text-secondary)]">{item.artist.name}</span>
                      ) : (
                        <span className="text-[var(--text-faint)] text-sm">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-sm text-[var(--text-muted)]">
                      {new Date(item.published_at).toLocaleDateString('lt-LT')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5 justify-end">
                        <Link href={`/lt/muzika/${item.slug}/${item.id}/`} target="_blank"
                          className="px-2.5 py-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--bg-active)] rounded-lg text-xs text-[var(--text-muted)] transition-colors">
                          👁
                        </Link>
                        <Link href={`/admin/news/${item.id}`}
                          className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs transition-colors font-medium">
                          ✏️ Redaguoti
                        </Link>
                        <button
                          onClick={() => handleDelete(item.id, item.title)}
                          disabled={deleting === item.id}
                          className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-400 rounded-lg text-xs transition-colors disabled:opacity-50">
                          {deleting === item.id ? '...' : '🗑'}
                        </button>
                      </div>
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
