'use client'
// components/home/BendruomeneSection.tsx — per-tipo rich cards, viskas scrollinama.
//
// 2026-06-12 v3:
//   • DD: #1 badge, no play hover, CTA su search ikona (be emoji/subheaderio)
//   • Koncertų excerpt: line-clamp-6 (daugiau teksto)
//   • Topas badge: absolute kaip kitose kortelėse
//   • Diskusija: be AuthorRow, 2 komentarai
//   • Atradimas: line-clamp-5, atlikėjas su profilio foto, atskirtas nuo teksto
//   • Cover fallback: SVG placeholder ikonos (ne pirmos raidės)

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Scroller from '@/components/ui/Scroller'
import { proxyImg } from '@/lib/img-proxy'

// ── Types ──────────────────────────────────────────────────────────────────────
type Entry = { rank: number; title: string; artist: string | null; image: string | null }
type CommentBubble = { text: string; author: string | null; avatar: string | null; time: string }
type Candidate = { rank?: number; title: string; artist: string | null; cover: string | null; votes: number }

type CommunityItem = {
  id: string
  type: 'dd' | 'blog' | 'discussion' | 'atradimas'
  subtype?: string | null
  editorial_type?: string | null
  title: string
  href: string
  cover: string | null
  author_name: string | null
  author_slug?: string | null
  author_avatar: string | null
  created_at: string
  comment_count?: number
  vote_count?: number | null
  vote_total?: number | null
  candidates?: Candidate[]
  engagement?: number
  excerpt?: string | null
  // Kūryba/vertimas — tikros eilėraščio eilutės (server-side iš content).
  poem_lines?: string[] | null
  entries?: Entry[] | null
  last_comment?: CommentBubble | null
  last_comments?: CommentBubble[] | null
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function strHue(s: string) {
  let h = 0
  for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) % 360
  return h
}
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return m < 2 ? 'ką tik' : `${m} min.`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} val.`
  const d = Math.floor(h / 24)
  if (d <= 45) return `${d} d.`
  return ''
}

// ── Poetry-style line breaks for creative excerpts ────────────────────────────
// Kūryba/vertimas excerpt → eilutės po ~35 simb. žodžio riboje (lyg eilėraštis).
function poetryLines(text: string): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if (cur.length + w.length + 1 > 35 && cur) {
      lines.push(cur)
      cur = w
    } else {
      cur = cur ? cur + ' ' + w : w
    }
  }
  if (cur) lines.push(cur)
  return lines
}

// ── PopBar — 5 discrete bars (matches /atrasti style) ────────────────────────
function PopBar({ level, w = 11, onDark = false }: { level: number; w?: number; onDark?: boolean }) {
  return (
    <span className="flex items-center gap-[3px]" aria-label={`Balsų lygis ${level}/5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={`h-[3px] rounded-[2px] ${i < level ? 'bg-[var(--accent-orange)]' : onDark ? 'bg-[rgba(255,255,255,0.18)]' : 'bg-[var(--border-default)]'}`} style={{ width: w }} />
      ))}
    </span>
  )
}

// ── Placeholder SVG icons for cover fallback ──────────────────────────────────
function PlaceholderIcon({ type }: { type: string }) {
  if (type === 'discussion') return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  )
  // Kūryba — pen/feather
  if (type === 'creation') return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/><path d="M16 8 2 22"/><path d="M17.5 15H9"/>
    </svg>
  )
  // Vertimas — languages/globe
  if (type === 'translation') return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  )
  // Generic music note
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
    </svg>
  )
}

