'use client'

import { useState } from 'react'

// ─── Tipai ───────────────────────────────────────────────────────────────────

type AlbumType = 'studio' | 'ep' | 'single' | 'compilation' | 'live' | 'other'

type DiscographyItem = {
  title: string
  year: number | null
  month: number | null
  day: number | null
  type: AlbumType
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
  // Singlams
  isSingleItem?: boolean  // true = importuoti kaip atskiras dainas, ne albumą
}

type TrackEntry = {
  title: string
  duration?: string
  sort_order: number
  is_single?: boolean
  featuring?: string[]
  disc_number?: number
  // Po dublikatų tikrinimo
  existingTrackId?: number  // jau yra DB — tik update is_single
  willCreate?: boolean      // nauja daina
}

// ─── Konstantos ──────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<AlbumType, string> = {
  studio: '🎵 Studijinis', ep: '🎼 EP', single: '🎤 Singlas',
  compilation: '📀 Kompiliacija', live: '🎸 Gyvas', other: '📦 Kitas',
}

// Automatiškai pasirinkti šiuos tipus
const AUTO_SELECT_TYPES: AlbumType[] = ['studio', 'ep']

// ─── Wikipedia utils ──────────────────────────────────────────────────────────

function extractWikiTitle(input: string): string {
  const urlMatch = input.match(/wikipedia\.org\/wiki\/([^#?]+)/)
  if (urlMatch) return decodeURIComponent(urlMatch[1])
  return input.trim().replace(/ /g, '_')
}

async function fetchWikitext(title: string): Promise<string> {
  const res = await fetch(
    `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=revisions&rvprop=content&rvslots=main&format=json&origin=*`
  )
  const json = await res.json()
  const pages = json.query?.pages || {}
  const page = Object.values(pages)[0] as any
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
    }
  } catch {}
  return url
}

async function fetchCoverImage(wikiTitle: string): Promise<string> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(wikiTitle)}&prop=pageimages&pithumbsize=500&piprop=thumbnail&format=json&origin=*`
    )
    const json = await res.json()
    const page = Object.values((json.query?.pages || {}))[0] as any
    if (page?.thumbnail?.source) return uploadToStorage(page.thumbnail.source)
    const res2 = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(wikiTitle)}&prop=pageimages&piprop=original&format=json&origin=*`
    )
    const json2 = await res2.json()
    const page2 = Object.values((json2.query?.pages || {}))[0] as any
    if (page2?.original?.source) return uploadToStorage(page2.original.source)
  } catch {}
  return ''
}

// ─── Text parsing ─────────────────────────────────────────────────────────────

