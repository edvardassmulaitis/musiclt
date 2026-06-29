'use client'

// app/diskusijos/page.tsx
//
// 2026-06-30 Reddit-stiliaus redizainas:
//   • kairė kategorijų šoninė juosta su realiais įrašų skaičiais
//     (kategorija = discussions.tag, backfill'inta heuristiškai; senasis
//     tags[] array filtras visada grąžindavo tuščią);
//   • kompaktiškas eilučių sąrašas (balsavimo rail kairėje, kategorijos chip,
//     autorius, laikas, komentarų skaičius) vietoj 3-stulpelių kortelių grid;
//   • sort tab'ai (Aktyvios / Naujos / Populiariausios) realiai veikia;
//   • mobile: kategorijos → horizontalus chip'ų slankiklis.

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { prettifyDiscussionTitle } from '@/lib/forum-title'
import { proxyImg } from '@/lib/img-proxy'

type Discussion = {
  id: number; slug: string; title: string; body: string
  user_id: string; author_name: string | null; author_avatar: string | null
  tag: string | null; tags: string[]; is_pinned: boolean; is_locked: boolean
  comment_count: number; like_count: number; view_count: number
  last_comment_at: string | null; created_at: string
  artist?: { name: string; slug: string; cover_image_url: string | null } | { name: string; slug: string; cover_image_url: string | null }[] | null
}
type Category = { key: string; count: number }

// Kategorijos ikonos (lengvas vizualus atpažinimas šoninėje juostoje).
const CAT_ICON: Record<string, string> = {
  'Grupės ir atlikėjai': '🎤',
  'Dainos': '🎵',
  'Albumai': '💿',
  'Koncertai': '🎫',
  'Stiliai ir žanrai': '🎚️',
  'TV ir kinas': '🎬',
  'Sportas': '⚽',
  'Technika': '🎛️',
  'Pagalba': '❓',
  'Kita': '💬',
}
const ALL_CATEGORIES = Object.keys(CAT_ICON)

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

function CommentIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z"/></svg>
}

