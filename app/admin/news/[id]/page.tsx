'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { useEditor, EditorContent, Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Link as TiptapLink } from '@tiptap/extension-link'
import TiptapImage from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'

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
  published_at: string
}

const emptyForm: NewsForm = {
  title: '', slug: '', type: 'news', body: '',
  source_url: '', source_name: '',
  is_hidden_home: false, artists: [],
  image_small_url: '',
  published_at: new Date().toISOString().slice(0, 16),
}

// ─── Image Upload Helper ──────────────────────────────────────────────────────

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

function MiniPhotoCrop({ src, onSave, onCancel }: { src: string; onSave: (url: string) => void; onCancel: () => void }) {
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
    const w = img.width * scale
    const h = img.height * scale
    const x = (SIZE - w) / 2 + offsetX
    const y = (SIZE - h) / 2 + offsetY
    ctx.drawImage(img, x, y, w, h)
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true)
    setDragStart({ x: e.clientX - offsetX, y: e.clientY - offsetY })
  }
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return
    setOffsetX(e.clientX - dragStart.x)
    setOffsetY(e.clientY - dragStart.y)
  }
  const handleMouseUp = () => setDragging(false)

  const handleSave = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob(async blob => {
      if (!blob) return
      const file = new File([blob], 'mini.jpg', { type: 'image/jpeg' })
      try {
        const url = await uploadImage(file)
        onSave(url)
      } catch (e: any) { alert(e.message) }
    }, 'image/jpeg', 0.9)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-4 w-80">
        <p className="text-sm font-bold text-gray-800 mb-3">✂️ Apkarpyti mini nuotrauką</p>
        <div className="flex justify-center mb-3">
          <canvas ref={canvasRef} width={SIZE} height={SIZE}
            className="rounded-xl border border-gray-200 cursor-move"
            style={{ width: SIZE, height: SIZE, touchAction: 'none' }}
            onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} />
        </div>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-gray-400">🔍</span>
          <input type="range" min="0.5" max="3" step="0.05" value={zoom}
            onChange={e => setZoom(parseFloat(e.target.value))}
            className="flex-1" />
          <span className="text-xs text-gray-400">{Math.round(zoom * 100)}%</span>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel}
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Atšaukti
          </button>
          <button type="button" onClick={handleSave}
            className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700">
            Išsaugoti
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Rich Text Editor ─────────────────────────────────────────────────────────

function insertImageToEditor(editor: Editor, url: string) {
  editor.chain().focus().insertContent({
    type: 'paragraph',
    content: [{
      type: 'text',
      text: ' ',
    }]
  }).run()
  // Insert as HTML
  const view = editor.view
  const { state, dispatch } = view
  const { tr, schema } = state
  // Use insertContent with html
  editor.chain().focus().insertContent(`<p><img src="${url}" alt="" style="max-width:100%;border-radius:8px;" /></p>`).run()
}

