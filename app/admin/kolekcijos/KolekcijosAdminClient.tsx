'use client'

// app/admin/kolekcijos/KolekcijosAdminClient.tsx
//
// Kolekcijų valdymo UI. Tab'ai: Dainų / Albumų kolekcijos.
//  - CRUD (kurti / redaguoti / trinti / aktyvuoti / sort).
//  - Dainų kolekcijai: track picker (paieška + pridėti / šalinti / reorder)
//    ir „✨ Pasiūlyti dainas" (AI kandidatai → peržiūra ✓ → pridėti).

import { useState, useEffect, useCallback } from 'react'

export type AdminCollection = {
  id: number
  slug: string
  kind: 'song' | 'album'
  title: string
  emoji: string | null
  meta_title: string | null
  description: string | null
  intro: string | null
  grp: string | null
  genre_name: string | null
  scope: string | null
  substyle_slug: string | null
  sort: number
  is_active: boolean
  created_at?: string
}

type Track = {
  track_id: number; title: string; slug: string | null; cover_url: string | null
  video_views: number | null; artist_name: string | null; artist_slug: string | null
}
type Candidate = Track & { country?: string | null; relevance?: number }

const inputCls = 'w-full px-2.5 py-1.5 border rounded-lg text-sm border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--input-text)] focus:outline-none focus:border-blue-400'
const btnCls = 'px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors'

function emptyForm(kind: 'song' | 'album'): Partial<AdminCollection> {
  return { kind, title: '', emoji: kind === 'song' ? '🎵' : '💿', slug: '', meta_title: '', description: '', intro: '', grp: 'tema', genre_name: '', scope: '', substyle_slug: '', is_active: true }
}

