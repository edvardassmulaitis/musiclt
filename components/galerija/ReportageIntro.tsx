'use client'

// components/galerija/ReportageIntro.tsx
//
// Pilnas reportažo aprašymas su „Skaityti daugiau" — jei tekstas aukštas,
// suskleidžiam iki COLLAPSE_PX su fade'u; trumpas rodom visą be mygtuko.

import { useEffect, useRef, useState } from 'react'

const COLLAPSE_PX = 168 // ~7 eilutės

export default function ReportageIntro({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setOverflows(el.scrollHeight > COLLAPSE_PX + 24)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [html])

  return (
    <div className="mt-4">
      <div
        ref={ref}
        className="relative overflow-hidden text-[14.5px] leading-[1.65] text-[var(--text-secondary)] [&_a]:text-[#ec4899] [&_a:hover]:underline [&_p]:mb-2.5 transition-[max-height] duration-300"
        style={{ maxHeight: expanded || !overflows ? 'none' : COLLAPSE_PX }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {overflows && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-bold text-[#ec4899] hover:underline"
        >
          {expanded ? 'Suskleisti' : 'Skaityti daugiau'}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      )}
    </div>
  )
}
