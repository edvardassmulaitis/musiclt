/**
 * Music.lt Artist Scoring System
 *
 * LT artists:  Catalog/15 + Media/7 + Community/10 + Career/7 + Awards/11 = max 50
 * INT artists: Catalog/20 + Chart/30 + Commercial/20 + Reach/15 + Awards/15 = max 100
 *
 * LT artists naturally score lower — they don't have global chart/cert data.
 * score_override (±15) allows admin to adjust for cultural impact.
 */

/**
 * SIŪLOMAS (dar NEįjungtas į score) Wikipedia žinomumo subscore iš mėnesinių
 * peržiūrų — balansui greta YouTube peržiūrų. Šiuo metu score labiausiai lemia
 * YouTube (LT: popRecent/13 + popAllTime/12 = 25). Wikipedia peržiūros atspindi
 * BENDRĄ kultūrinį žinomumą (ne tik YT), tad gerai subalansuoja atlikėjus, kurie
 * populiarūs, bet ne per YouTube (senesni, ne-vaizdo, tarptautiniai).
 *
 * log10 skalė (cap 12): 100/mėn→4, 1k→6, 10k→8, 100k→10, 1M→12.
 * Prieš įjungiant į computeLTScore/computeINTScore — palyginam realius atlikėjus
 * (dabartinis score vs +wiki) ir suderinam svorį/cap.
 */
export function wikiNotabilityPts(pageviewsMonthly: number | null | undefined, cap = 12): number {
  const pv = typeof pageviewsMonthly === 'number' ? pageviewsMonthly : 0
  if (pv <= 0) return 0
  return Math.min(cap, Math.round(Math.log10(pv + 1) * 2.0))
}

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
 *  Returns { points, max, details } shape ready for breakdown.categories.awards.
 *  LT cap 20 (2026-05-06 v3 — popularity gavo 20pts, awards sumažintas iki 20). */
