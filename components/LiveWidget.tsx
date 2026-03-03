'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { formatActivityEvent } from '@/lib/activity-logger'

type ShoutMessage = {
  id: number
  user_id: string
  author_name: string
  author_avatar: string | null
  body: string
  created_at: string
}

type ActivityEvent = {
  id: number
  event_type: string
  actor_name: string | null
  actor_avatar: string | null
  entity_title: string | null
  entity_url: string | null
  metadata: any
  created_at: string
}

function timeShort(dateStr: string): string {
  const d = new Date(dateStr)
  const diff = Date.now() - d.getTime()
  if (diff < 60000) return 'dabar'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
  return d.toLocaleDateString('lt-LT', { month: 'numeric', day: 'numeric' })
}

function Avatar({ name, src, size = 6 }: { name: string | null; src: string | null; size?: number }) {
  if (src) return <img src={src} alt={name || ''} className={`w-${size} h-${size} rounded-full object-cover flex-shrink-0`} />
  const initials = (name || '?').slice(0, 1).toUpperCase()
  return (
    <div className={`w-${size} h-${size} rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0`}
      style={{ background: 'rgba(29,78,216,0.25)', color: '#93c5fd' }}>
      {initials}
    </div>
  )
}

const EVENT_ICONS: Record<string, string> = {
  track_like: '❤️',
  album_like: '❤️',
  artist_like: '⭐',
  comment: '💬',
  daily_nomination: '🎵',
  top_vote: '🏆',
  news: '📰',
  event_created: '📅',
  blog_post: '✍️',
}