type TypeMeta = { label: string; color: string }
function getTypeMeta(type: string, sub?: string | null, editorial?: string | null): TypeMeta {
  if (type === 'dd') return { label: 'Dienos daina', color: '#f97316' }
  if (type === 'discussion') return { label: 'Diskusija', color: '#8b5cf6' }
  if (type === 'atradimas') return { label: 'Atradimas', color: '#f97316' }
  if (sub === 'topas') return { label: 'Topas', color: '#f59e0b' }
  if (sub === 'creation') return { label: 'Kūryba', color: '#ec4899' }
  if (sub === 'translation') return { label: 'Vertimas', color: '#10b981' }
  if (sub === 'review') return { label: 'Muzikos apžvalga', color: '#ef4444' }
  if (sub === 'article') {
    if (editorial === 'recenzija') return { label: 'Muzikos apžvalga', color: '#ef4444' }
    if (editorial === 'koncertai') return { label: 'Koncerto įspūdžiai', color: '#3b82f6' }
    return { label: 'Įrašas', color: '#94a3b8' }
  }
  return { label: 'Įrašas', color: '#94a3b8' }
}

const CARD_W = 256
const CARD_MIN_H = 330

function Badge({ meta }: { meta: TypeMeta }) {
  return (
    <span className="absolute left-2.5 top-2.5 z-[2] rounded-[7px] px-2 py-1 font-['Outfit',sans-serif] text-[9px] font-extrabold uppercase tracking-[0.08em] text-white"
      style={{ background: meta.color }}>{meta.label}</span>
  )
}

// ── Shared cover with SVG placeholder fallback ────────────────────────────────
function Cover({ url, alt, hue, h = 134, iconType = 'blog' }: { url: string | null; alt: string; hue: number; h?: number; iconType?: string }) {
  const [failed, setFailed] = useState(false)
  const showGradient = !url || failed
  return (
    <div className="relative shrink-0 overflow-hidden" style={{ height: h }}>
      {showGradient
        ? <div className="flex h-full w-full items-center justify-center text-white/25"
            style={{ background: `linear-gradient(135deg,hsl(${hue},34%,22%),hsl(${(hue+40)%360},30%,12%))` }}>
            <PlaceholderIcon type={iconType} />
          </div>
        : <img src={proxyImg(url!)} alt={alt} loading="lazy" onError={() => setFailed(true)} // eslint-disable-line @next/next/no-img-element
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]" />
      }
    </div>
  )
}

// ── Author row ─────────────────────────────────────────────────────────────────
function AuthorRow({ it }: { it: CommunityItem }) {
  const name = it.author_name
  const h = strHue(name || it.title)
  const ago = timeAgo(it.created_at)
  return (
    <div className="mt-auto flex items-center gap-1.5 border-t border-[var(--border-subtle)] px-3 py-2.5">
      {it.author_avatar
        ? <img src={proxyImg(it.author_avatar)} alt="" loading="lazy" // eslint-disable-line @next/next/no-img-element
            className="h-[18px] w-[18px] shrink-0 rounded-full object-cover" />
        : name
          ? <div className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[8px] font-extrabold"
              style={{ fontFamily: "'Outfit',sans-serif", background: `hsl(${h},32%,18%)`, color: `hsl(${h},45%,55%)` }}>
              {name.charAt(0).toUpperCase()}
            </div>
          : null
      }
      <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-[var(--text-secondary)]"
            style={{ fontFamily: "'Outfit',sans-serif" }}>{name || 'narys'}</span>
      {ago && <span className="shrink-0 text-[9.5px] text-[var(--text-faint)]">{ago}</span>}
    </div>
  )
}

