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

  const main = charts.filter(c => c.source === 'consensus')
  const concrete = charts.filter(c => c.source !== 'consensus')

  return (
    <div className="mx-auto max-w-[760px] px-4 py-6 sm:px-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Topų vizualai</h1>
          <p className="mt-1 text-sm text-gray-500">Pagrindiniams topams — header paveiksliukas; konkretiems — tik vėliava.</p>
        </div>
        <a href="/admin/charts" className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100">← Topų valdymas</a>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400">Kraunama…</div>
      ) : (
        <>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Pagrindiniai topai (paveiksliukas)</h2>
          <div className="mb-6 grid grid-cols-1 gap-2">
            {main.map(c => <PhotoRow key={c.id} chart={c} onSaved={load} />)}
            {main.length === 0 && <p className="text-xs text-gray-400">Nėra.</p>}
          </div>

          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Konkretūs šaltiniai (vėliava)</h2>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {concrete.map(c => <FlagRow key={c.id} chart={c} onSaved={load} />)}
          </div>
        </>
      )}
    </div>
  )
}

/* Pagrindiniai (consensus) topai — header paveiksliuko įkėlimas. */
function PhotoRow({ chart, onSaved }: { chart: Chart; onSaved: () => void }) {
  const [url, setUrl] = useState(chart.cover_image_url || '')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const preview = url || flagUrl(chart.country)

  const save = async (value: string | null) => {
    setBusy(true)
    await fetch(`/api/admin/charts/${chart.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cover_image_url: value }),
    }).catch(() => null)
    setBusy(false); onSaved()
  }
  const onFile = async (f: File) => {
    setUploading(true)
    try {
      const fd = new FormData(); fd.append('file', f)
      const r = await fetch('/api/upload', { method: 'POST', body: fd }).then(r => r.json())
      if (r?.url) { setUrl(r.url); await save(r.url) } else alert(r?.error || 'Įkėlimas nepavyko')
    } catch { alert('Įkėlimas nepavyko') }
    setUploading(false)
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-2.5">
      <div className="h-11 w-16 shrink-0 overflow-hidden rounded-md bg-gray-100">
        {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-gray-300">🌐</span>}
      </div>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800">{chart.title}</span>
      <button onClick={() => fileRef.current?.click()} disabled={uploading}
        className="shrink-0 rounded-md bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50">{uploading ? '…' : 'Įkelti'}</button>
      {url && <button onClick={() => { setUrl(''); save(null) }} disabled={busy}
        className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-gray-400 hover:bg-gray-100">Šalinti</button>}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
    </div>
  )
}

/* Konkretūs šaltiniai — tik vėliavos pasirinkimas. */
function FlagRow({ chart, onSaved }: { chart: Chart; onSaved: () => void }) {
  const [cc, setCc] = useState(chart.country || '')
  const [busy, setBusy] = useState(false)
  const save = async (value: string) => {
    setCc(value); setBusy(true)
    await fetch(`/api/admin/charts/${chart.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ country: value || null }),
    }).catch(() => null)
    setBusy(false); onSaved()
  }
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5">
      <div className="h-6 w-9 shrink-0 overflow-hidden rounded bg-gray-100">
        {flagUrl(cc) ? <img src={flagUrl(cc)!} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-[11px] text-gray-300">🌐</span>}
      </div>
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-700">{chart.title}</span>
      <select value={cc} onChange={e => save(e.target.value)} disabled={busy}
        className="shrink-0 rounded-md border border-gray-200 px-1.5 py-1 text-xs outline-none focus:border-violet-400">
        <option value="">—</option>
        <option value="LT">🇱🇹 LT</option>
        <option value="US">🇺🇸 US</option>
        <option value="GB">🇬🇧 UK</option>
      </select>
    </div>
  )
}
