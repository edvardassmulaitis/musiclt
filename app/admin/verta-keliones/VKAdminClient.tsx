'use client'

// Klientinis „Verta kelionės" valdiklis. Veiksmai → POST /api/admin/verta-keliones.
// Po kiekvieno veiksmo perkraunam duomenis (paprasta ir patikima).

import { useEffect, useState, useCallback } from 'react'

type Dest = {
  id: number; key: string; city: string; country: string; country_code: string | null
  reach_mode: string; from_airport: string | null; carrier: string | null
  price_from: number | null; drive_hours: number | null; drive_from: string | null
  is_active: boolean; sort_order: number
}
type Event = {
  id: number; artist_name: string; dest_key: string; city: string | null; country: string | null
  venue_name: string | null; start_date: string; end_date: string | null; image_url: string | null
  ticket_url: string | null; is_festival: boolean; popularity: number; is_published: boolean
  verified: boolean; source: string | null
}
type Cand = {
  id: number; artist_name: string; tour_name: string | null; dest_key: string; city: string | null
  country: string | null; venue_name: string | null; start_date: string; image_url: string | null
  popularity: number; is_festival: boolean; source_url: string | null
}
type Data = { destinations: Dest[]; events: Event[]; candidates: Cand[] }

const API = '/api/admin/verta-keliones'
const card = 'rounded-xl border border-[var(--border-default)] bg-white'
const btn = 'rounded-lg px-3 py-1.5 text-sm font-semibold transition'
const inp = 'w-full rounded-lg border border-[var(--border-default)] bg-white px-2.5 py-1.5 text-sm text-[var(--text-primary)]'

export default function VKAdminClient() {
  const [data, setData] = useState<Data | null>(null)
  const [tab, setTab] = useState<'cand' | 'events' | 'dests'>('cand')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const r = await fetch(API, { cache: 'no-store' })
    if (r.ok) setData(await r.json())
    else setMsg('Nepavyko užkrauti (ar prisijungęs kaip admin?)')
  }, [])
  useEffect(() => { load() }, [load])

  const act = useCallback(async (body: any, note?: string) => {
    setBusy(true); setMsg('')
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg(j.error || 'Klaida'); return null }
      if (note) setMsg(note)
      await load()
      return j
    } finally { setBusy(false) }
  }, [load])

  const runScout = async () => {
    setBusy(true); setMsg('Scout vykdomas… (Wikipedia 2026 turai)')
    const j = await act({ action: 'scout' })
    if (j?.scout) {
      const s = j.scout
      setMsg(`Scout: peržiūrėta ${s.tours} turų, rasta ${s.matched}, pridėta ${s.inserted} naujų kandidatų (${s.skipped_existing} jau buvo). ${s.note}`)
    }
  }

  if (!data) return <p className="text-sm text-[var(--text-muted)]">{msg || 'Kraunama…'}</p>

  const dests = data.destinations
  const tabs: [typeof tab, string, number][] = [
    ['cand', 'Kandidatai', data.candidates.length],
    ['events', 'Koncertai', data.events.length],
    ['dests', 'Kryptys', dests.length],
  ]

  return (
    <div>
      {/* Tabs + scout */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {tabs.map(([k, label, n]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`${btn} ${tab === k ? 'bg-[var(--accent-orange)] text-white' : 'bg-[var(--bg-hover)] text-[var(--text-secondary)]'}`}>
            {label} <span className="opacity-70">({n})</span>
          </button>
        ))}
        <button onClick={runScout} disabled={busy}
          className={`${btn} ml-auto bg-[var(--accent-blue)] text-white disabled:opacity-50`}>
          🔎 Paleisti scout
        </button>
      </div>

      {msg && <p className="mb-3 rounded-lg bg-[var(--bg-hover)] px-3 py-2 text-sm text-[var(--text-secondary)]">{msg}</p>}

      {tab === 'cand' && <Candidates data={data} act={act} busy={busy} />}
      {tab === 'events' && <Events data={data} act={act} busy={busy} />}
      {tab === 'dests' && <Destinations data={data} act={act} busy={busy} />}
    </div>
  )
}

