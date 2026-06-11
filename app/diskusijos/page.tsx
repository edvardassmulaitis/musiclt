'use client'

// app/diskusijos/page.tsx
//
// 2026-06-11 consistency redesign (pagal UI_CONSISTENCY_AUDIT):
//   • theme-aware (anksčiau hard-coded tamsus fonas ignoravo šviesią temą);
//   • standartinis .page-shell/.page-head + pill filter bar (kaip /koncertai);
//   • primary CTA oranžinė (buvo mėlynas gradientas);
//   • kortelės su susietos grupės vizualu (artist join) + body excerpt +
//     komentarų count footer'yje; „??" avatarai ir „Vartotojas" placeholder'iai
//     pakeisti fallback'ais; „0 peržiūrų" slepiama.

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { prettifyDiscussionTitle } from '@/lib/forum-title'
import { proxyImg } from '@/lib/img-proxy'

type Discussion = {
  id: number; slug: string; title: string; body: string
  user_id: string; author_name: string | null; author_avatar: string | null
  tags: string[]; is_pinned: boolean; is_locked: boolean
  comment_count: number; like_count: number; view_count: number
  last_comment_at: string | null; created_at: string
  artist?: { name: string; slug: string; cover_image_url: string | null } | { name: string; slug: string; cover_image_url: string | null }[] | null
}

const AVAILABLE_TAGS = ['Klausimai', 'Rekomendacijos', 'Diskusijos', 'Marketplace', 'Renginiai', 'Kita']

function hue(s: string) { let h = 0; for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h }
function sani(s?: string | null) {
  return (s || '').replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim()
}
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'ką tik'
  if (mins < 60) return `prieš ${mins} min.`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `prieš ${hrs} val.`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `prieš ${days} d.`
  return new Date(dateStr).toLocaleDateString('lt-LT', { month: 'short', day: 'numeric', year: 'numeric' })
}
function artistOf(d: Discussion) {
  return Array.isArray(d.artist) ? d.artist[0] : d.artist
}

const pill = (active: boolean) =>
  `shrink-0 cursor-pointer whitespace-nowrap rounded-full border px-3.5 py-1.5 font-['Outfit',sans-serif] text-[12.5px] font-bold transition-colors ${
    active
      ? 'border-[var(--accent-orange)] bg-[var(--accent-orange)] text-white'
      : 'border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
  }`

function Avatar({ src, name, size = 20 }: { src?: string | null; name?: string | null; size?: number }) {
  const nm = name || 'narys'
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={proxyImg(src)} alt="" width={size} height={size} loading="lazy" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  }
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full font-extrabold"
      style={{ width: size, height: size, fontSize: size * 0.42, background: `hsl(${hue(nm)},32%,20%)`, color: `hsl(${hue(nm)},52%,62%)` }}>
      {nm.charAt(0).toUpperCase()}
    </span>
  )
}

