/**
 * Pure Wikipedia wikitext parsing functions (no browser deps, no React, no side effects).
 * Extracted from WikipediaImportDiscography.tsx and WikipediaImport.tsx
 * for use by both UI and Python bulk worker.
 */

import { wikiTitleCase } from './text-utils'

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
  /** Substyle IDs gauti po parseAlbumGenres + fuzzy match prieš public.substyles.
   *  Užpildoma fetchDetails'e ir perduodama POST /api/albums payload'e. */
  substyle_ids?: number[]
  /** Žanrų vardai iš Wikipedia, kurie NEMATCH'INO mūsų taksonomijos.
   *  Naudojama tik UI log'inimui — kad user'is matytų ką praleidom. */
  genres_unmatched?: string[]
  fetched?: boolean
  importing?: boolean
  imported?: boolean
  duplicate?: boolean
  duplicateId?: number
  error?: string
  /** Track-level duplicate cache — naudoja WikipediaImportDiscography
   *  per nested expand. {lower(track_title) → modern_track_id}.
   *  Pildoma per toggleExpand → checkTrackDuplicates(album.tracks, artistId). */
  trackDuplicateMap?: Record<string, number>
  /** Album'o + per-track pilnatvos snapshot. Pildoma:
   *   • PATCH /api/albums/[id]/enrich response — po Wiki overlay
   *   • GET   /api/albums/[id]/completeness   — read-only on expand
   *  fully_complete = album metadata (cover/year/substyle) + visos dainos
   *  individualiai complete (video_url + release_year + lyrics arba instrumental). */
  completeness?: {
    has_cover: boolean
    has_year: boolean
    has_full_date: boolean
    has_peak: boolean
    has_certifications: boolean
    substyles_count: number
    tracks_count: number
    all_tracks_complete: boolean
    fully_complete: boolean
    tracks: Array<{
      id: number
      title: string
      type: string
      complete: boolean
      missing: string[]  // 'video' | 'data' | 'lyrics'
      likes_count: number
      comments_count: number
    }>
    legacy_id?: number | null
    legacy_url?: string | null
    legacy_slug?: string | null
    likes_count: number
    comments_count: number
    /** Currently set type_* flags DB — naudojam diff'ui (esamas type → Wiki). */
    current_types: string[]
    /** Admin review status: null = needs review, 'cleared' = paslėpta. */
    wiki_review_status: string | null
  }
}

export type TrackEntry = {
  title: string
  duration?: string
  sort_order: number
  is_single?: boolean
  featuring?: string[]
  disc_number?: number
  type?: 'normal' | 'instrumental' | 'live' | 'remix' | 'mashup' | 'covers'
  // Singles release date — prikabinama parseTracklist'e iš to paties albumo
  // {{Singles}} infobox'o (single1date / single2date / ...). Anksčiau
  // dates tik prikabintos jei user'is atskirai importuodavo per Singles tab
  // → album import'as neperduodavo release_year tracks lentelei.
  release_year?: number | null
  release_month?: number | null
  release_day?: number | null
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

// Lazy getter — `SUBSTYLES` is empty at module-load time and only populated
// by `initializeConstants()` later (called from /api/admin/wiki/parse + UI).
// A const computed eagerly here would freeze `[]` and substyle matching
// would silently always return [].
function ALL_SUBSTYLES(): string[] {
  return Object.values(SUBSTYLES).flat()
}

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
 *
 * Tvarko ne-lotyni\u0161kus track title'us per Wikipedia template'us:
 *   {{lang|fa|\u0628\u0646\u06cc \u0622\u062f\u0645}}      \u2192 "\u0628\u0646\u06cc \u0622\u062f\u0645"
 *   {{lang-ar|...}}          \u2192 text dalis
 *   {{transl|ja|Hatsune Miku}} \u2192 "Hatsune Miku"
 *   {{nihongo|Tokyo|\u6771\u4eac|T\u014dky\u014d}} \u2192 "Tokyo" (display dalis)
 *   {{rtl-lang|he|\u05e9\u05dc\u05d5\u05dd}}     \u2192 "\u05e9\u05dc\u05d5\u05dd"
 *   {{IPA|...}}              \u2192 tu\u0161\u010dia (skip pronunciation)
 * Visi kiti template'ai (be specifinio handler'io) nuvalomi \u012f tu\u0161\u010di\u0105.
 */
export function cleanWikiText(raw: string): string {
  let s = raw
  s = s.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
  s = s.replace(/<ref[^/]*\/>/gi, '')
  s = s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')
  // Strip pair of quotes wrapping ONLY a [[wikilink]] \u2014 pvz `"[[We Will Rock You]]" (Fast)`
  // anks\u010diau po link extraction palikdavo `We Will Rock You" (Fast)` (stray middle quote).
  s = s.replace(/["\u201c\u2018]\s*(\[\[[^\]]+\]\])\s*["\u201d\u2019]/g, '$1')
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (_: string, _l: string, d: string) => d.replace(/^["'\u201c\u2018]+|["'\u201d\u2019]+$/g, '').trim())
  s = s.replace(/\[\[([^\]]+)\]\]/g, (_: string, l: string) => l.replace(/#[^\]]*$/, '').replace(/_/g, ' ').replace(/^["'\u201c\u2018]+|["'\u201d\u2019]+$/g, '').trim())

  // \u2500\u2500 Lokalizacijos / transliteracijos template'ai \u2500\u2500
  // I\u0161 `{{lang|XX|text}}` ir `{{lang-XX|text}}` i\u0161traukiam paskutin\u012f param'\u0105
  // (tikr\u0105j\u012f tekst\u0105 originalia kalba). Anks\u010diau visi `{{...}}` buvo tiesiog
  // wipe'inami, tod\u0117l Coldplay \u201e\u0628\u0646\u06cc \u0622\u062f\u0645" tap'davo \u201e{{lang" \u2192 tu\u0161\u010dias.
  s = s.replace(/\{\{lang-[a-z]+\s*\|\s*([^}|]+?)\s*(?:\|[^}]*)?\}\}/gi, '$1')
  s = s.replace(/\{\{lang\s*\|\s*[^|}]+\s*\|\s*([^}|]+?)\s*(?:\|[^}]*)?\}\}/gi, '$1')
  // {{transl|<lang>|<text>}} arba {{transl|<lang>|<scheme>|<text>}}
  s = s.replace(/\{\{transl\s*\|\s*[^|}]+\s*\|\s*(?:[^|}]+\s*\|\s*)?([^}|]+?)\s*\}\}/gi, '$1')
  // {{nihongo|english|kanji|romaji|...}} \u2192 english (1-as param), nes display'ui
  // angl\u0173 versija geriausia naudai.
  s = s.replace(/\{\{nihongo\s*\|\s*([^|}]+?)\s*(?:\|[^}]*)?\}\}/gi, '$1')
  // {{rtl-lang|XX|text}}
  s = s.replace(/\{\{rtl-lang\s*\|\s*[^|}]+\s*\|\s*([^}|]+?)\s*(?:\|[^}]*)?\}\}/gi, '$1')
  // Tarimo template'ai (IPA, IPAc, respell, audio) \u2192 wipe (nereikia track title'e)
  s = s.replace(/\{\{(?:IPA|IPAc-[a-z]+|respell|audio|pronunciation)\s*\|[^}]*\}\}/gi, '')

  // Visi kiti lik\u0119 template'ai \u2192 wipe (default'as)
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
  // Match: (feat/featuring/ft/with X) — su paren'ais. 'with' įtraukta dėl
  // Coldplay-style "(with Rihanna)" formatuotės kuri dažna duet'uose.
  // Balanced paren handling: leidžia vienakart nested `(...)` (pvz wiki disambig
  // `[[Mustapha (song)|Mustapha]]` — anksčiau `[^)]+` stop'indavo prie pirmojo
  // `)` ir Live Killers track "(with "[[Mustapha (song)|Mustapha]]" intro)"
  // tapdavo featuring=["Mustapha (song"], title=`Bohemian Rhapsody|Mustapha"` etc.
  const m1 = raw.match(/\((?:feat(?:uring)?\.?|ft\.?|with)\s+((?:[^()]+|\([^()]*\))+)\)/i)
  if (m1) {
    // Split TIK pagal , ir & — and-split atlieka cleanFeaturingTokens viduje.
    return cleanFeaturingTokens(m1[1].split(/[,&]/))
  }
  const m2 = raw.match(/\{\{(?:feat(?:uring)?\.?|ft\.?)[\s|]([^}]+)\}\}/i)
  if (m2) {
    return cleanFeaturingTokens(m2[1].split(/\s*\|\s*|[,&]/))
  }
  return []
}

/**
 * Iš comma/&-split tokens'ų atrenka realių artistų vardus.
 *
 * Sprendžia Wikipedia tracklist edge case'ą:
 *   "feat. David Bowie, Hot Space, 1982"
 * Anksčiau parser'is split'indavo pagal , ir paima visus 3 kaip "featuring".
 * Bet "Hot Space" yra originalo album'as, "1982" — metai.
 *
 * Heuristika: jei vienas iš tokens'ų yra 4-skaitm. metai (1900-2030), tai
 * pattern'as yra "Artist, Album, Year" — paimam tik tokens'us PRIEŠ
 * second-to-last (album'as) ir last (year). Plus filtruojam "from X",
 * "originally X", etc. metadata prefix'us. Pabaigai split'inam per 'and'
 * kad ištrauktume multi-artist'us iš vieno segmento.
 */
