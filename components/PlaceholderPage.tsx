'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

/* ──────────────────────────────────────────────────────────────────
 * Bendra "Greitai" page'o template'ė. Naudojama kol konkretus
 * skirtukas (žanrai, kvizai, festivaliai, ...) dar nėra pilnai
 * implementuotas — bet menyje jau yra link'as.
 *
 * Naudojimas:
 *   <PlaceholderPage
 *     title="Žaidimai"
 *     subtitle="Muzikiniai iššūkiai..."
 *     accent="#6366f1"
 *     icon={<svg .../>}
 *     features={[
 *       { title: 'Atspėk dainą', desc: '...' },
 *       ...
 *     ]}
 *   />
 * ────────────────────────────────────────────────────────────────── */

export type PlaceholderFeature = {
  title: string
  desc: string
  icon?: ReactNode
}

export function PlaceholderPage({
  title,
  subtitle,
  accent = '#6366f1',
  icon,
  features = [],
  exploreLinks = [],
}: {
  title: string
  subtitle: string
  accent?: string
  icon: ReactNode
  features?: PlaceholderFeature[]
  exploreLinks?: { label: string; href: string }[]
}) {
  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '60px 24px 100px' }}>

      {/* Hero */}
      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 88,
            height: 88,
            borderRadius: 24,
            background: accent,
            color: '#fff',
            marginBottom: 24,
            boxShadow: `0 16px 40px ${accent}55, 0 4px 14px rgba(0,0,0,0.1)`,
          }}
        >
          <span style={{ display: 'flex' }}>{icon}</span>
        </div>

        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 12px',
            borderRadius: 999,
            background: `${accent}1a`,
            color: accent,
            fontSize: 11,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            marginBottom: 18,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: accent,
              animation: 'plh-pulse 1.6s infinite',
            }}
          />
          Greitai
        </div>

        <h1
          style={{
            fontSize: 'clamp(32px, 5vw, 48px)',
            fontWeight: 900,
            letterSpacing: '-0.025em',
            color: 'var(--text-primary)',
            marginBottom: 14,
            lineHeight: 1.05,
          }}
        >
          {title}
        </h1>

        <p
          style={{
            fontSize: 17,
            lineHeight: 1.5,
            color: 'var(--text-secondary)',
            maxWidth: 580,
            margin: '0 auto',
          }}
        >
          {subtitle}
        </p>
      </div>

      {/* Features grid */}
      {features.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 14,
            marginBottom: 56,
          }}
        >
          {features.map((f, i) => (
            <div
              key={i}
              style={{
                padding: 22,
                borderRadius: 16,
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                transition: 'transform .2s, border-color .2s, box-shadow .2s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.borderColor = accent + '66'
                e.currentTarget.style.boxShadow = `0 8px 28px ${accent}1a`
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = ''
                e.currentTarget.style.borderColor = ''
                e.currentTarget.style.boxShadow = ''
              }}
            >
              {f.icon && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: `${accent}1a`,
                    color: accent,
                    marginBottom: 14,
                  }}
                >
                  {f.icon}
                </div>
              )}
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  marginBottom: 6,
                }}
              >
                {f.title}
              </div>
              <div
                style={{
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: 'var(--text-muted)',
                }}
              >
                {f.desc}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Explore links */}
      {exploreLinks.length > 0 && (
        <div
          style={{
            textAlign: 'center',
            paddingTop: 32,
            borderTop: '1px solid var(--border-default)',
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--text-muted)',
              marginBottom: 14,
            }}
          >
            Tuo tarpu apžiūrėk
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              justifyContent: 'center',
            }}
          >
            {exploreLinks.map(l => (
              <Link
                key={l.href}
                href={l.href}
                style={{
                  padding: '9px 16px',
                  borderRadius: 999,
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  textDecoration: 'none',
                  transition: 'background .15s, color .15s, border-color .15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'var(--bg-hover)'
                  e.currentTarget.style.color = 'var(--text-primary)'
                  e.currentTarget.style.borderColor = 'var(--border-strong)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'var(--bg-surface)'
                  e.currentTarget.style.color = 'var(--text-secondary)'
                  e.currentTarget.style.borderColor = ''
                }}
              >
                {l.label} →
              </Link>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes plh-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.6; transform: scale(1.4); }
        }
      `}</style>
    </div>
  )
}
