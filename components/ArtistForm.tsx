'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { COUNTRIES, GENRES, MONTHS, DAYS } from '@/lib/constants'
import StyleModal from './StyleModal'
import ImageInput from './ImageInput'
import PhotoGallery, { type Photo } from './PhotoGallery'
import WikipediaImport from './WikipediaImport'
import RichTextEditor from './RichTextEditor'
import InstagramConnect from './InstagramConnect'

const CY = new Date().getFullYear()
const YEARS = Array.from({ length: CY - 1900 + 1 }, (_, i) => CY - i)

const SOCIALS = [
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

type Props = { initialData?: ArtistFormData; artistId?: string; onSubmit:(d:ArtistFormData)=>void; backHref:string; title:string; submitLabel:string }

// Small section label
function SL({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{children}</label>
}

// Input wrapper
function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <div className={wide ? 'col-span-2' : ''}><SL>{label}</SL>{children}</div>
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
    if (q.length < 1) { setResults([]); return }
    const all = JSON.parse(localStorage.getItem('artists')||'[]')
    setResults(all.filter((a:any) =>
      a.name.toLowerCase().includes(q.toLowerCase()) &&
      (filterType==='any'||a.type===filterType) &&
      !items.find((m:any)=>m.id===a.id)
    ).slice(0,6))
  }, [q, items, filterType])

  const addNew = () => {
    if (!newName.trim()) return
    const a = { ...emptyArtistForm, id: Date.now().toString(), name: newName.trim(),
      type: filterType==='any'?'solo':filterType, createdAt: new Date().toISOString() }
    const ex = JSON.parse(localStorage.getItem('artists')||'[]')
    localStorage.setItem('artists', JSON.stringify([...ex, a]))
    onAdd(a); setNewName(''); setShowNew(false); setQ('')
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
                <div><div className="text-sm font-medium text-gray-900">{a.name}</div>
                  <div className="text-xs text-gray-400">{a.type==='group'?'Grupė':'Atlikėjas'} · {a.country}</div></div>
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

export default function ArtistForm({ initialData, artistId, onSubmit, backHref, title, submitLabel }: Props) {
  const [form, setForm] = useState<ArtistFormData>(initialData || emptyArtistForm)
  const set = (f: keyof ArtistFormData, v: any) => setForm(p => ({ ...p, [f]: v }))

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
        {/* Header */}
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
          {/* Wikipedia import - full width */}
          <div className="mb-5">
            <WikipediaImport onImport={data => setForm(prev => ({ ...prev, ...data }))} />
          </div>

          {/* Instagram Connect - full width */}
          {artistId && (
            <div className="mb-5">
              <InstagramConnect artistId={artistId} artistName={form.name} />
            </div>
          )}

          {/* 2-column layout */}
          <div className="grid grid-cols-2 gap-5">
            {/* LEFT COLUMN */}
            <div className="space-y-5">

              {/* Pagrindinė info */}
              <Card title="Pagrindinė informacija">
                <div className="space-y-4">
                  <Field label="Pavadinimas *">
                    <Inp value={form.name} onChange={(v:string)=>set('name',v)} placeholder="Pvz: Jazzu" required />
                  </Field>

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
                    <Field label="Šalis *">
                      <Sel value={form.country} onChange={(v:string)=>set('country',v)} required>
                        {['Lietuva','Latvija','Estija','Lenkija','Vokietija','Prancūzija','JAV','Didžioji Britanija','Švedija','Norvegija','Suomija','Danija'].map(c=><option key={c} value={c}>{c}</option>)}
                        <optgroup label="─────────────">
                          {require('@/lib/constants').COUNTRIES.filter((c:string)=>!['Lietuva','Latvija','Estija','Lenkija','Vokietija','Prancūzija','JAV','Didžioji Britanija','Švedija','Norvegija','Suomija','Danija'].includes(c)).map((c:string)=><option key={c} value={c}>{c}</option>)}
                        </optgroup>
                      </Sel>
                    </Field>
                    <Field label="Žanras *">
                      <Sel value={form.genre} onChange={(v:string)=>{ set('genre',v); set('substyles',[]) }} required>
                        <option value="">Pasirinkite...</option>
                        {GENRES.map(g=><option key={g} value={g}>{g}</option>)}
                      </Sel>
                    </Field>
                  </div>

                  <Field label="Stiliai">
                    <StyleModal selected={form.substyles||[]} onChange={v=>set('substyles',v)} />
                  </Field>
                </div>
              </Card>

              {/* Aprašymas - rich text */}
              <Card title="Aprašymas">
                <RichTextEditor value={form.description} onChange={v=>set('description',v)} placeholder="Trumpas aprašymas..." />
              </Card>

              {/* Veiklos laikotarpis */}
              <Card title="Veiklos laikotarpis">
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <Field label="Nuo">
                    <Sel value={form.yearStart} onChange={(v:string)=>set('yearStart',v)}>
                      <option value="">Nežinoma</option>{YEARS.map(y=><option key={y} value={y}>{y}</option>)}
                    </Sel>
                  </Field>
                  <Field label="Iki">
                    <Sel value={form.yearEnd} onChange={(v:string)=>set('yearEnd',v)}>
                      <option value="">Aktyvūs</option>{YEARS.map(y=><option key={y} value={y}>{y}</option>)}
                    </Sel>
                  </Field>
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

              {/* Group members */}
              {form.type==='group' && (
                <Card title="Grupės nariai">
                  <ArtistSearch label="Nariai" ph="Ieškoti atlikėjo..." items={form.members}
                    onAdd={addMember} onRemove={rmMember} onYears={upMember} filterType="solo" />
                </Card>
              )}
            </div>

            {/* RIGHT COLUMN */}
            <div className="space-y-5">

              {/* Nuotraukos */}
              <Card title="Profilinis foto">
                <ImageInput value={form.avatar} onChange={v=>set('avatar',v)} size={200} mode="square" />
              </Card>

              <Card title="Nuotraukų galerija">
                <PhotoGallery photos={form.photos} onChange={p=>set('photos',p)} />
              </Card>

              {/* Nuorodos */}
              <Card title="Nuorodos ir subdomenas">
                <div className="space-y-3">
                  <Field label="Oficialus puslapis">
                    <Inp value={form.website} onChange={(v:string)=>set('website',v)} placeholder="https://..." type="url" />
                  </Field>
                  <Field label="Subdomenas">
                    <div className="flex">
                      <Inp value={form.subdomain} onChange={(v:string)=>set('subdomain',v)} placeholder="vardas" />
                      <span className="px-3 py-2 bg-gray-100 border border-l-0 border-gray-300 rounded-r-lg text-gray-500 text-sm whitespace-nowrap">.music.lt</span>
                    </div>
                  </Field>
                </div>
              </Card>

              {/* Socialiniai tinklai */}
              <Card title="Socialiniai tinklai">
                <div className="grid grid-cols-1 gap-3">
                  {SOCIALS.map(({ key, label, icon, ph }) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-lg w-7 text-center flex-shrink-0">{icon}</span>
                      <div className="flex-1">
                        <input type="url"
                          value={form[key as keyof ArtistFormData] as string}
                          onChange={e => set(key as keyof ArtistFormData, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-music-blue"
                          placeholder={ph} />
                      </div>
                    </div>
                  ))}
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
