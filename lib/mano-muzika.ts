// lib/mano-muzika.ts
// ───────────────────────────────────────────────────────────────────────────
// „Mano muzika" data layer — vienas rikiuojamas „Mėgstami" sąrašas + biblioteka.
//
//   • Mėgstami (bucket=1) — VIENAS rikiuojamas sąrašas. Pirmi PROFILE_CUTOFF
//     (20) rodomi profilyje. sort_order = rangas.
//   • Biblioteka (bucket=0/nėra curated) — visi patiktukai (likes), kurie dar
//     nesurikiuoti. Pridėjimas = patiktukas; iš bibliotekos keliama į Mėgstamus.
// ───────────────────────────────────────────────────────────────────────────

import { createAdminClient } from '@/lib/supabase'

export type FavKind = 'artist' | 'album' | 'track'

export const PROFILE_CUTOFF = 20  // kiek viršutinių rodoma profilyje
export const RANKED_CAP = 500     // maks. rikiuojamų įrašų vienoje rūšyje
export const MOOD_CAP = 20        // maks. nuotaikos dainų (top 20)

export type MusicItem = {
  kind: FavKind
  id: number
  title: string
  subtitle: string
  cover: string | null
  href: string | null
  ranked: boolean
  sort_order: number
  style: string | null   // pagrindinis žanras (rikiavimui/filtravimui)
  substyleIds: number[]   // legacy_style_id sąrašas (substilių pill'ams)
  styleRanks: Record<string, number> // pozicija PER stilių (style_key → rangas)
}
export type KindCollection = { ranked: MusicItem[]; library: MusicItem[] }

export type MoodSong = {
  id: number
  track_id: number
  mood_label: string | null
  is_active: boolean
  sort_order: number
  track: { id: number; slug: string; title: string; cover_url: string | null; artist: { slug: string; name: string } | null } | null
}
export type FavStyle = { legacy_style_id: number; style_slug: string; style_name: string; sort_order: number }
export type MeterEntry = { name: string; percent: number }

export type MyMusic = {
  artist: KindCollection
  album: KindCollection
  track: KindCollection
  moodSongs: MoodSong[]
  styles: FavStyle[]
  musicMeter: MeterEntry[]
  meterRaw: any[]   // RAW legacy_music_meter (profilio equalizeriui, identiškas vaizdas)
  counts: { artists: number; albums: number; tracks: number; moodSongs: number; styles: number }
  setup: { completed: boolean; skipped: boolean; completedAt: string | null }
}

const TABLE: Record<FavKind, string> = { artist: 'profile_favorite_artists', album: 'profile_favorite_albums', track: 'profile_favorite_tracks' }
const ID_COL: Record<FavKind, string> = { artist: 'artist_id', album: 'album_id', track: 'track_id' }

function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return (v[0] ?? null) as T | null
  return (v ?? null) as T | null
}
function hrefFor(kind: FavKind, slug: string, id: number): string {
  return kind === 'artist' ? `/atlikejai/${slug}` : kind === 'album' ? `/albumai/${slug}-${id}` : `/dainos/${slug}-${id}`
}
// YouTube miniatiūra iš video_url (dainos dažnai neturi cover_url).
function ytThumb(url: string | null | undefined): string | null {
  const m = (url || '').match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/)
  return m ? `https://img.youtube.com/vi/${m[1]}/mqdefault.jpg` : null
}

// Pagrindinis žanras (be parent_id) kiekvienam artist_id — stilių rikiavimui.
async function mainGenreMap(sb: any, artistIds: number[]): Promise<Map<number, string>> {
  const m = new Map<number, string>()
  if (!artistIds.length) return m
  const ids = [...new Set(artistIds)]
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await sb.from('artist_genres').select('artist_id, genres:genre_id(name, parent_id)').in('artist_id', ids.slice(i, i + 300))
    for (const r of (data || []) as any[]) {
      const g = one<any>(r.genres)
      if (!g || g.parent_id !== null) continue
      if (!m.has(r.artist_id)) m.set(r.artist_id, g.name)
    }
  }
  return m
}

