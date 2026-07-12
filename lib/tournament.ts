// lib/tournament.ts
//
// Dainų „playoffs" — knockout turnyrai iš populiariausių (pagal YT peržiūras)
// dainų. VISI ratai sprendžiami bendruomenės balsavimu (dienos dvikova) —
// savininko sprendimas 2026-07-12: tikslas kuo daugiau dvikovų, kad turnyrai
// suktųsi metų metus; auto-ratų nebėra. Kai išaiškėja čempionas — startuoja
// kitas turnyras eilėje, o pasibaigus visiems galima seed'inti naują sezoną
// iš dar nedalyvavusių dainų (exclusions + participated filtrai).
//
// Šis failas — GRYNA bracket'o logika ir konfigūracija (be DB).

export const GENRE_GROUP_IDS = [1000556, 1000557, 1000558, 1000559, 1000560, 1000561, 1000562, 1000563]

export const GENRE_NAMES: Record<number, string> = {
  1000556: 'Alternatyva', 1000557: 'Elektroninė, šokių', 1000558: 'Hip-hop', 1000559: 'Kitų stilių',
  1000560: 'Pop, R&B', 1000561: 'Rimtoji', 1000562: 'Rokas', 1000563: 'Sunkioji',
}

// Stiliaus populiarumo eiliškumas (pagal ≥100k YT peržiūrų dainų kiekį).
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

// ── Scope: dvi lygiagrečios turnyrų eilės ──────────────────────────────────
//
// Grynas rikiavimas pagal YT peržiūras lietuvius išstumia visiškai — geriausias
// LT rokas (ba. — SAVO, 30M) prieš OneRepublic (4,4 mlrd.) yra ~100x skirtumas.
// Todėl LT ir pasaulio turnyrai sukasi ATSKIRAI ir lygiagrečiai, o dienos dvikova
// kasdien ateina pakaitomis iš vienos ir kitos eilės.
export type Scope = 'lt' | 'world'
export const SCOPES: Scope[] = ['lt', 'world']

/**
 * Kurio scope dienos dvikova rodoma nurodytą dieną.
 * Deterministiška (be DB): lyginė para nuo epochos → LT, nelyginė → pasaulis.
 */
export function scopeOfDay(date: Date = new Date()): Scope {
  const dayNo = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000)
  return dayNo % 2 === 0 ? 'lt' : 'world'
}

// ── Kuruoti pogrupiai ───────────────────────────────────────────────────────
//
// Dideli stiliai skaidomi į kuruotus pogrupius, kad topiniai atlikėjai tilptų
// (World Pop 32 vietos netalpino Billie Eilish/Beyoncé/Selena Gomez), o platūs
// „sąvartynai" turėtų prasmingą klausimą („geriausia X daina?").
//
// Taisyklės:
//   * grupės tikrinamos IŠ EILĖS — atlikėjas priskiriamas PIRMAI grupei, kurios
//     substilių sąrašas kertasi su jo substiliais (deterministiškas priskyrimas,
//     tas pats atlikėjas nepatenka į du to paties stiliaus turnyrus)
//   * grupė be substyles ir be eraTo = catch-all („Kita"/„Pop") — surenka
//     visus likusius; catch-all turi eiti PASKUTINIS
//   * jei stilius neskaidomas, seed'as jam sukuria vieną catch-all grupę
export type SubstyleGroup = {
  key: string            // stabilus raktas DB (group_key)
  label: string          // rodomas pavadinimas (title dalis po „›")
  target: number         // siekiamas bracket'o dydis (apkarpomas pagal fitBracket)
  substyles?: string[]   // substilių grupė: atlikėjo substiliai kertasi su sąrašu
  eraTo?: number         // EROS grupė: populiariausios dainos metai <= eraTo
                         //   (metai = release_year, o jei jo nėra — YT upload metai)
  // nei substyles, nei eraTo → catch-all („visi likę"); turi eiti paskutinė
}

