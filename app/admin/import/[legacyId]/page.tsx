'use client'

/**
 * /admin/import/[legacyId] — per-artist migration detail.
 *
 * Rodo:
 *   - Artist header
 *   - Import jobs history (wiki / scrape)
 *   - Albums list + source
 *   - Standalone tracks
 *   - Photos grid
 *   - Cross-check diff (kas tik Wiki, kas tik music.lt)
 *   - Quick actions: "Paleisti Wiki vėl", "Paleisti Scrape vėl"
 */

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

type ImportJob = {
  id: number
  job_type: 'wiki' | 'scrape' | 'populate'
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  requested_at: string
  started_at: string | null
  completed_at: string | null
  report: any
  error_message: string | null
  priority: number
}

type Album = {
  id: number
  legacy_id: number | null
  title: string
  year: number | null
  source: string | null
  cover_image_url: string | null
  type_studio?: boolean
  type_ep?: boolean
  type_single?: boolean
  type_live?: boolean
  type_compilation?: boolean
  type_remix?: boolean
  type_soundtrack?: boolean
}

function albumTypeLabel(a: Album): string {
  if (a.type_studio) return 'Studijinis'
  if (a.type_ep) return 'EP'
  if (a.type_single) return 'Singlas'
  if (a.type_live) return 'Gyvai'
  if (a.type_compilation) return 'Kompiliacija'
  if (a.type_remix) return 'Remix'
  if (a.type_soundtrack) return 'OST'
  return '—'
}

type Track = {
  id: number
  legacy_id: number | null
  title: string
  source: string | null
  release_year?: number | null
  // album_id: tracks neturi tokio column'o; album↔track many-to-many per
  // album_tracks junction. API serveryje nustatom standalone_tracks atskirai.
}

type Photo = {
  id: number
  url: string
  caption: string | null
  source_url: string | null
  photographer_id: number | null
  taken_at: string | null
  sort_order: number
}

type DetailData = {
  artist: any
  jobs: ImportJob[]
  albums: Album[]
  standalone_tracks: Track[]
  all_tracks?: Track[]  // Visi atlikėjo tracks (su album_id ir be) — naudojami cross-check'ui
  photos: Photo[]
  legacy_like_count: number  // pavadinimas paliktas backward-compat su API; vidiniai count'ai dabar ateina iš `likes` lentelės
}

