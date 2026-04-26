/**
 * Pure Wikipedia wikitext parsing functions (no browser deps, no React, no side effects).
 * Extracted from WikipediaImportDiscography.tsx and WikipediaImport.tsx
 * for use by both UI and Python bulk worker.
 */

// Will be provided by importing modules; kept as placeholder for type safety
let COUNTRIES: string[] = []
let SUBSTYLES: Record<string, string[]> = {}

// Optional: export these for initialization from constants
export function initializeConstants(countries: string[], substyles: Record<string, string[]>) {
  COUNTRIES = countries
  SUBSTYLES = substyles
}

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type AlbumType = 'studio' | 'ep' | 'single' | 'compilation' | 'live' | 'remix' | 'covers' | 'holiday' | 'soundtrack' | 'demo' | 'other'

export type CertificationEntry = {
  region: string   // "US", "UK", "AUS", etc.
  type: string     // "Gold", "Platinum", "Diamond"
  multiplier: number // 1 for Gold, 2 for 2× Platinum, etc.
}

export type DiscographyItem = {
  title: string
  year: number | null
  month: number | null
  day: number | null
  type: AlbumType
  extraTypes?: AlbumType[]
  wikiTitle?: string
  source: 'wikipedia'
  cover_image_url?: string
  tracks?: TrackEntry[]
  certifications?: CertificationEntry[]
  peak_chart_position?: number | null
  fetched?: boolean
  importing?: boolean
  imported?: boolean
  duplicate?: boolean
  duplicateId?: number
  error?: string
}

export type TrackEntry = {
  title: string
  duration?: string
  sort_order: number
  is_single?: boolean
  featuring?: string[]
  disc_number?: number
  type?: 'normal' | 'instrumental' | 'live' | 'remix' | 'mashup' | 'covers'
}

export type SingleInfoboxData = { month: number | null; day: number | null; year: number | null }

export type BandMember = {
  name: string
  wikiTitle: string
  isCurrent: boolean
  yearFrom?: string
  yearTo?: string
  existingId?: number
  existingSlug?: string
  avatar?: string
  country?: string
  birthYear?: string; birthMonth?: string; birthDay?: string
  deathYear?: string; deathMonth?: string; deathDay?: string
  gender?: 'male'|'female'|''
  description?: string
  genre?: string
  substyles?: string[]
  website?: string
  facebook?: string; instagram?: string; twitter?: string
  spotify?: string; youtube?: string; soundcloud?: string
  tiktok?: string; bandcamp?: string
}

export type Break = { from: string; to: string }

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const ALL_SUBSTYLES = Object.values(SUBSTYLES).flat()

export const QID_COUNTRY: Record<string, string> = {
  Q142:'Prancūzija',Q183:'Vokietija',Q30:'JAV',Q145:'Didžioji Britanija',
  Q34:'Švedija',Q20:'Norvegija',Q33:'Suomija',Q35:'Danija',
  Q16:'Kanada',Q408:'Australija',Q159:'Rusija',Q38:'Italija',
  Q29:'Ispanija',Q55:'Olandija',Q31:'Belgija',Q39:'Šveicarija',
  Q40:'Austrija',Q36:'Lenkija',Q27:'Airija',Q17:'Japonija',
  Q884:'Pietų Korėja',Q155:'Brazilija',Q414:'Argentina',Q96:'Meksika',
  Q37:'Lietuva',Q211:'Latvija',Q191:'Estija',Q212:'Ukraina',
  Q213:'Čekija',Q218:'Rumunija',Q41:'Graikija',Q45:'Portugalija',
  Q48:'Turkija',Q801:'Izraelis',Q668:'Indija',Q148:'Kinija',
  Q664:'Naujoji Zelandija',Q189:'Islandija',Q219:'Bulgarija',
}

export const TXT_COUNTRY: [string, string][] = [
  ['united states','JAV'],['american','JAV'],['u.s.','JAV'],
  ['united kingdom','Didžioji Britanija'],['british','Didžioji Britanija'],
  ['england','Didžioji Britanija'],['english','Didžioji Britanija'],
  ['france','Prancūzija'],['french','Prancūzija'],
  ['germany','Vokietija'],['german','Vokietija'],
  ['sweden','Švedija'],['swedish','Švedija'],
  ['norway','Norvegija'],['norwegian','Norvegija'],
  ['finland','Suomija'],['finnish','Suomija'],
  ['denmark','Danija'],['danish','Danija'],
  ['canada','Kanada'],['canadian','Kanada'],
  ['australia','Australija'],['australian','Australija'],
  ['russia','Rusija'],['russian','Rusija'],
  ['italy','Italija'],['italian','Italija'],
  ['spain','Ispanija'],['spanish','Ispanija'],
  ['netherlands','Olandija'],['dutch','Olandija'],
  ['belgium','Belgija'],['belgian','Belgija'],
  ['switzerland','Šveicarija'],['swiss','Šveicarija'],
  ['austria','Austrija'],['austrian','Austrija'],
  ['poland','Lenkija'],['polish','Lenkija'],
  ['ireland','Airija'],['irish','Airija'],
  ['japan','Japonija'],['japanese','Japonija'],
  ['south korea','Pietų Korėja'],['korean','Pietų Korėja'],
  ['brazil','Brazilija'],['mexico','Meksika'],['mexican','Meksika'],
  ['iceland','Islandija'],['icelandic','Islandija'],
  ['lithuanian','Lietuva'],['latvian','Latvija'],['estonian','Estija'],
]

