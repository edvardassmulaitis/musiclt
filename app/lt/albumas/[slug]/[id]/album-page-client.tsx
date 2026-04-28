'use client'
// app/lt/albumas/[slug]/[id]/album-page-client.tsx
//
// Album page — restructured to closely mirror the artist-page TrackRow
// pattern. Full layout flow:
//
//   ┌──────────────────────────────┐
//   │  cover (~180px)  + title +   │   compact hero — small cover
//   │  artist + date + LikePill    │   (music.lt covers are 200px native,
//   ├──────────────────────────────┤   anything bigger upscales blurry)
//   │  PLAYER (full-width iframe)  │   player above tracks (was sidebar)
//   ├──────────────────────────────┤
//   │  tracks list                 │   each row: # + title/PopBar stack +
//   │   #1  title       ▶          │   play btn — same shape as the artist
//   │       ----- ----              │   page TrackRow. No YT thumb, no badges.
//   ├──────────────────────────────┤
//   │  Kiti albumai (compact grid) │   smaller thumbs so low-res music.lt
//   │  Panaši muzika (compact)      │   covers don't get blown up.
//   ├──────────────────────────────┤
//   │  Diskusija (entity_comments) │   real scraped legacy comments.
//   └──────────────────────────────┘
//
// Likes wired via /api/albums/[id]/like + LikesModal.
// Comments fetched from /api/albums/[id]/comments (entity_comments table).

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import { LikePill } from '@/components/LikePill'
import LikesModal from '@/components/LikesModal'

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

