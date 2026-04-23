'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

export default function AdminVenueEditPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const rawId = params?.id
  const id = Array.isArray(rawId) ? rawId[0] : rawId
  const isNew = id === 'new'
  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('Lithuania')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [description, setDescription] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (status === 'unauthenticated') router.push('/') }, [status, router])

  useEffect(() => {
    if (!isNew && id && isAdmin) {
      fetch(`/api/venues/${id}`).then(r => r.json()).then(v => {
        if (!v?.name) return
        setName(v.name || '')
        setCity(v.city || '')
        setCountry(v.country || 'Lithuania')
        setAddress(v.address || '')
        setPhone(v.phone || '')
        setDescription(v.description || '')
        setCoverUrl(v.cover_image_url || '')
      })
    }
  }, [id, isNew, isAdmin])

  async function save() {
    if (!name.trim()) { setError('Pavadinimas privalomas.'); return }
    setSaving(true); setError('')
    const payload = {
      name: name.trim(),
      city: city.trim() || null,
      country: country.trim() || null,
      address: address.trim() || null,
      phone: phone.trim() || null,
      description: description.trim() || null,
      cover_image_url: coverUrl.trim() || null,
    }
    const r = isNew
      ? await fetch('/api/venues', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      : await fetch(`/api/venues/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const data = await r.json().catch(() => ({}))
    setSaving(false)
    if (!r.ok) { setError(data.error || 'Klaida išsaugant.'); return }
    setSaved(true)
    if (isNew && data?.id) router.push(`/admin/venues/${data.id}`)
  }

  if (status === 'loading' || !isAdmin) return null

  const labelCls = 'block text-xs font-bold text-[var(--text-secondary)] mb-1 uppercase tracking-wide'
  const inputCls = 'w-full px-3 py-1.5 bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-lg text-sm text-[var(--text-primary)]'

  return (
    <div className="min-h-screen bg-[var(--bg-elevated)]">
      <div className="bg-[var(--bg-surface)]/95 backdrop-blur border-b border-[var(--input-border)]">
        <div className="flex items-center justify-between gap-2 px-4 py-2">
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/admin" className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]">Admin</Link>
            <span className="text-[var(--text-faint)]">/</span>
            <Link href="/admin/venues" className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]">Vietos</Link>
            <span className="text-[var(--text-faint)]">/</span>
            <span className="text-[var(--text-primary)] font-semibold">{isNew ? 'Nauja vieta' : name || '…'}</span>
          </nav>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-bold transition-colors"
          >
            {saving ? 'Saugau…' : isNew ? 'Sukurti' : 'Išsaugoti'}
          </button>
        </div>
      </div>

      <div className="px-4 py-6 max-w-2xl mx-auto space-y-4">
        <div>
          <label className={labelCls}>Pavadinimas *</label>
          <input value={name} onChange={e => setName(e.target.value)} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Miestas</label>
            <input value={city} onChange={e => setCity(e.target.value)} className={inputCls} placeholder="Vilnius" />
          </div>
          <div>
            <label className={labelCls}>Šalis</label>
            <input value={country} onChange={e => setCountry(e.target.value)} className={inputCls} placeholder="Lithuania" />
          </div>
        </div>
        <div>
          <label className={labelCls}>Adresas</label>
          <input value={address} onChange={e => setAddress(e.target.value)} className={inputCls} placeholder="Ozo g. 14" />
        </div>
        <div>
          <label className={labelCls}>Telefonas</label>
          <input value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} placeholder="(5) 247 7576" />
        </div>
        <div>
          <label className={labelCls}>Aprašymas</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Cover nuotraukos URL</label>
          <input value={coverUrl} onChange={e => setCoverUrl(e.target.value)} className={inputCls} placeholder="https://..." />
          {coverUrl && (
            <img src={coverUrl} alt="" referrerPolicy="no-referrer" className="mt-2 h-32 rounded-lg object-cover border border-gray-200" onError={e => (e.currentTarget.style.display = 'none')} />
          )}
        </div>

        {error && <div className="text-red-500 text-xs font-semibold">{error}</div>}
        {saved && <div className="text-emerald-500 text-xs font-semibold">Išsaugota ✓</div>}
      </div>
    </div>
  )
}
