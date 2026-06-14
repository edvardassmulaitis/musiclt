/* ──────────────────────────────────────────────────────────────────
 * Verta kelionės — DEMONSTRACINIAI seed duomenys (F0).
 *
 * Kol nėra realaus pipeline (žr. VERTA_KELIONES_PLAN.md), page'a maitinama
 * iš čia. Struktūra tyčia atitinka būsimą DB schemą (travel_destinations +
 * events), kad perėjimas į DB būtų mechaninis.
 *
 * Atlikėjų NUOTRAUKOS (`image`) — realios, paimtos iš projekto Supabase
 * `artists.cover_image_url` (generuota scriptu). Koncertų datos demonstracinės;
 * patikrinti (oficialiai paskelbti) pažymėti `verified: true`.
 * ────────────────────────────────────────────────────────────────── */

export type ReachMode = 'flight' | 'car'

export type Destination = {
  key: string
  city: string
  country: string
  countryCode: string        // ISO-2, vėliavėlei (emoji)
  reach: ReachMode
  // skrydžiui:
  fromAirport?: string       // "VNO" | "KUN" (Ryga tik kaip car-destination)
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
  image?: string             // atlikėjo nuotrauka (iš DB)
  artistSlug?: string        // nuoroda į atlikėjo psl. (ateičiai)
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

  // — Pigus tiesioginis skrydis (VNO / KUN) —
  { key: 'berlin',     city: 'Berlynas',   country: 'Vokietija', countryCode: 'DE', reach: 'flight', fromAirport: 'VNO', carrier: 'Ryanair',   priceFrom: 40 },
  { key: 'stockholm',  city: 'Stokholmas', country: 'Švedija',   countryCode: 'SE', reach: 'flight', fromAirport: 'KUN', carrier: 'Ryanair',   priceFrom: 45 },
  { key: 'copenhagen', city: 'Kopenhaga',  country: 'Danija',    countryCode: 'DK', reach: 'flight', fromAirport: 'KUN', carrier: 'Ryanair',   priceFrom: 40 },
  { key: 'vienna',     city: 'Viena',      country: 'Austrija',  countryCode: 'AT', reach: 'flight', fromAirport: 'VNO', carrier: 'Ryanair',   priceFrom: 45 },
  { key: 'barcelona',  city: 'Barselona',  country: 'Ispanija',  countryCode: 'ES', reach: 'flight', fromAirport: 'VNO', carrier: 'Wizz Air',  priceFrom: 50 },
  { key: 'milan',      city: 'Milanas',    country: 'Italija',   countryCode: 'IT', reach: 'flight', fromAirport: 'VNO', carrier: 'Ryanair',   priceFrom: 45 },
  { key: 'rome',       city: 'Roma',       country: 'Italija',   countryCode: 'IT', reach: 'flight', fromAirport: 'VNO', carrier: 'Ryanair',   priceFrom: 50 },
  { key: 'london',     city: 'Londonas',   country: 'Anglija',   countryCode: 'GB', reach: 'flight', fromAirport: 'KUN', carrier: 'Ryanair',   priceFrom: 40 },
  { key: 'paris',      city: 'Paryžius',   country: 'Prancūzija',countryCode: 'FR', reach: 'flight', fromAirport: 'VNO', carrier: 'airBaltic', priceFrom: 55 },
  { key: 'madrid',     city: 'Madridas',   country: 'Ispanija',  countryCode: 'ES', reach: 'flight', fromAirport: 'VNO', carrier: 'airBaltic', priceFrom: 70 },
  { key: 'budapest',   city: 'Budapeštas', country: 'Vengrija',  countryCode: 'HU', reach: 'flight', fromAirport: 'VNO', carrier: 'Wizz Air',  priceFrom: 45 },
  { key: 'amsterdam',  city: 'Amsterdamas',country: 'Nyderlandai',countryCode:'NL', reach: 'flight', fromAirport: 'VNO', carrier: 'Wizz Air',  priceFrom: 45 },
  { key: 'prague',     city: 'Praha',      country: 'Čekija',    countryCode: 'CZ', reach: 'flight', fromAirport: 'VNO', carrier: 'Ryanair',   priceFrom: 45 },
  { key: 'munich',     city: 'Miunchenas', country: 'Vokietija', countryCode: 'DE', reach: 'flight', fromAirport: 'VNO', carrier: 'airBaltic', priceFrom: 55 },
  { key: 'oslo',       city: 'Oslas',      country: 'Norvegija', countryCode: 'NO', reach: 'flight', fromAirport: 'VNO', carrier: 'Ryanair',   priceFrom: 45 },
  { key: 'helsinki',   city: 'Helsinkis',  country: 'Suomija',   countryCode: 'FI', reach: 'flight', fromAirport: 'VNO', carrier: 'airBaltic', priceFrom: 50 },
]

