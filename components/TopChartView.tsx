'use client'

/* ──────────────────────────────────────────────────────────────────
 * Single TOP chart view — naudojama /top40 ir /top30 puslapiuose.
 *
 * Dizainas — light theme su CSS kintamaisiais (žr. globals.css).
 * Layout:
 *   - Header su title + week countdown + suggest CTA
 *   - Sticky info bar (savaitė + balsų likutis)
 *   - Two-column body: kairėje sąrašo eilutės, dešinėje YT preview
 * ────────────────────────────────────────────────────────────────── */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

type Artist = { id: number; slug: string; name: string; cover_image_url: string | null }
type Track = {
  id: number; slug: string; title: string;
  cover_url: string | null; spotify_id: string | null; video_url: string | null;
  artists: Artist | null
}
type Entry = {
  id: number; position: number; prev_position: number | null;
  weeks_in_top: number; total_votes: number; is_new: boolean;
  peak_position: number | null; tracks: Track | null
}
type Week = {
  id: number; top_type: string; week_start: string;
  is_active: boolean; is_finalized?: boolean;
  vote_close?: string | null
}

export type TopData = { entries: Entry[]; week: Week | null }

type ThemeAccent = {
  /** Solid hex color used for badges, hero accents */
  hex: string
  /** rgba string for soft glow / background tint */
  rgb: string
}

function getYouTubeId(url: string | null): string | null {
  if (!url) return null
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}

/**
 * Cover image fallback chain:
 *   1. YouTube thumbnail (jei video_url'as turi YT id)
 *   2. track.cover_url (jei track turi savo cover'į, pvz. albumo art)
 *   3. artist.cover_image_url (atlikėjo profilio nuotrauka)
 *   4. null (UI rodys ♪ iconą)
 */
function getCoverUrl(track: Track | null): string | null {
  if (!track) return null
  const ytId = getYouTubeId(track.video_url)
  if (ytId) return `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`
  if (track.cover_url) return track.cover_url
  if (track.artists?.cover_image_url) return track.artists.cover_image_url
  return null
}

function TrackCover({ track, size = 36 }: { track: Track | null; size?: number }) {
  const url = getCoverUrl(track)
  if (url) return <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
  return <span style={{ fontSize: size > 30 ? 14 : 12, color: 'var(--text-muted)' }}>♪</span>
}

