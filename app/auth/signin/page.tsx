'use client'

import { signIn, getSession } from 'next-auth/react'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function SignInContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [emailSent, setEmailSent] = useState(false)
  const [showEmail, setShowEmail] = useState(false)
  const callbackUrl = searchParams.get('callbackUrl') || '/'

  useEffect(() => {
    getSession().then((session) => {
      if (session) router.push(callbackUrl)
    })
  }, [router, callbackUrl])

  const handleSignIn = async (provider: string) => {
    setLoading(provider)
    await signIn(provider, { callbackUrl })
  }

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading('email')
    const result = await signIn('email', {
      email,
      callbackUrl,
      redirect: false,
    })
    setLoading(null)
    if (result?.ok) setEmailSent(true)
  }

  if (emailSent) {
    return (
      <div className="max-w-md w-full text-center">
        <div className="text-6xl mb-4">📧</div>
        <h1 className="text-2xl font-bold mb-3">Patikrinkite el. paštą</h1>
        <p className="text-gray-400 mb-6">
          Išsiuntėme prisijungimo nuorodą į <strong className="text-white">{email}</strong>
        </p>
        <button
          onClick={() => { setEmailSent(false); setEmail('') }}
          className="text-sm text-gray-500 hover:text-white transition-colors"
        >
          ← Grįžti
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-md w-full">
      {/* Logo */}
      <div className="text-center mb-10">
        <div className="text-6xl mb-4">🎵</div>
        <h1 className="text-4xl font-black">
          <span className="text-music-blue">music</span>
          <span className="text-music-orange">.lt</span>
        </h1>
        <p className="text-gray-400 mt-2">Prisijunkite prie bendruomenės</p>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-sm">
        <h2 className="text-2xl font-bold mb-2 text-center">Prisijungti</h2>
        <p className="text-gray-400 text-sm text-center mb-8">
          Naudokite esamą paskyrą – registracija automatinė
        </p>

        <div className="space-y-4">
          {/* Google */}
          <button
            onClick={() => handleSignIn('google')}
            disabled={loading !== null}
            className="w-full flex items-center justify-center gap-3 bg-white text-gray-900 font-semibold py-3.5 px-6 rounded-xl hover:bg-gray-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading === 'google' ? (
              <span className="w-5 h-5 border-2 border-gray-400 border-t-gray-900 rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            Tęsti su Google
          </button>

          {/* Facebook */}
          <button
            onClick={() => handleSignIn('facebook')}
            disabled={loading !== null}
            className="w-full flex items-center justify-center gap-3 bg-[#1877F2] text-white font-semibold py-3.5 px-6 rounded-xl hover:bg-[#166FE5] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading === 'facebook' ? (
              <span className="w-5 h-5 border-2 border-blue-300 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            )}
            Tęsti su Facebook
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 my-2">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-gray-500">arba</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Email */}
          {!showEmail ? (
            <button
              onClick={() => setShowEmail(true)}
              disabled={loading !== null}
              className="w-full flex items-center justify-center gap-3 bg-white/5 border border-white/10 text-white font-semibold py-3.5 px-6 rounded-xl hover:bg-white/10 transition-colors disabled:opacity-60"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Tęsti su el. paštu
            </button>
          ) : (
            <form onSubmit={handleEmailSignIn} className="space-y-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jusu@elpastas.lt"
                required
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-music-blue transition-colors text-white placeholder-gray-500"
              />
              <button
                type="submit"
                disabled={loading !== null || !email}
                className="w-full bg-gradient-to-r from-music-blue to-music-orange text-white font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {loading === 'email' ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Siunčiama...
                  </span>
                ) : 'Gauti prisijungimo nuorodą'}
              </button>
              <button
                type="button"
                onClick={() => setShowEmail(false)}
                className="w-full text-sm text-gray-500 hover:text-white transition-colors py-1"
              >
                ← Atgal
              </button>
            </form>
          )}
        </div>

        <div className="mt-8 pt-6 border-t border-white/10 text-center text-xs text-gray-500">
          Prisijungdami sutinkate su{' '}
          <a href="/privatumas" className="text-music-blue hover:underline">
            privatumo politika
          </a>
        </div>
      </div>

      <p className="text-center text-gray-500 text-sm mt-6">
        <a href="/" className="hover:text-white transition-colors">
          ← Grįžti į pradžią
        </a>
      </p>
    </div>
  )
}

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Suspense fallback={
        <div className="w-8 h-8 border-2 border-music-blue border-t-transparent rounded-full animate-spin" />
      }>
        <SignInContent />
      </Suspense>
    </div>
  )
}
