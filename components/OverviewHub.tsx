'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

/* ──────────────────────────────────────────────────────────────────
 * Overview hub page — used kaip "stop'as" tarp top navigation ir
 * konkrečių sub-page'ų. Pvz. /muzika overview rodo tiles į
 * /atlikejai, /albumai, /topas, /dienos-daina, /zanrai.
 *
 * Kiekvienas tile'as turi accent spalvą, ikoną, title, description
 * ir optional stat badge. Tile'ai gradient kortelės, hover lift +
 * accent glow šešėlis.
 * ────────────────────────────────────────────────────────────────── */

export type HubTile = {
  label: string
  href: string
  desc: string
  accent: string                // hex color
  icon: ReactNode
  stat?: string                 // "12,847 atlikėjų" arba pan.
  soon?: boolean
  big?: boolean                 // jei true — tile'as užima 2 columns
}

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `${r}, ${g}, ${b}`
}

export function OverviewHub({
  title,
  subtitle,
  accent = '#f59e0b',
  icon,
  tiles,
}: {
  title: string
  subtitle: string
  accent?: string
  icon: ReactNode
  tiles: HubTile[]
}) {
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px 80px' }}>

      {/* Hero — su section ikona + accent glow */}
      <div style={{ position: 'relative', marginBottom: 40 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 18,
          marginBottom: 8,
        }}>
          <div
            style={{
              width: 56, height: 56,
              borderRadius: 16,
              background: `linear-gradient(135deg, ${accent} 0%, ${accent}cc 100%)`,
              color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 14px 36px ${accent}55, inset 0 1px 0 rgba(255,255,255,0.25)`,
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
          <h1 style={{
            fontSize: 'clamp(32px, 5vw, 44px)',
            fontWeight: 900,
            letterSpacing: '-0.025em',
            color: 'var(--text-primary)',
            lineHeight: 1.05,
            margin: 0,
          }}>
            {title}
          </h1>
        </div>
        <p style={{
          fontSize: 17,
          lineHeight: 1.5,
          color: 'var(--text-secondary)',
          margin: '0 0 0 74px',
          maxWidth: 600,
        }}>
          {subtitle}
        </p>
      </div>

      {/* Tile grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 14,
        }}
      >
        {tiles.map(t => {
          const rgb = hexToRgb(t.accent)
          return (
            <Link
              key={t.href + t.label}
              href={t.href}
              className="ovh-tile"
              style={{
                ['--it-rgb' as any]: rgb,
                gridColumn: t.big ? 'span 2' : undefined,
              }}
            >
              <div className="ovh-tile-icon">{t.icon}</div>

              <div style={{ flex: 1 }}>
                <div className="ovh-tile-titlerow">
                  <span className="ovh-tile-title">{t.label}</span>
                  {t.soon && <span className="ovh-tile-soon">Greitai</span>}
                </div>
                <div className="ovh-tile-desc">{t.desc}</div>
                {t.stat && <div className="ovh-tile-stat">{t.stat}</div>}
              </div>

              <div className="ovh-tile-arrow" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                </svg>
              </div>
            </Link>
          )
        })}
      </div>

      <style>{`
        .ovh-tile {
          position: relative;
          display: flex; align-items: flex-start; gap: 16px;
          padding: 22px;
          border-radius: 18px;
          text-decoration: none;
          background: linear-gradient(135deg, rgba(var(--it-rgb), 0.13) 0%, rgba(var(--it-rgb), 0.04) 100%);
          border: 1px solid rgba(var(--it-rgb), 0.22);
          color: var(--text-primary);
          transition: transform .25s ease, border-color .25s ease, box-shadow .25s ease, background .25s ease;
          overflow: hidden;
          min-height: 100px;
        }
        .ovh-tile::before {
          content: '';
          position: absolute;
          top: -60px; right: -60px;
          width: 180px; height: 180px;
          background: radial-gradient(circle, rgba(var(--it-rgb), 1) 0%, transparent 70%);
          opacity: 0.10;
          pointer-events: none;
          transition: opacity .3s;
        }
        .ovh-tile:hover {
          transform: translateY(-4px);
          border-color: rgba(var(--it-rgb), 0.6);
          background: linear-gradient(135deg, rgba(var(--it-rgb), 0.22) 0%, rgba(var(--it-rgb), 0.07) 100%);
          box-shadow:
            0 18px 40px rgba(var(--it-rgb), 0.30),
            0 6px 14px rgba(var(--it-rgb), 0.12);
        }
        .ovh-tile:hover::before { opacity: 0.20; }
        .ovh-tile:hover .ovh-tile-icon { transform: scale(1.06) rotate(-3deg); }
        .ovh-tile:hover .ovh-tile-arrow { transform: translateX(3px); opacity: 1; }

        .ovh-tile-icon {
          flex-shrink: 0;
          width: 52px; height: 52px;
          border-radius: 14px;
          display: flex; align-items: center; justify-content: center;
          color: #fff;
          background: linear-gradient(135deg, rgba(var(--it-rgb), 1) 0%, rgba(var(--it-rgb), 0.75) 100%);
          box-shadow:
            0 10px 22px rgba(var(--it-rgb), 0.40),
            inset 0 1px 0 rgba(255, 255, 255, 0.25);
          transition: transform .3s ease;
        }
        .ovh-tile-icon svg { width: 26px; height: 26px; }

        .ovh-tile-titlerow {
          display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap;
        }
        .ovh-tile-title {
          font-size: 17px; font-weight: 800;
          color: var(--text-primary);
          letter-spacing: -0.01em;
          line-height: 1.2;
        }
        .ovh-tile-soon {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 9.5px; font-weight: 800;
          text-transform: uppercase; letter-spacing: 0.08em;
          padding: 2px 7px;
          border-radius: 999px;
          background: rgba(var(--it-rgb), 0.18);
          color: rgba(var(--it-rgb), 1);
          border: 1px solid rgba(var(--it-rgb), 0.4);
        }
        .ovh-tile-soon::before {
          content: ''; width: 5px; height: 5px;
          border-radius: 50%; background: currentColor;
          animation: ovh-pulse 1.8s infinite;
        }
        @keyframes ovh-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.5; transform: scale(1.4); }
        }
        .ovh-tile-desc {
          font-size: 13.5px; font-weight: 500;
          color: var(--text-secondary);
          line-height: 1.5;
          margin-bottom: 8px;
        }
        .ovh-tile-stat {
          display: inline-block;
          font-size: 11.5px; font-weight: 700;
          color: rgba(var(--it-rgb), 1);
          padding: 3px 9px;
          border-radius: 6px;
          background: rgba(var(--it-rgb), 0.12);
          letter-spacing: 0.01em;
        }
        .ovh-tile-arrow {
          flex-shrink: 0;
          width: 32px; height: 32px;
          display: flex; align-items: center; justify-content: center;
          color: rgba(var(--it-rgb), 1);
          opacity: 0.55;
          transition: transform .25s ease, opacity .25s ease;
        }
      `}</style>
    </div>
  )
}
