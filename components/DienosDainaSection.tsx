'use client'
// components/DienosDainaSection.tsx
//
// „Dienos daina" sekcija — bendras komponentas homepage'ui IR /atrasti hub'ui
// (2026-06-05 ekstrahuota iš app/page.tsx, kad /atrasti naudotų TĄ PATĮ UI +
// veikimą: 188px kortelės, inline „Pasiūlyti dainą" modalas, balsavimas).
//
// onOpenTrack neprivalomas: jei paduotas (homepage) — naudoja tėvo track
// modalą; jei ne (atrasti) — komponentas pats valdo vidinį <HomeTrackModal>.

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import { HomeListModal, StickyMoreButton } from '@/components/HomeListModal'
import { HomeTrackModal } from '@/components/HomeTrackModal'

// ───────────────────────── helpers (self-contained) ─────────────────────────
function sanitizeTitle(raw: string): string {
  return (raw || '').replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim()
}
function extractYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?\s]{11})/)
  return m?.[1] || null
}
function strHue(s: string) { let h = 0; for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h }

function Cover({ src, alt, size = 44, radius = 10, ytId, artistSrc }: { src?: string | null; alt: string; size?: number; radius?: number; ytId?: string | null; artistSrc?: string | null }) {
  const h = strHue(alt)
  const imgSrc = src || (ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : null) || artistSrc
  // eslint-disable-next-line @next/next/no-img-element
  if (imgSrc) return <img src={proxyImg(imgSrc)} alt={alt} loading="lazy" style={{ width: size, height: size, borderRadius: radius, objectFit: 'cover', flexShrink: 0, display: 'block' }} />
  return (
    <div style={{ width: size, height: size, borderRadius: radius, flexShrink: 0, background: `linear-gradient(135deg, hsl(${h},38%,16%), hsl(${(h + 40) % 360},28%,10%))`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: `hsl(${h},45%,45%)`, fontSize: size * 0.38, fontWeight: 800, fontFamily: 'Outfit, sans-serif' }}>
      {alt[0]?.toUpperCase() || '?'}
    </div>
  )
}
function Skel({ w, h, r = 6 }: { w: number | string; h: number; r?: number }) {
  return <div className="hp-skel" style={{ width: w, height: h, borderRadius: r, flexShrink: 0 }} />
}

// ───────────────────────── types ─────────────────────────
type Proposer = { username: string | null; full_name: string | null; avatar_url: string | null }
type TrackLite = { id: number; title: string; cover_url: string | null; slug?: string | null; video_url?: string | null; artists: { name: string; slug?: string | null; cover_image_url?: string | null } | null }
type Nomination = { id: number; votes: number; weighted_votes: number; comment?: string | null; user_id?: string | null; tracks: TrackLite | null; proposer?: Proposer | null; voters?: Proposer[]; anon_votes?: number; own?: boolean }
type DainaWinner = { id: number; date: string; total_votes: number; weighted_votes: number; winning_comment?: string | null; proposer?: Proposer | null; tracks: TrackLite | null }

// ───────────────────────── proposer line ─────────────────────────
function proposerName(p?: Proposer | null): string | null {
  if (!p) return null
  return p.full_name || p.username || null
}
function ProposerLine({ p }: { p?: Proposer | null }) {
  const name = proposerName(p)
  if (!name) return null
  return (
    <span className="flex min-w-0 items-center gap-1">
      {p?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={proxyImg(p.avatar_url)} alt="" className="h-[14px] w-[14px] shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full text-[7px] font-extrabold" style={{ background: `hsl(${strHue(name)},32%,20%)`, color: `hsl(${strHue(name)},48%,58%)` }}>{name.charAt(0).toUpperCase()}</span>
      )}
      <span className="truncate text-[10.5px] font-semibold text-[var(--text-secondary)]">{name}</span>
    </span>
  )
}

