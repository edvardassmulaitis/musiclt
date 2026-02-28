'use client'
// app/admin/news/[id]/page.tsx
// Pakeitimai nuo ankstesnės versijos:
//   1. Galerija valdoma iš šono panelės "Galerija" tab'o
//   2. Nuotraukos gali būti įkeltos tiesiai į galeriją (ne tik per editor)
//   3. Galima pertvarkyti nuotraukų tvarką (drag handles)
//   4. Kiekviena nuotrauka turi caption lauką
//   5. Pasirinkta hero nuotrauka rodoma su žymekiu

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import dynamic from 'next/dynamic'

// ─── Types ────────────────────────────────────────────────────────────────────

type NewsType = { id: number; label: string; slug: string }
type ArtistRef = { id: number; name: string; cover_image_url?: string }
type Photo = { url: string; caption?: string }

type NewsForm = {
  title: string
  slug: string
  type: string
  body: string
  source_url: string
  source_name: string
  is_hidden_home: boolean
  artists: ArtistRef[]
  image_small_url: string
  gallery: Photo[]          // ← NAUJAS: galerijos nuotraukos
  published_at: string
}

const emptyForm: NewsForm = {
  title: '', slug: '', type: 'news', body: '',
  source_url: '', source_name: '',
  is_hidden_home: false, artists: [],
  image_small_url: '',
  gallery: [],
  published_at: new Date().toISOString().slice(0, 16),
}

// ─── Upload helpers ───────────────────────────────────────────────────────────

async function uploadImage(file: File): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch('/api/upload', { method: 'POST', body: fd })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Upload nepavyko')
  return data.url
}

async function uploadFromUrl(url: string): Promise<string> {
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Upload nepavyko')
  return data.url
}

// ─── Mini Photo Crop ──────────────────────────────────────────────────────────

function MiniPhotoCrop({ src, onSave, onCancel }: {
  src: string; onSave: (url: string) => void; onCancel: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [zoom, setZoom] = useState(1)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const imgRef = useRef<HTMLImageElement | null>(null)
  const SIZE = 280

  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => { imgRef.current = img; draw() }
    img.src = src
  }, [src])

  useEffect(() => { draw() }, [zoom, offsetX, offsetY])

  const draw = () => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, SIZE, SIZE)
    const scale = Math.max(SIZE / img.width, SIZE / img.height) * zoom
    const w = img.width * scale, h = img.height * scale
    const x = (SIZE - w) / 2 + offsetX, y = (SIZE - h) / 2 + offsetY
    ctx.drawImage(img, x, y, w, h)
  }

  const handleSave = () => {
    canvasRef.current?.toBlob(async blob => {
      if (!blob) return
      try {
        const url = await uploadImage(new File([blob], 'mini.jpg', { type: 'image/jpeg' }))
        onSave(url)
      } catch (e: any) { alert(e.message) }
    }, 'image/jpeg', 0.9)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-4 w-80">
        <p className="text-sm font-bold text-gray-800 mb-3">✂️ Apkarpyti hero nuotrauką</p>
        <div className="flex justify-center mb-3">
          <canvas ref={canvasRef} width={SIZE} height={SIZE}
            className="rounded-xl border border-gray-200 cursor-move"
            style={{ width: SIZE, height: SIZE, touchAction: 'none' }}
            onMouseDown={e => { setDragging(true); setDragStart({ x: e.clientX - offsetX, y: e.clientY - offsetY }) }}
            onMouseMove={e => { if (!dragging) return; setOffsetX(e.clientX - dragStart.x); setOffsetY(e.clientY - dragStart.y) }}
            onMouseUp={() => setDragging(false)} onMouseLeave={() => setDragging(false)} />
        </div>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-gray-400">🔍</span>
          <input type="range" min="0.5" max="3" step="0.05" value={zoom}
            onChange={e => setZoom(parseFloat(e.target.value))} className="flex-1" />
          <span className="text-xs text-gray-400">{Math.round(zoom * 100)}%</span>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel}
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Atšaukti
          </button>
          <button type="button" onClick={handleSave}
            className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700">
            Naudoti kaip hero
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Gallery Manager ──────────────────────────────────────────────────────────
// Šoninė panelė su 3 tab'ais: Galerija | Atlikėjo nuotraukos | Hero pasirinkimas

