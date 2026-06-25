'use client'

import { useState, Suspense } from 'react'
import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

const HeadphonesIcon = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
    <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
  </svg>
)

function SignInContent() {
  const searchParams = useSearchParams()
  // Numatytai po prisijungimo → /sveiki (pasveikinimas/apžvalga). Jei vartotojas
  // buvo nukreiptas iš konkretaus puslapio — gerbiam tą callbackUrl.
  const callbackUrl = searchParams.get('callbackUrl') || '/sveiki'
  const [tab, setTab] = useState<'social' | 'email'>('social')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
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
    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError('Nepavyko išsiųsti laiško. Bandyk dar kartą.')
      } else {
        setEmailSent(true)
      }
    } catch {
      setError('Nepavyko išsiųsti laiško. Bandyk dar kartą.')
    } finally {
      setLoading(null)
    }
  }

  const wrap = (children: React.ReactNode) => (
    <div
      style={{
        background: 'var(--bg-body)',
        minHeight: 'calc(100vh - 64px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 20px',
        fontFamily: "'DM Sans',system-ui,sans-serif",
      }}
    >
      <div style={{ width: '100%', maxWidth: 400 }}>{children}</div>
    </div>
  )

  // Brand viršus — orinis apskritimas su ausinukais (kaip /sveiki avataras).
  const brandHead = (title: string, subtitle: string) => (
    <div style={{ textAlign: 'center', marginBottom: 26 }}>
      <div
        style={{
          width: 56, height: 56, borderRadius: '50%', margin: '0 auto 14px',
          background: 'linear-gradient(135deg,#1a73e8,var(--accent-orange))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 24px rgba(249,115,22,.28)',
        }}
      >
        {HeadphonesIcon}
      </div>
      <h1 style={{ fontFamily: 'Outfit,sans-serif', fontSize: 24, fontWeight: 900, letterSpacing: '-.02em', margin: '0 0 6px', color: 'var(--text-primary)' }}>{title}</h1>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>{subtitle}</p>
    </div>
  )

  if (emailSent) {
    return wrap(
      <>
        {brandHead('Patikrink paštą', 'Liko vienas žingsnis')}
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-default)', borderRadius: 18, padding: '28px 24px', textAlign: 'center' }}>
          <div
            style={{
              width: 52, height: 52, borderRadius: '50%', margin: '0 auto 14px',
              background: 'rgba(249,115,22,.12)', border: '1px solid rgba(249,115,22,.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-orange)',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
          </div>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 6px', lineHeight: 1.55 }}>
            Prisijungimo nuorodą išsiuntėme į<br />
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{email}</span>
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '8px 0 0' }}>Nuoroda galioja 24 valandas. Nepamiršk patikrinti ir šlamšto aplanko.</p>
          <button onClick={() => setEmailSent(false)} style={{ marginTop: 18, fontSize: 13, fontWeight: 600, color: 'var(--accent-orange)', background: 'none', border: 'none', cursor: 'pointer' }}>
            ← Grįžti
          </button>
        </div>
      </>
    )
  }

  return wrap(
    <>
      {brandHead('Prisijunk prie music.lt', 'Atlikėjai, topai, koncertai ir bendruomenė — viskas vienoje vietoje.')}

      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-default)', borderRadius: 18, overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)' }}>
          {([['social', 'Socialiniai'], ['email', 'El. paštas']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                flex: 1, padding: '13px 0', fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
                background: tab === key ? 'var(--bg-surface)' : 'transparent',
                color: tab === key ? 'var(--text-primary)' : 'var(--text-muted)',
                border: 'none',
                borderBottom: tab === key ? '2px solid var(--accent-orange)' : '2px solid transparent',
                transition: 'all .15s',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ padding: 22 }}>
          {tab === 'social' ? (
            <button
              onClick={() => handleSocial('google')}
              disabled={loading !== null}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                background: '#fff', color: '#1a1a1a', fontWeight: 600, fontSize: 14.5, padding: '13px 18px',
                borderRadius: 12, border: '1px solid rgba(0,0,0,.1)', cursor: 'pointer', opacity: loading ? 0.6 : 1,
              }}
            >
              {loading === 'google' ? (
                <span style={{ width: 20, height: 20, border: '2px solid #ccc', borderTopColor: '#555', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
              )}
              Tęsti su Google
            </button>
          ) : (
            <form onSubmit={handleEmail} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>El. pašto adresas</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vardas@paštas.lt"
                  required
                  style={{
                    width: '100%', background: 'var(--input-bg)', border: '1px solid var(--input-border)',
                    borderRadius: 12, padding: '12px 14px', color: 'var(--input-text)', fontSize: 14, outline: 'none',
                  }}
                />
              </div>
              {error && <p style={{ color: '#ef4444', fontSize: 12, margin: 0 }}>{error}</p>}
              <button
                type="submit"
                disabled={loading === 'email' || !email}
                style={{
                  width: '100%', background: 'var(--accent-orange)', color: '#fff', fontWeight: 700, fontSize: 14.5,
                  padding: '13px 0', borderRadius: 12, border: 'none', cursor: 'pointer',
                  opacity: loading === 'email' || !email ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                {loading === 'email' ? <span style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,.5)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} /> : null}
                Gauti prisijungimo nuorodą
              </button>
              <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-faint)', margin: 0 }}>
                Išsiųsime prisijungimo nuorodą — slaptažodžio nereikia.
              </p>
            </form>
          )}
        </div>
      </div>

      <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-faint)', marginTop: 20 }}>
        Prisijungdami sutinkate su{' '}
        <a href="/privatumas" style={{ color: 'var(--accent-orange)', textDecoration: 'none' }}>privatumo politika</a>
      </p>
      <p style={{ textAlign: 'center', marginTop: 12 }}>
        <Link href="/" style={{ fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none' }}>Grįžti į pradžią</Link>
      </p>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  )
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: 32, height: 32, border: '2px solid var(--accent-orange)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /></div>}>
      <SignInContent />
    </Suspense>
  )
}
