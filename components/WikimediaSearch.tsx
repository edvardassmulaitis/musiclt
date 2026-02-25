'use client'

import { useState, useEffect, useRef } from 'react'
import { type Photo } from './PhotoGallery'

type WikiImage = {
  title: string        // File:Xxx.jpg
  thumb: string        // thumbnail URL
  fullUrl: string      // full resolution URL
  author: string       // extracted author
  license: string      // CC BY-SA etc
  width: number
  height: number
  descriptionUrl: string
}

// ── Parse author from raw wikitext ────────────────────────────────────────────
function parseAuthor(raw: string): string {
  if (!raw) return ''
  // Strip HTML tags
  let s = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  // Strip {{...}} templates
  s = s.replace(/\{\{[^}]*\}\}/g, '').trim()
  return s.slice(0, 80)
}

function parseLicense(templates: any[]): string {
  if (!templates?.length) return ''
  const names: string[] = templates.map((t: any) => (t.title || '').toLowerCase())
  if (names.some(n => n.includes('public domain') || n.includes('pd-'))) return 'Public Domain'
  if (names.some(n => n.includes('cc-zero') || n.includes('cc0'))) return 'CC0'
  if (names.some(n => n.includes('cc-by-sa-4'))) return 'CC BY-SA 4.0'
  if (names.some(n => n.includes('cc-by-sa-3'))) return 'CC BY-SA 3.0'
  if (names.some(n => n.includes('cc-by-sa-2'))) return 'CC BY-SA 2.0'
  if (names.some(n => n.includes('cc-by-4'))) return 'CC BY 4.0'
  if (names.some(n => n.includes('cc-by-3'))) return 'CC BY 3.0'
  if (names.some(n => n.includes('cc-by-2'))) return 'CC BY 2.0'
  if (names.some(n => n.includes('cc-by-sa'))) return 'CC BY-SA'
  if (names.some(n => n.includes('cc-by'))) return 'CC BY'
  if (names.some(n => n.includes('gfdl'))) return 'GFDL'
  return ''
}

function licenseColor(license: string) {
  if (!license) return 'bg-gray-100 text-gray-500'
  if (license === 'Public Domain' || license === 'CC0') return 'bg-green-100 text-green-700'
  if (license.startsWith('CC BY-SA')) return 'bg-yellow-100 text-yellow-700'
  if (license.startsWith('CC BY')) return 'bg-blue-100 text-blue-700'
  return 'bg-gray-100 text-gray-600'
}

// ── Wikimedia API calls ───────────────────────────────────────────────────────
async function searchImages(query: string, offset = 0): Promise<{ images: WikiImage[]; hasMore: boolean }> {
  const params = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: query,
    srnamespace: '6',
    srlimit: '20',
    sroffset: String(offset),
    format: 'json',
    origin: '*',
  })
  const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`)
  const data = await res.json()
  const results: any[] = data.query?.search || []
  const hasMore = !!data.continue

  if (!results.length) return { images: [], hasMore: false }

  // Batch fetch image info for all results
  const titles = results.map(r => r.title).join('|')
  const infoParams = new URLSearchParams({
    action: 'query',
    titles,
    prop: 'imageinfo|revisions',
    iiprop: 'url|size|extmetadata',
    iiurlwidth: '320',
    rvprop: 'content',
    format: 'json',
    origin: '*',
  })
  const infoRes = await fetch(`https://commons.wikimedia.org/w/api.php?${infoParams}`)
  const infoData = await infoRes.json()
  const pages: any[] = Object.values(infoData.query?.pages || {})

  const images: WikiImage[] = pages
    .filter(p => p.imageinfo?.[0]?.url)
    .map(p => {
      const info = p.imageinfo[0]
      const meta = info.extmetadata || {}
      const author = parseAuthor(meta.Artist?.value || meta.Author?.value || '')
      const licenseTemplates = meta.LicenseShortName?.value || meta.License?.value || ''
      const license = licenseTemplates.includes('CC') || licenseTemplates.includes('Public')
        ? licenseTemplates
        : parseLicense(meta.Templates?.value || [])
      return {
        title: p.title,
        thumb: info.thumburl || info.url,
        fullUrl: info.url,
        author,
        license: license || licenseTemplates || '',
        width: info.width || 0,
        height: info.height || 0,
        descriptionUrl: info.descriptionurl || '',
      }
    })
    // Filter out very small images and non-photos (svg, gif)
    .filter(img =>
      img.width > 200 &&
      !img.fullUrl.toLowerCase().endsWith('.svg') &&
      !img.fullUrl.toLowerCase().endsWith('.gif') &&
      !img.fullUrl.toLowerCase().endsWith('.png')  // most logos are PNG
    )

  return { images, hasMore }
}

