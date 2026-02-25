'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { GENRES, MONTHS, DAYS } from '@/lib/constants'
import StyleModal from './StyleModal'
import PhotoGallery, { type Photo } from './PhotoGallery'
import WikipediaImport from './WikipediaImport'
import InstagramConnect from './InstagramConnect'
import RichTextEditor from './RichTextEditor'

const CY = new Date().getFullYear()
const YEARS = Array.from({ length: CY - 1900 + 1 }, (_, i) => CY - i)

const SOCIALS = [
  { key:'website',    label:'Oficialus puslapis', icon:'🌐', ph:'https://...', type:'url' },
  { key:'facebook',   label:'Facebook',   icon:'📘', ph:'https://facebook.com/...' },
  { key:'instagram',  label:'Instagram',  icon:'📸', ph:'https://instagram.com/...' },
  { key:'youtube',    label:'YouTube',    icon:'▶️',  ph:'https://youtube.com/...' },
  { key:'tiktok',     label:'TikTok',     icon:'🎵', ph:'https://tiktok.com/...' },
  { key:'spotify',    label:'Spotify',    icon:'🎧', ph:'https://open.spotify.com/...' },
  { key:'soundcloud', label:'SoundCloud', icon:'☁️',  ph:'https://soundcloud.com/...' },
  { key:'bandcamp',   label:'Bandcamp',   icon:'🎸', ph:'https://bandcamp.com/...' },
  { key:'twitter',    label:'X (Twitter)',icon:'𝕏',  ph:'https://x.com/...' },
]

export type Break    = { from: string; to: string }
export type Member   = { id: string; name: string; yearFrom: string; yearTo: string }
export type GroupRef = { id: string; name: string; yearFrom: string; yearTo: string }

export type ArtistFormData = {
  name: string; type: 'group'|'solo'
  country: string; genre: string; substyles: string[]; description: string
  yearStart: string; yearEnd: string; breaks: Break[]
  members: Member[]; groups: GroupRef[]
  avatar: string; avatarWide: string; photos: Photo[]
  website: string; subdomain: string
  birthYear: string; birthMonth: string; birthDay: string
  deathYear: string; deathMonth: string; deathDay: string
  gender: 'male'|'female'|''
  facebook: string; instagram: string; youtube: string; tiktok: string
  spotify: string; soundcloud: string; bandcamp: string; twitter: string
}

export const emptyArtistForm: ArtistFormData = {
  name:'', type:'group', country:'Lietuva', genre:'', substyles:[],
  description:'', yearStart:'', yearEnd:'', breaks:[], members:[], groups:[],
  avatar:'', avatarWide:'', photos:[], website:'', subdomain:'',
  birthYear:'', birthMonth:'', birthDay:'',
  deathYear:'', deathMonth:'', deathDay:'', gender:'',
  facebook:'', instagram:'', youtube:'', tiktok:'',
  spotify:'', soundcloud:'', bandcamp:'', twitter:'',
}

type Props = {
  initialData?: ArtistFormData
  artistId?: string
  onSubmit: (d: ArtistFormData) => void
  backHref: string
  title: string
  submitLabel: string
  // Called when any field changes — for auto-save
  onChange?: (d: ArtistFormData) => void
}

function SL({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{children}</label>
}

function Inp({ value, onChange, placeholder, type='text', required }: any) {
  return <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} required={required}
    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-music-blue bg-white" />
}

function Sel({ value, onChange, children, required }: any) {
  return <select value={value} onChange={e=>onChange(e.target.value)} required={required}
    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-music-blue bg-white">
    {children}
  </select>
}

