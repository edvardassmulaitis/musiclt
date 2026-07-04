'use client'
// Pilnas migracijos progresas — atskiras puslapis nuo /admin homepage'o.
// Homepage'e tik kompaktiška kortelė + link čia.
//
// 2026-05-21 v3 perdarymas:
//   - Done = scrape + (INT: wiki) + hero + photo + score (NE coverage)
//   - Coverage % (lyrics, YT, YT views) rodomi kaip warning indikatoriai
//   - Per-row antra eilutė: score pill + lyrics% + YT% + YT views% + image hint
//   - Per-bucket summary: avg coverage rodikliai
//
// UI:
//   • 4 progress bar'ai (Iš viso / LT / INTL / Be šalies) — clickable į
//     bucket filter'į
//   • Bucket tab'ai: All / LT / INTL / Be šalies
//   • Status tab'ai: Pending (default) / Done / Visi
//   • Coverage avg badges per bucket
//   • Atlikėjų sąrašas su pagination, sortintas pagal legacy_likes desc;
//     dup'ai grupuoti pagal lower(name) — vienas rep + (Nx) badge'as
//   • Click row → /admin/artists/[id]
import { useEffect, useState, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

type Bucket = 'all' | 'lt' | 'intl' | 'unknown'
type StatusFilter = 'pending' | 'done' | 'all'
type MissingKey = 'scrape' | 'wiki' | 'hero' | 'photo' | 'score'

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
  missing: MissingKey[]
  track_count: number
  album_count: number
  n_lyrics: number
  n_videos: number
  n_video_views_filled: number
  lyrics_pct: number
  yt_pct: number
  yt_views_pct: number
  scrape_done: boolean
  wiki_done: boolean
  hero_done: boolean
  photo_done: boolean
  score_done: boolean
  score: number | null
  image_url: string | null
  hero_url: string | null
  image_is_small: boolean
  image_width: number | null
  image_height: number | null
  legacy_stats_at: string | null
  dup_count: number
}

type StatsResponse = {
  summary: {
    total: number
    duplicates: { unique_groups: number; total_rows: number }
    wiki_factors_enabled: boolean
    lt: { total: number; done: number; pending: number; pct: number }
    intl: { total: number; done: number; pending: number; pct: number }
    unknown: { total: number; done: number; pending: number; pct: number }
    stats_coverage: { covered: number; missing: number; pct: number }
    coverage: {
      lt: { lyrics_pct: number; yt_pct: number; yt_views_pct: number }
      intl: { lyrics_pct: number; yt_pct: number; yt_views_pct: number }
    }
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
        <span className="text-[13.5px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
          {label}
        </span>
        <span className="text-[13px] tabular-nums text-[var(--text-muted)]">
          {doneN.toLocaleString('lt-LT')} / {totalN.toLocaleString('lt-LT')}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-elevated)]">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${safePct}%` }} />
      </div>
      <div className="mt-1 text-right text-[12.5px] font-semibold tabular-nums text-[var(--text-secondary)]">
        {safePct.toFixed(1)}%
      </div>
    </button>
  )
}

const MISSING_LABEL: Record<MissingKey, string> = {
  scrape: 'scrape',
  wiki: 'wiki',
  hero: 'hero',
  photo: 'foto',
  score: 'score',
}

const MISSING_COLOR: Record<MissingKey, string> = {
  scrape: 'bg-orange-100 text-orange-700',
  wiki: 'bg-blue-100 text-blue-700',
  hero: 'bg-purple-100 text-purple-700',
  photo: 'bg-pink-100 text-pink-700',
  score: 'bg-amber-100 text-amber-800',
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
      <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${kindColor}`}>
        {kindLabel}
      </span>
      {row.missing.map(m => (
        <span
          key={m}
          className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${MISSING_COLOR[m]}`}
        >
          –{MISSING_LABEL[m]}
        </span>
      ))}
      {row.missing.length === 0 && (
        <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-green-700">
          ✓
        </span>
      )}
    </span>
  )
}

// Score pill — colored by tier
// `gated` rodo, kad chart/commercial/awards globally atjungti (SCORING_USE_WIKI_FACTORS=false)
// kol Wiki overlay neaplikuotas didžiajai daugumai INT atlikėjų. Tooltip
// aiškina, kad visų atlikėjų score'ai palyginami pagal tą pačią info.
function ScorePill({ score, gated }: { score: number | null; gated: boolean }) {
  if (score == null) {
    return <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[12px] font-bold text-gray-500">—</span>
  }
  const color = score >= 90 ? 'bg-yellow-100 text-yellow-800'
    : score >= 70 ? 'bg-emerald-100 text-emerald-800'
    : score >= 50 ? 'bg-blue-100 text-blue-700'
    : score >= 30 ? 'bg-gray-200 text-gray-700'
    : 'bg-gray-100 text-gray-500'
  return (
    <span
      title={gated
        ? 'Score: tik music.lt + YT views (Wiki chart/commercial/awards atjungti visiems iki Wiki batch užbaigimo)'
        : 'Score pilnas (Wiki factors enabled)'}
      className={`rounded px-1.5 py-0.5 text-[12px] font-bold tabular-nums ${color}`}
    >
      {Math.round(score)}{gated && <span className="ml-0.5 opacity-60">•</span>}
    </span>
  )
}

