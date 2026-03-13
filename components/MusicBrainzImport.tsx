'use client'

import { useState, useEffect } from 'react'
import { COUNTRIES } from '@/lib/constants'
import { type ArtistFormData } from './ArtistForm'

type Props = { onImport: (data: Partial<ArtistFormData>) => void; initialSearch?: string; initialMbData?: any; onBack?: () => void }

// Šalies kodas → lietuviškas pavadinimas
const MB_COUNTRY: Record<string, string> = {
  'LT':'Lietuva','LV':'Latvija','EE':'Estija','US':'JAV','GB':'Didžioji Britanija',
  'DE':'Vokietija','FR':'Prancūzija','SE':'Švedija','NO':'Norvegija','FI':'Suomija',
  'DK':'Danija','CA':'Kanada','AU':'Australija','RU':'Rusija','IT':'Italija',
  'ES':'Ispanija','NL':'Olandija','BE':'Belgija','CH':'Šveicarija','AT':'Austrija',
  'PL':'Lenkija','IE':'Airija','JP':'Japonija','KR':'Pietų Korėja','BR':'Brazilija',
  'MX':'Meksika','IS':'Islandija','PT':'Portugalija','GR':'Graikija','UA':'Ukraina',
  'CZ':'Čekija','RO':'Rumunija','BG':'Bulgarija','TR':'Turkija','IL':'Izraelis',
  'IN':'Indija','CN':'Kinija','NZ':'Naujoji Zelandija','AR':'Argentina',
}

const GENRE_RULES: [string, string[]][] = [
  ['Roko muzika',           ['rock','punk','metal','grunge','alternative','indie','shoegaze','post-rock','emo','hardcore']],
  ['Pop, R&B muzika',       ['pop','r&b','soul','funk','disco','dance-pop','electropop','synth-pop']],
  ['Elektroninė, šokių muzika', ['electronic','techno','house','trance','ambient','edm','drum and bass','dubstep','idm']],
  ["Hip-hop'o muzika",      ['hip hop','hip-hop','rap','trap','grime']],
  ['Sunkioji muzika',       ['heavy metal','death metal','black metal','thrash','doom','power metal']],
  ['Rimtoji muzika',        ['classical','opera','chamber','orchestral','jazz','blues']],
  ['Alternatyvioji muzika', ['alternative','folk','country','reggae','world']],
]

function mapGenreMB(tags: string[]): { genre: string; substyles: string[] } {
  const lower = tags.map(t => t.toLowerCase())
  let best = '', bestScore = 0
  for (const [g, kws] of GENRE_RULES) {
    const score = lower.reduce((a, t) => a + kws.reduce((s, kw) => s + (t === kw || t.includes(kw) ? 1 : 0), 0), 0)
    if (score > bestScore) { bestScore = score; best = g }
  }
  return { genre: best, substyles: [] }
}

