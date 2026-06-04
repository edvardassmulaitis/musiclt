'use client'

/**
 * /srautas — ❤️ asmeninė muzikos zona. Du segmentai:
 *
 *   • Sekami — turinys iš JAU pamėgtų atlikėjų (/api/srautas/feed).
 *   • Tau    — atradimų rekomendacijos (/api/srautas/recommendations):
 *              rekomenduojami atlikėjai (su „Sekti"), jų leidiniai, koncertai,
 *              temos. Vienas supintas feed'as, ne dashboard blokai.
 *
 * Tab'as išsaugomas ?t= query param'e + localStorage'e. Be-cover'io kortelė →
 * gradientas + inicialas.
 */

import { useEffect, useState, useCallback, Suspense, type MouseEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession, signIn } from 'next-auth/react'
import { proxyImg } from '@/lib/img-proxy'
import { SegTabs } from '@/components/ui/SegTabs'

type Kind = 'news' | 'blog' | 'track' | 'album' | 'artist' | 'event' | 'topic'

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

/** Bendra horizontali kortelė — naujienoms, įrašams, leidiniams, koncertams, temoms. */
function RowCard({ it }: { it: FeedItem }) {
  const initial = (it.title || '?').trim()[0]?.toUpperCase() || '?'
  const when = it.kind === 'event' ? eventWhen(it.date) : timeAgo(it.date)
  return (
    <Link href={it.href} className="sr-card">
      <div className="sr-thumb">
        {it.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxyImg(it.image)} alt="" loading="lazy" />
        ) : (
          <span className="sr-thumb-ph">{initial}</span>
        )}
      </div>
      <div className="sr-body">
        <span className="sr-badge" style={{ color: BADGE_COLOR[it.kind] }}>
          <span className="sr-dot" style={{ background: BADGE_COLOR[it.kind] }} />
          {it.badge}
          {it.kind === 'blog' && it.meta?.rating ? ` · ${it.meta.rating}/10` : ''}
        </span>
        <span className="sr-title">{it.title}</span>
        {it.subtitle && <span className="sr-sub">{it.subtitle}</span>}
        {when && <span className="sr-time">{when}</span>}
      </div>
    </Link>
  )
}

