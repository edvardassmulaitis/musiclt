'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type SuggestedArtist = {
  id: number
  name: string
  slug: string
  cover_image_url: string | null
  legacy_likes: number | null
}

type Candidate = {
  id: number
  source_type: string
  source_portal: string | null
  source_url: string | null
  source_email_from: string | null
  ai_category: string
  ai_title: string
  ai_summary: string
  ai_confidence: number
  ai_model: string
  suggested_artist_ids: number[]
  suggested_artists?: SuggestedArtist[]
  suggested_track_ids: number[]
  primary_artist_id: number | null
  suggested_image_url: string | null
  status: string
  created_at: string
  primary_artist: SuggestedArtist | null
}

const CATEGORY_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  release:     { label: 'Išleidimas',   icon: '💿', color: 'bg-blue-100 text-blue-700' },
  performance: { label: 'Pasirodymas',  icon: '🎤', color: 'bg-purple-100 text-purple-700' },
  tour:        { label: 'Turas',        icon: '🎫', color: 'bg-emerald-100 text-emerald-700' },
  career_step: { label: 'Karjera',      icon: '🚀', color: 'bg-orange-100 text-orange-700' },
  other:       { label: 'Kita',         icon: '🎶', color: 'bg-gray-100 text-gray-700' },
}

function confidenceColor(c: number) {
  if (c >= 0.85) return 'text-emerald-600 bg-emerald-50'
  if (c >= 0.55) return 'text-amber-600 bg-amber-50'
  return 'text-red-500 bg-red-50'
}

