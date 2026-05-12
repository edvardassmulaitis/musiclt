'use client'
// Migration progress kortelė admin pagrindiniam dashboard'ui.
//
// Rodo:
//   • 3 progress bar'ai: Total / LT / INTL — % done + counts
//   • Top N priority sąrašas: nedaryti atlikėjai sortinta pagal music.lt
//     legacy_likes desc (iš scraper/quick_artist_stats.py rezultatų).
//   • Stats coverage badge'as — kiek atlikėjų jau turi quick_stats run'inta.
//
// Done kriterijai (žr. /api/admin/migration/stats):
//   - LT (country='Lietuva' arba NULL): scrape ✓ (bent vienas legacy track/album)
//   - INTL (kita country): wiki ✓ AND scrape ✓
//
// Kiekvienas priority row'as click'inamas → /admin/artists/[id] (kur galima
// paleisti Wiki import + scrape).
import { useEffect, useState } from 'react'
import Link from 'next/link'

type Priority = {
  id: number
  name: string | null
  slug: string | null
  country: string | null
  kind: 'lt' | 'intl'
  legacy_likes: number | null
  legacy_comments: number | null
  legacy_discussion_count: number | null
  legacy_news_count: number | null
  missing: ('scrape' | 'wiki')[]
  track_count: number
  album_count: number
}

type MigrationStats = {
  total: { artists: number; with_legacy_id: number; no_legacy_id: number; done: number; pct: number }
  lt: { total: number; done: number; pending: number; pct: number }
  intl: { total: number; done: number; wiki_only: number; scrape_only: number; pending: number; pct: number }
  priority_signal: { stats_covered: number; stats_missing: number; pct: number }
  priority: Priority[]
}

function ProgressBar({ pct, label, doneN, totalN, color }: {
  pct: number; label: string; doneN: number; totalN: number; color: string
}) {
  const safePct = Math.max(0, Math.min(100, pct))
  return (
    <div className="rounded-lg border border-[var(--input-border)] bg-[var(--bg-surface)] p-3">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[11.5px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
          {label}
        </span>
        <span className="text-[11px] tabular-nums text-[var(--text-muted)]">
          {doneN.toLocaleString('lt-LT')} / {totalN.toLocaleString('lt-LT')}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-elevated)]">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${safePct}%` }}
        />
      </div>
      <div className="mt-1 text-right text-[10.5px] font-semibold tabular-nums text-[var(--text-secondary)]">
        {safePct.toFixed(1)}%
      </div>
    </div>
  )
}

