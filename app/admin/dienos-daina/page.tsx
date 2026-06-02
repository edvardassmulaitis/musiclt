'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Nomination = {
  id: number; date: string; comment: string; created_at: string
  votes: number; weighted_votes: number; removed_at: string | null
  proposer?: { username: string | null; full_name: string | null; avatar_url: string | null } | null
  tracks: { id: number; slug: string; title: string; cover_url: string | null; artists: any } | null
}

type Winner = {
  id: number; date: string; total_votes: number; weighted_votes: number
  winning_comment: string | null
  tracks: { id: number; slug: string; title: string; cover_url: string | null; artists: any } | null
}

// API grąžina artists kaip OBJEKTĄ (to-one), ne masyvą — palaikom abu.
function artistName(tr: any): string {
  const a = tr?.artists
  return (Array.isArray(a) ? a[0]?.name : a?.name) || 'Nežinomas'
}

type VoteBreakdown = {
  internal: { user_id: string; username: string | null; full_name: string | null; avatar_url: string | null; weight: number }[]
  external: { ip: string; weight: number; created_at: string }[]
  total: number; weighted: number
}

function strHue(s: string) { let h = 0; for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h }

/** Pop-bar — 5 dash'ai, lygis pagal weighted/maxWeighted. */
function PopBar({ level }: { level: number }) {
  return (
    <span className="inline-flex items-center gap-[3px] align-middle" aria-label={`Balsų lygis ${level}/5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={`h-[4px] w-[13px] rounded-[2px] ${i < level ? 'bg-orange-500' : 'bg-gray-300'}`} />
      ))}
    </span>
  )
}

export default function AdminDienesDaina() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  const [tab, setTab] = useState<'today' | 'history'>('today')
  const [nominations, setNominations] = useState<Nomination[]>([])
  const [byNom, setByNom] = useState<Record<number, VoteBreakdown>>({})
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
    const noms: Nomination[] = data.nominations || []
    setNominations(noms)
    // Balsų išklotinė (vidiniai + išoriniai) per nominaciją.
    try {
      const vr = await fetch(`/api/admin/dienos-daina/votes?date=${data.date || ''}`)
      const vd = await vr.json()
      setByNom(vd.by_nomination || {})
    } catch { setByNom({}) }
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

  // Universalus balsų trynimas: scope=external | user_id=… | ip=…
  const deleteVotes = async (id: number, params: string, confirmMsg: string) => {
    if (!confirm(confirmMsg)) return
    const res = await fetch(`/api/admin/dienos-daina/votes?nomination_id=${id}&${params}`, { method: 'DELETE' })
    const d = await res.json()
    if (res.ok) {
      setMsg(`Pašalinta balsų: ${d.deleted} ✓`)
      setTimeout(() => setMsg(''), 3500)
      loadNominations()
    } else {
      setMsg(d.error || 'Klaida')
      setTimeout(() => setMsg(''), 3500)
    }
  }
  const clearExternal = (id: number) =>
    deleteVotes(id, 'scope=external', 'Išvalyti VISUS svečių (neprisijungusių) balsus už šią dainą? Narių balsai liks.')

  if (status === 'loading') return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const maxWeighted = Math.max(1, ...nominations.map(n => n.weighted_votes || 0))

  return (
    <div className="min-h-screen p-6 text-gray-800">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/admin" className="text-sm text-gray-500 transition-colors hover:text-gray-900">← Admin</Link>
          <span className="text-gray-300">/</span>
          <h1 className="text-2xl font-black text-gray-900">🎵 Dienos daina</h1>
          <Link href="/dienos-daina" target="_blank"
            className="ml-auto text-xs font-semibold text-orange-600 transition-colors hover:text-orange-500">
            Viešas puslapis ↗
          </Link>
        </div>

        {msg && (
          <div className="mb-4 rounded-xl border border-green-300 bg-green-50 px-4 py-2.5 text-sm font-medium text-green-700">
            {msg}
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 flex gap-1 border-b border-gray-200">
          {([
            ['today', '📋 Šiandien'],
            ['history', '📅 Istorija'],
          ] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
                tab === k ? 'border-orange-500 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-700'
              }`}>
              {l}
            </button>
          ))}
        </div>

        {/* TODAY TAB */}
        {tab === 'today' && (
          <div>
            <p className="mb-4 text-sm text-gray-500">
              {nominations.length} pasiūlymai šiandien · narių balsas sveria <b>3×</b>, svečio <b>1×</b>
            </p>
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : nominations.length === 0 ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center">
                <p className="text-gray-500">Šiandien dar niekas nepasiūlė dainos.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {nominations.map((n, i) => {
                  const b = byNom[n.id]
                  const internal = b?.internal || []
                  const external = b?.external || []
                  const level = n.weighted_votes > 0 ? Math.max(1, Math.round((n.weighted_votes / maxWeighted) * 5)) : 0
                  return (
                    <div key={n.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                      <div className="flex items-start gap-4">
                        {/* Position */}
                        <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-black ${
                          i === 0 ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500'
                        }`}>{i + 1}</div>

                        {/* Cover */}
                        <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl bg-gray-100">
                          {n.tracks?.cover_url
                            ? <img src={n.tracks.cover_url} alt="" className="h-full w-full object-cover" />
                            : <div className="flex h-full w-full items-center justify-center text-gray-400">♪</div>}
                        </div>

                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-gray-900">{n.tracks?.title}</p>
                              <p className="text-xs text-gray-500">{artistName(n.tracks)}</p>
                              {n.proposer && (() => {
                                const pn = n.proposer.full_name || n.proposer.username || 'Narys'
                                return (
                                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-blue-50 py-0.5 pl-0.5 pr-2">
                                    {n.proposer.avatar_url
                                      ? <img src={n.proposer.avatar_url} alt="" className="h-4 w-4 rounded-full object-cover" />
                                      : <span className="flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-extrabold text-white" style={{ background: `hsl(${strHue(pn)},45%,55%)` }}>{pn.charAt(0).toUpperCase()}</span>}
                                    <span className="text-[10px] font-medium text-blue-700">Pasiūlė {pn}</span>
                                  </span>
                                )
                              })()}
                            </div>
                            {/* Pop-bar + svert. balsai */}
                            <div className="flex items-center gap-2">
                              <PopBar level={level} />
                              <span className="text-sm font-black text-gray-900">{n.weighted_votes}</span>
                              <span className="text-xs text-gray-400">svert.</span>
                            </div>
                          </div>

                          {/* Formulė: kaip susidaro svert. balsas */}
                          <p className="mt-1.5 text-[11px] text-gray-500">
                            <span className="font-semibold text-gray-700">{internal.length}</span> narių×3
                            {' '}+{' '}
                            <span className="font-semibold text-gray-700">{external.length}</span> svečių×1
                            {' '}={' '}
                            <span className="font-semibold text-gray-700">{internal.length * 3 + external.length}</span> svert. balsų
                            {b ? '' : ' (kraunama…)'}
                          </p>

                          {/* Vidiniai balsuotojai */}
                          {internal.length > 0 && (
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Nariai:</span>
                              {internal.map((v, k) => {
                                const nm = v.full_name || v.username || 'Narys'
                                return (
                                  <span key={k} className="inline-flex items-center gap-1 rounded-full bg-gray-100 py-0.5 pl-0.5 pr-1.5">
                                    {v.avatar_url
                                      ? <img src={v.avatar_url} alt="" className="h-4 w-4 rounded-full object-cover" />
                                      : <span className="flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-extrabold text-white" style={{ background: `hsl(${strHue(nm)},45%,55%)` }}>{nm.charAt(0).toUpperCase()}</span>}
                                    <span className="text-[11px] font-medium text-gray-700">{nm}</span>
                                    <button type="button" onClick={() => deleteVotes(n.id, `user_id=${v.user_id}`, `Ištrinti nario „${nm}" balsą už šią dainą?`)} title="Ištrinti šio nario balsą" className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-red-100 hover:text-red-500">×</button>
                                  </span>
                                )
                              })}
                            </div>
                          )}

                          {/* Išoriniai (svečių) balsai — IP, spam analizei */}
                          {external.length > 0 && (
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Svečiai ({external.length}):</span>
                              {external.slice(0, 12).map((v, k) => (
                                <span key={k} className="inline-flex items-center gap-0.5 rounded bg-amber-50 py-0.5 pl-1.5 pr-1 font-mono text-[10px] text-amber-700">
                                  {v.ip}
                                  <button type="button" onClick={() => deleteVotes(n.id, `ip=${encodeURIComponent(v.ip)}`, `Ištrinti šio IP (${v.ip}) balsą už šią dainą?`)} title="Ištrinti šio svečio balsą" className="flex h-3.5 w-3.5 items-center justify-center rounded-full text-amber-500 transition-colors hover:bg-red-100 hover:text-red-500">×</button>
                                </span>
                              ))}
                              {external.length > 12 && <span className="text-[10px] text-gray-400">+{external.length - 12}</span>}
                              <button onClick={() => clearExternal(n.id)}
                                className="ml-1 rounded border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600 transition-colors hover:bg-red-100">
                                Išvalyti svečių balsus
                              </button>
                            </div>
                          )}

                          {n.comment && <p className="mt-2 text-xs italic text-gray-500">„{n.comment}"</p>}
                          <p className="mt-1 text-[11px] text-gray-400">
                            {new Date(n.created_at).toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>

                        {/* Šalinti pasiūlymą */}
                        <button onClick={() => removeNomination(n.id)}
                          className="flex-shrink-0 rounded px-2 py-1 text-xs font-semibold text-red-500 transition-colors hover:bg-red-50 hover:text-red-600">
                          Šalinti
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* HISTORY TAB */}
        {tab === 'history' && (
          <div>
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : winners.length === 0 ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center">
                <p className="text-gray-500">Dar nėra nugalėtojų istorijos.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-400">
                      <th className="px-4 py-3">Data</th>
                      <th className="px-4 py-3">Daina</th>
                      <th className="px-4 py-3 text-right">Balsai</th>
                    </tr>
                  </thead>
                  <tbody>
                    {winners.map(w => (
                      <tr key={w.id} className="border-b border-gray-100 transition-colors hover:bg-gray-50">
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                          {new Date(w.date).toLocaleDateString('lt-LT', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                              {w.tracks?.cover_url
                                ? <img src={w.tracks.cover_url} alt="" className="h-full w-full object-cover" />
                                : <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">♪</div>}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{w.tracks?.title}</p>
                              <p className="text-xs text-gray-500">{artistName(w.tracks)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-bold text-gray-900">{w.weighted_votes}</span>
                          <span className="ml-1 text-xs text-gray-400">svert.</span>
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
