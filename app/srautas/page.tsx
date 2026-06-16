'use client'

/**
 * /srautas — ❤️ asmeninė muzikos zona. Du režimai filtrų juostoje (NE tabais):
 *   • Mėgstami  — viskas, kas susiję su pamėgtais atlikėjais (/api/srautas/feed):
 *     nauja muzika, naujienos, topai, įrašai/recenzijos, diskusijos, koncertai.
 *   • Atradimai — rekomendacijos (/api/srautas/recommendations).
 *
 * Filtrų juosta (2026-06-17 v2): VIENA švari eilutė — režimas (Mėgstami /
 * Atradimai) + ⚙ nuoroda į „Mano muzika"; po ja minimalistiniai tipo chip'ai
 * (/topai stiliumi). Be tekstinių etikečių, be tamsaus segmento, kuris lūždavo
 * šviesiame režime.
 *
 * Kortelės: širdutė dešinėje (mobile — kortelės dešiniajame krašte, kur daug
 * vietos); kiekvieną įrašą galima paslėpti × mygtuku arba nubraukiant į šoną
 * (swipe) — paslėpti laikomi localStorage. Infinite scroll: kraunam kol yra;
 * peržiūrėjus viską — „Viskas peržiūrėta" + kvietimas pasirinkti daugiau atlikėjų.
 *
 * GREITAVEIKA: feed'as užkraunamas IŠKART (mount), nelaukiant useSession.
 */

import { useEffect, useState, useCallback, useMemo, useRef, Suspense, type MouseEvent, type TouchEvent, type CSSProperties } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession, signIn } from 'next-auth/react'
import { proxyImg } from '@/lib/img-proxy'

type Kind = 'news' | 'blog' | 'track' | 'album' | 'artist' | 'event' | 'topic' | 'chart'
type Mode = 'sekami' | 'tau'
type LikeEntity = 'artist' | 'track' | 'album'

type FeedItem = {
  key: string
  kind: Kind
  title: string
  subtitle: string | null
  image: string | null
  href: string
  date: string | null
  badge: string
  reason?: string
  because?: string | null
  artist?: { id?: number; name: string; slug: string | null } | null
  meta?: { post_type?: string; rating?: number | null; avatar?: string | null; comments?: number; likes?: number }
}

const BADGE_COLOR: Record<Kind, string> = {
  news: 'var(--accent-blue)',
  blog: '#8b5cf6',
  track: 'var(--accent-orange)',
  album: 'var(--accent-green)',
  artist: 'var(--accent-orange)',
  event: '#ec4899',
  topic: '#0ea5e9',
  chart: '#eab308',
}

// ── Ikonos (inline SVG — projektas neturi ikonų bibliotekos) ─────────────────
const HEART_PATH = 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 1 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z'
const IconHeart = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={HEART_PATH} />
  </svg>
)
const IconCompass = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="9" />
    <path d="m15.5 8.5-2 5-5 2 2-5z" />
  </svg>
)
const IconGear = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)
const IconSparkle = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 2l1.6 5.2L19 9l-5.4 1.8L12 16l-1.6-5.2L5 9l5.4-1.8z" />
  </svg>
)

// Turinio tipo filtrai — priklauso nuo režimo (skirtingi šaltiniai).
type TypeKey = 'all' | 'news' | 'music' | 'blog' | 'event' | 'artist' | 'topic' | 'chart'
const TYPE_FILTERS: Record<Mode, { key: TypeKey; label: string }[]> = {
  sekami: [
    { key: 'all', label: 'Viskas' },
    { key: 'music', label: 'Muzika' },
    { key: 'news', label: 'Naujienos' },
    { key: 'chart', label: 'Topai' },
    { key: 'blog', label: 'Įrašai' },
    { key: 'event', label: 'Koncertai' },
    { key: 'topic', label: 'Temos' },
  ],
  tau: [
    { key: 'all', label: 'Viskas' },
    { key: 'artist', label: 'Atlikėjai' },
    { key: 'music', label: 'Muzika' },
    { key: 'chart', label: 'Topai' },
    { key: 'event', label: 'Koncertai' },
    { key: 'topic', label: 'Temos' },
  ],
}

