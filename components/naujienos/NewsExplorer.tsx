'use client'
// components/naujienos/NewsExplorer.tsx
//
// Naujienų naršyklė — filtrų juosta TIKSLIAI kaip /koncertai (ev-fbar/ev-chip/
// Popover), kad būtų vientisa su svetaine. Filtravimas client-side, be perkrovimo;
// KOMBINUOJAMI: Tipas (inline chip'ai) × Stilius (dropdown) × LT atlikėjai (toggle).
// URL sync (?tipas=&stilius=&salis=). Be sort, be jokių count'ų.
//
// Turinys: be filtrų — featured (naujausia didelė + 2 šalia) + vientisas grid;
// su filtru — tik grid. JOKIŲ by-style sekcijų (nelogiška su stiliaus filtru).

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import NewsCard from './NewsCard'
import type { NewsFeedItem } from '@/lib/news-shared'
import { NEWS_TYPES, NEWS_STYLES } from '@/lib/news-taxonomy'

type Scope = '' | 'lt' | 'world'
type Filters = { type: string; style: number | null; scope: Scope }
const PAGE = 24

export default function NewsExplorer({
  initialItems, initialTotal, initialFilters, basePath = '/naujienos', lockAxis,
}: {
  initialItems: NewsFeedItem[]
  initialTotal: number
  initialFilters: Filters
  basePath?: string
  lockAxis?: 'type' | 'style' | 'scope'
}) {
  const router = useRouter()
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [items, setItems] = useState<NewsFeedItem[]>(initialItems)
  const [total, setTotal] = useState(initialTotal)
  const [loading, setLoading] = useState(false)
  const reqId = useRef(0)
  const firstRender = useRef(true)

  const hasFilter = !!filters.type || filters.style != null || !!filters.scope
  const showFeatured = !hasFilter && !lockAxis

  const buildApi = useCallback((f: Filters, offset: number) => {
    const p = new URLSearchParams()
    if (f.style != null) p.set('style', String(f.style))
    if (f.type) p.set('category', f.type)
    if (f.scope) p.set('scope', f.scope)
    p.set('limit', String(PAGE)); p.set('offset', String(offset))
    return `/api/naujienos?${p.toString()}`
  }, [])

  const syncUrl = useCallback((f: Filters) => {
    const p = new URLSearchParams()
    if (lockAxis !== 'type' && f.type) p.set('tipas', f.type)
    if (lockAxis !== 'style' && f.style != null) {
      const st = NEWS_STYLES.find((x) => x.id === f.style)
      if (st) p.set('stilius', st.slug)
    }
    if (lockAxis !== 'scope' && f.scope) p.set('salis', f.scope)
    const qs = p.toString()
    router.replace(`${basePath}${qs ? `?${qs}` : ''}`, { scroll: false })
  }, [router, basePath, lockAxis])

  const fetchResults = useCallback(async (f: Filters) => {
    const id = ++reqId.current
    setLoading(true)
    try {
      const res = await fetch(buildApi(f, 0))
      const data = await res.json()
      if (id !== reqId.current) return
      setItems(data.items || []); setTotal(data.total || 0)
    } finally { if (id === reqId.current) setLoading(false) }
  }, [buildApi])

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    fetchResults(filters); syncUrl(filters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  const loadMore = useCallback(async () => {
    const id = ++reqId.current
    setLoading(true)
    try {
      const res = await fetch(buildApi(filters, items.length))
      const data = await res.json()
      if (id !== reqId.current) return
      setItems((prev) => [...prev, ...(data.items || [])]); setTotal(data.total || 0)
    } finally { if (id === reqId.current) setLoading(false) }
  }, [buildApi, filters, items.length])

  const hasMore = items.length < total
  const setF = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }))
  const clearAll = () => setFilters({ type: '', style: null, scope: '' })
  const anyActive = !!filters.type || filters.style != null || !!filters.scope
  const activeStyle = NEWS_STYLES.find((s) => s.id === filters.style) || null

  const [styleOpen, setStyleOpen] = useState(false)
  const styleRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!styleOpen) return
    const onDown = (e: MouseEvent) => { if (styleRef.current && !styleRef.current.contains(e.target as Node)) setStyleOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setStyleOpen(false) }
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [styleOpen])

  // Featured (be filtrų): 3 naujausios didesnės kortelės viršuje; likusios į
  // grid (vienodas proporcingas dydis, be tiny/hero kontrasto).
  const featured3 = showFeatured ? items.slice(0, 3) : []
  const gridItems = showFeatured ? items.slice(3) : items

  return (
    <div className="nx">
      <style>{NX_CSS}</style>

      {/* ── Filtrų juosta (ev-fbar stilius) ── */}
      <div className="flt-bar flt-bar--wrap">
        {/* Tipai — INLINE chip'ai */}
        {NEWS_TYPES.filter((t) => t.key !== 'kita').map((t) => (
          <button key={t.key} className={`flt-chip${filters.type === t.key ? ' on' : ''}`} disabled={lockAxis === 'type'} onClick={() => setF({ type: filters.type === t.key ? '' : t.key })}>
            {t.labelPlural}
          </button>
        ))}

        <span className="flt-divider" />

        {/* Stilius — dropdown „Visi stiliai" */}
        <div className="ev-dd" ref={styleRef}>
          <button type="button" className={`flt-trig${filters.style != null ? ' active' : ''}`} disabled={lockAxis === 'style'} onClick={() => setStyleOpen((o) => !o)}>
            <span>{activeStyle ? activeStyle.name.replace(' muzika', '') : 'Visi stiliai'}</span>
            <svg className="flt-caret" viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
          </button>
          {styleOpen && (
            <div className="ev-pop" style={{ width: 220 }}>
              <div className="ev-pop-list">
                <button type="button" className={`ev-opt${filters.style == null ? ' on' : ''}`} onClick={() => { setF({ style: null }); setStyleOpen(false) }}>Visi stiliai</button>
                {NEWS_STYLES.map((s) => (
                  <button key={s.id} type="button" className={`ev-opt${filters.style === s.id ? ' on' : ''}`} onClick={() => { setF({ style: filters.style === s.id ? null : s.id }); setStyleOpen(false) }}>
                    {s.name.replace(' muzika', '')}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <span className="flt-divider" />

        {/* LT atlikėjai — vienas toggle su vėliava */}
        <button className={`flt-chip${filters.scope === 'lt' ? ' on' : ''}`} disabled={lockAxis === 'scope'} onClick={() => setF({ scope: filters.scope === 'lt' ? '' : 'lt' })}>
          <span>🇱🇹</span><span>LT atlikėjai</span>
        </button>

        {anyActive && !lockAxis && <button className="flt-reset" onClick={clearAll}>Išvalyti ✕</button>}
      </div>

      {/* ── Turinys ── */}
      <div className={loading ? 'nx-fade' : ''}>
        {items.length === 0 && !loading ? (
          <div className="nx-empty">Pagal pasirinktus filtrus naujienų nerasta</div>
        ) : showFeatured && featured3.length > 0 ? (
          <>
            <div className="nx-top3">
              {featured3.map((it) => <NewsCard key={it.uid} item={it} variant="feature" />)}
            </div>
            <Grid items={gridItems} />
          </>
        ) : (
          <Grid items={gridItems} />
        )}
      </div>

      {hasMore && (
        <div className="nx-more-wrap">
          <button onClick={loadMore} disabled={loading} className="nx-loadmore">
            {loading ? 'Kraunama…' : 'Rodyti daugiau'}
          </button>
        </div>
      )}
    </div>
  )
}

function Grid({ items }: { items: NewsFeedItem[] }) {
  if (!items.length) return null
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((it) => <NewsCard key={it.uid} item={it} />)}
    </div>
  )
}

const NX_CSS = `
.nx-fade { opacity:.5; transition:opacity .12s; }
.nx-empty { padding:48px; text-align:center; color:var(--text-muted); border:1px dashed var(--border-default); border-radius:16px; }
.nx-more-wrap { display:flex; justify-content:center; padding-top:26px; }
.nx-loadmore { padding:10px 26px; border-radius:999px; border:1px solid var(--border-strong); background:var(--bg-elevated); color:var(--text-primary); font-size:14px; font-weight:700; font-family:'Outfit',sans-serif; cursor:pointer; transition:background .15s; }
.nx-loadmore:hover:not(:disabled) { background:var(--bg-hover); }
.nx-loadmore:disabled { opacity:.6; cursor:default; }

/* Featured: 3 naujausios didesnės kortelės; proporcinga su grid'u žemiau */
.nx-top3 { display:grid; grid-template-columns:1fr; gap:14px; margin-bottom:18px; }
@media(min-width:640px){ .nx-top3 { grid-template-columns:repeat(3,1fr); gap:16px; } }
@media(min-width:1024px){ .nx-top3 { gap:20px; margin-bottom:22px; } }

/* ── Filtrų juosta — identiška /koncertai (ev-*) ── */
.ev-dd { position:relative; }
.ev-pop { position:absolute; top:calc(100% + 8px); left:0; z-index:50; padding:8px;
  background:var(--bg-surface); border:1px solid var(--border-default,rgba(255,255,255,0.1)); border-radius:14px;
  box-shadow:0 14px 40px rgba(0,0,0,0.32); }
.ev-pop-list { display:flex; flex-direction:column; gap:2px; max-height:300px; overflow-y:auto; }
.ev-opt { display:flex; align-items:center; gap:8px; text-align:left; width:100%; padding:8px 10px; border-radius:9px; font-size:13px;
  font-weight:600; font-family:'Outfit',sans-serif; cursor:pointer; background:transparent; border:none; color:var(--text-secondary); transition:all .12s; }
.ev-opt:hover { background:var(--bg-hover); color:var(--text-primary); }
.ev-opt.on { color:var(--accent-orange); }
`
