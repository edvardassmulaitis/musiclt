'use client'
// app/mano-muzika/MyMusicClient.tsx
// ───────────────────────────────────────────────────────────────────────────
// „Mano muzika" valdymo centras. Tabai (Atlikėjai / Albumai / Dainos /
// Nuotaika / Stiliai), drag reorder, „iškėlimas" (featured), pridėjimas per
// MusicSearchPicker, nuotaikos dainų kolekcija su aktyvia daina, stilių
// valdymas. Optimistiniai update'ai su revert on error.
// ───────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import MusicSearchPicker, { type AttachmentHit } from '@/components/MusicSearchPicker'
import type { MyMusic, FavArtist, FavAlbum, FavTrack, MoodSong, FavStyle, FavKind } from '@/lib/mano-muzika'

type Props = {
  initial: MyMusic
  username: string | null
  avatarUrl: string | null
  suggestOnboarding: boolean
}

type Tab = 'artists' | 'albums' | 'tracks' | 'mood' | 'styles'

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'artists', label: 'Atlikėjai', icon: '👤' },
  { key: 'albums', label: 'Albumai', icon: '💿' },
  { key: 'tracks', label: 'Dainos', icon: '🎵' },
  { key: 'mood', label: 'Nuotaika', icon: '🌙' },
  { key: 'styles', label: 'Stiliai', icon: '🎚️' },
]

// Kolekcijos „lygis" — gamifikacija. Slenksčiai pagal bendrą įrašų skaičių.
const LEVELS = [
  { min: 0, name: 'Naujokas', color: '#94a3b8' },
  { min: 5, name: 'Klausytojas', color: '#34d399' },
  { min: 15, name: 'Melomanas', color: '#60a5fa' },
  { min: 30, name: 'Žinovas', color: '#a78bfa' },
  { min: 60, name: 'Kolekcininkas', color: '#f97316' },
  { min: 120, name: 'Legenda', color: '#f43f5e' },
]
function levelFor(total: number) {
  let idx = 0
  for (let i = 0; i < LEVELS.length; i++) if (total >= LEVELS[i].min) idx = i
  const cur = LEVELS[idx]
  const next = LEVELS[idx + 1] || null
  return { cur, next, idx }
}

