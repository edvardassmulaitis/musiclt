'use client'
/**
 * AdminQuickAdd — „greitas pridėjimas" su patvirtinimo žingsniu.
 *
 *   1) Įmeti nuorodą → „Peržiūrėti": parsina (YouTube → daina, Wikipedia → albumas),
 *      NIEKO nesukuria, parodo aptiktus laukus.
 *   2) Pataisai jei reikia → „Sukurti": commit'ina.
 *
 * Atlikėjas ir featuring laukai — DB pickeriai: rodo konkretų katalogo atlikėją
 * (su badge'u) arba leidžia įvesti naują vardą, jei kataloge nėra.
 *
 * EILĖ (2026-07-16): kiekviena nuoroda tampa NEPRIKLAUSOMU elementu sąraše —
 * paspaudus „Peržiūrėti" URL laukas iškart išsivalo ir laukia SEKANČIOS
 * nuorodos, kol pirmoji dar tikrinasi/redaguojama/kuriasi fone. Anksčiau visa
 * forma buvo viena bendra būsena — negalėjai pradėti kitos dainos, kol
 * pirmoji nesibaigė (Edvardo pastaba: per ilgai reikėdavo laukti prie modalo).
 *
 * Albumo pasiūlymas (MusicBrainz/Apple Music, žr. lib/album-lookup.ts) irgi
 * NEBEsulaiko preview'o — užkraunamas ASINCHRONIŠKAI atskiru kvietimu iš karto
 * po greito preview'o ir „įkrenta" į kortelę, kai gatavas.
 */
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

