'use client'

/**
 * Wikipedia Voting Import
 * Parsina Eurovision-style Wikipedia puslapio "Participants" lentelę ir ištraukia:
 *   - Šalis (Country)
 *   - Atlikėjas (Artist)
 *   - Daina (Song)
 *   - Kompozitorius/lyricist (jei yra)
 *   - YouTube video (jei yra)
 *
 * Pvz. URL: https://en.wikipedia.org/wiki/Eurovision_Song_Contest_2026
 */

import { useState } from 'react'
import { createPortal } from 'react-dom'

type ParsedParticipant = {
  country?: string
  artist_name: string
  song_title?: string
  album_title?: string        // jei album nominacija (Metų džiazas, Metų albumas)
  songwriters?: string
  lyrics_url?: string
  youtube_url?: string
  photo_url?: string
  is_winner?: boolean
  parsed_artists?: string[]   // jei keli atlikėjai — main + featuring
  existing_artist_id?: number // DB match pagal pagrindinį atlikėją
  existing_track_id?: number  // DB match pagal track_title
  existing_album_id?: number  // DB match pagal album_title
  group_match?: boolean       // true jei visas artist_name match'ina grupės įrašą DB — NEDALINK
  _songWikiTitle?: string     // Vidinis: jei song kategorijoje top-level yra tik dainos nuoroda į Wiki,
                              //          fetch'inam jos page ir ištrauksim realius atlikėjus iš infobox
  selected?: boolean
  error?: string
}

/** Agresyvus split: visi separatoriai (feat., ft., featuring, &, x, ir, and, kableliai)
 *  traktuojami kaip featuring. Grupių vardai su „ir" viduje (pvz. „Lilas ir Innomine")
 *  turi būti override'inami per DB preview match'ą — jei grupė jau įregistruota DB'je,
 *  ji atpažįstama kaip ilgesnis prefix'as. Pirmu importu grupė bus split'inama kaip 2 atlikėjai;
 *  vartotojas ją gali rankiniu būdu sujungti per admin/artists + pervardinti į „Lilas ir Innomine". */
function splitArtistNamesLocal(raw: string): string[] {
  if (!raw) return []
  const SEP = /\s+(?:feat\.?|ft\.?|featuring|&|x|\bir\b|\band\b)\s+|\s*,\s*/gi
  const parts = raw
    .split(SEP)
    .map(s => s.trim())
    .filter(s => s.length >= 2 && s.length <= 80)
  return parts.length ? parts : [raw.trim()]
}

/** Generuoja atlikėjo vardo prefix'us (nuo ilgiausio iki trumpiausio) DB match'o tikrinimui.
 *  Pvz. „Lilas ir Innomine ir Justinas Jarutis" → [full, „Lilas ir Innomine", „Lilas"]. */
function generateArtistPrefixes(artistName: string): string[] {
  if (!artistName) return []
  const prefixes = new Set<string>([artistName.trim()])
  const SEP = /\s+(?:feat\.?|ft\.?|featuring|&|x|\bir\b|\band\b)\s+|\s*,\s*/gi
  const positions: number[] = []
  let m
  while ((m = SEP.exec(artistName)) !== null) positions.push(m.index)
  positions.sort((a, b) => b - a)  // nuo ilgiausio prefix'o link trumpiausio
  for (const pos of positions) {
    const pref = artistName.substring(0, pos).trim()
    if (pref.length >= 2) prefixes.add(pref)
  }
  return [...prefixes]
}

/** Atpažįsta tipą (song / album / artist) pagal kategorijos pavadinimą. */
function detectCategoryType(catName: string): 'song' | 'album' | 'artist' {
  const s = catName.toLowerCase()
  if (/\balbumas\b|\balbum\b/.test(s)) return 'album'
  if (/\bdaina\b|\bkūrinys\b|\bkurinys\b|\bsong\b|\btrack\b|\bvaizdo\s*klipas\b|\bmusic\s*video\b|\bsingle\b/.test(s))
    return 'song'
  return 'artist'
}

type CategoryType = 'artist' | 'song' | 'album'

type ParsedCategory = {
  name: string               // Originalus Wikipedia pavadinimas (pvz. "Record of the Year")
  name_lt?: string           // Vartotojo įvestas lietuviškas vertimas (pvz. "Metų daina")
  nominees: ParsedParticipant[]
  selected?: boolean
  type?: CategoryType   // user gali override, priklausomai nuo to re-parse'as nominantus
}

/** Automatinis ENG→LT kategorijos pavadinimo siūlymas. Leksikonas dažniausioms. */
function suggestLithuanianName(engName: string): string | undefined {
  const map: [RegExp, string][] = [
    [/^Record of the Year$/i, 'Metų įrašas'],
    [/^Album of the Year$/i, 'Metų albumas'],
    [/^Song of the Year$/i, 'Metų daina'],
    [/^Best New Artist$/i, 'Metų atradimas (naujas atlikėjas)'],
    [/^Producer of the Year.*$/i, 'Metų prodiuseris'],
    [/^Songwriter of the Year.*$/i, 'Metų tekstų autorius'],
    [/^Best Pop Solo Performance$/i, 'Geriausias popmuzikos solinis atlikimas'],
    [/^Best Pop Duo\/?Group Performance$/i, 'Geriausias popmuzikos dueto/grupės atlikimas'],
    [/^Best Pop Vocal Album$/i, 'Geriausias popmuzikos vokalinis albumas'],
    [/^Best Dance\/Electronic.*Recording$/i, 'Geriausias šokių/elektroninis įrašas'],
    [/^Best Dance Pop Recording$/i, 'Geriausias dance-pop įrašas'],
    [/^Best Dance\/Electronic Album$/i, 'Geriausias šokių/elektroninis albumas'],
    [/^Best Rock Performance$/i, 'Geriausias roko atlikimas'],
    [/^Best Metal Performance$/i, 'Geriausias metalo atlikimas'],
    [/^Best Rock Song$/i, 'Geriausia roko daina'],
    [/^Best Rock Album$/i, 'Geriausias roko albumas'],
    [/^Best Alternative.*Performance$/i, 'Geriausias alternatyvos atlikimas'],
    [/^Best Alternative.*Album$/i, 'Geriausias alternatyvus albumas'],
    [/^Best R&B Performance$/i, 'Geriausias R&B atlikimas'],
    [/^Best Traditional R&B Performance$/i, 'Geriausias tradicinio R&B atlikimas'],
    [/^Best R&B Song$/i, 'Geriausia R&B daina'],
    [/^Best Progressive R&B Album$/i, 'Geriausias progresyvaus R&B albumas'],
    [/^Best R&B Album$/i, 'Geriausias R&B albumas'],
    [/^Best Rap Performance$/i, 'Geriausias repo atlikimas'],
    [/^Best Melodic Rap Performance$/i, 'Geriausias melodinio repo atlikimas'],
    [/^Best Rap Song$/i, 'Geriausia repo daina'],
    [/^Best Rap Album$/i, 'Geriausias repo albumas'],
    [/^Best Country.*Performance$/i, 'Geriausias country atlikimas'],
    [/^Best Country Song$/i, 'Geriausia country daina'],
    [/^Best Country Album$/i, 'Geriausias country albumas'],
    [/^Best.*Country Album$/i, 'Geriausias country albumas'],
    [/^Best Latin.*Album$/i, 'Geriausias lotyniškas albumas'],
    [/^Best.*Jazz.*Album$/i, 'Geriausias džiazo albumas'],
    [/^Best Music Video$/i, 'Geriausias muzikinis klipas'],
    [/^Best Music Film$/i, 'Geriausias muzikinis filmas'],
    [/^Best Compilation.*Visual Media$/i, 'Geriausias filmo/vizualios medijos rinkinys'],
    [/^Best Score.*Visual Media$/i, 'Geriausia muzika filmui/vizualiai medijai'],
    [/^Best Song Written.*Visual Media$/i, 'Geriausia daina filmui/vizualiai medijai'],
  ]
  for (const [re, lt] of map) if (re.test(engName)) return lt
  return undefined
}

type ParseResult =
  | { mode: 'eurovision'; participants: ParsedParticipant[] }
  | { mode: 'awards'; categories: ParsedCategory[] }

type Props = {
  eventId?: number        // naudojamas Eurovision-style (single event, many participants)
  editionId?: number      // naudojamas Awards-style (many events, each with nominees)
  onDone: () => void
  onClose: () => void
}

// ===== Wikipedia helpers =====