async function api(path: string, method: string, body?: any) {
  const res = await fetch(`/api/mano-muzika${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Klaida') }
  return res.json()
}

export default function MyMusicClient({ initial, username, avatarUrl, suggestOnboarding }: Props) {
  const [tab, setTab] = useState<Tab>('artists')
  const [artists, setArtists] = useState<FavArtist[]>(initial.artists)
  const [albums, setAlbums] = useState<FavAlbum[]>(initial.albums)
  const [tracks, setTracks] = useState<FavTrack[]>(initial.tracks)
  const [moodSongs, setMoodSongs] = useState<MoodSong[]>(initial.moodSongs)
  const [styles, setStyles] = useState<FavStyle[]>(initial.styles)
  const [showOnboard, setShowOnboard] = useState(suggestOnboarding)

  const total = artists.length + albums.length + tracks.length
  const { cur, next } = levelFor(total)
  const toNext = next ? next.min - total : 0
  const pct = next ? Math.min(100, Math.round(((total - cur.min) / (next.min - cur.min)) * 100)) : 100

  return (
    <div className="page-shell" style={{ color: 'var(--text-primary)' }}>
      {/* HEADER */}
      <div className="page-head">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1>Mano muzika</h1>
            <p>Tvarkyk mėgstamus atlikėjus, albumus, dainas, nuotaikos dainas ir stilius. Tempk, kad pakeistum eilę, „iškelk" mėgstamiausius.</p>
          </div>
          {username && (
            <Link
              href={`/vartotojas/${username}`}
              className="shrink-0 inline-flex items-center gap-2 rounded-full px-4 py-2 text-[12.5px] font-bold transition-colors"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}
            >
              👁 Peržiūrėti profilį
            </Link>
          )}
        </div>

        {/* GAMIFIED LEVEL BAR */}
        <div className="mt-4 rounded-2xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[15px] font-black"
                style={{ background: `${cur.color}22`, color: cur.color }}>
                {cur.name[0]}
              </span>
              <div>
                <div className="text-[14px] font-black" style={{ color: cur.color }}>{cur.name}</div>
                <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                  {total} įrašai kolekcijoje · {moodSongs.length} nuotaikos · {styles.length} stiliai
                </div>
              </div>
            </div>
            {next && (
              <div className="text-right text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                Dar <span className="font-black" style={{ color: 'var(--text-primary)' }}>{toNext}</span> iki<br />
                <span className="font-bold" style={{ color: next.color }}>{next.name}</span>
              </div>
            )}
          </div>
          <div className="h-2 w-full rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${cur.color}, ${next?.color || cur.color})` }} />
          </div>
        </div>
      </div>

      {/* ONBOARDING NUDGE */}
      {showOnboard && (
        <div className="mb-5 rounded-2xl p-4 sm:p-5 flex items-center gap-4 flex-wrap"
          style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.14), rgba(167,139,250,0.12))', border: '1px solid var(--border-default)' }}>
          <div className="text-3xl">✨</div>
          <div className="flex-1 min-w-[200px]">
            <div className="text-[15px] font-black">Susidėk savo muziką per minutę</div>
            <div className="text-[12.5px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Greitas žaidimas — pasirink mėgstamus atlikėjus ir stilius, o mes pasiūlysim daugiau.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/mano-muzika/pradzia"
              className="rounded-full px-5 py-2.5 text-[13px] font-black text-white transition-transform hover:scale-[1.03]"
              style={{ background: 'var(--accent-orange)' }}>
              Pradėti →
            </Link>
            <button onClick={() => { setShowOnboard(false); api('/setup', 'POST', { action: 'skip' }).catch(() => {}) }}
              className="rounded-full px-3 py-2.5 text-[12px] font-bold" style={{ color: 'var(--text-muted)' }}>
              Vėliau
            </button>
          </div>
        </div>
      )}

      {/* TABS */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-5 -mx-1 px-1" role="tablist">
        {TABS.map(t => {
          const count = t.key === 'artists' ? artists.length : t.key === 'albums' ? albums.length
            : t.key === 'tracks' ? tracks.length : t.key === 'mood' ? moodSongs.length : styles.length
          const active = tab === t.key
          return (
            <button key={t.key} role="tab" aria-selected={active} onClick={() => setTab(t.key)}
              className="shrink-0 inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-bold transition-colors"
              style={{
                background: active ? 'var(--accent-orange)' : 'var(--bg-elevated)',
                color: active ? '#fff' : 'var(--text-secondary)',
                border: `1px solid ${active ? 'transparent' : 'var(--border-default)'}`,
              }}>
              <span>{t.icon}</span>{t.label}
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10.5px] font-black"
                style={{ background: active ? 'rgba(255,255,255,0.25)' : 'var(--bg-surface)', color: active ? '#fff' : 'var(--text-muted)' }}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* PANELS */}
      {tab === 'artists' && (
        <FavSection kind="artist" typeFilter="grupe" emptyHint="Surask mėgstamą atlikėją ir pridėk jį čia."
          items={artists.map(toRow)} setOrder={ids => setArtists(reorderState(artists, ids, 'artist_id'))}
          onAdd={hit => addFav('artist', hit.id, hit, artists, setArtists, makeArtistRow)}
          onRemove={id => mutateRemove('artist', id, artists, setArtists, 'artist_id')}
          onFeatured={(id, v) => mutateFeatured('artist', id, v, artists, setArtists, 'artist_id')} />
      )}
      {tab === 'albums' && (
        <FavSection kind="album" typeFilter="albumas" emptyHint="Pridėk mėgstamus albumus."
          items={albums.map(toRow)} setOrder={ids => setAlbums(reorderState(albums, ids, 'album_id'))}
          onAdd={hit => addFav('album', hit.id, hit, albums, setAlbums, makeAlbumRow)}
          onRemove={id => mutateRemove('album', id, albums, setAlbums, 'album_id')}
          onFeatured={(id, v) => mutateFeatured('album', id, v, albums, setAlbums, 'album_id')} />
      )}
      {tab === 'tracks' && (
        <FavSection kind="track" typeFilter="daina" emptyHint="Pridėk mėgstamas dainas."
          items={tracks.map(toRow)} setOrder={ids => setTracks(reorderState(tracks, ids, 'track_id'))}
          onAdd={hit => addFav('track', hit.id, hit, tracks, setTracks, makeTrackRow)}
          onRemove={id => mutateRemove('track', id, tracks, setTracks, 'track_id')}
          onFeatured={(id, v) => mutateFeatured('track', id, v, tracks, setTracks, 'track_id')} />
      )}
      {tab === 'mood' && <MoodSection moodSongs={moodSongs} setMoodSongs={setMoodSongs} />}
      {tab === 'styles' && <StyleSection styles={styles} setStyles={setStyles} />}
    </div>
  )

  // ── helpers (closures over state setters) ────────────────────────────────
  function toRow(it: FavArtist | FavAlbum | FavTrack): Row {
    if ('artist_id' in it) return { id: it.artist_id, title: it.artist?.name || '—', sub: 'Atlikėjas', cover: it.artist?.cover_image_url || null, href: it.artist ? `/atlikejai/${it.artist.slug}` : undefined, is_featured: it.is_featured }
    if ('album_id' in it) return { id: it.album_id, title: it.album?.title || '—', sub: it.album?.artist?.name || 'Albumas', cover: it.album?.cover_url || null, href: it.album ? `/albumai/${it.album.slug}-${it.album.id}` : undefined, is_featured: it.is_featured }
    return { id: it.track_id, title: it.track?.title || '—', sub: it.track?.artist?.name || 'Daina', cover: it.track?.cover_url || null, href: it.track ? `/dainos/${it.track.slug}-${it.track.id}` : undefined, is_featured: it.is_featured }
  }
}

// ── Row model ───────────────────────────────────────────────────────────────
type Row = { id: number; title: string; sub: string; cover: string | null; href?: string; is_featured: boolean }

// reorder array in state by id sequence, keeping objects
function reorderState<T>(arr: T[], orderedIds: number[], idKey: keyof T): T[] {
  const map = new Map(arr.map(x => [Number(x[idKey]), x]))
  const out = orderedIds.map(id => map.get(id)).filter(Boolean) as T[]
  // append any not in orderedIds (safety)
  for (const x of arr) if (!orderedIds.includes(Number(x[idKey]))) out.push(x)
  return out
}

// row builders for optimistic add
function makeArtistRow(hit: AttachmentHit): FavArtist {
  return { artist_id: hit.id, sort_order: 9999, is_featured: false, weight: 0, note: null,
    artist: { id: hit.id, slug: hit.slug, name: hit.title, cover_image_url: hit.image_url } }
}
function makeAlbumRow(hit: AttachmentHit): FavAlbum {
  return { album_id: hit.id, sort_order: 9999, is_featured: false, weight: 0, note: null,
    album: { id: hit.id, slug: hit.slug, title: hit.title, cover_url: hit.image_url, artist: hit.artist ? { slug: '', name: hit.artist } : null } }
}
function makeTrackRow(hit: AttachmentHit): FavTrack {
  return { track_id: hit.id, sort_order: 9999, is_featured: false, weight: 0, note: null,
    track: { id: hit.id, slug: hit.slug, title: hit.title, cover_url: hit.image_url, artist: hit.artist ? { slug: '', name: hit.artist } : null } }
}

// generic mutation helpers (module scope — take state + setter)
function addFav<T>(kind: FavKind, id: number, hit: AttachmentHit, list: T[], setList: (v: T[]) => void, make: (h: AttachmentHit) => T) {
  if ((list as any[]).some(x => Number((x as any)[`${kind}_id`]) === id)) return
  setList([...list, make(hit)])
  api('/favorites', 'POST', { kind, entity_id: id }).catch(() => setList(list))
}
function mutateRemove<T>(kind: FavKind, id: number, list: T[], setList: (v: T[]) => void, idKey: keyof T) {
  setList(list.filter(x => Number(x[idKey]) !== id))
  api('/favorites', 'DELETE', { kind, entity_id: id }).catch(() => setList(list))
}
function mutateFeatured<T extends { is_featured: boolean }>(kind: FavKind, id: number, v: boolean, list: T[], setList: (v: T[]) => void, idKey: keyof T) {
  setList(list.map(x => Number(x[idKey]) === id ? { ...x, is_featured: v } : x))
  api('/favorites', 'PATCH', { kind, entity_id: id, is_featured: v }).catch(() => setList(list))
}

// ─────────────────────────────────────────────────────────────────────────────
// FAV SECTION — add bar + reorderable list (artists/albums/tracks)
// ─────────────────────────────────────────────────────────────────────────────
function FavSection({
  kind, typeFilter, items, emptyHint, onAdd, onRemove, onFeatured, setOrder,
}: {
  kind: FavKind
  typeFilter: AttachmentHit['type']
  items: Row[]
  emptyHint: string
  onAdd: (hit: AttachmentHit) => void
  onRemove: (id: number) => void
  onFeatured: (id: number, v: boolean) => void
  setOrder: (orderedIds: number[]) => void
}) {
  const dragId = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  const persistOrder = useCallback((ids: number[]) => {
    setOrder(ids)
    api('/favorites', 'PUT', { kind, ordered_ids: ids }).catch(() => {})
  }, [kind, setOrder])

  function handleDrop(targetId: number) {
    const from = dragId.current
    setDragOver(null); dragId.current = null
    if (from == null || from === targetId) return
    const ids = items.map(i => i.id)
    const fromIdx = ids.indexOf(from), toIdx = ids.indexOf(targetId)
    if (fromIdx < 0 || toIdx < 0) return
    ids.splice(toIdx, 0, ids.splice(fromIdx, 1)[0])
    persistOrder(ids)
  }
  function move(id: number, dir: -1 | 1) {
    const ids = items.map(i => i.id)
    const idx = ids.indexOf(id); const to = idx + dir
    if (to < 0 || to >= ids.length) return
    ids.splice(to, 0, ids.splice(idx, 1)[0])
    persistOrder(ids)
  }

  const attached: AttachmentHit[] = items.map(i => ({ type: typeFilter, id: i.id, legacy_id: null, slug: '', title: i.title, artist: null, image_url: i.cover }))

  return (
    <div>
      <div className="mb-4 max-w-[520px]">
        <MusicSearchPicker attached={attached} onAdd={onAdd} typeFilter={typeFilter}
          placeholder={typeFilter === 'grupe' ? 'Surask atlikėją...' : typeFilter === 'albumas' ? 'Surask albumą...' : 'Surask dainą...'} />
      </div>

      {items.length === 0 ? (
        <EmptyState hint={emptyHint} />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((it, idx) => (
            <li key={it.id}
              draggable
              onDragStart={() => { dragId.current = it.id }}
              onDragOver={e => { e.preventDefault(); setDragOver(it.id) }}
              onDragLeave={() => setDragOver(o => o === it.id ? null : o)}
              onDrop={() => handleDrop(it.id)}
              className="group flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors"
              style={{
                background: it.is_featured ? 'linear-gradient(90deg, rgba(249,115,22,0.10), transparent)' : 'var(--bg-surface)',
                border: `1px solid ${dragOver === it.id ? 'var(--accent-orange)' : it.is_featured ? 'rgba(249,115,22,0.4)' : 'var(--border-default)'}`,
              }}>
              <span className="cursor-grab active:cursor-grabbing select-none text-[var(--text-faint)] hover:text-[var(--text-primary)] px-0.5" title="Tempk">⠿</span>
              <span className="w-6 text-center text-[12px] font-black tabular-nums" style={{ color: it.is_featured ? 'var(--accent-orange)' : 'var(--text-faint)' }}>{idx + 1}</span>
              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg" style={{ background: 'var(--cover-placeholder, var(--bg-elevated))' }}>
                {it.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={proxyImg(it.cover)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                ) : <div className="flex h-full w-full items-center justify-center text-[16px] opacity-50">{typeFilter === 'grupe' ? '👤' : typeFilter === 'albumas' ? '💿' : '🎵'}</div>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-bold">
                  {it.href ? <Link href={it.href} className="hover:underline">{it.title}</Link> : it.title}
                </div>
                <div className="truncate text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{it.sub}</div>
              </div>
              {/* reorder arrows (mobile) */}
              <div className="hidden sm:flex flex-col">
                <button onClick={() => move(it.id, -1)} disabled={idx === 0} className="h-4 leading-none text-[10px] disabled:opacity-25" style={{ color: 'var(--text-faint)' }} title="Aukštyn">▲</button>
                <button onClick={() => move(it.id, 1)} disabled={idx === items.length - 1} className="h-4 leading-none text-[10px] disabled:opacity-25" style={{ color: 'var(--text-faint)' }} title="Žemyn">▼</button>
              </div>
              <button onClick={() => onFeatured(it.id, !it.is_featured)} title={it.is_featured ? 'Nuimti iškėlimą' : 'Iškelti'}
                className="shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-lg transition-colors"
                style={{ color: it.is_featured ? 'var(--accent-orange)' : 'var(--text-faint)', background: it.is_featured ? 'rgba(249,115,22,0.12)' : 'transparent' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill={it.is_featured ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              </button>
              <button onClick={() => onRemove(it.id)} title="Pašalinti"
                className="shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: 'var(--text-faint)' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#f43f5e')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l10 10M13 3L3 13"/></svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MOOD SECTION
// ─────────────────────────────────────────────────────────────────────────────
function MoodSection({ moodSongs, setMoodSongs }: { moodSongs: MoodSong[]; setMoodSongs: (v: MoodSong[]) => void }) {
  function add(hit: AttachmentHit) {
    if (moodSongs.some(m => m.track_id === hit.id)) return
    const makeActive = moodSongs.length === 0
    const row: MoodSong = { id: -Date.now(), track_id: hit.id, mood_label: null, is_active: makeActive, sort_order: 9999,
      track: { id: hit.id, slug: hit.slug, title: hit.title, cover_url: hit.image_url, artist: hit.artist ? { slug: '', name: hit.artist } : null } }
    const next = makeActive ? moodSongs.map(m => ({ ...m, is_active: false })).concat(row) : [...moodSongs, row]
    setMoodSongs(next)
    api('/mood', 'POST', { track_id: hit.id, make_active: makeActive }).catch(() => setMoodSongs(moodSongs))
  }
  function remove(trackId: number) {
    const removed = moodSongs.find(m => m.track_id === trackId)
    setMoodSongs(moodSongs.filter(m => m.track_id !== trackId))
    api('/mood', 'DELETE', { track_id: trackId }).catch(() => setMoodSongs(moodSongs))
    void removed
  }
  function setActive(trackId: number) {
    setMoodSongs(moodSongs.map(m => ({ ...m, is_active: m.track_id === trackId })))
    api('/mood', 'PATCH', { track_id: trackId, active: true }).catch(() => setMoodSongs(moodSongs))
  }

  const attached: AttachmentHit[] = moodSongs.map(m => ({ type: 'daina', id: m.track_id, legacy_id: null, slug: '', title: m.track?.title || '', artist: null, image_url: m.track?.cover_url || null }))

  return (
    <div>
      <p className="mb-3 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
        Nuotaikos daina rodoma tavo profilio viršuje. Susidėk kelias ir greitai perjunk aktyvią pagal nuotaiką.
      </p>
      <div className="mb-4 max-w-[520px]">
        <MusicSearchPicker attached={attached} onAdd={add} typeFilter="daina" placeholder="Surask nuotaikos dainą..." />
      </div>
      {moodSongs.length === 0 ? <EmptyState hint="Dar nepridėjai nuotaikos dainų." /> : (
        <ul className="flex flex-col gap-2">
          {moodSongs.map(m => (
            <li key={m.id} className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors"
              style={{ background: m.is_active ? 'linear-gradient(90deg, rgba(167,139,250,0.14), transparent)' : 'var(--bg-surface)', border: `1px solid ${m.is_active ? 'rgba(167,139,250,0.5)' : 'var(--border-default)'}` }}>
              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
                {m.track?.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={proxyImg(m.track.cover_url)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                ) : <div className="flex h-full w-full items-center justify-center text-[16px] opacity-50">🎵</div>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-bold">{m.track?.title || '—'}</div>
                <div className="truncate text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{m.track?.artist?.name || 'Daina'}</div>
              </div>
              {m.is_active ? (
                <span className="shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-black" style={{ background: 'rgba(167,139,250,0.18)', color: '#a78bfa' }}>🌙 Aktyvi</span>
              ) : (
                <button onClick={() => setActive(m.track_id)} className="shrink-0 rounded-full px-3 py-1 text-[11px] font-bold transition-colors"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
                  Nustatyti aktyvia
                </button>
              )}
              <button onClick={() => remove(m.track_id)} title="Pašalinti"
                className="shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-faint)' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#f43f5e')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l10 10M13 3L3 13"/></svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLE SECTION
// ─────────────────────────────────────────────────────────────────────────────
function StyleSection({ styles, setStyles }: { styles: FavStyle[]; setStyles: (v: FavStyle[]) => void }) {
  const [catalog, setCatalog] = useState<{ legacy_style_id: number; style_slug: string; style_name: string }[] | null>(null)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const dragId = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  async function ensureCatalog() {
    if (catalog) return
    try { const r = await api('/styles?catalog=1', 'GET'); setCatalog(r.catalog || []) } catch { setCatalog([]) }
  }
  function add(s: { legacy_style_id: number; style_slug: string; style_name: string }) {
    if (styles.some(x => x.legacy_style_id === s.legacy_style_id)) return
    const row: FavStyle = { ...s, sort_order: 9999 }
    setStyles([...styles, row]); setQ(''); setOpen(false)
    api('/styles', 'POST', s).catch(() => setStyles(styles))
  }
  function remove(legacyId: number) {
    setStyles(styles.filter(x => x.legacy_style_id !== legacyId))
    api('/styles', 'DELETE', { legacy_style_id: legacyId }).catch(() => setStyles(styles))
  }
  function persistOrder(ids: number[]) {
    const map = new Map(styles.map(s => [s.legacy_style_id, s]))
    setStyles(ids.map(id => map.get(id)).filter(Boolean) as FavStyle[])
    api('/styles', 'PUT', { ordered_ids: ids }).catch(() => {})
  }
  function handleDrop(targetId: number) {
    const from = dragId.current; setDragOver(null); dragId.current = null
    if (from == null || from === targetId) return
    const ids = styles.map(s => s.legacy_style_id)
    const f = ids.indexOf(from), t = ids.indexOf(targetId)
    if (f < 0 || t < 0) return
    ids.splice(t, 0, ids.splice(f, 1)[0]); persistOrder(ids)
  }

  const filtered = (catalog || [])
    .filter(c => !styles.some(s => s.legacy_style_id === c.legacy_style_id))
    .filter(c => q.trim().length < 2 || c.style_name.toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 40)

  return (
    <div>
      <p className="mb-3 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
        Mėgstami stiliai formuoja tavo „muzikos identitetą" profilyje. Tempk, kad pakeistum svarbumo eilę.
      </p>
      <div className="relative mb-4 max-w-[520px]">
        <input value={q} onFocus={() => { ensureCatalog(); setOpen(true) }} onChange={e => { setQ(e.target.value); setOpen(true) }}
          placeholder="Pridėk stilių (pvz. Rokas, Elektronika)..."
          className="w-full rounded-lg px-3 py-2 text-[13px] outline-none"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }} />
        {open && (
          <div className="absolute left-0 right-0 z-40 mt-1.5 max-h-[300px] overflow-y-auto rounded-lg shadow-xl"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}
            onMouseLeave={() => setOpen(false)}>
            {!catalog ? <div className="px-3 py-4 text-center text-[12px]" style={{ color: 'var(--text-faint)' }}>Kraunama…</div>
              : filtered.length === 0 ? <div className="px-3 py-4 text-center text-[12px]" style={{ color: 'var(--text-faint)' }}>Nieko nerasta.</div>
              : <ul>{filtered.map(c => (
                  <li key={c.legacy_style_id}>
                    <button onClick={() => add(c)} className="w-full text-left px-3 py-2 text-[13px] font-medium transition-colors"
                      style={{ color: 'var(--text-primary)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      {c.style_name}
                    </button>
                  </li>))}</ul>}
          </div>
        )}
      </div>
      {styles.length === 0 ? <EmptyState hint="Dar nepasirinkai mėgstamų stilių." /> : (
        <div className="flex flex-wrap gap-2">
          {styles.map((s, idx) => (
            <span key={s.legacy_style_id}
              draggable onDragStart={() => { dragId.current = s.legacy_style_id }}
              onDragOver={e => { e.preventDefault(); setDragOver(s.legacy_style_id) }}
              onDragLeave={() => setDragOver(o => o === s.legacy_style_id ? null : o)}
              onDrop={() => handleDrop(s.legacy_style_id)}
              className="group inline-flex items-center gap-2 rounded-full pl-2.5 pr-1.5 py-1.5 cursor-grab active:cursor-grabbing transition-colors"
              style={{ background: 'var(--bg-elevated)', border: `1px solid ${dragOver === s.legacy_style_id ? 'var(--accent-orange)' : 'var(--border-default)'}` }}>
              <span className="text-[11px] font-black tabular-nums" style={{ color: 'var(--text-faint)' }}>{idx + 1}</span>
              <span className="text-[12.5px] font-bold">{s.style_name}</span>
              <button onClick={() => remove(s.legacy_style_id)} title="Pašalinti"
                className="h-5 w-5 inline-flex items-center justify-center rounded-full transition-colors" style={{ color: 'var(--text-faint)' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#f43f5e')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}>
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M3 3l10 10M13 3L3 13"/></svg>
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyState({ hint }: { hint: string }) {
  return (
    <div className="rounded-2xl px-6 py-10 text-center" style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border-default)' }}>
      <div className="text-3xl mb-2 opacity-60">🎶</div>
      <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>{hint}</div>
    </div>
  )
}
