'use client'

// components/ShoutboxWidget.tsx
//
// Bendras svetainės pokalbis (shoutbox) — VIENAS visiems bendras, nesibaigiantis
// srautas. Visi nariai mato tą patį. Backend: /api/live/shoutbox (GET/POST/DELETE).
// Admin'ai gali trinti svetimas žinutes. Įvedimo laukas — pačiame apačioje.
// Header'io ikona atveria pilną modalą su daugiau žinučių.

import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'

type Msg = { id: string; user_id: string | null; author_name: string | null; author_avatar: string | null; body: string; created_at: string }

function timeAgoShort(d: string): string {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return 'ką tik'
  if (m < 60) return `${m} min.`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} val.`
  return `${Math.floor(h / 24)} d.`
}
function strHue(s: string) { let h = 0; for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h }

function MsgRow({ m, isAdmin, onDelete }: { m: Msg; isAdmin: boolean; onDelete: (id: string) => void }) {
  const name = m.author_name || 'Vartotojas'
  return (
    <div className="group flex gap-2 px-3 py-1.5">
      {m.author_avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={proxyImg(m.author_avatar)} alt="" className="mt-0.5 h-6 w-6 shrink-0 rounded-full object-cover" />
      ) : (
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold" style={{ background: `hsl(${strHue(name)},32%,20%)`, color: `hsl(${strHue(name)},48%,58%)` }}>{name.charAt(0).toUpperCase()}</div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="truncate text-[11px] font-extrabold text-[var(--accent-link)]">{name}</span>
          <span className="shrink-0 text-[9px] text-[var(--text-faint)]">{timeAgoShort(m.created_at)}</span>
          {isAdmin && (
            <button onClick={() => onDelete(m.id)} title="Ištrinti" className="ml-auto shrink-0 text-[10px] text-[var(--text-faint)] opacity-0 transition-opacity hover:text-[var(--accent-red)] group-hover:opacity-100">✕</button>
          )}
        </div>
        <p className="m-0 break-words text-[12.5px] leading-snug text-[var(--text-secondary)]">{m.body}</p>
      </div>
    </div>
  )
}

function useShoutbox(pollMs = 15000) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/live/shoutbox?limit=80', { cache: 'no-store' }).then(res => res.json())
      // API grąžina newest-first → apverčiam į chat tvarką (seniausi viršuje).
      setMessages((r.messages || []).slice().reverse())
    } catch {}
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load(); const iv = setInterval(load, pollMs); return () => clearInterval(iv) }, [load, pollMs])
  return { messages, loading, reload: load }
}

function Composer({ onSent, big = false }: { onSent: () => void; big?: boolean }) {
  const { data: session } = useSession()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  if (!session?.user) {
    return (
      <Link href="/auth/signin" className="block rounded-lg border border-[var(--border-default)] bg-[var(--bg-hover)] px-3 py-2 text-center text-[11px] font-bold text-[var(--accent-link)] no-underline">
        Prisijunk rašyti pokalbyje →
      </Link>
    )
  }
  const send = async () => {
    const t = text.trim()
    if (!t || sending) return
    setSending(true); setErr(null)
    try {
      const r = await fetch('/api/live/shoutbox', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t }) })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'Klaida'); return }
      setText(''); onSent()
    } catch { setErr('Tinklo klaida') }
    finally { setSending(false) }
  }
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send() }}
          maxLength={255}
          placeholder="Parašyk žinutę…"
          className={`min-w-0 flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-[var(--text-primary)] outline-none focus:border-[var(--accent-orange)] ${big ? 'py-2.5 text-[13px]' : 'py-2 text-[12px]'}`}
        />
        <button onClick={send} disabled={sending || !text.trim()} className="shrink-0 rounded-lg bg-[var(--accent-orange)] px-3 py-2 text-[12px] font-extrabold text-white disabled:opacity-40">→</button>
      </div>
      {err && <p className="m-0 mt-1 text-[10px] text-[var(--accent-red)]">{err}</p>}
    </div>
  )
}

/** Pilnas modalas su daugiau žinučių + įvedimu. */
function ShoutboxModal({ onClose }: { onClose: () => void }) {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'
  const { messages, reload } = useShoutbox(10000)
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => { bottomRef.current?.scrollIntoView() }, [messages.length])
  const del = async (id: string) => { await fetch(`/api/live/shoutbox?id=${id}`, { method: 'DELETE' }); reload() }
  if (typeof document === 'undefined') return null
  return createPortal(
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
      <div className="flex w-full max-w-[520px] flex-col overflow-hidden rounded-t-2xl bg-[var(--bg-surface)] shadow-[0_24px_60px_-10px_rgba(0,0,0,0.5)] sm:mx-4 sm:rounded-2xl" style={{ height: 'min(80vh, 640px)' }}>
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="font-['Outfit',sans-serif] text-[14px] font-extrabold text-[var(--text-primary)]">Pokalbiai</span>
            <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" style={{ boxShadow: '0 0 6px #22c55e' }} />
          </div>
          <button onClick={onClose} aria-label="Uždaryti" className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--bg-active)] text-[var(--text-secondary)]">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {messages.map(m => <MsgRow key={m.id} m={m} isAdmin={isAdmin} onDelete={del} />)}
          <div ref={bottomRef} />
        </div>
        <div className="shrink-0 border-t border-[var(--border-subtle)] p-3">
          <Composer onSent={reload} big />
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function ShoutboxWidget() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'
  const { messages, loading, reload } = useShoutbox()
  const [modalOpen, setModalOpen] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight }, [messages.length])
  const del = async (id: string) => { await fetch(`/api/live/shoutbox?id=${id}`, { method: 'DELETE' }); reload() }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-3.5 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="font-['Outfit',sans-serif] text-[13px] font-extrabold text-[var(--text-primary)]">Pokalbiai</span>
          <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" style={{ boxShadow: '0 0 6px #22c55e' }} />
        </div>
        <button onClick={() => setModalOpen(true)} aria-label="Atverti visą pokalbį" title="Atverti visą pokalbį" className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--accent-orange)]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="14" y2="17" /></svg>
        </button>
      </div>
      <div ref={bodyRef} className="flex-1 overflow-y-auto py-1.5" style={{ minHeight: 0 }}>
        {loading ? (
          <div className="px-3 py-6 text-center text-[11px] text-[var(--text-faint)]">Kraunama…</div>
        ) : messages.length === 0 ? (
          <div className="px-3 py-6 text-center text-[11px] text-[var(--text-muted)]">Dar nėra žinučių — parašyk pirmas!</div>
        ) : messages.map(m => <MsgRow key={m.id} m={m} isAdmin={isAdmin} onDelete={del} />)}
      </div>
      <div className="shrink-0 border-t border-[var(--border-subtle)] p-2.5">
        <Composer onSent={reload} />
      </div>
      {modalOpen && <ShoutboxModal onClose={() => setModalOpen(false)} />}
    </div>
  )
}
