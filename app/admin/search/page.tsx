'use client'

/**
 * Admin > Paieška — search-clicks log'ų stats puslapis.
 *
 * Naudoja /api/admin/search-stats — grąžina totals, byType, topEntities,
 * topQueries, recent, daily.
 *
 * Tikslas: testavimui ir admin'ui matyti, kas labiausiai ieškoma.
 * Future'iniam darbui galim pridėti filter'ius (tipas, periodas, query
 * regex), eksport'ą į CSV, geo info ir t.t.
 */

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Stats = {
  totals: { h24: number; d7: number; d30: number }
  byType: { type: string; count: number }[]
  topEntities: { type: string; id: any; count: number; title: string; subtitle: string | null; href: string | null }[]
  topQueries: { query: string; count: number }[]
  recent: { id: number; type: string; entity_id: any; query: string | null; created_at: string; title: string | null; href: string | null }[]
  daily: { date: string; count: number }[]
}

const TYPE_LABEL: Record<string, string> = {
  artists: 'Atlikėjas', tracks: 'Daina', albums: 'Albumas',
  profiles: 'Vartotojas', events: 'Renginys', venues: 'Vieta',
  news: 'Naujiena', blog_posts: 'Blogas', discussions: 'Diskusija',
}
const TYPE_COLOR: Record<string, string> = {
  artists: '#a78bfa', tracks: '#f97316', albums: '#60a5fa',
  profiles: '#fb7185', events: '#f472b6', venues: '#eab308',
  news: '#22d3ee', blog_posts: '#fb923c', discussions: '#ef4444',
}

