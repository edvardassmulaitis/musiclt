'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import InboxTabs from '@/components/InboxTabs'
import ArtistSearchInput from '@/components/ui/ArtistSearchInput'
import { decodeHtmlEntities } from '@/lib/html-entities'

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

  // ─── Edit-prieš-publish modalas (2026-06-11) ───
  const [editing, setEditing] = useState<EventCandidate | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editVenue, setEditVenue] = useState('')
  const [editCity, setEditCity] = useState('')
  const [editTicketUrl, setEditTicketUrl] = useState('')
  const [editImageUrl, setEditImageUrl] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editArtistIds, setEditArtistIds] = useState<number[]>([])
  const [editPrimaryId, setEditPrimaryId] = useState<number | null>(null)
  const [artistMeta, setArtistMeta] = useState<Record<number, SuggestedArtist>>({})
  const [artistSearchOpen, setArtistSearchOpen] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)

  const isAdmin = ['editor', 'admin', 'super_admin'].includes(session?.user?.role || '')

  // Body scroll lock kai modalas atidarytas
  useEffect(() => {
    if (!editing) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [editing])

  const openEdit = (cand: EventCandidate) => {
    setEditing(cand)
    setEditTitle(decodeHtmlEntities(cand.title))
    setEditDate(cand.event_date ? cand.event_date.slice(0, 10) : '')
    setEditVenue(cand.venue_name_raw || '')
    setEditCity(cand.city || '')
    setEditTicketUrl(cand.ticket_url || '')
    setEditImageUrl(cand.image_url || '')
    setEditDescription(cand.description || '')
    const suggested = cand.suggested_artists || []
    const meta: Record<number, SuggestedArtist> = {}
    for (const a of suggested) meta[a.id] = a
    if (cand.primary_artist && !meta[cand.primary_artist.id]) meta[cand.primary_artist.id] = cand.primary_artist
    setArtistMeta(meta)
    setEditArtistIds(suggested.map(a => a.id))
    setEditPrimaryId(cand.primary_artist_id || suggested[0]?.id || null)
    setArtistSearchOpen(false)
  }

  const closeEdit = () => {
    setEditing(null)
    setArtistSearchOpen(false)
  }

  const addEditArtist = (id: number, name: string, avatar: string | null) => {
    if (editArtistIds.includes(id)) return
    setEditArtistIds(prev => [...prev, id])
    setArtistMeta(prev => ({ ...prev, [id]: { id, name, slug: '', cover_image_url: avatar, legacy_likes: null } }))
    setEditPrimaryId(prev => prev || id)
  }

  const removeEditArtist = (id: number) => {
    setEditArtistIds(prev => prev.filter(x => x !== id))
    setEditPrimaryId(prev => {
      if (prev !== id) return prev
      const remaining = editArtistIds.filter(x => x !== id)
      return remaining[0] || null
    })
  }

  // Auto-detect naujo atlikėjo sukūrimą kitame tab'e (tas pats pattern'as kaip
  // news inbox'e): „+ Naujas atlikėjas" įrašo localStorage, focus event grįžus
  // search'ina DB ir auto-add'ina į modalą.
  useEffect(() => {
    if (!editing) return
    const checkPendingArtist = async () => {
      try {
        const raw = localStorage.getItem('pending_artist_creation_event')
        if (!raw) return
        const pending: { name: string; candidateId?: number; timestamp: number } = JSON.parse(raw)
        if (pending.candidateId !== editing.id) return
        if (Date.now() - pending.timestamp > 30 * 60 * 1000) {
          localStorage.removeItem('pending_artist_creation_event')
          return
        }
        const res = await fetch(`/api/artists?search=${encodeURIComponent(pending.name)}&limit=3&exact=1`)
        if (!res.ok) return
        const data = await res.json()
        const found = (data.artists || [])[0]
        if (found && found.id) {
          addEditArtist(found.id, found.name, found.cover_image_url || null)
          localStorage.removeItem('pending_artist_creation_event')
        }
      } catch {}
    }
    window.addEventListener('focus', checkPendingArtist)
    checkPendingArtist()
    return () => window.removeEventListener('focus', checkPendingArtist)
  }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleAction = async (id: number, action: 'approve' | 'reject', extra?: Record<string, any>) => {
    setBusy(id)
    try {
      const res = await fetch(`/api/admin/event-candidates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...(extra || {}) }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(`Klaida: ${data.error || 'Nežinoma'}`)
        return
      }
      setCandidates(prev => prev.filter(c => c.id !== id))
      setTotal(t => t - 1)
      closeEdit()
      if (action === 'approve' && data.slug) {
        window.open(`/renginiai/${data.slug}`, '_blank')
      }
    } finally {
      setBusy(null)
    }
  }

  const handleSaveEdit = async () => {
    if (!editing) return
    if (!editDate) { alert('Renginio data privaloma.'); return }
    const ordered = editPrimaryId
      ? [editPrimaryId, ...editArtistIds.filter(id => id !== editPrimaryId)]
      : editArtistIds
    setSavingEdit(true)
    try {
      await handleAction(editing.id, 'approve', {
        title: editTitle.trim(),
        event_date: editDate,
        venue_name: editVenue.trim() || undefined,
        city: editCity.trim() || undefined,
        ticket_url: editTicketUrl.trim() || undefined,
        image_url: editImageUrl.trim() || undefined,
        description: editDescription,
        artist_ids: ordered,
        primary_artist_id: editPrimaryId,
      })
    } finally {
      setSavingEdit(false)
    }
  }

  // 1-click reject — be confirmation. Alt+click → su reason (power-user)
  const handleReject = (id: number, e?: React.MouseEvent) => {
    if (e?.altKey) {
      const reason = prompt('Atmetimo priežastis:')
      if (reason === null) return
      handleAction(id, 'reject', { reason })
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
                        {decodeHtmlEntities(cand.title)}
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
                        <p className="text-xs text-amber-600 mb-3">⚠ Atlikėjo nerasta DB — priskirk per „Redaguoti"</p>
                      )}

                      {/* Actions — Redaguoti (edit-prieš-publish) + greitas Patvirtinti + Atmesti */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(cand)}
                          disabled={busy === cand.id}
                          className="flex-1 sm:flex-none px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-sm font-bold disabled:opacity-50 transition-colors">
                          📝 Redaguoti & paskelbti
                        </button>
                        <button
                          onClick={() => handleAction(cand.id, 'approve')}
                          disabled={busy === cand.id || !cand.event_date}
                          title={!cand.event_date ? 'Nėra datos — naudok „Redaguoti"' : 'Paskelbti be redagavimo'}
                          className="hidden sm:block px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-sm font-bold disabled:opacity-50 transition-colors">
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

      {/* ─── Edit modalas — title/data/vieta/atlikėjai prieš publish ─── */}
      {editing && (
        <div className="fixed inset-0 z-50 sm:bg-black/60 sm:backdrop-blur-sm flex items-stretch sm:items-center justify-center sm:p-4" style={{ overscrollBehavior: 'contain' }}>
          <div className="bg-[var(--bg-surface)] sm:rounded-2xl sm:shadow-2xl w-full max-w-2xl sm:max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden">
            <div className="px-3 py-2 sm:px-4 sm:py-3 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2 shrink-0">
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-bold text-[var(--text-primary)] leading-tight">🎫 Redaguoti renginį</h2>
                {editing.source_url && (
                  <a href={editing.source_url} target="_blank" rel="noopener" className="text-[10px] text-[var(--text-muted)] hover:underline truncate block">
                    {editing.source_portal} ↗
                  </a>
                )}
              </div>
              <button onClick={closeEdit} aria-label="Uždaryti" className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-2xl leading-none shrink-0">×</button>
            </div>

            <div className="px-3 py-2 sm:px-4 sm:py-3 space-y-3 flex-1 overflow-y-auto">
              {/* Atlikėjai */}
              <div>
                <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">Atlikėjai</div>
                <div className="flex flex-wrap items-center gap-1">
                  {editArtistIds.length === 0 && (
                    <span className="text-xs text-amber-600">⚠ Nepriskirtas</span>
                  )}
                  {editArtistIds.map(id => {
                    const a = artistMeta[id]
                    if (!a) return null
                    const isPrimary = id === editPrimaryId
                    return (
                      <div key={id} className={`inline-flex items-center gap-1 pl-0.5 pr-0.5 py-0.5 rounded-full text-xs font-medium ${isPrimary ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-400' : 'bg-blue-50 text-blue-700'}`}>
                        <button type="button" onClick={() => setEditPrimaryId(id)} title="Nustatyti headliner'iu" className="flex items-center gap-1 px-1">
                          {a.cover_image_url ? (
                            <img src={a.cover_image_url} alt="" className="w-4 h-4 rounded-full object-cover" />
                          ) : (
                            <span className="w-4 h-4 rounded-full bg-blue-200 flex items-center justify-center text-[9px]">🎤</span>
                          )}
                          <span>{isPrimary ? '★ ' : ''}{a.name}</span>
                        </button>
                        <button type="button" onClick={() => removeEditArtist(id)} aria-label="Pašalinti" className="w-4 h-4 rounded-full hover:bg-red-200 text-red-500 flex items-center justify-center text-xs">×</button>
                      </div>
                    )
                  })}
                  {/* AI suggested, dar nepridėti */}
                  {(editing.suggested_artists || []).filter(a => !editArtistIds.includes(a.id)).map(a => (
                    <button key={a.id} type="button" onClick={() => addEditArtist(a.id, a.name, a.cover_image_url)}
                      className="inline-flex items-center gap-1 pl-0.5 pr-1.5 py-0.5 rounded-full text-xs bg-[var(--bg-elevated)] hover:bg-blue-50 text-[var(--text-muted)] hover:text-blue-700 border border-dashed border-[var(--input-border)]">
                      <span className="w-4 h-4 rounded-full bg-[var(--bg-active)] flex items-center justify-center text-[9px]">🎤</span>
                      <span>+ {a.name}</span>
                    </button>
                  ))}
                  <button type="button" onClick={() => setArtistSearchOpen(v => !v)} title="Ieškoti atlikėjo"
                    className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[var(--bg-elevated)] hover:bg-blue-50 text-[var(--text-muted)] hover:text-blue-700 border border-[var(--input-border)]">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const defaultName = (decodeHtmlEntities(editing.title) || '').split(/[—–:|@]/)[0].trim().slice(0, 60)
                      const name = window.prompt('Atlikėjo pavadinimas (Wikipedia paieška auto-paleidžiama):', defaultName)
                      if (!name?.trim()) return
                      try {
                        localStorage.setItem('pending_artist_creation_event', JSON.stringify({
                          name: name.trim(),
                          candidateId: editing.id,
                          timestamp: Date.now(),
                        }))
                      } catch {}
                      window.open(`/admin/artists/new?name=${encodeURIComponent(name.trim())}`, '_blank')
                    }}
                    title="Sukurti naują atlikėją DB'oje su Wikipedia importu"
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-dashed border-emerald-300">
                    + Naujas atlikėjas
                  </button>
                </div>
                {artistSearchOpen && (
                  <div className="mt-1.5">
                    <ArtistSearchInput
                      placeholder="Ieškoti atlikėjo..."
                      onSelect={(id, name, avatar) => { addEditArtist(id, name, avatar || null); setArtistSearchOpen(false) }}
                    />
                  </div>
                )}
              </div>

              {/* Pavadinimas */}
              <div>
                <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">Pavadinimas</div>
                <input
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--input-border)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-blue-400 text-sm"
                />
              </div>

              {/* Data + miestas + vieta */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div>
                  <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">Data *</div>
                  <input
                    type="date"
                    value={editDate}
                    onChange={e => setEditDate(e.target.value)}
                    className="w-full px-2 py-2 bg-[var(--bg-elevated)] border border-[var(--input-border)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-blue-400 text-sm"
                  />
                  {!editDate && editing.event_date_text && (
                    <p className="text-[10px] text-amber-600 mt-0.5">Šaltinis: „{editing.event_date_text}"</p>
                  )}
                </div>
                <div>
                  <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">Miestas</div>
                  <input
                    value={editCity}
                    onChange={e => setEditCity(e.target.value)}
                    placeholder="Vilnius"
                    className="w-full px-2 py-2 bg-[var(--bg-elevated)] border border-[var(--input-border)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-blue-400 text-sm"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">Vieta</div>
                  <input
                    value={editVenue}
                    onChange={e => setEditVenue(e.target.value)}
                    placeholder="Compensa, Lukiškių kalėjimas..."
                    className="w-full px-2 py-2 bg-[var(--bg-elevated)] border border-[var(--input-border)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-blue-400 text-sm"
                  />
                </div>
              </div>

              {/* Bilietai + foto URL */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">Bilietų URL</div>
                  <input
                    value={editTicketUrl}
                    onChange={e => setEditTicketUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-2 py-2 bg-[var(--bg-elevated)] border border-[var(--input-border)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-blue-400 text-sm"
                  />
                </div>
                <div>
                  <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">Foto URL</div>
                  <div className="flex gap-2 items-center">
                    <input
                      value={editImageUrl}
                      onChange={e => setEditImageUrl(e.target.value)}
                      placeholder="https://..."
                      className="flex-1 px-2 py-2 bg-[var(--bg-elevated)] border border-[var(--input-border)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-blue-400 text-sm"
                    />
                    {editImageUrl && (
                      <img src={editImageUrl} alt="" className="w-9 h-9 rounded object-cover border border-[var(--input-border)] shrink-0" onError={e => ((e.target as HTMLImageElement).style.display = 'none')} />
                    )}
                  </div>
                </div>
              </div>

              {/* Aprašymas */}
              <div>
                <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">Aprašymas</div>
                <textarea
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--input-border)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-blue-400 text-sm leading-relaxed resize-y"
                  placeholder="Renginio aprašymas (HTML arba tekstas)..."
                />
              </div>
            </div>

            <div className="px-3 py-2 sm:px-4 sm:py-3 border-t border-[var(--border-subtle)] flex gap-2 items-center shrink-0">
              <button onClick={closeEdit} className="px-3 py-1.5 sm:py-2 bg-[var(--bg-elevated)] hover:bg-[var(--bg-active)] rounded-lg text-sm font-medium text-[var(--text-secondary)]">
                Atšaukti
              </button>
              <button
                onClick={() => handleReject(editing.id)}
                disabled={savingEdit || busy === editing.id}
                className="px-3 py-1.5 sm:py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium disabled:opacity-50">
                ✗ Atmesti
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={savingEdit || busy === editing.id || !editTitle.trim() || !editDate}
                title={!editDate ? 'Data privaloma' : ''}
                className="flex-1 px-4 py-1.5 sm:py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold">
                {savingEdit ? '...' : '✓ Paskelbti'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
