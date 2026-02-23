'use client'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'

export default function AdminDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      router.push('/auth/signin?callbackUrl=/admin/dashboard')
      return
    }
    if (session.user?.role !== 'admin' && session.user?.role !== 'super_admin') {
      router.push('/auth/forbidden')
    }
  }, [status, session?.user?.role])

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-music-blue border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!session || (session.user?.role !== 'admin' && session.user?.role !== 'super_admin')) {
    return null
  }

  const quickActions = [
    { href: '/admin/artists', icon: '🎤', title: 'Atlikėjai', desc: 'Tvarkyti atlikėjų sąrašą' },
    { href: '/admin/albums', icon: '💿', title: 'Albumai', desc: 'Tvarkyti albumus ir dainas' },
    { href: '/admin/tracks', icon: '🎵', title: 'Dainos', desc: 'Tvarkyti dainų sąrašą' },
    { href: '/admin/users', icon: '👥', title: 'Vartotojai', desc: 'Valdyti vartotojus ir roles' },
    { href: '/admin/settings', icon: '⚙️', title: 'Nustatymai', desc: 'Svetainės nustatymai' },
  ]

  return (
    <div className="min-h-screen">
      <nav className="border-b border-white/10 bg-black/30 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-gray-400 hover:text-white transition-colors text-sm">
              music.lt
            </Link>
            <span className="text-gray-600">/</span>
            <span className="text-white text-sm font-medium">Admin</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">{session.user?.email}</span>
            {session.user?.image && (
              <Image src={session.user.image} alt="" width={28} height={28} className="rounded-full" />
            )}
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              Atsijungti
            </button>
          </div>
        </div>
      </nav>
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-black">Dashboard</h1>
          <p className="text-gray-400 mt-1">
            Sveiki, {session.user?.name}
            {session.user?.role === 'super_admin' && (
              <span className="ml-2 text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">Super Admin</span>
            )}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="group bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl p-5 transition-all"
            >
              <div className="text-3xl mb-3">{action.icon}</div>
              <div className="font-semibold text-white group-hover:text-music-blue transition-colors">{action.title}</div>
              <div className="text-xs text-gray-400 mt-1">{action.desc}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