const GENRE_RULES: [string, string[]][] = [
  ['Sunkioji muzika',           ['metal','heavy metal','thrash','doom','black metal','grindcore','metalcore','death metal']],
  ['Roko muzika',               ['rock','punk','grunge','new wave','britpop','alternative rock','indie rock','post-punk','hard rock','post-rock','progressive rock']],
  ['Elektroninė, šokių muzika', ['electronic','house','techno','trance','edm','electro','disco','dance','drum and bass','dubstep','electronica','deep house','tech house','synth-pop']],
  ["Hip-hop'o muzika",          ['hip hop','hip-hop','rap','trap']],
  ['Pop, R&B muzika',           ['pop','soul','funk','r&b','rnb','rhythm and blues']],
  ['Rimtoji muzika',            ['jazz','blues','classical','gospel','swing','big band']],
  ['Alternatyvioji muzika',     ['alternative','indie','folk','experimental','ambient','emo','shoegaze']],
  ['Kitų stilių muzika',        ['reggae','country','latin','world music','ethnic']],
]

export const SOCIAL_MAP: Record<string, { key: string; url: (v: string) => string }> = {
  P2013: { key:'facebook',   url: v=>`https://www.facebook.com/${v}` },
  P2002: { key:'twitter',    url: v=>`https://x.com/${v}` },
  P1902: { key:'spotify',    url: v=>`https://open.spotify.com/artist/${v}` },
  P2397: { key:'youtube',    url: v=>`https://www.youtube.com/channel/${v}` },
  P3040: { key:'soundcloud', url: v=>`https://soundcloud.com/${v}` },
  P7085: { key:'tiktok',     url: v=>`https://www.tiktok.com/@${v}` },
  P7589: { key:'bandcamp',   url: v=>`https://bandcamp.com/${v}` },
}

export const GROUP_QIDS = new Set(['Q215380','Q5741069','Q2088357','Q9212979','Q56816265','Q190445','Q16010345','Q183319'])
export const SKIP_WEB = ['store','shop','merch','bandsintown','songkick','last.fm','allmusic','discogs','facebook','instagram','twitter','x.com','youtube','spotify','soundcloud','tiktok','bandcamp']

// ─── DISCOGRAPHY PARSERS ──────────────────────────────────────────────────────

/**
 * Clean Wikipedia wikitext markup and HTML.
 */
export function cleanWikiText(raw: string): string {
  let s = raw
  s = s.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
  s = s.replace(/<ref[^/]*\/>/gi, '')
  s = s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (_: string, _l: string, d: string) => d.replace(/^["'\u201c\u2018]+|["'\u201d\u2019]+$/g, '').trim())
  s = s.replace(/\[\[([^\]]+)\]\]/g, (_: string, l: string) => l.replace(/#[^\]]*$/, '').replace(/_/g, ' ').replace(/^["'\u201c\u2018]+|["'\u201d\u2019]+$/g, '').trim())
  s = s.replace(/\[\[|\]\]/g, '').replace(/\{\{[^}]*\}\}/g, '').replace(/''+/g, '')
  s = s.replace(/\[\w*\s*\d*\]/g, '')
  s = s.replace(/\s*\([^)]*\bsong\b[^)]*\)/gi, '').replace(/\s*\([^)]*\balbum\b[^)]*\)/gi, '')
  s = s.replace(/\s*\(\s*(?:singer|rapper|musician|entertainer|DJ|band|group|American|British|record producer|songwriter|actor|actress|performer|vocalist|artist|composer|producer)\s*\)/gi, '')
  s = s.replace(/^["'\u201c\u2018]+|["'\u201d\u2019]+$/g, '')
  s = s.replace(/\s+/g, ' ')
  return s.trim()
}

/**
 * Extract featuring artist names from "(feat. ...)" or "{{feat ...}}" patterns.
 */
export function extractFeaturing(raw: string): string[] {
  const names: string[] = []
  const m1 = raw.match(/\((?:feat(?:uring)?\.?|ft\.?)\s+([^)]+)\)/i)
  if (m1) {
    for (const p of m1[1].split(/\s+and\s+|[,&]/i)) {
      const lm = p.match(/\[\[(?:[^\]|]+\|)?([^\]|]+)\]\]/)
      const n = (lm ? lm[1] : p).replace(/['\[\]]/g, '').trim()
      if (n.length > 1) names.push(n)
    }
    return names
  }
  const m2 = raw.match(/\{\{(?:feat(?:uring)?\.?|ft\.?)[\s|]([^}]+)\}\}/i)
  if (m2) {
    for (const p of m2[1].split(/\s*\|\s*|\s+and\s+|[,&]/i)) {
      const lm = p.match(/\[\[(?:[^\]|]+\|)?([^\]|]+)\]\]/)
      const n = (lm ? lm[1] : p).replace(/['\[\]]/g, '').trim()
      if (n.length > 1) names.push(n)
    }
  }
  return names
}

/**
 * Parse title and featured artists from raw text.
 */
export function parseFeaturing(raw: string): { cleanTitle: string; featuring: string[] } {
  const featuring = extractFeaturing(raw)
  const cleanTitle = cleanWikiText(
    raw.replace(/\s*\((?:feat(?:uring)?\.?|ft\.?)\s+[^)]+\)/gi, '')
       .replace(/\s*\{\{(?:feat(?:uring)?\.?|ft\.?)[\s|][^}]+\}\}/gi, '').trim()
  )
  return { cleanTitle, featuring }
}

/**
 * Parse certifications from Wikipedia table row lines.
 */
