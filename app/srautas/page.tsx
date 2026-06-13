'use client'

/**
 * /srautas — ❤️ asmeninė muzikos zona. Du režimai, perjungiami filtrų juostoje
 * (kaip /renginiai, /naujienos), NE tabais:
 *   • Mėgstami  — turinys iš JAU pamėgtų atlikėjų (/api/srautas/feed).
 *   • Atradimai — atradimų rekomendacijos (/api/srautas/recommendations).
 *
 * Po režimo — turinio tipo filtrai (Viskas · Naujienos · Muzika · Įrašai ·
 * Koncertai / Atlikėjai · Temos), taikomi kliente jau užkrautam srautui.
 *
 * Layout = pilno pločio žurnalo tinklelis (responsive grid) su vizualiomis
 * kortelėmis. Abu feed'ai cache'inami klientiškai (sessionStorage) + serveris
 * juos parallelina ir cache'ina → grįžus atsiranda iškart. Loading = equalizer.
 */

import { useEffect, useState, useCallback, useMemo, Suspense, type MouseEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession, signIn } from 'next-auth/react'
import { proxyImg } from '@/lib/img-proxy'

type Kind = 'news' | 'blog' | 'track' | 'album' | 'artist' | 'event' | 'topic'
type Mode = 'sekami' | 'tau'

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

