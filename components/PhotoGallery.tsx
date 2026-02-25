'use client'

import { useRef, useState } from 'react'

export type Photo = {
  url: string
  author?: string   // copyright / credit
  caption?: string  // optional description
}

// ── Drag-to-reorder hook ──────────────────────────────────────────────────────
function useDragReorder<T>(items: T[], onChange: (items: T[]) => void) {
  const dragIdx = useRef<number | null>(null)
  const dragOver = useRef<number | null>(null)

  const onDragStart = (i: number) => { dragIdx.current = i }
  const onDragEnter = (i: number) => { dragOver.current = i }
  const onDragEnd   = () => {
    if (dragIdx.current === null || dragOver.current === null || dragIdx.current === dragOver.current) {
      dragIdx.current = null; dragOver.current = null; return
    }
    const next = [...items]
    const [moved] = next.splice(dragIdx.current, 1)
    next.splice(dragOver.current, 0, moved)
    onChange(next)
    dragIdx.current = null; dragOver.current = null
  }

  return { onDragStart, onDragEnter, onDragEnd }
}

// ── PhotoCard — single photo in grid ─────────────────────────────────────────
function PhotoCard({
  photo, index, total,
  onUpdate, onRemove,
  dragHandlers, isDragOver,
}: {
  photo: Photo; index: number; total: number
  onUpdate: (p: Photo) => void
  onRemove: () => void
  dragHandlers: { onDragStart: () => void; onDragEnter: () => void; onDragEnd: () => void }
  isDragOver: boolean
}) {
  const [editingAuthor, setEditingAuthor] = useState(false)

  return (
    <div
      className={`group relative rounded-xl overflow-hidden border-2 transition-all bg-white
        ${isDragOver ? 'border-music-blue scale-[1.02] shadow-lg' : 'border-gray-200 hover:border-gray-300'}`}
      style={{ aspectRatio: 'auto' }}
      draggable
      onDragStart={dragHandlers.onDragStart}
      onDragEnter={dragHandlers.onDragEnter}
      onDragEnd={dragHandlers.onDragEnd}
      onDragOver={e => e.preventDefault()}
    >
      {/* Image */}
      <div className="relative overflow-hidden bg-gray-100" style={{ minHeight: 80 }}>
        <img
          src={photo.url}
          alt={photo.caption || ''}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
          style={{ maxHeight: 160, objectFit: 'cover' }}
        />

        {/* Hover actions overlay */}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-start justify-between p-1.5">
          {/* Drag handle */}
          <div className="cursor-grab active:cursor-grabbing p-1 text-white/80 hover:text-white text-sm" title="Tempti">
            ⠿
          </div>
          {/* Remove */}
          <button
            type="button"
            onClick={onRemove}
            className="p-1 bg-red-500/80 hover:bg-red-500 text-white rounded-lg text-xs leading-none transition-colors"
            title="Pašalinti"
          >✕</button>
        </div>

        {/* Position badge */}
        <div className="absolute bottom-1 left-1 bg-black/50 text-white text-xs px-1.5 py-0.5 rounded-md font-mono leading-none">
          {index + 1}/{total}
        </div>
      </div>

      {/* Author/credit row */}
      <div className="px-2 py-1.5 border-t border-gray-100">
        {editingAuthor ? (
          <input
            autoFocus
            type="text"
            value={photo.author || ''}
            onChange={e => onUpdate({ ...photo, author: e.target.value })}
            onBlur={() => setEditingAuthor(false)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingAuthor(false) }}
            placeholder="Autorius / © šaltinis"
            className="w-full text-xs px-1.5 py-1 border border-music-blue rounded-lg focus:outline-none bg-white text-gray-700"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingAuthor(true)}
            className="w-full text-left text-xs text-gray-400 hover:text-gray-600 transition-colors truncate"
            title="Spustelėkite norėdami nurodyti autorių"
          >
            {photo.author
              ? <span className="text-gray-600">© {photo.author}</span>
              : <span className="italic">+ Autorius</span>
            }
          </button>
        )}
      </div>
    </div>
  )
}

