'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function AdminDashboard() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [stats, setStats] = useState([
    { label: 'Atlikėjai', value: '0', icon: '🎤', color: 'from-blue-500 to-blue-600' },
    { label: 'Albumai', value: '0', icon: '💿', color: 'from-purple-500 to-purple-600' },
    { label: 'Dainos', value: '0', icon: '🎵', color: 'from-green-500 to-green-600' },
    { label: 'Naujienos', value: '0', icon: '📰', color: 'from-orange-500 to-orange-600' },
  ])

  useEffect(() => {
    setMounted(true)
    const isLoggedIn = localStorage.getItem('admin_logged_in')
    if (!isLoggedIn) {
      router.push('/admin')
      return
    }

    // Load real counts from localStorage
    const loadCounts = () => {
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
    }

    loadCounts()

    // Refresh counts every 2 seconds to catch updates
    const interval = setInterval(loadCounts, 2000)
    return () => clearInterval(interval)
  }, [router])

  const handleLogout = () => {
    localStorage.removeItem('admin_logged_in')
    router.push('/admin')
  }

  if (!mounted) return null

  const menuItems = [
    { title: 'Atlikėjai', icon: '🎤', href: '/admin/artists', description: 'Pridėti ir valdyti atlikėjus' },
    { title: 'Albumai', icon: '💿', href: '/admin/albums', description: 'Albumų katalogas' },
    { title: 'Dainos', icon: '🎵', href: '/admin/songs', description: 'Dainų duomenų bazė' },
    { title: 'Naujienos', icon: '📰', href: '/admin/news', description: 'Straipsniai ir naujienos' },
    { title: 'Renginiai', icon: '📅', href: '/admin/events', description: 'Koncertai ir festivaliai' },
    { title: 'Vartotojai', icon: '👥', href: '/admin/users', description: 'Narių valdymas' },
    { title: 'Nustatymai', icon: '⚙️', href: '/admin/settings', description: 'API diagnostika ir duomenų eksportas' },
  ]

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-4xl font-black mb-2">
              <span className="text-music-blue">music</span>
              <span className="text-music-orange">.lt</span>
              <span className="text-gray-400 text-2xl ml-4">Admin</span>
            </h1>
            <p className="text-gray-400">Turinio valdymo sistema</p>
          </div>
          <button
            onClick={handleLogout}
            className="px-6 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors"
          >
            Atsijungti
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {stats.map((stat, index) => (
            <div
              key={index}
              className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all"
            >
              <div className={`text-4xl mb-4 bg-gradient-to-r ${stat.color} w-16 h-16 rounded-xl flex items-center justify-center`}>
                {stat.icon}
              </div>
              <div className="text-3xl font-black mb-1">{stat.value}</div>
              <div className="text-sm text-gray-400">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Menu Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {menuItems.map((item, index) => (
            <Link
              key={index}
              href={item.href}
              className="bg-white/5 border border-white/10 rounded-2xl p-8 hover:bg-white/10 hover:border-music-blue hover:scale-105 transition-all cursor-pointer group"
            >
              <div className="text-5xl mb-4 group-hover:scale-110 transition-transform">
                {item.icon}
              </div>
              <h3 className="text-2xl font-bold mb-2 text-music-blue">
                {item.title}
              </h3>
              <p className="text-gray-400 text-sm">
                {item.description}
              </p>
            </Link>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="mt-12 bg-gradient-to-r from-music-blue/10 to-music-orange/10 border border-music-blue/30 rounded-2xl p-8">
          <h2 className="text-2xl font-bold mb-4">🚀 Greitos nuorodos</h2>
          <div className="flex gap-4 flex-wrap">
            <Link
              href="/admin/artists/new"
              className="px-6 py-3 bg-music-blue rounded-lg hover:opacity-90 transition-opacity"
            >
              + Naujas atlikėjas
            </Link>
            <Link
              href="/admin/albums/new"
              className="px-6 py-3 bg-purple-600 rounded-lg hover:opacity-90 transition-opacity"
            >
              + Naujas albumas
            </Link>
            <Link
              href="/admin/news/new"
              className="px-6 py-3 bg-orange-600 rounded-lg hover:opacity-90 transition-opacity"
            >
              + Nauja naujiena
            </Link>
            <Link
              href="/"
              target="_blank"
              className="px-6 py-3 bg-white/10 border border-white/20 rounded-lg hover:bg-white/20 transition-colors"
            >
              👁️ Peržiūrėti svetainę
            </Link>
          </div>
        </div>

      </div>
    </div>
  )
}
