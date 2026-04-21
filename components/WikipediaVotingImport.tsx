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
  songwriters?: string
  lyrics_url?: string
  youtube_url?: string
  photo_url?: string
  selected?: boolean
  error?: string
}

type Props = {
  eventId: number
  onDone: () => void
  onClose: () => void
}

// ===== Wikipedia helpers =====

async function fetchWikipedia(title: string): Promise<string | null> {
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&format=json&origin=*&redirects=1`
  try {
    const res = await fetch(url)
    const data = await res.json()
    return data?.parse?.wikitext?.['*'] || null
  } catch {
    return null
  }
}

/**
 * Ieško Wikipedia "Participants" lentelę Eurovision straipsniuose.
 * Formatas dažniausiai:
 *   {| class="wikitable ..."
 *   |-
 *   ! ... (headers: Country, Artist, Song, Songwriter(s), etc.)
 *   |-
 *   | {{flag|...}} [[Country]] || [[Artist]] || "[[Song]]" || Songwriter
 *   |-
 */
function parseEurovisionTable(wikitext: string): ParsedParticipant[] {
  const results: ParsedParticipant[] = []

  // Ieškom "Participants" section
  const sectionMatch = wikitext.match(/==\s*Participants?\s*==([\s\S]*?)(?===\s*[A-Z]|\Z)/i)
  const section = sectionMatch ? sectionMatch[1] : wikitext

  // Ieškom visų wikitables šioje sekcijoje
  const tableRegex = /\{\|\s*class="[^"]*wikitable[^"]*"([\s\S]*?)\|\}/g
  const tables: string[] = []
  let m
  while ((m = tableRegex.exec(section)) !== null) tables.push(m[1])

  for (const table of tables) {
    // Skaidom per |- (row separator)
    const rows = table.split(/\n\|-/)
    // Pirmas row = headers
    if (rows.length < 2) continue

    const headerRow = rows[0]
    const headers = headerRow
      .split('\n!')
      .map(h => cleanWikitext(h).toLowerCase().trim())
      .filter(Boolean)

    // Jei header'iai neturi "artist" ar "song" — praleidžiam (ne dalyvių lentelė)
    const hasArtist = headers.some(h => /artist|performer|act|representative/i.test(h))
    const hasSong = headers.some(h => /song|entry/i.test(h))
    const hasCountry = headers.some(h => /country|nation/i.test(h))
    if (!hasArtist || !hasSong) continue

    const countryIdx = headers.findIndex(h => /country|nation/i.test(h))
    const artistIdx = headers.findIndex(h => /artist|performer|act|representative/i.test(h))
    const songIdx = headers.findIndex(h => /^song|^entry/i.test(h))
    const swIdx = headers.findIndex(h => /songwriter|composer|lyricist/i.test(h))

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      // Cells separated by || or newline with |
      const cells = row
        .split(/\|\|\s*|\n\|(?!-)/)
        .map(c => c.trim())
        .filter(c => c.length && !/^(class|style|rowspan|colspan|align|scope)/i.test(c))

      if (cells.length < 2) continue

      const country = countryIdx >= 0 ? extractCountry(cells[countryIdx] || '') : undefined
      const artist = artistIdx >= 0 ? extractWikiLink(cells[artistIdx] || '') : ''
      const song = songIdx >= 0 ? extractSongTitle(cells[songIdx] || '') : ''
      const sw = swIdx >= 0 ? cleanWikitext(cells[swIdx] || '') : undefined

      if (!artist) continue
      if (artist.length < 2 || artist.length > 100) continue

      results.push({
        country,
        artist_name: artist,
        song_title: song,
        songwriters: sw,
        selected: true,
      })
    }
  }

  return results
}

/** Išima šalį iš {{flag|Country}} ar [[Country]] */
function extractCountry(s: string): string {
  const flag = s.match(/\{\{\s*flag(?:country)?\s*\|\s*([^}|]+)/i)
  if (flag) return flag[1].trim()
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
  return s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/\[\[[^\]|]*\|([^\]]+)\]\]/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ===== UI =====

export default function WikipediaVotingImport({ eventId, onDone, onClose }: Props) {
  const [url, setUrl] = useState('')
  const [parsing, setParsing] = useState(false)
  const [results, setResults] = useState<ParsedParticipant[]>([])
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [replaceExisting, setReplaceExisting] = useState(false)

  async function handleParse() {
    setError(null)
    setResults([])

    // Iš URL išgaunam straipsnio pavadinimą
    const m = url.match(/wikipedia\.org\/wiki\/([^#?]+)/)
    if (!m) return setError('Neatpažintas Wikipedia URL')
    const title = decodeURIComponent(m[1])

    setParsing(true)
    try {
      const wikitext = await fetchWikipedia(title)
      if (!wikitext) {
        setError('Nepavyko atsisiųsti Wikipedia puslapio')
        return
      }

      const parsed = parseEurovisionTable(wikitext)
      if (!parsed.length) {
        setError('Nerasta dalyvių lentelė. Įsitikink, kad URL yra tinkamas Eurovision/konkurso puslapis su „Participants" lentele.')
        return
      }

      setResults(parsed)
    } catch (e: any) {
      setError(e.message || 'Klaida parsinant Wikipedia')
    } finally {
      setParsing(false)
    }
  }

  async function handleImport() {
    const toImport = results.filter(r => r.selected)
    if (!toImport.length) return

    setImporting(true)
    try {
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
      if (!res.ok) {
        setError(`Importo klaida: ${data.error}`)
        setImporting(false)
        return
      }
      alert(`Sėkmingai importuota ${data.count} dalyvių`)
      onDone()
    } catch (e: any) {
      setError(e.message || 'Import klaida')
    } finally {
      setImporting(false)
    }
  }

  function toggle(idx: number) {
    setResults(prev => prev.map((p, i) => (i === idx ? { ...p, selected: !p.selected } : p)))
  }

  function toggleAll() {
    const allSelected = results.every(r => r.selected)
    setResults(prev => prev.map(p => ({ ...p, selected: !allSelected })))
  }

  const selectedCount = results.filter(r => r.selected).length

  const modal = (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b flex items-center justify-between">
          <h2 className="text-xl font-bold">Importas iš Wikipedia</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-black text-2xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4 overflow-auto">
          <div>
            <label className="text-sm text-gray-600">Wikipedia puslapio URL</label>
            <div className="flex gap-2 mt-1">
              <input
                type="text"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://en.wikipedia.org/wiki/Eurovision_Song_Contest_2026"
                className="flex-1 px-3 py-2 border rounded"
              />
              <button
                onClick={handleParse}
                disabled={parsing || !url}
                className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50 text-sm font-medium"
              >
                {parsing ? 'Parsinama…' : 'Parsinti'}
              </button>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Tinka Eurovision, MAMA ir panašūs straipsniai, kur yra „Participants" lentelė su atlikėjais ir dainomis.
            </div>
          </div>

          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}

          {results.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  Rasta <strong>{results.length}</strong> dalyvių, pažymėta <strong>{selectedCount}</strong>
                </div>
                <button onClick={toggleAll} className="text-sm text-orange-600 hover:underline">
                  {results.every(r => r.selected) ? 'Atžymėti visus' : 'Pažymėti visus'}
                </button>
              </div>

              <div className="border rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="p-2 w-8"></th>
                      <th className="p-2 text-left">Šalis</th>
                      <th className="p-2 text-left">Atlikėjas</th>
                      <th className="p-2 text-left">Daina</th>
                      <th className="p-2 text-left">Autoriai</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i} className={`border-t ${r.selected ? '' : 'opacity-40'}`}>
                        <td className="p-2">
                          <input type="checkbox" checked={r.selected} onChange={() => toggle(i)} />
                        </td>
                        <td className="p-2">{r.country}</td>
                        <td className="p-2 font-medium">{r.artist_name}</td>
                        <td className="p-2">{r.song_title}</td>
                        <td className="p-2 text-xs text-gray-500">{r.songwriters}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={replaceExisting}
                  onChange={e => setReplaceExisting(e.target.checked)}
                />
                Pakeisti esamus dalyvius (ištrinti senus prieš įdedant naujus)
              </label>
            </>
          )}
        </div>

        {results.length > 0 && (
          <div className="p-5 border-t flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 border rounded">Atšaukti</button>
            <button
              onClick={handleImport}
              disabled={importing || selectedCount === 0}
              className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50 font-medium"
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
