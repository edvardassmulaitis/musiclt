'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

type ShoutMessage = {
  id: number; user_id: string; author_name: string
  author_avatar: string | null; body: string; created_at: string
}
type ActivityEvent = {
  id: number; event_type: string; user_id: string; actor_name: string
  actor_avatar: string | null; entity_type: string; entity_id: number
  entity_title: string; entity_url: string | null; metadata: any; created_at: string
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'ka tik'
  if (mins < 60) return mins + ' min.'
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return hrs + ' val.'
  return Math.floor(hrs / 24) + ' d.'
}

function Avatar({ name, src, size = 8 }: { name?: string | null; src?: string | null; size?: number }) {
  const initials = name ? name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() : '?'
  const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#10b981', '#06b6d4']
  const color = colors[(name?.charCodeAt(0) || 0) % colors.length]
  const px = size * 4
  if (src) return <img src={src} alt={name || ''} style={{ width: px, height: px, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 } as any} />
  return (
    <div style={{ width: px, height: px, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: px * 0.35, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
      {initials}
    </div>
  )
}

const ACTIVITY_ICONS: Record<string, string> = {
  nomination: '🎵', vote: '🗳️', comment: '💬', like: '❤️',
  new_artist: '🎤', new_album: '💿', new_track: '🎵',
  new_news: '📰', new_event: '📅', discussion_post: '📝', join: '👋',
}

function Shoutbox() {
  const { data: session } = useSession()
  const [messages, setMessages] = useState<ShoutMessage[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (since?: string) => {
    const url = since
      ? '/api/live/shoutbox?since=' + encodeURIComponent(since) + '&limit=20'
      : '/api/live/shoutbox?limit=60'
    const res = await fetch(url)
    const data = await res.json()
    if (data.messages?.length) {
      if (!since) {
        setMessages([...data.messages].reverse())
      } else {
        setMessages(prev => {
          const ids = new Set(prev.map((m: ShoutMessage) => m.id))
          const newMsgs = (data.messages as ShoutMessage[]).filter(m => !ids.has(m.id))
          return newMsgs.length ? [...prev, ...newMsgs] : prev
        })
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(() => {
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last) load(last.created_at)
        return prev
      })
    }, 5000)
    return () => clearInterval(interval)
  }, [load])

  useEffect(() => {
    if (!loading) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const send = async () => {
    if (!text.trim() || sending) return
    setSending(true); setError('')
    const res = await fetch('/api/live/shoutbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.trim() }),
    })
    const data = await res.json()
    if (res.ok) { setMessages(prev => [...prev, data.message]); setText('') }
    else { setError(data.error || 'Klaida'); setTimeout(() => setError(''), 4000) }
    setSending(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <div style={{ width: 20, height: 20, border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>Dar nera zinuciu. Buk pirmas!</div>
        ) : messages.map(msg => {
          const isMe = msg.user_id === session?.user?.id
          return (
            <div key={msg.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexDirection: isMe ? 'row-reverse' : 'row' }}>
              <Avatar name={msg.author_name} src={msg.author_avatar} size={7} />
              <div style={{ maxWidth: '75%' }}>
                {!isMe && <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', marginBottom: 3, paddingLeft: 4 }}>{msg.author_name}</p>}
                <div style={{ padding: '7px 12px', borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: isMe ? 'linear-gradient(135deg, #4f46e5, #7c3aed)' : 'rgba(255,255,255,0.07)', border: isMe ? 'none' : '1px solid rgba(255,255,255,0.08)', fontSize: 13, color: '#fff', lineHeight: 1.4, wordBreak: 'break-word' }}>
                  {msg.body}
                </div>
                <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 3, paddingLeft: 4, textAlign: isMe ? 'right' : 'left' }}>{timeAgo(msg.created_at)}</p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
      <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
        {error && <p style={{ fontSize: 11, color: '#f87171', marginBottom: 6 }}>{error}</p>}
        {session ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={text} onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Rašyk žinute..." maxLength={255}
              style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '8px 14px', color: '#fff', fontSize: 13, outline: 'none' }} />
            <button onClick={send} disabled={sending || !text.trim()}
              style={{ width: 36, height: 36, borderRadius: '50%', background: text.trim() ? 'linear-gradient(135deg, #4f46e5, #7c3aed)' : 'rgba(255,255,255,0.08)', border: 'none', cursor: text.trim() ? 'pointer' : 'not-allowed', color: '#fff', fontSize: 16, transition: 'all 0.2s', flexShrink: 0 }}>
              ↑
            </button>
          </div>
        ) : (
          <Link href="/auth/signin" style={{ display: 'block', textAlign: 'center', padding: '8px 16px', borderRadius: 20, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', fontSize: 12, textDecoration: 'none' }}>
            Prisijunk kad rašytum
          </Link>
        )}
      </div>
    </div>
  )
}

function ActivityFeed() {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)

  const loadActivity = useCallback(async () => {
    const res = await fetch('/api/live/activity?limit=40')
    const d = await res.json()
    setEvents(d.events || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadActivity()
    const interval = setInterval(loadActivity, 15000)
    return () => clearInterval(interval)
  }, [loadActivity])

  const getLabel = (e: ActivityEvent) => {
    const map: Record<string, string> = {
      nomination: 'pasiūlė „' + e.entity_title + '"',
      vote: 'balsavo už „' + e.entity_title + '"',
      comment: 'komentavo „' + e.entity_title + '"',
      like: 'pamego „' + e.entity_title + '"',
      new_artist: 'pridetas atlikejas „' + e.entity_title + '"',
      new_album: 'pridetas albumas „' + e.entity_title + '"',
      new_track: 'prideta daina „' + e.entity_title + '"',
      discussion_post: 'paskelbe diskusija „' + e.entity_title + '"',
      join: 'prisijunge prie music.lt',
    }
    return map[e.event_type] || e.event_type
  }

  return (
    <div style={{ overflowY: 'auto', height: '100%' }}>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <div style={{ width: 20, height: 20, border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : events.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>Dar nera aktyvumo.</div>
      ) : events.map(e => (
        <div key={e.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
            {ACTIVITY_ICONS[e.event_type] || '•'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', lineHeight: 1.4 }}>
              <span style={{ fontWeight: 700, color: '#fff' }}>{e.actor_name}</span>{' '}
              {e.entity_url
                ? <Link href={e.entity_url} style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none' }}>{getLabel(e)}</Link>
                : getLabel(e)}
            </p>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>{timeAgo(e.created_at)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function BendruomenePage() {
  const [tab, setTab] = useState<'shoutbox' | 'activity' | 'diskusijos'>('shoutbox')

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;600;700&display=swap');
        .bc-page { font-family: 'DM Sans', sans-serif; background: #080d14; min-height: 100vh; }
        .bc-tab { cursor: pointer; padding: 8px 18px; border-radius: 20px; font-size: 13px; font-weight: 700; border: none; background: transparent; transition: all 0.2s; color: rgba(255,255,255,0.4); }
        .bc-tab:hover { color: rgba(255,255,255,0.7); }
        .bc-tab.active { background: rgba(255,255,255,0.08); color: #fff; }
        .bc-panel { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 20px; overflow: hidden; }
        .bc-live { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 6px #22c55e; animation: blink 2s infinite; display: inline-block; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 720px) { .bc-grid { grid-template-columns: 1fr !important; } .bc-sidebar { display: none !important; } }
      `}</style>

      <div className="bc-page">
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '48px 24px' }}>

          <div style={{ marginBottom: 36 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div className="bc-live" />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Gyva</span>
            </div>
            <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 42, fontWeight: 800, color: '#fff', lineHeight: 1.1, marginBottom: 8 }}>
              Bendruomene
            </h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)' }}>
              Kalbékis su kitais muzikos megejais, sek aktyvuma ir dalinkis mintimis
            </p>
          </div>

          <div className="bc-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>

            <div className="bc-panel" style={{ height: 580, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', gap: 4, padding: '12px 12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, alignItems: 'center' }}>
                {([['shoutbox', '💬 Pokalbiai'], ['activity', '⚡ Aktyvumas'], ['diskusijos', '📝 Diskusijos']] as const).map(([k, l]) => (
                  <button key={k} className={'bc-tab' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}>{l}</button>
                ))}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, paddingRight: 8 }}>
                  <div className="bc-live" />
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>live</span>
                </div>
              </div>
              <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {tab === 'shoutbox' && <Shoutbox />}
                {tab === 'activity' && <ActivityFeed />}
                {tab === 'diskusijos' && (
                  <div style={{ padding: 40, textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>💬</div>
                    <h3 style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 8 }}>Diskusijų forumas</h3>
                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', marginBottom: 24, lineHeight: 1.6 }}>Aptark muzikos naujienas ir rask bendraminciu.</p>
                    <Link href="/diskusijos" style={{ display: 'inline-block', padding: '10px 24px', borderRadius: 20, background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                      Eiti i diskusijas →
                    </Link>
                  </div>
                )}
              </div>
            </div>

            <div className="bc-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="bc-panel" style={{ padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span>🎵</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(249,115,22,0.9)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Dienos daina</span>
                </div>
                <Link href="/dienos-daina" style={{ display: 'block', padding: '12px 14px', borderRadius: 12, background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.15)', textDecoration: 'none' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 3 }}>Balsuok šiandien</p>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Siulyk ir rinkis geriausia daina</p>
                </Link>
              </div>

              <div className="bc-panel" style={{ padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span>🏆</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(168,85,247,0.9)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Topai</span>
                </div>
                {[{ href: '/topas?tab=top40', label: 'TOP 40', desc: 'Pasaulio hitai' }, { href: '/topas?tab=lt_top30', label: 'LT TOP 30', desc: 'Lietuviška muzika' }].map(item => (
                  <Link key={item.href} href={item.href} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', textDecoration: 'none', marginBottom: 6 }}>
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{item.label}</p>
                      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{item.desc}</p>
                    </div>
                    <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>→</span>
                  </Link>
                ))}
              </div>

              <div className="bc-panel" style={{ padding: 18 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Prisijunk</p>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 12, lineHeight: 1.5 }}>Balsuok, komentuok ir dalinkis muzikos skoniu.</p>
                <Link href="/auth/signin" style={{ display: 'block', textAlign: 'center', padding: '9px', borderRadius: 10, background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: '#fff', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
                  Prisijungti
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
