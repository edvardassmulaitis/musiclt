'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { signIn, signOut, useSession } from 'next-auth/react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import { useSite } from '@/components/SiteContext'

// ── THEME TOGGLE ──────────────────────────────────────────────────────────────
// Šviesi/tamsi tema. Naudojam dviem pavidalais: pilno pločio eilutė profilio
// dropdown'e (prisijungusiems) + ikonos mygtukas šalia „Prisijungti"
// (neregistruotiems). Vienas šaltinis — useSite() (cookie + data-theme).

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  )
}
function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

/** Pilno pločio eilutė profilio dropdown'e. */
function ThemeToggleRow({ onDone }: { onDone?: () => void }) {
  const { dk, setTheme } = useSite()
  return (
    <button
      onClick={() => { setTheme(dk ? 'light' : 'dark'); onDone?.() }}
      className="flex w-full items-center gap-3 mx-1.5 px-2.5 py-2 rounded-lg text-[13.5px] font-medium transition-all text-left"
      style={{ width: 'calc(100% - 0.75rem)', color: 'var(--text-secondary)' }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement
        el.style.color = 'var(--text-primary)'
        el.style.background = 'var(--bg-hover)'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement
        el.style.color = 'var(--text-secondary)'
        el.style.background = 'transparent'
      }}
    >
      <span
        className="flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0"
        style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}
      >
        {dk ? <SunIcon /> : <MoonIcon />}
      </span>
      {dk ? 'Šviesi tema' : 'Tamsi tema'}
    </button>
  )
}

