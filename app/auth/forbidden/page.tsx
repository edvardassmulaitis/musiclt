'use client'

import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'

export default function ForbiddenPage() {
  const { data: session } = useSession()

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="text-7xl mb-4">🚫</div>
        <h1 className="text-3xl font-bold mb-3">Prieiga uždrausta</h1>
        <p className="text-gray-400 mb-2">
          Ši sritis prieinama tik administratoriams.
        </p>
        {session && (
          <p className="text-gray-500 text-sm mb-8">
            Jūsų paskyra ({session.user.email}) neturi reikalingų teisių.
          </p>
        )}

        <div className="space-y-3">
          <Link
            href="/"
            className="block w-full bg-gradient-to-r from-music-blue to-music-orange text-white font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity"
          >
            Grįžti į pradžią
          </Link>
          {session && (
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="block w-full bg-white/5 border border-white/10 text-gray-400 py-3 rounded-xl hover:bg-white/10 transition-colors text-sm"
            >
              Atsijungti
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