/** Vertikali žurnalo kortelė — naujienoms, įrašams, leidiniams, koncertams, temoms. */
function ContentCard({ it }: { it: FeedItem }) {
  const initial = (it.title || '?').trim()[0]?.toUpperCase() || '?'
  const when = it.kind === 'event' ? eventWhen(it.date) : timeAgo(it.date)
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

/** Atlikėjo rekomendacijos kortelė su širdute (sekti) — viršuje ant viršelio. */
function ArtistCard({ it }: { it: FeedItem }) {
  const [following, setFollowing] = useState(false)
  const [busy, setBusy] = useState(false)
  const initial = (it.title || '?').trim()[0]?.toUpperCase() || '?'

  const follow = async (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (busy || !it.artist) return
    setBusy(true)
    const next = !following
    setFollowing(next) // optimistic
    try {
      const res = await fetch(`/api/artists/${it.artist.id}/like`, { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (data && typeof data.liked === 'boolean') setFollowing(data.liked)
    } catch {
      setFollowing(!next)
    } finally {
      setBusy(false)
    }
  }

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
        <button
          type="button"
          className={`sr-heart${following ? ' done' : ''}`}
          onClick={follow}
          disabled={busy}
          aria-label={following ? 'Nebesekti' : 'Sekti atlikėją'}
          title={following ? 'Seki' : 'Sekti'}
        >
          <svg viewBox="0 0 24 24" fill={following ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />
          </svg>
        </button>
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
  const uid = (session?.user as any)?.id || 'anon'

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

  // Pirmas užkrovimas: jei URL be ?t= → atstatom režimą iš localStorage.
  useEffect(() => {
    if (params.get('t')) return
    try {
      const saved = localStorage.getItem('srautas_tab')
      if (saved === 'tau' || saved === 'sekami') setMode(saved)
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const switchMode = (m: Mode) => {
    if (m === mode) return
    setMode(m)
    setType('all') // tipų rinkiniai skiriasi tarp režimų
    try { localStorage.setItem('srautas_tab', m) } catch { /* ignore */ }
    const sp = new URLSearchParams(Array.from(params.entries()))
    sp.set('t', m)
    router.replace(`/srautas?${sp.toString()}`, { scroll: false })
  }

  // ── Sekami feed (su sessionStorage cache) ──
  const loadFeed = useCallback(async (before?: string | null) => {
    const url = `/api/srautas/feed?limit=30${before ? `&before=${encodeURIComponent(before)}` : ''}`
    const res = await fetch(url)
    return (await res.json()) as { items: FeedItem[]; personalized: boolean; nextBefore: string | null }
  }, [])

  useEffect(() => {
    let alive = true
    const cacheKey = `srautas_sekami_${uid}`
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
  }, [loadFeed, uid])

  const moreFeed = async () => {
    if (!nextBefore || loadingMore) return
    setLoadingMore(true)
    try {
      const d = await loadFeed(nextBefore)
      setItems(prev => [...prev, ...(d.items || [])])
      setNextBefore(d.nextBefore || null)
    } finally { setLoadingMore(false) }
  }

  // ── Tau feed (lazy + sessionStorage cache) ──
  useEffect(() => {
    if (mode !== 'tau' || recLoaded) return
    let alive = true
    const cacheKey = `srautas_tau_${uid}`
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
  }, [mode, recLoaded, uid])

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

        /* ── Filtrų juosta (kaip /renginiai) ── */
        .srf-bar { display:flex; flex-wrap:wrap; gap:7px; align-items:center; padding:11px 12px; border-radius:14px;
          background:var(--bg-surface); border:1px solid var(--border-default, rgba(255,255,255,0.08)); margin-bottom:8px; }
        .srf-lbl { font-size:11px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; color:var(--text-faint); padding:0 2px; }
        .srf-divider { width:1px; height:22px; background:var(--border-default, rgba(255,255,255,0.1)); margin:0 4px; }
        .srf-chip { display:inline-flex; align-items:center; gap:6px; padding:6px 14px; border-radius:100px; font-size:12.5px; font-weight:700;
          font-family:inherit; background:var(--bg-hover); border:1px solid var(--border-default, rgba(255,255,255,0.08));
          color:var(--text-secondary); transition:all .15s; white-space:nowrap; cursor:pointer; line-height:1.3; -webkit-tap-highlight-color:transparent; }
        .srf-chip:hover { color:var(--text-primary); border-color:rgba(249,115,22,0.4); }
        .srf-chip.on { background:var(--accent-orange); border-color:var(--accent-orange); color:#fff; }
        .srf-mode { font-size:13px; padding:7px 16px; }
        .srf-count { margin-left:auto; font-size:12px; color:var(--text-faint); white-space:nowrap; padding-left:6px; }
        .sr-lead { font-size:13.5px; color:var(--text-muted); margin:12px 2px 16px; }

        /* ── CTA (ne-personalizuotas) ── */
        .sr-cta { display:flex; align-items:center; gap:12px; flex-wrap:wrap;
          background:var(--bg-elevated); border:1px solid var(--border-subtle); border-radius:14px;
          padding:14px 16px; margin-bottom:18px; font-size:14px; color:var(--text-secondary); }
        .sr-cta a, .sr-cta button { margin-left:auto; text-decoration:none; border:none; cursor:pointer;
          background:var(--accent-orange); color:#fff; font-weight:700; font-size:13px; padding:8px 16px; border-radius:9px; font-family:inherit; }

        /* ── Žurnalo tinklelis ── */
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

        /* ── Sekti širdutė (ant viršelio) ── */
        .sr-heart { position:absolute; top:8px; right:8px; width:36px; height:36px; border-radius:50%; cursor:pointer; font-family:inherit;
          border:none; background:rgba(0,0,0,0.45); backdrop-filter:blur(4px); color:#fff;
          display:inline-flex; align-items:center; justify-content:center; transition:color .14s, background .14s; -webkit-tap-highlight-color:transparent; z-index:2; }
        .sr-heart svg { width:18px; height:18px; }
        .sr-heart:hover { background:rgba(0,0,0,0.6); }
        .sr-heart:disabled { opacity:.7; }
        .sr-heart.done { color:#f5466b; background:rgba(255,255,255,0.92); }

        /* ── Pagalbiniai ── */
        .sr-more { margin:26px auto 0; display:block; border:1px solid var(--border-default);
          background:var(--bg-elevated); color:var(--text-secondary); font-weight:700; font-size:14px; padding:11px 30px; border-radius:10px; cursor:pointer; font-family:inherit; }
        .sr-more:hover { border-color:var(--accent-orange); color:var(--text-primary); }
        .sr-end { text-align:center; padding:28px 0 4px; font-size:12.5px; color:var(--text-faint); }
        .sr-empty { text-align:center; padding:56px 16px; color:var(--text-muted); }
        .sr-loading { display:flex; justify-content:center; padding:64px 0; }

        @media (max-width:680px) {
          .sr-wrap { padding:12px 12px 32px; }
          .sr-grid { grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:11px; }
          .sr-body { padding:9px 10px 11px; gap:3px; }
          .sr-title { font-size:13px; }
          .sr-badge { font-size:9.5px; padding:3px 7px; }
          .srf-bar { padding:9px 10px; gap:6px; }
          .srf-count { width:100%; margin-left:0; order:9; text-align:right; }
        }
      `}</style>

      {/* Filtrų juosta: režimas + turinio tipas */}
      <div className="srf-bar">
        <span className="srf-lbl">Rodyti</span>
        <button type="button" className={`srf-chip srf-mode${mode === 'sekami' ? ' on' : ''}`} onClick={() => switchMode('sekami')}>❤️ Mėgstami</button>
        <button type="button" className={`srf-chip srf-mode${mode === 'tau' ? ' on' : ''}`} onClick={() => switchMode('tau')}>✦ Atradimai</button>
        <span className="srf-divider" />
        <span className="srf-lbl">Tipas</span>
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
          {mode === 'sekami' && nextBefore && type === 'all'
            ? <button className="sr-more" onClick={moreFeed} disabled={loadingMore}>{loadingMore ? 'Kraunama…' : 'Rodyti daugiau'}</button>
            : mode === 'sekami' && nextBefore
              ? <button className="sr-more" onClick={moreFeed} disabled={loadingMore}>{loadingMore ? 'Kraunama…' : 'Užkrauti daugiau įrašų'}</button>
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
