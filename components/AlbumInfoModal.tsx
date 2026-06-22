'use client'
// components/AlbumInfoModal.tsx
//
// Slide-in drawer su albumo turiniu — atitinka TrackInfoModal pattern'ą:
//   - mobile: fullscreen drawer (right→left slide), iframe top + tabs
//   - desktop ≥1280px: 860px drawer + 1fr dock'as (player + Daugiau)
//   - prev/next navigacija tarp atlikėjo albumų
//
// Duomenis lazy fetch'ina iš /api/albums/[id]/details kai atidaroma. Tai
// reiškia artist'o page'ui nereikia siųsti pilnos discography duomenų aparato
// — tik album.id, ir modal'as susiplauna likusią informaciją.
//
// Likes/komentarai/tracklist play logic'a — kaip standalone album page'e.

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import { LikePill } from '@/components/LikePill'
import { SharePill } from '@/components/SharePill'
import LikesModal from '@/components/LikesModal'
import EntityCommentsBlock from '@/components/EntityCommentsBlock'

// ── Types ──────────────────────────────────────────────────────────────────

type AlbumDetails = {
  album: {
    id: number; slug: string; title: string; type: string
    year?: number; month?: number; day?: number; dateFormatted: string | null
    cover_image_url: string | null; video_url: string | null
    show_player: boolean; is_upcoming: boolean
    type_studio?: boolean
    legacy_id?: number | null
    description?: string | null
  }
  artist: { id: number; slug: string; name: string; cover_image_url: string | null; description?: string | null }
  tracks: Array<{
    id: number; slug: string; title: string; type: string
    video_url: string | null; is_new: boolean; is_single: boolean
    position: number; featuring: string[]
    like_count?: number | null
  }>
  otherAlbums: Array<{ id: number; slug: string; title: string; year?: number; cover_image_url: string | null; type: string }>
  similarAlbums: any[]
  likes: number
}

export type AlbumModalProps = {
  /** Album ID, pakaks atidaryti modal'ą — pilnas duomenų set'as fetch'inamas. */
  albumId: number | null
  /** Optional preview hint — jei artist page jau turi album.title/cover, gali
   *  paduoti čia, kad modal'as iškart parodytų skeleton'ą su title vietoj
   *  empty placeholder. */
  preview?: { title: string; cover_image_url?: string | null; year?: number | null } | null
  onClose: () => void
  /** Prev/Next navigacijos callback'ai — parent valdo album order'į. */
  onPrev?: (() => void) | null
  onNext?: (() => void) | null
  /** Pranešam parent'ui, kad mobile'e modal'as turi inline player'į —
   *  kad hero player'is suppress'intųsi (audio dvigubėjimo prevention). */
  onMobileInlineChange?: (active: boolean) => void
  /** Pranešam, kad desktop dock'as aktyvus (≥1280px) — parent gali
   *  suppress'inti savo desktop player'į, jei toks aktyvus paraleliai. */
  onDockedPlayerChange?: (active: boolean) => void
}

// ── Helpers ────────────────────────────────────────────────────────────────

function ytId(url?: string | null) {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
  return m ? m[1] : null
}

// Aprašymai saugomi kaip HTML — paverčiam į švarų tekstą (be tag'ų), paragrafus
// paliekam kaip eilučių lūžius. Naudojam IR albumo, IR atlikėjo aprašymui.
function plainText(s?: string | null): string {
  if (!s) return ''
  return s
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function popLevelRelative(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 1
  const ratio = value / max
  if (ratio >= 0.8) return 5
  if (ratio >= 0.55) return 4
  if (ratio >= 0.3) return 3
  if (ratio >= 0.1) return 2
  return 1
}
function popLevelByPosition(index: number, total: number): number {
  if (total <= 1) return 5
  const ratio = (total - index) / total
  return Math.max(1, Math.min(5, Math.ceil(ratio * 5)))
}
function PopBar({ level }: { level: number }) {
  return (
    <div
      className="mt-1 flex items-center gap-[3px]"
      title={level > 0 ? `Populiarumas ${level}/5` : 'Populiarumas — duomenų dar nėra'}
      role="img"
      aria-label={level > 0 ? `Populiarumas ${level} iš 5` : 'Populiarumo duomenų nėra'}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          aria-hidden
          className={[
            'h-[3px] w-[10px] rounded-full transition-colors',
            i < level ? 'bg-[var(--accent-orange)]' : 'bg-[var(--popup-bg)]',
          ].join(' ')}
        />
      ))}
    </div>
  )
}

