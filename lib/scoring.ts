/**
 * Music.lt Artist Scoring System
 *
 * LT artists:  Catalog/15 + Media/7 + Community/10 + Career/7 + Awards/11 = max 50
 * INT artists: Catalog/20 + Chart/30 + Commercial/20 + Reach/15 + Awards/15 = max 100
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

// ── Awards aggregation ────────────────────────────────────────
// Major awards get higher per-entry weight. Channel name match (case-insensitive
// substring) — keeps simple, matches common usage on Wikipedia article headings.

const MAJOR_AWARD_KEYWORDS = [
  'grammy', 'brit award', 'ivor novello',
  'hall of fame', 'rock and roll hall',
  'mtv video music award', 'mtv europe music award',
  'nme award', 'billboard music award',
  'aria award', 'echo award', 'q award',
  'juno award', 'apra music award',
  'rolling stone',
]

function isMajorAward(channelName: string): boolean {
  const low = (channelName || '').toLowerCase()
  return MAJOR_AWARD_KEYWORDS.some(k => low.includes(k))
}

export type AwardAggregation = {
  major_won: number
  major_nominated: number
  major_inducted: number
  other_won: number
  other_nominated: number
  channels: number
}

export function aggregateAwardsData(
  awards: { channel_name: string; result: string }[]
): AwardAggregation {
  const channels = new Set<string>()
  let majorWon = 0, majorNom = 0, majorInd = 0
  let otherWon = 0, otherNom = 0
  for (const a of awards) {
    channels.add(a.channel_name)
    const major = isMajorAward(a.channel_name)
    if (a.result === 'won') major ? majorWon++ : otherWon++
    else if (a.result === 'nominated') major ? majorNom++ : otherNom++
    else if (a.result === 'inducted') majorInd++  // Hall of Fame etc — always major
  }
  return {
    major_won: majorWon, major_nominated: majorNom, major_inducted: majorInd,
    other_won: otherWon, other_nominated: otherNom,
    channels: channels.size,
  }
}

/** Awards subscore. Same formula across LT/INT (just different caps).
 *  Returns { points, max, details } shape ready for breakdown.categories.awards. */
export function computeAwardsSubscore(agg: AwardAggregation, type: 'lt' | 'int'): ScoreCategory {
  const cap = type === 'int' ? 15 : 11
  // Major won: 5 each, capped at 10
  const majorWonPts = Math.min(10, agg.major_won * 5)
  // Major nom: 2 each, capped at 6
  const majorNomPts = Math.min(6, agg.major_nominated * 2)
  // Inducted: 5 each, capped at 5
  const inductedPts = Math.min(5, agg.major_inducted * 5)
  // Other won: 1 each, capped at 4
  const otherWonPts = Math.min(4, agg.other_won * 1)
  // Other nominated: 0.5 each, capped at 2 (we round)
  const otherNomPts = Math.min(2, Math.round(agg.other_nominated * 0.5))

  const raw = majorWonPts + majorNomPts + inductedPts + otherWonPts + otherNomPts
  const points = Math.min(cap, raw)

  const parts: string[] = []
  if (agg.major_won > 0) parts.push(`${agg.major_won} major laimėjo`)
  if (agg.major_inducted > 0) parts.push(`${agg.major_inducted} HoF`)
  if (agg.major_nominated > 0) parts.push(`${agg.major_nominated} major nom.`)
  if (agg.other_won > 0) parts.push(`${agg.other_won} kt. laimėjo`)
  if (agg.other_nominated > 0) parts.push(`${agg.other_nominated} kt. nom.`)
  const details = parts.length > 0
    ? parts.join(', ')
    : 'nėra apdovanojimų duomenų'

  return { points, max: cap, details }
}

// ── LT Scoring ─────────────────────────────────────────────────