function detectKind(url: string): 'track' | 'album' | 'unknown' {
  const u = (url || '').trim().toLowerCase()
  if (!u) return 'unknown'
  if (/youtube\.com|youtu\.be/.test(u)) return 'track'
  if (/wikipedia\.org\/wiki\//.test(u)) return 'album'
  return 'unknown'
}

type Phase = 'previewing' | 'editing' | 'committing' | 'done' | 'error'
type SuggestionState = 'idle' | 'loading' | 'done'

/** Atlikėjas formoje — id != null reiškia konkretų katalogo įrašą. */
type ArtistRef = { id: number | null; name: string }
type ArtistHit = { id: number; name: string; slug: string | null; country?: string | null; cover_image_url?: string | null }

type QueueItem = {
  id: number
  url: string
  kind: 'track' | 'album' | 'unknown'
  phase: Phase
  error: string | null
  preview: any
  form: any
  result: any
  suggestionState: SuggestionState
  albumBg?: 'pending' | 'done' | 'error' | null
}

let _seq = 0

export default function AdminQuickAdd({ bare = false, initialUrl }: { bare?: boolean; initialUrl?: string } = {}) {
  const [url, setUrl] = useState('')
  const [items, setItems] = useState<QueueItem[]>([])

  // Iš „Dainos" (topų/discovery) atidarytas su prakištu URL — iškart pradedam
  // preview'ą tuo pačiu kontroliuojamu flow'u (album check ir t.t.).
  useEffect(() => {
    if (initialUrl) startUrl(initialUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUrl])

  const kind = detectKind(url)

  function patchItem(id: number, patch: Partial<QueueItem> | ((it: QueueItem) => Partial<QueueItem>)) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...(typeof patch === 'function' ? patch(it) : patch) } : it)))
  }
  function setItemForm(id: number, updater: any) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, form: typeof updater === 'function' ? updater(it.form) : updater } : it)))
  }
  function removeItem(id: number) {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }

  /** Pradeda naują eilės elementą IR IŠKART išvalo URL lauką — kita nuoroda
   *  gali būti įvesta nedelsiant, nepriklausomai nuo šito preview progreso. */
  function startUrl(u: string) {
    const trimmed = (u || '').trim()
    const k = detectKind(trimmed)
    if (!trimmed || k === 'unknown') return
    const id = ++_seq
    const item: QueueItem = {
      id, url: trimmed, kind: k, phase: 'previewing', error: null,
      preview: null, form: {}, result: null, suggestionState: 'idle',
    }
    setItems((prev) => [item, ...prev])
    runPreview(id, trimmed)
  }
  function submit() {
    startUrl(url)
    setUrl('')
  }

  async function runPreview(id: number, previewUrl: string) {
    try {
      const res = await fetch('/api/admin/quick-add', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: previewUrl, mode: 'preview' }),
      })
      const json = await res.json().catch(() => null)
      if (!json) { patchItem(id, { error: 'Serveris negrąžino atsakymo', phase: 'error' }); return }
      if (!json.ok) { patchItem(id, { error: json.error || 'Nepavyko', phase: 'error' }); return }
      const p = json.preview
      const form = p.kind === 'track'
        ? {
            title: p.title,
            artist: { id: p.artist_id ?? null, name: p.artist_name } as ArtistRef,
            featuring: (p.featuring_resolved && p.featuring_resolved.length
              ? p.featuring_resolved
              : (p.featuring || []).map((n: string) => ({ name: n, id: null }))
            ).map((f: any) => ({ id: f.id ?? null, name: f.name })) as ArtistRef[],
            release_year: p.release_year ?? '', release_month: p.release_month ?? '', release_day: p.release_day ?? '',
            create_album: false,
            is_single: false,
          }
        : {
            artist: { id: p.artist_id ?? null, name: p.artist_name } as ArtistRef,
            album_title: p.album_title, year: p.year ?? '',
          }
      patchItem(id, { preview: p, form, phase: 'editing' })
      if (p.kind === 'track') fetchSuggestion(id, form.artist.name, p.title)
    } catch (e: any) {
      patchItem(id, { error: String(e?.message || e), phase: 'error' })
    }
  }

  /** Async, nekliudo redaguoti/commit'inti kol laukiama — badge'as tiesiog
   *  atsiranda pačioje kortelėje, kai atsakymas grįžta. */
  async function fetchSuggestion(id: number, artistName: string, title: string) {
    if (!artistName?.trim() || !title?.trim()) return
    patchItem(id, { suggestionState: 'loading' })
    try {
      const res = await fetch('/api/admin/quick-add/album-suggestion', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artist_name: artistName, title }),
      })
      const json = await res.json().catch(() => null)
      patchItem(id, (it) => ({
        suggestionState: 'done',
        preview: { ...it.preview, suggested_album: json?.suggestion ?? null },
        form: {
          ...it.form,
          create_album: json?.suggestion?.confidence === 'high',
          is_single: !!json?.is_single,
        },
      }))
    } catch {
      patchItem(id, { suggestionState: 'done' })
    }
  }

  async function doCommit(id: number) {
    const item = items.find((it) => it.id === id)
    if (!item || item.phase === 'committing') return
    patchItem(id, { phase: 'committing', error: null })
    const num = (v: any) => (v === '' || v == null ? null : Number(v))
    const artist: ArtistRef = item.form.artist || { id: null, name: '' }
    // Albumas — tik ĮSIMENAM ketinimą; NEBEKURIAM inline (per lėta mobile'e:
    // iki 30 throttled MB single-check kvietimų ~30s, nulūžta perėjus kitur).
    // Daina commit'inama greitai, albumas paleidžiamas fone po sėkmės (žr. žemiau).
    const wantAlbum = item.preview.kind === 'track'
      && !!item.form.create_album
      && item.preview.suggested_album?.source === 'musicbrainz'
      && !!item.preview.suggested_album?.mb_release_id
    const albumMbId: string | null = item.preview.suggested_album?.mb_release_id ?? null
    const overrides = item.preview.kind === 'track'
      ? {
          title: item.form.title?.trim(),
          artist_name: artist.name?.trim(),
          artist_id: artist.id ?? null,
          featuring: (item.form.featuring || []).map((f: ArtistRef) => f.name.trim()).filter(Boolean),
          release_year: num(item.form.release_year), release_month: num(item.form.release_month), release_day: num(item.form.release_day),
          create_album: false, // fone, atskiru kvietimu
          album_mb_release_id: albumMbId,
          is_single: !!item.form.is_single,
        }
      : {
          artist_name: artist.name?.trim(),
          artist_id: artist.id ?? null,
          album_title: item.form.album_title?.trim(),
          year: num(item.form.year),
        }
    try {
      const res = await fetch('/api/admin/quick-add', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // keepalive: requestas išgyvena modalo užsidarymą / navigaciją mobile'e.
        keepalive: true,
        body: JSON.stringify({ url: item.preview.url, mode: 'commit', overrides }),
      })
      const json = await res.json().catch(() => null)
      if (!json) { patchItem(id, { error: 'Serveris negrąžino atsakymo', phase: 'editing' }); return }
      if (!json.ok) { patchItem(id, { error: json.error || 'Nepavyko', phase: 'editing' }); return }
      const trackId = json?.track?.id ?? null
      const artistId = json?.artist?.id ?? null
      patchItem(id, { result: json, phase: 'done', albumBg: wantAlbum ? 'pending' : null })
      // Praneša išorei (pvz. „Dainos" sąrašui), kad daina sukurta — kad susietų
      // su topais ir pašalintų eilutę. video_id — patikimam sutapimui.
      try {
        window.dispatchEvent(new CustomEvent('musiclt:quickadd-committed', {
          detail: { url: item.preview?.url ?? item.url, videoId: json?.detail?.video_id ?? null, result: json },
        }))
      } catch { /* noop */ }
      // Albumas FONE — non-blocking, keepalive (išgyvena navigaciją). Nelaukiam:
      // admin jau priėmė dainą ir gali eiti prie kitos; badge įkrenta kai gatava.
      if (wantAlbum && albumMbId && trackId && artistId) {
        fetch('/api/admin/quick-add/album', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
          body: JSON.stringify({ album_mb_release_id: albumMbId, artist_id: artistId, track_id: trackId, title: overrides.title }),
        })
          .then((r) => r.json().catch(() => null))
          .then((aj) => patchItem(id, { albumBg: aj?.ok ? 'done' : 'error' }))
          .catch(() => patchItem(id, { albumBg: 'error' }))
      }
    } catch (e: any) {
      patchItem(id, { error: String(e?.message || e), phase: 'editing' })
    }
  }

  const hint =
    kind === 'track' ? '🎵 Daina iš YouTube'
    : kind === 'album' ? '💿 Albumas iš Wikipedia'
    : url.trim() ? '❓ Nepalaikoma nuoroda'
    : 'YouTube → daina · Wikipedia albumas → albumas'

  const content = (
    <>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-lg">⚡</span>
        <h2 className="font-['Outfit',sans-serif] text-sm font-extrabold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
          Greitas pridėjimas
        </h2>
        <span className="text-[14px] text-[var(--text-faint)]">— {hint}</span>
      </div>

      {/* URL įvestis — VISADA aktyvi, nepriklausomai nuo eilėje esančių elementų */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="url" inputMode="url" value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          placeholder="Įmesk YouTube arba Wikipedia albumo nuorodą…"
          className="min-h-[44px] flex-1 rounded-lg border border-[var(--input-border)] bg-[var(--bg-elevated)] px-3 text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:border-[var(--border-strong)] focus:outline-none"
        />
        <button
          onClick={submit}
          disabled={kind === 'unknown'}
          className="min-h-[44px] shrink-0 rounded-lg bg-music-blue px-5 font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Peržiūrėti
        </button>
      </div>

      {/* Eilė — naujausias viršuje, kiekvienas nepriklausomas nuo kitų */}
      <div className="mt-3 flex flex-col gap-3">
        {items.map((item) => (
          <QueueCard
            key={item.id} item={item}
            setForm={(updater: any) => setItemForm(item.id, updater)}
            onCommit={() => doCommit(item.id)}
            onDismiss={() => removeItem(item.id)}
          />
        ))}
      </div>
    </>
  )

  if (bare) return content
  return (
    <div className="rounded-xl border border-[var(--input-border)] bg-[var(--bg-surface)] p-4">
      {content}
    </div>
  )
}

