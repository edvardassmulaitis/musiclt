'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

type TopType = 'top40' | 'lt_top30'
type TabType = 'entries' | 'suggestions' | 'weeks' | 'stats'

type Week = {
  id: number
  top_type: TopType
  week_start: string
  is_active: boolean
  created_at: string
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
    id: number
    slug: string
    title: string
    cover_url: string | null
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
    return <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300">NEW</span>
  if (curr < prev)
    return <span className="text-emerald-400 font-black text-xs">↑{prev - curr}</span>
  if (curr > prev)
    return <span className="text-red-400 font-black text-xs">↓{curr - prev}</span>
  return <span className="text-gray-600 text-xs">—</span>
}

function AdminTopInner() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  const [topType, setTopType] = useState<TopType>(
    (searchParams.get('type') as TopType) || 'top40'
  )
  const [tab, setTab] = useState<TabType>('entries')
  const [weeks, setWeeks] = useState<Week[]>([])
  const [activeWeek, setActiveWeek] = useState<Week | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [suggestionStatus, setSuggestionStatus] = useState('pending')
  const [loading, setLoading] = useState(false)
  const [trackSearch, setTrackSearch] = useState('')
  const [trackResults, setTrackResults] = useState<any[]>([])
  const [newWeekDate, setNewWeekDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/auth/signin'); return }
    if (status === 'authenticated' && !isAdmin) { router.push('/'); return }
  }, [status, isAdmin, router])

  const loadWeeks = useCallback(async () => {
    const res = await fetch(`/api/top/weeks?type=${topType}&limit=20`)
    const data = await res.json()
    setWeeks(data.weeks || [])
    setActiveWeek(data.weeks?.find((w: Week) => w.is_active) || data.weeks?.[0] || null)
  }, [topType])

  const loadEntries = useCallback(async () => {
    if (!activeWeek) return
    setLoading(true)
    const res = await fetch(`/api/top/entries?type=${topType}&week_id=${activeWeek.id}`)
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
    if (status === 'authenticated' && isAdmin) loadWeeks()
  }, [status, isAdmin, loadWeeks])

  useEffect(() => {
    if (activeWeek && tab === 'entries') loadEntries()
  }, [activeWeek, tab, loadEntries])

  useEffect(() => {
    if (tab === 'suggestions') loadSuggestions()
  }, [tab, suggestionStatus, loadSuggestions])

  useEffect(() => {
    if (trackSearch.length < 2) { setTrackResults([]); return }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/tracks?search=${encodeURIComponent(trackSearch)}&limit=8`)
      const data = await res.json()
      setTrackResults(data.tracks || [])
    }, 300)
    return () => clearTimeout(t)
  }, [trackSearch])

  const addToTop = async (trackId: number) => {
    if (!activeWeek) return
    setSaving(true)
    const nextPos = entries.length + 1
    const res = await fetch('/api/top/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week_id: activeWeek.id, track_id: trackId, position: nextPos }),
    })
    if (res.ok) {
      setMsg('Daina pridėta ✓')
      loadEntries()
      setTrackSearch('')
      setTrackResults([])
    } else {
      const d = await res.json()
      setMsg('Klaida: ' + d.error)
    }
    setSaving(false)
    setTimeout(() => setMsg(''), 3000)
  }

  const createWeek = async () => {
    if (!newWeekDate) return
    setSaving(true)
    const res = await fetch('/api/top/weeks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ top_type: topType, week_start: newWeekDate }),
    })
    if (res.ok) {
      setMsg('Savaitė sukurta ✓')
      loadWeeks()
      setNewWeekDate('')
    }
    setSaving(false)
    setTimeout(() => setMsg(''), 3000)
  }

  const reviewSuggestion = async (id: number, newStatus: string) => {
    const res = await fetch('/api/top/suggestions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: newStatus }),
    })
    if (res.ok) loadSuggestions()
  }

  if (status === 'loading') return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto">

        <div className="flex items-center gap-3 mb-6">
          <Link href="/admin" className="text-gray-500 hover:text-white text-sm transition-colors">← Admin</Link>
          <span className="text-gray-600">/</span>
          <h1 className="text-2xl font-black text-white">🏆 TOP Sąrašai</h1>
        </div>

        {msg && (
          <div className="mb-4 px-4 py-2.5 rounded-xl bg-green-500/15 border border-green-500/25 text-green-400 text-sm">{msg}</div>
        )}

        <div className="flex gap-2 mb-6">
          {(['top40', 'lt_top30'] as const).map(t => (
            <button key={t} onClick={() => setTopType(t)}
              className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                topType === t ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10 border border-white/10'
              }`}>
              {t === 'top40' ? '🌍 TOP 40' : '🇱🇹 LT TOP 30'}
            </button>
          ))}
        </div>

        <div className="flex gap-1 mb-6 border-b border-white/10">
          {([
            ['entries', '📋 Sąrašas'],
            ['suggestions', '💡 Pasiūlymai'],
            ['weeks', '📅 Savaitės'],
            ['stats', '📊 Statistika'],
          ] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k as TabType)}
              className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px ${
                tab === k ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}>
              {l}
            </button>
          ))}
        </div>

        {/* ENTRIES */}
        {tab === 'entries' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-gray-400 font-medium">Savaitė:</span>
              <div className="flex gap-2 flex-wrap">
                {weeks.map(w => (
                  <button key={w.id} onClick={() => setActiveWeek(w)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      activeWeek?.id === w.id ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10 border border-white/10'
                    }`}>
                    {new Date(w.week_start).toLocaleDateString('lt-LT', { month: 'short', day: 'numeric' })}
                    {w.is_active && <span className="ml-1 text-green-400">●</span>}
                  </button>
                ))}
                {weeks.length === 0 && <span className="text-xs text-gray-600">Nėra savaičių — sukurkite skirtuke „Savaitės"</span>}
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <p className="text-sm font-bold text-white mb-3">+ Pridėti dainą</p>
              <div className="relative">
                <input type="text" value={trackSearch} onChange={e => setTrackSearch(e.target.value)}
                  placeholder="Ieškoti dainos…"
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500 text-sm" />
                {trackResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-[#0d1117] border border-white/15 rounded-xl overflow-hidden shadow-2xl z-20">
                    {trackResults.map((t: any) => (
                      <button key={t.id} onClick={() => addToTop(t.id)} disabled={saving}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 transition-colors text-left">
                        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-xs flex-shrink-0">♪</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{t.title}</p>
                          <p className="text-xs text-gray-500 truncate">{t.artist_name || t.artists?.name}</p>
                        </div>
                        <span className="text-xs text-blue-400 flex-shrink-0">+ Pridėti</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>
            ) : entries.length === 0 ? (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
                <p className="text-gray-400">Sąrašas tuščias.</p>
              </div>
            ) : (
              <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-xs text-gray-500 uppercase tracking-wide">
                      <th className="px-4 py-3 w-10">#</th>
                      <th className="px-4 py-3 w-12">±</th>
                      <th className="px-4 py-3">Daina</th>
                      <th className="px-4 py-3 text-center w-16">Sav.</th>
                      <th className="px-4 py-3 text-center w-16">Aukšč.</th>
                      <th className="px-4 py-3 text-right w-20">Balsai</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map(e => (
                      <tr key={e.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3">
                          <span className={`text-sm font-black ${e.position <= 3 ? 'text-orange-400' : 'text-gray-400'}`}>{e.position}</span>
                        </td>
                        <td className="px-4 py-3"><TrendBadge curr={e.position} prev={e.prev_position} /></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-xs flex-shrink-0">♪</div>
                            <div>
                              <p className="text-sm font-semibold text-white">{e.tracks?.title}</p>
                              <p className="text-xs text-gray-500">{e.tracks?.artists?.name}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-gray-400">{e.weeks_in_top}/12</td>
                        <td className="px-4 py-3 text-center text-xs text-gray-400">#{e.peak_position || e.position}</td>
                        <td className="px-4 py-3 text-right text-sm font-bold text-white">{e.total_votes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* SUGGESTIONS */}
        {tab === 'suggestions' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              {(['pending', 'approved', 'rejected'] as const).map(s => (
                <button key={s} onClick={() => setSuggestionStatus(s)}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                    suggestionStatus === s ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10 border border-white/10'
                  }`}>
                  {s === 'pending' ? '⏳ Laukia' : s === 'approved' ? '✓ Patvirtinta' : '✕ Atmesta'}
                </button>
              ))}
            </div>
            {loading ? (
              <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>
            ) : suggestions.length === 0 ? (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center"><p className="text-gray-400">Nėra pasiūlymų.</p></div>
            ) : (
              <div className="space-y-2">
                {suggestions.map(s => {
                  const title = s.tracks?.title || s.manual_title || '?'
                  const artist = s.tracks?.artists?.[0]?.name || s.manual_artist || '?'
                  return (
                    <div key={s.id} className="flex items-center gap-4 px-4 py-3.5 bg-white/5 border border-white/10 rounded-xl">
                      <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-sm flex-shrink-0">♪</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white">{title}</p>
                        <p className="text-xs text-gray-500">{artist} · {s.top_type === 'top40' ? 'TOP 40' : 'LT TOP 30'}</p>
                      </div>
                      {suggestionStatus === 'pending' && (
                        <div className="flex gap-2 flex-shrink-0">
                          <button onClick={() => reviewSuggestion(s.id, 'approved')}
                            className="px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-xs font-bold transition-colors">✓ Patvirtinti</button>
                          <button onClick={() => reviewSuggestion(s.id, 'rejected')}
                            className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-xs font-bold transition-colors">✕ Atmesti</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* WEEKS */}
        {tab === 'weeks' && (
          <div className="space-y-4">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <p className="text-sm font-bold text-white mb-3">Sukurti naują savaitę</p>
              <div className="flex gap-3">
                <input type="date" value={newWeekDate} onChange={e => setNewWeekDate(e.target.value)}
                  className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-blue-500 text-sm" />
                <button onClick={createWeek} disabled={saving || !newWeekDate}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50">
                  {saving ? 'Kuriama…' : '+ Sukurti'}
                </button>
              </div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10 text-left text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-3">Savaitė nuo</th>
                    <th className="px-4 py-3">Tipas</th>
                    <th className="px-4 py-3">Statusas</th>
                    <th className="px-4 py-3 text-right">Veiksmai</th>
                  </tr>
                </thead>
                <tbody>
                  {weeks.map(w => (
                    <tr key={w.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="px-4 py-3 text-sm text-white font-medium">
                        {new Date(w.week_start).toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' })}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">{w.top_type === 'top40' ? '🌍 TOP 40' : '🇱🇹 LT TOP 30'}</td>
                      <td className="px-4 py-3">
                        {w.is_active
                          ? <span className="text-xs font-bold text-green-400 bg-green-400/10 px-2 py-1 rounded-full">● Aktyvi</span>
                          : <span className="text-xs text-gray-600">Archyvas</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => { setActiveWeek(w); setTab('entries') }}
                          className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors">Žiūrėti →</button>
                      </td>
                    </tr>
                  ))}
                  {weeks.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-600 text-sm">Nėra savaičių.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* STATS */}
        {tab === 'stats' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'Dainų sąraše', value: entries.length, icon: '🎵' },
              { label: 'Aktyvios savaitės', value: weeks.filter(w => w.is_active).length, icon: '📅' },
              { label: 'Viso savaičių', value: weeks.length, icon: '📊' },
            ].map((stat, i) => (
              <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <div className="text-3xl mb-2">{stat.icon}</div>
                <div className="text-3xl font-black text-white">{stat.value}</div>
                <div className="text-sm text-gray-400 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}

export default function AdminTop() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <AdminTopInner />
    </Suspense>
  )
}
