'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function AdminDashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  if (status === 'loading') return null
  if (!isAdmin) { router.push('/'); return null }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full px-6 py-8">
        <h1 className="text-xl font-black text-gray-900 mb-6">👋 Sveiki, {session?.user?.name?.split(' ')[0] || 'admin'}</h1>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl">
          {[
            { href: '/admin/artists', newHref: '/admin/artists/new', icon: '🎤', label: 'Atlikėjai' },
            { href: '/admin/albums', newHref: '/admin/albums/new', icon: '💿', label: 'Albumai' },
            { href: '/admin/tracks', newHref: '/admin/tracks/new', icon: '🎵', label: 'Dainos' },
          ].map(item => (
            <div key={item.href} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <Link href={item.href} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                <span className="text-xl">{item.icon}</span>
                <span className="font-semibold text-gray-800">{item.label}</span>
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
