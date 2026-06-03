// components/naujienos/StyleSections.tsx
//
// „Naršymas pagal stilių" — 8 top-level žanrų juostos su naujausiomis
// naujienomis. Server komponentas. Kiekvienos juostos header linkina į
// dedikuotą /naujienos/stilius/{slug} landing'ą.

import Link from 'next/link'
import { ArrowRight } from './icons'
import NewsCard from './NewsCard'
import type { StyleSection } from '@/lib/news-feed'

export default function StyleSections({ sections }: { sections: StyleSection[] }) {
  if (!sections.length) return null
  return (
    <div className="flex flex-col gap-10">
      {sections.map((s) => (
        <section key={s.id} className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <Link href={`/naujienos/stilius/${s.slug}`} className="group flex items-center gap-2.5">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-xl text-lg"
                style={{ background: `${s.accent}1a` }}
                aria-hidden
              >
                {s.icon}
              </span>
              <h2 className="text-lg font-black text-[var(--text-primary)] group-hover:underline" style={{ textDecorationColor: s.accent }}>
                {s.name}
              </h2>
            </Link>
            <Link
              href={`/naujienos/stilius/${s.slug}`}
              className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold"
              style={{ color: s.accent }}
            >
              Visos <ArrowRight size={13} />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {s.items.slice(0, 6).map((item) => (
              <NewsCard key={item.uid} item={item} accent={s.accent} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
