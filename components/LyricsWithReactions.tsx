'use client'
// components/LyricsWithReactions.tsx
//
// Renders track lyrics + lets the user select text → react with a like and/or
// a short comment scoped to that exact span. Same component is used inside
// the standalone track page AND inside TrackInfoModal.
//
// Storage: track_lyric_comments(selection_start, selection_end, selected_text,
// type='like'|'comment', text, user_id). API: /api/tracks/[id]/lyric-comments.
//
// UX:
//   - Default render: lyrics as plain pre-wrap text. Already-reacted spans
//     get a richer visual: orange highlight + small badge with count and
//     reactor avatars at the end of the line, so existing reactions are
//     immediately visible (not subtle).
//   - User selects text → SAME popover lets them like AND/OR comment in one
//     action. Both can fire — clicking heart while a comment is drafted is
//     OK; the heart toggles independently of the textarea.
//   - Click an existing highlight → tooltip with reactor avatars + names
//     + comment bodies for that span. Tooltip has its own "+ Patinka man"
//     button so others can pile on without re-selecting.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
}

type Props = {
  trackId: number
  lyrics: string
  /** Compact spacing for modal use. */
  compact?: boolean
}

type Span = { start: number; end: number; reactions: Reaction[] }

/** Group overlapping reactions into spans. Dedupe by exact (start,end). */
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

/** Render lyrics with `<mark>` wrappers around reaction spans. Spans can
 *  overlap, but we render the FIRST one that covers each character (greedy)
 *  to keep markup simple.
 *
 *  Within each <mark> we append a small inline badge: ♥N + tiny avatar
 *  stack (up to 3) so existing reactions are visually loud, not subtle. */
function renderHighlighted(
  lyrics: string,
  spans: Span[],
  onClickSpan: (s: Span, ev: React.MouseEvent<HTMLElement>) => void,
): React.ReactNode[] {
  if (spans.length === 0) return [lyrics]
  const out: React.ReactNode[] = []
  let cursor = 0
  for (const s of spans) {
    if (s.start < cursor) continue
    if (s.start > cursor) out.push(lyrics.slice(cursor, s.start))
    const likes = s.reactions.filter(r => r.type === 'like').length
    const comments = s.reactions.filter(r => r.type === 'comment').length
    const recent = s.reactions.slice(-3)
    out.push(
      <mark
        key={`${s.start}-${s.end}`}
        onClick={(e) => onClickSpan(s, e)}
        className="cursor-pointer rounded-md bg-[rgba(249,115,22,0.28)] px-1 text-[var(--text-primary)] shadow-[inset_0_-2px_0_rgba(249,115,22,0.6)] transition-colors hover:bg-[rgba(249,115,22,0.42)]"
      >
        {lyrics.slice(s.start, s.end)}
        <span className="ml-1.5 inline-flex translate-y-[-1px] items-center gap-1 rounded-full border border-[rgba(249,115,22,0.4)] bg-[var(--bg-surface)] px-1.5 py-0.5 align-middle font-['Outfit',sans-serif] text-[9.5px] font-extrabold text-[var(--accent-orange)]">
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
          <span className="inline-flex -space-x-1">
            {recent.map((r) => (
              <span key={r.id} className="rounded-full ring-1 ring-[var(--bg-surface)]">
                <MiniAvatar name={r.author_name || 'Vartotojas'} url={r.author_avatar_url} size={14} />
              </span>
            ))}
          </span>
        </span>
      </mark>,
    )
    cursor = s.end
  }
  if (cursor < lyrics.length) out.push(lyrics.slice(cursor))
  return out
}

