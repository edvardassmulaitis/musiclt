'use client'

// Admin klientas foto galerijai. Du tab'ai: Reportažai ir Fotografai.
// Reportažo editoriuje — Flickr albumo importas + nuotraukų įkėlimas.

import { useState, useEffect, useCallback } from 'react'
import ArtistSearchInput from '@/components/ui/ArtistSearchInput'

export type AdminReportage = {
  id: number; slug: string; title: string
  artist_id: number | null; photographer_id: number | null
  event_name: string | null; venue: string | null; city: string | null
  event_date: string | null; cover_url: string | null; photo_count: number
  is_published: boolean; is_featured: boolean; published_at: string | null
  artists?: { name: string } | null; photographers?: { name: string } | null
}
export type AdminPhotographer = {
  id: number; slug: string; name: string; role_title: string | null; bio: string | null
  avatar_url: string | null; website_url: string | null; instagram_url: string | null
  facebook_url: string | null; flickr_url: string | null; is_curated: boolean
  display_order: number; source: string | null
}
type Photo = { id: number; url: string; thumb_url: string | null; caption: string | null; flickr_id: string | null; sort_order: number; artist_id: number | null; tag: string | null }
type LineupItem = { artist_id: number; name: string; role: string }

// Standartizuoti bendrų (ne atlikėjų) nuotraukų tag'ai. Plečiama čia.
const STANDARD_TAGS = ['Žiūrovai', 'Atmosfera', 'Scena · Apšvietimas', 'Užkulisiai', 'Grupės muzikantai'] as const

const inputCls = 'w-full rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--input-text)] placeholder:text-[var(--input-placeholder)] focus:border-blue-400 focus:outline-none'
const labelCls = 'mb-1 block text-[13px] font-semibold text-[var(--text-muted)]'
const btn = 'rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors disabled:opacity-50'
const btnPrimary = `${btn} bg-[#ec4899] text-white hover:bg-[#db2777]`
const btnGhost = `${btn} border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]`

