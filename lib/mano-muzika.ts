// lib/mano-muzika.ts
// ───────────────────────────────────────────────────────────────────────────
// „Mano muzika" — nario kuruojamos mėgstamos muzikos valdymo data layer.
//
// Visa logika rašoma per service-role (createAdminClient). Auth gating vyksta
// API route'uose (getServerSession + resolveProfile). sort_order = rodymo eilė
// (drag reorder), is_featured = prisegtas/paryškintas, weight = populiarumo
// svoris (rankinis).
//
// Lentelės: profile_favorite_artists / _albums / _tracks, profile_mood_songs,
// profile_favorite_styles, profiles.mood_song_track_id (active mood) +
// music_setup_* onboarding vėliavos.
// ───────────────────────────────────────────────────────────────────────────

import { createAdminClient } from '@/lib/supabase'

export type FavKind = 'artist' | 'album' | 'track'

export type FavArtist = {
  artist_id: number
  sort_order: number
  is_featured: boolean
  weight: number
  note: string | null
  artist: { id: number; slug: string; name: string; cover_image_url: string | null } | null
}
export type FavAlbum = {
  album_id: number
  sort_order: number
  is_featured: boolean
  weight: number
  note: string | null
  album: { id: number; slug: string; title: string; cover_url: string | null; artist: { slug: string; name: string } | null } | null
}
export type FavTrack = {
  track_id: number
  sort_order: number
  is_featured: boolean
  weight: number
  note: string | null
  track: { id: number; slug: string; title: string; cover_url: string | null; artist: { slug: string; name: string } | null } | null
}
export type MoodSong = {
  id: number
  track_id: number
  mood_label: string | null
  is_active: boolean
  sort_order: number
  track: { id: number; slug: string; title: string; cover_url: string | null; artist: { slug: string; name: string } | null } | null
}
export type FavStyle = {
  legacy_style_id: number
  style_slug: string
  style_name: string
  sort_order: number
}

export type MyMusic = {
  artists: FavArtist[]
  albums: FavAlbum[]
  tracks: FavTrack[]
  moodSongs: MoodSong[]
  styles: FavStyle[]
  counts: { artists: number; albums: number; tracks: number; moodSongs: number; styles: number }
  setup: { completed: boolean; skipped: boolean; completedAt: string | null }
}

// Supabase embedded to-one ryšiai kartais grąžinami kaip masyvas — normalizuojam.
function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return (v[0] ?? null) as T | null
  return (v ?? null) as T | null
}

const TABLE: Record<FavKind, string> = {
  artist: 'profile_favorite_artists',
  album: 'profile_favorite_albums',
  track: 'profile_favorite_tracks',
}
const ID_COL: Record<FavKind, string> = {
  artist: 'artist_id',
  album: 'album_id',
  track: 'track_id',
}

