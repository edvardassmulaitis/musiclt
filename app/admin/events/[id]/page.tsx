'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

type ArtistRow = { artist_id: number; name: string; is_headliner: boolean }

export default function AdminEventEditPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const isNew = id === 'new'

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
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isNew) {
      fetch(`/api/events/${id}`).then(r => r.json()).then(ev => {
        if (ev.title) {
          setTitle(ev.title)
          setDescription(ev.description || '')
          setStartDate(ev.start_date?.slice(0, 16) || '')
          setEndDate(ev.end_date?.slice(0, 16) || '')
          setVenueName(ev.venue_name || '')
          setCity(ev.city || '')
          setAddress(ev.address || '')
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
        }
      })
    }
  }, [id, isNew])

  useEffect(() => {
    if (artistSearch.length < 2) { setArtistResults([]); return }
    const t = setTimeout(() => {
      fetch(`/api/admin/artists/search?q=${encodeURIComponent(artistSearch)}`)
        .then(r => r.json())
        .then(data => setArtistResults(Array.isArray(data) ? data : []))
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

  function removeArtist(aid: number) {
    setArtists(artists.filter(a => a.artist_id !== aid))
  }

  function toggleHeadliner(aid: number) {
    setArtists(artists.map(a => a.artist_id === aid ? { ...a, is_headliner: !a.is_headliner } : a))
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
      let res
      if (isNew) {
        res = await fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      } else {
        res = await fetch(`/api/events/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      }
      if (res.ok) {
        router.push('/admin/events')
      } else {
        const data = await res.json()
        setError(data.error || 'Klaida')
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const F = 'w-full h-10 rounded-lg px-3 text-sm focus:outline-none'
  const FS = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#c8d8f0' }
  const LBL = 'block text-[10px] font-black uppercase tracking-[0.12em] mb-1.5'
  const LCOL = { color: '#3d5878' }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <Link href="/admin/events" className="text-xs hover:text-white transition" style={{ color: '#5e7290' }}>← Renginiai</Link>
        <h1 className="text-xl font-black" style={{ color: '#f2f4f8' }}>{isNew ? 'Naujas renginys' : 'Redaguoti renginį'}</h1>
      </div>

      {error && <div className="text-xs text-red-400 mb-4 p-2 bg-red-900/20 rounded">{error}</div>}

      <div className="space-y-5">
        <div>
          <label className={LBL} style={LCOL}>Pavadinimas *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} className={F} style={FS} placeholder="Koncerto pavadinimas" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LBL} style={LCOL}>Pradžia *</label>
            <input type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)} className={F} style={FS} />
          </div>
          <div>
            <label className={LBL} style={LCOL}>Pabaiga (jei festivalis)</label>
            <input type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} className={F} style={FS} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={LBL} style={LCOL}>Vieta</label>
            <input value={venueName} onChange={e => setVenueName(e.target.value)} className={F} style={FS} placeholder="Žalgirio Arena" />
          </div>
          <div>
            <label className={LBL} style={LCOL}>Miestas</label>
            <input value={city} onChange={e => setCity(e.target.value)} className={F} style={FS} placeholder="Kaunas" />
          </div>
          <div>
            <label className={LBL} style={LCOL}>Adresas</label>
            <input value={address} onChange={e => setAddress(e.target.value)} className={F} style={FS} placeholder="Karaliaus Mindaugo pr. 50" />
          </div>
        </div>

        <div>
          <label className={LBL} style={LCOL}>Aprašymas</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4}
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none resize-y" style={FS} placeholder="Renginio aprašymas..." />
        </div>

        <div>
          <label className={LBL} style={LCOL}>Cover nuotraukos URL</label>
          <input value={coverUrl} onChange={e => setCoverUrl(e.target.value)} className={F} style={FS} placeholder="https://..." />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={LBL} style={LCOL}>Bilietų URL</label>
            <input value={ticketUrl} onChange={e => setTicketUrl(e.target.value)} className={F} style={FS} placeholder="https://bilietai.lt/..." />
          </div>
          <div>
            <label className={LBL} style={LCOL}>Kaina nuo (€)</label>
            <input type="number" value={priceFrom} onChange={e => setPriceFrom(e.target.value)} className={F} style={FS} placeholder="15" />
          </div>
          <div>
            <label className={LBL} style={LCOL}>Kaina iki (€)</label>
            <input type="number" value={priceTo} onChange={e => setPriceTo(e.target.value)} className={F} style={FS} placeholder="45" />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isFeatured} onChange={e => setIsFeatured(e.target.checked)} className="accent-orange-500" />
            <span className="text-xs font-bold" style={{ color: '#c8d8f0' }}>Featured renginys</span>
          </label>
        </div>

        {/* Artists */}
        <div>
          <label className={LBL} style={LCOL}>Atlikėjai</label>
          <div className="relative mb-2">
            <input value={artistSearch} onChange={e => setArtistSearch(e.target.value)} className={F} style={FS} placeholder="Ieškoti atlikėjo..." />
            {artistResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 rounded-lg overflow-hidden z-10 max-h-48 overflow-y-auto"
                style={{ background: '#0d1320', border: '1px solid rgba(255,255,255,0.1)' }}>
                {artistResults.map((a: any) => (
                  <button key={a.id} onClick={() => addArtist(a)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-white/[.04] transition flex items-center gap-2" style={{ color: '#c8d8f0' }}>
                    {a.photo_url && <img src={a.photo_url} alt="" className="w-6 h-6 rounded-full object-cover" />}
                    {a.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-1">
            {artists.map(a => (
              <div key={a.artist_id} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span className="text-sm flex-1" style={{ color: '#c8d8f0' }}>{a.name}</span>
                <button onClick={() => toggleHeadliner(a.artist_id)}
                  className={`text-[10px] font-black px-2 py-0.5 rounded-full transition ${a.is_headliner ? 'bg-orange-500/20 text-orange-400 border border-orange-500/20' : 'text-[#334058] border border-white/[.06]'}`}>
                  {a.is_headliner ? '★ Headliner' : 'Headliner?'}
                </button>
                <button onClick={() => removeArtist(a.artist_id)} className="text-red-400/50 hover:text-red-400 text-xs">×</button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <button onClick={handleSave} disabled={saving}
            className="px-6 py-2.5 rounded-full text-sm font-bold bg-orange-500 hover:bg-orange-400 text-white transition disabled:opacity-40">
            {saving ? 'Saugoma...' : (isNew ? 'Sukurti renginį' : 'Išsaugoti')}
          </button>
          <Link href="/admin/events" className="px-4 py-2.5 rounded-full text-sm font-bold transition" style={{ color: '#5e7290' }}>Atšaukti</Link>
        </div>
      </div>
    </div>
  )
}
