// components/SongsPanel.tsx  — import į admin news page dešinę pusę
'use client'
import { useState, useEffect, useRef } from 'react'

type SongEntry = {
  id?: number
  song_id?: number | null
  title: string
  artist_name: string
  youtube_url: string
}

function ytId(url: string) {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
  return m ? m[1] : null
}

export function SongsPanel({ newsId, isNew }: { newsId: string | number; isNew: boolean }) {
  const [songs, setSongs] = useState<SongEntry[]>([])
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [searchRes, setSearchRes] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [manualTitle, setManualTitle] = useState('')
  const [manualArtist, setManualArtist] = useState('')
  const [manualYt, setManualYt] = useState('')
  const [manualOpen, setManualOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isNew) return
    fetch(`/api/news/${newsId}/songs`).then(r => r.json()).then(data => {
      if (Array.isArray(data)) setSongs(data.map((s: any) => ({
        id: s.id, song_id: s.song_id,
        title: s.song?.title || s.title || '',
        artist_name: s.song?.artist_name || s.artist_name || '',
        youtube_url: s.song?.youtube_url || s.youtube_url || '',
      })))
    }).finally(() => setLoading(false))
  }, [newsId, isNew])

  useEffect(() => {
    if (!searchQ.trim()) { setSearchRes([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const r = await fetch(`/api/songs?search=${encodeURIComponent(searchQ)}&limit=6`)
        const d = await r.json()
        setSearchRes(d.songs || d || [])
      } catch { setSearchRes([]) }
      setSearching(false)
    }, 280)
    return () => clearTimeout(t)
  }, [searchQ])

  useEffect(() => {
    const h = (e: MouseEvent) => { if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchRes([]) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const addFromDB = (s: any) => {
    if (songs.find(x => x.song_id === s.id)) return
    setSongs(p => [...p, { song_id: s.id, title: s.title, artist_name: s.artist_name, youtube_url: s.youtube_url || '' }])
    setSearchQ(''); setSearchRes([])
  }

  const addManual = () => {
    if (!manualTitle.trim() || !manualYt.trim()) return
    setSongs(p => [...p, { song_id: null, title: manualTitle.trim(), artist_name: manualArtist.trim(), youtube_url: manualYt.trim() }])
    setManualTitle(''); setManualArtist(''); setManualYt(''); setManualOpen(false)
  }

  const save = async () => {
    if (isNew) return
    setSaving(true)
    await fetch(`/api/news/${newsId}/songs`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(songs) })
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return <div className="flex items-center justify-center h-20"><div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="flex flex-col gap-3 p-3">

      {/* Save button */}
      {!isNew && (
        <button onClick={save} disabled={saving}
          className={`w-full py-1.5 rounded-lg text-xs font-bold transition-all ${saved ? 'bg-green-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'} disabled:opacity-50`}>
          {saving ? 'Saugoma...' : saved ? '✓ Išsaugota' : `Išsaugoti (${songs.length} dainų)`}
        </button>
      )}

      {/* DB Search */}
      <div ref={searchRef} className="relative">
        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Ieškoti DB</label>
        <input type="text" value={searchQ} onChange={e => setSearchQ(e.target.value)}
          placeholder="Daina, atlikėjas..."
          className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 placeholder:text-gray-300 focus:outline-none focus:border-blue-400" />
        {(searchRes.length > 0 || searching) && (
          <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
            {searching && <div className="px-3 py-2 text-xs text-gray-400">Ieškoma...</div>}
            {searchRes.map((s: any) => {
              const added = songs.some(x => x.song_id === s.id)
              const thumb = ytId(s.youtube_url || '')
              return (
                <button key={s.id} onClick={() => addFromDB(s)} disabled={added}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 transition-colors disabled:opacity-40">
                  {thumb
                    ? <img src={`https://img.youtube.com/vi/${thumb}/default.jpg`} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                    : <div className="w-8 h-8 rounded bg-gray-100 shrink-0 flex items-center justify-center text-[10px] text-gray-300">♪</div>
                  }
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-gray-800 truncate">{s.title}</div>
                    <div className="text-[10px] text-gray-400 truncate">{s.artist_name}</div>
                  </div>
                  {added && <span className="text-green-500 text-xs shrink-0">✓</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Manual */}
      <div>
        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">YouTube URL</label>
        {manualOpen ? (
          <div className="space-y-1.5 p-2.5 bg-gray-50 rounded-xl border border-gray-100">
            <input value={manualTitle} onChange={e => setManualTitle(e.target.value)} placeholder="Pavadinimas *"
              className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:border-blue-400" />
            <input value={manualArtist} onChange={e => setManualArtist(e.target.value)} placeholder="Atlikėjas"
              className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:border-blue-400" />
            <input value={manualYt} onChange={e => setManualYt(e.target.value)} placeholder="https://youtube.com/watch?v=... *"
              className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:border-blue-400" />
            {/* Preview */}
            {ytId(manualYt) && (
              <img src={`https://img.youtube.com/vi/${ytId(manualYt)}/mqdefault.jpg`} alt="" className="w-full rounded-lg object-cover h-20" />
            )}
            <div className="flex gap-1.5">
              <button onClick={addManual} disabled={!manualTitle.trim() || !manualYt.trim()}
                className="flex-1 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold disabled:opacity-40">
                + Pridėti
              </button>
              <button onClick={() => setManualOpen(false)} className="px-3 py-1.5 bg-gray-200 text-gray-600 rounded-lg text-xs font-bold">✕</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setManualOpen(true)}
            className="w-full py-2 border-2 border-dashed border-gray-200 rounded-xl text-xs font-bold text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-all">
            + Pridėti YouTube nuorodą
          </button>
        )}
      </div>

      {/* List */}
      {songs.length > 0 && (
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Priskirtos ({songs.length})</label>
          <div className="space-y-1.5">
            {songs.map((s, i) => {
              const thumb = ytId(s.youtube_url)
              return (
                <div key={i} className="flex items-center gap-2 p-2 bg-white border border-gray-100 rounded-xl group">
                  {/* drag handle — visual only */}
                  <span className="text-gray-200 text-xs cursor-grab select-none shrink-0">⠿</span>
                  {thumb
                    ? <img src={`https://img.youtube.com/vi/${thumb}/default.jpg`} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                    : <div className="w-10 h-10 rounded-lg bg-gray-100 shrink-0 flex items-center justify-center text-gray-300 text-sm">♪</div>
                  }
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-gray-800 truncate">{s.title}</div>
                    <div className="text-[10px] text-gray-400 truncate">{s.artist_name || '—'}</div>
                    {s.song_id && <span className="text-[9px] font-bold text-blue-400 bg-blue-50 px-1 rounded">DB</span>}
                  </div>
                  <button onClick={() => setSongs(p => p.filter((_, j) => j !== i))}
                    className="w-6 h-6 flex items-center justify-center text-gray-200 hover:text-red-400 transition-colors shrink-0 text-sm">✕</button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {isNew && <p className="text-[10px] text-gray-300 text-center">Pirma išsaugok naujieną</p>}
    </div>
  )
}