export function parseCertifications(rowLines: string[]): CertificationEntry[] {
  const certs: CertificationEntry[] = []
  const text = rowLines.join(' ')

  const regionMap: Record<string, string> = {
    riaa: 'US', bpi: 'UK', aria: 'AU', mc: 'CA', bvmi: 'DE', snep: 'FR',
    fimi: 'IT', nvpi: 'NL', rmnz: 'NZ', ifpi: 'INT', 'riaj': 'JP',
  }
  const certRe = /(?:(\w+)\s*:\s*)?(\d+)?[×x]?\s*(Diamond|Platinum|Gold|Silver)/gi
  let m: RegExpExecArray | null
  while ((m = certRe.exec(text)) !== null) {
    const regionKey = (m[1] || '').toLowerCase()
    const region = regionMap[regionKey] || m[1]?.toUpperCase() || 'US'
    const multiplier = m[2] ? parseInt(m[2]) : 1
    const type = m[3].charAt(0).toUpperCase() + m[3].slice(1).toLowerCase()
    certs.push({ region, type, multiplier })
  }

  const templateRe = /\{\{[Cc]ertification[^}]*?(?:region|regio)\s*=\s*([^|}]+)[^}]*?award\s*=\s*(\d*)\s*[×x]?\s*(Diamond|Platinum|Gold|Silver)/gi
  while ((m = templateRe.exec(text)) !== null) {
    const regionFull = m[1].trim()
    const regionShort: Record<string, string> = {
      'united states': 'US', 'united kingdom': 'UK', 'australia': 'AU',
      'canada': 'CA', 'germany': 'DE', 'france': 'FR', 'japan': 'JP',
    }
    const region = regionShort[regionFull.toLowerCase()] || regionFull.substring(0, 2).toUpperCase()
    const multiplier = m[2] ? parseInt(m[2]) : 1
    const type = m[3].charAt(0).toUpperCase() + m[3].slice(1).toLowerCase()
    certs.push({ region, type, multiplier })
  }

  return certs
}

/**
 * Extract best (lowest) peak chart position from Wikipedia table row.
 */
