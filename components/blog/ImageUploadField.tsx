'use client'
// components/blog/ImageUploadField.tsx
//
// Cover image upload field. Du source'ai: failo pasirinkimas (input file)
// arba paste'inant URL. POST'inam į /api/upload — endpoint'as palaiko abu
// content-type'us (multipart ir JSON {url}).
//
// Background turim klasė + drag/drop highlight. Naudojamas tiek blog cover,
// tiek per BlogEditor inline image insert (vėliau).

import { useRef, useState, type DragEvent, type ChangeEvent } from 'react'

export function ImageUploadField({
  value, onChange, label = 'Cover nuotrauka',
}: {
  value: string
  onChange: (url: string) => void
  label?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [pasteUrl, setPasteUrl] = useState('')
  const [showUrlInput, setShowUrlInput] = useState(false)
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

  async function uploadFromUrl() {
    const url = pasteUrl.trim()
    if (!url) return
    setError(''); setUploading(true)
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Upload nepavyko')
      onChange(data.url)
      setPasteUrl(''); setShowUrlInput(false)
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
        {label} <span className="font-normal text-[#334058] normal-case">(neprivaloma)</span>
      </label>

      {value ? (
        <div className="relative rounded-xl overflow-hidden group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="w-full max-h-48 object-cover" />
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute top-2 right-2 px-2 py-1 rounded-md text-xs font-bold bg-black/60 text-white opacity-0 group-hover:opacity-100 transition"
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
          className="rounded-xl px-4 py-8 text-center cursor-pointer transition"
          style={{
            background: dragOver ? 'rgba(249,115,22,0.08)' : 'rgba(255,255,255,0.02)',
            border: `1.5px dashed ${dragOver ? 'rgba(249,115,22,0.5)' : 'rgba(255,255,255,0.1)'}`,
          }}
        >
          {uploading ? (
            <p className="text-sm" style={{ color: '#5e7290' }}>Įkeliama...</p>
          ) : (
            <>
              <p className="text-sm font-semibold mb-1" style={{ color: '#b0bdd4' }}>📷 Numesk nuotrauką arba spausk</p>
              <p className="text-xs" style={{ color: '#334058' }}>arba <button type="button" onClick={e => { e.stopPropagation(); setShowUrlInput(true) }} className="underline hover:text-[#f97316]">įklijuok URL</button></p>
            </>
          )}
        </div>
      )}

      <input ref={inputRef} type="file" accept="image/*" onChange={onPick} className="hidden" />

      {showUrlInput && !value && (
        <div className="flex gap-2 mt-2">
          <input
            value={pasteUrl}
            onChange={e => setPasteUrl(e.target.value)}
            placeholder="https://..."
            className="flex-1 px-3 py-1.5 rounded-lg text-sm outline-none focus:border-[#f97316]/30"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#dde8f8' }}
          />
          <button
            type="button"
            onClick={uploadFromUrl}
            disabled={uploading}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#f97316] text-white hover:bg-[#ea580c] disabled:opacity-40"
          >
            {uploading ? '...' : 'Įkelti'}
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  )
}
