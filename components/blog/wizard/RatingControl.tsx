'use client'
// components/blog/wizard/RatingControl.tsx
//
// 1–10 balo rinkiklis — tap'inami skaičiai (mobile-friendly, dideli target'ai).
// `compact` versija naudojama per-dainai albumo recenzijoje.

const VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

export function RatingControl({
  value, onChange, compact = false, allowClear = true,
}: {
  value: number | null
  onChange: (v: number | null) => void
  compact?: boolean
  allowClear?: boolean
}) {
  return (
    <div className={`rc${compact ? ' rc-compact' : ''}`}>
      <div className="rc-grid">
        {VALUES.map(v => {
          const active = value !== null && v <= value
          const exact = value === v
          return (
            <button
              key={v}
              type="button"
              className={`rc-pill${active ? ' is-on' : ''}${exact ? ' is-exact' : ''}`}
              onClick={() => onChange(exact && allowClear ? null : v)}
              aria-label={`${v} iš 10`}
            >
              {v}
            </button>
          )
        })}
      </div>
      {!compact && (
        <div className="rc-foot">
          <span className="rc-readout">{value !== null ? `${value}/10` : 'Nepasirinkta'}</span>
          {allowClear && value !== null && (
            <button type="button" className="rc-clear" onClick={() => onChange(null)}>Išvalyti</button>
          )}
        </div>
      )}
      <style jsx>{`
        .rc-grid {
          display: grid;
          grid-template-columns: repeat(10, 1fr);
          gap: 6px;
        }
        .rc-compact .rc-grid { gap: 4px; }
        .rc-pill {
          aspect-ratio: 1;
          border-radius: 11px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-elevated);
          color: var(--text-muted);
          font-family: 'Outfit', sans-serif;
          font-weight: 800;
          font-size: 15px;
          cursor: pointer;
          transition: background .12s, color .12s, transform .08s, border-color .12s;
          -webkit-tap-highlight-color: transparent;
        }
        .rc-compact .rc-pill { border-radius: 8px; font-size: 12px; }
        .rc-pill:active { transform: scale(.9); }
        .rc-pill.is-on {
          background: rgba(249,115,22,0.18);
          color: var(--accent-orange);
          border-color: rgba(249,115,22,0.35);
        }
        .rc-pill.is-exact {
          background: var(--accent-orange);
          color: #fff;
          border-color: transparent;
        }
        .rc-foot {
          margin-top: 12px; display: flex; align-items: center; justify-content: space-between;
        }
        .rc-readout {
          font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 18px; color: var(--text-primary);
        }
        .rc-clear {
          font-size: 12px; font-weight: 700; color: var(--text-muted);
          background: transparent; border: none; cursor: pointer;
        }
        @media (max-width: 380px) {
          .rc-pill { font-size: 13px; border-radius: 9px; }
        }
      `}</style>
    </div>
  )
}
