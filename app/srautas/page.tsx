'use client'

/**
 * /srautas — asmeninis turinio srautas (favorites feed).
 * Traukia /api/srautas/feed (personalizuota pagal pamėgtus atlikėjus, su
 * trending fallback'u). Be cover'io kortelė → gradient + inicialas.
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useSession, signIn } from 'next-auth/react'
import { proxyImg } from '@/lib/img-proxy'

type FeedItem = {
  key: string
  kind: 'news' | 'blog' | 'track' | 'album'
  title: string
  subtitle: string | null
  image: string | null
  href: string
  date: string | null
  badge: string
  meta?: { post_type?: string; rating?: number | null; avatar?: string | null }
}

const BADGE_COLOR: Record<FeedItem['kind'], string> = {
  news: 'var(--accent-blue)',
  blog: '#8b5cf6',
  track: 'var(--accent-orange)',
  album: 'var(--accent-green)',
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

function Card({ it }: { it: FeedItem }) {
  const initial = (it.title || '?').trim()[0]?.toUpperCase() || '?'
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
        <span className="sr-time">{timeAgo(it.date)}</span>
      </div>
    </Link>
  )
}

export default function SrautasPage() {
  const { data: session } = useSession()
  const [items, setItems] = useState<FeedItem[]>([])
  const [personalized, setPersonalized] = useState<boolean | null>(null)
  const [nextBefore, setNextBefore] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const load = useCallback(async (before?: string | null) => {
    const url = `/api/srautas/feed?limit=24${before ? `&before=${encodeURIComponent(before)}` : ''}`
    const res = await fetch(url)
    const data = await res.json()
    return data as { items: FeedItem[]; personalized: boolean; nextBefore: string | null }
  }, [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    load().then(d => {
      if (!alive) return
      setItems(d.items || [])
      setPersonalized(!!d.personalized)
      setNextBefore(d.nextBefore || null)
      setLoading(false)
    }).catch(() => alive && setLoading(false))
    return () => { alive = false }
  }, [load, session?.user])

  const more = async () => {
    if (!nextBefore || loadingMore) return
    setLoadingMore(true)
    try {
      const d = await load(nextBefore)
      setItems(prev => [...prev, ...(d.items || [])])
      setNextBefore(d.nextBefore || null)
    } finally { setLoadingMore(false) }
  }

  return (
    <div className="sr-wrap">
      <style>{`
        .sr-wrap { max-width: 720px; margin: 0 auto; padding: 24px 16px 48px; }
        .sr-h { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
        .sr-h svg { width: 24px; height: 24px; color: var(--accent-orange); }
        .sr-h h1 { font-size: 26px; font-weight: 900; letter-spacing: -0.02em; color: var(--text-primary); margin: 0; }
        .sr-lead { font-size: 14px; color: var(--text-muted); margin: 0 0 18px; }
        .sr-cta {
          display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
          background: var(--bg-elevated); border: 1px solid var(--border-subtle);
          border-radius: 14px; padding: 14px 16px; margin-bottom: 18px;
          font-size: 14px; color: var(--text-secondary);
        }
        .sr-cta a, .sr-cta button {
          margin-left: auto; text-decoration: none; border: none; cursor: pointer;
          background: var(--accent-orange); color: #fff; font-weight: 700; font-size: 13px;
          padding: 8px 16px; border-radius: 9px; font-family: inherit;
        }
        .sr-list { display: flex; flex-direction: column; gap: 10px; }
        .sr-card {
          display: flex; gap: 14px; align-items: stretch; text-decoration: none;
          background: var(--bg-elevated); border: 1px solid var(--border-subtle);
          border-radius: 14px; padding: 10px; transition: border-color .14s, transform .1s;
        }
        .sr-card:hover { border-color: var(--border-strong); }
        .sr-card:active { transform: scale(.995); }
        .sr-thumb {
          flex-shrink: 0; width: 104px; height: 78px; border-radius: 10px; overflow: hidden;
          background: linear-gradient(135deg, var(--bg-active), var(--bg-surface));
          display: flex; align-items: center; justify-content: center;
        }
        .sr-thumb img { width: 100%; height: 100%; object-fit: cover; }
        .sr-thumb-ph { font-size: 30px; font-weight: 900; color: var(--text-faint); }
        .sr-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; padding: 2px 4px 2px 0; justify-content: center; }
        .sr-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 800; letter-spacing: 0.02em; text-transform: uppercase; }
        .sr-dot { width: 6px; height: 6px; border-radius: 50%; }
        .sr-title { font-size: 15px; font-weight: 700; color: var(--text-primary); line-height: 1.25; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .sr-sub { font-size: 13px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sr-time { font-size: 12px; color: var(--text-faint); margin-top: 1px; }
        .sr-more {
          margin: 20px auto 0; display: block; border: 1px solid var(--border-default);
          background: var(--bg-elevated); color: var(--text-secondary); font-weight: 700; font-size: 14px;
          padding: 11px 28px; border-radius: 10px; cursor: pointer; font-family: inherit;
        }
        .sr-more:hover { border-color: var(--accent-orange); color: var(--text-primary); }
        .sr-empty { text-align: center; padding: 48px 16px; color: var(--text-muted); }
        .sr-skel { height: 100px; border-radius: 14px; background: var(--bg-elevated); border: 1px solid var(--border-subtle); animation: srpulse 1.3s ease-in-out infinite; }
        @keyframes srpulse { 0%,100% { opacity: .5 } 50% { opacity: 1 } }
      `}</style>

      <div className="sr-h">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" /></svg>
        <h1>Tavo srautas</h1>
      </div>
      <p className="sr-lead">
        {personalized === false
          ? 'Naujausias turinys iš bendruomenės.'
          : 'Naujienos, įrašai ir leidiniai pagal tavo pamėgtus atlikėjus.'}
      </p>

      {personalized === false && (
        <div className="sr-cta">
          {session?.user
            ? <><span>Pamėk atlikėjų — ir srautas taps asmeniškas tau.</span><Link href="/muzika">Naršyti atlikėjus</Link></>
            : <><span>Prisijunk, kad srautas būtų pritaikytas tau.</span><button onClick={() => signIn()}>Prisijungti</button></>}
        </div>
      )}

      {loading ? (
        <div className="sr-list">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="sr-skel" />)}</div>
      ) : items.length === 0 ? (
        <div className="sr-empty">Kol kas tuščia. Pamėk atlikėjų arba užsuk vėliau.</div>
      ) : (
        <>
          <div className="sr-list">{items.map(it => <Card key={it.key} it={it} />)}</div>
          {nextBefore && (
            <button className="sr-more" onClick={more} disabled={loadingMore}>
              {loadingMore ? 'Kraunama…' : 'Rodyti daugiau'}
            </button>
          )}
        </>
      )}
    </div>
  )
}
