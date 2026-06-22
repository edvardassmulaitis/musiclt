'use client'

/**
 * /admin/duplikatai — dublikatų peržiūros įrankis.
 *
 * Rodo kandidatų grupes iš track_dup_groups (4 signalai: spotify, youtube,
 * tas pats atlikėjas, skirtingi atlikėjai). Adminas pasirenka „lieka" įrašą ir
 * sujungia kitus į jį (merge_tracks RPC) arba atmeta grupę. „Skenuoti iš naujo"
 * paleidžia detekciją per žingsnius.
 */

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

type Member = {
  id: number
  slug: string
  title: string
  type: string | null
  release_year: number | null
  artist_id: number | null
  artist_name: string | null
  artist_slug: string | null
  has_video: boolean
  video_url: string | null
  spotify_id: string | null
  has_spotify: boolean
  has_lyrics: boolean
  has_cover: boolean
  cover_url: string | null
  video_views: number | null
  page_view_count: number | null
  likes: number
  created_at: string | null
}
type Group = {
  id: number
  signal: string
  confidence: string
  suggested_keeper_id: number | null
  sample_title: string | null
  sample_artist: string | null
  members: Member[]
}
type Counts = Record<string, number>

const TABS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'Visi' },
  { key: 'spotify', label: 'Spotify ID' },
  { key: 'youtube', label: 'YouTube URL' },
  { key: 'same_artist', label: 'Tas pats atlikėjas' },
  { key: 'cross_artist', label: 'Skirtingi atlikėjai' },
]

const SIGNAL_LABEL: Record<string, string> = {
  spotify: 'Vienodas Spotify ID',
  youtube: 'Vienodas YouTube',
  same_artist: 'Tas pats atlikėjas + pavadinimas',
  cross_artist: 'Skirtingi atlikėjai (feat / kaveris)',
}
const CONF_COLOR: Record<string, string> = {
  high: 'bg-green-100 text-green-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-gray-200 text-gray-700',
}

const SCAN_STEPS = ['reset', 'spotify', 'youtube', 'same_artist', 'cross_artist'] as const
const SCAN_LABEL: Record<string, string> = {
  reset: 'Valoma…', spotify: 'Spotify ID…', youtube: 'YouTube…',
  same_artist: 'Tas pats atlikėjas…', cross_artist: 'Skirtingi atlikėjai…',
}

