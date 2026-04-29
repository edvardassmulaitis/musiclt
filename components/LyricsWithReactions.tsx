'use client'
// components/LyricsWithReactions.tsx
//
// Renders track lyrics line-by-line as a flex grid: left column is the
// (selectable) lyric text, right column is a strip of reaction chips for
// any reactions whose start position falls on that line. The chips never
// overlap the text — they sit in the right gutter, sized to fit the line.
//
// Selection on desktop (and modern mobile browsers) still works across
// multiple lines because we use plain inline spans/divs, not buttons —
// long-press + drag in iOS / Android / desktop produces a normal
// `window.getSelection()` range, which we pick up on mouseup/touchend.
//
// Tooltip groups reactions by user — so one user with both a ♥ like and a
// 💬 comment on the same span appears as ONE row.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { proxyImg } from '@/lib/img-proxy'

type Reaction = {
  id: number
  selection_start: number
  selection_end: number
  selected_text: string
  type: 'like' | 'comment'
  text: string
  likes: number
  created_at?: string
  author_name?: string | null
  author_avatar_url?: string | null
  author_initial?: string | null
  /** Server-computed flag — true if viewer authored this reaction. Used
   *  by client to toggle vs add when user clicks the heart in tooltip. */
  is_own?: boolean
}

type Props = {
  trackId: number
  lyrics: string
  /** Compact spacing for modal use. */
  compact?: boolean
}

type Span = { start: number; end: number; reactions: Reaction[] }

/** Group reactions into spans by exact (start,end). */
function buildSpans(reactions: Reaction[]): Span[] {
  const map = new Map<string, Span>()
  for (const r of reactions) {
    const k = `${r.selection_start}-${r.selection_end}`
    const existing = map.get(k)
    if (existing) existing.reactions.push(r)
    else map.set(k, { start: r.selection_start, end: r.selection_end, reactions: [r] })
  }
  return [...map.values()].sort((a, b) => a.start - b.start)
}

/** Group a span's reactions by the user who made them. Same user with both
 *  a ♥ and a 💬 collapses to one entry — keep ALL underlying reaction ids
 *  so admin/owner can delete each one separately. Anonymous reactions
 *  can't merge reliably (no stable identifier), so each anon row stays
 *  separate keyed by id. */
type GroupedReaction = {
  key: string
  authorName: string
  authorAvatarUrl: string | null
  hasLike: boolean
  /** Each comment kept paired with its reaction id so we can render a
   *  delete button per individual reaction within the merged row. */
  comments: { id: number; text: string }[]
  /** id of the user's like reaction (if any) — needed for admin delete. */
  likeReactionId: number | null
  /** True if viewer authored ANY reaction in this group. */
  isOwn: boolean
}
function groupByAuthor(reactions: Reaction[]): GroupedReaction[] {
  const map = new Map<string, GroupedReaction>()
  for (const r of reactions) {
    const name = r.author_name || 'Anonimas'
    const isAnon = !r.author_avatar_url && (name === 'Anonimas' || name === 'Vartotojas')
    const key = isAnon ? `anon-${r.id}` : `named-${name}`
    const cur = map.get(key) || {
      key,
      authorName: name,
      authorAvatarUrl: r.author_avatar_url || null,
      hasLike: false,
      comments: [],
      likeReactionId: null,
      isOwn: false,
    }
    if (r.type === 'like') {
      cur.hasLike = true
      cur.likeReactionId = r.id
    }
    if (r.type === 'comment' && r.text) cur.comments.push({ id: r.id, text: r.text })
    if (r.is_own) cur.isOwn = true
    map.set(key, cur)
  }
  return [...map.values()]
}

/** Mini avatar — image if available, otherwise hue'd initial bubble. */
function MiniAvatar({ name, url, size = 18 }: { name: string; url?: string | null; size?: number }) {
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
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?'
  let h = 0
  for (let i = 0; i < name.length; i++) { h = ((h << 5) - h) + name.charCodeAt(i); h |= 0 }
  const hue = Math.abs(h) % 360
  return (
    <div
      style={{ width: size, height: size, background: `hsl(${hue}, 50%, 30%)` }}
      className="flex shrink-0 items-center justify-center rounded-full font-['Outfit',sans-serif] font-extrabold text-white"
    >
      <span style={{ fontSize: Math.max(8, Math.floor(size * 0.5)) }}>{initial}</span>
    </div>
  )
}

