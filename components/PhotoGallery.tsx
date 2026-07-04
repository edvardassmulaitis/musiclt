'use client'

import { useState, useRef } from 'react'
import WikimediaSearch from './WikimediaSearch'
import { proxyImg } from '@/lib/img-proxy'

export type Photo = {
  id?: number
  url: string
  caption?: string
  author?: string
  authorUrl?: string
  sourceUrl?: string
  license?: string
  /** Data — gali būti YYYY, YYYY-MM, arba YYYY-MM-DD. UI input'as priimą bet
   *  kokią iš šių formų; API parse'ina ir saugo kaip ISO YYYY-MM-DD. */
  takenAt?: string
  /** Optional vieta — venue arba miestas. */
  place?: string
  is_active?: boolean
  sort_order?: number
}

type LogEntry = { time: string; msg: string; ok: boolean }

type Props = {
  photos: Photo[]
  onChange: (photos: Photo[]) => void
  artistName?: string
  artistId?: string | number
}

export default function PhotoGallery({ photos, onChange, artistName, artistId }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [showWikimedia, setShowWikimedia] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  // Photo edit modal — atidaromas paspaudus ant nuotraukos cardo arba ©.
  // Leidžia rankiniu būdu suvesti metus / autorių / licenciją / source URL
  // kai Wikimedia DateTimeOriginal metadata trūksta arba nori override'inti.
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<Photo | null>(null)
  const openEditor = (i: number) => {
    setEditingIdx(i)
    setEditDraft({ ...photos[i] })
  }
  const closeEditor = () => {
    setEditingIdx(null)
    setEditDraft(null)
  }
  const saveEditor = () => {
    if (editingIdx === null || !editDraft) return
    const next = [...photos]
    next[editingIdx] = { ...editDraft }
    update(next)
    closeEditor()
  }

  const log = (msg: string, ok = true) => {
    const time = new Date().toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setLogs(prev => [...prev.slice(-19), { time, msg, ok }])
  }

  const saveToDb = async (newPhotos: Photo[]) => {
    if (!artistId) { log('⚠️ artistId nėra — negalima išsaugoti', false); return }
    log(`💾 Saugoma ${newPhotos.length} nuotr. → /api/artists/${artistId}/photos`)
    try {
      const res = await fetch(`/api/artists/${artistId}/photos`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photos: newPhotos }),
      })
      const data = await res.json()
      if (!res.ok) {
        log(`❌ Klaida: ${data.error}`, false)
        setError(`Išsaugoti nepavyko: ${data.error}`)
      } else {
        log(`✅ Išsaugota: ${data.saved} nuotr. (status ${res.status})`)
      }
    } catch (e: any) {
      log(`❌ Fetch klaida: ${e.message}`, false)
      setError(`Klaida: ${e.message}`)
    }
  }

  const update = (newPhotos: Photo[]) => {
    log(`🔄 update() — ${newPhotos.length} nuotr.`)
    onChange(newPhotos)
    saveToDb(newPhotos)
  }

  const uploadFile = async (file: File): Promise<string> => {
    log(`📤 Įkeliama: ${file.name} (${Math.round(file.size/1024)}KB)`)
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/upload', { method: 'POST', body: fd })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Upload nepavyko')
    log(`✅ Upload OK: ${data.url.slice(-30)}`)
    return data.url
  }

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (!imageFiles.length) return
    setUploading(true); setError('')
    log(`📁 Pasirinkti ${imageFiles.length} failai`)
    try {
      const urls = await Promise.all(imageFiles.map(uploadFile))
      const newPhotos = [...photos, ...urls.map(url => ({ url }))]
      log(`📸 Gauti ${urls.length} URL, iš viso: ${newPhotos.length}`)
      update(newPhotos)
    } catch (e: any) {
      log(`❌ ${e.message}`, false)
      setError(e.message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleAddUrl = async () => {
    const url = urlInput.trim()
    if (!url) return
    setUploading(true); setError('')
    log(`🔗 URL: ${url.slice(0, 50)}...`)
    try {
      const res = await fetch('/api/fetch-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error || 'Nepavyko')
      if (data.url.startsWith('data:')) throw new Error('Gavo data: URL — negalima išsaugoti')
      log(`✅ fetch-image OK: ${data.url.slice(-30)}`)
      update([...photos, { url: data.url, authorUrl: url }])
      setUrlInput('')
      setShowUrlInput(false)
    } catch (e: any) {
      log(`❌ ${e.message}`, false)
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  const removePhoto = (index: number) => {
    log(`🗑️ Šalinama nuotr. #${index}`)
    update(photos.filter((_, i) => i !== index))
  }

  const moveLeft = (index: number) => {
    if (index === 0) return
    const next = [...photos];
    [next[index - 1], next[index]] = [next[index], next[index - 1]]
    update(next)
  }

  const moveRight = (index: number) => {
    if (index === photos.length - 1) return
    const next = [...photos];
    [next[index], next[index + 1]] = [next[index + 1], next[index]]
    update(next)
  }

  return (
    <div className="space-y-4">

      {/* Photo grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {photos.map((photo, i) => {
            const year = photo.takenAt ? new Date(photo.takenAt).getFullYear() : null
            return (
              <div key={`${photo.url}-${i}`} className="relative group aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
                <img src={proxyImg(photo.url)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                {/* Year badge — top-left, kad iškart matytum ar metai užfiksuoti */}
                {year && (
                  <div className="absolute left-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-bold text-white backdrop-blur-sm pointer-events-none">
                    {year}
                  </div>
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-1.5">
                  <div className="flex justify-between gap-1">
                    <button type="button" onClick={() => moveLeft(i)} disabled={i === 0}
                      className="w-6 h-6 rounded bg-white/20 hover:bg-white/40 text-white text-xs disabled:opacity-30 flex items-center justify-center">←</button>
                    {/* Edit icon — atidaro detail modal'ą su date/author/license fields */}
                    <button type="button" onClick={() => openEditor(i)} title="Redaguoti detales"
                      className="w-6 h-6 rounded bg-white/20 hover:bg-blue-500 text-white text-xs flex items-center justify-center">✎</button>
                    <button type="button" onClick={() => moveRight(i)} disabled={i === photos.length - 1}
                      className="w-6 h-6 rounded bg-white/20 hover:bg-white/40 text-white text-xs disabled:opacity-30 flex items-center justify-center">→</button>
                  </div>
                  <div className="flex justify-center">
                    <button type="button" onClick={() => removePhoto(i)}
                      className="px-2 py-0.5 rounded bg-red-500/80 hover:bg-red-600 text-white text-xs font-medium">Ištrinti</button>
                  </div>
                </div>
                {/* © overlay — click'as atidaro edit modal'ą (anksciau buvo nieko nedarantis tekstas) */}
                <button
                  type="button"
                  onClick={() => openEditor(i)}
                  title="Redaguoti autorių/datą/licenciją"
                  className="absolute bottom-0 left-0 right-0 px-1.5 py-0.5 bg-black/40 hover:bg-black/70 text-white text-[11px] truncate text-left cursor-pointer transition-colors"
                >
                  © {photo.author || 'Be autoriaus — paspausk redaguoti'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Drop zone */}
      <div
        className="border-2 border-dashed border-gray-200 rounded-xl p-6 flex flex-col items-center gap-2 cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
        onClick={() => !uploading && fileRef.current?.click()}
        onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
        onDragOver={e => e.preventDefault()}
      >
        {uploading
          ? <><span className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /><span className="text-sm text-gray-400">Įkeliama...</span></>
          : <><span className="text-2xl">{photos.length === 0 ? '🖼️' : '+'}</span><span className="text-sm text-gray-400">{photos.length === 0 ? 'Įkelti nuotraukas' : 'Pridėti daugiau'}</span></>
        }
      </div>

      {error && (
        <p className="text-sm text-red-500 flex items-center gap-1">
          ⚠️ {error}
          <button type="button" onClick={() => setError('')} className="ml-1 text-xs">✕</button>
        </p>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        <button type="button" onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition-colors">
          📁 Įkelti failus
        </button>
        <button type="button" onClick={() => setShowWikimedia(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-xs font-medium transition-colors">
          🔍 Wikimedia
        </button>
        <button type="button" onClick={() => setShowUrlInput(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-medium transition-colors">
          🔗 Pridėti URL
        </button>
      </div>

      {/* URL input */}
      {showUrlInput && (
        <div className="flex gap-2">
          <input type="text" value={urlInput} onChange={e => setUrlInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddUrl() } if (e.key === 'Escape') { setShowUrlInput(false); setUrlInput('') } }}
            placeholder="https://..." autoFocus
            className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-400 bg-white" />
          <button type="button" onClick={handleAddUrl} disabled={uploading}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {uploading ? '...' : 'Pridėti'}
          </button>
          <button type="button" onClick={() => { setShowUrlInput(false); setUrlInput('') }}
            className="px-2 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200">✕</button>
        </div>
      )}

      {/* Debug log panel */}
      {logs.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200 bg-gray-100">
            <span className="text-xs font-bold text-gray-500">🔍 Debug log</span>
            <button type="button" onClick={() => setLogs([])} className="text-xs text-gray-400 hover:text-gray-600">Išvalyti</button>
          </div>
          <div className="p-2 space-y-0.5 max-h-48 overflow-y-auto font-mono">
            {logs.map((l, i) => (
              <div key={i} className={`text-xs flex gap-2 ${l.ok ? 'text-gray-700' : 'text-red-600'}`}>
                <span className="text-gray-400 shrink-0">{l.time}</span>
                <span>{l.msg}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Wikimedia */}
      {showWikimedia && (
        <WikimediaSearch
          artistName={artistName || ''}
          onAddMultiple={newPhotos => {
            const existingUrls = new Set(photos.map(p => p.url))
            const fresh = newPhotos.filter(p => !existingUrls.has(p.url))
            if (fresh.length) update([...photos, ...fresh])
            setShowWikimedia(false)
          }}
          onClose={() => setShowWikimedia(false)}
        />
      )}

      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />

      {/* Photo edit modal — leidžia rankiniu būdu suvesti taken_at, author,
          license, sourceUrl. Naudinga, kai Wikimedia DateTimeOriginal
          metadata trūksta (Britney atvejis), arba norit nustatyti per
          admin (anksčiau jokio UI nebuvo). */}
      {editingIdx !== null && editDraft && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) closeEditor() }}
        >
          <div className="w-full max-w-[500px] rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
              <div className="text-[15px] font-bold text-gray-900">Redaguoti nuotraukos detales</div>
              <button onClick={closeEditor} className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700">✕</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              {/* Preview thumbnail */}
              <div className="aspect-video w-full overflow-hidden rounded-lg bg-gray-100">
                <img src={proxyImg(editDraft.url)} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              </div>
              {/* takenAt — fleksibilus text input (YYYY / YYYY-MM / YYYY-MM-DD).
                  Anksciau buvo input[type=date] kuris reikalavo pilnos datos —
                  daug fotografų tik metus žino. API parse'ina į ISO automatiškai. */}
              <div>
                <label className="text-[12px] font-bold uppercase tracking-wider text-gray-500 block mb-1">Nuotraukos data</label>
                <input
                  type="text"
                  value={(editDraft.takenAt || '').slice(0, 10)}
                  onChange={(e) => setEditDraft({ ...editDraft, takenAt: e.target.value || undefined })}
                  placeholder="2016 ARBA 2016-09 ARBA 2016-09-27"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[14px] outline-none focus:border-blue-400"
                />
                <div className="text-[11px] text-gray-400 mt-0.5">Tik metai, metai+mėnuo arba pilna data. Galerijoje bus rodomi metai.</div>
              </div>
              {/* Place — NEW */}
              <div>
                <label className="text-[12px] font-bold uppercase tracking-wider text-gray-500 block mb-1">Vieta (optional)</label>
                <input
                  type="text"
                  value={editDraft.place || ''}
                  onChange={(e) => setEditDraft({ ...editDraft, place: e.target.value })}
                  placeholder="Pvz., Roundhouse, London"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[14px] outline-none focus:border-blue-400"
                />
              </div>
              {/* Author */}
              <div>
                <label className="text-[12px] font-bold uppercase tracking-wider text-gray-500 block mb-1">Autorius</label>
                <input
                  type="text"
                  value={editDraft.author || ''}
                  onChange={(e) => setEditDraft({ ...editDraft, author: e.target.value })}
                  placeholder="Pvz., John Doe"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[14px] outline-none focus:border-blue-400"
                />
              </div>
              {/* License */}
              <div>
                <label className="text-[12px] font-bold uppercase tracking-wider text-gray-500 block mb-1">Licencija</label>
                <input
                  type="text"
                  value={editDraft.license || ''}
                  onChange={(e) => setEditDraft({ ...editDraft, license: e.target.value })}
                  placeholder="Pvz., CC BY-SA 4.0"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[14px] outline-none focus:border-blue-400"
                />
              </div>
              {/* Source URL */}
              <div>
                <label className="text-[12px] font-bold uppercase tracking-wider text-gray-500 block mb-1">Šaltinis (URL)</label>
                <input
                  type="url"
                  value={editDraft.sourceUrl || ''}
                  onChange={(e) => setEditDraft({ ...editDraft, sourceUrl: e.target.value })}
                  placeholder="https://commons.wikimedia.org/wiki/File:..."
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[14px] outline-none focus:border-blue-400"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3 bg-gray-50">
              <button onClick={closeEditor} className="px-3 py-1.5 rounded-lg text-[14px] font-medium text-gray-600 hover:bg-gray-100">Atšaukti</button>
              <button onClick={saveEditor} className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-[14px] font-medium hover:bg-blue-700">Išsaugoti</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