function fmtViews(n: number | null): string {
  if (!n) return ''
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + 'M'
  if (n >= 1_000) return Math.round(n / 1000) + 'k'
  return String(n)
}
function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleString('lt-LT', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function ytId(url: string | null): string | null {
  if (!url) return null
  const m = url.match(/[?&]v=([\w-]+)/) || url.match(/youtu\.be\/([\w-]+)/) || url.match(/embed\/([\w-]+)/)
  return m ? m[1] : null
}

export default function DuplikataiPage() {
  const [signal, setSignal] = useState('all')
  const [counts, setCounts] = useState<Counts>({})
  const [groups, setGroups] = useState<Group[]>([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [keeper, setKeeper] = useState<Record<number, number>>({})
  const [busy, setBusy] = useState<Record<number, boolean>>({})
  const [busyMember, setBusyMember] = useState<Record<number, boolean>>({})
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const [scan, setScan] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async (sig: string, pg: number, append: boolean) => {
    setLoading(true)
    try {
      const r = await fetch(`/api/admin/duplikatai?signal=${sig}&page=${pg}&pageSize=25`)
      const j = await r.json()
      if (j.error) { setToast(j.error); return }
      setCounts(j.counts || {})
      setHasMore(!!j.hasMore)
      setGroups(prev => append ? [...prev, ...(j.groups || [])] : (j.groups || []))
      // default keeper selection
      setKeeper(prev => {
        const next = { ...prev }
        for (const g of (j.groups || []) as Group[]) {
          if (next[g.id] === undefined) next[g.id] = g.suggested_keeper_id ?? g.members[0]?.id
        }
        return next
      })
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load(signal, 0, false); setPage(0) }, [signal, load])

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500) }

  const doMerge = async (g: Group) => {
    const keeperId = keeper[g.id]
    if (!keeperId) return
    if (!confirm(`Sujungti ${g.members.length - 1} įrašą(-us) į „${g.members.find(m => m.id === keeperId)?.title}"? Kiti įrašai bus ištrinti (su revert galimybe).`)) return
    setBusy(b => ({ ...b, [g.id]: true }))
    try {
      const r = await fetch('/api/admin/duplikatai/action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: g.id, action: 'merge', keeper_id: keeperId }),
      })
      const j = await r.json()
      if (j.ok) { setGroups(gs => gs.filter(x => x.id !== g.id)); flash(`Sujungta (${j.merged}).`) }
      else flash('Klaida sujungiant: ' + (j.error || JSON.stringify(j.results)))
    } finally { setBusy(b => ({ ...b, [g.id]: false })) }
  }

  const doDismiss = async (g: Group) => {
    setBusy(b => ({ ...b, [g.id]: true }))
    try {
      const r = await fetch('/api/admin/duplikatai/action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: g.id, action: 'dismiss' }),
      })
      const j = await r.json()
      if (j.ok) { setGroups(gs => gs.filter(x => x.id !== g.id)); flash('Atmesta.') }
      else flash('Klaida: ' + j.error)
    } finally { setBusy(b => ({ ...b, [g.id]: false })) }
  }

  const applyRemaining = (groupId: number, remainingIds: number[], done: boolean) => {
    setGroups(gs => done
      ? gs.filter(x => x.id !== groupId)
      : gs.map(x => x.id === groupId ? { ...x, members: x.members.filter(m => remainingIds.includes(m.id)) } : x))
  }

  const doMergeOne = async (g: Group, loserId: number) => {
    const keeperId = keeper[g.id]
    if (!keeperId || keeperId === loserId) { flash('Pasirink kitą „lieka" įrašą.'); return }
    setBusyMember(b => ({ ...b, [loserId]: true }))
    try {
      const r = await fetch('/api/admin/duplikatai/action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: g.id, action: 'merge_one', keeper_id: keeperId, loser_id: loserId }),
      })
      const j = await r.json()
      if (j.ok) { applyRemaining(g.id, j.remaining_ids, j.group_done); flash('Sujungta.') }
      else flash('Klaida: ' + (j.error || ''))
    } finally { setBusyMember(b => ({ ...b, [loserId]: false })) }
  }

  const doClearVideo = async (g: Group, trackId: number) => {
    setBusyMember(b => ({ ...b, [trackId]: true }))
    try {
      const r = await fetch('/api/admin/duplikatai/action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: g.id, action: 'clear_video', track_id: trackId }),
      })
      const j = await r.json()
      if (j.ok) {
        setExpanded(e => ({ ...e, [trackId]: false }))
        setGroups(gs => gs.map(x => x.id === g.id
          ? { ...x, members: x.members.map(m => m.id === trackId ? { ...m, has_video: false, video_url: null, video_views: 0 } : m) }
          : x))
        flash('Video pašalintas, peržiūros nunulintos.')
      } else flash('Klaida: ' + (j.error || ''))
    } finally { setBusyMember(b => ({ ...b, [trackId]: false })) }
  }

  const doDeleteOne = async (g: Group, trackId: number, title: string) => {
    if (!confirm(`IŠTRINTI dainą „${title}" (#${trackId}) visam laikui? Šio veiksmo atšaukti negalima.`)) return
    setBusyMember(b => ({ ...b, [trackId]: true }))
    try {
      const r = await fetch('/api/admin/duplikatai/action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: g.id, action: 'delete_one', track_id: trackId }),
      })
      const j = await r.json()
      if (j.ok) { applyRemaining(g.id, j.remaining_ids, j.group_done); flash('Ištrinta.') }
      else flash('Klaida: ' + (j.error || ''))
    } finally { setBusyMember(b => ({ ...b, [trackId]: false })) }
  }

  const doSeparateOne = async (g: Group, trackId: number) => {
    setBusyMember(b => ({ ...b, [trackId]: true }))
    try {
      const r = await fetch('/api/admin/duplikatai/action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: g.id, action: 'separate_one', track_id: trackId }),
      })
      const j = await r.json()
      if (j.ok) { applyRemaining(g.id, j.remaining_ids, j.group_done); flash('Palikta atskirai.') }
      else flash('Klaida: ' + (j.error || ''))
    } finally { setBusyMember(b => ({ ...b, [trackId]: false })) }
  }

  const runScan = async () => {
    if (scan) return
    if (!confirm('Skenuoti visą katalogą iš naujo? Tai užtruks ~2–3 min. Atmesti/sujungti įrašai išliks.')) return
    try {
      for (const step of SCAN_STEPS) {
        setScan(step)
        const r = await fetch('/api/admin/duplikatai/scan', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step }),
        })
        const j = await r.json()
        if (!j.ok) { flash(`Skenavimo klaida (${step}): ${j.error}`); break }
      }
      flash('Skenavimas baigtas.')
      load(signal, 0, false); setPage(0)
    } finally { setScan(null) }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold">🧹 Dublikatai</h1>
        <button
          onClick={runScan}
          disabled={!!scan}
          className="px-3 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-60"
        >
          {scan ? `Skenuojama: ${SCAN_LABEL[scan]}` : '↻ Skenuoti iš naujo'}
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Potencialūs dublikatai pagal 4 signalus. Pasirink, kuris įrašas <b>lieka</b>, ir sujunk kitus į jį — visus iškart
        arba po vieną (mygtukas „⤵ Sujungti" prie dainos). „▶" perklauso įrašą, „Atskirti" pašalina dainą iš grupės kaip
        ne dublikatą. Sujungus albumai/atlikėjai/patiktukai perkeliami; pralaimėtojai ištrinami su revert galimybe.
      </p>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-5">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setSignal(t.key)}
            className={`px-3 py-1.5 rounded-full text-sm border ${signal === t.key ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'}`}
          >
            {t.label}{counts[t.key] != null ? ` (${counts[t.key]})` : ''}
          </button>
        ))}
      </div>

      {toast && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm">{toast}</div>
      )}

      {loading && groups.length === 0 && <div className="text-gray-500 py-10 text-center">Kraunama…</div>}
      {!loading && groups.length === 0 && (
        <div className="text-gray-500 py-10 text-center">Nėra likusių grupių šiame signale. 🎉</div>
      )}

      <div className="space-y-4">
        {groups.map(g => {
          const keeperId = keeper[g.id]
          return (
            <div key={g.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3 text-xs">
                <span className={`px-2 py-0.5 rounded-full font-medium ${CONF_COLOR[g.confidence] || 'bg-gray-100'}`}>
                  {g.confidence === 'high' ? 'aukštas' : g.confidence === 'medium' ? 'vidutinis' : 'žemas'}
                </span>
                <span className="text-gray-500">{SIGNAL_LABEL[g.signal] || g.signal}</span>
                <span className="text-gray-300">·</span>
                <span className="text-gray-500">{g.members.length} įrašai</span>
              </div>

              <div className="divide-y divide-gray-100">
                {g.members.map(m => {
                  const isKeep = m.id === keeperId
                  const yt = ytId(m.video_url)
                  const canPlay = !!yt || !!m.spotify_id
                  const isOpen = !!expanded[m.id]
                  return (
                    <div key={m.id} className={isKeep ? 'bg-green-50 -mx-2 px-2 rounded-lg' : ''}>
                      <div className="flex items-center gap-3 py-2">
                        <input
                          type="radio"
                          name={`keep-${g.id}`}
                          checked={isKeep}
                          onChange={() => setKeeper(k => ({ ...k, [g.id]: m.id }))}
                          className="accent-green-600 cursor-pointer"
                          title="Žymėti kaip liekantį įrašą"
                        />
                        <button
                          onClick={() => canPlay && setExpanded(e => ({ ...e, [m.id]: !e[m.id] }))}
                          disabled={!canPlay}
                          title={canPlay ? 'Klausyti' : 'Nėra įrašo'}
                          className={`w-10 h-10 rounded flex items-center justify-center shrink-0 ${canPlay ? 'bg-gray-900 text-white hover:bg-gray-700' : 'bg-gray-100 text-gray-300'}`}
                        >
                          {isOpen ? '■' : '▶'}
                        </button>
                        {m.cover_url
                          ? <img src={m.cover_url} alt="" className="w-10 h-10 rounded object-cover bg-gray-100 shrink-0" />
                          : <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center text-gray-400 text-xs shrink-0">♪</div>}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link href={`/admin/tracks/${m.id}`} target="_blank" rel="noopener noreferrer" className="font-medium text-gray-900 hover:underline truncate">{m.title}</Link>
                            {isKeep && <span className="text-[10px] font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded">LIEKA</span>}
                          </div>
                          <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                            {m.artist_slug
                              ? <Link href={`/atlikejai/${m.artist_slug}`} className="hover:underline">{m.artist_name || '—'}</Link>
                              : <span>{m.artist_name || '—'}</span>}
                            {m.type && m.type !== 'normal' && <span>· {m.type}</span>}
                            {m.release_year ? <span>· {m.release_year}</span> : null}
                            <span className="text-gray-300">·</span>
                            <span className="text-gray-400">#{m.id}</span>
                            <span className="text-gray-300">·</span>
                            <span className="text-gray-400" title="Sukurta">{fmtDate(m.created_at)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-gray-500 shrink-0">
                          <span title="Patiktukai (iš senos sistemos)" className="text-rose-500 font-medium">♥ {m.likes}</span>
                          {m.video_views ? <span title="YouTube peržiūros">▶ {fmtViews(m.video_views)}</span> : null}
                          {m.has_spotify && <span title="Spotify" className="text-green-600 font-semibold">S</span>}
                          {m.has_lyrics && <span title="Žodžiai">📝</span>}
                          {m.has_cover && <span title="Viršelis">🖼</span>}
                        </div>
                        {!isKeep && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => doMergeOne(g, m.id)}
                              disabled={busyMember[m.id]}
                              title="Sujungti šitą įrašą į liekantį"
                              className="px-2 py-1 rounded-md bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                            >
                              {busyMember[m.id] ? '…' : '⤵ Sujungti'}
                            </button>
                            <button
                              onClick={() => doSeparateOne(g, m.id)}
                              disabled={busyMember[m.id]}
                              title="Tai ne dublikatas — pašalinti iš grupės"
                              className="px-2 py-1 rounded-md bg-white border border-gray-300 text-gray-600 text-xs hover:border-gray-400 disabled:opacity-50"
                            >
                              Atskirti
                            </button>
                            <button
                              onClick={() => doDeleteOne(g, m.id, m.title)}
                              disabled={busyMember[m.id]}
                              title="Ištrinti dainą visam laikui"
                              className="px-2 py-1 rounded-md bg-white border border-red-200 text-red-600 text-xs hover:bg-red-50 disabled:opacity-50"
                            >
                              🗑
                            </button>
                          </div>
                        )}
                      </div>
                      {isOpen && canPlay && (
                        <div className="pb-3">
                          {yt
                            ? <iframe
                                className="w-full rounded-lg"
                                height={200}
                                src={`https://www.youtube-nocookie.com/embed/${yt}`}
                                title={m.title}
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                              />
                            : <iframe
                                className="w-full rounded-lg"
                                height={80}
                                src={`https://open.spotify.com/embed/track/${m.spotify_id}`}
                                title={m.title}
                                allow="encrypted-media"
                              />}
                          {yt && (
                            <div className="mt-2 flex items-center gap-2">
                              <button
                                onClick={() => doClearVideo(g, m.id)}
                                disabled={busyMember[m.id]}
                                title="Pašalinti šį video nuo dainos ir nunulinti jos YouTube peržiūras"
                                className="px-2.5 py-1 rounded-md bg-white border border-red-200 text-red-600 text-xs hover:bg-red-50 disabled:opacity-50"
                              >
                                {busyMember[m.id] ? '…' : '🧽 Pašalinti video + nunulinti peržiūras'}
                              </button>
                              <a
                                href={m.video_url || `https://www.youtube.com/watch?v=${yt}`}
                                target="_blank" rel="noopener noreferrer"
                                className="text-xs text-gray-500 hover:underline"
                              >
                                Atidaryti YouTube ↗
                              </a>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                <button
                  onClick={() => doMerge(g)}
                  disabled={busy[g.id]}
                  className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm font-medium disabled:opacity-60"
                >
                  {busy[g.id] ? '…' : 'Sujungti visus į „lieka"'}
                </button>
                <button
                  onClick={() => doDismiss(g)}
                  disabled={busy[g.id]}
                  className="px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-gray-700 text-sm hover:border-gray-400 disabled:opacity-60"
                >
                  Atmesti (ne dublikatas)
                </button>
                {g.members.length === 2 && (
                  <Link
                    href={`/admin/tracks/merge?a=${keeperId}&b=${g.members.find(m => m.id !== keeperId)?.id}`}
                    className="px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-gray-700 text-sm hover:border-gray-400 ml-auto"
                  >
                    Detalus sujungimas →
                  </Link>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {hasMore && (
        <div className="text-center mt-6">
          <button
            onClick={() => { const n = page + 1; setPage(n); load(signal, n, true) }}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 text-sm hover:border-gray-400 disabled:opacity-60"
          >
            {loading ? 'Kraunama…' : 'Rodyti daugiau'}
          </button>
        </div>
      )}
    </div>
  )
}
