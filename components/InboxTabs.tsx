'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useInboxCounts } from '@/components/useInboxCounts'

/**
 * InboxTabs su pending count'eriais. 2026-07-17: skaičiai imami iš bendro
 * /api/admin/inbox-counts (useInboxCounts) — tas pats šaltinis kaip viršutinis
 * "📥 Inbox" grand-total badge, tad tab'ai ir badge visada sutampa. Refetch'ina
 * kai pathname keičiasi.
 */
export default function InboxTabs() {
  const pathname = usePathname()
  const isEvents = pathname?.startsWith('/admin/inbox/events')
  const isAlbums = pathname?.startsWith('/admin/inbox/albums')
  const { counts } = useInboxCounts()
  const newsCount = counts?.news ?? null
  const eventsCount = counts?.events ?? null
  const albumsCount = counts?.albums ?? null

  return (
    <div className="flex gap-1 border-b border-[var(--input-border)] mb-3">
      <Link
        href="/admin/inbox"
        className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors ${
          !isEvents && !isAlbums
            ? 'border-blue-600 text-blue-700'
            : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
        }`}>
        📰 Naujienos {newsCount !== null && <span className="text-xs opacity-70">({newsCount})</span>}
      </Link>
      <Link
        href="/admin/inbox/events"
        className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors ${
          isEvents
            ? 'border-blue-600 text-blue-700'
            : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
        }`}>
        🎫 Renginiai {eventsCount !== null && <span className="text-xs opacity-70">({eventsCount})</span>}
      </Link>
      <Link
        href="/admin/inbox/albums"
        className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors ${
          isAlbums
            ? 'border-blue-600 text-blue-700'
            : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
        }`}>
        💿 Albumai {albumsCount !== null && <span className="text-xs opacity-70">({albumsCount})</span>}
      </Link>
    </div>
  )
}
