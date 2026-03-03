'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

type Artist = { id: number; slug: string; name: string; cover_image_url: string | null }
type Track = {
  id: number; slug: string; title: string; cover_url: string | null
  spotify_id: string | null; video_url: string | null; artists: Artist
}
type Entry = {
  id: number; position: number; prev_position: number | null
  weeks_in_top: number; total_votes: number; is_new: boolean; peak_position: number | null
  tracks: Track
}
type Week = { id: number; top_type: string; week_start: string; is_active: boolean; vote_close?: string }
type TopData = { entries: Entry[]; week: Week | null }

// Extract YouTube video ID from URL
function getYouTubeId(url: string | null): string | null {
  if (!url) return null
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}

function TrendBadge({ curr, prev, isNew }: { curr: number; prev: number | null; isNew: boolean }) {
  if (isNew || prev === null)
    return <span style={{ fontSize: 9, fontWeight: 900, padding: '2px 5px', borderRadius: 4, background: 'rgba(251,191,36,0.15)', color: '#fbbf24', letterSpacing: '0.05em' }}>NEW</span>
  if (curr < prev) return <span style={{ color: '#34d399', fontWeight: 900, fontSize: 11 }}>↑{prev - curr}</span>
  if (curr > prev) return <span style={{ color: '#f87171', fontWeight: 900, fontSize: 11 }}>↓{curr - prev}</span>
  return <span style={{ color: '#374151', fontSize: 14 }}>—</span>
}