// ── PhotoGallery — main export ────────────────────────────────────────────────
export default function PhotoGallery({
  photos,
  onChange,
  onOriginalAdded,
}: {
  photos: Photo[]
  onChange: (photos: Photo[]) => void
  onOriginalAdded?: (url: string) => void  // called when crop original is added
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  const { onDragStart, onDragEnter, onDragEnd } = useDragReorder(photos, items => {
    setDragOverIdx(null)
    onChange(items)
  })

  const uploadFile = async (file: File): Promise<string | null> => {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/upload', { method: 'POST', body: fd })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Upload nepavyko')
    return data.url
  }

  const handleFiles = async (files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/'))
    if (!imageFiles.length) return
    setUploading(true); setError('')
    try {
      const urls = await Promise.all(imageFiles.map(uploadFile))
      const newPhotos: Photo[] = urls.filter(Boolean).map(url => ({ url: url! }))
      onChange([...photos, ...newPhotos])
    } catch (e: any) { setError(e.message) }
    finally { setUploading(false) }
  }

  const addUrl = async () => {
    const v = urlInput.trim()
    if (!v) return
    setUploading(true); setError('')
    try {
      const res = await fetch('/api/fetch-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: v }),
      })
      const d = await res.json()
      if (!res.ok || !d.url) throw new Error(d.error || 'Nepavyko')
      onChange([...photos, { url: d.url }])
      setUrlInput('')
      setShowUrlInput(false)
    } catch (e: any) { setError(e.message) }
    finally { setUploading(false) }
  }

  const update = (i: number, p: Photo) => {
    const next = [...photos]; next[i] = p; onChange(next)
  }
  const remove = (i: number) => onChange(photos.filter((_, idx) => idx !== i))

  return (
    <div className="space-y-3">

      {/* Grid */}
      {photos.length > 0 && (
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
          {photos.map((photo, i) => (
            <PhotoCard
              key={`${photo.url}-${i}`}
              photo={photo}
              index={i}
              total={photos.length}
              onUpdate={p => update(i, p)}
              onRemove={() => remove(i)}
              isDragOver={dragOverIdx === i}
              dragHandlers={{
                onDragStart: () => { onDragStart(i) },
                onDragEnter: () => { onDragEnter(i); setDragOverIdx(i) },
                onDragEnd:   () => { onDragEnd(); setDragOverIdx(null) },
              }}
            />
          ))}

          {/* Add more slot */}
          <div
            className="rounded-xl border-2 border-dashed border-gray-200 hover:border-music-blue transition-colors cursor-pointer flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-music-blue"
            style={{ minHeight: 80, aspectRatio: '1/1' }}
            onClick={() => fileRef.current?.click()}
            onDrop={e => { e.preventDefault(); handleFiles(Array.from(e.dataTransfer.files)) }}
            onDragOver={e => e.preventDefault()}
          >
            {uploading
              ? <div className="w-5 h-5 border-2 border-music-blue border-t-transparent rounded-full animate-spin" />
              : <><span className="text-xl">+</span><span className="text-xs">Pridėti</span></>
            }
          </div>
        </div>
      )}

      {/* Empty state */}
      {photos.length === 0 && (
        <div
          className="rounded-xl border-2 border-dashed border-gray-200 hover:border-music-blue transition-colors cursor-pointer py-6 flex flex-col items-center gap-1.5 text-gray-400 hover:text-music-blue"
          onClick={() => fileRef.current?.click()}
          onDrop={e => { e.preventDefault(); handleFiles(Array.from(e.dataTransfer.files)) }}
          onDragOver={e => e.preventDefault()}
        >
          {uploading
            ? <div className="w-6 h-6 border-2 border-music-blue border-t-transparent rounded-full animate-spin" />
            : (
              <>
                <span className="text-2xl">🖼️</span>
                <span className="text-xs font-medium">Įkelti nuotraukas</span>
                <span className="text-xs opacity-70">JPG, PNG · vilkite arba spustelėkite</span>
              </>
            )
          }
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
        >
          📁 Įkelti failus
        </button>
        <button
          type="button"
          onClick={() => setShowUrlInput(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition-colors"
        >
          🔗 Pridėti URL
        </button>
      </div>

      {/* URL input */}
      {showUrlInput && (
        <div className="flex gap-1.5">
          <input
            type="text"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addUrl() } if (e.key === 'Escape') setShowUrlInput(false) }}
            placeholder="https://..."
            autoFocus
            className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:border-music-blue bg-white"
          />
          <button type="button" onClick={addUrl}
            className="px-3 py-1.5 bg-music-blue text-white rounded-lg text-xs font-medium hover:opacity-90 transition-opacity">
            Pridėti
          </button>
          <button type="button" onClick={() => setShowUrlInput(false)}
            className="px-2 py-1.5 bg-gray-100 text-gray-500 rounded-lg text-xs hover:bg-gray-200 transition-colors">
            ✕
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => { if (e.target.files) handleFiles(Array.from(e.target.files)) }}
      />
    </div>
  )
}
