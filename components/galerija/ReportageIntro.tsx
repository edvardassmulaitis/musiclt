'use client'

// components/galerija/ReportageIntro.tsx
//
// Pilnas reportažo aprašymas su „Skaityti daugiau". Trumpinam pagal MATOMŲ
// simbolių skaičių (ne CSS max-height) — kad nekirptų vidury eilutės. Toks pat
// principas kaip atlikėjo psl. bio.

import { useMemo, useState } from 'react'

const MAX_CHARS = 320

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
  // Nukerpam iki paskutinio tarpo, kad neliktų pusės žodžio.
  const lastSpace = excerpt.lastIndexOf(' ')
  if (lastSpace > maxChars * 0.6) excerpt = excerpt.slice(0, lastSpace)
  return { excerpt: excerpt.replace(/[\s,;:–—-]+$/, ''), isLong: true }
}

export default function ReportageIntro({ html }: { html: string }) {
  const [expanded, setExpanded] = useState(false)
  const { excerpt, isLong } = useMemo(() => truncateHtml(html, MAX_CHARS), [html])

  const base = 'text-[14.5px] leading-[1.7] text-[var(--text-secondary)] [&_a]:text-[var(--accent-orange)] [&_a]:no-underline hover:[&_a]:underline [&_p]:mb-2.5 [&_strong]:text-[var(--text-primary)]'

  if (!isLong) {
    return <div className={`mt-4 ${base}`} dangerouslySetInnerHTML={{ __html: html }} />
  }
  return (
    <div className={`mt-4 ${base}`}>
      {expanded ? (
        <span dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <span>
          <span dangerouslySetInnerHTML={{ __html: excerpt }} />…{' '}
        </span>
      )}
      {' '}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="font-['Outfit',sans-serif] text-[13px] font-bold text-[var(--accent-orange)] transition-colors hover:underline"
      >
        {expanded ? 'Suskleisti' : 'Skaityti daugiau →'}
      </button>
    </div>
  )
}
