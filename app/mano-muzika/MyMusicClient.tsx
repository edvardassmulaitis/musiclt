'use client'
// app/mano-muzika/MyMusicClient.tsx
// ───────────────────────────────────────────────────────────────────────────
// „Mano muzika" valdymas pakopomis:
//   ⭐ Topas (max 20, drag + šokti į vietą, rodomas profilyje)
//   📦 Mėgstami (max 100, drag + šokti į vietą)
//   📚 Biblioteka (visi patiktukai, paieška + rikiavimas + puslapiavimas)
// Vienu paspaudimu keliam tarp pakopų. Mood/stiliai — atskirai.
// ───────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useRef, useMemo } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import MusicSearchPicker, { type AttachmentHit } from '@/components/MusicSearchPicker'
import type { MyMusic, KindCollection, MusicItem, MoodSong, FavStyle } from '@/lib/mano-muzika'

const TOP_CAP = 20, BUCKET_CAP = 100
type EntityTab = 'artist' | 'album' | 'track'
type Tab = EntityTab | 'mood' | 'styles'

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'artist', label: 'Atlikėjai', icon: '👤' },
  { key: 'album', label: 'Albumai', icon: '💿' },
  { key: 'track', label: 'Dainos', icon: '🎵' },
  { key: 'mood', label: 'Nuotaika', icon: '🌙' },
  { key: 'styles', label: 'Stiliai', icon: '🎚️' },
]
const PLACEHOLDER: Record<EntityTab, string> = { artist: '👤', album: '💿', track: '🎵' }
const TYPEFILTER: Record<EntityTab, AttachmentHit['type']> = { artist: 'grupe', album: 'albumas', track: 'daina' }