// ── READ: visa nario kolekcija ─────────────────────────────────────────────
export async function getMyMusic(userId: string): Promise<MyMusic> {
  const sb = createAdminClient()

  // Profilis (username reikalingas „likes" sąsajai — daug legacy patiktukų
  // turi tik user_username, be user_id).
  const { data: prof } = await sb.from('profiles')
    .select('username, music_setup_completed_at, music_setup_skipped')
    .eq('id', userId).maybeSingle() as { data: any }
  const username: string | null = prof?.username || null

  const [artistIds, albumIds, trackIds, moodRes, styleRes] = await Promise.all([
    collectFavIds(sb, 'artist', userId, username),
    collectFavIds(sb, 'album', userId, username),
    collectFavIds(sb, 'track', userId, username),
    sb.from('profile_mood_songs')
      .select('id, track_id, mood_label, is_active, sort_order, tracks:track_id(id, slug, title, cover_url, artists:artist_id(slug, name))')
      .eq('user_id', userId).order('sort_order'),
    sb.from('profile_favorite_styles')
      .select('legacy_style_id, style_slug, style_name, sort_order')
      .eq('profile_id', userId).order('sort_order'),
  ])

  const mapTrackLike = (rel: any) => {
    const t = one<any>(rel)
    return t ? { id: t.id, slug: t.slug, title: t.title, cover_url: t.cover_url, artist: one(t.artists) } : null
  }

  // ── Hidratuojam pavadinimus/viršelius pagal surinktus id ──────────────────
  const [artHydra, albHydra, trkHydra] = await Promise.all([
    hydrateIn(sb, 'artists', 'id, slug, name, cover_image_url', artistIds.ids),
    hydrateIn(sb, 'albums', 'id, slug, title, cover_url:cover_image_url, artists:artist_id(slug, name)', albumIds.ids),
    hydrateIn(sb, 'tracks', 'id, slug, title, cover_url, artists:artist_id(slug, name)', trackIds.ids),
  ])

  const artists: FavArtist[] = artistIds.ids.map((id, idx) => {
    const m = artistIds.meta.get(id); const a = artHydra.get(id)
    return { artist_id: id, sort_order: m?.sort_order ?? idx, is_featured: !!m?.is_featured, weight: m?.weight || 0, note: m?.note || null,
      artist: a ? { id: a.id, slug: a.slug, name: a.name, cover_image_url: a.cover_image_url ?? null } : null }
  }).filter(x => x.artist)
  const albums: FavAlbum[] = albumIds.ids.map((id, idx) => {
    const m = albumIds.meta.get(id); const al = albHydra.get(id)
    return { album_id: id, sort_order: m?.sort_order ?? idx, is_featured: !!m?.is_featured, weight: m?.weight || 0, note: m?.note || null,
      album: al ? { id: al.id, slug: al.slug, title: al.title, cover_url: al.cover_url ?? null, artist: one(al.artists) } : null }
  }).filter(x => x.album)
  const tracks: FavTrack[] = trackIds.ids.map((id, idx) => {
    const m = trackIds.meta.get(id); const t = trkHydra.get(id)
    return { track_id: id, sort_order: m?.sort_order ?? idx, is_featured: !!m?.is_featured, weight: m?.weight || 0, note: m?.note || null,
      track: t ? { id: t.id, slug: t.slug, title: t.title, cover_url: t.cover_url ?? null, artist: one(t.artists) } : null }
  }).filter(x => x.track)

  const moodSongs: MoodSong[] = (moodRes.data || []).map((r: any) => ({
    id: r.id, track_id: r.track_id, mood_label: r.mood_label || null,
    is_active: !!r.is_active, sort_order: r.sort_order, track: mapTrackLike(r.tracks),
  }))
  const styles: FavStyle[] = (styleRes.data || []) as FavStyle[]

  return {
    artists, albums, tracks, moodSongs, styles,
    counts: {
      artists: artists.length, albums: albums.length, tracks: tracks.length,
      moodSongs: moodSongs.length, styles: styles.length,
    },
    setup: {
      completed: !!prof?.music_setup_completed_at,
      skipped: !!prof?.music_setup_skipped,
      completedAt: prof?.music_setup_completed_at || null,
    },
  }
}

// ── Surenka entity id sąrašą = kuruoti (profile_favorite_*) ∪ patiktukai (likes) ──
// Tvarka: featured pirma, tada kuruoti pagal sort_order, tada patikti-bet-nekuruoti
// pagal patiktuko datą (naujausi viršuj). meta — kuruoto įrašo overlay.
type FavMeta = { sort_order: number; is_featured: boolean; weight: number; note: string | null }
async function collectFavIds(sb: any, kind: FavKind, userId: string, username: string | null): Promise<{ ids: number[]; meta: Map<number, FavMeta> }> {
  const idCol = ID_COL[kind]
  const [curRes, likeRes] = await Promise.all([
    sb.from(TABLE[kind]).select(`${idCol}, sort_order, is_featured, weight, note`).eq('user_id', userId),
    (() => {
      let qy = sb.from('likes').select('entity_id, created_at').eq('entity_type', kind).not('entity_id', 'is', null)
      qy = username ? qy.or(`user_id.eq.${userId},user_username.ilike.${username}`) : qy.eq('user_id', userId)
      return qy.limit(2000)
    })(),
  ])
  const meta = new Map<number, FavMeta>()
  for (const r of (curRes.data || []) as any[]) {
    meta.set(r[idCol], { sort_order: r.sort_order ?? 0, is_featured: !!r.is_featured, weight: r.weight || 0, note: r.note || null })
  }
  const likedAt = new Map<number, string>()
  for (const r of (likeRes.data || []) as any[]) {
    const id = r.entity_id; if (id == null) continue
    const prev = likedAt.get(id)
    if (!prev || (r.created_at && r.created_at > prev)) likedAt.set(id, r.created_at || '')
  }
  const curatedOrdered = [...meta.entries()]
    .sort((a, b) => (Number(b[1].is_featured) - Number(a[1].is_featured)) || (a[1].sort_order - b[1].sort_order))
    .map(e => e[0])
  const likedOnly = [...likedAt.entries()]
    .filter(([id]) => !meta.has(id))
    .sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0))
    .map(e => e[0])
  const ids = [...curatedOrdered, ...likedOnly].slice(0, 800)
  return { ids, meta }
}

async function hydrateIn(sb: any, table: string, select: string, ids: number[]): Promise<Map<number, any>> {
  if (!ids.length) return new Map()
  const m = new Map<number, any>()
  // batch po 300, kad .in() neperaugtų
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await sb.from(table).select(select).in('id', ids.slice(i, i + 300))
    for (const r of (data || []) as any[]) m.set(r.id, r)
  }
  return m
}

