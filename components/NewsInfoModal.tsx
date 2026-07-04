'use client'
// components/NewsInfoModal.tsx
//
// Lightweight news modal — atitinka song/album modal pattern'ą:
//   • Portal'd to document.body
//   • Fixed h-[90vh] / sm:h-[85vh]
//   • Bottom sheet mobile / centered card desktop / left-aligned lg:
//   • Tabs: Tekstas / Komentarai
//
// Data fetch'inam iš /api/news/{id}. Naujienoms naudojam EntityCommentsBlock
// su entityType="discussion" arba "news" (priklauso nuo legacy_kind).

import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import EntityCommentsBlock from '@/components/EntityCommentsBlock'

type NewsDetails = {
  id: number
  slug?: string
  title: string
  body?: string | null
  content_html?: string | null
  cover_image_url?: string | null
  source_url?: string | null
  published_at?: string | null
  first_post_at?: string | null
  legacy_kind?: string | null
  legacy_id?: number | null
  artist?: { id: number; slug: string; name: string } | null
  artist2?: { id: number; slug: string; name: string } | null
}

export type NewsPreview = {
  id: number | string
  slug?: string
  title: string
  cover_image_url?: string | null
  legacy_id?: number | null
}

export default function NewsInfoModal({
  news, onClose,
}: {
  news: NewsPreview | null
  onClose: () => void
}) {
  const [details, setDetails] = useState<NewsDetails | null>(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'text' | 'comments'>('text')
  const bodyScrollRef = useRef<HTMLDivElement>(null)

  // Reset scroll on tab change
  useEffect(() => {
    bodyScrollRef.current?.scrollTo({ top: 0 })
  }, [tab])

  // Reset tab when news changes
  useEffect(() => {
    setTab('text')
  }, [news?.id])

  // Fetch details
  useEffect(() => {
    if (!news) { setDetails(null); return }
    let cancelled = false
    setLoading(true)
    fetch(`/api/news/${news.id}`)
      .then(r => r.ok ? r.json() : null)
      .then((d) => {
        if (cancelled) return
        if (d) setDetails(d)
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [news?.id])

  // ESC + body scroll lock
  useEffect(() => {
    if (!news) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const scrollY = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.left = '0'
    document.body.style.right = '0'
    document.body.style.width = '100%'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.left = ''
      document.body.style.right = ''
      document.body.style.width = ''
      window.scrollTo(0, scrollY)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [news?.id])

  if (!news) return null
  if (typeof document === 'undefined') return null

  const titleNow = details?.title || news.title || 'Naujiena'
  const coverNow = details?.cover_image_url || news.cover_image_url || null
  const body = details?.content_html || details?.body || ''
  const publishedAt = details?.published_at || details?.first_post_at || null
  const dateLabel = publishedAt ? (() => {
    const d = new Date(publishedAt)
    if (isNaN(d.getTime())) return null
    const ltMonths = ['sausio','vasario','kovo','balandžio','gegužės','birželio','liepos','rugpjūčio','rugsėjo','spalio','lapkričio','gruodžio']
    return `${d.getFullYear()} m. ${ltMonths[d.getMonth()]} ${d.getDate()} d.`
  })() : null

  // Comments entity type — legacy news → discussion (saved as discussions row).
  const isLegacy = !!details?.legacy_kind || !!details?.legacy_id || !!news.legacy_id
  const commentsEntityType: 'news' | 'discussion' = isLegacy ? 'discussion' : 'news'
  const commentsEntityId = details?.id || (typeof news.id === 'number' ? news.id : Number(news.id))

  // External link target
  const externalSlug = details?.slug || news.slug
  const externalHref = isLegacy
    ? `/diskusijos/${externalSlug || `tema/${details?.legacy_id || news.legacy_id}`}`
    : `/news/${externalSlug || details?.id}`

  return createPortal(
    <div
      className={[
        'fixed inset-0 z-[9999] flex items-end justify-center backdrop-blur-sm sm:items-center',
        'bg-black/60 sm:bg-black/30',
        'lg:justify-start lg:pl-[10%]',
      ].join(' ')}
      role="dialog"
      aria-modal="true"
      aria-label={`${titleNow} — naujiena`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ fontFamily: "'DM Sans',system-ui,sans-serif" }}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className={[
          'flex w-full flex-col overflow-hidden bg-[var(--bg-surface)] shadow-[0_24px_60px_-10px_rgba(0,0,0,0.5)]',
          'h-[90vh] rounded-t-2xl',
          'sm:h-[85vh] sm:rounded-2xl sm:mx-4 sm:max-w-[720px]',
        ].join(' ')}
      >
        {/* Mobile handle */}
        <div className="flex shrink-0 justify-center pt-2 pb-1 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-[var(--border-default)]" />
        </div>

        {/* Header */}
        <div className="flex shrink-0 items-center gap-2.5 border-b border-[var(--border-subtle)] px-4 py-2">
          <div className="min-w-0 flex-1">
            <div className="font-['Outfit',sans-serif] text-[12px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              Naujiena
            </div>
            <div className="line-clamp-2 font-['Outfit',sans-serif] text-[14.5px] font-extrabold leading-tight text-[var(--text-primary)] sm:text-[15.5px]">
              {titleNow}
            </div>
            {dateLabel && (
              <div className="mt-0.5 truncate text-[13px] text-[var(--text-muted)]">{dateLabel}</div>
            )}
          </div>
          <Link
            href={externalHref}
            target="_blank"
            rel="noopener"
            title="Atidaryti pilną puslapį"
            aria-label="Atidaryti pilną puslapį"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          >
            <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 3h7v7M21 3l-9 9M5 5h6M5 5v14h14v-6" />
            </svg>
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Uždaryti"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          >
            <svg viewBox="0 0 16 16" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        {/* Cover image */}
        {coverNow && (
          <div className="aspect-[16/9] max-h-[260px] w-full shrink-0 overflow-hidden bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={proxyImg(coverNow)} alt={titleNow} referrerPolicy="no-referrer" className="h-full w-full object-cover" />
          </div>
        )}

        {/* Tabs */}
        <div className="flex shrink-0 items-center gap-4 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-1.5">
          <button
            type="button"
            onClick={() => setTab('text')}
            className={[
              "relative flex items-center gap-1.5 px-1 py-1 font-['Outfit',sans-serif] text-[14px] font-bold transition-colors",
              tab === 'text'
                ? 'text-[var(--accent-orange)] after:absolute after:inset-x-0 after:-bottom-[8px] after:h-[2px] after:bg-[var(--accent-orange)]'
                : 'text-[var(--text-muted)]',
            ].join(' ')}
          >
            Tekstas
          </button>
          <button
            type="button"
            onClick={() => setTab('comments')}
            className={[
              "relative flex items-center gap-1.5 px-1 py-1 font-['Outfit',sans-serif] text-[14px] font-bold transition-colors",
              tab === 'comments'
                ? 'text-[var(--accent-orange)] after:absolute after:inset-x-0 after:-bottom-[8px] after:h-[2px] after:bg-[var(--accent-orange)]'
                : 'text-[var(--text-muted)]',
            ].join(' ')}
          >
            Komentarai
          </button>
        </div>

        {/* Body */}
        <div ref={bodyScrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          <div className={tab === 'text' ? 'block' : 'hidden'}>
            {loading && !details ? (
              <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-10 text-center text-[14px] text-[var(--text-faint)]">
                Kraunama…
              </div>
            ) : body ? (
              <div
                className="text-[14.5px] leading-[1.7] text-[var(--text-secondary)] [&_a]:text-[var(--accent-orange)] [&_a]:no-underline hover:[&_a]:underline [&_p]:mb-3 [&_img]:my-3 [&_img]:rounded-lg [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-[16px] [&_h2]:font-extrabold [&_h2]:text-[var(--text-primary)]"
                dangerouslySetInnerHTML={{ __html: body }}
              />
            ) : (
              <div className="text-[14px] text-[var(--text-faint)]">Teksto nėra.</div>
            )}

            {/* Related artists */}
            {(details?.artist || details?.artist2) && (
              <div className="mt-5 border-t border-[var(--border-subtle)] pt-4">
                <div className="mb-2 font-['Outfit',sans-serif] text-[13px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  Susiję atlikėjai
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {[details.artist, details.artist2].filter(Boolean).map((a: any) => (
                    <Link
                      key={a.id}
                      href={`/atlikejai/${a.slug}`}
                      className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-1 font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--text-secondary)] no-underline transition-colors hover:border-[var(--accent-orange)] hover:text-[var(--accent-orange)]"
                    >
                      {a.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* External source */}
            {details?.source_url && (
              <div className="mt-5 border-t border-[var(--border-subtle)] pt-4">
                <a
                  href={details.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--accent-orange)] no-underline hover:underline"
                >
                  Originalus šaltinis
                  <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 3h7v7M21 3l-9 9M5 5h6M5 5v14h14v-6" />
                  </svg>
                </a>
              </div>
            )}
          </div>
          <div className={tab === 'comments' ? 'block' : 'hidden'}>
            {commentsEntityId ? (
              <EntityCommentsBlock
                entityType={commentsEntityType}
                entityId={commentsEntityId}
                compact
                title="Komentarai"
              />
            ) : (
              <div className="text-[14px] text-[var(--text-faint)]">Kraunama…</div>
            )}
          </div>
        </div>
      </aside>
    </div>,
    document.body,
  )
}
