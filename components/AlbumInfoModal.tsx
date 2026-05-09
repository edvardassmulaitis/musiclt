'use client'
// components/AlbumInfoModal.tsx
//
// Album info modal — visiškai perdarytas 2026-05-08 po dviejų layout
// fix attempts su grid/absolute pozicijavimu, kuris vienaip ar kitaip
// palikdavo tuščius / juodus plotus xl viewport'uose.
//
// Pure flex layout, vienas medis, jokio absolute pozicijavimo
// content'ui. Responsive per Tailwind breakpoint'us:
//
//   default (mobile, <1024):  drawer w-full, backdrop hidden
//                             (drawer dengia visą ekraną solid bg)
//   lg (≥1024, <1280):        drawer w-[860px] dešinėj + backdrop kairėj
//                             (paspaudus backdrop'ą uždaroma)
//   xl (≥1280):               drawer w-[860px] kairėj + dock flex-1 dešinėj
//                             (jokio backdrop'o, viskas solid)

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import { LikePill } from '@/components/LikePill'
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
  }
  artist: { id: number; slug: string; name: string; cover_image_url: string | null }
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
  albumId: number | null
  preview?: { title: string; cover_image_url?: string | null; year?: number | null } | null
  onClose: () => void
  onPrev?: (() => void) | null
  onNext?: (() => void) | null
  onMobileInlineChange?: (active: boolean) => void
  onDockedPlayerChange?: (active: boolean) => void
}

// ── Helpers ────────────────────────────────────────────────────────────────

