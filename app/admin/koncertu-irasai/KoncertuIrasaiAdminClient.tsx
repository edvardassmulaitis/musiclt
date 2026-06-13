'use client'

import { useState } from 'react'
import ArtistSearchInput from '@/components/ui/ArtistSearchInput'
import {
  RECORDING_TYPE_ORDER, recordingTypeLabel, formatDuration, type RecordingType,
} from '@/lib/concert-recordings-shared'

export type AdminRecording = {
  id: number
  slug: string
  youtube_id: string
  title: string
  artist_id: number | null
  artist_name_cached: string | null
  duration_seconds: number | null
  recording_type: RecordingType
  venue: string | null
  city: string | null
  recorded_on: string | null
  recorded_year: number | null
  uploaded_at: string | null
  view_count: number | null
  styles: string[]
  is_published: boolean
  is_featured: boolean
  thumbnail_url: string | null
  created_at: string
}

type Draft = {
  youtube_id: string
  youtube_url: string
  title: string
  channel: string | null
  artist_id: number | null
  artist_name: string | null
  artist_guess: string | null
  duration_seconds: number | null
  recording_type: RecordingType
  venue: string
  city: string
  country: string
  recorded_on: string
  recorded_year: string
  uploaded_at: string | null
  view_count: number | null
  thumbnail_url: string | null
  description: string | null
  is_featured: boolean
  is_published: boolean
}

const inputCls =
  'w-full rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--input-text)] placeholder:text-[var(--input-placeholder)] focus:border-blue-400 focus:outline-none'
const labelCls = 'mb-1 block text-[12px] font-semibold text-[var(--text-muted)]'

