'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

type ShoutMessage = {
  id: number; user_id: string; author_name: string
  author_avatar: string | null; body: string; created_at: string
}
type ActivityEvent = {
  id: number; event_type: string; actor_name: string
  entity_title: string; entity_url: string | null
  event_type_label?: string; created_at: string
}
type Discussion = {
  id: number; slug: string; title: string
  author_name: string | null; tags: string[]
  comment_count: number; last_comment_at: string | null; created_at: string
}

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return 'ką tik'
  if (m < 60) return m + ' min.'
  const h = Math.floor(m / 60)
  if (h < 24) return h + ' val.'
  return Math.floor(h / 24) + ' d.'
}

function Avatar({ name, src, size = 6 }: { name?: string | null; src?: string | null; size?: number }) {
  const px = size * 4
  const colors = ['#3b82f6','#8b5cf6','#ec4899','#f97316','#10b981','#06b6d4']
  const color = colors[(name?.charCodeAt(0) || 0) % colors.length]
  const initials = name ? name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() : '?'
  if (src) return <img src={src} alt="" style={{ width:px, height:px, borderRadius:'50%', objectFit:'cover', flexShrink:0 } as any} />
  return <div style={{ width:px, height:px, borderRadius:'50%', background:color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:px*0.38, fontWeight:700, color:'#fff', flexShrink:0 }}>{initials}</div>
}

const ACT_ICONS: Record<string,string> = {
  nomination:'🎵', vote:'🗳️', comment:'💬', like:'❤️',
  new_artist:'🎤', new_album:'💿', new_track:'🎵',
  new_news:'📰', new_event:'📅', discussion_post:'📝', join:'👋',
}

function actLabel(e: ActivityEvent) {
  const t = e.entity_title
  const m: Record<string,string> = {
    nomination: `pasiūlė „${t}"`, vote: `balsavo už „${t}"`,
    comment: `komentavo „${t}"`, like: `pamėgo „${t}"`,
    new_artist: `pridėtas „${t}"`, new_album: `albumas „${t}"`,
    new_track: `daina „${t}"`, discussion_post: `tema „${t}"`,
    join: 'prisijungė',
  }
  return m[(e as any).event_type] || (e as any).event_type
}

function Column({ title, icon, accent, href, hrefLabel, children }: any) {
  return (
    <div style={{ background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:20, display:'flex', flexDirection:'column', height:640, overflow:'hidden' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 15px', borderBottom:'1px solid rgba(255,255,255,0.06)', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ fontSize:13 }}>{icon}</span>
          <span style={{ fontSize:11, fontWeight:800, color:accent, textTransform:'uppercase', letterSpacing:'0.08em' }}>{title}</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {href && <Link href={href} style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.3)', textDecoration:'none', padding:'2px 8px', borderRadius:6, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)' }}>{hrefLabel}</Link>}
          <div style={{ width:6, height:6, borderRadius:'50%', background:'#22c55e', boxShadow:'0 0 5px #22c55e', animation:'bc-blink 2s infinite' }} />
        </div>
      </div>
      <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>{children}</div>
    </div>
  )
}