// Minimalus populiariausios dainos peržiūrų slenkstis, kad atlikėjas iš viso
// patektų į turnyrą. LT slenkstis saugo nuo visiškai nežinomų vardų dvikovose
// (savininko feedback 2026-07-12: LT Sunkiojoje dugnas buvo 45k peržiūrų).
// 50k, ne 100k — kitaip LT Sunkioji lieka su 7 dainomis ir išnyksta visai;
// niša mieliau gauna mažesnį (8) bracket'ą nei jokio.
export const MIN_VIEWS: Record<Scope, number> = { lt: 50_000, world: 10_000 }

export const SPLIT_CONFIG: Record<Scope, Record<number, SubstyleGroup[]>> = {
  world: {
    // Pop, R&B — per didelis vienam 32 bracket'ui (552+ atlikėjų vien „Pop")
    1000560: [
      { key: 'rnb', label: 'R&B / Soul', target: 32, substyles: ['R&B', 'Soul', 'Blue-eyed soul', 'Hip hop soul', 'Quiet storm', 'New jack swing', 'Southern soul', 'Alternative R&B', 'Pop-soul', 'Doo wop'] },
      { key: 'latin', label: 'Latin', target: 16, substyles: ['Latin pop', 'Bolero', 'Tropical', 'Guajira', 'Reggaeton', 'Latin dance', 'Latin rap', 'Latin trap'] },
      { key: 'pop', label: 'Pop', target: 32 },
    ],
    // Rokas — alternatyvos/indie banga vs klasika
    1000562: [
      { key: 'alt', label: 'Alternative / Indie', target: 32, substyles: ['Alternative rock', 'Indie rock', 'Indie pop', 'Post punk revival', 'Britpop', 'Dream pop', 'Garage rock revival', 'Noise rock', 'Math rock', 'College rock', 'Jangle pop', 'Noise pop', 'Post britpop'] },
      { key: 'rock', label: 'Klasikinis rokas', target: 32 },
    ],
    // Sunkioji — ekstremalus vs klasikinis/modernus metalas
    1000563: [
      { key: 'extreme', label: 'Ekstremalus metalas', target: 32, substyles: ['Black metal', 'Death metal', 'Thrash metal', 'Melodic death metal', 'Doom metal', 'Sludge metal', 'Deathcore', 'Grindcore', 'Technical death metal', 'Death/doom', 'Extreme metal', 'Speed metal', 'Viking metal', 'Pagan metal', 'Funeral doom', 'Deathgrind', 'Atmospheric black metal', 'Crossover thrash'] },
      { key: 'metal', label: 'Metalas', target: 32 },
    ],
    // Rimtoji — semantinis sąvartynas: Jazz vs Chopin vs bliuzas
    1000561: [
      { key: 'jazz', label: 'Jazz', target: 16, substyles: ['Jazz'] },
      { key: 'classical', label: 'Classical', target: 16, substyles: ['Classical'] },
      { key: 'blues', label: 'Blues', target: 16, substyles: ['Blues'] },
      { key: 'kita', label: 'Kita', target: 16 },
    ],
    // Kitų stilių — Country/Filmų/Reggae + „Kita" catch-all, kad neišmestų
    // Israel Kamakawiwo'ole (1,58B), Ylvis ir kitų nepriskirtų
    1000559: [
      { key: 'country', label: 'Country', target: 16, substyles: ['Country'] },
      { key: 'film', label: 'Filmų muzika', target: 16, substyles: ['Filmų muzika'] },
      { key: 'reggae', label: 'Reggae', target: 16, substyles: ['Reggae'] },
      { key: 'kita', label: 'Kita', target: 16 },
    ],
  },
  lt: {
    // LT Pop — ~300 tinkamų atlikėjų į 32 vietas, skaidom pagal ERĄ, ne
    // substilius (substiliai Baumilą ir Jessica Shy išmėtė į skirtingas
    // grupes — beprasmiška). Riba 2011/2012: „Aukso fondas" — Povilaitis,
    // Kučinskas, ŽAS, SEL, Mango era; „Pop" — dabartinė banga.
    1000560: [
      { key: 'fondas', label: 'Aukso fondas', target: 32, eraTo: 2011 },
      { key: 'pop', label: 'Pop', target: 32 },
    ],
    // Kiti LT stiliai neskaidomi — per maži (LT Rimtoji ~30 atlikėjų)
  },
}

