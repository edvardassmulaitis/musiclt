'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function InboxTabs() {
  const pathname = usePathname()
  const isEvents = pathname?.startsWith('/admin/inbox/events')

  return (
    <div className="flex gap-1 border-b border-[var(--input-border)] mb-4">
      <Link
        href="/admin/inbox"
        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
          !isEvents
            ? 'border-blue-600 text-blue-700'
            : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
        }`}>
        📰 Naujienos
      </Link>
      <Link
        href="/admin/inbox/events"
        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
          isEvents
            ? 'border-blue-600 text-blue-700'
            : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
        }`}>
        🎫 Renginiai
      </Link>
    </div>
  )
}
