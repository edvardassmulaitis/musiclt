'use client'
// app/admin/matyti-gyvai/SeenLiveReview.tsx
// ────────────────────────────────────────────────────────────────────────────
// Narių „Matyti gyvai" draft'ų moderacijos eilė.
//   • Atlikėjas: jei narys pasiūlė naują (raw_artist_name) — adminas gali
//     PRIRIŠTI prie esamo (admin artist paieška) arba SUKURTI naują (koreguojamu
//     pavadinimu). Jei atlikėjas jau susietas — rodomas.
//   • Renginys: raw tekstą galima palikti kaip yra, sukurti tikrą renginį DB
//     (reikia datos) arba pririšti prie esamo (paieška).
//   • Approve → PATCH /api/admin/seen-live/[id]. Optimistinis šalinimas.
// ────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import { proxyImg } from '@/lib/img-proxy'
import type { SeenLivePending } from '@/lib/seen-live'

type ArtistHit = { id: number; name: string; slug: string; country: string | null; cover_image_url: string | null }
type EventHit = { id: string; title: string; slug: string; start_date: string | null; city: string | null }

type EventMode = 'keep' | 'create' | 'link'

export default function SeenLiveReview({ initial }: { initial: SeenLivePending[] }) {
  const [items, setItems] = useState(initial)
  const [err, setErr] = useState<string | null>(null)

  if (items.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-[var(--border-default)] p-6 text-center text-sm text-[var(--text-faint)]">
        Naujų „matyti gyvai" pasiūlymų nėra.
      </section>
    )
  }

  return (
    <section>
      {err && <div className="mb-3 rounded-lg bg-[rgba(248,113,113,0.12)] px-3 py-2 text-sm text-[var(--accent-red)]">{err}</div>}
      <ul className="flex flex-col gap-4">
        {items.map((it) => (
          <ReviewCard key={it.id} item={it}
            onDone={(id) => setItems((l) => l.filter((x) => x.id !== id))}
            onError={setErr} />
        ))}
      </ul>
    </section>
  )
}

