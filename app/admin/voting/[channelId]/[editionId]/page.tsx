'use client'

import { useEffect, useState, useCallback, use as usePromise } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import WikipediaVotingImport from '@/components/WikipediaVotingImport'

type Edition = { id: number; channel_id: number; name: string; year?: number; slug: string; status: string; voting_channels?: { name: string; slug: string } }
type Event = {
  id: number
  edition_id: number
  slug: string
  name: string
  description?: string
  participant_type: 'artist' | 'artist_song' | 'artist_album'
  voting_type: 'single' | 'top_n' | 'rating'
  voting_top_n?: number
  rating_max: number
  requires_login: boolean
  anon_vote_limit: number
  user_vote_limit: number
  status: string
  vote_open?: string
  vote_close?: string
  results_visible: string
  sort_order: number
}
type Participant = {
  id: number
  event_id: number
  artist_id?: number
  track_id?: number
  album_id?: number
  display_name?: string
  display_subtitle?: string
  country?: string
  photo_url?: string
  video_url?: string
  sort_order: number
  is_disqualified: boolean
  artist?: { id: number; name: string; slug: string }
  track?: { id: number; title: string; slug: string }
  vote_count?: number
}

const VOTING_TYPE_LABELS: Record<string, string> = {
  single: 'Vienas balsas',
  top_n: 'TOP-N rinkimas',
  rating: 'Reitingas 1–10',
}
const PARTICIPANT_TYPE_LABELS: Record<string, string> = {
  artist: 'Atlikėjas',
  artist_song: 'Atlikėjas + daina',
  artist_album: 'Atlikėjas + albumas',
}
const STATUS_LABELS: Record<string, string> = {
  draft: 'Juodraštis',
  voting_open: 'Balsavimas atidarytas',
  voting_closed: 'Balsavimas uždarytas',
  archived: 'Archyvas',
}

