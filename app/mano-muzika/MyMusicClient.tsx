'use client'
// app/mano-muzika/MyMusicClient.tsx
// ───────────────────────────────────────────────────────────────────────────
// „Mano muzika" — VIENAS sąrašas: viršuje rikiuoti „Mėgstami" (pirmi 20 →
// profilyje). Likę patiktukai tęsia tą patį sąrašą žemiau (be atskiros
// bibliotekos vienu paspaudimu kelti į Top 20 arba įvesti konkrečią vietą.
// ───────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useRef, useMemo, type ReactNode } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import MusicSearchPicker, { type AttachmentHit } from '@/components/MusicSearchPicker'
import type { MyMusic, KindCollection, MusicItem, MoodSong, FavStyle } from '@/lib/mano-muzika'

const PROFILE_CUTOFF = 20
type EntityTab = 'artist' | 'album' | 'track'
type Tab = EntityTab | 'mood' | 'styles'
const TYPEFILTER: Record<EntityTab, AttachmentHit['type']> = { artist: 'grupe', album: 'albumas', track: 'daina' }
const TABS: { key: Tab; label: string; icon: IcoName }[] = [
  { key: 'artist', label: 'Atlikėjai', icon: 'person' }, { key: 'album', label: 'Albumai', icon: 'disc' },
  { key: 'track', label: 'Dainos', icon: 'note' }, { key: 'mood', label: 'Nuotaika', icon: 'moon' }, { key: 'styles', label: 'Stiliai', icon: 'sliders' },
]
const TARGETS = { artists: 50, albums: 100, tracks: 500, styles: 5 }

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

  // Perkelti įrašą į konkrečią vietą bendrame sąraše (1-based). Bendras sąrašas =
  // rikiuoti (sort_order) + likę patiktukai (pagal datą). Perkėlimas „surikiuoja"
  // viską iki tikslinės vietos (jie gauna aiškų sort_order), žemiau lieka „laisvi".
  function moveToPosition(kind: EntityTab, item: MusicItem, pos: number) {
    const c = coll[kind]
    const combined = [...c.ranked, ...c.library]
    const wasRanked = c.ranked.some(x => x.id === item.id)
    const without = combined.filter(x => x.id !== item.id)
    const idx = Math.max(0, Math.min(without.length, Math.floor(pos) - 1))
    without.splice(idx, 0, item)
    const rankedCount = Math.min(without.length, Math.max(c.ranked.length + (wasRanked ? 0 : 1), idx + 1))
    const newRanked = without.slice(0, rankedCount).map(x => ({ ...x, ranked: true }))
    const newLibrary = without.slice(rankedCount).map(x => ({ ...x, ranked: false }))
    update(kind, () => ({ ranked: newRanked, library: newLibrary }))
    api('/tier', 'PUT', { kind, ordered_ids: newRanked.map(x => x.id) }).catch(e => { update(kind, () => c); flash(e.message) })
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
            <p>Vienas mėgstamiausių sąrašas — pirmi 20 rodomi tavo profilyje. Surask ir kelk svarbiausius į viršų.</p>
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
        <CollectionPanel key={tab} kind={tab} data={coll[tab]} onMove={(it, pos) => moveToPosition(tab, it, pos)} onUnlike={(it) => unlike(tab, it)} onAdd={(hit) => addLib(tab, hit)} />
      )}
      {tab === 'mood' && <MoodSection moodSongs={moodSongs} setMoodSongs={setMoodSongs} />}
      {tab === 'styles' && <StyleSection coll={coll} styles={styles} setStyles={setStyles} onMove={(kind, it, pos) => moveToPosition(kind, it, pos)} onUnlike={(kind, it) => unlike(kind, it)} />}
    </div>
  )
}

function Goal({ label, n, t }: { label: string; n: number; t: number }) {
  const done = n >= t
  return <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold" style={{ background: 'var(--bg-elevated)', color: done ? '#34d399' : 'var(--text-muted)' }}>{label} {Math.min(n, t)}/{t}{done ? ' ✓' : ''}</span>
}