export function computeAwardsSubscore(agg: AwardAggregation, type: 'lt' | 'int'): ScoreCategory {
  const cap = type === 'int' ? 15 : 20
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
//
// Categories sum to 100. 2026-05-06 v4 atnaujinimas — popularity skaida
// į ALL-TIME + RECENT, kad ilgų catalog'ų atlikėjai neturėtų automatinį
// pranašumą prieš naujus.
//
// Naujos vertės (LT):
//   catalog 22, media 10, community 13, career 10, awards 20,
//   popularity_alltime 12, popularity_recent 13 = 100
//
// All-time popularity = log10(SUM views) — istorinė reach
// Recent popularity = log10(SUM views WHERE release_year >= now-3y)
//                     — dabartinė įtaka
// Atlikėjas turintis daug aktyvių dainų gauna abu balus; legacy artist
// su tik vienu hit'u prieš 20m gauna tik all-time, ne recent.

export function computeLTScore(data: {
  n_albums: number
  n_tracks: number
  n_videos: number
  n_lyrics: number
  likes: number
  career_years: number
  total_video_views?: number       // SUM lifetime
  recent_video_views?: number      // SUM where release_year >= now-3y
  awards?: AwardAggregation
}): ScoreBreakdown {
  const {
    n_albums, n_tracks, n_videos, n_lyrics, likes, career_years,
    total_video_views = 0, recent_video_views = 0, awards
  } = data

  // ① CATALOG (0-22): albums + tracks (log scale)
  const albumPts = Math.min(17, Math.round(Math.log(n_albums + 1) * 5.9))
  const trackPts = Math.min(6, Math.round(Math.log(n_tracks + 1) * 1.3))
  const catalog = Math.min(22, albumPts + trackPts)

  // ② MEDIA (0-10): videos + lyrics coverage
  const videoPts = Math.min(6, Math.round(Math.sqrt(n_videos) * 1.9))
  const lyricsPts = Math.min(4, Math.round(Math.log(n_lyrics + 1) * 1.0))
  const media = Math.min(10, videoPts + lyricsPts)

  // ③ COMMUNITY (0-13): site likes — log scale
  const community = likes > 0
    ? Math.min(13, Math.round(Math.log(likes + 1) * 1.8))
    : 0

  // ④ CAREER BONUS (0-10): bonus only, no penalty for short careers
  const career = career_years >= 5
    ? Math.min(10, Math.round(Math.log(career_years) * 2.85))
    : 0

  // ⑤ AWARDS (0-20)
  const awardsAgg = awards || { major_won:0, major_nominated:0, major_inducted:0, other_won:0, other_nominated:0, channels:0 }
  const awardsCat = computeAwardsSubscore(awardsAgg, 'lt')

  // ⑥ ALL-TIME POPULARITY (0-12): log10(SUM views) × 1.5
  //   1K=4.5, 100K=7.5, 1M=9, 10M=10.5, 100M+=12
  const popAllTime = total_video_views > 0
    ? Math.min(12, Math.round(Math.log10(total_video_views + 1) * 1.5))
    : 0

  // ⑦ RECENT POPULARITY (0-13): log10(SUM views in last 3y) × 1.65
  //   1K=5, 100K=8.25, 1M=9.9, 10M=11.55, 100M+=13
  // Šitas labiausiai svarbus — atvaizduoja CURRENT relevance, ne lifetime.
  const popRecent = recent_video_views > 0
    ? Math.min(13, Math.round(Math.log10(recent_video_views + 1) * 1.65))
    : 0

  const total = Math.min(
    100,
    catalog + media + community + career + awardsCat.points + popAllTime + popRecent
  )

  const fmtViews = (n: number) => n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M perž.`
    : n >= 1_000 ? `${(n / 1_000).toFixed(0)}K perž.`
    : n > 0 ? `${n} perž.` : 'nėra perž.'

  return {
    type: 'lt',
    categories: {
      catalog: { points: catalog, max: 22, details: `${n_albums} alb., ${n_tracks} dainų` },
      media:   { points: media, max: 10, details: `${n_videos} vaizdo klipų, ${n_lyrics} tekstų` },
      popularity_recent:  { points: popRecent, max: 13, details: `pastaraisiais 3m: ${fmtViews(recent_video_views)}` },
      popularity_alltime: { points: popAllTime, max: 12, details: `viso laiko: ${fmtViews(total_video_views)}` },
      community: { points: community, max: 13, details: `${likes} patiktukų` },
      career:  { points: career, max: 10, details: career_years > 0 ? `${career_years} m. karjera` : 'nenurodyta' },
      awards:  { ...awardsCat, max: 20 },
    },
    total,
    score_override: 0,
    final_score: total,
    inputs: { n_albums, n_tracks, n_videos, n_lyrics, likes, career_years, total_video_views, recent_video_views },
  }
}

// ── INT Scoring ────────────────────────────────────────────────
//
// 2026-06-21 v5 — POPULARITY (YouTube views) pridėtas. Anksčiau INT formulė
// VISAI neturėjo populiarumo komponento iš peržiūrų — kai Wiki faktoriai
// (chart/commercial/awards) atjungti, visi nusistovėję atlikėjai gaudavo
// vienodą balą (catalog 20 + reach 15 = 35), todėl „Populiariausi visų laikų"
// užsienio sąrašas neturėjo jokio populiarumo signalo (Metallica = Pink Floyd
// = Eminem = 35, o atsitiktiniai LT-formule suskaičiuoti atlikėjai iškildavo
// į viršų). Dabar — kaip ir LT — naudojam YT peržiūras:
//   popularity_alltime (0-25): log10(SUM views) × 1.7 — lifetime reach
//   popularity_recent  (0-18): log10(SUM views last 3y) × 1.5 — current
// Maksimumai suded­ami virš 100, bet `total = min(100, …)` apkarpo — kai Wiki
// faktoriai įjungti, viskas telpa; kol atjungti, populiarumas + catalog +
// reach duoda prasmingą reitingą užsienio atlikėjams.

export function computeINTScore(data: {
  n_albums: number
  n_tracks: number
  n_videos: number
  n_lyrics: number
  likes: number
  career_years: number
  total_video_views?: number       // SUM lifetime YT views
  recent_video_views?: number      // SUM YT views where release_year >= now-3y
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
    total_video_views = 0, recent_video_views = 0,
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

  // ⑥ ALL-TIME POPULARITY (0-25): log10(SUM lifetime views) × 1.7.
  //   Nesisaturuoja praktikoje (cap 25 ties 10^14.7 perž.) — duoda sklandų
  //   reitingą pagal lifetime reach: 1M≈10, 100M≈14, 1B≈15, 25B≈18.
  const popAllTime = total_video_views > 0
    ? Math.min(25, Math.round(Math.log10(total_video_views + 1) * 1.7))
    : 0

  // ⑦ RECENT POPULARITY (0-18): log10(SUM views last 3y) × 1.5 — current relevance.
  const popRecent = recent_video_views > 0
    ? Math.min(18, Math.round(Math.log10(recent_video_views + 1) * 1.5))
    : 0

  const total = Math.min(
    100,
    catalog + chart + commercial + reach + awardsCat.points + popAllTime + popRecent
  )

  const fmtViews = (n: number) => n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M perž.`
    : n >= 1_000 ? `${(n / 1_000).toFixed(0)}K perž.`
    : n > 0 ? `${n} perž.` : 'nėra perž.'

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
      popularity_recent:  { points: popRecent, max: 18, details: `pastaraisiais 3m: ${fmtViews(recent_video_views)}` },
      popularity_alltime: { points: popAllTime, max: 25, details: `viso laiko: ${fmtViews(total_video_views)}` },
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
      total_video_views, recent_video_views,
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
  total_video_views?: number  // SUM(album track.video_views) — naujas
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

  // Album popularity (0-15): SUM track video_views in this album.
  // log10(views + 1) × 1.9 → 1K=6, 100K=10, 1M=11, 10M=13, 100M+=15.
  // Smarter signal nei vien certifications (kurių LT albumams nėra).
  const totalViews = album.total_video_views || 0
  const popPts = totalViews > 0
    ? Math.min(15, Math.round(Math.log10(totalViews + 1) * 1.9))
    : 0
  categories.popularity = popPts
  score += popPts

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
        total_video_views: totalViews,
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

  // Aggregate views from all album tracks. album_tracks junction → tracks.
  // Skirtumas nuo artist'o: čia tik tracks priklausantys ŠIAM albumui.
  let total_video_views = 0
  try {
    const { data: trackLinks } = await supabase
      .from('album_tracks')
      .select('tracks(video_views)')
      .eq('album_id', albumId)
    for (const r of (trackLinks || []) as any[]) {
      const v = Number(r?.tracks?.video_views) || 0
      total_video_views += v
    }
  } catch {}

  return computeAlbumScore({ ...album, total_video_views }, artistScore)
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

// ── DU YOUTUBE REITINGAI (2026-06-21 v7) ──────────────────────────────────
//
// Edvardo sprendimas: reitingas tik iš YouTube enrich (peržiūros + įkėlimo/
// išleidimo data), bet DVI atskiros formulės, kad nemaišyti „dabar populiaru"
// su „visų laikų":
//
//   1) TRENDING (`score_trending`) — DABARTINIS populiarumas. Esminis rodiklis —
//      PERŽIŪROS PER DIENĄ (vpd = peržiūros ÷ vaizdo amžius). Kyla dabartiniai
//      hitai. Naudojama „Dabar populiaru" sekcijose.
//
//   2) ALL-TIME (`score`) — VISŲ LAIKŲ dydis/legendos. SĄMONINGAI BE recency:
//      bendros peržiūros (aprėptis) + ILGAAMŽIŠKUMAS (kūrybos metų tarpsnis) +
//      katalogas. Taip legendos (The Beatles, Queen, ABBA) kyla virš dabartinių
//      žvaigždžių, nors šių YouTube peržiūrų daugiau. Naudojama „Populiariausi
//      visų laikų" + kaip kanoninis `artists.score`.
//
// Spike apsauga (trending): vaizdo amžius floored ties 30 d.

const clampPts = (raw: number, max: number) => Math.max(0, Math.min(max, Math.round(raw)))

function fmtPerDay(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M/d.`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K/d.`
  if (n > 0) return `${Math.round(n)}/d.`
  return '0/d.'
}
function fmtTotalViews(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} mlrd. perž.`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M perž.`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K perž.`
  return n > 0 ? `${n} perž.` : 'nėra perž.'
}

// ── TRENDING (dabar populiaru) ────────────────────────────────────────────
// v8 (Edvardo prašymu): trending = DABARTINIŲ IŠORINIŲ TOPŲ buvimas (Billboard,
// Spotify Global, Apple, Official UK; LT — M.A.M.A, AGATA, Spotify/Apple LT,
// Lietuvos TOP100) + naujų (≤2 m.) dainų peržiūros per dieną. Topai = autoritetingas
// „kas dabar trendina" signalas, atnaujinamas kasdien (is_current) — numuša grynai
// YouTube-regioninį dominavimą (pvz. ispanakalbiai, kurių YT velocity didžiulė, bet
// globaliuose topuose nėra). Topuose esantys (Taylor, Drake, Olivia Rodrigo) kyla.
export type TrendingScoreData = {
  vpd_2y: number          // SUM(views/age) naujausiems klipams
  views_2y: number; n_2y: number
  chart_best: number      // geriausia (mažiausia) pozicija dabartiniuose topuose; 0 jei nėra
  chart_count: number     // keliuose skirtinguose dabartiniuose topuose yra
  fresh_days: number      // dienų nuo naujausio įkėlimo (ką tik išleido?)
  type: 'lt' | 'int'
}
function chartPoints(best: number, count: number): number {
  if (!best || best <= 0) return 0
  const pos = best <= 1 ? 29 : best <= 3 ? 26 : best <= 5 ? 23 : best <= 10 ? 19
    : best <= 20 ? 15 : best <= 40 ? 10 : best <= 100 ? 5 : 3
  const breadth = Math.min(11, count * 1.4)
  return Math.round(Math.min(45, pos + breadth))
}
// Šviežumas — KĄ TIK išleido (nepriklauso nuo peržiūrų kiekio, tad ir mažesnis
// atlikėjas su nauju albumu gauna trending boostą).
function freshnessPoints(days: number): number {
  if (days <= 21) return 25
  if (days <= 45) return 18
  if (days <= 90) return 10
  if (days <= 180) return 4
  return 0
}
export function computeTrendingScore(data: TrendingScoreData): ScoreBreakdown {
  const { vpd_2y, chart_best, chart_count, fresh_days, type } = data
  // v10 (Edvardo pastabos): trys signalai. ① topai (autoritetas). ② peržiūros/dieną
  // (momentum). ③ ŠVIEŽUMAS — ką tik išleistas albumas duoda boostą net jei perž.
  // dar mažai (svarbu LT atlikėjams: ba. albumas prieš savaitę). Langas sutrauktas:
  // per-dieną tik iš 2025+ dainų (2024 nebėra „trending").
  const charts = chartPoints(chart_best, chart_count)
  // ② PERŽIŪROS / DIENĄ 0-30: 9·log10(vpd)-18 → 10K/d≈18, 100K/d≈27, 1M/d→cap30.
  const popPerDay = vpd_2y > 0 ? clampPts(9 * Math.log10(vpd_2y + 1) - 18, 30) : 0
  // ③ ŠVIEŽUMAS 0-25.
  const freshness = freshnessPoints(fresh_days)
  const total = Math.min(100, charts + popPerDay + freshness)
  const freshLabel = fresh_days <= 180 ? `prieš ${fresh_days} d.` : 'seniai'
  return {
    type,
    categories: {
      charts:     { points: charts, max: 45, details: chart_best > 0 ? `topuose: geriausia #${chart_best}, ${chart_count} sąraš.` : 'nėra dabartiniuose topuose' },
      pop_perday: { points: popPerDay, max: 30, details: `${fmtPerDay(vpd_2y)} (naujų dainų perž./d.)` },
      freshness:  { points: freshness, max: 25, details: `naujausias įkėlimas: ${freshLabel}` },
    },
    total, score_override: 0, final_score: total,
    inputs: { vpd_2y: Math.round(vpd_2y), chart_best, chart_count, fresh_days },
  }
}

