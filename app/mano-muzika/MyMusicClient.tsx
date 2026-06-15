'use client'
// app/mano-muzika/MyMusicClient.tsx
// ───────────────────────────────────────────────────────────────────────────
// „Mano muzika" — VIENAS sąrašas: viršuje rikiuoti „Mėgstami" (pirmi 20 →
// profilyje), apačioje sulankstoma „Biblioteka" (likę patiktukai). Iš
// bibliotekos vienu paspaudimu kelti į Top 20 arba įvesti konkrečią vietą.
// ───────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useRef, useMemo, type ReactNode } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import MusicSearchPicker, { type AttachmentHit } from '@/components/MusicSearchPicker'
import type { MyMusic, KindCollection, MusicItem, MoodSong, FavStyle, MeterEntry } from '@/lib/mano-muzika'

const PROFILE_CUTOFF = 20
type EntityTab = 'artist' | 'album' | 'track'
type Tab = EntityTab | 'mood' | 'styles'
const TYPEFILTER: Record<EntityTab, AttachmentHit['type']> = { artist: 'grupe', album: 'albumas', track: 'daina' }
const TABS: { key: Tab; label: string; icon: IcoName }[] = [
  { key: 'artist', label: 'Atlikėjai', icon: 'person' }, { key: 'album', label: 'Albumai', icon: 'disc' },
  { key: 'track', label: 'Dainos', icon: 'note' }, { key: 'mood', label: 'Nuotaika', icon: 'moon' }, { key: 'styles', label: 'Stiliai', icon: 'sliders' },
]
const TARGETS = { artists: 100, albums: 100, tracks: 500, styles: 5 }