function Countdown({ targetDate }: { targetDate: string }) {
  const [timeLeft, setTimeLeft] = useState('')
  useEffect(() => {
    const calc = () => {
      const diff = new Date(targetDate).getTime() - Date.now()
      if (diff <= 0) { setTimeLeft('Baigėsi'); return }
      const d = Math.floor(diff / 86400000)
      const h = Math.floor((diff % 86400000) / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      setTimeLeft(d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`)
    }
    calc(); const t = setInterval(calc, 30000); return () => clearInterval(t)
  }, [targetDate])
  return <span>{timeLeft}</span>
}

function YouTubePlayer({ videoId, title, cover }: { videoId: string | null; title: string; cover: string | null }) {
  const [playing, setPlaying] = useState(false)

  if (!videoId) {
    return (
      <div style={{
        width: '100%', aspectRatio: '16/9', borderRadius: 12, overflow: 'hidden',
        background: 'linear-gradient(135deg, #0f1923 0%, #1a2535 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        border: '1px solid rgba(255,255,255,0.06)', position: 'relative',
      }}>
        {cover && <img src={cover} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.3 }} />}
        <div style={{ position: 'relative', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 8, opacity: 0.4 }}>♪</div>
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Video nėra</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', aspectRatio: '16/9', borderRadius: 12, overflow: 'hidden', position: 'relative', background: '#000' }}>
      {!playing ? (
        <div
          onClick={() => setPlaying(true)}
          style={{ cursor: 'pointer', position: 'absolute', inset: 0 }}
        >
          <img
            src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
            alt={title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => { (e.target as HTMLImageElement).src = cover || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` }}
          />
          <div style={{
            position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 50%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,0,0,0.9)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 0 8px rgba(255,0,0,0.2)',
              transition: 'transform 0.2s',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white" style={{ marginLeft: 3 }}>
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </div>
          </div>
        </div>
      ) : (
        <iframe
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
          style={{ width: '100%', height: '100%', border: 'none' }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      )}
    </div>
  )
}

function VoteButton({ entry, weekId, onVoted, votedIds, votesRemaining }: {
  entry: Entry; weekId: number
  onVoted: (trackId: number) => void
  votedIds: number[]; votesRemaining: number
}) {
  const [loading, setLoading] = useState(false)
  const [tooltip, setTooltip] = useState('')
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
    else { setTooltip(data.error || 'Klaida'); setTimeout(() => setTooltip(''), 3000) }
    setLoading(false)
  }

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      {tooltip && (
        <div style={{
          position: 'absolute', bottom: '100%', right: 0, marginBottom: 8,
          padding: '6px 12px', background: 'rgba(127,29,29,0.95)', color: '#fca5a5',
          fontSize: 11, borderRadius: 8, whiteSpace: 'nowrap', zIndex: 10,
        }}>{tooltip}</div>
      )}
      <button
        onClick={handleVote}
        disabled={voted || loading || (votesRemaining <= 0 && !voted)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 14px', borderRadius: 20, fontSize: 11, fontWeight: 700,
          cursor: voted ? 'default' : votesRemaining > 0 ? 'pointer' : 'not-allowed',
          transition: 'all 0.15s',
          border: voted ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(255,255,255,0.1)',
          background: voted ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)',
          color: voted ? '#f87171' : votesRemaining > 0 ? '#9ca3af' : 'rgba(75,85,99,0.5)',
          opacity: (!voted && votesRemaining <= 0) ? 0.4 : 1,
        }}
      >
        {loading
          ? <span style={{ width: 10, height: 10, border: '1.5px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.6s linear infinite' }} />
          : <svg width="10" height="10" viewBox="0 0 24 24" fill={voted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
        }
        Patinka
      </button>
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
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}>
      <div style={{ width: '100%', maxWidth: 440, borderRadius: 20, overflow: 'hidden', background: '#0a0f1a', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 25px 60px rgba(0,0,0,0.6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <h3 style={{ fontWeight: 900, color: '#fff', fontSize: 17, margin: 0 }}>💡 Siūlyti dainą</h3>
          <button onClick={onClose} style={{ color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}>✕</button>
        </div>
        {sent ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <p style={{ color: '#fff', fontWeight: 800, fontSize: 18, marginBottom: 6 }}>Pasiūlymas išsiųstas!</p>
            <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 20 }}>Adminas peržiūrės ir patvirtins arba atmes.</p>
            <button onClick={onClose} style={{ padding: '10px 24px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 20, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Uždaryti</button>
          </div>
        ) : (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['search', 'manual'] as const).map(m => (
                <button key={m} onClick={() => setMode(m)} style={{
                  padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                  background: mode === m ? '#2563eb' : 'rgba(255,255,255,0.05)',
                  color: mode === m ? '#fff' : '#9ca3af',
                  border: mode === m ? 'none' : '1px solid rgba(255,255,255,0.08)',
                }}>
                  {m === 'search' ? '🔍 Ieškoti DB' : '✏️ Rankiniu būdu'}
                </button>
              ))}
            </div>
            {mode === 'search' ? (
              <div>
                <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Dainos pavadinimas arba atlikėjas…"
                  style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                {results.length > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {results.map((t: any) => (
                      <button key={t.id} onClick={() => submit(t.id)} disabled={sending}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s' }}>
                        <div style={{ width: 32, height: 32, borderRadius: 6, background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                          {t.cover_url ? <img src={t.cover_url} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }} alt="" /> : '♪'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ color: '#fff', fontSize: 13, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</p>
                          <p style={{ color: '#6b7280', fontSize: 11, margin: 0 }}>{t.artist_name || t.artists?.name}</p>
                        </div>
                        <span style={{ color: '#60a5fa', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>Siūlyti →</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input type="text" value={manualTitle} onChange={e => setManualTitle(e.target.value)} placeholder="Dainos pavadinimas"
                  style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                <input type="text" value={manualArtist} onChange={e => setManualArtist(e.target.value)} placeholder="Atlikėjas"
                  style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                <button onClick={() => submit()} disabled={sending || !manualTitle || !manualArtist}
                  style={{ padding: '11px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: (!manualTitle || !manualArtist) ? 0.5 : 1 }}>
                  {sending ? 'Siunčiama…' : 'Siųsti pasiūlymą'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
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

  // Set first entry as active by default
  useEffect(() => {
    if (currentData.entries.length > 0) setActiveEntry(currentData.entries[0])
  }, [activeTab, currentData.entries])

  const loadVoteStatus = useCallback(async () => {
    if (!currentData.week) return
    const res = await fetch(`/api/top/vote?week_id=${currentData.week.id}`)
    const data = await res.json()
    setVotedIds(data.voted_track_ids || [])
    setVotesRemaining(data.votes_remaining ?? (session ? 10 : 5))
  }, [currentData.week, session])

  useEffect(() => { loadVoteStatus() }, [loadVoteStatus])

  const handleVoted = (trackId: number) => {
    setVotedIds(p => [...p, trackId])
    setVotesRemaining(p => Math.max(0, p - 1))
  }

  const weekLabel = currentData.week
    ? (() => {
        const d = new Date(currentData.week.week_start)
        const end = new Date(d); end.setDate(end.getDate() + 6)
        return `${d.toLocaleDateString('lt-LT', { month: 'short', day: 'numeric' }).replace(' ', '\u00a0')} – ${end.toLocaleDateString('lt-LT', { month: 'short', day: 'numeric' }).replace(' ', '\u00a0')}`
      })()
    : null

  const activeVideoId = activeEntry ? getYouTubeId(activeEntry.tracks?.video_url) : null

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        .top-row:hover { background: rgba(255,255,255,0.04) !important; }
        .top-row.active { background: rgba(255,255,255,0.07) !important; border-color: rgba(255,255,255,0.1) !important; }
        .top-row { cursor: pointer; transition: background 0.15s, border-color 0.15s; }
      `}</style>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 20px', fontFamily: 'inherit' }}>

        {/* Header */}
        <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 900, color: '#fff', margin: '0 0 4px', letterSpacing: '-0.02em' }}>🏆 Muzikos topai</h1>
            <p style={{ color: '#4b5563', fontSize: 13, margin: 0 }}>Balsuok už mėgstamas dainas ir formuok lietuviškos muzikos istoriją.</p>
          </div>
          <button onClick={() => setShowSuggest(true)}
            style={{ padding: '9px 18px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#d1d5db', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            💡 Siūlyti dainą
          </button>
        </div>

        {/* Tabs + meta */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', gap: 0, background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 3, border: '1px solid rgba(255,255,255,0.07)' }}>
            {([['top40', '🌍 TOP 40'], ['lt_top30', '🇱🇹 LT TOP 30']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setActiveTab(k)}
                style={{
                  padding: '8px 20px', borderRadius: 9, fontWeight: 700, fontSize: 13,
                  transition: 'all 0.2s', cursor: 'pointer', border: 'none',
                  background: activeTab === k ? '#1d4ed8' : 'transparent',
                  color: activeTab === k ? '#fff' : '#6b7280',
                  boxShadow: activeTab === k ? '0 2px 8px rgba(29,78,216,0.4)' : 'none',
                }}>
                {l}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {weekLabel && (
              <span style={{ color: '#374151', fontSize: 12, fontWeight: 600 }}>{weekLabel}</span>
            )}
            {currentData.week?.vote_close && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.2)', borderRadius: 8, fontSize: 11, fontWeight: 700, color: '#fb923c' }}>
                ⏱ <Countdown targetDate={currentData.week.vote_close} />
              </span>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 11, fontWeight: 700 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#f87171', flexShrink: 0 }}>
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              <span style={{ color: '#d1d5db' }}>Liko <strong style={{ color: '#fff' }}>{votesRemaining}</strong>/{session ? 10 : 5}</span>
            </div>
          </div>
        </div>

        {!session && (
          <div style={{ marginBottom: 16, padding: '10px 16px', borderRadius: 10, background: 'rgba(29,78,216,0.08)', border: '1px solid rgba(29,78,216,0.18)', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
            <span>ℹ️</span>
            <span style={{ color: '#93c5fd' }}>
              Balsuoji kaip svečias (5 balsai/sav.).{' '}
              <Link href="/auth/signin" style={{ fontWeight: 800, color: '#60a5fa', textDecoration: 'underline' }}>Prisijunk</Link>
              {' '}ir gauk 10 balsų.
            </span>
          </div>
        )}

        {currentData.entries.length === 0 ? (
          <div style={{ padding: '80px 0', textAlign: 'center' }}>
            <p style={{ fontSize: 56, marginBottom: 16 }}>🏆</p>
            <p style={{ color: '#9ca3af', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Sąrašas dar tuščias</p>
            <p style={{ color: '#4b5563', fontSize: 13, marginBottom: 20 }}>Patvirtinti pasiūlymai pateks čia kitą savaitę.</p>
            <button onClick={() => setShowSuggest(true)}
              style={{ padding: '11px 24px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 20, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              💡 Siūlyti dainą
            </button>
          </div>
        ) : (
          /* Two column layout: list + player */
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>

            {/* Chart list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {currentData.entries.map((entry, i) => {
                const isTop3 = entry.position <= 3
                const isActive = activeEntry?.id === entry.id
                return (
                  <div
                    key={entry.id}
                    className={`top-row${isActive ? ' active' : ''}`}
                    onClick={() => setActiveEntry(entry)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 14px', borderRadius: 10,
                      border: `1px solid ${isActive ? 'rgba(255,255,255,0.1)' : isTop3 ? 'rgba(251,146,60,0.12)' : 'transparent'}`,
                      background: isActive ? 'rgba(255,255,255,0.07)' : isTop3 ? 'rgba(251,146,60,0.05)' : 'transparent',
                    }}
                  >
                    {/* Position */}
                    <div style={{ width: 28, textAlign: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 15, fontWeight: 900, color: isTop3 ? '#fb923c' : '#374151', fontVariantNumeric: 'tabular-nums' }}>
                        {entry.position}
                      </span>
                    </div>

                    {/* Trend */}
                    <div style={{ width: 28, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                      <TrendBadge curr={entry.position} prev={entry.prev_position} isNew={entry.is_new} />
                    </div>

                    {/* Cover */}
                    <div style={{
                      width: 42, height: 42, borderRadius: 8, overflow: 'hidden', flexShrink: 0,
                      background: 'rgba(255,255,255,0.06)',
                      boxShadow: isTop3 ? '0 2px 12px rgba(251,146,60,0.25)' : isActive ? '0 0 0 2px rgba(29,78,216,0.6)' : 'none',
                    }}>
                      {entry.tracks?.cover_url
                        ? <img src={entry.tracks.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.1)', fontSize: 16 }}>♪</div>}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        margin: '0 0 2px', fontSize: 13, fontWeight: 700,
                        color: isTop3 ? '#fff' : '#e5e7eb',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {entry.tracks?.title}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Link href={`/atlikejai/${entry.tracks?.artists?.slug}`}
                          onClick={e => e.stopPropagation()}
                          style={{ fontSize: 11, color: '#6b7280', textDecoration: 'none', fontWeight: 500 }}>
                          {entry.tracks?.artists?.name}
                        </Link>
                        <span style={{ color: '#1f2937', fontSize: 10 }}>·</span>
                        <span style={{ fontSize: 11, color: '#374151' }}>{entry.weeks_in_top}/12 sav.</span>
                        {entry.peak_position && entry.peak_position <= 5 && (
                          <>
                            <span style={{ color: '#1f2937', fontSize: 10 }}>·</span>
                            <span style={{ fontSize: 11, color: '#92400e' }}>↑#{entry.peak_position}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Spotify */}
                    {entry.tracks?.spotify_id && (
                      <a href={`https://open.spotify.com/track/${entry.tracks.spotify_id}`}
                        target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        style={{ color: '#1db954', opacity: 0.5, flexShrink: 0, display: 'flex' }}
                        title="Klausyti Spotify">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                        </svg>
                      </a>
                    )}

                    {/* Vote */}
                    {currentData.week && (
                      <VoteButton
                        entry={entry}
                        weekId={currentData.week.id}
                        onVoted={handleVoted}
                        votedIds={votedIds}
                        votesRemaining={votesRemaining}
                      />
                    )}
                  </div>
                )
              })}
            </div>

            {/* Sticky player */}
            <div style={{ position: 'sticky', top: 80 }}>
              {activeEntry && (
                <div style={{
                  background: 'linear-gradient(160deg, #0d1520 0%, #0a1018 100%)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 16, overflow: 'hidden',
                  boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                }}>
                  {/* Player */}
                  <div style={{ padding: 12 }}>
                    <YouTubePlayer
                      videoId={activeVideoId}
                      title={activeEntry.tracks?.title}
                      cover={activeEntry.tracks?.cover_url}
                    />
                  </div>

                  {/* Track info */}
                  <div style={{ padding: '0 16px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 900, padding: '3px 8px', borderRadius: 6,
                        background: activeEntry.position <= 3 ? 'rgba(251,146,60,0.15)' : 'rgba(255,255,255,0.07)',
                        color: activeEntry.position <= 3 ? '#fb923c' : '#6b7280',
                      }}>#{activeEntry.position}</span>
                      <TrendBadge curr={activeEntry.position} prev={activeEntry.prev_position} isNew={activeEntry.is_new} />
                    </div>
                    <p style={{ margin: '0 0 4px', fontWeight: 800, color: '#fff', fontSize: 16, letterSpacing: '-0.01em', lineHeight: 1.3 }}>
                      {activeEntry.tracks?.title}
                    </p>
                    <Link href={`/atlikejai/${activeEntry.tracks?.artists?.slug}`}
                      style={{ color: '#6b7280', fontSize: 12, textDecoration: 'none', fontWeight: 500 }}>
                      {activeEntry.tracks?.artists?.name}
                    </Link>

                    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 70, padding: '8px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, textAlign: 'center' }}>
                        <p style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#fff' }}>{activeEntry.total_votes}</p>
                        <p style={{ margin: 0, fontSize: 10, color: '#4b5563', marginTop: 1 }}>balsų</p>
                      </div>
                      <div style={{ flex: 1, minWidth: 70, padding: '8px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, textAlign: 'center' }}>
                        <p style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#fff' }}>{activeEntry.weeks_in_top}</p>
                        <p style={{ margin: 0, fontSize: 10, color: '#4b5563', marginTop: 1 }}>sav. tope</p>
                      </div>
                      {activeEntry.peak_position && (
                        <div style={{ flex: 1, minWidth: 70, padding: '8px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, textAlign: 'center' }}>
                          <p style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#fb923c' }}>#{activeEntry.peak_position}</p>
                          <p style={{ margin: 0, fontSize: 10, color: '#4b5563', marginTop: 1 }}>rekordas</p>
                        </div>
                      )}
                    </div>

                    {activeEntry.tracks?.spotify_id && (
                      <a href={`https://open.spotify.com/track/${activeEntry.tracks.spotify_id}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                          marginTop: 10, padding: '9px', borderRadius: 9,
                          background: 'rgba(29,185,84,0.1)', border: '1px solid rgba(29,185,84,0.2)',
                          color: '#1db954', fontSize: 12, fontWeight: 700, textDecoration: 'none',
                          transition: 'background 0.15s',
                        }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                        </svg>
                        Klausyti Spotify
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Votes exhausted */}
              {!session && votesRemaining === 0 && (
                <div style={{ marginTop: 12, padding: '16px', borderRadius: 12, background: 'rgba(29,78,216,0.08)', border: '1px solid rgba(29,78,216,0.15)', textAlign: 'center' }}>
                  <p style={{ color: '#fff', fontWeight: 700, marginBottom: 6, fontSize: 13 }}>Panaudojai visus balsus!</p>
                  <p style={{ color: '#60a5fa', fontSize: 12, marginBottom: 12 }}>Registruokis ir gauk 10 balsų per savaitę</p>
                  <Link href="/auth/signin"
                    style={{ display: 'inline-block', padding: '9px 20px', background: '#2563eb', color: '#fff', borderRadius: 20, fontWeight: 700, fontSize: 12, textDecoration: 'none' }}>
                    Registruotis
                  </Link>
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
