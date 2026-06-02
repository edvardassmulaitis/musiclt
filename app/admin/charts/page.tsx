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
type ArtistStatus = { name: string; exists: boolean; id: number | null; slug: string | null }
type Entry = {
  id: number; position: number; prevPosition: number | null; weeksOnChart: number | null; isNew: boolean
  artistName: string; title: string; coverUrl: string | null; resolveState: string
  entityType?: 'track' | 'album'
  track: { id: number; slug: string; title: string; artist: string | null; artistSlug: string | null; artistId?: number | null; href?: string | null } | null
  primaryArtist?: ArtistStatus | null
  featuringArtists?: ArtistStatus[]
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
  const [creating, setCreating] = useState(false)
  const [createProgress, setCreateProgress] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'unresolved'>('all')
  const [featuredEdit, setFeaturedEdit] = useState(false)
  const [coverEdit, setCoverEdit] = useState('')
  const [savingMeta, setSavingMeta] = useState(false)
  const detailRef = useRef<HTMLDivElement>(null)

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
    // Mobile: po pasirinkimo iškart nuscrollinam į įrašų sąrašą (ne ranka).
    setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
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

  // „Sukurti likusius" — visiems pending/ambiguous sukuria ghost atlikėją+dainą.
  // Time-budget'as serveryje grąžina remaining>0; kartojam kol nuliuojam.
  const createAll = async () => {
    if (!selected) return
    if (!confirm('Sukurti ghost atlikėją + dainą VISIEMS likusiems neapdorotiems įrašams? Vėliau supildysi per /admin/artists.')) return
    setCreating(true); setCreateProgress('Kuriama…')
    let totalCreated = 0
    for (let guard = 0; guard < 40; guard++) {
      const r = await fetch(`/api/admin/charts/${selected.id}/resolve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'create' }),
      }).then(r => r.json()).catch(() => null)
      if (!r) break
      totalCreated += r.created || 0
      await loadEntries(selected.id)
      if (!r.remaining || r.remaining <= 0) break
      setCreateProgress(`Sukurta ${totalCreated}, liko ~${r.remaining}…`)
    }
    setCreating(false); setCreateProgress(null)
    await loadCharts()
    alert(`Sukurta ${totalCreated} naujų atlikėjų/dainų.`)
  }

  const onEntryChanged = async () => {
    if (selected) { await loadEntries(selected.id); loadCharts() }
  }

  const visibleEntries = filter === 'unresolved'
    ? entries.filter(e => e.resolveState === 'pending' || e.resolveState === 'ambiguous')
    : entries

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Topų valdymas</h1>
          <p className="mt-1 text-sm text-gray-500">
            Nuscrape'inti išoriniai topai. Susiek dainas su katalogu arba sukurk naujas.
            „Auto-match" automatiškai susieja vienareikšmius, likę lieka peržiūrai.
          </p>
        </div>
        <a href="/admin/topai" className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100">
          Topų vizualai →
        </a>
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
        <div ref={detailRef} className="mt-7 scroll-mt-4 rounded-xl border border-gray-200 bg-white">
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
              <button onClick={autoMatch} disabled={resolving || creating}
                className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
                {resolving ? 'Tikrinama…' : 'Auto-match'}
              </button>
              <button onClick={createAll} disabled={creating || resolving}
                title="Visiems likusiems sukurti ghost atlikėją + dainą"
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                {creating ? (createProgress || 'Kuriama…') : 'Sukurti likusius'}
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
                <EntryRow key={e.id} entry={e} isAlbum={selected.chart_key === 'albums'} onChanged={onEntryChanged} />
              ))}
              {visibleEntries.length === 0 && <div className="p-6 text-center text-sm text-gray-400">Nėra įrašų šiame filtre.</div>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Vieno atlikėjo „chip": yra → nuoroda į administraciją, nėra → „Sukurti" ── */
function ArtistChip({ artist, prefix, onCreate, busy }: {
  artist: ArtistStatus; prefix?: string; onCreate: () => void; busy: boolean
}) {
  if (artist.exists && artist.id) {
    return (
      <span className="inline-flex items-center gap-1">
        {prefix && <span className="text-gray-300">{prefix}</span>}
        <a href={`/admin/artists/${artist.id}`} target="_blank" rel="noreferrer"
          className="font-medium text-violet-600 hover:underline">{artist.name}</a>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1">
      {prefix && <span className="text-gray-300">{prefix}</span>}
      <span className="text-gray-500">{artist.name}</span>
      <button onClick={onCreate} disabled={busy}
        title={`Sukurti atlikėją „${artist.name}" (be dainos)`}
        className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50">
        + Sukurti
      </button>
    </span>
  )
}

/* ───────────────────────────── Entry row ───────────────────────────── */
function EntryRow({ entry, isAlbum, onChanged }: { entry: Entry; isAlbum: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [searching, setSearching] = useState(false)
  const meta = STATE_META[entry.resolveState] || STATE_META.pending
  const resolved = entry.resolveState === 'matched' || entry.resolveState === 'created'
  const primary = entry.primaryArtist
  const featuring = entry.featuringArtists || []

  const act = async (action: string, extra?: any) => {
    setBusy(true)
    await fetch('/api/admin/charts/entry', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryId: entry.id, action, ...extra }),
    }).catch(() => null)
    setBusy(false); setSearching(false); onChanged()
  }

  // Susieto entiteto admin nuoroda (daina → /admin/tracks/[id], albumas → /admin/albums/[id]).
  const adminEntityHref = entry.track ? `/admin/${isAlbum ? 'albums' : 'tracks'}/${entry.track.id}` : null

  return (
    <div className="px-3 py-2.5 sm:px-4">
      <div className="flex items-start gap-2.5 sm:gap-3">
        <span className="w-6 shrink-0 pt-0.5 text-center text-sm font-black tabular-nums text-gray-400 sm:w-7">{entry.position}</span>
        <div className="min-w-0 flex-1">
          {/* Dainos/albumo pavadinimas (+ „Sukurti" prie nesusieto = daina+atlikėjas) */}
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold leading-snug text-gray-800">
            {resolved && adminEntityHref ? (
              <a href={adminEntityHref} target="_blank" rel="noreferrer" className="text-violet-700 hover:underline">{entry.title}</a>
            ) : (
              <span>{entry.title}</span>
            )}
            {!resolved && (
              <button onClick={() => act('create')} disabled={busy}
                title="Sukurti dainą IR atlikėją (pilnas praturtinimas: YouTube, žodžiai, Spotify)"
                className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 hover:bg-blue-100 disabled:opacity-50">
                + Sukurti {isAlbum ? 'albumą' : 'dainą'}
              </button>
            )}
          </p>

          {/* Atlikėjas(-ai): nuorodos jei yra, „Sukurti" jei ne */}
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-gray-400">
            {!resolved && primary ? (
              <ArtistChip artist={primary} onCreate={() => act('create-artist', { artistName: primary.name, isPrimary: true })} busy={busy} />
            ) : (
              <span>{entry.artistName}</span>
            )}
            {!resolved && featuring.map((f, i) => (
              <ArtistChip key={i} artist={f} prefix={i === 0 ? 'feat.' : '·'}
                onCreate={() => act('create-artist', { artistName: f.name, isPrimary: false })} busy={busy} />
            ))}
          </p>

          {/* Susietas — vieša nuoroda */}
          {resolved && entry.track?.href ? (
            <a href={entry.track.href} target="_blank" rel="noreferrer"
              className="mt-0.5 block truncate text-xs text-emerald-600 hover:underline">
              → {entry.track.artist} – {entry.track.title}
            </a>
          ) : null}
        </div>
        <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${meta.cls}`}>{meta.label}</span>
      </div>

      {/* Veiksmai: po pavadinimu, kad mobile netruktų vietos */}
      <div className="mt-1.5 flex flex-wrap items-center justify-end gap-1.5 pl-8 sm:pl-10">
        {resolved ? (
          <button onClick={() => act('unlink')} disabled={busy}
            className="rounded px-2.5 py-1 text-[11px] font-medium text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50">Atrišti</button>
        ) : (
          <>
            <button onClick={() => setSearching(s => !s)} disabled={busy}
              className="rounded bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50">Susieti su esama</button>
            <button onClick={() => act('skip')} disabled={busy}
              className="rounded px-2.5 py-1 text-[11px] font-medium text-gray-400 hover:bg-gray-100 disabled:opacity-50">Praleisti</button>
          </>
        )}
      </div>

      {searching && !resolved && (
        <LinkSearch isAlbum={isAlbum} defaultQuery={`${entry.artistName} ${entry.title}`}
          onPick={(h) => act('link', isAlbum ? { albumId: h.id } : { trackId: h.id })} />
      )}
    </div>
  )
}

/* ───────────────────────────── Inline search picker ───────────────────────────── */
function LinkSearch({ defaultQuery, isAlbum, onPick }: { defaultQuery: string; isAlbum: boolean; onPick: (h: Hit) => void }) {
  const [q, setQ] = useState(defaultQuery)
  const [hits, setHits] = useState<Hit[]>([])
  const [loading, setLoading] = useState(false)
  const t = useRef<any>(null)
  const wantType = isAlbum ? 'albumas' : 'daina'

  const run = useCallback((query: string) => {
    if (t.current) clearTimeout(t.current)
    t.current = setTimeout(async () => {
      if (query.trim().length < 2) { setHits([]); return }
      setLoading(true)
      const r = await fetch(`/api/search-entities?q=${encodeURIComponent(query)}`).then(r => r.json()).catch(() => ({ results: [] }))
      setHits((r.results || []).filter((h: Hit) => h.type === wantType).slice(0, 8))
      setLoading(false)
    }, 250)
  }, [wantType])

  useEffect(() => { run(defaultQuery) }, [defaultQuery, run])

  return (
    <div className="ml-10 mt-2 rounded-lg border border-gray-200 bg-gray-50 p-2">
      <input
        autoFocus value={q}
        onChange={e => { setQ(e.target.value); run(e.target.value) }}
        placeholder={isAlbum ? 'Ieškoti albumo kataloge…' : 'Ieškoti dainos kataloge…'}
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
