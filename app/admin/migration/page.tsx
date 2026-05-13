'use client'
// Pilnas migracijos progresas — atskiras puslapis nuo /admin homepage'o.
// Homepage'e tik kompaktiška kortelė + link čia.
//
// UI:
//   • 4 progress bar'ai (Iš viso / LT / INTL / Be šalies) — clickable į
//     bucket filter'į
//   • Bucket tab'ai: All / LT / INTL / Be šalies
//   • Status tab'ai: Pending (default) / Done / Visi
//   • Stats coverage warning kai legacy_likes nepripildyti
//   • Atlikėjų sąrašas su pagination, sortintas pagal legacy_likes desc;
//     dup'ai grupuoti pagal lower(name) — vienas rep + (Nx) badge'as
//   • Click row → /admin/artists/[id]
import { useEffect, useState, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

type Bucket = 'all' | 'lt' | 'intl' | 'unknown'
type StatusFilter = 'pending' | 'done' | 'all'

type Row = {
  id: number
  name: string | null
  slug: string | null
  country: string | null
  kind: 'lt' | 'intl' | 'unknown'
  legacy_likes: number | null
  legacy_comments: number | null
  legacy_discussion_count: number | null
  legacy_news_count: number | null
  missing: ('scrape' | 'wiki')[]
  track_count: number
  album_count: number
  scrape_done: boolean
  wiki_done: boolean
  legacy_stats_at: string | null
  dup_count: number
}

type StatsResponse = {
  summary: {
    total: number
    duplicates: { unique_groups: number; total_rows: number }
    lt: { total: number; done: number; pending: number; pct: number }
    intl: { total: number; done: number; pending: number; pct: number }
    unknown: { total: number; done: number; pending: number; pct: number }
    stats_coverage: { covered: number; missing: number; pct: number }
  }
  query: { bucket: Bucket; status: StatusFilter; limit: number; offset: number; total: number }
  rows: Row[]
}

const PAGE_SIZE = 50

function ProgressBar({ pct, label, doneN, totalN, color, active, onClick }: {
  pct: number; label: string; doneN: number; totalN: number; color: string;
  active: boolean; onClick: () => void
}) {
  const safePct = Math.max(0, Math.min(100, pct))
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border p-3 text-left transition-all ${
        active
          ? 'border-music-blue bg-blue-50 ring-2 ring-music-blue'
          : 'border-[var(--input-border)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)]'
      }`}
    >
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[11.5px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
          {label}
        </span>
        <span className="text-[11px] tabular-nums text-[var(--text-muted)]">
          {doneN.toLocaleString('lt-LT')} / {totalN.toLocaleString('lt-LT')}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-elevated)]">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${safePct}%` }} />
      </div>
      <div className="mt-1 text-right text-[10.5px] font-semibold tabular-nums text-[var(--text-secondary)]">
        {safePct.toFixed(1)}%
      </div>
    </button>
  )
}

function MissingBadges({ row }: { row: Row }) {
  const kindLabel = row.kind === 'lt' ? 'LT' : row.kind === 'intl' ? 'INTL' : '?'
  const kindColor = row.kind === 'lt'
    ? 'bg-yellow-100 text-yellow-800'
    : row.kind === 'intl'
      ? 'bg-emerald-100 text-emerald-800'
      : 'bg-gray-200 text-gray-700'
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${kindColor}`}>
        {kindLabel}
      </span>
      {row.missing.map(m => (
        <span
          key={m}
          className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
            m === 'wiki' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
          }`}
        >
          –{m}
        </span>
      ))}
      {row.scrape_done && row.wiki_done && (
        <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-green-700">
          ✓
        </span>
      )}
    </span>
  )
}

function AdminMigrationContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const sp = useSearchParams()

  const [data, setData] = useState<StatsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloading, setReloading] = useState(false)

  const bucket = (sp.get('bucket') as Bucket) || 'all'
  const statusFilter = (sp.get('status') as StatusFilter) || 'pending'
  const offset = Math.max(0, Number(sp.get('offset') || 0))

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  useEffect(() => { if (status === 'unauthenticated') router.push('/') }, [status])

  async function load() {
    setReloading(true)
    try {
      const params = new URLSearchParams({
        bucket, status: statusFilter,
        limit: String(PAGE_SIZE), offset: String(offset),
      })
      const r = await fetch(`/api/admin/migration/stats?${params}`)
      if (!r.ok) {
        setError(`HTTP ${r.status}`)
        return
      }
      const j = await r.json()
      setData(j); setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load error')
    } finally {
      setReloading(false)
    }
  }

  useEffect(() => { if (isAdmin) load() }, [isAdmin, bucket, statusFilter, offset])

  function setQuery(updates: Record<string, string | null>) {
    const next = new URLSearchParams(Array.from(sp.entries()))
    for (const [k, v] of Object.entries(updates)) {
      if (v == null) next.delete(k)
      else next.set(k, v)
    }
    // Resetinam offset, kai keičiasi bucket/status — kitaip likom puslapy 7
    if (('bucket' in updates || 'status' in updates) && !('offset' in updates)) {
      next.delete('offset')
    }
    router.replace(`/admin/migration?${next.toString()}`)
  }

  if (status === 'loading' || !isAdmin) return null

  if (error) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Nepavyko užkrauti migracijos stats: {error}.
          Galbūt dar neaplikuota migracija <code className="rounded bg-white px-1">20260512b_artist_migration_status_v2.sql</code>?
        </div>
      </div>
    )
  }

  const noPriorityData = data && data.summary.stats_coverage.covered === 0
  const partialPriorityData = data && data.summary.stats_coverage.pct < 95 && !noPriorityData

  const totalDone = data
    ? data.summary.lt.done + data.summary.intl.done + data.summary.unknown.done
    : 0
  const totalPct = data && data.summary.total > 0
    ? Math.round((totalDone / data.summary.total) * 1000) / 10
    : 0

  return (
    <div className="min-h-screen bg-[var(--bg-elevated)]">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-4 flex items-baseline justify-between gap-2">
          <div>
            <Link href="/admin" className="text-[12px] text-music-blue hover:underline">
              ← Admin dashboard
            </Link>
            <h1 className="mt-1 font-['Outfit',sans-serif] text-2xl font-extrabold text-[var(--text-primary)] sm:text-3xl">
              Migracijos progresas
            </h1>
            <p className="mt-1 text-[12.5px] text-[var(--text-muted)]">
              Click on bar / badge for filter; default rodo „pending" + sortinta pagal music.lt likes.
            </p>
          </div>
          <button
            onClick={load}
            disabled={reloading}
            className="text-[11.5px] text-music-blue hover:underline disabled:opacity-50"
          >
            {reloading ? '...' : '↻ Refresh'}
          </button>
        </div>

        {!data ? (
          <div className="rounded-xl border border-[var(--input-border)] bg-[var(--bg-surface)] p-4 text-sm text-[var(--text-muted)]">
            Kraunam...
          </div>
        ) : (
          <>
            {/* 4 clickable progress bars */}
            <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <ProgressBar
                label="Iš viso"
                pct={totalPct}
                doneN={totalDone}
                totalN={data.summary.total}
                color="bg-music-blue"
                active={bucket === 'all'}
                onClick={() => setQuery({ bucket: 'all' })}
              />
              <ProgressBar
                label="LT (scrape)"
                pct={data.summary.lt.pct}
                doneN={data.summary.lt.done}
                totalN={data.summary.lt.total}
                color="bg-yellow-500"
                active={bucket === 'lt'}
                onClick={() => setQuery({ bucket: 'lt' })}
              />
              <ProgressBar
                label="INTL (wiki + scrape)"
                pct={data.summary.intl.pct}
                doneN={data.summary.intl.done}
                totalN={data.summary.intl.total}
                color="bg-emerald-500"
                active={bucket === 'intl'}
                onClick={() => setQuery({ bucket: 'intl' })}
              />
              <ProgressBar
                label="Be šalies"
                pct={data.summary.unknown.pct}
                doneN={data.summary.unknown.done}
                totalN={data.summary.unknown.total}
                color="bg-gray-400"
                active={bucket === 'unknown'}
                onClick={() => setQuery({ bucket: 'unknown' })}
              />
            </div>

            {/* Coverage / dup warnings */}
            {noPriorityData && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                ⚠ Prioritetinis sąrašas neturi <code className="rounded bg-white px-1">legacy_likes</code> duomenų.
                Paleisk <code className="rounded bg-white px-1">python3 scraper/quick_artist_stats.py</code> ant Mac'o,
                kad atlikėjai būtų išrūšiuoti pagal music.lt populiarumą.
              </div>
            )}
            {partialPriorityData && (
              <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-800">
                ℹ Priority signal coverage: {data.summary.stats_coverage.pct.toFixed(1)}% atlikėjų turi quick_stats.
                Paleisk dar kartą <code className="rounded bg-white px-1">quick_artist_stats.py</code>, kad pripildyti likusiems.
              </div>
            )}
            {data.summary.duplicates.unique_groups > 0 && (
              <div className="mb-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-[12px] text-orange-800">
                ⚠ DB'jeje yra <strong>{data.summary.duplicates.unique_groups.toLocaleString('lt-LT')}</strong> dup'inančių
                pavadinimų ({data.summary.duplicates.total_rows.toLocaleString('lt-LT')} viso row'ų).
                Sąraše rodoma po vieną rep + <code className="rounded bg-white px-1">(Nx)</code> badge'as.
                Reikia merge'inti per atskirą tool'ą.
              </div>
            )}

            {/* Status filter tabs */}
            <div className="mb-3 flex items-center gap-1 rounded-lg border border-[var(--input-border)] bg-[var(--bg-surface)] p-1">
              {(['pending', 'done', 'all'] as StatusFilter[]).map(s => (
                <button
                  key={s}
                  onClick={() => setQuery({ status: s })}
                  className={`flex-1 rounded-md py-1.5 text-[11.5px] font-semibold transition-colors ${
                    statusFilter === s
                      ? 'bg-music-blue text-white'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  {s === 'pending' ? '⏳ Laukia' : s === 'done' ? '✓ Sutvarkyti' : '◯ Visi'}
                </button>
              ))}
            </div>

            {/* Results header */}
            <div className="mb-2 flex items-baseline justify-between gap-2 px-1 text-[11.5px] text-[var(--text-muted)]">
              <span>
                Rodoma <strong>{data.rows.length}</strong> iš {data.query.total.toLocaleString('lt-LT')} (po dedupe)
              </span>
              {data.query.total > PAGE_SIZE && (
                <div className="flex items-center gap-2">
                  {offset > 0 && (
                    <button
                      onClick={() => setQuery({ offset: String(Math.max(0, offset - PAGE_SIZE)) })}
                      className="text-music-blue hover:underline"
                    >
                      ← Prev
                    </button>
                  )}
                  <span className="tabular-nums">
                    {offset + 1}–{Math.min(offset + PAGE_SIZE, data.query.total)}
                  </span>
                  {offset + PAGE_SIZE < data.query.total && (
                    <button
                      onClick={() => setQuery({ offset: String(offset + PAGE_SIZE) })}
                      className="text-music-blue hover:underline"
                    >
                      Next →
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Rows */}
            <div className="overflow-hidden rounded-xl border border-[var(--input-border)] bg-[var(--bg-surface)]">
              {data.rows.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">
                  {statusFilter === 'done'
                    ? 'Šiame bucket\'e nėra sutvarkytų atlikėjų dar.'
                    : statusFilter === 'pending'
                      ? '🎉 Visi atlikėjai sutvarkyti šiame bucket\'e!'
                      : 'Nieko nerasta.'}
                </div>
              ) : (
                <ol className="divide-y divide-[var(--border-subtle)]">
                  {data.rows.map((p, i) => (
                    <li key={p.id}>
                      <Link
                        href={`/admin/artists/${p.id}`}
                        className="flex min-h-[44px] items-center gap-2 px-3 py-2 transition-colors hover:bg-[var(--bg-hover)]"
                      >
                        <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-[var(--text-faint)]">
                          {offset + i + 1}.
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--text-primary)]">
                          {p.name || `(be vardo) #${p.id}`}
                          {p.dup_count > 1 && (
                            <span className="ml-1.5 rounded-full bg-orange-100 px-1.5 py-0.5 text-[9px] font-bold text-orange-700">
                              {p.dup_count}x
                            </span>
                          )}
                          {p.country && p.kind === 'intl' && (
                            <span className="ml-1.5 text-[10.5px] font-normal text-[var(--text-muted)]">
                              · {p.country}
                            </span>
                          )}
                        </span>
                        {p.legacy_likes != null && p.legacy_likes > 0 && (
                          <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-secondary)]">
                            ♥ {p.legacy_likes.toLocaleString('lt-LT')}
                          </span>
                        )}
                        {p.legacy_discussion_count != null && p.legacy_discussion_count > 0 && (
                          <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-faint)]">
                            💬 {p.legacy_discussion_count}
                          </span>
                        )}
                        <MissingBadges row={p} />
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function AdminMigrationPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-music-blue border-t-transparent" />
      </div>
    }>
      <AdminMigrationContent />
    </Suspense>
  )
}
