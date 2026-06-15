// lib/mano-muzika.ts
// ───────────────────────────────────────────────────────────────────────────
// „Mano muzika" — nario kuruojamos mėgstamos muzikos data layer (pakopomis).
//
// Pakopos (bucket):
//   • Topas      (bucket=1, max 20)  — rodomas profilyje, rankinis rikiavimas
//   • Mėgstami   (bucket=2, max 100) — kuruotas rinkinys, rankinis rikiavimas
//   • Biblioteka (bucket=0)          — VISI patiktukai (likes), auto-sort/paieška
//
// „Biblioteka" = `likes` lentelė (user_id). Topas/Mėgstami = profile_favorite_*
// įrašai su bucket overlay (sort_order). Pridėjimas = patiktukas (likes), todėl
// importas/onboarding krenta į biblioteką, o iš ten keliama į pakopas.
// ───────────────────────────────────────────────────────────────────────────

import { createAdminClient } from '@/lib/supabase'

export type FavKind = 'artist' | 'album' | 'track'
export type Tier = 0 | 1 | 2 // 0=biblioteka, 1=Topas, 2=Mėgstami

export const TOP_CAP = 20
export const BUCKET_CAP = 100

export type MusicItem = {
  kind: FavKind
  id: number
  title: string
  subtitle: string
  cover: string | null
  href: string | null
  tier: Tier
  sort_order: number
}
export type KindCollection = { top: MusicItem[]; bucket: MusicItem[]; library: MusicItem[] }

export type MoodSong = {
  id: number
  track_id: number
  mood_label: string | null
  is_active: boolean
  sort_order: number
  track: { id: number; slug: string; title: string; cover_url: string | null; artist: { slug: string; name: string } | null } | null
}
export type FavStyle = { legacy_style_id: number; style_slug: string; style_name: string; sort_order: number }

export type MyMusic = {
  artist: KindCollection
  album: KindCollection
  track: KindCollection
  moodSongs: MoodSong[]
  styles: FavStyle[]
  counts: { artists: number; albums: number; tracks: number; moodSongs: number; styles: number; top: number }
  setup: { completed: boolean; skipped: boolean; completedAt: string | null }
}

const TABLE: Record<FavKind, string> = { artist: 'profile_favorite_artists', album: 'profile_favorite_albums', track: 'profile_favorite_tracks' }
const ID_COL: Record<FavKind, string> = { artist: 'artist_id', album: 'album_id', track: 'track_id' }

// Supabase embedded to-one ryšiai kartais grąžinami kaip masyvas — normalizuojam.
function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return (v[0] ?? null) as T | null
  return (v ?? null) as T | null
}

function hrefFor(kind: FavKind, slug: string, id: number): string {
  return kind === 'artist' ? `/atlikejai/${slug}` : kind === 'album' ? `/albumai/${slug}-${id}` : `/dainos/${slug}-${id}`
}

// ── Hidratuoja id → {title, subtitle, cover, slug} ─────────────────────────
async function hydrateItems(sb: any, kind: FavKind, ids: number[]): Promise<Map<number, { title: string; subtitle: string; cover: string | null; slug: string }>> {
  const m = new Map<number, { title: string; subtitle: string; cover: string | null; slug: string }>()
  if (!ids.length) return m
  const sel = kind === 'artist'
    ? 'id, slug, name, cover_image_url'
    : kind === 'album'
      ? 'id, slug, title, cover_image_url, artists:artist_id(name)'
      : 'id, slug, title, cover_url, artists:artist_id(name)'
  const table = kind === 'artist' ? 'artists' : kind === 'album' ? 'albums' : 'tracks'
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await sb.from(table).select(sel).in('id', ids.slice(i, i + 300))
    for (const r of (data || []) as any[]) {
      if (kind === 'artist') {
        m.set(r.id, { title: r.name, subtitle: 'Atlikėjas', cover: r.cover_image_url ?? null, slug: r.slug })
      } else {
        const artist = one<any>(r.artists)?.name || null
        m.set(r.id, { title: r.title, subtitle: artist || (kind === 'album' ? 'Albumas' : 'Daina'),
          cover: (kind === 'album' ? r.cover_image_url : r.cover_url) ?? null, slug: r.slug })
      }
    }
  }
  return m
}