// artist_id → legacy_style_id[] (substiliai, substilių pill'ams).
async function artistSubstyleMap(sb: any, artistIds: number[]): Promise<Map<number, number[]>> {
  const m = new Map<number, number[]>()
  if (!artistIds.length) return m
  const ids = [...new Set(artistIds)]
  for (let i = 0; i < ids.length; i += 300) {
    try {
      const { data } = await sb.from('artist_substyles').select('artist_id, legacy_style_id').in('artist_id', ids.slice(i, i + 300))
      for (const r of (data || []) as any[]) { const a = m.get(r.artist_id) || []; a.push(r.legacy_style_id); m.set(r.artist_id, a) }
    } catch { /* substyles optional */ }
  }
  return m
}

// Hidratuoja id → {title, subtitle, cover, slug, artist_id, pop}
// `pop` = globalus music.lt populiarumas (atlikėjams legacy_likes = music.lt
// patiktukai, albumams/dainoms score) — naudojamas numatytajam rikiavimui.
type HydrItem = { title: string; subtitle: string; cover: string | null; slug: string; artist_id: number | null; pop: number }
async function hydrateItems(sb: any, kind: FavKind, ids: number[]): Promise<Map<number, HydrItem>> {
  const m = new Map<number, HydrItem>()
  if (!ids.length) return m
  const sel = kind === 'artist'
    ? 'id, slug, name, cover_image_url, legacy_likes, score'
    : kind === 'album'
      ? 'id, slug, title, cover_image_url, score, artist_id, artists:artist_id(name)'
      : 'id, slug, title, cover_url, video_url, score, artist_id, artists:artist_id(name)'
  const table = kind === 'artist' ? 'artists' : kind === 'album' ? 'albums' : 'tracks'
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await sb.from(table).select(sel).in('id', ids.slice(i, i + 300))
    for (const r of (data || []) as any[]) {
      if (kind === 'artist') {
        const pop = Number(r.legacy_likes ?? 0) || Number(r.score ?? 0) || 0
        m.set(r.id, { title: r.name, subtitle: 'Atlikėjas', cover: r.cover_image_url ?? null, slug: r.slug, artist_id: r.id, pop })
      } else {
        const artist = one<any>(r.artists)?.name || null
        const cover = kind === 'album' ? (r.cover_image_url ?? null) : (r.cover_url || ytThumb(r.video_url))
        m.set(r.id, { title: r.title, subtitle: artist || (kind === 'album' ? 'Albumas' : 'Daina'), cover, slug: r.slug, artist_id: r.artist_id ?? null, pop: Number(r.score ?? 0) || 0 })
      }
    }
  }
  return m
}

async function collectKind(sb: any, kind: FavKind, userId: string): Promise<KindCollection> {
  const idCol = ID_COL[kind]
  const [curRes, likeRes, srRes] = await Promise.all([
    sb.from(TABLE[kind]).select(`${idCol}, sort_order`).eq('user_id', userId).eq('bucket', 1).order('sort_order'),
    sb.from('likes').select('entity_id, created_at').eq('entity_type', kind).eq('user_id', userId).not('entity_id', 'is', null).limit(3000),
    sb.from('profile_style_ranks').select('entity_id, style_key, sort_order').eq('user_id', userId).eq('kind', kind),
  ])
  // Per-stilių rangai: entity_id → { style_key → rangas }.
  const styleRanksMap = new Map<number, Record<string, number>>()
  for (const r of (srRes.data || []) as any[]) {
    const m = styleRanksMap.get(r.entity_id) || {}; m[r.style_key] = r.sort_order; styleRanksMap.set(r.entity_id, m)
  }
  const rankedIds: number[] = (curRes.data || []).map((r: any) => r[idCol])
  const rankedSet = new Set(rankedIds)
  const likedAt = new Map<number, string>()
  for (const r of (likeRes.data || []) as any[]) {
    const id = r.entity_id; if (id == null || rankedSet.has(id)) continue
    const p = likedAt.get(id); if (!p || (r.created_at && r.created_at > p)) likedAt.set(id, r.created_at || '')
  }
  // Kandidatai bibliotekai (visi patiktukai, kurie nėra rikiuoti). Hidratuojam
  // kartu su rikiuotais, tada biblioteką rikiuojam pagal music.lt populiarumą.
  const likedCandidates = [...likedAt.keys()].slice(0, 2000)

  const allIds = [...new Set([...rankedIds, ...likedCandidates])]
  const hy = await hydrateItems(sb, kind, allIds)
  // Biblioteka — numatytasis rikiavimas pagal music.lt patiktukus/populiarumą
  // (kol nario nesurikiuota). Lygiosioms — naujesnis patiktukas pirma.
  const libraryIds = likedCandidates
    .filter(id => hy.has(id))
    .sort((a, b) => ((hy.get(b)!.pop) - (hy.get(a)!.pop)) || ((likedAt.get(a) || '') < (likedAt.get(b) || '') ? 1 : -1))
    .slice(0, 1500)
  // stilius — pagal pagrindinį atlikėjo žanrą; substiliai — iš artist_substyles.
  const artistIds: number[] = []
  for (const id of allIds) { const h = hy.get(id); if (h?.artist_id) artistIds.push(h.artist_id) }
  const [genres, substyleMap] = await Promise.all([mainGenreMap(sb, artistIds), artistSubstyleMap(sb, artistIds)])
  const mk = (id: number, ranked: boolean, sort_order: number): MusicItem | null => {
    const h = hy.get(id); if (!h) return null
    return { kind, id, title: h.title, subtitle: h.subtitle, cover: h.cover, href: h.slug ? hrefFor(kind, h.slug, id) : null, ranked, sort_order, style: h.artist_id ? (genres.get(h.artist_id) || null) : null, substyleIds: h.artist_id ? (substyleMap.get(h.artist_id) || []) : [], styleRanks: styleRanksMap.get(id) || {} }
  }
  return {
    ranked: rankedIds.map((id, i) => mk(id, true, i)).filter(Boolean) as MusicItem[],
    library: libraryIds.map((id, i) => mk(id, false, i)).filter(Boolean) as MusicItem[],
  }
}

