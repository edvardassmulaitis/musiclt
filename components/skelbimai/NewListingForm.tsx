'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  SUBTYPES, CITIES, INSTRUMENTS, EXPERIENCE, GENRES, PRICE_UNITS,
  LISTING_TYPES,
  type ListingType,
} from '@/lib/skelbimai'

/* Žingsninis įdėjimo srautas. 1 etape — tik rysiai/paslaugos. */

const CREATABLE: ListingType[] = ['rysiai', 'paslaugos']

type Props = { initialType?: ListingType }

export function NewListingForm({ initialType }: Props) {
  const router = useRouter()
  const [step, setStep] = useState(initialType ? 1 : 0)
  const [type, setType] = useState<ListingType | null>(initialType ?? null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [subtype, setSubtype] = useState('')
  const [city, setCity] = useState('')
  const [genre, setGenre] = useState('')
  const [instrument, setInstrument] = useState('')
  const [experience, setExperience] = useState('')
  const [lookingFor, setLookingFor] = useState<'iesko' | 'siulo'>('iesko')
  const [price, setPrice] = useState('')
  const [priceUnit, setPriceUnit] = useState('val')
  const [isFree, setIsFree] = useState(false)
  const [photos, setPhotos] = useState<string[]>([])

  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 14px', fontSize: 15, borderRadius: 10,
    background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
    color: 'var(--text-primary)', outline: 'none',
  }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return
    setUploading(true)
    setError(null)
    const next = [...photos]
    for (const file of Array.from(files).slice(0, 12 - photos.length)) {
      try {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch('/api/upload', { method: 'POST', body: fd })
        const json = await res.json()
        if (res.ok && json.url) next.push(json.url)
        else setError(json.error || 'Nuotraukos įkėlimas nepavyko')
      } catch {
        setError('Nuotraukos įkėlimas nepavyko')
      }
    }
    setPhotos(next)
    setUploading(false)
  }

  function canProceedDetails(): boolean {
    if (!type) return false
    if (title.trim().length < 4) return false
    if (!subtype) return false
    return true
  }

  async function submit() {
    if (!type) return
    setSubmitting(true)
    setError(null)
    try {
      const body: any = {
        type, title: title.trim(), description: description.trim() || null,
        subtype, city: city || null, photos,
      }
      if (type === 'rysiai') {
        body.instrument = instrument || null
        body.experience = experience || null
        body.genre = genre || null
        body.looking_for = lookingFor === 'iesko'
      }
      if (type === 'paslaugos') {
        body.is_free = isFree
        if (!isFree && price) { body.price = price; body.price_unit = priceUnit }
      }
      const res = await fetch('/api/skelbimai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const json = await res.json()
      if (res.ok && json.listing) router.push(`/skelbimai/skelbimas/${json.listing.id}`)
      else setError(json.error || 'Nepavyko sukurti skelbimo')
    } catch {
      setError('Nepavyko sukurti skelbimo')
    } finally {
      setSubmitting(false)
    }
  }

  const meta = type ? LISTING_TYPES[type] : null

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      {/* Progresas */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
        {['Tipas', 'Detalės', 'Nuotraukos', 'Peržiūra'].map((lbl, i) => (
          <div key={lbl} style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ height: 4, borderRadius: 2, background: i <= step ? 'var(--accent-green)' : 'var(--border-default)', marginBottom: 6 }} />
            <span style={{ fontSize: 11.5, color: i <= step ? 'var(--text-secondary)' : 'var(--text-faint)', fontWeight: i === step ? 700 : 500 }}>{lbl}</span>
          </div>
        ))}
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)', color: 'var(--accent-red)', fontSize: 14, marginBottom: 16 }}>{error}</div>
      )}

      {/* 0: tipas */}
      {step === 0 && (
        <div style={{ display: 'grid', gap: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>Ką nori įdėti?</h2>
          {(['rysiai', 'paslaugos', 'ploksteles', 'instrumentai'] as ListingType[]).map(t => {
            const m = LISTING_TYPES[t]
            const enabled = CREATABLE.includes(t)
            return (
              <button key={t} disabled={!enabled}
                onClick={() => { setType(t); setSubtype(''); setStep(1) }}
                style={{
                  textAlign: 'left', padding: '16px 18px', borderRadius: 12, cursor: enabled ? 'pointer' : 'not-allowed',
                  background: 'var(--bg-elevated)', border: `1px solid ${enabled ? 'var(--border-default)' : 'var(--border-subtle)'}`,
                  opacity: enabled ? 1 : 0.5, color: 'inherit',
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 16, color: 'var(--text-primary)' }}>{m.label}</strong>
                  {!enabled && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Greitai</span>}
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>{m.desc}</p>
              </button>
            )
          })}
        </div>
      )}

      {/* 1: detalės */}
      {step === 1 && type && meta && (
        <div style={{ display: 'grid', gap: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{meta.label}: detalės</h2>

          <div>
            <label style={labelStyle}>Pavadinimas *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} maxLength={140}
              placeholder={type === 'rysiai' ? 'Pvz. „Indie grupė ieško būgnininko, Vilnius"' : 'Pvz. „Gitaros pamokos pradedantiesiems"'}
              style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Potipis *</label>
            <select value={subtype} onChange={e => setSubtype(e.target.value)} style={inputStyle}>
              <option value="">Pasirink…</option>
              {SUBTYPES[type].map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {type === 'rysiai' && (
            <>
              <div>
                <label style={labelStyle}>Kryptis</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['iesko', 'siulo'] as const).map(v => (
                    <button key={v} onClick={() => setLookingFor(v)} style={{
                      flex: 1, padding: '10px', borderRadius: 9, fontWeight: 700, fontSize: 14, cursor: 'pointer',
                      background: lookingFor === v ? 'var(--accent-green)' : 'var(--bg-elevated)',
                      color: lookingFor === v ? '#04140a' : 'var(--text-primary)',
                      border: '1px solid var(--border-default)',
                    }}>{v === 'iesko' ? 'Ieškau' : 'Siūlau'}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
                <div>
                  <label style={labelStyle}>Instrumentas</label>
                  <select value={instrument} onChange={e => setInstrument(e.target.value)} style={inputStyle}>
                    <option value="">—</option>
                    {INSTRUMENTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Patirtis</label>
                  <select value={experience} onChange={e => setExperience(e.target.value)} style={inputStyle}>
                    <option value="">—</option>
                    {EXPERIENCE.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Žanras</label>
                <select value={genre} onChange={e => setGenre(e.target.value)} style={inputStyle}>
                  <option value="">—</option>
                  {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            </>
          )}

          {type === 'paslaugos' && (
            <div>
              <label style={labelStyle}>Įkainis</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 14, color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={isFree} onChange={e => setIsFree(e.target.checked)} /> Nemokama
              </label>
              {!isFree && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="number" min="0" value={price} onChange={e => setPrice(e.target.value)} placeholder="20" style={{ ...inputStyle, flex: 1 }} />
                  <select value={priceUnit} onChange={e => setPriceUnit(e.target.value)} style={{ ...inputStyle, width: 140 }}>
                    {PRICE_UNITS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}

          <div>
            <label style={labelStyle}>Miestas</label>
            <select value={city} onChange={e => setCity(e.target.value)} style={inputStyle}>
              <option value="">—</option>
              {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Aprašymas</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={5} maxLength={5000}
              placeholder="Papasakok daugiau…" style={{ ...inputStyle, resize: 'vertical' }} />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setStep(0)} style={btnGhost}>Atgal</button>
            <button onClick={() => setStep(2)} disabled={!canProceedDetails()} style={{ ...btnPrimary, opacity: canProceedDetails() ? 1 : 0.5 }}>Toliau</button>
          </div>
        </div>
      )}

      {/* 2: nuotraukos */}
      {step === 2 && (
        <div style={{ display: 'grid', gap: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Nuotraukos (neprivaloma)</h2>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {photos.map((p, i) => (
              <div key={i} style={{ position: 'relative' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p} alt="" style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border-subtle)' }} />
                <button onClick={() => setPhotos(photos.filter((_, j) => j !== i))} style={{
                  position: 'absolute', top: -8, right: -8, width: 22, height: 22, borderRadius: '50%',
                  background: 'var(--accent-red)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, lineHeight: 1,
                }}>×</button>
              </div>
            ))}
            {photos.length < 12 && (
              <label style={{
                width: 90, height: 90, borderRadius: 10, border: '1px dashed var(--border-strong)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                color: 'var(--text-muted)', fontSize: 28,
              }}>
                {uploading ? '…' : '+'}
                <input type="file" accept="image/*" multiple onChange={e => handleFiles(e.target.files)} style={{ display: 'none' }} />
              </label>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setStep(1)} style={btnGhost}>Atgal</button>
            <button onClick={() => setStep(3)} style={btnPrimary}>Toliau</button>
          </div>
        </div>
      )}

      {/* 3: peržiūra */}
      {step === 3 && type && meta && (
        <div style={{ display: 'grid', gap: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Peržiūra</h2>
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-link)', marginBottom: 6 }}>{meta.label}</div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>{title}</h3>
            {!isFree && price && type === 'paslaugos' && <div style={{ fontWeight: 800, color: 'var(--accent-green)', marginBottom: 8 }}>{price} €/{priceUnit === 'val' ? 'val.' : priceUnit}</div>}
            {description && <p style={{ fontSize: 14.5, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', margin: '0 0 8px' }}>{description}</p>}
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{[city, genre].filter(Boolean).join(' · ')}</div>
            {photos.length > 0 && (
              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {photos.map((p, i) => <img key={i} src={p} alt="" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6 }} />)}
              </div>
            )}
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Susisiekimas vyks per žinutes — kiti vartotojai galės parašyti tau tiesiogiai.</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setStep(2)} style={btnGhost}>Atgal</button>
            <button onClick={submit} disabled={submitting} style={{ ...btnPrimary, opacity: submitting ? 0.7 : 1 }}>
              {submitting ? 'Skelbiama…' : 'Publikuoti'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const btnPrimary: React.CSSProperties = {
  flex: 1, padding: '12px', fontSize: 15, fontWeight: 700, borderRadius: 10,
  background: 'var(--accent-green)', color: '#04140a', border: 'none', cursor: 'pointer',
}
const btnGhost: React.CSSProperties = {
  padding: '12px 20px', fontSize: 15, fontWeight: 700, borderRadius: 10,
  background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-default)', cursor: 'pointer',
}
