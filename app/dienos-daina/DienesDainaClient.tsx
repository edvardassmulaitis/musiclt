'use client'

/**
 * DienesDainaClient — /dienos-daina page'o redesign (2026-06-11).
 *
 * Layout: page-shell su dviem kolonomis (desktop):
 *   - Kairė (main): šiandienos balsavimas + vakar laimėjo
 *   - Dešinė (sidebar): istorija (laimėjusios dainos)
 *
 * Pakeitimai:
 *   - Multi-vote (votedIds Set, ne vienas hasVoted boolean)
 *   - Komentaro stilius (ne italic+kabutes, o paprastas kortelės komentaras)
 *   - Countdown: >1h → "~2 val. 30 min", <1h → "45:23"
 *   - Proposer avatar+username virš komentaro, ne prie balsuok mygtuko
 *   - Istorija šone su expandable kandidatais
 *   - Vakar laimėjo — panašaus dydžio kaip nominacijos
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'

// ── types ──────────────────────────────────────────────────────────────

type Artist = { id: number; slug: string; name: string; cover_image_url: string | null }
type Track = { id: number; slug: string; title: string; cover_url: string | null; spotify_id: string | null; video_url: string | null; artists: Artist }
type Proposer = { username: string | null; full_name: string | null; avatar_url: string | null }
type Nomination = {
  id: number; date: string; comment: string | null; created_at: string; user_id: string
  votes: number; weighted_votes: number
  tracks: Track
  proposer?: Proposer | null
  voters?: Proposer[]
  anon_votes?: number
  own?: boolean
}
type Winner = {
  id: number; date: string; total_votes: number; weighted_votes: number
  winning_comment: string | null; winning_user_id: string | null
  tracks: Track
  proposer?: Proposer | null
}

// ── helpers ─────────────────────────────────────────────────────────────

function formatDateShort(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('lt-LT', { month: 'long', day: 'numeric' })
}
function formatDateFull(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('lt-LT', { month: 'long', day: 'numeric', weekday: 'long' })
}
function formatDateCompact(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('lt-LT', { month: 'short', day: 'numeric', weekday: 'short' })
}

function strHue(s: string) { let h = 0; for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h }

function proposerName(p?: Proposer | null): string {
  if (!p) return 'Anonimas'
  return p.full_name || p.username || 'Vartotojas'
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
      if (h >= 1) {
        // >1h: "~2 val. 30 min"
        setTxt(min > 0 ? `~${h} val. ${min} min.` : `~${h} val.`)
      } else {
        // <1h: "45:23"
        setTxt(`${min}:${String(sec).padStart(2, '0')}`)
      }
    }
    tick()
    // Update every 30s when >1h, every second when <1h
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [])
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{txt}</span>
}

// ── Spotify embed ──────────────────────────────────────────────────────

function SpotifyEmbed({ trackId }: { trackId: string }) {
  return (
    <iframe
      src={`https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=0`}
      width="100%"
      height="80"
      frameBorder="0"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      loading="lazy"
      className="rounded-xl"
    />
  )
}

// ── NominateModal ──────────────────────────────────────────────────────

function NominateModal({ onClose, onNominated }: { onClose: () => void; onNominated: (n: Nomination) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [selected, setSelected] = useState<any | null>(null)
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (query.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/search-entities?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      setResults((data.results || []).filter((h: any) => h.type === 'daina').slice(0, 8))
    }, 200)
    return () => clearTimeout(t)
  }, [query])

  const submit = async () => {
    if (!selected) return
    setSending(true)
    setError('')
    const res = await fetch('/api/dienos-daina/nominations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track_id: selected.id, comment: comment.trim() || null }),
    })
    const data = await res.json()
    if (res.ok) {
      onNominated(data.nomination)
      onClose()
    } else {
      setError(data.error || 'Klaida')
    }
    setSending(false)
  }

  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="dd-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="dd-modal" onClick={e => e.stopPropagation()}>
        <div className="dd-modal-head">
          <div>
            <h3 className="dd-modal-title">Siūlyti dainą</h3>
            <p className="dd-modal-sub">Pasiūlyk šiandienos balsavimui</p>
          </div>
          <button onClick={onClose} className="dd-modal-close">✕</button>
        </div>
        <div className="dd-modal-body">
          {!selected ? (
            <>
              <input type="text" value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Ieškoti dainos…" autoFocus
                className="dd-input" style={{ fontSize: 16 }} />
              {results.length > 0 && (
                <div className="dd-results">
                  {results.map((t: any) => (
                    <button key={t.id} onClick={() => setSelected(t)} className="dd-result-row" type="button">
                      <div className="dd-result-img">
                        {t.image_url
                          ? <img src={proxyImg(t.image_url)} alt="" />
                          : <span>♪</span>}
                      </div>
                      <div className="dd-result-text">
                        <span className="dd-result-title">{t.title}</span>
                        <span className="dd-result-artist">{t.artist}</span>
                      </div>
                      <span className="dd-result-pick">Rinktis →</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="dd-selected">
                <div className="dd-selected-img">
                  {selected.image_url
                    ? <img src={proxyImg(selected.image_url)} alt="" />
                    : <span>♪</span>}
                </div>
                <div className="dd-selected-text">
                  <span className="dd-selected-title">{selected.title}</span>
                  <span className="dd-selected-artist">{selected.artist}</span>
                </div>
                <button onClick={() => setSelected(null)} className="dd-selected-change" type="button">Keisti</button>
              </div>
              <textarea value={comment} onChange={e => setComment(e.target.value)}
                placeholder="Kodėl ši daina? (neprivaloma)" rows={3} autoFocus
                className="dd-textarea" style={{ fontSize: 16 }} />
              {error && <p className="dd-error">{error}</p>}
              <button onClick={submit} disabled={sending} className="dd-submit" type="button">
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

// ── NominationCard ─────────────────────────────────────────────────────

function NominationCard({
  nomination, isVoted, onVote, isVoting, isOwn,
}: {
  nomination: Nomination; isVoted: boolean; onVote: (id: number) => void; isVoting: boolean; isOwn: boolean
}) {
  const track = nomination.tracks
  const img = trackImg(track)
  const pName = proposerName(nomination.proposer)

  return (
    <div className={`dd-nom${isVoted ? ' is-voted' : ''}`}>
      {/* Proposer line — VIRŠ visko */}
      <div className="dd-nom-proposer">
        {nomination.proposer?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxyImg(nomination.proposer.avatar_url)} alt="" className="dd-nom-proposer-ava" />
        ) : (
          <span className="dd-nom-proposer-ava dd-nom-proposer-ava--placeholder" style={{ background: `hsl(${strHue(pName)},32%,20%)`, color: `hsl(${strHue(pName)},48%,58%)` }}>{pName.charAt(0).toUpperCase()}</span>
        )}
        <span className="dd-nom-proposer-name">{pName}</span>
        <span className="dd-nom-proposer-time">
          {new Date(nomination.created_at).toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* Track info */}
      <div className="dd-nom-track">
        <div className="dd-nom-cover">
          {img
            ? <img src={proxyImg(img)} alt="" />
            : <span className="dd-nom-cover-ph">♪</span>}
        </div>
        <div className="dd-nom-info">
          <Link href={`/dainos/${track?.artists?.slug}-${track?.slug}-${track?.id}`} className="dd-nom-title">
            {track?.title}
          </Link>
          <Link href={`/atlikejai/${track?.artists?.slug}`} className="dd-nom-artist">
            {track?.artists?.name}
          </Link>
        </div>
      </div>

      {/* Comment — stilingas, ne italic */}
      {nomination.comment && (
        <div className="dd-nom-comment">
          {nomination.comment}
        </div>
      )}

      {/* Footer: votes + button */}
      <div className="dd-nom-footer">
        <span className="dd-nom-votes">
          {nomination.weighted_votes > 0
            ? `${nomination.weighted_votes} ${nomination.weighted_votes === 1 ? 'balsas' : (nomination.weighted_votes >= 10 && nomination.weighted_votes <= 19) ? 'balsų' : nomination.weighted_votes % 10 >= 2 ? 'balsai' : 'balsų'}`
            : 'Dar nėra balsų'}
        </span>
        {isOwn ? (
          <span className="dd-nom-own-badge">Tavo pasiūlymas</span>
        ) : isVoted ? (
          <span className="dd-nom-voted-badge">✓ Balsavai</span>
        ) : (
          <button onClick={() => onVote(nomination.id)} disabled={isVoting} className="dd-nom-vote-btn" type="button">
            {isVoting ? '…' : 'Balsuoti'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── History winners sidebar ────────────────────────────────────────────

function HistoryItem({ w, expanded, onToggle }: { w: Winner; expanded: boolean; onToggle: () => void }) {
  const t = w.tracks
  const img = trackImg(t)
  const [candidates, setCandidates] = useState<Nomination[] | null>(null)
  const [loading, setLoading] = useState(false)

  const loadCandidates = useCallback(() => {
    if (candidates !== null) { onToggle(); return }
    setLoading(true)
    fetch(`/api/dienos-daina/nominations?date=${w.date}`)
      .then(r => r.json())
      .then(d => {
        const noms = (d.nominations || []).filter((n: any) => n.tracks && n.tracks.id !== t?.id)
        setCandidates(noms)
        onToggle()
      })
      .catch(() => { setCandidates([]); onToggle() })
      .finally(() => setLoading(false))
  }, [w.date, t?.id, candidates, onToggle])

  return (
    <div className="dd-hist-item">
      <div className="dd-hist-main">
        <span className="dd-hist-date">{formatDateCompact(w.date)}</span>
        <div className="dd-hist-cover">
          {img ? <img src={proxyImg(img)} alt="" /> : <span>♪</span>}
        </div>
        <div className="dd-hist-info">
          <Link href={`/dainos/${t?.artists?.slug}-${t?.slug}-${t?.id}`} className="dd-hist-title">{t?.title}</Link>
          <span className="dd-hist-artist">{t?.artists?.name}</span>
        </div>
        <button type="button" onClick={loadCandidates} className="dd-hist-expand" title="Rodyti kandidatus">
          {loading ? '…' : expanded ? '▲' : '▼'}
        </button>
      </div>
      {expanded && candidates && candidates.length > 0 && (
        <div className="dd-hist-candidates">
          {candidates.slice(0, 5).map(n => {
            const nt = n.tracks
            const nImg = trackImg(nt)
            const votes = n.weighted_votes || n.votes || 0
            return (
              <div key={n.id} className="dd-hist-cand">
                <div className="dd-hist-cand-cover">
                  {nImg ? <img src={proxyImg(nImg)} alt="" /> : <span>♪</span>}
                </div>
                <div className="dd-hist-cand-info">
                  <span className="dd-hist-cand-title">{nt?.title}</span>
                  <span className="dd-hist-cand-artist">{nt?.artists?.name}</span>
                </div>
                <span className="dd-hist-cand-votes">{votes} bal.</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── MAIN ───────────────────────────────────────────────────────────────

export default function DienesDainaClient({
  nominations: initialNominations,
  winners,
  today,
  yesterday,
}: {
  nominations: Nomination[]
  winners: Winner[]
  today: string
  yesterday: string
}) {
  const { data: session } = useSession()
  const [nominations, setNominations] = useState<Nomination[]>(initialNominations)
  const [votedIds, setVotedIds] = useState<Set<number>>(new Set())
  const [votingId, setVotingId] = useState<number | null>(null)
  const [showNominate, setShowNominate] = useState(false)
  const [hasNominatedToday, setHasNominatedToday] = useState(false)

  // Auto-open nominate modal from ?siulyti=1 (homepage CTA)
  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('siulyti') === '1') {
      setShowNominate(true)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])
  const [voteError, setVoteError] = useState('')
  const [expandedDay, setExpandedDay] = useState<string | null>(null)

  const yesterdayWinner = winners[0]
  const historyWinners = winners.slice(1, 14)

  // Fetch which nominations this user already voted for
  useEffect(() => {
    fetch('/api/dienos-daina/votes')
      .then(r => r.json())
      .then(data => {
        setVotedIds(new Set<number>(data.voted_nomination_ids || []))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!session?.user?.id) return
    const alreadyNominated = nominations.some(n => n.user_id === session.user!.id)
    setHasNominatedToday(alreadyNominated)
  }, [nominations, session])

  const handleVote = async (nominationId: number) => {
    if (votedIds.has(nominationId) || votingId !== null) return
    setVotingId(nominationId)
    setVoteError('')
    const res = await fetch('/api/dienos-daina/votes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nomination_id: nominationId }),
    })
    const data = await res.json()
    if (res.ok) {
      const wt = data.weight || 1
      setVotedIds(prev => { const next = new Set(prev); next.add(nominationId); return next })
      setNominations(prev => [...prev.map(n =>
        n.id === nominationId
          ? { ...n, votes: n.votes + 1, weighted_votes: n.weighted_votes + wt }
          : n
      )].sort((a, b) => b.weighted_votes - a.weighted_votes))
    } else {
      setVoteError(data.error || 'Klaida')
      setTimeout(() => setVoteError(''), 3000)
    }
    setVotingId(null)
  }

  const handleNominated = (nomination: Nomination) => {
    setNominations(prev => [{ ...nomination, votes: 0, weighted_votes: 0 }, ...prev])
    setHasNominatedToday(true)
  }

  const sorted = [...nominations].sort((a, b) => b.weighted_votes - a.weighted_votes)

  return (
    <>
      <style>{`
        /* ── Page shell ────────────────────────────────────────────── */
        .dd-page {
          min-height: 100vh;
          background: var(--bg-primary, #0d1117);
          color: var(--text-primary, #e6edf3);
        }
        .dd-wrap {
          max-width: var(--page-max, 1280px);
          margin: 0 auto;
          padding: 28px var(--page-px, 20px) 60px;
        }
        .dd-layout {
          display: flex;
          gap: 32px;
          align-items: flex-start;
        }
        .dd-main { flex: 1; min-width: 0; }
        .dd-sidebar {
          width: 340px;
          flex-shrink: 0;
          position: sticky;
          top: 80px;
        }

        /* ── Header ────────────────────────────────────────────────── */
        .dd-header {
          margin-bottom: 24px;
        }
        .dd-header-label {
          display: flex; align-items: center; gap: 6px;
          font-size: 10.5px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase;
          color: var(--accent-orange, #f97316);
          margin-bottom: 6px;
        }
        .dd-header-label-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--accent-orange, #f97316);
          animation: dd-pulse 2s ease-in-out infinite;
        }
        @keyframes dd-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }
        .dd-header h1 {
          margin: 0;
          font-family: 'Outfit', sans-serif;
          font-size: clamp(24px, 4vw, 32px);
          font-weight: 900;
          letter-spacing: -0.02em;
          line-height: 1.15;
        }
        .dd-header-meta {
          display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
          margin-top: 8px;
          font-size: 13px; color: var(--text-muted, #8b949e);
        }
        .dd-countdown-pill {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 3px 10px; border-radius: 6px;
          font-size: 12px; font-weight: 700;
          background: rgba(249,115,22,0.1); border: 1px solid rgba(249,115,22,0.2);
          color: var(--accent-orange, #f97316);
        }

        /* ── Yesterday winner ──────────────────────────────────────── */
        .dd-yesterday {
          margin-bottom: 28px;
          border-radius: 16px;
          overflow: hidden;
          background: var(--bg-elevated, rgba(255,255,255,0.03));
          border: 1px solid var(--border-default, rgba(255,255,255,0.08));
        }
        .dd-yesterday-label {
          display: flex; align-items: center; gap: 6px;
          padding: 12px 16px 0;
          font-size: 10.5px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase;
          color: var(--accent-orange, #f97316);
        }
        .dd-yesterday-content {
          display: flex; align-items: flex-start; gap: 16px;
          padding: 12px 16px 16px;
        }
        .dd-yesterday-cover {
          width: 80px; height: 80px; border-radius: 12px; overflow: hidden; flex-shrink: 0;
          box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        }
        .dd-yesterday-cover img { width: 100%; height: 100%; object-fit: cover; }
        .dd-yesterday-info { flex: 1; min-width: 0; }
        .dd-yesterday-title {
          display: block; margin: 0;
          font-family: 'Outfit', sans-serif;
          font-size: 18px; font-weight: 800; line-height: 1.2;
          color: var(--text-primary); text-decoration: none;
          transition: color .15s;
        }
        .dd-yesterday-title:hover { color: var(--accent-orange); }
        .dd-yesterday-artist {
          display: block; margin-top: 2px;
          font-size: 13px; font-weight: 600;
          color: var(--text-muted); text-decoration: none;
          transition: color .15s;
        }
        .dd-yesterday-artist:hover { color: var(--text-primary); }
        .dd-yesterday-stats {
          margin-top: 6px; font-size: 12px; color: var(--text-faint, #484f58);
        }
        .dd-yesterday-comment {
          margin-top: 8px; padding: 8px 12px;
          border-radius: 10px;
          background: rgba(249,115,22,0.06);
          border-left: 3px solid rgba(249,115,22,0.4);
          font-size: 13px; line-height: 1.5; color: var(--text-secondary, #c9d1d9);
        }
        .dd-yesterday-proposer {
          display: flex; align-items: center; gap: 6px;
          margin-top: 8px; font-size: 12px; color: var(--text-muted);
        }
        .dd-yesterday-proposer img, .dd-yesterday-proposer .dd-ava-ph {
          width: 18px; height: 18px; border-radius: 50%; object-fit: cover;
        }
        .dd-ava-ph {
          display: flex; align-items: center; justify-content: center;
          font-size: 8px; font-weight: 800;
        }
        .dd-yesterday-embed { padding: 0 16px 16px; }

        /* ── Voting section ────────────────────────────────────────── */
        .dd-voting-head {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          margin-bottom: 12px; flex-wrap: wrap;
        }
        .dd-voting-title {
          margin: 0;
          font-family: 'Outfit', sans-serif;
          font-size: 17px; font-weight: 800; letter-spacing: -0.01em;
        }
        .dd-suggest-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 16px; border-radius: 12px; border: none; cursor: pointer;
          font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 800;
          color: #fff;
          background: var(--accent-orange, #f97316);
          box-shadow: 0 3px 14px rgba(249,115,22,0.3);
          transition: transform .1s, box-shadow .15s;
        }
        .dd-suggest-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(249,115,22,0.4); }
        .dd-suggest-btn:active { transform: scale(0.97); }
        .dd-done-badge {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 6px 12px; border-radius: 10px;
          font-size: 12px; font-weight: 700;
          background: var(--bg-elevated); border: 1px solid var(--border-default);
          color: var(--text-muted);
        }
        .dd-guest-hint {
          margin-bottom: 12px; padding: 10px 14px;
          border-radius: 12px; font-size: 13px;
          background: rgba(59,130,246,0.06); border: 1px solid rgba(59,130,246,0.12);
          color: var(--text-secondary);
        }
        .dd-guest-hint a { font-weight: 700; color: var(--accent-link, #58a6ff); text-decoration: underline; text-underline-offset: 2px; }
        .dd-vote-error {
          margin-bottom: 8px; padding: 8px 12px;
          border-radius: 10px; font-size: 12px;
          background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.15);
          color: #f87171;
        }
        .dd-empty-state {
          padding: 48px 20px; text-align: center;
          border-radius: 16px;
          background: var(--bg-elevated); border: 2px dashed var(--border-default);
        }
        .dd-empty-state h3 { margin: 0 0 8px; font-size: 17px; font-weight: 800; }
        .dd-empty-state p { margin: 0 0 20px; font-size: 13px; color: var(--text-muted); }
        .dd-noms-list { display: flex; flex-direction: column; gap: 10px; }

        /* ── Nomination card ───────────────────────────────────────── */
        .dd-nom {
          border-radius: 14px; overflow: hidden;
          background: var(--bg-elevated, rgba(255,255,255,0.03));
          border: 1px solid var(--border-default, rgba(255,255,255,0.08));
          padding: 14px 16px;
          transition: border-color .15s, background .15s;
        }
        .dd-nom:hover { border-color: var(--border-strong, rgba(255,255,255,0.14)); }
        .dd-nom.is-voted {
          border-color: rgba(249,115,22,0.35);
          background: rgba(249,115,22,0.04);
        }
        .dd-nom-proposer {
          display: flex; align-items: center; gap: 6px;
          margin-bottom: 10px;
          font-size: 12px; color: var(--text-muted);
        }
        .dd-nom-proposer-ava {
          width: 22px; height: 22px; border-radius: 50%; object-fit: cover; flex-shrink: 0;
        }
        .dd-nom-proposer-ava--placeholder {
          display: flex; align-items: center; justify-content: center;
          font-size: 9px; font-weight: 800;
        }
        .dd-nom-proposer-name { font-weight: 700; color: var(--text-secondary); }
        .dd-nom-proposer-time { margin-left: auto; font-size: 11px; color: var(--text-faint); }
        .dd-nom-track {
          display: flex; align-items: center; gap: 12px;
        }
        .dd-nom-cover {
          width: 52px; height: 52px; border-radius: 10px; overflow: hidden; flex-shrink: 0;
          background: var(--cover-placeholder, rgba(255,255,255,0.06));
        }
        .dd-nom-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .dd-nom-cover-ph { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; font-size: 18px; color: var(--text-faint); }
        .dd-nom-info { flex: 1; min-width: 0; }
        .dd-nom-title {
          display: block; font-family: 'Outfit', sans-serif;
          font-size: 14px; font-weight: 800; line-height: 1.25;
          color: var(--text-primary); text-decoration: none;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          transition: color .15s;
        }
        .dd-nom-title:hover { color: var(--accent-orange); }
        .dd-nom-artist {
          display: block; margin-top: 2px;
          font-size: 12px; color: var(--text-muted); text-decoration: none;
          transition: color .15s;
        }
        .dd-nom-artist:hover { color: var(--text-secondary); }
        .dd-nom-comment {
          margin-top: 10px; padding: 10px 12px;
          border-radius: 10px;
          background: rgba(255,255,255,0.03);
          border-left: 3px solid var(--border-strong, rgba(255,255,255,0.15));
          font-size: 13px; line-height: 1.55; color: var(--text-secondary);
        }
        .dd-nom-footer {
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
          margin-top: 12px;
        }
        .dd-nom-votes { font-size: 12px; font-weight: 600; color: var(--text-faint); }
        .dd-nom-vote-btn {
          padding: 6px 18px; border-radius: 10px; border: none; cursor: pointer;
          font-family: 'Outfit', sans-serif; font-size: 12px; font-weight: 800;
          color: #fff; background: var(--accent-orange);
          box-shadow: 0 2px 8px rgba(249,115,22,0.3);
          transition: transform .1s, box-shadow .15s;
        }
        .dd-nom-vote-btn:hover:not(:disabled) { transform: translateY(-1px); }
        .dd-nom-vote-btn:active:not(:disabled) { transform: scale(0.97); }
        .dd-nom-vote-btn:disabled { opacity: 0.5; cursor: default; }
        .dd-nom-voted-badge {
          padding: 6px 14px; border-radius: 10px;
          font-size: 12px; font-weight: 700;
          background: rgba(249,115,22,0.1); border: 1px solid rgba(249,115,22,0.25);
          color: var(--accent-orange);
        }
        .dd-nom-own-badge {
          padding: 6px 14px; border-radius: 10px;
          font-size: 12px; font-weight: 700;
          background: var(--bg-hover); border: 1px dashed var(--border-default);
          color: var(--text-faint);
        }

        /* ── Sidebar ───────────────────────────────────────────────── */
        .dd-sidebar-title {
          margin: 0 0 12px;
          font-family: 'Outfit', sans-serif;
          font-size: 15px; font-weight: 800; letter-spacing: -0.01em;
          color: var(--text-primary);
        }
        .dd-hist-list {
          display: flex; flex-direction: column; gap: 4px;
        }
        .dd-hist-item {
          border-radius: 10px;
          background: var(--bg-elevated, rgba(255,255,255,0.03));
          border: 1px solid var(--border-subtle, rgba(255,255,255,0.05));
          overflow: hidden;
          transition: border-color .15s;
        }
        .dd-hist-item:hover { border-color: var(--border-default); }
        .dd-hist-main {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 10px;
        }
        .dd-hist-date {
          width: 68px; flex-shrink: 0;
          font-size: 11px; color: var(--text-faint); white-space: nowrap;
        }
        .dd-hist-cover {
          width: 36px; height: 36px; border-radius: 8px; overflow: hidden; flex-shrink: 0;
          background: var(--cover-placeholder);
        }
        .dd-hist-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .dd-hist-cover span { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; font-size: 12px; color: var(--text-faint); }
        .dd-hist-info { flex: 1; min-width: 0; }
        .dd-hist-title {
          display: block;
          font-size: 12.5px; font-weight: 700; line-height: 1.25;
          color: var(--text-primary); text-decoration: none;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          transition: color .15s;
        }
        .dd-hist-title:hover { color: var(--accent-orange); }
        .dd-hist-artist {
          display: block; margin-top: 1px;
          font-size: 11px; color: var(--text-faint);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .dd-hist-expand {
          width: 24px; height: 24px; border-radius: 6px; flex-shrink: 0;
          border: none; cursor: pointer;
          background: transparent; color: var(--text-faint);
          font-size: 9px; display: flex; align-items: center; justify-content: center;
          transition: color .15s, background .15s;
        }
        .dd-hist-expand:hover { background: var(--bg-hover); color: var(--text-secondary); }
        .dd-hist-candidates {
          padding: 2px 10px 8px 88px;
          display: flex; flex-direction: column; gap: 4px;
        }
        .dd-hist-cand {
          display: flex; align-items: center; gap: 8px;
          padding: 4px 0;
        }
        .dd-hist-cand-cover {
          width: 24px; height: 24px; border-radius: 5px; overflow: hidden; flex-shrink: 0;
          background: var(--cover-placeholder);
        }
        .dd-hist-cand-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .dd-hist-cand-cover span { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; font-size: 8px; color: var(--text-faint); }
        .dd-hist-cand-info { flex: 1; min-width: 0; }
        .dd-hist-cand-title { font-size: 11.5px; font-weight: 600; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; }
        .dd-hist-cand-artist { font-size: 10.5px; color: var(--text-faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; }
        .dd-hist-cand-votes { flex-shrink: 0; font-size: 10.5px; font-weight: 700; color: var(--text-faint); }

        /* ── Modal ─────────────────────────────────────────────────── */
        .dd-modal-overlay {
          position: fixed; inset: 0; z-index: 1300;
          display: flex; align-items: center; justify-content: center;
          background: rgba(0,0,0,0.65); backdrop-filter: blur(8px);
          padding: 16px;
        }
        .dd-modal {
          width: 100%; max-width: 480px;
          border-radius: 20px; overflow: hidden;
          background: var(--bg-surface, #161b22);
          border: 1px solid var(--border-default);
          box-shadow: 0 24px 64px rgba(0,0,0,0.5);
          max-height: 85vh; display: flex; flex-direction: column;
        }
        .dd-modal-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-subtle);
        }
        .dd-modal-title { margin: 0; font-family: 'Outfit', sans-serif; font-size: 16px; font-weight: 800; }
        .dd-modal-sub { margin: 2px 0 0; font-size: 12px; color: var(--text-muted); }
        .dd-modal-close {
          width: 28px; height: 28px; border-radius: 50%; border: none; cursor: pointer;
          background: var(--bg-active); color: var(--text-secondary);
          display: flex; align-items: center; justify-content: center; font-size: 14px;
        }
        .dd-modal-body { padding: 16px 20px; overflow-y: auto; flex: 1; }
        .dd-input {
          width: 100%; padding: 10px 14px; border-radius: 10px;
          background: var(--bg-hover); border: 1px solid var(--border-default);
          color: var(--text-primary); outline: none;
        }
        .dd-input:focus { border-color: var(--accent-orange); }
        .dd-results { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
        .dd-result-row {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 10px; border-radius: 10px; border: 1px solid var(--border-subtle);
          background: var(--bg-hover); cursor: pointer; text-align: left; width: 100%;
          transition: border-color .15s;
        }
        .dd-result-row:hover { border-color: var(--accent-orange); }
        .dd-result-img { width: 36px; height: 36px; border-radius: 7px; overflow: hidden; flex-shrink: 0; background: var(--cover-placeholder); }
        .dd-result-img img { width: 100%; height: 100%; object-fit: cover; }
        .dd-result-img span { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; font-size: 14px; color: var(--text-faint); }
        .dd-result-text { flex: 1; min-width: 0; }
        .dd-result-title { display: block; font-size: 12.5px; font-weight: 700; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dd-result-artist { display: block; font-size: 11px; color: var(--text-muted); }
        .dd-result-pick { flex-shrink: 0; font-size: 11px; font-weight: 700; color: var(--accent-link); }
        .dd-selected {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 12px; border-radius: 10px;
          background: rgba(249,115,22,0.06); border: 1px solid rgba(249,115,22,0.2);
        }
        .dd-selected-img { width: 40px; height: 40px; border-radius: 8px; overflow: hidden; flex-shrink: 0; }
        .dd-selected-img img { width: 100%; height: 100%; object-fit: cover; }
        .dd-selected-img span { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; font-size: 14px; color: var(--text-faint); background: var(--cover-placeholder); }
        .dd-selected-text { flex: 1; min-width: 0; }
        .dd-selected-title { display: block; font-size: 13px; font-weight: 800; color: var(--text-primary); }
        .dd-selected-artist { display: block; font-size: 11px; color: var(--text-muted); }
        .dd-selected-change { border: none; background: transparent; cursor: pointer; font-size: 11px; color: var(--text-faint); flex-shrink: 0; }
        .dd-selected-change:hover { color: var(--text-primary); }
        .dd-textarea {
          width: 100%; margin-top: 10px; padding: 10px 14px; border-radius: 10px; resize: none;
          background: var(--bg-hover); border: 1px solid var(--border-default);
          color: var(--text-primary); outline: none;
        }
        .dd-textarea:focus { border-color: var(--accent-orange); }
        .dd-error { margin: 8px 0 0; font-size: 12px; color: #f87171; }
        .dd-submit {
          width: 100%; margin-top: 12px; padding: 12px; border-radius: 12px; border: none; cursor: pointer;
          font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 800; color: #fff;
          background: var(--accent-orange); box-shadow: 0 3px 14px rgba(249,115,22,0.35);
          transition: transform .1s;
        }
        .dd-submit:hover:not(:disabled) { transform: translateY(-1px); }
        .dd-submit:disabled { opacity: 0.5; cursor: default; }

        /* ── Mobile: stack layout ──────────────────────────────────── */
        @media (max-width: 860px) {
          .dd-layout { flex-direction: column; gap: 28px; }
          .dd-sidebar { width: 100%; position: static; }
          .dd-hist-candidates { padding-left: 44px; }
        }
      `}</style>

      <div className="dd-page">
        <div className="dd-wrap">
          {/* Header */}
          <div className="dd-header">
            <div className="dd-header-label">
              <span className="dd-header-label-dot" />
              Dienos daina
            </div>
            <h1>{formatDateFull(today)}</h1>
            <div className="dd-header-meta">
              <span>
                {nominations.length === 0
                  ? 'Dar nėra pasiūlymų — būk pirmas!'
                  : `${nominations.length} ${nominations.length === 1 ? 'daina siūloma' : 'dainos siūlomos'}`}
              </span>
              <span className="dd-countdown-pill">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                liko <Countdown />
              </span>
            </div>
          </div>

          <div className="dd-layout">
            {/* ── Main column ──────────────────────────────────────── */}
            <div className="dd-main">
              {/* Yesterday winner */}
              {yesterdayWinner && (
                <div className="dd-yesterday">
                  <div className="dd-yesterday-label">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 5M17 6h3a3 3 0 0 1-3 5" /></svg>
                    Vakar laimėjo · {formatDateShort(yesterdayWinner.date)}
                  </div>
                  <div className="dd-yesterday-content">
                    <div className="dd-yesterday-cover">
                      {trackImg(yesterdayWinner.tracks)
                        ? <img src={proxyImg(trackImg(yesterdayWinner.tracks)!)} alt="" />
                        : <div style={{ width: '100%', height: '100%', background: `hsl(${strHue(yesterdayWinner.tracks?.title || '')},30%,18%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>♪</div>}
                    </div>
                    <div className="dd-yesterday-info">
                      <Link href={`/dainos/${yesterdayWinner.tracks?.artists?.slug}-${yesterdayWinner.tracks?.slug}-${yesterdayWinner.tracks?.id}`} className="dd-yesterday-title">
                        {yesterdayWinner.tracks?.title}
                      </Link>
                      <Link href={`/atlikejai/${yesterdayWinner.tracks?.artists?.slug}`} className="dd-yesterday-artist">
                        {yesterdayWinner.tracks?.artists?.name}
                      </Link>
                      <div className="dd-yesterday-stats">
                        {yesterdayWinner.total_votes} {yesterdayWinner.total_votes === 1 ? 'balsas' : 'balsai'}
                      </div>
                      {yesterdayWinner.winning_comment && (
                        <div className="dd-yesterday-comment">{yesterdayWinner.winning_comment}</div>
                      )}
                      {yesterdayWinner.proposer && (
                        <div className="dd-yesterday-proposer">
                          {yesterdayWinner.proposer.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={proxyImg(yesterdayWinner.proposer.avatar_url)} alt="" />
                          ) : (
                            <span className="dd-ava-ph" style={{ width: 18, height: 18, borderRadius: '50%', background: `hsl(${strHue(proposerName(yesterdayWinner.proposer))},32%,20%)`, color: `hsl(${strHue(proposerName(yesterdayWinner.proposer))},48%,58%)` }}>{proposerName(yesterdayWinner.proposer).charAt(0).toUpperCase()}</span>
                          )}
                          Siūlė {proposerName(yesterdayWinner.proposer)}
                        </div>
                      )}
                    </div>
                  </div>
                  {yesterdayWinner.tracks?.spotify_id && (
                    <div className="dd-yesterday-embed">
                      <SpotifyEmbed trackId={yesterdayWinner.tracks.spotify_id} />
                    </div>
                  )}
                </div>
              )}

              {/* Today's voting */}
              <div>
                <div className="dd-voting-head">
                  <h2 className="dd-voting-title">Šiandien balsuojame</h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {session ? (
                      !hasNominatedToday ? (
                        <button onClick={() => setShowNominate(true)} className="dd-suggest-btn" type="button">
                          + Siūlyti dainą
                        </button>
                      ) : (
                        <span className="dd-done-badge">✓ Pasiūlei šiandien</span>
                      )
                    ) : (
                      <Link href="/auth/signin" className="dd-suggest-btn" style={{ textDecoration: 'none' }}>
                        Prisijungti ir siūlyti
                      </Link>
                    )}
                  </div>
                </div>

                {voteError && <div className="dd-vote-error">{voteError}</div>}

                {!session && votedIds.size === 0 && nominations.length > 0 && (
                  <div className="dd-guest-hint">
                    Balsuoji kaip svečias (1× svoris). <Link href="/auth/signin">Prisijunk</Link> ir tavo balsas svers 3× daugiau!
                  </div>
                )}

                {nominations.length === 0 ? (
                  <div className="dd-empty-state">
                    <h3>Šiandien dar niekas nepasiūlė!</h3>
                    <p>Būk pirmas — pasiūlyk dainą ir pradėk šiandienos balsavimą.</p>
                    {session ? (
                      <button onClick={() => setShowNominate(true)} className="dd-suggest-btn" type="button">
                        + Siūlyti dainą
                      </button>
                    ) : (
                      <Link href="/auth/signin" className="dd-suggest-btn" style={{ textDecoration: 'none' }}>
                        Prisijungti ir siūlyti
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="dd-noms-list">
                    {sorted.map(n => (
                      <NominationCard
                        key={n.id}
                        nomination={n}
                        isVoted={votedIds.has(n.id)}
                        onVote={handleVote}
                        isVoting={votingId === n.id}
                        isOwn={!!session?.user?.id && n.user_id === session.user.id}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Sidebar: history ─────────────────────────────────── */}
            {historyWinners.length > 0 && (
              <div className="dd-sidebar">
                <h3 className="dd-sidebar-title">Laimėjusios dainos</h3>
                <div className="dd-hist-list">
                  {historyWinners.map(w => (
                    <HistoryItem
                      key={w.id}
                      w={w}
                      expanded={expandedDay === w.date}
                      onToggle={() => setExpandedDay(prev => prev === w.date ? null : w.date)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showNominate && (
        <NominateModal onClose={() => setShowNominate(false)} onNominated={handleNominated} />
      )}
    </>
  )
}