function matchesType(kind: Kind, type: TypeKey): boolean {
  if (type === 'all') return true
  if (type === 'music') return kind === 'track' || kind === 'album'
  if (type === 'chart') return kind === 'chart'
  return kind === type
}

function plural(n: number): string {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return 'įrašas'
  if (m10 >= 2 && m10 <= 9 && !(m100 >= 12 && m100 <= 14)) return 'įrašai'
  return 'įrašų'
}

// Lietuviška „prieš N …" forma (pilni žodžiai, ne „1 m.").
function ltUnit(n: number, forms: [string, string, string]): string {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return forms[0]
  if (m10 >= 2 && m10 <= 9 && !(m100 >= 11 && m100 <= 19)) return forms[1]
  return forms[2]
}
const U_DAY: [string, string, string] = ['dieną', 'dienas', 'dienų']
const U_WEEK: [string, string, string] = ['savaitę', 'savaites', 'savaičių']
const U_MONTH: [string, string, string] = ['mėnesį', 'mėnesius', 'mėnesių']
const U_YEAR: [string, string, string] = ['metus', 'metus', 'metų']

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.now() - Date.parse(iso)
  if (!Number.isFinite(ms)) return ''
  const d = Math.floor(ms / 86400000)
  if (d <= 0) return 'šiandien'
  if (d === 1) return 'vakar'
  if (d < 7) return `prieš ${d} ${ltUnit(d, U_DAY)}`
  if (d < 30) { const w = Math.floor(d / 7); return `prieš ${w} ${ltUnit(w, U_WEEK)}` }
  if (d < 365) { const mo = Math.floor(d / 30); return `prieš ${mo} ${ltUnit(mo, U_MONTH)}` }
  // Senesni — metai + likę mėnesiai patikslinimui.
  const y = Math.floor(d / 365)
  const remMonths = Math.floor((d - y * 365) / 30)
  let s = `prieš ${y} ${ltUnit(y, U_YEAR)}`
  if (remMonths > 0) s += ` ${remMonths} ${ltUnit(remMonths, U_MONTH)}`
  return s
}

function eventWhen(iso: string | null): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  return new Date(t).toLocaleDateString('lt-LT', { day: 'numeric', month: 'long' })
}

function Equalizer() {
  return (
    <div className="sr-loading">
      <span className="eq-loader-big" aria-label="Kraunama"><span /><span /><span /><span /><span /></span>
    </div>
  )
}

/** Iš feed key (pvz. "track-123") ištraukia skaitinį id. */
function idFromKey(key: string): number {
  const n = Number(key.split('-').pop())
  return Number.isFinite(n) ? n : 0
}

/**
 * Širdutės mygtukas — sekti atlikėją / mėgti dainą ar albumą. Optimistinis
 * toggle, atspari klaidoms.
 */
