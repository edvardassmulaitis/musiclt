'use client'

import { useState, useRef, useEffect } from 'react'
import { signIn, signOut, useSession } from 'next-auth/react'
import Link from 'next/link'

function AuthModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState<string | null>(null)

  const handleSignIn = async (provider: string) => {
    setLoading(provider)
    await signIn(provider, { callbackUrl: window.location.href })
  }

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', handleKey); document.body.style.overflow = '' }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gray-900 border border-white/10 rounded-2xl p-8 w-full max-w-sm shadow-2xl">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors text-xl leading-none">&times;</button>
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🎵</div>
          <h2 className="text-2xl font-black"><span className="text-music-blue">music</span><span className="text-music-orange">.lt</span></h2>
          <p className="text-gray-400 text-sm mt-1">Prisijunkite prie bendruomenes</p>
        </div>
        <div className="space-y-3">
          <button onClick={() => handleSignIn('google')} disabled={loading !== null}
            className="w-full flex items-center justify-center gap-3 bg-white text-gray-900 font-semibold py-3 px-5 rounded-xl hover:bg-gray-100 transition-colors disabled:opacity-60">
            {loading === 'google' ? <span className="w-5 h-5 border-2 border-gray-400 border-t-gray-900 rounded-full animate-spin" /> : (
              <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            Testi su Google
          </button>
          <button onClick={() => handleSignIn('facebook')} disabled={loading !== null}
            className="w-full flex items-center justify-center gap-3 bg-[#1877F2] text-white font-semibold py-3 px-5 rounded-xl hover:bg-[#166FE5] transition-colors disabled:opacity-60">
            {loading === 'facebook' ? <span className="w-5 h-5 border-2 border-blue-300 border-t-white rounded-full animate-spin" /> : (
              <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            )}
            Testi su Facebook
          </button>
        </div>
        <p className="text-center text-xs text-gray-600 mt-6">
          Prisijungdami sutinkate su <a href="/privatumas" className="text-music-blue hover:underline">privatumo politika</a>
        </p>
      </div>
    </div>
  )
}

function Avatar({ name, email, image }: { name?: string | null, email?: string | null, image?: string | null }) {
  const initials = name?.[0]?.toUpperCase() || email?.[0]?.toUpperCase() || '?'
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image} alt={name || ''} width={32} height={32} className="w-8 h-8 rounded-full ring-2 ring-white/20 object-cover" referrerPolicy="no-referrer" />
    )
  }
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-music-blue to-music-orange flex items-center justify-center text-xs font-black text-white select-none">
      {initials}
    </div>
  )
}

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
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 hover:opacity-80 transition-opacity">
        <Avatar name={session.user.name} email={session.user.email} image={session.user.image} />
        <svg className={`w-3 h-3 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 bg-gray-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-white/10">
            <div className="text-sm font-semibold text-white truncate">{session.user.name}</div>
            <div className="text-xs text-gray-400 truncate">{session.user.email}</div>
            {isAdmin && (
              <span className="inline-block mt-1 text-[10px] bg-music-orange/20 text-music-orange px-2 py-0.5 rounded-full font-bold">
                {session.user.role === 'super_admin' ? 'Super Admin' : 'Admin'}
              </span>
            )}
          </div>
          <div className="py-1">
            <Link href="/auth/profile" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors">
              <span>👤</span> Mano profilis
            </Link>
            {isAdmin && (
              <Link href="/admin/dashboard" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-music-orange hover:bg-white/5 transition-colors font-medium">
                <span>⚙️</span> Admin panele
              </Link>
            )}
            <div className="border-t border-white/10 mt-1 pt-1">
              <button onClick={() => { setOpen(false); signOut({ callbackUrl: '/' }) }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-white/5 transition-colors">
                <span>🚪</span> Atsijungti
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function HeaderAuth() {
  const { data: session, status } = useSession()
  const [showModal, setShowModal] = useState(false)

  if (status === 'loading') return <div className="w-8 h-8 rounded-full bg-white/10 animate-pulse" />
  if (session?.user) return <UserMenu />

  return (
    <>
      <button onClick={() => setShowModal(true)} className="px-3 py-1.5 text-[13px] text-gray-400 hover:text-white transition-colors">Prisijungti</button>
      <button onClick={() => setShowModal(true)} className="px-4 py-1.5 text-[13px] bg-music-orange hover:bg-orange-500 text-white rounded-full font-bold transition-colors">Registruotis</button>
      {showModal && <AuthModal onClose={() => setShowModal(false)} />}
    </>
  )
}