/** Vienas eilės elementas — savo phase/preview/form/result, nepriklauso nuo
 *  kitų kortelių. Leidžia turėti kelias dainas „skrydyje" vienu metu. */
function QueueCard({ item, setForm, onCommit, onDismiss }: { item: QueueItem; setForm: any; onCommit: () => void; onDismiss: () => void }) {
  const icon = item.kind === 'album' ? '💿' : '🎵'
  const shortUrl = item.url.length > 52 ? item.url.slice(0, 49) + '…' : item.url

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[14px] text-[var(--text-faint)]">{icon} {shortUrl}</span>
        {(item.phase === 'done' || item.phase === 'error') && (
          <button onClick={onDismiss} className="ml-auto text-[14px] text-[var(--text-faint)] hover:text-[var(--text-secondary)]" aria-label="Uždaryti">✕</button>
        )}
      </div>

      {item.phase === 'previewing' && (
        <p className="text-[14px] text-[var(--text-muted)]">
          {item.kind === 'album' ? 'Parsinu Wikipedia albumą…' : 'Tikrinu YouTube video…'}
        </p>
      )}

      {item.phase === 'error' && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[14px] text-red-700">{item.error}</div>
      )}

      {(item.phase === 'editing' || item.phase === 'committing') && item.preview && (
        <>
          {item.error && (
            <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[14px] text-red-700">{item.error}</div>
          )}
          <EditForm
            preview={item.preview} form={item.form} setForm={setForm}
            suggestionLoading={item.suggestionState === 'loading'}
            committing={item.phase === 'committing'}
            onCommit={onCommit} onCancel={onDismiss}
          />
        </>
      )}

      {item.phase === 'done' && item.result?.ok && <ResultCard result={item.result} />}

      {item.phase === 'done' && item.albumBg && (
        <p className={`mt-1.5 text-[13px] ${item.albumBg === 'error' ? 'text-amber-600' : 'text-[var(--text-muted)]'}`}>
          {item.albumBg === 'pending' && '💿 Albumas kuriamas fone… (gali eiti prie kitos dainos)'}
          {item.albumBg === 'done' && '💿 Albumas pridėtas.'}
          {item.albumBg === 'error' && '💿 Albumo fone sukurti nepavyko — daina išsaugota, albumą gali pridėti vėliau.'}
        </p>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[14px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
      {children}
    </label>
  )
}

/** Kaip Field, bet <div> (ne <label>) — pickeriams su mygtukais viduje
 *  (label perimtų click'us į savo input'ą ir laužytų dropdown/chip mygtukus). */
function FieldBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[14px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
      {children}
    </div>
  )
}