function LikeButton({ entity, id, initial = false }: { entity: LikeEntity; id: number; initial?: boolean }) {
  const [liked, setLiked] = useState(initial)
  const [busy, setBusy] = useState(false)
  const endpoint =
    entity === 'artist' ? `/api/artists/${id}/like`
    : entity === 'track' ? `/api/tracks/${id}/like`
    : `/api/albums/${id}/like`

  const toggle = async (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (busy || !id) return
    setBusy(true)
    const next = !liked
    setLiked(next)
    try {
      const res = await fetch(endpoint, { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (data && typeof data.liked === 'boolean') setLiked(data.liked)
      else if (!res.ok) setLiked(!next)
    } catch {
      setLiked(!next)
    } finally {
      setBusy(false)
    }
  }

  const label = entity === 'artist'
    ? (liked ? 'Sekama' : 'Sekti atlikėją')
    : (liked ? 'Patinka' : 'Pamėgti')

  return (
    <button type="button" className={`sr-like${liked ? ' done' : ''}`} onClick={toggle} disabled={busy} aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={HEART_PATH} />
      </svg>
    </button>
  )
}

/**
 * Universali srauto kortelė (turinys / atlikėjas) su swipe-to-dismiss, × slėpimo
 * mygtuku, širdute dešinėje ir kompaktiška „nes tau patinka" ikona.
 */
function FeedCard({ it, onDismiss }: { it: FeedItem; onDismiss: (key: string) => void }) {
  const isArtist = it.kind === 'artist'
  const initial = (it.title || '?').trim()[0]?.toUpperCase() || '?'
  const when = it.kind === 'event' ? eventWhen(it.date) : timeAgo(it.date)
  const likeEntity: LikeEntity | null =
    it.kind === 'artist' ? 'artist' : it.kind === 'track' ? 'track' : it.kind === 'album' ? 'album' : null
  const likeId = it.kind === 'artist' ? (it.artist?.id || 0) : idFromKey(it.key)

  // ── Swipe ──
  const [dx, setDx] = useState(0)
  const startX = useRef<number | null>(null)
  const moved = useRef(false)
  const [leaving, setLeaving] = useState(false)

  const onTouchStart = (e: TouchEvent) => { startX.current = e.touches[0].clientX; moved.current = false }
  const onTouchMove = (e: TouchEvent) => {
    if (startX.current == null) return
    const d = e.touches[0].clientX - startX.current
    if (Math.abs(d) > 6) moved.current = true
    setDx(d)
  }
  const onTouchEnd = () => {
    if (Math.abs(dx) > 90) { setLeaving(true); setDx(dx > 0 ? 500 : -500); setTimeout(() => onDismiss(it.key), 170) }
    else setDx(0)
    startX.current = null
  }
  const onClickCapture = (e: MouseEvent) => { if (moved.current) { e.preventDefault(); e.stopPropagation() } }
  const dismiss = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); setLeaving(true); setTimeout(() => onDismiss(it.key), 150) }

  const style: CSSProperties = {
    transform: dx ? `translateX(${dx}px)` : undefined,
    opacity: leaving ? 0 : (dx ? 1 - Math.min(Math.abs(dx) / 320, 0.55) : 1),
    transition: startX.current == null ? 'transform .17s ease, opacity .17s ease' : 'none',
  }

  return (
    <Link
      href={it.href}
      className={`sr-card${isArtist ? ' sr-card--artist' : ''}`}
      style={style}
      onClickCapture={onClickCapture}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div className={`sr-cover${isArtist ? ' sr-cover--artist' : ''}`}>
        {it.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxyImg(it.image)} alt="" loading="lazy" />
        ) : (
          <span className="sr-cover-ph">{initial}</span>
        )}
        <span className="sr-badge" style={{ color: '#fff', background: BADGE_COLOR[it.kind] }}>
          {it.badge}{it.kind === 'blog' && it.meta?.rating ? ` · ${it.meta.rating}/10` : ''}
        </span>
      </div>

      <div className="sr-body">
        <span className={`sr-title${isArtist ? ' sr-title--artist' : ''}`}>{it.title}</span>
        {it.subtitle && <span className="sr-sub">{it.subtitle}</span>}
        <span className="sr-meta">
          {when && <span className="sr-time">{when}</span>}
          {it.because && (
            <span className="sr-why" title={`Nes tau patinka ${it.because}`} aria-label={`Nes tau patinka ${it.because}`}>
              {IconSparkle}
            </span>
          )}
        </span>
      </div>

      {likeEntity && likeId ? <LikeButton entity={likeEntity} id={likeId} /> : null}
      <button type="button" className="sr-dismiss" onClick={dismiss} aria-label="Paslėpti" title="Paslėpti">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </Link>
  )
}

const SEK_TTL = 5 * 60 * 1000
const DISMISS_KEY = 'srautas_dismissed'

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr)) return new Set(arr) }
  } catch { /* ignore */ }
  return new Set()
}

