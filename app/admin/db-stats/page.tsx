// app/admin/db-stats/page.tsx
//
// DB monitoring dashboard. Fetch'ina /api/admin/db-stats ir rodom:
//   - Total DB size + % nuo Pro/Free limit'ų
//   - Top 20 lentelės pagal dydį
//   - Dead indexes (idx_scan=0) — DROP kandidatai
//   - Bloat estimate per table
//
// Read-only — dropping/vacuum'inimas daromas atskirai per SQL Editor.

'use client'

import { useEffect, useState } from 'react'

type DbStats = {
  measured_at: string
  database: {
    name: string
    bytes: number
    pretty: string
    pct_of_pro: number
    pct_of_free: number
  }
  top_tables: Array<{
    name: string
    bytes: number
    pretty: string
    row_estimate: number | null
  }>
  dead_indexes: Array<{
    schema_name: string
    table_name: string
    index_name: string
    index_size: string
    index_bytes: number
    scans: number
  }>
  bloat: Array<{
    schema_name: string
    table_name: string
    live_tuples: number
    dead_tuples: number
    bloat_pct: number
    table_size: string
  }>
}

export default function DbStatsPage() {
  const [data, setData] = useState<DbStats | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    setErr(null)
    try {
      const r = await fetch('/api/admin/db-stats', { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setData(d)
    } catch (e: any) {
      setErr(e.message || 'Klaida')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading && !data) return <div className="p-6 text-[var(--text-muted)]">Kraunama…</div>
  if (err) return (
    <div className="p-6">
      <div className="rounded border border-red-300 bg-red-50 p-4 text-red-900">
        <div className="font-semibold mb-1">Klaida:</div>
        <div className="text-sm font-mono">{err}</div>
      </div>
    </div>
  )
  if (!data) return null

  const proBar = Math.min(100, data.database.pct_of_pro)
  const freeBar = Math.min(100, data.database.pct_of_free)

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">DB Stats</h1>
        <button
          onClick={load}
          className="text-sm px-3 py-1.5 rounded bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)]"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Total + limit gauges */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
        <div className="flex items-baseline gap-3 mb-4">
          <div className="text-3xl font-bold">{data.database.pretty}</div>
          <div className="text-sm text-[var(--text-muted)]">{data.database.name}</div>
        </div>

        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-xs text-[var(--text-muted)] mb-1">
              <span>Pro plan limit (8 GB)</span>
              <span>{data.database.pct_of_pro}%</span>
            </div>
            <div className="h-2 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
              <div
                className={`h-full ${proBar > 80 ? 'bg-red-500' : proBar > 60 ? 'bg-yellow-500' : 'bg-emerald-500'}`}
                style={{ width: `${proBar}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs text-[var(--text-muted)] mb-1">
              <span>Free plan limit (500 MB) — for reference</span>
              <span>{data.database.pct_of_free}%</span>
            </div>
            <div className="h-2 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
              <div
                className={`h-full ${freeBar > 100 ? 'bg-red-500' : freeBar > 80 ? 'bg-yellow-500' : 'bg-emerald-500'}`}
                style={{ width: `${Math.min(freeBar, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Top tables */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Top 20 lentelių</h2>
        <div className="rounded-lg border border-[var(--border)] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--bg-elevated)] text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Lentelė</th>
                <th className="px-3 py-2 font-medium text-right">Dydis</th>
                <th className="px-3 py-2 font-medium text-right">~ Rows</th>
              </tr>
            </thead>
            <tbody>
              {data.top_tables.map(t => (
                <tr key={t.name} className="border-t border-[var(--border)]">
                  <td className="px-3 py-1.5 font-mono">{t.name}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{t.pretty}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text-muted)]">
                    {t.row_estimate?.toLocaleString() || '–'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Dead indexes */}
      <section>
        <h2 className="text-lg font-semibold mb-1">Dead indexes</h2>
        <div className="text-xs text-[var(--text-muted)] mb-3">
          idx_scan = 0 — query planner niekada nepasinaudojo. DROP kandidatai (atidžiai — naujesni gali būti dar nepasinaudoti).
        </div>
        {data.dead_indexes.length === 0 ? (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-emerald-900 text-sm">
            Nė vieno dead index'o &gt; 1 MB. Geras dalykas.
          </div>
        ) : (
          <div className="rounded-lg border border-[var(--border)] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg-elevated)] text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Lentelė</th>
                  <th className="px-3 py-2 font-medium">Index</th>
                  <th className="px-3 py-2 font-medium text-right">Dydis</th>
                </tr>
              </thead>
              <tbody>
                {data.dead_indexes.map(i => (
                  <tr key={i.index_name} className="border-t border-[var(--border)]">
                    <td className="px-3 py-1.5 font-mono">{i.table_name}</td>
                    <td className="px-3 py-1.5 font-mono">{i.index_name}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{i.index_size}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Bloat */}
      <section>
        <h2 className="text-lg font-semibold mb-1">Bloat (top dead-tuple lentelės)</h2>
        <div className="text-xs text-[var(--text-muted)] mb-3">
          &gt; 30% bloat = VACUUM FULL kandidatas. Autovacuum'as paprastai tvarkosi pats, bet kai migracijos sukuria daug DELETE'ų — naudinga rankinis.
        </div>
        <div className="rounded-lg border border-[var(--border)] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--bg-elevated)] text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Lentelė</th>
                <th className="px-3 py-2 font-medium text-right">Live</th>
                <th className="px-3 py-2 font-medium text-right">Dead</th>
                <th className="px-3 py-2 font-medium text-right">Bloat %</th>
                <th className="px-3 py-2 font-medium text-right">Size</th>
              </tr>
            </thead>
            <tbody>
              {data.bloat.map(b => (
                <tr key={b.table_name} className="border-t border-[var(--border)]">
                  <td className="px-3 py-1.5 font-mono">{b.table_name}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{b.live_tuples.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{b.dead_tuples.toLocaleString()}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums ${b.bloat_pct > 30 ? 'text-orange-600 font-semibold' : ''}`}>
                    {b.bloat_pct}%
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{b.table_size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="text-xs text-[var(--text-muted)] text-right">
        Measured: {new Date(data.measured_at).toLocaleString('lt-LT')}
      </div>
    </div>
  )
}
