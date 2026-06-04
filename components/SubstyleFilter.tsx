'use client'

// Smulkesnių stilių (substyles) sąrašas su paieška/filtru. Visi <a> link'ai
// renderinami ir SSR'e (pradinė būsena = visi), tad SEO mato visas nuorodas.
import { useState } from 'react'
import Link from 'next/link'

type Sub = { substyle_id: number; name: string; slug: string; n: number }

export default function SubstyleFilter({ subs }: { subs: Sub[] }) {
  const [q, setQ] = useState('')
  const term = q.trim().toLowerCase()
  const filtered = term ? subs.filter((s) => s.name.toLowerCase().includes(term)) : subs
  return (
    <div>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Ieškoti stiliaus…"
        aria-label="Ieškoti smulkesnio stiliaus"
        style={{
          width: '100%', maxWidth: 360, padding: '9px 14px', borderRadius: 10,
          background: 'var(--bg-hover)', border: '1px solid var(--border-default)',
          color: 'var(--text-primary)', fontSize: 14, outline: 'none',
        }}
      />
      <div className="mz-pills" style={{ marginTop: 14 }}>
        {filtered.map((s) => (
          <Link key={s.substyle_id} href={`/atlikejai?substyle=${s.slug}`} className="mz-pill" prefetch={false}>
            <span>{s.name}</span>
            <em>{s.n}</em>
          </Link>
        ))}
        {filtered.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Pagal „{q}" nieko nerasta.</p>
        )}
      </div>
    </div>
  )
}
