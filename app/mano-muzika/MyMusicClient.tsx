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
import SeenLivePanel from './SeenLivePanel'
import { SideEqualizer } from '@/components/profile/SideEqualizer'
import { StreamFeed } from '@/components/srautas/StreamFeed'
import type { MyMusic, KindCollection, MusicItem, MoodSong, FavStyle } from '@/lib/mano-muzika'

// Vieno stiliaus/substiliaus selektorius — bendras equalizeriui ir pill'ams.
type StyleSel = { key: string; label: string; color: string; match: (it: MusicItem) => boolean }

const PROFILE_CUTOFF = 20
type EntityTab = 'artist' | 'album' | 'track'
type Tab = EntityTab | 'mood' | 'styles' | 'discoveries' | 'seen-live'
const TYPEFILTER: Record<EntityTab, AttachmentHit['type']> = { artist: 'grupe', album: 'albumas', track: 'daina' }
const TABS: { key: Tab; label: string; icon: IcoName }[] = [
  { key: 'discoveries', label: 'Atradimai', icon: 'compass' },
  { key: 'artist', label: 'Atlikėjai', icon: 'person' }, { key: 'album', label: 'Albumai', icon: 'disc' },
  { key: 'track', label: 'Dainos', icon: 'note' }, { key: 'mood', label: 'Nuotaikos dainos', icon: 'repeat' }, { key: 'styles', label: 'Stiliai', icon: 'sliders' },
  { key: 'seen-live', label: 'Matyti gyvai', icon: 'mic' },
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
  const [tab, setTab] = useState<Tab>('discoveries')
  const [coll, setColl] = useState<Colls>({ artist: initial.artist, album: initial.album, track: initial.track })
  const [moodSongs, setMoodSongs] = useState<MoodSong[]>(initial.moodSongs)
  const [styles, setStyles] = useState<FavStyle[]>(initial.styles)
  const [showOnboard, setShowOnboard] = useState(suggestOnboarding)
  const [toast, setToast] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false) // mobile ⋯ meniu
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
    const item: MusicItem = { kind, id: hit.id, title: hit.title, subtitle: hit.artist || TABS.find(t => t.key === kind)!.label, cover: hit.image_url, href: null, ranked: false, sort_order: 0, style: null, substyleIds: [], styleRanks: {} }
    update(kind, c => ({ ...c, library: [item, ...c.library] }))
    api('/favorites', 'POST', { kind, entity_id: hit.id }).catch(e => flash(e.message))
  }
  // Per-stiliaus topo perrikiavimas (atskira nuo bendro sąrašo).
  function styleReorder(kind: EntityTab, styleKey: string, orderedIds: number[]) {
    const rankMap = new Map(orderedIds.map((id, i) => [id, i]))
    update(kind, c => {
      const apply = (arr: MusicItem[]) => arr.map(x => rankMap.has(x.id) ? { ...x, styleRanks: { ...x.styleRanks, [styleKey]: rankMap.get(x.id)! } } : x)
      return { ranked: apply(c.ranked), library: apply(c.library) }
    })
    api('/style-rank', 'PUT', { kind, style_key: styleKey, ordered_ids: orderedIds }).catch(() => {})
  }

  return (
    <div className="page-shell" style={{ color: 'var(--text-primary)' }}>
      {toast && <div className="fixed left-1/2 -translate-x-1/2 top-4 z-[200] rounded-full px-4 py-2 text-[14px] font-bold shadow-lg" style={{ background: '#f43f5e', color: '#fff' }}>{toast}</div>}

      <div className="page-head">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1>Mano muzika</h1>
            <p className="!mt-0.5 hidden sm:block">Vienas mėgstamiausių sąrašas — pirmi 20 rodomi tavo profilyje.</p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            {/* Desktop — pilnos nuorodos */}
            <Link href="/perkelti" className="hidden sm:inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[14px] font-bold text-white transition-transform hover:scale-[1.03]" style={{ background: 'var(--accent-orange)' }}><Ico name="download" size={13} /> Importuoti <BrandIcons /></Link>
            {username && <Link href={`/vartotojas/${username}`} className="hidden sm:inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[14px] font-bold" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}><Ico name="eye" size={13} /> Profilis</Link>}
            {/* Mobile — ⋯ meniu (kompaktiška: importai, profilis, užpildymas) */}
            <div className="relative sm:hidden">
              <button onClick={() => setMenuOpen(o => !o)} aria-label="Daugiau" className="inline-flex items-center justify-center w-9 h-9 rounded-full" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-[90]" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 mt-2 z-[100] w-60 rounded-2xl p-2 shadow-xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
                    <Link href="/perkelti" className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-[14px] font-bold text-white mb-1" style={{ background: 'var(--accent-orange)' }}><Ico name="download" size={14} /> Importuoti muziką</Link>
                    {username && <Link href={`/vartotojas/${username}`} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-[14px] font-bold mb-2" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}><Ico name="eye" size={14} /> Mano profilis</Link>}
                    <div className="px-1 pt-1 pb-1.5 text-[12px] font-black uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>Užpildymas</div>
                    <div className="flex flex-wrap gap-1.5 px-1 pb-1">
                      <Goal label="Atlikėjai" n={counts.artist} t={TARGETS.artists} /><Goal label="Albumai" n={counts.album} t={TARGETS.albums} />
                      <Goal label="Dainos" n={counts.track} t={TARGETS.tracks} /><Goal label="Stiliai" n={counts.styles} t={TARGETS.styles} />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        {/* Progreso juosta — mobile tik % + juosta; chip'ai (užpildymas) keliasi į ⋯ meniu. */}
        <div className="mt-3 rounded-xl px-3 py-2 flex items-center gap-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[14px] font-black" style={{ color: 'var(--accent-orange)' }}>{pct}%</span>
            <span className="text-[14px] font-bold" style={{ color: 'var(--text-muted)' }}>užpildyta</span>
          </div>
          <div className="h-1.5 flex-1 min-w-[80px] rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}><div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--accent-orange), #a78bfa)' }} /></div>
          <div className="hidden sm:flex flex-wrap gap-1.5 shrink-0">
            <Goal label="Atlikėjai" n={counts.artist} t={TARGETS.artists} /><Goal label="Albumai" n={counts.album} t={TARGETS.albums} />
            <Goal label="Dainos" n={counts.track} t={TARGETS.tracks} /><Goal label="Stiliai" n={counts.styles} t={TARGETS.styles} />
          </div>
        </div>
      </div>

      {showOnboard && (
        <div className="mb-5 rounded-2xl p-4 sm:p-5 flex items-center gap-4 flex-wrap" style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.14), rgba(167,139,250,0.12))', border: '1px solid var(--border-default)' }}>
          <Ico name="sparkle" size={26} />
          <div className="flex-1 min-w-[200px]"><div className="text-[16px] font-black">Susidėk savo muziką per minutę</div><div className="text-[14px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Greitas žaidimas — pasirink mėgstamus atlikėjus ir stilius.</div></div>
          <div className="flex items-center gap-2"><Link href="/mano-muzika/pradzia" className="rounded-full px-5 py-2.5 text-[14px] font-black text-white" style={{ background: 'var(--accent-orange)' }}>Pradėti →</Link><button onClick={() => { setShowOnboard(false); api('/setup', 'POST', { action: 'skip' }).catch(() => {}) }} className="rounded-full px-3 py-2.5 text-[14px] font-bold" style={{ color: 'var(--text-muted)' }}>Vėliau</button></div>
        </div>
      )}

      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-5 -mx-1 px-1" role="tablist">
        {TABS.map(t => {
          const c = t.key === 'discoveries' ? null : t.key === 'mood' ? counts.mood : t.key === 'styles' ? counts.styles : counts[t.key as EntityTab]
          const active = tab === t.key
          return (
            <button key={t.key} onClick={() => setTab(t.key)} className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[14px] font-bold transition-colors"
              style={{ background: active ? 'var(--accent-orange)' : 'var(--bg-elevated)', color: active ? '#fff' : 'var(--text-secondary)', border: `1px solid ${active ? 'transparent' : 'var(--border-default)'}` }}>
              <Ico name={t.icon} size={14} />{t.label}
              {c != null && <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[12px] font-black" style={{ background: active ? 'rgba(255,255,255,0.25)' : 'var(--bg-surface)', color: active ? '#fff' : 'var(--text-muted)' }}>{c}</span>}
            </button>
          )
        })}
      </div>

      {tab === 'discoveries' && (
        <div>
          <p className="mb-4 text-[14px]" style={{ color: 'var(--text-muted)' }}><b style={{ color: 'var(--text-secondary)' }}>Mėgstami</b> — naujienos, koncertai ir muzika iš tavo atlikėjų. <b style={{ color: 'var(--text-secondary)' }}>Tau gali patikti</b> — atradimai pagal tavo skonį. Širdele pažymėk, kas patinka — rekomendacijos taps tikslesnės.</p>
          <StreamFeed embedded showManageLink={false} />
        </div>
      )}
      {(tab === 'artist' || tab === 'album' || tab === 'track') && (
        <CollectionPanel key={tab} kind={tab} data={coll[tab]} onMove={(it, pos) => moveToPosition(tab, it, pos)} onUnlike={(it) => unlike(tab, it)} onAdd={(hit) => addLib(tab, hit)} />
      )}
      {tab === 'mood' && <MoodSection moodSongs={moodSongs} setMoodSongs={setMoodSongs} />}
      {tab === 'styles' && <StyleSection coll={coll} styles={styles} setStyles={setStyles} meterRaw={initial.meterRaw || []} onStyleReorder={(kind, styleKey, ids) => styleReorder(kind, styleKey, ids)} onUnlike={(kind, it) => unlike(kind, it)} />}
      {tab === 'seen-live' && <SeenLivePanel flash={flash} />}
    </div>
  )
}

