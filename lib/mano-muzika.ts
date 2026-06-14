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

  const [artRes, albRes, trkRes, moodRes, styleRes, profRes] = await Promise.all([
    sb.from('profile_favorite_artists')
      .select('artist_id, sort_order, is_featured, weight, note, artists:artist_id(id, slug, name, cover_image_url)')
      .eq('user_id', userId).order('sort_order'),
    sb.from('profile_favorite_albums')
      .select('album_id, sort_order, is_featured, weight, note, albums:album_id(id, slug, title, cover_url, artists:artist_id(slug, name))')
      .eq('user_id', userId).order('sort_order'),
    sb.from('profile_favorite_tracks')
      .select('track_id, sort_order, is_featured, weight, note, tracks:track_id(id, slug, title, cover_url, artists:artist_id(slug, name))')
      .eq('user_id', userId).order('sort_order'),
    sb.from('profile_mood_songs')
      .select('id, track_id, mood_label, is_active, sort_order, tracks:track_id(id, slug, title, cover_url, artists:artist_id(slug, name))')
      .eq('user_id', userId).order('sort_order'),
    sb.from('profile_favorite_styles')
      .select('legacy_style_id, style_slug, style_name, sort_order')
      .eq('profile_id', userId).order('sort_order'),
    sb.from('profiles')
      .select('music_setup_completed_at, music_setup_skipped')
      .eq('id', userId).maybeSingle(),
  ])

  const artists: FavArtist[] = (artRes.data || []).map((r: any) => ({
    artist_id: r.artist_id, sort_order: r.sort_order, is_featured: !!r.is_featured,
    weight: r.weight || 0, note: r.note || null, artist: one(r.artists),
  }))
  const mapTrackLike = (rel: any) => {
    const t = one<any>(rel)
    return t ? { id: t.id, slug: t.slug, title: t.title, cover_url: t.cover_url, artist: one(t.artists) } : null
  }
  const albums: FavAlbum[] = (albRes.data || []).map((r: any) => {
    const al = one<any>(r.albums)
    return {
      album_id: r.album_id, sort_order: r.sort_order, is_featured: !!r.is_featured,
      weight: r.weight || 0, note: r.note || null,
      album: al ? { id: al.id, slug: al.slug, title: al.title, cover_url: al.cover_url, artist: one(al.artists) } : null,
    }
  })
  const tracks: FavTrack[] = (trkRes.data || []).map((r: any) => ({
    track_id: r.track_id, sort_order: r.sort_order, is_featured: !!r.is_featured,
    weight: r.weight || 0, note: r.note || null, track: mapTrackLike(r.tracks),
  }))
  const moodSongs: MoodSong[] = (moodRes.data || []).map((r: any) => ({
    id: r.id, track_id: r.track_id, mood_label: r.mood_label || null,
    is_active: !!r.is_active, sort_order: r.sort_order, track: mapTrackLike(r.tracks),
  }))
  const styles: FavStyle[] = (styleRes.data || []) as FavStyle[]
  const prof: any = profRes.data || {}

  return {
    artists, albums, tracks, moodSongs, styles,
    counts: {
      artists: artists.length, albums: albums.length, tracks: tracks.length,
      moodSongs: moodSongs.length, styles: styles.length,
    },
    setup: {
      completed: !!prof.music_setup_completed_at,
      skipped: !!prof.music_setup_skipped,
      completedAt: prof.music_setup_completed_at || null,
    },
  }
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
export async function removeFavorite(userId: string, kind: FavKind, entityId: number) {
  const sb = createAdminClient()
  const { error } = await sb
    .from(TABLE[kind]).delete()
    .eq('user_id', userId).eq(ID_COL[kind], entityId)
  if (error) throw error
  return { ok: true }
}

// ── REORDER — perrašom sort_order pagal pateiktą ID seką ────────────────────
export async function reorderFavorites(userId: string, kind: FavKind, orderedIds: number[]) {
  const sb = createAdminClient()
  const table = TABLE[kind]
  const idCol = ID_COL[kind]
  // Atskiri update'ai (Supabase neturi bulk-by-key). Sekos trumpos (≤ ~100).
  await Promise.all(orderedIds.map((id, idx) =>
    sb.from(table).update({ sort_order: idx }).eq('user_id', userId).eq(idCol, id)
  ))
  return { ok: true }
}

// ── PATCH — is_featured / weight / note ────────────────────────────────────
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
  const { error } = await sb
    .from(TABLE[kind]).update(updates)
    .eq('user_id', userId).eq(ID_COL[kind], entityId)
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