// Coverage badge — red if low, green if high, gray if no tracks
function CoverageBadge({
  label, pct, total, denom, lowThreshold = 50,
}: {
  label: string; pct: number; total: number; denom: number; lowThreshold?: number
}) {
  if (denom <= 0) {
    return (
      <span title={`${label}: nėra duomenų`} className="rounded bg-gray-100 px-1.5 py-0.5 text-[12px] font-bold text-gray-400">
        {label} —
      </span>
    )
  }
  const color = pct >= 80 ? 'bg-emerald-100 text-emerald-800'
    : pct >= lowThreshold ? 'bg-blue-100 text-blue-700'
    : pct >= 20 ? 'bg-amber-100 text-amber-800'
    : 'bg-red-100 text-red-700'
  return (
    <span
      title={`${label}: ${total} / ${denom} = ${pct.toFixed(1)}%`}
      className={`rounded px-1.5 py-0.5 text-[12px] font-bold tabular-nums ${color}`}
    >
      {label} {Math.round(pct)}%
    </span>
  )
}

// Image status: hero ✓/✗ + photo OK/legacy/small
function ImageStatus({ row }: { row: Row }) {
  const photoIcon = !row.image_url
    ? <span title="Nėra image_url" className="text-pink-600">○</span>
    : row.image_is_small
      ? <span title={`Mažas/sena foto${row.image_width ? ` (${row.image_width}px)` : ' (URL pattern)'}`} className="text-red-600">⚠</span>
      : <span title="OK" className="text-emerald-600">✓</span>
  const heroIcon = row.hero_done
    ? <span title="Hero OK" className="text-emerald-600">✓</span>
    : <span title="Nėra hero" className="text-purple-500">○</span>
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px]">
      <span title="Profile foto" className="inline-flex items-center gap-0.5">
        <span className="font-mono text-[11px] text-[var(--text-faint)]">P</span>{photoIcon}
      </span>
      <span title="Hero foto" className="inline-flex items-center gap-0.5">
        <span className="font-mono text-[11px] text-[var(--text-faint)]">H</span>{heroIcon}
      </span>
    </span>
  )
}