export default function AdminImportDetailPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const raw = params?.legacyId
  const legacyId = Number(Array.isArray(raw) ? raw[0] : raw)

  const [data, setData] = useState<DetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/admin/import/artists/${legacyId}`)
      if (r.ok) setData(await r.json())
    } finally { setLoading(false) }
  }, [legacyId])

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/auth/signin'); return }
    if (status === 'authenticated' && !isAdmin) { router.push('/'); return }
    if (status === 'authenticated') load()
  }, [status, isAdmin, router, load])

  // Auto-refresh kai vyksta job
  useEffect(() => {
    if (!data) return
    const active = data.jobs.some(j => ['pending', 'running'].includes(j.status))
    if (!active) return
    const iv = setInterval(load, 5000)
    return () => clearInterval(iv)
  }, [data, load])

  const runJob = async (jobType: 'wiki' | 'scrape') => {
    setActionLoading(true); setActionMsg(null)
    try {
      const r = await fetch('/api/admin/import/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ legacy_ids: [legacyId], job_type: jobType }),
      })
      const j = await r.json()
      if (!r.ok) setActionMsg(`Klaida: ${j.error}`)
      else setActionMsg(`Sukurta ${j.created}, praleista ${j.skipped}`)
      setTimeout(load, 500)
    } finally { setActionLoading(false) }
  }

  // Per-row pending review actions — kviečiam tą patį API kaip
  // /admin/import/pending: PATCH = approve (set source='legacy_scrape'),
  // DELETE = reject (cascade trinant likes/comments). Po sėkmingo
  // operacijos reload'inam page'ą.
  const [pendingBusy, setPendingBusy] = useState<string | null>(null) // 'album:123' / 'track:456'
  const handlePending = useCallback(async (kind: 'album' | 'track', id: number, action: 'approve' | 'reject') => {
    if (action === 'reject') {
      const ok = confirm(
        `Atmesti šį ${kind === 'album' ? 'albumą' : 'dainą'}?\n\n` +
        'Visi music.lt likes ir komentarai bus ištrinti negrąžinamai.'
      )
      if (!ok) return
    }
    const key = `${kind}:${id}`
    setPendingBusy(key)
    setActionMsg(null)
    try {
      const r = await fetch(`/api/admin/import/pending/${kind}/${id}`, {
        method: action === 'approve' ? 'PATCH' : 'DELETE',
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        setActionMsg(`Klaida: ${j.error || r.statusText}`)
      } else {
        await load()
      }
    } finally {
      setPendingBusy(null)
    }
  }, [load])

  if (status === 'loading' || !isAdmin) return null

  if (loading && !data) return (
    <div className="min-h-screen bg-[var(--bg-elevated)] p-6">
      <div className="text-[var(--text-muted)]">Kraunama...</div>
    </div>
  )

  if (!data) return (
    <div className="min-h-screen bg-[var(--bg-elevated)] p-6">
      <div className="text-red-600">Atlikėjas nerastas</div>
    </div>
  )

  const { artist, jobs, albums, standalone_tracks, photos, legacy_like_count } = data
  const allTracks = data.all_tracks ?? standalone_tracks  // backward-compat jei API nepatraukė

  // Cross-check: album'ai grupuojami per match status:
  //   bothAlbums    — Wiki įrašas su legacy_id (overlay match'as su music.lt)
  //                   ARBA legacy `legacy+wikipedia` source (LT atlikėjams)
  //   wikiAlbums    — Wiki įrašas BE legacy_id (Wiki turi, music.lt nematė)
  //   legacyAlbums  — source='legacy_scrape_pending' (music.lt turi, Wiki ne;
  //                   pending review per /admin/import/pending) ARBA pure
  //                   legacy LT scrape'as (legacy_scrape_v1)
  const bothAlbums = albums.filter(a =>
    (a.legacy_id != null && a.source !== 'legacy_scrape_pending')
    || a.source === 'legacy+wikipedia' || a.source === 'wikipedia+legacy'
  )
  const wikiAlbums = albums.filter(a =>
    a.legacy_id == null
    && (a.source === 'wikipedia' || (a.source || '').startsWith('wiki'))
  )
  const legacyAlbums = albums.filter(a =>
    a.source === 'legacy_scrape_v1' || a.source === 'legacy_scrape_pending'
  )
  const pendingAlbums = albums.filter(a => a.source === 'legacy_scrape_pending')

  // Tracks cross-check — ta pati logika kaip albums'ams.
  const bothTracks = allTracks.filter(t =>
    (t.legacy_id != null && t.source !== 'legacy_scrape_pending')
    || t.source === 'legacy+wikipedia' || t.source === 'wikipedia+legacy'
  )
  const wikiTracks = allTracks.filter(t =>
    t.legacy_id == null
    && (t.source === 'wikipedia' || (t.source || '').startsWith('wiki'))
  )
  const legacyTracks = allTracks.filter(t =>
    t.source === 'legacy_scrape_v1' || t.source === 'legacy_scrape_pending'
  )
  const pendingTracks = allTracks.filter(t => t.source === 'legacy_scrape_pending')

  const totalPending = pendingAlbums.length + pendingTracks.length

  const lastWiki = jobs.find(j => j.job_type === 'wiki' && j.status === 'completed')
  const lastScrape = jobs.find(j => j.job_type === 'scrape' && j.status === 'completed')

  return (
    <div className="min-h-screen bg-[var(--bg-elevated)]">
      <div className="w-full px-6 py-6 max-w-[1400px] mx-auto">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Link href="/admin/import" className="text-sm text-music-blue hover:underline">← Visi atlikėjai</Link>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              {artist.cover_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={artist.cover_image_url} alt="" className="w-20 h-20 rounded-xl object-cover" />
              ) : (
                <div className="w-20 h-20 rounded-xl bg-[var(--bg-surface)] flex items-center justify-center text-3xl">
                  {artist.name?.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold text-[var(--text-primary)]">{artist.name}</h1>
                <div className="text-sm text-[var(--text-muted)] flex gap-3">
                  <span>ID: <span className="font-mono">{artist.legacy_id}</span></span>
                  <span>Slug: <span className="font-mono">{artist.slug}</span></span>
                  {artist.country && <span>Šalis: {artist.country}</span>}
                </div>
                {artist.source_url && (
                  <a href={artist.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-music-blue hover:underline">
                    music.lt original →
                  </a>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => runJob('wiki')}
                disabled={actionLoading}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >📘 Paleisti Wiki</button>
              <button
                onClick={() => runJob('scrape')}
                disabled={actionLoading}
                className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >🌐 Paleisti Scrape</button>
            </div>
          </div>
          {actionMsg && (
            <div className="mt-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
              {actionMsg}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <SmallStat label="Albumai" value={albums.length} />
          <SmallStat label="Dainos (standalone)" value={standalone_tracks.length} />
          <SmallStat label="Nuotraukos" value={photos.length} />
          <SmallStat label="Legacy likes" value={legacy_like_count} />
        </div>

        {/* Pending review banner — kai music.lt'as turi įrašų, kurių Wiki
            neturėjo, juos sukuriam su source='legacy_scrape_pending' ir
            admin'as turi patvirtinti per /admin/import/pending. Banner'is
            rodomas tik kai yra ką patvirtinti. */}
        {totalPending > 0 && (
          <Link
            href={`/admin/import/pending?artist=${legacyId}`}
            className="mb-6 flex items-center gap-3 rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 transition-colors hover:bg-orange-100"
          >
            <span className="text-2xl">⏳</span>
            <div className="flex-1">
              <div className="font-semibold text-orange-900">
                {totalPending} pending review {totalPending === 1 ? 'įrašas' : 'įrašai'}
                {pendingAlbums.length > 0 && pendingTracks.length > 0 && (
                  <span className="ml-2 text-xs font-normal opacity-70">
                    ({pendingAlbums.length} albumai, {pendingTracks.length} dainos)
                  </span>
                )}
              </div>
              <div className="text-xs text-orange-700">
                Music.lt turi šių įrašų, bet Wiki canonical neturėjo —
                spauskite, kad peržiūrėtum ir patvirtintum (Approve) arba
                atmestumi (Reject). Veiksmai taip pat prieinami inline cross-check kortelėse.
              </div>
            </div>
            <span className="text-orange-700">→</span>
          </Link>
        )}

        {/* Jobs history */}
        <Section title="Import job istorija">
          {jobs.length === 0 ? (
            <div className="text-sm text-[var(--text-muted)]">Job'ų dar nebuvo.</div>
          ) : (
            <div className="space-y-2">
              {jobs.map(j => <JobRow key={j.id} job={j} />)}
            </div>
          )}
        </Section>

        {/* Wiki report */}
        {lastWiki && (
          <Section title="Paskutinis Wiki importo report'as">
            <ReportBlock report={lastWiki.report} completedAt={lastWiki.completed_at} />
          </Section>
        )}

        {/* Scrape report */}
        {lastScrape && (
          <Section title="Paskutinis Scrape report'as">
            <ReportBlock report={lastScrape.report} completedAt={lastScrape.completed_at} />
          </Section>
        )}

        {/* Cross-check albums */}
        <Section title={`Albumų cross-check (${albums.length})`}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <DiffColumn
              title="🟢 Abiejose"
              color="green"
              items={bothAlbums.map(a => ({
                id: a.id,
                title: a.title,
                meta: `${albumTypeLabel(a)} ${a.year ?? ''}`.trim(),
              }))}
            />
            <DiffColumn
              title="📘 Tik Wiki"
              color="blue"
              items={wikiAlbums.map(a => ({
                id: a.id,
                title: a.title,
                meta: `${albumTypeLabel(a)} ${a.year ?? ''}`.trim(),
              }))}
            />
            <DiffColumn
              title="🌐 Tik music.lt"
              color="purple"
              items={legacyAlbums.map(a => ({
                id: a.id,
                title: a.title,
                meta: `${albumTypeLabel(a)} ${a.year ?? ''}`.trim(),
                // Approve/Reject mygtukai matomi tik kai įrašas yra pending —
                // legacy_scrape_v1 (jau patvirtintas LT scrape) jų nereikia.
                pending: a.source === 'legacy_scrape_pending',
              }))}
              onApprove={id => handlePending('album', id, 'approve')}
              onReject={id => handlePending('album', id, 'reject')}
              busyKey={pendingBusy}
              kind="album"
            />
          </div>
          {albums.length === 0 && (
            <div className="text-sm text-[var(--text-muted)]">Albumų dar nėra. Paleisk Wiki arba Scrape importą.</div>
          )}
        </Section>

        {/* Cross-check tracks — ta pati logika kaip albums'ams. Tracks gauname
            iš `all_tracks` (visi atlikėjo tracks, ne tik standalone), kad
            galėtume rodyti TIK MUSIC.LT pending overlay tracks net jei jie
            priskirti albumo'ams. */}
        {allTracks.length > 0 && (
          <Section title={`Dainų cross-check (${allTracks.length})`}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <DiffColumn
                title="🟢 Abiejose"
                color="green"
                items={bothTracks.map(t => ({
                  id: t.id,
                  title: t.title,
                  meta: t.release_year ? String(t.release_year) : '—',
                }))}
              />
              <DiffColumn
                title="📘 Tik Wiki"
                color="blue"
                items={wikiTracks.map(t => ({
                  id: t.id,
                  title: t.title,
                  meta: t.release_year ? String(t.release_year) : '—',
                }))}
              />
              <DiffColumn
                title="🌐 Tik music.lt"
                color="purple"
                items={legacyTracks.map(t => ({
                  id: t.id,
                  title: t.title,
                  meta: t.release_year ? String(t.release_year) : '—',
                  pending: t.source === 'legacy_scrape_pending',
                }))}
                onApprove={id => handlePending('track', id, 'approve')}
                onReject={id => handlePending('track', id, 'reject')}
                busyKey={pendingBusy}
                kind="track"
              />
            </div>
          </Section>
        )}

        {/* Standalone tracks */}
        {standalone_tracks.length > 0 && (
          <Section title={`Dainos be albumo (${standalone_tracks.length})`}>
            <div className="bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[var(--bg-elevated)] text-xs uppercase text-[var(--text-muted)]">
                  <tr>
                    <th className="px-3 py-2 text-left">Pavadinimas</th>
                    <th className="px-3 py-2 text-right">Metai</th>
                    <th className="px-3 py-2 text-right">Šaltinis</th>
                  </tr>
                </thead>
                <tbody>
                  {standalone_tracks.slice(0, 100).map(t => (
                    <tr key={t.id} className="border-t border-[var(--border-subtle)]">
                      <td className="px-3 py-1.5">{t.title}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{t.release_year ?? '—'}</td>
                      <td className="px-3 py-1.5 text-right text-xs text-[var(--text-muted)]">{t.source || '?'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* Photos */}
        {photos.length > 0 && (
          <Section title={`Nuotraukos (${photos.length})`}>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {photos.map(p => (
                <a key={p.id} href={p.source_url || p.url} target="_blank" rel="noopener noreferrer" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.caption || ''} className="w-full aspect-square object-cover rounded-lg hover:opacity-80" />
                  {p.caption && <div className="mt-1 text-[10px] text-[var(--text-muted)] truncate">{p.caption}</div>}
                </a>
              ))}
            </div>
          </Section>
        )}

      </div>
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">{title}</h2>
      {children}
    </div>
  )
}

function SmallStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-xl p-3">
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div className="text-xl font-bold tabular-nums text-[var(--text-primary)]">{value.toLocaleString('lt')}</div>
    </div>
  )
}

function JobRow({ job }: { job: ImportJob }) {
  const typeIcon = job.job_type === 'wiki' ? '📘' : job.job_type === 'scrape' ? '🌐' : '🔍'
  const statusColor = {
    pending: 'yellow', running: 'blue', completed: 'green', failed: 'red', cancelled: 'gray',
  }[job.status]
  return (
    <div className="flex items-center gap-3 p-3 bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-lg">
      <span className="text-xl">{typeIcon}</span>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm text-[var(--text-primary)]">
          {job.job_type === 'wiki' ? 'Wikipedia' : job.job_type === 'scrape' ? 'music.lt scrape' : 'populate'}
          <span className={`ml-2 px-2 py-0.5 text-[10px] rounded-full bg-${statusColor}-100 text-${statusColor}-700`}>
            {job.status}
          </span>
        </div>
        <div className="text-xs text-[var(--text-muted)]">
          Užprašyta: {new Date(job.requested_at).toLocaleString('lt')}
          {job.completed_at && ` · Baigta: ${new Date(job.completed_at).toLocaleString('lt')}`}
        </div>
        {job.error_message && (
          <div className="text-xs text-red-600 mt-1">Klaida: {job.error_message}</div>
        )}
      </div>
    </div>
  )
}

/** Report'o struktūra (scrape worker'io output'as):
 *   { albums, tracks, likes_artist, forum_threads, duration_sec, last_lines,
 *     yt_enrich: { ok, foundNew, skipped, viewsUpdated, errors, ... } | { ok:false, status, body }
 *     score_recalc: { ok, artist_score, albums_scored, tracks_scored } | { ok:false, ... }
 *   }
 *
 * Wiki worker — kitokia struktūra (artist updated, albums/tracks inserted, photos count).
 * Universalus render'is: žinomus keys atvaizduoja struktūruotai, likusius
 * generic'ai (su json snippet'ų expandable).
 */
function ReportBlock({ report, completedAt }: { report: any; completedAt: string | null }) {
  if (!report) return <div className="text-sm text-[var(--text-muted)]">Reporto nėra</div>

  // Numeric scrape counts — pagrindinė info iš subprocess'o po scrape'o.
  const numericKeys = ['albums', 'tracks', 'likes_artist', 'likes_album', 'likes_track',
                       'forum_threads', 'news_threads', 'duration_sec', 'photos_added',
                       'tracks_inserted', 'albums_inserted']
  const numericStats = numericKeys
    .filter(k => typeof report[k] === 'number')
    .map(k => ({ k, v: report[k] as number }))

  return (
    <div className="space-y-3">
      <div className="text-xs text-[var(--text-muted)]">
        Baigta: {completedAt ? new Date(completedAt).toLocaleString('lt') : '—'}
      </div>

      {/* Numeric stats grid */}
      {numericStats.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {numericStats.map(({ k, v }) => (
            <div key={k} className="p-2 bg-[var(--bg-elevated)] rounded border border-[var(--input-border)]">
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">{k.replace(/_/g, ' ')}</div>
              <div className="text-base font-bold tabular-nums text-[var(--text-primary)]">
                {k === 'duration_sec' ? `${v.toFixed(0)}s` : v.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* YT enrich card */}
      {report.yt_enrich && <YtEnrichCard data={report.yt_enrich} />}

      {/* Score recalc card */}
      {report.score_recalc && <ScoreRecalcCard data={report.score_recalc} />}

      {/* last_lines — raw subprocess output */}
      {typeof report.last_lines === 'string' && report.last_lines.trim() && (
        <details className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--input-border)]">
          <summary className="px-3 py-2 text-xs font-semibold text-[var(--text-muted)] cursor-pointer">
            Raw scraper output (last lines)
          </summary>
          <pre className="px-3 pb-3 text-[11px] font-mono whitespace-pre-wrap break-words text-[var(--text-secondary)]">
            {report.last_lines}
          </pre>
        </details>
      )}
    </div>
  )
}

function YtEnrichCard({ data }: { data: any }) {
  if (data?.skipped) {
    return (
      <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-sm">
        <div className="font-semibold text-stone-700 mb-1">▶ YouTube enrich praleista</div>
        <div className="text-xs text-stone-600">{data.reason || 'unknown'}</div>
      </div>
    )
  }
  if (data?.ok === false) {
    return (
      <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm">
        <div className="font-semibold text-red-700 mb-1">▶ YouTube enrich KLAIDA</div>
        <div className="text-xs text-red-600">
          {data.status ? `HTTP ${data.status}: ` : ''}{data.body || data.exception || 'unknown'}
        </div>
        {data.status === 401 && (
          <div className="mt-2 text-[11px] text-red-700 bg-red-100 px-2 py-1 rounded">
            Tikriausiai INTERNAL_API_SECRET nesutampa tarp Vercel ir Mac worker'io. Patikrink Vercel env vars.
          </div>
        )}
      </div>
    )
  }
  return (
    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
      <div className="text-sm font-semibold text-rose-800 mb-2">▶ YouTube enrich</div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <YtMini label="Iš viso" value={data.totalTracks} />
        <YtMini label="Apdorota" value={data.processed} />
        <YtMini label="Rasta naujų" value={data.foundNew} tone="green" />
        <YtMini label="Praleista" value={data.skipped} tone="amber" />
        <YtMini label="Views update" value={data.viewsUpdated} tone="blue" />
      </div>
      {data.errors > 0 && (
        <div className="mt-2 text-xs text-red-700">⚠ {data.errors} klaidos track'uose</div>
      )}
    </div>
  )
}

function ScoreRecalcCard({ data }: { data: any }) {
  if (data?.skipped) {
    return (
      <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-sm">
        <div className="font-semibold text-stone-700 mb-1">↻ Score recalc praleistas</div>
        <div className="text-xs text-stone-600">{data.reason || 'unknown'}</div>
      </div>
    )
  }
  if (data?.ok === false) {
    return (
      <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm">
        <div className="font-semibold text-red-700 mb-1">↻ Score recalc KLAIDA</div>
        <div className="text-xs text-red-600">
          {data.status ? `HTTP ${data.status}: ` : ''}{data.body || data.exception || 'unknown'}
        </div>
      </div>
    )
  }
  return (
    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
      <div className="text-sm font-semibold text-amber-800 mb-2">↻ Score recalc</div>
      <div className="grid grid-cols-3 gap-2">
        <YtMini label="Artist score" value={data.artist_score} tone="amber" />
        <YtMini label="Albumai" value={data.albums_scored} tone="amber" />
        <YtMini label="Track'ai" value={data.tracks_scored} tone="amber" />
      </div>
    </div>
  )
}

function YtMini({ label, value, tone }: { label: string; value: number | undefined; tone?: 'green' | 'amber' | 'blue' }) {
  const v = value ?? 0
  const cls = tone === 'green' ? 'text-green-700'
            : tone === 'amber' ? 'text-amber-700'
            : tone === 'blue'  ? 'text-blue-700'
            : 'text-[var(--text-primary)]'
  return (
    <div className="bg-white border border-[var(--input-border)] rounded p-2">
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">{label}</div>
      <div className={`text-base font-bold tabular-nums ${cls}`}>{v.toLocaleString()}</div>
    </div>
  )
}

function DiffColumn({ title, color, items, onApprove, onReject, busyKey, kind }: {
  title: string; color: 'green' | 'blue' | 'purple'
  // `pending` flag valdo, ar rodyti per-row Approve/Reject mygtukus.
  // Tik legacy_scrape_pending įrašai laukia patvirtinimo; legacy_scrape_v1
  // (LT scrape patvirtintas) tų mygtukų nerodom — sąrašas tas pats column'as
  // tik mygtukai sąlyginiai.
  items: Array<{ id: number; title: string; meta: string; pending?: boolean }>
  onApprove?: (id: number) => void | Promise<void>
  onReject?: (id: number) => void | Promise<void>
  busyKey?: string | null  // 'album:123' / 'track:456' formate
  kind?: 'album' | 'track'
}) {
  const colorClass = {
    green: 'border-green-300 bg-green-50',
    blue: 'border-blue-300 bg-blue-50',
    purple: 'border-purple-300 bg-purple-50',
  }[color]
  return (
    <div className={`border rounded-xl p-3 ${colorClass}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold uppercase text-gray-700">{title}</div>
        <div className="text-xs font-mono text-gray-500">{items.length}</div>
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-gray-500 italic">—</div>
      ) : (
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {items.map(it => {
            const showActions = it.pending && (onApprove || onReject) && kind
            const myKey = kind ? `${kind}:${it.id}` : ''
            const isBusy = busyKey === myKey
            return (
              <div key={it.id} className="text-xs bg-white rounded px-2 py-1.5 border border-gray-200">
                <div className="font-medium text-gray-800 truncate">{it.title}</div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <div className="text-[10px] text-gray-500 truncate">{it.meta}</div>
                  {showActions && (
                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onApprove?.(it.id)}
                        disabled={isBusy}
                        title="Patvirtinti — taps matomas viešai"
                        className="rounded bg-green-600 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-green-700 disabled:opacity-40"
                      >
                        {isBusy ? '…' : '✓'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onReject?.(it.id)}
                        disabled={isBusy}
                        title="Atmesti — ištrinti įrašą + likes/komentarus"
                        className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-red-700 disabled:opacity-40"
                      >
                        {isBusy ? '…' : '✕'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function fmtDur(s: number | null): string {
  if (!s) return '—'
  const m = Math.floor(s / 60); const ss = s % 60
  return `${m}:${String(ss).padStart(2, '0')}`
}
