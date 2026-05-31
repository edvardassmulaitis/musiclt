'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

/* ───────────────────────────── Types ───────────────────────────── */
type Counts = { total: number; matched: number; created: number; text_only: number; pending: number }
type Chart = {
  id: number; source: string; chart_key: string; title: string; subtitle: string | null
  scope: string; size: number; accent: string; period_label: string; attribution: string | null
  source_url: string | null; counts: Counts
  featured?: boolean; featured_order?: number | null; cover_image_url?: string | null
}
type Entry = {
  id: number; position: number; prevPosition: number | null; weeksOnChart: number | null; isNew: boolean
  artistName: string; title: string; coverUrl: string | null; resolveState: string
  track: { id: number; slug: string; title: string; artist: string | null; artistSlug: string | null } | null
}
type Hit = { type: string; id: number; slug: string; title: string; artist: string | null; image_url: string | null }

const SCOPE_LT: Record<string, string> = { lt: 'Lietuva', world: 'Pasaulis', social: 'Trendai' }
const STATE_META: Record<string, { label: string; cls: string }> = {
  matched:   { label: 'Susieta',     cls: 'bg-emerald-100 text-emerald-700' },
  created:   { label: 'Sukurta',     cls: 'bg-blue-100 text-blue-700' },
  text_only: { label: 'Tik tekstas', cls: 'bg-gray-100 text-gray-500' },
  pending:   { label: 'Laukia',      cls: 'bg-amber-100 text-amber-700' },
  ambiguous: { label: 'Dviprasmiška', cls: 'bg-amber-100 text-amber-700' },
}

