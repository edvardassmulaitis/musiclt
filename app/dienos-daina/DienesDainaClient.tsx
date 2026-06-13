'use client'

/**
 * DienesDainaClient — /dienos-daina puslapio redizainas (2026-06-14).
 *
 * Tikslas (Edvardo prašymu): puslapis turi atrodyti taip pat „gražiai" kaip
 * /atrasti Dienos dainos sprendimas — vaizdo-miniatiūros kortelės, JOKIO
 * Spotify player'io. Išdėstymas dviem kolonomis (desktop):
 *
 *   - Kairė (main): ŠIANDIEN siūloma (kortelių tinklelis + balsavimas) ir
 *     VAKAR laimėjo (laimėtojo kortelė + visi tos dienos dalyviai).
 *   - Dešinė (sidebar): ankstesni laimėtojai — naudoja visą aukštį (sticky,
 *     vidinis scroll). Paspaudus seną dieną → atsidaro tos dienos OVERVIEW
 *     modalas: kas kandidatavo, balsai, balsuotojai, komentarai.
 *
 * Track click → HomeTrackModal (turtingas modalas su YT grotuvu, ne Spotify).
 * „Pasiūlyti dainą" → DainaSuggestModal (bendras su /atrasti).
 */

import { useState, useEffect, useCallback } from 'react'
import { proxyImg } from '@/lib/img-proxy'
import { HomeTrackModal } from '@/components/HomeTrackModal'
import { HomeListModal } from '@/components/HomeListModal'
import { DainaSuggestModal } from '@/components/DienosDainaSection'

// ── types ──────────────────────────────────────────────────────────────

type Artist = { id: number; slug: string; name: string; cover_image_url: string | null }
type Track = { id: number; slug: string; title: string; cover_url: string | null; spotify_id: string | null; video_url: string | null; artists: Artist | null }
type Proposer = { username: string | null; full_name: string | null; avatar_url: string | null }
type Nomination = {
  id: number; date: string; comment: string | null; created_at: string; user_id: string
  votes: number; weighted_votes: number
  tracks: Track | null
  proposer?: Proposer | null
  voters?: Proposer[]
  anon_votes?: number
  own?: boolean
}
type Winner = {
  id: number; date: string; total_votes: number; weighted_votes: number
  winning_comment: string | null; winning_user_id: string | null
  tracks: Track | null
  proposer?: Proposer | null
}

// ── helpers ─────────────────────────────────────────────────────────────

function strHue(s: string) { let h = 0; for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h }
function sanitizeTitle(raw: string): string {
  return (raw || '').replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim()
}
function proposerName(p?: Proposer | null): string | null {
  if (!p) return null
  return p.full_name || p.username || null
}
function extractYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?\s]{11})/)
  return m?.[1] || null
}
function trackImg(t: Track | null | undefined): string | null {
  if (!t) return null
  if (t.cover_url) return t.cover_url
  const ytId = extractYouTubeId(t.video_url)
  if (ytId) return `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`
  return t.artists?.cover_image_url || null
}
function votesWord(v: number): string {
  if (v === 1) return 'taškas'
  const lastTwo = v % 100
  const last = v % 10
  if (last >= 2 && last <= 9 && !(lastTwo >= 11 && lastTwo <= 19)) return 'taškai'
  return 'taškų'
}
function formatDateLong(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
}
function formatDateCompact(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('lt-LT', { month: 'short', day: 'numeric' })
}

// ── small UI atoms ──────────────────────────────────────────────────────

function Cover({ src, alt, size = 44, radius = 10 }: { src?: string | null; alt: string; size?: number; radius?: number }) {
  const h = strHue(alt)
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={proxyImg(src)} alt={alt} loading="lazy" style={{ width: size, height: size, borderRadius: radius, objectFit: 'cover', flexShrink: 0, display: 'block' }} />
  }
  return (
    <div style={{ width: size, height: size, borderRadius: radius, flexShrink: 0, background: `linear-gradient(135deg, hsl(${h},38%,16%), hsl(${(h + 40) % 360},28%,10%))`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: `hsl(${h},45%,45%)`, fontSize: size * 0.38, fontWeight: 800 }}>
      {alt[0]?.toUpperCase() || '?'}
    </div>
  )
}

