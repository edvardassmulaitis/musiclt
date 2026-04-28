'use client'
// components/LyricsWithReactions.tsx
//
// Renders track lyrics + lets the user select text → react with a like or a
// short comment scoped to that exact span. Mirrors the standalone track-page
// behaviour but in a reusable component, so the same UX runs inside the
// TrackInfoModal drawer too.
//
// Storage: track_lyric_comments(selection_start, selection_end, selected_text,
// type='like'|'comment', text). API: /api/tracks/[id]/lyric-comments.
//
// UX:
//   - Default render: lyrics as plain pre-wrap text, with already-reacted
//     spans wrapped in a subtle yellow highlight.
//   - User selects text → popover floats near the selection with Patinka /
//     Komentuoti buttons + small textarea (textarea shows when comment mode
//     active).
//   - Hover/tap an existing highlight → tooltip with the count + comment
//     bodies for that span.
//
// Mobile: tap-and-hold native selection works the same; popover positions
// itself relative to the selection rectangle.

import { useCallback, useEffect, useRef, useState } from 'react'

type Reaction = {
  id: number
  selection_start: number
  selection_end: number
  selected_text: string
  type: 'like' | 'comment'
  text: string
  likes: number
  created_at?: string
}

type Props = {
  trackId: number
  lyrics: string
  /** Compact spacing for modal use. */
  compact?: boolean
}

type Span = { start: number; end: number; reactions: Reaction[] }

/** Group overlapping reactions into spans (start..end ranges). Each span
 *  holds the union of reactions whose selection covers (or equals) it. We
 *  keep it simple: dedupe by exact (start,end) pair. */
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

/** Render lyrics with <mark> wrappers around reaction spans. Spans can
 *  overlap, but we render the FIRST one that covers each character (greedy)
 *  to keep markup simple. */
