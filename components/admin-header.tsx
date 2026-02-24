'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import dynamic from 'next/dynamic'

const AdminSearchModal = dynamic(() => import('./admin-search-modal'), { ssr: false })

export default function AdminHeader() {
  const { data: session } = useSession()
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'
  if (!isAdmin) return null

  return (
    <>
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm">
        <div className="w-full px-6 py-2.5 flex items-center gap-4">
          <Link href="/admin" className="font-black text-gray-900 text-base shrink-0">
            🎵 music.lt
          </Link>

          <button
            onClick={() => setSearchOpen(true)}
            className="flex-1 max-w-sm flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-400 transition-colors text-left">
            <span>🔍</span>
            <span className="flex-1">Ieškoti...</span>
            <kbd className="text-xs bg-white px-1.5 py-0.5 rounded border border-gray-200 text-gray-400 hidden sm:inline">⌘K</kbd>
          </button>

          <nav className="flex items-center gap-1 ml-auto">
            <Link href="/admin/users"
              className="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors">
              👥 <span className="hidden sm:inline">Vartotojai</span>
            </Link>
            <Link href="/admin/settings"
              className="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors">
              ⚙️
            </Link>
          </nav>
        </div>
      </header>

      {searchOpen && <AdminSearchModal onClose={() => setSearchOpen(false)} />}
    </>
  )
}
