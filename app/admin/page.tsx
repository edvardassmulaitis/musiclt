'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function AdminDashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [counts, setCounts] = useState<{
    artists: number; albums: number; tracks: number; news: number; events: number
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
      fetch('/api/events?limit=1').then(r => r.json()),
      fetch('/api/top/suggestions?status=pending').then(r => r.json()),
    ]).then(([ar, al, tr, nw, ev, sg]) => {
      setCounts({
        artists: ar.total || 0,
        albums: al.total || 0,
        tracks: tr.total || 0,
        news: nw.total || 0,
        events: ev.total || 0,
        top_pending: sg.suggestions?.length || 0,
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
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full px-6 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl">

          {items.map(item => (
            <div key={item.href} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <Link href={item.href} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                <span className="text-xl">{item.icon}</span>
                <span className="font-semibold text-gray-800">{item.label}</span>
                {item.count !== undefined && (
                  <span className="ml-auto text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                    {item.count}
                  </span>
                )}
              </Link>
              <Link href={item.newHref}
                className="flex items-center justify-center gap-1 w-full py-2 text-xs text-music-blue border-t border-gray-100 hover:bg-blue-50 transition-colors">
                + Naujas
              </Link>
            </div>
          ))}

          {/* TOP sąrašai */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden sm:col-span-3">
            <Link href="/admin/top" className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
              <span className="text-xl">🏆</span>
              <span className="font-semibold text-gray-800">TOP sąrašai</span>
              <span className="text-xs text-gray-400 ml-1">TOP 40 · LT TOP 30</span>
              {counts?.top_pending !== undefined && counts.top_pending > 0 && (
                <span className="ml-auto text-xs font-bold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">
                  {counts.top_pending} laukia
                </span>
              )}
            </Link>
            <div className="flex border-t border-gray-100">
              <Link href="/admin/top?type=top40"
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs text-music-blue hover:bg-blue-50 transition-colors border-r border-gray-100">
                🌍 TOP 40
              </Link>
              <Link href="/admin/top?type=lt_top30"
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs text-music-blue hover:bg-blue-50 transition-colors">
                🇱🇹 LT TOP 30
              </Link>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