// ═══════════════════════════════════════════════════════════════════════════
function CollectionPanel({ kind, data, onMove, onUnlike, onAdd }: {
  kind: EntityTab; data: KindCollection; onMove: (it: MusicItem, pos: number) => void; onUnlike: (it: MusicItem) => void; onAdd: (hit: AttachmentHit) => void
}) {
  const items = useMemo(() => [...data.ranked, ...data.library], [data])
  const attached: AttachmentHit[] = items.map(i => ({ type: TYPEFILTER[kind], id: i.id, legacy_id: null, slug: '', title: i.title, artist: null, image_url: i.cover }))
  const noun = kind === 'artist' ? 'atlikėją' : kind === 'album' ? 'albumą' : 'dainą'
  return (
    <section>
      <OneList kind={kind} items={items} onMove={onMove} onUnlike={onUnlike} />
      <div className="mt-4 max-w-[560px]"><MusicSearchPicker attached={attached} onAdd={onAdd} typeFilter={TYPEFILTER[kind]} placeholder={`Pridėk ${noun}...`} /></div>
    </section>
  )
}

// VIENAS sąrašas: rikiuoti + likę patiktukai, ištisinė numeracija; pirmi 20 → profilyje.
function OneList({ kind, items, onMove, onUnlike }: { kind: EntityTab; items: MusicItem[]; onMove: (it: MusicItem, pos: number) => void; onUnlike: (it: MusicItem) => void }) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'order' | 'az' | 'style'>('order')
  const [limit, setLimit] = useState(60)
  const [jumpId, setJumpId] = useState<number | null>(null)
  const dragId = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const hasStyles = useMemo(() => items.some(i => i.style), [items])
  const realIdx = useMemo(() => new Map(items.map((it, i) => [it.id, i])), [items])

  const term = q.trim().toLowerCase()
  const browsing = term.length > 0 || sort !== 'order'
  let view = items
  if (term) view = view.filter(i => i.title.toLowerCase().includes(term) || i.subtitle.toLowerCase().includes(term))
  if (sort === 'az') view = [...view].sort((a, b) => a.title.localeCompare(b.title, 'lt'))
  else if (sort === 'style') view = [...view].sort((a, b) => (a.style || 'žžž').localeCompare(b.style || 'žžž', 'lt') || a.title.localeCompare(b.title, 'lt'))
  const shown = view.slice(0, limit)
  const nextSort = () => setSort(s => s === 'order' ? 'az' : s === 'az' ? (hasStyles ? 'style' : 'order') : 'order')
  const sortLabel = sort === 'order' ? 'Eilė' : sort === 'az' ? 'A–Ž' : 'Pagal stilių'

  function move(id: number, dir: -1 | 1) { const i = realIdx.get(id); if (i == null) return; const it = items[i]; onMove(it, i + 1 + dir) }
  function drop(targetId: number) { const from = dragId.current; setDragOver(null); dragId.current = null; if (from == null || from === targetId) return; const it = items.find(x => x.id === from); const ti = realIdx.get(targetId); if (it && ti != null) onMove(it, ti + 1) }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <h2 className="text-[15px] font-black flex items-center gap-1.5"><Ico name="star" size={16} /> Mėgstami <span className="text-[12px] font-bold" style={{ color: 'var(--text-faint)' }}>{items.length}</span></h2>
        {items.length > 0 && (
          <div className="flex items-center gap-2">
            <input value={q} onChange={e => { setQ(e.target.value); setLimit(60) }} placeholder="Ieškoti sąraše..." className="w-[200px] sm:w-[240px] rounded-lg px-3 py-1.5 text-[12.5px] outline-none" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }} />
            <button onClick={nextSort} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-bold" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>{sortLabel} <Ico name="sort" size={12} /></button>
          </div>
        )}
      </div>
      {items.length === 0 ? (
        <div className="rounded-xl px-4 py-6 text-[12.5px] text-center" style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border-default)', color: 'var(--text-muted)' }}>
          Tuščia. Pridėk per paiešką (žemiau) arba <Link href="/perkelti" className="underline" style={{ color: 'var(--accent-orange)' }}>importuok</Link>. Pirmi {PROFILE_CUTOFF} rodomi tavo profilyje.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {shown.map(it => {
            const pos = realIdx.get(it.id) ?? 0
            const inProfile = pos < PROFILE_CUTOFF
            return (
              <div key={it.id}>
                {!browsing && pos === PROFILE_CUTOFF && (
                  <div className="flex items-center gap-2 my-2 px-1"><div className="flex-1 h-px" style={{ background: 'var(--border-default)' }} /><span className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>↑ Top {PROFILE_CUTOFF} rodoma profilyje</span><div className="flex-1 h-px" style={{ background: 'var(--border-default)' }} /></div>
                )}
                <div draggable={!browsing} onDragStart={() => { if (!browsing) dragId.current = it.id }} onDragOver={e => { if (!browsing) { e.preventDefault(); setDragOver(it.id) } }} onDragLeave={() => setDragOver(o => o === it.id ? null : o)} onDrop={() => { if (!browsing) drop(it.id) }}
                  className="group flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors"
                  style={{ background: inProfile ? 'linear-gradient(90deg, rgba(249,115,22,0.06), var(--bg-surface) 60%)' : 'var(--bg-surface)', border: `1px solid ${dragOver === it.id ? 'var(--accent-orange)' : 'var(--border-default)'}` }}>
                  {!browsing && <span className="hidden sm:inline cursor-grab active:cursor-grabbing select-none text-[var(--text-faint)]" title="Tempk"><Ico name="grip" size={13} /></span>}
                  {jumpId === it.id ? (
                    <input autoFocus type="number" min={1} max={items.length} defaultValue={pos + 1}
                      onKeyDown={e => { if (e.key === 'Enter') { setJumpId(null); onMove(it, Number((e.target as HTMLInputElement).value) || 1) } if (e.key === 'Escape') setJumpId(null) }} onBlur={e => { setJumpId(null); onMove(it, Number(e.target.value) || pos + 1) }}
                      className="w-11 h-7 text-center text-[12px] font-black rounded-md outline-none" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--accent-orange)', color: 'var(--text-primary)' }} />
                  ) : (
                    <button onClick={() => setJumpId(it.id)} title="Spustelėk ir įrašyk vietą" className="min-w-[28px] h-7 px-1 shrink-0 rounded-md text-[12px] font-black tabular-nums" style={{ background: 'var(--bg-elevated)', color: inProfile ? 'var(--accent-orange)' : 'var(--text-muted)' }}>{pos + 1}</button>
                  )}
                  {!browsing && (
                    <div className="flex flex-col gap-0.5">
                      <button onClick={() => move(it.id, -1)} disabled={pos === 0} aria-label="Aukštyn" className="h-5 w-6 inline-flex items-center justify-center rounded disabled:opacity-20" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}><Ico name="up" size={11} /></button>
                      <button onClick={() => move(it.id, 1)} disabled={pos === items.length - 1} aria-label="Žemyn" className="h-5 w-6 inline-flex items-center justify-center rounded disabled:opacity-20" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}><Ico name="down" size={11} /></button>
                    </div>
                  )}
                  <Cover kind={kind} cover={it.cover} />
                  <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-bold">{it.href ? <Link href={it.href} className="hover:underline">{it.title}</Link> : it.title}</div><div className="truncate text-[11px] flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>{it.subtitle}{it.style && <span className="rounded px-1.5 py-0.5 text-[9.5px] font-bold" style={{ background: 'var(--bg-elevated)', color: 'var(--text-faint)' }}>{it.style}</span>}</div></div>
                  {!inProfile && <button onClick={() => onMove(it, PROFILE_CUTOFF)} title="Įkelti į Top 20" className="shrink-0 h-7 inline-flex items-center gap-1 rounded-full px-2.5 text-[11px] font-bold" style={{ background: 'rgba(249,115,22,0.12)', color: '#f97316' }}><Ico name="star" size={12} /> Top 20</button>}
                  <button onClick={() => onUnlike(it)} title="Pašalinti iš mėgstamų" className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-faint)' }} onMouseEnter={e => (e.currentTarget.style.color = '#f43f5e')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}><Ico name="x" size={14} /></button>
                </div>
              </div>
            )
          })}
          {view.length > limit && <div className="mt-1 text-center"><button onClick={() => setLimit(l => l + 60)} className="rounded-full px-5 py-2 text-[12.5px] font-bold" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>Rodyti daugiau ({view.length - limit})</button></div>}
          {view.length === 0 && <div className="text-center text-[12px] py-4" style={{ color: 'var(--text-faint)' }}>Nieko nerasta.</div>}
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