function formatLikes(n: number | null | undefined): string {
  if (!n) return '0'
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export default function AdminInboxPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [busy, setBusy] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [bodies, setBodies] = useState<Record<number, string>>({})
  const [editing, setEditing] = useState<Candidate | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const q = filter === 'all' ? '' : `&category=${filter}`
      const res = await fetch(`/api/admin/news-candidates?status=pending&limit=50${q}`)
      const data = await res.json()
      setCandidates(data.candidates || [])
      setTotal(data.total || 0)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/auth/signin'); return }
    if (status === 'authenticated' && !isAdmin) { router.push('/'); return }
    if (status === 'authenticated') load()
  }, [status, isAdmin, router, load])

  const fetchBody = useCallback(async (id: number) => {
    if (bodies[id]) return bodies[id]
    try {
      const res = await fetch(`/api/admin/news-candidates/${id}`)
      const data = await res.json()
      const body = data.candidate?.ai_body || ''
      setBodies(prev => ({ ...prev, [id]: body }))
      return body
    } catch {
      return ''
    }
  }, [bodies])

  const toggleExpand = useCallback(async (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    fetchBody(id)
  }, [fetchBody])

  const openEdit = async (cand: Candidate) => {
    setEditing(cand)
    setEditTitle(cand.ai_title)
    setEditBody(await fetchBody(cand.id))
  }

  const closeEdit = () => {
    setEditing(null)
    setEditTitle('')
    setEditBody('')
  }

  const handleAction = async (id: number, action: 'approve' | 'reject', extra?: { reason?: string; title?: string; body?: string }) => {
    setBusy(id)
    try {
      const res = await fetch(`/api/admin/news-candidates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(`Klaida: ${data.error || 'Nežinoma'}`)
        return
      }
      setCandidates(prev => prev.filter(c => c.id !== id))
      setTotal(t => t - 1)
      if (action === 'approve' && data.slug) {
        window.open(`/news/${data.slug}`, '_blank')
      }
      closeEdit()
    } finally {
      setBusy(null)
    }
  }

  const handleReject = (id: number) => {
    const reason = prompt('Kodėl atmesti? (neprivaloma)')
    if (reason === null) return
    handleAction(id, 'reject', { reason })
  }

  const handleSaveEdit = async () => {
    if (!editing) return
    setSavingEdit(true)
    try {
      await handleAction(editing.id, 'approve', { title: editTitle, body: editBody })
    } finally {
      setSavingEdit(false)
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-elevated)]">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f8f7f5]">
      {/* Header bar */}
      <div className="bg-[var(--bg-surface)]/95 backdrop-blur border-b border-[var(--input-border)] sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <Link href="/admin" className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] text-sm">
              ← Admin
            </Link>
            <h1 className="text-2xl font-black text-[var(--text-primary)]">📥 Inbox</h1>
            <p className="text-xs text-[var(--text-muted)]">{total} laukia patvirtinimo</p>
          </div>
          <button
            onClick={load}
            className="px-3 py-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--bg-active)] rounded-lg text-sm text-[var(--text-secondary)]">
            ↻ Atnaujinti
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-5">
        {/* Category filter chips */}
        <div className="flex flex-wrap gap-2 mb-5">
          {['all', 'release', 'performance', 'tour', 'career_step', 'other'].map(cat => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-[var(--bg-surface)] text-[var(--text-muted)] hover:bg-[var(--bg-active)] border border-[var(--input-border)]'
              }`}>
              {cat === 'all' ? 'Visos' : `${CATEGORY_LABELS[cat]?.icon} ${CATEGORY_LABELS[cat]?.label}`}
            </button>
          ))}
        </div>

        {candidates.length === 0 ? (
          <div className="bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-2xl p-16 text-center">
            <div className="text-5xl mb-4">📭</div>
            <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">Inbox tuščias</h3>
            <p className="text-[var(--text-muted)] text-sm">
              Visi pasiūlymai peržiūrėti. Sekantis scout run'as įvyks po 07:00 arba 19:00.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {candidates.map(cand => {
              const catMeta = CATEGORY_LABELS[cand.ai_category]
              const isExpanded = expanded.has(cand.id)
              const artists = cand.suggested_artists || []
              const hasMatch = artists.length > 0

              return (
                <div
                  key={cand.id}
                  className="bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-2xl overflow-hidden hover:shadow-sm transition-shadow">
                  {/* Top row */}
                  <div className="flex gap-4 p-4">
                    {/* Thumb */}
                    {cand.suggested_image_url ? (
                      <img
                        src={cand.suggested_image_url}
                        alt=""
                        className="w-20 h-20 rounded-xl object-cover shrink-0 bg-[var(--bg-elevated)]"
                        onError={e => ((e.target as HTMLImageElement).style.display = 'none')}
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-xl bg-[var(--bg-elevated)] shrink-0 flex items-center justify-center text-3xl">
                        {catMeta?.icon || '📰'}
                      </div>
                    )}

                    {/* Body */}
                    <div className="flex-1 min-w-0">
                      {/* Meta row */}
                      <div className="flex flex-wrap items-center gap-1.5 mb-2 text-xs">
                        {catMeta && (
                          <span className={`px-2 py-0.5 rounded-full font-medium ${catMeta.color}`}>
                            {catMeta.icon} {catMeta.label}
                          </span>
                        )}
                        <span className={`px-2 py-0.5 rounded-full font-bold ${confidenceColor(cand.ai_confidence)}`}>
                          ⭐ {cand.ai_confidence.toFixed(2)}
                        </span>
                        <span className="text-[var(--text-muted)]">
                          {cand.source_portal || cand.source_type}
                        </span>
                      </div>

                      <h2 className="font-bold text-[var(--text-primary)] text-base leading-snug mb-2">
                        {cand.ai_title}
                      </h2>

                      {cand.ai_summary && (
                        <p className="text-sm text-[var(--text-muted)] line-clamp-2 mb-3">
                          {cand.ai_summary}
                        </p>
                      )}

                      {/* Artist chips */}
                      {hasMatch ? (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {artists.map(a => (
                            <Link
                              key={a.id}
                              href={`/atlikejai/${a.slug}`}
                              target="_blank"
                              className="inline-flex items-center gap-1.5 pl-1 pr-2 py-1 bg-blue-50 hover:bg-blue-100 rounded-full text-xs font-medium text-blue-700 transition-colors">
                              {a.cover_image_url ? (
                                <img src={a.cover_image_url} alt="" className="w-5 h-5 rounded-full object-cover bg-blue-100" />
                              ) : (
                                <span className="w-5 h-5 rounded-full bg-blue-200 flex items-center justify-center text-[10px]">🎤</span>
                              )}
                              <span>{a.name}</span>
                              <span className="text-[10px] text-blue-500 font-normal">❤ {formatLikes(a.legacy_likes)}</span>
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <div className="mb-3">
                          <button
                            onClick={() => {
                              const url = `/admin/artists/new?name=${encodeURIComponent(cand.ai_title.split(' ')[0])}`
                              window.open(url, '_blank')
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 hover:bg-amber-100 rounded-full text-xs font-medium text-amber-700 border border-amber-200 transition-colors">
                            <span>⚠ Atlikėjo nerasta DB</span>
                            <span className="text-amber-600">+ Sukurti naują</span>
                          </button>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => handleAction(cand.id, 'approve')}
                          disabled={busy === cand.id}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold disabled:opacity-50 transition-colors">
                          {busy === cand.id ? '...' : '✓ Patvirtinti'}
                        </button>
                        <button
                          onClick={() => openEdit(cand)}
                          disabled={busy === cand.id}
                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
                          ✎ Redaguoti
                        </button>
                        <button
                          onClick={() => toggleExpand(cand.id)}
                          className="px-3 py-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--bg-active)] rounded-lg text-sm text-[var(--text-secondary)]">
                          {isExpanded ? '▴ Sutraukti' : '▾ Peržiūrėti'}
                        </button>
                        <button
                          onClick={() => handleReject(cand.id)}
                          disabled={busy === cand.id}
                          className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium disabled:opacity-50">
                          ✗ Atmesti
                        </button>
                        {cand.source_url && (
                          <a
                            href={cand.source_url}
                            target="_blank"
                            rel="noopener"
                            className="ml-auto text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] truncate max-w-[200px]">
                            ↗ Šaltinis
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded body */}
                  {isExpanded && (
                    <div className="border-t border-[var(--border-subtle)] p-4 bg-[var(--bg-elevated)]/40">
                      {bodies[cand.id] ? (
                        <div
                          className="prose prose-sm max-w-none text-[var(--text-primary)]"
                          dangerouslySetInnerHTML={{ __html: bodies[cand.id] }}
                        />
                      ) : (
                        <p className="text-sm text-[var(--text-muted)]">Kraunama...</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[var(--bg-surface)] rounded-2xl shadow-2xl w-full max-w-3xl my-8">
            <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between sticky top-0 bg-[var(--bg-surface)] rounded-t-2xl">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">✎ Redaguoti naujieną</h2>
              <button
                onClick={closeEdit}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-2xl leading-none">
                ×
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">
                  Antraštė
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--input-border)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-blue-400 text-base"
                  placeholder="Naujienos pavadinimas..."
                />
                <p className="text-xs text-[var(--text-muted)] mt-1">{editTitle.length} simb. (rekomenduojama 60-80)</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">
                  Tekstas (HTML — naudok &lt;p&gt; tag'us)
                </label>
                <textarea
                  value={editBody}
                  onChange={e => setEditBody(e.target.value)}
                  rows={16}
                  className="w-full px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--input-border)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-blue-400 text-sm font-mono leading-relaxed"
                  placeholder="<p>Naujienos tekstas...</p>"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">
                  Peržiūra
                </label>
                <div
                  className="prose prose-sm max-w-none bg-[var(--bg-elevated)]/50 border border-[var(--border-subtle)] rounded-lg p-3"
                  dangerouslySetInnerHTML={{ __html: editBody }}
                />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-[var(--border-subtle)] flex justify-between items-center sticky bottom-0 bg-[var(--bg-surface)] rounded-b-2xl">
              <p className="text-xs text-[var(--text-muted)]">
                Šaltinio nuoroda bus pridėta automatiškai.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={closeEdit}
                  className="px-4 py-2 bg-[var(--bg-elevated)] hover:bg-[var(--bg-active)] rounded-lg text-sm font-medium text-[var(--text-secondary)]">
                  Atšaukti
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={savingEdit || !editTitle.trim() || !editBody.trim()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold">
                  {savingEdit ? '...' : '✓ Patvirtinti ir publikuoti'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
