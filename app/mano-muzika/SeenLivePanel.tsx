'use client'
// app/mano-muzika/SeenLivePanel.tsx
// ────────────────────────────────────────────────────────────────────────────
// „Matyti gyvai" — 3 žingsnių wizard'as:
//   1) Atlikėjas — paieška tarp esamų arba pasiūlyti naują.
//   2) Renginys — pririšti esamą ARBA aprašyti (vieta per GeoPicker; renginio
//      pavadinimas nebūtinas — dažniausiai vieno atlikėjo koncertas; festivalio/
//      kelių atlikėjų atveju galima nurodyti pavadinimą + lineup). + kada matė.
//   3) Media — nuotraukos / video + pastaba, ir pateikti.
//
// Esamas atlikėjas be naujo renginio → iškart profilyje; nauji atlikėjai/
// renginiai → draft admino peržiūrai.
// ────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import { proxyImg } from '@/lib/img-proxy'
import MusicSearchPicker, { type AttachmentHit } from '@/components/MusicSearchPicker'
import GeoPicker, { EMPTY_GEO, type GeoValue } from '@/components/geo/GeoPicker'
import type { SeenLiveRow, SeenLiveMedia } from '@/lib/seen-live'

type EventPick = { id: string; title: string; slug: string; start_date: string | null; city: string | null }
type QuickArtist = { id: number; title: string; image_url: string | null; slug: string | null }
type ArtistEvent = { id: string; title: string; slug: string; start_date: string | null; venue_name: string | null; city: string | null; cover_image_url: string | null; is_festival?: boolean }

function toHit(a: QuickArtist): AttachmentHit {
  return { type: 'grupe', id: a.id, legacy_id: null, slug: a.slug || '', title: a.title, artist: null, image_url: a.image_url }
}

