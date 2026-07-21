'use client'
// Bendruomenės antraštės ikonos: pokalbiai (su recent indikatorium) + „kas vyksta".
// Paspaudus atidaro modalus (reuse HomeChatsWidget / ActivityModal).
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { HomeChatsWidget } from '@/components/HomeChatsWidget'
import { useActivity, ActivityModal } from '@/components/ActivityWidget'

export default function CommunityIcons() {
  const [chatOpen, setChatOpen] = useState(false)
  const [actOpen, setActOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const { events } = useActivity()

  useEffect(() => {
    let on = true
    const load = () =>
      fetch('/api/chat/unread', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => { if (on) setUnread(d.unread || 0) })
        .catch(() => {})
    load()
    const iv = setInterval(load, 30_000)
    return () => { on = false; clearInterval(iv) }
  }, [])

  return (
    <div className="v2-cicons">
      <button type="button" onClick={() => setChatOpen(true)} className="v2-cic" aria-label="Pokalbiai" title="Pokalbiai">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
        {unread > 0 && <span className="v2-cic-dot" aria-label={`${unread} naujų`} />}
      </button>
      <button type="button" onClick={() => setActOpen(true)} className="v2-cic" aria-label="Kas vyksta" title="Kas vyksta">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
        <span className="v2-cic-live" title="Gyvas srautas" />
      </button>

      {chatOpen && createPortal(
        <div onClick={(e) => { if (e.target === e.currentTarget) setChatOpen(false) }} className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
          <div className="flex w-full max-w-[460px] flex-col overflow-hidden rounded-t-2xl bg-[var(--bg-surface)] shadow-[0_24px_60px_-10px_rgba(0,0,0,0.5)] sm:mx-4 sm:rounded-2xl" style={{ maxHeight: 'min(80vh, 620px)' }}>
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
              <span className="font-['Outfit',sans-serif] text-[16px] font-extrabold text-[var(--text-primary)]">Pokalbiai</span>
              <button onClick={() => setChatOpen(false)} aria-label="Uždaryti" className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--bg-active)] text-[var(--text-secondary)]">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <HomeChatsWidget />
            </div>
          </div>
        </div>,
        document.body,
      )}

      {actOpen && <ActivityModal events={events} onClose={() => setActOpen(false)} />}
    </div>
  )
}
