'use client'

import React, { useState, useEffect, use, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { IcoTrash, IcoCheck, IcoX, IcoAlert, IcoSearch, IcoImage, IcoInfo, IcoText, IcoBack, IcoFolder, IcoYouTube, IcoSpotify } from '@/components/ui/Icons'
import ArtistSearchInput from '@/components/ui/ArtistSearchInput'
import DateNumberInput from '@/components/ui/DateNumberInput'
import YouTubeSearch from '@/components/ui/YouTubeSearch'
import DescriptionEditor from '@/components/ui/DescriptionEditor'
import { extractYouTubeId } from '@/components/ui/helpers'

const TRACK_TYPES = ['normal', 'remix', 'live', 'mashup', 'instrumental'] as const
const TRACK_TYPE_DEFS: Record<string, { label: string; icon: React.ReactNode }> = {
  normal:       { label: 'Įprastinė', icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" /></svg> },
  single:       { label: 'Singlas',   icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth={2}/><circle cx="12" cy="12" r="2" strokeWidth={2}/></svg> },
  remix:        { label: 'Remix',     icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> },
  live:         { label: 'Gyva',      icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V5l3 3 3-3v14" /><path strokeLinecap="round" strokeWidth={2} d="M3 12h2m14 0h2"/></svg> },
  mashup:       { label: 'Mashup',    icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg> },
  instrumental: { label: 'Instr.',    icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" /><line x1="4" y1="4" x2="20" y2="20" strokeWidth={2} strokeLinecap="round"/></svg> },
}

type FeaturingArtist = { artist_id: number; name: string }
type AlbumRef = { album_id: number; album_title: string; album_year: number | null; position: number; cover_url?: string | null }
type YTResult = { videoId: string; title: string; channel: string; thumbnail: string }
type LyricsTab = 'lyrics' | 'chords'

function CoverMini({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [urlInput, setUrlInput] = useState(value || '')
  useEffect(() => setUrlInput(value || ''), [value])

  const upload = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('type', 'track')
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.url) { onChange(data.url); setUrlInput(data.url) }
    } finally { setUploading(false) }
  }

  const commitUrl = async (raw: string) => {
    const v = raw.trim()
    if (!v || v === value) return
    if (v.startsWith('http') && !v.includes('supabase')) {
      setUploading(true)
      try {
        const res = await fetch('/api/fetch-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: v }) })
        if (res.ok) { const d = await res.json(); if (d.url && !d.url.startsWith('data:')) { onChange(d.url); setUrlInput(d.url); return } }
      } catch {} finally { setUploading(false) }
    }
    onChange(v)
  }

  return (
    <div className="space-y-1.5">
      {value ? (
        <div className="relative rounded-lg overflow-hidden group cursor-pointer"
          onClick={() => !uploading && fileRef.current?.click()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) upload(f) }}
          onDragOver={e => e.preventDefault()}>
          <img src={value} alt="" referrerPolicy="no-referrer"
            className="w-full object-contain bg-[var(--bg-body)] group-hover:opacity-90 transition-opacity" style={{ height: '160px' }} />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span className="text-white text-sm font-medium">Keisti ↗</span>
          </div>
          {uploading && <div className="absolute inset-0 bg-[var(--bg-surface)]/80 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>}
        </div>
      ) : (
        <div className="relative w-full rounded-lg border-2 border-dashed border-[var(--input-border)] bg-[var(--bg-elevated)] cursor-pointer hover:border-blue-400 transition-colors flex items-center justify-center" style={{ height: '160px' }}
          onClick={() => !uploading && fileRef.current?.click()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) upload(f) }}
          onDragOver={e => e.preventDefault()}>
          <div className="text-center text-[var(--text-muted)]">
            <IcoImage />
            <span className="text-xs block mt-1">Įkelti viršelį</span>
          </div>
          {uploading && <div className="absolute inset-0 bg-[var(--bg-surface)]/80 flex items-center justify-center rounded-lg">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>}
        </div>
      )}
      <div className="flex gap-1.5">
        <input type="text" value={urlInput} onChange={e => setUrlInput(e.target.value)}
          onBlur={e => commitUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && commitUrl(urlInput)}
          placeholder="https://..." className="flex-1 min-w-0 px-2 py-1.5 border border-[var(--input-border)] rounded-lg text-xs text-[var(--text-secondary)] focus:outline-none focus:border-blue-400 bg-[var(--bg-surface)]" />
        <button type="button" onClick={() => fileRef.current?.click()}
          className="p-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--bg-active)] text-[var(--text-secondary)] rounded-lg transition-colors shrink-0"><IcoFolder /></button>
        {value && <button type="button" onClick={() => { onChange(''); setUrlInput('') }}
          className="p-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg transition-colors shrink-0"><IcoX /></button>}
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }} />
    </div>
  )
}

// ── TrackStats card ─────────────────────────────────────────────────────────
// Sukrauta info iš /api/admin/tracks/[id]/stats — viskas, ką žinome apie
// dainą: views (su sparkline iš history), score breakdown, engagement
// (likes/comments/plays/top/votes), timestamp'ai, identifiers. Tikslas —
// ką nors netaisius, admin'as iškart mato visus skaičius.
type StatsData = {
  ok: true
  trackId: number
  legacyId: number | null
  slug: string | null
  source: string | null
  sourceUrl: string | null
  views: {
    uploaded_at?: string | null
    current: number | null
    checked_at: string | null
    embeddable: boolean | null
    history: Array<{ captured_at: string; views: number; video_id: string | null }>
  }
  pageViews: number | null  // null = migracija neaplikuota
  score: { value: number | null; breakdown: any | null; updated_at: string | null }
  engagement: { likes: number; comments: number; plays: number; votes: number }
  chartPerformance: {
    weeks_total: number
    peak_position: number | null
    weeks_at_1: number
    weeks_top10: number
    chart_score: number
  }
  timestamps: { created_at: string | null; imported_at: string | null; updated_at: string | null; score_updated_at: string | null }
}

