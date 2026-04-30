'use client'

/**
 * /admin/import/forum — forumų migracijos valdymas.
 *
 * Funkcionalumas:
 *   - Stats: viso thread'ų / tuščių / scraped / aktyvūs job'ai / failed
 *   - Bulk action'ai: Discover (paleidžia forum_discover), Scrape empty (queue'ina visus
 *     thread'us be post'ų), Scrape all (queue visi).
 *   - Lentelė: thread'ai filtruojami pagal status'ą (all / empty / scraped / active_job).
 *   - Polling kas 10s kol yra aktyvių job'ų.
 *
 * Worker'is paleidžiamas Mac'e:
 *   bash scraper/run_worker.sh forum
 */

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Stats = {
  total: number
  empty: number
  scraped: number
  active_jobs: number
  failed_jobs: number
}

type ThreadRow = {
  legacy_id: number
  slug: string | null
  title: string | null
  kind: string
  post_count: number | null
  pagination_count: number | null
  last_post_at: string | null
  last_job_status: string | null
  last_job_completed_at: string | null
  last_job_error: string | null
  has_active_job: boolean
}

export default function ForumImportPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [stats, setStats] = useState<Stats | null>(null)
  const [threads, setThreads] = useState<ThreadRow[]>([])
  const [filter, setFilter] = useState<'all' | 'empty' | 'scraped' | 'active_job'>('all')
  const [loading, setLoading] = useState(true)
  const [actionMsg, setActionMsg] = useState('')
  const [actionRunning, setActionRunning] = useState(false)

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/import/forum?filter=${filter}&limit=100`)
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      setStats(d.stats)
      setThreads(d.threads || [])
    } catch (e: any) {
      setActionMsg(`✗ Load klaida: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/auth/signin'); return }
    if (status === 'authenticated' && !isAdmin) { router.push('/'); return }
    if (status !== 'authenticated') return
    load()
  }, [status, isAdmin, router, load])

  // Auto-refresh kas 10s, jei yra aktyvių job'ų
  useEffect(() => {
    if (!stats?.active_jobs) return
    const t = setInterval(load, 10_000)
    return () => clearInterval(t)
  }, [stats?.active_jobs, load])

  const runAction = async (action: string, body: any = {}) => {
    setActionRunning(true)
    setActionMsg('')
    try {
      const r = await fetch('/api/admin/import/forum', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...body }),
      })
      const d = await r.json()
      if (!r.ok || d.error) throw new Error(d.error || 'fail')
      setActionMsg(`✓ ${action}: queued ${d.queued ?? 0}${d.skipped ? `, skipped ${d.skipped}` : ''}`)
      load()
    } catch (e: any) {
      setActionMsg(`✗ ${e.message}`)
    } finally {
      setActionRunning(false)
    }
  }

  if (loading || !stats) {
    return (
      <div className="min-h-screen bg-[#f8f7f5] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f8f7f5] p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-baseline justify-between mb-1">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Forumų migracija</h1>
          <Link href="/admin/import" className="text-sm text-blue-600 hover:underline">
            ← Atlikėjų migracija
          </Link>
        </div>
        <p className="text-sm text-[var(--text-muted)] mb-6">
          Forum thread'ų ir post'ų importas iš music.lt. Worker'is: <code className="text-xs bg-[var(--bg-elevated)] px-1 rounded">bash scraper/run_worker.sh forum</code>
        </p>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <Stat label="Iš viso thread'ų" value={stats.total} />
          <Stat label="Tušti" value={stats.empty} tone={stats.empty > 0 ? 'amber' : undefined} />
          <Stat label="Scraped" value={stats.scraped} tone="green" />
          <Stat label="Aktyvūs job'ai" value={stats.active_jobs} tone={stats.active_jobs > 0 ? 'blue' : undefined} />
          <Stat label="Failed" value={stats.failed_jobs} tone={stats.failed_jobs > 0 ? 'red' : undefined} />
        </div>

        {/* Bulk actions */}
        <div className="bg-white border border-[var(--input-border)] rounded-xl p-4 mb-6">
          <h2 className="text-sm font-semibold mb-3">Bulk veiksmai</h2>
          <div className="flex flex-wrap gap-2">
            <ActionBtn
              label="🔍 Discover (rasti naujus thread'us)"
              tone="blue"
              disabled={actionRunning}
              onClick={() => runAction('discover')}
              hint="Paleidžia forum_discover.py per worker'į. Iteruoja /lt/diskusijos/ + /lt/naujienos/ pagination'ą, UPSERT'ina naujus thread legacy_id'us. Long-running."
            />
            <ActionBtn
              label={`📝 Scrape tuščius (${stats.empty})`}
              tone="amber"
              disabled={actionRunning || stats.empty === 0}
              onClick={() => {
                if (!confirm(`Tikrai queue'inti ${stats.empty} forum_thread job'ų?`)) return
                runAction('scrape_empty')
              }}
              hint="Sukuria forum_thread job kiekvienam thread'ui be post'ų. Worker'is per ~3s/thread paeis."
            />
            <ActionBtn
              label={`🔁 Scrape visus (${stats.total})`}
              tone="purple"
              disabled={actionRunning || stats.total === 0}
              onClick={() => {
                if (!confirm(`PERSISTENT: ${stats.total} thread'ų pakartotinis scrape. Tęsti?`)) return
                runAction('scrape_all')
              }}
              hint="Re-scrape'ina visus thread'us — naudinga kai pakeitėm parser'į."
            />
            <ActionBtn
              label="↻ Refresh"
              tone="stone"
              disabled={actionRunning}
              onClick={load}
            />
          </div>
          {actionMsg && (
            <div className={`mt-3 px-3 py-2 rounded-lg text-sm ${actionMsg.startsWith('✓') ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {actionMsg}
            </div>
          )}
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 mb-3 text-xs">
          {(['all', 'empty', 'scraped', 'active_job'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full font-medium transition-colors ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-[var(--input-border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {f === 'all' ? 'Visi' : f === 'empty' ? 'Tušti' : f === 'scraped' ? 'Scraped' : 'Aktyvūs'}
            </button>
          ))}
        </div>

        {/* Threads table */}
        <div className="bg-white border border-[var(--input-border)] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--bg-elevated)] text-xs uppercase text-[var(--text-muted)]">
              <tr>
                <th className="px-3 py-2 text-left">ID</th>
                <th className="px-3 py-2 text-left">Pavadinimas</th>
                <th className="px-3 py-2 text-left">Kind</th>
                <th className="px-3 py-2 text-right">Posts</th>
                <th className="px-3 py-2 text-right">Pages</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {threads.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[var(--text-muted)]">Nieko pagal filtrą.</td></tr>
              ) : threads.map(t => (
                <tr key={t.legacy_id} className="border-t border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]/30">
                  <td className="px-3 py-1.5 font-mono text-xs text-[var(--text-muted)]">{t.legacy_id}</td>
                  <td className="px-3 py-1.5 max-w-md truncate" title={t.title || ''}>{t.title || <span className="text-[var(--text-faint)]">(be title'o)</span>}</td>
                  <td className="px-3 py-1.5 text-xs">
                    <span className={`px-1.5 py-0.5 rounded ${t.kind === 'news' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                      {t.kind}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{t.post_count ?? 0}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text-muted)]">{t.pagination_count ?? '—'}</td>
                  <td className="px-3 py-1.5 text-xs">
                    {t.has_active_job ? (
                      <span className="text-blue-700 font-medium">⏳ {t.last_job_status}</span>
                    ) : t.last_job_status === 'completed' ? (
                      <span className="text-green-700">✓ {t.last_job_completed_at ? new Date(t.last_job_completed_at).toLocaleDateString('lt') : ''}</span>
                    ) : t.last_job_status === 'failed' ? (
                      <span className="text-red-700" title={t.last_job_error || ''}>✗ failed</span>
                    ) : t.post_count && t.post_count > 0 ? (
                      <span className="text-[var(--text-muted)]">scraped</span>
                    ) : (
                      <span className="text-[var(--text-faint)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <button
                      onClick={() => runAction('scrape_ids', { legacyIds: [t.legacy_id] })}
                      disabled={actionRunning || t.has_active_job}
                      className="text-xs text-blue-600 hover:underline disabled:opacity-30"
                      title="Queue forum_thread job šitam thread'ui"
                    >
                      ↻ Scrape
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'green' | 'amber' | 'blue' | 'red' }) {
  const cls = tone === 'green' ? 'text-green-700'
            : tone === 'amber' ? 'text-amber-700'
            : tone === 'blue' ? 'text-blue-700'
            : tone === 'red' ? 'text-red-700'
            : 'text-[var(--text-primary)]'
  return (
    <div className="bg-white border border-[var(--input-border)] rounded-xl p-3">
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${cls}`}>{value.toLocaleString()}</div>
    </div>
  )
}

function ActionBtn({ label, tone, onClick, disabled, hint }: {
  label: string
  tone: 'blue' | 'amber' | 'purple' | 'stone'
  onClick: () => void
  disabled?: boolean
  hint?: string
}) {
  const cls = tone === 'blue' ? 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200'
            : tone === 'amber' ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200'
            : tone === 'purple' ? 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'
            : 'bg-stone-50 hover:bg-stone-100 text-stone-700 border-stone-200'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={hint}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 ${cls}`}
    >
      {label}
    </button>
  )
}
