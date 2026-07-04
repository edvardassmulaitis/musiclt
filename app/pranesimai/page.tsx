'use client'

/**
 * /pranesimai — pranešimų puslapis su 2 tabais (kaip desktop NotificationsBell):
 *   - Asmeniniai (/api/notifications) — like'ai, komentarai, atsakymai tau
 *   - Kas vyksta (/api/live/activity) — bendruomenės aktyvumo srautas
 * In-app puslapis (apatinis baras lieka, kaip /srautas). Įkrovus „Asmeniniai"
 * pažymi viską skaitytais.
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useSession, signIn } from 'next-auth/react'
import { proxyImg } from '@/lib/img-proxy'
import { formatActivityEvent } from '@/lib/activity-logger'

type Tab = 'personal' | 'activity'

type Notif = {
  id: number; type: string
  actor_username: string | null; actor_full_name: string | null; actor_avatar_url: string | null
  url: string | null; title: string | null; snippet: string | null
  read_at: string | null; created_at: string
}
type Activity = {
  id: number; event_type: string; actor_name: string | null; actor_avatar: string | null
  entity_title: string | null; entity_url: string | null; entity_image?: string | null
  metadata: any; created_at: string
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

function Avatar({ url, name }: { url?: string | null; name?: string | null }) {
  const initial = (name || '?').trim()[0]?.toUpperCase() || '?'
  return (
    <div className="pr-av">
      {url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={proxyImg(url)} alt="" loading="lazy" />
        : <span>{initial}</span>}
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="pr-list">{children}</div>
}

export default function PranesimaiPage() {
  const { data: session } = useSession()
  const [tab, setTab] = useState<Tab>('personal')
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [activity, setActivity] = useState<Activity[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(true)
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [activityLoaded, setActivityLoaded] = useState(false)

  const loadPersonal = useCallback(async () => {
    setLoading(true)
    try {
      const d = await fetch('/api/notifications?limit=40', { cache: 'no-store' }).then(r => r.ok ? r.json() : null)
      if (!d) return
      setNotifs(d.notifications || [])
      setUnread(d.unread_count || 0)
      setAuthed(!!d.authenticated)
      if (d.authenticated && (d.unread_count || 0) > 0) {
        fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) }).catch(() => {})
        setUnread(0)
      }
    } finally { setLoading(false) }
  }, [])

  const loadActivity = useCallback(async () => {
    setLoading(true)
    try {
      const d = await fetch('/api/live/activity?limit=40', { cache: 'no-store' }).then(r => r.ok ? r.json() : null)
      setActivity((d?.events || d?.activity || []) as Activity[])
      setActivityLoaded(true)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadPersonal() }, [loadPersonal, session?.user])
  useEffect(() => { if (tab === 'activity' && !activityLoaded) loadActivity() }, [tab, activityLoaded, loadActivity])

  return (
    <div className="pr-wrap">
      <style>{`
        .pr-wrap { max-width: 720px; margin: 0 auto; padding: 0 0 32px; }
        .pr-top { position: sticky; top: 56px; z-index: 5; background: var(--bg-body); padding: 18px 16px 0; }
        .pr-h { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
        .pr-h svg { width: 22px; height: 22px; color: var(--accent-orange); }
        .pr-h h1 { font-size: 24px; font-weight: 900; letter-spacing: -0.02em; color: var(--text-primary); margin: 0; }
        .pr-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border-subtle); }
        .pr-tab { flex: 1; padding: 11px 8px; border: none; background: transparent; cursor: pointer;
          font-family: inherit; font-size: 14px; font-weight: 700; color: var(--text-muted);
          border-bottom: 2px solid transparent; display: inline-flex; align-items: center; justify-content: center; gap: 7px; }
        .pr-tab.active { color: var(--text-primary); border-bottom-color: var(--accent-orange); }
        .pr-tab-badge { min-width: 17px; height: 17px; padding: 0 5px; border-radius: 9px; background: var(--accent-orange);
          color: #fff; font-size: 12px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; }
        .pr-list { display: flex; flex-direction: column; gap: 8px; padding: 14px 16px 0; }
        .pr-row { display: flex; gap: 12px; align-items: center; text-decoration: none;
          background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: 13px; padding: 11px 13px; transition: border-color .14s; }
        .pr-row:hover { border-color: var(--border-strong); }
        .pr-row.unread { background: var(--bg-active); }
        .pr-av { flex-shrink: 0; width: 42px; height: 42px; border-radius: 50%; overflow: hidden;
          background: var(--bg-surface); display: flex; align-items: center; justify-content: center; }
        .pr-av img { width: 100%; height: 100%; object-fit: cover; }
        .pr-av span { font-size: 16px; font-weight: 800; color: var(--text-faint); }
        .pr-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
        .pr-title { font-size: 14px; font-weight: 600; color: var(--text-primary); line-height: 1.3; }
        .pr-snippet { font-size: 14px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .pr-time { font-size: 12px; color: var(--text-faint); margin-top: 1px; }
        .pr-dot { flex-shrink: 0; width: 9px; height: 9px; border-radius: 50%; background: var(--accent-orange); }
        .pr-empty, .pr-cta { text-align: center; padding: 44px 16px; color: var(--text-muted); }
        .pr-cta button { margin-top: 12px; border: none; cursor: pointer; background: var(--accent-orange);
          color: #fff; font-weight: 700; font-size: 14px; padding: 10px 22px; border-radius: 10px; font-family: inherit; }
        .pr-skel { height: 64px; border-radius: 13px; background: var(--bg-elevated); border: 1px solid var(--border-subtle); animation: prp 1.3s ease-in-out infinite; }
        @keyframes prp { 0%,100% { opacity: .5 } 50% { opacity: 1 } }
      `}</style>

      <div className="pr-top">
        <div className="pr-h">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
          <h1>Pranešimai</h1>
        </div>
        <div className="pr-tabs">
          <button className={`pr-tab${tab === 'personal' ? ' active' : ''}`} onClick={() => setTab('personal')}>
            Asmeniniai{unread > 0 && <span className="pr-tab-badge">{unread > 99 ? '99+' : unread}</span>}
          </button>
          <button className={`pr-tab${tab === 'activity' ? ' active' : ''}`} onClick={() => setTab('activity')}>
            Kas vyksta
          </button>
        </div>
      </div>

      {tab === 'personal' ? (
        loading && notifs.length === 0 ? (
          <Shell>{Array.from({ length: 6 }).map((_, i) => <div key={i} className="pr-skel" />)}</Shell>
        ) : authed === false ? (
          <div className="pr-cta">Prisijunk, kad matytum savo pranešimus.<div><button onClick={() => signIn()}>Prisijungti</button></div></div>
        ) : notifs.length === 0 ? (
          <div className="pr-empty">Naujų pranešimų nėra.</div>
        ) : (
          <Shell>
            {notifs.map(n => {
              const inner = (
                <>
                  <Avatar url={n.actor_avatar_url} name={n.actor_full_name || n.actor_username} />
                  <div className="pr-body">
                    <span className="pr-title">{n.title || 'Pranešimas'}</span>
                    {n.snippet && <span className="pr-snippet">{n.snippet}</span>}
                    <span className="pr-time">{timeAgo(n.created_at)}</span>
                  </div>
                  {!n.read_at && <span className="pr-dot" aria-hidden="true" />}
                </>
              )
              return n.url
                ? <Link key={n.id} href={n.url} className={`pr-row${n.read_at ? '' : ' unread'}`}>{inner}</Link>
                : <div key={n.id} className={`pr-row${n.read_at ? '' : ' unread'}`}>{inner}</div>
            })}
          </Shell>
        )
      ) : (
        loading && activity.length === 0 ? (
          <Shell>{Array.from({ length: 6 }).map((_, i) => <div key={i} className="pr-skel" />)}</Shell>
        ) : activity.length === 0 ? (
          <div className="pr-empty">Kol kas tylu.</div>
        ) : (
          <Shell>
            {activity.map(ev => {
              const { text, url } = formatActivityEvent(ev)
              const inner = (
                <>
                  <Avatar url={ev.entity_image || ev.actor_avatar} name={ev.actor_name} />
                  <div className="pr-body">
                    <span className="pr-title">{text}</span>
                    <span className="pr-time">{timeAgo(ev.created_at)}</span>
                  </div>
                </>
              )
              return url
                ? <Link key={ev.id} href={url} className="pr-row">{inner}</Link>
                : <div key={ev.id} className="pr-row">{inner}</div>
            })}
          </Shell>
        )
      )}
    </div>
  )
}
