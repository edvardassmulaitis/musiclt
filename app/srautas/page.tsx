'use client'

/**
 * /srautas — ❤️ asmeninė muzikos zona. Du režimai, perjungiami filtrų juostoje
 * (kaip /renginiai, /naujienos), NE tabais:
 *   • Mėgstami  — turinys iš JAU pamėgtų atlikėjų (/api/srautas/feed). DEFAULT.
 *   • Atradimai — atradimų rekomendacijos (/api/srautas/recommendations).
 *
 * Filtrų juosta: segmentinis režimo perjungiklis (su ikonomis) + turinio tipo
 * chip'ai, be tekstinių „Rodyti"/„Tipas" etikečių. Tipas taikomas kliente.
 *
 * Layout = žurnalo tinklelis (desktop) / vientisas vienas-per-eilę sąrašas su
 * horizontaliomis kortelėmis (mobile — daugiau erdvės). Atlikėjų, dainų ir
 * albumų kortelėse — širdutė: paspaudus iškart sekamas atlikėjas / mėgstama
 * daina ar albumas (POST /api/{artists|tracks|albums}/[id]/like).
 *
 * GREITAVEIKA: feed'as užkraunamas IŠKART (mount), nelaukiant useSession.
 */

import { useEffect, useState, useCallback, useMemo, Suspense, type MouseEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession, signIn } from 'next-auth/react'
import { proxyImg } from '@/lib/img-proxy'

type Kind = 'news' | 'blog' | 'track' | 'album' | 'artist' | 'event' | 'topic'
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
  artist?: { id: number; name: string; slug: string | null } | null
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

// Turinio tipo filtrai — priklauso nuo režimo (skirtingi šaltiniai).
type TypeKey = 'all' | 'news' | 'music' | 'blog' | 'event' | 'artist' | 'topic'
const TYPE_FILTERS: Record<Mode, { key: TypeKey; label: string }[]> = {
  sekami: [
    { key: 'all', label: 'Viskas' },
    { key: 'news', label: 'Naujienos' },
    { key: 'music', label: 'Muzika' },
    { key: 'blog', label: 'Įrašai' },
    { key: 'event', label: 'Koncertai' },
  ],
  tau: [
    { key: 'all', label: 'Viskas' },
    { key: 'artist', label: 'Atlikėjai' },
    { key: 'music', label: 'Muzika' },
    { key: 'event', label: 'Koncertai' },
    { key: 'topic', label: 'Temos' },
  ],
}

function matchesType(kind: Kind, type: TypeKey): boolean {
  if (type === 'all') return true
  if (type === 'music') return kind === 'track' || kind === 'album'
  return kind === type
}

function plural(n: number): string {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return 'įrašas'
  if (m10 >= 2 && m10 <= 9 && !(m100 >= 12 && m100 <= 14)) return 'įrašai'
  return 'įrašų'
}

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.now() - Date.parse(iso)
  if (!Number.isFinite(ms)) return ''
  const d = Math.floor(ms / 86400000)
  if (d <= 0) return 'šiandien'
  if (d === 1) return 'vakar'
  if (d < 7) return `prieš ${d} d.`
  if (d < 30) return `prieš ${Math.floor(d / 7)} sav.`
  if (d < 365) return `prieš ${Math.floor(d / 30)} mėn.`
  return `prieš ${Math.floor(d / 365)} m.`
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

/**
 * Širdutės mygtukas — sekti atlikėją / mėgti dainą ar albumą. Optimistinis
 * toggle, atspari klaidoms. Endpoint pagal entity tipą.
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
    setLiked(next) // optimistic
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
    <button
      type="button"
      className={`sr-like${liked ? ' done' : ''}`}
      onClick={toggle}
      disabled={busy}
      aria-label={label}
      title={label}
    >
      <svg viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={HEART_PATH} />
      </svg>
    </button>
  )
}

/** Iš feed key (pvz. "track-123") ištraukia skaitinį id. */
function idFromKey(key: string): number {
  const n = Number(key.split('-').pop())
  return Number.isFinite(n) ? n : 0
}

