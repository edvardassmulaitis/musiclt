'use client'
// components/EntityCommentsBlock.tsx
//
// Unified comments component used across track page, track modal, album page,
// (eventually) artist surface. Combines:
//
//   1. Legacy entity_comments (read-only archive scraped iš music.lt)
//   2. Modern comments (user-editable, replies, likes, edit, delete)
//
// Both are fetched in parallel, merged into one list. Composer is at the TOP
// (encourages writing — first thing the user sees). Replies show an orange
// quote of the parent comment using the shared `.quote1` style. Likes use the
// shared LikePill — heart toggles, count opens LikesModal. Music attachments
// open in an overlay modal so the composer never shifts layout.
//
// Variants:
//   - default: standalone block (track page, album page)
//   - compact:  inside a side modal — tighter spacing, smaller avatars
//
// API:
//   - Modern: /api/comments  (GET / POST / PATCH / DELETE)
//   - Modern likes: /api/comments/likes  (GET / POST)
//   - Legacy: /api/{tracks|albums|artists}/[id]/comments  (GET only)

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import { type AttachmentHit } from './MusicSearchPicker'
import MusicSearchModal from './MusicSearchModal'
import LikesModal, { type LikeUser } from './LikesModal'
import { relativeTime } from '@/lib/relative-time'

type ModernComment = {
  id: number
  parent_id: number | null
  depth?: number
  user_id: string | null
  author_name: string | null
  author_avatar: string | null
  body: string
  like_count: number
  music_attachments?: AttachmentHit[] | null
  created_at: string
  edited_at?: string | null
  is_deleted?: boolean
  source: 'modern'
}

type LegacyComment = {
  legacy_id: number
  author_username: string | null
  author_avatar_url: string | null
  created_at: string | null
  content_text: string | null
  content_html: string | null
  like_count: number
  music_attachments?: AttachmentHit[] | null
  source: 'legacy'
}

type AnyComment = ModernComment | LegacyComment

type Props = {
  entityType: 'track' | 'album' | 'artist'
  entityId: number
  /** Optional — only needed if the legacy endpoint differs (currently same shape). */
  legacyEndpoint?: string
  /** Compact mode — modal use; tighter spacing. */
  compact?: boolean
  /** Title above the list. Defaults to "Diskusija". */
  title?: string
}

