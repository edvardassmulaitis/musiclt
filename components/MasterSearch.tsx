'use client'

/**
 * MasterSearch — globalus paieškos overlay komponentas.
 *
 * Paskirtis: vienoje vietoje rasti viską — atlikėjus, albumus, dainas,
 * vartotojus, renginius, naujienas, blog'us, diskusijas. Atidaromas iš top
 * navigation, taip pat keyboard shortcut'ais (Cmd/Ctrl+K, "/" focus).
 *
 * Dizainas:
 *   - Full-screen overlay su blur'inta backdrop (premium feel).
 *   - Stiklinis input centre, didelis šriftas (24px), aiškus focus.
 *   - Live debounced (140ms) autosuggest — kviečiam /api/search-master.
 *   - Rezultatai grupuojami pagal kategoriją; default'iškai rodom Top
 *     hits (pirmas iš kiekvienos kategorijos, max 8).
 *   - Filtro chips po input'u — galima fokusuotis vienai kategorijai.
 *   - Kiekvienas item turi avatar/cover, title, subtitle, type badge.
 *   - Keyboard nav: ↑/↓ — items, Enter — atidaro, Esc — uždaro.
 *   - Recent searches saugom in-memory state'e (užmiršta po refresh —
 *     paprasta MVP).
 *   - Empty state: rodom "Try searching for…" + populiarūs atlikėjai.
 *
 * Performance:
 *   - Debounce 140ms — užtenka kad neapkrauti DB, bet greitai responsive.
 *   - Cache pagal query (Map'as) — back arrow neblink'ina.
 *   - AbortController — cancel'inam prieš tai vykusią užklausą kai keičiasi q.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { proxyImg } from '@/lib/img-proxy'

type Category =
  | 'artists' | 'albums' | 'tracks'
  | 'profiles' | 'events' | 'venues'
  | 'news' | 'blog_posts' | 'discussions'

type Hit = {
  id: number | string
  type: Category
  title: string
  subtitle?: string | null
  image_url?: string | null
  href: string
  meta?: Record<string, any>
  score?: number
}

type Results = Record<Category, Hit[]>
type Totals = Record<Category, number>

/* ─── Modern line-art SVG icons (vietoj emoji) ────────────────────────
 * Visi 16x16 viewBox, currentColor stroke / fill — paveldi tekstinę
 * spalvą iš parent'o. Match'ina likusio site'o ikonų stilių (lib/ui/Icons.tsx).
 */
const IconArtist = (p: { size?: number }) => (
  <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
)
const IconAlbum = (p: { size?: number }) => (
  <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="10"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
)
const IconTrack = (p: { size?: number }) => (
  <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M9 18V5l12-2v13"/>
    <circle cx="6" cy="18" r="3"/>
    <circle cx="18" cy="16" r="3"/>
  </svg>
)
const IconProfile = (p: { size?: number }) => (
  <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
)
const IconEvent = (p: { size?: number }) => (
  <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="4" width="18" height="18" rx="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
)
const IconVenue = (p: { size?: number }) => (
  <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
    <circle cx="12" cy="10" r="3"/>
  </svg>
)
const IconNews = (p: { size?: number }) => (
  <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/>
    <path d="M18 14h-8M15 18h-5M10 6h8v4h-8z"/>
  </svg>
)
const IconBlog = (p: { size?: number }) => (
  <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 20h9"/>
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
  </svg>
)
const IconDiscussion = (p: { size?: number }) => (
  <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
)

// Spalvos paletė — be žaliųjų atspalvių. Brand orange'as eina pagrindiniam
// turiniui (dainos), o likę kategorijos turi distinct atspalvį, kad UI'jus
// būtų lengva skenuoti. Visos čia hex'ais; CSS var alternatyva nepalaikytų
// Color+'22' alpha trick'o, todėl liekam su literal'iais.
const CAT_LABELS: Record<Category, { sg: string; pl: string; Icon: (p: { size?: number }) => React.ReactElement; color: string }> = {
  artists:     { sg: 'Atlikėjas',  pl: 'Atlikėjai',   Icon: IconArtist,     color: '#a78bfa' }, // purple
  albums:      { sg: 'Albumas',    pl: 'Albumai',     Icon: IconAlbum,      color: '#60a5fa' }, // blue
  tracks:      { sg: 'Daina',      pl: 'Dainos',      Icon: IconTrack,      color: '#f97316' }, // orange (brand)
  profiles:    { sg: 'Vartotojas', pl: 'Vartotojai',  Icon: IconProfile,    color: '#fb7185' }, // rose
  events:      { sg: 'Renginys',   pl: 'Renginiai',   Icon: IconEvent,      color: '#f472b6' }, // pink
  venues:      { sg: 'Vieta',      pl: 'Vietos',      Icon: IconVenue,      color: '#eab308' }, // amber
  news:        { sg: 'Naujiena',   pl: 'Naujienos',   Icon: IconNews,       color: '#22d3ee' }, // cyan
  blog_posts:  { sg: 'Blogas',     pl: 'Blogai',      Icon: IconBlog,       color: '#fb923c' }, // light orange
  discussions: { sg: 'Diskusija',  pl: 'Diskusijos',  Icon: IconDiscussion, color: '#ef4444' }, // red
}

