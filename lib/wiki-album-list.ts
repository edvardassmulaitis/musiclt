/**
 * Wikipedia „List of YYYY albums" (ir panašių metinių albumų sąrašų)
 * wikitext parseris — punktas B (žr. MUSIC_DISCOVERY_AUTOMATION_PLAN.md §B).
 *
 * Puslapio struktūra (pvz. https://en.wikipedia.org/wiki/List_of_2026_albums):
 *   == First quarter ==
 *   === January ===
 *   {| class="wikitable plainrowheaders"
 *   |+ List of albums released in January 2026
 *   ! scope="col"| Release date
 *   ! scope="col"| Artist
 *   ! scope="col"| Album
 *   ! scope="col"| Genre
 *   ! scope="col"| Label
 *   ! scope="col"| Ref.
 *   |-
 *   ! scope="row" rowspan="2" style="..." | January<br>1
 *   | [[Joost Klein]]
 *   | ''[[Kleinkunst (album)|Kleinkunst]]''
 *   | [[Gabberpop]], [[happy hardcore]]
 *   |
 *   |
 *   |-
 *   | [[Rawayana]]
 *   | ''[[¿Dónde es el after?]]''
 *   | ...
 *
 * T.y. `rowspan` ant datos langelio reiškia kelis albumus tą pačią dieną —
 * antra ir tolimesnės eilutės NETURI datos langelio apskritai (paveldi iš
 * ankstesnės `! scope="row"` eilutės). Sąmoningai IGNORUOJAMA „Unscheduled
 * and TBA" sekcija (== lygio, ne ===, be datos stulpelio, albumai dažnai
 * {{TBA}}) — per žema signalo kokybė automatiniam flow'ui.
 */

import crypto from 'crypto'
import { cleanWikiText, cleanArtistName } from './wiki-parser'

/** Diacritic-insensitive fold, be `\u` regex escape'ų (žr. lib/apple-music.ts
 *  foldCompare komentarą — tool-chain kartais `\uXXXX` konvertuoja į literal
 *  Unicode simbolius parametruose, todėl saugiau per codePoint loop'ą). */
function foldForFingerprint(s: string): string {
  const nfd = (s || '').toLowerCase().normalize('NFD')
  let out = ''
  for (const ch of nfd) {
    const cp = ch.codePointAt(0) || 0
    if (cp >= 0x0300 && cp <= 0x036f) continue
    out += /[a-z0-9]/.test(ch) ? ch : ' '
  }
  return out.replace(/\s+/g, ' ').trim()
}

export type AlbumListEntry = {
  year: number
  month: number
  day: number
  artist_raw: string          // išvalytas atlikėjo vardas (be wikitext'o)
  album_title: string         // išvalytas albumo pavadinimas
  album_wiki_link: string | null   // Wikipedia puslapio title (su _ vietoj tarpų), jei albumas jau turi savo straipsnį
  artist_wiki_link: string | null  // Wikipedia straipsnis ATLIKĖJUI (jei jis „notable"/mėlyna nuoroda sąraše) — „top" ne-katalogo požymis
  genres: string[]
  label: string | null
  source_line: string         // debug — originali wikitext eilutė (trimmed, max 300 char)
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
}

/** Ištraukia datos header'io ('!' eilutės) turinį PO attribute'ų (rowspan=/
 *  style=), pvz. `! scope="row" rowspan="2" style="..." | January<br>1` →
 *  `January<br>1`. Naudojama TIK '!' eilutėms — jos turi ` | ` separatorių
 *  tarp attributų ir turinio, o pats turinys (data tekstas) niekad
 *  neturi papildomų `|` viduje, tad saugu imti PASKUTINĮ `|`. */
function dayHeaderContent(line: string): string {
  const idx = line.lastIndexOf('|')
  if (idx === -1) return ''
  return line.slice(idx + 1).trim()
}

/** Ištraukia eilinio duomenų langelio (`| ...`) turinį — TIK pirmą `|`
 *  nuima, nieko daugiau. SVARBU: skirtingai nuo dayHeaderContent, čia
 *  NEGALIMA imti paskutinio `|`, nes turinys dažnai turi savo pipe'us
 *  (pvz. `[[Alter Bridge (album)|Alter Bridge]]` — piped wikilink display
 *  tekstas). Šio failo duomenų cell'ai (artist/album/genre/label/ref)
 *  neturi wikitable attribute'ų (`style=`/`colspan=`), tik `|+`/Monthbar
 *  meta-eilutės turi — o jos jau atfiltruojamos kitur (cells.length<2). */
