'use client'

import { useRef, useState } from 'react'

export type Photo = { src: string; author: string }

type Props = {
  photos: Photo[]
  onChange: (photos: Photo[]) => void
}

export default function PhotoGallery({ photos, onChange }: Props) {
  const [urlMode, setUrlMode] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [urlAuthor, setUrlAuthor] = useState('')
  const [uploading, setUploading] = useState(false)
  const [editAuthor, setEditAuthor] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploading(true)
    Promise.all(files.map(file => new Promise<string>(resolve => {
      const reader = new FileReader()
      reader.onload = ev => resolve(ev.target?.result as string)
      reader.readAsDataURL(file)
    }))).then(srcs => {
      onChange([...photos, ...srcs.map(src => ({ src, author: '' }))])
      setUploading(false)
    })
    e.target.value = ''
  }

  const addUrl = async () => {
    if (!urlInput.trim()) return
    const rawUrl = urlInput.trim()
    setUploading(true)
    let finalSrc = rawUrl
    if (rawUrl.startsWith('http')) {
      try {
        const res = await fetch('/api/fetch-image', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: rawUrl }),
        })
        if (res.ok) { const { dataUrl } = await res.json(); if (dataUrl) finalSrc = dataUrl }
      } catch {}
    }
    setUploading(false)
    onChange([...photos, { src: finalSrc, author: urlAuthor.trim() }])
    setUrlInput(''); setUrlAuthor(''); setUrlMode(false)
  }

  const remove = (i: number) => onChange(photos.filter((_, idx) => idx !== i))
  const moveLeft = (i: number) => {
    if (i === 0) return
    const p = [...photos]; [p[i-1], p[i]] = [p[i], p[i-1]]; onChange(p)
  }
  const moveRight = (i: number) => {
    if (i === photos.length - 1) return
    const p = [...photos]; [p[i+1], p[i]] = [p[i], p[i+1]]; onChange(p)
  }
  const updateAuthor = (i: number, author: string) => {
    const p = [...photos]; p[i] = { ...p[i], author }; onChange(p)
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-3">
        🖼️ Nuotraukų galerija
        {photos.length > 0 && <span className="text-gray-400 font-normal ml-1">({photos.length})</span>}
      </label>

      {/* Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
        {photos.map((photo, i) => (
          <div key={i} className="relative group rounded-lg overflow-hidden bg-gray-100">
            <div className="aspect-[4/3]">
              <img src={photo.src} alt={`foto ${i+1}`} className="w-full h-full object-cover" />
            </div>
            {/* Author badge */}
            {photo.author && (
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 text-white text-xs truncate">
                © {photo.author}
              </div>
            )}
            {/* Index */}
            <div className="absolute top-1.5 left-1.5 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center text-white text-xs font-bold">
              {i + 1}
            </div>
            {/* Overlay on hover */}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 p-2">
              <div className="flex gap-1">
                <button type="button" onClick={() => moveLeft(i)} disabled={i === 0}
                  className="px-2 py-1 bg-white/20 hover:bg-white/40 rounded text-white text-xs disabled:opacity-30">←</button>
                <button type="button" onClick={() => moveRight(i)} disabled={i === photos.length - 1}
                  className="px-2 py-1 bg-white/20 hover:bg-white/40 rounded text-white text-xs disabled:opacity-30">→</button>
              </div>
              <button type="button" onClick={() => setEditAuthor(editAuthor === i ? null : i)}
                className="px-3 py-1 bg-blue-500/80 hover:bg-blue-600 rounded text-white text-xs">
                ✏️ Autorius
              </button>
              <button type="button" onClick={() => remove(i)}
                className="px-3 py-1 bg-red-500/80 hover:bg-red-600 rounded text-white text-xs">
                ✕ Trinti
              </button>
            </div>
          </div>
        ))}

        {/* Upload button */}
        <button type="button" onClick={() => fileRef.current?.click()}
          className="aspect-[4/3] border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center hover:border-music-blue hover:bg-blue-50 transition-colors text-gray-400">
          {uploading ? <span className="text-2xl">⏳</span> : <><span className="text-3xl">+</span><span className="text-xs mt-1">Failas</span></>}
        </button>
      </div>

      {/* Author edit inline */}
      {editAuthor !== null && photos[editAuthor] && (
        <div className="mb-3 bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2 items-center">
          <span className="text-sm text-gray-700 whitespace-nowrap">Nuotr. {editAuthor + 1} autorius:</span>
          <input type="text" value={photos[editAuthor].author}
            onChange={e => updateAuthor(editAuthor, e.target.value)}
            className="flex-1 px-3 py-1.5 border border-blue-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-music-blue"
            placeholder="Pvz: Jonas Jonaitis" />
          <button type="button" onClick={() => setEditAuthor(null)}
            className="px-3 py-1.5 bg-music-blue text-white rounded-lg text-sm">✓</button>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <button type="button" onClick={() => fileRef.current?.click()}
          className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg">
          📁 Įkelti failus
        </button>
        <button type="button" onClick={() => setUrlMode(!urlMode)}
          className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg">
          🔗 Pridėti URL
        </button>
      </div>

      {/* URL input */}
      {urlMode && (
        <div className="mt-3 bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nuotraukos URL</label>
            <input type="url" value={urlInput} onChange={e => setUrlInput(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-music-blue"
              placeholder="https://www.music.lt/images/..." />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Autorius (neprivaloma)</label>
            <input type="text" value={urlAuthor} onChange={e => setUrlAuthor(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-music-blue"
              placeholder="Pvz: Jonas Jonaitis" />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={addUrl}
              className="px-4 py-2 bg-music-blue text-white rounded-lg text-sm font-medium hover:opacity-90">Pridėti</button>
            <button type="button" onClick={() => { setUrlMode(false); setUrlInput(''); setUrlAuthor('') }}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50">Atšaukti</button>
          </div>
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
    </div>
  )
}
