'use client'

import { useState } from 'react'

export function CopyButton({ text, label = 'Kopijuoti' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const handle = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // graceful fallback
      window.prompt('Nukopijuok rankiniu būdu:', text)
    }
  }
  return (
    <button
      onClick={handle}
      className="text-[10px] px-2 py-1 rounded font-semibold transition"
      style={{
        background: copied ? '#16a34a' : 'var(--text-primary)',
        color: copied ? '#fff' : 'var(--bg-page)',
        fontFamily: "'Outfit', sans-serif",
      }}
    >
      {copied ? '✓ Nukopijuota' : label}
    </button>
  )
}