function ReviewCard({ item, onDone, onError }: {
  item: SeenLivePending
  onDone: (id: number) => void
  onError: (m: string | null) => void
}) {
  const [busy, setBusy] = useState(false)

  // Atlikėjas
  const hasArtist = !!item.artist
  const [artistName, setArtistName] = useState(item.raw_artist_name || item.artist?.name || '')
  const [linkedArtist, setLinkedArtist] = useState<ArtistHit | null>(null)
  const [createArtist, setCreateArtist] = useState(!hasArtist) // jei nėra — default sukurti naują

  // Renginys
  const hasEvent = !!item.event
  const proposedEvent = !!(item.raw_event_title || item.raw_event_venue || item.raw_event_city)
  const [evMode, setEvMode] = useState<EventMode>(hasEvent ? 'keep' : (proposedEvent ? 'keep' : 'keep'))
  const [evTitle, setEvTitle] = useState(item.raw_event_title || '')
  const [evCountry, setEvCountry] = useState(item.raw_event_country || 'Lietuva')
  const [evCity, setEvCity] = useState(item.raw_event_city || '')
  const [evVenue, setEvVenue] = useState(item.raw_event_venue || '')
  const [evDate, setEvDate] = useState(item.seen_date || '')
  const [linkedEvent, setLinkedEvent] = useState<EventHit | null>(null)
  const [year, setYear] = useState(item.seen_year ? String(item.seen_year) : '')
  const [rejectNote, setRejectNote] = useState('')

  async function approve() {
    setBusy(true); onError(null)
    try {
      const body: any = { action: 'approve', seen_year: year ? Number(year) : null }
      // Atlikėjas
      if (!hasArtist) {
        if (linkedArtist && !createArtist) { body.artist_id = linkedArtist.id }
        else { body.create_artist = true; body.artist_name = artistName.trim() }
      }
      // Renginys
      if (!hasEvent) {
        if (evMode === 'create') {
          body.create_event = true
          body.event_title = evTitle.trim()
          body.event_country = evCountry.trim()
          body.event_city = evCity.trim()
          body.event_venue = evVenue.trim()
          body.event_date = evDate
        } else if (evMode === 'link' && linkedEvent) {
          body.event_id = linkedEvent.id
        } else {
          // keep — paliekam raw tekstą (pakoreguotą)
          body.event_title = evTitle.trim() || null
          body.event_country = evCountry.trim() || null
          body.event_city = evCity.trim() || null
          body.event_venue = evVenue.trim() || null
        }
      }
      const res = await fetch(`/api/admin/seen-live/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'Klaida') }
      onDone(item.id)
    } catch (e: any) { onError(e?.message || 'Klaida') } finally { setBusy(false) }
  }

  async function reject() {
    setBusy(true); onError(null)
    try {
      const res = await fetch(`/api/admin/seen-live/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', note: rejectNote || null }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'Klaida') }
      onDone(item.id)
    } catch (e: any) { onError(e?.message || 'Klaida') } finally { setBusy(false) }
  }

  const inputCls = 'w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] outline-none'

  return (
    <li className="rounded-xl bg-[var(--bg-surface)] p-4 ring-1 ring-[var(--border-subtle)]">
      {/* Antraštė: kas pasiūlė */}
      <div className="mb-3 flex items-center justify-between gap-2 text-[12px] text-[var(--text-muted)]">
        <span>
          <b className="text-[var(--text-secondary)]">@{item.user?.username || '—'}</b> · {new Date(item.created_at).toLocaleDateString('lt-LT')}
        </span>
        {item.note && <span className="italic truncate max-w-[50%]">„{item.note}"</span>}
      </div>

      {/* ── Atlikėjas ── */}
      <div className="mb-3">
        <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--text-faint)]">Atlikėjas</div>
        {hasArtist ? (
          <div className="flex items-center gap-2">
            {item.artist?.cover_image_url && /* eslint-disable-next-line @next/next/no-img-element */ (
              <img src={proxyImg(item.artist.cover_image_url)} alt="" referrerPolicy="no-referrer" className="h-8 w-8 rounded object-cover" />
            )}
            <span className="text-[14px] font-bold text-[var(--text-primary)]">{item.artist?.name}</span>
            <span className="text-[12px] text-[var(--text-faint)]">(jau DB)</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3 text-[13px]">
              <label className="inline-flex items-center gap-1.5">
                <input type="radio" checked={createArtist} onChange={() => setCreateArtist(true)} />
                Sukurti naują
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input type="radio" checked={!createArtist} onChange={() => setCreateArtist(false)} />
                Pririšti esamą
              </label>
            </div>
            {createArtist ? (
              <input value={artistName} onChange={(e) => setArtistName(e.target.value)} placeholder="Atlikėjo pavadinimas" className={inputCls} />
            ) : (
              <ArtistSearch onPick={setLinkedArtist} picked={linkedArtist} />
            )}
          </div>
        )}
      </div>

      {/* ── Renginys ── */}
      {!hasEvent ? (
        <div className="mb-3">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--text-faint)]">Renginys</div>
          <div className="mb-2 flex flex-wrap items-center gap-3 text-[13px]">
            <label className="inline-flex items-center gap-1.5"><input type="radio" checked={evMode === 'keep'} onChange={() => setEvMode('keep')} /> Palikti tekstu</label>
            <label className="inline-flex items-center gap-1.5"><input type="radio" checked={evMode === 'create'} onChange={() => setEvMode('create')} /> Sukurti renginį DB</label>
            <label className="inline-flex items-center gap-1.5"><input type="radio" checked={evMode === 'link'} onChange={() => setEvMode('link')} /> Pririšti esamą</label>
          </div>
          {evMode === 'link' ? (
            <EventSearchAdmin onPick={setLinkedEvent} picked={linkedEvent} />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <input value={evTitle} onChange={(e) => setEvTitle(e.target.value)} placeholder="Pavadinimas" className={inputCls + ' col-span-2'} />
              <input value={evCountry} onChange={(e) => setEvCountry(e.target.value)} placeholder="Šalis" className={inputCls} />
              <input value={evCity} onChange={(e) => setEvCity(e.target.value)} placeholder="Miestas" className={inputCls} />
              <input value={evVenue} onChange={(e) => setEvVenue(e.target.value)} placeholder="Vieta" className={inputCls} />
              {evMode === 'create' && (
                <input type="date" value={evDate} onChange={(e) => setEvDate(e.target.value)} className={inputCls} />
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="mb-3">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--text-faint)]">Renginys</div>
          <span className="text-[14px] text-[var(--text-primary)]">{item.event?.title}</span>
          <span className="ml-2 text-[12px] text-[var(--text-faint)]">(jau DB)</span>
        </div>
      )}

      {/* Metai */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-faint)]">Metai</span>
        <input value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="—" inputMode="numeric" className="w-24 rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] px-2.5 py-1 text-[13px] text-[var(--text-primary)] outline-none" />
      </div>

      {/* Veiksmai */}
      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-3">
        <button onClick={approve} disabled={busy}
          className="rounded-md bg-[var(--accent-green)] px-3 py-1.5 text-xs font-semibold text-[#04130a] disabled:opacity-50">✓ Patvirtinti</button>
        <input value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="Atmetimo priežastis (nebūtina)"
          className="min-w-[140px] flex-1 rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none" />
        <button onClick={reject} disabled={busy}
          className="rounded-md bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-red)] ring-1 ring-[var(--border-default)] disabled:opacity-50">✕ Atmesti</button>
      </div>
    </li>
  )
}