export default function LyricsWithReactions({ trackId, lyrics, compact = false }: Props) {
  const [reactions, setReactions] = useState<Reaction[]>([])
  const [panel, setPanel] = useState<{ text: string; start: number; end: number; rect?: DOMRect } | null>(null)
  const [draft, setDraft] = useState('')
  const [wantsLike, setWantsLike] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tooltip, setTooltip] = useState<{ span: Span; rect: DOMRect } | null>(null)
  const lyricsRef = useRef<HTMLDivElement | null>(null)
  const wasMarkClick = useRef(false)

  // Initial fetch
  useEffect(() => {
    fetch(`/api/tracks/${trackId}/lyric-comments`)
      .then(r => r.json())
      .then((d: Reaction[]) => { if (Array.isArray(d)) setReactions(d) })
      .catch(() => {})
  }, [trackId])

  const spans = useMemo(() => buildSpans(reactions), [reactions])

  const onMouseUp = useCallback(() => {
    if (wasMarkClick.current) { wasMarkClick.current = false; return }
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) return
    const text = sel.toString().trim()
    if (text.length < 3) return
    const startIdx = lyrics.indexOf(text)
    if (startIdx === -1) return
    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    sel.removeAllRanges()
    setPanel({ text, start: startIdx, end: startIdx + text.length, rect })
    setDraft('')
    setWantsLike(true)
    setTooltip(null)
  }, [lyrics])

  const closePanel = () => {
    setPanel(null)
    setDraft('')
  }

  const reload = async () => {
    try {
      const res = await fetch(`/api/tracks/${trackId}/lyric-comments`)
      const data: Reaction[] = await res.json()
      if (Array.isArray(data)) setReactions(data)
    } catch { /* silent */ }
  }

  /** Submit — handles like + comment in ONE action.
   *  - heart toggle on (default) AND text → posts BOTH a like row and a
   *    comment row (back-end has type='like'|'comment' as separate rows)
   *  - heart only → posts a like
   *  - text only (heart off) → posts a comment
   *  We fire them as parallel POSTs so the user only waits one round-trip. */
  const submit = async () => {
    if (!panel || saving) return
    const wantsComment = !!draft.trim()
    if (!wantsLike && !wantsComment) return
    setSaving(true)
    const p = { ...panel }
    closePanel()
    const posts: Promise<unknown>[] = []
    if (wantsLike) {
      posts.push(fetch(`/api/tracks/${trackId}/lyric-comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected_text: p.text, selection_start: p.start, selection_end: p.end, type: 'like', text: '' }),
      }))
    }
    if (wantsComment) {
      posts.push(fetch(`/api/tracks/${trackId}/lyric-comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected_text: p.text, selection_start: p.start, selection_end: p.end, type: 'comment', text: draft.trim() }),
      }))
    }
    try {
      await Promise.all(posts)
      await reload()
    } catch { /* silent */ }
    finally { setSaving(false) }
  }

  /** Quick "+ Patinka man" from inside the tooltip — no need to re-select. */
  const quickLike = async (s: Span) => {
    setSaving(true)
    try {
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
      await reload()
    } catch { /* silent */ }
    finally { setSaving(false); setTooltip(null) }
  }

  const onClickSpan = (s: Span, ev: React.MouseEvent<HTMLElement>) => {
    wasMarkClick.current = true
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect()
    setPanel(null)
    setTooltip({ span: s, rect })
  }

  const fontSize = compact ? 13 : 15
  const lineHeight = compact ? 1.7 : 1.85

  // Touch-device detection — coarse pointer = phone/tablet, where native
  // selection is fiddly. Switch to per-line tap mode in that case so the
  // user only needs ONE tap on a line to open the reaction popover.
  const [isTouch, setIsTouch] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(hover: none) and (pointer: coarse)')
    setIsTouch(mq.matches)
    const onChange = () => setIsTouch(mq.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])

  /** Touch mode: split lyrics into lines, render each as a tap target. Tap
   *  → opens the popover with the whole line as the "selection". User can
   *  still long-press to do a manual selection if they want a sub-line. */
  const renderTouchLines = () => {
    const lines = lyrics.split('\n')
    let cursor = 0
    return (
      <div className="flex flex-col gap-0">
        {lines.map((line, i) => {
          const start = cursor
          const end = cursor + line.length
          cursor = end + 1 // +1 for the \n
          // Find any reactions whose span overlaps this line
          const lineSpans = spans.filter(s => s.start < end && s.end > start)
          const tapLine = (e: React.MouseEvent<HTMLElement>) => {
            const trimmed = line.trim()
            if (trimmed.length < 3) return
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
            // If there's an existing reaction on this line, show its details
            // tooltip instead of the new-reaction popover.
            if (lineSpans.length > 0) {
              setTooltip({ span: lineSpans[0], rect })
              return
            }
            const startIdx = lyrics.indexOf(trimmed, Math.max(0, start - 2))
            if (startIdx === -1) return
            setPanel({
              text: trimmed,
              start: startIdx,
              end: startIdx + trimmed.length,
              rect,
            })
            setDraft('')
            setWantsLike(true)
            setTooltip(null)
          }
          if (line.trim().length === 0) {
            return <div key={i} style={{ height: lineHeight + 'em' }} />
          }
          const hasReaction = lineSpans.length > 0
          return (
            <button
              key={i}
              type="button"
              onClick={tapLine}
              className={[
                'group flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left transition-colors',
                hasReaction
                  ? 'bg-[rgba(249,115,22,0.18)] shadow-[inset_0_-2px_0_rgba(249,115,22,0.55)] hover:bg-[rgba(249,115,22,0.28)]'
                  : 'hover:bg-[var(--bg-hover)] active:bg-[rgba(249,115,22,0.12)]',
              ].join(' ')}
              style={{ fontSize, lineHeight: 1.4 }}
            >
              <span className="flex-1 break-words text-[var(--text-primary)]">{line}</span>
              {hasReaction && (
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-[rgba(249,115,22,0.4)] bg-[var(--bg-surface)] px-1.5 py-0.5 font-['Outfit',sans-serif] text-[9.5px] font-extrabold text-[var(--accent-orange)]">
                  {lineSpans.reduce((n, s) => n + s.reactions.filter(r => r.type === 'like').length, 0) > 0 && (
                    <>
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                      {lineSpans.reduce((n, s) => n + s.reactions.filter(r => r.type === 'like').length, 0)}
                    </>
                  )}
                </span>
              )}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="relative">
      {isTouch ? (
        <div ref={lyricsRef}>
          <div className="mb-2 inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-0.5 font-['Outfit',sans-serif] text-[9.5px] font-extrabold uppercase tracking-wider text-[var(--text-faint)]">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M9 12l2 2 4-4M7 4h10v2H7zm0 14h10v2H7zm-2-7h14v2H5z" /></svg>
            Bakstelėk eilutę → reaguok
          </div>
          {renderTouchLines()}
        </div>
      ) : (
        <div
          ref={lyricsRef}
          onMouseUp={onMouseUp}
          onTouchEnd={onMouseUp}
          className="whitespace-pre-wrap break-words text-[var(--text-primary)]"
          style={{ fontSize, lineHeight, fontFamily: "'DM_Sans',system-ui,sans-serif", userSelect: 'text' }}
        >
          {renderHighlighted(lyrics, spans, onClickSpan)}
        </div>
      )}

      {/* Selection popover — patinka + comment kartu (vienoje formoje, ne
          atskiri tabai, kad žmogus galėtų ir ir pažymėti, ir parašyti
          komentarą vienu veiksmu). */}
      {panel && panel.rect && (
        <FloatingPopover
          rect={panel.rect}
          onClose={closePanel}
          width={300}
        >
          <div className="flex flex-col gap-2.5">
            <div className="flex items-start justify-between gap-2 border-b border-[var(--border-subtle)] pb-2">
              <div className="font-['Outfit',sans-serif] text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-[var(--text-faint)]">
                Pažymėta vieta
              </div>
              <button
                type="button"
                onClick={closePanel}
                aria-label="Uždaryti"
                className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-faint)] hover:text-[var(--text-primary)]"
              >
                <svg viewBox="0 0 16 16" width={10} height={10} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M3 3l10 10M13 3L3 13" />
                </svg>
              </button>
            </div>
            <div className="line-clamp-2 text-[12px] italic leading-snug text-[var(--text-muted)]">
              „{panel.text}"
            </div>
            <button
              type="button"
              onClick={() => setWantsLike(v => !v)}
              className={[
                "inline-flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 font-['Outfit',sans-serif] text-[12px] font-extrabold transition-colors",
                wantsLike
                  ? 'border-[var(--accent-orange)] bg-[var(--accent-orange)] text-white'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]',
              ].join(' ')}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill={wantsLike ? '#fff' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
              {wantsLike ? 'Patinka' : 'Pažymėk patinka'}
            </button>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Komentaras (neprivaloma)"
              rows={2}
              className="w-full resize-none rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-2 text-[12.5px] leading-snug text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent-orange)]"
            />
            <button
              type="button"
              onClick={submit}
              disabled={saving || (!wantsLike && !draft.trim())}
              className="self-end rounded-lg bg-[var(--accent-orange)] px-4 py-1.5 font-['Outfit',sans-serif] text-[11.5px] font-extrabold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {saving ? 'Siunčiama…' : 'Išsaugoti'}
            </button>
          </div>
        </FloatingPopover>
      )}

      {/* Click on existing reaction → details popover with reactor avatars
          + names + comment bodies. "Patinka man" button lets others pile
          on without reselecting the text. */}
      {tooltip && (
        <FloatingPopover
          rect={tooltip.rect}
          onClose={() => setTooltip(null)}
          width={320}
        >
          <div className="flex flex-col gap-2">
            <div className="border-b border-[var(--border-subtle)] pb-1.5 text-[11px] italic text-[var(--text-muted)] line-clamp-2">
              „{tooltip.span.reactions[0].selected_text}"
            </div>
            <div className="flex flex-col gap-2">
              {tooltip.span.reactions.map((r) => (
                <div key={r.id} className="flex items-start gap-2">
                  <MiniAvatar name={r.author_name || 'Vartotojas'} url={r.author_avatar_url} size={22} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-['Outfit',sans-serif] text-[11.5px] font-extrabold text-[var(--text-secondary)]">
                        {r.author_name || 'Vartotojas'}
                      </span>
                      {r.type === 'like' ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[var(--accent-orange)]">
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                          Patinka
                        </span>
                      ) : null}
                    </div>
                    {r.type === 'comment' && r.text && (
                      <div className="mt-0.5 break-words text-[12px] leading-snug text-[var(--text-primary)]">
                        {r.text}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-1 flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-2">
              <button
                type="button"
                onClick={() => quickLike(tooltip.span)}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-orange)] px-3 py-1.5 font-['Outfit',sans-serif] text-[11px] font-extrabold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                + Patinka man
              </button>
              <button
                type="button"
                onClick={() => {
                  // Reuse same selection to add a comment quickly.
                  const r = tooltip.span.reactions[0]
                  setTooltip(null)
                  setPanel({
                    text: r.selected_text,
                    start: tooltip.span.start,
                    end: tooltip.span.end,
                    rect: tooltip.rect,
                  })
                  setWantsLike(false)
                }}
                className="font-['Outfit',sans-serif] text-[11px] font-extrabold text-[var(--text-muted)] transition-colors hover:text-[var(--accent-orange)]"
              >
                + Komentuoti
              </button>
            </div>
          </div>
        </FloatingPopover>
      )}
    </div>
  )
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
    const room = window.innerHeight - rect.bottom
    let placement: 'below' | 'above' = 'below'
    let top = rect.bottom + 8
    if (room < h + 16 && rect.top > h + 16) {
      placement = 'above'
      top = rect.top - h - 8
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