function SrautasInner() {
  const { data: session } = useSession()
  const router = useRouter()
  const params = useSearchParams()

  const initialMode: Mode = params.get('t') === 'tau' ? 'tau' : 'sekami'
  const [mode, setMode] = useState<Mode>(initialMode)
  const [type, setType] = useState<TypeKey>('all')

  // Paslėpti įrašai (swipe / ×) — bendri abiem režimam, localStorage.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  useEffect(() => { setDismissed(loadDismissed()) }, [])
  const dismiss = useCallback((key: string) => {
    setDismissed(prev => {
      if (prev.has(key)) return prev
      const next = new Set(prev); next.add(key)
      try {
        const arr = Array.from(next).slice(-800) // cap
        localStorage.setItem(DISMISS_KEY, JSON.stringify(arr))
      } catch { /* ignore */ }
      return next
    })
  }, [])

  // Sekami state
  const [items, setItems] = useState<FeedItem[]>([])
  const [personalized, setPersonalized] = useState<boolean | null>(null)
  const [nextBefore, setNextBefore] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  // Tau state
  const [recs, setRecs] = useState<FeedItem[]>([])
  const [recPersonalized, setRecPersonalized] = useState<boolean | null>(null)
  const [recLoading, setRecLoading] = useState(false)
  const [recLoaded, setRecLoaded] = useState(false)

  const switchMode = (m: Mode) => {
    if (m === mode) return
    setMode(m)
    setType('all')
    const sp = new URLSearchParams(Array.from(params.entries()))
    if (m === 'sekami') sp.delete('t'); else sp.set('t', m)
    const qs = sp.toString()
    router.replace(`/srautas${qs ? `?${qs}` : ''}`, { scroll: false })
  }

  const loadFeed = useCallback(async (before?: string | null) => {
    const url = `/api/srautas/feed?limit=30${before ? `&before=${encodeURIComponent(before)}` : ''}`
    const res = await fetch(url)
    return (await res.json()) as { items: FeedItem[]; personalized: boolean; nextBefore: string | null }
  }, [])

  useEffect(() => {
    let alive = true
    const cacheKey = 'srautas_sekami'
    try {
      const raw = sessionStorage.getItem(cacheKey)
      if (raw) {
        const c = JSON.parse(raw)
        if (c && Date.now() - c.ts < SEK_TTL && Array.isArray(c.items)) {
          setItems(c.items); setPersonalized(!!c.personalized); setNextBefore(c.nextBefore || null); setLoading(false)
          return
        }
      }
    } catch { /* ignore */ }
    setLoading(true)
    loadFeed().then(d => {
      if (!alive) return
      setItems(d.items || [])
      setPersonalized(!!d.personalized)
      setNextBefore(d.nextBefore || null)
      setLoading(false)
      try { sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), items: d.items || [], personalized: !!d.personalized, nextBefore: d.nextBefore || null })) } catch { /* ignore */ }
    }).catch(() => alive && setLoading(false))
    return () => { alive = false }
  }, [loadFeed])

  const moreFeed = useCallback(async () => {
    if (!nextBefore || loadingMore) return
    setLoadingMore(true)
    try {
      const d = await loadFeed(nextBefore)
      setItems(prev => [...prev, ...(d.items || [])])
      setNextBefore(d.nextBefore || null)
    } finally { setLoadingMore(false) }
  }, [nextBefore, loadingMore, loadFeed])

  // ── Tau feed (lazy) ──
  useEffect(() => {
    if (mode !== 'tau' || recLoaded) return
    let alive = true
    const cacheKey = 'srautas_tau'
    try {
      const raw = sessionStorage.getItem(cacheKey)
      if (raw) {
        const c = JSON.parse(raw)
        if (c && Date.now() - c.ts < SEK_TTL && Array.isArray(c.items)) {
          setRecs(c.items); setRecPersonalized(!!c.personalized); setRecLoaded(true)
          return
        }
      }
    } catch { /* ignore */ }
    setRecLoading(true)
    fetch('/api/srautas/recommendations?limit=48')
      .then(r => r.json())
      .then(d => {
        if (!alive) return
        setRecs(d.items || []); setRecPersonalized(!!d.personalized); setRecLoaded(true); setRecLoading(false)
        try { sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), items: d.items || [], personalized: !!d.personalized })) } catch { /* ignore */ }
      })
      .catch(() => { if (alive) { setRecLoading(false); setRecLoaded(true) } })
    return () => { alive = false }
  }, [mode, recLoaded])

  // Aktyvaus režimo duomenys + tipo filtras + paslėpti.
  const sourceItems = mode === 'sekami' ? items : recs
  const filtered = useMemo(
    () => sourceItems.filter(it => !dismissed.has(it.key) && matchesType(it.kind, type)),
    [sourceItems, type, dismissed],
  )
  const isLoading = mode === 'sekami' ? loading : (recLoading && recs.length === 0)
  const isPersonalized = mode === 'sekami' ? personalized : recPersonalized
  const canLoadMore = mode === 'sekami' && !!nextBefore

  // ── Infinite scroll ──
  const sentinel = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!canLoadMore) return
    const el = sentinel.current
    if (!el) return
    const obs = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) moreFeed() }, { rootMargin: '600px 0px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [canLoadMore, moreFeed])

  return (
    <div className="sr-wrap">
      <style>{`
        .sr-wrap { max-width: 1180px; margin: 0 auto; padding: 18px 18px 40px; }

        /* ── Filtrų juosta (švari, šviesos/tamsos saugi) ── */
        .srf { display:flex; flex-direction:column; gap:9px; margin-bottom:18px; }
        .srf-row { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
        .srf-chip { display:inline-flex; align-items:center; gap:7px; padding:7px 15px; border-radius:100px;
          font-size:13px; font-weight:600; font-family:inherit; cursor:pointer; white-space:nowrap; line-height:1.2;
          background:var(--bg-surface); border:1px solid var(--border-subtle); color:var(--text-secondary);
          transition:color .15s, border-color .15s, background .15s; -webkit-tap-highlight-color:transparent; text-decoration:none; }
        .srf-chip svg { width:15px; height:15px; }
        .srf-chip:hover { color:var(--text-primary); border-color:rgba(249,115,22,0.45); }
        .srf-chip.on { background:var(--accent-orange); border-color:var(--accent-orange); color:#fff; }
        /* tipo chip'ai — kiek mažesni, neutralus aktyvus */
        .srf-type { padding:6px 13px; font-size:12.5px; font-weight:600; }
        .srf-type.on { background:var(--text-primary); border-color:var(--text-primary); color:var(--bg-base, #0d0d0f); }
        .srf-gear { margin-left:auto; width:38px; height:38px; padding:0; justify-content:center; }
        .srf-gear svg { width:18px; height:18px; }
        .srf-count { font-size:12px; color:var(--text-faint); white-space:nowrap; }

        /* ── Tinklelis ── */
        .sr-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:20px; }
        .sr-card { position:relative; display:flex; flex-direction:column; text-decoration:none; overflow:hidden;
          background:var(--bg-elevated); border:1px solid var(--border-subtle); border-radius:16px; will-change:transform;
          transition:border-color .15s, box-shadow .15s; }
        .sr-card:hover { border-color:var(--border-strong); box-shadow:0 8px 22px rgba(0,0,0,0.22); }
        .sr-cover { position:relative; aspect-ratio:16/10; overflow:hidden;
          background:linear-gradient(135deg, var(--bg-active), var(--bg-surface)); display:flex; align-items:center; justify-content:center; }
        .sr-cover--artist { aspect-ratio:1/1; }
        .sr-cover img { width:100%; height:100%; object-fit:cover; transition:transform .35s ease; }
        .sr-card:hover .sr-cover img { transform:scale(1.04); }
        .sr-cover-ph { font-size:42px; font-weight:900; color:var(--text-faint); }
        .sr-badge { position:absolute; top:9px; left:9px; padding:4px 9px; border-radius:8px;
          font-size:10.5px; font-weight:800; letter-spacing:.02em; text-transform:uppercase; line-height:1;
          box-shadow:0 2px 6px rgba(0,0,0,0.25); }
        .sr-body { display:flex; flex-direction:column; gap:4px; padding:11px 13px 13px; min-width:0; }
        .sr-title { font-size:14.5px; font-weight:700; color:var(--text-primary); line-height:1.32;
          display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
        .sr-title--artist { -webkit-line-clamp:1; font-weight:800; font-size:15px; }
        .sr-sub { font-size:12.5px; color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .sr-meta { display:flex; align-items:center; gap:8px; margin-top:1px; }
        .sr-time { font-size:11.5px; color:var(--text-faint); }
        .sr-why { display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; border-radius:50%;
          background:rgba(249,115,22,0.14); color:var(--accent-orange); flex:0 0 auto; }
        .sr-why svg { width:11px; height:11px; }

        /* ── Širdutė — apačioje-dešinėje ant viršelio (desktop) ── */
        .sr-like { position:absolute; bottom:10px; right:10px; width:36px; height:36px; border-radius:50%; cursor:pointer; font-family:inherit;
          border:none; background:rgba(0,0,0,0.42); backdrop-filter:blur(4px); color:#fff;
          display:inline-flex; align-items:center; justify-content:center; transition:transform .14s, background .14s, color .14s;
          box-shadow:0 2px 8px rgba(0,0,0,0.28); z-index:3; }
        .sr-like svg { width:19px; height:19px; }
        .sr-like:hover { transform:scale(1.1); background:rgba(0,0,0,0.6); }
        .sr-like:disabled { opacity:.7; }
        .sr-like.done { background:#fff; color:#f5466b; }

        /* ── × paslėpti — viršuje-dešinėje, ant hover (desktop) ── */
        .sr-dismiss { position:absolute; top:9px; right:9px; width:28px; height:28px; border-radius:50%; cursor:pointer; font-family:inherit;
          border:none; background:rgba(0,0,0,0.5); backdrop-filter:blur(4px); color:#fff; opacity:0;
          display:inline-flex; align-items:center; justify-content:center; transition:opacity .14s, transform .14s; z-index:4; }
        .sr-dismiss svg { width:15px; height:15px; }
        .sr-dismiss:hover { transform:scale(1.1); background:rgba(0,0,0,0.7); }
        .sr-card:hover .sr-dismiss, .sr-dismiss:focus-visible { opacity:1; }

        /* ── Pagalbiniai ── */
        .sr-end { text-align:center; padding:30px 16px 6px; }
        .sr-end-title { font-size:15px; font-weight:700; color:var(--text-primary); }
        .sr-end-sub { font-size:13px; color:var(--text-muted); margin-top:5px; }
        .sr-end a, .sr-end button { display:inline-block; margin-top:13px; text-decoration:none; border:none; cursor:pointer;
          background:var(--accent-orange); color:#fff; font-weight:700; font-size:13.5px; padding:9px 18px; border-radius:10px; font-family:inherit; }
        .sr-empty { text-align:center; padding:56px 16px; color:var(--text-muted); }
        .sr-loading { display:flex; justify-content:center; padding:64px 0; }
        .sr-more-loading { display:flex; justify-content:center; padding:22px 0; }

        /* ── MOBILE: vienas įrašas per eilę, horizontali kortelė ── */
        @media (max-width:680px) {
          .sr-wrap { padding:12px 12px 32px; }
          .sr-grid { grid-template-columns:1fr; gap:10px; }
          .sr-card { flex-direction:row; align-items:stretch; }
          .sr-cover { aspect-ratio:auto; width:120px; flex:0 0 120px; min-height:118px; }
          .sr-cover--artist { width:104px; flex-basis:104px; }
          .sr-body { flex:1; justify-content:center; padding:11px 56px 11px 13px; gap:4px; }
          .sr-title { font-size:14px; -webkit-line-clamp:3; }
          .sr-sub { white-space:normal; display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; }
          .sr-badge { font-size:9.5px; padding:3px 7px; top:7px; left:7px; }
          /* širdutė į dešinįjį kortelės kraštą (kur daug vietos) */
          .sr-like { top:50%; bottom:auto; right:12px; transform:translateY(-50%); width:34px; height:34px; }
          .sr-like:hover { transform:translateY(-50%) scale(1.08); }
          .sr-like svg { width:18px; height:18px; }
          /* × visada matomas (silpnas) */
          .sr-dismiss { opacity:.5; top:7px; right:7px; width:26px; height:26px; }
          .srf-chip { padding:7px 13px; }
          .srf-type { padding:6px 12px; }
        }
      `}</style>

      {/* Filtrų juosta: režimas + ⚙ ; po ja tipo chip'ai */}
      <div className="srf">
        <div className="srf-row" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'sekami'} className={`srf-chip${mode === 'sekami' ? ' on' : ''}`} onClick={() => switchMode('sekami')}>
            {IconHeart}<span>Mėgstami</span>
          </button>
          <button type="button" role="tab" aria-selected={mode === 'tau'} className={`srf-chip${mode === 'tau' ? ' on' : ''}`} onClick={() => switchMode('tau')}>
            {IconCompass}<span>Atradimai</span>
          </button>
          <Link href="/mano-muzika" className="srf-chip srf-gear" aria-label="Mano muzika — valdymas" title="Mano muzika — valdymas">
            {IconGear}
          </Link>
        </div>
        <div className="srf-row">
          {TYPE_FILTERS[mode].map(t => (
            <button key={t.key} type="button" className={`srf-chip srf-type${type === t.key ? ' on' : ''}`} onClick={() => setType(t.key)}>{t.label}</button>
          ))}
          {!isLoading && filtered.length > 0 && (
            <span className="srf-count" style={{ marginLeft: 'auto' }}>{filtered.length} {plural(filtered.length)}</span>
          )}
        </div>
      </div>

      {isLoading ? (
        <Equalizer />
      ) : filtered.length === 0 ? (
        <div className="sr-empty">
          {sourceItems.length > 0
            ? 'Šio tipo turinio kol kas nėra. Pabandyk kitą filtrą.'
            : mode === 'sekami'
              ? (isPersonalized === false
                  ? (session?.user
                      ? <>Pamėk atlikėjų — ir srautas taps asmeniškas.<br /><Link className="sr-more-link" href="/mano-muzika" style={{ color: 'var(--accent-orange)', fontWeight: 700 }}>Pasirinkti atlikėjus</Link></>
                      : <>Prisijunk, kad srautas būtų pritaikytas tau.<br /><button className="sr-end-btn" onClick={() => signIn()} style={{ marginTop: 10, background: 'var(--accent-orange)', color: '#fff', border: 'none', padding: '9px 18px', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Prisijungti</button></>)
                  : 'Kol kas tuščia. Pamėk atlikėjų arba užsuk vėliau.')
              : (session?.user
                  ? 'Pamėk kelis atlikėjus — ir čia atsiras rekomendacijos.'
                  : <>Prisijunk, kad gautum asmenines rekomendacijas.<br /><button onClick={() => signIn()} style={{ marginTop: 10, background: 'var(--accent-orange)', color: '#fff', border: 'none', padding: '9px 18px', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Prisijungti</button></>)}
        </div>
      ) : (
        <>
          <div className="sr-grid">
            {filtered.map(it => <FeedCard key={it.key} it={it} onDismiss={dismiss} />)}
          </div>

          {/* Infinite scroll sentinel + būsenos */}
          {canLoadMore && <div ref={sentinel} aria-hidden style={{ height: 1 }} />}
          {loadingMore && <div className="sr-more-loading"><Equalizer /></div>}

          {!canLoadMore && !loadingMore && (
            <div className="sr-end">
              <div className="sr-end-title">Viskas peržiūrėta ✦</div>
              <div className="sr-end-sub">
                {mode === 'sekami'
                  ? 'Nori daugiau? Pasirink dar atlikėjų — srautas augs kartu su tavimi.'
                  : 'Pamėk patikusius atlikėjus — rekomendacijos taps tikslesnės.'}
              </div>
              <Link href="/mano-muzika">Pasirinkti daugiau atlikėjų</Link>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function SrautasPage() {
  return (
    <Suspense fallback={<div className="sr-wrap" style={{ padding: 40 }} />}>
      <SrautasInner />
    </Suspense>
  )
}
