'use client'

// components/profile/ProfileEditModal.tsx
//
// V18j: nario savitvarkos modalas. Redaguoja profilyje rodomą info: avatarą
// (atskiras pasirinkimo modalas su didele kolekcija + įkėlimu), viršelį (hero
// fonas), „Trumpai apie save", aprašymą, miestą (select), gimimo metus,
// mėgstamas knygas + filmus, nario nuotraukas. Saugo per PUT /api/profile.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'

// Nauja muzikinė avatarų kolekcija (SVG, public/avatars/) — 36 vnt:
// muzikos ikonos + žanrų wordmark'ai + abstrakčios tekstūros.
export const AVATAR_COLLECTION = Array.from({ length: 36 }, (_, i) => `/avatars/av-${String(i + 1).padStart(2, '0')}.svg`)

// Didžiausi LT miestai + „Užsienis" / „Kita".
const LT_CITIES = ['Vilnius', 'Kaunas', 'Klaipėda', 'Šiauliai', 'Panevėžys', 'Alytus', 'Marijampolė', 'Mažeikiai', 'Jonava', 'Utena', 'Kėdainiai', 'Telšiai', 'Tauragė', 'Ukmergė', 'Visaginas', 'Plungė', 'Kretinga', 'Palanga', 'Radviliškis', 'Druskininkai']
const CITY_OPTIONS = [...LT_CITIES, 'Užsienis', 'Kita']

type Photo = { url: string; thumb_url?: string; caption?: string }

