'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'

export default function AdminDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [stats, setStats] = useState([
    { label: 'Atlikėjai', value: '0', icon: '🎤', color: 'from-blue-500 to-blue-600' },
    { label: 'Albumai', value: '0', icon: '💿', color: 'from-purple-500 to-purple-600' },
    { label: 'Dainos', value: '0', icon: '🎵', color: 'from-green-500 to-green-600' },
    { label: 'Naujienos', value: '0', icon: '📰', color: 'from-orange-500 to-orange-600' },
  ])

  useEffect(() => {
    if (status === 'loading') return
    if (!session || session.user.role !== 'admin') {
      router.push('/auth/signin?callbackUrl=/admin/dashboard')
      return
    }

    // Load counts (TODO: replace with Supabase queries)
    const artists = JSON.parse(localStorage.getItem('artists') || '[]')
    const albums = JSON.parse(localStorage.getItem('albums') || '[]')
    const songs = JSON.parse(localStorage.getItem('songs') || '[]')
    const news = JSON.parse(localStorage.getItem('news') || '[]')

    setStats([
      { label: 'Atlikėjai', value: artists.length.toString(), icon: '🎤', color: 'from-blue-500 to-blue-600' },
      { label: 'Albumai', value: albums.length.toString(), icon: '💿', color: 'from-purple-500 to-purple-600' },
      { label: 'Dainos', value: songs.length.toString(), icon: '🎵', color: 'from-green-500 to-green-600' },
      { label: 'Naujienos', value: news.length.toString(), icon: '📰', color: 'from-orange-500 to-orange-600' },
    ])
  }, [session, status, router])

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-music-blue border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!session) return null

  return (
    <div className="min-h-screen">
      {/* Top Nav */}
      <nav className="border-b border-white/10 bg-black/30 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-xl font-black">
              <span className="text-music-blue">music</span>
              <span className="text-music-orange">.lt</span>
            </Link>
            <span className="text-gray-600">/</span>
            <span className="text-gray-300 text-sm">Admin</span>
          </div>

          {/* User menu */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {session.user.image ? (
                <Image
                  src={session.user.image}
                  alt={session.user.name || ''}
                  width={32}
                  height={32}
                  className="rounded-full"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-music-blue to-music-orange flex items-center justify-center text-xs font-bold">
                  {session.user.name?.[0]?.toUpperCase() || 'A'}
                </div>
              )}
              <span className="text-sm text-gray-300 hidden sm:block">
                {session.user.name || session.user.email}
              </span>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="text-sm text-gray-400 hover:text-white bg-white/5 px-3 py-1.5 rounded-lg transition-colors"
            >
              Atsijungti
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold">
            Sveiki, {session.user.name?.split(' ')[0] || 'Admin'}! 👋
          </h1>
          <p className="text-gray-400 mt-1">music.lt valdymo panelė</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="bg-white/5 border border-white/10 rounded-xl p-5 hover:bg-white/8 transition-colors"
            >
              <div className="text-3xl mb-2">{stat.icon}</div>
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="text-gray-400 text-sm">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {[
            { href: '/admin/artists/new', icon: '🎤', title: 'Pridėti atlikėją', desc: 'Naujas atlikėjas į katalogą' },
            { href: '/admin/artists', icon: '📋', title: 'Atlikėjų sąrašas', desc: 'Valdyti esamus atlikėjus' },
            { href: '/admin/settings', icon: '⚙️', title: 'Nustatymai', desc: 'Svetainės konfigūracija' },
          ].map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="group bg-white/5 border border-white/10 rounded-xl p-6 hover:bg-white/10 hover:border-white/20 transition-all"
            >
              <div className="text-3xl mb-3">{action.icon}</div>
              <h3 className="font-semibold group-hover:text-music-blue transition-colors">
                {action.title}
              </h3>
              <p className="text-gray-400 text-sm mt-1">{action.desc}</p>
            </Link>
          ))}
        </div>

        {/* Admin info */}
        <div className="bg-white/3 border border-white/5 rounded-xl p-4 text-sm text-gray-500">
          <strong className="text-gray-400">Prisijungta kaip:</strong> {session.user.email} •{' '}
          <span className="text-music-orange">⭐ Administratorius</span>
        </div>
      </div>
    </div>
  )
}
