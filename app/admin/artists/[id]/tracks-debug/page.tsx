// app/admin/artists/[id]/tracks-debug/page.tsx
//
// Admin debug puslapis — rodo kiekvieno atlikėjo track'o composite
// popularity score breakdown'ą + sortinimo poziciją + PopBar dashes
// lygį. Skirta atsakyti į klausimą „kodėl šitas track'as rodomas
// žemiau už kitą su mažiau dashes?"
//
// Composite formulė (atitinka public artist page'os tracksAllTime sort):
//   sortVal = likes×100 + score + log10(views)×10 + (is_single ? 50 : 0)
//
// PopBar level — relatyvus prie maksimumo per detectPopSignal hierarchy:
//   likes (jei bent vienas track turi >0) → score → log10(views) → none
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase'

interface Props {
  params: Promise<{ id: string }>
}

type TrackRow = {
  id: number
  slug: string
  title: string
  type: string | null
  is_single: boolean | null
  release_year: number | null
  release_month: number | null
  release_day: number | null
  video_url: string | null
  video_views: number | null
  score: number | null
  like_count: number
}

async function getArtist(id: number) {
  const sb = createAdminClient()
  const { data } = await sb
    .from('artists')
    .select('id, slug, name, cover_image_url')
    .eq('id', id)
    .single()
  return data
}

async function getTracks(id: number): Promise<TrackRow[]> {
  const sb = createAdminClient()
  const { data } = await sb
    .from('tracks')
    .select('id, slug, title, type, is_single, release_year, release_month, release_day, video_url, video_views, score')
    .eq('artist_id', id)
    .or('source.is.null,source.neq.legacy_scrape_pending')
    .range(0, 9999)
  const tracks = (data || []) as any[]
  if (tracks.length === 0) return []

  // Like counts iš likes lentelės
  const ids = tracks.map(t => t.id)
  const likeMap = new Map<number, number>()
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    const { data: likes } = await sb
      .from('likes')
      .select('entity_id')
      .eq('entity_type', 'track')
      .in('entity_id', chunk)
    for (const l of (likes || []) as any[]) {
      likeMap.set(l.entity_id, (likeMap.get(l.entity_id) || 0) + 1)
    }
  }
  for (const t of tracks) t.like_count = likeMap.get(t.id) || 0
  return tracks
}

// Composite formulė — VIEWS-DOMINANT v2 (data-resilient, atitinka
// public artist-profile-client.tsx trackSortVal). Pašalinta:
//   - score × 0.2 (uniform per artist, nedifferencijuoja)
//   - year_recency (penalizuoja klasikus, depend nuo missing year data)

function trackScoreBreakdown(t: TrackRow): {
  viewsLog: number
  likesLog: number
  single: number
  video: number
  total: number
} {
  const viewsLog = Math.log10((t.video_views || 0) + 1) * 50
  const likesLog = Math.log10((t.like_count || 0) + 1) * 10
  const single = t.is_single ? 10 : 0
  const video = t.video_url ? 5 : 0
  return {
    viewsLog, likesLog, single, video,
    total: viewsLog + likesLog + single + video,
  }
}

function trackSortVal(t: TrackRow): number {
  return trackScoreBreakdown(t).total
}

function fmtReleaseDate(t: TrackRow): string {
  const yr = t.release_year
  const mo = t.release_month
  const dy = t.release_day
  if (!yr) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  if (mo && dy) return `${yr}-${pad(mo)}-${pad(dy)}`
  if (mo) return `${yr}-${pad(mo)}`
  return String(yr)
}

type PopSignal = 'likes' | 'score' | 'views' | 'none'
function detectPopSignal(tracks: TrackRow[]): { signal: PopSignal; max: number } {
  let maxLikes = 0, maxScore = 0, maxViews = 0
  let likesPresent = 0
  const total = tracks.length
  for (const t of tracks) {
    if ((t.like_count || 0) > 0) likesPresent++
    if ((t.like_count || 0) > maxLikes) maxLikes = t.like_count || 0
    if ((t.score || 0) > maxScore) maxScore = t.score || 0
    if ((t.video_views || 0) > maxViews) maxViews = t.video_views || 0
  }
  // Sparse likes (<50%) → use composite score (matches public client logic).
  const likesCoverage = total > 0 ? likesPresent / total : 0
  if (maxLikes > 0 && likesCoverage >= 0.5) return { signal: 'likes', max: maxLikes }
  if (maxScore > 0) return { signal: 'score', max: maxScore }
  if (maxLikes > 0) return { signal: 'likes', max: maxLikes }
  if (maxViews > 0) return { signal: 'views', max: Math.log10(maxViews + 1) }
  return { signal: 'none', max: 0 }
}