function stripHtml(html?: string | null): string {
  return decodeEntities((html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
}

/** Decode the most common HTML entities that legacy music.lt comments
 *  contain — `&nbsp;`, `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`. The DOM
 *  parser approach (`new DOMParser().parseFromString`) is more correct but
 *  doesn't run server-side, so we use a small whitelist here. */
function decodeEntities(s: string): string {
  if (!s) return s
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&hellip;/g, '…')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
}

/** Parse legacy HTML body for music.lt-style `<div class="quote1">` reply
 *  quotes. Returns the quote author + quote text + remainder text. Falls
 *  back to plain stripHtml if no quote block found. */
function parseLegacyHtmlQuote(html: string): { quoteAuthor: string | null; quoteText: string | null; rest: string } {
  // Music.lt thread quote format:
  //   <div class="quote1"><b>Author rašė:</b>quote text...</div>actual reply
  // Heuristic regex — extracts author from <b>...rašė:</b> and the rest of
  // the quote block, then everything after the closing </div> as `rest`.
  const m = html.match(/<div[^>]*class=["']?quote1["']?[^>]*>([\s\S]*?)<\/div>([\s\S]*)$/i)
  if (!m) return { quoteAuthor: null, quoteText: null, rest: stripHtml(html) }
  const inside = m[1]
  const after = m[2]
  const auth = inside.match(/<b[^>]*>([^<]*?)\s*ra[sš]ė:?\s*<\/b>/i)
  const quoteAuthor = auth ? auth[1].trim() : null
  // Strip the <b>author rašė:</b> from inside, then the rest is the quoted
  // text body.
  const innerNoAuthor = inside.replace(/<b[^>]*>[^<]*?ra[sš]ė:?\s*<\/b>/i, '')
  const quoteText = stripHtml(innerNoAuthor)
  const rest = stripHtml(after)
  if (!quoteText && !rest) return { quoteAuthor: null, quoteText: null, rest: stripHtml(html) }
  return { quoteAuthor, quoteText, rest }
}

/** Parses a body that begins with the diskusijos-style reply prefix
 *  ("Author rašė:\nquoted text\n\nactual reply") and splits into the orange
 *  quote block + remainder. If no prefix is present, returns null quote and
 *  the full body. Keeps everything string-based — same wire format as the
 *  thread modal so we don't need a separate column.
 *
 *  Tolerant to whitespace variants — single \n separators, leading/trailing
 *  whitespace, stray HTML entities, etc. */
function parseReplyBody(body: string): { quoteAuthor: string | null; quoteText: string | null; rest: string } {
  // Match "<author> rašė:\n<...>\n\n<rest>" — non-greedy on the quote so
  // it stops at first blank-line separator. Tolerant of \r\n endings, lone
  // \n separators (single newline), or extra leading whitespace.
  // Variants tried in order:
  //   1. Author rašė:\n...\n\n... (canonical)
  //   2. Author rašė:\n...\n... (single \n separator — when user edited)
  const canonical = body.match(/^\s*(.+?)\s+ra[sš]ė:\s*\n([\s\S]*?)\n\s*\n([\s\S]+)$/)
  if (canonical) return { quoteAuthor: canonical[1].trim(), quoteText: canonical[2].trim(), rest: canonical[3].trim() }
  const single = body.match(/^\s*(.+?)\s+ra[sš]ė:\s*\n([\s\S]*?)\n([\s\S]+)$/)
  if (single) return { quoteAuthor: single[1].trim(), quoteText: single[2].trim(), rest: single[3].trim() }
  return { quoteAuthor: null, quoteText: null, rest: body }
}

/** Tinted-initial fallback avatar. */
function InitialBubble({ name, size }: { name: string; size: number }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?'
  let h = 0
  for (let i = 0; i < name.length; i++) { h = ((h << 5) - h) + name.charCodeAt(i); h |= 0 }
  const hue = Math.abs(h) % 360
  return (
    <div
      style={{ width: size, height: size, background: `hsl(${hue}, 40%, 22%)` }}
      className="flex shrink-0 items-center justify-center rounded-full font-['Outfit',sans-serif] font-extrabold text-white"
    >
      <span style={{ fontSize: Math.max(9, Math.floor(size * 0.4)) }}>{initial}</span>
    </div>
  )
}

/** Compact like control for comments — heart icon + count, no pill chrome.
 *  When count = 0, count number is hidden (just clickable heart). When count
 *  > 0, count is rendered next to heart and clicking it opens the likers
 *  modal via onOpenModal. */
function CommentLike({
  count, liked, onToggle, onOpenModal, disabled,
}: {
  count: number
  liked: boolean
  onToggle: () => void
  onOpenModal?: () => void
  disabled?: boolean
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-label={liked ? 'Atšaukti patinka' : 'Pažymėti patinka'}
        title={liked ? 'Patinka' : 'Pažymėti patinka'}
        className={[
          'flex items-center justify-center transition-colors',
          liked ? 'text-[var(--accent-orange)]' : 'text-[var(--text-muted)] hover:text-[var(--accent-orange)]',
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        ].join(' ')}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      </button>
      {count > 0 && (
        onOpenModal ? (
          <button
            type="button"
            onClick={onOpenModal}
            title="Pamatyk kam patinka"
            className="font-['Outfit',sans-serif] text-[10.5px] font-extrabold tabular-nums text-[var(--text-muted)] transition-colors hover:text-[var(--accent-orange)]"
          >
            {count}
          </button>
        ) : (
          <span className="font-['Outfit',sans-serif] text-[10.5px] font-extrabold tabular-nums text-[var(--text-muted)]">
            {count}
          </span>
        )
      )}
    </span>
  )
}

function Avatar({ name, url, size = 28 }: { name: string; url?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false)
  if (url && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={proxyImg(url)}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full object-cover"
      />
    )
  }
  return <InitialBubble name={name} size={size} />
}

export default function EntityCommentsBlock({
  entityType, entityId, legacyEndpoint, compact = false, title = 'Diskusija',
}: Props) {
  const { data: session } = useSession()
  const [modern, setModern] = useState<ModernComment[] | null>(null)
  const [legacy, setLegacy] = useState<LegacyComment[] | null>(null)
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set())
  const [sort, setSort] = useState<'newest' | 'oldest' | 'popular'>('newest')
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [replyTo, setReplyTo] = useState<{ id: number; name: string; text: string } | null>(null)
  const [error, setError] = useState('')
  const [attached, setAttached] = useState<AttachmentHit[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [likersFor, setLikersFor] = useState<{ entityType: string; entityId: number; count: number } | null>(null)
  const [likersUsers, setLikersUsers] = useState<LikeUser[]>([])
  const draftRef = useRef<HTMLTextAreaElement | null>(null)

  const legacyUrl = legacyEndpoint || `/api/${entityType}s/${entityId}/comments`

  const reload = async () => {
    setError('')
    try {
      const [modernRes, legacyRes] = await Promise.all([
        fetch(`/api/comments?entity_type=${entityType}&entity_id=${entityId}&sort=newest&limit=200`),
        fetch(legacyUrl),
      ])
      const modernData = await modernRes.json()
      const legacyData = await legacyRes.json()
      const modernList: ModernComment[] = (modernData.comments || []).map((c: any) => ({ ...c, source: 'modern' as const }))
      const legacyList: LegacyComment[] = (legacyData.comments || legacyData || []).map((c: any) => ({ ...c, source: 'legacy' as const }))
      setModern(modernList)
      setLegacy(legacyList)
      // Likes set
      if (modernList.length > 0) {
        const ids = modernList.map(c => c.id).join(',')
        try {
          const lr = await fetch(`/api/comments/likes?ids=${ids}`)
          const ld = await lr.json()
          setLikedIds(new Set(ld.liked_ids || []))
        } catch { /* silent */ }
      }
    } catch {
      setModern([])
      setLegacy([])
    }
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId])

  // Fetch likers when modal opens
  useEffect(() => {
    if (!likersFor) { setLikersUsers([]); return }
    setLikersUsers([])
    fetch(`/api/likes/${likersFor.entityType}/${likersFor.entityId}`)
      .then(r => r.json())
      .then(d => setLikersUsers(d.users || []))
      .catch(() => setLikersUsers([]))
  }, [likersFor])

  // Merge + sort
  const sortedAll = useMemo(() => {
    const arr: AnyComment[] = [...(modern || []), ...(legacy || [])]
    arr.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0
      if (sort === 'oldest') return ta - tb
      if (sort === 'popular') return (b.like_count || 0) - (a.like_count || 0)
      return tb - ta
    })
    return arr
  }, [modern, legacy, sort])

  const totalCount = (modern?.length || 0) + (legacy?.length || 0)

  const submit = async () => {
    if (!session?.user?.id) {
      setError('Reikia prisijungti, kad galėtum komentuoti.')
      return
    }
    const rawText = draft.trim()
    if (!rawText && attached.length === 0) return
    // Naudojam tą patį "Author rašė:\nquote\n\nreply" wire format kaip
    // diskusijos modal'as — taip viename body field'e telpa ir citata, ir
    // atsakymas, o display logic'as parse'ina ir piešia orange quote box'ą.
    const finalText = replyTo && rawText
      ? `${replyTo.name} rašė:\n${replyTo.text.slice(0, 240)}\n\n${rawText}`
      : rawText
    setPosting(true)
    setError('')
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: entityType,
          entity_id: entityId,
          // parent_id: only set when replying to a modern comment with a
          // real FK id. Replies to legacy archived comments use parent_id=null
          // (we keep the quote prefix in body for visual continuity, but
          // can't FK-link to a legacy_id from the modern table).
          parent_id: replyTo?.id && replyTo.id > 0 ? replyTo.id : null,
          text: finalText,
          attachments: attached.length > 0 ? attached : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Klaida.')
        return
      }
      setDraft('')
      setReplyTo(null)
      setAttached([])
      reload()
    } catch {
      setError('Tinklo klaida.')
    } finally {
      setPosting(false)
    }
  }

  /** Soft-delete a comment via DELETE /api/comments. Available to admins
   *  AND to the comment's own author. Backend enforces auth. */
  const deleteComment = async (commentId: number) => {
    if (!confirm('Tikrai pašalinti šį komentarą?')) return
    try {
      const res = await fetch(`/api/comments?id=${commentId}`, { method: 'DELETE' })
      if (res.ok) {
        await reload()
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Nepavyko pašalinti.')
      }
    } catch {
      setError('Tinklo klaida.')
    }
  }

  const toggleLike = async (commentId: number) => {
    const prev = likedIds.has(commentId)
    const next = new Set(likedIds)
    if (prev) next.delete(commentId); else next.add(commentId)
    setLikedIds(next)
    setModern(curr => curr ? curr.map(c => c.id === commentId
      ? { ...c, like_count: Math.max(0, c.like_count + (prev ? -1 : 1)) }
      : c) : curr)
    try {
      const res = await fetch('/api/comments/likes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment_id: commentId }),
      })
      if (!res.ok) {
        // revert
        setLikedIds(likedIds)
      }
    } catch {
      setLikedIds(likedIds)
    }
  }

  const avatarSize = compact ? 26 : 32
  const fontSize = compact ? 12.5 : 13.5
  const headerSize = compact ? 13 : 15

  const SortChip = ({ k, label }: { k: 'newest' | 'oldest' | 'popular'; label: string }) => (
    <button
      type="button"
      onClick={() => setSort(k)}
      className={[
        "rounded-full px-2.5 py-1 font-['Outfit',sans-serif] text-[10.5px] font-extrabold transition-colors",
        sort === k
          ? 'bg-[var(--accent-orange)] text-white'
          : 'border border-[var(--border-subtle)] bg-transparent text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]',
      ].join(' ')}
    >
      {label}
    </button>
  )

  // Composer block — extracted, used as the FIRST element inside the section
  // so the user is invited to write before scrolling through existing posts.
  const Composer = (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
      {replyTo && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border border-[rgba(249,115,22,0.3)] bg-[rgba(249,115,22,0.08)] px-3 py-2">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="mt-0.5 shrink-0 text-[var(--accent-orange)]"><polyline points="9 14 4 9 9 4" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" /></svg>
          <div className="min-w-0 flex-1">
            <div className="font-['Outfit',sans-serif] text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-[var(--accent-orange)]">
              Atsakant: {replyTo.name}
            </div>
            <div className="mt-0.5 line-clamp-2 text-[11.5px] text-[var(--text-muted)]">
              {replyTo.text}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setReplyTo(null)}
            aria-label="Atšaukti atsakymą"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--text-faint)] transition-colors hover:text-[var(--text-primary)]"
          >
            <svg viewBox="0 0 16 16" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>
      )}
      {attached.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {attached.map((hit, i) => (
            <span
              key={`att-${hit.type}-${hit.id}-${i}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(249,115,22,0.3)] bg-[rgba(249,115,22,0.08)] py-1 pl-1 pr-2 text-[var(--text-primary)]"
            >
              <span className="h-5 w-5 shrink-0 overflow-hidden rounded-sm bg-[var(--cover-placeholder)]">
                {hit.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={proxyImg(hit.image_url)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                ) : null}
              </span>
              <span className="font-['Outfit',sans-serif] text-[11.5px] font-bold">{hit.title}</span>
              <button
                type="button"
                onClick={() => setAttached(a => a.filter((_, idx) => idx !== i))}
                aria-label="Pašalinti"
                className="flex h-4 w-4 items-center justify-center rounded-full text-[var(--text-faint)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <svg viewBox="0 0 16 16" width={9} height={9} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
                  <path d="M3 3l10 10M13 3L3 13" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}
      {/* Composer body — textarea full-width on top, action row below.
          Buttons sit on their own row underneath so the textarea can stay
          generously wide even on narrow modal columns. */}
      <textarea
        ref={draftRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={replyTo ? `Atsakyti @${replyTo.name}...` : 'Pasidalink mintimi...'}
        rows={compact ? 3 : 3}
        className="w-full resize-none rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[13.5px] leading-snug text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--accent-orange)]"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          aria-label="Pridėti muzikos"
          className={[
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-['Outfit',sans-serif] text-[11px] font-extrabold transition-colors",
            attached.length > 0
              ? 'border-[var(--accent-orange)] bg-[rgba(249,115,22,0.12)] text-[var(--accent-orange)]'
              : 'border-[var(--border-subtle)] bg-transparent text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]',
          ].join(' ')}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" /></svg>
          {attached.length > 0 ? `Pridėta (${attached.length})` : 'Pridėti muzikos'}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={(!draft.trim() && attached.length === 0) || posting || !session?.user?.id}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-orange)] px-4 py-1.5 font-['Outfit',sans-serif] text-[11.5px] font-extrabold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {posting ? 'Siunčiama…' : (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2z" /></svg>
              Siųsti
            </>
          )}
        </button>
      </div>
      {error && (
        <div className="mt-2 text-[11px] font-bold text-[#ef4444]">{error}</div>
      )}
      {!session?.user?.id && (
        <div className="mt-2 text-[11px] text-[var(--text-faint)]">
          <Link href="/auth/signin" className="font-bold text-[var(--accent-orange)] no-underline hover:underline">
            Prisijunk
          </Link>
          {' '}— ir parašyk komentarą.
        </div>
      )}
    </div>
  )

  return (
    <section className="flex flex-col gap-3">
      {/* Header — title + count + sort */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3
          className="font-['Outfit',sans-serif] font-black tracking-[-0.01em] text-[var(--text-primary)]"
          style={{ fontSize: headerSize }}
        >
          {title} {totalCount > 0 && (
            <span className="ml-1 font-bold text-[var(--text-faint)]">{totalCount}</span>
          )}
        </h3>
        <div className="flex items-center gap-1.5">
          <SortChip k="newest" label="Naujausi" />
          <SortChip k="oldest" label="Seniausi" />
          <SortChip k="popular" label="Populiariausi" />
        </div>
      </div>

      {/* Composer — TOP. Encourages writing before reading. */}
      {Composer}

      {/* List */}
      {modern === null || legacy === null ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 w-full animate-pulse rounded-lg bg-[var(--bg-elevated)]" />
          ))}
        </div>
      ) : sortedAll.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-default)] px-4 py-6 text-center">
          <div className="text-[12.5px] font-bold text-[var(--text-muted)]">Komentarų dar nėra</div>
          <div className="mt-1 text-[11px] text-[var(--text-faint)]">
            {session?.user?.id ? 'Būk pirmas — parašyk viršuje.' : 'Prisijunk ir būk pirmas.'}
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {sortedAll.map((c) => {
            const isModern = c.source === 'modern'
            const author = isModern
              ? (c.author_name || 'Vartotojas')
              : (c.author_username || 'Anonimas')
            const avatarUrl = isModern ? c.author_avatar : c.author_avatar_url
            const rel = relativeTime(c.created_at)
            const id = isModern ? c.id : c.legacy_id
            const liked = isModern ? likedIds.has(c.id) : false
            // Reply parsing — modern uses text-based "Author rašė:" prefix,
            // legacy uses scraped HTML <div class="quote1"> blocks. We try
            // BOTH paths so the orange quote box renders consistently
            // regardless of source.
            let quoteAuthor: string | null = null
            let quoteText: string | null = null
            let rest: string = ''
            if (isModern) {
              const parsed = parseReplyBody(c.body)
              quoteAuthor = parsed.quoteAuthor
              quoteText = parsed.quoteText
              rest = parsed.rest
            } else {
              // Try HTML parse first (most legacy comments have content_html)
              if (c.content_html) {
                const parsed = parseLegacyHtmlQuote(c.content_html)
                quoteAuthor = parsed.quoteAuthor
                quoteText = parsed.quoteText
                rest = parsed.rest
              } else {
                // Fallback: text-only with possible "Author rašė:" prefix
                const parsed = parseReplyBody(c.content_text || '')
                quoteAuthor = parsed.quoteAuthor
                quoteText = parsed.quoteText
                rest = parsed.rest
              }
            }
            return (
              <li
                key={`${c.source}-${id}`}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3"
              >
                <div className="flex items-start gap-2.5">
                  <Avatar name={author} url={avatarUrl} size={avatarSize} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span
                        className="font-['Outfit',sans-serif] font-extrabold text-[var(--text-secondary)]"
                        style={{ fontSize: fontSize - 1 }}
                      >
                        {author}
                      </span>
                      {rel && (
                        <span className="text-[10.5px] font-medium text-[var(--text-faint)]">{rel}</span>
                      )}
                    </div>
                    {/* Reply quote — orange left-border block, parent author
                        + collapsed quoted text. Matches diskusijos .quote1
                        styling from artist-profile-client. */}
                    {quoteAuthor && quoteText && (
                      <div className="mt-1.5 rounded border-l-[3px] border-[var(--accent-orange)] bg-[var(--bg-elevated)] px-2.5 py-1.5">
                        <div className="font-['Outfit',sans-serif] text-[10.5px] font-extrabold text-[var(--text-secondary)]">
                          {quoteAuthor} rašė:
                        </div>
                        <div className="mt-0.5 line-clamp-3 text-[11.5px] italic text-[var(--text-muted)]">
                          {quoteText}
                        </div>
                      </div>
                    )}
                    <div
                      className="mt-1 whitespace-pre-wrap break-words text-[var(--text-primary)]"
                      style={{ fontSize, lineHeight: 1.55 }}
                    >
                      {rest}
                    </div>
                    {/* Music attachments — chip strip su cover thumb +
                        title, click navigates į entity puslapį. */}
                    {Array.isArray(c.music_attachments) && c.music_attachments.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {c.music_attachments.slice(0, 8).map((a: any, i: number) => {
                          const href = a.type === 'grupe'
                            ? `/atlikejai/${a.slug}`
                            : a.type === 'albumas'
                              ? `/lt/albumas/${a.slug}/${a.id}/`
                              : `/dainos/${a.slug}-${a.id}`
                          return (
                            <Link
                              key={`${a.type}-${a.id}-${i}`}
                              href={href}
                              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] py-1 pl-1 pr-2.5 no-underline transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
                            >
                              <span className="h-5 w-5 shrink-0 overflow-hidden rounded-sm bg-[var(--cover-placeholder)]">
                                {a.image_url && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={proxyImg(a.image_url)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                                )}
                              </span>
                              <span className="font-['Outfit',sans-serif] text-[11.5px] font-bold text-[var(--text-primary)]">
                                {a.title}
                              </span>
                              {a.artist && a.type !== 'grupe' && (
                                <span className="text-[10px] text-[var(--text-muted)]">· {a.artist}</span>
                              )}
                            </Link>
                          )
                        })}
                      </div>
                    )}
                    {/* Footer — LikePill (heart toggle + count opens likers
                        modal) + reply button. Modern only — legacy users
                        can't be liked because we don't track those. */}
                    <div className="mt-2 flex items-center gap-2">
                      {isModern ? (
                        <CommentLike
                          count={c.like_count || 0}
                          liked={liked}
                          onToggle={() => toggleLike(c.id)}
                          onOpenModal={(c.like_count || 0) > 0
                            ? () => setLikersFor({ entityType: 'comment', entityId: c.id, count: c.like_count || 0 })
                            : undefined}
                          // Negali laikinti savo paties komentaro — vidinis
                          // konflikto interesų avoidance + tipiškas social
                          // platform pattern.
                          disabled={!!session?.user?.id && c.user_id === session.user.id}
                        />
                      ) : (
                        // Legacy comment — likes were imported from music.lt.
                        // Toggle disabled (no FK yet for modern user → legacy
                        // id likes), but count is clickable to see who liked.
                        c.like_count > 0 && (
                          <CommentLike
                            count={c.like_count}
                            liked={false}
                            onToggle={() => {/* TODO: extend likes table to support legacy_id */}}
                            onOpenModal={() => setLikersFor({ entityType: 'comment', entityId: c.legacy_id, count: c.like_count || 0 })}
                            disabled
                          />
                        )
                      )}
                      {/* Reply — works on BOTH modern and legacy. For
                          legacy we set parent_id=0 (no FK link), but the
                          quote prefix still renders properly via parseReplyBody.
                          That way users can engage with archived comments
                          the same way as with live ones. */}
                      <button
                        type="button"
                        onClick={() => {
                          setReplyTo({
                            id: isModern ? c.id : 0,
                            name: author,
                            text: rest.slice(0, 240),
                          })
                          requestAnimationFrame(() => draftRef.current?.focus())
                          requestAnimationFrame(() => draftRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
                        }}
                        className="inline-flex items-center gap-1 font-['Outfit',sans-serif] text-[11px] font-extrabold text-[var(--text-muted)] transition-colors hover:text-[var(--accent-orange)]"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="9 14 4 9 9 4" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" /></svg>
                        Atsakyti
                      </button>
                      {/* Trinti — rodom tik moderniam komentarui IR tik kai
                          vartotojas yra autorius arba admin. API DELETE
                          handler'is dar pats validuoja teises. Soft-delete
                          (is_deleted=true), istorija išlieka. */}
                      {isModern && session?.user?.id && (
                        c.user_id === session.user.id ||
                        (session.user as any).role === 'admin' ||
                        (session.user as any).role === 'super_admin'
                      ) && (
                        <button
                          type="button"
                          onClick={() => deleteComment(c.id)}
                          aria-label="Pašalinti komentarą"
                          title="Pašalinti komentarą"
                          className="ml-auto inline-flex items-center gap-1 font-['Outfit',sans-serif] text-[10.5px] font-extrabold text-[var(--text-faint)] transition-colors hover:text-[#ef4444]"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m-9 0v14a2 2 0 002 2h6a2 2 0 002-2V6" /></svg>
                          Pašalinti
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* Music attachment overlay modal — atskiras nuo composer'io taip,
          kad search results scrollas neperstumdytų teksto laukelio ar
          komentarų sąrašo. */}
      <MusicSearchModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        attached={attached}
        onAdd={(hit) => setAttached(a => [...a, hit])}
        onRemove={(idx) => setAttached(a => a.filter((_, i) => i !== idx))}
      />

      {/* Likers modal — kas patiko šį komentarą. */}
      <LikesModal
        open={!!likersFor}
        onClose={() => setLikersFor(null)}
        title="Patiko"
        count={likersFor?.count || 0}
        users={likersUsers}
      />
    </section>
  )
}
