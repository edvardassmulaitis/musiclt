'use client'

// Atlikėjo kontaktų sekcija (vadyba / booking / label / press) admin puslapyje.
// Naudoja /api/admin/contacts (artist_id scope). List + add + delete.
// Tas pats endpoint'as maitina ir /admin/contacts vadybininkų bazę.

import { useEffect, useState, useCallback } from 'react'

export interface Contact {
  id: string; artist_id: number; name: string | null; type: string
  email: string | null; phone: string | null; url: string | null
  confidence: string; source: string | null; created_at: string
}

export const CONTACT_TYPES = [
  'management', 'booking', 'label', 'press', 'business', 'event_organizer',
  'potential_management', 'potential_label', 'potential_booking', 'general',
]
export const CONFIDENCE = ['high', 'medium', 'low']

export const TYPE_COLORS: Record<string, string> = {
  management: 'bg-blue-100 text-blue-700 border-blue-200',
  booking: 'bg-purple-100 text-purple-700 border-purple-200',
  label: 'bg-green-100 text-green-700 border-green-200',
  press: 'bg-pink-100 text-pink-700 border-pink-200',
  business: 'bg-gray-100 text-gray-700 border-gray-200',
  event_organizer: 'bg-amber-100 text-amber-700 border-amber-200',
}

export function TypePill({ type }: { type: string }) {
  const isPotential = type.startsWith('potential_')
  const cls = isPotential
    ? 'bg-orange-50 text-orange-700 border-orange-200'
    : (TYPE_COLORS[type] || 'bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[var(--input-border)]')
  return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[12.5px] font-semibold ${cls}`}>{type}</span>
}

export default function ArtistContactsPanel({ artistId }: { artistId: string }) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', type: 'management', email: '', phone: '', url: '', confidence: 'high' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/admin/contacts?artist_id=${artistId}`)
      const d = await r.json()
      setContacts(d.contacts || [])
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [artistId])

  useEffect(() => { load() }, [load])

  async function save() {
    if (!form.name.trim() && !form.email.trim() && !form.url.trim()) return
    setSaving(true)
    try {
      const r = await fetch('/api/admin/contacts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, artist_id: Number(artistId) }),
      })
      if (r.ok) {
        setForm({ name: '', type: 'management', email: '', phone: '', url: '', confidence: 'high' })
        setAdding(false)
        await load()
      }
    } finally { setSaving(false) }
  }

  async function remove(id: string) {
    if (!confirm('Ištrinti šį kontaktą?')) return
    const r = await fetch(`/api/admin/contacts?id=${id}`, { method: 'DELETE' })
    if (r.ok) setContacts(cs => cs.filter(c => c.id !== id))
  }

  const inputCls = 'rounded-lg border border-[var(--input-border)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] focus:border-blue-500 focus:outline-none'

  return (
    <div className="mt-4 rounded-xl border border-[var(--input-border)] bg-[var(--bg-surface)]">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-[var(--text-primary)]">📇 Kontaktai</span>
          <span className="text-xs text-[var(--text-muted)]">({contacts.length})</span>
        </div>
        <button onClick={() => setAdding(a => !a)} className="text-xs font-semibold text-music-blue hover:underline">
          {adding ? 'Atšaukti' : '+ Pridėti'}
        </button>
      </div>

      <div className="p-4">
        {adding && (
          <div className="mb-4 grid grid-cols-1 gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 sm:grid-cols-2">
            <input className={inputCls} placeholder="Pavadinimas (pvz Lucky Luke)" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <select className={inputCls} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              {CONTACT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input className={inputCls} placeholder="El. paštas" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            <input className={inputCls} placeholder="Telefonas" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            <input className={inputCls} placeholder="URL" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
            <select className={inputCls} value={form.confidence} onChange={e => setForm(f => ({ ...f, confidence: e.target.value }))}>
              {CONFIDENCE.map(c => <option key={c} value={c}>patikimumas: {c}</option>)}
            </select>
            <div className="sm:col-span-2">
              <button onClick={save} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saugoma…' : 'Išsaugoti kontaktą'}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-xs text-[var(--text-muted)]">Kraunama…</p>
        ) : contacts.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">Kontaktų dar nėra. Importuok per JSON arba pridėk rankiniu būdu.</p>
        ) : (
          <div className="space-y-2">
            {contacts.map(c => (
              <div key={c.id} className="flex items-start gap-2 rounded-lg border border-[var(--border-subtle)] px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[var(--text-primary)]">{c.name || '(be pavadinimo)'}</span>
                    <TypePill type={c.type} />
                    <span className="text-[13px] text-[var(--text-faint)]">{c.confidence}</span>
                    {c.source === 'json_import' && <span className="text-[13px] text-[var(--text-faint)]">· import</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-[var(--text-muted)]">
                    {c.email && <a href={`mailto:${c.email}`} className="text-music-blue hover:underline">✉ {c.email}</a>}
                    {c.phone && <a href={`tel:${c.phone}`} className="hover:underline">☎ {c.phone}</a>}
                    {c.url && <a href={c.url} target="_blank" rel="noopener noreferrer" className="truncate text-music-blue hover:underline">🔗 {c.url}</a>}
                  </div>
                </div>
                <button onClick={() => remove(c.id)} title="Ištrinti" className="shrink-0 rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