export async function getMyMusic(userId: string): Promise<MyMusic> {
  const sb = createAdminClient()
  const { data: prof } = await sb.from('profiles')
    .select('username, music_setup_completed_at, music_setup_skipped, mood_song_track_id, legacy_music_meter')
    .eq('id', userId).maybeSingle() as { data: any }
  const username: string | null = prof?.username || null
  if (username) { try { await sb.rpc('link_user_likes', { p_user_id: userId, p_username: username }) } catch {} }

  const [artist, album, track, moodRes, styleRes] = await Promise.all([
    collectKind(sb, 'artist', userId),
    collectKind(sb, 'album', userId),
    collectKind(sb, 'track', userId),
    sb.from('profile_mood_songs')
      .select('id, track_id, mood_label, is_active, sort_order, tracks:track_id(id, slug, title, cover_url, artists:artist_id(slug, name))')
      .eq('user_id', userId).order('sort_order'),
    sb.from('profile_favorite_styles').select('legacy_style_id, style_slug, style_name, sort_order').eq('profile_id', userId).order('sort_order'),
  ])

  const mapTrackLike = (rel: any) => { const t = one<any>(rel); return t ? { id: t.id, slug: t.slug, title: t.title, cover_url: t.cover_url, artist: one(t.artists) } : null }
  let moodSongs: MoodSong[] = (moodRes.data || []).map((r: any) => ({
    id: r.id, track_id: r.track_id, mood_label: r.mood_label || null, is_active: !!r.is_active, sort_order: r.sort_order, track: mapTrackLike(r.tracks),
  }))
  // Sinchronizuojam su profiles.mood_song_track_id (legacy nuotaikos daina,
  // kuri gali nebūti profile_mood_songs lentelėje).
  const activeId = prof?.mood_song_track_id ? Number(prof.mood_song_track_id) : null
  if (activeId) {
    if (!moodSongs.some(m => m.track_id === activeId)) {
      const { data: t } = await sb.from('tracks').select('id, slug, title, cover_url, artists:artist_id(slug, name)').eq('id', activeId).maybeSingle() as { data: any }
      if (t) moodSongs = [{ id: -1, track_id: activeId, mood_label: null, is_active: true, sort_order: -1, track: { id: t.id, slug: t.slug, title: t.title, cover_url: t.cover_url, artist: one(t.artists) } }, ...moodSongs]
    }
    moodSongs = moodSongs.map(m => ({ ...m, is_active: m.track_id === activeId }))
  }
  const styles: FavStyle[] = (styleRes.data || []) as FavStyle[]

  // Muzikometras (broad style %), jei yra
  let musicMeter: MeterEntry[] = []
  const mm = prof?.legacy_music_meter
  if (Array.isArray(mm)) musicMeter = mm.map((e: any) => ({ name: e.name || e.style_name || e.slug || '', percent: Number(e.percent ?? e.width_px ?? 0) })).filter(e => e.name && e.percent > 0)

  return {
    artist, album, track, moodSongs, styles, musicMeter,
    meterRaw: Array.isArray(mm) ? mm : [],
    counts: {
      artists: artist.ranked.length + artist.library.length,
      albums: album.ranked.length + album.library.length,
      tracks: track.ranked.length + track.library.length,
      moodSongs: moodSongs.length, styles: styles.length,
    },
    setup: { completed: !!prof?.music_setup_completed_at, skipped: !!prof?.music_setup_skipped, completedAt: prof?.music_setup_completed_at || null },
  }
}