// ── Component ──────────────────────────────────────────────────────────────

export default function AlbumInfoModal({
  albumId, preview, onClose,
  onPrev, onNext,
  onMobileInlineChange, onDockedPlayerChange,
}: AlbumModalProps) {
  const [mounted, setMounted] = useState(false)
  const [details, setDetails] = useState<AlbumDetails | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeIdx, setActiveIdx] = useState<number>(-1)
  const [playing, setPlaying] = useState(false)

  // Mobile vs desktop branching — same pattern as TrackInfoModal.
  const [isMobile, setIsMobile] = useState(false)
  const [isWideDesktop, setIsWideDesktop] = useState(false)
  useEffect(() => {
    const mob = window.matchMedia('(max-width: 1023px)')
    const wide = window.matchMedia('(min-width: 1280px)')
    setIsMobile(mob.matches); setIsWideDesktop(wide.matches)
    const hM = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    const hW = (e: MediaQueryListEvent) => setIsWideDesktop(e.matches)
    mob.addEventListener('change', hM); wide.addEventListener('change', hW)
    return () => {
      mob.removeEventListener('change', hM)
      wide.removeEventListener('change', hW)
    }
  }, [])

  // Mobile tab — Dainos vs Komentarai (analogiškai TrackInfoModal Tekstas/Komentarai).
  const [mobileTab, setMobileTab] = useState<'tracks' | 'comments'>('tracks')
  const [commentTotal, setCommentTotal] = useState(0)
  // videoStarted — false default, rodom thumbnail + orange play overlay.
  // Click → įjungiam autoplay (iframe remount su &autoplay=1) + paslepiam overlay.
  const [videoStarted, setVideoStarted] = useState(false)
  // playToken — didinamas KIEKVIENĄ kartą paspaudus „leisti" (overlay arba dainos
  // mygtukas). Įeina į iframe `key`, todėl tas pats arba kitas video PRIVERSTINAI
  // remount'inasi su `&autoplay=1` — patikima vietoj postMessage (kuris reikalauja
  // onReady handshake'o ir dažnai nesuveikia).
  const [playToken, setPlayToken] = useState(0)
  // Refs for iframe + body scroll reset on tab switch.
  const videoIframeRef = useRef<HTMLIFrameElement>(null)
  const bodyScrollRef = useRef<HTMLDivElement>(null)

  // LikePill state — duplicates standalone page logic, paprastesnis tvarkymas.
  const [selfLiked, setSelfLiked] = useState(false)
  const [selfLikePending, setSelfLikePending] = useState(false)
  const [likeCount, setLikeCount] = useState<number>(0)
  // Likers modal — kam patiko (kaip albumo puslapyje).
  const [likersOpen, setLikersOpen] = useState(false)
  const [likeUsers, setLikeUsers] = useState<any[]>([])
  const [likeUsersLoaded, setLikeUsersLoaded] = useState(false)

  // Artist description + genres — for left column overview (like TrackInfoModal)
  const [artistDesc, setArtistDesc] = useState<string | null>(null)
  const [artistGenres, setArtistGenres] = useState<string[]>([])

  // Fetch artist extras when details arrive
  useEffect(() => {
    if (!details?.artist) return
    const a = details.artist
    // If details API already provides description, use it
    if (a.description) {
      setArtistDesc(a.description)
    }
    // Fetch full artist data for substyleNames
    let cancelled = false
    fetch(`/api/artists/${a.id}`)
      .then(r => r.json())
      .then((full: any) => {
        if (cancelled) return
        if (full.description && !a.description) setArtistDesc(full.description)
        if (full.description) setArtistDesc(full.description)
        setArtistGenres((full.substyleNames || []).slice(0, 4))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [details?.artist])

  // Per-album state reset — kai albumId keičiasi (user'is navigates tarp albumų),
  // reset'inam visus state'us, kad nebūtų state-leak'inimo iš ankstesnio.
  // PRIES: anksciau details/likeCount/mobileTab/etc. likdavo persistuoti iš
  // ankstesnio albumo — user'is matydavo seną content'ą trumpai prieš naujam
  // load'antis. Plius jei buvo pasirinkęs Komentarų tab'ą, naujam albume taip
  // pat atsidarydavo Komentarai, ne Dainos (kas yra main UX).
  useEffect(() => {
    if (albumId === null) return
    setMounted(true)
    setActiveIdx(-1)
    setPlaying(false)
    // Reset visus per-album state'us iš karto — TSC saugu nes ALL setters'as
    // declar'inta aukščiau.
    setDetails(null)
    setMobileTab('tracks')
    setVideoStarted(false)
    setPlayToken(0)
    setCommentTotal(0)
    setSelfLiked(false)
    setLikeCount(0)
    setLikersOpen(false)
    setLikeUsers([])
    setLikeUsersLoaded(false)
    setArtistDesc(null)
    setArtistGenres([])
  }, [albumId])

  // Fetch details when albumId changes
  useEffect(() => {
    if (albumId === null) { setDetails(null); return }
    let cancelled = false
    setLoading(true)
    fetch(`/api/albums/${albumId}/details`)
      .then(r => r.json())
      .then((d: AlbumDetails) => {
        if (cancelled) return
        if (d?.album) {
          setDetails(d)
          setLikeCount(d.likes || 0)
        }
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [albumId])

  // Like sync via /api/albums/[id]/like
  useEffect(() => {
    if (albumId === null) return
    let cancelled = false
    fetch(`/api/albums/${albumId}/like`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        if (typeof d.liked === 'boolean') setSelfLiked(d.liked)
        if (typeof d.count === 'number') setLikeCount(d.count)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [albumId])

  // Reset scroll + videoStarted kai albumId keičiasi (prev/next album'as).
  useEffect(() => {
    bodyScrollRef.current?.scrollTo({ top: 0 })
  }, [mobileTab])
  useEffect(() => {
    setVideoStarted(false)
  }, [albumId])

  // ESC key + body scroll lock (position:fixed pattern — iOS-safe).
  // body.overflow=hidden neveikia patikimai kai modal'as portaled į body
  // (modal pats sukuria scrollable region aukščiau body limit'o).
  // position:fixed pin'ina body į dabartinę scrollY poziciją.
  useEffect(() => {
    if (albumId === null) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', onKey)
    const scrollY = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.left = '0'
    document.body.style.right = '0'
    document.body.style.width = '100%'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.left = ''
      document.body.style.right = ''
      document.body.style.width = ''
      window.scrollTo(0, scrollY)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albumId])

  // Notify parent about mobile-inline / docked-player presence
  useEffect(() => {
    onMobileInlineChange?.(isMobile && albumId !== null)
  }, [isMobile, albumId, onMobileInlineChange])
  useEffect(() => {
    onDockedPlayerChange?.(isWideDesktop && albumId !== null)
  }, [isWideDesktop, albumId, onDockedPlayerChange])

  const handleClose = () => {
    setMounted(false)
    window.setTimeout(onClose, 200)
  }

  const onToggleLike = async () => {
    if (selfLikePending || albumId === null) return
    setSelfLikePending(true)
    const prev = selfLiked
    setSelfLiked(!prev)
    setLikeCount(c => c + (prev ? -1 : 1))
    try {
      const res = await fetch(`/api/albums/${albumId}/like`, { method: 'POST' })
      const d = await res.json()
      if (typeof d.liked === 'boolean') setSelfLiked(d.liked)
      if (typeof d.count === 'number') setLikeCount(d.count)
    } catch {
      setSelfLiked(prev)
      setLikeCount(c => c - (prev ? -1 : 1))
    } finally { setSelfLikePending(false) }
  }

  const onOpenLikersModal = async () => {
    if (albumId === null) return
    setLikersOpen(true)
    if (likeUsersLoaded) return
    try {
      const res = await fetch(`/api/likes/album/${albumId}`)
      const data = await res.json()
      setLikeUsers(data.users || [])
      setLikeUsersLoaded(true)
    } catch {
      setLikeUsersLoaded(true)
    }
  }

  // Track ordering & player logic (mirrors album-page-client)
  const album = details?.album
  const artist = details?.artist
  const tracks = details?.tracks || []
  const positionsUnknown = tracks.length > 1 && tracks.every(t => t.position === tracks[0].position)
  const sortedTracks = useMemo(() => (
    positionsUnknown
      ? [...tracks].sort((a, b) => a.id - b.id)
      : [...tracks].sort((a, b) => a.position - b.position)
  ), [tracks, positionsUnknown])
  const maxTrackLikes = useMemo(() => {
    let max = 0
    for (const t of tracks) {
      const v = (t as any).like_count
      if (typeof v === 'number' && v > max) max = v
    }
    return max
  }, [tracks])

  const albumYtId = ytId(album?.video_url || null)
  const firstWithVideo = sortedTracks.findIndex(t => ytId(t.video_url))
  const effectiveIdx = activeIdx >= 0 ? activeIdx : firstWithVideo
  const activeTrack = effectiveIdx >= 0 ? sortedTracks[effectiveIdx] : null
  const activeTrackVid = activeTrack ? ytId(activeTrack.video_url) : null
  const playerVid = activeTrackVid || albumYtId
  const showVideo = !!playerVid

  const handlePlay = (idx: number) => {
    setActiveIdx(idx)
    setPlaying(true)
    setVideoStarted(true)
    // playToken bump → iframe key keičiasi → remount su &autoplay=1. Veikia ir tam
    // pačiam, ir kitam video; nereikia postMessage onReady handshake'o.
    setPlayToken(t => t + 1)
  }

  // Don't render anything if no album active
  if (albumId === null) return null
  // createPortal žemiau reikalingas document.body — bail on SSR.
  if (typeof document === 'undefined') return null

  // Slide animation classes — drawer'is iš dešinės. mounted=false kviečia
  // slide-out per CSS transition (200ms), o tada onClose paleidžia state cleanup.
  const drawerTransform = mounted ? 'translate-x-0' : 'translate-x-full'

  // Skeleton title from preview, kol fetch'inasi.
  const titleNow = album?.title || preview?.title || ''
  const coverNow = album?.cover_image_url || preview?.cover_image_url || null

  // Root — portaled į document.body. Kitaip .route-enter wrapper'io
  // transform: translateY(0) end-state laužia fixed inset-0 pozicionavimą.
  // Root — portaled į document.body. Song-modal pattern: backdrop wrapper
  // (bottom sheet mobile, centered card desktop), iframe always-mounted +
  // click-to-play orange overlay, fixed h-[90vh]/sm:h-[85vh].
  return createPortal(
    <div
      className={[
        'fixed inset-0 z-[9999] flex items-end justify-center backdrop-blur-sm sm:items-center',
        'bg-black/60 sm:bg-black/30',
        'lg:justify-start lg:pl-[10%]',
      ].join(' ')}
      role="dialog"
      aria-modal="true"
      aria-label={titleNow ? `${titleNow} albumo informacija` : 'Albumo informacija'}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
      style={{ fontFamily: "'DM Sans',system-ui,sans-serif" }}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className={[
          'relative flex w-full flex-col overflow-hidden bg-[var(--bg-surface)] shadow-[0_24px_60px_-10px_rgba(0,0,0,0.5)]',
          'h-[90vh] rounded-t-2xl',
          'sm:h-[85vh] sm:rounded-2xl sm:mx-4 sm:max-w-[860px] lg:max-w-[1040px]',
        ].join(' ')}
      >
        {/* Top-right corner controls — atidaryti naują langą + uždaryti */}
        <div className="absolute right-2 top-2 z-20 flex items-center gap-1.5">
          {album && (
            <Link
              href={artist ? `/albumai/${artist.slug}-${album.slug}-${album.id}` : `/albumai/${album.slug}-${album.id}`}
              target="_blank"
              rel="noopener"
              aria-label="Atidaryti albumo puslapį"
              title="Atidaryti naujame lange"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)]/90 text-[var(--text-secondary)] backdrop-blur-sm transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
            >
              <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 3h7v7M21 3l-9 9M5 5h6M5 5v14h14v-6" />
              </svg>
            </Link>
          )}
          <button
            type="button"
            onClick={handleClose}
            aria-label="Uždaryti"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)]/90 text-[var(--text-secondary)] backdrop-blur-sm transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          >
            <svg viewBox="0 0 16 16" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        {/* Mobile handle bar */}
        <div className="flex shrink-0 justify-center pt-2 pb-1 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-[var(--border-default)]" />
        </div>

        {/* Header — bigger cover (≈3 rows) + tag + title + artist. Veiksmai
            (like/share) perkelti į tabų juostą; uždaryti/naujas langas — kampe. */}
        <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-3 pr-[88px]">
          {artist ? (
            <Link
              href={`/atlikejai/${artist.slug}`}
              aria-label={`Pas ${artist.name}`}
              className="shrink-0 overflow-hidden rounded-xl border border-[var(--border-subtle)]"
              style={{ width: 60, height: 60 }}
            >
              {coverNow ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={proxyImg(coverNow)} alt={titleNow} referrerPolicy="no-referrer" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[var(--cover-placeholder)] text-[22px]">💿</div>
              )}
            </Link>
          ) : (
            <div className="shrink-0 overflow-hidden rounded-xl border border-[var(--border-subtle)]" style={{ width: 60, height: 60 }}>
              {coverNow ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={proxyImg(coverNow)} alt={titleNow} referrerPolicy="no-referrer" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[var(--cover-placeholder)] text-[22px]">💿</div>
              )}
            </div>
          )}
          <div className="min-w-0 flex-1">
            {/* Kicker — tik „Greitai" žyma. Tipas pašalintas, data perkelta žemiau. */}
            {album?.is_upcoming && (
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <span className="rounded-md border border-[rgba(249,115,22,0.3)] bg-[rgba(249,115,22,0.15)] px-1.5 py-0.5 font-['Outfit',sans-serif] text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--accent-orange)]">
                  Greitai
                </span>
              </div>
            )}
            <div className="truncate font-['Outfit',sans-serif] text-[16px] font-extrabold leading-tight text-[var(--text-primary)]">
              {titleNow || 'Kraunama…'}
            </div>
            {artist && (
              <div className="truncate text-[12px] leading-tight">
                <Link href={`/atlikejai/${artist.slug}`} className="font-['Outfit',sans-serif] font-bold text-[var(--accent-orange)] no-underline hover:underline">
                  {artist.name}
                </Link>
              </div>
            )}
            {/* Data — po atlikėjo pavadinimo (perkelta iš kicker'io). */}
            {album && (album.dateFormatted || album.year) && (
              <div className="mt-0.5 text-[11px] font-semibold text-[var(--text-muted)]">
                {album.dateFormatted || `${album.year} m.`}
              </div>
            )}
          </div>
        </div>

        {/* ── Two-column layout (desktop) / single-column (mobile) ── */}
        <div className="flex flex-1 min-h-0 flex-col md:flex-row">
          {/* Left column — video + meta chips (desktop only) */}
          <div className="md:flex md:w-[55%] md:flex-col md:border-r md:border-[var(--border-subtle)]">
            {/* Video player */}
            <div className="relative aspect-video w-full shrink-0 overflow-hidden bg-black">
              {playerVid ? (
                <>
                  <iframe
                    ref={videoIframeRef}
                    key={`album-modal-video-${playerVid}-${videoStarted ? playToken : 'idle'}`}
                    src={`https://www.youtube.com/embed/${playerVid}?playsinline=1&rel=0&modestbranding=1&iv_load_policy=3&enablejsapi=1${videoStarted ? '&autoplay=1' : ''}&origin=${typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : ''}`}
                    title={titleNow}
                    className="absolute inset-0 h-full w-full"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                    allowFullScreen
                    onLoad={(e) => {
                      // Autoplay naršyklėje leidžiamas tik MUTE — atsukam garsą per
                      // YouTube IFrame API (unMute) po įkrovimo, keli bandymai.
                      if (!videoStarted) return
                      const w = (e.currentTarget as HTMLIFrameElement).contentWindow
                      if (!w) return
                      const cmd = (func: string) => { try { w.postMessage(JSON.stringify({ event: 'command', func, args: [] }), 'https://www.youtube.com') } catch {} }
                      ;[0, 250, 700, 1500].forEach(d => setTimeout(() => { cmd('unMute'); cmd('playVideo') }, d))
                    }}
                  />
                  {!videoStarted && (
                    <button
                      type="button"
                      onClick={() => {
                        setVideoStarted(true)
                        setPlaying(true)
                        setPlayToken(t => t + 1)
                      }}
                      aria-label={`Leisti ${titleNow} vaizdo įrašą`}
                      className="group absolute inset-0 block h-full w-full overflow-hidden"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://i.ytimg.com/vi/${playerVid}/hqdefault.jpg`}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-black/25 transition-colors group-hover:bg-black/40" />
                      <span className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--accent-orange)] shadow-[0_8px_24px_rgba(249,115,22,0.5)] ring-[3px] ring-white/15 transition-transform group-hover:scale-110 sm:h-14 sm:w-14">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </span>
                    </button>
                  )}
                </>
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
                  Vaizdo įrašo nėra
                </div>
              )}
            </div>
            {/* Artist overview + comment CTA — below video, desktop only */}
            <div className="hidden md:flex flex-1 min-h-0 flex-col overflow-y-auto px-3 py-3">
              {/* Jei įvestas ALBUMO aprašymas — rodom tekstą apie albumą VIETOJ
                  atlikėjo info. Kitaip — standartinė atlikėjo kortelė. */}
              {album?.description && plainText(album.description) ? (
                <div className="mb-3">
                  <div className="mb-1.5 font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    Apie albumą
                  </div>
                  <p className="whitespace-pre-line text-[12.5px] leading-[1.6] text-[var(--text-secondary)]">
                    {plainText(album.description)}
                  </p>
                </div>
              ) : artist ? (
                <div className="flex gap-3 mb-3">
                  <Link href={`/atlikejai/${artist.slug}`} className="shrink-0">
                    <div className="h-[88px] w-[88px] overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--cover-placeholder)]">
                      {artist.cover_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={proxyImg(artist.cover_image_url)} alt={artist.name} referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[28px]">🎤</div>
                      )}
                    </div>
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link href={`/atlikejai/${artist.slug}`} className="font-['Outfit',sans-serif] text-[14px] font-extrabold text-[var(--text-primary)] no-underline hover:text-[var(--accent-orange)]">
                      {artist.name}
                    </Link>
                    {artistGenres.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {artistGenres.map(g => (
                          <span key={g} className="rounded-full bg-[var(--bg-hover)] px-2 py-0.5 font-['Outfit',sans-serif] text-[10px] font-bold text-[var(--text-muted)]">
                            {g}
                          </span>
                        ))}
                      </div>
                    )}
                    {artistDesc && (
                      <p className="mt-1.5 line-clamp-4 whitespace-pre-line text-[12px] leading-[1.5] text-[var(--text-secondary)]">
                        {plainText(artistDesc)}
                      </p>
                    )}
                  </div>
                </div>
              ) : null}
              {/* „Daugiau / {atlikėjas}" — kiti atlikėjo albumai (desktop, vietoj
                  „Pasidalink nuomone"). Žema horizontali juostelė — netampo modalo
                  aukščio, todėl neatsiranda papildomo scroll'o. */}
              {artist && (details?.otherAlbums || []).length > 0 && (
                <div className="mt-auto border-t border-[var(--border-subtle)] pt-3">
                  <div className="mb-2 font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    Daugiau / {artist.name}
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
                    {(details?.otherAlbums || []).slice(0, 8).map(a => (
                      <Link
                        key={a.id}
                        href={`/albumai/${artist.slug}-${a.slug}-${a.id}`}
                        target="_blank"
                        rel="noopener"
                        title={a.title}
                        className="block w-[64px] shrink-0 no-underline group"
                      >
                        <span className="block aspect-square w-full overflow-hidden rounded-md border border-[var(--border-subtle)] bg-[var(--cover-placeholder)] transition-colors group-hover:border-[var(--border-strong)]">
                          {a.cover_image_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={proxyImg(a.cover_image_url)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                          )}
                        </span>
                        <span className="mt-1 block truncate font-['Outfit',sans-serif] text-[9.5px] font-bold leading-tight text-[var(--text-primary)]">
                          {a.title}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right column — tabs + tracklist/comments */}
          <div className="flex flex-1 min-h-0 flex-col">
            {/* Tabs — Dainos / Komentarai */}
            <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1.5 sm:gap-4 sm:px-4">
              <button
                type="button"
                onClick={() => setMobileTab('tracks')}
                className={[
                  "relative flex items-center gap-1.5 px-1 py-1 font-['Outfit',sans-serif] text-[12px] font-bold transition-colors",
                  mobileTab === 'tracks'
                    ? 'text-[var(--accent-orange)] after:absolute after:inset-x-0 after:-bottom-[8px] after:h-[2px] after:bg-[var(--accent-orange)]'
                    : 'text-[var(--text-muted)]',
                ].join(' ')}
              >
                <span>Dainos</span>
                {tracks.length > 0 && (
                  <span className="rounded-full bg-[var(--bg-hover)] px-1.5 py-px text-[10px] font-extrabold leading-none text-[var(--text-muted)]">
                    {tracks.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setMobileTab('comments')}
                className={[
                  "relative flex items-center gap-1.5 px-1 py-1 font-['Outfit',sans-serif] text-[12px] font-bold transition-colors",
                  mobileTab === 'comments'
                    ? 'text-[var(--accent-orange)] after:absolute after:inset-x-0 after:-bottom-[8px] after:h-[2px] after:bg-[var(--accent-orange)]'
                    : 'text-[var(--text-muted)]',
                ].join(' ')}
              >
                <span>Komentarai</span>
                {commentTotal > 0 && (
                  <span className="rounded-full bg-[var(--accent-orange)] px-1.5 py-px text-[10px] font-extrabold leading-none text-white">
                    {commentTotal}
                  </span>
                )}
              </button>
              {/* Veiksmai — patinka + dalintis, kompaktiškai dešinėje. */}
              {album && (
                <div className="ml-auto flex items-center gap-1.5">
                  <LikePill
                    likes={likeCount}
                    selfLiked={selfLiked}
                    onToggle={onToggleLike}
                    onOpenModal={onOpenLikersModal}
                    pending={selfLikePending}
                    variant="surface"
                    size="sm"
                  />
                  <SharePill
                    title={`${album.title}${artist ? ` — ${artist.name}` : ''}`}
                    url={artist ? `/albumai/${artist.slug}-${album.slug}-${album.id}` : `/albumai/${album.slug}-${album.id}`}
                    size="sm"
                  />
                </div>
              )}
            </div>

            {/* Body — tracklist or comments */}
            <div ref={bodyScrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3">
              <div className={mobileTab === 'tracks' ? 'block' : 'hidden'}>
                {loading && tracks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-10 text-center">
                    <span className="relative inline-flex h-5 w-6 items-end justify-center gap-[3px]" aria-hidden>
                      <span className="w-[3px] origin-bottom rounded-[1px] bg-[var(--accent-orange)]" style={{ animation: 'eqBar 1.0s ease-in-out -0.20s infinite' }} />
                      <span className="w-[3px] origin-bottom rounded-[1px] bg-[var(--accent-orange)]" style={{ animation: 'eqBar 1.0s ease-in-out -0.45s infinite' }} />
                      <span className="w-[3px] origin-bottom rounded-[1px] bg-[var(--accent-orange)]" style={{ animation: 'eqBar 1.0s ease-in-out -0.10s infinite' }} />
                    </span>
                    <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Kraunama…</div>
                    <style>{`@keyframes eqBar { 0%,100% { height: 30%; } 50% { height: 100%; } }`}</style>
                  </div>
                ) : tracks.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-10 text-center text-[12px] text-[var(--text-faint)]">
                    Dainų nėra
                  </div>
                ) : (
                  <ul className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)]">
                    {sortedTracks.map((t, i) => {
                      const isActive = effectiveIdx === i
                      const v = ytId(t.video_url)
                      const canPlay = !!v
                      const lc = (t as any).like_count
                      const level = (typeof lc === 'number' && maxTrackLikes > 0)
                        ? popLevelRelative(lc, maxTrackLikes)
                        : popLevelByPosition(i, sortedTracks.length)
                      return (
                        <li key={t.id}>
                          <div
                            className={[
                              'flex w-full items-center gap-2 px-3 py-2 transition-colors',
                              isActive ? 'bg-[rgba(249,115,22,0.08)]' : 'hover:bg-[var(--bg-hover)]',
                            ].join(' ')}
                          >
                            <span
                              className={[
                                'w-5 shrink-0 text-center font-["Outfit",sans-serif] text-[12px] font-bold tabular-nums',
                                isActive ? 'text-[var(--accent-orange)]' : 'text-[var(--text-faint)]',
                              ].join(' ')}
                              aria-hidden
                            >
                              {positionsUnknown ? '·' : (t.position || i + 1)}
                            </span>
                            <button
                              type="button"
                              onClick={() => canPlay && handlePlay(i)}
                              disabled={!canPlay}
                              className={[
                                'flex min-w-0 flex-1 flex-col items-start border-0 bg-transparent p-0 text-left',
                                canPlay ? 'cursor-pointer' : 'cursor-default',
                              ].join(' ')}
                            >
                              <div className={[
                                'w-full truncate font-["Outfit",sans-serif] text-[13px] font-bold leading-tight',
                                isActive ? 'text-[var(--accent-orange)]' : 'text-[var(--text-primary)]',
                              ].join(' ')}>
                                {t.title}
                                {t.featuring.length > 0 && (
                                  <span className="ml-1 font-medium text-[var(--text-muted)]">su {t.featuring.join(', ')}</span>
                                )}
                              </div>
                              <PopBar level={level} />
                            </button>
                            <button
                              onClick={() => canPlay && handlePlay(i)}
                              disabled={!canPlay}
                              aria-label={!canPlay ? 'Video nėra' : `Leisti ${t.title}`}
                              title={!canPlay ? '' : 'Leisti'}
                              className={[
                                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors',
                                canPlay
                                  ? isActive
                                    ? 'bg-[var(--accent-orange)] text-white shadow-[0_4px_14px_rgba(249,115,22,0.35)]'
                                    : 'bg-[var(--bg-hover)] text-[var(--text-primary)] hover:bg-[var(--accent-orange)] hover:text-white'
                                  : 'cursor-default bg-transparent text-[var(--text-faint)] opacity-50',
                              ].join(' ')}
                            >
                              <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" aria-hidden>
                                <polygon points="6,4 20,12 6,20" />
                              </svg>
                            </button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
              <div className={mobileTab === 'comments' ? 'block' : 'hidden'}>
                {album ? (
                  <EntityCommentsBlock
                    entityType="album"
                    entityId={album.id}
                    compact
                    title="Komentarai"
                    onCountChange={setCommentTotal}
                  />
                ) : (
                  <div className="text-[12px] text-[var(--text-faint)]">Kraunama…</div>
                )}
              </div>
              {/* „Daugiau iš atlikėjo" — INSIDE scroll area so it doesn't steal
                  fixed space from tracklist. Tik mobile — desktop'e šis blokas
                  rodomas kairiajame stulpelyje (vietoj komentaro CTA). */}
              {artist && (details?.otherAlbums || []).length > 0 && (
                <div className="mt-4 border-t border-[var(--border-subtle)] pt-3 md:hidden">
                  <div className="mb-2 font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    Daugiau iš {artist.name}
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
                    {(details?.otherAlbums || []).slice(0, 6).map(a => (
                      <Link
                        key={a.id}
                        href={`/albumai/${artist.slug}-${a.slug}-${a.id}`}
                        target="_blank"
                        rel="noopener"
                        title={a.title}
                        className="block w-[84px] shrink-0 overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--card-bg)] p-1 no-underline transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
                      >
                        <span className="block aspect-square w-full overflow-hidden rounded bg-[var(--cover-placeholder)]">
                          {a.cover_image_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={proxyImg(a.cover_image_url)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                          )}
                        </span>
                        <span className="block truncate px-0.5 pb-0.5 pt-1 font-['Outfit',sans-serif] text-[10px] font-extrabold text-[var(--text-primary)]">
                          {a.title}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Likers modal — kam patiko albumas (kaip standalone puslapyje). */}
      <LikesModal
        open={likersOpen}
        onClose={() => setLikersOpen(false)}
        title={`„${titleNow}" patinka`}
        count={likeCount}
        users={likeUsers}
        subjectName={titleNow}
      />
    </div>,
    document.body,
  )
}