function PopBar({ level }: { level: number }) {
  return (
    <span className="flex items-center gap-[3px]" aria-label={`Balsų lygis ${level}/5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={`h-[3px] w-[13px] rounded-[2px] ${i < level ? 'bg-[var(--accent-orange)]' : 'bg-[var(--border-default)]'}`} />
      ))}
    </span>
  )
}

function ProposerLine({ p }: { p?: Proposer | null }) {
  const name = proposerName(p)
  if (!name) return null
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {p?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={proxyImg(p.avatar_url)} alt="" className="h-[15px] w-[15px] shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full text-[7.5px] font-extrabold" style={{ background: `hsl(${strHue(name)},32%,20%)`, color: `hsl(${strHue(name)},48%,58%)` }}>{name.charAt(0).toUpperCase()}</span>
      )}
      <span className="truncate text-[11px] font-semibold text-[var(--text-secondary)]">{name}</span>
    </span>
  )
}

function VoterStack({ voters, anon }: { voters?: Proposer[]; anon?: number }) {
  if ((!voters || voters.length === 0) && !anon) return null
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <span className="text-[10px] font-bold text-[var(--text-faint)]">Balsavo:</span>
      <span className="flex -space-x-1.5">
        {(voters || []).slice(0, 6).map((vp, i) => {
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
        const extra = Math.max(0, (voters?.length || 0) - 6) + (anon || 0)
        return extra > 0 ? <span className="text-[10px] text-[var(--text-faint)]">+{extra}</span> : null
      })()}
    </div>
  )
}

// ── Countdown ───────────────────────────────────────────────────────────

function Countdown() {
  const [txt, setTxt] = useState('')
  useEffect(() => {
    const tick = () => {
      const n = new Date()
      const m = new Date(n)
      m.setHours(24, 0, 0, 0)
      const totalSec = Math.max(0, Math.floor((m.getTime() - n.getTime()) / 1000))
      const h = Math.floor(totalSec / 3600)
      const min = Math.floor((totalSec % 3600) / 60)
      const sec = totalSec % 60
      if (h >= 1) setTxt(min > 0 ? `~${h} val. ${min} min.` : `~${h} val.`)
      else setTxt(`${min}:${String(sec).padStart(2, '0')}`)
    }
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [])
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{txt}</span>
}

// ── Today's nomination card (votable) ───────────────────────────────────

function TodayCard({ n, maxVotes, isVoted, isVoting, onVote, onOpen }: {
  n: Nomination; maxVotes: number; isVoted: boolean; isVoting: boolean
  onVote: (id: number) => void; onOpen: (t: Track) => void
}) {
  const t = n.tracks
  if (!t) return null
  const img = trackImg(t)
  const votes = n.weighted_votes || n.votes || 0
  const level = votes > 0 ? Math.max(1, Math.round((votes / maxVotes) * 5)) : 0
  return (
    <div className="group flex flex-col">
      <button
        type="button"
        onClick={() => onOpen(t)}
        className="block cursor-pointer border-0 bg-transparent p-0 text-left no-underline"
      >
        <div className="relative aspect-video overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--cover-placeholder)] shadow-[0_4px_12px_rgba(0,0,0,0.25)] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-[rgba(249,115,22,0.5)] group-hover:shadow-[0_14px_32px_rgba(249,115,22,0.18)]">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proxyImg(img)} alt={sanitizeTitle(t.title)} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" style={{ filter: 'saturate(1.05) contrast(1.02)' }} />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl text-[var(--text-faint)]">🎵</div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[rgba(249,115,22,0.12)] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        </div>
      </button>
      <div className="mt-2 flex items-center justify-between gap-2 px-0.5">
        <PopBar level={level} />
        <span className="shrink-0 text-[10.5px] font-bold text-[var(--text-faint)]">{votes} {votesWord(votes)}</span>
      </div>
      <div className="mt-1.5 px-0.5">
        <p className="m-0 truncate font-['Outfit',sans-serif] text-[13.5px] font-extrabold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">{sanitizeTitle(t.title)}</p>
        <p className="m-0 mt-0.5 truncate text-[11.5px] text-[var(--text-muted)]">{t.artists?.name}</p>
      </div>
      {n.proposer && <div className="mt-1.5 px-0.5"><ProposerLine p={n.proposer} /></div>}
      {n.comment && <p className="m-0 mt-1 px-0.5 line-clamp-2 text-[11px] italic text-[var(--text-muted)]">„{n.comment}"</p>}
      <div className="mt-2 px-0.5">
        {n.own ? (
          <span className="block rounded-full border border-dashed border-[var(--border-default)] py-1.5 text-center font-['Outfit',sans-serif] text-[11px] font-bold text-[var(--text-faint)]">Tavo pasiūlymas</span>
        ) : (
          <button
            type="button"
            onClick={() => onVote(n.id)}
            disabled={isVoted || isVoting}
            className={`block w-full rounded-full py-1.5 font-['Outfit',sans-serif] text-[11.5px] font-extrabold transition-all ${isVoted ? 'cursor-default' : isVoting ? 'opacity-60' : 'hover:-translate-y-px'}`}
            style={{
              background: isVoted ? 'rgba(249,115,22,0.14)' : 'var(--accent-orange)',
              color: isVoted ? 'var(--accent-orange)' : '#fff',
              border: isVoted ? '1px solid rgba(249,115,22,0.4)' : '1px solid transparent',
            }}
          >
            {isVoting ? '…' : isVoted ? '✓ Balsavai' : 'Balsuoti'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Past (read-only) participant card ───────────────────────────────────

function PastCard({ n, maxVotes, onOpen, isWinner }: { n: Nomination; maxVotes: number; onOpen: (t: Track) => void; isWinner?: boolean }) {
  const t = n.tracks
  if (!t) return null
  const img = trackImg(t)
  const votes = n.weighted_votes || n.votes || 0
  const level = votes > 0 ? Math.max(1, Math.round((votes / maxVotes) * 5)) : 0
  return (
    <div className="group flex flex-col">
      <button type="button" onClick={() => onOpen(t)} className="block cursor-pointer border-0 bg-transparent p-0 text-left no-underline">
        <div className="relative aspect-video overflow-hidden rounded-xl border bg-[var(--cover-placeholder)] shadow-[0_4px_12px_rgba(0,0,0,0.25)] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-[0_14px_32px_rgba(249,115,22,0.18)]" style={{ borderColor: isWinner ? 'rgba(249,115,22,0.5)' : 'var(--border-default)' }}>
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proxyImg(img)} alt={sanitizeTitle(t.title)} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" style={{ filter: 'saturate(1.05) contrast(1.02)' }} />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl text-[var(--text-faint)]">🎵</div>
          )}
          {isWinner && <span className="absolute left-2 top-2 rounded-full bg-[var(--accent-orange)] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white shadow">Laimėjo</span>}
        </div>
      </button>
      <div className="mt-2 flex items-center justify-between gap-2 px-0.5">
        <PopBar level={level} />
        <span className="shrink-0 text-[10.5px] font-bold text-[var(--text-faint)]">{votes} {votesWord(votes)}</span>
      </div>
      <div className="mt-1.5 px-0.5">
        <p className="m-0 truncate font-['Outfit',sans-serif] text-[13.5px] font-extrabold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">{sanitizeTitle(t.title)}</p>
        <p className="m-0 mt-0.5 truncate text-[11.5px] text-[var(--text-muted)]">{t.artists?.name}</p>
      </div>
      {n.proposer && <div className="mt-1.5 px-0.5"><ProposerLine p={n.proposer} /></div>}
      {n.comment && <p className="m-0 mt-1 px-0.5 line-clamp-2 text-[11px] italic text-[var(--text-muted)]">„{n.comment}"</p>}
    </div>
  )
}

// ── History sidebar row (click → day overview) ──────────────────────────

function HistoryRow({ w, rank, onOpen }: { w: Winner; rank: number; onOpen: (w: Winner) => void }) {
  const t = w.tracks
  if (!t) return null
  const img = trackImg(t)
  const votes = w.weighted_votes || w.total_votes || 0
  return (
    <button
      type="button"
      onClick={() => onOpen(w)}
      className="group flex w-full items-center gap-3 rounded-xl border border-transparent p-2 text-left transition-all hover:border-[var(--border-default)] hover:bg-[var(--bg-hover)]"
    >
      <span className="w-4 shrink-0 text-center font-['Outfit',sans-serif] text-[12px] font-black text-[var(--text-faint)]">{rank}</span>
      <div className="relative shrink-0">
        <Cover src={img} alt={sanitizeTitle(t.title)} size={48} radius={9} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate font-['Outfit',sans-serif] text-[12.5px] font-extrabold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">{sanitizeTitle(t.title)}</p>
        <p className="m-0 truncate text-[11px] text-[var(--text-muted)]">{t.artists?.name}</p>
        <p className="m-0 mt-0.5 text-[10px] font-semibold text-[var(--text-faint)]">{formatDateCompact(w.date)} · {votes} {votesWord(votes)}</p>
      </div>
      <span className="shrink-0 text-[var(--text-faint)] opacity-0 transition-opacity group-hover:opacity-100">›</span>
    </button>
  )
}

// ── Day overview modal ──────────────────────────────────────────────────

function DayOverviewModal({ winner, onClose, onOpenTrack }: { winner: Winner; onClose: () => void; onOpenTrack: (t: Track) => void }) {
  const [noms, setNoms] = useState<Nomination[] | null>(null)
  useEffect(() => {
    let alive = true
    fetch(`/api/dienos-daina/nominations?date=${winner.date}`)
      .then(r => r.json())
      .then(d => { if (alive) setNoms(d.nominations || []) })
      .catch(() => { if (alive) setNoms([]) })
    return () => { alive = false }
  }, [winner.date])

  const sorted = (noms || []).filter(n => n.tracks).sort((a, b) => (b.weighted_votes || b.votes || 0) - (a.weighted_votes || a.votes || 0))
  const winnerTrackId = winner.tracks?.id

  return (
    <HomeListModal open onClose={onClose} title={`Dienos daina · ${formatDateLong(winner.date)}`} subtitle={noms ? `${sorted.length} ${sorted.length === 1 ? 'kandidatas' : 'kandidatai (-ų)'} · pagal balsus` : 'Kraunama…'}>
      {noms === null ? (
        <div className="py-10 text-center text-[12.5px] text-[var(--text-muted)]">Kraunama…</div>
      ) : sorted.length === 0 ? (
        <div className="py-10 text-center text-[12.5px] text-[var(--text-muted)]">Tos dienos kandidatų nerasta.</div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {sorted.map((n, idx) => {
            const t = n.tracks!
            const votes = n.weighted_votes || n.votes || 0
            const isW = t.id === winnerTrackId
            return (
              <div key={n.id} className={`hp-card group flex items-start gap-3 p-3 text-left ${isW ? 'border-[rgba(249,115,22,0.5)]' : ''}`}>
                <button
                  type="button"
                  onClick={() => { onClose(); onOpenTrack(t) }}
                  className="flex min-w-0 flex-1 items-start gap-3 cursor-pointer border-0 bg-transparent p-0 text-left"
                >
                  <div className="relative shrink-0">
                    <Cover src={trackImg(t)} alt={sanitizeTitle(t.title)} size={56} radius={9} />
                    {idx < 3 && <span className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-orange)] text-[10px] font-black text-white">{idx + 1}</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="m-0 line-clamp-1 font-['Outfit',sans-serif] text-[13.5px] font-extrabold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">
                      {sanitizeTitle(t.title)}
                      {isW && <span className="ml-1.5 rounded-full bg-[var(--accent-orange)] px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-white">Laimėjo</span>}
                    </p>
                    <p className="m-0 truncate text-[11.5px] text-[var(--text-muted)]">{t.artists?.name}</p>
                    <p className="m-0 mt-1 text-[11px] font-bold text-[var(--text-secondary)]">{votes} {votesWord(votes)}</p>
                    <div className="mt-1.5"><ProposerLine p={n.proposer} /></div>
                    <VoterStack voters={n.voters} anon={n.anon_votes} />
                    {n.comment && <p className="m-0 mt-1.5 line-clamp-2 text-[11px] italic text-[var(--text-muted)]">„{n.comment}"</p>}
                  </div>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </HomeListModal>
  )
}

// ── MAIN ───────────────────────────────────────────────────────────────

export default function DienesDainaClient({
  nominations: initialNominations,
  winners,
}: {
  nominations: Nomination[]
  winners: Winner[]
  today: string
  yesterday: string
}) {
  const [nominations, setNominations] = useState<Nomination[]>(initialNominations)
  const [votedIds, setVotedIds] = useState<Set<number>>(new Set())
  const [votingId, setVotingId] = useState<number | null>(null)
  const [voteError, setVoteError] = useState('')
  const [showSuggest, setShowSuggest] = useState(false)
  const [alreadyNominated, setAlreadyNominated] = useState(false)
  const [openTrack, setOpenTrack] = useState<Track | null>(null)
  const [overviewWinner, setOverviewWinner] = useState<Winner | null>(null)

  // Vakar dienos dalyviai (visi, ne tik laimėtojas).
  const [ydayNoms, setYdayNoms] = useState<Nomination[]>([])
  const [ydayLoading, setYdayLoading] = useState(false)

  const yesterdayWinner = winners[0] || null
  const history = winners.slice(1, 14)

  // Auto-open suggest from ?siulyti=1 (homepage CTA)
  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('siulyti') === '1') {
      setShowSuggest(true)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  // Užkrauk: balsai + ar jau pasiūlyta šiandien (kad UI paslėptų suggest CTA).
  useEffect(() => {
    fetch('/api/dienos-daina/votes').then(r => r.json()).then(d => setVotedIds(new Set<number>(d.voted_nomination_ids || []))).catch(() => {})
    fetch('/api/dienos-daina/nominations').then(r => r.json()).then(d => {
      if (Array.isArray(d.nominations)) setNominations(d.nominations)
      setAlreadyNominated(!!d.already_nominated)
    }).catch(() => {})
  }, [])

  // Vakar dienos pilni pasiūlymai (laimėtojo dienai).
  useEffect(() => {
    if (!yesterdayWinner?.date) return
    setYdayLoading(true)
    fetch(`/api/dienos-daina/nominations?date=${yesterdayWinner.date}`)
      .then(r => r.json())
      .then(d => setYdayNoms(d.nominations || []))
      .catch(() => setYdayNoms([]))
      .finally(() => setYdayLoading(false))
  }, [yesterdayWinner?.date])

  const handleVote = useCallback(async (nominationId: number) => {
    if (votedIds.has(nominationId) || votingId !== null) return
    setVotingId(nominationId); setVoteError('')
    try {
      const res = await fetch('/api/dienos-daina/votes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nomination_id: nominationId }),
      })
      const data = await res.json()
      if (res.ok) {
        const wt = data.weight || 1
        setVotedIds(prev => { const next = new Set(prev); next.add(nominationId); return next })
        setNominations(prev => prev.map(n => n.id === nominationId ? { ...n, votes: n.votes + 1, weighted_votes: n.weighted_votes + wt } : n))
      } else {
        setVoteError(data.error || 'Klaida'); setTimeout(() => setVoteError(''), 3000)
      }
    } catch {
      setVoteError('Tinklo klaida'); setTimeout(() => setVoteError(''), 3000)
    } finally {
      setVotingId(null)
    }
  }, [votedIds, votingId])

  const reloadToday = useCallback(() => {
    fetch('/api/dienos-daina/nominations').then(r => r.json()).then(d => {
      if (Array.isArray(d.nominations)) setNominations(d.nominations)
      setAlreadyNominated(!!d.already_nominated)
    }).catch(() => {})
  }, [])

  const sorted = [...nominations].filter(n => n.tracks).sort((a, b) => (b.weighted_votes || b.votes || 0) - (a.weighted_votes || a.votes || 0))
  const maxVotes = Math.max(1, ...sorted.map(n => n.weighted_votes || n.votes || 0))

  const ydaySorted = [...ydayNoms].filter(n => n.tracks).sort((a, b) => (b.weighted_votes || b.votes || 0) - (a.weighted_votes || a.votes || 0))
  const ydayMax = Math.max(1, yesterdayWinner?.weighted_votes || yesterdayWinner?.total_votes || 0, ...ydaySorted.map(n => n.weighted_votes || n.votes || 0))

  const openTrk = (t: Track) => setOpenTrack(t)

  return (
    <div className="dd-page">
      <style>{`
        .dd-page { min-height: 100vh; background: var(--bg-primary); color: var(--text-primary); }
        .dd-wrap { max-width: var(--page-max, 1280px); margin: 0 auto; padding: 28px var(--page-px, 20px) 64px; }
        .dd-layout { display: flex; gap: 32px; align-items: flex-start; }
        .dd-main { flex: 1; min-width: 0; }
        .dd-side {
          width: 348px; flex-shrink: 0; position: sticky; top: 76px;
          max-height: calc(100vh - 96px); display: flex; flex-direction: column;
        }
        @media (max-width: 980px) {
          .dd-layout { flex-direction: column; }
          .dd-side { width: 100%; position: static; max-height: none; }
        }
        .dd-eyebrow { display: flex; align-items: center; gap: 7px; font-size: 10.5px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent-orange); }
        .dd-eyebrow-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent-orange); animation: dd-pulse 2s ease-in-out infinite; }
        @keyframes dd-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
        .dd-h1 { margin: 8px 0 0; font-family: 'Outfit', sans-serif; font-weight: 800; letter-spacing: -0.01em; font-size: clamp(26px, 4vw, 34px); color: var(--text-primary); }
        .dd-sub { margin: 6px 0 0; font-size: 13.5px; color: var(--text-muted); max-width: 540px; }
        .dd-chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border-default); background: var(--bg-surface); border-radius: 999px; padding: 6px 12px; font-size: 12px; font-weight: 700; color: var(--text-secondary); }
        .dd-cta { display: inline-flex; align-items: center; gap: 7px; background: var(--accent-orange); color: #fff; border: 0; border-radius: 999px; padding: 9px 18px; font-family: 'Outfit', sans-serif; font-size: 13.5px; font-weight: 800; cursor: pointer; box-shadow: 0 3px 14px rgba(249,115,22,0.35); transition: transform .15s; }
        .dd-cta:hover { transform: translateY(-1px); }
        .dd-section-title { display: flex; align-items: center; gap: 10px; }
        .dd-bar { width: 4px; height: 18px; border-radius: 3px; background: var(--accent-orange); }
        .dd-section-h { margin: 0; font-family: 'Outfit', sans-serif; font-weight: 800; font-size: var(--section-title-size, 19px); color: var(--text-primary); }
        .dd-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 20px; }
        @media (min-width: 700px) { .dd-grid { grid-template-columns: repeat(3, minmax(0,1fr)); } }
        @media (max-width: 480px) { .dd-grid { grid-template-columns: repeat(1, minmax(0,1fr)); gap: 18px; } }
        .dd-side-scroll { overflow-y: auto; -webkit-overflow-scrolling: touch; padding-right: 4px; }
        .dd-side-scroll::-webkit-scrollbar { width: 6px; }
        .dd-side-scroll::-webkit-scrollbar-thumb { background: var(--border-default); border-radius: 3px; }
      `}</style>

      <div className="dd-wrap">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <span className="dd-eyebrow"><span className="dd-eyebrow-dot" /> Kasdienis balsavimas</span>
            <h1 className="dd-h1">Dienos daina</h1>
            <p className="dd-sub">Siūlyk savo favoritą ir balsuok už geriausią šios dienos dainą. Laimėtojas paaiškėja kiekvieną vidurnaktį.</p>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="dd-chip">⏳ Balsavimas baigsis: <Countdown /></span>
            {!alreadyNominated && (
              <button type="button" className="dd-cta" onClick={() => setShowSuggest(true)}>
                <span className="text-[16px] leading-none">+</span> Pasiūlyti dainą
              </button>
            )}
          </div>
        </div>

        <div className="dd-layout">
          {/* ── MAIN ── */}
          <div className="dd-main">
            {/* Šiandien siūloma */}
            <div className="mb-3.5 flex items-end justify-between gap-3">
              <div className="dd-section-title">
                <span className="dd-bar" />
                <h2 className="dd-section-h">Šiandien siūloma</h2>
                {sorted.length > 0 && <span className="rounded-full bg-[var(--bg-active)] px-2 py-0.5 text-[11px] font-bold text-[var(--text-secondary)]">{sorted.length}</span>}
              </div>
              {voteError && <span className="text-[12px] font-bold text-[var(--accent-red,#ef4444)]">{voteError}</span>}
            </div>

            {sorted.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)] px-6 py-12 text-center">
                <p className="m-0 text-[14px] font-bold text-[var(--text-primary)]">Šiandien dar nėra pasiūlymų</p>
                <p className="m-0 mt-1 text-[12.5px] text-[var(--text-muted)]">Būk pirmas — pasiūlyk dainą šios dienos balsavimui.</p>
                {!alreadyNominated && <button type="button" className="dd-cta mt-4" onClick={() => setShowSuggest(true)}><span className="text-[16px] leading-none">+</span> Pasiūlyti dainą</button>}
              </div>
            ) : (
              <div className="dd-grid">
                {sorted.map(n => (
                  <TodayCard key={n.id} n={n} maxVotes={maxVotes} isVoted={votedIds.has(n.id)} isVoting={votingId === n.id} onVote={handleVote} onOpen={openTrk} />
                ))}
              </div>
            )}

            {/* Vakar laimėjo */}
            {yesterdayWinner?.tracks && (
              <div className="mt-10 border-t border-[var(--border-default)] pt-8">
                <div className="mb-3.5 flex items-end justify-between gap-3">
                  <div className="dd-section-title">
                    <span className="dd-bar" />
                    <h2 className="dd-section-h">Vakar laimėjo</h2>
                  </div>
                  <button type="button" onClick={() => setOverviewWinner(yesterdayWinner)} className="shrink-0 cursor-pointer border-0 bg-transparent p-0 font-['Outfit',sans-serif] text-[12.5px] font-bold text-[var(--accent-orange)] transition-opacity hover:opacity-70">Visa apžvalga →</button>
                </div>
                <p className="-mt-1.5 mb-4 text-[12px] font-semibold text-[var(--text-faint)]">{formatDateLong(yesterdayWinner.date)}</p>

                <div className="dd-grid">
                  {(() => {
                    const winnerTrackId = yesterdayWinner.tracks?.id
                    const winnerNom = ydaySorted.find(n => n.tracks?.id === winnerTrackId)
                    const rest = ydaySorted.filter(n => n.tracks?.id !== winnerTrackId)
                    const winnerCard: Nomination = winnerNom || {
                      id: -1, date: yesterdayWinner.date, comment: yesterdayWinner.winning_comment, created_at: '', user_id: '',
                      votes: yesterdayWinner.total_votes, weighted_votes: yesterdayWinner.weighted_votes,
                      tracks: yesterdayWinner.tracks, proposer: yesterdayWinner.proposer,
                    }
                    return (
                      <>
                        <PastCard n={winnerCard} maxVotes={ydayMax} onOpen={openTrk} isWinner />
                        {ydayLoading && rest.length === 0
                          ? Array(2).fill(null).map((_, i) => <div key={i} className="hp-skel aspect-video rounded-xl" />)
                          : rest.map(n => <PastCard key={n.id} n={n} maxVotes={ydayMax} onOpen={openTrk} />)}
                      </>
                    )
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* ── SIDEBAR (full height history) ── */}
          <aside className="dd-side">
            <div className="dd-section-title mb-3 shrink-0">
              <span className="dd-bar" />
              <h2 className="dd-section-h">Ankstesni laimėtojai</h2>
            </div>
            {history.length === 0 ? (
              <p className="text-[12.5px] text-[var(--text-muted)]">Istorijos dar nėra.</p>
            ) : (
              <>
                <p className="mb-2 shrink-0 text-[11.5px] text-[var(--text-faint)]">Paspausk dieną — pamatysi visus tos dienos kandidatus.</p>
                <div className="dd-side-scroll flex flex-col gap-1">
                  {history.map((w, i) => (
                    <HistoryRow key={w.id} w={w} rank={i + 1} onOpen={setOverviewWinner} />
                  ))}
                </div>
              </>
            )}
          </aside>
        </div>
      </div>

      {/* Modals */}
      {openTrack && <HomeTrackModal track={openTrack as any} onClose={() => setOpenTrack(null)} />}
      {overviewWinner && <DayOverviewModal winner={overviewWinner} onClose={() => setOverviewWinner(null)} onOpenTrack={(t) => setOpenTrack(t)} />}
      {showSuggest && <DainaSuggestModal onClose={() => setShowSuggest(false)} onDone={reloadToday} />}
    </div>
  )
}