export function parsePeakChartPosition(rowLines: string[]): number | null {
  let best: number | null = null
  for (const line of rowLines) {
    if (/scope\s*=\s*['"]row['"]/i.test(line)) continue
    if (/released|label|format|length|recorded|studio|producer|writer|certif/i.test(line)) continue

    const cells = line.split(/\|\|/)
    for (const cell of cells) {
      const cleaned = cell.replace(/^\s*\|\s*/, '').replace(/<ref[^>]*>.*?<\/ref>/gi, '').replace(/<ref[^>]*\/>/gi, '').trim()
      const numMatch = cleaned.match(/^(\d{1,3})$/)
      if (numMatch) {
        const n = parseInt(numMatch[1])
        if (n >= 1 && n <= 200 && (best === null || n < best)) {
          best = n
        }
      }
    }
  }
  return best
}

/**
 * Parse main page discography section (artist biography page).
 */
export function parseMainPageDiscography(wikitext: string, soloOnly = false, groupFilter?: string): DiscographyItem[] {
  const albums: DiscographyItem[] = []
  const lines = wikitext.split('\n')
  let inDiscSection = false
  let currentType: AlbumType = 'studio'
  let skipGroup = false

  for (const line of lines) {
    const hM = line.match(/^(==+)\s*(.+?)\s*\1/)
    if (hM) {
      const depth = hM[1].length, h = hM[2].toLowerCase(), hRaw = hM[2]
      if (depth === 2 && inDiscSection && !h.includes('discograph')) break
      if (h.includes('discograph')) { inDiscSection = true; skipGroup = false; continue }
      if (inDiscSection) {
        if (depth === 3) {
          if (groupFilter && groupFilter !== '__solo__' && groupFilter !== '__all__')
            skipGroup = !hRaw.trim().toLowerCase().includes(groupFilter.toLowerCase())
          else
            skipGroup = soloOnly && !/solo|as lead|as artist/i.test(hRaw) && hRaw.trim().length > 0
        }
        if (depth === 3 || depth === 4) {
          const typeH = h.replace(/\[\[.*?\]\]/g, '')
          if (typeH.includes('studio') || typeH.includes('album')) currentType = 'studio'
          else if (typeH.includes(' ep') || typeH === 'eps') currentType = 'ep'
          else if (typeH.includes('single')) { currentType = 'single'; skipGroup = true }
          else if (typeH.includes('compilation') || typeH.includes('greatest') || typeH.includes('best of')) currentType = 'compilation'
          else if (typeH.includes('live') || typeH.includes('concert')) currentType = 'live'
          else if (typeH.includes('box') || typeH.includes('video') || typeH.includes('dvd')) { skipGroup = true }
          else if (/solo|as lead|as artist|as performer/i.test(typeH)) currentType = 'studio'
        }
      }
      continue
    }
    if (!inDiscSection || skipGroup || !line.startsWith('*')) continue
    if (line.toLowerCase().includes('main article') || line.toLowerCase().includes('see also')) continue

    let title = '', wikiTitle = ''
    const wm = line.match(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/)
    if (wm) { wikiTitle = wm[1].trim(); title = cleanWikiText(wm[2] || wm[1]) }
    else { const im = line.match(/'{2,3}([^']+)'{2,3}/); if (im) { title = cleanWikiText(im[1]); wikiTitle = title.replace(/ /g, '_') } }
    if (!title || title.length < 2 || /^(Category|File|Wikipedia|Template|Help|Portal|Draft|Module|Talk):/.test(wikiTitle) || /^[A-Z]{2,3}$/.test(title)) continue
    const bad = ['discography', 'songs', 'videography', 'filmography', 'certification', 'chart']
    if (bad.some(b => title.toLowerCase().includes(b) || wikiTitle.toLowerCase().includes(b))) continue
    const yearM = line.match(/\((\d{4})\)/)
    albums.push({ title, year: yearM ? parseInt(yearM[1]) : null, month: null, day: null, type: currentType, wikiTitle, source: 'wikipedia' })
  }
  return albums
}

/**
 * Parse dedicated discography page (full album listings with table format).
 */
export function parseDiscographyPage(wikitext: string): DiscographyItem[] {
  const albums: DiscographyItem[] = []
  const lines = wikitext.split('\n')
  let currentType: AlbumType = 'studio'
  let inTable = false, skipSection = false, inSinglesSection = false, yearMode = false
  let currentYear: number | null = null
  let yearRowspan = 0

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    const hm = line.match(/^(==+)\s*(.+?)\s*\1/)
    if (hm) {
      const depth = hm[1].length, h = hm[2].toLowerCase()
      if (depth === 2 && /^album/.test(h)) inSinglesSection = false
      skipSection = /video|dvd|film|promo|tour|guest|appear|certif|box.?set|music.video/.test(h)
      if (h.includes('studio')) { currentType = 'studio'; skipSection = false; inSinglesSection = false }
      else if (h.includes('collaborative') || h.includes('collaboration')) { currentType = 'studio'; skipSection = false; inSinglesSection = false }
      else if (h.includes('extended play') || h.includes(' ep') || h === 'eps') { currentType = 'ep'; skipSection = false }
      else if (h.includes('single')) { currentType = 'single'; skipSection = true; inSinglesSection = true }
      else if (h.includes('remix')) { currentType = 'remix'; skipSection = false }
      else if (h.includes('cover')) { currentType = 'covers'; skipSection = false }
      else if (h.includes('holiday') || h.includes('christmas') || h.includes('xmas')) { currentType = 'holiday'; skipSection = false }
      else if (h.includes('soundtrack') || h.includes('score')) { currentType = 'soundtrack'; skipSection = false }
      else if (h.includes('demo')) { currentType = 'demo'; skipSection = false }
      else if (h.includes('compilation') || h.includes('greatest') || h.includes('best of') || h.includes('collection')) { currentType = 'compilation'; skipSection = false }
      else if (h.includes('live') || h.includes('concert')) { currentType = 'live'; skipSection = false }
      else if (h.includes('box')) { currentType = 'other'; skipSection = true }
      else if (depth === 2 && /chart|video|promo|appear/.test(h)) { inSinglesSection = true; skipSection = true }
      else if (/^\d{4}s?$/.test(h.trim())) { skipSection = inSinglesSection }
      else if (depth >= 3 && inSinglesSection) { skipSection = true }
      yearMode = false; currentYear = null; yearRowspan = 0; continue
    }
    if (skipSection || inSinglesSection) continue
    if (line.startsWith('{|')) { inTable = true; yearMode = false; currentYear = null; yearRowspan = 0; continue }
    if (line.startsWith('|}')) { inTable = false; yearMode = false; continue }
    if (!inTable) continue

    if (line.trim() === '|-') {
      if (yearRowspan > 1) yearRowspan--
      else if (yearRowspan === 1) yearRowspan = 0
      continue
    }

    if (/!.*rowspan.*Year|!rowspan.*Year/i.test(line)) { yearMode = true; continue }

    const yearM = line.match(/^\|\s*(?:rowspan\s*=\s*["']?(\d+)["']?\s*\|)?\s*((?:19|20)\d{2})\s*$/)
    if (yearM) {
      currentYear = parseInt(yearM[2])
      yearRowspan = yearM[1] ? parseInt(yearM[1]) : 1
      continue
    }

    if (/!\s*[—–-]?\s*scope\s*=\s*['"]row['"]/i.test(line)) {
      const wm = line.match(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/)
      if (!wm) continue
      const wikiTitle = wm[1].trim(), title = cleanWikiText(wm[2] || wm[1])
      if (!title || title.length < 2 || /^(Category|File|Wikipedia|Template|Help|Portal|Draft|Module|Talk):/.test(wikiTitle)) continue
      if (['discography','videography','certification','singles','chart'].some(b => title.toLowerCase().includes(b))) continue

      const rowLines: string[] = [line]
      let year: number | null = currentYear
      let month: number | null = null
      let day: number | null = null
      const yrInLine = line.match(/\b((?:19|20)\d{2})\b/)
      if (yrInLine) {
        year = parseInt(yrInLine[1])
      }

      for (let k = li + 1; k < Math.min(li + 30, lines.length); k++) {
        const nl = lines[k]
        if (nl.trim() === '|-' || nl.startsWith('|}')) break
        if (/^!\s*[—–-]?\s*scope\s*=\s*['"]row['"]/i.test(nl)) break
        rowLines.push(nl)

        if (!year || year === currentYear) {
          const yrNext = nl.match(/^\|\s*(?:rowspan\s*=\s*["']?\d+["']?\s*\|)?\s*((?:19|20)\d{2})\s*$/)
          if (yrNext) { year = parseInt(yrNext[1]); continue }
          const relDate = nl.match(/[Rr]eleased[^|{]*?(?:(\d{1,2})\s+)?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i)
          if (relDate) {
            day = relDate[1] ? parseInt(relDate[1]) : null
            const MONTHS: Record<string, number> = { january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12 }
            month = MONTHS[relDate[2].toLowerCase()] || null
            year = parseInt(relDate[3])
            continue
          }
          const relUS = nl.match(/[Rr]eleased[^|{]*?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s*(\d{4})/i)
          if (relUS) {
            const MONTHS: Record<string, number> = { january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12 }
            month = MONTHS[relUS[1].toLowerCase()] || null
            day = parseInt(relUS[2])
            year = parseInt(relUS[3])
            continue
          }
          const relYearOnly = nl.match(/[Rr]eleased[^|{]*?(\d{4})/)
          if (relYearOnly && !year) { year = parseInt(relYearOnly[1]) }
        }
      }

      const certifications = parseCertifications(rowLines)
      const peak_chart_position = parsePeakChartPosition(rowLines)

      albums.push({ title, year, month, day, type: currentType, wikiTitle, source: 'wikipedia', certifications, peak_chart_position })
      continue
    }

    if (yearMode && /^\|/.test(line) && !/^\|\|/.test(line)) {
      const wm = line.match(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/)
      if (wm) {
        const wikiTitle = wm[1].trim(), title = cleanWikiText(wm[2] || wm[1])
        if (title && title.length > 2 && !/^(Category|File|Wikipedia|Template|Help|Portal|Draft|Module|Talk):/.test(wikiTitle) && !/^\d{4}/.test(title)) {
          const yr = line.match(/\b(19|20)\d{2}\b/)
          albums.push({ title, year: yr ? parseInt(yr[0]) : currentYear, month: null, day: null, type: currentType, wikiTitle, source: 'wikipedia' })
        }
      } else {
        const pm = line.match(/''([^']+)''/)
        if (pm) {
          const title = cleanWikiText(pm[1])
          if (title && title.length > 2 && !/^\d/.test(title))
            albums.push({ title, year: currentYear, month: null, day: null, type: currentType, wikiTitle: title.replace(/ /g, '_'), source: 'wikipedia' })
        }
      }
    }
  }
  return albums
}

/**
 * Extract track listings from {{TrackListing|...}} templates.
 */
export function extractTrackListingsWithPos(wikitext: string): { block: string; pos: number }[] {
  const results: { block: string; pos: number }[] = []
  const pattern = /\{\{\s*[Tt]rack\s*[Ll]isting/g
  let m: RegExpExecArray | null
  while ((m = pattern.exec(wikitext)) !== null) {
    let depth = 0, i = m.index
    while (i < wikitext.length - 1) {
      if (wikitext[i] === '{' && wikitext[i+1] === '{') { depth++; i += 2 }
      else if (wikitext[i] === '}' && wikitext[i+1] === '}') { depth--; i += 2; if (depth === 0) { results.push({ block: wikitext.slice(m.index + 2, i - 2), pos: m.index }); break } }
      else i++
    }
  }
  return results
}

/**
 * Get section heading context before a given position.
 */
export function getSectionBeforePos(wikitext: string, pos: number): string {
  const textBefore = wikitext.slice(0, pos)
  const headings = [...textBefore.matchAll(/^(==+)\s*(.+?)\s*\1\s*$/gm)]
  if (!headings.length) return ''
  let lastDepth2Idx = -1
  for (let i = headings.length - 1; i >= 0; i--) {
    if (headings[i][1].length === 2) { lastDepth2Idx = i; break }
  }
  const relevant = lastDepth2Idx >= 0 ? headings.slice(lastDepth2Idx) : headings
  return relevant.map(h => h[2].toLowerCase()).join(' | ')
}

/**
 * Check if a headline indicates a reissue/bonus version of an album.
 */
export function isReissueBlock(h: string, tl: string): boolean {
  const hl = h.toLowerCase()
  if (hl.includes('bonus') || hl.includes('deluxe') || hl.includes('japan') ||
    hl.includes('special') || hl.includes('itunes') || hl.includes('exclusive') ||
    hl.includes('limited') || hl.includes('remaster') || hl.includes('reissue') ||
    hl.includes('re-issue') || hl.includes('anniversary') || hl.includes('expanded') ||
    hl.includes('collector') || hl.includes('extra track') || hl.includes('disc 2') ||
    hl.includes('video') || /^\d{4}/.test(hl)) return true

  if (!hl) {
    const nums = [...tl.matchAll(/\|\s*title(\d+)\s*=/g)].map(m => parseInt(m[1])).sort((a,b) => a-b)
    if (nums.length > 0 && nums[0] >= 11) return true
    const hasTitle1 = /\|\s*title1\s*=/.test(tl)
    const firstNum = nums.length > 0 ? nums[0] : 0
    if (/\|\s*total_length\s*=/.test(tl) && !hasTitle1 && firstNum >= 11) return true
  }
  return false
}

/**
 * Check if a track listing block is for a disc/side of a multi-disc album.
 */
export function isDiscBlock(tl: string): boolean {
  return /\|\s*headline\s*=.*[Dd]isc\s*[12]/i.test(tl) || /\|\s*disc\s*=\s*[12]/i.test(tl)
}

/**
 * Parse singles mentioned in artist infobox.
 */
export function parseSinglesFromInfobox(wikitext: string): { names: Set<string>; dates: Map<string, SingleInfoboxData> } {
  const names = new Set<string>()
  const dates = new Map<string, SingleInfoboxData>()
  const disambigRe = /\s*\((song|album|single|band|film|Queen song|[A-Z][a-z]+ song|[A-Z][a-z]+ album)\)$/i
  const MONTHS: Record<string, number> = { january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12 }

  function extractName(text: string): string {
    const lm = /\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/.exec(text)
    if (!lm) return ''
    const name = lm[2] ? lm[2].replace(/['"""'']+/g, '').trim() : lm[1].replace(/#[^\]]*$/, '').replace(disambigRe, '').replace(/['"""'']+/g, '').trim()
    return name.length > 1 ? name : ''
  }

  function extractAllNames(text: string) {
    const re = /\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g
    let lm: RegExpExecArray | null
    while ((lm = re.exec(text)) !== null) {
      const name = lm[2] ? lm[2].replace(/['"\u201c\u201d\u2018\u2019]+/g, '').trim() : lm[1].replace(/#[^\]]*$/, '').replace(disambigRe, '').replace(/['"\u201c\u201d\u2018\u2019]+/g, '').trim()
      if (name.length > 1) names.add(name.toLowerCase())
    }
  }

  function parseDate(dateStr: string): SingleInfoboxData {
    const clean = dateStr.replace(/\([^)]*\)/g, '').replace(/\{\{[^}]*\}\}/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '').replace(/<ref[^/]*\/>/gi, '').trim()
    const full = clean.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i)
    if (full) return { day: parseInt(full[1]), month: MONTHS[full[2].toLowerCase()] || null, year: parseInt(full[3]) }
    const monthYear = clean.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i)
    if (monthYear) return { day: null, month: MONTHS[monthYear[1].toLowerCase()] || null, year: parseInt(monthYear[2]) }
    const yearOnly = clean.match(/(\d{4})/)
    if (yearOnly) return { day: null, month: null, year: parseInt(yearOnly[1]) }
    return { day: null, month: null, year: null }
  }

  const m = wikitext.match(/\|\s*singles?\s*=([\s\S]*?)(?=\n\s*\||\n\}\})/)
  if (m) extractAllNames(m[1])

  const singlesStart = wikitext.search(/\{\{[Ss]ingles/)
  if (singlesStart !== -1) {
    const chunk = wikitext.slice(singlesStart, singlesStart + 3000)
    const sRe = /\|\s*single(\d+)\s*=\s*((?:\[\[[^\]]*\]\]|[^|\n])+)/g
    let sm: RegExpExecArray | null
    const singlesByNum: Record<string, string> = {}
    while ((sm = sRe.exec(chunk)) !== null) {
      let name = extractName(sm[2])
      if (!name) {
        const plain = sm[2].replace(/\{\{[^}]*\}\}/g, '').replace(/<[^>]+>/g, '').replace(/['""\u201c\u201d\u2018\u2019]+/g, '').trim()
        if (plain.length > 1 && !plain.includes('|') && !plain.includes('=')) name = plain
      }
      if (name) { names.add(name.toLowerCase()); singlesByNum[sm[1]] = name.toLowerCase() }
      const rawVal = sm[2].replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1').replace(/\[\[([^\]]+)\]\]/g, '$1')
        .replace(disambigRe, '')
      if (rawVal.includes('/')) {
        for (const part of rawVal.split('/')) {
          const clean = part.replace(/['""\u201c\u201d\u2018\u2019]+/g, '').trim().toLowerCase()
          if (clean.length > 1) names.add(clean)
        }
      }
    }
    const dRe = /\|\s*single(\d+)date\s*=\s*([^\n|]+)/g
    let dm: RegExpExecArray | null
    while ((dm = dRe.exec(chunk)) !== null) {
      const singleName = singlesByNum[dm[1]]
      if (singleName) dates.set(singleName, parseDate(dm[2]))
    }
  }

  return { names, dates }
}

/**
 * Parse tracklist from Wikipedia album article or TrackListing templates.
 */
export function parseTracklist(wikitext: string): TrackEntry[] {
  const { names: singles } = parseSinglesFromInfobox(wikitext)
  const tlWithPos = extractTrackListingsWithPos(wikitext)
  const tlBlocks = tlWithPos.map(t => t.block)

  if (!tlBlocks.length) {
    // No {{Track listing}} template — many live/compilation articles fall here.
    // The old fallback parsed every `#numbered` line as a track; that picked up
    // citations and bullet lists, producing 800+ false positives on pages like
    // "Recording the Angel". Return [] instead — UI/admin can fill manually.
    return []
  }

  const parseBlock = (tl: string, startOrder: number): TrackEntry[] => {
    const tracks: TrackEntry[] = []
    const nums = [...tl.matchAll(/\|\s*title(\d+)\s*=/g)].map(m => parseInt(m[1])).sort((a,b) => a-b)
    let order = startOrder
    for (const num of nums) {
      const titleM = tl.match(new RegExp(`\\|\\s*title${num}\\s*=\\s*((?:\\[\\[[^\\]]*\\]\\]|[^|\\n])+)`))
      if (!titleM) continue
      const lenM = tl.match(new RegExp(`\\|\\s*length${num}\\s*=\\s*([^|\\n]+)`))
      const noteM = tl.match(new RegExp(`\\|\\s*note${num}\\s*=\\s*([^|\\n]+)`))

      const noteStr_raw = (noteM?.[1] || '').toLowerCase()
      if (/^\s*hidden\s*track/.test(noteStr_raw)) continue
      const titleRaw = (titleM?.[1] || '').toLowerCase()
      if (/^\s*hidden\s*track/.test(titleRaw)) continue

      const durStr = lenM?.[1]?.trim() || ''
      const durMatch = durStr.match(/^(\d+):(\d+)$/)
      if (durMatch) {
        const totalSec = parseInt(durMatch[1]) * 60 + parseInt(durMatch[2])
        if (totalSec < 10) continue
        if (totalSec > 900) continue
      }
      let featuring: string[] = []
      if (noteM) {
        const fm = noteM[1].match(/feat(?:uring)?[.\s]+(.+)/i)
        if (fm) for (const p of fm[1].split(/\s+and\s+|[,&]/i)) {
          const lm = p.match(/\[\[(?:[^\]|]+\|)?([^\]|]+)\]\]/)
          const n = (lm ? lm[1] : p).replace(/['[\]]/g, '').trim()
          if (n.length > 1) featuring.push(n)
        }
      }
      const { cleanTitle, featuring: tf } = parseFeaturing(titleM[1].trim())
      if (!featuring.length) featuring = tf
      const finalTitle = cleanWikiText(cleanTitle)
      if (finalTitle) {
        const normalizedTitle = finalTitle.toLowerCase().replace(/['\u2019]/g, '')
        const is_single = singles.size > 0 ? (
          singles.has(normalizedTitle) ||
          [...singles].some(s => {
            if (normalizedTitle === s) return true
            if (normalizedTitle.startsWith(s)) {
              const after = normalizedTitle.slice(s.length)
              if (after.startsWith('s ') && !after.includes('reprise')) return true
              if (after.startsWith(' (') && !/remix|version|mix|edit|live|acoustic|instrumental|demo|dub\b/i.test(after)) return true
            }
            if (s.includes('/')) {
              const parts = s.split('/').map(p => p.replace(/["""]/g, '').trim()).filter(Boolean)
              if (parts.some(p => p === normalizedTitle || normalizedTitle.startsWith(p + ' ') || p.startsWith(normalizedTitle))) return true
            }
            if (s.startsWith(normalizedTitle + ' ')) {
              const sAfter = s.slice(normalizedTitle.length)
              if (!/(remix|version|mix|edit|live|acoustic|instrumental|demo|dub)\b/i.test(sAfter)) return true
            }
            return false
          })
        ) : undefined
        const noteStr = (noteM?.[1] || '').toLowerCase()
        const titleLower = finalTitle.toLowerCase()
        let trackType: TrackEntry['type'] = 'normal'
        if (/\binstrumental\b/.test(noteStr) || /\binstrumental\b/.test(titleLower)) trackType = 'instrumental'
        else if (/\blive\b/.test(noteStr) || /\b(live at|live from|concert|recorded live)\b/.test(noteStr)) trackType = 'live'
        else if (/\bremix\b/.test(noteStr) || /\bremix\b/.test(titleLower)) trackType = 'remix'
        else if (/\bcover\b/.test(noteStr) || /\bcovers?\b/.test(noteStr)) trackType = 'covers'
        else if (/\bmashup\b/.test(noteStr) || /\bmashup\b/.test(titleLower)) trackType = 'mashup'
        tracks.push({ title: finalTitle, duration: lenM?.[1]?.trim(), sort_order: order++, is_single, featuring: featuring.length ? featuring : undefined, type: trackType })
      }
    }
    return tracks
  }

  const allTracks: TrackEntry[] = []
  const isMultiDisc = tlBlocks.every(b => isDiscBlock(b)) && tlBlocks.length > 1
  if (isMultiDisc) {
    let order = 1
    for (const tl of tlBlocks) { const nt = parseBlock(tl, order); allTracks.push(...nt); order += nt.length }
  } else {
    const getHeadline = (tl: string) => { const m = tl.match(/\|\s*(?:headline|caption)\s*=\s*([^\n|]+)/); return m ? m[1].replace(/[''+\[\]]/g, '').trim() : '' }

    const standard = tlWithPos.filter(({ block, pos }) => {
      const hl = getHeadline(block)
      if (isReissueBlock(hl, block)) return false
      const sectionBefore = getSectionBeforePos(wikitext, pos)
      if (/reissue|remaster|anniversary|box.?set|collector|deluxe|expanded|bonus|demo|outtake/i.test(sectionBefore)) return false
      return true
    }).map(({ block }) => block)

    const toUse = standard.length ? standard : [tlBlocks[0]]

    // Normalize for dedupe — strip ALL apostrophe variants (straight + curly)
    // so "Just Can't Get Enough" and "Just Can’t Get Enough" collapse.
    // Without this, the same track from a reissue block sneaks past the
    // existing-set check (Speak & Spell repro: track #11 vs #13).
    const dedupeKey = (s: string) => s.toLowerCase().replace(/[‘’“”'"]/g, '').trim()

    const existing = new Set<string>()
    let order = 1
    for (const tl of toUse) {
      for (const t of parseBlock(tl, order)) {
        const k = dedupeKey(t.title)
        if (!existing.has(k)) {
          allTracks.push({ ...t, sort_order: order++ })
          existing.add(k)
        }
      }
    }

    if (singles.size > 0) {
      const filteredBlocks = tlWithPos
        .filter(({ block, pos }) => {
          const hl = getHeadline(block)
          if (!isReissueBlock(hl, block)) return false
          const sectionBefore = getSectionBeforePos(wikitext, pos)
          return !/reissue|remaster|anniversary|box.?set|collector|deluxe|expanded|demo|outtake/i.test(sectionBefore)
        })
        .map(({ block }) => block)
      for (const tl of filteredBlocks) {
        for (const t of parseBlock(tl, 1)) {
          const k = dedupeKey(t.title)
          if (t.type === 'remix') continue
          if (!existing.has(k) && t.is_single) {
            allTracks.push({ ...t, type: 'normal', sort_order: order++ })
            existing.add(k)
          }
        }
      }
    }
  }
  return allTracks
}

// ─── ARTIST PARSERS ──────────────────────────────────────────────────────────

/**
 * Clean artist name: remove parenthetical suffixes, markup artifacts.
 */
export function cleanArtistName(raw: string): string {
  let name = raw
    .replace(/\s*\(\s*(?:band|group|music(?:al)?\s*(?:group|act)?|singer|rapper|duo|trio|quartet|artist|musician|rock\s*band|pop\s*group)\s*\)/gi, '')
    .replace(/\s*\(\s*the\s+band\s*\)/gi, '')
    .replace(/_/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/'{2,}/g, '')
    .replace(/\[\[|\]\]/g, '')
    .trim()
  return name
}

/**
 * Validate that a parsed name is not wikitext fragment.
 */
export function isValidArtistName(name: string): boolean {
  if (!name || name.length < 2 || name.length > 80) return false
  if (/-->|<!--|<\/|<[a-z]|^\s*\||\{\{|\}\}|\[\[|\]\]/.test(name)) return false
  if (name.split(/\s+/).length > 8) return false
  if (/[.;]/.test(name) && name.length > 30) return false
  if (/^(as |the following|see also|including|part of|featured|with |and |list$)/i.test(name)) return false
  if (/^(list|lists|see|more|others|various|none|unknown|many|several|show|hide|edit|note|notes)$/i.test(name)) return false
  if ((name.match(/[^a-zA-ZÀ-ÿ0-9\s\-'.&,!()]/g) || []).length > 2) return false
  return true
}

/**
 * Extract field value from nested wikitext template (like infobox).
 */
export function extractFieldNested(wikitext: string, field: string): string {
  const startRe = new RegExp(`\\|\\s*(?<![a-z_])${field}(?![a-z_])\\s*=\\s*`, 'i')
  const startM = wikitext.match(startRe)
  if (!startM || startM.index === undefined) return ''
  const startIdx = startM.index + startM[0].length
  let depth = 0, i = startIdx
  while (i < wikitext.length) {
    if (wikitext[i] === '{' && wikitext[i+1] === '{') { depth++; i += 2; continue }
    if (wikitext[i] === '}' && wikitext[i+1] === '}') {
      depth--; if (depth <= 0) { i += 2; break }
      i += 2; continue
    }
    if (depth === 0 && wikitext[i] === '\n' && /^\s*\|/.test(wikitext.slice(i+1))) break
    i++
  }
  return wikitext.slice(startIdx, i)
}

/**
 * Parse band members from infobox fields (current_members, members, past_members, etc).
 */
export function parseBandMembers(wikitext: string): BandMember[] {
  const members: BandMember[] = []
  const seen = new Set<string>()
  const extractField = (field: string, isCurrent: boolean) => {
    const block = extractFieldNested(wikitext, field)
    if (!block) return
    const linkRe = /\[\[\s*([^\]|#]+?)(?:\s*\|\s*([^\]]+))?\s*\]\]/g
    let lm: RegExpExecArray | null
    while ((lm = linkRe.exec(block)) !== null) {
      const wikiTitle = lm[1].replace(/\s+/g, '_').trim()
      const display = (lm[2] || lm[1])
        .replace(/'{2,}/g, '').replace(/\[\[|\]\]/g, '').replace(/\{\{[^}]+\}\}/g, '').trim()
      if (!display || display.length < 2) continue
      if (/^(plain ?list|flatlist|hlist|br|small|nowrap|ubl|refn|ref|cite)/i.test(display)) continue
      if (wikiTitle.includes(':')) continue
      if (seen.has(wikiTitle)) continue
      const cleanedName = cleanArtistName(display)
      if (!isValidArtistName(cleanedName)) continue
      seen.add(wikiTitle)
      const afterLink = block.slice(lm.index + lm[0].length, lm.index + lm[0].length + 100)
      const yearMatch = afterLink.match(/[({](?:\{\{[^}]*\}\}\s*)?\(?(\d{4})\s*[–\-—]+\s*(\d{4}|present|dabar|now)?\)?/)
      const yearFrom = yearMatch ? yearMatch[1] : ''
      const yearTo = yearMatch && yearMatch[2] && !/present|dabar|now/i.test(yearMatch[2]) ? yearMatch[2] : ''
      members.push({ name: cleanedName, wikiTitle, isCurrent, yearFrom, yearTo })
    }
  }
  extractField('current_members', true)
  extractField('members', true)
  extractField('past_members', false)
  extractField('former_members', false)
  extractField('dabartiniai_nariai', true)
  extractField('nariai', true)
  extractField('buvę_nariai', false)
  extractField('buve_nariai', false)
  return members
}

/**
 * Map genre labels from Wikidata to local genre + substyles.
 */
export function mapGenres(genreLabels: string[]): { genre: string; substyles: string[] } {
  const lower = genreLabels.map(g => g.toLowerCase().trim())
  let best = '', bestScore = 0
  for (const rule of GENRE_RULES) {
    const g = rule[0]
    const kws = rule[1]
    const score = lower.reduce((a, gl) => a + kws.reduce((s, kw) => s + (gl === kw || gl.includes(kw) ? 1 : 0), 0), 0)
    if (score > bestScore) { bestScore = score; best = g }
  }
  const substyles: string[] = []
  for (const g of genreLabels) {
    const found = ALL_SUBSTYLES.find(s => s.toLowerCase() === g.toLowerCase().trim())
    if (found && !substyles.includes(found)) substyles.push(found)
  }
  return { genre: best, substyles }
}

/**
 * Parse genres from artist infobox.
 */
export function parseInfoboxGenres(wikitext: string): string[] | null {
  const genreMatch = wikitext.match(/\|\s*genre\s*=\s*([\s\S]*?)(?=\n\s*\||\n\s*\}\})/i)
  if (!genreMatch) return null
  const raw = genreMatch[1]
  const fromLinks = [...raw.matchAll(/\[\[(?:[^\]|]+\|)?([^\]|]+)\]\]/g)].map(m => m[1].trim())
  const stripped = raw
    .replace(/\{\{[^}]+\}\}/g, ' ').replace(/\[\[(?:[^\]|]+\|)?([^\]|]+)\]\]/g, '$1')
    .replace(/[*#\[\]{}|]/g, ' ').split(/[,·•\n]/).map(s => s.trim())
    .filter(s => s.length > 1 && s.length < 40 && !/^(hlist|flatlist|ubl|br|small|nowrap|\d+)$/i.test(s))
  const all = [...new Set([...fromLinks, ...stripped])].filter(s => s && s.length > 1)
  return all.length > 0 ? all : null
}

/**
 * Find country from text using TXT_COUNTRY mapping.
 */
export function findCountry(text: string): string {
  const lower = text.toLowerCase()
  for (const [k, v] of TXT_COUNTRY)
    if (k.includes(' ') && lower.includes(k) && COUNTRIES.includes(v)) return v
  for (const [k, v] of TXT_COUNTRY)
    if (!k.includes(' ') && lower.includes(k) && COUNTRIES.includes(v)) return v
  return ''
}

/**
 * Parse "years active" field to extract year range and breaks.
 */
export function parseYearsActive(raw: string): { yearStart: string; yearEnd: string; breaks: Break[] } {
  const clean = raw
    .replace(/\{\{[^}]+\}\}/g, '').replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2')
    .replace(/<[^>]+>/g, '').replace(/&ndash;|&mdash;/g, '–').replace(/\s+/g, ' ').trim()
  const parts = clean.split(/,\s*/)
  const ranges: { from: string; to: string; oneoff?: boolean }[] = []
  for (const part of parts) {
    const t = part.trim()
    const rng     = t.match(/(\d{4})\s*[–—\-]\s*(\d{4})/)
    const rngOpen = t.match(/(\d{4})\s*[–—\-]\s*(present|dabar)/i)
    const single  = t.match(/^(\d{4})$/)
    if (rng)          ranges.push({ from: rng[1], to: rng[2] })
    else if (rngOpen) ranges.push({ from: rngOpen[1], to: '' })
    else if (single)  ranges.push({ from: single[1], to: single[1], oneoff: true })
  }
  if (!ranges.length) {
    const y = clean.match(/(\d{4})/)
    return { yearStart: y?.[1] || '', yearEnd: '', breaks: [] }
  }
  const yearStart = ranges[0].from
  const realRanges = ranges.filter(r => !r.oneoff)
  const lastReal = realRanges[realRanges.length - 1]
  const yearEnd = lastReal ? lastReal.to : ranges[ranges.length - 1].to
  const breaks: Break[] = []
  for (let i = 0; i < realRanges.length - 1; i++) {
    const gf = realRanges[i].to, gt = realRanges[i + 1].from
    if (gf && gt && gf !== gt) breaks.push({ from: gf, to: gt })
  }
  return { yearStart, yearEnd, breaks }
}
