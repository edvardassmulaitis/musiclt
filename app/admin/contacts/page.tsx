'use client'

export const dynamic = 'force-dynamic'

// Vadybininkų bazė — VISŲ atlikėjų kontaktai vienoje vietoje.
// Filtrai pagal tipą + paieška (name/email/url). Maitina /api/admin/contacts.

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { TypePill } from '@/components/ArtistContactsPanel'

const FILTER_TABS = [
  { key: '', label: 'Visi' },
  { key: 'management', label: 'Vadyba' },
  { key: 'booking', label: 'Booking' },
  { key: 'label', label: 'Label' },
  { key: 'press', label: 'Press' },
  { key: 'event_organizer', label: 'Organizatoriai' },
  { key: 'potential_management', label: 'Pot. vadyba' },
  { key: 'potential_label', label: 'Pot. label' },
]

export default function ContactsDbPage() {
  const [contacts, setContacts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [type, setType] = useState('')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350)
    return () => clearTimeout(t)
  }, [search])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (type) qs.set('type', type)
      if (debounced) qs.set('search', debounced)
      const r = await fetch(`/api/admin/contacts?${qs.toString()}`)
      const d = await r.json()
      setContacts(d.contacts || [])
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [type, debounced])

  useEffect(() => { load() }, [load])

  async function remove(id: string) {
    if (!confirm('Ištrinti šį kontaktą?')) return
    const r = await fetch(`/api/admin/contacts?id=${id}`, { method: 'DELETE' })
    if (r.ok) setContacts((cs: any) => cs.filter((c: any) => c.id !== id))
  }

  const withEmail = (contacts as any[]).filter(c => c.email).length

  return (
    <div className="min-h-screen bg-[var(--bg-elevated)]">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          <Link href="/admin" className="hover:text-[var(--text-secondary)]">Admin</Link>
          <span className="text-[var(--text-faint)]">/</span>
          <span className="font-semibold text-[var(--text-secondary)]">Vadybininkų bazė</span>
        </nav>
        <h1 className="font-['Outfit',sans-serif] text-2xl font-extrabold text-[var(--text-primary)]">Vadybininkų bazė</h1>
        <p className="mt-1 text-[12.5px] text-[var(--text-muted)]">
          Visi atlikėjų kontaktai — vadyba, booking, label, press. {(contacts as any[]).length} įrašai, {withEmail} su el. paštu.
        </p>

        {/* Filtrai */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {FILTER_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setType(t.key)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${type === t.key ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-[var(--input-border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-3">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Paieška — pavadinimas, el. paštas, URL…"
            className="w-full rounded-lg border border-[var(--input-border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-blue-500 focus:outline-none"
          />
        </div>

        {/* Sąrašas */}
        <div className="mt-4">
          {loading ? (
            <p className="text-sm text-[var(--text-muted)]">Kraunama…</p>
          ) : (contacts as any[]).length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Kontaktų nerasta.</p>
          ) : (
            <div className="space-y-2">
              {(contacts as any[]).map(c => (
                <div key={c.id} className="flex items-start gap-3 rounded-xl border border-[var(--input-border)] bg-[var(--bg-surface)] px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[var(--text-primary)]">{c.name || '(be pavadinimo)'}</span>
                      <TypePill type={c.type} />
                      <span className="text-[11px] text-[var(--text-faint)]">{c.confidence}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-[var(--text-muted)]">
                      {c.email && <a href={`mailto:${c.email}`} className="text-music-blue hover:underline">✉ {c.email}</a>}
                      {c.phone && <a href={`tel:${c.phone}`} className="hover:underline">☎ {c.phone}</a>}
                      {c.url && <a href={c.url} target="_blank" rel="noopener noreferrer" className="max-w-[280px] truncate text-music-blue hover:underline">🔗 {c.url}</a>}
                    </div>
                    {c.artist_id && (
                      <div className="mt-1 text-xs">
                        <Link href={`/admin/artists/${c.artist_id}`} className="text-[var(--text-secondary)] hover:text-music-blue hover:underline">
                          🎤 {c.artist_name || `atlikėjas #${c.artist_id}`}
                        </Link>
                      </div>
                    )}
                  </div>
                  <button onClick={() => remove(c.id)} title="Ištrinti" className="shrink-0 rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
