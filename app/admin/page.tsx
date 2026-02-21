'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import Link from 'next/link'

export default function AdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'loading') return

    if (session?.user.role === 'admin') {
      router.push('/admin/dashboard')
    } else if (session && session.user.role !== 'admin') {
      router.push('/auth/forbidden')
    }
    // Jei neprisijungęs - middleware peradresuos į /auth/signin
  }, [session, status, router])

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-music-blue border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="text-6xl mb-4">🎵</div>
        <h1 className="text-4xl font-black mb-2">
          <span className="text-music-blue">music</span>
          <span className="text-music-orange">.lt</span>
        </h1>
        <p className="text-gray-400 mb-8">Admin Panel</p>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-sm">
          <p className="text-gray-300 mb-6">
            Admin panelė prieinama tik autorizuotiems administratoriams.
          </p>
          <Link
            href="/auth/signin?callbackUrl=/admin/dashboard"
            className="block w-full bg-gradient-to-r from-music-blue to-music-orange text-white font-bold py-3 rounded-xl hover:opacity-90 transition-opacity"
          >
            Prisijungti
          </Link>
          <Link
            href="/"
            className="block mt-3 text-gray-500 hover:text-white text-sm transition-colors"
          >
            ← Grįžti į pradžią
          </Link>
        </div>
      </div>
    </div>
  )
}
