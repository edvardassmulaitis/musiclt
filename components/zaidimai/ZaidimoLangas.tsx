'use client'

// components/zaidimai/ZaidimoLangas.tsx
//
// Pilno ekrano žaidimo langas — „app", ne „web" jausmas (Edvardo feedback):
//   * fixed per visą ekraną VIRŠ svetainės header/footer/apatinės navigacijos
//   * savas kompaktiškas viršus: grįžimo mygtukas + pavadinimas + dešinys lizdas
//   * turinys scrollinasi lango viduje (body užrakintas), safe-area paisoma
//
// Naudojimas: apgaubti VISĄ žaidimo klientą.

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useState } from 'react'
import Link from 'next/link'
import type { ReactNode } from 'react'

export default function ZaidimoLangas({
  title,
  backHref = '/zaidimai',
  right,
  children,
  maxWidth = 760,
}: {
  title: string
  backHref?: string
  right?: ReactNode
  children: ReactNode
  maxWidth?: number
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const prevBody = document.body.style.overflow
    const prevHtml = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevBody
      document.documentElement.style.overflow = prevHtml
    }
  }, [])

  if (!mounted) return null

  return createPortal(
    <div className="zl-shell">
      <style>{css}</style>
      <header className="zl-top">
        <Link href={backHref} className="zl-back" aria-label="Grįžti">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </Link>
        <span className="zl-title">{title}</span>
        <span className="zl-right">{right}</span>
      </header>
      <main className="zl-body">
        <div className="zl-inner" style={{ maxWidth }}>{children}</div>
      </main>
    </div>,
    document.body,
  )
}

const css = `
.zl-shell {
  position: fixed; inset: 0; z-index: 400;
  display: flex; flex-direction: column;
  background: var(--bg-body); color: var(--text-primary);
}
.zl-top {
  display: flex; align-items: center; gap: 10px; flex-shrink: 0;
  padding: calc(10px + env(safe-area-inset-top)) 14px 10px;
  border-bottom: 1px solid rgba(140,160,190,0.14);
  background: var(--bg-body);
}
.zl-back {
  display: flex; align-items: center; justify-content: center;
  width: 36px; height: 36px; border-radius: 12px; flex-shrink: 0;
  color: var(--text-primary); background: var(--bg-surface);
  border: 1px solid rgba(140,160,190,0.22); text-decoration: none;
}
.zl-title { font-size: 16px; font-weight: 900; letter-spacing: -0.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.zl-right { margin-left: auto; display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.zl-body {
  flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch;
  padding: 16px 16px calc(24px + env(safe-area-inset-bottom));
}
.zl-inner { margin: 0 auto; }
`
