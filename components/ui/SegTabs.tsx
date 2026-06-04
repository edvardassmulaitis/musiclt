'use client'

/**
 * SegTabs — vienas, bendras tab baras visai svetainei (underline stilius).
 * Naudojamas /srautas (Sekami|Tau) ir Pokalbiai sidebar'e — kad tab'ai
 * atrodytų identiškai visur. Active = text-primary + 2px oranžinis apačios
 * border'is. Palaiko badge skaičių (pvz. neperskaityti pokalbiai).
 */

import type { ReactNode } from 'react'
import Link from 'next/link'

export type SegTabItem = { key: string; label: ReactNode; badge?: number; href?: string }

export function SegTabs({
  items, value, onChange, className,
}: {
  items: SegTabItem[]
  value: string
  onChange?: (key: string) => void
  className?: string
}) {
  return (
    <div className={`segtabs${className ? ' ' + className : ''}`} role="tablist">
      <style>{`
        .segtabs {
          display: flex; flex-shrink: 0;
          border-bottom: 1px solid var(--border-subtle);
        }
        .segtab {
          flex: 1; padding: 11px 10px; border: none; background: transparent; cursor: pointer;
          font-family: inherit; font-size: 13px; font-weight: 700; letter-spacing: -0.01em;
          color: var(--text-muted); border-bottom: 2px solid transparent;
          transition: color .12s, border-color .12s; text-decoration: none;
          display: flex; align-items: center; justify-content: center; gap: 6px;
          -webkit-tap-highlight-color: transparent; min-width: 0;
        }
        .segtab > span.segtab-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .segtab.active { color: var(--text-primary); border-bottom-color: var(--accent-orange); }
        .segtab:hover:not(.active) { color: var(--text-secondary); }
        .segtab-badge {
          flex-shrink: 0; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px;
          background: var(--accent-orange); color: #fff; font-size: 9px; font-weight: 800;
          display: inline-flex; align-items: center; justify-content: center; line-height: 1;
        }
      `}</style>
      {items.map(it => {
        const active = value === it.key
        const inner = (
          <>
            <span className="segtab-text">{it.label}</span>
            {it.badge && it.badge > 0 ? <span className="segtab-badge">{it.badge > 99 ? '99+' : it.badge}</span> : null}
          </>
        )
        // href → Link (route-based tabs, pvz. Topai); kitaip button (in-place).
        return it.href ? (
          <Link key={it.key} href={it.href} role="tab" aria-selected={active} className={`segtab${active ? ' active' : ''}`}>
            {inner}
          </Link>
        ) : (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={active}
            className={`segtab${active ? ' active' : ''}`}
            onClick={() => onChange?.(it.key)}
          >
            {inner}
          </button>
        )
      })}
    </div>
  )
}
