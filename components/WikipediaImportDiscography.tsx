'use client'

import { useState } from 'react'

type DiscographyAlbum = {
  title: string
  year: number | null
  type: 'studio' | 'ep' | 'single' | 'compilation' | 'live'
  wikiTitle?: string
  tracks?: { title: string; duration?: string; sort_order: number }[]
  cover_image_url?: string
  fetched?: boolean
  importing?: boolean
  imported?: boolean
  error?: string
}

function parseDiscographySection(wikitext: string, artistId: number): DiscographyAlbum[] {
  const albums: DiscographyAlbum[] = []

  // Match album entries: *''Title'' (year) or *[[Title]] (year)
  const lines = wikitext.split('\n')
  let currentType: DiscographyAlbum['type'] = 'studio'

  for (const line of lines) {
    // Detect section headers
    const headerM = line.match(/==+\s*(.+?)\s*==+/)
    if (headerM) {
      const h = headerM[1].toLowerCase()
      if (h.includes('studio')) currentType = 'studio'
      else if (h.includes('ep') || h.includes('extended')) currentType = 'ep'
      else if (h.includes('single')) currentType = 'single'
      else if (h.includes('compilation') || h.includes('greatest hits')) currentType = 'compilation'
      else if (h.includes('live')) currentType = 'live'
      continue
    }

    // Match album line: * ''Album Title'' or * [[Album Title]] 
    const m = line.match(/^\*+\s*(?:''|\[\[)([^\]'|]+)(?:''|\]\])[^(]*(?:\((\d{4})\))?/)
    if (m) {
      const title = m[1].trim()
      const year = m[2] ? parseInt(m[2]) : null
      if (title.length > 1) {
        albums.push({ title, year, type: currentType, wikiTitle: title })
      }
    }
  }

  return albums
}

function parseTracklist(wikitext: string): { title: string; duration?: string; sort_order: number }[] {
  const tracks: { title: string; duration?: string; sort_order: number }[] = []
  let order = 1

  // Match tracklist template: {{track listing ... }}
  // Or simple numbered list: # [[Title]]
  const tlMatch = wikitext.match(/\{\{[Tt]rack\s*listing([\s\S]+?)\}\}/g)
  if (tlMatch) {
    for (const tl of tlMatch) {
      // Extract title_N and length_N
      let i = 1
      while (true) {
        const titleM = tl.match(new RegExp(`\\|\\s*title${i}\\s*=\\s*([^|\\n]+)`))
        if (!titleM) break
        const lenM = tl.match(new RegExp(`\\|\\s*(?:length|length${i})\\s*=\\s*([^|\\n]+)`))
        const title = titleM[1].trim().replace(/\[\[(?:[^\]|]+\|)?([^\]|]+)\]\]/g, '$1').trim()
        if (title) {
          tracks.push({
            title,
            duration: lenM ? lenM[1].trim() : undefined,
            sort_order: order++,
          })
        }
        i++
      }
    }
  }

  if (!tracks.length) {
    // Fallback: numbered list
    for (const line of wikitext.split('\n')) {
      const m = line.match(/^#+\s*(?:\[\[(?:[^\]|]+\|)?([^\]|]+)\]\]|''([^']+)''|([^<({\n]+))/)
      if (m) {
        const title = (m[1] || m[2] || m[3] || '').trim()
        if (title.length > 1) tracks.push({ title, sort_order: order++ })
      }
    }
  }

  return tracks
}

async function fetchDiscography(artistWikiTitle: string): Promise<DiscographyAlbum[]> {
  // Try dedicated discography page first
  const discoTitle = `${artistWikiTitle}_discography`
  let wikitext = ''

  for (const title of [discoTitle, artistWikiTitle]) {
    try {
      const res = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=revisions&rvprop=content&rvslots=main&format=json&origin=*`
      )
      const json = await res.json()
      const pages = json.query?.pages || {}
      const page = Object.values(pages)[0] as any
      if (page && !page.missing) {
        wikitext = page?.revisions?.[0]?.slots?.main?.['*'] || page?.revisions?.[0]?.['*'] || ''
        if (wikitext) break
      }
    } catch {}
  }

  if (!wikitext) return []
  return parseDiscographySection(wikitext, 0)
}

async function fetchAlbumTracks(wikiTitle: string): Promise<{ title: string; duration?: string; sort_order: number }[]> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(wikiTitle)}&prop=revisions&rvprop=content&rvslots=main&format=json&origin=*`
    )
    const json = await res.json()
    const pages = json.query?.pages || {}
    const page = Object.values(pages)[0] as any
    const wikitext = page?.revisions?.[0]?.slots?.main?.['*'] || page?.revisions?.[0]?.['*'] || ''
    return parseTracklist(wikitext)
  } catch { return [] }
}

type Props = {
  artistId: number
  artistName: string
  artistWikiTitle?: string
}

export default function WikipediaImportDiscography({ artistId, artistName, artistWikiTitle }: Props) {
  const [open, setOpen] = useState(false)
  const [wikiTitle, setWikiTitle] = useState(artistWikiTitle || artistName.replace(/ /g, '_'))
  const [loading, setLoading] = useState(false)
  const [albums, setAlbums] = useState<DiscographyAlbum[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [log, setLog] = useState<string[]>([])
  const [importing, setImporting] = useState(false)

  const addLog = (msg: string) => setLog(p => [...p, msg])

  const fetchDisc = async () => {
    setLoading(true)
    setAlbums([])
    setLog([])
    addLog(`🔍 Ieškoma: ${wikiTitle}...`)
    try {
      const found = await fetchDiscography(wikiTitle)
      setAlbums(found)
      addLog(`✅ Rasta ${found.length} įrašų`)
      if (found.length) setSelected(new Set(found.map((_, i) => i)))
    } catch (e: any) {
      addLog(`❌ Klaida: ${e.message}`)
    }
    setLoading(false)
  }

  const fetchTracks = async (idx: number) => {
    const a = albums[idx]
    if (!a.wikiTitle || a.fetched) return
    addLog(`📋 Kraunamas tracklist: ${a.title}...`)
    const tracks = await fetchAlbumTracks(a.wikiTitle)
    setAlbums(p => p.map((al, i) => i === idx ? { ...al, tracks, fetched: true } : al))
    addLog(`  → ${tracks.length} dainos`)
  }

  const fetchAllTracks = async () => {
    for (let i = 0; i < albums.length; i++) {
      if (selected.has(i) && !albums[i].fetched) {
        await fetchTracks(i)
        await new Promise(r => setTimeout(r, 300)) // rate limit
      }
    }
  }

  const importSelected = async () => {
    setImporting(true)
    let ok = 0, fail = 0
    for (const idx of Array.from(selected).sort()) {
      const a = albums[idx]
      setAlbums(p => p.map((al, i) => i === idx ? { ...al, importing: true } : al))
      addLog(`⬆️ Importuojama: ${a.title}...`)
      try {
        const typeField = a.type === 'studio' ? 'type_studio'
          : a.type === 'ep' ? 'type_ep'
          : a.type === 'single' ? 'type_single'
          : a.type === 'compilation' ? 'type_compilation'
          : a.type === 'live' ? 'type_live' : 'type_studio'

        const payload = {
          title: a.title, artist_id: artistId,
          year: a.year || null,
          type_studio: typeField === 'type_studio',
          type_ep: typeField === 'type_ep',
          type_single: typeField === 'type_single',
          type_compilation: typeField === 'type_compilation',
          type_live: typeField === 'type_live',
          type_remix: false, type_covers: false, type_holiday: false,
          type_soundtrack: false, type_demo: false,
          tracks: (a.tracks || []).map((t, i) => ({
            title: t.title, sort_order: i + 1,
            duration: t.duration, type: 'normal', disc_number: 1,
          })),
        }

        const res = await fetch('/api/albums', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error((await res.json()).error)
        setAlbums(p => p.map((al, i) => i === idx ? { ...al, importing: false, imported: true } : al))
        addLog(`  ✅ Išsaugota (${a.tracks?.length || 0} dainų)`)
        ok++
      } catch (e: any) {
        setAlbums(p => p.map((al, i) => i === idx ? { ...al, importing: false, error: e.message } : al))
        addLog(`  ❌ Klaida: ${e.message}`)
        fail++
      }
      await new Promise(r => setTimeout(r, 200))
    }
    setImporting(false)
    addLog(`\n🏁 Baigta: ${ok} importuota, ${fail} klaida`)
  }

  const toggleSelect = (i: number) => setSelected(p => {
    const s = new Set(p)
    s.has(i) ? s.delete(i) : s.add(i)
    return s
  })

  const TYPE_LABELS: Record<string, string> = {
    studio: '🎵 Studijinis', ep: '🎼 EP', single: '🎤 Singlas',
    compilation: '📀 Kompiliacija', live: '🎸 Gyvas'
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="px-4 py-2 bg-purple-100 hover:bg-purple-200 text-purple-800 rounded-lg text-sm font-medium transition-colors">
        📀 Importuoti diskografiją
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => !importing && setOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-5 border-b">
              <h3 className="text-lg font-bold text-gray-900">📀 Diskografijos importas — {artistName}</h3>
              <button onClick={() => !importing && setOpen(false)} className="text-gray-400 hover:text-gray-700 text-2xl">×</button>
            </div>

            <div className="p-5 border-b flex gap-3">
              <input value={wikiTitle} onChange={e => setWikiTitle(e.target.value)}
                placeholder="Wikipedia pavadinimas..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-music-blue" />
              <button onClick={fetchDisc} disabled={loading}
                className="px-4 py-2 bg-music-blue text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90">
                {loading ? '⏳' : '🔍 Ieškoti'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {albums.length > 0 && (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex gap-2">
                      <button onClick={() => setSelected(new Set(albums.map((_,i)=>i)))}
                        className="text-xs text-music-blue hover:underline">Visi</button>
                      <button onClick={() => setSelected(new Set())}
                        className="text-xs text-gray-500 hover:underline">Joks</button>
                      <button onClick={fetchAllTracks} disabled={importing}
                        className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs font-medium disabled:opacity-50">
                        📋 Krauti visus tracklist'us
                      </button>
                    </div>
                    <span className="text-xs text-gray-500">{selected.size} pasirinkta</span>
                  </div>

                  <div className="space-y-2">
                    {albums.map((a, i) => (
                      <div key={i}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          selected.has(i) ? 'border-music-blue bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                        } ${a.imported ? 'opacity-60' : ''}`}
                        onClick={() => toggleSelect(i)}>
                        <input type="checkbox" checked={selected.has(i)} onChange={() => {}} className="accent-music-blue" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 text-sm truncate">{a.title}</span>
                            {a.year && <span className="text-xs text-gray-500">({a.year})</span>}
                            {a.imported && <span className="text-xs text-green-600 font-medium">✅ Importuota</span>}
                            {a.error && <span className="text-xs text-red-500">❌ {a.error}</span>}
                            {a.importing && <span className="text-xs text-blue-500">⏳...</span>}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-gray-400">{TYPE_LABELS[a.type]}</span>
                            {a.tracks !== undefined && (
                              <span className="text-xs text-purple-600">{a.tracks.length} dainų</span>
                            )}
                          </div>
                        </div>
                        <button type="button"
                          onClick={e => { e.stopPropagation(); fetchTracks(i) }}
                          disabled={a.fetched || importing}
                          className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded text-xs disabled:opacity-40">
                          {a.fetched ? '✓' : '📋'}
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {log.length > 0 && (
                <div className="mt-4 bg-gray-900 rounded-lg p-3 font-mono text-xs text-green-400 max-h-40 overflow-y-auto">
                  {log.map((l, i) => <div key={i}>{l}</div>)}
                </div>
              )}
            </div>

            <div className="p-4 border-t flex gap-3">
              <button onClick={importSelected} disabled={importing || selected.size === 0 || !albums.length}
                className="flex-1 py-3 bg-music-blue text-white font-bold rounded-xl hover:opacity-90 disabled:opacity-50">
                {importing ? '⏳ Importuojama...' : `⬆️ Importuoti ${selected.size} albumą(-ų)`}
              </button>
              <button onClick={() => !importing && setOpen(false)}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 disabled:opacity-50">
                Uždaryti
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