function dataCellContent(line: string): string {
  const t = line.trim()
  if (!t.startsWith('|')) return t
  return t.slice(1).trim()
}

/** Ar linija yra naujo langelio pradžia (`|` arba `!` eilutės pradžioje, ne `|-`/`{|`/`|}`). */
function isCellLine(line: string): boolean {
  const t = line.trim()
  if (!t) return false
  if (t.startsWith('|-') || t.startsWith('{|') || t.startsWith('|}') || t.startsWith('|+')) return false
  return t.startsWith('|') || t.startsWith('!')
}

/** Parse'ina "January<br>1" / "January<br>15" → { month, day } arba null jei neatpažįstama (pvz. TBA). */
function parseDayHeader(raw: string): { month: number; day: number } | null {
  const clean = raw.replace(/<br\s*\/?>/gi, ' ').replace(/\{\{[^}]*\}\}/g, '').trim()
  const m = clean.match(/^([A-Za-z]+)\s+(\d{1,2})/)
  if (!m) return null
  const month = MONTHS[m[1].toLowerCase()]
  const day = parseInt(m[2], 10)
  if (!month || !day || day < 1 || day > 31) return null
  return { month, day }
}

/** Ištraukia pirmo `[[...]]` wikilink'o page title'ą (be display teksto). */
function firstWikiLinkTitle(raw: string): string | null {
  const m = raw.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/)
  if (!m) return null
  const title = m[1].trim()
  if (!title || /^file:/i.test(title)) return null
  return title
}

/** Padalina wikitable'o body (be `{|`/`|}` eilučių) į row-group'us pagal `|-`. */
function splitRows(tableBody: string[]): string[][] {
  const rows: string[][] = []
  let current: string[] = []
  for (const line of tableBody) {
    if (line.trim().startsWith('|-')) {
      if (current.length) rows.push(current)
      current = []
      continue
    }
    if (isCellLine(line)) current.push(line)
  }
  if (current.length) rows.push(current)
  return rows
}

/**
 * Parse'ina vieną `=== MonthName ===` sekcijos wikitext'ą (viskas iki
 * sekančio `==`/`===` header'io) į AlbumListEntry[].
 */
function parseMonthSection(sectionText: string, year: number, month: number): AlbumListEntry[] {
  const out: AlbumListEntry[] = []

  // Rasti visus {| ... |} table blokus šioje sekcijoje (paprastai vienas).
  const tableBlocks = sectionText.match(/\{\|[\s\S]*?\n\|\}/g) || []

  let currentDay: number | null = null

  for (const block of tableBlocks) {
    const lines = block.split('\n')
    const rows = splitRows(lines)

    for (const row of rows) {
      // Header row (scope="col") — praleisti.
      if (row.some((l) => /scope="col"/i.test(l))) continue

      let cells = row
      const first = row[0]
      if (first && first.trim().startsWith('!')) {
        // Naujos dienos header'is — pirma linija yra data, likusios — data cells.
        const dayInfo = parseDayHeader(dayHeaderContent(first))
        if (dayInfo) {
          currentDay = dayInfo.day
          // month iš puslapio sekcijos title'o naudojam kaip base — bet jei
          // header'is netikėtai turi kitą mėnesį (retas atvejis, ignoruojam).
        } else {
          currentDay = null // TBA / neatpažinta — šis ir sekantys be naujo header'io praleidžiami
        }
        cells = row.slice(1)
      }

      if (currentDay === null) continue
      if (cells.length < 2) continue // reikia bent artist + album

      const artistRaw = dataCellContent(cells[0])
      const albumRaw = dataCellContent(cells[1])
      const genreRaw = cells[2] !== undefined ? dataCellContent(cells[2]) : ''
      const labelRaw = cells[3] !== undefined ? dataCellContent(cells[3]) : ''

      const albumWikiTitle = firstWikiLinkTitle(albumRaw)
      const artistWikiTitle = firstWikiLinkTitle(artistRaw)
      const albumTitle = cleanWikiText(albumRaw)
      // SVARBU: cleanWikiText PIRMA (kol [[...]] dar nepažeisti, teisingai
      // rezolvina piped linkus `[[X (band)|X]]` → "X"), tada cleanArtistName
      // papildomam role-paranteste stripinimui teksto be linkų (pvz. plain
      // "X (American rock band)" be wikilink'o). Atvirkštinė tvarka paliktų
      // stray "|" (cleanArtistName brackets nuima PRIEŠ pipe rezoliuciją).
      const artistName = cleanArtistName(cleanWikiText(artistRaw))

      if (!albumTitle || !artistName) continue
      if (/^tba$/i.test(albumTitle)) continue

      const genres = genreRaw
        ? cleanWikiText(genreRaw).split(',').map((g) => g.trim()).filter(Boolean)
        : []
      const label = labelRaw ? cleanWikiText(labelRaw) || null : null

      out.push({
        year,
        month,
        day: currentDay,
        artist_raw: artistName,
        album_title: albumTitle,
        album_wiki_link: albumWikiTitle,
        artist_wiki_link: artistWikiTitle,
        genres,
        label,
        source_line: `${artistRaw} | ${albumRaw}`.slice(0, 300),
      })
    }
  }

  return out
}

