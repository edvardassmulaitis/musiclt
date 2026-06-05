'use client'
// components/blog/wizard/WizardChrome.tsx
//
// Bendras wizard'o „karkasas" — FULL-SCREEN OVERLAY (kaip native app sheet).
// Dengia visą ekraną (virš SiteHeader z-50 ir mobile nav), užrakina fono
// scroll'ą ir turi savo vidinį scroll'ą — todėl nebėra puslapio footerio /
// dvigubo scroll'o. Naudojamas ir žingsniams, ir tipo pasirinkimo ekranui.
//
//   - viršus: atgal (kairė) + progresas (tik kai >1 žingsnis) + uždaryti (X)
//   - vidurys: scroll'inamas turinys (antraštė + paantraštė + children)
//   - apačia: fiksuota veiksmų juosta (tik jei perduotas primaryLabel)

import { useEffect, type ReactNode } from 'react'

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
  primaryLabel?: string
  onPrimary?: () => void
  primaryDisabled?: boolean
  primaryBusy?: boolean
  secondaryLabel?: string
  onSecondary?: () => void
  error?: string | null
  children: ReactNode
}) {
  const showProgress = totalSteps > 1
  const pct = showProgress ? Math.round(((stepIndex + 1) / totalSteps) * 100) : 100

  // Užrakinam fono scroll'ą kol overlay atidarytas
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  return (
    <div className="wz-overlay">
      {/* Top bar */}
      <div className="wz-top">
        {onBack ? (
          <button type="button" className="wz-icon-btn" onClick={onBack} aria-label="Atgal">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
        ) : <span className="wz-spacer" />}

        {showProgress ? (
          <div className="wz-progress" aria-hidden><div className="wz-progress-fill" style={{ width: `${pct}%` }} /></div>
        ) : <span style={{ flex: 1 }} />}

        {showProgress && <span className="wz-step-count">{stepIndex + 1}/{totalSteps}</span>}

        {onClose ? (
          <button type="button" className="wz-icon-btn" onClick={onClose} aria-label="Uždaryti">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        ) : <span className="wz-spacer" />}
      </div>

      {/* Scrollable content */}
      <div className="wz-scroll">
        <div className="wz-inner">
          <div className="wz-head">
            <h1 className="wz-title">{title}</h1>
            {subtitle && <p className="wz-sub">{subtitle}</p>}
          </div>
          {error && <div className="wz-error">{error}</div>}
          <div className="wz-content">{children}</div>
        </div>
      </div>

      {/* Action bar */}
      {primaryLabel && onPrimary && (
        <div className="wz-actions">
          <div className="wz-actions-inner">
            {secondaryLabel && onSecondary ? (
              <button type="button" className="wz-btn wz-btn-ghost" onClick={onSecondary} disabled={primaryBusy}>{secondaryLabel}</button>
            ) : <span />}
            <button type="button" className="wz-btn wz-btn-primary" onClick={onPrimary} disabled={primaryDisabled || primaryBusy}>
              {primaryBusy ? '…' : primaryLabel}
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .wz-overlay {
          position: fixed; inset: 0; z-index: 1000;
          display: flex; flex-direction: column;
          background: var(--bg-body);
        }
        .wz-top {
          flex-shrink: 0;
          display: flex; align-items: center; gap: 12px;
          padding: 12px 14px;
          padding-top: calc(12px + env(safe-area-inset-top));
          border-bottom: 1px solid var(--border-subtle);
        }
        .wz-spacer { width: 36px; height: 36px; flex-shrink: 0; }
        .wz-icon-btn {
          flex-shrink: 0; width: 36px; height: 36px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 10px; border: 1px solid var(--border-subtle);
          background: var(--bg-elevated); color: var(--text-secondary); cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }
        .wz-icon-btn:active { transform: scale(.94); }
        .wz-progress { flex: 1; height: 4px; border-radius: 4px; background: var(--bg-elevated); overflow: hidden; }
        .wz-progress-fill { height: 100%; background: var(--accent-orange); border-radius: 4px; transition: width .3s cubic-bezier(.4,0,.2,1); }
        .wz-step-count { flex-shrink: 0; font-size: 12px; font-weight: 700; color: var(--text-muted); font-family: 'Outfit', sans-serif; min-width: 26px; text-align: center; }

        .wz-scroll { flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; }
        .wz-inner {
          max-width: 620px; margin: 0 auto; padding: 20px 18px 28px;
          animation: wz-rise .22s cubic-bezier(.4,0,.2,1);
        }
        @keyframes wz-rise {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .wz-head { margin-bottom: 18px; }
        .wz-title {
          font-family: 'Outfit', sans-serif; font-size: clamp(1.5rem, 5vw, 1.85rem);
          font-weight: 800; letter-spacing: -0.02em; color: var(--text-primary); line-height: 1.15;
        }
        .wz-sub { margin-top: 7px; font-size: 14px; color: var(--text-muted); line-height: 1.45; }
        .wz-error {
          margin-bottom: 14px; padding: 10px 12px; border-radius: 10px;
          background: rgba(239,68,68,0.10); border: 1px solid rgba(239,68,68,0.25);
          color: #fca5a5; font-size: 13px;
        }

        .wz-actions {
          flex-shrink: 0;
          border-top: 1px solid var(--border-subtle);
          background: var(--bg-surface);
          padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
        }
        .wz-actions-inner { max-width: 620px; margin: 0 auto; display: flex; align-items: center; gap: 10px; }
        .wz-btn {
          height: 50px; border-radius: 14px; font-family: 'Outfit', sans-serif;
          font-weight: 800; font-size: 15px; cursor: pointer; border: none;
          transition: transform .1s, opacity .15s; -webkit-tap-highlight-color: transparent;
        }
        .wz-btn:active { transform: scale(.98); }
        .wz-btn:disabled { opacity: .45; cursor: default; }
        .wz-btn-primary { flex: 1; background: var(--accent-orange); color: #fff; }
        .wz-btn-ghost { padding: 0 18px; background: var(--bg-elevated); border: 1px solid var(--border-subtle); color: var(--text-secondary); }
      `}</style>
    </div>
  )
}
