'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

/* /admin/charts/missing — agreguotos trūkstamos (nesusietos) dainos per visus
 * dainų topus. Sutvarkius vieną kartą, daina susidėlioja į VISUS topus. */

type Missing = { artist: string; title: string; chartCount: number; charts: string[] }
type Hit = { type: string; id: number; slug: string; title: string; artist: string | null; image_url: string | null }

/* Supaprastina netvarkingą topo atlikėjo kreditą iki PIRMO atlikėjo paieškai
 * (mirror lib/chart-resolve primaryArtist): „HUNTR/X: EJAE, Audrey Nuna & REI AMI"
 * → „HUNTR/X". Taip picker'io default query randa dainą be rankinio trynimo. */
function simpleArtist(name: string): string {
  return (name || '').split(/,| & |\bfeaturing\b|\bfeat\.?\b|\bft\.?\b| x |\bvs\.?\b|\bw\/|:/i)[0].trim()
}

/* Nuvalo title paieškai: nuima (...), [...], „ - versija" priesagą ir „feat…"
 * uodegą — „Starboy (w/ Daft Punk)" → „Starboy". Taip picker'is randa be junk'o. */
function cleanTitle(t: string): string {
  return (t || '')
    .replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '')
    .replace(/\s[-–—]\s.*$/, '').replace(/\bfeat(uring)?\.?\b.*$/i, '')
    .replace(/\s+/g, ' ').trim()
}

export default function AdminMissingPage() {
  const [list, setList] = useState<Missing[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/admin/charts/missing').then(r => r.json()).catch(() => ({ missing: [] }))
    setList(r.missing || [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const onDone = (m: Missing) => setList(prev => prev.filter(x => !(x.artist === m.artist && x.title === m.title)))

  return (
    <div className="mx-auto max-w-[860px] px-4 py-6 sm:px-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Trūkstamos dainos</h1>
          <p className="mt-1 text-sm text-gray-500">Nesusietos dainos iš visų topų. Sutvarkyk vieną kartą — susidėlios į visus.</p>
        </div>
        <a href="/admin/charts" className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100">← Topų valdymas</a>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400">Kraunama…</div>
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">Visos dainos susietos 🎉</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          {list.map((m, i) => <MissingRow key={`${m.artist}-${m.title}-${i}`} m={m} onDone={() => onDone(m)} />)}
        </div>
      )}
    </div>
  )
}

function MissingRow({ m, onDone }: { m: Missing; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)

  const act = async (action: string, extra?: any) => {
    setBusy(true); setMsg('Tvarkoma…')
    const r = await fetch('/api/admin/charts/missing', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artist: m.artist, title: m.title, action, ...extra }),
    }).then(r => r.json()).catch(() => null)
    setBusy(false)
    if (r?.ok) { setMsg(`✓ susieta ${r.linked ?? 0} topuose`); setTimeout(onDone, 700) }
    else setMsg(r?.error || 'Klaida')
  }

  return (
    <div className="border-b border-gray-100 px-3 py-2.5 last:border-b-0">
      <div className="flex items-center gap-3">
        <span className="shrink-0 rounded bg-amber-100 px-2 py-0.5 text-[13px] font-bold tabular-nums text-amber-700" title="Keliuose topuose">{m.chartCount}×</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-800">{m.title}</p>
          <p className="truncate text-xs text-gray-500">{m.artist} <span className="text-gray-300">· {m.charts.join(', ')}</span></p>
        </div>
        {msg && <span className="shrink-0 text-[13px] font-medium text-gray-500">{msg}</span>}
        <div className="flex shrink-0 items-center gap-1.5">
          <button onClick={() => setSearching(s => !s)} disabled={busy}
            className="rounded bg-gray-100 px-2.5 py-1 text-[13px] font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50">Susieti</button>
          <button onClick={() => act('create')} disabled={busy}
            title="Sukurti dainą + atlikėją ir susieti visuose topuose"
            className="rounded bg-blue-50 px-2.5 py-1 text-[13px] font-semibold text-blue-600 hover:bg-blue-100 disabled:opacity-50">Sukurti</button>
        </div>
      </div>
      {searching && <LinkSearch defaultQuery={`${simpleArtist(m.artist)} ${cleanTitle(m.title)}`} fallbackQuery={cleanTitle(m.title)} onPick={(h) => { setSearching(false); act('link', { trackId: h.id }) }} />}
    </div>
  )
}

function LinkSearch({ defaultQuery, fallbackQuery, onPick }: { defaultQuery: string; fallbackQuery?: string; onPick: (h: Hit) => void }) {
  const [q, setQ] = useState(defaultQuery)
  const [hits, setHits] = useState<Hit[]>([])
  const [loading, setLoading] = useState(false)
  const t = useRef<any>(null)
  // fallback: jei „atlikėjas + pavadinimas" nieko neranda (pvz. chart primary
  // artist ≠ katalogo artist — „Шадэ" yra po Xcho, ne „Индия"), bandom dar kartą
  // TIK su pavadinimu, kad daina vis tiek išnirtų pasirinkimui.
  const run = useCallback((query: string, fallback?: string) => {
    if (t.current) clearTimeout(t.current)
    t.current = setTimeout(async () => {
      if (query.trim().length < 2) { setHits([]); return }
      setLoading(true)
      const fetchHits = async (qq: string): Promise<Hit[]> => {
        const r = await fetch(`/api/search-entities?q=${encodeURIComponent(qq)}`).then(r => r.json()).catch(() => ({ results: [] }))
        return (r.results || []).filter((h: Hit) => h.type === 'daina').slice(0, 6)
      }
      let res = await fetchHits(query)
      if (res.length === 0 && fallback && fallback.trim() && fallback.trim() !== query.trim()) {
        res = await fetchHits(fallback)
      }
      setHits(res)
      setLoading(false)
    }, 250)
  }, [])
  useEffect(() => { run(defaultQuery, fallbackQuery) }, [defaultQuery, fallbackQuery, run])
  return (
    <div className="ml-12 mt-2 rounded-lg border border-gray-200 bg-gray-50 p-2">
      <input autoFocus value={q} onChange={e => { setQ(e.target.value); run(e.target.value) }}
        placeholder="Ieškoti dainos kataloge…"
        className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:border-violet-400" />
      <div className="mt-1.5 max-h-52 overflow-y-auto">
        {loading && <p className="px-2 py-1.5 text-xs text-gray-400">Ieškoma…</p>}
        {!loading && hits.length === 0 && <p className="px-2 py-1.5 text-xs text-gray-400">Nieko nerasta. Naudok „Sukurti".</p>}
        {hits.map(h => (
          <button key={h.id} onClick={() => onPick(h)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white">
            {h.image_url ? <img src={h.image_url} alt="" className="h-7 w-7 shrink-0 rounded object-cover" /> : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-gray-200 text-gray-400">♪</span>}
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-gray-800">{h.title}</span><span className="block truncate text-xs text-gray-400">{h.artist}</span></span>
            <span className="shrink-0 text-[13px] font-semibold text-violet-600">Susieti</span>
          </button>
        ))}
      </div>
    </div>
  )
}
