'use client'

/**
 * Admin Import — grupių migracijos valdymo centras.
 *
 * Funkcijos:
 *  - Atlikėjų sąrašas iš v_artist_import_status (legacy_id, name, wiki/scrape status, counts)
 *  - Filtrai: status, search
 *  - Checkbox'ai → bulk "Run Wiki" arba "Run Scrape"
 *  - Per-row mygtukai: Run Wiki / Run Scrape / View Diff
 *  - Stats cards (pending / running / wiki_done / scrape_done)
 *  - Auto-refresh kas 10s kai yra aktyvių job'ų
 *
 * Worker flow:
 *  1. Admin pažymi 5 atlikėjus, spaudžia "Run Wiki"
 *  2. POST /api/admin/import/jobs → insert'ina 5 pending jobs
 *  3. Python worker ant Mac'o (wiki_worker.py) poliuoja import_jobs
 *     table per service role, paima pending, runs wiki_import, update'ina status + report
 *  4. UI polling pastebi statuso pasikeitimą ir atsinaujina
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type ArtistStatus = {
  id: number
  legacy_id: number
  slug: string
  name: string
  cover_image_url?: string | null
  score?: number | null

  wiki_completed_at: string | null
  wiki_last_status: string | null
  scrape_completed_at: string | null
  scrape_last_status: string | null
  active_jobs: number
  album_count: number
  track_count: number
}

type Stats = {
  total_artists: number
  wiki_done: number
  scrape_done: number
  both_done: number
  pending_jobs: number
  running_jobs: number
  failed_jobs: number
  albums_total: number
  tracks_total: number
  completed_last_24h: number
}

type StatusFilter = 'all' | 'pending' | 'wiki_done' | 'scrape_done' | 'both_done' | 'running' | 'failed'
type SortKey = 'legacy_id' | 'name' | 'score' | 'last_activity'

export default function AdminImportPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [artists, setArtists] = useState<ArtistStatus[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<Stats | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sort, setSort] = useState<SortKey>('legacy_id')
  const [page, setPage] = useState(1)
  const [limit] = useState(100)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [actionLoading, setActionLoading] = useState(false)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  const loadStats = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/import/stats')
      if (r.ok) setStats(await r.json())
    } catch {}
  }, [])

  const loadArtists = useCallback(async (q: string, st: StatusFilter, so: SortKey, p: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        search: q, status: st, sort: so,
        page: String(p), limit: String(limit),
      })
      const r = await fetch(`/api/admin/import/artists?${params}`)
      const data = await r.json()
      setArtists(data.artists || [])
      setTotal(data.total || 0)
    } finally {
      setLoading(false)
    }
  }, [limit])

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/auth/signin'); return }
    if (status === 'authenticated' && !isAdmin) { router.push('/'); return }
    if (status === 'authenticated') {
      loadStats()
      loadArtists('', 'all', 'legacy_id', 1)
    }
  }, [status, isAdmin, router, loadStats, loadArtists])

  // Auto-refresh kai yra aktyvių job'ų — kas 10s
  useEffect(() => {
    if (!isAdmin) return
    const hasActive = (stats?.running_jobs || 0) + (stats?.pending_jobs || 0) > 0
    if (!hasActive) return
    const iv = setInterval(() => {
      loadStats()
      loadArtists(search, statusFilter, sort, page)
    }, 10000)
    return () => clearInterval(iv)
  }, [isAdmin, stats, search, statusFilter, sort, page, loadStats, loadArtists])

  const handleSearch = (value: string) => {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setPage(1)
      loadArtists(value, statusFilter, sort, 1)
    }, 400)
  }

  const handleFilter = (st: StatusFilter) => {
    setStatusFilter(st)
    setPage(1)
    loadArtists(search, st, sort, 1)
  }

  const handleSort = (so: SortKey) => {
    setSort(so)
    loadArtists(search, statusFilter, so, page)
  }

  const toggleSelect = (legacyId: number) => {
    const next = new Set(selected)
    if (next.has(legacyId)) next.delete(legacyId)
    else next.add(legacyId)
    setSelected(next)
  }

  const selectAllVisible = () => {
    if (selected.size === artists.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(artists.map(a => a.legacy_id)))
    }
  }

  const triggerScoreRecalc = async () => {
    if (!confirm('Pažymėti VISUS atlikėjus score recalc\'ui? Cron periodiškai perskaičiuos.')) return
    setActionLoading(true); setActionMsg(null)
    try {
      const r = await fetch('/api/admin/internal/score-recalc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
      const data = await r.json()
      setActionMsg(data.ok ? `${data.message} (${data.stale_count} stale)` : `Klaida: ${data.error}`)
    } catch (e: any) {
      setActionMsg(`Klaida: ${e?.message || e}`)
    } finally {
      setActionLoading(false)
    }
  }

  const runJob = async (jobType: 'wiki' | 'scrape', legacyIds: number[]) => {
    setActionLoading(true)
    setActionMsg(null)
    try {
      const r = await fetch('/api/admin/import/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ legacy_ids: legacyIds, job_type: jobType }),
      })
      const data = await r.json()
      if (!r.ok) {
        setActionMsg(`Klaida: ${data.error || r.status}`)
      } else {
        const label = jobType === 'wiki' ? 'Wiki' : 'Scrape'
        setActionMsg(`${label}: sukurti ${data.created}, praleisti ${data.skipped} (jau aktyvūs)`)
        setSelected(new Set())
        setTimeout(() => { loadStats(); loadArtists(search, statusFilter, sort, page) }, 500)
      }
    } finally {
      setActionLoading(false)
    }
  }

  if (status === 'loading' || !isAdmin) return null

  const pageCount = Math.ceil(total / limit)
  const selectedArr = Array.from(selected)

  return (
    <div className="min-h-screen bg-[var(--bg-elevated)]">
      <div className="w-full px-4 sm:px-6 py-4 sm:py-6 max-w-[1600px] mx-auto">

        {/* Compact header — mobile-friendly */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Link href="/admin" className="text-music-blue hover:underline shrink-0">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-current stroke-2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
              </Link>
              <h1 className="text-lg sm:text-2xl font-bold text-[var(--text-primary)] truncate">Migracijos valdymas</h1>
              <HelpToggle />
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Link
              href="/admin/import/forum"
              className="px-2 py-1.5 text-xs bg-blue-50 text-blue-700 rounded-lg border border-blue-200 hover:bg-blue-100"
              title="Forumų thread'ų migracija"
            >
              💬
            </Link>
            <button
              onClick={triggerScoreRecalc}
              disabled={actionLoading}
              className="px-2 py-1.5 text-xs bg-amber-50 text-amber-700 rounded-lg border border-amber-200 hover:bg-amber-100 disabled:opacity-50"
              title="Pažymi visus atlikėjus stale → Vercel cron periodiškai perskaičiuoja kas naktį"
            >
              🎯
            </button>
          </div>
        </div>

        {/* Stats cards — kompaktiški, 3 svarbiausi metric'ai. Tiksli formuluotė:
            Importuoti = real DB state'as (album_count > 0 — atlikėjas turi
            content'o), nepriklausomai ar tai per job queue ar import_artist.py.
            "Aktyvu dabar" = pending + running job queue (CLI imports šito nekelia). */}
        {stats && (
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
            <StatCard label="Iš viso" value={stats.total_artists} />
            <StatCard label="Importuoti" value={stats.both_done} sub={`${pct(stats.both_done, stats.total_artists)}%`} />
            <StatCard label="Aktyvūs job'ai" value={stats.running_jobs + stats.pending_jobs}
              sub={(stats.running_jobs > 0 || stats.pending_jobs > 0) ? `${stats.running_jobs}▶ ${stats.pending_jobs}⏳` : '—'}
              highlight={stats.running_jobs > 0} />
          </div>
        )}

        {/* Filters + search */}
        <div className="bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-xl p-4 mb-4">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <input
              type="search"
              placeholder="Paieška: vardas arba legacy_id..."
              value={search}
              onChange={e => handleSearch(e.target.value)}
              className="flex-1 min-w-[200px] px-3 py-2 border border-[var(--input-border)] bg-[var(--bg-elevated)] rounded-lg text-sm text-[var(--text-primary)]"
            />
            <select
              value={sort}
              onChange={e => handleSort(e.target.value as SortKey)}
              className="px-3 py-2 border border-[var(--input-border)] bg-[var(--bg-elevated)] rounded-lg text-sm text-[var(--text-primary)]"
            >
              <option value="legacy_id">ID ↑</option>
              <option value="name">Vardas A–Ž</option>
              <option value="score">Populiarumas ↓</option>
              <option value="last_activity">Paskutinis scrape ↓</option>
            </select>
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            <FilterChip current={statusFilter} value="all" onClick={handleFilter}>Visi</FilterChip>
            <FilterChip current={statusFilter} value="pending" onClick={handleFilter}>Neliesti</FilterChip>
            <FilterChip current={statusFilter} value="wiki_done" onClick={handleFilter}>Tik Wiki</FilterChip>
            <FilterChip current={statusFilter} value="scrape_done" onClick={handleFilter}>Tik Scrape</FilterChip>
            <FilterChip current={statusFilter} value="both_done" onClick={handleFilter}>Abu ✓</FilterChip>
            <FilterChip current={statusFilter} value="running" onClick={handleFilter}>Vyksta</FilterChip>
            <FilterChip current={statusFilter} value="failed" onClick={handleFilter}>Klaidos</FilterChip>
          </div>

          {/* Bulk actions */}
          {selected.size > 0 && (
            <div className="flex items-center gap-3 p-3 bg-[var(--hover-blue)] rounded-lg">
              <span className="text-sm font-semibold text-[var(--text-primary)]">
                Pasirinkta: {selected.size}
              </span>
              <button
                onClick={() => runJob('wiki', selectedArr)}
                disabled={actionLoading}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                📘 Paleisti Wiki import ({selected.size})
              </button>
              <button
                onClick={() => runJob('scrape', selectedArr)}
                disabled={actionLoading}
                className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                🌐 Paleisti music.lt scrape ({selected.size})
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="ml-auto text-xs text-[var(--text-muted)] hover:underline"
              >
                Nuimti žymes
              </button>
            </div>
          )}

          {actionMsg && (
            <div className="mt-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
              {actionMsg}
            </div>
          )}
        </div>

        {/* Table */}
        <div className="bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg-elevated)] text-xs uppercase text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2 text-left">
                    <input type="checkbox"
                      checked={artists.length > 0 && selected.size === artists.length}
                      onChange={selectAllVisible}
                    />
                  </th>
                  <th className="px-3 py-2 text-left">ID</th>
                  <th className="px-3 py-2 text-left">Atlikėjas</th>
                  <th className="px-3 py-2 text-center">Wiki</th>
                  <th className="px-3 py-2 text-center">Scrape</th>
                  <th className="px-3 py-2 text-right">Albumai</th>
                  <th className="px-3 py-2 text-right">Dainos</th>
                  <th className="px-3 py-2 text-right">Veiksmai</th>
                </tr>
              </thead>
              <tbody>
                {loading && artists.length === 0 && (
                  <tr><td colSpan={8} className="p-8 text-center text-[var(--text-muted)]">Kraunama...</td></tr>
                )}
                {!loading && artists.length === 0 && (
                  <tr><td colSpan={8} className="p-8 text-center text-[var(--text-muted)]">Nėra rezultatų</td></tr>
                )}
                {artists.map(a => (
                  <tr key={a.legacy_id} className="border-t border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]">
                    <td className="px-3 py-2">
                      <input type="checkbox"
                        checked={selected.has(a.legacy_id)}
                        onChange={() => toggleSelect(a.legacy_id)}
                      />
                    </td>
                    <td className="px-3 py-2 text-[var(--text-muted)] font-mono text-xs">{a.legacy_id}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {a.cover_image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.cover_image_url} alt="" className="w-7 h-7 rounded object-cover" />
                        ) : (
                          <div className="w-7 h-7 rounded bg-[var(--bg-elevated)] flex items-center justify-center text-xs">
                            {a.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <Link href={`/admin/import/${a.legacy_id}`} className="font-semibold text-[var(--text-primary)] hover:underline">
                          {a.name}
                        </Link>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <StatusBadge completedAt={a.wiki_completed_at} lastStatus={a.wiki_last_status} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <StatusBadge completedAt={a.scrape_completed_at} lastStatus={a.scrape_last_status} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{a.album_count}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{a.track_count}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          onClick={() => runJob('wiki', [a.legacy_id])}
                          disabled={actionLoading || a.active_jobs > 0}
                          className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100 disabled:opacity-40"
                          title="Wiki import"
                        >📘</button>
                        <button
                          onClick={() => runJob('scrape', [a.legacy_id])}
                          disabled={actionLoading || a.active_jobs > 0}
                          className="px-2 py-1 text-xs bg-purple-50 text-purple-700 rounded hover:bg-purple-100 disabled:opacity-40"
                          title="music.lt scrape"
                        >🌐</button>
                        <Link
                          href={`/admin/import/${a.legacy_id}`}
                          className="px-2 py-1 text-xs bg-gray-50 text-gray-700 rounded hover:bg-gray-100"
                          title="Detalės / diff"
                        >🔍</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pageCount > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-subtle)]">
              <span className="text-xs text-[var(--text-muted)]">
                {(page - 1) * limit + 1}–{Math.min(page * limit, total)} iš {total}
              </span>
              <div className="flex gap-1">
                <button
                  disabled={page <= 1}
                  onClick={() => { const p = page - 1; setPage(p); loadArtists(search, statusFilter, sort, p) }}
                  className="px-3 py-1 text-xs bg-[var(--bg-elevated)] rounded disabled:opacity-40"
                >← Ankstesnis</button>
                <span className="px-3 py-1 text-xs">{page} / {pageCount}</span>
                <button
                  disabled={page >= pageCount}
                  onClick={() => { const p = page + 1; setPage(p); loadArtists(search, statusFilter, sort, p) }}
                  className="px-3 py-1 text-xs bg-[var(--bg-elevated)] rounded disabled:opacity-40"
                >Kitas →</button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 p-4 bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-xl text-sm text-[var(--text-muted)]">
          <strong className="text-[var(--text-primary)]">Kaip paleisti:</strong> po „Run Wiki" arba „Run Scrape" mygtuko
          jobai atsiranda queue'je. Ant Mac'o paleisk{' '}
          <code className="px-1 py-0.5 bg-[var(--bg-elevated)] rounded text-xs">bash scraper/run_worker.sh wiki</code> arba
          <code className="ml-1 px-1 py-0.5 bg-[var(--bg-elevated)] rounded text-xs">bash scraper/run_worker.sh scrape</code> —
          Python worker'is poliuoja šią lentelę ir vykdo. UI kas 10s atsinaujina.
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** HelpToggle — ⓘ ikonėlė kuri rodo modal'ą su pilnu paaiškinimu apie
 *  migracijos workflow. Anksčiau visas help text'as buvo permanently rodomas
 *  page'o viršuje (užimdavo daug vietos mobile'e). */
function HelpToggle() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="shrink-0 w-6 h-6 rounded-full bg-[var(--bg-elevated)] border border-[var(--input-border)] flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-colors"
        title="Apie migracijos workflow'ą">
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
        </svg>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setOpen(false)}>
          <div className="bg-[var(--bg-surface)] rounded-t-2xl sm:rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] px-4 py-3 flex items-center justify-between">
              <h2 className="font-bold text-[var(--text-primary)]">Migracijos workflow</h2>
              <button onClick={() => setOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">✕</button>
            </div>
            <div className="p-4 space-y-4 text-sm text-[var(--text-secondary)]">
              <section>
                <h3 className="font-semibold text-[var(--text-primary)] mb-1.5">Stats reikšmės</h3>
                <ul className="space-y-1 text-[12.5px]">
                  <li><strong>Iš viso</strong> — visi atlikėjai DB'oje (12k+ iš legacy)</li>
                  <li><strong>Importuoti</strong> — turintys wiki + scrape (real DB content). Galima per UI flow (Įkelti Wiki info / Music.lt scrape) arba per CLI (<code>import_artist.py</code>)</li>
                  <li><strong>Aktyvūs job'ai</strong> — job queue (vyksta / eilėje) — kuria iš UI „Paleisti Wiki/Scrape" mygtukai</li>
                </ul>
              </section>
              <section>
                <h3 className="font-semibold text-[var(--text-primary)] mb-1.5">Du importo būdai</h3>
                <ol className="space-y-1.5 text-[12.5px] list-decimal pl-4">
                  <li><strong>Per artist page UI</strong> — atidaryk atlikėjo admin → „Įkelti Wiki info" arba „Music.lt scrape" (komanda terminale). Geriausia kasdieniam atlikėjui.</li>
                  <li><strong>Per šitą page (bulk)</strong> — pažymėk N atlikėjų → „Paleisti Wiki / Scrape" → sukuria job queue. Mac worker'is poliuoja queue ir vykdo background'e.</li>
                </ol>
              </section>
              <section>
                <h3 className="font-semibold text-[var(--text-primary)] mb-1.5">Worker'is ant Mac'o</h3>
                <p className="text-[12.5px] mb-2">Reikia paleisti, kad apdorotų eilėje esančius jobs. Vienas worker'is nuolat (background):</p>
                <div className="rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-2.5 font-mono text-[11px] text-[var(--text-primary)] whitespace-pre-wrap break-all">
                  {`cd "/Users/edvardas_s/Documents/Claude/Projects/Music.lt rebuild" && \\\nbash scraper/run_worker.sh wiki`}
                </div>
                <p className="text-[11.5px] text-[var(--text-muted)] mt-2">
                  Atskirai scrape jobs: <code>bash scraper/run_worker.sh scrape</code>. Worker'is dirbs tol kol pasakai Ctrl+C.
                </p>
              </section>
              <section>
                <h3 className="font-semibold text-[var(--text-primary)] mb-1.5">Single atlikėjui — viskas vienu metu</h3>
                <p className="text-[12.5px] mb-2">Greičiausia kelti naują atlikėją (scrape + news + events + lyrics + YT enrich):</p>
                <div className="rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-2.5 font-mono text-[11px] text-[var(--text-primary)] whitespace-pre-wrap break-all">
                  {`python3 scraper/import_artist.py <artist_id>`}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function StatCard({ label, value, sub, highlight }: { label: string; value: number; sub?: string; highlight?: boolean }) {
  return (
    <div className={`bg-[var(--bg-surface)] border rounded-xl p-3 ${highlight ? 'border-orange-400' : 'border-[var(--input-border)]'}`}>
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${highlight ? 'text-orange-600' : 'text-[var(--text-primary)]'}`}>
        {value.toLocaleString('lt')}
      </div>
      {sub && <div className="text-[10px] text-[var(--text-muted)]">{sub}</div>}
    </div>
  )
}

function FilterChip({ current, value, onClick, children }: {
  current: StatusFilter; value: StatusFilter; onClick: (v: StatusFilter) => void; children: React.ReactNode
}) {
  const active = current === value
  return (
    <button
      onClick={() => onClick(value)}
      className={`px-3 py-1 text-xs rounded-full border transition-colors ${
        active
          ? 'bg-music-blue text-white border-music-blue'
          : 'bg-[var(--bg-elevated)] border-[var(--input-border)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
      }`}
    >
      {children}
    </button>
  )
}

function StatusBadge({ completedAt, lastStatus }: { completedAt: string | null; lastStatus: string | null }) {
  if (lastStatus === 'running') {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-blue-100 text-blue-700">
      <span className="animate-pulse">●</span> vyksta
    </span>
  }
  if (lastStatus === 'pending') {
    return <span className="px-2 py-0.5 text-[10px] rounded-full bg-yellow-100 text-yellow-700">eile</span>
  }
  if (lastStatus === 'failed') {
    return <span className="px-2 py-0.5 text-[10px] rounded-full bg-red-100 text-red-700">klaida</span>
  }
  if (completedAt) {
    const d = new Date(completedAt)
    const ago = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
    return <span className="px-2 py-0.5 text-[10px] rounded-full bg-green-100 text-green-700" title={d.toISOString()}>
      ✓ {ago < 1 ? 'šiandien' : `prieš ${ago}d`}
    </span>
  }
  return <span className="px-2 py-0.5 text-[10px] rounded-full bg-gray-100 text-gray-500">—</span>
}

function pct(n: number, total: number): string {
  if (!total) return '0'
  return ((n / total) * 100).toFixed(1)
}
