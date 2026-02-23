'use client'

import { useState, useRef, useEffect } from 'react'
import { signIn, signOut, useSession } from 'next-auth/react'
import Image from 'next/image'
import Link from 'next/link'

// ── AUTH MODAL ──────────────────────────────────────────────────────────────

function AuthModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)
  const [email, setEmail] = useState('')

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const handleOAuth = async (provider: 'google' | 'facebook') => {
    setLoading(provider)
    await signIn(provider, { callbackUrl: window.location.href })
  }

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setLoading('email')
    await signIn('email', { email, callbackUrl: window.location.href, redirect: false })
    setLoading(null)
    setEmailSent(true)
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(10px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl overflow-hidden"
        style={{ background: '#0d1320', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full text-sm transition-all"
          style={{ color: '#4a6580', background: 'rgba(255,255,255,0.06)' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#f2f4f8')}
          onMouseLeave={e => (e.currentTarget.style.color = '#4a6580')}
        >✕</button>

        {/* Logo */}
        <div className="px-7 pt-7 pb-5">
          <div className="font-black text-2xl mb-1">
            <span style={{ color: '#f2f4f8' }}>music</span>
            <span className="text-orange-400">.lt</span>
          </div>
          <p className="text-[13px]" style={{ color: '#4a6580' }}>Prisijunk prie Lietuvos muzikos bendruomenes</p>
        </div>

        {emailSent ? (
          <div className="px-7 pb-8 text-center">
            <div className="text-4xl mb-4">📬</div>
            <h3 className="font-black text-lg mb-2" style={{ color: '#f2f4f8' }}>Patikrink el. paštą</h3>
            <p className="text-sm" style={{ color: '#4a6580' }}>
              Išsiuntėme prisijungimo nuorodą į<br />
              <span style={{ color: '#c8d8f0' }}>{email}</span>
            </p>
            <button
              onClick={onClose}
              className="mt-6 w-full h-11 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-black text-sm transition-all"
            >
              Gerai
            </button>
          </div>
        ) : (
          <div className="px-7 pb-7 space-y-2.5">
            {/* Google — pirmas */}
            <button
              onClick={() => handleOAuth('google')}
              disabled={loading !== null}
              className="w-full h-11 rounded-xl text-[13px] font-semibold transition-all flex items-center justify-center gap-3 disabled:opacity-50"
              style={{ background: 'white', color: '#1a1a1a' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f1f1f1')}
              onMouseLeave={e => (e.currentTarget.style.background = 'white')}
            >
              {loading === 'google' ? (
                <span className="w-4 h-4 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )}
              Testi su Google
            </button>

            {/* Facebook — antras */}
            <button
              onClick={() => handleOAuth('facebook')}
              disabled={loading !== null}
              className="w-full h-11 rounded-xl text-[13px] font-semibold transition-all flex items-center justify-center gap-3 disabled:opacity-50"
              style={{ background: '#1877F2', color: 'white' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#166FE5')}
              onMouseLeave={e => (e.currentTarget.style.background = '#1877F2')}
            >
              {loading === 'facebook' ? (
                <span className="w-4 h-4 border-2 border-blue-300 border-t-white rounded-full animate-spin" />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              )}
              Testi su Facebook
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
              <span className="text-[11px]" style={{ color: '#2a3a50' }}>arba el. paštu</span>
              <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
            </div>

            {/* Magic link email */}
            <form onSubmit={handleEmail} className="space-y-2.5">
              <input
                type="email"
                placeholder="tavo@pastas.lt"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full h-11 rounded-xl px-4 text-sm focus:outline-none transition-all"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#c8d8f0' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(29,78,216,0.7)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)')}
              />
              <button
                type="submit"
                disabled={loading !== null}
                className="w-full h-11 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-black text-[13px] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading === 'email'
                  ? <span className="w-4 h-4 border-2 border-orange-200 border-t-white rounded-full animate-spin" />
                  : 'Gauti prisijungimo nuoroda'}
              </button>
            </form>

            <p className="text-center text-[11px] pt-1" style={{ color: '#2a3a50' }}>
              Prisijungdamas sutinki su{' '}
              <a href="/privatumas" className="hover:text-blue-400 transition-colors">privatumo politika</a>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── USER MENU ───────────────────────────────────────────────────────────────

function UserMenu() {
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (!session?.user) return null
  const isAdmin = session.user.role === 'admin' || session.user.role === 'super_admin'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
      >
        {session.user.image ? (
          <Image
            src={session.user.image}
            alt={session.user.name || ''}
            width={32} height={32}
            className="rounded-full ring-2 ring-white/20"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-orange-500 flex items-center justify-center text-xs font-black text-white">
            {session.user.name?.[0]?.toUpperCase() || '?'}
          </div>
        )}
        <svg
          className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
          style={{ color: '#4a6580' }}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-52 rounded-xl overflow-hidden shadow-2xl z-50"
          style={{ background: '#0d1320', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="text-sm font-semibold truncate" style={{ color: '#f2f4f8' }}>{session.user.name}</div>
            <div className="text-xs truncate mt-0.5" style={{ color: '#4a6580' }}>{session.user.email}</div>
            {isAdmin && (
              <span
                className="inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded-full font-bold"
                style={{ background: 'rgba(249,115,22,0.15)', color: '#fb923c' }}
              >
                {session.user.role === 'super_admin' ? '★ Super Admin' : '★ Admin'}
              </span>
            )}
          </div>
          <div className="py-1">
            <Link
              href="/auth/profile"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
              style={{ color: '#8aa8cc' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f2f4f8'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#8aa8cc'; (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              👤 Mano profilis
            </Link>
            {isAdmin && (
              <Link
                href="/admin/dashboard"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors"
                style={{ color: '#fb923c' }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)')}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
              >
                ⚙️ Admin panele
              </Link>
            )}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }} className="mt-1 pt-1">
              <button
                onClick={() => { setOpen(false); signOut({ callbackUrl: '/' }) }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left"
                style={{ color: '#f87171' }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)')}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
              >
                🚪 Atsijungti
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── MAIN EXPORT ─────────────────────────────────────────────────────────────

export function HeaderAuth() {
  const { data: session, status } = useSession()
  const [showModal, setShowModal] = useState(false)

  if (status === 'loading') {
    return <div className="w-8 h-8 rounded-full animate-pulse" style={{ background: 'rgba(255,255,255,0.08)' }} />
  }

  if (session?.user) {
    return <UserMenu />
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="flex-shrink-0 bg-orange-500 hover:bg-orange-400 text-white font-bold px-5 py-2 rounded-full text-[13px] transition-all shadow-md hover:scale-[1.02] whitespace-nowrap"
      >
        Prisijungti
      </button>
      {showModal && <AuthModal onClose={() => setShowModal(false)} />}
    </>
  )
}