function NewDiscussionModal({ onClose, onCreated }: { onClose: () => void; onCreated: (d: Discussion) => void }) {
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setError('')
    setSending(true)
    const res = await fetch('/api/diskusijos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, text, tags }),
    })
    const data = await res.json()
    if (res.ok) onCreated(data.discussion)
    else setError(data.error || 'Klaida')
    setSending(false)
  }

  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed inset-0 z-[1300] flex items-center justify-center overflow-y-auto bg-black/60 px-4 py-8 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-[0_24px_60px_-10px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4">
          <h3 className="m-0 font-['Outfit',sans-serif] text-[16px] font-extrabold text-[var(--text-primary)]">Nauja diskusija</h3>
          <button onClick={onClose} aria-label="Uždaryti" className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-0 bg-[var(--bg-active)] text-[var(--text-secondary)]">✕</button>
        </div>
        <div className="flex flex-col gap-4 p-5">
          <input type="text" value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Pavadinimas…" style={{ fontSize: 16 }}
            className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-hover)] px-4 py-3 font-semibold text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent-orange)]" />
          <textarea value={text} onChange={e => setText(e.target.value)}
            placeholder="Parašyk diskusijos turinį…" rows={6} style={{ fontSize: 16 }}
            className="w-full resize-none rounded-xl border border-[var(--border-default)] bg-[var(--bg-hover)] px-4 py-3 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent-orange)]" />
          <div>
            <p className="m-0 mb-2 font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--text-muted)]">Tagai</p>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_TAGS.map(tag => (
                <button key={tag} type="button" onClick={() => setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                  className={pill(tags.includes(tag))}>
                  {tag}
                </button>
              ))}
            </div>
          </div>
          {error && (
            <p className="m-0 rounded-xl border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.08)] px-3 py-2 text-[13px] text-[var(--accent-red,#f87171)]">{error}</p>
          )}
          <button onClick={submit} disabled={sending || title.trim().length < 5 || text.trim().length < 10}
            className="w-full cursor-pointer rounded-xl border-0 bg-[var(--accent-orange)] py-3.5 font-['Outfit',sans-serif] text-[14px] font-extrabold text-white shadow-[0_4px_16px_rgba(249,115,22,0.3)] transition-transform hover:-translate-y-px disabled:opacity-40">
            {sending ? 'Kuriama…' : 'Sukurti diskusiją'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function DiscussionCard({ d }: { d: Discussion }) {
  const activityDate = d.last_comment_at || d.created_at
  const art = artistOf(d)
  const title = prettifyDiscussionTitle(d.title, d.slug)
  const body = sani(d.body)
  // Body excerpt slepiamas, jei jis tik dubliuoja pavadinimą (legacy bug).
  const excerpt = body && body.toLowerCase() !== title.toLowerCase() ? body : ''
  return (
    <Link href={`/diskusijos/${d.slug}`}
      className={`group flex flex-col overflow-hidden rounded-2xl border no-underline transition-all hover:-translate-y-0.5 hover:border-[rgba(139,92,246,0.5)] ${
        d.is_pinned ? 'border-[rgba(249,115,22,0.3)]' : 'border-[var(--border-default)]'
      }`}
      style={{ background: 'linear-gradient(160deg, rgba(139,92,246,0.07), var(--bg-surface) 60%)' }}>
      {art?.cover_image_url && (
        <div className="relative h-[110px] shrink-0 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={proxyImg(art.cover_image_url)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
          <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 40%, rgba(13,19,32,0.85))' }} />
          <span className="absolute bottom-2 left-3 font-['Outfit',sans-serif] text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-white/90">{art.name}</span>
        </div>
      )}
      <div className="flex flex-1 flex-col gap-1.5 px-4 pb-2.5 pt-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {d.is_pinned && <span className="rounded-md bg-[rgba(249,115,22,0.15)] px-1.5 py-0.5 font-['Outfit',sans-serif] text-[9.5px] font-extrabold uppercase tracking-[0.06em] text-[var(--accent-orange)]">Prisegta</span>}
          {d.is_locked && <span className="rounded-md bg-[var(--bg-active)] px-1.5 py-0.5 font-['Outfit',sans-serif] text-[9.5px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-faint)]">Užrakinta</span>}
          {(d.tags || []).map(tag => (
            <span key={tag} className="rounded-md bg-[rgba(139,92,246,0.13)] px-1.5 py-0.5 font-['Outfit',sans-serif] text-[9.5px] font-bold text-[#a78bfa]">{tag}</span>
          ))}
        </div>
        <h3 className="m-0 line-clamp-2 font-['Outfit',sans-serif] text-[15px] font-extrabold leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">{title}</h3>
        {excerpt && <p className="m-0 line-clamp-3 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">{excerpt}</p>}
      </div>
      <div className="mt-auto flex items-center gap-2 border-t border-[var(--border-subtle)] px-4 py-2.5">
        <Avatar src={d.author_avatar} name={d.author_name} />
        <span className="min-w-0 truncate text-[11.5px] font-semibold text-[var(--text-secondary)]">{d.author_name || 'narys'}</span>
        <span className="ml-auto flex shrink-0 items-center gap-3 text-[11px] text-[var(--text-muted)]">
          {d.comment_count > 0 && (
            <span className="flex items-center gap-1 font-bold text-[#a78bfa]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z"/></svg>
              {d.comment_count}
            </span>
          )}
          <span className="text-[var(--text-faint)]">{timeAgo(activityDate)}</span>
        </span>
      </div>
    </Link>
  )
}