// ── Surenka vienos rūšies kolekciją (top / bucket / library) ────────────────
async function collectKind(sb: any, kind: FavKind, userId: string): Promise<KindCollection> {
  const idCol = ID_COL[kind]
  const [curRes, likeRes] = await Promise.all([
    sb.from(TABLE[kind]).select(`${idCol}, bucket, sort_order`).eq('user_id', userId).in('bucket', [1, 2]),
    sb.from('likes').select('entity_id, created_at').eq('entity_type', kind).eq('user_id', userId).not('entity_id', 'is', null).limit(3000),
  ])
  const curated = new Map<number, { bucket: number; sort_order: number }>()
  for (const r of (curRes.data || []) as any[]) curated.set(r[idCol], { bucket: r.bucket, sort_order: r.sort_order ?? 0 })
  const likedAt = new Map<number, string>()
  for (const r of (likeRes.data || []) as any[]) {
    const id = r.entity_id; if (id == null) continue
    const p = likedAt.get(id); if (!p || (r.created_at && r.created_at > p)) likedAt.set(id, r.created_at || '')
  }

  const topIds = [...curated.entries()].filter(([, m]) => m.bucket === 1).sort((a, b) => a[1].sort_order - b[1].sort_order).map(e => e[0])
  const bucketIds = [...curated.entries()].filter(([, m]) => m.bucket === 2).sort((a, b) => a[1].sort_order - b[1].sort_order).map(e => e[0])
  const libraryIds = [...likedAt.entries()].filter(([id]) => !curated.has(id))
    .sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0)).map(e => e[0]).slice(0, 1500)

  const allIds = [...new Set([...topIds, ...bucketIds, ...libraryIds])]
  const hy = await hydrateItems(sb, kind, allIds)
  const mk = (id: number, tier: Tier, sort_order: number): MusicItem | null => {
    const h = hy.get(id); if (!h) return null
    return { kind, id, title: h.title, subtitle: h.subtitle, cover: h.cover, href: h.slug ? hrefFor(kind, h.slug, id) : null, tier, sort_order }
  }
  return {
    top: topIds.map((id, i) => mk(id, 1, i)).filter(Boolean) as MusicItem[],
    bucket: bucketIds.map((id, i) => mk(id, 2, i)).filter(Boolean) as MusicItem[],
    library: libraryIds.map((id, i) => mk(id, 0, i)).filter(Boolean) as MusicItem[],
  }
}

// ── READ: visa nario kolekcija ─────────────────────────────────────────────
export async function getMyMusic(userId: string): Promise<MyMusic> {
  const sb = createAdminClient()
  const { data: prof } = await sb.from('profiles')
    .select('username, music_setup_completed_at, music_setup_skipped').eq('id', userId).maybeSingle() as { data: any }
  const username: string | null = prof?.username || null

  // Susiejam senus „ghost" patiktukus su user_id (greita per indeksą, no-op po 1 k.)
  if (username) { try { await sb.rpc('link_user_likes', { p_user_id: userId, p_username: username }) } catch {} }

  const [artist, album, track, moodRes, styleRes] = await Promise.all([
    collectKind(sb, 'artist', userId),
    collectKind(sb, 'album', userId),
    collectKind(sb, 'track', userId),
    sb.from('profile_mood_songs')
      .select('id, track_id, mood_label, is_active, sort_order, tracks:track_id(id, slug, title, cover_url, artists:artist_id(slug, name))')
      .eq('user_id', userId).order('sort_order'),
    sb.from('profile_favorite_styles')
      .select('legacy_style_id, style_slug, style_name, sort_order').eq('profile_id', userId).order('sort_order'),
  ])

  const mapTrackLike = (rel: any) => {
    const t = one<any>(rel)
    return t ? { id: t.id, slug: t.slug, title: t.title, cover_url: t.cover_url, artist: one(t.artists) } : null
  }
  const moodSongs: MoodSong[] = (moodRes.data || []).map((r: any) => ({
    id: r.id, track_id: r.track_id, mood_label: r.mood_label || null,
    is_active: !!r.is_active, sort_order: r.sort_order, track: mapTrackLike(r.tracks),
  }))
  const styles: FavStyle[] = (styleRes.data || []) as FavStyle[]

  return {
    artist, album, track, moodSongs, styles,
    counts: {
      artists: artist.top.length + artist.bucket.length + artist.library.length,
      albums: album.top.length + album.bucket.length + album.library.length,
      tracks: track.top.length + track.bucket.length + track.library.length,
      moodSongs: moodSongs.length, styles: styles.length,
      top: artist.top.length + album.top.length + track.top.length,
    },
    setup: {
      completed: !!prof?.music_setup_completed_at,
      skipped: !!prof?.music_setup_skipped,
      completedAt: prof?.music_setup_completed_at || null,
    },
  }
}

