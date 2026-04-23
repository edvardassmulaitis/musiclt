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
  const [artists, setArtists] = useState<ArtistRow[]>([])
  const [artistSearch, setArtistSearch] = useState('')
  const [artistResults, setArtistResults] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [wikiOpen, setWikiOpen] = useState(false)
  const [venueOptions, setVenueOptions] = useState<Array<{ id: number; legacy_id: number | null; name: string; city: string | null; address: string | null }>>([])
  const [showVenueDrop, setShowVenueDrop] = useState(false)
  const [venueId, setVenueId] = useState<number | null>(null)

  // Load venues on mount for suggestion dropdown
  useEffect(() => {
    fetch('/api/venues')
      .then(r => r.ok ? r.json() : { venues: [] })
      .then(d => setVenueOptions(d.venues || []))
      .catch(() => setVenueOptions([]))
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

  // Input styles matching ArtistForm
  const inputCls = 'w-full h-9 rounded-lg px-3 text-sm border border-[var(--input-border)] bg-[var(--bg-surface)] focus:outline-none focus:border-blue-300 text-[var(--text-primary)]'
  const labelCls = 'block text-xs font-bold text-[var(--text-muted)] uppercase tracking-wide mb-1'

  return (
    <div className="min-h-screen bg-[var(--bg-elevated)]">
      {/* Breadcrumb bar */}
      <div className="bg-[var(--bg-surface)]/95 backdrop-blur border-b border-[var(--input-border)]">
        <div className="flex items-center justify-between gap-2 px-4 py-2">
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/admin" className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]">Admin</Link>
            <span className="text-[var(--text-faint)]">/</span>
            <Link href="/admin/events" className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]">Renginiai</Link>
            <span className="text-[var(--text-faint)]">/</span>
            <span className="text-[var(--text-primary)] font-semibold">{isNew ? 'Naujas' : title || '...'}</span>
          </nav>
          <div className="flex items-center gap-1.5">
            <Link href="/admin/events"
              className="px-3 py-1.5 border border-[var(--input-border)] text-[var(--text-muted)] rounded-lg text-sm font-medium hover:bg-[var(--bg-hover)] transition-colors">
              Atšaukti
            </Link>
            <button onClick={handleSave} disabled={saving}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${
                saved ? 'bg-green-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'} disabled:opacity-50`}>
              {saving ? 'Saugoma...' : saved ? '✓ Išsaugota!' : isNew ? '✓ Sukurti' : '✓ Išsaugoti'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="max-w-2xl mx-auto px-4 pt-3">
          <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-center gap-2">
            ❌ {error}
            <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">✕</button>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Title */}
        <div>
          <label className={labelCls}>Pavadinimas *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} className={inputCls} placeholder="Koncerto pavadinimas" />
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
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
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Vieta</label>
            <div className="relative">
              <input
                value={venueName}
                onChange={e => { setVenueName(e.target.value); setShowVenueDrop(true) }}
                onFocus={() => setShowVenueDrop(true)}
                onBlur={() => setTimeout(() => setShowVenueDrop(false), 150)}
                className={inputCls}
                placeholder="Žalgirio Arena"
              />
              {showVenueDrop && filteredVenues.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                  {filteredVenues.map(v => (
                    <button
                      key={v.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        setVenueName(v.name)
                        setVenueId(v.id)
                        if (v.city) setCity(v.city)
                        if (v.address) setAddress(v.address)
                        setShowVenueDrop(false)
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs"
                    >
                      <div className="font-semibold text-gray-900">{v.name}</div>
                      {v.city && <div className="text-gray-500 text-[10px]">{v.city}{v.address ? ` · ${v.address}` : ''}</div>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div>
            <label className={labelCls}>Miestas</label>
            <input value={city} onChange={e => setCity(e.target.value)} className={inputCls} placeholder="Kaunas" />
          </div>
          <div>
            <label className={labelCls}>Adresas</label>
            <input value={address} onChange={e => setAddress(e.target.value)} className={inputCls} placeholder="Karaliaus Mindaugo pr. 50" />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className={labelCls}>Aprašymas</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4}
            className="w-full rounded-lg px-3 py-2 text-sm border border-gray-200 bg-white focus:outline-none focus:border-blue-300 text-gray-700 resize-y"
            placeholder="Renginio aprašymas..." />
        </div>

        {/* Cover */}
        <div>
          <label className={labelCls}>Cover nuotrauka</label>
          <div className="flex gap-2">
            <input
              value={coverUrl}
              onChange={e => setCoverUrl(e.target.value)}
              className={`${inputCls} flex-1`}
              placeholder="https://..."
            />
            <button
              type="button"
              onClick={() => setWikiOpen(true)}
              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold whitespace-nowrap"
              title="Ieškoti nuotraukos Wikipedijoje"
            >
              🔍 Wiki
            </button>
          </div>
          {coverUrl && (
            <img
              src={coverUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="mt-2 h-32 rounded-lg object-cover border border-gray-200"
              onError={e => (e.currentTarget.style.display = 'none')}
            />
          )}
          {wikiOpen && (
            <WikimediaSearch
              artistName={title || ''}
              onAddMultiple={(photos) => {
                if (photos.length > 0) {
                  setCoverUrl(photos[0].url)
                }
                setWikiOpen(false)
              }}
              onClose={() => setWikiOpen(false)}
            />
          )}
        </div>

        {/* Tickets */}
        <div className="grid grid-cols-3 gap-4">
          <div>
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

        {/* Featured */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isFeatured} onChange={e => setIsFeatured(e.target.checked)} className="accent-blue-600 w-4 h-4" />
          <span className="text-sm font-medium text-gray-700">Featured renginys</span>
        </label>

        {/* Artists */}
        <div>
          <label className={labelCls}>Atlikėjai</label>
          <div className="relative mb-2">
            <input value={artistSearch} onChange={e => setArtistSearch(e.target.value)}
              className={inputCls} placeholder="Ieškoti atlikėjo..." />
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
          {artists.length > 0 && (
            <div className="space-y-1">
              {artists.map(a => (
                <div key={a.artist_id} className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-surface)] rounded-lg border border-[var(--input-border)]">
                  <span className="text-sm text-[var(--text-primary)] flex-1">{a.name}</span>
                  <button onClick={() => setArtists(artists.map(x => x.artist_id === a.artist_id ? { ...x, is_headliner: !x.is_headliner } : x))}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition ${
                      a.is_headliner ? 'bg-orange-50 text-orange-500 border border-orange-200' : 'text-gray-400 border border-gray-200 hover:text-orange-400'}`}>
                    {a.is_headliner ? '★ Headliner' : 'Headliner?'}
                  </button>
                  <button onClick={() => setArtists(artists.filter(x => x.artist_id !== a.artist_id))}
                    className="text-gray-300 hover:text-red-500 text-xs transition">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