/* ───────────────────────────── Page ───────────────────────────── */
export default function AdminChartsPage() {
  const [charts, setCharts] = useState<Chart[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Chart | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [entriesLoading, setEntriesLoading] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [filter, setFilter] = useState<'all' | 'unresolved'>('all')
  const [featuredEdit, setFeaturedEdit] = useState(false)
  const [coverEdit, setCoverEdit] = useState('')
  const [savingMeta, setSavingMeta] = useState(false)

  const loadCharts = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/admin/charts').then(r => r.json()).catch(() => ({ charts: [] }))
    setCharts(r.charts || [])
    setLoading(false)
  }, [])

  const loadEntries = useCallback(async (chartId: number) => {
    setEntriesLoading(true)
    const r = await fetch(`/api/admin/charts/${chartId}/entries`).then(r => r.json()).catch(() => ({ entries: [] }))
    setEntries(r.entries || [])
    setEntriesLoading(false)
  }, [])

  useEffect(() => { loadCharts() }, [loadCharts])

  const openChart = (c: Chart) => {
    setSelected(c); setFilter('all'); loadEntries(c.id)
    setFeaturedEdit(!!c.featured); setCoverEdit(c.cover_image_url || '')
  }

  const saveMeta = async () => {
    if (!selected) return
    setSavingMeta(true)
    await fetch(`/api/admin/charts/${selected.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ featured: featuredEdit, cover_image_url: coverEdit.trim() || null }),
    }).catch(() => null)
    setSavingMeta(false)
    await loadCharts()
    setSelected(s => s ? { ...s, featured: featuredEdit, cover_image_url: coverEdit.trim() || null } : s)
  }

  const autoMatch = async () => {
    if (!selected) return
    setResolving(true)
    const r = await fetch(`/api/admin/charts/${selected.id}/resolve`, { method: 'POST' }).then(r => r.json()).catch(() => null)
    setResolving(false)
    if (r) { await loadEntries(selected.id); await loadCharts(); }
    if (r?.matched != null) alert(`Automatiškai susieta: ${r.matched} iš ${r.processed} neapdorotų.`)
  }

  const onEntryChanged = async () => {
    if (selected) { await loadEntries(selected.id); loadCharts() }
  }

  const visibleEntries = filter === 'unresolved'
    ? entries.filter(e => e.resolveState === 'pending' || e.resolveState === 'ambiguous')
    : entries

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6">
      <div className="mb-5">
        <h1 className="text-2xl font-black text-gray-900">Topų valdymas</h1>
        <p className="mt-1 text-sm text-gray-500">
          Nuscrape'inti išoriniai topai. Susiek dainas su katalogu arba sukurk naujas.
          „Auto-match" automatiškai susieja vienareikšmius, likę lieka peržiūrai.
        </p>
      </div>

      {/* Chart grid */}
      {loading ? (
        <div className="text-sm text-gray-400">Kraunama…</div>
      ) : charts.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          Topų dar nėra. Paleisk <code className="rounded bg-gray-100 px-1.5 py-0.5">scraper/charts/ingest.py</code> arba scheduled task'ą.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {charts.map(c => {
            const ct = c.counts || { total: 0, matched: 0, created: 0, text_only: 0, pending: 0 }
            const resolved = ct.matched + ct.created
            const pct = ct.total ? Math.round((resolved / ct.total) * 100) : 0
            return (
              <button key={c.id} onClick={() => openChart(c)}
                className={`group rounded-xl border bg-white p-4 text-left transition-all hover:shadow-md ${selected?.id === c.id ? 'border-violet-400 ring-1 ring-violet-200' : 'border-gray-200'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.accent }} />
                      <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{SCOPE_LT[c.scope] || c.scope}</span>
                    </div>
                    <h3 className="mt-1 truncate font-bold text-gray-900">{c.title}</h3>
                    <p className="text-[11px] text-gray-400">{c.period_label} · {ct.total} įrašai</p>
                  </div>
                </div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-emerald-400" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold">
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700">{ct.matched} susieta</span>
                  {ct.created > 0 && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-700">{ct.created} sukurta</span>}
                  {(ct.pending > 0) && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">{ct.pending} laukia</span>}
                  {ct.text_only > 0 && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-500">{ct.text_only} tekstas</span>}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Selected chart detail */}
      {selected && (
        <div className="mt-7 rounded-xl border border-gray-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
            <div>
              <h2 className="font-bold text-gray-900">{selected.title}</h2>
              <p className="text-[11px] text-gray-400">{selected.attribution} · {selected.period_label}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-gray-200 p-0.5 text-xs">
                <button onClick={() => setFilter('all')} className={`rounded px-2 py-1 ${filter === 'all' ? 'bg-gray-100 font-semibold text-gray-800' : 'text-gray-500'}`}>Visi</button>
                <button onClick={() => setFilter('unresolved')} className={`rounded px-2 py-1 ${filter === 'unresolved' ? 'bg-amber-100 font-semibold text-amber-700' : 'text-gray-500'}`}>Tik laukiantys</button>
              </div>
              <button onClick={autoMatch} disabled={resolving}
                className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
                {resolving ? 'Tikrinama…' : 'Auto-match'}
              </button>
            </div>
          </div>

          {/* „Kiti topai" plytelės nustatymai (nav dropdown vizualas) */}
          <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 bg-gray-50/60 px-4 py-2.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
              <input type="checkbox" checked={featuredEdit} onChange={e => setFeaturedEdit(e.target.checked)} className="h-3.5 w-3.5 rounded" />
              Rodyti „Kiti topai" plytelėse
            </label>
            <input
              value={coverEdit} onChange={e => setCoverEdit(e.target.value)}
              placeholder="Plytelės paveiksliuko URL (nebūtina)"
              className="min-w-[180px] flex-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs outline-none focus:border-violet-400"
            />
            {coverEdit.trim() && <img src={coverEdit} alt="" className="h-7 w-10 rounded object-cover" />}
            <button onClick={saveMeta} disabled={savingMeta}
              className="rounded-md bg-gray-800 px-3 py-1 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-50">
              {savingMeta ? 'Saugoma…' : 'Išsaugoti'}
            </button>
          </div>

          {entriesLoading ? (
            <div className="p-6 text-sm text-gray-400">Kraunama…</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {visibleEntries.map(e => (
                <EntryRow key={e.id} entry={e} country={selected.scope === 'lt' ? 'LT' : null} onChanged={onEntryChanged} />
              ))}
              {visibleEntries.length === 0 && <div className="p-6 text-center text-sm text-gray-400">Nėra įrašų šiame filtre.</div>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ───────────────────────────── Entry row ───────────────────────────── */
function EntryRow({ entry, onChanged }: { entry: Entry; country: string | null; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [searching, setSearching] = useState(false)
  const meta = STATE_META[entry.resolveState] || STATE_META.pending
  const resolved = entry.resolveState === 'matched' || entry.resolveState === 'created'

  const act = async (action: string, extra?: any) => {
    setBusy(true)
    await fetch('/api/admin/charts/entry', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryId: entry.id, action, ...extra }),
    }).catch(() => null)
    setBusy(false); setSearching(false); onChanged()
  }

  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center gap-3">
        <span className="w-7 shrink-0 text-center text-sm font-black tabular-nums text-gray-400">{entry.position}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-800">{entry.title}</p>
          <p className="truncate text-xs text-gray-400">{entry.artistName}</p>
        </div>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${meta.cls}`}>{meta.label}</span>

        {resolved && entry.track ? (
          <div className="hidden min-w-0 max-w-[230px] shrink-0 items-center gap-1.5 sm:flex">
            <a href={`/dainos/${entry.track.slug}`} target="_blank" rel="noreferrer"
              className="truncate text-xs text-violet-600 hover:underline">
              → {entry.track.artist} – {entry.track.title}
            </a>
          </div>
        ) : null}

        <div className="flex shrink-0 items-center gap-1">
          {resolved ? (
            <button onClick={() => act('unlink')} disabled={busy}
              className="rounded px-2 py-1 text-[11px] font-medium text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50">Atrišti</button>
          ) : (
            <>
              <button onClick={() => setSearching(s => !s)} disabled={busy}
                className="rounded bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50">Susieti</button>
              <button onClick={() => act('create')} disabled={busy}
                className="rounded bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-600 hover:bg-blue-100 disabled:opacity-50"
                title="Sukurti naują atlikėją + dainą">Sukurti</button>
              <button onClick={() => act('skip')} disabled={busy}
                className="rounded px-2 py-1 text-[11px] font-medium text-gray-400 hover:bg-gray-100 disabled:opacity-50">Praleisti</button>
            </>
          )}
        </div>
      </div>

      {searching && !resolved && (
        <LinkSearch defaultQuery={`${entry.artistName} ${entry.title}`} onPick={(h) => act('link', { trackId: h.id })} />
      )}
    </div>
  )
}

/* ───────────────────────────── Inline search picker ───────────────────────────── */
function LinkSearch({ defaultQuery, onPick }: { defaultQuery: string; onPick: (h: Hit) => void }) {
  const [q, setQ] = useState(defaultQuery)
  const [hits, setHits] = useState<Hit[]>([])
  const [loading, setLoading] = useState(false)
  const t = useRef<any>(null)

  const run = useCallback((query: string) => {
    if (t.current) clearTimeout(t.current)
    t.current = setTimeout(async () => {
      if (query.trim().length < 2) { setHits([]); return }
      setLoading(true)
      const r = await fetch(`/api/search-entities?q=${encodeURIComponent(query)}`).then(r => r.json()).catch(() => ({ results: [] }))
      setHits((r.results || []).filter((h: Hit) => h.type === 'daina').slice(0, 8))
      setLoading(false)
    }, 250)
  }, [])

  useEffect(() => { run(defaultQuery) }, [defaultQuery, run])

  return (
    <div className="ml-10 mt-2 rounded-lg border border-gray-200 bg-gray-50 p-2">
      <input
        autoFocus value={q}
        onChange={e => { setQ(e.target.value); run(e.target.value) }}
        placeholder="Ieškoti dainos kataloge…"
        className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:border-violet-400"
      />
      <div className="mt-1.5 max-h-56 overflow-y-auto">
        {loading && <p className="px-2 py-1.5 text-xs text-gray-400">Ieškoma…</p>}
        {!loading && hits.length === 0 && <p className="px-2 py-1.5 text-xs text-gray-400">Nieko nerasta. Naudok „Sukurti".</p>}
        {hits.map(h => (
          <button key={h.id} onClick={() => onPick(h)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white">
            {h.image_url
              ? <img src={h.image_url} alt="" className="h-7 w-7 shrink-0 rounded object-cover" />
              : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-gray-200 text-gray-400">♪</span>}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-gray-800">{h.title}</span>
              <span className="block truncate text-xs text-gray-400">{h.artist}</span>
            </span>
            <span className="shrink-0 text-[11px] font-semibold text-violet-600">Susieti</span>
          </button>
        ))}
      </div>
    </div>
  )
}
