'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'

export default function ProfilePage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
    }
  }, [status, router])

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-music-blue border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!session) return null

  return (
    <div className="min-h-screen p-4">
      {/* Header */}
      <header className="max-w-4xl mx-auto flex items-center justify-between py-4 mb-8">
        <Link href="/" className="text-2xl font-black">
          <span className="text-music-blue">music</span>
          <span className="text-music-orange">.lt</span>
        </Link>
        {session.user.role === 'admin' && (
          <Link
            href="/admin/dashboard"
            className="text-sm bg-white/10 px-4 py-2 rounded-lg hover:bg-white/20 transition-colors"
          >
            Admin panelė →
          </Link>
        )}
      </header>

      <div className="max-w-2xl mx-auto">
        {/* Profile card */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-sm">
          <div className="flex items-center gap-6 mb-8">
            {session.user.image ? (
              <Image
                src={session.user.image}
                alt={session.user.name || 'Avatar'}
                width={80}
                height={80}
                className="rounded-full"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-music-blue to-music-orange flex items-center justify-center text-2xl font-bold">
                {session.user.name?.[0]?.toUpperCase() || '?'}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold">{session.user.name || 'Vartotojas'}</h1>
              <p className="text-gray-400">{session.user.email}</p>
              <span className={`inline-block mt-2 text-xs px-3 py-1 rounded-full font-medium ${
                session.user.role === 'admin'
                  ? 'bg-music-orange/20 text-music-orange'
                  : session.user.role === 'moderator'
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'bg-white/10 text-gray-400'
              }`}>
                {session.user.role === 'admin' ? '⭐ Administratorius' :
                 session.user.role === 'moderator' ? '🛡️ Moderatorius' : '👤 Narys'}
              </span>
            </div>
          </div>

          <div className="border-t border-white/10 pt-6">
            <h2 className="text-lg font-semibold mb-4">Paskyros informacija</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-400">El. paštas</dt>
                <dd>{session.user.email}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Rolė</dt>
                <dd className="capitalize">{session.user.role}</dd>
              </div>
            </dl>
          </div>

          {/* Settings shortcuts */}
          <div className="border-t border-white/10 pt-6 mt-6">
            <h2 className="text-lg font-semibold mb-4">Nustatymai</h2>
            <div className="space-y-2">
              <Link
                href="/auth/profile/pranesimai"
                className="flex items-center gap-4 p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors group"
              >
                <div
                  className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(249,115,22,0.15)', color: 'var(--accent-orange, #f97316)' }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white">Pranešimai</div>
                  <div className="text-xs text-gray-400 mt-0.5">Push, komentarai, patiktukai, mėgstami atlikėjai</div>
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 group-hover:text-white transition-colors">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </Link>
            </div>
          </div>

          <div className="mt-8 flex gap-3">
            <Link
              href="/"
              className="flex-1 text-center bg-white/5 border border-white/10 py-2.5 rounded-xl hover:bg-white/10 transition-colors text-sm font-medium"
            >
              ← Pradžia
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="flex-1 bg-red-500/10 border border-red-500/30 text-red-400 py-2.5 rounded-xl hover:bg-red-500/20 transition-colors text-sm font-medium"
            >
              Atsijungti
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