function DainaPopBar({ level }: { level: number }) {
  return (
    <span className="mt-2 flex items-center gap-[3px] px-0.5" aria-label={`Balsų lygis ${level}/5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={`h-[3px] w-[11px] rounded-[2px] ${i < level ? 'bg-[var(--accent-orange)]' : 'bg-[var(--border-default)]'}`} />
      ))}
    </span>
  )
}

// ───────────────────────── suggest modal ─────────────────────────
// export — naudoja ir naujasis /atrasti DD hero (2026-06-10 redesign).
export function DainaSuggestModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<any | null>(null)
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const scrollY = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.left = '0'
    document.body.style.right = '0'
    document.body.style.width = '100%'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.left = ''
      document.body.style.right = ''
      document.body.style.width = ''
      window.scrollTo(0, scrollY)
    }
  }, [onClose])

  useEffect(() => {
    const qq = query.trim()
    if (qq.length < 2) { setResults([]); setSearching(false); return }
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search-master?q=${encodeURIComponent(qq)}&categories=tracks&limit=12`)
        const d = await res.json()
        setResults((d.results?.tracks || []).map((h: any) => ({
          id: h.id,
          title: h.title,
          artist_name: h.subtitle || '',
          image_url: h.image_url || null,
        })))
      } catch { setResults([]) }
      finally { setSearching(false) }
    }, 200)
    return () => clearTimeout(t)
  }, [query])

  const submit = async () => {
    if (!selected || sending) return
    setSending(true); setError('')
    try {
      const res = await fetch('/api/dienos-daina/nominations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_id: selected.id, comment: comment.trim() || null }),
      })
      const d = await res.json()
      if (res.ok) { onDone(); onClose() }
      else setError(d.error || 'Klaida')
    } catch { setError('Tinklo klaida') }
    finally { setSending(false) }
  }

  if (typeof document === 'undefined') return null
  return createPortal(
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
      <div className="flex w-full max-w-[480px] flex-col overflow-hidden rounded-t-2xl bg-[var(--bg-surface)] shadow-[0_24px_60px_-10px_rgba(0,0,0,0.5)] sm:mx-4 sm:rounded-2xl" style={{ maxHeight: 'min(85vh, 640px)' }}>
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
          <span className="font-['Outfit',sans-serif] text-[14px] font-extrabold text-[var(--text-primary)]">Pasiūlyti dieną dainą</span>
          <button onClick={onClose} aria-label="Uždaryti" className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--bg-active)] text-[var(--text-secondary)]">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {!selected ? (
            <>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                autoFocus
                placeholder="Ieškoti dainos…"
                type="text"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                name="daina-paieska"
                style={{ fontSize: 16 }}
                className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-hover)] px-3 py-2.5 text-[var(--text-primary)] outline-none focus:border-[var(--accent-orange)]"
              />
              <div className="mt-2 flex flex-col gap-1.5">
                {results.map((t: any) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelected(t)}
                    className="flex items-center gap-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-hover)] p-2 text-left transition-colors hover:border-[var(--accent-orange)]"
                  >
                    <Cover src={t.image_url} artistSrc={t.image_url} alt={sanitizeTitle(t.title || '')} size={36} radius={6} />
                    <div className="min-w-0 flex-1">
                      <p className="m-0 truncate text-[12.5px] font-bold text-[var(--text-primary)]">{sanitizeTitle(t.title || '')}</p>
                      <p className="m-0 truncate text-[11px] text-[var(--text-muted)]">{t.artist_name || ''}</p>
                    </div>
                    <span className="shrink-0 text-[11px] font-bold text-[var(--accent-link)]">Rinktis →</span>
                  </button>
                ))}
                {searching && results.length === 0 && (
                  <p className="px-1 py-2 text-[11.5px] text-[var(--text-faint)]">Ieškoma…</p>
                )}
                {!searching && query.trim().length >= 2 && results.length === 0 && (
                  <p className="px-1 py-2 text-[11.5px] text-[var(--text-faint)]">Nieko nerasta — pabandyk kitą užklausą.</p>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2.5 rounded-lg border border-[var(--accent-orange)]/30 bg-[var(--accent-orange)]/10 p-2.5">
                <Cover src={selected.image_url} artistSrc={selected.image_url} alt={sanitizeTitle(selected.title || '')} size={40} radius={8} />
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-[13px] font-extrabold text-[var(--text-primary)]">{sanitizeTitle(selected.title || '')}</p>
                  <p className="m-0 truncate text-[11.5px] text-[var(--text-muted)]">{selected.artist_name || ''}</p>
                </div>
                <button onClick={() => setSelected(null)} className="shrink-0 text-[11px] text-[var(--text-faint)] hover:text-[var(--text-primary)]">Keisti</button>
              </div>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                rows={3}
                placeholder="Kodėl ši daina? (neprivaloma)"
                style={{ fontSize: 16 }}
                className="mt-3 w-full resize-none rounded-lg border border-[var(--border-default)] bg-[var(--bg-hover)] px-3 py-2.5 text-[var(--text-primary)] outline-none focus:border-[var(--accent-orange)]"
              />
              {error && <p className="m-0 mt-2 text-[11px] text-[var(--accent-red)]">{error}</p>}
              <button
                onClick={submit}
                disabled={sending}
                className="mt-3 w-full rounded-xl bg-[var(--accent-orange)] py-3 text-[13px] font-extrabold text-white shadow-[0_3px_14px_rgba(249,115,22,0.35)] transition-transform hover:-translate-y-px disabled:opacity-50"
              >
                {sending ? 'Siunčiama…' : 'Pasiūlyti dainą'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ───────────────────────── winner card ─────────────────────────
function DainaWinnerCard({ w, onOpenTrack, maxVotes = 1, compact = false }: { w: DainaWinner; onOpenTrack: (t: any) => void; maxVotes?: number; compact?: boolean }) {
  const t = w.tracks
  if (!t) return null
  const v = extractYouTubeId(t.video_url)
  const ytThumb = v ? `https://img.youtube.com/vi/${v}/mqdefault.jpg` : null
  const imgSrc = t.cover_url || ytThumb || t.artists?.cover_image_url || null
  const votes = w.weighted_votes || w.total_votes || 0
  const level = votes > 0 ? Math.max(1, Math.round((votes / Math.max(1, maxVotes)) * 5)) : 0
  return (
    <div className="group flex shrink-0 flex-col" style={{ width: compact ? 150 : 188 }}>
      <button
        type="button"
        onClick={() => onOpenTrack({ id: t.id, title: t.title, slug: t.slug, cover_url: t.cover_url, video_url: t.video_url, artists: t.artists })}
        className="block no-underline text-left p-0 bg-transparent border-0 cursor-pointer"
      >
        <div className="relative aspect-video overflow-hidden rounded-xl border bg-[var(--cover-placeholder)] shadow-[0_4px_12px_rgba(0,0,0,0.25)] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-[0_14px_32px_rgba(249,115,22,0.18)]" style={{ borderColor: 'rgba(249,115,22,0.5)' }}>
          {imgSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proxyImg(imgSrc)} alt={sanitizeTitle(t.title)} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" style={{ filter: 'saturate(1.05) contrast(1.02)' }} />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl text-[var(--text-faint)]">🎵</div>
          )}
        </div>
        {!compact && <DainaPopBar level={level} />}
        <div className={compact ? 'mt-1.5 px-0.5' : 'mt-1 px-0.5'}>
          <p className="m-0 truncate font-['Outfit',sans-serif] text-[12.5px] font-extrabold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">{sanitizeTitle(t.title)}</p>
          <p className="m-0 mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{t.artists?.name}</p>
        </div>
      </button>
      {!compact && w.proposer && <div className="mt-1.5 px-0.5"><ProposerLine p={w.proposer} /></div>}
      {!compact && w.winning_comment && <p className="m-0 mt-1 px-0.5 line-clamp-2 text-[10.5px] italic text-[var(--text-muted)]">„{w.winning_comment}"</p>}
    </div>
  )
}

// ───────────────────────── past-day nomination card (read-only) ─────────────────────────
// Vakar dienos „geriausiai pasirodžiusios" dainos — be balsavimo (diena baigta).
function PastNomCard({ n, onOpenTrack, maxVotes = 1, compact = false }: { n: Nomination; onOpenTrack: (t: any) => void; maxVotes?: number; compact?: boolean }) {
  const t = n.tracks
  if (!t) return null
  const v = extractYouTubeId(t.video_url)
  const ytThumb = v ? `https://img.youtube.com/vi/${v}/mqdefault.jpg` : null
  const imgSrc = t.cover_url || ytThumb || t.artists?.cover_image_url || null
  const votes = n.weighted_votes || n.votes || 0
  const level = votes > 0 ? Math.max(1, Math.round((votes / Math.max(1, maxVotes)) * 5)) : 0
  return (
    <div className="group flex shrink-0 flex-col" style={{ width: compact ? 150 : 188 }}>
      <button
        type="button"
        onClick={() => onOpenTrack({ id: t.id, title: t.title, slug: t.slug, cover_url: t.cover_url, video_url: t.video_url, artists: t.artists })}
        className="block cursor-pointer border-0 bg-transparent p-0 text-left no-underline"
      >
        <div className="relative aspect-video overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--cover-placeholder)] shadow-[0_4px_12px_rgba(0,0,0,0.25)] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-[rgba(249,115,22,0.5)] group-hover:shadow-[0_14px_32px_rgba(249,115,22,0.18)]">
          {imgSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proxyImg(imgSrc)} alt={sanitizeTitle(t.title)} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" style={{ filter: 'saturate(1.05) contrast(1.02)' }} />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl text-[var(--text-faint)]">🎵</div>
          )}
        </div>
        {!compact && <DainaPopBar level={level} />}
        <div className={compact ? 'mt-1.5 px-0.5' : 'mt-1 px-0.5'}>
          <p className="m-0 truncate font-['Outfit',sans-serif] text-[12.5px] font-extrabold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">{sanitizeTitle(t.title)}</p>
          <p className="m-0 mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{t.artists?.name}</p>
        </div>
      </button>
      <p className="m-0 mt-1 px-0.5 text-[10.5px] font-bold text-[var(--text-faint)]">{votes} {votes === 1 ? 'taškas' : votes % 10 >= 2 && votes % 10 <= 9 && !(votes >= 11 && votes <= 19) ? 'taškai' : 'taškų'}</p>
      {!compact && n.proposer && <div className="mt-1 px-0.5"><ProposerLine p={n.proposer} /></div>}
    </div>
  )
}