function CoverageSummary({ data, bucket }: { data: StatsResponse; bucket: Bucket }) {
  // Show LT and INTL coverage avgs — unknown bucket doesn't get its own avg
  const cov = bucket === 'lt' ? data.summary.coverage.lt
    : bucket === 'intl' ? data.summary.coverage.intl
    : null
  if (!cov || (cov.lyrics_pct === 0 && cov.yt_pct === 0 && cov.yt_views_pct === 0)) return null
  return (
    <div className="mb-3 inline-flex items-center gap-2 rounded-lg border border-[var(--input-border)] bg-[var(--bg-surface)] px-3 py-1.5 text-[13px]">
      <span className="text-[var(--text-muted)]">Vid. coverage:</span>
      <span title="Lyrics" className="inline-flex items-center gap-1">
        <span className="text-[var(--text-faint)]">Lyr</span>
        <strong className={cov.lyrics_pct >= 50 ? 'text-emerald-700' : 'text-red-700'}>
          {cov.lyrics_pct.toFixed(0)}%
        </strong>
      </span>
      <span title="YouTube videos" className="inline-flex items-center gap-1">
        <span className="text-[var(--text-faint)]">YT</span>
        <strong className={cov.yt_pct >= 50 ? 'text-emerald-700' : 'text-red-700'}>
          {cov.yt_pct.toFixed(0)}%
        </strong>
      </span>
      <span title="YT view counts pripildyti" className="inline-flex items-center gap-1">
        <span className="text-[var(--text-faint)]">Views</span>
        <strong className={cov.yt_views_pct >= 50 ? 'text-emerald-700' : 'text-red-700'}>
          {cov.yt_views_pct.toFixed(0)}%
        </strong>
      </span>
    </div>
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
          Galbūt dar neaplikuota migracija <code className="rounded bg-white px-1">20260521a_migration_dashboard_v3.sql</code>?
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
            <Link href="/admin" className="text-[14px] text-music-blue hover:underline">
              ← Admin dashboard
            </Link>
            <h1 className="mt-1 font-['Outfit',sans-serif] text-2xl font-extrabold text-[var(--text-primary)] sm:text-3xl">
              Migracijos progresas
            </h1>
            <p className="mt-1 text-[14.5px] text-[var(--text-muted)]">
              Click on bar / badge for filter; default rodo „pending" + sortinta pagal music.lt likes. Done = scrape + (INT: wiki) + hero + foto + score.
            </p>
          </div>
          <button
            onClick={load}
            disabled={reloading}
            className="text-[13.5px] text-music-blue hover:underline disabled:opacity-50"
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

            <CoverageSummary data={data} bucket={bucket} />

            {/* Wiki factors global state — informuoja, kad chart/commercial/awards
                atjungti, kol Wiki batch nepritaikytas didžiajai daliai INT atlikėjų. */}
            {!data.summary.wiki_factors_enabled && (
              <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-[14px] text-indigo-800">
                ℹ <strong>Wiki score components atjungti globaliai</strong> (chart, commercial, awards = 0 visiems).
                Score'ai = catalog + reach + popularity tik. PopBar/rankings web'e fair across all atlikėjus.
                Įjungimas: Vercel env <code className="rounded bg-white px-1">SCORING_USE_WIKI_FACTORS=true</code> po Wiki batch'o.
              </div>
            )}

            {/* Coverage / dup warnings */}
            {noPriorityData && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[14px] text-amber-800">
                ⚠ Prioritetinis sąrašas neturi <code className="rounded bg-white px-1">legacy_likes</code> duomenų.
                Paleisk <code className="rounded bg-white px-1">python3 scraper/quick_artist_stats.py</code> ant Mac'o,
                kad atlikėjai būtų išrūšiuoti pagal music.lt populiarumą.
              </div>
            )}
            {partialPriorityData && (
              <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[14px] text-blue-800">
                ℹ Priority signal coverage: {data.summary.stats_coverage.pct.toFixed(1)}% atlikėjų turi quick_stats.
                Paleisk dar kartą <code className="rounded bg-white px-1">quick_artist_stats.py</code>, kad pripildyti likusiems.
              </div>
            )}
            {data.summary.duplicates.unique_groups > 0 && (
              <div className="mb-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-[14px] text-orange-800">
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
                  className={`flex-1 rounded-md py-1.5 text-[13.5px] font-semibold transition-colors ${
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
            <div className="mb-2 flex items-baseline justify-between gap-2 px-1 text-[13.5px] text-[var(--text-muted)]">
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
                  {data.rows.map((p, i) => {
                    // Score is "gated" GLOBALLY kol SCORING_USE_WIKI_FACTORS=false
                    // (Edvardo intent 2026-05-21: rankings/topai web'e remiasi
                    // tik music.lt + YT views kol Wiki batch nepritaikytas
                    // didžiajai daugumai INT atlikėjų). Visi atlikėjai gauna `•`.
                    const scoreGated = !data.summary.wiki_factors_enabled
                    return (
                      <li key={p.id}>
                        <Link
                          href={`/admin/artists/${p.id}`}
                          className="block min-h-[44px] px-3 py-2 transition-colors hover:bg-[var(--bg-hover)]"
                        >
                          {/* Row line 1: number + name + legacy stats + missing badges */}
                          <div className="flex items-center gap-2">
                            <span className="w-8 shrink-0 text-right text-[13px] tabular-nums text-[var(--text-faint)]">
                              {offset + i + 1}.
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[var(--text-primary)]">
                              {p.name || `(be vardo) #${p.id}`}
                              {p.dup_count > 1 && (
                                <span className="ml-1.5 rounded-full bg-orange-100 px-1.5 py-0.5 text-[11px] font-bold text-orange-700">
                                  {p.dup_count}x
                                </span>
                              )}
                              {p.country && p.kind === 'intl' && (
                                <span className="ml-1.5 text-[12.5px] font-normal text-[var(--text-muted)]">
                                  · {p.country}
                                </span>
                              )}
                            </span>
                            {p.legacy_likes != null && p.legacy_likes > 0 && (
                              <span className="shrink-0 text-[13px] tabular-nums text-[var(--text-secondary)]">
                                ♥ {p.legacy_likes.toLocaleString('lt-LT')}
                              </span>
                            )}
                            {p.legacy_discussion_count != null && p.legacy_discussion_count > 0 && (
                              <span className="shrink-0 text-[13px] tabular-nums text-[var(--text-faint)]">
                                💬 {p.legacy_discussion_count}
                              </span>
                            )}
                            <MissingBadges row={p} />
                          </div>
                          {/* Row line 2: state pills (score + coverage + image) */}
                          <div className="ml-10 mt-1 flex flex-wrap items-center gap-1.5 text-[12px]">
                            <ScorePill score={p.score} gated={scoreGated} />
                            <CoverageBadge label="Lyr" pct={p.lyrics_pct} total={p.n_lyrics} denom={p.track_count} />
                            <CoverageBadge label="YT" pct={p.yt_pct} total={p.n_videos} denom={p.track_count} />
                            <CoverageBadge label="Views" pct={p.yt_views_pct} total={p.n_video_views_filled} denom={p.n_videos} />
                            <ImageStatus row={p} />
                            <span className="ml-auto text-[12px] tabular-nums text-[var(--text-faint)]">
                              {p.album_count}a · {p.track_count}t
                            </span>
                          </div>
                        </Link>
                      </li>
                    )
                  })}
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
