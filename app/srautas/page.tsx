'use client'

/**
 * /srautas — ❤️ asmeninė muzikos zona. Du režimai: „Mėgstami" / „Tau gali patikti".
 *
 * 2026-06-25 v9 — PRATURTINTOS EILUTĖS (900px, viena kolona, vienodas abiems tabams):
 *   • Dainos / rekomenduojami atlikėjai — MINI ▶ grotuvas dešinėj (in-place play,
 *     neišplečia turinio): kairėj atlikėjo foto, dešinėj klipo thumbnail→iframe.
 *   • Diskusija — pilnas paskutinis komentaras + kas parašė (avataras + vardas).
 *   • Koncertas vertas kelionės — kelionės info (✈️/🚗, vežėjas, kaina/trukmė) + „kodėl verta".
 *   • Topai — atlikėjų miniatiūros kortelėje; modale — su foto.
 *   • „Nes mėgsti X" — mygtukas (atidaro modalą); desktop link-ikona pašalinta.
 *   • Peržiūrų skaičius NErodome (neatnaujinamas). Lūžę viršeliai → raidės placeholder.
 *   API: feed v20 (charts thumbs, komentaras+autorius, tripInfo), recs v15 (top daina, tripInfo).
 */

import { useEffect, useState, useCallback, useMemo, useRef, Suspense, type MouseEvent, type TouchEvent, type CSSProperties } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession, signIn } from 'next-auth/react'
import { proxyImgResized } from '@/lib/img-proxy'
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
  liked?: boolean
  artist?: { id?: number; name: string; slug: string | null } | null
  meta?: {
    post_type?: string; rating?: number | null; avatar?: string | null
    comments?: number; likes?: number; views?: number
    ytId?: string | null; excerpt?: string | null
    commentBy?: string | null; commentAvatar?: string | null
    tripInfo?: string | null; venue?: string | null
    topTrack?: { ytId: string; title: string } | null
    artistThumbs?: { name: string; image: string | null; href: string }[]
    chartRows?: { artist: string; chart: string; position: number; href: string; image?: string | null }[]
  }
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
function LikeButton({ entity, id, initial = false }: { entity: LikeEntity; id: number; initial?: boolean }) {
  const [liked, setLiked] = useState(initial)
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

const ytThumbUrl = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`

/** Pilno pločio srauto eilutė — vienodas formatas abiems tabams. Dainoms / rekomenduojamiems atlikėjams — mini ▶ grotuvas dešinėj. */
function FeedCard({ it, onDismiss, onWhy, onOpenCharts }: { it: FeedItem; onDismiss: (key: string) => void; onWhy: (it: FeedItem) => void; onOpenCharts: (it: FeedItem) => void }) {
  const isArtist = it.kind === 'artist'
  const initial = (it.title || '?').trim()[0]?.toUpperCase() || '?'
  const when = it.kind === 'event' ? eventWhen(it.date) : it.kind === 'chart' ? '' : timeAgo(it.date)
  const excerpt = it.meta?.excerpt || null
  const likeEntity: LikeEntity | null =
    it.kind === 'artist' ? 'artist' : it.kind === 'track' ? 'track' : it.kind === 'album' ? 'album' : null
  const likeId = it.kind === 'artist' ? (it.artist?.id || 0) : idFromKey(it.key)
  const isTrack = it.kind === 'track'
  // Inline grotuvas: dainoms — pati daina; rekomenduojamiems atlikėjams — jų top daina.
  const playYt: string | null = isTrack ? ((it.meta?.ytId as string | undefined) || null) : (isArtist ? (it.meta?.topTrack?.ytId || null) : null)
  // Kairysis vizualas: dainoms — atlikėjo foto (dešinėj — klipo grotuvas); kitiems — kortelės viršelis.
  const leftImg = isTrack ? (it.avatar || it.image) : it.image
  const chartThumbs = it.kind === 'chart' ? (it.meta?.artistThumbs || []) : []
  const commentBy = it.meta?.commentBy || null
  const commentAvatar = it.meta?.commentAvatar || null
  const tripInfo = it.meta?.tripInfo || null
  const [imgFailed, setImgFailed] = useState(false)
  const [playing, setPlaying] = useState(false)
  const hasImg = !!leftImg && !imgFailed
  const showPh = !hasImg && (isArtist || isTrack || it.kind === 'album')
  const showSubAvatar = !isArtist && !isTrack && !!it.avatar

  // Footer statistika — peržiūrų NErodome (neatnaujinama); komentarai / patiko OK.
  const stats: string[] = []
  if (it.kind === 'topic' && Number(it.meta?.comments) > 0) stats.push(`${it.meta?.comments} komentarų`)
  if (it.kind === 'blog' && Number(it.meta?.likes) > 0) stats.push(`${it.meta?.likes} patiko`)

  // ── Swipe ──
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
      if (Math.abs(ddx) < 12 && Math.abs(ddy) < 12) return
      axis.current = Math.abs(ddx) > Math.abs(ddy) * 1.3 ? 'h' : 'v'
    }
    if (axis.current !== 'h') return
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
    if (it.kind === 'chart' && it.meta?.chartRows?.length) { e.preventDefault(); onOpenCharts(it) }
  }
  const togglePlay = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); setPlaying(p => !p) }
  const dismiss = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); setLeaving(true); setTimeout(() => onDismiss(it.key), 150) }
  const why = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); onWhy(it) }

  const style: CSSProperties = {
    transform: dx ? `translateX(${dx}px)` : undefined,
    opacity: leaving ? 0 : (dx ? 1 - Math.min(Math.abs(dx) / 340, 0.5) : 1),
    transition: start.current ? 'none' : 'transform .17s ease, opacity .17s ease',
  }

  return (
    <div className="srl-card">
      <Link
        href={it.href}
        className={`srl${(hasImg || showPh) ? '' : ' srl--noimg'}${isArtist ? ' srl--artist' : ''}${playYt ? ' srl--hasmini' : ''}`}
        style={style}
        onClick={handleClick}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {hasImg ? (
          <div className="srl-cover">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={proxyImgResized(leftImg, 320)} alt="" loading="lazy" onError={() => setImgFailed(true)} />
          </div>
        ) : showPh ? (
          <div className="srl-cover srl-cover--ph"><span>{initial}</span></div>
        ) : null}

        <div className="srl-body">
          {!isArtist && (
            <span className="srl-kicker" style={{ color: it.badgeColor || BADGE_COLOR[it.kind] }}>
              {it.badge}{it.kind === 'blog' && it.meta?.rating ? ` · ${it.meta.rating}/10` : ''}
            </span>
          )}
          <span className="srl-title">{it.title}</span>
          {(it.subtitle || showSubAvatar) && (
            <span className="srl-subrow">
              {showSubAvatar && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="srl-avatar" src={proxyImgResized(it.avatar ?? null, 64)} alt="" loading="lazy" />
              )}
              {it.subtitle && <span className="srl-sub">{it.subtitle}</span>}
            </span>
          )}

          {chartThumbs.length > 0 && (
            <span className="srl-thumbs">
              {chartThumbs.slice(0, 9).map((t, i) => (
                t.image
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img key={i} className="srl-thumb" src={proxyImgResized(t.image, 72)} alt={t.name} title={t.name} loading="lazy" />
                  : <span key={i} className="srl-thumb srl-thumb--ph" title={t.name}>{t.name.trim()[0]?.toUpperCase() || '?'}</span>
              ))}
            </span>
          )}

          {excerpt && <span className={`srl-excerpt${it.kind === 'topic' ? ' srl-quote' : ''}`}>{excerpt}</span>}
          {it.kind === 'topic' && commentBy && (
            <span className="srl-byline">
              {commentAvatar && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="srl-byline-av" src={proxyImgResized(commentAvatar, 48)} alt="" loading="lazy" />
              )}
              <span>— {commentBy}</span>
            </span>
          )}
          {tripInfo && <span className="srl-trip">{tripInfo}</span>}

          {it.because && (
            <button type="button" className="srl-because" onClick={why} aria-label="Kodėl pasiūlyta" title="Kodėl pasiūlyta">
              {IconLink}<span>Nes mėgsti: {it.because}</span>
            </button>
          )}
          {(when || stats.length > 0) && (
            <span className="srl-foot">
              {when && <span>{when}</span>}
              {stats.map((s, i) => <span key={i} className="srl-stat">{s}</span>)}
            </span>
          )}
        </div>

        {playYt && (
          <div className="srl-mini" onClick={e => { e.preventDefault(); e.stopPropagation() }}>
            {playing ? (
              <iframe
                src={`https://www.youtube.com/embed/${playYt}?autoplay=1&rel=0`}
                title={it.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            ) : (
              <button type="button" className="srl-mini-play" onClick={togglePlay} aria-label="Groti" title="Groti">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ytThumbUrl(playYt)} alt="" loading="lazy" />
                <span className="srl-mini-pbtn"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg></span>
              </button>
            )}
          </div>
        )}

        {likeEntity && likeId ? <LikeButton entity={likeEntity} id={likeId} initial={!!it.liked} /> : null}
        <button type="button" className="sr-act sr-dismiss" onClick={dismiss} aria-label="Paslėpti" title="Paslėpti">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </Link>
    </div>
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

  const [whyItem, setWhyItem] = useState<FeedItem | null>(null)
  const [chartsItem, setChartsItem] = useState<FeedItem | null>(null)

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
  // Vientisas feedas — begalinis skrolinimas „Mėgstami" režime.
  const canLoadMore = mode === 'sekami' && !!nextBefore

  // Infinite scroll
  const sentinel = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!canLoadMore) return
    const el = sentinel.current
    if (!el) return
    const obs = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) moreFeed() }, { rootMargin: '200px 0px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [canLoadMore, moreFeed, filtered.length])

  const cardProps = { onDismiss: dismiss, onWhy: setWhyItem, onOpenCharts: setChartsItem }

  return (
    <div className="sr-wrap">
      <style>{`
        .sr-wrap { max-width: 900px; margin: 0 auto; padding: 18px 18px 40px; }

        /* ── Filtrų juosta (/topai chip stilius) — desktop: režimai kairėj, ⚙ dešinėj ── */
        .srf { display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:20px; }
        .srf-modes { display:flex; align-items:center; gap:8px; }
        .srf-chip { display:inline-flex; align-items:center; gap:8px; padding:6px 16px; border-radius:100px;
          font-size:13px; font-weight:600; font-family:'Outfit', sans-serif; cursor:pointer; white-space:nowrap; line-height:1.3;
          background:var(--bg-hover, var(--bg-surface)); border:1px solid var(--border-default, var(--border-subtle)); color:var(--text-secondary);
          transition:color .15s, border-color .15s, background .15s; -webkit-tap-highlight-color:transparent; text-decoration:none; }
        .srf-chip svg { width:15px; height:15px; display:block; }
        .srf-chip:hover { color:var(--text-primary); border-color:rgba(249,115,22,0.4); }
        .srf-chip.on { background:var(--accent-orange); border-color:var(--accent-orange); color:#fff; }
        .srf-gear { padding:7px 11px; color:var(--text-muted); }
        .srf-gear svg { width:16px; height:16px; }
        .srf-gear:hover { color:var(--text-primary); }
        @media (max-width:860px) { .srf { justify-content:center; } }

        /* ── Feedas: viena pilno pločio kolona ── */
        .sr-list { display:flex; flex-direction:column; gap:12px; }
        .srl-card { display:flex; flex-direction:column; }

        /* ── Pilno pločio eilutė ── */
        .srl { position:relative; display:flex; align-items:stretch; gap:0; text-decoration:none; overflow:hidden; will-change:transform;
          background:var(--bg-elevated); border:1px solid var(--border-subtle); border-radius:16px;
          min-height:116px; transition:border-color .15s, box-shadow .15s; }
        .srl:hover { border-color:var(--border-strong); box-shadow:0 8px 22px rgba(0,0,0,0.18); }
        .srl-cover { position:relative; flex:0 0 auto; width:150px; overflow:hidden; align-self:stretch;
          background:linear-gradient(135deg, var(--bg-active), var(--bg-surface)); }
        .srl-cover img { width:100%; height:100%; object-fit:cover; display:block; transition:transform .35s ease; }
        .srl:hover .srl-cover img { transform:scale(1.04); }
        .srl-cover--ph { display:flex; align-items:center; justify-content:center; }
        .srl-cover--ph span { font-weight:800; color:var(--text-faint); font-family:'Outfit', sans-serif; font-size:42px; }

        /* ── Mini grotuvas dešinėj (daina / rekomenduojamo atlikėjo top daina) ── */
        .srl--hasmini .srl-body { padding-right:16px; }
        .srl-mini { position:relative; flex:0 0 auto; width:200px; align-self:center; margin:10px 14px 10px 6px;
          border-radius:12px; overflow:hidden; aspect-ratio:16/9; background:#000; box-shadow:0 3px 10px rgba(0,0,0,0.22); }
        .srl-mini-play { display:block; width:100%; height:100%; padding:0; border:0; cursor:pointer; position:relative; background:#000; }
        .srl-mini-play img { width:100%; height:100%; object-fit:cover; display:block; opacity:.92; transition:opacity .15s, transform .35s ease; }
        .srl-mini-play:hover img { opacity:1; transform:scale(1.04); }
        .srl-mini-pbtn { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:42px; height:42px; border-radius:50%;
          background:rgba(0,0,0,0.6); color:#fff; display:flex; align-items:center; justify-content:center; transition:background .15s; }
        .srl-mini-play:hover .srl-mini-pbtn { background:var(--accent-orange); }
        .srl-mini-pbtn svg { width:18px; height:18px; margin-left:2px; }
        .srl-mini iframe { width:100%; height:100%; border:0; display:block; }

        .srl-body { flex:1; min-width:0; display:flex; flex-direction:column; justify-content:center; gap:4px; padding:13px 50px 13px 16px; }
        .srl-kicker { font-size:10.5px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; line-height:1; }
        .srl-title { font-size:16px; font-weight:700; color:var(--text-primary); line-height:1.3;
          display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
        .srl-subrow { display:flex; align-items:center; gap:7px; min-width:0; }
        .srl-avatar { width:19px; height:19px; border-radius:50%; object-fit:cover; flex:0 0 auto; box-shadow:0 0 0 1px var(--border-subtle); }
        .srl-sub { font-size:12.5px; color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .srl-excerpt { font-size:13px; color:var(--text-muted); line-height:1.5; margin-top:2px;
          display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
        .srl-quote { font-style:italic; }
        .srl-byline { display:flex; align-items:center; gap:6px; font-size:11.5px; color:var(--text-secondary); margin-top:1px; }
        .srl-byline-av { width:16px; height:16px; border-radius:50%; object-fit:cover; flex:0 0 auto; }
        .srl-trip { font-size:12px; color:var(--text-secondary); margin-top:1px; }
        .srl-thumbs { display:flex; align-items:center; gap:6px; margin-top:5px; flex-wrap:wrap; }
        .srl-thumb { width:34px; height:34px; border-radius:8px; object-fit:cover; flex:0 0 auto; box-shadow:0 0 0 1px var(--border-subtle); }
        .srl-thumb--ph { display:inline-flex; align-items:center; justify-content:center; background:var(--bg-active); color:var(--text-faint); font-weight:800; font-size:14px; font-family:'Outfit', sans-serif; }
        .srl-because { display:flex; align-items:center; gap:5px; font-size:12px; color:var(--accent-orange); margin-top:2px; min-width:0;
          background:none; border:none; padding:0; cursor:pointer; font-family:inherit; text-align:left; }
        .srl-because svg { width:13px; height:13px; flex:0 0 auto; }
        .srl-because span { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .srl-because:hover span { text-decoration:underline; }
        .srl-foot { display:flex; align-items:center; gap:9px; font-size:11.5px; color:var(--text-faint); margin-top:3px; flex-wrap:wrap; }
        .srl-stat { position:relative; padding-left:12px; }
        .srl-stat::before { content:''; position:absolute; left:0; top:50%; width:3px; height:3px; border-radius:50%; background:currentColor; transform:translateY(-50%); }

        @media (max-width:560px) {
          .srl-cover { width:108px; }
          .srl { min-height:96px; }
          .srl-cover--ph span { font-size:32px; }
          .srl-title { font-size:14.5px; }
          .srl-body { padding:11px 46px 11px 13px; }
          /* mini grotuvas keliasi po kortele (visa eilutė) */
          .srl--hasmini { flex-wrap:wrap; }
          .srl--hasmini .srl-mini { order:3; flex:0 0 100%; width:100%; margin:0; border-radius:0; }
          .srl--hasmini .srl-body { padding-right:46px; }
        }

        /* ── Veiksmų ikonos ── */
        .sr-act { position:absolute; cursor:pointer; padding:0; z-index:3; border-radius:50%;
          display:inline-flex; align-items:center; justify-content:center;
          background:var(--bg-elevated); border:1px solid var(--border-default, var(--border-subtle));
          box-shadow:0 2px 8px rgba(0,0,0,0.16); transition:transform .14s, background .14s, color .14s, border-color .14s, opacity .14s; -webkit-tap-highlight-color:transparent; }
        .sr-like { bottom:6px; right:6px; width:28px; height:28px; color:var(--accent-orange); }
        .sr-like svg { width:15px; height:15px; }
        .sr-like:hover { transform:scale(1.1); }
        .sr-like.done { background:var(--accent-orange); border-color:var(--accent-orange); color:#fff; }
        .sr-like:disabled { opacity:.7; }
        .sr-dismiss { top:6px; right:6px; width:25px; height:25px; color:var(--text-muted); opacity:0; }
        .sr-dismiss svg { width:13px; height:13px; }
        .sr-dismiss:hover { transform:scale(1.1); color:var(--text-primary); }
        .srl:hover .sr-dismiss, .sr-dismiss:focus-visible { opacity:1; }

        /* ── „Kodėl pasiūlyta" modalas ── */
        .sr-wm-back { position:fixed; inset:0; z-index:1000; background:rgba(0,0,0,0.55); backdrop-filter:blur(3px);
          display:flex; align-items:center; justify-content:center; padding:18px; }
        .sr-wm { position:relative; max-width:420px; width:100%; background:var(--bg-elevated); border:1px solid var(--border-default,var(--border-subtle));
          border-radius:18px; padding:22px 20px 20px; box-shadow:0 18px 50px rgba(0,0,0,0.4); }
        .sr-wm-x { position:absolute; top:12px; right:12px; width:30px; height:30px; border-radius:50%; border:none; cursor:pointer;
          background:var(--bg-surface); color:var(--text-secondary); display:inline-flex; align-items:center; justify-content:center; }
        .sr-wm-x svg { width:16px; height:16px; }
        .sr-wm-h { font-size:17px; font-weight:800; color:var(--text-primary); margin-bottom:10px; }
        .sr-wm-p { font-size:13.5px; line-height:1.5; color:var(--text-secondary); margin:0 0 14px; }
        .sr-wm-arts { display:flex; flex-direction:column; gap:9px; margin-bottom:15px; }
        .sr-wm-art { display:flex; align-items:center; gap:10px; font-size:14px; font-weight:600; color:var(--text-primary); }
        .sr-wm-art img { width:34px; height:34px; border-radius:50%; object-fit:cover; flex:0 0 auto; box-shadow:0 0 0 1px var(--border-subtle); }
        .sr-wm-ph { width:34px; height:34px; border-radius:50%; flex:0 0 auto; display:inline-flex; align-items:center; justify-content:center;
          background:var(--bg-active); color:var(--text-faint); font-weight:800; font-size:14px; }
        .sr-wm-note { font-size:12px; line-height:1.5; color:var(--text-faint); margin:0; border-top:1px solid var(--border-subtle); padding-top:12px; }
        .sr-wm--charts { max-width:460px; }
        .sr-ch-list { display:flex; flex-direction:column; gap:14px; max-height:60vh; overflow-y:auto; }
        .sr-ch-grp { }
        .sr-ch-name { display:inline-block; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.04em;
          color:var(--accent-orange); text-decoration:none; margin-bottom:6px; }
        .sr-ch-name:hover { text-decoration:underline; }
        .sr-ch-rows { display:flex; flex-direction:column; gap:2px; }
        .sr-ch-row { display:flex; align-items:center; gap:10px; padding:6px 8px; border-radius:8px; text-decoration:none;
          color:var(--text-primary); transition:background .12s; }
        .sr-ch-row:hover { background:var(--bg-surface); }
        .sr-ch-pos { font-size:12px; font-weight:800; color:var(--text-faint); min-width:26px; }
        .sr-ch-av { width:32px; height:32px; border-radius:7px; object-fit:cover; flex:0 0 auto; box-shadow:0 0 0 1px var(--border-subtle); }
        .sr-ch-av--ph { display:inline-flex; align-items:center; justify-content:center; background:var(--bg-active); color:var(--text-faint); font-weight:800; font-size:13px; }
        .sr-ch-art { font-size:14px; font-weight:600; }

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

        @media (max-width:860px) {
          .sr-wrap { padding:12px 12px 32px; }
          .srl-body { padding-right:44px; }
          /* mobile neturi hover — × visada matomas */
          .sr-dismiss { opacity:.85; }
        }
      `}</style>

      {/* Filtrų juosta — režimai (kairėj) + ⚙ (dešinėj); mobile viskas šalia */}
      <div className="srf">
        <div className="srf-modes" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'sekami'} className={`srf-chip${mode === 'sekami' ? ' on' : ''}`} onClick={() => switchMode('sekami')}>
            {IconHeart}<span>Mėgstami</span>
          </button>
          <button type="button" role="tab" aria-selected={mode === 'tau'} className={`srf-chip${mode === 'tau' ? ' on' : ''}`} onClick={() => switchMode('tau')}>
            {IconCompass}<span>Tau gali patikti</span>
          </button>
        </div>
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
          <div className="sr-list">
            {filtered.map(it => <FeedCard key={it.key} it={it} {...cardProps} />)}
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

      {whyItem && <WhyModal it={whyItem} onClose={() => setWhyItem(null)} />}
      {chartsItem && <ChartsModal it={chartsItem} onClose={() => setChartsItem(null)} />}
    </div>
  )
}