function GalleryManager({
  gallery, onGalleryChange,
  heroUrl, onHeroChange,
  artists,
}: {
  gallery: Photo[]
  onGalleryChange: (g: Photo[]) => void
  heroUrl: string
  onHeroChange: (url: string) => void
  artists: ArtistRef[]
}) {
  const [tab, setTab] = useState<'gallery' | 'artist' | 'hero'>('gallery')
  const [artistPhotos, setArtistPhotos] = useState<Photo[]>([])
  const [activeArtistId, setActiveArtistId] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [captions, setCaptions] = useState<Record<number, string>>({})
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const artistId = activeArtistId || artists[0]?.id

  useEffect(() => {
    if (!artistId) { setArtistPhotos([]); return }
    fetch(`/api/artists/${artistId}`)
      .then(r => r.json())
      .then(d => setArtistPhotos(d.photos || []))
      .catch(() => {})
  }, [artistId])

  // Sync captions from gallery
  useEffect(() => {
    const m: Record<number, string> = {}
    gallery.forEach((p, i) => { m[i] = p.caption || '' })
    setCaptions(m)
  }, [gallery.length])

  const handleUpload = async (files: FileList | null) => {
    if (!files) return
    setUploading(true)
    const urls: Photo[] = []
    for (const file of Array.from(files)) {
      try {
        const url = await uploadImage(file)
        urls.push({ url, caption: '' })
      } catch (e: any) { alert(e.message) }
    }
    onGalleryChange([...gallery, ...urls])
    setUploading(false)
  }

  const handleUrlAdd = async (url: string) => {
    try {
      const stored = await uploadFromUrl(url)
      onGalleryChange([...gallery, { url: stored, caption: '' }])
    } catch (e: any) { alert(e.message) }
  }

  const addFromArtist = (photo: Photo) => {
    if (gallery.find(g => g.url === photo.url)) return
    onGalleryChange([...gallery, photo])
  }

  const removePhoto = (i: number) => {
    const updated = gallery.filter((_, j) => j !== i)
    onGalleryChange(updated)
  }

  const updateCaption = (i: number, caption: string) => {
    const updated = gallery.map((p, j) => j === i ? { ...p, caption } : p)
    onGalleryChange(updated)
    setCaptions(c => ({ ...c, [i]: caption }))
  }

  // Drag to reorder
  const handleDragStart = (i: number) => setDragIdx(i)
  const handleDragOver = (e: React.DragEvent, i: number) => { e.preventDefault(); setDragOver(i) }
  const handleDrop = (i: number) => {
    if (dragIdx === null || dragIdx === i) { setDragIdx(null); setDragOver(null); return }
    const updated = [...gallery]
    const [moved] = updated.splice(dragIdx, 1)
    updated.splice(i, 0, moved)
    onGalleryChange(updated)
    setDragIdx(null); setDragOver(null)
  }

  const TAB_BTN = 'flex-1 py-1.5 text-xs font-bold transition-colors border-b-2'
  const activeTab = 'border-blue-500 text-blue-600'
  const inactiveTab = 'border-transparent text-gray-400 hover:text-gray-600'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {cropSrc && (
        <MiniPhotoCrop src={cropSrc}
          onSave={url => { onHeroChange(url); setCropSrc(null); setTab('hero') }}
          onCancel={() => setCropSrc(null)} />
      )}

      {/* Tab bar */}
      <div className="shrink-0 flex border-b border-gray-100 px-3 bg-white/80">
        <button className={`${TAB_BTN} ${tab === 'gallery' ? activeTab : inactiveTab}`} onClick={() => setTab('gallery')}>
          Galerija {gallery.length > 0 && <span className="ml-1 text-[9px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">{gallery.length}</span>}
        </button>
        <button className={`${TAB_BTN} ${tab === 'artist' ? activeTab : inactiveTab}`} onClick={() => setTab('artist')}>
          Atlikėjas
        </button>
        <button className={`${TAB_BTN} ${tab === 'hero' ? activeTab : inactiveTab}`} onClick={() => setTab('hero')}>
          Hero
        </button>
      </div>

      {/* ── GALLERY TAB ── */}
      {tab === 'gallery' && (
        <div className="flex-1 overflow-y-auto">
          {/* Upload area */}
          <div className="p-3 border-b border-gray-100">
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
              onChange={e => handleUpload(e.target.files)} />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className="w-full py-2 border-2 border-dashed border-gray-200 rounded-xl text-xs font-bold text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-all flex items-center justify-center gap-2">
              {uploading
                ? <><span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /> Keliama...</>
                : <><span className="text-lg">+</span> Įkelti nuotraukas</>
              }
            </button>
            <UrlInput onAdd={handleUrlAdd} />
          </div>

          {/* Photos grid */}
          {gallery.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-8 text-center">
              <div>
                <div className="text-4xl mb-2 opacity-20">🖼</div>
                <p className="text-xs text-gray-400">Galerija tuščia.<br />Įkelkite nuotraukas viršuje.</p>
              </div>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              {gallery.map((photo, i) => (
                <div key={`${photo.url}-${i}`}
                  draggable onDragStart={() => handleDragStart(i)}
                  onDragOver={e => handleDragOver(e, i)} onDrop={() => handleDrop(i)}
                  className={`flex gap-2 items-start p-2 rounded-xl border transition-all cursor-grab active:cursor-grabbing ${dragOver === i ? 'border-blue-400 bg-blue-50' : 'border-gray-100 bg-white hover:border-gray-200'}`}>
                  {/* Drag handle */}
                  <div className="flex items-center justify-center w-4 h-full text-gray-300 mt-2 shrink-0">
                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><circle cx="9" cy="7" r="1.5"/><circle cx="15" cy="7" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="17" r="1.5"/><circle cx="15" cy="17" r="1.5"/></svg>
                  </div>
                  {/* Thumb */}
                  <div className="relative shrink-0">
                    <img src={photo.url} alt="" className="w-16 h-16 object-cover rounded-lg border border-gray-100" />
                    {heroUrl === photo.url && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-[8px] font-black">H</span>
                      </div>
                    )}
                  </div>
                  {/* Caption + actions */}
                  <div className="flex-1 min-w-0">
                    <input type="text" value={captions[i] || ''} placeholder="Komentaras..."
                      onChange={e => updateCaption(i, e.target.value)}
                      className="w-full px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 text-gray-700 placeholder:text-gray-300" />
                    <div className="flex gap-1 mt-1">
                      <button onClick={() => setCropSrc(photo.url)}
                        className="px-2 py-0.5 text-[10px] font-bold text-blue-500 hover:bg-blue-50 rounded-md transition-colors">
                        ✂️ Hero
                      </button>
                      <button onClick={() => { onHeroChange(photo.url) }}
                        className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-colors ${heroUrl === photo.url ? 'text-orange-600 bg-orange-50' : 'text-gray-400 hover:bg-gray-50'}`}>
                        {heroUrl === photo.url ? '★ Hero' : '☆ Hero'}
                      </button>
                      <button onClick={() => removePhoto(i)}
                        className="px-2 py-0.5 text-[10px] font-bold text-red-400 hover:bg-red-50 rounded-md transition-colors ml-auto">
                        🗑
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ARTIST TAB ── */}
      {tab === 'artist' && (
        <div className="flex-1 overflow-y-auto">
          {artists.length === 0 ? (
            <div className="flex items-center justify-center p-8 text-center">
              <div>
                <div className="text-3xl mb-2 opacity-20">👤</div>
                <p className="text-xs text-gray-400">Pasirinkite atlikėją formoje</p>
              </div>
            </div>
          ) : (
            <>
              {artists.length > 1 && (
                <div className="flex gap-1 px-3 pt-2">
                  {artists.map(a => (
                    <button key={a.id} onClick={() => setActiveArtistId(a.id)}
                      className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${artistId === a.id ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}>
                      {a.name}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-gray-400 px-3 py-2">
                Spausk nuotrauką → pridėti į galeriją
              </p>
              <div className="grid grid-cols-3 gap-1.5 p-3 pt-0">
                {artistPhotos.map((p, i) => {
                  const inGallery = gallery.some(g => g.url === p.url)
                  return (
                    <button key={i} onClick={() => addFromArtist(p)}
                      className={`relative group aspect-square rounded-lg overflow-hidden border-2 transition-all ${inGallery ? 'border-green-400 opacity-60' : 'border-transparent hover:border-blue-400'}`}>
                      <img src={p.url} alt="" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-all flex items-center justify-center">
                        {inGallery
                          ? <span className="text-white text-xs font-black bg-green-500 px-1.5 py-0.5 rounded">✓</span>
                          : <span className="opacity-0 group-hover:opacity-100 text-white text-xs font-black bg-blue-600 px-1.5 py-0.5 rounded transition-all">+</span>
                        }
                      </div>
                    </button>
                  )
                })}
                {artistPhotos.length === 0 && (
                  <div className="col-span-3 py-8 text-center text-xs text-gray-400">
                    Atlikėjas neturi nuotraukų
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── HERO TAB ── */}
      {tab === 'hero' && (
        <div className="flex-1 overflow-y-auto p-3">
          <p className="text-[10px] text-gray-400 mb-3">
            Hero nuotrauka rodoma straipsnio viršuje per visą ekraną. Pasirinkite iš galerijos arba įkelkite atskirai.
          </p>

          {/* Current hero */}
          {heroUrl && (
            <div className="mb-4">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Dabartinė</div>
              <div className="relative rounded-xl overflow-hidden border border-orange-200">
                <img src={heroUrl} alt="Hero" className="w-full h-32 object-cover" />
                <div className="absolute bottom-0 inset-x-0 bg-black/50 px-3 py-2 flex items-center justify-between">
                  <span className="text-white text-[10px] font-bold">Hero nuotrauka</span>
                  <button onClick={() => setCropSrc(heroUrl)}
                    className="text-[10px] font-bold text-orange-300 hover:text-white">✂️ Apkarpyti</button>
                </div>
              </div>
              <button onClick={() => onHeroChange('')}
                className="mt-1 text-[10px] text-red-400 hover:text-red-600 font-medium">
                × Pašalinti hero
              </button>
            </div>
          )}

          {/* Pick from gallery */}
          {gallery.length > 0 && (
            <>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Pasirinkti iš galerijos</div>
              <div className="grid grid-cols-3 gap-1.5 mb-4">
                {gallery.map((p, i) => (
                  <button key={i} onClick={() => onHeroChange(p.url)}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${heroUrl === p.url ? 'border-orange-500' : 'border-transparent hover:border-orange-300'}`}>
                    <img src={p.url} alt="" className="w-full h-full object-cover" />
                    {heroUrl === p.url && (
                      <div className="absolute inset-0 bg-orange-500/20 flex items-center justify-center">
                        <span className="text-white text-lg">★</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Upload separate hero */}
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Įkelti atskirai</div>
          <HeroUploadArea onHeroChange={onHeroChange} onCropOpen={url => setCropSrc(url)} />
        </div>
      )}
    </div>
  )
}

// ─── URL Input ────────────────────────────────────────────────────────────────

function UrlInput({ onAdd }: { onAdd: (url: string) => void }) {
  const [val, setVal] = useState('')
  const [loading, setLoading] = useState(false)

  const handle = async () => {
    if (!val.trim()) return
    setLoading(true)
    try { await onAdd(val.trim()); setVal('') } catch {}
    setLoading(false)
  }

  return (
    <div className="flex gap-1 mt-1.5">
      <input type="url" value={val} onChange={e => setVal(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handle()}
        placeholder="Arba įklijuoti nuorodą..."
        className="flex-1 px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 placeholder:text-gray-300 focus:outline-none focus:border-blue-400" />
      <button onClick={handle} disabled={loading || !val.trim()}
        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold disabled:opacity-40 hover:bg-blue-700">
        {loading ? '...' : '+'}
      </button>
    </div>
  )
}

// ─── Hero Upload Area ─────────────────────────────────────────────────────────

function HeroUploadArea({ onHeroChange, onCropOpen }: {
  onHeroChange: (url: string) => void
  onCropOpen: (url: string) => void
}) {
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handle = async (files: FileList | null) => {
    if (!files?.[0]) return
    setUploading(true)
    try {
      const url = await uploadImage(files[0])
      onCropOpen(url)
    } catch (e: any) { alert(e.message) }
    setUploading(false)
  }

  return (
    <div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={e => handle(e.target.files)} />
      <button onClick={() => fileRef.current?.click()} disabled={uploading}
        className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-xs font-bold text-gray-400 hover:border-orange-300 hover:text-orange-400 transition-all flex items-center justify-center gap-2">
        {uploading
          ? <><span className="w-3 h-3 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" /> Keliama...</>
          : '📤 Įkelti hero nuotrauką'}
      </button>
    </div>
  )
}

// ─── EditorJs wrapper ─────────────────────────────────────────────────────────

const EditorJsClient = dynamic(
  () => import('./editor-client').then(m => m.EditorJsClient),
  {
    ssr: false,
    loading: () => (
      <div className="border border-gray-200 rounded-lg bg-white min-h-[200px] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    ),
  }
)

// ─── TypeSelector ─────────────────────────────────────────────────────────────

function TypeSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [types, setTypes] = useState<NewsType[]>([])
  const [adding, setAdding] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/news-types').then(r => r.json()).then(d => Array.isArray(d) && setTypes(d))
  }, [])

  useEffect(() => { if (adding) setTimeout(() => inputRef.current?.focus(), 50) }, [adding])

  const handleAdd = async () => {
    if (!newLabel.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/news-types', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newLabel.trim() }),
      })
      const created = await res.json()
      if (created.id) { setTypes(prev => [...prev, created]); onChange(created.slug) }
    } finally { setSaving(false); setAdding(false); setNewLabel('') }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {types.map(t => (
        <button key={t.id} type="button" onClick={() => onChange(t.slug)}
          className={`px-2.5 py-0.5 rounded-full text-xs font-semibold transition-all border ${value === t.slug ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'}`}>
          {t.label}
        </button>
      ))}
      {adding ? (
        <div className="flex items-center gap-1">
          <input ref={inputRef} type="text" value={newLabel} onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setAdding(false); setNewLabel('') } }}
            placeholder="Naujas tipas..."
            className="px-2 py-0.5 bg-white border border-blue-300 rounded-full text-xs text-gray-800 focus:outline-none w-28 placeholder:text-gray-400" />
          <button type="button" onClick={handleAdd} disabled={saving}
            className="px-2 py-0.5 bg-blue-600 text-white rounded-full text-xs disabled:opacity-50">{saving ? '...' : '✓'}</button>
          <button type="button" onClick={() => { setAdding(false); setNewLabel('') }} className="text-gray-400 text-xs">✕</button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)}
          className="px-2.5 py-0.5 rounded-full text-xs font-semibold border border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-all">
          + Naujas
        </button>
      )}
    </div>
  )
}

