'use client'

// Smulkesni stiliai (substyles): tuščia paieška → grupuota pagal pagrindinį
// stilių (kaip admino rinkiklyje); ieškant → plokščias filtruotas sąrašas.
// Visi <a> link'ai renderinami ir SSR'e (pradinė būsena = visi grupėse), tad
// SEO mato visas nuorodas.
import { useState } from 'react'
import Link from 'next/link'

type Sub = { substyle_id: number; name: string; slug: string; n: number; genre: string }

const headStyle: React.CSSProperties = {
  fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 800,
  textTransform: 'uppercase', letterSpacing: '0.08em',
  color: 'var(--accent-orange)', marginBottom: 9,
}

export default function SubstyleFilter({ subs, genreOrder }: { subs: Sub[]; genreOrder: string[] }) {
  const [q, setQ] = useState('')
  const term = q.trim().toLowerCase()

  const pill = (s: Sub) => (
    <Link key={s.substyle_id} href={`/atlikejai?substyle=${s.slug}`} className="mz-pill" prefetch={false}>
      <span>{s.name}</span>
      <em>{s.n}</em>
    </Link>
  )

  const input = (
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
  )

  if (term) {
    const filtered = subs.filter((s) => s.name.toLowerCase().includes(term))
    return (
      <div>
        {input}
        <div className="mz-pills" style={{ marginTop: 14 }}>
          {filtered.map(pill)}
          {filtered.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Pagal „{q}" nieko nerasta.</p>
          )}
        </div>
      </div>
    )
  }

  const byGenre: Record<string, Sub[]> = {}
  for (const s of subs) (byGenre[s.genre] ||= []).push(s)
  const order = [
    ...genreOrder.filter((g) => byGenre[g]),
    ...Object.keys(byGenre).filter((g) => !genreOrder.includes(g)),
  ]

  return (
    <div>
      {input}
      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {order.map((g) => (
          <div key={g}>
            <div style={headStyle}>{g.replace(/\s*muzika$/i, '')}</div>
            <div className="mz-pills">{byGenre[g].map(pill)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
