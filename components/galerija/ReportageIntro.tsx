'use client'

// components/galerija/ReportageIntro.tsx
//
// Aprašymas su „Skaityti daugiau" → atidaro MODAL su pilnu tekstu (NEstumdo
// turinio, kaip prašyta). Trumpinam pagal matomų simbolių skaičių (švarus
// pjūvis, ne CSS clamp).

import { useEffect, useState } from 'react'

const MAX_CHARS = 300

function truncateHtml(html: string, maxChars: number): { excerpt: string; isLong: boolean } {
  const plainLen = html.replace(/<[^>]+>/g, '').length
  if (plainLen <= maxChars) return { excerpt: html, isLong: false }
  let plainCount = 0, cut = 0, inTag = false
  for (let i = 0; i < html.length; i++) {
    const ch = html[i]
    if (ch === '<') inTag = true
    else if (ch === '>') { inTag = false; continue }
    if (!inTag) plainCount++
    if (plainCount >= maxChars) { cut = i + 1; break }
  }
  let excerpt = html.slice(0, cut || html.length)
  const lastLt = excerpt.lastIndexOf('<'), lastGt = excerpt.lastIndexOf('>')
  if (lastLt > lastGt) excerpt = excerpt.slice(0, lastLt)
  const lastSpace = excerpt.lastIndexOf(' ')
  if (lastSpace > maxChars * 0.6) excerpt = excerpt.slice(0, lastSpace)
  return { excerpt: excerpt.replace(/[\s,;:–—-]+$/, ''), isLong: true }
}

const proseCls = 'text-[14.5px] leading-[1.7] text-[var(--text-secondary)] [&_a]:text-[var(--accent-orange)] [&_a]:no-underline hover:[&_a]:underline [&_p]:mb-3 [&_strong]:text-[var(--text-primary)]'

export default function ReportageIntro({ html }: { html: string }) {
  const [open, setOpen] = useState(false)
  const { excerpt, isLong } = truncateHtml(html, MAX_CHARS)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open])

  if (!isLong) return <div className={`mt-4 ${proseCls}`} dangerouslySetInnerHTML={{ __html: html }} />

  return (
    <>
      <div className={`mt-4 ${proseCls}`}>
        <span dangerouslySetInnerHTML={{ __html: excerpt }} />…{' '}
        <button onClick={() => setOpen(true)} className="font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--accent-orange)] hover:underline">
          Skaityti daugiau →
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[1000] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative z-10 max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-t-2xl bg-[var(--bg-surface)] shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border-default)] px-5 py-3">
              <span className="font-['Outfit',sans-serif] text-[14px] font-extrabold uppercase tracking-[0.12em] text-[var(--accent-orange)]">Reportažas</span>
              <button onClick={() => setOpen(false)} aria-label="Uždaryti" className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className={`max-h-[calc(85vh-52px)] overflow-y-auto px-5 py-4 ${proseCls}`} dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </div>
      )}
    </>
  )
}
