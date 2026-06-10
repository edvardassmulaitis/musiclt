'use client'
// components/blog/wizard/WizardControls.tsx
//
// Smulkūs daugkartiniai wizard'o valdikliai: ChoiceCards (didelės pasirinkimo
// kortelės), CountChips (kiekio chip'ai + custom), FieldLabel, WizField input'ai.

import type { ReactNode } from 'react'

const sv = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
)

export type Choice = {
  value: string
  label: string
  desc?: string
  icon?: ReactNode
}

export function ChoiceCards({
  choices, value, onSelect,
}: {
  choices: Choice[]
  value: string | null
  onSelect: (v: string) => void
}) {
  return (
    <div className="cc">
      {choices.map(c => (
        <button
          key={c.value}
          type="button"
          className={`cc-card${value === c.value ? ' is-active' : ''}`}
          onClick={() => onSelect(c.value)}
        >
          {c.icon && <span className="cc-ico">{c.icon}</span>}
          <span className="cc-text">
            <span className="cc-label">{c.label}</span>
            {c.desc && <span className="cc-desc">{c.desc}</span>}
          </span>
          <span className="cc-check" aria-hidden>
            {value === c.value && sv(<path d="M20 6 9 17l-5-5" />)}
          </span>
        </button>
      ))}
      <style jsx>{`
        .cc { display: flex; flex-direction: column; gap: 10px; }
        .cc-card {
          display: flex; align-items: center; gap: 14px; width: 100%; text-align: left;
          padding: 16px; border-radius: 16px; cursor: pointer;
          background: var(--bg-elevated); border: 1.5px solid var(--border-subtle);
          transition: border-color .12s, background .12s, transform .08s;
          -webkit-tap-highlight-color: transparent;
        }
        .cc-card:active { transform: scale(.99); }
        .cc-card.is-active { border-color: var(--accent-orange); background: rgba(249,115,22,0.07); }
        .cc-ico {
          flex-shrink: 0; width: 42px; height: 42px; border-radius: 11px;
          display: flex; align-items: center; justify-content: center;
          background: var(--bg-hover); color: var(--accent-orange);
        }
        .cc-ico :global(svg) { width: 22px; height: 22px; }
        .cc-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .cc-label { font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 16px; color: var(--text-primary); }
        .cc-desc { font-size: 13px; color: var(--text-muted); line-height: 1.35; }
        .cc-check { flex-shrink: 0; width: 22px; height: 22px; color: var(--accent-orange); }
        .cc-check :global(svg) { width: 22px; height: 22px; stroke-width: 2.6; }
      `}</style>
    </div>
  )
}

export function CountChips({
  options, value, onChange, onPick, allowCustom = true, max = 100,
}: {
  options: number[]
  value: number | null
  onChange: (v: number) => void
  /** Kviečiamas TIK paspaudus chip'ą (ne rašant custom skaičių) — auto-advance. */
  onPick?: (v: number) => void
  allowCustom?: boolean
  max?: number
}) {
  const isCustom = value !== null && !options.includes(value)
  return (
    <div className="ctc">
      <div className="ctc-row">
        {options.map(o => (
          <button
            key={o}
            type="button"
            className={`ctc-chip${value === o ? ' is-active' : ''}`}
            onClick={() => { onChange(o); onPick?.(o) }}
          >
            {o}
          </button>
        ))}
      </div>
      {allowCustom && (
        <div className="ctc-custom">
          <span className="ctc-custom-label">Kita:</span>
          <input
            type="number"
            min={1}
            max={max}
            value={isCustom ? value ?? '' : ''}
            onChange={e => {
              const n = parseInt(e.target.value)
              if (Number.isFinite(n)) onChange(Math.max(1, Math.min(max, n)))
            }}
            placeholder="pvz. 7"
            className="ctc-input"
          />
        </div>
      )}
      <style jsx>{`
        .ctc-row { display: flex; gap: 8px; flex-wrap: wrap; }
        .ctc-chip {
          min-width: 56px; height: 52px; padding: 0 14px; border-radius: 13px;
          font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 17px; cursor: pointer;
          background: var(--bg-elevated); border: 1.5px solid var(--border-subtle); color: var(--text-secondary);
          -webkit-tap-highlight-color: transparent;
        }
        .ctc-chip.is-active { background: var(--accent-orange); color: #fff; border-color: transparent; }
        .ctc-custom { display: flex; align-items: center; gap: 10px; margin-top: 14px; }
        .ctc-custom-label { font-size: 13px; color: var(--text-muted); }
        .ctc-input {
          width: 110px; height: 46px; border-radius: 12px; padding: 0 14px;
          background: var(--bg-elevated); border: 1.5px solid var(--border-subtle);
          color: var(--text-primary); font-size: 16px; font-weight: 700; outline: none;
        }
        .ctc-input:focus { border-color: var(--accent-orange); }
      `}</style>
    </div>
  )
}

export function FieldLabel({ children, optional }: { children: ReactNode; optional?: boolean }) {
  return (
    <label className="wzfl">
      {children}
      {optional && <span className="wzfl-opt"> · neprivaloma</span>}
      <style jsx>{`
        .wzfl {
          display: block; margin-bottom: 8px;
          font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .07em;
          color: var(--text-faint); font-family: 'Outfit', sans-serif;
        }
        .wzfl-opt { text-transform: none; letter-spacing: 0; font-weight: 600; color: var(--text-faint); }
      `}</style>
    </label>
  )
}