/** Stiliaus grupės nurodytame scope (neskaidomas stilius → viena catch-all). */
export function groupsForStyle(genreId: number, scope: Scope): SubstyleGroup[] {
  const cfg = SPLIT_CONFIG[scope]?.[genreId]
  if (cfg) return cfg
  return [{ key: '', label: GENRE_NAMES[genreId] ?? String(genreId), target: defaultTarget(genreId) }]
}

/** Numatytasis bracket'o dydis pagal stiliaus populiarumą (top-4 → 32). */
function defaultTarget(genreId: number): number {
  const rank = STYLE_POPULARITY.indexOf(genreId)
  if (rank < 0) return 16
  return rank < 4 ? 32 : 16
}

/** Mažiausias prasmingas bracket'as. Mažiau nei 8 dainos — turnyras neverta. */
export const MIN_BRACKET = 8

/** Didžiausias 2 laipsnis, telpantis į turimą dainų kiekį (32 → 16 → 8). */
export function fitBracket(available: number): number {
  if (available >= 32) return 32
  if (available >= 16) return 16
  if (available >= MIN_BRACKET) return MIN_BRACKET
  return 0
}

/** Ratų skaičius (log2). size turi būti 2 laipsnis. */
export function roundsCount(size: number): number {
  return Math.round(Math.log2(size))
}

/**
 * Ratas, nuo kurio jungiasi bendruomenės balsavimas — dabar VISADA 1 (visi
 * ratai balsuojami). Funkcija palikta dėl suderinamumo su DB stulpeliu.
 */
export function voteFromRound(_size: number): number {
  return 1
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
 *   * VISI matai lieka su winnerId=null — kiekvieną spręs balsavimas;
 *     vėlesnių ratų dalyviai užsipildys resolver'iui perkeliant nugalėtojus
 */
export function buildBracket(seeds: Seed[], size: number): Match[] {
  if (seeds.length < size) throw new Error(`Reikia bent ${size} dainų, gauta ${seeds.length}`)
  const picked = seeds.slice(0, size)
  const order = seedOrder(size)            // 1-based seed pozicijos
  const seedTrack = (seedNo: number) => picked[seedNo - 1]

  const totalRounds = roundsCount(size)
  const matches: Match[] = []

  // 1-as ratas: poros iš seedOrder (order[0] vs order[1], order[2] vs order[3], ...)
  const firstSlots = size / 2
  for (let slot = 0; slot < firstSlots; slot++) {
    const a = seedTrack(order[slot * 2])
    const b = seedTrack(order[slot * 2 + 1])
    matches.push({ round: 1, slot, aId: a.trackId, bId: b.trackId, winnerId: null, decidedBy: null })
  }

  // Tolimesni ratai — tušti (dalyviai atsiras, kai resolver'is perkels nugalėtojus)
  for (let round = 2; round <= totalRounds; round++) {
    const slots = size / Math.pow(2, round)
    for (let slot = 0; slot < slots; slot++) {
      matches.push({ round, slot, aId: null, bId: null, winnerId: null, decidedBy: null })
    }
  }

  return matches
}

// ── Dvikovų kalendorius ─────────────────────────────────────────────────────
//
// Kiekvienas scope gauna dieną pakaitomis (scopeOfDay). Matai eina eilės
// tvarka: turnyras (sort_order) → ratas → slot'as. i-tasis laukiantis mato
// balsavimas vyks i-tąją TO SCOPE dieną nuo šiandien.

/** Artimiausios N datų, kuriomis dienos dvikova priklauso šiam scope. */
export function nextScopeDates(scope: Scope, count: number, from: Date = new Date()): Date[] {
  const out: Date[] = []
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
  while (out.length < count) {
    if (scopeOfDay(d) === scope) out.push(new Date(d))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}
