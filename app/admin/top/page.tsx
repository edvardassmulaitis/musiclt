'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type TopType = 'top40' | 'lt_top30'

type Week = {
  id: number
  top_type: TopType
  week_start: string
  vote_open: string | null
  vote_close: string | null
  is_active: boolean
  is_finalized: boolean
  total_votes: number
}

type Entry = {
  id: number
  position: number | null
  prev_position: number | null
  weeks_in_top: number
  total_votes: number
  is_new: boolean
  peak_position: number | null
  tracks: { id: number; slug: string; title: string; cover_url: string | null; artists: { name: string } | null } | null
}

type Suggestion = {
  id: number
  top_type: TopType
  status: string
  created_at: string
  track: { id: number; title: string; artist_name: string } | null
  _group?: string
}

function TrendBadge({ curr, prev }: { curr: number | null; prev: number | null }) {
  if (prev === null || curr === null)
    return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200">NEW</span>
  if (curr < prev) return <span className="text-emerald-600 font-bold text-xs">↑{prev - curr}</span>
  if (curr > prev) return <span className="text-red-500 font-bold text-xs">↓{curr - prev}</span>
  return <span className="text-gray-300 text-xs">—</span>
}

function Countdown({ targetDate }: { targetDate: string | null }) {
  if (!targetDate) return <span className="font-mono font-bold text-gray-400">—</span>
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    const calc = () => {
      const diff = new Date(targetDate).getTime() - Date.now()
      if (diff <= 0) { setTimeLeft('Baigėsi'); return }
      const d = Math.floor(diff / 86400000)
      const h = Math.floor((diff % 86400000) / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setTimeLeft(d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${s}s`)
    }
    calc()
    const t = setInterval(calc, 1000)
    return () => clearInterval(t)
  }, [targetDate])

  return <span className="font-mono font-bold text-orange-600">{timeLeft}</span>
}

function AdminTopInner() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  const [topType, setTopType] = useState<TopType>('top40')
  const [activeWeek, setActiveWeek] = useState<Week | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loadingEntries, setLoadingEntries] = useState(false)
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [trackSearch, setTrackSearch] = useState('')
  const [trackResults, setTrackResults] = useState<any[]>([])
  const [addingSuggestion, setAddingSuggestion] = useState(false)
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

  const loadEntries = useCallback(async () => {
    setLoadingEntries(true)
    try {
      await fetch(`/api/top/weeks?type=${topType}`)
      const res = await fetch(`/api/top/entries?type=${topType}`)
      const data = await res.json()
      setEntries(data.entries || [])
      setActiveWeek(data.week || null)
    } finally {
      setLoadingEntries(false)
    }
  }, [topType])

  const loadSuggestions = useCallback(async () => {
    setLoadingSuggestions(true)
    try {
      // Load all statuses in parallel
      const [pendingRes, approvedRes] = await Promise.all([
        fetch(`/api/top/suggestions?status=pending&type=${topType}`),
        fetch(`/api/top/suggestions?status=approved&type=${topType}`),
      ])
      const [pendingData, approvedData] = await Promise.all([
        pendingRes.json(), approvedRes.json()
      ])
      const all = [
        ...(approvedData.suggestions || []).map((s: any) => ({ ...s, _group: 'approved' })),
        ...(pendingData.suggestions || []).map((s: any) => ({ ...s, _group: 'pending' })),
      ]
      setSuggestions(all)
    } finally {
      setLoadingSuggestions(false)
    }
  }, [topType])

  useEffect(() => {
    if (status !== 'authenticated' || !isAdmin) return
    loadEntries()
  }, [status, isAdmin, topType]) // eslint-disable-line

  useEffect(() => {
    if (status !== 'authenticated' || !isAdmin) return
    loadSuggestions()
  }, [status, isAdmin, topType]) // eslint-disable-line

  // Track search
  useEffect(() => {
    if (trackSearch.length < 2) { setTrackResults([]); return }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/tracks?search=${encodeURIComponent(trackSearch)}&limit=10`)
      const data = await res.json()
      const filtered = (data.tracks || []).filter((t: any) => t.id && t.title && t.title !== t.artist_name)
      setTrackResults(filtered)
    }, 300)
    return () => clearTimeout(t)
  }, [trackSearch])

  const addAdminSuggestion = async (trackId: number) => {
    setAddingSuggestion(true)
    setTrackSearch('')
    setTrackResults([])
    try {
      const res = await fetch('/api/top/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ top_type: topType, track_id: trackId }),
      })
      const d = await res.json()
      if (!res.ok) { showMsg(d.error || 'Klaida', 'err'); return }

      const approveRes = await fetch('/api/top/suggestions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: d.suggestion.id, status: 'approved' }),
      })
      if (approveRes.ok) {
        showMsg('Daina pridėta ✓')
      } else {
        const ad = await approveRes.json()
        showMsg(ad.error || 'Klaida patvirtinant', 'err')
      }
      loadSuggestions()
      loadEntries()
    } finally {
      setAddingSuggestion(false)
    }
  }

  const reviewSuggestion = async (id: number, newStatus: 'approved' | 'rejected') => {
    const res = await fetch('/api/top/suggestions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: newStatus }),
    })
    const d = await res.json()
    if (res.ok) {
      showMsg(newStatus === 'approved' ? 'Patvirtinta ✓' : 'Atmesta')
      loadSuggestions()
      loadEntries()
    } else {
      showMsg(d.error || 'Klaida', 'err')
    }
  }

  const removeEntry = async (id: number) => {
    await fetch(`/api/top/entries?id=${id}`, { method: 'DELETE' })
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  const finalizeWeek = async () => {
    if (!activeWeek) return
    if (!confirm('Finalizuoti šią savaitę?')) return
    const res = await fetch('/api/top/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week_id: activeWeek.id }),
    })
    if (res.ok) { showMsg('Finalizuota ✓'); loadEntries() }
    else { const d = await res.json(); showMsg(d.error || 'Klaida', 'err') }
  }

  const populateFromApproved = async () => {
    if (!activeWeek) return
    if (!confirm('Įkelti VISUS patvirtintus pasiūlymus į dabartinę savaitę? (Naudok testavimui — normaliai cronas tai padarys pirmadienį.)')) return
    const res = await fetch('/api/top/populate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ top_type: topType }),
    })
    const d = await res.json()
    if (res.ok) {
      showMsg(d.message || `Pridėta ${d.inserted} dainų ✓`)
      loadEntries()
      loadSuggestions()
    } else {
      showMsg(d.error || 'Klaida', 'err')
    }
  }

  const resetWeek = async () => {
    if (!activeWeek) return
    if (!confirm('Atstatyti einamą savaitę? Bus IŠTRINTI visi balsai ir pozicijos. Topo dainos liks. Naudok testavimo ciklams.')) return
    const res = await fetch('/api/top/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ top_type: topType }),
    })
    const d = await res.json()
    if (res.ok) {
      showMsg(d.message || 'Atstatyta ✓')
      loadEntries()
    } else {
      showMsg(d.error || 'Klaida', 'err')
    }
  }

  if (status === 'loading') return (
    <div className="min-h-screen bg-[#f8f7f5] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-[#f8f7f5] p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
          <div className="flex items-center gap-2 text-sm">
            <Link href="/admin" className="text-gray-400 hover:text-gray-700 transition-colors">Admin</Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-800 font-semibold">🏆 TOP Sąrašai</span>
          </div>
          <div className="flex gap-2">
            {(['top40', 'lt_top30'] as const).map(t => (
              <button key={t} onClick={() => setTopType(t)}
                className={`px-4 py-2 rounded-xl font-semibold text-sm transition-all ${
                  topType === t ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}>
                {t === 'top40' ? '🌍 TOP 40' : '🇱🇹 LT TOP 30'}
              </button>
            ))}
          </div>
        </div>

        {msg && (
          <div className={`mb-4 px-4 py-2.5 rounded-xl text-sm font-medium ${
            msgType === 'err' ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-green-50 border border-green-200 text-green-700'
          }`}>{msg}</div>
        )}

        {/* Week info bar */}
        {activeWeek && (
          <div className="bg-white border border-gray-100 rounded-xl shadow-sm px-4 py-3 mb-5 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Savaitė</span>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {new Date(activeWeek.week_start).toLocaleDateString('lt-LT', { month: 'long', day: 'numeric' })}
                  {' – '}
                  {activeWeek.vote_close ? new Date(activeWeek.vote_close).toLocaleDateString('lt-LT', { month: 'long', day: 'numeric' }) : '—'}
                </p>
              </div>
              <div>
                <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">
                  {activeWeek.is_finalized ? 'Finalizuota' : activeWeek.vote_close ? 'Iki pabaigos' : 'Prasideda'}
                </span>
                <p className="text-sm font-semibold">
                  {activeWeek.is_finalized
                    ? <span className="text-[var(--text-secondary)]">✓ Baigta · {activeWeek.total_votes} balsų</span>
                    : activeWeek.vote_close
                      ? <Countdown targetDate={activeWeek.vote_close} />
                      : <span className="text-gray-400 text-xs">Data nenustatyta</span>}
                </p>
              </div>
              <div>
                <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Kandidatai</span>
                <p className="text-sm font-semibold text-[var(--text-primary)]">{entries.length} dainų</p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {!activeWeek.is_finalized && (
                <>
                  <button onClick={populateFromApproved}
                    title="Įkelti patvirtintus pasiūlymus į dabartinę savaitę (testavimui)"
                    className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition-colors">
                    ⤓ Įkelti patvirtintus
                  </button>
                  <button onClick={finalizeWeek}
                    className="px-4 py-2 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 rounded-xl text-xs font-bold transition-colors">
                    ⚡ Finalizuoti dabar
                  </button>
                </>
              )}
              {/* Reset visada matomas — leidžia testuoti pakartotinius ciklus */}
              <button onClick={resetWeek}
                title="Atstatyti savaitę testavimui (išvalo balsus + pozicijas, palieka dainas)"
                className="px-4 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold transition-colors">
                ↻ Atstatyti
              </button>
            </div>
          </div>
        )}

        {/* Two column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* LEFT: Pasiūlymai */}
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">💡 Pasiūlymai</h2>

            {/* Search */}
            <div className="bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-xl shadow-sm p-4">
              <p className="text-xs text-[var(--text-muted)] mb-2">Pridėti dainą (admin → automatiškai patvirtinama)</p>
              <div className="relative">
                <input
                  type="text"
                  value={trackSearch}
                  onChange={e => setTrackSearch(e.target.value)}
                  placeholder="Ieškoti pagal dainą arba atlikėją…"
                  className="w-full px-3 py-2.5 bg-[var(--bg-elevated)] border border-[var(--input-border)] rounded-xl text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-blue-400 focus:bg-[var(--bg-surface)] text-sm transition-colors"
                />
                {trackResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-xl overflow-hidden shadow-xl z-20">
                    {trackResults.map((t: any) => (
                      <button key={t.id} onClick={() => addAdminSuggestion(t.id)} disabled={addingSuggestion}
                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-blue-50 transition-colors text-left border-b border-gray-50 last:border-0">
                        <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                          {t.cover_url
                            ? <img src={t.cover_url} alt="" className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">♪</div>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{t.title}</p>
                          <p className="text-xs text-gray-500 truncate">{t.artist_name}</p>
                        </div>
                        <span className="text-xs text-blue-600 font-semibold flex-shrink-0">+ Pridėti</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Suggestions list - grouped */}
            {loadingSuggestions ? (
              <div className="flex justify-center py-8">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : suggestions.length === 0 ? (
              <div className="bg-white border border-gray-100 rounded-xl p-8 text-center shadow-sm">
                <p className="text-gray-400 text-sm">Nėra pasiūlymų.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Approved */}
                {suggestions.filter(s => s._group === 'approved').length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-1.5 px-1">
                      ✓ Patvirtinta ({suggestions.filter(s => s._group === 'approved').length})
                    </p>
                    <div className="space-y-1">
                      {suggestions.filter(s => s._group === 'approved').map(s => (
                        <div key={s.id} className="flex items-center gap-3 px-3 py-2 bg-white border border-green-100 rounded-xl shadow-sm">
                          <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center text-sm flex-shrink-0">♪</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{s.track?.title ?? '—'}</p>
                            <p className="text-xs text-gray-400 truncate">{s.track?.artist_name ?? '—'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Pending */}
                {suggestions.filter(s => s._group === 'pending').length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-1.5 px-1">
                      ⏳ Laukia ({suggestions.filter(s => s._group === 'pending').length})
                    </p>
                    <div className="space-y-1">
                      {suggestions.filter(s => s._group === 'pending').map(s => (
                        <div key={s.id} className="flex items-center gap-3 px-3 py-2 bg-white border border-amber-100 rounded-xl shadow-sm">
                          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-sm flex-shrink-0">♪</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{s.track?.title ?? '—'}</p>
                            <p className="text-xs text-gray-400 truncate">{s.track?.artist_name ?? '—'}</p>
                          </div>
                          <div className="flex gap-1.5 flex-shrink-0">
                            <button onClick={() => reviewSuggestion(s.id, 'approved')}
                              className="px-2.5 py-1 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-lg text-xs font-semibold transition-colors">
                              ✓
                            </button>
                            <button onClick={() => reviewSuggestion(s.id, 'rejected')}
                              className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-xs font-semibold transition-colors">
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT: Topas */}
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
              {(() => {
                if (!activeWeek) return '📋 Topas'
                if (activeWeek.is_finalized) return '📋 Finalinis topas'
                const voteOpen = activeWeek.vote_open ? new Date(activeWeek.vote_open) : null
                const voteClose = activeWeek.vote_close ? new Date(activeWeek.vote_close) : null
                const now = new Date()
                if (voteClose && now > voteClose) return '📋 Balsavimas baigėsi'
                if (voteOpen && now < voteOpen) return '📋 Kandidatai kitam topui'
                return '📋 Topas · balsavimas vyksta'
              })()}
            </h2>

            {loadingEntries ? (
              <div className="flex justify-center py-8">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : entries.length === 0 ? (
              <div className="bg-white border border-gray-100 rounded-xl p-8 text-center shadow-sm">
                <p className="text-gray-400 text-sm mb-1">Šios savaitės topas tuščias.</p>
                <p className="text-xs text-gray-300">Patvirtinti pasiūlymai pateks čia kitą pirmadienį kai prasidės nauja savaitė.</p>
              </div>
            ) : (
              <div className="bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-xl overflow-hidden shadow-sm">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] text-left text-xs text-[var(--text-muted)] uppercase tracking-wide bg-[var(--bg-elevated)]/80">
                      <th className="px-3 py-2.5 w-8">#</th>
                      <th className="px-3 py-2.5">Daina</th>
                      <th className="px-3 py-2.5 text-right w-16">Balsai</th>
                      <th className="px-3 py-2.5 w-6"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e, i) => (
                      <tr key={e.id} className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)]/80 transition-colors group">
                        <td className="px-3 py-2.5">
                          <span className={`text-sm font-black tabular-nums ${i < 3 ? 'text-orange-500' : 'text-[var(--text-secondary)]'}`}>
                            {e.position ?? i + 1}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                              {e.tracks?.cover_url
                                ? <img src={e.tracks.cover_url} alt="" className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">♪</div>}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate">{e.tracks?.title ?? '—'}</p>
                              <p className="text-xs text-gray-400 truncate">{e.tracks?.artists?.name ?? '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="text-sm font-bold text-[var(--text-secondary)] tabular-nums">{e.total_votes}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          {!activeWeek?.is_finalized && (
                            <button onClick={() => removeEntry(e.id)}
                              className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all text-sm w-5">
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

        </div>
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
