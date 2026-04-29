/**
 * Music.lt Artist Scoring System
 *
 * LT artists:  Catalog/18 + Media/8 + Community/12 + Career/8 = max ~46
 * INT artists: Catalog/25 + Chart/35 + Commercial/25 + Reach/15 = max 100
 *
 * LT artists naturally score lower — they don't have global chart/cert data.
 * score_override (±15) allows admin to adjust for cultural impact.
 */

// ── Types ──────────────────────────────────────────────────────

export type ScoreCategory = {
  points: number
  max: number
  details: string  // human-readable explanation, e.g. "17 albumų, 150 dainų"
}

export type ScoreBreakdown = {
  type: 'lt' | 'int'
  categories: Record<string, ScoreCategory>
  total: number
  score_override: number
  final_score: number
  // Raw input data (for transparency)
  inputs: Record<string, number | string>
}

// ── LT Scoring ─────────────────────────────────────────────────

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
    type: 'lt',
    categories: {
      catalog: { points: catalog, max: 18, details: `${n_albums} alb., ${n_tracks} dainų` },
      media:   { points: media, max: 8, details: `${n_videos} vaizdo klipų, ${n_lyrics} tekstų` },
      community: { points: community, max: 12, details: `${likes} patiktukų` },
      career:  { points: career, max: 8, details: career_years > 0 ? `${career_years} m. karjera` : 'nenurodyta' },
    },
    total,
    score_override: 0,
    final_score: total,
    inputs: { n_albums, n_tracks, n_videos, n_lyrics, likes, career_years },
  }
}

// ── INT Scoring ────────────────────────────────────────────────

export function computeINTScore(data: {
  n_albums: number
  n_tracks: number
  n_videos: number
  n_lyrics: number
  likes: number
  career_years: number
  // Chart data (from album certifications/peak_chart_position)
  n_charted_albums: number    // albums with any chart position
  n_top10_albums: number      // albums peaking in top 10
  n_number1_albums: number    // albums peaking at #1
  n_certified_albums: number  // albums with any certification
  n_platinum_albums: number   // albums with Platinum or higher
  n_diamond_albums: number    // albums with Diamond certification
  total_cert_points: number   // weighted sum: Gold=1, Plat=2, 2xPlat=3, Diamond=10
}): ScoreBreakdown {
  const {
    n_albums, n_tracks, n_videos, n_lyrics, likes, career_years,
    n_charted_albums, n_top10_albums, n_number1_albums,
    n_certified_albums, n_platinum_albums, n_diamond_albums, total_cert_points,
  } = data

  // ① CATALOG (0-25): studio albums + tracks depth
  const albumPts = Math.min(15, Math.round(Math.log(n_albums + 1) * 5))
  const trackPts = Math.min(10, Math.round(Math.log(n_tracks + 1) * 1.8))
  const catalog = Math.min(25, albumPts + trackPts)

  // ② CHART PERFORMANCE (0-35): sqrt scaling for diminishing returns at the top
  const chartedPts = Math.min(8, Math.round(Math.sqrt(n_charted_albums) * 2.5))
  const top10Pts = Math.min(14, Math.round(Math.sqrt(n_top10_albums) * 4.5))
  const no1Pts = Math.min(13, Math.round(Math.sqrt(n_number1_albums) * 3.5))
  const chart = Math.min(35, chartedPts + top10Pts + no1Pts)

  // ③ COMMERCIAL (0-25): sqrt scaling for platinum/diamond
  const certPts = Math.min(8, Math.round(Math.sqrt(total_cert_points) * 1.8))
  const platPts = Math.min(12, Math.round(Math.sqrt(n_platinum_albums) * 4))
  const diamondPts = Math.min(5, n_diamond_albums * 5)
  const commercial = Math.min(25, certPts + platPts + diamondPts)

  // ④ REACH (0-15): career span + media presence
  const careerPts = career_years >= 5
    ? Math.min(8, Math.round(Math.log(career_years) * 2.2))
    : 0
  const mediaPts = Math.min(4, Math.round(Math.sqrt(n_videos) * 1.2))
  const communityPts = likes > 0 ? Math.min(3, Math.round(Math.log(likes + 1) * 0.5)) : 0
  const reach = Math.min(15, careerPts + mediaPts + communityPts)

  const total = Math.min(100, catalog + chart + commercial + reach)

  // Build details strings
  const chartDetails = [
    n_number1_albums > 0 ? `${n_number1_albums} nr. 1` : '',
    n_top10_albums > 0 ? `${n_top10_albums} top 10` : '',
    n_charted_albums > 0 ? `${n_charted_albums} hitparaduose` : 'nėra hitparadų duomenų',
  ].filter(Boolean).join(', ')

  const certDetails = [
    n_diamond_albums > 0 ? `${n_diamond_albums} deimantinių` : '',
    n_platinum_albums > 0 ? `${n_platinum_albums} platininių` : '',
    n_certified_albums > 0 ? `${n_certified_albums} sertifikuotų` : 'nėra sertifikatų',
  ].filter(Boolean).join(', ')

  return {
    type: 'int',
    categories: {
      catalog:    { points: catalog, max: 25, details: `${n_albums} alb., ${n_tracks} dainų` },
      chart:      { points: chart, max: 35, details: chartDetails },
      commercial: { points: commercial, max: 25, details: certDetails },
      reach:      { points: reach, max: 15, details: career_years > 0 ? `${career_years} m. karjera, ${n_videos} klipų` : 'nenurodyta' },
    },
    total,
    score_override: 0,
    final_score: total,
    inputs: {
      n_albums, n_tracks, n_videos, n_lyrics, likes, career_years,
      n_charted_albums, n_top10_albums, n_number1_albums,
      n_certified_albums, n_platinum_albums, n_diamond_albums, total_cert_points,
    },
  }
}

