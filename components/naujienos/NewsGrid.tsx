'use client'
// components/naujienos/NewsGrid.tsx
//
// Client grid su „Rodyti daugiau" + sort perjungimu (Naujausios / Populiariausios)
// + paieška. Užklausa eina į /api/naujienos su tais pačiais filtrais kaip
// serverio puslapis (style/category/scope perduodami per props).

import { useState, useCallback, useRef, useEffect } from 'react'
import { Loader2, Search, X } from 'lucide-react'
import NewsCard from './NewsCard'
import type { NewsFeedItem } from '@/lib/news-shared'

type Sort = 'newest' | 'popular'

export default function NewsGrid({
  initialItems,
  initialTotal,
  lockedStyle = null,
  lockedCategory = null,
  lockedScope = null,
  pageSize = 24,
  showControls = true,
  heading = 'Visos naujienos',
}: {
  initialItems: NewsFeedItem[]
  initialTotal: number
  lockedStyle?: number | null
  lockedCategory?: string | null
  lockedScope?: string | null
  pageSize?: number
  showControls?: boolean
  heading?: string
}) {
  const [items, setItems] = useState<NewsFeedItem[]>(initialItems)
  const [total, setTotal] = useState(initialTotal)
  const [sort, setSort] = useState<Sort>('newest')
  const [search, setSearch] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const reqId = useRef(0)

  const buildUrl = useCallback(
    (offset: number, s: Sort, q: string) => {
      const p = new URLSearchParams()
      if (lockedStyle != null) p.set('style', String(lockedStyle))
      if (lockedCategory) p.set('category', lockedCategory)
      if (lockedScope) p.set('scope', lockedScope)
      if (q) p.set('search', q)
      p.set('sort', s)
      p.set('limit', String(pageSize))
      p.set('offset', String(offset))
      return `/api/naujienos?${p.toString()}`
    },
    [lockedStyle, lockedCategory, lockedScope, pageSize]
  )

  const reload = useCallback(
    async (s: Sort, q: string) => {
      const id = ++reqId.current
      setLoading(true)
      try {
        const res = await fetch(buildUrl(0, s, q))
        const data = await res.json()
        if (id !== reqId.current) return
        setItems(data.items || [])
        setTotal(data.total || 0)
      } finally {
        if (id === reqId.current) setLoading(false)
      }
    },
    [buildUrl]
  )

  const loadMore = useCallback(async () => {
    const id = ++reqId.current
    setLoading(true)
    try {
      const res = await fetch(buildUrl(items.length, sort, activeSearch))
      const data = await res.json()
      if (id !== reqId.current) return
      setItems((prev) => [...prev, ...(data.items || [])])
      setTotal(data.total || 0)
    } finally {
      if (id === reqId.current) setLoading(false)
    }
  }, [buildUrl, items.length, sort, activeSearch])

  // Sort keitimas → reload nuo 0
  const onSort = (s: Sort) => {
    if (s === sort) return
    setSort(s)
    reload(s, activeSearch)
  }

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const q = search.trim()
    setActiveSearch(q)
    reload(sort, q)
  }
  const clearSearch = () => {
    setSearch('')
    setActiveSearch('')
    reload(sort, '')
  }

  const hasMore = items.length < total

  return (
    <section className="flex flex-col gap-4">
      {showControls && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-black text-[var(--text-primary)]">
            {heading}
            <span className="ml-2 text-sm font-medium text-[var(--text-faint)]">{total.toLocaleString('lt-LT')}</span>
          </h2>
          <div className="flex items-center gap-2">
            <form onSubmit={onSearchSubmit} className="relative">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ieškoti…"
                className="w-36 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] py-1.5 pl-8 pr-7 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--border-strong)] sm:w-44"
              />
              {activeSearch && (
                <button type="button" onClick={clearSearch} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-faint)] hover:text-[var(--text-primary)]">
                  <X size={14} />
                </button>
              )}
            </form>
            <div className="flex rounded-full border border-[var(--border-default)] p-0.5">
              {(['newest', 'popular'] as Sort[]).map((s) => (
                <button
                  key={s}
                  onClick={() => onSort(s)}
                  className="rounded-full px-3 py-1 text-[12px] font-semibold transition-colors"
                  style={sort === s ? { background: 'var(--accent-orange,#f59e0b)', color: '#fff' } : { color: 'var(--text-muted)' }}
                >
                  {s === 'newest' ? 'Naujausios' : 'Populiarios'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {items.length === 0 && !loading ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-default)] p-12 text-center text-[var(--text-muted)]">
          {activeSearch ? `Nieko nerasta pagal „${activeSearch}"` : 'Naujienų dar nėra'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <NewsCard key={item.uid} item={item} />
          ))}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center pt-2">
          <button
            onClick={loadMore}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--bg-surface)] px-6 py-2.5 text-[14px] font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface-hover,rgba(125,125,125,0.07))] disabled:opacity-60"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            Rodyti daugiau
          </button>
        </div>
      )}
    </section>
  )
}
