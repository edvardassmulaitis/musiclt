'use client'
// components/naujienos/NewsExplorer.tsx
//
// Naujienų naršyklė — kompaktiška filtrų juosta (house „afb" stilius iš
// /atlikejai) + client-side filtravimas BE puslapio perkrovimo (be header
// šokinėjimo). Filtrai KOMBINUOJAMI per ašis: Tipas + Stilius + Šalis
// (pvz. Koncertai × Elektroninė). URL sinchronizuojamas (shareable, scroll:false).
//
// Du vaizdai:
//   • be filtrų (tik hub'e) → `browse` children (hero + by-style sekcijos) +
//     „Visos naujienos" grid be hero dublių (heroUids išfiltruojami).
//   • su filtrais → tik rezultatų grid.
//
// SEO: pradinis renderis (initialItems) SSR'inamas, tad landing'ai turi turinį
// HTML'e; hidratacija įjungia interaktyvų filtravimą.

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import NewsCard from './NewsCard'
import type { NewsFeedItem } from '@/lib/news-shared'
import type { NewsFacets } from '@/lib/news-feed'
import { NEWS_TYPES, NEWS_STYLES } from '@/lib/news-taxonomy'

type Sort = 'newest' | 'popular'
type Scope = '' | 'lt' | 'world'
type Filters = { type: string; style: number | null; scope: Scope }

const PAGE = 24