// ── Aggregate cert data from albums ────────────────────────────

type AlbumCertRow = {
  certifications: { region: string; type: string; multiplier: number }[] | null
  peak_chart_position: number | null
}

export function aggregateCertData(albums: AlbumCertRow[]) {
  let n_charted_albums = 0
  let n_top10_albums = 0
  let n_number1_albums = 0
  let n_certified_albums = 0
  let n_platinum_albums = 0
  let n_diamond_albums = 0
  let total_cert_points = 0

  for (const alb of albums) {
    if (alb.peak_chart_position !== null && alb.peak_chart_position > 0) {
      n_charted_albums++
      if (alb.peak_chart_position <= 10) n_top10_albums++
      if (alb.peak_chart_position === 1) n_number1_albums++
    }
    if (alb.certifications && alb.certifications.length > 0) {
      n_certified_albums++
      let hasPlatinum = false, hasDiamond = false
      for (const cert of alb.certifications) {
        const t = cert.type.toLowerCase()
        if (t === 'diamond') {
          hasDiamond = true
          total_cert_points += 10
        } else if (t === 'platinum') {
          hasPlatinum = true
          total_cert_points += 1 + cert.multiplier // Platinum=2, 2xPlat=3, etc.
        } else if (t === 'gold') {
          total_cert_points += 1
        }
      }
      if (hasPlatinum || hasDiamond) n_platinum_albums++
      if (hasDiamond) n_diamond_albums++
    }
  }

  return {
    n_charted_albums, n_top10_albums, n_number1_albums,
    n_certified_albums, n_platinum_albums, n_diamond_albums, total_cert_points,
  }
}

// ── Main scoring function ──────────────────────────────────────

export async function calculateArtistScore(
  supabase: any,
  artistId: number
): Promise<ScoreBreakdown> {
  // Get artist basic info
  const { data: artist } = await supabase
    .from('artists')
    .select('country, active_from, active_until, score_override')
    .eq('id', artistId)
    .single()

  const isLT = !artist?.country || artist.country === 'Lietuva'

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

  const baseData = {
    n_albums: n_albums || 0,
    n_tracks: n_tracks || 0,
    n_videos: n_videos || 0,
    n_lyrics: n_lyrics || 0,
    likes: likes || 0,
    career_years,
  }

  let breakdown: ScoreBreakdown

  if (isLT) {
    breakdown = computeLTScore(baseData)
  } else {
    // INT: also get chart/certification data from albums
    const { data: albumRows } = await supabase
      .from('albums')
      .select('certifications, peak_chart_position')
      .eq('artist_id', artistId)

    const certData = aggregateCertData(albumRows || [])
    breakdown = computeINTScore({ ...baseData, ...certData })
  }

  // Apply override
  const override = artist?.score_override || 0
  breakdown.score_override = override
  breakdown.final_score = Math.max(0, Math.min(100, breakdown.total + override))

  return breakdown
}
