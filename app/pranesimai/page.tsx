'use client'

/**
 * /pranesimai — pranešimų puslapis (in-app, su apatiniu baru — kaip /srautas).
 * Pakeičia buvusį NotificationsBell dropdown'ą mobile'e (jis dengdavo barą).
 * Įkrovus pažymi visus kaip skaitytus (PATCH {all:true}).
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession, signIn } from 'next-auth/react'
import { proxyImg } from '@/lib/img-proxy'

type Notif = {
  id: number
  type: string
  actor_username: string | null
  actor_full_name: string | null
  actor_avatar_url: string | null
  url: string | null
  title: string | null
  snippet: string | null
  read_at: string | null
  created_at: string
}

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.now() - Date.parse(iso)
  if (!Number.isFinite(ms)) return ''
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'ką tik'
  if (m < 60) return `prieš ${m} min.`
  const h = Math.floor(m / 60)
  if (h < 24) return `prieš ${h} val.`
  const d = Math.floor(h / 24)
  if (d < 7) return `prieš ${d} d.`
  if (d < 30) return `prieš ${Math.floor(d / 7)} sav.`
  return `prieš ${Math.floor(d / 30)} mėn.`
}

function Row({ n }: { n: Notif }) {
  const name = n.actor_full_name || n.actor_username || ''
  const initial = (name || n.title || '?').trim()[0]?.toUpperCase() || '?'
  const inner = (
    <>
      <div className="pr-av">
        {n.actor_avatar_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={proxyImg(n.actor_avatar_url)} alt="" loading="lazy" />
          : <span>{initial}</span>}
      </div>
      <div className="pr-body">
        <span className="pr-title">{n.title || 'Pranešimas'}</span>
        {n.snippet && <span className="pr-snippet">{n.snippet}</span>}
        <span className="pr-time">{timeAgo(n.created_at)}</span>
      </div>
      {!n.read_at && <span className="pr-dot" aria-hidden="true" />}
    </>
  )
  return n.url
    ? <Link href={n.url} className={`pr-row${n.read_at ? '' : ' unread'}`}>{inner}</Link>
    : <div className={`pr-row${n.read_at ? '' : ' unread'}`}>{inner}</div>
}

export default function PranesimaiPage() {
  const { data: session } = useSession()
  const [items, setItems] = useState<Notif[]>([])
  const [loading, setLoading] = useState(true)
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch('/api/notifications?limit=40', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!alive || !d) { if (alive) setLoading(false); return }
        setItems(d.notifications || [])
        setAuthed(!!d.authenticated)
        setLoading(false)
        // Pažymim visus kaip skaitytus (badge dingsta).
        if (d.authenticated && (d.unread_count || 0) > 0) {
          fetch('/api/notifications', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ all: true }),
          }).catch(() => {})
        }
      })
      .catch(() => alive && setLoading(false))
    return () => { alive = false }
  }, [session?.user])

  return (
    <div className="pr-wrap">
      <style>{`
        .pr-wrap { max-width: 720px; margin: 0 auto; padding: 24px 16px 48px; }
        .pr-h { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
        .pr-h svg { width: 23px; height: 23px; color: var(--accent-orange); }
        .pr-h h1 { font-size: 26px; font-weight: 900; letter-spacing: -0.02em; color: var(--text-primary); margin: 0; }
        .pr-list { display: flex; flex-direction: column; gap: 8px; }
        .pr-row {
          display: flex; gap: 12px; align-items: center; text-decoration: none;
          background: var(--bg-elevated); border: 1px solid var(--border-subtle);
          border-radius: 13px; padding: 11px 13px; transition: border-color .14s;
        }
        .pr-row:hover { border-color: var(--border-strong); }
        .pr-row.unread { background: var(--bg-active); }
        .pr-av { flex-shrink: 0; width: 42px; height: 42px; border-radius: 50%; overflow: hidden;
          background: var(--bg-surface); display: flex; align-items: center; justify-content: center; }
        .pr-av img { width: 100%; height: 100%; object-fit: cover; }
        .pr-av span { font-size: 17px; font-weight: 800; color: var(--text-faint); }
        .pr-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
        .pr-title { font-size: 14.5px; font-weight: 600; color: var(--text-primary); line-height: 1.3; }
        .pr-snippet { font-size: 13px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .pr-time { font-size: 12px; color: var(--text-faint); margin-top: 1px; }
        .pr-dot { flex-shrink: 0; width: 9px; height: 9px; border-radius: 50%; background: var(--accent-orange); }
        .pr-empty, .pr-cta { text-align: center; padding: 44px 16px; color: var(--text-muted); }
        .pr-cta button { margin-top: 12px; border: none; cursor: pointer; background: var(--accent-orange);
          color: #fff; font-weight: 700; font-size: 14px; padding: 10px 22px; border-radius: 10px; font-family: inherit; }
        .pr-skel { height: 64px; border-radius: 13px; background: var(--bg-elevated); border: 1px solid var(--border-subtle); animation: prp 1.3s ease-in-out infinite; }
        @keyframes prp { 0%,100% { opacity: .5 } 50% { opacity: 1 } }
      `}</style>

      <div className="pr-h">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
        <h1>Pranešimai</h1>
      </div>

      {loading ? (
        <div className="pr-list">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="pr-skel" />)}</div>
      ) : authed === false ? (
        <div className="pr-cta">
          Prisijunk, kad matytum savo pranešimus.
          <div><button onClick={() => signIn()}>Prisijungti</button></div>
        </div>
      ) : items.length === 0 ? (
        <div className="pr-empty">Naujų pranešimų nėra.</div>
      ) : (
        <div className="pr-list">{items.map(n => <Row key={n.id} n={n} />)}</div>
      )}
    </div>
  )
}
