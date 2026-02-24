'use client'

import { useState } from 'react'

type DiscographyAlbum = {
  title: string
  year: number | null
  month: number | null
  day: number | null
  type: 'studio' | 'ep' | 'single' | 'compilation' | 'live'
  wikiTitle?: string
  cover_image_url?: string
  tracks?: TrackEntry[]
  fetched?: boolean
  importing?: boolean
  imported?: boolean
  error?: string
}

type TrackEntry = {
  title: string
  duration?: string
  sort_order: number
  is_single?: boolean
  featuring?: string[]
  disc_number?: number
}

const TYPE_LABELS: Record<string, string> = {
  studio: '🎵 Studijinis', ep: '🎼 EP', single: '🎤 Singlas',
  compilation: '📀 Kompiliacija', live: '🎸 Gyvas',
}

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

async function fetchCoverImage(wikiTitle: string): Promise<string> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(wikiTitle)}&prop=pageimages&pithumbsize=500&piprop=thumbnail&format=json&origin=*`
    )
    const json = await res.json()
    const pages = json.query?.pages || {}
    const page = Object.values(pages)[0] as any
    if (page?.thumbnail?.source) return page.thumbnail.source

    const res2 = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(wikiTitle)}&prop=pageimages&piprop=original&format=json&origin=*`
    )
    const json2 = await res2.json()
    const pages2 = json2.query?.pages || {}
    const page2 = Object.values(pages2)[0] as any
    if (page2?.original?.source) return page2.original.source

    const res3 = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(wikiTitle)}&prop=images&format=json&origin=*`
    )
    const json3 = await res3.json()
    const pages3 = json3.query?.pages || {}
    const page3 = Object.values(pages3)[0] as any
    const images: any[] = page3?.images || []
    const coverImg = images.find((img: any) => {
      const name = (img.title || '').toLowerCase()
      return (name.endsWith('.jpg') || name.endsWith('.png')) &&
        !name.includes('flag') && !name.includes('logo') && !name.includes('icon') &&
        !name.includes('signature') && !name.includes('map')
    })
    if (coverImg) {
      const res4 = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(coverImg.title)}&prop=imageinfo&iiprop=url&iiurlwidth=500&format=json&origin=*`
      )
      const json4 = await res4.json()
      const pages4 = json4.query?.pages || {}
      const page4 = Object.values(pages4)[0] as any
      return page4?.imageinfo?.[0]?.thumburl || page4?.imageinfo?.[0]?.url || ''
    }
    return ''
  } catch { return '' }
}

// FIX: Handle [[Link|"Display with quotes"]] and [[Link]] and plain text
function cleanWikiText(raw: string): string {
  let s = raw
  // [[Link|Display]] – take display part, strip surrounding quotes
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (_, _link, display) =>
    display.replace(/^["'"']+|["'"']+$/g, '').trim()
  )
  // [[Link]] – take link text, replace underscores
  s = s.replace(/\[\[([^\]]+)\]\]/g, (_, link) =>
    link.replace(/_/g, ' ').replace(/^["'"']+|["'"']+$/g, '').trim()
  )
  // Remove any remaining [[ or ]] fragments (unclosed links)
  s = s.replace(/\[\[|\]\]/g, '')
  // Remove {{templates}}
  s = s.replace(/\{\{[^}]*\}\}/g, '')
  // Remove ''italics'' markup
  s = s.replace(/''+/g, '')
  // Remove citation refs [1], [note 1]
  s = s.replace(/\[\w*\s*\d*\]/g, '')
  // Remove disambiguation suffixes like "(Brandon Flowers song)", "(album)"
  s = s.replace(/\s*\([^)]*\bsong\b[^)]*\)/gi, '')
  s = s.replace(/\s*\([^)]*\balbum\b[^)]*\)/gi, '')
  // Remove surrounding quotes
  s = s.replace(/^["'"']+|["'"']+$/g, '')
  return s.trim()
}

// Parse featuring artists from track title
function parseFeaturing(raw: string): { cleanTitle: string; featuring: string[] } {
  const featMatch = raw.match(/\((?:feat(?:uring)?\.?|ft\.?)\s+([^)]+)\)/i)
  if (!featMatch) return { cleanTitle: raw.trim(), featuring: [] }
  const cleanTitle = raw.replace(featMatch[0], '').trim()
  const featuring = featMatch[1]
    .split(/\s+and\s+|[,&]/i)
    .map(s => {
      // Clean wiki markup from featuring name too
      return s.replace(/\[\[([^\]|]+\|)?([^\]|]+)\]\]/g, '$2')
               .replace(/''/g, '').trim()
    })
    .filter(s => s.length > 0)
  return { cleanTitle, featuring }
}

