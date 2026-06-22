'use client'
// app/lt/albumas/[slug]/[id]/album-page-client.tsx
//
// Album page — modal-style layout, mirrors track-page-client.tsx:
//
//   ┌─────────────────────────────────────────────────────────┐
//   │  TOP BAR: cover thumb │ title + artist + LikePill │ meta │
//   ├─────────────────────────────────────────────────────────┤
//   │  Tracklist  │  Komentarai (EntityComments) │  Klausyk + │
//   │  (#, title, │                              │  Daugiau   │
//   │   PopBar,▶) │                              │  (otherAlb)│
//   └─────────────────────────────────────────────────────────┘
//
//   Mobile: iframe top → tabs (Dainos / Komentarai) → content
//
// Cover thumb (88×88) on top bar links to artist page with hover overlay
// back-arrow (same pattern as track page artist-thumb). Tracklist behaves
// as on the legacy layout — click row → activates the track in the right-
// column player iframe. Removed the old left sidebar wrapping comments +
// other albums + similar; that content now lives in the Komentarai col
// (comments) and right sidebar (Daugiau).
//
// Likes wired via /api/albums/[id]/like + LikesModal.
// Comments via shared EntityCommentsBlock (entityType="album").

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import { LikePill } from '@/components/LikePill'
import { SharePill } from '@/components/SharePill'
import LikesModal from '@/components/LikesModal'
import EntityCommentsBlock from '@/components/EntityCommentsBlock'

type Track = {
  id: number; slug: string; title: string; type: string
  video_url: string | null; is_new: boolean; is_single: boolean
  position: number; featuring: string[]
  like_count?: number | null
}
type Album = {
  id: number; slug: string; title: string; type: string
  year?: number; month?: number; day?: number; dateFormatted: string | null
  cover_image_url: string | null; video_url: string | null
  show_player: boolean; is_upcoming: boolean
  type_studio?: boolean
  legacy_id?: number | null
}
type Artist = { id: number; slug: string; name: string; cover_image_url: string | null }
type SimpleAlbum = { id: number; slug: string; title: string; year?: number; cover_image_url?: string; type: string }

type Props = {
  album: Album; artist: Artist; tracks: Track[]
  otherAlbums: SimpleAlbum[]; similarAlbums: any[]
  likes: number
}

function ytId(url?: string | null) {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
  return m ? m[1] : null
}

const LT_MONTHS = [
  'sausio', 'vasario', 'kovo', 'balandžio', 'gegužės', 'birželio',
  'liepos', 'rugpjūčio', 'rugsėjo', 'spalio', 'lapkričio', 'gruodžio',
]

function formatLtDate(year?: number, month?: number, day?: number, fallback?: string | null): string | null {
  if (!year) return fallback || null
  if (month && day) return `${year} m. ${LT_MONTHS[month - 1]} ${day} d.`
  if (month) return `${year} m. ${LT_MONTHS[month - 1]}`
  return `${year} m.`
}

/** Per-album relative pop bar — 5 dashes, same look as artist page. */
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

// „Aktyvi/grojama" indikatorius — animuoti ekvalaizerio brūkšneliai vietoj pauzės
// ikonos. Parodom, kad daina parinkta/aktyvi, NEteigdami kad realiai groja
// (autoplay gali nesuveikti, o pauzės ikona tuomet meluotų).
function NowPlayingBars() {
  return (
    <span className="flex h-3 items-end gap-[2px]" aria-hidden>
      <style>{`@keyframes npbBar{0%,100%{height:30%}50%{height:100%}}`}</style>
      <span className="w-[2.5px] rounded-[1px] bg-current" style={{ height: '100%', animation: 'npbBar 0.9s ease-in-out -0.10s infinite' }} />
      <span className="w-[2.5px] rounded-[1px] bg-current" style={{ height: '100%', animation: 'npbBar 0.9s ease-in-out -0.45s infinite' }} />
      <span className="w-[2.5px] rounded-[1px] bg-current" style={{ height: '100%', animation: 'npbBar 0.9s ease-in-out -0.25s infinite' }} />
    </span>
  )
}

