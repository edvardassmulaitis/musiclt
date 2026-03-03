'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

type Artist = { id: number; slug: string; name: string; cover_image_url: string | null }
type Track = { id: number; slug: string; title: string; cover_url: string | null; spotify_id: string | null; video_url: string | null; artists: Artist }
type Entry = { id: number; position: number; prev_position: number | null; weeks_in_top: number; total_votes: number; is_new: boolean; peak_position: number | null; tracks: Track }
type Week = { id: number; top_type: string; week_start: string; is_active: boolean; vote_close?: string }
type TopData = { entries: Entry[]; week: Week | null }

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
      const d = Math.floor(diff / 86400000), h = Math.floor((diff % 86400000) / 3600000), m = Math.floor((diff % 3600000) / 60000)
      setT(d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`)
    }
    calc(); const id = setInterval(calc, 30000); return () => clearInterval(id)
  }, [targetDate])
  return <>{t}</>
}

function TrendIndicator({ curr, prev, isNew }: { curr: number; prev: number | null; isNew: boolean }) {
  if (isNew || prev === null) return <span className="tc-new">NEW</span>
  if (curr < prev) return <span className="tc-up">+{prev - curr}</span>
  if (curr > prev) return <span className="tc-down">−{curr - prev}</span>
  return <span className="tc-same">—</span>
}

function Player({ entry }: { entry: Entry | null }) {
  const [playing, setPlaying] = useState(false)
  const [imgErr, setImgErr] = useState(false)

  useEffect(() => { setPlaying(false); setImgErr(false) }, [entry?.id])

  if (!entry) return null
  const vid = getYouTubeId(entry.tracks?.video_url)
  const cover = entry.tracks?.cover_url

  return (
    <div className="tc-player">
      <div className="tc-player-video">
        {playing && vid ? (
          <iframe
            src={`https://www.youtube.com/embed/${vid}?autoplay=1&rel=0&modestbranding=1&color=white`}
            style={{ width: '100%', height: '100%', border: 'none' }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="tc-player-thumb" onClick={() => vid && setPlaying(true)} style={{ cursor: vid ? 'pointer' : 'default' }}>
            {vid && !imgErr ? (
              <img
                src={`https://img.youtube.com/vi/${vid}/maxresdefault.jpg`}
                alt=""
                className="tc-thumb-img"
                onError={() => setImgErr(true)}
              />
            ) : cover ? (
              <img src={cover} alt="" className="tc-thumb-img" style={{ filter: 'brightness(0.4)' }} />
            ) : (
              <div className="tc-thumb-empty" />
            )}
            {vid && (
              <div className="tc-play-btn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="tc-player-info">
        <div className="tc-player-pos">
          <span className="tc-pos-num" style={{ color: entry.position <= 3 ? '#f97316' : '#fff' }}>#{entry.position}</span>
          <TrendIndicator curr={entry.position} prev={entry.prev_position} isNew={entry.is_new} />
        </div>
        <p className="tc-player-title">{entry.tracks?.title}</p>
        <Link href={`/atlikejai/${entry.tracks?.artists?.slug}`} className="tc-player-artist">
          {entry.tracks?.artists?.name}
        </Link>
        <div className="tc-player-meta">
          <span>{entry.weeks_in_top} sav. tope</span>
          {entry.peak_position && entry.peak_position <= 5 && <span>rekordas #{entry.peak_position}</span>}
        </div>
        {entry.tracks?.spotify_id && (
          <a
            href={`https://open.spotify.com/track/${entry.tracks.spotify_id}`}
            target="_blank" rel="noopener noreferrer"
            className="tc-spotify-btn"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
            </svg>
            Spotify
          </a>
        )}
      </div>
    </div>
  )
}

function SuggestModal({ onClose, weekId, topType }: { onClose: () => void; weekId: number; topType: string }) {
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
      body: JSON.stringify({ top_type: topType, track_id: trackId || null, manual_title: trackId ? null : manualTitle, manual_artist: trackId ? null : manualArtist }),
    })
    if (res.ok) setSent(true)
    setSending(false)
  }

  return (
    <div className="tc-modal-bg" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="tc-modal">
        <div className="tc-modal-head">
          <span>Siūlyti dainą</span>
          <button onClick={onClose} className="tc-modal-close">✕</button>
        </div>
        {sent ? (
          <div className="tc-modal-sent">
            <p className="tc-sent-title">Pasiūlymas išsiųstas</p>
            <p className="tc-sent-sub">Adminas peržiūrės artimiausiu metu.</p>
            <button onClick={onClose} className="tc-btn-primary">Uždaryti</button>
          </div>
        ) : (
          <div className="tc-modal-body">
            <div className="tc-mode-tabs">
              {(['search', 'manual'] as const).map(m => (
                <button key={m} onClick={() => setMode(m)} className={`tc-mode-tab${mode === m ? ' active' : ''}`}>
                  {m === 'search' ? 'Ieškoti' : 'Įvesti rankiniu būdu'}
                </button>
              ))}
            </div>
            {mode === 'search' ? (
              <div>
                <input
                  type="text" value={query} onChange={e => setQuery(e.target.value)}
                  placeholder="Dainos pavadinimas arba atlikėjas…"
                  className="tc-input"
                />
                {results.length > 0 && (
                  <div className="tc-results">
                    {results.map((t: any) => (
                      <button key={t.id} onClick={() => submit(t.id)} disabled={sending} className="tc-result-row">
                        <div className="tc-result-cover">
                          {t.cover_url ? <img src={t.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }} /> : '♪'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                          <p className="tc-result-title">{t.title}</p>
                          <p className="tc-result-artist">{t.artist_name || t.artists?.name}</p>
                        </div>
                        <span className="tc-result-cta">Siūlyti</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="tc-manual">
                <input type="text" value={manualTitle} onChange={e => setManualTitle(e.target.value)} placeholder="Dainos pavadinimas" className="tc-input" />
                <input type="text" value={manualArtist} onChange={e => setManualArtist(e.target.value)} placeholder="Atlikėjas" className="tc-input" />
                <button onClick={() => submit()} disabled={sending || !manualTitle || !manualArtist} className="tc-btn-primary" style={{ opacity: (!manualTitle || !manualArtist) ? 0.4 : 1 }}>
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

function VoteButton({ entry, weekId, onVoted, votedIds, votesRemaining }: {
  entry: Entry; weekId: number; onVoted: (id: number) => void; votedIds: number[]; votesRemaining: number
}) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const voted = votedIds.includes(entry.tracks.id)

  const handleVote = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (voted || votesRemaining <= 0) return
    setLoading(true)
    const res = await fetch('/api/top/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track_id: entry.tracks.id, week_id: weekId, vote_type: 'like' }),
    })
    const data = await res.json()
    if (res.ok) onVoted(entry.tracks.id)
    else { setErr(data.error || 'Klaida'); setTimeout(() => setErr(''), 3000) }
    setLoading(false)
  }

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      {err && <div className="tc-vote-err">{err}</div>}
      <button
        onClick={handleVote}
        disabled={voted || loading || (votesRemaining <= 0 && !voted)}
        className={`tc-vote-btn${voted ? ' voted' : ''}${!voted && votesRemaining <= 0 ? ' disabled' : ''}`}
      >
        {loading
          ? <span className="tc-spinner" />
          : <svg width="11" height="11" viewBox="0 0 24 24" fill={voted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
        }
        Patinka
      </button>
    </div>
  )
}

export default function TopChartsClient({ top40, ltTop30 }: { top40: TopData; ltTop30: TopData }) {
  const { data: session } = useSession()
  const [activeTab, setActiveTab] = useState<'top40' | 'lt_top30'>('top40')
  const [votedIds, setVotedIds] = useState<number[]>([])
  const [votesRemaining, setVotesRemaining] = useState(5)
  const [showSuggest, setShowSuggest] = useState(false)
  const [activeEntry, setActiveEntry] = useState<Entry | null>(null)

  const currentData = activeTab === 'top40' ? top40 : ltTop30

  useEffect(() => {
    setActiveEntry(currentData.entries[0] ?? null)
  }, [activeTab]) // eslint-disable-line

  const loadVoteStatus = useCallback(async () => {
    if (!currentData.week) return
    const res = await fetch(`/api/top/vote?week_id=${currentData.week.id}`)
    const data = await res.json()
    setVotedIds(data.voted_track_ids || [])
    setVotesRemaining(data.votes_remaining ?? (session ? 10 : 5))
  }, [currentData.week?.id, session]) // eslint-disable-line

  useEffect(() => { loadVoteStatus() }, [loadVoteStatus])

  const handleVoted = (id: number) => {
    setVotedIds(p => [...p, id])
    setVotesRemaining(p => Math.max(0, p - 1))
  }

  const weekLabel = currentData.week ? (() => {
    const d = new Date(currentData.week.week_start)
    const e = new Date(d); e.setDate(e.getDate() + 6)
    const fmt = (d: Date) => `${d.getDate()} ${d.toLocaleDateString('lt-LT', { month: 'short' })}`
    return `${fmt(d)} – ${fmt(e)}`
  })() : null

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600&display=swap');

        .tc-wrap { max-width: 1160px; margin: 0 auto; padding: 48px 24px; font-family: 'DM Sans', sans-serif; }

        .tc-header { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 36px; gap: 16px; flex-wrap: wrap; }
        .tc-heading { font-family: 'Syne', sans-serif; font-size: 42px; font-weight: 800; color: #fff; margin: 0 0 4px; letter-spacing: -0.03em; line-height: 1; }
        .tc-subhead { color: #4b5563; font-size: 13px; margin: 0; font-weight: 400; }
        .tc-suggest-link { color: #6b7280; font-size: 12px; font-weight: 600; cursor: pointer; background: none; border: none; padding: 0; text-decoration: underline; text-underline-offset: 3px; transition: color 0.15s; }
        .tc-suggest-link:hover { color: #d1d5db; }

        .tc-controls { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; gap: 12px; flex-wrap: wrap; }
        .tc-tabs { display: flex; gap: 0; background: rgba(255,255,255,0.03); border-radius: 10px; padding: 3px; border: 1px solid rgba(255,255,255,0.06); }
        .tc-tab { padding: 7px 18px; border-radius: 7px; font-weight: 600; font-size: 13px; cursor: pointer; border: none; transition: all 0.2s; background: transparent; color: #4b5563; font-family: 'DM Sans', sans-serif; }
        .tc-tab.active { background: #1a1a2e; color: #fff; box-shadow: 0 1px 6px rgba(0,0,0,0.4); }
        .tc-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .tc-week-label { color: #374151; font-size: 12px; font-weight: 500; }
        .tc-countdown { display: flex; align-items: center; gap: 5px; padding: 5px 11px; background: rgba(234,88,12,0.08); border: 1px solid rgba(234,88,12,0.18); border-radius: 7px; font-size: 11px; font-weight: 700; color: #ea580c; }
        .tc-votes-left { display: flex; align-items: center; gap: 6px; padding: 5px 11px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07); border-radius: 7px; font-size: 11px; font-weight: 600; color: #6b7280; }
        .tc-votes-left strong { color: #e5e7eb; }

        .tc-guest-bar { margin-bottom: 20px; padding: 10px 16px; border-radius: 8px; background: rgba(30,64,175,0.07); border: 1px solid rgba(30,64,175,0.15); font-size: 12px; color: #93c5fd; }
        .tc-guest-bar a { color: #60a5fa; font-weight: 700; }

        .tc-body { display: grid; grid-template-columns: 1fr 320px; gap: 24px; align-items: start; }
        @media (max-width: 800px) { .tc-body { grid-template-columns: 1fr; } .tc-sticky { display: none; } }

        .tc-list { display: flex; flex-direction: column; gap: 1px; }
        .tc-row { display: flex; align-items: center; gap: 12px; padding: 11px 12px; border-radius: 9px; cursor: pointer; border: 1px solid transparent; transition: all 0.15s; }
        .tc-row:hover { background: rgba(255,255,255,0.04); }
        .tc-row.active { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.09); }
        .tc-row.top3 { background: rgba(234,88,12,0.04); }
        .tc-row.top3.active { background: rgba(234,88,12,0.08); border-color: rgba(234,88,12,0.15); }

        .tc-pos { width: 26px; text-align: center; flex-shrink: 0; font-family: 'Syne', sans-serif; font-weight: 800; font-size: 15px; color: #374151; }
        .tc-pos.top { color: #f97316; }

        .tc-trend { width: 32px; flex-shrink: 0; display: flex; justify-content: center; }
        .tc-new { font-size: 8px; font-weight: 800; padding: 2px 5px; border-radius: 3px; background: rgba(251,191,36,0.12); color: #f59e0b; letter-spacing: 0.06em; }
        .tc-up { font-size: 10px; font-weight: 700; color: #34d399; }
        .tc-down { font-size: 10px; font-weight: 700; color: #f87171; }
        .tc-same { font-size: 13px; color: #1f2937; }

        .tc-cover { width: 40px; height: 40px; border-radius: 6px; overflow: hidden; flex-shrink: 0; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; font-size: 14px; color: rgba(255,255,255,0.08); }
        .tc-cover img { width: 100%; height: 100%; object-fit: cover; }
        .tc-row.active .tc-cover { box-shadow: 0 0 0 2px rgba(99,102,241,0.5); }

        .tc-info { flex: 1; min-width: 0; }
        .tc-title { margin: 0 0 2px; font-size: 13px; font-weight: 600; color: #e5e7eb; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: 'DM Sans', sans-serif; }
        .tc-row.top3 .tc-title { color: #fff; }
        .tc-row.active .tc-title { color: #fff; }
        .tc-detail { display: flex; align-items: center; gap: 5px; }
        .tc-artist { font-size: 11px; color: #4b5563; font-weight: 500; text-decoration: none; transition: color 0.15s; }
        .tc-artist:hover { color: #818cf8; }
        .tc-dot { color: #1f2937; font-size: 10px; }
        .tc-weeks { font-size: 11px; color: #374151; }

        .tc-spotify-icon { color: #1db954; opacity: 0.5; flex-shrink: 0; display: flex; transition: opacity 0.15s; }
        .tc-spotify-icon:hover { opacity: 1; }

        .tc-vote-btn { display: flex; align-items: center; gap: 5px; padding: 6px 13px; border-radius: 20px; font-size: 11px; font-weight: 600; cursor: pointer; border: 1px solid rgba(255,255,255,0.09); background: rgba(255,255,255,0.04); color: #6b7280; transition: all 0.15s; flex-shrink: 0; font-family: 'DM Sans', sans-serif; }
        .tc-vote-btn:hover:not(.voted):not(.disabled) { background: rgba(239,68,68,0.12); border-color: rgba(239,68,68,0.3); color: #f87171; }
        .tc-vote-btn.voted { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.3); color: #f87171; cursor: default; }
        .tc-vote-btn.disabled { opacity: 0.3; cursor: not-allowed; }
        .tc-vote-err { position: absolute; bottom: calc(100% + 6px); right: 0; padding: 5px 10px; background: #450a0a; color: #fca5a5; font-size: 11px; border-radius: 6px; white-space: nowrap; z-index: 10; }
        .tc-spinner { width: 10px; height: 10px; border: 1.5px solid currentColor; border-top-color: transparent; border-radius: 50%; animation: tc-spin 0.6s linear infinite; display: inline-block; }
        @keyframes tc-spin { to { transform: rotate(360deg) } }

        .tc-sticky { position: sticky; top: 72px; }
        .tc-player { background: #0c111b; border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; overflow: hidden; }
        .tc-player-video { aspect-ratio: 16/9; position: relative; background: #060a12; }
        .tc-player-thumb { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
        .tc-thumb-img { width: 100%; height: 100%; object-fit: cover; }
        .tc-thumb-empty { width: 100%; height: 100%; background: #060a12; }
        .tc-play-btn { position: absolute; width: 48px; height: 48px; border-radius: 50%; background: rgba(0,0,0,0.7); border: 1.5px solid rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; transition: transform 0.15s, background 0.15s; backdrop-filter: blur(4px); }
        .tc-player-thumb:hover .tc-play-btn { transform: scale(1.08); background: rgba(0,0,0,0.85); }

        .tc-player-info { padding: 16px; }
        .tc-player-pos { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .tc-pos-num { font-family: 'Syne', sans-serif; font-size: 13px; font-weight: 800; }
        .tc-player-title { margin: 0 0 4px; font-family: 'Syne', sans-serif; font-size: 18px; font-weight: 700; color: #fff; letter-spacing: -0.02em; line-height: 1.2; }
        .tc-player-artist { font-size: 12px; color: #4b5563; text-decoration: none; font-weight: 500; transition: color 0.15s; display: block; margin-bottom: 12px; }
        .tc-player-artist:hover { color: #818cf8; }
        .tc-player-meta { display: flex; gap: 12px; margin-bottom: 12px; }
        .tc-player-meta span { font-size: 11px; color: #374151; background: rgba(255,255,255,0.03); padding: 4px 8px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.05); }
        .tc-spotify-btn { display: flex; align-items: center; justify-content: center; gap: 7px; padding: 9px; border-radius: 8px; background: rgba(29,185,84,0.07); border: 1px solid rgba(29,185,84,0.15); color: #1db954; font-size: 12px; font-weight: 700; text-decoration: none; transition: background 0.15s; }
        .tc-spotify-btn:hover { background: rgba(29,185,84,0.12); }

        .tc-exhausted { margin-top: 12px; padding: 16px; border-radius: 10px; background: rgba(30,64,175,0.07); border: 1px solid rgba(30,64,175,0.14); text-align: center; }
        .tc-exhausted p { margin: 0 0 8px; font-size: 13px; color: #e5e7eb; font-weight: 600; }
        .tc-exhausted small { display: block; font-size: 11px; color: #4b5563; margin-bottom: 12px; }

        .tc-empty { padding: 80px 0; text-align: center; }
        .tc-empty-title { font-family: 'Syne', sans-serif; font-size: 22px; font-weight: 700; color: #374151; margin: 0 0 8px; }
        .tc-empty-sub { font-size: 13px; color: #1f2937; margin: 0 0 20px; }

        .tc-btn-primary { padding: 10px 22px; background: #1d4ed8; color: #fff; border: none; border-radius: 20px; font-weight: 700; font-size: 12px; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: background 0.15s; }
        .tc-btn-primary:hover { background: #1e40af; }

        .tc-modal-bg { position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0,0,0,0.82); backdrop-filter: blur(10px); }
        .tc-modal { width: 100%; max-width: 420px; border-radius: 16px; background: #0a0f1a; border: 1px solid rgba(255,255,255,0.09); overflow: hidden; box-shadow: 0 30px 80px rgba(0,0,0,0.7); }
        .tc-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px; border-bottom: 1px solid rgba(255,255,255,0.06); font-family: 'Syne', sans-serif; font-size: 16px; font-weight: 700; color: #fff; }
        .tc-modal-close { background: none; border: none; color: #4b5563; cursor: pointer; font-size: 16px; padding: 2px; transition: color 0.15s; }
        .tc-modal-close:hover { color: #fff; }
        .tc-modal-body { padding: 18px; display: flex; flex-direction: column; gap: 14px; }
        .tc-modal-sent { padding: 36px 20px; text-align: center; }
        .tc-sent-title { font-family: 'Syne', sans-serif; font-size: 18px; font-weight: 700; color: #fff; margin: 0 0 6px; }
        .tc-sent-sub { font-size: 13px; color: #4b5563; margin: 0 0 20px; }

        .tc-mode-tabs { display: flex; gap: 6px; }
        .tc-mode-tab { padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.04); color: #4b5563; font-family: 'DM Sans', sans-serif; transition: all 0.15s; }
        .tc-mode-tab.active { background: #1d4ed8; color: #fff; border-color: transparent; }

        .tc-input { width: 100%; padding: 10px 13px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 9px; color: #e5e7eb; font-size: 13px; outline: none; box-sizing: border-box; font-family: 'DM Sans', sans-serif; transition: border-color 0.15s; }
        .tc-input::placeholder { color: #374151; }
        .tc-input:focus { border-color: rgba(99,102,241,0.4); }

        .tc-results { margin-top: 8px; display: flex; flex-direction: column; gap: 3px; }
        .tc-result-row { display: flex; align-items: center; gap: 10px; padding: 9px 11px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; cursor: pointer; transition: background 0.15s; width: 100%; }
        .tc-result-row:hover { background: rgba(255,255,255,0.06); }
        .tc-result-cover { width: 30px; height: 30px; border-radius: 5px; background: rgba(255,255,255,0.07); display: flex; align-items: center; justify-content: center; font-size: 12px; flex-shrink: 0; overflow: hidden; color: #4b5563; }
        .tc-result-title { font-size: 12px; font-weight: 600; color: #e5e7eb; margin: 0 0 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tc-result-artist { font-size: 11px; color: #4b5563; margin: 0; }
        .tc-result-cta { font-size: 11px; font-weight: 700; color: #6366f1; flex-shrink: 0; }
        .tc-manual { display: flex; flex-direction: column; gap: 8px; }
      `}</style>

      <div className="tc-wrap">
        <div className="tc-header">
          <div>
            <h1 className="tc-heading">Muzikos topai</h1>
            <p className="tc-subhead">Balsuok už mėgstamas dainas ir formuok lietuviškos muzikos istoriją.</p>
          </div>
          <button className="tc-suggest-link" onClick={() => setShowSuggest(true)}>Siūlyti dainą</button>
        </div>

        <div className="tc-controls">
          <div className="tc-tabs">
            {([['top40', 'TOP 40'], ['lt_top30', 'LT TOP 30']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setActiveTab(k)} className={`tc-tab${activeTab === k ? ' active' : ''}`}>{l}</button>
            ))}
          </div>
          <div className="tc-meta">
            {weekLabel && <span className="tc-week-label">{weekLabel}</span>}
            {currentData.week?.vote_close && (
              <span className="tc-countdown">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <Countdown targetDate={currentData.week.vote_close} />
              </span>
            )}
            <div className="tc-votes-left">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#f87171' }}>
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
              <span>Liko <strong>{votesRemaining}</strong>/{session ? 10 : 5}</span>
            </div>
          </div>
        </div>

        {!session && (
          <div className="tc-guest-bar">
            Balsuoji kaip svečias (5 balsai/sav.).{' '}
            <Link href="/auth/signin">Prisijunk</Link> ir gauk 10 balsų.
          </div>
        )}

        {currentData.entries.length === 0 ? (
          <div className="tc-empty">
            <p className="tc-empty-title">Sąrašas dar tuščias</p>
            <p className="tc-empty-sub">Patvirtinti pasiūlymai pateks čia kitą savaitę.</p>
            <button className="tc-btn-primary" onClick={() => setShowSuggest(true)}>Siūlyti dainą</button>
          </div>
        ) : (
          <div className="tc-body">
            <div className="tc-list">
              {currentData.entries.map(entry => {
                const top3 = entry.position <= 3
                const isActive = activeEntry?.id === entry.id
                return (
                  <div
                    key={entry.id}
                    className={`tc-row${top3 ? ' top3' : ''}${isActive ? ' active' : ''}`}
                    onClick={() => setActiveEntry(entry)}
                  >
                    <div className={`tc-pos${top3 ? ' top' : ''}`}>{entry.position}</div>
                    <div className="tc-trend">
                      <TrendIndicator curr={entry.position} prev={entry.prev_position} isNew={entry.is_new} />
                    </div>
                    <div className="tc-cover">
                      {entry.tracks?.cover_url ? <img src={entry.tracks.cover_url} alt="" /> : '♪'}
                    </div>
                    <div className="tc-info">
                      <p className="tc-title">{entry.tracks?.title}</p>
                      <div className="tc-detail">
                        <Link href={`/atlikejai/${entry.tracks?.artists?.slug}`} className="tc-artist" onClick={e => e.stopPropagation()}>
                          {entry.tracks?.artists?.name}
                        </Link>
                        <span className="tc-dot">·</span>
                        <span className="tc-weeks">{entry.weeks_in_top}/12 sav.</span>
                      </div>
                    </div>
                    {entry.tracks?.spotify_id && (
                      <a href={`https://open.spotify.com/track/${entry.tracks.spotify_id}`} target="_blank" rel="noopener noreferrer" className="tc-spotify-icon" onClick={e => e.stopPropagation()}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
                      </a>
                    )}
                    {currentData.week && (
                      <VoteButton entry={entry} weekId={currentData.week.id} onVoted={handleVoted} votedIds={votedIds} votesRemaining={votesRemaining} />
                    )}
                  </div>
                )
              })}
            </div>

            <div className="tc-sticky">
              <Player entry={activeEntry} />
              {!session && votesRemaining === 0 && (
                <div className="tc-exhausted">
                  <p>Panaudojai visus balsus!</p>
                  <small>Registruokis ir gauk 10 balsų per savaitę</small>
                  <Link href="/auth/signin" className="tc-btn-primary" style={{ display: 'inline-block', textDecoration: 'none' }}>Registruotis</Link>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showSuggest && currentData.week && (
        <SuggestModal onClose={() => setShowSuggest(false)} weekId={currentData.week.id} topType={activeTab} />
      )}
    </>
  )
}