export default function KolekcijosAdminClient({ initialCollections, genreNames }: { initialCollections: AdminCollection[]; genreNames: string[] }) {
  const [items, setItems] = useState<AdminCollection[]>(initialCollections)
  const [kind, setKind] = useState<'song' | 'album'>('song')
  const [editing, setEditing] = useState<Partial<AdminCollection> | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [openTracks, setOpenTracks] = useState<string | null>(null) // collection slug, kurio dainas tvarkom

  const list = items.filter((c) => c.kind === kind)

  async function reload() {
    const r = await fetch('/api/admin/kolekcijos').then((x) => x.json()).catch(() => null)
    if (r?.ok) setItems(r.items)
  }

  async function save(form: Partial<AdminCollection>) {
    setBusy(true); setMsg(null)
    const isNew = !form.id
    const r = await fetch('/api/admin/kolekcijos', {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    }).then((x) => x.json()).catch(() => null)
    setBusy(false)
    if (!r?.ok) { setMsg(r?.error || 'Klaida išsaugant'); return }
    setEditing(null); setMsg(isNew ? 'Sukurta ✓' : 'Atnaujinta ✓')
    await reload()
  }

  async function remove(c: AdminCollection) {
    if (!confirm(`Ištrinti kolekciją „${c.title}"?`)) return
    setBusy(true)
    await fetch('/api/admin/kolekcijos', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id }) })
    setBusy(false); await reload()
  }

  async function toggleActive(c: AdminCollection) {
    await fetch('/api/admin/kolekcijos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, is_active: !c.is_active }) })
    await reload()
  }

  async function move(c: AdminCollection, dir: -1 | 1) {
    const arr = items.filter((x) => x.kind === c.kind)
    const idx = arr.findIndex((x) => x.id === c.id)
    const swap = arr[idx + dir]
    if (!swap) return
    await Promise.all([
      fetch('/api/admin/kolekcijos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, sort: swap.sort }) }),
      fetch('/api/admin/kolekcijos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: swap.id, sort: c.sort }) }),
    ])
    await reload()
  }

  return (
    <div>
      {/* Tabs */}
      <div className="mb-4 flex gap-2">
        {(['song', 'album'] as const).map((k) => (
          <button key={k} onClick={() => { setKind(k); setEditing(null); setOpenTracks(null) }}
            className={`${btnCls} ${kind === k ? 'bg-[var(--text-primary)] text-white' : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-default)]'}`}>
            {k === 'song' ? '🎵 Dainų kolekcijos' : '💿 Albumų kolekcijos'} ({items.filter((c) => c.kind === k).length})
          </button>
        ))}
        <button onClick={() => { setEditing(emptyForm(kind)); setOpenTracks(null) }} className={`${btnCls} ml-auto bg-orange-500 text-white hover:bg-orange-600`}>
          + Nauja kolekcija
        </button>
      </div>

      {msg && <div className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 border border-green-200">{msg}</div>}

      {editing && (
        <CollectionForm form={editing} genreNames={genreNames} busy={busy} onCancel={() => setEditing(null)} onSave={save} />
      )}

      <div className="space-y-2">
        {list.map((c) => (
          <div key={c.id} className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
            <div className="flex items-center gap-3 px-3 py-2.5">
              <div className="flex flex-col">
                <button onClick={() => move(c, -1)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] leading-none">▲</button>
                <button onClick={() => move(c, 1)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] leading-none">▼</button>
              </div>
              <span className="text-xl">{c.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm text-[var(--text-primary)] truncate">{c.title}{!c.is_active && <span className="ml-2 text-xs text-[var(--text-muted)]">(neaktyvi)</span>}</div>
                <div className="text-xs text-[var(--text-muted)] truncate">
                  /{c.kind === 'album' ? `albumai/geriausi/${c.slug}` : `dainos/${c.slug}`}
                  {c.kind === 'album' && (c.genre_name ? ` · žanras: ${c.genre_name}` : c.scope ? ` · ${c.scope}` : c.substyle_slug ? ` · ${c.substyle_slug}` : '')}
                  {c.kind === 'song' && c.grp ? ` · ${c.grp}` : ''}
                </div>
              </div>
              {c.kind === 'song' && (
                <button onClick={() => setOpenTracks(openTracks === c.slug ? null : c.slug)} className={`${btnCls} bg-blue-50 text-blue-700 border border-blue-200`}>
                  🎵 Dainos
                </button>
              )}
              <button onClick={() => toggleActive(c)} className={`${btnCls} ${c.is_active ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
                {c.is_active ? 'Aktyvi' : 'Įjungti'}
              </button>
              <button onClick={() => { setEditing(c); setOpenTracks(null) }} className={`${btnCls} bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-default)]`}>Redaguoti</button>
              <button onClick={() => remove(c)} className={`${btnCls} text-red-600 hover:bg-red-50`}>✕</button>
            </div>
            {c.kind === 'song' && openTracks === c.slug && (
              <TrackManager collection={c} />
            )}
          </div>
        ))}
        {list.length === 0 && <p className="text-sm text-[var(--text-muted)] py-6 text-center">Kolekcijų dar nėra.</p>}
      </div>
    </div>
  )
}

/* ───────────────────────── Forma ───────────────────────── */

function CollectionForm({ form, genreNames, busy, onCancel, onSave }: {
  form: Partial<AdminCollection>; genreNames: string[]; busy: boolean
  onCancel: () => void; onSave: (f: Partial<AdminCollection>) => void
}) {
  const [f, setF] = useState<Partial<AdminCollection>>(form)
  const set = (k: keyof AdminCollection, v: any) => setF((p) => ({ ...p, [k]: v }))
  const isAlbum = f.kind === 'album'

  return (
    <div className="mb-4 rounded-xl border border-orange-200 bg-orange-50/40 p-4">
      <div className="mb-3 text-sm font-bold text-[var(--text-primary)]">{f.id ? 'Redaguoti kolekciją' : 'Nauja kolekcija'} ({isAlbum ? 'albumų' : 'dainų'})</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs text-[var(--text-muted)]">Pavadinimas (H1)
          <input className={inputCls} value={f.title || ''} onChange={(e) => set('title', e.target.value)} placeholder="pvz. Patriotinės dainos" />
        </label>
        <label className="text-xs text-[var(--text-muted)]">Emoji
          <input className={inputCls} value={f.emoji || ''} onChange={(e) => set('emoji', e.target.value)} maxLength={4} />
        </label>
        <label className="text-xs text-[var(--text-muted)]">Slug (tuščia = auto iš pavadinimo)
          <input className={inputCls} value={f.slug || ''} onChange={(e) => set('slug', e.target.value)} placeholder="patriotines-dainos" />
        </label>
        {!isAlbum && (
          <label className="text-xs text-[var(--text-muted)]">Grupė hub'e
            <select className={inputCls} value={f.grp || 'tema'} onChange={(e) => set('grp', e.target.value)}>
              <option value="tema">Pagal progą ir temą</option>
              <option value="nuotaika">Pagal nuotaiką</option>
            </select>
          </label>
        )}
        {isAlbum && (
          <>
            <label className="text-xs text-[var(--text-muted)]">Žanras (DB genres.name)
              <select className={inputCls} value={f.genre_name || ''} onChange={(e) => set('genre_name', e.target.value)}>
                <option value="">— nenaudoti —</option>
                {genreNames.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
            <label className="text-xs text-[var(--text-muted)]">Apimtis (jei be žanro)
              <select className={inputCls} value={f.scope || ''} onChange={(e) => set('scope', e.target.value)}>
                <option value="">—</option>
                <option value="all">Visi</option>
                <option value="lt">Lietuviški</option>
                <option value="world">Pasaulio</option>
              </select>
            </label>
            <label className="text-xs text-[var(--text-muted)]">Substilio slug (nebūtina)
              <input className={inputCls} value={f.substyle_slug || ''} onChange={(e) => set('substyle_slug', e.target.value)} placeholder="jazz" />
            </label>
          </>
        )}
        <label className="text-xs text-[var(--text-muted)] sm:col-span-2">Meta title (&lt;title&gt;)
          <input className={inputCls} value={f.meta_title || ''} onChange={(e) => set('meta_title', e.target.value)} />
        </label>
        <label className="text-xs text-[var(--text-muted)] sm:col-span-2">Meta description
          <input className={inputCls} value={f.description || ''} onChange={(e) => set('description', e.target.value)} />
        </label>
        <label className="text-xs text-[var(--text-muted)] sm:col-span-2">Intro (SEO proza)
          <textarea className={inputCls} rows={3} value={f.intro || ''} onChange={(e) => set('intro', e.target.value)} />
        </label>
      </div>
      <div className="mt-3 flex gap-2">
        <button disabled={busy || !f.title} onClick={() => onSave(f)} className={`${btnCls} bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50`}>
          {busy ? 'Saugoma…' : 'Išsaugoti'}
        </button>
        <button onClick={onCancel} className={`${btnCls} bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-default)]`}>Atšaukti</button>
      </div>
    </div>
  )
}

/* ───────────────────────── Track manager (dainų kolekcija) ───────────────────────── */

function TrackManager({ collection }: { collection: AdminCollection }) {
  const slug = collection.slug
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [suggesting, setSuggesting] = useState(false)
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/admin/kolekcijos/tracks?slug=${encodeURIComponent(slug)}`).then((x) => x.json()).catch(() => null)
    setTracks(r?.ok ? r.items : [])
    setLoading(false)
  }, [slug])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (q.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/tracks?search=${encodeURIComponent(q)}&limit=8`).then((x) => x.json()).catch(() => null)
      setResults(r?.tracks || [])
    }, 220)
    return () => clearTimeout(t)
  }, [q])

  async function add(trackIds: number[]) {
    const r = await fetch('/api/admin/kolekcijos/tracks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, track_ids: trackIds }) }).then((x) => x.json()).catch(() => null)
    if (r?.ok) setTracks(r.items)
  }
  async function del(trackId: number) {
    const r = await fetch('/api/admin/kolekcijos/tracks', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, track_id: trackId }) }).then((x) => x.json()).catch(() => null)
    if (r?.ok) setTracks(r.items)
  }
  async function reorder(idx: number, dir: -1 | 1) {
    const next = [...tracks]
    const j = idx + dir
    if (j < 0 || j >= next.length) return
    ;[next[idx], next[j]] = [next[j], next[idx]]
    setTracks(next)
    await fetch('/api/admin/kolekcijos/tracks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, ordered: next.map((t) => t.track_id) }) })
  }

  async function suggest() {
    setSuggesting(true); setErr(null); setCandidates(null); setPicked(new Set())
    const r = await fetch('/api/admin/kolekcijos/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug }) }).then((x) => x.json()).catch(() => null)
    setSuggesting(false)
    if (!r?.ok) { setErr(r?.error || 'AI nepavyko'); return }
    setCandidates(r.candidates || [])
    setPicked(new Set((r.candidates || []).map((c: Candidate) => c.track_id)))
  }
  async function approvePicked() {
    if (picked.size === 0) return
    await add([...picked])
    setCandidates(null); setPicked(new Set())
  }

  return (
    <div className="border-t border-[var(--border-default)] bg-[var(--bg-elevated,#fafafa)] p-4">
      {/* Esamos dainos */}
      <div className="mb-3 text-xs font-bold text-[var(--text-muted)]">KOLEKCIJOS DAINOS ({tracks.length})</div>
      {loading ? <p className="text-sm text-[var(--text-muted)]">Kraunama…</p> : tracks.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)] mb-3">Dar nėra dainų. Pridėk per paiešką arba „✨ Pasiūlyti dainas".</p>
      ) : (
        <div className="mb-3 space-y-1">
          {tracks.map((t, i) => (
            <div key={t.track_id} className="flex items-center gap-2 rounded-lg bg-[var(--bg-surface)] px-2 py-1.5 border border-[var(--border-default)]">
              <span className="text-xs text-[var(--text-muted)] w-5 text-right">{i + 1}.</span>
              {t.cover_url ? <img src={t.cover_url} alt="" className="w-8 h-8 rounded object-cover" referrerPolicy="no-referrer" /> : <div className="w-8 h-8 rounded bg-gray-200" />}
              <div className="min-w-0 flex-1">
                <div className="text-sm text-[var(--text-primary)] truncate">{t.title}</div>
                <div className="text-xs text-[var(--text-muted)] truncate">{t.artist_name}{t.video_views ? ` · ${t.video_views.toLocaleString('lt-LT')} perž.` : ''}</div>
              </div>
              <button onClick={() => reorder(i, -1)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">▲</button>
              <button onClick={() => reorder(i, 1)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">▼</button>
              <button onClick={() => del(t.track_id)} className="text-sm text-red-600 hover:bg-red-50 rounded px-1.5">✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Pridėti per paiešką */}
      <div className="relative mb-3">
        <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ieškoti dainos pavadinimu..." />
        {results.length > 0 && (
          <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xl">
            {results.map((t) => (
              <button key={t.id} type="button" onClick={() => { add([t.id]); setQ(''); setResults([]) }} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--bg-hover)]">
                {t.cover_url ? <img src={t.cover_url} alt="" className="w-7 h-7 rounded object-cover" referrerPolicy="no-referrer" /> : <div className="w-7 h-7 rounded bg-gray-200" />}
                <div className="min-w-0">
                  <div className="text-sm text-[var(--text-primary)] truncate">{t.title}</div>
                  <div className="text-xs text-[var(--text-muted)] truncate">{t.artists?.name}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* AI suggest */}
      <div className="flex items-center gap-2">
        <button onClick={suggest} disabled={suggesting} className={`${btnCls} bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50`}>
          {suggesting ? '✨ AI ieško…' : '✨ Pasiūlyti dainas'}
        </button>
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>

      {candidates && (
        <div className="mt-3 rounded-xl border border-purple-200 bg-purple-50/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold text-purple-800">AI PASIŪLYMAI ({candidates.length}) — pažymėk tinkamas</span>
            <button onClick={approvePicked} disabled={picked.size === 0} className={`${btnCls} bg-green-600 text-white hover:bg-green-700 disabled:opacity-50`}>
              Pridėti pažymėtas ({picked.size})
            </button>
          </div>
          {candidates.length === 0 ? <p className="text-sm text-[var(--text-muted)]">AI nerado tinkamų kandidatų. Pabandyk pridėti rankiniu būdu.</p> : (
            <div className="space-y-1 max-h-96 overflow-auto">
              {candidates.map((c) => {
                const on = picked.has(c.track_id)
                return (
                  <label key={c.track_id} className="flex items-center gap-2 rounded-lg bg-[var(--bg-surface)] px-2 py-1.5 border border-[var(--border-default)] cursor-pointer">
                    <input type="checkbox" checked={on} onChange={() => setPicked((p) => { const n = new Set(p); on ? n.delete(c.track_id) : n.add(c.track_id); return n })} />
                    {c.cover_url ? <img src={c.cover_url} alt="" className="w-8 h-8 rounded object-cover" referrerPolicy="no-referrer" /> : <div className="w-8 h-8 rounded bg-gray-200" />}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-[var(--text-primary)] truncate">{c.title}</div>
                      <div className="text-xs text-[var(--text-muted)] truncate">{c.artist_name}{c.country ? ` · ${c.country}` : ''}{c.video_views ? ` · ${c.video_views.toLocaleString('lt-LT')} perž.` : ''}</div>
                    </div>
                    {typeof c.relevance === 'number' && <span className="text-xs text-purple-700">{Math.round(c.relevance * 100)}%</span>}
                  </label>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