export function ProfileEditModal({ profile, onClose }: { profile: any; onClose: () => void }) {
  const router = useRouter()
  const [avatarUrl, setAvatarUrl] = useState<string>(profile.avatar_url || '')
  const [coverUrl, setCoverUrl] = useState<string>(profile.cover_image_url || '')
  const [bio, setBio] = useState<string>(profile.bio || '')
  const [signature, setSignature] = useState<string>(profile.legacy_signature || '')
  const [city, setCity] = useState<string>(profile.legacy_city || '')
  const [books, setBooks] = useState<string>(profile.legacy_favorite_books || '')
  const [films, setFilms] = useState<string>(profile.legacy_favorite_films || '')
  const initYear = profile.legacy_birth_date ? new Date(profile.legacy_birth_date).getFullYear() : ''
  const [birthYear, setBirthYear] = useState<string>(initYear ? String(initYear) : '')
  const [photos, setPhotos] = useState<Photo[]>(Array.isArray(profile.legacy_profile_photos) ? profile.legacy_profile_photos : [])

  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const coverInput = useRef<HTMLInputElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (pickerOpen) setPickerOpen(false); else onClose() } }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose, pickerOpen])

  async function uploadFile(file: File): Promise<string | null> {
    const fd = new FormData(); fd.append('file', file)
    const r = await fetch('/api/upload', { method: 'POST', body: fd })
    const d = await r.json()
    if (!r.ok) throw new Error(d?.error || 'Įkėlimas nepavyko')
    return d.url || null
  }
  const onPickCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return
    setUploading('cover'); setErr(null)
    try { const u = await uploadFile(f); if (u) setCoverUrl(u) } catch (x: any) { setErr(x.message) } finally { setUploading(null) }
  }
  const onPickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []); if (!files.length) return
    setUploading('photo'); setErr(null)
    try { for (const f of files.slice(0, 8)) { const u = await uploadFile(f); if (u) setPhotos((p) => [...p, { url: u }]) } }
    catch (x: any) { setErr(x.message) } finally { setUploading(null) }
  }

  async function save() {
    setBusy(true); setErr(null)
    const body: Record<string, any> = {
      avatar_url: avatarUrl || null,
      cover_image_url: coverUrl || null,
      bio: bio.trim() || null,
      legacy_signature: signature.trim() || null,
      legacy_city: city.trim() || null,
      legacy_favorite_books: books.trim() || null,
      legacy_favorite_films: films.trim() || null,
      legacy_profile_photos: photos,
    }
    const y = parseInt(birthYear, 10)
    if (y >= 1900 && y <= new Date().getFullYear()) body.legacy_birth_date = `${y}-06-15`
    else if (!birthYear) body.legacy_birth_date = null
    try {
      const r = await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || 'Nepavyko išsaugoti')
      onClose(); router.refresh()
    } catch (x: any) { setErr(x.message); setBusy(false) }
  }

  if (typeof window === 'undefined') return null

  const field = 'w-full px-3 py-2 rounded-lg text-sm'
  const fieldStyle: React.CSSProperties = { fontFamily: "'Outfit', sans-serif", background: 'var(--card-bg)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }
  const label = 'block text-[11px] font-extrabold uppercase tracking-wider mb-1.5'
  const labelStyle: React.CSSProperties = { color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }
  const cityKnown = !city || CITY_OPTIONS.includes(city)

  return createPortal(
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 backdrop-blur-md" style={{ background: 'rgba(0,0,0,0.65)' }}>
      <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-2xl max-h-[94vh] sm:max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden"
           style={{ background: 'var(--modal-bg)', border: '1px solid var(--modal-border)', boxShadow: 'var(--modal-shadow)' }}>
        <header className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <h2 className="font-black text-base sm:text-lg" style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-primary)' }}>Redaguoti profilį</h2>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full transition hover:opacity-80" style={{ background: 'var(--card-bg)', border: '1px solid var(--border-default)' }} aria-label="Uždaryti">
            <span style={{ color: 'var(--text-secondary)' }}>✕</span>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 flex flex-col gap-5">
          {/* Avatar — atidaro atskirą pasirinkimo modalą */}
          <div>
            <span className={label} style={labelStyle}>Avataras</span>
            <div className="flex items-center gap-3">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="w-16 h-16 rounded-2xl object-cover flex-shrink-0" style={{ border: '1px solid var(--border-default)' }} />
              ) : (
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black flex-shrink-0" style={{ background: 'var(--card-bg)', border: '1px solid var(--border-default)', color: 'var(--text-muted)' }}>{(profile.username || '?')[0]?.toUpperCase()}</div>
              )}
              <button type="button" onClick={() => setPickerOpen(true)}
                      className="px-4 py-2 rounded-lg text-[13px] font-bold transition hover:opacity-85"
                      style={{ fontFamily: "'Outfit', sans-serif", background: 'var(--card-bg)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
                Keisti avatarą
              </button>
            </div>
          </div>

          {/* Cover */}
          <div>
            <span className={label} style={labelStyle}>Fono nuotrauka (po antrašte)</span>
            <div className="flex items-center gap-3">
              {coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverUrl} alt="" className="w-28 h-14 rounded-lg object-cover flex-shrink-0" style={{ border: '1px solid var(--border-default)' }} />
              ) : (
                <div className="w-28 h-14 rounded-lg flex-shrink-0" style={{ background: 'var(--card-bg)', border: '1px dashed var(--border-default)' }} />
              )}
              <button type="button" onClick={() => coverInput.current?.click()} disabled={uploading === 'cover'}
                      className="px-3 py-2 rounded-lg text-[13px] font-bold transition hover:opacity-85 disabled:opacity-60"
                      style={{ fontFamily: "'Outfit', sans-serif", background: 'var(--card-bg)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
                {uploading === 'cover' ? 'Keliama…' : 'Įkelti'}
              </button>
              {coverUrl && <button type="button" onClick={() => setCoverUrl('')} className="text-[12px] font-bold" style={{ color: 'var(--text-muted)' }}>Pašalinti</button>}
              <input ref={coverInput} type="file" accept="image/*" className="hidden" onChange={onPickCover} />
            </div>
          </div>

          {/* Trumpai apie save */}
          <div>
            <span className={label} style={labelStyle}>Trumpai apie save (rodoma profilyje)</span>
            <input className={field} style={fieldStyle} value={signature} maxLength={160} onChange={(e) => setSignature(e.target.value)} placeholder="Viena eilutė apie tave…" />
          </div>

          {/* Aprašymas */}
          <div>
            <span className={label} style={labelStyle}>Aprašymas</span>
            <textarea className={`${field} min-h-[110px] resize-y`} style={fieldStyle} value={bio} maxLength={2000} onChange={(e) => setBio(e.target.value)} placeholder="Apie tave, tavo muzikinį skonį, veiklą…" />
          </div>

          {/* Apie narį */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <span className={label} style={labelStyle}>Miestas</span>
              <select className={field} style={fieldStyle} value={cityKnown ? city : 'Kita'} onChange={(e) => setCity(e.target.value)}>
                <option value="">—</option>
                {CITY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                {!cityKnown && <option value={city}>{city}</option>}
              </select>
            </div>
            <div>
              <span className={label} style={labelStyle}>Gimimo metai</span>
              <input className={field} style={fieldStyle} value={birthYear} inputMode="numeric" maxLength={4} onChange={(e) => setBirthYear(e.target.value.replace(/[^0-9]/g, ''))} placeholder="pvz. 1998" />
            </div>
            <div>
              <span className={label} style={labelStyle}>Mėgstamiausios knygos</span>
              <input className={field} style={fieldStyle} value={books} maxLength={300} onChange={(e) => setBooks(e.target.value)} placeholder="autorius — pavadinimas…" />
            </div>
            <div>
              <span className={label} style={labelStyle}>Mėgstamiausi filmai</span>
              <input className={field} style={fieldStyle} value={films} maxLength={300} onChange={(e) => setFilms(e.target.value)} placeholder="režisierius — pavadinimas…" />
            </div>
          </div>

          {/* Nuotraukos */}
          <div>
            <span className={label} style={labelStyle}>Nario nuotraukos</span>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {photos.map((p, i) => (
                <div key={i} className="relative aspect-square rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-subtle)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.thumb_url || p.url} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => setPhotos((arr) => arr.filter((_, j) => j !== i))}
                          className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center text-[12px] text-white" style={{ background: 'rgba(0,0,0,0.6)' }} aria-label="Pašalinti">✕</button>
                </div>
              ))}
              <button type="button" onClick={() => photoInput.current?.click()} disabled={uploading === 'photo'}
                      className="aspect-square rounded-lg flex flex-col items-center justify-center text-[11px] font-bold transition hover:opacity-85 disabled:opacity-60"
                      style={{ background: 'var(--card-bg)', border: '1px dashed var(--border-default)', color: 'var(--accent-orange)', fontFamily: "'Outfit', sans-serif" }}>
                {uploading === 'photo' ? '…' : '+ Įkelti'}
              </button>
              <input ref={photoInput} type="file" accept="image/*" multiple className="hidden" onChange={onPickPhoto} />
            </div>
          </div>

          {err && <p className="text-[13px] font-semibold" style={{ color: '#ef4444', fontFamily: "'Outfit', sans-serif" }}>{err}</p>}
        </div>

        <footer className="flex items-center justify-end gap-2.5 px-5 sm:px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-full text-[13px] font-bold transition hover:opacity-80"
                  style={{ fontFamily: "'Outfit', sans-serif", background: 'var(--card-bg)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>Atšaukti</button>
          <button type="button" onClick={save} disabled={busy || !!uploading}
                  className="px-5 py-2 rounded-full text-[13px] font-extrabold transition hover:opacity-90 disabled:opacity-60"
                  style={{ fontFamily: "'Outfit', sans-serif", background: 'var(--accent-orange)', color: '#fff' }}>{busy ? 'Saugoma…' : 'Išsaugoti'}</button>
        </footer>
      </div>

      {pickerOpen && (
        <AvatarPickerModal
          current={avatarUrl}
          username={profile.username}
          onUpload={uploadFile}
          onPick={(u) => { setAvatarUrl(u); setPickerOpen(false) }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>,
    document.body,
  )
}

// Atskiras avatarų pasirinkimo modalas (kad neapkrautų pagrindinės formos).
function AvatarPickerModal({ current, username, onPick, onUpload, onClose }: {
  current: string; username: string; onPick: (u: string) => void; onUpload: (f: File) => Promise<string | null>; onClose: () => void
}) {
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const inp = useRef<HTMLInputElement>(null)
  const doUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return
    setUploading(true); setErr(null)
    try { const u = await onUpload(f); if (u) onPick(u) } catch (x: any) { setErr(x.message) } finally { setUploading(false) }
  }
  return (
    <div onClick={onClose} className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-6 backdrop-blur-md" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-xl max-h-[88vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden"
           style={{ background: 'var(--modal-bg)', border: '1px solid var(--modal-border)', boxShadow: 'var(--modal-shadow)' }}>
        <header className="flex items-center justify-between gap-3 px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <h3 className="font-black text-base" style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-primary)' }}>Pasirink avatarą</h3>
          <button type="button" onClick={() => inp.current?.click()} disabled={uploading}
                  className="px-3 py-1.5 rounded-full text-[12px] font-bold transition hover:opacity-85 disabled:opacity-60"
                  style={{ fontFamily: "'Outfit', sans-serif", background: 'var(--accent-orange)', color: '#fff' }}>
            {uploading ? 'Keliama…' : '+ Įkelti savo'}
          </button>
          <input ref={inp} type="file" accept="image/*" className="hidden" onChange={doUpload} />
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          {err && <p className="text-[13px] mb-2" style={{ color: '#ef4444' }}>{err}</p>}
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2.5">
            {AVATAR_COLLECTION.map((u) => {
              const on = current === u
              return (
                <button key={u} type="button" onClick={() => onPick(u)}
                        className="relative aspect-square rounded-xl overflow-hidden transition hover:scale-[1.05]"
                        style={{ outline: on ? '2px solid var(--accent-orange)' : '1px solid var(--border-subtle)', outlineOffset: on ? '1px' : '0' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" className="w-full h-full object-cover" loading="lazy" />
                </button>
              )
            })}
          </div>
        </div>
        <footer className="px-5 py-3 flex-shrink-0" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <button type="button" onClick={onClose} className="w-full text-center py-2 rounded-full text-[13px] font-bold transition hover:opacity-80"
                  style={{ fontFamily: "'Outfit', sans-serif", background: 'var(--card-bg)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>Uždaryti</button>
        </footer>
      </div>
    </div>
  )
}
