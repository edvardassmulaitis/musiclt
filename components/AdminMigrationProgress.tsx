'use client'
// Kompaktiška migracijos progresas kortelė admin homepage'ui.
//
// Tikslas — kad homepage'as nesutrukdytų greito pasiekti į kitas korteles.
// Pilnas UI (priority list, filter'iai, pagination) gyvena /admin/migration.
//
// Rodo:
//   • 3 stat'us: Total / LT / INTL su % done + counts
//   • Click bet kurio bar'o → /admin/migration?bucket=X
//   • Bendras link "Žiūrėti detales →" į /admin/migration
//
// Done kriterijai (žr. /api/admin/migration/stats):
//   - LT: scrape ✓
//   - INTL: scrape ✓ + wiki ✓
//   - Unknown bucket'as ne rodomas šiame compact view'e (link į /admin/migration
//     kur galima pamatyti su filter'iu).
import { useEffect, useState } from 'react'
import Link from 'next/link'

type Summary = {
  total: number
  lt: { total: number; done: number; pct: number }
  intl: { total: number; done: number; pct: number }
  unknown: { total: number; done: number; pct: number }
  stats_coverage: { covered: number; missing: number; pct: number }
  duplicates: { unique_groups: number; total_rows: number }
}

function MiniBar({ pct, color }: { pct: number; color: string }) {
  const safePct = Math.max(0, Math.min(100, pct))
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-elevated)]">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${safePct}%` }} />
    </div>
  )
}

function MiniStat({ href, label, doneN, totalN, pct, color }: {
  href: string; label: string; doneN: number; totalN: number; pct: number; color: string
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1 rounded-lg border border-[var(--input-border)] bg-[var(--bg-surface)] px-3 py-2 transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
          {label}
        </span>
        <span className="text-[12px] tabular-nums text-[var(--text-muted)]">
          {doneN.toLocaleString('lt-LT')} / {totalN.toLocaleString('lt-LT')}
        </span>
      </div>
      <MiniBar pct={pct} color={color} />
      <span className="text-right text-[12px] font-semibold tabular-nums text-[var(--text-secondary)]">
        {pct.toFixed(1)}%
      </span>
    </Link>
  )
}

export default function AdminMigrationProgress() {
  const [s, setS] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/migration/stats?limit=1')
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (j) setS(j.summary)
        else setError('error')
      })
      .catch(() => setError('error'))
  }, [])

  if (error) {
    return (
      <Link
        href="/admin/migration"
        className="block rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[14px] text-red-700 hover:bg-red-100"
      >
        ⚠ Migracijos stats nepavyko užkrauti — atidaryk pilną puslapį →
      </Link>
    )
  }

  if (!s) {
    return (
      <div className="rounded-xl border border-[var(--input-border)] bg-[var(--bg-surface)] px-3 py-2 text-[14px] text-[var(--text-muted)]">
        Kraunam migracijos stats...
      </div>
    )
  }

  const totalDone = s.lt.done + s.intl.done + s.unknown.done
  const totalPct = s.total > 0 ? Math.round((totalDone / s.total) * 1000) / 10 : 0

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--input-border)] bg-[var(--bg-surface)]">
      <Link
        href="/admin/migration"
        className="flex items-baseline justify-between gap-2 border-b border-[var(--border-subtle)] px-3 py-2 hover:bg-[var(--bg-hover)]"
      >
        <div className="flex items-baseline gap-2">
          <span className="text-base">📊</span>
          <h2 className="font-['Outfit',sans-serif] text-[14.5px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-primary)]">
            Migracijos progresas
          </h2>
          {totalPct > 0 && (
            <span className="text-[13px] font-semibold tabular-nums text-[var(--text-secondary)]">
              {totalPct.toFixed(1)}% sutvarkyta
            </span>
          )}
        </div>
        <span className="text-[13px] text-music-blue">Detali migracija →</span>
      </Link>

      <div className="grid grid-cols-1 gap-2 p-2 sm:grid-cols-3">
        <MiniStat
          href="/admin/migration?bucket=lt"
          label="LT"
          doneN={s.lt.done} totalN={s.lt.total} pct={s.lt.pct}
          color="bg-yellow-500"
        />
        <MiniStat
          href="/admin/migration?bucket=intl"
          label="INTL"
          doneN={s.intl.done} totalN={s.intl.total} pct={s.intl.pct}
          color="bg-emerald-500"
        />
        <MiniStat
          href="/admin/migration?bucket=unknown"
          label="Be šalies"
          doneN={s.unknown.done} totalN={s.unknown.total} pct={s.unknown.pct}
          color="bg-gray-400"
        />
      </div>

      {s.stats_coverage.pct < 50 && (
        <div className="border-t border-[var(--border-subtle)] bg-amber-50 px-3 py-1.5 text-[12.5px] text-amber-800">
          ⚠ Priority signal: tik {s.stats_coverage.pct.toFixed(1)}% atlikėjų turi quick_stats — paleisk{' '}
          <code className="rounded bg-white px-1">scraper/quick_artist_stats.py</code>
        </div>
      )}
    </div>
  )
}
