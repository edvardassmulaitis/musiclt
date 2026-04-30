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

const CAT_LABELS: Record<Category, { sg: string; pl: string; emoji: string; color: string }> = {
  artists:     { sg: 'Atlikėjas',  pl: 'Atlikėjai',   emoji: '🎤', color: '#a78bfa' },
  albums:      { sg: 'Albumas',    pl: 'Albumai',     emoji: '💿', color: '#60a5fa' },
  tracks:      { sg: 'Daina',      pl: 'Dainos',      emoji: '🎵', color: '#34d399' },
  profiles:    { sg: 'Vartotojas', pl: 'Vartotojai',  emoji: '👤', color: '#fb923c' },
  events:      { sg: 'Renginys',   pl: 'Renginiai',   emoji: '📅', color: '#f472b6' },
  venues:      { sg: 'Vieta',      pl: 'Vietos',      emoji: '📍', color: '#facc15' },
  news:        { sg: 'Naujiena',   pl: 'Naujienos',   emoji: '📰', color: '#22d3ee' },
  blog_posts:  { sg: 'Blogas',     pl: 'Blogai',      emoji: '✍️', color: '#a3e635' },
  discussions: { sg: 'Diskusija',  pl: 'Diskusijos',  emoji: '💬', color: '#f87171' },
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
  const [loading, setLoading] = useState(false)
  const [tookMs, setTookMs] = useState(0)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const cacheRef = useRef<Map<string, { results: Results; took_ms: number }>>(new Map())
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [recentQueries, setRecentQueries] = useState<string[]>([])
  const [topArtists, setTopArtists] = useState<Hit[]>([])

  // ── Atidarius — focus input ──
  useEffect(() => {
    if (open) {
      // delay'as kad transition'as nelaužytų caret'o
      const t = setTimeout(() => inputRef.current?.focus(), 80)
      // Body scroll lock
      document.body.style.overflow = 'hidden'
      // Recent queries from sessionStorage (artifacts: jei išjungta — fail
      // silently; localStorage čia ne — gali būti restricted env'uose).
      try {
        const saved = sessionStorage.getItem('musiclt-recent-search')
        if (saved) setRecentQueries(JSON.parse(saved).slice(0, 8))
      } catch {}
      return () => {
        clearTimeout(t)
        document.body.style.overflow = ''
      }
    }
  }, [open])

  // ── Reset on close ──
  useEffect(() => {
    if (!open) {
      setQ('')
      setActiveCat('all')
      setSelectedIdx(0)
      setResults(emptyResults())
    }
  }, [open])

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
  useEffect(() => {
    if (!open) return
    const trimmed = q.trim()
    if (trimmed.length < 1) {
      setResults(emptyResults())
      setTookMs(0)
      setLoading(false)
      return
    }
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
      setTookMs(cached.took_ms)
      setSelectedIdx(0)
      return
    }
    if (abortRef.current) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    try {
      const r = await fetch(`/api/search-master?q=${encodeURIComponent(query)}&limit=6`, {
        signal: ctrl.signal,
      })
      if (!r.ok) throw new Error('search failed')
      const d = await r.json()
      const safeResults: Results = { ...emptyResults(), ...(d.results || {}) }
      cacheRef.current.set(query, { results: safeResults, took_ms: d.took_ms || 0 })
      setResults(safeResults)
      setTookMs(d.took_ms || 0)
      setSelectedIdx(0)
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      console.error('Search error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Flat list visų rezultatų (keyboard nav per visą sąrašą) ──
  const flatHits = useMemo(() => {
    const out: Hit[] = []
    for (const cat of CAT_ORDER) {
      if (activeCat !== 'all' && activeCat !== cat) continue
      out.push(...(results[cat] || []))
    }
    return out
  }, [results, activeCat])

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
  const showEmpty = q.trim().length === 0
  const showNoResults = !showEmpty && !loading && total === 0

  // Counts per category for chip badges
  const counts: Record<Category, number> = {} as any
  for (const cat of CAT_ORDER) counts[cat] = (results[cat] || []).length
  const totalAcrossCats = CAT_ORDER.reduce((s, c) => s + counts[c], 0)

  return (
    <>
      <style>{searchCss}</style>
      <div className="ms-overlay" onClick={onClose} />
      <div className="ms-shell" role="dialog" aria-modal="true" aria-label="Paieška">
        {/* ── Top: input ── */}
        <div className="ms-input-wrap">
          <span className="ms-input-icon" aria-hidden>
            {loading ? <Spinner /> : <SearchIcon />}
          </span>
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Ieškok atlikėjų, dainų, albumų, vartotojų, renginių…"
            className="ms-input"
            autoComplete="off"
            spellCheck={false}
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
            {CAT_ORDER.filter(c => counts[c] > 0).map(cat => (
              <button
                key={cat}
                className={`ms-chip ${activeCat === cat ? 'on' : ''}`}
                onClick={() => setActiveCat(cat)}
                style={activeCat === cat ? { borderColor: CAT_LABELS[cat].color, color: CAT_LABELS[cat].color } : undefined}
              >
                <span className="ms-chip-emoji">{CAT_LABELS[cat].emoji}</span>
                {CAT_LABELS[cat].pl}
                <span className="ms-chip-num">{counts[cat]}</span>
              </button>
            ))}
          </div>
        )}

        {/* ── Body ── */}
        <div className="ms-body">
          {showEmpty && <EmptyState
            recent={recentQueries}
            popular={POPULAR_QUERIES}
            topArtists={topArtists}
            onPick={(s) => setQ(s)}
            onGo={(h) => go(h)}
          />}

          {showNoResults && (
            <div className="ms-noresults">
              <div className="ms-noresults-emoji">🔍</div>
              <div className="ms-noresults-title">Nieko nerasta užklausai „{q}"</div>
              <div className="ms-noresults-hint">Pabandyk kitą paiešką arba tikrink rašybą.</div>
            </div>
          )}

          {!showEmpty && total > 0 && (
            <ResultsList
              results={results}
              activeCat={activeCat}
              selectedIdx={selectedIdx}
              onSelect={(i) => setSelectedIdx(i)}
              onGo={go}
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
  results, activeCat, selectedIdx, onSelect, onGo,
}: {
  results: Results
  activeCat: Category | 'all'
  selectedIdx: number
  onSelect: (i: number) => void
  onGo: (h: Hit) => void
}) {
  let idx = -1
  return (
    <div className="ms-groups">
      {CAT_ORDER.map(cat => {
        const items = results[cat] || []
        if (items.length === 0) return null
        if (activeCat !== 'all' && activeCat !== cat) return null
        const meta = CAT_LABELS[cat]
        return (
          <div key={cat} className="ms-group">
            <div className="ms-group-head">
              <span className="ms-group-emoji" aria-hidden>{meta.emoji}</span>
              <span className="ms-group-label">{meta.pl}</span>
              <span className="ms-group-count">{items.length}</span>
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
            <div className="ms-grid-fallback" style={{ background: meta.color + '22' }}>
              <span style={{ fontSize: 28 }}>{meta.emoji}</span>
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
            <span>{meta.emoji}</span>
          </div>
        )}
      </div>
      <div className="ms-row-text">
        <div className="ms-row-title">{hit.title}</div>
        {hit.subtitle && <div className="ms-row-sub">{hit.subtitle}</div>}
      </div>
      <div className="ms-row-badge" style={{ color: meta.color, borderColor: meta.color + '40' }}>
        {meta.sg}
      </div>
      <div className="ms-row-arrow">↵</div>
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
                    <div className="ms-grid-fallback" style={{ background: '#a78bfa22' }}>
                      <span style={{ fontSize: 28 }}>🎤</span>
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
function Spinner() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="ms-spin">
      <path d="M21 12a9 9 0 1 1-6.22-8.55" />
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
.ms-spin { animation: ms-rot 0.9s linear infinite; }
@keyframes ms-rot { to { transform: rotate(360deg) } }

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
}
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
.ms-chip-emoji { font-size: 13px; line-height: 1; }

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
.ms-group-emoji { font-size: 13px; line-height: 1; }
.ms-group-label { font-weight: 800; }
.ms-group-count {
  margin-left: auto;
  background: rgba(255,255,255,0.05);
  padding: 1px 7px;
  border-radius: 10px;
  font-size: 10px; font-weight: 700;
  color: var(--text-muted, #888);
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
  font-size: 13px;
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

/* ── No results ── */
.ms-noresults {
  text-align: center;
  padding: 60px 20px;
}
.ms-noresults-emoji { font-size: 36px; margin-bottom: 10px; opacity: 0.7; }
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

/* ── Mobile ── */
@media (max-width: 640px) {
  .ms-shell {
    top: 0; left: 0; right: 0;
    width: 100vw;
    max-height: 100vh; height: 100vh;
    border-radius: 0;
    transform: none;
  }
  @keyframes ms-pop { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
  .ms-input { font-size: 16px; }
  .ms-input-wrap { padding: 12px 14px; }
  .ms-row-img { width: 40px; height: 40px; }
  .ms-row-badge { display: none; }
  .ms-empty-grid { grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); }
  .ms-items.as-grid { grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); }
  .ms-grid-img-wrap { width: 60px; height: 60px; }
}
`