function Shoutbox() {
  const { data: session } = useSession()
  const [messages, setMessages] = useState<ShoutMessage[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (since?: string) => {
    const url = since ? '/api/live/shoutbox?since=' + encodeURIComponent(since) + '&limit=20' : '/api/live/shoutbox?limit=60'
    const res = await fetch(url)
    const data = await res.json()
    if (data.messages?.length) {
      if (!since) setMessages([...data.messages].reverse())
      else setMessages(prev => {
        const ids = new Set(prev.map(m => m.id))
        const n = data.messages.filter((m: ShoutMessage) => !ids.has(m.id))
        return n.length ? [...prev, ...n] : prev
      })
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const iv = setInterval(() => setMessages(prev => { const l = prev[prev.length-1]; if (l) load(l.created_at); return prev }), 5000)
    return () => clearInterval(iv)
  }, [load])

  const send = async () => {
    if (!text.trim() || sending) return
    setSending(true); setError('')
    const res = await fetch('/api/live/shoutbox', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text: text.trim() }) })
    const data = await res.json()
    if (res.ok) { setMessages(prev => [...prev, data.message]); setText('') }
    else { setError(data.error || 'Klaida'); setTimeout(() => setError(''), 4000) }
    setSending(false)
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <div style={{ flex:1, overflowY:'auto', padding:'10px 13px', display:'flex', flexDirection:'column', gap:7 }}>
        {loading ? <div style={{ display:'flex', justifyContent:'center', padding:32 }}><div style={{ width:18, height:18, border:'2px solid rgba(255,255,255,0.1)', borderTopColor:'#6366f1', borderRadius:'50%', animation:'bc-spin 0.8s linear infinite' }} /></div>
        : messages.length === 0 ? <div style={{ textAlign:'center', padding:'32px 0', color:'rgba(255,255,255,0.18)', fontSize:12 }}>Dar nėra žinučių.<br/>Būk pirmas!</div>
        : messages.map(msg => {
          const isMe = msg.user_id === session?.user?.id
          return (
            <div key={msg.id} style={{ display:'flex', gap:6, alignItems:'flex-end', flexDirection: isMe ? 'row-reverse' : 'row' }}>
              <Avatar name={msg.author_name} src={msg.author_avatar} size={6} />
              <div style={{ maxWidth:'78%' }}>
                {!isMe && <p style={{ fontSize:9, fontWeight:700, color:'rgba(255,255,255,0.3)', marginBottom:2, paddingLeft:4 }}>{msg.author_name}</p>}
                <div style={{ padding:'6px 11px', borderRadius: isMe ? '14px 14px 3px 14px' : '14px 14px 14px 3px', background: isMe ? 'linear-gradient(135deg,#4f46e5,#7c3aed)' : 'rgba(255,255,255,0.07)', border: isMe ? 'none' : '1px solid rgba(255,255,255,0.08)', fontSize:12, color:'#fff', lineHeight:1.45, wordBreak:'break-word' }}>{msg.body}</div>
                <p style={{ fontSize:9, color:'rgba(255,255,255,0.18)', marginTop:2, paddingLeft:4, textAlign: isMe ? 'right' : 'left' }}>{timeAgo(msg.created_at)}</p>
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ padding:'8px 12px', borderTop:'1px solid rgba(255,255,255,0.07)', flexShrink:0 }}>
        {error && <p style={{ fontSize:10, color:'#f87171', marginBottom:5 }}>{error}</p>}
        {session ? (
          <div style={{ display:'flex', gap:7, alignItems:'center' }}>
            <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); send() } }} placeholder="Rašyk žinutę..." maxLength={255} style={{ flex:1, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:18, padding:'7px 13px', color:'#fff', fontSize:12, outline:'none' }} />
            <button onClick={send} disabled={sending || !text.trim()} style={{ width:32, height:32, borderRadius:'50%', background: text.trim() ? 'linear-gradient(135deg,#4f46e5,#7c3aed)' : 'rgba(255,255,255,0.07)', border:'none', cursor: text.trim() ? 'pointer' : 'not-allowed', color:'#fff', fontSize:14, flexShrink:0, transition:'all 0.2s' }}>↑</button>
          </div>
        ) : (
          <Link href="/auth/signin" style={{ display:'block', textAlign:'center', padding:'7px', borderRadius:18, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.4)', fontSize:11, textDecoration:'none' }}>Prisijunk kad rašytum</Link>
        )}
      </div>
    </div>
  )
}

