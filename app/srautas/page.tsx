'use client'

/**
 * /srautas — ❤️ asmeninė muzikos zona. Du režimai (kaip /topai filtrų pill'ai,
 * centruoti): „Mėgstami" (turinys iš pamėgtų atlikėjų) ir „Tau gali patikti"
 * (rekomendacijos). Be papildomų tipo filtrų — viskas viename sraute.
 *
 * 2026-06-17 v3:
 *   • Filtrų juosta = 2 centruoti pill'ai (/topai stilius) + diskretiška ⚙.
 *   • Švarios, neryškios ♥ / × ikonos (drop-shadow, ne bulky apskritimai).
 *   • Daina atidaroma MODALE (HomeTrackModal) — uždarius lieki toje pačioje
 *     vietoje; taisomas ir 404 (teisingas /dainos/{artist}-{slug}-{id} href).
 *   • Swipe stabilesnis — užrakinamas tik horizontalus gestas (vertikalus
 *     scroll'as nebevirsta swipe'u).
 *
 * GREITAVEIKA: feed'as užkraunamas IŠKART (mount), nelaukiant useSession.
 */

import { useEffect, useState, useCallback, useMemo, useRef, Suspense, type MouseEvent, type TouchEvent, type CSSProperties } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession, signIn } from 'next-auth/react'
import { proxyImg } from '@/lib/img-proxy'
import { HomeTrackModal } from '@/components/HomeTrackModal'
import { PageLoader } from '@/components/PageLoader'

type Kind = 'news' | 'blog' | 'track' | 'album' | 'artist' | 'event' | 'topic' | 'chart' | 'recording'
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
  becauseArtists?: { name: string; image: string | null }[] | null
  avatar?: string | null
  badgeColor?: string | null
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
  recording: '#14b8a6',
}

// ── Ikonos ───────────────────────────────────────────────────────────────────
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
const IconLink = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M9 12h6" />
    <path d="M10.5 8.5H8a3.5 3.5 0 1 0 0 7h2.5" />
    <path d="M13.5 8.5H16a3.5 3.5 0 1 1 0 7h-2.5" />
  </svg>
)
const IconGear = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)
// Lietuviška „prieš N …" forma (pilni žodžiai).
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
  const dt = new Date(t)
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }
  // Tolimi koncertai (kiti metai) — pridedam metus.
  if (dt.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric'
  return dt.toLocaleDateString('lt-LT', opts)
}

function Equalizer() {
  return (
    <div className="sr-loading">
      <span className="eq-loader-big" aria-label="Kraunama"><span /><span /><span /><span /><span /></span>
    </div>
  )
}

function idFromKey(key: string): number {
  const n = Number(key.split('-').pop())
  return Number.isFinite(n) ? n : 0
}

