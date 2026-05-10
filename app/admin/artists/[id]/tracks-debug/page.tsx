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
    .select('id, slug, title, type, is_single, release_year, release_month, video_url, video_views, score')
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

function trackSortVal(t: TrackRow): number {
  const likes = (t.like_count || 0) * 100
  const score = (t.score || 0)
  const views = Math.log10((t.video_views || 0) + 1) * 10
  const single = t.is_single ? 50 : 0
  return likes + score + views + single
}

type PopSignal = 'likes' | 'score' | 'views' | 'none'
function detectPopSignal(tracks: TrackRow[]): { signal: PopSignal; max: number } {
  let maxLikes = 0, maxScore = 0, maxViews = 0
  for (const t of tracks) {
    if ((t.like_count || 0) > maxLikes) maxLikes = t.like_count || 0
    if ((t.score || 0) > maxScore) maxScore = t.score || 0
    if ((t.video_views || 0) > maxViews) maxViews = t.video_views || 0
  }
  if (maxLikes > 0) return { signal: 'likes', max: maxLikes }
  if (maxScore > 0) return { signal: 'score', max: maxScore }
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
          <strong className="text-[var(--text-primary)]">Composite sort formulė:</strong>{' '}
          <code className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[12px]">
            likes×100 + score + log10(views)×10 + (is_single ? 50 : 0)
          </code>
        </p>
        <p className="mb-2">
          <strong className="text-[var(--text-primary)]">PopBar signal:</strong>{' '}
          <span className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 font-bold text-[var(--accent-orange)]">
            {popInfo.signal}
          </span>{' '}
          (max ={' '}
          <span className="tabular-nums">{popInfo.max.toFixed(2)}</span>) — visi PopBar
          dashes skaičiuojami relatyviai prie šio max.
        </p>
        <p>
          <strong className="text-[var(--text-primary)]">Track'ai:</strong> {tracks.length} ·{' '}
          <strong className="text-[var(--text-primary)]">Singlai:</strong> {totalSingles} ·{' '}
          <strong className="text-[var(--text-primary)]">Su video:</strong>{' '}
          {tracks.filter(t => yt(t.video_url)).length}
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border-default)]">
        <table className="w-full text-[12.5px]">
          <thead className="sticky top-0 bg-[var(--bg-elevated)] text-left text-[11px] uppercase tracking-wider text-[var(--text-faint)]">
            <tr>
              <th className="px-3 py-2.5">#</th>
              <th className="px-3 py-2.5">Track</th>
              <th className="px-3 py-2.5 text-right">Likes</th>
              <th className="px-3 py-2.5 text-right">Score</th>
              <th className="px-3 py-2.5 text-right">Views</th>
              <th className="px-3 py-2.5 text-right">log10(views)</th>
              <th className="px-3 py-2.5 text-center">Single</th>
              <th className="px-3 py-2.5 text-center">Video</th>
              <th className="px-3 py-2.5 text-center">Year</th>
              <th className="px-3 py-2.5 text-right font-extrabold text-[var(--accent-orange)]">Composite</th>
              <th className="px-3 py-2.5 text-center">PopBar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {sorted.map((t, i) => {
              const composite = trackSortVal(t)
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
                  <td className="px-3 py-2 text-right tabular-nums">{t.like_count}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {t.score != null ? t.score.toFixed(1) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {t.video_views != null ? t.video_views.toLocaleString('lt-LT') : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">
                    {t.video_views ? Math.log10(t.video_views + 1).toFixed(2) : '—'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {t.is_single ? (
                      <span className="rounded bg-[rgba(59,130,246,0.16)] px-1.5 py-0.5 text-[10px] font-bold text-[#60a5fa]">
                        ✓
                      </span>
                    ) : (
                      <span className="text-[var(--text-faint)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {hasVideo ? '▶' : <span className="text-[var(--text-faint)]">—</span>}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums text-[var(--text-muted)]">
                    {t.release_year || '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-extrabold text-[var(--accent-orange)]">
                    {composite.toFixed(1)}
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
