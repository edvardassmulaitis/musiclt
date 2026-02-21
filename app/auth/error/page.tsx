'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

const errorMessages: Record<string, string> = {
  Configuration: 'Serverio konfigūracijos klaida. Susisiekite su administratoriumi.',
  AccessDenied: 'Prieiga uždrausta. Jūsų paskyra neturi teisių.',
  Verification: 'Patvirtinimo nuoroda nebegalioja arba jau panaudota.',
  Default: 'Įvyko klaida prisijungimo metu. Bandykite dar kartą.',
  OAuthSignin: 'Klaida prisijungiant per socialinį tinklą.',
  OAuthCallback: 'Klaida gaunant atsakymą iš socialinio tinklo.',
  OAuthCreateAccount: 'Nepavyko sukurti paskyros per socialinį tinklą.',
  EmailCreateAccount: 'Nepavyko sukurti paskyros su el. paštu.',
  Callback: 'Klaida autentikacijos proceso metu.',
  OAuthAccountNotLinked: 'Šis el. paštas jau naudojamas su kitu prisijungimo būdu.',
}

export default function AuthError() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error') || 'Default'
  const message = errorMessages[error] || errorMessages.Default

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="text-6xl mb-4">⚠️</div>
        <h1 className="text-2xl font-bold mb-4">Prisijungimo klaida</h1>
        <p className="text-gray-400 mb-8">{message}</p>

        <div className="space-y-3">
          <Link
            href="/auth/signin"
            className="block w-full bg-gradient-to-r from-music-blue to-music-orange text-white font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity"
          >
            Bandyti dar kartą
          </Link>
          <Link
            href="/"
            className="block w-full bg-white/5 border border-white/10 text-white font-semibold py-3 rounded-xl hover:bg-white/10 transition-colors"
          >
            Grįžti į pradžią
          </Link>
        </div>

        {process.env.NODE_ENV === 'development' && (
          <p className="mt-6 text-xs text-gray-600">
            Klaidos kodas: <code className="text-red-400">{error}</code>
          </p>
        )}
      </div>
    </div>
  )
}