async function api(path: string, method: string, body?: any) {
  const res = await fetch(`/api/mano-muzika${path}`, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Klaida')
  return data
}

function yearOf(r: SeenLiveRow): number | null {
  if (r.seen_year) return r.seen_year
  const d = r.event?.start_date || r.seen_date
  if (d) { const y = Number(String(d).slice(0, 4)); if (Number.isFinite(y)) return y }
  return null
}

export default function SeenLivePanel({ flash, likedArtists = [] }: { flash: (m: string) => void; likedArtists?: QuickArtist[] }) {
  const [items, setItems] = useState<SeenLiveRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editing, setEditing] = useState<SeenLiveRow | null>(null)

  useEffect(() => {
    let alive = true
    api('/seen-live', 'GET').then((d) => { if (alive) { setItems(d.items || []); setLoaded(true) } })
      .catch(() => { if (alive) setLoaded(true) })
    return () => { alive = false }
  }, [])

  // Užrakinam fono scroll'ą, kol atidarytas full-screen wizard'as/redagavimas.
  useEffect(() => {
    if (!wizardOpen && !editing) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [wizardOpen, editing])

  async function remove(id: number) {
    const prev = items
    setItems((l) => l.filter((x) => x.id !== id))
    try { await api('/seen-live', 'DELETE', { id }) }
    catch (e: any) { setItems(prev); flash(e.message || 'Klaida') }
  }

  return (
    <div className="seenlive-noZoom grid lg:grid-cols-[minmax(0,1fr)_400px] gap-5 lg:gap-7 items-start">
      {/* ── Sąrašas ── */}
      <section className="min-w-0">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-['Outfit',sans-serif] text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Atlikėjai, kuriuos mačiau gyvai</h2>
            <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Susidėk koncertus — su nuotraukom, video ir renginiu.</p>
          </div>
          <button onClick={() => setWizardOpen(true)}
            className="lg:hidden shrink-0 rounded-full px-3.5 py-1.5 text-[14px] font-bold text-white" style={{ background: 'var(--accent-orange)' }}>+ Pridėti</button>
        </div>

        {!loaded ? (
          <div className="py-10 text-center text-[14px]" style={{ color: 'var(--text-faint)' }}>Kraunama…</div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-[14px]" style={{ borderColor: 'var(--border-default)', color: 'var(--text-faint)' }}>
            Dar nieko nepridėta. Paspausk „Pridėti" ir susidėk pirmą koncertą.
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {items.map((it) => {
              const y = yearOf(it)
              const name = it.artist?.name || it.raw_artist_name || '—'
              const cover = it.artist?.cover_image_url || (it.media.find((m) => m.type === 'image')?.url ?? null)
              const evLabel = it.event?.title || it.raw_event_title
              const place = [it.raw_event_venue, it.raw_event_city, (it.raw_event_country && it.raw_event_country !== 'Lietuva') ? it.raw_event_country : null].filter(Boolean).join(', ')
              return (
                <li key={it.id} className="flex items-center gap-3 rounded-xl p-2.5 pr-3 ring-1" style={{ background: 'var(--bg-surface)', ['--tw-ring-color' as any]: 'var(--border-subtle)' }}>
                  <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg" style={{ background: 'var(--cover-placeholder)' }}>
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={proxyImg(cover)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                    ) : <div className="flex h-full w-full items-center justify-center text-[16px]" style={{ color: 'var(--text-faint)' }}>🎤</div>}
                    {it.media.length > 0 && <span className="absolute bottom-0 right-0 rounded-tl bg-black/60 px-1 text-[10px] font-bold text-white">{it.media.length}</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-['Outfit',sans-serif] text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>{name}</span>
                      {it.status === 'pending' && <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide" style={{ background: 'rgba(245,158,11,0.16)', color: 'var(--accent-orange)' }}>Laukia</span>}
                      {it.status === 'rejected' && <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide" style={{ background: 'rgba(248,113,113,0.14)', color: 'var(--accent-red)' }}>Atmesta</span>}
                    </div>
                    <div className="truncate text-[12px]" style={{ color: 'var(--text-muted)' }}>{[evLabel, place, y ? String(y) : null].filter(Boolean).join(' · ') || 'Be renginio'}</div>
                  </div>
                  <button onClick={() => setEditing(it)} aria-label="Redaguoti" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }}>
                    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
                  </button>
                  <button onClick={() => remove(it.id)} aria-label="Pašalinti" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-faint)' }}>
                    <svg viewBox="0 0 16 16" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M3 3l10 10M13 3L3 13" /></svg>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* ── Wizard (desktop: sticky dešinėje; mobile: modalas) ── */}
      <div className="hidden lg:block lg:sticky lg:top-4">
        <Wizard onAdded={(item) => setItems((l) => [item, ...l])} flash={flash} likedArtists={likedArtists} />
      </div>
      {wizardOpen && (
        <div className="seenlive-noZoom lg:hidden fixed inset-0 z-[200] overflow-y-auto overscroll-contain" style={{ background: 'var(--bg-body)' }}>
          <div className="min-h-full p-3" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
            <Wizard onAdded={(item) => { setItems((l) => [item, ...l]); setWizardOpen(false) }} flash={flash} onClose={() => setWizardOpen(false)} fullscreen likedArtists={likedArtists} />
          </div>
        </div>
      )}

      {editing && (
        <EditSighting row={editing} flash={flash} onClose={() => setEditing(null)}
          onSaved={(item) => { setItems((l) => l.map((x) => x.id === item.id ? item : x)); setEditing(null) }} />
      )}
    </div>
  )
}

// ── Redagavimas (media / pastaba / metai) ──────────────────────────────────
function EditSighting({ row, flash, onClose, onSaved }: { row: SeenLiveRow; flash: (m: string) => void; onClose: () => void; onSaved: (item: SeenLiveRow) => void }) {
  const [media, setMedia] = useState<SeenLiveMedia[]>(row.media || [])
  const [note, setNote] = useState(row.note || '')
  const initDate = row.seen_date || ''
  const [year, setYear] = useState(row.seen_year ? String(row.seen_year) : (initDate ? initDate.slice(0, 4) : ''))
  const [month, setMonth] = useState(initDate ? String(Number(initDate.slice(5, 7))) : '')
  const [day, setDay] = useState(initDate ? String(Number(initDate.slice(8, 10))) : '')
  const [busy, setBusy] = useState(false)
  const name = row.artist?.name || row.raw_artist_name || '—'

  async function save() {
    setBusy(true)
    try {
      const payload: any = { id: row.id, media, note: note.trim() || null }
      // Datą leidžiam keisti tik kai renginys NEpririštas (kitaip data iš renginio).
      if (!row.event) {
        const y = year ? Number(year) : null
        const m = month ? Number(month) : null
        const d = day ? Number(day) : null
        let seen_date: string | null = null
        if (y && m && m >= 1 && m <= 12 && d && d >= 1 && d <= 31) seen_date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        payload.seen_year = y
        payload.seen_date = seen_date
      }
      const { item } = await api('/seen-live', 'PATCH', payload)
      onSaved(item)
      flash('Išsaugota')
    } catch (e: any) { flash(e.message || 'Klaida') } finally { setBusy(false) }
  }

  const inputCls = 'w-full rounded-lg px-3 py-2 text-[14px] outline-none ring-1'
  const inputStyle = { background: 'var(--bg-elevated)', color: 'var(--text-primary)', ['--tw-ring-color' as any]: 'var(--border-default)' } as any

  return (
    <div className="seenlive-noZoom fixed inset-0 z-[210] overflow-y-auto overscroll-contain" style={{ background: 'var(--bg-body)' }}>
      <div className="mx-auto min-h-full w-full max-w-md p-3" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-['Outfit',sans-serif] text-[20px] font-extrabold" style={{ color: 'var(--text-primary)' }}>Redaguoti</h3>
          <button onClick={onClose} aria-label="Uždaryti" className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
            <svg viewBox="0 0 16 16" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M3 3l10 10M13 3L3 13" /></svg>
          </button>
        </div>

        <div className="mb-3 text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>{name}</div>

        <label className="mb-1 block text-[12px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>Nuotraukos / video</label>
        <MediaUploader media={media} setMedia={setMedia} flash={flash} />

        {row.event ? (
          <div className="mt-4 rounded-lg px-3 py-2 text-[13px] ring-1" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', ['--tw-ring-color' as any]: 'var(--border-subtle)' } as any}>
            Renginys: <b style={{ color: 'var(--text-secondary)' }}>{row.event.title}</b>{row.event.start_date ? ` · ${String(row.event.start_date).slice(0, 10)}` : ''} <span style={{ color: 'var(--text-faint)' }}>(data iš renginio)</span>
          </div>
        ) : (
          <>
            <label className="mt-4 mb-1 block text-[12px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>Kada matei? (užtenka metų)</label>
            <div className="grid grid-cols-3 gap-2">
              <input value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Metai" inputMode="numeric" className={inputCls} style={inputStyle} />
              <input value={month} onChange={(e) => setMonth(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="Mėnuo" inputMode="numeric" className={inputCls} style={inputStyle} />
              <input value={day} onChange={(e) => setDay(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="Diena" inputMode="numeric" className={inputCls} style={inputStyle} />
            </div>
          </>
        )}

        <label className="mt-3 mb-1 block text-[12px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>Pastaba</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Įspūdis, su kuo buvai…" className="w-full resize-none rounded-lg px-3 py-2 text-[14px] outline-none ring-1" style={inputStyle} />

        <div className="mt-4 flex items-center gap-2">
          <button onClick={onClose} className="rounded-xl px-4 py-2.5 text-[14px] font-bold ring-1" style={{ color: 'var(--text-secondary)', ['--tw-ring-color' as any]: 'var(--border-default)' } as any}>Atšaukti</button>
          <button onClick={save} disabled={busy} className="flex-1 rounded-xl py-2.5 text-[14px] font-bold text-white transition-transform hover:scale-[1.01] disabled:opacity-45" style={{ background: 'var(--accent-orange)' }}>{busy ? 'Saugoma…' : 'Išsaugoti'}</button>
        </div>
      </div>
    </div>
  )
}

// ── WIZARD ──────────────────────────────────────────────────────────────────
function Wizard({ onAdded, flash, onClose, fullscreen = false, likedArtists = [] }: { onAdded: (item: SeenLiveRow) => void; flash: (m: string) => void; onClose?: () => void; fullscreen?: boolean; likedArtists?: QuickArtist[] }) {
  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState(false)

  // 1 — atlikėjas
  const [artist, setArtist] = useState<AttachmentHit | null>(null)
  const [newArtist, setNewArtist] = useState('')
  const [proposeArtist, setProposeArtist] = useState(false)
  const [suggestions, setSuggestions] = useState<QuickArtist[]>([])
  const [artistEvents, setArtistEvents] = useState<ArtistEvent[]>([])
  const [loadingEvents, setLoadingEvents] = useState(false)

  // Pasiūlymai (kartą) — pamėgtų + siūlomų greitam pasirinkimui
  useEffect(() => {
    let alive = true
    fetch('/api/mano-muzika/suggestions?kind=artist&limit=18')
      .then((r) => r.json())
      .then((d) => { if (alive) setSuggestions((d.items || []).map((x: any) => ({ id: x.id, title: x.title, image_url: x.cover_url ?? null, slug: x.slug ?? null }))) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  // Pasirinkus atlikėją — jo koncertai iš DB (naujausi pirmi)
  useEffect(() => {
    if (!artist?.id) { setArtistEvents([]); return }
    let alive = true
    setLoadingEvents(true)
    fetch(`/api/artists/${artist.id}/events`)
      .then((r) => r.json())
      .then((d) => { if (alive) setArtistEvents(d.events || []) })
      .catch(() => { if (alive) setArtistEvents([]) })
      .finally(() => { if (alive) setLoadingEvents(false) })
    return () => { alive = false }
  }, [artist?.id])

  // 2 — renginys
  const [event, setEvent] = useState<EventPick | null>(null)
  const [describe, setDescribe] = useState(false)         // kurti savo renginį (naujas)
  const [isFestival, setIsFestival] = useState(false)
  const [evTitle, setEvTitle] = useState('')
  const [extraArtists, setExtraArtists] = useState<QuickArtist[]>([])   // kiti atlikėjai (apšildantys / festas)
  const [geo, setGeo] = useState<GeoValue>(EMPTY_GEO)
  // Data — atskiri laukai; galima užpildyti tik metus
  const [year, setYear] = useState('')
  const [month, setMonth] = useState('')
  const [day, setDay] = useState('')

  // 3 — media + pastaba
  const [media, setMedia] = useState<SeenLiveMedia[]>([])
  const [note, setNote] = useState('')

  const hasArtist = !!artist || (proposeArtist && newArtist.trim().length > 1)
  const willBeDraft = (proposeArtist && !!newArtist.trim()) || (describe && !event)

  function computeDates() {
    const y = year ? Number(year) : null
    const m = month ? Number(month) : null
    const d = day ? Number(day) : null
    const seen_year = (y && y >= 1900 && y <= 2100) ? y : null
    let seen_date: string | null = null
    if (seen_year && m && m >= 1 && m <= 12 && d && d >= 1 && d <= 31) {
      seen_date = `${seen_year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
    return { seen_year, seen_date }
  }

  function reset() {
    setStep(1); setArtist(null); setNewArtist(''); setProposeArtist(false)
    setEvent(null); setDescribe(false); setIsFestival(false); setEvTitle(''); setExtraArtists([]); setGeo(EMPTY_GEO)
    setYear(''); setMonth(''); setDay(''); setMedia([]); setNote('')
  }

  async function submit() {
    if (!hasArtist || busy) return
    setBusy(true)
    try {
      const { seen_year, seen_date } = computeDates()
      const lineupNames = extraArtists.map((a) => a.title).filter(Boolean).join(', ')
      const payload: any = {
        artist_id: artist?.id ?? null,
        raw_artist_name: artist ? null : newArtist.trim(),
        event_id: event?.id ?? null,
        raw_event_title: event ? null : (describe ? evTitle.trim() || null : null),
        raw_event_country: event ? null : (describe ? geo.countryName : null),
        raw_event_city: event ? null : (describe ? geo.cityName : null),
        raw_event_venue: event ? null : (describe ? geo.venueName : null),
        raw_event_is_festival: event ? false : (describe && isFestival),
        raw_event_lineup: event ? null : (describe ? lineupNames || null : null),
        seen_year,
        seen_date,
        note: note.trim() || null,
        media,
      }
      const { item } = await api('/seen-live', 'POST', payload)
      onAdded(item)
      reset()
      flash(item.status === 'pending' ? 'Pridėta — laukia patvirtinimo' : 'Pridėta į profilį')
    } catch (e: any) { flash(e.message || 'Klaida') } finally { setBusy(false) }
  }

  const card = fullscreen ? 'p-1' : 'rounded-2xl p-4 ring-1'
  const cardStyle = fullscreen ? {} : { background: 'var(--bg-surface)', ['--tw-ring-color' as any]: 'var(--border-subtle)' }

  return (
    <section className={card} style={cardStyle as any}>
      {/* Antraštė + žingsnių indikatorius */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-['Outfit',sans-serif] font-extrabold" style={{ color: 'var(--text-primary)', fontSize: fullscreen ? 20 : 15 }}>Pridėti koncertą</h3>
        {onClose && (
          <button onClick={onClose} aria-label="Uždaryti" className="flex items-center gap-1 rounded-full px-2 py-1 text-[13px]" style={{ color: 'var(--text-muted)', background: fullscreen ? 'var(--bg-elevated)' : 'transparent' }}>
            <svg viewBox="0 0 16 16" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M3 3l10 10M13 3L3 13" /></svg>
            {fullscreen ? '' : 'Uždaryti'}
          </button>
        )}
      </div>
      <div className="mb-4 flex items-center gap-1.5">
        {[1, 2, 3].map((s) => (
          <div key={s} className="h-1.5 flex-1 rounded-full" style={{ background: s <= step ? 'var(--accent-orange)' : 'var(--bg-elevated)' }} />
        ))}
      </div>

      {/* STEP 1 — atlikėjas */}
      {step === 1 && (
        <div>
          {/* Pasirinktas atlikėjas — DIDELIS vaizdas */}
          {artist ? (
            <div>
              <div className="relative overflow-hidden rounded-2xl" style={{ background: 'var(--cover-placeholder)', aspectRatio: '16 / 10' }}>
                {artist.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={proxyImg(artist.image_url)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                ) : <div className="flex h-full w-full items-center justify-center text-[48px]">🎤</div>}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3 pt-8">
                  <div className="font-['Outfit',sans-serif] text-[22px] font-extrabold leading-tight text-white">{artist.title}</div>
                </div>
                <button onClick={() => setArtist(null)} className="absolute right-2 top-2 rounded-full bg-black/55 px-2.5 py-1 text-[12px] font-bold text-white">keisti</button>
              </div>

              {/* To atlikėjo koncertai iš DB (naujausi pirmi) */}
              <div className="mt-3">
                <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>Jo koncertai mūsų DB</div>
                {loadingEvents ? (
                  <div className="py-3 text-center text-[13px]" style={{ color: 'var(--text-faint)' }}>Kraunama…</div>
                ) : artistEvents.length === 0 ? (
                  <p className="text-[13px]" style={{ color: 'var(--text-faint)' }}>Koncertų DB dar nėra — kitame žingsnyje galėsi aprašyti pats.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {artistEvents.map((e) => {
                      const picked = event?.id === e.id
                      return (
                        <li key={e.id}>
                          <button onClick={() => setEvent(picked ? null : { id: e.id, title: e.title, slug: e.slug, start_date: e.start_date, city: e.city })}
                            className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left ring-1 transition-colors"
                            style={{ background: picked ? 'rgba(245,158,11,0.12)' : 'var(--bg-elevated)', ['--tw-ring-color' as any]: picked ? 'var(--accent-orange)' : 'var(--border-subtle)' } as any}>
                            <span className="text-[16px]">{picked ? '✓' : (e.is_festival ? '🎪' : '🎫')}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>{e.title}</span>
                              <span className="block truncate text-[12px]" style={{ color: 'var(--text-muted)' }}>{[e.venue_name || e.city, e.start_date ? String(e.start_date).slice(0, 10) : null].filter(Boolean).join(' · ')}</span>
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
                {/* Sukurti savo renginį — tik jei koncertas iš sąrašo NEpasirinktas */}
                {!event ? (
                  <button onClick={() => { setEvent(null); setDescribe(true); setStep(2) }}
                    className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed py-2.5 text-[14px] font-bold"
                    style={{ borderColor: 'var(--border-default)', color: 'var(--accent-orange)' }}>
                    <span className="text-[16px]">＋</span> Sukurti savo renginį
                  </button>
                ) : (
                  <p className="mt-2 text-[12px]" style={{ color: 'var(--accent-orange)' }}>✓ Renginys pasirinktas — spausk „Toliau".</p>
                )}
              </div>
            </div>
          ) : proposeArtist ? (
            <div>
              <label className="mb-1 block text-[12px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>Naujas atlikėjas *</label>
              <input value={newArtist} onChange={(e) => setNewArtist(e.target.value)} placeholder="Naujo atlikėjo pavadinimas" className="w-full rounded-lg px-3 py-2 text-[14px] outline-none ring-1" style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', ['--tw-ring-color' as any]: 'var(--border-default)' } as any} />
              <button onClick={() => { setProposeArtist(false); setNewArtist('') }} className="mt-1.5 text-[12px]" style={{ color: 'var(--accent-link)' }}>← Ieškoti esamų</button>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-[12px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>Kurį atlikėją matei? *</label>
              <MusicSearchPicker attached={[]} onAdd={(h) => setArtist(h)} typeFilter="grupe" compact placeholder="Ieškok atlikėjo…" />
              <button onClick={() => { setProposeArtist(true) }} className="mt-1.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>Nerandi? <span style={{ color: 'var(--accent-link)' }}>Pasiūlyk naują →</span></button>

              {likedArtists.length > 0 && (
                <QuickPickRow title="Tavo pamėgti" artists={likedArtists} onPick={(a) => setArtist(toHit(a))} />
              )}
              {suggestions.length > 0 && (
                <QuickPickRow title="Pasiūlymai" artists={suggestions.filter((s) => !likedArtists.some((l) => l.id === s.id))} onPick={(a) => setArtist(toHit(a))} />
              )}
            </div>
          )}
          <StepNav onNext={() => hasArtist && setStep(event ? 3 : 2)} nextDisabled={!hasArtist} />
        </div>
      )}

      {/* STEP 2 — renginys / kontekstas */}
      {step === 2 && (
        <div>
          {event ? (
            // Pasirinktas esamas renginys (iš 1 žingsnio) — suvestinė
            <div>
              <label className="mb-1 block text-[12px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>Renginys</label>
              <div className="flex items-center gap-2 rounded-lg p-2.5 ring-1" style={{ background: 'rgba(245,158,11,0.10)', ['--tw-ring-color' as any]: 'var(--accent-orange)' } as any}>
                <span className="text-[16px]">✓</span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>{event.title}{event.city ? ` · ${event.city}` : ''}{event.start_date ? ` · ${String(event.start_date).slice(0, 10)}` : ''}</span>
                <button onClick={() => { setEvent(null); setStep(1) }} className="text-[12px]" style={{ color: 'var(--accent-link)' }}>keisti</button>
              </div>
            </div>
          ) : describe ? (
            // Kurti savo renginį — atlikėjas prefilled
            <div className="flex flex-col gap-2.5">
              <div>
                <label className="mb-1 block text-[12px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>Savo renginys</label>
                <div className="flex items-center gap-2 rounded-lg p-2 ring-1" style={{ background: 'var(--bg-elevated)', ['--tw-ring-color' as any]: 'var(--border-subtle)' } as any}>
                  <div className="h-7 w-7 shrink-0 overflow-hidden rounded" style={{ background: 'var(--cover-placeholder)' }}>
                    {artist?.image_url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={proxyImg(artist.image_url)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />}
                  </div>
                  <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: 'var(--text-primary)' }}><b>{artist?.title || newArtist}</b> · headlineris</span>
                </div>
              </div>

              <GeoPicker value={geo} onChange={setGeo} compact />

              <label className="inline-flex items-center gap-2 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={isFestival} onChange={(e) => setIsFestival(e.target.checked)} />
                Festivalis
              </label>
              <input value={evTitle} onChange={(e) => setEvTitle(e.target.value)} placeholder={isFestival ? 'Festivalio pavadinimas' : 'Renginio pavadinimas (nebūtina)'} className="w-full rounded-lg px-3 py-2 text-[14px] outline-none ring-1" style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', ['--tw-ring-color' as any]: 'var(--border-default)' } as any} />

              {/* Kiti atlikėjai */}
              <div>
                <label className="mb-1 block text-[12px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>Kiti atlikėjai (apšildantys / festivalio)</label>
                {extraArtists.length > 0 && (
                  <div className="mb-1.5 flex flex-wrap gap-1.5">
                    {extraArtists.map((a) => (
                      <span key={a.id} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] ring-1" style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', ['--tw-ring-color' as any]: 'var(--border-subtle)' } as any}>
                        {a.title}
                        <button onClick={() => setExtraArtists((l) => l.filter((x) => x.id !== a.id))} style={{ color: 'var(--text-faint)' }}>✕</button>
                      </span>
                    ))}
                  </div>
                )}
                <MusicSearchPicker attached={[]} onAdd={(h) => setExtraArtists((l) => l.some((x) => x.id === h.id) || h.id === artist?.id ? l : [...l, { id: h.id, title: h.title, image_url: h.image_url, slug: h.slug || null }])} typeFilter="grupe" compact placeholder="Pridėk atlikėją…" />
              </div>

              <button onClick={() => { setDescribe(false) }} className="self-start text-[12px]" style={{ color: 'var(--accent-link)' }}>← Atgal į koncertų sąrašą</button>
            </div>
          ) : (
            // Nei pasirinkta, nei kuriama — tiesiog šio atlikėjo koncertas
            <div>
              <label className="mb-1 block text-[12px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>Renginys (nebūtina)</label>
              <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Renginys nenurodytas — tiesiog šio atlikėjo koncertas.</p>
              <button onClick={() => { setEvent(null); setDescribe(true) }} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed py-2.5 text-[14px] font-bold" style={{ borderColor: 'var(--border-default)', color: 'var(--accent-orange)' }}>
                <span className="text-[16px]">＋</span> Sukurti savo renginį
              </button>
            </div>
          )}

          {/* Kada — tik jei renginys NEpririštas (kitaip data imama iš renginio) */}
          {!event && (
            <div className="mt-4">
              <label className="mb-1 block text-[12px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>Kada matei? (užtenka metų)</label>
              <div className="grid grid-cols-3 gap-2">
                <input value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Metai" inputMode="numeric" className="w-full rounded-lg px-3 py-2 text-[14px] outline-none ring-1" style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', ['--tw-ring-color' as any]: 'var(--border-default)' } as any} />
                <input value={month} onChange={(e) => setMonth(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="Mėnuo" inputMode="numeric" className="w-full rounded-lg px-3 py-2 text-[14px] outline-none ring-1" style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', ['--tw-ring-color' as any]: 'var(--border-default)' } as any} />
                <input value={day} onChange={(e) => setDay(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="Diena" inputMode="numeric" className="w-full rounded-lg px-3 py-2 text-[14px] outline-none ring-1" style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', ['--tw-ring-color' as any]: 'var(--border-default)' } as any} />
              </div>
            </div>
          )}
          <StepNav onBack={() => setStep(1)} onNext={() => setStep(3)} />
        </div>
      )}

      {/* STEP 3 — media + pastaba */}
      {step === 3 && (
        <div>
          <label className="mb-1 block text-[12px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>Nuotraukos / video (nebūtina)</label>
          <MediaUploader media={media} setMedia={setMedia} flash={flash} />
          <label className="mt-3 mb-1 block text-[12px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>Pastaba</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Įspūdis, su kuo buvai…" className="w-full resize-none rounded-lg px-3 py-2 text-[14px] outline-none ring-1" style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', ['--tw-ring-color' as any]: 'var(--border-default)' } as any} />
          {willBeDraft && <p className="mt-2 rounded-lg px-2.5 py-1.5 text-[12px]" style={{ background: 'rgba(245,158,11,0.10)', color: 'var(--accent-orange)' }}>Naujas atlikėjas/renginys — atsiras profilyje po admino patvirtinimo.</p>}
          <div className="mt-3 flex items-center gap-2">
            <button onClick={() => setStep(event ? 1 : 2)} className="rounded-xl px-3 py-2.5 text-[14px] font-bold ring-1" style={{ color: 'var(--text-secondary)', ['--tw-ring-color' as any]: 'var(--border-default)' } as any}>← Atgal</button>
            <button onClick={submit} disabled={!hasArtist || busy} className="flex-1 rounded-xl py-2.5 text-[14px] font-bold text-white transition-transform hover:scale-[1.01] disabled:opacity-45" style={{ background: 'var(--accent-orange)' }}>{busy ? 'Pridedama…' : 'Pridėti'}</button>
          </div>
        </div>
      )}
    </section>
  )
}

function QuickPickRow({ title, artists, onPick }: { title: string; artists: QuickArtist[]; onPick: (a: QuickArtist) => void }) {
  if (!artists.length) return null
  return (
    <div className="mt-4">
      <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>{title}</div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {artists.slice(0, 20).map((a) => (
          <button key={a.id} onClick={() => onPick(a)} className="w-[74px] shrink-0 text-center">
            <div className="mx-auto h-[74px] w-[74px] overflow-hidden rounded-full ring-1" style={{ background: 'var(--cover-placeholder)', ['--tw-ring-color' as any]: 'var(--border-subtle)' } as any}>
              {a.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={proxyImg(a.image_url)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
              ) : <div className="flex h-full w-full items-center justify-center text-[22px]">🎤</div>}
            </div>
            <div className="mt-1 line-clamp-2 text-[12px] font-semibold leading-tight" style={{ color: 'var(--text-secondary)' }}>{a.title}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

function StepNav({ onBack, onNext, nextDisabled }: { onBack?: () => void; onNext: () => void; nextDisabled?: boolean }) {
  return (
    <div className="mt-4 flex items-center gap-2">
      {onBack && <button onClick={onBack} className="rounded-xl px-3 py-2.5 text-[14px] font-bold ring-1" style={{ color: 'var(--text-secondary)', ['--tw-ring-color' as any]: 'var(--border-default)' } as any}>← Atgal</button>}
      <button onClick={onNext} disabled={nextDisabled} className="flex-1 rounded-xl py-2.5 text-[14px] font-bold text-white transition-transform hover:scale-[1.01] disabled:opacity-45" style={{ background: 'var(--accent-orange)' }}>Toliau →</button>
    </div>
  )
}

// ── Media įkėlimas ──────────────────────────────────────────────────────────
// Sugeneruoja video poster kadrą (client-side, iš pasirinkto failo). Grąžina
// Blob (jpeg) arba null. Veikia ten, kur naršyklė gali dekoduoti video (iOS
// Safari — savo įrašytą HEVC gali; desktop HEVC — dažnai ne, tada null).
async function makeVideoPoster(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    let settled = false
    const done = (b: Blob | null) => { if (!settled) { settled = true; try { URL.revokeObjectURL(url) } catch {} resolve(b) } }
    const url = URL.createObjectURL(file)
    const v = document.createElement('video')
    v.preload = 'metadata'; v.muted = true; (v as any).playsInline = true; v.src = url
    const timer = setTimeout(() => done(null), 8000)
    v.onloadeddata = () => { try { v.currentTime = Math.min(0.15, (v.duration || 1) / 3) } catch { clearTimeout(timer); done(null) } }
    v.onseeked = () => {
      clearTimeout(timer)
      try {
        const w = v.videoWidth || 320, h = v.videoHeight || 180
        const scale = Math.min(1, 640 / Math.max(w, h))
        const c = document.createElement('canvas')
        c.width = Math.round(w * scale); c.height = Math.round(h * scale)
        const ctx = c.getContext('2d'); if (!ctx) return done(null)
        ctx.drawImage(v, 0, 0, c.width, c.height)
        c.toBlob((b) => done(b), 'image/jpeg', 0.8)
      } catch { done(null) }
    }
    v.onerror = () => { clearTimeout(timer); done(null) }
  })
}

// Įkelia Blob/File per signed URL, grąžina viešą URL arba null.
async function uploadBlob(blob: Blob, contentType: string): Promise<string | null> {
  try {
    const signRes = await fetch('/api/mano-muzika/seen-live/media-url', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'f', contentType }),
    })
    const sign = await signRes.json().catch(() => ({}))
    if (!signRes.ok) return null
    const put = await fetch(sign.uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: blob })
    if (!put.ok) return null
    return sign.publicUrl as string
  } catch { return null }
}

function MediaUploader({ media, setMedia, flash }: { media: SeenLiveMedia[]; setMedia: (m: SeenLiveMedia[]) => void; flash: (m: string) => void }) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const uploading = progress != null

  async function onFiles(files: FileList | null) {
    if (!files || !files.length) return
    const list = Array.from(files).slice(0, 12)
    setProgress({ done: 0, total: list.length })
    const added: SeenLiveMedia[] = []
    try {
      for (let i = 0; i < list.length; i++) {
        const file = list[i]
        const isVideo = file.type.startsWith('video/')
        const cap = isVideo ? 50 * 1024 * 1024 : 25 * 1024 * 1024
        if (file.size > cap) { flash(isVideo ? 'Video per didelis (max 50MB)' : 'Nuotrauka per didelė (max 25MB)'); setProgress((p) => p && { ...p, done: p.done + 1 }); continue }
        try {
          // Video: pirma bandom sugeneruoti poster kadrą (thumbnail'ui)
          let poster: string | null = null
          if (isVideo) {
            const blob = await makeVideoPoster(file).catch(() => null)
            if (blob) poster = await uploadBlob(blob, 'image/jpeg')
          }
          const signRes = await fetch('/api/mano-muzika/seen-live/media-url', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: file.name, contentType: file.type }),
          })
          const sign = await signRes.json().catch(() => ({}))
          if (!signRes.ok) throw new Error(sign.error || 'Įkelti nepavyko')
          const put = await fetch(sign.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
          if (!put.ok) throw new Error('Įkelti nepavyko')
          added.push({ url: sign.publicUrl, type: sign.type, poster })
        } catch (e: any) { flash(e?.message || 'Įkelti nepavyko') }
        setProgress((p) => p && { ...p, done: p.done + 1 })
      }
      if (added.length) setMedia([...media, ...added])
    } finally { setProgress(null); if (inputRef.current) inputRef.current.value = '' }
  }

  const remaining = progress ? Math.max(0, progress.total - progress.done) : 0

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {media.map((m, i) => (
          <div key={i} className="relative h-20 w-20 overflow-hidden rounded-lg ring-1" style={{ background: 'var(--cover-placeholder)', ['--tw-ring-color' as any]: 'var(--border-subtle)' } as any}>
            {m.type === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={proxyImg(m.url)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
            ) : m.poster ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={proxyImg(m.poster)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                <span className="absolute inset-0 flex items-center justify-center"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white"><svg viewBox="0 0 24 24" width={11} height={11} fill="currentColor"><polygon points="6 4 20 12 6 20 6 4" /></svg></span></span>
              </>
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[22px]">🎬</div>
            )}
            <button onClick={() => setMedia(media.filter((_, j) => j !== i))} aria-label="Pašalinti" className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white">
              <svg viewBox="0 0 16 16" width={9} height={9} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"><path d="M3 3l10 10M13 3L3 13" /></svg>
            </button>
          </div>
        ))}
        {/* Įkėlimo spinner tiles */}
        {Array.from({ length: remaining }).map((_, i) => (
          <div key={`up-${i}`} className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg ring-1" style={{ background: 'var(--bg-elevated)', ['--tw-ring-color' as any]: 'var(--border-subtle)' } as any}>
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border-default)] border-t-[var(--accent-orange)]" />
            <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>Įkeliama…</span>
          </div>
        ))}
        {!uploading && (
          <button onClick={() => inputRef.current?.click()}
            className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-[12px]"
            style={{ borderColor: 'var(--border-default)', color: 'var(--text-faint)' }}>
            <span className="text-[20px]">＋</span>foto/video
          </button>
        )}
      </div>
      {uploading && (
        <div className="mt-2 flex items-center gap-2 text-[13px] font-semibold" style={{ color: 'var(--accent-orange)' }}>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border-default)] border-t-[var(--accent-orange)]" />
          Įkeliama {progress!.done}/{progress!.total}… (video gali užtrukti)
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*,video/mp4,video/webm,video/quicktime" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      <p className="mt-1 text-[11px]" style={{ color: 'var(--text-faint)' }}>Nuotraukos + video (mp4/webm/mov, iki 50MB).</p>
    </div>
  )
}
