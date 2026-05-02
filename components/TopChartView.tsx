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

import { useState, useEffect, useCallback, useMemo } from 'react'
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
      <div className="tcv-player-video" />
      <div className="tcv-player-info">
        <p className="tcv-player-title" style={{ color: 'var(--text-muted)' }}>Pasirink dainą</p>
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
      <div className="tcv-player-info">
        <div className="tcv-player-pos">
          <span className="tcv-pos-num" style={{ color: entry.position <= 3 ? accent.hex : 'var(--text-secondary)' }}>
            #{entry.position}
          </span>
          <TrendIndicator curr={entry.position} prev={entry.prev_position} isNew={entry.is_new} />
        </div>
        <p className="tcv-player-title">{entry.tracks.title}</p>
        {entry.tracks.artists && (
          <Link href={`/atlikejai/${entry.tracks.artists.slug}`} className="tcv-player-artist">
            {entry.tracks.artists.name}
          </Link>
        )}
        <div className="tcv-player-meta">
          <span>{entry.weeks_in_top} sav. tope</span>
          {entry.peak_position && entry.peak_position <= 5 && <span>rekordas #{entry.peak_position}</span>}
        </div>
        {entry.tracks.spotify_id && (
          <a
            href={`https://open.spotify.com/track/${entry.tracks.spotify_id}`}
            target="_blank" rel="noopener noreferrer"
            className="tcv-spotify-btn"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
            </svg>
            Spotify
          </a>
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

function VoteButton({
  entry, weekId, onVoted, votedIds, votesRemaining, accent,
}: {
  entry: Entry; weekId: number;
  onVoted: (id: number) => void;
  votedIds: number[]; votesRemaining: number;
  accent: ThemeAccent;
}) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const trackId = entry.tracks?.id ?? -1
  const voted = votedIds.includes(trackId)

  const handleVote = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (voted || votesRemaining <= 0 || trackId < 0) return
    setLoading(true)
    const res = await fetch('/api/top/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track_id: trackId, week_id: weekId, vote_type: 'like' }),
    })
    const data = await res.json()
    if (res.ok) onVoted(trackId)
    else { setErr(data.error || 'Klaida'); setTimeout(() => setErr(''), 3000) }
    setLoading(false)
  }

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      {err && <div className="tcv-vote-err">{err}</div>}
      <button
        onClick={handleVote}
        disabled={voted || loading || (votesRemaining <= 0 && !voted)}
        className={`tcv-vote-btn${voted ? ' voted' : ''}${!voted && votesRemaining <= 0 ? ' disabled' : ''}`}
        style={voted ? { color: accent.hex, borderColor: accent.hex, background: accent.rgb } : undefined}
      >
        {loading
          ? <span className="tcv-spinner" />
          : <svg width="13" height="13" viewBox="0 0 24 24" fill={voted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.4">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
        }
        <span className="tcv-vote-label">{voted ? 'Patiko' : 'Patinka'}</span>
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
  const [votedIds, setVotedIds] = useState<number[]>([])
  const [votesRemaining, setVotesRemaining] = useState(5)
  const [showSuggest, setShowSuggest] = useState(false)
  const [activeEntry, setActiveEntry] = useState<Entry | null>(data.entries[0] ?? null)

  useEffect(() => { setActiveEntry(data.entries[0] ?? null) }, [data])

  const loadVoteStatus = useCallback(async () => {
    if (!data.week) return
    const res = await fetch(`/api/top/vote?week_id=${data.week.id}`)
    const d = await res.json()
    setVotedIds(d.voted_track_ids || [])
    setVotesRemaining(d.votes_remaining ?? (session ? 10 : 5))
  }, [data.week?.id, session])  // eslint-disable-line

  useEffect(() => { loadVoteStatus() }, [loadVoteStatus])

  const handleVoted = (id: number) => {
    setVotedIds(p => [...p, id])
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
        }

        /* Hero */
        .tcv-hero { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; flex-wrap: wrap; margin-bottom: 24px; }
        .tcv-hero-left { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
        .tcv-badge {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 4px 10px; border-radius: 999px;
          background: ${accent.rgb}; color: ${accent.hex};
          font-size: 11px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase;
          border: 1px solid ${accent.rgb};
          width: fit-content;
        }
        .tcv-title {
          margin: 4px 0 0; font-size: clamp(28px, 4.4vw, 40px); font-weight: 900;
          letter-spacing: -0.025em; line-height: 1.05; color: var(--text-primary);
        }
        .tcv-sub { margin: 0; color: var(--text-muted); font-size: 14px; max-width: 56ch; }
        .tcv-hero-right { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
        .tcv-suggest-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 9px 16px; border-radius: 10px;
          background: ${accent.hex}; color: #fff; border: none;
          font-size: 13px; font-weight: 700; cursor: pointer;
          box-shadow: 0 8px 22px ${accent.rgb};
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .tcv-suggest-btn:hover { transform: translateY(-1px); box-shadow: 0 12px 28px ${accent.rgb}; }
        .tcv-sibling-link {
          font-size: 12px; color: var(--text-muted); text-decoration: none; font-weight: 600;
          padding: 5px 10px; border-radius: 8px; transition: background 0.15s, color 0.15s;
        }
        .tcv-sibling-link:hover { background: var(--bg-hover); color: var(--text-secondary); }

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

        /* Body grid */
        .tcv-body { display: grid; grid-template-columns: 1fr 340px; gap: 22px; align-items: start; }
        @media (max-width: 880px) { .tcv-body { grid-template-columns: 1fr; } .tcv-sticky { display: none; } }

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

        .tcv-pos {
          width: 30px; flex-shrink: 0; text-align: center;
          font-weight: 900; font-size: 16px; color: var(--text-muted);
          font-variant-numeric: tabular-nums;
        }
        .tcv-pos.top { color: ${accent.hex}; font-size: 18px; }
        .tcv-trend {
          width: 36px; flex-shrink: 0; display: flex; justify-content: center;
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

        .tcv-info { flex: 1; min-width: 0; }
        .tcv-track-title { margin: 0 0 2px; font-size: 14px; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tcv-track-meta { display: flex; align-items: center; gap: 6px; }
        .tcv-artist { font-size: 12px; color: var(--text-secondary); font-weight: 500; text-decoration: none; }
        .tcv-artist:hover { color: ${accent.hex}; }
        .tcv-dot { color: var(--text-muted); font-size: 11px; }
        .tcv-weeks { font-size: 11px; color: var(--text-muted); }

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
          color: var(--text-secondary); transition: all 0.15s; flex-shrink: 0;
        }
        .tcv-vote-btn:hover:not(.voted):not(.disabled) {
          background: ${accent.rgb}; border-color: ${accent.hex}; color: ${accent.hex};
        }
        .tcv-vote-btn.voted { cursor: default; }
        .tcv-vote-btn.disabled { opacity: 0.4; cursor: not-allowed; }
        .tcv-vote-err { position: absolute; bottom: calc(100% + 6px); right: 0; padding: 5px 10px; background: #fee2e2; color: #991b1b; font-size: 11px; border-radius: 6px; white-space: nowrap; z-index: 10; }
        .tcv-spinner { width: 11px; height: 11px; border: 1.5px solid currentColor; border-top-color: transparent; border-radius: 50%; animation: tcv-spin 0.6s linear infinite; }
        @keyframes tcv-spin { to { transform: rotate(360deg) } }
        .tcv-vote-label { display: inline; }
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
        {/* Hero */}
        <div className="tcv-hero">
          <div className="tcv-hero-left">
            <span className="tcv-badge">{badge}</span>
            <h1 className="tcv-title">{title}</h1>
            <p className="tcv-sub">{subtitle}</p>
          </div>
          <div className="tcv-hero-right">
            <button className="tcv-suggest-btn" onClick={() => setShowSuggest(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Siūlyti dainą
            </button>
            <Link href={siblingHref} className="tcv-sibling-link">
              {siblingLabel} →
            </Link>
          </div>
        </div>

        {/* Status bar */}
        <div className="tcv-status">
          {weekLabel && (
            <div className="tcv-status-item">
              <span style={{ color: 'var(--text-muted)' }}>Savaitė</span>
              <strong>{weekLabel}</strong>
            </div>
          )}
          {data.week?.vote_close && (
            <>
              <div className="tcv-status-divider" />
              <div className="tcv-status-item">
                <span style={{ color: 'var(--text-muted)' }}>Iki pabaigos</span>
                <span className="tcv-countdown-pill">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                  <Countdown targetDate={data.week.vote_close} />
                </span>
              </div>
            </>
          )}
          <div className="tcv-status-divider" />
          <div className="tcv-status-item tcv-votes-left">
            <span style={{ color: 'var(--text-muted)' }}>Tavo balsai</span>
            <strong>{votesRemaining}</strong>
            <span style={{ color: 'var(--text-muted)' }}>/{session ? 10 : 5}</span>
          </div>
        </div>

        {!session && (
          <div className="tcv-guest-bar">
            Balsuoji kaip svečias (5 balsai/sav.). <Link href="/auth/signin">Prisijunk</Link> ir gauk 10 balsų.
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
            <div className="tcv-list">
              {data.entries.map(entry => {
                const top3 = entry.position <= 3
                const isActive = activeEntry?.id === entry.id
                return (
                  <div
                    key={entry.id}
                    className={`tcv-row${top3 ? ' top3' : ''}${isActive ? ' active' : ''}`}
                    onClick={() => setActiveEntry(entry)}
                  >
                    <div className={`tcv-pos${top3 ? ' top' : ''}`}>{entry.position}</div>
                    <div className="tcv-trend">
                      <TrendIndicator curr={entry.position} prev={entry.prev_position} isNew={entry.is_new} />
                    </div>
                    <div className="tcv-cover">
                      {entry.tracks?.cover_url ? <img src={entry.tracks.cover_url} alt="" /> : '♪'}
                    </div>
                    <div className="tcv-info">
                      <p className="tcv-track-title">{entry.tracks?.title ?? '—'}</p>
                      <div className="tcv-track-meta">
                        {entry.tracks?.artists ? (
                          <Link
                            href={`/atlikejai/${entry.tracks.artists.slug}`}
                            className="tcv-artist"
                            onClick={e => e.stopPropagation()}
                          >
                            {entry.tracks.artists.name}
                          </Link>
                        ) : <span className="tcv-artist">—</span>}
                        <span className="tcv-dot">·</span>
                        <span className="tcv-weeks">{entry.weeks_in_top} sav.</span>
                      </div>
                    </div>
                    {entry.tracks?.spotify_id && (
                      <a href={`https://open.spotify.com/track/${entry.tracks.spotify_id}`} target="_blank" rel="noopener noreferrer" className="tcv-spotify-icon" onClick={e => e.stopPropagation()}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" /></svg>
                      </a>
                    )}
                    <span className="tcv-votes-cell">{entry.total_votes}</span>
                    {data.week && (
                      <VoteButton
                        entry={entry} weekId={data.week.id} accent={accent}
                        onVoted={handleVoted} votedIds={votedIds} votesRemaining={votesRemaining}
                      />
                    )}
                  </div>
                )
              })}
            </div>

            <div className="tcv-sticky">
              <Player entry={activeEntry} accent={accent} />
            </div>
          </div>
        )}
      </div>

      {showSuggest && (
        <SuggestModal onClose={() => setShowSuggest(false)} topType={topType} />
      )}
    </>
  )
}