export default function LyricsWithReactions({ trackId, lyrics, compact = false }: Props) {
  const { data: session } = useSession()
  const isAdmin = (session?.user as any)?.role === 'admin' || (session?.user as any)?.role === 'super_admin'
  const [reactions, setReactions] = useState<Reaction[]>([])
  const [panel, setPanel] = useState<{ text: string; start: number; end: number; rect?: DOMRect } | null>(null)
  const [draft, setDraft] = useState('')
  const [likedThis, setLikedThis] = useState(false)
  const [showComment, setShowComment] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tooltip, setTooltip] = useState<{ span: Span; rect: DOMRect } | null>(null)
  const lyricsRef = useRef<HTMLDivElement | null>(null)
  const wasChipClick = useRef(false)

  // Initial fetch
  useEffect(() => {
    fetch(`/api/tracks/${trackId}/lyric-comments`)
      .then(r => r.json())
      .then((d: Reaction[]) => { if (Array.isArray(d)) setReactions(d) })
      .catch(() => {})
  }, [trackId])

  const spans = useMemo(() => buildSpans(reactions), [reactions])

  /** Build a map: line index → spans whose START falls on that line. We
   *  attach the chip strip to the line containing the span's start. */
  const lines = useMemo(() => {
    // Two filter functions per line:
    //   - highlightSpans: any span that OVERLAPS this line (start<=lineEnd
    //     AND end>=lineStart). Used to render the orange <mark> highlight.
    //     For multi-line selections this means the highlight spans every
    //     line of the selection, not just the first.
    //   - chipSpans: only spans that START on this line. Chip strip on
    //     right gutter renders once, on the line where the reaction begins.
    const out: Array<{ text: string; highlightSpans: Span[]; chipSpans: Span[] }> = []
    const rawLines = lyrics.split('\n')
    let charPos = 0
    for (const text of rawLines) {
      const lineStart = charPos
      const lineEnd = charPos + text.length
      const highlightSpans = spans.filter(s => s.start <= lineEnd && s.end >= lineStart)
      const chipSpans = spans.filter(s => s.start >= lineStart && s.start < lineEnd + 1)
      out.push({ text, highlightSpans, chipSpans })
      charPos = lineEnd + 1
    }
    return out
  }, [lyrics, spans])

  const onMouseUp = useCallback(() => {
    if (wasChipClick.current) { wasChipClick.current = false; return }
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) return
    const text = sel.toString().trim()
    if (text.length < 3) return

    // Find selection start/end positions in source `lyrics`. Direct
    // indexOf works for single-line selections, but BREAKS for cross-line
    // selections because selection.toString() inserts extra `\n` separators
    // between block elements (each line is a separate <div>) that don't
    // match the source's single `\n`s. Fallback: locate by first + last
    // line fragments.
    let start = lyrics.indexOf(text)
    let end = start !== -1 ? start + text.length : -1

    if (start === -1) {
      const lines = text.split('\n').map(s => s.trim()).filter(Boolean)
      if (lines.length >= 1) {
        const firstLine = lines[0]
        const lastLine = lines[lines.length - 1]
        const s = lyrics.indexOf(firstLine)
        if (s !== -1) {
          const e = lyrics.indexOf(lastLine, s + firstLine.length - 1)
          if (e !== -1) {
            start = s
            end = e + lastLine.length
          } else if (lines.length === 1) {
            start = s
            end = s + firstLine.length
          }
        }
      }
    }

    if (start === -1 || end === -1 || end <= start) return

    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    sel.removeAllRanges()
    setPanel({ text: lyrics.slice(start, end), start, end, rect })
    setDraft('')
    setLikedThis(false)
    setShowComment(false)
    setTooltip(null)
  }, [lyrics])

  const closePanel = () => {
    setPanel(null)
    setDraft('')
    setLikedThis(false)
    setShowComment(false)
  }

  const reload = async () => {
    try {
      const res = await fetch(`/api/tracks/${trackId}/lyric-comments`)
      const data: Reaction[] = await res.json()
      if (Array.isArray(data)) setReactions(data)
    } catch { /* silent */ }
  }

  const submitLike = async () => {
    if (!panel || saving || likedThis) return
    const p = { ...panel }
    setSaving(true)
    setLikedThis(true)
    try {
      await fetch(`/api/tracks/${trackId}/lyric-comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected_text: p.text, selection_start: p.start, selection_end: p.end, type: 'like', text: '' }),
      })
      await reload()
    } catch { /* silent */ }
    finally { setSaving(false) }
  }

  const submitComment = async () => {
    if (!panel || saving || !draft.trim()) return
    const p = { ...panel }
    const text = draft.trim()
    setSaving(true)
    closePanel()
    try {
      await fetch(`/api/tracks/${trackId}/lyric-comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected_text: p.text, selection_start: p.start, selection_end: p.end, type: 'comment', text }),
      })
      await reload()
    } catch { /* silent */ }
    finally { setSaving(false) }
  }

  /** Admin-only: delete a single reaction by id. Closes tooltip + reloads. */
  const deleteReaction = async (reactionId: number) => {
    if (!confirm('Tikrai pašalinti šią reakciją?')) return
    try {
      await fetch(`/api/tracks/${trackId}/lyric-comments?reaction_id=${reactionId}`, { method: 'DELETE' })
      setTooltip(null)
      await reload()
    } catch { /* silent */ }
  }

  /** Toggle viewer's own like on this span:
   *   - If they already have a like → DELETE it (unlike)
   *   - If not → POST a new like
   *  This is what makes the heart in the tooltip behave like a real toggle
   *  instead of stacking duplicate likes on every click (was the user-
   *  reported "unlike still adds another like" bug). */
  const quickLike = async (s: Span) => {
    setSaving(true)
    try {
      const myLike = s.reactions.find(r => r.is_own && r.type === 'like')
      if (myLike) {
        await fetch(`/api/tracks/${trackId}/lyric-comments?reaction_id=${myLike.id}`, { method: 'DELETE' })
      } else {
        await fetch(`/api/tracks/${trackId}/lyric-comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            selected_text: s.reactions[0].selected_text,
            selection_start: s.start,
            selection_end: s.end,
            type: 'like',
            text: '',
          }),
        })
      }
      await reload()
    } catch { /* silent */ }
    finally { setSaving(false); setTooltip(null) }
  }

  /** Click a reaction chip — opens the details tooltip. */
  const onClickChip = (s: Span, ev: React.MouseEvent<HTMLElement>) => {
    wasChipClick.current = true
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect()
    setPanel(null)
    setTooltip({ span: s, rect })
  }

  const fontSize = compact ? 13 : 15
  const lineHeight = compact ? 1.7 : 1.85

  return (
    <div className="relative">
      <div
        ref={lyricsRef}
        onMouseUp={onMouseUp}
        onTouchEnd={onMouseUp}
        className="flex flex-col text-[var(--text-primary)]"
        style={{ fontSize, fontFamily: "'DM_Sans',system-ui,sans-serif", userSelect: 'text' }}
      >
        {lines.map((ln, i) => {
          const isEmpty = ln.text.trim().length === 0
          if (isEmpty) {
            return <div key={i} style={{ height: `${lineHeight}em` }} />
          }
          const reactionCount = ln.chipSpans.reduce((n, s) => n + s.reactions.length, 0)
          // Highlight the line softly when ANY reaction overlaps it.
          const hasReactions = ln.highlightSpans.length > 0
          return (
            <div
              key={i}
              className={[
                'flex items-start gap-2 rounded',
                hasReactions ? 'bg-[rgba(249,115,22,0.06)] px-1' : '',
              ].join(' ')}
              style={{ lineHeight }}
            >
              {/* Lyric text — highlighted spans rendered inline as <mark>.
                  We use highlightSpans (any overlap) so multi-line selection
                  paints every line of the selection, not only the first. */}
              <span className="min-w-0 flex-1 break-words" style={{ whiteSpace: 'pre-wrap' }}>
                {renderInlineHighlights(ln.text, ln.highlightSpans, lineStartOf(lines, i))}
              </span>
              {/* Right-gutter chip strip — only on the line where the
                  reaction span STARTS, so chips don't duplicate per line. */}
              {ln.chipSpans.length > 0 && (
                <span className="flex shrink-0 items-center gap-1 self-center pt-[2px]">
                  {ln.chipSpans.map((s) => {
                    const likes = s.reactions.filter(r => r.type === 'like').length
                    const comments = s.reactions.filter(r => r.type === 'comment').length
                    // Show avatar stack — DEDUP'inta pagal autorių, kad
                    // tas pats useris su like+comment nesirodydavo dviem
                    // avatariais (anksčiau buvo bug). Anonim'ai grupuojami
                    // pagal reaction id (jų atskirti negalim be stable id).
                    const seen = new Set<string>()
                    const uniqueReactors: typeof s.reactions = []
                    for (const r of s.reactions) {
                      const name = (r.author_name || '').trim()
                      const isAnon = !r.author_avatar_url && (name === 'Anonimas' || name === 'Vartotojas' || name === '')
                      const key = isAnon ? `anon-${r.id}` : `named-${name}`
                      if (seen.has(key)) continue
                      seen.add(key)
                      uniqueReactors.push(r)
                    }
                    const recent = uniqueReactors.length <= 5 ? uniqueReactors.slice(0, 3) : []
                    return (
                      <button
                        key={`${s.start}-${s.end}`}
                        type="button"
                        onClick={(e) => onClickChip(s, e)}
                        className="inline-flex items-center gap-1 rounded-full border border-[rgba(249,115,22,0.4)] bg-[var(--bg-surface)] px-1.5 py-0.5 font-['Outfit',sans-serif] text-[9.5px] font-extrabold text-[var(--accent-orange)] transition-colors hover:bg-[rgba(249,115,22,0.12)]"
                        title={`${likes} patiko, ${comments} komentarai`}
                      >
                        {likes > 0 && (
                          <span className="inline-flex items-center gap-0.5">
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                            {likes}
                          </span>
                        )}
                        {comments > 0 && (
                          <span className="inline-flex items-center gap-0.5">
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" /></svg>
                            {comments}
                          </span>
                        )}
                        <span className="inline-flex -space-x-0.5">
                          {recent.map((r) => (
                            <span key={r.id} className="rounded-full ring-1 ring-[var(--bg-surface)]">
                              <MiniAvatar name={r.author_name || 'Vartotojas'} url={r.author_avatar_url} size={12} />
                            </span>
                          ))}
                        </span>
                      </button>
                    )
                  })}
                  {/* Reuse reactionCount so it doesn't get optimised out */}
                  <span className="sr-only">{reactionCount}</span>
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Selection popover — patinka (1-tap) + opcionalus komentaras. */}
      {panel && panel.rect && (
        <FloatingPopover
          rect={panel.rect}
          onClose={closePanel}
          width={290}
        >
          <div className="flex flex-col gap-2">
            <div className="max-h-[120px] overflow-y-auto whitespace-pre-wrap text-[11.5px] italic leading-snug text-[var(--text-muted)]">
              „{panel.text}"
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={submitLike}
                disabled={saving || likedThis}
                aria-label={likedThis ? 'Patiko' : 'Pažymėti patinka'}
                title={likedThis ? 'Patiko' : 'Pažymėti patinka'}
                className={[
                  'flex h-9 w-9 items-center justify-center rounded-full border transition-colors disabled:opacity-90',
                  likedThis
                    ? 'border-[var(--accent-orange)] bg-[var(--accent-orange)] text-white'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--accent-orange)] hover:border-[var(--accent-orange)] hover:bg-[rgba(249,115,22,0.12)]',
                ].join(' ')}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill={likedThis ? '#fff' : 'currentColor'}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
              </button>
              <button
                type="button"
                onClick={() => setShowComment(v => !v)}
                aria-label="Pridėti komentarą"
                title="Pridėti komentarą"
                className={[
                  'flex h-9 w-9 items-center justify-center rounded-full border transition-colors',
                  showComment
                    ? 'border-[var(--accent-orange)] bg-[rgba(249,115,22,0.12)] text-[var(--accent-orange)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]',
                ].join(' ')}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" /></svg>
              </button>
              <button
                type="button"
                onClick={closePanel}
                aria-label="Uždaryti"
                title="Uždaryti"
                className="ml-auto flex h-7 w-7 items-center justify-center rounded text-[var(--text-faint)] hover:text-[var(--text-primary)]"
              >
                <svg viewBox="0 0 16 16" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M3 3l10 10M13 3L3 13" />
                </svg>
              </button>
            </div>
            {showComment && (
              <div className="flex flex-col gap-1.5">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Komentaras šiai eilutei…"
                  rows={2}
                  autoFocus
                  className="w-full resize-none rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-2 text-[12.5px] leading-snug text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent-orange)] focus-visible:outline-none focus-visible:ring-0"
                />
                <button
                  type="button"
                  onClick={submitComment}
                  disabled={saving || !draft.trim()}
                  className="self-end inline-flex items-center gap-1 rounded-full bg-[var(--accent-orange)] px-3 py-1.5 font-['Outfit',sans-serif] text-[11px] font-extrabold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2z" /></svg>
                  Siųsti
                </button>
              </div>
            )}
          </div>
        </FloatingPopover>
      )}

      {/* Click-on-existing-chip tooltip — grouped per author. One row per
          user with their like + comments combined. */}
      {tooltip && (
        <FloatingPopover
          rect={tooltip.rect}
          onClose={() => setTooltip(null)}
          width={320}
        >
          <div className="flex flex-col gap-2">
            <div className="max-h-[100px] overflow-y-auto whitespace-pre-wrap border-b border-[var(--border-subtle)] pb-1.5 text-[11px] italic text-[var(--text-muted)]">
              „{tooltip.span.reactions[0].selected_text}"
            </div>
            <div className="flex flex-col gap-2">
              {/* Render BY USER GROUP — same author's like + comment(s) merge
                  into one row showing avatar + name + ♥ Patinka chip + each
                  comment line below. Admin/owner deletes per individual
                  reaction (like or comment) via row's trash icons. */}
              {groupByAuthor(tooltip.span.reactions).map((g) => (
                <div key={g.key} className="flex items-start gap-2">
                  <MiniAvatar name={g.authorName} url={g.authorAvatarUrl} size={22} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-['Outfit',sans-serif] text-[11.5px] font-extrabold text-[var(--text-secondary)]">
                        {g.authorName}
                      </span>
                      {g.hasLike && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[var(--accent-orange)]">
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                          Patinka
                        </span>
                      )}
                      {/* Admin: delete the like specifically. Owner deletes
                          via the heart toggle below — UX-clearer there. */}
                      {isAdmin && g.hasLike && g.likeReactionId != null && (
                        <button
                          type="button"
                          onClick={() => deleteReaction(g.likeReactionId!)}
                          aria-label="Pašalinti like reakciją"
                          title="Pašalinti like (admin)"
                          className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-faint)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[#ef4444]"
                        >
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m-9 0v14a2 2 0 002 2h6a2 2 0 002-2V6" /></svg>
                        </button>
                      )}
                    </div>
                    {g.comments.map((c) => (
                      <div key={c.id} className="mt-0.5 flex items-start gap-1.5">
                        <div className="min-w-0 flex-1 break-words text-[12px] leading-snug text-[var(--text-primary)]">
                          {c.text}
                        </div>
                        {(isAdmin || g.isOwn) && (
                          <button
                            type="button"
                            onClick={() => deleteReaction(c.id)}
                            aria-label="Pašalinti komentarą"
                            title="Pašalinti komentarą"
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--text-faint)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[#ef4444]"
                          >
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m-9 0v14a2 2 0 002 2h6a2 2 0 002-2V6" /></svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-1 flex items-center gap-2 border-t border-[var(--border-subtle)] pt-2">
              {(() => {
                const myLike = tooltip.span.reactions.find(r => r.is_own && r.type === 'like')
                const liked = !!myLike
                return (
                  <button
                    type="button"
                    onClick={() => quickLike(tooltip.span)}
                    disabled={saving}
                    aria-label={liked ? 'Atšaukti patinka' : 'Pažymėti patinka'}
                    title={liked ? 'Atšaukti patinka' : 'Pažymėti patinka'}
                    className={[
                      'flex h-8 w-8 items-center justify-center rounded-full transition-opacity hover:opacity-90 disabled:opacity-40',
                      liked
                        ? 'bg-[var(--accent-orange)] text-white ring-2 ring-[var(--accent-orange)]/30'
                        : 'border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--accent-orange)]',
                    ].join(' ')}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill={liked ? '#fff' : 'currentColor'}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                  </button>
                )
              })()}
              <button
                type="button"
                onClick={() => {
                  const r = tooltip.span.reactions[0]
                  setTooltip(null)
                  setPanel({
                    text: r.selected_text,
                    start: tooltip.span.start,
                    end: tooltip.span.end,
                    rect: tooltip.rect,
                  })
                  setLikedThis(false)
                  setShowComment(true)
                }}
                aria-label="Pridėti komentarą"
                title="Pridėti komentarą"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" /></svg>
              </button>
            </div>
          </div>
        </FloatingPopover>
      )}
    </div>
  )
}

/** Compute the absolute char offset for the start of a given line index. */
function lineStartOf(lines: Array<{ text: string }>, index: number): number {
  let pos = 0
  for (let i = 0; i < index; i++) pos += lines[i].text.length + 1
  return pos
}

/** Render a single line with `<mark>` highlighted spans where reactions
 *  start. The chip strip is rendered separately on the side, so we don't
 *  add any badges inline here — just a light orange highlight. */
function renderInlineHighlights(text: string, lineSpans: Span[], lineStart: number): React.ReactNode {
  if (lineSpans.length === 0) return text
  const out: React.ReactNode[] = []
  let cursor = 0 // line-relative
  for (const s of lineSpans) {
    const localStart = Math.max(0, s.start - lineStart)
    const localEnd = Math.min(text.length, s.end - lineStart)
    if (localStart < cursor) continue
    if (localStart > cursor) out.push(text.slice(cursor, localStart))
    out.push(
      <mark
        key={`${s.start}-${s.end}`}
        // Neleidžiam pažymėti teksto, kuris jau pamarkiruotas — kitaip
        // user'is bandytų pridėti reakciją ant tos pačios vietos ir
        // matytų dubliuojančius badge'us. Native selection skips
        // user-select:none regions (drag selection praleidžia).
        style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
        className="rounded bg-[rgba(249,115,22,0.22)] px-0.5 text-[var(--text-primary)] shadow-[inset_0_-2px_0_rgba(249,115,22,0.5)]"
      >
        {text.slice(localStart, localEnd)}
      </mark>,
    )
    cursor = localEnd
  }
  if (cursor < text.length) out.push(text.slice(cursor))
  return out
}

/** Position-anchored popover. Stays inside viewport — flips above selection
 *  if there's no room below. Click outside or Esc to dismiss. */
function FloatingPopover({
  rect, onClose, children, width = 280,
}: { rect: DOMRect; onClose: () => void; children: React.ReactNode; width?: number }) {
  const popRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number; placement: 'below' | 'above' }>(() => ({
    top: rect.bottom + 8,
    left: Math.max(8, Math.min(window.innerWidth - width - 8, rect.left)),
    placement: 'below',
  }))

  useEffect(() => {
    const r = popRef.current
    if (!r) return
    const h = r.offsetHeight
    const w = r.offsetWidth
    const roomBelow = window.innerHeight - rect.bottom
    const roomAbove = rect.top
    const fitsBelow = roomBelow >= h + 16
    const fitsAbove = roomAbove >= h + 16
    // Selection apatinėj viewport'o pusėj — popover'as eis virš teksto, kad
    // composer'is + reagavimo mygtukai būtų patogiai pasiekiami (anksčiau
    // jie atsidarydavo žemiau, nuriedidavo už ekrano krašto).
    const isInBottomHalf = rect.top > window.innerHeight * 0.55
    let placement: 'below' | 'above' = 'below'
    let top = rect.bottom + 8
    if ((!fitsBelow && fitsAbove) || (isInBottomHalf && fitsAbove)) {
      placement = 'above'
      top = Math.max(8, rect.top - h - 8)
    }
    let left = Math.max(8, Math.min(window.innerWidth - w - 8, rect.left))
    setPos({ top, left, placement })
  }, [rect])

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!popRef.current) return
      if (!popRef.current.contains(e.target as Node)) onClose()
    }
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [onClose])

  return (
    <div
      ref={popRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, width, zIndex: 10001 }}
      className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 shadow-[0_18px_40px_-10px_rgba(0,0,0,0.5)]"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  )
}
