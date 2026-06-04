'use client'

/**
 * SegTabs — vienas, bendras tab baras visai svetainei (underline stilius).
 * Naudojamas /srautas (Sekami|Tau) ir Pokalbiai sidebar'e — kad tab'ai
 * atrodytų identiškai visur. Active = text-primary + 2px oranžinis apačios
 * border'is. Palaiko badge skaičių (pvz. neperskaityti pokalbiai).
 */

import type { ReactNode } from 'react'

export type SegTabItem = { key: string; label: ReactNode; badge?: number }

export function SegTabs({
  items, value, onChange, className,
}: {
  items: SegTabItem[]
  value: string
  onChange: (key: string) => void
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
          transition: color .12s, border-color .12s;
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
      {items.map(it => (
        <button
          key={it.key}
          type="button"
          role="tab"
          aria-selected={value === it.key}
          className={`segtab${value === it.key ? ' active' : ''}`}
          onClick={() => onChange(it.key)}
        >
          <span className="segtab-text">{it.label}</span>
          {it.badge && it.badge > 0 ? <span className="segtab-badge">{it.badge > 99 ? '99+' : it.badge}</span> : null}
        </button>
      ))}
    </div>
  )
}
