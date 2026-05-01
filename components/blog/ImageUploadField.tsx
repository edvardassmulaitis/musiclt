'use client'
// components/blog/ImageUploadField.tsx
//
// Cover image. Drag/drop arba pick. Mažas paprastas dropzone'as matchinant
// /blogas/mano stiliaus.

import { useRef, useState, type DragEvent, type ChangeEvent } from 'react'

export function ImageUploadField({
  value, onChange, label = 'Cover',
}: {
  value: string
  onChange: (url: string) => void
  label?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)

  async function uploadFile(file: File) {
    if (!file.type.startsWith('image/')) {
      setError('Tik nuotraukos failai')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Maksimalus dydis 5MB')
      return
    }
    setError(''); setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Upload nepavyko')
      onChange(data.url)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
    e.target.value = ''
  }

  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-wider mb-2 block" style={{ color: '#5e7290', fontFamily: "'Outfit', sans-serif" }}>
        {label}
      </label>

      {value ? (
        <div className="relative rounded-lg overflow-hidden group inline-block max-w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="block max-h-72 max-w-full w-auto" style={{ height: 'auto' }} />
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-bold bg-black/60 text-white opacity-0 group-hover:opacity-100 transition"
          >
            Pašalinti
          </button>
        </div>
      ) : (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className="rounded-lg px-4 py-5 text-center cursor-pointer transition"
          style={{
            background: dragOver ? 'rgba(249,115,22,0.06)' : 'rgba(255,255,255,0.02)',
            border: `1px dashed ${dragOver ? 'rgba(249,115,22,0.4)' : 'rgba(255,255,255,0.08)'}`,
          }}
        >
          {uploading ? (
            <p className="text-xs" style={{ color: '#5e7290' }}>Įkeliama...</p>
          ) : (
            <p className="text-xs" style={{ color: '#5e7290' }}>
              Numesk nuotrauką arba <span style={{ color: '#f97316' }}>spausk</span>
            </p>
          )}
        </div>
      )}

      <input ref={inputRef} type="file" accept="image/*" onChange={onPick} className="hidden" />

      {error && <p className="text-xs text-red-400 mt-1.5">{error}</p>}
    </div>
  )
}