// ── Comment bubble (reusable) ─────────────────────────────────────────────────
function CommentBubbleEl({ c, clamp = 4 }: { c: CommentBubble; clamp?: number }) {
  const ch = strHue(c.author || '')
  return (
    <div className="flex flex-col gap-1 rounded-[4px_12px_12px_12px] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.05)] px-2.5 py-2">
      <div className="flex items-center gap-1.5">
        {c.avatar
          ? <img src={proxyImg(c.avatar)} alt="" loading="lazy" // eslint-disable-line @next/next/no-img-element
              className="h-[15px] w-[15px] shrink-0 rounded-full object-cover" />
          : <div className="h-[15px] w-[15px] shrink-0 rounded-full"
              style={{ background: `hsl(${ch},30%,25%)` }} />
        }
        {c.author && <span className="truncate text-[10px] font-bold text-[var(--text-primary)]">{c.author}</span>}
      </div>
      <p className={`m-0 text-[11px] leading-relaxed text-[var(--text-secondary)]`}
         style={{ display: '-webkit-box', WebkitLineClamp: clamp, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.text}</p>
    </div>
  )
}

// ── Dienos daina card ─────────────────────────────────────────────────────────
function DDCard({ it }: { it: CommunityItem }) {
  const isToday = it.subtype === 'today_leader'
  const h = strHue(it.author_name || it.title)
  const candidates = (it.candidates || []).slice(0, 3)
  const meta = getTypeMeta('dd')
  // Winner votes for popbar level calculation
  const winnerVotes = it.vote_count ?? it.vote_total ?? 0
  const allVotes = [winnerVotes, ...candidates.map(c => c.votes)]
  const maxVotes = Math.max(...allVotes, 1)
  const winnerLevel = Math.max(1, Math.round((winnerVotes / maxVotes) * 5))
  return (
    <Link href={it.href} className="hp-card group relative flex flex-col overflow-hidden p-0 no-underline"
      style={{ width: CARD_W, minHeight: CARD_MIN_H, flexShrink: 0, background: 'linear-gradient(135deg,#241308 0%,#10141f 65%)', borderColor: 'rgba(249,115,22,0.3)' }}>
      <Badge meta={meta} />
      <div className="flex items-center gap-3 px-3.5 pt-9">
        <div className="relative h-[86px] w-[86px] shrink-0 overflow-hidden rounded-xl shadow-[0_8px_22px_rgba(0,0,0,0.45)]">
          {it.cover
            ? <img src={proxyImg(it.cover)} alt={it.title} loading="lazy" // eslint-disable-line @next/next/no-img-element
                className="h-full w-full object-cover" />
            : <div className="flex h-full w-full items-center justify-center text-white/20"
                style={{ background: `linear-gradient(135deg,hsl(${h},50%,18%),hsl(${(h+30)%360},40%,10%))` }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                </svg>
              </div>
          }
          {/* #1 badge */}
          <span className="absolute left-1 top-1 flex h-[18px] w-[18px] items-center justify-center rounded-full font-['Outfit',sans-serif] text-[9px] font-black text-white"
                style={{ background: '#f97316' }}>#1</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="m-0 line-clamp-2 font-['Outfit',sans-serif] text-[15px] font-extrabold leading-tight text-[#f0f4fc]">{it.title}</p>
          {it.author_name && <p className="m-0 mt-0.5 truncate text-[11.5px] text-[#aec4dd]">{it.author_name}</p>}
          <div className="mt-1.5"><PopBar level={winnerLevel} onDark /></div>
        </div>
      </div>
      <div className="mx-3.5 mt-3 flex flex-col gap-1.5 border-t border-[rgba(255,255,255,0.08)] pt-2.5">
        {candidates.length > 0 ? (
          <>
            <p className="m-0 font-['Outfit',sans-serif] text-[8.5px] font-extrabold uppercase tracking-[0.1em] text-[#8ea8c4]">Kiti pasiūlymai</p>
            {candidates.map((c, i) => {
              const level = Math.max(1, Math.round((c.votes / maxVotes) * 5))
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-4 shrink-0 text-center font-['Outfit',sans-serif] text-[12px] font-black text-[#8ea8c4]">{c.rank ?? i + 2}</span>
                  {c.cover
                    ? <img src={proxyImg(c.cover)} alt="" loading="lazy" // eslint-disable-line @next/next/no-img-element
                        className="h-[30px] w-[30px] shrink-0 rounded-md object-cover" />
                    : <div className="h-[30px] w-[30px] shrink-0 rounded-md" style={{ background: `hsl(${strHue(c.title)},30%,22%)` }} />
                  }
                  <div className="min-w-0 flex-1">
                    <p className="m-0 truncate text-[11.5px] font-bold leading-tight text-[#f0f4fc]" style={{ fontFamily: "'Outfit',sans-serif" }}>{c.title}</p>
                    {c.artist && <p className="m-0 truncate text-[9.5px] leading-tight text-[#8ea8c4]">{c.artist}</p>}
                    <div className="mt-1"><PopBar level={level} w={9} onDark /></div>
                  </div>
                </div>
              )
            })}
          </>
        ) : (
          <a href="/dienos-daina?siulyti=1"
             onClick={e => e.stopPropagation()}
             className="flex items-center gap-3 rounded-lg px-2 py-2.5 no-underline transition-colors hover:bg-[rgba(249,115,22,0.08)]">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: 'rgba(249,115,22,0.15)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="m-0 font-['Outfit',sans-serif] text-[12px] font-bold text-[#f0f4fc]">Siūlyti dainą</p>
              <p className="m-0 text-[10px] text-[#8ea8c4]">Rink dienos dainą su bendruomene</p>
            </div>
          </a>
        )}
      </div>
      <span className="mt-auto px-3.5 pb-3.5 pt-3 font-['Outfit',sans-serif] text-[11.5px] font-bold text-[var(--accent-orange)]">
        {isToday ? 'Balsuoti →' : 'Dienos daina →'}
      </span>
    </Link>
  )
}

// ── Blog card (article / review / creation / translation / quick) ──────────────
function BlogCard({ it }: { it: CommunityItem }) {
  const h = strHue(it.author_name || it.title)
  const meta = getTypeMeta(it.type, it.subtype, it.editorial_type)
  const isLong = it.editorial_type === 'koncertai' || it.subtype === 'review' || it.editorial_type === 'recenzija'
  const isCreative = it.subtype === 'creation' || it.subtype === 'translation'
  return (
    <Link href={it.href} className="hp-card group relative flex flex-col overflow-hidden p-0 no-underline" style={{ width: CARD_W, minHeight: CARD_MIN_H, flexShrink: 0 }}>
      <Badge meta={meta} />
      <Cover url={it.cover} alt={it.author_name || it.title} hue={h} iconType={isCreative ? it.subtype! : 'blog'} />
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 px-3 pb-2 pt-2.5">
        <p className="m-0 line-clamp-2 text-[14px] font-extrabold leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]"
           style={{ fontFamily: "'Outfit',sans-serif" }}>{it.title}</p>
        {isCreative ? (
          // Eilėraštis — tikros eilutės (poem_lines), kiekviena atskiroje eilutėje.
          // Fallback: senas char-wrap (poetryLines) jei content neturėjo lūžių.
          (() => {
            const lines = (it.poem_lines && it.poem_lines.length ? it.poem_lines : (it.excerpt ? poetryLines(it.excerpt) : [])).slice(0, 6)
            if (!lines.length) return null
            return (
              <div className="min-h-0 flex-1 overflow-hidden">
                {lines.map((line, i) => (
                  <span key={i} className="block truncate text-[12px] leading-[1.7] text-[var(--text-secondary)]" style={{ fontStyle: 'italic' }}>{line}</span>
                ))}
              </div>
            )
          })()
        ) : it.excerpt ? (
          <p className="m-0 text-[11.5px] leading-relaxed text-[var(--text-secondary)]"
             style={{ display: '-webkit-box', WebkitLineClamp: isLong ? 6 : 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{it.excerpt}</p>
        ) : null}
      </div>
      <AuthorRow it={it} />
    </Link>
  )
}

// ── Topas card — iki 5 ranked entries ──────────────────────────────────────────
function TopasCard({ it }: { it: CommunityItem }) {
  const meta = getTypeMeta(it.type, it.subtype, it.editorial_type)
  const entries = (it.entries || []).slice(0, 5)
  return (
    <Link href={it.href} className="hp-card group relative flex flex-col overflow-hidden p-0 no-underline" style={{ width: CARD_W, minHeight: CARD_MIN_H, flexShrink: 0 }}>
      <Badge meta={meta} />
      <div className="flex flex-col gap-1 px-3 pb-1 pt-9">
        <p className="m-0 line-clamp-2 text-[14px] font-extrabold leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]"
           style={{ fontFamily: "'Outfit',sans-serif" }}>{it.title}</p>
        {entries.length > 0 && (
          <div className="mt-1 flex flex-col">
            {entries.map(e => (
              <div key={e.rank} className="flex items-center gap-2 border-b border-[var(--border-subtle)] py-[6px] last:border-b-0">
                <span className="w-4 shrink-0 text-center text-[12px] font-black"
                      style={{ color: e.rank === 1 ? '#fbbf24' : e.rank === 2 ? '#94a3b8' : e.rank === 3 ? '#c97d4d' : 'var(--text-faint)', fontFamily: "'Outfit',sans-serif" }}>
                  {e.rank}
                </span>
                {e.image
                  ? <img src={proxyImg(e.image)} alt="" loading="lazy" // eslint-disable-line @next/next/no-img-element
                      className="h-[30px] w-[30px] shrink-0 rounded-md object-cover" />
                  : <div className="h-[30px] w-[30px] shrink-0 rounded-md"
                      style={{ background: `hsl(${strHue(e.title)},30%,20%)` }} />
                }
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-[11.5px] font-bold leading-tight text-[var(--text-primary)]"
                     style={{ fontFamily: "'Outfit',sans-serif" }}>{e.title}</p>
                  {e.artist && (
                    <p className="m-0 truncate text-[9.5px] leading-tight text-[var(--text-muted)]"
                       style={{ fontFamily: "'Outfit',sans-serif" }}>{e.artist}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {(it.entries?.length || 0) > 5 && (
          <p className="m-0 pt-1 text-[10.5px] text-[var(--text-muted)]">Visas topas →</p>
        )}
      </div>
      <AuthorRow it={it} />
    </Link>
  )
}

// ── Discussion card — 2 komentarai, be AuthorRow ──────────────────────────────
function DiscCard({ it }: { it: CommunityItem }) {
  const meta = getTypeMeta(it.type, it.subtype, it.editorial_type)
  const comments = it.last_comments || (it.last_comment ? [it.last_comment] : [])
  return (
    <Link href={it.href} className="hp-card group relative flex flex-col overflow-hidden p-0 no-underline"
      style={{ width: CARD_W, minHeight: CARD_MIN_H, flexShrink: 0, background: 'linear-gradient(160deg,rgba(139,92,246,0.1),var(--bg-surface) 60%)' }}>
      {it.cover ? (
        <>
          <Badge meta={meta} />
          <div className="relative shrink-0 overflow-hidden" style={{ height: 134 }}>
            <img src={proxyImg(it.cover)} alt={it.title} loading="lazy" // eslint-disable-line @next/next/no-img-element
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]" />
            <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(to bottom,transparent 40%,rgba(13,19,32,0.8))' }} />
            {(it.comment_count ?? 0) > 0 && (
              <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm"
                    style={{ fontFamily: "'Outfit',sans-serif" }}>{it.comment_count} atsak.</span>
            )}
          </div>
        </>
      ) : (
        <div className="px-3 pt-3"><span className="rounded-[7px] px-2 py-1 font-['Outfit',sans-serif] text-[9px] font-extrabold uppercase tracking-[0.08em] text-white" style={{ background: meta.color }}>{meta.label}</span></div>
      )}
      <div className="flex flex-col gap-1.5 px-3 pb-3 pt-2.5">
        <p className="m-0 line-clamp-2 text-[13.5px] font-extrabold leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]"
           style={{ fontFamily: "'Outfit',sans-serif" }}>{it.title}</p>
        {comments.map((c, i) => (
          <CommentBubbleEl key={i} c={c} clamp={comments.length > 1 ? 3 : 4} />
        ))}
      </div>
    </Link>
  )
}

// ── Atradimas card — atlikėjas atskirtas su profilio foto ─────────────────────
function AtradimasCard({ it }: { it: CommunityItem }) {
  const h = strHue(it.author_name || it.title)
  const meta = getTypeMeta(it.type, it.subtype, it.editorial_type)
  // title formatas: "Artist — Track"
  const parts = it.title.split(/\s*[—–-]\s*/)
  const artistName = parts[0] || it.title
  const trackName = parts.length > 1 ? parts.slice(1).join(' — ') : null
  return (
    <Link href={it.href} className="hp-card group relative flex flex-col overflow-hidden p-0 no-underline" style={{ width: CARD_W, minHeight: CARD_MIN_H, flexShrink: 0 }}>
      <Badge meta={meta} />
      <Cover url={it.cover} alt={artistName} hue={h} iconType="atradimas" />
      <div className="flex flex-col gap-1 px-3 pb-2 pt-2.5">
        {trackName ? (
          <p className="m-0 line-clamp-2 text-[14px] font-extrabold leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]"
             style={{ fontFamily: "'Outfit',sans-serif" }}>{trackName}</p>
        ) : (
          <p className="m-0 line-clamp-2 text-[14px] font-extrabold leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]"
             style={{ fontFamily: "'Outfit',sans-serif" }}>{it.title}</p>
        )}
        {artistName && trackName && (
          <p className="m-0 truncate text-[11px] font-bold text-[var(--text-muted)]"
             style={{ fontFamily: "'Outfit',sans-serif" }}>{artistName}</p>
        )}
        {it.excerpt && (
          <div className="mt-1 flex gap-2">
            {it.author_avatar
              ? <img src={proxyImg(it.author_avatar)} alt="" loading="lazy" // eslint-disable-line @next/next/no-img-element
                  className="mt-0.5 h-[18px] w-[18px] shrink-0 rounded-full object-cover" />
              : it.author_name
                ? <div className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[8px] font-extrabold"
                    style={{ fontFamily: "'Outfit',sans-serif", background: `hsl(${strHue(it.author_name)},32%,18%)`, color: `hsl(${strHue(it.author_name)},45%,55%)` }}>
                    {it.author_name.charAt(0).toUpperCase()}
                  </div>
                : null
            }
            <p className="m-0 text-[11px] leading-relaxed text-[var(--text-secondary)]"
               style={{ display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{it.excerpt}</p>
          </div>
        )}
      </div>
    </Link>
  )
}

// ── Skeletonai ─────────────────────────────────────────────────────────────────
function CardSkel() {
  // Equalizer skeletonas — vienodas „muzikinis" loaderis kaip kitose homepage
  // sekcijose (.hp-eq), ne plokščias pilkas blokas.
  return (
    <div className="hp-eq-card shrink-0 rounded-xl" style={{ width: CARD_W, height: CARD_MIN_H }}>
      <span className="hp-eq" aria-hidden="true"><span /><span /><span /><span /><span /></span>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function BendruomeneSection() {
  const [items, setItems] = useState<CommunityItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    fetch('/api/home/community')
      .then(r => r.json())
      .then((data: { items: CommunityItem[] }) => {
        if (!alive) return
        setItems(Array.isArray(data.items) ? data.items : [])
        setLoading(false)
      })
      .catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  if (!loading && items.length === 0) return null

  return (
    <section>
      <div className="mb-3.5 flex items-center justify-between">
        <h2 className="m-0 font-['Outfit',sans-serif] text-[17px] font-extrabold tracking-[-0.01em] text-[var(--text-primary)] sm:text-[18px]">
          Bendruomenė
        </h2>
        <Link href="/bendruomene"
              className="font-['Outfit',sans-serif] text-[11.5px] font-bold text-[var(--accent-orange)] no-underline transition-opacity hover:opacity-70">
          Daugiau →
        </Link>
      </div>

      <Scroller gap={12} ariaLabel="Bendruomenė">
        {loading
          ? Array(5).fill(null).map((_, i) => <CardSkel key={i} />)
          : items.map(it => {
              if (it.type === 'dd') return <DDCard key={it.id} it={it} />
              if (it.type === 'discussion') return <DiscCard key={it.id} it={it} />
              if (it.type === 'atradimas') return <AtradimasCard key={it.id} it={it} />
              if (it.subtype === 'topas') return <TopasCard key={it.id} it={it} />
              return <BlogCard key={it.id} it={it} />
            })
        }
      </Scroller>
    </section>
  )
}
