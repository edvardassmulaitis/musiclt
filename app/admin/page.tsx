'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function AdminDashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [counts, setCounts] = useState<{
    artists: number; albums: number; tracks: number; news: number; events: number; venues: number
    top_pending: number
  } | null>(null)

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  useEffect(() => { if (status === 'unauthenticated') router.push('/') }, [status])

  useEffect(() => {
    if (!isAdmin) return
    Promise.all([
      fetch('/api/artists?limit=1').then(r => r.json()),
      fetch('/api/albums?limit=1').then(r => r.json()),
      fetch('/api/tracks?limit=1').then(r => r.json()),
      fetch('/api/news?limit=1').then(r => r.json()),
      fetch('/api/events?limit=1&showPast=true').then(r => r.json()),
      fetch('/api/top/suggestions?status=pending').then(r => r.json()),
      fetch('/api/venues').then(r => r.json()),
    ]).then(([ar, al, tr, nw, ev, sg, vn]) => {
      setCounts({
        artists: ar.total || 0,
        albums: al.total || 0,
        tracks: tr.total || 0,
        news: nw.total || 0,
        events: ev.total || 0,
        top_pending: sg.suggestions?.length || 0,
        venues: vn.venues?.length || 0,
      })
    })
  }, [isAdmin])

  if (status === 'loading' || !isAdmin) return null

  const items = [
    { href: '/admin/artists', newHref: '/admin/artists/new', icon: '🎤', label: 'Atlikėjai', count: counts?.artists },
    { href: '/admin/albums', newHref: '/admin/albums/new', icon: '💿', label: 'Albumai', count: counts?.albums },
    { href: '/admin/tracks', newHref: '/admin/tracks/new', icon: '🎵', label: 'Dainos', count: counts?.tracks },
    { href: '/admin/news', newHref: '/admin/news/new', icon: '📰', label: 'Naujienos', count: counts?.news },
    { href: '/admin/events', newHref: '/admin/events/new', icon: '📅', label: 'Renginiai', count: counts?.events },
    { href: '/admin/venues', newHref: '/admin/venues/new', icon: '📍', label: 'Vietos', count: counts?.venues },
    { href: '/admin/voting', newHref: '/admin/voting', icon: '🗳️', label: 'Balsavimai' },
    { href: '/admin/boombox', newHref: '/admin/boombox', icon: '🎛️', label: 'Boombox' },
  ]

  return (
    <div className="min-h-screen bg-[var(--bg-elevated)]">
      <div className="w-full px-6 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl">

          {items.map(item => (
            <div key={item.href} className="bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-xl overflow-hidden">
              <Link href={item.href} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors">
                <span className="text-xl">{item.icon}</span>
                <span className="font-semibold text-[var(--text-primary)]">{item.label}</span>
                {item.count !== undefined && (
                  <span className="ml-auto text-xs text-[var(--text-muted)] bg-[var(--bg-elevated)] px-2 py-0.5 rounded-full">
                    {item.count}
                  </span>
                )}
              </Link>
              <Link href={item.newHref}
                className="flex items-center justify-center gap-1 w-full py-2 text-xs text-music-blue border-t border-[var(--border-subtle)] hover:bg-[var(--hover-blue)] transition-colors">
                + Naujas
              </Link>
            </div>
          ))}

          {/* TOP sąrašai */}
          <div className="bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-xl overflow-hidden sm:col-span-3">
            <Link href="/admin/top" className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors">
              <span className="text-xl">🏆</span>
              <span className="font-semibold text-[var(--text-primary)]">TOP sąrašai</span>
              <span className="text-xs text-[var(--text-muted)] ml-1">TOP 40 · LT TOP 30</span>
              {counts?.top_pending !== undefined && counts.top_pending > 0 && (
                <span className="ml-auto text-xs font-bold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">
                  {counts.top_pending} laukia
                </span>
              )}
            </Link>
            <div className="flex border-t border-[var(--border-subtle)]">
              <Link href="/admin/top?type=top40"
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs text-music-blue hover:bg-[var(--hover-blue)] transition-colors border-r border-[var(--border-subtle)]">
                🌍 TOP 40
              </Link>
              <Link href="/admin/top?type=lt_top30"
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs text-music-blue hover:bg-[var(--hover-blue)] transition-colors">
                🇱🇹 LT TOP 30
              </Link>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