const LEVELS = [
  { min: 0, name: 'Naujokas', color: '#94a3b8' }, { min: 5, name: 'Klausytojas', color: '#34d399' },
  { min: 15, name: 'Melomanas', color: '#60a5fa' }, { min: 30, name: 'Žinovas', color: '#a78bfa' },
  { min: 60, name: 'Kolekcininkas', color: '#f97316' }, { min: 120, name: 'Legenda', color: '#f43f5e' },
]
function levelFor(total: number) { let i = 0; for (let k = 0; k < LEVELS.length; k++) if (total >= LEVELS[k].min) i = k; return { cur: LEVELS[i], next: LEVELS[i + 1] || null } }

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
    artist: coll.artist.top.length + coll.artist.bucket.length + coll.artist.library.length,
    album: coll.album.top.length + coll.album.bucket.length + coll.album.library.length,
    track: coll.track.top.length + coll.track.bucket.length + coll.track.library.length,
    mood: moodSongs.length, styles: styles.length,
  }
  const total = counts.artist + counts.album + counts.track
  const { cur, next } = levelFor(total)
  const toNext = next ? next.min - total : 0
  const pct = next ? Math.min(100, Math.round(((total - cur.min) / (next.min - cur.min)) * 100)) : 100

  const update = useCallback((kind: EntityTab, fn: (c: KindCollection) => KindCollection) => {
    setColl(prev => ({ ...prev, [kind]: fn(prev[kind]) }))
  }, [])

  // ── Mutations ────────────────────────────────────────────────────────────
  function moveToTier(kind: EntityTab, item: MusicItem, tier: 1 | 2) {
    const cap = tier === 1 ? TOP_CAP : BUCKET_CAP
    const targetLen = (tier === 1 ? coll[kind].top : coll[kind].bucket).length
    const alreadyHere = (tier === 1 ? coll[kind].top : coll[kind].bucket).some(x => x.id === item.id)
    if (!alreadyHere && targetLen >= cap) { flash(tier === 1 ? `Topas pilnas (maks. ${TOP_CAP})` : `„Mėgstami" pilnas (maks. ${BUCKET_CAP})`); return }
    const prev = coll[kind]
    update(kind, c => {
      const top = c.top.filter(x => x.id !== item.id), bucket = c.bucket.filter(x => x.id !== item.id), library = c.library.filter(x => x.id !== item.id)
      const moved = { ...item, tier } as MusicItem
      if (tier === 1) top.push(moved); else bucket.push(moved)
      return { top, bucket, library }
    })
    api('/tier', 'POST', { kind, entity_id: item.id, tier }).catch((e) => { update(kind, () => prev); flash(e.message) })
  }
  function backToLibrary(kind: EntityTab, item: MusicItem) {
    const prev = coll[kind]
    update(kind, c => ({
      top: c.top.filter(x => x.id !== item.id), bucket: c.bucket.filter(x => x.id !== item.id),
      library: [{ ...item, tier: 0 as const }, ...c.library.filter(x => x.id !== item.id)],
    }))
    api('/tier', 'DELETE', { kind, entity_id: item.id }).catch((e) => { update(kind, () => prev); flash(e.message) })
  }
  function unlike(kind: EntityTab, item: MusicItem) {
    const prev = coll[kind]
    update(kind, c => ({ top: c.top.filter(x => x.id !== item.id), bucket: c.bucket.filter(x => x.id !== item.id), library: c.library.filter(x => x.id !== item.id) }))
    api('/favorites', 'DELETE', { kind, entity_id: item.id }).catch((e) => { update(kind, () => prev); flash(e.message) })
  }
  function addLib(kind: EntityTab, hit: AttachmentHit) {
    if ([...coll[kind].top, ...coll[kind].bucket, ...coll[kind].library].some(x => x.id === hit.id)) return
    const item: MusicItem = { kind, id: hit.id, title: hit.title, subtitle: hit.artist || TABS.find(t => t.key === kind)!.label, cover: hit.image_url, href: null, tier: 0, sort_order: 0 }
    update(kind, c => ({ ...c, library: [item, ...c.library] }))
    api('/favorites', 'POST', { kind, entity_id: hit.id }).catch((e) => flash(e.message))
  }
  function reorderTier(kind: EntityTab, tier: 1 | 2, orderedIds: number[]) {
    update(kind, c => {
      const arr = tier === 1 ? c.top : c.bucket
      const map = new Map(arr.map(x => [x.id, x]))
      const next = orderedIds.map(id => map.get(id)).filter(Boolean) as MusicItem[]
      return tier === 1 ? { ...c, top: next } : { ...c, bucket: next }
    })
    api('/tier', 'PUT', { kind, tier, ordered_ids: orderedIds }).catch(() => {})
  }

  return (
    <div className="page-shell" style={{ color: 'var(--text-primary)' }}>
      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 top-4 z-[200] rounded-full px-4 py-2 text-[12.5px] font-bold shadow-lg"
          style={{ background: '#f43f5e', color: '#fff' }}>{toast}</div>
      )}

      {/* HEADER */}
      <div className="page-head">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1>Mano muzika</h1>
            <p>Tvarkyk savo muziką pakopomis: ⭐ Topas profilyje, 📦 Mėgstami, 📚 Biblioteka su visa kolekcija.</p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <Link href="/perkelti" className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[12.5px] font-bold text-white transition-transform hover:scale-[1.03]" style={{ background: 'var(--accent-orange)' }}>↧ Importuoti</Link>
            {username && <Link href={`/vartotojas/${username}`} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[12.5px] font-bold" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>👁 Profilis</Link>}
          </div>
        </div>
        <div className="mt-4 rounded-2xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[15px] font-black" style={{ background: `${cur.color}22`, color: cur.color }}>{cur.name[0]}</span>
              <div>
                <div className="text-[14px] font-black" style={{ color: cur.color }}>{cur.name}</div>
                <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{total} įrašai · {counts.mood} nuotaikos · {counts.styles} stiliai</div>
              </div>
            </div>
            {next && <div className="text-right text-[11.5px]" style={{ color: 'var(--text-muted)' }}>Dar <span className="font-black" style={{ color: 'var(--text-primary)' }}>{toNext}</span> iki<br /><span className="font-bold" style={{ color: next.color }}>{next.name}</span></div>}
          </div>
          <div className="h-2 w-full rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${cur.color}, ${next?.color || cur.color})` }} />
          </div>
        </div>
      </div>

      {showOnboard && (
        <div className="mb-5 rounded-2xl p-4 sm:p-5 flex items-center gap-4 flex-wrap" style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.14), rgba(167,139,250,0.12))', border: '1px solid var(--border-default)' }}>
          <div className="text-3xl">✨</div>
          <div className="flex-1 min-w-[200px]">
            <div className="text-[15px] font-black">Susidėk savo muziką per minutę</div>
            <div className="text-[12.5px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Greitas žaidimas — pasirink mėgstamus atlikėjus ir stilius.</div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/mano-muzika/pradzia" className="rounded-full px-5 py-2.5 text-[13px] font-black text-white" style={{ background: 'var(--accent-orange)' }}>Pradėti →</Link>
            <button onClick={() => { setShowOnboard(false); api('/setup', 'POST', { action: 'skip' }).catch(() => {}) }} className="rounded-full px-3 py-2.5 text-[12px] font-bold" style={{ color: 'var(--text-muted)' }}>Vėliau</button>
          </div>
        </div>
      )}

      {/* TABS */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-5 -mx-1 px-1" role="tablist">
        {TABS.map(t => {
          const c = t.key === 'mood' ? counts.mood : t.key === 'styles' ? counts.styles : counts[t.key as EntityTab]
          const active = tab === t.key
          return (
            <button key={t.key} onClick={() => setTab(t.key)} className="shrink-0 inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-bold transition-colors"
              style={{ background: active ? 'var(--accent-orange)' : 'var(--bg-elevated)', color: active ? '#fff' : 'var(--text-secondary)', border: `1px solid ${active ? 'transparent' : 'var(--border-default)'}` }}>
              <span>{t.icon}</span>{t.label}
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10.5px] font-black" style={{ background: active ? 'rgba(255,255,255,0.25)' : 'var(--bg-surface)', color: active ? '#fff' : 'var(--text-muted)' }}>{c}</span>
            </button>
          )
        })}
      </div>

      {(tab === 'artist' || tab === 'album' || tab === 'track') && (
        <CollectionPanel kind={tab} data={coll[tab]}
          onMoveTier={(item, tier) => moveToTier(tab, item, tier)}
          onBackToLibrary={(item) => backToLibrary(tab, item)}
          onUnlike={(item) => unlike(tab, item)}
          onAdd={(hit) => addLib(tab, hit)}
          onReorder={(tier, ids) => reorderTier(tab, tier, ids)} />
      )}
      {tab === 'mood' && <MoodSection moodSongs={moodSongs} setMoodSongs={setMoodSongs} />}
      {tab === 'styles' && <StyleSection styles={styles} setStyles={setStyles} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// COLLECTION PANEL — Topas + Mėgstami + Biblioteka
// ═══════════════════════════════════════════════════════════════════════════
function CollectionPanel({ kind, data, onMoveTier, onBackToLibrary, onUnlike, onAdd, onReorder }: {
  kind: EntityTab; data: KindCollection
  onMoveTier: (item: MusicItem, tier: 1 | 2) => void
  onBackToLibrary: (item: MusicItem) => void
  onUnlike: (item: MusicItem) => void
  onAdd: (hit: AttachmentHit) => void
  onReorder: (tier: 1 | 2, orderedIds: number[]) => void
}) {
  const attached: AttachmentHit[] = [...data.top, ...data.bucket, ...data.library].map(i => ({ type: TYPEFILTER[kind], id: i.id, legacy_id: null, slug: '', title: i.title, artist: null, image_url: i.cover }))
  return (
    <div className="flex flex-col gap-6">
      <TierSection title="Topas" emoji="⭐" accent="#f97316" cap={TOP_CAP} items={data.top} tier={1} kind={kind}
        onReorder={(ids) => onReorder(1, ids)} onMove={(it) => onMoveTier(it, 2)} moveLabel="→ Mėgstami" onRemove={onBackToLibrary} removeLabel="Iš topo"
        hint="Tavo top įrašai — rodomi profilyje. Tempk arba spustelėk numerį, kad pakeistum vietą." />
      <TierSection title="Mėgstami" emoji="📦" accent="#a78bfa" cap={BUCKET_CAP} items={data.bucket} tier={2} kind={kind}
        onReorder={(ids) => onReorder(2, ids)} onMove={(it) => onMoveTier(it, 1)} moveLabel="★ Į topą" onRemove={onBackToLibrary} removeLabel="Iš mėgstamų"
        hint="Atrinktas rinkinys (iki 100)." />
      <LibrarySection kind={kind} items={data.library} attached={attached} onAdd={onAdd}
        onToTop={(it) => onMoveTier(it, 1)} onToBucket={(it) => onMoveTier(it, 2)} onUnlike={onUnlike} />
    </div>
  )
}

// ── Tier (Topas / Mėgstami): drag + ▲▼ + šokti į vietą ─────────────────────
function TierSection({ title, emoji, accent, cap, items, tier, kind, onReorder, onMove, moveLabel, onRemove, removeLabel, hint }: {
  title: string; emoji: string; accent: string; cap: number; items: MusicItem[]; tier: 1 | 2; kind: EntityTab
  onReorder: (ids: number[]) => void; onMove: (it: MusicItem) => void; moveLabel: string
  onRemove: (it: MusicItem) => void; removeLabel: string; hint: string
}) {
  const dragId = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [editPos, setEditPos] = useState<number | null>(null) // item id being repositioned

  function persist(ids: number[]) { onReorder(ids) }
  function drop(targetId: number) {
    const from = dragId.current; setDragOver(null); dragId.current = null
    if (from == null || from === targetId) return
    const ids = items.map(i => i.id); const f = ids.indexOf(from), t = ids.indexOf(targetId)
    if (f < 0 || t < 0) return
    ids.splice(t, 0, ids.splice(f, 1)[0]); persist(ids)
  }
  function move(id: number, dir: -1 | 1) {
    const ids = items.map(i => i.id); const idx = ids.indexOf(id), to = idx + dir
    if (to < 0 || to >= ids.length) return
    ids.splice(to, 0, ids.splice(idx, 1)[0]); persist(ids)
  }
  function jump(id: number, pos: number) {
    setEditPos(null)
    const ids = items.map(i => i.id); const idx = ids.indexOf(id)
    let to = Math.max(1, Math.min(items.length, Math.floor(pos))) - 1
    if (idx < 0 || to === idx) return
    ids.splice(to, 0, ids.splice(idx, 1)[0]); persist(ids)
  }

  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-[15px] font-black flex items-center gap-1.5">{emoji} {title}
          <span className="text-[12px] font-bold" style={{ color: items.length >= cap ? '#f43f5e' : 'var(--text-faint)' }}>{items.length}/{cap}</span>
        </h2>
      </div>
      {items.length === 0 ? (
        <div className="rounded-xl px-4 py-5 text-[12px]" style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border-default)', color: 'var(--text-muted)' }}>{hint}</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((it, idx) => (
            <li key={it.id} draggable onDragStart={() => { dragId.current = it.id }} onDragOver={e => { e.preventDefault(); setDragOver(it.id) }}
              onDragLeave={() => setDragOver(o => o === it.id ? null : o)} onDrop={() => drop(it.id)}
              className="group flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors"
              style={{ background: 'var(--bg-surface)', border: `1px solid ${dragOver === it.id ? accent : 'var(--border-default)'}` }}>
              <span className="hidden sm:inline cursor-grab active:cursor-grabbing select-none text-[var(--text-faint)] px-0.5" title="Tempk">⠿</span>
              {editPos === it.id ? (
                <input autoFocus type="number" min={1} max={items.length} defaultValue={idx + 1}
                  onKeyDown={e => { if (e.key === 'Enter') jump(it.id, Number((e.target as HTMLInputElement).value)); if (e.key === 'Escape') setEditPos(null) }}
                  onBlur={e => jump(it.id, Number(e.target.value))}
                  className="w-9 h-7 text-center text-[12px] font-black rounded-md outline-none" style={{ background: 'var(--bg-elevated)', border: `1px solid ${accent}`, color: 'var(--text-primary)' }} />
              ) : (
                <button onClick={() => setEditPos(it.id)} title="Spustelėk ir įrašyk vietą" className="w-7 h-7 shrink-0 rounded-md text-[12px] font-black tabular-nums" style={{ background: 'var(--bg-elevated)', color: accent }}>{idx + 1}</button>
              )}
              <div className="flex flex-col gap-0.5">
                <button onClick={() => move(it.id, -1)} disabled={idx === 0} aria-label="Aukštyn" className="h-5 w-6 inline-flex items-center justify-center rounded text-[10px] disabled:opacity-20" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>▲</button>
                <button onClick={() => move(it.id, 1)} disabled={idx === items.length - 1} aria-label="Žemyn" className="h-5 w-6 inline-flex items-center justify-center rounded text-[10px] disabled:opacity-20" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>▼</button>
              </div>
              <Cover kind={kind} cover={it.cover} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-bold">{it.href ? <Link href={it.href} className="hover:underline">{it.title}</Link> : it.title}</div>
                <div className="truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>{it.subtitle}</div>
              </div>
              <button onClick={() => onMove(it)} className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>{moveLabel}</button>
              <button onClick={() => onRemove(it)} title={removeLabel} className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-lg" style={{ color: 'var(--text-faint)' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#f43f5e')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l10 10M13 3L3 13" /></svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ── Biblioteka: paieška + rikiavimas + puslapiavimas + one-click į pakopas ──
function LibrarySection({ kind, items, attached, onAdd, onToTop, onToBucket, onUnlike }: {
  kind: EntityTab; items: MusicItem[]; attached: AttachmentHit[]
  onAdd: (hit: AttachmentHit) => void; onToTop: (it: MusicItem) => void; onToBucket: (it: MusicItem) => void; onUnlike: (it: MusicItem) => void
}) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'recent' | 'az'>('recent')
  const [limit, setLimit] = useState(40)

  const filtered = useMemo(() => {
    let arr = items
    const term = q.trim().toLowerCase()
    if (term) arr = arr.filter(i => i.title.toLowerCase().includes(term) || i.subtitle.toLowerCase().includes(term))
    if (sort === 'az') arr = [...arr].sort((a, b) => a.title.localeCompare(b.title, 'lt'))
    return arr
  }, [items, q, sort])
  const shown = filtered.slice(0, limit)

  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-[15px] font-black">📚 Biblioteka <span className="text-[12px] font-bold" style={{ color: 'var(--text-faint)' }}>{items.length}</span></h2>
      </div>
      <div className="mb-3 max-w-[560px]"><MusicSearchPicker attached={attached} onAdd={onAdd} typeFilter={TYPEFILTER[kind]} placeholder={`Pridėk ${kind === 'artist' ? 'atlikėją' : kind === 'album' ? 'albumą' : 'dainą'}...`} /></div>

      {items.length === 0 ? (
        <div className="rounded-2xl px-6 py-8 text-center" style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border-default)' }}>
          <div className="text-2xl mb-1 opacity-60">🎶</div>
          <div className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>Bibliotekoje tuščia. Pridėk per paiešką arba <Link href="/perkelti" className="underline" style={{ color: 'var(--accent-orange)' }}>importuok</Link>.</div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-2.5">
            <div className="relative flex-1 max-w-[320px]">
              <input value={q} onChange={e => { setQ(e.target.value); setLimit(40) }} placeholder="Ieškoti bibliotekoje..." className="w-full rounded-lg px-3 py-2 text-[12.5px] outline-none" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }} />
            </div>
            <button onClick={() => setSort(s => s === 'recent' ? 'az' : 'recent')} className="rounded-lg px-3 py-2 text-[12px] font-bold" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
              {sort === 'recent' ? 'Naujausi' : 'A–Ž'} ↕
            </button>
          </div>
          <ul className="flex flex-col gap-1.5">
            {shown.map(it => (
              <li key={it.id} className="group flex items-center gap-2.5 rounded-xl px-2.5 py-2" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
                <Cover kind={kind} cover={it.cover} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-bold">{it.href ? <Link href={it.href} className="hover:underline">{it.title}</Link> : it.title}</div>
                  <div className="truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>{it.subtitle}</div>
                </div>
                <button onClick={() => onToTop(it)} title="Į topą" className="shrink-0 h-7 inline-flex items-center gap-1 rounded-full px-2.5 text-[11px] font-bold" style={{ background: 'rgba(249,115,22,0.12)', color: '#f97316' }}>⭐ Topas</button>
                <button onClick={() => onToBucket(it)} title="Į mėgstamus" className="shrink-0 h-7 inline-flex items-center gap-1 rounded-full px-2.5 text-[11px] font-bold" style={{ background: 'rgba(167,139,250,0.12)', color: '#a78bfa' }}>📦 Mėgstami</button>
                <button onClick={() => onUnlike(it)} title="Pašalinti visai" className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-faint)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#f43f5e')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l10 10M13 3L3 13" /></svg>
                </button>
              </li>
            ))}
          </ul>
          {filtered.length > limit && (
            <div className="mt-3 text-center">
              <button onClick={() => setLimit(l => l + 40)} className="rounded-full px-5 py-2 text-[12.5px] font-bold" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>Rodyti daugiau ({filtered.length - limit})</button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function Cover({ kind, cover }: { kind: EntityTab; cover: string | null }) {
  return (
    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={proxyImg(cover)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
      ) : <div className="flex h-full w-full items-center justify-center text-[15px] opacity-50">{PLACEHOLDER[kind]}</div>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MOOD SECTION
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
              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg" style={{ background: 'var(--bg-elevated)' }}>{m.track?.cover_url ? (/* eslint-disable-next-line @next/next/no-img-element */<img src={proxyImg(m.track.cover_url)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />) : <div className="flex h-full w-full items-center justify-center text-[16px] opacity-50">🎵</div>}</div>
              <div className="min-w-0 flex-1"><div className="truncate text-[13.5px] font-bold">{m.track?.title || '—'}</div><div className="truncate text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{m.track?.artist?.name || 'Daina'}</div></div>
              {m.is_active ? <span className="shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-black" style={{ background: 'rgba(167,139,250,0.18)', color: '#a78bfa' }}>🌙 Aktyvi</span>
                : <button onClick={() => setActive(m.track_id)} className="shrink-0 rounded-full px-3 py-1 text-[11px] font-bold" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>Nustatyti aktyvia</button>}
              <button onClick={() => remove(m.track_id)} title="Pašalinti" className="shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-faint)' }} onMouseEnter={e => (e.currentTarget.style.color = '#f43f5e')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l10 10M13 3L3 13" /></svg></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLE SECTION
// ═══════════════════════════════════════════════════════════════════════════
function StyleSection({ styles, setStyles }: { styles: FavStyle[]; setStyles: (v: FavStyle[]) => void }) {
  const [catalog, setCatalog] = useState<{ legacy_style_id: number; style_slug: string; style_name: string }[] | null>(null)
  const [q, setQ] = useState(''); const [open, setOpen] = useState(false)
  const dragId = useRef<number | null>(null); const [dragOver, setDragOver] = useState<number | null>(null)
  async function ensureCatalog() { if (catalog) return; try { const r = await api('/styles?catalog=1', 'GET'); setCatalog(r.catalog || []) } catch { setCatalog([]) } }
  function add(s: { legacy_style_id: number; style_slug: string; style_name: string }) { if (styles.some(x => x.legacy_style_id === s.legacy_style_id)) return; setStyles([...styles, { ...s, sort_order: 9999 }]); setQ(''); setOpen(false); api('/styles', 'POST', s).catch(() => setStyles(styles)) }
  function remove(id: number) { setStyles(styles.filter(x => x.legacy_style_id !== id)); api('/styles', 'DELETE', { legacy_style_id: id }).catch(() => setStyles(styles)) }
  function persistOrder(ids: number[]) { const map = new Map(styles.map(s => [s.legacy_style_id, s])); setStyles(ids.map(id => map.get(id)).filter(Boolean) as FavStyle[]); api('/styles', 'PUT', { ordered_ids: ids }).catch(() => {}) }
  function drop(targetId: number) { const from = dragId.current; setDragOver(null); dragId.current = null; if (from == null || from === targetId) return; const ids = styles.map(s => s.legacy_style_id); const f = ids.indexOf(from), t = ids.indexOf(targetId); if (f < 0 || t < 0) return; ids.splice(t, 0, ids.splice(f, 1)[0]); persistOrder(ids) }
  const filtered = (catalog || []).filter(c => !styles.some(s => s.legacy_style_id === c.legacy_style_id)).filter(c => q.trim().length < 2 || c.style_name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 40)
  return (
    <div>
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
        <div className="flex flex-wrap gap-2">
          {styles.map((s, idx) => (
            <span key={s.legacy_style_id} draggable onDragStart={() => { dragId.current = s.legacy_style_id }} onDragOver={e => { e.preventDefault(); setDragOver(s.legacy_style_id) }} onDragLeave={() => setDragOver(o => o === s.legacy_style_id ? null : o)} onDrop={() => drop(s.legacy_style_id)}
              className="group inline-flex items-center gap-2 rounded-full pl-2.5 pr-1.5 py-1.5 cursor-grab active:cursor-grabbing" style={{ background: 'var(--bg-elevated)', border: `1px solid ${dragOver === s.legacy_style_id ? 'var(--accent-orange)' : 'var(--border-default)'}` }}>
              <span className="text-[11px] font-black tabular-nums" style={{ color: 'var(--text-faint)' }}>{idx + 1}</span>
              <span className="text-[12.5px] font-bold">{s.style_name}</span>
              <button onClick={() => remove(s.legacy_style_id)} title="Pašalinti" className="h-5 w-5 inline-flex items-center justify-center rounded-full" style={{ color: 'var(--text-faint)' }} onMouseEnter={e => (e.currentTarget.style.color = '#f43f5e')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}><svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M3 3l10 10M13 3L3 13" /></svg></button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function Empty({ hint }: { hint: string }) {
  return <div className="rounded-2xl px-6 py-10 text-center" style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border-default)' }}><div className="text-3xl mb-2 opacity-60">🎶</div><div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>{hint}</div></div>
}