function renderHighlighted(
  lyrics: string,
  spans: Span[],
  onClickSpan: (s: Span, ev: React.MouseEvent<HTMLElement>) => void,
): React.ReactNode[] {
  if (spans.length === 0) return [lyrics]
  const out: React.ReactNode[] = []
  let cursor = 0
  for (const s of spans) {
    if (s.start < cursor) continue // skip overlap
    if (s.start > cursor) out.push(lyrics.slice(cursor, s.start))
    out.push(
      <mark
        key={`${s.start}-${s.end}`}
        onClick={(e) => onClickSpan(s, e)}
        className="cursor-pointer rounded bg-[rgba(249,115,22,0.18)] px-0.5 text-[var(--text-primary)] transition-colors hover:bg-[rgba(249,115,22,0.32)]"
      >
        {lyrics.slice(s.start, s.end)}
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
  const [tab, setTab] = useState<'react' | 'comment'>('react')
  const [draft, setDraft] = useState('')
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

  const spans = buildSpans(reactions)

  const onMouseUp = useCallback(() => {
    // If the click was on an existing <mark>, we handled it in onClickSpan;
    // skip selection logic.
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
    setTab('react')
    setDraft('')
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

  const submit = async (type: 'like' | 'comment') => {
    if (!panel || saving) return
    if (type === 'comment' && !draft.trim()) return
    setSaving(true)
    const p = { ...panel }
    closePanel()
    // Optimistic
    const temp: Reaction = {
      id: -Date.now(),
      selection_start: p.start,
      selection_end: p.end,
      selected_text: p.text,
      type,
      text: type === 'comment' ? draft.trim() : '',
      likes: 0,
    }
    setReactions(curr => [...curr, temp])
    try {
      await fetch(`/api/tracks/${trackId}/lyric-comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected_text: p.text,
          selection_start: p.start,
          selection_end: p.end,
          type,
          text: type === 'comment' ? draft.trim() : '',
        }),
      })
      await reload()
    } catch { /* silent */ }
    finally { setSaving(false) }
  }

  const onClickSpan = (s: Span, ev: React.MouseEvent<HTMLElement>) => {
    wasMarkClick.current = true
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect()
    setPanel(null)
    setTooltip({ span: s, rect })
  }

  const fontSize = compact ? 13 : 15
  const lineHeight = compact ? 1.55 : 1.7

  return (
    <div className="relative">
      <div
        ref={lyricsRef}
        onMouseUp={onMouseUp}
        onTouchEnd={onMouseUp}
        className="whitespace-pre-wrap break-words text-[var(--text-primary)]"
        style={{ fontSize, lineHeight, fontFamily: "'DM_Sans',system-ui,sans-serif", userSelect: 'text' }}
      >
        {renderHighlighted(lyrics, spans, onClickSpan)}
      </div>

      {/* React popover — atsidaro pažymėjus tekstą. Pozicionuojamas viewport
          coords (fixed), kad veiktų ir scroll'inamose kontainer'iuose
          (modal'as). */}
      {panel && panel.rect && (
        <FloatingPopover
          rect={panel.rect}
          onClose={closePanel}
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 border-b border-[var(--border-subtle)] pb-2">
              <button
                type="button"
                onClick={() => setTab('react')}
                className={[
                  "rounded px-2 py-0.5 font-['Outfit',sans-serif] text-[10.5px] font-extrabold uppercase tracking-wider transition-colors",
                  tab === 'react' ? 'bg-[var(--accent-orange)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
                ].join(' ')}
              >
                Patinka
              </button>
              <button
                type="button"
                onClick={() => setTab('comment')}
                className={[
                  "rounded px-2 py-0.5 font-['Outfit',sans-serif] text-[10.5px] font-extrabold uppercase tracking-wider transition-colors",
                  tab === 'comment' ? 'bg-[var(--accent-orange)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
                ].join(' ')}
              >
                Komentuoti
              </button>
              <button
                type="button"
                onClick={closePanel}
                aria-label="Uždaryti"
                className="ml-auto flex h-5 w-5 items-center justify-center rounded text-[var(--text-faint)] hover:text-[var(--text-primary)]"
              >
                <svg viewBox="0 0 16 16" width={10} height={10} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M3 3l10 10M13 3L3 13" />
                </svg>
              </button>
            </div>
            <div className="line-clamp-2 text-[11px] italic text-[var(--text-muted)]">
              „{panel.text}"
            </div>
            {tab === 'react' ? (
              <button
                type="button"
                onClick={() => submit('like')}
                disabled={saving}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--accent-orange)] px-3 py-2 font-['Outfit',sans-serif] text-[12px] font-extrabold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                Patinka šiai eilutei
              </button>
            ) : (
              <div className="flex flex-col gap-1.5">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Tavo komentaras šiai eilutei…"
                  rows={2}
                  autoFocus
                  className="w-full resize-none rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1.5 text-[12px] leading-snug text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent-orange)]"
                />
                <button
                  type="button"
                  onClick={() => submit('comment')}
                  disabled={saving || !draft.trim()}
                  className="self-end rounded-md bg-[var(--accent-orange)] px-3 py-1 font-['Outfit',sans-serif] text-[11px] font-extrabold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  Siųsti
                </button>
              </div>
            )}
          </div>
        </FloatingPopover>
      )}

      {/* Click-on-existing-mark tooltip — read-only details for that span. */}
      {tooltip && (
        <FloatingPopover
          rect={tooltip.rect}
          onClose={() => setTooltip(null)}
        >
          <div className="flex flex-col gap-2">
            <div className="border-b border-[var(--border-subtle)] pb-1.5 text-[11px] italic text-[var(--text-muted)]">
              „{tooltip.span.reactions[0].selected_text.slice(0, 80)}"
            </div>
            {tooltip.span.reactions.map((r) => (
              <div key={r.id} className="flex items-start gap-1.5 text-[12px] text-[var(--text-primary)]">
                {r.type === 'like' ? (
                  <span className="mt-0.5 text-[var(--accent-orange)]">♥</span>
                ) : (
                  <span className="mt-0.5 text-[var(--text-muted)]">💬</span>
                )}
                <span className="min-w-0 flex-1 break-words">{r.text || (r.type === 'like' ? 'Patinka' : '')}</span>
              </div>
            ))}
          </div>
        </FloatingPopover>
      )}
    </div>
  )
}

/** Position-anchored popover. Stays inside viewport — flips above selection
 *  if there's no room below. Click outside to dismiss. */
function FloatingPopover({
  rect, onClose, children,
}: { rect: DOMRect; onClose: () => void; children: React.ReactNode }) {
  const popRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number; placement: 'below' | 'above' }>(() => ({
    top: rect.bottom + 8,
    left: Math.max(8, Math.min(window.innerWidth - 280, rect.left)),
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
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: 260, zIndex: 10001 }}
      className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 shadow-[0_18px_40px_-10px_rgba(0,0,0,0.5)]"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  )
}
