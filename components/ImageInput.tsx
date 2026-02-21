'use client'

import { useRef, useState, useCallback, useEffect } from 'react'

type Mode = 'square' | 'circle'

type Props = {
  value?: string
  onChange: (base64: string) => void
  label?: string
  size?: number
  mode?: Mode
}

export default function ImageInput({ value, onChange, label = 'Nuotrauka', size = 200, mode = 'square' }: Props) {
  const [src, setSrc] = useState<string | null>(null)
  const [cropMode, setCropMode] = useState(false)
  const [urlMode, setUrlMode] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [urlError, setUrlError] = useState('')
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState<{ mx: number; my: number; x: number; y: number } | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const CROP_SIZE = 260

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => { setSrc(ev.target?.result as string); setPos({ x: 0, y: 0 }); setScale(1); setCropMode(true) }
    reader.readAsDataURL(file)
  }

  const handleUrl = async () => {
    setUrlError('')
    if (!urlInput.trim()) return
    // Fetch via server proxy → get base64, then open in cropper
    try {
      const res = await fetch('/api/fetch-image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim() }),
      })
      if (res.ok) {
        const { dataUrl } = await res.json()
        if (dataUrl) {
          setSrc(dataUrl); setPos({ x: 0, y: 0 }); setScale(1); setCropMode(true); setUrlMode(false)
          return
        }
      }
    } catch {}
    // Fallback: try direct (may fail due to CORS on canvas, but at least show something)
    setSrc(urlInput.trim()); setPos({ x: 0, y: 0 }); setScale(1); setCropMode(true); setUrlMode(false)
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !src) return
    const ctx = canvas.getContext('2d')!
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = src
    img.onload = () => {
      ctx.clearRect(0, 0, CROP_SIZE, CROP_SIZE)
      const sw = img.naturalWidth * scale
      const sh = img.naturalHeight * scale
      const ox = (CROP_SIZE - sw) / 2 + pos.x
      const oy = (CROP_SIZE - sh) / 2 + pos.y

      if (mode === 'circle') {
        // Draw image
        ctx.save()
        ctx.beginPath()
        ctx.rect(0, 0, CROP_SIZE, CROP_SIZE)
        ctx.clip()
        ctx.drawImage(img, ox, oy, sw, sh)
        // Dim
        ctx.fillStyle = 'rgba(0,0,0,0.4)'
        ctx.fillRect(0, 0, CROP_SIZE, CROP_SIZE)
        // Clear circle
        ctx.globalCompositeOperation = 'destination-out'
        ctx.beginPath()
        ctx.arc(CROP_SIZE / 2, CROP_SIZE / 2, CROP_SIZE / 2 - 4, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalCompositeOperation = 'source-over'
        // Draw image inside circle
        ctx.save()
        ctx.beginPath()
        ctx.arc(CROP_SIZE / 2, CROP_SIZE / 2, CROP_SIZE / 2 - 4, 0, Math.PI * 2)
        ctx.clip()
        ctx.drawImage(img, ox, oy, sw, sh)
        ctx.restore()
        ctx.restore()
      } else {
        // Square crop - draw with guide lines
        ctx.drawImage(img, ox, oy, sw, sh)
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'
        ctx.lineWidth = 1
        ctx.strokeRect(4, 4, CROP_SIZE - 8, CROP_SIZE - 8)
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'
        ctx.beginPath()
        ctx.moveTo(CROP_SIZE / 3, 0); ctx.lineTo(CROP_SIZE / 3, CROP_SIZE)
        ctx.moveTo(2 * CROP_SIZE / 3, 0); ctx.lineTo(2 * CROP_SIZE / 3, CROP_SIZE)
        ctx.moveTo(0, CROP_SIZE / 3); ctx.lineTo(CROP_SIZE, CROP_SIZE / 3)
        ctx.moveTo(0, 2 * CROP_SIZE / 3); ctx.lineTo(CROP_SIZE, 2 * CROP_SIZE / 3)
        ctx.stroke()
      }
    }
  }, [src, pos, scale, mode])

  useEffect(() => { if (cropMode) draw() }, [cropMode, draw])

  const cropAndSave = () => {
    const canvas = document.createElement('canvas')
    canvas.width = size; canvas.height = size
    const ctx = canvas.getContext('2d')!
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = src!
    img.onload = () => {
      if (mode === 'circle') {
        ctx.beginPath()
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
        ctx.clip()
      }
      const sw = img.naturalWidth * scale
      const sh = img.naturalHeight * scale
      const ox = (CROP_SIZE - sw) / 2 + pos.x
      const oy = (CROP_SIZE - sh) / 2 + pos.y
      const ratio = size / CROP_SIZE
      ctx.drawImage(img, ox * ratio, oy * ratio, sw * ratio, sh * ratio)
      onChange(canvas.toDataURL('image/jpeg', 0.85))
      setCropMode(false); setSrc(null)
    }
  }

  const onMouseDown = (e: React.MouseEvent) => {
    setDragStart({ mx: e.clientX, my: e.clientY, x: pos.x, y: pos.y }); setDragging(true)
  }
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging || !dragStart) return
    setPos({ x: dragStart.x + e.clientX - dragStart.mx, y: dragStart.y + e.clientY - dragStart.my })
  }
  const onMouseUp = () => { setDragging(false); setDragStart(null) }

  const isUrl = value && (value.startsWith('http://') || value.startsWith('https://'))
  const previewClass = mode === 'circle' ? 'rounded-full' : 'rounded-lg'

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>

      {!cropMode && !urlMode && (
        <div className="flex items-start gap-4">
          {value ? (
            <img src={value} alt="" className={`w-20 h-20 object-cover border-2 border-gray-200 ${previewClass}`} />
          ) : (
            <div className={`w-20 h-20 bg-gray-100 flex items-center justify-center text-3xl border-2 border-dashed border-gray-300 ${previewClass}`}>📷</div>
          )}
          <div className="space-y-2">
            <div className="flex gap-2">
              <button type="button" onClick={() => fileRef.current?.click()}
                className="px-3 py-1.5 text-sm bg-music-blue text-white rounded-lg hover:opacity-90">
                📁 Įkelti failą
              </button>
              <button type="button" onClick={() => setUrlMode(true)}
                className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                🔗 Naudoti URL
              </button>
              {value && (
                <button type="button" onClick={() => onChange('')}
                  className="px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100">
                  ✕
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400">
              {mode === 'circle' ? 'Bus apkarpyta į apskritimą' : 'Bus apkarpyta kvadratiškai'} · JPG, PNG
            </p>
          </div>
        </div>
      )}

      {/* URL input */}
      {urlMode && !cropMode && (
        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
          <label className="block text-sm font-medium text-gray-700">Įveskite nuotraukos URL</label>
          <input type="url" value={urlInput} onChange={e => setUrlInput(e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-music-blue text-sm"
            placeholder="https://www.music.lt/images/groups/..." />
          {urlError && <p className="text-xs text-red-500">{urlError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={handleUrl}
              className="px-4 py-2 bg-music-blue text-white rounded-lg text-sm hover:opacity-90 font-medium">
              Taikyti
            </button>
            <button type="button" onClick={() => { setUrlMode(false); setUrlInput('') }}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50">
              Atšaukti
            </button>
          </div>
        </div>
      )}

      {/* Crop UI */}
      {cropMode && (
        <div className="bg-gray-900 rounded-xl p-5 max-w-xs">
          <p className="text-white text-xs mb-3 text-center">🖱️ Tempk · ⚙️ Scroll = mastas</p>
          <div className="flex justify-center mb-3">
            <canvas ref={canvasRef} width={CROP_SIZE} height={CROP_SIZE}
              className="rounded-lg" style={{ cursor: dragging ? 'grabbing' : 'grab' }}
              onMouseDown={onMouseDown} onMouseMove={onMouseMove}
              onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
              onWheel={e => { e.preventDefault(); setScale(s => Math.max(0.1, Math.min(5, s - e.deltaY * 0.002))) }} />
          </div>
          <input type="range" min="0.1" max="5" step="0.01" value={scale}
            onChange={e => setScale(parseFloat(e.target.value))}
            className="w-full mb-3 accent-music-blue" />
          <div className="flex gap-2">
            <button type="button" onClick={cropAndSave}
              className="flex-1 py-2 bg-music-blue text-white rounded-lg text-sm font-medium hover:opacity-90">✓ Išsaugoti</button>
            <button type="button" onClick={() => { setCropMode(false); setSrc(null) }}
              className="px-4 py-2 bg-gray-700 text-white rounded-lg text-sm">Atšaukti</button>
          </div>
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  )
}
