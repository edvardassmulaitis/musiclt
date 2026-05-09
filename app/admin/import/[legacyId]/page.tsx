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
  duration_seconds: number | null
  source: string | null
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

  // Cross-check: album'ai grupuojami pagal source
  const wikiAlbums = albums.filter(a => a.source === 'wikipedia' || (a.source || '').startsWith('wiki'))
  const legacyAlbums = albums.filter(a => a.source === 'legacy_scrape_v1')
  const bothAlbums = albums.filter(a => a.source === 'legacy+wikipedia' || a.source === 'wikipedia+legacy')

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
              }))}
            />
          </div>
          {albums.length === 0 && (
            <div className="text-sm text-[var(--text-muted)]">Albumų dar nėra. Paleisk Wiki arba Scrape importą.</div>
          )}
        </Section>

        {/* Standalone tracks */}
        {standalone_tracks.length > 0 && (
          <Section title={`Dainos be albumo (${standalone_tracks.length})`}>
            <div className="bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[var(--bg-elevated)] text-xs uppercase text-[var(--text-muted)]">
                  <tr>
                    <th className="px-3 py-2 text-left">Pavadinimas</th>
                    <th className="px-3 py-2 text-right">Trukmė</th>
                    <th className="px-3 py-2 text-right">Šaltinis</th>
                  </tr>
                </thead>
                <tbody>
                  {standalone_tracks.slice(0, 100).map(t => (
                    <tr key={t.id} className="border-t border-[var(--border-subtle)]">
                      <td className="px-3 py-1.5">{t.title}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmtDur(t.duration_seconds)}</td>
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

function ReportBlock({ report, completedAt }: { report: any; completedAt: string | null }) {
  if (!report) return <div className="text-sm text-[var(--text-muted)]">Reporto nėra</div>

  const entries = Object.entries(report).filter(([, v]) => v !== null && v !== undefined)
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-xl p-4">
      <div className="text-xs text-[var(--text-muted)] mb-2">
        Baigta: {completedAt ? new Date(completedAt).toLocaleString('lt') : '—'}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {entries.map(([k, v]) => (
          <div key={k} className="p-2 bg-[var(--bg-elevated)] rounded">
            <div className="text-[10px] text-[var(--text-muted)] uppercase">{k}</div>
            <div className="text-sm font-semibold text-[var(--text-primary)] truncate" title={String(v)}>
              {typeof v === 'object' ? JSON.stringify(v) : String(v)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DiffColumn({ title, color, items }: {
  title: string; color: 'green' | 'blue' | 'purple'
  items: Array<{ id: number; title: string; meta: string }>
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
          {items.map(it => (
            <div key={it.id} className="text-xs bg-white rounded px-2 py-1 border border-gray-200">
              <div className="font-medium text-gray-800 truncate">{it.title}</div>
              <div className="text-[10px] text-gray-500">{it.meta}</div>
            </div>
          ))}
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
