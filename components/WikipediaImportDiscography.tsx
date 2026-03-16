'use client'

import { useState, useRef, useEffect } from 'react'
import { useBackgroundTasks } from '@/components/BackgroundTaskContext'

// ─── Tipai ────────────────────────────────────────────────────────────────────

type AlbumType = 'studio' | 'ep' | 'single' | 'compilation' | 'live' | 'remix' | 'covers' | 'holiday' | 'soundtrack' | 'demo' | 'other'

type DiscographyItem = {
  title: string
  year: number | null
  month: number | null
  day: number | null
  type: AlbumType
  extraTypes?: AlbumType[]  // papildomi tipai, pvz. soundtrack + studio
  wikiTitle?: string
  mbId?: string
  source: 'musicbrainz' | 'wikipedia'
  cover_image_url?: string
  tracks?: TrackEntry[]
  fetched?: boolean
  importing?: boolean
  imported?: boolean
  duplicate?: boolean
  duplicateId?: number
  error?: string
}

type TrackEntry = {
  title: string
  duration?: string
  sort_order: number
  is_single?: boolean
  featuring?: string[]
  disc_number?: number
  type?: 'normal' | 'instrumental' | 'live' | 'remix' | 'mashup' | 'covers'
}

type SingleSongItem = {
  title: string
  year: number | null
  month: number | null
  day: number | null
  albumTitle?: string
  source: 'wikipedia' | 'musicbrainz'
  importing?: boolean
  imported?: boolean
  duplicate?: boolean
  duplicateId?: number
  error?: string
  selected: boolean
}

// ─── Konstantos ───────────────────────────────────────────────────────────────

const AUTO_SELECT_TYPES: AlbumType[] = ['studio']

// ─── Wikipedia utils ──────────────────────────────────────────────────────────

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

function cleanWikiText(raw: string): string {
  let s = raw
  // Pirmiausia pašalinti <ref>...</ref> blokus (citatos su nuorodomis)
  s = s.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
  s = s.replace(/<ref[^/]*\/>/gi, '')  // savaiminiai <ref name="x"/>
  // HTML tagų valymas
  s = s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')
  // Wiki markup valymas
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (_: string, _l: string, d: string) => d.replace(/^["'\u201c\u2018]+|["'\u201d\u2019]+$/g, '').trim())
  s = s.replace(/\[\[([^\]]+)\]\]/g, (_: string, l: string) => l.replace(/#[^\]]*$/, '').replace(/_/g, ' ').replace(/^["'\u201c\u2018]+|["'\u201d\u2019]+$/g, '').trim())
  s = s.replace(/\[\[|\]\]/g, '').replace(/\{\{[^}]*\}\}/g, '').replace(/''+/g, '')
  s = s.replace(/\[\w*\s*\d*\]/g, '')
  s = s.replace(/\s*\([^)]*\bsong\b[^)]*\)/gi, '').replace(/\s*\([^)]*\balbum\b[^)]*\)/gi, '')
  s = s.replace(/^["'\u201c\u2018]+|["'\u201d\u2019]+$/g, '')
  s = s.replace(/\s+/g, ' ')
  return s.trim()
}

function extractFeaturing(raw: string): string[] {
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

function parseFeaturing(raw: string): { cleanTitle: string; featuring: string[] } {
  const featuring = extractFeaturing(raw)
  const cleanTitle = cleanWikiText(
    raw.replace(/\s*\((?:feat(?:uring)?\.?|ft\.?)\s+[^)]+\)/gi, '')
       .replace(/\s*\{\{(?:feat(?:uring)?\.?|ft\.?)[\s|][^}]+\}\}/gi, '').trim()
  )
  return { cleanTitle, featuring }
}

// ─── Wikipedia album parsers ──────────────────────────────────────────────────

function hasMultipleArtistSections(wikitext: string): string[] {
  const groups: string[] = []
  let inDisc = false
  for (const line of wikitext.split('\n')) {
    const h = line.match(/^(==+)\s*(.+?)\s*\1/)
    if (!h) continue
    const depth = h[1].length, title = h[2].toLowerCase()
    if (title.includes('discograph')) { inDisc = true; continue }
    if (depth === 2 && inDisc) break
    if (inDisc && depth === 3) groups.push(h[2].trim())
  }
  return groups
}

function parseMainPageDiscography(wikitext: string, soloOnly = false, groupFilter?: string): DiscographyItem[] {
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
    if (!title || title.length < 2 || wikiTitle.includes(':') || /^[A-Z]{2,3}$/.test(title)) continue
    const bad = ['discography', 'songs', 'videography', 'filmography', 'certification', 'chart']
    if (bad.some(b => title.toLowerCase().includes(b) || wikiTitle.toLowerCase().includes(b))) continue
    const yearM = line.match(/\((\d{4})\)/)
    albums.push({ title, year: yearM ? parseInt(yearM[1]) : null, month: null, day: null, type: currentType, wikiTitle, source: 'wikipedia' })
  }
  return albums
}