export default function KoncertuIrasaiAdminClient({ initialRecordings }: { initialRecordings: AdminRecording[] }) {
  const [url, setUrl] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseErr, setParseErr] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [items, setItems] = useState<AdminRecording[]>(initialRecordings)

  async function handleParse() {
    const u = url.trim()
    if (!u) return
    setParsing(true); setParseErr(null); setSaveMsg(null)
    try {
      const res = await fetch('/api/admin/concert-recordings/parse', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: u }),
      })
      const json = await res.json()
      if (!json.ok) { setParseErr(json.error || 'Nepavyko atpažinti'); setParsing(false); return }
      const p = json.parsed
      setDraft({
        youtube_id: p.youtube_id,
        youtube_url: p.youtube_url,
        title: p.title || '',
        channel: p.channel,
        artist_id: null,
        artist_name: null,
        artist_guess: p.artist_guess,
        duration_seconds: p.duration_seconds,
        recording_type: p.suggested_type,
        venue: p.venue || '',
        city: p.city || '',
        country: p.country || '',
        recorded_on: p.recorded_on || '',
        recorded_year: p.recorded_year ? String(p.recorded_year) : '',
        uploaded_at: p.uploaded_at,
        view_count: p.view_count,
        thumbnail_url: p.thumbnail_url,
        description: p.description,
        is_featured: false,
        is_published: true,
      })
    } catch (e: any) {
      setParseErr(e?.message || 'Klaida')
    }
    setParsing(false)
  }

  function upd<K extends keyof Draft>(k: K, v: Draft[K]) {
    setDraft((d) => (d ? { ...d, [k]: v } : d))
  }

  async function handleSave() {
    if (!draft) return
    if (!draft.artist_id) { setSaveMsg('⚠️ Pasirink atlikėją (visi įrašai siejami su atlikėju)'); return }
    setSaving(true); setSaveMsg(null)
    try {
      const res = await fetch('/api/admin/concert-recordings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          youtube_id: draft.youtube_id,
          youtube_url: draft.youtube_url,
          title: draft.title,
          artist_id: draft.artist_id,
          duration_seconds: draft.duration_seconds,
          recording_type: draft.recording_type,
          venue: draft.venue || null,
          city: draft.city || null,
          country: draft.country || null,
          recorded_on: draft.recorded_on || null,
          recorded_year: draft.recorded_year ? Number(draft.recorded_year) : null,
          uploaded_at: draft.uploaded_at,
          channel: draft.channel,
          description: draft.description,
          thumbnail_url: draft.thumbnail_url,
          view_count: draft.view_count,
          is_featured: draft.is_featured,
          is_published: draft.is_published,
        }),
      })
      const json = await res.json()
      if (!json.ok) {
        setSaveMsg(json.error === undefined ? 'Klaida' : `⚠️ ${json.error}`)
        setSaving(false); return
      }
      // Prepend į sąrašą
      setItems((prev) => [{
        id: json.id, slug: json.slug, youtube_id: draft.youtube_id, title: draft.title,
        artist_id: draft.artist_id, artist_name_cached: draft.artist_name,
        duration_seconds: draft.duration_seconds, recording_type: draft.recording_type,
        venue: draft.venue || null, city: draft.city || null,
        recorded_on: draft.recorded_on || null, recorded_year: draft.recorded_year ? Number(draft.recorded_year) : null,
        uploaded_at: draft.uploaded_at, view_count: draft.view_count, styles: [],
        is_published: draft.is_published, is_featured: draft.is_featured,
        thumbnail_url: draft.thumbnail_url, created_at: new Date().toISOString(),
      }, ...prev])
      setSaveMsg('✅ Išsaugota')
      setDraft(null); setUrl('')
    } catch (e: any) {
      setSaveMsg(`⚠️ ${e?.message || 'Klaida'}`)
    }
    setSaving(false)
  }

  async function patchItem(id: number, patch: Record<string, any>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
    try {
      await fetch(`/api/admin/concert-recordings/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    } catch { /* optimistic */ }
  }

  async function deleteItem(id: number) {
    if (!confirm('Ištrinti šį įrašą?')) return
    setItems((prev) => prev.filter((it) => it.id !== id))
    try { await fetch(`/api/admin/concert-recordings/${id}`, { method: 'DELETE' }) } catch { /* */ }
  }

  return (
    <div>
      {/* ── Pridėjimo blokas ── */}
      <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleParse() }}
            placeholder="Įklijuok YouTube koncerto nuorodą (youtube.com/watch?v=... arba youtu.be/...)"
            className={inputCls}
          />
          <button
            onClick={handleParse}
            disabled={parsing || !url.trim()}
            className="shrink-0 rounded-lg bg-[var(--accent-orange)] px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {parsing ? 'Atpažįstu…' : 'Atpažinti'}
          </button>
        </div>
        {parseErr && <p className="mt-2 text-sm text-red-500">{parseErr}</p>}

        {/* ── Preview + redagavimas ── */}
        {draft && (
          <div className="mt-4 grid gap-4 sm:grid-cols-[200px_1fr]">
            <div>
              {draft.thumbnail_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={draft.thumbnail_url} alt="" className="aspect-video w-full rounded-lg object-cover" referrerPolicy="no-referrer" />
              )}
              <div className="mt-2 space-y-0.5 text-[12px] text-[var(--text-muted)]">
                {draft.duration_seconds != null && <div>⏱ Trukmė: <b>{formatDuration(draft.duration_seconds)}</b></div>}
                {draft.channel && <div>📺 {draft.channel}</div>}
                {draft.uploaded_at && <div>⬆️ Įkelta: {new Date(draft.uploaded_at).toLocaleDateString('lt-LT')}</div>}
                {draft.view_count != null && <div>👁 {draft.view_count.toLocaleString('lt-LT')} perž.</div>}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className={labelCls}>Pavadinimas</label>
                <input value={draft.title} onChange={(e) => upd('title', e.target.value)} className={inputCls} />
              </div>

              <div>
                <label className={labelCls}>
                  Atlikėjas {draft.artist_id ? <span className="text-green-600">· {draft.artist_name}</span> : <span className="text-red-500">· privaloma</span>}
                  {draft.artist_guess && !draft.artist_id && <span className="ml-1 font-normal">(spėjimas: {draft.artist_guess})</span>}
                </label>
                {draft.artist_id ? (
                  <button onClick={() => { upd('artist_id', null); upd('artist_name', null) }} className="text-sm text-[var(--accent-link)] underline">
                    Pakeisti atlikėją
                  </button>
                ) : (
                  <ArtistSearchInput
                    placeholder={draft.artist_guess ? `Ieškoti „${draft.artist_guess}"…` : 'Ieškoti atlikėjo…'}
                    onSelect={(id, name) => { upd('artist_id', id); upd('artist_name', name) }}
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Tipas</label>
                  <select value={draft.recording_type} onChange={(e) => upd('recording_type', e.target.value as RecordingType)} className={inputCls}>
                    {RECORDING_TYPE_ORDER.map((t) => <option key={t} value={t}>{recordingTypeLabel(t)}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Trukmė (sek.)</label>
                  <input type="number" value={draft.duration_seconds ?? ''} onChange={(e) => upd('duration_seconds', e.target.value ? Number(e.target.value) : null)} className={inputCls} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Vieta / salė</label>
                  <input value={draft.venue} onChange={(e) => upd('venue', e.target.value)} placeholder="pvz. Žalgirio arena" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Miestas</label>
                  <input value={draft.city} onChange={(e) => upd('city', e.target.value)} placeholder="pvz. Vilnius" className={inputCls} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Koncerto data</label>
                  <input type="date" value={draft.recorded_on} onChange={(e) => upd('recorded_on', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>arba tik metai</label>
                  <input type="number" value={draft.recorded_year} onChange={(e) => upd('recorded_year', e.target.value)} placeholder="2024" className={inputCls} />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 pt-1">
                <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                  <input type="checkbox" checked={draft.is_featured} onChange={(e) => upd('is_featured', e.target.checked)} /> Featured (spotlight)
                </label>
                <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                  <input type="checkbox" checked={draft.is_published} onChange={(e) => upd('is_published', e.target.checked)} /> Publikuoti
                </label>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button onClick={handleSave} disabled={saving} className="rounded-lg bg-green-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
                  {saving ? 'Saugau…' : 'Išsaugoti įrašą'}
                </button>
                <button onClick={() => { setDraft(null); setSaveMsg(null) }} className="text-sm text-[var(--text-muted)] underline">Atšaukti</button>
                {saveMsg && <span className="text-sm">{saveMsg}</span>}
              </div>
            </div>
          </div>
        )}
        {!draft && saveMsg && <p className="mt-2 text-sm">{saveMsg}</p>}
      </div>

      {/* ── Esamų įrašų sąrašas ── */}
      <h2 className="mb-3 mt-8 font-['Outfit',sans-serif] text-lg font-extrabold text-[var(--text-primary)]">
        Įrašai ({items.length})
      </h2>
      <div className="space-y-2">
        {items.length === 0 && <p className="text-sm text-[var(--text-muted)]">Dar nėra įrašų. Pridėk pirmą iš nuorodos viršuje.</p>}
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-2.5">
            {it.thumbnail_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={it.thumbnail_url} alt="" className="h-12 w-20 shrink-0 rounded object-cover" referrerPolicy="no-referrer" />
            ) : <div className="h-12 w-20 shrink-0 rounded bg-[var(--bg-elevated)]" />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{it.title}</p>
              <p className="truncate text-[12px] text-[var(--text-muted)]">
                {it.artist_name_cached || '—'} · {recordingTypeLabel(it.recording_type)}
                {it.duration_seconds ? ` · ${formatDuration(it.duration_seconds)}` : ''}
                {it.venue ? ` · ${it.venue}` : ''}
                {it.recorded_year ? ` · ${it.recorded_year}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                onClick={() => patchItem(it.id, { is_featured: !it.is_featured })}
                title="Featured"
                className={`rounded px-2 py-1 text-[11px] font-bold ${it.is_featured ? 'bg-amber-500 text-white' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'}`}
              >★</button>
              <button
                onClick={() => patchItem(it.id, { is_published: !it.is_published })}
                title="Publikuota"
                className={`rounded px-2 py-1 text-[11px] font-bold ${it.is_published ? 'bg-green-600 text-white' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'}`}
              >{it.is_published ? 'Live' : 'Off'}</button>
              <a href={`/koncertu-irasai/${it.slug}`} target="_blank" rel="noopener noreferrer" className="rounded bg-[var(--bg-elevated)] px-2 py-1 text-[11px] font-bold text-[var(--text-muted)]">↗</a>
              <button onClick={() => deleteItem(it.id)} title="Ištrinti" className="rounded bg-red-500/10 px-2 py-1 text-[11px] font-bold text-red-500">✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
