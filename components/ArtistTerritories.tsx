'use client'
// components/ArtistTerritories.tsx
//
// Atlikėjo teritorijos muzikos žemėlapyje — kaip laiko juosta.
// Atlikėjas keliauja per teritorijas: Radiohead → Britpop 93–95 → Alternatyva
// 95–99 → Elektroninis rokas 00–11. Rodoma ir atlikėjo puslapyje, ir admine.
//
// Kiekviena teritorija — nuoroda į Gilyn žemėlapį, tad atlikėjo puslapis tampa
// įėjimu į atradimo žaidimą.

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Item = {
  id: string; name: string; world: string; color: string
  region: string | null; essence: string | null
  from: number | null; to: number | null; source: string
}

export default function ArtistTerritories({ artistId, compact = false }: { artistId: number; compact?: boolean }) {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    fetch(`/api/teritorijos/atlikejas/${artistId}`, { cache: 'force-cache' })
      .then(r => r.json())
      .then(d => { if (alive) { setItems(d.items || []); setLoading(false) } })
      .catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [artistId])

  if (loading || !items.length) return null

  const span = (i: Item) =>
    i.from && i.to ? `${i.from}–${i.to}` : i.from ? `nuo ${i.from}` : i.to ? `iki ${i.to}` : ''

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {items.map(i => (
          <Link key={i.id} href={`/zaidimai/gilyn/zemelapis?terr=${i.id}`}
            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] transition-colors hover:bg-[var(--bg-hover)]"
            style={{ borderColor: i.color + '55' }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: i.color }} />
            <span className="text-[var(--text-primary)]">{i.name}</span>
            {span(i) && <span className="text-[var(--text-muted)]">{span(i)}</span>}
          </Link>
        ))}
      </div>
    )
  }

  return (
    <section className="rounded-xl border border-[var(--input-border)] bg-[var(--bg-surface)] p-4">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-[var(--text-primary)]">Muzikos žemėlapyje</h3>
        <Link href="/zaidimai/gilyn" className="text-[11px] text-music-blue hover:underline">Gilyn →</Link>
      </div>
      <p className="mb-3 text-[11.5px] text-[var(--text-muted)]">
        {items.length > 1
          ? 'Kelias per teritorijas — stilius keitėsi kartu su laiku.'
          : 'Teritorija, kuriai priklauso ši muzika.'}
      </p>

      <ol className="relative space-y-2.5 border-l border-[var(--border-subtle)] pl-4">
        {items.map(i => (
          <li key={i.id} className="relative">
            <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--bg-surface)]"
              style={{ background: i.color }} />
            <Link href={`/zaidimai/gilyn/zemelapis?terr=${i.id}`} className="group block">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[13.5px] font-semibold text-[var(--text-primary)] group-hover:text-music-blue">{i.name}</span>
                {span(i) && <span className="font-mono text-[11px] text-[var(--text-muted)]">{span(i)}</span>}
                {i.region && <span className="rounded bg-[var(--bg-elevated)] px-1 text-[10px] text-[var(--text-muted)]">{i.region}</span>}
              </div>
              {i.essence && <p className="mt-0.5 text-[11.5px] leading-snug text-[var(--text-muted)]">{i.essence}</p>}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}