// Importo platformų ženkliukai (Spotify / Last.fm / YouTube) — patikimumui.
function BrandIcons() {
  return (
    <span className="inline-flex items-center gap-1 ml-1 pl-1.5" style={{ borderLeft: '1px solid rgba(255,255,255,0.35)' }} aria-hidden>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.586 14.424a.622.622 0 0 1-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.622.622 0 1 1-.277-1.215c3.809-.87 7.077-.496 9.713 1.115a.623.623 0 0 1 .206.857zm1.223-2.722a.78.78 0 0 1-1.072.257c-2.687-1.652-6.785-2.131-9.965-1.166a.779.779 0 1 1-.452-1.491c3.632-1.102 8.147-.568 11.234 1.328a.78.78 0 0 1 .255 1.072zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.935.935 0 1 1-.542-1.79c3.532-1.072 9.404-.865 13.115 1.338a.936.936 0 1 1-.956 1.609z"/></svg>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M10.584 17.21l-.88-2.392s-1.43 1.595-3.573 1.595c-1.897 0-3.244-1.649-3.244-4.288 0-3.382 1.704-4.591 3.381-4.591 2.42 0 3.188 1.567 3.847 3.574l.66 2.063c.88 2.749 2.529 4.948 7.285 4.948 3.409 0 5.722-1.044 5.722-3.793 0-2.227-1.265-3.381-3.628-3.936l-1.76-.385c-1.21-.275-1.567-.77-1.567-1.595 0-.935.742-1.485 1.952-1.485 1.32 0 2.034.495 2.144 1.677l2.749-.33c-.22-2.474-1.924-3.492-4.729-3.492-2.474 0-4.893.935-4.893 3.932 0 1.87.907 3.051 3.188 3.601l1.87.44c1.402.33 1.869.907 1.869 1.704 0 1.017-.99 1.43-2.86 1.43-2.776 0-3.929-1.456-4.591-3.464l-.907-2.749c-1.155-3.574-3-4.893-6.655-4.893C2.144 5.333 0 7.89 0 12.233c0 4.18 2.144 6.434 5.997 6.434 3.106 0 4.591-1.457 4.591-1.457z"/></svg>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
    </span>
  )
}

function Goal({ label, n, t }: { label: string; n: number; t: number }) {
  const done = n >= t
  return <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[14px] font-bold" style={{ background: 'var(--bg-elevated)', color: done ? '#34d399' : 'var(--text-muted)' }}>{label} {Math.min(n, t)}/{t}{done ? ' ✓' : ''}</span>
}