function ytId(url?: string | null) {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
  return m ? m[1] : null
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

// ── Component ──────────────────────────────────────────────────────────────

export default function AlbumInfoModal({
  albumId, preview, onClose,
  onPrev, onNext,
  onMobileInlineChange, onDockedPlayerChange,
}: AlbumModalProps) {
  const [details, setDetails] = useState<AlbumDetails | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeIdx, setActiveIdx] = useState<number>(-1)
  const [playing, setPlaying] = useState(false)

  // Breakpoint flags — atnaujinami su matchMedia, ne resize listener'iu.
  const [isMobile, setIsMobile] = useState(false)
  const [isWideDesktop, setIsWideDesktop] = useState(false)
  useEffect(() => {
    const mob = window.matchMedia('(max-width: 1023px)')
    const wide = window.matchMedia('(min-width: 1280px)')
    setIsMobile(mob.matches); setIsWideDesktop(wide.matches)
    const hM = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    const hW = (e: MediaQueryListEvent) => setIsWideDesktop(e.matches)
    mob.addEventListener('change', hM); wide.addEventListener('change', hW)
    return () => { mob.removeEventListener('change', hM); wide.removeEventListener('change', hW) }
  }, [])

  const [mobileTab, setMobileTab] = useState<'tracks' | 'comments'>('tracks')

  // LikePill state
  const [selfLiked, setSelfLiked] = useState(false)
  const [selfLikePending, setSelfLikePending] = useState(false)
  const [likeCount, setLikeCount] = useState<number>(0)

  useEffect(() => {
    if (albumId === null) return
    setActiveIdx(-1)
    setPlaying(false)
  }, [albumId])

  useEffect(() => {
    if (albumId === null) { setDetails(null); return }
    let cancelled = false
    setLoading(true)
    fetch(`/api/albums/${albumId}/details`)
      .then(r => r.json())
      .then((d: AlbumDetails) => {
        if (cancelled) return
        if (d?.album) { setDetails(d); setLikeCount(d.likes || 0) }
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [albumId])

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

  // ESC + body scroll lock
  useEffect(() => {
    if (albumId === null) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albumId])

  useEffect(() => {
    onMobileInlineChange?.(isMobile && albumId !== null)
  }, [isMobile, albumId, onMobileInlineChange])
  useEffect(() => {
    onDockedPlayerChange?.(isWideDesktop && albumId !== null)
  }, [isWideDesktop, albumId, onDockedPlayerChange])

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

  const albumYtIdValue = ytId(album?.video_url || null)
  const firstWithVideo = sortedTracks.findIndex(t => ytId(t.video_url))
  const effectiveIdx = activeIdx >= 0 ? activeIdx : firstWithVideo
  const activeTrack = effectiveIdx >= 0 ? sortedTracks[effectiveIdx] : null
  const activeTrackVid = activeTrack ? ytId(activeTrack.video_url) : null
  const playerVid = activeTrackVid || albumYtIdValue
  const showVideo = !!playerVid

  const handlePlay = (idx: number) => {
    setActiveIdx(idx)
    setPlaying(true)
  }

  if (albumId === null) return null

  const albumTypeLabel = album?.type_studio === true ? 'Studijinis albumas' : (album?.type || '')
  const titleNow = album?.title || preview?.title || ''
  const coverNow = album?.cover_image_url || preview?.cover_image_url || null

  // ── Sub-components (inline JSX builders to keep readability high) ──

  const TopBar = () => (
    <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-3 sm:gap-4 sm:px-5">
      {artist ? (
        <Link href={`/atlikejai/${artist.slug}`} aria-label={`Pas ${artist.name}`} title={`Pas ${artist.name}`}
          className="group relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl border border-[var(--border-subtle)] transition-all hover:border-[var(--accent-orange)] hover:shadow-[0_0_0_3px_rgba(249,115,22,0.18)]">
          {coverNow ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proxyImg(coverNow)} alt={titleNow} referrerPolicy="no-referrer" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[var(--cover-placeholder)] text-[24px]">💿</div>
          )}
        </Link>
      ) : (
        <div className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl border border-[var(--border-subtle)]">
          {coverNow ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proxyImg(coverNow)} alt={titleNow} referrerPolicy="no-referrer" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[var(--cover-placeholder)] text-[24px]">💿</div>
          )}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="truncate font-['Outfit',sans-serif] text-[15px] font-extrabold leading-tight text-[var(--text-primary)] sm:text-[16px]">
            {titleNow || 'Kraunama…'}
          </span>
          {album?.is_upcoming && (
            <span className="inline-flex items-center rounded-full border border-[rgba(249,115,22,0.3)] bg-[rgba(249,115,22,0.18)] px-2 py-0.5 font-['Outfit',sans-serif] text-[9px] font-extrabold uppercase tracking-wider text-[var(--accent-orange)]">
              Greitai
            </span>
          )}
        </div>
        {artist && (
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px]">
            <Link href={`/atlikejai/${artist.slug}`} className="font-['Outfit',sans-serif] font-bold text-[var(--accent-orange)] no-underline hover:underline">
              {artist.name}
            </Link>
            {albumTypeLabel && (<><span className="text-[var(--text-faint)]">·</span><span className="text-[var(--text-muted)]">{albumTypeLabel}</span></>)}
            {album?.dateFormatted && (<><span className="text-[var(--text-faint)]">·</span><span className="text-[var(--text-muted)]">{album.dateFormatted}</span></>)}
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <LikePill likes={likeCount} selfLiked={selfLiked} onToggle={onToggleLike} pending={selfLikePending} variant="surface" />
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

      <div className="flex shrink-0 items-center gap-1">
        {onPrev && (
          <button type="button" onClick={onPrev} aria-label="Ankstesnis albumas" title="Ankstesnis albumas"
            className="hidden h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] sm:flex">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 18l-6-6 6-6" /></svg>
          </button>
        )}
        {onNext && (
          <button type="button" onClick={onNext} aria-label="Kitas albumas" title="Kitas albumas"
            className="hidden h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] sm:flex">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 18l6-6-6-6" /></svg>
          </button>
        )}
        {album && (
          <Link href={`/albumai/${album.slug}-${album.id}`} aria-label="Atidaryti albumo puslapį" title="Atidaryti albumo puslapį"
            className="hidden h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] sm:flex">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M7 17L17 7" /><path d="M8 7h9v9" /></svg>
          </Link>
        )}
        <button type="button" onClick={onClose} aria-label="Uždaryti" title="Uždaryti"
          className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  )

  const Tracklist = () => (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
      <div className="mb-3 flex items-baseline gap-2">
        <div className="font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]">Dainos</div>
        {tracks.length > 0 && (
          <span className="font-['Outfit',sans-serif] text-[10px] font-bold text-[var(--text-faint)]">{tracks.length}</span>
        )}
      </div>
      {loading && tracks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-10 text-center text-[12px] text-[var(--text-faint)]">Kraunama…</div>
      ) : tracks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-10 text-center text-[12px] text-[var(--text-faint)]">Dainų nėra</div>
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
                <div className={['flex w-full items-center gap-2 px-3 py-2 transition-colors', isActive ? 'bg-[rgba(249,115,22,0.08)]' : 'hover:bg-[var(--bg-hover)]'].join(' ')}>
                  <span className={['w-5 shrink-0 text-center font-["Outfit",sans-serif] text-[12px] font-bold tabular-nums', isActive ? 'text-[var(--accent-orange)]' : 'text-[var(--text-faint)]'].join(' ')} aria-hidden>
                    {positionsUnknown ? '·' : (t.position || i + 1)}
                  </span>
                  <button type="button" onClick={() => canPlay && handlePlay(i)} disabled={!canPlay}
                    className={['flex min-w-0 flex-1 flex-col items-start border-0 bg-transparent p-0 text-left', canPlay ? 'cursor-pointer' : 'cursor-default'].join(' ')}>
                    <div className={['w-full truncate font-["Outfit",sans-serif] text-[13px] font-bold leading-tight', isActive ? 'text-[var(--accent-orange)]' : 'text-[var(--text-primary)]'].join(' ')}>
                      {t.title}
                      {t.featuring.length > 0 && (
                        <span className="ml-1 font-medium text-[var(--text-muted)]">su {t.featuring.join(', ')}</span>
                      )}
                    </div>
                    <PopBar level={level} />
                  </button>
                  {artist && (
                    <Link href={`/dainos/${artist?.slug || ''}-${t.slug || t.id}-${t.id}`} aria-label={`Atidaryti ${t.title}`} title="Atidaryti dainą"
                      className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--text-faint)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--accent-orange)] sm:flex">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M7 17L17 7" /><path d="M8 7h9v9" /></svg>
                    </Link>
                  )}
                  <button onClick={() => canPlay && handlePlay(i)} disabled={!canPlay}
                    aria-label={!canPlay ? 'Video nėra' : (isPlaying ? `Pauzė ${t.title}` : `Leisti ${t.title}`)}
                    title={!canPlay ? '' : (isPlaying ? 'Pauzė' : 'Leisti')}
                    className={['flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors', canPlay ? (isActive ? 'bg-[var(--accent-orange)] text-white shadow-[0_4px_14px_rgba(249,115,22,0.35)]' : 'bg-[var(--bg-hover)] text-[var(--text-primary)] hover:bg-[var(--accent-orange)] hover:text-white') : 'cursor-default bg-transparent text-[var(--text-faint)] opacity-50'].join(' ')}>
                    {isPlaying ? (
                      <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" aria-hidden>
                        <rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" aria-hidden><polygon points="6,4 20,12 6,20" /></svg>
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

  const Comments = () => (
    <div className="min-h-0 flex-1 overflow-y-auto border-t border-[var(--border-subtle)] px-4 py-4 sm:px-5 lg:border-l lg:border-t-0">
      {album ? (
        <EntityCommentsBlock entityType="album" entityId={album.id} compact title="Komentarai" />
      ) : (
        <div className="text-[12px] text-[var(--text-faint)]">Kraunama…</div>
      )}
    </div>
  )

  const DockPanel = () => (
    <aside className="flex h-full flex-1 min-w-[420px] flex-col gap-4 overflow-y-auto border-l border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5">
      {showVideo ? (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]">Klausyti</div>
            {activeTrack && (
              <span className="truncate font-['Outfit',sans-serif] text-[10.5px] font-bold text-[var(--accent-orange)]">{activeTrack.title}</span>
            )}
          </div>
          <div className="aspect-video w-full overflow-hidden rounded-xl bg-black shadow-[0_18px_40px_-12px_rgba(0,0,0,0.5)]">
            <iframe key={`dock-album-${playerVid}`}
              src={`https://www.youtube.com/embed/${playerVid}?playsinline=1&rel=0&modestbranding=1&iv_load_policy=3&autoplay=${playing ? 1 : 0}`}
              title={titleNow} className="h-full w-full"
              referrerPolicy="strict-origin-when-cross-origin"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--card-bg)] py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--bg-elevated)] ring-1 ring-[var(--border-subtle)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--text-muted)]">
              <path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
          </div>
          <div className="font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]">Vaizdo įrašo nėra</div>
        </div>
      )}

      {details && details.otherAlbums.length > 0 && (
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <div className="font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]">Daugiau {artist?.name}</div>
            <Link href={`/atlikejai/${artist?.slug}`} className="font-['Outfit',sans-serif] text-[10px] font-bold text-[var(--accent-orange)] no-underline hover:underline">Visi →</Link>
          </div>
          <div className="flex flex-col gap-1.5">
            {details.otherAlbums.slice(0, 6).map(a => (
              <Link key={a.id} href={`/albumai/${a.slug}-${a.id}`} title={a.title}
                className="group flex items-center gap-2.5 overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--card-bg)] p-1.5 no-underline transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]">
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
                  {a.year && <div className="truncate text-[10.5px] text-[var(--text-muted)]">{a.year}</div>}
                </div>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-[var(--text-faint)] transition-transform group-hover:translate-x-0.5"><path d="M9 18l6-6-6-6" /></svg>
              </Link>
            ))}
          </div>
        </div>
      )}
    </aside>
  )

  // ── Main return — pure flex layout ──

  return (
    <div className="fixed inset-0 z-[9999] flex"
      role="dialog" aria-modal="true"
      aria-label={titleNow ? `${titleNow} albumo informacija` : 'Albumo informacija'}
      style={{ fontFamily: "'DM Sans',system-ui,sans-serif" }}>

      {/* Backdrop — užima visą likusį plotą KAIRĖJ nuo drawer'io. Click
          outside uždaro. xl viewport'e backdrop'as paslėptas (modal'as
          fullscreen, drawer kairėj + dock dešinėj nepalieka tuščio
          ploto). */}
      <button type="button" aria-label="Uždaryti modal'ą"
        onClick={onClose}
        className="flex-1 cursor-pointer bg-black/65 transition-opacity duration-150 max-lg:hidden xl:hidden" />

      {/* Drawer — modal'o pagrindinis turinys. Mobile: w-full (perdengia visą
          ekraną). lg: 860px dešinėj. xl: 860px kairėj (dock dešinėj). */}
      <aside className="flex h-full w-full shrink-0 flex-col overflow-hidden bg-[var(--bg-surface)] shadow-2xl lg:w-[860px] xl:order-1">
        <TopBar />

        {/* Mobile tab bar — tik <lg, nes lg+ rodom tracks + comments šalia */}
        <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-1.5 lg:hidden">
          <button type="button" onClick={() => setMobileTab('tracks')}
            className={['relative flex items-center gap-1.5 px-1 py-1.5 font-["Outfit",sans-serif] text-[12px] font-bold transition-colors', mobileTab === 'tracks' ? 'text-[var(--accent-orange)] after:absolute after:inset-x-0 after:-bottom-[6px] after:h-[2px] after:bg-[var(--accent-orange)]' : 'text-[var(--text-muted)]'].join(' ')}>
            Dainos
          </button>
          <button type="button" onClick={() => setMobileTab('comments')}
            className={['relative flex items-center gap-1.5 px-1 py-1.5 font-["Outfit",sans-serif] text-[12px] font-bold transition-colors', mobileTab === 'comments' ? 'text-[var(--accent-orange)] after:absolute after:inset-x-0 after:-bottom-[6px] after:h-[2px] after:bg-[var(--accent-orange)]' : 'text-[var(--text-muted)]'].join(' ')}>
            Komentarai
          </button>
        </div>

        {/* Mobile inline player */}
        {showVideo && (
          <div className="aspect-video w-full shrink-0 bg-black lg:hidden">
            <iframe key={`mobile-album-modal-${playerVid}`}
              src={`https://www.youtube.com/embed/${playerVid}?playsinline=1&rel=0&modestbranding=1&iv_load_policy=3&autoplay=${playing ? 1 : 0}`}
              title={titleNow} className="h-full w-full"
              referrerPolicy="strict-origin-when-cross-origin"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
          </div>
        )}

        {/* Body — lg+: tracks (left) + comments (right) side-by-side.
            Mobile: viena kolona, perjungiama tab'ais. */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className={['flex h-full flex-1 flex-col', mobileTab === 'tracks' ? 'flex' : 'hidden lg:flex'].join(' ')}>
            <Tracklist />
          </div>
          <div className={['flex h-full flex-1 flex-col', mobileTab === 'comments' ? 'flex' : 'hidden lg:flex'].join(' ')}>
            <Comments />
          </div>
        </div>
      </aside>

      {/* Dock — tik xl, dešinėj nuo drawer'io. */}
      {isWideDesktop && <DockPanel />}
    </div>
  )
}
