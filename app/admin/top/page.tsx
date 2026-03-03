'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type TopType = 'top40' | 'lt_top30'
type TabType = 'entries' | 'suggestions'

type Week = {
  id: number
  top_type: TopType
  week_start: string
  is_active: boolean
}

type Entry = {
  id: number
  position: number
  prev_position: number | null
  weeks_in_top: number
  total_votes: number
  is_new: boolean
  peak_position: number | null
  tracks: {
    id: number; slug: string; title: string; cover_url: string | null
    artists: { id: number; slug: string; name: string }
  }
}

type Suggestion = {
  id: number
  top_type: TopType
  status: string
  created_at: string
  manual_title: string | null
  manual_artist: string | null
  tracks: { id: number; title: string; artists: { name: string }[] } | null
}

function TrendBadge({ curr, prev }: { curr: number; prev: number | null }) {
  if (prev === null)
    return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200">NEW</span>
  if (curr < prev)
    return <span className="text-emerald-600 font-bold text-xs">↑{prev - curr}</span>
  if (curr > prev)
    return <span className="text-red-500 font-bold text-xs">↓{curr - prev}</span>
  return <span className="text-gray-300 text-xs">—</span>
}

function AdminTopInner() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  const [topType, setTopType] = useState<TopType>('top40')
  const [tab, setTab] = useState<TabType>('entries')
  const [activeWeek, setActiveWeek] = useState<Week | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [suggestionStatus, setSuggestionStatus] = useState('pending')
  const [loading, setLoading] = useState(false)
  const [trackSearch, setTrackSearch] = useState('')
  const [trackResults, setTrackResults] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/auth/signin'); return }
    if (status === 'authenticated' && !isAdmin) { router.push('/'); return }
  }, [status, isAdmin, router])

  // Gauti aktyvią savaitę (auto-kuriama serverio pusėje)
  const loadActiveWeek = useCallback(async () => {
    const res = await fetch(`/api/top/weeks?type=${topType}&limit=1`)
    const data = await res.json()
    const active = (data.weeks || []).find((w: Week) => w.is_active) || data.weeks?.[0] || null
    setActiveWeek(active)
    return active
  }, [topType])

  const loadEntries = useCallback(async (week?: Week | null) => {
    const w = week ?? activeWeek
    if (!w) return
    setLoading(true)
    const res = await fetch(`/api/top/entries?type=${topType}&week_id=${w.id}`)
    const data = await res.json()
    setEntries(data.entries || [])
    setLoading(false)
  }, [topType, activeWeek])

  const loadSuggestions = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/top/suggestions?status=${suggestionStatus}`)
    const data = await res.json()
    setSuggestions(data.suggestions || [])
    setLoading(false)
  }, [suggestionStatus])

  useEffect(() => {
    if (status !== 'authenticated' || !isAdmin) return
    loadActiveWeek().then(week => {
      if (tab === 'entries') loadEntries(week)
    })
  }, [status, isAdmin, topType]) // eslint-disable-line

  useEffect(() => {
    if (status !== 'authenticated' || !isAdmin) return
    if (tab === 'entries') loadEntries()
    if (tab === 'suggestions') loadSuggestions()
  }, [tab, suggestionStatus]) // eslint-disable-line

  // Track search
  useEffect(() => {
    if (trackSearch.length < 2) { setTrackResults([]); return }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/tracks?search=${encodeURIComponent(trackSearch)}&limit=10`)
      const data = await res.json()
      // Filtruoti - tik tikros dainos (ne atlikėjai)
      const filtered = (data.tracks || []).filter((t: any) =>
        t.id && t.title && t.title !== t.artist_name
      )
      setTrackResults(filtered)
    }, 300)
    return () => clearTimeout(t)
  }, [trackSearch])

  const addToTop = async (trackId: number) => {
    if (!activeWeek) {
      setMsg('Klaida: nėra aktyvios savaitės')
      setTimeout(() => setMsg(''), 3000)
      return
    }
    setSaving(true)
    const nextPos = entries.length + 1
    const res = await fetch('/api/top/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week_id: activeWeek.id, track_id: trackId, position: nextPos }),
    })
    const d = await res.json()
    if (res.ok) {
      setMsg('Daina pridėta ✓')
      loadEntries()
      setTrackSearch('')
      setTrackResults([])
    } else {
      setMsg('Klaida: ' + d.error)
    }
    setSaving(false)
    setTimeout(() => setMsg(''), 3000)
  }

  const reviewSuggestion = async (id: number, newStatus: string) => {
    await fetch('/api/top/suggestions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: newStatus }),
    })
    loadSuggestions()
  }

  if (status === 'loading') return (
    <div className="min-h-screen bg-[#f8f7f5] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const weekLabel = activeWeek
    ? new Date(activeWeek.week_start).toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' })
    : null

  return (
    <div className="min-h-screen bg-[#f8f7f5] p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-center gap-2 text-sm">
            <Link href="/admin" className="text-gray-400 hover:text-gray-700 transition-colors">Admin</Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-800 font-semibold">🏆 TOP Sąrašai</span>
          </div>
          {weekLabel && (
            <span className="text-xs text-gray-400 bg-white border border-gray-200 px-3 py-1.5 rounded-full">
              📅 Savaitė nuo {weekLabel}
            </span>
          )}
        </div>

        {msg && (
          <div className={`mb-4 px-4 py-2.5 rounded-xl text-sm font-medium ${
            msg.startsWith('Klaida')
              ? 'bg-red-50 border border-red-200 text-red-700'
              : 'bg-green-50 border border-green-200 text-green-700'
          }`}>{msg}</div>
        )}

        {/* TOP type switcher */}
        <div className="flex gap-2 mb-5">
          {(['top40', 'lt_top30'] as const).map(t => (
            <button key={t} onClick={() => setTopType(t)}
              className={`px-5 py-2 rounded-xl font-semibold text-sm transition-all ${
                topType === t
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}>
              {t === 'top40' ? '🌍 TOP 40' : '🇱🇹 LT TOP 30'}
            </button>
          ))}
        </div>

        {/* Tabs — tik 2 */}
        <div className="flex gap-0 mb-5 border-b border-gray-200">
          {([
            ['entries', '📋 Sąrašas'],
            ['suggestions', '💡 Pasiūlymai'],
          ] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k as TabType)}
              className={`px-5 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px ${
                tab === k
                  ? 'text-blue-600 border-blue-600'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}>
              {l}
            </button>
          ))}
        </div>

        {/* ── ENTRIES ── */}
        {tab === 'entries' && (
          <div className="space-y-4">
            {/* Add track */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-sm font-semibold text-gray-700 mb-3">+ Pridėti dainą į sąrašą</p>
              <div className="relative">
                <input
                  type="text"
                  value={trackSearch}
                  onChange={e => setTrackSearch(e.target.value)}
                  placeholder="Ieškoti pagal dainos pavadinimą arba atlikėją…"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-blue-400 focus:bg-white text-sm transition-colors"
                />
                {trackResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-xl z-20">
                    {trackResults.map((t: any) => (
                      <button
                        key={t.id}
                        onClick={() => addToTop(t.id)}
                        disabled={saving}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 transition-colors text-left border-b border-gray-50 last:border-0">
                        <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                          {t.cover_url
                            ? <img src={t.cover_url} alt="" className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center text-gray-300 text-sm">♪</div>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{t.title}</p>
                          <p className="text-xs text-gray-500 truncate">{t.artist_name || t.artists?.name}</p>
                        </div>
                        <span className="text-xs text-blue-600 font-semibold flex-shrink-0 bg-blue-50 px-2 py-1 rounded-lg">
                          {saving ? '…' : '+ Pridėti'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Entries table */}
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : entries.length === 0 ? (
              <div className="bg-white border border-gray-100 rounded-xl p-12 text-center shadow-sm">
                <p className="text-gray-400 text-sm">Sąrašas tuščias. Ieškokite dainos aukščiau.</p>
              </div>
            ) : (
              <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wide bg-gray-50/80">
                      <th className="px-4 py-3 w-10">#</th>
                      <th className="px-4 py-3 w-12">±</th>
                      <th className="px-4 py-3">Daina</th>
                      <th className="px-4 py-3 text-center w-16 hidden sm:table-cell">Sav.</th>
                      <th className="px-4 py-3 text-right w-20">Balsai</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map(e => (
                      <tr key={e.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors">
                        <td className="px-4 py-3">
                          <span className={`text-sm font-black tabular-nums ${e.position <= 3 ? 'text-orange-500' : 'text-gray-700'}`}>
                            {e.position}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <TrendBadge curr={e.position} prev={e.prev_position} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                              {e.tracks?.cover_url
                                ? <img src={e.tracks.cover_url} alt="" className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center text-gray-300 text-sm">♪</div>}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{e.tracks?.title}</p>
                              <p className="text-xs text-gray-400">{e.tracks?.artists?.name}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-gray-400 tabular-nums hidden sm:table-cell">
                          {e.weeks_in_top}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-bold text-gray-700 tabular-nums">
                          {e.total_votes}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── SUGGESTIONS ── */}
        {tab === 'suggestions' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              {(['pending', 'approved', 'rejected'] as const).map(s => (
                <button key={s} onClick={() => setSuggestionStatus(s)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
                    suggestionStatus === s
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}>
                  {s === 'pending' ? '⏳ Laukia' : s === 'approved' ? '✓ Patvirtinta' : '✕ Atmesta'}
                </button>
              ))}
            </div>
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : suggestions.length === 0 ? (
              <div className="bg-white border border-gray-100 rounded-xl p-12 text-center shadow-sm">
                <p className="text-gray-400 text-sm">Nėra pasiūlymų.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {suggestions.map(s => {
                  const title = s.tracks?.title || s.manual_title || '?'
                  const artist = s.tracks?.artists?.[0]?.name || s.manual_artist || '?'
                  return (
                    <div key={s.id} className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-100 rounded-xl shadow-sm">
                      <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-base flex-shrink-0">♪</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{title}</p>
                        <p className="text-xs text-gray-400">{artist} · {s.top_type === 'top40' ? 'TOP 40' : 'LT TOP 30'}</p>
                      </div>
                      {suggestionStatus === 'pending' && (
                        <div className="flex gap-2 flex-shrink-0">
                          <button onClick={() => reviewSuggestion(s.id, 'approved')}
                            className="px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-lg text-xs font-semibold transition-colors">
                            ✓ Patvirtinti
                          </button>
                          <button onClick={() => reviewSuggestion(s.id, 'rejected')}
                            className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-xs font-semibold transition-colors">
                            ✕ Atmesti
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

export default function AdminTop() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#f8f7f5] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <AdminTopInner />
    </Suspense>
  )
}
