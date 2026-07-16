'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * InboxTabs su pending count'eriais. Fetch'ina abu candidates endpoint'us
 * count'ams. Cached per tab open session — refetch'inam tik kai pathname
 * keičiasi.
 */
export default function InboxTabs() {
  const pathname = usePathname()
  const isEvents = pathname?.startsWith('/admin/inbox/events')
  const isAlbums = pathname?.startsWith('/admin/inbox/albums')
  const [newsCount, setNewsCount] = useState<number | null>(null)
  const [eventsCount, setEventsCount] = useState<number | null>(null)
  const [albumsCount, setAlbumsCount] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    // 2026-06-11: news count = preview+pending (tas pats query kaip inbox
    // puslapio sąrašas) — anksčiau čia buvo tik 'pending' ir skaičiai
    // nesutapdavo su tuo, kas matosi tab'e.
    Promise.all([
      fetch('/api/admin/news-candidates?status=preview,pending&limit=1').then(r => r.json()).catch(() => null),
      fetch('/api/admin/event-candidates?status=pending&limit=1').then(r => r.json()).catch(() => null),
      fetch('/api/admin/wiki-album-candidates?status=pending&limit=1').then(r => r.json()).catch(() => null),
    ]).then(([n, e, a]) => {
      if (cancelled) return
      setNewsCount(n?.total ?? 0)
      setEventsCount(e?.total ?? 0)
      setAlbumsCount(a?.total ?? 0)
    })
    return () => { cancelled = true }
  }, [pathname])

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