const METER_COLORS = ['#f97316', '#a78bfa', '#34d399', '#60a5fa', '#f472b6', '#fbbf24', '#22d3ee', '#fb7185', '#fb923c', '#4ade80']

// Stilių sąrašas pagal konkretų stilių — globalios pozicijos, valdymas kaip pagrindiniame sąraše.
function StyleKindList({ kind, all, styled, onMove, onUnlike }: { kind: EntityTab; all: MusicItem[]; styled: MusicItem[]; onMove: (it: MusicItem, pos: number) => void; onUnlike: (it: MusicItem) => void }) {
  const [jumpId, setJumpId] = useState<number | null>(null)
  const realIdx = useMemo(() => new Map(all.map((it, i) => [it.id, i])), [all])
  const label = kind === 'artist' ? 'Atlikėjai' : kind === 'album' ? 'Albumai' : 'Dainos'
  return (
    <div className="mb-3">
      <div className="text-[12px] font-black mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}><Ico name={kind === 'artist' ? 'person' : kind === 'album' ? 'disc' : 'note'} size={13} /> {label} <span style={{ color: 'var(--text-faint)' }}>{styled.length}</span></div>
      <div className="flex flex-col gap-1.5">
        {styled.map(it => {
          const pos = realIdx.get(it.id) ?? 0
          const inProfile = pos < PROFILE_CUTOFF
          return (
            <div key={it.id} className="group flex items-center gap-2.5 rounded-xl px-2.5 py-2" style={{ background: inProfile ? 'linear-gradient(90deg, rgba(249,115,22,0.06), var(--bg-surface) 60%)' : 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
              {jumpId === it.id ? (
                <input autoFocus type="number" min={1} max={all.length} defaultValue={pos + 1}
                  onKeyDown={e => { if (e.key === 'Enter') { setJumpId(null); onMove(it, Number((e.target as HTMLInputElement).value) || 1) } if (e.key === 'Escape') setJumpId(null) }} onBlur={e => { setJumpId(null); onMove(it, Number(e.target.value) || pos + 1) }}
                  className="w-11 h-7 text-center text-[12px] font-black rounded-md outline-none" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--accent-orange)', color: 'var(--text-primary)' }} />
              ) : (
                <button onClick={() => setJumpId(it.id)} title="Įrašyk vietą bendrame sąraše" className="min-w-[28px] h-7 px-1 shrink-0 rounded-md text-[12px] font-black tabular-nums" style={{ background: 'var(--bg-elevated)', color: inProfile ? 'var(--accent-orange)' : 'var(--text-muted)' }}>{pos + 1}</button>
              )}
              <Cover kind={kind} cover={it.cover} />
              <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-bold">{it.href ? <Link href={it.href} className="hover:underline">{it.title}</Link> : it.title}</div><div className="truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>{it.subtitle}</div></div>
              {!inProfile && <button onClick={() => onMove(it, PROFILE_CUTOFF)} title="Įkelti į Top 20" className="shrink-0 h-7 inline-flex items-center gap-1 rounded-full px-2.5 text-[11px] font-bold" style={{ background: 'rgba(249,115,22,0.12)', color: '#f97316' }}><Ico name="star" size={12} /> Top 20</button>}
              <button onClick={() => onUnlike(it)} title="Pašalinti iš mėgstamų" className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-faint)' }} onMouseEnter={e => (e.currentTarget.style.color = '#f43f5e')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}><Ico name="x" size={14} /></button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StyleSection({ coll, styles, setStyles, onMove, onUnlike }: {
  coll: Record<EntityTab, KindCollection>; styles: FavStyle[]; setStyles: (v: FavStyle[]) => void
  onMove: (kind: EntityTab, it: MusicItem, pos: number) => void; onUnlike: (kind: EntityTab, it: MusicItem) => void
}) {
  const [sel, setSel] = useState<string | null>(null)
  const [catalog, setCatalog] = useState<{ legacy_style_id: number; style_slug: string; style_name: string }[] | null>(null)
  const [q, setQ] = useState(''); const [open, setOpen] = useState(false)

  const dist = useMemo(() => {
    const m = new Map<string, number>()
    ;(['artist', 'album', 'track'] as const).forEach(kind => {
      for (const it of [...coll[kind].ranked, ...coll[kind].library]) if (it.style) m.set(it.style, (m.get(it.style) || 0) + 1)
    })
    return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
  }, [coll])
  const maxCount = dist.length ? Math.max(...dist.map(d => d.count)) : 0
  const top = dist.slice(0, 10)
  const colorIdx = useMemo(() => new Map(dist.map((d, i) => [d.name, i])), [dist])
  const colorOf = (name: string) => METER_COLORS[(colorIdx.get(name) ?? 0) % METER_COLORS.length]

  async function ensureCatalog() { if (catalog) return; try { const r = await api('/styles?catalog=1', 'GET'); setCatalog(r.catalog || []) } catch { setCatalog([]) } }
  function addStyle(s: { legacy_style_id: number; style_slug: string; style_name: string }) { if (styles.some(x => x.legacy_style_id === s.legacy_style_id)) return; setStyles([...styles, { ...s, sort_order: 9999 }]); setQ(''); setOpen(false); api('/styles', 'POST', s).catch(() => setStyles(styles)) }
  function removeStyle(id: number) { setStyles(styles.filter(x => x.legacy_style_id !== id)); api('/styles', 'DELETE', { legacy_style_id: id }).catch(() => setStyles(styles)) }
  const filteredCatalog = (catalog || []).filter(c => !styles.some(s => s.legacy_style_id === c.legacy_style_id)).filter(c => q.trim().length < 2 || c.style_name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 40)

  return (
    <div>
      {dist.length > 0 ? (
        <div className="mb-5 rounded-2xl p-4 sm:p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
          <div className="text-[13px] font-black mb-3">Tavo muzikos stiliai <span className="font-medium" style={{ color: 'var(--text-muted)' }}>· spustelėk ir tvarkyk to stiliaus topą</span></div>
          <div className="hidden md:flex items-end justify-start gap-2.5" style={{ height: 176 }}>
            {top.map(d => {
              const active = sel === d.name
              return (
                <button key={d.name} onClick={() => setSel(active ? null : d.name)} title={d.name} className="group flex flex-col items-center justify-end gap-1.5 flex-1 min-w-0" style={{ height: '100%' }}>
                  <span className="text-[11px] font-black tabular-nums" style={{ color: active ? 'var(--text-primary)' : 'var(--text-faint)' }}>{d.count}</span>
                  <div className="w-full rounded-t-md transition-all" style={{ maxWidth: 44, height: `${maxCount ? Math.max(6, (d.count / maxCount) * 100) : 0}%`, background: colorOf(d.name), opacity: active ? 1 : 0.8, outline: active ? '2px solid var(--accent-orange)' : 'none', outlineOffset: 2 }} />
                  <span className="text-[9.5px] font-bold text-center leading-tight overflow-hidden" style={{ height: 26, color: active ? 'var(--text-primary)' : 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{d.name}</span>
                </button>
              )
            })}
          </div>
          <div className="md:hidden flex flex-col gap-2">
            {top.map(d => {
              const active = sel === d.name
              return (
                <button key={d.name} onClick={() => setSel(active ? null : d.name)} className="flex items-center gap-2.5 w-full">
                  <span className="w-24 shrink-0 text-[11.5px] font-bold truncate text-left" style={{ color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{d.name}</span>
                  <span className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)', outline: active ? '1.5px solid var(--accent-orange)' : 'none' }}><span className="block h-full rounded-full" style={{ width: `${maxCount ? Math.max(8, (d.count / maxCount) * 100) : 0}%`, background: colorOf(d.name) }} /></span>
                  <span className="w-7 text-right text-[11px] font-bold tabular-nums" style={{ color: 'var(--text-faint)' }}>{d.count}</span>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <p className="mb-5 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>Pridėk atlikėjų, albumų ar dainų — iš jų žanrų susiformuos tavo stilių pasiskirstymas.</p>
      )}

      {sel && (
        <div className="mb-6 rounded-2xl p-4" style={{ background: 'var(--bg-surface)', border: `1px solid ${colorOf(sel)}55` }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[14px] font-black flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full" style={{ background: colorOf(sel) }} /> {sel}</h3>
            <button onClick={() => setSel(null)} className="inline-flex items-center gap-1 text-[12px] font-bold" style={{ color: 'var(--text-muted)' }}>Uždaryti <Ico name="x" size={12} /></button>
          </div>
          {(['artist', 'album', 'track'] as const).map(kind => {
            const all = [...coll[kind].ranked, ...coll[kind].library]
            const styled = all.filter(i => i.style === sel)
            if (!styled.length) return null
            return <StyleKindList key={kind} kind={kind} all={all} styled={styled} onMove={(it, pos) => onMove(kind, it, pos)} onUnlike={(it) => onUnlike(kind, it)} />
          })}
        </div>
      )}

      <div>
        <h3 className="text-[14px] font-black mb-2">Mėgstami stiliai <span className="text-[12px] font-bold" style={{ color: 'var(--text-faint)' }}>{styles.length}</span></h3>
        <p className="mb-2.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>Žymos tavo profiliui — pasirink mėgstamiausius žanrus.</p>
        <div className="flex flex-wrap gap-2 items-center">
          {styles.map((s, idx) => (
            <span key={s.legacy_style_id} className="group inline-flex items-center gap-1.5 rounded-full pl-2.5 pr-1.5 py-1.5" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: METER_COLORS[idx % METER_COLORS.length] }} />
              <span className="text-[12.5px] font-bold">{s.style_name}</span>
              <button onClick={() => removeStyle(s.legacy_style_id)} title="Pašalinti" className="h-4 w-4 inline-flex items-center justify-center rounded-full" style={{ color: 'var(--text-faint)' }} onMouseEnter={e => (e.currentTarget.style.color = '#f43f5e')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}><Ico name="x" size={9} /></button>
            </span>
          ))}
          <div className="relative">
            <button onClick={() => { ensureCatalog(); setOpen(o => !o) }} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-bold" style={{ background: 'transparent', border: '1px dashed var(--border-default)', color: 'var(--text-muted)' }}>+ Pridėk stilių</button>
            {open && (
              <div className="absolute left-0 z-40 mt-1.5 w-[260px] max-h-[300px] overflow-y-auto rounded-lg shadow-xl" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
                <div className="p-2 sticky top-0" style={{ background: 'var(--bg-surface)' }}><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Ieškoti stiliaus..." className="w-full rounded-md px-2.5 py-1.5 text-[12.5px] outline-none" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }} /></div>
                {!catalog ? <div className="px-3 py-3 text-center text-[12px]" style={{ color: 'var(--text-faint)' }}>Kraunama…</div> : filteredCatalog.length === 0 ? <div className="px-3 py-3 text-center text-[12px]" style={{ color: 'var(--text-faint)' }}>Nieko nerasta.</div> : <ul className="pb-1">{filteredCatalog.map(c => (<li key={c.legacy_style_id}><button onClick={() => addStyle(c)} className="w-full text-left px-3 py-1.5 text-[12.5px] font-medium" style={{ color: 'var(--text-primary)' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>{c.style_name}</button></li>))}</ul>}
              </div>
            )}
          </div>
        </div>
      </div>
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
