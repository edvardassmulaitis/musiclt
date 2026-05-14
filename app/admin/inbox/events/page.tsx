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

function formatDate(iso: string | null, fallback: string | null) {
  if (iso) {
    try {
      const d = new Date(iso)
      return d.toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' })
    } catch {}
  }
  return fallback || '—'
}

export default function EventInboxPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [candidates, setCandidates] = useState<EventCandidate[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)

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
      <div className="bg-[var(--bg-surface)]/95 backdrop-blur border-b border-[var(--input-border)] sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <Link href="/admin" className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] text-sm">
              ← Admin
            </Link>
            <h1 className="text-2xl font-black text-[var(--text-primary)]">📥 Inbox</h1>
            <p className="text-xs text-[var(--text-muted)]">{total} renginiai laukia patvirtinimo</p>
          </div>
          <button
            onClick={load}
            className="px-3 py-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--bg-active)] rounded-lg text-sm text-[var(--text-secondary)]">
            ↻ Atnaujinti
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-5">
        <InboxTabs />

        {candidates.length === 0 ? (
          <div className="bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-2xl p-16 text-center">
            <div className="text-5xl mb-4">🎫</div>
            <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">Renginių inbox'as tuščias</h3>
            <p className="text-[var(--text-muted)] text-sm">
              Visi pasiūlymai peržiūrėti. Sekantis events scout vyks 07:00 / 19:00.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {candidates.map(cand => {
              const artists = cand.suggested_artists || []
              const hasMatch = artists.length > 0
              return (
                <div
                  key={cand.id}
                  className="bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-2xl overflow-hidden hover:shadow-sm transition-shadow">
                  <div className="flex gap-4 p-4">
                    {cand.image_url ? (
                      <img
                        src={cand.image_url}
                        alt=""
                        className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl object-cover shrink-0 bg-[var(--bg-elevated)]"
                        onError={e => ((e.target as HTMLImageElement).style.display = 'none')}
                      />
                    ) : (
                      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-[var(--bg-elevated)] shrink-0 flex items-center justify-center text-3xl">
                        🎫
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-2 text-xs">
                        <span className={`px-2 py-0.5 rounded-full font-bold ${confidenceColor(cand.ai_confidence)}`}>
                          ⭐ {cand.ai_confidence.toFixed(2)}
                        </span>
                        <span className="text-[var(--text-muted)]">{cand.source_portal}</span>
                      </div>

                      <h2 className="font-bold text-[var(--text-primary)] text-base leading-snug mb-1">
                        {cand.title}
                      </h2>

                      <div className="text-sm text-[var(--text-secondary)] space-y-0.5 mb-2">
                        <p>📅 {formatDate(cand.event_date, cand.event_date_text)}</p>
                        {(cand.venue_name_raw || cand.city) && (
                          <p>📍 {[cand.venue_name_raw, cand.city].filter(Boolean).join(', ')}</p>
                        )}
                        {cand.price_text && (
                          <p>💶 {cand.price_text}</p>
                        )}
                      </div>

                      {hasMatch ? (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {artists.map(a => (
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
                        </div>
                      ) : (
                        <p className="text-xs text-amber-600 mb-3">⚠ Atlikėjo nerasta DB</p>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => handleAction(cand.id, 'approve')}
                          disabled={busy === cand.id || !cand.event_date}
                          title={!cand.event_date ? 'event_date privaloma — redaguok rankomis' : undefined}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold disabled:opacity-50 transition-colors">
                          {busy === cand.id ? '...' : '✓ Patvirtinti'}
                        </button>
                        <button
                          onClick={() => handleReject(cand.id)}
                          disabled={busy === cand.id}
                          className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium disabled:opacity-50">
                          ✗ Atmesti
                        </button>
                        {cand.ticket_url && (
                          <a
                            href={cand.ticket_url}
                            target="_blank"
                            rel="noopener"
                            className="text-xs text-blue-600 hover:underline">
                            🎟 Bilietai
                          </a>
                        )}
                        {cand.source_url && cand.source_url !== cand.ticket_url && (
                          <a
                            href={cand.source_url}
                            target="_blank"
                            rel="noopener"
                            className="ml-auto text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] truncate max-w-[160px]">
                            ↗ Šaltinis
                          </a>
                        )}
                      </div>

                      {cand.description && (
                        <details className="mt-2">
                          <summary className="text-xs text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-secondary)]">
                            Aprašymas
                          </summary>
                          <div
                            className="prose prose-sm max-w-none text-sm text-[var(--text-secondary)] mt-1"
                            dangerouslySetInnerHTML={{ __html: cand.description }}
                          />
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
