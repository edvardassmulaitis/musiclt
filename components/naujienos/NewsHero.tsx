// components/naujienos/NewsHero.tsx
//
// Featured blokas — viena didelė pagrindinė naujiena + šoninis naujausių
// sąrašas. Server komponentas (žurnalo „above the fold" akcentas).

import NewsCard from './NewsCard'
import type { NewsFeedItem } from '@/lib/news-shared'

export default function NewsHero({ items }: { items: NewsFeedItem[] }) {
  if (!items.length) return null
  const [lead, ...rest] = items
  const side = rest.slice(0, 4)

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <NewsCard item={lead} variant="hero" />
      </div>
      {side.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-3xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-3">
          <span className="px-2 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
            Naujausios
          </span>
          {side.map((item) => (
            <NewsCard key={item.uid} item={item} variant="compact" />
          ))}
        </div>
      )}
    </div>
  )
}