export default function AlbumPageClient({
  album, artist, tracks, otherAlbums, similarAlbums, likes,
}: Props) {
  const [activeIdx, setActiveIdx] = useState<number>(-1)
  const [playing, setPlaying] = useState(false)

  // Like state
  const [selfLiked, setSelfLiked] = useState(false)
  const [selfLikePending, setSelfLikePending] = useState(false)
  const [likeCount, setLikeCount] = useState(likes)
  const [likesModalOpen, setLikesModalOpen] = useState(false)
  const [likeUsers, setLikeUsers] = useState<any[]>([])
  const [likeUsersLoaded, setLikeUsersLoaded] = useState(false)

  // Like sync. Komentarai nebeloadina'mi čia — EntityCommentsBlock pats
  // fetch'ina /api/albums/[id]/comments savo viduje.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/albums/${album.id}/like`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        if (typeof d.liked === 'boolean') setSelfLiked(d.liked)
        if (typeof d.count === 'number') setLikeCount(d.count)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [album.id])

  const onToggleLike = async () => {
    if (selfLikePending) return
    setSelfLikePending(true)
    const prev = selfLiked
    setSelfLiked(!prev)
    setLikeCount(c => c + (prev ? -1 : 1))
    try {
      const res = await fetch(`/api/albums/${album.id}/like`, { method: 'POST' })
      const data = await res.json()
      if (typeof data.liked === 'boolean') setSelfLiked(data.liked)
      if (typeof data.count === 'number') setLikeCount(data.count)
    } catch {
      setSelfLiked(prev)
      setLikeCount(c => c - (prev ? -1 : 1))
    } finally {
      setSelfLikePending(false)
    }
  }

  const onOpenLikersModal = async () => {
    setLikesModalOpen(true)
    if (likeUsersLoaded) return
    try {
      const res = await fetch(`/api/likes/album/${album.id}`)
      const data = await res.json()
      setLikeUsers(data.users || [])
      setLikeUsersLoaded(true)
    } catch {
      setLikeUsersLoaded(true)
    }
  }

  // Track ordering
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

  const albumYtId = ytId(album.video_url)
  const firstWithVideo = sortedTracks.findIndex(t => ytId(t.video_url))
  const effectiveIdx = activeIdx >= 0 ? activeIdx : firstWithVideo
  const activeTrack = effectiveIdx >= 0 ? sortedTracks[effectiveIdx] : null
  const activeTrackVid = activeTrack ? ytId(activeTrack.video_url) : null
  const playerVid = activeTrackVid || albumYtId
  const hasAnyVideo = !!playerVid

  const dateStr = formatLtDate(album.year, album.month, album.day, album.dateFormatted)

  const handlePlay = (idx: number) => {
    setActiveIdx(idx)
    setPlaying(true)
    setVideoStarted(true)
    // playToken bump → iframe key keičiasi → remount su &autoplay=1. Patikima ir
    // tam pačiam, ir kitam video; nereikia postMessage onReady handshake'o.
    setPlayToken(t => t + 1)
  }

  // Tab toggle — Dainos ↔ Komentarai (visiems viewport'ams, kaip modal'e).
  const [mobileTab, setMobileTab] = useState<'tracks' | 'comments'>('tracks')
  // Komentarų count — emit'ina EntityCommentsBlock (tab badge + header pill).
  const [commentTotal, setCommentTotal] = useState(0)
  // Click-to-play video state — orange play overlay matches modal pattern.
  const [videoStarted, setVideoStarted] = useState(false)
  // playToken — bump'inamas kiekvienam „leisti"; įeina į iframe key → priverstinis
  // remount su &autoplay=1 (patikima vietoj postMessage).
  const [playToken, setPlayToken] = useState(0)
  const videoIframeRef = useRef<HTMLIFrameElement>(null)
  const bodyScrollRef = useRef<HTMLDivElement>(null)

  // Reset scroll į top kai user perjungia tab.
  useEffect(() => {
    bodyScrollRef.current?.scrollTo({ top: 0 })
  }, [mobileTab])

  // ── Render helpers ─────────────────────────────────────────────────────────

  const Tracklist = (
    <div>
      <div className="mb-3 flex items-baseline gap-2">
        <div className="font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]">
          Dainos
        </div>
        {tracks.length > 0 && (
          <span className="font-['Outfit',sans-serif] text-[10px] font-bold text-[var(--text-faint)]">
            {tracks.length}
          </span>
        )}
        {positionsUnknown && tracks.length > 0 && (
          <span className="ml-auto text-[10px] font-medium text-[var(--text-muted)]">tvarka nenurodyta</span>
        )}
      </div>
      {tracks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-10 text-center text-[12px] text-[var(--text-faint)]">
          Dainų nėra
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)]">
          {sortedTracks.map((t, i) => {
            const isActive = effectiveIdx === i
            // „Aktyvi/grojama" = parinkta IR vartotojas paspaudė leisti.
            const isLive = isActive && videoStarted
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
                    'flex w-full items-center gap-2 px-3 py-2 transition-colors sm:px-3.5',
                    isActive ? 'bg-[rgba(249,115,22,0.08)]' : 'hover:bg-[var(--bg-hover)]',
                  ].join(' ')}
                >
                  {/* Position number */}
                  <span
                    className={[
                      'w-5 shrink-0 text-center font-["Outfit",sans-serif] text-[12px] font-bold tabular-nums',
                      isActive ? 'text-[var(--accent-orange)]' : 'text-[var(--text-faint)]',
                    ].join(' ')}
                    aria-hidden
                  >
                    {positionsUnknown ? '·' : (t.position || i + 1)}
                  </span>

                  {/* Title + PopBar — click = play */}
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

                  {/* Track open icon — atskira nuoroda į pilną dainos
                      puslapį. Naudinga, kai useris nori pamatyti tekstą,
                      komentarus konkrečiai dainai, o ne tik klausyti. */}
                  <Link
                    href={`/dainos/${artist.slug}-${t.slug || t.id}-${t.id}`}
                    aria-label={`Atidaryti ${t.title}`}
                    title="Atidaryti dainą"
                    className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--text-faint)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--accent-orange)] sm:flex"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M7 17L17 7" />
                      <path d="M8 7h9v9" />
                    </svg>
                  </Link>

                  {/* Play button */}
                  <button
                    onClick={() => canPlay && handlePlay(i)}
                    disabled={!canPlay}
                    aria-label={!canPlay ? 'Video nėra' : (isLive ? `Aktyvi daina: ${t.title}` : `Leisti ${t.title}`)}
                    title={!canPlay ? '' : (isLive ? 'Aktyvi daina' : 'Leisti')}
                    className={[
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors',
                      canPlay
                        ? isActive
                          ? 'bg-[var(--accent-orange)] text-white shadow-[0_4px_14px_rgba(249,115,22,0.35)]'
                          : 'bg-[var(--bg-hover)] text-[var(--text-primary)] hover:bg-[var(--accent-orange)] hover:text-white'
                        : 'cursor-default bg-transparent text-[var(--text-faint)] opacity-50',
                    ].join(' ')}
                  >
                    {isLive ? (
                      <NowPlayingBars />
                    ) : (
                      <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" aria-hidden>
                        <polygon points="6,4 20,12 6,20" />
                      </svg>
                    )}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )

  // Active track YouTube id — naudosim sidebar player'iui ir mobile inline.
  const showVideo = !!playerVid

  return (
    <div className="route-enter min-h-screen bg-[var(--bg-surface)] text-[var(--text-primary)]" style={{ fontFamily: "'DM Sans',system-ui,sans-serif", WebkitFontSmoothing: 'antialiased' }}>

      {/* Content wrapper — centered, max-w-[1000px], song-modal-style layout. */}
      <div className="mx-auto flex w-full max-w-[1000px] flex-col">

        {/* Header — cover (≈3 rows) + tag + title + artist. Veiksmai (like/share)
            perkelti į tabų juostą, kaip modale. */}
        <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-3 sm:px-5">
          <Link
            href={`/atlikejai/${artist.slug}`}
            aria-label={`Pas ${artist.name}`}
            title={`Pas ${artist.name}`}
            className="shrink-0 overflow-hidden rounded-xl border border-[var(--border-subtle)] transition-all hover:border-[var(--accent-orange)]"
            style={{ width: 60, height: 60 }}
          >
            {album.cover_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={proxyImg(album.cover_image_url)} alt={album.title} referrerPolicy="no-referrer" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[var(--cover-placeholder)] text-[22px]">💿</div>
            )}
          </Link>
          <div className="min-w-0 flex-1">
            {/* Kicker — tik „Greitai" žyma. Tipas pašalintas, data perkelta žemiau. */}
            {album.is_upcoming && (
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <span className="rounded-md border border-[rgba(249,115,22,0.3)] bg-[rgba(249,115,22,0.15)] px-1.5 py-0.5 font-['Outfit',sans-serif] text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--accent-orange)]">
                  Greitai
                </span>
              </div>
            )}
            <h1 className="truncate font-['Outfit',sans-serif] text-[16px] font-extrabold leading-tight text-[var(--text-primary)]">
              {album.title}
            </h1>
            <div className="truncate text-[12px] leading-tight">
              <Link href={`/atlikejai/${artist.slug}`} className="font-['Outfit',sans-serif] font-bold text-[var(--accent-orange)] no-underline hover:underline">
                {artist.name}
              </Link>
            </div>
            {/* Data — po atlikėjo pavadinimo. Tik mobile (desktop'e data rodoma chip'e
                kairiajame stulpelyje). */}
            {dateStr && (
              <div className="mt-0.5 text-[11px] font-semibold text-[var(--text-muted)] md:hidden">
                {dateStr}
              </div>
            )}
          </div>
          <Link
            href={`/atlikejai/${artist.slug}`}
            aria-label={`Pas ${artist.name}`}
            title={`Grįžti pas ${artist.name}`}
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] sm:flex"
          >
            <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
        </div>

        {/* ── Two-column layout (desktop) / single-column with sticky video (mobile) ── */}
        <div className="flex flex-1 flex-col md:flex-row">
          {/* Left column — video + meta chips (desktop) / sticky video (mobile) */}
          <div className="md:w-[55%] md:border-r md:border-[var(--border-subtle)]">
            {/* Video player — sticky on mobile */}
            <div className="sticky top-0 z-10 md:relative md:z-auto">
              <div className="relative aspect-video w-full overflow-hidden bg-black">
                {playerVid ? (
                  <>
                    <iframe
                      ref={videoIframeRef}
                      key={`album-page-video-${playerVid}-${videoStarted ? playToken : 'idle'}`}
                      src={`https://www.youtube.com/embed/${playerVid}?playsinline=1&rel=0&modestbranding=1&iv_load_policy=3&enablejsapi=1${videoStarted ? '&autoplay=1' : ''}`}
                      title={`${album.title} — ${artist.name}`}
                      className="absolute inset-0 h-full w-full"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                      allowFullScreen
                    />
                    {!videoStarted && (
                      <button
                        type="button"
                        onClick={() => {
                          setVideoStarted(true)
                          setPlaying(true)
                          setPlayToken(t => t + 1)
                        }}
                        aria-label={`Leisti ${album.title}`}
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
                        <span className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--accent-orange)] shadow-[0_8px_24px_rgba(249,115,22,0.5)] ring-[3px] ring-white/15 transition-transform group-hover:scale-110 sm:h-16 sm:w-16">
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
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
            </div>
            {/* Meta chips + comment CTA — below video, desktop only */}
            <div className="hidden md:flex flex-col px-4 py-3">
              <div className="flex flex-wrap gap-1.5 mb-3">
                {dateStr && (
                  <span className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] px-2.5 py-1 font-['Outfit',sans-serif] text-[10.5px] font-extrabold leading-tight text-[var(--text-primary)]">
                    {dateStr}
                  </span>
                )}
                {tracks.length > 0 && (
                  <span className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] px-2.5 py-1 font-['Outfit',sans-serif] text-[10.5px] font-bold leading-tight text-[var(--text-muted)]">
                    {tracks.length} dain{tracks.length % 10 === 1 && tracks.length % 100 !== 11 ? 'a' : (tracks.length % 10 >= 2 && tracks.length % 10 <= 9 && (tracks.length % 100 < 11 || tracks.length % 100 > 19) ? 'os' : 'ų')}
                  </span>
                )}
                {album.is_upcoming && (
                  <span className="inline-flex items-center rounded-full border border-[rgba(249,115,22,0.3)] bg-[rgba(249,115,22,0.18)] px-2 py-0.5 font-['Outfit',sans-serif] text-[9px] font-extrabold uppercase tracking-wider text-[var(--accent-orange)]">
                    Greitai
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setMobileTab('comments')}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-[var(--accent-orange)] bg-[rgba(249,115,22,0.08)] px-3 py-2.5 font-['Outfit',sans-serif] text-[12px] font-extrabold text-[var(--accent-orange)] transition-colors hover:bg-[rgba(249,115,22,0.15)]"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                {commentTotal > 0 ? `Komentarai (${commentTotal})` : 'Pasidalink nuomone'}
              </button>
            </div>
          </div>

          {/* Right column — tabs + tracklist/comments */}
          <div className="flex flex-1 flex-col">
            {/* Tabs — Dainos / Komentarai */}
            <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1.5 sm:gap-4 sm:px-5">
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
              {/* Veiksmai — like + dalintis, kompaktiškai dešinėje. */}
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
                <SharePill title={`${album.title} — ${artist.name}`} url={`/albumai/${artist.slug}-${album.slug}-${album.id}`} size="sm" />
              </div>
            </div>

            {/* Body — tracklist or comments */}
            <div ref={bodyScrollRef} className="flex-1 overscroll-contain px-4 py-4 sm:px-5">
              <div className={mobileTab === 'tracks' ? 'block' : 'hidden'}>
                {Tracklist}
              </div>
              <div className={mobileTab === 'comments' ? 'block' : 'hidden'}>
                <EntityCommentsBlock
                  entityType="album"
                  entityId={album.id}
                  compact
                  title={commentTotal > 0 ? `Komentarai (${commentTotal})` : 'Komentarai'}
                  onCountChange={setCommentTotal}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Below content — Daugiau iš atlikėjo + Panaši muzika (visiems). */}
        <div className="flex flex-col gap-5 border-t border-[var(--border-subtle)] px-4 pb-12 pt-5 sm:px-5">
          {otherAlbums.length > 0 && (
            <div>
              <div className="mb-3 flex items-baseline justify-between">
                <div className="font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  Daugiau {artist.name}
                </div>
                <Link
                  href={`/atlikejai/${artist.slug}`}
                  className="font-['Outfit',sans-serif] text-[10px] font-bold text-[var(--accent-orange)] no-underline hover:underline"
                >
                  Visi →
                </Link>
              </div>
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
                {otherAlbums.slice(0, 6).map(a => (
                  <AlbumThumbCard
                    key={a.id}
                    href={`/albumai/${artist.slug}-${a.slug}-${a.id}`}
                    cover={a.cover_image_url || null}
                    title={a.title}
                    subtitle={a.year ? String(a.year) : ''}
                  />
                ))}
              </div>
            </div>
          )}
          {similarAlbums.length > 0 && (
            <div>
              <div className="mb-3 font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Panaši muzika
              </div>
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
                {similarAlbums.slice(0, 6).map((a: any) => (
                  <AlbumThumbCard
                    key={a.id}
                    href={a.artists?.slug ? `/albumai/${a.artists.slug}-${a.slug}-${a.id}` : `/albumai/${a.slug}-${a.id}`}
                    cover={a.cover_image_url || null}
                    title={a.title}
                    subtitle={a.artists?.name ? a.artists.name : (a.year ? String(a.year) : '')}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <LikesModal
        open={likesModalOpen}
        onClose={() => setLikesModalOpen(false)}
        title={`„${album.title}" patinka`}
        count={likeCount}
        users={likeUsers}
        subjectName={album.title}
      />
    </div>
  )
}

/** Compact thumbnail card — sized smaller (≤140px) so music.lt's low-res
 *  300px covers don't upscale into a visible blur. */
function AlbumThumbCard({ href, cover, title, subtitle }: { href: string; cover: string | null; title: string; subtitle: string }) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-1.5 no-underline"
    >
      <div className="aspect-square w-full overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--cover-placeholder)] transition-all group-hover:-translate-y-0.5 group-hover:border-[var(--border-strong)] group-hover:shadow-sm">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={proxyImg(cover)}
            alt={title}
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[22px]">💿</div>
        )}
      </div>
      <div className="min-w-0">
        <div className="line-clamp-2 font-['Outfit',sans-serif] text-[11.5px] font-bold leading-tight text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">
          {title}
        </div>
        {subtitle && (
          <div className="mt-0.5 truncate text-[10px] text-[var(--text-muted)]">{subtitle}</div>
        )}
      </div>
    </Link>
  )
}