// ── ADD į biblioteką = patiktukas (likes) ──────────────────────────────────
export async function addToLibrary(userId: string, kind: FavKind, ids: number[]) {
  if (!ids.length) return { ok: true }
  const sb = createAdminClient()
  const { data: prof } = await sb.from('profiles').select('username').eq('id', userId).maybeSingle() as { data: any }
  const username = prof?.username || `user_${userId.slice(0, 8)}`
  const rows = ids.map(id => ({ entity_type: kind, entity_id: id, user_id: userId, user_username: username }))
  const { error } = await sb.from('likes').upsert(rows, { onConflict: 'entity_type,entity_id,user_username', ignoreDuplicates: true })
  if (error) throw error
  return { ok: true }
}
export async function addFavorite(userId: string, kind: FavKind, entityId: number) { return addToLibrary(userId, kind, [entityId]) }

// ── UNLIKE — visiškai pašalina (curated + patiktukas) ──────────────────────
export async function removeFavorite(userId: string, kind: FavKind, entityId: number) {
  const sb = createAdminClient()
  await sb.from(TABLE[kind]).delete().eq('user_id', userId).eq(ID_COL[kind], entityId)
  const { data: prof } = await sb.from('profiles').select('username').eq('id', userId).maybeSingle() as { data: any }
  let dq = sb.from('likes').delete().eq('entity_type', kind).eq('entity_id', entityId)
  dq = prof?.username ? dq.or(`user_id.eq.${userId},user_username.ilike.${prof.username}`) : dq.eq('user_id', userId)
  await dq
  return { ok: true }
}

// ── MOVE į Mėgstamus (rikiuojamas sąrašas) su limitu ───────────────────────
export async function moveToRanked(userId: string, kind: FavKind, entityId: number) {
  const sb = createAdminClient()
  const idCol = ID_COL[kind]
  const { data: existing } = await sb.from(TABLE[kind]).select('bucket').eq('user_id', userId).eq(idCol, entityId).maybeSingle() as { data: any }
  if (!existing || existing.bucket !== 1) {
    const { count } = await sb.from(TABLE[kind]).select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('bucket', 1)
    if ((count || 0) >= RANKED_CAP) throw new Error(`Mėgstamų sąrašas pilnas (maks. ${RANKED_CAP})`)
  }
  await addToLibrary(userId, kind, [entityId])
  const { data: maxRow } = await sb.from(TABLE[kind]).select('sort_order').eq('user_id', userId).eq('bucket', 1).order('sort_order', { ascending: false }).limit(1).maybeSingle() as { data: any }
  const nextOrder = ((maxRow?.sort_order) ?? -1) + 1
  const { error } = await sb.from(TABLE[kind]).upsert({ user_id: userId, [idCol]: entityId, bucket: 1, sort_order: nextOrder }, { onConflict: `user_id,${idCol}` })
  if (error) throw error
  return { ok: true }
}

export async function removeFromRanked(userId: string, kind: FavKind, entityId: number) {
  const sb = createAdminClient()
  const { error } = await sb.from(TABLE[kind]).delete().eq('user_id', userId).eq(ID_COL[kind], entityId)
  if (error) throw error
  return { ok: true }
}

export async function reorderRanked(userId: string, kind: FavKind, orderedIds: number[]) {
  const sb = createAdminClient()
  const idCol = ID_COL[kind]
  const rows = orderedIds.map((id, idx) => ({ user_id: userId, [idCol]: id, sort_order: idx, bucket: 1 }))
  if (!rows.length) return { ok: true }
  const { error } = await sb.from(TABLE[kind]).upsert(rows, { onConflict: `user_id,${idCol}` })
  if (error) throw error
  return { ok: true }
}

