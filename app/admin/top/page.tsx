'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type TopType = 'top40' | 'lt_top30'
type TabType = 'topas' | 'suggestions'

type Week = {
  id: number
  top_type: TopType
  week_start: string
  vote_open: string
  vote_close: string
  is_active: boolean
  is_finalized: boolean
  total_votes: number
}

type Entry = {
  id: number
  position: number | null
  prev_position: number | null
  weeks_in_top: number
  vote_count: number
  is_new: boolean
  peak_position: number | null
  tracks: { id: number; slug: string; title: string; cover_url: string | null; artists: { name: string } } | null
}

type Suggestion = {
  id: number
  top_type: TopType
  status: string
  created_at: string
  track: { id: number; title: string; artist_name: string } | null
}

function TrendBadge({ curr, prev }: { curr: number | null; prev: number | null }) {
  if (prev === null || curr === null)
    return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200">NEW</span>
  if (curr < prev) return <span className="text-emerald-600 font-bold text-xs">↑{prev - curr}</span>
  if (curr > prev) return <span className="text-red-500 font-bold text-xs">↓{curr - prev}</span>
  return <span className="text-gray-300 text-xs">—</span>
}

function VoteCloseBadge({ week }: { week: Week | null }) {
  if (!week) return null
  const close = new Date(week.vote_close)
  const now = new Date()
  const isOpen = !week.is_finalized && close > now
  const hoursLeft = Math.max(0, Math.floor((close.getTime() - now.getTime()) / 3600000))

  if (week.is_finalized)
    return <span className="text-xs bg-gray-100 text-gray-500 border border-gray-200 px-3 py-1.5 rounded-full">✓ Finalizuota</span>
  if (!isOpen)
    return <span className="text-xs bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-full">⏰ Balsavimas baigėsi</span>
  return (
    <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-full">
      🗳️ Balsavimas atidarytas · {hoursLeft}h liko
    </span>
  )
}