// ── ALL-TIME (visų laikų, be recency) ─────────────────────────────────────
export type AllTimeScoreData = {
  total_views: number; n_videos: number; debut_year: number
  legacy_likes: number    // music.lt senojo puslapio „patinka" — pre-YouTube populiarumas
  type: 'lt' | 'int'
}
export function computeAllTimeScore(data: AllTimeScoreData): ScoreBreakdown {
  const { total_views, n_videos, debut_year, legacy_likes, type } = data
  // v9 kalibracija (Edvardo pastabos): (1) PERŽIŪROS dar platesnės — Coldplay
  // (16 mlrd.) nebelieka lygus Bonnie Tyler (2 mlrd.); klasika dar sumažinta —
  // ABBA nebelipa virš didesnės aprėpties Bon Jovi. (2) NAUJA: music.lt senojo
  // puslapio „patinka" (legacy_likes) — pre-YouTube populiarumas. Iškelia LT
  // legendas (Mamontovas 1016, Mikutavičius 720, SEL 469, Foje 581), kurių
  // YouTube perž. mažai, bet music.lt buvo didžiulis; veikia ir užsienio
  // klasikams, populiariems music.lt (Metallica 920, Coldplay 740, Madonna 164).
  //
  // ① BENDRA APRĖPTIS (viso peržiūrų) 0-62 — PAGRINDINIS, plati skalė.
  //   100M≈38, 1mlrd≈50, 5mlrd≈58, 16mlrd+→cap 62.
  const reachTotal = total_views > 0 ? clampPts(12 * Math.log10(total_views + 1) - 58, 62) : 0
  const audience = Math.min(1, reachTotal / 20)
  // ② MUSIC.LT PALIKIMAS (senojo puslapio „patinka") 0-20 — pre-YouTube populiarumas.
  //   ~30 like→0, 100→4, 300→9, 700→16, 1000+→20. Atskiras signalas (ne ×audience).
  const legacy = legacy_likes > 0 ? clampPts((Math.log10(legacy_likes + 1) - 1.5) * 13, 20) : 0
  // ③ KLASIKA (kaip seniai debiutavo) 0-10 — mažas „klasiko" boost'as, ×audience.
  const heritageRaw = debut_year >= 1950 ? Math.min(10, (2005 - debut_year) * 0.27) : 0
  const heritage = clampPts(heritageRaw * audience, 10)
  // ④ KATALOGAS 0-10 — gylis (ne vienas hitas). ×audience.
  const catalogRaw = n_videos > 0 ? Math.min(10, 5 * Math.log10(n_videos + 1)) : 0
  const catalogYt = clampPts(catalogRaw * audience, 10)
  const total = Math.min(100, reachTotal + legacy + heritage + catalogYt)
  return {
    type,
    categories: {
      reach_total: { points: reachTotal, max: 62, details: `viso: ${fmtTotalViews(total_views)}` },
      legacy:      { points: legacy, max: 20, details: legacy_likes > 0 ? `music.lt: ${legacy_likes} „patinka"` : 'nėra music.lt duomenų' },
      heritage:    { points: heritage, max: 10, details: debut_year >= 1950 ? `klasika — debiutas ${debut_year}` : 'modernus / nenurodyta' },
      catalog_yt:  { points: catalogYt, max: 10, details: `${n_videos} klipų su peržiūromis` },
    },
    total, score_override: 0, final_score: total,
    inputs: { total_views, n_videos, debut_year, legacy_likes },
  }
}