// ── WikimediaSearch modal ─────────────────────────────────────────────────────
export default function WikimediaSearch({
  artistName,
  onAddMultiple,
  onClose,
}: {
  artistName: string
  onAddMultiple: (photos: Photo[]) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState(artistName)
  const [images, setImages] = useState<WikiImage[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [offset, setOffset] = useState(0)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)

  const search = async (q: string, reset = true) => {
    if (!q.trim()) return
    if (reset) { setLoading(true); setImages([]); setOffset(0) }
    else setLoadingMore(true)
    setError('')
    try {
      const off = reset ? 0 : offset
      const result = await searchImages(q, off)
      setImages(prev => reset ? result.images : [...prev, ...result.images])
      setHasMore(result.hasMore)
      setOffset(off + 20)
    } catch (e: any) {
      setError('Paieška nepavyko. Patikrinkite ryšį.')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  // Auto-search on open
  useEffect(() => {
    search(artistName)
    setTimeout(() => inputRef.current?.select(), 100)
  }, []) // eslint-disable-line

  const toggleSelect = (img: WikiImage) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(img.title) ? next.delete(img.title) : next.add(img.title)
      return next
    })
  }

  const handleAdd = async () => {
    const toAdd = images.filter(img => selected.has(img.title))
    if (!toAdd.length) return
    setLoading(true)
    setError('')
    const uploaded: Photo[] = []
    for (const img of toAdd) {
      const authorParts = [img.author, img.license].filter(Boolean)
      const authorStr = authorParts.join(' · ') || undefined
      try {
        // Upload through proxy with wikimedia referer hint
        const res = await fetch('/api/fetch-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // Use larger thumbnail (800px) — much faster than full res (can be 50MB+)
            url: img.thumb.replace('320px', '800px'),
            referer: 'https://en.wikipedia.org/',
          }),
        })
        if (res.ok) {
          const d = await res.json()
          // Only use proxy result if it looks like a valid stored URL
          if (d.url && (d.url.includes('supabase') || d.url.startsWith('/'))) {
            uploaded.push({ url: d.url, author: authorStr, authorUrl: img.descriptionUrl })
            continue
          }
        }
      } catch {}
      // Fallback: store directly (will use wikimedia URL — may expire)
      uploaded.push({ url: img.thumb, author: authorStr, authorUrl: img.descriptionUrl })
    }
    setLoading(false)
    onAddMultiple(uploaded)
    onClose()
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/60" style={{ zIndex: 10000 }}>
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col w-full" style={{ maxWidth: 760, maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-gray-800">🔍 Wikimedia Commons</span>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Laisvos licencijos nuotraukos</span>
          </div>
          <button type="button" onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1">✕</button>
        </div>

        {/* Search bar */}
        <div className="px-5 py-3 border-b border-gray-100 shrink-0">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); search(query) } }}
              placeholder="Ieškoti nuotraukų..."
              className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:border-music-blue bg-white"
            />
            <button type="button" onClick={() => search(query)}
              disabled={loading}
              className="px-4 py-2 bg-music-blue hover:opacity-90 text-white rounded-xl text-sm font-medium transition-opacity disabled:opacity-50">
              {loading ? '...' : 'Ieškoti'}
            </button>
          </div>
          {/* Quick suggestions */}
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {[artistName, `${artistName} music`, `${artistName} band`, `${artistName} concert`, `${artistName} live`].map(s => (
              <button key={s} type="button"
                onClick={() => { setQuery(s); search(s) }}
                className="text-xs px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full transition-colors">
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Results grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
              <div className="w-8 h-8 border-2 border-music-blue border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Ieškoma Wikimedia Commons...</span>
            </div>
          )}

          {!loading && error && (
            <div className="text-center py-12 text-red-500 text-sm">{error}</div>
          )}

          {!loading && !error && images.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <span className="text-3xl block mb-2">🔍</span>
              <p className="text-sm">Nieko nerasta. Bandykite kitą paieškos frazę.</p>
            </div>
          )}

          {images.length > 0 && (
            <>
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
                {images.map(img => {
                  const isSel = selected.has(img.title)
                  const isLandscape = img.width >= img.height
                  return (
                    <div
                      key={img.title}
                      onClick={() => toggleSelect(img)}
                      className={`relative rounded-xl overflow-hidden cursor-pointer border-2 transition-all group
                        ${isSel ? 'border-music-blue ring-2 ring-music-blue/30 scale-[0.98]' : 'border-gray-200 hover:border-gray-400'}`}
                      style={{ aspectRatio: isLandscape ? '3/2' : '2/3' }}
                    >
                      <img
                        src={img.thumb}
                        alt={img.title}
                        referrerPolicy="no-referrer"
                        className="absolute inset-0 w-full h-full object-cover"
                        loading="lazy"
                      />

                      {/* Selection checkmark */}
                      {isSel && (
                        <div className="absolute top-2 right-2 w-6 h-6 bg-music-blue rounded-full flex items-center justify-center shadow-md">
                          <span className="text-white text-xs font-bold">✓</span>
                        </div>
                      )}

                      {/* Bottom info overlay */}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent pt-6 pb-2 px-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {img.license && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${licenseColor(img.license)}`}>
                            {img.license}
                          </span>
                        )}
                        {img.author && (
                          <p className="text-white/80 text-xs mt-1 truncate">© {img.author}</p>
                        )}
                        <p className="text-white/50 text-xs mt-0.5">{img.width}×{img.height}</p>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Load more */}
              {hasMore && (
                <div className="flex justify-center mt-4">
                  <button type="button" onClick={() => search(query, false)} disabled={loadingMore}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
                    {loadingMore ? 'Kraunama...' : 'Rodyti daugiau'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 shrink-0 flex items-center justify-between bg-gray-50/80 rounded-b-2xl">
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {selected.size > 0
              ? <span className="font-medium text-gray-700">Pasirinkta: {selected.size}</span>
              : <span>Spustelėkite norėdami pasirinkti</span>
            }
            <span className="text-gray-300">·</span>
            <span>Šaltinis: <a href="https://commons.wikimedia.org" target="_blank" rel="noopener noreferrer"
              className="text-music-blue hover:underline">Wikimedia Commons</a></span>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-100 transition-colors">
              Atšaukti
            </button>
            <button type="button" onClick={handleAdd} disabled={selected.size === 0}
              className="px-4 py-1.5 bg-music-blue text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-40">
              + Pridėti {selected.size > 0 ? `(${selected.size})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
