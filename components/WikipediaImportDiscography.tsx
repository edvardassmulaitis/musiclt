'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useBackgroundTasks } from '@/components/BackgroundTaskContext'
import { COUNTRIES, SUBSTYLES } from '@/lib/constants'
import {
  cleanWikiText, extractFeaturing, parseFeaturing,
  parseMainPageDiscography, parseDiscographyPage, parseCertifications, parsePeakChartPosition,
  extractTrackListingsWithPos, getSectionBeforePos, isReissueBlock, isDiscBlock,
  parseSinglesFromInfobox, parseTracklist, parseAlbumGenres,
  type AlbumType, type CertificationEntry, type DiscographyItem, type TrackEntry, type SingleInfoboxData,
  initializeConstants,
} from '@/lib/wiki-parser'
import { matchGenresToSubstyleIds, type SubstyleRow } from '@/lib/genre-match'

// Initialize wiki-parser constants
initializeConstants(COUNTRIES, SUBSTYLES)

// ─── Tipai ────────────────────────────────────────────────────────────────────

type SingleSongItem = {
  title: string
  year: number | null
  month: number | null
  day: number | null
  albumTitle?: string
  featuredArtists?: string[]
  source: 'wikipedia'
  importing?: boolean
  imported?: boolean
  duplicate?: boolean
  duplicateId?: number
  error?: string
  selected: boolean
}


// ─── Konstantos ───────────────────────────────────────────────────────────────

const AUTO_SELECT_TYPES: AlbumType[] = ['studio']

// Lithuanian pluralization helper
// 1 → "1 albumą" (acc. sg), 2-9 → "2 albumus" (acc. pl), 10-20 → "11 albumų" (gen. pl)
// Pattern: ends in 1 (not 11) → albumą, ends in 2-9 (not 12-19) → albumus, else → albumų
function getLithuanianPlural(count: number, singular: string, plural2_9: string, plural10plus: string): string {
  const lastDigit = count % 10
  const lastTwoDigits = count % 100

  if (lastDigit === 1 && lastTwoDigits !== 11) {
    return `${count} ${singular}`
  } else if (lastDigit >= 2 && lastDigit <= 9 && (lastTwoDigits < 12 || lastTwoDigits > 19)) {
    return `${count} ${plural2_9}`
  } else {
    return `${count} ${plural10plus}`
  }
}

// ─── DiscModal — mobile fullscreen, desktop centered ──────────────────────────
function DiscModal({ children }: { children: React.ReactNode }) {
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)')
    setIsDesktop(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  if (isDesktop) {
    return (
      <div style={{
        position: 'relative', zIndex: 10002,
        width: '100%', maxWidth: '48rem',
        maxHeight: '85vh', marginTop: '8vh',
        display: 'flex', flexDirection: 'column',
        background: 'white', overflow: 'hidden',
        borderRadius: '1rem',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
      }}>
        {children}
      </div>
    )
  }
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      zIndex: 10002, display: 'flex', flexDirection: 'column',
      background: 'white', overflow: 'hidden',
    }}>
      {children}
    </div>
  )
}

// ─── Wikipedia utils ──────────────────────────────────────────────────────────

// 2026-06-02: Kai kurie atlikėjai (Alexandra Capitanescu — ro) wrap'ina single
// pavadinimus į `{{lang|XX|Tekstas|i=unset}}` template'us. parseSinglesSection
// quoted-title kelias (`"{{lang|ro|Nu pot|i=unset}}"`) ėmė qm[1] raw → title
// likdavo „{{lang|ro|Nu pot|i=unset}}". cleanWikiText tai išsprendžia, BET jis
// strip'ina trailing apostrofą („Căpitanu'" → „Căpitanu"), kuris ro pavadinimuose
// reikšmingas. Šis helper'is resolve'ina lang/transl/nihongo template'us
// IŠLAIKYDAMAS apostrofą. Atitinka cleanWikiText lang regex'us.
function resolveLangTemplates(s: string): string {
  if (!s || !s.includes('{{')) return s
  return s
    .replace(/\{\{lang-[a-z]+\s*\|\s*([^}|]+?)\s*(?:\|[^}]*)?\}\}/gi, '$1')
    .replace(/\{\{lang\s*\|\s*[^|}]+\s*\|\s*([^}|]+?)\s*(?:\|[^}]*)?\}\}/gi, '$1')
    .replace(/\{\{rtl-lang\s*\|\s*[^|}]+\s*\|\s*([^}|]+?)\s*(?:\|[^}]*)?\}\}/gi, '$1')
    .replace(/\{\{transl\s*\|\s*[^|}]+\s*\|\s*(?:[^|}]+\s*\|\s*)?([^}|]+?)\s*\}\}/gi, '$1')
    .replace(/\{\{nihongo\s*\|\s*([^|}]+?)\s*(?:\|[^}]*)?\}\}/gi, '$1')
    .trim()
}