// text-[16px]: mažiau nei 16px iOS'e sukelia auto-zoom fokusuojant input'ą.
const inputCls = 'min-h-[40px] rounded-lg border border-[var(--input-border)] bg-[var(--bg-elevated)] px-3 text-[16px] text-[var(--text-primary)] focus:border-[var(--border-strong)] focus:outline-none'

// ────────────────────────────────────────────────────────────────────────────
// Atlikėjų paieška (debounced) — bendras hook pickeriams
// ────────────────────────────────────────────────────────────────────────────

function useArtistSearch(query: string) {
  const [hits, setHits] = useState<ArtistHit[]>([])
  const [loading, setLoading] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setHits([]); setLoading(false); return }
    const mine = ++seq.current
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/artists/search?q=${encodeURIComponent(q)}`)
        const json = await res.json().catch(() => null)
        if (mine !== seq.current) return // pasenęs atsakymas
        setHits(json?.results || [])
      } catch {
        if (mine === seq.current) setHits([])
      } finally {
        if (mine === seq.current) setLoading(false)
      }
    }, 220)
    return () => clearTimeout(t)
  }, [query])

  return { hits, loading }
}

/** Vieno atlikėjo pickeris. Pasirinkus katalogo atlikėją — rodo jį kaip
 *  „selected" eilutę (kaip dainos edit page'e), ne text input + ID badge. */
function ArtistPicker({ value, onChange }: { value: ArtistRef; onChange: (v: ArtistRef) => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const { hits, loading } = useArtistSearch(text)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = value.id != null

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  function pick(h: ArtistHit) {
    onChange({ id: h.id, name: h.name }); setText(''); setOpen(false)
  }
  function clear() {
    onChange({ id: null, name: '' }); setText(''); setOpen(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  // Pasirinktas katalogo atlikėjas — kompaktiška „selected" eilutė
  if (selected) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-[var(--input-border)] bg-[var(--bg-elevated)] px-3 py-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-[14px] text-green-700">✓</span>
        <span className="truncate text-[14px] font-medium text-[var(--text-primary)]">{value.name}</span>
        <button type="button" onClick={clear} className="ml-auto shrink-0 text-[14px] font-medium text-music-blue hover:underline">
          keisti
        </button>
      </div>
    )
  }

  // Naujas / dar nepasirinktas — paieškos input
  return (
    <div ref={boxRef} className="relative">
      <input
        ref={inputRef}
        className={`${inputCls} w-full`}
        value={value.name}
        onChange={(e) => { const v = e.target.value; setText(v); onChange({ id: null, name: v }); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Ieškok kataloge arba įvesk naują…"
      />
      {value.name.trim() && <p className="mt-1 text-[14px] text-orange-600">Naujas atlikėjas — bus sukurtas</p>}
      {open && value.name.trim().length >= 2 && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-lg">
          {loading && <div className="px-3 py-2 text-[14px] text-[var(--text-muted)]">Ieškoma…</div>}
          {hits.map((h) => (
            <button
              key={h.id} type="button" onClick={() => pick(h)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[14px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
            >
              <span className="font-medium">{h.name}</span>
              {h.country && <span className="text-[14px] text-[var(--text-faint)]">{h.country}</span>}
            </button>
          ))}
          {!loading && hits.length === 0 && (
            <div className="px-3 py-2 text-[14px] text-[var(--text-muted)]">Kataloge nerasta — bus sukurtas naujas.</div>
          )}
        </div>
      )}
    </div>
  )
}

/** Featuring pickeris — chip'ai + DB paieška, leidžia naują tik aiškiai pridėjus. */
function FeaturingPicker({ value, onChange }: { value: ArtistRef[]; onChange: (v: ArtistRef[]) => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const { hits, loading } = useArtistSearch(text)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const hasName = (n: string) => value.some((v) => v.name.trim().toLowerCase() === n.trim().toLowerCase())

  function add(ref: ArtistRef) {
    if (!ref.name.trim() || hasName(ref.name)) { setText(''); return }
    onChange([...value, ref]); setText(''); setOpen(false)
  }
  function remove(i: number) { onChange(value.filter((_, idx) => idx !== i)) }

  const exactHit = hits.find((h) => h.name.trim().toLowerCase() === text.trim().toLowerCase())

  return (
    <div ref={boxRef} className="relative">
      {value.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {value.map((f, i) => (
            <span
              key={`${f.name}-${i}`}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[14px] ${
                f.id != null
                  ? 'border-green-200 bg-green-100 text-green-700'
                  : 'border-orange-200 bg-orange-100 text-orange-700'
              }`}
            >
              {f.name}{f.id == null && ' (naujas)'}
              <button type="button" onClick={() => remove(i)} className="ml-0.5 text-current/70 hover:text-current" aria-label="Pašalinti">×</button>
            </span>
          ))}
        </div>
      )}
      <input
        className={`${inputCls} w-full`}
        value={text}
        onChange={(e) => { setText(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (exactHit) add({ id: exactHit.id, name: exactHit.name })
            else if (text.trim()) add({ id: null, name: text.trim() })
          }
        }}
        placeholder=""
      />
      {open && text.trim().length >= 2 && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-lg">
          {loading && <div className="px-3 py-2 text-[14px] text-[var(--text-muted)]">Ieškoma…</div>}
          {hits.map((h) => (
            <button
              key={h.id} type="button" onClick={() => add({ id: h.id, name: h.name })}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[14px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
            >
              <span className="font-medium">{h.name}</span>
              {h.country && <span className="text-[14px] text-[var(--text-faint)]">{h.country}</span>}
            </button>
          ))}
          {!loading && !exactHit && text.trim() && (
            <button
              type="button" onClick={() => add({ id: null, name: text.trim() })}
              className="flex w-full items-center gap-2 border-t border-[var(--border-subtle)] px-3 py-2 text-left text-[14px] text-orange-700 hover:bg-[var(--bg-hover)]"
            >
              + Pridėti naują „{text.trim()}"
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function EditForm({ preview, form, setForm, committing, suggestionLoading, onCommit, onCancel }: any) {
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))
  const isTrack = preview.kind === 'track'
  const artist: ArtistRef = form.artist || { id: null, name: '' }

  return (
    <div className="mt-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[14px] text-[var(--text-muted)]">
        <span>{isTrack ? '🎵 Daina' : '💿 Albumas'}</span>
        {isTrack && preview.views != null && <span>· {Number(preview.views).toLocaleString('lt-LT')} views</span>}
        {isTrack && preview.embeddable === false && <span className="text-orange-600">· embed blokuotas</span>}
        {isTrack && form.is_single && <span className="text-blue-700">· singlas</span>}
        {!isTrack && <span>· {(preview.track_titles || []).length} dainos</span>}
        {!isTrack && <span>· {preview.cover_found ? 'viršelis ✓' : 'be viršelio'}</span>}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {isTrack ? (
          <>
            <Field label="Pavadinimas">
              <input className={inputCls} value={form.title || ''} onChange={(e) => set('title', e.target.value)} />
            </Field>
            <FieldBox label="Atlikėjas">
              <ArtistPicker value={artist} onChange={(v) => set('artist', v)} />
            </FieldBox>
            <FieldBox label="Featuring">
              <FeaturingPicker value={form.featuring || []} onChange={(v) => set('featuring', v)} />
            </FieldBox>
            <Field label="Išleidimo data (M / mėn / d)">
              <div className="flex gap-2">
                <input className={`${inputCls} w-20`} type="number" placeholder="metai" value={form.release_year || ''} onChange={(e) => set('release_year', e.target.value)} />
                <input className={`${inputCls} w-16`} type="number" placeholder="mėn" value={form.release_month || ''} onChange={(e) => set('release_month', e.target.value)} />
                <input className={`${inputCls} w-16`} type="number" placeholder="d" value={form.release_day || ''} onChange={(e) => set('release_day', e.target.value)} />
              </div>
            </Field>
            <div className="sm:col-span-2">
              {suggestionLoading && (
                <p className="text-[14px] text-[var(--text-faint)]">🔍 Tikrinama, ar priklauso albumui (MusicBrainz/Apple Music)…</p>
              )}
              {!suggestionLoading && preview.suggested_album && (
                <AlbumSuggestionBox
                  suggestion={preview.suggested_album}
                  checked={!!form.create_album}
                  onChange={(v: boolean) => set('create_album', v)}
                />
              )}
              {!suggestionLoading && !preview.suggested_album && form.is_single && (
                <p className="text-[14px] text-blue-700">🏷️ Aptikta kaip singlas (be pilno albumo).</p>
              )}
            </div>
          </>
        ) : (
          <>
            <Field label="Albumo pavadinimas">
              <input className={inputCls} value={form.album_title || ''} onChange={(e) => set('album_title', e.target.value)} />
            </Field>
            <FieldBox label="Atlikėjas">
              <ArtistPicker value={artist} onChange={(v) => set('artist', v)} />
            </FieldBox>
            <Field label="Metai">
              <input className={`${inputCls} w-24`} type="number" value={form.year || ''} onChange={(e) => set('year', e.target.value)} />
            </Field>
          </>
        )}
      </div>

      {!isTrack && (preview.track_titles || []).length > 0 && (
        <details className="mt-2 text-[14px] text-[var(--text-muted)]">
          <summary className="cursor-pointer">Tracklist ({preview.track_titles.length})</summary>
          <ol className="mt-1 list-decimal pl-5">
            {preview.track_titles.map((t: string, i: number) => <li key={i}>{t}</li>)}
          </ol>
        </details>
      )}

      <div className="mt-3 flex gap-2">
        <button onClick={onCommit} disabled={committing || !artist.name.trim()}
          className="min-h-[40px] rounded-lg bg-music-blue px-5 font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50">
          {committing ? 'Kuriama…' : 'Sukurti'}
        </button>
        <button onClick={onCancel} disabled={committing}
          className="min-h-[40px] rounded-lg border border-[var(--input-border)] px-4 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50">
          Atšaukti
        </button>
      </div>
    </div>
  )
}

/** Albumo pasiūlymas iš MusicBrainz/Apple Music (žr. lib/album-lookup.ts).
 *  high confidence (MusicBrainz, pilnas tracklist'as) → checkbox su „pridėti
 *  kartu su albumu", pažymėtas iš anksto, leidžia sukurti vienu paspaudimu.
 *  ambiguous (dalinis MB arba Apple) → tik informacinis badge'as, be
 *  auto-create galimybės (Apple tracklist'ai dažnai placeholder'iniai). */
function AlbumSuggestionBox({ suggestion, checked, onChange }: { suggestion: any; checked: boolean; onChange: (v: boolean) => void }) {
  const dateStr = suggestion.year
    ? [suggestion.year, suggestion.month, suggestion.day].filter(Boolean).join('-')
    : null
  const sourceLabel = suggestion.source === 'musicbrainz' ? 'MusicBrainz' : 'Apple Music'
  const canAutoCreate = suggestion.source === 'musicbrainz' && suggestion.confidence === 'high'

  return (
    <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
      {suggestion.cover_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={suggestion.cover_url} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[14px] text-blue-900">
          📀 Galimai priklauso albumui <strong>„{suggestion.title}"</strong>
          {dateStr && <> ({dateStr})</>} · {suggestion.track_count} dainos · {sourceLabel}
          {suggestion.confidence === 'ambiguous' && <span className="text-blue-700"> — nepatvirtinta</span>}
        </p>
        {canAutoCreate ? (
          <label className="mt-1 flex items-center gap-1.5 text-[14px] text-blue-800">
            <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
            Pridėti albumą kartu su daina
          </label>
        ) : (
          <p className="mt-1 text-[14px] text-blue-700">
            {suggestion.source === 'apple_music'
              ? 'Tracklist dar nepatvirtintas (Apple Music placeholder pavadinimai) — albumą reikės pridėti rankiniu būdu vėliau.'
              : 'MusicBrainz tracklist dar dalinis — patikrink rankiniu būdu prieš pridedant.'}
          </p>
        )}
      </div>
    </div>
  )
}

function Chip({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'ok' | 'warn' }) {
  const cls =
    tone === 'ok' ? 'bg-green-100 text-green-700 border-green-200'
    : tone === 'warn' ? 'bg-orange-100 text-orange-700 border-orange-200'
    : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[var(--border-subtle)]'
  return <span className={`rounded-full border px-2 py-0.5 text-[14px] font-medium ${cls}`}>{children}</span>
}

function ResultCard({ result }: { result: any }) {
  const isTrack = result.kind === 'track'
  const entityHref = isTrack ? `/admin/tracks/${result.track.id}` : `/admin/albums/${result.album.id}`
  const entityTitle = isTrack ? result.track.title : result.album.title
  const warnings: string[] = result.warnings || []

  return (
    <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base">{isTrack ? '🎵' : '💿'}</span>
        <Link href={entityHref} className="font-semibold text-music-blue hover:underline">{entityTitle}</Link>
        <span className="text-[14px] text-[var(--text-muted)]">·</span>
        <Link href={`/admin/artists/${result.artist.id}`} className="text-[14px] text-[var(--text-secondary)] hover:underline">{result.artist.name}</Link>
        {result.artist.created && <Chip tone="warn">naujas atlikėjas</Chip>}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {isTrack ? (
          <>
            {result.detail.upload_date && <Chip>išleista {String(result.detail.upload_date).slice(0, 10)}</Chip>}
            {result.detail.views != null && <Chip>{Number(result.detail.views).toLocaleString('lt-LT')} views</Chip>}
            <Chip tone={result.detail.lyrics_found ? 'ok' : 'default'}>{result.detail.lyrics_found ? 'lyrics ✓' : 'lyrics —'}</Chip>
            <Chip tone={result.detail.spotify_found ? 'ok' : 'default'}>{result.detail.spotify_found ? 'Spotify ✓' : 'Spotify —'}</Chip>
            <Chip tone={result.detail.embeddable === false ? 'warn' : 'default'}>{result.detail.embeddable === false ? 'embed blokuotas' : 'embed ✓'}</Chip>
            {result.detail.is_single && <Chip tone="ok">singlas</Chip>}
            {(result.detail.featuring || []).length > 0 && <Chip tone="ok">feat. {result.detail.featuring.join(', ')}</Chip>}
            {result.detail.album && (
              <Link href={`/admin/albums/${result.detail.album.id}`}>
                <Chip tone="ok">📀 albumas: {result.detail.album.title}</Chip>
              </Link>
            )}
          </>
        ) : (
          <>
            {result.detail.year && <Chip>{result.detail.year}</Chip>}
            <Chip tone={result.detail.track_count ? 'ok' : 'warn'}>{result.detail.track_count} dainos</Chip>
            <Chip tone={result.detail.cover_found ? 'ok' : 'default'}>{result.detail.cover_found ? 'viršelis ✓' : 'be viršelio'}</Chip>
            {(result.detail.genres || []).slice(0, 4).map((g: string) => <Chip key={g}>{g}</Chip>)}
          </>
        )}
      </div>

      {warnings.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[14px] text-orange-700">
          {warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}
        </ul>
      )}
    </div>
  )
}
