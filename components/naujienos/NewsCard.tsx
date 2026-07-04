// components/naujienos/NewsCard.tsx
//
// Vienos naujienos kortelė. Plain komponentas (be hook'ų) → veikia ir server,
// ir client kontekste. Trys variantai: 'hero' (didelė), 'default', 'compact'.

import Link from 'next/link'
import { Heart, MessageCircle, Eye } from './icons'
import type { NewsFeedItem } from '@/lib/news-shared'
import { fmtNewsDate, relNewsDate } from '@/lib/news-shared'
import { NEWS_TYPES, type NewsType } from '@/lib/news-taxonomy'

const TYPE_MAP = new Map<string, NewsType>(
  NEWS_TYPES.map((t) => [t.key, t] as [string, NewsType])
)

function CategoryBadge({ category }: { category: string | null }) {
  const c = category ? TYPE_MAP.get(category as any) : null
  // „naujiena" — numatytasis tipas, ženkliuko nerodom (per daug triukšmo).
  if (!c || c.key === 'naujiena') return null
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wide backdrop-blur-sm"
      style={{ background: 'rgba(0,0,0,0.55)', color: '#fff' }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: c.accent }} />
      {c.label}
    </span>
  )
}

function Stats({ item }: { item: NewsFeedItem }) {
  const bits: React.ReactNode[] = []
  if (item.likeCount > 0)
    bits.push(<span key="l" className="inline-flex items-center gap-0.5"><Heart size={11} /> {item.likeCount}</span>)
  if (item.commentCount > 0)
    bits.push(<span key="c" className="inline-flex items-center gap-0.5"><MessageCircle size={11} /> {item.commentCount}</span>)
  if (item.viewCount > 0)
    bits.push(<span key="v" className="inline-flex items-center gap-0.5"><Eye size={11} /> {item.viewCount}</span>)
  if (bits.length === 0) return null
  return <span className="flex items-center gap-2.5 text-[var(--text-faint)]">{bits}</span>
}

function Placeholder({ accent }: { accent: string }) {
  return (
    <div
      className="flex h-full w-full items-center justify-center"
      style={{ background: `linear-gradient(135deg, ${accent}4d, ${accent}1a)` }}
    >
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" style={{ color: accent, opacity: 0.7 }}>
        <path d="M9 18V5l12-2v13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="2" />
        <circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="2" />
      </svg>
    </div>
  )
}