async function fetchMBAvatar(mbid: string): Promise<string> {
  // Cover Art Archive
  try {
    const r = await fetch(`https://coverartarchive.org/artist/${mbid}`, { headers: { 'Accept': 'application/json' } })
    if (r.ok) {
      const d = await r.json()
      const img = d.images?.[0]?.thumbnails?.['250'] || d.images?.[0]?.image
      if (img) {
        const ir = await fetch('/api/fetch-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: img }) })
        if (ir.ok) { const dd = await ir.json(); return dd.url || img }
      }
    }
  } catch {}
  return ''
}

type MBResult = {
  id: string
  name: string
  type: string
  country: string
  area?: string
  'life-span'?: { begin?: string; end?: string; ended?: boolean }
  tags?: { name: string; count: number }[]
  relations?: any[]
  members?: { id: number | null; name: string; avatar: string }[]
  avatar: string
}

export default function MusicBrainzImport({ onImport, initialSearch, initialMbData, onBack }: Props) {
  const [query, setQuery] = useState(initialSearch || '')
  const [results, setResults] = useState<MBResult[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState('')
  const [preview, setPreview] = useState<MBResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (initialMbData) {
      handleSelectRaw(initialMbData)
      return
    }
    if (!initialSearch || initialSearch.trim().length < 2) return
    doSearch(initialSearch)
  }, [initialSearch, initialMbData])

  const doSearch = async (q: string) => {
    if (q.trim().length < 2) { setResults([]); setShowDropdown(false); return }
    try {
      const res = await fetch(
        `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(q)}&limit=10&fmt=json`,
        { headers: { 'User-Agent': 'music.lt/1.0 (admin)' } }
      )
      if (!res.ok) return
      const data = await res.json()
      const arr: MBResult[] = (data.artists || []).map((a: any) => ({
        id: a.id, name: a.name,
        type: a.type === 'Person' ? 'solo' : 'group',
        country: MB_COUNTRY[a.country || a.area?.['iso-3166-1-codes']?.[0]] || a.area?.name || '',
        'life-span': a['life-span'],
        tags: a.tags || [],
        avatar: '',
      }))
      setResults(arr)
      setShowDropdown(arr.length > 0)
    } catch {}
  }

  const handleInput = (val: string) => {
    setQuery(val)
    setError('')
    setPreview(null)
    clearTimeout((window as any).__mbTimer)
    ;(window as any).__mbTimer = setTimeout(() => doSearch(val), 350)
  }

  const handleSelectRaw = async (mbData: any) => {
    const r: MBResult = {
      id: mbData.id, name: mbData.name,
      type: mbData.type === 'Person' ? 'solo' : 'group',
      country: MB_COUNTRY[mbData.country || mbData.area?.['iso-3166-1-codes']?.[0]] || mbData.area?.name || '',
      'life-span': mbData['life-span'],
      tags: mbData.tags || [], avatar: '', members: [],
    }
    await handleSelect(r)
  }

  const handleSelect = async (r: MBResult) => {
    setShowDropdown(false)
    setQuery(r.name)
    setLoading(true)
    setStep('Kraunama iš MusicBrainz...')
    try {
      // Pilni duomenys su relations (nariai, URL)
      const full = await fetch(
        `https://musicbrainz.org/ws/2/artist/${r.id}?inc=tags+url-rels+artist-rels&fmt=json`,
        { headers: { 'User-Agent': 'music.lt/1.0 (admin)' } }
      ).then(x => x.json())

      setStep('Nuotrauka...')
      // Avatar iš Wikipedia per MB relation
      let avatar = ''
      const wpRel = full.relations?.find((rel: any) => rel.type === 'wikipedia' || rel.url?.resource?.includes('en.wikipedia'))
      const wpUrl: string = wpRel?.url?.resource || ''
      const wikiTitle = wpUrl ? decodeURIComponent(wpUrl.split('/wiki/')[1] || '') : ''
      if (wikiTitle) {
        try {
          const sumRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`)
          if (sumRes.ok) {
            const sum = await sumRes.json()
            const imgUrl = sum.thumbnail?.source
            if (imgUrl) {
              const ir = await fetch('/api/fetch-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: imgUrl }) })
              if (ir.ok) { const d = await ir.json(); avatar = d.url || imgUrl }
            }
          }
        } catch {}
      }

      // Socialiniai tinklai
      const urlMap: Record<string, string> = {}
      for (const rel of full.relations || []) {
        const url: string = rel.url?.resource || ''
        if (url.includes('facebook.com')) urlMap.facebook = url
        else if (url.includes('instagram.com')) urlMap.instagram = url
        else if (url.includes('open.spotify.com')) urlMap.spotify = url
        else if (url.includes('youtube.com')) urlMap.youtube = url
        else if (url.includes('soundcloud.com')) urlMap.soundcloud = url
        else if (url.includes('tiktok.com')) urlMap.tiktok = url
        else if (url.includes('bandcamp.com')) urlMap.bandcamp = url
        else if (url.includes('twitter.com') || url.includes('x.com')) urlMap.twitter = url
      }

      // Oficiali svetainė
      const officialRel = full.relations?.find((rel: any) =>
        rel.type === 'official homepage' && rel.url?.resource && !Object.values(urlMap).includes(rel.url.resource)
      )
      const website = officialRel?.url?.resource || ''

      // Žanrai
      const tags: string[] = (full.tags || []).sort((a: any, b: any) => b.count - a.count).slice(0, 8).map((t: any) => t.name)
      const { genre, substyles } = mapGenreMB(tags)

      // Šalis
      const countryCode = full.country || full.area?.['iso-3166-1-codes']?.[0]
      const country = MB_COUNTRY[countryCode] || ''

      // Veiklos metai
      const yearStart = full['life-span']?.begin?.slice(0, 4) || ''
      const yearEnd = full['life-span']?.ended ? (full['life-span']?.end?.slice(0, 4) || '') : ''

      // Nariai (grupės atveju)
      setStep('Nariai...')
      const memberRels = (full.relations || []).filter((rel: any) =>
        rel['target-type'] === 'artist' && (rel.type === 'member of band' || rel.type === 'artist')
        && rel.direction === 'backward'
      )
      const members: MBResult['members'] = []
      for (const rel of memberRels.slice(0, 12)) {
        const mName = rel.artist?.name || ''
        if (!mName) continue
        // Ieškome DB
        let dbId: number | null = null
        try {
          const dbRes = await fetch(`/api/artists?search=${encodeURIComponent(mName)}&limit=3`)
          if (dbRes.ok) {
            const dbData = await dbRes.json()
            const arr: any[] = Array.isArray(dbData) ? dbData : dbData?.artists || dbData?.data || []
            const match = arr.find((a: any) => a.name?.toLowerCase() === mName.toLowerCase())
            if (match) dbId = match.id
          }
        } catch {}
        members.push({ id: dbId, name: mName, avatar: dbId ? '' : '' })
      }

      const result: MBResult = {
        id: r.id, name: full.name || r.name,
        type: full.type === 'Person' ? 'solo' : 'group',
        country, 'life-span': full['life-span'],
        tags: full.tags || [], avatar, members,
        area: country,
        relations: full.relations,
      }
      Object.assign(result, { genre, substyles, yearStart, yearEnd, website, ...urlMap })
      setPreview(result)
    } catch (e: any) {
      setError(e.message || 'Klaida')
    }
    setStep('')
    setLoading(false)
  }

  const handleApply = () => {
    if (!preview) return
    const p = preview as any
    const memberList = (preview.members || []).map(m => ({
      id: m.id || null, name: m.name, avatar: m.avatar || '',
      yearFrom: '', yearTo: '',
    }))
    onImport({
      name: preview.name,
      type: preview.type === 'solo' ? 'solo' : 'group',
      country: preview.country && COUNTRIES.includes(preview.country) ? preview.country : '',
      yearStart: p.yearStart || '',
      yearEnd: p.yearEnd || '',
      genre: p.genre || '',
      substyles: p.substyles || [],
      avatar: preview.avatar || '',
      website: p.website || '',
      facebook: p.facebook || '', instagram: p.instagram || '',
      twitter: p.twitter || '', spotify: p.spotify || '',
      youtube: p.youtube || '', soundcloud: p.soundcloud || '',
      tiktok: p.tiktok || '', bandcamp: p.bandcamp || '',
      members: memberList as any,
    })
    setPreview(null)
    setQuery('')
    setResults([])
  }

  const p = preview as any
  const yearStart = p?.yearStart || preview?.['life-span']?.begin?.slice(0, 4) || ''
  const yearEnd = preview?.['life-span']?.ended ? (preview?.['life-span']?.end?.slice(0, 4) || '') : ''
  const topTags = (preview?.tags || []).sort((a: any, b: any) => b.count - a.count).slice(0, 5).map((t: any) => t.name)
  const foundSocials = preview ? ['facebook','instagram','twitter','spotify','youtube','soundcloud','tiktok','bandcamp'].filter(k => (preview as any)[k]) : []

  return (
    <div className="space-y-3">
      {/* Input */}
      <div className="flex gap-2 relative">
        <div className="flex-1 min-w-0 relative">
          <input
            type="text"
            value={query}
            onChange={e => handleInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { setShowDropdown(false); if (results[0]) handleSelect(results[0]) } if (e.key === 'Escape') setShowDropdown(false) }}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            onFocus={() => results.length > 0 && setShowDropdown(true)}
            placeholder="Atlikėjo pavadinimas..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
          />
          {showDropdown && results.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden" style={{ zIndex: 99999 }}>
              {results.map(r => (
                <button
                  key={r.id}
                  type="button"
                  onMouseDown={() => handleSelect(r)}
                  className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-0 flex items-start gap-2"
                >
                  <span className="mt-0.5 text-base leading-none shrink-0">{r.type === 'solo' ? '🎤' : '🎵'}</span>
                  <span className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-900">{r.name}</span>
                    {(r.country || r['life-span']?.begin) && (
                      <span className="text-xs text-gray-400 ml-2">
                        {r.country}{r.country && r['life-span']?.begin ? ' · ' : ''}{r['life-span']?.begin?.slice(0,4)}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => { setShowDropdown(false); if (results[0]) handleSelect(results[0]) }}
          disabled={loading || !query.trim()}
          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors whitespace-nowrap"
        >
          {loading ? step || '⏳' : 'MB Importuoti'}
        </button>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Preview */}
      {preview && (
        <div className="rounded-xl border border-gray-200 overflow-hidden bg-white text-sm">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
            {preview.avatar
              ? <img src={preview.avatar} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0 border border-gray-100" />
              : <div className="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center shrink-0 text-base">🎵</div>
            }
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-gray-900">{preview.name}</span>
              <span className="text-gray-400 text-xs ml-2">
                {preview.type === 'solo' ? 'Solo' : 'Grupė'}
                {preview.country ? ` · ${preview.country}` : ''}
                {yearStart ? ` · ${yearStart}${yearEnd ? `–${yearEnd}` : '–dabar'}` : ''}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {onBack && (
                <button type="button" onClick={onBack} className="px-2 py-1.5 text-gray-400 hover:text-gray-600 rounded-lg text-xs transition-colors">← Atgal</button>
              )}
              <button
                type="button"
                onClick={handleApply}
                className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                ✓ Importuoti
              </button>
            </div>
          </div>

          {/* Details */}
          <div className="px-4 py-2.5 border-b border-gray-100 space-y-1.5 text-xs">
            {topTags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {topTags.map(t => (
                  <span key={t} className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[11px]">{t}</span>
                ))}
              </div>
            )}
            {foundSocials.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {foundSocials.map(k => (
                  <a key={k} href={(preview as any)[k]} target="_blank" rel="noopener noreferrer"
                    className="px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded text-[11px] hover:bg-blue-100 transition-colors">
                    {k}
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Nariai */}
          {preview.members && preview.members.length > 0 && (
            <div className="px-4 py-2 border-b border-gray-100 text-xs">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {preview.members.map((m, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <span className={m.id ? 'text-green-600' : 'text-gray-700'}>{m.name}</span>
                    <span className={m.id ? 'text-green-400 text-[10px]' : 'text-amber-500 text-[10px]'}>{m.id ? '✓' : '+'}</span>
                  </span>
                ))}
                {preview.members.some(m => !m.id) && (
                  <span className="text-amber-500 ml-1">· trūkstami bus sukurti išsaugant</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
