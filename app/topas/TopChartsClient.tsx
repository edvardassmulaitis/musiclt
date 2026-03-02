'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

type Artist = { id: number; slug: string; name: string; cover_image_url: string | null }
type Track = { id: number; slug: string; title: string; cover_url: string | null; spotify_id: string | null; video_url: string | null; artists: Artist }
type Entry = {
  id: number; position: number; prev_position: number | null
  weeks_in_top: number; total_votes: number; is_new: boolean; peak_position: number | null
  tracks: Track
}
type Week = { id: number; top_type: string; week_start: string; is_active: boolean }
type TopData = { entries: Entry[]; week: Week | null }

function TrendBadge({ curr, prev, isNew }: { curr: number; prev: number | null; isNew: boolean }) {
  if (isNew || prev === null)
    return <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300 whitespace-nowrap">NEW</span>
  if (curr < prev)
    return <span className="flex items-center gap-0.5 text-emerald-400 font-black text-xs">↑<span className="text-[10px]">{prev - curr}</span></span>
  if (curr > prev)
    return <span className="flex items-center gap-0.5 text-red-400 font-black text-xs">↓<span className="text-[10px]">{curr - prev}</span></span>
  return <span className="text-[#1e2e42] text-sm">—</span>
}

function VoteButton({ entry, weekId, onVoted, votedIds, votesRemaining }: {
  entry: Entry; weekId: number
  onVoted: (trackId: number) => void
  votedIds: number[]; votesRemaining: number
}) {
  const [loading, setLoading] = useState(false)
  const [tooltip, setTooltip] = useState('')
  const voted = votedIds.includes(entry.tracks.id)

  const handleVote = async () => {
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
    <div className="relative flex-shrink-0">
      {tooltip && (
        <div className="absolute bottom-full right-0 mb-2 px-3 py-1.5 bg-red-900/90 text-red-300 text-xs rounded-lg whitespace-nowrap z-10 shadow-xl">
          {tooltip}
        </div>
      )}
      <button
        onClick={handleVote}
        disabled={voted || loading || (votesRemaining <= 0 && !voted)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all select-none ${
          voted
            ? 'bg-red-500/20 text-red-400 border border-red-500/30 cursor-default'
            : votesRemaining > 0
            ? 'bg-white/[0.08] hover:bg-red-500/20 text-gray-400 hover:text-red-400 border border-white/10 hover:border-red-500/30 hover:scale-105 active:scale-95'
            : 'opacity-30 cursor-not-allowed bg-white/5 text-gray-600 border border-white/[0.08]'
        }`}
      >
        {loading
          ? <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
          : (
            <svg width="11" height="11" viewBox="0 0 24 24" fill={voted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          )
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
      body: JSON.stringify({
        top_type: topType,
        track_id: trackId || null,
        manual_title: trackId ? null : manualTitle,
        manual_artist: trackId ? null : manualArtist,
      }),
    })
    if (res.ok) setSent(true)
    setSending(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.12)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h3 className="font-black text-white text-lg">Siūlyti dainą</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none px-1">✕</button>
        </div>
        {sent ? (
          <div className="p-8 text-center">
            <p className="text-4xl mb-3">✅</p>
            <p className="text-white font-bold text-lg mb-1">Pasiūlymas išsiųstas!</p>
            <p className="text-gray-400 text-sm">Adminas peržiūrės ir patvirtins arba atmes.</p>
            <button onClick={onClose} className="mt-5 px-6 py-2.5 bg-blue-600 text-white rounded-full font-bold text-sm">Uždaryti</button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="flex gap-2">
              {(['search', 'manual'] as const).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${mode === m ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-400 border border-white/10'}`}>
                  {m === 'search' ? '🔍 Ieškoti DB' : '✏️ Įvesti rankiniu būdu'}
                </button>
              ))}
            </div>
            {mode === 'search' ? (
              <div>
                <input type="text" value={query} onChange={e => setQuery(e.target.value)}
                  placeholder="Dainos pavadinimas arba atlikėjas…"
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500 text-sm" />
                {results.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {results.map((t: any) => (
                      <button key={t.id} onClick={() => submit(t.id)} disabled={sending}
                        className="w-full flex items-center gap-3 px-3 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-left">
                        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-xs">♪</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{t.title}</p>
                          <p className="text-xs text-gray-500">{t.artist_name || t.artists?.name}</p>
                        </div>
                        <span className="text-xs text-blue-400 flex-shrink-0">Siūlyti</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <input type="text" value={manualTitle} onChange={e => setManualTitle(e.target.value)}
                  placeholder="Dainos pavadinimas"
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500 text-sm" />
                <input type="text" value={manualArtist} onChange={e => setManualArtist(e.target.value)}
                  placeholder="Atlikėjas"
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500 text-sm" />
                <button onClick={() => submit()} disabled={sending || !manualTitle || !manualArtist}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-colors disabled:opacity-50">
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

  const currentData = activeTab === 'top40' ? top40 : ltTop30

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
        return `${d.toLocaleDateString('lt-LT', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('lt-LT', { month: 'short', day: 'numeric' })}`
      })()
    : null

  return (
    <div className="max-w-[860px] mx-auto px-5 py-10">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-black text-white mb-2">🏆 Muzikos topai</h1>
        <p className="text-gray-400 text-sm">Balsuok už mėgstamas dainas ir formuok lietuviškos muzikos istoriją.</p>
      </div>

      {/* Tab + controls */}
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div className="flex rounded-xl overflow-hidden border border-white/10">
          {([['top40', '🌍 TOP 40'], ['lt_top30', '🇱🇹 LT TOP 30']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setActiveTab(k)}
              className={`px-5 py-2.5 font-bold text-sm transition-all ${activeTab === k ? 'bg-[#1d4ed8] text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {weekLabel && <span className="text-xs text-gray-500">{weekLabel}</span>}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-red-400">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            <span className="text-gray-300">
              Liko <span className="text-white font-black">{votesRemaining}</span>/{session ? 10 : 5} balsų
            </span>
          </div>
          <button onClick={() => setShowSuggest(true)}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 transition-colors">
            💡 Siūlyti dainą
          </button>
        </div>
      </div>

      {/* Guest banner */}
      {!session && (
        <div className="mb-5 px-4 py-3 rounded-xl text-sm flex items-center gap-3"
          style={{ background: 'rgba(29,78,216,0.1)', border: '1px solid rgba(29,78,216,0.2)' }}>
          <span>ℹ️</span>
          <span className="text-blue-300">
            Balsuoji kaip svečias (5 balsai/sav.).{' '}
            <Link href="/auth/signin" className="font-bold underline underline-offset-2 hover:text-white">Prisijunk</Link>
            {' '}ir gauk 10 balsų bei papildomų galimybių.
          </span>
        </div>
      )}

      {/* Chart list */}
      {currentData.entries.length === 0 ? (
        <div className="py-24 text-center">
          <p className="text-6xl mb-4">🏆</p>
          <p className="text-gray-400 text-lg font-semibold">Sąrašas dar tuščias</p>
          <p className="text-gray-600 text-sm mt-2">Adminas netrukus pridės dainų arba galite pasiūlyti.</p>
          <button onClick={() => setShowSuggest(true)}
            className="mt-5 px-6 py-2.5 bg-blue-600 text-white rounded-full font-bold text-sm">
            💡 Siūlyti dainą
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {currentData.entries.map(entry => {
            const isTop3 = entry.position <= 3
            return (
              <div key={entry.id}
                className={`group flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all ${
                  isTop3
                    ? 'bg-gradient-to-r from-orange-500/[0.08] to-transparent border border-orange-500/15'
                    : 'hover:bg-white/5 border border-transparent hover:border-white/[0.08]'
                }`}>

                {/* Position */}
                <div className="w-8 flex-shrink-0 text-center">
                  <span className={`text-base font-black ${isTop3 ? 'text-orange-400' : 'text-gray-600'}`}>
                    {entry.position}
                  </span>
                </div>

                {/* Trend */}
                <div className="w-8 flex-shrink-0 flex justify-center">
                  <TrendBadge curr={entry.position} prev={entry.prev_position} isNew={entry.is_new} />
                </div>

                {/* Cover */}
                <div className="w-11 h-11 flex-shrink-0 rounded-lg overflow-hidden flex items-center justify-center text-sm"
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    boxShadow: isTop3 ? '0 4px 16px rgba(249,115,22,0.2)' : undefined,
                  }}>
                  {entry.tracks?.cover_url
                    ? <img src={entry.tracks.cover_url} alt="" className="w-full h-full object-cover" />
                    : <span style={{ color: 'rgba(255,255,255,0.15)' }}>♪</span>}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <span className={`text-sm font-bold truncate block ${isTop3 ? 'text-white' : 'text-gray-200 group-hover:text-white'} transition-colors`}>
                    {entry.tracks?.title}
                  </span>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <Link href={`/atlikejai/${entry.tracks?.artists?.slug}`}
                      onClick={e => e.stopPropagation()}
                      className="text-xs text-gray-500 hover:text-blue-400 transition-colors font-medium">
                      {entry.tracks?.artists?.name}
                    </Link>
                    <span className="text-gray-700 text-xs">·</span>
                    <span className="text-xs text-gray-700">{entry.weeks_in_top}/12 sav.</span>
                    {entry.peak_position && entry.peak_position <= 5 && (
                      <>
                        <span className="text-gray-700 text-xs">·</span>
                        <span className="text-xs text-amber-600">↑#{entry.peak_position}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Spotify link */}
                {entry.tracks?.spotify_id && (
                  <a href={`https://open.spotify.com/track/${entry.tracks.spotify_id}`}
                    target="_blank" rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-green-500 hover:text-green-400 transition-colors opacity-60 hover:opacity-100 flex-shrink-0"
                    title="Klausyti Spotify">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
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
      )}

      {/* Votes exhausted CTA */}
      {!session && votesRemaining === 0 && (
        <div className="mt-6 px-5 py-4 rounded-2xl text-center"
          style={{ background: 'rgba(29,78,216,0.1)', border: '1px solid rgba(29,78,216,0.2)' }}>
          <p className="text-white font-bold mb-1">Panaudojai visus balsus šiai savaitei!</p>
          <p className="text-blue-300 text-sm mb-3">Registruokis ir gauk 10 balsų (dvigubai daugiau ir svarbesnių!)</p>
          <Link href="/auth/signin"
            className="inline-block px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-bold text-sm transition-colors">
            Registruotis / Prisijungti
          </Link>
        </div>
      )}

      {/* Suggest modal */}
      {showSuggest && currentData.week && (
        <SuggestModal onClose={() => setShowSuggest(false)} weekId={currentData.week.id} topType={activeTab} />
      )}
    </div>
  )
}