type EntityComment = {
  legacy_id: number
  author_username: string | null
  author_avatar_url: string | null
  created_at: string | null
  content_text: string | null
  content_html: string | null
  like_count: number
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

/** Avatar — real URL if available, else initial bubble. */
function UserAvatar({ name, avatarUrl, size = 28 }: { name: string; avatarUrl?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false)
  if (avatarUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={proxyImg(avatarUrl)}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full object-cover"
      />
    )
  }
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?'
  let h = 0
  for (let i = 0; i < name.length; i++) { h = ((h << 5) - h) + name.charCodeAt(i); h |= 0 }
  const hue = Math.abs(h) % 360
  return (
    <div
      style={{ width: size, height: size, background: `hsl(${hue}, 40%, 22%)` }}
      className="flex shrink-0 items-center justify-center rounded-full font-['Outfit',sans-serif] text-[11px] font-extrabold text-white"
    >
      {initial}
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

  // Album comments
  const [comments, setComments] = useState<EntityComment[] | null>(null)

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
    fetch(`/api/albums/${album.id}/comments`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setComments(d.comments || []) })
      .catch(() => { if (!cancelled) setComments([]) })
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

  // ── Album info card (sidebar) — cover + title + artist + date + LikePill ──
  const AlbumInfoCard = (
    <div className="overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
      <div className="aspect-square w-full overflow-hidden bg-[var(--cover-placeholder)]">
        {album.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={proxyImg(album.cover_image_url)}
            alt={album.title}
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[48px]">💿</div>
        )}
      </div>
      <div className="flex flex-col gap-2.5 p-4">
        <div className="flex flex-wrap items-center gap-2 font-['Outfit',sans-serif] text-[9.5px] font-extrabold uppercase tracking-[0.18em] text-[var(--accent-orange)]">
          <span>{albumTypeLabel}</span>
          {album.is_upcoming && (
            <span className="rounded-full border border-[rgba(249,115,22,0.3)] bg-[rgba(249,115,22,0.18)] px-2 py-0.5">Greitai</span>
          )}
        </div>
        <h1 className="font-['Outfit',sans-serif] text-[20px] font-black leading-[1.1] tracking-[-0.015em] text-[var(--text-primary)]">
          {album.title}
        </h1>
        <Link
          href={`/atlikejai/${artist.slug}`}
          className="font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--accent-orange)] no-underline transition-opacity hover:opacity-80"
        >
          {artist.name}
        </Link>
        {dateStr && (
          <div className="font-['Outfit',sans-serif] text-[12px] font-medium text-[var(--text-muted)]">
            {dateStr}
          </div>
        )}
        <div className="mt-1">
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
    </div>
  )

  return (
    <div className="min-h-screen bg-[var(--bg-body)] text-[var(--text-primary)] [font-family:'DM_Sans',system-ui,sans-serif] antialiased">
      <main className="mx-auto max-w-[1400px] px-4 pb-24 pt-6 sm:px-6 lg:px-10">

        {/* 2-COL split — kairėje sidebar (info + comments + similar),
            dešinėje main (player + tracks). Mobile stack'inasi natūraliai:
            info viršuje, paskui player + tracks, paskui likusios sekcijos. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-8">

          {/* ─── LEFT SIDEBAR ─── */}
          <aside className="flex flex-col gap-5">
            {AlbumInfoCard}

            {/* Comments */}
            <section>
              <div className="mb-2.5 flex items-center justify-between">
                <h2 className="font-['Outfit',sans-serif] text-[15px] font-black tracking-[-0.01em] text-[var(--text-primary)]">
                  Diskusija {comments && comments.length > 0 && (
                    <span className="ml-1 font-bold text-[var(--text-faint)]">{comments.length}</span>
                  )}
                </h2>
              </div>
              {comments === null ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-16 w-full animate-pulse rounded-lg bg-[var(--bg-surface)]" />
                  ))}
                </div>
              ) : comments.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--border-default)] px-4 py-5 text-center">
                  <div className="mb-1 text-[12px] font-bold text-[var(--text-muted)]">Dar nėra komentarų</div>
                  <div className="text-[11px] text-[var(--text-faint)]">Būk pirmas.</div>
                </div>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {comments.map((c) => {
                    const author = c.author_username || 'Anonimas'
                    const text = (c.content_text && String(c.content_text).trim())
                      || (c.content_html && c.content_html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
                      || ''
                    return (
                      <li key={c.legacy_id} className="flex items-start gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2.5">
                        <UserAvatar name={author} avatarUrl={c.author_avatar_url} size={22} />
                        <div className="min-w-0 flex-1">
                          <div className="font-['Outfit',sans-serif] text-[11px] font-extrabold text-[var(--text-secondary)]">
                            {author}
                          </div>
                          <div className="mt-0.5 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-[var(--text-primary)]">
                            {text}
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            {/* Other albums by artist */}
            {otherAlbums.length > 0 && (
              <section>
                <div className="mb-2.5 flex items-center justify-between">
                  <h2 className="font-['Outfit',sans-serif] text-[15px] font-black tracking-[-0.01em] text-[var(--text-primary)]">
                    Kiti {artist.name} albumai
                  </h2>
                  <Link
                    href={`/atlikejai/${artist.slug}`}
                    className="font-['Outfit',sans-serif] text-[11px] font-bold text-[var(--accent-orange)] no-underline hover:underline"
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
              </section>
            )}

            {/* Similar music */}
            {similarAlbums.length > 0 && (
              <section>
                <div className="mb-2.5 flex items-center justify-between">
                  <h2 className="font-['Outfit',sans-serif] text-[15px] font-black tracking-[-0.01em] text-[var(--text-primary)]">
                    Panaši muzika
                  </h2>
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
              </section>
            )}
          </aside>

          {/* ─── RIGHT MAIN — player + track list ─── */}
          <section className="flex min-w-0 flex-col gap-4">
          {/* Player */}
          <div className="overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
            <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-3 py-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent-orange)] text-white">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" /></svg>
              </div>
              <span className="font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.12em] text-[var(--text-primary)]">
                {activeTrack ? activeTrack.title : 'Albumo muzika'}
              </span>
              {activeTrack?.featuring?.length ? (
                <span className="font-['Outfit',sans-serif] text-[11px] font-medium text-[var(--text-muted)]">
                  · su {activeTrack.featuring.join(', ')}
                </span>
              ) : null}
            </div>
            {hasAnyVideo ? (
              <div className="mx-auto w-full max-w-[920px]">
                <iframe
                  key={playerVid}
                  src={`https://www.youtube.com/embed/${playerVid}?rel=0&autoplay=${playing ? 1 : 0}`}
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                  className="block aspect-video w-full border-0"
                />
              </div>
            ) : (
              <div className="flex aspect-video w-full max-w-[920px] mx-auto flex-col items-center justify-center gap-2 bg-[var(--cover-area-bg)]">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--text-faint)]">
                  <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
                </svg>
                <div className="text-[11px] text-[var(--text-faint)]">Vaizdo įrašas nepriskirtas</div>
              </div>
            )}
          </div>

          {/* Track list */}
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
                          'flex w-full items-center gap-2 px-3 py-2 transition-colors sm:px-4',
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

                        {/* Title (above) + PopBar (below) — same stacked
                            layout as artist page TrackRow. Click = play. */}
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
                                : 'bg-[var(--card-bg)] text-[var(--text-primary)] hover:bg-[var(--accent-orange)] hover:text-white'
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
          </section>
        </div>

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
