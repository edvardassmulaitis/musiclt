'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

type Artist = { id: number; slug: string; name: string; cover_image_url: string | null }
type Track = { id: number; slug: string; title: string; cover_url: string | null; spotify_id: string | null; video_url: string | null; artists: Artist }
type Nomination = {
  id: number; date: string; comment: string | null; created_at: string; user_id: string
  votes: number; weighted_votes: number
  tracks: Track
}
type Winner = {
  id: number; date: string; total_votes: number; weighted_votes: number
  winning_comment: string | null; winning_user_id: string | null
  tracks: Track
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('lt-LT', { month: 'long', day: 'numeric', weekday: 'long' })
}

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
      const res = await fetch(`/api/tracks?search=${encodeURIComponent(query)}&limit=6`)
      const data = await res.json()
      setResults(data.tracks || [])
    }, 300)
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl"
        style={{ background: 'linear-gradient(135deg, #0d1117 0%, #0a1628 100%)', border: '1px solid rgba(255,255,255,0.12)' }}>

        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
          <div>
            <h3 className="font-black text-white text-xl">Siūlyti dainą</h3>
            <p className="text-gray-500 text-sm mt-0.5">Papasakok kodėl ši daina ypatinga</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-all text-lg">✕</button>
        </div>

        <div className="p-6 space-y-4">
          {!selected ? (
            <>
              <input type="text" value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Ieškoti dainos..."
                autoFocus
                className="w-full px-4 py-3 rounded-2xl text-white placeholder:text-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
              {results.length > 0 && (
                <div className="space-y-1.5">
                  {results.map((t: any) => (
                    <button key={t.id} onClick={() => setSelected(t)}
                      className="w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-all hover:scale-[1.01]"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0"
                        style={{ background: 'rgba(255,255,255,0.08)' }}>
                        {t.cover_url
                          ? <img src={t.cover_url} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-base">♪</div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{t.title}</p>
                        <p className="text-xs text-gray-500">{t.artist_name || t.artists?.name}</p>
                      </div>
                      <span className="text-xs text-blue-400 flex-shrink-0 font-bold">Rinktis →</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 p-3 rounded-2xl"
                style={{ background: 'rgba(29,78,216,0.1)', border: '1px solid rgba(29,78,216,0.25)' }}>
                <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0">
                  {selected.cover_url
                    ? <img src={selected.cover_url} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full bg-blue-900/50 flex items-center justify-center text-base">♪</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{selected.title}</p>
                  <p className="text-xs text-blue-400">{selected.artist_name || selected.artists?.name}</p>
                </div>
                <button onClick={() => setSelected(null)} className="text-xs text-gray-500 hover:text-white ml-2">Keisti</button>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">
                  Kodėl ši daina? (neprivaloma)
                </label>
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Papasakok ką ši daina tau reiškia, kokia nuotaika, kontekstas..."
                  rows={4}
                  autoFocus
                  className="w-full px-4 py-3 rounded-2xl text-white placeholder:text-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
                <p className="text-xs text-gray-600 mt-1.5">{comment.length} simbolių</p>
              </div>

              {error && (
                <p className="text-red-400 text-sm px-3 py-2 rounded-xl"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  {error}
                </p>
              )}

              <button onClick={submit}
                disabled={sending}
                className="w-full py-3.5 rounded-2xl font-black text-white text-base transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #1d4ed8, #7c3aed)' }}>
                {sending ? 'Siunčiama...' : 'Siūlyti dainą'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function NominationCard({
  nomination,
  hasVoted,
  votedNominationId,
  onVote,
  isVoting,
}: {
  nomination: Nomination
  hasVoted: boolean
  votedNominationId: number | null
  onVote: (id: number) => void
  isVoting: boolean
}) {
  const isVotedThis = votedNominationId === nomination.id
  const track = nomination.tracks

  return (
    <div className={`group relative rounded-2xl overflow-hidden transition-all duration-300 ${
      isVotedThis ? 'ring-2 ring-orange-400/60' : 'hover:translate-y-[-2px]'
    }`}
      style={{
        background: isVotedThis
          ? 'linear-gradient(135deg, rgba(251,146,60,0.1), rgba(249,115,22,0.05))'
          : 'rgba(255,255,255,0.04)',
        border: isVotedThis ? '1px solid rgba(251,146,60,0.3)' : '1px solid rgba(255,255,255,0.08)',
      }}>

      {isVotedThis && (
        <div className="absolute top-3 right-3 z-10 px-2 py-1 rounded-full text-[11px] font-black"
          style={{ background: 'rgba(251,146,60,0.2)', color: '#fb923c', border: '1px solid rgba(251,146,60,0.3)' }}>
          ✓ Tavo balsas
        </div>
      )}

      <div className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 shadow-lg">
            {track?.cover_url
              ? <img src={track.cover_url} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full bg-white/10 flex items-center justify-center text-lg">♪</div>}
          </div>
          <div className="flex-1 min-w-0">
            <Link href={`/dainos/${track?.slug}`}
              className="text-sm font-bold text-white hover:text-orange-300 transition-colors truncate block">
              {track?.title}
            </Link>
            <Link href={`/atlikejai/${track?.artists?.slug}`}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
              {track?.artists?.name}
            </Link>
          </div>
        </div>

        {nomination.comment && (
          <blockquote className="text-sm text-gray-300 italic leading-relaxed mb-4 pl-3"
            style={{ borderLeft: '2px solid rgba(255,255,255,0.15)' }}>
            "{nomination.comment}"
          </blockquote>
        )}

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-600">
              {new Date(nomination.created_at).toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="text-xs text-gray-600">
              {nomination.weighted_votes > 0 ? `${nomination.weighted_votes} balsai` : 'Dar nėra balsų'}
            </span>
          </div>

          <button
            onClick={() => !hasVoted && onVote(nomination.id)}
            disabled={hasVoted || isVoting}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black transition-all ${
              isVotedThis ? 'cursor-default' : hasVoted ? 'opacity-30 cursor-not-allowed' : 'hover:scale-105 active:scale-95 cursor-pointer'
            }`}
            style={{
              background: isVotedThis ? 'rgba(251,146,60,0.15)' : hasVoted ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #1d4ed8, #7c3aed)',
              color: isVotedThis ? '#fb923c' : 'white',
              border: isVotedThis ? '1px solid rgba(251,146,60,0.3)' : 'none',
            }}>
            {isVotedThis ? '❤️ Balsavai' : isVoting ? '...' : 'Balsuoti'}
          </button>
        </div>
      </div>
    </div>
  )
}

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
  const [hasVoted, setHasVoted] = useState(false)
  const [votedNominationId, setVotedNominationId] = useState<number | null>(null)
  const [streak, setStreak] = useState(0)
  const [isVoting, setIsVoting] = useState(false)
  const [showNominate, setShowNominate] = useState(false)
  const [hasNominatedToday, setHasNominatedToday] = useState(false)
  const [voteError, setVoteError] = useState('')

  const yesterdayWinner = winners[0]
  const historyWinners = winners.slice(1, 8)

  useEffect(() => {
    fetch('/api/dienos-daina/votes')
      .then(r => r.json())
      .then(data => {
        setHasVoted(data.has_voted)
        setVotedNominationId(data.voted_nomination_id)
        setStreak(data.streak || 0)
      })
  }, [])

  useEffect(() => {
    if (!session?.user?.id) return
    const alreadyNominated = nominations.some(n => n.user_id === session.user!.id)
    setHasNominatedToday(alreadyNominated)
  }, [nominations, session])

  const handleVote = async (nominationId: number) => {
    setIsVoting(true)
    setVoteError('')
    const res = await fetch('/api/dienos-daina/votes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nomination_id: nominationId }),
    })
    const data = await res.json()
    if (res.ok) {
      setHasVoted(true)
      setVotedNominationId(nominationId)
      setNominations(prev => [...prev.map(n =>
        n.id === nominationId
          ? { ...n, votes: n.votes + 1, weighted_votes: n.weighted_votes + (session ? 2 : 1) }
          : n
      )].sort((a, b) => b.weighted_votes - a.weighted_votes))
    } else {
      setVoteError(data.error || 'Klaida')
      setTimeout(() => setVoteError(''), 3000)
    }
    setIsVoting(false)
  }

  const handleNominated = (nomination: Nomination) => {
    setNominations(prev => [{ ...nomination, votes: 0, weighted_votes: 0 }, ...prev])
    setHasNominatedToday(true)
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(180deg, #070b14 0%, #0d1117 60%)' }}>
      <div className="max-w-[860px] mx-auto px-5 py-10">

        <div className="mb-10">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-bold uppercase tracking-widest"
                  style={{ color: 'rgba(249,115,22,0.8)' }}>Dienos daina</span>
              </div>
              <h1 className="text-4xl font-black text-white leading-tight">
                Šiandien, {new Date(today).toLocaleDateString('lt-LT', { month: 'long', day: 'numeric' })}
              </h1>
              <p className="text-gray-500 mt-1.5">
                {nominations.length === 0
                  ? 'Dar niekas nepasiūlė dainos. Būk pirmas!'
                  : `${nominations.length} ${nominations.length === 1 ? 'daina' : 'dainos'} laukia tavo balso`}
              </p>
            </div>
            {streak > 1 && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-2xl"
                style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)' }}>
                <span className="text-2xl">🔥</span>
                <div>
                  <p className="text-sm font-black text-white">{streak} dienos iš eilės</p>
                  <p className="text-xs" style={{ color: 'rgba(249,115,22,0.8)' }}>Tęsk streak'ą!</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {yesterdayWinner && (
          <div className="mb-10 rounded-3xl overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.12) 0%, rgba(168,85,247,0.06) 100%)', border: '1px solid rgba(249,115,22,0.2)' }}>
            <div className="p-6">
              <div className="flex items-center gap-2 mb-5">
                <span className="text-sm font-black uppercase tracking-widest"
                  style={{ color: 'rgba(249,115,22,0.9)' }}>
                  Vakarykštė dienos daina · {formatDate(yesterdayWinner.date)}
                </span>
              </div>
              <div className="flex items-start gap-5 flex-wrap">
                <div className="w-24 h-24 rounded-2xl overflow-hidden flex-shrink-0 shadow-2xl"
                  style={{ boxShadow: '0 8px 32px rgba(249,115,22,0.25)' }}>
                  {yesterdayWinner.tracks?.cover_url
                    ? <img src={yesterdayWinner.tracks.cover_url} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full bg-orange-900/30 flex items-center justify-center text-3xl">♪</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <Link href={`/dainos/${yesterdayWinner.tracks?.slug}`}
                    className="text-2xl font-black text-white hover:text-orange-300 transition-colors block leading-tight mb-1">
                    {yesterdayWinner.tracks?.title}
                  </Link>
                  <Link href={`/atlikejai/${yesterdayWinner.tracks?.artists?.slug}`}
                    className="text-base font-semibold transition-colors"
                    style={{ color: 'rgba(249,115,22,0.8)' }}>
                    {yesterdayWinner.tracks?.artists?.name}
                  </Link>
                  <p className="text-sm text-gray-500 mt-1">
                    {yesterdayWinner.total_votes} {yesterdayWinner.total_votes === 1 ? 'balsas' : 'balsai'}
                  </p>
                  {yesterdayWinner.winning_comment && (
                    <blockquote className="mt-3 text-sm text-gray-300 italic leading-relaxed"
                      style={{ borderLeft: '3px solid rgba(249,115,22,0.5)', paddingLeft: '1rem' }}>
                      "{yesterdayWinner.winning_comment}"
                    </blockquote>
                  )}
                </div>
              </div>
              {yesterdayWinner.tracks?.spotify_id && (
                <div className="mt-5">
                  <SpotifyEmbed trackId={yesterdayWinner.tracks.spotify_id} />
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mb-6">
          <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
            <h2 className="text-xl font-black text-white">Šiandien balsuojame</h2>
            <div className="flex items-center gap-3">
              {session ? (
                !hasNominatedToday ? (
                  <button onClick={() => setShowNominate(true)}
                    className="px-4 py-2.5 rounded-2xl text-sm font-bold text-white transition-all hover:scale-105 active:scale-95"
                    style={{ background: 'linear-gradient(135deg, #1d4ed8, #7c3aed)' }}>
                    Siūlyti dainą
                  </button>
                ) : (
                  <span className="text-xs text-gray-500 px-3 py-2 rounded-full"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    ✓ Pasiūlei šiandien
                  </span>
                )
              ) : (
                <Link href="/auth/signin"
                  className="px-4 py-2.5 rounded-2xl text-sm font-bold text-white transition-all hover:scale-105"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
                  Prisijungti ir siūlyti
                </Link>
              )}
            </div>
          </div>

          {voteError && (
            <div className="mb-3 px-4 py-2.5 rounded-xl text-sm text-red-400"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
              {voteError}
            </div>
          )}

          {!session && !hasVoted && nominations.length > 0 && (
            <div className="mb-4 px-4 py-3 rounded-2xl text-sm flex items-center gap-3"
              style={{ background: 'rgba(29,78,216,0.08)', border: '1px solid rgba(29,78,216,0.15)' }}>
              <span className="text-blue-300">
                Balsuoji kaip svečias (1x svoris).{' '}
                <Link href="/auth/signin" className="font-bold underline underline-offset-2 hover:text-white">Prisijunk</Link>
                {' '}ir tavo balsas svers 2x daugiau!
              </span>
            </div>
          )}

          {nominations.length === 0 ? (
            <div className="rounded-3xl p-12 text-center"
              style={{ background: 'rgba(255,255,255,0.03)', border: '2px dashed rgba(255,255,255,0.08)' }}>
              <p className="text-xl font-black text-white mb-2">Šiandien dar niekas nepasiūlė!</p>
              <p className="text-gray-500 mb-6">Būk pirmas — pasiūlyk dainą ir pradėk šiandienos balsavimą.</p>
              {session ? (
                <button onClick={() => setShowNominate(true)}
                  className="px-8 py-3.5 rounded-2xl font-black text-white text-base transition-all hover:scale-105"
                  style={{ background: 'linear-gradient(135deg, #1d4ed8, #7c3aed)' }}>
                  Siūlyti dainą
                </button>
              ) : (
                <Link href="/auth/signin"
                  className="inline-block px-8 py-3.5 rounded-2xl font-black text-white text-base transition-all hover:scale-105"
                  style={{ background: 'linear-gradient(135deg, #1d4ed8, #7c3aed)' }}>
                  Prisijungti ir siūlyti
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {nominations.map(n => (
                <NominationCard
                  key={n.id}
                  nomination={n}
                  hasVoted={hasVoted}
                  votedNominationId={votedNominationId}
                  onVote={handleVote}
                  isVoting={isVoting}
                />
              ))}
            </div>
          )}
        </div>

        {historyWinners.length > 0 && (
          <div className="mt-12">
            <h2 className="text-lg font-black text-white mb-4">Praėjusių dienų nugalėtojos</h2>
            <div className="space-y-2">
              {historyWinners.map(w => (
                <div key={w.id}
                  className="flex items-center gap-4 px-4 py-3 rounded-2xl transition-all hover:bg-white/5"
                  style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                  <span className="text-xs text-gray-600 w-24 flex-shrink-0">
                    {new Date(w.date).toLocaleDateString('lt-LT', { month: 'short', day: 'numeric', weekday: 'short' })}
                  </span>
                  <div className="w-9 h-9 rounded-xl overflow-hidden flex-shrink-0">
                    {w.tracks?.cover_url
                      ? <img src={w.tracks.cover_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full bg-white/10 flex items-center justify-center text-xs">♪</div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link href={`/dainos/${w.tracks?.slug}`}
                      className="text-sm font-semibold text-white hover:text-orange-300 transition-colors truncate block">
                      {w.tracks?.title}
                    </Link>
                    <p className="text-xs text-gray-600">{w.tracks?.artists?.name}</p>
                  </div>
                  <span className="text-xs text-gray-600 flex-shrink-0">
                    {w.total_votes} {w.total_votes === 1 ? 'balsas' : 'balsai'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showNominate && (
        <NominateModal onClose={() => setShowNominate(false)} onNominated={handleNominated} />
      )}
    </div>
  )
}
