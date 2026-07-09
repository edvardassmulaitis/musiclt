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

  useEffect(() => {
    let alive = true
    api('/seen-live', 'GET').then((d) => { if (alive) { setItems(d.items || []); setLoaded(true) } })
      .catch(() => { if (alive) setLoaded(true) })
    return () => { alive = false }
  }, [])

  // Užrakinam fono scroll'ą, kol atidarytas full-screen wizard'as (mobile).
  useEffect(() => {
    if (!wizardOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [wizardOpen])

  async function remove(id: number) {
    const prev = items
    setItems((l) => l.filter((x) => x.id !== id))
    try { await api('/seen-live', 'DELETE', { id }) }
    catch (e: any) { setItems(prev); flash(e.message || 'Klaida') }
  }

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_400px] gap-5 lg:gap-7 items-start">
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
        <div className="lg:hidden fixed inset-0 z-[200] overflow-y-auto overscroll-contain" style={{ background: 'var(--bg-body)' }}>
          <div className="min-h-full p-3" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
            <Wizard onAdded={(item) => { setItems((l) => [item, ...l]); setWizardOpen(false) }} flash={flash} onClose={() => setWizardOpen(false)} fullscreen likedArtists={likedArtists} />
          </div>
        </div>
      )}
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
  const [describe, setDescribe] = useState(false)         // aprašyti vietą (naujas renginys)
  const [isFestival, setIsFestival] = useState(false)
  const [evTitle, setEvTitle] = useState('')
  const [lineup, setLineup] = useState('')
  const [geo, setGeo] = useState<GeoValue>(EMPTY_GEO)
  const [year, setYear] = useState('')
  const [date, setDate] = useState('')

  // 3 — media + pastaba
  const [media, setMedia] = useState<SeenLiveMedia[]>([])
  const [note, setNote] = useState('')

  const hasArtist = !!artist || (proposeArtist && newArtist.trim().length > 1)
  const willBeDraft = (proposeArtist && !!newArtist.trim()) ||
    (describe && !event && !!(geo.venueName || geo.cityName || evTitle.trim()))

  function reset() {
    setStep(1); setArtist(null); setNewArtist(''); setProposeArtist(false)
    setEvent(null); setDescribe(false); setIsFestival(false); setEvTitle(''); setLineup(''); setGeo(EMPTY_GEO)
    setYear(''); setDate(''); setMedia([]); setNote('')
  }

  async function submit() {
    if (!hasArtist || busy) return
    setBusy(true)
    try {
      const payload: any = {
        artist_id: artist?.id ?? null,
        raw_artist_name: artist ? null : newArtist.trim(),
        event_id: event?.id ?? null,
        raw_event_title: event ? null : (describe && isFestival ? evTitle.trim() || null : null),
        raw_event_country: event ? null : (describe ? geo.countryName : null),
        raw_event_city: event ? null : (describe ? geo.cityName : null),
        raw_event_venue: event ? null : (describe ? geo.venueName : null),
        raw_event_is_festival: event ? false : (describe && isFestival),
        raw_event_lineup: event ? null : (describe && isFestival ? lineup.trim() || null : null),
        seen_year: year ? Number(year) : null,
        seen_date: date || null,
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
                {event && <p className="mt-1.5 text-[12px]" style={{ color: 'var(--accent-orange)' }}>Pasirinktas renginys — 2 žingsnyje bus pririštas.</p>}
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
          <StepNav onNext={() => hasArtist && setStep(2)} nextDisabled={!hasArtist} />
        </div>
      )}

      {/* STEP 2 — renginys / kontekstas */}
      {step === 2 && (
        <div>
          <label className="mb-1 block text-[12px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>Renginys (nebūtina)</label>
          {!describe ? (
            <>
              {event ? (
                <div className="mb-2 flex items-center gap-2 rounded-lg p-2 ring-1" style={{ background: 'var(--bg-elevated)', ['--tw-ring-color' as any]: 'var(--border-subtle)' } as any}>
                  <span className="min-w-0 flex-1 truncate text-[14px]" style={{ color: 'var(--text-primary)' }}>{event.title}{event.city ? ` · ${event.city}` : ''}{event.start_date ? ` · ${String(event.start_date).slice(0, 4)}` : ''}</span>
                  <button onClick={() => setEvent(null)} className="text-[12px]" style={{ color: 'var(--accent-link)' }}>keisti</button>
                </div>
              ) : (
                <EventSearch onPick={(e) => setEvent(e)} />
              )}
              <button onClick={() => { setDescribe(true); setEvent(null) }} className="mt-1.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>Nerandi? <span style={{ color: 'var(--accent-link)' }}>Aprašyk pats →</span></button>
              <p className="mt-2 text-[12px]" style={{ color: 'var(--text-faint)' }}>Jei tai buvo tiesiog šio atlikėjo koncertas — renginio nurodyti nebūtina.</p>
            </>
          ) : (
            <div className="flex flex-col gap-2">
              <GeoPicker value={geo} onChange={setGeo} compact />
              <label className="mt-1 inline-flex items-center gap-2 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={isFestival} onChange={(e) => setIsFestival(e.target.checked)} />
                Festivalis arba keli atlikėjai (apšildantys)
              </label>
              {isFestival && (
                <>
                  <input value={evTitle} onChange={(e) => setEvTitle(e.target.value)} placeholder="Renginio / festivalio pavadinimas" className="w-full rounded-lg px-3 py-2 text-[14px] outline-none ring-1" style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', ['--tw-ring-color' as any]: 'var(--border-default)' } as any} />
                  <input value={lineup} onChange={(e) => setLineup(e.target.value)} placeholder="Kiti atlikėjai (per kablelį) — nebūtina" className="w-full rounded-lg px-3 py-2 text-[14px] outline-none ring-1" style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', ['--tw-ring-color' as any]: 'var(--border-default)' } as any} />
                </>
              )}
              <button onClick={() => setDescribe(false)} className="self-start text-[12px]" style={{ color: 'var(--accent-link)' }}>← Ieškoti esamų</button>
            </div>
          )}

          {/* Kada */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[12px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>Metai</label>
              <input value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="pvz. 2019" inputMode="numeric" className="w-full rounded-lg px-3 py-2 text-[14px] outline-none ring-1" style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', ['--tw-ring-color' as any]: 'var(--border-default)' } as any} />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>Tiksli data</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-lg px-3 py-2 text-[14px] outline-none ring-1" style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', ['--tw-ring-color' as any]: 'var(--border-default)' } as any} />
            </div>
          </div>
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
            <button onClick={() => setStep(2)} className="rounded-xl px-3 py-2.5 text-[14px] font-bold ring-1" style={{ color: 'var(--text-secondary)', ['--tw-ring-color' as any]: 'var(--border-default)' } as any}>← Atgal</button>
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
function MediaUploader({ media, setMedia, flash }: { media: SeenLiveMedia[]; setMedia: (m: SeenLiveMedia[]) => void; flash: (m: string) => void }) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  async function onFiles(files: FileList | null) {
    if (!files || !files.length) return
    setUploading(true)
    const added: SeenLiveMedia[] = []
    try {
      for (const file of Array.from(files).slice(0, 12)) {
        const isVideo = file.type.startsWith('video/')
        const cap = isVideo ? 50 * 1024 * 1024 : 25 * 1024 * 1024
        if (file.size > cap) { flash(isVideo ? 'Video per didelis (max 50MB)' : 'Nuotrauka per didelė (max 25MB)'); continue }
        // 1) signed upload URL
        const signRes = await fetch('/api/mano-muzika/seen-live/media-url', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, contentType: file.type }),
        })
        const sign = await signRes.json().catch(() => ({}))
        if (!signRes.ok) { flash(sign.error || 'Įkelti nepavyko'); continue }
        // 2) PUT failą tiesiai į Storage
        const put = await fetch(sign.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
        if (!put.ok) { flash('Įkelti nepavyko'); continue }
        added.push({ url: sign.publicUrl, type: sign.type })
      }
      if (added.length) setMedia([...media, ...added])
    } finally { setUploading(false); if (inputRef.current) inputRef.current.value = '' }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {media.map((m, i) => (
          <div key={i} className="relative h-20 w-20 overflow-hidden rounded-lg ring-1" style={{ background: 'var(--cover-placeholder)', ['--tw-ring-color' as any]: 'var(--border-subtle)' } as any}>
            {m.type === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={proxyImg(m.url)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[22px]">🎬</div>
            )}
            <button onClick={() => setMedia(media.filter((_, j) => j !== i))} aria-label="Pašalinti" className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white">
              <svg viewBox="0 0 16 16" width={9} height={9} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"><path d="M3 3l10 10M13 3L3 13" /></svg>
            </button>
          </div>
        ))}
        <button onClick={() => inputRef.current?.click()} disabled={uploading}
          className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-[12px] disabled:opacity-50"
          style={{ borderColor: 'var(--border-default)', color: 'var(--text-faint)' }}>
          {uploading ? '…' : <><span className="text-[20px]">＋</span>foto/video</>}
        </button>
      </div>
      <input ref={inputRef} type="file" accept="image/*,video/mp4,video/webm,video/quicktime" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      <p className="mt-1 text-[11px]" style={{ color: 'var(--text-faint)' }}>Nuotraukos + video (mp4/webm/mov, iki 50MB).</p>
    </div>
  )
}