export default function NewsExplorer({
  facets,
  initialItems,
  initialTotal,
  initialFilters,
  heroUids = [],
  browse,
  basePath = '/naujienos',
  lockAxis,
}: {
  facets: NewsFacets
  initialItems: NewsFeedItem[]
  initialTotal: number
  initialFilters: Filters
  /** Hero naujienų uid'ai — kad „Visos" grid jų nedublikuotų (tik be filtrų). */
  heroUids?: string[]
  /** Be filtrų rodomas turinys (hero + by-style sekcijos). Tik hub'e. */
  browse?: React.ReactNode
  basePath?: string
  /** Landing'o užrakinta ašis — jos chip'as visada aktyvus, neišjungiamas na.
   *  (Pvz. /naujienos/tipas/koncertai → lockAxis='type'.) */
  lockAxis?: 'type' | 'style' | 'scope'
}) {
  const router = useRouter()
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [items, setItems] = useState<NewsFeedItem[]>(initialItems)
  const [total, setTotal] = useState(initialTotal)
  const [sort, setSort] = useState<Sort>('newest')
  const [loading, setLoading] = useState(false)
  const reqId = useRef(0)
  const firstRender = useRef(true)
  const heroSet = useMemo(() => new Set(heroUids), [heroUids])

  const hasFilter = !!filters.type || filters.style != null || !!filters.scope

  const buildApi = useCallback((f: Filters, s: Sort, offset: number) => {
    const p = new URLSearchParams()
    if (f.style != null) p.set('style', String(f.style))
    if (f.type) p.set('category', f.type)
    if (f.scope) p.set('scope', f.scope)
    p.set('sort', s); p.set('limit', String(PAGE)); p.set('offset', String(offset))
    return `/api/naujienos?${p.toString()}`
  }, [])

  // URL sinchronizacija (shareable deep-link, be reload). Landing'uose nekeičiam
  // path'o — paliekam query papildomoms ašims.
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

  const fetchResults = useCallback(async (f: Filters, s: Sort) => {
    const id = ++reqId.current
    setLoading(true)
    try {
      const res = await fetch(buildApi(f, s, 0))
      const data = await res.json()
      if (id !== reqId.current) return
      setItems(data.items || [])
      setTotal(data.total || 0)
    } finally {
      if (id === reqId.current) setLoading(false)
    }
  }, [buildApi])

  // Filtrų/sort pokytis → refetch + URL sync (praleidžiam pirmą renderį — jis SSR).
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    fetchResults(filters, sort)
    syncUrl(filters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, sort])

  const loadMore = useCallback(async () => {
    const id = ++reqId.current
    setLoading(true)
    try {
      const res = await fetch(buildApi(filters, sort, items.length))
      const data = await res.json()
      if (id !== reqId.current) return
      setItems((prev) => [...prev, ...(data.items || [])])
      setTotal(data.total || 0)
    } finally {
      if (id === reqId.current) setLoading(false)
    }
  }, [buildApi, filters, sort, items.length])

  // Rodomi grid items: be filtrų — be hero dublių.
  const gridItems = useMemo(
    () => (hasFilter ? items : items.filter((i) => !heroSet.has(i.uid))),
    [items, hasFilter, heroSet]
  )
  const hasMore = items.length < total

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }))
  const clearAll = () => { setFilters({ type: '', style: null, scope: '' }) }

  const typesPresent = NEWS_TYPES.filter((t) => (facets.categories[t.key] || 0) > 0)
  const activeType = NEWS_TYPES.find((t) => t.key === filters.type) || null
  const activeStyle = NEWS_STYLES.find((s) => s.id === filters.style) || null

  return (
    <div className="nx">
      <style>{nxStyles}</style>

      {/* ── Filtrų juosta ── */}
      <div className="nx-bar">
        <div className="nx-seg" role="group" aria-label="Šalis">
          <button className={`nx-seg-btn${!filters.scope ? ' on' : ''}`} onClick={() => set({ scope: '' })} disabled={lockAxis === 'scope'}>Visos</button>
          <button className={`nx-seg-btn${filters.scope === 'lt' ? ' on' : ''}`} onClick={() => set({ scope: 'lt' })} disabled={lockAxis === 'scope'}>Lietuva</button>
          <button className={`nx-seg-btn${filters.scope === 'world' ? ' on' : ''}`} onClick={() => set({ scope: 'world' })} disabled={lockAxis === 'scope'}>Pasaulis</button>
        </div>

        {typesPresent.length > 0 && (
          <Dropdown
            label={activeType ? activeType.labelPlural : 'Tipas'}
            active={!!filters.type}
            accent={activeType?.accent}
            disabled={lockAxis === 'type'}
          >
            {(close) => (
              <>
                <button className={`nx-opt${!filters.type ? ' on' : ''}`} onClick={() => { set({ type: '' }); close() }}>Visi tipai</button>
                {typesPresent.map((t) => (
                  <button key={t.key} className={`nx-opt${filters.type === t.key ? ' on' : ''}`} onClick={() => { set({ type: t.key }); close() }}>
                    <span className="nx-dot" style={{ background: t.accent }} />
                    <span className="nx-opt-name">{t.labelPlural}</span>
                    <span className="nx-opt-n">{(facets.categories[t.key] || 0).toLocaleString('lt-LT')}</span>
                  </button>
                ))}
              </>
            )}
          </Dropdown>
        )}

        <Dropdown
          label={activeStyle ? activeStyle.name.replace(' muzika', '') : 'Stilius'}
          active={filters.style != null}
          accent={activeStyle?.accent}
          disabled={lockAxis === 'style'}
        >
          {(close) => (
            <>
              <button className={`nx-opt${filters.style == null ? ' on' : ''}`} onClick={() => { set({ style: null }); close() }}>Visi stiliai</button>
              {NEWS_STYLES.map((s) => (
                <button key={s.id} className={`nx-opt${filters.style === s.id ? ' on' : ''}`} onClick={() => { set({ style: s.id }); close() }}>
                  <span className="nx-dot" style={{ background: s.accent }} />
                  <span className="nx-opt-name">{s.name.replace(' muzika', '')}</span>
                  <span className="nx-opt-n">{(facets.styles[String(s.id)] || 0).toLocaleString('lt-LT')}</span>
                </button>
              ))}
            </>
          )}
        </Dropdown>

        <div className="nx-seg nx-sort" role="group" aria-label="Rūšiavimas">
          <button className={`nx-seg-btn${sort === 'newest' ? ' on' : ''}`} onClick={() => setSort('newest')}>Naujausios</button>
          <button className={`nx-seg-btn${sort === 'popular' ? ' on' : ''}`} onClick={() => setSort('popular')}>Populiarios</button>
        </div>

        {hasFilter && !lockAxis && (
          <button className="nx-clear" onClick={clearAll}>✕ Išvalyti</button>
        )}
        <span className="nx-count">{total.toLocaleString('lt-LT')}</span>
      </div>

      {/* ── Turinys ── */}
      {!hasFilter && browse ? (
        <div className={loading ? 'nx-fade' : ''}>
          {browse}
          {gridItems.length > 0 && (
            <section className="nx-more">
              <h2 className="nx-more-title">Visos naujienos</h2>
              <Grid items={gridItems} />
            </section>
          )}
        </div>
      ) : (
        <div className={loading ? 'nx-fade' : ''}>
          {gridItems.length === 0 && !loading ? (
            <div className="nx-empty">Pagal pasirinktus filtrus naujienų nerasta</div>
          ) : (
            <Grid items={gridItems} />
          )}
        </div>
      )}

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
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((it) => <NewsCard key={it.uid} item={it} />)}
    </div>
  )
}