// ───────────────────────── main section ─────────────────────────
export function DienosDainaSection({ onOpenTrack, variant = 'inline', headerVariant = 'plain' }: { onOpenTrack?: (t: any) => void; variant?: 'inline' | 'stacked'; headerVariant?: 'plain' | 'row' }) {
  const [noms, setNoms] = useState<Nomination[]>([])
  const [winner, setWinner] = useState<DainaWinner | null>(null)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [alreadyNominated, setAlreadyNominated] = useState(false)
  const [ydayOpen, setYdayOpen] = useState(false)
  const [ydayNoms, setYdayNoms] = useState<Nomination[]>([])
  const [ydayLoading, setYdayLoading] = useState(false)
  const [votedIds, setVotedIds] = useState<Set<number>>(new Set())
  const [voting, setVoting] = useState<number | null>(null)
  const [voteErr, setVoteErr] = useState('')
  // Vidinis track modalas — naudojamas tik kai tėvas nepaduoda onOpenTrack.
  const [innerTrack, setInnerTrack] = useState<any | null>(null)
  const openTrack = onOpenTrack || setInnerTrack

  const load = useCallback(() => {
    Promise.all([
      fetch('/api/dienos-daina/nominations').then(r => r.json()).catch(() => ({})),
      fetch('/api/dienos-daina/winners?limit=1').then(r => r.json()).catch(() => ({})),
    ]).then(([n, w]) => {
      setNoms(n.nominations || [])
      setAlreadyNominated(!!n.already_nominated)
      setWinner((w.winners && w.winners[0]) || null)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const openYesterday = useCallback(() => {
    if (!winner?.date) return
    setYdayOpen(true); setYdayLoading(true)
    fetch(`/api/dienos-daina/nominations?date=${winner.date}`)
      .then(r => r.json())
      .then(d => setYdayNoms(d.nominations || []))
      .catch(() => setYdayNoms([]))
      .finally(() => setYdayLoading(false))
  }, [winner])

  useEffect(() => {
    fetch('/api/dienos-daina/votes')
      .then(r => r.json())
      .then(d => setVotedIds(new Set<number>(d.voted_nomination_ids || [])))
      .catch(() => {})
  }, [])

  // „stacked" varianto (/atrasti) atveju vakar dienos pasiūlymus įkeliam iškart —
  // jie rodomi atskira juosta po šiandienos kandidatais (ne tik modale).
  useEffect(() => {
    if (variant !== 'stacked' || !winner?.date) return
    setYdayLoading(true)
    fetch(`/api/dienos-daina/nominations?date=${winner.date}`)
      .then(r => r.json())
      .then(d => setYdayNoms(d.nominations || []))
      .catch(() => setYdayNoms([]))
      .finally(() => setYdayLoading(false))
  }, [variant, winner?.date])

  const handleVote = useCallback(async (id: number) => {
    if (votedIds.has(id) || voting !== null) return
    setVoting(id); setVoteErr('')
    try {
      const res = await fetch('/api/dienos-daina/votes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nomination_id: id }),
      })
      const d = await res.json()
      if (res.ok) {
        const wt = d.weight || 1
        setVotedIds(prev => { const next = new Set(prev); next.add(id); return next })
        setNoms(prev => prev.map(n => n.id === id ? { ...n, votes: (n.votes || 0) + 1, weighted_votes: (n.weighted_votes || 0) + wt } : n))
      } else {
        setVoteErr(d.error || 'Klaida'); setTimeout(() => setVoteErr(''), 3000)
      }
    } catch {
      setVoteErr('Tinklo klaida'); setTimeout(() => setVoteErr(''), 3000)
    } finally {
      setVoting(null)
    }
  }, [votedIds, voting])

  const sorted = [...noms].filter(n => n.tracks).sort((a, b) => (b.weighted_votes || b.votes || 0) - (a.weighted_votes || a.votes || 0))
  const maxVotes = Math.max(1, ...sorted.map(n => n.weighted_votes || n.votes || 0))

  // Vakar dienos geriausiai pasirodžiusios (stacked variantui) — be laimėtojo.
  const ydaySorted = [...ydayNoms].filter(n => n.tracks).sort((a, b) => (b.weighted_votes || b.votes || 0) - (a.weighted_votes || a.votes || 0))
  const winnerTrackId = winner?.tracks?.id
  const ydayBest = ydaySorted.filter(n => n.tracks!.id !== winnerTrackId).slice(0, 12)
  const ydayMax = Math.max(1, winner?.weighted_votes || winner?.total_votes || 0, ...ydaySorted.map(n => n.weighted_votes || n.votes || 0))

  // headerVariant='row' — vientisas stilius su kitomis /atrasti eilėmis (accent bar
  // + section-title-size + „Visi →"). 'plain' — homepage stilius (didelis h2).
  const SectionHeader = headerVariant === 'row' ? (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span style={{ width: 4, height: 18, borderRadius: 3, background: '#f97316' }} />
        <h2 className="m-0 font-['Outfit',sans-serif] font-extrabold text-[var(--text-primary)]" style={{ fontSize: 'var(--section-title-size)', letterSpacing: 'var(--section-title-tracking)' }}>Dienos daina</h2>
      </div>
      {sorted.length > 0 && (
        <button type="button" onClick={() => setModalOpen(true)} className="shrink-0 cursor-pointer border-0 bg-transparent p-0 font-['Outfit',sans-serif] text-[12px] font-bold text-[var(--accent-orange)] no-underline transition-opacity hover:opacity-70">Visi →</button>
      )}
    </div>
  ) : (
    <div className="mb-3.5 flex items-center justify-between gap-3">
      <h2 className="m-0 font-['Outfit',sans-serif] text-[17px] font-extrabold tracking-[-0.01em] text-[var(--text-primary)] sm:text-[18px]">Dienos daina</h2>
      {sorted.length > 0 && (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          aria-label="Visas siūlomų dainų sąrašas"
          title="Visas sąrašas"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:text-[var(--accent-orange)] sm:hidden"
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="14" y2="17" /></svg>
        </button>
      )}
    </div>
  )

  if (loading) {
    return (
      <>
        <div className="mb-3.5 flex items-center justify-between gap-3">
          <h2 className="m-0 font-['Outfit',sans-serif] text-[17px] font-extrabold tracking-[-0.01em] text-[var(--text-primary)] sm:text-[18px]">Dienos daina</h2>
        </div>
        <div className="hp-scroll flex items-stretch gap-3 overflow-x-auto pt-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {Array(6).fill(null).map((_, i) => (
            <div key={i} className="shrink-0" style={{ width: 200 }}>
              <Skel w={200} h={112} r={12} />
              <div className="mt-2"><Skel w="80%" h={12} /></div>
              <div className="mt-1"><Skel w="55%" h={10} /></div>
              <div className="mt-2"><Skel w="100%" h={28} r={8} /></div>
            </div>
          ))}
        </div>
      </>
    )
  }

  const NomCard = ({ n, compact = false }: { n: Nomination; idx?: number; compact?: boolean }) => {
    const t = n.tracks!
    const votes = n.weighted_votes || n.votes || 0
    const level = votes > 0 ? Math.max(1, Math.round((votes / maxVotes) * 5)) : 0
    const v = extractYouTubeId(t.video_url)
    const ytThumb = v ? `https://img.youtube.com/vi/${v}/mqdefault.jpg` : null
    const imgSrc = t.cover_url || ytThumb || t.artists?.cover_image_url || null
    const isVotedThis = votedIds.has(n.id)
    return (
      <div className="group flex shrink-0 flex-col" style={{ width: compact ? 150 : 188 }}>
        <button
          type="button"
          onClick={() => openTrack({ id: t.id, title: t.title, slug: t.slug, cover_url: t.cover_url, video_url: t.video_url, artists: t.artists })}
          className="block no-underline text-left p-0 bg-transparent border-0 cursor-pointer"
        >
          <div className="relative aspect-video overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--cover-placeholder)] shadow-[0_4px_12px_rgba(0,0,0,0.25)] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-[rgba(249,115,22,0.5)] group-hover:shadow-[0_14px_32px_rgba(249,115,22,0.18)]">
            {imgSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={proxyImg(imgSrc)} alt={sanitizeTitle(t.title)} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" style={{ filter: 'saturate(1.05) contrast(1.02)' }} />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl text-[var(--text-faint)]">🎵</div>
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[rgba(249,115,22,0.12)] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          </div>
          {!compact && <DainaPopBar level={level} />}
          <div className={compact ? 'mt-1.5 px-0.5' : 'mt-1 px-0.5'}>
            <p className="m-0 truncate font-['Outfit',sans-serif] text-[12.5px] font-extrabold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">{sanitizeTitle(t.title)}</p>
            <p className="m-0 mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{t.artists?.name}</p>
          </div>
        </button>
        {!compact && n.proposer && <div className="mt-1.5 px-0.5"><ProposerLine p={n.proposer} /></div>}
        {!n.own && (
          <div className="mt-1.5 px-0.5">
            <button
              type="button"
              onClick={() => handleVote(n.id)}
              disabled={isVotedThis || voting !== null}
              className={`block w-full rounded-full py-[3px] font-['Outfit',sans-serif] text-[10.5px] font-extrabold transition-all ${
                isVotedThis ? 'cursor-default' : voting !== null ? 'opacity-60' : 'hover:bg-[rgba(249,115,22,0.12)]'
              }`}
              style={{
                background: isVotedThis ? 'rgba(249,115,22,0.14)' : 'transparent',
                color: 'var(--accent-orange)',
                border: '1px solid rgba(249,115,22,0.4)',
              }}
            >
              {voting === n.id ? '…' : isVotedThis ? '✓ Balsuota' : 'Balsuoti'}
            </button>
          </div>
        )}
        {n.comment && <p className="m-0 mt-1 px-0.5 line-clamp-2 text-[10.5px] italic text-[var(--text-muted)]">„{n.comment}"</p>}
      </div>
    )
  }

  // Suggest („Pasiūlyti dainą") kortelė — bendra abiem variantams.
  const SuggestCard = !alreadyNominated ? (
    <button
      type="button"
      onClick={() => setSuggestOpen(true)}
      className="group flex shrink-0 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--border-default)] bg-[var(--bg-surface)] text-center transition-all hover:-translate-y-0.5 hover:border-[rgba(249,115,22,0.5)] hover:bg-[rgba(249,115,22,0.05)]"
      style={{ width: 188, minHeight: 178 }}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[rgba(249,115,22,0.12)] font-['Outfit',sans-serif] text-[24px] font-bold leading-none text-[var(--accent-orange)] transition-colors group-hover:bg-[var(--accent-orange)] group-hover:text-white">+</span>
      <span className="px-3 font-['Outfit',sans-serif] text-[12.5px] font-extrabold text-[var(--text-primary)]">Pasiūlyti dainą</span>
      <span className="px-3 text-[10.5px] text-[var(--text-muted)]">Pridėk savo kandidatą</span>
    </button>
  ) : null

  // hp-scroll su breathing room viršuje (kad hover'io -translate-y nenukirptų kraštinės).
  const ROW = 'hp-scroll flex items-stretch gap-3 overflow-x-auto pt-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'

  return (
    <>
      {SectionHeader}

      {variant === 'stacked' ? (
        // ── /atrasti: dvi atskiros juostos — šiandien siūloma + vakar ──
        <>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <span className="font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-faint)]">Šiandien siūloma</span>
            {voteErr && <span className="text-[11px] font-bold text-[var(--accent-red,#ef4444)]">{voteErr}</span>}
          </div>
          <div className="flex items-stretch gap-3">
            <div className={ROW + ' min-w-0 flex-1'}>
              {sorted.length === 0 && (
                <div className="flex items-center px-1 text-[12px] text-[var(--text-muted)]">Šiandien dar nėra pasiūlymų — būk pirmas.</div>
              )}
              {sorted.slice(0, 14).map((n) => <NomCard key={n.id} n={n} compact />)}
              {SuggestCard}
            </div>
            {sorted.length > 6 && (
              <div className="flex items-center">
                <StickyMoreButton count={sorted.length} height={150} ariaLabel={`Žiūrėti visus (${sorted.length})`} onClick={() => setModalOpen(true)} />
              </div>
            )}
          </div>

          {winner?.tracks && (
            <div className="mt-3.5 border-t border-[var(--border-default)] pt-3.5">
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className="min-w-0 truncate">
                  <span className="font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--accent-orange)]">Vakar laimėjo</span>
                  <span className="ml-1.5 text-[10.5px] text-[var(--text-faint)]">ir geriausiai pasirodžiusios</span>
                </span>
                {ydayBest.length > 0 && (
                  <button type="button" onClick={openYesterday} className="shrink-0 cursor-pointer border-0 bg-transparent p-0 font-['Outfit',sans-serif] text-[12px] font-bold text-[var(--accent-orange)] no-underline transition-opacity hover:opacity-70">Visi →</button>
                )}
              </div>
              <div className={ROW}>
                <DainaWinnerCard w={winner} onOpenTrack={openTrack} maxVotes={ydayMax} compact />
                {(ydayBest.length > 0 || ydayLoading) && (
                  <div className="flex shrink-0 items-stretch self-stretch px-1"><div className="w-px self-stretch bg-[var(--border-default)]" /></div>
                )}
                {ydayLoading && ydayBest.length === 0 ? (
                  Array(4).fill(null).map((_, i) => (
                    <div key={i} className="shrink-0" style={{ width: 150 }}><Skel w={150} h={84} r={12} /><div className="mt-2"><Skel w="80%" h={12} /></div></div>
                  ))
                ) : (
                  ydayBest.map((n) => <PastNomCard key={n.id} n={n} onOpenTrack={openTrack} maxVotes={ydayMax} compact />)
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        // ── homepage: viena juosta (laimėtojas inline) ──
        <>
          {winner?.tracks ? (
            <div className="mb-2 flex items-end gap-3">
              <div style={{ width: 188 }} className="flex shrink-0 items-center gap-1.5 px-0.5">
                <span className="font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--accent-orange)]">Vakar laimėjo</span>
                <button type="button" onClick={openYesterday} aria-label="Visi vakar dienos pasiūlymai" title="Visi vakar dienos pasiūlymai" className="flex h-4 w-4 items-center justify-center rounded text-[var(--text-faint)] transition-colors hover:text-[var(--accent-orange)]">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="14" y2="17" /></svg>
                </button>
              </div>
              <div className="shrink-0" style={{ width: 9 }} />
              <div className="flex flex-1 items-center justify-between gap-3">
                <span className="font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-faint)]">Šiandien siūloma</span>
                {voteErr && <span className="text-[11px] font-bold text-[var(--accent-red,#ef4444)]">{voteErr}</span>}
              </div>
            </div>
          ) : voteErr ? (
            <div className="mb-2 text-[11.5px] font-bold text-[var(--accent-red,#ef4444)]">{voteErr}</div>
          ) : null}

          <div className="flex items-stretch gap-3">
            <div className="hp-scroll flex flex-1 min-w-0 items-stretch gap-3 overflow-x-auto pt-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {winner?.tracks && (
                <>
                  <DainaWinnerCard w={winner} onOpenTrack={openTrack} maxVotes={maxVotes} />
                  <div className="flex shrink-0 items-stretch self-stretch px-1">
                    <div className="w-px self-stretch bg-[var(--border-default)]" />
                  </div>
                </>
              )}

              {sorted.slice(0, 14).map((n) => <NomCard key={n.id} n={n} />)}
              {SuggestCard}
            </div>
            {sorted.length > 6 && (
              <StickyMoreButton
                count={sorted.length}
                height={190}
                ariaLabel={`Žiūrėti visus (${sorted.length})`}
                onClick={() => setModalOpen(true)}
              />
            )}
          </div>
        </>
      )}

      {modalOpen && (
        <HomeListModal open onClose={() => setModalOpen(false)} title="Dienos daina" subtitle="Šiandienos kandidatai pagal balsus">
          {winner?.tracks && (
            <div className="mb-4">
              <p className="mb-2 font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--accent-orange)]">Vakar laimėjo</p>
              <DainaWinnerCard w={winner} onOpenTrack={(t) => { setModalOpen(false); openTrack(t) }} maxVotes={maxVotes} />
            </div>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {sorted.map((n, idx) => {
              const t = n.tracks!
              const votes = n.weighted_votes || n.votes || 0
              const level = votes > 0 ? Math.max(1, Math.round((votes / maxVotes) * 5)) : 0
              const isVotedThis = votedIds.has(n.id)
              return (
                <div key={n.id} className="hp-card group flex items-start gap-3 p-3 text-left">
                  <button
                    type="button"
                    onClick={() => { setModalOpen(false); openTrack({ id: t.id, title: t.title, slug: t.slug, cover_url: t.cover_url, video_url: t.video_url, artists: t.artists }) }}
                    className="flex min-w-0 flex-1 items-start gap-3 border-0 bg-transparent p-0 text-left cursor-pointer"
                  >
                    <div className="relative shrink-0">
                      <Cover src={t.cover_url} ytId={extractYouTubeId(t.video_url)} artistSrc={t.artists?.cover_image_url} alt={sanitizeTitle(t.title)} size={56} radius={8} />
                      {idx < 3 && <span className="absolute -left-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-orange)] text-[10px] font-black text-white">{idx + 1}</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="m-0 line-clamp-1 font-['Outfit',sans-serif] text-[13.5px] font-extrabold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">{sanitizeTitle(t.title)}</p>
                      <p className="m-0 truncate text-[11.5px] text-[var(--text-muted)]">{t.artists?.name}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="flex items-center gap-[3px]" aria-hidden>
                          {Array.from({ length: 5 }).map((_, i) => (
                            <span key={i} className={`h-[3px] w-[14px] rounded-[2px] ${i < level ? 'bg-[var(--accent-orange)]' : 'bg-[var(--border-default)]'}`} />
                          ))}
                        </span>
                        <span className="shrink-0 text-[10px] font-bold text-[var(--text-faint)]">{votes} bal.</span>
                      </div>
                      <div className="mt-1"><ProposerLine p={n.proposer} /></div>
                      {((n.voters && n.voters.length > 0) || (n.anon_votes || 0) > 0) && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-[var(--text-faint)]">Balsavo:</span>
                          <span className="flex -space-x-1.5">
                            {(n.voters || []).slice(0, 5).map((vp, i) => {
                              const nm = vp.full_name || vp.username || '?'
                              return vp.avatar_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={i} src={proxyImg(vp.avatar_url)} alt={nm} title={nm} className="h-[18px] w-[18px] rounded-full border border-[var(--bg-surface)] object-cover" />
                              ) : (
                                <span key={i} title={nm} className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-[var(--bg-surface)] text-[8px] font-extrabold" style={{ background: `hsl(${strHue(nm)},32%,20%)`, color: `hsl(${strHue(nm)},48%,58%)` }}>{nm.charAt(0).toUpperCase()}</span>
                              )
                            })}
                          </span>
                          {(() => {
                            const extra = Math.max(0, (n.voters?.length || 0) - 5) + (n.anon_votes || 0)
                            return extra > 0 ? <span className="text-[10px] text-[var(--text-faint)]">+{extra}</span> : null
                          })()}
                        </div>
                      )}
                      {n.comment && <p className="m-0 mt-1.5 line-clamp-2 text-[11px] italic text-[var(--text-muted)]">„{n.comment}"</p>}
                    </div>
                  </button>
                  {n.own ? (
                    <span className="shrink-0 self-center rounded-lg border border-dashed border-[var(--border-default)] px-3 py-2 font-['Outfit',sans-serif] text-[10.5px] font-bold text-[var(--text-faint)]">Tavo</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleVote(n.id)}
                      disabled={isVotedThis || voting !== null}
                      className={`shrink-0 self-center rounded-lg px-3 py-2 font-['Outfit',sans-serif] text-[11.5px] font-extrabold transition-all ${
                        isVotedThis ? 'cursor-default' : voting !== null ? 'opacity-60' : 'hover:-translate-y-px'
                      }`}
                      style={{
                        background: isVotedThis ? 'rgba(249,115,22,0.15)' : 'var(--accent-orange)',
                        color: isVotedThis ? 'var(--accent-orange)' : '#fff',
                        border: isVotedThis ? '1px solid rgba(249,115,22,0.4)' : '1px solid transparent',
                      }}
                    >
                      {voting === n.id ? '…' : isVotedThis ? '✓' : 'Balsuoti'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </HomeListModal>
      )}

      {ydayOpen && (
        <HomeListModal open onClose={() => setYdayOpen(false)} title="Vakar dienos pasiūlymai" subtitle={winner?.date ? `${winner.date} · pagal balsus` : null}>
          {ydayLoading ? (
            <div className="py-8 text-center text-[12px] text-[var(--text-muted)]">Kraunama…</div>
          ) : ydayNoms.filter(n => n.tracks).length === 0 ? (
            <div className="py-8 text-center text-[12px] text-[var(--text-muted)]">Vakar pasiūlymų nerasta.</div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[...ydayNoms].filter(n => n.tracks).sort((a, b) => (b.weighted_votes || b.votes || 0) - (a.weighted_votes || a.votes || 0)).map((n, idx) => {
                const t = n.tracks!
                const votes = n.weighted_votes || n.votes || 0
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => { setYdayOpen(false); openTrack({ id: t.id, title: t.title, slug: t.slug, cover_url: t.cover_url, video_url: t.video_url, artists: t.artists }) }}
                    className={`hp-card group flex items-start gap-3 p-3 text-left ${idx === 0 ? 'border-[rgba(249,115,22,0.45)]' : ''}`}
                  >
                    <Cover src={t.cover_url} ytId={extractYouTubeId(t.video_url)} artistSrc={t.artists?.cover_image_url} alt={sanitizeTitle(t.title)} size={56} radius={8} />
                    <div className="min-w-0 flex-1">
                      <p className="m-0 line-clamp-1 font-['Outfit',sans-serif] text-[13.5px] font-extrabold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">{sanitizeTitle(t.title)}{idx === 0 && <span className="ml-1.5 rounded-full bg-[var(--accent-orange)] px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-white">Laimėjo</span>}</p>
                      <p className="m-0 truncate text-[11.5px] text-[var(--text-muted)]">{t.artists?.name}</p>
                      <p className="m-0 mt-1 text-[11px] font-bold text-[var(--text-secondary)]">{votes} {votes === 1 ? 'taškas' : votes < 10 ? 'taškai' : 'taškų'}</p>
                      <div className="mt-1"><ProposerLine p={n.proposer} /></div>
                      {((n.voters && n.voters.length > 0) || (n.anon_votes || 0) > 0) && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-[var(--text-faint)]">Balsavo:</span>
                          <span className="flex -space-x-1.5">
                            {(n.voters || []).slice(0, 6).map((vp, i) => {
                              const nm = vp.full_name || vp.username || '?'
                              return vp.avatar_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={i} src={proxyImg(vp.avatar_url)} alt={nm} title={nm} className="h-[18px] w-[18px] rounded-full border border-[var(--bg-surface)] object-cover" />
                              ) : (
                                <span key={i} title={nm} className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-[var(--bg-surface)] text-[8px] font-extrabold" style={{ background: `hsl(${strHue(nm)},32%,20%)`, color: `hsl(${strHue(nm)},48%,58%)` }}>{nm.charAt(0).toUpperCase()}</span>
                              )
                            })}
                          </span>
                          {(() => {
                            const extra = Math.max(0, (n.voters?.length || 0) - 6) + (n.anon_votes || 0)
                            return extra > 0 ? <span className="text-[10px] text-[var(--text-faint)]">+{extra} svečių</span> : null
                          })()}
                        </div>
                      )}
                      {n.comment && <p className="m-0 mt-1.5 line-clamp-2 text-[11px] italic text-[var(--text-muted)]">„{n.comment}"</p>}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </HomeListModal>
      )}

      {suggestOpen && <DainaSuggestModal onClose={() => setSuggestOpen(false)} onDone={load} />}
      {/* Vidinis track modalas (tik kai tėvas nepaduoda onOpenTrack — pvz. /atrasti). */}
      {!onOpenTrack && innerTrack && <HomeTrackModal track={innerTrack} onClose={() => setInnerTrack(null)} />}
    </>
  )
}

export default DienosDainaSection