// Back-compat alias (senas pavadinimas).
export const computeYTScore = computeTrendingScore

// ── Bendras duomenų surinkimas (vienas track fetch) ────────────────────────
async function gatherArtistYT(supabase: any, artistId: number) {
  const { data: artist } = await supabase
    .from('artists')
    .select('country, score_override, legacy_likes')
    .eq('id', artistId)
    .single()
  const isLT = !artist?.country || artist.country === 'Lietuva'

  const { data: trackRows } = await supabase
    .from('tracks')
    .select('video_views, video_uploaded_at, release_year')
    .eq('artist_id', artistId)

  const now = Date.now()
  const DAY = 86_400_000
  // Trending langas SUTRAUKTAS (Edvardo pastaba: 2024 nebėra „trending"). Recent =
  // šiemet/pernai (release_year >= curYear-1, t.y. 2025+) arba įkelta per ~15 mėn.
  const recentCutoff = now - 460 * DAY
  const AGE_FLOOR = 14   // d. — kad ką tik išleistas albumas gautų realų per-dieną boostą
  const curYear = new Date().getFullYear()
  let total_views = 0, n_videos = 0
  let vpd_2y = 0, views_2y = 0, n_2y = 0
  let debutYear = 0
  let newestUploadTs = 0   // šviežumui — naujausio įkėlimo data
  for (const r of (trackRows || []) as any[]) {
    // KLASIKAI (debiuto metams) — release_year tik validžiame intervale.
    // 1970 atmetama: Unix-epoch placeholder iš blogų parse'ų (pvz. Shawn
    // Mendes 17 dainų „1970"). <1950 atmetama: pre-1950 placeholderiai/klaidos
    // (modernus atlikėjas su viena klaidinga sena daina negautų netikros klasikos).
    const ry = Number(r.release_year) || 0
    if (ry >= 1950 && ry <= curYear + 1 && ry !== 1970) {
      if (debutYear === 0 || ry < debutYear) debutYear = ry
    }
    const v = Number(r.video_views) || 0
    if (v <= 0) continue
    n_videos++
    total_views += v   // all-time aprėpčiai
    let uploadTs: number | null = null
    if (r.video_uploaded_at) { const t = Date.parse(r.video_uploaded_at); if (!Number.isNaN(t)) { uploadTs = t; if (t > newestUploadTs) newestUploadTs = t } }
    const ts = uploadTs !== null ? uploadTs : (ry ? Date.UTC(ry, 0, 1) : null)
    if (ts === null) continue
    // Trending recency — „pastarieji 2 metai". release_year yra tiesa kai yra
    // (2024+ = recent net jei nėra įkėlimo datos; anksčiau Jan-1 paversdavo 2024
    // dainą 2.4 m. sena → klaidingai iškrisdavo, pvz. ba. 20 dainų → 0). Be metų
    // — pagal įkėlimo datą.
    const recent = ry >= 1950 ? (ry >= curYear - 1) : (uploadTs !== null && uploadTs >= recentCutoff)
    if (recent) {
      const ageDays = Math.max(AGE_FLOOR, (now - ts) / DAY)
      vpd_2y += v / ageDays
      views_2y += v
      n_2y++
    }
  }
  const type: 'lt' | 'int' = isLT ? 'lt' : 'int'
  const fresh_days = newestUploadTs > 0 ? Math.floor((now - newestUploadTs) / DAY) : 99999

  // Dabartiniai išoriniai topai (trending'ui) — atitinkamo scope (lt/world).
  let chart_best = 0, chart_count = 0
  try {
    const { data: chartRows } = await supabase
      .from('external_chart_entries')
      .select('position, chart_id, external_charts!inner(is_current, scope)')
      .eq('artist_id', artistId)
      .eq('external_charts.is_current', true)
      .eq('external_charts.scope', isLT ? 'lt' : 'world')
    const charts = new Set<number>()
    for (const r of (chartRows || []) as any[]) {
      const p = Number(r.position) || 0
      if (p > 0 && (chart_best === 0 || p < chart_best)) chart_best = p
      if (r.chart_id) charts.add(r.chart_id)
    }
    chart_count = charts.size
  } catch {}

  const override = artist?.score_override || 0
  const legacy_likes = Number(artist?.legacy_likes) || 0
  return { vpd_2y, views_2y, n_2y, total_views, n_videos, debut_year: debutYear, legacy_likes, chart_best, chart_count, fresh_days, type, override }
}

