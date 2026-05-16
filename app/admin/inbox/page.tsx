'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import WikimediaSearch from '@/components/WikimediaSearch'
import type { Photo } from '@/components/PhotoGallery'
// InboxTabs nebenaudoja — events merged į main feed (žr. žemiau)
import ArtistSearchInput from '@/components/ui/ArtistSearchInput'
import TrackSuggestPicker, { type PickResult } from '@/components/TrackSuggestPicker'
import dynamic from 'next/dynamic'

// Tiptap WYSIWYG — naudojam vietoj raw HTML textarea (be HTML tag'ų matomumo,
// patogus formatting toolbar viršuje, B/I/U/lists/links, etc.)
const RichTextEditor = dynamic(() => import('@/components/RichTextEditor'), { ssr: false })

type SuggestedArtist = {
  id: number
  name: string
  slug: string
  cover_image_url: string | null
  legacy_likes: number | null
}

type AiTrackMention = {
  title: string
  artist: string
  matched_track_id: number | null
  youtube_url: string | null
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
  source_published_at: string | null
  ai_tracks_mentioned: AiTrackMention[] | null
  embed_urls: string[] | null
  primary_artist: SuggestedArtist | null
  score?: number
  score_breakdown?: { popularity: number; recency: number; confidence: number }
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

// Kompaktiškas relatyvus laikas: 5m, 2h, 3d, 1sav, 2mėn
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

// Event candidate tipas — minimalus, kad galim rodyti unified feed'e
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
  image_url: string | null
  primary_artist_id: number | null
  primary_artist: SuggestedArtist | null
  suggested_artists?: SuggestedArtist[]
  ai_confidence: number
  created_at: string
}

type FeedItem =
  | { kind: 'news'; created_at: string; data: Candidate }
  | { kind: 'event'; created_at: string; data: EventCandidate }