// ═══════════════════════════════════════════════════════════════════════════
function CollectionPanel({ kind, data, onMove, onUnlike, onAdd }: {
  kind: EntityTab; data: KindCollection; onMove: (it: MusicItem, pos: number) => void; onUnlike: (it: MusicItem) => void; onAdd: (hit: AttachmentHit) => void
}) {
  const items = useMemo(() => [...data.ranked, ...data.library], [data])
  const attached: AttachmentHit[] = items.map(i => ({ type: TYPEFILTER[kind], id: i.id, legacy_id: null, slug: '', title: i.title, artist: null, image_url: i.cover }))
  const ownedIds = useMemo(() => new Set(items.map(i => i.id)), [items])
  const noun = kind === 'artist' ? 'atlikėją' : kind === 'album' ? 'albumą' : 'dainą'
  const main = (
    <>
      <div className="mb-4"><MusicSearchPicker attached={attached} onAdd={onAdd} typeFilter={TYPEFILTER[kind]} placeholder={`Surask ir pridėk ${noun}...`} /></div>
      <OneList kind={kind} items={items} onMove={onMove} onUnlike={onUnlike} />
    </>
  )
  // Visiems tipams — sąrašas + pasiūlymai šalia (desktop), mobiliame apačioje.
  return (
    <section className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-5 lg:gap-7 items-start">
      <div className="min-w-0">{main}</div>
      <SuggestionsPanel kind={kind} ownedIds={ownedIds} onAdd={onAdd} />
    </section>
  )
}