function cleanWikiText(raw: string): string {
  let s = raw
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (_: string, _l: string, d: string) =>
    d.replace(/^[\u201c\u2018\u2019\u201d"']+|[\u201c\u2018\u2019\u201d"']+$/g, '').trim()
  )
  s = s.replace(/\[\[([^\]]+)\]\]/g, (_: string, l: string) =>
    l.replace(/_/g, ' ').replace(/^[\u201c\u2018\u2019\u201d"']+|[\u201c\u2018\u2019\u201d"']+$/g, '').trim()
  )
  s = s.replace(/\[\[|\]\]/g, '').replace(/\{\{[^}]*\}\}/g, '').replace(/''+/g, '')
  s = s.replace(/\[\w*\s*\d*\]/g, '')
  s = s.replace(/\s*\([^)]*\bsong\b[^)]*\)/gi, '').replace(/\s*\([^)]*\balbum\b[^)]*\)/gi, '')
  s = s.replace(/^[\u201c\u2018\u2019\u201d"']+|[\u201c\u2018\u2019\u201d"']+$/g, '')
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

// ─── Wikipedia parsers ────────────────────────────────────────────────────────

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
    const headerM = line.match(/^(==+)\s*(.+?)\s*\1/)
    if (headerM) {
      const depth = headerM[1].length, h = headerM[2].toLowerCase(), hRaw = headerM[2]
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
          else if (typeH.includes('single')) currentType = 'single'
          else if (typeH.includes('compilation') || typeH.includes('greatest')) currentType = 'compilation'
          else if (typeH.includes('live') || typeH.includes('concert')) currentType = 'live'
          else currentType = 'other'
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
  let inTable = false, skipSection = false

  for (const line of lines) {
    const hm = line.match(/==+\s*(.+?)\s*==+/)
    if (hm) {
      const h = hm[1].toLowerCase()
      skipSection = /video|dvd|film|promo|tour|guest|appear|certif/.test(h)
      if (h.includes('studio') || h.includes('album')) currentType = 'studio'
      else if (h.includes(' ep') || h === 'eps') currentType = 'ep'
      else if (h.includes('single')) currentType = 'single'
      else if (h.includes('compilation') || h.includes('greatest')) currentType = 'compilation'
      else if (h.includes('live') || h.includes('concert')) currentType = 'live'
      else currentType = 'other'
      continue
    }
    if (skipSection) continue
    if (line.startsWith('{|')) { inTable = true; continue }
    if (line.startsWith('|}')) { inTable = false; continue }
    if (!inTable || !line.match(/!\s*scope=['"]row['"]/)) continue
    const wm = line.match(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/)
    if (!wm) continue
    const wikiTitle = wm[1].trim(), title = cleanWikiText(wm[2] || wm[1])
    if (!title || title.length < 2 || wikiTitle.includes(':')) continue
    const yr = line.match(/\b(19|20)\d{2}\b/)
    albums.push({ title, year: yr ? parseInt(yr[0]) : null, month: null, day: null, type: currentType, wikiTitle, source: 'wikipedia' })
  }
  return albums
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

function getBlockHeadline(tl: string): string {
  const m = tl.match(/\|\s*(?:headline|caption)\s*=\s*([^\n|]+)/)
  return m ? m[1].replace(/[''+\[\]]/g, '').trim() : ''
}

function isBonusBlock(h: string): boolean {
  const hl = h.toLowerCase()
  return hl.includes('bonus') || hl.includes('deluxe') || hl.includes('japan') ||
    hl.includes('special') || hl.includes('itunes') || hl.includes('exclusive') || hl.includes('limited')
}

function isDiscBlock(tl: string): boolean {
  return /\|\s*headline\s*=.*[Dd]isc\s*[12]/i.test(tl) || /\|\s*disc\s*=\s*[12]/i.test(tl)
}

function parseSinglesFromInfobox(wikitext: string): Set<string> {
  const singles = new Set<string>()
  const m = wikitext.match(/\|\s*singles?\s*=([\s\S]*?)(?=\n\s*\||\n\}\})/)
  if (m) {
    const re = /\[\[.*?\|([^\]]+)\]\]|\[\[([^\]|]+)\]\]/g
    let lm: RegExpExecArray | null
    while ((lm = re.exec(m[1])) !== null) {
      const name = (lm[1] || lm[2] || '').replace(/\s*\([^)]+\)$/g, '').replace(/''+/g, '').trim()
      if (name.length > 1) singles.add(name.toLowerCase())
    }
  }
  return singles
}

function parseTracklist(wikitext: string): TrackEntry[] {
  const singles = parseSinglesFromInfobox(wikitext)
  const tlBlocks = extractTrackListings(wikitext)

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
      const titleM = tl.match(new RegExp(`\\|\\s*title${num}\\s*=\\s*([^|\\n]+)`))
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
        const is_single = singles.size > 0 ? singles.has(finalTitle.toLowerCase()) : undefined
        tracks.push({ title: finalTitle, duration: lenM?.[1]?.trim(), sort_order: order++, is_single, featuring: featuring.length ? featuring : undefined })
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
    const standard = tlBlocks.filter(tl => !isBonusBlock(getBlockHeadline(tl)))
    const bonus = tlBlocks.filter(tl => isBonusBlock(getBlockHeadline(tl)))
    const toUse = standard.length ? standard : [tlBlocks[0]]
    let order = 1
    for (const tl of toUse) { const nt = parseBlock(tl, order); allTracks.push(...nt); order += nt.length }
    const existing = new Set(allTracks.map(t => t.title.toLowerCase()))
    for (const tl of bonus) for (const bt of parseBlock(tl, order)) {
      if (!existing.has(bt.title.toLowerCase())) { allTracks.push({ ...bt, sort_order: order++ }); existing.add(bt.title.toLowerCase()) }
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
  if (sec.includes('remix') || sec.includes('mixtape/street')) return 'other'
  if (sec.includes('demo') || sec.includes('bootleg')) return 'other'
  const p = (primary || '').toLowerCase()
  if (p === 'single') return 'single'
  if (p === 'ep') return 'ep'
  if (p === 'album') return 'studio'
  return 'other'
}

async function mbFindArtist(name: string): Promise<{ id: string; name: string } | null> {
  try {
    const res = await fetch(
      `/api/mb-proxy?path=${encodeURIComponent(`artist/?query=${encodeURIComponent('"' + name + '"')}&limit=5&fmt=json`)}`
    )
    if (!res.ok) return null
    const data = await res.json()
    const best = (data.artists || []).find((a: any) => a.score >= 85) || data.artists?.[0]
    return best ? { id: best.id, name: best.name } : null
  } catch { return null }
}

async function mbFetchDiscography(artistId: string): Promise<DiscographyItem[]> {
  const items: DiscographyItem[] = []
  let offset = 0
  const limit = 100

  while (true) {
    const res = await fetch(
      `/api/mb-proxy?path=${encodeURIComponent(`release-group?artist=${artistId}&limit=${limit}&offset=${offset}&fmt=json`)}`
    )
    if (!res.ok) break
    const data = await res.json()
    const rgs = data['release-groups'] || []
    if (!rgs.length) break

    for (const rg of rgs) {
      const type = mbTypeToLocal(rg['primary-type'], rg['secondary-types'])
      const dateStr: string = rg['first-release-date'] || ''
      const parts = dateStr.split('-')
      items.push({
        title: rg.title,
        year: parts[0] ? parseInt(parts[0]) : null,
        month: parts[1] ? parseInt(parts[1]) : null,
        day: parts[2] ? parseInt(parts[2]) : null,
        type,
        mbId: rg.id,
        source: 'musicbrainz',
        isSingleItem: type === 'single',
      })
    }

    if (offset + limit >= (data['release-group-count'] || 0)) break
    offset += limit
    await new Promise(r => setTimeout(r, 300))
  }

  return items.sort((a, b) => (a.year || 9999) - (b.year || 9999))
}

async function mbFetchTracks(releaseGroupId: string): Promise<{ tracks: TrackEntry[]; cover: string }> {
  try {
    const res = await fetch(
      `/api/mb-proxy?path=${encodeURIComponent(`release?release-group=${releaseGroupId}&inc=recordings&limit=1&fmt=json`)}`
    )
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

    // Viršelis iš Cover Art Archive
    let cover = ''
    try {
      const cr = await fetch(`https://coverartarchive.org/release-group/${releaseGroupId}/front-500`, { redirect: 'follow' })
      if (cr.ok) cover = cr.url
    } catch {}

    return { tracks, cover }
  } catch { return { tracks: [], cover: '' } }
}

// ─── DB dublikatų tikrinimas ──────────────────────────────────────────────────

async function checkAlbumDuplicates(titles: string[], artistId: number): Promise<Record<string, number>> {
  try {
    const res = await fetch(`/api/albums?artist_id=${artistId}&check_titles=${encodeURIComponent(JSON.stringify(titles))}`)
    if (!res.ok) return {}
    return (await res.json()).found || {}
  } catch { return {} }
}

async function checkTrackDuplicates(titles: string[], artistId: number): Promise<Record<string, number>> {
  // Grąžina { 'daina lowercase': trackId }
  try {
    const res = await fetch(`/api/tracks?artist_id=${artistId}&check_titles=${encodeURIComponent(JSON.stringify(titles))}`)
    if (!res.ok) return {}
    return (await res.json()).found || {}
  } catch { return {} }
}

// ─── YouTube enrichment ───────────────────────────────────────────────────────

function titleMatches(result: string, query: string): boolean {
  const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
  const words = n(query).split(' ').filter(w => w.length > 2)
  return words.filter(w => n(result).includes(w)).length >= Math.ceil(words.length * 0.7)
}

async function enrichTracks(albumId: number | null, tracks: TrackEntry[], artistName: string, addLog: (s: string) => void) {
  const endpoint = albumId ? `/api/tracks?album_id=${albumId}&limit=200` : null
  if (!endpoint) return

  let dbTracks: any[] = []
  try {
    dbTracks = (await (await fetch(endpoint)).json()).tracks || []
  } catch { return }
  if (!dbTracks.length) return

  addLog(`  🎬 ${dbTracks.length} dainų...`)
  let ytCount = 0, lyricsCount = 0, done = 0

  for (let i = 0; i < dbTracks.length; i += 4) {
    await Promise.all(dbTracks.slice(i, i+4).map(async (t: any) => {
      const updates: Record<string,any> = {}
      try {
        const q = `${artistName} ${t.title}`
        const r = await fetch(`/api/search/youtube?q=${encodeURIComponent(q)}`)
        if (r.ok) {
          const d = await r.json()
          const first = d.results?.[0]
          if (first && titleMatches(first.title, q)) { updates.youtube_url = `https://www.youtube.com/watch?v=${first.videoId}`; ytCount++ }
        }
      } catch {}
      try {
        const r = await fetch(`/api/search/lyrics?artist=${encodeURIComponent(artistName)}&title=${encodeURIComponent(t.title)}`)
        if (r.ok) { const d = await r.json(); if (d.lyrics) { updates.lyrics = d.lyrics; lyricsCount++ } }
      } catch {}
      if (Object.keys(updates).length) {
        try { await fetch(`/api/tracks/${t.id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(updates) }) } catch {}
      }
      done++
    }))
    if (done % 8 === 0 || done === dbTracks.length) addLog(`  ⏳ ${done}/${dbTracks.length}...`)
    await new Promise(r => setTimeout(r, 200))
  }
  addLog(`  ✅ ${ytCount} YouTube${lyricsCount ? `, ${lyricsCount} žodžių` : ''}`)
}

// ─── Pagrindinis komponentas ──────────────────────────────────────────────────

type Props = {
  artistId: number
  artistName: string
  artistWikiTitle?: string
  isSolo?: boolean
  onClose?: () => void
  buttonClassName?: string
  buttonLabel?: string
}

// Tipų grupavimas UI
const TYPE_GROUPS = [
  { label: '🎵 Studijiniai albumai ir EP', types: ['studio', 'ep'] as AlbumType[], autoSelect: true },
  { label: '🎤 Singlai (atskiros dainos)', types: ['single'] as AlbumType[], autoSelect: false, collapsible: true },
  { label: '📦 Kompiliacijos / Live / Kiti', types: ['compilation', 'live', 'other'] as AlbumType[], autoSelect: false, collapsible: true },
]

export default function WikipediaImportDiscography({ artistId, artistName, artistWikiTitle, isSolo, onClose, buttonClassName, buttonLabel }: Props) {
  const [open, setOpen] = useState(false)
  const [wikiUrl, setWikiUrl] = useState(artistWikiTitle ? `https://en.wikipedia.org/wiki/${artistWikiTitle}` : '')
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<DiscographyItem[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [log, setLog] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [artistGroups, setArtistGroups] = useState<string[]>([])
  const [enrichYoutube, setEnrichYoutube] = useState(true)
  const [enrichLyrics, setEnrichLyrics] = useState(true)
  const [typeFilter, setTypeFilter] = useState<AlbumType | 'all'>('all')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(['🎤 Singlai (atskiros dainos)', '📦 Kompiliacijos / Live / Kiti'])
  )
  const toggleGroup = (label: string) => setCollapsedGroups(p => {
    const s = new Set(p); s.has(label) ? s.delete(label) : s.add(label); return s
  })

  const addLog = (msg: string) => setLog(p => [...p, msg])

  // ── Paieška ────────────────────────────────────────────────────────────────

  const search = async (groupFilter?: string) => {
    setLoading(true); setItems([]); setLog([]); setSelected(new Set())
    addLog(`🔍 Ieškoma: ${artistName}...`)
    let found: DiscographyItem[] = []

    // 1. Wikipedia pirma — greita, patikima, veikia kaip anksčiau
    const wikiBase = wikiUrl.trim()
      ? extractWikiTitle(wikiUrl)
      : artistName.replace(/ /g, '_')

    addLog(`📖 Wikipedia: ${wikiBase}...`)
    const mainWikitext = await fetchWikitext(wikiBase)
    if (mainWikitext) {
      const groups = hasMultipleArtistSections(mainWikitext)
      if (groups.length > 1 && !groupFilter && !isSolo) {
        setArtistGroups(groups); setLoading(false); return
      }
      let wikiFound = parseMainPageDiscography(mainWikitext, isSolo || groupFilter === '__solo__', groupFilter)
      if (!wikiFound.length) {
        // Bandome _discography puslapį
        const discTitle = wikiBase.replace(/_discography$/i, '') + '_discography'
        if (discTitle !== wikiBase) {
          addLog(`  → bandoma ${discTitle}...`)
          const discWikitext = await fetchWikitext(discTitle)
          if (discWikitext) wikiFound = parseDiscographyPage(discWikitext)
        }
      }
      if (wikiFound.length) {
        found = wikiFound.map(a => ({ ...a, source: 'wikipedia' as const }))
        addLog(`✅ Wikipedia: ${found.length} albumų`)
      }
    }

    // 2. MusicBrainz — fallback jei Wikipedia nerado, arba papildymas
    addLog('🎵 MusicBrainz...')
    const mbArtist = await mbFindArtist(artistName)
    if (mbArtist) {
      addLog(`  → rastas "${mbArtist.name}"`)
      const mbItems = await mbFetchDiscography(mbArtist.id)
      if (mbItems.length) {
        if (!found.length) {
          // Wikipedia nerado — naudojame MB
          found = mbItems
          addLog(`✅ MB: ${mbItems.length} įrašų`)
        } else {
          // Wikipedia rado — MB papildo trūkstamus
          const wikiTitles = new Set(found.map(a => a.title.toLowerCase()))
          const mbOnly = mbItems.filter(a => !wikiTitles.has(a.title.toLowerCase()))
          if (mbOnly.length) {
            found = [...found, ...mbOnly]
            addLog(`  → ${mbOnly.length} papildomų iš MB`)
          } else {
            addLog(`  → nieko naujo (visi jau Wikipedia)`)
          }
        }
      }
    } else {
      addLog('  → MusicBrainz nerado atlikėjo')
    }

    if (!found.length) {
      addLog('❌ Nieko nerasta. Įvesk Wikipedia URL rankiniu.')
      setLoading(false); return
    }

    // Rūšiuoti: pirma pagal tipą, tada pagal metus
    found = found.sort((a, b) => {
      const typeOrder: Record<AlbumType, number> = { studio: 0, ep: 1, single: 2, compilation: 3, live: 4, other: 5 }
      if (typeOrder[a.type] !== typeOrder[b.type]) return typeOrder[a.type] - typeOrder[b.type]
      return (a.year || 9999) - (b.year || 9999)
    })

    // Dublikatų tikrinimas — albumai ir singlai atskirai
    addLog('🔎 Tikrinami dublikatai...')
    const albumItems = found.filter(i => !i.isSingleItem)
    const singleItems = found.filter(i => i.isSingleItem)

    const [albumDups, trackDups] = await Promise.all([
      checkAlbumDuplicates(albumItems.map(i => i.title), artistId),
      checkTrackDuplicates(singleItems.map(i => i.title), artistId),
    ])

    const dupAlbumCount = Object.keys(albumDups).length
    const dupTrackCount = Object.keys(trackDups).length
    if (dupAlbumCount + dupTrackCount > 0)
      addLog(`⚠️ ${dupAlbumCount} albumų + ${dupTrackCount} dainų jau DB`)
    else
      addLog('✅ Dublikatų nerasta')

    const foundWithDups = found.map(item => {
      const key = item.title.toLowerCase()
      if (item.isSingleItem && trackDups[key])
        return { ...item, duplicate: true, duplicateId: trackDups[key] }
      if (!item.isSingleItem && albumDups[key])
        return { ...item, duplicate: true, duplicateId: albumDups[key] }
      return item
    })

    setArtistGroups([])
    setItems(foundWithDups)
    // Auto-pasirinkti: rekomenduojami tipai, be dublikatų
    setSelected(new Set(
      foundWithDups
        .map((item, i) => (!item.duplicate && AUTO_SELECT_TYPES.includes(item.type)) ? i : -1)
        .filter(i => i !== -1)
    ))
    setLoading(false)
  }

  // ── Detalių krovimas ──────────────────────────────────────────────────────

  const fetchDetails = async (idx: number) => {
    const item = items[idx]
    if (item.fetched) return
    addLog(`📋 ${item.title}...`)
    try {
      if (item.source === 'musicbrainz' && item.mbId) {
        const { tracks, cover } = await mbFetchTracks(item.mbId)
        // Singlams — tikrinti ar dainos jau yra DB
        let tracksChecked = tracks
        if (item.isSingleItem && tracks.length) {
          const trackDups = await checkTrackDuplicates(tracks.map(t => t.title), artistId)
          tracksChecked = tracks.map(t => ({
            ...t,
            existingTrackId: trackDups[t.title.toLowerCase()],
            willCreate: !trackDups[t.title.toLowerCase()],
          }))
          const existing = tracks.filter(t => trackDups[t.title.toLowerCase()]).length
          const newCount = tracks.length - existing
          addLog(`  → ${tracks.length} dainų (${newCount} naujų, ${existing} jau yra — pažymės singlu)`)
        } else {
          addLog(`  → ${tracks.length} dainų${cover ? ', viršelis ✓' : ''}`)
        }
        setItems(p => p.map((it, i) => i === idx ? { ...it, tracks: tracksChecked, fetched: true, cover_image_url: cover || it.cover_image_url } : it))
        return
      }
      // Wikipedia kelias
      if (!item.wikiTitle) { setItems(p => p.map((it, i) => i === idx ? { ...it, fetched: true, tracks: [] } : it)); return }
      const [wikitext, cover] = await Promise.all([fetchWikitext(item.wikiTitle), fetchCoverImage(item.wikiTitle)])
      const dateInfo = parseReleaseDate(wikitext)
      const tracks = parseTracklist(wikitext)
      setItems(p => p.map((it, i) => i === idx
        ? { ...it, tracks, fetched: true, cover_image_url: cover || it.cover_image_url,
            year: dateInfo.year ?? it.year, month: dateInfo.month, day: dateInfo.day }
        : it))
      addLog(`  → ${tracks.length} dainų${cover ? ', viršelis ✓' : ''}`)
    } catch {
      setItems(p => p.map((it, i) => i === idx ? { ...it, fetched: true, tracks: [] } : it))
      addLog(`  ❌ Klaida: ${item.title}`)
    }
  }

  const fetchAllDetails = async () => {
    for (let i = 0; i < items.length; i++) {
      if (selected.has(i) && !items[i].fetched) {
        await fetchDetails(i); await new Promise(r => setTimeout(r, 400))
      }
    }
  }

  // ── Importas ──────────────────────────────────────────────────────────────

  const importSelected = async () => {
    const indices = Array.from(selected).sort((a,b) => a-b)
    // Krauti detales jei reikia
    const unfetched = indices.filter(i => !items[i].fetched)
    if (unfetched.length) {
      addLog(`📋 Kraunamos detalės (${unfetched.length})...`)
      for (const i of unfetched) { await fetchDetails(i); await new Promise(r => setTimeout(r, 400)) }
    }

    let snapshot: DiscographyItem[] = []
    setItems(p => { snapshot = [...p]; return p })
    await new Promise(r => setTimeout(r, 50))

    setImporting(true)
    let okAlbums = 0, okTracks = 0, updatedTracks = 0, fail = 0

    for (const idx of indices) {
      const item = snapshot[idx]
      if (!item || item.duplicate) continue
      setItems(p => p.map((it, i) => i === idx ? { ...it, importing: true } : it))

      try {
        // ── SINGLAS → atskiros dainos ────────────────────────────────────────
        if (item.isSingleItem) {
          const tracks = item.tracks || [{ title: item.title, sort_order: 1 }]
          for (const track of tracks) {
            if (track.existingTrackId) {
              // Jau yra — tik pažymėti singlu
              await fetch(`/api/tracks/${track.existingTrackId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_single: true }),
              })
              updatedTracks++
            } else {
              // Kurti naują dainą
              await fetch('/api/tracks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  title: track.title,
                  artist_id: artistId,
                  type: 'single',
                  is_single: true,
                  release_year: item.year,
                  release_month: item.month,
                  release_day: item.day,
                  featuring: track.featuring || [],
                }),
              })
              okTracks++
            }
          }
          addLog(`🎤 ${item.title}: ${okTracks} naujų, ${updatedTracks} pažymėta singlu`)
        } else {
          // ── ALBUMAS ────────────────────────────────────────────────────────
          const payload = {
            title: item.title,
            artist_id: artistId,
            year: item.year || null,
            month: item.month || null,
            day: item.day || null,
            cover_image_url: item.cover_image_url || '',
            type_studio:      item.type === 'studio',
            type_ep:          item.type === 'ep',
            type_single:      item.type === 'single',
            type_compilation: item.type === 'compilation',
            type_live:        item.type === 'live',
            type_remix: false, type_covers: false, type_holiday: false,
            type_soundtrack: false, type_demo: false,
            tracks: (item.tracks || []).map((t, i) => ({
              title: t.title, sort_order: i+1,
              duration: t.duration || null,
              type: 'normal' as const,
              disc_number: t.disc_number || 1,
              is_single: t.is_single || false,
              featuring: t.featuring || [],
            })),
          }
          const res = await fetch('/api/albums', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) })
          if (!res.ok) throw new Error((await res.json()).error)
          const newAlbum = await res.json()
          const albumId = newAlbum.id || newAlbum.album?.id
          addLog(`✅ ${item.title} (${item.tracks?.length || 0} dainų)`)
          okAlbums++
          if (albumId && (enrichYoutube || enrichLyrics) && item.tracks?.length) {
            await enrichTracks(albumId, item.tracks, artistName, addLog)
          }
        }
        setItems(p => p.map((it, i) => i === idx ? { ...it, importing: false, imported: true } : it))
      } catch (e: any) {
        setItems(p => p.map((it, i) => i === idx ? { ...it, importing: false, error: e.message } : it))
        addLog(`❌ ${item.title}: ${e.message}`); fail++
      }
      await new Promise(r => setTimeout(r, 200))
    }
    setImporting(false)
    addLog(`🏁 ${okAlbums} albumų, ${okTracks} naujų dainų, ${updatedTracks} pažymėta singlu${fail ? `, ${fail} klaida` : ''}`)
  }

  // ── UI helpers ────────────────────────────────────────────────────────────

  const toggleSelect = (i: number) => {
    if (items[i]?.duplicate) return
    setSelected(p => { const s = new Set(p); s.has(i) ? s.delete(i) : s.add(i); return s })
  }

  const filteredIndices = items
    .map((item, i) => i)
    .filter(i => typeFilter === 'all' || items[i].type === typeFilter)

  const newCount = items.filter(i => !i.duplicate).length
  const dupCount = items.filter(i => i.duplicate).length
  const closeModal = () => { if (!importing) { setOpen(false); onClose?.() } }

  // ── Render ────────────────────────────────────────────────────────────────

  // Auto-search atidarius modalą
  const handleOpen = () => {
    setOpen(true)
    if (!searched) {
      setSearched(true)
      setTimeout(() => search(), 100)
    }
  }

  return (
    <>
      <button type="button" onClick={handleOpen}
        className={buttonClassName ?? "flex items-center gap-2 px-4 py-2 bg-purple-100 hover:bg-purple-200 text-purple-800 rounded-lg text-sm font-medium transition-colors"}>
        {buttonLabel ?? "📀 Importuoti diskografiją"}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={closeModal} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">📀 Diskografija — {artistName}</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
            </div>

            {/* Nustatymai */}
            <div className="px-6 py-3 border-b border-gray-100 space-y-2.5">
              <div className="flex gap-2">
                <input value={wikiUrl} onChange={e => setWikiUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !loading && search()}
                  placeholder="Wikipedia URL (nebūtina — ieško automatiškai)"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-purple-400 placeholder:text-gray-400" />
                <button onClick={() => search()} disabled={loading}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-medium disabled:opacity-50 transition-colors whitespace-nowrap">
                  {loading ? '⏳' : '🔍 Ieškoti'}
                </button>
              </div>
              <div className="flex gap-4 text-xs flex-wrap">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={enrichYoutube} onChange={e => setEnrichYoutube(e.target.checked)} className="accent-purple-600" />
                  <span className="text-gray-600">🎬 YouTube nuorodos</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={enrichLyrics} onChange={e => setEnrichLyrics(e.target.checked)} className="accent-purple-600" />
                  <span className="text-gray-600">📝 Žodžiai</span>
                </label>
              </div>
            </div>

            {/* Turinys */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">

              {/* Kelios wiki grupės */}
              {artistGroups.length > 1 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-sm font-medium text-amber-800 mb-2">⚠️ Wikipedia turi kelias diskografijos sekcijas:</p>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => search('__solo__')} className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium">🎤 Tik solo</button>
                    <button onClick={() => search('__all__')} className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-xs">📀 Visi</button>
                    {artistGroups.map(g => <button key={g} onClick={() => search(g)} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs">{g}</button>)}
                  </div>
                </div>
              )}

              {items.length > 0 && (
                <>
                  {/* Filtrai + statistika */}
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex gap-1 flex-wrap">
                      {(['all', 'studio', 'ep', 'single', 'compilation', 'live', 'other'] as const).map(t => {
                        const count = t === 'all' ? items.length : items.filter(i => i.type === t).length
                        if (count === 0 && t !== 'all') return null
                        return (
                          <button key={t} onClick={() => setTypeFilter(t)}
                            className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors ${typeFilter === t ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                            {t === 'all' ? 'Visi' : TYPE_LABELS[t]} {count > 0 && <span className="ml-0.5 opacity-70">{count}</span>}
                          </button>
                        )
                      })}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      {dupCount > 0 && <span className="text-amber-600">⚠️ {dupCount} jau yra</span>}
                      <button onClick={() => setSelected(new Set(items.map((it,i) => (!it.duplicate && AUTO_SELECT_TYPES.includes(it.type)) ? i : -1).filter(i=>i!==-1)))}
                        className="text-purple-600 hover:underline">Tik studijiniai+EP</button>
                      <button onClick={() => setSelected(new Set())} className="text-gray-400 hover:underline">Joks</button>
                      <span className="text-gray-400">{selected.size} pasirinkta</span>
                    </div>
                  </div>

                  {/* Sąrašas pagal tipus */}
                  {TYPE_GROUPS.map(group => {
                    const groupItems = filteredIndices.filter(i => group.types.includes(items[i].type))
                    if (!groupItems.length) return null
                    const isCollapsed = group.collapsible && collapsedGroups.has(group.label)
                    const selectedInGroup = groupItems.filter(i => selected.has(i)).length
                    return (
                      <div key={group.label}>
                        <button type="button"
                          onClick={() => group.collapsible && toggleGroup(group.label)}
                          className={`flex items-center gap-2 w-full text-left mb-1.5 mt-2 ${group.collapsible ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}>
                          <span className="text-xs font-semibold text-gray-500">{group.label}</span>
                          <span className="text-xs text-gray-400">({groupItems.length})</span>
                          {selectedInGroup > 0 && <span className="text-xs text-purple-600 font-medium">{selectedInGroup} pasirinkta</span>}
                          {group.collapsible && (
                            <span className="ml-auto text-gray-400 text-xs">{isCollapsed ? '▶ rodyti' : '▼ slėpti'}</span>
                          )}
                        </button>
                        {!isCollapsed && <div className="space-y-1.5">
                          {groupItems.map(i => {
                            const item = items[i]
                            return (
                              <div key={i} onClick={() => toggleSelect(i)}
                                className={`flex items-center gap-3 p-2.5 rounded-xl border transition-colors ${
                                  item.duplicate ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                                  : item.imported ? 'border-green-200 bg-green-50 cursor-default'
                                  : selected.has(i) ? 'border-purple-300 bg-purple-50 cursor-pointer'
                                  : 'border-gray-200 bg-white hover:bg-gray-50 cursor-pointer'
                                }`}>
                                <input type="checkbox" checked={selected.has(i)} onChange={() => {}}
                                  className="accent-purple-600 pointer-events-none shrink-0"
                                  disabled={item.duplicate || item.imported} />
                                {item.cover_image_url
                                  ? <img src={item.cover_image_url} alt="" referrerPolicy="no-referrer" className="w-9 h-9 rounded object-cover shrink-0" />
                                  : <div className="w-9 h-9 rounded bg-gray-100 flex items-center justify-center text-gray-300 shrink-0 text-sm">💿</div>
                                }
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-medium text-gray-900 text-sm">{item.title}</span>
                                    {item.year && <span className="text-xs text-gray-400">({item.year})</span>}
                                    {item.source === 'musicbrainz' && <span className="text-[10px] text-blue-400">MB</span>}
                                    {item.duplicate && <span className="text-xs text-amber-600">jau yra</span>}
                                    {item.imported && <span className="text-xs text-green-600">✅</span>}
                                    {item.importing && <span className="text-xs text-purple-500 animate-pulse">⏳</span>}
                                    {item.error && <span className="text-xs text-red-500" title={item.error}>❌</span>}
                                  </div>
                                  {item.tracks !== undefined && (
                                    <div className="text-xs text-gray-400 mt-0.5">
                                      {item.isSingleItem
                                        ? `${item.tracks.filter(t => t.willCreate).length} naujų dainų · ${item.tracks.filter(t => t.existingTrackId).length} pažymės singlu`
                                        : `${item.tracks.length} dainų${item.tracks.filter(t=>t.is_single).length ? ` · ${item.tracks.filter(t=>t.is_single).length} singlai` : ''}`
                                      }
                                    </div>
                                  )}
                                  {item.duplicate && item.duplicateId && (
                                    <a href={item.isSingleItem ? `/admin/tracks/${item.duplicateId}` : `/admin/albums/${item.duplicateId}`}
                                      target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                                      className="text-xs text-blue-500 hover:underline">→ atidaryti</a>
                                  )}
                                </div>
                                <button type="button" onClick={e => { e.stopPropagation(); fetchDetails(i) }}
                                  disabled={item.fetched || item.duplicate || importing}
                                  className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded text-xs disabled:opacity-40 shrink-0">
                                  {item.fetched ? '✓' : '📋'}
                                </button>
                              </div>
                            )
                          })}
                        </div>}
                      </div>
                    )
                  })}
                </>
              )}

              {/* Log */}
              {log.length > 0 && (
                <div className="bg-gray-900 rounded-xl p-3 font-mono text-xs text-green-400 max-h-28 overflow-y-auto">
                  {log.map((l, i) => <div key={i}>{l}</div>)}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={importSelected} disabled={importing || selected.size === 0}
                className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl disabled:opacity-40 transition-colors text-sm">
                {importing ? '⏳ Importuojama...' : (() => {
                const studios = Array.from(selected).filter(i => items[i] && ['studio','ep'].includes(items[i].type)).length
                const singles = Array.from(selected).filter(i => items[i]?.type === 'single').length
                const others = selected.size - studios - singles
                const parts = []
                if (studios) parts.push(`${studios} albumų`)
                if (singles) parts.push(`${singles} singlų`)
                if (others) parts.push(`${others} kitų`)
                return `⬆️ Importuoti: ${parts.join(', ') || '0'}`
              })()}
              </button>
              <button onClick={() => { if (!importing) { fetchAllDetails() } }}
                disabled={importing || selected.size === 0}
                className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm disabled:opacity-40">
                📋 Krauti detales
              </button>
              <button onClick={closeModal} className="px-4 py-3 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 text-sm">
                Uždaryti
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  )
}
