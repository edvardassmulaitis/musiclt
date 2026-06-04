'use client'

import { useSession } from 'next-auth/react'
import { useState } from 'react'

/**
 * Visada matoma juosta viršuje, kai super_admin yra prisijungęs „kaip" kitas
 * vartotojas. Mygtukas „Grįžti į savo paskyrą" kviečia
 * useSession().update({ impersonate: null }) — JWT callback atstato originalią
 * super_admin tapatybę (žr. lib/auth.ts).
 */
export function ImpersonationBanner() {
  const { data: session, update } = useSession()
  const [loading, setLoading] = useState(false)

  if (!session?.user?.impersonating) return null

  const stop = async () => {
    setLoading(true)
    await update({ impersonate: null })
    // Pilnas reload — kad serverio komponentai persikrautų su atstatyta tapatybe.
    window.location.href = '/admin/users'
  }

  return (
    <div
      role="alert"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        flexWrap: 'wrap',
        padding: '8px 16px',
        background: '#b91c1c',
        color: '#fff',
        fontSize: 13,
        fontWeight: 600,
        boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        {/* inline SVG — projektas neturi ikonų bibliotekos */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 11l-3 3-1.5-1.5" />
        </svg>
        Žiūrite kaip{' '}
        <strong>{session.user.name || session.user.email}</strong>
        {session.impersonatorEmail ? (
          <span style={{ opacity: 0.8, fontWeight: 400 }}>
            ({session.impersonatorEmail})
          </span>
        ) : null}
      </span>
      <button
        onClick={stop}
        disabled={loading}
        style={{
          background: '#fff',
          color: '#b91c1c',
          border: 'none',
          borderRadius: 6,
          padding: '4px 12px',
          fontSize: 12,
          fontWeight: 700,
          cursor: loading ? 'default' : 'pointer',
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? 'Grįžtama…' : 'Grįžti į savo paskyrą'}
      </button>
    </div>
  )
}