function ActivityFeed() {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    const r = await fetch('/api/live/activity?limit=50')
    const d = await r.json()
    setEvents(d.events || [])
    setLoading(false)
  }, [])
  useEffect(() => { load(); const iv = setInterval(load, 15000); return () => clearInterval(iv) }, [load])

  return (
    <div style={{ overflowY:'auto', height:'100%' }}>
      {loading ? <div style={{ display:'flex', justifyContent:'center', padding:32 }}><div style={{ width:18, height:18, border:'2px solid rgba(255,255,255,0.1)', borderTopColor:'#6366f1', borderRadius:'50%', animation:'bc-spin 0.8s linear infinite' }} /></div>
      : events.length === 0 ? <div style={{ textAlign:'center', padding:'32px 0', color:'rgba(255,255,255,0.18)', fontSize:12 }}>Dar nėra aktyvumo.</div>
      : events.map(e => (
        <div key={e.id} style={{ display:'flex', gap:9, alignItems:'flex-start', padding:'9px 14px', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ width:28, height:28, borderRadius:'50%', background:'rgba(255,255,255,0.05)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, flexShrink:0 }}>{ACT_ICONS[(e as any).event_type] || '•'}</div>
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ fontSize:11, color:'rgba(255,255,255,0.75)', lineHeight:1.4 }}>
              <span style={{ fontWeight:700, color:'#fff' }}>{e.actor_name}</span>{' '}
              {e.entity_url ? <Link href={e.entity_url} style={{ color:'rgba(255,255,255,0.55)', textDecoration:'none' }}>{actLabel(e)}</Link> : <span style={{ color:'rgba(255,255,255,0.45)' }}>{actLabel(e)}</span>}
            </p>
            <p style={{ fontSize:9, color:'rgba(255,255,255,0.2)', marginTop:1 }}>{timeAgo(e.created_at)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function DiscussionsList() {
  const [discussions, setDiscussions] = useState<Discussion[]>([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    const r = await fetch('/api/diskusijos?sort=activity&limit=20')
    const d = await r.json()
    setDiscussions(d.discussions || [])
    setLoading(false)
  }, [])
  useEffect(() => { load(); const iv = setInterval(load, 30000); return () => clearInterval(iv) }, [load])

  return (
    <div style={{ overflowY:'auto', height:'100%' }}>
      {loading ? <div style={{ display:'flex', justifyContent:'center', padding:32 }}><div style={{ width:18, height:18, border:'2px solid rgba(255,255,255,0.1)', borderTopColor:'#6366f1', borderRadius:'50%', animation:'bc-spin 0.8s linear infinite' }} /></div>
      : discussions.length === 0 ? (
        <div style={{ textAlign:'center', padding:'32px 14px', color:'rgba(255,255,255,0.18)', fontSize:12 }}>
          Dar nėra diskusijų.<br/>
          <Link href="/diskusijos" style={{ color:'#6366f1', textDecoration:'none', marginTop:8, display:'inline-block' }}>Sukurk pirmą →</Link>
        </div>
      ) : discussions.map(d => (
        <Link key={d.id} href={`/diskusijos/${d.slug}`} style={{ textDecoration:'none' }}>
          <div style={{ padding:'10px 14px', borderBottom:'1px solid rgba(255,255,255,0.04)', cursor:'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.background='rgba(255,255,255,0.03)')}
            onMouseLeave={e => (e.currentTarget.style.background='transparent')}>
            <div style={{ display:'flex', gap:3, marginBottom:4, flexWrap:'wrap' }}>
              {(d.tags||[]).slice(0,2).map(tag => <span key={tag} style={{ fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:4, background:'rgba(99,102,241,0.12)', color:'#a5b4fc' }}>{tag}</span>)}
            </div>
            <p style={{ fontSize:12, fontWeight:700, color:'#fff', lineHeight:1.35, marginBottom:3, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' } as any}>{d.title}</p>
            <div style={{ display:'flex', gap:7, alignItems:'center' }}>
              <span style={{ fontSize:9, color:'rgba(255,255,255,0.28)' }}>{d.author_name || 'Vartotojas'}</span>
              <span style={{ fontSize:9, color:'rgba(255,255,255,0.15)' }}>·</span>
              <span style={{ fontSize:9, color:'rgba(255,255,255,0.28)' }}>💬 {d.comment_count}</span>
              <span style={{ fontSize:9, color:'rgba(255,255,255,0.15)' }}>·</span>
              <span style={{ fontSize:9, color:'rgba(255,255,255,0.28)' }}>{timeAgo(d.last_comment_at || d.created_at)}</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}

export default function BendruomenePage() {
  const { data: session } = useSession()
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@800&family=DM+Sans:wght@400;600;700&display=swap');
        .bc-wrap { font-family:'DM Sans',sans-serif; background:#080d14; min-height:100vh; }
        @keyframes bc-spin { to { transform:rotate(360deg); } }
        @keyframes bc-blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @media (max-width:900px) { .bc-cols { grid-template-columns:1fr 1fr !important; } }
        @media (max-width:580px) { .bc-cols { grid-template-columns:1fr !important; } }
      `}</style>
      <div className="bc-wrap">
        <div style={{ maxWidth:1200, margin:'0 auto', padding:'40px 20px' }}>

          <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
            <div>
              <h1 style={{ fontFamily:'Syne,sans-serif', fontSize:34, fontWeight:800, color:'#fff', lineHeight:1, marginBottom:5 }}>Bendruomenė</h1>
              <p style={{ fontSize:12, color:'rgba(255,255,255,0.28)' }}>Pokalbiai · Aktyvumas · Diskusijos — viskas gyvai</p>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <Link href="/dienos-daina" style={{ fontSize:11, fontWeight:700, color:'rgba(249,115,22,0.9)', padding:'7px 14px', borderRadius:12, background:'rgba(249,115,22,0.08)', border:'1px solid rgba(249,115,22,0.15)', textDecoration:'none' }}>🎵 Dienos daina</Link>
              <Link href="/diskusijos" style={{ fontSize:11, fontWeight:700, color:'rgba(99,102,241,0.9)', padding:'7px 14px', borderRadius:12, background:'rgba(99,102,241,0.08)', border:'1px solid rgba(99,102,241,0.2)', textDecoration:'none' }}>+ Nauja diskusija</Link>
            </div>
          </div>

          <div className="bc-cols" style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14 }}>
            <Column title="Pokalbiai" icon="💬" accent="rgba(99,102,241,0.85)">
              <Shoutbox />
            </Column>
            <Column title="Aktyvumas" icon="⚡" accent="rgba(34,197,94,0.85)">
              <ActivityFeed />
            </Column>
            <Column title="Diskusijos" icon="📝" accent="rgba(168,85,247,0.85)" href="/diskusijos" hrefLabel="Visos →">
              <DiscussionsList />
            </Column>
          </div>

          {!session && (
            <div style={{ marginTop:16, padding:'13px 18px', borderRadius:14, background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.06)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
              <p style={{ fontSize:12, color:'rgba(255,255,255,0.35)' }}>Prisijunk kad galėtum rašyti, balsuoti ir komentuoti</p>
              <Link href="/auth/signin" style={{ fontSize:12, fontWeight:700, color:'#fff', padding:'7px 18px', borderRadius:10, background:'linear-gradient(135deg,#4f46e5,#7c3aed)', textDecoration:'none' }}>Prisijungti</Link>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
