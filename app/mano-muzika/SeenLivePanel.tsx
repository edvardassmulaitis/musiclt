'use client'
// app/mano-muzika/SeenLivePanel.tsx
// ────────────────────────────────────────────────────────────────────────────
// „Matyti gyvai" — narys susideda atlikėjus, kuriuos matė koncertuose.
//   • Atlikėjas: paieška tarp esamų (MusicSearchPicker, tik grupės) → jei
//     neranda, gali pasiūlyti naują (laisvas tekstas → draft adminams).
//   • Renginys (nebūtina): paieška tarp esamų arba pasiūlyti naują (pavadinimas,
//     šalis, miestas, vieta). Jei naujas — visas įrašas tampa draft'u.
//   • Papildomai: metai / data / pastaba.
//
// Sąrašą kraunasi pats (GET /api/mano-muzika/seen-live). Approved įrašai iškart
// matosi profilyje; pending laukia admino patvirtinimo.
// ────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import { proxyImg } from '@/lib/img-proxy'
import MusicSearchPicker, { type AttachmentHit } from '@/components/MusicSearchPicker'
import type { SeenLiveRow } from '@/lib/seen-live'

// Dažniausi LT miestai — datalist pasiūlymui (bet leidžiama įvesti bet ką).
const LT_CITIES = ['Vilnius', 'Kaunas', 'Klaipėda', 'Šiauliai', 'Panevėžys', 'Alytus', 'Marijampolė', 'Utena', 'Palanga', 'Trakai', 'Nida']

type EventPick = { id: string; title: string; slug: string; start_date: string | null; city: string | null }

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