// ─── MultiArtistSearch ────────────────────────────────────────────────────────

function MultiArtistSearch({ value, onChange }: { value: ArtistRef[]; onChange: (v: ArtistRef[]) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<ArtistRef[]>([])
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!q) { setResults([]); return }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/artists?limit=8&search=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults((data.artists || []).filter((a: ArtistRef) => !value.find(v => v.id === a.id)))
    }, 250)
    return () => clearTimeout(t)
  }, [q, value])

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div ref={containerRef} className="flex flex-wrap items-center gap-1.5">
      {value.map(a => (
        <div key={a.id} className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 border border-blue-200 rounded-lg">
          {a.cover_image_url && <img src={a.cover_image_url} alt="" className="w-4 h-4 rounded-full object-cover" />}
          <span className="text-xs font-medium text-blue-800">{a.name}</span>
          <button type="button" onClick={() => onChange(value.filter(x => x.id !== a.id))} className="text-blue-400 hover:text-blue-600 text-sm leading-none">×</button>
        </div>
      ))}
      <div className="relative">
        <input type="text" value={q} onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={value.length === 0 ? 'Ieškoti atlikėjo...' : '+ Pridėti...'}
          className="px-2.5 py-1 bg-white border border-gray-200 rounded-lg text-xs text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-blue-400 w-36" />
        {open && results.length > 0 && (
          <div className="absolute z-50 top-full left-0 mt-0.5 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden w-48">
            {results.map(a => (
              <button key={a.id} type="button" onClick={() => { onChange([...value, a]); setQ(''); setOpen(false) }}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left text-sm text-gray-700 transition-colors">
                {a.cover_image_url && <img src={a.cover_image_url} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />}
                <span className="truncate">{a.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── SourceInput ──────────────────────────────────────────────────────────────

function SourceInput({ nameValue, urlValue, onNameChange, onUrlChange }: {
  nameValue: string; urlValue: string; onNameChange: (v: string) => void; onUrlChange: (v: string) => void
}) {
  const [history, setHistory] = useState<{ name: string; url: string }[]>([])
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try { const s = localStorage.getItem('news_source_history'); if (s) setHistory(JSON.parse(s)) } catch {}
  }, [])

  const suggestions = nameValue
    ? history.filter(h => h.name.toLowerCase().includes(nameValue.toLowerCase()))
    : history.slice(0, 5)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const save = () => {
    if (!nameValue || !urlValue) return
    const updated = [{ name: nameValue, url: urlValue }, ...history.filter(h => h.name !== nameValue)].slice(0, 20)
    setHistory(updated)
    try { localStorage.setItem('news_source_history', JSON.stringify(updated)) } catch {}
  }

  return (
    <div ref={containerRef} className="grid grid-cols-2 gap-2">
      <div className="relative">
        <input type="text" value={nameValue} onChange={e => { onNameChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)} onBlur={save}
          placeholder="pvz. Delfi, 15min..."
          className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-blue-400" />
        {open && suggestions.length > 0 && (
          <div className="absolute z-50 bottom-full left-0 right-0 mb-0.5 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
            {suggestions.map((s, i) => (
              <button key={i} type="button" onMouseDown={() => { onNameChange(s.name); onUrlChange(s.url); setOpen(false) }}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-sm text-gray-700">
                <span className="font-medium">{s.name}</span>
                <span className="text-xs text-gray-400 truncate ml-2 max-w-[100px]">{s.url.replace('https://', '')}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <input type="url" value={urlValue} onChange={e => onUrlChange(e.target.value)} onBlur={save}
        placeholder="https://..."
        className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-blue-400" />
    </div>
  )
}

// ─── Label ────────────────────────────────────────────────────────────────────

const Label = ({ children }: { children: React.ReactNode }) => (
  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{children}</span>
)

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function EditNews() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const newsId = params?.id as string | undefined
  const isNew = !newsId || newsId === 'new'

  const [form, setForm] = useState<NewsForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(!isNew)
  const [mobileTab, setMobileTab] = useState<'form' | 'gallery'>('form')
  const [showSlug, setShowSlug] = useState(false)
  const [showDate, setShowDate] = useState(false)
  const dateRef = useRef<HTMLDivElement>(null)
  const slugRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'
  const set = useCallback((key: keyof NewsForm, val: any) => setForm(f => ({ ...f, [key]: val })), [])

  // Close popups on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (dateRef.current && !dateRef.current.contains(e.target as Node)) setShowDate(false)
      if (slugRef.current && !slugRef.current.contains(e.target as Node)) setShowSlug(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  // Auth check + load
  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/auth/signin'); return }
    if (status === 'authenticated' && !isAdmin) { router.push('/'); return }
    if (isNew || status !== 'authenticated') { setLoading(false); return }

    fetch(`/api/news/${newsId}`).then(r => r.json()).then(data => {
      if (data.error) { alert('Naujiena nerasta!'); router.push('/admin/news'); return }
      setForm({
        title: data.title || '',
        slug: data.slug || '',
        type: data.type || 'news',
        body: data.body || '',
        source_url: data.source_url || '',
        source_name: data.source_name || '',
        is_hidden_home: data.is_hidden_home || false,
        artists: [...(data.artist ? [data.artist] : []), ...(data.artist2 ? [data.artist2] : [])],
        image_small_url: data.image_small_url || '',
        gallery: data.gallery || [],
        published_at: data.published_at ? data.published_at.slice(0, 16) : new Date().toISOString().slice(0, 16),
      })
      setLoading(false)
    })
  }, [status, isAdmin, newsId, isNew, router])

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [form.title])

  const handleSave = useCallback(async () => {
    if (!form.title) { setError('Pavadinimas privalomas'); return }
    setSaving(true); setError('')
    try {
      const payload = {
        ...form,
        artist_id: form.artists[0]?.id || null,
        artist_id2: form.artists[1]?.id || null,
      }
      const url = isNew ? '/api/news' : `/api/news/${newsId}`
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (isNew && data.id) router.push(`/admin/news/${data.id}`)
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }, [form, isNew, newsId, router])

  if (status === 'loading' || loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  // Artist photos for editor gallery toolbar
  const artistPhotos = form.artists[0]
    ? [] // loaded async in GalleryManager
    : []

  return (
    <div className="flex flex-col bg-[#f8f7f5]" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div className="shrink-0 bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="flex items-center justify-between gap-2 px-4 py-2">
          {/* Breadcrumb */}
          <nav className="hidden lg:flex items-center gap-1 text-sm min-w-0">
            <Link href="/admin" className="text-gray-400 hover:text-gray-700 shrink-0">Admin</Link>
            <span className="text-gray-300">/</span>
            <Link href="/admin/news" className="text-gray-400 hover:text-gray-700 shrink-0">Naujienos</Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-800 font-semibold truncate max-w-[280px]">
              {isNew ? 'Nauja naujiena' : (form.title || '...')}
            </span>
          </nav>
          {/* Mobile back */}
          <div className="lg:hidden flex items-center gap-2">
            <Link href="/admin/news" className="text-gray-400 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            </Link>
            <span className="text-sm font-semibold text-gray-700 truncate max-w-[160px]">
              {isNew ? 'Nauja' : (form.title || '...')}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Preview link */}
            {!isNew && form.slug && (
              <a href={`/news/${form.slug}`} target="_blank" rel="noopener"
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-none stroke-current stroke-2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                Peržiūra
              </a>
            )}
            <Link href="/admin/news"
              className="px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg text-sm hover:bg-gray-50 transition-colors">
              Atšaukti
            </Link>
            <button onClick={handleSave} disabled={saving}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold transition-all disabled:opacity-50 ${saved ? 'bg-green-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
              {saving
                ? <><span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" /> Saugoma...</>
                : saved ? '✓ Išsaugota!' : '✓ Išsaugoti'}
            </button>
          </div>
        </div>

        {/* Mobile tabs */}
        <div className="flex lg:hidden border-t border-gray-100">
          {(['form', 'gallery'] as const).map(t => (
            <button key={t} onClick={() => setMobileTab(t)}
              className={`flex-1 py-2 text-xs font-semibold transition-colors ${mobileTab === t ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400'}`}>
              {t === 'form' ? '✏️ Forma' : '🖼 Galerija'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="shrink-0 px-3 pt-1.5">
          <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs flex items-center gap-2">
            ❌ {error}
            <button onClick={() => setError('')} className="ml-auto text-red-400">✕</button>
          </div>
        </div>
      )}

      {/* ── Mobile layout ── */}
      <div className="lg:hidden flex-1 overflow-y-auto">
        {mobileTab === 'form' && (
          <FormPane form={form} set={set} textareaRef={textareaRef}
            showSlug={showSlug} setShowSlug={setShowSlug}
            showDate={showDate} setShowDate={setShowDate}
            slugRef={slugRef} dateRef={dateRef} />
        )}
        {mobileTab === 'gallery' && (
          <GalleryManager
            gallery={form.gallery}
            onGalleryChange={g => set('gallery', g)}
            heroUrl={form.image_small_url}
            onHeroChange={url => set('image_small_url', url)}
            artists={form.artists}
          />
        )}
      </div>

      {/* ── Desktop layout ── */}
      <div className="hidden lg:flex flex-1 min-h-0">
        {/* Form column */}
        <div className="overflow-y-auto border-r border-gray-200" style={{ width: '60%' }}>
          <FormPane form={form} set={set} textareaRef={textareaRef}
            showSlug={showSlug} setShowSlug={setShowSlug}
            showDate={showDate} setShowDate={setShowDate}
            slugRef={slugRef} dateRef={dateRef} />
        </div>
        {/* Gallery column */}
        <div className="flex flex-col overflow-hidden" style={{ width: '40%' }}>
          <div className="shrink-0 px-3 py-2 border-b border-gray-100 bg-white/80 flex items-center justify-between">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Galerija ir nuotraukos</span>
            <span className="text-[10px] text-gray-400">{form.gallery.length} nuotr.</span>
          </div>
          <GalleryManager
            gallery={form.gallery}
            onGalleryChange={g => set('gallery', g)}
            heroUrl={form.image_small_url}
            onHeroChange={url => set('image_small_url', url)}
            artists={form.artists}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Form Pane ────────────────────────────────────────────────────────────────

function FormPane({ form, set, textareaRef, showSlug, setShowSlug, showDate, setShowDate, slugRef, dateRef }: {
  form: NewsForm
  set: (k: keyof NewsForm, v: any) => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  showSlug: boolean; setShowSlug: (v: boolean) => void
  showDate: boolean; setShowDate: (v: boolean) => void
  slugRef: React.RefObject<HTMLDivElement | null>
  dateRef: React.RefObject<HTMLDivElement | null>
}) {
  // Artist photos for editor toolbar
  const [artistPhotos, setArtistPhotos] = useState<Photo[]>([])

  useEffect(() => {
    const artistId = form.artists[0]?.id
    if (!artistId) { setArtistPhotos([]); return }
    fetch(`/api/artists/${artistId}`)
      .then(r => r.json())
      .then(d => setArtistPhotos(d.photos || []))
      .catch(() => {})
  }, [form.artists])

  // Gallery photos for editor toolbar too
  const editorPhotos = [
    ...form.gallery,
    ...artistPhotos.filter(p => !form.gallery.find(g => g.url === p.url)),
  ]

  return (
    <div className="p-3 space-y-3">

      {/* Title */}
      <div>
        <textarea ref={textareaRef} value={form.title} onChange={e => set('title', e.target.value)} rows={1}
          placeholder="Naujienos antraštė..."
          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 font-semibold placeholder:text-gray-300 focus:outline-none focus:border-blue-400 resize-none text-sm leading-snug overflow-hidden" />

        {/* Meta row: slug · date · hidden */}
        <div className="flex flex-wrap items-center gap-3 mt-1 px-0.5">
          <div className="relative" ref={slugRef}>
            <button type="button" onClick={() => setShowSlug(!showSlug)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors">
              <svg viewBox="0 0 24 24" className="w-3 h-3 fill-none stroke-current stroke-2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              {form.slug ? form.slug.slice(0, 20) + (form.slug.length > 20 ? '…' : '') : 'slug'}
            </button>
            {showSlug && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-2 w-64">
                <input type="text" value={form.slug} onChange={e => set('slug', e.target.value)}
                  placeholder="url-slug..."
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs font-mono text-gray-600 focus:outline-none focus:border-blue-400" />
              </div>
            )}
          </div>
          <span className="text-gray-200 text-xs">·</span>
          <div className="relative" ref={dateRef}>
            <button type="button" onClick={() => setShowDate(!showDate)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors">
              <svg viewBox="0 0 24 24" className="w-3 h-3 fill-none stroke-current stroke-2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              {new Date(form.published_at).toLocaleDateString('lt-LT')}
            </button>
            {showDate && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-2">
                <input type="datetime-local" value={form.published_at} onChange={e => set('published_at', e.target.value)}
                  className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 focus:outline-none focus:border-blue-400" />
              </div>
            )}
          </div>
          <span className="text-gray-200 text-xs">·</span>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <div className={`w-7 h-4 rounded-full transition-colors relative ${form.is_hidden_home ? 'bg-orange-400' : 'bg-gray-200'}`}
              onClick={() => set('is_hidden_home', !form.is_hidden_home)}>
              <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${form.is_hidden_home ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-xs text-gray-400">Slėpti</span>
          </label>
        </div>
      </div>

      {/* Type + Artists */}
      <div className="space-y-3">
        <div>
          <Label>Tipas</Label>
          <div className="mt-1"><TypeSelector value={form.type} onChange={v => set('type', v)} /></div>
        </div>
        <div>
          <Label>Atlikėjai</Label>
          <div className="mt-1"><MultiArtistSearch value={form.artists} onChange={v => set('artists', v)} /></div>
        </div>
      </div>

      {/* Source */}
      <div>
        <Label>Šaltinis</Label>
        <div className="mt-1">
          <SourceInput nameValue={form.source_name} urlValue={form.source_url}
            onNameChange={v => set('source_name', v)} onUrlChange={v => set('source_url', v)} />
        </div>
      </div>

      {/* Body */}
      <div>
        <Label>Tekstas</Label>
        <div className="mt-1">
          <EditorJsClient
            value={form.body}
            onChange={v => set('body', v)}
            photos={editorPhotos}
            onUploadedImage={url => {
              // Add to gallery if not already there
              if (!form.gallery.find(g => g.url === url)) {
                set('gallery', [...form.gallery, { url, caption: '' }])
              }
              // Set as hero if none
              if (!form.image_small_url) set('image_small_url', url)
            }}
          />
        </div>
      </div>

    </div>
  )
}