function cleanFeaturingTokens(commaSplit: string[]): string[] {
  // Wiki link'ų stripping + base trim
  const tokens = commaSplit.map(p => {
    const lm = p.match(/\[\[(?:[^\]|]+\|)?([^\]|]+)\]\]/)
    const cleaned = lm ? lm[1] : p
    return cleaned.replace(/['\[\]]/g, '').replace(/^\s*\)/, '').trim()
  }).filter(p => p.length > 1)
  if (tokens.length === 0) return []

  // Jei tokens'uose yra year — drop year + token prieš jį (originalo album'as).
  // Pvz ['David Bowie', 'Hot Space', '1982'] → ['David Bowie'].
  let artistTokens = tokens
  const yearIdx = tokens.findIndex(p => /^[12]\d{3}$/.test(p))
  if (yearIdx > 0) {
    artistTokens = tokens.slice(0, yearIdx - 1)
  } else if (yearIdx === 0) {
    artistTokens = []
  }

  // Filtruojam metadata prefix'us
  artistTokens = artistTokens.filter(p =>
    !/^(from|originally|on|in|off|via|by|track|side|disc|album)\s+/i.test(p)
  )

  // Split each by 'and' (multi-artist segmente)
  const result: string[] = []
  const seen = new Set<string>()
  for (const t of artistTokens) {
    for (const sub of t.split(/\s+and\s+/i)) {
      const s = sub.trim().replace(/^["']|["']$/g, '')
      if (s.length > 1 && !/^[12]\d{3}$/.test(s) && !seen.has(s.toLowerCase())) {
        seen.add(s.toLowerCase())
        result.push(s)
      }
    }
  }
  return result
}

/**
 * Parse title and featured artists from raw text.
 */
export function parseFeaturing(raw: string): { cleanTitle: string; featuring: string[] } {
  const featuring = extractFeaturing(raw)
  // Strip (feat|featuring|ft|with X) iš title kad cleanTitle nebūtų "Princess
  // of China (with Rihanna)" — title turi būti "Princess of China", o
  // featuring atskirai per track_artists junction'į.
  const cleanTitle = cleanWikiText(
    // Balanced paren — žr. extractFeaturing komentarą; tas pats su (song)/(album)
    // Wiki disambig'ais featuring paren'o viduje.
    raw.replace(/\s*\((?:feat(?:uring)?\.?|ft\.?|with)\s+(?:[^()]+|\([^()]*\))+\)/gi, '')
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
 * Extract peak chart position from Wikipedia table row.
 *
 * Strategy: Wikipedia discography pages list countries in fixed column order,
 * with the artist's HOME country usually first (UK band → UK column first).
 * Return the FIRST numeric cell, not the minimum across all countries.
 *
 * Why: previous min-across-all approach made every DM album look like #1
 * because at least one country charted them at #1. The first column is
 * typically the meaningful "home market" peak.
 *
 * Trade-off: for non-home country artists or unusual disco page layouts,
 * we might pick a less-relevant chart. Acceptable — admin can manually fix
 * peak_chart_position in the album form. Better than misleading #1 across
 * the catalog.
 */
export function parsePeakChartPosition(rowLines: string[]): number | null {
  for (const line of rowLines) {
    if (/scope\s*=\s*['"]row['"]/i.test(line)) continue
    if (/released|label|format|length|recorded|studio|producer|writer|certif/i.test(line)) continue

    const cells = line.split(/\|\|/)
    for (const cell of cells) {
      const cleaned = cell.replace(/^\s*\|\s*/, '').replace(/<ref[^>]*>.*?<\/ref>/gi, '').replace(/<ref[^>]*\/>/gi, '').trim()
      // Skip — common (em-dash for "did not chart") — return null only after exhausting all
      if (cleaned === '—' || cleaned === '-' || cleaned === '–') continue
      const numMatch = cleaned.match(/^(\d{1,3})$/)
      if (numMatch) {
        const n = parseInt(numMatch[1])
        if (n >= 1 && n <= 200) return n  // ← first numeric cell wins
      }
    }
  }
  return null
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
          // ORDER matters — specifūs tipai PIRMA, 'album' fallback'as paskutinis.
          // Anksčiau 'album' generic check buvo PIRMAS → "Cover albums",
          // "Live albums", "Soundtrack albums" → klaidingai tapdavo 'studio'.
          if (typeH.includes('single')) { currentType = 'single'; skipGroup = true }
          else if (typeH.includes(' ep') || typeH === 'eps') currentType = 'ep'
          else if (typeH.includes('tribute')) currentType = 'covers'
          else if (typeH.includes('cover')) currentType = 'covers'
          else if (typeH.includes('soundtrack') || typeH.includes('score')) currentType = 'soundtrack'
          else if (typeH.includes('remix')) currentType = 'remix'
          else if (typeH.includes('holiday') || typeH.includes('christmas')) currentType = 'holiday'
          else if (typeH.includes('demo')) currentType = 'demo'
          else if (typeH.includes('compilation') || typeH.includes('greatest') || typeH.includes('best of')) currentType = 'compilation'
          else if (typeH.includes('live') || typeH.includes('concert')) currentType = 'live'
          else if (typeH.includes('box') || typeH.includes('video') || typeH.includes('dvd')) { skipGroup = true }
          else if (/solo|as lead|as artist|as performer/i.test(typeH)) currentType = 'studio'
          else if (typeH.includes('studio') || typeH.includes('album')) currentType = 'studio'
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
    // Year extraction — bandom kelis pattern'us:
    // 1. `(YYYY)` inline — standartas EN Wikipedia
    // 2. `* YYYY:` arba `*YYYY:` prefix — Brazilian/PT-influenced pages (Caetano Veloso, Gilberto Gil, Tom Zé)
    // 3. `* '''YYYY'''` bold prefix — kai kurie naudoja bold metus
    // 4. `* YYYY —` arba `* YYYY -` dash separator
    const yearM = line.match(/\((\d{4})\)/)
      || line.match(/^\*\s*'''(\d{4})'''/)
      || line.match(/^\*\s*(\d{4})\s*[:：\-—–]/)
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
      // 2026-05-19: isAppearanceSection — pre-cache'inam, kad žinotume ar tai
      // "guest/appearances/promo" context'as. Anksčiau šitą result'ą perrašydavo
      // žemiau einantis `collaboration` match'as → "Collaborations and other
      // appearances" (Queen disco h2 sekcija su Various Artists albumais)
      // gaudavo skipSection=false ir Various Artists soundtracks (Sucker Punch,
      // Symphony of British Music, Beside Bowie, etc.) tapdavo "Queen studio".
      const isAppearanceSection = /video|dvd|film|promo|tour|guest|appear|certif|box.?set|music.video/.test(h)
      skipSection = isAppearanceSection
      // matched track flag — kad žinotume ar dabartinė sekcija yra
      // atpažintas album tipas. Jei NĖRA — currentType paveldima iš ankstesnės
      // sekcijos, kuri buvo bug priežastis: Metallica 'Tribute albums' ėjo
      // po 'Collaboration albums' kuri set'ino currentType='studio'. Tributes
      // tipas neegzistuoja explicit'ai — be safety, jie tapdavo studio.
      let matched = false
      // Bare "albums" (be prefix'o kaip „studio") — solo-artist'ų pages
      // dažnai turi `===Albums===` root section'ą su mišriais studio
      // albumais. Anksčiau catch-all `!matched && depth >= 3` skip'indavo
      // šitą section'ą → Morten Harket / Dave Gahan / etc. negaudavo NIEKO.
      if (h === 'albums' || h === 'studio albums') { currentType = 'studio'; skipSection = false; inSinglesSection = false; matched = true }
      else if (h.includes('studio')) { currentType = 'studio'; skipSection = false; inSinglesSection = false; matched = true }
      else if (h.includes('collaborative') || h.includes('collaboration')) {
        // 2026-05-19 fix: jei sekcijos header'is taip pat turi "appearance" /
        // "guest" / "promo" — tai Various Artists context'as (Queen disco
        // „Collaborations and other appearances"), ne primary-artist'o
        // collaborations. Skip'inam, kad neimport'intume Sucker Punch /
        // Symphony of British Music / Beside Bowie ir kt. kaip „Queen studio".
        // True „Collaboration albums" (be 'appearance') vis dar parse'inami.
        if (isAppearanceSection) { skipSection = true; matched = true }
        else { currentType = 'studio'; skipSection = false; inSinglesSection = false; matched = true }
      }
      else if (h.includes('extended play') || h.includes(' ep') || h === 'eps') { currentType = 'ep'; skipSection = false; matched = true }
      else if (h.includes('single')) { currentType = 'single'; skipSection = true; inSinglesSection = true; matched = true }
      else if (h.includes('remix')) { currentType = 'remix'; skipSection = false; matched = true }
      // Tribute albumus traktuojam kaip 'covers' — Wiki konvencija: tribute
      // albumai yra dažnai cover'iai of an artist/genre. Jei norėsim atskirti,
      // reikės naujo 'tribute' tipo enum'e.
      else if (h.includes('tribute')) { currentType = 'covers'; skipSection = false; matched = true }
      else if (h.includes('cover')) { currentType = 'covers'; skipSection = false; matched = true }
      else if (h.includes('holiday') || h.includes('christmas') || h.includes('xmas')) { currentType = 'holiday'; skipSection = false; matched = true }
      else if (h.includes('soundtrack') || h.includes('score')) { currentType = 'soundtrack'; skipSection = false; matched = true }
      else if (h.includes('demo')) { currentType = 'demo'; skipSection = false; matched = true }
      else if (h.includes('compilation') || h.includes('greatest') || h.includes('best of') || h.includes('collection')) { currentType = 'compilation'; skipSection = false; matched = true }
      else if (h.includes('live') || h.includes('concert')) { currentType = 'live'; skipSection = false; matched = true }
      else if (h.includes('box')) { currentType = 'other'; skipSection = true; matched = true }
      else if (depth === 2 && /chart|video|promo|appear/.test(h)) { inSinglesSection = true; skipSection = true; matched = true }
      else if (/^\d{4}s?$/.test(h.trim())) { skipSection = inSinglesSection; matched = true }
      else if (depth >= 3 && inSinglesSection) { skipSection = true; matched = true }
      // Unknown depth=3 section (e.g. 'Mixtapes', 'Reissues') under Albums
      // root — neturim mapping'o, NESKAIČIUOJAM kaip ankstesnis tipas, nes
      // tai duotų klaidingą klasifikaciją.
      if (!matched && depth >= 3) { skipSection = true }
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

    // yearMode aktivuojama, kai pamatom `! Year` table header (su ar be
    // rowspan, su ar be cell attrs). 2026-05-18 fix: anksčiau praleisdavo
    // `!width="35"|Year` (cell attrs be rowspan'o, Harold Budd-style table'ai).
    // Naujas check: bet koks `!...|Year` arba `!Year` arba `!attr Year`.
    if (/^!\s*Year\s*$/i.test(line) || /^!.*?(?:\|\s*Year\s*$|rowspan.*?Year\b|\bYear\s*$)/i.test(line)) { yearMode = true; continue }

    // Year row: |YEAR ar |attrs|YEAR ar |rowspan=N|YEAR ar |align="center"|YEAR.
    // 2026-05-18 fix: anksčiau cell attrs (align, style) prieš YEAR praleisdavo.
    const yearM = line.match(/^\|\s*(?:([^|]*?)\|)?\s*((?:19|20)\d{2})\s*$/)
    if (yearM) {
      currentYear = parseInt(yearM[2])
      const attrs = yearM[1] || ''
      const rsM = attrs.match(/rowspan\s*=\s*["']?(\d+)["']?/i)
      yearRowspan = rsM ? parseInt(rsM[1]) : 1
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
          // 2026-05-18: regex'as anksčiau reikalavo `[Rr]eleased` (past tense),
          // bet daugumos country/older artistų Wiki naudoja noun-phrase formatą
          // `Release date: April 12, 1989` (Garth Brooks, Willie Nelson, Eagles,
          // Michael Jackson, ir kt.). Regex'as praleisdavo → years coverage
          // krisdavo iki 1/23. `[Rr]elease(?:d)?` apima abu variantus.
          const relDate = nl.match(/[Rr]elease(?:d)?[^|{]*?(?:(\d{1,2})\s+)?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i)
          if (relDate) {
            day = relDate[1] ? parseInt(relDate[1]) : null
            const MONTHS: Record<string, number> = { january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12 }
            month = MONTHS[relDate[2].toLowerCase()] || null
            year = parseInt(relDate[3])
            continue
          }
          const relUS = nl.match(/[Rr]elease(?:d)?[^|{]*?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s*(\d{4})/i)
          if (relUS) {
            const MONTHS: Record<string, number> = { january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12 }
            month = MONTHS[relUS[1].toLowerCase()] || null
            day = parseInt(relUS[2])
            year = parseInt(relUS[3])
            continue
          }
          const relYearOnly = nl.match(/[Rr]elease(?:d)?[^|{]*?(\d{4})/)
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
  // Apima TRIS pavadinimo variantus:
  //   {{Track listing}}  — kanoninis su tarpu
  //   {{Tracklist}}      — alias be tarpo (The Beatles 'With the Beatles')
  //   {{Track_listing}}  — underscore variantas (Björk 'Post', Bowie albumų dauguma)
  // Anksčiau regex'as match'indavo TIK tarpą ar nieko, ne underscore →
  // Björk Post pages 3 tracklist'ai (Standard + Japanese + Australian) = 0 tracks.
  // [\s_] grupė apima abu pelio delimiterius.
  const pattern = /\{\{[\s_]*[Tt]rack[\s_]*[Ll]ist(?:ing)?\b/g
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
 * Fallback parser for #-numbered list tracklists under ==Track listing== section.
 * Many older Wikipedia albums (Wumpscut etc.) don't use {{Track listing}} template,
 * just plain markdown numbered lists:
 *   ==Track listing==
 *   # "Track 1" – 3:59
 *   # "Track 2" – 4:04
 *
 * Strict matching: requires quoted title AND duration to avoid false positives
 * (citations, bullet lists with similar formatting).
 */
export function parseHashListTracks(
  wikitext: string,
  // Optional: jei perduodam singles/dates iš parseTracklist'o, taikom is_single
  // matching'ą + release date'us. Atskirai callable (Stay on These Roads-style
  // hash-list albumai) — irgi suderiname per parseSinglesFromInfobox inline.
  passedSingles?: Set<string>,
  passedDates?: Map<string, SingleInfoboxData>,
): TrackEntry[] {
  const tracks: TrackEntry[] = []
  // Find ==Track listing== section (case-insensitive, allow "Track list", "Tracks")
  const secMatch = wikitext.match(/^(==+)\s*(?:Track\s*list(?:ing)?|Tracks)\s*\1\s*$/im)
  if (!secMatch || secMatch.index === undefined) return []
  const sectionLevel = secMatch[1].length  // count of '=' chars (e.g. 2 for ==X==)
  const sectionStart = secMatch.index + secMatch[0].length
  // 2026-05-15 fix: boundary = SAME or HIGHER level section. Anksčiau bet kokia
  // `==+` matchindavo, todėl nested sub-sections (pvz `===''The Freddie Mercury
  // Album''===` po `==Track listing==`) iškart bound'indavo body į 0 chars.
  // Reikia matchint tik `=` count <= sectionLevel.
  const boundaryRe = new RegExp(`^={1,${sectionLevel}}[^=]`, 'm')
  const nextSec = wikitext.slice(sectionStart).match(boundaryRe)
  const sectionEnd = nextSec && nextSec.index !== undefined
    ? sectionStart + nextSec.index : Math.min(sectionStart + 8000, wikitext.length)
  const body = wikitext.slice(sectionStart, sectionEnd)

  // Singles ir dates — jei caller perdavė, naudoj; antraip parsuojam patys
  // iš wikitext'o (kad funkcija liktų self-contained external naudotojams).
  const { names: singles, dates: singleDates } = passedSingles && passedDates
    ? { names: passedSingles, dates: passedDates }
    : parseSinglesFromInfobox(wikitext)

  // Strict pattern: `# "Title" – duration` (en/em/regular dash, optional)
  // Also accepts `# "Title" (note)` with duration appended later
  // Skip lines that look like references/citations
  const lineRe = /^#\s*"([^"\n]+?)"\s*(?:\(([^)]+)\))?\s*[–—-]\s*(\d{1,2}:\d{2}(?::\d{2})?)/gm
  let lm: RegExpExecArray | null
  let order = 1
  while ((lm = lineRe.exec(body)) !== null) {
    // Raw capture'as gali tureti `[[Stay on These Roads (song)|Stay on These Roads]]`
    // tipo wikilink'us — a-ha „Stay on These Roads" hash-list formatas. Anksčiau
    // pushindavom `lm[1].trim()` neapdorotą, todėl titles likdavo su `[[...]]`
    // brackets. cleanWikiText išsprendžia: `[[X|Y]] → Y`, `[[X]] → X` ir t.t.
    // Tas pats pipeline'as kaip parseTracklist eilutėje ~863-865, kad
    // hash-list ir {{Track listing}} formatai duoda identišką output'ą.
    const { cleanTitle, featuring: titleFeat } = parseFeaturing(lm[1].trim())
    // Wiki Style title case — toks pats kaip {{Track listing}} pipeline'e
    const title = wikiTitleCase(cleanWikiText(cleanTitle))
    const noteRaw = lm[2] || ''
    const duration = lm[3]
    if (title.length < 2) continue
    // Determine track type from optional note
    const noteLow = noteRaw.toLowerCase()
    let type: TrackEntry['type'] = 'normal'
    if (/\bremix\b/.test(noteLow)) type = 'remix'
    else if (/\binstrumental\b/.test(noteLow)) type = 'instrumental'
    else if (/\blive\b/.test(noteLow)) type = 'live'
    else if (/\bcover\b/.test(noteLow)) type = 'covers'
    // featuring extraction — pirma iš note (`(feat. X)` po dash'o), tada
    // fallback iš title'o jei parseFeaturing kažką ištraukė inline.
    // Naudojam cleanFeaturingTokens kuris drop'ina "X, Album, Year" patterns
    // (anksčiau "Under Pressure feat. David Bowie, Hot Space, 1982" duodavo
    // 3 "artist'us" tarp kurių 2 buvo album'as + metai).
    let featuring: string[] | undefined
    const featM = noteRaw.match(/(?:feat(?:uring)?\.?|with)\s+(.+)/i)
    if (featM) {
      featuring = cleanFeaturingTokens(featM[1].split(/[,&]/))
    }
    if ((!featuring || !featuring.length) && titleFeat.length) featuring = titleFeat
    // is_single + release date — taikom tą pačią logiką kaip parseTracklist
    // (matchAsSingle helper), kad hash-list albumai (a-ha „Stay on These Roads")
    // gautų teisingą is_single attribution'ą ir Wikipedia infobox release date'us.
    const normalizedTitle = title.toLowerCase().replace(/['’‘]/g, '').trim()
    const is_single = singles.size > 0 ? matchAsSingle(normalizedTitle, singles) : undefined
    const dateInfo = is_single ? singleDates.get(normalizedTitle) : undefined
    tracks.push({
      title, duration, sort_order: order++,
      type,
      featuring: featuring && featuring.length ? featuring : undefined,
      is_single,
      release_year: dateInfo?.year ?? null,
      release_month: dateInfo?.month ?? null,
      release_day: dateInfo?.day ?? null,
    })
  }
  return tracks
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
/** Normalizuoja pavadinimą lookup'ui — lowercased + apostrophe stripped.
 *  Naudojama ir singles Set'e (names) ir dates Map'e (key) kad track'as
 *  galėtų rastas nepriklausomai nuo apostrophes variantų ('Don't' vs 'Dont').
 *  Anksčiau Set turėjo "don't panic", o track lookup pridėdavo "dont panic"
 *  → mismatch → is_single=false net real single'ams. */
function normalizeSingleKey(name: string): string {
  return name.toLowerCase().replace(/['’‘]/g, '').trim()
}

/**
 * Patikrina, ar `normalizedTitle` (track'o pavadinimas po apostrof valymo)
 * atitinka kažkurį singles infobox'o key'ą. Naudojama tiek parseTracklist'e,
 * tiek parseHashListTracks'e — kad abu formatai (`{{Track listing}}` ir
 * `# "title" – 4:45` hash-list) gautų vienodą is_single attribution'ą.
 *
 * Match logika:
 *   1) Exact set membership
 *   2) Plural form: single "Heart" → track "Hearts"
 *   3) Slash-split single "X/Y" → track "X" ar "Y"
 *   4) Reverse plain prefix: single "Track Reprise" su track'u "Track"
 *      (BE skliaustų ir BE remix/version/etc suffix'o)
 *
 * Sąmoningai NEpromote'inam parenthesized alt versijų:
 *   single "We Pray" + track "We Pray (Be Our Guest)" → NE single
 *   (Wikipedia infobox dažnai listina tik bazinį pavadinimą; album'e
 *   parenthesized variant yra alt-take, ne atskiras single release'as.)
 */
function matchAsSingle(normalizedTitle: string, singles: Set<string>): boolean {
  if (singles.size === 0) return false
  if (singles.has(normalizedTitle)) return true
  for (const s of singles) {
    if (normalizedTitle === s) return true
    if (normalizedTitle.startsWith(s)) {
      const after = normalizedTitle.slice(s.length)
      if (after.startsWith('s ') && !after.includes('reprise')) return true
    }
    if (s.includes('/')) {
      const parts = s.split('/').map(p => p.replace(/[""„"]/g, '').trim()).filter(Boolean)
      if (parts.some(p => p === normalizedTitle || normalizedTitle.startsWith(p + ' ') || p.startsWith(normalizedTitle))) return true
    }
    if (s.startsWith(normalizedTitle + ' ')) {
      const sAfter = s.slice(normalizedTitle.length)
      if (!/(remix|version|mix|edit|live|acoustic|instrumental|demo|dub)\b/i.test(sAfter)
          && !sAfter.startsWith(' (')) return true
    }
  }
  return false
}

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
      if (name.length > 1) names.add(normalizeSingleKey(name))
    }
  }

  function parseDate(dateStr: string): SingleInfoboxData {
    // {{Start date|df=yes|2019|10|24}} arba {{Start date|2019|10|24}} —
    // Wikipedia infobox'uose dažnai naudojama vietoj plain "24 October 2019".
    // Anksčiau parseDate strip'indavo VISUS {{...}} templates → date'a buvo
    // tuščia (Coldplay 'Everyday Life' / 'Orphans' atveju).
    const sd = dateStr.match(/\{\{[Ss]tart[\s_]?date(?:\|[^|}]+)?\|(\d{4})(?:\|(\d{1,2})(?:\|(\d{1,2}))?)?[\s\S]*?\}\}/)
    if (sd) {
      const y = parseInt(sd[1])
      // Start date'o pirmas pozicinis arg gali būti df=yes/mf=yes, tada (\d{4}) match'inasi prie YYYY.
      // Pasitikrinam ar sd[1] yra "df", jei taip — skipinam.
      if (!isNaN(y)) {
        return {
          year: y,
          month: sd[2] ? parseInt(sd[2]) : null,
          day: sd[3] ? parseInt(sd[3]) : null,
        }
      }
    }
    const clean = dateStr.replace(/\([^)]*\)/g, '').replace(/\{\{[^}]*\}\}/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '').replace(/<ref[^/]*\/>/gi, '').trim()
    // UK format: "14 October 2003" — day month year
    const full = clean.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i)
    if (full) return { day: parseInt(full[1]), month: MONTHS[full[2].toLowerCase()] || null, year: parseInt(full[3]) }
    // US format: "October 14, 2003" / "January 12, 2004" — month day, year.
    // Wikipedia infobox'uose US artistams (Britney Spears, 2Pac, etc.)
    // single{N}date dažnai būna US formatu. Anksčiau parseDate negaudavo
    // pilnos datos — month_year regex match'indavo TIK month+year, paliekant
    // day=null. Coldplay UK formatas veikė, Britney US ne.
    const us = clean.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s*(\d{4})/i)
    if (us) return { day: parseInt(us[2]), month: MONTHS[us[1].toLowerCase()] || null, year: parseInt(us[3]) }
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
    // singlesByNum: kiekvienam single{N} sukaupiam VISUS kandidatus (display
    // alias, link target, parenthesized-version base). Date propaguojama
    // visiems \u2014 kad \u201eCast in Steel" track gaut\u0173 \u201eCast in Steel (Steve Osborne
    // Version)" dat\u0105 ir kad \u201eDark Is the Night for All" track gaut\u0173 to paties
    // single'o dat\u0105 kaip \u201eDark Is the Night".
    const singlesByNum: Record<string, string[]> = {}
    // Double A-side track'ai (pvz "Orphans" / "Arabesque" Coldplay) \u2014 abu turi
    // gauti t\u0105 pa\u010di\u0105 release dat\u0105 i\u0161 to paties single{n}date. slashAltsByNum
    // saugo visus alternate'us pagal single number.
    const slashAltsByNum: Record<string, string[]> = {}
    // Suffix'as kur\u012f traktuojam kaip alt-versij\u0105 \u2014 tas pats track'as, kitas
    // mix/edit/remix etc. Cast in Steel atveju single yra \u201eCast in Steel
    // (Steve Osborne Version)", o albume yra base \u201eCast in Steel" \u2014 pridedam
    // base kaip atskir\u0105 kandidat\u0105, kad track gaut\u0173 is_single=true.
    const altSuffixRe = /\s*\([^)]*\b(?:version|mix|remix|edit|edition|cut|remaster(?:ed)?|extended|radio|club|dance|acoustic|piano|orchestral|single|bonus|original)\b[^)]*\)$/i
    while ((sm = sRe.exec(chunk)) !== null) {
      const candidates: string[] = []
      // (1) Display alias (jei `[[X|Y]]`) arba article title (`[[X]]`)
      let name = extractName(sm[2])
      if (!name) {
        const plain = sm[2].replace(/\{\{[^}]*\}\}/g, '').replace(/<[^>]+>/g, '').replace(/['""\u201c\u201d\u2018\u2019]+/g, '').trim()
        if (plain.length > 1 && !plain.includes('|') && !plain.includes('=')) name = plain
      }
      if (name) candidates.push(name)
      // (2) Link target (kai `[[X|Y]]`) \u2014 track'o title gali atitikti article
      // pavadinim\u0105, ne display alias'\u0105. Memorial Beach atveju:
      //   single1 = [[Dark Is the Night for All|Dark Is the Night]]
      // \u2192 display \u201eDark Is the Night", o tracks.title1 = [[Dark Is the Night
      // for All]] \u2192 po cleanWikiText \u201eDark Is the Night for All". Pridedam
      // target'\u0105 kaip antr\u0105 kandidat\u0105.
      const linkM = /\[\[([^\]|]+?)\|([^\]]+)\]\]/.exec(sm[2])
      if (linkM) {
        const target = linkM[1].replace(/#[^\]]*$/, '').replace(disambigRe, '').replace(/['""\u201c\u201d\u2018\u2019]+/g, '').trim()
        if (target.length > 1 && target.toLowerCase() !== (name || '').toLowerCase()) {
          candidates.push(target)
        }
      }
      // (3) Parenthesized version suffix base form \u2014 \u017ei\u016br. altSuffixRe.
      // Pridedam I\u0160 VIS\u0172 jau surinkt\u0173 kandidat\u0173, nes ir display, ir target
      // gali tur\u0117ti suffix'\u0105.
      for (const c of [...candidates]) {
        if (altSuffixRe.test(c)) {
          const base = c.replace(altSuffixRe, '').trim()
          if (base.length > 1 && base.toLowerCase() !== c.toLowerCase()) candidates.push(base)
        }
      }
      // Normalize + dedup; visi kandidatai eina \u012f names Set ir singlesByNum
      const norms: string[] = []
      for (const c of candidates) {
        const n = normalizeSingleKey(c)
        if (n && !norms.includes(n)) norms.push(n)
      }
      if (norms.length) {
        for (const n of norms) names.add(n)
        singlesByNum[sm[1]] = norms
      }
      const rawVal = sm[2].replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1').replace(/\[\[([^\]]+)\]\]/g, '$1')
        .replace(disambigRe, '')
      if (rawVal.includes('/')) {
        const alts: string[] = []
        for (const part of rawVal.split('/')) {
          const clean = normalizeSingleKey(part.replace(/['""\u201c\u201d\u2018\u2019]+/g, ''))
          if (clean.length > 1) {
            names.add(clean)
            alts.push(clean)
          }
        }
        if (alts.length) slashAltsByNum[sm[1]] = alts
      }
    }
    // [^\n]+ vietoj [^\n|]+ — {{Start date|df=yes|2019|10|24}} turi pipes
    // viduje template'o, kurie anksčiau nutraukdavo capture'ą prie pirmojo |.
    const dRe = /\|\s*single(\d+)date\s*=\s*([^\n]+)/g
    let dm: RegExpExecArray | null
    while ((dm = dRe.exec(chunk)) !== null) {
      const singleNames = singlesByNum[dm[1]] || []
      const date = parseDate(dm[2])
      for (const n of singleNames) dates.set(n, date)
      // Propaguojam t\u0105 pa\u010di\u0105 dat\u0105 visiems slash-alternate'ams kad
      // "Arabesque" (antras dvigubo A-side track'as) gaut\u0173 t\u0105 pa\u010di\u0105
      // 2019-10-24 dat\u0105 kaip "Orphans".
      const alts = slashAltsByNum[dm[1]] || []
      for (const alt of alts) dates.set(alt, date)
    }
  }

  // Fallback: `== Singles ==` section'as su `=== "Title" ===` ar
  // `=== ''Title'' ===` h3 sub-header'iais. Naudojama, kai album puslapis
  // neturi {{Singles}} infobox template'o (pvz Martin Gore „Counterfeit²"
  // — singles sąrašas tik sekcijos antraštėse, ne infobox'e).
  const singlesSecRe = /^==\s*Singles\s*==\s*$([\s\S]*?)(?=^==[^=]|\z)/im
  const secM = wikitext.match(singlesSecRe)
  if (secM) {
    const body = secM[1]
    const h3Re = /^===\s*(.+?)\s*===\s*$/gm
    let hm: RegExpExecArray | null
    while ((hm = h3Re.exec(body)) !== null) {
      // Strip italic/bold wrappers ir quotes: `"Stardust"` → Stardust;
      // `''Loverman EP²''` → Loverman EP²
      let title = hm[1]
        .replace(/^'{2,}|'{2,}$/g, '')          // italic/bold ('')
        .replace(/^["“„]|["”]$/g, '')           // double quotes (curly + ASCII)
        .replace(/^['‘]|['’]$/g, '')            // single quotes
        .replace(/\[\[([^\]|]+?)\|([^\]]+)\]\]/g, '$2')
        .replace(/\[\[([^\]]+)\]\]/g, '$1')
        .trim()
      // Skipinam meta-section'us (kurie galimai pakliuvo per case mismatch)
      if (!title || title.length < 2) continue
      if (/^(other|notes?|see also|references)$/i.test(title)) continue
      const norm = normalizeSingleKey(title)
      if (norm) names.add(norm)
    }
  }

  return { names, dates }
}

/**
 * Iš album infobox'o ištraukia `| genre = ...` lauką ir grąžina žanrų
 * pavadinimus (raw — be wikilink syntax, bet su originaliu rašymu).
 *
 * Wikipedia palaiko du formatus:
 *   | genre = [[Synth-pop]], [[pop rock]]           ← inline comma-separated
 *   | genre =                                        ← bullet list
 *   * [[Alternative rock]]
 *   * [[pop rock]]
 *
 * Iškart sustojam ties next infobox lauku (`\n|` ar `\n}}`) — kad
 * nesusijungtų su gretimu `| label = ...` ar uždarymu.
 *
 * Grąžiną sąrašą turi išvalytus vardus, bet ne normalize'intus —
 * fuzzy match'inimas (Synth-pop → Synthpop) yra atskirame helper'yje
 * `matchGenreToSubstyle` lib/genre-match.ts.
 */
export function parseAlbumGenres(wikitext: string): string[] {
  // Imam tik pirmąjį infobox album (yra atvejų, kai chronology rodo kitus
  // albumus su savo {{Infobox album}} embed'intais — saugiau imti pirmą).
  const infoStart = wikitext.search(/\{\{Infobox\s+album/i)
  if (infoStart === -1) return []
  // Skopas iki kito infobox lauko po `genre`. `[^\n|]+` neapima newline ir
  // pipe, todėl natūraliai stop'ina ties kitu | field = ... eilute.
  // Bullet list — paimam pilną block'ą iki to paties stop sąlygos.
  const chunk = wikitext.slice(infoStart, infoStart + 5000)
  const gm = chunk.match(/\|\s*genre\s*=\s*([\s\S]*?)(?=\n\s*\|\s*\w+\s*=|\n\}\})/)
  if (!gm) return []
  // Pre-process body — eilė yra svarbi:
  //   1) HTML komentarai + ref blokai: lauk (pvz Britney „Circus"
  //      `<!-- All sourced in the Music...-->` lauko pradžioje; Coldplay
  //      „X&Y" turi `<ref>{{cite web|...}}</ref>` po kiekvieno žanro).
  //   2) Wiki link'ai → display tekstas: PIRMA, kad pipe'iai viduje
  //      `[[X|Y]]` netaptų atskirais hlist item'ais.
  //   3) {{hlist|X|Y}} → tarp item'ų kableliais. Tik PO link'ų flat'inimo,
  //      kad split('|') gautų tikrus item'us.
  let body = gm[1]
  body = body.replace(/<!--[\s\S]*?-->/g, '')
  body = body.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '').replace(/<ref[^/]*\/>/gi, '')
  body = body.replace(/\[\[([^\]|]+?)\|([^\]]+)\]\]/g, '$2')
  body = body.replace(/\[\[([^\]]+)\]\]/g, (_, l: string) => l.replace(/#[^\]]*$/, '').replace(/_/g, ' '))
  body = body.replace(/\{\{\s*hlist\s*\|\s*([^}]+)\}\}/gi, (_, inner: string) =>
    inner.split('|').map(s => s.trim()).filter(Boolean).join(','))
  body = body.replace(/\{\{\s*flatlist\s*\|?\s*([\s\S]*?)\}\}/gi, '$1')
  // 2026-05-19: NESTED-SAFE recursive strip remaining `{{...}}` templates
  // (cite web, citation, sfn, nowrap, etc). Anksčiau `[^}]*` regex sušlubdavo
  // ant nested templates ir cite fragments → split('|') → DB substyles kaip
  // "www.udiscovermusic.com", "title= The Works...". Repro: Queen The Works
  // | genre = ...synth-pop{{cite web|url=...|title=...}} (be <ref> wrappers).
  body = stripBalancedTemplates(body)

  const results: string[] = []
  const seen = new Set<string>()

  // Pirmas variantas: bullet list (`* [[X]]` ar `*[[X]]`)
  // Antras: inline comma/bullet-separated be eilutės pradžios bullet'ų
  const bulletLines = body.split(/\n/).filter(l => /^\s*\*/.test(l))
  if (bulletLines.length) {
    for (const line of bulletLines) {
      // pašaliname leading bullet ir indent'ą, paliekam content'ą
      const content = line.replace(/^\s*\*\s*/, '')
      for (const part of splitGenreList(content)) {
        const name = cleanGenreName(part)
        if (name && !seen.has(name.toLowerCase())) {
          results.push(name)
          seen.add(name.toLowerCase())
        }
      }
    }
  } else {
    // Inline (comma/slash separated): „[[Synth-pop]], [[pop rock]]"
    for (const part of splitGenreList(body)) {
      const name = cleanGenreName(part)
      if (name && !seen.has(name.toLowerCase())) {
        results.push(name)
        seen.add(name.toLowerCase())
      }
    }
  }
  return results
}

/** Split žanrų sąrašo virtinę į atskirus kandidatus. Palaikom kablelį,
 *  semicolon, slash. SĄMONINGAI NESPLIT'INAM ant " and " / " & " — Wikipedia
 *  žanrų infobox'uose šitie žodžiai dažniausiai yra link target'o dalis
 *  (pvz „rock and roll", „rhythm and blues"), ne separator'iai tarp žanrų. */
function splitGenreList(text: string): string[] {
  // Pirma flat'inam wiki link'us į display tekstą, kad split'ai neperpjautų
  // [[X|Y, Z]] viduje pipe'o. Tada split'inam tik ant griežtų separator'ių.
  const flat = text
    .replace(/\[\[([^\]|]+?)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
  return flat.split(/[,;\/]/).map(s => s.trim()).filter(Boolean)
}

/** Vienam žanro kandidatui: nuvalo HTML tag'us, ref'us, paaiškinimus
 *  skliaustuose (pvz „pop rock (early)" → „pop rock"), trumpina iki
 *  saugaus ilgio. */
function cleanGenreName(raw: string): string {
  let s = raw
  s = s.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '').replace(/<ref[^/]*\/>/gi, '')
  s = s.replace(/<[^>]+>/g, '')
  s = stripBalancedTemplates(s)
  s = s.replace(/\[\[|\]\]/g, '')
  s = s.replace(/\([^)]*\)/g, '') // paaiškinimai skliaustuose
  s = s.replace(/['"„"]+/g, '')
  s = s.replace(/\s+/g, ' ').trim()
  // Praleiskim non-genre lyk'us — citation tag'us, paaiškinimus
  if (s.length < 2 || s.length > 60) return ''
  if (/^\s*(see|main|note|citation|ref)\b/i.test(s)) return ''
  // Drop fragments su URL/cite parametrų — `title=`, `url=`, `www.`, `http`
  if (/(?:^|\s)(?:title|url|publisher|website|date|first|last|access-date)\s*=/i.test(s)) return ''
  if (/\b(?:https?|www\.|\.com|\.org|\.net)\b/i.test(s)) return ''
  return s
}

/** Recursive balanced `{{...}}` strip — handles nested templates per `{{cite web|
 *  url=...|title=...}}` and `{{nowrap|x|y}}`. Naive `[^}]*` regex would stop at
 *  first `}` ir cite parametrų likučius. Visada paima visus depth-0 close'us. */
function stripBalancedTemplates(s: string): string {
  let out = ''
  let depth = 0
  for (let i = 0; i < s.length; i++) {
    if (i + 1 < s.length && s[i] === '{' && s[i + 1] === '{') { depth++; i++; continue }
    if (i + 1 < s.length && s[i] === '}' && s[i + 1] === '}' && depth > 0) { depth--; i++; continue }
    if (depth === 0) out += s[i]
  }
  return out
}

/**
 * Parse tracklist from Wikipedia album article or TrackListing templates.
 */
export function parseTracklist(wikitext: string): TrackEntry[] {
  const { names: singles, dates: singleDates } = parseSinglesFromInfobox(wikitext)
  const tlWithPos = extractTrackListingsWithPos(wikitext)
  const tlBlocks = tlWithPos.map(t => t.block)

  if (!tlBlocks.length) {
    // No {{Track listing}} / {{Tracklist}} template — bandom fallback per
    // hash-list parser (Wumpscut, senesni indie albums dažnai turi `# "Title" – 3:45`
    // formatte po ==Track listing== headeryje). Strict patternas (quoted title +
    // duration) saugo nuo false positives (citations, bullet lists). Perduodam
    // jau parsuotą singles/dates — kad hash-list'o tracks gautų teisingą
    // is_single + release date'us (a-ha „Stay on These Roads" atvejis).
    return parseHashListTracks(wikitext, singles, singleDates)
  }

  const parseBlock = (tl: string, startOrder: number): TrackEntry[] => {
    const tracks: TrackEntry[] = []
    const nums = [...tl.matchAll(/\|\s*title(\d+)\s*=/g)].map(m => parseInt(m[1])).sort((a,b) => a-b)
    let order = startOrder
    for (const num of nums) {
      // `{{...}}` template'as gali turėti `|` viduj (pvz `{{lang|fa|بنی آدم}}`).
      // Anksčiau regex'as stop'indavo ant pirmo `|`, kad ir esančio template'o
      // viduje → title'e likdavo „{{lang". Atomic'iai matchin'am `{{...}}` kaip
      // vienetą (ne nested), kad pipe template'o viduje neperrinktų regex'o.
      const titleM = tl.match(new RegExp(`\\|\\s*title${num}\\s*=\\s*((?:\\[\\[[^\\]]*\\]\\]|\\{\\{[^{}]*\\}\\}|[^|\\n])+)`))
      if (!titleM) continue
      const lenM = tl.match(new RegExp(`\\|\\s*length${num}\\s*=\\s*([^|\\n]+)`))
      const noteM = tl.match(new RegExp(`\\|\\s*note${num}\\s*=\\s*((?:\\[\\[[^\\]]*\\]\\]|\\{\\{[^{}]*\\}\\}|[^|\\n])+)`))

      const noteStr_raw = (noteM?.[1] || '').toLowerCase()
      if (/^\s*hidden\s*track/.test(noteStr_raw)) continue
      const titleRaw = (titleM?.[1] || '').toLowerCase()
      if (/^\s*hidden\s*track/.test(titleRaw)) continue
      // Per-track DVD/video skip — Britney Spears Circus „bonus DVD" buvo
      // pažymėtas kaip atskira sekcija (gaudytas block-level), bet kai
      // Wikipedia editor įdeda DVD content vidury bendro Track listing
      // block'o (kartais lieka „Making of the Album" 9:34 šalia regular
      // tracks), block-level filter'is jį praleis. Apsidraudžiam:
      const trashTitlePatterns = [
        /\bmaking\s+of\s+(the\s+)?(album|video|record)\b/i,
        /^\s*photo\s+gallery\s*$/i,
        /\bmusic\s+video\b/i,
        /\bdirector'?s\s+cut\b/i,
        /^\s*(behind\s+the\s+scenes|featurette|interview|trailer|teaser)\b/i,
        /\bvideo\s+(edit|version|mix)\b/i,
      ]
      if (trashTitlePatterns.some(re => re.test(titleRaw) || re.test(noteStr_raw))) continue

      const durStr = lenM?.[1]?.trim() || ''
      // Palaikom MM:SS arba HH:MM:SS formatą. Anksčiau tik MM:SS — todėl
      // 1:44:35 (Coldplay documentary 1h44m) praeidavo be duration check'o
      // (regex'as nematch'ino). Hard cap 15min — bet kokia ilgesnė „daina"
      // greičiausiai documentary, mix tape, ar full album upload.
      const durMatch = durStr.match(/^(\d+):(\d+)(?::(\d+))?$/)
      if (durMatch) {
        const totalSec = durMatch[3]
          ? parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseInt(durMatch[3])
          : parseInt(durMatch[1]) * 60 + parseInt(durMatch[2])
        if (totalSec < 10) continue
        if (totalSec > 900) continue
      }
      let featuring: string[] = []
      if (noteM) {
        // Patikrinam featuring artist'us per kelis pattern'us:
        // 1) feat/featuring/ft anywhere — "(featuring [[X]])" ar "featuring [[X]]"
        // 2) "with [[X]]" — Coldplay-style note10="with [[Rihanna]]" (be paren'ų)
        // 3) "(with [[X]])" — alt forma su paren'ais
        // Naudojam cleanFeaturingTokens kuris drop'ina "X, Album, Year" patterns.
        let fm = noteM[1].match(/\b(?:feat(?:uring)?|ft)\.?\s+(.+)/i)
        if (!fm) fm = noteM[1].match(/^\s*with\s+(.+)/i)
        if (!fm) fm = noteM[1].match(/\(\s*with\s+((?:[^()]+|\([^()]*\))+)\)/i)
        if (fm) featuring = cleanFeaturingTokens(fm[1].split(/[,&]/))
      }
      const { cleanTitle, featuring: tf } = parseFeaturing(titleM[1].trim())
      if (!featuring.length) featuring = tf
      // Wiki Style title case: legacy music.lt'as turėjo mažom raidėm `good
      // old fashioned lover boy` — Wiki canonical yra normalizuotas, todėl
      // apply'inam taisyklingą Title Case'ą importuojant (2026-05-19 Queen
      // backfill — 28 trackai pataisyti). wikiTitleCase preserves acronyms,
      // small words po `(`/`:` kaip first-in-segment cap'inti.
      const finalTitle = wikiTitleCase(cleanWikiText(cleanTitle))
      if (finalTitle) {
        // Apostrophe normalization: match `normalizeSingleKey` exactly so
        // tracks like "Don't Panic" lookup correctly against the singles Set
        // (which strips ASCII ', curly \u2019, and reverse-curly \u2018).
        const normalizedTitle = finalTitle.toLowerCase().replace(/['\u2019\u2018]/g, '').trim()
        // is_single attribution \u2014 pirma exact match, paskui keletas atsargi\u0173
        // fallback'\u0173 (slash split, plural form). Parenthesized variant'\u0173
        // ('(Be Our Guest)', '(Album Edit)') NEPROMOTE'inam \u012f single per
        // startsWith \u2014 Wikipedia singles infobox da\u017enai listina tik bazin\u012f
        // pavadinim\u0105, o albume yra alt-versija kaip atskira track. Anks\u010diau
        // buvo `startsWith + ' (' bei NE-known-variant` \u2192 "We Pray (Be Our
        // Guest)" gaudavo is_single=true antr\u0105 kart\u0105, nors realyb\u0117j tai
        // album'o bonus, ne atskiras single release'as.
        // is_single attribution \u2014 \u017ei\u016br. matchAsSingle (top of file). Helper
        // dalinamas su parseHashListTracks, kad abu formatai duot\u0173 vienod\u0105
        // is_single rezultat\u0105. `undefined` kai infobox neturi singles secijos
        // (\u017einom \u2014 nieko negalim pasakyti); `true/false` kai turi.
        const is_single = singles.size > 0 ? matchAsSingle(normalizedTitle, singles) : undefined
        const noteStr = (noteM?.[1] || '').toLowerCase()
        // Track type detection: griežtesnė nei bare \blive\b, nes featuring
        // artist'ai gali turėti band-name'us su "live", "cover", "remix" žodžiais
        // (pvz [[Live Squad]], [[The Cover Girls]]). Apima du sluoksnius:
        //
        // 1) Strip [[wikilink]] interior'us — band names yra wikilink'uose,
        //    todėl jų vidus negali generuoti track-type signal'o.
        // 2) Reikalauti aiškaus konteksto (paren'ai, kabliuku/kabliu, "version",
        //    "recording", "at/from"), ne bare \blive\b — kad plain text
        //    "featuring Live Squad" neaktyvuotų.
        const stripped = noteStr
          .replace(/\[\[[^\]]*\]\]/g, '')         // [[Live Squad]] → ''
          .replace(/\{\{[^}]*\}\}/g, '')          // {{lang|en|...}} → ''
          .replace(/<[^>]+>/g, '')                // <ref>...</ref> → ''
        // Explicit live phrasings (Wikipedia editorial konvencija):
        //   (live), live at X, live from X, live version, live recording,
        //   recorded live, live in studio, live on TV, etc.
        const LIVE_RE = /(?:^|[\s(,\-])live(?:\s+(?:at|from|in|on|version|recording|performance|cut|take))?(?:[\s),\-.]|$)|recorded\s+live\b/i
        const COVER_RE = /(?:^|[\s(,\-])covers?(?:\s+(?:of|version))?(?:[\s),\-.]|$)|cover\s+version\b/i
        const REMIX_RE = /\bremix(?:\s+version)?\b/i
        // Title-level checkai — TIK kai "live"/"remix" yra **viduje skliaustelių**
        // (note convention: "Bohemian Rhapsody (Live at Wembley)"). Anksčiau
        // bare LIVE_RE.test(titleLower) match'indavo "Let Me Live", "Live and
        // Let Die" — tracks su žodžiu "live" pavadinime, NE live versija.
        const TITLE_LIVE_RE = /\([^)]*\blive\b[^)]*\)/i
        const TITLE_REMIX_RE = /\([^)]*\bremix\b[^)]*\)/i
        const titleLower = finalTitle.toLowerCase()
        let trackType: TrackEntry['type'] = 'normal'
        if (/\binstrumental\b/.test(stripped) || /\(.*instrumental.*\)/i.test(titleLower)) trackType = 'instrumental'
        else if (LIVE_RE.test(stripped) || TITLE_LIVE_RE.test(titleLower)) trackType = 'live'
        else if (REMIX_RE.test(stripped) || TITLE_REMIX_RE.test(titleLower)) trackType = 'remix'
        else if (COVER_RE.test(stripped)) trackType = 'covers'
        else if (/\bmashup\b/.test(stripped) || /\(.*mashup.*\)/i.test(titleLower)) trackType = 'mashup'
        // Singles release date — jei šis track yra single, pakabinam datą iš
        // albumo {{Singles}} infobox'o (single1date / single2date / ...). Tai
        // leidžia album import flow'ui automatiškai užpildyti tracks.release_*
        // be reikalavimo user'iui atskirai importuoti per Singles tab.
        const dateInfo = is_single ? singleDates.get(normalizedTitle) : undefined
        tracks.push({
          title: finalTitle,
          duration: lenM?.[1]?.trim(),
          sort_order: order++,
          is_single,
          featuring: featuring.length ? featuring : undefined,
          type: trackType,
          release_year: dateInfo?.year ?? null,
          release_month: dateInfo?.month ?? null,
          release_day: dateInfo?.day ?? null,
        })
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
      // Documentary / DVD bonus / film / music video / photo gallery tracklists.
      // Skipinam visą Track listing block'ą, jei headline'as nurodo NE muzikos
      // turinį. Anksčiau Britney Spears Circus „bonus DVD" sekcija (su
      // „Making of the Album" 9:34min ir „Photo Gallery") praeidavo, nes
      // headline'e buvo „Deluxe edition (bonus DVD)" ir regex ieškojo tik
      // „documentary|film|making of" žodžių (be DVD/video/gallery).
      const hlLow = hl.toLowerCase()
      if (/\b(documentary|film|movie|featurette|trailer|interview|behind\s+the\s+scenes|making\s+of|music\s+video|video\s+album|photo\s+gallery|gallery|bonus\s+dvd|video\s+edition|videos?\b)\b/.test(hlLow)) return false
      // Standalone „DVD" žodžio fix — pvz „Circus – Deluxe edition (bonus DVD)"
      // headline'e bonus DVD jau aukščiau, bet kas jei tik DVD: „Disc 2: DVD"
      if (/\bdvd\b/i.test(hlLow)) return false
      const sectionBefore = getSectionBeforePos(wikitext, pos)
      if (/reissue|remaster|anniversary|box.?set|collector|deluxe|expanded|bonus|demo|outtake/i.test(sectionBefore)) return false
      // DVD/video/tour-edition extra sections — bare \bdvd\b (ne tik dvd2+)
      // ir tour\s+edition. Anksčiau Coldplay X&Y „Tour edition DVD ⟶ Audio
      // only section" praeidavo: sectionBefore = „track listing | tour
      // edition dvd | audio only section", o regex'as ieškojo tik dvd[2-9]
      // → match'o nerasdavo → 6 bonus track'us (Things I Don't Understand,
      // Pour Me Live, etc.) prilipdydavo prie main X&Y track listing'o.
      if (/\b(documentary|dvd|film|movie|featurette|trailer|interview|behind[- ]the[- ]scenes|making[- ]of|music\s+video|video\s+album|video\s+edition|photo\s+gallery|tour\s+edition)\b/i.test(sectionBefore)) return false
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
          // 2026-05-19: exclude video/DVD/gallery + bonus EP/disc 2 blocks from
          // singles second-pass. Originali second-pass intencija: pagauti
          // singles, kurių NĖRA original tracklist'e (rare edge case). Bet
          // bonus EP / disc 2 / bonus track blokai dažnai turi single-edit
          // ALTERNATE versijų toms pačioms dainoms — pvz Flash Gordon
          // Template 4 "Disc 2: Bonus EP (2011 Universal Music CD reissue)"
          // turi `title1="Flash"` kuris yra Flash single edit, o original
          // Template 1 turi `title1=[[Flash (Queen song)|Flash's Theme]]`
          // — TIE patys recording'ai skirtingais titles. Dedupe ("flashs
          // theme" vs "flash") nesusiveda → second-pass pridėjo "Flash"
          // kaip phantom track #19. Geriau šituos blokus iš viso skipinti
          // ir nepasitikėti, kad reissues turės "naujų" singles.
          const hlLow = hl.toLowerCase()
          if (/\b(documentary|film|movie|featurette|trailer|interview|behind\s+the\s+scenes|making\s+of|music\s+video|video\s+album|video\s+edition|photo\s+gallery|gallery|bonus\s+dvd|videos?\b|dvd)\b/.test(hlLow)) return false
          if (/\b(disc\s*\d+|bonus\s+ep|bonus\s+track|bonus\s+disc|bonus\s+disk)\b/i.test(hlLow)) return false
          const sectionBefore = getSectionBeforePos(wikitext, pos)
          if (/\b(documentary|dvd|film|movie|featurette|trailer|video\s+album|video\s+edition|photo\s+gallery)\b/i.test(sectionBefore)) return false
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
  // Wikipedia disambiguation parens — strip'inti VISKĄ, kas baigiasi
  // music-related role keyword'u, įskaitant nationality/language prefix'us.
  // Pvz „(Bulgarian singer)", „(American rapper)", „(English band)", etc.
  // Role keyword'ai: band, group, singer, rapper, duo, trio, artist,
  //   musician, entertainer, songwriter, composer, DJ, producer, vocalist.
  const ROLE_RE = /\s*\([^()]*\b(?:band|group|music(?:al)?\s*(?:group|act)?|singer|rapper|duo|trio|quartet|quintet|artist|musician|entertainer|songwriter|composer|DJ|producer|vocalist|rock\s*band|pop\s*group)\s*\)/gi
  let name = raw
    .replace(ROLE_RE, '')
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
      // Standalone template'ų vardai (kai display'us yra tik template ID
      // be argument'ų, pvz `[[br]]`, `[[small]]`). Reikalaujam $ anchor —
      // anksčiau regex'as buvo open-ended ir filtravo „Brian Johnson" (br
      // prefix), „Bradford" ir t.t.
      if (/^(plain ?list|flatlist|hlist|br|small|nowrap|ubl|refn|ref|cite)$/i.test(display)) continue
      if (wikiTitle.includes(':')) continue
      // Praleisti Wikipedia meta-list'us: "List of AC/DC members", "List of
      // former members of X" ir pan. AC/DC past_members = See [[list of
      // AC/DC members]] — anksčiau sukurdavo phantom artist'ą su tuo vardu.
      // Tikrinam ir wikiTitle, ir display — kartais alias ne-meta („Full
      // list" kaip alias to list article'i, todėl saugiau tikrinti raw title).
      const titleLow = lm[1].toLowerCase().trim()
      const displayLow = display.toLowerCase().trim()
      if (/^list of\b/.test(titleLow)) continue
      if (/\bmembers?$/.test(titleLow) && /^list of\b/.test(titleLow)) continue
      // "See" / "Full list" / "More" inline antraštės — sometimes used as
      // display aliases (`[[List of X members|Full list]]`) — atfiltruojam.
      if (/^(see|full list|more|see also|full)$/i.test(displayLow)) continue
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
  const all = ALL_SUBSTYLES()
  const substyles: string[] = []
  for (const g of genreLabels) {
    const norm = g.toLowerCase().trim().replace(/[-\s]+/g, '')
    const found = all.find(s => s.toLowerCase().replace(/[-\s]+/g, '') === norm)
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

// ─── AWARDS PARSER ────────────────────────────────────────────────────────────

export type AwardEntry = {
  channel: string         // "Grammy Awards", "Brit Awards"
  channelSlug: string     // "grammy-awards"
  year: number | null     // 2020
  category: string        // "Best Pop Vocal Album"
  work: string            // "Spirit" — album/song title or "Themselves"
  workType: 'album' | 'track' | 'video' | 'self' | 'unknown'
  result: 'won' | 'nominated' | 'inducted' | 'other'
  sourceLine?: string     // raw row, for debugging
}

const AWARD_RESULT_MAP: Record<string, AwardEntry['result']> = {
  won: 'won', win: 'won', winner: 'won',
  nom: 'nominated', nominated: 'nominated', nomination: 'nominated',
  shortlisted: 'nominated',
  inducted: 'inducted',
  pending: 'other', tba: 'other',
}

function awardsSlugify(s: string): string {
  return s.toLowerCase().trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** Strip wikilinks/templates to readable text, preserving displayed label. */
function awardsCleanCell(raw: string): string {
  let s = raw.trim()
  // {{Brit|1991}} → 1991
  s = s.replace(/\{\{[^|{}]+\|(\d{4})\}\}/g, '$1')
  // {{nom}}, {{won}}, etc — keep raw token for result detection
  s = s.replace(/\{\{(nom|won|shortlist[a-z]*|inducted|pending|tba)\b[^}]*\}\}/gi, '$1')
  // Remove other templates entirely
  s = s.replace(/\{\{[^{}]*\}\}/g, '')
  // [[X|Y]] → Y, [[X]] → X
  s = s.replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2')
  // Italic/bold
  s = s.replace(/'{2,}/g, '')
  // refs
  s = s.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '').replace(/<ref[^>]*\/>/gi, '')
  s = s.replace(/<[^>]+>/g, '')
  s = s.replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim()
  return s
}

function detectWorkType(workRaw: string, workClean: string): AwardEntry['workType'] {
  if (!workClean || /^themselves$/i.test(workClean) || /^self$/i.test(workClean)) return 'self'
  // Italics typically = album/film, quotes = song
  if (/'{2,}/.test(workRaw)) return 'album'
  if (/"[^"]+"/.test(workRaw) || /^"/.test(workRaw.trim())) return 'track'
  if (/video|film|tour/i.test(workClean)) return 'video'
  return 'unknown'
}

function detectResult(cell: string): AwardEntry['result'] {
  const low = cell.toLowerCase().trim()
  for (const k of Object.keys(AWARD_RESULT_MAP)) {
    if (low === k || low.startsWith(k)) return AWARD_RESULT_MAP[k]
  }
  return 'other'
}

function extractYear(cell: string): number | null {
  // Try direct 4-digit
  const m = cell.match(/\b(19|20)\d{2}\b/)
  return m ? parseInt(m[0]) : null
}

/**
 * Parse a Wikipedia "List of awards and nominations received by X" article.
 * Returns flat list of award entries grouped by channel (award type).
 *
 * Wikipedia format:
 *   == Grammy Awards ==
 *   {{awards table}}
 *   |- | year | work | category | {{nom|won}}
 *   |- ... (rowspan="N" carries first cell across N rows)
 *   {{end}}
 */
export function parseAwardsArticle(wikitext: string): AwardEntry[] {
  const out: AwardEntry[] = []
  if (!wikitext) return out

  // Find each "== Section ==" + content up to next "==" or end
  const sectionRe = /==+\s*([^=\n]+?)\s*==+\s*\n([\s\S]*?)(?=\n==+\s*[^=]|\n*$)/g
  let m: RegExpExecArray | null
  while ((m = sectionRe.exec(wikitext)) !== null) {
    const heading = awardsCleanCell(m[1]).trim()
    if (!heading || /references|external|notes|see also|footnotes|bibliography/i.test(heading)) continue
    const body = m[2]
    if (!/\{\{awards table\}\}/i.test(body)) continue

    const channel = heading
    const channelSlug = awardsSlugify(channel)

    // Extract content between {{awards table}} and {{end}}
    const tblMatch = body.match(/\{\{awards table\}\}([\s\S]*?)\{\{end\}\}/i)
    if (!tblMatch) continue

    const rows = tblMatch[1].split(/\n\|-\s*\n?/).map(r => r.trim()).filter(Boolean)

    // Track rowspan-spanned values across rows (cell index → { value, remaining })
    const carry: Record<number, { value: string; remaining: number }> = {}

    for (const row of rows) {
      // Row contains "| cell | cell | cell | cell" — split by leading pipe on new line OR " || "
      // Wikipedia table rows: each cell on its own line "| cell"
      // Let's parse by splitting on /\n\|/ but the first cell starts with "|"
      const text = row.replace(/^\|/, '')
      const cells = text.split(/\n\s*\|/).map(c => c.trim())

      // Build effective row: insert carried values at appropriate positions
      const effective: string[] = []
      let rawIdx = 0
      const expected = 4  // year, work, category, result
      for (let pos = 0; pos < expected; pos++) {
        if (carry[pos] && carry[pos].remaining > 0) {
          effective.push(carry[pos].value)
          carry[pos].remaining -= 1
          if (carry[pos].remaining === 0) delete carry[pos]
        } else if (rawIdx < cells.length) {
          let raw = cells[rawIdx]
          // rowspan="N" parsing — Wikipedia accepts both `rowspan="N"| value`
          // (pipe separator) AND `rowspan="N" value` (space). Match either.
          const rs = raw.match(/^rowspan\s*=\s*"?(\d+)"?\s*(?:\||\s)\s*([\s\S]*)/i)
          let val: string
          if (rs) {
            val = rs[2].trim()
            const span = parseInt(rs[1])
            if (span > 1) carry[pos] = { value: val, remaining: span - 1 }
          } else {
            val = raw
          }
          effective.push(val)
          rawIdx++
        } else {
          effective.push('')
        }
      }

      const [yearRaw, workRaw, catRaw, resRaw] = effective
      if (!yearRaw && !workRaw && !catRaw) continue

      const yearClean = awardsCleanCell(yearRaw)
      const workClean = awardsCleanCell(workRaw)
      const catClean = awardsCleanCell(catRaw)
      const resClean = awardsCleanCell(resRaw)

      const year = extractYear(yearClean)
      const result = detectResult(resClean)
      const workType = detectWorkType(workRaw, workClean)

      // Skip header rows / empty cells
      if (!catClean || catClean.length < 3) continue
      if (/^year$|^category$|^result$|^work$/i.test(catClean)) continue

      out.push({
        channel,
        channelSlug,
        year,
        category: catClean,
        work: workClean,
        workType,
        result,
        sourceLine: row.slice(0, 200),
      })
    }
  }

  return out
}