function RichEditor({ value, onChange, photos, onUploadedImage }: {
  value: string
  onChange: (v: string) => void
  photos: Photo[]
  onUploadedImage?: (url: string) => void
}) {
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        blockquote: { HTMLAttributes: { class: 'blockquote' } },
      }),
      TiptapLink.configure({ openOnClick: false }),
      TiptapImage.configure({ inline: false, allowBase64: false, HTMLAttributes: { style: 'max-width:100%;border-radius:8px;margin:4px 0;' } }),
      Placeholder.configure({ placeholder: 'Rašykite naujieną...' }),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: { class: 'prose prose-sm max-w-none focus:outline-none min-h-[200px] px-3 py-2.5 text-gray-800 text-sm' },
    },
  })

  const insertImg = useCallback((url: string) => {
    if (!editor) return
    editor.chain().focus().setImage({ src: url }).run()
    onUploadedImage?.(url)
  }, [editor, onUploadedImage])

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || !editor) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue
        const url = await uploadImage(file)
        insertImg(url)
      }
    } catch (e: any) { alert(e.message) }
    finally { setUploading(false) }
  }

  const handleUrlInsert = async () => {
    const url = window.prompt('Nuotraukos URL:')
    if (!url || !editor) return
    setUploading(true)
    try {
      const stored = await uploadFromUrl(url)
      insertImg(stored)
    } catch { insertImg(url) }
    finally { setUploading(false) }
  }

  // Drag & drop on editor
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    await handleFileUpload(e.dataTransfer.files)
  }

  if (!editor) return null

  const Btn = ({ onClick, label, active = false, disabled = false }: { onClick: () => void; label: string; active?: boolean; disabled?: boolean }) => (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`px-1.5 py-0.5 rounded text-xs font-medium transition-colors disabled:opacity-40 ${active ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}>
      {label}
    </button>
  )

  return (
    <div className="border border-gray-200 rounded-lg overflow-visible bg-white">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1 border-b border-gray-100 bg-gray-50/60">
        <Btn onClick={() => editor.chain().focus().toggleBold().run()} label="B" active={editor.isActive('bold')} />
        <Btn onClick={() => editor.chain().focus().toggleItalic().run()} label="I" active={editor.isActive('italic')} />
        <Btn onClick={() => editor.chain().focus().toggleStrike().run()} label="S̶" active={editor.isActive('strike')} />
        <div className="w-px h-3 bg-gray-200 mx-0.5" />
        <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} label="H2" active={editor.isActive('heading', { level: 2 })} />
        <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} label="H3" active={editor.isActive('heading', { level: 3 })} />
        <div className="w-px h-3 bg-gray-200 mx-0.5" />
        <Btn onClick={() => editor.chain().focus().toggleBulletList().run()} label="• Sąrašas" active={editor.isActive('bulletList')} />
        <Btn onClick={() => editor.chain().focus().toggleOrderedList().run()} label="1." active={editor.isActive('orderedList')} />
        <Btn onClick={() => editor.chain().focus().toggleBlockquote().run()} label="❝ Citata" active={editor.isActive('blockquote')} />
        <div className="w-px h-3 bg-gray-200 mx-0.5" />
        <button type="button" onClick={() => {
          const url = window.prompt('Nuorodos URL:')
          if (url) editor.chain().focus().setLink({ href: url }).run()
        }} className={`px-1.5 py-0.5 rounded text-xs font-medium transition-colors ${editor.isActive('link') ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
          🔗
        </button>
        <div className="w-px h-3 bg-gray-200 mx-0.5" />
        {/* Photo insert from gallery */}
        {photos.length > 0 && (
          <div className="relative group/gallery">
            <button type="button" className="px-1.5 py-0.5 rounded text-xs font-medium text-gray-500 hover:bg-gray-100 transition-colors">
              📷 Galerija
            </button>
            <div className="absolute left-0 top-full mt-0.5 bg-white border border-gray-200 rounded-xl shadow-xl z-[100] p-2 hidden group-hover/gallery:flex gap-1.5 flex-wrap min-w-[180px] max-w-[280px]">
              {photos.slice(0, 9).map((p, i) => (
                <button key={i} type="button" onClick={() => insertImg(p.url)}
                  className="w-12 h-12 rounded-lg overflow-hidden border-2 border-transparent hover:border-blue-400 transition-all shrink-0">
                  <img src={p.url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}
        {/* Upload from device */}
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
          className="px-1.5 py-0.5 rounded text-xs font-medium text-gray-500 hover:bg-gray-100 transition-colors disabled:opacity-40">
          {uploading ? '⏳' : '📁 Įkelti'}
        </button>
        <Btn onClick={handleUrlInsert} label="🔗 URL" disabled={uploading} />
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
          onChange={e => handleFileUpload(e.target.files)} />
      </div>
      {/* Editor area with drop support */}
      <div onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
        <EditorContent editor={editor} />
        {uploading && (
          <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-100 bg-blue-50 text-xs text-blue-600">
            <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin inline-block" />
            Įkeliama nuotrauka...
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Type Selector ────────────────────────────────────────────────────────────

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

// ─── Multi Artist Search ──────────────────────────────────────────────────────

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
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
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
      {/* Inline search */}
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

// ─── Source Input ─────────────────────────────────────────────────────────────

function SourceInput({ nameValue, urlValue, onNameChange, onUrlChange }: {
  nameValue: string; urlValue: string; onNameChange: (v: string) => void; onUrlChange: (v: string) => void
}) {
  const [suggestions, setSuggestions] = useState<{ name: string; url: string }[]>([])
  const [open, setOpen] = useState(false)
  const [history, setHistory] = useState<{ name: string; url: string }[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try { const s = localStorage.getItem('news_source_history'); if (s) setHistory(JSON.parse(s)) } catch {}
  }, [])

  useEffect(() => {
    setSuggestions(nameValue ? history.filter(h => h.name.toLowerCase().includes(nameValue.toLowerCase())) : history.slice(0, 5))
  }, [nameValue, history])

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
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
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-sm text-gray-700 transition-colors">
                <span className="font-medium">{s.name}</span>
                <span className="text-xs text-gray-400 truncate ml-2 max-w-[100px]">{s.url.replace('https://', '')}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <input type="url" value={urlValue} onChange={e => onUrlChange(e.target.value)} onBlur={save}
        placeholder="https://..." className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-blue-400" />
    </div>
  )
}

// ─── Artist Photos Panel ──────────────────────────────────────────────────────

function ArtistPhotosPanel({ artists, selectedMini, onSelectMini }: {
  artists: ArtistRef[]
  selectedMini: string
  onSelectMini: (url: string) => void
}) {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(false)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)

  const artistId = activeId || artists[0]?.id

  useEffect(() => {
    if (!artistId) { setPhotos([]); return }
    setLoading(true)
    fetch(`/api/artists/${artistId}`).then(r => r.json()).then(d => setPhotos(d.photos || [])).finally(() => setLoading(false))
  }, [artistId])

  if (artists.length === 0) return (
    <div className="flex-1 flex items-center justify-center p-6 text-center">
      <div>
        <div className="text-3xl mb-2 opacity-20">🖼</div>
        <p className="text-xs text-gray-400">Pasirinkite atlikėją</p>
      </div>
    </div>
  )

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {cropSrc && (
        <MiniPhotoCrop src={cropSrc} onSave={url => { onSelectMini(url); setCropSrc(null) }} onCancel={() => setCropSrc(null)} />
      )}
      {artists.length > 1 && (
        <div className="shrink-0 flex gap-1 px-3 pt-2 overflow-x-auto">
          {artists.map(a => (
            <button key={a.id} type="button" onClick={() => setActiveId(a.id)}
              className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${artistId === a.id ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}>
              {a.name}
            </button>
          ))}
        </div>
      )}
      <p className="text-[10px] text-gray-400 px-3 py-1.5 shrink-0">Paspausk nuotrauką → apkarpyti kaip mini foto kortelėje</p>
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : photos.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-gray-400">Nėra nuotraukų</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-3 gap-1.5">
            {photos.map((p, i) => (
              <button key={i} type="button" onClick={() => setCropSrc(p.url)}
                className={`relative group aspect-square rounded-lg overflow-hidden border-2 transition-all ${selectedMini === p.url ? 'border-blue-500' : 'border-transparent hover:border-blue-300'}`}>
                <img src={p.url} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-end justify-center pb-1">
                  <span className="opacity-0 group-hover:opacity-100 text-white text-[10px] font-bold bg-blue-600 px-1.5 py-0.5 rounded transition-all">✂️ Apkarpyti</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function EditNews() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const newsId = params?.id as string | undefined
  const isNew = !newsId || newsId === 'new'

  const [form, setForm] = useState<NewsForm>(emptyForm)
  const [artistPhotos, setArtistPhotos] = useState<Photo[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(!isNew)
  const [tab, setTab] = useState<'form' | 'photos'>('form')
  const [showSlug, setShowSlug] = useState(false)
  const [showDate, setShowDate] = useState(false)
  const dateRef = useRef<HTMLDivElement | null>(null)
  const slugRef = useRef<HTMLDivElement | null>(null)

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'
  const set = useCallback((key: keyof NewsForm, val: any) => setForm(f => ({ ...f, [key]: val })), [])

  useEffect(() => {
    const artistId = form.artists[0]?.id
    if (!artistId) { setArtistPhotos([]); return }
    fetch(`/api/artists/${artistId}`).then(r => r.json()).then(d => setArtistPhotos(d.photos || [])).catch(() => {})
  }, [form.artists])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dateRef.current && !dateRef.current.contains(e.target as Node)) setShowDate(false)
      if (slugRef.current && !slugRef.current.contains(e.target as Node)) setShowSlug(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/auth/signin'); return }
    if (status === 'authenticated' && !isAdmin) { router.push('/'); return }
    if (isNew || status !== 'authenticated') { setLoading(false); return }
    fetch(`/api/news/${newsId}`).then(r => r.json()).then(data => {
      if (data.error) { alert('Naujiena nerasta!'); router.push('/admin/news'); return }
      setForm({
        title: data.title || '', slug: data.slug || '', type: data.type || 'news',
        body: data.body || '', source_url: data.source_url || '', source_name: data.source_name || '',
        is_hidden_home: data.is_hidden_home || false,
        artists: [...(data.artist ? [data.artist] : []), ...(data.artist2 ? [data.artist2] : [])],
        image_small_url: data.image_small_url || '',
        published_at: data.published_at ? data.published_at.slice(0, 16) : new Date().toISOString().slice(0, 16),
      })
      setLoading(false)
    })
  }, [status, isAdmin, newsId, isNew, router])

  const handleSave = useCallback(async () => {
    if (!form.title) { setError('Pavadinimas privalomas'); return }
    setSaving(true); setError('')
    try {
      const payload = { ...form, artist_id: form.artists[0]?.id || null, artist_id2: form.artists[1]?.id || null }
      const url = isNew ? '/api/news' : `/api/news/${newsId}`
      const res = await fetch(url, { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
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

  const Label = ({ children }: { children: React.ReactNode }) => (
    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{children}</span>
  )

  return (
    <div className="flex flex-col bg-[#f8f7f5]" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>

      {/* Header */}
      <div className="shrink-0 bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="flex items-center justify-between gap-2 px-4 py-2">
          <nav className="hidden lg:flex items-center gap-1 text-sm min-w-0 overflow-hidden">
            <Link href="/admin" className="text-gray-400 hover:text-gray-700 shrink-0">Admin</Link>
            <span className="text-gray-300">/</span>
            <Link href="/admin/news" className="text-gray-400 hover:text-gray-700 shrink-0">Naujienos</Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-800 font-semibold truncate max-w-[280px]">{isNew ? 'Nauja naujiena' : (form.title || '...')}</span>
          </nav>
          <div className="lg:hidden flex items-center gap-2">
            <Link href="/admin/news" className="text-gray-400 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            </Link>
            <span className="text-sm font-semibold text-gray-700 truncate max-w-[160px]">{isNew ? 'Nauja' : (form.title || '...')}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Link href="/admin/news" className="px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg text-sm hover:bg-gray-50 transition-colors">Atšaukti</Link>
            <button onClick={handleSave} disabled={saving}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold transition-all disabled:opacity-50 ${saved ? 'bg-green-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
              {saving ? <><span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" /> Saugoma...</> : saved ? '✓ Išsaugota!' : '✓ Išsaugoti'}
            </button>
          </div>
        </div>
        <div className="flex lg:hidden border-t border-gray-100">
          {(['form', 'photos'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 text-xs font-semibold transition-colors ${tab === t ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400'}`}>
              {t === 'form' ? '✏️ Forma' : '🖼 Nuotraukos'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="shrink-0 px-3 pt-1.5">
          <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs flex items-center gap-2">
            ❌ {error}<button onClick={() => setError('')} className="ml-auto text-red-400">✕</button>
          </div>
        </div>
      )}

      {/* Mobile */}
      <div className="lg:hidden flex-1 overflow-y-auto">
        {tab === 'form' && <FormPane form={form} set={set} artistPhotos={artistPhotos} Label={Label} showSlug={showSlug} setShowSlug={setShowSlug} showDate={showDate} setShowDate={setShowDate} slugRef={slugRef} dateRef={dateRef} />}
        {tab === 'photos' && <ArtistPhotosPanel artists={form.artists} selectedMini={form.image_small_url} onSelectMini={url => set('image_small_url', url)} />}
      </div>

      {/* Desktop */}
      <div className="hidden lg:flex flex-1 min-h-0">
        <div className="overflow-y-auto border-r border-gray-200" style={{ width: '62%' }}>
          <FormPane form={form} set={set} artistPhotos={artistPhotos} Label={Label} showSlug={showSlug} setShowSlug={setShowSlug} showDate={showDate} setShowDate={setShowDate} slugRef={slugRef} dateRef={dateRef} />
        </div>
        <div className="flex flex-col overflow-hidden" style={{ width: '38%' }}>
          <div className="shrink-0 px-3 py-2 border-b border-gray-100 bg-white/80 flex items-center justify-between">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Atlikėjo nuotraukos</span>
            {form.image_small_url && (
              <div className="flex items-center gap-2">
                <img src={form.image_small_url} alt="" className="w-10 h-10 rounded-lg object-cover border border-gray-200 cursor-pointer hover:opacity-80" 
                  onClick={() => window.open(form.image_small_url, '_blank')} title="Paspausti peržiūrai" />
                <div>
                  <p className="text-[10px] text-gray-500 font-medium">Mini pasirinkta</p>
                  <button type="button" onClick={() => set('image_small_url', '')} className="text-[10px] text-red-400 hover:text-red-600">✕ Pašalinti</button>
                </div>
              </div>
            )}
          </div>
          <ArtistPhotosPanel artists={form.artists} selectedMini={form.image_small_url} onSelectMini={url => set('image_small_url', url)} />
        </div>
      </div>
    </div>
  )
}

// ─── Form Pane ────────────────────────────────────────────────────────────────

function FormPane({ form, set, artistPhotos, Label, showSlug, setShowSlug, showDate, setShowDate, slugRef, dateRef }: {
  form: NewsForm
  set: (k: keyof NewsForm, v: any) => void
  artistPhotos: Photo[]
  Label: ({ children }: { children: React.ReactNode }) => React.ReactElement
  showSlug: boolean; setShowSlug: (v: boolean) => void
  showDate: boolean; setShowDate: (v: boolean) => void
  slugRef: React.RefObject<HTMLDivElement | null>
  dateRef: React.RefObject<HTMLDivElement | null>
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [form.title])

  return (
    <div className="p-3 space-y-3">

      {/* Title */}
      <div>
        <textarea ref={textareaRef} value={form.title} onChange={e => set('title', e.target.value)} rows={1}
          placeholder="Naujienos antraštė..."
          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 font-semibold placeholder:text-gray-300 focus:outline-none focus:border-blue-400 resize-none text-sm leading-snug overflow-hidden" />
        {/* Meta row */}
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
                  placeholder="url-slug..." className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs font-mono text-gray-600 focus:outline-none focus:border-blue-400" />
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

      {/* Type + Artists row */}
      <div className="grid grid-cols-1 gap-3">
        <div>
          <Label>Tipas</Label>
          <div className="mt-1"><TypeSelector value={form.type} onChange={v => set('type', v)} /></div>
        </div>
        <div>
          <Label>Atlikėjai</Label>
          <div className="mt-1"><MultiArtistSearch value={form.artists} onChange={v => set('artists', v)} /></div>
        </div>
      </div>

      {/* Source – before body */}
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
          <RichEditor value={form.body} onChange={v => set('body', v)} photos={artistPhotos}
            onUploadedImage={url => { if (!form.image_small_url) set('image_small_url', url) }} />
        </div>
      </div>

    </div>
  )
}