// ── PER-STILIAUS rikiavimas (NEPRIKLAUSOMI stilių/substilių topai) ─────────
// styleKey = stiliaus raktas (žanro pavadinimas arba `sub:<legacy_style_id>`).
// orderedIds = to stiliaus įrašai nauja tvarka. sort_order = index.
export async function setStyleRank(userId: string, kind: FavKind, styleKey: string, orderedIds: number[]) {
  const sb = createAdminClient()
  const key = (styleKey || '').slice(0, 120)
  const rows = orderedIds.map((id, idx) => ({ user_id: userId, kind, style_key: key, entity_id: id, sort_order: idx }))
  if (!rows.length) return { ok: true }
  const { error } = await sb.from('profile_style_ranks').upsert(rows, { onConflict: 'user_id,kind,style_key,entity_id' })
  if (error) throw error
  return { ok: true }
}

// ── PASIŪLYMŲ ATMETIMAS (neigiamas signalas — ko nesiūlyti) ────────────────
export async function dismissSuggestion(userId: string, kind: FavKind, entityId: number) {
  const sb = createAdminClient()
  const { error } = await sb.from('profile_suggestion_dismissals')
    .upsert({ user_id: userId, kind, entity_id: entityId }, { onConflict: 'user_id,kind,entity_id', ignoreDuplicates: true })
  if (error) throw error
  return { ok: true }
}
async function dismissedIds(sb: any, userId: string, kind: FavKind): Promise<Set<number>> {
  const { data } = await sb.from('profile_suggestion_dismissals').select('entity_id').eq('user_id', userId).eq('kind', kind).limit(5000)
  return new Set(((data || []) as any[]).map(r => r.entity_id))
}

// ── MOOD SONGS (top 20, rikiuojamos — #1 = aktyvi, rodoma profilyje) ────────
export async function addMoodSong(userId: string, trackId: number, label?: string, makeActive = false) {
  const sb = createAdminClient()
  const { count } = await sb.from('profile_mood_songs').select('*', { count: 'exact', head: true }).eq('user_id', userId)
  const { data: existing } = await sb.from('profile_mood_songs').select('track_id').eq('user_id', userId).eq('track_id', trackId).maybeSingle()
  if (!existing && (count || 0) >= MOOD_CAP) throw new Error(`Nuotaikos dainų sąrašas pilnas (maks. ${MOOD_CAP})`)
  const { data: maxRow } = await sb.from('profile_mood_songs').select('sort_order').eq('user_id', userId).order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const nextOrder = ((maxRow as any)?.sort_order ?? -1) + 1
  const { error } = await sb.from('profile_mood_songs').upsert({ user_id: userId, track_id: trackId, mood_label: label || null, sort_order: nextOrder }, { onConflict: 'user_id,track_id', ignoreDuplicates: false })
  if (error) throw error
  if (makeActive) await setActiveMoodSong(userId, trackId)
  return { ok: true }
}
export async function removeMoodSong(userId: string, trackId: number) {
  const sb = createAdminClient()
  const { data: row } = await sb.from('profile_mood_songs').select('is_active').eq('user_id', userId).eq('track_id', trackId).maybeSingle()
  await sb.from('profile_mood_songs').delete().eq('user_id', userId).eq('track_id', trackId)
  if ((row as any)?.is_active) await sb.rpc('resolve_active_mood_song', { p_user_id: userId, p_track_id: null })
  return { ok: true }
}
export async function setActiveMoodSong(userId: string, trackId: number | null) {
  const sb = createAdminClient()
  const { error } = await sb.rpc('resolve_active_mood_song', { p_user_id: userId, p_track_id: trackId })
  if (error) throw error
  return { ok: true }
}
export async function reorderMoodSongs(userId: string, orderedIds: number[]) {
  const sb = createAdminClient()
  await Promise.all(orderedIds.map((id, idx) => sb.from('profile_mood_songs').update({ sort_order: idx }).eq('user_id', userId).eq('id', id)))
  // #1 pozicija = aktyvi nuotaikos daina (rodoma profilio viršuje).
  const firstId = orderedIds[0]
  if (firstId != null) {
    const { data: first } = await sb.from('profile_mood_songs').select('track_id').eq('user_id', userId).eq('id', firstId).maybeSingle()
    const tid = (first as any)?.track_id
    if (tid) { try { await setActiveMoodSong(userId, tid) } catch {} }
  }
  return { ok: true }
}