async function jpost(url: string, body: any, method = 'POST') {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

export type AdminVenue = { name: string; city: string | null }

export default function GalerijaAdminClient({
  initialReportages, initialPhotographers, initialVenues = [],
}: { initialReportages: AdminReportage[]; initialPhotographers: AdminPhotographer[]; initialVenues?: AdminVenue[] }) {
  const [tab, setTab] = useState<'reportages' | 'photographers'>('reportages')
  const [reportages, setReportages] = useState(initialReportages)
  const [photographers, setPhotographers] = useState(initialPhotographers)

  const reloadReportages = useCallback(async () => {
    try { const d = await (await fetch('/api/admin/galerija/reportages')).json(); if (d.ok) setReportages(d.items) } catch {}
  }, [])
  const reloadPhotographers = useCallback(async () => {
    try { const d = await (await fetch('/api/admin/galerija/photographers')).json(); if (d.ok) setPhotographers(d.items) } catch {}
  }, [])

  return (
    <div>
      <div className="mb-5 flex gap-2 border-b border-[var(--border-default)]">
        {(['reportages', 'photographers'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${tab === t ? 'border-[#ec4899] text-[var(--text-primary)]' : 'border-transparent text-[var(--text-muted)]'}`}>
            {t === 'reportages' ? `Reportažai (${reportages.length})` : `Fotografai (${photographers.filter(p => p.is_curated).length})`}
          </button>
        ))}
      </div>

      {tab === 'reportages'
        ? <ReportagesTab reportages={reportages} photographers={photographers} venues={initialVenues} reload={reloadReportages} />
        : <PhotographersTab photographers={photographers} reload={reloadPhotographers} />}
    </div>
  )
}

/* ════════════════════════ REPORTAŽAI ════════════════════════ */

function ReportagesTab({ reportages, photographers, venues, reload }: {
  reportages: AdminReportage[]; photographers: AdminPhotographer[]; venues: AdminVenue[]; reload: () => Promise<void>
}) {
  const [editId, setEditId] = useState<number | 'new' | null>(null)

  return (
    <div>
      <button className={`${btnPrimary} mb-4`} onClick={() => setEditId('new')}>+ Naujas reportažas</button>
      {editId !== null && (
        <ReportageEditor
          key={editId}
          id={editId}
          photographers={photographers}
          venues={venues}
          onClose={() => setEditId(null)}
          onSaved={async () => { await reload() }}
        />
      )}
      <div className="overflow-hidden rounded-xl border border-[var(--border-default)]">
        {reportages.length === 0 && <div className="p-6 text-center text-sm text-[var(--text-muted)]">Reportažų dar nėra.</div>}
        {reportages.map((r) => (
          <div key={r.id} className="flex items-center gap-3 border-b border-[var(--border-default)] px-3 py-2.5 last:border-0">
            <div className="h-12 w-16 flex-none overflow-hidden rounded bg-[var(--bg-elevated)]">
              {r.cover_url && <img src={r.cover_url} alt="" className="h-full w-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{r.title}</div>
              <div className="truncate text-[13px] text-[var(--text-muted)]">
                {[r.artists?.name, r.photographers?.name, `${r.photo_count} foto`, r.is_published ? null : 'nepublikuota', r.is_featured ? '★' : null].filter(Boolean).join(' · ')}
              </div>
            </div>
            <button className={btnGhost} onClick={() => setEditId(r.id)}>Redaguoti</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function ReportageEditor({ id, photographers, venues, onClose, onSaved }: {
  id: number | 'new'; photographers: AdminPhotographer[]; venues: AdminVenue[]; onClose: () => void; onSaved: () => Promise<void>
}) {
  const isNew = id === 'new'
  const [realId, setRealId] = useState<number | null>(isNew ? null : (id as number))
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [photos, setPhotos] = useState<Photo[]>([])
  const [d, setD] = useState({
    title: '', intro: '', artists: [] as Array<{ artist_id: number; name: string; role: string }>,
    photographer_id: null as number | null, event_id: null as string | null, event_title: '' as string,
    event_name: '', venue: '', city: '',
    event_date: '', flickr_album_url: '', source_url: '', is_featured: false, is_published: true,
  })

  // Load existing
  useEffect(() => {
    if (isNew) return
    ;(async () => {
      try {
        const r = await (await fetch(`/api/admin/galerija/reportages/${id}`)).json()
        if (r.ok) {
          const x = r.reportage
          setD({
            title: x.title || '', intro: x.intro || '',
            artists: ((r.lineup || []) as any[]).map((a) => ({ artist_id: a.artist_id, name: a.name || 'Atlikėjas', role: a.role || '' })),
            photographer_id: x.photographer_id, event_id: x.event_id || null, event_title: x.events?.title || '',
            event_name: x.event_name || '', venue: x.venue || '', city: x.city || '',
            event_date: x.event_date || '', flickr_album_url: x.flickr_album_url || '', source_url: x.source_url || '',
            is_featured: !!x.is_featured, is_published: !!x.is_published,
          })
          setPhotos(r.photos || [])
        }
      } finally { setLoading(false) }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = async () => {
    if (!d.title.trim()) { setMsg('Įvesk pavadinimą'); return }
    setSaving(true); setMsg('')
    try {
      const payload = {
        ...d,
        artists: d.artists.map((a) => ({ artist_id: a.artist_id, role: a.role || null })),
        photographer_id: d.photographer_id || null,
      }
      if (realId) {
        await jpost(`/api/admin/galerija/reportages/${realId}`, payload, 'PATCH')
        setMsg('Išsaugota ✓')
      } else {
        const res = await jpost('/api/admin/galerija/reportages', payload)
        setRealId(res.id)
        setMsg('Sukurta ✓ — dabar gali pridėti nuotraukas')
      }
      await onSaved()
    } catch (e: any) { setMsg(e.message) } finally { setSaving(false) }
  }

  const del = async () => {
    if (!realId || !confirm('Tikrai pašalinti reportažą su nuotraukomis?')) return
    try { await jpost(`/api/admin/galerija/reportages/${realId}`, {}, 'DELETE'); await onSaved(); onClose() } catch (e: any) { setMsg(e.message) }
  }

  const reloadPhotos = async () => {
    if (!realId) return
    const r = await (await fetch(`/api/admin/galerija/reportages/${realId}`)).json()
    if (r.ok) setPhotos(r.photos || [])
    await onSaved()
  }

  if (loading) return <div className="mb-4 rounded-xl border border-[var(--border-default)] p-6 text-sm text-[var(--text-muted)]">Kraunama…</div>

  return (
    <div className="mb-5 rounded-xl border-2 border-[#ec4899]/40 bg-[var(--bg-surface)] p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-['Outfit',sans-serif] text-lg font-bold text-[var(--text-primary)]">{isNew && !realId ? 'Naujas reportažas' : 'Redaguoti reportažą'}</h3>
        <button className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]" onClick={onClose}>✕ Uždaryti</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelCls}>Pavadinimas *</label>
          <input className={inputCls} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="Chet Faker debiutas Lietuvoje" />
        </div>
        <EventLink reportageId={realId} d={d} setD={setD} />
        <div className="sm:col-span-2">
          <label className={labelCls}>Atlikėjai (line-up) — pirmas = pagrindinis (užsipildo iš renginio)</label>
          {d.artists.length > 0 && (
            <div className="mb-2 space-y-1.5">
              {d.artists.map((a, idx) => (
                <div key={a.artist_id} className="flex items-center gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] px-2.5 py-1.5">
                  <span className="text-[12px] font-bold text-[var(--text-muted)]">{idx + 1}.</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-primary)]">{a.name}</span>
                  <select className="rounded border border-[var(--input-border)] bg-[var(--input-bg)] px-1.5 py-1 text-[13px] text-[var(--input-text)]"
                    value={a.role}
                    onChange={(e) => setD({ ...d, artists: d.artists.map((x, i) => i === idx ? { ...x, role: e.target.value } : x) })}>
                    <option value="">— vaidmuo —</option>
                    <option value="headlineris">Headlineris</option>
                    <option value="apšildantis">Apšildantis</option>
                    <option value="svečias">Svečias</option>
                  </select>
                  <button className="text-[var(--text-muted)] hover:text-red-500" title="Pašalinti"
                    onClick={() => setD({ ...d, artists: d.artists.filter((_, i) => i !== idx) })}>✕</button>
                </div>
              ))}
            </div>
          )}
          <ArtistSearchInput placeholder="Pridėti atlikėją…" onSelect={(aid, name) => {
            if (d.artists.some((x) => x.artist_id === aid)) return
            setD({ ...d, artists: [...d.artists, { artist_id: aid, name, role: '' }] })
          }} />
        </div>
        <div>
          <label className={labelCls}>Fotografas</label>
          <select className={inputCls} value={d.photographer_id ?? ''} onChange={(e) => setD({ ...d, photographer_id: e.target.value ? Number(e.target.value) : null })}>
            <option value="">— nepriskirta —</option>
            {photographers.map((p) => <option key={p.id} value={p.id}>{p.name}{p.is_curated ? '' : ' (auto)'}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Vieta</label>
          <input className={inputCls} list="galerija-venues" value={d.venue}
            onChange={(e) => {
              const v = e.target.value
              const match = venues.find((x) => x.name.toLowerCase() === v.toLowerCase())
              setD({ ...d, venue: v, ...(match?.city ? { city: match.city } : {}) })
            }} placeholder="Pasirink vietą…" />
          <datalist id="galerija-venues">
            {venues.map((v) => <option key={v.name} value={v.name}>{v.city || ''}</option>)}
          </datalist>
        </div>
        <div><label className={labelCls}>Miestas</label><input className={inputCls} value={d.city} onChange={(e) => setD({ ...d, city: e.target.value })} placeholder="Užsipildo iš vietos" /></div>
        <div><label className={labelCls}>Renginio data</label><input type="date" className={inputCls} value={d.event_date || ''} onChange={(e) => setD({ ...d, event_date: e.target.value })} /></div>
        <div><label className={labelCls}>Renginio pavadinimas (jei be atlikėjo)</label><input className={inputCls} value={d.event_name} onChange={(e) => setD({ ...d, event_name: e.target.value })} placeholder="AMFest 2025" /></div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Įžanga (HTML leidžiamas)</label>
          <textarea className={`${inputCls} min-h-[90px]`} value={d.intro} onChange={(e) => setD({ ...d, intro: e.target.value })} placeholder="Trumpas redakcinis aprašymas…" />
        </div>
        <div><label className={labelCls}>Šaltinio URL (legacy)</label><input className={inputCls} value={d.source_url} onChange={(e) => setD({ ...d, source_url: e.target.value })} placeholder="https://www.music.lt/…" /></div>
        <div className="flex items-end gap-4">
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"><input type="checkbox" checked={d.is_published} onChange={(e) => setD({ ...d, is_published: e.target.checked })} /> Publikuota</label>
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"><input type="checkbox" checked={d.is_featured} onChange={(e) => setD({ ...d, is_featured: e.target.checked })} /> Featured ★</label>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button className={btnPrimary} onClick={save} disabled={saving}>{saving ? 'Saugoma…' : realId ? 'Išsaugoti' : 'Sukurti'}</button>
        {realId && <button className={btnGhost} onClick={del}>Pašalinti</button>}
        {msg && <span className="text-[14px] text-[var(--text-muted)]">{msg}</span>}
      </div>

      {/* Nuotraukos — tik kai reportažas išsaugotas */}
      {realId ? (
        <PhotoManager reportageId={realId} photos={photos} lineup={d.artists} flickrUrl={d.flickr_album_url} onChange={reloadPhotos} setFlickrUrl={(u) => setD({ ...d, flickr_album_url: u })} />
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-[var(--border-default)] p-4 text-center text-[14px] text-[var(--text-muted)]">
          Pirmiausia išsaugok reportažą — tada galėsi pridėti nuotraukas.
        </div>
      )}
    </div>
  )
}

/* ──────────────── Renginio susiejimas (event_id) ──────────────── */
// Susieja galeriją su renginiu ir VIENU paspaudimu užpildo line-up'ą iš renginio
// atlikėjų (event_artists) — kad nereikėtų suvesti dukart. Auto-pasiūlymai pagal
// datą+pavadinimą; arba paieška.
type EventHit = { id: string; title: string; start_date: string | null; venue_name: string | null; city: string | null; lineup: { artist_id: number; name: string; is_headliner: boolean }[] }

function EventLink({ reportageId, d, setD }: { reportageId: number | null; d: any; setD: (updater: any) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<EventHit[]>([])
  const [suggest, setSuggest] = useState<EventHit[]>([])

  useEffect(() => {
    if (!reportageId || d.event_id) { setSuggest([]); return }
    fetch(`/api/admin/galerija/events?suggestFor=${reportageId}`).then((r) => r.json()).then((j) => { if (j.ok) setSuggest(j.events) }).catch(() => {})
  }, [reportageId, d.event_id])

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return }
    const t = setTimeout(() => {
      fetch(`/api/admin/galerija/events?q=${encodeURIComponent(q)}`).then((r) => r.json()).then((j) => { if (j.ok) setResults(j.events) }).catch(() => {})
    }, 200)
    return () => clearTimeout(t)
  }, [q])

  const link = (e: EventHit) => {
    const lineup = e.lineup.map((a) => ({ artist_id: a.artist_id, name: a.name, role: a.is_headliner ? 'headlineris' : '' }))
    setD((prev: any) => ({
      ...prev, event_id: e.id, event_title: e.title,
      artists: lineup.length ? lineup : prev.artists,
      venue: prev.venue || e.venue_name || '',
      city: prev.city || e.city || '',
      event_date: prev.event_date || (e.start_date ? e.start_date.slice(0, 10) : ''),
    }))
    setQ(''); setResults([])
  }
  const unlink = () => setD((prev: any) => ({ ...prev, event_id: null, event_title: '' }))

  const Row = ({ e }: { e: EventHit }) => (
    <button type="button" onClick={() => link(e)}
      className="flex w-full items-center gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-left hover:border-[#ec4899]/60">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold text-[var(--text-primary)]">{e.title}</span>
        <span className="block truncate text-[12px] text-[var(--text-muted)]">
          {[e.start_date ? e.start_date.slice(0, 10) : null, e.city, e.lineup.slice(0, 3).map((a) => a.name).join(', ')].filter(Boolean).join(' · ')}
        </span>
      </span>
      <span className="flex-none text-[12px] font-bold text-[#ec4899]">Susieti →</span>
    </button>
  )

  return (
    <div className="sm:col-span-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)]/40 p-3">
      <label className={labelCls}>Renginys (atlikėjai užsipildo automatiškai)</label>
      {d.event_id ? (
        <div className="flex items-center gap-2 rounded-lg border border-[#ec4899]/40 bg-[#ec4899]/5 px-3 py-2">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ec4899" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-primary)]">{d.event_title || 'Susietas renginys'}</span>
          <button type="button" className="text-[13px] font-semibold text-[var(--text-muted)] hover:text-red-500" onClick={unlink}>Atsieti</button>
        </div>
      ) : (
        <>
          {suggest.length > 0 && (
            <div className="mb-2 space-y-1.5">
              <div className="text-[12px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Pasiūlymai</div>
              {suggest.map((e) => <Row key={e.id} e={e} />)}
            </div>
          )}
          <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ieškoti renginio pagal pavadinimą…" />
          {results.length > 0 && (
            <div className="mt-1.5 space-y-1.5">
              {results.map((e) => <Row key={e.id} e={e} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ──────────────── Nuotraukų valdymas (Flickr / upload) ──────────────── */

// Grupės pasirinkimas (atlikėjas iš line-up arba laisvas tagas). value:
//   'a:<id>' | 't:<tag>' | '' (bendros)
function groupControl(lineup: LineupItem[], value: string, onChange: (v: string) => void, tagValue: string, onTag: (v: string) => void) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <select className="rounded border border-[var(--input-border)] bg-[var(--input-bg)] px-1.5 py-1 text-[13px] text-[var(--input-text)]" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Bendros (be grupės)</option>
        {lineup.length > 0 && (
          <optgroup label="Atlikėjai (iš renginio)">
            {lineup.map((a) => <option key={a.artist_id} value={`a:${a.artist_id}`}>{a.name}</option>)}
          </optgroup>
        )}
        <optgroup label="Tipas">
          {STANDARD_TAGS.map((t) => <option key={t} value={`t:${t}`}>{t}</option>)}
        </optgroup>
        <option value="t:__custom">Kita (laisvas)…</option>
      </select>
      {value === 't:__custom' && (
        <input className="w-28 rounded border border-[var(--input-border)] bg-[var(--input-bg)] px-1.5 py-1 text-[13px] text-[var(--input-text)]" placeholder="laisvas tagas" value={tagValue} onChange={(e) => onTag(e.target.value)} />
      )}
    </span>
  )
}
// value+tag → API laukai
function groupToFields(value: string, tag: string): { artist_id: number | null; tag: string | null } {
  if (value.startsWith('a:')) return { artist_id: Number(value.slice(2)) || null, tag: null }
  if (value === 't:__custom') return { artist_id: null, tag: tag.trim() || null }
  if (value.startsWith('t:')) return { artist_id: null, tag: value.slice(2) || null }
  return { artist_id: null, tag: null }
}

function PhotoManager({ reportageId, photos, lineup, flickrUrl, setFlickrUrl, onChange }: {
  reportageId: number; photos: Photo[]; lineup: LineupItem[]; flickrUrl: string; setFlickrUrl: (u: string) => void; onChange: () => Promise<void>
}) {
  const [importing, setImporting] = useState(false)
  const [found, setFound] = useState<{ flickrId: string; url: string }[]>([])
  const [progress, setProgress] = useState('')
  // batch grupė importui/upload'ui
  const [batchGroup, setBatchGroup] = useState(''); const [batchTag, setBatchTag] = useState('')
  // pažymėtos esamos nuotraukos + priskyrimo grupė
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [assignGroup, setAssignGroup] = useState(''); const [assignTag, setAssignTag] = useState('')
  const nameById = (id: number | null) => (id ? lineup.find((a) => a.artist_id === id)?.name : null)
  const toggleSel = (id: number) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const findFlickr = async () => {
    if (!flickrUrl.trim()) return
    setImporting(true); setProgress(''); setFound([])
    try {
      const r = await jpost('/api/admin/galerija/flickr-import', { album_url: flickrUrl })
      setFound(r.photos)
      setProgress(`Rasta ${r.count} nuotraukų. Spausk „Importuoti".`)
    } catch (e: any) { setProgress(e.message) } finally { setImporting(false) }
  }

  // Importuoja rastas Flickr nuotraukas batch'ais (re-host į mūsų serverį)
  const importFlickr = async () => {
    if (!found.length) return
    setImporting(true)
    const CHUNK = 4
    let done = 0
    let failed = 0
    let firstErr = ''
    try {
      const gf = groupToFields(batchGroup, batchTag)
      for (let i = 0; i < found.length; i += CHUNK) {
        const batch = found.slice(i, i + CHUNK).map((p) => ({ url: p.url, flickr_id: p.flickrId }))
        const r = await jpost(`/api/admin/galerija/reportages/${reportageId}/photos`, { photos: batch, rehost: true, group_artist_id: gf.artist_id, group_tag: gf.tag })
        done += r.inserted || 0
        const errs: string[] = Array.isArray(r.errors) ? r.errors : []
        failed += errs.length
        if (!firstErr && errs.length) firstErr = errs[0]
        setProgress(`Importuota ${done}/${found.length}…${failed ? ` (nepavyko ${failed})` : ''}`)
      }
      await jpost(`/api/admin/galerija/reportages/${reportageId}`, { flickr_album_url: flickrUrl }, 'PATCH')
      if (done > 0) setFound([])
      if (failed > 0) {
        setProgress(`Importuota ${done}, nepavyko ${failed}. ${firstErr.includes('429') || /riboja/i.test(firstErr) ? 'Flickr riboja serverio užklausas — reikia FLICKR_API_KEY (Vercel env) arba bandyk vėliau.' : firstErr}`)
      } else {
        setProgress(`Baigta — importuota ${done}.`)
      }
      await onChange()
    } catch (e: any) { setProgress(`Klaida: ${e.message}`) } finally { setImporting(false) }
  }

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setImporting(true); setProgress('')
    try {
      const urls: { url: string }[] = []
      let i = 0
      for (const f of Array.from(files)) {
        setProgress(`Įkeliama ${++i}/${files.length}…`)
        const fd = new FormData(); fd.append('file', f)
        const res = await fetch('/api/upload', { method: 'POST', body: fd })
        const data = await res.json()
        if (res.ok && data.url) urls.push({ url: data.url })
      }
      if (urls.length) {
        const gf = groupToFields(batchGroup, batchTag)
        await jpost(`/api/admin/galerija/reportages/${reportageId}/photos`, { photos: urls, rehost: false, group_artist_id: gf.artist_id, group_tag: gf.tag })
        setProgress(`Įkelta ${urls.length}.`)
        await onChange()
      }
    } catch (e: any) { setProgress(`Klaida: ${e.message}`) } finally { setImporting(false) }
  }

  const delPhoto = async (pid: number) => {
    try { await jpost(`/api/admin/galerija/reportages/${reportageId}/photos?photoId=${pid}`, {}, 'DELETE'); await onChange() } catch {}
  }

  const assignSelected = async () => {
    if (!sel.size) return
    const gf = groupToFields(assignGroup, assignTag)
    setImporting(true); setProgress('')
    try {
      await jpost(`/api/admin/galerija/reportages/${reportageId}/photos`, { photoIds: [...sel], artist_id: gf.artist_id, tag: gf.tag }, 'PATCH')
      setSel(new Set()); setProgress('Grupė priskirta.')
      await onChange()
    } catch (e: any) { setProgress(`Klaida: ${e.message}`) } finally { setImporting(false) }
  }

  const photoGroupLabel = (p: Photo) => p.artist_id ? nameById(p.artist_id) : p.tag || null

  return (
    <div className="mt-5 border-t border-[var(--border-default)] pt-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="font-['Outfit',sans-serif] text-sm font-bold text-[var(--text-primary)]">Nuotraukos ({photos.length})</h4>
        {importing && <span className="text-[13px] text-[#ec4899]">{progress || 'Dirbama…'}</span>}
      </div>

      {/* Batch grupė importui/upload'ui */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-[var(--bg-elevated)] px-3 py-2">
        <span className="text-[13px] font-semibold text-[var(--text-muted)]">Pridedamas naujas nuotraukas priskirti:</span>
        {groupControl(lineup, batchGroup, setBatchGroup, batchTag, setBatchTag)}
      </div>

      {/* Flickr import (per oficialų API kai FLICKR_API_KEY nustatytas — be 429) */}
      <div className="mb-3 rounded-lg border border-[var(--border-default)] p-3">
        <label className={labelCls}>Importuoti iš Flickr albumo</label>
        <div className="flex flex-wrap gap-2">
          <input className={`${inputCls} flex-1`} value={flickrUrl} onChange={(e) => setFlickrUrl(e.target.value)} placeholder="https://www.flickr.com/photos/…/albums/…" />
          <button className={btnGhost} onClick={findFlickr} disabled={importing}>Rasti</button>
          {found.length > 0 && <button className={btnPrimary} onClick={importFlickr} disabled={importing}>Importuoti {found.length} (re-host)</button>}
        </div>
        {found.length > 0 && (
          <>
            <div className="mt-2 text-[13px] text-[var(--text-muted)]">Rasta {found.length} nuotraukų — importuojant bus perkeltos visos.</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {found.map((p) => (
                <img key={p.flickrId} src={p.url.replace(/_[a-z]\.jpg$/i, '_q.jpg')} alt="" loading="lazy"
                  referrerPolicy="no-referrer"
                  className="h-14 w-14 flex-none rounded object-cover bg-[var(--bg-elevated)]" />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Upload */}
      <div className="mb-3 rounded-lg border border-[var(--border-default)] p-3">
        <label className={labelCls}>Arba įkelk nuotraukas iš kompiuterio</label>
        <input type="file" accept="image/*" multiple onChange={(e) => uploadFiles(e.target.files)} className="text-sm text-[var(--text-secondary)]" />
      </div>

      {/* Pažymėtų priskyrimas grupei */}
      {sel.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-[#ec4899]/40 bg-[#ec4899]/5 px-3 py-2">
          <span className="text-[13px] font-semibold text-[var(--text-primary)]">Pažymėta {sel.size} — priskirti grupei:</span>
          {groupControl(lineup, assignGroup, setAssignGroup, assignTag, setAssignTag)}
          <button className={btnPrimary} onClick={assignSelected} disabled={importing}>Priskirti</button>
          <button className={btnGhost} onClick={() => setSel(new Set())}>Išvalyti</button>
        </div>
      )}

      {/* Esamos */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {photos.map((p) => {
            const gl = photoGroupLabel(p)
            const selected = sel.has(p.id)
            return (
              <div key={p.id} className={`group relative overflow-hidden rounded-lg border-2 ${selected ? 'border-[#ec4899]' : 'border-[var(--border-default)]'}`}>
                <img src={p.thumb_url || p.url} alt="" className="aspect-square w-full cursor-pointer object-cover" onClick={() => toggleSel(p.id)} />
                <input type="checkbox" checked={selected} onChange={() => toggleSel(p.id)} className="absolute left-1.5 top-1.5 h-4 w-4 accent-[#ec4899]" />
                {gl && <span className="absolute inset-x-0 bottom-0 truncate bg-black/65 px-1.5 py-0.5 text-[11px] font-semibold text-white">{gl}</span>}
                <button onClick={() => delPhoto(p.id)} className="absolute right-1 top-1 hidden h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white group-hover:flex" title="Pašalinti">✕</button>
              </div>
            )
          })}
        </div>
      )}
      {!progress && !importing && <p className="mt-2 text-[12px] text-[var(--text-muted)]">Flickr nuotraukos re-host'inamos į mūsų serverį (durable). Spausk nuotrauką → pažymėti → priskirti atlikėjui ar tagui (pvz. „Žiūrovai"). Pirma tampa viršeliu.</p>}
    </div>
  )
}

/* ════════════════════════ FOTOGRAFAI ════════════════════════ */

function PhotographersTab({ photographers, reload }: { photographers: AdminPhotographer[]; reload: () => Promise<void> }) {
  const [adding, setAdding] = useState(false)
  return (
    <div>
      <button className={`${btnPrimary} mb-4`} onClick={() => setAdding(true)}>+ Naujas fotografas</button>
      {adding && <PhotographerEditor onClose={() => setAdding(false)} onSaved={reload} />}
      <div className="space-y-2">
        {photographers.map((p) => <PhotographerRow key={p.id} p={p} onSaved={reload} />)}
      </div>
    </div>
  )
}

function PhotographerRow({ p, onSaved }: { p: AdminPhotographer; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const toggleCurated = async () => {
    try { await jpost(`/api/admin/galerija/photographers/${p.id}`, { is_curated: !p.is_curated }, 'PATCH'); await onSaved() } catch {}
  }
  return (
    <div className="rounded-xl border border-[var(--border-default)]">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="h-10 w-10 flex-none overflow-hidden rounded-full bg-[var(--bg-elevated)]">
          {p.avatar_url && <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{p.name} {p.is_curated && <span className="ml-1 rounded bg-[#ec4899]/15 px-1.5 py-0.5 text-[11px] font-bold text-[#ec4899]">PUBLIC</span>}</div>
          <div className="truncate text-[13px] text-[var(--text-muted)]">{p.role_title || p.source || 'fotografas'}</div>
        </div>
        <button className={btnGhost} onClick={toggleCurated}>{p.is_curated ? 'Slėpti' : 'Rodyti public'}</button>
        <button className={btnGhost} onClick={() => setOpen(!open)}>{open ? 'Uždaryti' : 'Redaguoti'}</button>
      </div>
      {open && <div className="border-t border-[var(--border-default)] p-3"><PhotographerEditor existing={p} onClose={() => setOpen(false)} onSaved={onSaved} /></div>}
    </div>
  )
}

function PhotographerEditor({ existing, onClose, onSaved }: { existing?: AdminPhotographer; onClose: () => void; onSaved: () => Promise<void> }) {
  const [d, setD] = useState({
    name: existing?.name || '', role_title: existing?.role_title || '', bio: existing?.bio || '',
    avatar_url: existing?.avatar_url || '', website_url: existing?.website_url || '',
    instagram_url: existing?.instagram_url || '', facebook_url: existing?.facebook_url || '',
    flickr_url: existing?.flickr_url || '', is_curated: existing ? existing.is_curated : true,
  })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const uploadAvatar = async (file: File | undefined) => {
    if (!file) return
    setMsg('Įkeliama…')
    const fd = new FormData(); fd.append('file', file)
    const res = await fetch('/api/upload', { method: 'POST', body: fd })
    const data = await res.json()
    if (res.ok && data.url) { setD((s) => ({ ...s, avatar_url: data.url })); setMsg('Avataras įkeltas ✓') } else setMsg(data.error || 'Klaida')
  }

  const save = async () => {
    if (!d.name.trim()) { setMsg('Įvesk vardą'); return }
    setSaving(true); setMsg('')
    try {
      if (existing) await jpost(`/api/admin/galerija/photographers/${existing.id}`, d, 'PATCH')
      else await jpost('/api/admin/galerija/photographers', d)
      await onSaved(); setMsg('Išsaugota ✓')
      if (!existing) onClose()
    } catch (e: any) { setMsg(e.message) } finally { setSaving(false) }
  }

  return (
    <div className={existing ? '' : 'mb-4 rounded-xl border-2 border-[#ec4899]/40 bg-[var(--bg-surface)] p-4'}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className={labelCls}>Vardas *</label><input className={inputCls} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></div>
        <div><label className={labelCls}>Pareigos</label><input className={inputCls} value={d.role_title} onChange={(e) => setD({ ...d, role_title: e.target.value })} placeholder="Koncertų fotografas" /></div>
        <div className="sm:col-span-2"><label className={labelCls}>Bio</label><textarea className={`${inputCls} min-h-[60px]`} value={d.bio} onChange={(e) => setD({ ...d, bio: e.target.value })} /></div>
        <div>
          <label className={labelCls}>Avataras</label>
          <div className="flex items-center gap-2">
            {d.avatar_url && <img src={d.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />}
            <input type="file" accept="image/*" onChange={(e) => uploadAvatar(e.target.files?.[0])} className="text-sm text-[var(--text-secondary)]" />
          </div>
        </div>
        <div><label className={labelCls}>Instagram</label><input className={inputCls} value={d.instagram_url} onChange={(e) => setD({ ...d, instagram_url: e.target.value })} placeholder="https://instagram.com/…" /></div>
        <div><label className={labelCls}>Flickr</label><input className={inputCls} value={d.flickr_url} onChange={(e) => setD({ ...d, flickr_url: e.target.value })} /></div>
        <div><label className={labelCls}>Facebook</label><input className={inputCls} value={d.facebook_url} onChange={(e) => setD({ ...d, facebook_url: e.target.value })} /></div>
        <div><label className={labelCls}>Svetainė</label><input className={inputCls} value={d.website_url} onChange={(e) => setD({ ...d, website_url: e.target.value })} /></div>
        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"><input type="checkbox" checked={d.is_curated} onChange={(e) => setD({ ...d, is_curated: e.target.checked })} /> Rodyti public direktorijoje</label>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button className={btnPrimary} onClick={save} disabled={saving}>{saving ? 'Saugoma…' : 'Išsaugoti'}</button>
        <button className={btnGhost} onClick={onClose}>Uždaryti</button>
        {msg && <span className="text-[14px] text-[var(--text-muted)]">{msg}</span>}
      </div>
    </div>
  )
}
