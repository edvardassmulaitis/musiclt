'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

export type InboxCounts = {
  news: number
  events: number
  albums: number
  discovery: number
  total: number
}

const EMPTY: InboxCounts = { news: 0, events: 0, albums: 0, discovery: 0, total: 0 }

/**
 * Bendras inbox count'ų šaltinis (viršutinis "📥 Inbox" badge + InboxTabs).
 * Vienas /api/admin/inbox-counts kvietimas → {news, events, albums, total},
 * tad badge, tab'ai IR dashboard'as visada sutampa (visi eina per
 * lib/inbox-counts.ts). Refetch'ina kai pathname keičiasi — t.y. perėjus tarp
 * inbox tab'ų (pvz. ką nors patvirtinus viename tab'e ir grįžus).
 *
 * `counts` = null kol kraunasi (leidžia UI parodyti fallback'ą).
 */
export function useInboxCounts(): { counts: InboxCounts | null } {
  const pathname = usePathname()
  const [counts, setCounts] = useState<InboxCounts | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/inbox-counts')
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        setCounts(d && typeof d.total === 'number' ? d as InboxCounts : EMPTY)
      })
      .catch(() => { if (!cancelled) setCounts(EMPTY) })
    return () => { cancelled = true }
  }, [pathname])

  return { counts }
}