// ── ADD favorite (artist/album/track) ──────────────────────────────────────
// Įdedam į galą (max sort_order + 1). Idempotentiška (ON CONFLICT skip).
export async function addFavorite(userId: string, kind: FavKind, entityId: number) {
  const sb = createAdminClient()
  const table = TABLE[kind]
  const idCol = ID_COL[kind]

  const { data: maxRow } = await sb
    .from(table).select('sort_order')
    .eq('user_id', userId).order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const nextOrder = ((maxRow as any)?.sort_order ?? -1) + 1

  const { error } = await sb
    .from(table)
    .upsert({ user_id: userId, [idCol]: entityId, sort_order: nextOrder }, { onConflict: `user_id,${idCol}`, ignoreDuplicates: true })
  if (error) throw error
  return { ok: true }
}

// ── REMOVE favorite ────────────────────────────────────────────────────────
// Pašalinam kuruotą įrašą IR patiktuką (kitaip likes sąsaja vėl jį parodytų).
export async function removeFavorite(userId: string, kind: FavKind, entityId: number) {
  const sb = createAdminClient()
  await sb.from(TABLE[kind]).delete().eq('user_id', userId).eq(ID_COL[kind], entityId)
  const { data: prof } = await sb.from('profiles').select('username').eq('id', userId).maybeSingle() as { data: any }
  let dq = sb.from('likes').delete().eq('entity_type', kind).eq('entity_id', entityId)
  dq = prof?.username ? dq.or(`user_id.eq.${userId},user_username.ilike.${prof.username}`) : dq.eq('user_id', userId)
  await dq
  return { ok: true }
}

// ── REORDER — bulk upsert sort_order (įrašai gali būti tik „liked", be kuruoto
// įrašo, todėl upsert, ne update). onConflict atnaujina tik sort_order, palieka
// is_featured/weight/note.
export async function reorderFavorites(userId: string, kind: FavKind, orderedIds: number[]) {
  const sb = createAdminClient()
  const idCol = ID_COL[kind]
  const rows = orderedIds.map((id, idx) => ({ user_id: userId, [idCol]: id, sort_order: idx }))
  if (!rows.length) return { ok: true }
  const { error } = await sb.from(TABLE[kind]).upsert(rows, { onConflict: `user_id,${idCol}` })
  if (error) throw error
  return { ok: true }
}

// ── PATCH — is_featured / weight / note (upsert, nes gali nebūti kuruoto įrašo)
export async function patchFavorite(
  userId: string, kind: FavKind, entityId: number,
  patch: { is_featured?: boolean; weight?: number; note?: string | null },
) {
  const sb = createAdminClient()
  const updates: Record<string, any> = {}
  if (patch.is_featured !== undefined) updates.is_featured = !!patch.is_featured
  if (patch.weight !== undefined) updates.weight = Math.max(0, Math.min(100, Math.round(patch.weight)))
  if (patch.note !== undefined) updates.note = patch.note ? String(patch.note).slice(0, 280) : null
  if (Object.keys(updates).length === 0) return { ok: true }
  const idCol = ID_COL[kind]
  const { error } = await sb
    .from(TABLE[kind]).upsert({ user_id: userId, [idCol]: entityId, ...updates }, { onConflict: `user_id,${idCol}` })
  if (error) throw error
  return { ok: true }
}

// ── MOOD SONGS ─────────────────────────────────────────────────────────────
export async function addMoodSong(userId: string, trackId: number, label?: string, makeActive = false) {
  const sb = createAdminClient()
  const { data: maxRow } = await sb
    .from('profile_mood_songs').select('sort_order')
    .eq('user_id', userId).order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const nextOrder = ((maxRow as any)?.sort_order ?? -1) + 1
  const { error } = await sb
    .from('profile_mood_songs')
    .upsert({ user_id: userId, track_id: trackId, mood_label: label || null, sort_order: nextOrder },
            { onConflict: 'user_id,track_id', ignoreDuplicates: false })
  if (error) throw error
  if (makeActive) await setActiveMoodSong(userId, trackId)
  return { ok: true }
}

export async function removeMoodSong(userId: string, trackId: number) {
  const sb = createAdminClient()
  // Jei trinam aktyvią — išvalom profiles.mood_song_track_id
  const { data: row } = await sb.from('profile_mood_songs')
    .select('is_active').eq('user_id', userId).eq('track_id', trackId).maybeSingle()
  await sb.from('profile_mood_songs').delete().eq('user_id', userId).eq('track_id', trackId)
  if ((row as any)?.is_active) {
    await sb.rpc('resolve_active_mood_song', { p_user_id: userId, p_track_id: null })
  }
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
  await Promise.all(orderedIds.map((id, idx) =>
    sb.from('profile_mood_songs').update({ sort_order: idx }).eq('user_id', userId).eq('id', id)
  ))
  return { ok: true }
}

