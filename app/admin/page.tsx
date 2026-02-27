'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
export default function AdminDashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [counts, setCounts] = useState<{ artists: number; albums: number; tracks: number; news: number } | null>(null)
  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'
  useEffect(() => { if (status === 'unauthenticated') router.push('/') }, [status])
  useEffect(() => {
    if (!isAdmin) return
    Promise.all([
      fetch('/api/artists?limit=1').then(r => r.json()),
      fetch('/api/albums?limit=1').then(r => r.json()),
      fetch('/api/tracks?limit=1').then(r => r.json()),
      fetch('/api/news?limit=1').then(r => r.json()),
    ]).then(([ar, al, tr, nw]) => {
      setCounts({ artists: ar.total || 0, albums: al.total || 0, tracks: tr.total || 0, news: nw.total || 0 })
    })
  }, [isAdmin])
  if (status === 'loading' || !isAdmin) return null
  const items = [
    { href: '/admin/artists', newHref: '/admin/artists/new', icon: '🎤', label: 'Atlikėjai', count: counts?.artists },
    { href: '/admin/albums', newHref: '/admin/albums/new', icon: '💿', label: 'Albumai', count: counts?.albums },
    { href: '/admin/tracks', newHref: '/admin/tracks/new', icon: '🎵', label: 'Dainos', count: counts?.tracks },
    { href: '/admin/news', newHref: '/admin/news/new', icon: '📰', label: 'Naujienos', count: counts?.news },
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
        </div>
      </div>
    </div>
  )
}
