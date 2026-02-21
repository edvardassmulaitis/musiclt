'use client'

import Link from 'next/link'

export default function VerifyRequestPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="text-7xl mb-6">📧</div>
        <h1 className="text-3xl font-bold mb-3">Patikrinkite el. paštą</h1>
        <p className="text-gray-400 mb-2">
          Išsiuntėme jums prisijungimo nuorodą.
        </p>
        <p className="text-gray-500 text-sm mb-8">
          Nuoroda galioja 24 valandas. Patikrinkite ir Spam aplanką.
        </p>

        <Link
          href="/auth/signin"
          className="inline-block bg-white/5 border border-white/10 text-white px-6 py-3 rounded-xl hover:bg-white/10 transition-colors text-sm"
        >
          ← Grįžti į prisijungimą
        </Link>
      </div>
    </div>
  )
}