function Card({ title, children, className='' }: { title:string; children:React.ReactNode; className?:string }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-100 ${className}`}>
      <div className="px-5 py-3 border-b border-gray-100">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function DateRow({ label, y, m, d, onY, onM, onD }: any) {
  return (
    <div>
      <SL>{label}</SL>
      <div className="flex gap-1.5">
        <Sel value={y} onChange={onY}><option value="">Metai</option>{YEARS.map(yr=><option key={yr} value={yr}>{yr}</option>)}</Sel>
        <Sel value={m} onChange={onM}><option value="">Mėn.</option>{MONTHS.map((mn,i)=><option key={i} value={i+1}>{mn}</option>)}</Sel>
        <Sel value={d} onChange={onD}><option value="">D.</option>{DAYS.map(dy=><option key={dy} value={dy}>{dy}</option>)}</Sel>
      </div>
    </div>
  )
}

// ── ImageCropper — canvas pan/zoom, returns square crop + original ────────────
type CropResult = { square: Blob; original: Blob }

function ImageCropper({ src, onCrop, onCancel }: {
  src: string
  onCrop: (result: CropResult) => void
  onCancel: () => void
}) {
  const squareRef = useRef<HTMLCanvasElement>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef({ mx: 0, my: 0, ox: 0, oy: 0 })
  const scaleRef = useRef(scale)
  const offsetRef = useRef(offset)
  const SIZE = 320

  useEffect(() => { scaleRef.current = scale }, [scale])
  useEffect(() => { offsetRef.current = offset }, [offset])

  useEffect(() => {
    const image = new window.Image()
    if (src.startsWith('http') && !src.includes(window.location.hostname)) {
      image.crossOrigin = 'anonymous'
    }
    image.onload = () => {
      setImg(image)
      const fit = Math.max(SIZE / image.naturalWidth, SIZE / image.naturalHeight)
      setScale(fit)
      scaleRef.current = fit
      setOffset({ x: 0, y: 0 })
    }
    image.src = src
  }, [src])

  useEffect(() => {
    if (!img || !squareRef.current) return
    const ctx = squareRef.current.getContext('2d')!
    ctx.clearRect(0, 0, SIZE, SIZE)
    ctx.save()
    ctx.translate(SIZE / 2 + offset.x, SIZE / 2 + offset.y)
    ctx.scale(scale, scale)
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)
    ctx.restore()
  }, [img, scale, offset])

  const clampOffset = (ox: number, oy: number, s: number) => {
    if (!img) return { x: ox, y: oy }
    const hw = (img.naturalWidth * s) / 2
    const hh = (img.naturalHeight * s) / 2
    const half = SIZE / 2
    return {
      x: Math.max(Math.min(ox, hw - half), -(hw - half)),
      y: Math.max(Math.min(oy, hh - half), -(hh - half)),
    }
  }

  const applyScale = (next: number) => {
    if (!img) return
    const minScale = Math.max(SIZE / img.naturalWidth, SIZE / img.naturalHeight)
    const clamped = Math.max(minScale, Math.min(next, minScale * 8))
    setScale(clamped)
    setOffset(prev => clampOffset(prev.x, prev.y, clamped))
  }

  // ── Mouse events ──────────────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    setDragging(true)
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y }
  }
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return
    setOffset(clampOffset(
      dragStart.current.ox + e.clientX - dragStart.current.mx,
      dragStart.current.oy + e.clientY - dragStart.current.my,
      scaleRef.current
    ))
  }
  const onMouseUp = () => setDragging(false)

  // ── Scroll wheel zoom ─────────────────────────────────────────────────────
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    // deltaY negative = scroll up = zoom in
    const delta = -e.deltaY * 0.001 * scaleRef.current
    applyScale(scaleRef.current + delta)
  }

  // ── Touch events (single finger pan, pinch zoom) ──────────────────────────
  const lastPinchDist = useRef<number | null>(null)
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const t = e.touches[0]
      setDragging(true)
      dragStart.current = { mx: t.clientX, my: t.clientY, ox: offsetRef.current.x, oy: offsetRef.current.y }
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      lastPinchDist.current = Math.hypot(dx, dy)
    }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    e.preventDefault()
    if (e.touches.length === 1 && dragging) {
      const t = e.touches[0]
      setOffset(clampOffset(
        dragStart.current.ox + t.clientX - dragStart.current.mx,
        dragStart.current.oy + t.clientY - dragStart.current.my,
        scaleRef.current
      ))
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.hypot(dx, dy)
      if (lastPinchDist.current !== null) {
        const ratio = dist / lastPinchDist.current
        applyScale(scaleRef.current * ratio)
      }
      lastPinchDist.current = dist
    }
  }
  const onTouchEnd = () => { setDragging(false); lastPinchDist.current = null }

  // ── Export: square crop + full original ──────────────────────────────────
  const handleCrop = () => {
    if (!squareRef.current || !img) return

    // 1. Square crop — exactly what's visible in canvas
    squareRef.current.toBlob(squareBlob => {
      if (!squareBlob) return

      // 2. Original — resize to max 1200px wide, keep aspect ratio
      const MAX = 1200
      const ratio = Math.min(1, MAX / img.naturalWidth, MAX / img.naturalHeight)
      const w = Math.round(img.naturalWidth * ratio)
      const h = Math.round(img.naturalHeight * ratio)
      const origCanvas = document.createElement('canvas')
      origCanvas.width = w; origCanvas.height = h
      const ctx = origCanvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)
      origCanvas.toBlob(origBlob => {
        if (!origBlob) return
        onCrop({ square: squareBlob, original: origBlob })
      }, 'image/jpeg', 0.92)
    }, 'image/jpeg', 0.92)
  }

  const minScale = img ? Math.max(SIZE / img.naturalWidth, SIZE / img.naturalHeight) : 1
  const sliderVal = img ? Math.round(((scale - minScale) / (minScale * 7)) * 100) : 0

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/70" style={{ zIndex: 10000 }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="text-sm font-bold text-gray-800">✂️ Apkarpyti nuotrauką</span>
          <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1">✕</button>
        </div>
        <div className="p-4 flex flex-col items-center gap-3">
          {/* Canvas */}
          <div className="relative rounded-xl overflow-hidden border-2 border-gray-200 cursor-grab active:cursor-grabbing select-none"
            style={{ width: SIZE, height: SIZE, maxWidth: '100%' }}>
            <canvas ref={squareRef} width={SIZE} height={SIZE}
              style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none' }}
              onMouseDown={onMouseDown} onMouseMove={onMouseMove}
              onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
              onWheel={onWheel}
              onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
            />
            <div className="absolute inset-0 pointer-events-none border-2 border-white/20 rounded-xl" />
          </div>
          {/* Zoom controls */}
          <div className="flex items-center gap-2 w-full px-1">
            <button type="button" onClick={() => applyScale(scale / 1.15)}
              className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-base font-bold text-gray-600 shrink-0 leading-none">−</button>
            <input type="range" min={0} max={100} value={sliderVal}
              onChange={e => {
                if (!img) return
                applyScale(minScale + (parseInt(e.target.value) / 100) * minScale * 7)
              }}
              className="flex-1 accent-music-blue cursor-pointer" />
            <button type="button" onClick={() => applyScale(scale * 1.15)}
              className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-base font-bold text-gray-600 shrink-0 leading-none">+</button>
          </div>
          <p className="text-xs text-gray-400 -mt-1">Tempk · Scroll arba žnyplės — zoom · Išsaugo kvadratą + originalą</p>
        </div>
        <div className="flex gap-2 px-4 pb-4">
          <button type="button" onClick={onCancel}
            className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
            Atšaukti
          </button>
          <button type="button" onClick={handleCrop}
            className="flex-1 py-2 bg-music-blue text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity">
            ✓ Išsaugoti
          </button>
        </div>
      </div>
    </div>
  )
}

// ── AvatarUpload — handles file upload, URL input, crop, Wikipedia image ──────
function AvatarUpload({ value, onChange, onOriginalSaved }: { value: string; onChange: (url: string) => void; onOriginalSaved?: (url: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [cropSrc, setCropSrc] = useState<string | null>(null) // image to crop


  // Update URL input only when value changes externally (wiki import etc)
  useEffect(() => {
    if (value && !value.startsWith('data:')) setUrlInput(value)
  }, [value])

  // Upload a Blob/File to /api/upload → Supabase URL
  const uploadBlob = async (blob: Blob, filename = 'avatar.jpg') => {
    setUploading(true); setError('')
    try {
      const fd = new FormData()
      fd.append('file', blob, filename)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload nepavyko')
      onChange(data.url)
      setUrlInput(data.url)
    } catch (e: any) { setError(e.message) }
    finally { setUploading(false) }
  }

  // When user picks a file — open cropper
  const handleFileSelect = (file: File) => {
    const reader = new FileReader()
    reader.onload = e => setCropSrc(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  // After crop — upload square (→ avatar) + original (→ gallery via onOriginalSaved)
  const handleCropped = async ({ square, original }: CropResult) => {
    setCropSrc(null)
    setUploading(true); setError('')
    try {
      // Upload square crop → cover_image_url
      const fd1 = new FormData(); fd1.append('file', square, 'avatar-square.jpg')
      const r1 = await fetch('/api/upload', { method: 'POST', body: fd1 })
      const d1 = await r1.json()
      if (!r1.ok) throw new Error(d1.error || 'Upload nepavyko')
      onChange(d1.url)
      setUrlInput(d1.url)

      // Upload original → notify parent to add to gallery
      if (onOriginalSaved) {
        const fd2 = new FormData(); fd2.append('file', original, 'avatar-original.jpg')
        const r2 = await fetch('/api/upload', { method: 'POST', body: fd2 })
        const d2 = await r2.json()
        if (r2.ok && d2.url) onOriginalSaved(d2.url)
      }
    } catch (e: any) { setError(e.message) }
    finally { setUploading(false) }
  }

  // Fetch external URL → data: URL via server-side proxy → open cropper
  const storeUrl = async (raw: string) => {
    const v = raw.trim()
    if (!v) { onChange(''); return }
    if (!v.startsWith('http') && !v.startsWith('/')) return
    setUploading(true); setError('')
    try {
      // Pass returnDataUrl=true so patched route always returns dataUrl for cropper
      const res = await fetch('/api/fetch-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: v, returnDataUrl: true }),
      })
      if (!res.ok) throw new Error('Serverio klaida')
      const d = await res.json()
      const src = d.dataUrl || d.url
      if (!src) throw new Error('Negautas URL')
      setUploading(false)
      setCropSrc(src)
    } catch (e: any) {
      setError('Nepavyko gauti nuotraukos. Bandykite įkelti failą.')
      setUploading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()  // CRITICAL: prevent form submit
      e.stopPropagation()
      storeUrl(urlInput)
    }
  }

  return (
    <>
      {cropSrc && (
        <ImageCropper
          src={cropSrc}
          onCrop={handleCropped}
          onCancel={() => { setCropSrc(null); setUploading(false) }}
        />
      )}
      <div className="space-y-3">
        {/* Preview */}
        <div
          className="relative rounded-xl overflow-hidden cursor-pointer group border-2 border-dashed border-gray-200 hover:border-music-blue transition-colors bg-gray-50"
          style={{ width: 200, height: 200 }}
          onClick={() => !uploading && fileRef.current?.click()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) handleFileSelect(f) }}
          onDragOver={e => e.preventDefault()}
        >
          {value ? (
            <>
              <img src={value} alt="" referrerPolicy="no-referrer"
                className="w-full h-full object-cover group-hover:opacity-70 transition-opacity" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                <span className="text-white text-sm">📁</span>
                <span className="text-white text-xs font-medium">Keisti</span>
              </div>
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
              <span className="text-4xl mb-2">🎤</span>
              <span className="text-xs text-center px-4">Spustelėkite arba<br/>vilkite nuotrauką</span>
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center gap-2">
              <div className="w-6 h-6 border-2 border-music-blue border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-gray-500">Įkeliama...</span>
            </div>
          )}
        </div>

        {/* Action buttons row */}
        <div className="flex gap-2 flex-wrap" style={{ maxWidth: 200 }}>
          <button type="button" onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition-colors">
            📁 Įkelti failą
          </button>
          {value && (
            <button type="button"
              onClick={() => { onChange(''); setUrlInput('') }}
              className="flex items-center gap-1 px-2 py-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg text-xs transition-colors">
              ✕ Išvalyti
            </button>
          )}
        </div>

        {/* URL input */}
        <div className="space-y-1" style={{ maxWidth: 200 }}>
          <label className="text-xs text-gray-400 font-medium">Arba įveskite URL:</label>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onBlur={e => { if (e.target.value !== value) storeUrl(e.target.value) }}
              onKeyDown={handleKeyDown}
              placeholder="https://..."
              className="flex-1 min-w-0 px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:border-music-blue bg-white"
            />
            <button type="button" onClick={() => storeUrl(urlInput)}
              className="px-2 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-medium transition-colors shrink-0">→</button>
          </div>
        </div>

        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }} />
      </div>
    </>
  )
}

// ── AvatarUploadCompact — horizontal layout: photo left, controls right ────────
function AvatarUploadCompact({ value, onChange, onOriginalSaved }: {
  value: string
  onChange: (url: string) => void
  onOriginalSaved?: (url: string) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [cropSrc, setCropSrc] = useState<string | null>(null)

  useEffect(() => {
    if (value && !value.startsWith('data:')) setUrlInput(value)
  }, [value])

  const blobToDataUrl = (blob: Blob): Promise<string> =>
    new Promise(res => { const r = new FileReader(); r.onload = e => res(e.target?.result as string); r.readAsDataURL(blob) })

  const uploadBlob = async (blob: Blob, filename: string): Promise<string> => {
    const fd = new FormData(); fd.append('file', blob, filename)
    const res = await fetch('/api/upload', { method: 'POST', body: fd })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Upload nepavyko')
    return data.url
  }

  const handleFileSelect = (file: File) => {
    const reader = new FileReader()
    reader.onload = e => setCropSrc(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleCropped = async ({ square, original }: CropResult) => {
    setCropSrc(null)
    setUploading(true); setError('')
    try {
      const squareUrl = await uploadBlob(square, 'avatar-square.jpg')
      onChange(squareUrl); setUrlInput(squareUrl)
      if (onOriginalSaved) {
        const origUrl = await uploadBlob(original, 'avatar-original.jpg')
        onOriginalSaved(origUrl)
      }
    } catch (e: any) { setError(e.message) }
    finally { setUploading(false) }
  }

  const storeUrl = async (raw: string) => {
    const v = raw.trim()
    if (!v || !v.startsWith('http')) return
    setUploading(true); setError('')
    try {
      const res = await fetch('/api/fetch-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: v, returnDataUrl: true }),
      })
      if (!res.ok) throw new Error('Serverio klaida')
      const d = await res.json()
      const src = d.dataUrl || d.url
      if (!src) throw new Error('Negautas URL')
      setUploading(false)
      setCropSrc(src)
    } catch (e: any) {
      setError('Nepavyko gauti nuotraukos')
      setUploading(false)
    }
  }

  return (
    <>
      {cropSrc && (
        <ImageCropper
          src={cropSrc}
          onCrop={handleCropped}
          onCancel={() => { setCropSrc(null); setUploading(false) }}
        />
      )}
      <div className="flex gap-4 items-start">
        {/* Square photo preview */}
        <div
          className="relative rounded-xl overflow-hidden cursor-pointer group border-2 border-dashed border-gray-200 hover:border-music-blue transition-colors bg-gray-50 shrink-0"
          style={{ width: 120, height: 120 }}
          onClick={() => !uploading && fileRef.current?.click()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) handleFileSelect(f) }}
          onDragOver={e => e.preventDefault()}
        >
          {value ? (
            <>
              <img src={value} alt="" referrerPolicy="no-referrer"
                className="w-full h-full object-cover group-hover:opacity-70 transition-opacity" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="text-white text-xs font-medium">Keisti</span>
              </div>
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-1">
              <span className="text-3xl">🎤</span>
              <span className="text-xs text-center leading-tight">Įkelti<br/>nuotrauką</span>
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-music-blue border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex-1 min-w-0 space-y-2.5 pt-1">
          <div className="flex gap-2">
            <button type="button" onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition-colors">
              📁 Įkelti failą
            </button>
            {value && (
              <button type="button" onClick={() => { onChange(''); setUrlInput('') }}
                className="flex items-center gap-1 px-2 py-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg text-xs transition-colors">
                ✕ Išvalyti
              </button>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs text-gray-400 font-medium">Arba įveskite URL:</label>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                onBlur={e => { if (e.target.value && e.target.value !== value) storeUrl(e.target.value) }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); storeUrl(urlInput) } }}
                placeholder="https://..."
                className="flex-1 min-w-0 px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:border-music-blue bg-white"
              />
              <button type="button" onClick={() => storeUrl(urlInput)}
                className="px-2 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-medium transition-colors shrink-0">→</button>
            </div>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
          <p className="text-xs text-gray-400 leading-tight">Apkarpoma kvadratiškai.<br/>Originalas išsaugomas galerijoje.</p>
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }} />
    </>
  )
}

// ── InlineStyleSearch — quick style add without opening full modal ────────────
function InlineStyleSearch({ selected, onAdd }: { selected: string[]; onAdd: (s: string) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<string[]>([])

  useEffect(() => {
    if (!q.trim()) { setResults([]); return }
    // Fetch all substyles matching query from constants
    import('@/lib/constants').then(m => {
      const all: string[] = (m as any).ALL_SUBSTYLES || m.SUBSTYLES || []
      const filtered = all
        .filter((s: string) => s.toLowerCase().includes(q.toLowerCase()) && !selected.includes(s))
        .slice(0, 6)
      setResults(filtered)
    }).catch(() => setResults([]))
  }, [q, selected])

  return (
    <div className="relative flex-1 max-w-[180px]">
      <input
        type="text" value={q} onChange={e => setQ(e.target.value)}
        placeholder="+ Pridėti stilių..."
        className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:border-music-blue bg-white"
      />
      {results.length > 0 && (
        <div className="absolute z-20 top-8 left-0 w-48 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {results.map(s => (
            <button key={s} type="button"
              onClick={() => { onAdd(s); setQ(''); setResults([]) }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 text-gray-700 transition-colors">
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── DescriptionEditor — expandable rich text editor ─────────────────────────
function DescriptionEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [expanded, setExpanded] = useState(false)

  const editor = (
    <div style={{ minHeight: expanded ? 300 : 140 }}>
      <RichTextEditor value={value} onChange={onChange} placeholder="Trumpas aprašymas..." />
    </div>
  )

  return (
    <div className="relative">
      {expanded ? (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: '80vh' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <span className="text-sm font-bold text-gray-700">Aprašymas</span>
              <button onClick={() => setExpanded(false)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>
            <div className="flex-1 overflow-auto p-4" style={{ minHeight: 300 }}>
              <RichTextEditor value={value} onChange={onChange} placeholder="Trumpas aprašymas..." />
            </div>
            <div className="px-4 py-3 border-t border-gray-100 flex justify-end">
              <button onClick={() => setExpanded(false)}
                className="px-4 py-2 bg-music-blue text-white rounded-lg text-sm font-medium hover:opacity-90">
                ✓ Uždaryti
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ minHeight: 140 }}>
          <RichTextEditor value={value} onChange={onChange} placeholder="Trumpas aprašymas..." />
        </div>
      )}
      <button type="button" onClick={() => setExpanded(true)}
        className="mt-1 text-xs text-gray-400 hover:text-music-blue transition-colors">
        ⤢ Plėsti redaktorių
      </button>
    </div>
  )
}

function ArtistSearch({ label, ph, items, onAdd, onRemove, onYears, filterType }: {
  label:string; ph:string; items:(Member|GroupRef)[]
  onAdd:(a:any)=>void; onRemove:(i:number)=>void
  onYears:(i:number,f:'yearFrom'|'yearTo',v:string)=>void
  filterType:'group'|'solo'|'any'
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')

  useEffect(() => {
    if (q.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/artists?search=${encodeURIComponent(q)}&limit=6`)
        const data = await res.json()
        const filtered = (data.artists || []).filter((a: any) =>
          (filterType === 'any' || a.type === filterType) &&
          !items.find((m: any) => m.id === a.id)
        )
        setResults(filtered)
      } catch {}
    }, 200)
    return () => clearTimeout(t)
  }, [q, items, filterType])

  const addNew = async () => {
    if (!newName.trim()) return
    try {
      const res = await fetch('/api/artists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          type: filterType === 'any' ? 'solo' : filterType,
          country: 'Lietuva',
          type_music: true, type_film: false, type_dance: false, type_books: false,
          genres: [], breaks: [], photos: [], links: {},
        })
      })
      const data = await res.json()
      if (data.id) {
        onAdd({ id: data.id, name: newName.trim() })
        setNewName(''); setShowNew(false); setQ('')
      }
    } catch {}
  }

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
          <div className="w-6 h-6 rounded-full bg-music-blue flex items-center justify-center text-white text-xs flex-shrink-0">{item.name[0]}</div>
          <span className="flex-1 text-sm font-medium text-gray-900 truncate">{item.name}</span>
          <input value={item.yearFrom}
            onChange={e=>onYears(i,'yearFrom',e.target.value.replace(/\D/g,'').slice(0,4))}
            placeholder="Nuo" maxLength={4} inputMode="numeric"
            className="w-14 px-1.5 py-1 border border-gray-300 rounded text-xs text-gray-900 focus:outline-none focus:border-music-blue text-center" />
          <span className="text-gray-400 text-xs">–</span>
          <input value={item.yearTo}
            onChange={e=>onYears(i,'yearTo',e.target.value.replace(/\D/g,'').slice(0,4))}
            placeholder="Iki" maxLength={4} inputMode="numeric"
            className="w-14 px-1.5 py-1 border border-gray-300 rounded text-xs text-gray-900 focus:outline-none focus:border-music-blue text-center" />
          <button type="button" onClick={()=>onRemove(i)} className="text-red-400 hover:text-red-600 font-bold text-base ml-1">×</button>
        </div>
      ))}
      <div className="relative">
        <input type="text" value={q} onChange={e=>setQ(e.target.value)} placeholder={ph}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-music-blue" />
        {results.length > 0 && (
          <div className="absolute z-20 w-full bg-white border border-gray-200 rounded-xl shadow-lg mt-1 overflow-hidden">
            {results.map(a => (
              <button key={a.id} type="button" onClick={()=>{onAdd(a);setQ('');setResults([])}}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 text-left">
                <div className="w-7 h-7 rounded-full bg-music-blue flex items-center justify-center text-white text-xs">{a.name[0]}</div>
                <div>
                  <div className="text-sm font-medium text-gray-900">{a.name}</div>
                  <div className="text-xs text-gray-400">{a.type==='group'?'Grupė':'Atlikėjas'} · {a.country}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      {!showNew
        ? <button type="button" onClick={()=>setShowNew(true)} className="text-xs text-music-blue hover:text-music-orange font-medium">+ Sukurti naują ir pridėti</button>
        : <div className="flex gap-2">
            <input type="text" value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Vardas / pavadinimas"
              className="flex-1 px-3 py-2 border border-blue-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-music-blue" />
            <button type="button" onClick={addNew} className="px-3 py-2 bg-music-blue text-white rounded-lg text-sm font-medium">Sukurti</button>
            <button type="button" onClick={()=>setShowNew(false)} className="px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-600">✕</button>
          </div>
      }
    </div>
  )
}

export default function ArtistForm({ initialData, artistId, onSubmit, backHref, title, submitLabel, onChange }: Props) {
  const [form, setForm] = useState<ArtistFormData>(initialData || emptyArtistForm)

  // Sync initialData → form, but never overwrite photos/avatar that user just changed
  const prevInitialRef = useRef<ArtistFormData | null>(null)
  useEffect(() => {
    if (!initialData) return
    if (prevInitialRef.current === null) {
      // First load — full sync
      prevInitialRef.current = initialData
      setForm(initialData)
      return
    }
    // Subsequent changes (e.g. Wiki import) — only sync changed text fields, never photos/avatar
    const prev = prevInitialRef.current
    prevInitialRef.current = initialData
    setForm(f => ({
      ...f,
      ...(initialData.name !== prev.name ? { name: initialData.name } : {}),
      ...(initialData.description !== prev.description ? { description: initialData.description } : {}),
      ...(initialData.substyles !== prev.substyles ? { substyles: initialData.substyles } : {}),
      ...(initialData.website !== prev.website ? { website: initialData.website } : {}),
    }))
  }, [initialData]) // eslint-disable-line

  const set = (f: keyof ArtistFormData, v: any) => {
    const next = { ...form, [f]: v }
    setForm(next)
    // Only auto-save if form is fully loaded (has name)
    if (onChange && form.name) onChange?.(next)
  }

  // Auto-save avatar when it changes (fire-and-forget, called when AvatarUpload finishes upload)
  const setAvatar = (url: string) => {
    const next = { ...form, avatar: url }
    setForm(next)
    if (onChange && url !== form.avatar) onChange(next)
  }

  const setAvatarWide = (url: string) => {
    const next = { ...form, avatarWide: url }
    setForm(next)
    if (onChange) onChange(next)
  }

  // Auto-save photos when gallery changes
  // Use functional setForm to avoid stale closure — photos arrive after async upload
  const setPhotos = (photos: any[]) => {
    setForm(prev => {
      const next = { ...prev, photos }
      if (onChange && prev.name) onChange(next)
      return next
    })
  }

  const addBreak = () => set('breaks', [...form.breaks, { from:'', to:'' }])
  const upBreak = (i:number, f:'from'|'to', v:string) => { const b=[...form.breaks]; b[i]={...b[i],[f]:v}; set('breaks',b) }
  const rmBreak = (i:number) => set('breaks', form.breaks.filter((_,idx)=>idx!==i))

  const addMember = (a:any) => set('members', [...form.members, { id:a.id, name:a.name, yearFrom:'', yearTo:'' }])
  const rmMember  = (i:number) => set('members', form.members.filter((_,idx)=>idx!==i))
  const upMember  = (i:number, f:'yearFrom'|'yearTo', v:string) => { const m=[...form.members]; m[i]={...m[i],[f]:v}; set('members',m) }

  const addGroup = (a:any) => set('groups', [...(form.groups||[]), { id:a.id, name:a.name, yearFrom:'', yearTo:'' }])
  const rmGroup  = (i:number) => set('groups', (form.groups||[]).filter((_,idx)=>idx!==i))
  const upGroup  = (i:number, f:'yearFrom'|'yearTo', v:string) => { const g=[...(form.groups||[])]; g[i]={...g[i],[f]:v}; set('groups',g) }

  const handleSubmit = (e:React.FormEvent) => { e.preventDefault(); onSubmit(form) }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Header — hidden when used inside edit page (CSS override hides it) */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href={backHref} className="text-music-blue hover:text-music-orange text-sm">← Atgal</Link>
            <h1 className="text-2xl font-black text-gray-900 mt-1">{title}</h1>
          </div>
          <button type="button" onClick={() => document.getElementById('submit-btn')?.click()}
            className="px-6 py-3 bg-gradient-to-r from-music-blue to-blue-600 text-white font-bold rounded-xl hover:opacity-90 shadow-md">
            ✓ {submitLabel}
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Wikipedia import - full width (hidden via CSS in edit page) */}
          <div className="mb-5 WikipediaImport">
            <WikipediaImport onImport={data => setForm(prev => ({ ...prev, ...data }))} />
          </div>

          {/* Instagram Connect - full width (hidden via CSS in edit page) */}
          {artistId && (
            <div className="mb-5 InstagramConnect">
              <InstagramConnect artistId={artistId} artistName={form.name} />
            </div>
          )}

          {/* 2-column layout */}
          <div className="grid grid-cols-2 gap-5">

            {/* ── LEFT COLUMN ── */}
            <div className="space-y-5">

              {/* Pagrindinė info */}
              <Card title="Pagrindinė informacija">
                <div className="space-y-4">
                  <div>
                    <SL>Pavadinimas *</SL>
                    <Inp value={form.name} onChange={(v:string)=>set('name',v)} placeholder="Pvz: Jazzu" required />
                  </div>

                  <div>
                    <SL>Tipas *</SL>
                    <div className="flex gap-4 mt-1">
                      {([['group','🎸 Grupė'],['solo','🎤 Solo']] as const).map(([v,l]) => (
                        <label key={v} className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name="type" value={v} checked={form.type===v} onChange={()=>set('type',v)} className="accent-music-blue" />
                          <span className="text-sm text-gray-700">{l}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <SL>Šalis *</SL>
                      <Sel value={form.country} onChange={(v:string)=>set('country',v)} required>
                        {['Lietuva','Latvija','Estija','Lenkija','Vokietija','Prancūzija','JAV','Didžioji Britanija','Švedija','Norvegija','Suomija','Danija'].map(c=><option key={c} value={c}>{c}</option>)}
                        <optgroup label="─────────────">
                          {require('@/lib/constants').COUNTRIES.filter((c:string)=>!['Lietuva','Latvija','Estija','Lenkija','Vokietija','Prancūzija','JAV','Didžioji Britanija','Švedija','Norvegija','Suomija','Danija'].includes(c)).map((c:string)=><option key={c} value={c}>{c}</option>)}
                        </optgroup>
                      </Sel>
                    </div>
                    <div>
                      <SL>Žanras *</SL>
                      <Sel value={form.genre} onChange={(v:string)=>{ set('genre',v); set('substyles',[]) }} required>
                        <option value="">Pasirinkite...</option>
                        {GENRES.map(g=><option key={g} value={g}>{g}</option>)}
                      </Sel>
                    </div>
                  </div>

                  {/* FIX #5: Stiliai + inline search */}
                  <div>
                    <SL>Stiliai</SL>
                    <div className="flex items-center gap-2 flex-wrap">
                      <StyleModal selected={form.substyles||[]} onChange={v=>set('substyles',v)} />
                      <InlineStyleSearch
                        selected={form.substyles||[]}
                        onAdd={s => set('substyles', [...(form.substyles||[]), s])}
                      />
                    </div>
                  </div>
                </div>
              </Card>

              {/* FIX #7: Aprašymas — expandable */}
              <Card title="Aprašymas">
                <DescriptionEditor value={form.description} onChange={v=>set('description',v)} />
              </Card>

              {/* FIX #6: Veiklos laikotarpis moved to LEFT (was right) */}
              <Card title="Veiklos laikotarpis">
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <SL>Nuo</SL>
                    <Sel value={form.yearStart} onChange={(v:string)=>set('yearStart',v)}>
                      <option value="">Nežinoma</option>{YEARS.map(y=><option key={y} value={y}>{y}</option>)}
                    </Sel>
                  </div>
                  <div>
                    <SL>Iki</SL>
                    <Sel value={form.yearEnd} onChange={(v:string)=>set('yearEnd',v)}>
                      <option value="">Aktyvūs</option>{YEARS.map(y=><option key={y} value={y}>{y}</option>)}
                    </Sel>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <SL>Pertraukos</SL>
                    <button type="button" onClick={addBreak} className="text-xs text-music-blue hover:text-music-orange font-medium">+ Pridėti</button>
                  </div>
                  {form.breaks.map((br,i) => (
                    <div key={i} className="flex gap-2 mb-2 items-center">
                      <input value={br.from} onChange={e=>upBreak(i,'from',e.target.value)} placeholder="Nuo"
                        className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-music-blue" />
                      <span className="text-gray-400">–</span>
                      <input value={br.to} onChange={e=>upBreak(i,'to',e.target.value)} placeholder="Iki"
                        className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-music-blue" />
                      <button type="button" onClick={()=>rmBreak(i)} className="text-red-400 hover:text-red-600 font-bold">×</button>
                    </div>
                  ))}
                  {form.breaks.length===0 && <p className="text-xs text-gray-400 italic">Nėra pertraukų</p>}
                </div>
              </Card>

              {/* Solo info */}
              {form.type==='solo' && (
                <Card title="Atlikėjo informacija">
                  <div className="space-y-3">
                    <div>
                      <SL>Lytis</SL>
                      <div className="flex gap-4 mt-1">
                        {([['male','Vyras'],['female','Moteris']] as const).map(([v,l]) => (
                          <label key={v} className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="gender" value={v} checked={form.gender===v} onChange={()=>set('gender',v)} className="accent-music-blue" />
                            <span className="text-sm text-gray-700">{l}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <DateRow label="Gimė" y={form.birthYear} m={form.birthMonth} d={form.birthDay}
                      onY={(v:string)=>set('birthYear',v)} onM={(v:string)=>set('birthMonth',v)} onD={(v:string)=>set('birthDay',v)} />
                    <DateRow label="Mirė" y={form.deathYear} m={form.deathMonth} d={form.deathDay}
                      onY={(v:string)=>set('deathYear',v)} onM={(v:string)=>set('deathMonth',v)} onD={(v:string)=>set('deathDay',v)} />
                    <div>
                      <SL>Priklauso grupėms</SL>
                      <ArtistSearch label="Grupės" ph="Ieškoti grupės..." items={form.groups||[]}
                        onAdd={addGroup} onRemove={rmGroup} onYears={upGroup} filterType="group" />
                    </div>
                  </div>
                </Card>
              )}

              {/* FIX #6: Group members moved to LEFT */}
              {form.type==='group' && (
                <Card title="Grupės nariai">
                  <ArtistSearch label="Nariai" ph="Ieškoti atlikėjo..." items={form.members}
                    onAdd={addMember} onRemove={rmMember} onYears={upMember} filterType="solo" />
                </Card>
              )}
            </div>

            {/* ── RIGHT COLUMN ── */}
            <div className="space-y-5">

              {/* Profilio nuotrauka — horizontal: foto kairėje, valdymas dešinėje */}
              <Card title="Profilio nuotrauka">
                <AvatarUploadCompact
                  value={form.avatar}
                  onChange={setAvatar}
                  onOriginalSaved={url => {
                    if (!form.photos.find(p => p.url === url)) {
                      setPhotos([{ url }, ...form.photos])
                    }
                  }}
                />
              </Card>

              {/* Socialiniai tinklai */}
              <Card title="Socialiniai tinklai ir nuorodos">
                <div className="space-y-3">
                  {SOCIALS.map(({ key, label, icon, ph, type }) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-lg w-7 text-center flex-shrink-0">{icon}</span>
                      <div className="flex-1">
                        <input
                          type={type || 'url'}
                          value={form[key as keyof ArtistFormData] as string}
                          onChange={e => set(key as keyof ArtistFormData, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-music-blue"
                          placeholder={ph}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* music.lt domenas */}
              <Card title="music.lt domenas">
                <div>
                  <SL>Subdomenas</SL>
                  <div className="flex">
                    <Inp value={form.subdomain} onChange={(v:string)=>set('subdomain',v)} placeholder="vardas" />
                    <span className="px-3 py-2 bg-gray-100 border border-l-0 border-gray-300 rounded-r-lg text-gray-500 text-sm whitespace-nowrap">.music.lt</span>
                  </div>
                </div>
              </Card>
            </div>
          </div>

          {/* Nuotraukų galerija — full width, below both columns */}
          <Card title="Nuotraukų galerija" className="mt-5">
            <PhotoGallery photos={form.photos} onChange={setPhotos} artistName={form.name} />
          </Card>

          {/* Submit */}
          <div className="mt-6 flex gap-4">
            <button id="submit-btn" type="submit"
              className="flex-1 bg-gradient-to-r from-music-blue to-blue-600 text-white font-bold py-4 rounded-xl hover:opacity-90 text-lg shadow-md">
              ✓ {submitLabel}
            </button>
            <Link href={backHref} className="px-8 py-4 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 flex items-center font-medium">
              Atšaukti
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