function Countdown({ targetDate }: { targetDate: string }) {
  const [t, setT] = useState('')
  useEffect(() => {
    const calc = () => {
      const diff = new Date(targetDate).getTime() - Date.now()
      if (diff <= 0) { setT('Baigėsi'); return }
      const d = Math.floor(diff / 86400000)
      const h = Math.floor((diff % 86400000) / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      setT(d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`)
    }
    calc()
    const id = setInterval(calc, 30000)
    return () => clearInterval(id)
  }, [targetDate])
  return <>{t}</>
}

function TrendIndicator({ curr, prev, isNew }: { curr: number; prev: number | null; isNew: boolean }) {
  if (isNew || prev === null) return <span className="tcv-new">NEW</span>
  if (curr < prev) return <span className="tcv-up">↑{prev - curr}</span>
  if (curr > prev) return <span className="tcv-down">↓{curr - prev}</span>
  return <span className="tcv-same">—</span>
}

function Player({ entry, accent }: { entry: Entry | null; accent: ThemeAccent }) {
  const [playing, setPlaying] = useState(false)
  const [imgErr, setImgErr] = useState(false)
  useEffect(() => { setPlaying(false); setImgErr(false) }, [entry?.id])

  if (!entry || !entry.tracks) return (
    <div className="tcv-player tcv-player-empty">
      <div className="tcv-player-video">
        <div className="tcv-thumb">
          <div className="tcv-thumb-empty" />
        </div>
      </div>
    </div>
  )

  const vid = getYouTubeId(entry.tracks.video_url)
  const cover = entry.tracks.cover_url

  return (
    <div className="tcv-player">
      <div className="tcv-player-video">
        {playing && vid ? (
          <iframe
            src={`https://www.youtube.com/embed/${vid}?autoplay=1&rel=0&modestbranding=1`}
            style={{ width: '100%', height: '100%', border: 'none' }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="tcv-thumb" onClick={() => vid && setPlaying(true)} style={{ cursor: vid ? 'pointer' : 'default' }}>
            {vid && !imgErr ? (
              <img
                src={`https://img.youtube.com/vi/${vid}/maxresdefault.jpg`}
                alt=""
                className="tcv-thumb-img"
                onError={() => setImgErr(true)}
              />
            ) : cover ? (
              <img src={cover} alt="" className="tcv-thumb-img" />
            ) : (
              <div className="tcv-thumb-empty" />
            )}
            {vid && (
              <div className="tcv-play-btn" style={{ background: accent.hex }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function SuggestModal({ onClose, topType }: { onClose: () => void; topType: string }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [manualTitle, setManualTitle] = useState('')
  const [manualArtist, setManualArtist] = useState('')
  const [mode, setMode] = useState<'search' | 'manual'>('search')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (query.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/tracks?search=${encodeURIComponent(query)}&limit=6`)
      const data = await res.json()
      setResults(data.tracks || [])
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  const submit = async (trackId?: number) => {
    setSending(true)
    const res = await fetch('/api/top/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        top_type: topType, track_id: trackId || null,
        manual_title: trackId ? null : manualTitle,
        manual_artist: trackId ? null : manualArtist,
      }),
    })
    if (res.ok) setSent(true)
    setSending(false)
  }

  return (
    <div className="tcv-modal-bg" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="tcv-modal">
        <div className="tcv-modal-head">
          <span>Siūlyti dainą</span>
          <button onClick={onClose} className="tcv-modal-close">✕</button>
        </div>
        {sent ? (
          <div className="tcv-modal-sent">
            <p className="tcv-sent-title">Pasiūlymas išsiųstas</p>
            <p className="tcv-sent-sub">Adminas peržiūrės artimiausiu metu.</p>
            <button onClick={onClose} className="tcv-btn-primary">Uždaryti</button>
          </div>
        ) : (
          <div className="tcv-modal-body">
            <div className="tcv-mode-tabs">
              {(['search', 'manual'] as const).map(m => (
                <button key={m} onClick={() => setMode(m)} className={`tcv-mode-tab${mode === m ? ' active' : ''}`}>
                  {m === 'search' ? 'Ieškoti' : 'Įvesti rankiniu'}
                </button>
              ))}
            </div>
            {mode === 'search' ? (
              <div>
                <input
                  type="text" value={query} onChange={e => setQuery(e.target.value)}
                  placeholder="Dainos pavadinimas arba atlikėjas…"
                  className="tcv-input" autoFocus
                />
                {results.length > 0 && (
                  <div className="tcv-results">
                    {results.map((t: any) => (
                      <button key={t.id} onClick={() => submit(t.id)} disabled={sending} className="tcv-result-row">
                        <div className="tcv-result-cover">
                          {t.cover_url ? <img src={t.cover_url} alt="" /> : '♪'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                          <p className="tcv-result-title">{t.title}</p>
                          <p className="tcv-result-artist">{t.artist_name || t.artists?.name}</p>
                        </div>
                        <span className="tcv-result-cta">Siūlyti</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="tcv-manual">
                <input type="text" value={manualTitle} onChange={e => setManualTitle(e.target.value)} placeholder="Dainos pavadinimas" className="tcv-input" />
                <input type="text" value={manualArtist} onChange={e => setManualArtist(e.target.value)} placeholder="Atlikėjas" className="tcv-input" />
                <button onClick={() => submit()} disabled={sending || !manualTitle || !manualArtist} className="tcv-btn-primary" style={{ opacity: (!manualTitle || !manualArtist) ? 0.4 : 1 }}>
                  {sending ? 'Siunčiama…' : 'Siųsti'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ChartRow({
  entry, isActive, weekId, accent, onClick, onVoted,
  votesPerTrack, votesRemaining, weeklyLimit, dimmed,
}: {
  entry: Entry; isActive: boolean; weekId: number;
  accent: ThemeAccent; onClick: () => void;
  onVoted: (id: number) => void;
  votesPerTrack: Record<number, number>;
  votesRemaining: number; weeklyLimit: number;
  dimmed?: boolean;
}) {
  const top3 = entry.position <= 3 && !dimmed
  return (
    <div
      className={`tcv-row${top3 ? ' top3' : ''}${isActive ? ' active' : ''}${dimmed ? ' dimmed' : ''}`}
      onClick={onClick}
    >
      <div className="tcv-pos-stack">
        <div className={`tcv-pos${top3 ? ' top' : ''}`}>{entry.position}</div>
        <div className="tcv-trend">
          <TrendIndicator curr={entry.position} prev={entry.prev_position} isNew={entry.is_new} />
        </div>
      </div>
      <div className="tcv-cover">
        <TrackCover track={entry.tracks} size={40} />
      </div>
      <div className="tcv-info">
        {entry.tracks?.artists ? (
          <Link href={`/atlikejai/${entry.tracks.artists.slug}`} className="tcv-row-artist" onClick={e => e.stopPropagation()}>
            {entry.tracks.artists.name}
          </Link>
        ) : <span className="tcv-row-artist">—</span>}
        <p className="tcv-row-title">{entry.tracks?.title ?? '—'}</p>
        {entry.weeks_in_top >= 1 && (
          <WeeksProgress weeks={entry.weeks_in_top} accent={accent} />
        )}
      </div>
      {weekId > 0 && (
        <VoteButton
          entry={entry} weekId={weekId} accent={accent}
          onVoted={onVoted} votesPerTrack={votesPerTrack}
          votesRemaining={votesRemaining} weeklyLimit={weeklyLimit}
        />
      )}
    </div>
  )
}

/**
 * Weeks progress — single thin bar with proportional fill + label.
 * 1/12 sav. → bar 8% užpildytas. 12/12 → pilnai užpildytas + raudonas.
 */
function WeeksProgress({ weeks, accent }: { weeks: number; accent: ThemeAccent }) {
  const max = 12
  const w = Math.min(Math.max(weeks, 0), max)
  const pct = (w / max) * 100
  const isLast = w >= 12
  const isWarning = w >= 10
  const fillColor = isLast ? '#ef4444' : isWarning ? '#f59e0b' : accent.hex
  return (
    <span className="tcv-weeks-progress" title={`${w}/${max} sav. tope`}>
      <span className="tcv-weeks-bar">
        <span className="tcv-weeks-fill" style={{ width: pct + '%', background: fillColor }} />
      </span>
      <span className="tcv-weeks-label">{w}/{max}</span>
    </span>
  )
}

function NewcomerRow({
  entry, isActive, weekId, accent, onClick, onVoted,
  votesPerTrack, votesRemaining, weeklyLimit,
}: {
  entry: Entry; isActive: boolean; weekId: number;
  accent: ThemeAccent; onClick: () => void;
  onVoted: (id: number) => void;
  votesPerTrack: Record<number, number>;
  votesRemaining: number; weeklyLimit: number;
}) {
  return (
    <div
      className={`tcv-newcomer-row${isActive ? ' active' : ''}`}
      onClick={onClick}
    >
      <div className="tcv-newcomer-cover">
        <TrackCover track={entry.tracks} size={36} />
      </div>
      <div className="tcv-newcomer-info">
        <p className="tcv-newcomer-title">{entry.tracks?.title ?? '—'}</p>
        <p className="tcv-newcomer-artist">{entry.tracks?.artists?.name ?? '—'}</p>
      </div>
      {weekId > 0 && (
        <VoteButton
          entry={entry} weekId={weekId} accent={accent}
          onVoted={onVoted} votesPerTrack={votesPerTrack}
          votesRemaining={votesRemaining} weeklyLimit={weeklyLimit}
        />
      )}
    </div>
  )
}

function VoteButton({
  entry, weekId, onVoted, votesPerTrack, accent, weeklyLimit,
}: {
  entry: Entry; weekId: number;
  onVoted: (id: number) => void;
  votesPerTrack: Record<number, number>;
  votesRemaining?: number;
  weeklyLimit: number;
  accent: ThemeAccent;
}) {
  const [err, setErr] = useState('')
  const [bursts, setBursts] = useState<number[]>([])
  const [boosting, setBoosting] = useState(false)
  const trackId = entry.tracks?.id ?? -1
  const songVotes = votesPerTrack[trackId] || 0
  const voted = songVotes > 0
  const maxedOut = songVotes >= weeklyLimit
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // Lokalus skaitiklis ref'as — kad hold loop'as tiksliai žinotų current
  // count'ą BE async setState round-trip (kitaip persisočiame virš limit'o).
  const localVotesRef = useRef(songVotes)
  useEffect(() => { localVotesRef.current = songVotes }, [songVotes])

  const stopHold = () => {
    if (holdTimer.current) {
      clearInterval(holdTimer.current)
      holdTimer.current = null
    }
    setBoosting(false)
  }

  const sendVote = () => {
    // Naudoti REF, ne stale state — taip cap'inam tiksliai prie limit'o
    if (localVotesRef.current >= weeklyLimit || trackId < 0) return false
    localVotesRef.current += 1
    onVoted(trackId)
    const burstId = Date.now() + Math.random()
    setBursts(b => [...b, burstId])
    setTimeout(() => setBursts(b => b.filter(x => x !== burstId)), 700)

    fetch('/api/top/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track_id: trackId, week_id: weekId, vote_type: 'like' }),
    }).then(async (res) => {
      if (!res.ok) {
        const data = await res.json()
        setErr(data.error || 'Klaida')
        setTimeout(() => setErr(''), 3000)
        // Server'is atmetė — koreguojam ref'ą atgal (sync'inam)
        localVotesRef.current = Math.max(0, localVotesRef.current - 1)
      }
    }).catch(() => {
      setErr('Tinklo klaida')
      setTimeout(() => setErr(''), 3000)
      localVotesRef.current = Math.max(0, localVotesRef.current - 1)
    })

    // Limit pasiektas po šito balsavimo? Sustabdyk hold.
    if (localVotesRef.current >= weeklyLimit) stopHold()
    return true
  }

  const startHold = () => {
    holdTimer.current = setInterval(() => {
      const ok = sendVote()
      if (!ok) stopHold()
    }, 280)
    setTimeout(() => { if (holdTimer.current) setBoosting(true) }, 250)
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (maxedOut) return
    sendVote()
  }

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    if (maxedOut) return
    startHold()
  }
  const onPointerUp = () => stopHold()
  const onPointerLeave = () => stopHold()

  useEffect(() => () => stopHold(), [])

  return (
    <div className="tcv-vote-wrap" style={{ position: 'relative', flexShrink: 0 }}>
      {err && <div className="tcv-vote-err">{err}</div>}
      {bursts.map(id => (
        <div key={id} className="tcv-vote-burst" style={{ color: accent.hex }}>+1</div>
      ))}
      <button
        onClick={handleClick}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        onContextMenu={e => e.preventDefault()}
        disabled={maxedOut}
        className={`tcv-vote-btn${voted ? ' voted' : ''}${maxedOut ? ' maxed' : ''}${boosting ? ' boosting' : ''}`}
        style={voted ? { color: accent.hex, borderColor: accent.hex } : undefined}
        title={maxedOut ? `Pasiektas maks. (${weeklyLimit}) balsų` : 'Spausk arba palaikyk — iki ' + weeklyLimit}
      >
        {/* Boost arrow up — žymi kilimą į viršų (ne įprastas like) */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 19V5M5 12l7-7 7 7"/>
        </svg>
        {voted ? (
          <span className="tcv-vote-mine" aria-label="Tavo balsai">{songVotes}</span>
        ) : (
          <span className="tcv-vote-label">Balsuoti</span>
        )}
      </button>
    </div>
  )
}

export default function TopChartView({
  data,
  topType,
  title,
  subtitle,
  badge,
  accent,
  siblingHref,
  siblingLabel,
}: {
  data: TopData
  topType: 'top40' | 'lt_top30'
  title: string
  subtitle: string
  badge: string             // "TOP 40" / "LT TOP 30" — small label virš title
  accent: ThemeAccent
  siblingHref: string       // link to the other chart
  siblingLabel: string
}) {
  const { data: session } = useSession()
  const weeklyLimit = session ? 10 : 5
  const [votesPerTrack, setVotesPerTrack] = useState<Record<number, number>>({})
  const [votesRemaining, setVotesRemaining] = useState(weeklyLimit)
  const [showSuggest, setShowSuggest] = useState(false)
  const [activeEntry, setActiveEntry] = useState<Entry | null>(data.entries[0] ?? null)

  // Padalinam entries pagal state'ą:
  //   - Newcomers: weeks_in_top === 0 (dar nepateko į topą)
  //   - In top: weeks_in_top >= 1 ir position <= TOP_SIZE
  //   - Below: weeks_in_top >= 1 ir position > TOP_SIZE (iškritusios)
  const TOP_SIZE = topType === 'top40' ? 40 : 30
  const newcomers = data.entries.filter(e => (e.weeks_in_top || 0) === 0)
  const mainTop = data.entries.filter(e => (e.weeks_in_top || 0) >= 1 && (e.position || 0) <= TOP_SIZE)
  const belowTop = data.entries.filter(e => (e.weeks_in_top || 0) >= 1 && (e.position || 0) > TOP_SIZE)

  useEffect(() => { setActiveEntry(data.entries[0] ?? null) }, [data])

  const loadVoteStatus = useCallback(async () => {
    if (!data.week) return
    const res = await fetch(`/api/top/vote?week_id=${data.week.id}`)
    const d = await res.json()
    setVotesPerTrack(d.votes_per_track || {})
    setVotesRemaining(d.votes_remaining ?? weeklyLimit)
  }, [data.week?.id, weeklyLimit])  // eslint-disable-line

  useEffect(() => { loadVoteStatus() }, [loadVoteStatus])

  const handleVoted = (id: number) => {
    setVotesPerTrack(p => ({ ...p, [id]: (p[id] || 0) + 1 }))
    setVotesRemaining(p => Math.max(0, p - 1))
  }

  const weekLabel = useMemo(() => {
    if (!data.week) return null
    const d = new Date(data.week.week_start)
    const e = new Date(d); e.setDate(e.getDate() + 6)
    const fmt = (x: Date) => `${x.getDate()} ${x.toLocaleDateString('lt-LT', { month: 'short' })}`
    return `${fmt(d)} – ${fmt(e)}`
  }, [data.week])

  return (
    <>
      <style>{`
        .tcv-wrap {
          max-width: 1180px; margin: 0 auto; padding: 36px 20px 80px;
          color: var(--text-primary);
          overflow-x: hidden;        /* APSAUGA — niekas neturi išlįsti horizontaliai */
          box-sizing: border-box;
          width: 100%;
        }
        .tcv-wrap *, .tcv-wrap *::before, .tcv-wrap *::after { box-sizing: border-box; }
        /* Min-width 0 leidžia flex/grid vaikams traukti'is be horizontal overflow'o */
        .tcv-row, .tcv-newcomer-row, .tcv-info, .tcv-newcomer-info,
        .tcv-track-meta, .tcv-track-title, .tcv-newcomer-title,
        .tcv-newcomer-artist, .tcv-artist, .tcv-list, .tcv-list-wrap,
        .tcv-body, .tcv-sticky, .tcv-player, .tcv-newcomers-panel { min-width: 0; }

        /* Hero — kompaktinis: TIK title + meta + suggest mygtukas */
        .tcv-hero {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px; margin-bottom: 18px;
        }
        .tcv-hero-left { display: flex; flex-direction: column; gap: 6px; min-width: 0; flex: 1 1 auto; }
        .tcv-title {
          margin: 0; font-size: clamp(24px, 3.6vw, 36px); font-weight: 900;
          letter-spacing: -0.025em; line-height: 1.05; color: var(--text-primary);
        }
        .tcv-meta-line {
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
          font-size: 12px; color: var(--text-muted);
        }
        .tcv-meta-dot { color: var(--text-muted); opacity: 0.5; }
        .tcv-suggest-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 14px; border-radius: 10px;
          background: ${accent.hex}; color: #fff; border: none;
          font-size: 12px; font-weight: 700; cursor: pointer;
          flex-shrink: 0;
          transition: transform 0.15s, filter 0.15s;
        }
        .tcv-suggest-btn:hover { transform: translateY(-1px); filter: brightness(1.05); }

        /* Status bar */
        .tcv-status {
          display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
          padding: 12px 16px; margin-bottom: 18px;
          background: var(--bg-surface); border: 1px solid var(--border-subtle);
          border-radius: 12px;
        }
        .tcv-status-item { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-muted); }
        .tcv-status-item strong { color: var(--text-primary); font-weight: 700; }
        .tcv-status-divider { width: 1px; height: 20px; background: var(--border-subtle); }
        .tcv-countdown-pill {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 4px 10px; border-radius: 999px;
          background: ${accent.rgb}; color: ${accent.hex};
          font-size: 11px; font-weight: 700;
          border: 1px solid ${accent.rgb};
        }
        .tcv-votes-left { font-size: 12px; }

        .tcv-guest-bar {
          margin-bottom: 16px; padding: 10px 14px; border-radius: 10px;
          background: rgba(99, 102, 241, 0.08); border: 1px solid rgba(99, 102, 241, 0.2);
          color: #4338ca; font-size: 12px;
        }
        .tcv-guest-bar a { color: inherit; font-weight: 700; text-decoration: underline; text-underline-offset: 2px; }

        /* Body — mobile-first flex column. Mobile order: player → list → newcomers */
        .tcv-body {
          display: flex;
          flex-direction: column;
          gap: 12px;
          width: 100%;
        }
        /* Sticky talpina TIK player'į, newcomers bus atskirai */
        .tcv-sticky { display: flex; flex-direction: column; gap: 10px; }

        @media (min-width: 880px) {
          .tcv-body {
            display: grid;
            grid-template-columns: 1fr 320px;
            gap: 22px;
            align-items: start;
          }
          .tcv-list-wrap { grid-column: 1; grid-row: 1 / span 2; min-width: 0; }
          .tcv-sticky { grid-column: 2; grid-row: 1; position: sticky; top: 80px; }
          .tcv-newcomers-panel { grid-column: 2; grid-row: 2; margin-top: 0; }
        }
        /* ───────── MOBILE (< 880px) — agresyvus compact layout ───────── */
        @media (max-width: 880px) {
          .tcv-wrap { padding: 14px 12px 40px; }

          /* Hero: row layout — title on left, action icons on right */
          .tcv-hero { flex-direction: row; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; flex-wrap: nowrap; }
          .tcv-hero-left { flex: 1 1 auto; min-width: 0; }
          .tcv-badge { font-size: 9px; padding: 3px 7px; }
          .tcv-title { font-size: 22px; line-height: 1; }
          .tcv-sub { display: none; }
          .tcv-hero-right { flex: 0 0 auto; flex-direction: row; align-items: center; gap: 6px; }
          /* Suggest: icon only on mobile */
          .tcv-suggest-btn { padding: 7px 9px; }
          .tcv-suggest-label { display: none; }
          /* Sibling link: tiny */
          .tcv-sibling-link { font-size: 10px; padding: 5px 8px; white-space: nowrap; }

          /* Status bar: tight, single row, no divider lines */
          .tcv-status { padding: 7px 10px; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
          .tcv-status-divider { display: none; }
          .tcv-status-item { font-size: 11px; gap: 4px; }
          .tcv-countdown-pill { padding: 3px 7px; font-size: 10px; }
          .tcv-guest-bar { padding: 7px 10px; font-size: 11px; margin-bottom: 10px; }

          /* Body: flex column (DOM order: sticky pirma → top, list antra → below) */
          .tcv-sticky { position: static; display: flex; flex-direction: column; gap: 10px; top: auto; }
          .tcv-list-wrap { gap: 10px; }

          /* Player: pilnas 16:9 thumbnail, jokios info sekcijos po juo */
          .tcv-player { border-radius: 12px; }
          .tcv-player-video { aspect-ratio: 16/9; max-height: 240px; border-radius: 12px; }
          .tcv-play-btn { width: 48px; height: 48px; }
          .tcv-play-btn svg { width: 16px; height: 16px; }

          /* Newcomers panel'is — compact, hint slėpiamas */
          .tcv-newcomers-panel { padding: 10px 12px; }
          .tcv-newcomers-hint { display: none; }
          .tcv-newcomers-head { margin-bottom: 8px; }
          .tcv-newcomer-row { padding: 5px 6px; gap: 8px; }
          .tcv-newcomer-cover { width: 30px; height: 30px; border-radius: 6px; }
          .tcv-newcomer-title { font-size: 12px; }
          .tcv-newcomer-artist { font-size: 10px; }

          /* Pagrindinė lentelė: tight rows */
          .tcv-list { border-radius: 12px; }
          .tcv-row { gap: 7px; padding: 7px 9px; }
          .tcv-cover { width: 32px; height: 32px; border-radius: 6px; }
          .tcv-pos { width: 20px; font-size: 13px; }
          .tcv-pos.top { font-size: 15px; }
          .tcv-trend { width: 22px; }
          .tcv-up, .tcv-down { font-size: 10px; }
          .tcv-new { font-size: 8px; padding: 2px 4px; }
          .tcv-track-title { font-size: 12px; }
          .tcv-artist { font-size: 10px; }
          .tcv-weeks-progress { gap: 1px; }
          .tcv-week-dot { width: 3px; height: 2px; border-radius: 1px; }
          .tcv-spotify-icon { display: none; }
          .tcv-vote-btn { padding: 5px 8px; font-size: 11px; gap: 4px; }
          .tcv-vote-label { display: none; }
          .tcv-vote-mine { font-size: 10px; }

          /* Below-top dashed wrap'as compact */
          .tcv-list-below { padding: 4px; }
          .tcv-section-header { gap: 8px; }
          .tcv-section-label { font-size: 10px; }
          .tcv-section-hint { font-size: 10px; }
        }

        /* ───────── ULTRA SMALL (< 400px) — telpa visus iPhone'us ───────── */
        @media (max-width: 400px) {
          .tcv-row { gap: 6px; padding: 6px 8px; }
          .tcv-cover { width: 28px; height: 28px; }
          .tcv-pos { width: 18px; font-size: 12px; }
          .tcv-trend { width: 20px; }
          .tcv-vote-btn { padding: 4px 6px; }
          .tcv-newcomer-cover { width: 26px; height: 26px; }
        }

        /* List */
        .tcv-list {
          background: var(--bg-surface); border: 1px solid var(--border-subtle);
          border-radius: 14px; overflow: hidden;
        }
        .tcv-row {
          display: flex; align-items: center; gap: 12px;
          padding: 10px 14px; border-bottom: 1px solid var(--border-subtle);
          cursor: pointer; transition: background 0.15s;
        }
        .tcv-row:last-child { border-bottom: none; }
        .tcv-row:hover { background: var(--bg-hover); }
        .tcv-row.active { background: ${accent.rgb}; }
        .tcv-row.top3 { background: linear-gradient(90deg, ${accent.rgb} 0%, transparent 60%); }
        .tcv-row.top3.active { background: ${accent.rgb}; }

        /* Pozicijos + trendo stack — vertikaliai sutaupytos vietos */
        .tcv-pos-stack {
          display: flex; flex-direction: column; align-items: center;
          width: 32px; flex-shrink: 0; gap: 1px;
        }
        .tcv-pos {
          font-weight: 900; font-size: 17px; color: var(--text-muted);
          font-variant-numeric: tabular-nums; line-height: 1;
        }
        .tcv-pos.top { color: ${accent.hex}; font-size: 20px; }
        .tcv-trend {
          display: flex; justify-content: center; line-height: 1;
        }
        .tcv-new { font-size: 9px; font-weight: 800; padding: 2px 5px; border-radius: 4px; background: ${accent.rgb}; color: ${accent.hex}; letter-spacing: 0.06em; }
        .tcv-up { font-size: 11px; font-weight: 800; color: #10b981; }
        .tcv-down { font-size: 11px; font-weight: 800; color: #ef4444; }
        .tcv-same { font-size: 13px; color: var(--text-muted); }

        .tcv-cover {
          width: 44px; height: 44px; border-radius: 8px; overflow: hidden;
          flex-shrink: 0; background: var(--bg-elevated);
          display: flex; align-items: center; justify-content: center;
          font-size: 16px; color: var(--text-muted);
        }
        .tcv-cover img { width: 100%; height: 100%; object-fit: cover; }

        .tcv-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        /* Artist FIRST (mažas, mute), Title SECOND (didelis), Progress THIRD */
        .tcv-row-artist { font-size: 11px; color: var(--text-muted); font-weight: 500; text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; }
        .tcv-row-artist:hover { color: ${accent.hex}; }
        .tcv-row-title { margin: 0; font-size: 14px; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.25; }

        .tcv-spotify-icon { color: #1db954; opacity: 0.55; flex-shrink: 0; transition: opacity 0.15s; }
        .tcv-spotify-icon:hover { opacity: 1; }

        .tcv-votes-cell {
          font-size: 12px; font-weight: 700; color: var(--text-secondary);
          font-variant-numeric: tabular-nums; padding: 0 6px; min-width: 38px; text-align: right;
        }

        .tcv-vote-btn {
          display: flex; align-items: center; gap: 5px;
          padding: 6px 12px; border-radius: 999px;
          font-size: 12px; font-weight: 700; cursor: pointer;
          border: 1px solid var(--border-subtle); background: var(--bg-elevated);
          color: var(--text-secondary); transition: transform 0.1s, background 0.15s, border-color 0.15s, color 0.15s;
          flex-shrink: 0;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          user-select: none;
        }
        .tcv-vote-btn:hover:not(.disabled) {
          background: ${accent.rgb}; border-color: ${accent.hex}; color: ${accent.hex};
        }
        .tcv-vote-btn:active:not(.disabled) { transform: scale(0.92); }
        .tcv-vote-btn.pulsing { animation: tcv-pulse 0.2s ease-out; }
        @keyframes tcv-pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
        .tcv-vote-btn.disabled { opacity: 0.4; cursor: not-allowed; }
        .tcv-vote-count {
          font-weight: 900; font-size: 13px; min-width: 12px; text-align: center;
          font-variant-numeric: tabular-nums;
        }
        .tcv-vote-mine {
          font-weight: 800; font-size: 11px; min-width: 10px; text-align: center;
          font-variant-numeric: tabular-nums; opacity: 0.85;
        }
        .tcv-vote-btn.boosting {
          animation: tcv-boost 0.6s ease-out infinite;
          box-shadow: 0 0 0 0 ${accent.rgb};
        }
        @keyframes tcv-boost {
          0%   { box-shadow: 0 0 0 0 ${accent.rgb}; }
          50%  { box-shadow: 0 0 0 6px ${accent.rgb}; }
          100% { box-shadow: 0 0 0 0 ${accent.rgb}; }
        }
        .tcv-vote-btn.maxed { opacity: 0.5; cursor: not-allowed; }
        .tcv-vote-btn.maxed:hover { background: var(--bg-elevated); border-color: var(--border-subtle); color: var(--text-secondary); }
        .tcv-vote-err { position: absolute; bottom: calc(100% + 6px); right: 0; padding: 5px 10px; background: #fee2e2; color: #991b1b; font-size: 11px; border-radius: 6px; white-space: nowrap; z-index: 10; }
        .tcv-vote-burst {
          position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%);
          font-size: 14px; font-weight: 900; pointer-events: none;
          animation: tcv-burst 0.8s ease-out forwards;
          z-index: 5;
        }
        @keyframes tcv-burst {
          0% { opacity: 0; transform: translate(-50%, 0) scale(0.5); }
          20% { opacity: 1; transform: translate(-50%, -8px) scale(1.2); }
          100% { opacity: 0; transform: translate(-50%, -28px) scale(0.9); }
        }
        .tcv-spinner { width: 11px; height: 11px; border: 1.5px solid currentColor; border-top-color: transparent; border-radius: 50%; animation: tcv-spin 0.6s linear infinite; }
        @keyframes tcv-spin { to { transform: rotate(360deg) } }
        .tcv-vote-label { display: inline; font-size: 11px; }
        @media (max-width: 520px) { .tcv-vote-label { display: none; } .tcv-votes-cell { display: none; } }

        /* Sticky player */
        .tcv-sticky { position: sticky; top: 80px; }
        .tcv-player {
          background: var(--bg-surface); border: 1px solid var(--border-subtle);
          border-radius: 16px; overflow: hidden;
        }
        .tcv-player-empty .tcv-player-video { background: var(--bg-elevated); }
        .tcv-player-video { aspect-ratio: 16/9; position: relative; background: #000; }
        .tcv-thumb { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
        .tcv-thumb-img { width: 100%; height: 100%; object-fit: cover; }
        .tcv-thumb-empty { width: 100%; height: 100%; background: var(--bg-elevated); }
        .tcv-play-btn {
          position: absolute; width: 56px; height: 56px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 8px 26px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.3);
          transition: transform 0.15s;
        }
        .tcv-thumb:hover .tcv-play-btn { transform: scale(1.08); }

        .tcv-player-info { padding: 16px 18px; }
        .tcv-player-pos { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
        .tcv-pos-num { font-size: 14px; font-weight: 900; }
        .tcv-player-title { margin: 0 0 4px; font-size: 18px; font-weight: 800; letter-spacing: -0.015em; line-height: 1.2; color: var(--text-primary); }
        .tcv-player-artist { font-size: 13px; color: var(--text-secondary); text-decoration: none; font-weight: 600; display: block; margin-bottom: 12px; }
        .tcv-player-artist:hover { color: ${accent.hex}; }
        .tcv-player-meta { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
        .tcv-player-meta span {
          font-size: 11px; color: var(--text-secondary);
          background: var(--bg-elevated); padding: 4px 9px; border-radius: 6px;
          border: 1px solid var(--border-subtle); font-weight: 600;
        }
        .tcv-spotify-btn {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          padding: 10px; border-radius: 10px;
          background: rgba(29,185,84,0.1); border: 1px solid rgba(29,185,84,0.25);
          color: #1db954; font-size: 12px; font-weight: 800; text-decoration: none;
          transition: background 0.15s;
        }
        .tcv-spotify-btn:hover { background: rgba(29,185,84,0.18); }

        /* Empty state */
        .tcv-empty {
          padding: 64px 20px; text-align: center;
          background: var(--bg-surface); border: 1px solid var(--border-subtle);
          border-radius: 14px;
        }
        .tcv-empty-title { font-size: 22px; font-weight: 800; color: var(--text-secondary); margin: 0 0 8px; letter-spacing: -0.015em; }
        .tcv-empty-sub { font-size: 13px; color: var(--text-muted); margin: 0 0 18px; }
        .tcv-btn-primary {
          padding: 10px 22px; background: ${accent.hex}; color: #fff; border: none;
          border-radius: 10px; font-weight: 700; font-size: 13px; cursor: pointer;
          transition: filter 0.15s;
        }
        .tcv-btn-primary:hover { filter: brightness(1.06); }

        /* Modal */
        .tcv-modal-bg { position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0,0,0,0.5); backdrop-filter: blur(8px); }
        .tcv-modal { width: 100%; max-width: 460px; border-radius: 18px; background: var(--bg-surface); border: 1px solid var(--border-subtle); overflow: hidden; box-shadow: 0 30px 80px rgba(0,0,0,0.25); }
        .tcv-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border-subtle); font-size: 16px; font-weight: 800; color: var(--text-primary); }
        .tcv-modal-close { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 18px; padding: 2px 6px; border-radius: 6px; }
        .tcv-modal-close:hover { background: var(--bg-hover); color: var(--text-primary); }
        .tcv-modal-body { padding: 18px; display: flex; flex-direction: column; gap: 14px; }
        .tcv-modal-sent { padding: 36px 20px; text-align: center; }
        .tcv-sent-title { font-size: 18px; font-weight: 800; color: var(--text-primary); margin: 0 0 6px; }
        .tcv-sent-sub { font-size: 13px; color: var(--text-muted); margin: 0 0 20px; }

        .tcv-mode-tabs { display: flex; gap: 6px; }
        .tcv-mode-tab { padding: 6px 14px; border-radius: 999px; font-size: 12px; font-weight: 700; cursor: pointer; border: 1px solid var(--border-subtle); background: var(--bg-elevated); color: var(--text-muted); transition: all 0.15s; }
        .tcv-mode-tab.active { background: ${accent.hex}; color: #fff; border-color: ${accent.hex}; }

        .tcv-input { width: 100%; padding: 10px 13px; background: var(--bg-elevated); border: 1px solid var(--input-border); border-radius: 10px; color: var(--text-primary); font-size: 13px; outline: none; box-sizing: border-box; transition: border-color 0.15s; }
        .tcv-input::placeholder { color: var(--text-muted); }
        .tcv-input:focus { border-color: ${accent.hex}; }

        /* Weeks progress — thin bar with proportional fill */
        .tcv-weeks-progress {
          display: flex; align-items: center; gap: 6px;
          margin-top: 1px;
        }
        .tcv-weeks-bar {
          flex: 0 0 auto;
          width: 64px; height: 3px;
          background: var(--bg-elevated);
          border-radius: 2px;
          overflow: hidden;
          position: relative;
        }
        .tcv-weeks-fill {
          display: block; height: 100%;
          border-radius: 2px;
          transition: width 0.4s ease, background 0.3s;
        }
        .tcv-weeks-label {
          font-size: 9px; color: var(--text-muted);
          font-variant-numeric: tabular-nums;
          letter-spacing: 0.02em;
          font-weight: 600;
        }

        /* List wrapper — apsiame tiek main top'as, tiek below-top sekcija */
        .tcv-list-wrap { display: flex; flex-direction: column; gap: 16px; }

        .tcv-row.dimmed { opacity: 0.55; background: var(--bg-elevated); }
        .tcv-row.dimmed:hover { opacity: 0.8; }
        .tcv-list-below { background: transparent; border: 1px dashed var(--border-subtle); border-radius: 14px; }

        .tcv-section-header {
          display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap;
          padding: 0 4px; margin-top: 8px;
        }
        .tcv-section-label {
          font-size: 11px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase;
          color: var(--text-muted);
        }
        .tcv-section-hint { font-size: 11px; color: var(--text-muted); margin: 0; }

        .tcv-empty-inline {
          padding: 32px 16px; text-align: center; color: var(--text-muted);
          font-size: 13px;
        }

        /* Newcomers panel — pominapintai, su vote mygtukais (švelnesnis stilius) */
        .tcv-newcomers-panel {
          margin-top: 14px;
          background: linear-gradient(180deg, var(--bg-surface), ${accent.rgb});
          border: 1px solid var(--border-subtle);
          border-radius: 14px; padding: 14px;
          position: relative;
        }
        .tcv-newcomers-panel::before {
          content: '';
          position: absolute; top: 0; left: 14px; right: 14px; height: 2px;
          background: ${accent.hex}; border-radius: 0 0 2px 2px;
        }
        .tcv-newcomers-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
        .tcv-newcomers-badge {
          font-size: 10px; font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase;
          padding: 4px 9px; border-radius: 999px;
        }
        .tcv-newcomers-count { font-size: 12px; font-weight: 700; color: var(--text-secondary); }
        .tcv-newcomers-hint { margin: 0 0 12px; font-size: 11px; color: var(--text-muted); }
        .tcv-newcomers-list { display: flex; flex-direction: column; gap: 4px; }
        .tcv-newcomer-row {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 10px; border-radius: 10px;
          cursor: pointer; transition: background 0.15s;
        }
        .tcv-newcomer-row:hover { background: var(--bg-hover); }
        .tcv-newcomer-row.active { background: ${accent.rgb}; }
        .tcv-newcomer-cover {
          width: 36px; height: 36px; border-radius: 8px; flex-shrink: 0;
          background: var(--bg-elevated);
          display: flex; align-items: center; justify-content: center;
          font-size: 14px; color: var(--text-muted); overflow: hidden;
        }
        .tcv-newcomer-cover img { width: 100%; height: 100%; object-fit: cover; }
        .tcv-newcomer-info { flex: 1; min-width: 0; }
        .tcv-newcomer-title { margin: 0; font-size: 13px; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tcv-newcomer-artist { margin: 1px 0 0; font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tcv-newcomer-counter {
          font-size: 9px; font-weight: 800; letter-spacing: 0.04em;
          padding: 2px 6px; border-radius: 5px;
          background: var(--bg-elevated); color: var(--text-muted);
          border: 1px solid var(--border-subtle); flex-shrink: 0;
          font-variant-numeric: tabular-nums;
        }

        /* (legacy) suggestions panel — paliekam stiliaus pasiekiamumui, bet jau nebenaudojam */
        .tcv-suggestions-panel {
          margin-top: 14px;
          background: var(--bg-surface); border: 1px solid var(--border-subtle);
          border-radius: 14px; padding: 14px; overflow: hidden;
        }
        .tcv-suggestions-head {
          display: flex; align-items: center; gap: 7px;
          font-size: 11px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase;
          color: var(--text-muted); margin-bottom: 10px;
        }
        .tcv-suggestions-head svg { color: ${accent.hex}; }
        .tcv-suggestions-list { display: flex; flex-direction: column; gap: 4px; }
        .tcv-suggestion-row {
          display: flex; align-items: center; gap: 9px; padding: 6px 8px;
          border-radius: 8px; transition: background 0.15s;
        }
        .tcv-suggestion-row:hover { background: var(--bg-hover); }
        .tcv-suggestion-cover {
          width: 28px; height: 28px; border-radius: 6px; flex-shrink: 0;
          background: var(--bg-elevated); display: flex; align-items: center; justify-content: center;
          font-size: 12px; color: var(--text-muted);
        }
        .tcv-suggestion-info { flex: 1; min-width: 0; }
        .tcv-suggestion-title { margin: 0; font-size: 12px; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tcv-suggestion-artist { margin: 1px 0 0; font-size: 10px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tcv-suggestion-counter {
          font-size: 9px; font-weight: 800; padding: 2px 5px; border-radius: 4px;
          background: var(--bg-elevated); color: var(--text-muted);
          border: 1px solid var(--border-subtle); flex-shrink: 0;
          font-variant-numeric: tabular-nums;
        }
        .tcv-suggestions-more { margin: 8px 0 0; font-size: 10px; color: var(--text-muted); text-align: center; }

        .tcv-results { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
        .tcv-result-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: 10px; cursor: pointer; transition: background 0.15s; width: 100%; }
        .tcv-result-row:hover { background: var(--bg-hover); }
        .tcv-result-cover { width: 32px; height: 32px; border-radius: 6px; background: var(--bg-surface); display: flex; align-items: center; justify-content: center; font-size: 12px; flex-shrink: 0; overflow: hidden; color: var(--text-muted); }
        .tcv-result-cover img { width: 100%; height: 100%; object-fit: cover; }
        .tcv-result-title { font-size: 13px; font-weight: 700; color: var(--text-primary); margin: 0 0 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tcv-result-artist { font-size: 11px; color: var(--text-muted); margin: 0; }
        .tcv-result-cta { font-size: 11px; font-weight: 800; color: ${accent.hex}; flex-shrink: 0; }
        .tcv-manual { display: flex; flex-direction: column; gap: 8px; }
      `}</style>

      <div className="tcv-wrap">
        {/* Hero — kompaktinis: TIK title + suggest mygtukas */}
        <div className="tcv-hero">
          <div className="tcv-hero-left">
            <h1 className="tcv-title">{title}</h1>
            <div className="tcv-meta-line">
              {weekLabel && <span>Sav. {weekLabel}</span>}
              {data.week?.vote_close && (
                <>
                  <span className="tcv-meta-dot">·</span>
                  <span className="tcv-countdown-pill">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                    <Countdown targetDate={data.week.vote_close} />
                  </span>
                </>
              )}
              <span className="tcv-meta-dot">·</span>
              <span>iki {session ? 10 : 5}/daina</span>
            </div>
          </div>
          <button
            className="tcv-suggest-btn"
            onClick={() => setShowSuggest(true)}
            aria-label="Siūlyti dainą"
            title="Siūlyti dainą"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            <span className="tcv-suggest-label">Siūlyti dainą</span>
          </button>
        </div>

        {!session && (
          <div className="tcv-guest-bar">
            Balsuoji kaip svečias (iki 5 vienai dainai). <Link href="/auth/signin">Prisijunk</Link> — iki 10/daina.
          </div>
        )}

        {data.entries.length === 0 ? (
          <div className="tcv-empty">
            <p className="tcv-empty-title">Sąrašas dar tuščias</p>
            <p className="tcv-empty-sub">Patvirtinti pasiūlymai pateks čia kitą savaitę.</p>
            <button className="tcv-btn-primary" onClick={() => setShowSuggest(true)}>Siūlyti dainą</button>
          </div>
        ) : (
          <div className="tcv-body">
            {/* DOM order:
                  1. Sticky (Player) — mobile: top, desktop: right column row 1
                  2. List-wrap (Top + Below) — mobile: middle, desktop: left column
                  3. Newcomers panel — mobile: bottom, desktop: right column row 2 */}
            <div className="tcv-sticky">
              <Player entry={activeEntry} accent={accent} />
            </div>

            {/* MAIN LIST + BELOW */}
            <div className="tcv-list-wrap">
              <div className="tcv-list">
                {mainTop.map(entry => (
                  <ChartRow
                    key={entry.id}
                    entry={entry}
                    isActive={activeEntry?.id === entry.id}
                    weekId={data.week?.id ?? 0}
                    accent={accent}
                    onClick={() => setActiveEntry(entry)}
                    onVoted={handleVoted}
                    votesPerTrack={votesPerTrack}
                    votesRemaining={votesRemaining}
                    weeklyLimit={weeklyLimit}
                  />
                ))}
                {mainTop.length === 0 && newcomers.length > 0 && (
                  <div className="tcv-empty-inline">
                    <p>Topas dar formuojasi — naujienos kovoja už pirmas vietas →</p>
                  </div>
                )}
              </div>

              {belowTop.length > 0 && (
                <>
                  <div className="tcv-section-header">
                    <span className="tcv-section-label">Iškritusios iš topo</span>
                    <span className="tcv-section-hint">Anksčiau buvo tope, šią savaitę nepateko</span>
                  </div>
                  <div className="tcv-list tcv-list-below">
                    {belowTop.map(entry => (
                      <ChartRow
                        key={entry.id}
                        entry={entry}
                        isActive={activeEntry?.id === entry.id}
                        weekId={data.week?.id ?? 0}
                        accent={accent}
                        onClick={() => setActiveEntry(entry)}
                        onVoted={handleVoted}
                        votesPerTrack={votesPerTrack}
                        votesRemaining={votesRemaining}
                        weeklyLimit={weeklyLimit}
                        dimmed
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* NAUJIENOS — atskiras blokas. Mobile: žemiau sąrašo. Desktop: dešinėje col, row 2. */}
            {newcomers.length > 0 && (
              <div className="tcv-newcomers-panel">
                <div className="tcv-newcomers-head">
                  <span className="tcv-newcomers-badge" style={{ background: accent.hex, color: '#fff' }}>
                    Naujienos
                  </span>
                  <span className="tcv-newcomers-count">({newcomers.length})</span>
                </div>
                <p className="tcv-newcomers-hint">Kovoja už vietą tope. Balsuok lygiavertiškai.</p>
                <div className="tcv-newcomers-list">
                  {newcomers.map(entry => (
                    <NewcomerRow
                      key={entry.id}
                      entry={entry}
                      weekId={data.week?.id ?? 0}
                      accent={accent}
                      onVoted={handleVoted}
                      votesPerTrack={votesPerTrack}
                      votesRemaining={votesRemaining}
                      weeklyLimit={weeklyLimit}
                      onClick={() => setActiveEntry(entry)}
                      isActive={activeEntry?.id === entry.id}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showSuggest && (
        <SuggestModal onClose={() => setShowSuggest(false)} topType={topType} />
      )}
    </>
  )
}