// Pasiūlymai — populiarūs atlikėjai/albumai/dainos (iš mėgstamų atlikėjų / music.lt),
// kurių narys dar neturi. Pridėjimas = širdelė (kaip visur).
const SUG_SUB: Record<EntityTab, string> = {
  artist: 'Atlikėjai, kurie galėtų patikti — pridėk į savo sąrašą.',
  album: 'Albumai iš tavo mėgstamų atlikėjų — pridėk į savo sąrašą.',
  track: 'Dainos iš tavo mėgstamų atlikėjų — pridėk į savo sąrašą.',
}
function SuggestionsPanel({ kind, ownedIds, onAdd }: { kind: EntityTab; ownedIds: Set<number>; onAdd: (hit: AttachmentHit) => void }) {
  const [items, setItems] = useState<TrackSug[] | null>(null)
  const [added, setAdded] = useState<Set<number>>(new Set())
  const [dismissed, setDismissed] = useState<Set<number>>(new Set())
  const loadRef = useRef<EntityTab | null>(null)
  if (loadRef.current !== kind) {
    loadRef.current = kind
    setItems(null); setAdded(new Set()); setDismissed(new Set())
    api(`/suggestions?kind=${kind}&limit=30`, 'GET').then(r => setItems((r.items || r.tracks || []) as TrackSug[])).catch(() => setItems([]))
  }
  const fallbackLabel = kind === 'artist' ? 'Atlikėjas' : kind === 'album' ? 'Albumas' : 'Daina'
  const visible = (items || []).filter(t => !ownedIds.has(t.id) && !added.has(t.id) && !dismissed.has(t.id)).slice(0, 14)
  function pick(t: TrackSug) {
    setAdded(s => new Set(s).add(t.id))
    onAdd({ type: TYPEFILTER[kind], id: t.id, legacy_id: null, slug: t.slug, title: t.title, artist: t.artist?.name || null, image_url: t.cover_url })
  }
  function dismiss(t: TrackSug) {
    setDismissed(s => new Set(s).add(t.id))
    api('/suggestions', 'POST', { kind, entity_id: t.id }).catch(() => {})
  }
  return (
    <aside className="rounded-2xl p-3.5 lg:sticky lg:top-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
      <div className="flex items-center gap-1.5 mb-1"><span style={{ color: 'var(--accent-orange)' }}><Ico name="sparkle" size={15} /></span><h3 className="text-[14px] font-black">Galbūt patiks</h3></div>
      <p className="text-[14px] mb-3" style={{ color: 'var(--text-muted)' }}>{SUG_SUB[kind]} <span style={{ color: 'var(--text-faint)' }}>Širdelė — pridėti, ✕ — paslėpti (daugiau nesiūlysim).</span></p>
      {items === null ? (
        <div className="text-[14px] py-4 text-center" style={{ color: 'var(--text-faint)' }}>Kraunama…</div>
      ) : visible.length === 0 ? (
        <div className="text-[14px] py-4 text-center" style={{ color: 'var(--text-faint)' }}>{kind === 'artist' ? 'Šiuo metu pasiūlymų nėra.' : 'Pridėk daugiau atlikėjų — atsiras pasiūlymų.'}</div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {visible.map(t => (
            <li key={t.id} className="group flex items-center gap-2 rounded-xl px-2 py-1.5" style={{ background: 'var(--bg-elevated)' }}>
              <Cover kind={kind} cover={t.cover_url} />
              <div className="min-w-0 flex-1"><div className="truncate text-[14px] font-bold">{t.title}</div><div className="truncate text-[12px]" style={{ color: 'var(--text-muted)' }}>{t.artist?.name || fallbackLabel}</div></div>
              <button onClick={() => pick(t)} title="Pridėti į mėgstamus" className="shrink-0 h-7 w-7 inline-flex items-center justify-center transition hover:scale-110" style={{ color: 'var(--accent-orange)' }}><Ico name="heart" size={16} /></button>
              <button onClick={() => dismiss(t)} title="Paslėpti — daugiau nesiūlyti" className="shrink-0 h-7 w-7 inline-flex items-center justify-center opacity-45 group-hover:opacity-100 transition" style={{ color: 'var(--text-faint)' }}><Ico name="x" size={14} /></button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
type TrackSug = { id: number; slug: string; title: string; cover_url: string | null; artist: { slug: string; name: string } | null; reason: string }

// VIENAS sąrašas: rikiuoti + likę patiktukai, ištisinė numeracija; pirmi 20 → profilyje.
function OneList({ kind, items, onMove, onUnlike }: { kind: EntityTab; items: MusicItem[]; onMove: (it: MusicItem, pos: number) => void; onUnlike: (it: MusicItem) => void }) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'order' | 'az' | 'style'>('order')
  const [limit, setLimit] = useState(200)
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
        <h2 className="text-[16px] font-black flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}><span style={{ color: 'var(--accent-orange)' }}><Ico name="heartFull" size={15} /></span> Mėgstami <span className="text-[14px] font-bold" style={{ color: 'var(--text-faint)' }}>{items.length}</span></h2>
        {items.length > 0 && (
          <div className="flex items-center gap-2">
            <input value={q} onChange={e => { setQ(e.target.value); setLimit(200) }} placeholder="Ieškoti sąraše..." className="w-[200px] sm:w-[240px] rounded-lg px-3 py-1.5 text-[14px] outline-none" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }} />
            <button onClick={nextSort} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[14px] font-bold" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>{sortLabel} <Ico name="sort" size={12} /></button>
          </div>
        )}
      </div>
      {items.length === 0 ? (
        <div className="rounded-xl px-4 py-6 text-[14px] text-center" style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border-default)', color: 'var(--text-muted)' }}>
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
                  <div className="flex items-center gap-2 my-2 px-1"><div className="flex-1 h-px" style={{ background: 'var(--border-default)' }} /><span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>↑ Top {PROFILE_CUTOFF} rodoma profilyje</span><div className="flex-1 h-px" style={{ background: 'var(--border-default)' }} /></div>
                )}
                <div draggable={!browsing} onDragStart={() => { if (!browsing) dragId.current = it.id }} onDragOver={e => { if (!browsing) { e.preventDefault(); setDragOver(it.id) } }} onDragLeave={() => setDragOver(o => o === it.id ? null : o)} onDrop={() => { if (!browsing) drop(it.id) }}
                  className="group flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors"
                  style={{ background: inProfile ? 'linear-gradient(90deg, rgba(249,115,22,0.06), var(--bg-surface) 60%)' : 'var(--bg-surface)', border: `1px solid ${dragOver === it.id ? 'var(--accent-orange)' : 'var(--border-default)'}` }}>
                  {!browsing && <span className="hidden sm:inline cursor-grab active:cursor-grabbing select-none text-[var(--text-faint)]" title="Tempk"><Ico name="grip" size={13} /></span>}
                  {jumpId === it.id ? (
                    <input autoFocus type="number" min={1} max={items.length} defaultValue={pos + 1}
                      onKeyDown={e => { if (e.key === 'Enter') { setJumpId(null); onMove(it, Number((e.target as HTMLInputElement).value) || 1) } if (e.key === 'Escape') setJumpId(null) }} onBlur={e => { setJumpId(null); onMove(it, Number(e.target.value) || pos + 1) }}
                      className="w-11 h-7 text-center text-[14px] font-black rounded-md outline-none" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--accent-orange)', color: 'var(--text-primary)' }} />
                  ) : (
                    <button onClick={() => setJumpId(it.id)} title="Spustelėk ir įrašyk vietą" className="min-w-[28px] h-7 px-1 shrink-0 rounded-md text-[14px] font-black tabular-nums" style={{ background: 'var(--bg-elevated)', color: inProfile ? 'var(--accent-orange)' : 'var(--text-muted)' }}>{pos + 1}</button>
                  )}
                  {!browsing && (
                    <div className="flex flex-col gap-0.5">
                      <button onClick={() => move(it.id, -1)} disabled={pos === 0} aria-label="Aukštyn" className="h-5 w-6 inline-flex items-center justify-center rounded disabled:opacity-20" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}><Ico name="up" size={11} /></button>
                      <button onClick={() => move(it.id, 1)} disabled={pos === items.length - 1} aria-label="Žemyn" className="h-5 w-6 inline-flex items-center justify-center rounded disabled:opacity-20" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}><Ico name="down" size={11} /></button>
                    </div>
                  )}
                  <Cover kind={kind} cover={it.cover} />
                  <div className="min-w-0 flex-1"><div className="truncate text-[14px] font-bold">{it.href ? <Link href={it.href} className="hover:underline">{it.title}</Link> : it.title}</div><div className="truncate text-[14px] flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>{it.subtitle}{it.style && <span className="rounded px-1.5 py-0.5 text-[12px] font-bold" style={{ background: 'var(--bg-elevated)', color: 'var(--text-faint)' }}>{it.style}</span>}</div></div>
                  {!inProfile && <button onClick={() => onMove(it, PROFILE_CUTOFF)} title="Įkelti į Top 20" className="shrink-0 h-7 inline-flex items-center gap-1 rounded-full px-2.5 text-[14px] font-bold" style={{ background: 'rgba(249,115,22,0.12)', color: 'var(--accent-orange)' }}><Ico name="star" size={12} /> Top 20</button>}
                  <button onClick={() => onUnlike(it)} title="Pašalinti iš mėgstamų" className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-faint)' }} onMouseEnter={e => (e.currentTarget.style.color = '#f43f5e')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}><Ico name="x" size={14} /></button>
                </div>
              </div>
            )
          })}
          {view.length > limit && <div className="mt-1 flex items-center justify-center gap-2"><button onClick={() => setLimit(l => l + 200)} className="rounded-full px-5 py-2 text-[14px] font-bold" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>Rodyti daugiau ({view.length - limit})</button><button onClick={() => setLimit(view.length)} className="rounded-full px-4 py-2 text-[14px] font-bold" style={{ background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-muted)' }}>Rodyti visus</button></div>}
          {view.length === 0 && <div className="text-center text-[14px] py-4" style={{ color: 'var(--text-faint)' }}>Nieko nerasta.</div>}
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
// Nuotaikos dainos — rikiuojamas top 20. #1 = aktyvi (rodoma profilio viršuje;
// paspaudus profilyje atsidaro grotuvas su visomis). Valdymas kaip pagrindiniame
// sąraše: tempk, ↑/↓ arba įrašyk poziciją.
const MOOD_MAX = 20
function MoodSection({ moodSongs, setMoodSongs }: { moodSongs: MoodSong[]; setMoodSongs: (v: MoodSong[]) => void }) {
  const dragId = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [jumpId, setJumpId] = useState<number | null>(null)
  const items = moodSongs
  const full = items.length >= MOOD_MAX

  function commit(ordered: MoodSong[]) {
    setMoodSongs(ordered.map((m, i) => ({ ...m, sort_order: i, is_active: i === 0 })))
    api('/mood', 'PUT', { ordered_ids: ordered.map(m => m.id) }).catch(() => {})
  }
  function move(idx: number, dir: -1 | 1) { const to = idx + dir; if (to < 0 || to >= items.length) return; const a = [...items]; a.splice(to, 0, a.splice(idx, 1)[0]); commit(a) }
  function jump(idx: number, pos: number) { const to = Math.max(0, Math.min(items.length - 1, Math.floor(pos) - 1)); if (to === idx) return; const a = [...items]; a.splice(to, 0, a.splice(idx, 1)[0]); commit(a) }
  function drop(targetIdx: number) { const from = dragId.current; setDragOver(null); dragId.current = null; if (from == null) return; const fi = items.findIndex(m => m.id === from); if (fi < 0 || fi === targetIdx) return; const a = [...items]; a.splice(targetIdx, 0, a.splice(fi, 1)[0]); commit(a) }
  function add(hit: AttachmentHit) {
    if (items.some(m => m.track_id === hit.id) || full) return
    const makeActive = items.length === 0
    const row: MoodSong = { id: -Date.now(), track_id: hit.id, mood_label: null, is_active: makeActive, sort_order: items.length, track: { id: hit.id, slug: hit.slug, title: hit.title, cover_url: hit.image_url, artist: hit.artist ? { slug: '', name: hit.artist } : null } }
    setMoodSongs([...items, row])
    api('/mood', 'POST', { track_id: hit.id, make_active: makeActive }).catch(() => setMoodSongs(items))
  }
  function remove(trackId: number) { const next = items.filter(m => m.track_id !== trackId).map((m, i) => ({ ...m, is_active: i === 0 })); setMoodSongs(next); api('/mood', 'DELETE', { track_id: trackId }).catch(() => setMoodSongs(items)) }
  const attached: AttachmentHit[] = items.map(m => ({ type: 'daina', id: m.track_id, legacy_id: null, slug: '', title: m.track?.title || '', artist: null, image_url: m.track?.cover_url || null }))

  return (
    <div>
      <p className="mb-3 text-[14px]" style={{ color: 'var(--text-muted)' }}>Top {MOOD_MAX} nuotaikos dainų. <b style={{ color: 'var(--text-secondary)' }}>#1</b> rodoma profilio viršuje; profilyje paspaudus atsidaro grotuvas su visomis. Stumdyk tvarką kaip nori.</p>
      <div className="mb-4 max-w-[520px]">
        <MusicSearchPicker attached={attached} onAdd={add} typeFilter="daina" placeholder={full ? `Pasiektas maks. (${MOOD_MAX})` : 'Surask nuotaikos dainą...'} />
        {full && <div className="mt-1.5 text-[14px]" style={{ color: 'var(--text-faint)' }}>Sąrašas pilnas — pašalink dainą, kad pridėtum naują.</div>}
      </div>
      {items.length === 0 ? <Empty hint="Dar nepridėjai nuotaikos dainų." /> : (
        <div className="flex flex-col gap-2">
          {items.map((m, idx) => {
            const isFirst = idx === 0
            return (
              <div key={m.id} draggable onDragStart={() => { dragId.current = m.id }} onDragOver={e => { e.preventDefault(); setDragOver(m.id) }} onDragLeave={() => setDragOver(o => o === m.id ? null : o)} onDrop={() => drop(idx)}
                className="group flex items-center gap-2.5 rounded-xl px-2.5 py-2" style={{ background: isFirst ? 'linear-gradient(90deg, rgba(167,139,250,0.14), var(--bg-surface) 60%)' : 'var(--bg-surface)', border: `1px solid ${dragOver === m.id ? '#a78bfa' : isFirst ? 'rgba(167,139,250,0.5)' : 'var(--border-default)'}` }}>
                <span className="hidden sm:inline cursor-grab active:cursor-grabbing select-none text-[var(--text-faint)]"><Ico name="grip" size={13} /></span>
                {jumpId === m.id ? (
                  <input autoFocus type="number" min={1} max={items.length} defaultValue={idx + 1}
                    onKeyDown={e => { if (e.key === 'Enter') { setJumpId(null); jump(idx, Number((e.target as HTMLInputElement).value) || 1) } if (e.key === 'Escape') setJumpId(null) }} onBlur={e => { setJumpId(null); jump(idx, Number(e.target.value) || idx + 1) }}
                    className="w-10 h-7 text-center text-[14px] font-black rounded-md outline-none" style={{ background: 'var(--bg-elevated)', border: '1px solid #a78bfa', color: 'var(--text-primary)' }} />
                ) : (
                  <button onClick={() => setJumpId(m.id)} title="Įrašyk vietą" className="w-7 h-7 shrink-0 rounded-md text-[14px] font-black tabular-nums" style={{ background: 'var(--bg-elevated)', color: isFirst ? '#a78bfa' : 'var(--text-muted)' }}>{idx + 1}</button>
                )}
                <div className="flex flex-col gap-0.5">
                  <button onClick={() => move(idx, -1)} disabled={idx === 0} aria-label="Aukštyn" className="h-5 w-6 inline-flex items-center justify-center rounded disabled:opacity-20" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}><Ico name="up" size={11} /></button>
                  <button onClick={() => move(idx, 1)} disabled={idx === items.length - 1} aria-label="Žemyn" className="h-5 w-6 inline-flex items-center justify-center rounded disabled:opacity-20" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}><Ico name="down" size={11} /></button>
                </div>
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg flex items-center justify-center" style={{ background: 'var(--bg-elevated)', color: 'var(--text-faint)' }}>{m.track?.cover_url ? (/* eslint-disable-next-line @next/next/no-img-element */<img src={proxyImg(m.track.cover_url)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />) : <Ico name="note" size={16} />}</div>
                <div className="min-w-0 flex-1"><div className="truncate text-[14px] font-bold">{m.track?.title || '—'}</div><div className="truncate text-[14px]" style={{ color: 'var(--text-muted)' }}>{m.track?.artist?.name || 'Daina'}</div></div>
                {isFirst && <span className="shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-black" style={{ background: 'rgba(167,139,250,0.18)', color: '#a78bfa' }}><Ico name="play" size={10} /> Profilyje</span>}
                <button onClick={() => remove(m.track_id)} title="Pašalinti" className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-faint)' }} onMouseEnter={e => (e.currentTarget.style.color = '#f43f5e')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}><Ico name="x" size={14} /></button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const METER_COLORS = ['var(--accent-orange)', '#a78bfa', '#34d399', '#60a5fa', '#f472b6', '#fbbf24', '#22d3ee', '#fb7185', '#fb923c', '#4ade80']
function hexToRgb(hex: string): string {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16)
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
}

// LED segmentinis bar'as (toks pat dizainas kaip profilio „Muzikinis skonis").
const LED_SEGMENTS = 14
function StyleLedBars({ top, maxCount, selName, onPick, colorOf }: {
  top: { name: string; count: number }[]; maxCount: number; selName: string | null
  onPick: (s: string) => void; colorOf: (name: string) => string
}) {
  const sel = selName
  return (
    <>
      {/* Desktop — vertikalūs LED stulpeliai */}
      <div className="hidden md:flex items-stretch justify-start gap-2.5">
        {top.map(d => {
          const active = sel === d.name
          const hex = colorOf(d.name); const rgb = hexToRgb(hex)
          const lit = Math.max(Math.round((d.count / (maxCount || 1)) * LED_SEGMENTS), d.count > 0 ? 1 : 0)
          return (
            <button key={d.name} onClick={() => onPick(d.name)} title={`${d.name} — ${d.count}`} className={`group flex-1 min-w-0 flex flex-col items-center transition hover:-translate-y-0.5 ${sel && !active ? 'opacity-45' : ''}`}>
              <span className="text-[14px] font-black tabular-nums mb-1" style={{ color: active ? hex : 'var(--text-faint)' }}>{d.count}</span>
              <div className="flex flex-col-reverse gap-[2px] w-full px-[3px]" style={{ maxWidth: 46, margin: '0 auto' }}>
                {Array.from({ length: LED_SEGMENTS }).map((_, s) => {
                  const on = s < lit
                  const ratio = s / (LED_SEGMENTS - 1)
                  const alpha = on ? 0.5 + ratio * 0.5 : 0.06
                  const glow = on && s >= lit - 2
                  return <div key={s} style={{ height: 8, borderRadius: 2, background: on ? `rgba(${rgb}, ${active ? Math.min(alpha + 0.15, 1) : alpha})` : 'rgba(255,255,255,0.05)', boxShadow: glow ? `0 0 ${active ? 9 : 6}px rgba(${rgb}, ${active ? 0.9 : 0.6})` : 'none' }} />
                })}
              </div>
              <span className="mt-1.5 text-[12px] font-bold text-center leading-tight overflow-hidden" style={{ height: 26, color: active ? 'var(--text-primary)' : 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{d.name}</span>
            </button>
          )
        })}
      </div>
      {/* Mobile — horizontalūs LED segmentai */}
      <div className="md:hidden flex flex-col gap-2.5">
        {top.map(d => {
          const active = sel === d.name
          const hex = colorOf(d.name); const rgb = hexToRgb(hex)
          const pct = (d.count / (maxCount || 1)) * 100
          return (
            <button key={d.name} onClick={() => onPick(d.name)} className={`group flex items-center gap-3 w-full text-left transition ${sel && !active ? 'opacity-45' : ''}`}>
              <span className="font-extrabold truncate" style={{ width: 96, flexShrink: 0, fontSize: 14, color: active ? hex : 'var(--text-primary)' }}>{d.name}</span>
              <span className="flex-1 relative h-3.5 rounded-md overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <span className="absolute inset-y-0 left-0 rounded-md" style={{ width: `${Math.max(6, pct)}%`, background: `linear-gradient(to right, rgba(${rgb}, 0.55), rgba(${rgb}, 0.95))`, boxShadow: active ? `0 0 14px rgba(${rgb}, 0.6)` : `0 0 6px rgba(${rgb}, 0.3)` }} />
              </span>
              <span className="font-mono tabular-nums text-right" style={{ width: 28, fontSize: 14, color: active ? hex : 'var(--text-faint)' }}>{d.count}</span>
            </button>
          )
        })}
      </div>
    </>
  )
}

// Stilių sąrašas pagal konkretų stilių — globalios pozicijos, valdymas kaip pagrindiniame sąraše.
// Atskiras vieno stiliaus topas — sub-tabai (Atlikėjai/Albumai/Dainos), stiliaus-vietinės pozicijos.
function StyleManager({ sel, coll, onReorder, onUnlike }: {
  sel: StyleSel; coll: Record<EntityTab, KindCollection>
  onReorder: (kind: EntityTab, styleKey: string, orderedIds: number[]) => void; onUnlike: (kind: EntityTab, it: MusicItem) => void
}) {
  const color = sel.color
  const byKind = useMemo(() => {
    const out = { artist: [] as MusicItem[], album: [] as MusicItem[], track: [] as MusicItem[] }
    ;(['artist', 'album', 'track'] as const).forEach(kind => {
      const items = [...coll[kind].ranked, ...coll[kind].library].filter(i => sel.match(i))
      items.sort((a, b) => {
        const ra = a.styleRanks?.[sel.key], rb = b.styleRanks?.[sel.key]
        if (ra != null && rb != null) return ra - rb
        if (ra != null) return -1
        if (rb != null) return 1
        return 0
      })
      out[kind] = items
    })
    return out
  }, [coll, sel])
  const kinds = (['artist', 'album', 'track'] as const).filter(k => byKind[k].length)
  const [sub, setSub] = useState<EntityTab>('artist')
  const active: EntityTab = kinds.includes(sub) ? sub : (kinds[0] || 'artist')
  const items = byKind[active] || []
  const dragId = useRef<number | null>(null); const [dragOver, setDragOver] = useState<number | null>(null)
  const [jumpId, setJumpId] = useState<number | null>(null)
  const ids = items.map(i => i.id)
  const commit = (a: number[]) => onReorder(active, sel.key, a)
  const move = (id: number, dir: -1 | 1) => { const i = ids.indexOf(id), to = i + dir; if (to < 0 || to >= ids.length) return; const a = [...ids]; a.splice(to, 0, a.splice(i, 1)[0]); commit(a) }
  const jump = (id: number, pos: number) => { const i = ids.indexOf(id), to = Math.max(0, Math.min(ids.length - 1, Math.floor(pos) - 1)); if (i < 0 || to === i) return; const a = [...ids]; a.splice(to, 0, a.splice(i, 1)[0]); commit(a) }
  const drop = (targetId: number) => { const from = dragId.current; setDragOver(null); dragId.current = null; if (from == null || from === targetId) return; const f = ids.indexOf(from), t = ids.indexOf(targetId); if (f < 0 || t < 0) return; const a = [...ids]; a.splice(t, 0, a.splice(f, 1)[0]); commit(a) }
  const tabLabel = (k: EntityTab) => k === 'artist' ? 'Atlikėjai' : k === 'album' ? 'Albumai' : 'Dainos'

  return (
    <div>
      <div className="flex gap-1.5 mb-3 overflow-x-auto">
        {kinds.map(k => {
          const a = active === k
          return (
            <button key={k} onClick={() => setSub(k)} className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[14px] font-bold" style={{ background: a ? color : 'var(--bg-elevated)', color: a ? '#fff' : 'var(--text-secondary)', border: `1px solid ${a ? 'transparent' : 'var(--border-default)'}` }}>
              <Ico name={k === 'artist' ? 'person' : k === 'album' ? 'disc' : 'note'} size={13} /> {tabLabel(k)} <span className="text-[12px] font-black" style={{ opacity: 0.8 }}>{byKind[k].length}</span>
            </button>
          )
        })}
      </div>
      {items.length === 0 && (
        <div className="rounded-xl px-4 py-5 text-center text-[14px]" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>Dar neturi šio stiliaus įrašų. Pridėk atlikėjų/albumų/dainų — atsiras čia.</div>
      )}
      <div className="flex flex-col gap-1.5">
        {items.map((it, idx) => (
          <div key={it.id} draggable onDragStart={() => { dragId.current = it.id }} onDragOver={e => { e.preventDefault(); setDragOver(it.id) }} onDragLeave={() => setDragOver(o => o === it.id ? null : o)} onDrop={() => drop(it.id)}
            className="group flex items-center gap-2.5 rounded-xl px-2.5 py-2" style={{ background: 'var(--bg-surface)', border: `1px solid ${dragOver === it.id ? color : 'var(--border-default)'}` }}>
            <span className="hidden sm:inline cursor-grab active:cursor-grabbing select-none text-[var(--text-faint)]"><Ico name="grip" size={13} /></span>
            {jumpId === it.id ? (
              <input autoFocus type="number" min={1} max={items.length} defaultValue={idx + 1}
                onKeyDown={e => { if (e.key === 'Enter') { setJumpId(null); jump(it.id, Number((e.target as HTMLInputElement).value) || 1) } if (e.key === 'Escape') setJumpId(null) }} onBlur={e => { setJumpId(null); jump(it.id, Number(e.target.value) || idx + 1) }}
                className="w-10 h-7 text-center text-[14px] font-black rounded-md outline-none" style={{ background: 'var(--bg-elevated)', border: `1px solid ${color}`, color: 'var(--text-primary)' }} />
            ) : (
              <button onClick={() => setJumpId(it.id)} title="Įrašyk vietą šio stiliaus tope" className="w-7 h-7 shrink-0 rounded-md text-[14px] font-black tabular-nums" style={{ background: 'var(--bg-elevated)', color }}>{idx + 1}</button>
            )}
            <div className="flex flex-col gap-0.5">
              <button onClick={() => move(it.id, -1)} disabled={idx === 0} aria-label="Aukštyn" className="h-5 w-6 inline-flex items-center justify-center rounded disabled:opacity-20" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}><Ico name="up" size={11} /></button>
              <button onClick={() => move(it.id, 1)} disabled={idx === items.length - 1} aria-label="Žemyn" className="h-5 w-6 inline-flex items-center justify-center rounded disabled:opacity-20" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}><Ico name="down" size={11} /></button>
            </div>
            <Cover kind={active} cover={it.cover} />
            <div className="min-w-0 flex-1"><div className="truncate text-[14px] font-bold">{it.href ? <Link href={it.href} className="hover:underline">{it.title}</Link> : it.title}</div><div className="truncate text-[14px]" style={{ color: 'var(--text-muted)' }}>{it.subtitle}</div></div>
            <button onClick={() => onUnlike(active, it)} title="Pašalinti iš mėgstamų" className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-faint)' }} onMouseEnter={e => (e.currentTarget.style.color = '#f43f5e')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}><Ico name="x" size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  )
}

function StyleSection({ coll, styles, setStyles, meterRaw, onStyleReorder, onUnlike }: {
  coll: Record<EntityTab, KindCollection>; styles: FavStyle[]; setStyles: (v: FavStyle[]) => void; meterRaw: any[]
  onStyleReorder: (kind: EntityTab, styleKey: string, orderedIds: number[]) => void; onUnlike: (kind: EntityTab, it: MusicItem) => void
}) {
  const [sel, setSel] = useState<StyleSel | null>(null)
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
  const hasMeter = Array.isArray(meterRaw) && meterRaw.length > 0

  // Selektoriai: equalizerio platus stilius (pagal žanro pavadinimą) / pill substilius.
  const makeBroad = (full: string): StyleSel => ({ key: full, label: full, color: colorOf(full) || 'var(--accent-orange)', match: it => it.style === full })
  const makePill = (s: FavStyle, idx: number): StyleSel => ({ key: `sub:${s.legacy_style_id}`, label: s.style_name, color: METER_COLORS[idx % METER_COLORS.length], match: it => (it.substyleIds?.includes(s.legacy_style_id)) || it.style === s.style_name })
  const broadSelName = sel && !sel.key.startsWith('sub:') ? sel.key : null

  async function ensureCatalog() { if (catalog) return; try { const r = await api('/styles?catalog=1', 'GET'); setCatalog(r.catalog || []) } catch { setCatalog([]) } }
  function addStyle(s: { legacy_style_id: number; style_slug: string; style_name: string }) { if (styles.some(x => x.legacy_style_id === s.legacy_style_id)) return; setStyles([...styles, { ...s, sort_order: 9999 }]); setQ(''); api('/styles', 'POST', s).catch(() => setStyles(styles)) }
  function removeStyle(id: number) { if (sel?.key === `sub:${id}`) setSel(null); setStyles(styles.filter(x => x.legacy_style_id !== id)); api('/styles', 'DELETE', { legacy_style_id: id }).catch(() => setStyles(styles)) }
  const filteredCatalog = (catalog || []).filter(c => !styles.some(s => s.legacy_style_id === c.legacy_style_id)).filter(c => q.trim().length < 2 || c.style_name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 40)

  return (
    <div>
      {/* Muzikinis skonis — IDENTIŠKAS profilio equalizeris (legacy_music_meter). */}
      {hasMeter ? (
        <div className="mb-5">
          <SideEqualizer meter={meterRaw} variant="led-large" topN={8} ledSelectedGenre={broadSelName} onSelect={(full) => setSel(full ? makeBroad(full) : null)} />
          <p className="mt-1.5 text-[14px]" style={{ color: 'var(--text-faint)' }}>Spustelėk stilių juostą — susidėliosi to stiliaus topą žemiau.</p>
        </div>
      ) : dist.length > 0 ? (
        <div className="mb-5 rounded-2xl p-4 sm:p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
          <div className="text-[16px] font-extrabold uppercase tracking-[0.2em] mb-3" style={{ color: 'var(--accent-orange)' }}>Muzikinis skonis <span className="font-medium normal-case tracking-normal" style={{ color: 'var(--text-muted)' }}>· spustelėk ir tvarkyk to stiliaus topą</span></div>
          <StyleLedBars top={top} maxCount={maxCount} selName={broadSelName} onPick={(name) => setSel(broadSelName === name ? null : makeBroad(name))} colorOf={colorOf} />
        </div>
      ) : (
        <p className="mb-5 text-[14px]" style={{ color: 'var(--text-muted)' }}>Pridėk atlikėjų, albumų ar dainų — iš jų žanrų susiformuos tavo stilių pasiskirstymas.</p>
      )}

      {/* Mėgstami stiliai — pills PO equalizer, spustelimi → substiliaus topas */}
      <div className="mb-5">
        <h3 className="text-[14px] font-black mb-1.5">Mėgstami stiliai <span className="text-[14px] font-bold" style={{ color: 'var(--text-faint)' }}>{styles.length}</span></h3>
        <p className="mb-2.5 text-[14px]" style={{ color: 'var(--text-muted)' }}>Žymos tavo profiliui. Spustelėk stilių — susidėliosi jo topą; ✕ pašalina žymą.</p>
        <div className="flex flex-wrap gap-2 items-center">
          {styles.map((s, idx) => {
            const active = sel?.key === `sub:${s.legacy_style_id}`
            const col = METER_COLORS[idx % METER_COLORS.length]
            return (
              <button key={s.legacy_style_id} onClick={() => setSel(active ? null : makePill(s, idx))} className="group inline-flex items-center gap-1.5 rounded-full pl-2.5 pr-1.5 py-1.5 transition-colors" style={{ background: active ? `${col}22` : 'var(--bg-elevated)', border: `1px solid ${active ? col : 'var(--border-default)'}` }}>
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: col }} />
                <span className="text-[14px] font-bold">{s.style_name}</span>
                <span role="button" tabIndex={0} onClick={e => { e.stopPropagation(); removeStyle(s.legacy_style_id) }} title="Pašalinti žymą" className="h-4 w-4 inline-flex items-center justify-center rounded-full" style={{ color: 'var(--text-faint)' }} onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}><Ico name="x" size={9} /></span>
              </button>
            )
          })}
          <div className="relative">
            <button onClick={() => { ensureCatalog(); setOpen(o => !o) }} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[14px] font-bold" style={{ background: 'transparent', border: '1px dashed var(--border-default)', color: 'var(--text-muted)' }}>+ Pridėk stilių</button>
            {open && (
              <div className="absolute left-0 bottom-full z-40 mb-1.5 w-[260px] max-h-[280px] overflow-y-auto rounded-lg shadow-xl" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
                <div className="p-2 sticky top-0" style={{ background: 'var(--bg-surface)' }}><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Ieškoti stiliaus..." className="w-full rounded-md px-2.5 py-1.5 text-[14px] outline-none" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }} /></div>
                {!catalog ? <div className="px-3 py-3 text-center text-[14px]" style={{ color: 'var(--text-faint)' }}>Kraunama…</div> : filteredCatalog.length === 0 ? <div className="px-3 py-3 text-center text-[14px]" style={{ color: 'var(--text-faint)' }}>Nieko nerasta.</div> : <ul className="pb-1">{filteredCatalog.map(c => (<li key={c.legacy_style_id}><button onClick={() => addStyle(c)} className="w-full text-left px-3 py-1.5 text-[14px] font-medium" style={{ color: 'var(--text-primary)' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>{c.style_name}</button></li>))}</ul>}
              </div>
            )}
          </div>
        </div>
      </div>

      {sel && (
        <div className="mb-2 rounded-2xl p-4" style={{ background: 'var(--bg-surface)', border: `1px solid ${sel.color}55` }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[14px] font-black flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full" style={{ background: sel.color }} /> {sel.label} <span className="text-[14px] font-medium" style={{ color: 'var(--text-muted)' }}>· susidėliok savo topą šiame stiliuje</span></h3>
            <button onClick={() => setSel(null)} className="inline-flex items-center gap-1 text-[14px] font-bold" style={{ color: 'var(--text-muted)' }}>Uždaryti <Ico name="x" size={12} /></button>
          </div>
          <StyleManager key={sel.key} sel={sel} coll={coll} onReorder={onStyleReorder} onUnlike={onUnlike} />
        </div>
      )}
    </div>
  )
}
function Empty({ hint }: { hint: string }) { return <div className="rounded-2xl px-6 py-10 text-center" style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border-default)' }}><div className="text-[14px]" style={{ color: 'var(--text-muted)' }}>{hint}</div></div> }

// ── ICONS (inline SVG) ─────────────────────────────────────────────────────
type IcoName = 'person' | 'disc' | 'note' | 'moon' | 'sliders' | 'star' | 'heart' | 'heartFull' | 'repeat' | 'play' | 'books' | 'download' | 'eye' | 'x' | 'up' | 'down' | 'grip' | 'sort' | 'sparkle' | 'target' | 'plus' | 'compass' | 'mic'
function Ico({ name, size = 16 }: { name: IcoName; size?: number }) {
  const p: Record<IcoName, ReactNode> = {
    person: <><circle cx="12" cy="8" r="4" /><path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6" /></>,
    disc: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.5" /></>,
    note: <><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></>,
    moon: <path d="M21 12.8A8 8 0 1 1 11.2 3 6.5 6.5 0 0 0 21 12.8z" />,
    sliders: <><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h7M15 18h5" /><circle cx="16" cy="6" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="13" cy="18" r="2" /></>,
    star: <polygon points="12 2 15 9 22 9.3 16.5 14 18.5 21 12 17 5.5 21 7.5 14 2 9.3 9 9" />,
    heart: <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />,
    heartFull: <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />,
    repeat: <><path d="M17 2l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></>,
    play: <polygon points="6 4 20 12 6 20 6 4" />,
    plus: <path d="M12 5v14M5 12h14" />,
    books: <><path d="M4 5v15h16V5" /><path d="M4 9h16M9 5v15" /></>,
    download: <><path d="M12 3v12M7 11l5 4 5-4" /><path d="M5 20h14" /></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="2.5" /></>,
    x: <path d="M5 5l14 14M19 5L5 19" />,
    up: <path d="M6 15l6-6 6 6" />, down: <path d="M6 9l6 6 6-6" />,
    grip: <><circle cx="9" cy="6" r="1.3" /><circle cx="9" cy="12" r="1.3" /><circle cx="9" cy="18" r="1.3" /><circle cx="15" cy="6" r="1.3" /><circle cx="15" cy="12" r="1.3" /><circle cx="15" cy="18" r="1.3" /></>,
    sort: <path d="M7 4v16M7 20l-3-3M7 4l3 3M17 20V4M17 4l3 3M17 20l-3-3" />,
    sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
    target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" /></>,
    compass: <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></>,
    mic: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3M8 21h8" /></>,
  }
  const filled = name === 'star' || name === 'grip' || name === 'sparkle' || name === 'play' || name === 'heartFull'
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={name === 'x' || name === 'up' || name === 'down' ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>{p[name]}</svg>
}
