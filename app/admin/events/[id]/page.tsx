'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import WikimediaSearch from '@/components/WikimediaSearch'

type ArtistRow = { artist_id: number; name: string; is_headliner: boolean }

export default function AdminEventEditPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const isNew = id === 'new'
  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [venueName, setVenueName] = useState('')
  const [city, setCity] = useState('')
  const [address, setAddress] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [ticketUrl, setTicketUrl] = useState('')
  const [priceFrom, setPriceFrom] = useState('')
  const [priceTo, setPriceTo] = useState('')
  const [isFeatured, setIsFeatured] = useState(false)
  const [isFestival, setIsFestival] = useState(false)
  // „Verta kelionės" (užsienio koncertas) — unified events su is_abroad žyma.
  const [isAbroad, setIsAbroad] = useState(false)
  const [destKey, setDestKey] = useState('')
  const [why, setWhy] = useState('')
  const [popularity, setPopularity] = useState('')
  const [destOptions, setDestOptions] = useState<Array<{ key: string; city: string; country: string | null; reach_mode: string }>>([])
  const [artists, setArtists] = useState<ArtistRow[]>([])
  const [hideHome, setHideHome] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [artistSearch, setArtistSearch] = useState('')
  const [artistResults, setArtistResults] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [wikiOpen, setWikiOpen] = useState(false)
  const [venueOptions, setVenueOptions] = useState<Array<{ id: number; legacy_id: number | null; name: string; city: string | null; address: string | null }>>([])
  const [showVenueDrop, setShowVenueDrop] = useState(false)
  const [venueId, setVenueId] = useState<number | null>(null)
  const [cityOptions, setCityOptions] = useState<Array<{ id: number; name: string }>>([])

  // Load venues + fiksuotas miestų sąrašas on mount
  useEffect(() => {
    fetch('/api/venues')
      .then(r => r.ok ? r.json() : { venues: [] })
      .then(d => setVenueOptions(d.venues || []))
      .catch(() => setVenueOptions([]))
    fetch('/api/cities')
      .then(r => r.ok ? r.json() : { cities: [] })
      .then(d => setCityOptions(d.cities || []))
      .catch(() => setCityOptions([]))
    // Kelionės kryptys (travel_destinations) — „Verta kelionės" dropdown'ui.
    fetch('/api/admin/verta-keliones')
      .then(r => r.ok ? r.json() : { destinations: [] })
      .then(d => setDestOptions(d.destinations || []))
      .catch(() => setDestOptions([]))
  }, [])

  const filteredVenues = (venueName.trim().length === 0
    ? venueOptions
    : venueOptions.filter(v =>
        v.name.toLowerCase().includes(venueName.toLowerCase()) ||
        (v.city || '').toLowerCase().includes(venueName.toLowerCase())
      )
  ).slice(0, 12)

  useEffect(() => { if (status === 'unauthenticated') router.push('/') }, [status])

  useEffect(() => {
    if (!isNew && isAdmin) {
      fetch(`/api/events/${id}`).then(r => r.json()).then(ev => {
        if (!ev.title) return
        setTitle(ev.title)
        setDescription(ev.description || '')
        setStartDate(ev.start_date?.slice(0, 16) || '')
        setEndDate(ev.end_date?.slice(0, 16) || '')
        setVenueName(ev.venue_name || '')
        setCity(ev.city || '')
        setAddress(ev.address || '')
        setVenueId(ev.venue_id ?? null)
        setCoverUrl(ev.cover_image_url || '')
        setTicketUrl(ev.ticket_url || '')
        setPriceFrom(ev.price_from?.toString() || '')
        setPriceTo(ev.price_to?.toString() || '')
        setIsFeatured(ev.is_featured || false)
        setIsFestival(ev.is_festival || false)
        setIsAbroad(ev.is_abroad || false)
        setDestKey(ev.dest_key || '')
        setWhy(ev.why || '')
        setPopularity(ev.popularity != null ? String(ev.popularity) : '')
        setHideHome(ev.hide_from_homepage || false)
        if (ev.event_artists) {
          setArtists(ev.event_artists.map((ea: any) => {
            const a = Array.isArray(ea.artists) ? ea.artists[0] : ea.artists
            return { artist_id: ea.artist_id, name: a?.name || `ID ${ea.artist_id}`, is_headliner: ea.is_headliner }
          }))
        }
      })
    }
  }, [id, isNew, isAdmin])

  useEffect(() => {
    if (artistSearch.length < 2) { setArtistResults([]); return }
    const t = setTimeout(() => {
      fetch(`/api/artists?search=${encodeURIComponent(artistSearch)}&limit=10`)
        .then(r => r.json())
        .then(data => setArtistResults(data.artists || []))
        .catch(() => setArtistResults([]))
    }, 300)
    return () => clearTimeout(t)
  }, [artistSearch])

  function addArtist(a: any) {
    if (artists.some(x => x.artist_id === a.id)) return
    setArtists([...artists, { artist_id: a.id, name: a.name, is_headliner: false }])
    setArtistSearch('')
    setArtistResults([])
  }

  async function handleSave() {
    if (!title.trim()) { setError('Įvesk pavadinimą'); return }
    if (!startDate) { setError('Pasirink datą'); return }
    // Vieta privaloma įprastiems renginiams (susieti su venues įrašu). Užsienio
    // koncertams („Verta kelionės") venues lentelės nėra — vieta laisvu tekstu.
    if (!isAbroad && !venueId && !venueName.trim() && !city.trim()) { setError('Nurodyk bent miestą arba vietą'); return }
    if (isAbroad && !destKey) { setError('Pasirink kelionės kryptį'); return }
    setSaving(true); setError('')

    const body: any = {
      title,
      description: description || null,
      start_date: new Date(startDate).toISOString(),
      end_date: endDate ? new Date(endDate).toISOString() : null,
      venue_name: venueName || null,
      venue_id: venueId,
      city: city || null,
      address: address || null,
      cover_image_url: coverUrl || null,
      ticket_url: ticketUrl || null,
      price_from: priceFrom ? parseFloat(priceFrom) : null,
      price_to: priceTo ? parseFloat(priceTo) : null,
      is_featured: isFeatured,
      is_festival: isFestival,
      is_abroad: isAbroad,
      dest_key: isAbroad ? (destKey || null) : null,
      why: isAbroad ? (why || null) : null,
      popularity: isAbroad && popularity ? parseInt(popularity) : null,
      hide_from_homepage: hideHome,
      artists: artists.map(a => ({ artist_id: a.artist_id, is_headliner: a.is_headliner })),
    }

    try {
      const res = isNew
        ? await fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : await fetch(`/api/events/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
        if (isNew) router.push('/admin/events')
      } else {
        const data = await res.json()
        setError(data.error || 'Klaida')
      }
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  if (status === 'loading' || !isAdmin) return null

  const inputCls = 'w-full h-10 rounded-lg px-3 text-sm border border-[var(--input-border)] bg-[var(--bg-surface)] focus:outline-none focus:border-blue-300 text-[var(--text-primary)]'
  const labelCls = 'block text-xs font-bold text-[var(--text-muted)] uppercase tracking-wide mb-1'
  const cardCls = 'rounded-xl border border-[var(--input-border)] bg-[var(--bg-surface)] p-4 sm:p-5 space-y-4'
  const cardTitle = 'text-sm font-bold text-[var(--text-primary)]'

  return (
    <div className="min-h-screen bg-[var(--bg-elevated)]">
      {/* Sticky viršutinė juosta (mobile draugiška — Išsaugoti visada pasiekiamas) */}
      <div className="sticky top-0 z-30 bg-[var(--bg-surface)]/95 backdrop-blur border-b border-[var(--input-border)]">
        <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 max-w-5xl mx-auto">
          <nav className="flex items-center gap-1 text-sm min-w-0">
            <Link href="/admin" className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] hidden sm:inline">Admin</Link>
            <span className="text-[var(--text-faint)] hidden sm:inline">/</span>
            <Link href="/admin/events" className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] flex-shrink-0">← Renginiai</Link>
            <span className="text-[var(--text-faint)] hidden sm:inline">/</span>
            <span className="text-[var(--text-primary)] font-semibold truncate hidden sm:inline">{isNew ? 'Naujas' : title || '...'}</span>
          </nav>
          <button onClick={handleSave} disabled={saving}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold transition-all flex-shrink-0 ${
              saved ? 'bg-green-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'} disabled:opacity-50`}>
            {saving ? 'Saugoma...' : saved ? '✓ Išsaugota!' : isNew ? '✓ Sukurti' : '✓ Išsaugoti'}
          </button>
        </div>
      </div>

      {error && (
        <div className="max-w-5xl mx-auto px-3 sm:px-4 pt-3">
          <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-center gap-2">
            ❌ {error}
            <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">✕</button>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-5 lg:py-6 lg:grid lg:grid-cols-3 lg:gap-6 lg:items-start">
        {/* ── KAIRĖ: pagrindiniai laukai ─────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">
          {/* Renginys */}
          <div className={cardCls}>
            <div className={cardTitle}>Renginio informacija</div>
            <div>
              <label className={labelCls}>Pavadinimas *</label>
              <input value={title} onChange={e => setTitle(e.target.value)} className={inputCls} placeholder="Koncerto pavadinimas" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Pradžia *</label>
                <input type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Pabaiga (jei festivalis)</label>
                <input type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} className={inputCls} />
              </div>
            </div>

            {/* Venue */}
            <div>
              <label className={labelCls}>
                Vieta {isAbroad ? '' : '*'}
                {venueId && (
                  <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-black uppercase rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    🔗 Susieta
                  </span>
                )}
              </label>
              <div className="relative">
                <div className="flex gap-2">
                  <input
                    value={venueName}
                    onChange={e => { setVenueName(e.target.value); setVenueId(null); setShowVenueDrop(true) }}
                    onFocus={() => setShowVenueDrop(true)}
                    onBlur={() => setTimeout(() => setShowVenueDrop(false), 200)}
                    className={`${inputCls} flex-1`}
                    placeholder={isAbroad ? 'Arena / vieta (laisvu tekstu)' : 'Žalgirio Arena'}
                  />
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); setShowVenueDrop(d => !d) }}
                    className="px-2.5 bg-[var(--bg-hover)] hover:bg-[var(--bg-elevated)] border border-[var(--input-border)] rounded-lg text-xs font-semibold text-[var(--text-secondary)]" title="Rodyti sąrašą">▾</button>
                  {venueId && (
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); setVenueId(null) }}
                      className="px-2.5 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg text-xs font-semibold text-red-600" title="Atsieti nuo venues lentelės">✕</button>
                  )}
                </div>
                {showVenueDrop && (
                  <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-lg shadow-lg max-h-72 overflow-y-auto">
                    {venueOptions.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-[var(--text-muted)]">Kraunu vietas…</div>
                    ) : filteredVenues.length === 0 ? (
                      <>
                        <div className="px-3 py-2 text-[12px] text-[var(--text-muted)] uppercase font-bold tracking-wide bg-[var(--bg-hover)] border-b border-[var(--border-subtle)]">
                          Nerasta pagal „{venueName}" — galima naudoti laisvu tekstu arba išrinkti iš sąrašo:
                        </div>
                        {venueOptions.slice(0, 20).map(v => (
                          <VenueRow key={v.id} v={v} onPick={() => {
                            setVenueName(v.name); setVenueId(v.id)
                            if (v.city) setCity(v.city); if (v.address) setAddress(v.address)
                            setShowVenueDrop(false)
                          }} />
                        ))}
                      </>
                    ) : (
                      filteredVenues.map(v => (
                        <VenueRow key={v.id} v={v} highlighted={v.id === venueId} onPick={() => {
                          setVenueName(v.name); setVenueId(v.id)
                          if (v.city) setCity(v.city); if (v.address) setAddress(v.address)
                          setShowVenueDrop(false)
                        }} />
                      ))
                    )}
                    <Link href="/admin/venues/new" className="block px-3 py-2 text-xs text-blue-600 hover:bg-blue-50 border-t border-[var(--border-subtle)] font-semibold">
                      + Sukurti naują vietą…
                    </Link>
                  </div>
                )}
              </div>
              {venueId && <div className="mt-1 text-[12px] text-emerald-700 font-semibold">FK → venues.id = {venueId}</div>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Miestas{venueId || isAbroad ? '' : ' *'}</label>
                <input list="evt-city-options" value={city} onChange={e => setCity(e.target.value)} disabled={!!venueId}
                  className={`${inputCls} ${venueId ? 'opacity-60 cursor-not-allowed' : ''}`}
                  placeholder="Įvesk arba pasirink (pvz. Molėtai)"
                  title={venueId ? 'Miestas imamas iš susietos vietos' : 'Įvesk arba pasirink miestą'} />
                <datalist id="evt-city-options">
                  {cityOptions.map(c => <option key={c.id} value={c.name} />)}
                </datalist>
              </div>
              <div>
                <label className={labelCls}>Adresas</label>
                <input value={address} onChange={e => setAddress(e.target.value)} className={inputCls} placeholder="Karaliaus Mindaugo pr. 50" />
              </div>
            </div>

            <div>
              <label className={labelCls}>Aprašymas</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4}
                className="w-full rounded-lg px-3 py-2 text-sm border border-[var(--input-border)] bg-[var(--bg-surface)] focus:outline-none focus:border-blue-300 text-[var(--text-primary)] resize-y"
                placeholder="Renginio aprašymas..." />
            </div>
          </div>

          {/* Verta kelionės — kelionės laukai (rodomi tik pažymėjus) */}
          {isAbroad && (
            <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-4 sm:p-5 space-y-4">
              <div className="text-sm font-bold text-orange-700">🌍 Kelionės informacija</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Kryptis *</label>
                  <select value={destKey} onChange={e => setDestKey(e.target.value)} className={inputCls}>
                    <option value="">— pasirink kryptį —</option>
                    {destOptions.map(d => (
                      <option key={d.key} value={d.key}>
                        {d.city}{d.country ? `, ${d.country}` : ''} ({d.reach_mode === 'car' ? '🚗 mašina' : '✈ skrydis'})
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[12px] text-[var(--text-muted)]">Kryptys valdomos /admin/verta-keliones</p>
                </div>
                <div>
                  <label className={labelCls}>Populiarumas (0–100)</label>
                  <input type="number" value={popularity} onChange={e => setPopularity(e.target.value)} className={inputCls} placeholder="80" />
                </div>
              </div>
              <div>
                <label className={labelCls}>Kodėl verta keliauti</label>
                <textarea value={why} onChange={e => setWhy(e.target.value)} rows={2}
                  className="w-full rounded-lg px-3 py-2 text-sm border border-orange-200 bg-[var(--bg-surface)] focus:outline-none focus:border-orange-300 text-[var(--text-primary)] resize-y"
                  placeholder="Pvz. vienintelis turo koncertas regione, pigus skrydis iš VNO..." />
              </div>
              <p className="text-[13px] text-orange-700/80">Vieta nebūtina — užsienio koncertams pildoma laisvu tekstu. Festivaliui pridėk grojančius atlikėjus žemiau.</p>
            </div>
          )}

          {/* Bilietai */}
          <div className={cardCls}>
            <div className={cardTitle}>Bilietai</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-1">
                <label className={labelCls}>Bilietų URL</label>
                <input value={ticketUrl} onChange={e => setTicketUrl(e.target.value)} className={inputCls} placeholder="https://bilietai.lt/..." />
              </div>
              <div>
                <label className={labelCls}>Kaina nuo (€)</label>
                <input type="number" value={priceFrom} onChange={e => setPriceFrom(e.target.value)} className={inputCls} placeholder="15" />
              </div>
              <div>
                <label className={labelCls}>Kaina iki (€)</label>
                <input type="number" value={priceTo} onChange={e => setPriceTo(e.target.value)} className={inputCls} placeholder="45" />
              </div>
            </div>
          </div>

          {/* Atlikėjai (lineup) */}
          <div className={cardCls}>
            <div className={cardTitle}>Atlikėjai {isFestival && <span className="font-normal text-[var(--text-muted)]">— festivalio lineup</span>}</div>
            <div className="relative">
              <input value={artistSearch} onChange={e => setArtistSearch(e.target.value)} className={inputCls} placeholder="Ieškoti atlikėjo..." />
              {artistResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 rounded-lg overflow-hidden z-10 max-h-48 overflow-y-auto bg-[var(--bg-surface)] border border-[var(--input-border)] shadow-lg">
                  {artistResults.map((a: any) => (
                    <button key={a.id} onClick={() => addArtist(a)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--bg-hover)] transition flex items-center gap-2 text-[var(--text-primary)]">
                      {a.cover_image_url && <img src={a.cover_image_url} alt="" className="w-6 h-6 rounded-full object-cover" />}
                      {a.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {artists.length > 0 ? (
              <div className="space-y-1.5">
                {artists.map((a, i) => (
                  <div
                    key={a.artist_id}
                    draggable
                    onDragStart={() => setDragIdx(i)}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => { setArtists(prev => { if (dragIdx === null || dragIdx === i) return prev; const arr = [...prev]; const [m] = arr.splice(dragIdx, 1); arr.splice(i, 0, m); return arr }); setDragIdx(null) }}
                    onDragEnd={() => setDragIdx(null)}
                    className={`flex items-center gap-2 px-3 py-2 bg-[var(--bg-elevated)] rounded-lg border transition ${dragIdx === i ? 'border-orange-300 opacity-60' : 'border-[var(--border-subtle)]'}`}
                  >
                    <span className="cursor-grab active:cursor-grabbing text-[var(--text-faint)] select-none flex-shrink-0" title="Tempk, kad pertvarkytum">⠿</span>
                    <span className="text-[12px] font-bold text-[var(--text-faint)] w-4 flex-shrink-0 text-center">{i + 1}</span>
                    <span className="text-sm text-[var(--text-primary)] flex-1 truncate">{a.name}</span>
                    <button onClick={() => setArtists(artists.map(x => x.artist_id === a.artist_id ? { ...x, is_headliner: !x.is_headliner } : x))}
                      className={`text-[12px] font-bold px-2 py-0.5 rounded-full transition flex-shrink-0 ${
                        a.is_headliner ? 'bg-orange-50 text-orange-500 border border-orange-200' : 'text-gray-400 border border-gray-200 hover:text-orange-400'}`}>
                      {a.is_headliner ? '★ Headliner' : 'Headliner?'}
                    </button>
                    <button onClick={() => setArtists(artists.filter(x => x.artist_id !== a.artist_id))}
                      className="text-gray-300 hover:text-red-500 text-xs transition flex-shrink-0 w-6 h-6 flex items-center justify-center">✕</button>
                  </div>
                ))}
                <p className="text-[13px] text-[var(--text-muted)] pt-1">Tempk ⠿ kad pertvarkytum eiliškumą — pirmi atlikėjai ir headlineriai naudojami homepage collage.</p>
              </div>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">Atlikėjų dar nėra. Ieškok ir pridėk — headlinerius pažymėk žvaigždute.</p>
            )}
          </div>
        </div>

        {/* ── DEŠINĖ: nustatymai + cover (sticky desktop) ─────────── */}
        <div className="mt-5 lg:mt-0 lg:col-span-1">
          <div className="space-y-5 lg:sticky lg:top-16">
            {/* Tipas / viešinimas */}
            <div className={cardCls}>
              <div className={cardTitle}>Tipas ir viešinimas</div>
              <label className="flex items-center gap-2.5 cursor-pointer py-1">
                <input type="checkbox" checked={isFeatured} onChange={e => setIsFeatured(e.target.checked)} className="accent-blue-600 w-4 h-4" />
                <span className="text-sm font-medium text-[var(--text-primary)]">⭐ Featured renginys</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer py-1">
                <input type="checkbox" checked={isFestival} onChange={e => setIsFestival(e.target.checked)} className="accent-cyan-600 w-4 h-4" />
                <span className="text-sm font-medium text-[var(--text-primary)]">🎪 Festivalis</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer py-1">
                <input type="checkbox" checked={isAbroad} onChange={e => setIsAbroad(e.target.checked)} className="accent-orange-600 w-4 h-4" />
                <span className="text-sm font-medium text-[var(--text-primary)]">🌍 Verta kelionės (užsienis)</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer py-1">
                <input type="checkbox" checked={hideHome} onChange={e => setHideHome(e.target.checked)} className="accent-red-600 w-4 h-4" />
                <span className="text-sm font-medium text-[var(--text-primary)]">🚫 Slėpti iš pagrindinio puslapio</span>
              </label>
            </div>

            {/* Cover */}
            <div className={cardCls}>
              <div className={cardTitle}>Cover nuotrauka</div>
              {coverUrl && (
                <img src={coverUrl} alt="" referrerPolicy="no-referrer"
                  className="w-full aspect-video rounded-lg object-cover border border-[var(--border-subtle)]"
                  onError={e => (e.currentTarget.style.display = 'none')} />
              )}
              <div className="flex gap-2">
                <input value={coverUrl} onChange={e => setCoverUrl(e.target.value)} className={`${inputCls} flex-1`} placeholder="https://..." />
                <button type="button" onClick={() => setWikiOpen(true)}
                  className="px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold whitespace-nowrap" title="Ieškoti nuotraukos Wikipedijoje">🔍 Wiki</button>
              </div>
              {wikiOpen && (
                <WikimediaSearch artistName={title || ''}
                  onAddMultiple={(photos) => { if (photos.length > 0) setCoverUrl(photos[0].url); setWikiOpen(false) }}
                  onClose={() => setWikiOpen(false)} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function VenueRow({ v, highlighted, onPick }: {
  v: { id: number; name: string; city: string | null; address: string | null }
  highlighted?: boolean
  onPick: () => void
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onPick() }}
      className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
        highlighted ? 'bg-emerald-50 hover:bg-emerald-100' : 'hover:bg-[var(--bg-hover)]'
      }`}
    >
      <div className="font-semibold text-[var(--text-primary)] flex items-center gap-1">
        {v.name}
        {highlighted && <span className="text-[11px] text-emerald-600 font-bold">✓ pasirinkta</span>}
      </div>
      {(v.city || v.address) && (
        <div className="text-[var(--text-muted)] text-[12px]">
          {v.city}{v.city && v.address ? ' · ' : ''}{v.address}
        </div>
      )}
    </button>
  )
}