function MissingBadges({ missing, kind }: { missing: ('scrape' | 'wiki')[]; kind: 'lt' | 'intl' }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <span className="rounded-full bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
        {kind === 'lt' ? 'LT' : 'INTL'}
      </span>
      {missing.map(m => (
        <span
          key={m}
          className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
            m === 'wiki'
              ? 'bg-blue-100 text-blue-700'
              : 'bg-orange-100 text-orange-700'
          }`}
        >
          –{m}
        </span>
      ))}
    </span>
  )
}

export default function AdminMigrationProgress() {
  const [stats, setStats] = useState<MigrationStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloading, setReloading] = useState(false)

  async function load() {
    setReloading(true)
    try {
      const r = await fetch('/api/admin/migration/stats?priority_limit=15')
      if (!r.ok) {
        setError(`HTTP ${r.status}`)
        return
      }
      const j = await r.json()
      setStats(j)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load error')
    } finally {
      setReloading(false)
    }
  }

  useEffect(() => { load() }, [])

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        Nepavyko užkrauti migracijos stats: {error}.
        Galbūt dar neaplikuota migracija <code className="rounded bg-white px-1">20260512_artist_migration_stats.sql</code>?
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="rounded-xl border border-[var(--input-border)] bg-[var(--bg-surface)] p-4 text-sm text-[var(--text-muted)]">
        Kraunam migracijos progresą...
      </div>
    )
  }

  const noPriorityData = stats.priority_signal.stats_covered === 0

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--input-border)] bg-[var(--bg-surface)]">
      {/* Header su reload mygtuku */}
      <div className="flex items-baseline justify-between gap-2 border-b border-[var(--border-subtle)] px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <span className="text-base">📊</span>
          <h2 className="font-['Outfit',sans-serif] text-sm font-extrabold uppercase tracking-[0.1em] text-[var(--text-primary)]">
            Migracijos progresas
          </h2>
          <span className="text-[10.5px] text-[var(--text-faint)]">
            — kiek atlikėjų sutvarkyta
          </span>
        </div>
        <button
          onClick={load}
          disabled={reloading}
          className="text-[11px] text-music-blue hover:underline disabled:opacity-50"
        >
          {reloading ? '...' : '↻ Refresh'}
        </button>
      </div>

      {/* 3 progress bar'ai */}
      <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-3">
        <ProgressBar
          label="Iš viso"
          pct={stats.total.pct}
          doneN={stats.total.done}
          totalN={stats.total.artists}
          color="bg-music-blue"
        />
        <ProgressBar
          label="LT (scrape)"
          pct={stats.lt.pct}
          doneN={stats.lt.done}
          totalN={stats.lt.total}
          color="bg-yellow-500"
        />
        <ProgressBar
          label="INTL (wiki + scrape)"
          pct={stats.intl.pct}
          doneN={stats.intl.done}
          totalN={stats.intl.total}
          color="bg-emerald-500"
        />
      </div>

      {/* INTL extra detail — partial states */}
      {stats.intl.total > 0 && (
        <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-1.5 text-[11px] text-[var(--text-muted)]">
          INTL partial: {stats.intl.wiki_only.toLocaleString('lt-LT')} tik wiki ·
          {' '}{stats.intl.scrape_only.toLocaleString('lt-LT')} tik scrape ·
          {' '}{stats.intl.pending.toLocaleString('lt-LT')} laukia
          {stats.total.no_legacy_id > 0 && (
            <>
              {' · '}
              <span className="text-[var(--text-faint)]">
                {stats.total.no_legacy_id.toLocaleString('lt-LT')} be legacy_id (nesusieti su sena sistema)
              </span>
            </>
          )}
        </div>
      )}

      {/* Priority signal coverage warning */}
      {noPriorityData && (
        <div className="border-t border-[var(--border-subtle)] bg-amber-50 px-4 py-2 text-[11.5px] text-amber-800">
          ⚠ Prioritetinis sąrašas neturi <code className="rounded bg-white px-1">legacy_likes</code> duomenų.
          Paleisk <code className="rounded bg-white px-1">python3 scraper/quick_artist_stats.py</code> ant Mac'o,
          kad atlikėjai būtų išrūšiuoti pagal music.lt populiarumą (vietoj DB id'ų).
        </div>
      )}
      {!noPriorityData && stats.priority_signal.pct < 95 && (
        <div className="border-t border-[var(--border-subtle)] bg-blue-50 px-4 py-2 text-[11.5px] text-blue-800">
          ℹ Priority signal coverage: {stats.priority_signal.pct.toFixed(1)}% atlikėjų turi quick_stats.
          Paleisk <code className="rounded bg-white px-1">python3 scraper/quick_artist_stats.py</code> kad pripildyti likusiems.
        </div>
      )}

      {/* Top N priority sąrašas */}
      <div className="border-t border-[var(--border-subtle)]">
        <div className="flex items-baseline justify-between gap-2 px-4 pt-2.5 pb-1">
          <h3 className="text-[11.5px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
            🎯 Prioriteto sąrašas — nedaryti, top {stats.priority.length}
          </h3>
          <Link
            href="/admin/artists?filter=migration_pending"
            className="text-[11px] text-music-blue hover:underline"
          >
            Pilnas sąrašas →
          </Link>
        </div>
        {stats.priority.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">
            🎉 Visi atlikėjai sutvarkyti.
          </div>
        ) : (
          <ol className="divide-y divide-[var(--border-subtle)]">
            {stats.priority.map((p, i) => (
              <li key={p.id}>
                <Link
                  href={`/admin/artists/${p.id}`}
                  className="flex min-h-[44px] items-center gap-2 px-4 py-2 transition-colors hover:bg-[var(--bg-hover)]"
                >
                  <span className="w-6 shrink-0 text-right text-[11px] tabular-nums text-[var(--text-faint)]">
                    {i + 1}.
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--text-primary)]">
                    {p.name || `(be vardo) #${p.id}`}
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
                  <MissingBadges missing={p.missing} kind={p.kind} />
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