// Top-20 nuotaikos dainos profiliui (rikiuotos; #1 pirma). Su video_url grotuvui.
export async function getProfileMoodSongs(userId: string, limit = MOOD_CAP): Promise<{ id: number; slug: string; title: string; cover_url: string | null; video_url: string | null; artist: { slug: string; name: string; cover_image_url: string | null } | null }[]> {
  const sb = createAdminClient()
  const { data } = await sb.from('profile_mood_songs')
    .select('track_id, sort_order, tracks:track_id(id, slug, title, cover_url, video_url, artists:artist_id(slug, name, cover_image_url))')
    .eq('user_id', userId).order('sort_order').limit(limit)
  const out: any[] = []
  for (const r of (data || []) as any[]) {
    const t = one<any>(r.tracks); if (!t) continue
    out.push({ id: t.id, slug: t.slug, title: t.title, cover_url: t.cover_url ?? null, video_url: t.video_url ?? null, artist: one<any>(t.artists) || null })
  }
  return out
}

// ── STYLES ─────────────────────────────────────────────────────────────────
export async function getStyleCatalog(): Promise<{ legacy_style_id: number; style_slug: string; style_name: string }[]> {
  const sb = createAdminClient()
  const { data } = await sb.from('profile_favorite_styles').select('legacy_style_id, style_slug, style_name').limit(5000)
  const seen = new Map<number, { legacy_style_id: number; style_slug: string; style_name: string }>()
  for (const r of (data || []) as any[]) if (!seen.has(r.legacy_style_id)) seen.set(r.legacy_style_id, { legacy_style_id: r.legacy_style_id, style_slug: r.style_slug, style_name: r.style_name })
  return [...seen.values()].sort((a, b) => a.style_name.localeCompare(b.style_name, 'lt'))
}
export async function getPopularStyles(limit = 14): Promise<{ legacy_style_id: number; style_slug: string; style_name: string }[]> {
  const sb = createAdminClient()
  const { data } = await sb.from('profile_favorite_styles').select('legacy_style_id, style_slug, style_name').limit(8000)
  const counts = new Map<number, { meta: { legacy_style_id: number; style_slug: string; style_name: string }; n: number }>()
  for (const r of (data || []) as any[]) {
    const cur = counts.get(r.legacy_style_id)
    if (cur) cur.n++; else counts.set(r.legacy_style_id, { meta: { legacy_style_id: r.legacy_style_id, style_slug: r.style_slug, style_name: r.style_name }, n: 1 })
  }
  return [...counts.values()].sort((a, b) => b.n - a.n).slice(0, limit).map(x => x.meta)
}
export async function addStyle(userId: string, style: { legacy_style_id: number; style_slug: string; style_name: string }) {
  const sb = createAdminClient()
  const { data: maxRow } = await sb.from('profile_favorite_styles').select('sort_order').eq('profile_id', userId).order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const nextOrder = ((maxRow as any)?.sort_order ?? 0) + 1
  const { error } = await sb.from('profile_favorite_styles').upsert({ profile_id: userId, legacy_style_id: style.legacy_style_id, style_slug: style.style_slug, style_name: style.style_name, sort_order: nextOrder }, { onConflict: 'profile_id,legacy_style_id', ignoreDuplicates: true })
  if (error) throw error
  return { ok: true }
}
export async function removeStyle(userId: string, legacyStyleId: number) {
  const sb = createAdminClient()
  const { error } = await sb.from('profile_favorite_styles').delete().eq('profile_id', userId).eq('legacy_style_id', legacyStyleId)
  if (error) throw error
  return { ok: true }
}
export async function reorderStyles(userId: string, orderedLegacyIds: number[]) {
  const sb = createAdminClient()
  await Promise.all(orderedLegacyIds.map((id, idx) => sb.from('profile_favorite_styles').update({ sort_order: idx }).eq('profile_id', userId).eq('legacy_style_id', id)))
  return { ok: true }
}

// ── ONBOARDING ─────────────────────────────────────────────────────────────
export async function markSetupComplete(userId: string) {
  const sb = createAdminClient()
  await sb.from('profiles').update({ music_setup_completed_at: new Date().toISOString() }).eq('id', userId)
  return { ok: true }
}
export async function markSetupSkipped(userId: string) {
  const sb = createAdminClient()
  await sb.from('profiles').update({ music_setup_skipped: true }).eq('id', userId)
  return { ok: true }
}