// ── STYLES ─────────────────────────────────────────────────────────────────
// Katalogas — distinct music.lt stiliai iš esamų profile_favorite_styles.
// Pakanka realaus pasirinkimo sąrašo be priklausomybės nuo genres/substyles
// taksonomijos neatitikimų.
export async function getStyleCatalog(): Promise<{ legacy_style_id: number; style_slug: string; style_name: string }[]> {
  const sb = createAdminClient()
  const { data } = await sb
    .from('profile_favorite_styles')
    .select('legacy_style_id, style_slug, style_name')
    .limit(5000)
  const seen = new Map<number, { legacy_style_id: number; style_slug: string; style_name: string }>()
  for (const r of (data || []) as any[]) {
    if (!seen.has(r.legacy_style_id)) {
      seen.set(r.legacy_style_id, { legacy_style_id: r.legacy_style_id, style_slug: r.style_slug, style_name: r.style_name })
    }
  }
  return [...seen.values()].sort((a, b) => a.style_name.localeCompare(b.style_name, 'lt'))
}

// Populiariausi stiliai (pagal narių pasirinkimų dažnumą) — onboarding chips.
export async function getPopularStyles(limit = 14): Promise<{ legacy_style_id: number; style_slug: string; style_name: string }[]> {
  const sb = createAdminClient()
  const { data } = await sb
    .from('profile_favorite_styles')
    .select('legacy_style_id, style_slug, style_name')
    .limit(8000)
  const counts = new Map<number, { meta: { legacy_style_id: number; style_slug: string; style_name: string }; n: number }>()
  for (const r of (data || []) as any[]) {
    const cur = counts.get(r.legacy_style_id)
    if (cur) cur.n++
    else counts.set(r.legacy_style_id, { meta: { legacy_style_id: r.legacy_style_id, style_slug: r.style_slug, style_name: r.style_name }, n: 1 })
  }
  return [...counts.values()].sort((a, b) => b.n - a.n).slice(0, limit).map(x => x.meta)
}

export async function addStyle(userId: string, style: { legacy_style_id: number; style_slug: string; style_name: string }) {
  const sb = createAdminClient()
  const { data: maxRow } = await sb
    .from('profile_favorite_styles').select('sort_order')
    .eq('profile_id', userId).order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const nextOrder = ((maxRow as any)?.sort_order ?? 0) + 1
  const { error } = await sb.from('profile_favorite_styles').upsert(
    { profile_id: userId, legacy_style_id: style.legacy_style_id, style_slug: style.style_slug, style_name: style.style_name, sort_order: nextOrder },
    { onConflict: 'profile_id,legacy_style_id', ignoreDuplicates: true },
  )
  if (error) throw error
  return { ok: true }
}

export async function removeStyle(userId: string, legacyStyleId: number) {
  const sb = createAdminClient()
  const { error } = await sb.from('profile_favorite_styles')
    .delete().eq('profile_id', userId).eq('legacy_style_id', legacyStyleId)
  if (error) throw error
  return { ok: true }
}

export async function reorderStyles(userId: string, orderedLegacyIds: number[]) {
  const sb = createAdminClient()
  await Promise.all(orderedLegacyIds.map((id, idx) =>
    sb.from('profile_favorite_styles').update({ sort_order: idx }).eq('profile_id', userId).eq('legacy_style_id', id)
  ))
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
// Populiariausi LT atlikėjai pagal score (be Rusijos), su pasirinktinai
// pradine stiliaus seed. Naudojama gamified susidėjimo flow.
export async function getArtistSuggestions(opts: { limit?: number; excludeIds?: number[]; genre?: string | null } = {}) {
  const sb = createAdminClient()
  const limit = opts.limit ?? 24
  const { data } = await sb.from('artists')
    .select('id, slug, name, cover_image_url, score, country')
    .not('cover_image_url', 'is', null)
    .order('score', { ascending: false, nullsFirst: false })
    .limit(limit + (opts.excludeIds?.length || 0) + 20)
  let rows = (data || []) as any[]
  // Filtruojam Rusiją + exclude + be score
  rows = rows.filter(r => r.country !== 'Rusija')
  if (opts.excludeIds?.length) {
    const ex = new Set(opts.excludeIds)
    rows = rows.filter(r => !ex.has(r.id))
  }
  return rows.slice(0, limit).map(r => ({ id: r.id, slug: r.slug, name: r.name, cover_image_url: r.cover_image_url }))
}
