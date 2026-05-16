'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import InboxTabs from '@/components/InboxTabs'

type SuggestedArtist = {
  id: number
  name: string
  slug: string
  cover_image_url: string | null
  legacy_likes: number | null
}

type EventCandidate = {
  id: number
  source_portal: string | null
  source_url: string | null
  title: string
  event_date: string | null
  event_date_text: string | null
  venue_name_raw: string | null
  city: string | null
  description: string | null
  ticket_url: string | null
  price_text: string | null
  image_url: string | null
  suggested_artist_ids: number[]
  suggested_artists?: SuggestedArtist[]
  primary_artist_id: number | null
  status: string
  ai_confidence: number
  created_at: string
  primary_artist: SuggestedArtist | null
  score?: number
  score_breakdown?: { popularity: number; recency: number; confidence: number }
}

function confidenceColor(c: number) {
  if (c >= 0.7) return 'text-emerald-600 bg-emerald-50'
  if (c >= 0.4) return 'text-amber-600 bg-amber-50'
  return 'text-red-500 bg-red-50'
}

function formatLikes(n: number | null | undefined): string {
  if (!n) return '0'
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function formatDate(iso: string | null, fallback: string | null) {
  if (iso) {
    try {
      const d = new Date(iso)
      return d.toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' })
    } catch {}
  }
  return fallback || '—'
}

function relativeTimeShort(isoDate: string): string {
  const ms = Date.now() - new Date(isoDate).getTime()
  if (ms < 0) return 'dabar'
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'dabar'
  if (min < 60) return `${min}min`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const d = Math.floor(hr / 24)
  if (d < 7) return `${d}d`
  if (d < 30) return `${Math.floor(d / 7)}sav`
  if (d < 365) return `${Math.floor(d / 30)}mėn`
  return `${Math.floor(d / 365)}m`
}

export default function EventInboxPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [candidates, setCandidates] = useState<EventCandidate[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/event-candidates?status=pending&limit=50`)
      const data = await res.json()
      setCandidates(data.candidates || [])
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

  const handleAction = async (id: number, action: 'approve' | 'reject', reason?: string) => {
    setBusy(id)
    try {
      const res = await fetch(`/api/admin/event-candidates/${id}`, {
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
        window.open(`/renginiai/${data.slug}`, '_blank')
      }
    } finally {
      setBusy(null)
    }
  }

  // 1-click reject — be confirmation. Alt+click → su reason (power-user)
  const handleReject = (id: number, e?: React.MouseEvent) => {
    if (e?.altKey) {
      const reason = prompt('Atmetimo priežastis:')
      if (reason === null) return
      handleAction(id, 'reject', reason)
    } else {
      handleAction(id, 'reject')
    }
  }

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
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
      {/* Compact header — match news inbox style */}
      <div className="bg-[var(--bg-surface)]/95 backdrop-blur border-b border-[var(--input-border)] sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-3 py-2 flex items-center gap-2">
          <Link href="/admin" className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] text-base" title="Admin">
            ←
          </Link>
          <h1 className="text-base font-bold text-[var(--text-primary)]">📥 Inbox</h1>
          <span className="text-xs text-[var(--text-muted)]">({total})</span>
          <button
            onClick={load}
            title="Atnaujinti"
            aria-label="Atnaujinti"
            className="ml-auto w-7 h-7 flex items-center justify-center bg-[var(--bg-elevated)] hover:bg-[var(--bg-active)] rounded text-[var(--text-secondary)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3">
        <InboxTabs />

        {candidates.length === 0 ? (
          <div className="bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-2xl p-16 text-center">
            <div className="text-5xl mb-4">🎫</div>
            <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">Renginių inbox'as tuščias</h3>
            <p className="text-[var(--text-muted)] text-sm">
              Visi pasiūlymai peržiūrėti. Sekantis events scout vyks 08:00 / 20:00 UTC.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {candidates.map(cand => {
              const artists = cand.suggested_artists || []
              const hasMatch = artists.length > 0
              const visibleArtists = artists.slice(0, 3)
              const extraArtistsCount = Math.max(0, artists.length - 3)
              const isExpanded = expanded.has(cand.id)
              const score = cand.score ?? cand.ai_confidence
              const breakdown = cand.score_breakdown
              const scoreTooltip = breakdown
                ? `popularity ${breakdown.popularity} × recency ${breakdown.recency} × confidence ${breakdown.confidence}`
                : `confidence ${cand.ai_confidence}`

              return (
                <div
                  key={cand.id}
                  className="bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-2xl overflow-hidden hover:shadow-sm transition-shadow">
                  <div className="flex gap-3 p-3 sm:gap-4 sm:p-4">
                    {cand.image_url ? (
                      <img
                        src={cand.image_url}
                        alt=""
                        className="hidden sm:block w-20 h-20 sm:w-24 sm:h-24 rounded-xl object-cover shrink-0 bg-[var(--bg-elevated)]"
                        onError={e => ((e.target as HTMLImageElement).style.display = 'none')}
                      />
                    ) : (
                      <div className="hidden sm:flex w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-amber-100 shrink-0 items-center justify-center text-3xl">
                        🎫
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      {/* Meta row */}
                      <div className="flex flex-wrap items-center gap-1.5 mb-2 text-xs">
                        <span
                          title={scoreTooltip}
                          className={`px-2 py-0.5 rounded-full font-bold ${confidenceColor(score)}`}>
                          ⭐ {score.toFixed(2)}
                        </span>
                        {cand.source_url ? (
                          <a
                            href={cand.source_url}
                            target="_blank"
                            rel="noopener"
                            className="text-[var(--text-muted)] hover:text-blue-600 underline-offset-2 hover:underline">
                            {cand.source_portal} ↗
                          </a>
                        ) : (
                          <span className="text-[var(--text-muted)]">{cand.source_portal}</span>
                        )}
                        <span className="text-[var(--text-muted)] opacity-60" title={`Surinkta: ${new Date(cand.created_at).toLocaleString('lt-LT')}`}>
                          · 🔄 {relativeTimeShort(cand.created_at)}
                        </span>
                      </div>

                      {/* Title — tap to expand description */}
                      <h2
                        onClick={() => toggleExpand(cand.id)}
                        className="font-bold text-[var(--text-primary)] text-base leading-snug mb-1 cursor-pointer">
                        {cand.title}
                      </h2>

                      {/* Event details */}
                      <div className="text-sm text-[var(--text-secondary)] space-y-0.5 mb-2">
                        <p>📅 {formatDate(cand.event_date, cand.event_date_text)}</p>
                        {(cand.venue_name_raw || cand.city) && (
                          <p className="text-[var(--text-muted)]">
                            📍 {[cand.venue_name_raw, cand.city].filter(Boolean).join(', ')}
                          </p>
                        )}
                        {cand.price_text && (
                          <p className="text-[var(--text-muted)]">💶 {cand.price_text}</p>
                        )}
                      </div>

                      {/* Artist chips */}
                      {hasMatch ? (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {visibleArtists.map(a => (
                            <Link
                              key={a.id}
                              href={`/atlikejai/${a.slug}`}
                              target="_blank"
                              className="inline-flex items-center gap-1.5 pl-1 pr-2 py-1 bg-blue-50 hover:bg-blue-100 rounded-full text-xs font-medium text-blue-700">
                              {a.cover_image_url ? (
                                <img src={a.cover_image_url} alt="" className="w-5 h-5 rounded-full object-cover bg-blue-100" />
                              ) : (
                                <span className="w-5 h-5 rounded-full bg-blue-200 flex items-center justify-center text-[10px]">🎤</span>
                              )}
                              <span>{a.name}</span>
                              <span className="text-[10px] text-blue-500 font-normal">❤ {formatLikes(a.legacy_likes)}</span>
                            </Link>
                          ))}
                          {extraArtistsCount > 0 && (
                            <span className="inline-flex items-center px-2 py-1 bg-[var(--bg-elevated)] rounded-full text-xs text-[var(--text-muted)]">
                              +{extraArtistsCount}
                            </span>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-amber-600 mb-3">⚠ Atlikėjo nerasta DB</p>
                      )}

                      {/* Actions — 2 primary big buttons matching news inbox */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleAction(cand.id, 'approve')}
                          disabled={busy === cand.id || !cand.event_date}
                          title={!cand.event_date ? 'event_date privaloma — redaguok rankomis' : undefined}
                          className="flex-1 sm:flex-none px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-sm font-bold disabled:opacity-50 transition-colors">
                          {busy === cand.id ? '...' : '✓ Patvirtinti'}
                        </button>
                        <button
                          onClick={(e) => handleReject(cand.id, e)}
                          disabled={busy === cand.id}
                          title="Atmesti (alt+click → su priežastimi)"
                          className="flex-1 sm:flex-none px-4 py-2 bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-600 rounded-lg text-sm font-bold disabled:opacity-50">
                          ✗ Atmesti
                        </button>
                        {cand.ticket_url && (
                          <a
                            href={cand.ticket_url}
                            target="_blank"
                            rel="noopener"
                            title="Bilietų puslapis"
                            className="px-2 py-2 text-xs text-blue-600 hover:bg-blue-50 rounded-lg shrink-0">
                            🎟
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded description */}
                  {isExpanded && cand.description && (
                    <div className="border-t border-[var(--border-subtle)] p-4 bg-[var(--bg-elevated)]/40">
                      <div
                        className="prose prose-sm max-w-none text-[var(--text-primary)]"
                        dangerouslySetInnerHTML={{ __html: cand.description }}
                      />
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