// ── SUGGESTIONS (onboarding) ───────────────────────────────────────────────
export async function getArtistSuggestions(opts: { limit?: number; excludeIds?: number[]; genre?: string | null } = {}) {
  const sb = createAdminClient()
  const limit = opts.limit ?? 24
  const { data } = await sb.from('artists').select('id, slug, name, cover_image_url, score, country').not('cover_image_url', 'is', null).order('score', { ascending: false, nullsFirst: false }).limit(limit + (opts.excludeIds?.length || 0) + 20)
  let rows = (data || []) as any[]
  rows = rows.filter(r => r.country !== 'Rusija')
  if (opts.excludeIds?.length) { const ex = new Set(opts.excludeIds); rows = rows.filter(r => !ex.has(r.id)) }
  return rows.slice(0, limit).map(r => ({ id: r.id, slug: r.slug, name: r.name, cover_image_url: r.cover_image_url }))
}

// ── TRACK SUGGESTIONS — dainos, kurios galėtų sudominti ─────────────────────
// Populiarios dainos iš nario mėgstamų atlikėjų (kurių jis dar neturi), tada
// fallback — bendrai populiarios dainos. Naudojama /mano-muzika dainų šone.
export type TrackSuggestion = { id: number; slug: string; title: string; cover_url: string | null; artist: { slug: string; name: string } | null; reason: string }
export async function getTrackSuggestions(userId: string, limit = 24): Promise<TrackSuggestion[]> {
  const sb = createAdminClient()
  const { data: prof } = await sb.from('profiles').select('username').eq('id', userId).maybeSingle() as { data: any }
  const username = prof?.username || null

  // Mėgstami atlikėjai (curated bucket=1 + patiktukai).
  const [favArtCur, favArtLikes, ownTrkCur, ownTrkLikes] = await Promise.all([
    sb.from('profile_favorite_artists').select('artist_id').eq('user_id', userId),
    sb.from('likes').select('entity_id').eq('entity_type', 'artist').eq('user_id', userId).not('entity_id', 'is', null).limit(2000),
    sb.from('profile_favorite_tracks').select('track_id').eq('user_id', userId),
    sb.from('likes').select('entity_id').eq('entity_type', 'track').eq('user_id', userId).not('entity_id', 'is', null).limit(3000),
  ])
  const artistIds = [...new Set([
    ...((favArtCur.data || []) as any[]).map(r => r.artist_id),
    ...((favArtLikes.data || []) as any[]).map(r => r.entity_id),
  ].filter(Boolean))]
  const dism = await dismissedIds(sb, userId, 'track')
  const ownedTrackIds = new Set<number>([
    ...((ownTrkCur.data || []) as any[]).map(r => r.track_id),
    ...((ownTrkLikes.data || []) as any[]).map(r => r.entity_id),
    ...dism,
  ].filter(Boolean))

  const seenArtist = new Map<number, number>()  // dedup: maks. 3 per atlikėją
  const out: TrackSuggestion[] = []
  const pushRows = (rows: any[], reason: string) => {
    for (const r of rows) {
      if (out.length >= limit) break
      if (ownedTrackIds.has(r.id) || out.some(o => o.id === r.id)) continue
      const aid = r.artist_id ?? 0
      if ((seenArtist.get(aid) || 0) >= 3) continue
      seenArtist.set(aid, (seenArtist.get(aid) || 0) + 1)
      out.push({ id: r.id, slug: r.slug, title: r.title, cover_url: r.cover_url ?? null, artist: one<any>(r.artists) || null, reason })
    }
  }

  const withCover = (r: any) => ({ ...r, cover_url: r.cover_url || ytThumb(r.video_url) })
  // 1) Populiariausios dainos iš mėgstamų atlikėjų.
  if (artistIds.length) {
    for (let i = 0; i < artistIds.length && out.length < limit; i += 200) {
      const { data } = await sb.from('tracks')
        .select('id, slug, title, cover_url, video_url, artist_id, score, artists:artist_id(slug, name)')
        .in('artist_id', artistIds.slice(i, i + 200))
        .order('score', { ascending: false, nullsFirst: false })
        .limit(400)
      pushRows(((data || []) as any[]).map(withCover), 'Iš tavo mėgstamo atlikėjo')
    }
  }
  // 2) Fallback — bendrai populiarios dainos (ne Rusija).
  if (out.length < limit) {
    const { data } = await sb.from('tracks')
      .select('id, slug, title, cover_url, video_url, artist_id, score, artists:artist_id(slug, name, country)')
      .order('score', { ascending: false, nullsFirst: false })
      .limit(limit * 4 + ownedTrackIds.size)
    const rows = ((data || []) as any[]).filter(r => one<any>(r.artists)?.country !== 'Rusija').map(withCover)
    pushRows(rows, 'Populiaru music.lt')
  }
  return out.slice(0, limit)
}