function applyOverride(bd: ScoreBreakdown, override: number): ScoreBreakdown {
  bd.score_override = override
  bd.final_score = Math.max(0, Math.min(100, bd.total + override))
  return bd
}

/** Abu reitingai vienu kreipimusi. */
export async function calculateArtistScores(
  supabase: any,
  artistId: number
): Promise<{ alltime: ScoreBreakdown; trending: ScoreBreakdown }> {
  const d = await gatherArtistYT(supabase, artistId)
  const alltime = applyOverride(
    computeAllTimeScore({ total_views: d.total_views, n_videos: d.n_videos, debut_year: d.debut_year, legacy_likes: d.legacy_likes, type: d.type }),
    d.override,
  )
  const trending = applyOverride(
    computeTrendingScore({ vpd_2y: d.vpd_2y, views_2y: d.views_2y, n_2y: d.n_2y, chart_best: d.chart_best, chart_count: d.chart_count, fresh_days: d.fresh_days, type: d.type }),
    d.override,
  )
  return { alltime, trending }
}

/** Back-compat: kanoninis `score` = ALL-TIME breakdown. */
export async function calculateArtistScore(
  supabase: any,
  artistId: number
): Promise<ScoreBreakdown> {
  const { alltime } = await calculateArtistScores(supabase, artistId)
  return alltime
}