/* ── Kandidatai ─────────────────────────────────────────────────── */
function Candidates({ data, act, busy }: { data: Data; act: any; busy: boolean }) {
  if (!data.candidates.length)
    return <p className="text-sm text-[var(--text-muted)]">Kandidatų nėra. Paspausk „Paleisti scout", kad surinktų 2026 turus iš Wikipedia.</p>
  return (
    <div className="grid gap-2">
      {data.candidates.map(c => (
        <div key={c.id} className={`${card} flex items-center gap-3 p-3`}>
          {c.image_url
            ? <img src={c.image_url} alt="" className="h-12 w-12 flex-shrink-0 rounded-lg object-cover" />
            : <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--bg-hover)] text-xs">{c.is_festival ? '🎪' : '🎤'}</div>}
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold text-[var(--text-primary)]">{c.artist_name} <span className="text-xs font-normal text-[var(--text-muted)]">· pop {c.popularity}</span></div>
            <div className="truncate text-xs text-[var(--text-muted)]">{c.city}, {c.country} · {c.venue_name || '—'} · {c.start_date}</div>
            {c.source_url && <a href={c.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--accent-link)]">Wiki šaltinis ↗</a>}
          </div>
          <button disabled={busy} onClick={() => act({ action: 'cand_approve', id: c.id }, 'Patvirtinta → Koncertai')} className={`${btn} bg-[var(--accent-green)] text-white disabled:opacity-50`}>✓ Patvirtinti</button>
          <button disabled={busy} onClick={() => act({ action: 'cand_reject', id: c.id })} className={`${btn} bg-[var(--bg-hover)] text-[var(--text-secondary)] disabled:opacity-50`}>Atmesti</button>
        </div>
      ))}
    </div>
  )
}

/* ── Koncertai ──────────────────────────────────────────────────── */
const EMPTY_EVENT = { artist_name: '', dest_key: '', venue_name: '', start_date: '', end_date: '', image_url: '', ticket_url: '', popularity: 80, is_festival: false }