/** Atlikėjo rekomendacijos kortelė su „Sekti" mygtuku (tik Tau). */
function ArtistCard({ it }: { it: FeedItem }) {
  const [following, setFollowing] = useState(false)
  const [busy, setBusy] = useState(false)
  const initial = (it.title || '?').trim()[0]?.toUpperCase() || '?'

  const follow = async (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (busy || following || !it.artist) return
    setBusy(true)
    setFollowing(true) // optimistic
    try {
      const res = await fetch(`/api/artists/${it.artist.id}/like`, { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (data && typeof data.liked === 'boolean') setFollowing(data.liked)
    } catch {
      setFollowing(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sr-acard">
      <Link href={it.href} className="sr-acover">
        {it.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxyImg(it.image)} alt="" loading="lazy" />
        ) : (
          <span className="sr-thumb-ph">{initial}</span>
        )}
      </Link>
      <div className="sr-abody">
        <span className="sr-badge" style={{ color: BADGE_COLOR.artist }}>
          <span className="sr-dot" style={{ background: BADGE_COLOR.artist }} />
          {it.badge}
        </span>
        <Link href={it.href} className="sr-atitle">{it.title}</Link>
        {it.subtitle && <span className="sr-sub">{it.subtitle}</span>}
      </div>
      <button
        type="button"
        className={`sr-follow${following ? ' done' : ''}`}
        onClick={follow}
        disabled={busy}
        aria-label={following ? 'Seki' : 'Sekti atlikėją'}
      >
        {following ? (
          <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>Seki</>
        ) : (
          <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>Sekti</>
        )}
      </button>
    </div>
  )
}

function SrautasInner() {
  const { data: session } = useSession()
  const router = useRouter()
  const params = useSearchParams()

  const initialTab = (params.get('t') === 'tau' ? 'tau' : params.get('t') === 'sekami' ? 'sekami' : null)
  const [tab, setTab] = useState<'sekami' | 'tau'>(initialTab || 'sekami')

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

  // atstatom paskutinį tab'ą iš localStorage (jei nėra ?t=)
  useEffect(() => {
    if (initialTab) return
    try {
      const saved = localStorage.getItem('srautas_tab')
      if (saved === 'tau' || saved === 'sekami') setTab(saved)
    } catch { /* ignore */ }
  }, [initialTab])

  const switchTab = (t: 'sekami' | 'tau') => {
    setTab(t)
    try { localStorage.setItem('srautas_tab', t) } catch { /* ignore */ }
    const sp = new URLSearchParams(Array.from(params.entries()))
    sp.set('t', t)
    router.replace(`/srautas?${sp.toString()}`, { scroll: false })
  }

  // ── Sekami feed ──
  const loadFeed = useCallback(async (before?: string | null) => {
    const url = `/api/srautas/feed?limit=24${before ? `&before=${encodeURIComponent(before)}` : ''}`
    const res = await fetch(url)
    return (await res.json()) as { items: FeedItem[]; personalized: boolean; nextBefore: string | null }
  }, [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    loadFeed().then(d => {
      if (!alive) return
      setItems(d.items || [])
      setPersonalized(!!d.personalized)
      setNextBefore(d.nextBefore || null)
      setLoading(false)
    }).catch(() => alive && setLoading(false))
    return () => { alive = false }
  }, [loadFeed, session?.user])

  const moreFeed = async () => {
    if (!nextBefore || loadingMore) return
    setLoadingMore(true)
    try {
      const d = await loadFeed(nextBefore)
      setItems(prev => [...prev, ...(d.items || [])])
      setNextBefore(d.nextBefore || null)
    } finally { setLoadingMore(false) }
  }

  // ── Tau feed (lazy — tik kai atidaromas) + sessionStorage cache ──
  // Rekomendacijos brangios (RPC + enrichment), tad per sesiją cache'inam
  // klientiškai — perjungus tab'us pirmyn/atgal feed'as atsiranda iškart.
  useEffect(() => {
    if (tab !== 'tau' || recLoaded) return
    let alive = true
    const uid = (session?.user as any)?.id || 'anon'
    const cacheKey = `srautas_tau_${uid}`
    const TTL = 5 * 60 * 1000

    // 1) Bandom cache'ą
    try {
      const raw = sessionStorage.getItem(cacheKey)
      if (raw) {
        const c = JSON.parse(raw)
        if (c && Date.now() - c.ts < TTL && Array.isArray(c.items)) {
          setRecs(c.items)
          setRecPersonalized(!!c.personalized)
          setRecLoaded(true)
          return
        }
      }
    } catch { /* ignore */ }

    // 2) Fetch + store
    setRecLoading(true)
    fetch('/api/srautas/recommendations?limit=45')
      .then(r => r.json())
      .then(d => {
        if (!alive) return
        setRecs(d.items || [])
        setRecPersonalized(!!d.personalized)
        setRecLoaded(true)
        setRecLoading(false)
        try { sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), items: d.items || [], personalized: !!d.personalized })) } catch { /* ignore */ }
      })
      .catch(() => { if (alive) { setRecLoading(false); setRecLoaded(true) } })
    return () => { alive = false }
  }, [tab, recLoaded, session?.user])

  return (
    <div className="sr-wrap">
      <style>{`
        .sr-wrap { max-width: 720px; margin: 0 auto; padding: 22px 16px 64px; }
        .sr-h { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
        .sr-h svg { width: 24px; height: 24px; color: var(--accent-orange); }
        .sr-h h1 { font-size: 26px; font-weight: 900; letter-spacing: -0.02em; color: var(--text-primary); margin: 0; }
        /* Segmentai (bendras SegTabs komponentas) */
        .sr-segtabs { margin-bottom: 18px; }
        .sr-lead { font-size: 13.5px; color: var(--text-muted); margin: 2px 0 16px; }
        .sr-cta { display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
          background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: 14px;
          padding: 14px 16px; margin-bottom: 18px; font-size: 14px; color: var(--text-secondary); }
        .sr-cta a, .sr-cta button { margin-left: auto; text-decoration: none; border: none; cursor: pointer;
          background: var(--accent-orange); color: #fff; font-weight: 700; font-size: 13px; padding: 8px 16px; border-radius: 9px; font-family: inherit; }
        .sr-list { display: flex; flex-direction: column; gap: 10px; }
        .sr-card { display: flex; gap: 14px; align-items: stretch; text-decoration: none;
          background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: 14px; padding: 10px; transition: border-color .14s, transform .1s; }
        .sr-card:hover { border-color: var(--border-strong); }
        .sr-card:active { transform: scale(.995); }
        .sr-thumb { flex-shrink: 0; width: 104px; height: 78px; border-radius: 10px; overflow: hidden;
          background: linear-gradient(135deg, var(--bg-active), var(--bg-surface)); display: flex; align-items: center; justify-content: center; }
        .sr-thumb img { width: 100%; height: 100%; object-fit: cover; }
        .sr-thumb-ph { font-size: 30px; font-weight: 900; color: var(--text-faint); }
        .sr-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; padding: 2px 4px 2px 0; justify-content: center; }
        .sr-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 800; letter-spacing: 0.02em; text-transform: uppercase; }
        .sr-dot { width: 6px; height: 6px; border-radius: 50%; }
        .sr-title { font-size: 15px; font-weight: 700; color: var(--text-primary); line-height: 1.25; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .sr-sub { font-size: 13px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sr-time { font-size: 12px; color: var(--text-faint); margin-top: 1px; }
        /* Atlikėjo kortelė (Tau) */
        .sr-acard { display: flex; gap: 14px; align-items: center;
          background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: 14px; padding: 10px; }
        .sr-acover { flex-shrink: 0; width: 72px; height: 72px; border-radius: 12px; overflow: hidden; text-decoration: none;
          background: linear-gradient(135deg, var(--bg-active), var(--bg-surface)); display: flex; align-items: center; justify-content: center; }
        .sr-acover img { width: 100%; height: 100%; object-fit: cover; }
        .sr-abody { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
        .sr-atitle { font-size: 16px; font-weight: 800; color: var(--text-primary); text-decoration: none; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sr-atitle:hover { color: var(--accent-orange); }
        .sr-follow { flex-shrink: 0; display: inline-flex; align-items: center; gap: 5px; cursor: pointer; font-family: inherit;
          border: 1px solid var(--accent-orange); background: var(--accent-orange); color: #fff; font-weight: 800; font-size: 13px;
          padding: 8px 14px; border-radius: 10px; transition: background .14s, color .14s, opacity .14s; -webkit-tap-highlight-color: transparent; }
        .sr-follow svg { width: 15px; height: 15px; }
        .sr-follow:disabled { opacity: .7; }
        .sr-follow.done { background: transparent; color: var(--accent-green); border-color: var(--accent-green); }
        .sr-more { margin: 20px auto 0; display: block; border: 1px solid var(--border-default);
          background: var(--bg-elevated); color: var(--text-secondary); font-weight: 700; font-size: 14px; padding: 11px 28px; border-radius: 10px; cursor: pointer; font-family: inherit; }
        .sr-more:hover { border-color: var(--accent-orange); color: var(--text-primary); }
        .sr-empty { text-align: center; padding: 48px 16px; color: var(--text-muted); }
        .sr-skel { height: 100px; border-radius: 14px; background: var(--bg-elevated); border: 1px solid var(--border-subtle); animation: srpulse 1.3s ease-in-out infinite; }
        @keyframes srpulse { 0%,100% { opacity: .5 } 50% { opacity: 1 } }
      `}</style>

      <div className="sr-h">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" /></svg>
        <h1>Mano muzika</h1>
      </div>

      <SegTabs
        className="sr-segtabs"
        items={[{ key: 'sekami', label: 'Sekami' }, { key: 'tau', label: 'Tau' }]}
        value={tab}
        onChange={k => switchTab(k as 'sekami' | 'tau')}
      />

      {tab === 'sekami' ? (
        <>
          <p className="sr-lead">
            {personalized === false
              ? 'Naujausias turinys iš bendruomenės.'
              : 'Kas naujo tavo sekamų atlikėjų pasaulyje.'}
          </p>
          {personalized === false && (
            <div className="sr-cta">
              {session?.user
                ? <><span>Pamėk atlikėjų — ir srautas taps asmeniškas.</span><Link href="/muzika">Naršyti atlikėjus</Link></>
                : <><span>Prisijunk, kad srautas būtų pritaikytas tau.</span><button onClick={() => signIn()}>Prisijungti</button></>}
            </div>
          )}
          {loading ? (
            <div className="sr-list">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="sr-skel" />)}</div>
          ) : items.length === 0 ? (
            <div className="sr-empty">Kol kas tuščia. Pamėk atlikėjų arba užsuk vėliau.</div>
          ) : (
            <>
              <div className="sr-list">{items.map(it => <RowCard key={it.key} it={it} />)}</div>
              {nextBefore && (
                <button className="sr-more" onClick={moreFeed} disabled={loadingMore}>
                  {loadingMore ? 'Kraunama…' : 'Rodyti daugiau'}
                </button>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <p className="sr-lead">
            {recPersonalized === false
              ? 'Atlikėjai ir muzika, kuriuos verta atrasti.'
              : 'Atrask naujų atlikėjų pagal tai, ką jau mėgsti.'}
          </p>
          {recLoading && recs.length === 0 ? (
            <div className="sr-list">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="sr-skel" />)}</div>
          ) : recs.length === 0 ? (
            <div className="sr-empty">
              {session?.user
                ? 'Pamėk kelis atlikėjus — ir čia atsiras rekomendacijos.'
                : <>Prisijunk, kad gautum asmenines rekomendacijas. <button className="sr-more" onClick={() => signIn()}>Prisijungti</button></>}
            </div>
          ) : (
            <div className="sr-list">
              {recs.map(it => it.kind === 'artist'
                ? <ArtistCard key={it.key} it={it} />
                : <RowCard key={it.key} it={it} />)}
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