/** Ikonos mygtukas — neregistruotiems (šalia „Prisijungti"). */
function ThemeToggleButton() {
  const { dk, setTheme } = useSite()
  return (
    <button
      onClick={() => setTheme(dk ? 'light' : 'dark')}
      aria-label={dk ? 'Įjungti šviesią temą' : 'Įjungti tamsią temą'}
      title={dk ? 'Šviesi tema' : 'Tamsi tema'}
      className="hidden min-[1081px]:flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-all"
      style={{ color: 'var(--text-muted)', background: 'var(--bg-hover)' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}
    >
      {dk ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}

// ── AUTH MODAL ──────────────────────────────────────────────────────────────

function AuthModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)
  const [email, setEmail] = useState('')

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)

    // Lock background scroll — overflow:hidden on <html> preserves scroll pos
    // and doesn't create a new containing block (unlike position:fixed on body)
    document.documentElement.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKey)
      document.documentElement.style.overflow = ''
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
    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        console.error('Magic link error:', data.error)
      } else {
        setEmailSent(true)
      }
    } catch (err) {
      console.error('Magic link fetch error:', err)
    } finally {
      setLoading(null)
    }
  }

  // Portal to document.body so the modal escapes the header's
  // backdrop-filter containing block (which breaks fixed positioning)
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(10px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl overflow-hidden"
        style={{ background: 'var(--modal-bg)', border: '1px solid var(--modal-border)', boxShadow: 'var(--modal-shadow)' }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full text-sm transition-all"
          style={{ color: 'var(--text-muted)', background: 'var(--bg-hover)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        >✕</button>

        <div
          className="px-7 pt-7 pb-5"
          style={{ background: 'linear-gradient(180deg, rgba(249,115,22,0.08), transparent)' }}
        >
          <div className="font-black text-2xl mb-1">
            <span style={{ color: 'var(--text-primary)' }}>music</span>
            <span style={{ color: 'var(--accent-orange)' }}>.lt</span>
          </div>
          <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Prisijunk prie Lietuvos muzikos bendruomenės</p>
        </div>

        {emailSent ? (
          <div className="px-7 pb-8 text-center">
            <div className="text-4xl mb-4">📬</div>
            <h3 className="font-black text-lg mb-2" style={{ color: 'var(--text-primary)' }}>Patikrink el. paštą</h3>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Išsiuntėme prisijungimo nuorodą į<br />
              <span style={{ color: 'var(--text-secondary)' }}>{email}</span>
            </p>
            <button
              onClick={onClose}
              className="mt-6 w-full h-11 rounded-xl font-black text-sm transition-all"
              style={{ background: 'var(--accent-orange)', color: 'var(--text-primary)' }}
            >
              Gerai
            </button>
          </div>
        ) : (
          <div className="px-7 pb-7 space-y-2.5">
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
              Tęsti su Google
            </button>


            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
              <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>arba el. paštu</span>
              <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
            </div>

            <form onSubmit={handleEmail} className="space-y-2.5">
              <input
                type="email"
                placeholder="tavo@pastas.lt"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full h-11 rounded-xl px-4 text-sm focus:outline-none transition-all"
                style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--input-text)' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(249,115,22,0.7)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--input-border)')}
              />
              <button
                type="submit"
                disabled={loading !== null}
                className="w-full h-11 rounded-xl font-black text-[13px] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: 'var(--accent-orange)', color: 'var(--text-primary)' }}
              >
                {loading === 'email'
                  ? <span className="w-4 h-4 border-2 border-orange-200 border-t-white rounded-full animate-spin" />
                  : 'Gauti prisijungimo nuorodą'}
              </button>
            </form>

            <p className="text-center text-[11px] pt-1" style={{ color: 'var(--text-faint)' }}>
              Prisijungdamas sutinki su{' '}
              <a href="/privatumas" className="transition-colors" style={{ color: 'var(--accent-link)' }}>privatumo politika</a>
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

// ── USER MENU ───────────────────────────────────────────────────────────────

function UserMenu() {
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)
  const [username, setUsername] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Username viešo profilio nuorodai — užkraunam pirmą kartą atidarius meniu.
  useEffect(() => {
    if (!open || username) return
    fetch('/api/profile').then(r => r.json()).then(d => { if (d?.username) setUsername(d.username) }).catch(() => {})
  }, [open, username])

  if (!session?.user) return null
  const isAdmin = ['editor', 'admin', 'super_admin'].includes(session.user.role || '')

  const menuItem = (href: string, icon: React.ReactNode, label: string, accent?: boolean) => {
    const fg = accent ? 'var(--accent-orange)' : 'var(--text-secondary)'
    return (
      <Link
        href={href}
        onClick={() => setOpen(false)}
        className="group/mi flex items-center gap-3 mx-1.5 px-2.5 py-2 rounded-lg text-[13.5px] font-medium transition-all"
        style={{ color: fg }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLElement
          el.style.color = accent ? 'var(--accent-orange)' : 'var(--text-primary)'
          el.style.background = 'var(--bg-hover)'
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLElement
          el.style.color = fg
          el.style.background = 'transparent'
        }}
      >
        <span
          className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors flex-shrink-0"
          style={{
            background: accent ? 'rgba(249,115,22,0.13)' : 'var(--bg-hover)',
            color: accent ? 'var(--accent-orange)' : 'var(--text-muted)',
          }}
        >
          {icon}
        </span>
        {label}
      </Link>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full transition-all"
        style={{ background: open ? 'var(--bg-hover)' : 'transparent' }}
        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)')}
        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = open ? 'var(--bg-hover)' : 'transparent')}
      >
        {session.user.image ? (
          // Paprastas <img> + proxyImg: next/image reikalauja domeno
          // whitelist'o (remotePatterns), tad legacy music.lt avatarai (pvz.
          // impersonuojant ghost-narį) per next/image lūždavo → „?". proxyImg
          // music.lt URL'us paleidžia per weserv.nl, kitus (Google/FB) palieka.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={proxyImg(session.user.image)}
            alt={session.user.name || ''}
            width={32} height={32}
            referrerPolicy="no-referrer"
            className="w-8 h-8 rounded-full object-cover"
            style={{ boxShadow: open ? '0 0 0 2px var(--accent-orange)' : '0 0 0 2px rgba(255,255,255,0.18)' }}
          />
        ) : (
          <div
            className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-orange-500 flex items-center justify-center text-xs font-black text-white"
            style={{ boxShadow: open ? '0 0 0 2px var(--accent-orange)' : '0 0 0 2px rgba(255,255,255,0.18)' }}
          >
            {session.user.name?.[0]?.toUpperCase() || '?'}
          </div>
        )}
        <svg
          className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          style={{ color: 'var(--text-muted)' }}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-64 rounded-2xl overflow-hidden z-50"
          style={{
            background: 'var(--modal-bg)',
            border: '1px solid var(--modal-border)',
            boxShadow: '0 16px 48px -12px rgba(0,0,0,0.55), 0 4px 12px -4px rgba(0,0,0,0.4)',
          }}
        >
          {/* User info */}
          <div
            className="flex items-center gap-3 px-4 pt-4 pb-3.5"
            style={{
              borderBottom: '1px solid var(--border-subtle)',
              background: 'linear-gradient(180deg, rgba(249,115,22,0.06), transparent)',
            }}
          >
            {session.user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={proxyImg(session.user.image)}
                alt={session.user.name || ''}
                width={42} height={42}
                referrerPolicy="no-referrer"
                className="w-[42px] h-[42px] rounded-full object-cover flex-shrink-0"
                style={{ boxShadow: '0 0 0 2px var(--modal-bg), 0 0 0 3px rgba(249,115,22,0.5)' }}
              />
            ) : (
              <div
                className="w-[42px] h-[42px] rounded-full bg-gradient-to-br from-blue-600 to-orange-500 flex items-center justify-center text-sm font-black text-white flex-shrink-0"
                style={{ boxShadow: '0 0 0 2px var(--modal-bg), 0 0 0 3px rgba(249,115,22,0.5)' }}
              >
                {session.user.name?.[0]?.toUpperCase() || '?'}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{session.user.name}</div>
              {isAdmin ? (
                <span
                  className="inline-flex items-center gap-1 mt-1 text-[10px] px-2 py-0.5 rounded-full font-bold"
                  style={{ background: 'rgba(249,115,22,0.15)', color: 'var(--accent-orange)' }}
                >
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 7.1-1.01z"/></svg>
                  {session.user.role === 'super_admin' ? 'Super Admin' : session.user.role === 'editor' ? 'Redaktorius' : 'Admin'}
                </span>
              ) : (
                <div className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>{session.user.email}</div>
              )}
            </div>
          </div>

          {/* Main links */}
          <div className="py-1.5">
            {menuItem(username ? `/vartotojas/${username}` : '/auth/profile', (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            ), 'Mano profilis')}
            {menuItem('/mano-muzika', (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            ), 'Mano muzika', true)}
            {menuItem('/blogas/mano', (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            ), 'Mano blogas')}
            {menuItem('/blogas/rasyti', (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
            ), 'Rašyti straipsnį')}
            {menuItem('/auth/profile', (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            ), 'Paskyra ir nustatymai')}
          </div>

          {/* Admin section */}
          {isAdmin && (
            <div style={{ borderTop: '1px solid var(--border-subtle)' }} className="py-1.5">
              {menuItem('/admin', (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              ), 'Admin panelė', true)}
            </div>
          )}

          {/* Theme toggle — šviesi/tamsi tema */}
          <div style={{ borderTop: '1px solid var(--border-subtle)' }} className="py-1.5">
            <ThemeToggleRow onDone={() => setOpen(false)} />
          </div>

          {/* Logout */}
          <div style={{ borderTop: '1px solid var(--border-subtle)' }} className="py-1.5">
            <button
              onClick={() => { setOpen(false); signOut({ callbackUrl: '/' }) }}
              className="w-full flex items-center gap-3 mx-1.5 px-2.5 py-2 rounded-lg text-[13.5px] font-medium transition-all text-left"
              style={{ width: 'calc(100% - 0.75rem)', color: 'var(--text-secondary)' }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement
                el.style.background = 'rgba(239,68,68,0.1)'
                el.style.color = '#f87171'
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement
                el.style.background = 'transparent'
                el.style.color = 'var(--text-secondary)'
              }}
            >
              <span
                className="flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </span>
              Atsijungti
            </button>
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
      <div className="flex items-center gap-2">
        {/* Tema keičiama ir neregistruotiems — ikona šalia „Prisijungti". */}
        <ThemeToggleButton />
        <button
          onClick={() => setShowModal(true)}
          className="flex-shrink-0 font-bold px-5 py-2 rounded-full text-[13px] transition-all shadow-md hover:scale-[1.02] whitespace-nowrap"
          style={{ background: 'var(--accent-orange)', color: 'var(--text-primary)' }}
        >
          Prisijungti
        </button>
      </div>
      {showModal && <AuthModal onClose={() => setShowModal(false)} />}
    </>
  )
}
