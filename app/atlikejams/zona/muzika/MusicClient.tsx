'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { youtubeId } from '@/lib/social-embed'

type Song = {
  id: number; title: string; slug: string | null; video_url: string | null
  video_uploaded_at: string | null; video_views: number | null
  is_pinned: boolean; is_legacy: boolean
  year: number | null; month: number | null; day: number | null
}
type Album = {
  id: number; slug: string; title: string
  year: number | null; month: number | null; day: number | null
  cover_image_url: string | null; description: string | null
  is_legacy: boolean; is_upcoming: boolean; type: string; trackIds: number[]
}
type Artist = { id: number; slug: string; name: string }

const ALBUM_TYPE_OPTS: [string, string][] = [
  ['studio', 'Albumas'], ['ep', 'EP'], ['single', 'Singlas'], ['live', 'Koncertinis'],
  ['compilation', 'Rinktinė'], ['remix', 'Remiksai'], ['covers', 'Perdainavimai'],
  ['soundtrack', 'Garso takelis'], ['holiday', 'Šventinis'], ['demo', 'Demo'],
]
const TYPE_LABEL: Record<string, string> = Object.fromEntries(ALBUM_TYPE_OPTS)

const I = {
  back: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>,
  ext: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M7 7h10v10" /></svg>,
  plus: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>,
  pin: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5M9 10.76V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v5.76l1.5 2.24h-9z" /></svg>,
  edit: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>,
  trash: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>,
  close: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>,
  up: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6" /></svg>,
  down: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>,
}

