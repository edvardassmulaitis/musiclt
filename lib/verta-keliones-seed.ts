/* ──────────────────────────────────────────────────────────────────
 * Verta kelionės — DEMONSTRACINIAI seed duomenys (F0).
 *
 * Kol nėra realaus pipeline (žr. VERTA_KELIONES_PLAN.md), page'a maitinama
 * iš čia. Struktūra tyčia atitinka būsimą DB schemą (travel_destinations +
 * events), kad perėjimas į DB būtų mechaninis.
 *
 * SVARBU: dalis koncertų datų apytikslės. Realūs (patikrinti) pažymėti
 * `verified: true`. The Weeknd / festivalių datos — iš 2026 turų skelbimų.
 * ────────────────────────────────────────────────────────────────── */

export type ReachMode = 'flight' | 'car'

export type Destination = {
  key: string
  city: string
  country: string
  countryCode: string        // ISO-2, vėliavėlei (emoji)
  reach: ReachMode
  // skrydžiui:
  fromAirport?: string       // "VNO" | "KUN" | "RIX"
  carrier?: string           // "Ryanair" | "Wizz Air" | "airBaltic"
  priceFrom?: number         // tipinė one-way kaina EUR
  // mašinai:
  driveHours?: number
  driveFrom?: string         // "Vilnius" | "Kaunas"
}

export type Concert = {
  id: string
  artist: string
  destKey: string            // → Destination.key
  venue: string
  date: string               // ISO start
  endDate?: string           // ISO (festivaliams / kelių dienų)
  ticketUrl?: string
  genres: string[]
  popularity: number         // 0-100 (žr. plan 5 sk.)
  isFestival?: boolean
  festivalName?: string
  why: string                // „kodėl verta" (būsimoje versijoje — AI)
  verified?: boolean         // ar data patikrinta iš oficialaus skelbimo
}

/* ── Pasiekiamos kryptys (kuruojamas sąrašas) ──────────────────────── */
export const DESTINATIONS: Destination[] = [
  // — Mašina / autobusas (artima) —
  { key: 'riga',   city: 'Ryga',     country: 'Latvija', countryCode: 'LV', reach: 'car', driveHours: 3.5, driveFrom: 'Vilnius' },
  { key: 'tallinn',city: 'Talinas',  country: 'Estija',  countryCode: 'EE', reach: 'car', driveHours: 6,   driveFrom: 'Vilnius' },
  { key: 'warsaw', city: 'Varšuva',  country: 'Lenkija', countryCode: 'PL', reach: 'car', driveHours: 6.5, driveFrom: 'Kaunas' },
  { key: 'gdansk', city: 'Gdanskas', country: 'Lenkija', countryCode: 'PL', reach: 'car', driveHours: 7,   driveFrom: 'Kaunas' },

  // — Pigus tiesioginis skrydis (VNO / KUN / RIX) —
  { key: 'berlin',     city: 'Berlynas',   country: 'Vokietija', countryCode: 'DE', reach: 'flight', fromAirport: 'VNO', carrier: 'Ryanair',   priceFrom: 40 },
  { key: 'stockholm',  city: 'Stokholmas', country: 'Švedija',   countryCode: 'SE', reach: 'flight', fromAirport: 'RIX', carrier: 'airBaltic', priceFrom: 45 },
  { key: 'copenhagen', city: 'Kopenhaga',  country: 'Danija',    countryCode: 'DK', reach: 'flight', fromAirport: 'KUN', carrier: 'Ryanair',   priceFrom: 40 },
  { key: 'vienna',     city: 'Viena',      country: 'Austrija',  countryCode: 'AT', reach: 'flight', fromAirport: 'VNO', carrier: 'Ryanair',   priceFrom: 45 },
  { key: 'barcelona',  city: 'Barselona',  country: 'Ispanija',  countryCode: 'ES', reach: 'flight', fromAirport: 'VNO', carrier: 'Wizz Air',  priceFrom: 50 },
  { key: 'milan',      city: 'Milanas',    country: 'Italija',   countryCode: 'IT', reach: 'flight', fromAirport: 'VNO', carrier: 'Ryanair',   priceFrom: 45 },
  { key: 'rome',       city: 'Roma',       country: 'Italija',   countryCode: 'IT', reach: 'flight', fromAirport: 'VNO', carrier: 'Ryanair',   priceFrom: 50 },
  { key: 'london',     city: 'Londonas',   country: 'Anglija',   countryCode: 'GB', reach: 'flight', fromAirport: 'KUN', carrier: 'Ryanair',   priceFrom: 40 },
  { key: 'paris',      city: 'Paryžius',   country: 'Prancūzija',countryCode: 'FR', reach: 'flight', fromAirport: 'RIX', carrier: 'airBaltic', priceFrom: 55 },
  { key: 'madrid',     city: 'Madridas',   country: 'Ispanija',  countryCode: 'ES', reach: 'flight', fromAirport: 'RIX', carrier: 'airBaltic', priceFrom: 70 },
  { key: 'budapest',   city: 'Budapeštas', country: 'Vengrija',  countryCode: 'HU', reach: 'flight', fromAirport: 'VNO', carrier: 'Wizz Air',  priceFrom: 45 },
  { key: 'amsterdam',  city: 'Amsterdamas',country: 'Nyderlandai',countryCode:'NL', reach: 'flight', fromAirport: 'VNO', carrier: 'Wizz Air',  priceFrom: 45 },
]

