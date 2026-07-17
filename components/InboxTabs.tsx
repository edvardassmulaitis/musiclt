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
const TAB_BASE = 'px-3 py-1.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap'
function tabCls(active: boolean) {
  return `${TAB_BASE} ${active ? 'border-blue-600 text-blue-700' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`
}

export default function InboxTabs() {
  const pathname = usePathname()
  const isEvents = pathname?.startsWith('/admin/inbox/events')
  const isAlbums = pathname?.startsWith('/admin/inbox/albums')
  const isDiscovery = pathname?.startsWith('/admin/inbox/discovery')
  const isMissing = pathname?.startsWith('/admin/charts/missing')
  const isNews = !isEvents && !isAlbums && !isDiscovery && !isMissing
  const { counts } = useInboxCounts()
  const newsCount = counts?.news ?? null
  const eventsCount = counts?.events ?? null
  const albumsCount = counts?.albums ?? null
  const discoveryCount = counts?.discovery ?? null
  const missingCount = counts?.missing ?? null

  return (
    <div className="flex flex-wrap gap-1 border-b border-[var(--input-border)] mb-3">
      <Link href="/admin/inbox" className={tabCls(!!isNews)}>
        📰 Naujienos {newsCount !== null && <span className="text-xs opacity-70">({newsCount})</span>}
      </Link>
      <Link href="/admin/inbox/events" className={tabCls(!!isEvents)}>
        🎫 Renginiai {eventsCount !== null && <span className="text-xs opacity-70">({eventsCount})</span>}
      </Link>
      <Link href="/admin/inbox/albums" className={tabCls(!!isAlbums)}>
        💿 Albumai {albumsCount !== null && <span className="text-xs opacity-70">({albumsCount})</span>}
      </Link>
      <Link href="/admin/inbox/discovery" className={tabCls(!!isDiscovery)}>
        🎵 Atradimai {discoveryCount !== null && <span className="text-xs opacity-70">({discoveryCount})</span>}
      </Link>
      <Link href="/admin/charts/missing" className={tabCls(!!isMissing)}>
        📊 Iš topų {missingCount !== null && <span className="text-xs opacity-70">({missingCount})</span>}
      </Link>
    </div>
  )
}
