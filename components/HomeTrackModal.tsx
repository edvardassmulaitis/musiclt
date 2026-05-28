'use client'

// components/HomeTrackModal.tsx
//
// Track modalas homepage'ui. Atitinka artist page'o TrackInfoModal vizualinį
// stilių (žr. app/atlikejai/[slug]/artist-profile-client.tsx ~1700+ eilutės):
//   - Header: artist thumb + title + artist + close
//   - Row 2: YT video kairėje (su orange play overlay) + meta dešinėje
//     (likes + data + album)
//   - Tabs: Tekstas / Komentarai
//   - Body: lyrics arba komentarai
//
// Skirtumai nuo TrackInfoModal:
//   • Lengvasvoris — fetch'ina papildomą info per /api/tracks/[id]
//   • Be prev/next navigacijos tarp tracks (artist contextas nepasiekiamas)
//   • Komentarai per fetch /api/tracks/[id]/comments (read-only display)
//
// YT play tracking: kai user'is paspaudžia orange play overlay → POST'inam į
// /api/tracks/[id]/play (fire-and-forget) ir per postMessage triggernam
// YouTube iframe play. Tas vienas play count'as.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'

type HomeTrack = {
  id: number
  title: string
  slug?: string | null
  cover_url?: string | null
  video_url?: string | null
  video_uploaded_at?: string | null
  artists?: { id: number; slug: string; name: string; cover_image_url?: string | null } | null
  artist_slug?: string | null
  artist_name?: string | null
}

type TrackExtra = {
  lyrics?: string | null
  release_year?: number | null
  release_date?: string | null
  like_count?: number | null
  duration?: number | null
  albums?: Array<{ id: number; slug?: string | null; title: string; year?: number | null }>
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

const MONTHS_LT_FULL = ['sausio', 'vasario', 'kovo', 'balandžio', 'gegužės', 'birželio', 'liepos', 'rugpjūčio', 'rugsėjo', 'spalio', 'lapkričio', 'gruodžio']

function getYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}

function sanitizeTitle(raw: string): string {
  return raw.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim()
}

function formatDuration(sec: number | null | undefined): string | null {
  if (!sec || sec <= 0) return null
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** „Prieš X d." YT upload date'ui. */
function formatRelativeDate(input: string | null | undefined): string | null {
  if (!input) return null
  const d = new Date(input)
  if (isNaN(d.getTime())) return null
  const diff = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  if (diff < 0) return null
  if (diff === 0) return 'Šiandien'
  if (diff === 1) return 'Vakar'
  if (diff <= 30) return `Prieš ${diff} d.`
  return `${d.getFullYear()} m. ${MONTHS_LT_FULL[d.getMonth()]} ${d.getDate()} d.`
}

function timeAgo(d: string | null | undefined) {
  if (!d) return ''
  const date = new Date(d)
  if (isNaN(date.getTime())) return ''
  const m = Math.floor((Date.now() - date.getTime()) / 60000)
  if (m < 1) return 'ką tik'
  if (m < 60) return `${m} min.`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} val.`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days} d.`
  return date.toLocaleDateString('lt-LT', { month: 'short', day: 'numeric' })
}

function strHue(s: string) {
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h
}

