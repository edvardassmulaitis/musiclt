/**
 * YouTube search candidate scoring — kad neassigniname false positive'ų.
 *
 * InnerTube grąžina top 5 kandidatų; mes juos įvertinam pagal:
 *   - artist tokens video title arba channel'yje
 *   - track tokens video title
 *   - duration sanity (30s..25min)
 *   - VEVO/Topic/official channel boost
 *   - very-low-views penalty (sketchy uploads)
 *
 * Threshold (>=) sprendžia, ar priskirti video. Jei NĖ vienas nesiekia,
 * track lieka be video_url, o caller gauna `skipReason` paaiškinti.
 */
import type { YtSearchResult } from './yt-innertube'

export type ScoredCandidate = YtSearchResult & {
  score: number
  reasons: string[]   // why this score (debug)
  artistRatio: number // 0..1 — geriausia iš title/channel artist token coverage'o
  trackRatio: number  // 0..1 — track tokens title'e
}

const ACCEPT_THRESHOLD = 60        // bendras balas iš ~120 max
const MIN_ARTIST_RATIO = 0.5       // hard gate: >=50% artist tokenų title ARBA channel'yje
const MIN_DURATION_S = 25
const MAX_DURATION_S = 1500        // 25min — DJ set'ai/pilnaalbumai per ilgi
const LOW_VIEW_THRESHOLD = 50      // mažiau už šitą — sketchy upload, bandom kitą

