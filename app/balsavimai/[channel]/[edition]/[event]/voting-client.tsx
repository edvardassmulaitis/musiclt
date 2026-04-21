'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'

type Participant = {
  id: number
  display_name?: string | null
  display_subtitle?: string | null
  country?: string | null
  photo_url?: string | null
  video_url?: string | null
  lyrics?: string | null
  artist?: { id: number; slug: string; name: string; cover_image_url?: string } | null
  track?: { id: number; slug: string; title: string; youtube_url?: string } | null
  vote_count?: number
  avg_rating?: number
  top_n_score?: number
}

type EventData = {
  id: number
  name: string
  voting_type: 'single' | 'top_n' | 'rating'
  voting_top_n?: number | null
  rating_max: number
  requires_login: boolean
  status: string
  vote_open?: string | null
  vote_close?: string | null
}

type MyVote = {
  id: number
  participant_id: number
  rating?: number | null
  top_n_position?: number | null
}

function extractYouTubeId(url?: string | null): string | null {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/)
  return m?.[1] || null
}

export default function VotingClient({
  event,
  participants,
  showResults,
}: {
  event: EventData
  participants: Participant[]
  showResults: boolean
}) {
  const { data: session } = useSession()
  const [myVotes, setMyVotes] = useState<MyVote[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  // Top-N selections in draft
  const [topNDraft, setTopNDraft] = useState<{ participant_id: number; position: number }[]>([])

  // Sort for display if results visible
  const sortedParticipants = showResults
    ? [...participants].sort((a, b) => {
        if (event.voting_type === 'rating') return (b.avg_rating || 0) - (a.avg_rating || 0)
        if (event.voting_type === 'top_n') return (b.top_n_score || 0) - (a.top_n_score || 0)
        return (b.vote_count || 0) - (a.vote_count || 0)
      })
    : participants

  const loadMyVotes = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/voting/vote?event_id=${event.id}`)
      const data = await res.json()
      setMyVotes(data.votes || [])
      if (event.voting_type === 'top_n') {
        const draft = (data.votes || [])
          .filter((v: MyVote) => v.top_n_position != null)
          .map((v: MyVote) => ({ participant_id: v.participant_id, position: v.top_n_position! }))
        setTopNDraft(draft)
      }
    } finally {
      setLoading(false)
    }
  }, [event.id, event.voting_type])

  useEffect(() => { loadMyVotes() }, [loadMyVotes])

  const isOpen = event.status === 'voting_open'
  const votedParticipantIds = new Set(myVotes.map(v => v.participant_id))

  async function voteSingle(p: Participant) {
    if (!isOpen) return
    if (event.requires_login && !session) {
      setMessage('Reikia prisijungti, kad galėtum balsuoti')
      return
    }
    setSubmitting(true)
    setMessage(null)
    try {
      const res = await fetch('/api/voting/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: event.id, participant_id: p.id }),
      })
      const data = await res.json()
      if (!res.ok) setMessage(data.error || 'Klaida')
      else {
        setMessage(`Balsas užregistruotas${data.votes_remaining != null ? ` (liko ${data.votes_remaining})` : ''}`)
        loadMyVotes()
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function rate(p: Participant, rating: number) {
    if (!isOpen) return
    if (event.requires_login && !session) {
      setMessage('Reikia prisijungti, kad galėtum balsuoti')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/voting/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: event.id, participant_id: p.id, rating }),
      })
      const data = await res.json()
      if (!res.ok) setMessage(data.error || 'Klaida')
      else loadMyVotes()
    } finally {
      setSubmitting(false)
    }
  }

  function toggleTopN(p: Participant) {
    const existing = topNDraft.find(d => d.participant_id === p.id)
    if (existing) {
      setTopNDraft(topNDraft.filter(d => d.participant_id !== p.id)
        .map((d, i) => ({ ...d, position: i + 1 })))
    } else {
      if (event.voting_top_n && topNDraft.length >= event.voting_top_n) {
        setMessage(`Gali išrinkti tik ${event.voting_top_n} dalyvių`)
        return
      }
      setTopNDraft([...topNDraft, { participant_id: p.id, position: topNDraft.length + 1 }])
    }
  }

  async function submitTopN() {
    if (!isOpen) return
    if (event.requires_login && !session) {
      setMessage('Reikia prisijungti')
      return
    }
    if (!topNDraft.length) return setMessage('Pasirink bent vieną dalyvį')
    setSubmitting(true)
    try {
      const res = await fetch('/api/voting/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: event.id, selections: topNDraft }),
      })
      const data = await res.json()
      if (!res.ok) setMessage(data.error || 'Klaida')
      else {
        setMessage('Balsas užregistruotas')
        loadMyVotes()
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function removeVote(p: Participant) {
    setSubmitting(true)
    await fetch(`/api/voting/vote?event_id=${event.id}&participant_id=${p.id}`, { method: 'DELETE' })
    setSubmitting(false)
    loadMyVotes()
  }

  return (
    <div>
      {message && (
        <div className="mb-4 p-3 bg-orange-50 border border-orange-200 text-orange-700 rounded text-sm">
          {message}
        </div>
      )}

      {!isOpen && (
        <div className="mb-4 p-3 bg-gray-100 text-gray-600 rounded text-sm">
          Balsavimas {event.status === 'voting_closed' ? 'uždarytas' : 'dar neprasidėjo'}.
        </div>
      )}

      <div className="space-y-3">
        {sortedParticipants.map((p, idx) => {
          const ytId = extractYouTubeId(p.video_url || p.track?.youtube_url)
          const voted = votedParticipantIds.has(p.id)
          const myRating = myVotes.find(v => v.participant_id === p.id)?.rating
          const topNPos = topNDraft.find(d => d.participant_id === p.id)?.position
          const expanded = expandedId === p.id

          return (
            <div
              key={p.id}
              className={`border rounded-lg p-4 ${
                voted || topNPos ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/10' : 'border-[var(--border-default)]'
              }`}
            >
              <div className="flex items-start gap-4">
                {showResults && (
                  <div className="text-2xl font-bold text-gray-300 w-8 pt-1">#{idx + 1}</div>
                )}
                {p.photo_url || p.artist?.cover_image_url ? (
                  <img
                    src={p.photo_url || p.artist?.cover_image_url}
                    alt=""
                    className="w-16 h-16 rounded object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded bg-gray-100 flex items-center justify-center text-xs text-gray-400 flex-shrink-0">
                    {p.country}
                  </div>
                )}
                <div className="flex-1">
                  <div className="font-bold">
                    {p.display_name || p.artist?.name}
                  </div>
                  {(p.display_subtitle || p.track?.title) && (
                    <div className="text-sm text-gray-500">
                      „{p.display_subtitle || p.track?.title}"
                    </div>
                  )}

                  {showResults && (
                    <div className="text-xs text-gray-600 mt-1">
                      {event.voting_type === 'rating'
                        ? `★ ${(p.avg_rating || 0).toFixed(1)} (${p.vote_count || 0} bals.)`
                        : event.voting_type === 'top_n'
                          ? `${p.top_n_score || 0} taškų · ${p.vote_count || 0} bals.`
                          : `${p.vote_count || 0} balsų`}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {event.voting_type === 'single' && (
                      voted ? (
                        <button
                          onClick={() => removeVote(p)}
                          disabled={submitting || !isOpen}
                          className="px-3 py-1.5 border border-orange-500 text-orange-600 rounded text-sm hover:bg-orange-50"
                        >
                          ✓ Atšaukti balsą
                        </button>
                      ) : (
                        <button
                          onClick={() => voteSingle(p)}
                          disabled={submitting || !isOpen}
                          className="px-3 py-1.5 bg-orange-500 text-white rounded text-sm hover:bg-orange-600 disabled:opacity-50"
                        >
                          Balsuoti
                        </button>
                      )
                    )}

                    {event.voting_type === 'top_n' && (
                      <button
                        onClick={() => toggleTopN(p)}
                        disabled={!isOpen}
                        className={`px-3 py-1.5 rounded text-sm ${
                          topNPos
                            ? 'bg-orange-500 text-white'
                            : 'border border-orange-500 text-orange-600 hover:bg-orange-50'
                        }`}
                      >
                        {topNPos ? `#${topNPos}` : 'Rinkti'}
                      </button>
                    )}

                    {event.voting_type === 'rating' && (
                      <div className="flex gap-1">
                        {Array.from({ length: event.rating_max }, (_, i) => i + 1).map(n => (
                          <button
                            key={n}
                            onClick={() => rate(p, n)}
                            disabled={submitting || !isOpen}
                            className={`w-7 h-7 text-xs rounded border ${
                              myRating && myRating >= n
                                ? 'bg-orange-500 text-white border-orange-500'
                                : 'border-gray-300 hover:border-orange-400'
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    )}

                    {(ytId || (p.lyrics || (p.track as any)?.lyrics)) && (
                      <button
                        onClick={() => setExpandedId(expanded ? null : p.id)}
                        className="text-sm text-orange-600 hover:underline ml-auto"
                      >
                        {expanded ? 'Slėpti' : 'Peržiūra'}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {expanded && (
                <div className="mt-4 pt-4 border-t">
                  {ytId && (
                    <div className="aspect-video">
                      <iframe
                        src={`https://www.youtube.com/embed/${ytId}`}
                        className="w-full h-full rounded"
                        allowFullScreen
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {event.voting_type === 'top_n' && topNDraft.length > 0 && (
        <div className="mt-6 sticky bottom-4 p-4 bg-white dark:bg-gray-900 border border-orange-500 rounded-lg shadow-lg flex items-center justify-between">
          <div className="text-sm">
            Išrinkta <strong>{topNDraft.length}</strong>
            {event.voting_top_n && ` / ${event.voting_top_n}`} dalyvių
          </div>
          <button
            onClick={submitTopN}
            disabled={submitting || !isOpen}
            className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50 text-sm font-medium"
          >
            {submitting ? 'Siunčiama…' : 'Patvirtinti balsą'}
          </button>
        </div>
      )}
    </div>
  )
}