function extractWikiTitle(input: string): string {
  const m = input.match(/wikipedia\.org\/wiki\/([^#?]+)/)
  if (m) return decodeURIComponent(m[1])
  return input.trim().replace(/ /g, '_')
}

async function fetchWikitext(title: string): Promise<string> {
  const res = await fetch(
    `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=revisions&rvprop=content&rvslots=main&format=json&origin=*&redirects=1`
  )
  const json = await res.json()
  const page = Object.values(json.query?.pages || {})[0] as any
  if (page?.missing) return ''
  return page?.revisions?.[0]?.slots?.main?.['*'] || page?.revisions?.[0]?.['*'] || ''
}

async function uploadToStorage(url: string): Promise<string> {
  if (!url || url.includes('supabase')) return url
  try {
    const res = await fetch('/api/fetch-image', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    if (res.ok) {
      const d = await res.json()
      if (d.url && !d.url.startsWith('data:') && d.url.includes('supabase')) return d.url
      if (d.error) console.warn('fetch-image error:', d.error)
    }
  } catch {}
  return url
}

async function fetchCoverImage(wikiTitle: string): Promise<string> {
  try {
    // Naudoti REST summary API — tas pats kaip WikipediaImport.tsx (veikia atlikėjams)
    const sumRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`)
    if (sumRes.ok) {
      const sum = await sumRes.json()
      const thumbUrl = sum.originalimage?.source || sum.thumbnail?.source
      if (thumbUrl) return uploadToStorage(thumbUrl)
    }
    // Fallback: MediaWiki API
    const r2 = await fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(wikiTitle)}&prop=pageimages&pithumbsize=500&piprop=thumbnail&format=json&origin=*`)
    const j2 = await r2.json()
    const p2 = Object.values((j2.query?.pages || {}))[0] as any
    if (p2?.thumbnail?.source) return uploadToStorage(p2.thumbnail.source)
  } catch {}
  return ''
}

// ─── Text parsing ─────────────────────────────────────────────────────────────

// Album-type subsekcijos (Studio albums, EPs, Singles, Live album, Concert
// films, Music videos, ...) NĖRA atskiri atlikėjai — tai tik diskografijos
// kategorijos. Be šito filtro band'ai, kurių diskografija turi depth-3
// album-type sekcijas (pvz The Warning), klaidingai rodydavo „grupių
// pasirinkimą". Substring match (be \b) — "films"/"videos"/"singles" plural'ai
// laužytų word-boundary; `\beps?\b` saugo nuo "deep"/"epic" false-positive.
const ALBUM_TYPE_SECTION = /studio|album|single|extended\s*play|compilation|\blive\b|concert|remix|cover|tribute|soundtrack|\bscore|holiday|christmas|\bdemo|mixtape|reissue|greatest|best\s*of|collection|video|dvd|\bbox\b|chart|film|\beps?\b|discograph/i

function hasMultipleArtistSections(wikitext: string): string[] {
  const groups: string[] = []
  let inDisc = false
  for (const line of wikitext.split('\n')) {
    const h = line.match(/^(==+)\s*(.+?)\s*\1/)
    if (!h) continue
    const depth = h[1].length, title = h[2].toLowerCase()
    if (title.includes('discograph')) { inDisc = true; continue }
    if (depth === 2 && inDisc) break
    if (inDisc && depth === 3 && !ALBUM_TYPE_SECTION.test(h[2])) groups.push(h[2].trim())
  }
  return groups
}

// ─── Wikipedia album parsers ──────────────────────────────────────────────────


/** Iš scope="row" eilutės po <br> ištraukti featured artistų vardus */
function parseFeaturedArtists(fullLine: string): string[] {
  // Paimti viską po <br> arba {{small|
  const brMatch = fullLine.match(/<br\s*\/?\s*>(.*)/i)
  if (!brMatch) return []
  const afterBr = brMatch[1]
  // Pašalinti HTML tagus bet palikti wiki links
  const cleaned = afterBr
    .replace(/<[^>]+>/g, '')
    .replace(/\{\{small\|/gi, '')
    .replace(/\}\}/g, '')
    .trim()
  // Tikrinti ar tai featuring/with/and pattern
  if (!/(?:feat(?:uring)?|with|and|&)\s/i.test(cleaned)) return []
  // Surinkti wiki links kaip artistų vardus
  const artists: string[] = []
  const linkRe = /\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(afterBr)) !== null) {
    const name = cleanWikiText(m[2] || m[1])
      .replace(/\s*\((?:singer|rapper|musician|entertainer|DJ|band|group|American|British)\)/gi, '')
      .trim()
    if (name && name.length > 1 && name.length < 60) artists.push(name)
  }
  // Jei nėra wiki links — bandyti iš teksto
  if (artists.length === 0) {
    const textMatch = cleaned.match(/(?:feat(?:uring)?\.?|with)\s+(.+)/i)
    if (textMatch) {
      const parts = textMatch[1]
        .replace(/[()]/g, '')
        .split(/\s*(?:,\s*|\s+and\s+|\s*&\s*)/i)
        .map(s => s.trim())
        .filter(s => s.length > 1 && s.length < 60)
      artists.push(...parts)
    }
  }
  return artists
}

// ─── Wiki table cell helpers ──────────────────────────────────────────────────
// 2026-05-18: parseSinglesSection Year-first formato lūžio fix.
// MediaWiki table cell'ai: `|attrs|content` arba `|content`. Naive `split('|')`
// laužia (a) wiki link rename'us [[Page|Display]], (b) {{templates|args}},
// (c) cell attributes prieš content. Reikia depth-aware split + attr-segment skip.

/**
 * Split wiki table row line on cell delimiters `|`, preserving `[[wiki|links]]`
 * ir `{{templates|args}}` kuriose `|` naudojamas viduje.
 */
function splitWikiCells(line: string): string[] {
  const out: string[] = []
  let depth = 0
  let buf = ''
  let i = 0
  if (line.startsWith('|') && !line.startsWith('||')) i = 1
  while (i < line.length) {
    const c = line[i], c2 = line[i+1]
    if ((c === '[' && c2 === '[') || (c === '{' && c2 === '{')) { depth++; buf += c + c2; i += 2; continue }
    if ((c === ']' && c2 === ']') || (c === '}' && c2 === '}')) { depth = Math.max(0, depth - 1); buf += c + c2; i += 2; continue }
    if (depth === 0 && c === '|' && c2 === '|') { if (buf.trim()) out.push(buf.trim()); buf = ''; i += 2; continue }
    if (depth === 0 && c === '|') { if (buf.trim()) out.push(buf.trim()); buf = ''; i++; continue }
    buf += c; i++
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}

/** Skip leading cell-attribute segments (align=, rowspan=, style=, ...). */
function findContentSegIdx(segs: string[]): number {
  let idx = 0
  while (idx < segs.length) {
    if (/^(?:[a-z-]+\s*=\s*(?:["'][^"']*["']|\d+)\s*)+$/i.test(segs[idx])) { idx++; continue }
    break
  }
  return idx
}

/**
 * Parse year line accepting `|YEAR`, `|attrs|YEAR`, `|rowspan="N"|YEAR`,
 * `|align="center" rowspan=4|YEAR`. Returns {year, rowspan} or null.
 */
function parseYearCellLine(line: string): { year: number; rowspan: number } | null {
  const segs = splitWikiCells(line)
  if (segs.length === 0) return null
  const idx = findContentSegIdx(segs)
  let rowspan = 1
  for (let k = 0; k < idx; k++) {
    const rsM = segs[k].match(/rowspan\s*=\s*["']?(\d+)["']?/i)
    if (rsM) rowspan = parseInt(rsM[1])
  }
  if (idx >= segs.length) return null
  const yM = segs[idx].match(/^((?:19|20)\d{2})$/)
  return yM ? { year: parseInt(yM[1]), rowspan } : null
}

// ─── Singlų parsavimas ────────────────────────────────────────────────────────
// Palaiko du Wikipedia formatus:
//   A) "Title-first": ! scope="row"| "Title" → kita eilutė = metai (Queen stilius)
//   B) "Year-first": Year stulpelis pirmas, Title stulpelis antras (Freddie Mercury stilius)
// Metai gali turėti rowspan — tada galioja kelioms eilutėms.
// Skip'ina visas depth-3 sub-sekcijas IŠSKYRUS dešimtmečius (1970s etc.)

function parseSinglesSection(wikitext: string): SingleSongItem[] {
  const singles: SingleSongItem[] = []
  const lines = wikitext.split('\n')

  let inSingles = false
  let inTable = false
  let skipSubSection = false
  // Gylis, kuriame prasidėjo Singles sekcija (2 arba 3). Reikia, kad žinotume
  // kada sekcija baigiasi: bet koks header'is depth <= singlesDepth (ne pats
  // „Singles") = pabaiga; depth > singlesDepth = sub-sekcija.
  let singlesDepth = 2

  // Metų sekimas su rowspan palaikymu
  let currentYear: number | null = null
  let yearRowspan = 0

  // Title-first formato sekimas
  let pendingTitle: string | null = null
  let pendingAlbum: string | undefined = undefined
  let pendingFeatured: string[] | undefined = undefined
  let pendingYearLine = false

  // Albumo rowspan sekimas — pvz. ''Queen'' rowspan=2 apima Keep Yourself Alive + Liar
  let currentAlbum: string | undefined = undefined
  let albumRowspan = 0

  // Year-first formatas
  let hasYearCol = false
  // 2026-06-02: Ar ŠI lentelė naudoja `! scope="row"` title'us (title-first).
  // Jei taip — year-first `|`-cell title ekstrakcija NETURI veikti, nes
  // chart-position cell'ai su {{efn}} footnote'ais (cituojančiais „[[Bubbling
  // Under Hot 100]]" + ''Billboard'' + „Title") generuodavo fake singlus
  // (Bella Kay: „Bubbling"). Reset'inam ant kiekvienos naujos lentelės.
  let sawScopeRow = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // ── Headers ──────────────────────────────────────────────────────────────
    const hm = line.match(/^(==+)\s*(.+?)\s*\1/)
    if (hm) {
      const depth = hm[1].length
      const h = hm[2].toLowerCase()
      const hRaw = hm[2]

      // Singles sekcija gali būti depth 2 (==Singles==) ARBA depth 3
      // (===Singles=== po ==Discography==, pvz. Gigi Perez). Anksčiau tik
      // depth===2 → nested singles visiškai praleidžiami (0 singlų rasta).
      // 2026-06-18: dedikuoti „X singles discography" puslapiai (Rihanna, Beyoncé,
      // Taylor Swift, Eminem ir t.t.) NETURI ==Singles== header'io — singlai
      // sugrupuoti po ==As lead artist== / ==As solo artist== (su ===2000s===
      // dešimtmečių sub-sekcijomis). Anksčiau gate'as reikalavo literaliai
      // „Singles" → inSingles niekada neaktyvuodavosi → 0 singlų. Pridėtas
      // „As lead/solo (artist)" startas. „As featured artist" sąmoningai NEimamas
      // (žemiau depth<=singlesDepth uždaro sekciją), kaip ir anksčiau.
      if ((/^singles?\s*$/i.test(h) || /^as (?:lead|solo)(?: artist)?\s*$/i.test(h)) && (depth === 2 || depth === 3)) {
        inSingles = true; singlesDepth = depth; skipSubSection = false; hasYearCol = false
        currentYear = null; yearRowspan = 0; pendingTitle = null; pendingAlbum = undefined; pendingFeatured = undefined; pendingYearLine = false
        continue
      }
      if (inSingles && depth <= singlesDepth) { inSingles = false; inTable = false; continue }
      if (inSingles && depth > singlesDepth) {
        if (/^\d{4}s?\s*$/i.test(hRaw.trim())) {
          // Dešimtmetis — reset ir tęsiame
          skipSubSection = false; hasYearCol = false
          currentYear = null; yearRowspan = 0; pendingTitle = null; pendingAlbum = undefined; pendingFeatured = undefined; pendingYearLine = false
        } else if ((/as lead|as solo|promotional|charity|other single|\bsingles?\b/i.test(h)) && !/as featured/i.test(h)) {
          // Valid singles subsections — continue parsing:
          //  • "As lead artist" / "As solo artist"
          //  • Kalbinės/regioninės sub-sekcijos: "Korean singles", "Japanese
          //    singles", "English singles" (K-pop grupės kaip Le Sserafim — be
          //    šito visi singlai dingdavo, nes `\bsingles?\b` nesutapdavo su
          //    siaurais pattern'ais → skipSubSection=true → 0 singlų).
          // Skip "As featured artist" — tik lead artist singlai aktualūs.
          skipSubSection = false; hasYearCol = false; inTable = false
          currentYear = null; yearRowspan = 0; pendingTitle = null; pendingAlbum = undefined; pendingFeatured = undefined; pendingYearLine = false
        } else {
          skipSubSection = true
        }
        continue
      }
      continue
    }

    if (!inSingles || skipSubSection) continue

    // 2026-06-11: Bullet-list singlai. Daugelis grupių (The Sound, senesnės
    // punk/post-punk grupės) turi singlus NE wikitable, o bullet formatu:
    //   * "Title"/"B-side" (YYYY, Label)
    //   * "Title" (YYYY)
    // Anksčiau `if (!inTable) continue` praleidžia visas ne-table eilutes →
    // bullet-list singlai niekada nebuvo parse'inami.
    if (!inTable && (line.startsWith('*') || line.startsWith('#'))) {
      // Match: * "Title" ... (YYYY ...)
      let title: string | null = null
      const bm = line.match(/^[*#]\s*"([^"]+)"/)
      if (bm) {
        title = bm[1].trim()
      } else {
        // 2026-06-15: italic formatas `* ''Title'' (YYYY)` (pvz Sam Garrett
        // singlai: `* ''I Am Loving You'' (2018)`). Anksčiau tik double-quote
        // `"Title"` buvo atpažįstamas → italic-only singlai dingdavo.
        const im = line.match(/^[*#]\s*''+\s*(.+?)\s*''+/)
        if (im) {
          title = cleanWikiText(im[1]).trim()
        } else {
          // Plain-text fallback `* Title (YYYY)` — TIK jei yra metai, kad
          // nepagautume „main article" ar kitų ne-singlinių bullet'ų.
          const pm = line.match(/^[*#]\s*(.+?)\s*\([^)]*?\d{4}[^)]*\)/)
          if (pm) {
            const cand = cleanWikiText(pm[1]).replace(/'{2,}/g, '').trim()
            if (cand && cand.length >= 2 && !/^(see |main article)/i.test(cand)) title = cand
          }
        }
      }
      if (title) {
        const yearM = line.match(/\((?:[^)]*?)(\d{4})\b/)
        const year = yearM ? parseInt(yearM[1]) : null
        singles.push({ title, year, month: null, day: null, source: 'wikipedia', selected: true })
      }
      continue
    }

    if (line.startsWith('{|')) { inTable = true; hasYearCol = false; sawScopeRow = false; currentYear = null; yearRowspan = 0; pendingTitle = null; pendingAlbum = undefined; pendingFeatured = undefined; pendingYearLine = false; continue }
    if (line.startsWith('|}')) { inTable = false; continue }
    if (!inTable) continue

    // ── Lentelės header eilutės ───────────────────────────────────────────────
    if (line.startsWith('!') && !/!\s*[—–-]?\s*scope\s*=\s*['"]row['"]/i.test(line)) {
      // Detektuoti Year stulpelį header eilutėje
      if (/\bYear\b/i.test(line)) { hasYearCol = true; continue }
      // Paprastas ! header be scope — gali būti daina (pvz. 2020s lentelė)
      // Tik jei turi kabutes — Wikipedia konvencija singlams
      const cleanH = line
        .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
        .replace(/<ref[^/]*\/>/gi, '')
      const qm = cleanH.match(/!\s*"([^"]+)"\s*(.*)/)
      if (qm && hasYearCol) {
        // Strip featured artist info prieš suffix parsavimą
        const suffixBeforeBr = qm[2].replace(/<br\s*\/?\s*>.*/i, '').replace(/\{\{small\|.*$/i, '')
        const rawSuffix = suffixBeforeBr.replace(/<[^>]+>/g, '').replace(/\{\{[^}]*\}\}/g, '').replace(/\[\d+\]/g, '').trim()
        const simpleSuffix = rawSuffix.match(/^(\([^)]{1,50}\))/)
        let title = simpleSuffix ? `${qm[1]} ${simpleSuffix[1]}` : qm[1]
        title = resolveLangTemplates(title).replace(/\s*[\[(](?:re-?release|re-?issue)[)\]]/gi, '').trim()
        const feat = parseFeaturedArtists(cleanH)
        if (title && title.length > 1) {
          // Albumą rasime iš vėlesnių eilučių
          let albumTitle: string | undefined
          for (let k = i + 1; k < Math.min(i + 20, lines.length); k++) {
            const nl = lines[k]
            if (/^\s*\|-/.test(nl) || nl.startsWith('!')) break
            if (/^\|/.test(nl) && !/^\|\|/.test(nl)) {
              if (/Non-album/i.test(nl)) { albumTitle = 'Non-album single'; break }
              const alm = nl.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '').match(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/)
              if (alm) {
                const p = cleanWikiText(alm[2] || alm[1])
                if (p && !/^\d+$/.test(p) && !/^[-–—]$/.test(p) && p.length > 2 && p !== title) {
                  albumTitle = p; break
                }
              }
            }
          }
          if (yearRowspan > 0) {
            singles.push({ title, year: currentYear, month: null, day: null, albumTitle, featuredArtists: feat.length > 0 ? feat : undefined, source: 'wikipedia', selected: false })
          } else {
            pendingTitle = title
            pendingAlbum = albumTitle
            pendingFeatured = feat.length > 0 ? feat : undefined
            pendingYearLine = true
          }
        }
      }
      continue
    }

    // ── Row separator |- ──────────────────────────────────────────────────────
    // 2026-06-02: row sep gali turėti atributus, pvz `|- style="font-size:smaller;"`
    // (Chris Stapleton). Anksčiau `=== '|-'` to nepagaudavo → eilutė būdavo
    // apdorojama kaip cell'as ir `"font-size:smaller;"` (cituota CSS reikšmė)
    // tapdavo „singlu". `/^\s*\|-/` apima ir styled row sep'us.
    if (/^\s*\|-/.test(line)) {
      if (yearRowspan > 1) yearRowspan--
      else if (yearRowspan === 1) yearRowspan = 0
      if (albumRowspan > 1) albumRowspan--
      else if (albumRowspan === 1) { albumRowspan = 0; currentAlbum = undefined }
      continue
    }

    // ── scope="row" eilutė — DAINA (Title-first, pvz. Queen 1970s-1990s) ─────
    if (/^!\s*[—–-]?\s*scope\s*=\s*['"]row['"]/i.test(line)) {
      // Title-first lentelė — year-first `|`-cell ekstrakcija šiai lentelei OFF.
      sawScopeRow = true
      // Pašalinti <ref>...</ref> blokus prieš parsavimą (juose gali būti [[wiki links]])
      const cleanLine = line
        .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
        .replace(/<ref[^/]*\/>/gi, '')

      // Paimti viską po scope="row"|
      const afterScope = cleanLine.replace(/^.*scope\s*=\s*['"]row['"]\s*\|?\s*/i, '').trim()

      // Surinkti wiki links TIK iš pavadinimo dalies (prieš <br) — ne iš featured artistų
      // pvz. "[[Stay with Me]]"<br>{{small|(with [[Calvin Harris]])}} → tik "Stay with Me"
      // BUG: anksčiau <span> markup nebuvo strip'inamas. Metallica
      // "The View"<span ...> (with [[Lou Reed]])</span> — wiki-link regex
      // surinkdavo IR "The View" IR "Lou Reed" → 2 atskiri singlai vietoj 1.
      // Fix: strip'inam <span>...</span>, taip pat featuring-style parens
      // su 'with' / 'featuring' / 'feat'.
      let titlePortion = afterScope
        .replace(/<br\s*\/?\s*>.*/i, '')
        .replace(/\{\{small\|.*$/i, '')
        .replace(/<span[^>]*>[\s\S]*?<\/span>/gi, '')
        .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, '')
        // <small>...</small> — paprastai meta info, pvz. "(Bolivia-only release)",
        // "(Japan-only release)", "(promo)" — strip'inam visiškai, kitaip likdavo
        // prikabintas prie title kaip suffix.
        .replace(/<small[^>]*>[\s\S]*?<\/small>/gi, '')
        // {{efn|...}}, {{efn-ua|...}}, {{notetag|...}}, {{ref|...}} — footnote
        // šablonai. Juose dažnai būna [[James Bond]], [[soundtrack album]] ar
        // kitokie wikilinks, kuriuos parser'is paima kaip atskirus title parts.
        // Pvz a-ha "The Living Daylights" efn'e cituojami James Bond filmas
        // bei Stay on These Roads albumas → atsirasdavo kaip „singlai".
        .replace(/\{\{(?:efn(?:-[a-z]+)?|notetag|note|ref|sfn)[^{}]*\}\}/gi, '')
        // featuring artistų parens po pagrindinio title — taip pat strip'inti
        // kad ne-title wiki-link'ai nebūtų agreguojami
        .replace(/\s*\((?:with|feat(?:uring)?\.?|ft\.?)\s+[^)]+\)/gi, '')
        // 2026-06-02: INLINE (be parens) featuring PO closing quote, pvz Quevedo
        // `"La Graciosa" with [[Elvis Crespo]]` — nukerpam ` with [[...]]` kad
        // [[Elvis Crespo]] netaptų title'u (anksčiau allLinks paimdavo jį vietoj
        // „La Graciosa"). TIK kai prieš ` with/feat/ft` yra closing quote — todėl
        // title'as „Dancing with Myself" (be trailing featuring) NEpaliečiamas.
        .replace(/("[^"]+")\s+(?:with|feat(?:uring)?\.?|ft\.?)\s+.*$/i, '$1')
      // 2026-06-02: Wiki link'us renkam TIK iš paren-depth 0 (NE iš skliaustelių
      // viduje). Pvz Chris Stapleton `"[[The Star-Spangled Banner]] (Live from
      // [[Super Bowl LVII]])"` — anksčiau allLinks paimdavo IR „Super Bowl LVII"
      // → split per " / " → fake antras singlas. `[[...]]` token'as suvalgomas
      // atomiškai (pirma alternatyva), tad `(` iš `[[Title (song)|...]]` viduje
      // neskaičiuojamas kaip paren depth. Double-A-side `"[[X]]" / "[[Y]]"` —
      // abu depth 0 → vis dar split'inami.
      const allLinks: string[] = []
      const tokRe = /\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]|[()]/g
      let parenDepth = 0
      let lm: RegExpExecArray | null
      while ((lm = tokRe.exec(titlePortion)) !== null) {
        if (lm[0] === '(') { parenDepth++; continue }
        if (lm[0] === ')') { parenDepth = Math.max(0, parenDepth - 1); continue }
        if (parenDepth === 0) allLinks.push(cleanWikiText(lm[2] || lm[1]))
      }

      let rawTitle = ''
      if (allLinks.length > 0) {
        rawTitle = allLinks.join(' / ')
        // Suffix: pirmas (...) parenthetical (po depth-0 title), resolve'inant
        // wiki link'us viduje į tekstą — pvz „(Live from Super Bowl LVII)".
        const parenSuffix = titlePortion.match(/\(([^()]*(?:\[\[[^\]]*\]\][^()]*)*)\)/)
        if (parenSuffix) {
          const sfx = cleanWikiText(parenSuffix[1]).replace(/\s+/g, ' ').trim()
          // tik trumpi, prasmingi qualifier'iai (Live/Version/Mix/Remix/with...)
          if (sfx && sfx.length <= 40 && !/^\d/.test(sfx) && /\b(live|version|mix|remix|edit|acoustic|remaster|demo|with|from)\b/i.test(sfx)) {
            rawTitle += ` (${sfx})`
          }
        } else {
          // Fallback: paprastas skliaustelių suffix po paskutinio link'o (be wiki markup)
          const afterLastLink = titlePortion.replace(/.*\]\]/, '').replace(/<[^>]+>/g, '').replace(/\{\{[^}]*\}\}/g, '').trim()
          const simpleSuffix = afterLastLink.match(/^\s*(\([^)]{1,40}\))/)
          if (simpleSuffix) rawTitle += ' ' + simpleSuffix[1].trim()
        }
      } else {
        // Kabučių pavadinimas: "Title" arba "Title" (Suffix)
        // Naudojame titlePortion (be <br> ir featured artistų) — kad negautume "(with [[Artist]])" kaip suffix
        const qm = titlePortion.match(/^"([^"]+)"\s*(.*)/)
        if (qm) {
          // Suffix: pasiimame tik paprastą skliaustelių suffix, be wiki markup
          const rawSuffix = qm[2].replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '').replace(/<[^>]+>/g, '').replace(/\{\{[^}]*\}\}/g, '').replace(/\[\d+\]/g, '').trim()
          const simpleSuffix = rawSuffix.match(/^(\([^)]{1,50}\))/)
          rawTitle = simpleSuffix ? `${qm[1]} ${simpleSuffix[1]}` : qm[1]
        } else {
          const pm = titlePortion.match(/'{2,3}([^']+)'{2,3}/)
          if (pm) rawTitle = cleanWikiText(pm[1])
        }
      }

      rawTitle = resolveLangTemplates(rawTitle).replace(/\s*[\[(](?:re-?release|re-?issue)[)\]]/gi, '').trim()
      if (!rawTitle || rawTitle.length < 2 || rawTitle.toLowerCase() === 'row') continue
      // Skip jei tai EP/albumas pavadinimas, ne daina
      if (/\bE\.?P\.?\s*$/i.test(rawTitle)) continue

      // Featured artistai iš <br> dalies
      let featuredArtists = parseFeaturedArtists(cleanLine)
      // 2026-06-02: inline featuring po quoted title (be <br>), pvz
      // `"La Graciosa" with [[Elvis Crespo]]` — parseFeaturedArtists ieško tik
      // <br> dalies, tad inline atveju papildomai ištraukiam wikilink'uotus
      // artistus iš afterScope po `with/feat/ft`.
      if (!featuredArtists.length) {
        const inlineM = afterScope.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
          .match(/"[^"]+"\s+(?:with|feat(?:uring)?\.?|ft\.?)\s+(.+)$/i)
        if (inlineM) {
          const names: string[] = []
          const lr = /\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g
          let mm: RegExpExecArray | null
          while ((mm = lr.exec(inlineM[1])) !== null) {
            const n = cleanWikiText(mm[2] || mm[1]).replace(/\s*\((?:singer|rapper|musician|band|singer-songwriter)\)/gi, '').trim()
            if (n && n.length > 1 && n.length < 50) names.push(n)
          }
          if (names.length) featuredArtists = names
        }
      }

      // Split dvigubų singlų per " / " — kiekvienas tampa atskira daina
      const titleParts = rawTitle.split(/\s*\/\s*/).map(t => t.replace(/^["'\s]+|["'\s]+$/g, '').trim()).filter(t => t.length > 1)
        .filter(t => !/\bE\.?P\.?\s*$/i.test(t))  // skip EP pavadinimus

      // Albumą rasime iš vėlesnių eilučių (lookahead)
      let albumTitle: string | undefined
      for (let k = i + 1; k < Math.min(i + 30, lines.length); k++) {
        const nl = lines[k]
        if (/^\s*\|-/.test(nl) || /!\s*[—–-]?\s*scope\s*=\s*['"]row['"]/i.test(nl) || (nl.startsWith('!') && !nl.startsWith('!!'))) break
        if (/^\|/.test(nl) && !/^\|\|/.test(nl)) {
          if (/Non-album/i.test(nl)) { albumTitle = 'Non-album single'; break }
          if (/^\|\s*(?:rowspan\s*=\s*["']?\d+["']?\s*\|)?\s*((?:19|20)\d{2})\s*$/.test(nl)) continue
          if (/^\|\s*[-–—]\s*$/.test(nl) || /^\|\s*\|\|/.test(nl)) continue
          // 2026-06-02: Strip'inti {{efn}}/{{refn}}/footnote šablonus PRIEŠ album
          // lookahead. Chart-position cell'ai dažnai būna `| —{{efn|...„X" did not
          // enter ''Billboard'' ... [[Bubbling Under Hot 100]] chart}}` — be šito
          // album lookahead paimdavo chart-body wiki-link'ą („Bubbling Under Hot
          // 100") arba ''Billboard'' kaip albumą (Bella Kay). Po strip'o lieka
          // `| —` → praleidžiam ir ieškom toliau tikro album cell'o.
          const nlNoNote = nl.replace(/\{\{(?:efn|refn|notetag|note|sfn)[^{}]*(?:\{\{[^{}]*\}\}[^{}]*)*\}\}/gi, '')
          if (/^\|\s*[-–—]?\s*$/.test(nlNoNote)) continue
          const nlClean = nlNoNote.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
          // Patikrinti rowspan albumui
          const rsM = nl.match(/rowspan\s*=\s*["']?(\d+)["']?/)
          const rsCount = rsM ? parseInt(rsM[1]) : 1
          const alm = nlClean.match(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/)
          if (alm) {
            const p = cleanWikiText(alm[2] || alm[1])
            if (p && !/^\d+$/.test(p) && !/^[-–—]$/.test(p) && p.length > 2) {
              albumTitle = p
              if (rsCount > 1) { currentAlbum = p; albumRowspan = rsCount }
              break
            }
          }
          const im = nlClean.match(/'{2,3}([^']+)'{2,3}/)
          if (im) {
            const p = cleanWikiText(im[1])
            // Albumas gali turėti tą patį pavadinimą kaip daina (pvz. "Innuendo" singlas ir "Innuendo" albumas)
            // Todėl netikrinime ar p !== title — tiesiog tikriname ar tai ne skaičius/brūkšnelis
            if (p && p.length > 2 && !/^\d+$/.test(p) && !/^[-–—]$/.test(p)) {
              albumTitle = p
              if (rsCount > 1) { currentAlbum = p; albumRowspan = rsCount }
              break
            }
          }
        }
      }
      // Jei lookahead nerado albumo — naudoti currentAlbum iš rowspan
      if (!albumTitle && currentAlbum && albumRowspan > 0) albumTitle = currentAlbum

      // 2026-06-16: lentelės BE Year stulpelio, kuriose metai yra „Details"
      // cell'o `* Released: <date>" eilutėje (Fenix Flexin). Tokiose lentelėse
      // nėra `| YYYY` cell'o, todėl pendingTitle niekada neflush'inamas →
      // likdavo TIK paskutinis singlas. Ištraukiam datą iš lookahead'o ir
      // push'inam IŠKART.
      let relYear: number | null = null, relMonth: number | null = null, relDay: number | null = null
      if (!hasYearCol) {
        const MONTHS: Record<string, number> = { january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12 }
        for (let k = i + 1; k < Math.min(i + 30, lines.length); k++) {
          const nl = lines[k]
          if (/^\s*\|-/.test(nl) || /!\s*[—–-]?\s*scope\s*=\s*['"]row['"]/i.test(nl) || nl.startsWith('|}') || nl.startsWith('{|')) break
          // „Released: Month DD, YYYY" (US) arba „Released: DD Month YYYY" (intl)
          const relUS = nl.match(/[Rr]elease[d]?[^|{}]*?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s*(\d{4})/i)
          if (relUS) { relMonth = MONTHS[relUS[1].toLowerCase()] || null; relDay = parseInt(relUS[2]); relYear = parseInt(relUS[3]); break }
          const relINT = nl.match(/[Rr]elease[d]?[^|{}]*?(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i)
          if (relINT) { relDay = parseInt(relINT[1]); relMonth = MONTHS[relINT[2].toLowerCase()] || null; relYear = parseInt(relINT[3]); break }
          const relY = nl.match(/[Rr]elease[d]?[^|{}]*?\b((?:19|20)\d{2})\b/)
          if (relY) { relYear = parseInt(relY[1]); break }
        }
      }

      // Metai
      if (!hasYearCol && relYear !== null) {
        for (const t of titleParts) {
          singles.push({ title: t, year: relYear, month: relMonth, day: relDay, albumTitle, featuredArtists: featuredArtists.length > 0 ? featuredArtists : undefined, source: 'wikipedia', selected: false })
        }
      } else if (yearRowspan > 0) {
        for (const t of titleParts) {
          singles.push({ title: t, year: currentYear, month: null, day: null, albumTitle, featuredArtists: featuredArtists.length > 0 ? featuredArtists : undefined, source: 'wikipedia', selected: false })
        }
      } else {
        // Laukti metų iš kitos eilutės — saugoti visus
        pendingTitle = titleParts.join('\n')  // \n kaip separator
        pendingAlbum = albumTitle
        pendingFeatured = featuredArtists.length > 0 ? featuredArtists : undefined
        pendingYearLine = true
      }
      continue
    }

    // ── Eilutė su | duomenimis ────────────────────────────────────────────────
    if (line.startsWith('|') && !line.startsWith('||')) {

      // Metų eilutė: |1973  arba  |rowspan="3"|1974  arba  |align="center"|1985
      // arba  |align="center" rowspan=4|1985 — naudoti parseYearCellLine
      // helper'į kad cell attributes nebūtų laikomi non-year content'u.
      const yc = parseYearCellLine(line)
      if (yc) {
        currentYear = yc.year
        yearRowspan = yc.rowspan
        if (pendingTitle && pendingYearLine) {
          const titleParts = pendingTitle.split('\n').filter(t => t.length > 1)
          for (const t of titleParts) {
            singles.push({ title: t, year: currentYear, month: null, day: null, albumTitle: pendingAlbum, featuredArtists: pendingFeatured, source: 'wikipedia', selected: false })
          }
          pendingTitle = null; pendingAlbum = undefined; pendingFeatured = undefined; pendingYearLine = false
        }
        continue
      }

      pendingYearLine = false

      // Year-first formatas (Title stulpelis, hasYearCol=true).
      // 2026-06-02: TIK kai lentelė NEnaudoja `! scope="row"` title'ų. Title-first
      // lentelėse (Bella Kay) chart-position `|` cell'ai su {{efn}} footnote'ais
      // generuodavo fake singlus („Bubbling" iš [[Bubbling Under Hot 100]]).
      if (hasYearCol && !pendingTitle && !sawScopeRow) {
        // Strip'inam <small>...</small> ir {{efn|...}} note šablonus PRIEŠ split —
        // kitaip "(Bolivia-only release)" / [[James Bond]] iš efn'o tampa
        // title suffix'u arba atskiru title parts.
        const lineClean = line
          .replace(/<small[^>]*>[\s\S]*?<\/small>/gi, '')
          .replace(/\{\{(?:efn(?:-[a-z]+)?|notetag|note|ref|sfn)[^{}]*\}\}/gi, '')
        // 2026-05-18: BUG fix — naive `split('|')` laužia wiki link rename'us
        // [[Page|Display]] į du segments + nepraleidžia leading cell attributes
        // `align="left"`. Naudojam splitWikiCells (depth-aware) + findContentSegIdx
        // (attr-skip). Freddie Mercury Singles formato fix.
        const allSegs = splitWikiCells(lineClean)
        if (allSegs.length === 0) continue
        const titleIdx = findContentSegIdx(allSegs)
        if (titleIdx >= allSegs.length) continue
        const firstSeg = allSegs[titleIdx]

        // Surinkti VISAS "..." quoted dalis iš firstSeg — palaiko "X" / "Y"
        // dvigubus singlus (Larry Lurex 1973 "I Can Hear Music" / "Goin' Back").
        // Kiekvieną quoted segmentą valom per cleanWikiText (link rename → display).
        const titleParts: string[] = []
        const quotedAll = firstSeg.matchAll(/"([^"]+)"/g)
        for (const qm of quotedAll) {
          const inner = qm[1]
          const linkM = inner.match(/^\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]\s*(.*)$/)
          const t = (linkM ? cleanWikiText(linkM[2] || linkM[1]) + (linkM[3] || '') : cleanWikiText(inner)).trim()
          if (t && t.length > 1) titleParts.push(t)
        }
        // Jei be kabučių — wiki link only (kai kurios lentelės naudoja just [[Title]])
        if (titleParts.length === 0) {
          if (/^''/.test(firstSeg)) continue  // kursyvas = albumas, skip
          const wm = firstSeg.match(/^\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/)
          if (wm) {
            const t = cleanWikiText(wm[2] || wm[1]).trim()
            if (t && t.length > 1) titleParts.push(t)
          }
        }
        if (titleParts.length === 0) continue

        // Filter junk
        const filtered = titleParts.filter(t => {
          if (/^\d{4}/.test(t) || /^\d+$/.test(t)) return false
          if (/\bedition\b|\bcollection\b|\banniversary\b|\bcollector\b|\bgreatest.?hits\b|\bsoundtrack\b|\bofficial.?charts?\b|\bcharts?\s+company\b/i.test(t)) return false
          if (/\bE\.?P\.?\s*$/i.test(t)) return false
          if (/^(see also|notes?|references?)\s*$/i.test(t)) return false
          return true
        }).map(t => t.replace(/\s*[\[(](?:re-?release|re-?issue)[)\]]/gi, '').trim()).filter(t => t.length > 1)
        if (filtered.length === 0) continue

        // Albumas — pirma ieškom kituose cell'uose (same line), tada lookahead
        // į kitas N eilutes (Freddie Mercury format'as — album cell ant atskiros
        // eilutės po chart positions).
        let albumTitle: string | undefined
        const scanSegForAlbum = (seg: string): string | undefined => {
          if (/Non-album/i.test(seg)) return 'Non-album single'
          const am = seg.match(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/)
          if (am) {
            const p = cleanWikiText(am[2] || am[1])
            if (p && !filtered.some(t => t === p) && !/^\d+$/.test(p) && !/^[-–—]$/.test(p) && p.length > 2) return p
          }
          const im = seg.match(/'{2,3}([^']+)'{2,3}/)
          if (im) {
            const p = cleanWikiText(im[1])
            if (p && !filtered.some(t => t === p) && p.length > 2) return p
          }
          return undefined
        }
        for (let sp = allSegs.length - 1; sp > titleIdx; sp--) {
          const found = scanSegForAlbum(allSegs[sp])
          if (found) { albumTitle = found; break }
        }
        // Lookahead į kitas eilutes (Freddie format'as — album ant atskiros eilutės)
        if (!albumTitle) {
          for (let k = i + 1; k < Math.min(i + 25, lines.length); k++) {
            const nl = lines[k]
            if (/^\s*\|-/.test(nl) || nl.startsWith('|}') || nl.startsWith('!') || nl.startsWith('{|') || /^==+/.test(nl)) break
            if (!/^\|/.test(nl) || /^\|\|/.test(nl)) continue
            const nlClean = nl.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '').replace(/<small[^>]*>[\s\S]*?<\/small>/gi, '')
            const nlSegs = splitWikiCells(nlClean)
            const nlIdx = findContentSegIdx(nlSegs)
            if (nlIdx >= nlSegs.length) continue
            const content = nlSegs[nlIdx]
            // Skip if it's a chart position number, dash, empty, or year
            if (/^[-–—]$/.test(content) || /^\d{1,3}$/.test(content) || /^(?:19|20)\d{2}$/.test(content) || content === '') continue
            // Skip certifications block (UK: Gold etc.)
            if (/^[*•]\s*[A-Z]{2,3}\s*:/m.test(content)) continue
            const found = scanSegForAlbum(content)
            if (found) { albumTitle = found; break }
          }
        }

        for (const t of filtered) {
          singles.push({ title: t, year: currentYear, month: null, day: null, albumTitle, source: 'wikipedia', selected: false })
        }
      }
    }
  }

  // Jei liko pending
  if (pendingTitle) {
    const titleParts = pendingTitle.split('\n').filter(t => t.length > 1)
    for (const t of titleParts) {
      singles.push({ title: t, year: currentYear, month: null, day: null, albumTitle: pendingAlbum, featuredArtists: pendingFeatured, source: 'wikipedia', selected: false })
    }
  }

  // Deduplikuoti — palikti pirmą versiją kiekvieno pavadinimo
  // Deduplikavimo raktas: pavadinimas be remix/mix/version skliaustelių
  // BET: jei versijos labai skiriasi (pvz. "2024 Mix" vs originalas) — laikyti atskira daina
  const seen = new Set<string>()
  return singles.filter(s => {
    // Bazinis pavadinimas (be skliaustelių turinio) deduplikacijai
    const base = s.title.toLowerCase()
      .replace(/\s*\(\s*(?:re-?release|re-?issue|re-?release)\s*\)\s*/gi, '')
      .replace(/\s*\[\s*(?:re-?release|re-?issue)\s*\]\s*/gi, '')
      .trim()
    if (seen.has(base)) return false
    seen.add(base)
    return true
  })
}

// ─── Track parsing ────────────────────────────────────────────────────────────

function extractTrackListings(wikitext: string): string[] {
  const results: string[] = []
  const pattern = /\{\{\s*[Tt]rack\s*[Ll]isting/g
  let m: RegExpExecArray | null
  while ((m = pattern.exec(wikitext)) !== null) {
    let depth = 0, i = m.index
    while (i < wikitext.length - 1) {
      if (wikitext[i] === '{' && wikitext[i+1] === '{') { depth++; i += 2 }
      else if (wikitext[i] === '}' && wikitext[i+1] === '}') { depth--; i += 2; if (depth === 0) { results.push(wikitext.slice(m.index + 2, i - 2)); break } }
      else i++
    }
  }
  return results
}

// Grąžina tracklist blokus su jų pozicijomis wikitext'e (reikia konteksto filtravimui)

function parseReleaseDate(wikitext: string): { year: number | null; month: number | null; day: number | null } {
  const MONTHS: Record<string, number> = { january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12 }

  // {{Start date|YYYY|MM|DD}} arba {{Start date and age|YYYY|MM|DD}} arba {{Start date|df=yes|YYYY|MM|DD}}
  const s1 = wikitext.match(/\{\{[Ss]tart\s*date(?:\s*and\s*age)?\s*\|(?:df\s*=\s*(?:yes|no)\s*\|)?(\d{4})\|?(\d{1,2})?\|?(\d{1,2})?/)
  if (s1) return { year: parseInt(s1[1]), month: s1[2] ? parseInt(s1[2]) : null, day: s1[3] ? parseInt(s1[3]) : null }

  // | released = YYYY-MM-DD
  const i1 = wikitext.match(/\|\s*released\s*=\s*(\d{4})-(\d{2})-(\d{2})/)
  if (i1) return { year: parseInt(i1[1]), month: parseInt(i1[2]), day: parseInt(i1[3]) }

  // {{Release date|YYYY|MM|DD}} arba {{Release date and age|YYYY|MM|DD}}
  const rd1 = wikitext.match(/\{\{[Rr]elease\s*date(?:\s*and\s*age)?\s*\|(?:df\s*=\s*(?:yes|no)\s*\|)?(\d{4})\|(\d{1,2})\|(\d{1,2})/)
  if (rd1) return { year: parseInt(rd1[1]), month: parseInt(rd1[2]), day: parseInt(rd1[3]) }

  // UK date: | released = 14 May 2007
  const uk1 = wikitext.match(/\|\s*released\s*=\s*[^|{[\n]*?(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i)
  if (uk1) return { year: parseInt(uk1[3]), month: MONTHS[uk1[2].toLowerCase()] || null, day: parseInt(uk1[1]) }

  // US date: | released = May 14, 2007
  const us1 = wikitext.match(/\|\s*released\s*=\s*[^|{[\n]*?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s*(\d{4})/i)
  if (us1) return { year: parseInt(us1[3]), month: MONTHS[us1[1].toLowerCase()] || null, day: parseInt(us1[2]) }

  // Generic US format fallback (using Date parser)
  const r1 = wikitext.match(/\|\s*released\s*=\s*[^|{[\n]*?(\w+ \d{1,2},?\s*\d{4})/)
  if (r1) { const d = new Date(r1[1]); if (!isNaN(d.getTime())) return { year: d.getFullYear(), month: d.getMonth()+1, day: d.getDate() } }

  // Year only
  const y1 = wikitext.match(/\|\s*released\s*=\s*.*?(\d{4})/)
  if (y1) return { year: parseInt(y1[1]), month: null, day: null }
  return { year: null, month: null, day: null }
}

// ─── DB utils ─────────────────────────────────────────────────────────────────

async function checkAlbumDuplicates(titles: string[], artistId: number): Promise<Record<string, number>> {
  if (!titles.length) return {}
  try {
    const res = await fetch(`/api/albums?artist_id=${artistId}&check_titles=${encodeURIComponent(JSON.stringify(titles))}`)
    return res.ok ? (await res.json()).found || {} : {}
  } catch { return {} }
}

async function checkTrackDuplicates(titles: string[], artistId: number): Promise<Record<string, number>> {
  if (!titles.length) return {}
  try {
    const res = await fetch(`/api/tracks?artist_id=${artistId}&check_titles=${encodeURIComponent(JSON.stringify(titles))}`)
    return res.ok ? (await res.json()).found || {} : {}
  } catch { return {} }
}

function titleMatches(result: string, query: string): boolean {
  const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
  const nr = n(result)
  const nq = n(query)
  // Tikslus sutapimas
  if (nr.includes(nq) || nq.includes(nr)) return true
  const words = nq.split(' ').filter(w => w.length > 2)
  if (words.length === 0) return true
  const matchCount = words.filter(w => nr.includes(w)).length
  // Standartinis: bent 50% žodžių
  if (matchCount >= Math.ceil(words.length * 0.5)) return true
  // Švelnesnė versija: jei query ilgas (soundtrack pavadinimai), tikrinti ar pirmieji 3 žodžiai sutampa
  if (words.length >= 4) {
    const firstWords = words.slice(0, 3)
    const firstMatch = firstWords.filter(w => nr.includes(w)).length
    if (firstMatch >= 2) return true
  }
  return false
}

// Ieškoti YouTube URL per YouTube InnerTube API (nemokama, greita, patikima)
async function findYouTubeViaYTMusic(artistName: string, trackTitle: string, addLog?: (s: string) => void): Promise<string | null> {
  try {
    const q = `${artistName} ${trackTitle}`
    const r = await fetch(`/api/search/ytmusic?q=${encodeURIComponent(q)}`)
    if (!r.ok) {
      addLog?.(`    ⚠ YT ${r.status}: ${trackTitle}`)
      return null
    }
    const data = await r.json()
    if (data.error) {
      addLog?.(`    ⚠ YT: ${data.error.slice(0, 60)}`)
      return null
    }
    if (data.url && data.videoId) {
      addLog?.(`    ✓ YT: ${trackTitle}`)
      return data.url
    }
    addLog?.(`    · YT: nerasta — ${trackTitle}`)
    return null
  } catch (e: any) {
    addLog?.(`    ✗ YT klaida: ${e.message?.slice(0, 60)}`)
    return null
  }
}

async function enrichTracks(albumId: number, artistName: string, addLog: (s: string) => void, lyrics = true, onProgress?: (done: number, total: number) => void) {
  let dbTracks: any[] = []
  try { dbTracks = (await (await fetch(`/api/tracks?album_id=${albumId}&limit=200`)).json()).tracks || [] } catch { return }
  if (!dbTracks.length) return
  addLog(`  ${dbTracks.length} dainų...`)
  let mbN = 0, lyrN = 0, coverN = 0, done = 0

  // Procesavame po vieną
  for (const t of dbTracks) {
    const u: Record<string,any> = {}

    // Singlai: viršelis + tiksli data iš Wikipedia
    if (t.is_single && !t.cover_url) {
      try {
        const wikiTitle = t.title.replace(/ /g, '_')
        const suffixes = ['', '_(song)', `_(${artistName.replace(/ /g, '_')}_song)`, '_(single)']
        for (const suffix of suffixes) {
          const testTitle = wikiTitle + suffix
          const [testCover, testWt] = await Promise.all([
            fetchCoverImage(testTitle),
            (!t.release_month) ? fetchWikitext(testTitle) : Promise.resolve('')
          ])
          if (testCover) {
            u.cover_url = testCover
            coverN++
            if (testWt && testWt.includes('released')) {
              const dateInfo = parseReleaseDate(testWt)
              if (dateInfo.month) { u.release_year = dateInfo.year; u.release_month = dateInfo.month; u.release_day = dateInfo.day }
            }
            break
          }
          if (testWt && testWt.includes('released')) {
            const dateInfo = parseReleaseDate(testWt)
            if (dateInfo.month) { u.release_year = dateInfo.year; u.release_month = dateInfo.month; u.release_day = dateInfo.day }
            break
          }
          await new Promise(r => setTimeout(r, 100))
        }
      } catch {}
    }

    // YouTube — praleidžiam jei jau turi video_url ARBA jau buvo ieškota
    if (!t.video_url && !t.youtube_searched_at) {
      const ytUrl = await findYouTubeViaYTMusic(artistName, t.title, addLog)
      if (ytUrl) { u.video_url = ytUrl; mbN++ }
      u.youtube_searched_at = new Date().toISOString()
      await new Promise(r => setTimeout(r, 300))
    }

    // Lyrics — praleidžiam jei jau turi lyrics ARBA jau buvo ieškota
    if (lyrics && !t.lyrics && !t.lyrics_searched_at) try {
      // Pasiunčiam duration_seconds — leidžia LRCLib /api/get exact match'inti
      // (greičiau ir tiksliau nei /api/search fuzzy fallback'as).
      const durParam = t.duration_seconds ? `&duration=${t.duration_seconds}` : ''
      const r = await fetch(`/api/search/lyrics?artist=${encodeURIComponent(artistName)}&title=${encodeURIComponent(t.title)}${durParam}`)
      if (r.ok) { const d = await r.json(); if (d.lyrics) { u.lyrics = d.lyrics; lyrN++ } }
      u.lyrics_searched_at = new Date().toISOString()
    } catch {}

    if (Object.keys(u).length) try {
      await fetch(`/api/tracks/${t.id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(u) })
    } catch {}

    done++
    if (done % 3 === 0 || done === dbTracks.length) {
      addLog(`  ${done}/${dbTracks.length} (YT:${mbN} tekstai:${lyrN}${coverN ? ` viršeliai:${coverN}` : ''})`)
      onProgress?.(done, dbTracks.length)
    }
  }
  addLog(`  ✓ YT:${mbN} tekstai:${lyrN}${coverN ? ` viršeliai:${coverN}` : ''}`)
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  artistId: number
  artistName: string
  artistWikiTitle?: string
  isSolo?: boolean
  onClose?: () => void
  buttonClassName?: string
  buttonLabel?: string
}

// ─── Tab tipai ────────────────────────────────────────────────────────────────

type ActiveTab = 'studio' | 'other' | 'singles' | 'songs' | 'pending' | 'db-only'

/**
 * Detektuoja album'o tipą iš pavadinimo heuristikomis.
 * Music.lt scrape default'as visus įrašus žymi kaip type_studio. Šis helper'is
 * leidžia užfix'inti display + approve flow'ą — pvz. "Metal Up Your Ass (Demo)"
 * tampa type_demo, "S&M (Live)" tampa type_live, etc.
 *
 * Grąžina type string'ą arba null jei nieko nesutapatu (palieka studio).
 */
function detectTypeFromTitle(title: string | null | undefined): string | null {
  if (!title) return null
  const t = title.toLowerCase()
  // Live recording — Wikipedia konvencija + LT scrape gyvai
  if (/\b(live|gyvai|concert|in concert|live at|live from)\b/.test(t)) return 'live'
  // Demo / studio demo / pre-production
  if (/\b(demo|studio demo|pre-?production)\b/.test(t)) return 'demo'
  // Cover album / tribute
  if (/\b(cover|tribute)\b/.test(t)) return 'covers'
  // Remix album
  if (/\b(remix|remixes|remixed)\b/.test(t)) return 'remix'
  // Soundtrack
  if (/\b(soundtrack|score|ost)\b/.test(t)) return 'soundtrack'
  // Compilation / greatest / best of
  if (/\b(greatest hits|best of|compilation|collection|essential|anthology)\b/.test(t)) return 'compilation'
  // EP — žodis su word boundary
  if (/\b(ep|e\.p\.)\b/.test(t)) return 'ep'
  // Holiday
  if (/\b(christmas|xmas|holiday)\b/.test(t)) return 'holiday'
  return null
}

// Pending record = music.lt-only įrašas (legacy_scrape_pending source). Šie
// jau yra DB'oje, bet nematomi viešai. User'is gali "Patvirtinti" (pakeisti
// source į legacy_scrape_v1) arba "Trinti" iš modal'o.
type PendingAlbum = {
  id: number  // DB id
  title: string
  year: number | null
  type: string  // type_studio etc — type_remix/type_live etc., gauname iš API
  legacy_id: number | null
  cover_image_url?: string | null
  tracksCount?: number
  importing?: boolean
  imported?: boolean
  deleted?: boolean
  error?: string
}
type PendingTrack = {
  id: number
  title: string
  release_year: number | null
  type: string | null
  legacy_id: number | null
  // Tracks gali turėti album_tracks JOIN priskirimą (per scrape). Saugom
  // pirmojo album'o id + title, kad UI'us galėtų grupuoti tracks po
  // pending album'ais (jei pending album turi tracks) arba orphan section
  // (jei tracks neturi albumo priskirimo).
  album_id?: number | null
  album_title?: string | null
  importing?: boolean
  imported?: boolean
  deleted?: boolean
  error?: string
}

// Albumų grupės pagal tabs
const STUDIO_TYPES: AlbumType[] = ['studio']
const OTHER_TYPES: AlbumType[] = ['ep', 'compilation', 'live', 'remix', 'covers', 'holiday', 'soundtrack', 'demo', 'other']

// ─── Pagrindinis komponentas ──────────────────────────────────────────────────

export default function WikipediaImportDiscography({ artistId, artistName, artistWikiTitle, isSolo, onClose, buttonClassName, buttonLabel }: Props) {
  const [open, setOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [wikiUrl, setWikiUrl] = useState(artistWikiTitle ? `https://en.wikipedia.org/wiki/${artistWikiTitle}` : '')
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<ActiveTab>('studio')

  const [items, setItems] = useState<DiscographyItem[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  // Help banner collapsed by default — taupom vertical space, bet kiekvienam
  // naujam admin'ui visada matomas (žinom ar peržiūrėjo per localStorage).
  const [helpOpen, setHelpOpen] = useState(false)
  // selectedNewTracks: per-album set of Wiki track titles (lowercased) kurias
  // admin pasirinko sukurti DB. Naudojama ENRICH mode'e (album.duplicate=true)
  // — Wiki-only dainos pagal default'ą praleidžiamos, bet admin gali pažymėti
  // checkbox'u, kad enrich endpoint'as jas taip pat sukurtų ir prijungtų.
  const [selectedNewTracks, setSelectedNewTracks] = useState<Record<number, Set<string>>>({})
  const toggleNewTrack = (albumIdx: number, titleLower: string) => {
    setSelectedNewTracks(prev => {
      const cur = new Set(prev[albumIdx] || [])
      if (cur.has(titleLower)) cur.delete(titleLower)
      else cur.add(titleLower)
      return { ...prev, [albumIdx]: cur }
    })
  }
  const [artistGroups, setArtistGroups] = useState<string[]>([])
  // Substyle taksonomija — užkraunama vieną kartą, naudojama fuzzy match'inti
  // Wikipedia žanrus. Greitai cache'inam moduliniu lvl-state'u kad
  // perimport'inus kitam atlikėjui nereikėtų vėl fetchinti.
  const [substylesList, setSubstylesList] = useState<SubstyleRow[]>([])
  useEffect(() => {
    if (substylesList.length) return
    fetch('/api/substyles').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.substyles) setSubstylesList(d.substyles)
    }).catch(() => {})
  }, [substylesList.length])
  const [songs, setSongs] = useState<SingleSongItem[]>([])
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set())
  // Wiki single aliases + ignores (per atlikėjas). Aliases pažymi konkretų
  // Wiki single title kaip jau egzistuojantį tracker'į (pvz „Angel" → „Angel
  // in the Snow"). Ignores paslepia Wiki single suggestions ateičiai.
  const [wikiAliases, setWikiAliases] = useState<Record<string, { trackId: number; trackTitle: string }>>({})
  const [wikiIgnores, setWikiIgnores] = useState<Set<string>>(new Set())
  // allArtistTracks — Map<lowercased_title, { id, title }> šio atlikėjo trackų,
  // naudojamas fuzzy match'e ir alias picker'yje. Užkraunamas handleSearch'e.
  const [allArtistTracks, setAllArtistTracks] = useState<Map<string, { id: number; title: string }>>(new Map())
  // Alias linking state — kuris Wiki single title šiuo metu link'inamas
  // (atidaro inline picker'į).
  const [linkAliasFor, setLinkAliasFor] = useState<string | null>(null)
  const [aliasPickerQuery, setAliasPickerQuery] = useState('')
  // Pending music.lt-only records — gauti iš DB, ne iš Wiki. Rodom kaip
  // 4-tą tab'ą su Patvirtinti/Trinti action'ais.
  const [pendingAlbums, setPendingAlbums] = useState<PendingAlbum[]>([])
  // 'Tik DB' tab — aktyvūs DB album'ai, kurių Wiki neturi savo diskografijoje
  // (pvz Pre Ordained 1971 — music.lt scrape įrašytas pre-debut demo, Wiki
  // jo nelaiko official discography dalimi). Admin'as gali peržiūrėti +
  // delete/hide.
  type DbOnlyAlbum = {
    id: number
    title: string
    year: number | null
    type: string
    legacy_id: number | null
    likes_count: number
    comments_count: number
    cover_image_url: string | null
  }
  const [dbOnlyAlbums, setDbOnlyAlbums] = useState<DbOnlyAlbum[]>([])
  const [pendingTracks, setPendingTracks] = useState<PendingTrack[]>([])

  const [log, setLog] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const { startTask, updateTask, finishTask, errorTask } = useBackgroundTasks()
  const [sortDesc, setSortDesc] = useState(true)
  const logRef = useRef<HTMLDivElement>(null)

  const addLog = (msg: string) => setLog(p => [...p, msg])

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [log])

  // ── Paieška ────────────────────────────────────────────────────────────────

  // ── Pending DB records fetch ─────────────────────────────────────────────
  // Atskiras fetch nuo Wiki — gaunam visus artist'o legacy_scrape_pending
  // record'us iš DB. Paleidžiamas kartu su search() arba savaime kai
  // modal'as atsidaro.
  const fetchPending = useCallback(async () => {
    try {
      const [albRes, trkRes] = await Promise.all([
        fetch(`/api/albums?artist_id=${artistId}&limit=500`),
        fetch(`/api/tracks?artist_id=${artistId}&limit=2000`),
      ])
      const albData = albRes.ok ? await albRes.json() : { albums: [] }
      const trkData = trkRes.ok ? await trkRes.json() : { tracks: [] }
      const albs: any[] = albData.albums || []
      const trks: any[] = trkData.tracks || []
      const pAlb: PendingAlbum[] = albs
        .filter(a => a.source === 'legacy_scrape_pending')
        .map(a => {
          // Detect type from DB flags first
          const types = ['type_studio', 'type_ep', 'type_compilation', 'type_live', 'type_remix', 'type_covers', 'type_soundtrack', 'type_demo']
          const dbType = types.find(k => a[k]) || 'type_studio'
          let type = dbType.replace('type_', '')
          // Music.lt scrape defaults visus į type_studio. Detect actual type
          // iš title heuristikų — overrideina DB flag jei jos rodo kitokį.
          const heur = detectTypeFromTitle(a.title)
          if (heur && type === 'studio') type = heur
          return {
            id: a.id,
            title: a.title,
            year: a.year || null,
            type,
            legacy_id: a.legacy_id || null,
            cover_image_url: a.cover_image_url || null,
          }
        })
      const pTrk: PendingTrack[] = trks
        .filter(t => t.source === 'legacy_scrape_pending')
        .map(t => {
          // album_tracks JOIN priskirimas — paimam pirmąjį albumą (jei yra)
          // kad tracks grupuotusi po pending albums modal'e.
          const firstAlbum = (t.albums_list && t.albums_list[0]) || null
          return {
            id: t.id,
            title: t.title,
            release_year: t.release_year || null,
            type: t.type || null,
            legacy_id: t.legacy_id || null,
            album_id: firstAlbum ? firstAlbum.id : null,
            album_title: firstAlbum ? firstAlbum.title : null,
          }
        })
      setPendingAlbums(pAlb)
      setPendingTracks(pTrk)
      // Active DB albums (not pending) — 'Tik DB' tab kandidatai.
      // Po Wiki search'o paliekam tik tuos, kurie nesutapo su Wiki tracks
      // (computed in render via useMemo, filtering against items[].duplicateId).
      const dbOnly: DbOnlyAlbum[] = albs
        .filter(a => a.source !== 'legacy_scrape_pending')
        .map(a => {
          const types = ['type_studio', 'type_ep', 'type_compilation', 'type_live', 'type_remix', 'type_covers', 'type_soundtrack', 'type_demo']
          const dbType = types.find(k => a[k]) || 'type_studio'
          return {
            id: a.id,
            title: a.title,
            year: a.year || null,
            type: dbType.replace('type_', ''),
            legacy_id: a.legacy_id || null,
            likes_count: 0, // populated separately if needed
            comments_count: 0,
            cover_image_url: a.cover_image_url || null,
          }
        })
      setDbOnlyAlbums(dbOnly)
      if (pAlb.length || pTrk.length) {
        addLog(`📋 Music.lt rasta: ${pAlb.length} albumų + ${pTrk.length} dainų — žiūrėk "Music.lt rasta" tab'e`)
      }
    } catch (e) {
      console.error('[pending fetch]', e)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artistId])

  // Patvirtinti pending album — pakeičia source iš legacy_scrape_pending
  // į legacy_scrape_v1, kad būtų matomas viešai. Nereikia kurti naujo
  // record'o, tik aktyvuoti egzistuojantį.
  const approvePending = async (kind: 'album' | 'track', id: number) => {
    const updater = <T extends { id: number; importing?: boolean; imported?: boolean; error?: string }>(
      patch: (p: T) => T
    ) => {
      if (kind === 'album') setPendingAlbums(prev => prev.map(p => p.id === id ? patch(p as any) as any : p))
      else setPendingTracks(prev => prev.map(p => p.id === id ? patch(p as any) as any : p))
    }
    updater(p => ({ ...p, importing: true, error: undefined }))
    try {
      const endpoint = kind === 'album' ? `/api/albums/${id}` : `/api/tracks/${id}`
      // Album'ams — visada siunčiam type_* flag set'ą iš dropdown'o (user'is
      // gali keisti type prieš patvirtinant per UI <select>). Reset visus,
      // set tik pasirinktą. Tai užtikrina kad music.lt 'viskas studio' default'as
      // nepatenka į canonical po aktyvavimo.
      const body: any = { source: 'legacy_scrape_v1' }
      if (kind === 'album') {
        const pAlb = pendingAlbums.find(p => p.id === id)
        if (pAlb && pAlb.type) {
          const allTypes = ['type_studio', 'type_ep', 'type_compilation', 'type_live', 'type_remix', 'type_covers', 'type_soundtrack', 'type_demo', 'type_holiday', 'type_single']
          for (const k of allTypes) body[k] = false
          body[`type_${pAlb.type}`] = true
        }
      }
      const r = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err.error || `${r.status}`)
      }
      updater(p => ({ ...p, importing: false, imported: true }))
      // Cascade — jei aktyvuojam albumą, taip pat aktyvuojam jo pending tracks
      // (kurios susietos per album_tracks). Per UI tracks rodomos po albumu —
      // patvirtinant albumą, jos turi tapti matomos kartu.
      if (kind === 'album') {
        const albumTracks = pendingTracks.filter(t => t.album_id === id)
        for (const t of albumTracks) {
          try {
            await fetch(`/api/tracks/${t.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ source: 'legacy_scrape_v1' }),
            })
            setPendingTracks(prev => prev.map(p => p.id === t.id ? { ...p, imported: true } : p))
          } catch {}
        }
        if (albumTracks.length > 0) addLog(`  +${albumTracks.length} dainos kartu aktyvuotos`)
      }
      addLog(`✓ ${kind === 'album' ? 'Albumas' : 'Daina'} #${id} aktyvuotas`)
      window.dispatchEvent(new CustomEvent('discography-updated'))
    } catch (e: any) {
      updater(p => ({ ...p, importing: false, error: e.message }))
      addLog(`✗ Klaida aktyvuojant #${id}: ${e.message}`)
    }
  }

  const deletePending = async (kind: 'album' | 'track', id: number) => {
    if (!confirm(`Trinti pending ${kind === 'album' ? 'albumą' : 'dainą'} (#${id})? Šio veiksmo negalima atšaukti.`)) return
    if (kind === 'album') {
      setPendingAlbums(prev => prev.map(p => p.id === id ? { ...p, importing: true, error: undefined } : p))
    } else {
      setPendingTracks(prev => prev.map(p => p.id === id ? { ...p, importing: true, error: undefined } : p))
    }
    try {
      const endpoint = kind === 'album' ? `/api/albums/${id}?deleteTracks=true` : `/api/tracks/${id}`
      const r = await fetch(endpoint, { method: 'DELETE' })
      if (!r.ok) throw new Error(`${r.status}`)
      if (kind === 'album') setPendingAlbums(prev => prev.filter(p => p.id !== id))
      else setPendingTracks(prev => prev.filter(p => p.id !== id))
      addLog(`🗑 ${kind === 'album' ? 'Albumas' : 'Daina'} #${id} ištrintas`)
      window.dispatchEvent(new CustomEvent('discography-updated'))
    } catch (e: any) {
      if (kind === 'album') {
        setPendingAlbums(prev => prev.map(p => p.id === id ? { ...p, importing: false, error: e.message } : p))
      } else {
        setPendingTracks(prev => prev.map(p => p.id === id ? { ...p, importing: false, error: e.message } : p))
      }
    }
  }

  const search = async (groupFilter?: string) => {
    setLoading(true); setItems([]); setSongs([]); setLog([]); setSelected(new Set())
    addLog(`🔍 ${artistName}...`)
    // Pending fetch'as paralel — nepriklausomas nuo Wiki
    fetchPending()

    let wikiBase = wikiUrl.trim() ? extractWikiTitle(wikiUrl) : artistName.replace(/ /g, '_')
    addLog(`📖 ${wikiBase}`)
    let mainWikitext = await fetchWikitext(wikiBase)

    // 2026-06-02: Jei pataikėm į disambiguation puslapį (pvz „The Warning" →
    // „may refer to:" su daug reikšmių), bandyk band/musician disambiguator
    // suffix'us. Admin'as paduoda artistWikiTitle = artistName su `_`, todėl
    // band'ai be užpildyto Wiki title gaudavo disambiguation puslapį → 0 albumų.
    const isDisambig = (wt: string) => /\{\{\s*(?:disambiguation|disambig|hndis|dab|disamb)\b/i.test(wt) || /'''[^']+'''\s*(?:or\s*'''[^']+''')?\s*may refer to/i.test(wt)
    if (mainWikitext && isDisambig(mainWikitext) && !/\((?:band|musician|singer|group|rapper)\)/i.test(wikiBase)) {
      for (const suf of ['_(band)', '_(musician)', '_(singer)', '_(group)']) {
        addLog(`  ↻ disambiguation → ${wikiBase}${suf}`)
        const alt = await fetchWikitext(wikiBase + suf)
        if (alt && !isDisambig(alt)) { mainWikitext = alt; wikiBase = wikiBase + suf; setWikiUrl(`https://en.wikipedia.org/wiki/${wikiBase}`); break }
      }
    }

    let foundAlbums: DiscographyItem[] = []
    let foundSongs: SingleSongItem[] = []

    if (mainWikitext) {
      const groups = hasMultipleArtistSections(mainWikitext)
      if (groups.length > 1 && !groupFilter && !isSolo) { setArtistGroups(groups); setLoading(false); return }
      const filter = isSolo && !groupFilter ? '__solo__' : groupFilter
      let wikiAlbums = parseMainPageDiscography(mainWikitext, isSolo, filter)

      // 2026-06-02: Mixed-format diskografija. Kai kurie atlikėjai (pvz The
      // Warning) pagrindiniame puslapyje turi DALĮ album-type sekcijų kaip
      // wikitable'us (Studio albums, Live album → `! scope="row"| ''Title''`)
      // ir DALĮ kaip bullet list'us (Extended plays, Concert films → `* ''X''`).
      // parseMainPageDiscography skaito TIK bullet'us, parseDiscographyPage TIK
      // table'us. Anksčiau bullet parser'is grąžindavo ne-tuščią dalinį sąrašą
      // (3 EP/film), kuris short-circuit'indavo table fallback'ą → 4 studio
      // albumai (table'e) dingdavo. Fix: paleisti ABU ant main page'o ir
      // sujungti pagal title. Table-parsed įrašas laimi tipą (per-section
      // ! scope=row patikimesnis nei carried-over bullet currentType).
      // 2026-06-11: __solo__ taip pat leidžiam merge — solo artistai (Al Stewart)
      // gali turėti studio albumus table'e + compilations bullet'ais. parseDiscographyPage
      // turi savo section-type matching'ą (===Studio albums=== etc.), tad nesukels
      // klaidingų svetimų sekcijų. Tikras group-context rizika tik su konkrečiu
      // grupės filtru (pvz "Queen"), bet __solo__ reiškia VIENĄ artistą.
      if (!filter || filter === '__all__' || filter === '__solo__') {
        const tableAlbums = parseDiscographyPage(mainWikitext)
        if (tableAlbums.length) {
          const normKey = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, '')
          const byTitle = new Map<string, DiscographyItem>()
          for (const a of wikiAlbums) byTitle.set(normKey(a.title), a)
          for (const a of tableAlbums) byTitle.set(normKey(a.title), a) // table wins
          if (byTitle.size > wikiAlbums.length) addLog(`✓ Bullet+table sujungta: ${byTitle.size} albumų`)
          wikiAlbums = [...byTitle.values()]
        }
      }

      const mainSingles = parseSinglesSection(mainWikitext)
      if (mainSingles.length) foundSongs = mainSingles

      // Discography puslapio URL
      const artistBase = wikiBase.replace(/_discography$/i, '')
      const discTitle = artistBase + '_discography'
      const hasDiscPage = discTitle !== wikiBase

      // Singlų datos iš pagrindinės puslapio infobox (single1date laukai)
      const enrichSongsWithDates = (songs: SingleSongItem[], wikitext: string): SingleSongItem[] => {
        const { dates } = parseSinglesFromInfobox(wikitext)
        if (!dates.size) return songs
        return songs.map(s => {
          // Apostrophe normalization: match wiki-parser.ts normalizeSingleKey
          const key = s.title.toLowerCase().replace(/['’‘]/g, '').trim()
          // Tiesioginis match
          let dateInfo = dates.get(key)
          // Jei nėra — ieškoti per “/” split (double A-side)
          if (!dateInfo) {
            for (const [dKey, dVal] of dates.entries()) {
              if (dKey.includes('/')) {
                const parts = dKey.split('/').map(p => p.replace(/['’‘“”"]/g, '').trim())
                if (parts.some(p => p === key)) { dateInfo = dVal; break }
              }
            }
          }
          if (dateInfo && (dateInfo.month || dateInfo.day)) {
            return { ...s, year: dateInfo.year ?? s.year, month: dateInfo.month, day: dateInfo.day }
          }
          return s
        })
      }

      // Surinkti galimus atskirus diskografijos puslapius iš {{Main}} šablono
      const mainTemplateLinks = [...mainWikitext.matchAll(/\{\{Main\|([^}]+)\}\}/gi)]
        .flatMap(m => m[1].split('|').map(l => l.trim()))
        .filter(l => /singles?\s*discography/i.test(l) || /albums?\s*discography/i.test(l))

      // 2026-06-15: bendras „X discography" puslapis iš {{Main}} šablono
      // (TEISINGAS raidžių dydis). Iš atlikėjo vardo sukonstruotas `discTitle`
      // gali neegzistuoti — pvz „Tito_el_Bambino_discography" (mažoji „el")
      // Wikipedia'oje NĖRA, realus puslapis = „Tito El Bambino discography".
      const mainDiscPageTitle = [...mainWikitext.matchAll(/\{\{Main\|([^}]+)\}\}/gi)]
        .flatMap(m => m[1].split('|').map(l => l.trim()))
        .find(l => /\bdiscography\b/i.test(l)) || null

      // Bandyti kraut diskografijos puslapį
      const fetchDiscographyPages = async (): Promise<{ albumsWt: string | null; singlesWt: string | null }> => {
        if (!hasDiscPage && !mainDiscPageTitle) return { albumsWt: null, singlesWt: null }

        // Pirmenybė {{Main}} nuorodai (teisingas case), tada vardo-konstruotas.
        const candidates = [mainDiscPageTitle, hasDiscPage ? discTitle : null]
          .filter((x): x is string => !!x)
        let dw: string | null = null
        for (const cand of candidates) {
          addLog(`→ ${cand}`)
          dw = await fetchWikitext(cand.replace(/ /g, '_'))
          if (dw) break
        }
        if (!dw) return { albumsWt: null, singlesWt: null }

        // Patikrinti ar tai disambiguation puslapis
        const isDisambig = /\{\{Disambiguation\}\}/i.test(dw)
        if (!isDisambig) {
          // Normalus diskografijos puslapis — naudoti tiesiogiai
          return { albumsWt: dw, singlesWt: dw }
        }

        // Disambiguation — ieškoti nuorodų į atskirus albums/singles puslapius
        addLog('  → Disambiguation — ieškoma atskirų puslapių...')
        const disambigLinks = [...dw.matchAll(/\[\[([^\]|]+)/g)].map(m => m[1].trim())
        let albumsWt: string | null = null
        let singlesWt: string | null = null

        // Albums discography
        const albumsLink = disambigLinks.find(l => /albums?\s*discography/i.test(l))
          || mainTemplateLinks.find(l => /albums?\s*discography/i.test(l))
        if (albumsLink) {
          addLog(`  → ${albumsLink}`)
          albumsWt = await fetchWikitext(albumsLink.replace(/ /g, '_'))
        }

        // Singles discography
        const singlesLink = disambigLinks.find(l => /singles?\s*discography/i.test(l))
          || mainTemplateLinks.find(l => /singles?\s*discography/i.test(l))
        if (singlesLink) {
          addLog(`  → ${singlesLink}`)
          singlesWt = await fetchWikitext(singlesLink.replace(/ /g, '_'))
        }

        return { albumsWt, singlesWt }
      }

      if (!wikiAlbums.length) {
        // Solo artist'ų pages (Morten Harket, Dave Gahan) discografija dažnai
        // pateikiama wikitable formatu pačiame main page'e, ne kaip bullet'ai.
        // parseMainPageDiscography grąžiną 0 → bandykim parseDiscographyPage
        // ant TO PATIES main wikitext'o prieš ieškant atskiro disco page'o.
        wikiAlbums = parseDiscographyPage(mainWikitext)
        if (wikiAlbums.length) addLog(`✓ Albumai iš table'ių: ${wikiAlbums.length}`)
      }
      if (!wikiAlbums.length) {
        const { albumsWt, singlesWt } = await fetchDiscographyPages()
        if (albumsWt) {
          wikiAlbums = parseDiscographyPage(albumsWt)
        }
        // Singlai: iš singlų puslapio (arba to paties diskografijos puslapio)
        const singlesSource = singlesWt || albumsWt
        if (singlesSource && !foundSongs.length) {
          const ds = parseSinglesSection(singlesSource)
          if (ds.length) foundSongs = enrichSongsWithDates(ds, singlesSource)
        }
        if (!foundSongs.length) {
          foundSongs = enrichSongsWithDates(foundSongs, mainWikitext)
        }
      } else {
        // Albumai rasti iš pagrindinio puslapio — bet gali trūkti live/compilation/EP
        // Krauname discography puslapį dėl pilnesnio sąrašo ir singlų
        // Praturtinti iš main wikitext pirmiausia
        foundSongs = enrichSongsWithDates(foundSongs, mainWikitext)
        const { albumsWt, singlesWt } = await fetchDiscographyPages()
        if (albumsWt) {
          const discAlbums = parseDiscographyPage(albumsWt)
          if (discAlbums.length > wikiAlbums.length) {
            wikiAlbums = discAlbums
            addLog(`✓ Albumai atnaujinti: ${discAlbums.length}`)
          }
        }
        // Singlai iš atskiro singlų puslapio arba bendro diskografijos puslapio
        const singlesSource = singlesWt || albumsWt
        if (singlesSource) {
          if (!foundSongs.length) {
            const ds = parseSinglesSection(singlesSource)
            if (ds.length) foundSongs = enrichSongsWithDates(ds, singlesSource)
          } else {
            foundSongs = enrichSongsWithDates(foundSongs, singlesSource)
          }
        }
      }

      // Jei vis dar nėra singlų — bandyti atskirus puslapius iš {{Main}} šablono
      if (!foundSongs.length && mainTemplateLinks.length > 0) {
        const singlesPageTitle = mainTemplateLinks.find(l => /singles?\s*discography/i.test(l))
        if (singlesPageTitle) {
          addLog(`→ ${singlesPageTitle} (iš Main šablono)`)
          const sw = await fetchWikitext(singlesPageTitle.replace(/ /g, '_'))
          if (sw) {
            const ds = parseSinglesSection(sw)
            if (ds.length) foundSongs = enrichSongsWithDates(ds, sw)
          }
        }
      }

      if (wikiAlbums.length) {
        foundAlbums = wikiAlbums.map(a => ({ ...a, source: 'wikipedia' as const }))
        addLog(`✓ Albumai: ${foundAlbums.length}`)
      }
      if (foundSongs.length) addLog(`✓ Singlai: ${foundSongs.length}`)
    }

    if (!foundAlbums.length && !foundSongs.length) { addLog('✗ Nieko nerasta'); setLoading(false); return }

    // Rūšiuoti
    const typeOrder: Record<AlbumType, number> = { studio: 0, ep: 1, single: 2, compilation: 3, live: 4, remix: 5, covers: 6, holiday: 7, soundtrack: 8, demo: 9, other: 10 }
    foundAlbums.sort((a, b) => typeOrder[a.type] !== typeOrder[b.type] ? typeOrder[a.type] - typeOrder[b.type] : (a.year||9999)-(b.year||9999))
    foundSongs.sort((a, b) => (a.year||9999)-(b.year||9999))

    addLog('🔎 Dublikatai...')
    const [albumDups, songDups] = await Promise.all([
      checkAlbumDuplicates(foundAlbums.map(i => i.title), artistId),
      checkTrackDuplicates(foundSongs.map(s => s.title), artistId),
    ])
    const da = Object.keys(albumDups).length, ds = Object.keys(songDups).length
    if (da+ds > 0) addLog(`⚠ ${da} albumų + ${ds} dainų jau DB → bus papildyti Wiki info (data/viršelis/sertifikatai/žanrai), egzistuojantys laukai neperrašomi`)
    else addLog('✓ Dublikatų nerasta')

    const albumsF = foundAlbums.map(it => { const k = it.title.toLowerCase(); return albumDups[k] ? { ...it, duplicate: true, duplicateId: albumDups[k] } : it })
    // Fuzzy matching: singlo pavadinimas gali nesutapti tiksliai su treko pavadinimu
    // pvz. "Flash" singlas vs "Flash's Theme" trackas DB'e
    // Papildomai: gauti visus atlikėjo trackus + Wiki meta (aliases, ignores)
    // — visi trys užklausimai paraleliniai.
    const tracksMap = new Map<string, { id: number; title: string }>()
    let metaAliases: Record<string, { trackId: number; trackTitle: string }> = {}
    let metaIgnores: string[] = []
    try {
      const [allTRes, metaRes] = await Promise.all([
        fetch(`/api/tracks?artist_id=${artistId}&limit=500`),
        fetch(`/api/admin/wiki-meta?artist_id=${artistId}`),
      ])
      if (allTRes.ok) {
        const allTData = await allTRes.json()
        for (const t of (allTData.tracks || [])) {
          tracksMap.set(t.title.toLowerCase(), { id: t.id, title: t.title })
        }
      }
      if (metaRes.ok) {
        const metaData = await metaRes.json()
        metaAliases = metaData.aliases || {}
        metaIgnores = metaData.ignores || []
      }
    } catch {}
    setAllArtistTracks(tracksMap)
    setWikiAliases(metaAliases)
    const ignoresSet = new Set(metaIgnores)
    setWikiIgnores(ignoresSet)

    // Punktuacijos-agnostiškas normalizatorius — kad „Maybe Maybe" suderintų su
    // „Maybe, Maybe" (kablelis), „St. Anger" su „St Anger" (taškas), „I'm Yours"
    // su „Im Yours" (apostrofas). Strip'inam VISUS ne-raidžių/ne-skaičių simbolius.
    // \p{L} palaiko Unicode raides — svarbu LT atlikėjams (ąčęėįšųūž).
    const normTitle = (s: string) => s.toLowerCase()
      .replace(/[^\p{L}\p{N} ]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    const songsF = foundSongs
      // Pirmiausia atfiltruojam ignored Wiki singles — admin paspaud'a
      // „Ignoruoti" prie suggestion'o, ir jis daugiau šio Wiki title nematys.
      .filter(s => !ignoresSet.has(s.title))
      .map(s => {
        const k = s.title.toLowerCase()
        if (songDups[k]) return { ...s, duplicate: true, duplicateId: songDups[k], selected: false }
        // Manual alias check'as — admin'o markinta („Angel" → „Angel in the Snow")
        const aliasHit = metaAliases[k]
        if (aliasHit) return { ...s, duplicate: true, duplicateId: aliasHit.trackId, selected: false }
        // Fuzzy: dvi strategijos:
        //  (1) punktuacijos-agnostiška equality — „Maybe Maybe" === „Maybe, Maybe"
        //  (2) raw-lowercase prefix + suffix check — „Flash" → „Flash's Theme",
        //      „Title" → „Title (Remix)". Naudojame raw formą, kad išvengtume
        //      false positive'ų tipo „Walk" → „Walk On The Wild Side".
        const normS = normTitle(s.title)
        const rawS = k.replace(/['']/g, '')
        let fuzzyHit: { id: number; title: string } | null = null
        for (const [dbKey, dbInfo] of tracksMap) {
          const normD = normTitle(dbKey)
          if (normD === normS) { fuzzyHit = dbInfo; break }
          const rawD = dbKey.replace(/['']/g, '')
          if (rawD === rawS) { fuzzyHit = dbInfo; break }
          if (!rawD.startsWith(rawS)) continue
          const dbAfter = rawD.slice(rawS.length)
          if (dbAfter.startsWith('s ') && !dbAfter.includes('reprise')) { fuzzyHit = dbInfo; break }
          if (dbAfter.startsWith(' (')) { fuzzyHit = dbInfo; break }
        }
        if (fuzzyHit) return { ...s, duplicate: true, duplicateId: fuzzyHit.id, selected: false }
        return { ...s, selected: false }
      })

    setArtistGroups([])
    // Filter ignored Wiki-only album'us (admin spaudė 🚫 ant Wiki suggestion'o).
    // DB albums su wiki_review_status='cleared' praleidžiame paskutiniame
    // setItems žingsnyje — kai completeness response ateis su tuo flag'u, item
    // bus filtruojamas. Pirma load — DB ignored sąrašas iš API.
    let filteredAlbumsF = albumsF
    try {
      const ignRes = await fetch(`/api/admin/wiki-ignore-album?artist_id=${artistId}`)
      if (ignRes.ok) {
        const ignData = await ignRes.json()
        const ignoredTitles = new Set<string>((ignData?.ignored || []).map((r: any) => String(r.wiki_title || '').toLowerCase()))
        if (ignoredTitles.size > 0) {
          filteredAlbumsF = albumsF.filter(it => !ignoredTitles.has(it.title.toLowerCase()))
        }
      }
    } catch { /* migration not applied yet or network err — show everything */ }
    setItems(filteredAlbumsF)
    // 2026-05-15 redesign: duplicates AUTO-PAŽYMIMI (kad enrich'tųsi). Anksčiau
    // !it.duplicate filter'a neleido duplicates pasirinkti — ir todėl music.lt
    // scrape'inti albums niekada negaudavo Wiki release_year/peak_chart enrichment.
    setSelected(new Set(filteredAlbumsF.map((it, i) => AUTO_SELECT_TYPES.includes(it.type) ? i : -1).filter(i => i !== -1)))
    setSongs(songsF)

    // Default tab
    if (!foundAlbums.length && foundSongs.length) setActiveTab('singles')
    else setActiveTab('studio')

    setLoading(false)
  }

  // ── Album detalių krovimas ─────────────────────────────────────────────────

  const fetchDetails = async (idx: number) => {
    const item = items[idx]
    if (item.fetched) return
    addLog(`📋 ${item.title}`)
    try {
      if (!item.wikiTitle) { setItems(p => p.map((it, i) => i === idx ? { ...it, fetched: true, tracks: [] } : it)); return }
      const [wikitext, cover] = await Promise.all([fetchWikitext(item.wikiTitle), fetchCoverImage(item.wikiTitle)])
      const dateInfo = parseReleaseDate(wikitext)
      const tracks = parseTracklist(wikitext)
      // Supplementary is_single iš artist-page singles lentelės — kai albumas
      // (pvz Martin Gore „MG") savo Wiki page'e neturi {{Singles}} infobox'o
      // nei `==Singles==` h3 section'o, bet artist page'o `===Singles===`
      // lentelėje albumo stulpelyje yra įrašyta „MG" prie „Europa Hymn"/
      // „Pinking" eilučių. `songs` state'as jau praparsina šitą lentelę per
      // parseSinglesSection. Mes pridedam is_single=true tracks'ams, kurių
      // title atitinka kažkurį iš tų singles, kuriame albumTitle = mūsų albumas.
      // 2026-06-02: supplFromArtist TIK kai albumas SAVO Wiki page'e neturi
      // {{Singles}} infobox'o / `==Singles==` sekcijos (parseTracklist grąžino 0
      // is_single). Anksčiau supplement'as visada pridėdavo bet kurį band singlą,
      // kurio artist-page singles lentelėje albumas = mūsų albumas → albumai su
      // teisingu infobox'u over-count'indavo (The Warning „Error": infobox = 2
      // singlai Choke+Money, bet band'o singles lentelė „Error" albumui
      // priskiria ir promo singlus Disciple/Evolve/... → 5). Album infobox =
      // autoritetingas „Singles from X" sąrašas; juo pasitikim kai jis yra.
      const albumHasOwnSingles = tracks.some(t => t.is_single)
      const albumKey = item.title.toLowerCase().replace(/['’‘]/g, '').trim()
      const supplFromArtist = new Set(
        songs
          .filter(s => s.albumTitle && s.albumTitle.toLowerCase().replace(/['’‘]/g, '').trim() === albumKey)
          .map(s => s.title.toLowerCase().replace(/['’‘]/g, '').trim())
      )
      if (supplFromArtist.size && !albumHasOwnSingles) {
        for (const t of tracks) {
          if (!t.is_single) {
            const tk = t.title.toLowerCase().replace(/['’‘]/g, '').trim()
            if (supplFromArtist.has(tk)) t.is_single = true
          }
        }
      }
      // Singlų datos iš albumo infobox — praturtinti songs sąrašą
      const { dates: singleDates } = parseSinglesFromInfobox(wikitext)
      if (singleDates.size > 0) {
        setSongs(prev => prev.map(s => {
          // Apostrophe normalization: match wiki-parser.ts normalizeSingleKey
          const key = s.title.toLowerCase().replace(/['\u2019\u2018]/g, '').trim()
          const dateInfo = singleDates.get(key)
          if (dateInfo && !s.month && !s.day) {
            return { ...s, year: dateInfo.year ?? s.year, month: dateInfo.month, day: dateInfo.day }
          }
          return s
        }))
      }
      // Aptikti papildomus tipus iš longtype lauko (pvz. soundtrack + studio)
      const longtypeM = wikitext.match(/\|\s*longtype\s*=([^\n|]+)/)
      const longtypeStr = (longtypeM?.[1] || '').toLowerCase()
      const extraTypes: AlbumType[] = []
      if (longtypeStr.includes('soundtrack')) extraTypes.push('soundtrack')
      if (longtypeStr.includes('compilation')) extraTypes.push('compilation')
      if (longtypeStr.includes('live')) extraTypes.push('live')
      if (longtypeStr.includes('ep')) extraTypes.push('ep')
      // Album žanrai iš `| genre = ...` infobox lauko → fuzzy match prieš
      // mūsų substyles taksonomy. matched ID'jai eis į POST payload'ą;
      // unmatched paliekam log'ui kad user'is matytų ką praleidom (galimai
      // pridėti naują substyle ranka per Settings).
      const rawGenres = parseAlbumGenres(wikitext)
      const { ids: substyleIds, unmatched } = matchGenresToSubstyleIds(rawGenres, substylesList)
      const matchedNames = substyleIds.map(id => substylesList.find(s => s.id === id)?.name).filter(Boolean) as string[]
      setItems(p => p.map((it, i) => i === idx ? { ...it, tracks, fetched: true, cover_image_url: cover || it.cover_image_url, year: it.year || dateInfo.year, month: it.year ? (dateInfo.year === it.year ? dateInfo.month : it.month) : dateInfo.month, day: it.year ? (dateInfo.year === it.year ? dateInfo.day : it.day) : dateInfo.day, extraTypes: extraTypes.length ? extraTypes : it.extraTypes, substyle_ids: substyleIds, genres_unmatched: unmatched } : it))
      const genreLog = matchedNames.length ? `, žanrai: ${matchedNames.join(', ')}` : ''
      // Unmatched žanrai NĖRA praleidžiami — jie bus auto-pridėti į substyles
      // lentelę importo metu (per resolveSubstyleIds → INSERT su slug).
      const unmatchedLog = unmatched.length ? ` (+nauji: ${unmatched.join(', ')})` : ''
      addLog(`  → ${tracks.length} dainų${cover ? ', viršelis' : ''}${genreLog}${unmatchedLog}`)
    } catch {
      setItems(p => p.map((it, i) => i === idx ? { ...it, fetched: true, tracks: [] } : it))
      addLog(`  ✗ ${item.title}`)
    }
  }

  const fetchAllDetails = async () => {
    for (let i = 0; i < items.length; i++) {
      if (selected.has(i) && !items[i].fetched) { await fetchDetails(i); await new Promise(r => setTimeout(r, 400)) }
    }
  }

  // ── Albumų importas ────────────────────────────────────────────────────────

  const importAlbums = async () => {
    const indices = Array.from(selected).sort((a,b) => a-b)
    const unfetched = indices.filter(i => !items[i].fetched)
    if (unfetched.length) {
      addLog(`📋 Kraunama ${unfetched.length}...`)
      for (const i of unfetched) { await fetchDetails(i); await new Promise(r => setTimeout(r, 400)) }
    }
    // Snapshot PO fetchDetails kad turėtų cover_image_url ir tracks
    // Naudojame funkcinį update kad gauti naujausią state
    const snapshot = await new Promise<typeof items>(resolve => {
      setItems(p => { resolve(p); return p })
    })
    setImporting(true)
    startTask('import', `Importuojama: ${artistName}`)
    let ok = 0, enriched = 0, fail = 0
    for (const idx of indices) {
      const item = snapshot[idx]
      if (!item) continue
      setItems(p => p.map((it, i) => i === idx ? { ...it, importing: true } : it))

      // ── ENRICH EXISTING (2026-05-15 redesign) ────────────────────────────
      // Jei album jau egzistuoja DB (per music.lt scrape arba ankstesnis Wiki
      // import), NE skip — vietoj to "enrich'inam" Wiki info'ja BE perrašymo:
      //   • leidimo data, viršelis — FILL-ONLY (jei DB tuščia)
      //   • peak chart, sertifikacijos — REPLACE (Wiki canonical šaltinis)
      //   • žanrai — UNION (pridedami prie esamų)
      //   • type flags — PROMOTE-ONLY (Wiki sako compilation → set true; FALSE
      //     niekada nesetinama, kad neprarastume music.lt type žymėjimo)
      // Per album.tracks — match per name + PATCH /enrich (is_single PROMOTE,
      // release_year FILL-ONLY).
      // Backend'as: /api/albums/[id]/enrich + /api/tracks/[id]/enrich
      if (item.duplicate && item.duplicateId) {
        try {
          const enrichBody: Record<string, any> = {}
          if (item.year) enrichBody.year = item.year
          if (item.month) enrichBody.month = item.month
          if (item.day) enrichBody.day = item.day
          if (item.cover_image_url) enrichBody.cover_image_url = item.cover_image_url
          if (item.certifications?.length) enrichBody.certifications = item.certifications
          if (item.peak_chart_position != null) enrichBody.peak_chart_position = item.peak_chart_position
          if (item.substyle_ids?.length) enrichBody.substyle_ids = item.substyle_ids
          if (item.genres_unmatched?.length) enrichBody.substyle_names = item.genres_unmatched
          // Type flags — Wiki = CANONICAL šaltinis (2026-05-15 sprendimas).
          // Anksčiau buvo PROMOTE-ONLY → music.lt scrape klaidos liko (pvz Queen
          // turėjo 21 albumą nors realiai yra mažiau, kompiliacijos buvo paženk-
          // lintos kaip studijinės). Dabar siunčiam VISUS type signal'us pagal
          // Wiki, backend REPLACE'ina visą set'ą.
          enrichBody.type_studio = item.type === 'studio' || !!item.extraTypes?.includes('studio')
          enrichBody.type_ep = item.type === 'ep' || !!item.extraTypes?.includes('ep')
          enrichBody.type_single = item.type === 'single'
          enrichBody.type_compilation = item.type === 'compilation' || !!item.extraTypes?.includes('compilation')
          enrichBody.type_live = item.type === 'live' || !!item.extraTypes?.includes('live')
          enrichBody.type_remix = item.type === 'remix'
          enrichBody.type_covers = item.type === 'covers'
          enrichBody.type_soundtrack = item.type === 'soundtrack' || !!item.extraTypes?.includes('soundtrack')
          enrichBody.type_demo = item.type === 'demo'
          enrichBody.type_holiday = item.type === 'holiday'

          // Auto-link matched tracks + Wiki canonical title promotion.
          // Siunčiam matched_tracks: [{id, wiki_title}] formatą — backend
          // (1) prijungia track'us, kurie dar nelinkint'i prie šio album'o
          // (Seven Seas of Rhye edge case), (2) jei DB title skiriasi nuo Wiki
          // tik formatu (norm sutampa), atnaujina į Wiki canonical (pvz
          // 'Fairy feller's master stroke' → 'The Fairy Feller's Master-Stroke').
          //
          // 2026-05-19: AUTO-FETCH trackDuplicateMap prieš enrich call jei
          // admin nebuvo expanded album'o. Anksčiau matched_tracks siunčiama
          // TIK jei trackDuplicateMap jau loaded (per expand) → batch importas
          // be expand'ų NIEKO neprijungdavo. Dabar pre-fetch garantuoja, kad
          // matched-but-not-linked tracks visada bus auto-link'inami.
          let effectiveDupMap = item.trackDuplicateMap
          if (!effectiveDupMap && item.tracks?.length && item.duplicate) {
            try {
              effectiveDupMap = await checkTrackDuplicates(item.tracks.map(t => t.title), artistId)
              // Update state so UI reflects (post-import the dialog can re-render correct counts)
              setItems(p2 => p2.map((x, ix) => ix === idx ? { ...x, trackDuplicateMap: effectiveDupMap } : x))
            } catch { /* fail silent — fallback to non-linked behavior */ }
          }
          if (effectiveDupMap && item.tracks?.length) {
            const matchedTracks: { id: number; wiki_title: string; featuring?: string[] }[] = []
            for (const wt of item.tracks) {
              const dupId = effectiveDupMap[wt.title.toLowerCase()]
              if (dupId) {
                const entry: any = { id: dupId, wiki_title: wt.title }
                // Featuring iš Wiki — backend syncTrackFeaturing UNION'iškai
                // prides David Bowie tipo featuring jei dar nelinkint'i.
                if (wt.featuring && wt.featuring.length > 0) entry.featuring = wt.featuring
                matchedTracks.push(entry)
              }
            }
            if (matchedTracks.length > 0) enrichBody.matched_tracks = matchedTracks
          }

          // Per-track admin pasirinkimas: kurias Wiki-only dainas TAIP PAT
          // sukurti DB ir prijungti prie šio (esamo) album'o. Filter'inam tik
          // tas, kurios:
          //   1. yra šio album'o tracks listing'e (item.tracks)
          //   2. NEMATCH'INO DB (trackDuplicateMap nerodė ID)
          //   3. admin pažymėjo checkbox'u (selectedNewTracks[idx] turi title)
          const checkedTitles = selectedNewTracks[idx]
          if (checkedTitles && checkedTitles.size > 0 && item.tracks?.length) {
            const tracksToCreate: any[] = []
            for (const wt of item.tracks) {
              const titleLower = wt.title.toLowerCase()
              if (!checkedTitles.has(titleLower)) continue
              // Sanity: jei trackDuplicateMap rodo ID — vadinasi DB jau turi,
              // skip (toks atvejis turėtų būti praleistas UI lygyje)
              if (item.trackDuplicateMap?.[titleLower]) continue
              const tAny = wt as any
              const ry = tAny.release_year ?? item.year
              const rm = tAny.release_month ?? item.month
              const rd = tAny.release_day ?? item.day
              tracksToCreate.push({
                title: wt.title,
                type: wt.type || 'normal',
                is_single: !!wt.is_single,
                release_year: ry || null,
                release_month: rm || null,
                release_day: rd || null,
                // Featuring iš Wiki — backend syncTrackFeaturing prijungs DB
                // artists (jei egzistuoja) ar sukurs naujus per findOrCreateArtist.
                featuring: wt.featuring && wt.featuring.length > 0 ? wt.featuring : undefined,
              })
            }
            if (tracksToCreate.length > 0) enrichBody.tracks_to_create = tracksToCreate
          }

          const albRes = await fetch(`/api/albums/${item.duplicateId}/enrich`, {
            method: 'PATCH', headers: {'Content-Type':'application/json'},
            body: JSON.stringify(enrichBody),
          })
          if (!albRes.ok) {
            const errText = await albRes.text().catch(() => '')
            throw new Error(`enrich ${albRes.status}: ${errText.slice(0,120)}`)
          }
          const albResult = await albRes.json().catch(() => ({}))
          const albApplied = albResult?.applied || {}
          const albCompleteness = albResult?.completeness || null

          // Per album.tracks — match per name + PATCH /enrich
          let tracksTouched = 0
          if (item.tracks?.length) {
            const trackTitles = item.tracks.map(t => t.title)
            const trackDups = await checkTrackDuplicates(trackTitles, artistId)
            for (const wt of item.tracks) {
              const dupId = trackDups[wt.title.toLowerCase()]
              if (!dupId) continue  // Wiki-only track — paliekam, ne create new
              const tAny = wt as any
              const trackBody: Record<string, any> = {}
              const ry = tAny.release_year ?? item.year
              if (ry) trackBody.release_year = ry
              if (tAny.release_month ?? item.month) trackBody.release_month = tAny.release_month ?? item.month
              if (tAny.release_day ?? item.day) trackBody.release_day = tAny.release_day ?? item.day
              if (wt.is_single) trackBody.is_single = true
              // Wiki canonical title — backend CLEAN-ONLY promote (jei
              // norm(wiki)==norm(db) bet skiriasi formatas).
              if (wt.title) trackBody.title = wt.title
              if (Object.keys(trackBody).length > 0) {
                try {
                  await fetch(`/api/tracks/${dupId}/enrich`, {
                    method: 'PATCH', headers: {'Content-Type':'application/json'},
                    body: JSON.stringify(trackBody),
                  })
                  tracksTouched++
                } catch {}
              }
            }
          }
          // Detalus log'as — admin'ui matosi KAS buvo pakeista, ne tik "ok"
          const parts: string[] = []
          if (albApplied.year) parts.push(`data ${albApplied.year}`)
          if (albApplied.cover_image_url) parts.push('viršelis')
          if (albApplied.peak_chart_position) parts.push(`#${albApplied.peak_chart_position}`)
          if (albApplied.certifications) parts.push(`${albApplied.certifications} cert`)
          if (albApplied.substyles_added) parts.push(`+${albApplied.substyles_added} žanras`)
          if (albApplied.type_replaced?.length) parts.push(`type: ${albApplied.type_replaced.join(' ')}`)
          if (albApplied.type_promoted?.length) parts.push(albApplied.type_promoted.join('+'))  // back-compat
          if (albApplied.tracks_created) parts.push(`+${albApplied.tracks_created} naujos dainos`)
          if (albApplied.tracks_linked_existing) parts.push(`+${albApplied.tracks_linked_existing} prijungtos`)
          if (albApplied.tracks_auto_linked) parts.push(`+${albApplied.tracks_auto_linked} auto-link`)
          if (albApplied.titles_updated) parts.push(`${albApplied.titles_updated} pervadinta`)
          if (albApplied.featuring_added) parts.push(`+${albApplied.featuring_added} feat.`)
          if (albApplied.tracks_create_featuring) parts.push(`+${albApplied.tracks_create_featuring} feat. naujiems`)
          if (tracksTouched) parts.push(`${tracksTouched} dainos papildytos`)
          const detail = parts.length ? `: ${parts.join(', ')}` : ' (nieko naujo — DB jau pilna)'
          addLog(`↻ ${item.title}${detail}`)
          enriched++
          setItems(p => p.map((it, i) => i === idx
            ? { ...it, importing: false, imported: true, completeness: albCompleteness || it.completeness }
            : it
          ))
          setSelected(p => { const s = new Set(p); s.delete(idx); return s })
          continue
        } catch (e: any) {
          setItems(p => p.map((it, i) => i === idx ? { ...it, importing: false, error: `enrich: ${e.message}` } : it))
          addLog(`✗ ${item.title}: enrich nepavyko: ${e.message}`); fail++
          continue
        }
      }

      try {
        const res = await fetch('/api/albums', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            title: item.title, artist_id: artistId, year: item.year||null, month: item.month||null, day: item.day||null,
            cover_image_url: item.cover_image_url||'',
            certifications: item.certifications?.length ? item.certifications : null,
            peak_chart_position: item.peak_chart_position ?? null,
            // Substyles: matched IDs + unmatched names. Server'is bandys
            // resolve'inti vardus per fuzzy match (atvejui jei taksonomija
            // buvo papildyta po fetchDetails); jei vis tiek neranda —
            // INSERT'ins naują substyle row'ą ir naudos jį. Tai automatiškai
            // praplečia mūsų taksonomy Wikipedia importų metu.
            substyle_ids: item.substyle_ids?.length ? item.substyle_ids : undefined,
            substyle_names: item.genres_unmatched?.length ? item.genres_unmatched : undefined,
            type_studio: item.type==='studio' || item.extraTypes?.includes('studio') || false,
            type_ep: item.type==='ep' || item.extraTypes?.includes('ep') || false,
            type_single: item.type==='single',
            type_compilation: item.type==='compilation' || item.extraTypes?.includes('compilation') || false,
            type_live: item.type==='live' || item.extraTypes?.includes('live') || false,
            type_remix: item.type==='remix',
            type_covers: item.type==='covers',
            type_holiday: item.type==='holiday',
            type_soundtrack: item.type==='soundtrack' || item.extraTypes?.includes('soundtrack') || false,
            type_demo: item.type==='demo',
            tracks: (item.tracks||[]).map((t,i) => {
              // Priority: 1) parseTracklist'e prikabinta date iš albumo
              // {{Singles}} infobox'o (single1date / ...); 2) songs state
              // (jei user importavo Singles tab); 3) album year fallback.
              const tAny = t as any
              const trackYear = tAny.release_year ?? null
              const trackMonth = tAny.release_month ?? null
              const trackDay = tAny.release_day ?? null
              const songMatch = t.is_single ? songs.find(s => s.title.toLowerCase() === t.title.toLowerCase()) : null
              // Remix album'o pattern — VISI track'ai turi būti type='remix'
              // (originalas nesveikiną į remix versiją). Pvz. Britney "B in the
              // Mix: The Remixes" — "Toxic (Peter Rauhofer Mix)" yra atskira
              // remix versija, ne canonical "Toxic" track. parseTracklist
              // gauna type='normal' nes note nepateikia 'remix' — fix čia
              // post-processing'e per item.type.
              const isRemixAlbum = item.type === 'remix'
              const finalType = isRemixAlbum ? 'remix' : (t.type || 'normal')
              return {
                title: t.title, sort_order: i+1, duration: t.duration||null,
                type: finalType, disc_number: t.disc_number||1,
                // Remix album'e tracks niekada nėra singles (jie yra alt versija)
                is_single: isRemixAlbum ? false : (t.is_single||false),
                featuring: t.featuring||[],
                release_year: trackYear ?? songMatch?.year ?? item.year ?? null,
                release_month: trackMonth ?? songMatch?.month ?? null,
                release_day: trackDay ?? songMatch?.day ?? null,
              }
            }),
          }),
        })
        if (!res.ok) throw new Error((await res.json()).error)
        const newAlbum = await res.json()
        const albumId = newAlbum.id || newAlbum.album?.id
        addLog(`✓ ${item.title} (${item.tracks?.length||0})`)
        ok++
        if (albumId && item.tracks?.length)
          await enrichTracks(albumId, artistName, addLog, true, (done, total) => updateTask('import', `${item.title}: ${done}/${total}`))
        setItems(p => p.map((it, i) => i === idx ? { ...it, importing: false, imported: true } : it))
        setSelected(p => { const s = new Set(p); s.delete(idx); return s })
      } catch (e: any) {
        setItems(p => p.map((it, i) => i === idx ? { ...it, importing: false, error: e.message } : it))
        addLog(`✗ ${item.title}: ${e.message}`); fail++
      }
      await new Promise(r => setTimeout(r, 200))
    }
    addLog(`✓ ${ok} naujų albumų, ${enriched} papildyta${fail ? `, ${fail} klaida` : ''}`)

    // ─── AUTO-CASCADE: YT enrich + LRCLib lyrics + score recalc ──────────
    // 2026-05-15: po Wiki overlay'aus automatiškai paleidžiam:
    //   1) YT enrich kiekvienam track be video_url (type=normal, skip live/remix)
    //   2) LRCLib search kiekvienam track be lyrics (skip instrumental)
    //   3) Artist score recalc — composite atspindi naujus video_views
    // Tikslas: vienu klikiu album'ai turi tapti pilnai ✓ sutvarkyta.
    const importedAlbumIds: number[] = []
    for (const idx of indices) {
      const it = snapshot[idx]
      if (!it) continue
      if (it.duplicate && it.duplicateId) importedAlbumIds.push(it.duplicateId)
    }
    if (importedAlbumIds.length > 0) {
      updateTask('import', 'auto-enrich: kraunama track sąrašai...')
      try {
        // Re-fetch completeness po importo, kad tikrai turėtume aktualų state
        const completenessByAlbum = new Map<number, any>()
        await Promise.all(importedAlbumIds.map(async aid => {
          try {
            const r = await fetch(`/api/albums/${aid}/completeness`)
            if (r.ok) {
              const d = await r.json()
              if (d?.completeness) completenessByAlbum.set(aid, d.completeness)
            }
          } catch {}
        }))
        // Visi unique tracks su issues (video arba lyrics missing)
        const tracksNeedingYt = new Map<number, string>()  // id → title
        const tracksNeedingLyrics = new Map<number, string>()
        for (const [, comp] of completenessByAlbum) {
          for (const t of comp.tracks || []) {
            if (t.missing?.includes('video')) tracksNeedingYt.set(t.id, t.title)
            if (t.missing?.includes('lyrics')) tracksNeedingLyrics.set(t.id, t.title)
          }
        }
        const ytCount = tracksNeedingYt.size
        const lyrCount = tracksNeedingLyrics.size
        if (ytCount > 0 || lyrCount > 0) {
          addLog(`🔧 Auto-enrich: ${ytCount} dainų ieškoti YT + ${lyrCount} dainų ieškoti lyrics`)
        }

        // YT enrich sequentially (rate-limit safe)
        let ytFound = 0
        let ytI = 0
        for (const [tid, ttitle] of tracksNeedingYt) {
          ytI++
          updateTask('import', `YT enrich: ${ytI}/${ytCount} (${ttitle.slice(0, 30)})`)
          try {
            const r = await fetch(`/api/admin/yt/track/${tid}/enrich`, { method: 'POST' })
            if (r.ok) {
              const d = await r.json().catch(() => ({}))
              if (d?.videoUrl || d?.wasFound) ytFound++
            }
          } catch {}
          await new Promise(r => setTimeout(r, 300))
        }
        if (ytCount > 0) addLog(`  YouTube: rasta ${ytFound}/${ytCount}`)

        // LRCLib lyrics sequentially
        let lyrFound = 0
        let lyrI = 0
        for (const [tid, ttitle] of tracksNeedingLyrics) {
          lyrI++
          updateTask('import', `Lyrics: ${lyrI}/${lyrCount} (${ttitle.slice(0, 30)})`)
          try {
            const r = await fetch('/api/admin/lyrics/lrclib', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ track_id: tid }),
            })
            if (r.ok) {
              const d = await r.json().catch(() => ({}))
              if (d?.found) lyrFound++
            }
          } catch {}
          await new Promise(r => setTimeout(r, 200))
        }
        if (lyrCount > 0) addLog(`  Lyrics: rasta ${lyrFound}/${lyrCount}`)

        // Final: artist score recalc — query param (ne body)
        updateTask('import', 'Score recalc...')
        try {
          await fetch(`/api/admin/recalc-artist-cascade?artist_id=${artistId}`, { method: 'POST' })
          addLog(`  Score recalc atliktas`)
        } catch (e: any) {
          addLog(`  ⚠ Score recalc nepavyko: ${e?.message}`)
        }

        // Refresh completeness UI state po viso enrich
        await Promise.all(importedAlbumIds.map(async aid => {
          try {
            const r = await fetch(`/api/albums/${aid}/completeness`)
            if (r.ok) {
              const d = await r.json()
              if (d?.completeness) {
                setItems(p => p.map(it => it.duplicateId === aid ? { ...it, completeness: d.completeness } : it))
              }
            }
          } catch {}
        }))
      } catch (e: any) {
        addLog(`✗ Auto-enrich klaida: ${e?.message}`)
      }
    }
    setImporting(false)
    if (fail > 0) errorTask('import', `${ok} naujų + ${enriched} papildyta, ${fail} klaidos`)
    else finishTask('import', `${ok} naujų + ${enriched} papildyta + auto-enrich`)

    // Pranešti parent page kad diskografija pasikeitė — kad atnaujintų sąrašą
    if (ok > 0 || enriched > 0) window.dispatchEvent(new CustomEvent('discography-updated'))

    // Po albumų importo — atnaujinti singlų dublikatų statusą
    // (dainos kurios buvo albumuose dabar yra DB, todėl singlų sąraše jos turėtų rodyti "jau yra")
    if (ok > 0 && songs.length > 0) {
      try {
        const dups = await checkTrackDuplicates(songs.map(s => s.title), artistId)
        setSongs(p => p.map(s => {
          const k = s.title.toLowerCase()
          if (dups[k]) return { ...s, duplicate: true, duplicateId: dups[k], selected: false }
          return s
        }))
        const newDupCount = Object.keys(dups).length
        if (newDupCount > 0) addLog(`  ℹ️ ${newDupCount} singlų jau DB (albumuose)`)
      } catch {}
    }
  }

  // ── Dainų importas ─────────────────────────────────────────────────────────

  const importSongs = async () => {
    const toImport = songs.filter(s => s.selected && !s.duplicate && !s.imported)
    if (!toImport.length) return
    setImporting(true)
    startTask('import-singles', `Singlai: ${artistName}`)
    let okNew = 0, okMark = 0, fail = 0, songsDone = 0
    addLog(`🎤 ${toImport.length} dainų...`)

    // Prieš importą: surinkti singlų datas iš VISŲ albumų wikitext'ų
    // Naudojame tą patį mechanizmą kaip fetchDetails — parseSinglesFromInfobox
    const extraDates = new Map<string, { year: number|null; month: number|null; day: number|null }>()
    const needsDates = toImport.filter(s => !s.month)
    if (needsDates.length > 0) {
      // Surinkti wikiTitle iš: (a) items su wikiTitle, (b) albumTitle iš songs
      const wikiTitlesFromItems = items
        .filter(it => it.wikiTitle)
        .map(it => it.wikiTitle!)
      const albumTitlesFromSongs = [...new Set(
        needsDates.filter(s => s.albumTitle).map(s => s.albumTitle!.replace(/ /g, '_'))
      )]
      const allTitles = [...new Set([...wikiTitlesFromItems, ...albumTitlesFromSongs])]

      if (allTitles.length > 0) {
        addLog(`📅 Datos iš ${allTitles.length} albumų...`)
        for (const baseTitle of allTitles) {
          try {
            let wt = await fetchWikitext(baseTitle)
            // Jei nėra {{Singles}} — bandyti su _(album) sufiksu
            if (!wt || (!wt.includes('{{Singles') && !wt.includes('{{singles'))) {
              const withAlbum = await fetchWikitext(baseTitle + '_(album)')
              if (withAlbum && (withAlbum.includes('{{Singles') || withAlbum.includes('{{singles'))) {
                wt = withAlbum
              }
            }
            if (wt) {
              const { dates } = parseSinglesFromInfobox(wt)
              for (const [dKey, dVal] of dates.entries()) {
                if (!extraDates.has(dKey)) extraDates.set(dKey, dVal)
                // Double A-side
                if (dKey.includes('/')) {
                  dKey.split('/').map(p => p.replace(/['\u2019\u2018\u201c\u201d"]/g, '').trim()).filter(Boolean)
                    .forEach(p => { if (!extraDates.has(p)) extraDates.set(p, dVal) })
                }
              }
            }
          } catch {}
          await new Promise(r => setTimeout(r, 150))
        }
        if (extraDates.size > 0) addLog(`✓ ${extraDates.size} singlų datų rasta`)
        else addLog(`⚠ Datų nerasta iš albumų infobox`)
      }
    }

    // Helper: surasti singlo viršelį ir datą iš Wikipedia puslapio
    // 2026-05-26: suffix order — artist-specific PIRMA, kad cover'iai (pvz.
    // Teddy Swims „What's Going On") nepataikytų į originalo (Marvin Gaye 1971)
    // wiki puslapį. Anksčiau buvo `['', '_(song)', ...]` → no-suffix grįždavo
    // Marvin Gaye'aus single page'ą su 1971-01-21 release date.
    const fetchSingleWikiInfo = async (songTitle: string): Promise<{ coverUrl: string; wikiDate: { year: number|null; month: number|null; day: number|null } | null }> => {
      let coverUrl = ''
      let wikiDate: { year: number|null; month: number|null; day: number|null } | null = null
      const wikiTitle = songTitle.replace(/ /g, '_')
      try {
        const suffixes = [`_(${artistName.replace(/ /g, '_')}_song)`, '_(single)', '_(song)', '']
        for (const suffix of suffixes) {
          const testTitle = wikiTitle + suffix
          const [testCover, testWt] = await Promise.all([
            fetchCoverImage(testTitle),
            fetchWikitext(testTitle)
          ])
          if (testCover) {
            coverUrl = testCover
            if (testWt && testWt.includes('released')) {
              wikiDate = parseReleaseDate(testWt)
            }
            break
          }
          if (testWt && testWt.includes('released')) {
            wikiDate = parseReleaseDate(testWt)
            break
          }
          await new Promise(r => setTimeout(r, 100))
        }
      } catch {}
      return { coverUrl, wikiDate }
    }

    for (const song of toImport) {
      setSongs(p => p.map(s => s.title === song.title ? { ...s, importing: true } : s))
      updateTask('import-singles', `${song.title} (${songsDone + 1}/${toImport.length})`)
      try {
        // Viršelis ir data iš singlo Wikipedia puslapio (bendras abiem šakoms)
        // Apostrophe normalization: match wiki-parser.ts normalizeSingleKey
        const key = song.title.toLowerCase().replace(/['’‘"]/g, '').trim()
        const extra = !song.month ? extraDates.get(key) : null
        const { coverUrl, wikiDate } = await fetchSingleWikiInfo(song.title)
        // 2026-05-26: artist's singles table data (`song.*`) is authoritative for
        // THIS artist's release date. Cover song'ams (Teddy Swims „What's Going On")
        // linked song page'as yra apie ORIGINALO atlikėjo release'ą (Marvin Gaye 1971-01-21)
        // — niekada netrauk year override iš wikiDate. wikiDate.month/day naudoti TIK kai jos year
        // sutampa su table year (signalizuoja, kad pataikėm į THIS artist'o page'ą).
        const finalYear = extra?.year ?? song.year ?? wikiDate?.year
        const wikiDateMatchesArtistYear = wikiDate?.year != null && finalYear != null && wikiDate.year === finalYear
        const finalMonth = extra?.month ?? song.month ?? (wikiDateMatchesArtistYear ? wikiDate?.month ?? null : null)
        const finalDay = extra?.day ?? song.day ?? (wikiDateMatchesArtistYear ? wikiDate?.day ?? null : null)

        if (song.duplicateId) {
          // PATCH: pažymėti kaip singlą, atnaujinti datą ir viršelį
          const patchBody: Record<string, any> = { is_single: true }
          if (finalYear) patchBody.release_year = finalYear
          if (finalMonth) patchBody.release_month = finalMonth
          if (finalDay) patchBody.release_day = finalDay
          if (coverUrl) patchBody.cover_url = coverUrl
          const res = await fetch(`/api/tracks/${song.duplicateId}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(patchBody) })
          if (!res.ok) {
            let errMsg = `PATCH ${res.status}`
            try { const d = await res.json(); errMsg = d.error || d.message || errMsg } catch {}
            throw new Error(errMsg)
          }
          okMark++
        } else {
          // Resolve featured artists -> artist IDs
          const featuring: number[] = []
          if (song.featuredArtists && song.featuredArtists.length > 0) {
            for (const fName of song.featuredArtists) {
              try {
                // 1) Tikrinti per check endpoint (slug + name ilike)
                let foundId: number | null = null
                const checkRes = await fetch('/api/artists?check=' + encodeURIComponent(fName))
                if (checkRes.ok) {
                  const checkArr = await checkRes.json()
                  if (Array.isArray(checkArr)) {
                    const exact = checkArr.find((a: any) => a.name.toLowerCase() === fName.toLowerCase())
                    if (exact) foundId = exact.id
                  }
                }
                // 2) Jei nerado — bandyti search (platesnė paieška)
                if (!foundId) {
                  const searchRes = await fetch('/api/artists?search=' + encodeURIComponent(fName) + '&limit=5')
                  if (searchRes.ok) {
                    const searchData = await searchRes.json()
                    const arr = Array.isArray(searchData) ? searchData : searchData.artists || []
                    const exact = arr.find((a: any) => a.name.toLowerCase() === fName.toLowerCase())
                    if (exact) foundId = exact.id
                  }
                }
                // 3) Jei vis dar nerado — sukurti naują per /api/artists/import (su Wikipedia info)
                if (!foundId) {
                  const wikiTitle = fName.replace(/ /g, '_')
                  const createRes = await fetch('/api/artists/import', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      name: fName,
                      wiki_title: wikiTitle,
                      type: 'solo',
                    }),
                  })
                  if (createRes.ok) {
                    const created = await createRes.json()
                    foundId = created.artist_id || created.id || null
                  }
                }
                if (foundId) {
                  featuring.push(foundId)
                  addLog('  feat. ' + fName + ' -> id ' + foundId)
                } else {
                  addLog('  feat. ' + fName + ' -> nepavyko rasti/sukurti')
                }
              } catch (e: any) {
                addLog('  feat. ' + fName + ' -> klaida: ' + (e.message || e))
              }
            }
          }

          const res = await fetch('/api/tracks', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({
              title: song.title, artist_id: artistId, type: 'normal', is_single: true,
              release_year: finalYear,
              release_month: finalMonth,
              release_day: finalDay,
              cover_url: coverUrl || undefined,
              featuring: featuring.length > 0 ? featuring : undefined,
            }),
          })
          if (!res.ok) {
            let errMsg = `POST ${res.status}`
            try { const d = await res.json(); errMsg = d.error || d.message || errMsg } catch {}
            throw new Error(errMsg)
          }
          const newTrack = await res.json()
          const trackId = newTrack.id || newTrack.track?.id
          if (trackId) {
            const updates: Record<string, any> = {}
            // YouTube
            try {
              const ytUrl = await findYouTubeViaYTMusic(artistName, song.title, addLog)
              if (ytUrl) updates.video_url = ytUrl
              updates.youtube_searched_at = new Date().toISOString()
            } catch {}
            // Lyrics
            try {
              const r = await fetch(`/api/search/lyrics?artist=${encodeURIComponent(artistName)}&title=${encodeURIComponent(song.title)}`)
              if (r.ok) { const d = await r.json(); if (d.lyrics) updates.lyrics = d.lyrics }
              updates.lyrics_searched_at = new Date().toISOString()
            } catch {}
            if (Object.keys(updates).length > 0) {
              try { await fetch(`/api/tracks/${trackId}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(updates) }) } catch {}
            }
          }
          okNew++
        }
        setSongs(p => p.map(s => s.title === song.title ? { ...s, importing: false, imported: true } : s))
      } catch (e: any) {
        setSongs(p => p.map(s => s.title === song.title ? { ...s, importing: false, error: e.message } : s))
        addLog(`✗ ${song.title}: ${e.message}`); fail++
      }
      await new Promise(r => setTimeout(r, 150))
      songsDone++
    }
    setImporting(false)
    addLog(`✓ ${okNew} singlų importuota${okMark ? `, ${okMark} pažymėta` : ''}${fail ? `, ${fail} klaida` : ''}`)
    if (fail > 0) errorTask('import-singles', `${okNew + okMark} importuota, ${fail} klaidos`)
    else finishTask('import-singles', `${okNew + okMark} singlų importuota`)
    if (okNew + okMark > 0) window.dispatchEvent(new CustomEvent('discography-updated'))
  }

  // ── UI helpers ─────────────────────────────────────────────────────────────

  const toggleSelect = (i: number) => {
    // 2026-05-15 redesign: duplikatai turi būti toggleable (enrich logic'a),
    // tik already-imported skipinam.
    if (items[i]?.imported) return
    setSelected(p => { const s = new Set(p); s.has(i) ? s.delete(i) : s.add(i); return s })
  }

  // ── Delete + Hide handlers ──────────────────────────────────────────────
  // 2026-05-15: admin iteratively cleans up; reikia galimybės pašalinti
  // junk DB albums (delete) arba pažymėti kad jie OK (hide → future Wiki
  // importai nerodys kaip needing-attention).

  const deleteAlbumFromDb = async (i: number) => {
    const item = items[i]
    if (!item?.duplicateId) return
    if (!confirm(`Ištrinti album'ą "${item.title}" iš DB?\n\nKartu bus ištrintos jo dainos, jei jos nepriklauso kitiems albums.\n\nVeiksmas negali būti atšauktas.`)) return
    try {
      const res = await fetch(`/api/albums/${item.duplicateId}?deleteTracks=true`, { method: 'DELETE' })
      if (!res.ok) {
        addLog(`✗ ${item.title}: delete nepavyko (${res.status})`)
        return
      }
      addLog(`🗑 ${item.title} ištrintas iš DB`)
      // Remove from list visually
      setItems(p => p.filter((_, idx) => idx !== i))
      setSelected(p => { const s = new Set(p); s.delete(i); return s })
      window.dispatchEvent(new CustomEvent('discography-updated'))
    } catch (e: any) {
      addLog(`✗ ${item.title}: ${e.message}`)
    }
  }

  const hideAlbumInDb = async (i: number) => {
    const item = items[i]
    if (!item?.duplicateId) return
    try {
      const res = await fetch(`/api/albums/${item.duplicateId}/wiki-status`, {
        method: 'PATCH', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ status: 'cleared' }),
      })
      const j = await res.json().catch(() => ({}))
      if (j.migration_pending) {
        addLog(`⚠ Hide reikia migracijos 20260515h. Iki tol — paslėpta tik šiai sesijai.`)
      } else if (!res.ok) {
        addLog(`✗ ${item.title}: hide nepavyko (${res.status})`)
        return
      } else {
        addLog(`🚫 ${item.title} paslėpta (cleared)`)
      }
      // Hide from current list (visual only)
      setItems(p => p.filter((_, idx) => idx !== i))
      setSelected(p => { const s = new Set(p); s.delete(i); return s })
    } catch (e: any) {
      addLog(`✗ ${item.title}: ${e.message}`)
    }
  }

  const hideWikiSuggestion = async (i: number) => {
    const item = items[i]
    if (!item) return
    try {
      const res = await fetch('/api/admin/wiki-ignore-album', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ artist_id: artistId, wiki_title: item.title }),
      })
      const j = await res.json().catch(() => ({}))
      if (j.migration_pending) {
        addLog(`⚠ Hide reikia migracijos 20260515h. Iki tol — paslėpta tik šiai sesijai.`)
      } else if (!res.ok) {
        addLog(`✗ ${item.title}: hide nepavyko (${res.status})`)
        return
      } else {
        addLog(`🚫 ${item.title} pridėta į Wiki ignore list`)
      }
      // Remove from current list
      setItems(p => p.filter((_, idx) => idx !== i))
      setSelected(p => { const s = new Set(p); s.delete(i); return s })
    } catch (e: any) {
      addLog(`✗ ${item.title}: ${e.message}`)
    }
  }

  const toggleSong = (title: string) => setSongs(p => p.map(s => s.title === title && !s.duplicate && !s.imported ? { ...s, selected: !s.selected } : s))
  const selectAllSongs = (val: boolean) => setSongs(p => p.map(s => s.duplicate || s.imported ? s : { ...s, selected: val }))

  // ── Wiki single alias / ignore action'ai ───────────────────────────────────
  // Susieti: admin'as pažymi, kad konkretus Wiki single title atitinka esamą
  // DB tracker'į (pvz „Angel" Wiki single = „Angel in the Snow" DB tracker'is).
  // Saugoma `tracks.wiki_aliases[]` lentelėje. Po to ateities import'uose
  // šis suggestion automatiškai bus markinamas kaip „jau yra".
  const linkAlias = async (songTitle: string, trackId: number, trackTitle: string) => {
    try {
      const res = await fetch('/api/admin/wiki-meta/alias', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_id: trackId, alias: songTitle }),
      })
      if (!res.ok) { addLog(`✗ Susiejimas nepavyko: ${songTitle}`); return }
      // Lokalus update'as — pažymėti kaip duplicate
      setWikiAliases(p => ({ ...p, [songTitle.toLowerCase()]: { trackId, trackTitle } }))
      setSongs(p => p.map(s => s.title === songTitle ? { ...s, duplicate: true, duplicateId: trackId, selected: false } : s))
      setLinkAliasFor(null); setAliasPickerQuery('')
      addLog(`🔗 ${songTitle} → ${trackTitle}`)
    } catch (e: any) {
      addLog(`✗ Susiejimo klaida: ${e?.message || ''}`)
    }
  }

  // Ignoruoti: admin'as pažymi, kad Wiki single suggestion'as neaktualus —
  // ateities import'uose jis nebebus rodomas. Saugoma `wiki_single_ignores`
  // lentelėje (artist_id, wiki_title) primary key.
  const ignoreWikiSong = async (songTitle: string) => {
    try {
      const res = await fetch('/api/admin/wiki-meta/ignore', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artist_id: artistId, wiki_title: songTitle }),
      })
      if (!res.ok) { addLog(`✗ Ignoravimas nepavyko: ${songTitle}`); return }
      setWikiIgnores(p => { const next = new Set(p); next.add(songTitle); return next })
      setSongs(p => p.filter(s => s.title !== songTitle))
      addLog(`🚫 Ignoruoti: ${songTitle}`)
    } catch (e: any) {
      addLog(`✗ Ignoravimo klaida: ${e?.message || ''}`)
    }
  }

  const closeModal = () => {
    if (importing) {
      // Importas vyksta — minimizuoti vietoj uždarymo
      setMinimized(true)
      // Pranešti header'iui kad modalas minimizuotas — jis gali rodyti "atidaryti" mygtuką
      window.dispatchEvent(new CustomEvent('discography-minimized', { detail: { open: true } }))
    } else {
      setOpen(false)
      setMinimized(false)
      window.dispatchEvent(new CustomEvent('discography-minimized', { detail: { open: false } }))
      onClose?.()
    }
  }
  const reopenModal = () => {
    setMinimized(false)
    window.dispatchEvent(new CustomEvent('discography-minimized', { detail: { open: false } }))
  }
  const handleOpen = () => {
    setOpen(true)
    // Pending fetch'as visada paleidžiamas atidarius — kad user'is matytų
    // music.lt pasiūlymus net jei nedaro Wiki search'o.
    fetchPending()
    if (!searched) { setSearched(true); setTimeout(() => search(), 100) }
  }

  // Klausyti header'io "atidaryti" signalo
  useEffect(() => {
    const handler = () => reopenModal()
    window.addEventListener('discography-reopen', handler)
    return () => window.removeEventListener('discography-reopen', handler)
  }, [])

  // Grouped by tab
  const studioItems = items.map((it, i) => ({ it, i })).filter(({ it }) => STUDIO_TYPES.includes(it.type))
  const otherItems = items.map((it, i) => ({ it, i })).filter(({ it }) => OTHER_TYPES.includes(it.type))

  const studioSelected = studioItems.filter(({ i }) => selected.has(i)).length
  const otherSelected = otherItems.filter(({ i }) => selected.has(i)).length
  const songSelectedCount = songs.filter(s => s.selected && !s.duplicate).length
  const songNewCount = songs.filter(s => !s.duplicate && !s.imported).length

  // Tab counts
  const studioImported = studioItems.filter(({ it }) => it.imported).length
  const otherImported = otherItems.filter(({ it }) => it.imported).length
  const songsImported = songs.filter(s => s.imported).length

  const tabCounts = {
    studio: studioItems.length,
    other: otherItems.length,
    singles: songs.length,
  }

  const tabImported = {
    studio: studioImported,
    other: otherImported,
    singles: songsImported,
  }

  const tabHasNew = {
    studio: studioItems.some(({ it }) => !it.duplicate && !it.imported),
    other: otherItems.some(({ it }) => !it.duplicate && !it.imported),
    singles: songs.some(s => !s.duplicate && !s.imported),
  }

  const toggleExpand = async (i: number) => {
    const willExpand = !expandedItems.has(i)
    setExpandedItems(p => { const s = new Set(p); willExpand ? s.add(i) : s.delete(i); return s })
    if (willExpand && !items[i].fetched) {
      await fetchDetails(i)
    }
    // Track-level duplicate check — per nested rows rodom ↻ enrich vs + naujas.
    // Daro vieną API call per album'ą (NE per track) ir cache'inam į items state.
    setTimeout(() => {
      setItems(p => {
        const cur = p[i]
        if (!willExpand || !cur || cur.trackDuplicateMap || !cur.tracks?.length) return p
        checkTrackDuplicates(cur.tracks.map(t => t.title), artistId).then(dups => {
          setItems(p2 => p2.map((x, idx) => idx === i ? { ...x, trackDuplicateMap: dups } : x))
        })
        return p
      })
    }, 0)
    // Auto-fetch completeness duplicate album'ams — kad per-track ✓/⚠
    // badges būtų matomi BEFORE enrich (admin gali patikrinti būklę).
    // Naujam album'ui (be duplicateId) — completeness'o nėra (nieko DB).
    setTimeout(() => {
      setItems(p => {
        const cur = p[i]
        if (!willExpand || !cur || !cur.duplicate || !cur.duplicateId || cur.completeness) return p
        fetch(`/api/albums/${cur.duplicateId}/completeness`)
          .then(r => r.ok ? r.json() : null)
          .then(d => {
            if (d?.completeness) {
              setItems(p2 => p2.map((x, idx) => idx === i ? { ...x, completeness: d.completeness } : x))
            }
          }).catch(() => {})
        return p
      })
    }, 0)
  }

  // Pre-load completeness ALL duplicate album'ams (ne tik expanded'iems) —
  // kad type-diff badge'as ir wiki_review_status filter'as veiktų iškart.
  // Naudojame batch'ą: po search'o + items setting'o, paimam visus
  // duplicate'us ir paraleliai fetch'inam completeness. Filter'inam tuos kur
  // wiki_review_status='cleared' (admin pažymėjo kaip OK, nerodyti).
  useEffect(() => {
    if (!items.length) return
    const needFetch = items
      .map((it, idx) => ({ it, idx }))
      .filter(({ it }) => it.duplicate && it.duplicateId && !it.completeness)
    if (needFetch.length === 0) return
    let cancelled = false
    Promise.all(needFetch.map(({ it, idx }) =>
      fetch(`/api/albums/${it.duplicateId}/completeness`)
        .then(r => r.ok ? r.json() : null)
        .then(d => ({ idx, completeness: d?.completeness || null }))
        .catch(() => ({ idx, completeness: null as any }))
    )).then(results => {
      if (cancelled) return
      setItems(p => {
        // Apply completeness; jei wiki_review_status='cleared' — pašalinam item
        const completenessByIdx: Record<number, any> = {}
        for (const r of results) completenessByIdx[r.idx] = r.completeness
        const updated = p.map((it, idx) => completenessByIdx[idx] ? { ...it, completeness: completenessByIdx[idx] } : it)
        return updated.filter(it => it.completeness?.wiki_review_status !== 'cleared')
      })
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length])

  // ── Album row renderer ─────────────────────────────────────────────────────

  // Computes a HUMAN-READABLE preview of what Wiki import will do for this
  // album. Returns array of action strings. Computed as diff between DB state
  // (from completeness) and Wiki data (from item.year/cover/peak/certs/etc.).
  // Examples:
  //   ['data 1974', 'viršelis', '+2 žanrai', 'peak #5', '2 cert', '+3 dainos prijungs']
  // Naudojama vietoj generic '↻ papildyti' badge'o — admin'as iškart mato
  // ką konkrečiai gaus, neturi hover'inti tooltip'o.
  const computeImportPreview = (it: DiscographyItem): string[] => {
    if (!it.duplicate) return []
    const c = it.completeness
    if (!c) return []  // dar neload'inta — neturim ką palyginti
    const out: string[] = []
    // Album metadata diff
    if (it.year && !c.has_year) out.push(`data ${it.year}`)
    if (it.cover_image_url && !c.has_cover) out.push('viršelis')
    const dbSubsCount = c.substyles_count
    const wikiSubsCount = (it.substyle_ids?.length || 0) + (it.genres_unmatched?.length || 0)
    if (wikiSubsCount > dbSubsCount) out.push(`+${wikiSubsCount - dbSubsCount} žanras`)
    if (it.peak_chart_position != null && !c.has_peak) out.push(`peak #${it.peak_chart_position}`)
    if (it.certifications?.length && !c.has_certifications) {
      out.push(`${it.certifications.length} cert`)
    }
    // Type change (Wiki canonical REPLACE)
    if (c.current_types) {
      const wikiTypes = new Set<string>([it.type, ...(it.extraTypes || [])].filter(Boolean) as string[])
      const dbTypes = new Set<string>(c.current_types)
      const added = [...wikiTypes].filter(t => !dbTypes.has(t))
      const removed = [...dbTypes].filter(t => !wikiTypes.has(t))
      const ltType = (k: string): string => ({
        studio: 'studijinis', compilation: 'kompiliacija', ep: 'EP',
        single: 'singlas', live: 'gyvas', remix: 'remix',
        covers: 'cover', holiday: 'šventinis', soundtrack: 'garso takelis', demo: 'demo',
      }[k] || k)
      if (added.length || removed.length) {
        const parts: string[] = []
        if (added.length) parts.push('+' + added.map(t => ltType(t as string)).join('+'))
        if (removed.length) parts.push('-' + removed.map(t => ltType(t as string)).join('+'))
        out.push(`type ${parts.join(' ')}`)
      }
    }
    // Tracks count delta
    const wikiTracksKnown = it.fetched && it.tracks !== undefined
    if (wikiTracksKnown) {
      const delta = (it.tracks?.length || 0) - c.tracks_count
      if (delta > 0) out.push(`+${delta} ${delta === 1 ? 'daina' : 'dainos'} prijungs`)
    }
    return out
  }

  const renderAlbumRow = (it: DiscographyItem, i: number) => {
    const isExpanded = expandedItems.has(i)
    const isFetching = it.fetched === false && expandedItems.has(i)
    // Compute "is album fully sutvarkyta" — duplicate mutually exclusive su
    // ↻ papildyti badge'u + background tint.
    // 2026-05-15: atskiriam DU tipus issues'ų:
    //   wikiCanHelp   — duomenys, kuriuos Wiki gali pateikti (year, cover,
    //                   genre, peak chart, count mismatch). Jei taip → papildyti.
    //   externalOnly  — duomenys, kuriuos Wiki neturi (video_url, lyrics).
    //                   Jei tik šie trūksta → ⚠ trūksta lieka, bet papildyti
    //                   NEBESIRODO (Wiki jau nieko negali pagelbėti).
    const wikiTrackCountAbs = it.fetched && it.tracks !== undefined ? it.tracks.length : null
    const wikiCountMismatch = !!(wikiTrackCountAbs !== null && it.completeness && it.completeness.tracks_count < wikiTrackCountAbs)
    const c = it.completeness
    const wikiCanHelp = !!(c && (
      !c.has_cover ||
      !c.has_year ||
      c.substyles_count === 0 ||
      wikiCountMismatch
    ))
    const externalIssues = !!(c && c.tracks.some(t => !t.complete))  // video/lyrics
    const isAlbumSutvarkyta = !!(c?.fully_complete && !wikiCountMismatch && !externalIssues)
    // ↻ papildyti rodom TIK kai Wiki gali padėti (ne vien external issues).
    const showPapildyti = !!(it.duplicate && !isAlbumSutvarkyta && wikiCanHelp)
    return (
      <div key={i} className={`rounded-lg border transition-all ${
        // 2026-05-15 redesign: duplicate atrodo kaip "enrich" — selectable +
        // amber tint (NE grayed out). Anksčiau atrodydavo unselectable, todėl
        // music.lt scrape'inti albums niekada negaudavo Wiki enrichment.
        // Sutvarkyta albums (po importo + auto-link) — žalias tint kaip
        // imported, kad row aiškiai būtų "done" net ir kai turi ↻ duplicate
        // marker'į.
        it.imported || isAlbumSutvarkyta ? 'border-emerald-200 bg-emerald-50/50'
        : selected.has(i) && it.duplicate ? 'border-amber-300 bg-amber-50'  // enrich-on-match
        : selected.has(i) ? 'border-violet-300 bg-violet-50'                // create new
        : it.duplicate ? 'border-amber-200 bg-amber-50/30'
        : 'border-gray-200 bg-white hover:border-gray-300'
      }`}>
        {/* Main row */}
        <div className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 cursor-pointer"
          onClick={() => !it.imported && toggleSelect(i)}>
          {/* Checkbox */}
          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
            selected.has(i) && !it.imported
              ? (it.duplicate ? 'border-amber-500 bg-amber-500' : 'border-violet-500 bg-violet-500')
              : 'border-gray-300'
          }`}>
            {selected.has(i) && !it.imported && (
              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            )}
            {it.imported && <svg className="w-2.5 h-2.5 text-emerald-500" fill="none" viewBox="0 0 10 10"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          </div>
          {/* Cover — tik jei yra nuotrauka */}
          {it.cover_image_url && (
            <img src={it.cover_image_url} alt="" referrerPolicy="no-referrer" className="w-8 h-8 sm:w-9 sm:h-9 rounded object-cover shrink-0" />
          )}
          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[14px] sm:text-sm font-medium text-gray-900 truncate">{it.title}</span>
              {it.type === 'ep' && <span className="text-[12px] font-semibold text-violet-500 shrink-0 uppercase tracking-wide">EP</span>}
              {it.extraTypes?.map(et => (
                <span key={et} className="text-[12px] font-semibold text-blue-400 shrink-0 uppercase tracking-wide">{et === 'soundtrack' ? 'Garso takelis' : et}</span>
              ))}
              {/* ↻ Action preview — specific lista what Wiki pridės. Vietoj
                  generic 'papildyti' badge'o, admin mato KONKREČIAI kas bus
                  daroma: 'pridurs: data 1974, peak #5, +2 cert'. Jei nieko
                  konkretaus — papildyti badge'as nerodomas (Wiki neturi
                  duomenų be to, ką DB jau turi). */}
              {showPapildyti && (() => {
                const preview = computeImportPreview(it)
                if (preview.length === 0) {
                  // Wiki gali padėti, bet konkretūs duomenys dar nežinom (completeness neload'inta)
                  return <span className="text-[12px] font-semibold text-amber-600 shrink-0" title="Wiki turi duomenų. Spausk info arba expand kad pamatytum kas konkrečiai.">↻ pridurs</span>
                }
                const inline = preview.slice(0, 3).join(', ') + (preview.length > 3 ? `, +${preview.length - 3}` : '')
                const tooltip = `Wiki pridurs:\n• ${preview.join('\n• ')}\n\nFILL-ONLY: egzistuojantys laukai neperrašomi.\nUNION žanrai, REPLACE cert/peak/type.`
                return <span className="text-[12px] font-semibold text-amber-600 shrink-0" title={tooltip}>↻ {inline}</span>
              })()}
              {/* Type diff preview — jei Wiki nori pakeisti type'ą po importo,
                  rodom 'studijinis → kompiliacija' badge'ą oranžiniu. Padeda
                  admin'ui suprasti kodėl Queen 21 studio → 15 po Wiki import'o. */}
              {it.duplicate && it.completeness?.current_types && (() => {
                const ltType = (k: string): string => ({
                  studio: 'studijinis', compilation: 'kompiliacija', ep: 'EP',
                  single: 'singlas', live: 'gyvas', remix: 'remix',
                  covers: 'cover', holiday: 'šventinis', soundtrack: 'garso takelis', demo: 'demo',
                }[k] || k)
                const wikiType = it.type
                const wikiExtras = it.extraTypes || []
                const wikiTypeSet = new Set<string>([wikiType, ...wikiExtras].filter(Boolean))
                const dbTypes = new Set(it.completeness.current_types)
                const added = [...wikiTypeSet].filter(t => !dbTypes.has(t as string))
                const removed = [...dbTypes].filter(t => !wikiTypeSet.has(t as string))
                if (added.length === 0 && removed.length === 0) return null
                const tooltip = `Po importo tipo flags:\n${[...wikiTypeSet].map(t => '+ '+ltType(t as string)).join('\n')}\n\nDabar DB:\n${[...dbTypes].map(t => '• '+ltType(t)).join('\n')}`
                return (
                  <span className="text-[12px] font-semibold text-orange-600 shrink-0 inline-flex items-center gap-1" title={tooltip}>
                    🔄 {removed.length > 0 && <span className="line-through opacity-60">{removed.map(t => ltType(t as string)).join('+')}</span>}
                    {added.length > 0 && <span>→ {added.map(t => ltType(t as string)).join('+')}</span>}
                  </span>
                )
              })()}
              {it.importing && <span className="text-[12px] text-violet-400 animate-pulse shrink-0">importuojama</span>}
              {it.imported && <span className="text-[12px] text-emerald-500 shrink-0">✓ importuota</span>}
              {/* Album completeness badge — trust server fully_complete=true
                  → ✓ sutvarkyta green. Žiūrim į:
                  • DB metadata pilnatva (cover/year/genre — has_cover etc.)
                  • DB tracks visos individualiai complete (video/year/lyrics)
                  • Jei Wiki tracks load'inti — palyginam count (mismatch=amber)
                  Po refresh badge išlieka žalias jei DB state'as nepasikeitė.
                  Wiki count mismatch detektuojam tik kai it.fetched=true. */}
              {it.completeness && (() => {
                const c = it.completeness
                const incompleteTracks = c.tracks.filter(t => !t.complete)
                const wikiTracksKnown = it.tracks !== undefined && it.fetched
                const wikiTrackCount = wikiTracksKnown ? (it.tracks?.length || 0) : null
                // 2026-05-19: matched-but-not-linked tracks — DB turi track
                // (per title match arba wiki_alias), bet album_tracks JOIN
                // šiam album'ui jo nėra. Anksčiau tas case nebuvo įtrauktas
                // į missing meta → collapse rodydavo ✓ sutvarkyta, expand —
                // ↻ +N daina prijungs warning. Dabar count'iname tuos kaip
                // "N neprijungtos" missing meta įrašą.
                const matchedNotLinkedCount = (it.trackDuplicateMap && it.tracks)
                  ? it.tracks.filter(wt => {
                      const dupId = it.trackDuplicateMap![wt.title.toLowerCase()]
                      return !!dupId && !c.tracks.find(t => t.id === dupId)
                    }).length
                  : 0
                const missingMeta: string[] = []
                if (!c.has_cover) missingMeta.push('viršelis')
                if (!c.has_year) missingMeta.push('data')
                if (c.substyles_count === 0) missingMeta.push('žanrai')
                if (wikiTrackCount !== null && c.tracks_count < wikiTrackCount) {
                  missingMeta.push(`${wikiTrackCount - c.tracks_count} dainos neprijungtos`)
                } else if (matchedNotLinkedCount > 0) {
                  // Same count via different path (DB has track but album_tracks
                  // missing). Avoid double-count when both checks fire.
                  missingMeta.push(`${matchedNotLinkedCount} ${matchedNotLinkedCount === 1 ? 'daina neprijungta' : 'dainos neprijungtos'}`)
                }
                const allOk = c.fully_complete && missingMeta.length === 0 && incompleteTracks.length === 0
                if (allOk) {
                  // 2026-05-19: jei Wiki tracklist dar neload'inta, NEgalime
                  // garantuoti pilno "sutvarkyta" status'o — gali pasirodyti
                  // matched-but-not-linked tracks po expand. Rodom preliminary
                  // status'ą `✓ DB pilna` (žalsvas amber), kad admin žinotų,
                  // jog Wiki dar nepatikrinta. Po expand'o → ✓ sutvarkyta.
                  if (!wikiTracksKnown) {
                    const tooltip = `DB metadata pilna:\n• Viršelis ${c.has_cover ? '✓' : '—'}\n• Leidimo data ${c.has_full_date ? '✓ (pilna)' : c.has_year ? '✓ (tik metai)' : '—'}\n• ${c.substyles_count} žanras\n• ${c.tracks_count} dainų DB — visos pilnos\n\nWiki tracklist DAR neload'inta — spausk ▼ palyginti su Wiki, ar nieko netrūksta tracklist'e.`
                    return <span className="text-[12px] font-semibold text-teal-600 shrink-0" title={tooltip}>✓ DB pilna</span>
                  }
                  const tooltip = `Sutvarkyta:\n• Viršelis ${c.has_cover ? '✓' : '—'}\n• Leidimo data ${c.has_full_date ? '✓ (pilna)' : c.has_year ? '✓ (tik metai)' : '—'}\n• ${c.substyles_count} žanras\n• ${c.tracks_count} dainų DB — visos pilnos\n• Wiki tracklist patikrinta — sutampa`
                  return <span className="text-[12px] font-semibold text-emerald-600 shrink-0" title={tooltip}>✓ sutvarkyta</span>
                }
                // Trūkumų label'as: inline'inam visus meta + dainų count.
                const inlineParts: string[] = [...missingMeta]
                if (incompleteTracks.length > 0) {
                  inlineParts.push(`${incompleteTracks.length} ${incompleteTracks.length === 1 ? 'daina' : 'dainos'}`)
                }
                const tooltipParts: string[] = []
                if (missingMeta.length > 0) tooltipParts.push('Album'+"'"+'as trūksta: ' + missingMeta.join(', '))
                if (incompleteTracks.length > 0) {
                  const ltLabel = (k: string) => k === 'video' ? 'video' : k === 'data' ? 'data' : k === 'lyrics' ? 'žodžiai' : k
                  const sample = incompleteTracks.slice(0, 5).map(t => `• ${t.title} (${t.missing.map(ltLabel).join(', ')})`).join('\n')
                  const more = incompleteTracks.length > 5 ? `\n  …ir dar ${incompleteTracks.length - 5}` : ''
                  tooltipParts.push(`${incompleteTracks.length} dainos nepilnos:\n${sample}${more}`)
                }
                // Kontekstinis hint suffix'as:
                const hasUnjoined = wikiTrackCount !== null && c.tracks_count < wikiTrackCount
                let suffix = ''
                if (hasUnjoined) suffix = ' (spausk Importuoti — auto-prijungs)'
                else if (!wikiCanHelp && externalIssues) suffix = ' (Wiki šito nepateikia — reikia rankinio darbo: YT, lyrics)'
                return (
                  <span className="text-[12px] font-semibold text-amber-700 shrink-0" title={tooltipParts.join('\n\n') + suffix}>
                    ⚠ trūksta: {inlineParts.join(', ')}
                  </span>
                )
              })()}
              {it.error && <span className="text-[12px] text-red-400 shrink-0" title={it.error}>klaida</span>}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {it.year && <span className="text-[14px] text-gray-400">{it.year}</span>}
              {it.tracks !== undefined && (
                <span className="text-[14px] text-gray-400 hidden sm:inline">
                  {it.tracks.length} dainų{it.tracks.filter(t=>t.is_single).length ? ` · ${it.tracks.filter(t=>t.is_single).length} singlai` : ''}
                </span>
              )}
              {/* Žanrų chip'ai — matched substyles pavadinimai, kad user'is
                  matytų prieš import'ą ką į DB įrašysim. Tylinčiai dingsta jei
                  fetchDetails dar nepalietė šio album'o (substyle_ids === undefined). */}
              {it.substyle_ids && it.substyle_ids.length > 0 && (
                <>
                  {it.substyle_ids.map(id => {
                    const name = substylesList.find(s => s.id === id)?.name
                    if (!name) return null
                    return (
                      <span key={id} className="text-[12px] px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
                        {name}
                      </span>
                    )
                  })}
                </>
              )}
              {it.duplicate && it.duplicateId && (
                <>
                  <a href={`/admin/albums/${it.duplicateId}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                    className="text-[12px] text-blue-500 hover:underline" title="Atidaryti album admin puslapyje">
                    DB →
                  </a>
                  {it.wikiTitle && (
                    <a href={`https://en.wikipedia.org/wiki/${encodeURIComponent(it.wikiTitle)}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                      className="text-[12px] text-emerald-600 hover:underline" title="Atidaryti Wikipedia album page'ą">
                      Wiki ↗
                    </a>
                  )}
                  {/* Legacy music.lt link — admin gali nuvažiuoti į senąjį
                      puslapį palyginti tracklist'ą, datas, viršelį ir t.t.
                      Plus likes/comments count signal'as kaip popular'us
                      šis album'as music.lt vartotojų — verta detaliai tvarkyti. */}
                  {it.completeness?.legacy_url && (
                    <a href={it.completeness.legacy_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                      className="text-[12px] text-orange-500 hover:underline" title="Atidaryti senąją music.lt album puslapį palyginimui">
                      music.lt ↗
                    </a>
                  )}
                  {it.completeness && (it.completeness.likes_count > 0 || it.completeness.comments_count > 0) && (
                    <span className="text-[12px] text-gray-400 inline-flex items-center gap-1.5" title={`Music.lt vartotojai: ${it.completeness.likes_count} like'ų, ${it.completeness.comments_count} komentarų`}>
                      {it.completeness.likes_count > 0 && <span className="inline-flex items-center gap-0.5">♥ {it.completeness.likes_count}</span>}
                      {it.completeness.comments_count > 0 && <span className="inline-flex items-center gap-0.5">💬 {it.completeness.comments_count}</span>}
                    </span>
                  )}
                </>
              )}
              {!it.duplicate && it.wikiTitle && (
                <a href={`https://en.wikipedia.org/wiki/${encodeURIComponent(it.wikiTitle)}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                  className="text-[12px] text-emerald-600 hover:underline" title="Atidaryti Wikipedia album page'ą">
                  Wiki ↗
                </a>
              )}
            </div>
          </div>
          {/* Parsisiųsti info — inline mygtukas */}
          {!it.duplicate && !it.imported && (
            <button type="button"
              onClick={e => { e.stopPropagation(); fetchDetails(i) }}
              disabled={it.fetched || importing}
              title={it.fetched ? 'Info parsisiųsta' : 'Parsisiųsti dainas ir viršelį'}
              className={`shrink-0 flex items-center gap-1 p-1.5 sm:px-2 sm:py-1 rounded-md text-xs transition-colors disabled:opacity-40 ${
                it.fetched
                  ? 'text-emerald-500 bg-emerald-50'
                  : 'text-gray-500 bg-gray-100 hover:bg-violet-100 hover:text-violet-600'
              }`}>
              {it.fetched ? (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 10 10"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              ) : (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 10 10"><path d="M5 1v6M2 6l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              )}
              <span className="hidden sm:inline">{it.fetched ? 'info' : 'info'}</span>
            </button>
          )}
          {/* DB album'as turi delete + hide buttons. Wiki-only (be duplicateId)
              turi tik "paslėpti" — kad future importai nerodytų. */}
          {it.duplicate && it.duplicateId && !it.imported && (
            <>
              <button type="button"
                onClick={e => { e.stopPropagation(); hideAlbumInDb(i) }}
                title="Paslėpti šį album'ą kaip 'sutvarkyta' — future Wiki importai nerodys"
                className="shrink-0 px-1.5 py-1 rounded text-[14px] text-gray-400 hover:text-orange-500 hover:bg-orange-50 transition-colors">
                🚫
              </button>
              <button type="button"
                onClick={e => { e.stopPropagation(); deleteAlbumFromDb(i) }}
                title="Ištrinti šį album'ą iš DB visam (su jo dainomis, jei nenaudojamos kitur)"
                className="shrink-0 px-1.5 py-1 rounded text-[14px] text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                ×
              </button>
            </>
          )}
          {!it.duplicate && !it.imported && (
            <button type="button"
              onClick={e => { e.stopPropagation(); hideWikiSuggestion(i) }}
              title="Paslėpti šį Wiki suggestion'ą — future importai nerodys"
              className="shrink-0 px-1.5 py-1 rounded text-[14px] text-gray-400 hover:text-orange-500 hover:bg-orange-50 transition-colors">
              🚫
            </button>
          )}
          {/* Expand tracks */}
          <button type="button"
            onClick={e => { e.stopPropagation(); toggleExpand(i) }}
            className={`shrink-0 w-6 h-6 rounded flex items-center justify-center text-[14px] transition-colors disabled:opacity-30 ${
              isExpanded ? 'bg-violet-100 text-violet-600' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'
            }`}
            title={isExpanded ? 'Slėpti dainas' : 'Rodyti dainas'}>
            {isExpanded ? '▲' : '▼'}
          </button>
        </div>
        {/* Tracks preview */}
        {isExpanded && (
          <div className="border-t border-gray-100 px-3 py-2">
            {/* ── DB vs Wiki snapshot — duplikate album'ams ─────────────── */}
            {it.duplicate && it.completeness && it.fetched && (() => {
              const c = it.completeness!
              const dbFacts: string[] = []
              dbFacts.push(c.has_cover ? '✓ viršelis' : '— be viršelio')
              dbFacts.push(c.has_year ? (c.has_full_date ? `✓ data (pilna)` : `✓ tik metai`) : '— be datos')
              dbFacts.push(c.substyles_count > 0 ? `✓ ${c.substyles_count} žanras` : '— be žanrų')
              dbFacts.push(`✓ ${c.tracks_count} dainų`)
              if (c.has_peak) dbFacts.push('✓ peak chart')
              if (c.has_certifications) dbFacts.push('✓ cert')
              const wikiPreview = computeImportPreview(it)
              return (
                <div className="mb-2 pb-2 border-b border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[14px]">
                  <div>
                    <div className="font-semibold text-gray-600 mb-1">DB turi:</div>
                    <div className="text-gray-500 leading-relaxed">{dbFacts.join(' · ')}</div>
                  </div>
                  <div>
                    <div className="font-semibold text-amber-700 mb-1">Wiki pridurs:</div>
                    {wikiPreview.length > 0 ? (
                      <div className="text-amber-700 leading-relaxed">{wikiPreview.join(' · ')}</div>
                    ) : (
                      <div className="text-gray-400 italic">Nieko naujo — Wiki = DB</div>
                    )}
                  </div>
                </div>
              )
            })()}
            {!it.fetched ? (
              <div className="text-xs text-gray-400 py-1 flex items-center gap-2">
                <div className="w-3 h-3 border border-gray-300 border-t-violet-500 rounded-full animate-spin" />
                Kraunama...
              </div>
            ) : !it.tracks?.length ? (
              <div className="text-xs text-gray-400 py-1">Dainų nerasta. Spausk „info" mygtuką kad parsisiųstum.</div>
            ) : (
              <>
                {/* Bulk "Wiki-only" pažymėjimas — rodomas tik enrich mode'e
                    (album.duplicate=true), kai trackDuplicateMap jau patikrintas
                    ir egzistuoja bent 1 Wiki track be DB match'o.
                    Vienu klikiu apima visus tinkamus + naujas import'ui. */}
                {it.duplicate && it.trackDuplicateMap && (() => {
                  const wikiOnly = it.tracks.filter(t => !it.trackDuplicateMap?.[t.title.toLowerCase()])
                  if (wikiOnly.length === 0) return null
                  const checkedSet = selectedNewTracks[i] || new Set<string>()
                  const allChecked = wikiOnly.every(t => checkedSet.has(t.title.toLowerCase()))
                  return (
                    <div className="flex items-center justify-between gap-2 mb-1.5 pb-1.5 border-b border-gray-100 text-[14px]">
                      <span className="text-gray-500">
                        {wikiOnly.length} dainų tik Wiki (DB neturi)
                      </span>
                      <button type="button"
                        onClick={e => {
                          e.stopPropagation()
                          setSelectedNewTracks(prev => {
                            if (allChecked) {
                              // Atžymėti visas
                              const cur = new Set(prev[i] || [])
                              for (const t of wikiOnly) cur.delete(t.title.toLowerCase())
                              return { ...prev, [i]: cur }
                            } else {
                              // Pažymėti visas Wiki-only
                              const cur = new Set(prev[i] || [])
                              for (const t of wikiOnly) cur.add(t.title.toLowerCase())
                              return { ...prev, [i]: cur }
                            }
                          })
                        }}
                        className={`px-2 py-0.5 rounded font-medium transition-colors ${
                          allChecked
                            ? 'text-violet-600 bg-violet-50 hover:bg-violet-100'
                            : 'text-violet-600 hover:bg-violet-50 border border-violet-200'
                        }`}>
                        {allChecked ? '☑ Visos pažymėtos — atžymėti' : `☐ Pažymėti visas ${wikiOnly.length}`}
                      </button>
                    </div>
                  )
                })()}
              <div className="space-y-0.5 max-h-48 overflow-y-auto">
                {it.tracks.map((t, ti) => {
                  // mapLoaded: ar jau patikrinom DB (skirtumas tarp "loading"
                  // ir "patikrinta, no match"). Be šito visi naujieji tracks
                  // be match'o atrodydavo nepatikrinti.
                  const mapLoaded = it.trackDuplicateMap !== undefined
                  const trackDupId = it.trackDuplicateMap?.[t.title.toLowerCase()]
                  // Per-track completeness state — ieškom DB track'o pagal ID
                  // it.completeness.tracks masyve. Jei nerasta (nematched arba
                  // completeness dar nefetch'inta) — badge'as nerodomas.
                  const trackComplete = trackDupId
                    ? it.completeness?.tracks.find(tc => tc.id === trackDupId)
                    : null
                  // MATCHED-BUT-NOT-LINKED: track yra DB pagal title, BET
                  // nelinkint'a į šį album'ą. Anksčiau šitam atvejui nieko
                  // nerodėm (silent state) → user'is nematė kuri daina
                  // problemų pora. Dabar rodom oranžinį '⊕ prijungti' badge'ą
                  // su DB link nuoroda, kad admin galėtų verify + spaust
                  // Importuoti auto-link'ui.
                  const matchedNotLinked = !!(
                    trackDupId
                    && it.completeness
                    && !it.completeness.tracks.find(tc => tc.id === trackDupId)
                  )
                  return (
                  <div key={ti} className="flex items-center gap-2 py-0.5">
                    <div className="flex items-center justify-end gap-0.5 w-5 shrink-0">
                      {t.is_single && <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" title="Singlas" />}
                      <span className="text-[12px] text-gray-300 tabular-nums">{t.sort_order}</span>
                    </div>
                    {/* Track title — click → /admin/tracks/{id} jei egzistuoja DB */}
                    {trackDupId ? (
                      <a href={`/admin/tracks/${trackDupId}`} target="_blank" rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="text-xs text-gray-700 truncate flex-1 hover:text-violet-600 hover:underline">
                        {t.title}
                        {t.featuring && t.featuring.length > 0 && (
                          <span className="text-violet-500 ml-1">feat. {t.featuring.join(', ')}</span>
                        )}
                      </a>
                    ) : (
                      <span className="text-xs text-gray-700 truncate flex-1">
                        {t.title}
                        {t.featuring && t.featuring.length > 0 && (
                          <span className="text-violet-500 ml-1">feat. {t.featuring.join(', ')}</span>
                        )}
                      </span>
                    )}
                    {/* Match status badge — rodom TIK įdomias būsenas:
                        + naujas    (violet) = NEW album'e visi tracks bus sukurti
                        ☐ tik Wiki  (gray)   = ENRICH album'e Wiki turi, DB neturi —
                                               default praleidžiama, BET admin gali
                                               pažymėti checkbox'u, kad būtų sukurta.
                        ENRICH'inami tracks (DB jau turi) NEturi badge'o — anksčiau
                        rodė '↻ papildyti' kiekvienai dainai, bet kadangi 99% tracks
                        yra papildomi, tai tiesiog noise. ✓/⚠ completeness badges
                        toliau rodo statusą. */}
                    {mapLoaded && (
                      // MATCHED-but-NOT-LINKED → oranžinis '⊕ prijungti' badge'as.
                      // Track yra DB pagal pavadinimą, bet album_tracks JOIN'o
                      // šiam album'ui nėra. Pvz Queen 1973 "Seven Seas of Rhye..."
                      // matched id=107616, bet linkint'a į kitą album'ą. Spausk
                      // Importuoti — auto-link prijungs prie šio album'o.
                      matchedNotLinked ? (
                        <a href={`/admin/tracks/${trackDupId}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                          className="text-[12px] font-semibold text-orange-600 shrink-0 hover:underline"
                          title={`Daina yra DB (id=${trackDupId}) bet nelinkint'a į šį album'ą. Spausk Importuoti — auto-link prijungs.\n\nKlikink badge'ą kad atidarytum DB įrašą patikrinti, ar tai tikrai ta pati daina (ne kitas variantas).`}>
                          ⊕ prijungti #{trackDupId}
                        </a>
                      ) : trackDupId ? null : it.duplicate ? (
                        // ENRICH mode + Wiki-only daina → checkbox + gray badge
                        <label className="flex items-center gap-1 cursor-pointer shrink-0" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={!!selectedNewTracks[i]?.has(t.title.toLowerCase())}
                            onChange={() => toggleNewTrack(i, t.title.toLowerCase())}
                            className="w-3 h-3 accent-violet-500"
                          />
                          <span className={`text-[12px] font-semibold ${selectedNewTracks[i]?.has(t.title.toLowerCase()) ? 'text-violet-600' : 'text-gray-400'}`} title="DB neturi šios dainos. Pažymėk jei nori, kad enrich taip pat sukurtų ir prijungtų prie esamo album'o. Default — praleidimas.">
                            {selectedNewTracks[i]?.has(t.title.toLowerCase()) ? '+ kurti' : '· tik Wiki'}
                          </span>
                        </label>
                      ) : (
                        // NEW album'e — visi tracks bus sukurti automatiškai
                        <span className="text-[12px] text-violet-500 shrink-0 font-semibold" title="Naujas album'as — ši daina bus sukurta DB su visa Wiki info">+ naujas</span>
                      )
                    )}
                    {t.type === 'instrumental' && <span className="text-[12px] text-gray-400 shrink-0 font-medium">instr.</span>}
                    {t.type === 'live' && <span className="text-[12px] text-blue-400 shrink-0 font-medium">live</span>}
                    {t.type === 'remix' && <span className="text-[12px] text-purple-400 shrink-0 font-medium">remix</span>}
                    {t.type === 'covers' && <span className="text-[12px] text-orange-400 shrink-0 font-medium">cover</span>}
                    {/* Per-track completeness — toks pats ✓/⚠ pattern'as kaip
                        album'o lygyje. Reikalingi laukai: video_url, release_year,
                        lyrics (be lyrics OK jei type=instrumental). Rodom KAS
                        tiksliai trūksta inline (ne tik count'ą), kad admin'ui
                        nereikėtų hover'inti tooltip'o kiekvienai dainai. LT
                        labels: video, data, žodžiai. */}
                    {trackComplete && (
                      trackComplete.complete ? (
                        <span className="text-[12px] font-semibold text-emerald-600 shrink-0" title="Daina pilna: yra video, leidimo data, žodžiai (arba instrumental).">✓</span>
                      ) : (() => {
                        const ltLabel = (k: string) => k === 'video' ? 'video' : k === 'data' ? 'data' : k === 'lyrics' ? 'žodžiai' : k
                        return (
                          <>
                            <span className="text-[12px] font-semibold text-amber-700 shrink-0" title={`Trūksta: ${trackComplete.missing.map(ltLabel).join(', ')}`}>
                              ⚠ {trackComplete.missing.map(ltLabel).join(', ')}
                            </span>
                            {/* Inline "instr" toggle — jei tik 'lyrics' missing ir track type='normal',
                                admin gali greitai pažymėti kaip instrumental (Wiki parser dažnai
                                nepamato — pvz Queen "Procession", "Drowse" intros). Po klikiausimo
                                lyrics check'as praleidžiamas → track tampa ✓ pilnas. */}
                            {trackComplete.missing.length === 1 && trackComplete.missing[0] === 'lyrics' && trackComplete.type === 'normal' && (
                              <button type="button"
                                onClick={async (e) => {
                                  e.stopPropagation()
                                  if (!confirm(`Pažymėti "${trackComplete.title}" kaip instrumental?\n\nLyrics check'as bus praleidžiamas — daina taps ✓ pilna.`)) return
                                  try {
                                    const res = await fetch(`/api/tracks/${trackComplete.id}`, {
                                      method: 'PUT', headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ type: 'instrumental' }),
                                    })
                                    if (!res.ok) { addLog(`✗ ${trackComplete.title}: ${res.status}`); return }
                                    addLog(`🎹 ${trackComplete.title} → instrumental`)
                                    // Re-fetch album completeness, kad UI atsinaujintų
                                    if (it.duplicateId) {
                                      const r = await fetch(`/api/albums/${it.duplicateId}/completeness`)
                                      if (r.ok) {
                                        const d = await r.json()
                                        if (d?.completeness) {
                                          setItems(p => p.map((x, idx) => idx === i ? { ...x, completeness: d.completeness } : x))
                                        }
                                      }
                                    }
                                  } catch (e: any) { addLog(`✗ ${e.message}`) }
                                }}
                                title="Pažymėti kaip instrumental — lyrics check'as bus praleidžiamas"
                                className="text-[12px] font-medium text-violet-600 hover:bg-violet-50 px-1 rounded shrink-0">
                                🎹 instr?
                              </button>
                            )}
                          </>
                        )
                      })()
                    )}
                    {/* Per-track community signals — likes + comments.
                        Padeda admin'ui nuspręsti kuriom dainom verta detaliai
                        tvarkyti video/lyrics (populiarios tarp music.lt vart.). */}
                    {trackComplete && (trackComplete.likes_count > 0 || trackComplete.comments_count > 0) && (
                      <span className="text-[12px] text-gray-400 shrink-0 inline-flex items-center gap-1" title={`${trackComplete.likes_count} like'ų · ${trackComplete.comments_count} komentarų`}>
                        {trackComplete.likes_count > 0 && <span>♥{trackComplete.likes_count}</span>}
                        {trackComplete.comments_count > 0 && <span>💬{trackComplete.comments_count}</span>}
                      </span>
                    )}
                    {t.duration && <span className="text-[12px] text-gray-300 shrink-0">{t.duration}</span>}
                  </div>
                )})}
              </div>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Tab bar ────────────────────────────────────────────────────────────────

  const tabNew = {
    studio: studioItems.filter(({ it }) => !it.duplicate && !it.imported).length,
    other: otherItems.filter(({ it }) => !it.duplicate && !it.imported).length,
    singles: songs.filter(s => !s.duplicate && !s.imported).length,
  }

  const pendingActive = pendingAlbums.filter(p => !p.imported && !p.deleted).length
                       + pendingTracks.filter(p => !p.imported && !p.deleted).length

  // 'Tik DB' filter — aktyvūs DB albumai, kurių Wiki neturi (nera items array
  // su duplicateId=db_id). Pvz Pre Ordained 1971 — egzistuoja DB iš music.lt
  // scrape, bet Wiki Queen diskografijoje jo nera. Admin gali rev/delete/hide.
  const wikiMatchedIds = new Set<number>(items.map(it => it.duplicateId).filter((x): x is number => typeof x === 'number'))
  const dbOnlyOrphans = dbOnlyAlbums.filter(a => !wikiMatchedIds.has(a.id))

  const tabDef: { id: ActiveTab; label: string; count: number; newCount: number; imported: number; hasNew: boolean; showAlways?: boolean }[] = [
    { id: 'studio', label: 'Studijiniai', count: tabCounts.studio, newCount: tabNew.studio, imported: tabImported.studio, hasNew: tabHasNew.studio },
    { id: 'other', label: 'Kiti albumai', count: tabCounts.other, newCount: tabNew.other, imported: tabImported.other, hasNew: tabHasNew.other },
    { id: 'singles', label: 'Singlai', count: tabCounts.singles, newCount: tabNew.singles, imported: tabImported.singles, hasNew: tabHasNew.singles, showAlways: true },
    // Music.lt only — pending DB record'ai (legacy_scrape_pending). Wiki canonical
    // sąraše jų nėra, bet music.lt scrape rado. Patvirtinti = aktyvuoti, Trinti = pašalinti.
    { id: 'pending' as ActiveTab, label: 'Music.lt rasta', count: pendingAlbums.length + pendingTracks.length, newCount: pendingActive, imported: 0, hasNew: pendingActive > 0, showAlways: pendingAlbums.length + pendingTracks.length > 0 },
    // Tik DB — aktyvus DB albums kurie nesutapo su jokia Wiki įrašu. Admin gali
    // delete arba hide; arba palikti (gali būti pre-debut demo ar pan).
    { id: 'db-only' as ActiveTab, label: 'Tik DB (ne Wiki)', count: dbOnlyOrphans.length, newCount: 0, imported: 0, hasNew: false, showAlways: dbOnlyOrphans.length > 0 },
  ]

  const hasContent = items.length > 0 || songs.length > 0

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <button type="button" onClick={handleOpen}
        className={buttonClassName ?? "flex items-center gap-2 px-4 py-2 bg-violet-50 hover:bg-violet-100 text-violet-700 rounded-lg text-sm font-medium transition-colors"}>
        {buttonLabel ?? "Importuoti diskografiją"}
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <>
          {/* Mobile: fullscreen fixed modal. Desktop: centered overlay. All via inline styles — no Tailwind/CSS conflicts */}
          <div style={minimized ? {display:'none'} : {position:'fixed',top:0,left:0,right:0,bottom:0,width:'100vw',height:'100vh',zIndex:10001,display:'flex',alignItems:'flex-start',justifyContent:'center'}}>
            {/* Backdrop — desktop only */}
            <div onClick={closeModal} className="hidden sm:block" style={{position:'fixed',top:0,left:0,right:0,bottom:0,width:'100vw',height:'100vh',background:'rgba(0,0,0,0.5)',backdropFilter:'blur(4px)'}} />
            {/* Modal panel */}
            <DiscModal>

            {/* Header */}
            <div className="flex items-center gap-3 px-3 sm:px-5 py-2.5 sm:py-3 border-b border-gray-100 shrink-0">
              <div className="flex-1 min-w-0">
                <h3 className="text-[16px] sm:text-base font-semibold text-gray-900 truncate">{artistName} — diskografija</h3>
              </div>
              {importing ? (
                <button onClick={() => { setMinimized(true); window.dispatchEvent(new CustomEvent('discography-minimized', { detail: { open: true } })) }} title="Minimizuoti — importas tęsis fone"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-violet-600 bg-violet-50 hover:bg-violet-100 transition-colors font-medium shrink-0">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                  Minimizuoti
                </button>
              ) : (
                <button onClick={closeModal} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors text-lg leading-none shrink-0">×</button>
              )}
            </div>

            {/* Search bar */}
            <div className="px-3 sm:px-5 py-2 border-b border-gray-100 flex gap-1.5 sm:gap-2">
              <input value={wikiUrl} onChange={e => setWikiUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !loading && search()}
                placeholder="Wikipedia URL arba automatinis"
                className="flex-1 px-2.5 py-1.5 sm:px-3 sm:py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-violet-400 placeholder:text-gray-300 text-gray-900 bg-white" />
              <button onClick={() => { setSearched(false); search() }} disabled={loading}
                className="px-3 sm:px-4 py-1.5 sm:py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium disabled:opacity-40 transition-colors shrink-0">
                {loading ? '...' : 'Ieškoti'}
              </button>
            </div>

            {/* Grupių pasirinkimas */}
            {artistGroups.length > 1 && (
              <div className="px-5 py-3 border-b border-amber-100 bg-amber-50/50">
                <p className="text-xs font-medium text-amber-700 mb-2">Kelios diskografijos sekcijos:</p>
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => search('__solo__')} className="px-2.5 py-1 bg-violet-600 text-white rounded-md text-xs font-medium">Tik solo</button>
                  <button onClick={() => search('__all__')} className="px-2.5 py-1 bg-gray-200 text-gray-700 rounded-md text-xs">Visi</button>
                  {artistGroups.map(g => <button key={g} onClick={() => search(g)} className="px-2.5 py-1 bg-white border border-gray-200 text-gray-600 rounded-md text-xs hover:bg-gray-50">{g}</button>)}
                </div>
              </div>
            )}

            {/* ── HELP + LEGEND banner ─────────────────────────────────── */}
            {hasContent && !loading && (
              <div className="shrink-0 border-b border-gray-100 bg-gradient-to-b from-gray-50/50 to-white px-3 sm:px-5 py-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  {/* Legend chips — always visible */}
                  <div className="flex items-center gap-1.5 sm:gap-2 text-[12px] flex-wrap">
                    <span className="font-semibold text-gray-500">Spalvos:</span>
                    <span className="inline-flex items-center gap-0.5 text-amber-700"><span className="w-2 h-2 rounded-sm bg-amber-400" />↻ pridurs</span>
                    <span className="inline-flex items-center gap-0.5 text-emerald-700"><span className="w-2 h-2 rounded-sm bg-emerald-400" />✓ sutvarkyta</span>
                    <span className="inline-flex items-center gap-0.5 text-amber-700"><span className="w-2 h-2 rounded-sm bg-amber-600" />⚠ trūksta</span>
                    <span className="inline-flex items-center gap-0.5 text-violet-700"><span className="w-2 h-2 rounded-sm bg-violet-500" />+ naujas</span>
                    <span className="inline-flex items-center gap-0.5 text-gray-500"><span className="w-2 h-2 rounded-sm bg-gray-400" />· tik Wiki</span>
                  </div>
                  <button onClick={() => setHelpOpen(p => !p)} type="button"
                    className="text-[14px] text-violet-600 hover:underline font-medium shrink-0">
                    {helpOpen ? '▲ Slėpti pagalbą' : '❓ Kaip veikia?'}
                  </button>
                </div>
                {helpOpen && (
                  <div className="mt-2 pt-2 border-t border-gray-100 text-[14px] text-gray-600 space-y-1.5">
                    <div className="font-semibold text-gray-700">Pilnas importo flow (1 mygtukas):</div>
                    <ol className="list-decimal list-inside space-y-0.5 ml-1">
                      <li><b>Wiki overlay</b> — pridurs trūkstamus laukus: leidimo data, viršelis, žanrai, peak chart, sertifikatai. Egzistuojantys laukai NIEKADA neperrašomi. Type flags REPLACE (Wiki canonical). Featuring artists UNION (priedam, netriname).</li>
                      <li><b>YouTube enrich</b> — kiekvienam track be video_url ieško YT, ima view count + upload date. Live/remix/instrumental skip'inami auto (admin gali rankiniu).</li>
                      <li><b>LRCLib lyrics</b> — kiekvienam track be lyrics ieško per LRCLib API (free, no auth).</li>
                      <li><b>Score recalc</b> — composite scores atnaujinami pagal naujus video_views + cert + peak.</li>
                    </ol>
                    <div className="font-semibold text-gray-700 mt-2">Badge'ai per album:</div>
                    <ul className="list-disc list-inside space-y-0.5 ml-1">
                      <li><b>↻ pridurs: X, Y, Z</b> — Wiki turi konkrečių duomenų, kuriuos pridurs (data, viršelis, žanrai, etc.)</li>
                      <li><b>✓ sutvarkyta</b> — viskas užpildyta, nieko nereikia</li>
                      <li><b>⚠ trūksta: X</b> — kažko trūksta (vienoks ar kitoks). Tooltip rodo specifiškai. Jei tik external (video/lyrics) — Wiki to neturi, kiti tool'ai apdoros (YT/LRCLib).</li>
                      <li><b>+ naujas</b> — DB neturi šio album'o, bus sukurtas su visomis Wiki dainomis.</li>
                      <li><b>🔄 type: +X -Y</b> — Wiki tipas skiriasi nuo DB; po importo bus pakeista.</li>
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Tabs */}
            {(hasContent || loading) && (
              <div className="flex items-center border-b border-gray-100 px-2.5 sm:px-5 gap-0.5 shrink-0">
                {tabDef.map(tab => {
                  if (!tab.showAlways && tab.count === 0) return null
                  const isActive = activeTab === tab.id
                  return (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                      className={`relative flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 sm:py-2.5 text-[14px] sm:text-xs font-medium border-b-2 transition-colors -mb-px ${
                        isActive ? 'border-violet-600 text-violet-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}>
                      {tab.label}
                      {tab.count > 0 && (
                        <span className={`px-1.5 py-0.5 rounded text-[12px] font-semibold ${
                          tab.newCount > 0
                            ? (isActive ? 'bg-violet-100 text-violet-600' : 'bg-gray-100 text-gray-500')
                            : 'bg-gray-50 text-gray-300'
                        }`}>
                          {tab.newCount > 0 ? `${tab.newCount}/${tab.count}` : `✓${tab.count}`}
                        </span>
                      )}
                      {tab.hasNew && !isActive && <span className="w-1.5 h-1.5 bg-orange-400 rounded-full" />}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Sticky controls bar */}
            {hasContent && !loading && (
              <div className="flex items-center justify-between px-2.5 sm:px-5 py-1.5 sm:py-2 border-b border-gray-100 bg-white/95 backdrop-blur-sm shrink-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-400">
                  {(() => {
                    if (activeTab === 'singles') return `${songNewCount} naujų`
                    const list = activeTab === 'studio' ? studioItems : otherItems
                    const newCount = list.filter(({it}) => !it.duplicate && !it.imported).length
                    const dupCount = list.filter(({it}) => it.duplicate && !it.imported).length
                    const parts: string[] = []
                    if (newCount > 0) parts.push(`${newCount} nauji`)
                    if (dupCount > 0) parts.push(`${dupCount} papildyti`)
                    return parts.length ? parts.join(' + ') : 'viskas importuota'
                  })()}
                  </span>
                  {/* Legend per checkbox spalvas — admin clarity:
                      ↻ enrich = papildo trūkstamus laukus, nieko netrina;
                      + naujas = sukurs naują albumą su visais Wiki tracks. */}
                  {(activeTab === 'studio' || activeTab === 'other') && (
                    <span className="flex items-center gap-2 text-[12px] text-gray-500" title={
                      'GELTONAS (↻ enrich): albumas jau yra DB. Wiki tik papildys trūkstamus laukus — leidimo data, viršelis, sertifikatai, peak chart, žanrai, type flag. Egzistuojantys laukai NIEKADA neperrašomi. Albume esančios dainos taip pat papildomos (release date, single žymėjimas).' + '\n\n' +
                      'VIOLETINIS (+ naujas): albumas DB neegzistuoja. Bus sukurtas visas naujas album'+"'"+'as su tracks iš Wikipedia.'
                    }>
                      <span className="inline-flex items-center gap-0.5"><span className="w-2 h-2 rounded-sm bg-amber-400"></span>↻ papildyti</span>
                      <span className="inline-flex items-center gap-0.5"><span className="w-2 h-2 rounded-sm bg-violet-500"></span>+ naujas</span>
                    </span>
                  )}
                  {(activeTab === 'studio' || activeTab === 'other' || activeTab === 'singles') && (
                    <button onClick={() => setSortDesc(p => !p)}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[12px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                      title={sortDesc ? "Nuo seniausio" : "Nuo naujausio"}>
                      {sortDesc ? '↓ Nauji' : '↑ Seni'}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs">
                  {(activeTab === 'studio' || activeTab === 'other') && (<>
                    {/* 2026-05-15 fix: bulk select dabar APIMA duplicate'us
                        (kad enrich flow'as juos paimtų), ne tik new items.
                        Anksčiau atlikėjui kaip Queen kur visi 15 albumų yra
                        duplicate'ai (music.lt scrape'inti) — Pasirinkti visus
                        select'indavo 0, nes filter'as juos atmesdavo. */}
                    <button onClick={() => {
                      const list = activeTab === 'studio' ? studioItems : otherItems
                      const eligible = list.filter(({it}) => !it.imported).map(({i}) => i)
                      if (activeTab === 'studio') setSelected(new Set(eligible))
                      else setSelected(p => { const s = new Set(p); eligible.forEach(idx => s.add(idx)); return s })
                    }} className="text-violet-600 hover:underline">Pasirinkti visus</button>
                    <button onClick={() => {
                      if (activeTab === 'studio') setSelected(p => { const s = new Set(p); studioItems.forEach(({i}) => s.delete(i)); return s })
                      else setSelected(p => { const s = new Set(p); otherItems.forEach(({i})=>s.delete(i)); return s })
                    }} className="text-gray-400 hover:underline">Atžymėti visus</button>
                    <span className="text-gray-500 font-medium">
                      {activeTab === 'studio' ? studioSelected : otherSelected} pasirinkta
                    </span>
                  </>)}
                  {activeTab === 'singles' && (<>
                    <button onClick={() => selectAllSongs(true)} className="text-violet-600 hover:underline">Pasirinkti visus</button>
                    <button onClick={() => selectAllSongs(false)} className="text-gray-400 hover:underline">Atžymėti visus</button>
                    <span className="text-gray-500 font-medium">{songSelectedCount} pasirinkta</span>
                  </>)}
                </div>
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-2 sm:py-3 space-y-1.5 sm:space-y-2 min-h-0">

              {loading && (
                <div className="flex items-center justify-center py-16 text-gray-400">
                  <div className="text-center">
                    <div className="w-8 h-8 border-2 border-gray-200 border-t-violet-500 rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-sm">Ieškoma...</p>
                  </div>
                </div>
              )}

              {/* ── Studijiniai ── */}
              {activeTab === 'studio' && !loading && (
                <>
                  {studioItems.length === 0 ? (
                    <div className="text-center py-12 text-gray-400 text-sm">Studijinių albumų nerasta</div>
                  ) : (
                    <>
                      <div className="space-y-1">
                        {(sortDesc ? [...studioItems].reverse() : studioItems).map(({ it, i }) => renderAlbumRow(it, i))}
                      </div>
                    </>
                  )}
                </>
              )}

              {/* ── Kiti albumai ── */}
              {activeTab === 'other' && !loading && (
                <>
                  {otherItems.length === 0 ? (
                    <div className="text-center py-12 text-gray-400 text-sm">Kitų albumų nerasta</div>
                  ) : (
                    <>
                      {/* Pogrupiai */}
                      {(['ep', 'compilation', 'live', 'remix', 'covers', 'holiday', 'soundtrack', 'demo', 'other'] as AlbumType[]).map(type => {
                        const typeItems = otherItems.filter(({ it }) => it.type === type)
                        if (!typeItems.length) return null
                        const typeLabels: Record<string, string> = {
                          ep: 'EP',
                          compilation: 'Rinktiniai',
                          live: 'Gyvai įrašyti',
                          remix: 'Remiksų albumai',
                          covers: 'Koverių albumai',
                          holiday: 'Šventiniai albumai',
                          soundtrack: 'Garso takeliai',
                          demo: 'Bandomieji įrašai',
                          other: 'Kiti',
                        }
                        return (
                          <div key={type}>
                            <div className="text-[12px] font-semibold text-gray-400 uppercase tracking-wider mb-1 mt-2">{typeLabels[type]}</div>
                            <div className="space-y-1">{(sortDesc ? [...typeItems].reverse() : typeItems).map(({ it, i }) => renderAlbumRow(it, i))}</div>
                          </div>
                        )
                      })}
                    </>
                  )}
                </>
              )}

              {/* ── Singlai ── */}
              {activeTab === 'singles' && !loading && (
                <>
                  {songs.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-sm text-gray-500 font-medium mb-1">Singlų nerasta Wikipedia</p>
                    </div>
                  ) : (
                    <>
                      {/* Grouped by year */}
                      {(() => {
                        const byYear: Record<string, SingleSongItem[]> = {}
                        for (const s of songs) { const y = s.year ? String(s.year) : '—'; if (!byYear[y]) byYear[y]=[]; byYear[y].push(s) }
                        const yearEntries = Object.entries(byYear).sort(([a],[b]) => sortDesc ? b.localeCompare(a) : a.localeCompare(b))
                        return yearEntries.map(([yr, yrSongs]) => (
                          <div key={yr}>
                            <div className="text-[12px] font-semibold text-gray-400 uppercase tracking-wider mb-1 mt-2.5">{yr}</div>
                            <div className="space-y-1">
                              {yrSongs.map(song => (
                                <div key={song.title} onClick={() => !song.duplicate && !song.imported && toggleSong(song.title)}
                                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all ${
                                    song.duplicate ? 'border-gray-100 bg-gray-50/50 opacity-40 cursor-not-allowed'
                                    : song.imported ? 'border-emerald-200 bg-emerald-50/50 cursor-default'
                                    : song.selected ? 'border-violet-300 bg-violet-50 cursor-pointer'
                                    : 'border-gray-200 bg-white hover:border-gray-300 cursor-pointer'
                                  }`}>
                                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                                    song.selected && !song.duplicate && !song.imported ? 'border-violet-500 bg-violet-500' : 'border-gray-300'
                                  }`}>
                                    {song.selected && !song.duplicate && !song.imported && (
                                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                    )}
                                    {song.imported && <svg className="w-2.5 h-2.5 text-emerald-500" fill="none" viewBox="0 0 10 10"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-baseline gap-1.5 flex-wrap">
                                      <span className="text-sm font-medium text-gray-900 truncate">{song.title}</span>
                                      {song.duplicate && <span className="text-[12px] text-amber-500 shrink-0">jau yra</span>}
                                      {song.imported && <span className="text-[12px] text-emerald-500 shrink-0">importuota</span>}
                                      {song.importing && <span className="text-[12px] text-violet-400 animate-pulse shrink-0">importuojama</span>}
                                      {song.error && <span className="text-[12px] text-red-400 shrink-0" title={song.error}>✗ klaida</span>}
                                    </div>
                                    {song.error && <div className="text-[12px] text-red-400 truncate mt-0.5">{song.error}</div>}
                                    {song.albumTitle && !song.error && <div className="text-[14px] text-gray-400 truncate">{song.albumTitle}</div>}
                                    {song.featuredArtists && song.featuredArtists.length > 0 && !song.error && (
                                      <div className="text-[12px] text-violet-400 truncate">feat. {song.featuredArtists.join(', ')}</div>
                                    )}
                                    {song.duplicate && song.duplicateId && (
                                      <a href={`/admin/tracks/${song.duplicateId}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-[12px] text-blue-500 hover:underline">atidaryti →</a>
                                    )}
                                    {/* Alias / Ignore action'ai — tik tikriems naujiems singles */}
                                    {!song.duplicate && !song.imported && !song.importing && (
                                      <div className="flex items-center gap-2 mt-0.5" onClick={e => e.stopPropagation()}>
                                        <button
                                          type="button"
                                          onClick={e => { e.stopPropagation(); setLinkAliasFor(song.title); setAliasPickerQuery('') }}
                                          className="text-[12px] text-blue-500 hover:underline"
                                          title="Pažymėti, kad šis Wiki single atitinka esamą DB daina (pvz Angel = Angel in the Snow)"
                                        >🔗 susieti su daina</button>
                                        <button
                                          type="button"
                                          onClick={e => { e.stopPropagation(); ignoreWikiSong(song.title) }}
                                          className="text-[12px] text-gray-400 hover:text-red-500 hover:underline"
                                          title="Paslėpti šį Wiki suggestion'ą ateičiai"
                                        >🚫 ignoruoti</button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      })()}
                      {/* Alias picker — atidaromas paspaudus „susieti su daina" */}
                      {linkAliasFor && (() => {
                        const q = aliasPickerQuery.trim().toLowerCase()
                        const matches = [...allArtistTracks.values()]
                          .filter(t => !q || t.title.toLowerCase().includes(q))
                          .slice(0, 30)
                        return (
                          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setLinkAliasFor(null)}>
                            <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
                              <div className="px-4 py-3 border-b">
                                <div className="text-[14px] text-gray-500 mb-1">Wiki single</div>
                                <div className="font-medium text-gray-900">{linkAliasFor}</div>
                                <div className="text-[14px] text-gray-500 mt-2 mb-1">Susieti su esama daina:</div>
                                <input
                                  type="text"
                                  autoFocus
                                  value={aliasPickerQuery}
                                  onChange={e => setAliasPickerQuery(e.target.value)}
                                  placeholder="Ieškoti dainos pavadinimo..."
                                  className="w-full px-2.5 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-violet-400"
                                />
                              </div>
                              <div className="flex-1 overflow-y-auto px-2 py-1">
                                {matches.length === 0 ? (
                                  <div className="text-center text-[14px] text-gray-400 py-6">Nieko nerasta</div>
                                ) : matches.map(t => (
                                  <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => linkAlias(linkAliasFor, t.id, t.title)}
                                    className="w-full text-left px-2.5 py-1.5 rounded hover:bg-violet-50 text-sm text-gray-900"
                                  >{t.title}</button>
                                ))}
                              </div>
                              <div className="px-4 py-2.5 border-t flex justify-end">
                                <button type="button" onClick={() => setLinkAliasFor(null)} className="text-[14px] text-gray-500 hover:text-gray-700">Atšaukti</button>
                              </div>
                            </div>
                          </div>
                        )
                      })()}
                    </>
                  )}
                </>
              )}

              {/* ── Music.lt rasta (pending) ── */}
              {activeTab === 'pending' && !loading && (
                <>
                  {(pendingAlbums.length === 0 && pendingTracks.length === 0) ? (
                    <div className="text-center py-12">
                      <p className="text-sm text-gray-500 font-medium mb-1">Pending nieko nerasta</p>
                      <p className="text-[14px] text-gray-400">Visi music.lt scrape įrašai jau aktyvuoti arba ištrinti</p>
                    </div>
                  ) : (
                    <>
                      <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[14px] text-amber-700 mb-2">
                        <strong>Music.lt-only įrašai</strong> — atėjo iš music.lt scrape, bet Wiki canonical sąraše jų nėra. Patvirtinti = aktyvuoti (matomas viešai). Trinti = pašalinti iš DB.
                      </div>

                      {/* Group tracks under their albums (via album_id from album_tracks JOIN).
                          Orphan tracks (be album) renderiniami atskirai apačioje. */}
                      {(() => {
                        const tracksByAlbum = new Map<number, PendingTrack[]>()
                        const orphanTracks: PendingTrack[] = []
                        for (const t of pendingTracks) {
                          if (t.album_id != null) {
                            const arr = tracksByAlbum.get(t.album_id) || []
                            arr.push(t)
                            tracksByAlbum.set(t.album_id, arr)
                          } else {
                            orphanTracks.push(t)
                          }
                        }
                        return (
                          <>
                            {pendingAlbums.length > 0 && (
                              <div>
                                <div className="text-[12px] font-semibold text-gray-400 uppercase tracking-wider mb-1 mt-2.5">Albumai · {pendingAlbums.length}</div>
                                <div className="space-y-2">
                                  {pendingAlbums.map(p => {
                                    const albumTracks = tracksByAlbum.get(p.id) || []
                                    return (
                                      <div key={`pa-${p.id}`} className={`rounded-lg border overflow-hidden transition-all ${
                                        p.imported ? 'border-emerald-200 bg-emerald-50/50' :
                                        p.error ? 'border-red-200 bg-red-50/50' :
                                        'border-amber-200 bg-amber-50/30'
                                      }`}>
                                        <div className="flex items-center gap-2 px-3 py-2">
                                          {p.cover_image_url && (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={p.cover_image_url} alt="" referrerPolicy="no-referrer" className="w-9 h-9 rounded object-cover shrink-0" />
                                          )}
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-baseline gap-1.5 flex-wrap">
                                              <span className="text-sm font-medium text-gray-900 truncate">{p.title}</span>
                                              <span className="text-[12px] text-gray-400">{p.year || '—'}</span>
                                              {p.legacy_id && <span className="text-[12px] text-amber-500">#{p.legacy_id}</span>}
                                              {albumTracks.length > 0 && <span className="text-[12px] text-blue-500">{albumTracks.length} dainų</span>}
                                              {p.importing && <span className="text-[12px] text-violet-400 animate-pulse">vykdoma...</span>}
                                              {p.imported && <span className="text-[12px] text-emerald-500">✓ aktyvuotas</span>}
                                              {p.error && <span className="text-[12px] text-red-400" title={p.error}>✗ {p.error}</span>}
                                            </div>
                                            <a href={`/admin/albums/${p.id}`} target="_blank" rel="noreferrer" className="text-[12px] text-blue-500 hover:underline">atidaryti admin →</a>
                                          </div>
                                          {/* Type dropdown — leidžia user'iui pakeisti tipą prieš
                                              Patvirtinti, nes music.lt scrape dažnai mis-classifies
                                              singles/demos kaip studio. */}
                                          {!p.imported && !p.deleted && (
                                            <select
                                              value={p.type}
                                              onChange={e => {
                                                const newType = e.target.value
                                                setPendingAlbums(prev => prev.map(x => x.id === p.id ? { ...x, type: newType } : x))
                                              }}
                                              disabled={p.importing}
                                              className="shrink-0 text-[14px] font-semibold text-gray-900 border border-gray-300 bg-white rounded-md px-2 py-1 min-w-[90px] cursor-pointer hover:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-300 disabled:opacity-50"
                                              title="Album type — bus naudojamas aktyvavime"
                                            >
                                              <option value="studio">Studijinis</option>
                                              <option value="ep">EP</option>
                                              <option value="single">Singlas</option>
                                              <option value="live">Gyvai</option>
                                              <option value="demo">Demo</option>
                                              <option value="compilation">Kompiliacija</option>
                                              <option value="covers">Cover'iai</option>
                                              <option value="remix">Remix'ai</option>
                                              <option value="soundtrack">Garso takelis</option>
                                              <option value="holiday">Šventinis</option>
                                            </select>
                                          )}
                                          {!p.imported && !p.deleted && (
                                            <div className="flex gap-1 shrink-0">
                                              <button onClick={() => approvePending('album', p.id)} disabled={p.importing}
                                                className="px-2 py-1 rounded-md bg-emerald-100 text-emerald-700 text-[14px] font-medium hover:bg-emerald-200 disabled:opacity-50">
                                                ✓ Patvirtinti
                                              </button>
                                              <button onClick={() => deletePending('album', p.id)} disabled={p.importing}
                                                className="px-2 py-1 rounded-md bg-red-50 text-red-600 text-[14px] font-medium hover:bg-red-100 disabled:opacity-50">
                                                ✕ Trinti
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                        {/* Tracks priklausančios šitam pending albumui */}
                                        {albumTracks.length > 0 && (
                                          <div className="border-t border-amber-200/50 bg-white/40 px-3 py-1.5 space-y-0.5">
                                            {albumTracks.map(t => (
                                              <div key={`pt-${t.id}`} className="flex items-center gap-2 py-0.5">
                                                <span className="text-[14px] text-gray-700 truncate flex-1">{t.title}</span>
                                                {t.legacy_id && <span className="text-[12px] text-amber-500">#{t.legacy_id}</span>}
                                                {t.imported && <span className="text-[12px] text-emerald-500">✓</span>}
                                                {t.importing && <span className="text-[12px] text-violet-400 animate-pulse">...</span>}
                                              </div>
                                            ))}
                                            <div className="text-[12px] text-gray-400 italic pt-0.5">
                                              ↑ Patvirtinus albumą — visos jo dainos taip pat aktyvuosis (per album_tracks JOIN).
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )}

                            {orphanTracks.length > 0 && (
                              <div>
                                <div className="text-[12px] font-semibold text-gray-400 uppercase tracking-wider mb-1 mt-3">Singlai / Orphan dainos · {orphanTracks.length}</div>
                                <div className="space-y-1">
                                  {orphanTracks.map(p => (
                                    <div key={`pt-${p.id}`} className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                                      p.imported ? 'border-emerald-200 bg-emerald-50/50' :
                                      p.error ? 'border-red-200 bg-red-50/50' :
                                      'border-amber-200 bg-amber-50/30'
                                    }`}>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-baseline gap-1.5 flex-wrap">
                                          <span className="text-sm font-medium text-gray-900 truncate">{p.title}</span>
                                          <span className="text-[12px] text-gray-400">{p.release_year || '—'}</span>
                                          {p.type && p.type !== 'normal' && <span className="text-[12px] text-violet-400">{p.type}</span>}
                                          {p.legacy_id && <span className="text-[12px] text-amber-500">#{p.legacy_id}</span>}
                                          {p.importing && <span className="text-[12px] text-violet-400 animate-pulse">vykdoma...</span>}
                                          {p.imported && <span className="text-[12px] text-emerald-500">✓ aktyvuota</span>}
                                          {p.error && <span className="text-[12px] text-red-400" title={p.error}>✗ {p.error}</span>}
                                        </div>
                                        <a href={`/admin/tracks/${p.id}`} target="_blank" rel="noreferrer" className="text-[12px] text-blue-500 hover:underline">atidaryti admin →</a>
                                      </div>
                                      {!p.imported && !p.deleted && (
                                        <div className="flex gap-1 shrink-0">
                                          <button onClick={() => approvePending('track', p.id)} disabled={p.importing}
                                            className="px-2 py-1 rounded-md bg-emerald-100 text-emerald-700 text-[14px] font-medium hover:bg-emerald-200 disabled:opacity-50">
                                            ✓ Patvirtinti
                                          </button>
                                          <button onClick={() => deletePending('track', p.id)} disabled={p.importing}
                                            className="px-2 py-1 rounded-md bg-red-50 text-red-600 text-[14px] font-medium hover:bg-red-100 disabled:opacity-50">
                                            ✕ Trinti
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        )
                      })()}
                    </>
                  )}
                </>
              )}

              {/* ── Tik DB tab — DB album'ai, kurių Wiki neturi ── */}
              {activeTab === 'db-only' && !loading && (
                <>
                  {dbOnlyOrphans.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-sm text-gray-500 font-medium mb-1">Visi DB albums turi Wiki match'us</p>
                      <p className="text-[14px] text-gray-400">Nieko tvarkyti — Wiki canonical sąrašas pilnai atitinka DB</p>
                    </div>
                  ) : (
                    <>
                      <div className="rounded-lg bg-orange-50 border border-orange-200 px-3 py-2 text-[14px] text-orange-700 mb-2">
                        <strong>Tik DB — Wiki neturi</strong> — šie album'ai aktyvūs DB (matomi viešai), bet Wikipedia jų neaprašo savo diskografijoje (gali būti pre-debut demo'os, music.lt scrape klaidos ar pan.). Patikrink ar verta — × ištrina, 🚫 paslepia future Wiki importams.
                      </div>
                      <div className="space-y-1">
                        {dbOnlyOrphans.map(d => (
                          <div key={`dbo-${d.id}`} className="rounded-lg border border-orange-200 bg-orange-50/30 px-3 py-2 flex items-center gap-2">
                            {d.cover_image_url && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={d.cover_image_url} alt="" referrerPolicy="no-referrer" className="w-9 h-9 rounded object-cover shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[14px] font-medium text-gray-900 truncate">{d.title}</span>
                                <span className="text-[12px] uppercase tracking-wide text-gray-400 font-semibold shrink-0">{d.type}</span>
                                {d.year && <span className="text-[14px] text-gray-400 shrink-0">{d.year}</span>}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <a href={`/admin/albums/${d.id}`} target="_blank" rel="noreferrer" className="text-[12px] text-blue-500 hover:underline">
                                  DB →
                                </a>
                                {d.legacy_id && (
                                  <a href={`https://www.music.lt/lt/albumas/x/${d.legacy_id}/`} target="_blank" rel="noreferrer"
                                    className="text-[12px] text-orange-500 hover:underline">
                                    music.lt ↗
                                  </a>
                                )}
                              </div>
                            </div>
                            {/* Delete + Hide — reuse existing handlers via id+title shim */}
                            <button type="button"
                              onClick={async () => {
                                if (!confirm(`Paslėpti "${d.title}"? Future Wiki importai jo neberodys.`)) return
                                try {
                                  const res = await fetch(`/api/albums/${d.id}/wiki-status`, {
                                    method: 'PATCH', headers: {'Content-Type':'application/json'},
                                    body: JSON.stringify({ status: 'cleared' }),
                                  })
                                  const j = await res.json().catch(() => ({}))
                                  if (j.migration_pending) {
                                    addLog(`⚠ Hide reikia migracijos 20260515h. Iki tol — session-only.`)
                                  } else if (!res.ok) {
                                    addLog(`✗ ${d.title}: hide nepavyko (${res.status})`)
                                    return
                                  } else {
                                    addLog(`🚫 ${d.title} paslėpta (cleared)`)
                                  }
                                  setDbOnlyAlbums(prev => prev.filter(x => x.id !== d.id))
                                } catch (e: any) {
                                  addLog(`✗ ${d.title}: ${e.message}`)
                                }
                              }}
                              title="Paslėpti šį album'ą kaip 'sutvarkyta' — future Wiki importai nerodys"
                              className="shrink-0 px-1.5 py-1 rounded text-[14px] text-gray-400 hover:text-orange-500 hover:bg-orange-100 transition-colors">
                              🚫
                            </button>
                            <button type="button"
                              onClick={async () => {
                                if (!confirm(`Ištrinti album'ą "${d.title}" iš DB?\n\nKartu bus ištrintos jo dainos, jei jos nepriklauso kitiems albums.\n\nVeiksmas negali būti atšauktas.`)) return
                                try {
                                  const res = await fetch(`/api/albums/${d.id}?deleteTracks=true`, { method: 'DELETE' })
                                  if (!res.ok) {
                                    addLog(`✗ ${d.title}: delete nepavyko (${res.status})`)
                                    return
                                  }
                                  addLog(`🗑 ${d.title} ištrintas iš DB`)
                                  setDbOnlyAlbums(prev => prev.filter(x => x.id !== d.id))
                                  window.dispatchEvent(new CustomEvent('discography-updated'))
                                } catch (e: any) {
                                  addLog(`✗ ${d.title}: ${e.message}`)
                                }
                              }}
                              title="Ištrinti šį album'ą iš DB visam (su jo dainomis, jei nenaudojamos kitur)"
                              className="shrink-0 px-1.5 py-1 rounded text-[14px] text-gray-400 hover:text-red-500 hover:bg-red-100 transition-colors">
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Log */}
              {log.length > 0 && (
                <div ref={logRef} className="bg-gray-950 rounded-xl p-3 font-mono text-[14px] text-emerald-400 max-h-24 overflow-y-auto leading-relaxed">
                  {log.map((l, i) => <div key={i}>{l}</div>)}
                </div>
              )}
            </div>

            {/* Footer — sticky ant apačios */}
            <div className="shrink-0 px-3 sm:px-5 pt-2.5 sm:pt-3 border-t border-gray-100 flex items-center gap-1.5 sm:gap-2 bg-white"
              style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}>
              {activeTab === 'pending' ? (
                <div className="flex-1 py-2 sm:py-2.5 text-center text-xs text-gray-500">
                  Patvirtink / trink iš sąrašo aukščiau
                </div>
              ) : activeTab === 'db-only' ? (
                <div className="flex-1 py-2 sm:py-2.5 text-center text-xs text-gray-500">
                  Šie album'ai DB yra, bet Wiki diskografijoje nera — sutvarkyk per × / 🚫
                </div>
              ) : activeTab === 'singles' ? (
                <button onClick={importSongs} disabled={importing || songSelectedCount === 0}
                  className="flex-1 py-2 sm:py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl disabled:opacity-40 transition-colors text-sm">
                  {importing ? 'Importuojama...' : `Importuoti ${getLithuanianPlural(songSelectedCount, 'singlą', 'singlus', 'singlų')}`}
                </button>
              ) : (
                <button onClick={importAlbums} disabled={importing || selected.size === 0}
                  className="flex-1 py-2 sm:py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl disabled:opacity-40 transition-colors text-sm">
                  {importing ? 'Importuojama...' : `Importuoti ${getLithuanianPlural(selected.size, 'albumą', 'albumus', 'albumų')}`}
                </button>
              )}
              <button onClick={closeModal} className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center border border-gray-200 text-gray-500 rounded-xl hover:bg-gray-50 transition-colors text-sm">
                ✕
              </button>
            </div>

            </DiscModal>
          </div>
        </>,
        document.body
      )}
    </>
  )
}