/** Lowercase, strip diacritics, drop common parens/brackets/feat segments, keep alphanumerics. */
export function normalizeText(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // diacritics
    .replace(/\([^)]*\)/g, ' ')                          // (lyric video), (feat. X)
    .replace(/\[[^\]]*\]/g, ' ')                         // [official], [HD]
    .replace(/\bfeat\.?\b|\bft\.?\b|\bfeaturing\b/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(s: string): string[] {
  return normalizeText(s).split(' ').filter(t => t.length >= 2)
}

/** "1:23" / "12:34" / "1:23:45" → seconds. Empty / unparseable → 0. */
function durationToSeconds(d: string): number {
  if (!d) return 0
  const parts = d.split(':').map(p => parseInt(p, 10)).filter(n => Number.isFinite(n))
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return 0
}

/** "1.2M views" / "1,234 views" / "1 234 views" → number. 0 jei neparsuojama. */
function viewsToNumber(v: string): number {
  if (!v) return 0
  const m = v.match(/([\d,.\s]+)\s*([KkMmBb]?)/)
  if (!m) return 0
  const numStr = m[1].replace(/[\s,]/g, '')
  const num = parseFloat(numStr)
  if (!Number.isFinite(num)) return 0
  const mult = m[2] === 'K' || m[2] === 'k' ? 1e3
             : m[2] === 'M' || m[2] === 'm' ? 1e6
             : m[2] === 'B' || m[2] === 'b' ? 1e9
             : 1
  return Math.round(num * mult)
}

/**
 * Score one candidate. Skirta naudoti Array.map → sort by score → pick first.
 * artist + track gali būti su LT diakritikomis — vis tiek normalizuojam.
 */
export function scoreCandidate(artist: string, track: string, c: YtSearchResult): ScoredCandidate {
  const artistTokens = tokenize(artist)
  const trackTokens = tokenize(track)
  const titleNorm = normalizeText(c.title)
  const channelNorm = normalizeText(c.channel)
  const reasons: string[] = []

  let score = 0

  // Artist match — 0..40
  let artistRatio = 0
  if (artistTokens.length === 0) {
    score += 10 // unknown artist, neutral
    artistRatio = 1
  } else {
    const inTitle = artistTokens.filter(t => titleNorm.includes(t)).length
    const inChannel = artistTokens.filter(t => channelNorm.includes(t)).length
    artistRatio = Math.max(inTitle, inChannel) / artistTokens.length
    score += Math.round(artistRatio * 40)
    reasons.push(`artist ${inTitle}/${artistTokens.length} title, ${inChannel}/${artistTokens.length} channel`)
  }

  // Track match — 0..50 (bigger weight, kiekvienas track unique)
  let trackRatio = 0
  if (trackTokens.length === 0) {
    reasons.push('NO track tokens (?!)')
  } else {
    const inTitle = trackTokens.filter(t => titleNorm.includes(t)).length
    trackRatio = inTitle / trackTokens.length
    score += Math.round(trackRatio * 50)
    reasons.push(`track ${inTitle}/${trackTokens.length} title`)
  }

  // Channel signals (+10 max)
  const channelBoosts: { re: RegExp; pts: number; tag: string }[] = [
    { re: /\bvevo\b/i,    pts: 10, tag: 'VEVO' },
    { re: /\btopic\b/i,    pts: 8,  tag: 'Topic' },
    { re: /official/i,     pts: 5,  tag: 'official channel' },
  ]
  for (const b of channelBoosts) {
    if (b.re.test(c.channel)) { score += b.pts; reasons.push(`+${b.pts} ${b.tag}`); break }
  }

  // Duration sanity (-30..+5)
  const durSec = durationToSeconds(c.duration)
  if (durSec === 0) {
    reasons.push('NO duration')
  } else if (durSec < MIN_DURATION_S) {
    score -= 30
    reasons.push(`-30 too short (${durSec}s)`)
  } else if (durSec > MAX_DURATION_S) {
    score -= 30
    reasons.push(`-30 too long (${durSec}s)`)
  } else {
    score += 5
  }

  // Very-low-views penalty
  const viewsN = viewsToNumber(c.views)
  if (viewsN > 0 && viewsN < LOW_VIEW_THRESHOLD) {
    score -= 15
    reasons.push(`-15 low views (${viewsN})`)
  }

  return { ...c, score, reasons, artistRatio, trackRatio }
}

export type MatchOutcome =
  | { ok: true; pick: ScoredCandidate; ranked: ScoredCandidate[] }
  | { ok: false; reason: string; ranked: ScoredCandidate[] }

/**
 * Scoring + threshold sprendimas. Grąžina kurį kandidatą priskirti
 * arba paaiškinimą, kodėl praleidžiam.
 *
 * Du gate'ai:
 *   1) HARD: artist token ratio >= 0.5 title ARBA channel'yje. Be artist
 *      atitinkimo nepriskiriam — kitaip "Mano saulė" nukristų į Foje
 *      "O, Mano Saule" (tracko pavadinimas 100% sutampa, bet artist'o
 *      visiškai nėra).
 *   2) SOFT: total score >= 60.
 */
export function pickBestMatch(artist: string, track: string, candidates: YtSearchResult[]): MatchOutcome {
  if (candidates.length === 0) {
    return { ok: false, reason: 'no candidates', ranked: [] }
  }
  const ranked = candidates.map(c => scoreCandidate(artist, track, c))
                            .sort((a, b) => b.score - a.score)

  // Atrenkam kandidatus, praeiusius hard artist gate'ą.
  const artistOk = ranked.filter(c => c.artistRatio >= MIN_ARTIST_RATIO)
  if (artistOk.length === 0) {
    const top = ranked[0]
    return {
      ok: false,
      reason: `artist neatitinka (ratio ${top.artistRatio.toFixed(2)} < ${MIN_ARTIST_RATIO}: "${top.title}" / ${top.channel})`,
      ranked,
    }
  }

  const top = artistOk[0]
  if (top.score >= ACCEPT_THRESHOLD) {
    return { ok: true, pick: top, ranked }
  }
  return {
    ok: false,
    reason: `low confidence (top score ${top.score} < ${ACCEPT_THRESHOLD}: "${top.title}" / ${top.channel})`,
    ranked,
  }
}

export const YT_MATCH_THRESHOLD = ACCEPT_THRESHOLD
