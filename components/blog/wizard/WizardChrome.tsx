'use client'
// components/blog/wizard/WizardChrome.tsx
//
// Bendras wizard'o „karkasas" — mobile-first. Visi turinio pridėjimo flow'ai
// (recenzija, topas, vertimas, …) renderinasi viduje. Sukuria:
//   - viršutinę juostą: atgal mygtukas + progreso indikatorius
//   - žingsnio antraštę (didelė) + paantraštę
//   - scroll'inamą turinio sritį
//   - FIKSUOTĄ apatinę veiksmų juostą (virš mobile bottom nav per --bottom-nav-h)
//
// Veiksmų juosta: vienas pagrindinis mygtukas (Toliau / Publikuoti) + optional
// antrinis (Juodraštis / Praleisti). Didelis tap target mobile'ui.

import type { ReactNode } from 'react'

export function WizardChrome({
  stepIndex,
  totalSteps,
  title,
  subtitle,
  onBack,
  onClose,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  primaryBusy,
  secondaryLabel,
  onSecondary,
  error,
  children,
}: {
  stepIndex: number
  totalSteps: number
  title: string
  subtitle?: string
  onBack?: () => void
  onClose?: () => void
  primaryLabel: string
  onPrimary: () => void
  primaryDisabled?: boolean
  primaryBusy?: boolean
  secondaryLabel?: string
  onSecondary?: () => void
  error?: string | null
  children: ReactNode
}) {
  const pct = totalSteps > 1 ? Math.round(((stepIndex + 1) / totalSteps) * 100) : 100
  return (
    <div className="wz-root">
      {/* Top bar */}
      <div className="wz-top">
        <button
          type="button"
          className="wz-icon-btn"
          onClick={onBack}
          aria-label="Atgal"
          style={{ visibility: onBack ? 'visible' : 'hidden' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div className="wz-progress" aria-hidden>
          <div className="wz-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="wz-step-count">{stepIndex + 1}/{totalSteps}</span>
        {onClose && (
          <button type="button" className="wz-icon-btn" onClick={onClose} aria-label="Uždaryti">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        )}
      </div>

      {/* Scrollable content */}
      <div className="wz-body">
        <div className="wz-head">
          <h1 className="wz-title">{title}</h1>
          {subtitle && <p className="wz-sub">{subtitle}</p>}
        </div>

        {error && <div className="wz-error">{error}</div>}

        <div className="wz-content">{children}</div>
      </div>

      {/* Fixed action bar (above mobile bottom nav) */}
      <div className="wz-actions">
        <div className="wz-actions-inner">
          {secondaryLabel && onSecondary ? (
            <button type="button" className="wz-btn wz-btn-ghost" onClick={onSecondary} disabled={primaryBusy}>
              {secondaryLabel}
            </button>
          ) : <span />}
          <button
            type="button"
            className="wz-btn wz-btn-primary"
            onClick={onPrimary}
            disabled={primaryDisabled || primaryBusy}
          >
            {primaryBusy ? '…' : primaryLabel}
          </button>
        </div>
      </div>

      <style jsx>{`
        .wz-root {
          max-width: 640px;
          margin: 0 auto;
          padding: 0 16px;
          /* vietos rezervas fiksuotai veiksmų juostai + mobile nav */
          padding-bottom: calc(96px + var(--bottom-nav-h) + env(safe-area-inset-bottom));
        }
        .wz-top {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 0 10px;
          position: sticky;
          top: 0;
          z-index: 20;
          background: var(--bg-body);
        }
        .wz-icon-btn {
          flex-shrink: 0;
          width: 36px; height: 36px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 10px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-elevated);
          color: var(--text-secondary);
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }
        .wz-icon-btn:active { transform: scale(.94); }
        .wz-progress {
          flex: 1;
          height: 4px;
          border-radius: 4px;
          background: var(--bg-elevated);
          overflow: hidden;
        }
        .wz-progress-fill {
          height: 100%;
          background: var(--accent-orange);
          border-radius: 4px;
          transition: width .3s cubic-bezier(.4,0,.2,1);
        }
        .wz-step-count {
          flex-shrink: 0;
          font-size: 12px;
          font-weight: 700;
          color: var(--text-muted);
          font-family: 'Outfit', sans-serif;
          min-width: 28px;
          text-align: right;
        }
        .wz-head { margin: 8px 0 18px; }
        .wz-title {
          font-family: 'Outfit', sans-serif;
          font-size: clamp(1.5rem, 5vw, 1.9rem);
          font-weight: 800;
          letter-spacing: -0.02em;
          color: var(--text-primary);
          line-height: 1.15;
        }
        .wz-sub {
          margin-top: 6px;
          font-size: 14px;
          color: var(--text-muted);
          line-height: 1.45;
        }
        .wz-error {
          margin-bottom: 14px;
          padding: 10px 12px;
          border-radius: 10px;
          background: rgba(239,68,68,0.10);
          border: 1px solid rgba(239,68,68,0.25);
          color: #fca5a5;
          font-size: 13px;
        }
        .wz-actions {
          position: fixed;
          left: 0; right: 0;
          bottom: calc(var(--bottom-nav-h) + env(safe-area-inset-bottom));
          z-index: 60;
          background: linear-gradient(to top, var(--bg-body) 70%, transparent);
          padding: 12px 16px 14px;
        }
        .wz-actions-inner {
          max-width: 640px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .wz-actions-inner > span { flex: 0 0 auto; }
        .wz-btn {
          height: 50px;
          border-radius: 14px;
          font-family: 'Outfit', sans-serif;
          font-weight: 800;
          font-size: 15px;
          cursor: pointer;
          border: none;
          transition: transform .1s, opacity .15s, background .15s;
          -webkit-tap-highlight-color: transparent;
        }
        .wz-btn:active { transform: scale(.98); }
        .wz-btn:disabled { opacity: .45; cursor: default; }
        .wz-btn-primary {
          flex: 1;
          background: var(--accent-orange);
          color: #fff;
        }
        .wz-btn-ghost {
          padding: 0 18px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          color: var(--text-secondary);
        }
      `}</style>
    </div>
  )
}