/** Vertikali žurnalo kortelė — naujienoms, įrašams, leidiniams, koncertams, temoms. */
function ContentCard({ it }: { it: FeedItem }) {
  const initial = (it.title || '?').trim()[0]?.toUpperCase() || '?'
  const when = it.kind === 'event' ? eventWhen(it.date) : timeAgo(it.date)
  const likeable = it.kind === 'track' || it.kind === 'album'
  return (
    <Link href={it.href} className="sr-card">
      <div className="sr-cover">
        {it.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxyImg(it.image)} alt="" loading="lazy" />
        ) : (
          <span className="sr-cover-ph">{initial}</span>
        )}
        <span className="sr-badge" style={{ color: '#fff', background: BADGE_COLOR[it.kind] }}>
          {it.badge}{it.kind === 'blog' && it.meta?.rating ? ` · ${it.meta.rating}/10` : ''}
        </span>
        {likeable && <LikeButton entity={it.kind as LikeEntity} id={idFromKey(it.key)} />}
      </div>
      <div className="sr-body">
        <span className="sr-title">{it.title}</span>
        {it.because ? (
          <span className="sr-because">Nes tau patinka {it.because}</span>
        ) : it.subtitle ? (
          <span className="sr-sub">{it.subtitle}</span>
        ) : null}
        {when && <span className="sr-time">{when}</span>}
      </div>
    </Link>
  )
}

/** Atlikėjo rekomendacijos kortelė su „sekti" širdute ant viršelio. */
function ArtistCard({ it }: { it: FeedItem }) {
  const initial = (it.title || '?').trim()[0]?.toUpperCase() || '?'
  return (
    <Link href={it.href} className="sr-card sr-card--artist">
      <div className="sr-cover sr-cover--artist">
        {it.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxyImg(it.image)} alt="" loading="lazy" />
        ) : (
          <span className="sr-cover-ph">{initial}</span>
        )}
        <span className="sr-badge" style={{ color: '#fff', background: BADGE_COLOR.artist }}>{it.badge}</span>
        {it.artist?.id ? <LikeButton entity="artist" id={it.artist.id} /> : null}
      </div>
      <div className="sr-body">
        <span className="sr-title sr-title--artist">{it.title}</span>
        {it.because ? (
          <span className="sr-because">Nes tau patinka {it.because}</span>
        ) : it.subtitle ? (
          <span className="sr-sub">{it.subtitle}</span>
        ) : null}
      </div>
    </Link>
  )
}

const SEK_TTL = 5 * 60 * 1000

