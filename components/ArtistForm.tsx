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
  avatar: string; photos: Photo[]
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
  avatar:'', photos:[], website:'', subdomain:'',
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

// ── AvatarUpload — handles file upload, URL input, Wikipedia image caching ───
function AvatarUpload({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [urlInput, setUrlInput] = useState(value || '')

  useEffect(() => { setUrlInput(value || '') }, [value])

  const uploadFile = async (file: File) => {
    setUploading(true); setError('')
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload nepavyko')
      onChange(data.url)
    } catch (e: any) { setError(e.message) }
    finally { setUploading(false) }
  }

  // Always store external URLs via fetch-image proxy → Supabase
  const storeUrl = async (raw: string) => {
    const v = raw.trim()
    if (!v) { onChange(''); return }
    if (v.includes('supabase')) { onChange(v); return }
    if (v.startsWith('http')) {
      setUploading(true); setError('')
      try {
        const res = await fetch('/api/fetch-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: v }),
        })
        if (res.ok) {
          const d = await res.json()
          if (d.url && !d.url.startsWith('data:')) { onChange(d.url); setUrlInput(d.url); return }
        }
      } catch {}
      finally { setUploading(false) }
      onChange(v) // fallback: use as-is
    }
  }

  return (
    <div className="space-y-2">
      {/* Preview / drop zone */}
      <div
        className="relative rounded-xl overflow-hidden cursor-pointer group border-2 border-dashed border-gray-200 hover:border-music-blue transition-colors"
        style={{ aspectRatio: '1/1', maxWidth: 180 }}
        onClick={() => !uploading && fileRef.current?.click()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) uploadFile(f) }}
        onDragOver={e => e.preventDefault()}
      >
        {value ? (
          <>
            <img src={value} alt="" referrerPolicy="no-referrer"
              className="w-full h-full object-cover group-hover:opacity-80 transition-opacity" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="text-white text-xs font-medium">Keisti</span>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 bg-gray-50">
            <span className="text-3xl mb-1">🎤</span>
            <span className="text-xs">Įkelti nuotrauką</span>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-music-blue border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
      {/* URL input row */}
      <div className="flex gap-1.5" style={{ maxWidth: 180 }}>
        <input
          type="text" value={urlInput}
          onChange={e => setUrlInput(e.target.value)}
          onBlur={e => storeUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && storeUrl(urlInput)}
          placeholder="URL arba įkelti..."
          className="flex-1 min-w-0 px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:border-music-blue bg-white"
        />
        <button type="button" onClick={() => fileRef.current?.click()}
          className="px-2 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs transition-colors shrink-0">📁</button>
        {value && (
          <button type="button" onClick={() => { onChange(''); setUrlInput('') }}
            className="px-2 py-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg text-xs transition-colors shrink-0">✕</button>
        )}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f) }} />
    </div>
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
      const all: string[] = m.ALL_SUBSTYLES || m.SUBSTYLES || []
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

  useEffect(() => {
    if (initialData) setForm(initialData)
  }, [initialData])

  const set = (f: keyof ArtistFormData, v: any) => {
    const next = { ...form, [f]: v }
    setForm(next)
    onChange?.(next)
  }

  // Auto-save avatar when it changes (fire-and-forget, called when AvatarUpload finishes upload)
  const setAvatar = (url: string) => {
    const next = { ...form, avatar: url }
    setForm(next)
    // Trigger auto-save immediately when avatar URL is set (upload done)
    if (onChange && url !== form.avatar) {
      onChange(next)
    }
  }

  // Auto-save photos when gallery changes
  const setPhotos = (photos: any[]) => {
    const next = { ...form, photos }
    setForm(next)
    if (onChange) onChange(next)
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

              {/* FIX #3: Profilio nuotrauka — new AvatarUpload */}
              <Card title="Profilio nuotrauka">
                <AvatarUpload value={form.avatar} onChange={setAvatar} />
              </Card>

              {/* Nuotraukų galerija — auto-saves when photos change */}
              <Card title="Nuotraukų galerija">
                <PhotoGallery photos={form.photos} onChange={setPhotos} />
              </Card>

              {/* FIX #8: Socials — website moved here, subdomain at bottom */}
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

              {/* FIX #8: Subdomain at very bottom */}
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
