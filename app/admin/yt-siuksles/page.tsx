'use client'

/**
 * /admin/yt-siuksles — dainos su YouTube peržiūromis, bet be veikiančio embed.
 * „Šiukšlinės" peržiūros (video dingo / neembeddinamas). Galima nunulinti views.
 */

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

type Track = {
  id: number
  slug: string
  title: string
  video_views: number | null
  video_url: string | null
  video_embeddable: boolean | null
  reason: 'no_url' | 'not_embeddable'
  artist_name: string | null
  artist_slug: string | null
}

function fmtViews(n: number | null): string {
  if (!n) return '0'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + 'M'
  if (n >= 1_000) return (n / 1000).toFixed(1).replace('.0', '') + 'k'
  return String(n)
}

export default function YtSiukslesPage() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [min, setMin] = useState(0)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<Record<number, boolean>>({})
  const [bulkBusy, setBulkBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500) }

  const load = useCallback(async (pg: number, mn: number, append: boolean) => {
    setLoading(true)
    try {
      const r = await fetch(`/api/admin/yt-siuksles?page=${pg}&min=${mn}`)
      const j = await r.json()
      if (j.error) { flash(j.error); return }
      setTotal(j.total || 0)
      setHasMore(!!j.hasMore)
      setTracks(prev => append ? [...prev, ...(j.tracks || [])] : (j.tracks || []))
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load(0, min, false); setPage(0) }, [min, load])

  const zeroOne = async (t: Track) => {
    setBusy(b => ({ ...b, [t.id]: true }))
    try {
      const r = await fetch('/api/admin/yt-siuksles/action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'zero_one', id: t.id }),
      })
      const j = await r.json()
      if (j.ok) { setTracks(ts => ts.filter(x => x.id !== t.id)); setTotal(n => Math.max(0, n - 1)); flash('Nunulinta.') }
      else flash('Klaida: ' + (j.error || ''))
    } finally { setBusy(b => ({ ...b, [t.id]: false })) }
  }

  const zeroAll = async () => {
    if (!confirm(`Nunulinti peržiūras VISOMS ${total} dainoms be embed? Šio veiksmo atšaukti negalima.`)) return
    setBulkBusy(true)
    try {
      const r = await fetch('/api/admin/yt-siuksles/action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'zero_all', min }),
      })
      const j = await r.json()
      if (j.ok) { flash(`Nunulinta: ${j.zeroed}.`); load(0, min, false); setPage(0) }
      else flash('Klaida: ' + (j.error || ''))
    } finally { setBulkBusy(false) }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold">🧽 YouTube šiukšlės</h1>
        <button
          onClick={zeroAll}
          disabled={bulkBusy || total === 0}
          className="px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-medium disabled:opacity-50"
        >
          {bulkBusy ? 'Nulinama…' : `Nunulinti visas (${total})`}
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Dainos su YouTube peržiūromis, bet be veikiančio embed (video dingo arba neembeddinamas) — peržiūros yra
        „šiukšlinės" ir iškreipia populiarumą. Nunulink jas.
      </p>

      <div className="flex items-center gap-2 mb-4 text-sm">
        <span className="text-gray-500">Min. peržiūrų:</span>
        {[0, 1000, 10000, 100000].map(v => (
          <button
            key={v}
            onClick={() => setMin(v)}
            className={`px-3 py-1 rounded-full border ${min === v ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-700 border-gray-300'}`}
          >
            {v === 0 ? 'Visos' : '≥ ' + fmtViews(v)}
          </button>
        ))}
      </div>

      {toast && <div className="mb-4 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm">{toast}</div>}

      {loading && tracks.length === 0 && <div className="text-gray-500 py-10 text-center">Kraunama…</div>}
      {!loading && tracks.length === 0 && <div className="text-gray-500 py-10 text-center">Nieko nerasta. 🎉</div>}

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {tracks.map(t => (
          <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <Link href={`/admin/tracks/${t.id}`} target="_blank" rel="noopener noreferrer" className="font-medium text-gray-900 hover:underline truncate">{t.title}</Link>
              <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                {t.artist_slug
                  ? <Link href={`/atlikejai/${t.artist_slug}`} className="hover:underline">{t.artist_name || '—'}</Link>
                  : <span>{t.artist_name || '—'}</span>}
                <span className="text-gray-300">·</span>
                <span className="text-gray-400">#{t.id}</span>
                <span className="text-gray-300">·</span>
                <span className={t.reason === 'no_url' ? 'text-amber-600' : 'text-purple-600'}>
                  {t.reason === 'no_url' ? 'nėra video URL' : 'neembeddinamas'}
                </span>
              </div>
            </div>
            <span className="text-sm font-semibold text-gray-700 shrink-0" title="YouTube peržiūros">▶ {fmtViews(t.video_views)}</span>
            <button
              onClick={() => zeroOne(t)}
              disabled={busy[t.id]}
              className="px-2.5 py-1 rounded-md bg-white border border-red-200 text-red-600 text-xs hover:bg-red-50 disabled:opacity-50 shrink-0"
            >
              {busy[t.id] ? '…' : 'Nunulinti'}
            </button>
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="text-center mt-6">
          <button
            onClick={() => { const n = page + 1; setPage(n); load(n, min, true) }}
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
