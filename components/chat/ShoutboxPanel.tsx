'use client'

/**
 * ShoutboxPanel — bendra viešo web'o pokalbių dėžutė (visi nariai mato tą patį).
 * Naudojama kaip 3-čias tab'as ConversationSidebar'e. Backend: /api/live/shoutbox.
 *
 * „Priminti" toggle: užsiprenumeruoja naršyklės pranešimus — kol svetainė atidaryta
 * ir vartotojas užsiprenumeravęs, gavus naują kito nario žinutę parodoma sistemos
 * notifikacija. (Pilnas offline push — atskira backend užduotis.)
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { proxyImg } from '@/lib/img-proxy'

type Shout = {
  id: number | string
  user_id: string | null
  author_name: string | null
  author_avatar: string | null
  body: string
  created_at: string
}

const SUB_KEY = 'shoutbox:subscribe'

function timeShort(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' })
}

export function ShoutboxPanel({ viewerId }: { viewerId: string }) {
  const [items, setItems] = useState<Shout[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [subscribed, setSubscribed] = useState(false)
  const lastSeenId = useRef<string | number | null>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const firstLoad = useRef(true)

  useEffect(() => {
    try { setSubscribed(localStorage.getItem(SUB_KEY) === '1') } catch {}
  }, [])

  const load = useCallback(async () => {
    try {
      const d = await fetch('/api/live/shoutbox?limit=80', { cache: 'no-store' }).then(r => r.ok ? r.json() : null)
      if (!d) return
      const msgs: Shout[] = (d.messages || []).slice().reverse() // seniausi viršuje
      setItems(prev => {
        // Notifikacija apie naujas kitų narių žinutes (jei užsiprenumeravęs).
        if (!firstLoad.current && subscribed && msgs.length) {
          const newest = msgs[msgs.length - 1]
          if (newest && newest.id !== lastSeenId.current && newest.user_id !== viewerId) {
            try {
              if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                new Notification(`${newest.author_name || 'Naujas pranešimas'} · Bendra dėžutė`, { body: newest.body?.slice(0, 120) })
              }
            } catch {}
          }
        }
        if (msgs.length) lastSeenId.current = msgs[msgs.length - 1].id
        return msgs
      })
    } finally {
      setLoading(false)
    }
  }, [subscribed, viewerId])

  useEffect(() => {
    load()
    const t = setInterval(load, 12000)
    return () => clearInterval(t)
  }, [load])

  // Auto-scroll į apačią pirmo įkrovimo metu / kai pridedam savo žinutę.
  useEffect(() => {
    if (!items.length) return
    const el = scrollerRef.current
    if (el && firstLoad.current) { el.scrollTop = el.scrollHeight; firstLoad.current = false }
  }, [items])

  const send = async () => {
    const t = text.trim()
    if (!t || sending) return
    setSending(true)
    try {
      const r = await fetch('/api/live/shoutbox', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t }) })
      if (r.ok) {
        setText('')
        await load()
        const el = scrollerRef.current
        if (el) el.scrollTop = el.scrollHeight
      }
    } finally { setSending(false) }
  }

  const toggleSubscribe = async () => {
    const next = !subscribed
    if (next && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try { await Notification.requestPermission() } catch {}
    }
    setSubscribed(next)
    try { localStorage.setItem(SUB_KEY, next ? '1' : '0') } catch {}
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Subscribe juosta */}
      <div style={{
        flexShrink: 0, padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ flex: 1, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.35 }}>
          Bendra visų narių pokalbių dėžutė.
        </div>
        <button
          onClick={toggleSubscribe}
          style={{
            flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 11px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 13, fontWeight: 700,
            border: '1px solid ' + (subscribed ? 'var(--accent-orange)' : 'var(--border-default)'),
            background: subscribed ? 'var(--accent-orange)' : 'transparent',
            color: subscribed ? '#fff' : 'var(--text-secondary)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill={subscribed ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
          {subscribed ? 'Primenama' : 'Priminti'}
        </button>
      </div>

      {/* Žinutės */}
      <div ref={scrollerRef} style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', minHeight: 0 }}>
        {loading && items.length === 0 ? (
          <div style={{ padding: 24, fontSize: 14, color: 'var(--text-muted)', textAlign: 'center' }}>Kraunasi…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: '36px 16px', textAlign: 'center', fontSize: 14, color: 'var(--text-muted)' }}>Dar nieko nėra. Parašyk pirmas!</div>
        ) : items.map(m => (
          <div key={m.id} style={{ display: 'flex', gap: 9, padding: '6px 4px', alignItems: 'flex-start' }}>
            <div style={{ flexShrink: 0, width: 30, height: 30, borderRadius: '50%', overflow: 'hidden', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {m.author_avatar
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={proxyImg(m.author_avatar)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-faint)' }}>{(m.author_name || '?')[0]?.toUpperCase()}</span>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>{m.author_name || 'Narys'}</span>
                <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{timeShort(m.created_at)}</span>
              </div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', wordBreak: 'break-word', lineHeight: 1.4 }}>{m.body}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Composer */}
      <div style={{ flexShrink: 0, padding: '10px 12px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 8 }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send() }}
          maxLength={255}
          placeholder="Parašyk visiems…"
          style={{
            flex: 1, height: 38, padding: '0 12px', fontSize: 16,
            color: 'var(--text-primary)', background: 'var(--input-bg, var(--bg-elevated))',
            border: '1px solid var(--input-border, var(--border-default))', borderRadius: 8, outline: 'none',
          }}
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          style={{
            flexShrink: 0, width: 42, borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'var(--accent-orange)', color: '#fff', fontSize: 16, fontWeight: 800,
            opacity: (sending || !text.trim()) ? 0.4 : 1,
          }}
        >→</button>
      </div>
    </div>
  )
}
