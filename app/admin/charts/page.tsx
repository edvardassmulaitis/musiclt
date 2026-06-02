'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { ReactNode } from 'react'

/* ───────────────────────────── Types ───────────────────────────── */
type Counts = { total: number; matched: number; created: number; text_only: number; pending: number }
type Chart = {
  id: number; source: string; chart_key: string; title: string; subtitle: string | null
  scope: string; size: number; accent: string; period_label: string; attribution: string | null
  source_url: string | null; counts: Counts; country?: string | null
  featured?: boolean; featured_order?: number | null; cover_image_url?: string | null
  fetched_at?: string | null
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

/* Resolve būsenos „kibirai" lokaliam counts perskaičiavimui (ambiguous→pending). */
type Bucket = Exclude<keyof Counts, 'total'>
const bucketOf = (state: string): Bucket =>
  state === 'matched' ? 'matched'
    : state === 'created' ? 'created'
      : state === 'text_only' ? 'text_only'
        : 'pending'

const norm = (s: string) => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').trim()

/* Nuima „(feat. X)" / „(w/ X)" / „(with X)" priesagą katalogo paieškai
 * (kitaip „Seven (w/ Latto)" niekada neranda track'o „Seven"). */
const stripFeat = (s: string) =>
  (s || '').replace(/\s*[\(\[]\s*(?:feat|ft|featuring|with|w\/)\.?\s+[^)\]]*[\)\]]/gi, '').trim() || (s || '')

/* Reliatyvi data lietuviškai („prieš 3 d.", „šiandien"). */
function relDate(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  if (days <= 0) return 'šiandien'
  if (days === 1) return 'vakar'
  if (days < 7) return `prieš ${days} d.`
  if (days < 14) return 'prieš savaitę'
  return d.toLocaleDateString('lt-LT', { year: 'numeric', month: 'short', day: 'numeric' })
}

/* Sekantis auto-tikrinimas — kasdienis scheduled task ~08:05. */
function nextCheckLabel(): string {
  const now = new Date()
  const next = new Date(now)
  next.setHours(8, 5, 0, 0)
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1)
  const isTomorrow = next.getDate() !== now.getDate()
  return `${isTomorrow ? 'rytoj' : 'šiandien'} ${next.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' })}`
}

