'use client'
// app/lt/albumas/[slug]/[id]/album-page-client.tsx
//
// Album page — designed to match artist-page patterns:
//  - Hero with cover + title + LikePill (no inline ad-hoc like button).
//  - PlayerCard ABOVE the tracks list (was sidebar before — buried it).
//  - TrackRow uses per-album relative PopBar (likes-based when present).
//  - Likes use unified `likes` table via /api/albums/[id]/like; modal lists
//    likers via /api/likes/album/[id]. NO separate LegacyLikesPanel.
//  - Comments section at the bottom via shared CommentsSection
//    (entity_type='album').
//  - "Ar žinojai?" decorative placeholder dropped — was static stub on
//    every album. If/when we surface admin trivia, it'll come back gated
//    on real content.
//  - ScoreCard NOT rendered on the public album page; available only via
//    /admin/albums.

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import { LikePill } from '@/components/LikePill'
import LikesModal from '@/components/LikesModal'
import CommentsSection from '@/components/CommentsSection'

type Track = {
  id: number; slug: string; title: string; type: string
  video_url: string | null; is_new: boolean; is_single: boolean
  position: number; featuring: string[]
  like_count?: number | null
  topComment?: { author: string; text: string; likes: number } | null
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

/** 5-level relative pop bar — same idea as artist page. Albumams skaičius
 *  ateina iš like_count (jei surinktas). Jei visi tracks turi 0 likes,
 *  fallback į pozicinį ranking'ą (1 = top, last = bottom). */
function popLevelRelative(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 1
  const ratio = value / max
  if (ratio >= 0.8) return 5
  if (ratio >= 0.55) return 4
  if (ratio >= 0.3) return 3
  if (ratio >= 0.1) return 2
  return 1
}

function PopBar({ level }: { level: number }) {
  const dashes = 5
  return (
    <div className="flex items-center gap-[3px]">
      {Array.from({ length: dashes }).map((_, i) => (
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

  // Like state — mirror artist page wiring exactly.
  const [selfLiked, setSelfLiked] = useState(false)
  const [selfLikePending, setSelfLikePending] = useState(false)
  const [likeCount, setLikeCount] = useState(likes)
  const [likesModalOpen, setLikesModalOpen] = useState(false)
  const [likeUsers, setLikeUsers] = useState<any[]>([])
  const [likeUsersLoaded, setLikeUsersLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/albums/${album.id}/like`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        if (typeof d.liked === 'boolean') setSelfLiked(d.liked)
        if (typeof d.count === 'number') setLikeCount(d.count)
      })
      .catch(() => { /* silent */ })
    return () => { cancelled = true }
  }, [album.id])

  const onToggleLike = async () => {
    if (selfLikePending) return
    setSelfLikePending(true)
    const prev = selfLiked
    // Optimistic flip + count adjustment.
    setSelfLiked(!prev)
    setLikeCount(c => c + (prev ? -1 : 1))
    try {
      const res = await fetch(`/api/albums/${album.id}/like`, { method: 'POST' })
      const data = await res.json()
      if (typeof data.liked === 'boolean') setSelfLiked(data.liked)
      if (typeof data.count === 'number') setLikeCount(data.count)
    } catch {
      // revert on network error
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

  // Track ordering. If album_tracks neturi pozicijų (t.y. importas pametė
  // originalią eilę), sortinam pagal track id, kad UI rodytų stabilią,
  // deterministinę tvarką (chronological).
  const positionsUnknown = tracks.length > 1 && tracks.every(t => t.position === tracks[0].position)
  const sortedTracks = useMemo(() => (
    positionsUnknown
      ? [...tracks].sort((a, b) => a.id - b.id)
      : [...tracks].sort((a, b) => a.position - b.position)
  ), [tracks, positionsUnknown])

  // Max likes — relative pop bar normalization. Jei nei vienas track
  // neturi likes (== 0 max), fallback į pozicinį ranking.
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

  return (
    <div className="min-h-screen bg-[var(--bg-body)] text-[var(--text-primary)] [font-family:'DM_Sans',system-ui,sans-serif] antialiased">
      <main className="mx-auto max-w-[1400px] space-y-10 px-4 pb-24 pt-6 sm:space-y-14 sm:px-6 lg:px-10">

        {/* HERO — cover + title/meta on left, sticky LikePill on right.
            Replaces the old "card with absolute-positioned heart" layout. */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
          <div className="flex justify-center lg:block">
            <div className="aspect-square w-full max-w-[260px] overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--cover-placeholder)] shadow-[0_18px_44px_-14px_rgba(0,0,0,0.45)]">
              {album.cover_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={proxyImg(album.cover_image_url)}
                  alt={album.title}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[64px]">💿</div>
              )}
            </div>
          </div>

          <div className="flex min-w-0 flex-col justify-center gap-3">
            <div className="flex flex-wrap items-center gap-2 font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--accent-orange)]">
              <span>{albumTypeLabel}</span>
              {album.is_upcoming && (
                <span className="rounded-full border border-[rgba(249,115,22,0.3)] bg-[rgba(249,115,22,0.18)] px-2 py-0.5">Greitai</span>
              )}
            </div>
            <h1
              className="font-['Outfit',sans-serif] font-black leading-[1.05] tracking-[-0.025em] text-[var(--text-primary)]"
              style={{ fontSize: 'clamp(1.75rem,3.2vw,2.75rem)' }}
            >
              {album.title}
            </h1>
            <Link
              href={`/atlikejai/${artist.slug}`}
              className="font-['Outfit',sans-serif] text-[16px] font-bold text-[var(--accent-orange)] no-underline transition-opacity hover:opacity-80"
            >
              {artist.name}
            </Link>
            {dateStr && (
              <div className="font-['Outfit',sans-serif] text-[13px] font-medium text-[var(--text-muted)]">
                {dateStr}
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <LikePill
                likes={likeCount}
                selfLiked={selfLiked}
                onToggle={onToggleLike}
                onOpenModal={onOpenLikersModal}
                pending={selfLikePending}
                variant="surface"
              />
            </div>
          </div>
        </section>

        {/* PLAYER + TRACK LIST — same hierarchy as artist hero. Player
            sits ABOVE tracks (anksčiau buvo sidebar'e). Mobile stacks
            naturally. */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_minmax(0,460px)] lg:items-start">
          {/* Track list — desktop left, mobile first */}
          <div className="overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
              <span className="font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.12em] text-[var(--text-primary)]">
                Dainos {tracks.length > 0 && (
                  <span className="ml-1 text-[var(--text-faint)]">{tracks.length}</span>
                )}
              </span>
              {positionsUnknown && tracks.length > 0 && (
                <span className="text-[10px] font-medium text-[var(--text-muted)]">tvarka nenurodyta</span>
              )}
            </div>
            {tracks.length === 0 ? (
              <div className="px-4 py-10 text-center text-[12px] text-[var(--text-faint)]">Dainų nėra</div>
            ) : (
              <ul className="divide-y divide-[var(--border-subtle)]">
                {sortedTracks.map((t, i) => (
                  <TrackRow
                    key={t.id}
                    t={t}
                    index={i}
                    total={sortedTracks.length}
                    artistSlug={artist.slug}
                    isPlaying={effectiveIdx === i && playing}
                    isActive={effectiveIdx === i}
                    positionsUnknown={positionsUnknown}
                    maxLikes={maxTrackLikes}
                    onPlay={() => { setActiveIdx(i); setPlaying(true) }}
                    coverImage={album.cover_image_url}
                  />
                ))}
              </ul>
            )}
          </div>

          {/* Player — sticky on desktop. */}
          <div className="lg:sticky lg:top-4">
            <div className="overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
              <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-3 py-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent-orange)] text-white">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" /></svg>
                </div>
                <span className="font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.12em] text-[var(--text-primary)]">
                  {activeTrack ? activeTrack.title : 'Albumo muzika'}
                </span>
              </div>
              {hasAnyVideo ? (
                <iframe
                  key={playerVid}
                  src={`https://www.youtube.com/embed/${playerVid}?rel=0&autoplay=${playing ? 1 : 0}`}
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                  className="block aspect-video w-full border-0"
                />
              ) : (
                <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 bg-[var(--cover-area-bg)]">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--text-faint)]">
                    <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
                  </svg>
                  <div className="text-[11px] text-[var(--text-faint)]">Vaizdo įrašas nepriskirtas</div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* OTHER ALBUMS BY THIS ARTIST */}
        {otherAlbums.length > 0 && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-['Outfit',sans-serif] text-[18px] font-black tracking-[-0.01em] text-[var(--text-primary)] sm:text-[20px]">
                Kiti {artist.name} albumai
              </h2>
              <Link
                href={`/atlikejai/${artist.slug}`}
                className="font-['Outfit',sans-serif] text-[12px] font-bold text-[var(--accent-orange)] no-underline hover:underline"
              >
                Visi →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {otherAlbums.map(a => (
                <AlbumThumbCard
                  key={a.id}
                  href={`/lt/albumas/${a.slug}/${a.id}/`}
                  cover={a.cover_image_url || null}
                  title={a.title}
                  subtitle={a.year ? String(a.year) : ''}
                />
              ))}
            </div>
          </section>
        )}

        {/* SIMILAR */}
        {similarAlbums.length > 0 && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-['Outfit',sans-serif] text-[18px] font-black tracking-[-0.01em] text-[var(--text-primary)] sm:text-[20px]">
                Panaši muzika
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {similarAlbums.map((a: any) => (
                <AlbumThumbCard
                  key={a.id}
                  href={`/lt/albumas/${a.slug}/${a.id}/`}
                  cover={a.cover_image_url || null}
                  title={a.title}
                  subtitle={a.artists?.name ? `${a.artists.name}${a.year ? ' · ' + a.year : ''}` : (a.year ? String(a.year) : '')}
                />
              ))}
            </div>
          </section>
        )}

        {/* COMMENTS — naudojam shared CommentsSection, kuris visur veikia
            su entity_type/entity_id pora. Užsiregistruoti vartotojai gali
            rašyti, anonimai mato. */}
        <CommentsSection entityType="album" entityId={album.id} title="Diskusija" />

      </main>

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

/** Compact album track row — hero-aligned w/ artist page TrackRow style.
 *  Click row OR play button to play. Pop bar uses per-album relative
 *  scaling with 5-dash levels. YT cover thumbnail is probed naturalWidth
 *  to detect dead videos (placeholder = 120px wide). */
function TrackRow({
  t, index, total, artistSlug, isPlaying, isActive, positionsUnknown,
  maxLikes, onPlay, coverImage,
}: {
  t: Track
  index: number
  total: number
  artistSlug: string
  isPlaying: boolean
  isActive: boolean
  positionsUnknown: boolean
  maxLikes: number
  onPlay: () => void
  coverImage: string | null
}) {
  const vidId = ytId(t.video_url)
  const [vidDead, setVidDead] = useState(false)
  const canPlay = !!vidId && !vidDead

  // Pop bar level. If we have likes data, normalize across album.
  // Otherwise position-based: top tracks = level 5, bottom = level 1.
  const level = useMemo(() => {
    const v = (t as any).like_count
    if (typeof v === 'number' && maxLikes > 0) {
      return popLevelRelative(v, maxLikes)
    }
    if (total <= 1) return 5
    const ratio = (total - index) / total
    return Math.max(1, Math.min(5, Math.ceil(ratio * 5)))
  }, [t, index, total, maxLikes])

  // YT thumbnail probe — naturalWidth < 200 = music.lt dead/placeholder.
  // Mirrors the artist page TrackRow approach.
  const yth = vidId ? `https://i.ytimg.com/vi/${vidId}/mqdefault.jpg` : null

  return (
    <li
      onClick={canPlay ? onPlay : undefined}
      className={[
        'flex items-center gap-3 px-3 py-2.5 transition-colors sm:px-4',
        canPlay ? 'cursor-pointer' : 'cursor-default',
        isActive ? 'bg-[var(--bg-active)]' : 'hover:bg-[var(--bg-hover)]',
      ].join(' ')}
    >
      {/* Position / disc icon */}
      {positionsUnknown ? (
        <span className="flex w-6 shrink-0 items-center justify-center text-[var(--text-faint)]" title="Originalios tvarkos nėra">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
          </svg>
        </span>
      ) : (
        <span className={[
          'w-6 shrink-0 text-center font-["Outfit",sans-serif] tabular-nums',
          isActive ? 'text-[12px] font-extrabold text-[var(--accent-orange)]' : 'text-[11px] font-medium text-[var(--text-muted)]',
        ].join(' ')}>
          {t.position}
        </span>
      )}

      {/* Cover thumbnail — track-level YT thumb if available, else album cover */}
      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md bg-[var(--cover-placeholder)]">
        {yth && !vidDead ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={yth}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
            onLoad={(ev) => {
              const el = ev.currentTarget as HTMLImageElement
              if (el.naturalWidth > 0 && el.naturalWidth < 200) setVidDead(true)
            }}
            onError={() => setVidDead(true)}
          />
        ) : coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={proxyImg(coverImage)}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[var(--text-faint)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" /></svg>
          </div>
        )}
        {isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center bg-[rgba(249,115,22,0.55)]">
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
          </div>
        )}
      </div>

      {/* Title + featuring */}
      <div className="min-w-0 flex-1">
        <Link
          href={`/dainos/${artistSlug}-${t.slug}-${t.id}`}
          onClick={(e) => e.stopPropagation()}
          className={[
            'block truncate font-["Outfit",sans-serif] text-[13px] no-underline transition-colors',
            isActive ? 'font-bold text-[var(--accent-orange)]' : 'font-bold text-[var(--text-primary)] hover:text-[var(--accent-orange)] sm:text-[13.5px]',
          ].join(' ')}
        >
          {t.title}
          {t.featuring.length > 0 && (
            <span className="ml-1 font-medium text-[var(--text-muted)]">su {t.featuring.join(', ')}</span>
          )}
        </Link>
      </div>

      {/* Badges */}
      <div className="flex shrink-0 items-center gap-1.5">
        {t.is_new && (
          <span className="rounded-md border border-[rgba(249,115,22,0.25)] bg-[rgba(249,115,22,0.12)] px-1.5 py-0.5 font-['Outfit',sans-serif] text-[8.5px] font-extrabold uppercase tracking-wide text-[var(--accent-orange)]">
            NEW
          </span>
        )}
        {t.is_single && (
          <span className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-0.5 font-['Outfit',sans-serif] text-[8.5px] font-extrabold uppercase tracking-wide text-[var(--text-muted)]">
            S
          </span>
        )}
      </div>

      {/* Pop bar */}
      <div className="hidden shrink-0 sm:block">
        <PopBar level={level} />
      </div>

      {/* Play button — only when canPlay; hidden when YT dead. */}
      {canPlay ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onPlay() }}
          aria-label={isActive ? 'Grojama' : 'Groti'}
          className={[
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors',
            isActive
              ? 'border-[var(--accent-orange)] bg-[rgba(249,115,22,0.15)] text-[var(--accent-orange)]'
              : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--accent-orange)] hover:bg-[rgba(249,115,22,0.08)] hover:text-[var(--accent-orange)]',
          ].join(' ')}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><polygon points="2,1 9,5 2,9" /></svg>
        </button>
      ) : (
        <span className="w-8 shrink-0" aria-hidden />
      )}
    </li>
  )
}

/** Album thumbnail card — used in "Kiti albumai" + "Panaši muzika" grids.
 *  Same proportions everywhere so the page reads as a coherent grid set. */
function AlbumThumbCard({ href, cover, title, subtitle }: { href: string; cover: string | null; title: string; subtitle: string }) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 no-underline"
    >
      <div className="aspect-square w-full overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--cover-placeholder)] transition-all group-hover:-translate-y-0.5 group-hover:border-[var(--border-strong)] group-hover:shadow-sm">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={proxyImg(cover)}
            alt={title}
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[28px]">💿</div>
        )}
      </div>
      <div className="min-w-0">
        <div className="line-clamp-2 font-['Outfit',sans-serif] text-[12px] font-bold leading-tight text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">
          {title}
        </div>
        {subtitle && (
          <div className="mt-0.5 truncate text-[10.5px] text-[var(--text-muted)]">{subtitle}</div>
        )}
      </div>
    </Link>
  )
}