function NewDiscussionModal({ onClose, onCreated }: { onClose: () => void; onCreated: (d: Discussion) => void }) {
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [cat, setCat] = useState<string>('Kita')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setError('')
    setSending(true)
    const res = await fetch('/api/diskusijos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, text, tag: cat }),
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
            <p className="m-0 mb-2 font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--text-muted)]">Kategorija</p>
            <div className="flex flex-wrap gap-2">
              {ALL_CATEGORIES.map(c => (
                <button key={c} type="button" onClick={() => setCat(c)}
                  className={`shrink-0 cursor-pointer whitespace-nowrap rounded-full border px-3 py-1.5 font-['Outfit',sans-serif] text-[12.5px] font-bold transition-colors ${
                    cat === c
                      ? 'border-[var(--accent-orange)] bg-[var(--accent-orange)] text-white'
                      : 'border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
                  }`}>
                  <span className="mr-1">{CAT_ICON[c]}</span>{c}
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

// —— Reddit-stiliaus diskusijos eilutė ——
function DiscussionRow({ d }: { d: Discussion }) {
  const activityDate = d.last_comment_at || d.created_at
  const art = artistOf(d)
  const title = prettifyDiscussionTitle(d.title, d.slug)
  const body = sani(d.body)
  const excerpt = body && body.toLowerCase() !== title.toLowerCase() ? body : ''
  const cat = d.tag || 'Kita'
  return (
    <Link href={`/diskusijos/${d.slug}`}
      className={`group flex overflow-hidden rounded-xl border no-underline transition-colors hover:border-[var(--border-strong)] ${
        d.is_pinned ? 'border-[rgba(249,115,22,0.35)] bg-[rgba(249,115,22,0.04)]' : 'border-[var(--border-default)] bg-[var(--bg-surface)]'
      }`}>
      {/* Balsavimo / score rail */}
      <div className="flex w-[46px] shrink-0 flex-col items-center justify-start gap-0.5 border-r border-[var(--border-subtle)] bg-[var(--bg-hover)] py-2.5">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-faint)] group-hover:text-[var(--accent-orange)]"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
        <span className="font-['Outfit',sans-serif] text-[13px] font-extrabold leading-none text-[var(--text-primary)]">{d.like_count || 0}</span>
      </div>

      {/* Turinys */}
      <div className="flex min-w-0 flex-1 flex-col gap-1 px-3.5 py-2.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--text-muted)]">
          <span className="inline-flex items-center gap-1 rounded-md bg-[rgba(139,92,246,0.13)] px-1.5 py-0.5 font-['Outfit',sans-serif] text-[10.5px] font-bold text-[#a78bfa]">
            <span>{CAT_ICON[cat] || '💬'}</span>{cat}
          </span>
          {d.is_pinned && <span className="rounded-md bg-[rgba(249,115,22,0.15)] px-1.5 py-0.5 font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.05em] text-[var(--accent-orange)]">Prisegta</span>}
          {d.is_locked && <span className="rounded-md bg-[var(--bg-active)] px-1.5 py-0.5 font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.05em] text-[var(--text-faint)]">Užrakinta</span>}
          <span className="inline-flex items-center gap-1">
            <Avatar src={d.author_avatar} name={d.author_name} size={16} />
            <span className="font-semibold text-[var(--text-secondary)]">{d.author_name || 'narys'}</span>
          </span>
          <span className="text-[var(--text-faint)]">· {timeAgo(activityDate)}</span>
        </div>

        <h3 className="m-0 line-clamp-2 font-['Outfit',sans-serif] text-[15.5px] font-bold leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">{title}</h3>
        {excerpt && <p className="m-0 line-clamp-1 text-[12.5px] leading-relaxed text-[var(--text-muted)]">{excerpt}</p>}

        <div className="mt-0.5 flex items-center gap-1.5 text-[12px] font-bold text-[var(--text-muted)]">
          <CommentIcon />
          <span>{d.comment_count || 0} {(d.comment_count === 1) ? 'komentaras' : (d.comment_count % 10 >= 2 && d.comment_count % 10 <= 9 && !(d.comment_count >= 11 && d.comment_count <= 19)) ? 'komentarai' : 'komentarų'}</span>
        </div>
      </div>

      {/* Atlikėjo mini vizualas */}
      {art?.cover_image_url && (
        <div className="relative hidden w-[78px] shrink-0 overflow-hidden sm:block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={proxyImg(art.cover_image_url)} alt="" loading="lazy" className="h-full w-full object-cover" />
        </div>
      )}
    </Link>
  )
}

export default function DiskusijosPage() {
  const { data: session } = useSession()
  const [discussions, setDiscussions] = useState<Discussion[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [sort, setSort] = useState<'activity' | 'newest' | 'popular'>('activity')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [resultTotal, setResultTotal] = useState(0)

  const PAGE = 25

  // Kategorijų skaičiai (vieną kartą).
  useEffect(() => {
    fetch('/api/diskusijos/categories')
      .then(r => r.json())
      .then(d => { setCategories(d.categories || []); setTotal(d.total || 0) })
      .catch(() => {})
  }, [])

  const load = useCallback(async (reset: boolean) => {
    if (reset) setLoading(true); else setLoadingMore(true)
    const offset = reset ? 0 : discussions.length
    const params = new URLSearchParams({ sort, limit: String(PAGE), offset: String(offset) })
    if (activeTag) params.set('tag', activeTag)
    const res = await fetch(`/api/diskusijos?${params}`)
    const data = await res.json()
    const rows: Discussion[] = data.discussions || []
    setResultTotal(data.total || 0)
    setDiscussions(prev => reset ? rows : [...prev, ...rows])
    if (reset) setLoading(false); else setLoadingMore(false)
  }, [sort, activeTag, discussions.length])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(true) }, [sort, activeTag])

  const SORTS = [['activity', 'Aktyvios'], ['newest', 'Naujos'], ['popular', 'Populiariausios']] as const

  return (
    <div className="page-shell">
      <div className="page-head">
        <h1>Diskusijos</h1>
        <p>Bendruomenės pokalbiai apie muziką — klausk, rekomenduok, ginčykis</p>
      </div>

      <div className="flex gap-6">
        {/* —— Kairė šoninė juosta —— */}
        <aside className="hidden w-[244px] shrink-0 lg:block">
          <div className="sticky top-[76px] flex flex-col gap-4">
            {session ? (
              <button onClick={() => setShowNew(true)}
                className="w-full cursor-pointer rounded-xl border-0 bg-[var(--accent-orange)] py-2.5 font-['Outfit',sans-serif] text-[13.5px] font-extrabold text-white shadow-[0_4px_16px_rgba(249,115,22,0.3)] transition-transform hover:-translate-y-px">
                + Nauja diskusija
              </button>
            ) : (
              <Link href="/auth/signin"
                className="block w-full rounded-xl border border-[var(--border-default)] bg-[var(--card-bg)] py-2.5 text-center font-['Outfit',sans-serif] text-[13px] font-bold text-[var(--text-secondary)] no-underline">
                Prisijunk kurti diskusiją
              </Link>
            )}

            <div className="overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
              <p className="m-0 border-b border-[var(--border-subtle)] px-3.5 py-2.5 font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--text-muted)]">Kategorijos</p>
              <button onClick={() => setActiveTag(null)}
                className={`flex w-full cursor-pointer items-center justify-between border-0 px-3.5 py-2 text-left text-[13px] font-bold transition-colors ${
                  !activeTag ? 'bg-[rgba(249,115,22,0.1)] text-[var(--accent-orange)]' : 'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                }`}>
                <span>📚 Visos diskusijos</span>
                <span className="text-[11px] font-bold text-[var(--text-faint)]">{total}</span>
              </button>
              {categories.map(c => (
                <button key={c.key} onClick={() => setActiveTag(c.key)}
                  className={`flex w-full cursor-pointer items-center justify-between border-0 px-3.5 py-2 text-left text-[13px] font-bold transition-colors ${
                    activeTag === c.key ? 'bg-[rgba(249,115,22,0.1)] text-[var(--accent-orange)]' : 'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                  }`}>
                  <span className="flex min-w-0 items-center gap-2"><span>{CAT_ICON[c.key] || '💬'}</span><span className="truncate">{c.key}</span></span>
                  <span className="shrink-0 text-[11px] font-bold text-[var(--text-faint)]">{c.count}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* —— Pagrindinis stulpelis —— */}
        <main className="min-w-0 flex-1">
          {/* Mobile: kategorijų chip'ai */}
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1 lg:hidden" style={{ scrollbarWidth: 'none' }}>
            <button onClick={() => setActiveTag(null)}
              className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 font-['Outfit',sans-serif] text-[12.5px] font-bold ${!activeTag ? 'border-[var(--accent-orange)] bg-[var(--accent-orange)] text-white' : 'border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-secondary)]'}`}>
              Visos
            </button>
            {categories.map(c => (
              <button key={c.key} onClick={() => setActiveTag(c.key)}
                className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 font-['Outfit',sans-serif] text-[12.5px] font-bold ${activeTag === c.key ? 'border-[var(--accent-orange)] bg-[var(--accent-orange)] text-white' : 'border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-secondary)]'}`}>
                {CAT_ICON[c.key]} {c.key}
              </button>
            ))}
          </div>

          {/* Sort juosta */}
          <div className="mb-3 flex items-center gap-1 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-1">
            {SORTS.map(([k, l]) => (
              <button key={k} onClick={() => setSort(k)}
                className={`flex-1 cursor-pointer rounded-lg border-0 px-3 py-2 font-['Outfit',sans-serif] text-[13px] font-bold transition-colors ${
                  sort === k ? 'bg-[var(--accent-orange)] text-white' : 'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                }`}>{l}</button>
            ))}
          </div>

          {/* Mobile: Nauja diskusija */}
          <div className="mb-3 lg:hidden">
            {session ? (
              <button onClick={() => setShowNew(true)}
                className="w-full cursor-pointer rounded-xl border-0 bg-[var(--accent-orange)] py-2.5 font-['Outfit',sans-serif] text-[13.5px] font-extrabold text-white shadow-[0_4px_16px_rgba(249,115,22,0.3)]">
                + Nauja diskusija
              </button>
            ) : (
              <Link href="/auth/signin" className="block w-full rounded-xl border border-[var(--border-default)] bg-[var(--card-bg)] py-2.5 text-center font-['Outfit',sans-serif] text-[13px] font-bold text-[var(--text-secondary)] no-underline">
                Prisijunk kurti diskusiją
              </Link>
            )}
          </div>

          {loading ? (
            <div className="flex flex-col gap-2.5">
              {Array(8).fill(null).map((_, i) => <div key={i} className="hp-skel h-[84px] rounded-xl" />)}
            </div>
          ) : discussions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--border-default)] py-16 text-center">
              <p className="m-0 font-['Outfit',sans-serif] text-[17px] font-extrabold text-[var(--text-primary)]">Diskusijų nėra</p>
              <p className="m-0 mt-1 text-[13px] text-[var(--text-muted)]">{activeTag ? 'Šioje kategorijoje dar tuščia.' : 'Būk pirmas — sukurk diskusijos temą!'}</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2.5">
                {discussions.map(d => <DiscussionRow key={d.id} d={d} />)}
              </div>
              {discussions.length < resultTotal && (
                <button onClick={() => load(false)} disabled={loadingMore}
                  className="mt-4 w-full cursor-pointer rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] py-3 font-['Outfit',sans-serif] text-[13px] font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:opacity-50">
                  {loadingMore ? 'Kraunama…' : `Rodyti daugiau (${resultTotal - discussions.length})`}
                </button>
              )}
            </>
          )}
        </main>
      </div>

      {showNew && (
        <NewDiscussionModal
          onClose={() => setShowNew(false)}
          onCreated={d => { setDiscussions(prev => [d, ...prev]); setShowNew(false) }}
        />
      )}
    </div>
  )
}
