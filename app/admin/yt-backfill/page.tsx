// app/admin/yt-backfill/page.tsx
//
// YouTube info foninio backfill stebėjimas.
//   - Likučiai pagal fazes (A views / B be video / C data)
//   - Progresas: apdorota / atkurta / negyvi
//   - „Paleisti dabar" — rankinė partija (cron'as ir taip sukasi kas 5 min)
//
// Visi duomenys per /api/cron/yt-backfill (admin sesija). Read + manual run.

'use client'

import { useCallback, useEffect, useState } from 'react'

type Stats = {
  ok: true
  remaining: { A: number | null; B: number | null; C: number | null }
  processed: { total: number | null; recovered: number | null; dead: number | null }
}

type RunResult = {
  ok: boolean
  phase: string | null
  processed?: number
  found?: number
  errors?: number
  ms?: number
  done?: boolean
}

const PHASE_LABEL: Record<string, string> = {
  A: 'Trūksta peržiūrų (views)',
  B: 'Visai be video (reikia paieškos)',
  C: 'Trūksta tik įkėlimo datos',
}

function fmt(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('lt-LT')
}

export default function YtBackfillPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [lastRun, setLastRun] = useState<RunResult | null>(null)

  const loadStats = useCallback(async () => {
    setErr(null)
    try {
      const r = await fetch('/api/cron/yt-backfill?stats=1', { cache: 'no-store', credentials: 'same-origin' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setStats(await r.json())
    } catch (e: any) {
      setErr(e?.message || 'Klaida')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStats()
    const t = setInterval(loadStats, 30000) // auto-refresh 30s
    return () => clearInterval(t)
  }, [loadStats])

  const runNow = useCallback(async () => {
    setRunning(true)
    setLastRun(null)
    try {
      const r = await fetch('/api/cron/yt-backfill?batch=40', { cache: 'no-store', credentials: 'same-origin' })
      setLastRun(await r.json())
      await loadStats()
    } catch (e: any) {
      setLastRun({ ok: false, phase: null })
    } finally {
      setRunning(false)
    }
  }, [loadStats])

  const remaining = stats ? (stats.remaining.A || 0) + (stats.remaining.B || 0) + (stats.remaining.C || 0) : 0
  const processed = stats?.processed.total || 0
  const grand = remaining + processed
  const pct = grand > 0 ? Math.round((processed / grand) * 100) : 0

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold text-[var(--text-primary)]">YouTube backfill</h1>
        <div className="flex gap-2">
          <button onClick={loadStats} disabled={loading}
            className="px-3 py-1.5 text-sm font-medium border border-[var(--input-border)] rounded-lg hover:bg-[var(--bg-elevated)] disabled:opacity-50">
            Atnaujinti
          </button>
          <button onClick={runNow} disabled={running}
            className="px-3 py-1.5 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
            {running ? 'Vykdoma…' : 'Paleisti dabar'}
          </button>
        </div>
      </div>
      <p className="text-xs text-[var(--text-muted)] mb-5">
        Cron'as automatiškai apdoroja partiją kas 5 min (nemokami YouTube šaltiniai, be Data API kvotos).
        Prioritetas: topų dainos → top atlikėjai → likusios.
      </p>

      {err && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">Klaida: {err}</div>}

      {/* Bendras progresas */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4 mb-4 shadow-sm">
        <div className="flex justify-between text-sm mb-1.5">
          <span className="font-semibold text-[var(--text-secondary)]">Bendras progresas</span>
          <span className="tabular-nums text-[var(--text-muted)]">{fmt(processed)} / {fmt(grand)} ({pct}%)</span>
        </div>
        <div className="h-2.5 rounded-full bg-[var(--bg-active)] overflow-hidden">
          <div className="h-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex gap-4 mt-3 text-xs text-[var(--text-muted)]">
          <span>✅ atkurta (su views): <b className="text-green-700">{fmt(stats?.processed.recovered)}</b></span>
          <span>⚠️ negyvi video: <b className="text-amber-600">{fmt(stats?.processed.dead)}</b></span>
        </div>
      </div>

      {/* Likučiai pagal fazes */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {(['A', 'B', 'C'] as const).map((p) => (
          <div key={p} className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4 shadow-sm">
            <div className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">{fmt(stats?.remaining[p])}</div>
            <div className="text-[11px] uppercase tracking-wide font-semibold text-[var(--text-muted)] mt-0.5">Fazė {p}</div>
            <div className="text-xs text-[var(--text-secondary)] mt-1">{PHASE_LABEL[p]}</div>
          </div>
        ))}
      </div>

      {lastRun && (
        <div className="text-sm bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4 shadow-sm">
          <div className="font-semibold text-[var(--text-secondary)] mb-1">Paskutinė rankinė partija</div>
          {lastRun.ok
            ? <div className="text-[var(--text-secondary)]">
                Fazė <b>{lastRun.phase || '—'}</b> · apdorota <b>{fmt(lastRun.processed)}</b> ·
                atkurta <b className="text-green-700">{fmt(lastRun.found)}</b> ·
                klaidų {fmt(lastRun.errors)} · {fmt(lastRun.ms)} ms
                {lastRun.done && <span className="ml-1 text-green-700">— viskas baigta! 🎉</span>}
              </div>
            : <div className="text-red-600">Nepavyko paleisti.</div>}
        </div>
      )}
    </div>
  )
}