// ── Admin atlikėjų paieška (/api/admin/artists/search) ──────────────────────
function ArtistSearch({ onPick, picked }: { onPick: (a: ArtistHit | null) => void; picked: ArtistHit | null }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<ArtistHit[]>([])
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setResults([]); return }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/artists/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        const data = await res.json()
        setResults(data.results || [])
      } catch (e: any) { if (e?.name !== 'AbortError') setResults([]) }
    }, 160)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [q])

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  if (picked) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] px-2.5 py-1.5">
        {picked.cover_image_url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={proxyImg(picked.cover_image_url)} alt="" referrerPolicy="no-referrer" className="h-6 w-6 rounded object-cover" />}
        <span className="text-[13px] font-bold text-[var(--text-primary)]">{picked.name}</span>
        <button onClick={() => onPick(null)} className="ml-auto text-[12px] text-[var(--accent-link)]">keisti</button>
      </div>
    )
  }

  return (
    <div ref={wrapRef} className="relative">
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
        placeholder="Ieškok atlikėjo DB…"
        className="w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] outline-none" />
      {open && results.length > 0 && (
        <ul className="absolute left-0 right-0 z-50 mt-1 max-h-[240px] overflow-y-auto rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-lg">
          {results.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => { onPick(a); setOpen(false); setQ('') }}
                className="flex w-full items-center gap-2 border-b border-[var(--border-subtle)] px-2.5 py-1.5 text-left last:border-b-0 hover:bg-[var(--bg-hover)]">
                {a.cover_image_url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={proxyImg(a.cover_image_url)} alt="" referrerPolicy="no-referrer" className="h-6 w-6 rounded object-cover" />}
                <span className="text-[13px] font-bold text-[var(--text-primary)]">{a.name}</span>
                {a.country && <span className="text-[11px] text-[var(--text-faint)]">{a.country}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Renginių paieška (/api/events/search) ───────────────────────────────────
function EventSearchAdmin({ onPick, picked }: { onPick: (e: EventHit | null) => void; picked: EventHit | null }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<EventHit[]>([])
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setResults([]); return }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/events/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        const data = await res.json()
        setResults(data.results || [])
      } catch (e: any) { if (e?.name !== 'AbortError') setResults([]) }
    }, 160)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [q])

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  if (picked) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] px-2.5 py-1.5">
        <span className="text-[13px] text-[var(--text-primary)]">{picked.title}{picked.city ? ` · ${picked.city}` : ''}</span>
        <button onClick={() => onPick(null)} className="ml-auto text-[12px] text-[var(--accent-link)]">keisti</button>
      </div>
    )
  }

  return (
    <div ref={wrapRef} className="relative">
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
        placeholder="Ieškok renginio DB…"
        className="w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] outline-none" />
      {open && results.length > 0 && (
        <ul className="absolute left-0 right-0 z-50 mt-1 max-h-[240px] overflow-y-auto rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-lg">
          {results.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => { onPick(e); setOpen(false); setQ('') }}
                className="flex w-full flex-col items-start border-b border-[var(--border-subtle)] px-2.5 py-1.5 text-left last:border-b-0 hover:bg-[var(--bg-hover)]">
                <span className="text-[13px] font-bold text-[var(--text-primary)]">{e.title}</span>
                <span className="text-[11px] text-[var(--text-faint)]">{[e.city, e.start_date ? String(e.start_date).slice(0, 10) : null].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
