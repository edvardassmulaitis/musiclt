'use client'

import { useState, useEffect, Suspense } from 'react'
import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

function SignInContent() {
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/'
  const [tab, setTab] = useState<'social'|'email'>('social')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState<string|null>(null)
  const [emailSent, setEmailSent] = useState(false)
  const [error, setError] = useState('')

  const handleSocial = async (provider: string) => {
    setLoading(provider)
    await signIn(provider, { callbackUrl })
  }

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setLoading('email')
    setError('')
    const result = await signIn('email', { email, callbackUrl, redirect: false })
    setLoading(null)
    if (result?.error) {
      setError('Klaida siunčiant laišką. Bandykite dar kartą.')
    } else {
      setEmailSent(true)
    }
  }

  if (emailSent) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-950">
        <div className="bg-gray-900 border border-white/10 rounded-2xl p-10 w-full max-w-sm text-center shadow-2xl">
          <div className="text-5xl mb-4">📧</div>
          <h2 className="text-xl font-black text-white mb-2">Patikrinkite paštą</h2>
          <p className="text-gray-400 text-sm mb-6">
            Išsiuntėme prisijungimo nuorodą į <span className="text-white font-medium">{email}</span>
          </p>
          <p className="text-gray-600 text-xs">Nuoroda galioja 24 valandas</p>
          <button onClick={() => setEmailSent(false)} className="mt-6 text-sm text-music-blue hover:underline">
            Grįžti atgal
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-950">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="text-3xl font-black">
            <span className="text-music-blue">music</span>
            <span className="text-music-orange">.lt</span>
          </Link>
          <p className="text-gray-500 text-sm mt-2">Prisijunkite prie bendruomenes</p>
        </div>

        <div className="bg-gray-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
          <div className="flex border-b border-white/10">
            <button onClick={() => setTab('social')}
              className={`flex-1 py-3 text-sm font-bold transition-colors ${tab==='social'?'text-white bg-white/5':'text-gray-500 hover:text-gray-300'}`}>
              Socialiniai
            </button>
            <button onClick={() => setTab('email')}
              className={`flex-1 py-3 text-sm font-bold transition-colors ${tab==='email'?'text-white bg-white/5':'text-gray-500 hover:text-gray-300'}`}>
              El. pastas
            </button>
          </div>

          <div className="p-6">
            {tab === 'social' ? (
              <div className="space-y-3">
                <button onClick={() => handleSocial('google')} disabled={loading !== null}
                  className="w-full flex items-center justify-center gap-3 bg-white text-gray-900 font-semibold py-3 px-5 rounded-xl hover:bg-gray-100 transition-colors disabled:opacity-60">
                  {loading === 'google' ? <span className="w-5 h-5 border-2 border-gray-400 border-t-gray-900 rounded-full animate-spin" /> : (
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                  )}
                  Testi su Google
                </button>
                <button onClick={() => handleSocial('facebook')} disabled={loading !== null}
                  className="w-full flex items-center justify-center gap-3 bg-[#1877F2] text-white font-semibold py-3 px-5 rounded-xl hover:bg-[#166FE5] transition-colors disabled:opacity-60">
                  {loading === 'facebook' ? <span className="w-5 h-5 border-2 border-blue-300 border-t-white rounded-full animate-spin" /> : (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                  )}
                  Testi su Facebook
                </button>
              </div>
            ) : (
              <form onSubmit={handleEmail} className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">El. pasto adresas</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jusu@email.com"
                    required
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-music-blue transition-colors"
                  />
                </div>
                {error && <p className="text-red-400 text-xs">{error}</p>}
                <button type="submit" disabled={loading === 'email' || !email}
                  className="w-full bg-music-blue hover:bg-blue-600 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                  {loading === 'email' ? <span className="w-5 h-5 border-2 border-blue-300 border-t-white rounded-full animate-spin" /> : null}
                  Gauti prisijungimo nuoroda
                </button>
                <p className="text-center text-xs text-gray-600">
                  Issiusime magic link i jusu pasta
                </p>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-gray-700 mt-6">
          Prisijungdami sutinkate su{' '}
          <a href="/privatumas" className="text-music-blue hover:underline">privatumo politika</a>
        </p>
        <p className="text-center mt-4">
          <Link href="/" className="text-sm text-gray-600 hover:text-white transition-colors">Grizti i pradzia</Link>
        </p>
      </div>
    </div>
  )
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-music-blue border-t-transparent rounded-full animate-spin" /></div>}>
      <SignInContent />
    </Suspense>
  )
}
