'use client'

import { useState } from 'react'

type DiscographyAlbum = {
  title: string
  year: number | null
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

async function fetchCoverImage(wikiTitle: string): Promise<string> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(wikiTitle)}&prop=pageimages&pithumbsize=400&format=json&origin=*`
    )
    const json = await res.json()
    const pages = json.query?.pages || {}
    const page = Object.values(pages)[0] as any
    return page?.thumbnail?.source || ''
  } catch { return '' }
}

// Parse discography from the MAIN artist page (simple bullet list, italic titles)
function parseMainPageDiscography(wikitext: string): DiscographyAlbum[] {
  const albums: DiscographyAlbum[] = []
  const lines = wikitext.split('\n')
  let inDiscSection = false
  let currentType: DiscographyAlbum['type'] = 'studio'
  let discSectionDepth = 0

  for (const line of lines) {
    const headerM = line.match(/^(==+)\s*(.+?)\s*\1/)
    if (headerM) {
      const depth = headerM[1].length
      const h = headerM[2].toLowerCase()

      if (depth === 2 && inDiscSection) {
        // New top-level section — stop
        if (!h.includes('discograph')) break
      }

      if (h.includes('discograph')) {
        inDiscSection = true
        discSectionDepth = depth
        continue
      }

      if (inDiscSection) {
        // Sub-section type detection
        if (h.includes('studio')) currentType = 'studio'
        else if (h.includes(' ep') || h === 'eps') currentType = 'ep'
        else if (h.includes('single')) currentType = 'single'
        else if (h.includes('compilation') || h.includes('greatest') || h.includes('best of')) currentType = 'compilation'
        else if (h.includes('live') || h.includes('concert')) currentType = 'live'
        // Skip video/film/other
        if (h.includes('video') || h.includes('film') || h.includes('tour')) continue
      }
      continue
    }

    if (!inDiscSection) continue
    if (!line.startsWith('*')) continue

    let title = ''
    let year: number | null = null
    let wikiTitle = ''

    // Try [[WikiTitle|Display]] format
    const wikiLinkM = line.match(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/)
    if (wikiLinkM) {
      wikiTitle = wikiLinkM[1].trim()
      const display = wikiLinkM[2] || wikiLinkM[1]
      title = display.replace(/\(.*?\)/g, '').replace(/''/g, '').trim()
    } else {
      // Try ''italic title'' format (no wiki link)
      const italicM = line.match(/['']['"]{0,1}([^'']+)['']['"]{0,1}/)
      if (italicM) {
        title = italicM[1].trim()
        wikiTitle = title.replace(/ /g, '_')
      }
    }

    if (!title || title.length < 2) continue

    // Skip if clearly not an album (category links, files, etc.)
    if (wikiTitle.includes(':')) continue

    // Skip "Main article:", "See also:" type lines
    if (line.toLowerCase().includes('main article') || line.toLowerCase().includes('see also')) continue

    // Extract year
    const yearM = line.match(/\((\d{4})\)/)
    if (yearM) year = parseInt(yearM[1])

    // Skip country codes like UK, CAN, GER that sneak in
    if (/^[A-Z]{2,3}$/.test(title)) continue

    // Skip obvious non-album entries
    const bad = ['discography', 'songs', 'videography', 'filmography', 'certification', 'chart']
    if (bad.some(b => title.toLowerCase().includes(b) || wikiTitle.toLowerCase().includes(b))) continue

    albums.push({ title, year, type: currentType, wikiTitle: wikiTitle || title })
  }

  return albums
}

// Also parse dedicated _discography pages (wikitable format, only rows with album wiki links)
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

    // Only scope="row" header cells — these are album titles
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

    albums.push({ title, year, type: currentType, wikiTitle })
  }

  return albums
}

function parseTracklist(wikitext: string): { title: string; duration?: string; sort_order: number }[] {
  const tracks: { title: string; duration?: string; sort_order: number }[] = []
  let order = 1

  const tlMatches = wikitext.match(/\{\{[Tt]rack\s*listing([\s\S]+?)\}\}/g) || []
  for (const tl of tlMatches) {
    let i = 1
    while (true) {
      const titleM = tl.match(new RegExp(`\\|\\s*title${i}\\s*=\\s*([^|\\n]+)`))
      if (!titleM) break
      const lenM = tl.match(new RegExp(`\\|\\s*length${i}\\s*=\\s*([^|\\n]+)`))
      const title = titleM[1].trim().replace(/\[\[(?:[^\]|]+\|)?([^\]|]+)\]\]/g, '$1').replace(/''/g, '').trim()
      if (title) tracks.push({ title, duration: lenM?.[1]?.trim(), sort_order: order++ })
      i++
    }
  }

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

    // 1. Try main artist page first (cleanest source)
    const mainWikitext = await fetchWikitext(baseTitle)
    if (mainWikitext) {
      found = parseMainPageDiscography(mainWikitext)
      if (found.length) {
        addLog(`✅ Rasta ${found.length} albumų iš pagrindinio puslapio`)
      }
    }

    // 2. If none found or explicitly a _discography URL, try discography page
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

      // Extract year from infobox if not already set
      let year = a.year
      if (!year) {
        const relM = wikitext.match(/\|\s*released\s*=\s*.*?(\d{4})/)
        if (relM) year = parseInt(relM[1])
      }

      const tracks = parseTracklist(wikitext)
      setAlbums(p => p.map((al, i) => i === idx
        ? { ...al, tracks, fetched: true, cover_image_url: cover, year: year ?? al.year }
        : al))
      addLog(`  → ${tracks.length} dainų${cover ? ', viršelis ✓' : ''}`)
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
    setImporting(true)
    let ok = 0, fail = 0
    for (const idx of Array.from(selected).sort((a, b) => a - b)) {
      const a = albums[idx]
      setAlbums(p => p.map((al, i) => i === idx ? { ...al, importing: true } : al))
      try {
        const payload = {
          title: a.title,
          artist_id: artistId,
          year: a.year || null,
          cover_image_url: a.cover_image_url || '',
          type_studio: a.type === 'studio',
          type_ep: a.type === 'ep',
          type_single: a.type === 'single',
          type_compilation: a.type === 'compilation',
          type_live: a.type === 'live',
          type_remix: false, type_covers: false, type_holiday: false, type_soundtrack: false, type_demo: false,
          tracks: (a.tracks || []).map((t, i) => ({
            title: t.title, sort_order: i + 1, duration: t.duration, type: 'normal', disc_number: 1,
          })),
        }
        const res = await fetch('/api/albums', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error((await res.json()).error)
        setAlbums(p => p.map((al, i) => i === idx ? { ...al, importing: false, imported: true } : al))
        addLog(`✅ ${a.title}`)
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
                    <div className="flex gap-3 text-sm flex-wrap">
                      <button onClick={() => setSelected(new Set(albums.map((_, i) => i)))} className="text-purple-600 hover:underline">Visi</button>
                      <button onClick={() => setSelected(new Set())} className="text-gray-400 hover:underline">Joks</button>
                      <button onClick={() => setSelected(new Set(albums.filter((a,_) => a.type === 'studio').map((_, i) => albums.findIndex(a2 => a2 === _))))} className="text-gray-500 hover:underline text-xs">Tik studijiniai</button>
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
                          ? <img src={a.cover_image_url} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                          : <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center text-gray-300 shrink-0 text-lg">💿</div>
                        }
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-gray-900 text-sm truncate">{a.title}</span>
                            {a.year && <span className="text-xs text-gray-400 shrink-0">({a.year})</span>}
                            {a.imported && <span className="text-xs text-green-600 font-medium">✅</span>}
                            {a.error && <span className="text-xs text-red-500">❌</span>}
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