// ── ADD į biblioteką = patiktukas (likes). Idempotentiška. ─────────────────
export async function addToLibrary(userId: string, kind: FavKind, ids: number[]) {
  if (!ids.length) return { ok: true }
  const sb = createAdminClient()
  const { data: prof } = await sb.from('profiles').select('username').eq('id', userId).maybeSingle() as { data: any }
  const username = prof?.username || `user_${userId.slice(0, 8)}`
  const rows = ids.map(id => ({ entity_type: kind, entity_id: id, user_id: userId, user_username: username, source: 'auth' }))
  const { error } = await sb.from('likes').upsert(rows, { onConflict: 'entity_type,entity_id,user_username', ignoreDuplicates: true })
  if (error) throw error
  return { ok: true }
}
export async function addFavorite(userId: string, kind: FavKind, entityId: number) {
  return addToLibrary(userId, kind, [entityId])
}

// ── UNLIKE — visiškai pašalina (kuruotą įrašą + patiktuką) ─────────────────
export async function removeFavorite(userId: string, kind: FavKind, entityId: number) {
  const sb = createAdminClient()
  await sb.from(TABLE[kind]).delete().eq('user_id', userId).eq(ID_COL[kind], entityId)
  const { data: prof } = await sb.from('profiles').select('username').eq('id', userId).maybeSingle() as { data: any }
  let dq = sb.from('likes').delete().eq('entity_type', kind).eq('entity_id', entityId)
  dq = prof?.username ? dq.or(`user_id.eq.${userId},user_username.ilike.${prof.username}`) : dq.eq('user_id', userId)
  await dq
  return { ok: true }
}

// ── MOVE į pakopą (Topas/Mėgstami) su limitu ───────────────────────────────
export async function moveToTier(userId: string, kind: FavKind, entityId: number, tier: 1 | 2) {
  const sb = createAdminClient()
  const idCol = ID_COL[kind]
  const cap = tier === 1 ? TOP_CAP : BUCKET_CAP
  const { data: existing } = await sb.from(TABLE[kind]).select('bucket').eq('user_id', userId).eq(idCol, entityId).maybeSingle() as { data: any }
  if (!existing || existing.bucket !== tier) {
    const { count } = await sb.from(TABLE[kind]).select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('bucket', tier)
    if ((count || 0) >= cap) throw new Error(tier === 1 ? `Topas pilnas (maks. ${TOP_CAP})` : `„Mėgstami" pilnas (maks. ${BUCKET_CAP})`)
  }
  await addToLibrary(userId, kind, [entityId]) // užtikrinam, kad yra ir bibliotekoje
  const { data: maxRow } = await sb.from(TABLE[kind]).select('sort_order').eq('user_id', userId).eq('bucket', tier)
    .order('sort_order', { ascending: false }).limit(1).maybeSingle() as { data: any }
  const nextOrder = ((maxRow?.sort_order) ?? -1) + 1
  const { error } = await sb.from(TABLE[kind]).upsert(
    { user_id: userId, [idCol]: entityId, bucket: tier, sort_order: nextOrder, is_featured: tier === 1 },
    { onConflict: `user_id,${idCol}` })
  if (error) throw error
  return { ok: true }
}

// ── REMOVE iš pakopos → grįžta į biblioteką (lieka patiktuku) ──────────────
export async function removeFromTier(userId: string, kind: FavKind, entityId: number) {
  const sb = createAdminClient()
  const { error } = await sb.from(TABLE[kind]).delete().eq('user_id', userId).eq(ID_COL[kind], entityId)
  if (error) throw error
  return { ok: true }
}

// ── REORDER pakopoje (drag / „šokti į vietą") — bulk upsert ────────────────
export async function reorderTier(userId: string, kind: FavKind, tier: 1 | 2, orderedIds: number[]) {
  const sb = createAdminClient()
  const idCol = ID_COL[kind]
  const rows = orderedIds.map((id, idx) => ({ user_id: userId, [idCol]: id, sort_order: idx, bucket: tier }))
  if (!rows.length) return { ok: true }
  const { error } = await sb.from(TABLE[kind]).upsert(rows, { onConflict: `user_id,${idCol}` })
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
export async function getArtistSuggestions(opts: { limit?: number; excludeIds?: number[]; genre?: string | null } = {}) {
  const sb = createAdminClient()
  const limit = opts.limit ?? 24
  const { data } = await sb.from('artists')
    .select('id, slug, name, cover_image_url, score, country')
    .not('cover_image_url', 'is', null)
    .order('score', { ascending: false, nullsFirst: false })
    .limit(limit + (opts.excludeIds?.length || 0) + 20)
  let rows = (data || []) as any[]
  rows = rows.filter(r => r.country !== 'Rusija')
  if (opts.excludeIds?.length) {
    const ex = new Set(opts.excludeIds)
    rows = rows.filter(r => !ex.has(r.id))
  }
  return rows.slice(0, limit).map(r => ({ id: r.id, slug: r.slug, name: r.name, cover_image_url: r.cover_image_url }))
}