function Events({ data, act, busy }: { data: Data; act: any; busy: boolean }) {
  const [form, setForm] = useState<any>(EMPTY_EVENT)
  const [show, setShow] = useState(false)
  const save = async () => {
    const j = await act({ action: 'event_save', event: form }, 'Išsaugota')
    if (j?.ok) { setForm(EMPTY_EVENT); setShow(false) }
  }
  return (
    <div>
      <button onClick={() => setShow(s => !s)} className={`${btn} mb-3 bg-[var(--accent-orange)] text-white`}>{show ? '× Uždaryti' : '+ Pridėti koncertą'}</button>
      {show && (
        <div className={`${card} mb-4 grid gap-2 p-3 sm:grid-cols-2`}>
          <input className={inp} placeholder="Atlikėjas *" value={form.artist_name} onChange={e => setForm({ ...form, artist_name: e.target.value })} />
          <select className={inp} value={form.dest_key} onChange={e => setForm({ ...form, dest_key: e.target.value })}>
            <option value="">Kryptis *</option>
            {data.destinations.map(d => <option key={d.key} value={d.key}>{d.city} ({d.reach_mode === 'car' ? 'mašina' : 'skrydis'})</option>)}
          </select>
          <input className={inp} placeholder="Vieta (arena)" value={form.venue_name} onChange={e => setForm({ ...form, venue_name: e.target.value })} />
          <input className={inp} type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
          <input className={inp} type="date" placeholder="Pabaiga (festivaliui)" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
          <input className={inp} placeholder="Nuotraukos URL" value={form.image_url} onChange={e => setForm({ ...form, image_url: e.target.value })} />
          <input className={inp} placeholder="Bilietų URL" value={form.ticket_url} onChange={e => setForm({ ...form, ticket_url: e.target.value })} />
          <input className={inp} type="number" placeholder="Populiarumas" value={form.popularity} onChange={e => setForm({ ...form, popularity: Number(e.target.value) })} />
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"><input type="checkbox" checked={form.is_festival} onChange={e => setForm({ ...form, is_festival: e.target.checked })} /> Festivalis</label>
          <button onClick={save} disabled={busy} className={`${btn} bg-[var(--accent-green)] text-white disabled:opacity-50`}>Išsaugoti</button>
        </div>
      )}
      <div className="grid gap-2">
        {data.events.map(ev => (
          <div key={ev.id} className={`${card} flex items-center gap-3 p-3 ${ev.is_published ? '' : 'opacity-60'}`}>
            {ev.image_url
              ? <img src={ev.image_url} alt="" className="h-11 w-11 flex-shrink-0 rounded-lg object-cover" />
              : <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--bg-hover)] text-xs">{ev.is_festival ? '🎪' : '🎤'}</div>}
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-[var(--text-primary)]">{ev.artist_name}</div>
              <div className="truncate text-xs text-[var(--text-muted)]">{ev.city || ev.dest_key} · {ev.venue_name || '—'} · {ev.start_date}{ev.source ? ` · ${ev.source}` : ''}</div>
            </div>
            <button disabled={busy} onClick={() => act({ action: 'event_toggle', id: ev.id, is_published: !ev.is_published })} className={`${btn} bg-[var(--bg-hover)] text-[var(--text-secondary)] disabled:opacity-50`}>{ev.is_published ? 'Slėpti' : 'Rodyti'}</button>
            <button disabled={busy} onClick={() => { if (confirm('Ištrinti koncertą?')) act({ action: 'event_delete', id: ev.id }) }} className={`${btn} bg-[var(--accent-red)] text-white disabled:opacity-50`}>Trinti</button>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Kryptys ────────────────────────────────────────────────────── */
const EMPTY_DEST = { key: '', city: '', country: '', country_code: '', reach_mode: 'flight', from_airport: 'VNO', carrier: '', price_from: '', drive_hours: '', drive_from: '', is_active: true, sort_order: 99 }

function Destinations({ data, act, busy }: { data: Data; act: any; busy: boolean }) {
  const [form, setForm] = useState<any>(EMPTY_DEST)
  const [show, setShow] = useState(false)
  const save = async () => {
    const j = await act({ action: 'dest_save', dest: form }, 'Kryptis išsaugota')
    if (j?.ok) { setForm(EMPTY_DEST); setShow(false) }
  }
  return (
    <div>
      <button onClick={() => setShow(s => !s)} className={`${btn} mb-3 bg-[var(--accent-orange)] text-white`}>{show ? '× Uždaryti' : '+ Pridėti kryptį'}</button>
      {show && (
        <div className={`${card} mb-4 grid gap-2 p-3 sm:grid-cols-3`}>
          <input className={inp} placeholder="key (pvz. berlin) *" value={form.key} onChange={e => setForm({ ...form, key: e.target.value })} />
          <input className={inp} placeholder="Miestas *" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
          <input className={inp} placeholder="Šalis" value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} />
          <input className={inp} placeholder="ISO kodas (DE)" value={form.country_code} onChange={e => setForm({ ...form, country_code: e.target.value })} />
          <select className={inp} value={form.reach_mode} onChange={e => setForm({ ...form, reach_mode: e.target.value })}>
            <option value="flight">Skrydis</option><option value="car">Mašina</option>
          </select>
          <input className={inp} placeholder="Oro uostas (VNO/KUN)" value={form.from_airport} onChange={e => setForm({ ...form, from_airport: e.target.value })} />
          <input className={inp} placeholder="Vežėjas (Ryanair)" value={form.carrier} onChange={e => setForm({ ...form, carrier: e.target.value })} />
          <input className={inp} type="number" placeholder="Kaina nuo €" value={form.price_from} onChange={e => setForm({ ...form, price_from: e.target.value })} />
          <input className={inp} type="number" step="0.5" placeholder="Val. mašina" value={form.drive_hours} onChange={e => setForm({ ...form, drive_hours: e.target.value })} />
          <input className={inp} placeholder="Iš (Vilnius/Kaunas)" value={form.drive_from} onChange={e => setForm({ ...form, drive_from: e.target.value })} />
          <button onClick={save} disabled={busy} className={`${btn} bg-[var(--accent-green)] text-white disabled:opacity-50`}>Išsaugoti</button>
        </div>
      )}
      <div className="grid gap-2">
        {data.destinations.map(d => (
          <div key={d.id} className={`${card} flex items-center gap-3 p-3 ${d.is_active ? '' : 'opacity-50'}`}>
            <span className="text-lg">{d.reach_mode === 'car' ? '🚗' : '✈'}</span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-[var(--text-primary)]">{d.city} <span className="text-xs font-normal text-[var(--text-muted)]">{d.country} · {d.key}</span></div>
              <div className="text-xs text-[var(--text-muted)]">{d.reach_mode === 'car' ? `${d.drive_hours} val. iš ${d.drive_from}` : `nuo €${d.price_from} · ${d.carrier} ${d.from_airport}`}</div>
            </div>
            <button disabled={busy} onClick={() => act({ action: 'dest_toggle', id: d.id, is_active: !d.is_active })} className={`${btn} bg-[var(--bg-hover)] text-[var(--text-secondary)] disabled:opacity-50`}>{d.is_active ? 'Išjungti' : 'Įjungti'}</button>
            <button disabled={busy} onClick={() => { if (confirm('Ištrinti kryptį?')) act({ action: 'dest_delete', id: d.id }) }} className={`${btn} bg-[var(--accent-red)] text-white disabled:opacity-50`}>Trinti</button>
          </div>
        ))}
      </div>
    </div>
  )
}