function SrautasInner() {
  const { data: session } = useSession()
  const router = useRouter()
  const params = useSearchParams()

  // DEFAULT = Mėgstami. Tik aiškus ?t=tau atidaro Atradimus (be localStorage restore).
  const initialMode: Mode = params.get('t') === 'tau' ? 'tau' : 'sekami'
  const [mode, setMode] = useState<Mode>(initialMode)
  const [type, setType] = useState<TypeKey>('all')

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
    setType('all') // tipų rinkiniai skiriasi tarp režimų
    const sp = new URLSearchParams(Array.from(params.entries()))
    if (m === 'sekami') sp.delete('t'); else sp.set('t', m)
    const qs = sp.toString()
    router.replace(`/srautas${qs ? `?${qs}` : ''}`, { scroll: false })
  }

  // ── Sekami feed — užkraunamas IŠKART, nelaukiant session (cookie užtenka). ──
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

  const moreFeed = async () => {
    if (!nextBefore || loadingMore) return
    setLoadingMore(true)
    try {
      const d = await loadFeed(nextBefore)
      setItems(prev => [...prev, ...(d.items || [])])
      setNextBefore(d.nextBefore || null)
    } finally { setLoadingMore(false) }
  }

  // ── Tau feed (lazy — kai perjungiama į Atradimus) ──
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

  // Aktyvaus režimo duomenys + tipo filtras (kliente).
  const sourceItems = mode === 'sekami' ? items : recs
  const filtered = useMemo(
    () => sourceItems.filter(it => matchesType(it.kind, type)),
    [sourceItems, type],
  )
  const isLoading = mode === 'sekami' ? loading : (recLoading && recs.length === 0)
  const isPersonalized = mode === 'sekami' ? personalized : recPersonalized

  return (
    <div className="sr-wrap">
      <style>{`
        .sr-wrap { max-width: 1180px; margin: 0 auto; padding: 18px 18px 40px; }

        /* ── Filtrų juosta ── */
        .srf-bar { display:flex; flex-wrap:wrap; gap:8px; align-items:center; padding:10px 11px; border-radius:14px;
          background:var(--bg-surface); border:1px solid var(--border-default, rgba(255,255,255,0.08)); margin-bottom:8px; }
        .srf-divider { width:1px; height:24px; background:var(--border-default, rgba(255,255,255,0.12)); margin:0 3px; }

        /* Segmentinis režimo perjungiklis */
        .srf-seg { display:inline-flex; gap:3px; background:var(--bg-hover); border:1px solid var(--border-default, rgba(255,255,255,0.08));
          border-radius:100px; padding:3px; }
        .srf-seg button { display:inline-flex; align-items:center; gap:7px; padding:7px 16px; border-radius:100px; border:none;
          background:transparent; color:var(--text-secondary); font-family:inherit; font-size:13px; font-weight:700; cursor:pointer;
          transition:all .15s; white-space:nowrap; -webkit-tap-highlight-color:transparent; }
        .srf-seg button svg { width:15px; height:15px; }
        .srf-seg button:not(.on):hover { color:var(--text-primary); }
        .srf-seg button.on { background:var(--accent-orange); color:#fff; box-shadow:0 1px 6px rgba(249,115,22,0.4); }

        /* Tipo chip'ai */
        .srf-chip { display:inline-flex; align-items:center; padding:7px 14px; border-radius:100px; font-size:12.5px; font-weight:700;
          font-family:inherit; background:var(--bg-hover); border:1px solid var(--border-default, rgba(255,255,255,0.08));
          color:var(--text-secondary); transition:all .15s; white-space:nowrap; cursor:pointer; line-height:1.3; -webkit-tap-highlight-color:transparent; }
        .srf-chip:hover { color:var(--text-primary); border-color:rgba(249,115,22,0.4); }
        .srf-chip.on { background:var(--text-primary); border-color:var(--text-primary); color:var(--bg-base, #0d0d0f); }
        .srf-count { margin-left:auto; font-size:12px; color:var(--text-faint); white-space:nowrap; padding-left:6px; }
        .sr-lead { font-size:13.5px; color:var(--text-muted); margin:12px 2px 16px; }

        /* ── CTA (ne-personalizuotas) ── */
        .sr-cta { display:flex; align-items:center; gap:12px; flex-wrap:wrap;
          background:var(--bg-elevated); border:1px solid var(--border-subtle); border-radius:14px;
          padding:14px 16px; margin-bottom:18px; font-size:14px; color:var(--text-secondary); }
        .sr-cta a, .sr-cta button { margin-left:auto; text-decoration:none; border:none; cursor:pointer;
          background:var(--accent-orange); color:#fff; font-weight:700; font-size:13px; padding:8px 16px; border-radius:9px; font-family:inherit; }

        /* ── Žurnalo tinklelis (desktop) ── */
        .sr-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(228px, 1fr)); gap:16px; }
        .sr-card { display:flex; flex-direction:column; text-decoration:none; overflow:hidden;
          background:var(--bg-elevated); border:1px solid var(--border-subtle); border-radius:16px;
          transition:border-color .15s, transform .12s, box-shadow .15s; }
        .sr-card:hover { border-color:var(--border-strong); transform:translateY(-2px); box-shadow:0 8px 22px rgba(0,0,0,0.22); }
        .sr-card:active { transform:translateY(0); }
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
        .sr-title { font-size:14.5px; font-weight:700; color:var(--text-primary); line-height:1.3;
          display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
        .sr-title--artist { -webkit-line-clamp:1; font-weight:800; font-size:15px; }
        .sr-sub { font-size:12.5px; color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .sr-because { font-size:12px; color:var(--accent-orange); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:600; }
        .sr-time { font-size:11.5px; color:var(--text-faint); margin-top:1px; }

        /* ── Širdutė (sekti / pamėgti) ── */
        .sr-like { position:absolute; top:8px; right:8px; width:36px; height:36px; border-radius:50%; cursor:pointer; font-family:inherit;
          border:none; background:rgba(0,0,0,0.42); backdrop-filter:blur(4px); color:#fff;
          display:inline-flex; align-items:center; justify-content:center; transition:transform .14s, background .14s, color .14s;
          box-shadow:0 2px 8px rgba(0,0,0,0.28); z-index:2; }
        .sr-like svg { width:19px; height:19px; }
        .sr-like:hover { transform:scale(1.1); background:rgba(0,0,0,0.6); }
        .sr-like:disabled { opacity:.7; }
        .sr-like.done { background:#fff; color:#f5466b; }

        /* ── Pagalbiniai ── */
        .sr-more { margin:26px auto 0; display:block; border:1px solid var(--border-default);
          background:var(--bg-elevated); color:var(--text-secondary); font-weight:700; font-size:14px; padding:11px 30px; border-radius:10px; cursor:pointer; font-family:inherit; }
        .sr-more:hover { border-color:var(--accent-orange); color:var(--text-primary); }
        .sr-end { text-align:center; padding:28px 0 4px; font-size:12.5px; color:var(--text-faint); }
        .sr-empty { text-align:center; padding:56px 16px; color:var(--text-muted); }
        .sr-loading { display:flex; justify-content:center; padding:64px 0; }

        /* ── MOBILE: vienas įrašas per eilę, horizontali kortelė (daugiau erdvės) ── */
        @media (max-width:680px) {
          .sr-wrap { padding:12px 12px 32px; }
          .sr-grid { grid-template-columns:1fr; gap:10px; }
          .sr-card { flex-direction:row; align-items:stretch; }
          .sr-cover { aspect-ratio:auto; width:128px; flex:0 0 128px; min-height:100px; }
          .sr-cover--artist { width:104px; flex-basis:104px; }
          .sr-body { flex:1; justify-content:center; padding:11px 13px; gap:3px; }
          .sr-title { font-size:14px; }
          .sr-sub, .sr-because { white-space:normal; display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; }
          .sr-badge { font-size:9.5px; padding:3px 7px; top:7px; left:7px; }
          .sr-like { width:32px; height:32px; top:6px; right:6px; }
          .sr-like svg { width:17px; height:17px; }
          .srf-bar { padding:9px; gap:7px; }
          .srf-seg button { padding:7px 13px; }
          .srf-count { width:100%; margin-left:0; order:9; text-align:right; }
        }
      `}</style>

      {/* Filtrų juosta: režimas (segmentinis) + turinio tipas, be etikečių */}
      <div className="srf-bar">
        <div className="srf-seg" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'sekami'} className={mode === 'sekami' ? 'on' : ''} onClick={() => switchMode('sekami')}>
            {IconHeart}<span>Mėgstami</span>
          </button>
          <button type="button" role="tab" aria-selected={mode === 'tau'} className={mode === 'tau' ? 'on' : ''} onClick={() => switchMode('tau')}>
            {IconCompass}<span>Atradimai</span>
          </button>
        </div>
        <span className="srf-divider" />
        {TYPE_FILTERS[mode].map(t => (
          <button key={t.key} type="button" className={`srf-chip${type === t.key ? ' on' : ''}`} onClick={() => setType(t.key)}>{t.label}</button>
        ))}
        {!isLoading && filtered.length > 0 && (
          <span className="srf-count">{filtered.length} {plural(filtered.length)}</span>
        )}
      </div>

      <p className="sr-lead">
        {mode === 'sekami'
          ? (isPersonalized === false ? 'Naujausias turinys iš bendruomenės.' : 'Kas naujo tavo sekamų atlikėjų pasaulyje.')
          : (isPersonalized === false ? 'Atlikėjai ir muzika, kuriuos verta atrasti.' : 'Atrask naujų atlikėjų pagal tai, ką jau mėgsti.')}
      </p>

      {mode === 'sekami' && isPersonalized === false && (
        <div className="sr-cta">
          {session?.user
            ? <><span>Pamėk atlikėjų — ir srautas taps asmeniškas.</span><Link href="/muzika">Naršyti atlikėjus</Link></>
            : <><span>Prisijunk, kad srautas būtų pritaikytas tau.</span><button onClick={() => signIn()}>Prisijungti</button></>}
        </div>
      )}

      {isLoading ? (
        <Equalizer />
      ) : filtered.length === 0 ? (
        <div className="sr-empty">
          {sourceItems.length > 0
            ? 'Šio tipo turinio kol kas nėra. Pabandyk kitą filtrą.'
            : mode === 'sekami'
              ? 'Kol kas tuščia. Pamėk atlikėjų arba užsuk vėliau.'
              : (session?.user
                  ? 'Pamėk kelis atlikėjus — ir čia atsiras rekomendacijos.'
                  : <>Prisijunk, kad gautum asmenines rekomendacijas. <button className="sr-more" onClick={() => signIn()}>Prisijungti</button></>)}
        </div>
      ) : (
        <>
          <div className="sr-grid">
            {filtered.map(it => it.kind === 'artist'
              ? <ArtistCard key={it.key} it={it} />
              : <ContentCard key={it.key} it={it} />)}
          </div>
          {mode === 'sekami' && nextBefore
            ? <button className="sr-more" onClick={moreFeed} disabled={loadingMore}>{loadingMore ? 'Kraunama…' : (type === 'all' ? 'Rodyti daugiau' : 'Užkrauti daugiau įrašų')}</button>
            : <div className="sr-end">Tai viskas kol kas ✦</div>}
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
