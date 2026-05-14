'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

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
  suggested_track_ids: number[]
  primary_artist_id: number | null
  suggested_image_url: string | null
  status: string
  created_at: string
  primary_artist: { id: number; name: string; slug: string; cover_image_url: string | null; legacy_likes: number | null } | null
}

const CATEGORY_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  release:     { label: 'Išleidimas',   icon: '💿', color: 'bg-blue-100 text-blue-700' },
  performance: { label: 'Pasirodymas',  icon: '🎤', color: 'bg-purple-100 text-purple-700' },
  tour:        { label: 'Turas',        icon: '🎫', color: 'bg-emerald-100 text-emerald-700' },
  career_step: { label: 'Karjera',      icon: '🚀', color: 'bg-orange-100 text-orange-700' },
}

function confidenceColor(c: number) {
  if (c >= 0.85) return 'text-emerald-600 bg-emerald-50'
  if (c >= 0.55) return 'text-amber-600 bg-amber-50'
  return 'text-red-500 bg-red-50'
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

  const toggleExpand = useCallback(async (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    if (!bodies[id]) {
      try {
        const res = await fetch(`/api/admin/news-candidates/${id}`)
        const data = await res.json()
        setBodies(prev => ({ ...prev, [id]: data.candidate?.ai_body || '' }))
      } catch {}
    }
  }, [bodies])

  const handleAction = async (id: number, action: 'approve' | 'reject', reason?: string) => {
    setBusy(id)
    try {
      const res = await fetch(`/api/admin/news-candidates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(`Klaida: ${data.error || 'Nežinoma'}`)
        return
      }
      setCandidates(prev => prev.filter(c => c.id !== id))
      setTotal(t => t - 1)
      if (action === 'approve' && data.slug) {
        // Open in new tab to verify
        window.open(`/news/${data.slug}`, '_blank')
      }
    } finally {
      setBusy(null)
    }
  }

  const handleReject = (id: number) => {
    const reason = prompt('Kodėl atmesti? (neprivaloma)')
    if (reason === null) return
    handleAction(id, 'reject', reason)
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
          {['all', 'release', 'performance', 'tour', 'career_step'].map(cat => (
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

        {/* Empty state */}
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
                      <div className="flex flex-wrap items-center gap-1.5 mb-1 text-xs">
                        {catMeta && (
                          <span className={`px-2 py-0.5 rounded-full font-medium ${catMeta.color}`}>
                            {catMeta.icon} {catMeta.label}
                          </span>
                        )}
                        <span className={`px-2 py-0.5 rounded-full font-bold ${confidenceColor(cand.ai_confidence)}`}>
                          ⭐ {cand.ai_confidence.toFixed(2)}
                        </span>
                        {cand.primary_artist && (
                          <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                            🎤 {cand.primary_artist.name}
                          </span>
                        )}
                        <span className="text-[var(--text-muted)]">
                          {cand.source_portal || cand.source_type}
                        </span>
                      </div>

                      <h2 className="font-bold text-[var(--text-primary)] text-base leading-snug mb-1">
                        {cand.ai_title}
                      </h2>

                      {cand.ai_summary && (
                        <p className="text-sm text-[var(--text-muted)] line-clamp-2 mb-2">
                          {cand.ai_summary}
                        </p>
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
    </div>
  )
}