// ── GENERIC SUGGESTIONS (atlikėjai / albumai / dainos) ─────────────────────
export async function getSuggestions(userId: string, kind: FavKind, limit = 24): Promise<TrackSuggestion[]> {
  if (kind === 'track') return getTrackSuggestions(userId, limit)
  const sb = createAdminClient()
  if (kind === 'artist') {
    const [curRes, likeRes] = await Promise.all([
      sb.from('profile_favorite_artists').select('artist_id').eq('user_id', userId),
      sb.from('likes').select('entity_id').eq('entity_type', 'artist').eq('user_id', userId).not('entity_id', 'is', null).limit(2000),
    ])
    const dism = await dismissedIds(sb, userId, 'artist')
    const owned = new Set<number>([...((curRes.data || []) as any[]).map(r => r.artist_id), ...((likeRes.data || []) as any[]).map(r => r.entity_id), ...dism].filter(Boolean))
    const { data } = await sb.from('artists')
      .select('id, slug, name, cover_image_url, score, country')
      .not('cover_image_url', 'is', null)
      .order('score', { ascending: false, nullsFirst: false })
      .limit(limit + owned.size + 30)
    const out: TrackSuggestion[] = []
    for (const r of (data || []) as any[]) {
      if (out.length >= limit) break
      if (owned.has(r.id) || r.country === 'Rusija') continue
      out.push({ id: r.id, slug: r.slug, title: r.name, cover_url: r.cover_image_url ?? null, artist: null, reason: 'Populiaru music.lt' })
    }
    return out
  }
  // album
  const [favArtCur, favArtLikes, ownCur, ownLikes] = await Promise.all([
    sb.from('profile_favorite_artists').select('artist_id').eq('user_id', userId),
    sb.from('likes').select('entity_id').eq('entity_type', 'artist').eq('user_id', userId).not('entity_id', 'is', null).limit(2000),
    sb.from('profile_favorite_albums').select('album_id').eq('user_id', userId),
    sb.from('likes').select('entity_id').eq('entity_type', 'album').eq('user_id', userId).not('entity_id', 'is', null).limit(3000),
  ])
  const artistIds = [...new Set([...((favArtCur.data || []) as any[]).map(r => r.artist_id), ...((favArtLikes.data || []) as any[]).map(r => r.entity_id)].filter(Boolean))]
  const dismAlb = await dismissedIds(sb, userId, 'album')
  const owned = new Set<number>([...((ownCur.data || []) as any[]).map(r => r.album_id), ...((ownLikes.data || []) as any[]).map(r => r.entity_id), ...dismAlb].filter(Boolean))
  const seenArtist = new Map<number, number>()
  const out: TrackSuggestion[] = []
  const push = (rows: any[], reason: string) => {
    for (const r of rows) {
      if (out.length >= limit) break
      if (owned.has(r.id) || out.some(o => o.id === r.id)) continue
      const aid = r.artist_id ?? 0
      if ((seenArtist.get(aid) || 0) >= 2) continue
      seenArtist.set(aid, (seenArtist.get(aid) || 0) + 1)
      out.push({ id: r.id, slug: r.slug, title: r.title, cover_url: r.cover_image_url ?? null, artist: one<any>(r.artists) || null, reason })
    }
  }
  if (artistIds.length) {
    for (let i = 0; i < artistIds.length && out.length < limit; i += 200) {
      const { data } = await sb.from('albums')
        .select('id, slug, title, cover_image_url, artist_id, score, artists:artist_id(slug, name)')
        .in('artist_id', artistIds.slice(i, i + 200))
        .not('cover_image_url', 'is', null)
        .order('score', { ascending: false, nullsFirst: false })
        .limit(400)
      push((data || []) as any[], 'Iš tavo mėgstamo atlikėjo')
    }
  }
  if (out.length < limit) {
    const { data } = await sb.from('albums')
      .select('id, slug, title, cover_image_url, artist_id, score, artists:artist_id(slug, name, country)')
      .not('cover_image_url', 'is', null)
      .order('score', { ascending: false, nullsFirst: false })
      .limit(limit * 4 + owned.size)
    push(((data || []) as any[]).filter(r => one<any>(r.artists)?.country !== 'Rusija'), 'Populiaru music.lt')
  }
  return out.slice(0, limit)
}
