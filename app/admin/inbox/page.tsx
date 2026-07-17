'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import WikimediaSearch from '@/components/WikimediaSearch'
import type { Photo } from '@/components/PhotoGallery'
import InboxTabs from '@/components/InboxTabs'
import { useInboxCounts } from '@/components/useInboxCounts'
import ArtistSearchInput from '@/components/ui/ArtistSearchInput'
import TrackSuggestPicker, { type PickResult } from '@/components/TrackSuggestPicker'
import NewsMusicPicker from '@/components/NewsMusicPicker'
import { decodeHtmlEntities } from '@/lib/html-entities'
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
  score?: number | null
}

type AiTrackMention = {
  title: string
  artist: string
  matched_track_id: number | null
  youtube_url: string | null
}

type CandidateAttachment = {
  id: number
  public_url: string
  photographer: string | null
  copyright: string | null
  year_taken: number | null
  caption: string | null
  sort_order: number
}

type Candidate = {
  id: number
  source_type: string
  source_portal: string | null
  source_url: string | null
  source_email_from: string | null
  ai_category: string
  // 2026-05-20: ai_title/ai_body/ai_summary gali būti null jei status='preview'
  // (Tier 1 candidate prieš admin'o on-demand rewrite click'ą)
  ai_title: string | null
  ai_summary: string | null
  ai_confidence: number
  ai_model: string | null
  original_title?: string | null  // EN title preview cards rodymui
  suggested_artist_ids: number[]
  suggested_artists?: SuggestedArtist[]
  suggested_track_ids: number[]
  primary_artist_id: number | null
  suggested_image_url: string | null
  attachments?: CandidateAttachment[]
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

// Kompaktiškas view count formatter: 1234 → 1.2K, 12345678 → 12M, 1234567890 → 1.2B
function formatViewCount(n: number | null | undefined): string {
  if (!n || n <= 0) return ''
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M`
  return `${(n / 1_000_000_000).toFixed(1)}B`
}

// Trumpas "kada įkelta" žymėjimas YT video'ams: "5d", "2sav", "8mėn", "3m"
function ytAgeShort(isoDate: string | null | undefined): string {
  if (!isoDate) return ''
  const ms = Date.now() - new Date(isoDate).getTime()
  if (ms < 0) return ''
  const days = Math.floor(ms / 86_400_000)
  if (days < 1) return 'šiandien'
  if (days < 7) return `${days}d`
  if (days < 30) return `${Math.floor(days / 7)}sav`
  if (days < 365) return `${Math.floor(days / 30)}mėn`
  return `${Math.floor(days / 365)}m`
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
  const [busy, setBusy] = useState<number | null>(null)
  // 2026-07-16: atlikėjas → ISO data, kada jam paskutinį kartą paskelbta
  // naujiena (per pastarąsias 72h). Naudojama grupuoti/nuslėpti kandidatus
  // apie atlikėją, apie kurį jau ką tik paskelbta — kad flood'as (5 naujienos
  // apie tą patį atlikėją vienu metu) nebeužverstų inbox'o.
  const [recentPublishByArtist, setRecentPublishByArtist] = useState<Record<number, string>>({})
  // Rankiniu būdu atidarytos/uždarytos atlikėjų grupės (žr. groupedCandidates žemiau).
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
  // 2026-07-17: rikiavimo režimas. 'smart' = subalansuotas (recency 50% +
  // populiarumas 50%) — kad naujausios naujienos nebūtų užgožtos vien populiarių
  // atlikėjų; 'newest' = tik pagal datą; 'popular' = tik pagal populiarumą.
  const [sortMode, setSortMode] = useState<'smart' | 'newest' | 'popular'>('smart')
  // Rematch (atlikėjų priskyrimas nepriskirtiems kandidatams) būsena.
  const [rematching, setRematching] = useState(false)
  // 2026-05-20: rewriting state — kuriam candidate'ui dabar paleistas Sonnet
  // rewrite'as. UI rodo „⏳ Perrašoma..." mygtuke.
  const [rewritingIds, setRewritingIds] = useState<Set<number>>(new Set())
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [bodies, setBodies] = useState<Record<number, string>>({})
  const [editing, setEditing] = useState<Candidate | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  // Multi-image: ordered array. First = hero/primary, rest → image1..5_url legacy slots.
  const [editImages, setEditImages] = useState<string[]>([])
  const [imageOptions, setImageOptions] = useState<Array<{
    url: string
    label: string
    source: string
    video_id?: string
    yt_meta?: { title: string | null; channel_title: string | null; view_count: number | null; uploaded_at: string | null } | null
    meta?: { photographer?: string | null; copyright?: string | null; year_taken?: number | null; caption?: string | null; image_id?: number }
  }>>([])
  const [showWiki, setShowWiki] = useState(false)
  const [wikiArtistName, setWikiArtistName] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  // Wizard'o artist'ų state — visi pasirinkti į sąrašą (order'is = sort_order news_artists'e)
  const [editArtistIds, setEditArtistIds] = useState<number[]>([])
  const [editPrimaryId, setEditPrimaryId] = useState<number | null>(null)
  const [artistMeta, setArtistMeta] = useState<Record<number, SuggestedArtist>>({})
  const [artistSearchOpen, setArtistSearchOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  // Wizard'o žingsnis: 1 Turinys · 2 Video · 3 Muzika · 4 Nuotraukos → Paskelbti
  const [editStep, setEditStep] = useState(1)
  // 2026-07-17: redaguojami embed'ai (Video žingsnis) — iš candidate.embed_urls,
  // admin gali pašalinti / keisti tvarką. embedMeta — title/thumbnail/embedSrc
  // iš /api/admin/embed-meta (best-effort). playingEmbed — kuris embed'as dabar
  // atidarytas grotuvu (inline iframe).
  const [editEmbeds, setEditEmbeds] = useState<string[]>([])
  type EmbedMeta = { title: string | null; label: string; platform: string; thumbnail: string | null; embedSrc: string | null; playable: boolean }
  const [embedMeta, setEmbedMeta] = useState<Record<string, EmbedMeta>>({})
  const [playingEmbed, setPlayingEmbed] = useState<string | null>(null)

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

  // Auto-detect artist sukurimas kitame tab'e. Kai user'is paspaudžia "+ Naujas
  // atlikėjas", localStorage'e įrašomas {name, candidateId}. Šis effect'as
  // listen'ina window focus event'ą — kai user'is grįžta į news tab'ą po artist
  // sukūrimo, search'inam DB pagal name'ą ir auto-add'inam į wizard'ą.
  // Wizard'o track'ų state — pasirinkti DB track_ids (matched + naujai sukurti)
  const [editTrackIds, setEditTrackIds] = useState<number[]>([])
  const [trackMeta, setTrackMeta] = useState<Record<number, { id: number; title: string; artist_name: string; video_url?: string }>>({})
  // Track picker modal state
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerInitialQuery, setPickerInitialQuery] = useState<string>('')

  const isAdmin = ['editor', 'admin', 'super_admin'].includes(session?.user?.role || '')

  // 2026-07-17: viršutinis "📥 Inbox" badge = BENDRA suma (naujienos + renginiai
  // + albumai), ne tik naujienos. Einamos kategorijos (naujienų) dalį imam iš
  // live `total` state'o (mažėja iškart patvirtinus/atmetus), kitas kategorijas
  // — iš bendro snapshot'o. Kol snapshot'as kraunasi, fallback = news `total`.
  const { counts } = useInboxCounts()
  const grandTotal = counts ? (counts.total - counts.news + total) : total

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Parallel fetch news + events.
      const [newsRes, eventsRes] = await Promise.all([
        // 2026-07-17: limit=50 apkarpydavo sąrašą, nors tab'as rodė pilną
        // `total` (pvz. 145) — matydavai tik ~50 kandidatų (dar sugrupuotų).
        // Pakelta iki 300 (kaip renginių puslapyje), kad matomas sąrašas
        // sutaptų su count'u. fetchLimit serveryje = 400, tad telpa.
        fetch(`/api/admin/news-candidates?status=preview,pending&limit=300`),
        fetch(`/api/admin/event-candidates?status=pending&limit=50`),
      ])
      const data = await newsRes.json()
      setCandidates(data.candidates || [])
      setTotal(data.total || 0)
      setRecentPublishByArtist(data.recent_published_by_artist || {})
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
  }, [])

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/auth/signin'); return }
    if (status === 'authenticated' && !isAdmin) { router.push('/'); return }
    if (status === 'authenticated') load()
  }, [status, isAdmin, router, load])

  // 2026-06-25: Gmail foto backfill perkeltas į cron/internal route — UI
  // mygtukas (Force backfill DEBUG) + auto-trigger pašalinti. Foto auto-
  // fetch'inamos ingest metu; manualus pridėjimas — per peržiūros modal'ą.

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
    setEditStep(1)
    setEditTitle(decodeHtmlEntities(cand.ai_title || ''))
    setEditBody(await fetchBody(cand.id))
    setEditImages([])
    // ─── Video embed'ai (redaguojami) ───
    setEditEmbeds(Array.isArray(cand.embed_urls) ? cand.embed_urls : [])
    setPlayingEmbed(null)
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

    // Tracks: naujienoje identifikuotos IR kataloge rastos dainos — iškart
    // pridėtos (admin gali pašalinti). trackMeta užpildom iš ai_tracks_mentioned
    // (title + YT thumbnail), kad „Prie playerio" kortelės iškart matytųsi.
    {
      const aiMentions = cand.ai_tracks_mentioned || []
      const artistNameForMeta = cand.primary_artist?.name || suggested[0]?.name || ''
      const meta: Record<number, { id: number; title: string; artist_name: string; video_url?: string }> = {}
      const preIds: number[] = []
      for (const m of aiMentions) {
        if (m.matched_track_id && !meta[m.matched_track_id]) {
          meta[m.matched_track_id] = {
            id: m.matched_track_id,
            title: m.title,
            artist_name: m.artist || artistNameForMeta,
            video_url: m.youtube_url || undefined,
          }
          preIds.push(m.matched_track_id)
        }
      }
      setEditTrackIds(preIds.length > 0 ? preIds : (cand.suggested_track_ids || []))
      setTrackMeta(meta)
    }
    // Image picker options
    try {
      const res = await fetch(`/api/admin/news-candidates/${cand.id}/images`)
      const data = await res.json()
      setImageOptions(data.options || [])
      // Auto-select first option kaip primary (multi-select galima toliau)
      if (data.options?.[0]) setEditImages([data.options[0].url])
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

  // 2026-07-16: naujo atlikėjo sukūrimo handoff — kai admin'as per
  // ArtistSearchInput'o „+ Sukurti naują" atidaro /admin/artists/new naujame
  // tab'e (žr. mygtuką žemiau), tas tab'as po sėkmingo išsaugojimo
  // postMessage'ina atgal { type:'musiclt:artist-created', ... } ir užsidaro
  // pats. Pakeičia senesnį localStorage+focus-event polling'ą, kuris
  // praleisdavo atnaujinimus, jei user'is grįždavo be focus event'o.
  useEffect(() => {
    if (!editing) return
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      const d = e.data
      if (!d || d.type !== 'musiclt:artist-created' || d.kind !== 'news') return
      if (String(d.candidateId) !== String(editing.id)) return
      addEditArtist(d.id, d.name, d.avatar || null)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps

  const closeEdit = () => {
    setEditing(null)
    setEditStep(1)
    setEditTitle('')
    setEditBody('')
    setEditImages([])
    setImageOptions([])
    setShowWiki(false)
    setEditArtistIds([])
    setEditPrimaryId(null)
    setArtistMeta({})
    setEditTrackIds([])
    setTrackMeta({})
    setPickerOpen(false)
    setPickerInitialQuery('')
    setEditEmbeds([])
    setEmbedMeta({})
    setPlayingEmbed(null)
  }

  // 2026-07-17: pakraunam embed'ų metaduomenis (title/thumbnail/embedSrc) tik
  // Video žingsnyje, tik tiems URL'ams, kurių dar neturim. Best-effort — klaida
  // tyliai palieka be title (rodom platformą + URL).
  useEffect(() => {
    if (!editing || editStep !== 2) return
    const missing = editEmbeds.filter(u => u && !embedMeta[u])
    if (missing.length === 0) return
    let cancelled = false
    ;(async () => {
      for (const u of missing) {
        try {
          const res = await fetch(`/api/admin/embed-meta?url=${encodeURIComponent(u)}`)
          const m = await res.json()
          if (cancelled) return
          if (res.ok) setEmbedMeta(prev => ({ ...prev, [u]: m }))
        } catch { /* ignore */ }
      }
    })()
    return () => { cancelled = true }
  }, [editing, editStep, editEmbeds, embedMeta])

  const removeEmbed = (url: string) => {
    setEditEmbeds(prev => prev.filter(u => u !== url))
    setPlayingEmbed(p => (p === url ? null : p))
  }
  const moveEmbed = (index: number, dir: -1 | 1) => {
    setEditEmbeds(prev => {
      const next = [...prev]
      const j = index + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[index], next[j]] = [next[j], next[index]]
      return next
    })
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

  // 2026-07-17: NewsMusicPicker pridėjimo/šalinimo handler'iai (tik track_id;
  // komponentas pats fetch'ina tikrus DB duomenis).
  const handleAddTrack = (id: number) => {
    setEditTrackIds(prev => (prev.includes(id) ? prev : [...prev, id]))
  }
  const handleRemoveTrack = (id: number) => {
    setEditTrackIds(prev => prev.filter(x => x !== id))
  }

  const handlePickerManyResults = (results: PickResult[]) => {
    if (!results || results.length === 0) {
      setPickerOpen(false)
      return
    }
    setTrackMeta(prev => {
      const next = { ...prev }
      for (const r of results) {
        next[r.track_id] = { id: r.track_id, title: r.title, artist_name: r.artist_name, video_url: r.video_url || undefined }
      }
      return next
    })
    setEditTrackIds(prev => {
      const set = new Set(prev)
      for (const r of results) set.add(r.track_id)
      return Array.from(set)
    })
    // Pridedam visus YT thumbs į image options (NEPasirenkam automatiškai —
    // user'is renkasi kuriuos naudoti per multi-select grid)
    setImageOptions(prev => {
      const out = [...prev]
      for (const r of results) {
        if (!r.video_url) continue
        // 2026-06-11: + embed/shorts URL palaikymas (anksčiau tik watch?v= ir youtu.be)
        const vid = r.video_url.match(/[?&]v=([^&]+)/)?.[1]
          || r.video_url.match(/youtu\.be\/([^?&]+)/)?.[1]
          || r.video_url.match(/youtube\.com\/(?:embed|shorts)\/([^?&/]+)/)?.[1]
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

  // 2026-05-20: Tier 2 rewrite — admin'as paspaudžia „Perrašyti į LT" preview
  // kortelėje, ir Sonnet 4.6 sugeneruoja LT title/body/summary. Po to candidate
  // pereina iš status='preview' į status='pending' (toks pat flow kaip dabar
  // su scout pending'ais).
  const handleRewrite = async (id: number) => {
    setRewritingIds(prev => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
    try {
      const res = await fetch(`/api/admin/news-candidates/${id}/rewrite`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        alert(`Perrašymas nepavyko: ${data.error || res.status}${data.detail ? `\n${data.detail}` : ''}`)
        return
      }
      // Replace candidate state'e — dabar turi LT content + status='pending'
      setCandidates(prev => prev.map(c => c.id === id ? { ...c, ...data.candidate } : c))
    } catch (e: any) {
      alert(`Rewrite klaida: ${e?.message || e}`)
    } finally {
      setRewritingIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
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
        image_url: editImages[0] || undefined,
        image_urls: editImages, // multi-image array (pirma = hero, rest → image1..5)
        artist_ids: ordered,
        primary_artist_id: editPrimaryId,
        track_ids: editTrackIds,
        embed_urls: editEmbeds, // Video žingsnis — admin galėjo pašalinti/perrikiuoti
      } as any)
    } finally {
      setSavingEdit(false)
    }
  }

  // 2026-07-16: grupavimas pagal atlikėją — kad kelios naujienos apie tą patį
  // (populiarų) atlikėją nebeflood'intų sąrašo atskirais kortelėmis. Vieno
  // kandidato grupės renderinamos kaip anksčiau (be papildomo wrapper'io).
  // 2+ kandidatų grupės arba grupės, kur atlikėjui jau paskelbta per 72h,
  // suskleidžiamos po vienu antrašte — admin'as pamato kiekį + gali išskleisti.
  type ArtistGroup = {
    key: string
    artist: SuggestedArtist | null
    items: Candidate[]
    topScore: number
    recentPublishAt: string | null
    latestAt: string
  }
  const groupedCandidates = useMemo<ArtistGroup[]>(() => {
    const map = new Map<string, ArtistGroup>()
    for (const c of candidates) {
      const artist = c.primary_artist || (c.suggested_artists?.[0] ?? null)
      const key = artist ? `a:${artist.id}` : `c:${c.id}`
      const itemDate = c.source_published_at || c.created_at
      let g = map.get(key)
      if (!g) {
        g = {
          key,
          artist,
          items: [],
          topScore: 0,
          recentPublishAt: artist ? recentPublishByArtist[artist.id] || null : null,
          latestAt: itemDate,
        }
        map.set(key, g)
      }
      g.items.push(c)
      g.topScore = Math.max(g.topScore, c.score ?? c.ai_confidence ?? 0)
      if (new Date(itemDate).getTime() > new Date(g.latestAt).getTime()) g.latestAt = itemDate
    }
    const arr = Array.from(map.values())
    // 2026-07-17: rikiavimas priklauso nuo sortMode.
    //  • 'smart'   — subalansuotas: recency 50% + populiarumas 50% (kad
    //                naujausios naujienos nebūtų užgožtos vien populiarių atlikėjų)
    //  • 'newest'  — tik pagal naujausios grupės naujienos datą
    //  • 'popular' — tik pagal grupės rank (topScore, populiarumas dominuoja)
    const now = Date.now()
    const recencyOf = (iso: string) => {
      const ageDays = (now - new Date(iso).getTime()) / 86_400_000
      return Math.max(0, Math.exp(-ageDays / 7)) // ~7d half-life
    }
    const popOf = (g: ArtistGroup) => Math.min(1, Math.max(0, (g.artist?.score ?? 0) / 100))
    const keyOf = (g: ArtistGroup) => {
      // 'popular' rikiuoja pagal ATLIKĖJO score (tas pats 🔥, kuris rodomas grupės
      // antraštėje) — NE pagal kandidato rank (topScore), kuris apima ir recency,
      // todėl vien nauja naujiena (pvz. „1h") nebeiškelia žemo-score atlikėjo į viršų.
      if (sortMode === 'newest') return new Date(g.latestAt).getTime()
      if (sortMode === 'popular') return g.artist?.score ?? 0
      return recencyOf(g.latestAt) * 0.5 + popOf(g) * 0.5
    }
    // Grupės, kur atlikėjui jau neseniai paskelbta, nuslenka į apačią — vis dar
    // matomos (nieko netrinam), bet nebekliudo prioritetiniam srautui.
    arr.sort((a, b) => {
      const aRecent = !!a.recentPublishAt
      const bRecent = !!b.recentPublishAt
      if (aRecent !== bRecent) return aRecent ? 1 : -1
      return keyOf(b) - keyOf(a)
    })
    return arr
  }, [candidates, recentPublishByArtist, sortMode])

  const toggleGroup = (key: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // 2026-07-16: "Atmesti visus" grupės antraštėje — greitas mobile review:
  // jei atlikėjas nedomina, atmeti visas jo pending naujienas vienu paspaudimu
  // (be atidarymo po vieną). Kiekvienas reject'as — hard delete, kaip ir
  // pavienis „✗ Atmesti", tad klausiam patvirtinimo prieš masinį veiksmą.
  const handleRejectGroup = async (group: { items: Candidate[]; artist: SuggestedArtist | null }) => {
    const label = group.artist?.name || 'šio atlikėjo'
    if (!window.confirm(`Atmesti visas ${group.items.length} naujienas apie ${label}?`)) return
    await Promise.all(group.items.map(c => handleAction(c.id, 'reject', {})))
  }

  // 2026-07-17: pakartotinis atlikėjų priskyrimas nepriskirtiems kandidatams
  // (pvz. gmail naujienos, kurių atlikėjas buvo už tuometinio hint lango). Po
  // sėkmės — perkraunam sąrašą, kad priskirti kandidatai iškart sugrupuotų.
  const handleRematch = async () => {
    setRematching(true)
    try {
      const res = await fetch('/api/admin/news-candidates/rematch', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        alert(`Klaida: ${data.error || 'Nežinoma'}`)
        return
      }
      await load()
      alert(`Priskirta atlikėjų: ${data.updated} iš ${data.scanned} patikrintų.`)
    } catch (e: any) {
      alert(`Rematch klaida: ${e?.message || e}`)
    } finally {
      setRematching(false)
    }
  }

  // Kiek kandidatų sąraše dar be atlikėjo (rematch mygtuko rodymui).
  const unmatchedCount = useMemo(
    () => candidates.filter(c => !c.primary_artist && !(c.suggested_artists && c.suggested_artists.length > 0)).length,
    [candidates]
  )

  // Vienos naujienos kortelė — anksčiau buvo inline candidates.map() IIFE,
  // ištraukta į funkciją, kad ją galima būtų naudoti tiek flat sąraše
  // (dažniausias atvejis — 1 atlikėjas = 1 naujiena), tiek išskleistoje
  // atlikėjo grupėje (žr. groupedCandidates aukščiau).
  const renderCandidateCard = (cand: Candidate) => {
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

            {/* PREVIEW badge — Tier 1 candidate, dar nesugeneruotas LT
                content. Admin'as turi paspausti „Perrašyti į LT" mygtuką
                žemiau, kad būtų paleistas Sonnet rewrite'as. */}
            {cand.status === 'preview' && (
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[12px] uppercase font-semibold text-amber-700 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded">
                  Juodraštis
                </span>
                <span className="text-[14px] text-[var(--text-muted)]">
                  {cand.source_portal === 'gmail'
                    ? 'Tekstas performuluojamas paspaudus „Perrašyti"'
                    : 'LT versija sugeneruojama paspaudus „Perrašyti"'}
                </span>
              </div>
            )}

            {/* Title — tap to expand'ina peržiūrą. Preview mode'e rodom
                EN original_title (Sonnet ai_title atsiranda tik po
                „Perrašyti į LT" click'o). Preview cards NĖRA clickable —
                neturi body'o ką expand'inti. */}
            <h2
              onClick={cand.status === 'preview' ? undefined : () => toggleExpand(cand.id)}
              className={`font-bold text-base sm:text-base leading-snug mb-2 ${
                cand.status === 'preview'
                  ? 'text-[var(--text-muted)] italic'
                  : 'text-[var(--text-primary)] cursor-pointer'
              }`}>
              {decodeHtmlEntities(cand.status === 'preview'
                ? (cand.original_title || cand.ai_title || '(be antraštės)')
                : (cand.ai_title || cand.original_title || '(be antraštės)'))}
            </h2>

            {/* Summary — tik pending kortelėms (preview neturi LT
                summary'o, ji sugeneruojama per rewrite). */}
            {cand.status !== 'preview' && cand.ai_summary && (
              <p
                onClick={() => toggleExpand(cand.id)}
                className="text-sm text-[var(--text-muted)] line-clamp-3 sm:line-clamp-2 mb-3 cursor-pointer">
                {cand.ai_summary}
              </p>
            )}

            {/* Attachment'ai (Gmail foto su EXIF metadata) — pirmieji 3 thumbnail'ai */}
            {cand.attachments && cand.attachments.length > 0 && (
              <div className="mb-3">
                <div className="flex flex-wrap gap-2">
                  {cand.attachments.slice(0, 3).map(att => (
                    <div
                      key={att.id}
                      className="relative group"
                      title={[
                        att.photographer ? `📷 ${att.photographer}` : null,
                        att.copyright ? `© ${att.copyright}` : null,
                        att.year_taken ? `📅 ${att.year_taken}` : null,
                        att.caption ? `💬 ${att.caption}` : null,
                      ].filter(Boolean).join('\n') || 'Be metadata'}>
                      <img
                        src={att.public_url}
                        alt={att.caption || 'attachment'}
                        className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded border border-[var(--border)] bg-[var(--bg-elevated)]"
                      />
                      {/* Metadata overlay — bottom strip */}
                      {(att.photographer || att.copyright || att.year_taken) && (
                        <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[12px] px-1 py-0.5 rounded-b leading-tight truncate">
                          {att.photographer && <span>📷 {att.photographer}</span>}
                          {att.photographer && att.year_taken && <span> · </span>}
                          {att.year_taken && <span>{att.year_taken}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                  {cand.attachments.length > 3 && (
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded border border-[var(--border)] bg-[var(--bg-elevated)] flex items-center justify-center text-xs text-[var(--text-muted)]">
                      +{cand.attachments.length - 3}
                    </div>
                  )}
                </div>
                {/* Copyright warning'as jeigu visi attachment'ai be metadata */}
                {cand.attachments.every(a => !a.photographer && !a.copyright) && (
                  <div className="text-[12px] text-amber-600 mt-1.5">
                    ⚠ EXIF metadata nerasta — prieš publikuojant pridėk autorių/copyright per peržiūros modal'ą.
                  </div>
                )}
              </div>
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
                      <span className="w-5 h-5 rounded-full bg-blue-200 flex items-center justify-center text-[12px]">🎤</span>
                    )}
                    <span>{a.name}</span>
                    <span className="text-[12px] text-blue-500 font-normal">❤ {formatLikes(a.legacy_likes)}</span>
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
                    const titleForGuess = cand.ai_title || cand.original_title || ''
                    const url = `/admin/artists/new?name=${encodeURIComponent(titleForGuess.split(' ')[0])}`
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
               Tik atmesti likęs 1-click, nes nereikalauja setup'o.
               2026-05-20: Preview cards (Tier 1) rodo „Perrašyti į LT" vietoj
               „Peržiūrėti" — Sonnet'as paleidžiamas tik admin'o spaudimu. */}
            <div className="flex items-center gap-2">
              {cand.status === 'preview' ? (
                <button
                  onClick={() => handleRewrite(cand.id)}
                  disabled={rewritingIds.has(cand.id) || busy === cand.id}
                  className="flex-1 sm:flex-none px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-sm font-bold disabled:opacity-50 transition-colors">
                  {rewritingIds.has(cand.id) ? '⏳ Perrašoma…' : '✍ Perrašyti'}
                </button>
              ) : (
                <button
                  onClick={() => openEdit(cand)}
                  disabled={busy === cand.id}
                  className="flex-1 sm:flex-none px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-sm font-bold disabled:opacity-50 transition-colors">
                  📝 Peržiūrėti & paskelbti
                </button>
              )}
              <button
                onClick={(e) => handleReject(cand.id, e)}
                disabled={busy === cand.id || rewritingIds.has(cand.id)}
                title="Atmesti (alt+click → su priežastimi)"
                className="flex-1 sm:flex-none px-4 py-2 bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-600 rounded-lg text-sm font-bold disabled:opacity-50">
                ✗ Atmesti
              </button>
            </div>
          </div>
        </div>

        {/* Expanded body — TIK pending kortelėms. Preview state'as
            neturi LT body'o (jis sugeneruojamas tik paspaudus
            „Perrašyti į LT"). */}
        {isExpanded && cand.status !== 'preview' && (
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
          <span className="text-xs text-[var(--text-muted)]" title="Iš viso laukia: naujienos + renginiai + albumai">({grandTotal})</span>
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

        {/* Rikiavimo juostelė + rematch. 2026-07-17. */}
        {candidates.length > 0 && (
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-xs text-[var(--text-muted)]">Rikiuoti:</span>
            <div className="inline-flex rounded-lg border border-[var(--input-border)] overflow-hidden text-xs">
              {([
                { k: 'smart', label: '⚖️ Svarbiausi' },
                { k: 'newest', label: '🕐 Naujausi' },
                { k: 'popular', label: '🔥 Populiariausi' },
              ] as const).map(o => (
                <button
                  key={o.k}
                  type="button"
                  onClick={() => setSortMode(o.k)}
                  className={`px-2.5 py-1 font-medium transition-colors ${
                    sortMode === o.k
                      ? 'bg-blue-600 text-white'
                      : 'bg-[var(--bg-surface)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]'
                  }`}>
                  {o.label}
                </button>
              ))}
            </div>
            {unmatchedCount > 0 && (
              <button
                type="button"
                onClick={handleRematch}
                disabled={rematching}
                title="Bandyti automatiškai priskirti atlikėjus kandidatams be atlikėjo"
                className="ml-auto px-2.5 py-1 text-xs font-medium bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg disabled:opacity-50">
                {rematching ? '⏳ Priskiriama…' : `🔗 Priskirti atlikėjus (${unmatchedCount})`}
              </button>
            )}
          </div>
        )}

        {candidates.length === 0 ? (
          <div className="bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-2xl p-16 text-center">
            <div className="text-5xl mb-4">📭</div>
            <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">Naujienų inbox tuščias</h3>
            <p className="text-[var(--text-muted)] text-sm">
              Visi pasiūlymai peržiūrėti. Renginiai — atskirame tab'e viršuje.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* News, sugrupuotos pagal pagrindinį atlikėją — events atskirame
               tab'e per InboxTabs. VISOS grupės su atpažintu atlikėju (net ir
               1 naujienos) rodomos suskleistos po viena antrašte — vienodas
               scan'inimo ritmas (atlikėjas + pop score + naujausios data +
               kiekis), kad review'ą būtų galima daryti greitai mobile'e
               (žr. groupedCandidates aukščiau). Tik nesumatchinti kandidatai
               (be atlikėjo) rodomi tiesiogiai, nes jų grupuoti nėra pagal ką. */}
            {groupedCandidates.map(g => {
              if (!g.artist) {
                return <div key={g.key}>{renderCandidateCard(g.items[0])}</div>
              }
              const isOpen = openGroups.has(g.key)
              return (
                <div key={g.key} className="bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-2xl overflow-hidden">
                  <div className="flex items-center gap-1.5 p-3 sm:p-4">
                    <button
                      type="button"
                      onClick={() => toggleGroup(g.key)}
                      className="flex-1 min-w-0 flex items-center gap-2.5 text-left">
                      {g.artist.cover_image_url ? (
                        <img src={g.artist.cover_image_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                      ) : (
                        <span className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-lg shrink-0">🎤</span>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm text-[var(--text-primary)] truncate">
                          {g.artist.name}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-muted)]">
                          <span>{g.items.length === 1 ? '1 naujiena' : `${g.items.length} naujienos`}</span>
                          {/* 2026-07-17: „paruošta" žymė suskleistame view — kiek grupės
                             naujienų jau perrašyta (status != 'preview') ir laukia
                             peržiūros/paskelbimo. Leidžia scan'inti ką jau paruošei. */}
                          {(() => {
                            const ready = g.items.filter(i => i.status !== 'preview').length
                            if (ready === 0) return null
                            return (
                              <span
                                title="Jau perrašytos ir paruoštos peržiūrai"
                                className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">
                                ✓ {ready === g.items.length ? 'paruošta' : `${ready} paruošta`}
                              </span>
                            )
                          })()}
                          {typeof g.artist.score === 'number' && (
                            <span title="Atlikėjo populiarumo score (0-100)">🔥 {Math.round(g.artist.score)}</span>
                          )}
                          <span title="Naujausios naujienos data">🕐 {relativeTimeShort(g.latestAt)}</span>
                          {g.recentPublishAt && (
                            <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">
                              ✅ paskelbta prieš {relativeTimeShort(g.recentPublishAt)}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`text-[var(--text-muted)] transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`}>▾</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRejectGroup(g)}
                      title="Atmesti visas šios grupės naujienas"
                      className="shrink-0 px-2 py-1.5 bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-600 rounded-lg text-xs font-medium">
                      🗑 Visus
                    </button>
                  </div>
                  {isOpen && (
                    <div className="space-y-3 p-3 pt-0 sm:p-4 sm:pt-0">
                      {g.items.map(cand => renderCandidateCard(cand))}
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
            // Multi-photo support: Wikimedia photo'us pridedam visu's į options
            // ir auto-select kaip multi-image galeriją. User'is gali patikslinti.
            const newOptions = photos
              .filter(p => p.url)
              .map(p => ({ url: p.url, label: p.author ? `Wiki · ${p.author}` : 'Wikimedia', source: 'wiki' }))
            setImageOptions(prev => {
              const out = [...prev]
              for (const opt of newOptions) {
                if (!out.some(o => o.url === opt.url)) out.push(opt)
              }
              return out
            })
            // Pridedam į selected (jei dar ne)
            setEditImages(prev => {
              const out = [...prev]
              for (const opt of newOptions) {
                if (!out.includes(opt.url)) out.push(opt.url)
              }
              return out
            })
            setShowWiki(false)
          }}
          onClose={() => setShowWiki(false)}
        />
      )}

      {/* Edit modal — mobile: TRUE fullscreen, desktop: centered card su backdrop.
         Scroll'as VIDUJE modal panel'io (flex-col su flex-1 overflow body) —
         ne ant outer wrapper'io. Tai užtikrina, kad sticky header neperdengtų
         content'o kai scroll'inama (desktop bug fix). */}
      {editing && (
        <div
          className="fixed inset-0 z-50 sm:bg-black/60 sm:backdrop-blur-sm flex items-stretch sm:items-center justify-center sm:p-4"
          style={{ overscrollBehavior: 'contain' }}
        >
          <div className="bg-[var(--bg-surface)] sm:rounded-2xl sm:shadow-2xl w-full max-w-3xl sm:max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden">
            <div className="px-3 py-2 sm:px-4 sm:py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] sm:rounded-t-2xl shrink-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col min-w-0 flex-1">
                  <h2 className="text-sm sm:text-base font-bold text-[var(--text-primary)] leading-tight">✎ Redaguoti naujieną</h2>
                  <div className="flex items-center gap-1.5 text-[12px] text-[var(--text-muted)]">
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
                    className="text-[12px] sm:text-xs px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded font-medium shrink-0">
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
            {/* Stepper — 1 Turinys · 2 Video · 3 Muzika · 4 Nuotraukos */}
            <div className="flex items-center gap-1 px-3 sm:px-4 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] shrink-0">
              {[
                { n: 1, label: 'Turinys' },
                { n: 2, label: 'Video' },
                { n: 3, label: 'Muzika' },
                { n: 4, label: 'Nuotraukos' },
              ].map((s, i, arr) => (
                <div key={s.n} className="flex items-center gap-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => setEditStep(s.n)}
                    className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold transition-colors ${
                      editStep === s.n
                        ? 'bg-emerald-600 text-white'
                        : editStep > s.n
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'
                    }`}>
                    <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[12px] font-bold ${
                      editStep === s.n ? 'bg-white/25' : editStep > s.n ? 'bg-emerald-600 text-white' : 'bg-[var(--bg-active)]'
                    }`}>{editStep > s.n ? '✓' : s.n}</span>
                    <span>{s.label}</span>
                  </button>
                  {i < arr.length - 1 && <span className="text-[var(--text-faint)] text-xs">·</span>}
                </div>
              ))}
            </div>
            <div className="px-3 py-2 sm:px-4 sm:py-3 space-y-3 sm:space-y-4 flex-1 overflow-y-auto">
              {/* Peržiūra — perkelta į header (toggle button + slidable panel). */}
              {/* === Atlikėjai === (žingsnis 1: Turinys) */}
              <div className={editStep === 1 ? '' : 'hidden'}>
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
                            <span className="w-4 h-4 rounded-full bg-blue-200 flex items-center justify-center text-[12px]">🎤</span>
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
                          <span className="w-4 h-4 rounded-full bg-[var(--bg-active)] flex items-center justify-center text-[12px]">🎤</span>
                        )}
                        <span>+ {a.name}</span>
                      </button>
                    ))
                  })()}
                  {/* 2026-07-16: vienas mygtukas vietoj dviejų atskirų (paieška +
                     prompt-based "sukurti naują") — atidaro combobox'ą, kuris
                     tuo pačiu metu ir ieško DB (?check=, žr. ArtistSearchInput),
                     ir siūlo "sukurti naują", jei tikslaus matcho nėra. Taip
                     esami panašūs atlikėjai visada matomi PRIEŠ sukuriant naują. */}
                  <button
                    type="button"
                    onClick={() => setArtistSearchOpen(v => !v)}
                    title="Ieškoti arba sukurti atlikėją"
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[12px] bg-[var(--bg-elevated)] hover:bg-blue-50 text-[var(--text-muted)] hover:text-blue-700 border border-[var(--input-border)]">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
                    </svg>
                    + Atlikėjas
                  </button>
                </div>
                {artistSearchOpen && (
                  <div className="mt-1.5">
                    <ArtistSearchInput
                      placeholder="Ieškoti arba kurti naują atlikėją..."
                      autoFocus
                      // Default query — AI extracted primary artist
                      // (ai_tracks_mentioned[].artist), taip pat kaip senas prompt().
                      initialQuery={((editing?.ai_tracks_mentioned || []).map(t => t.artist?.trim()).filter(Boolean)[0] || '').slice(0, 60)}
                      onSelect={(id, name, avatar) => { addEditArtist(id, name, avatar || null); setArtistSearchOpen(false) }}
                      onCreateNew={(name) => {
                        if (!name || !editing) return
                        // Naujas tab'as pats postMessage'ins atgal po sukūrimo
                        // (žr. useEffect aukščiau) ir užsidarys.
                        window.open(`/admin/artists/new?name=${encodeURIComponent(name)}&returnAssign=1&candidateId=${editing.id}&kind=news`, '_blank')
                        setArtistSearchOpen(false)
                      }}
                    />
                  </div>
                )}
              </div>

              {/* === Žingsnis 2: Muzika — video embed'ai (info) + katalogo dainos === */}
              {/* === VIDEO (žingsnis 2): įterpti embed'ai iš straipsnio ===
                  YouTube, Instagram, TikTok, Spotify ir kt. Admin gali paleisti,
                  pašalinti, keisti tvarką. Eina po tekstu kaip įterpti video. */}
              <div className={editStep === 2 ? 'space-y-3' : 'hidden'}>
                <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                  Video / embed'ai
                  <span className="ml-1 normal-case font-normal opacity-70">({editEmbeds.length}) — eina po tekstu, tokia tvarka</span>
                </div>
                {editEmbeds.length === 0 ? (
                  <p className="text-[14px] text-[var(--text-muted)] italic">
                    Šioje naujienoje įterptų video/embed'ų nerasta.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {editEmbeds.map((u, i) => {
                      const meta = embedMeta[u]
                      const ytV = u.match(/[?&]v=([^&]+)/)?.[1] || u.match(/youtu\.be\/([^?&]+)/)?.[1] || u.match(/youtube\.com\/(?:embed|shorts)\/([^?&/]+)/)?.[1]
                      const label = meta?.label || (ytV ? 'YouTube' : 'Nuoroda')
                      const title = meta?.title || (meta ? label : null)
                      // Playeris rodomas IŠKART (be „Paleisti" clicko). YT src
                      // apskaičiuojam vietoje — nereikia laukti meta fetch'o.
                      // 2026-07-17: admin preview'e naudojam youtube.com/embed (NE
                      // youtube-nocookie) — pastarasis kai kuriems embeddable=true
                      // video meta „Playback error", nors youtube.com veikia.
                      const src = ytV ? `https://www.youtube.com/embed/${ytV}?rel=0` : (meta?.embedSrc || null)
                      const vertical = meta?.platform === 'instagram' || meta?.platform === 'tiktok'
                      return (
                        <div key={u} className="rounded-lg border border-[var(--input-border)] bg-[var(--bg-elevated)] overflow-hidden">
                          <div className="flex items-start gap-2 p-2">
                            {/* Tvarkos keitimas */}
                            <div className="flex flex-col shrink-0 pt-0.5">
                              <button type="button" onClick={() => moveEmbed(i, -1)} disabled={i === 0}
                                aria-label="Aukštyn" className="w-6 h-5 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30 leading-none">▲</button>
                              <button type="button" onClick={() => moveEmbed(i, 1)} disabled={i === editEmbeds.length - 1}
                                aria-label="Žemyn" className="w-6 h-5 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30 leading-none">▼</button>
                            </div>
                            {/* Title (pilnas, iki 2 eilučių) + platforma */}
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] font-medium text-[var(--text-primary)] leading-snug line-clamp-2">
                                {title || (meta === undefined ? 'Kraunama…' : u)}
                              </div>
                              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{label}</div>
                            </div>
                            <a href={u} target="_blank" rel="noopener" title="Atidaryti nuorodą"
                              className="shrink-0 text-[var(--text-muted)] hover:text-blue-600 text-sm mt-0.5">↗</a>
                            <button type="button" onClick={() => removeEmbed(u)} aria-label="Pašalinti" title="Pašalinti"
                              className="shrink-0 w-6 h-6 rounded-full hover:bg-red-100 text-red-500 flex items-center justify-center text-base leading-none">×</button>
                          </div>
                          {/* Playeris — visada matomas */}
                          {src ? (
                            <div className="bg-black">
                              <div className={`relative w-full mx-auto ${vertical ? 'max-w-[300px]' : ''}`} style={{ aspectRatio: vertical ? '9 / 16' : '16 / 9' }}>
                                <iframe
                                  src={src}
                                  className="absolute inset-0 w-full h-full"
                                  loading="lazy"
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                                  allowFullScreen
                                  title={title || 'Embed'}
                                />
                              </div>
                            </div>
                          ) : meta && (
                            <a href={u} target="_blank" rel="noopener"
                              className="block px-2 py-3 text-center text-[12px] text-blue-600 bg-[var(--bg-surface)] border-t border-[var(--border-subtle)]">
                              {label} įrašo peržiūra — atidaryti ↗
                            </a>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* === MUZIKA (žingsnis 3): susijusios muzikos playeris ===
                  Minimalus NewsMusicPicker — pridėtos dainos (su ×) + YouTube
                  paieška su identifikuotomis dainomis. Mount'inasi tik esant
                  šitame žingsnyje (netaško YT kvotos). */}
              <div className={editStep === 3 ? '' : 'hidden'}>
                {(() => {
                  const targetArtistId = editPrimaryId || editArtistIds[0]
                  const targetArtist = targetArtistId ? artistMeta[targetArtistId] : null
                  const targetName = targetArtist?.name || editing?.primary_artist?.name || ''
                  if (!targetArtistId) {
                    return <p className="text-[14px] text-amber-600">Pirma priskirk atlikėją (1 žingsnis „Turinys").</p>
                  }
                  return editStep === 3 ? (
                    <NewsMusicPicker
                      key={targetArtistId}
                      artistId={targetArtistId}
                      artistName={targetName}
                      mentions={editing?.ai_tracks_mentioned || []}
                      attachedIds={editTrackIds}
                      onAdd={handleAddTrack}
                      onRemove={handleRemoveTrack}
                    />
                  ) : null
                })()}
              </div>

              {/* === Nuotraukos (multi-select, ordered: 1=hero, 2-5=galerija) === (žingsnis 4) */}
              <div className={editStep === 4 ? '' : 'hidden'}>
                <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">
                  Nuotraukos
                  {editImages.length > 0 && (
                    <span className="ml-1 normal-case font-normal opacity-70">
                      ({editImages.length} pasirinkta, pirma = hero)
                    </span>
                  )}
                </div>
                {imageOptions.length > 0 ? (
                  <div className="grid grid-cols-4 sm:grid-cols-4 gap-1.5">
                    {imageOptions.map((opt, i) => {
                      const orderIdx = editImages.indexOf(opt.url)
                      const isSelected = orderIdx >= 0
                      const isPrimary = orderIdx === 0
                      return (
                        <button
                          key={i}
                          onClick={() => {
                            // Toggle multi-select: if selected, remove; else append
                            setEditImages(prev => {
                              if (prev.includes(opt.url)) return prev.filter(x => x !== opt.url)
                              if (prev.length >= 5) {
                                alert('Max 5 nuotraukos (1 hero + 4 papildomos). Pirma pašalink.')
                                return prev
                              }
                              return [...prev, opt.url]
                            })
                          }}
                          className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                            isPrimary
                              ? 'border-emerald-500 ring-2 ring-emerald-200'
                              : isSelected
                                ? 'border-blue-500 ring-1 ring-blue-200'
                                : 'border-transparent hover:border-[var(--input-border)]'
                          }`}>
                          <img
                            src={opt.url}
                            alt={opt.label}
                            className="absolute inset-0 w-full h-full object-cover bg-[var(--bg-elevated)]"
                            onError={e => ((e.target as HTMLImageElement).style.display = 'none')}
                          />
                          {isSelected && (
                            <div className={`absolute top-1 left-1 w-5 h-5 rounded-full flex items-center justify-center text-[12px] font-bold text-white ${
                              isPrimary ? 'bg-emerald-600' : 'bg-blue-600'
                            }`}>
                              {orderIdx + 1}
                            </div>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent text-white text-[12px] px-1.5 py-1">
                            <div className="font-semibold opacity-90 leading-tight">
                              {opt.source === 'email_attachment' && '📧 Press foto'}
                              {opt.source === 'artist_photo' && '📸 Galerija'}
                              {opt.source === 'artist_cover' && '🎤 Profilio nuotrauka'}
                              {opt.source === 'youtube_thumb' && '🎬 YT thumb'}
                              {opt.source === 'wiki' && '📖 Wikimedia'}
                            </div>
                            {/* Email attachment — photographer/copyright/year */}
                            {opt.source === 'email_attachment' && opt.meta ? (
                              <>
                                <div className="opacity-95 leading-tight truncate text-[12px]">
                                  {opt.meta.caption && <span>{opt.meta.caption}</span>}
                                  {!opt.meta.caption && opt.meta.photographer && <span>📷 {opt.meta.photographer}</span>}
                                </div>
                                <div className="opacity-70 leading-tight truncate text-[12px]">
                                  {opt.meta.photographer && opt.meta.caption && <span>📷 {opt.meta.photographer}</span>}
                                  {opt.meta.year_taken && <span> · {opt.meta.year_taken}</span>}
                                  {opt.meta.copyright && <span> · © {opt.meta.copyright}</span>}
                                </div>
                              </>
                            ) :
                            /* YT thumb'ams — rodom title + channel + views + age vietoj generic label'o */
                            opt.source === 'youtube_thumb' && opt.yt_meta ? (
                              <>
                                <div className="opacity-95 leading-tight truncate" title={opt.yt_meta.title || ''}>
                                  {opt.yt_meta.title || opt.label}
                                </div>
                                <div className="opacity-70 leading-tight truncate text-[12px]">
                                  {opt.yt_meta.channel_title && <span>{opt.yt_meta.channel_title}</span>}
                                  {opt.yt_meta.view_count && <span> · 👁 {formatViewCount(opt.yt_meta.view_count)}</span>}
                                  {opt.yt_meta.uploaded_at && <span> · {ytAgeShort(opt.yt_meta.uploaded_at)}</span>}
                                </div>
                              </>
                            ) : (
                              <div className="opacity-70 truncate leading-tight">{opt.label}</div>
                            )}
                          </div>
                        </button>
                      )
                    })}
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
                  {editImages.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setEditImages([])}
                      className="px-3 py-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--bg-active)] text-[var(--text-secondary)] rounded-lg text-xs font-medium">
                      Išvalyti pasirinkimą
                    </button>
                  )}
                </div>
              </div>

              {/* === Antraštė === (žingsnis 1: Turinys) */}
              <div className={editStep === 1 ? '' : 'hidden'}>
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
              {/* === Tekstas — Tiptap WYSIWYG (B/I/U, lists, links, paragraphs). === (žingsnis 1) */}
              <div className={editStep === 1 ? '' : 'hidden'}>
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
            <div className="px-3 py-2 sm:px-4 sm:py-3 border-t border-[var(--border-subtle)] flex gap-2 items-center bg-[var(--bg-surface)] sm:rounded-b-2xl shrink-0">
              <button
                onClick={editStep === 1 ? closeEdit : () => setEditStep(s => s - 1)}
                className="px-3 py-1.5 sm:py-2 bg-[var(--bg-elevated)] hover:bg-[var(--bg-active)] rounded-lg text-sm font-medium text-[var(--text-secondary)]">
                {editStep === 1 ? 'Atšaukti' : '← Atgal'}
              </button>
              {editStep < 4 ? (
                <button
                  onClick={() => setEditStep(s => s + 1)}
                  disabled={editStep === 1 && (!editTitle.trim() || !editBody.trim() || editArtistIds.length === 0)}
                  title={editStep === 1 && editArtistIds.length === 0 ? 'Pridėk bent vieną atlikėją' : ''}
                  className="flex-1 px-4 py-1.5 sm:py-2 bg-[var(--text-primary)] hover:opacity-90 disabled:opacity-40 text-[var(--bg-surface)] rounded-lg text-sm font-bold">
                  Pirmyn →
                </button>
              ) : (
                <button
                  onClick={handleSaveEdit}
                  disabled={savingEdit || !editTitle.trim() || !editBody.trim() || editArtistIds.length === 0}
                  title={editArtistIds.length === 0 ? 'Pridėk bent vieną atlikėją' : ''}
                  className="flex-1 px-4 py-1.5 sm:py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold">
                  {savingEdit ? '...' : '🚀 Paskelbti į live'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

