'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Nomination = {
  id: number; date: string; comment: string; created_at: string
  votes: number; weighted_votes: number; removed_at: string | null
  tracks: { id: number; slug: string; title: string; cover_url: string | null; artists: { name: string }[] }
}

type Winner = {
  id: number; date: string; total_votes: number; weighted_votes: number
  winning_comment: string | null
  tracks: { id: number; slug: string; title: string; cover_url: string | null; artists: { name: string }[] }
}

export default function AdminDienesDaina() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  const [tab, setTab] = useState<'today' | 'history'>('today')
  const [nominations, setNominations] = useState<Nomination[]>([])
  const [winners, setWinners] = useState<Winner[]>([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/auth/signin'); return }
    if (status === 'authenticated' && !isAdmin) { router.push('/'); return }
  }, [status, isAdmin, router])

  const loadNominations = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/dienos-daina/nominations')
    const data = await res.json()
    setNominations(data.nominations || [])
    setLoading(false)
  }, [])

  const loadWinners = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/dienos-daina/winners?limit=30')
    const data = await res.json()
    setWinners(data.winners || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (status !== 'authenticated' || !isAdmin) return
    if (tab === 'today') loadNominations()
    else loadWinners()
  }, [tab, status, isAdmin, loadNominations, loadWinners])

  const removeNomination = async (id: number) => {
    if (!confirm('Pašalinti šį pasiūlymą?')) return
    const res = await fetch(`/api/dienos-daina/nominations?id=${id}`, { method: 'DELETE' })
    if (res.ok) {
      setMsg('Pasiūlymas pašalintas ✓')
      setNominations(prev => prev.filter(n => n.id !== id))
      setTimeout(() => setMsg(''), 3000)
    }
  }

  if (status === 'loading') return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/admin" className="text-[var(--text-muted)] hover:text-white text-sm transition-colors">← Admin</Link>
          <span className="text-[var(--text-secondary)]">/</span>
          <h1 className="text-2xl font-black text-white">🎵 Dienos daina</h1>
          <Link href="/dienos-daina" target="_blank"
            className="ml-auto text-xs text-blue-400 hover:text-blue-300 transition-colors">
            Viešas puslapis ↗
          </Link>
        </div>

        {msg && (
          <div className="mb-4 px-4 py-2.5 rounded-xl bg-green-500/15 border border-green-500/25 text-green-400 text-sm">
            {msg}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-white/10">
          {([
            ['today', '📋 Šiandien'],
            ['history', '📅 Istorija'],
          ] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px ${
                tab === k ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}>
              {l}
            </button>
          ))}
        </div>

        {/* TODAY TAB */}
        {tab === 'today' && (
          <div>
            <p className="text-sm text-gray-500 mb-4">
              {nominations.length} pasiūlymai šiandien
            </p>
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : nominations.length === 0 ? (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
                <p className="text-gray-400">Šiandien dar niekas nepasiūlė dainos.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {nominations.map((n, i) => (
                  <div key={n.id}
                    className="flex items-start gap-4 p-4 rounded-2xl"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>

                    {/* Position */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0 ${
                      i === 0 ? 'bg-orange-400/20 text-orange-400' : 'bg-white/10 text-gray-400'
                    }`}>
                      {i + 1}
                    </div>

                    {/* Cover */}
                    <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0">
                      {n.tracks?.cover_url
                        ? <img src={n.tracks.cover_url} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full bg-white/10 flex items-center justify-center">♪</div>}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <p className="text-sm font-bold text-white">{n.tracks?.title}</p>
                          <p className="text-xs text-gray-500">{n.tracks?.artists?.[0]?.name || 'Nežinomas'}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-black text-white">{n.weighted_votes}</span>
                          <span className="text-xs text-gray-600">svert. balsų</span>
                          <span className="text-xs text-gray-600">({n.votes} balsų)</span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 italic mt-2">"{n.comment}"</p>
                      <p className="text-xs text-gray-600 mt-1">
                        {new Date(n.created_at).toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>

                    {/* Actions */}
                    <button onClick={() => removeNomination(n.id)}
                      className="text-xs text-red-500/60 hover:text-red-400 transition-colors flex-shrink-0 px-2 py-1 rounded hover:bg-red-500/10">
                      Šalinti
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* HISTORY TAB */}
        {tab === 'history' && (
          <div>
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : winners.length === 0 ? (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
                <p className="text-gray-400">Dar nėra nugalėtojų istorijos.</p>
              </div>
            ) : (
              <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-xs text-gray-500 uppercase tracking-wide">
                      <th className="px-4 py-3">Data</th>
                      <th className="px-4 py-3">Daina</th>
                      <th className="px-4 py-3 text-right">Balsai</th>
                    </tr>
                  </thead>
                  <tbody>
                    {winners.map(w => (
                      <tr key={w.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                          {new Date(w.date).toLocaleDateString('lt-LT', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0">
                              {w.tracks?.cover_url
                                ? <img src={w.tracks.cover_url} alt="" className="w-full h-full object-cover" />
                                : <div className="w-full h-full bg-white/10 flex items-center justify-center text-xs">♪</div>}
                            </div>
                            <div>
                              <p className="text-sm text-white font-semibold">{w.tracks?.title}</p>
                              <p className="text-xs text-gray-500">{w.tracks?.artists?.[0]?.name}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-bold text-white">{w.total_votes}</span>
                          <span className="text-xs text-gray-600 ml-1">({w.weighted_votes} svert.)</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