export function HomeTrackModal({ track, onClose }: { track: HomeTrack | null; onClose: () => void }) {
  const [extra, setExtra] = useState<TrackExtra | null>(null)
  const [tab, setTab] = useState<'lyrics' | 'comments'>('lyrics')
  const [comments, setComments] = useState<EntityComment[] | null>(null)
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [videoStarted, setVideoStarted] = useState(false)
  const [selfLiked, setSelfLiked] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Reset per-track state when track changes.
  useEffect(() => {
    setExtra(null)
    setComments(null)
    setTab('lyrics')
    setVideoStarted(false)
    setSelfLiked(false)
  }, [track?.id])

  // Fetch track details
  useEffect(() => {
    if (!track) return
    let alive = true
    fetch(`/api/tracks/${track.id}`)
      .then(r => r.json())
      .then(d => {
        if (!alive) return
        setExtra({
          lyrics: d.lyrics || null,
          release_year: d.release_year || (d.release_date ? new Date(d.release_date).getFullYear() : null),
          release_date: d.release_date || null,
          like_count: typeof d.like_count === 'number' ? d.like_count : null,
          duration: d.duration || null,
          albums: d.albums || [],
        })
      })
      .catch(() => { if (alive) setExtra({}) })
    return () => { alive = false }
  }, [track?.id])

  // Lazy fetch comments when tab toggled
  useEffect(() => {
    if (!track || tab !== 'comments' || comments !== null) return
    setCommentsLoading(true)
    fetch(`/api/tracks/${track.id}/comments`)
      .then(r => r.json())
      .then(d => setComments(d.comments || []))
      .catch(() => setComments([]))
      .finally(() => setCommentsLoading(false))
  }, [tab, track?.id, comments])

  // Escape + body scroll lock
  useEffect(() => {
    if (!track) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const scrollY = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.left = '0'
    document.body.style.right = '0'
    document.body.style.width = '100%'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.left = ''
      document.body.style.right = ''
      document.body.style.width = ''
      window.scrollTo(0, scrollY)
    }
  }, [track?.id, onClose])

  if (!track) return null
  if (typeof document === 'undefined') return null

  const artist = track.artists
  const artistName = artist?.name || track.artist_name || ''
  const artistSlug = artist?.slug || track.artist_slug || ''
  const artistImg = artist?.cover_image_url || null
  const ytId = getYouTubeId(track.video_url || null)
  const trackHref = artistSlug && track.slug
    ? `/dainos/${artistSlug}-${track.slug}-${track.id}`
    : `/lt/daina/${track.slug || ''}/${track.id}`
  const title = sanitizeTitle(track.title)
  const baseLikes = extra?.like_count ?? 0
  const likes = baseLikes + (selfLiked ? 1 : 0)
  const dur = formatDuration(extra?.duration)
  const dateLabel = extra?.release_date
    ? (() => {
      const d = new Date(extra.release_date!)
      if (isNaN(d.getTime())) return extra.release_year ? `${extra.release_year} m.` : null
      return `${d.getFullYear()} m.`
    })()
    : extra?.release_year ? `${extra.release_year} m.` : null
  const ytUploadRel = formatRelativeDate(track.video_uploaded_at || null)

  const handlePlay = () => {
    setVideoStarted(true)
    // Fire-and-forget play count
    fetch(`/api/tracks/${track.id}/play`, { method: 'POST' }).catch(() => {})
    // Trigger YT iframe play via postMessage
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
      '*',
    )
  }

  const lyricsText = (extra?.lyrics || '').trim()
  const lyricsLines = lyricsText
    ? lyricsText.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '').split('\n').map(l => l.trim()).filter(l => l)
    : []

  return createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:bg-black/40"
    >
      <aside
        role="dialog"
        aria-label={`Apie dainą ${title}`}
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-[720px] flex-col overflow-hidden rounded-t-2xl bg-[var(--bg-surface)] shadow-[0_24px_60px_-10px_rgba(0,0,0,0.5)] sm:mx-4 sm:rounded-2xl"
        style={{ height: 'min(92vh, 720px)' }}
      >
        {/* Mobile handle bar */}
        <div className="flex shrink-0 justify-center pt-2 pb-1 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-[var(--border-default)]" />
        </div>

        {/* Header — thumb + title + artist + close */}
        <div className="flex shrink-0 items-center gap-2.5 border-b border-[var(--border-subtle)] px-4 py-2.5">
          {artistImg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={proxyImg(artistImg)}
              alt={artistName}
              className="h-9 w-9 shrink-0 rounded-lg border border-[var(--border-subtle)] object-cover"
              style={{ objectPosition: 'center top' }}
            />
          ) : (
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-['Outfit',sans-serif] text-[14px] font-extrabold"
              style={{
                background: `hsl(${strHue(artistName || title)},32%,18%)`,
                color: `hsl(${strHue(artistName || title)},45%,55%)`,
              }}
            >
              {(artistName || title).charAt(0).toUpperCase() || '?'}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate font-['Outfit',sans-serif] text-[15px] font-extrabold leading-tight text-[var(--text-primary)]">
              {title}
            </div>
            {artistName && (
              artistSlug ? (
                <Link
                  href={`/atlikejai/${artistSlug}`}
                  className="block truncate text-[11.5px] font-bold leading-tight text-[var(--text-secondary)] no-underline hover:underline"
                  onClick={onClose}
                >
                  {artistName}
                </Link>
              ) : (
                <div className="truncate text-[11.5px] font-bold leading-tight text-[var(--text-secondary)]">{artistName}</div>
              )
            )}
          </div>
          <Link
            href={trackHref}
            target="_blank"
            rel="noopener"
            title="Atidaryti dainos puslapį naujame lange"
            aria-label="Atidaryti dainos puslapį"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          >
            <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 3h7v7M21 3l-9 9M5 5h6M5 5v14h14v-6" />
            </svg>
          </Link>
          <button
            onClick={onClose}
            aria-label="Uždaryti"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          >
            <svg viewBox="0 0 16 16" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        {/* Row 2: video LEFT + meta stack RIGHT */}
        <div className="grid shrink-0 grid-cols-[minmax(0,3fr)_minmax(0,2fr)] border-b border-[var(--border-subtle)]">
          {/* Left: video */}
          <div className="relative aspect-video max-h-[220px] w-full overflow-hidden bg-black sm:max-h-[260px]">
            {ytId ? (
              <>
                <iframe
                  ref={iframeRef}
                  key={`modal-video-${ytId}`}
                  src={`https://www.youtube.com/embed/${ytId}?playsinline=1&rel=0&modestbranding=1&iv_load_policy=3&enablejsapi=1`}
                  title={title}
                  className="absolute inset-0 h-full w-full"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                />
                {!videoStarted && (
                  <button
                    type="button"
                    onClick={handlePlay}
                    aria-label={`Leisti ${title}`}
                    className="group absolute inset-0 block h-full w-full overflow-hidden"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`}
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

          {/* Right: meta — likes + data + albums */}
          <div className="flex flex-col items-start gap-1 border-l border-[var(--border-subtle)] px-3 py-2.5 text-[11px]">
            <button
              type="button"
              onClick={() => setSelfLiked(v => !v)}
              className="inline-flex items-center gap-1.5 rounded-full border px-2 py-1 transition-colors"
              style={{
                background: selfLiked ? 'rgba(249,115,22,0.15)' : 'var(--card-bg)',
                borderColor: selfLiked ? 'rgba(249,115,22,0.4)' : 'var(--border-subtle)',
                color: selfLiked ? 'var(--accent-orange)' : 'var(--text-primary)',
              }}
              aria-pressed={selfLiked}
              aria-label={selfLiked ? 'Anuliuoti patiktuką' : 'Patiko'}
            >
              <span style={{ fontSize: 12, lineHeight: 1 }}>♥</span>
              <span className="font-['Outfit',sans-serif] text-[11.5px] font-extrabold tabular-nums">{likes.toLocaleString('lt-LT')}</span>
            </button>
            {dateLabel && (
              <span className="mt-1 font-['Outfit',sans-serif] text-[11px] font-extrabold leading-tight text-[var(--text-primary)]">
                {dateLabel}
              </span>
            )}
            {ytUploadRel && ytUploadRel !== dateLabel && (
              <span className="font-['Outfit',sans-serif] text-[10.5px] font-bold leading-tight text-[var(--text-muted)]">
                YT: {ytUploadRel}
              </span>
            )}
            {dur && (
              <span className="font-['Outfit',sans-serif] text-[11px] font-bold tabular-nums text-[var(--text-muted)]">{dur}</span>
            )}
            {(extra?.albums || []).slice(0, 2).map((al) => (
              <Link
                key={al.id}
                href={`/lt/albumas/${al.slug || ''}/${al.id}`}
                target="_blank"
                rel="noopener"
                title={al.title}
                className="mt-1 flex min-w-0 items-center gap-1.5 text-[10.5px] font-bold text-[var(--text-muted)] no-underline hover:text-[var(--accent-orange)]"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="3" /><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16z" /></svg>
                <span className="truncate">{al.title}{al.year ? ` (${al.year})` : ''}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0 border-b border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => setTab('lyrics')}
            className={`flex-1 px-3 py-2.5 font-['Outfit',sans-serif] text-[12px] font-extrabold uppercase tracking-[0.06em] transition-colors ${
              tab === 'lyrics'
                ? 'text-[var(--accent-orange)] border-b-2 border-[var(--accent-orange)]'
                : 'text-[var(--text-muted)] border-b-2 border-transparent hover:text-[var(--text-primary)]'
            }`}
          >
            Tekstas
          </button>
          <button
            type="button"
            onClick={() => setTab('comments')}
            className={`flex-1 px-3 py-2.5 font-['Outfit',sans-serif] text-[12px] font-extrabold uppercase tracking-[0.06em] transition-colors ${
              tab === 'comments'
                ? 'text-[var(--accent-orange)] border-b-2 border-[var(--accent-orange)]'
                : 'text-[var(--text-muted)] border-b-2 border-transparent hover:text-[var(--text-primary)]'
            }`}
          >
            Komentarai{comments !== null && comments.length > 0 ? ` ${comments.length}` : ''}
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-4 py-3" style={{ WebkitOverflowScrolling: 'touch' }}>
          {tab === 'lyrics' && (
            <>
              {extra === null ? (
                <div className="space-y-2">
                  {Array(8).fill(null).map((_, i) => (
                    <div key={i} className="h-3 w-[90%] rounded bg-[var(--bg-active)]" style={{ animation: 'hpPulse 1.8s ease-in-out infinite', opacity: 0.5, width: `${60 + (i * 11) % 35}%` }} />
                  ))}
                  <style>{`@keyframes hpPulse{0%,100%{opacity:0.3}50%{opacity:0.6}}`}</style>
                </div>
              ) : lyricsLines.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="m-0 text-[12px] text-[var(--text-faint)]">Dainos teksto kol kas nėra</p>
                  <Link
                    href={trackHref}
                    target="_blank"
                    rel="noopener"
                    className="mt-3 text-[12px] font-extrabold text-[var(--accent-orange)] no-underline hover:underline"
                  >
                    Atidaryti dainos puslapį →
                  </Link>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {lyricsLines.map((line, i) => (
                    <p key={i} className="m-0 text-[13.5px] leading-relaxed text-[var(--text-secondary)]">
                      {line}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
          {tab === 'comments' && (
            <>
              {commentsLoading || comments === null ? (
                <div className="py-8 text-center text-[12px] text-[var(--text-faint)]">Kraunama…</div>
              ) : comments.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="m-0 text-[12px] text-[var(--text-faint)]">Komentarų dar nėra</p>
                  <Link
                    href={trackHref}
                    target="_blank"
                    rel="noopener"
                    className="mt-3 inline-block text-[12px] font-extrabold text-[var(--accent-orange)] no-underline hover:underline"
                  >
                    Komentuoti dainos puslapyje →
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {comments.map(c => {
                    const author = c.author_username || 'Anonimas'
                    return (
                      <div key={c.legacy_id} className="flex gap-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-2.5">
                        {c.author_avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={proxyImg(c.author_avatar_url)} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                        ) : (
                          <div
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-['Outfit',sans-serif] text-[10.5px] font-extrabold"
                            style={{ background: `hsl(${strHue(author)},32%,18%)`, color: `hsl(${strHue(author)},45%,55%)` }}
                          >
                            {author.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="font-['Outfit',sans-serif] text-[12px] font-extrabold text-[var(--text-primary)]">{author}</span>
                            <span className="text-[10px] text-[var(--text-faint)]">{timeAgo(c.created_at)}</span>
                          </div>
                          <p className="m-0 mt-1 whitespace-pre-line text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
                            {(c.content_text || '').replace(/<[^>]+>/g, '').trim()}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  )
}
