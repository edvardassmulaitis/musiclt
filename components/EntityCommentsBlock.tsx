'use client'
// components/EntityCommentsBlock.tsx
//
// Unified comments component used across track page, track modal, album page,
// (eventually) artist surface. Combines:
//
//   1. Legacy entity_comments (read-only archive scraped iš music.lt)
//   2. Modern comments (user-editable, replies, likes, edit, delete)
//
// Both are fetched in parallel, merged by created_at, rendered into one list
// with a small "archyvas" badge on legacy items so the user understands where
// each comment comes from.
//
// Composer at the bottom posts modern comments (auth required). Per-comment
// like toggle works on modern only; legacy items show a read-only count.
// Replies are flat-threaded (parent_id) up to depth 4.
//
// Variants:
//   - default: standalone block (track page, album page)
//   - compact:  inside a side modal — tighter spacing, smaller avatars
//
// API:
//   - Modern: /api/comments  (GET / POST / PATCH / DELETE)
//   - Modern likes: /api/comments/likes  (GET / POST)
//   - Legacy: /api/{tracks|albums|artists}/[id]/comments  (GET only)
//
// NOTE: This component DOESN'T render music attachments yet — that's
// MusicSearchPicker integration (separate component). It's wired so adding
// it later means dropping the picker into the composer area.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import MusicSearchPicker, { AttachmentChips, type AttachmentHit } from './MusicSearchPicker'

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

const LT_MONTHS = ['sausio','vasario','kovo','balandžio','gegužės','birželio','liepos','rugpjūčio','rugsėjo','spalio','lapkričio','gruodžio']