/** Topų modalas — kuris pamėgtas atlikėjas kuriame tope (grupuota pagal topą). */
function ChartsModal({ it, onClose }: { it: FeedItem; onClose: () => void }) {
  const rows = it.meta?.chartRows || []
  const byChart = new Map<string, { href: string; entries: { artist: string; position: number; image?: string | null }[] }>()
  for (const r of rows) {
    const g = byChart.get(r.chart) || { href: r.href, entries: [] }
    g.entries.push({ artist: r.artist, position: r.position, image: r.image })
    byChart.set(r.chart, g)
  }
  return (
    <div className="sr-wm-back" onClick={onClose}>
      <div className="sr-wm sr-wm--charts" onClick={e => e.stopPropagation()}>
        <button type="button" className="sr-wm-x" onClick={onClose} aria-label="Uždaryti">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <div className="sr-wm-h">Tavo atlikėjai topuose</div>
        <div className="sr-ch-list">
          {Array.from(byChart.entries()).map(([chart, g]) => (
            <div className="sr-ch-grp" key={chart}>
              <Link href={g.href} className="sr-ch-name">{chart}</Link>
              <div className="sr-ch-rows">
                {g.entries.sort((a, b) => a.position - b.position).map((e, i) => (
                  <Link href={g.href} className="sr-ch-row" key={i}>
                    <span className="sr-ch-pos">#{e.position}</span>
                    {e.image
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img className="sr-ch-av" src={proxyImgResized(e.image, 64)} alt="" loading="lazy" />
                      : <span className="sr-ch-av sr-ch-av--ph">{e.artist.trim()[0]?.toUpperCase() || '?'}</span>}
                    <span className="sr-ch-art">{e.artist}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** „Kodėl pasiūlyta" modalas. */
function WhyModal({ it, onClose }: { it: FeedItem; onClose: () => void }) {
  const arts = (it.becauseArtists || []).filter(a => a.name)
  return (
    <div className="sr-wm-back" onClick={onClose}>
      <div className="sr-wm" onClick={e => e.stopPropagation()}>
        <button type="button" className="sr-wm-x" onClick={onClose} aria-label="Uždaryti">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <div className="sr-wm-h">Kodėl tau tai siūlome</div>
        <p className="sr-wm-p">
          <b>{it.title}</b> pasiūlyta pagal tavo muzikos skonį — tai mėgsta klausytojai, kuriems patinka ir{arts.length ? ' šie tavo atlikėjai:' : ' panašūs atlikėjai.'}
        </p>
        {arts.length > 0 && (
          <div className="sr-wm-arts">
            {arts.map((a, i) => (
              <span className="sr-wm-art" key={i}>
                {a.image
                  ? // eslint-disable-next-line @next/next/no-img-element
                    <img src={proxyImgResized(a.image, 96)} alt="" loading="lazy" />
                  : <span className="sr-wm-ph">{a.name.trim()[0]?.toUpperCase() || '?'}</span>}
                <span>{a.name}</span>
              </span>
            ))}
          </div>
        )}
        <p className="sr-wm-note">Rekomendacijos remiasi „co-like" principu — kokius atlikėjus kartu mėgsta panašaus skonio klausytojai — bei žanrų / stiliaus artumu.</p>
      </div>
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