function Dropdown({
  label, active, accent, disabled, children,
}: {
  label: string
  active: boolean
  accent?: string
  disabled?: boolean
  children: (close: () => void) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <div className="nx-dd" ref={ref}>
      <button
        type="button"
        className={`nx-trig${active ? ' active' : ''}`}
        onClick={() => !disabled && setOpen((o) => !o)}
        aria-expanded={open}
        style={{ ['--nx-accent' as any]: accent || 'var(--accent-orange)' }}
      >
        {active && accent && <span className="nx-dot" style={{ background: accent }} />}
        <span className="nx-trig-text">{label}</span>
        {!disabled && <svg className="nx-caret" width="10" height="6" viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>}
      </button>
      {open && <div className="nx-pop">{children(() => setOpen(false))}</div>}
    </div>
  )
}

const nxStyles = `
.nx-bar { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:22px; }
.nx-seg { display:inline-flex; padding:3px; gap:2px; border-radius:11px; background:var(--bg-hover); border:1px solid var(--border-default,rgba(255,255,255,0.08)); }
.nx-seg-btn { padding:6px 13px; border:none; background:transparent; color:var(--text-secondary); font-size:12.5px; font-weight:700; font-family:'Outfit',sans-serif; border-radius:8px; cursor:pointer; transition:all .15s; white-space:nowrap; }
.nx-seg-btn:hover:not(:disabled) { color:var(--text-primary); }
.nx-seg-btn.on { background:var(--accent-orange,#f59e0b); color:#fff; }
.nx-seg-btn:disabled { cursor:default; }
.nx-dd { position:relative; }
.nx-trig { display:inline-flex; align-items:center; gap:7px; height:38px; padding:0 13px; border-radius:11px; background:var(--bg-hover); border:1px solid var(--border-default,rgba(255,255,255,0.08)); color:var(--text-secondary); font-size:12.5px; font-weight:700; font-family:'Outfit',sans-serif; cursor:pointer; transition:all .15s; }
.nx-trig:hover { color:var(--text-primary); }
.nx-trig.active { color:var(--text-primary); border-color:var(--nx-accent,var(--accent-orange)); background:color-mix(in srgb, var(--nx-accent,#f59e0b) 12%, transparent); }
.nx-trig-text { max-width:170px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.nx-caret { opacity:.55; flex-shrink:0; }
.nx-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
.nx-pop { position:absolute; top:calc(100% + 6px); left:0; z-index:120; width:248px; max-height:340px; overflow-y:auto; padding:6px; background:var(--bg-elevated); border:1px solid var(--border-default,rgba(255,255,255,0.1)); border-radius:13px; box-shadow:0 18px 50px rgba(0,0,0,.5); }
.nx-opt { width:100%; display:flex; align-items:center; gap:9px; padding:8px 10px; border:none; background:transparent; border-radius:9px; font-size:13px; font-weight:600; font-family:'DM Sans',sans-serif; color:var(--text-secondary); cursor:pointer; transition:background .12s,color .12s; text-align:left; }
.nx-opt:hover { background:var(--bg-hover); color:var(--text-primary); }
.nx-opt.on { background:var(--bg-hover); color:var(--text-primary); }
.nx-opt-name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.nx-opt-n { font-size:11.5px; font-weight:600; color:var(--text-faint); }
.nx-clear { height:38px; display:inline-flex; align-items:center; padding:0 13px; border-radius:11px; font-size:12px; font-weight:700; background:transparent; border:1px solid var(--border-default,rgba(255,255,255,0.08)); color:var(--text-faint); cursor:pointer; font-family:'Outfit',sans-serif; }
.nx-clear:hover { color:var(--text-primary); border-color:var(--border-strong); }
.nx-count { margin-left:auto; font-size:12.5px; font-weight:700; color:var(--text-faint); white-space:nowrap; }
.nx-fade { opacity:.5; transition:opacity .12s; }
.nx-more { margin-top:38px; }
.nx-more-title { font-size:20px; font-weight:900; color:var(--text-primary); margin-bottom:16px; font-family:'Outfit',sans-serif; }
.nx-empty { padding:48px; text-align:center; color:var(--text-muted); border:1px dashed var(--border-default); border-radius:16px; }
.nx-more-wrap { display:flex; justify-content:center; padding-top:24px; }
.nx-loadmore { padding:10px 26px; border-radius:999px; border:1px solid var(--border-strong); background:var(--bg-elevated); color:var(--text-primary); font-size:14px; font-weight:700; font-family:'Outfit',sans-serif; cursor:pointer; transition:background .15s; }
.nx-loadmore:hover:not(:disabled) { background:var(--bg-hover); }
.nx-loadmore:disabled { opacity:.6; cursor:default; }
@media(max-width:680px){ .nx-count{ width:100%; margin:2px 0 0; text-align:right; } }
`