function fmtN(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  if (n < 1000) return String(n)
  if (n < 1_000_000) return (n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '') + 'K'
  if (n < 1_000_000_000) return (n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0).replace(/\.0$/, '') + 'M'
  return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B'
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString('lt-LT', { dateStyle: 'short', timeStyle: 'short' }) } catch { return iso.slice(0, 16) }
}

function ViewsSparkline({ history, currentVideoId }: { history: StatsData['views']['history']; currentVideoId?: string | null }) {
  // Filtruojam tik dabartinio video_id snapshot'us — kitaip pakeitus
  // YouTube nuorodą ir paėmus naują views (28K), delta su senu video
  // (81M) rodys -81M „kritimą", kuris yra fake. Skaičiuojam delta tik
  // tarp tos pačios YouTube video skirtingų snapshot'ų.
  const relevantHistory = currentVideoId
    ? history.filter(h => h.video_id === currentVideoId)
    : history
  if (!relevantHistory || relevantHistory.length < 2) {
    return <span className="text-[10px] text-[var(--text-faint)]">{relevantHistory.length === 1 ? '1 snapshot — nepakanka trend\'ui' : '—'}</span>
  }
  const W = 120, H = 28, P = 2
  const xs = relevantHistory.map(h => new Date(h.captured_at).getTime())
  const ys = relevantHistory.map(h => h.views)
  const xMin = Math.min(...xs), xMax = Math.max(...xs)
  const yMin = Math.min(...ys), yMax = Math.max(...ys)
  const xR = xMax - xMin || 1
  const yR = yMax - yMin || 1
  const pts = relevantHistory.map((h, i) => {
    const x = P + ((xs[i] - xMin) / xR) * (W - 2 * P)
    const y = (H - P) - ((ys[i] - yMin) / yR) * (H - 2 * P)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const delta = ys[ys.length - 1] - ys[0]
  return (
    <div className="flex items-center gap-1.5">
      <svg width={W} height={H} className="block">
        <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-blue-500" />
      </svg>
      <span className={`text-[10px] tabular-nums ${delta >= 0 ? 'text-green-600' : 'text-red-500'}`} title={`Δ nuo pirmo snapshot'o (tik dabartinis video_id)`}>
        {delta >= 0 ? '+' : ''}{fmtN(delta)}
      </span>
    </div>
  )
}

function StatsCard({ trackId }: { trackId: number }) {
  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showBreakdown, setShowBreakdown] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await fetch(`/api/admin/tracks/${trackId}/stats`, { cache: 'no-store' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'fail')
      setData(j as StatsData)
    } catch (e: any) {
      setError(e.message || 'fail')
    } finally {
      setLoading(false)
    }
  }, [trackId])

  useEffect(() => { refresh() }, [refresh])

  if (loading && !data) {
    return (
      <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] shadow-sm p-3 flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <span className="inline-block w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
        Kraunama statistika…
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] shadow-sm p-3 text-xs text-red-500">
        Statistikos klaida: {error || 'no data'}
      </div>
    )
  }

  const v = data.views
  const e = data.engagement
  const s = data.score

  return (
    <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] shadow-sm overflow-hidden">
      <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex items-center gap-1.5">
        <span className="text-xs font-bold text-[var(--text-secondary)]">Statistika</span>
        <span className="text-[10px] text-[var(--text-faint)]">paskutinis enrich {fmtDate(v.checked_at)}</span>
        <button type="button" onClick={refresh} disabled={loading}
          className="ml-auto text-[10px] text-blue-500 hover:underline disabled:opacity-50">
          {loading ? '…' : '↻ atnaujinti'}
        </button>
      </div>

      {/* YouTube Views + Page Views */}
      <div className="px-3 py-2 border-b border-[var(--border-subtle)] grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] uppercase tracking-wide font-semibold text-[var(--text-muted)]">YT Views</span>
            {v.embeddable === false && <span className="text-[9px] text-red-600 bg-red-50 border border-red-100 px-1 rounded">embed off</span>}
            {v.embeddable === true && <span className="text-[9px] text-green-700 bg-green-50 border border-green-100 px-1 rounded">embed ok</span>}
          </div>
          <div className="text-lg font-bold text-[var(--text-primary)] tabular-nums leading-tight" title={v.current?.toString() || ''}>
            {v.current != null ? v.current.toLocaleString('lt-LT') : '—'}
          </div>
          {/* YT upload date + views/day rate */}
          {v.uploaded_at && v.current ? (() => {
            const d = new Date(v.uploaded_at)
            const days = Math.max(1, Math.round((Date.now() - d.getTime()) / 86400000))
            const perDay = Math.round(v.current / days)
            return (
              <div className="text-[10px] text-[var(--text-muted)] tabular-nums">
                Įkelta {d.toLocaleDateString('lt-LT')} · ≈ {perDay.toLocaleString('lt-LT')} peržiūrų/d ({days} d.)
              </div>
            )
          })() : v.uploaded_at ? (
            <div className="text-[10px] text-[var(--text-muted)]">Įkelta {new Date(v.uploaded_at).toLocaleDateString('lt-LT')}</div>
          ) : null}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-[var(--text-faint)]">{v.history.length} snapshot'as{v.history.length === 1 ? '' : 'ai'}</span>
            {/* Filtruojam tik dabartinio video_id snapshot'us — paskutinė
                history entry priklauso current video'ai (enrichTrack visada
                įrašo naują eilutę su nauju videoId po URL pakeitimo). */}
            <ViewsSparkline
              history={v.history}
              currentVideoId={v.history.length > 0 ? v.history[v.history.length - 1].video_id : null}
            />
          </div>
        </div>
        <div className="min-w-0 border-l border-[var(--border-subtle)] pl-3">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] uppercase tracking-wide font-semibold text-[var(--text-muted)]" title="Kiek kartų atidarytas /lt/daina/{slug} puslapis (nuo migracijos taikymo). 30 min dedup'as cookie'iu, kad refresh nedubliuotų.">Page views</span>
          </div>
          <div className="text-lg font-bold text-[var(--text-primary)] tabular-nums leading-tight">
            {data.pageViews == null ? <span className="text-[var(--text-faint)] text-sm">—</span> : data.pageViews.toLocaleString('lt-LT')}
          </div>
          <div className="text-[10px] text-[var(--text-faint)]">
            {data.pageViews == null ? 'migracija neaplikuota' : 'unique sessions/30min'}
          </div>
        </div>
      </div>

      {/* Score */}
      <div className="px-3 py-2 border-b border-[var(--border-subtle)]">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[10px] uppercase tracking-wide font-semibold text-[var(--text-muted)]">Score</span>
          <span className="text-lg font-bold text-[var(--text-primary)] tabular-nums">{s.value ?? '—'}</span>
          <span className="text-[10px] text-[var(--text-faint)]">/ 100</span>
          {s.updated_at && <span className="ml-auto text-[10px] text-[var(--text-faint)]">{fmtDate(s.updated_at)}</span>}
          {s.breakdown && (
            <button type="button" onClick={() => setShowBreakdown(p => !p)}
              className="text-[10px] text-blue-500 hover:underline">
              {showBreakdown ? 'sutraukti' : 'detalės'}
            </button>
          )}
        </div>
        {showBreakdown && s.breakdown && (
          <pre className="mt-1.5 text-[10px] bg-[var(--bg-elevated)] rounded p-2 overflow-x-auto text-[var(--text-muted)] font-mono leading-relaxed">
            {JSON.stringify(s.breakdown, null, 2)}
          </pre>
        )}
      </div>

      {/* Chart performance — su peak position + weeks + chart_score */}
      {(() => {
        const cp = data.chartPerformance
        const hasChart = cp.weeks_total > 0
        const peakLabel = cp.peak_position != null ? `#${cp.peak_position}` : '—'
        const peakColor = cp.peak_position == null ? 'text-[var(--text-faint)]'
          : cp.peak_position === 1 ? 'text-yellow-500'
          : cp.peak_position <= 3 ? 'text-orange-500'
          : cp.peak_position <= 10 ? 'text-blue-500'
          : 'text-[var(--text-secondary)]'
        return (
          <div className="px-3 py-2 border-b border-[var(--border-subtle)]"
            title={hasChart
              ? `Aukščiausia vieta #${cp.peak_position}, viso ${cp.weeks_total} sav. chart'uose. ${cp.weeks_at_1 ? cp.weeks_at_1 + ' sav. #1, ' : ''}${cp.weeks_top10} sav. top 10. Score = vidutinė pozicija (100 = visada #1, 51 = visada #50). Palyginamas tarp dainų.`
              : 'Daina dar nepateko į top chart\'us'}>
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] uppercase tracking-wide font-semibold text-[var(--text-muted)]">🏆 Top chart'ai</span>
              {hasChart && cp.weeks_at_1 > 0 && (
                <span className="text-[9px] bg-yellow-100 text-yellow-800 border border-yellow-200 px-1 rounded">{cp.weeks_at_1} sav. #1</span>
              )}
              <span className="ml-auto text-[10px] text-[var(--text-faint)]">score {cp.chart_score} / 100</span>
            </div>
            <div className="flex items-baseline gap-3 mt-0.5">
              <div>
                <span className={`text-2xl font-bold tabular-nums ${peakColor}`}>{peakLabel}</span>
                <span className="text-[10px] text-[var(--text-faint)] ml-1">peak</span>
              </div>
              <div>
                <span className="text-lg font-bold text-[var(--text-secondary)] tabular-nums">{cp.weeks_total}</span>
                <span className="text-[10px] text-[var(--text-faint)] ml-1">sav. viso</span>
              </div>
              {hasChart && (
                <div>
                  <span className="text-lg font-bold text-[var(--text-secondary)] tabular-nums">{cp.weeks_top10}</span>
                  <span className="text-[10px] text-[var(--text-faint)] ml-1">sav. top 10</span>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* Engagement grid (4 cols dabar — top atskirai virš) */}
      <div className="grid grid-cols-4 divide-x divide-[var(--border-subtle)] border-b border-[var(--border-subtle)]">
        {([
          ['❤️', 'patinka', e.likes, 'Vartotojų like\'ų skaičius (likes lentelė, entity_type=track)'],
          ['💬', 'komentarai', e.comments, 'Komentarų skaičius prie šitos dainos'],
          ['▶', 'paleidimai', e.plays, 'Kiek kartų paspausta ▶ atlikėjo puslapio playerį (track_plays). Iš track puslapio dar nėra ping\'o.'],
          ['🗳️', 'DD balsai', e.votes, 'Dienos Dainos balsavimo balsai (daily_song_votes lentelė) — kol kas DD funkcija neaktyvi'],
        ] as const).map(([icon, label, n, tip], i) => (
          <div key={i} className="px-2 py-2 text-center" title={tip}>
            <div className="text-base leading-none">{icon}</div>
            <div className="text-sm font-bold text-[var(--text-primary)] tabular-nums mt-0.5">{fmtN(n)}</div>
            <div className="text-[9px] text-[var(--text-faint)] uppercase tracking-wide leading-tight">{label}</div>
          </div>
        ))}
      </div>

      {/* Source link → music.lt */}
      {data.sourceUrl && (
        <div className="px-3 py-1.5 border-b border-[var(--border-subtle)] flex items-center gap-2 text-[11px]">
          <span className="text-[var(--text-faint)]">Senoje svetainėje:</span>
          <a
            href={data.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:text-blue-700 hover:underline truncate font-mono"
            title={data.sourceUrl}
          >
            {data.sourceUrl.replace(/^https?:\/\/(www\.)?/, '')} ↗
          </a>
        </div>
      )}

      {/* Identifiers + timestamps */}
      <div className="px-3 py-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
        <div><span className="text-[var(--text-faint)]">ID:</span> <span className="font-mono text-[var(--text-secondary)]">{data.trackId}</span></div>
        <div><span className="text-[var(--text-faint)]">Legacy:</span> <span className="font-mono text-[var(--text-secondary)]">{data.legacyId ?? '—'}</span></div>
        <div className="col-span-2"><span className="text-[var(--text-faint)]">Slug:</span> <span className="font-mono text-[var(--text-secondary)]">{data.slug || '—'}</span></div>
        <div><span className="text-[var(--text-faint)]">Sukurta:</span> <span className="text-[var(--text-secondary)]">{fmtDate(data.timestamps.created_at)}</span></div>
        <div><span className="text-[var(--text-faint)]">Importuota:</span> <span className="text-[var(--text-secondary)]">{fmtDate(data.timestamps.imported_at)}</span></div>
        <div><span className="text-[var(--text-faint)]">Atnaujinta:</span> <span className="text-[var(--text-secondary)]">{fmtDate(data.timestamps.updated_at)}</span></div>
        <div><span className="text-[var(--text-faint)]">Šaltinis:</span> <span className="text-[var(--text-secondary)]">{data.source || '—'}</span></div>
      </div>
    </div>
  )
}

export default function AdminTrackEditPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const id = resolvedParams?.id
  const isNewTrack = !id || id === 'new'

  const { data: session, status } = useSession()
  const router = useRouter()

  const [title, setTitle] = useState('')
  const [artistId, setArtistId] = useState(0)
  const [artistName, setArtistName] = useState('')
  const [artistSlug, setArtistSlug] = useState('')
  const [artistAvatar, setArtistAvatar] = useState<string | null>(null)
  const [trackType, setTrackType] = useState('normal')
  // ── FIX 1: is_single kaip atskiras state ──────────────────────────────────
  const [isSingle, setIsSingle] = useState(false)
  const [releaseYear, setReleaseYear] = useState('')
  const [releaseMonth, setReleaseMonth] = useState('')
  const [releaseDay, setReleaseDay] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [spotifyId, setSpotifyId] = useState('')
  const [spUrlInput, setSpUrlInput] = useState('')
  const [lyrics, setLyrics] = useState('')
  const [chords, setChords] = useState('')
  const [lyricsTab, setLyricsTab] = useState<LyricsTab>('lyrics')
  const [isNew, setIsNew] = useState(false)
  const [isNewDate, setIsNewDate] = useState<string | null>(null)
  const [coverUrl, setCoverUrl] = useState('')
  const [featuring, setFeaturing] = useState<FeaturingArtist[]>([])
  const [albums, setAlbums] = useState<AlbumRef[]>([])
  const [removingFromAlbum, setRemovingFromAlbum] = useState<number | null>(null)
  const [mobileTab, setMobileTab] = useState<'info' | 'lyrics'>('info')
  const [showMobileNav, setShowMobileNav] = useState(false)
  const mobileNavRef = useRef<HTMLDivElement>(null)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(!isNewTrack)
  const [parsingFeat, setParsingFeat] = useState(false)
  const [parseResult, setParseResult] = useState<string | null>(null)
  const [fetchingCover, setFetchingCover] = useState(false)
  const [coverFetchMsg, setCoverFetchMsg] = useState<string | null>(null)

  const handleFetchWikiCover = async () => {
    if (!title) return
    setFetchingCover(true); setCoverFetchMsg(null)
    try {
      const query1 = [artistName, title, 'song'].filter(Boolean).join(' ')
      const query2 = [artistName, title].filter(Boolean).join(' ')
      let pageTitle = ''
      for (const q of [query1, query2]) {
        const results = (await (await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&origin=*&srlimit=3`)).json())?.query?.search || []
        const match = results.find((r: any) => r.title.toLowerCase().includes(title.toLowerCase())) || results[0]
        if (match) { pageTitle = match.title; break }
      }
      if (!pageTitle) { setCoverFetchMsg('Wikipedia puslapio nerasta'); return }
      const page = Object.values((await (await fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(pageTitle)}&prop=images&format=json&origin=*&imlimit=20`)).json())?.query?.pages || {})[0] as any
      const images: string[] = (page?.images || []).map((i: any) => i.title as string)
      const coverKeywords = ['cover', 'single', 'album', title.toLowerCase().replace(/\s+/g, '_')]
      const bestImage = images.find(img => coverKeywords.some(k => img.toLowerCase().includes(k)) && (img.toLowerCase().endsWith('.jpg') || img.toLowerCase().endsWith('.png')))
        || images.find(img => img.toLowerCase().endsWith('.jpg') || img.toLowerCase().endsWith('.png'))
      if (!bestImage) { setCoverFetchMsg('Tinkamo paveikslėlio nerasta'); return }
      const imgUrl = (Object.values((await (await fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(bestImage)}&prop=imageinfo&iiprop=url&format=json&origin=*`)).json())?.query?.pages || {})[0] as any)?.imageinfo?.[0]?.url
      if (!imgUrl) { setCoverFetchMsg('Nepavyko gauti paveikslėlio URL'); return }
      try {
        const d = await (await fetch('/api/fetch-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: imgUrl }) })).json()
        if (d.url && !d.url.startsWith('data:')) { setCoverUrl(d.url); setCoverFetchMsg('✓ Viršelis pridėtas!'); return }
      } catch {}
      setCoverUrl(imgUrl); setCoverFetchMsg('✓ Viršelis pridėtas!')
    } catch (e: any) { setCoverFetchMsg(`Klaida: ${e.message}`) }
    finally { setFetchingCover(false) }
  }

  const extractFeatFromTitle = (t: string): { cleanTitle: string; names: string[] } => {
    const patterns = [/\s*\(feat(?:uring)?\.?\s+([^)]+)\)/gi, /\s*\(ft\.?\s+([^)]+)\)/gi, /\s*\(su\s+([^)]{2,})\)/gi, /\s*\(with\s+([^)]{2,})\)/gi, /\s*\(ir\s+([^)]{2,})\)/gi]
    let cleanTitle = t; const allNames: string[] = []
    for (const p of patterns) cleanTitle = cleanTitle.replace(p, (_, names) => { allNames.push(...names.split(/\s+(?:and|ir|&)\s+|,\s*/).map((n: string) => n.trim()).filter((n: string) => n.length > 1)); return '' })
    return { cleanTitle: cleanTitle.trim(), names: allNames }
  }

  const handleParseFeaturing = async () => {
    const { cleanTitle, names } = extractFeatFromTitle(title)
    if (names.length === 0) { setParseResult('Nerasta featuring informacijos pavadinime'); return }
    setParsingFeat(true); setParseResult(null)
    try {
      const added: string[] = []; const newFeaturing = [...featuring]
      const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').trim()
      const capitalize = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase())
      for (const rawName of names) {
        const name = capitalize(rawName.trim()); const normName = normalize(name)
        if (newFeaturing.find(f => normalize(f.name) === normName)) continue
        let match: any = null
        for (const variant of [...new Set([name, normName, rawName.trim()])]) {
          const data = await (await fetch(`/api/artists?search=${encodeURIComponent(variant)}&limit=20`)).json()
          match = (data.artists || []).find((a: any) => normalize(a.name) === normName)
          if (match) break
        }
        if (match) {
          if (match.id !== artistId) { newFeaturing.push({ artist_id: match.id, name: match.name }); added.push(match.name) }
        } else {
          const json = await (await fetch('/api/artists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })).json()
          const newArtist = json.artist || json.data || json
          if (newArtist?.id) { newFeaturing.push({ artist_id: newArtist.id, name: newArtist.name || name }); added.push(`${newArtist.name || name} (naujas)`) }
        }
      }
      setFeaturing(newFeaturing); setTitle(cleanTitle)
      setParseResult(added.length > 0 ? `✓ Pridėta: ${added.join(', ')} · Pavadinimas išvalytas` : '✓ Pavadinimas išvalytas')
    } catch (e: any) { setParseResult(`Klaida: ${e.message}`) }
    finally { setParsingFeat(false) }
  }

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  useEffect(() => {
    const h = (e: MouseEvent) => { if (mobileNavRef.current && !mobileNavRef.current.contains(e.target as Node)) setShowMobileNav(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  useEffect(() => { if (status === 'unauthenticated') router.push('/') }, [status])

  useEffect(() => {
    if (isNewTrack || !isAdmin) return
    setLoading(true)
    fetch(`/api/tracks/${id}`).then(r => r.json()).then(data => {
      if (data.error) { setError(data.error); return }
      setTitle(data.title || ''); setArtistId(data.artist_id || 0)
      setTrackType(data.type || 'normal')
      // ── FIX 1: užkrauti is_single ────────────────────────────────────────
      setIsSingle(data.is_single || false)
      setReleaseYear(data.release_year ? String(data.release_year) : '')
      setReleaseMonth(data.release_month ? String(data.release_month) : '')
      setReleaseDay(data.release_day ? String(data.release_day) : '')
      setVideoUrl(data.video_url || ''); setSpotifyId(data.spotify_id || '')
      setLyrics(data.lyrics || ''); setChords(data.chords || '')
      setIsNew(data.is_new || false); setIsNewDate(data.is_new_date || null)
      setCoverUrl(data.cover_url || '')
      // ── FIX 3: gauti atlikėjo nuotrauką ──────────────────────────────────
      if (data.artists?.name) {
        setArtistName(data.artists.name)
        setArtistSlug(data.artists.slug || '')
        // Papildomai krauti atlikėjo duomenis kad gautume cover_image_url
        fetch(`/api/artists/${data.artist_id}`)
          .then(r => r.json())
          .then(artist => { if (artist.cover_image_url) setArtistAvatar(artist.cover_image_url) })
          .catch(() => {})
      }
      if (data.featuring) setFeaturing(data.featuring)
      if (data.albums) setAlbums(data.albums)
    }).finally(() => setLoading(false))
  }, [id, isAdmin])

  const toggleNew = async () => {
    const newVal = !isNew; const newDate = newVal ? new Date().toISOString().slice(0, 10) : null
    setIsNew(newVal); setIsNewDate(newDate)
    if (!isNewTrack) await fetch(`/api/tracks/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_new: newVal, is_new_date: newDate }) })
  }

  const removeFromAlbum = async (albumId: number) => {
    if (!confirm('Pašalinti iš albumo?')) return
    setRemovingFromAlbum(albumId)
    try { await fetch(`/api/album-tracks?track_id=${id}&album_id=${albumId}`, { method: 'DELETE' }); setAlbums(p => p.filter(a => a.album_id !== albumId)) }
    finally { setRemovingFromAlbum(null) }
  }

  const handleSave = useCallback(async () => {
    if (!title.trim()) { setError('Pavadinimas privalomas'); return }
    if (!artistId) { setError('Pasirinkite atlikėją'); return }
    setSaving(true); setError('')
    try {
      // ── FIX 1: siųsti is_single ──────────────────────────────────────────
      const payload = { title, artist_id: artistId, type: trackType, is_single: isSingle, release_year: releaseYear || null, release_month: releaseMonth || null, release_day: releaseDay || null, video_url: videoUrl, spotify_id: spotifyId, lyrics, chords, is_new: isNew, is_new_date: isNewDate, cover_url: coverUrl, featuring }
      const res = await fetch(isNewTrack ? '/api/tracks' : `/api/tracks/${id}`, { method: isNewTrack ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSaved(true); setTimeout(() => setSaved(false), 2000)
      if (isNewTrack) router.push(`/admin/tracks/${data.id}`)
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }, [title, artistId, trackType, isSingle, releaseYear, releaseMonth, releaseDay, videoUrl, spotifyId, lyrics, chords, isNew, isNewDate, coverUrl, featuring, id, isNewTrack])

  const handleDelete = async () => {
    if (!confirm(`Ištrinti "${title}"?`)) return
    setDeleting(true)
    await fetch(`/api/tracks/${id}`, { method: 'DELETE' })
    router.push(artistId ? `/admin/artists/${artistId}` : '/admin/tracks')
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); handleSave() } }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [handleSave])

  const ytId = extractYouTubeId(videoUrl)
  const ytSearchQuery = [artistName, title].filter(Boolean).join(' ')
  const firstAlbumYear = albums[0]?.album_year
  const hasLyrics = lyrics.trim().length > 0
  const hasChords = chords.trim().length > 0
  const hasFeat = /\((feat|featuring|ft\.|su |with |ir )/i.test(title)

  if (status === 'loading' || !isAdmin) return null

  // ── Info Panel ──────────────────────────────────────────────────────────────
  const InfoPanel = (
    <div className="space-y-2.5 p-3 pb-4">
      <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] shadow-sm p-3 space-y-2.5">

        <div className="space-y-2 sm:space-y-0 sm:grid sm:grid-cols-[1fr_auto] sm:gap-3 sm:items-start">
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Pavadinimas *</label>
            <input value={title} onChange={e => { setTitle(e.target.value); setParseResult(null) }} placeholder="Dainos pavadinimas"
              className="w-full px-2.5 py-1.5 border border-[var(--input-border)] rounded-lg text-[var(--text-primary)] text-sm font-medium focus:outline-none focus:border-blue-400 bg-[var(--bg-surface)] transition-colors" />
            {hasFeat && (
              <div className="mt-1">
                <button type="button" onClick={handleParseFeaturing} disabled={parsingFeat}
                  className="text-xs text-blue-500 hover:underline disabled:opacity-50 flex items-center gap-1">
                  {parsingFeat ? <><span className="inline-block w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />Ieškoma...</> : '← Ieškoti papildomų atlikėjų'}
                </button>
              </div>
            )}
            {parseResult && <p className={`text-xs mt-0.5 ${parseResult.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>{parseResult}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Data</label>
            <div className="flex gap-1">
              <DateNumberInput mode="string" value={releaseYear} onChange={setReleaseYear} min={1900} max={2030} placeholder="Metai" width="w-16" />
              <DateNumberInput mode="string" value={releaseMonth} onChange={setReleaseMonth} min={1} max={12} placeholder="Mėn" />
              <DateNumberInput mode="string" value={releaseDay} onChange={setReleaseDay} min={1} max={31} placeholder="D" width="w-11" />
            </div>
            {firstAlbumYear && releaseYear !== String(firstAlbumYear) && (
              <button onClick={() => { setReleaseYear(String(firstAlbumYear)); setReleaseMonth(''); setReleaseDay('') }}
                className="mt-1 text-xs text-blue-500 hover:underline">← Albumo metai ({firstAlbumYear})</button>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Atlikėjai *</label>
          <div className="flex flex-wrap items-center gap-1.5">
            {artistId ? (
              <div className="flex items-center gap-1.5 bg-blue-50 text-blue-800 border border-blue-200 rounded-full pl-1 pr-2.5 py-1 text-sm font-semibold shrink-0">
                {artistAvatar
                  ? <img src={artistAvatar} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
                  : <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold shrink-0">{artistName[0]}</div>
                }
                {artistName}
                <button type="button" onClick={() => { setArtistId(0); setArtistName(''); setArtistSlug(''); setArtistAvatar(null) }}
                  className="text-blue-400 hover:text-red-500 ml-0.5"><IcoX /></button>
              </div>
            ) : (
              <div className="flex-1 min-w-[140px]">
                <ArtistSearchInput placeholder="Pagrindinis atlikėjas..." onSelect={(id, name, avatar) => { setArtistId(id); setArtistName(name); setArtistAvatar(avatar || null) }} />
              </div>
            )}
            {featuring.map((f, i) => (
              <div key={f.artist_id} className="flex items-center gap-1 bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--input-border)] rounded-full px-2 py-1 text-xs shrink-0">
                <span className="text-[var(--text-muted)]">su</span>
                <a href={`/admin/artists/${f.artist_id}`} target="_blank" rel="noreferrer"
                  className="hover:text-blue-600 hover:underline transition-colors">{f.name}</a>
                <button type="button" onClick={() => setFeaturing(p => p.filter((_, j) => j !== i))}
                  className="text-[var(--text-muted)] hover:text-red-500 ml-0.5">×</button>
              </div>
            ))}
            {artistId > 0 && (
              <div className="flex-1 min-w-[120px]">
                <ArtistSearchInput placeholder="+ su atlikėju..." onSelect={(id, name) => {
                  if (id === artistId || featuring.find(f => f.artist_id === id)) return
                  setFeaturing(p => [...p, { artist_id: id, name }])
                }} />
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Tipas</label>
          <div className="flex flex-wrap gap-1">
            {TRACK_TYPES.map(tp => (
              <button key={tp} type="button" onClick={() => setTrackType(tp)}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                  trackType === tp
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-active)]'
                }`}>
                {TRACK_TYPE_DEFS[tp].icon}{TRACK_TYPE_DEFS[tp].label}
              </button>
            ))}
            {/* ── FIX 1: isSingle toggle ────────────────────────────────── */}
            <button type="button" onClick={() => setIsSingle(p => !p)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all ${isSingle ? 'bg-orange-500 text-white shadow-sm' : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-active)]'}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth={2}/><circle cx="12" cy="12" r="3" strokeWidth={2}/></svg>
              Singlas
            </button>
            <button type="button" onClick={toggleNew}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all ${isNew ? 'bg-green-500 text-white shadow-sm' : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-active)]'}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>Naujas
            </button>
          </div>
          {isNew && isNewDate && <p className="text-xs text-green-500 mt-1">nuo {isNewDate} · išsaugoma automatiškai</p>}
        </div>
      </div>

      {!isNewTrack && id && /^\d+$/.test(String(id)) && (
        <StatsCard trackId={Number(id)} />
      )}

      {albums.length > 0 && (
        <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] shadow-sm overflow-hidden">
          <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex items-center gap-1.5">
            <span className="text-xs font-bold text-[var(--text-secondary)]">Albumai</span>
            <span className="bg-[var(--bg-active)] text-[var(--text-secondary)] text-xs font-bold px-1.5 py-0.5 rounded-full">{albums.length}</span>
          </div>
          {albums.map(a => (
            <div key={a.album_id} className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--border-subtle)] last:border-0 group hover:bg-[var(--bg-elevated)] transition-colors">
              <span className="text-[var(--text-faint)] text-xs w-4 text-right shrink-0">{a.position}.</span>
              <div className="flex-1 min-w-0">
                <Link href={`/admin/albums/${a.album_id}`} className="text-sm text-[var(--text-primary)] hover:text-blue-600 truncate block transition-colors">{a.album_title}</Link>
                {a.album_year && <span className="text-xs text-[var(--text-muted)]">{a.album_year}</span>}
              </div>
              <button onClick={() => removeFromAlbum(a.album_id)} disabled={removingFromAlbum === a.album_id}
                className="opacity-0 group-hover:opacity-100 text-[var(--text-faint)] hover:text-red-500 text-xs px-1 rounded transition-all disabled:opacity-50">
                {removingFromAlbum === a.album_id ? '...' : '✕'}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] shadow-sm p-3 space-y-2.5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-semibold text-[var(--text-muted)] mb-1.5">Viršelis</p>
            <CoverMini value={coverUrl} onChange={v => { setCoverUrl(v); setCoverFetchMsg(null) }} />
            {!coverUrl && (
              <div className="mt-1">
                <button type="button" onClick={handleFetchWikiCover} disabled={fetchingCover}
                  className="text-xs text-blue-500 hover:underline disabled:opacity-50 flex items-center gap-1">
                  {fetchingCover ? <><span className="inline-block w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />Ieškoma...</> : '← Wikipedia viršelis'}
                </button>
                {coverFetchMsg && <p className={`text-xs mt-0.5 ${coverFetchMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>{coverFetchMsg}</p>}
              </div>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--text-muted)] mb-1 flex items-center gap-1"><IcoSpotify className="w-3 h-3 text-green-500" />Spotify</p>
            <input value={spotifyId} onChange={e => setSpotifyId(e.target.value)} placeholder="Track ID..."
              className="w-full px-2 py-1.5 border border-[var(--input-border)] rounded-lg text-[var(--text-primary)] text-xs focus:outline-none focus:border-blue-400 font-mono transition-colors bg-[var(--bg-surface)]" />
            {spotifyId && (
              <a href={`https://open.spotify.com/track/${spotifyId}`} target="_blank" rel="noopener noreferrer"
                className="mt-1 flex items-center gap-1 text-xs text-green-600 hover:text-green-700 transition-colors">🔗 Atidaryti Spotify</a>
            )}
            <div className="flex gap-1 mt-1">
              <input value={spUrlInput} onChange={e => setSpUrlInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { const m = spUrlInput.match(/track\/([A-Za-z0-9]+)/); if (m) { setSpotifyId(m[1]); setSpUrlInput('') } } }}
                placeholder="Spotify URL..."
                className="flex-1 min-w-0 px-2 py-1.5 border border-[var(--input-border)] rounded-lg text-xs text-[var(--text-secondary)] focus:outline-none focus:border-blue-400 bg-[var(--bg-surface)]" />
              <button type="button" onClick={() => { const m = spUrlInput.match(/track\/([A-Za-z0-9]+)/); if (m) { setSpotifyId(m[1]); setSpUrlInput('') } }}
                className="px-2.5 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold transition-colors shrink-0">✓</button>
            </div>
          </div>
        </div>

        <div className="border-t border-[var(--border-subtle)] pt-2.5">
          <p className="text-xs font-semibold text-[var(--text-muted)] mb-1 flex items-center gap-1"><IcoYouTube className="w-3 h-3 text-red-500" />YouTube</p>
          <div className="flex gap-1 mb-1.5">
            <input value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="youtube.com/watch?v=..."
              className="flex-1 min-w-0 px-2 py-1.5 border border-[var(--input-border)] rounded-lg text-xs text-[var(--text-secondary)] focus:outline-none focus:border-blue-400 bg-[var(--bg-surface)]" />
            {ytId && <button type="button" onClick={() => setVideoUrl('')}
              className="px-2 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg text-xs transition-colors shrink-0">✕</button>}
          </div>
          {ytId && (
            <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="block relative rounded-lg overflow-hidden group mb-1.5">
              <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt="" className="w-full aspect-video object-cover group-hover:opacity-90 transition-opacity" />
              <span className="absolute bottom-1 right-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">↗</span>
            </a>
          )}
          <YouTubeSearch initialQuery={ytSearchQuery} onSelect={url => setVideoUrl(url)} />
        </div>
      </div>
    </div>
  )

  const LyricsPanel = (
    <div className="flex flex-col h-full p-3">
      <div className="bg-[var(--bg-surface)] rounded-t-xl border border-[var(--border-subtle)] shadow-sm shrink-0 flex items-center">
        <button onClick={() => setLyricsTab('lyrics')}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-tl-xl transition-colors ${lyricsTab === 'lyrics' ? 'text-blue-600 bg-blue-50/60' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'}`}>
          Dainos tekstas {hasLyrics && <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />}
        </button>
        <div className="w-px h-5 bg-[var(--bg-active)] shrink-0" />
        <button onClick={() => setLyricsTab('chords')}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold transition-colors ${lyricsTab === 'chords' ? 'text-blue-600 bg-blue-50/60' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'}`}>
          Akordai {hasChords && <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />}
        </button>
      </div>
      <textarea key={lyricsTab}
        value={lyricsTab === 'lyrics' ? lyrics : chords}
        onChange={e => lyricsTab === 'lyrics' ? setLyrics(e.target.value) : setChords(e.target.value)}
        placeholder={lyricsTab === 'lyrics' ? 'Dainos žodžiai...' : 'Am  G  F  G\nVerse 1...'}
        className="flex-1 w-full px-3 py-2.5 text-sm text-[var(--text-primary)] bg-[var(--bg-surface)] border border-t-0 border-[var(--border-subtle)] shadow-sm rounded-b-xl focus:outline-none resize-none font-mono leading-relaxed"
      />
    </div>
  )

  return (
    <div className="overflow-hidden flex flex-col bg-[#f8f7f5]" style={{ height: 'calc(100vh - 56px)' }}>

      <div className="shrink-0 bg-[var(--bg-surface)]/95 backdrop-blur border-b border-[var(--input-border)]">
        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <nav className="flex items-center gap-1 text-sm min-w-0">
            <Link href="/admin" className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] shrink-0 hidden lg:block">Admin</Link>
            <span className="text-[var(--text-faint)] hidden lg:block">/</span>
            <Link href="/admin/artists" className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] shrink-0 hidden lg:block">Atlikėjai</Link>
            {artistId > 0 && <>
              <span className="text-[var(--text-faint)] hidden lg:block">/</span>
              <Link href={`/admin/artists/${artistId}`} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] shrink-0 hidden lg:block">{artistName}</Link>
              <span className="text-[var(--text-faint)] hidden lg:block">/</span>
              <Link href={`/admin/artists/${artistId}#albums`} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] shrink-0 hidden lg:block">Albumai</Link>
              <span className="text-[var(--text-faint)] hidden lg:block">/</span>
              <Link href={`/admin/tracks?artist=${artistId}`} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] shrink-0 hidden lg:block">Dainos</Link>
            </>}
            <div className="flex lg:hidden items-center gap-2 min-w-0">
              <Link href={artistId ? `/admin/tracks?artist=${artistId}` : '/admin/tracks'}
                className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] shrink-0"><IcoBack /></Link>
              <span className="text-[var(--text-primary)] font-semibold truncate">{isNewTrack ? 'Nauja daina' : (title || '...')}</span>
              {artistId > 0 && (
                <div className="relative shrink-0" ref={mobileNavRef}>
                  <button onClick={() => setShowMobileNav(p => !p)}
                    className="p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] rounded-lg hover:bg-[var(--bg-elevated)] transition-colors">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
                  </button>
                  {showMobileNav && (
                    <div className="absolute left-0 top-full mt-1 bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-xl shadow-[var(--modal-shadow)] z-50 min-w-[160px] overflow-hidden">
                      <Link href={`/admin/artists/${artistId}`} onClick={() => setShowMobileNav(false)}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors">
                        <svg className="w-4 h-4 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                        {artistName}
                      </Link>
                      <Link href={`/admin/artists/${artistId}#albums`} onClick={() => setShowMobileNav(false)}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors border-t border-[var(--border-subtle)]">
                        <svg className="w-4 h-4 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" /></svg>
                        Albumai
                      </Link>
                      <Link href={`/admin/tracks?artist=${artistId}`} onClick={() => setShowMobileNav(false)}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 font-medium hover:bg-[var(--hover-blue)] transition-colors border-t border-[var(--border-subtle)]">
                        <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h10" /></svg>
                        Dainos
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
            <span className="text-[var(--text-faint)] hidden lg:block">/</span>
            <span className="text-[var(--text-primary)] font-semibold truncate max-w-[260px] hidden lg:block">{isNewTrack ? 'Nauja daina' : (title || '...')}</span>
          </nav>

          <div className="flex items-center gap-1.5 shrink-0">
            {!isNewTrack && (
              <Link
                href={`/admin/tracks/merge?a=${id}`}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] rounded-lg text-sm font-medium transition-colors"
                title="Sulieti šią dainą su kita (duplikato sujungimas)"
              >
                <span aria-hidden>🔀</span><span className="hidden sm:inline">Sulieti</span>
              </Link>
            )}
            {!isNewTrack && (
              <button onClick={handleDelete} disabled={deleting}
                className="flex items-center gap-1 px-2.5 py-1.5 text-red-500 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                <IcoTrash /><span className="hidden sm:inline">Ištrinti</span>
              </button>
            )}
            <Link href={artistId ? `/admin/artists/${artistId}` : '/admin/tracks'}
              className="px-3 py-1.5 border border-[var(--input-border)] text-[var(--text-secondary)] rounded-lg text-sm font-medium hover:bg-[var(--bg-elevated)] transition-colors">
              Atšaukti
            </Link>
            <button onClick={handleSave} disabled={saving}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${saved ? 'bg-green-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'} disabled:opacity-50`}>
              {saving
                ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" />Saugoma...</>
                : saved ? <><IcoCheck />Išsaugota!</> : <><IcoCheck />Išsaugoti</>}
            </button>
          </div>
        </div>

        <div className="flex lg:hidden border-t border-[var(--border-subtle)]">
          <button onClick={() => setMobileTab('info')}
            className={`flex-1 py-2 text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${mobileTab === 'info' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-[var(--text-muted)]'}`}>
            <IcoInfo />Informacija
          </button>
          <button onClick={() => setMobileTab('lyrics')}
            className={`flex-1 py-2 text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${mobileTab === 'lyrics' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-[var(--text-muted)]'}`}>
            <IcoText />Tekstas{(hasLyrics || hasChords) && <span className="w-1.5 h-1.5 rounded-full bg-green-400" />}
          </button>
        </div>
      </div>

      {error && (
        <div className="shrink-0 px-3 pt-2">
          <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-center gap-2">
            <IcoAlert />{error}
            <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600"><IcoX /></button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="hidden lg:grid flex-1 grid-cols-2 min-h-0">
            <div className="border-r border-[var(--input-border)] overflow-y-auto">{InfoPanel}</div>
            <div className="overflow-hidden">{LyricsPanel}</div>
          </div>
          <div className="flex lg:hidden flex-1 min-h-0 overflow-hidden">
            {mobileTab === 'info'
              ? <div className="flex-1 overflow-y-auto">{InfoPanel}</div>
              : <div className="flex-1 overflow-hidden">{LyricsPanel}</div>
            }
          </div>
        </>
      )}
    </div>
  )
}
