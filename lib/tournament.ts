// lib/tournament.ts
//
// Dainų „playoffs" — vieno stiliaus knockout turnyras. Dainos atrenkamos pagal
// YT peržiūras (populiariausios), ankstyvi ratai išsprendžiami automatiškai
// pagal populiarumą, o aštrusis galas (nuo ketvirtfinalių) sprendžiamas dienos
// bendruomenės balsavimu (dienos dvikova). Kai išaiškėja čempionas — pradedamas
// kito stiliaus turnyras. Visą medį galima parodyti vartotojui.
//
// Šis failas — GRYNA bracket'o logika (be DB), kad būtų lengva testuoti.

export const GENRE_GROUP_IDS = [1000556, 1000557, 1000558, 1000559, 1000560, 1000561, 1000562, 1000563]

// Stiliaus populiarumo eiliškumas (pagal ≥100k YT peržiūrų dainų kiekį — spike'as).
// Populiaresnis stilius → didesnis bracket'as. Rikiuota nuo populiariausio.
export const STYLE_POPULARITY: number[] = [
  1000562, // Rokas
  1000560, // Pop, R&B
  1000563, // Sunkioji
  1000558, // Hip-hop
  1000556, // Alternatyva
  1000557, // Elektroninė, šokių
  1000559, // Kitų stilių
  1000561, // Rimtoji
]

/** Bracket'o dydis pagal stiliaus populiarumą: didesni stiliai → 32, maži → 16. */
export function bracketSizeForStyle(genreId: number): number {
  const rank = STYLE_POPULARITY.indexOf(genreId)
  if (rank < 0) return 16
  return rank < 4 ? 32 : 16   // top-4 stiliai 32, likę 16
}

/** Ratų skaičius (log2). size turi būti 2 laipsnis. */
export function roundsCount(size: number): number {
  return Math.round(Math.log2(size))
}

/**
 * Ratas (1-based), nuo kurio jungiasi bendruomenės balsavimas — ketvirtfinaliai.
 * Ankstesni ratai išsprendžiami automatiškai pagal YT peržiūras.
 * Ketvirtfinalis = ratas, kuriame lieka 8 dalyviai.
 */
export function voteFromRound(size: number): number {
  return Math.max(1, roundsCount(size) - 2)
}

/**
 * Standartinis „seed order" — kad #1 ir #2 galėtų susitikti tik finale.
 * Grąžina seed'ų (1-based) išdėstymą pirmam ratui: [1, n, ... ].
 */
export function seedOrder(size: number): number[] {
  let rounds: number[] = [1, 2]
  while (rounds.length < size) {
    const n = rounds.length * 2
    const next: number[] = []
    for (const s of rounds) {
      next.push(s)
      next.push(n + 1 - s)
    }
    rounds = next
  }
  return rounds
}

export type Seed = { trackId: number; views: number }
export type Match = {
  round: number
  slot: number
  aId: number | null
  bId: number | null
  winnerId: number | null
  decidedBy: 'seed' | 'vote' | null
}

/**
 * Pastato pilną bracket'ą iš surūšiuotų (pagal populiarumą) seed'ų.
 *   * seeds[0] — populiariausias (#1 seed)
 *   * pirmas ratas išdėliojamas pagal seedOrder
 *   * ankstyvi ratai (< voteFromRound) auto-išsprendžiami pagal views
 *   * likę matai lieka su winnerId=null (lauks balsavimo)
 * Grąžina visus matus (visų ratų).
 */
export function buildBracket(seeds: Seed[], size: number): Match[] {
  if (seeds.length < size) throw new Error(`Reikia bent ${size} dainų, gauta ${seeds.length}`)
  const picked = seeds.slice(0, size)
  const order = seedOrder(size)            // 1-based seed pozicijos
  const viewsBySeed = new Map<number, Seed>()
  order.forEach((_, i) => {})
  // seed #k (1-based) → picked[k-1]
  const seedTrack = (seedNo: number) => picked[seedNo - 1]

  const totalRounds = roundsCount(size)
  const voteFrom = voteFromRound(size)
  const matches: Match[] = []

  // 1-as ratas: poros iš seedOrder (order[0] vs order[1], order[2] vs order[3], ...)
  const firstRoundWinners: number[] = []   // trackId per slot
  const firstSlots = size / 2
  for (let slot = 0; slot < firstSlots; slot++) {
    const aSeed = order[slot * 2]
    const bSeed = order[slot * 2 + 1]
    const a = seedTrack(aSeed), b = seedTrack(bSeed)
    const auto = 1 < voteFrom       // ar 1-as ratas auto?
    const winnerId = auto ? (a.views >= b.views ? a.trackId : b.trackId) : null
    matches.push({ round: 1, slot, aId: a.trackId, bId: b.trackId, winnerId, decidedBy: auto ? 'seed' : null })
    firstRoundWinners.push(winnerId ?? a.trackId) // placeholder tolimesniam auto-skaičiavimui
  }

  // Tolimesni ratai
  let prevWinners = firstRoundWinners
  let prevMatches = matches.filter(m => m.round === 1)
  const viewsOf = new Map(picked.map(p => [p.trackId, p.views]))
  for (let round = 2; round <= totalRounds; round++) {
    const slots = size / Math.pow(2, round)
    const auto = round < voteFrom
    const roundWinners: number[] = []
    for (let slot = 0; slot < slots; slot++) {
      // dalyviai — ankstesnio rato dviejų matų nugalėtojai (tik jei auto ir žinomi)
      const wa = prevMatches[slot * 2]?.winnerId ?? null
      const wb = prevMatches[slot * 2 + 1]?.winnerId ?? null
      let winnerId: number | null = null
      let decidedBy: 'seed' | 'vote' | null = null
      if (auto && wa != null && wb != null) {
        winnerId = (viewsOf.get(wa)! >= viewsOf.get(wb)!) ? wa : wb
        decidedBy = 'seed'
      }
      matches.push({ round, slot, aId: wa, bId: wb, winnerId, decidedBy })
      roundWinners.push(winnerId ?? wa ?? -1)
    }
    prevMatches = matches.filter(m => m.round === round)
    prevWinners = roundWinners
  }

  return matches
}