export default function AdminInboxPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [events, setEvents] = useState<EventCandidate[]>([])
  const [total, setTotal] = useState(0)
  const [eventsTotal, setEventsTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [busy, setBusy] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [bodies, setBodies] = useState<Record<number, string>>({})
  const [editing, setEditing] = useState<Candidate | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  const [editImage, setEditImage] = useState('')
  const [imageOptions, setImageOptions] = useState<Array<{ url: string; label: string; source: string }>>([])
  const [showWiki, setShowWiki] = useState(false)
  const [wikiArtistName, setWikiArtistName] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  // Wizard'o artist'ų state — visi pasirinkti į sąrašą (order'is = sort_order news_artists'e)
  const [editArtistIds, setEditArtistIds] = useState<number[]>([])
  const [editPrimaryId, setEditPrimaryId] = useState<number | null>(null)
  const [artistMeta, setArtistMeta] = useState<Record<number, SuggestedArtist>>({})
  const [artistSearchOpen, setArtistSearchOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  // Body scroll lock kai edit modal'as atidarytas — užkerta iOS rubber-band
  // scroll'inimą per fixed wrapper'į ir page scroll'o leak'ą kai modal'as veikia.
  // Defensive cleanup į '' (ne prev) — kad neliktų stuck 'hidden' jeigu
  // ankstesnis modal'as koks fail'ino.
  useEffect(() => {
    if (!editing) return
    document.body.style.overflow = 'hidden'
    document.body.style.overscrollBehavior = 'contain'
    return () => {
      document.body.style.overflow = ''
      document.body.style.overscrollBehavior = ''
    }
  }, [editing])
  // Wizard'o track'ų state — pasirinkti DB track_ids (matched + naujai sukurti)
  const [editTrackIds, setEditTrackIds] = useState<number[]>([])
  const [trackMeta, setTrackMeta] = useState<Record<number, { id: number; title: string; artist_name: string }>>({})
  // Track picker modal state
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerInitialQuery, setPickerInitialQuery] = useState<string>('')

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const q = filter === 'all' ? '' : `&category=${filter}`
      // Parallel fetch news + events. Events ne'turi category filter'io, todėl
      // kviečiam visada visus, o vizualiai filtruoti UI'aj jei reikės.
      const [newsRes, eventsRes] = await Promise.all([
        fetch(`/api/admin/news-candidates?status=pending&limit=50${q}`),
        fetch(`/api/admin/event-candidates?status=pending&limit=50`),
      ])
      const data = await newsRes.json()
      setCandidates(data.candidates || [])
      setTotal(data.total || 0)
      try {
        const eventsData = await eventsRes.json()
        setEvents(eventsData.candidates || [])
        setEventsTotal(eventsData.total || 0)
      } catch {
        setEvents([])
        setEventsTotal(0)
      }
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
    setEditImage('')
    // ─── Artist'ų wizard state'as ───
    // Default: TIK primary selected. AI dažnai pasiūlo per daug ne-esminių
    // atlikėjų (Rolling Stones article → +McCartney + Robert Smith + Steve
    // Winwood). User'is gali pridėti kitus per chip'ų click arba paiešką.
    const suggested = cand.suggested_artists || []
    const primaryId = cand.primary_artist_id || suggested[0]?.id || null

    // Meta visiems suggested (kad galima būtų rodyti kaip „siūlomi" chip'us)
    const meta: Record<number, SuggestedArtist> = {}
    for (const a of suggested) meta[a.id] = a
    if (cand.primary_artist && !meta[cand.primary_artist.id]) {
      meta[cand.primary_artist.id] = cand.primary_artist
    }
    setArtistMeta(meta)

    // Selected = tik primary (user gali click'inti suggested chip'us, kad pridėtų)
    setEditArtistIds(primaryId ? [primaryId] : [])
    setEditPrimaryId(primaryId)

    // Tracks: matched (suggested_track_ids) default checked
    setEditTrackIds(cand.suggested_track_ids || [])
    setTrackMeta({}) // bus papildyta kai user'is sukuria tracks
    // Image picker options
    try {
      const res = await fetch(`/api/admin/news-candidates/${cand.id}/images`)
      const data = await res.json()
      setImageOptions(data.options || [])
      if (data.options?.[0]) setEditImage(data.options[0].url)
    } catch {
      setImageOptions([])
    }
    setWikiArtistName(suggested[0]?.name || cand.primary_artist?.name || '')
  }

  const removeEditArtist = (id: number) => {
    setEditArtistIds(prev => prev.filter(x => x !== id))
    if (editPrimaryId === id) {
      setEditPrimaryId(prev => {
        const remaining = editArtistIds.filter(x => x !== id)
        return remaining[0] || null
      })
    }
  }

  const addEditArtist = (id: number, name: string, avatar: string | null) => {
    if (editArtistIds.includes(id)) return
    setEditArtistIds(prev => [...prev, id])
    setArtistMeta(prev => ({
      ...prev,
      [id]: { id, name, slug: '', cover_image_url: avatar, legacy_likes: null },
    }))
    if (!editPrimaryId) setEditPrimaryId(id)
  }

  const closeEdit = () => {
    setEditing(null)
    setEditTitle('')
    setEditBody('')
    setEditImage('')
    setImageOptions([])
    setShowWiki(false)
    setEditArtistIds([])
    setEditPrimaryId(null)
    setArtistMeta({})
    setEditTrackIds([])
    setTrackMeta({})
    setPickerOpen(false)
    setPickerInitialQuery('')
  }

  const toggleEditTrack = (id: number) => {
    setEditTrackIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const openTrackPicker = (initialQuery: string = '') => {
    const targetArtistId = editPrimaryId || editArtistIds[0]
    if (!targetArtistId) {
      alert('Pirma priskirk bent vieną atlikėją.')
      return
    }
    setPickerInitialQuery(initialQuery)
    setPickerOpen(true)
  }

  const handlePickerManyResults = (results: PickResult[]) => {
    if (!results || results.length === 0) {
      setPickerOpen(false)
      return
    }
    setTrackMeta(prev => {
      const next = { ...prev }
      for (const r of results) {
        next[r.track_id] = { id: r.track_id, title: r.title, artist_name: r.artist_name }
      }
      return next
    })
    setEditTrackIds(prev => {
      const set = new Set(prev)
      for (const r of results) set.add(r.track_id)
      return Array.from(set)
    })
    // Pridedam visus YT thumbs į image options
    setImageOptions(prev => {
      const out = [...prev]
      for (const r of results) {
        if (!r.video_url) continue
        const vid = r.video_url.match(/[?&]v=([^&]+)/)?.[1] || r.video_url.match(/youtu\.be\/([^?&]+)/)?.[1]
        if (!vid) continue
        const thumbUrl = `https://img.youtube.com/vi/${vid}/hqdefault.jpg`
        if (!out.some(o => o.url === thumbUrl)) {
          out.push({ url: thumbUrl, label: `${r.artist_name} — ${r.title}`.slice(0, 60), source: 'youtube_thumb' })
        }
      }
      return out
    })
    setPickerOpen(false)
  }

  const handleAction = async (id: number, action: 'approve' | 'reject', extra?: { reason?: string; title?: string; body?: string; image_url?: string }) => {
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

  // 1-click reject — be confirmation dialog'o, be reason. Power-user reason'o
  // funkcionalumas (alt+click → su reason) gali būti pridėtas vėliau jei reikia.
  const handleReject = (id: number, e?: React.MouseEvent) => {
    const withReason = e?.altKey === true
    if (withReason) {
      const reason = prompt('Atmetimo priežastis:')
      if (reason === null) return
      handleAction(id, 'reject', { reason })
    } else {
      handleAction(id, 'reject', {})
    }
  }

  const handleSaveEdit = async () => {
    if (!editing) return
    const ordered = editPrimaryId
      ? [editPrimaryId, ...editArtistIds.filter(id => id !== editPrimaryId)]
      : editArtistIds
    setSavingEdit(true)
    try {
      await handleAction(editing.id, 'approve', {
        title: editTitle,
        body: editBody,
        image_url: editImage || undefined,
        artist_ids: ordered,
        primary_artist_id: editPrimaryId,
        track_ids: editTrackIds,
      } as any)
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
      {/* Header bar — kompaktiškas, viskas vienoje eilutėje */}
      <div className="bg-[var(--bg-surface)]/95 backdrop-blur border-b border-[var(--input-border)] sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-3 py-2 flex items-center gap-2">
          <Link href="/admin" className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] text-base" title="Admin">
            ←
          </Link>
          <h1 className="text-base font-bold text-[var(--text-primary)]">📥 Inbox</h1>
          <span className="text-xs text-[var(--text-muted)]" title={`Naujienos: ${total} · Renginiai: ${eventsTotal}`}>
            ({total + eventsTotal})
          </span>
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
        {/* Events merged į main feed žemiau, atskira tab nebereikia */}
        {/* Category filter — icon-only chips mobile'e, su label desktop'e */}
        <div className="flex flex-wrap gap-1 mb-3 overflow-x-auto -mx-1 px-1">
          {['all', 'release', 'performance', 'tour', 'career_step', 'other'].map(cat => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              title={cat === 'all' ? 'Visos' : CATEGORY_LABELS[cat]?.label}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                filter === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-[var(--bg-surface)] text-[var(--text-muted)] hover:bg-[var(--bg-active)] border border-[var(--input-border)]'
              }`}>
              {cat === 'all'
                ? 'Visos'
                : (
                  <>
                    <span>{CATEGORY_LABELS[cat]?.icon}</span>
                    <span className="hidden sm:inline ml-1">{CATEGORY_LABELS[cat]?.label}</span>
                  </>
                )}
            </button>
          ))}
        </div>

        {candidates.length === 0 && events.length === 0 ? (
          <div className="bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-2xl p-16 text-center">
            <div className="text-5xl mb-4">📭</div>
            <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">Inbox tuščias</h3>
            <p className="text-[var(--text-muted)] text-sm">
              Visi pasiūlymai peržiūrėti. Sekantis scout run'as įvyks po 07:00 arba 19:00.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Renginių sekcija — kompaktiškos kortelės, redagavimas atskirame puslapyje */}
            {events.length > 0 && (
              <div className="space-y-2 mb-3">
                <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide flex items-center justify-between px-1">
                  <span>🎫 Renginiai ({events.length})</span>
                  <Link href="/admin/inbox/events" className="text-blue-600 hover:underline text-[10px] normal-case font-normal">
                    Tvarkyti renginius →
                  </Link>
                </div>
                {events.slice(0, 5).map(ev => (
                  <Link
                    key={`ev-${ev.id}`}
                    href={`/admin/inbox/events`}
                    className="block bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-xl px-3 py-2 hover:shadow-sm transition-shadow">
                    <div className="flex items-center gap-2">
                      {ev.image_url ? (
                        <img src={ev.image_url} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-[var(--bg-elevated)] shrink-0 flex items-center justify-center text-lg">🎫</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-[var(--text-primary)] truncate">{ev.title}</div>
                        <div className="text-[10px] text-[var(--text-muted)] truncate">
                          {ev.event_date_text || (ev.event_date && new Date(ev.event_date).toLocaleDateString('lt-LT'))}
                          {ev.venue_name_raw && ` · ${ev.venue_name_raw}`}
                          {ev.city && ` · ${ev.city}`}
                        </div>
                      </div>
                      <span className="text-[10px] text-[var(--text-muted)] shrink-0">{relativeTimeShort(ev.created_at)}</span>
                    </div>
                  </Link>
                ))}
                {events.length > 5 && (
                  <Link href="/admin/inbox/events" className="block text-center text-xs text-blue-600 hover:underline py-1">
                    + Dar {events.length - 5} renginiai →
                  </Link>
                )}
              </div>
            )}
            {/* Naujienos sekcija */}
            {candidates.length > 0 && events.length > 0 && (
              <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide px-1 pt-2">
                📰 Naujienos ({candidates.length})
              </div>
            )}
            {candidates.map(cand => {
              const catMeta = CATEGORY_LABELS[cand.ai_category]
              const isExpanded = expanded.has(cand.id)
              const artists = cand.suggested_artists || []
              const hasMatch = artists.length > 0

              // Mobile-first: rodome max 3 artist chips, likusius — kaip "+N"
              const visibleArtists = artists.slice(0, 3)
              const extraArtistsCount = Math.max(0, artists.length - 3)

              return (
                <div
                  key={cand.id}
                  className="bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-2xl overflow-hidden hover:shadow-sm transition-shadow">
                  {/* Top row — be source image (copyright). Mažesnis category icon
                     placeholder'is mobile'e, kad daugiau erdvės title'ui */}
                  <div className="flex gap-3 p-3 sm:gap-4 sm:p-4">
                    <div className="hidden sm:flex w-20 h-20 rounded-xl bg-[var(--bg-elevated)] shrink-0 items-center justify-center text-3xl">
                      {catMeta?.icon || '📰'}
                    </div>

                    {/* Body */}
                    <div className="flex-1 min-w-0">
                      {/* Meta row */}
                      <div className="flex flex-wrap items-center gap-1.5 mb-2 text-xs">
                        {catMeta && (
                          <span className={`px-2 py-0.5 rounded-full font-medium ${catMeta.color}`}>
                            {catMeta.icon} {catMeta.label}
                          </span>
                        )}
                        {(() => {
                          const score = cand.score ?? cand.ai_confidence
                          const breakdown = cand.score_breakdown
                          const tooltip = breakdown
                            ? `Score = popularity (${breakdown.popularity}) × recency (${breakdown.recency}) × confidence (${breakdown.confidence})`
                            : `AI confidence: ${cand.ai_confidence}`
                          return (
                            <span
                              title={tooltip}
                              className={`px-2 py-0.5 rounded-full font-bold ${confidenceColor(score)}`}>
                              ⭐ {score.toFixed(2)}
                            </span>
                          )
                        })()}
                        {cand.source_url ? (
                          <a
                            href={cand.source_url}
                            target="_blank"
                            rel="noopener"
                            className="text-[var(--text-muted)] hover:text-blue-600 underline-offset-2 hover:underline">
                            {cand.source_portal || cand.source_type} ↗
                          </a>
                        ) : (
                          <span className="text-[var(--text-muted)]">
                            {cand.source_portal || cand.source_type}
                          </span>
                        )}
                        {/* Source publication date */}
                        {cand.source_published_at && (
                          <span className="text-[var(--text-muted)]" title={`Šaltinio publikacija: ${new Date(cand.source_published_at).toLocaleString('lt-LT')}`}>
                            · {new Date(cand.source_published_at).toLocaleDateString('lt-LT', { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                        {/* Scraped timestamp — kada AI surinko (atnaujinimo proxy) */}
                        <span className="text-[var(--text-muted)] opacity-60" title={`Surinkta į DB: ${new Date(cand.created_at).toLocaleString('lt-LT')}`}>
                          · 🔄 {relativeTimeShort(cand.created_at)}
                        </span>
                      </div>

                      {/* Title — tap to expand'ina peržiūrą */}
                      <h2
                        onClick={() => toggleExpand(cand.id)}
                        className="font-bold text-[var(--text-primary)] text-base sm:text-base leading-snug mb-2 cursor-pointer">
                        {cand.ai_title}
                      </h2>

                      {cand.ai_summary && (
                        <p
                          onClick={() => toggleExpand(cand.id)}
                          className="text-sm text-[var(--text-muted)] line-clamp-3 sm:line-clamp-2 mb-3 cursor-pointer">
                          {cand.ai_summary}
                        </p>
                      )}

                      {/* Artist chips — max 3 visible, likusius "+N" */}
                      {hasMatch ? (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {visibleArtists.map(a => (
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
                          {extraArtistsCount > 0 && (
                            <span className="inline-flex items-center px-2 py-1 bg-[var(--bg-elevated)] rounded-full text-xs text-[var(--text-muted)]">
                              +{extraArtistsCount}
                            </span>
                          )}
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

                      {/* Actions — direct approve panaikintas; viskas eina per wizard'ą
                         (modalas atidaromas „Peržiūrėti", kuriame nustatomi atlikėjai, nuotrauka, tekstas).
                         Tik atmesti likęs 1-click, nes nereikalauja setup'o. */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(cand)}
                          disabled={busy === cand.id}
                          className="flex-1 sm:flex-none px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-sm font-bold disabled:opacity-50 transition-colors">
                          📝 Peržiūrėti & paskelbti
                        </button>
                        <button
                          onClick={(e) => handleReject(cand.id, e)}
                          disabled={busy === cand.id}
                          title="Atmesti (alt+click → su priežastimi)"
                          className="flex-1 sm:flex-none px-4 py-2 bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-600 rounded-lg text-sm font-bold disabled:opacity-50">
                          ✗ Atmesti
                        </button>
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

      {/* Track suggest picker modal — visa muzikos management'as čia */}
      {editing && pickerOpen && (editPrimaryId || editArtistIds[0]) && (() => {
        const targetArtistId = editPrimaryId || editArtistIds[0]
        const targetArtist = artistMeta[targetArtistId]
        const targetName = targetArtist?.name || editing.primary_artist?.name || ''
        const embedUrls: string[] = editing.embed_urls || []
        const mentions = editing.ai_tracks_mentioned || []
        return (
          <TrackSuggestPicker
            artistId={targetArtistId}
            artistName={targetName}
            initialQuery={pickerInitialQuery}
            embedUrls={embedUrls}
            aiMentions={mentions}
            alreadySelectedIds={editTrackIds}
            onPickMany={handlePickerManyResults}
            onClose={() => setPickerOpen(false)}
          />
        )
      })()}

      {/* Wikimedia search modal */}
      {editing && showWiki && wikiArtistName && (
        <WikimediaSearch
          artistName={wikiArtistName}
          onAddMultiple={(photos: Photo[]) => {
            if (photos[0]?.url) {
              setEditImage(photos[0].url)
              // Pridėti į image options sąrašą, kad būtų matomas pasirinkimas
              setImageOptions(prev => [
                { url: photos[0].url, label: 'Wikimedia', source: 'wiki' },
                ...prev,
              ])
            }
            setShowWiki(false)
          }}
          onClose={() => setShowWiki(false)}
        />
      )}

      {/* Edit modal — mobile: TRUE fullscreen (min-h-screen, jokio pilkojo
         backdrop'o peek kai scroll'inama). Desktop: centered card su backdrop. */}
      {editing && (
        <div
          className="fixed inset-0 z-50 sm:bg-black/60 sm:backdrop-blur-sm flex items-stretch sm:items-center justify-center sm:p-4 overflow-y-auto"
          style={{ overscrollBehavior: 'contain' }}
        >
          <div className="bg-[var(--bg-surface)] sm:rounded-2xl sm:shadow-2xl w-full max-w-3xl sm:my-4 min-h-screen sm:min-h-0 flex flex-col">
            <div className="px-3 py-2 sm:px-4 sm:py-3 border-b border-[var(--border-subtle)] sticky top-0 bg-[var(--bg-surface)] sm:rounded-t-2xl z-10">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col min-w-0 flex-1">
                  <h2 className="text-sm sm:text-base font-bold text-[var(--text-primary)] leading-tight">✎ Redaguoti naujieną</h2>
                  <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                    {editing.source_portal && (
                      <a href={editing.source_url || '#'} target="_blank" rel="noopener" className="hover:underline truncate">
                        {editing.source_portal} ↗
                      </a>
                    )}
                    {(editing.source_published_at || editing.created_at) && (
                      <span>· {new Date(editing.source_published_at || editing.created_at).toLocaleDateString('lt-LT', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    )}
                  </div>
                </div>
                {/* Preview toggle header'yje — vietoj details apačioje */}
                {editBody.trim() && (
                  <button
                    type="button"
                    onClick={() => setPreviewOpen(v => !v)}
                    className="text-[10px] sm:text-xs px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded font-medium shrink-0">
                    {previewOpen ? '▴ Slėpti peržiūrą' : '▾ Peržiūra'}
                  </button>
                )}
                <button
                  onClick={closeEdit}
                  aria-label="Uždaryti"
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-2xl leading-none shrink-0">
                  ×
                </button>
              </div>
              {/* Expandable preview iškart po header — sticky scope */}
              {previewOpen && editBody.trim() && (
                <div
                  className="prose prose-sm max-w-none bg-[var(--bg-elevated)]/50 border border-[var(--border-subtle)] rounded-lg p-3 mt-2 max-h-[40vh] overflow-y-auto"
                  dangerouslySetInnerHTML={{ __html: editBody }}
                />
              )}
            </div>
            <div className="px-3 py-2 sm:px-4 sm:py-3 space-y-3 sm:space-y-4">
              {/* Peržiūra — perkelta į header (toggle button + slidable panel). */}
              {/* === Atlikėjai === */}
              <div>
                <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">
                  Atlikėjai
                </div>
                {/* Vienoje eilutėje: selected chips + AI suggested (dashed) + search toggle */}
                <div className="flex flex-wrap items-center gap-1">
                  {editArtistIds.length === 0 && (
                    <span className="text-xs text-amber-600">⚠ Nepriskirtas</span>
                  )}
                  {editArtistIds.map(id => {
                    const a = artistMeta[id]
                    if (!a) return null
                    const isPrimary = id === editPrimaryId
                    return (
                      <div
                        key={id}
                        className={`inline-flex items-center gap-1 pl-0.5 pr-0.5 py-0.5 rounded-full text-xs font-medium ${
                          isPrimary
                            ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-400'
                            : 'bg-blue-50 text-blue-700'
                        }`}>
                        <button type="button" onClick={() => setEditPrimaryId(id)} className="flex items-center gap-1 px-1">
                          {a.cover_image_url ? (
                            <img src={a.cover_image_url} alt="" className="w-4 h-4 rounded-full object-cover" />
                          ) : (
                            <span className="w-4 h-4 rounded-full bg-blue-200 flex items-center justify-center text-[9px]">🎤</span>
                          )}
                          <span>{isPrimary ? '★ ' : ''}{a.name}</span>
                        </button>
                        <button type="button" onClick={() => removeEditArtist(id)} aria-label="Pašalinti"
                          className="w-4 h-4 rounded-full hover:bg-red-200 text-red-500 flex items-center justify-center text-xs">×</button>
                      </div>
                    )
                  })}
                  {/* AI suggested — inline, no header */}
                  {(() => {
                    const suggested = editing?.suggested_artists || []
                    const notYet = suggested.filter(a => !editArtistIds.includes(a.id))
                    return notYet.map(a => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => addEditArtist(a.id, a.name, a.cover_image_url)}
                        title="AI siūlo iš naujienos teksto"
                        className="inline-flex items-center gap-1 pl-0.5 pr-1.5 py-0.5 rounded-full text-xs bg-[var(--bg-elevated)] hover:bg-blue-50 text-[var(--text-muted)] hover:text-blue-700 border border-dashed border-[var(--input-border)]">
                        {a.cover_image_url ? (
                          <img src={a.cover_image_url} alt="" className="w-4 h-4 rounded-full object-cover opacity-60" />
                        ) : (
                          <span className="w-4 h-4 rounded-full bg-[var(--bg-active)] flex items-center justify-center text-[9px]">🎤</span>
                        )}
                        <span>+ {a.name}</span>
                      </button>
                    ))
                  })()}
                  {/* Compact search toggle */}
                  <button
                    type="button"
                    onClick={() => setArtistSearchOpen(v => !v)}
                    title="Ieškoti atlikėjo"
                    className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[var(--bg-elevated)] hover:bg-blue-50 text-[var(--text-muted)] hover:text-blue-700 border border-[var(--input-border)]">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
                    </svg>
                  </button>
                  {/* + Sukurti naują atlikėją — kai DB ne'rasta. Redirect į
                     /admin/artists/new?name=X kuris auto-paleidžia Wikipedia
                     paiešką. */}
                  <button
                    type="button"
                    onClick={() => {
                      const defaultName = (editing?.ai_title || '').split(/[—-]/)[0].trim().slice(0, 60)
                      const name = window.prompt('Atlikėjo pavadinimas (Wikipedia paieška auto-paleidžiama):', defaultName)
                      if (!name?.trim()) return
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

              {/* === Susijusi muzika — collapsed į vieną button'ą, picker'is valdo viską === */}
              <div>
                {(() => {
                  const mentions = editing?.ai_tracks_mentioned || []
                  const suggestedCount = mentions.length
                  const selectedCount = editTrackIds.length
                  const selectedTracks = editTrackIds.map(id => trackMeta[id]).filter(Boolean)
                  return (
                    <>
                      <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5 flex items-center justify-between">
                        <span>Muzika {selectedCount > 0 && <span className="ml-1 text-emerald-600">({selectedCount})</span>}</span>
                        <button
                          type="button"
                          onClick={() => openTrackPicker('')}
                          disabled={editArtistIds.length === 0}
                          title={editArtistIds.length === 0 ? 'Pirma priskirk atlikėją' : ''}
                          className="px-2 py-0.5 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 text-blue-700 rounded text-[10px] font-medium normal-case tracking-normal">
                            {selectedCount > 0
                              ? '🎵 Tvarkyti'
                              : '🎬 Surasti video'}
                        </button>
                      </div>
                      {selectedTracks.length === 0 ? (
                        <p className="text-[11px] text-[var(--text-muted)] italic">
                          Nepridėta dainų.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {selectedTracks.map(t => (
                            <div key={t.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 border border-emerald-200 rounded-full text-[11px]">
                              <span className="truncate max-w-[180px]">{t.title}</span>
                              <button
                                type="button"
                                onClick={() => toggleEditTrack(t.id)}
                                aria-label="Pašalinti"
                                className="w-3.5 h-3.5 rounded-full hover:bg-red-200 text-red-500 flex items-center justify-center text-xs leading-none">×</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>

              {/* === Nuotrauka === */}
              <div>
                <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">
                  Nuotrauka
                </div>
                {imageOptions.length > 0 ? (
                  <div className="grid grid-cols-4 sm:grid-cols-4 gap-1.5">
                    {imageOptions.map((opt, i) => (
                      <button
                        key={i}
                        onClick={() => setEditImage(opt.url)}
                        className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                          editImage === opt.url
                            ? 'border-blue-500 ring-2 ring-blue-200'
                            : 'border-transparent hover:border-[var(--input-border)]'
                        }`}>
                        <img
                          src={opt.url}
                          alt={opt.label}
                          className="absolute inset-0 w-full h-full object-cover bg-[var(--bg-elevated)]"
                          onError={e => ((e.target as HTMLImageElement).style.display = 'none')}
                        />
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent text-white text-[10px] px-1.5 py-1">
                          <div className="font-semibold opacity-90 leading-tight">
                            {opt.source === 'artist_photo' && '📸 Galerija'}
                            {opt.source === 'artist_cover' && '🎤 Profilio nuotrauka'}
                            {opt.source === 'youtube_thumb' && '🎬 YT thumb'}
                          </div>
                          <div className="opacity-70 truncate leading-tight">{opt.label}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-muted)] italic">Atlikėjo nuotraukų DB nėra.</p>
                )}
                <div className="flex flex-wrap gap-2 mt-2">
                  {wikiArtistName && (
                    <button
                      type="button"
                      onClick={() => setShowWiki(true)}
                      className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg text-xs font-medium border border-amber-200">
                      🔍 Wiki paieška: {wikiArtistName}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditImage('')}
                    className="px-3 py-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--bg-active)] text-[var(--text-secondary)] rounded-lg text-xs font-medium">
                    Be nuotraukos
                  </button>
                </div>
              </div>

              {/* === Antraštė === */}
              <div>
                <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">
                  Antraštė <span className="ml-1 normal-case font-normal opacity-70">{editTitle.length}/80</span>
                </div>
                <textarea
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--input-border)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-blue-400 text-base leading-snug resize-y"
                  placeholder="Naujienos pavadinimas..."
                />
              </div>
              {/* === Tekstas — Tiptap WYSIWYG (B/I/U, lists, links, paragraphs). === */}
              <div>
                <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">
                  Tekstas
                </div>
                <RichTextEditor
                  value={editBody}
                  onChange={setEditBody}
                  placeholder="Naujienos tekstas..."
                />
              </div>
            </div>
            <div className="px-3 py-2 sm:px-4 sm:py-3 border-t border-[var(--border-subtle)] flex gap-2 items-center sticky bottom-0 bg-[var(--bg-surface)] sm:rounded-b-2xl">
              <button
                onClick={closeEdit}
                className="px-3 py-1.5 sm:py-2 bg-[var(--bg-elevated)] hover:bg-[var(--bg-active)] rounded-lg text-sm font-medium text-[var(--text-secondary)]">
                Atšaukti
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={savingEdit || !editTitle.trim() || !editBody.trim() || editArtistIds.length === 0}
                title={editArtistIds.length === 0 ? 'Pridėk bent vieną atlikėją' : ''}
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