async function api(path: string, method: string, body?: any) {
  const res = await fetch(`/api/mano-muzika${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Klaida')
  return data
}
type Colls = Record<EntityTab, KindCollection>

export default function MyMusicClient({ initial, username, suggestOnboarding }: { initial: MyMusic; username: string | null; avatarUrl: string | null; suggestOnboarding: boolean }) {
  const [tab, setTab] = useState<Tab>('artist')
  const [coll, setColl] = useState<Colls>({ artist: initial.artist, album: initial.album, track: initial.track })
  const [moodSongs, setMoodSongs] = useState<MoodSong[]>(initial.moodSongs)
  const [styles, setStyles] = useState<FavStyle[]>(initial.styles)
  const [showOnboard, setShowOnboard] = useState(suggestOnboarding)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<any>(null)
  const flash = useCallback((m: string) => { setToast(m); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 2600) }, [])

  const counts = {
    artist: coll.artist.ranked.length + coll.artist.library.length,
    album: coll.album.ranked.length + coll.album.library.length,
    track: coll.track.ranked.length + coll.track.library.length,
    mood: moodSongs.length, styles: styles.length,
  }
  const pct = Math.round(100 * (
    Math.min(counts.artist, TARGETS.artists) / TARGETS.artists + Math.min(counts.album, TARGETS.albums) / TARGETS.albums +
    Math.min(counts.track, TARGETS.tracks) / TARGETS.tracks + Math.min(counts.styles, TARGETS.styles) / TARGETS.styles
  ) / 4)

  const update = useCallback((kind: EntityTab, fn: (c: KindCollection) => KindCollection) => { setColl(prev => ({ ...prev, [kind]: fn(prev[kind]) })) }, [])

  // Įkelti / perkelti į rikiuotą sąrašą į konkrečią vietą (1-based). Veikia ir
  // bibliotekos įrašui (tampa rikiuotu), ir jau rikiuoto perdėliojimui.
  function moveToPosition(kind: EntityTab, item: MusicItem, pos: number) {
    const c = coll[kind]
    const rankedIds = c.ranked.map(i => i.id).filter(id => id !== item.id)
    const idx = Math.max(0, Math.min(rankedIds.length, Math.floor(pos) - 1))
    rankedIds.splice(idx, 0, item.id)
    const map = new Map<number, MusicItem>([...c.ranked, ...c.library].map(x => [x.id, x]))
    const newRanked = rankedIds.map(id => ({ ...(map.get(id) as MusicItem), ranked: true }))
    update(kind, cc => ({ ranked: newRanked, library: cc.library.filter(x => x.id !== item.id) }))
    api('/tier', 'PUT', { kind, ordered_ids: rankedIds }).catch(e => { update(kind, () => c); flash(e.message) })
  }
  function toTop20(kind: EntityTab, item: MusicItem) { moveToPosition(kind, item, 20) }
  function reorder(kind: EntityTab, orderedIds: number[]) {
    update(kind, c => { const map = new Map(c.ranked.map(x => [x.id, x])); return { ...c, ranked: orderedIds.map(id => map.get(id)).filter(Boolean) as MusicItem[] } })
    api('/tier', 'PUT', { kind, ordered_ids: orderedIds }).catch(() => {})
  }
  function toLibrary(kind: EntityTab, item: MusicItem) {
    const prev = coll[kind]
    update(kind, c => ({ ranked: c.ranked.filter(x => x.id !== item.id), library: [{ ...item, ranked: false }, ...c.library] }))
    api('/tier', 'DELETE', { kind, entity_id: item.id }).catch(e => { update(kind, () => prev); flash(e.message) })
  }
  function unlike(kind: EntityTab, item: MusicItem) {
    const prev = coll[kind]
    update(kind, c => ({ ranked: c.ranked.filter(x => x.id !== item.id), library: c.library.filter(x => x.id !== item.id) }))
    api('/favorites', 'DELETE', { kind, entity_id: item.id }).catch(e => { update(kind, () => prev); flash(e.message) })
  }
  function addLib(kind: EntityTab, hit: AttachmentHit) {
    if ([...coll[kind].ranked, ...coll[kind].library].some(x => x.id === hit.id)) return
    const item: MusicItem = { kind, id: hit.id, title: hit.title, subtitle: hit.artist || TABS.find(t => t.key === kind)!.label, cover: hit.image_url, href: null, ranked: false, sort_order: 0, style: null }
    update(kind, c => ({ ...c, library: [item, ...c.library] }))
    api('/favorites', 'POST', { kind, entity_id: hit.id }).catch(e => flash(e.message))
  }

  return (
    <div className="page-shell" style={{ color: 'var(--text-primary)' }}>
      {toast && <div className="fixed left-1/2 -translate-x-1/2 top-4 z-[200] rounded-full px-4 py-2 text-[12.5px] font-bold shadow-lg" style={{ background: '#f43f5e', color: '#fff' }}>{toast}</div>}

      <div className="page-head">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1>Mano muzika</h1>
            <p>Vienas sąrašas: viršuje rikiuoti mėgstamiausi (pirmi 20 rodomi profilyje), apačioje — visa biblioteka.</p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <Link href="/perkelti" className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12.5px] font-bold text-white transition-transform hover:scale-[1.03]" style={{ background: 'var(--accent-orange)' }}><Ico name="download" size={14} /> Importuoti</Link>
            {username && <Link href={`/vartotojas/${username}`} className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12.5px] font-bold" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}><Ico name="eye" size={14} /> Profilis</Link>}
          </div>
        </div>
        <div className="mt-4 rounded-2xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="text-[13.5px] font-black">Kolekcijos užpildymas</div>
            <div className="text-[13px] font-black" style={{ color: 'var(--accent-orange)' }}>{pct}%</div>
          </div>
          <div className="h-2.5 w-full rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}><div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #f97316, #a78bfa)' }} /></div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Goal label="Atlikėjai" n={counts.artist} t={TARGETS.artists} /><Goal label="Albumai" n={counts.album} t={TARGETS.albums} />
            <Goal label="Dainos" n={counts.track} t={TARGETS.tracks} /><Goal label="Stiliai" n={counts.styles} t={TARGETS.styles} />
          </div>
        </div>
      </div>

      {showOnboard && (
        <div className="mb-5 rounded-2xl p-4 sm:p-5 flex items-center gap-4 flex-wrap" style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.14), rgba(167,139,250,0.12))', border: '1px solid var(--border-default)' }}>
          <Ico name="sparkle" size={26} />
          <div className="flex-1 min-w-[200px]"><div className="text-[15px] font-black">Susidėk savo muziką per minutę</div><div className="text-[12.5px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Greitas žaidimas — pasirink mėgstamus atlikėjus ir stilius.</div></div>
          <div className="flex items-center gap-2"><Link href="/mano-muzika/pradzia" className="rounded-full px-5 py-2.5 text-[13px] font-black text-white" style={{ background: 'var(--accent-orange)' }}>Pradėti →</Link><button onClick={() => { setShowOnboard(false); api('/setup', 'POST', { action: 'skip' }).catch(() => {}) }} className="rounded-full px-3 py-2.5 text-[12px] font-bold" style={{ color: 'var(--text-muted)' }}>Vėliau</button></div>
        </div>
      )}

      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-5 -mx-1 px-1" role="tablist">
        {TABS.map(t => {
          const c = t.key === 'mood' ? counts.mood : t.key === 'styles' ? counts.styles : counts[t.key as EntityTab]
          const active = tab === t.key
          return (
            <button key={t.key} onClick={() => setTab(t.key)} className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-bold transition-colors"
              style={{ background: active ? 'var(--accent-orange)' : 'var(--bg-elevated)', color: active ? '#fff' : 'var(--text-secondary)', border: `1px solid ${active ? 'transparent' : 'var(--border-default)'}` }}>
              <Ico name={t.icon} size={14} />{t.label}
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10.5px] font-black" style={{ background: active ? 'rgba(255,255,255,0.25)' : 'var(--bg-surface)', color: active ? '#fff' : 'var(--text-muted)' }}>{c}</span>
            </button>
          )
        })}
      </div>

      {(tab === 'artist' || tab === 'album' || tab === 'track') && (
        <CollectionPanel key={tab} kind={tab} data={coll[tab]} onReorder={(ids) => reorder(tab, ids)} onMoveToPosition={(it, pos) => moveToPosition(tab, it, pos)}
          onToTop20={(it) => toTop20(tab, it)} onToLibrary={(it) => toLibrary(tab, it)} onUnlike={(it) => unlike(tab, it)} onAdd={(hit) => addLib(tab, hit)} />
      )}
      {tab === 'mood' && <MoodSection moodSongs={moodSongs} setMoodSongs={setMoodSongs} />}
      {tab === 'styles' && <StyleSection styles={styles} setStyles={setStyles} meter={initial.musicMeter} />}
    </div>
  )
}

function Goal({ label, n, t }: { label: string; n: number; t: number }) {
  const done = n >= t
  return <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold" style={{ background: 'var(--bg-elevated)', color: done ? '#34d399' : 'var(--text-muted)' }}>{label} {Math.min(n, t)}/{t}{done ? ' ✓' : ''}</span>
}

// ═══════════════════════════════════════════════════════════════════════════
function CollectionPanel({ kind, data, onReorder, onMoveToPosition, onToTop20, onToLibrary, onUnlike, onAdd }: {
  kind: EntityTab; data: KindCollection
  onReorder: (ids: number[]) => void; onMoveToPosition: (it: MusicItem, pos: number) => void; onToTop20: (it: MusicItem) => void
  onToLibrary: (it: MusicItem) => void; onUnlike: (it: MusicItem) => void; onAdd: (hit: AttachmentHit) => void
}) {
  const attached: AttachmentHit[] = [...data.ranked, ...data.library].map(i => ({ type: TYPEFILTER[kind], id: i.id, legacy_id: null, slug: '', title: i.title, artist: null, image_url: i.cover }))
  const noun = kind === 'artist' ? 'atlikėją' : kind === 'album' ? 'albumą' : 'dainą'
  return (
    <section>
      <RankedList kind={kind} items={data.ranked} onReorder={onReorder} onJump={onMoveToPosition} onRemove={onToLibrary} />
      {/* Pridėjimas */}
      <div className="mt-4 mb-2 max-w-[560px]"><MusicSearchPicker attached={attached} onAdd={onAdd} typeFilter={TYPEFILTER[kind]} placeholder={`Pridėk ${noun} į biblioteką...`} /></div>
      <LibrarySection kind={kind} items={data.library} rankedLen={data.ranked.length} onToTop20={onToTop20} onMoveToPosition={onMoveToPosition} onUnlike={onUnlike} />
    </section>
  )
}

// ── RIKIUOTAS sąrašas (Mėgstami) — drag + ▲▼ + spustelėk numerį (į vietą) ───
function RankedList({ kind, items, onReorder, onJump, onRemove }: { kind: EntityTab; items: MusicItem[]; onReorder: (ids: number[]) => void; onJump: (it: MusicItem, pos: number) => void; onRemove: (it: MusicItem) => void }) {
  const dragId = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [editPos, setEditPos] = useState<number | null>(null)
  function drop(targetId: number) { const from = dragId.current; setDragOver(null); dragId.current = null; if (from == null || from === targetId) return; const ids = items.map(i => i.id); const f = ids.indexOf(from), t = ids.indexOf(targetId); if (f < 0 || t < 0) return; ids.splice(t, 0, ids.splice(f, 1)[0]); onReorder(ids) }
  function move(id: number, dir: -1 | 1) { const ids = items.map(i => i.id); const idx = ids.indexOf(id), to = idx + dir; if (to < 0 || to >= ids.length) return; ids.splice(to, 0, ids.splice(idx, 1)[0]); onReorder(ids) }
  return (
    <>
      <div className="flex items-baseline gap-2 mb-2">
        <h2 className="text-[15px] font-black flex items-center gap-1.5"><Ico name="star" size={16} /> Mėgstami</h2>
        <span className="text-[12px] font-bold" style={{ color: 'var(--text-faint)' }}>{items.length}</span>
        {items.length > 0 && items.length <= PROFILE_CUTOFF && <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>· visi rodomi profilyje</span>}
      </div>
      {items.length === 0 ? (
        <div className="rounded-xl px-4 py-5 text-[12px]" style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border-default)', color: 'var(--text-muted)' }}>
          Iš bibliotekos (žemiau) kelk mėgstamiausius į šį sąrašą — pirmi {PROFILE_CUTOFF} rodomi tavo profilyje.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((it, idx) => (
            <div key={it.id}>
              {idx === PROFILE_CUTOFF && (
                <div className="flex items-center gap-2 my-2 px-1"><div className="flex-1 h-px" style={{ background: 'var(--border-default)' }} /><span className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>↑ Top {PROFILE_CUTOFF} rodoma profilyje</span><div className="flex-1 h-px" style={{ background: 'var(--border-default)' }} /></div>
              )}
              <div draggable onDragStart={() => { dragId.current = it.id }} onDragOver={e => { e.preventDefault(); setDragOver(it.id) }} onDragLeave={() => setDragOver(o => o === it.id ? null : o)} onDrop={() => drop(it.id)}
                className="group flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors"
                style={{ background: idx < PROFILE_CUTOFF ? 'linear-gradient(90deg, rgba(249,115,22,0.06), var(--bg-surface) 60%)' : 'var(--bg-surface)', border: `1px solid ${dragOver === it.id ? 'var(--accent-orange)' : 'var(--border-default)'}` }}>
                <span className="hidden sm:inline cursor-grab active:cursor-grabbing select-none text-[var(--text-faint)]" title="Tempk"><Ico name="grip" size={13} /></span>
                {editPos === it.id ? (
                  <input autoFocus type="number" min={1} max={items.length} defaultValue={idx + 1}
                    onKeyDown={e => { if (e.key === 'Enter') { setEditPos(null); onJump(it, Number((e.target as HTMLInputElement).value)) } if (e.key === 'Escape') setEditPos(null) }} onBlur={e => { setEditPos(null); onJump(it, Number(e.target.value)) }}
                    className="w-9 h-7 text-center text-[12px] font-black rounded-md outline-none" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--accent-orange)', color: 'var(--text-primary)' }} />
                ) : (
                  <button onClick={() => setEditPos(it.id)} title="Spustelėk ir įrašyk vietą" className="w-7 h-7 shrink-0 rounded-md text-[12px] font-black tabular-nums" style={{ background: 'var(--bg-elevated)', color: idx < PROFILE_CUTOFF ? 'var(--accent-orange)' : 'var(--text-muted)' }}>{idx + 1}</button>
                )}
                <div className="flex flex-col gap-0.5">
                  <button onClick={() => move(it.id, -1)} disabled={idx === 0} aria-label="Aukštyn" className="h-5 w-6 inline-flex items-center justify-center rounded disabled:opacity-20" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}><Ico name="up" size={11} /></button>
                  <button onClick={() => move(it.id, 1)} disabled={idx === items.length - 1} aria-label="Žemyn" className="h-5 w-6 inline-flex items-center justify-center rounded disabled:opacity-20" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}><Ico name="down" size={11} /></button>
                </div>
                <Cover kind={kind} cover={it.cover} />
                <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-bold">{it.href ? <Link href={it.href} className="hover:underline">{it.title}</Link> : it.title}</div><div className="truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>{it.subtitle}</div></div>
                <button onClick={() => onRemove(it)} title="Pašalinti iš mėgstamų (lieka bibliotekoje)" className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-lg" style={{ color: 'var(--text-faint)' }} onMouseEnter={e => (e.currentTarget.style.color = '#f43f5e')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}><Ico name="x" size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ── BIBLIOTEKA — sulankstoma to paties sąrašo tąsa; paieška + kėlimas į vietą ─
function LibrarySection({ kind, items, rankedLen, onToTop20, onMoveToPosition, onUnlike }: {
  kind: EntityTab; items: MusicItem[]; rankedLen: number; onToTop20: (it: MusicItem) => void; onMoveToPosition: (it: MusicItem, pos: number) => void; onUnlike: (it: MusicItem) => void
}) {
  const [openLib, setOpenLib] = useState(rankedLen === 0)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'recent' | 'az' | 'style'>('recent')
  const [limit, setLimit] = useState(40)
  const [jumpId, setJumpId] = useState<number | null>(null)
  const hasStyles = useMemo(() => items.some(i => i.style), [items])

  const filtered = useMemo(() => {
    let arr = items
    const term = q.trim().toLowerCase()
    if (term) arr = arr.filter(i => i.title.toLowerCase().includes(term) || i.subtitle.toLowerCase().includes(term))
    if (sort === 'az') arr = [...arr].sort((a, b) => a.title.localeCompare(b.title, 'lt'))
    else if (sort === 'style') arr = [...arr].sort((a, b) => (a.style || 'žžž').localeCompare(b.style || 'žžž', 'lt') || a.title.localeCompare(b.title, 'lt'))
    return arr
  }, [items, q, sort])
  const shown = filtered.slice(0, limit)
  const nextSort = () => setSort(s => s === 'recent' ? 'az' : s === 'az' ? (hasStyles ? 'style' : 'recent') : 'recent')
  const sortLabel = sort === 'recent' ? 'Naujausi' : sort === 'az' ? 'A–Ž' : 'Pagal stilių'

  if (items.length === 0) return (
    <div className="mt-2 rounded-xl px-4 py-4 text-center text-[12px]" style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border-default)', color: 'var(--text-muted)' }}>
      Biblioteka tuščia — pridėk per paiešką (viršuje) arba <Link href="/perkelti" className="underline" style={{ color: 'var(--accent-orange)' }}>importuok</Link>.
    </div>
  )

  return (
    <div className="mt-2">
      <button onClick={() => setOpenLib(o => !o)} className="w-full flex items-center justify-between rounded-xl px-3.5 py-2.5" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
        <span className="inline-flex items-center gap-2 text-[13.5px] font-black"><Ico name="books" size={15} /> Biblioteka <span className="text-[12px] font-bold" style={{ color: 'var(--text-faint)' }}>{items.length}</span></span>
        <span className="inline-flex items-center gap-1 text-[11.5px] font-bold" style={{ color: 'var(--text-muted)' }}>{openLib ? 'Suskleisti' : 'Surask ir kelk į viršų'} <Ico name={openLib ? 'up' : 'down'} size={13} /></span>
      </button>

      {openLib && (
        <div className="mt-2.5">
          <div className="flex items-center gap-2 mb-2.5">
            <input value={q} onChange={e => { setQ(e.target.value); setLimit(40) }} placeholder="Ieškoti bibliotekoje..." className="flex-1 max-w-[340px] rounded-lg px-3 py-2 text-[12.5px] outline-none" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }} />
            <button onClick={nextSort} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-[12px] font-bold" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>{sortLabel} <Ico name="sort" size={12} /></button>
          </div>
          <div className="flex flex-col gap-1.5">
            {shown.map(it => (
              <div key={it.id} className="group flex items-center gap-2.5 rounded-xl px-2.5 py-2" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
                <Cover kind={kind} cover={it.cover} />
                <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-bold">{it.href ? <Link href={it.href} className="hover:underline">{it.title}</Link> : it.title}</div><div className="truncate text-[11px] flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>{it.subtitle}{it.style && <span className="rounded px-1.5 py-0.5 text-[9.5px] font-bold" style={{ background: 'var(--bg-elevated)', color: 'var(--text-faint)' }}>{it.style}</span>}</div></div>
                {jumpId === it.id ? (
                  <input autoFocus type="number" min={1} placeholder="vieta" onKeyDown={e => { if (e.key === 'Enter') { setJumpId(null); onMoveToPosition(it, Number((e.target as HTMLInputElement).value) || 1) } if (e.key === 'Escape') setJumpId(null) }} onBlur={() => setJumpId(null)}
                    className="w-16 h-7 text-center text-[12px] font-bold rounded-md outline-none" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--accent-orange)', color: 'var(--text-primary)' }} />
                ) : (
                  <>
                    <button onClick={() => onToTop20(it)} title="Įkelti į Top 20" className="shrink-0 h-7 inline-flex items-center gap-1 rounded-full px-2.5 text-[11px] font-bold" style={{ background: 'rgba(249,115,22,0.12)', color: '#f97316' }}><Ico name="star" size={12} /> Top 20</button>
                    <button onClick={() => setJumpId(it.id)} title="Įkelti į konkrečią vietą" className="shrink-0 h-7 inline-flex items-center gap-1 rounded-full px-2.5 text-[11px] font-bold" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}><Ico name="target" size={12} /> Į vietą</button>
                  </>
                )}
                <button onClick={() => onUnlike(it)} title="Pašalinti visai" className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-faint)' }} onMouseEnter={e => (e.currentTarget.style.color = '#f43f5e')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}><Ico name="x" size={14} /></button>
              </div>
            ))}
          </div>
          {filtered.length > limit && <div className="mt-3 text-center"><button onClick={() => setLimit(l => l + 40)} className="rounded-full px-5 py-2 text-[12.5px] font-bold" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>Rodyti daugiau ({filtered.length - limit})</button></div>}
          {filtered.length === 0 && <div className="text-center text-[12px] py-4" style={{ color: 'var(--text-faint)' }}>Nieko nerasta.</div>}
        </div>
      )}
    </div>
  )
}

function Cover({ kind, cover }: { kind: EntityTab; cover: string | null }) {
  return (
    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg flex items-center justify-center" style={{ background: 'var(--bg-elevated)', color: 'var(--text-faint)' }}>
      {cover ? (/* eslint-disable-next-line @next/next/no-img-element */<img src={proxyImg(cover)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />) : <Ico name={kind === 'artist' ? 'person' : kind === 'album' ? 'disc' : 'note'} size={16} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
function MoodSection({ moodSongs, setMoodSongs }: { moodSongs: MoodSong[]; setMoodSongs: (v: MoodSong[]) => void }) {
  function add(hit: AttachmentHit) {
    if (moodSongs.some(m => m.track_id === hit.id)) return
    const makeActive = moodSongs.length === 0
    const row: MoodSong = { id: -Date.now(), track_id: hit.id, mood_label: null, is_active: makeActive, sort_order: 9999, track: { id: hit.id, slug: hit.slug, title: hit.title, cover_url: hit.image_url, artist: hit.artist ? { slug: '', name: hit.artist } : null } }
    setMoodSongs(makeActive ? moodSongs.map(m => ({ ...m, is_active: false })).concat(row) : [...moodSongs, row])
    api('/mood', 'POST', { track_id: hit.id, make_active: makeActive }).catch(() => setMoodSongs(moodSongs))
  }
  function remove(trackId: number) { setMoodSongs(moodSongs.filter(m => m.track_id !== trackId)); api('/mood', 'DELETE', { track_id: trackId }).catch(() => setMoodSongs(moodSongs)) }
  function setActive(trackId: number) { setMoodSongs(moodSongs.map(m => ({ ...m, is_active: m.track_id === trackId }))); api('/mood', 'PATCH', { track_id: trackId, active: true }).catch(() => setMoodSongs(moodSongs)) }
  const attached: AttachmentHit[] = moodSongs.map(m => ({ type: 'daina', id: m.track_id, legacy_id: null, slug: '', title: m.track?.title || '', artist: null, image_url: m.track?.cover_url || null }))
  return (
    <div>
      <p className="mb-3 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>Nuotaikos daina rodoma profilio viršuje. Susidėk kelias ir perjunk aktyvią.</p>
      <div className="mb-4 max-w-[520px]"><MusicSearchPicker attached={attached} onAdd={add} typeFilter="daina" placeholder="Surask nuotaikos dainą..." /></div>
      {moodSongs.length === 0 ? <Empty hint="Dar nepridėjai nuotaikos dainų." /> : (
        <ul className="flex flex-col gap-2">
          {moodSongs.map(m => (
            <li key={m.id} className="group flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: m.is_active ? 'linear-gradient(90deg, rgba(167,139,250,0.14), transparent)' : 'var(--bg-surface)', border: `1px solid ${m.is_active ? 'rgba(167,139,250,0.5)' : 'var(--border-default)'}` }}>
              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg flex items-center justify-center" style={{ background: 'var(--bg-elevated)', color: 'var(--text-faint)' }}>{m.track?.cover_url ? (/* eslint-disable-next-line @next/next/no-img-element */<img src={proxyImg(m.track.cover_url)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />) : <Ico name="note" size={18} />}</div>
              <div className="min-w-0 flex-1"><div className="truncate text-[13.5px] font-bold">{m.track?.title || '—'}</div><div className="truncate text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{m.track?.artist?.name || 'Daina'}</div></div>
              {m.is_active ? <span className="shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-black" style={{ background: 'rgba(167,139,250,0.18)', color: '#a78bfa' }}><Ico name="moon" size={11} /> Aktyvi</span>
                : <button onClick={() => setActive(m.track_id)} className="shrink-0 rounded-full px-3 py-1 text-[11px] font-bold" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>Nustatyti aktyvia</button>}
              <button onClick={() => remove(m.track_id)} title="Pašalinti" className="shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-faint)' }} onMouseEnter={e => (e.currentTarget.style.color = '#f43f5e')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}><Ico name="x" size={14} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const METER_COLORS = ['#f97316', '#a78bfa', '#34d399', '#60a5fa', '#f472b6', '#fbbf24', '#22d3ee', '#fb7185']
function StyleSection({ styles, setStyles, meter }: { styles: FavStyle[]; setStyles: (v: FavStyle[]) => void; meter: MeterEntry[] }) {
  const [catalog, setCatalog] = useState<{ legacy_style_id: number; style_slug: string; style_name: string }[] | null>(null)
  const [q, setQ] = useState(''); const [open, setOpen] = useState(false)
  const dragId = useRef<number | null>(null); const [dragOver, setDragOver] = useState<number | null>(null)
  async function ensureCatalog() { if (catalog) return; try { const r = await api('/styles?catalog=1', 'GET'); setCatalog(r.catalog || []) } catch { setCatalog([]) } }
  function add(s: { legacy_style_id: number; style_slug: string; style_name: string }) { if (styles.some(x => x.legacy_style_id === s.legacy_style_id)) return; setStyles([...styles, { ...s, sort_order: 9999 }]); setQ(''); setOpen(false); api('/styles', 'POST', s).catch(() => setStyles(styles)) }
  function remove(id: number) { setStyles(styles.filter(x => x.legacy_style_id !== id)); api('/styles', 'DELETE', { legacy_style_id: id }).catch(() => setStyles(styles)) }
  function persistOrder(ids: number[]) { const map = new Map(styles.map(s => [s.legacy_style_id, s])); setStyles(ids.map(id => map.get(id)).filter(Boolean) as FavStyle[]); api('/styles', 'PUT', { ordered_ids: ids }).catch(() => {}) }
  function drop(targetId: number) { const from = dragId.current; setDragOver(null); dragId.current = null; if (from == null || from === targetId) return; const ids = styles.map(s => s.legacy_style_id); const f = ids.indexOf(from), t = ids.indexOf(targetId); if (f < 0 || t < 0) return; ids.splice(t, 0, ids.splice(f, 1)[0]); persistOrder(ids) }
  const filtered = (catalog || []).filter(c => !styles.some(s => s.legacy_style_id === c.legacy_style_id)).filter(c => q.trim().length < 2 || c.style_name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 40)
  const maxPct = meter.length ? Math.max(...meter.map(m => m.percent)) : 0
  return (
    <div>
      {meter.length > 0 && (
        <div className="mb-5 rounded-2xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
          <div className="text-[13px] font-black mb-3">Muzikometras</div>
          <div className="flex flex-col gap-2">
            {[...meter].sort((a, b) => b.percent - a.percent).map((m, i) => (
              <div key={m.name} className="flex items-center gap-2.5">
                <div className="w-24 shrink-0 text-[11.5px] font-bold truncate" style={{ color: 'var(--text-secondary)' }}>{m.name}</div>
                <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}><div className="h-full rounded-full transition-all duration-500" style={{ width: `${maxPct ? Math.round((m.percent / maxPct) * 100) : 0}%`, background: METER_COLORS[i % METER_COLORS.length] }} /></div>
                <div className="w-9 text-right text-[11px] font-bold tabular-nums" style={{ color: 'var(--text-faint)' }}>{Math.round(m.percent)}%</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="mb-3 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>Mėgstami stiliai formuoja tavo muzikos identitetą. Tempk, kad pakeistum eilę.</p>
      <div className="relative mb-4 max-w-[520px]">
        <input value={q} onFocus={() => { ensureCatalog(); setOpen(true) }} onChange={e => { setQ(e.target.value); setOpen(true) }} placeholder="Pridėk stilių..." className="w-full rounded-lg px-3 py-2 text-[13px] outline-none" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }} />
        {open && (
          <div className="absolute left-0 right-0 z-40 mt-1.5 max-h-[300px] overflow-y-auto rounded-lg shadow-xl" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }} onMouseLeave={() => setOpen(false)}>
            {!catalog ? <div className="px-3 py-4 text-center text-[12px]" style={{ color: 'var(--text-faint)' }}>Kraunama…</div> : filtered.length === 0 ? <div className="px-3 py-4 text-center text-[12px]" style={{ color: 'var(--text-faint)' }}>Nieko nerasta.</div> : <ul>{filtered.map(c => (<li key={c.legacy_style_id}><button onClick={() => add(c)} className="w-full text-left px-3 py-2 text-[13px] font-medium" style={{ color: 'var(--text-primary)' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>{c.style_name}</button></li>))}</ul>}
          </div>
        )}
      </div>
      {styles.length === 0 ? <Empty hint="Dar nepasirinkai mėgstamų stilių." /> : (
        <div className="flex flex-col gap-2">
          {styles.map((s, idx) => (
            <div key={s.legacy_style_id} draggable onDragStart={() => { dragId.current = s.legacy_style_id }} onDragOver={e => { e.preventDefault(); setDragOver(s.legacy_style_id) }} onDragLeave={() => setDragOver(o => o === s.legacy_style_id ? null : o)} onDrop={() => drop(s.legacy_style_id)}
              className="group flex items-center gap-2.5 rounded-xl px-2.5 py-2 cursor-grab active:cursor-grabbing" style={{ background: 'var(--bg-surface)', border: `1px solid ${dragOver === s.legacy_style_id ? 'var(--accent-orange)' : 'var(--border-default)'}` }}>
              <span className="hidden sm:inline text-[var(--text-faint)]"><Ico name="grip" size={13} /></span>
              <span className="w-6 text-center text-[11px] font-black tabular-nums" style={{ color: 'var(--text-faint)' }}>{idx + 1}</span>
              <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}><div className="h-full rounded-full" style={{ width: `${Math.max(12, 100 - idx * 7)}%`, background: METER_COLORS[idx % METER_COLORS.length] }} /></div>
              <span className="text-[12.5px] font-bold w-32 truncate text-right">{s.style_name}</span>
              <button onClick={() => remove(s.legacy_style_id)} title="Pašalinti" className="h-6 w-6 inline-flex items-center justify-center rounded-full" style={{ color: 'var(--text-faint)' }} onMouseEnter={e => (e.currentTarget.style.color = '#f43f5e')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}><Ico name="x" size={11} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Empty({ hint }: { hint: string }) { return <div className="rounded-2xl px-6 py-10 text-center" style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border-default)' }}><div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>{hint}</div></div> }

// ── ICONS (inline SVG) ─────────────────────────────────────────────────────
type IcoName = 'person' | 'disc' | 'note' | 'moon' | 'sliders' | 'star' | 'books' | 'download' | 'eye' | 'x' | 'up' | 'down' | 'grip' | 'sort' | 'sparkle' | 'target'
function Ico({ name, size = 16 }: { name: IcoName; size?: number }) {
  const p: Record<IcoName, ReactNode> = {
    person: <><circle cx="12" cy="8" r="4" /><path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6" /></>,
    disc: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.5" /></>,
    note: <><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></>,
    moon: <path d="M21 12.8A8 8 0 1 1 11.2 3 6.5 6.5 0 0 0 21 12.8z" />,
    sliders: <><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h7M15 18h5" /><circle cx="16" cy="6" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="13" cy="18" r="2" /></>,
    star: <polygon points="12 2 15 9 22 9.3 16.5 14 18.5 21 12 17 5.5 21 7.5 14 2 9.3 9 9" />,
    books: <><path d="M4 5v15h16V5" /><path d="M4 9h16M9 5v15" /></>,
    download: <><path d="M12 3v12M7 11l5 4 5-4" /><path d="M5 20h14" /></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="2.5" /></>,
    x: <path d="M5 5l14 14M19 5L5 19" />,
    up: <path d="M6 15l6-6 6 6" />, down: <path d="M6 9l6 6 6-6" />,
    grip: <><circle cx="9" cy="6" r="1.3" /><circle cx="9" cy="12" r="1.3" /><circle cx="9" cy="18" r="1.3" /><circle cx="15" cy="6" r="1.3" /><circle cx="15" cy="12" r="1.3" /><circle cx="15" cy="18" r="1.3" /></>,
    sort: <path d="M7 4v16M7 20l-3-3M7 4l3 3M17 20V4M17 4l3 3M17 20l-3-3" />,
    sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
    target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" /></>,
  }
  const filled = name === 'star' || name === 'grip' || name === 'sparkle'
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={name === 'x' || name === 'up' || name === 'down' ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>{p[name]}</svg>
}