/** Širdutė — sekti atlikėją / mėgti dainą ar albumą. */
function LikeButton({ entity, id }: { entity: LikeEntity; id: number }) {
  const [liked, setLiked] = useState(false)
  const [busy, setBusy] = useState(false)
  const endpoint =
    entity === 'artist' ? `/api/artists/${id}/like`
    : entity === 'track' ? `/api/tracks/${id}/like`
    : `/api/albums/${id}/like`

  const toggle = async (e: MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    if (busy || !id) return
    setBusy(true)
    const next = !liked
    setLiked(next)
    try {
      const res = await fetch(endpoint, { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (data && typeof data.liked === 'boolean') setLiked(data.liked)
      else if (!res.ok) setLiked(!next)
    } catch { setLiked(!next) } finally { setBusy(false) }
  }

  const label = entity === 'artist' ? (liked ? 'Sekama' : 'Sekti atlikėją') : (liked ? 'Patinka' : 'Pamėgti')
  return (
    <button type="button" className={`sr-act sr-like${liked ? ' done' : ''}`} onClick={toggle} disabled={busy} aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={HEART_PATH} />
      </svg>
    </button>
  )
}

/** Universali srauto kortelė — swipe-to-dismiss (tik horizontalus gestas),
 *  diskretiškos ♥ / × ikonos, dainos atidaromos modale. */
function FeedCard({ it, onDismiss, onOpenTrack }: { it: FeedItem; onDismiss: (key: string) => void; onOpenTrack: (it: FeedItem) => void }) {
  const isArtist = it.kind === 'artist'
  const initial = (it.title || '?').trim()[0]?.toUpperCase() || '?'
  const when = it.kind === 'event' ? eventWhen(it.date) : timeAgo(it.date)
  const likeEntity: LikeEntity | null =
    it.kind === 'artist' ? 'artist' : it.kind === 'track' ? 'track' : it.kind === 'album' ? 'album' : null
  const likeId = it.kind === 'artist' ? (it.artist?.id || 0) : idFromKey(it.key)

  // ── Swipe: užrakinam ašį, kad vertikalus scroll'as nevirstų swipe'u ──
  const [dx, setDx] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const start = useRef<{ x: number; y: number } | null>(null)
  const axis = useRef<'none' | 'h' | 'v'>('none')
  const movedH = useRef(false)

  const onTouchStart = (e: TouchEvent) => {
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    axis.current = 'none'; movedH.current = false
  }
  const onTouchMove = (e: TouchEvent) => {
    if (!start.current) return
    const ddx = e.touches[0].clientX - start.current.x
    const ddy = e.touches[0].clientY - start.current.y
    if (axis.current === 'none') {
      // sprendžiam ašį tik kai gestas pakankamai aiškus
      if (Math.abs(ddx) < 12 && Math.abs(ddy) < 12) return
      axis.current = Math.abs(ddx) > Math.abs(ddy) * 1.3 ? 'h' : 'v'
    }
    if (axis.current !== 'h') return // vertikalus → leidžiam scroll'inti
    movedH.current = true
    setDx(ddx)
  }
  const onTouchEnd = () => {
    if (axis.current === 'h' && Math.abs(dx) > 120) {
      setLeaving(true); setDx(dx > 0 ? 520 : -520); setTimeout(() => onDismiss(it.key), 170)
    } else setDx(0)
    start.current = null; axis.current = 'none'
  }

  const handleClick = (e: MouseEvent) => {
    if (movedH.current) { e.preventDefault(); e.stopPropagation(); return }
    if (it.kind === 'track') { e.preventDefault(); onOpenTrack(it) }
  }
  const dismiss = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); setLeaving(true); setTimeout(() => onDismiss(it.key), 150) }

  const style: CSSProperties = {
    transform: dx ? `translateX(${dx}px)` : undefined,
    opacity: leaving ? 0 : (dx ? 1 - Math.min(Math.abs(dx) / 340, 0.5) : 1),
    transition: start.current ? 'none' : 'transform .17s ease, opacity .17s ease',
  }

  return (
    <Link
      href={it.href}
      className={`sr-card${isArtist ? ' sr-card--artist' : ''}`}
      style={style}
      onClick={handleClick}
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
      </div>

      <div className="sr-body">
        {!isArtist && (
          <span className="sr-kicker" style={{ color: it.badgeColor || BADGE_COLOR[it.kind] }}>
            {it.badge}{it.kind === 'blog' && it.meta?.rating ? ` · ${it.meta.rating}/10` : ''}
          </span>
        )}
        <span className={`sr-title${isArtist ? ' sr-title--artist' : ''}`}>{it.title}</span>
        {(it.subtitle || (!isArtist && it.avatar)) && (
          <span className="sr-sub-row">
            {!isArtist && it.avatar && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="sr-avatar" src={proxyImg(it.avatar)} alt="" loading="lazy" />
            )}
            {it.subtitle && <span className="sr-sub">{it.subtitle}</span>}
          </span>
        )}
        {(when || it.because) && (
          <span className="sr-meta">
            {when && <span className="sr-time">{when}</span>}
            {it.because && (
              <span className="sr-because" title={`Panašu į tavo mėgstamus: ${it.because}`}>
                {IconLink}
                <span className="sr-because-tx">{it.because}</span>
                {it.becauseArtists && it.becauseArtists.some(a => a.image) && (
                  <span className="sr-because-pics">
                    {it.becauseArtists.filter(a => a.image).map((a, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={proxyImg(a.image as string)} alt={a.name} title={a.name} loading="lazy" />
                    ))}
                  </span>
                )}
              </span>
            )}
          </span>
        )}
      </div>

      {likeEntity && likeId ? <LikeButton entity={likeEntity} id={likeId} /> : null}
      <button type="button" className="sr-act sr-dismiss" onClick={dismiss} aria-label="Paslėpti" title="Paslėpti">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
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

  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  useEffect(() => { setDismissed(loadDismissed()) }, [])
  const dismiss = useCallback((key: string) => {
    setDismissed(prev => {
      if (prev.has(key)) return prev
      const next = new Set(prev); next.add(key)
      try { localStorage.setItem(DISMISS_KEY, JSON.stringify(Array.from(next).slice(-800))) } catch { /* ignore */ }
      return next
    })
  }, [])

  // Dainos modalas (kad uždarius liktum toje pačioje vietoje).
  const [modalTrack, setModalTrack] = useState<any | null>(null)
  const openTrack = useCallback((it: FeedItem) => {
    setModalTrack({
      id: idFromKey(it.key),
      title: it.title,
      cover_url: it.image,
      artist_name: it.artist?.name || null,
      artist_slug: it.artist?.slug || null,
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

  const sourceItems = mode === 'sekami' ? items : recs
  const filtered = useMemo(() => sourceItems.filter(it => !dismissed.has(it.key)), [sourceItems, dismissed])
  const isLoading = mode === 'sekami' ? loading : (recLoading && recs.length === 0)
  const isPersonalized = mode === 'sekami' ? personalized : recPersonalized
  const canLoadMore = mode === 'sekami' && !!nextBefore

  // Infinite scroll
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

        /* ── Filtrų juosta (/topai stilius, centruota) ── */
        .srf { position:relative; display:flex; justify-content:center; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:20px; }
        .srf-chip { display:inline-flex; align-items:center; gap:8px; padding:8px 18px; border-radius:100px;
          font-size:13.5px; font-weight:600; font-family:inherit; cursor:pointer; white-space:nowrap; line-height:1.2;
          background:var(--bg-surface); border:1px solid var(--border-subtle); color:var(--text-secondary);
          transition:color .15s, border-color .15s, background .15s; -webkit-tap-highlight-color:transparent; text-decoration:none; }
        .srf-chip svg { width:15px; height:15px; }
        .srf-chip:hover { color:var(--text-primary); border-color:rgba(249,115,22,0.45); }
        .srf-chip.on { background:var(--accent-orange); border-color:var(--accent-orange); color:#fff; }
        .srf-gear { position:absolute; right:0; top:50%; transform:translateY(-50%); width:36px; height:36px; padding:0; justify-content:center; color:var(--text-muted); }
        .srf-gear svg { width:17px; height:17px; }
        .srf-gear:hover { color:var(--text-primary); }

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
        .sr-body { display:flex; flex-direction:column; gap:4px; padding:11px 13px 13px; min-width:0; }
        .sr-kicker { font-size:10.5px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; line-height:1; margin-bottom:1px; }
        .sr-title { font-size:14.5px; font-weight:700; color:var(--text-primary); line-height:1.32;
          display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
        .sr-title--artist { -webkit-line-clamp:1; font-weight:800; font-size:15px; }
        .sr-sub-row { display:flex; align-items:center; gap:6px; min-width:0; }
        .sr-avatar { width:18px; height:18px; border-radius:50%; object-fit:cover; flex:0 0 auto; box-shadow:0 0 0 1px var(--border-subtle); }
        .sr-sub { font-size:12.5px; color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .sr-meta { display:flex; align-items:center; gap:8px; margin-top:1px; min-width:0; }
        .sr-time { font-size:11.5px; color:var(--text-faint); white-space:nowrap; flex:0 0 auto; }
        .sr-because { display:inline-flex; align-items:center; gap:4px; min-width:0; font-size:11.5px; color:var(--accent-orange); font-weight:600; }
        .sr-because svg { width:12px; height:12px; flex:0 0 auto; }
        .sr-because-tx { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .sr-because-pics { display:none; align-items:center; }
        .sr-because-pics img { width:19px; height:19px; border-radius:50%; object-fit:cover; margin-left:-6px; box-shadow:0 0 0 1.5px var(--bg-elevated); }
        .sr-because-pics img:first-child { margin-left:0; }

        /* ── Veiksmų ikonos: vientisos, temai pritaikytos (matomos light/dark) ── */
        .sr-act { position:absolute; cursor:pointer; padding:0; z-index:3; border-radius:50%;
          display:inline-flex; align-items:center; justify-content:center;
          background:var(--bg-elevated); border:1px solid var(--border-default, var(--border-subtle));
          box-shadow:0 2px 8px rgba(0,0,0,0.16); transition:transform .14s, background .14s, color .14s, border-color .14s, opacity .14s; -webkit-tap-highlight-color:transparent; }
        .sr-like { bottom:6px; right:6px; width:29px; height:29px; color:var(--accent-orange); }
        .sr-like svg { width:16px; height:16px; }
        .sr-like:hover { transform:scale(1.1); }
        .sr-like.done { background:var(--accent-orange); border-color:var(--accent-orange); color:#fff; }
        .sr-like:disabled { opacity:.7; }
        .sr-dismiss { top:6px; right:6px; width:27px; height:27px; color:var(--text-muted); opacity:0; }
        .sr-dismiss svg { width:14px; height:14px; }
        .sr-dismiss:hover { transform:scale(1.1); color:var(--text-primary); }
        .sr-card:hover .sr-dismiss, .sr-dismiss:focus-visible { opacity:1; }

        /* ── Pagalbiniai ── */
        .sr-end { text-align:center; padding:30px 16px 6px; }
        .sr-end-title { font-size:15px; font-weight:700; color:var(--text-primary); }
        .sr-end-sub { font-size:13px; color:var(--text-muted); margin-top:5px; }
        .sr-end a, .sr-end button { display:inline-block; margin-top:13px; text-decoration:none; border:none; cursor:pointer;
          background:var(--accent-orange); color:#fff; font-weight:700; font-size:13.5px; padding:9px 18px; border-radius:10px; font-family:inherit; }
        .sr-empty { text-align:center; padding:56px 16px; color:var(--text-muted); }
        .sr-empty a, .sr-empty button { color:var(--accent-orange); font-weight:700; }
        .sr-loading { display:flex; justify-content:center; padding:64px 0; }
        .sr-more-loading { display:flex; justify-content:center; padding:22px 0; }

        /* ── MOBILE: horizontali kortelė ── */
        @media (max-width:680px) {
          .sr-wrap { padding:12px 12px 32px; }
          .sr-grid { grid-template-columns:1fr; gap:10px; }
          .sr-card { flex-direction:row; align-items:stretch; }
          .sr-cover { aspect-ratio:auto; width:120px; flex:0 0 120px; min-height:118px; }
          .sr-cover--artist { width:104px; flex-basis:104px; }
          .sr-body { flex:1; justify-content:center; padding:11px 46px 11px 13px; gap:4px; }
          .sr-title { font-size:14px; -webkit-line-clamp:3; }
          .sr-sub { white-space:normal; display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; }
          .sr-like { bottom:7px; right:7px; }
          .sr-dismiss { opacity:.9; top:7px; right:7px; }
          /* susiję atlikėjai: ant mobile tik mini foto (tekstas netelpa) */
          .sr-because svg, .sr-because-tx { display:none; }
          .sr-because-pics { display:inline-flex; }
          .srf-gear { position:static; transform:none; margin-left:2px; }
          .srf { gap:8px; }
        }
      `}</style>

      {/* Filtrų juosta: 2 centruoti pill'ai + ⚙ */}
      <div className="srf" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'sekami'} className={`srf-chip${mode === 'sekami' ? ' on' : ''}`} onClick={() => switchMode('sekami')}>
          {IconHeart}<span>Mėgstami</span>
        </button>
        <button type="button" role="tab" aria-selected={mode === 'tau'} className={`srf-chip${mode === 'tau' ? ' on' : ''}`} onClick={() => switchMode('tau')}>
          {IconCompass}<span>Tau gali patikti</span>
        </button>
        <Link href="/mano-muzika" className="srf-chip srf-gear" aria-label="Mano muzika — valdymas" title="Mano muzika — valdymas">{IconGear}</Link>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : filtered.length === 0 ? (
        <div className="sr-empty">
          {mode === 'sekami'
            ? (isPersonalized === false
                ? (session?.user
                    ? <>Pamėk atlikėjų — ir srautas taps asmeniškas.<br /><Link href="/mano-muzika">Pasirinkti atlikėjus</Link></>
                    : <>Prisijunk, kad srautas būtų pritaikytas tau.<br /><button onClick={() => signIn()}>Prisijungti</button></>)
                : 'Kol kas tuščia. Pamėk atlikėjų arba užsuk vėliau.')
            : (session?.user
                ? 'Pamėk kelis atlikėjus — ir čia atsiras rekomendacijos.'
                : <>Prisijunk, kad gautum asmenines rekomendacijas.<br /><button onClick={() => signIn()}>Prisijungti</button></>)}
        </div>
      ) : (
        <>
          <div className="sr-grid">
            {filtered.map(it => <FeedCard key={it.key} it={it} onDismiss={dismiss} onOpenTrack={openTrack} />)}
          </div>

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

      {modalTrack && <HomeTrackModal track={modalTrack} onClose={() => setModalTrack(null)} />}
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
