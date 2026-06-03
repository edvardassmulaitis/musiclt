// components/naujienos/NewsCard.tsx
//
// Vienos naujienos kortelė. Plain komponentas (be hook'ų) → veikia ir server,
// ir client kontekste. Trys variantai: 'hero' (didelė), 'default', 'compact'.

import Link from 'next/link'
import { Heart, MessageCircle, Eye } from './icons'
import type { NewsFeedItem } from '@/lib/news-shared'
import { fmtNewsDate, relNewsDate } from '@/lib/news-shared'
import { NEWS_BROWSE_CATEGORIES, type NewsBrowseCategory } from '@/lib/news-taxonomy'

const CAT_MAP = new Map<string, NewsBrowseCategory>(
  NEWS_BROWSE_CATEGORIES.map((c) => [c.key, c] as [string, NewsBrowseCategory])
)

function CategoryBadge({ category }: { category: string | null }) {
  const c = category ? CAT_MAP.get(category as any) : null
  if (!c) return null
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{ background: `${c.accent}1a`, color: c.accent }}
    >
      <span aria-hidden>{c.icon}</span> {c.label}
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
      style={{ background: `linear-gradient(135deg, ${accent}26, ${accent}0a)` }}
    >
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" style={{ color: accent, opacity: 0.55 }}>
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
  variant?: 'hero' | 'default' | 'compact'
  accent?: string
}) {
  const catAccent = item.category ? CAT_MAP.get(item.category as any)?.accent || accent : accent

  /* ── HERO ───────────────────────────────────────────────── */
  if (variant === 'hero') {
    return (
      <Link
        href={item.href}
        className="group relative flex min-h-[320px] flex-col justify-end overflow-hidden rounded-3xl border border-[var(--border-default)] sm:min-h-[420px]"
      >
        {item.image ? (
          <img src={item.image} alt={item.title} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="absolute inset-0"><Placeholder accent={catAccent} /></div>
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.86) 8%, rgba(0,0,0,0.35) 45%, rgba(0,0,0,0.05) 75%)' }} />
        <div className="relative z-10 flex flex-col gap-3 p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <CategoryBadge category={item.category} />
            {item.isLT && (
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur">🇱🇹 Lietuva</span>
            )}
          </div>
          <h2 className="max-w-3xl text-2xl font-black leading-tight text-white sm:text-4xl">{item.title}</h2>
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-white/80">
            {item.artistName && <span className="font-semibold text-white">{item.artistName}</span>}
            {item.artistName && <span>·</span>}
            <span>{fmtNewsDate(item.date)}</span>
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
            <img src={item.image} alt={item.title} className="h-full w-full object-cover" />
          ) : (
            <Placeholder accent={catAccent} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-[13px] font-bold leading-snug text-[var(--text-primary)] group-hover:text-[var(--accent-orange,#f59e0b)]">{item.title}</h3>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--text-faint)]">
            {item.artistName && <span className="truncate font-medium text-[var(--text-secondary)]">{item.artistName}</span>}
            {item.artistName && <span>·</span>}
            <span className="shrink-0">{relNewsDate(item.date)}</span>
          </div>
        </div>
      </Link>
    )
  }

  /* ── DEFAULT (grid kortelė) ──────────────────────────────── */
  return (
    <Link
      href={item.href}
      className="group flex flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] transition-all hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-lg"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden">
        {item.image ? (
          <img src={item.image} alt={item.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <Placeholder accent={catAccent} />
        )}
        <div className="absolute left-3 top-3 flex gap-1.5">
          <CategoryBadge category={item.category} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h2 className="line-clamp-3 text-[15px] font-bold leading-snug text-[var(--text-primary)]">{item.title}</h2>
        {item.excerpt && <p className="line-clamp-2 text-[12.5px] leading-relaxed text-[var(--text-muted)]">{item.excerpt}</p>}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-[11px] text-[var(--text-faint)]">
          <span className="flex min-w-0 items-center gap-1.5">
            {item.artistName && <span className="truncate font-semibold text-[var(--text-secondary)]">{item.artistName}</span>}
            {item.artistName && <span>·</span>}
            <span className="shrink-0">{relNewsDate(item.date)}</span>
          </span>
          <Stats item={item} />
        </div>
      </div>
    </Link>
  )
}