export const DEST_BY_KEY: Record<string, Destination> =
  Object.fromEntries(DESTINATIONS.map(d => [d.key, d]))

/* ── Koncertai (matchinti su kryptimis) ────────────────────────────── */
export const CONCERTS: Concert[] = [
  {
    id: 'weeknd-warsaw', artist: 'The Weeknd', destKey: 'warsaw',
    venue: 'PGE Narodowy', date: '2026-08-04',
    ticketUrl: 'https://www.ticketmaster.pl', genres: ['Pop', 'R&B'],
    popularity: 98, verified: true,
    why: 'Vienas didžiausių planetos vardų stadione už 6 val. nuo Kauno.',
  },
  {
    id: 'weeknd-stockholm', artist: 'The Weeknd', destKey: 'stockholm',
    venue: 'Strawberry Arena', date: '2026-08-08',
    ticketUrl: 'https://www.ticketmaster.se', genres: ['Pop', 'R&B'],
    popularity: 98, verified: true,
    why: 'Tas pats turas Skandinavijoje — savaitgalis Stokholme.',
  },
  {
    id: 'opener-2026', artist: 'Open’er Festival', destKey: 'gdansk',
    venue: 'Gdynia–Kosakowo', date: '2026-07-01', endDate: '2026-07-04',
    ticketUrl: 'https://opener.pl', genres: ['Festivalis', 'Pop', 'Hip-hop', 'Indie'],
    popularity: 90, isFestival: true, festivalName: 'Open’er Festival', verified: true,
    why: 'Didžiausias Lenkijos festivalis — 4 dienos, dešimtys headlinerių, nuvažiuojama.',
  },
  {
    id: 'lolla-berlin-2026', artist: 'Lollapalooza Berlin', destKey: 'berlin',
    venue: 'Olympiastadion', date: '2026-07-18', endDate: '2026-07-19',
    ticketUrl: 'https://www.lollapaloozade.com', genres: ['Festivalis', 'Pop', 'Elektronika', 'Rock'],
    popularity: 88, isFestival: true, festivalName: 'Lollapalooza Berlin', verified: true,
    why: 'Dviejų dienų festivalis Berlyne — pigus tiesioginis skrydis iš Vilniaus.',
  },
  {
    id: 'roskilde-2026', artist: 'Roskilde Festival', destKey: 'copenhagen',
    venue: 'Roskilde (prie Kopenhagos)', date: '2026-06-27', endDate: '2026-07-04',
    ticketUrl: 'https://www.roskilde-festival.dk', genres: ['Festivalis', 'Rock', 'Elektronika', 'Pop'],
    popularity: 85, isFestival: true, festivalName: 'Roskilde Festival', verified: true,
    why: 'Legendinis Danijos festivalis — skrydis į Kopenhagą iš Kauno.',
  },
  {
    id: 'sziget-2026', artist: 'Sziget Festival', destKey: 'budapest',
    venue: 'Óbuda sala', date: '2026-08-10', endDate: '2026-08-15',
    ticketUrl: 'https://szigetfestival.com', genres: ['Festivalis', 'Pop', 'Elektronika', 'Indie'],
    popularity: 86, isFestival: true, festivalName: 'Sziget Festival',
    why: 'Savaitė festivalio mieste ant Dunojaus salos — Wizz Air iš Vilniaus.',
  },
  {
    id: 'ariana-london', artist: 'Ariana Grande', destKey: 'london',
    venue: 'The O2', date: '2026-08-22',
    ticketUrl: 'https://www.ticketmaster.co.uk', genres: ['Pop'],
    popularity: 95,
    why: 'Grįžimas į sceną po pertraukos — Londonas pigiausia kryptis iš Kauno.',
  },
  {
    id: 'raye-berlin', artist: 'RAYE', destKey: 'berlin',
    venue: 'Uber Arena', date: '2026-09-12',
    ticketUrl: 'https://www.eventim.de', genres: ['Pop', 'Soul', 'R&B'],
    popularity: 78,
    why: 'Pakilusi britų žvaigždė areną — savaitgalis Berlyne.',
  },
  {
    id: 'dualipa-milan', artist: 'Dua Lipa', destKey: 'milan',
    venue: 'San Siro', date: '2026-06-30',
    ticketUrl: 'https://www.ticketone.it', genres: ['Pop', 'Dance'],
    popularity: 96,
    why: 'Stadioninis pop šou Milane — Ryanair tiesiogiai iš Vilniaus.',
  },
  {
    id: 'imaginedragons-vienna', artist: 'Imagine Dragons', destKey: 'vienna',
    venue: 'Ernst-Happel-Stadion', date: '2026-07-09',
    ticketUrl: 'https://www.oeticket.com', genres: ['Rock', 'Pop'],
    popularity: 89,
    why: 'Arenų roko grandai Vienoje — patogus skrydis ir kompaktiškas miestas.',
  },
  {
    id: 'metallica-madrid', artist: 'Metallica', destKey: 'madrid',
    venue: 'Estadio Metropolitano', date: '2026-06-19',
    ticketUrl: 'https://www.livenation.es', genres: ['Metalas', 'Rock'],
    popularity: 92,
    why: 'M72 turo stadionas — toliausia, bet verta kryptis metalo gerbėjui.',
  },
  {
    id: 'kendrick-amsterdam', artist: 'Kendrick Lamar', destKey: 'amsterdam',
    venue: 'Johan Cruijff ArenA', date: '2026-07-25',
    ticketUrl: 'https://www.ticketmaster.nl', genres: ['Hip-hop'],
    popularity: 94,
    why: 'Hip-hopo viršūnė Amsterdamo arenoje — Wizz Air per Eindhoveną.',
  },
]

