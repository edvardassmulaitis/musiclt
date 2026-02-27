'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Link as TiptapLink } from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'

// ─── Types ───────────────────────────────────────────────────────────────────

type NewsForm = {
  title: string
  slug: string
  type: string
  body: string
  source_url: string
  source_name: string
  is_featured: boolean
  is_hidden_home: boolean
  is_title_page: boolean
  is_delfi: boolean
  artist_id: number | null
  artist_id2: number | null
  album_code: string
  image_small_url: string
  image_title_url: string
  image1_url: string; image1_caption: string
  image2_url: string; image2_caption: string
  image3_url: string; image3_caption: string
  image4_url: string; image4_caption: string
  image5_url: string; image5_caption: string
  published_at: string
}

const emptyForm: NewsForm = {
  title: '', slug: '', type: 'news', body: '',
  source_url: '', source_name: '',
  is_featured: false, is_hidden_home: false, is_title_page: false, is_delfi: false,
  artist_id: null, artist_id2: null, album_code: '',
  image_small_url: '', image_title_url: '',
  image1_url: '', image1_caption: '', image2_url: '', image2_caption: '',
  image3_url: '', image3_caption: '', image4_url: '', image4_caption: '',
  image5_url: '', image5_caption: '',
  published_at: new Date().toISOString().slice(0, 16),
}

const TYPE_OPTIONS = [
  { value: 'news', label: 'Naujiena' },
  { value: 'review', label: 'Recenzija' },
  { value: 'report', label: 'Reportažas' },
  { value: 'interview', label: 'Interviu' },
  { value: 'other', label: 'Kita' },
]

// ─── Artist Search ────────────────────────────────────────────────────────────

