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
  tracks?: { title: string; duration?: string; sort_order: number }[]
  fetched?: boolean
  importing?: boolean
  imported?: boolean
  error?: string
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

// FIX #2: Fetch cover via Wikimedia Commons API proxy to avoid CORS/hotlink issues
async function fetchCoverImage(wikiTitle: string): Promise<string> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(wikiTitle)}&prop=pageimages&pithumbsize=500&piprop=thumbnail&format=json&origin=*`
    )
    const json = await res.json()
    const pages = json.query?.pages || {}
    const page = Object.values(pages)[0] as any
    const thumb = page?.thumbnail?.source || ''
    if (thumb) return thumb

    // Fallback: original image
    const res2 = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(wikiTitle)}&prop=pageimages&pithumbsize=500&piprop=original&format=json&origin=*`
    )
    const json2 = await res2.json()
    const pages2 = json2.query?.pages || {}
    const page2 = Object.values(pages2)[0] as any
    return page2?.original?.source || ''
  } catch { return '' }
}

function parseMainPageDiscography(wikitext: string): DiscographyAlbum[] {
  const albums: DiscographyAlbum[] = []
  const lines = wikitext.split('\n')
  let inDiscSection = false
  let currentType: DiscographyAlbum['type'] = 'studio'

  for (const line of lines) {
    const headerM = line.match(/^(==+)\s*(.+?)\s*\1/)
    if (headerM) {
      const depth = headerM[1].length
      const h = headerM[2].toLowerCase()

      if (depth === 2 && inDiscSection && !h.includes('discograph')) break

      if (h.includes('discograph')) {
        inDiscSection = true
        continue
      }

      if (inDiscSection) {
        if (h.includes('studio')) currentType = 'studio'
        else if (h.includes(' ep') || h === 'eps') currentType = 'ep'
        else if (h.includes('single')) currentType = 'single'
        else if (h.includes('compilation') || h.includes('greatest') || h.includes('best of')) currentType = 'compilation'
        else if (h.includes('live') || h.includes('concert')) currentType = 'live'
        if (h.includes('video') || h.includes('film') || h.includes('tour')) continue
      }
      continue
    }

    if (!inDiscSection) continue
    if (!line.startsWith('*')) continue

    let title = ''
    let wikiTitle = ''

    const wikiLinkM = line.match(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/)
    if (wikiLinkM) {
      wikiTitle = wikiLinkM[1].trim()
      const display = wikiLinkM[2] || wikiLinkM[1]
      title = display.replace(/\(.*?\)/g, '').replace(/''/g, '').trim()
    } else {
      const italicM = line.match(/['']['"]{0,1}([^'']+)['']['"]{0,1}/)
      if (italicM) {
        title = italicM[1].trim()
        wikiTitle = title.replace(/ /g, '_')
      }
    }

    if (!title || title.length < 2) continue
    if (wikiTitle.includes(':')) continue
    if (line.toLowerCase().includes('main article') || line.toLowerCase().includes('see also')) continue

    const yearM = line.match(/\((\d{4})\)/)
    const year = yearM ? parseInt(yearM[1]) : null

    if (/^[A-Z]{2,3}$/.test(title)) continue

    const bad = ['discography', 'songs', 'videography', 'filmography', 'certification', 'chart']
    if (bad.some(b => title.toLowerCase().includes(b) || wikiTitle.toLowerCase().includes(b))) continue

    albums.push({ title, year, month: null, day: null, type: currentType, wikiTitle: wikiTitle || title })
  }

  return albums
}

function parseDiscographyPage(wikitext: string): DiscographyAlbum[] {
  const albums: DiscographyAlbum[] = []
  const lines = wikitext.split('\n')
  let currentType: DiscographyAlbum['type'] = 'studio'
  let inTable = false
  let skipSection = false

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
    if (!inTable) continue
    if (!line.match(/!\s*scope=['"]row['"]/)) continue

    const wm = line.match(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/)
    if (!wm) continue

    const wikiTitle = wm[1].trim()
    const display = wm[2] || wm[1]
    const title = display.replace(/\(.*?\)/g, '').replace(/''/g, '').trim()

    if (!title || title.length < 2) continue
    if (wikiTitle.includes(':')) continue

    const yr = line.match(/\b(19|20)\d{2}\b/)
    const year = yr ? parseInt(yr[0]) : null

    albums.push({ title, year, month: null, day: null, type: currentType, wikiTitle })
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

// FIX #1: Only take the FIRST track listing block (standard edition),
// skip bonus/deluxe/japanese/etc editions
function parseTracklist(wikitext: string): { title: string; duration?: string; sort_order: number }[] {
  const tracks: { title: string; duration?: string; sort_order: number }[] = []
  let order = 1

  const tlBlocks = extractTrackListings(wikitext)

  // Only use the FIRST block — that's the standard tracklist
  // Additional blocks are usually bonus/deluxe/regional editions
  const firstBlock = tlBlocks[0]
  if (firstBlock) {
    let i = 1
    while (true) {
      const titleM = firstBlock.match(new RegExp(`\\|\\s*title${i}\\s*=\\s*([^|\\n]+)`))
      if (!titleM) break
      const lenM = firstBlock.match(new RegExp(`\\|\\s*length${i}\\s*=\\s*([^|\\n]+)`))
      const raw = titleM[1].trim()
      const title = raw
        .replace(/\[\[(?:[^\]|]+\|)?([^\]|]+)\]\]/g, '$1')
        .replace(/''/g, '')
        .replace(/\{\{.*?\}\}/g, '')
        .trim()
      if (title) tracks.push({ title, duration: lenM?.[1]?.trim(), sort_order: order++ })
      i++
    }
  }

  // Fallback: numbered list format
  if (!tracks.length) {
    for (const line of wikitext.split('\n')) {
      const m = line.match(/^#+\s*(?:\[\[(?:[^\]|]+\|)?([^\]|]+)\]\]|''([^']+)''|([^<({|\n]+))/)
      if (m) {
        const title = (m[1] || m[2] || m[3] || '').trim()
        if (title.length > 1) tracks.push({ title, sort_order: order++ })
      }
    }
  }
  return tracks
}

// FIX #4: Parse full release date from infobox ({{Start date|2004|6|15}} or plain text)
function parseReleaseDate(wikitext: string): { year: number | null; month: number | null; day: number | null } {
  // Try {{Start date|YYYY|MM|DD}} or {{Start date|YYYY|M|D}}
  const startDateM = wikitext.match(/\{\{[Ss]tart\s*date\|(\d{4})\|?(\d{1,2})?\|?(\d{1,2})?/)
  if (startDateM) {
    return {
      year: startDateM[1] ? parseInt(startDateM[1]) : null,
      month: startDateM[2] ? parseInt(startDateM[2]) : null,
      day: startDateM[3] ? parseInt(startDateM[3]) : null,
    }
  }

  // Try | released = Month DD, YYYY (e.g. "June 14, 2004")
  const releasedM = wikitext.match(/\|\s*released\s*=\s*[^|{[\n]*?(\w+ \d{1,2},?\s*\d{4})/)
  if (releasedM) {
    const d = new Date(releasedM[1])
    if (!isNaN(d.getTime())) {
      return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() }
    }
  }

  // Try | released = YYYY-MM-DD
  const isoM = wikitext.match(/\|\s*released\s*=\s*(\d{4})-(\d{2})-(\d{2})/)
  if (isoM) {
    return { year: parseInt(isoM[1]), month: parseInt(isoM[2]), day: parseInt(isoM[3]) }
  }

  // Fallback: just year
  const yearM = wikitext.match(/\|\s*released\s*=\s*.*?(\d{4})/)
  if (yearM) return { year: parseInt(yearM[1]), month: null, day: null }

  return { year: null, month: null, day: null }
}

type Props = { artistId: number; artistName: string; artistWikiTitle?: string }

export default function WikipediaImportDiscography({ artistId, artistName, artistWikiTitle }: Props) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState(artistWikiTitle ? `https://en.wikipedia.org/wiki/${artistWikiTitle}` : '')
  const [loading, setLoading] = useState(false)
  const [albums, setAlbums] = useState<DiscographyAlbum[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [log, setLog] = useState<string[]>([])
  const [importing, setImporting] = useState(false)

  const addLog = (msg: string) => setLog(p => [...p, msg])

  const search = async () => {
    setLoading(true); setAlbums([]); setLog([]); setSelected(new Set())

    const baseTitle = extractWikiTitle(url)
    addLog(`🔍 Ieškoma: ${baseTitle}...`)

    let found: DiscographyAlbum[] = []

    const mainWikitext = await fetchWikitext(baseTitle)
    if (mainWikitext) {
      found = parseMainPageDiscography(mainWikitext)
      if (found.length) addLog(`✅ Rasta ${found.length} albumų iš pagrindinio puslapio`)
    }

    if (!found.length || baseTitle.toLowerCase().includes('discography')) {
      const discTitle = baseTitle.replace(/_discography$/i, '') + '_discography'
      if (discTitle !== baseTitle) {
        addLog(`  → bandoma: ${discTitle}`)
        const discWikitext = await fetchWikitext(discTitle)
        if (discWikitext) {
          const discFound = parseDiscographyPage(discWikitext)
          if (discFound.length > found.length) {
            found = discFound
            addLog(`✅ Rasta ${found.length} albumų iš diskografijos puslapio`)
          }
        }
      }
    }

    if (!found.length) addLog('❌ Nieko nerasta. Pabandyk nurodyti _discography URL.')

    setAlbums(found)
    setSelected(new Set(found.map((_, i) => i)))
    setLoading(false)
  }

  const fetchAlbumDetails = async (idx: number) => {
    const a = albums[idx]
    if (!a.wikiTitle || a.fetched) return
    addLog(`📋 ${a.title}...`)
    try {
      const [wikitext, cover] = await Promise.all([
        fetchWikitext(a.wikiTitle),
        fetchCoverImage(a.wikiTitle),
      ])

      // FIX #4: Parse full date, not just year
      const dateInfo = parseReleaseDate(wikitext)
      const year = dateInfo.year ?? a.year
      const month = dateInfo.month
      const day = dateInfo.day

      const tracks = parseTracklist(wikitext)
      setAlbums(p => p.map((al, i) => i === idx
        ? { ...al, tracks, fetched: true, cover_image_url: cover || al.cover_image_url, year, month, day }
        : al))
      addLog(`  → ${tracks.length} dainų${cover ? ', viršelis ✓' : ''}${month ? `, data: ${year}-${String(month).padStart(2,'0')}${day ? `-${String(day).padStart(2,'0')}` : ''}` : ''}`)
    } catch {
      setAlbums(p => p.map((al, i) => i === idx ? { ...al, fetched: true, tracks: [] } : al))
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
    // FIX #3: Ensure details are fetched before import if not already done
    const unfetched = Array.from(selected).filter(i => !albums[i].fetched)
    if (unfetched.length > 0) {
      addLog(`📋 Kraunamos detalės prieš importą (${unfetched.length} albumų)...`)
      for (const i of unfetched) {
        await fetchAlbumDetails(i)
        await new Promise(r => setTimeout(r, 300))
      }
    }

    setImporting(true)
    let ok = 0, fail = 0

    // Re-read albums state after fetching
    setAlbums(current => {
      // We'll use the updated state in the import loop below
      return current
    })

    for (const idx of Array.from(selected).sort((a, b) => a - b)) {
      // Use functional update to always get latest album state
      let currentAlbum: DiscographyAlbum | null = null
      setAlbums(p => {
        currentAlbum = p[idx]
        return p.map((al, i) => i === idx ? { ...al, importing: true } : al)
      })

      // Small delay to ensure state is updated
      await new Promise(r => setTimeout(r, 50))

      // Get fresh album data
      setAlbums(p => { currentAlbum = p[idx]; return p })
      await new Promise(r => setTimeout(r, 10))

      if (!currentAlbum) continue
      const a = currentAlbum as DiscographyAlbum

      try {
        const payload = {
          title: a.title,
          artist_id: artistId,
          year: a.year || null,
          month: a.month || null,   // FIX #4: send month
          day: a.day || null,       // FIX #4: send day
          cover_image_url: a.cover_image_url || '',
          type_studio: a.type === 'studio',
          type_ep: a.type === 'ep',
          type_single: a.type === 'single',
          type_compilation: a.type === 'compilation',
          type_live: a.type === 'live',
          type_remix: false, type_covers: false, type_holiday: false, type_soundtrack: false, type_demo: false,
          // FIX #3: ensure tracks are included (even empty array is ok)
          tracks: (a.tracks || []).map((t, i) => ({
            title: t.title,
            sort_order: i + 1,
            duration: t.duration || null,
            type: 'normal' as const,
            disc_number: 1,
          })),
        }
        const res = await fetch('/api/albums', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error((await res.json()).error)
        setAlbums(p => p.map((al, i) => i === idx ? { ...al, importing: false, imported: true } : al))
        addLog(`✅ ${a.title}${a.tracks?.length ? ` (${a.tracks.length} dainų)` : ''}`)
        ok++
      } catch (e: any) {
        setAlbums(p => p.map((al, i) => i === idx ? { ...al, importing: false, error: e.message } : al))
        addLog(`❌ ${a.title}: ${e.message}`)
        fail++
      }
      await new Promise(r => setTimeout(r, 150))
    }
    setImporting(false)
    addLog(`🏁 Baigta: ${ok} importuota${fail ? `, ${fail} klaida` : ''}`)
  }

  const toggleSelect = (i: number) => setSelected(p => {
    const s = new Set(p); s.has(i) ? s.delete(i) : s.add(i); return s
  })

  const selectOnlyStudio = () => {
    setSelected(new Set(
      albums.map((a, i) => a.type === 'studio' ? i : -1).filter(i => i !== -1)
    ))
  }

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
              <input
                value={url} onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !loading && search()}
                placeholder="https://en.wikipedia.org/wiki/Coldplay"
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-900 bg-white focus:outline-none focus:border-purple-400 placeholder:text-gray-400"
              />
              <button onClick={search} disabled={loading || !url.trim()}
                className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-medium disabled:opacity-50 transition-colors whitespace-nowrap">
                {loading ? '⏳' : '🔍 Ieškoti'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {albums.length > 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-3 text-sm flex-wrap items-center">
                      <button onClick={() => setSelected(new Set(albums.map((_, i) => i)))} className="text-purple-600 hover:underline">Visi</button>
                      <button onClick={() => setSelected(new Set())} className="text-gray-400 hover:underline">Joks</button>
                      <button onClick={selectOnlyStudio} className="text-gray-500 hover:underline text-xs">Tik studijiniai</button>
                      <button onClick={fetchAllDetails} disabled={importing}
                        className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium disabled:opacity-50">
                        📋 Krauti detales (datas, dainas, viršelius)
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
                          // FIX #2: Use regular <img> with referrerPolicy to avoid Wikipedia hotlink protection
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
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-gray-400">{TYPE_LABELS[a.type]}</span>
                            {a.tracks !== undefined && <span className="text-xs text-purple-600">{a.tracks.length} dainų</span>}
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