export const DEST_BY_KEY: Record<string, Destination> =
  Object.fromEntries(DESTINATIONS.map(d => [d.key, d]))

/* ── Koncertai (matchinti su kryptimis). Nuotraukos iš projekto DB. ── */
export const CONCERTS: Concert[] = [
  { id:'the-weeknd-warsaw', artist:'The Weeknd', destKey:'warsaw', venue:'PGE Narodowy', date:'2026-08-04', genres:['Pop','R&B'], popularity:98, image:'https://tyvribkcymenlvnrwkdz.supabase.co/storage/v1/object/public/covers/1780570927358-4qflrp7aa9v.webp', artistSlug:'the-weeknd', why:'Vienas didžiausių planetos vardų stadione už 6 val. nuo Kauno.', verified:true },
  { id:'the-weeknd-stockholm', artist:'The Weeknd', destKey:'stockholm', venue:'Strawberry Arena', date:'2026-08-08', genres:['Pop','R&B'], popularity:98, image:'https://tyvribkcymenlvnrwkdz.supabase.co/storage/v1/object/public/covers/1780570927358-4qflrp7aa9v.webp', artistSlug:'the-weeknd', why:'Tas pats turas Skandinavijoje — savaitgalis Stokholme.', verified:true },
  { id:'dua-lipa-milan', artist:'Dua Lipa', destKey:'milan', venue:'San Siro', date:'2026-06-30', genres:['Pop','Dance'], popularity:96, image:'https://i.ytimg.com/vi/k2qgadSvNyU/hqdefault.jpg', artistSlug:'dua-lipa', why:'Stadioninis pop šou Milane — Ryanair tiesiogiai iš Vilniaus.' },
  { id:'coldplay-london', artist:'Coldplay', destKey:'london', venue:'Wembley Stadium', date:'2026-08-15', genres:['Pop','Rock'], popularity:97, image:'https://upload.wikimedia.org/wikipedia/commons/a/a9/Julia_kennedy_coldplay_india_140_V3.jpg', artistSlug:'coldplay', why:'Didžiausias pop-roko reginys Wembley stadione.' },
  { id:'metallica-madrid', artist:'Metallica', destKey:'madrid', venue:'Estadio Metropolitano', date:'2026-06-19', genres:['Metalas','Rock'], popularity:92, image:'https://upload.wikimedia.org/wikipedia/commons/c/ca/Metallica_-_The_O2_-_Sunday_22nd_October_2017_MetallicaO2221017-53_%2837640643180%29.jpg', artistSlug:'metallica', why:'M72 turo stadionas — toliausia, bet verta metalo gerbėjui.' },
  { id:'kendrick-lamar-amsterdam', artist:'Kendrick Lamar', destKey:'amsterdam', venue:'Johan Cruijff ArenA', date:'2026-07-25', genres:['Hip-hop'], popularity:94, image:'https://i.ytimg.com/vi/QcIy9NiNbmo/maxresdefault.jpg', artistSlug:'kendrick-lamar', why:'Hip-hopo viršūnė Amsterdamo arenoje.' },
  { id:'imagine-dragons-vienna', artist:'Imagine Dragons', destKey:'vienna', venue:'Ernst-Happel-Stadion', date:'2026-07-09', genres:['Rock','Pop'], popularity:89, image:'https://i.ytimg.com/vi/7wtfhZwyrcc/maxresdefault.jpg', artistSlug:'imagine-dragons', why:'Arenų roko grandai kompaktiškoje Vienoje.' },
  { id:'ariana-grande-london', artist:'Ariana Grande', destKey:'london', venue:'The O2', date:'2026-08-22', genres:['Pop'], popularity:95, image:'https://tyvribkcymenlvnrwkdz.supabase.co/storage/v1/object/public/covers/1781274916336-0an4jthounu9.webp', artistSlug:'ariana-grande', why:'Grįžimas į sceną — Londonas pigi kryptis iš Kauno.' },
  { id:'linkin-park-berlin', artist:'Linkin Park', destKey:'berlin', venue:'Olympiastadion', date:'2026-06-25', genres:['Rock'], popularity:93, image:'https://upload.wikimedia.org/wikipedia/commons/7/7d/Linkin_Park_The_Carnivores_Tour_2014.jpg', artistSlug:'linkin-park', why:'Naujas turas su nauja vokaliste — Berlyne.' },
  { id:'linkin-park-helsinki', artist:'Linkin Park', destKey:'helsinki', venue:'Kaisaniemi Park', date:'2026-06-28', genres:['Rock'], popularity:93, image:'https://upload.wikimedia.org/wikipedia/commons/7/7d/Linkin_Park_The_Carnivores_Tour_2014.jpg', artistSlug:'linkin-park', why:'Tas pats turas Helsinkyje — trumpas skrydis iš Vilniaus.' },
  { id:'iron-maiden-tallinn', artist:'Iron Maiden', destKey:'tallinn', venue:'Lauluväljak', date:'2026-07-15', genres:['Metalas'], popularity:88, image:'https://i.ytimg.com/vi/X4bgXH3sJ2Q/maxresdefault.jpg', artistSlug:'iron-maiden', why:'Legendos po atviru dangumi Taline — nuvažiuojama mašina.' },
  { id:'iron-maiden-stockholm', artist:'Iron Maiden', destKey:'stockholm', venue:'Tele2 Arena', date:'2026-07-18', genres:['Metalas'], popularity:88, image:'https://i.ytimg.com/vi/X4bgXH3sJ2Q/maxresdefault.jpg', artistSlug:'iron-maiden', why:'Run For Your Lives turas Stokholme.' },
  { id:'sabrina-carpenter-paris', artist:'Sabrina Carpenter', destKey:'paris', venue:'Accor Arena', date:'2026-07-03', genres:['Pop'], popularity:90, image:'https://i.ytimg.com/vi/eVli-tstM5E/maxresdefault.jpg', artistSlug:'sabrina-carpenter', why:'Viena karščiausių pop žvaigždžių Paryžiuje.' },
  { id:'shakira-barcelona', artist:'Shakira', destKey:'barcelona', venue:'Estadi Olímpic', date:'2026-06-12', genres:['Pop','Latin'], popularity:91, image:'https://i.ytimg.com/vi/pRpeEdMmmQ0/maxresdefault.jpg', artistSlug:'shakira', why:'Pasaulinis turas gimtojoje Ispanijoje.' },
  { id:'bring-me-the-horizon-prague', artist:'Bring Me the Horizon', destKey:'prague', venue:'O2 Arena', date:'2026-07-14', genres:['Metalas','Rock'], popularity:80, image:'https://i.ytimg.com/vi/QJJYpsA5tv8/maxresdefault.jpg', artistSlug:'bring-me-the-horizon', why:'Modernaus metalo lyderiai Prahos arenoje.' },
  { id:'twenty-one-pilots-munich', artist:'Twenty One Pilots', destKey:'munich', venue:'Olympiahalle', date:'2026-08-02', genres:['Alternatyva','Pop'], popularity:82, image:'https://i.ytimg.com/vi/pXRviuL6vMY/maxresdefault.jpg', artistSlug:'twenty-one-pilots', why:'Energingas duetas Miunchene.' },
  { id:'system-of-a-down-vienna', artist:'System of a Down', destKey:'vienna', venue:'Ernst-Happel-Stadion', date:'2026-06-28', genres:['Metalas'], popularity:85, image:'https://i.ytimg.com/vi/CSvFpBOe8eY/maxresdefault.jpg', artistSlug:'system-of-a-down', why:'Reti pasirodymai — proga pamatyti Vienoje.' },
  { id:'slipknot-oslo', artist:'Slipknot', destKey:'oslo', venue:'Telenor Arena', date:'2026-08-09', genres:['Metalas'], popularity:84, image:'https://i.ytimg.com/vi/5abamRO41fE/maxresdefault.jpg', artistSlug:'slipknot', why:'Sunkiojo metalo cirkas Osle.' },
  { id:'doja-cat-amsterdam', artist:'Doja Cat', destKey:'amsterdam', venue:'Ziggo Dome', date:'2026-09-05', genres:['Hip-hop','Pop'], popularity:87, image:'https://i.ytimg.com/vi/0EVVKs6DQLo/maxresdefault.jpg', artistSlug:'doja-cat', why:'Pop-repo žvaigždė Ziggo Dome.' },
  { id:'justin-timberlake-copenhagen', artist:'Justin Timberlake', destKey:'copenhagen', venue:'Royal Arena', date:'2026-07-20', genres:['Pop'], popularity:83, image:'https://i.ytimg.com/vi/ru0K8uYEZWw/maxresdefault.jpg', artistSlug:'justin-timberlake', why:'Pop klasikas Kopenhagoje — skrydis iš Kauno.' },
  { id:'sting-riga', artist:'Sting', destKey:'riga', venue:'Arēna Rīga', date:'2026-08-18', genres:['Rock','Pop'], popularity:79, image:'https://i.ytimg.com/vi/C3lWwBslWqg/maxresdefault.jpg', artistSlug:'sting', why:'Legendinis vokalistas Rygoje — 3.5 val. mašina.' },
  { id:'hans-zimmer-prague', artist:'Hans Zimmer', destKey:'prague', venue:'O2 Arena', date:'2026-06-21', genres:['Soundtrack'], popularity:81, image:'https://i.ytimg.com/vi/imamcajBEJs/maxresdefault.jpg', artistSlug:'hans-zimmer', why:'Kino muzikos maestro gyvai su orkestru.' },
  { id:'sam-fender-london', artist:'Sam Fender', destKey:'london', venue:'London Stadium', date:'2026-08-28', genres:['Indie','Rock'], popularity:77, image:'https://upload.wikimedia.org/wikipedia/commons/2/24/Sam_Fender_%282021%29.jpg', artistSlug:'sam-fender', why:'Britų indie-roko balsas stadione.' },
  { id:'shakira-milan', artist:'Shakira', destKey:'milan', venue:'San Siro', date:'2026-06-16', genres:['Pop','Latin'], popularity:91, image:'https://i.ytimg.com/vi/pRpeEdMmmQ0/maxresdefault.jpg', artistSlug:'shakira', why:'Tas pats turas Milane — Ryanair iš Vilniaus.' },
  { id:'raye-berlin', artist:'RAYE', destKey:'berlin', venue:'Uber Arena', date:'2026-09-12', genres:['Pop','Soul'], popularity:78, image:'https://upload.wikimedia.org/wikipedia/commons/8/87/Boardmasters2023_%2897_of_171%29_%2853120163026%29.jpg', artistSlug:'raye', why:'Pakilusi britų žvaigždė — savaitgalis Berlyne.' },
  { id:'opener-festival-gdansk', artist:'Open’er Festival', destKey:'gdansk', venue:'Gdynia–Kosakowo', date:'2026-07-01', endDate:'2026-07-04', genres:['Festivalis','Pop','Hip-hop','Indie'], popularity:90, isFestival:true, festivalName:'Open’er Festival', why:'Didžiausias Lenkijos festivalis — 4 dienos, nuvažiuojama.', verified:true },
  { id:'lollapalooza-berlin-berlin', artist:'Lollapalooza Berlin', destKey:'berlin', venue:'Olympiastadion', date:'2026-07-18', endDate:'2026-07-19', genres:['Festivalis','Pop','Elektronika','Rock'], popularity:88, isFestival:true, festivalName:'Lollapalooza Berlin', why:'Dviejų dienų festivalis Berlyne — pigus skrydis.', verified:true },
  { id:'roskilde-festival-copenhagen', artist:'Roskilde Festival', destKey:'copenhagen', venue:'Roskilde', date:'2026-06-27', endDate:'2026-07-04', genres:['Festivalis','Rock','Elektronika'], popularity:85, isFestival:true, festivalName:'Roskilde Festival', why:'Legendinis Danijos festivalis prie Kopenhagos.', verified:true },
  { id:'sziget-festival-budapest', artist:'Sziget Festival', destKey:'budapest', venue:'Óbuda sala', date:'2026-08-10', endDate:'2026-08-15', genres:['Festivalis','Pop','Elektronika','Indie'], popularity:86, isFestival:true, festivalName:'Sziget Festival', why:'Savaitė festivalio mieste ant Dunojaus salos.' },
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
  // mašina/autobusas: ~€18 už valandą kelio ×2 (kuras pasidalinus / autobusas)
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