/** Ištrauk domainą ir title iš Wikipedia URL (en. arba lt.) */
function parseWikipediaUrl(url: string): { host: string; title: string } | null {
  const m = url.match(/^https?:\/\/(\w+\.wikipedia\.org)\/wiki\/([^#?]+)/)
  if (!m) return null
  return { host: m[1], title: decodeURIComponent(m[2]) }
}

async function fetchWikipediaHtml(host: string, title: string): Promise<string | null> {
  const url = `https://${host}/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=text&format=json&origin=*&redirects=1`
  try {
    const res = await fetch(url)
    const data = await res.json()
    return data?.parse?.text?.['*'] || null
  } catch {
    return null
  }
}

/**
 * Fetch'ina dainos Wikipedia page'ą ir ištraukia TIKRĄ atlikėjo/grupės vardą iš infobox.
 * Songwriter'iai ir kompozitoriai yra ATSKIROJ eilutėj, todėl jie NEBUS paimti.
 *
 * Pvz. en.wikipedia.org/wiki/APT._(song) → Artist: Rosé & Bruno Mars (ne 9 songwriter'iai!)
 *
 * Wikipedia song/album infobox struktūra:
 *   <tr class="description">
 *     <th colspan="2">Single by <a href="/wiki/Rosé...">Rosé</a> and <a>Bruno Mars</a></th>
 *   </tr>
 *   <tr class="description">  ← šį PRALEIDŽIAM (nukreipia į albumą, ne atlikėją)
 *     <th colspan="2">from the album <i><a>Rosie</a></i></th>
 *   </tr>
 *   <tr><th scope="row">Released</th><td>...</td></tr>  ← standart label row
 *
 * Strategy 1: description row su „[Type] by [Artists]" pattern (vyraujantis variantas)
 * Strategy 2: klasikinis <th>Artist</th><td>...</td> row (fallback, retas songuose)
 */
async function fetchSongArtistFromWiki(host: string, title: string): Promise<string | null> {
  const html = await fetchWikipediaHtml(host, title)
  if (!html) return null
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  // Infobox gali turėti kelių variantų klases (.infobox-song, .infobox vcard ir pan.)
  const infobox = doc.querySelector('table.infobox') as Element | null
  if (!infobox) return null

  const rows = Array.from(infobox.querySelectorAll('tr'))

  // === Strategy 1: description row (singles, albumai, EP'ai) ===
  // Description klasė gali būti ant <tr> (daina: APT, Wildflower) ARBA ant <th> (albumas: Chromakopia, Rosie).
  for (const row of rows) {
    const header = row.querySelector('th')
    if (!header) continue
    const isDesc = (row as Element).classList.contains('description') ||
                   header.classList.contains('description')
    if (!isDesc) continue

    const rawText = (header.textContent || '').replace(/\s+/g, ' ').trim()
    // Praleidžiam „from the album X" — tai albumas, ne atlikėjas
    if (/^from\s+/i.test(rawText)) continue
    // Turi turėti „ by " separatoriu (išfiltruoja „Tyler, the Creator chronology" ir pan.)
    if (!/\s+by\s+/i.test(rawText)) continue

    const clone = header.cloneNode(true) as Element
    clone.querySelectorAll('sup, style, .reference, .mw-editsection, .noprint, .hatnote').forEach(n => n.remove())

    // Renkame visus <a> linkus ir atmetam tipo link'us (Single/Song/Album — jie nurodo į meta puslapius)
    const links = Array.from(clone.querySelectorAll('a')).map(a => ({
      text: (a.textContent || '').replace(/\s+/g, ' ').trim(),
      href: a.getAttribute('href') || '',
    })).filter(l => l.text)

    const TYPE_HREF = /^\/wiki\/(Single_\(music\)|Song|EP_\(music\)|Extended_play|Studio_album|Live_album|Compilation_album|Soundtrack_album|Album|Mixtape)\b/i
    const TYPE_TEXT = /^(single|song|ep|studio\s*album|live\s*album|compilation\s*album|soundtrack|album|mixtape|extended\s*play)s?$/i

    const artistLinks = links.filter(l => !TYPE_HREF.test(l.href) && !TYPE_TEXT.test(l.text))
    if (artistLinks.length) {
      const names = [...new Set(artistLinks.map(l => l.text))].filter(n => n.length >= 2 && n.length <= 80)
      if (names.length) return names.join(' & ')
    }

    // Fallback — tekstas po „ by "
    const byMatch = rawText.match(/\s+by\s+(.+)$/i)
    if (byMatch) {
      const after = byMatch[1].trim().replace(/\s+and\s+/gi, ' & ')
      if (after.length >= 2 && after.length <= 200) return after
    }
  }

  // === Strategy 2: klasikinis <th>Artist</th><td>...</td> row ===
  for (const row of rows) {
    const th = row.querySelector('th')
    const td = row.querySelector('td')
    if (!th || !td) continue
    const label = (th.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()
    if (!/^(artists?|by|performed\s+by|performer(?:\(s\))?|singers?|vocalists?|atlik[eė]jas|atlik[eė]jai)\s*$/i.test(label))
      continue

    const clone = td.cloneNode(true) as Element
    clone.querySelectorAll('sup, style, .reference, .mw-editsection, .noprint, .hatnote').forEach(n => n.remove())

    const links = Array.from(clone.querySelectorAll('a'))
      .map(a => (a.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
    const uniqueLinks = [...new Set(links)].filter(n => n.length >= 2 && n.length <= 80)
    if (uniqueLinks.length) return uniqueLinks.join(' & ')

    const textOnly = (clone.textContent || '').replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim()
    if (textOnly && textOnly.length >= 2 && textOnly.length <= 200) return textOnly
  }

  return null
}

/**
 * Po awards-style parsinimo — nominantams be atlikėjo (song_title be artist_name),
 * kurie turi saugomą `_songWikiTitle`, fetch'inam dainos Wiki page'ą ir užpildom
 * tikru atlikėjo vardu iš infobox'o.
 *
 * Progresas pranešamas per `onProgress(currentTitle, done, total)`.
 */
async function resolveSongArtistsFromWiki(
  categories: ParsedCategory[],
  host: string,
  onProgress?: (current: string, done: number, total: number) => void
): Promise<void> {
  // Surenkam visas užduotis
  const tasks: Array<{ catIdx: number; nomIdx: number; title: string }> = []
  for (let ci = 0; ci < categories.length; ci++) {
    const cat = categories[ci]
    if (cat.type !== 'song') continue
    for (let ni = 0; ni < cat.nominees.length; ni++) {
      const n = cat.nominees[ni]
      if (n._songWikiTitle) {
        tasks.push({ catIdx: ci, nomIdx: ni, title: n._songWikiTitle })
      }
    }
  }
  if (!tasks.length) return

  // Cache — ta pati daina gali būti keliose kategorijose
  const cache = new Map<string, string | null>()

  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i]
    onProgress?.(t.title.replace(/_/g, ' '), i, tasks.length)
    let artist: string | null | undefined = cache.get(t.title)
    if (artist === undefined) {
      artist = await fetchSongArtistFromWiki(host, t.title)
      cache.set(t.title, artist)
    }
    if (artist) {
      const n = categories[t.catIdx].nominees[t.nomIdx]
      n.artist_name = artist
      const split = splitArtistNamesLocal(artist)
      if (split.length > 1) n.parsed_artists = split
    }
  }
  onProgress?.('', tasks.length, tasks.length)

  // Išvalom _songWikiTitle — jis nereikalingas toliau (nekeliausim į importo payload)
  for (const cat of categories) for (const n of cat.nominees) delete n._songWikiTitle
}

/**
 * Awards-style parser (MAMA, Grammy, Lietuviškos Grammy, pan.)
 * Struktūra:
 *   <h3>Kategorija</h3>
 *   <ul>
 *     <li>Nominantas 1</li>
 *     <li><b>Laimėtojas</b></li>  ← bold žymi laimėtoją
 *     <li>Nominantas 3</li>
 *   </ul>
 */
function parseAwardsHtml(html: string): ParsedCategory[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const results: ParsedCategory[] = []

  // Jei yra „Winners and nominees" arba „Nominacijos" H2 — apriboti scope'ą
  // (Grammy puslapiuose Background skyrius turi H3 „Category changes"/„Criteria amendments"
  //  su UL, kurios NĖRA apdovanojimų kategorijos — jie tekstiniai aprašymai.)
  const allH2s = Array.from(doc.querySelectorAll('h2'))
  const nominatesH2 = allH2s.find(h => /^(winners?\s+and\s+nominees|nominacijos|lau[rv]e[aą]tai|competing\s+(?:entries|acts|countries)|contestants?)$/i.test(
    (h.textContent || '').replace(/\[\w+\]/g, '').trim()
  ))
  const nominatesContainer = nominatesH2?.closest('.mw-heading') || nominatesH2

  // Randam kitą H2 po nominates (iki jo — bus mūsų scope)
  let nextH2Container: Element | null = null
  if (nominatesContainer) {
    let el: Element | null = nominatesContainer.nextElementSibling
    while (el) {
      if (el.matches?.('h2') || el.querySelector?.('h2')) { nextH2Container = el; break }
      el = el.nextElementSibling
    }
  }

  // Filtruojam headings pagal scope: jei nominatesContainer yra, naudojam tik tuos, kurie yra tarp jo ir nextH2Container
  let headings: Element[]
  if (nominatesContainer) {
    headings = []
    let el: Element | null = nominatesContainer.nextElementSibling
    while (el && el !== nextH2Container) {
      if (el.matches?.('h3, h4')) headings.push(el)
      // taip pat gaudom H3/H4 gilesnius wrap'uose
      const inner = el.querySelectorAll?.('h3, h4') || []
      headings.push(...Array.from(inner))
      el = el.nextElementSibling
    }
  } else {
    // Fallback — visi H2/H3/H4 (senas behaviour)
    headings = Array.from(doc.querySelectorAll('h2, h3, h4'))
  }

  for (const h of headings) {
    const name = (h.textContent || '')
      .replace(/\[\d+\]/g, '')
      .replace(/\[redaguoti[^\]]*\]/gi, '')
      .replace(/\[edit\]/gi, '')
      .trim()

    // Praleidžiam service sekcijas
    if (!name) continue
    if (/^(statistika|nuorodos|\u0161altiniai|literatura|references|see also|external links|contents|nominacijos|lau[rv]e[aą]tai|history|background|format|winners|scoring|voting|production|category\s+changes|criteria\s+amendments|membership\s+amendments|process\s+amendments)$/i.test(name))
      continue

    // Walk nextSibling (praleisdami navigation elementus) kol randam UL arba divą, arba kol atsimušam į kitą heading
    const container = h.closest('.mw-heading') || h
    let el: Element | null = container.nextElementSibling
    let list: HTMLUListElement | null = null

    while (el) {
      if (el.matches?.('.mw-heading, h1, h2, h3, h4')) break
      if (el.tagName === 'UL') { list = el as HTMLUListElement; break }
      // Sometimes wrapped: div > ul — BET NE table (table turi savo kategorijų logiką)
      if (el.tagName !== 'TABLE') {
        const inner = el.querySelector?.('ul')
        if (inner && !inner.closest('table')) { list = inner as HTMLUListElement; break }
      }
      el = el.nextElementSibling
    }

    // Struktūra A: H3 + UL (MAMA / paprasta Lithuanian Wiki)
    if (list) {
      pushCategoryFromUl(results, name, list, { bold_is_winner: true })
      continue
    }

    // Struktūra B: H3 + <table> (Grammy-style — kiekviena eilutė = kategorija)
    // Reikia peržiūrėti ar yra table šioj sekcijoj PRIEŠ kitą H3/H2
    let tableEl: Element | null = null
    let e2: Element | null = container.nextElementSibling
    while (e2 && !e2.matches?.('.mw-heading, h1, h2, h3')) {
      if (e2.tagName === 'TABLE' && /wikitable/i.test(e2.className)) { tableEl = e2; break }
      e2 = e2.nextElementSibling
    }

    if (tableEl) {
      // Kiekviena table eilutė — atskira kategorija
      const rows = tableEl.querySelectorAll('tbody > tr')
      for (const row of Array.from(rows)) {
        const cells = [...row.children]
        for (const cell of cells) {
          // Kategorijos pavadinimas — ieškom pirmo <div> arba <i> teksto, arba pirmo block'o
          const catNameEl = cell.querySelector(':scope > div, :scope > i, :scope > b')
          const catName = catNameEl ? (catNameEl.textContent || '').trim() : ''
          const ul = cell.querySelector(':scope > ul, :scope > ol')
          if (!catName || !ul) continue
          pushCategoryFromUl(results, catName, ul as HTMLUListElement, { first_is_winner: true })
        }
      }
    }
  }

  return results
}

/** Paima kategoriją iš UL sąrašo ir prideda prie `results`. */
function pushCategoryFromUl(
  results: ParsedCategory[],
  name: string,
  list: HTMLUListElement,
  opts: { bold_is_winner?: boolean; first_is_winner?: boolean }
) {
  const catType = detectCategoryType(name)
  const nominees: ParsedParticipant[] = []
  let children = Array.from(list.children).filter(c => c.tagName === 'LI')

  // Special case: Grammy „Best New Artist" — UL turi tik 1 <li> (winner),
  // o kiti nominees yra NESTED UL viduje.
  if (children.length === 1) {
    const soloLi = children[0]
    const nestedUls = soloLi.querySelectorAll(':scope > ul, :scope > ol')
    const nestedItems: Element[] = []
    for (const nu of Array.from(nestedUls)) {
      for (const c of Array.from(nu.children)) {
        if (c.tagName === 'LI') nestedItems.push(c)
      }
    }
    if (nestedItems.length >= 2) {
      // „Winner" = pagrindinis li, rest'as — iš nested
      children = [soloLi, ...nestedItems]
      // Šis atvejis — pirma yra winner
      opts = { ...opts, first_is_winner: true, bold_is_winner: false }
    }
  }

  for (let i = 0; i < children.length; i++) {
    const li = children[i]

    // Paimam TOP-level tekstą (be nested UL)
    const clone = li.cloneNode(true) as Element
    clone.querySelectorAll('ul, ol, sup, style, .reference').forEach(n => n.remove())
    const fullText = (clone.textContent || '').replace(/\[\d+\]/g, '').trim()
    const raw = fullText.split(/\n/)[0].replace(/\s+/g, ' ').trim()
    if (!raw) continue

    // Paimam nested UL pirmąjį eilutė (Grammy Song of the Year — ten yra songwriter'iai;
    // taip pat naudinga kai main line neturi atlikėjo)
    const firstNestedLi = li.querySelector(':scope > ul > li, :scope > ol > li')
    let nestedRaw = ''
    if (firstNestedLi) {
      const nClone = firstNestedLi.cloneNode(true) as Element
      nClone.querySelectorAll('ul, ol, sup, style, .reference').forEach(n => n.remove())
      nestedRaw = (nClone.textContent || '').replace(/\[\d+\]/g, '').trim().split(/\n/)[0].replace(/\s+/g, ' ').trim()
    }

    let isWinner = false
    if (opts.first_is_winner && i === 0) {
      isWinner = true
    } else if (opts.bold_is_winner) {
      // MAMA stilius — <b>/<strong> žymi winner'į
      isWinner = !!li.querySelector('b, strong')
    }

    const parsed = parseNomineeLine(raw, catType)

    // Fix (Song of the Year): jei main line grąžino tuščią artist_name (tik „„Wildflower""),
    // Wikipedia turi per nested UL songwriter'ių sąrašą. TIKRAS atlikėjas — NE songwriter!
    // Pvz. „APT." autoriai = 9 songwriter'iai, bet atlikėjai = Rosé & Bruno Mars.
    // Sprendimas: ištraukiam link'ą į dainos page'ą, ir post-process'o metu fetch'inam jos infobox.
    let songWikiTitle: string | undefined
    if (catType === 'song' && !parsed.artist_name) {
      const linkClone = li.cloneNode(true) as Element
      linkClone.querySelectorAll('ul, ol, sup, style, .reference').forEach(n => n.remove())
      const topA = linkClone.querySelector('a[href^="/wiki/"]')
      if (topA) {
        const href = topA.getAttribute('href') || ''
        const title = decodeURIComponent(href.replace(/^\/wiki\//, '').split('#')[0])
        // Filtruojam file/image/wikipedia meta linkus
        if (title && !/^(file|image|wikipedia|help|category|portal):/i.test(title)) {
          songWikiTitle = title
        }
      }
    }

    // Fallback: jei main line grąžino tuščią artist_name ir nerandam song wiki link'o,
    // imam iš nested UL — dažniausiai ten bus songwriter'iai (netgi jie — geriau nei nieko).
    // Nested text formatas: „Billie Eilish & Finneas O'Connell, songwriters" — nupjaunam
    // po pirmo kablelio (prieš rolę).
    let finalArtistName = parsed.artist_name ?? raw
    if (!finalArtistName && !songWikiTitle && nestedRaw) {
      finalArtistName = nestedRaw.split(/,\s*(?:songwriter|producer|engineer|composer|author)/i)[0].trim()
    }

    nominees.push({
      artist_name: finalArtistName || raw,
      song_title: parsed.song_title,
      album_title: parsed.album_title,
      parsed_artists: parsed.parsed_artists,
      songwriters: parsed.songwriters,
      is_winner: isWinner,
      selected: true,
      _songWikiTitle: songWikiTitle,
    })
  }

  if (nominees.length > 0) {
    const albumCount = nominees.filter(n => n.album_title).length
    const songCount = nominees.filter(n => n.song_title).length
    let detectedType: CategoryType = catType
    if (albumCount > nominees.length / 2) detectedType = 'album'
    else if (songCount > nominees.length / 2) detectedType = 'song'
    results.push({
      name,
      name_lt: suggestLithuanianName(name),
      nominees,
      selected: true,
      type: detectedType,
    })
  }
}

// Unicode kabutės pattern'ai (daugkartiniam naudojimui)
const QUOTE_CLASS = '[\u201E\u201C\u201D\u201F\u201A\u2018\u2019\u00AB\u00BB"\']'
const NOT_QUOTE_CLASS = '[^\u201E\u201C\u201D\u201F\u201A\u2018\u2019\u00AB\u00BB"\']'
// „Artist – „Song"" (vardas prieš)
const SONG_RE = new RegExp(`^(.+?)\\s*[\u2013\u2014-]\\s*${QUOTE_CLASS}(${NOT_QUOTE_CLASS}+)${QUOTE_CLASS}\\s*$`)
// „„Song" – Artist" (daina pirmoje vietoje — MAMA 2025 stilius Metų kūriniui)
const SONG_FIRST_RE = new RegExp(`^${QUOTE_CLASS}(${NOT_QUOTE_CLASS}+)${QUOTE_CLASS}\\s*[\u2013\u2014-]\\s*(.+?)\\s*$`)
// „Atlikėjas, albumas „X"" / „Atlikėjas, daina „X"" / koncertas / klipas
const CONTEXT_RE = new RegExp(`^(.+?),?\\s*(albumas|album|daina|kurinys|kūrinys|singlas|single|koncertas|klipas|soundtrack|EP)\\s+${QUOTE_CLASS}(${NOT_QUOTE_CLASS}+)${QUOTE_CLASS}\\s*$`, 'i')

/**
 * Ištraukia skliaustuose esančias pastabas (režisierius, autoriai, notos):
 *   „ba. – „KIEK DAR VARGO" (rež. Nerijus Širvys ir Benas Aleksandravičius)"
 *   → cleaned = „ba. – „KIEK DAR VARGO""
 *   → notes = „rež. Nerijus Širvys ir Benas Aleksandravičius"
 */
function stripParenNotes(s: string): { cleaned: string; notes?: string } {
  const notes: string[] = []
  const cleaned = s
    .replace(/\s*\(([^()]*)\)\s*/g, (_, inner) => {
      const t = inner.trim()
      if (t) notes.push(t)
      return ' '
    })
    .replace(/\s+/g, ' ')
    .trim()
  return { cleaned, notes: notes.length ? notes.join('; ') : undefined }
}

/**
 * Parse vieną nominanto eilutę pagal kategorijos tipą.
 * Grąžina { artist_name, song_title?, album_title?, parsed_artists?, songwriters? }
 *
 * Pirma strip'inami „(rež. X)" / „(aut. Y)" skliausteliai ir saugomi kaip notes.
 *
 * Titlo paskyrimas priklauso nuo catType:
 *   - catType='album' → kabutėse esantis tekstas eina į album_title
 *   - kitu atveju (song/artist) → į song_title
 */
function parseNomineeLine(raw: string, catType: CategoryType): Partial<ParsedParticipant> {
  // Step 1: Išimam skliaustus su pastabomis — saugom kaip songwriters metadata
  const { cleaned, notes } = stripParenNotes(raw)
  const titleField: 'song_title' | 'album_title' = catType === 'album' ? 'album_title' : 'song_title'

  // Step 2: „Artist, kontekstas „X"" (Lithuanian Wiki stilius džiazo kategorijoms)
  //         Čia keyword patikslina ar tai albumas ar daina, neatsižvelgiant į catType.
  const ctxM = cleaned.match(CONTEXT_RE)
  if (ctxM) {
    const artistPart = ctxM[1].trim().replace(/,$/, '').trim()
    const keyword = ctxM[2].toLowerCase()
    const title = ctxM[3].trim()
    const isAlbum = /album|ep/i.test(keyword) || catType === 'album'
    const splitNames = splitArtistNamesLocal(artistPart)
    return {
      artist_name: artistPart,
      song_title: isAlbum ? undefined : title,
      album_title: isAlbum ? title : undefined,
      parsed_artists: splitNames.length > 1 ? splitNames : undefined,
      songwriters: notes,
    }
  }

  // Step 3: „„Title" – Artist" (MAMA 2025 formatas)
  const songFirstM = cleaned.match(SONG_FIRST_RE)
  if (songFirstM) {
    const title = songFirstM[1].trim()
    const artistPart = songFirstM[2].trim()
    const splitNames = splitArtistNamesLocal(artistPart)
    return {
      artist_name: artistPart,
      [titleField]: title,
      parsed_artists: splitNames.length > 1 ? splitNames : undefined,
      songwriters: notes,
    }
  }

  // Step 4: „Artist – „Title"" (standartinis pattern su kabutėm)
  const songM = cleaned.match(SONG_RE)
  if (songM) {
    const artistPart = songM[1].trim()
    const title = songM[2].trim()
    const splitNames = splitArtistNamesLocal(artistPart)
    return {
      artist_name: artistPart,
      [titleField]: title,
      parsed_artists: splitNames.length > 1 ? splitNames : undefined,
      songwriters: notes,
    }
  }

  // Step 5: Album-style „Title – Artist" BE kabučių (Grammy Album of the Year)
  //         Tik jei catType='album' — kitu atveju per daug false positives.
  if (catType === 'album') {
    const albumDashM = cleaned.match(/^(.+?)\s*[\u2013\u2014-]\s*(.+?)\s*$/)
    if (albumDashM) {
      const albumPart = albumDashM[1].trim()
      const artistPart = albumDashM[2].trim()
      const splitNames = splitArtistNamesLocal(artistPart)
      return {
        artist_name: artistPart,
        album_title: albumPart,
        parsed_artists: splitNames.length > 1 ? splitNames : undefined,
        songwriters: notes,
      }
    }
  }

  // Step 6: Jokio pattern'o — tik atlikėjas ar grupė
  if (catType === 'artist') {
    return { artist_name: cleaned, songwriters: notes }
  }

  // Song/album kategorijoje — taip pat gali būti tik daina be atlikėjo (Grammy Song of the Year:
  //  „„Wildflower"" be atlikėjo — atlikėjas tiesiogiai nerodomas, tik songwriters).
  // Išimam kabutes nuo krašto, jei yra.
  const quoteStripped = cleaned.replace(/^[\u201E\u201C\u201D\u201F\u201A\u2018\u2019\u00AB\u00BB"']+|[\u201E\u201C\u201D\u201F\u201A\u2018\u2019\u00AB\u00BB"']+$/g, '').trim()
  if (catType === 'song' && quoteStripped !== cleaned) {
    // Tai buvo daina kabutėse be matomo atlikėjo
    return {
      artist_name: '',
      song_title: quoteStripped,
      songwriters: notes,
    }
  }

  const splitNames = splitArtistNamesLocal(cleaned)
  return {
    artist_name: cleaned,
    parsed_artists: splitNames.length > 1 ? splitNames : undefined,
    songwriters: notes,
  }
}

/**
 * HTML-based parser. Ima Wikipedia rendered HTML (country names be flagicon kodų problemų).
 * Automatiškai atpažįsta stulpelius pagal header tekstą.
 */
function parseParticipantsHtml(html: string): ParsedParticipant[] {
  const results: ParsedParticipant[] = []
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  // Surandam Participants heading
  const headings = doc.querySelectorAll('h2, h3')
  let sectionStart: Element | null = null
  for (const h of Array.from(headings)) {
    const text = (h.textContent || '').trim()
    if (/^Participants?$/i.test(text) ||
        /^Participating\s+countries?$/i.test(text) ||
        /^Competing\s+(entries|countries|acts)$/i.test(text) ||
        /^Contestants?$/i.test(text) ||
        /^Nominees?$/i.test(text)) {
      sectionStart = h
      break
    }
  }

  // Find tables in the document — try section first, then fallback to whole doc
  let tables: HTMLTableElement[] = []
  if (sectionStart) {
    let elem: Element | null = sectionStart.parentElement
    while (elem) {
      const found = elem.querySelectorAll('table.wikitable')
      if (found.length > 0) {
        tables = Array.from(found) as HTMLTableElement[]
        break
      }
      elem = elem.parentElement
    }
  }
  if (tables.length === 0) {
    tables = Array.from(doc.querySelectorAll('table.wikitable')) as HTMLTableElement[]
  }

  for (const table of tables) {
    // Identify headers
    const headerRow = table.querySelector('thead > tr, tbody > tr:first-child')
    if (!headerRow) continue
    const headerCells = headerRow.querySelectorAll('th, td')
    if (headerCells.length < 2) continue
    const headers = Array.from(headerCells).map(th =>
      (th.textContent || '').toLowerCase().trim()
    )

    const countryIdx = headers.findIndex(h => /\b(country|nation)\b/.test(h))
    const artistIdx = headers.findIndex(h => /\b(artist|performer|act|representative|nominee)\b/.test(h))
    const songIdx = headers.findIndex(h => /\b(song|entry|title|track|work)\b/.test(h))
    const swIdx = headers.findIndex(h => /\b(songwriter|composer|lyricist|writer|author)\b/.test(h))
    const langIdx = headers.findIndex(h => /\blanguage\b/.test(h))

    // Reikia bent artist arba song
    if (artistIdx < 0 && songIdx < 0 && countryIdx < 0) continue

    const rows = table.querySelectorAll('tbody > tr')
    for (const row of Array.from(rows)) {
      // Skip header row
      if (row === headerRow) continue

      // Collect cells: include th (scope="row") as index 0 if present
      const th = row.querySelector(':scope > th')
      const tds = row.querySelectorAll(':scope > td')
      const allCells: Element[] = []
      if (th) allCells.push(th)
      allCells.push(...Array.from(tds))

      if (allCells.length < 2) continue

      const cellText = (idx: number): string => {
        if (idx < 0 || idx >= allCells.length) return ''
        const el = allCells[idx]
        if (!el) return ''
        // Clone, remove <sup>/<style>/reference tags
        const clone = el.cloneNode(true) as Element
        clone.querySelectorAll('sup, style, .reference, .mw-editsection').forEach(n => n.remove())
        return (clone.textContent || '').replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim()
      }

      // Jei countryIdx=0 ir yra scope=row, naudojam th (kuris jau pirmas allCells)
      const country = cellText(countryIdx)
      const artistRaw = cellText(artistIdx)
      const song = cellText(songIdx).replace(/^["""]|["""]$/g, '').trim()
      const sw = cellText(swIdx)
      const lang = cellText(langIdx)

      // Valymas: iš artist/song išmetam trailing [N] arba tekstą skliaustuose, jei per ilgas
      const artist = artistRaw.replace(/\s*\([^)]{30,}\)\s*$/, '').trim()

      if (!artist || artist.length < 2 || artist.length > 120) continue

      results.push({
        country,
        artist_name: artist,
        song_title: song || undefined,
        songwriters: sw || undefined,
        selected: true,
      })
    }

    // Pirma lentelė kur radom dalyvių — naudojam ją
    if (results.length > 0) return results
  }

  return results
}

/** @deprecated — senas wikitext parseris, paliktas kaip fallback. */
function parseEurovisionTable(wikitext: string): ParsedParticipant[] {
  const results: ParsedParticipant[] = []

  // Ieškom kelių galimų sekcijos pavadinimų (Participants, Participating countries, Competing entries)
  const sectionRegexes = [
    /==\s*Participants?\s*==([\s\S]*?)(?=\n==[^=]|$)/i,
    /==\s*Participating\s+countries?\s*==([\s\S]*?)(?=\n==[^=]|$)/i,
    /==\s*Competing\s+(?:entries|countries|acts)\s*==([\s\S]*?)(?=\n==[^=]|$)/i,
    /==\s*Contestants?\s*==([\s\S]*?)(?=\n==[^=]|$)/i,
  ]
  let section = wikitext
  for (const re of sectionRegexes) {
    const m = wikitext.match(re)
    if (m) { section = m[1]; break }
  }

  // Ieškom visų wikitables (su class atribute kuri turi "wikitable")
  const tableRegex = /\{\|\s*[^{}\n]*class="[^"]*wikitable[^"]*"([\s\S]*?)\n\|\}/g
  const tables: string[] = []
  let m
  while ((m = tableRegex.exec(section)) !== null) tables.push(m[1])

  for (const table of tables) {
    // Skaidom per |- (row separator)
    const rows = table.split(/\n\|-/)
    if (rows.length < 2) continue

    // --- Nustatom headers (pirmasis row) ---
    const headerRow = rows[0]
    // Headers gali būti paskirstytos per `\n!` arba `!!`, kartais po style=""
    const headerStrings = extractHeaderCells(headerRow)
    const headers = headerStrings.map(h => cleanWikitext(h).toLowerCase().trim())

    const artistIdx = headers.findIndex(h => /\b(artist|performer|act|representative)\b/.test(h))
    const songIdx   = headers.findIndex(h => /\b(song|entry|title)\b/.test(h))
    const countryIdx = headers.findIndex(h => /\b(country|nation)\b/.test(h))
    const swIdx     = headers.findIndex(h => /\b(songwriter|composer|lyricist|music|author|writer)\b/.test(h))

    if (artistIdx < 0 && songIdx < 0) continue

    // Country gali būti row header ("scope=row") — tada fallback į 0 index
    const countryIsRowHeader = countryIdx === 0 || /scope\s*=\s*"?row/i.test(headerRow)

    // --- Parsinam kiekvieną eilutę ---
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      const cells = extractAllCells(row) // su row-header (! scope=...) pirma

      if (cells.length < 2) continue

      // Paimam atitinkamas cells pagal header indeksus.
      // Jei countryIdx -1 ir countryIsRowHeader — country yra pirmasis header cell.
      const countryRaw = countryIdx >= 0 ? cells[countryIdx] : (countryIsRowHeader ? cells[0] : '')
      const artistRaw  = artistIdx  >= 0 ? cells[artistIdx]  : cells[1] || ''
      const songRaw    = songIdx    >= 0 ? cells[songIdx]    : cells[2] || ''
      const swRaw      = swIdx      >= 0 ? cells[swIdx]      : ''

      const country = countryRaw ? extractCountry(countryRaw) : undefined
      const artist  = artistRaw  ? extractWikiLink(artistRaw) : ''
      const song    = songRaw    ? extractSongTitle(songRaw) : ''
      const sw      = swRaw      ? extractSongwriters(swRaw) : undefined

      if (!artist || artist.length < 2 || artist.length > 100) continue

      results.push({
        country,
        artist_name: artist,
        song_title: song,
        songwriters: sw,
        selected: true,
      })
    }

    // Jei radom bent vieną — užtenka, neieškom kitose lentelėse
    if (results.length > 0) break
  }

  return results
}

/** Headers gali būti per „!" (scope=col) arba per „||". */
function extractHeaderCells(raw: string): string[] {
  const cells: string[] = []
  // Atmetam table caption (|+ ...)
  const lines = raw.split('\n').filter(l => !l.trim().startsWith('|+'))
  const cleaned = lines.join('\n')

  const parts = cleaned.split(/\n!|\n\s*!|!!/).map(p => p.trim()).filter(Boolean)
  for (const p of parts) {
    // Pašalinam attribute prefix: `scope="col" |` arba `style="..." |`
    const afterAttr = p.replace(/^[^|]*\|/, '').trim()
    // Praleidžiam table caption ar tuščius
    if (afterAttr && !afterAttr.startsWith('+') && afterAttr.length > 0) cells.push(afterAttr)
  }
  return cells
}

/** Ištraukia VISAS cell'as — ir !-header cells, ir |-data cells. */
function extractAllCells(row: string): string[] {
  const cells: string[] = []
  // Pirmiausia ieškom scope="row" arba `!` prefixes
  // Skaidom row į eilutes ir tada apdorojam
  const lines = row.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    // `! scope="row" | Content` arba `! Content`
    if (trimmed.startsWith('!')) {
      const content = trimmed.replace(/^!+\s*/, '')
      // Jei yra scope=row + | separator — imam po |
      const afterPipe = content.includes('|') && !/^[^|]*\[\[/.test(content)
        ? content.split('|').slice(1).join('|').trim()
        : content
      // Apdorojam !! atvejus (multiple headers one line)
      const parts = afterPipe.split(/\s*!!\s*/).map(p => p.replace(/^[^|]*\|/, '').trim()).filter(Boolean)
      cells.push(...parts)
    }
    // `| Content` arba `| Content || Content || ...`
    else if (trimmed.startsWith('|') && !trimmed.startsWith('|-') && !trimmed.startsWith('|}')) {
      const content = trimmed.replace(/^\|+\s*/, '')
      // || separates cells
      const parts = content.split(/\s*\|\|\s*/)
      for (let p of parts) {
        // Atribute prefix: `style="..." | value`
        if (/^[a-z]+\s*=\s*"/i.test(p) && p.includes('|')) {
          p = p.replace(/^[^|]*\|/, '').trim()
        }
        if (p) cells.push(p)
      }
    }
    // Tęsinys jau prasidėjusios cell'ės (pvz. multiline templates kaip {{Plainlist|...}})
    else if (cells.length > 0) {
      cells[cells.length - 1] += '\n' + trimmed
    }
  }
  return cells
}

/** Songwriters iš {{Plainlist|*a*b}} arba tiesiog sąrašo */
function extractSongwriters(s: string): string {
  const list = s.match(/\{\{\s*(?:plainlist|plain list|unbulleted list|ubl)\s*\|([\s\S]*?)\}\}/i)
  const raw = list ? list[1] : s
  return raw
    .split(/\n\*|\s*\|\s*/)
    .map(cleanWikitext)
    .filter(p => p && p.length < 80)
    .slice(0, 6)
    .join(', ')
}

/** Išima šalį iš {{flag|Country}}, {{flagicon|XX}} [[Country]] ar [[Country]] */
function extractCountry(s: string): string {
  // Pirma ieškom {{flag|Country}}, {{flagcountry|...}} arba {{flagicon|CODE}}
  const flag = s.match(/\{\{\s*flag(?:country)?\s*\|\s*([^}|]+)/i)
  if (flag) return flag[1].trim()
  // Po flagicon dažnai eina [[Country]]
  const link = s.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/)
  if (link) return link[1].trim()
  return cleanWikitext(s)
}

/** Išima atlikėjo vardą (pirmąjį wiki link arba plain text) */
function extractWikiLink(s: string): string {
  const link = s.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/)
  if (link) return (link[2] || link[1]).trim()
  return cleanWikitext(s)
}

/** Išima dainos pavadinimą — dažniausiai "[[X]]" arba [[X|Y]] */
function extractSongTitle(s: string): string {
  // Pašalinam "" kabutes
  const quoted = s.match(/["""]([^"""]+)["""]/)
  if (quoted) {
    return extractWikiLink(quoted[1]) || cleanWikitext(quoted[1])
  }
  return extractWikiLink(s)
}

function cleanWikitext(s: string): string {
  let prev = ''
  let out = s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/<[^>]+>/g, '')
  // Iteratyviai šalinam {{...}} kad handlintume nested templates
  while (prev !== out) {
    prev = out
    out = out.replace(/\{\{[^{}]*\}\}/g, '')
  }
  return out
    .replace(/\[\[[^\]|]*\|([^\]]+)\]\]/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ===== UI =====

export default function WikipediaVotingImport({ eventId, editionId, onDone, onClose }: Props) {
  const [url, setUrl] = useState('')
  const [parsing, setParsing] = useState(false)
  const [result, setResult] = useState<ParseResult | null>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [replaceExisting, setReplaceExisting] = useState(false)
  const [parseStage, setParseStage] = useState<string | null>(null)
  const [importProgress, setImportProgress] = useState<{ done: number; total: number; current?: string } | null>(null)

  async function handleParse() {
    setError(null)
    setResult(null)
    setParseStage(null)

    const parsed = parseWikipediaUrl(url)
    if (!parsed) return setError('Neatpažintas Wikipedia URL')

    setParsing(true)
    try {
      setParseStage('📄 Atsiunčiama Wikipedia…')
      const html = await fetchWikipediaHtml(parsed.host, parsed.title)
      if (!html) {
        setError('Nepavyko atsisiųsti Wikipedia puslapio')
        return
      }

      setParseStage('🔍 Analizuojamos kategorijos ir nominantai…')
      // Auto-detect: PIRMA bandom Awards-style (MAMA/Grammy — H3+UL arba H3+table)
      // Tik jei kategorijų rasta <2 — fallback į Eurovision-style dalyvių lentelę
      const categories = parseAwardsHtml(html)
      const participants = categories.length >= 2 ? [] : parseParticipantsHtml(html)

      if (categories.length >= 2) {
        // Awards-style: MAMA, Grammy — daug kategorijų su nominantais
        if (!editionId) {
          setError('Šis puslapis yra award (kelios kategorijos). Importo modalui trūksta editionId — importuok iš leidimo lygio.')
          return
        }
        // (blokas tęsiasi žemiau)
      } else if (participants.length >= 5) {
        // Eurovision-style: viena didelė dalyvių lentelė
        setResult({ mode: 'eurovision', participants })
        return
      } else {
        setError('Nerasta nei dalyvių lentelės (Eurovision), nei kategorijų su nominantais (MAMA/Grammy). Patikrink URL.')
        return
      }

      // Jei pateko čia — awards-style, kategorijos turi būti >= 2
      {
          // Song of the Year fix: jei nominantai yra tik daina be atlikėjo (pvz. „Wildflower"),
          // fetch'inam dainų Wiki page'us ir ištraukiam tikrus atlikėjus iš infobox.
          const pendingFetches = categories.reduce((s, c) =>
            c.type === 'song' ? s + c.nominees.filter(n => n._songWikiTitle).length : s, 0)
          if (pendingFetches > 0) {
            await resolveSongArtistsFromWiki(categories, parsed.host, (current, done, total) => {
              setParseStage(`🎵 Ieškomi atlikėjai dainos page'uose (${done}/${total})${current ? ` — ${current}` : ''}…`)
            })
          }

          setParseStage('💾 Tikrinamas DB matchas esamiems atlikėjams/dainoms…')
          // DB preview: patikrinam kuriais atlikėjų/dainų/albumų vardais jau yra įrašai.
          // (1) pažymėti ✅ / ➕ ikona UI'e, (2) smart group detection per prefix'us
          const allArtistNames = new Set<string>()
          const allTrackTitles = new Set<string>()
          const allAlbumTitles = new Set<string>()
          for (const c of categories) {
            for (const n of c.nominees) {
              // Full string ir visi prefix'ai — tai leidžia rasti grupę „Lilas ir Innomine"
              // net kai pilnas string yra „Lilas ir Innomine ir Justinas Jarutis"
              if (n.artist_name) {
                generateArtistPrefixes(n.artist_name).forEach(p => allArtistNames.add(p))
              }
              if (n.parsed_artists) n.parsed_artists.forEach(a => allArtistNames.add(a))
              if (n.song_title) allTrackTitles.add(n.song_title)
              if (n.album_title) allAlbumTitles.add(n.album_title)
            }
          }

          let matches: { artists: Record<string, any>; tracks: Record<string, any>; albums: Record<string, any> } = { artists: {}, tracks: {}, albums: {} }
          try {
            const pvRes = await fetch('/api/voting/import/preview', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                artist_names: [...allArtistNames],
                track_titles: [...allTrackTitles],
                album_titles: [...allAlbumTitles],
              }),
            })
            if (pvRes.ok) matches = await pvRes.json()
          } catch {}

          // Annotate nominees. Prioretas: HEURISTIKA > DB match (nebent DB prefix'as ilgesnis).
          const annotated = categories.map(c => ({
            ...c,
            nominees: c.nominees.map(n => {
              // Heuristikos rezultatas (jau gavome iš parseNomineeLine)
              const heurMain = n.parsed_artists?.[0] || n.artist_name || ''
              const heurFeat = n.parsed_artists?.slice(1) || []

              // Ieškom DB match'o tarp prefix'ų (ilgiausi pirmi)
              const prefixes = generateArtistPrefixes(n.artist_name || '')
              let dbPrefix: string | undefined
              let dbId: number | undefined
              for (const pref of prefixes) {
                const hit = matches.artists?.[pref]
                if (hit) { dbPrefix = pref; dbId = hit.id; break }
              }

              // Nuspręstį kas bus pagrindinis:
              // - Jei DB prefix'as yra >= heuristikos main'ui (tai yra, DB turi grupę ilgesnę nei mūsų split) — naudojam DB
              // - Kitu atveju — paliekam heuristikos split'ą
              let finalMain = heurMain
              let finalFeat = heurFeat
              let existingId: number | undefined
              let groupMatch = false

              if (dbPrefix && dbPrefix.length >= heurMain.length) {
                finalMain = dbPrefix
                existingId = dbId
                // Re-split rest'o AGRESYVIAI (visi „ir" separatoriai laužia, nes grupė jau išrinkta)
                const remaining = (n.artist_name || '').substring(dbPrefix.length).trim()
                const cleanedRest = remaining.replace(/^\s*(?:feat\.?|ft\.?|featuring|&|x|\bir\b|\band\b|,)\s*/i, '').trim()
                finalFeat = cleanedRest
                  ? cleanedRest.split(/\s+(?:feat\.?|ft\.?|featuring|&|x|\bir\b|\band\b)\s+|\s*,\s*/gi)
                      .map(s => s.trim())
                      .filter(s => s.length >= 2 && s.length <= 80)
                  : []
                groupMatch = dbPrefix === n.artist_name
              } else {
                // Heuristika laimėjo — ar bent kas nors iš heuristikos main match'ina DB?
                existingId = matches.artists?.[heurMain]?.id
                groupMatch = false
              }

              return {
                ...n,
                existing_artist_id: existingId,
                existing_track_id: n.song_title ? matches.tracks?.[n.song_title]?.id : undefined,
                existing_album_id: n.album_title ? matches.albums?.[n.album_title]?.id : undefined,
                group_match: groupMatch,
                parsed_artists: finalFeat.length > 0 ? [finalMain, ...finalFeat] : undefined,
              }
            }),
          }))

          setResult({ mode: 'awards', categories: annotated })
      }
    } catch (e: any) {
      setError(e.message || 'Klaida parsinant Wikipedia')
    } finally {
      setParsing(false)
      setParseStage(null)
    }
  }

  async function handleImport() {
    if (!result) return
    setImporting(true)
    setError(null)
    try {
      if (result.mode === 'eurovision') {
        const toImport = result.participants.filter(p => p.selected)
        if (!toImport.length) return
        if (!eventId) { setError('Trūksta event ID (Eurovision-style importui)'); return }

        const res = await fetch('/api/voting/participants', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_id: eventId,
            replace_existing: replaceExisting,
            participants: toImport.map((p, i) => ({
              artist_name: p.artist_name,
              song_title: p.song_title,
              country: p.country,
              youtube_url: p.youtube_url,
              photo_url: p.photo_url,
              display_name: p.country ? `${p.country} — ${p.artist_name}` : p.artist_name,
              display_subtitle: p.song_title,
              metadata: p.songwriters ? { songwriters: p.songwriters } : null,
              sort_order: i,
            })),
          }),
        })
        const data = await res.json()
        if (!res.ok) { setError(`Importo klaida: ${data.error}`); return }
        alert(`Sėkmingai importuota ${data.count} dalyvių`)
        onDone()
      } else {
        // Awards mode — siunčiam po VIENĄ kategoriją, kad galėtume rodyti progress bar'ą.
        // Pirma kategorija nešasi `replace_existing` (nuvalo visą seną edition), likusios — false.
        const selectedCats = result.categories.filter(c => c.selected && c.nominees.some(n => n.selected))
        if (!selectedCats.length) return

        const total = selectedCats.length
        setImportProgress({ done: 0, total, current: '' })

        let totalEvents = 0
        let totalNominees = 0
        for (let i = 0; i < selectedCats.length; i++) {
          const c = selectedCats[i]
          const catType = c.type || detectCategoryType(c.name)
          const participantType: 'artist' | 'artist_song' | 'artist_album' =
            catType === 'song' ? 'artist_song' : catType === 'album' ? 'artist_album' : 'artist'
          const finalName = (c.name_lt || '').trim() || c.name

          setImportProgress({ done: i, total, current: finalName })

          const payload = {
            edition_id: editionId,
            replace_existing: i === 0 ? replaceExisting : false,
            categories: [{
              name: finalName,
              description: c.name_lt ? `Originalus: ${c.name}` : undefined,
              participant_type: participantType,
              nominees: c.nominees.filter(n => n.selected).map(n => {
                const mainName = catType === 'artist'
                  ? n.artist_name
                  : (n.parsed_artists?.[0] || n.artist_name)
                const featuring = catType === 'artist' ? [] : (n.parsed_artists?.slice(1) || [])
                return {
                  artist_name: mainName,
                  featuring_names: featuring,
                  song_title: n.song_title,
                  album_title: n.album_title,
                  is_winner: n.is_winner,
                  display_name: n.artist_name,
                  display_subtitle: n.song_title || n.album_title,
                }
              }),
            }],
          }

          const res = await fetch('/api/voting/import/awards', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          const data = await res.json()
          if (!res.ok) {
            setError(`Importo klaida ties „${finalName}": ${data.error}`)
            return
          }
          totalEvents += data.total_events || 0
          totalNominees += data.total_nominees || 0
        }

        setImportProgress({ done: total, total, current: '' })
        alert(`Sėkmingai importuota ${totalEvents} kategorijų su ${totalNominees} nominantais`)
        onDone()
      }
    } catch (e: any) {
      setError(e.message || 'Import klaida')
    } finally {
      setImporting(false)
      setImportProgress(null)
    }
  }

  function toggleParticipant(idx: number) {
    if (!result || result.mode !== 'eurovision') return
    setResult({
      ...result,
      participants: result.participants.map((p, i) => (i === idx ? { ...p, selected: !p.selected } : p)),
    })
  }

  function toggleAllParticipants() {
    if (!result || result.mode !== 'eurovision') return
    const all = result.participants.every(r => r.selected)
    setResult({
      ...result,
      participants: result.participants.map(p => ({ ...p, selected: !all })),
    })
  }

  function toggleCategory(catIdx: number) {
    if (!result || result.mode !== 'awards') return
    setResult({
      ...result,
      categories: result.categories.map((c, i) => i === catIdx ? { ...c, selected: !c.selected } : c),
    })
  }

  function updateCategoryNameLt(catIdx: number, name_lt: string) {
    if (!result || result.mode !== 'awards') return
    setResult({
      ...result,
      categories: result.categories.map((c, i) => i === catIdx ? { ...c, name_lt } : c),
    })
  }

  /** Kai vartotojas per-kategoriją pakeičia tipą — perrikiuojam laukus pagal naują tipą. */
  function changeCategoryType(catIdx: number, newType: CategoryType) {
    if (!result || result.mode !== 'awards') return
    setResult({
      ...result,
      categories: result.categories.map((c, i) => {
        if (i !== catIdx) return c
        const reparsed = c.nominees.map(n => {
          if (newType === 'album') {
            // Pereinam į albumą — jei turim song_title, perkeliam į album_title
            return {
              ...n,
              album_title: n.album_title || n.song_title,
              song_title: undefined,
            }
          }
          if (newType === 'song') {
            // Pereinam į dainą — jei turim album_title, perkeliam į song_title
            return {
              ...n,
              song_title: n.song_title || n.album_title,
              album_title: undefined,
            }
          }
          // newType === 'artist' — išvalom title ir parsed_artists (atlikėjo kategorijoje grupė neskaldyta)
          return {
            ...n,
            song_title: undefined,
            album_title: undefined,
            parsed_artists: undefined,
          }
        })
        return { ...c, type: newType, nominees: reparsed }
      }),
    })
  }

  function toggleNominee(catIdx: number, nomIdx: number) {
    if (!result || result.mode !== 'awards') return
    setResult({
      ...result,
      categories: result.categories.map((c, i) => i !== catIdx ? c : {
        ...c,
        nominees: c.nominees.map((n, j) => j === nomIdx ? { ...n, selected: !n.selected } : n),
      }),
    })
  }

  function toggleAllCategories() {
    if (!result || result.mode !== 'awards') return
    const all = result.categories.every(c => c.selected)
    setResult({
      ...result,
      categories: result.categories.map(c => ({ ...c, selected: !all })),
    })
  }

  const selectedCount = !result ? 0 :
    result.mode === 'eurovision'
      ? result.participants.filter(r => r.selected).length
      : result.categories.filter(c => c.selected).reduce((s, c) => s + c.nominees.filter(n => n.selected).length, 0)

  const modal = (
    <div
      data-theme="light"
      style={{ colorScheme: 'light' }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 text-[var(--text-primary)]"
      onClick={onClose}
    >
      <div
        className="bg-[var(--bg-surface)] rounded-2xl shadow-[var(--modal-shadow)] w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
          <span className="text-sm font-bold text-[var(--text-primary)]">Importas iš Wikipedia</span>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] text-xl leading-none px-1">✕</button>
        </div>

        <div className="p-4 space-y-4 overflow-auto">
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1">Wikipedia puslapio URL</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://en.wikipedia.org/wiki/Eurovision_Song_Contest_2026"
                className="flex-1 px-2.5 py-1.5 border border-[var(--input-border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-blue-400 bg-[var(--bg-surface)]"
              />
              <button
                onClick={handleParse}
                disabled={parsing || !url}
                className="px-3 py-1.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 text-sm font-medium whitespace-nowrap"
              >
                {parsing ? 'Parsinama…' : 'Parsinti'}
              </button>
            </div>
            <div className="text-xs text-[var(--text-faint)] mt-1">
              Palaiko: Eurovision-style (viena lentelė su dalyviais) ir Awards-style (MAMA, Grammy — H3 kategorijos su nominantų sąrašu; bold = laimėtojas).
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
          )}

          {/* Parse progress — rodomas kol parsinama */}
          {parsing && parseStage && (
            <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg text-sm flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
              <span className="flex-1">{parseStage}</span>
            </div>
          )}

          {/* Import progress bar — rodomas kol importuojama */}
          {importing && importProgress && (
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm space-y-1.5">
              <div className="flex items-center justify-between text-orange-800">
                <span>
                  ⬆️ Importuojama kategorija <strong>{importProgress.done + (importProgress.done < importProgress.total ? 1 : 0)}</strong> iš <strong>{importProgress.total}</strong>
                  {importProgress.current && (
                    <span className="ml-2 text-orange-600">— {importProgress.current}</span>
                  )}
                </span>
                <span className="text-xs text-orange-600">
                  {Math.round((importProgress.done / Math.max(importProgress.total, 1)) * 100)}%
                </span>
              </div>
              <div className="h-1.5 bg-orange-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-500 transition-all duration-300"
                  style={{ width: `${(importProgress.done / Math.max(importProgress.total, 1)) * 100}%` }}
                />
              </div>
            </div>
          )}

          {result?.mode === 'eurovision' && (
            <>
              <div className="flex items-center justify-between">
                <div className="text-sm text-[var(--text-secondary)]">
                  <span className="inline-block text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded mr-2">Eurovision-style</span>
                  Rasta <strong className="text-[var(--text-primary)]">{result.participants.length}</strong> dalyvių, pažymėta <strong className="text-[var(--text-primary)]">{selectedCount}</strong>
                </div>
                <button onClick={toggleAllParticipants} className="text-sm text-orange-600 hover:underline">
                  {result.participants.every(r => r.selected) ? 'Atžymėti visus' : 'Pažymėti visus'}
                </button>
              </div>

              <div className="border border-[var(--border-default)] rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--bg-elevated)] text-xs uppercase text-[var(--text-muted)]">
                    <tr>
                      <th className="p-2 w-8"></th>
                      <th className="p-2 text-left">Šalis</th>
                      <th className="p-2 text-left">Atlikėjas</th>
                      <th className="p-2 text-left">Daina</th>
                      <th className="p-2 text-left">Autoriai</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.participants.map((r, i) => (
                      <tr key={i} className={`border-t border-[var(--border-subtle)] ${r.selected ? '' : 'opacity-40'}`}>
                        <td className="p-2">
                          <input type="checkbox" checked={r.selected} onChange={() => toggleParticipant(i)} />
                        </td>
                        <td className="p-2 text-[var(--text-secondary)]">{r.country}</td>
                        <td className="p-2 font-medium text-[var(--text-primary)]">{r.artist_name}</td>
                        <td className="p-2 text-[var(--text-secondary)]">{r.song_title}</td>
                        <td className="p-2 text-xs text-[var(--text-muted)]">{r.songwriters}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {result?.mode === 'awards' && (
            <>
              <div className="flex items-center justify-between">
                <div className="text-sm text-[var(--text-secondary)]">
                  <span className="inline-block text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded mr-2">Awards-style</span>
                  <strong className="text-[var(--text-primary)]">{result.categories.length}</strong> kategorijų · <strong className="text-[var(--text-primary)]">{selectedCount}</strong> nominantų pažymėta
                  <span className="text-xs text-[var(--text-faint)] ml-2">(bold = laimėtojas)</span>
                </div>
                <button onClick={toggleAllCategories} className="text-sm text-orange-600 hover:underline">
                  {result.categories.every(c => c.selected) ? 'Atžymėti visas' : 'Pažymėti visas'}
                </button>
              </div>

              <div className="space-y-2">
                {result.categories.map((cat, ci) => {
                  const type = cat.type || detectCategoryType(cat.name)
                  return (
                    <div
                      key={ci}
                      className={`border rounded-lg ${cat.selected ? 'border-[var(--border-default)]' : 'border-[var(--border-subtle)] opacity-40'}`}
                    >
                      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-elevated)] border-b border-[var(--border-subtle)]">
                        <input type="checkbox" checked={cat.selected} onChange={() => toggleCategory(ci)} />
                        <div className="flex-1 min-w-0">
                          {/* Editable LT pavadinimas */}
                          <input
                            type="text"
                            value={cat.name_lt || ''}
                            onChange={e => updateCategoryNameLt(ci, e.target.value)}
                            placeholder={cat.name}
                            className="w-full font-semibold text-sm text-[var(--text-primary)] bg-transparent border-none focus:outline-none focus:bg-[var(--bg-surface)] focus:ring-1 focus:ring-blue-400 rounded px-1 -mx-1"
                            title="LT pavadinimas (jei tuščias — bus saugomas originalus)"
                          />
                          <div className="text-[10px] text-[var(--text-faint)] truncate">
                            <span className="font-medium">EN:</span> {cat.name}
                          </div>
                        </div>
                        <select
                          value={type}
                          onChange={e => changeCategoryType(ci, e.target.value as CategoryType)}
                          className="text-xs px-1.5 py-0.5 border border-[var(--input-border)] rounded bg-[var(--bg-surface)] text-[var(--text-secondary)] cursor-pointer"
                          title="Pakeisti kategorijos tipą — nominantai bus perparsinti"
                        >
                          <option value="artist">🎤 Atlikėjas</option>
                          <option value="song">🎵 Daina</option>
                          <option value="album">💿 Albumas</option>
                        </select>
                        <div className="text-xs text-[var(--text-muted)]">{cat.nominees.length} nom.</div>
                      </div>
                      <div className="p-2 divide-y divide-[var(--border-subtle)]">
                        {cat.nominees.map((n, ni) => {
                          const hasMainArtist = n.parsed_artists && n.parsed_artists.length > 0
                          const mainArtist = hasMainArtist ? n.parsed_artists![0] : n.artist_name
                          const featuring = hasMainArtist ? n.parsed_artists!.slice(1) : []
                          return (
                          <label
                            key={ni}
                            className={`flex items-start gap-2 py-1.5 px-2 cursor-pointer hover:bg-[var(--bg-hover)] rounded ${!n.selected ? 'opacity-40' : ''}`}
                          >
                            <input type="checkbox" className="mt-1" checked={n.selected} onChange={() => toggleNominee(ci, ni)} />
                            {n.is_winner && <span className="text-xs mt-0.5">🏆</span>}
                            <div className="flex-1 min-w-0">
                              {/* Raw Wikipedia tekstas */}
                              <div className={`text-sm ${n.is_winner ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                                {n.artist_name}
                                {n.song_title && (
                                  <span className="ml-2 text-xs text-[var(--text-muted)] font-normal">— 🎵 „{n.song_title}"</span>
                                )}
                                {n.album_title && (
                                  <span className="ml-2 text-xs text-[var(--text-muted)] font-normal">— 💿 „{n.album_title}"</span>
                                )}
                              </div>
                              {/* Parsed preview: kas bus sukurta DB */}
                              {(featuring.length > 0 || n.song_title || n.album_title || n.existing_artist_id) ? (
                                <div className="text-xs text-[var(--text-muted)] mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                                  <span className="text-[var(--text-faint)]">
                                    → 🎤 <strong className={n.existing_artist_id ? 'text-emerald-600' : 'text-[var(--text-secondary)]'}>{mainArtist}</strong>
                                    {n.existing_artist_id
                                      ? <span className="ml-1 text-emerald-600" title="Atlikėjas jau yra DB">✓ #{n.existing_artist_id}</span>
                                      : <span className="ml-1 text-blue-500" title="Bus sukurtas naujas">➕</span>}
                                    {n.group_match && <span className="ml-1 text-purple-600" title="Rastas kaip grupė — nedalinta į feat">· grupė</span>}
                                  </span>
                                  {featuring.map((f, fi) => (
                                    <span key={fi} className="text-[var(--text-faint)]">+ feat. <span className="text-[var(--text-secondary)]">{f}</span></span>
                                  ))}
                                  {n.song_title && (
                                    <span className="text-[var(--text-faint)]">
                                      → 🎵 <span className={n.existing_track_id ? 'text-emerald-600 font-medium' : 'text-[var(--text-secondary)]'}>„{n.song_title}"</span>
                                      {n.existing_track_id && <span className="ml-1 text-emerald-600">✓</span>}
                                    </span>
                                  )}
                                  {n.album_title && (
                                    <span className="text-[var(--text-faint)]">
                                      → 💿 <span className={n.existing_album_id ? 'text-emerald-600 font-medium' : 'text-[var(--text-secondary)]'}>„{n.album_title}"</span>
                                      {n.existing_album_id && <span className="ml-1 text-emerald-600">✓</span>}
                                    </span>
                                  )}
                                </div>
                              ) : null}
                              {n.songwriters && (
                                <div className="text-xs text-[var(--text-faint)] mt-0.5 italic">
                                  notes: {n.songwriters}
                                </div>
                              )}
                            </div>
                          </label>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {result && (
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={e => setReplaceExisting(e.target.checked)}
              />
              {result.mode === 'eurovision'
                ? 'Pakeisti esamus dalyvius (ištrinti senus prieš įdedant naujus)'
                : 'Pakeisti esamus event\'us (ištrinti senas kategorijas prieš importuojant)'}
            </label>
          )}
        </div>

        {result && (
          <div className="p-4 border-t border-[var(--border-subtle)] flex justify-end gap-2">
            <button onClick={onClose} className="px-3 py-1.5 border border-[var(--input-border)] text-[var(--text-secondary)] text-sm rounded-lg hover:bg-[var(--bg-hover)]">Atšaukti</button>
            <button
              onClick={handleImport}
              disabled={importing || selectedCount === 0}
              className="px-3 py-1.5 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50"
            >
              {importing ? 'Importuojama…' : `Importuoti ${selectedCount}`}
            </button>
          </div>
        )}
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(modal, document.body)
}