/* ───────────────────────────── Ikonos ───────────────────────────── */
function IconCheck({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={`h-4 w-4 shrink-0 ${className}`} fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.1 3.1 6.8-6.8a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
    </svg>
  )
}
function IconEdit() {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
      <path d="M13.6 2.9a2 2 0 0 1 2.8 2.8l-.9.9-2.8-2.8.9-.9ZM11.5 5l2.8 2.8-6.4 6.4-3 .6.6-3L11.5 5Z" />
    </svg>
  )
}
function IconExternal() {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
      <path d="M12 3h5v5h-2V6.4l-5.3 5.3-1.4-1.4L13.6 5H12V3Z" />
      <path d="M5 5h4v2H6v7h7v-3h2v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
    </svg>
  )
}
/* Maža ikon-nuoroda (atsidaro naujame tab'e). title — LT „" kabutės (ne ASCII). */
function IconLink({ href, title, children }: { href: string; title: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" title={title}
      className="inline-flex h-5 w-5 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-violet-600">
      {children}
    </a>
  )
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
  const [titleEdit, setTitleEdit] = useState('')
  const [countryEdit, setCountryEdit] = useState('')
  const [savingMeta, setSavingMeta] = useState(false)
  const detailRef = useRef<HTMLDivElement>(null)

  // Refs in-place counts skaičiavimui (be reload'o, atsparu StrictMode double-invoke).
  const entriesRef = useRef<Entry[]>([])
  const selectedIdRef = useRef<number | null>(null)
  useEffect(() => { entriesRef.current = entries }, [entries])
  useEffect(() => { selectedIdRef.current = selected?.id ?? null }, [selected])

  // Konsensusas viršuje + editable → kviečiam su ?all=1, sortinam consensus pirma.
  const loadCharts = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/admin/charts?all=1').then(r => r.json()).catch(() => ({ charts: [] }))
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
    setTitleEdit(c.title || ''); setCountryEdit(c.country || '')
    // Mobile (stack): nuscrollinam į detalę po sąrašu. Desktop (two-pane) — nereikia.
    setTimeout(() => {
      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 60)
  }

  const saveMeta = async () => {
    if (!selected) return
    setSavingMeta(true)
    await fetch(`/api/admin/charts/${selected.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: titleEdit.trim() || selected.title, country: countryEdit.trim() || null }),
    }).catch(() => null)
    setSavingMeta(false)
    setSelected(s => s ? { ...s, title: titleEdit.trim() || s.title, country: countryEdit.trim() || null } : s)
    setCharts(cs => cs.map(c => c.id === selected.id
      ? { ...c, title: titleEdit.trim() || c.title, country: countryEdit.trim() || null } : c))
  }

  const autoMatch = async () => {
    if (!selected) return
    setResolving(true)
    const r = await fetch(`/api/admin/charts/${selected.id}/resolve`, { method: 'POST' }).then(r => r.json()).catch(() => null)
    setResolving(false)
    if (r) { await loadEntries(selected.id); await loadCharts() }
    if (r?.matched != null) alert(`Automatiškai susieta: ${r.matched} iš ${r.processed} neapdorotų.`)
  }

  // „Sukurti likusius" — bulk; po jo pilnas reload (daug įrašų keičiasi).
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

  /* In-place vieno įrašo update — be /entries reload'o. Perskaičiuoja counts
   * (selected header + sąrašo eilutė) lokaliai pagal būsenos pokytį. */
  const updateEntry = useCallback((entryId: number, patch: Partial<Entry>) => {
    const old = entriesRef.current.find(e => e.id === entryId)
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, ...patch } : e))
    if (old && patch.resolveState && patch.resolveState !== old.resolveState) {
      const fb = bucketOf(old.resolveState)
      const tb = bucketOf(patch.resolveState)
      if (fb !== tb) {
        const bump = (c: Counts): Counts => {
          const next = { ...c }
          next[fb] = Math.max(0, next[fb] - 1)
          next[tb] = next[tb] + 1
          return next
        }
        setSelected(s => s && s.counts ? { ...s, counts: bump(s.counts) } : s)
        const sid = selectedIdRef.current
        setCharts(cs => cs.map(c => c.id === sid && c.counts ? { ...c, counts: bump(c.counts) } : c))
      }
    }
  }, [])

  // „Tik laukiantys" = viskas, kas dar nesusieta (pending/ambiguous/text_only).
  const visibleEntries = filter === 'unresolved'
    ? entries.filter(e => e.resolveState !== 'matched' && e.resolveState !== 'created')
    : entries

  const consensusCharts = charts.filter(c => c.source === 'consensus')
  const sourceCharts = charts.filter(c => c.source !== 'consensus')

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Topų valdymas</h1>
          <p className="mt-1 text-sm text-gray-500">
            Nuscrape'inti išoriniai topai. Susiek dainas su katalogu arba sukurk naujas.
            Konsensuso (agreguoti) topai — viršuje.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a href="/admin/charts/missing" className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100">Trūkstamos dainos →</a>
          <a href="/admin/topai" className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100">Topų vizualai →</a>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400">Kraunama…</div>
      ) : charts.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          Topų dar nėra. Paleisk <code className="rounded bg-gray-100 px-1.5 py-0.5">scraper/charts/ingest.py</code> arba scheduled task'ą.
        </div>
      ) : (
        /* Two-pane: kairė = sąrašas (lg sticky), dešinė = detalė. Mobile = stack. */
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(300px,360px)_1fr] lg:gap-6">
          {/* ─── Kairė: topų sąrašas ─── */}
          <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1">
            {consensusCharts.length > 0 && (
              <ChartGroup label="Konsensusas" charts={consensusCharts} selectedId={selected?.id ?? null} onOpen={openChart} accentBadge />
            )}
            <ChartGroup label={consensusCharts.length > 0 ? 'Šaltiniai' : ''} charts={sourceCharts} selectedId={selected?.id ?? null} onOpen={openChart} />
          </div>

          {/* ─── Dešinė: detalė ─── */}
          <div ref={detailRef} className="scroll-mt-4">
            {!selected ? (
              <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white/60 p-8 text-center text-sm text-gray-400">
                Pasirink topą iš sąrašo kairėje.
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-bold text-gray-900">{selected.title}</h2>
                    <p className="text-[11px] text-gray-400">{selected.attribution} · {selected.period_label}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-400">
                      <span className="inline-flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        Atnaujinta {relDate(selected.fetched_at)}
                      </span>
                      <span className="text-gray-300">·</span>
                      <span>Kitas tikrinimas {nextCheckLabel()}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
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

                {/* Pavadinimas + vėliavos šalis (vizualus header — /admin/topai) */}
                <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50/60 px-4 py-2.5">
                  <span className="text-[11px] font-semibold text-gray-500">Pavadinimas</span>
                  <input
                    value={titleEdit} onChange={e => setTitleEdit(e.target.value)}
                    className="min-w-[180px] flex-1 rounded-md border border-gray-200 px-2.5 py-1 text-sm outline-none focus:border-violet-400"
                  />
                  <span className="text-[11px] font-semibold text-gray-500">Vėliava</span>
                  <select value={countryEdit} onChange={e => setCountryEdit(e.target.value)}
                    className="rounded-md border border-gray-200 px-2 py-1 text-xs outline-none focus:border-violet-400">
                    <option value="">— nėra —</option>
                    <option value="LT">🇱🇹 Lietuva</option>
                    <option value="US">🇺🇸 JAV</option>
                    <option value="GB">🇬🇧 UK</option>
                  </select>
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
                      <EntryRow key={e.id} entry={e} isAlbum={selected.chart_key === 'albums'} onUpdate={updateEntry} />
                    ))}
                    {visibleEntries.length === 0 && <div className="p-6 text-center text-sm text-gray-400">Nėra įrašų šiame filtre.</div>}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ───────────────────────────── Topų sąrašo grupė ───────────────────────────── */
function ChartGroup({ label, charts, selectedId, onOpen, accentBadge }: {
  label: string; charts: Chart[]; selectedId: number | null; onOpen: (c: Chart) => void; accentBadge?: boolean
}) {
  if (charts.length === 0) return null
  return (
    <div className="mb-3">
      {label && <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {charts.map(c => {
          const ct = c.counts || { total: 0, matched: 0, created: 0, text_only: 0, pending: 0 }
          const resolved = ct.matched + ct.created
          const pct = ct.total ? Math.round((resolved / ct.total) * 100) : 0
          const isSel = selectedId === c.id
          return (
            <button key={c.id} onClick={() => onOpen(c)}
              className={`flex w-full items-center gap-2 border-b border-gray-100 px-3 py-2 text-left last:border-b-0 transition-colors ${isSel ? 'bg-violet-50' : 'hover:bg-gray-50'}`}>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.accent }} />
              {accentBadge
                ? <span className="shrink-0 rounded bg-violet-100 px-1 text-[9px] font-bold text-violet-600">Σ</span>
                : <span className="w-12 shrink-0 truncate text-[9px] font-bold uppercase tracking-wide text-gray-400">{SCOPE_LT[c.scope] || c.scope}</span>}
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800">{c.title}</span>
              <span className="hidden h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-gray-100 sm:block">
                <span className="block h-full rounded-full bg-emerald-400" style={{ width: `${pct}%` }} />
              </span>
              <span className="shrink-0 text-[11px] tabular-nums text-gray-500">{resolved}/{ct.total}</span>
              {ct.pending > 0 && <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">{ct.pending}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ── Vieno atlikėjo „chip" nesusietam įrašui: yra → vardas + check + ikonos; nėra → „Sukurti" ── */
function ArtistChip({ artist, prefix, onCreate, busy }: {
  artist: ArtistStatus; prefix?: string; onCreate: () => void; busy: boolean
}) {
  if (artist.exists && artist.id) {
    return (
      <span className="inline-flex items-center gap-1">
        {prefix && <span className="text-gray-300">{prefix}</span>}
        <IconCheck className="h-3.5 w-3.5 text-emerald-500" />
        <span className="font-medium text-gray-700">{artist.name}</span>
        <IconLink href={`/admin/artists/${artist.id}`} title="Redaguoti atlikėją"><IconEdit /></IconLink>
        {artist.slug && <IconLink href={`/atlikejai/${artist.slug}`} title="Vieša atlikėjo nuoroda"><IconExternal /></IconLink>}
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
function EntryRow({ entry, isAlbum, onUpdate }: { entry: Entry; isAlbum: boolean; onUpdate: (id: number, patch: Partial<Entry>) => void }) {
  const [busy, setBusy] = useState(false)
  const resolved = entry.resolveState === 'matched' || entry.resolveState === 'created'
  const primary = entry.primaryArtist
  const featuring = entry.featuringArtists || []

  // Susieto entiteto admin nuoroda (daina → /admin/tracks/[id], albumas → /admin/albums/[id]).
  const adminEntityHref = entry.track ? `/admin/${isAlbum ? 'albums' : 'tracks'}/${entry.track.id}` : null

  const act = async (action: string, extra?: any) => {
    setBusy(true)
    const res = await fetch('/api/admin/charts/entry', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryId: entry.id, action, ...extra }),
    }).then(r => r.json()).catch(() => null)
    setBusy(false)
    if (!res || res.error) { if (res?.error) alert(res.error); return }

    if (action === 'link' || action === 'create') {
      onUpdate(entry.id, { resolveState: res.resolveState || 'matched', track: res.track || entry.track })
    } else if (action === 'create-artist') {
      const a = res.artist
      if (!a) return
      const targetName = norm(typeof extra?.artistName === 'string' ? extra.artistName : a.name)
      if (res.isPrimary && primary) {
        onUpdate(entry.id, { primaryArtist: { name: primary.name, exists: true, id: a.id, slug: a.slug } })
      } else {
        onUpdate(entry.id, {
          featuringArtists: featuring.map(f => norm(f.name) === targetName ? { ...f, exists: true, id: a.id, slug: a.slug } : f),
        })
      }
    } else if (action === 'unlink') {
      onUpdate(entry.id, { resolveState: 'pending', track: null })
    }
  }

  /* ── Susietas: žalias check + viešas pavadinimas + edit/public ikonos ── */
  if (resolved) {
    const t = entry.track
    return (
      <div className="px-3 py-2.5 sm:px-4">
        <div className="flex items-start gap-2.5 sm:gap-3">
          <span className="w-6 shrink-0 pt-0.5 text-center text-sm font-black tabular-nums text-gray-400 sm:w-7">{entry.position}</span>
          <div className="min-w-0 flex-1">
            {/* Daina / albumas */}
            <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold leading-snug text-gray-800">
              <IconCheck className="text-emerald-500" />
              {t?.href
                ? <a href={t.href} target="_blank" rel="noreferrer" className="text-gray-800 hover:text-violet-700 hover:underline">{t.title || entry.title}</a>
                : <span>{t?.title || entry.title}</span>}
              {adminEntityHref && <IconLink href={adminEntityHref} title={isAlbum ? 'Redaguoti albumą' : 'Redaguoti dainą'}><IconEdit /></IconLink>}
              {t?.href && <IconLink href={t.href} title="Vieša nuoroda"><IconExternal /></IconLink>}
            </p>
            {/* Atlikėjas */}
            {t?.artist && (
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                <IconCheck className="h-3.5 w-3.5 text-emerald-500" />
                {t.artistSlug
                  ? <a href={`/atlikejai/${t.artistSlug}`} target="_blank" rel="noreferrer" className="font-medium text-gray-600 hover:text-violet-700 hover:underline">{t.artist}</a>
                  : <span className="font-medium text-gray-600">{t.artist}</span>}
                {t.artistId && <IconLink href={`/admin/artists/${t.artistId}`} title="Redaguoti atlikėją"><IconEdit /></IconLink>}
                {t.artistSlug && <IconLink href={`/atlikejai/${t.artistSlug}`} title="Vieša atlikėjo nuoroda"><IconExternal /></IconLink>}
              </p>
            )}
          </div>
          <button onClick={() => act('unlink')} disabled={busy}
            className="mt-0.5 shrink-0 rounded px-2 py-1 text-[11px] font-medium text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50">Atrišti</button>
        </div>
      </div>
    )
  }

  /* ── Nesusietas (pending/ambiguous/text_only): paieška visada atvira ── */
  return (
    <div className="px-3 py-2.5 sm:px-4">
      <div className="flex items-start gap-2.5 sm:gap-3">
        <span className="w-6 shrink-0 pt-0.5 text-center text-sm font-black tabular-nums text-gray-400 sm:w-7">{entry.position}</span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold leading-snug text-gray-800">
            <span>{entry.title}</span>
            <button onClick={() => act('create')} disabled={busy}
              title="Sukurti dainą IR atlikėją (pilnas praturtinimas: YouTube, žodžiai, Spotify)"
              className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 hover:bg-blue-100 disabled:opacity-50">
              + Sukurti {isAlbum ? 'albumą' : 'dainą'}
            </button>
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-gray-400">
            {primary
              ? <ArtistChip artist={primary} onCreate={() => act('create-artist', { artistName: primary.name, isPrimary: true })} busy={busy} />
              : <span>{entry.artistName}</span>}
            {featuring.map((f, i) => (
              <ArtistChip key={i} artist={f} prefix={i === 0 ? 'feat.' : '·'}
                onCreate={() => act('create-artist', { artistName: f.name, isPrimary: false })} busy={busy} />
            ))}
          </p>
        </div>
      </div>

      {/* Paieška visada atvira — ieško TIK pavadinimo (be „(w/ X)" priesagos), naujausi pirma */}
      <LinkSearch isAlbum={isAlbum} defaultQuery={stripFeat(entry.title)} busy={busy}
        onPick={(h) => act('link', isAlbum ? { albumId: h.id } : { trackId: h.id })} />
    </div>
  )
}

/* ───────────────────────────── Inline search picker ───────────────────────────── */
function LinkSearch({ defaultQuery, isAlbum, onPick, busy }: { defaultQuery: string; isAlbum: boolean; onPick: (h: Hit) => void; busy: boolean }) {
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
      // recent=1 → naujausiai pridėti pirma (žmogus dažnai linkina ką tik sukurtą).
      const r = await fetch(`/api/search-entities?recent=1&q=${encodeURIComponent(query)}`).then(r => r.json()).catch(() => ({ results: [] }))
      setHits((r.results || []).filter((h: Hit) => h.type === wantType).slice(0, 8))
      setLoading(false)
    }, 250)
  }, [wantType])

  useEffect(() => { setQ(defaultQuery); run(defaultQuery) }, [defaultQuery, run])

  return (
    <div className="ml-8 mt-2 rounded-lg border border-gray-200 bg-gray-50 p-2 sm:ml-10">
      <input
        value={q}
        onChange={e => { setQ(e.target.value); run(e.target.value) }}
        placeholder={isAlbum ? 'Ieškoti albumo pagal pavadinimą…' : 'Ieškoti dainos pagal pavadinimą…'}
        className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:border-violet-400"
      />
      <div className="mt-1.5 max-h-56 overflow-y-auto">
        {loading && <p className="px-2 py-1.5 text-xs text-gray-400">Ieškoma…</p>}
        {!loading && hits.length === 0 && <p className="px-2 py-1.5 text-xs text-gray-400">Nieko nerasta. Naudok „Sukurti".</p>}
        {hits.map(h => (
          <button key={h.id} onClick={() => onPick(h)} disabled={busy}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white disabled:opacity-50">
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