export function computeLTScore(data: {
  n_albums: number
  n_tracks: number
  n_videos: number
  n_lyrics: number
  likes: number
  career_years: number
  awards?: AwardAggregation
}): ScoreBreakdown {
  const { n_albums, n_tracks, n_videos, n_lyrics, likes, career_years, awards } = data

  // ① CATALOG (0-15): albums (log scale) + tracks
  const albumPts = Math.min(12, Math.round(Math.log(n_albums + 1) * 4.0))
  const trackPts = Math.min(4, Math.round(Math.log(n_tracks + 1) * 0.9))
  const catalog = Math.min(15, albumPts + trackPts)

  // ② MEDIA (0-7): videos + lyrics coverage
  const videoPts = Math.min(4, Math.round(Math.sqrt(n_videos) * 1.3))
  const lyricsPts = Math.min(3, Math.round(Math.log(n_lyrics + 1) * 0.7))
  const media = Math.min(7, videoPts + lyricsPts)

  // ③ COMMUNITY (0-10): likes — log scale
  const community = likes > 0
    ? Math.min(10, Math.round(Math.log(likes + 1) * 1.4))
    : 0

  // ④ CAREER BONUS (0-7): bonus only, no penalty for short careers
  const career = career_years >= 5
    ? Math.min(7, Math.round(Math.log(career_years) * 2.0))
    : 0

  // ⑤ AWARDS (0-11): aggregated wins + noms across channels
  const awardsAgg = awards || { major_won:0, major_nominated:0, major_inducted:0, other_won:0, other_nominated:0, channels:0 }
  const awardsCat = computeAwardsSubscore(awardsAgg, 'lt')

  const total = Math.min(50, catalog + media + community + career + awardsCat.points)

  return {
    type: 'lt',
    categories: {
      catalog: { points: catalog, max: 15, details: `${n_albums} alb., ${n_tracks} dainų` },
      media:   { points: media, max: 7, details: `${n_videos} vaizdo klipų, ${n_lyrics} tekstų` },
      community: { points: community, max: 10, details: `${likes} patiktukų` },
      career:  { points: career, max: 7, details: career_years > 0 ? `${career_years} m. karjera` : 'nenurodyta' },
      awards:  awardsCat,
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
  awards?: AwardAggregation
}): ScoreBreakdown {
  const {
    n_albums, n_tracks, n_videos, n_lyrics, likes, career_years,
    n_charted_albums, n_top10_albums, n_number1_albums,
    n_certified_albums, n_platinum_albums, n_diamond_albums, total_cert_points,
    awards,
  } = data

  // ① CATALOG (0-20): studio albums + tracks depth
  const albumPts = Math.min(12, Math.round(Math.log(n_albums + 1) * 4.2))
  const trackPts = Math.min(8, Math.round(Math.log(n_tracks + 1) * 1.5))
  const catalog = Math.min(20, albumPts + trackPts)

  // ② CHART PERFORMANCE (0-30): sqrt scaling for diminishing returns at the top
  const chartedPts = Math.min(7, Math.round(Math.sqrt(n_charted_albums) * 2.2))
  const top10Pts = Math.min(12, Math.round(Math.sqrt(n_top10_albums) * 4.0))
  const no1Pts = Math.min(11, Math.round(Math.sqrt(n_number1_albums) * 3.0))
  const chart = Math.min(30, chartedPts + top10Pts + no1Pts)

  // ③ COMMERCIAL (0-20): sqrt scaling for platinum/diamond
  const certPts = Math.min(6, Math.round(Math.sqrt(total_cert_points) * 1.5))
  const platPts = Math.min(10, Math.round(Math.sqrt(n_platinum_albums) * 3.5))
  const diamondPts = Math.min(4, n_diamond_albums * 4)
  const commercial = Math.min(20, certPts + platPts + diamondPts)

  // ④ REACH (0-15): career span + media presence
  const careerPts = career_years >= 5
    ? Math.min(8, Math.round(Math.log(career_years) * 2.2))
    : 0
  const mediaPts = Math.min(4, Math.round(Math.sqrt(n_videos) * 1.2))
  const communityPts = likes > 0 ? Math.min(3, Math.round(Math.log(likes + 1) * 0.5)) : 0
  const reach = Math.min(15, careerPts + mediaPts + communityPts)

  // ⑤ AWARDS (0-15): Grammy/Brit/Hall of Fame etc. + other industry awards
  const awardsAgg = awards || { major_won:0, major_nominated:0, major_inducted:0, other_won:0, other_nominated:0, channels:0 }
  const awardsCat = computeAwardsSubscore(awardsAgg, 'int')

  const total = Math.min(100, catalog + chart + commercial + reach + awardsCat.points)

  // Build details strings
  const chartDetails = [
    n_number1_albums > 0 ? `${n_number1_albums} nr. 1` : '',
    n_top10_albums > 0 ? `${n_top10_albums} top 10` : '',
    n_charted_albums > 0 ? `${n_charted_albums} topuose` : 'nėra duomenų apie pasirodymus topuose',
  ].filter(Boolean).join(', ')

  const certDetails = [
    n_diamond_albums > 0 ? `${n_diamond_albums} deimantinių` : '',
    n_platinum_albums > 0 ? `${n_platinum_albums} platininių` : '',
    n_certified_albums > 0 ? `${n_certified_albums} sertifikuotų` : 'nėra sertifikatų',
  ].filter(Boolean).join(', ')

  return {
    type: 'int',
    categories: {
      catalog:    { points: catalog, max: 20, details: `${n_albums} alb., ${n_tracks} dainų` },
      chart:      { points: chart, max: 30, details: chartDetails },
      commercial: { points: commercial, max: 20, details: certDetails },
      reach:      { points: reach, max: 15, details: career_years > 0 ? `${career_years} m. karjera, ${n_videos} klipų` : 'nenurodyta' },
      awards:     awardsCat,
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

// ── ALBUM SCORING (mirrors Python wiki_worker.compute_album_score) ─
// Scale 0-100. Inputs: album type, certifications, peak chart, track_count, year, artist_score.

export type AlbumScoreInputs = {
  type_studio?: boolean
  type_ep?: boolean
  type_compilation?: boolean
  type_remix?: boolean
  type_live?: boolean
  type_single?: boolean
  certifications?: { type: string; multiplier?: number }[] | null
  peak_chart_position?: number | null
  track_count?: number | null
  year?: number | null
}

export type AlbumScoreResult = {
  final_score: number
  breakdown: {
    categories: Record<string, number>
    inputs: Record<string, any>
  }
}

export function computeAlbumScore(album: AlbumScoreInputs, artistScore: number = 0): AlbumScoreResult {
  let score = 0
  const categories: Record<string, number> = {}

  // Type bonus
  let typePts = 0
  if (album.type_studio) typePts = 10
  else if (album.type_ep) typePts = 6
  else if (album.type_compilation) typePts = 4
  else if (album.type_remix) typePts = 3
  categories.type = typePts
  score += typePts

  // Certifications
  let certPts = 0
  let hasPlatinum = false
  let hasDiamond = false
  const certs = album.certifications || []
  for (const c of certs) {
    const t = (c.type || '').toLowerCase()
    const m = c.multiplier || 1
    if (t === 'diamond') { hasDiamond = true; certPts += 30 }
    else if (t === 'platinum') { hasPlatinum = true; certPts += 10 + 3 * m }
    else if (t === 'gold') { certPts += 6 }
  }
  certPts = Math.min(40, certPts)
  categories.certifications = certPts
  score += certPts

  // Peak chart
  let chartPts = 0
  const peak = album.peak_chart_position
  if (peak) {
    if (peak === 1) chartPts = 25
    else if (peak <= 10) chartPts = 15
    else if (peak <= 50) chartPts = 8
    else chartPts = 3
  }
  categories.chart = chartPts
  score += chartPts

  // Track count (log)
  const tc = album.track_count || 0
  const tcPts = tc > 0 ? Math.min(10, Math.round(Math.log(tc + 1) * 3)) : 0
  categories.track_count = tcPts
  score += tcPts

  // Year recency
  const year = album.year || 0
  if (year) {
    const age = Math.max(0, 2026 - year)
    const yearPts = age < 50 ? Math.max(0, Math.min(5, Math.round(5 - age * 0.05))) : 1
    categories.year = yearPts
    score += yearPts
  }

  // Inherit a fraction of artist score (0-10)
  const artistPts = Math.min(10, Math.floor(artistScore / 10))
  categories.artist_score = artistPts
  score += artistPts

  return {
    final_score: Math.min(100, score),
    breakdown: {
      categories,
      inputs: {
        certifications_count: certs.length,
        has_diamond: hasDiamond,
        has_platinum: hasPlatinum,
        peak_chart_position: peak ?? null,
        track_count: tc,
        year,
        artist_score: artistScore,
      },
    },
  }
}

export async function calculateAlbumScore(
  supabase: any,
  albumId: number
): Promise<AlbumScoreResult> {
  const { data: album } = await supabase
    .from('albums')
    .select('type_studio, type_ep, type_compilation, type_remix, type_live, type_single, certifications, peak_chart_position, track_count, year, artist_id')
    .eq('id', albumId)
    .single()
  if (!album) {
    return { final_score: 0, breakdown: { categories: {}, inputs: {} } }
  }
  let artistScore = 0
  if (album.artist_id) {
    const { data: artistRow } = await supabase
      .from('artists')
      .select('score')
      .eq('id', album.artist_id)
      .single()
    artistScore = artistRow?.score || 0
  }
  return computeAlbumScore(album, artistScore)
}

// ── TRACK SCORING (mirrors Python wiki_worker.compute_track_score) ─
// Scale 0-100. Inputs: is_single, certifications, peak chart, lyrics, video, year, artist_score.

export type TrackScoreInputs = {
  type?: string | null
  is_single?: boolean
  certifications?: { type: string; multiplier?: number }[] | null
  peak_chart_position?: number | null
  lyrics?: string | null
  video_url?: string | null
  release_year?: number | null
}

export type TrackScoreResult = AlbumScoreResult  // same shape

export function computeTrackScore(
  track: TrackScoreInputs,
  album?: { year?: number | null } | null,
  artistScore: number = 0
): TrackScoreResult {
  let score = 0
  const categories: Record<string, number> = {}

  // Single bonus
  const isSingle = track.is_single || track.type === 'single'
  if (isSingle) {
    score += 8
    categories.single = 8
  } else {
    categories.single = 0
  }

  // Certifications (per-track)
  let certPts = 0
  const certs = track.certifications || []
  for (const c of certs) {
    const t = (c.type || '').toLowerCase()
    const m = c.multiplier || 1
    if (t === 'diamond') certPts += 25
    else if (t === 'platinum') certPts += 10 + 2 * m
    else if (t === 'gold') certPts += 5
  }
  certPts = Math.min(35, certPts)
  categories.certifications = certPts
  score += certPts

  // Peak chart
  let chartPts = 0
  const peak = track.peak_chart_position
  if (peak) {
    if (peak === 1) chartPts = 25
    else if (peak <= 10) chartPts = 15
    else if (peak <= 50) chartPts = 8
  }
  categories.chart = chartPts
  score += chartPts

  // Lyrics / video
  const hasLyrPts = track.lyrics ? 5 : 0
  const hasVidPts = track.video_url ? 8 : 0
  categories.lyrics = hasLyrPts
  categories.video = hasVidPts
  score += hasLyrPts + hasVidPts

  // Year
  const year = track.release_year || album?.year || 0
  if (year) {
    const age = Math.max(0, 2026 - year)
    const yearPts = age < 50 ? Math.max(0, Math.min(3, Math.round(3 - age * 0.04))) : 1
    categories.year = yearPts
    score += yearPts
  }

  // Inherit artist score (0-8)
  const artistPts = Math.min(8, Math.floor(artistScore / 12))
  categories.artist_score = artistPts
  score += artistPts

  return {
    final_score: Math.min(100, score),
    breakdown: {
      categories,
      inputs: {
        is_single: isSingle,
        peak_chart_position: peak ?? null,
        has_lyrics: !!track.lyrics,
        has_video: !!track.video_url,
        year,
        artist_score: artistScore,
      },
    },
  }
}

export async function calculateTrackScore(
  supabase: any,
  trackId: number
): Promise<TrackScoreResult> {
  const { data: track } = await supabase
    .from('tracks')
    .select('type, peak_chart_position, certifications, lyrics, video_url, release_year, artist_id')
    .eq('id', trackId)
    .single()
  if (!track) {
    return { final_score: 0, breakdown: { categories: {}, inputs: {} } }
  }
  // Album + artist score lookups
  let albumYear: number | null = null
  const { data: at } = await supabase
    .from('album_tracks')
    .select('is_primary, albums!album_tracks_album_id_fkey(year)')
    .eq('track_id', trackId)
    .limit(1)
  let isSingle = false
  if (at && at.length > 0) {
    const row: any = at[0]
    isSingle = !!row.is_primary
    albumYear = row.albums?.year ?? null
  }
  let artistScore = 0
  if (track.artist_id) {
    const { data: artistRow } = await supabase
      .from('artists')
      .select('score')
      .eq('id', track.artist_id)
      .single()
    artistScore = artistRow?.score || 0
  }
  return computeTrackScore(
    { ...track, is_single: isSingle },
    { year: albumYear },
    artistScore
  )
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

  // Vieningas likes count — viena lentelė (`likes`) saugo modern auth +
  // legacy music.lt + anon. Score formulai svarbu tik bendras skaičius.
  const { count: likeCount } = await supabase
    .from('likes')
    .select('*', { count: 'exact', head: true })
    .eq('entity_type', 'artist')
    .eq('entity_id', artistId)
  const likes = likeCount || 0

  // Calculate career years
  const currentYear = new Date().getFullYear()
  const activeFrom = artist?.active_from || 0
  const activeUntil = artist?.active_until || currentYear
  const career_years = activeFrom > 0 ? (activeUntil - activeFrom) : 0

  // Awards aggregate (from voting_participants ↔ channels metadata)
  // We join 3 levels: participants → events → editions → channels.
  // Filter by metadata.imported_from_award so only Wikipedia-imported entries
  // (not user-voted active competitions) feed into the score.
  const { data: awardRows } = await supabase
    .from('voting_participants')
    .select('metadata, voting_events!inner(voting_editions!inner(voting_channels!inner(name)))')
    .eq('artist_id', artistId)
  const awardEntries: { channel_name: string; result: string }[] = []
  for (const r of (awardRows || []) as any[]) {
    if (!r.metadata?.imported_from_award) continue
    const ch = r.voting_events?.voting_editions?.voting_channels
    if (!ch?.name) continue
    awardEntries.push({ channel_name: ch.name, result: r.metadata?.result || 'other' })
  }
  const awardsAgg = aggregateAwardsData(awardEntries)

  const baseData = {
    n_albums: n_albums || 0,
    n_tracks: n_tracks || 0,
    n_videos: n_videos || 0,
    n_lyrics: n_lyrics || 0,
    likes: likes || 0,
    career_years,
    awards: awardsAgg,
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
