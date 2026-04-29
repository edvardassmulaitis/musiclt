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

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import { LikePill } from '@/components/LikePill'
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
    <div className="mt-1 flex items-center gap-[3px]">
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={[
            'h-[3px] w-[10px] rounded-full transition-colors',
            i < level ? 'bg-[var(--accent-orange)]' : 'bg-[var(--popup-bg)]',
          ].join(' ')}
        />
      ))}
    </div>
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
  const albumTypeLabel = album.type_studio === true ? 'Studijinis albumas' : album.type

  const handlePlay = (idx: number) => {
    setActiveIdx(idx)
    setPlaying(true)
  }

  // Mobile tab toggle — analogiškai track page'ui (lyrics ↔ comments),
  // čia tarp Dainos ↔ Komentarai. Desktop'e abu stulpeliai matomi visada.
  const [mobileTab, setMobileTab] = useState<'tracks' | 'comments'>('tracks')

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
            const isPlaying = isActive && playing
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
                    href={`/lt/daina/${t.slug}/${t.id}`}
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
                    aria-label={!canPlay ? 'Video nėra' : (isPlaying ? `Pauzė ${t.title}` : `Leisti ${t.title}`)}
                    title={!canPlay ? '' : (isPlaying ? 'Pauzė' : 'Leisti')}
                    className={[
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors',
                      canPlay
                        ? isActive
                          ? 'bg-[var(--accent-orange)] text-white shadow-[0_4px_14px_rgba(249,115,22,0.35)]'
                          : 'bg-[var(--bg-hover)] text-[var(--text-primary)] hover:bg-[var(--accent-orange)] hover:text-white'
                        : 'cursor-default bg-transparent text-[var(--text-faint)] opacity-50',
                    ].join(' ')}
                  >
                    {isPlaying ? (
                      <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" aria-hidden>
                        <rect x="6" y="5" width="4" height="14" rx="1" />
                        <rect x="14" y="5" width="4" height="14" rx="1" />
                      </svg>
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
    <div className="min-h-screen bg-[var(--bg-surface)] text-[var(--text-primary)]" style={{ fontFamily: "'DM Sans',system-ui,sans-serif", WebkitFontSmoothing: 'antialiased' }}>

      {/* ── TOP BAR — full viewport, modal-style ─────────────────────────── */}
      <div className="flex items-center gap-4 border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3 sm:px-5">
        {/* Album cover thumb — click'as veda į atlikėjo puslapį (back nav).
            Hover overlay rodo back arrow + atlikėjo vardą — tas pats pattern
            kaip track page'e (kur thumb yra atlikėjo nuotrauka). */}
        <Link
          href={`/atlikejai/${artist.slug}`}
          aria-label={`Grįžti pas ${artist.name}`}
          title={`Grįžti pas ${artist.name}`}
          className="group relative shrink-0 overflow-hidden rounded-xl border border-[var(--border-subtle)] transition-all hover:border-[var(--accent-orange)] hover:shadow-[0_0_0_3px_rgba(249,115,22,0.18)]"
          style={{ width: 88, height: 88 }}
        >
          {album.cover_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={proxyImg(album.cover_image_url)}
              alt={album.title}
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[var(--cover-placeholder)] text-[28px]">💿</div>
          )}
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 transition-opacity group-hover:opacity-100">
            <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="white" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </span>
        </Link>

        {/* Identity cluster — title, atlikėjas, paskui chip eilutė su LikePill.
            Stack'inta vertikaliai (kaip track page'e), kad reakcijos
            netruktų prie title'o. */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="truncate font-['Outfit',sans-serif] text-[16px] font-extrabold leading-tight text-[var(--text-primary)] sm:text-[17px]">
              {album.title}
            </span>
            {album.is_upcoming && (
              <span className="inline-flex items-center rounded-full border border-[rgba(249,115,22,0.3)] bg-[rgba(249,115,22,0.18)] px-2 py-0.5 font-['Outfit',sans-serif] text-[9px] font-extrabold uppercase tracking-wider text-[var(--accent-orange)]">
                Greitai
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[12px] sm:text-[12.5px]">
            <Link
              href={`/atlikejai/${artist.slug}`}
              className="font-['Outfit',sans-serif] font-bold text-[var(--accent-orange)] no-underline hover:underline"
            >
              {artist.name}
            </Link>
            <span className="text-[var(--text-faint)]">·</span>
            <span className="text-[var(--text-muted)]">{albumTypeLabel}</span>
          </div>
          {/* Reactions row */}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <LikePill
              likes={likeCount}
              selfLiked={selfLiked}
              onToggle={onToggleLike}
              onOpenModal={onOpenLikersModal}
              pending={selfLikePending}
              variant="surface"
            />
            {tracks.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] px-2.5 py-1 font-['Outfit',sans-serif] text-[10.5px] font-bold text-[var(--text-muted)]">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                </svg>
                {tracks.length} {tracks.length === 1 ? 'daina' : 'dainos'}
              </span>
            )}
          </div>
        </div>

        {/* Meta cluster — data. Slepiasi siauresniam ekrane. */}
        <div className="hidden shrink-0 items-center gap-2 lg:flex">
          {dateStr && (
            <span className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-1.5 font-['Outfit',sans-serif] text-[12px] font-extrabold text-[var(--text-primary)]">
              {dateStr}
            </span>
          )}
        </div>
      </div>

      {/* ── Mobile tab strip ─────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-1.5 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileTab('tracks')}
          className={[
            "relative flex items-center gap-1.5 px-1 py-1.5 font-['Outfit',sans-serif] text-[12px] font-bold transition-colors",
            mobileTab === 'tracks'
              ? 'text-[var(--accent-orange)] after:absolute after:inset-x-0 after:-bottom-[6px] after:h-[2px] after:bg-[var(--accent-orange)]'
              : 'text-[var(--text-muted)]',
          ].join(' ')}
        >
          Dainos
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('comments')}
          className={[
            "relative flex items-center gap-1.5 px-1 py-1.5 font-['Outfit',sans-serif] text-[12px] font-bold transition-colors",
            mobileTab === 'comments'
              ? 'text-[var(--accent-orange)] after:absolute after:inset-x-0 after:-bottom-[6px] after:h-[2px] after:bg-[var(--accent-orange)]'
              : 'text-[var(--text-muted)]',
          ].join(' ')}
        >
          Komentarai
        </button>
      </div>

      {/* ── Mobile inline player — virš tabs/turinio (kaip track page'e) ── */}
      {showVideo && (
        <div className="aspect-video w-full bg-black lg:hidden">
          <iframe
            key={`mobile-album-${playerVid}`}
            src={`https://www.youtube.com/embed/${playerVid}?playsinline=1&rel=0&modestbranding=1&iv_load_policy=3&autoplay=${playing ? 1 : 0}`}
            title={`${album.title} — ${artist.name}`}
            className="h-full w-full"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
      )}

      {/* ── Body — desktop 3-col / tablet 2-col / mobile single ─────────── */}
      <div className={[
        'mx-auto w-full max-w-[1600px]',
        'grid grid-cols-1',
        'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]',
        'lg:divide-x lg:divide-[var(--border-subtle)]',
      ].join(' ')}>

        {/* Tracklist col */}
        <div className={[
          'min-h-0 px-5 py-5',
          mobileTab === 'tracks' ? 'block' : 'hidden lg:block',
        ].join(' ')}>
          {Tracklist}
        </div>

        {/* Comments col */}
        <div className={[
          'min-h-0 px-5 py-5',
          mobileTab === 'comments' ? 'block' : 'hidden lg:block',
        ].join(' ')}>
          <EntityCommentsBlock
            entityType="album"
            entityId={album.id}
            compact
            title="Komentarai"
          />
        </div>

        {/* Player + Daugiau col — tik xl (≥1280px). Mobile'e player'is
            jau virš body'jo (lg:hidden). */}
        <div className="hidden min-h-0 flex-col gap-4 px-5 py-5 xl:flex">
          {showVideo ? (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  Klausyti
                </div>
                {activeTrack && (
                  <span className="truncate font-['Outfit',sans-serif] text-[10.5px] font-bold text-[var(--accent-orange)]">
                    {activeTrack.title}
                  </span>
                )}
              </div>
              <div className="aspect-video w-full overflow-hidden rounded-xl bg-black shadow-[0_18px_40px_-12px_rgba(0,0,0,0.5)]">
                <iframe
                  key={`desktop-album-${playerVid}`}
                  src={`https://www.youtube.com/embed/${playerVid}?playsinline=1&rel=0&modestbranding=1&iv_load_policy=3&autoplay=${playing ? 1 : 0}`}
                  title={`${album.title} — ${artist.name}`}
                  className="h-full w-full"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-elevated)] py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--card-bg)] ring-1 ring-[var(--border-subtle)]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--text-muted)]">
                  <path d="M23 7l-7 5 7 5V7z" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
              </div>
              <div className="font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Vaizdo įrašo nėra
              </div>
            </div>
          )}

          {/* Daugiau iš atlikėjo — vertical list (analogiškai track page'ui). */}
          {otherAlbums.length > 0 && (
            <div>
              <div className="mb-2 flex items-baseline justify-between">
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
              <div className="flex flex-col gap-1.5">
                {otherAlbums.slice(0, 6).map(a => (
                  <Link
                    key={a.id}
                    href={`/lt/albumas/${a.slug}/${a.id}/`}
                    title={a.title}
                    className="group flex items-center gap-2.5 overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--card-bg)] p-1.5 no-underline transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
                  >
                    <div className="aspect-square h-12 shrink-0 overflow-hidden rounded bg-[var(--cover-placeholder)]">
                      {a.cover_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={proxyImg(a.cover_image_url)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[18px]">💿</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-['Outfit',sans-serif] text-[12.5px] font-extrabold text-[var(--text-primary)]">{a.title}</div>
                      {a.year && (
                        <div className="truncate text-[10.5px] text-[var(--text-muted)]">{a.year}</div>
                      )}
                    </div>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-[var(--text-faint)] transition-transform group-hover:translate-x-0.5">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {similarAlbums.length > 0 && (
            <div>
              <div className="mb-2 font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Panaši muzika
              </div>
              <div className="grid grid-cols-3 gap-2">
                {similarAlbums.slice(0, 6).map((a: any) => (
                  <AlbumThumbCard
                    key={a.id}
                    href={`/lt/albumas/${a.slug}/${a.id}/`}
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

      {/* ── Mobile-only ekstra (po main flow) — Daugiau / Panaši muzika ── */}
      <div className="flex flex-col gap-4 px-4 pb-12 pt-4 lg:hidden">
        {otherAlbums.length > 0 && (
          <div>
            <div className="mb-2 flex items-baseline justify-between">
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
            <div className="grid grid-cols-3 gap-2.5">
              {otherAlbums.slice(0, 6).map(a => (
                <AlbumThumbCard
                  key={a.id}
                  href={`/lt/albumas/${a.slug}/${a.id}/`}
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
            <div className="mb-2 font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              Panaši muzika
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {similarAlbums.slice(0, 6).map((a: any) => (
                <AlbumThumbCard
                  key={a.id}
                  href={`/lt/albumas/${a.slug}/${a.id}/`}
                  cover={a.cover_image_url || null}
                  title={a.title}
                  subtitle={a.artists?.name ? a.artists.name : (a.year ? String(a.year) : '')}
                />
              ))}
            </div>
          </div>
        )}
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
