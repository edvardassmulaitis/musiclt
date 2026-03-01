'use client'
// components/SongsPanel.tsx

import { useEffect, useState, useRef } from 'react'

type SongEntry = {
  id?: number
  song_id?: number | null
  title: string
  artist_name: string
  youtube_url: string
}

type YTResult = { videoId: string; title: string; channel: string; thumbnail: string }

function ytId(url: string) {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
  return m ? m[1] : null
}

function YouTubeSearch({ initialQuery, onSelect }: { initialQuery: string; onSelect: (url: string) => void }) {
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<YTResult[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { setQuery(initialQuery) }, [initialQuery])

  const search = async () => {
    if (!query.trim()) return
    setLoading(true); setResults([])
    try {
      const res = await fetch(`/api/search/youtube?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      setResults(data.results || [])
    } finally { setLoading(false) }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <input value={query} onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Ieškoti YouTube..."
          className="flex-1 px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:border-red-400" />
        <button type="button" onClick={search} disabled={loading}
          className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-bold disabled:opacity-50 transition-colors shrink-0 flex items-center justify-center" style={{ minWidth: 36 }}>
          {loading
            ? <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          }
        </button>
      </div>
      {results.length > 0 && (
        <div className="rounded-xl border border-gray-100 overflow-hidden">
          {results.map(r => (
            <div key={r.videoId}
              onClick={() => { onSelect(`https://www.youtube.com/watch?v=${r.videoId}`); setResults([]) }}
              className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0">
              <img src={r.thumbnail} alt="" className="w-12 h-8 object-cover rounded shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-900 line-clamp-1">{r.title}</p>
                <p className="text-xs text-gray-400 truncate">{r.channel}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function SongsPanel({ newsId, isNew }: { newsId: string | number; isNew: boolean }) {
  const [songs, setSongs] = useState<SongEntry[]>([])
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // DB tracks search
  const [searchQ, setSearchQ] = useState('')
  const [searchRes, setSearchRes] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  // Manual / YouTube add
  const [manualOpen, setManualOpen] = useState(false)
  const [manualTitle, setManualTitle] = useState('')
  const [manualArtist, setManualArtist] = useState('')
  const [manualYt, setManualYt] = useState('')
  const [ytSearchQuery, setYtSearchQuery] = useState('')

  // Load existing songs
  useEffect(() => {
    if (isNew) { setLoading(false); return }
    fetch(`/api/news/${newsId}/songs`).then(r => r.json()).then(data => {
      if (Array.isArray(data)) setSongs(data.map((s: any) => ({
        id: s.id,
        song_id: s.song_id,
        title: s.song?.title || s.title || '',
        artist_name: s.song?.artist_name || s.artist_name || '',
        youtube_url: s.song?.youtube_url || s.song?.video_url || s.youtube_url || '',
      })))
    }).finally(() => setLoading(false))
  }, [newsId, isNew])

  // DB tracks search – uses /api/tracks with ?search=
  useEffect(() => {
    if (!searchQ.trim()) { setSearchRes([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const r = await fetch(`/api/tracks?search=${encodeURIComponent(searchQ)}&limit=6`)
        const d = await r.json()
        setSearchRes(d.tracks || [])
      } catch { setSearchRes([]) }
      setSearching(false)
    }, 280)
    return () => clearTimeout(t)
  }, [searchQ])

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchRes([])
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const addFromDB = (track: any) => {
    if (songs.find(x => x.song_id === track.id)) return
    setSongs(p => [...p, {
      song_id: track.id,
      title: track.title,
      artist_name: track.artist_name || track.artists?.name || '',
      youtube_url: track.video_url || '',
    }])
    setSearchQ(''); setSearchRes([])
  }

  const addManual = (url: string) => {
    if (!manualTitle.trim() || !url.trim()) return
    setSongs(p => [...p, {
      song_id: null,
      title: manualTitle.trim(),
      artist_name: manualArtist.trim(),
      youtube_url: url.trim(),
    }])
    setManualTitle(''); setManualArtist(''); setManualYt(''); setManualOpen(false); setYtSearchQuery('')
  }

  const save = async () => {
    if (isNew) return
    setSaving(true)
    await fetch(`/api/news/${newsId}/songs`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(songs),
    })
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-16">
      <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="p-3 space-y-3">

      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
          Susijusi muzika{songs.length > 0 && ` · ${songs.length}`}
        </span>
        {!isNew && songs.length > 0 && (
          <button onClick={save} disabled={saving}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all disabled:opacity-50 ${saved ? 'bg-green-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
            {saving ? '...' : saved ? '✓ Išsaugota' : 'Išsaugoti'}
          </button>
        )}
      </div>

      {/* Songs list */}
      {songs.length > 0 && (
        <div className="space-y-1.5">
          {songs.map((s, i) => {
            const vid = ytId(s.youtube_url)
            return (
              <div key={i} className="flex items-center gap-2 p-2 bg-white border border-gray-100 rounded-xl">
                {vid
                  ? <img src={`https://img.youtube.com/vi/${vid}/default.jpg`} alt=""
                      className="w-10 h-10 rounded-lg object-cover shrink-0" />
                  : <div className="w-10 h-10 rounded-lg bg-gray-100 shrink-0 flex items-center justify-center text-gray-300 text-lg">♪</div>
                }
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-gray-800 truncate">{s.title}</div>
                  <div className="text-[10px] text-gray-400 truncate">{s.artist_name || '—'}</div>
                </div>
                {s.song_id && (
                  <span className="text-[9px] font-bold text-blue-400 bg-blue-50 px-1.5 py-0.5 rounded shrink-0">DB</span>
                )}
                <button onClick={() => setSongs(p => p.filter((_, j) => j !== i))}
                  className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-400 transition-colors shrink-0 text-sm">✕</button>
              </div>
            )
          })}
        </div>
      )}

      {/* DB Search */}
      <div ref={searchRef} className="relative">
        <input type="text" value={searchQ} onChange={e => setSearchQ(e.target.value)}
          placeholder="🔍 Ieškoti dainų duomenų bazėje..."
          className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none focus:border-blue-400" />
        {(searchRes.length > 0 || searching) && (
          <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
            {searching && <div className="px-3 py-2 text-xs text-gray-400">Ieškoma...</div>}
            {searchRes.map((track: any) => {
              const added = songs.some(x => x.song_id === track.id)
              const vid = ytId(track.video_url || '')
              return (
                <button key={track.id} onClick={() => addFromDB(track)} disabled={added}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 transition-colors disabled:opacity-40 border-b border-gray-50 last:border-0">
                  {vid
                    ? <img src={`https://img.youtube.com/vi/${vid}/default.jpg`} alt=""
                        className="w-8 h-8 rounded object-cover shrink-0" />
                    : <div className="w-8 h-8 rounded bg-gray-100 shrink-0 flex items-center justify-center text-[10px] text-gray-300">♪</div>
                  }
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-gray-800 truncate">{track.title}</div>
                    <div className="text-[10px] text-gray-400 truncate">{track.artist_name || track.artists?.name}</div>
                  </div>
                  {added && <span className="text-green-500 text-xs shrink-0">✓</span>}
                  {!added && vid && <svg className="w-3 h-3 text-red-400 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Manual add with YouTube search */}
      {manualOpen ? (
        <div className="space-y-2 p-2.5 bg-gray-50 rounded-xl border border-gray-100">
          <div className="grid grid-cols-2 gap-1.5">
            <input value={manualTitle} onChange={e => {
              setManualTitle(e.target.value)
              if (!ytSearchQuery) setYtSearchQuery(e.target.value)
            }}
              placeholder="Dainos pavadinimas *"
              className="px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:border-blue-400" />
            <input value={manualArtist} onChange={e => setManualArtist(e.target.value)}
              placeholder="Atlikėjas"
              className="px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:border-blue-400" />
          </div>

          {/* YouTube search */}
          <YouTubeSearch
            initialQuery={ytSearchQuery}
            onSelect={url => {
              setManualYt(url)
            }}
          />

          {/* Selected video preview */}
          {manualYt && ytId(manualYt) && (
            <div className="relative rounded-lg overflow-hidden">
              <img src={`https://img.youtube.com/vi/${ytId(manualYt)}/mqdefault.jpg`} alt=""
                className="w-full h-20 object-cover rounded-lg" />
              <button onClick={() => setManualYt('')}
                className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-500 transition-colors">✕</button>
            </div>
          )}

          {/* Or paste URL manually */}
          {!manualYt && (
            <input value={manualYt} onChange={e => setManualYt(e.target.value)}
              placeholder="arba įklijuoti YouTube URL..."
              className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:border-blue-400" />
          )}

          <div className="flex gap-1.5">
            <button onClick={() => addManual(manualYt)}
              disabled={!manualTitle.trim() || !manualYt.trim()}
              className="flex-1 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold disabled:opacity-40 transition-colors">
              + Pridėti dainą
            </button>
            <button onClick={() => { setManualOpen(false); setManualTitle(''); setManualArtist(''); setManualYt(''); setYtSearchQuery('') }}
              className="px-3 py-1.5 bg-gray-200 text-gray-600 rounded-lg text-xs font-bold">✕</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setManualOpen(true)}
          className="w-full py-2 border-2 border-dashed border-gray-200 rounded-xl text-xs font-bold text-gray-400 hover:border-red-300 hover:text-red-400 transition-all flex items-center justify-center gap-1.5">
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
          Pridėti YouTube video
        </button>
      )}

      {/* Auto-save hint */}
      {!isNew && songs.length > 0 && (
        <p className="text-[10px] text-gray-300 text-center">Nepamirška išsaugoti dainas</p>
      )}
      {isNew && (
        <p className="text-[10px] text-gray-300 text-center">Pirma išsaugok naujieną</p>
      )}
    </div>
  )
}