export default function NewsCard({
  item,
  variant = 'default',
  accent = '#0ea5e9',
}: {
  item: NewsFeedItem
  variant?: 'hero' | 'default' | 'compact' | 'feature'
  accent?: string
}) {
  const catAccent = item.category ? TYPE_MAP.get(item.category as any)?.accent || accent : accent

  /* ── HERO ───────────────────────────────────────────────── */
  if (variant === 'hero') {
    return (
      <Link
        href={item.href}
        className="group relative flex min-h-[320px] flex-col justify-end overflow-hidden rounded-3xl border border-[var(--border-default)] sm:min-h-[420px]"
      >
        {item.image ? (
          <img src={item.image} alt={item.title} loading="eager" fetchPriority="high" decoding="async" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="absolute inset-0"><Placeholder accent={catAccent} /></div>
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.86) 8%, rgba(0,0,0,0.35) 45%, rgba(0,0,0,0.05) 75%)' }} />
        <div className="relative z-10 flex flex-col gap-3 p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <CategoryBadge category={item.category} />
            {item.isLT && (
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white backdrop-blur">🇱🇹 Lietuva</span>
            )}
          </div>
          <h2 className="max-w-3xl text-2xl font-black leading-tight text-white sm:text-4xl">{item.title}</h2>
          <div className="flex flex-wrap items-center gap-2 text-[14px] text-white/80">
            {item.artistName && <span className="font-semibold text-white">{item.artistName}</span>}
            {item.artistName && item.date && <span>·</span>}
            {item.date && <span>{fmtNewsDate(item.date)}</span>}
          </div>
        </div>
      </Link>
    )
  }

  /* ── FEATURE (top-3 didesnė kortelė) ─────────────────────── */
  if (variant === 'feature') {
    return (
      <Link
        href={item.href}
        className="group flex flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[0_2px_12px_rgba(0,0,0,0.20)] transition-all duration-200 hover:-translate-y-1 hover:border-[var(--border-strong)] hover:shadow-[0_10px_28px_rgba(0,0,0,0.30)]"
      >
        <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden bg-[var(--bg-hover)]">
          {item.image ? (
            <img src={item.image} alt={item.title} loading="eager" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
          ) : (
            <Placeholder accent={catAccent} />
          )}
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            <CategoryBadge category={item.category} />
            {item.isLT && (
              <span className="rounded-md bg-black/55 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">🇱🇹 Lietuva</span>
            )}
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4">
          <h2 className="line-clamp-3 text-[16px] font-bold leading-[1.3] text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange,#f59e0b)]">
            {item.title}
          </h2>
          <div className="mt-auto flex items-center justify-between gap-2 text-[13px] text-[var(--text-faint)]">
            <span className="flex min-w-0 items-center gap-1.5">
              {item.artistName && <span className="truncate font-semibold text-[var(--text-secondary)]">{item.artistName}</span>}
              {item.artistName && item.date && <span className="shrink-0 opacity-50">·</span>}
              {item.date && <span className="shrink-0">{relNewsDate(item.date)}</span>}
            </span>
            <Stats item={item} />
          </div>
        </div>
      </Link>
    )
  }

  /* ── COMPACT (sąrašo eilutė) ─────────────────────────────── */
  if (variant === 'compact') {
    return (
      <Link href={item.href} className="group flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-[var(--bg-surface-hover,rgba(125,125,125,0.07))]">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-[var(--border-default)]">
          {item.image ? (
            <img src={item.image} alt={item.title} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <Placeholder accent={catAccent} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-[14px] font-bold leading-snug text-[var(--text-primary)] group-hover:text-[var(--accent-orange,#f59e0b)]">{item.title}</h3>
          <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-[var(--text-faint)]">
            {item.artistName && <span className="truncate font-medium text-[var(--text-secondary)]">{item.artistName}</span>}
            {item.artistName && item.date && <span>·</span>}
            {item.date && <span className="shrink-0">{relNewsDate(item.date)}</span>}
          </div>
        </div>
      </Link>
    )
  }

  /* ── DEFAULT (grid kortelė) ──────────────────────────────── */
  return (
    <Link
      href={item.href}
      className="group flex flex-col overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[0_2px_10px_rgba(0,0,0,0.18)] transition-all duration-200 hover:-translate-y-1 hover:border-[var(--border-strong)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.28)]"
    >
      <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden bg-[var(--bg-hover)]">
        {item.image ? (
          <img src={item.image} alt={item.title} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
        ) : (
          <Placeholder accent={catAccent} />
        )}
        <div className="absolute left-2.5 top-2.5 flex gap-1.5">
          <CategoryBadge category={item.category} />
        </div>
      </div>
      <div className="flex flex-col gap-2 p-3">
        <h2 className="line-clamp-3 min-h-[3.85em] text-[14px] font-bold leading-[1.28] text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange,#f59e0b)]">
          {item.title}
        </h2>
        <div className="flex items-center justify-between gap-2 text-[12px] text-[var(--text-faint)]">
          <span className="flex min-w-0 items-center gap-1.5">
            {item.artistName && <span className="truncate font-semibold text-[var(--text-secondary)]">{item.artistName}</span>}
            {item.artistName && item.date && <span className="shrink-0 opacity-50">·</span>}
            {item.date && <span className="shrink-0">{relNewsDate(item.date)}</span>}
          </span>
          <Stats item={item} />
        </div>
      </div>
    </Link>
  )
}