export default function LiveWidget() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'shout' | 'activity'>('shout')
  const [messages, setMessages] = useState<ShoutMessage[]>([])
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [newText, setNewText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [unread, setUnread] = useState(0)
  const [lastSeen, setLastSeen] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load data when first opened
  const loadShoutbox = useCallback(async () => {
    const res = await fetch('/api/live/shoutbox?limit=80')
    const data = await res.json()
    const msgs: ShoutMessage[] = (data.messages || []).reverse()
    setMessages(msgs)
    return msgs
  }, [])

  const loadActivity = useCallback(async () => {
    const res = await fetch('/api/live/activity?limit=50')
    const data = await res.json()
    setEvents(data.events || [])
  }, [])

  // Initial load
  useEffect(() => {
    if (open && !loaded) {
      Promise.all([loadShoutbox(), loadActivity()]).then(([msgs]) => {
        if (msgs.length > 0) setLastSeen(msgs[msgs.length - 1].created_at)
        setLoaded(true)
        setUnread(0)
      })
    }
  }, [open, loaded, loadShoutbox, loadActivity])

  // Polling — shoutbox kas 5s, activity kas 15s
  useEffect(() => {
    if (!open || !loaded) return

    const pollShout = setInterval(async () => {
      const res = await fetch('/api/live/shoutbox?limit=20')
      const data = await res.json()
      const newMsgs: ShoutMessage[] = (data.messages || []).reverse()
      if (newMsgs.length === 0) return

      setMessages(prev => {
        const existingIds = new Set(prev.map(m => m.id))
        const fresh = newMsgs.filter(m => !existingIds.has(m.id))
        if (fresh.length === 0) return prev
        if (tab !== 'shout') setUnread(u => u + fresh.length)
        return [...prev, ...fresh]
      })
    }, 5000)

    const pollActivity = setInterval(async () => {
      const res = await fetch('/api/live/activity?limit=50')
      const data = await res.json()
      setEvents(data.events || [])
    }, 15000)

    return () => {
      clearInterval(pollShout)
      clearInterval(pollActivity)
    }
  }, [open, loaded, tab])

  // Background polling for unread badge (when closed)
  useEffect(() => {
    if (open) return
    const poll = setInterval(async () => {
      const params = lastSeen ? `?since=${encodeURIComponent(lastSeen)}&limit=10` : '?limit=1'
      const res = await fetch(`/api/live/shoutbox${params}`)
      const data = await res.json()
      if (data.messages?.length > 0) setUnread(u => u + data.messages.length)
    }, 20000)
    return () => clearInterval(poll)
  }, [open, lastSeen])

  // Auto-scroll to bottom
  useEffect(() => {
    if (open && tab === 'shout') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, open, tab])

  // Focus input
  useEffect(() => {
    if (open && tab === 'shout') setTimeout(() => inputRef.current?.focus(), 100)
  }, [open, tab])

  const handleOpen = () => {
    setOpen(true)
    setUnread(0)
    if (messages.length > 0) setLastSeen(messages[messages.length - 1].created_at)
  }

  const handleSend = async () => {
    if (!newText.trim() || sending || cooldown > 0) return
    setSending(true)
    setSendError('')
    const res = await fetch('/api/live/shoutbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: newText.trim() }),
    })
    const data = await res.json()
    if (res.ok) {
      setMessages(prev => [...prev, data.message])
      setNewText('')
      // Start cooldown
      setCooldown(30)
      cooldownRef.current = setInterval(() => {
        setCooldown(prev => {
          if (prev <= 1) { clearInterval(cooldownRef.current!); return 0 }
          return prev - 1
        })
      }, 1000)
    } else {
      setSendError(data.error || 'Klaida')
      setTimeout(() => setSendError(''), 3000)
    }
    setSending(false)
  }

  const handleDelete = async (id: number) => {
    await fetch(`/api/live/shoutbox?id=${id}`, { method: 'DELETE' })
    setMessages(prev => prev.filter(m => m.id !== id))
  }

  return (
    <>
      {/* Floating button */}
      <div className="fixed bottom-6 right-6 z-40">
        <button
          onClick={open ? () => setOpen(false) : handleOpen}
          className="relative w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all hover:scale-110 active:scale-95"
          style={{
            background: open
              ? 'rgba(17,24,39,0.95)'
              : 'linear-gradient(135deg, #1d4ed8, #4f46e5)',
            border: '2px solid rgba(255,255,255,0.15)',
            boxShadow: '0 8px 32px rgba(29,78,216,0.4)',
          }}>
          {open ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          )}

          {/* Unread badge */}
          {!open && unread > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white animate-bounce"
              style={{ background: '#ef4444' }}>
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </div>

      {/* Panel */}
      {open && (
        <div
          className="fixed bottom-24 right-6 z-40 w-[340px] rounded-3xl overflow-hidden shadow-2xl flex flex-col"
          style={{
            height: '500px',
            background: 'linear-gradient(180deg, #0d1117 0%, #080d14 100%)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          }}>

          {/* Tabs */}
          <div className="flex-shrink-0 flex border-b border-white/10">
            {([
              ['shout', '💬 Pokalbiai'],
              ['activity', '⚡ Kas vyksta?'],
            ] as const).map(([k, l]) => (
              <button key={k} onClick={() => { setTab(k); if (k === 'shout') setUnread(0) }}
                className={`flex-1 py-3.5 text-xs font-black transition-all ${
                  tab === k
                    ? 'text-white border-b-2 border-blue-500'
                    : 'text-gray-600 hover:text-gray-400'
                }`}>
                {l}
                {k === 'shout' && tab !== 'shout' && unread > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-black bg-red-500 text-white">
                    {unread}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── SHOUTBOX TAB ── */}
          {tab === 'shout' && (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5 scrollbar-thin"
                style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
                {!loaded ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-xs text-gray-600">Dar nėra žinučių. Pradėk pokalbį!</p>
                  </div>
                ) : (
                  messages.map(msg => (
                    <div key={msg.id}
                      className="group flex items-start gap-2 px-2 py-1.5 rounded-xl transition-colors hover:bg-white/5">
                      <Avatar name={msg.author_name} src={msg.author_avatar} size={6} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-[11px] font-bold text-blue-300 truncate max-w-[100px]">
                            {msg.author_name}
                          </span>
                          <span className="text-[10px] text-gray-700 flex-shrink-0">{timeShort(msg.created_at)}</span>
                        </div>
                        <p className="text-xs text-gray-300 leading-relaxed break-words">{msg.body}</p>
                      </div>
                      {isAdmin && (
                        <button onClick={() => handleDelete(msg.id)}
                          className="opacity-0 group-hover:opacity-100 text-[10px] text-gray-700 hover:text-red-500 transition-all flex-shrink-0 mt-0.5">
                          ✕
                        </button>
                      )}
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="flex-shrink-0 px-3 py-3 border-t border-white/10">
                {session ? (
                  <>
                    <div className="flex gap-2">
                      <input
                        ref={inputRef}
                        type="text"
                        value={newText}
                        onChange={e => setNewText(e.target.value.slice(0, 255))}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                        placeholder="Rašyk žinutę..."
                        className="flex-1 px-3 py-2 rounded-xl text-xs text-white placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                        style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
                        disabled={cooldown > 0}
                      />
                      <button
                        onClick={handleSend}
                        disabled={sending || !newText.trim() || cooldown > 0}
                        className="w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-30"
                        style={{ background: 'linear-gradient(135deg, #1d4ed8, #4f46e5)' }}>
                        {cooldown > 0 ? (
                          <span className="text-[10px] font-black text-white">{cooldown}</span>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="22" y1="2" x2="11" y2="13" />
                            <polygon points="22 2 15 22 11 13 2 9 22 2" />
                          </svg>
                        )}
                      </button>
                    </div>
                    {sendError && <p className="text-red-400 text-[10px] mt-1.5 px-1">{sendError}</p>}
                    <div className="flex justify-between mt-1">
                      <span className="text-[10px] text-gray-700">{newText.length}/255</span>
                      {cooldown > 0 && <span className="text-[10px] text-gray-600">Laukti {cooldown}s</span>}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-2">
                    <p className="text-xs text-gray-600 mb-2">
                      <Link href="/auth/signin" className="text-blue-400 hover:text-blue-300 font-bold transition-colors">
                        Prisijunk
                      </Link>
                      {' '}kad galėtum rašyti
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── ACTIVITY TAB ── */}
          {tab === 'activity' && (
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5"
              style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
              {!loaded ? (
                <div className="flex items-center justify-center h-full">
                  <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : events.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-xs text-gray-600">Dar nėra veiklos</p>
                </div>
              ) : (
                events.map(event => {
                  const { text, url } = formatActivityEvent(event)
                  const icon = EVENT_ICONS[event.event_type] || '🔔'
                  const content = (
                    <div className="flex items-start gap-2 px-2 py-2 rounded-xl transition-colors hover:bg-white/5 cursor-pointer">
                      <span className="text-sm flex-shrink-0 mt-0.5">{icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-gray-300 leading-relaxed line-clamp-2">{text}</p>
                        <span className="text-[10px] text-gray-700">{timeShort(event.created_at)}</span>
                      </div>
                    </div>
                  )
                  return url ? (
                    <Link key={event.id} href={url} onClick={() => setOpen(false)}>
                      {content}
                    </Link>
                  ) : (
                    <div key={event.id}>{content}</div>
                  )
                })
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}