/**
 * Pagrindinė eksportuojama funkcija — parse'ina visą „List of YYYY albums"
 * puslapio wikitext'ą. `year` paduodamas eksplicitiškai (iš puslapio
 * pavadinimo — nepatikima, kad wikitext'e visur bus metai eksplicitiškai).
 *
 * Sąmoningai NEPARSINAMA „Unscheduled and TBA" sekcija — ji `==` lygio
 * (ne `===`), be datos stulpelio, ir albumo pavadinimas dažnai `{{TBA}}`.
 * Šis parseris tik renka `=== MonthName ===` sub-sekcijas.
 */
export function parseAlbumListPage(wikitext: string, year: number): AlbumListEntry[] {
  const out: AlbumListEntry[] = []

  // Rasti visus `=== MonthName ===` header'ius su jų pozicijomis.
  const headerRe = /^===\s*([A-Za-z]+)\s*===\s*$/gm
  const matches: { month: number; start: number; end: number }[] = []
  let m: RegExpExecArray | null
  while ((m = headerRe.exec(wikitext))) {
    const monthName = m[1].toLowerCase()
    const month = MONTHS[monthName]
    if (!month) continue
    matches.push({ month, start: m.index + m[0].length, end: -1 })
  }

  // Kiekvienos sekcijos pabaiga — sekantis BET KOKIO lygio header'is (`==`, `===`,
  // `====`), arba failo pabaiga. SVARBU: sena versija `^==[^=\n]` NEatpažindavo
  // level-3 `=== Month ===` header'ių (po `==` eina dar `=`), tad `=== January ===`
  // sekcija tęsdavosi iki `== Second quarter ==` ir apimdavo VASARIO+KOVO lenteles,
  // visas pažymėdama sausiu (bug: visi albumai month=1, klaidingos datos, per mažai
  // parse'inta). Dabar `={2,}` gaudo bet kokį header'į → kiekvienas mėnuo tik savo.
  const anyHeaderRe = /^={2,}[^=\n].*$/gm
  const headerPositions: number[] = []
  let hm: RegExpExecArray | null
  while ((hm = anyHeaderRe.exec(wikitext))) headerPositions.push(hm.index)

  for (const entry of matches) {
    const nextHeaderPos = headerPositions.find((p) => p > entry.start)
    entry.end = nextHeaderPos !== undefined ? nextHeaderPos : wikitext.length
  }

  for (const { month, start, end } of matches) {
    const sectionText = wikitext.slice(start, end)
    out.push(...parseMonthSection(sectionText, year, month))
  }

  return out
}

/** Fingerprint dedupe'ui (nėra unikalaus URL per eilutę — žr. planą §B.2). */
export function albumListFingerprint(artistName: string, albumTitle: string, year: number, month: number, day: number): string {
  const key = `${foldForFingerprint(artistName)}|${foldForFingerprint(albumTitle)}|${year}-${month}-${day}`
  return crypto.createHash('sha1').update(key).digest('hex')
}