function AdminTopInner() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  const [topType, setTopType] = useState<TopType>('top40')
  const [tab, setTab] = useState<TabType>('topas')
  const [activeWeek, setActiveWeek] = useState<Week | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [suggestionStatus, setSuggestionStatus] = useState('pending')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState<'ok' | 'err'>('ok')

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/auth/signin'); return }
    if (status === 'authenticated' && !isAdmin) { router.push('/'); return }
  }, [status, isAdmin, router])

  const showMsg = (text: string, type: 'ok' | 'err' = 'ok') => {
    setMsg(text); setMsgType(type)
    setTimeout(() => setMsg(''), 4000)
  }

  const loadWeekAndEntries = useCallback(async () => {
    setLoading(true)
    try {
      // Auto-sukurti savaitę
      await fetch(`/api/top/weeks?type=${topType}`)

      const res = await fetch(`/api/top/entries?type=${topType}`)
      const data = await res.json()
      setEntries(data.entries || [])
      setActiveWeek(data.week || null)
    } finally {
      setLoading(false)
    }
  }, [topType])

  const loadSuggestions = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/top/suggestions?status=${suggestionStatus}&type=${topType}`)
    const data = await res.json()
    setSuggestions(data.suggestions || [])
    setLoading(false)
  }, [suggestionStatus, topType])

  useEffect(() => {
    if (status !== 'authenticated' || !isAdmin) return
    if (tab === 'topas') loadWeekAndEntries()
    if (tab === 'suggestions') loadSuggestions()
  }, [status, isAdmin, topType, tab, suggestionStatus]) // eslint-disable-line

  const removeEntry = async (id: number) => {
    await fetch(`/api/top/entries?id=${id}`, { method: 'DELETE' })
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  const reviewSuggestion = async (id: number, newStatus: 'approved' | 'rejected') => {
    const res = await fetch('/api/top/suggestions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: newStatus }),
    })
    const d = await res.json()
    if (res.ok) {
      showMsg(newStatus === 'approved' ? 'Patvirtinta ir pridėta į topą ✓' : 'Atmesta')
      loadSuggestions()
      if (newStatus === 'approved') loadWeekAndEntries()
    } else {
      showMsg(d.error || 'Klaida', 'err')
    }
  }

  const finalizeWeek = async () => {
    if (!activeWeek) return
    if (!confirm('Finalizuoti šią savaitę? Balsavimas bus uždarytas ir topas suskaičiuotas.')) return
    const res = await fetch('/api/top/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week_id: activeWeek.id }),
    })
    if (res.ok) {
      showMsg('Savaitė finalizuota ✓')
      loadWeekAndEntries()
    } else {
      const d = await res.json()
      showMsg(d.error || 'Klaida', 'err')
    }
  }

  if (status === 'loading') return (
    <div className="min-h-screen bg-[#f8f7f5] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const voteCloseLabel = activeWeek
    ? new Date(activeWeek.vote_close).toLocaleDateString('lt-LT', {
        weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
      })
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
          <VoteCloseBadge week={activeWeek} />
        </div>

        {msg && (
          <div className={`mb-4 px-4 py-2.5 rounded-xl text-sm font-medium ${
            msgType === 'err'
              ? 'bg-red-50 border border-red-200 text-red-700'
              : 'bg-green-50 border border-green-200 text-green-700'
          }`}>{msg}</div>
        )}

        {/* TOP type switcher */}
        <div className="flex gap-2 mb-5">
          {(['top40', 'lt_top30'] as const).map(t => (
            <button key={t} onClick={() => setTopType(t)}
              className={`px-5 py-2 rounded-xl font-semibold text-sm transition-all ${
                topType === t ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}>
              {t === 'top40' ? '🌍 TOP 40' : '🇱🇹 LT TOP 30'}
            </button>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-0 mb-5 border-b border-gray-200">
          {([
            ['topas', '📋 Topas'],
            ['suggestions', '💡 Pasiūlymai'],
          ] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k as TabType)}
              className={`px-5 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px ${
                tab === k ? 'text-blue-600 border-blue-600' : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}>
              {l}
            </button>
          ))}
        </div>

        {/* ── TOPAS ── */}
        {tab === 'topas' && (
          <div className="space-y-4">
            {/* Savaitės info */}
            {activeWeek && (
              <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    Savaitė nuo {new Date(activeWeek.week_start).toLocaleDateString('lt-LT', { month: 'long', day: 'numeric' })}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Balsavimas iki: {voteCloseLabel} · {activeWeek.total_votes} balsų iš viso
                  </p>
                </div>
                {!activeWeek.is_finalized && (
                  <button onClick={finalizeWeek}
                    className="px-4 py-2 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 rounded-xl text-xs font-bold transition-colors">
                    ⚡ Finalizuoti dabar
                  </button>
                )}
              </div>
            )}

            {loading ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : entries.length === 0 ? (
              <div className="bg-white border border-gray-100 rounded-xl p-12 text-center shadow-sm">
                <p className="text-gray-400 text-sm mb-2">Topo sąrašas tuščias.</p>
                <p className="text-gray-400 text-xs">Patvirtinkite pasiūlymus → jie automatiškai pateks čia.</p>
              </div>
            ) : (
              <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/80 flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {entries.length} {activeWeek?.is_finalized ? 'dainų · finalizuota' : 'kandidatų · balsuojama'}
                  </span>
                  {!activeWeek?.is_finalized && (
                    <span className="text-xs text-gray-400">Rikiuojama pagal balsus</span>
                  )}
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wide">
                      <th className="px-4 py-3 w-10">#</th>
                      <th className="px-4 py-3 w-12 hidden sm:table-cell">±</th>
                      <th className="px-4 py-3">Daina</th>
                      <th className="px-4 py-3 text-center w-16 hidden sm:table-cell">Sav.</th>
                      <th className="px-4 py-3 text-right w-20">Balsai</th>
                      <th className="px-4 py-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e, i) => (
                      <tr key={e.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors group">
                        <td className="px-4 py-3">
                          <span className={`text-sm font-black tabular-nums ${i < 3 ? 'text-orange-500' : 'text-gray-700'}`}>
                            {e.position ?? i + 1}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          {activeWeek?.is_finalized
                            ? <TrendBadge curr={e.position} prev={e.prev_position} />
                            : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                              {e.tracks?.cover_url
                                ? <img src={e.tracks.cover_url} alt="" className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center text-gray-300 text-sm">♪</div>}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{e.tracks?.title ?? '—'}</p>
                              <p className="text-xs text-gray-400">{e.tracks?.artists?.name ?? '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-gray-400 tabular-nums hidden sm:table-cell">
                          {e.weeks_in_top}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-bold text-gray-700 tabular-nums">{e.vote_count}</span>
                        </td>
                        <td className="px-4 py-3">
                          {!activeWeek?.is_finalized && (
                            <button
                              onClick={() => removeEntry(e.id)}
                              className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all text-sm">
                              ✕
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── PASIŪLYMAI ── */}
        {tab === 'suggestions' && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
              💡 Patvirtinus pasiūlymą — daina automatiškai pridedama į <strong>šios savaitės</strong> topą kaip kandidatė balsavimui.
            </div>

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
                {suggestions.map(s => (
                  <div key={s.id} className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-100 rounded-xl shadow-sm">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-base flex-shrink-0">♪</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{s.track?.title ?? '—'}</p>
                      <p className="text-xs text-gray-400">
                        {s.track?.artist_name ?? '—'} · {s.top_type === 'top40' ? 'TOP 40' : 'LT TOP 30'} ·{' '}
                        {new Date(s.created_at).toLocaleDateString('lt-LT')}
                      </p>
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
                ))}
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