export default function DiskusijosPage() {
  const { data: session } = useSession()
  const [discussions, setDiscussions] = useState<Discussion[]>([])
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState<'activity' | 'newest' | 'popular'>('activity')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ sort, limit: '30' })
    if (activeTag) params.set('tag', activeTag)
    const res = await fetch(`/api/diskusijos?${params}`)
    const data = await res.json()
    setDiscussions(data.discussions || [])
    setLoading(false)
  }, [sort, activeTag])

  useEffect(() => { load() }, [load])

  return (
    <div className="page-shell">
      <div className="page-head">
        <h1>Diskusijos</h1>
        <p>Bendruomenės pokalbiai apie muziką — klausk, rekomenduok, ginčykis</p>
      </div>

      {/* Standartinis pill filter bar (kaip /koncertai) + primary CTA dešinėje */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {([['activity', 'Aktyvios'], ['newest', 'Naujos'], ['popular', 'Populiarios']] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setSort(k)} className={pill(sort === k)}>{l}</button>
        ))}
        <span className="mx-1 h-4 w-px bg-[var(--border-default)]" />
        <button type="button" onClick={() => setActiveTag(null)} className={pill(!activeTag)}>Visos</button>
        {AVAILABLE_TAGS.map(tag => (
          <button key={tag} type="button" onClick={() => setActiveTag(activeTag === tag ? null : tag)} className={pill(activeTag === tag)}>{tag}</button>
        ))}
        <span className="ml-auto" />
        {session ? (
          <button onClick={() => setShowNew(true)}
            className="shrink-0 cursor-pointer rounded-xl border-0 bg-[var(--accent-orange)] px-4 py-2 font-['Outfit',sans-serif] text-[13px] font-extrabold text-white shadow-[0_4px_16px_rgba(249,115,22,0.3)] transition-transform hover:-translate-y-px">
            + Nauja diskusija
          </button>
        ) : (
          <Link href="/auth/signin"
            className="shrink-0 rounded-xl border border-[var(--border-default)] bg-[var(--card-bg)] px-4 py-2 font-['Outfit',sans-serif] text-[13px] font-bold text-[var(--text-secondary)] no-underline">
            Prisijunk kurti diskusiją
          </Link>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array(6).fill(null).map((_, i) => <div key={i} className="hp-skel h-[190px] rounded-2xl" />)}
        </div>
      ) : discussions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-default)] py-16 text-center">
          <p className="m-0 font-['Outfit',sans-serif] text-[17px] font-extrabold text-[var(--text-primary)]">Dar nėra diskusijų</p>
          <p className="m-0 mt-1 text-[13px] text-[var(--text-muted)]">Būk pirmas — sukurk diskusijos temą!</p>
          {session && (
            <button onClick={() => setShowNew(true)}
              className="mt-5 cursor-pointer rounded-xl border-0 bg-[var(--accent-orange)] px-7 py-3 font-['Outfit',sans-serif] text-[13.5px] font-extrabold text-white shadow-[0_4px_16px_rgba(249,115,22,0.3)]">
              + Nauja diskusija
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {discussions.map(d => <DiscussionCard key={d.id} d={d} />)}
        </div>
      )}

      {showNew && (
        <NewDiscussionModal
          onClose={() => setShowNew(false)}
          onCreated={d => { setDiscussions(prev => [d, ...prev]); setShowNew(false) }}
        />
      )}
    </div>
  )
}
