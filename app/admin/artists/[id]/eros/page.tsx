// app/admin/artists/[id]/eros/page.tsx
//
// Admin UI for managing an artist's career eras (artist_eras table).
//
// Eras valdo, kaip albumai sugrupuojami /atlikejai/[slug] puslapyje:
//   • ≥2 rows → albumai grupuojami pagal year_start..year_end ranges su
//     pasirinktais title + description
//   • 0–1 rows → auto-decade fallback'as (mažoms diskografijoms — flat)
//
// Save'as bulk-replace'ina visus atlikėjo era rows (POST visą sąrašą).
// Drag-reorder dar nepridėtas — order'is keičiasi per up/down mygtukus,
// sort_order automatiškai persiskaičiuoja.

'use client'

import { useState, useEffect, use } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type Era = {
  id?: number
  sort_order: number
  title: string
  subtitle: string | null
  year_start: number
  year_end: number | null
  description: string | null
  source?: string | null
}

const blankEra = (sort_order: number): Era => ({
  sort_order,
  title: '',
  subtitle: '',
  year_start: new Date().getFullYear(),
  year_end: null,
  description: '',
  source: 'manual',
})

export default function ErosAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { data: session } = useSession()
  const isAdmin = session?.user && ['admin','super_admin'].includes(session.user.role || '')

  const [artistName, setArtistName] = useState('')
  const [albums, setAlbums] = useState<{ id: number; title: string; year: number | null }[]>([])
  const [eras, setEras] = useState<Era[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isAdmin) return
    Promise.all([
      fetch(`/api/admin/artists/${id}/eras`).then(r => r.json()),
      fetch(`/api/admin/artists/${id}/albums-list`).then(r => r.ok ? r.json() : { rows: [] }).catch(() => ({ rows: [] })),
      fetch(`/api/artists/${id}`).then(r => r.json()).catch(() => ({})),
    ]).then(([eRes, aRes, arRes]) => {
      setEras(eRes.rows || [])
      setAlbums((aRes.rows || []).filter((a: any) => a.year))
      setArtistName(arRes.name || '')
      setLoading(false)
    })
  }, [id, isAdmin])

  const update = (i: number, patch: Partial<Era>) => {
    setEras(prev => prev.map((e, idx) => idx === i ? { ...e, ...patch } : e))
    setSaved(false)
  }
  const addEra = () => setEras(prev => [...prev, blankEra(prev.length)])
  const removeEra = (i: number) => {
    setEras(prev => prev.filter((_, idx) => idx !== i).map((e, idx) => ({ ...e, sort_order: idx })))
    setSaved(false)
  }
  const move = (i: number, delta: number) => {
    setEras(prev => {
      const j = i + delta
      if (j < 0 || j >= prev.length) return prev
      const next = prev.slice()
      ;[next[i], next[j]] = [next[j], next[i]]
      return next.map((e, idx) => ({ ...e, sort_order: idx }))
    })
    setSaved(false)
  }

  // Auto-generate eras from album years (single decade per group).
  const autoFromDecades = () => {
    const byDecade = new Map<number, { id: number; title: string; year: number | null }[]>()
    for (const a of albums) {
      if (!a.year) continue
      const d = Math.floor(a.year / 10) * 10
      const arr = byDecade.get(d) || []
      arr.push(a)
      byDecade.set(d, arr)
    }
    const decades = [...byDecade.entries()].sort((a, b) => b[0] - a[0])
    const curYear = new Date().getFullYear()
    const generated: Era[] = decades.map(([d], idx) => ({
      sort_order: idx,
      title: curYear >= d && curYear <= d + 9 ? `${d}–dabar` : `${d}-ieji`,
      subtitle: null,
      year_start: d,
      year_end: d + 9,
      description: null,
      source: 'auto_decade',
    }))
    setEras(generated)
    setSaved(false)
  }

  const save = async () => {
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/admin/artists/${id}/eras`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: eras }),
      })
      if (!res.ok) {
        const r = await res.json().catch(() => ({}))
        throw new Error(r.error || `HTTP ${res.status}`)
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (!isAdmin) {
    return <div className="p-8 text-[var(--text-muted)]">Reikia admin teisių.</div>
  }
  if (loading) {
    return <div className="p-8 text-[var(--text-muted)]">Kraunama…</div>
  }

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Link href={`/admin/artists/${id}`} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          ← Atlikėjas
        </Link>
        <h1 className="text-2xl font-black text-[var(--text-primary)]">
          Eros — {artistName}
        </h1>
        <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] font-bold text-[var(--text-muted)]">
          {eras.length} eras
        </span>
      </div>

      <div className="mb-4 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 text-[13px] text-[var(--text-secondary)]">
        <p>
          Atlikėjo karjeros laikotarpiai — keičia, kaip albumai grupuojami
          public puslapyje (<code>/atlikejai/{artistName.toLowerCase().replace(/\s/g, '-')}</code>).
        </p>
        <p className="mt-1.5 text-[12px] text-[var(--text-muted)]">
          • Bent <strong>2 eros</strong> reikia, kad grupavimas suveiktų. 1 era → tas pats kaip nieko (flat).<br />
          • <code>year_end = NULL</code> → „dabar" (ongoing era).<br />
          • <code>sort_order=0</code> → viršuje (naujausia).<br />
          • Albumai be year arba už visų eras ribų kraunasi į „Kiti įrašai" group'ą.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={addEra}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-blue-700"
        >
          + Pridėti erą
        </button>
        <button
          onClick={autoFromDecades}
          disabled={albums.length === 0}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1.5 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-50"
          title="Atstatyk iš dekadų — perrašo visus eras dabartinius"
        >
          ↺ Auto iš dekadų ({albums.length} albumų)
        </button>
        <div className="ml-auto flex items-center gap-2">
          {error && <span className="text-[12px] text-red-500">{error}</span>}
          <button
            onClick={save}
            disabled={saving}
            className={`rounded-lg px-4 py-1.5 text-sm font-bold text-white transition-all ${saved ? 'bg-green-500' : 'bg-blue-600 hover:bg-blue-700'} disabled:opacity-50`}
          >
            {saving ? 'Saugoma…' : saved ? '✓ Išsaugota' : 'Išsaugoti'}
          </button>
        </div>
      </div>

      {eras.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border-default)] p-8 text-center text-[var(--text-muted)]">
          Nėra eras. Pridėk per „+ Pridėti erą" arba paspausk „↺ Auto iš dekadų".
        </div>
      ) : (
        <div className="space-y-3">
          {eras.map((e, i) => (
            <div
              key={i}
              className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-4"
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-muted)]">
                  #{i + 1}
                </span>
                <div className="ml-auto flex gap-1">
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="rounded px-2 py-1 text-[12px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] disabled:opacity-30"
                    aria-label="Į viršų"
                  >↑</button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === eras.length - 1}
                    className="rounded px-2 py-1 text-[12px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] disabled:opacity-30"
                    aria-label="Į apačią"
                  >↓</button>
                  <button
                    onClick={() => removeEra(i)}
                    className="rounded px-2 py-1 text-[12px] text-red-500 hover:bg-red-50"
                    aria-label="Trinti"
                  >✕</button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                <label className="sm:col-span-6">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Pavadinimas</span>
                  <input
                    type="text"
                    value={e.title}
                    onChange={ev => update(i, { title: ev.target.value })}
                    placeholder="Stadium pop"
                    className="mt-1 w-full rounded border border-[var(--input-border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="sm:col-span-6">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Paantraštė (opt)</span>
                  <input
                    type="text"
                    value={e.subtitle || ''}
                    onChange={ev => update(i, { subtitle: ev.target.value || null })}
                    placeholder="— pasaulinė scena"
                    className="mt-1 w-full rounded border border-[var(--input-border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="sm:col-span-3">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Metai nuo</span>
                  <input
                    type="number"
                    value={e.year_start}
                    onChange={ev => update(i, { year_start: parseInt(ev.target.value) || 0 })}
                    className="mt-1 w-full rounded border border-[var(--input-border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-sm tabular-nums"
                  />
                </label>
                <label className="sm:col-span-3">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Metai iki (tuščia = „dabar")</span>
                  <input
                    type="number"
                    value={e.year_end ?? ''}
                    onChange={ev => update(i, { year_end: ev.target.value ? parseInt(ev.target.value) : null })}
                    placeholder="dabar"
                    className="mt-1 w-full rounded border border-[var(--input-border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-sm tabular-nums"
                  />
                </label>
                <label className="sm:col-span-6">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Šaltinis</span>
                  <input
                    type="text"
                    value={e.source || 'manual'}
                    onChange={ev => update(i, { source: ev.target.value || 'manual' })}
                    className="mt-1 w-full rounded border border-[var(--input-border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-sm text-[var(--text-muted)]"
                  />
                </label>
                <label className="sm:col-span-12">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Aprašymas (1-2 sakiniai)</span>
                  <textarea
                    value={e.description || ''}
                    onChange={ev => update(i, { description: ev.target.value || null })}
                    rows={2}
                    placeholder='„Parachutes" ir „A Rush of Blood to the Head" — du albumai…'
                    className="mt-1 w-full rounded border border-[var(--input-border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-sm"
                  />
                </label>
              </div>
              {/* Albums in this era preview */}
              {(() => {
                const inEra = albums.filter(a => a.year && a.year >= e.year_start && (e.year_end === null || a.year <= e.year_end))
                if (inEra.length === 0) return (
                  <div className="mt-2 text-[11px] italic text-[var(--text-faint)]">Šioj erai albumų nėra (year_start={e.year_start} / year_end={e.year_end ?? '∞'})</div>
                )
                return (
                  <div className="mt-2 text-[11px] text-[var(--text-muted)]">
                    <strong>{inEra.length} albumai:</strong> {inEra.slice(0, 6).map(a => `${a.title} (${a.year})`).join(', ')}{inEra.length > 6 ? ` … +${inEra.length - 6}` : ''}
                  </div>
                )
              })()}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