function formatLtDate(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()} m. ${LT_MONTHS[d.getMonth()]} ${d.getDate()} d.`
}

function stripHtml(html?: string | null): string {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
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
  const [replyTo, setReplyTo] = useState<{ id: number; name: string } | null>(null)
  const [error, setError] = useState('')
  const [attached, setAttached] = useState<AttachmentHit[]>([])
  const [showPicker, setShowPicker] = useState(false)
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
    const text = draft.trim()
    if (!text && attached.length === 0) return
    setPosting(true)
    setError('')
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: entityType,
          entity_id: entityId,
          parent_id: replyTo?.id || null,
          text,
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
      setShowPicker(false)
      reload()
    } catch {
      setError('Tinklo klaida.')
    } finally {
      setPosting(false)
    }
  }

  const toggleLike = async (commentId: number) => {
    const prev = likedIds.has(commentId)
    const next = new Set(likedIds)
    if (prev) next.delete(commentId); else next.add(commentId)
    setLikedIds(next)
    setModern(curr => curr ? curr.map(c => c.id === commentId
      ? { ...c, like_count: c.like_count + (prev ? -1 : 1) }
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

  const avatarSize = compact ? 24 : 32
  const fontSize = compact ? 12 : 13
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
            {session?.user?.id ? 'Būk pirmas — parašyk apačioje.' : 'Prisijunk ir būk pirmas.'}
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
            const dateStr = formatLtDate(c.created_at)
            const text = isModern
              ? c.body
              : (c.content_text || stripHtml(c.content_html))
            const id = isModern ? c.id : c.legacy_id
            const liked = isModern ? likedIds.has(c.id) : false
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
                      {dateStr && (
                        <span className="text-[10.5px] font-medium tabular-nums text-[var(--text-faint)]">{dateStr}</span>
                      )}
                      {!isModern && (
                        <span
                          className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-0.5 font-['Outfit',sans-serif] text-[8.5px] font-extrabold uppercase tracking-wide text-[var(--text-faint)]"
                          title="Importuota iš senosios music.lt versijos"
                        >
                          archyvas
                        </span>
                      )}
                    </div>
                    <div
                      className="mt-1 whitespace-pre-wrap break-words text-[var(--text-primary)]"
                      style={{ fontSize, lineHeight: 1.55 }}
                    >
                      {text}
                    </div>
                    {/* Music attachments (modern + legacy abu palaiko) —
                        kortelinis chip strip'as su cover thumb + title +
                        type label. Click navigates į entity puslapį. */}
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
                    {/* Footer — likes + reply (modern only) */}
                    <div className="mt-2 flex items-center gap-3">
                      {isModern ? (
                        <button
                          type="button"
                          onClick={() => toggleLike(c.id)}
                          className={[
                            "inline-flex items-center gap-1 font-['Outfit',sans-serif] text-[10.5px] font-extrabold transition-colors",
                            liked ? 'text-[var(--accent-orange)]' : 'text-[var(--text-muted)] hover:text-[var(--accent-orange)]',
                          ].join(' ')}
                          aria-label={liked ? 'Atšaukti patiko' : 'Patinka'}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                          </svg>
                          {c.like_count}
                        </button>
                      ) : (
                        c.like_count > 0 && (
                          <span className="inline-flex items-center gap-1 font-['Outfit',sans-serif] text-[10.5px] font-extrabold text-[var(--accent-orange)]">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                            {c.like_count}
                          </span>
                        )
                      )}
                      {isModern && (
                        <button
                          type="button"
                          onClick={() => {
                            setReplyTo({ id: c.id, name: author })
                            requestAnimationFrame(() => draftRef.current?.focus())
                          }}
                          className="inline-flex items-center gap-1 font-['Outfit',sans-serif] text-[10.5px] font-extrabold text-[var(--text-muted)] transition-colors hover:text-[var(--accent-orange)]"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="9 14 4 9 9 4" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" /></svg>
                          Atsakyti
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

      {/* Composer */}
      <div className="mt-1">
        {replyTo && (
          <div className="mb-2 flex items-start gap-2 rounded-lg border border-[rgba(249,115,22,0.3)] bg-[rgba(249,115,22,0.06)] px-3 py-2">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="mt-0.5 shrink-0 text-[var(--accent-orange)]"><polyline points="9 14 4 9 9 4" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" /></svg>
            <div className="min-w-0 flex-1 font-['Outfit',sans-serif] text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-[var(--accent-orange)]">
              Atsakant: {replyTo.name}
            </div>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              aria-label="Atšaukti"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--text-faint)] hover:text-[var(--text-primary)]"
            >
              <svg viewBox="0 0 16 16" width={10} height={10} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M3 3l10 10M13 3L3 13" />
              </svg>
            </button>
          </div>
        )}
        {session?.user?.id ? (
          <>
            {/* Pridėtų music attachment chips strip — virš textarea */}
            {attached.length > 0 && (
              <div className="mb-2">
                <AttachmentChips
                  items={attached}
                  onRemove={(idx) => setAttached(a => a.filter((_, i) => i !== idx))}
                  compact={compact}
                />
              </div>
            )}
            {/* Toggle'inamas picker'is */}
            {showPicker && (
              <div className="mb-2">
                <MusicSearchPicker
                  attached={attached}
                  onAdd={(hit) => setAttached(a => [...a, hit])}
                  placeholder="Surask atlikėją, albumą ar dainą..."
                  compact={compact}
                />
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                ref={draftRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={replyTo ? `Atsakyti @${replyTo.name}...` : 'Rašyk komentarą...'}
                rows={compact ? 2 : 3}
                className="flex-1 resize-none rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-[13px] leading-snug text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--accent-orange)]"
              />
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => setShowPicker(v => !v)}
                  aria-label={showPicker ? 'Slėpti muzikos paiešką' : 'Pridėti muzikos'}
                  title={showPicker ? 'Slėpti' : 'Pridėti muzikos'}
                  className={[
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors',
                    showPicker
                      ? 'border-[var(--accent-orange)] bg-[rgba(249,115,22,0.12)] text-[var(--accent-orange)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]',
                  ].join(' ')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" /></svg>
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={(!draft.trim() && attached.length === 0) || posting}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-orange)] text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Siųsti"
                  title="Siųsti"
                >
                  {posting ? '⏳' : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2z" /></svg>
                  )}
                </button>
              </div>
            </div>
          </>
        ) : (
          <Link
            href="/auth/signin"
            className="block rounded-xl border border-dashed border-[var(--border-default)] px-4 py-3 text-center font-['Outfit',sans-serif] text-[12px] font-bold text-[var(--text-muted)] no-underline transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          >
            Prisijunk, kad galėtum komentuoti →
          </Link>
        )}
        {error && (
          <div className="mt-2 text-[11px] font-bold text-[#ef4444]">{error}</div>
        )}
      </div>
    </section>
  )
}