function thumb(url: string | null) { const v = url ? youtubeId(url) : null; return v ? `https://i.ytimg.com/vi/${v}/mqdefault.jpg` : null }
function dateLabel(y: number | null, m: number | null, d: number | null) {
  if (!y) return '—'
  if (y && m && d) return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`
  if (y && m) return `${String(m).padStart(2, '0')}.${y}`
  return String(y)
}

export default function MusicClient({ artist, songs, albums }: { artist: Artist; songs: Song[]; albums: Album[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<{ ok: boolean; t: string } | null>(null)
  const [editSong, setEditSong] = useState<number | null>(null)
  const [sDraft, setSDraft] = useState<{ title: string; year: string; month: string; day: string }>({ title: '', year: '', month: '', day: '' })
  const [albumOpen, setAlbumOpen] = useState(false)
  const [editAlbum, setEditAlbum] = useState<Album | null>(null)

  const flash = (ok: boolean, t: string) => { setToast({ ok, t }); setTimeout(() => setToast(null), 3500) }
  async function send(method: string, url: string, body: any) {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return r.json().catch(() => ({}))
  }

  function startEdit(s: Song) {
    setEditSong(s.id)
    setSDraft({ title: s.title, year: s.year ? String(s.year) : '', month: s.month ? String(s.month) : '', day: s.day ? String(s.day) : '' })
  }
  async function saveSong(id: number) {
    setBusy('song' + id)
    const d = await send('PATCH', '/api/studija/track', { artistId: artist.id, trackId: id, title: sDraft.title, year: sDraft.year, month: sDraft.month, day: sDraft.day })
    setBusy(null)
    if (d.ok) { setEditSong(null); flash(true, 'Išsaugota ✓'); router.refresh() } else flash(false, d.error || 'Nepavyko')
  }
  async function deleteSong(s: Song) {
    if (!confirm(`Ištrinti dainą „${s.title}"? Šio veiksmo atšaukti negalėsi.`)) return
    setBusy('song' + s.id)
    const d = await send('DELETE', '/api/studija/track', { artistId: artist.id, trackId: s.id })
    setBusy(null)
    if (d.ok) { flash(true, 'Ištrinta'); router.refresh() } else flash(false, d.error || 'Nepavyko')
  }
  async function togglePin(s: Song) {
    await send('POST', '/api/studija/pin', { artistId: artist.id, trackId: s.id, pinned: !s.is_pinned }); router.refresh()
  }
  async function deleteAlbum(a: Album) {
    if (!confirm(`Ištrinti albumą „${a.title}"? Dainos liks, tik nebebus priskirtos.`)) return
    setBusy('alb' + a.id)
    const d = await send('DELETE', '/api/studija/album', { artistId: artist.id, albumId: a.id })
    setBusy(null)
    if (d.ok) { flash(true, 'Albumas ištrintas'); router.refresh() } else flash(false, d.error || 'Nepavyko')
  }

  const card = 'rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]'
  const gt = 'mt-7 mb-3 flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-wider text-[var(--text-faint)] font-[Outfit,sans-serif]'
  const inp = 'w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]'

  return (
    <div>
      {/* HEADER */}
      <div className="flex flex-wrap items-center gap-3">
        <a href={`/atlikejams/zona?a=${artist.id}`} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">{I.back}</a>
        <div>
          <h1 className="font-[Outfit,sans-serif] text-2xl font-extrabold text-[var(--text-primary)]">Visa muzika</h1>
          <a href={`/atlikejai/${artist.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12.5px] text-[var(--accent-link)]">{artist.name} — vieša anketa {I.ext}</a>
        </div>
      </div>

      {/* DAINOS */}
      <div className={gt}>Dainos <span className="ml-2 normal-case tracking-normal font-medium text-[11px] text-[var(--text-muted)]">— {songs.length}</span></div>
      {songs.length === 0 && <p className="text-sm text-[var(--text-muted)]">Dar nėra dainų. Pridėk iš YouTube savo zonos pagrindiniame puslapyje.</p>}
      <div className="space-y-2">
        {songs.map((s) => (
          <div key={s.id} className={`rounded-xl border p-2.5 ${s.is_pinned ? 'border-[rgba(249,115,22,0.35)] bg-[rgba(249,115,22,0.05)]' : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]'}`}>
            {editSong === s.id ? (
              <div className="flex flex-col gap-2.5">
                <input value={sDraft.title} onChange={(e) => setSDraft({ ...sDraft, title: e.target.value })} placeholder="Pavadinimas" className={inp} />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-[var(--text-muted)]">Išleista:</span>
                  <input value={sDraft.year} onChange={(e) => setSDraft({ ...sDraft, year: e.target.value.replace(/\D/g, '').slice(0, 4) })} placeholder="metai" className={`${inp} w-20`} />
                  <input value={sDraft.month} onChange={(e) => setSDraft({ ...sDraft, month: e.target.value.replace(/\D/g, '').slice(0, 2) })} placeholder="mėn" className={`${inp} w-16`} />
                  <input value={sDraft.day} onChange={(e) => setSDraft({ ...sDraft, day: e.target.value.replace(/\D/g, '').slice(0, 2) })} placeholder="d" className={`${inp} w-14`} />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => saveSong(s.id)} disabled={busy === 'song' + s.id} className="rounded-lg bg-[var(--accent-orange)] px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{busy === 'song' + s.id ? '…' : 'Išsaugoti'}</button>
                  <button onClick={() => setEditSong(null)} className="rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)]">Atšaukti</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button onClick={() => togglePin(s)} title={s.is_pinned ? 'Atsegti' : 'Prisegti viršuje'} className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${s.is_pinned ? 'text-[var(--accent-orange)]' : 'text-[var(--text-muted)] bg-[var(--bg-hover)]'}`}>{I.pin}</button>
                <div className="h-[34px] w-[54px] shrink-0 overflow-hidden rounded-md bg-[var(--bg-surface)]">{thumb(s.video_url) ? <img src={thumb(s.video_url)!} alt="" className="h-full w-full object-cover" /> : null}</div>
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-[13px] font-semibold text-[var(--text-primary)]">{s.title}</b>
                  <small className="text-[10.5px] text-[var(--text-muted)]">{s.is_pinned ? 'Prisegta · ' : ''}Išleista: {dateLabel(s.year, s.month, s.day)}{s.is_legacy ? ' · iš senojo music.lt' : ''}</small>
                </div>
                <button onClick={() => startEdit(s)} title="Redaguoti" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">{I.edit}</button>
                {s.is_legacy
                  ? <span title="Importuotų dainų trinti negalima" className="grid h-8 w-8 shrink-0 cursor-not-allowed place-items-center rounded-lg border border-[var(--border-subtle)] text-[var(--text-faint)] opacity-50">{I.trash}</span>
                  : <button onClick={() => deleteSong(s)} disabled={busy === 'song' + s.id} title="Ištrinti" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--border-default)] text-[var(--text-muted)] hover:border-[var(--accent-red)] hover:text-[var(--accent-red)]">{I.trash}</button>}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ALBUMAI */}
      <div className={gt}>Albumai ir leidiniai <span className="ml-2 normal-case tracking-normal font-medium text-[11px] text-[var(--text-muted)]">— {albums.length}</span>
        <button onClick={() => { setEditAlbum(null); setAlbumOpen(true) }} className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-orange)] px-3.5 py-1.5 text-[12px] font-bold normal-case tracking-normal text-white font-[Outfit,sans-serif]">{I.plus} Pridėti albumą</button>
      </div>
      {albums.length === 0 && <p className="text-sm text-[var(--text-muted)]">Dar nėra albumų. Sukurk pirmą ir priskirk jam dainų.</p>}
      <div className="grid gap-2.5 sm:grid-cols-2">
        {albums.map((a) => (
          <div key={a.id} className={`${card} flex items-center gap-3 p-2.5`}>
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[var(--bg-surface)]">{a.cover_image_url ? <img src={a.cover_image_url} alt="" className="h-full w-full object-cover" /> : null}</div>
            <div className="min-w-0 flex-1">
              <b className="block truncate text-[13.5px] font-bold text-[var(--text-primary)]">{a.title}</b>
              <small className="text-[11px] text-[var(--text-muted)]">{TYPE_LABEL[a.type] || 'Albumas'} · {a.year || '—'} · {a.trackIds.length} dain.{a.is_upcoming ? ' · greitai' : ''}{a.is_legacy ? ' · importuotas' : ''}</small>
            </div>
            <button onClick={() => { setEditAlbum(a); setAlbumOpen(true) }} title="Redaguoti" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">{I.edit}</button>
            {a.is_legacy
              ? <span title="Importuotų albumų trinti negalima" className="grid h-8 w-8 shrink-0 cursor-not-allowed place-items-center rounded-lg border border-[var(--border-subtle)] text-[var(--text-faint)] opacity-50">{I.trash}</span>
              : <button onClick={() => deleteAlbum(a)} disabled={busy === 'alb' + a.id} title="Ištrinti" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--border-default)] text-[var(--text-muted)] hover:border-[var(--accent-red)] hover:text-[var(--accent-red)]">{I.trash}</button>}
          </div>
        ))}
      </div>

      {albumOpen && <AlbumEditor artist={artist} songs={songs} album={editAlbum} onClose={() => setAlbumOpen(false)} onSaved={(msg) => { setAlbumOpen(false); flash(true, msg); router.refresh() }} onError={(m) => flash(false, m)} />}

      {toast && <div className={`fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-lg ${toast.ok ? 'bg-[var(--accent-green)]' : 'bg-[var(--accent-red)]'}`}>{toast.t}</div>}
    </div>
  )
}

function AlbumEditor({ artist, songs, album, onClose, onSaved, onError }: {
  artist: Artist; songs: Song[]; album: Album | null
  onClose: () => void; onSaved: (msg: string) => void; onError: (msg: string) => void
}) {
  const [title, setTitle] = useState(album?.title || '')
  const [type, setType] = useState(album?.type || 'studio')
  const [year, setYear] = useState(album?.year ? String(album.year) : '')
  const [month, setMonth] = useState(album?.month ? String(album.month) : '')
  const [cover, setCover] = useState(album?.cover_image_url || '')
  const [description, setDescription] = useState(album?.description || '')
  const [upcoming, setUpcoming] = useState(!!album?.is_upcoming)
  const [selected, setSelected] = useState<number[]>(album?.trackIds || [])
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)

  const inp = 'w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]'
  const byId = new Map(songs.map((s) => [s.id, s]))

  function toggle(id: number) {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }
  function move(idx: number, dir: -1 | 1) {
    setSelected((prev) => {
      const next = [...prev]; const j = idx + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[idx], next[j]] = [next[j], next[idx]]; return next
    })
  }
  async function uploadCover(file: File) {
    setUploading(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const r = await fetch('/api/upload', { method: 'POST', body: fd })
      const d = await r.json()
      if (d.url) setCover(d.url); else onError(d.error || 'Nepavyko įkelti')
    } catch { onError('Nepavyko įkelti') } finally { setUploading(false) }
  }
  async function save() {
    if (!title.trim()) { onError('Įrašyk pavadinimą'); return }
    setBusy(true)
    const body: any = { artistId: artist.id, title, type, year, month, cover_image_url: cover, description, is_upcoming: upcoming, trackIds: selected }
    let r
    if (album) { body.albumId = album.id; r = await fetch('/api/studija/album', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }
    else r = await fetch('/api/studija/album', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (d.ok) onSaved(album ? 'Albumas atnaujintas ✓' : 'Albumas sukurtas ✓'); else onError(d.error || 'Nepavyko')
  }

  const selectedSet = new Set(selected)
  const unselected = songs.filter((s) => !selectedSet.has(s.id))

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center" onClick={onClose}>
      <div className="my-auto w-full max-w-2xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center">
          <h3 className="font-[Outfit,sans-serif] text-lg font-extrabold text-[var(--text-primary)]">{album ? 'Redaguoti albumą' : 'Naujas albumas'}</h3>
          <button onClick={onClose} className="ml-auto grid h-8 w-8 place-items-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">{I.close}</button>
        </div>

        <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
          {/* COVER */}
          <div>
            <div className="aspect-square w-full overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)]">{cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-[10px] text-[var(--text-faint)]">nėra viršelio</span>}</div>
            <label className="mt-2 block cursor-pointer rounded-lg border border-[var(--border-default)] py-1.5 text-center text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              {uploading ? 'Keliama…' : 'Įkelti viršelį'}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCover(f) }} />
            </label>
            <input value={cover} onChange={(e) => setCover(e.target.value)} placeholder="arba URL…" className={`${inp} mt-1.5 text-[11px]`} />
          </div>

          <div className="space-y-2.5">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Albumo pavadinimas" className={inp} />
            <div className="flex flex-wrap gap-2">
              <select value={type} onChange={(e) => setType(e.target.value)} className={`${inp} flex-1`}>
                {ALBUM_TYPE_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <input value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="metai" className={`${inp} w-24`} />
              <input value={month} onChange={(e) => setMonth(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="mėn" className={`${inp} w-20`} />
            </div>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Aprašymas (nebūtina)" rows={2} className={`${inp} resize-none`} />
            <label className="flex items-center gap-2 text-[12.5px] text-[var(--text-secondary)]"><input type="checkbox" checked={upcoming} onChange={(e) => setUpcoming(e.target.checked)} /> Dar neišleistas (greitai)</label>
          </div>
        </div>

        {/* TRACK PICKER */}
        <div className="mt-4">
          <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[var(--text-faint)] font-[Outfit,sans-serif]">Dainos albume ({selected.length})</div>
          {selected.length > 0 && (
            <div className="mb-2 space-y-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2">
              {selected.map((id, idx) => { const s = byId.get(id); if (!s) return null; return (
                <div key={id} className="flex items-center gap-2 text-[12.5px]">
                  <span className="w-5 shrink-0 text-right text-[var(--text-faint)]">{idx + 1}.</span>
                  <span className="min-w-0 flex-1 truncate text-[var(--text-primary)]">{s.title}</span>
                  <button onClick={() => move(idx, -1)} disabled={idx === 0} className="grid h-6 w-6 place-items-center rounded text-[var(--text-muted)] disabled:opacity-30 hover:text-[var(--text-primary)]">{I.up}</button>
                  <button onClick={() => move(idx, 1)} disabled={idx === selected.length - 1} className="grid h-6 w-6 place-items-center rounded text-[var(--text-muted)] disabled:opacity-30 hover:text-[var(--text-primary)]">{I.down}</button>
                  <button onClick={() => toggle(id)} className="grid h-6 w-6 place-items-center rounded text-[var(--text-muted)] hover:text-[var(--accent-red)]">{I.close}</button>
                </div>
              )})}
            </div>
          )}
          {unselected.length > 0 && (
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-dashed border-[var(--border-default)] p-2">
              {unselected.map((s) => (
                <button key={s.id} onClick={() => toggle(s.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-[12.5px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">
                  <span className="text-[var(--accent-orange)]">{I.plus}</span><span className="min-w-0 flex-1 truncate">{s.title}</span>
                  <span className="shrink-0 text-[10px] text-[var(--text-faint)]">{dateLabel(s.year, s.month, s.day)}</span>
                </button>
              ))}
            </div>
          )}
          {songs.length === 0 && <p className="text-[12px] text-[var(--text-muted)]">Dar nėra dainų, kurias galima priskirti.</p>}
        </div>

        <div className="mt-5 flex gap-2">
          <button onClick={save} disabled={busy} className="rounded-lg bg-[var(--accent-orange)] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">{busy ? '…' : album ? 'Išsaugoti' : 'Sukurti albumą'}</button>
          <button onClick={onClose} className="rounded-lg border border-[var(--border-default)] px-5 py-2.5 text-sm font-semibold text-[var(--text-secondary)]">Atšaukti</button>
        </div>
      </div>
    </div>
  )
}