export default function SeenLivePanel({ flash }: { flash: (m: string) => void }) {
  const [items, setItems] = useState<SeenLiveRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)

  // Forma
  const [artist, setArtist] = useState<AttachmentHit | null>(null)
  const [newArtist, setNewArtist] = useState('')          // pasiūlyti naują
  const [proposeArtist, setProposeArtist] = useState(false)

  const [event, setEvent] = useState<EventPick | null>(null)
  const [proposeEvent, setProposeEvent] = useState(false)
  const [evTitle, setEvTitle] = useState('')
  const [evCountry, setEvCountry] = useState('Lietuva')
  const [evCity, setEvCity] = useState('')
  const [evVenue, setEvVenue] = useState('')

  const [year, setYear] = useState('')
  const [date, setDate] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    let alive = true
    api('/seen-live', 'GET').then((d) => { if (alive) { setItems(d.items || []); setLoaded(true) } })
      .catch(() => { if (alive) setLoaded(true) })
    return () => { alive = false }
  }, [])

  function resetForm() {
    setArtist(null); setNewArtist(''); setProposeArtist(false)
    setEvent(null); setProposeEvent(false); setEvTitle(''); setEvCountry('Lietuva'); setEvCity(''); setEvVenue('')
    setYear(''); setDate(''); setNote('')
  }

  const hasArtist = !!artist || (proposeArtist && newArtist.trim().length > 1)
  const willBeDraft = (proposeArtist && !!newArtist.trim()) || (proposeEvent && !!(evTitle.trim() || evVenue.trim() || evCity.trim()))

  async function submit() {
    if (!hasArtist || busy) return
    setBusy(true)
    try {
      const payload: any = {
        artist_id: artist?.id ?? null,
        raw_artist_name: artist ? null : newArtist.trim(),
        event_id: event?.id ?? null,
        raw_event_title: event ? null : (proposeEvent ? evTitle.trim() || null : null),
        raw_event_country: event ? null : (proposeEvent ? evCountry.trim() || null : null),
        raw_event_city: event ? null : (proposeEvent ? evCity.trim() || null : null),
        raw_event_venue: event ? null : (proposeEvent ? evVenue.trim() || null : null),
        seen_year: year ? Number(year) : null,
        seen_date: date || null,
        note: note.trim() || null,
      }
      const { item } = await api('/seen-live', 'POST', payload)
      setItems((l) => [item, ...l])
      resetForm()
      flash(item.status === 'pending' ? 'Pridėta — laukia patvirtinimo' : 'Pridėta į profilį')
    } catch (e: any) {
      flash(e.message || 'Klaida')
    } finally { setBusy(false) }
  }

  async function remove(id: number) {
    const prev = items
    setItems((l) => l.filter((x) => x.id !== id))
    try { await api('/seen-live', 'DELETE', { id }) }
    catch (e: any) { setItems(prev); flash(e.message || 'Klaida') }
  }

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-5 lg:gap-7 items-start">
      {/* ── Sąrašas ── */}
      <section className="min-w-0">
        <h2 className="mb-1 font-['Outfit',sans-serif] text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
          Atlikėjai, kuriuos mačiau gyvai
        </h2>
        <p className="mb-4 text-[13px]" style={{ color: 'var(--text-muted)' }}>
          Susidėk atlikėjus iš koncertų. Nauji atlikėjai ar renginiai patenka į peržiūrą ir atsiras patvirtinus.
        </p>

        {!loaded ? (
          <div className="py-10 text-center text-[14px]" style={{ color: 'var(--text-faint)' }}>Kraunama…</div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-[14px]"
            style={{ borderColor: 'var(--border-default)', color: 'var(--text-faint)' }}>
            Dar nieko nepridėta. Pridėk pirmą atlikėją dešinėje →
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {items.map((it) => {
              const y = yearOf(it)
              const name = it.artist?.name || it.raw_artist_name || '—'
              const cover = it.artist?.cover_image_url || null
              const evLabel = it.event?.title || it.raw_event_title
              const place = [it.raw_event_venue, it.raw_event_city, (it.raw_event_country && it.raw_event_country !== 'Lietuva') ? it.raw_event_country : null]
                .filter(Boolean).join(', ')
              return (
                <li key={it.id} className="flex items-center gap-3 rounded-xl p-2.5 pr-3 ring-1"
                  style={{ background: 'var(--bg-surface)', boxShadow: 'none', borderColor: 'transparent', ['--tw-ring-color' as any]: 'var(--border-subtle)' }}>
                  <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg" style={{ background: 'var(--cover-placeholder)' }}>
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={proxyImg(cover)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                    ) : <div className="flex h-full w-full items-center justify-center text-[16px]" style={{ color: 'var(--text-faint)' }}>🎤</div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-['Outfit',sans-serif] text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>{name}</span>
                      {it.status === 'pending' && (
                        <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide"
                          style={{ background: 'rgba(245,158,11,0.16)', color: 'var(--accent-orange)' }}>Laukia</span>
                      )}
                      {it.status === 'rejected' && (
                        <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide"
                          style={{ background: 'rgba(248,113,113,0.14)', color: 'var(--accent-red)' }}>Atmesta</span>
                      )}
                    </div>
                    <div className="truncate text-[12px]" style={{ color: 'var(--text-muted)' }}>
                      {[evLabel, place, y ? String(y) : null].filter(Boolean).join(' · ') || 'Be renginio'}
                    </div>
                  </div>
                  <button onClick={() => remove(it.id)} aria-label="Pašalinti"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[var(--bg-hover)]"
                    style={{ color: 'var(--text-faint)' }}>
                    <svg viewBox="0 0 16 16" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M3 3l10 10M13 3L3 13" /></svg>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* ── Forma ── */}
      <section className="rounded-2xl p-4 ring-1 lg:sticky lg:top-4"
        style={{ background: 'var(--bg-surface)', ['--tw-ring-color' as any]: 'var(--border-subtle)' }}>
        <h3 className="mb-3 font-['Outfit',sans-serif] text-[15px] font-extrabold" style={{ color: 'var(--text-primary)' }}>Pridėti atlikėją</h3>

        {/* Atlikėjas */}
        <label className="mb-1 block text-[12px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>Atlikėjas *</label>
        {!proposeArtist ? (
          <>
            {artist ? (
              <div className="mb-2 flex items-center gap-2 rounded-lg p-2 ring-1" style={{ background: 'var(--bg-elevated)', ['--tw-ring-color' as any]: 'var(--border-subtle)' }}>
                <div className="h-8 w-8 shrink-0 overflow-hidden rounded" style={{ background: 'var(--cover-placeholder)' }}>
                  {artist.image_url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={proxyImg(artist.image_url)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />}
                </div>
                <span className="min-w-0 flex-1 truncate text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>{artist.title}</span>
                <button onClick={() => setArtist(null)} className="text-[12px]" style={{ color: 'var(--accent-link)' }}>keisti</button>
              </div>
            ) : (
              <MusicSearchPicker attached={[]} onAdd={(h) => setArtist(h)} typeFilter="grupe" compact placeholder="Ieškok atlikėjo…" />
            )}
            <button onClick={() => { setProposeArtist(true); setArtist(null) }}
              className="mt-1.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
              Nerandi? <span style={{ color: 'var(--accent-link)' }}>Pasiūlyk naują →</span>
            </button>
          </>
        ) : (
          <>
            <input value={newArtist} onChange={(e) => setNewArtist(e.target.value)} placeholder="Naujo atlikėjo pavadinimas"
              className="w-full rounded-lg px-3 py-2 text-[14px] outline-none ring-1"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', ['--tw-ring-color' as any]: 'var(--border-default)' }} />
            <button onClick={() => { setProposeArtist(false); setNewArtist('') }} className="mt-1.5 text-[12px]" style={{ color: 'var(--accent-link)' }}>← Ieškoti esamų</button>
          </>
        )}

        {/* Renginys */}
        <div className="mt-4 mb-1 flex items-center justify-between">
          <label className="block text-[12px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>Renginys (nebūtina)</label>
        </div>
        {!proposeEvent ? (
          <>
            {event ? (
              <div className="mb-2 flex items-center gap-2 rounded-lg p-2 ring-1" style={{ background: 'var(--bg-elevated)', ['--tw-ring-color' as any]: 'var(--border-subtle)' }}>
                <span className="min-w-0 flex-1 truncate text-[14px]" style={{ color: 'var(--text-primary)' }}>
                  {event.title}{event.city ? ` · ${event.city}` : ''}{event.start_date ? ` · ${String(event.start_date).slice(0, 4)}` : ''}
                </span>
                <button onClick={() => setEvent(null)} className="text-[12px]" style={{ color: 'var(--accent-link)' }}>keisti</button>
              </div>
            ) : (
              <EventSearch onPick={(e) => setEvent(e)} />
            )}
            <button onClick={() => { setProposeEvent(true); setEvent(null) }} className="mt-1.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
              Nerandi renginio? <span style={{ color: 'var(--accent-link)' }}>Įvesk ranka →</span>
            </button>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <input value={evTitle} onChange={(e) => setEvTitle(e.target.value)} placeholder="Renginio / koncerto pavadinimas"
              className="w-full rounded-lg px-3 py-2 text-[14px] outline-none ring-1" style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', ['--tw-ring-color' as any]: 'var(--border-default)' }} />
            <div className="grid grid-cols-2 gap-2">
              <select value={evCountry} onChange={(e) => setEvCountry(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-[14px] outline-none ring-1" style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', ['--tw-ring-color' as any]: 'var(--border-default)' }}>
                <option>Lietuva</option><option>Latvija</option><option>Estija</option><option>Lenkija</option><option>Kita</option>
              </select>
              <input value={evCity} onChange={(e) => setEvCity(e.target.value)} placeholder="Miestas" list="seenlive-cities"
                className="w-full rounded-lg px-3 py-2 text-[14px] outline-none ring-1" style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', ['--tw-ring-color' as any]: 'var(--border-default)' }} />
              <datalist id="seenlive-cities">{LT_CITIES.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <input value={evVenue} onChange={(e) => setEvVenue(e.target.value)} placeholder="Vieta / arena (nebūtina)"
              className="w-full rounded-lg px-3 py-2 text-[14px] outline-none ring-1" style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', ['--tw-ring-color' as any]: 'var(--border-default)' }} />
            <button onClick={() => { setProposeEvent(false); setEvTitle(''); setEvVenue(''); setEvCity('') }} className="self-start text-[12px]" style={{ color: 'var(--accent-link)' }}>← Ieškoti esamų</button>
          </div>
        )}

        {/* Metai / data */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[12px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>Metai</label>
            <input value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="pvz. 2019" inputMode="numeric"
              className="w-full rounded-lg px-3 py-2 text-[14px] outline-none ring-1" style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', ['--tw-ring-color' as any]: 'var(--border-default)' }} />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>Tiksli data</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-[14px] outline-none ring-1" style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', ['--tw-ring-color' as any]: 'var(--border-default)' }} />
          </div>
        </div>

        {/* Pastaba */}
        <label className="mt-3 mb-1 block text-[12px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>Pastaba (nebūtina)</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Įspūdis, kartu grojo…"
          className="w-full resize-none rounded-lg px-3 py-2 text-[14px] outline-none ring-1" style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', ['--tw-ring-color' as any]: 'var(--border-default)' }} />

        {willBeDraft && (
          <p className="mt-2 rounded-lg px-2.5 py-1.5 text-[12px]" style={{ background: 'rgba(245,158,11,0.10)', color: 'var(--accent-orange)' }}>
            Naujas atlikėjas/renginys — bus rodoma profilyje po admino patvirtinimo.
          </p>
        )}

        <button onClick={submit} disabled={!hasArtist || busy}
          className="mt-3 w-full rounded-xl py-2.5 text-[14px] font-bold text-white transition-transform hover:scale-[1.01] disabled:opacity-45"
          style={{ background: 'var(--accent-orange)' }}>
          {busy ? 'Pridedama…' : 'Pridėti'}
        </button>
      </section>
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
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
        placeholder="Ieškok renginio…"
        className="w-full rounded-lg px-3 py-2 text-[14px] outline-none ring-1"
        style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', ['--tw-ring-color' as any]: 'var(--border-default)' }} />
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 z-50 mt-1.5 max-h-[280px] overflow-y-auto rounded-lg ring-1 shadow-lg"
          style={{ background: 'var(--bg-surface)', ['--tw-ring-color' as any]: 'var(--border-default)' }}>
          {loading ? (
            <div className="px-3 py-3 text-center text-[13px]" style={{ color: 'var(--text-faint)' }}>Ieškoma…</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-3 text-center text-[13px]" style={{ color: 'var(--text-faint)' }}>Nieko nerasta.</div>
          ) : (
            <ul>
              {results.map((e) => (
                <li key={e.id}>
                  <button type="button" onClick={() => { onPick(e); setQ(''); setResults([]); setOpen(false) }}
                    className="flex w-full flex-col items-start border-b px-3 py-2 text-left last:border-b-0 hover:bg-[var(--bg-hover)]"
                    style={{ borderColor: 'var(--border-subtle)' }}>
                    <span className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>{e.title}</span>
                    <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                      {[e.city, e.start_date ? String(e.start_date).slice(0, 10) : null].filter(Boolean).join(' · ')}
                    </span>
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