/* ── Helperiai ─────────────────────────────────────────────────────── */

/** Vėliavėlės emoji iš ISO-2 kodo. */
export function flagEmoji(code: string): string {
  if (!code || code.length !== 2) return ''
  return code.toUpperCase().replace(/./g, c =>
    String.fromCodePoint(127397 + c.charCodeAt(0)))
}

/** Apytikslė kelionės kaina „nuo" (skrydis roundtrip + bilietas + 1 naktis,
 *  arba kuras/autobusas mašinos atveju). Grąžina EUR sveiką skaičių. */
export function tripCostFrom(c: Concert): number {
  const d = DEST_BY_KEY[c.destKey]
  const ticket = c.isFestival ? 120 : 70   // apytikslis bilietas „nuo"
  if (!d) return ticket
  if (d.reach === 'flight') {
    const flight = (d.priceFrom ?? 50) * 2  // roundtrip
    const night = 45                        // 1 naktis (hostelis/budget)
    return Math.round(flight + ticket + night)
  }
  // mašina/autobusas: ~€20 už valandą kelio (kuras pasidalinus / autobuso bilietas) ×2
  const travel = Math.round((d.driveHours ?? 4) * 18) * 2
  const night = (d.driveHours ?? 4) > 4 ? 45 : 0
  return travel + ticket + night
}

/** Pasiekiamumo žyma kortelei. */
export function reachLabel(c: Concert): string {
  const d = DEST_BY_KEY[c.destKey]
  if (!d) return ''
  if (d.reach === 'flight')
    return `Pigus skrydis nuo €${d.priceFrom} · ${d.carrier} ${d.fromAirport}`
  return `~${d.driveHours} val. mašina iš ${d.driveFrom}`
}

/** LT data: „2026 rugp. 4" arba diapazonas festivaliui. */
export function fmtDate(iso: string, end?: string): string {
  const M = ['saus.', 'vas.', 'kovo', 'bal.', 'geg.', 'birž.', 'liep.', 'rugp.', 'rugs.', 'spal.', 'lapkr.', 'gruod.']
  const s = new Date(iso)
  const base = `${s.getFullYear()} ${M[s.getMonth()]} ${s.getDate()}`
  if (end) {
    const e = new Date(end)
    if (e.getMonth() === s.getMonth()) return `${s.getFullYear()} ${M[s.getMonth()]} ${s.getDate()}–${e.getDate()}`
    return `${base} – ${M[e.getMonth()]} ${e.getDate()}`
  }
  return base
}
