/**
 * Bendra YouTube enrichment logika — naudoja:
 *   - /api/admin/yt/track/[id]/enrich
 *   - /api/admin/yt/artist/[id]/enrich
 *
 * Atskirta į lib'ą, kad route'ai nereikėtų importuoti vienas kito
 * (Next.js App Router'e route.ts importas iš route.ts nestabilus).
 */
import { createAdminClient } from './supabase'
import { searchYouTube, getVideoDetails, extractVideoIdFromUrl } from './yt-innertube'
import { pickBestMatch, YT_MATCH_THRESHOLD } from './yt-match'

export type EnrichResult = {
  ok: true
  trackId: number
  trackTitle?: string | null
  videoId: string | null
  videoUrl: string | null
  videoTitle?: string | null
  videoChannel?: string | null
  matchScore?: number | null
  wasSearched: boolean
  wasFound: boolean
  /** Buvo darytas search ir gauta kandidatų, bet nė vienas nesiekė threshold'o. */
  skipReason?: string | null
  viewsBefore: number | null
  viewsAfter: number | null
  viewsDelta: number | null
  historyId: number | null
  warnings?: string[]
}

export type EnrichError = { ok: false; error: string; trackId: number }

let _client: ReturnType<typeof createAdminClient> | null = null
function svc() {
  if (!_client) _client = createAdminClient()
  return _client
}

/**
 * Vienam track'ui:
 *   1) jei !video_url ir (force || !youtube_searched_at) — search YT
 *   2) jei (po žingsnio 1) turim videoId — fetch tikslų viewCount
 *   3) update tracks row + insert track_video_views_history
 */
export async function enrichTrack(trackId: number, force = false): Promise<EnrichResult | EnrichError> {
  const supabase = svc()
  const warnings: string[] = []

  const { data: track, error: tErr } = await supabase
    .from('tracks')
    .select('id, title, artist_id, video_url, youtube_searched_at, video_views, video_views_checked_at')
    .eq('id', trackId)
    .maybeSingle()

  if (tErr) return { ok: false, error: tErr.message, trackId }
  if (!track) return { ok: false, error: 'Track not found', trackId }
  // Defensive: track gali būti `unknown` — narrowinam per any
  const t: any = track

  let artistName = ''
  if (t.artist_id) {
    const { data: artist } = await supabase
      .from('artists')
      .select('name')
      .eq('id', t.artist_id)
      .maybeSingle()
    artistName = (artist as any)?.name || ''
  }

  let videoUrl: string | null = (t.video_url as string | null) || null
  let videoId: string | null = extractVideoIdFromUrl(videoUrl)
  let videoTitle: string | null = null
  let videoChannel: string | null = null
  let matchScore: number | null = null
  let wasSearched = false
  let wasFound = false
  let skipReason: string | null = null
  const updates: Record<string, any> = {}

  const shouldSearch = !videoUrl && (force || !t.youtube_searched_at)
  if (shouldSearch) {
    wasSearched = true
    if (!artistName || !t.title) {
      warnings.push('Trūksta artist name arba track title — search praleidžiamas')
    } else {
      try {
        const results = await searchYouTube(`${artistName} ${t.title}`)
        const outcome = pickBestMatch(artistName, t.title, results)
        if (outcome.ok) {
          const pick = outcome.pick
          videoId = pick.videoId
          videoUrl = `https://www.youtube.com/watch?v=${pick.videoId}`
          videoTitle = pick.title
          videoChannel = pick.channel
          matchScore = pick.score
          updates.video_url = videoUrl
          wasFound = true
        } else {
          // Buvo kandidatų, bet nė vienas nesiekė confidence threshold'o.
          skipReason = outcome.reason
          // Patogus debugui — top kandidatas, kurio neassigninom.
          const topRanked = outcome.ranked[0]
          if (topRanked) {
            videoTitle = topRanked.title
            videoChannel = topRanked.channel
            matchScore = topRanked.score
          }
        }
      } catch (e: any) {
        warnings.push(`Search klaida: ${String(e?.message || e).slice(0, 120)}`)
      }
      // Pažymim, kad ieškojom — net jei nerado / atmetėm. Force pass'as
      // gali iš naujo tikrinti, jei vėliau patikslinam threshold'ą.
      updates.youtube_searched_at = new Date().toISOString()
    }
  }

  let viewsAfter: number | null = null
  let historyId: number | null = null
  const viewsBefore = (t.video_views ?? null) as number | null

  if (videoId) {
    try {
      const details = await getVideoDetails(videoId)
      if (details && !details.isPrivate) {
        viewsAfter = details.viewCount
        updates.video_views = details.viewCount
        updates.video_views_checked_at = new Date().toISOString()

        const { data: hist, error: hErr } = await (supabase
          .from('track_video_views_history') as any)
          .insert({ track_id: trackId, video_id: videoId, views: details.viewCount })
          .select('id')
          .single()
        if (hErr) {
          warnings.push(`History insert failed: ${hErr.message?.slice(0, 120)}`)
        } else {
          historyId = (hist as any)?.id ?? null
        }
      } else if (details?.isPrivate) {
        warnings.push(`Video privatus / pašalintas (videoId=${videoId})`)
      } else {
        warnings.push(`Watch page nerado viewCount (videoId=${videoId})`)
      }
    } catch (e: any) {
      warnings.push(`Views fetch klaida: ${String(e?.message || e).slice(0, 120)}`)
    }
  }

  if (Object.keys(updates).length > 0) {
    const { error: uErr } = await (supabase
      .from('tracks') as any)
      .update(updates)
      .eq('id', trackId)
    if (uErr) {
      warnings.push(`Track update failed: ${uErr.message?.slice(0, 120)}`)
    }
  }

  const viewsDelta = viewsBefore !== null && viewsAfter !== null
    ? viewsAfter - viewsBefore
    : null

  return {
    ok: true,
    trackId,
    trackTitle: t.title || null,
    videoId,
    videoUrl,
    videoTitle,
    videoChannel,
    matchScore,
    wasSearched,
    wasFound,
    skipReason,
    viewsBefore,
    viewsAfter,
    viewsDelta,
    historyId,
    warnings: warnings.length ? warnings : undefined,
  }
}

export { YT_MATCH_THRESHOLD }

