'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

/* /admin/topai — topų antraščių vizualai (vėliavos / paveiksliukai).
 * Kiekvienam topui galima įkelti header paveiksliuką (arba palikti tuščią —
 * tada /topai puslapyje rodoma automatinė šalies vėliava). Saugoma į
 * external_charts.cover_image_url per PATCH /api/admin/charts/[id]. */

type Chart = {
  id: number; source: string; chart_key: string; title: string
  scope: string; country: string | null; cover_image_url: string | null
}

const SCOPE_LT: Record<string, string> = { lt: 'Lietuva', world: 'Pasaulis', social: 'Trendai' }

function flagUrl(country: string | null): string | null {
  const cc = (country || '').toLowerCase()
  return (cc === 'lt' || cc === 'us' || cc === 'gb') ? `https://flagcdn.com/w80/${cc}.png` : null
}

export default function AdminTopaiVizualai() {
  const [charts, setCharts] = useState<Chart[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/admin/charts?all=1').then(r => r.json()).catch(() => ({ charts: [] }))
    setCharts((r.charts || []).map((c: any) => ({
      id: c.id, source: c.source, chart_key: c.chart_key, title: c.title,
      scope: c.scope, country: c.country ?? null, cover_image_url: c.cover_image_url ?? null,
    })))
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const groups = ['lt', 'world', 'social']

  return (
    <div className="mx-auto max-w-[900px] px-4 py-6 sm:px-6">
      <div className="mb-5">
        <h1 className="text-2xl font-black text-gray-900">Topų vizualai</h1>
        <p className="mt-1 text-sm text-gray-500">
          Įkelk antraštės paveiksliuką (pvz. vėliavą) kiekvienam topui. Paliktas tuščias — rodoma automatinė šalies vėliava.
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400">Kraunama…</div>
      ) : (
        groups.map(g => {
          const list = charts.filter(c => c.scope === g)
          if (list.length === 0) return null
          return (
            <div key={g} className="mb-6">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">{SCOPE_LT[g] || g}</h2>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {list.map(c => <Row key={c.id} chart={c} onSaved={load} />)}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

function Row({ chart, onSaved }: { chart: Chart; onSaved: () => void }) {
  const [url, setUrl] = useState(chart.cover_image_url || '')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const preview = url || flagUrl(chart.country)

  const save = async (value: string | null) => {
    setBusy(true)
    await fetch(`/api/admin/charts/${chart.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cover_image_url: value }),
    }).catch(() => null)
    setBusy(false); onSaved()
  }

  const onFile = async (f: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const r = await fetch('/api/upload', { method: 'POST', body: fd }).then(r => r.json())
      if (r?.url) { setUrl(r.url); await save(r.url) }
      else alert(r?.error || 'Įkėlimas nepavyko')
    } catch { alert('Įkėlimas nepavyko') }
    setUploading(false)
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3">
      <div className="h-10 w-14 shrink-0 overflow-hidden rounded-md bg-gray-100">
        {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-gray-300">🌐</span>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-800">{chart.title}</p>
        <div className="mt-1 flex items-center gap-1.5">
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="Paveiksliuko URL arba įkelk →"
            className="min-w-0 flex-1 rounded-md border border-gray-200 px-2 py-1 text-xs outline-none focus:border-violet-400" />
          <button onClick={() => save(url.trim() || null)} disabled={busy}
            className="shrink-0 rounded-md bg-gray-800 px-2.5 py-1 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-50">
            {busy ? '…' : 'Išsaugoti'}
          </button>
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          className="rounded-md bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50">
          {uploading ? '…' : 'Įkelti'}
        </button>
        {url && (
          <button onClick={() => { setUrl(''); save(null) }} disabled={busy}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-gray-400 hover:bg-gray-100">Šalinti</button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
    </div>
  )
}