// ── Renginio typeahead ──────────────────────────────────────────────────────
function EventSearch({ onPick }: { onPick: (e: EventPick) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<EventPick[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setResults([]); setLoading(false); return }
    setLoading(true)
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/events/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        const data = await res.json()
        setResults(data.results || [])
      } catch (e: any) { if (e?.name !== 'AbortError') setResults([]) }
      finally { setLoading(false) }
    }, 160)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [q])

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <div ref={wrapRef} className="relative">
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} placeholder="Ieškok renginio…"
        className="w-full rounded-lg px-3 py-2 text-[14px] outline-none ring-1" style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', ['--tw-ring-color' as any]: 'var(--border-default)' } as any} />
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 z-50 mt-1.5 max-h-[280px] overflow-y-auto rounded-lg ring-1 shadow-lg" style={{ background: 'var(--bg-surface)', ['--tw-ring-color' as any]: 'var(--border-default)' } as any}>
          {loading ? (
            <div className="px-3 py-3 text-center text-[13px]" style={{ color: 'var(--text-faint)' }}>Ieškoma…</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-3 text-center text-[13px]" style={{ color: 'var(--text-faint)' }}>Nieko nerasta.</div>
          ) : (
            <ul>
              {results.map((e) => (
                <li key={e.id}>
                  <button type="button" onClick={() => { onPick(e); setQ(''); setResults([]); setOpen(false) }} className="flex w-full flex-col items-start border-b px-3 py-2 text-left last:border-b-0 hover:bg-[var(--bg-hover)]" style={{ borderColor: 'var(--border-subtle)' }}>
                    <span className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>{e.title}</span>
                    <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{[e.city, e.start_date ? String(e.start_date).slice(0, 10) : null].filter(Boolean).join(' · ')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
