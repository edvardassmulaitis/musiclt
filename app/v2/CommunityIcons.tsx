'use client'
// Bendruomenės antraštės ikonos: pokalbiai (bendra dėžutė + recent indikatorius)
// + „kas vyksta". Plius trumpas „atnaujinta prieš X" indikatorius.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSession } from 'next-auth/react'
import { ShoutboxPanel } from '@/components/chat/ShoutboxPanel'
import { useActivity, ActivityModal } from '@/components/ActivityWidget'

function timeAgo(iso?: string | null): string {
  if (!iso) return ''
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (!isFinite(m) || m < 0) return ''
  if (m < 1) return 'ką tik'
  if (m < 60) return `prieš ${m} min.`
  const h = Math.floor(m / 60)
  if (h < 24) return `prieš ${h} val.`
  return `prieš ${Math.floor(h / 24)} d.`
}

export default function CommunityIcons() {
  const [chatOpen, setChatOpen] = useState(false)
  const [actOpen, setActOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const { events } = useActivity()
  const { data: session } = useSession()
  const viewerId = (session?.user as any)?.id || null
  const [, force] = useState(0)

  useEffect(() => {
    let on = true
    const load = () =>
      fetch('/api/chat/unread', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => { if (on) setUnread(d.unread || 0) })
        .catch(() => {})
    load()
    const iv = setInterval(load, 30_000)
    // „prieš X" priverstinis perpiešimas kas minutę
    const iv2 = setInterval(() => force((x) => x + 1), 60_000)
    return () => { on = false; clearInterval(iv); clearInterval(iv2) }
  }, [])

  const updated = timeAgo(events[0]?.created_at)

  return (
    <div className="v2-cicons">
      {updated && <span className="v2-cupd" title="Paskutinis bendruomenės įvykis">{updated}</span>}
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
          <div className="flex w-full max-w-[460px] flex-col overflow-hidden rounded-t-2xl bg-[var(--bg-surface)] shadow-[0_24px_60px_-10px_rgba(0,0,0,0.5)] sm:mx-4 sm:rounded-2xl" style={{ height: 'min(80vh, 620px)' }}>
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
              <span className="font-['Outfit',sans-serif] text-[16px] font-extrabold text-[var(--text-primary)]">Bendra pokalbių dėžutė</span>
              <button onClick={() => setChatOpen(false)} aria-label="Uždaryti" className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--bg-active)] text-[var(--text-secondary)]">✕</button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              {viewerId ? (
                <ShoutboxPanel viewerId={viewerId} />
              ) : (
                <p className="m-0 px-4 py-8 text-center text-[14px] text-[var(--text-muted)]">Prisijunk, kad galėtum rašyti bendrame pokalbyje.</p>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {actOpen && <ActivityModal events={events} onClose={() => setActOpen(false)} />}
    </div>
  )
}
