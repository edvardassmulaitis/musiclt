'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  SUBTYPES, CITIES, INSTRUMENTS, EXPERIENCE, GENRES, PRICE_UNITS,
  CONDITIONS, ITEM_CONDITIONS,
  LISTING_TYPES,
  type ListingType,
} from '@/lib/skelbimai'

/* Žingsninis įdėjimo srautas — visi tipai aktyvūs. */

const CREATABLE: ListingType[] = ['ploksteles', 'instrumentai', 'paslaugos', 'rysiai', 'kita']
// Tipai, kuriuose rodom pardavimo kainą (vienkartinė, be vieneto).
const SALE_TYPES: ListingType[] = ['ploksteles', 'instrumentai', 'kita']

const TYPE_ICON: Record<ListingType, React.ReactNode> = {
  ploksteles: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /></svg>,
  instrumentai: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18 6.5 20.5a2.12 2.12 0 0 1-3-3L6 15" /><path d="m9 9 5 5L15 9 9 9z" /><path d="m22 2-9 9" /><path d="M9 9c-.5-1.5-2-2.5-3.5-2-1.5.5-2.5 2-2 3.5L4 12" /></svg>,
  paslaugos: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>,
  rysiai: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  kita: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></svg>,
}

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
  // ploksteles
  const [format, setFormat] = useState('')
  const [mediaCond, setMediaCond] = useState('')
  const [sleeveCond, setSleeveCond] = useState('')
  const [releaseYear, setReleaseYear] = useState('')
  const [releaseCountry, setReleaseCountry] = useState('')
  const [catalogNo, setCatalogNo] = useState('')
  // instrumentai
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [itemCond, setItemCond] = useState('')
  const [itemYear, setItemYear] = useState('')

  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 14px', fontSize: 16, borderRadius: 10,
    background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
    color: 'var(--text-primary)', outline: 'none',
  }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }

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
      if (type === 'ploksteles') {
        body.format = format || null; body.media_cond = mediaCond || null; body.sleeve_cond = sleeveCond || null
        body.release_year = releaseYear || null; body.release_country = releaseCountry || null; body.catalog_no = catalogNo || null
        body.genre = genre || null
        body.is_free = isFree; if (!isFree && price) body.price = price
      }
      if (type === 'instrumentai') {
        body.brand = brand || null; body.model = model || null; body.item_cond = itemCond || null; body.item_year = itemYear || null
        body.is_free = isFree; if (!isFree && price) body.price = price
      }
      if (type === 'kita') {
        body.is_free = isFree; if (!isFree && price) body.price = price
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
            <div style={{ height: 4, borderRadius: 2, background: i <= step ? 'var(--accent-orange)' : 'var(--border-default)', marginBottom: 6 }} />
            <span style={{ fontSize: 14, color: i <= step ? 'var(--text-secondary)' : 'var(--text-faint)', fontWeight: i === step ? 700 : 500 }}>{lbl}</span>
          </div>
        ))}
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)', color: 'var(--accent-red)', fontSize: 14, marginBottom: 16 }}>{error}</div>
      )}

      {/* 0: tipas */}
      {step === 0 && (
        <div style={{ display: 'grid', gap: 10 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>Ką nori įdėti?</h2>
          {(['ploksteles', 'instrumentai', 'paslaugos', 'rysiai', 'kita'] as ListingType[]).map(t => {
            const m = LISTING_TYPES[t]
            return (
              <button key={t}
                onClick={() => { setType(t); setSubtype(''); setStep(1) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  textAlign: 'left', padding: '14px 16px', borderRadius: 14, cursor: 'pointer',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'inherit',
                }}>
                <span style={{
                  width: 44, height: 44, borderRadius: 11, flexShrink: 0,
                  background: `${m.accent}1f`, color: m.accent,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{TYPE_ICON[t]}</span>
                <span style={{ minWidth: 0 }}>
                  <strong style={{ fontSize: 16, color: 'var(--text-primary)', display: 'block' }}>{m.label}</strong>
                  <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{m.subtitle}</span>
                </span>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--text-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto', flexShrink: 0 }}><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            )
          })}
        </div>
      )}

      {/* 1: detalės */}
      {step === 1 && type && meta && (
        <div style={{ display: 'grid', gap: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{meta.label}: detalės</h2>

          <div>
            <label style={labelStyle}>Pavadinimas *</label>
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)} maxLength={140}
              placeholder={
                type === 'rysiai' ? 'Pvz. „Indie grupė ieško būgnininko, Vilnius"'
                : type === 'paslaugos' ? 'Pvz. „Gitaros pamokos pradedantiesiems"'
                : type === 'ploksteles' ? 'Pvz. „Foje – Geltona, LP, 1989"'
                : type === 'instrumentai' ? 'Pvz. „Fender Stratocaster MIM, 2018"'
                : 'Pvz. „Grupės marškinėliai, dydis L"'
              }
              style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Potipis *</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {SUBTYPES[type].map(o => {
                const on = subtype === o.value
                return (
                  <button key={o.value} type="button" onClick={() => setSubtype(o.value)} style={{
                    padding: '8px 14px', fontSize: 14, fontWeight: 600, borderRadius: 999, cursor: 'pointer',
                    background: on ? 'var(--accent-orange)' : 'var(--bg-elevated)',
                    color: on ? '#fff' : 'var(--text-primary)',
                    border: `1px solid ${on ? 'var(--accent-orange)' : 'var(--border-default)'}`,
                  }}>{o.label}</button>
                )
              })}
            </div>
          </div>

          {type === 'rysiai' && (
            <>
              <div>
                <label style={labelStyle}>Kryptis</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['iesko', 'siulo'] as const).map(v => (
                    <button key={v} onClick={() => setLookingFor(v)} style={{
                      flex: 1, padding: '10px', borderRadius: 9, fontWeight: 700, fontSize: 14, cursor: 'pointer',
                      background: lookingFor === v ? 'var(--accent-orange)' : 'var(--bg-elevated)',
                      color: lookingFor === v ? '#fff' : 'var(--text-primary)',
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

          {type === 'ploksteles' && (
            <>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
                <div>
                  <label style={labelStyle}>Media būklė</label>
                  <select value={mediaCond} onChange={e => setMediaCond(e.target.value)} style={inputStyle}>
                    <option value="">—</option>
                    {CONDITIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Voko būklė</label>
                  <select value={sleeveCond} onChange={e => setSleeveCond(e.target.value)} style={inputStyle}>
                    <option value="">—</option>
                    {CONDITIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr 1fr' }}>
                <div>
                  <label style={labelStyle}>Metai</label>
                  <input type="number" value={releaseYear} onChange={e => setReleaseYear(e.target.value)} placeholder="1989" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Šalis</label>
                  <input value={releaseCountry} onChange={e => setReleaseCountry(e.target.value)} placeholder="LT" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Katalogo nr.</label>
                  <input value={catalogNo} onChange={e => setCatalogNo(e.target.value)} placeholder="—" style={inputStyle} />
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

          {type === 'instrumentai' && (
            <>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
                <div>
                  <label style={labelStyle}>Gamintojas</label>
                  <input value={brand} onChange={e => setBrand(e.target.value)} placeholder="Pvz. Fender" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Modelis</label>
                  <input value={model} onChange={e => setModel(e.target.value)} placeholder="Pvz. Stratocaster" style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
                <div>
                  <label style={labelStyle}>Būklė</label>
                  <select value={itemCond} onChange={e => setItemCond(e.target.value)} style={inputStyle}>
                    <option value="">—</option>
                    {ITEM_CONDITIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Metai</label>
                  <input type="number" value={itemYear} onChange={e => setItemYear(e.target.value)} placeholder="2018" style={inputStyle} />
                </div>
              </div>
            </>
          )}

          {SALE_TYPES.includes(type) && (
            <div>
              <label style={labelStyle}>Kaina</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 14, color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={isFree} onChange={e => setIsFree(e.target.checked)} /> Nemokama / dovanoju
              </label>
              {!isFree && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="number" min="0" value={price} onChange={e => setPrice(e.target.value)} placeholder="25" style={{ ...inputStyle, flex: 1 }} />
                  <span style={{ fontSize: 16, color: 'var(--text-muted)' }}>€</span>
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
            <label style={labelStyle}>Aprašymas <span style={{ color: 'var(--text-faint)', fontWeight: 500 }}>(neprivaloma)</span></label>
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
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Nuotraukos (neprivaloma)</h2>
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
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Peržiūra</h2>
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent-link)', marginBottom: 6 }}>{meta.label}</div>
            <h3 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>{title}</h3>
            {!isFree && price && type === 'paslaugos' && <div style={{ fontWeight: 800, color: 'var(--accent-green)', marginBottom: 8 }}>{price} €/{priceUnit === 'val' ? 'val.' : priceUnit}</div>}
            {!isFree && price && SALE_TYPES.includes(type) && <div style={{ fontWeight: 800, color: 'var(--accent-green)', marginBottom: 8 }}>{price} €</div>}
            {isFree && <div style={{ fontWeight: 800, color: 'var(--accent-green)', marginBottom: 8 }}>Nemokama</div>}
            {description && <p style={{ fontSize: 14, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', margin: '0 0 8px' }}>{description}</p>}
            <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>{[city, genre].filter(Boolean).join(' · ')}</div>
            {photos.length > 0 && (
              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {photos.map((p, i) => <img key={i} src={p} alt="" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6 }} />)}
              </div>
            )}
          </div>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>Susisiekimas vyks per žinutes — kiti vartotojai galės parašyti tau tiesiogiai.</p>
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
  flex: 1, padding: '12px', fontSize: 16, fontWeight: 700, borderRadius: 10,
  background: 'var(--accent-orange)', color: '#fff', border: 'none', cursor: 'pointer',
}
const btnGhost: React.CSSProperties = {
  padding: '12px 20px', fontSize: 16, fontWeight: 700, borderRadius: 10,
  background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-default)', cursor: 'pointer',
}