function parseMainPageDiscography(wikitext: string, soloOnly = false): DiscographyAlbum[] {
  const albums: DiscographyAlbum[] = []
  const lines = wikitext.split('\n')
  let inDiscSection = false
  let currentType: DiscographyAlbum['type'] = 'studio'
  let skipGroup = false

  for (const line of lines) {
    const headerM = line.match(/^(==+)\s*(.+?)\s*\1/)
    if (headerM) {
      const depth = headerM[1].length
      const h = headerM[2].toLowerCase()
      const hRaw = headerM[2]

      if (depth === 2 && inDiscSection && !h.includes('discograph')) break
      if (h.includes('discograph')) { inDiscSection = true; skipGroup = false; continue }

      if (inDiscSection) {
        if (depth === 3) {
          const groupName = hRaw.trim()
          skipGroup = soloOnly && !/solo|as lead|as artist/i.test(groupName) && groupName.length > 0
        }
        if (depth === 3 || depth === 4) {
          const typeH = h.replace(/\[\[.*?\]\]/g, '')
          if (typeH.includes('studio') || typeH.includes('album')) currentType = 'studio'
          else if (typeH.includes(' ep') || typeH === 'eps') currentType = 'ep'
          else if (typeH.includes('single')) currentType = 'single'
          else if (typeH.includes('compilation') || typeH.includes('greatest')) currentType = 'compilation'
          else if (typeH.includes('live') || typeH.includes('concert')) currentType = 'live'
        }
      }
      continue
    }

    if (!inDiscSection || skipGroup) continue
    if (!line.startsWith('*')) continue
    if (line.toLowerCase().includes('main article') || line.toLowerCase().includes('see also')) continue

    let title = ''
    let wikiTitle = ''

    const wikiLinkM = line.match(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/)
    if (wikiLinkM) {
      wikiTitle = wikiLinkM[1].trim()
      const display = wikiLinkM[2] || wikiLinkM[1]
      title = cleanWikiText(display)
    } else {
      const italicM = line.match(/'{2,3}([^']+)'{2,3}/)
      if (italicM) { title = cleanWikiText(italicM[1]); wikiTitle = title.replace(/ /g, '_') }
    }

    if (!title || title.length < 2 || wikiTitle.includes(':') || /^[A-Z]{2,3}$/.test(title)) continue
    const bad = ['discography', 'songs', 'videography', 'filmography', 'certification', 'chart']
    if (bad.some(b => title.toLowerCase().includes(b) || wikiTitle.toLowerCase().includes(b))) continue

    const yearM = line.match(/\((\d{4})\)/)
    albums.push({ title, year: yearM ? parseInt(yearM[1]) : null, month: null, day: null, type: currentType, wikiTitle: wikiTitle || title })
  }
  return albums
}