export default function AdminSearchStatsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [data, setData] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  useEffect(() => { if (status === 'unauthenticated') router.push('/') }, [status, router])

  const refresh = () => {
    if (!isAdmin) return
    setLoading(true)
    setErr(null)
    fetch('/api/admin/search-stats', { cache: 'no-store' })
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'fetch failed')
        return r.json()
      })
      .then((d: Stats) => setData(d))
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { if (isAdmin) refresh() }, [isAdmin])

  if (status === 'loading' || !isAdmin) return null

  const maxDaily = Math.max(1, ...(data?.daily.map(d => d.count) || [1]))

  return (
    <div className="min-h-screen bg-[var(--bg-elevated)]">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/admin" className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">← Admin</Link>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] mt-1">Paieškos statistika</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">Master search click'ų log'as. Realtime — auto-refresh kas 30s.</p>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="px-3 py-2 text-xs font-bold rounded-lg border border-[var(--input-border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] disabled:opacity-50">
            {loading ? 'Kraunasi…' : '↻ Atnaujinti'}
          </button>
        </div>

        {err && (
          <div className="mb-4 p-3 rounded-lg border border-red-500/40 bg-red-500/10 text-sm text-red-400">
            {err}
          </div>
        )}

        {!data ? (
          <div className="p-10 text-center text-[var(--text-muted)]">Kraunasi…</div>
        ) : data.totals.d30 === 0 ? (
          <div className="p-10 text-center bg-[var(--bg-surface)] rounded-xl border border-[var(--input-border)]">
            <div className="text-3xl mb-2">🔍</div>
            <div className="text-base font-semibold text-[var(--text-primary)]">Dar nėra užregistruotų click'ų</div>
            <div className="text-sm text-[var(--text-muted)] mt-1">Atidaryk paieškos modalą (⌘K), pasirink kažką iš dropdown'o — duomenys pasirodys čia.</div>
          </div>
        ) : (
          <>
            {/* Totals */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <Stat label="Per 24h" value={data.totals.h24} />
              <Stat label="Per 7 dienas" value={data.totals.d7} />
              <Stat label="Per 30 dienų" value={data.totals.d30} />
            </div>

            {/* Daily chart */}
            <Card title="Dienos serija (30d)">
              <div className="flex items-end gap-[3px] h-[120px]">
                {data.daily.map(d => {
                  const h = (d.count / maxDaily) * 100
                  const today = d.date === new Date().toISOString().slice(0, 10)
                  return (
                    <div key={d.date} className="flex-1 group relative flex flex-col items-center justify-end">
                      <div
                        className="w-full rounded-t-[2px] transition-all"
                        style={{
                          height: `${Math.max(h, d.count > 0 ? 4 : 0)}%`,
                          background: today ? 'var(--accent-orange)' : 'var(--accent-link, #60a5fa)',
                          opacity: d.count > 0 ? 1 : 0.15,
                        }}
                        title={`${d.date}: ${d.count} click'ai`}
                      />
                    </div>
                  )
                })}
              </div>
              <div className="flex justify-between text-[10px] text-[var(--text-muted)] mt-2">
                <span>{data.daily[0]?.date.slice(5)}</span>
                <span>Šiandien</span>
              </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
              {/* By type */}
              <Card title="Pagal kategoriją (30d)">
                <div className="space-y-2">
                  {data.byType.map(t => {
                    const max = data.byType[0]?.count || 1
                    const pct = (t.count / max) * 100
                    return (
                      <div key={t.type} className="flex items-center gap-3 text-sm">
                        <div className="w-24 font-semibold" style={{ color: TYPE_COLOR[t.type] || 'var(--text-secondary)' }}>
                          {TYPE_LABEL[t.type] || t.type}
                        </div>
                        <div className="flex-1 h-2 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, background: TYPE_COLOR[t.type] || 'var(--accent-link, #60a5fa)' }}
                          />
                        </div>
                        <div className="w-12 text-right font-mono tabular-nums text-[var(--text-secondary)]">{t.count}</div>
                      </div>
                    )
                  })}
                </div>
              </Card>

              {/* Top queries */}
              <Card title="Populiariausios užklausos">
                {data.topQueries.length === 0 ? (
                  <div className="text-sm text-[var(--text-muted)]">Nėra užklausų — visi click'ai per pradžios scrollą (be q).</div>
                ) : (
                  <div className="space-y-1.5">
                    {data.topQueries.slice(0, 12).map((q, i) => (
                      <div key={q.query} className="flex items-center justify-between gap-3 text-sm py-1 px-2 rounded hover:bg-[var(--bg-hover)]">
                        <span className="text-[var(--text-muted)] tabular-nums w-6">{i + 1}.</span>
                        <span className="flex-1 truncate text-[var(--text-primary)]">„{q.query}"</span>
                        <span className="font-mono tabular-nums text-[var(--text-secondary)]">{q.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* Top entities */}
            <Card title="Populiariausi rezultatai (30d)" className="mt-4">
              <div className="space-y-1">
                {data.topEntities.map((e, i) => (
                  <div key={`${e.type}-${e.id}`} className="flex items-center gap-3 text-sm py-1.5 px-2 rounded hover:bg-[var(--bg-hover)]">
                    <span className="text-[var(--text-muted)] tabular-nums w-6">{i + 1}.</span>
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border w-20 text-center"
                      style={{ color: TYPE_COLOR[e.type] || 'var(--text-secondary)', borderColor: (TYPE_COLOR[e.type] || '#888') + '40' }}
                    >
                      {TYPE_LABEL[e.type] || e.type}
                    </span>
                    {e.href ? (
                      <Link href={e.href} target="_blank" className="flex-1 truncate text-[var(--text-primary)] hover:underline">
                        {e.title}
                        {e.subtitle && <span className="text-[var(--text-muted)] ml-2">· {e.subtitle}</span>}
                      </Link>
                    ) : (
                      <span className="flex-1 truncate text-[var(--text-muted)]">{e.title}</span>
                    )}
                    <span className="font-mono tabular-nums text-[var(--text-secondary)]">{e.count}</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Recent feed */}
            <Card title={`Naujausi click'ai (paskutiniai ${data.recent.length})`} className="mt-4">
              <div className="space-y-1 max-h-[400px] overflow-y-auto">
                {data.recent.map(r => (
                  <div key={r.id} className="flex items-center gap-3 text-xs py-1.5 px-2 rounded hover:bg-[var(--bg-hover)]">
                    <span className="font-mono text-[var(--text-muted)] w-12 tabular-nums">{relativeTime(r.created_at)}</span>
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border w-20 text-center"
                      style={{ color: TYPE_COLOR[r.type] || 'var(--text-secondary)', borderColor: (TYPE_COLOR[r.type] || '#888') + '40' }}
                    >
                      {TYPE_LABEL[r.type] || r.type}
                    </span>
                    {r.href ? (
                      <Link href={r.href} target="_blank" className="flex-1 truncate text-[var(--text-primary)] hover:underline">
                        {r.title || `(#${r.entity_id})`}
                      </Link>
                    ) : (
                      <span className="flex-1 truncate text-[var(--text-muted)]">{r.title || `(#${r.entity_id})`}</span>
                    )}
                    {r.query && (
                      <span className="text-[var(--text-muted)] truncate max-w-[200px]">„{r.query}"</span>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-xl p-4">
      <div className="text-xs uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
      <div className="text-3xl font-bold text-[var(--text-primary)] mt-1 tabular-nums">{value.toLocaleString('lt-LT')}</div>
    </div>
  )
}

function Card({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-xl p-4 ${className || ''}`}>
      <div className="text-xs uppercase tracking-wider font-bold text-[var(--text-muted)] mb-3">{title}</div>
      {children}
    </div>
  )
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}val`
  const d = Math.floor(h / 24)
  return `${d}d`
}
