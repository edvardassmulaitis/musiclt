/**
 * Music.lt Artist Scoring System
 *
 * LT artists:  Catalog/18 + Media/8 + Community/12 + Career/8 = max ~46
 * INT artists: Catalog/25 + Albums/35 + Singles/10 + Commercial/15 + Reach/15 = max 100
 *
 * LT artists naturally score lower — they don't have global chart/cert data.
 * score_override (±15) allows admin to adjust for cultural impact.
 */

export type ScoreBreakdown = {
  catalog: number
  media: number
  community: number
  career: number
  total: number
  score_override: number
  final_score: number
}

/**
 * Compute LT artist score from music.lt platform data.
 * Called from the API with aggregated counts from DB.
 */
export function computeLTScore(data: {
  n_albums: number
  n_tracks: number
  n_videos: number
  n_lyrics: number
  likes: number
  career_years: number
}): ScoreBreakdown {
  const { n_albums, n_tracks, n_videos, n_lyrics, likes, career_years } = data

  // ① CATALOG (0-18): albums (log scale) + tracks
  const albumPts = Math.min(15, Math.round(Math.log(n_albums + 1) * 4.5))
  const trackPts = Math.min(5, Math.round(Math.log(n_tracks + 1) * 1.0))
  const catalog = Math.min(18, albumPts + trackPts)

  // ② MEDIA (0-8): videos + lyrics coverage
  const videoPts = Math.min(5, Math.round(Math.sqrt(n_videos) * 1.5))
  const lyricsPts = Math.min(3, Math.round(Math.log(n_lyrics + 1) * 0.7))
  const media = Math.min(8, videoPts + lyricsPts)

  // ③ COMMUNITY (0-12): likes — log scale
  const community = likes > 0
    ? Math.min(12, Math.round(Math.log(likes + 1) * 1.6))
    : 0

  // ④ CAREER BONUS (0-8): bonus only, no penalty for short careers
  const career = career_years >= 5
    ? Math.min(8, Math.round(Math.log(career_years) * 2.2))
    : 0

  const total = Math.min(100, catalog + media + community + career)

  return {
    catalog,
    media,
    community,
    career,
    total,
    score_override: 0,
    final_score: total,
  }
}

/**
 * Gather the data needed for scoring from Supabase,
 * then compute and return the breakdown.
 */
export async function calculateArtistScore(
  supabase: any,
  artistId: number
): Promise<ScoreBreakdown> {
  // Get artist basic info
  const { data: artist } = await supabase
    .from('artists')
    .select('active_from, active_until, score_override')
    .eq('id', artistId)
    .single()

  // Count albums
  const { count: n_albums } = await supabase
    .from('albums')
    .select('*', { count: 'exact', head: true })
    .eq('artist_id', artistId)

  // Count tracks
  const { count: n_tracks } = await supabase
    .from('tracks')
    .select('*', { count: 'exact', head: true })
    .eq('artist_id', artistId)

  // Count tracks with video_url
  const { count: n_videos } = await supabase
    .from('tracks')
    .select('*', { count: 'exact', head: true })
    .eq('artist_id', artistId)
    .not('video_url', 'is', null)

  // Count tracks with lyrics
  const { count: n_lyrics } = await supabase
    .from('tracks')
    .select('*', { count: 'exact', head: true })
    .eq('artist_id', artistId)
    .not('lyrics', 'is', null)

  // Get likes count
  const { count: likes } = await supabase
    .from('artist_likes')
    .select('*', { count: 'exact', head: true })
    .eq('artist_id', artistId)

  // Calculate career years
  const currentYear = new Date().getFullYear()
  const activeFrom = artist?.active_from || 0
  const activeUntil = artist?.active_until || currentYear
  const career_years = activeFrom > 0 ? (activeUntil - activeFrom) : 0

  const breakdown = computeLTScore({
    n_albums: n_albums || 0,
    n_tracks: n_tracks || 0,
    n_videos: n_videos || 0,
    n_lyrics: n_lyrics || 0,
    likes: likes || 0,
    career_years,
  })

  // Apply override
  const override = artist?.score_override || 0
  breakdown.score_override = override
  breakdown.final_score = Math.max(0, Math.min(100, breakdown.total + override))

  return breakdown
}