function parseDiscographyPage(wikitext: string): DiscographyAlbum[] {
  const albums: DiscographyAlbum[] = []
  const lines = wikitext.split('\n')
  let currentType: DiscographyAlbum['type'] = 'studio'
  let inTable = false, skipSection = false

  for (const line of lines) {
    const headerM = line.match(/==+\s*(.+?)\s*==+/)
    if (headerM) {
      const h = headerM[1].toLowerCase()
      skipSection = /video|dvd|film|promo|tour|guest|appear|certif/.test(h)
      if (h.includes('studio') || h.includes('album')) currentType = 'studio'
      else if (h.includes(' ep') || h === 'eps') currentType = 'ep'
      else if (h.includes('single')) currentType = 'single'
      else if (h.includes('compilation') || h.includes('greatest')) currentType = 'compilation'
      else if (h.includes('live') || h.includes('concert')) currentType = 'live'
      continue
    }
    if (skipSection) continue
    if (line.startsWith('{|')) { inTable = true; continue }
    if (line.startsWith('|}')) { inTable = false; continue }
    if (!inTable || !line.match(/!\s*scope=['"]row['"]/)) continue

    const wm = line.match(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/)
    if (!wm) continue
    const wikiTitle = wm[1].trim()
    const title = cleanWikiText(wm[2] || wm[1])
    if (!title || title.length < 2 || wikiTitle.includes(':')) continue

    const yr = line.match(/\b(19|20)\d{2}\b/)
    albums.push({ title, year: yr ? parseInt(yr[0]) : null, month: null, day: null, type: currentType, wikiTitle })
  }
  return albums
}

function extractTrackListings(wikitext: string): string[] {
  const results: string[] = []
  const pattern = /\{\{[Tt]rack\s*[Ll]isting/g
  let m: RegExpExecArray | null
  while ((m = pattern.exec(wikitext)) !== null) {
    let depth = 0, i = m.index
    while (i < wikitext.length - 1) {
      if (wikitext[i] === '{' && wikitext[i+1] === '{') { depth++; i += 2 }
      else if (wikitext[i] === '}' && wikitext[i+1] === '}') {
        depth--; i += 2
        if (depth === 0) { results.push(wikitext.slice(m.index + 2, i - 2)); break }
      } else i++
    }
  }
  return results
}

function parseSinglesFromInfobox(wikitext: string): Set<string> {
  const singles = new Set<string>()
  const singlesM = wikitext.match(/\|\s*singles?\s*=\s*([\s\S]*?)(?=\n\s*\||\n\s*\}\})/)
  if (!singlesM) return singles
  const block = singlesM[1]
  const linkRe = /\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(block)) !== null) singles.add(cleanWikiText(m[2] || m[1]).toLowerCase())
  const plainRe = /[""]([^""]+)[""]/g
  while ((m = plainRe.exec(block)) !== null) singles.add(m[1].trim().toLowerCase())
  return singles
}

function getBlockHeadline(tl: string): string {
  const m = tl.match(/\|\s*headline\s*=\s*([^\n|]+)/)
  return m ? m[1].replace(/[''+\[\]]/g, '').trim() : ''
}

// A block is "bonus" if its headline mentions bonus/deluxe/special/etc
function isBonusBlock(headline: string): boolean {
  if (!headline) return false
  const h = headline.toLowerCase()
  return h.includes('bonus') || h.includes('deluxe') || h.includes('japan') ||
    h.includes('special') || h.includes('itunes') || h.includes('target') ||
    h.includes('walmart') || h.includes('exclusive') || h.includes('limited')
}

function isDiscBlock(tl: string): boolean {
  return /\|\s*headline\s*=.*[Dd]isc\s*[12]/i.test(tl) || /\|\s*disc\s*=\s*[12]/i.test(tl)
}

function parseTracksFromBlock(tl: string, startOrder: number, singles: Set<string>): TrackEntry[] {
  const tracks: TrackEntry[] = []
  let i = 1
  let order = startOrder
  while (true) {
    const titleM = tl.match(new RegExp(`\\|\\s*title${i}\\s*=\\s*([^|\\n]+)`))
    if (!titleM) break
    const lenM = tl.match(new RegExp(`\\|\\s*length${i}\\s*=\\s*([^|\\n]+)`))
    // FIX: clean wiki markup first, THEN parse featuring
    const rawCleaned = cleanWikiText(titleM[1].trim())
    if (rawCleaned) {
      const { cleanTitle, featuring } = parseFeaturing(rawCleaned)
      const is_single = singles.size > 0 ? singles.has(cleanTitle.toLowerCase()) : undefined
      tracks.push({
        title: cleanTitle,
        duration: lenM?.[1]?.trim(),
        sort_order: order++,
        is_single,
        featuring: featuring.length > 0 ? featuring : undefined,
      })
    }
    i++
  }
  return tracks
}

function parseTracklist(wikitext: string): TrackEntry[] {
  const singles = parseSinglesFromInfobox(wikitext)
  const tlBlocks = extractTrackListings(wikitext)

  if (!tlBlocks.length) {
    // Fallback: numbered list
    const tracks: TrackEntry[] = []
    let order = 1
    for (const line of wikitext.split('\n')) {
      const m = line.match(/^#+\s*(.+)/)
      if (m) {
        const rawCleaned = cleanWikiText(m[1])
        if (rawCleaned.length > 1) {
          const { cleanTitle, featuring } = parseFeaturing(rawCleaned)
          tracks.push({ title: cleanTitle, sort_order: order++, featuring: featuring.length > 0 ? featuring : undefined })
        }
      }
    }
    return tracks
  }

  const allTracks: TrackEntry[] = []

  // Check if all blocks are disc parts (multi-disc album)
  const isMultiDisc = tlBlocks.every(b => isDiscBlock(b)) && tlBlocks.length > 1

  if (isMultiDisc) {
    let order = 1
    for (const tl of tlBlocks) {
      const newTracks = parseTracksFromBlock(tl, order, singles)
      allTracks.push(...newTracks)
      order += newTracks.length
    }
  } else {
    // Split into standard and bonus blocks by headline
    const standardBlocks = tlBlocks.filter(tl => !isBonusBlock(getBlockHeadline(tl)))
    const bonusBlocks = tlBlocks.filter(tl => isBonusBlock(getBlockHeadline(tl)))

    // Use standard blocks (or first block if none identified as standard)
    const blocksToUse = standardBlocks.length > 0 ? standardBlocks : [tlBlocks[0]]

    let order = 1
    for (const tl of blocksToUse) {
      const newTracks = parseTracksFromBlock(tl, order, singles)
      allTracks.push(...newTracks)
      order += newTracks.length
    }

    // Add bonus tracks, deduplicating by title
    const existingTitles = new Set(allTracks.map(t => t.title.toLowerCase()))
    for (const tl of bonusBlocks) {
      const bonusTracks = parseTracksFromBlock(tl, order, singles)
      for (const bt of bonusTracks) {
        if (!existingTitles.has(bt.title.toLowerCase())) {
          allTracks.push({ ...bt, sort_order: order++ })
          existingTitles.add(bt.title.toLowerCase())
        }
      }
    }
  }

  return allTracks
}

function parseReleaseDate(wikitext: string): { year: number | null; month: number | null; day: number | null } {
  const startDateM = wikitext.match(/\{\{[Ss]tart\s*date\|(\d{4})\|?(\d{1,2})?\|?(\d{1,2})?/)
  if (startDateM) return {
    year: startDateM[1] ? parseInt(startDateM[1]) : null,
    month: startDateM[2] ? parseInt(startDateM[2]) : null,
    day: startDateM[3] ? parseInt(startDateM[3]) : null,
  }
  const releasedM = wikitext.match(/\|\s*released\s*=\s*[^|{[\n]*?(\w+ \d{1,2},?\s*\d{4})/)
  if (releasedM) {
    const d = new Date(releasedM[1])
    if (!isNaN(d.getTime())) return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() }
  }
  const isoM = wikitext.match(/\|\s*released\s*=\s*(\d{4})-(\d{2})-(\d{2})/)
  if (isoM) return { year: parseInt(isoM[1]), month: parseInt(isoM[2]), day: parseInt(isoM[3]) }
  const yearM = wikitext.match(/\|\s*released\s*=\s*.*?(\d{4})/)
  if (yearM) return { year: parseInt(yearM[1]), month: null, day: null }
  return { year: null, month: null, day: null }
}

function hasMultipleArtistSections(wikitext: string): string[] {
  const groups: string[] = []
  const lines = wikitext.split('\n')
  let inDisc = false
  for (const line of lines) {
    const h = line.match(/^(==+)\s*(.+?)\s*\1/)
    if (!h) continue
    const depth = h[1].length
    const title = h[2].toLowerCase()
    if (title.includes('discograph')) { inDisc = true; continue }
    if (depth === 2 && inDisc) break
    if (inDisc && depth === 3) groups.push(h[2].trim())
  }
  return groups
}

type Props = { artistId: number; artistName: string; artistWikiTitle?: string; isSolo?: boolean }

export default function WikipediaImportDiscography({ artistId, artistName, artistWikiTitle, isSolo }: Props) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState(artistWikiTitle ? `https://en.wikipedia.org/wiki/${artistWikiTitle}` : '')
  const [loading, setLoading] = useState(false)
  const [albums, setAlbums] = useState<DiscographyAlbum[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [log, setLog] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [artistGroups, setArtistGroups] = useState<string[]>([])

  const addLog = (msg: string) => setLog(p => [...p, msg])

  const search = async (groupFilter?: string) => {
    setLoading(true); setAlbums([]); setLog([]); setSelected(new Set())
    const baseTitle = extractWikiTitle(url)
    addLog(`🔍 Ieškoma: ${baseTitle}...`)
    let found: DiscographyAlbum[] = []

    const mainWikitext = await fetchWikitext(baseTitle)
    if (mainWikitext) {
      const groups = hasMultipleArtistSections(mainWikitext)
      if (groups.length > 1 && !groupFilter && !isSolo) {
        setArtistGroups(groups)
        setLoading(false)
        return
      }
      const soloMode = isSolo || groupFilter === '__solo__'
      found = parseMainPageDiscography(mainWikitext, soloMode)
      if (found.length) addLog(`✅ Rasta ${found.length} albumų iš pagrindinio puslapio`)
    }

    if (!found.length || baseTitle.toLowerCase().includes('discography')) {
      const discTitle = baseTitle.replace(/_discography$/i, '') + '_discography'
      if (discTitle !== baseTitle) {
        addLog(`  → bandoma: ${discTitle}`)
        const discWikitext = await fetchWikitext(discTitle)
        if (discWikitext) {
          const discFound = parseDiscographyPage(discWikitext)
          if (discFound.length > found.length) { found = discFound; addLog(`✅ Rasta ${found.length} albumų iš diskografijos puslapio`) }
        }
      }
    }

    if (!found.length) addLog('❌ Nieko nerasta. Pabandyk nurodyti _discography URL.')
    setArtistGroups([])
    setAlbums(found)
    setSelected(new Set(found.map((_, i) => i)))
    setLoading(false)
  }

  const fetchAlbumDetails = async (idx: number) => {
    const a = albums[idx]
    if (!a.wikiTitle || a.fetched) return
    addLog(`📋 ${a.title}...`)
    try {
      const [wikitext, cover] = await Promise.all([fetchWikitext(a.wikiTitle), fetchCoverImage(a.wikiTitle)])
      const dateInfo = parseReleaseDate(wikitext)
      const tracks = parseTracklist(wikitext)
      const singlesCount = tracks.filter(t => t.is_single).length
      const featCount = tracks.filter(t => t.featuring?.length).length
      setAlbums(p => p.map((al, i) => i === idx
        ? { ...al, tracks, fetched: true, cover_image_url: cover || al.cover_image_url,
            year: dateInfo.year ?? al.year, month: dateInfo.month, day: dateInfo.day }
        : al))
      addLog(`  → ${tracks.length} dainų${singlesCount ? `, ${singlesCount} singlų` : ''}${featCount ? `, ${featCount} su feat.` : ''}${cover ? ', viršelis ✓' : ''}`)
    } catch {
      setAlbums(p => p.map((al, i) => i === idx ? { ...al, fetched: true, tracks: [] } : al))
      addLog(`  ❌ Klaida kraunant ${a.title}`)
    }
  }

  const fetchAllDetails = async () => {
    for (let i = 0; i < albums.length; i++) {
      if (selected.has(i) && !albums[i].fetched) {
        await fetchAlbumDetails(i)
        await new Promise(r => setTimeout(r, 300))
      }
    }
  }

  const importSelected = async () => {
    const indices = Array.from(selected).sort((a, b) => a - b)
    const unfetched = indices.filter(i => !albums[i].fetched)
    if (unfetched.length > 0) {
      addLog(`📋 Kraunamos detalės (${unfetched.length} albumų)...`)
      for (const i of unfetched) {
        await fetchAlbumDetails(i)
        await new Promise(r => setTimeout(r, 300))
      }
    }

    // Snapshot to avoid React async state issues
    let snapshot: DiscographyAlbum[] = []
    setAlbums(p => { snapshot = [...p]; return p })
    await new Promise(r => setTimeout(r, 50))

    setImporting(true)
    let ok = 0, fail = 0

    for (const idx of indices) {
      const a = snapshot[idx]
      if (!a) continue
      setAlbums(p => p.map((al, i) => i === idx ? { ...al, importing: true } : al))

      try {
        const payload = {
          title: a.title,
          artist_id: artistId,
          year: a.year || null,
          month: a.month || null,
          day: a.day || null,
          cover_image_url: a.cover_image_url || '',
          type_studio: a.type === 'studio',
          type_ep: a.type === 'ep',
          type_single: a.type === 'single',
          type_compilation: a.type === 'compilation',
          type_live: a.type === 'live',
          type_remix: false, type_covers: false, type_holiday: false, type_soundtrack: false, type_demo: false,
          tracks: (a.tracks || []).map((t, i) => ({
            title: t.title,
            sort_order: i + 1,
            duration: t.duration || null,
            type: 'normal' as const,
            disc_number: t.disc_number || 1,
            is_single: t.is_single || false,
            featuring: t.featuring || [],
          })),
        }
        const res = await fetch('/api/albums', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error((await res.json()).error)
        setAlbums(p => p.map((al, i) => i === idx ? { ...al, importing: false, imported: true } : al))
        const singlesInAlbum = (a.tracks || []).filter(t => t.is_single).length
        addLog(`✅ ${a.title} (${a.tracks?.length || 0} dainų${singlesInAlbum ? `, ${singlesInAlbum} singlų` : ''})`)
        ok++
      } catch (e: any) {
        setAlbums(p => p.map((al, i) => i === idx ? { ...al, importing: false, error: e.message } : al))
        addLog(`❌ ${a.title}: ${e.message}`)
        fail++
      }
      await new Promise(r => setTimeout(r, 200))
    }
    setImporting(false)
    addLog(`🏁 Baigta: ${ok} importuota${fail ? `, ${fail} klaida` : ''}`)
  }

  const toggleSelect = (i: number) => setSelected(p => {
    const s = new Set(p); s.has(i) ? s.delete(i) : s.add(i); return s
  })
  const selectOnlyStudio = () => setSelected(new Set(albums.map((a, i) => a.type === 'studio' ? i : -1).filter(i => i !== -1)))

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-purple-100 hover:bg-purple-200 text-purple-800 rounded-lg text-sm font-medium transition-colors">
        📀 Importuoti diskografiją
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => !importing && setOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">📀 Diskografijos importas — {artistName}</h3>
              <button onClick={() => !importing && setOpen(false)} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
            </div>

            <div className="px-6 py-4 border-b border-gray-100 flex gap-3">
              <input value={url} onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !loading && search()}
                placeholder="https://en.wikipedia.org/wiki/Coldplay"
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-900 bg-white focus:outline-none focus:border-purple-400 placeholder:text-gray-400" />
              <button onClick={() => search()} disabled={loading || !url.trim()}
                className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-medium disabled:opacity-50 transition-colors whitespace-nowrap">
                {loading ? '⏳' : '🔍 Ieškoti'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {artistGroups.length > 1 && !loading && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-sm font-medium text-amber-800 mb-3">
                    ⚠️ Rastos kelios diskografijos grupės. Kurią importuoti?
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => search('__solo__')} className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700">
                      🎤 Tik solo albumai
                    </button>
                    <button onClick={() => { setArtistGroups([]); search('__all__') }} className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300">
                      📀 Visi albumai
                    </button>
                    {artistGroups.map(g => (
                      <button key={g} onClick={() => { setArtistGroups([]); search(g) }} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200">
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {albums.length > 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-3 text-sm flex-wrap items-center">
                      <button onClick={() => setSelected(new Set(albums.map((_, i) => i)))} className="text-purple-600 hover:underline">Visi</button>
                      <button onClick={() => setSelected(new Set())} className="text-gray-400 hover:underline">Joks</button>
                      <button onClick={selectOnlyStudio} className="text-gray-500 hover:underline text-xs">Tik studijiniai</button>
                      <button onClick={fetchAllDetails} disabled={importing}
                        className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium disabled:opacity-50">
                        📋 Krauti detales
                      </button>
                    </div>
                    <span className="text-xs text-gray-400">{selected.size} pasirinkta</span>
                  </div>

                  <div className="space-y-2">
                    {albums.map((a, i) => (
                      <div key={i} onClick={() => !a.imported && toggleSelect(i)}
                        className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                          a.imported ? 'border-green-200 bg-green-50 opacity-60' :
                          selected.has(i) ? 'border-purple-300 bg-purple-50' :
                          'border-gray-200 bg-white hover:bg-gray-50'
                        }`}>
                        <input type="checkbox" checked={selected.has(i)} onChange={() => {}} className="accent-purple-600 pointer-events-none shrink-0" />
                        {a.cover_image_url
                          ? <img src={a.cover_image_url} alt="" referrerPolicy="no-referrer" className="w-10 h-10 rounded object-cover shrink-0" />
                          : <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center text-gray-300 shrink-0 text-lg">💿</div>
                        }
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-gray-900 text-sm truncate">{a.title}</span>
                            {a.year && (
                              <span className="text-xs text-gray-400 shrink-0">
                                ({a.year}{a.month ? `-${String(a.month).padStart(2,'0')}` : ''}{a.day ? `-${String(a.day).padStart(2,'0')}` : ''})
                              </span>
                            )}
                            {a.imported && <span className="text-xs text-green-600 font-medium">✅</span>}
                            {a.error && <span className="text-xs text-red-500" title={a.error}>❌</span>}
                            {a.importing && <span className="text-xs text-purple-500 animate-pulse">⏳</span>}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-xs text-gray-400">{TYPE_LABELS[a.type]}</span>
                            {a.tracks !== undefined && (
                              <span className="text-xs text-purple-600">
                                {a.tracks.length} dainų
                                {a.tracks.filter(t => t.is_single).length > 0 && <span className="text-amber-600 ml-1">· {a.tracks.filter(t => t.is_single).length} singlai</span>}
                                {a.tracks.filter(t => t.featuring?.length).length > 0 && <span className="text-blue-500 ml-1">· feat. ✓</span>}
                              </span>
                            )}
                          </div>
                        </div>
                        <button type="button" onClick={e => { e.stopPropagation(); fetchAlbumDetails(i) }}
                          disabled={a.fetched || importing} title="Krauti detales"
                          className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-lg text-xs disabled:opacity-40 shrink-0">
                          {a.fetched ? '✓' : '📋'}
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {log.length > 0 && (
                <div className="bg-gray-900 rounded-xl p-3 font-mono text-xs text-green-400 max-h-32 overflow-y-auto">
                  {log.map((l, i) => <div key={i}>{l}</div>)}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={importSelected} disabled={importing || selected.size === 0 || !albums.length}
                className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl disabled:opacity-40 transition-colors">
                {importing ? '⏳ Importuojama...' : `⬆️ Importuoti ${selected.size} albumą(-ų)`}
              </button>
              <button onClick={() => !importing && setOpen(false)}
                className="px-6 py-3 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors">
                Uždaryti
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