const CAT_ORDER: Category[] = [
  'artists', 'tracks', 'albums', 'events', 'profiles',
  'news', 'blog_posts', 'discussions', 'venues',
]

const POPULAR_QUERIES = [
  'Andrius Mamontovas', 'Marijonas Mikutavičius', 'G&G Sindikatas',
  'Antis', 'Foje', 'Andrius Pojavis',
]

export type MasterSearchProps = {
  open: boolean
  onClose: () => void
}

export function MasterSearch({ open, onClose }: MasterSearchProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  const [activeCat, setActiveCat] = useState<Category | 'all'>('all')
  const [results, setResults] = useState<Results>(emptyResults())
  const [totals, setTotals] = useState<Totals>(emptyTotals())
  const [loading, setLoading] = useState(false)
  const [tookMs, setTookMs] = useState(0)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const cacheRef = useRef<Map<string, { results: Results; totals: Totals; took_ms: number }>>(new Map())
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [recentQueries, setRecentQueries] = useState<string[]>([])
  const [topArtists, setTopArtists] = useState<Hit[]>([])
  // Expanded — kai user'is filtruoja pagal vieną kategoriją, fetch'inam
  // limit=30 tos kategorijos rezultatų. Cache pagal `${q}|${cat}`.
  const [expanded, setExpanded] = useState<Partial<Record<Category, Hit[]>>>({})
  const expandedCacheRef = useRef<Map<string, Hit[]>>(new Map())
  const [expandLoading, setExpandLoading] = useState(false)

  // ── Atidarius — focus input + scroll lock ──
  // iOS Safari nesofuokuoja per setTimeout (user-gesture'ą prarandam).
  // Sprendimai:
  //   1. Focus iškart (sync) — dažnai veikia, nes hook'as run'inasi
  //      sinchroniniame React commit'e po user click'o.
  //   2. autoFocus prop'as ant input'o (backup).
  //   3. requestAnimationFrame fallback'as kai DOM dar montuojasi.
  // Body scroll lock'as iOS'e: `overflow: hidden` neužtenka, reikia
  // position:fixed + saugoti scrollY, kitu atveju background scroll'inasi.
  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    requestAnimationFrame(() => inputRef.current?.focus())
    const t = setTimeout(() => inputRef.current?.focus(), 60)

    // iOS-friendly scroll lock
    const scrollY = window.scrollY
    const prev = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
    }
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'

    try {
      const saved = sessionStorage.getItem('musiclt-recent-search')
      if (saved) setRecentQueries(JSON.parse(saved).slice(0, 8))
    } catch {}
    return () => {
      clearTimeout(t)
      document.body.style.overflow = prev.overflow
      document.body.style.position = prev.position
      document.body.style.top = prev.top
      document.body.style.width = prev.width
      window.scrollTo(0, scrollY)
    }
  }, [open])

  // ── Reset on close ──
  useEffect(() => {
    if (!open) {
      setQ('')
      setActiveCat('all')
      setSelectedIdx(0)
      setResults(emptyResults())
      setExpanded({})
    }
  }, [open])

  // ── Reset expanded kai keičiasi query ──
  useEffect(() => { setExpanded({}) }, [q])

  // ── Reset selection kai keičiasi kategorija (kad highlight'as nepasiklystų) ──
  useEffect(() => { setSelectedIdx(0) }, [activeCat])

  // ── Fetch expanded kai user'is pasirenka kategoriją ──
  // Visi → nieko nedarom (rodom default limit=12 rezultatus iš `results`).
  // Specifinė kategorija → fetch'inam limit=200 tos kategorijos rezultatų,
  // kad user'is galėtų scroll'inti per visą katalogą (pvz. visas 220
  // Mamontovo dainų be tolimesnių pagination round'ų).
  useEffect(() => {
    if (!open || activeCat === 'all') return
    const trimmed = q.trim()
    if (trimmed.length < 1) return
    const cacheKey = `${trimmed}|${activeCat}`
    const cached = expandedCacheRef.current.get(cacheKey)
    if (cached) {
      setExpanded(prev => ({ ...prev, [activeCat]: cached }))
      return
    }
    let cancelled = false
    setExpandLoading(true)
    fetch(`/api/search-master?q=${encodeURIComponent(trimmed)}&categories=${activeCat}&limit=200`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d) return
        const items = (d.results?.[activeCat] || []) as Hit[]
        expandedCacheRef.current.set(cacheKey, items)
        setExpanded(prev => ({ ...prev, [activeCat]: items }))
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setExpandLoading(false) })
    return () => { cancelled = true }
  }, [activeCat, q, open])

  // ── Užkrauti default top atlikėjus kai input tuščias ──
  useEffect(() => {
    if (!open || topArtists.length > 0) return
    fetch('/api/artists?limit=8&sort=score')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const arr = Array.isArray(d) ? d : (d?.artists || [])
        setTopArtists(arr.slice(0, 8).map((a: any) => ({
          id: a.id,
          type: 'artists' as Category,
          title: a.name,
          image_url: a.cover_image_url,
          href: `/atlikejai/${a.slug}`,
          score: a.score,
        })))
      })
      .catch(() => {})
  }, [open, topArtists.length])

  // ── Debounced fetch ──
  // Loading flag turi būti TRUE kai tik užklausa keičiasi, ne tik kai
  // fetch'as eina — taip "Nieko nerasta" neflash'ina tarp typing ir
  // serverio response'o (140ms debounce + serverio latency).
  // `lastQuery` saugo paskutinę užbaigtą fetch'ui užklausą, kad galėtume
  // identifikuoti "stale" state'us.
  const [lastQuery, setLastQuery] = useState('')
  useEffect(() => {
    if (!open) return
    const trimmed = q.trim()
    if (trimmed.length < 1) {
      setResults(emptyResults())
      setTotals(emptyTotals())
      setTookMs(0)
      setLoading(false)
      setLastQuery('')
      return
    }
    // Cache hit'as — galim atvaizduoti iškart be loading flash'o
    if (cacheRef.current.has(trimmed)) {
      const cached = cacheRef.current.get(trimmed)!
      setResults(cached.results)
      setTotals(cached.totals)
      setTookMs(cached.took_ms)
      setLastQuery(trimmed)
      setLoading(false)
      return
    }
    // Visi kiti atvejai — show loading immediately
    setLoading(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      runQuery(trimmed)
    }, 140)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, open])

  const runQuery = useCallback(async (query: string) => {
    const cached = cacheRef.current.get(query)
    if (cached) {
      setResults(cached.results)
      setTotals(cached.totals)
      setTookMs(cached.took_ms)
      setSelectedIdx(0)
      setLastQuery(query)
      setLoading(false)
      return
    }
    if (abortRef.current) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    try {
      // Default limit=12 — šiek tiek daugiau negu API default (10), kad
      // "Visi" view'e tilptų po nurodytą kiekį per kategoriją.
      const r = await fetch(`/api/search-master?q=${encodeURIComponent(query)}&limit=12`, {
        signal: ctrl.signal,
      })
      if (!r.ok) throw new Error('search failed')
      const d = await r.json()
      const safeResults: Results = { ...emptyResults(), ...(d.results || {}) }
      const safeTotals: Totals = { ...emptyTotals(), ...(d.totals || {}) }
      cacheRef.current.set(query, { results: safeResults, totals: safeTotals, took_ms: d.took_ms || 0 })
      setResults(safeResults)
      setTotals(safeTotals)
      setTookMs(d.took_ms || 0)
      setSelectedIdx(0)
      setLastQuery(query)
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      console.error('Search error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Effective results — kai activeCat = specifinė kategorija ir
  // turim expanded data tai kategorijai, naudojam ją (limit=30); kitaip
  // grįžtam prie default'inių (limit=6). 'Visi' visada naudoja default. ──
  const effectiveResults = useMemo<Results>(() => {
    if (activeCat === 'all') return results
    const expandedItems = expanded[activeCat]
    if (expandedItems && expandedItems.length > 0) {
      return { ...results, [activeCat]: expandedItems }
    }
    return results
  }, [results, expanded, activeCat])

  // ── Flat list visų rezultatų (keyboard nav per visą sąrašą) ──
  const flatHits = useMemo(() => {
    const out: Hit[] = []
    for (const cat of CAT_ORDER) {
      if (activeCat !== 'all' && activeCat !== cat) continue
      out.push(...(effectiveResults[cat] || []))
    }
    return out
  }, [effectiveResults, activeCat])

  // ── Keyboard nav ──
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIdx(i => Math.min(i + 1, flatHits.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIdx(i => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        if (flatHits[selectedIdx]) {
          e.preventDefault()
          go(flatHits[selectedIdx])
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, flatHits, selectedIdx, q, onClose])

  const go = useCallback((hit: Hit) => {
    // Save į recent
    if (q.trim().length >= 2) {
      const next = [q.trim(), ...recentQueries.filter(r => r !== q.trim())].slice(0, 8)
      setRecentQueries(next)
      try { sessionStorage.setItem('musiclt-recent-search', JSON.stringify(next)) } catch {}
    }
    onClose()
    // delay nav iki transition'o pabaigos kad smooth atrodytų
    setTimeout(() => router.push(hit.href), 50)
  }, [q, recentQueries, onClose, router])

  // ── Scroll selected į view ──
  useEffect(() => {
    if (!open) return
    const el = document.querySelector<HTMLElement>(`[data-search-idx="${selectedIdx}"]`)
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedIdx, open])

  if (!open) return null

  const total = flatHits.length
  const trimmedQ = q.trim()
  const showEmpty = trimmedQ.length === 0
  // Stale: user'is keičia užklausą, bet fetch dar nesusinchronizavo —
  // šiuo metu rodom loader, ne "nieko nerasta".
  const isStale = !showEmpty && lastQuery !== trimmedQ
  const showLoader = !showEmpty && (loading || isStale)
  const showNoResults = !showEmpty && !showLoader && total === 0

  // Counts per category — naudojam totals iš serverio (pilna count DB), o
  // jei totals nepriėjo (legacy fallback), gradient'iškai imam returned items.
  const counts: Record<Category, number> = {} as any
  for (const cat of CAT_ORDER) {
    counts[cat] = totals[cat] || (results[cat] || []).length
  }
  const totalAcrossCats = CAT_ORDER.reduce((s, c) => s + counts[c], 0)
  // Visible — kiek REALIAI matom UI'jus (limit'as gali skirtis nuo totals).
  const visibleCounts: Record<Category, number> = {} as any
  for (const cat of CAT_ORDER) {
    visibleCounts[cat] = (effectiveResults[cat] || []).length
  }

  return (
    <>
      <style>{searchCss}</style>
      <div className="ms-overlay" onClick={onClose} />
      <div className="ms-shell" role="dialog" aria-modal="true" aria-label="Paieška">
        {/* ── Top: input ── */}
        <div className="ms-input-wrap">
          <span className="ms-input-icon" aria-hidden>
            {showLoader ? <Equalizer /> : <SearchIcon />}
          </span>
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Ieškoti"
            className="ms-input"
            autoComplete="off"
            spellCheck={false}
            // autoFocus — iOS Safari'ui užtikrinimui (kartu su sync focus
            // call'u useEffect'e). Be šito mobile user'iams reikėdavo
            // pirmiausia tap'inti į input'ą, o tik tada virš klaviatūra
            // atsidarydavo.
            autoFocus
            inputMode="search"
            enterKeyHint="search"
          />
          {q.length > 0 && (
            <button className="ms-clear" onClick={() => { setQ(''); inputRef.current?.focus() }} aria-label="Išvalyti">
              <CloseIcon />
            </button>
          )}
          <button className="ms-close" onClick={onClose} aria-label="Uždaryti">
            <span className="ms-kbd">Esc</span>
          </button>
        </div>

        {/* ── Filter chips ── */}
        {q.trim().length > 0 && totalAcrossCats > 0 && (
          <div className="ms-chips">
            <button
              className={`ms-chip ${activeCat === 'all' ? 'on' : ''}`}
              onClick={() => setActiveCat('all')}
            >
              Visi <span className="ms-chip-num">{totalAcrossCats}</span>
            </button>
            {CAT_ORDER.filter(c => counts[c] > 0).map(cat => {
              const Ico = CAT_LABELS[cat].Icon
              const isActive = activeCat === cat
              return (
                <button
                  key={cat}
                  className={`ms-chip ${isActive ? 'on' : ''}`}
                  onClick={() => setActiveCat(cat)}
                  style={isActive ? { borderColor: CAT_LABELS[cat].color, color: CAT_LABELS[cat].color } : undefined}
                >
                  <span className="ms-chip-ico" style={{ color: CAT_LABELS[cat].color }}><Ico size={13} /></span>
                  {CAT_LABELS[cat].pl}
                  <span className="ms-chip-num">{counts[cat]}{isActive && expandLoading ? '…' : ''}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* ── Body ──
            Render priority: empty state > loading (be results) > no-results > rezultatai.
            Loader rodom kai užklausa keičiasi BET dar neturim rezultatų toj užklausai.
            Jei jau turim cached results — rodom juos su small loading hint įvedimo lauke. */}
        <div className="ms-body">
          {showEmpty && <EmptyState
            recent={recentQueries}
            popular={POPULAR_QUERIES}
            topArtists={topArtists}
            onPick={(s) => setQ(s)}
            onGo={(h) => go(h)}
          />}

          {showLoader && total === 0 && (
            <div className="ms-loader">
              <BigEqualizer />
              <div className="ms-loader-text">Ieškau „{trimmedQ}"…</div>
            </div>
          )}

          {showNoResults && (
            <div className="ms-noresults">
              <div className="ms-noresults-icon">
                <SearchIcon />
              </div>
              <div className="ms-noresults-title">Nieko nerasta užklausai „{trimmedQ}"</div>
              <div className="ms-noresults-hint">Pabandyk kitą paiešką arba tikrink rašybą.</div>
            </div>
          )}

          {!showEmpty && total > 0 && (
            <ResultsList
              results={effectiveResults}
              totals={totals}
              activeCat={activeCat}
              selectedIdx={selectedIdx}
              onSelect={(i) => setSelectedIdx(i)}
              onGo={go}
              onExpandCategory={(cat) => setActiveCat(cat)}
            />
          )}
        </div>

        {/* ── Footer: hint ── */}
        <div className="ms-footer">
          <span className="ms-footer-keys">
            <span className="ms-kbd">↑</span><span className="ms-kbd">↓</span> naviguoti
            &nbsp;·&nbsp;
            <span className="ms-kbd">Enter</span> atidaryti
            &nbsp;·&nbsp;
            <span className="ms-kbd">Esc</span> uždaryti
          </span>
          {tookMs > 0 && (
            <span className="ms-footer-stats">{total} rezultatai · {tookMs}ms</span>
          )}
        </div>
      </div>
    </>
  )
}

/* ─── Sub-components ─────────────────────────────────────────────── */

function ResultsList({
  results, totals, activeCat, selectedIdx, onSelect, onGo, onExpandCategory,
}: {
  results: Results
  totals: Totals
  activeCat: Category | 'all'
  selectedIdx: number
  onSelect: (i: number) => void
  onGo: (h: Hit) => void
  onExpandCategory: (cat: Category) => void
}) {
  let idx = -1
  return (
    <div className="ms-groups">
      {CAT_ORDER.map(cat => {
        const items = results[cat] || []
        if (items.length === 0) return null
        if (activeCat !== 'all' && activeCat !== cat) return null
        const meta = CAT_LABELS[cat]
        const Ico = meta.Icon
        const totalForCat = totals[cat] || items.length
        const moreAvailable = activeCat === 'all' && totalForCat > items.length
        return (
          <div key={cat} className="ms-group">
            <div className="ms-group-head">
              <span className="ms-group-ico" style={{ color: meta.color }} aria-hidden><Ico size={13} /></span>
              <span className="ms-group-label">{meta.pl}</span>
              <span className="ms-group-count">
                {totalForCat > items.length ? `${items.length} / ${totalForCat}` : items.length}
              </span>
            </div>
            <div className={`ms-items ${cat === 'artists' || cat === 'profiles' ? 'as-grid' : ''}`}>
              {items.map(h => {
                idx++
                const i = idx
                return (
                  <ResultRow
                    key={`${h.type}-${h.id}`}
                    hit={h}
                    selected={i === selectedIdx}
                    dataIdx={i}
                    onMouseEnter={() => onSelect(i)}
                    onClick={() => onGo(h)}
                    layoutGrid={cat === 'artists' || cat === 'profiles'}
                  />
                )
              })}
            </div>
            {moreAvailable && (
              <button
                className="ms-more-link"
                onClick={() => onExpandCategory(cat)}
                style={{ color: meta.color }}
              >
                Rodyti visus {meta.pl.toLowerCase()} ({totalForCat})
                <span aria-hidden style={{ marginLeft: 4 }}>→</span>
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ResultRow({
  hit, selected, dataIdx, onMouseEnter, onClick, layoutGrid,
}: {
  hit: Hit
  selected: boolean
  dataIdx: number
  onMouseEnter: () => void
  onClick: () => void
  layoutGrid?: boolean
}) {
  const meta = CAT_LABELS[hit.type]
  const Ico = meta.Icon
  const img = proxyImg(hit.image_url || '')
  const isCircle = hit.type === 'artists' || hit.type === 'profiles'

  if (layoutGrid) {
    return (
      <button
        data-search-idx={dataIdx}
        className={`ms-grid-item ${selected ? 'sel' : ''}`}
        onMouseEnter={onMouseEnter}
        onClick={onClick}
      >
        <div className="ms-grid-img-wrap">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt="" className="ms-grid-img" loading="lazy" />
          ) : (
            <div className="ms-grid-fallback" style={{ background: meta.color + '22', color: meta.color }}>
              <Ico size={26} />
            </div>
          )}
        </div>
        <div className="ms-grid-text">
          <div className="ms-grid-title">{hit.title}</div>
          {hit.subtitle && <div className="ms-grid-sub">{hit.subtitle}</div>}
        </div>
      </button>
    )
  }

  return (
    <button
      data-search-idx={dataIdx}
      className={`ms-row ${selected ? 'sel' : ''}`}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
    >
      <div className={`ms-row-img ${isCircle ? 'circle' : ''}`}>
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" loading="lazy" />
        ) : (
          <div className="ms-row-fallback" style={{ background: meta.color + '22', color: meta.color }}>
            <Ico size={18} />
          </div>
        )}
      </div>
      <div className="ms-row-text">
        <div className="ms-row-title">{hit.title}</div>
        {hit.subtitle && <div className="ms-row-sub">{hit.subtitle}</div>}
      </div>
      <div className="ms-row-badge" style={{ color: meta.color, borderColor: meta.color + '40' }}>
        <Ico size={11} />
        <span>{meta.sg}</span>
      </div>
      <div className="ms-row-arrow" aria-hidden>
        <ArrowReturn />
      </div>
    </button>
  )
}

function EmptyState({
  recent, popular, topArtists, onPick, onGo,
}: {
  recent: string[]
  popular: string[]
  topArtists: Hit[]
  onPick: (s: string) => void
  onGo: (h: Hit) => void
}) {
  return (
    <div className="ms-empty">
      {recent.length > 0 && (
        <div className="ms-empty-block">
          <div className="ms-empty-title">Neseniai ieškojai</div>
          <div className="ms-empty-pills">
            {recent.map(r => (
              <button key={r} className="ms-pill" onClick={() => onPick(r)}>
                <ClockIcon /> {r}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="ms-empty-block">
        <div className="ms-empty-title">Populiarios paieškos</div>
        <div className="ms-empty-pills">
          {popular.map(r => (
            <button key={r} className="ms-pill" onClick={() => onPick(r)}>
              <FlameIcon /> {r}
            </button>
          ))}
        </div>
      </div>

      {topArtists.length > 0 && (
        <div className="ms-empty-block">
          <div className="ms-empty-title">Top atlikėjai dabar</div>
          <div className="ms-empty-grid">
            {topArtists.map(a => (
              <button
                key={a.id}
                className="ms-grid-item"
                onClick={() => onGo(a)}
              >
                <div className="ms-grid-img-wrap">
                  {a.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={proxyImg(a.image_url)} alt="" className="ms-grid-img" loading="lazy" />
                  ) : (
                    <div className="ms-grid-fallback" style={{ background: '#a78bfa22', color: '#a78bfa' }}>
                      <IconArtist size={26} />
                    </div>
                  )}
                </div>
                <div className="ms-grid-text">
                  <div className="ms-grid-title">{a.title}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Icons ──────────────────────────────────────────────────────── */
function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
    </svg>
  )
}
function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  )
}
function ClockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  )
}
function FlameIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2c1.5 4 4 5 4 9a4 4 0 0 1-8 0c0-1 .5-2 .5-3-2 1-3.5 3-3.5 6a7 7 0 1 0 14 0c0-5-4-7-7-12z"/>
    </svg>
  )
}
/** Equalizer-style loader — 4 vertical bars bouncing su staggered delay'ais.
 *  Match'ina kitur svetainėje naudojamą EqualizerLoader (MusicSearchPicker.tsx). */
function Equalizer() {
  return (
    <span className="ms-eq" aria-hidden>
      {[0, 0.12, 0.24, 0.36].map((d, i) => (
        <span key={i} style={{ animationDelay: `${d}s` }} />
      ))}
    </span>
  )
}

/** Didesnė versija centriniam loading state'ui body viduje. */
function BigEqualizer() {
  return (
    <span className="ms-eq-big" aria-hidden>
      {[0, 0.10, 0.20, 0.30, 0.15].map((d, i) => (
        <span key={i} style={{ animationDelay: `${d}s` }} />
      ))}
    </span>
  )
}

/** Return arrow icon (Enter), naudojamas hover'inant row'ą. */
function ArrowReturn() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 10 4 15 9 20"/>
      <path d="M20 4v7a4 4 0 0 1-4 4H4"/>
    </svg>
  )
}

/* ─── Helpers ────────────────────────────────────────────────────── */
function emptyResults(): Results {
  return {
    artists: [], albums: [], tracks: [],
    profiles: [], events: [], venues: [],
    news: [], blog_posts: [], discussions: [],
  }
}

function emptyTotals(): Totals {
  return {
    artists: 0, albums: 0, tracks: 0,
    profiles: 0, events: 0, venues: 0,
    news: 0, blog_posts: 0, discussions: 0,
  }
}

/* ─── CSS — visi styles per <style> tag, kad nereikėtų global stylesheet ── */
const searchCss = `
.ms-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(8, 10, 18, 0.7);
  backdrop-filter: blur(14px) saturate(120%);
  -webkit-backdrop-filter: blur(14px) saturate(120%);
  animation: ms-fade .18s ease-out;
}

.ms-shell {
  position: fixed;
  top: 5vh; left: 50%; transform: translateX(-50%);
  width: min(820px, calc(100vw - 32px));
  max-height: 88vh;
  z-index: 1001;
  display: flex; flex-direction: column;
  background: var(--bg-surface, #1a1d29);
  border: 1px solid var(--border-default, rgba(255,255,255,0.08));
  border-radius: 18px;
  box-shadow:
    0 30px 80px rgba(0,0,0,0.5),
    0 8px 24px rgba(0,0,0,0.3),
    inset 0 1px 0 rgba(255,255,255,0.04);
  overflow: hidden;
  animation: ms-pop .2s cubic-bezier(.2, .9, .3, 1.1);
  font-family: 'DM Sans', -apple-system, sans-serif;
}

@keyframes ms-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes ms-pop {
  0% { opacity: 0; transform: translate(-50%, 8px) scale(.97) }
  100% { opacity: 1; transform: translate(-50%, 0) scale(1) }
}

/* ── Equalizer loader — 4 bars su animation delay'ais ── */
.ms-eq {
  display: inline-flex; align-items: flex-end;
  gap: 2px; height: 16px; width: 18px;
}
.ms-eq > span {
  display: block;
  width: 3px; height: 30%;
  background: var(--accent-orange, #fb923c);
  border-radius: 1px;
  animation: ms-eqBar .85s ease-in-out infinite alternate;
}
@keyframes ms-eqBar {
  0% { height: 30%; }
  50% { height: 100%; }
  100% { height: 50%; }
}
.ms-eq-big {
  display: inline-flex; align-items: flex-end;
  gap: 4px; height: 44px; width: 50px;
}
.ms-eq-big > span {
  display: block;
  width: 6px; height: 30%;
  background: var(--accent-orange, #fb923c);
  border-radius: 2px;
  animation: ms-eqBar 1.0s ease-in-out infinite alternate;
}

/* ── Input ── */
.ms-input-wrap {
  position: relative;
  display: flex; align-items: center;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-default, rgba(255,255,255,0.08));
  gap: 12px;
  flex-shrink: 0;
}
.ms-input-icon { color: var(--text-muted, #888); display: flex; }
.ms-input {
  flex: 1;
  background: transparent;
  border: none; outline: none;
  font-size: 19px; font-weight: 500;
  color: var(--text-primary, #fff);
  font-family: inherit;
  letter-spacing: -0.005em;
  padding: 4px 0;
  -webkit-appearance: none;
  -webkit-tap-highlight-color: transparent;
}
.ms-input:focus, .ms-input:focus-visible { outline: none; box-shadow: none; }
.ms-input::placeholder { color: var(--text-muted, #888); font-weight: 400; }
.ms-clear {
  width: 26px; height: 26px;
  border: none; background: var(--bg-hover, rgba(255,255,255,0.05));
  border-radius: 6px; cursor: pointer;
  color: var(--text-muted, #aaa);
  display: flex; align-items: center; justify-content: center;
  transition: background .12s, color .12s;
}
.ms-clear:hover { background: var(--bg-hover, rgba(255,255,255,0.1)); color: var(--text-primary, #fff); }
.ms-close {
  border: none; background: transparent; cursor: pointer;
  color: var(--text-muted, #888);
  padding: 4px 8px; border-radius: 6px;
  transition: color .12s;
}
.ms-close:hover { color: var(--text-primary, #fff); }
.ms-kbd {
  display: inline-block;
  font-family: 'SF Mono', monospace; font-size: 10px; font-weight: 600;
  padding: 2px 6px;
  background: var(--bg-hover, rgba(255,255,255,0.06));
  border: 1px solid var(--border-default, rgba(255,255,255,0.08));
  border-radius: 5px;
  color: var(--text-muted, #aaa);
  line-height: 1.2;
}

/* ── Chips ── */
.ms-chips {
  display: flex; flex-wrap: wrap;
  gap: 6px;
  padding: 10px 18px;
  border-bottom: 1px solid var(--border-default, rgba(255,255,255,0.06));
  flex-shrink: 0;
  overflow-x: auto;
  scrollbar-width: none;
}
.ms-chips::-webkit-scrollbar { display: none; }
.ms-chip {
  display: inline-flex; align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border: 1px solid var(--border-default, rgba(255,255,255,0.08));
  background: var(--bg-hover, rgba(255,255,255,0.03));
  border-radius: 20px;
  font-size: 12px; font-weight: 600;
  color: var(--text-secondary, #bbb);
  cursor: pointer;
  white-space: nowrap;
  transition: background .12s, color .12s, border-color .12s;
  font-family: inherit;
}
.ms-chip:hover { background: var(--bg-hover, rgba(255,255,255,0.07)); color: var(--text-primary, #fff); }
.ms-chip.on {
  background: var(--accent-link-bg, rgba(96, 165, 250, 0.12));
  color: var(--accent-link, #60a5fa);
  border-color: var(--accent-link, rgba(96, 165, 250, 0.4));
}
.ms-chip-num {
  display: inline-block;
  font-size: 10px; font-weight: 700;
  padding: 1px 6px;
  background: rgba(255,255,255,0.08);
  border-radius: 8px;
  margin-left: 1px;
}
.ms-chip-ico { display: inline-flex; align-items: center; line-height: 1; }

/* ── Body ── */
.ms-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 8px 20px;
  scrollbar-width: thin;
}
.ms-body::-webkit-scrollbar { width: 8px; }
.ms-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }

/* ── Groups ── */
.ms-group { margin: 12px 0 0; }
.ms-group-head {
  display: flex; align-items: center;
  gap: 7px;
  padding: 8px 14px 4px;
  font-size: 11px; font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted, #888);
}
.ms-group-ico { display: inline-flex; align-items: center; line-height: 1; }
.ms-group-label { font-weight: 800; }
.ms-group-count {
  margin-left: auto;
  background: rgba(255,255,255,0.05);
  padding: 1px 7px;
  border-radius: 10px;
  font-size: 10px; font-weight: 700;
  color: var(--text-muted, #888);
  font-variant-numeric: tabular-nums;
}

/* "Rodyti visus N" link'as kategorijos apačioje */
.ms-more-link {
  display: inline-flex; align-items: center;
  gap: 4px;
  margin: 4px 12px 6px;
  padding: 6px 10px;
  border: none; background: transparent;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px; font-weight: 700;
  letter-spacing: -0.005em;
  border-radius: 6px;
  transition: background .12s, transform .12s;
  opacity: 0.9;
}
.ms-more-link:hover {
  background: var(--bg-hover, rgba(255,255,255,0.05));
  opacity: 1;
  transform: translateX(2px);
}
.ms-items { display: flex; flex-direction: column; gap: 1px; }
.ms-items.as-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
  padding: 4px 8px;
}

/* ── Row ── */
.ms-row {
  display: flex; align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border: none; background: transparent; cursor: pointer;
  border-radius: 10px;
  text-align: left;
  transition: background .1s;
  font-family: inherit;
  width: 100%;
}
.ms-row.sel { background: var(--bg-hover, rgba(255,255,255,0.06)); }
.ms-row:hover:not(.sel) { background: var(--bg-hover, rgba(255,255,255,0.04)); }
.ms-row-img {
  width: 44px; height: 44px;
  flex-shrink: 0;
  border-radius: 7px;
  overflow: hidden;
  background: var(--bg-deep, rgba(0,0,0,0.2));
  display: flex; align-items: center; justify-content: center;
}
.ms-row-img.circle { border-radius: 50%; }
.ms-row-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ms-row-fallback {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px;
}
.ms-row-text { flex: 1; min-width: 0; }
.ms-row-title {
  font-size: 14px; font-weight: 600;
  color: var(--text-primary, #fff);
  letter-spacing: -0.005em;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ms-row-sub {
  font-size: 12px; font-weight: 500;
  color: var(--text-muted, #888);
  margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ms-row-badge {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 9.5px; font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 3px 8px;
  border: 1px solid;
  border-radius: 4px;
  flex-shrink: 0;
  opacity: 0.85;
}
.ms-row-arrow {
  display: inline-flex; align-items: center;
  color: var(--text-muted, #666);
  opacity: 0;
  transition: opacity .1s;
  flex-shrink: 0;
  margin-right: 4px;
}
.ms-row.sel .ms-row-arrow { opacity: 1; }

/* ── Grid (artists/profiles) ── */
.ms-grid-item {
  border: 1px solid var(--border-default, rgba(255,255,255,0.06));
  background: var(--bg-deep, rgba(255,255,255,0.02));
  border-radius: 12px;
  padding: 12px 10px 10px;
  cursor: pointer;
  transition: background .12s, border-color .12s, transform .12s;
  text-align: center;
  display: flex; flex-direction: column;
  align-items: center;
  gap: 8px;
  font-family: inherit;
}
.ms-grid-item:hover, .ms-grid-item.sel {
  background: var(--bg-hover, rgba(255,255,255,0.05));
  border-color: var(--border-strong, rgba(255,255,255,0.12));
  transform: translateY(-1px);
}
.ms-grid-img-wrap {
  width: 72px; height: 72px;
  border-radius: 50%; overflow: hidden;
  background: var(--bg-deep, rgba(0,0,0,0.2));
  flex-shrink: 0;
}
.ms-grid-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ms-grid-fallback {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
}
.ms-grid-text { width: 100%; }
.ms-grid-title {
  font-size: 13px; font-weight: 600;
  color: var(--text-primary, #fff);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ms-grid-sub {
  font-size: 11px; font-weight: 500;
  color: var(--text-muted, #888);
  margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* ── Empty state ── */
.ms-empty { padding: 18px 22px 20px; }
.ms-empty-block { margin-bottom: 22px; }
.ms-empty-title {
  font-size: 11px; font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted, #888);
  margin-bottom: 10px;
}
.ms-empty-pills { display: flex; flex-wrap: wrap; gap: 6px; }
.ms-pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 11px;
  border: 1px solid var(--border-default, rgba(255,255,255,0.08));
  background: var(--bg-hover, rgba(255,255,255,0.03));
  border-radius: 16px;
  font-size: 12.5px; font-weight: 500;
  color: var(--text-secondary, #bbb);
  cursor: pointer;
  transition: background .12s, color .12s, border-color .12s;
  font-family: inherit;
}
.ms-pill:hover {
  background: var(--bg-hover, rgba(255,255,255,0.07));
  color: var(--text-primary, #fff);
  border-color: var(--border-strong, rgba(255,255,255,0.15));
}
.ms-empty-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
}

/* ── Loader (centrinis, body viduje) ── */
.ms-loader {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: 70px 20px;
  gap: 14px;
}
.ms-loader-text {
  font-size: 13px; font-weight: 500;
  color: var(--text-muted, #888);
  letter-spacing: -0.005em;
}

/* ── No results ── */
.ms-noresults {
  text-align: center;
  padding: 60px 20px;
}
.ms-noresults-icon {
  display: inline-flex;
  width: 48px; height: 48px;
  align-items: center; justify-content: center;
  border-radius: 50%;
  background: var(--bg-hover, rgba(255,255,255,0.05));
  color: var(--text-muted, #888);
  margin-bottom: 14px;
}
.ms-noresults-icon svg { width: 22px; height: 22px; }
.ms-noresults-title {
  font-size: 16px; font-weight: 700;
  color: var(--text-primary, #fff);
  margin-bottom: 4px;
}
.ms-noresults-hint { font-size: 13px; color: var(--text-muted, #888); }

/* ── Footer ── */
.ms-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 18px;
  border-top: 1px solid var(--border-default, rgba(255,255,255,0.06));
  background: var(--bg-deep, rgba(0,0,0,0.15));
  font-size: 11px;
  color: var(--text-muted, #888);
  flex-shrink: 0;
  gap: 12px;
}
.ms-footer-keys { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.ms-footer-stats { font-variant-numeric: tabular-nums; opacity: 0.8; flex-shrink: 0; }

/* ── Light mode tweaks (auto via CSS vars but darken overlay) ── */
[data-theme="light"] .ms-overlay {
  background: rgba(255, 255, 255, 0.5);
}
[data-theme="light"] .ms-shell {
  box-shadow:
    0 30px 80px rgba(0,0,0,0.18),
    0 8px 24px rgba(0,0,0,0.08);
}

/* ── Mobile (full-screen modal) ──
   Naudojam 100dvh (dynamic viewport height) iOS Safari'ui — paprastas
   100vh apima ir URL bar'ą, dėl ko shell apačia užvažiuoja po toolbar'u
   ir browser scroll'inasi. 100dvh follow'ina realų visible viewport.
   Fallback: 100vh seniems naršyklėms be dvh palaikymo. */
@media (max-width: 768px) {
  .ms-overlay {
    /* Iškart visa screen — 100vh nuo pirmos eilutės. iOS overflow:hidden
       ant body tik dalinai veikia, todėl reikia ir overlay'aus. */
    height: 100vh;
    height: 100dvh;
    /* touch-action: none neleidžia gesture'ams praeiti į background'ą. */
    touch-action: none;
  }
  .ms-shell {
    top: 0; left: 0; right: 0; bottom: 0;
    width: 100vw;
    max-height: 100vh; height: 100vh;
    max-height: 100dvh; height: 100dvh;
    border-radius: 0;
    transform: none;
    border: none;
  }
  @keyframes ms-pop { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
  .ms-input { font-size: 16px; }   /* >=16px kad iOS auto-zoom'as nešoktų */
  .ms-input-wrap { padding: 12px 14px; }
  .ms-row-img { width: 40px; height: 40px; }
  .ms-row-badge { display: none; }
  .ms-empty-grid { grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); }
  .ms-items.as-grid { grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); }
  .ms-grid-img-wrap { width: 60px; height: 60px; }
}
`