function ArtistSearch({ value, onChange, placeholder = 'Ieškoti atlikėjo...' }: {
  value: { id: number; name: string } | null
  onChange: (a: { id: number; name: string } | null) => void
  placeholder?: string
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!q) { setResults([]); return }
    const t = setTimeout(async () => {
      setLoading(true)
      const res = await fetch(`/api/artists?limit=8&search=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults(data.artists || [])
      setLoading(false)
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  if (value) return (
    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl">
      {value.id && (
        <img src={`/api/artists/${value.id}/avatar`} alt="" className="w-6 h-6 rounded-full object-cover bg-gray-200"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
      )}
      <span className="text-sm text-blue-800 font-medium flex-1">{value.name}</span>
      <button type="button" onClick={() => onChange(null)} className="text-blue-400 hover:text-blue-600 text-lg leading-none">×</button>
    </div>
  )

  return (
    <div className="relative">
      <input
        type="text" value={q} onChange={e => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)} placeholder={placeholder}
        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-blue-400"
      />
      {open && (results.length > 0 || loading) && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {loading && <div className="px-3 py-2 text-xs text-gray-400">Ieškoma...</div>}
          {results.map(a => (
            <button key={a.id} type="button"
              onClick={() => { onChange({ id: a.id, name: a.name }); setQ(''); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left text-sm text-gray-700 transition-colors">
              {a.cover_image_url && <img src={a.cover_image_url} alt="" className="w-6 h-6 rounded-full object-cover" />}
              <span>{a.name}</span>
              <span className="text-xs text-gray-400 ml-auto">{a.country}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Rich Text Editor ─────────────────────────────────────────────────────────

function RichEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TiptapLink.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: 'Rašykite naujieną...' }),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: { class: 'prose prose-sm max-w-none focus:outline-none min-h-[300px] px-4 py-3 text-gray-800' },
    },
  })

  if (!editor) return null

  const btn = (action: () => void, label: string, active = false) => (
    <button type="button" onClick={action}
      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${active ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
      {label}
    </button>
  )

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-gray-100 bg-gray-50/80">
        {btn(() => editor.chain().focus().toggleBold().run(), 'B', editor.isActive('bold'))}
        {btn(() => editor.chain().focus().toggleItalic().run(), 'I', editor.isActive('italic'))}
        {btn(() => editor.chain().focus().toggleStrike().run(), 'S̶', editor.isActive('strike'))}
        <div className="w-px h-4 bg-gray-200 mx-1" />
        {btn(() => editor.chain().focus().toggleHeading({ level: 2 }).run(), 'H2', editor.isActive('heading', { level: 2 }))}
        {btn(() => editor.chain().focus().toggleHeading({ level: 3 }).run(), 'H3', editor.isActive('heading', { level: 3 }))}
        <div className="w-px h-4 bg-gray-200 mx-1" />
        {btn(() => editor.chain().focus().toggleBulletList().run(), '• Sąrašas', editor.isActive('bulletList'))}
        {btn(() => editor.chain().focus().toggleOrderedList().run(), '1. Sąrašas', editor.isActive('orderedList'))}
        <div className="w-px h-4 bg-gray-200 mx-1" />
        {btn(() => editor.chain().focus().toggleBlockquote().run(), '❝ Citata', editor.isActive('blockquote'))}
        {btn(() => editor.chain().focus().setHorizontalRule().run(), '— Linija')}
        <div className="w-px h-4 bg-gray-200 mx-1" />
        <button type="button" onClick={() => {
          const url = window.prompt('Nuorodos URL:')
          if (url) editor.chain().focus().setLink({ href: url }).run()
        }} className={`px-2 py-1 rounded text-xs font-medium transition-colors ${editor.isActive('link') ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
          🔗 Nuoroda
        </button>

      </div>
      <EditorContent editor={editor} />
    </div>
  )
}

// ─── Image Field ─────────────────────────────────────────────────────────────

function ImageField({ label, value, caption, onUrlChange, onCaptionChange, artistId }: {
  label: string; value: string; caption?: string
  onUrlChange: (v: string) => void
  onCaptionChange?: (v: string) => void
  artistId?: number | null
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</label>
      <div className="flex gap-2">
        {value && (
          <img src={value} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0 bg-gray-100 border border-gray-200" />
        )}
        <div className="flex-1 space-y-1.5">
          <input type="url" value={value} onChange={e => onUrlChange(e.target.value)}
            placeholder="https://..."
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-blue-400" />
          {onCaptionChange !== undefined && (
            <input type="text" value={caption || ''} onChange={e => onCaptionChange(e.target.value)}
              placeholder="Aprašymas ir šaltinis..."
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-blue-400" />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Right Panel: Related News ────────────────────────────────────────────────

function RelatedNewsPanel({ artistId, currentId }: { artistId: number | null; currentId?: string }) {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!artistId) { setItems([]); return }
    setLoading(true)
    fetch(`/api/news?limit=10&artist_id=${artistId}`)
      .then(r => r.json())
      .then(d => setItems((d.news || []).filter((n: any) => String(n.id) !== currentId)))
      .finally(() => setLoading(false))
  }, [artistId, currentId])

  if (!artistId) return (
    <div className="flex-1 flex items-center justify-center p-8 text-center">
      <div>
        <div className="text-4xl mb-3 opacity-30">📰</div>
        <p className="text-sm text-gray-400">Pasirinkite atlikėją kad matytumėte susijusias naujienas</p>
      </div>
    </div>
  )

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-2">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 mb-3">
        Kitos šio atlikėjo naujienos
      </p>
      {loading && (
        <div className="flex justify-center py-8">
          <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {!loading && items.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-8">Nėra kitų naujienų</p>
      )}
      {items.map(item => (
        <Link key={item.id} href={`/admin/news/${item.id}`}
          className="flex items-center gap-2.5 p-2.5 bg-white rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all group">
          {item.image_small_url ? (
            <img src={item.image_small_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0 bg-gray-100" />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-gray-100 shrink-0 flex items-center justify-center text-base">📰</div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-800 line-clamp-2 group-hover:text-blue-700 transition-colors">{item.title}</p>
            <p className="text-xs text-gray-400 mt-0.5">{new Date(item.published_at).toLocaleDateString('lt-LT')}</p>
          </div>
        </Link>
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EditNews() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const newsId = params?.id as string | undefined
  const isNew = !newsId || newsId === 'new'

  const [form, setForm] = useState<NewsForm>(emptyForm)
  const [artistObj, setArtistObj] = useState<{ id: number; name: string } | null>(null)
  const [artist2Obj, setArtist2Obj] = useState<{ id: number; name: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(!isNew)
  const [tab, setTab] = useState<'form' | 'images' | 'related'>('form')

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  const set = (key: keyof NewsForm, val: any) => setForm(f => ({ ...f, [key]: val }))

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/auth/signin'); return }
    if (status === 'authenticated' && !isAdmin) { router.push('/'); return }
    if (isNew || status !== 'authenticated') return

    fetch(`/api/news/${newsId}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { alert('Naujiena nerasta!'); router.push('/admin/news'); return }
        setForm({
          title: data.title || '', slug: data.slug || '', type: data.type || 'news',
          body: data.body || '', source_url: data.source_url || '', source_name: data.source_name || '',
          is_featured: data.is_featured || false, is_hidden_home: data.is_hidden_home || false,
          is_title_page: data.is_title_page || false, is_delfi: data.is_delfi || false,
          artist_id: data.artist_id || null, artist_id2: data.artist_id2 || null,
          album_code: data.album_code || '',
          image_small_url: data.image_small_url || '', image_title_url: data.image_title_url || '',
          image1_url: data.image1_url || '', image1_caption: data.image1_caption || '',
          image2_url: data.image2_url || '', image2_caption: data.image2_caption || '',
          image3_url: data.image3_url || '', image3_caption: data.image3_caption || '',
          image4_url: data.image4_url || '', image4_caption: data.image4_caption || '',
          image5_url: data.image5_url || '', image5_caption: data.image5_caption || '',
          published_at: data.published_at ? data.published_at.slice(0, 16) : new Date().toISOString().slice(0, 16),
        })
        if (data.artist) setArtistObj({ id: data.artist.id, name: data.artist.name })
        if (data.artist2) setArtist2Obj({ id: data.artist2.id, name: data.artist2.name })
        setLoading(false)
      })
  }, [status, isAdmin, newsId, isNew, router])

  useEffect(() => { if (isNew) setLoading(false) }, [isNew])

  const handleSave = useCallback(async () => {
    if (!form.title) { setError('Pavadinimas privalomas'); return }
    setSaving(true); setError('')
    try {
      const payload = { ...form, artist_id: artistObj?.id || null, artist_id2: artist2Obj?.id || null }
      const url = isNew ? '/api/news' : `/api/news/${newsId}`
      const method = isNew ? 'POST' : 'PUT'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (isNew && data.id) router.push(`/admin/news/${data.id}`)
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }, [form, artistObj, artist2Obj, isNew, newsId, router])

  if (status === 'loading' || loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="flex flex-col bg-[#f8f7f5]" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>

      {/* Header */}
      <div className="shrink-0 bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="flex items-center justify-between gap-2 px-4 py-2">
          <nav className="hidden lg:flex items-center gap-1 text-sm min-w-0 shrink overflow-hidden">
            <Link href="/admin" className="text-gray-400 hover:text-gray-700 shrink-0">Admin</Link>
            <span className="text-gray-300 shrink-0">/</span>
            <Link href="/admin/news" className="text-gray-400 hover:text-gray-700 shrink-0">Naujienos</Link>
            <span className="text-gray-300 shrink-0">/</span>
            <span className="text-gray-800 font-semibold truncate max-w-[300px]">
              {isNew ? 'Nauja naujiena' : (form.title || '...')}
            </span>
          </nav>
          {/* Mobile */}
          <div className="lg:hidden flex items-center gap-2">
            <Link href="/admin/news" className="text-gray-400 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            </Link>
            <span className="text-sm font-semibold text-gray-700 truncate max-w-[160px]">
              {isNew ? 'Nauja naujiena' : (form.title || '...')}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Link href="/admin/news" className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
              Atšaukti
            </Link>
            <button onClick={handleSave} disabled={saving}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${saved ? 'bg-green-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'} disabled:opacity-50`}>
              {saving
                ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" /> Saugoma...</>
                : saved ? '✓ Išsaugota!' : '✓ Išsaugoti'}
            </button>
          </div>
        </div>

        {/* Mobile tabs */}
        <div className="flex lg:hidden border-t border-gray-100">
          {(['form', 'images', 'related'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${tab === t ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/30' : 'text-gray-400 hover:text-gray-600'}`}>
              {t === 'form' ? '✏️ Forma' : t === 'images' ? '🖼 Nuotraukos' : '📰 Susijusios'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="shrink-0 px-3 pt-2">
          <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-center gap-2">
            ❌ {error}
            <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">✕</button>
          </div>
        </div>
      )}

      {/* Mobile content */}
      <div className="lg:hidden flex-1 overflow-y-auto">
        {tab === 'form' && <FormPanel form={form} set={set} artistObj={artistObj} setArtistObj={setArtistObj} artist2Obj={artist2Obj} setArtist2Obj={setArtist2Obj} />}
        {tab === 'images' && <ImagesPanel form={form} set={set} />}
        {tab === 'related' && <RelatedNewsPanel artistId={form.artist_id} currentId={newsId} />}
      </div>

      {/* Desktop dual-pane */}
      <div className="hidden lg:flex flex-1 min-h-0">
        <div className="overflow-y-auto border-r border-gray-200" style={{ width: '60%' }}>
          <FormPanel form={form} set={set} artistObj={artistObj} setArtistObj={setArtistObj} artist2Obj={artist2Obj} setArtist2Obj={setArtist2Obj} />
        </div>
        <div className="flex flex-col overflow-hidden" style={{ width: '40%' }}>
          <RightPanel form={form} set={set} artistId={form.artist_id} currentId={newsId} />
        </div>
      </div>
    </div>
  )
}

// ─── Form Panel ───────────────────────────────────────────────────────────────

function FormPanel({ form, set, artistObj, setArtistObj, artist2Obj, setArtist2Obj }: {
  form: NewsForm; set: (k: keyof NewsForm, v: any) => void
  artistObj: any; setArtistObj: (a: any) => void
  artist2Obj: any; setArtist2Obj: (a: any) => void
}) {
  return (
    <div className="p-4 space-y-5">

      {/* Pavadinimas */}
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Pavadinimas *</label>
        <textarea value={form.title} onChange={e => set('title', e.target.value)} rows={2}
          placeholder="Naujienos antraštė..."
          className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 font-semibold placeholder:text-gray-400 focus:outline-none focus:border-blue-400 resize-none text-base" />
      </div>

      {/* Tipas + Data */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Tipas</label>
          <select value={form.type} onChange={e => set('type', e.target.value)}
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:border-blue-400">
            {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Publikavimo data</label>
          <input type="datetime-local" value={form.published_at} onChange={e => set('published_at', e.target.value)}
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:border-blue-400" />
        </div>
      </div>

      {/* Atlikėjai */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Atlikėjas 1</label>
          <ArtistSearch value={artistObj} onChange={a => { setArtistObj(a); (set as any)('artist_id', a?.id || null) }} />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Atlikėjas 2</label>
          <ArtistSearch value={artist2Obj} onChange={a => { setArtist2Obj(a); (set as any)('artist_id2', a?.id || null) }}
            placeholder="Papildomas atlikėjas..." />
        </div>
      </div>

      {/* Tekstas */}
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Tekstas</label>
        <RichEditor value={form.body} onChange={v => set('body', v)} />
      </div>

      {/* Šaltinis */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Šaltinio URL</label>
          <input type="url" value={form.source_url} onChange={e => set('source_url', e.target.value)}
            placeholder="https://..."
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-blue-400" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Šaltinio pavadinimas</label>
          <input type="text" value={form.source_name} onChange={e => set('source_name', e.target.value)}
            placeholder="pvz. 15min, Delfi..."
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-blue-400" />
        </div>
      </div>

      {/* Slug */}
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Slug (URL)</label>
        <input type="text" value={form.slug} onChange={e => set('slug', e.target.value)}
          placeholder="generuojamas automatiškai..."
          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-600 font-mono placeholder:text-gray-300 focus:outline-none focus:border-blue-400" />
      </div>

      {/* Varnelės */}
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Nustatymai</label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { key: 'is_featured', label: '⭐ Pagrindinis', desc: 'Rodomas išskirtinai' },
            { key: 'is_hidden_home', label: '👁 Slėpti pradžioje', desc: 'Nematomas pagrindiniame' },
            { key: 'is_title_page', label: '📌 Titulinis', desc: 'Tituliniame puslapyje' },
            { key: 'is_delfi', label: '🔗 Delfi', desc: 'Iš Delfi portalo' },
          ].map(({ key, label, desc }) => (
            <label key={key} className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${(form as any)[key] ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200 hover:border-gray-300'}`}>
              <input type="checkbox" checked={(form as any)[key]} onChange={e => set(key as keyof NewsForm, e.target.checked)} className="sr-only" />
              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${(form as any)[key] ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                {(form as any)[key] && <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 fill-white"><path d="M2 6l3 3 5-5"/></svg>}
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-700">{label}</div>
                <div className="text-xs text-gray-400">{desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Right Panel (Desktop) ────────────────────────────────────────────────────

function RightPanel({ form, set, artistId, currentId }: {
  form: NewsForm; set: (k: keyof NewsForm, v: any) => void
  artistId: number | null; currentId?: string
}) {
  const [section, setSection] = useState<'images' | 'related'>('images')

  return (
    <div className="h-full flex flex-col">
      {/* Sub-tabs */}
      <div className="shrink-0 flex border-b border-gray-200 bg-white/80 backdrop-blur sticky top-0 z-10">
        {(['images', 'related'] as const).map(s => (
          <button key={s} onClick={() => setSection(s)}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${section === s ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/30' : 'text-gray-400 hover:text-gray-600'}`}>
            {s === 'images' ? '🖼 Nuotraukos' : '📰 Susijusios'}
          </button>
        ))}
      </div>

      {section === 'images' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <ImageField label="Maža nuotrauka (46×46)" value={form.image_small_url}
            onUrlChange={v => set('image_small_url', v)} />
          <ImageField label="Titulinio nuotrauka" value={form.image_title_url}
            onUrlChange={v => set('image_title_url', v)} />
          {[1, 2, 3, 4, 5].map(i => (
            <ImageField key={i}
              label={`${i}. Didelė nuotrauka`}
              value={(form as any)[`image${i}_url`]}
              caption={(form as any)[`image${i}_caption`]}
              onUrlChange={v => set(`image${i}_url` as keyof NewsForm, v)}
              onCaptionChange={v => set(`image${i}_caption` as keyof NewsForm, v)}
            />
          ))}
        </div>
      )}

      {section === 'related' && (
        <RelatedNewsPanel artistId={artistId} currentId={currentId} />
      )}
    </div>
  )
}

// ─── Images Panel (Mobile) ────────────────────────────────────────────────────

function ImagesPanel({ form, set }: { form: NewsForm; set: (k: keyof NewsForm, v: any) => void }) {
  return (
    <div className="p-4 space-y-4">
      <ImageField label="Maža nuotrauka (46×46)" value={form.image_small_url}
        onUrlChange={v => set('image_small_url', v)} />
      <ImageField label="Titulinio nuotrauka" value={form.image_title_url}
        onUrlChange={v => set('image_title_url', v)} />
      {[1, 2, 3, 4, 5].map(i => (
        <ImageField key={i}
          label={`${i}. Didelė nuotrauka`}
          value={(form as any)[`image${i}_url`]}
          caption={(form as any)[`image${i}_caption`]}
          onUrlChange={v => set(`image${i}_url` as keyof NewsForm, v)}
          onCaptionChange={v => set(`image${i}_caption` as keyof NewsForm, v)}
        />
      ))}
    </div>
  )
}
