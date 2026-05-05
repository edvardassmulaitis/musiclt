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
import CommentEditor, { type CommentEditorHandle } from './CommentEditor'
import { relativeTime } from '@/lib/relative-time'

type ModernComment = {
  id: number
  parent_id: number | null
  depth?: number
  user_id: string | null
  /** Server-computed flag — true if the viewer authored this comment.
   *  Robust against profile UUID drift (matches by author_id OR email). */
  is_own?: boolean
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
  entityType: 'track' | 'album' | 'artist' | 'discussion'
  entityId: number
  /** Optional — only needed if the legacy endpoint differs (currently same shape). */
  legacyEndpoint?: string
  /** Compact mode — modal use; tighter spacing. */
  compact?: boolean
  /** Title above the list. Defaults to "Diskusija". */
  title?: string
  /** Callback fires whenever the total (modern + legacy) count changes —
   *  parent uses this to render a count chip outside the block (e.g.,
   *  inside a tab label) without duplicating the fetch. */
  onCountChange?: (count: number) => void
}

function stripHtml(html?: string | null): string {
  return decodeEntities((html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
}

/** Detektuoja, ar body'is yra HTML formato (Tiptap output) ar plain tekstas
 *  (legacy / paprastas vartotojo įvedinys). HTML požymis: bent vienas valid'us
 *  block tag'as. Konzervatyviai — jei suabejojam, traktuojam kaip plain tekstą,
 *  kad legacy komentarai būtų rendr'inami su YT auto-detect. */
function looksLikeHtml(text: string): boolean {
  if (!text) return false
  return /<(p|div|br|strong|em|u|b|i|ul|ol|li|blockquote|iframe|a|h[1-6])\b[^>]*>/i.test(text)
}

/** Force rel="nofollow ugc noopener noreferrer" + target="_blank" on every <a> tag.
 *  Used before dangerouslySetInnerHTML so user-submitted comments — including legacy
 *  posts and ones written by future Tiptap versions — never become a SEO link-building
 *  vector. Idempotent: drops any existing rel/target attrs and rewrites them.
 *  External-only? No — we apply to all hrefs uniformly; safer + simpler. */
function tagLinksNofollow(html: string): string {
  if (!html) return html
  return html.replace(/<a\b([^>]*)>/gi, (full, attrs) => {
    let cleaned = String(attrs)
      .replace(/\s+rel="[^"]*"/gi, '')
      .replace(/\s+target="[^"]*"/gi, '')
    return `<a${cleaned} rel="nofollow ugc noopener noreferrer" target="_blank">`
  })
}

/** Extract YouTube video ID iš įvairių URL formų. */
const YT_PATTERNS = [
  /youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/i,
  /youtu\.be\/([A-Za-z0-9_-]{11})/i,
  /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/i,
  /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/i,
]

function extractYouTubeId(url: string): string | null {
  for (const re of YT_PATTERNS) {
    const m = url.match(re)
    if (m) return m[1]
  }
  return null
}

/** Iš body teksto extract'ina ir grąžina chunks: text + youtube embeds.
 *  Naudojama legacy forum komentarų rendering'e — music.lt seniau leido
 *  inline YT embed'us, mūsų DB'oje saugoma kaip plain URL teksto viduje. */
function splitBodyWithYouTube(body: string): Array<{ kind: 'text' | 'yt'; value: string }> {
  if (!body) return []
  // URL pattern — youtube/youtu.be ar shorts. Grąžinam tekstą + atskiri YT URL'ai.
  const urlRe = /https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^\s<>]+/gi
  const out: Array<{ kind: 'text' | 'yt'; value: string }> = []
  let lastIdx = 0
  let m: RegExpExecArray | null
  while ((m = urlRe.exec(body)) !== null) {
    const url = m[0]
    const ytId = extractYouTubeId(url)
    if (ytId) {
      // Tekstas iki URL
      if (m.index > lastIdx) {
        const before = body.slice(lastIdx, m.index)
        if (before) out.push({ kind: 'text', value: before })
      }
      out.push({ kind: 'yt', value: ytId })
      lastIdx = m.index + url.length
    }
  }
  if (lastIdx < body.length) {
    const tail = body.slice(lastIdx)
    if (tail) out.push({ kind: 'text', value: tail })
  }
  if (out.length === 0) return [{ kind: 'text', value: body }]
  return out
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

/** Compact like pill for comments — same shape as artist hero LikePill
 *  (border + divider between heart and count) but ~30% smaller. Heart
 *  toggles like; count opens likers modal when > 0. When count = 0, the
 *  count zone is hidden but the heart still toggles. */
function CommentLike({
  count, liked, onToggle, onOpenModal, disabled,
}: {
  count: number
  liked: boolean
  onToggle: () => void
  onOpenModal?: () => void
  disabled?: boolean
}) {
  const filled = liked
  const showCount = count > 0
  // Robust disabled handling: pointer-events-none on the wrapper guarantees
  // no click can reach the heart, even if React's disabled prop has
  // hydration drift. Plus we wrap onToggle to short-circuit defensively.
  const safeToggle = () => { if (!disabled) onToggle() }
  return (
    <span
      className={[
        'inline-flex overflow-hidden rounded-full border transition-colors',
        filled
          ? 'border-[var(--accent-orange)] bg-[var(--accent-orange)] text-white shadow-[0_2px_8px_rgba(249,115,22,0.3)]'
          : 'border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-primary)]',
        disabled ? 'opacity-50' : '',
      ].join(' ')}
      title={disabled ? 'Negalima palaikinti savo komentaro' : undefined}
    >
      <button
        type="button"
        onClick={safeToggle}
        disabled={disabled}
        aria-label={filled ? 'Atšaukti patinka' : 'Pažymėti patinka'}
        title={disabled ? 'Negalima palaikinti savo komentaro' : (filled ? 'Patinka' : 'Pažymėti patinka')}
        className={[
          'flex items-center justify-center px-2 py-1 transition-colors',
          disabled ? 'cursor-not-allowed pointer-events-none' : 'cursor-pointer',
          !filled && !disabled ? 'hover:bg-[var(--bg-hover)]' : '',
          filled && !disabled ? 'hover:opacity-90' : '',
        ].join(' ')}
      >
        <svg
          viewBox="0 0 24 24"
          width={11}
          height={11}
          fill={filled ? '#fff' : 'currentColor'}
          className={filled ? 'text-white' : 'text-[var(--accent-orange)]'}
        >
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      </button>
      {showCount && (
        onOpenModal ? (
          <button
            type="button"
            onClick={onOpenModal}
            title="Pamatyk kam patinka"
            className={[
              "flex items-center border-l px-2 py-1 font-['Outfit',sans-serif] text-[10.5px] font-extrabold tabular-nums tracking-wide transition-colors",
              filled ? 'border-white/30 hover:opacity-90' : 'border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]',
            ].join(' ')}
          >
            {count}
          </button>
        ) : (
          <span
            className={[
              "flex items-center border-l px-2 py-1 font-['Outfit',sans-serif] text-[10.5px] font-extrabold tabular-nums tracking-wide",
              filled ? 'border-white/30' : 'border-[var(--border-subtle)]',
            ].join(' ')}
          >
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
  entityType, entityId, legacyEndpoint, compact = false, title = 'Diskusija', onCountChange,
}: Props) {
  const { data: session, status: sessionStatus } = useSession()
  const [modern, setModern] = useState<ModernComment[] | null>(null)
  const [legacy, setLegacy] = useState<LegacyComment[] | null>(null)
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set())
  const [likedLegacyIds, setLikedLegacyIds] = useState<Set<number>>(new Set())
  const [sort, setSort] = useState<'newest' | 'oldest' | 'popular'>('newest')
  const [loadedPages, setLoadedPages] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  // Reply target for the MODAL ONLY. Earlier this was a single shared `replyTo`
  // used by both inline composer and modal — that caused the banner to leak
  // into the inline composer after a successful modal submit if any setter
  // raced (e.g. reload triggers re-render before state batch settled). We
  // now keep modal target physically isolated so the inline composer can't
  // even see it.
  // SINGLE source of truth for "user is replying to comment X via modal".
  // Modal is open <=> modalReplyTo !== null. No separate boolean — eliminates
  // the race that made the banner leak into the inline composer.
  const [modalReplyTo, setModalReplyTo] = useState<{ id: number; name: string; text: string } | null>(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [replyAttached, setReplyAttached] = useState<AttachmentHit[]>([])
  const [replyPickerOpen, setReplyPickerOpen] = useState(false)
  const [replyPosting, setReplyPosting] = useState(false)
  const [replyError, setReplyError] = useState('')
  const [error, setError] = useState('')
  const [attached, setAttached] = useState<AttachmentHit[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [likersFor, setLikersFor] = useState<{ entityType: string; entityId: number; count: number } | null>(null)
  const [likersUsers, setLikersUsers] = useState<LikeUser[]>([])
  // Toast state — short success banner shown for ~2.4s after a successful post.
  const [toast, setToast] = useState<{ kind: 'success' | 'info'; message: string } | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showToast = (message: string, kind: 'success' | 'info' = 'success') => {
    setToast({ kind, message })
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 2400)
  }
  // Editor refs — used to imperatively clear after successful submit
  // (prop-based clearing has a race vs Tiptap's onUpdate cycle).
  const editorRef = useRef<CommentEditorHandle | null>(null)
  const replyEditorRef = useRef<CommentEditorHandle | null>(null)
  const draftRef = useRef<HTMLTextAreaElement | null>(null)

  // Discussions yra unified — visi komentarai jau gyvena modern `comments`
  // lentelėj (per backfill_unify_forum.py). Legacy endpoint praleidžiamas.
  const skipLegacy = entityType === 'discussion'
  const legacyUrl = legacyEndpoint || (skipLegacy ? null : `/api/${entityType}s/${entityId}/comments`)
  // Diskusijos puslapis gali turėti tūkstančius komentarų — load'inam
  // 100 vienu metu kad UI nesulėtėtų. Track/album turi mažiau, fetch'inam
  // visus iš karto (200 limit).
  const PAGE_SIZE = entityType === 'discussion' ? 100 : 200

  const fetchPage = async (page: number, sortParam: string): Promise<ModernComment[]> => {
    const offset = page * PAGE_SIZE
    const r = await fetch(
      `/api/comments?entity_type=${entityType}&entity_id=${entityId}&sort=${sortParam}&limit=${PAGE_SIZE}&offset=${offset}`,
    )
    const d = await r.json()
    return (d.comments || []).map((c: any) => ({ ...c, source: 'modern' as const }))
  }

  const reload = async () => {
    setError('')
    setLoadedPages(1)
    try {
      const [firstPage, legacyRes] = await Promise.all([
        fetchPage(0, sort),
        legacyUrl ? fetch(legacyUrl) : Promise.resolve(null),
      ])
      const legacyData = legacyRes ? await legacyRes.json() : { comments: [] }
      const legacyList: LegacyComment[] = (legacyData.comments || legacyData || []).map((c: any) => ({ ...c, source: 'legacy' as const }))
      setModern(firstPage)
      setLegacy(legacyList)
      setHasMore(firstPage.length >= PAGE_SIZE)
      const modernList = firstPage
      // Likes set — both modern + legacy
      const ids = modernList.map(c => c.id).join(',')
      const lids = legacyList.map(c => c.legacy_id).join(',')
      if (ids || lids) {
        try {
          const lr = await fetch(`/api/comments/likes?ids=${ids}&legacy_ids=${lids}`)
          const ld = await lr.json()
          setLikedIds(new Set(ld.liked_ids || []))
          setLikedLegacyIds(new Set(ld.liked_legacy_ids || []))
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
  }, [entityType, entityId, sort])

  /** Load next page of modern comments — append to existing list. */
  const loadMore = async () => {
    const nextPage = loadedPages
    try {
      const more = await fetchPage(nextPage, sort)
      setModern(prev => [...(prev || []), ...more])
      setLoadedPages(prev => prev + 1)
      setHasMore(more.length >= PAGE_SIZE)
      // Atnaujinam likes set su naujais ID'ais
      const ids = more.map(c => c.id).join(',')
      if (ids) {
        try {
          const lr = await fetch(`/api/comments/likes?ids=${ids}`)
          const ld = await lr.json()
          setLikedIds(prev => {
            const next = new Set(prev)
            for (const id of ld.liked_ids || []) next.add(id)
            return next
          })
        } catch { /* silent */ }
      }
    } catch {
      /* silent */
    }
  }

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

  // Emit count changes — parent (mobile tab label) renders the chip.
  useEffect(() => { onCountChange?.(totalCount) }, [totalCount, onCountChange])

  /** ID lookup map — leidžia render'inti parent quote'ą bet kuriam comment'ui
   *  kuris turi parent_id (modern + legacy backfill'inti komentarai abu).
   *  Su 17k+ thread'ų rodyti reply chain'us iš text-prefix nepakanka, nes
   *  legacy backfill'as numeta originalų quote markup'ą — naudojam parent_id
   *  resolved per backfill_unify_forum stage_resolve_parents. */
  const modernById = useMemo(() => {
    const m = new Map<number, ModernComment>()
    for (const c of modern || []) m.set(c.id, c)
    return m
  }, [modern])

  const submit = async () => {
    if (!session?.user?.id) {
      setError('Reikia prisijungti, kad galėtum komentuoti.')
      return
    }
    const rawText = draft.trim()
    if (!rawText && attached.length === 0) return
    // Inline composer'is — tik nauji komentarai (be reply context). Replies
    // visada eina per modal'ą (žr. submitReply).
    const finalText = rawText
    setPosting(true)
    setError('')
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: entityType,
          entity_id: entityId,
          parent_id: null,
          text: finalText,
          attachments: attached.length > 0 ? attached : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Klaida.')
        return
      }
      editorRef.current?.clear()
      setDraft('')
      setAttached([])
      showToast('Komentaras pridėtas')
      reload()
    } catch {
      setError('Tinklo klaida.')
    } finally {
      setPosting(false)
    }
  }

  /** Modal'inis reply submit. Naudoja replyDraft + replyAttached + modalReplyTo.
   *  Sėkmės atveju setModalReplyTo(null) uždaro modal'ą (modal vis derive'as
   *  iš modalReplyTo egzistavimo), o tai pat clean'ina target. Vienas state
   *  šaltinis = jokios race sąlygos tarp replyTo / replyModalOpen. */
  const submitReply = async () => {
    if (!session?.user?.id) {
      setReplyError('Reikia prisijungti.')
      return
    }
    if (!modalReplyTo) {
      setReplyError('Nieko atsakyti.')
      return
    }
    const rawText = replyDraft.trim()
    if (!rawText && replyAttached.length === 0) {
      setReplyError('Įrašyk komentarą arba prikabink dainą.')
      return
    }
    const finalText = rawText
      ? `${modalReplyTo.name} rašė:\n${modalReplyTo.text.slice(0, 240)}\n\n${rawText}`
      : `${modalReplyTo.name} rašė:\n${modalReplyTo.text.slice(0, 240)}\n\n`
    setReplyPosting(true)
    setReplyError('')
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: entityType,
          entity_id: entityId,
          parent_id: modalReplyTo.id && modalReplyTo.id > 0 ? modalReplyTo.id : null,
          text: finalText,
          attachments: replyAttached.length > 0 ? replyAttached : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setReplyError(data.error || 'Klaida.')
        return
      }
      replyEditorRef.current?.clear()
      setModalReplyTo(null)
      setReplyDraft('')
      setReplyAttached([])
      showToast('Atsakymas išsiųstas')
      reload()
    } catch {
      setReplyError('Tinklo klaida.')
    } finally {
      setReplyPosting(false)
    }
  }

  /** Soft-delete a modern comment via DELETE /api/comments. Available to
   *  admins AND to the comment's own author. Backend enforces auth. */
  const deleteComment = async (commentId: number) => {
    if (!confirm('Tikrai paslėpti šį komentarą? Galima atstatyti vėliau.')) return
    try {
      const res = await fetch(`/api/comments?id=${commentId}`, { method: 'DELETE' })
      if (res.ok) {
        await reload()
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Nepavyko paslėpti.')
      }
    } catch {
      setError('Tinklo klaida.')
    }
  }

  /** Admin-only: restore a previously soft-deleted modern comment. Calls
   *  PUT /api/comments?action=restore&id=N. */
  const restoreComment = async (commentId: number) => {
    if (!confirm('Atstatyti šį pašalintą komentarą?')) return
    try {
      const res = await fetch(`/api/comments?action=restore&id=${commentId}`, { method: 'PUT' })
      if (res.ok) {
        await reload()
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Nepavyko atstatyti.')
      }
    } catch {
      setError('Tinklo klaida.')
    }
  }

  /** Admin-only: hide a LEGACY scraped comment. Sets is_hidden=true on
   *  entity_comments via DELETE /api/{type}s/{id}/comments?legacy_id=N. */
  const deleteLegacyComment = async (legacyId: number) => {
    if (!confirm('Tikrai paslėpti šį archyvinį komentarą? Veiksmas atstatomas tik per DB.')) return
    try {
      const res = await fetch(legacyUrl + `?legacy_id=${legacyId}`, { method: 'DELETE' })
      if (res.ok) {
        await reload()
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Nepavyko paslėpti.')
      }
    } catch {
      setError('Tinklo klaida.')
    }
  }

  /** Toggle a like on a LEGACY comment via the unified `likes` table. The
   *  count shown stays as imported_count + 1 (optimistic) — close enough
   *  for the user-facing display. */
  const toggleLikeLegacy = async (legacyId: number) => {
    const prev = likedLegacyIds.has(legacyId)
    const next = new Set(likedLegacyIds)
    if (prev) next.delete(legacyId); else next.add(legacyId)
    setLikedLegacyIds(next)
    setLegacy(curr => curr ? curr.map(c => c.legacy_id === legacyId
      ? { ...c, like_count: Math.max(0, c.like_count + (prev ? -1 : 1)) }
      : c) : curr)
    try {
      const res = await fetch('/api/comments/likes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ legacy_id: legacyId }),
      })
      if (!res.ok) {
        setLikedLegacyIds(likedLegacyIds)
      }
    } catch {
      setLikedLegacyIds(likedLegacyIds)
    }
  }

  const toggleLike = async (commentId: number) => {
    // Hard guard #1 — session must be fully resolved before optimistic UI.
    if (sessionStatus !== 'authenticated' || !session?.user?.id) return
    // Hard guard #2 — block self-likes using the SERVER-COMPUTED `is_own`
    // flag. UUID-only check was insufficient: after profile-wipe migrations
    // a comment's author_id rodė į seną UUID, o session.user.id buvo naujas,
    // todėl optimistic update prasislysdavo, server'is grąžindavo 200 (nes
    // jo userIdVal taip pat naujas — author_id ne tas pats kas resolved
    // viewer profile id), ir count'as nesirollback'indavo. Server'is dabar
    // serverio side'e atsako į: jei is_own === true, klientas net ne-issiunčia.
    const target = modern?.find(c => c.id === commentId)
    if (target?.is_own) {
      return
    }
    const prev = likedIds.has(commentId)
    const delta = prev ? -1 : 1
    const next = new Set(likedIds)
    if (prev) next.delete(commentId); else next.add(commentId)
    setLikedIds(next)
    setModern(curr => curr ? curr.map(c => c.id === commentId
      ? { ...c, like_count: Math.max(0, c.like_count + delta) }
      : c) : curr)
    try {
      const res = await fetch('/api/comments/likes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment_id: commentId }),
      })
      if (!res.ok) {
        // FULL rollback — both liked-set AND count. Earlier code only
        // restored the set, leaving the optimistic count change in place,
        // which made repeat clicks compound the count incorrectly.
        setLikedIds(likedIds)
        setModern(curr => curr ? curr.map(c => c.id === commentId
          ? { ...c, like_count: Math.max(0, c.like_count - delta) }
          : c) : curr)
      }
    } catch {
      setLikedIds(likedIds)
      setModern(curr => curr ? curr.map(c => c.id === commentId
        ? { ...c, like_count: Math.max(0, c.like_count - delta) }
        : c) : curr)
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
  // Inline composer'is yra TIK naujiems komentarams. Reply'ai eina per
  // dedikuotą modalą, tad jokio replyTo banner'io čia nereikia (anksčiau
  // toks egzistavo bet leak'indavosi po sėkmingo modal submit'o).
  const Composer = (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
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
      <CommentEditor
        ref={editorRef}
        value={draft}
        onChange={setDraft}
        placeholder='Tavo komentaras'
        onSubmit={submit}
        minHeight={compact ? 60 : 80}
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
      {/* Toast — fixed top-center notification, auto-hides after ~2.4s.
          Used for "Komentaras pridėtas" / "Atsakymas išsiųstas" success
          confirmations after submit. */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed left-1/2 top-6 z-[10001] -translate-x-1/2 animate-in fade-in slide-in-from-top-2"
        >
          <div
            className="flex items-center gap-2 rounded-full px-4 py-2 text-[12.5px] font-bold shadow-2xl"
            style={{
              background: toast.kind === 'success' ? 'rgba(34,197,94,0.15)' : 'var(--bg-elevated)',
              border: `1px solid ${toast.kind === 'success' ? 'rgba(34,197,94,0.45)' : 'var(--border-default)'}`,
              color: toast.kind === 'success' ? '#4ade80' : 'var(--text-primary)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {toast.message}
          </div>
        </div>
      )}

      {/* Header — title + count + sort. Compact (modal) → mažutė uppercase
          versija, kad atitiktų gretimą "Dainos tekstas" subhead'ą. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3
          className={compact
            ? "font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]"
            : "font-['Outfit',sans-serif] font-black tracking-[-0.01em] text-[var(--text-primary)]"
          }
          style={compact ? undefined : { fontSize: headerSize }}
        >
          {title}
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
            // Reply parsing — TRYS šaltiniai (priority order):
            //   1. parent_id linkavimas (rezultatas iš backfill_unify_forum
            //      stage_resolve_parents — naudojama legacy thread'uose kuriuose
            //      reply chain išsaugotas tik per parent_username/parent_body_excerpt)
            //   2. Body-prefix "Author rašė:" (modern composer'is + senas legacy
            //      formatas)
            //   3. HTML <div class="quote1"> blokai (kai kuriuose legacy posts)
            let quoteAuthor: string | null = null
            let quoteText: string | null = null
            let rest: string = ''
            // Path 1 — parent_id lookup (works for both modern + migrated legacy)
            if (isModern && c.parent_id != null) {
              const parent = modernById.get(c.parent_id)
              if (parent) {
                quoteAuthor = parent.author_name || 'Vartotojas'
                // Strip HTML tags from parent body for clean quote display
                const parentBody = parent.body || ''
                quoteText = parentBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240)
                rest = c.body
              }
            }
            // Path 2/3 — fallback į text/HTML parsing
            if (quoteAuthor == null) {
              if (isModern) {
                const parsed = parseReplyBody(c.body)
                quoteAuthor = parsed.quoteAuthor
                quoteText = parsed.quoteText
                rest = parsed.rest
              } else {
                if (c.content_html) {
                  const parsed = parseLegacyHtmlQuote(c.content_html)
                  quoteAuthor = parsed.quoteAuthor
                  quoteText = parsed.quoteText
                  rest = parsed.rest
                } else {
                  const parsed = parseReplyBody(c.content_text || '')
                  quoteAuthor = parsed.quoteAuthor
                  quoteText = parsed.quoteText
                  rest = parsed.rest
                }
              }
            }
            // Deleted komentarai matomi tik admin'ams (server filter'ina
            // ne-admin'us visiškai). Vizualiai — dim'inti, pridedam diagonal
            // ribbon-stiliaus žymą, kad nesimaišytų su normalia diskusija.
            const isDeleted = isModern && (c as any).is_deleted
            return (
              <li
                key={`${c.source}-${id}`}
                className={[
                  'rounded-xl border p-3 transition-opacity',
                  isDeleted
                    ? 'border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)] opacity-55'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]',
                ].join(' ')}
                title={isDeleted ? 'Komentaras pašalintas — matomas tik administratoriams' : undefined}
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
                    {/* Body render'is — du keliai:
                        1) HTML komentaras (Tiptap output) — render via dangerouslySetInnerHTML
                           su prose-like dark stiliais. Iframe'us, formatavimą laiko.
                        2) Plain text (legacy) — splitBodyWithYouTube atpažįsta YT URL'us
                           ir konvertuoja į embed'us, likusius kaip span. */}
                    {looksLikeHtml(rest) ? (
                      <div
                        className="comment-html-body mt-1 break-words text-[var(--text-primary)]"
                        style={{ fontSize, lineHeight: 1.55 }}
                        dangerouslySetInnerHTML={{ __html: tagLinksNofollow(rest) }}
                      />
                    ) : (
                      <div
                        className="mt-1 whitespace-pre-wrap break-words text-[var(--text-primary)]"
                        style={{ fontSize, lineHeight: 1.55 }}
                      >
                        {splitBodyWithYouTube(rest).map((chunk, idx) => {
                          if (chunk.kind === 'yt') {
                            return (
                              <div key={`yt-${idx}`} className="my-2 overflow-hidden rounded-md" style={{ aspectRatio: '16/9', maxWidth: 560 }}>
                                <iframe
                                  src={`https://www.youtube.com/embed/${chunk.value}`}
                                  title="YouTube video"
                                  style={{ width: '100%', height: '100%', border: 0 }}
                                  loading="lazy"
                                  allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                  allowFullScreen
                                />
                              </div>
                            )
                          }
                          return <span key={`t-${idx}`}>{chunk.value}</span>
                        })}
                      </div>
                    )}
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
                              target="_blank"
                              rel="noopener"
                              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] py-1 pl-1 pr-2 no-underline transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
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
                              {/* External-link icon — signal to user that
                                  click opens in new window. */}
                              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="ml-0.5 shrink-0 text-[var(--text-faint)]">
                                <path d="M14 3h7v7M21 3l-9 9M5 5h6M5 5v14h14v-6" />
                              </svg>
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
                          // Self-like — server'is paskaičiuoja `is_own` flag'ą
                          // (matches by author_id OR email), tai naudojam jį
                          // robust'iškai. Plus, ant ištrintų komentarų
                          // (admin'ų matomi) — disabled (nėra ką laikinti).
                          disabled={!!c.is_own || !!(c as any).is_deleted}
                        />
                      ) : (
                        // Legacy komentaras — toggle eina per unified `likes`
                        // lentelę (entity_type='comment', entity_id=legacy_id).
                        // Count = imported_from_scrape + 1 (current user's
                        // optimistic toggle). Visada rodom širdį, net kai 0.
                        <CommentLike
                          count={c.like_count || 0}
                          liked={likedLegacyIds.has(c.legacy_id)}
                          onToggle={() => toggleLikeLegacy(c.legacy_id)}
                          onOpenModal={(c.like_count || 0) > 0
                            ? () => setLikersFor({ entityType: 'comment', entityId: c.legacy_id, count: c.like_count || 0 })
                            : undefined}
                        />
                      )}
                      {/* Reply — works on BOTH modern and legacy. For
                          legacy we set parent_id=0 (no FK link), but the
                          quote prefix still renders properly via parseReplyBody.
                          That way users can engage with archived comments
                          the same way as with live ones. */}
                      {!isDeleted && (
                        <button
                          type="button"
                          onClick={() => {
                            // Setting modalReplyTo OPENS the modal (modal renders
                            // when modalReplyTo !== null). Single state mutation
                            // = nothing to leak into the inline composer.
                            setReplyDraft('')
                            setReplyAttached([])
                            setReplyError('')
                            setModalReplyTo({
                              id: isModern ? c.id : 0,
                              name: author,
                              text: rest.slice(0, 240),
                            })
                          }}
                          className="inline-flex items-center gap-1 font-['Outfit',sans-serif] text-[11px] font-extrabold text-[var(--text-muted)] transition-colors hover:text-[var(--accent-orange)]"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="9 14 4 9 9 4" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" /></svg>
                          Atsakyti
                        </button>
                      )}
                      {isDeleted && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-0.5 font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">
                          Paslėpta
                        </span>
                      )}
                      {/* Admin reactivate — flip is_deleted=false, komentaras
                          vėl matomas public'ui. Rodom tik admin'ams ir tik
                          ant pašalintų. */}
                      {isDeleted && isModern && (() => {
                        const role = (session?.user as any)?.role
                        const isAdminUser = role === 'admin' || role === 'super_admin'
                        if (!isAdminUser) return null
                        return (
                          <button
                            type="button"
                            onClick={() => restoreComment(c.id)}
                            aria-label="Atstatyti komentarą"
                            title="Atstatyti komentarą (admin)"
                            className="inline-flex items-center gap-1 rounded-full border border-[var(--accent-orange)]/40 bg-[var(--accent-orange)]/10 px-2 py-0.5 font-['Outfit',sans-serif] text-[10.5px] font-extrabold text-[var(--accent-orange)] transition-colors hover:bg-[var(--accent-orange)]/20"
                          >
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                              <path d="M3 3v5h5" />
                            </svg>
                            Atstatyti
                          </button>
                        )
                      })()}
                      {/* Trinti — rodom kai (a) modern komentaras + savininkas
                          (b) bet kuris admin/super_admin (modern arba legacy
                          — admin gali "paslėpti" abu via API). Mygtukas
                          stilius: aiški raudona ikona dešinėje pusėje. */}
                      {(() => {
                        const role = (session?.user as any)?.role
                        const isAdminUser = role === 'admin' || role === 'super_admin'
                        const isOwn = isModern && (c as any).is_own
                        // Pašalinti — kai useris ir taip jau matą "ištrintą" komentarą
                        // (tik admin'ai), be reikalo dar kartą trint nereikia.
                        const cIsDeleted = isModern && (c as any).is_deleted
                        const canDelete = (isAdminUser || isOwn) && !cIsDeleted
                        if (!canDelete) return null
                        // Modern: DELETE /api/comments?id=...
                        // Legacy: only admin can hide; soft-flag is_hidden=true
                        const onClick = () => {
                          if (isModern) deleteComment(c.id)
                          else deleteLegacyComment(c.legacy_id)
                        }
                        // Vienodas label'as visur — "Slėpti". Tiek modern
                        // (soft-delete is_deleted=true), tiek legacy (is_hidden=
                        // true) iš esmės yra hide operacija; veiksmas atstatomas
                        // (admin'as turi Atstatyti mygtuką ant ištrintų).
                        const label = 'Slėpti'
                        return (
                          <button
                            type="button"
                            onClick={onClick}
                            aria-label={label}
                            title={isAdminUser ? `${label} (admin)` : label}
                            className="ml-auto inline-flex items-center gap-1 rounded-full border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.08)] px-2 py-0.5 font-['Outfit',sans-serif] text-[10.5px] font-extrabold text-[#ef4444] transition-colors hover:border-[#ef4444] hover:bg-[rgba(239,68,68,0.16)]"
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m-9 0v14a2 2 0 002 2h6a2 2 0 002-2V6" /></svg>
                            {label}
                          </button>
                        )
                      })()}
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {hasMore && sortedAll.length > 0 && (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            className="rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] px-4 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            Daugiau komentarų
          </button>
        </div>
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

      {/* Reply modal — atsakant į komentarą, useris nepamesta scroll pozicijos.
          Modal rodo parent quote + composer + send. Ctrl+Enter siunčia.
          Modal'as render'inamas tik kai modalReplyTo nėra null. Vienas state
          šaltinis = nereikia atskiro replyModalOpen boolean'o. */}
      {modalReplyTo && (
        <div
          className="fixed inset-0 z-[9999] flex items-end justify-center sm:items-center"
          style={{ background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(8px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setModalReplyTo(null) }}
        >
          <div
            className="w-full max-w-3xl overflow-hidden rounded-t-2xl sm:rounded-2xl shadow-2xl"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              opacity: 1,
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="9 14 4 9 9 4" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" /></svg>
                Atsakyti į {modalReplyTo.name}
              </div>
              <button
                type="button"
                onClick={() => setModalReplyTo(null)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                aria-label="Uždaryti"
              >
                ✕
              </button>
            </div>

            {/* Parent quote */}
            <div className="px-4 pt-3">
              <div className="rounded-lg border-l-[3px] border-[var(--accent-orange)] bg-[var(--bg-elevated)] px-3 py-2">
                <div className="font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                  {modalReplyTo.name} rašė:
                </div>
                <div className="mt-1 line-clamp-4 text-[12px] italic text-[var(--text-muted)]">
                  {modalReplyTo.text}
                </div>
              </div>
            </div>

            {/* Composer */}
            <div className="px-4 py-3">
              <CommentEditor
                ref={replyEditorRef}
                value={replyDraft}
                onChange={setReplyDraft}
                placeholder="Tavo atsakymas…"
                onSubmit={() => { if (!replyPosting) submitReply() }}
                autoFocus
                minHeight={100}
              />

              {/* Music attachments preview */}
              {replyAttached.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {replyAttached.map((a, i) => (
                    <div
                      key={`${a.type}-${a.id}-${i}`}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-[11px]"
                    >
                      <span className="text-[var(--accent-orange)]">♪</span>
                      <span className="text-[var(--text-primary)]">{a.title}</span>
                      <button
                        type="button"
                        onClick={() => setReplyAttached((prev) => prev.filter((_, idx) => idx !== i))}
                        className="ml-1 text-[var(--text-faint)] hover:text-[var(--text-primary)]"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {replyError && (
                <div className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] text-red-400">
                  {replyError}
                </div>
              )}

              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setReplyPickerOpen(true)}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[11px] font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                >
                  ♪ Pridėti dainos
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[var(--text-faint)]">⌘+Enter siųsti</span>
                  <button
                    type="button"
                    onClick={submitReply}
                    disabled={replyPosting || (!replyDraft.trim() && replyAttached.length === 0)}
                    className="rounded-full bg-[var(--accent-orange)] px-4 py-1.5 text-[12px] font-bold text-white shadow-md transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    {replyPosting ? 'Siunčia…' : 'Siųsti'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Music picker modal — atskirai nuo reply modal'o (z-index aukščiau) */}
          <MusicSearchModal
            open={replyPickerOpen}
            onClose={() => setReplyPickerOpen(false)}
            attached={replyAttached}
            onAdd={(hit) => setReplyAttached((a) => [...a, hit])}
            onRemove={(idx) => setReplyAttached((a) => a.filter((_, i) => i !== idx))}
          />
        </div>
      )}
    </section>
  )
}