function popLevel(value: number, max: number): number {
  if (!max || max <= 0) return 0
  if (value <= 0) return 1
  const pct = value / max
  if (pct >= 0.80) return 5
  if (pct >= 0.55) return 4
  if (pct >= 0.30) return 3
  if (pct >= 0.10) return 2
  return 1
}

function trackPopValue(t: TrackRow, signal: PopSignal): number {
  if (signal === 'likes') return t.like_count || 0
  if (signal === 'score') return t.score || 0
  if (signal === 'views') return Math.log10((t.video_views || 0) + 1)
  return 0
}

export default async function TracksDebugPage({ params }: Props) {
  const { id: idStr } = await params
  const id = Number(idStr)
  if (!Number.isFinite(id)) notFound()
  const artist = await getArtist(id)
  if (!artist) notFound()
  const tracks = await getTracks(id)

  // Sort like public artist page (with-video first, then rest, each by trackSortVal desc)
  const yt = (url: string | null) => !!url && /youtu/.test(url)
  const withVideo = tracks.filter(t => yt(t.video_url)).slice().sort((a, b) => trackSortVal(b) - trackSortVal(a))
  const rest = tracks.filter(t => !yt(t.video_url)).slice().sort((a, b) => trackSortVal(b) - trackSortVal(a))
  const sorted = [...withVideo, ...rest]

  const popInfo = detectPopSignal(sorted)
  const totalSingles = tracks.filter(t => t.is_single).length

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8">
      <div className="mb-6 flex items-center gap-4">
        <Link href={`/admin/artists/${id}`} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          ← Atlikėjas
        </Link>
        <h1 className="text-2xl font-black text-[var(--text-primary)]">
          Track scoring debug — {artist.name}
        </h1>
      </div>

      <div className="mb-6 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 text-[13px] text-[var(--text-muted)]">
        <p className="mb-2">
          <strong className="text-[var(--text-primary)]">Composite formulė (views-dominant v2, 2026-05-10):</strong>{' '}
          <code className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[12px]">
            views_log×50 + likes_log×10 + (single ? 10 : 0) + (video ? 5 : 0)
          </code>
        </p>
        <ul className="mb-2 ml-4 list-disc space-y-0.5 text-[12px]">
          <li><code>views_log</code> = log₁₀(video_views + 1) × 50 — dominantas (1.3B views ≈ 456 pts)</li>
          <li><code>likes_log</code> = log₁₀(like_count + 1) × 10 — small bonus (200 likes ≈ 23 pts)</li>
          <li><code>single</code> = is_single ? +10 : 0</li>
          <li><code>video</code> = video_url ? +5 : 0 (playable bonus)</li>
        </ul>
        <p className="mb-2 text-[12px]">
          <em className="text-[var(--text-faint)]">Pašalinta v2: <code>score × 0.2</code> (uniform per artist)
          ir <code>year_recency</code> (penalizuoja klasikus, depend nuo missing year).</em>
        </p>
        {/* DATA QUALITY SUMMARY — leidžia greit pamatyti, kur trūksta info */}
        {(() => {
          const totalTracks = tracks.length
          const withLikes = tracks.filter(t => t.like_count > 0).length
          const withYear = tracks.filter(t => t.release_year).length
          const withFullDate = tracks.filter(t => t.release_year && t.release_month && t.release_day).length
          const withScore = tracks.filter(t => (t.score || 0) > 0).length
          const withVideo = tracks.filter(t => yt(t.video_url)).length
          const withViews = tracks.filter(t => (t.video_views || 0) > 0).length
          const stat = (n: number) => {
            const pct = totalTracks ? Math.round((n / totalTracks) * 100) : 0
            const color = pct >= 70 ? 'text-emerald-400' : pct >= 40 ? 'text-yellow-400' : 'text-red-400'
            return <span className={`tabular-nums font-bold ${color}`}>{n}/{totalTracks} ({pct}%)</span>
          }
          return (
            <div className="mt-3 rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-[12px]">
              <div className="mb-1.5 font-extrabold uppercase tracking-wide text-[var(--text-primary)]">Data quality:</div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
                <div>Su likes: {stat(withLikes)}</div>
                <div>Su YT views: {stat(withViews)}</div>
                <div>Su video: {stat(withVideo)}</div>
                <div>Su year: {stat(withYear)}</div>
                <div>Su pilna data (Y-M-D): {stat(withFullDate)}</div>
                <div>Singlai pažymėti: {stat(totalSingles)}</div>
                <div>Su Wiki score: {stat(withScore)}</div>
              </div>
            </div>
          )
        })()}
        <p className="mt-3 mb-1">
          <strong className="text-[var(--text-primary)]">PopBar signal:</strong>{' '}
          <span className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 font-bold text-[var(--accent-orange)]">
            {popInfo.signal}
          </span>{' '}
          (max =<span className="tabular-nums"> {popInfo.max.toFixed(2)}</span>)
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border-default)]">
        <table className="w-full text-[12.5px]">
          <thead className="sticky top-0 bg-[var(--bg-elevated)] text-left text-[11px] uppercase tracking-wider text-[var(--text-faint)]">
            <tr>
              <th className="px-3 py-2.5">#</th>
              <th className="px-3 py-2.5">Track</th>
              <th className="px-3 py-2.5 text-right">Views</th>
              <th className="px-3 py-2.5 text-right" title="log10(views+1) × 50">+views×50</th>
              <th className="px-3 py-2.5 text-right">Likes</th>
              <th className="px-3 py-2.5 text-right" title="log10(likes+1) × 10">+likes×10</th>
              <th className="px-3 py-2.5 text-center" title="is_single ? +10 : 0">+Single</th>
              <th className="px-3 py-2.5 text-center" title="video_url ? +5 : 0">+Video</th>
              <th className="px-3 py-2.5 text-center">Date</th>
              <th className="px-3 py-2.5 text-right font-extrabold text-[var(--accent-orange)]">Σ Composite</th>
              <th className="px-3 py-2.5 text-center">PopBar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {sorted.map((t, i) => {
              const bd = trackScoreBreakdown(t)
              const popVal = trackPopValue(t, popInfo.signal)
              const level = popLevel(popVal, popInfo.max)
              const hasVideo = yt(t.video_url)
              return (
                <tr key={t.id} className="hover:bg-[var(--bg-hover)]">
                  <td className="px-3 py-2 tabular-nums text-[var(--text-faint)]">{i + 1}</td>
                  <td className="px-3 py-2 font-bold text-[var(--text-primary)]">
                    <Link href={`/admin/tracks/${t.id}`} className="hover:text-[var(--accent-orange)]">
                      {t.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {t.video_views != null ? t.video_views.toLocaleString('lt-LT') : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">
                    {bd.viewsLog.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.like_count}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">
                    {bd.likesLog.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">
                    {t.is_single ? (
                      <span className="rounded bg-[rgba(59,130,246,0.16)] px-1.5 py-0.5 text-[10px] font-bold text-[#60a5fa]">
                        +10
                      </span>
                    ) : (
                      <span className="text-[var(--text-faint)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">
                    {hasVideo ? (
                      <span className="rounded bg-[rgba(249,115,22,0.16)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--accent-orange)]">
                        +5
                      </span>
                    ) : (
                      <span className="text-[var(--text-faint)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums text-[var(--text-muted)]">
                    {fmtReleaseDate(t)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-extrabold text-[var(--accent-orange)]">
                    {bd.total.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="inline-flex gap-[2px]">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <span
                          key={j}
                          className={[
                            'h-[3px] w-[10px] rounded-[2px]',
                            j < level ? 'bg-[var(--accent-orange)]' : 'bg-[var(--border-default)]',
                          ].join(' ')}
                        />
                      ))}
                    </div>
                    <div className="text-[10px] text-[var(--text-faint)] tabular-nums">{level}/5</div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6 text-[12px] text-[var(--text-muted)]">
        Public artist page'as naudoja same composite sort. PopBar dashes
        prikabinami pagal popInfo signal'ą (likes prioritetu, jei bent
        vienas track turi like; kitaip score; kitaip log10(views)).
      </div>
    </div>
  )
}