export default function EditionAdmin({ params }: { params: Promise<{ channelId: string; editionId: string }> }) {
  const { channelId, editionId } = usePromise(params)
  const { data: session, status } = useSession()
  const router = useRouter()
  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  const [edition, setEdition] = useState<Edition | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [activeEventId, setActiveEventId] = useState<number | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingParticipants, setLoadingParticipants] = useState(false)
  const [showNewEvent, setShowNewEvent] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showNewParticipant, setShowNewParticipant] = useState(false)

  useEffect(() => {
    if (status === 'loading') return
    if (!isAdmin) router.push('/')
  }, [status, isAdmin, router])

  const loadEdition = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/voting/editions/${editionId}`)
    const data = await res.json()
    setEdition(data.edition)
    setEvents(data.events || [])
    if (data.events?.length && !activeEventId) setActiveEventId(data.events[0].id)
    setLoading(false)
  }, [editionId, activeEventId])

  const loadParticipants = useCallback(async () => {
    if (!activeEventId) return
    setLoadingParticipants(true)
    const res = await fetch(`/api/voting/events/${activeEventId}?results=true`)
    const data = await res.json()
    setParticipants(data.participants || [])
    setLoadingParticipants(false)
  }, [activeEventId])

  useEffect(() => { loadEdition() }, [loadEdition])
  useEffect(() => { loadParticipants() }, [loadParticipants])

  const activeEvent = events.find(e => e.id === activeEventId) || null

  async function updateEvent(patch: Partial<Event>) {
    if (!activeEvent) return
    const res = await fetch(`/api/voting/events/${activeEvent.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (res.ok) loadEdition()
  }

  async function deleteEvent(e: Event) {
    if (!confirm(`Ištrinti rinkimus „${e.name}"?`)) return
    await fetch(`/api/voting/events/${e.id}`, { method: 'DELETE' })
    if (activeEventId === e.id) setActiveEventId(null)
    loadEdition()
  }

  async function deleteParticipant(p: Participant) {
    if (!confirm(`Pašalinti dalyvį „${p.display_name || p.artist?.name}"?`)) return
    await fetch(`/api/voting/participants/${p.id}`, { method: 'DELETE' })
    loadParticipants()
  }

  if (!isAdmin) return null
  if (loading) return <div className="p-6 text-gray-400">Kraunama…</div>
  if (!edition) return <div className="p-6 text-red-500">Leidimas nerastas</div>

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-4 text-sm">
        <Link href="/admin/voting" className="text-orange-600 hover:underline">Kanalai</Link>
        <span className="mx-2 text-gray-400">/</span>
        <Link href={`/admin/voting/${channelId}`} className="text-orange-600 hover:underline">
          {edition.voting_channels?.name || 'Kanalas'}
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{edition.name}</h1>
          <div className="text-xs text-gray-500">/{edition.slug} · {STATUS_LABELS[edition.status] || edition.status}</div>
        </div>
        <button
          onClick={() => setShowNewEvent(true)}
          className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 text-sm font-medium"
        >
          + Nauji rinkimai
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Events sidebar */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase mb-2">Rinkimai</h2>
          <div className="space-y-1">
            {events.map(e => (
              <button
                key={e.id}
                onClick={() => setActiveEventId(e.id)}
                className={`w-full text-left p-3 rounded border transition ${
                  activeEventId === e.id
                    ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                    : 'border-[var(--border-default)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                <div className="font-medium text-sm">{e.name}</div>
                <div className="text-xs text-gray-500">
                  {VOTING_TYPE_LABELS[e.voting_type]} · {STATUS_LABELS[e.status]}
                </div>
              </button>
            ))}
            {events.length === 0 && (
              <div className="text-gray-400 text-sm italic p-3">Sukurk pirmus rinkimus.</div>
            )}
          </div>
        </div>

        {/* Event detail + participants */}
        <div>
          {!activeEvent ? (
            <div className="text-gray-400 text-sm italic">Pasirink rinkimus iš kairės.</div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xl font-bold">{activeEvent.name}</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowImport(true)}
                    className="px-3 py-1.5 border border-orange-500 text-orange-600 rounded hover:bg-orange-50 text-xs font-medium"
                  >
                    Importas iš Wikipedia
                  </button>
                  <button
                    onClick={() => setShowNewParticipant(true)}
                    className="px-3 py-1.5 bg-orange-500 text-white rounded hover:bg-orange-600 text-xs font-medium"
                  >
                    + Dalyvis
                  </button>
                  <button
                    onClick={() => deleteEvent(activeEvent)}
                    className="px-3 py-1.5 border border-red-300 text-red-600 rounded hover:bg-red-50 text-xs"
                  >
                    Ištrinti rinkimus
                  </button>
                </div>
              </div>

              {/* Event settings */}
              <div className="bg-[var(--bg-hover)] rounded p-4 mb-4 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Būsena</label>
                  <select
                    value={activeEvent.status}
                    onChange={e => updateEvent({ status: e.target.value as any })}
                    className="w-full px-2 py-1 border rounded bg-white dark:bg-gray-900"
                  >
                    <option value="draft">Juodraštis</option>
                    <option value="voting_open">Balsavimas atidarytas</option>
                    <option value="voting_closed">Balsavimas uždarytas</option>
                    <option value="archived">Archyvas</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Balsavimo tipas</label>
                  <select
                    value={activeEvent.voting_type}
                    onChange={e => updateEvent({ voting_type: e.target.value as any })}
                    className="w-full px-2 py-1 border rounded bg-white dark:bg-gray-900"
                  >
                    <option value="single">Vienas balsas</option>
                    <option value="top_n">TOP-N</option>
                    <option value="rating">Reitingas</option>
                  </select>
                </div>
                {activeEvent.voting_type === 'top_n' && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">TOP-N (kiek išrinkti)</label>
                    <input
                      type="number"
                      defaultValue={activeEvent.voting_top_n || 10}
                      onBlur={e => updateEvent({ voting_top_n: parseInt(e.target.value) || undefined })}
                      className="w-full px-2 py-1 border rounded bg-white dark:bg-gray-900"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Dalyvio tipas</label>
                  <select
                    value={activeEvent.participant_type}
                    onChange={e => updateEvent({ participant_type: e.target.value as any })}
                    className="w-full px-2 py-1 border rounded bg-white dark:bg-gray-900"
                  >
                    <option value="artist">Tik atlikėjas</option>
                    <option value="artist_song">Atlikėjas + daina</option>
                    <option value="artist_album">Atlikėjas + albumas</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Rezultatai matomi</label>
                  <select
                    value={activeEvent.results_visible}
                    onChange={e => updateEvent({ results_visible: e.target.value as any })}
                    className="w-full px-2 py-1 border rounded bg-white dark:bg-gray-900"
                  >
                    <option value="always">Visada</option>
                    <option value="after_close">Tik po uždarymo</option>
                    <option value="never">Niekada</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Prisijungimas</label>
                  <select
                    value={activeEvent.requires_login ? 'y' : 'n'}
                    onChange={e => updateEvent({ requires_login: e.target.value === 'y' })}
                    className="w-full px-2 py-1 border rounded bg-white dark:bg-gray-900"
                  >
                    <option value="n">Anon + registruoti</option>
                    <option value="y">Tik registruoti</option>
                  </select>
                </div>
              </div>

              {/* Participants list */}
              <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">
                Dalyviai ({participants.length})
              </h3>
              {loadingParticipants ? (
                <div className="text-gray-400 text-sm">Kraunama…</div>
              ) : (
                <div className="space-y-1">
                  {participants.map(p => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 p-3 border rounded hover:bg-[var(--bg-hover)]"
                    >
                      <div className="w-8 text-center text-xs text-gray-400">#{p.sort_order + 1}</div>
                      {p.photo_url ? (
                        <img src={p.photo_url} alt="" className="w-10 h-10 rounded object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-gray-200 flex items-center justify-center text-xs text-gray-400">
                          {p.country || '—'}
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="font-medium text-sm">
                          {p.display_name || p.artist?.name || 'Nenurodyta'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {p.display_subtitle || p.track?.title}
                          {p.artist && <span className="ml-2">· Atlikėjas #{p.artist.id}</span>}
                        </div>
                      </div>
                      {p.vote_count !== undefined && (
                        <div className="text-sm font-semibold text-orange-600">{p.vote_count}</div>
                      )}
                      <button
                        onClick={() => deleteParticipant(p)}
                        className="text-xs px-2 py-1 border border-red-300 text-red-600 rounded hover:bg-red-50"
                      >
                        Šalinti
                      </button>
                    </div>
                  ))}
                  {participants.length === 0 && (
                    <div className="text-gray-400 text-sm italic p-3 border border-dashed rounded">
                      Dalyvių nėra. Pridėk rankiniu būdu arba importuok iš Wikipedia.
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showNewEvent && (
        <NewEventModal
          editionId={edition.id}
          onClose={() => setShowNewEvent(false)}
          onCreated={() => {
            setShowNewEvent(false)
            loadEdition()
          }}
        />
      )}

      {showNewParticipant && activeEventId && (
        <NewParticipantModal
          eventId={activeEventId}
          onClose={() => setShowNewParticipant(false)}
          onCreated={() => {
            setShowNewParticipant(false)
            loadParticipants()
          }}
        />
      )}

      {showImport && activeEventId && (
        <WikipediaVotingImport
          eventId={activeEventId}
          onClose={() => setShowImport(false)}
          onDone={() => {
            setShowImport(false)
            loadParticipants()
          }}
        />
      )}
    </div>
  )
}

// ============================================================================
// Modal: New Event
// ============================================================================
function NewEventModal({
  editionId, onClose, onCreated,
}: { editionId: number; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [participantType, setParticipantType] = useState<'artist' | 'artist_song' | 'artist_album'>('artist_song')
  const [votingType, setVotingType] = useState<'single' | 'top_n' | 'rating'>('single')
  const [topN, setTopN] = useState(10)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name) return alert('Įrašyk pavadinimą')
    setSaving(true)
    const res = await fetch('/api/voting/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        edition_id: editionId,
        name,
        participant_type: participantType,
        voting_type: votingType,
        voting_top_n: votingType === 'top_n' ? topN : null,
      }),
    })
    setSaving(false)
    if (res.ok) onCreated()
    else alert((await res.json()).error)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow-lg w-full max-w-md m-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">Nauji rinkimai</h2>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-gray-600">Pavadinimas *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              placeholder="pvz. Metų daina"
            />
          </div>
          <div>
            <label className="text-sm text-gray-600">Dalyvio tipas</label>
            <select
              value={participantType}
              onChange={e => setParticipantType(e.target.value as any)}
              className="w-full px-3 py-2 border rounded"
            >
              <option value="artist">Tik atlikėjas</option>
              <option value="artist_song">Atlikėjas + daina</option>
              <option value="artist_album">Atlikėjas + albumas</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-gray-600">Balsavimo tipas</label>
            <select
              value={votingType}
              onChange={e => setVotingType(e.target.value as any)}
              className="w-full px-3 py-2 border rounded"
            >
              <option value="single">Vienas balsas</option>
              <option value="top_n">TOP-N</option>
              <option value="rating">Reitingas 1–10</option>
            </select>
          </div>
          {votingType === 'top_n' && (
            <div>
              <label className="text-sm text-gray-600">TOP-N kiekis</label>
              <input
                type="number"
                value={topN}
                onChange={e => setTopN(parseInt(e.target.value) || 10)}
                className="w-full px-3 py-2 border rounded"
              />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 border rounded">Atšaukti</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 bg-orange-500 text-white rounded disabled:opacity-50">
            {saving ? 'Saugoma…' : 'Sukurti'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Modal: New Participant (manual)
// ============================================================================
function NewParticipantModal({
  eventId, onClose, onCreated,
}: { eventId: number; onClose: () => void; onCreated: () => void }) {
  const [artistName, setArtistName] = useState('')
  const [songTitle, setSongTitle] = useState('')
  const [country, setCountry] = useState('')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!artistName) return alert('Įrašyk atlikėjo vardą')
    setSaving(true)
    const res = await fetch('/api/voting/participants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: eventId,
        artist_name: artistName,
        song_title: songTitle || undefined,
        country: country || undefined,
        youtube_url: youtubeUrl || undefined,
        photo_url: photoUrl || undefined,
        display_name: country ? `${country} — ${artistName}` : artistName,
        display_subtitle: songTitle || undefined,
      }),
    })
    setSaving(false)
    if (res.ok) onCreated()
    else alert((await res.json()).error)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow-lg w-full max-w-md m-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">Naujas dalyvis</h2>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-gray-600">Atlikėjas / grupė *</label>
            <input type="text" value={artistName} onChange={e => setArtistName(e.target.value)} className="w-full px-3 py-2 border rounded" />
            <div className="text-xs text-gray-400 mt-1">Jei atlikėjo nėra DB — bus sukurtas automatiškai.</div>
          </div>
          <div>
            <label className="text-sm text-gray-600">Daina (nebūtina)</label>
            <input type="text" value={songTitle} onChange={e => setSongTitle(e.target.value)} className="w-full px-3 py-2 border rounded" />
          </div>
          <div>
            <label className="text-sm text-gray-600">Šalis</label>
            <input type="text" value={country} onChange={e => setCountry(e.target.value)} className="w-full px-3 py-2 border rounded" placeholder="pvz. Lithuania" />
          </div>
          <div>
            <label className="text-sm text-gray-600">YouTube URL</label>
            <input type="text" value={youtubeUrl} onChange={e => setYoutubeUrl(e.target.value)} className="w-full px-3 py-2 border rounded" />
          </div>
          <div>
            <label className="text-sm text-gray-600">Nuotraukos URL</label>
            <input type="text" value={photoUrl} onChange={e => setPhotoUrl(e.target.value)} className="w-full px-3 py-2 border rounded" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 border rounded">Atšaukti</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 bg-orange-500 text-white rounded disabled:opacity-50">
            {saving ? 'Saugoma…' : 'Pridėti'}
          </button>
        </div>
      </div>
    </div>
  )
}