function parseDiscographyPage(wikitext: string): DiscographyItem[] {
  const albums: DiscographyItem[] = []
  const lines = wikitext.split('\n')
  let currentType: AlbumType = 'studio'
  let inTable = false, skipSection = false, inSinglesSection = false, yearMode = false
  // Year rowspan tracking (kaip singlų parsere)
  let currentYear: number | null = null
  let yearRowspan = 0

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    const hm = line.match(/^(==+)\s*(.+?)\s*\1/)
    if (hm) {
      const depth = hm[1].length, h = hm[2].toLowerCase()
      if (depth === 2 && /single|chart|collaborat|video|promo|appear|box.?set/.test(h)) inSinglesSection = true
      if (depth === 2 && /^album/.test(h)) inSinglesSection = false
      skipSection = /video|dvd|film|promo|tour|guest|appear|certif|box.?set|music.video/.test(h)
      if (h.includes('studio')) { currentType = 'studio'; skipSection = false }
      else if (h.includes('collaborative') || h.includes('collaboration')) { currentType = 'studio'; skipSection = false }
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
      else if (/^\d{4}s?$/.test(h.trim())) { skipSection = inSinglesSection }
      else if (depth >= 3 && inSinglesSection) { skipSection = true }
      yearMode = false; currentYear = null; yearRowspan = 0; continue
    }
    if (skipSection || inSinglesSection) continue
    if (line.startsWith('{|')) { inTable = true; yearMode = false; currentYear = null; yearRowspan = 0; continue }
    if (line.startsWith('|}')) { inTable = false; yearMode = false; continue }
    if (!inTable) continue

    // Row separator
    if (line.trim() === '|-') {
      if (yearRowspan > 1) yearRowspan--
      else if (yearRowspan === 1) yearRowspan = 0
      continue
    }

    if (/!.*rowspan.*Year|!rowspan.*Year/i.test(line)) { yearMode = true; continue }

    // Year eilutė (Year-first formatas)
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
      if (!title || title.length < 2 || wikiTitle.includes(':')) continue
      if (['discography','videography','certification','singles','chart'].some(b => title.toLowerCase().includes(b))) continue

      // Metai: pirma iš einamos eilutės, tada iš sekančių eilučių (Title-first formatas)
      let year = currentYear
      const yrInLine = line.match(/\b((?:19|20)\d{2})\b/)
      if (yrInLine) {
        year = parseInt(yrInLine[1])
      } else if (!currentYear) {
        // Pažiūrėti kitas eilutes (iki 15) — ieškome:
        // 1. Standartinės metų eilutės: | 2004
        // 2. Released: June 15, 2004 (Killers diskografijos stilius)
        for (let k = li + 1; k < Math.min(li + 15, lines.length); k++) {
          const nl = lines[k]
          if (nl.trim() === '|-') break
          if (/^!\s*[—–-]?\s*scope\s*=\s*['"]row['"]/i.test(nl)) break
          // Standartinė metų eilutė
          const yrNext = nl.match(/^\|\s*(?:rowspan\s*=\s*["']?\d+["']?\s*\|)?\s*((?:19|20)\d{2})\s*$/)
          if (yrNext) { year = parseInt(yrNext[1]); break }
          // "Released:" eilutė
          const relNext = nl.match(/[Rr]eleased[^|{]*?(\d{4})/)
          if (relNext) { year = parseInt(relNext[1]); break }
          // "* Released:" su bullet
          const relBullet = nl.match(/^\*\s*[Rr]eleased[^|{]*?(\d{4})/)
          if (relBullet) { year = parseInt(relBullet[1]); break }
        }
      }

      albums.push({ title, year, month: null, day: null, type: currentType, wikiTitle, source: 'wikipedia' })
      continue
    }

    if (yearMode && /^\|/.test(line) && !/^\|\|/.test(line)) {
      const wm = line.match(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/)
      if (wm) {
        const wikiTitle = wm[1].trim(), title = cleanWikiText(wm[2] || wm[1])
        if (title && title.length > 2 && !wikiTitle.includes(':') && !/^\d{4}/.test(title)) {
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

  // Metų sekimas su rowspan palaikymu
  let currentYear: number | null = null
  let yearRowspan = 0

  // Title-first formato sekimas
  let pendingTitle: string | null = null
  let pendingAlbum: string | undefined = undefined
  let pendingYearLine = false

  // Albumo rowspan sekimas — pvz. ''Queen'' rowspan=2 apima Keep Yourself Alive + Liar
  let currentAlbum: string | undefined = undefined
  let albumRowspan = 0

  // Year-first formatas
  let hasYearCol = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // ── Headers ──────────────────────────────────────────────────────────────
    const hm = line.match(/^(==+)\s*(.+?)\s*\1/)
    if (hm) {
      const depth = hm[1].length
      const h = hm[2].toLowerCase()
      const hRaw = hm[2]

      if (depth === 2 && /^singles\s*$/i.test(h)) {
        inSingles = true; skipSubSection = false; hasYearCol = false
        currentYear = null; yearRowspan = 0; pendingTitle = null; pendingAlbum = undefined; pendingYearLine = false
        continue
      }
      if (depth === 2 && inSingles) { inSingles = false; inTable = false; continue }
      if (inSingles && depth === 3) {
        if (/^\d{4}s?\s*$/i.test(hRaw.trim())) {
          // Dešimtmetis — reset ir tęsiame
          skipSubSection = false; hasYearCol = false
          currentYear = null; yearRowspan = 0; pendingTitle = null; pendingAlbum = undefined; pendingYearLine = false
        } else {
          skipSubSection = true
        }
        continue
      }
      continue
    }

    if (!inSingles || skipSubSection) continue
    if (line.startsWith('{|')) { inTable = true; hasYearCol = false; currentYear = null; yearRowspan = 0; pendingTitle = null; pendingAlbum = undefined; pendingYearLine = false; continue }
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
        const rawSuffix = qm[2].replace(/<[^>]+>/g, '').replace(/\{\{[^}]*\}\}/g, '').replace(/\[\d+\]/g, '').trim()
        const simpleSuffix = rawSuffix.match(/^(\([^)]{1,50}\))/)
        let title = simpleSuffix ? `${qm[1]} ${simpleSuffix[1]}` : qm[1]
        title = title.replace(/\s*[\[(](?:re-?release|re-?issue)[)\]]/gi, '').trim()
        if (title && title.length > 1) {
          // Albumą rasime iš vėlesnių eilučių
          let albumTitle: string | undefined
          for (let k = i + 1; k < Math.min(i + 20, lines.length); k++) {
            const nl = lines[k]
            if (nl.trim() === '|-' || nl.startsWith('!')) break
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
            singles.push({ title, year: currentYear, month: null, day: null, albumTitle, source: 'wikipedia', selected: false })
          } else {
            pendingTitle = title
            pendingAlbum = albumTitle
            pendingYearLine = true
          }
        }
      }
      continue
    }

    // ── Row separator |- ──────────────────────────────────────────────────────
    if (line.trim() === '|-') {
      if (yearRowspan > 1) yearRowspan--
      else if (yearRowspan === 1) yearRowspan = 0
      if (albumRowspan > 1) albumRowspan--
      else if (albumRowspan === 1) { albumRowspan = 0; currentAlbum = undefined }
      continue
    }

    // ── scope="row" eilutė — DAINA (Title-first, pvz. Queen 1970s-1990s) ─────
    if (/^!\s*[—–-]?\s*scope\s*=\s*['"]row['"]/i.test(line)) {
      // Pašalinti <ref>...</ref> blokus prieš parsavimą (juose gali būti [[wiki links]])
      const cleanLine = line
        .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
        .replace(/<ref[^/]*\/>/gi, '')

      // Paimti viską po scope="row"|
      const afterScope = cleanLine.replace(/^.*scope\s*=\s*['"]row['"]\s*\|?\s*/i, '').trim()

      // Surinkti visus wiki links iš IŠVALYTOS eilutės (be ref tagų)
      const allLinks: string[] = []
      const linkRe = /\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g
      let lm: RegExpExecArray | null
      while ((lm = linkRe.exec(cleanLine)) !== null) {
        allLinks.push(cleanWikiText(lm[2] || lm[1]))
      }

      let rawTitle = ''
      if (allLinks.length > 0) {
        rawTitle = allLinks.join(' / ')
        // Pridėti TIKTAI paprastą skliaustelių suffix po paskutinio wiki link'o
        // pvz. "[[Title]]" (2024 Mix) → "Title (2024 Mix)"
        // Bet NE: "[[Title]]" (released on the single E.P. ...)
        const afterLastLink = afterScope.replace(/.*\]\]/, '').replace(/<[^>]+>/g, '').replace(/\{\{[^}]*\}\}/g, '').trim()
        const simpleSuffix = afterLastLink.match(/^\s*(\([^)]{1,40}\))/)
        if (simpleSuffix) rawTitle += ' ' + simpleSuffix[1].trim()
      } else {
        // Kabučių pavadinimas: "Title" arba "Title" (Suffix)
        const qm = afterScope.match(/^"([^"]+)"\s*(.*)/)
        if (qm) {
          // Suffix: pasiimame tik paprastą skliaustelių suffix, be wiki markup
          const rawSuffix = qm[2].replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '').replace(/<[^>]+>/g, '').replace(/\{\{[^}]*\}\}/g, '').replace(/\[\d+\]/g, '').trim()
          const simpleSuffix = rawSuffix.match(/^(\([^)]{1,50}\))/)
          rawTitle = simpleSuffix ? `${qm[1]} ${simpleSuffix[1]}` : qm[1]
        } else {
          const pm = afterScope.match(/'{2,3}([^']+)'{2,3}/)
          if (pm) rawTitle = cleanWikiText(pm[1])
        }
      }

      rawTitle = rawTitle.replace(/\s*[\[(](?:re-?release|re-?issue)[)\]]/gi, '').trim()
      if (!rawTitle || rawTitle.length < 2 || rawTitle.toLowerCase() === 'row') continue
      // Skip jei tai EP/albumas pavadinimas, ne daina
      if (/\bE\.?P\.?\s*$/i.test(rawTitle)) continue

      // Split dvigubų singlų per " / " — kiekvienas tampa atskira daina
      const titleParts = rawTitle.split(/\s*\/\s*/).map(t => t.replace(/^["'\s]+|["'\s]+$/g, '').trim()).filter(t => t.length > 1)
        .filter(t => !/\bE\.?P\.?\s*$/i.test(t))  // skip EP pavadinimus

      // Albumą rasime iš vėlesnių eilučių (lookahead)
      let albumTitle: string | undefined
      for (let k = i + 1; k < Math.min(i + 30, lines.length); k++) {
        const nl = lines[k]
        if (nl.trim() === '|-' || /!\s*[—–-]?\s*scope\s*=\s*['"]row['"]/i.test(nl) || (nl.startsWith('!') && !nl.startsWith('!!'))) break
        if (/^\|/.test(nl) && !/^\|\|/.test(nl)) {
          if (/Non-album/i.test(nl)) { albumTitle = 'Non-album single'; break }
          if (/^\|\s*(?:rowspan\s*=\s*["']?\d+["']?\s*\|)?\s*((?:19|20)\d{2})\s*$/.test(nl)) continue
          if (/^\|\s*[-–—]\s*$/.test(nl) || /^\|\s*\|\|/.test(nl)) continue
          const nlClean = nl.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
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

      // Metai
      if (yearRowspan > 0) {
        for (const t of titleParts) {
          singles.push({ title: t, year: currentYear, month: null, day: null, albumTitle, source: 'wikipedia', selected: false })
        }
      } else {
        // Laukti metų iš kitos eilutės — saugoti visus
        pendingTitle = titleParts.join('\n')  // \n kaip separator
        pendingAlbum = albumTitle
        pendingYearLine = true
      }
      continue
    }

    // ── Eilutė su | duomenimis ────────────────────────────────────────────────
    if (line.startsWith('|') && !line.startsWith('||')) {

      // Metų eilutė: |1973  arba  |rowspan="3"|1974  arba  | rowspan=3| 1974
      const yearM = line.match(/^\|\s*(?:rowspan\s*=\s*["']?(\d+)["']?\s*\|)?\s*((?:19|20)\d{2})\s*$/)
      if (yearM) {
        currentYear = parseInt(yearM[2])
        yearRowspan = yearM[1] ? parseInt(yearM[1]) : 1
        if (pendingTitle && pendingYearLine) {
          const titleParts = pendingTitle.split('\n').filter(t => t.length > 1)
          for (const t of titleParts) {
            singles.push({ title: t, year: currentYear, month: null, day: null, albumTitle: pendingAlbum, source: 'wikipedia', selected: false })
          }
          pendingTitle = null; pendingAlbum = undefined; pendingYearLine = false
        }
        continue
      }

      pendingYearLine = false

      // Year-first formatas (Title stulpelis, hasYearCol=true)
      if (hasYearCol && !pendingTitle) {
        const allSegs = line.split('|').map(s => s.trim()).filter(Boolean)
        if (allSegs.length === 0) continue

        const firstSeg = allSegs[0]

        let title = ''
        const quotedM = firstSeg.match(/^"([^"]+)"\s*(.*)/)
        if (quotedM) {
          const rawSuffix = quotedM[2].replace(/<[^>]+>/g, '').replace(/\{\{[^}]*\}\}/g, '').replace(/\[\d+\]/g, '').trim()
          const simpleSuffix = rawSuffix.match(/^(\([^)]{1,50}\))/)
          title = simpleSuffix ? `${quotedM[1]} ${simpleSuffix[1]}` : quotedM[1]
        } else {
          // Wiki link be kursyvo — bet tik jei nėra ''...'' (kursyvas = albumas)
          if (/^''/.test(firstSeg)) continue  // kursyvas = albumas, skip
          const wm = firstSeg.match(/^\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/)
          if (wm) title = cleanWikiText(wm[2] || wm[1])
        }

        if (!title || title.length < 2) continue
        if (/^\d{4}/.test(title) || /^\d+$/.test(title)) continue

        // Skip jei tai albumas/organizacija, ne daina
        if (/\bedition\b|\bcollection\b|\banniversary\b|\bcollector\b|\bgreatest.?hits\b|\bsoundtrack\b|\bofficial.?charts?\b|\bcharts?\s+company\b/i.test(title)) continue
        if (/\bE\.?P\.?\s*$/i.test(title)) continue
        // Skip jei tai aiški non-single eilutė (pvz. "See also", "Notes")
        if (/^(see also|notes?|references?)\s*$/i.test(title)) continue

        // Pašalinti tik (re-release) ir (re-issue) — NE (Remix), NE (2024 Mix)
        title = title.replace(/\s*[\[(](?:re-?release|re-?issue)[)\]]/gi, '').trim()

        // Albumas — paskutinis segmentas su wiki link arba italics
        let albumTitle: string | undefined
        for (let sp = allSegs.length - 1; sp > 0; sp--) {
          const seg = allSegs[sp]
          if (/Non-album/i.test(seg)) { albumTitle = 'Non-album single'; break }
          const am = seg.match(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/)
          if (am) {
            const p = cleanWikiText(am[2] || am[1])
            if (p && p !== title && !/^\d+$/.test(p) && !/^[-–—]$/.test(p)) { albumTitle = p; break }
          }
          // Italics be wiki link: ''Album''
          const im = seg.match(/'{2,3}([^']+)'{2,3}/)
          if (im) {
            const p = cleanWikiText(im[1])
            if (p && p !== title && p.length > 1) { albumTitle = p; break }
          }
        }

        singles.push({ title, year: currentYear, month: null, day: null, albumTitle, source: 'wikipedia', selected: false })
      }
    }
  }

  // Jei liko pending
  if (pendingTitle) {
    const titleParts = pendingTitle.split('\n').filter(t => t.length > 1)
    for (const t of titleParts) {
      singles.push({ title: t, year: currentYear, month: null, day: null, albumTitle: pendingAlbum, source: 'wikipedia', selected: false })
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
  const pattern = /\{\{[Tt]rack\s*[Ll]isting/g
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
function extractTrackListingsWithPos(wikitext: string): { block: string; pos: number }[] {
  const results: { block: string; pos: number }[] = []
  const pattern = /\{\{[Tt]rack\s*[Ll]isting/g
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

// Rasti section heading prieš duotą poziciją
// Grąžina tik headings nuo paskutinio depth-2 heading'o — kad nefiltruotume
// dėl nesusijusių sekcijų (pvz. ==Reissues== prieš ==Track listing==)
function getSectionBeforePos(wikitext: string, pos: number): string {
  const textBefore = wikitext.slice(0, pos)
  const headings = [...textBefore.matchAll(/^(==+)\s*(.+?)\s*\1\s*$/gm)]
  if (!headings.length) return ''
  // Rasti paskutinį depth-2 heading'ą — tai "sekcijos šaknis"
  // Pvz. ==Track listing== → imame tik headings po jo
  let lastDepth2Idx = -1
  for (let i = headings.length - 1; i >= 0; i--) {
    if (headings[i][1].length === 2) { lastDepth2Idx = i; break }
  }
  // Imame tik headings nuo paskutinio depth-2 (įskaitant jį)
  const relevant = lastDepth2Idx >= 0 ? headings.slice(lastDepth2Idx) : headings
  return relevant.map(h => h[2].toLowerCase()).join(' | ')
}

function isReissueBlock(h: string, tl: string): boolean {
  const hl = h.toLowerCase()
  // Headline patikrinimas
  if (hl.includes('bonus') || hl.includes('deluxe') || hl.includes('japan') ||
    hl.includes('special') || hl.includes('itunes') || hl.includes('exclusive') ||
    hl.includes('limited') || hl.includes('remaster') || hl.includes('reissue') ||
    hl.includes('re-issue') || hl.includes('anniversary') || hl.includes('expanded') ||
    hl.includes('collector') || /^\d{4}/.test(hl)) return true

  // Jei headline tuščias — tikrinti tracklist bloko turinį
  if (!hl) {
    const nums = [...tl.matchAll(/\|\s*title(\d+)\s*=/g)].map(m => parseInt(m[1])).sort((a,b) => a-b)

    // Jei pirma daina bloke pradedama nuo 11+ — tai bonus blokas
    if (nums.length > 0 && nums[0] >= 11) return true

    // Jei bloke yra total_length ir nėra title1 — papildomas blokas
    // BET: nefilttruoti jei pirmas title numeris mažas (≤10) — tai gali būti Side two
    const hasTitle1 = /\|\s*title1\s*=/.test(tl)
    const firstNum = nums.length > 0 ? nums[0] : 0
    if (/\|\s*total_length\s*=/.test(tl) && !hasTitle1 && firstNum >= 11) return true
  }
  return false
}

function isDiscBlock(tl: string): boolean {
  return /\|\s*headline\s*=.*[Dd]isc\s*[12]/i.test(tl) || /\|\s*disc\s*=\s*[12]/i.test(tl)
}

function parseSinglesFromInfobox(wikitext: string): Set<string> {
  const singles = new Set<string>()

  function extractSingleNames(text: string) {
    const re = /\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g
    let lm: RegExpExecArray | null
    // Disambiguation sufixai kuriuos reikia pašalinti (ne dalis pavadinimo)
    const disambigRe = /\s*\((song|album|single|band|film|Queen song|[A-Z][a-z]+ song|[A-Z][a-z]+ album)\)$/i
    while ((lm = re.exec(text)) !== null) {
      const raw = lm[2] || lm[1].replace(/#[^\]]*$/, '')
      // Jei yra display tekstas (po |) - naudoti tą, jis jau švarus
      // Jei nėra display teksto - pašalinti tik Wikipedia disambiguation sufixus
      const name = lm[2]
        ? lm[2].replace(/'+/g, '').trim()
        : lm[1].replace(/#[^\]]*$/, '').replace(disambigRe, '').replace(/'+/g, '').trim()
      if (name.length > 1) singles.add(name.toLowerCase())
    }
  }

  // Format 1: | singles = [[Song1]] / [[Song2]]
  const m = wikitext.match(/\|\s*singles?\s*=([\s\S]*?)(?=\n\s*\||\n\}\})/)
  if (m) extractSingleNames(m[1])

  // Format 2: {{Singles | single1 = [[Song]] | single2 = [[Song]] ... }}
  // Rasti {{Singles bloko pradžią, tada ieškoti single\d+ laukų iki albumo infobox pabaigos
  const singlesStart = wikitext.search(/\{\{[Ss]ingles/)
  if (singlesStart !== -1) {
    // Ieškoti nuo Singles bloko pradžios iki | prev_title arba }}{{Singles pabaigos
    // Imti pakankamai teksto (iki 3000 simbolių) - užteks bet kuriam Singles blokui
    const chunk = wikitext.slice(singlesStart, singlesStart + 3000)
    const sRe = /\|\s*single(\d+)\s*=\s*((?:\[\[[^\]]*\]\]|[^|\n])+)/g
    let sm: RegExpExecArray | null
    while ((sm = sRe.exec(chunk)) !== null) {
      extractSingleNames(sm[2])
    }
  }

  return singles
}

function parseTracklist(wikitext: string): TrackEntry[] {
  const singles = parseSinglesFromInfobox(wikitext)
  const tlWithPos = extractTrackListingsWithPos(wikitext)
  const tlBlocks = tlWithPos.map(t => t.block)

  if (!tlBlocks.length) {
    const tracks: TrackEntry[] = []
    let order = 1
    for (const line of wikitext.split('\n')) {
      const m = line.match(/^#+\s*(.+)/)
      if (m) {
        const { cleanTitle, featuring } = parseFeaturing(cleanWikiText(m[1]))
        if (cleanTitle.length > 1) tracks.push({ title: cleanTitle, sort_order: order++, featuring: featuring.length ? featuring : undefined })
      }
    }
    return tracks
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
          // Tikslus sutapimas
          singles.has(normalizedTitle) ||
          // "Flash" singlas → "Flash's Theme" trackas (apostrofas + "s" po singlo pavadinimo)
          // BET NE: "Flash to the Rescue", "Flash's Theme Reprise"
          [...singles].some(s => {
            if (normalizedTitle === s) return true
            const afterSingle = normalizedTitle.slice(s.length)
            // Tik apostrofo-s formos: "flashs theme" (iš "Flash's Theme")
            return normalizedTitle.startsWith(s) && afterSingle.startsWith('s ') && !afterSingle.includes('reprise')
          })
        ) : undefined
        // Nustatyti track tipą iš note ir pavadinimo
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
    // Multi-disc albumas — imame visus disc blokus
    let order = 1
    for (const tl of tlBlocks) { const nt = parseBlock(tl, order); allTracks.push(...nt); order += nt.length }
  } else {
    const getHeadline = (tl: string) => { const m = tl.match(/\|\s*(?:headline|caption)\s*=\s*([^\n|]+)/); return m ? m[1].replace(/[''+\[\]]/g, '').trim() : '' }

    // Filtruoti naudojant ir headline, ir section kontekstą
    const standard = tlWithPos.filter(({ block, pos }) => {
      const hl = getHeadline(block)
      if (isReissueBlock(hl, block)) return false
      // Papildomai tikrinti section heading prieš šį bloką
      const sectionBefore = getSectionBeforePos(wikitext, pos)
      if (/reissue|remaster|anniversary|box.?set|collector|deluxe|expanded|bonus|demo|outtake/i.test(sectionBefore)) return false
      return true
    }).map(({ block }) => block)

    const toUse = standard.length ? standard : [tlBlocks[0]]

    // Imame VISUS standartinius blokus (Side one + Side two sudaro vieną albumą)
    const existing = new Set<string>()
    let order = 1
    for (const tl of toUse) {
      for (const t of parseBlock(tl, order)) {
        if (!existing.has(t.title.toLowerCase())) {
          allTracks.push({ ...t, sort_order: order++ })
          existing.add(t.title.toLowerCase())
        }
      }
    }
  }
  return allTracks
}

function parseReleaseDate(wikitext: string): { year: number | null; month: number | null; day: number | null } {
  const s1 = wikitext.match(/\{\{[Ss]tart\s*date\|(\d{4})\|?(\d{1,2})?\|?(\d{1,2})?/)
  if (s1) return { year: parseInt(s1[1]), month: s1[2] ? parseInt(s1[2]) : null, day: s1[3] ? parseInt(s1[3]) : null }
  const i1 = wikitext.match(/\|\s*released\s*=\s*(\d{4})-(\d{2})-(\d{2})/)
  if (i1) return { year: parseInt(i1[1]), month: parseInt(i1[2]), day: parseInt(i1[3]) }
  const r1 = wikitext.match(/\|\s*released\s*=\s*[^|{[\n]*?(\w+ \d{1,2},?\s*\d{4})/)
  if (r1) { const d = new Date(r1[1]); if (!isNaN(d.getTime())) return { year: d.getFullYear(), month: d.getMonth()+1, day: d.getDate() } }
  const y1 = wikitext.match(/\|\s*released\s*=\s*.*?(\d{4})/)
  if (y1) return { year: parseInt(y1[1]), month: null, day: null }
  return { year: null, month: null, day: null }
}

// ─── MusicBrainz utils ────────────────────────────────────────────────────────

function mbTypeToLocal(primary?: string, secondary?: string[]): AlbumType {
  const sec = (secondary || []).map(s => s.toLowerCase())
  if (sec.includes('compilation') || sec.includes('greatest hits')) return 'compilation'
  if (sec.includes('live')) return 'live'
  if (sec.includes('remix')) return 'remix'
  if (sec.includes('demo')) return 'demo'
  if (sec.includes('soundtrack')) return 'soundtrack'
  if (sec.includes('mixtape/street') || sec.includes('bootleg')) return 'other'
  const p = (primary || '').toLowerCase()
  if (p === 'single') return 'single'
  if (p === 'ep') return 'ep'
  if (p === 'album') return 'studio'
  return 'other'
}

async function mbFindArtist(name: string): Promise<{ id: string; name: string } | null> {
  try {
    const res = await fetch(`/api/mb-proxy?path=${encodeURIComponent(`artist/?query=${encodeURIComponent('"' + name + '"')}&limit=5&fmt=json`)}`)
    if (!res.ok) return null
    const data = await res.json()
    const best = (data.artists || []).find((a: any) => a.score >= 85) || data.artists?.[0]
    return best ? { id: best.id, name: best.name } : null
  } catch { return null }
}

async function mbFetchDiscography(artistId: string): Promise<DiscographyItem[]> {
  const items: DiscographyItem[] = []
  let offset = 0
  while (true) {
    const res = await fetch(`/api/mb-proxy?path=${encodeURIComponent(`release-group?artist=${artistId}&limit=100&offset=${offset}&fmt=json`)}`)
    if (!res.ok) break
    const data = await res.json()
    const rgs = data['release-groups'] || []
    if (!rgs.length) break
    for (const rg of rgs) {
      const type = mbTypeToLocal(rg['primary-type'], rg['secondary-types'])
      if (type === 'single') continue
      const parts = (rg['first-release-date'] || '').split('-')
      items.push({ title: rg.title, year: parts[0] ? parseInt(parts[0]) : null, month: parts[1] ? parseInt(parts[1]) : null, day: parts[2] ? parseInt(parts[2]) : null, type, mbId: rg.id, source: 'musicbrainz' })
    }
    if (offset + 100 >= (data['release-group-count'] || 0)) break
    offset += 100
    await new Promise(r => setTimeout(r, 300))
  }
  return items.sort((a, b) => (a.year || 9999) - (b.year || 9999))
}

async function mbFetchSingles(artistId: string): Promise<SingleSongItem[]> {
  const items: SingleSongItem[] = []
  let offset = 0
  while (true) {
    const res = await fetch(`/api/mb-proxy?path=${encodeURIComponent(`release-group?artist=${artistId}&type=single&limit=100&offset=${offset}&fmt=json`)}`)
    if (!res.ok) break
    const data = await res.json()
    const rgs = data['release-groups'] || []
    if (!rgs.length) break
    for (const rg of rgs) {
      const parts = (rg['first-release-date'] || '').split('-')
      items.push({ title: rg.title, year: parts[0] ? parseInt(parts[0]) : null, month: parts[1] ? parseInt(parts[1]) : null, day: parts[2] ? parseInt(parts[2]) : null, source: 'musicbrainz', selected: true })
    }
    if (offset + 100 >= (data['release-group-count'] || 0)) break
    offset += 100
    await new Promise(r => setTimeout(r, 300))
  }
  return items.sort((a, b) => (a.year || 9999) - (b.year || 9999))
}

async function mbFetchTracks(releaseGroupId: string): Promise<{ tracks: TrackEntry[]; cover: string }> {
  try {
    const res = await fetch(`/api/mb-proxy?path=${encodeURIComponent(`release?release-group=${releaseGroupId}&inc=recordings&limit=1&fmt=json`)}`)
    if (!res.ok) return { tracks: [], cover: '' }
    const data = await res.json()
    const release = data.releases?.[0]
    if (!release) return { tracks: [], cover: '' }
    const tracks: TrackEntry[] = []
    let order = 1
    for (const medium of release.media || []) {
      for (const track of medium.tracks || []) {
        const ms = track.length
        const duration = ms ? `${Math.floor(ms/60000)}:${String(Math.floor((ms%60000)/1000)).padStart(2,'0')}` : undefined
        tracks.push({ title: track.title || track.recording?.title || '', duration, sort_order: order++, disc_number: medium.position || 1 })
      }
    }
    let cover = ''
    try {
      const cr = await fetch(`https://coverartarchive.org/release-group/${releaseGroupId}/front-500`, { redirect: 'follow' })
      if (cr.ok) cover = cr.url
    } catch {}
    return { tracks, cover }
  } catch { return { tracks: [], cover: '' } }
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

// Ieškoti YouTube URL per MusicBrainz (nemokama, ~1req/s)
async function findYouTubeViaMB(artistName: string, trackTitle: string): Promise<string | null> {
  try {
    // 1. Surasti recording MBID
    const q = encodeURIComponent(`artist:"${artistName}" AND recording:"${trackTitle}"`)
    const r1 = await fetch(
      `https://musicbrainz.org/ws/2/recording?query=${q}&limit=1&fmt=json`,
      { headers: { 'User-Agent': 'music.lt/1.0 (music@music.lt)' } }
    )
    if (!r1.ok) return null
    const d1 = await r1.json()
    const mbid = d1.recordings?.[0]?.id
    if (!mbid) return null

    // 2. Gauti URL relationships (ypač YouTube nuorodas)
    await new Promise(r => setTimeout(r, 1100)) // MB rate limit: 1 req/s
    const r2 = await fetch(
      `https://musicbrainz.org/ws/2/recording/${mbid}?inc=url-rels&fmt=json`,
      { headers: { 'User-Agent': 'music.lt/1.0 (music@music.lt)' } }
    )
    if (!r2.ok) return null
    const d2 = await r2.json()

    // Ieškoti YouTube arba YouTube Music nuorodų
    const ytRel = (d2.relations || []).find((rel: any) => {
      const url: string = rel.url?.resource || ''
      return url.includes('youtube.com/watch') || url.includes('youtu.be/')
    })
    if (ytRel) {
      // Konvertuoti YouTube Music į standartinį YouTube URL
      const url: string = ytRel.url.resource
      return url.replace('music.youtube.com', 'www.youtube.com')
    }
    return null
  } catch {
    return null
  }
}

async function enrichTracks(albumId: number, artistName: string, addLog: (s: string) => void, lyrics = true, onProgress?: (done: number, total: number) => void) {
  let dbTracks: any[] = []
  try { dbTracks = (await (await fetch(`/api/tracks?album_id=${albumId}&limit=200`)).json()).tracks || [] } catch { return }
  if (!dbTracks.length) return
  addLog(`  ${dbTracks.length} dainų...`)
  let mbN = 0, lyrN = 0, done = 0

  // Procesavame po vieną — MusicBrainz rate limit 1 req/s
  for (const t of dbTracks) {
    const u: Record<string,any> = {}

    // YouTube tik per MusicBrainz (nemokama)
    const mbUrl = await findYouTubeViaMB(artistName, t.title)
    if (mbUrl) { u.video_url = mbUrl; mbN++ }

    if (lyrics) try {
      const r = await fetch(`/api/search/lyrics?artist=${encodeURIComponent(artistName)}&title=${encodeURIComponent(t.title)}`)
      if (r.ok) { const d = await r.json(); if (d.lyrics) { u.lyrics = d.lyrics; lyrN++ } }
    } catch {}

    if (Object.keys(u).length) try {
      await fetch(`/api/tracks/${t.id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(u) })
    } catch {}

    done++
    if (done % 5 === 0 || done === dbTracks.length) {
      addLog(`  ${done}/${dbTracks.length} (MB:${mbN})`)
      onProgress?.(done, dbTracks.length)
    }
  }
  addLog(`  ✓ MB:${mbN} žodžiai:${lyrN}`)
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

type ActiveTab = 'studio' | 'other' | 'singles' | 'songs'

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
  const [artistGroups, setArtistGroups] = useState<string[]>([])
  const [songs, setSongs] = useState<SingleSongItem[]>([])
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set())

  const [log, setLog] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const { startTask, updateTask, finishTask, errorTask } = useBackgroundTasks()
  const [enrichYoutube, setEnrichYoutube] = useState(false)
  const [sortDesc, setSortDesc] = useState(true)
  const [enrichLyrics, setEnrichLyrics] = useState(true)
  const [mbLoading, setMbLoading] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  const addLog = (msg: string) => setLog(p => [...p, msg])

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [log])

  // ── Paieška ────────────────────────────────────────────────────────────────

  const search = async (groupFilter?: string) => {
    setLoading(true); setItems([]); setSongs([]); setLog([]); setSelected(new Set())
    addLog(`🔍 ${artistName}...`)

    const wikiBase = wikiUrl.trim() ? extractWikiTitle(wikiUrl) : artistName.replace(/ /g, '_')
    addLog(`📖 ${wikiBase}`)
    const mainWikitext = await fetchWikitext(wikiBase)

    let foundAlbums: DiscographyItem[] = []
    let foundSongs: SingleSongItem[] = []

    if (mainWikitext) {
      const groups = hasMultipleArtistSections(mainWikitext)
      if (groups.length > 1 && !groupFilter && !isSolo) { setArtistGroups(groups); setLoading(false); return }
      const filter = isSolo && !groupFilter ? '__solo__' : groupFilter
      let wikiAlbums = parseMainPageDiscography(mainWikitext, isSolo, filter)

      const mainSingles = parseSinglesSection(mainWikitext)
      if (mainSingles.length) foundSongs = mainSingles

      // Discography puslapio URL
      const discTitle = wikiBase.replace(/_discography$/i, '') + '_discography'
      const hasDiscPage = discTitle !== wikiBase

      if (!wikiAlbums.length) {
        if (hasDiscPage) {
          addLog(`→ ${discTitle}`)
          const dw = await fetchWikitext(discTitle)
          if (dw) {
            wikiAlbums = parseDiscographyPage(dw)
            const ds = parseSinglesSection(dw)
            if (ds.length && !foundSongs.length) foundSongs = ds
          }
        }
      } else {
        // Albumai rasti iš pagrindinio puslapio — bet gali trūkti live/compilation/EP
        // Krauname discography puslapį dėl pilnesnio sąrašo ir singlų
        if (hasDiscPage) {
          addLog(`→ ${discTitle} (papildymas)`)
          const dw = await fetchWikitext(discTitle)
          if (dw) {
            // Jei discography puslapis grąžina daugiau/kitokius albumus — naudoti jį
            const discAlbums = parseDiscographyPage(dw)
            if (discAlbums.length > wikiAlbums.length) {
              wikiAlbums = discAlbums
              addLog(`✓ Albumai atnaujinti: ${discAlbums.length}`)
            }
            // Singlai visada iš discography puslapio (jei ten jų yra)
            if (!foundSongs.length) {
              const ds = parseSinglesSection(dw)
              if (ds.length) foundSongs = ds
            }
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
    if (da+ds > 0) addLog(`⚠ ${da} albumų + ${ds} dainų jau DB`)
    else addLog('✓ Dublikatų nerasta')

    const albumsF = foundAlbums.map(it => { const k = it.title.toLowerCase(); return albumDups[k] ? { ...it, duplicate: true, duplicateId: albumDups[k] } : it })
    // Fuzzy matching: singlo pavadinimas gali nesutapti tiksliai su treko pavadinimu
    // pvz. "Flash" singlas vs "Flash's Theme" trackas DB'e
    const songsF = foundSongs.map(s => {
      const k = s.title.toLowerCase()
      if (songDups[k]) return { ...s, duplicate: true, duplicateId: songDups[k], selected: false }
      // Tikrinti fuzzy match: ar singlo pav. yra DB treko pav. pradžia (pvz. "flash" ⊂ "flash's theme")
      const normS = k.replace(/['’]/g, '')
      const fuzzyMatch = Object.entries(songDups).find(([dbTitle]) => {
        const normD = dbTitle.replace(/['’]/g, '')
        if (normD === normS) return true
        const after = normD.slice(normS.length)
        return normD.startsWith(normS) && after.startsWith('s ')
      })
      if (fuzzyMatch) return { ...s, duplicate: true, duplicateId: fuzzyMatch[1] as number, selected: false }
      return { ...s, selected: false }
    })

    setArtistGroups([])
    setItems(albumsF)
    setSelected(new Set(albumsF.map((it, i) => (!it.duplicate && AUTO_SELECT_TYPES.includes(it.type)) ? i : -1).filter(i => i !== -1)))
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
      if (item.source === 'musicbrainz' && item.mbId) {
        const { tracks, cover } = await mbFetchTracks(item.mbId)
        addLog(`  → ${tracks.length} dainų${cover ? ', viršelis' : ''}`)
        setItems(p => p.map((it, i) => i === idx ? { ...it, tracks, fetched: true, cover_image_url: cover || it.cover_image_url } : it))
        return
      }
      if (!item.wikiTitle) { setItems(p => p.map((it, i) => i === idx ? { ...it, fetched: true, tracks: [] } : it)); return }
      const [wikitext, cover] = await Promise.all([fetchWikitext(item.wikiTitle), fetchCoverImage(item.wikiTitle)])
      const dateInfo = parseReleaseDate(wikitext)
      const tracks = parseTracklist(wikitext)
      // Aptikti papildomus tipus iš longtype lauko (pvz. soundtrack + studio)
      const longtypeM = wikitext.match(/\|\s*longtype\s*=([^\n|]+)/)
      const longtypeStr = (longtypeM?.[1] || '').toLowerCase()
      const extraTypes: AlbumType[] = []
      if (longtypeStr.includes('soundtrack')) extraTypes.push('soundtrack')
      if (longtypeStr.includes('compilation')) extraTypes.push('compilation')
      if (longtypeStr.includes('live')) extraTypes.push('live')
      if (longtypeStr.includes('ep')) extraTypes.push('ep')
      setItems(p => p.map((it, i) => i === idx ? { ...it, tracks, fetched: true, cover_image_url: cover || it.cover_image_url, year: dateInfo.year ?? it.year, month: dateInfo.month, day: dateInfo.day, extraTypes: extraTypes.length ? extraTypes : it.extraTypes } : it))
      addLog(`  → ${tracks.length} dainų${cover ? ', viršelis' : ''}`)
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

  // ── MB papildymas ──────────────────────────────────────────────────────────

  const enrichFromMB = async () => {
    setMbLoading(true)
    addLog('🎵 MusicBrainz...')
    const mbArtist = await mbFindArtist(artistName)
    if (!mbArtist) { addLog('✗ MB: nerastas'); setMbLoading(false); return }
    addLog(`  → "${mbArtist.name}"`)

    if (activeTab === 'singles' || activeTab === 'songs') {
      const mbSingles = await mbFetchSingles(mbArtist.id)
      const existing = new Set(songs.map(s => s.title.toLowerCase()))
      const newOnes = mbSingles.filter(s => !existing.has(s.title.toLowerCase()))
      addLog(`✓ MB singlai: ${mbSingles.length} viso, ${newOnes.length} naujų`)
      if (newOnes.length) {
        const dups = await checkTrackDuplicates(newOnes.map(s => s.title), artistId)
        const withDups = newOnes.map(s => {
          const k = s.title.toLowerCase()
          if (dups[k]) return { ...s, duplicate: true, duplicateId: dups[k], selected: false }
          const normS = k.replace(/['’]/g, '')
          const fuzzy = Object.entries(dups).find(([dt]) => { const nd = dt.replace(/['’]/g,''); const after = nd.slice(normS.length); return nd.startsWith(normS) && after.startsWith('s ') })
          return fuzzy ? { ...s, duplicate: true, duplicateId: fuzzy[1] as number, selected: false } : s
        })
        setSongs(p => [...p, ...withDups].sort((a,b) => (a.year||9999)-(b.year||9999)))
      }
    } else {
      const mbItems = await mbFetchDiscography(mbArtist.id)
      const existing = new Set(items.map(i => i.title.toLowerCase()))
      const newOnes = mbItems.filter(i => !existing.has(i.title.toLowerCase()))
      addLog(`✓ MB albumai: ${mbItems.length} viso, ${newOnes.length} naujų`)
      if (newOnes.length) {
        const dups = await checkAlbumDuplicates(newOnes.map(i => i.title), artistId)
        const withDups = newOnes.map(it => { const k = it.title.toLowerCase(); return dups[k] ? { ...it, duplicate: true, duplicateId: dups[k] } : it })
        const typeOrder: Record<AlbumType, number> = { studio: 0, ep: 1, single: 2, compilation: 3, live: 4, remix: 5, covers: 6, holiday: 7, soundtrack: 8, demo: 9, other: 10 }
        const merged = [...items, ...withDups].sort((a,b) => typeOrder[a.type] !== typeOrder[b.type] ? typeOrder[a.type]-typeOrder[b.type] : (a.year||9999)-(b.year||9999))
        setItems(merged)
        setSelected(new Set(merged.map((it, i) => (!it.duplicate && AUTO_SELECT_TYPES.includes(it.type)) ? i : -1).filter(i => i !== -1)))
      }
    }
    setMbLoading(false)
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
    let ok = 0, fail = 0
    for (const idx of indices) {
      const item = snapshot[idx]
      if (!item || item.duplicate) continue
      setItems(p => p.map((it, i) => i === idx ? { ...it, importing: true } : it))
      try {
        const res = await fetch('/api/albums', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            title: item.title, artist_id: artistId, year: item.year||null, month: item.month||null, day: item.day||null,
            cover_image_url: item.cover_image_url||'',
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
            tracks: (item.tracks||[]).map((t,i) => ({ title: t.title, sort_order: i+1, duration: t.duration||null, type: t.type||'normal', disc_number: t.disc_number||1, is_single: t.is_single||false, featuring: t.featuring||[] })),
          }),
        })
        if (!res.ok) throw new Error((await res.json()).error)
        const newAlbum = await res.json()
        const albumId = newAlbum.id || newAlbum.album?.id
        addLog(`✓ ${item.title} (${item.tracks?.length||0})`)
        ok++
        if (albumId && item.tracks?.length)
          await enrichTracks(albumId, artistName, addLog, enrichLyrics, (done, total) => updateTask('import', `${item.title}: žodžiai ${done}/${total}`))
        setItems(p => p.map((it, i) => i === idx ? { ...it, importing: false, imported: true } : it))
        setSelected(p => { const s = new Set(p); s.delete(idx); return s })
      } catch (e: any) {
        setItems(p => p.map((it, i) => i === idx ? { ...it, importing: false, error: e.message } : it))
        addLog(`✗ ${item.title}: ${e.message}`); fail++
      }
      await new Promise(r => setTimeout(r, 200))
    }
    setImporting(false)
    addLog(`✓ ${ok} albumų${fail ? `, ${fail} klaida` : ''}`)
    if (fail > 0) errorTask('import', `${ok} importuota, ${fail} klaidos`)
    else finishTask('import', `${ok} albumų importuota`)

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
    let okNew = 0, okMark = 0, fail = 0
    addLog(`🎤 ${toImport.length} dainų...`)
    for (const song of toImport) {
      setSongs(p => p.map(s => s.title === song.title ? { ...s, importing: true } : s))
      try {
        if (song.duplicateId) {
          const res = await fetch(`/api/tracks/${song.duplicateId}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ is_single: true }) })
          if (!res.ok) {
            let errMsg = `PATCH ${res.status}`
            try { const d = await res.json(); errMsg = d.error || d.message || errMsg } catch {}
            throw new Error(errMsg)
          }
          okMark++
        } else {
          const res = await fetch('/api/tracks', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ title: song.title, artist_id: artistId, type: 'normal', is_single: true, release_year: song.year, release_month: song.month, release_day: song.day }),
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
            if (enrichYoutube) {
              try {
                const q = `${artistName} ${song.title}`
                const r = await fetch(`/api/search/youtube?q=${encodeURIComponent(q)}&type=video`)
                if (r.ok) { const d = await r.json(); if (d.error) addLog(`  ⚠️ YT: ${d.error.slice(0,60)}`); const f = d.results?.[0]; if (f?.videoId && titleMatches(f.title, q)) updates.video_url = `https://www.youtube.com/watch?v=${f.videoId}` }
              } catch {}
            }
            if (enrichLyrics) {
              try {
                const r = await fetch(`/api/search/lyrics?artist=${encodeURIComponent(artistName)}&title=${encodeURIComponent(song.title)}`)
                if (r.ok) { const d = await r.json(); if (d.lyrics) updates.lyrics = d.lyrics }
              } catch {}
            }
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
    }
    setImporting(false)
    addLog(`✓ ${okNew} singlų importuota${okMark ? `, ${okMark} pažymėta` : ''}${fail ? `, ${fail} klaida` : ''}`)
  }

  // ── UI helpers ─────────────────────────────────────────────────────────────

  const toggleSelect = (i: number) => {
    if (items[i]?.duplicate || items[i]?.imported) return
    setSelected(p => { const s = new Set(p); s.has(i) ? s.delete(i) : s.add(i); return s })
  }

  const toggleSong = (title: string) => setSongs(p => p.map(s => s.title === title && !s.duplicate && !s.imported ? { ...s, selected: !s.selected } : s))
  const selectAllSongs = (val: boolean) => setSongs(p => p.map(s => s.duplicate || s.imported ? s : { ...s, selected: val }))

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
  const handleOpen = () => { setOpen(true); if (!searched) { setSearched(true); setTimeout(() => search(), 100) } }

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
    setExpandedItems(p => { const s = new Set(p); s.has(i) ? s.delete(i) : s.add(i); return s })
    if (!items[i].fetched && !expandedItems.has(i)) {
      await fetchDetails(i)
    }
  }

  // ── Album row renderer ─────────────────────────────────────────────────────

  const renderAlbumRow = (it: DiscographyItem, i: number) => {
    const isExpanded = expandedItems.has(i)
    const isFetching = it.fetched === false && expandedItems.has(i)
    return (
      <div key={i} className={`rounded-lg border transition-all ${
        it.duplicate ? 'border-gray-100 bg-gray-50/50 opacity-40'
        : it.imported ? 'border-emerald-200 bg-emerald-50/50'
        : selected.has(i) ? 'border-violet-300 bg-violet-50'
        : 'border-gray-200 bg-white hover:border-gray-300'
      }`}>
        {/* Main row */}
        <div className={`flex items-center gap-2.5 px-3 py-2 ${it.duplicate ? 'cursor-not-allowed' : 'cursor-pointer'}`}
          onClick={() => !it.duplicate && !it.imported && toggleSelect(i)}>
          {/* Checkbox */}
          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
            selected.has(i) && !it.duplicate && !it.imported ? 'border-violet-500 bg-violet-500' : 'border-gray-300'
          }`}>
            {selected.has(i) && !it.duplicate && !it.imported && (
              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            )}
            {it.imported && <svg className="w-2.5 h-2.5 text-emerald-500" fill="none" viewBox="0 0 10 10"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          </div>
          {/* Cover */}
          {it.cover_image_url
            ? <img src={it.cover_image_url} alt="" referrerPolicy="no-referrer" className="w-9 h-9 rounded object-cover shrink-0" />
            : <div className="w-9 h-9 rounded bg-gray-100 shrink-0 flex items-center justify-center text-gray-300 text-xs">♪</div>
          }
          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-medium text-gray-900 truncate">{it.title}</span>
              {it.type === 'ep' && <span className="text-[10px] font-semibold text-violet-500 shrink-0 uppercase tracking-wide">EP</span>}
              {it.extraTypes?.map(et => (
                <span key={et} className="text-[10px] font-semibold text-blue-400 shrink-0 uppercase tracking-wide">{et === 'soundtrack' ? 'Garso takelis' : et}</span>
              ))}
              {it.source === 'musicbrainz' && <span className="text-[10px] text-blue-400 shrink-0">MB</span>}
              {it.duplicate && <span className="text-[10px] text-amber-500 shrink-0">jau yra</span>}
              {it.importing && <span className="text-[10px] text-violet-400 animate-pulse shrink-0">importuojama</span>}
              {it.imported && <span className="text-[10px] text-emerald-500 shrink-0">✓ importuota</span>}
              {it.error && <span className="text-[10px] text-red-400 shrink-0" title={it.error}>klaida</span>}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {it.year && <span className="text-[11px] text-gray-400">{it.year}</span>}
              {it.tracks !== undefined && (
                <span className="text-[11px] text-gray-400">
                  {it.tracks.length} dainų{it.tracks.filter(t=>t.is_single).length ? ` · ${it.tracks.filter(t=>t.is_single).length} singlai` : ''}
                </span>
              )}
              {it.duplicate && it.duplicateId && (
                <a href={`/admin/albums/${it.duplicateId}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-[10px] text-blue-500 hover:underline">atidaryti →</a>
              )}
            </div>
          </div>
          {/* Parsisiųsti info — inline mygtukas */}
          {!it.duplicate && !it.imported && (
            <button type="button"
              onClick={e => { e.stopPropagation(); fetchDetails(i) }}
              disabled={it.fetched || importing}
              title={it.fetched ? 'Info parsisiųsta' : 'Parsisiųsti dainas ir viršelį'}
              className={`shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors disabled:opacity-40 ${
                it.fetched
                  ? 'text-emerald-500 bg-emerald-50'
                  : 'text-gray-500 bg-gray-100 hover:bg-violet-100 hover:text-violet-600'
              }`}>
              {it.fetched ? (
                <><svg className="w-3 h-3" fill="none" viewBox="0 0 10 10"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> info</>
              ) : (
                <><svg className="w-3 h-3" fill="none" viewBox="0 0 10 10"><path d="M5 1v6M2 6l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg> info</>
              )}
            </button>
          )}
          {/* Expand tracks */}
          <button type="button"
            onClick={e => { e.stopPropagation(); toggleExpand(i) }}
            disabled={it.duplicate}
            className={`shrink-0 w-6 h-6 rounded flex items-center justify-center text-[11px] transition-colors disabled:opacity-30 ${
              isExpanded ? 'bg-violet-100 text-violet-600' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'
            }`}
            title={isExpanded ? 'Slėpti dainas' : 'Rodyti dainas'}>
            {isExpanded ? '▲' : '▼'}
          </button>
        </div>
        {/* Tracks preview */}
        {isExpanded && (
          <div className="border-t border-gray-100 px-3 py-2">
            {!it.fetched ? (
              <div className="text-xs text-gray-400 py-1 flex items-center gap-2">
                <div className="w-3 h-3 border border-gray-300 border-t-violet-500 rounded-full animate-spin" />
                Kraunama...
              </div>
            ) : !it.tracks?.length ? (
              <div className="text-xs text-gray-400 py-1">Dainų nerasta. Spausk „info" mygtuką kad parsisiųstum.</div>
            ) : (
              <div className="space-y-0.5 max-h-48 overflow-y-auto">
                {it.tracks.map((t, ti) => (
                  <div key={ti} className="flex items-center gap-2 py-0.5">
                    <span className="text-[10px] text-gray-300 w-5 text-right shrink-0">{t.sort_order}</span>
                    <span className="text-xs text-gray-700 truncate flex-1">{t.title}</span>
                    {t.type === 'instrumental' && <span className="text-[9px] text-gray-400 shrink-0 font-medium">instr.</span>}
                    {t.type === 'live' && <span className="text-[9px] text-blue-400 shrink-0 font-medium">live</span>}
                    {t.type === 'remix' && <span className="text-[9px] text-purple-400 shrink-0 font-medium">remix</span>}
                    {t.type === 'covers' && <span className="text-[9px] text-orange-400 shrink-0 font-medium">cover</span>}
                    {t.is_single && <span className="text-[9px] text-violet-400 shrink-0 font-medium">S</span>}
                    {t.duration && <span className="text-[10px] text-gray-300 shrink-0">{t.duration}</span>}
                  </div>
                ))}
              </div>
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

  const tabDef: { id: ActiveTab; label: string; count: number; newCount: number; imported: number; hasNew: boolean; showAlways?: boolean }[] = [
    { id: 'studio', label: 'Studijiniai', count: tabCounts.studio, newCount: tabNew.studio, imported: tabImported.studio, hasNew: tabHasNew.studio },
    { id: 'other', label: 'Kiti albumai', count: tabCounts.other, newCount: tabNew.other, imported: tabImported.other, hasNew: tabHasNew.other },
    { id: 'singles', label: 'Singlai', count: tabCounts.singles, newCount: tabNew.singles, imported: tabImported.singles, hasNew: tabHasNew.singles, showAlways: true },
  ]

  const hasContent = items.length > 0 || songs.length > 0

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <button type="button" onClick={handleOpen}
        className={buttonClassName ?? "flex items-center gap-2 px-4 py-2 bg-violet-50 hover:bg-violet-100 text-violet-700 rounded-lg text-sm font-medium transition-colors"}>
        {buttonLabel ?? "Importuoti diskografiją"}
      </button>

      {open && (
        <div className={`fixed inset-0 z-50 flex items-start justify-center p-4 pt-[5vh] ${minimized ? 'pointer-events-none' : ''}`} style={minimized ? {display: 'none'} : {}}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100">
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-gray-900 truncate">{artistName} — diskografija</h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">

                <label className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-500">
                  <input type="checkbox" checked={enrichLyrics} onChange={e => setEnrichLyrics(e.target.checked)} className="accent-violet-600 w-3.5 h-3.5" />
                  Žodžiai
                </label>
                {importing ? (
                  <button onClick={() => setMinimized(true)} title="Minimizuoti — importas tęsis fone"
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                    Minimizuoti
                  </button>
                ) : (
                  <button onClick={closeModal} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors text-lg leading-none">×</button>
                )}
              </div>
            </div>

            {/* Search bar */}
            <div className="px-5 py-2.5 border-b border-gray-100 flex gap-2">
              <input value={wikiUrl} onChange={e => setWikiUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !loading && search()}
                placeholder="Wikipedia URL arba automatinis pagal vardą"
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-violet-400 placeholder:text-gray-300 text-gray-900 bg-white" />
              <button onClick={() => { setSearched(false); search() }} disabled={loading}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium disabled:opacity-40 transition-colors shrink-0">
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

            {/* Tabs */}
            {(hasContent || loading) && (
              <div className="flex items-center border-b border-gray-100 px-5 gap-0.5">
                {tabDef.map(tab => {
                  if (!tab.showAlways && tab.count === 0) return null
                  const isActive = activeTab === tab.id
                  return (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                      className={`relative flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors -mb-px ${
                        isActive ? 'border-violet-600 text-violet-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}>
                      {tab.label}
                      {tab.count > 0 && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
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
              <div className="flex items-center justify-between px-5 py-2 border-b border-gray-100 bg-white/95 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">
                  {activeTab === 'studio' && `${studioItems.filter(({it})=>!it.duplicate&&!it.imported).length} naujų`}
                  {activeTab === 'other' && `${otherItems.filter(({it})=>!it.duplicate&&!it.imported).length} naujų`}
                  {activeTab === 'singles' && `${songNewCount} naujų`}
                  </span>
                  {(activeTab === 'studio' || activeTab === 'other' || activeTab === 'singles') && (
                    <button onClick={() => setSortDesc(p => !p)}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                      title={sortDesc ? "Nuo seniausio" : "Nuo naujausio"}>
                      {sortDesc ? '↓ Nauji' : '↑ Seni'}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs">
                  {(activeTab === 'studio' || activeTab === 'other') && (<>
                    <button onClick={() => {
                      if (activeTab === 'studio') setSelected(new Set(studioItems.filter(({it})=>!it.duplicate&&!it.imported).map(({i})=>i)))
                      else setSelected(p => { const s = new Set(p); otherItems.filter(({it})=>!it.duplicate&&!it.imported).forEach(({i})=>s.add(i)); return s })
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
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2 min-h-0">

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
                            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 mt-2">{typeLabels[type]}</div>
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
                      <p className="text-xs text-gray-400">Bandyk „Papildyti iš MusicBrainz" — ten pilnas sąrašas</p>
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
                            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 mt-2.5">{yr}</div>
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
                                      {song.source === 'musicbrainz' && <span className="text-[10px] text-blue-400 shrink-0">MB</span>}
                                      {song.duplicate && <span className="text-[10px] text-amber-500 shrink-0">jau yra</span>}
                                      {song.imported && <span className="text-[10px] text-emerald-500 shrink-0">importuota</span>}
                                      {song.importing && <span className="text-[10px] text-violet-400 animate-pulse shrink-0">importuojama</span>}
                                      {song.error && <span className="text-[10px] text-red-400 shrink-0" title={song.error}>✗ klaida</span>}
                                    </div>
                                    {song.error && <div className="text-[10px] text-red-400 truncate mt-0.5">{song.error}</div>}
                                    {song.albumTitle && !song.error && <div className="text-[11px] text-gray-400 truncate">{song.albumTitle}</div>}
                                    {song.duplicate && song.duplicateId && (
                                      <a href={`/admin/tracks/${song.duplicateId}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-[10px] text-blue-500 hover:underline">atidaryti →</a>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      })()}
                    </>
                  )}
                </>
              )}

              {/* Log */}
              {log.length > 0 && (
                <div ref={logRef} className="bg-gray-950 rounded-xl p-3 font-mono text-[11px] text-emerald-400 max-h-24 overflow-y-auto leading-relaxed">
                  {log.map((l, i) => <div key={i}>{l}</div>)}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-2">
              {activeTab === 'singles' ? (
                <button onClick={importSongs} disabled={importing || songSelectedCount === 0}
                  className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl disabled:opacity-40 transition-colors text-sm">
                  {importing ? 'Importuojama...' : `Importuoti ${songSelectedCount} singlų`}
                </button>
              ) : (
                <>
                  <button onClick={importAlbums} disabled={importing || selected.size === 0}
                    className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl disabled:opacity-40 transition-colors text-sm">
                    {importing ? 'Importuojama...' : `Importuoti ${selected.size} albumų`}
                  </button>
                  <button onClick={fetchAllDetails} disabled={importing || selected.size === 0}
                    title="Parsisiųsti info apie visus pažymėtus albumus (dainos + viršeliai)"
                    className="px-3 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl disabled:opacity-40 transition-colors text-xs font-medium whitespace-nowrap">
                    ↓ Visi info
                  </button>
                </>
              )}
              {hasContent && (
                <button onClick={enrichFromMB} disabled={importing || mbLoading}
                  title={activeTab === 'singles' ? 'Papildyti singlus iš MusicBrainz' : 'Papildyti albumus iš MusicBrainz'}
                  className="px-3 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl disabled:opacity-40 transition-colors text-xs font-medium whitespace-nowrap">
                  {mbLoading ? '⏳' : 'Papildyti iš MusicBrainz'}
                </button>
              )}
              <button onClick={closeModal} className="w-10 h-10 flex items-center justify-center border border-gray-200 text-gray-500 rounded-xl hover:bg-gray-50 transition-colors text-sm">
                ✕
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  )
}
