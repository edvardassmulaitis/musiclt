// lib/supabase-blog.ts
import { createAdminClient } from './supabase'

// ── PROFILES ────────────────────────────────────────────────
const PROFILE_SELECT = `
  id, email, full_name, username, avatar_url, bio, website,
  social_twitter, social_spotify, social_youtube, social_tiktok,
  is_public, is_claimed, provider, cover_image_url, created_at,
  legacy_user_id, joined_legacy_at, legacy_karma_points, is_vip_legacy,
  legacy_age, legacy_city, mood_song_track_id, mood_song_set_at,
  last_seen_legacy_at, legacy_birth_date, legacy_occupation,
  legacy_favorite_books, legacy_signature, legacy_login_count,
  legacy_message_count, legacy_avg_message_len, legacy_vote_avg_track,
  legacy_vote_avg_album, legacy_vote_avg_artist,
  legacy_liked_artist_count, legacy_liked_album_count,
  legacy_liked_track_count, legacy_music_meter,
  legacy_profile_photos, legacy_favorite_films
`

/** Try EXACT match first (faster, uses index); fallback to ilike. Defensive
 * dėl LT raidžių URL'uose — kai kuriose Next.js / Vercel kelyje
 * `params.username` ateina percent-encoded (Ruton%C4%97 vietoj Rutonė) ir
 * vienas ilike match'as neranda. Bandom abi formas. */
export async function getProfileByUsername(username: string) {
  const sb = createAdminClient()

  // 1) Bandymas: decode (jei URL-encoded → tampa Rutonė)
  let decoded = username
  try {
    decoded = decodeURIComponent(username)
  } catch {
    // Neteisingai-formated %XX — palik original
  }

  const tries: string[] = []
  if (decoded) tries.push(decoded)
  if (username !== decoded) tries.push(username)

  for (const candidate of tries) {
    // .maybeSingle() vietoj .single() — kad neerror'intų jei 0 row
    const { data, error } = await sb
      .from('profiles')
      .select(PROFILE_SELECT)
      .ilike('username', candidate)
      .maybeSingle()
    if (error) {
      console.error('[getProfileByUsername]', candidate, error.message)
      continue
    }
    if (data) return data
  }
  return null
}

// ── FAVORITE STYLES (music.lt /lt/stilius/<slug>/<id>/) ──────
export async function getProfileFavoriteStyles(profileId: string) {
  const sb = createAdminClient()
  const { data } = await sb
    .from('profile_favorite_styles')
    .select('legacy_style_id, style_slug, style_name, sort_order')
    .eq('profile_id', profileId)
    .order('sort_order')
  return (data || []) as any[]
}

// ── FRIENDS LIST (user_friendships) ──────────────────────────
// SUPABASE — du FK į profiles (profile_id + friend_id), todėl reikia
// explicit FK hint per !user_friendships_friend_id_fkey arba dvi užklausos.
// Pasirinkom dvi užklausas — paprastesnis schema invarianto požiūriu.
export async function getProfileFriends(profileId: string, limit = 30) {
  const sb = createAdminClient()
  const { data: links } = await sb
    .from('user_friendships')
    .select('friend_id')
    .eq('profile_id', profileId)
    .limit(limit)
  const friendIds = (links || []).map((r: any) => r.friend_id).filter(Boolean)
  if (!friendIds.length) return []
  const { data: profiles } = await sb
    .from('profiles')
    .select('id, username, full_name, avatar_url, is_vip_legacy')
    .in('id', friendIds)
  return (profiles || []) as any[]
}

// ── DAILY SONG PICKS ─────────────────────────────────────────
// Dvi atskiros užklausos: pirma — picks (visi, įskaitant NULL track_id),
// antra — enrich'inam tik tuos, kuriems track_id žinomas. Supabase nested
// join'as su NULL FK kartais grąžina iš dalies sulaužytus rezultatus, todėl
// einame saugiu keliu.
export async function getDailySongPicks(userId: string, limit = 20) {
  const sb = createAdminClient()
  // V12 (2026-06-02): showcase row'ui pirmenybę teikiam RESOLVED pick'ams
  // (track_id != null → kortelė turi viršelį/YT thumb), nes nauji pick'ai
  // dažnai dar nemigruoti (track_id NULL) ir row atrodydavo tuščias/sugriuvęs.
  // Resolved užpildom pirma, likusią vietą — naujausiais pending'ais.
  const [{ data: resolved }, { data: anyPicks }] = await Promise.all([
    sb.from('daily_song_picks')
      .select('id, picked_on, comment, like_count, legacy_track_id, track_id')
      .eq('author_id', userId).not('track_id', 'is', null)
      .order('picked_on', { ascending: false }).limit(limit),
    sb.from('daily_song_picks')
      .select('id, picked_on, comment, like_count, legacy_track_id, track_id')
      .eq('author_id', userId)
      .order('picked_on', { ascending: false }).limit(limit),
  ])
  const seen = new Set<any>()
  const rows: any[] = []
  for (const r of [...((resolved || []) as any[]), ...((anyPicks || []) as any[])]) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    rows.push(r)
    if (rows.length >= limit) break
  }
  if (!rows.length) return rows
  const trackIds = rows.map((r) => r.track_id).filter(Boolean) as number[]
  if (!trackIds.length) return rows.map((r) => ({ ...r, tracks: null }))
  // V11.7: pridėti `video_url` + `cover_url` daily picks kortelėms
  // (YT thumb fallback chain).
  const { data: tracks } = await sb
    .from('tracks')
    .select('id, slug, title, video_url, cover_url, artist_id, artists:artist_id(id, slug, name, cover_image_url)')
    .in('id', trackIds)
  const trackRows = (tracks || []) as any[]

  // Atskira užklausa main genres'ams pagal artist_id — leidžia filter'ą
  // ant equalizer click'o (daily pick rodomas tik jei jo atlikėjo main genre
  // sutampa su pasirinkta kategorija).
  const artistIds = Array.from(new Set(trackRows.map((t: any) => t.artist_id).filter(Boolean)))
  const genreByArtist = new Map<number, { id: number; name: string }[]>()
  if (artistIds.length) {
    const { data: artistGenres } = await sb
      .from('artist_genres')
      .select('artist_id, genres:genre_id(id, name, parent_id)')
      .in('artist_id', artistIds)
    for (const row of (artistGenres || []) as any[]) {
      const g = row.genres
      if (!g || g.parent_id !== null) continue   // tik main genres
      const arr = genreByArtist.get(row.artist_id) || []
      arr.push({ id: g.id, name: g.name })
      genreByArtist.set(row.artist_id, arr)
    }
  }
  const enrichedTracks = trackRows.map((t: any) => ({
    ...t,
    artistMainGenres: genreByArtist.get(t.artist_id) || [],
  }))
  const trackMap = new Map(enrichedTracks.map((t: any) => [t.id, t]))

  // V18n: pažymim pick'us, kurių daina TĄ dieną tapo dienos dainos LAIMĖTOJA
  // (daily_song_winners date+track_id sutapimas) → kortelėje #1 badge'as.
  const winSet = new Set<string>()
  const dates = Array.from(new Set(rows.map((r) => r.picked_on).filter(Boolean)))
  if (dates.length) {
    const { data: wins } = await sb
      .from('daily_song_winners')
      .select('date, track_id')
      .in('date', dates)
      .in('track_id', trackIds)
    for (const w of (wins || []) as any[]) winSet.add(`${w.date}|${w.track_id}`)
  }

  return rows.map((r) => ({
    ...r,
    is_winner: !!r.track_id && winSet.has(`${r.picked_on}|${r.track_id}`),
    tracks: r.track_id ? trackMap.get(r.track_id) || null : null,
  }))
}

export async function getDailySongPicksCount(userId: string): Promise<number> {
  const sb = createAdminClient()
  const { count } = await sb
    .from('daily_song_picks')
    .select('*', { count: 'exact', head: true })
    .eq('author_id', userId)
  return count || 0
}

// ── USER CONTENT STATS ───────────────────────────────────────
export async function getUserContentStats(userId: string) {
  const sb = createAdminClient()
  const [diaryRes, translateRes, creationRes, dailyRes, commentsRes] = await Promise.all([
    sb.from('blog_posts').select('*', { count: 'exact', head: true })
      .eq('user_id', userId).eq('legacy_source', 'diary'),
    sb.from('blog_posts').select('*', { count: 'exact', head: true })
      .eq('user_id', userId).eq('legacy_source', 'translate'),
    sb.from('blog_posts').select('*', { count: 'exact', head: true })
      .eq('user_id', userId).eq('legacy_source', 'creation'),
    sb.from('daily_song_picks').select('*', { count: 'exact', head: true })
      .eq('author_id', userId),
    (async () => {
      const { data: posts } = await sb
        .from('blog_posts').select('id').eq('user_id', userId)
      const ids = (posts || []).map((p: any) => p.id)
      if (!ids.length) return { count: 0 }
      const { count } = await sb
        .from('comments').select('*', { count: 'exact', head: true })
        .in('blog_post_id', ids)
      return { count: count || 0 }
    })(),
  ])
  return {
    diary: diaryRes.count || 0,
    translate: translateRes.count || 0,
    creation: creationRes.count || 0,
    daily_picks: dailyRes.count || 0,
    comments_received: commentsRes.count || 0,
  }
}

// ── MOOD SONG ─────────────────────────────────────────────────
export async function getMoodSongTrack(trackId: number | null) {
  if (!trackId) return null
  const sb = createAdminClient()
  // 2026-05-25: minimalus saugus select'as (atitinka getProfileFavoriteTracks
  // pattern'ą, kuris veikia produkcijoje). Ankstesnės versijos su
  // release_year/lyrics/like_count atskirais ar foreign embed'ais kartais
  // grąžindavo data=null + tylą — Vercel build'as bandydavo užkrauti track'ą,
  // bet PostgREST 406-ino kaip dvigubai ambiguous'inį FK. maybeSingle + tik
  // bazinės kolonos = idempotent.
  const { data, error } = await sb
    .from('tracks')
    .select('id, slug, title, video_url, cover_url, release_year, artist_id, artists:artist_id(id, slug, name, cover_image_url)')
    .eq('id', trackId)
    .maybeSingle()
  if (error) {
    console.warn('[getMoodSongTrack] supabase error:', error.message)
    // Fallback: bandom siaurą fetch'ą, gal kažkurioje aplinkoje pilno join'o RLS blokuoja
    const { data: minimal } = await sb
      .from('tracks')
      .select('id, slug, title, video_url, cover_url, artist_id')
      .eq('id', trackId)
      .maybeSingle()
    if (!minimal) return null
    const { data: artist } = await sb
      .from('artists')
      .select('id, slug, name, cover_image_url')
      .eq('id', (minimal as any).artist_id)
      .maybeSingle()
    return { ...minimal, artists: artist } as any
  }
  return data as any
}

// ── USER RECENT COMMENTS ─────────────────────────────────────
// Paskutiniai užmesti komentarai per visus entity tipus — naudojam
// /vartotojas/[username] "Diskusijos" activity log sekcijai.
export async function getUserRecentComments(username: string, limit = 12) {
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('entity_comments')
    .select('id, entity_type, entity_id, entity_legacy_id, content_text, content_html, created_at, like_count')
    .ilike('author_username', username)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    console.warn('[getUserRecentComments]', error.message)
    return []
  }
  const comments = (data || []) as any[]
  if (comments.length === 0) return []

  // Užtikrinim resolved entity'es: track/album/artist/blog_post → fetch'in
  // pavadinimą ir slug'ą + susijusio atlikėjo info link'ams kurti.
  const trackIds = comments.filter(c => c.entity_type === 'track' && c.entity_id).map(c => c.entity_id)
  const albumIds = comments.filter(c => c.entity_type === 'album' && c.entity_id).map(c => c.entity_id)
  const artistIds = comments.filter(c => c.entity_type === 'artist' && c.entity_id).map(c => c.entity_id)
  const blogIds = comments.filter(c => c.entity_type === 'blog_post' && c.entity_id).map(c => c.entity_id)

  const [tracksRes, albumsRes, artistsRes, blogsRes] = await Promise.all([
    trackIds.length ? sb.from('tracks').select('id, slug, title, cover_url, artist_id, artists:artist_id(slug, name)').in('id', trackIds) : Promise.resolve({ data: [] as any[] }),
    albumIds.length ? sb.from('albums').select('id, slug, title, cover_url, artist_id, artists:artist_id(slug, name)').in('id', albumIds) : Promise.resolve({ data: [] as any[] }),
    artistIds.length ? sb.from('artists').select('id, slug, name, cover_image_url').in('id', artistIds) : Promise.resolve({ data: [] as any[] }),
    blogIds.length ? sb.from('blog_posts').select('id, slug, title, cover_image_url, post_type, blog_id, blogs:blog_id(slug)').in('id', blogIds) : Promise.resolve({ data: [] as any[] }),
  ])

  const tMap = new Map((tracksRes.data || []).map((x: any) => [x.id, x]))
  const aMap = new Map((albumsRes.data || []).map((x: any) => [x.id, x]))
  const arMap = new Map((artistsRes.data || []).map((x: any) => [x.id, x]))
  const bMap = new Map((blogsRes.data || []).map((x: any) => [x.id, x]))

  return comments.map(c => ({
    ...c,
    track: c.entity_type === 'track' ? tMap.get(c.entity_id) || null : null,
    album: c.entity_type === 'album' ? aMap.get(c.entity_id) || null : null,
    artist: c.entity_type === 'artist' ? arMap.get(c.entity_id) || null : null,
    blog_post: c.entity_type === 'blog_post' ? bMap.get(c.entity_id) || null : null,
  }))
}

// ── TRANSLATIONS BY USER ─────────────────────────────────────
export async function getUserTranslations(userId: string, limit = 20) {
  const sb = createAdminClient()
  const { data } = await sb
    .from('blog_posts')
    .select(`
      id, slug, title, summary, published_at, like_count, comment_count,
      target_artist_id, target_track_id,
      target_artist:target_artist_id(id, slug, name),
      target_track:target_track_id(id, slug, title),
      blogs:blog_id(slug)
    `)
    .eq('user_id', userId)
    .eq('legacy_source', 'translate')
    .order('published_at', { ascending: false })
    .limit(limit)
  return (data || []) as any[]
}

export async function getProfileById(id: string) {
  const sb = createAdminClient()
  const { data } = await sb.from('profiles').select('*').eq('id', id).single()
  return data
}

export async function updateProfile(id: string, updates: Record<string, any>) {
  const sb = createAdminClient()
  const { error } = await sb.from('profiles').update(updates).eq('id', id)
  if (error) throw error
}

export async function isUsernameTaken(username: string, excludeUserId?: string) {
  const sb = createAdminClient()
  let q = sb.from('profiles').select('id', { count: 'exact', head: true }).eq('username', username)
  if (excludeUserId) q = q.neq('id', excludeUserId)
  const { count } = await q
  return (count || 0) > 0
}

// ── FAVORITE ARTISTS ────────────────────────────────────────
// Praplėsta su main genre info — leidžia filtruoti pagal broad stylių
// equalizer'io click'us (Rokas → favorite rock artists etc).
export async function getProfileFavoriteArtists(userId: string) {
  const sb = createAdminClient()
  // V18 (mano-muzika): rodom „Mėgstami" rikiuojamą sąrašą (bucket=1) ta pačia
  // tvarka kaip /mano-muzika; pirmi rodomi kaip top.
  const { data } = await sb
    .from('profile_favorite_artists')
    .select('artist_id, sort_order, artists:artist_id(id, slug, name, cover_image_url)')
    .eq('user_id', userId)
    .eq('bucket', 1)
    .order('sort_order')
  const artists = (data || []).map((r: any) => r.artists).filter(Boolean) as any[]
  if (!artists.length) return artists

  // V10: pridedame artist_substyles (legacy_style_id list) — naudojama
  // profile substyle chip click → filtravimui. Egzistuoja artist_substyles
  // junction (artist_id + legacy_style_id).

  // Atskira užklausa main genres'ams (be parent_id) per artist_genres N:M.
  const artistIds = artists.map((a) => a.id)
  const { data: artistGenres } = await sb
    .from('artist_genres')
    .select('artist_id, genres:genre_id(id, name, parent_id)')
    .in('artist_id', artistIds)
  const genreMap = new Map<number, { id: number; name: string }[]>()
  for (const row of (artistGenres || []) as any[]) {
    const g = row.genres
    if (!g || g.parent_id !== null) continue   // tik main genres (be parent)
    const arr = genreMap.get(row.artist_id) || []
    arr.push({ id: g.id, name: g.name })
    genreMap.set(row.artist_id, arr)
  }
  // Substyles fetch — graceful fallback'as, jei artist_substyles lentelės nėra
  // arba schema kitokia.
  let substylesByArtist = new Map<number, number[]>()
  try {
    const { data: substyleRows } = await sb
      .from('artist_substyles')
      .select('artist_id, legacy_style_id')
      .in('artist_id', artistIds)
    for (const row of (substyleRows || []) as any[]) {
      const arr = substylesByArtist.get(row.artist_id) || []
      arr.push(row.legacy_style_id)
      substylesByArtist.set(row.artist_id, arr)
    }
  } catch {
    // ignore — substyles optional
  }

  return artists.map((a) => ({
    ...a,
    mainGenres: genreMap.get(a.id) || [],
    substyleIds: substylesByArtist.get(a.id) || [],
  }))
}

// ── FAVORITE ALBUMS / TRACKS (per `likes` lentelė, music.lt ♥) ────
//
// `likes` lentelė saugo VISUS music.lt palaikymus. Pending eilutės
// (entity_id IS NULL) yra placeholder'iai — entity dar nemigruotas, todėl
// UI ne'rodom. Po atlikėjo importo `resolve_pending_likes` RPC set'ina
// entity_id, ir UI automatiškai pasirodo.
//
// Order'is — pagal `created_at DESC` (most recently liked first), BIGSERIAL
// id tikriausiai preserves'ina insert order'į.
// PERF (2026-06-02): anksčiau .ilike('user_username', …) ant 735k-row / 221MB
// likes lentelės darydavo seq-scan'ą (case-insensitive ILIKE nenaudoja btree
// indekso) → ~41ms favorites + ~366ms × 6 counts per page load. Dabar per
// `profile_favorite_like_ids` / `profile_likes_counts` RPC'us, kurie remiasi
// funkciniu indeksu `idx_likes_uname_lower (lower(user_username), entity_type,
// id DESC)`. Favorites ids → <1ms, counts → ~15ms. Case-insensitivity
// išlaikoma per lower() RPC viduje (legacy CamelCase „Einaras13" vs lowercase).
async function getProfileFavoriteEntities(
  username: string,
  type: 'album' | 'track',
  limit: number,
) {
  const sb = createAdminClient()
  const { data: idRows, error: idErr } = await sb.rpc('profile_favorite_like_ids', {
    p_username: username,
    p_type: type,
    p_limit: limit,
  })
  if (idErr) {
    console.warn(`[getProfileFavorite:${type}] rpc`, idErr.message)
    return { ids: [] as number[], likedAt: new Map<number, string>() }
  }
  const rows = (idRows || []) as { entity_id: number; created_at: string }[]
  const ids = rows.map((r) => Number(r.entity_id)).filter(Boolean)
  const likedAt = new Map(rows.map((r) => [Number(r.entity_id), r.created_at]))
  return { ids, likedAt }
}

// Rikiuoti („Mėgstami", bucket=1) album/track id iš /mano-muzika — kad profilis
// rodytų tą pačią kuruotą tvarką, o tada papildytų patiktukais.
async function rankedProfileIds(sb: any, kind: 'album' | 'track', userId: string, limit: number): Promise<number[]> {
  const table = kind === 'album' ? 'profile_favorite_albums' : 'profile_favorite_tracks'
  const idCol = kind === 'album' ? 'album_id' : 'track_id'
  const { data } = await sb.from(table).select(idCol).eq('user_id', userId).eq('bucket', 1).order('sort_order').limit(limit)
  return (data || []).map((r: any) => r[idCol]).filter(Boolean)
}

// Kurie iš `ids` yra IMPORTUOTI patiktukai (entity_legacy_id iš senos sistemos),
// o ne realiai paspausti naujoje. Naudojama feed'ui — rodom tik tikrus naujus.
async function importedIdSet(sb: any, kind: 'album' | 'track', userId: string | undefined, ids: number[]): Promise<Set<number>> {
  if (!userId || !ids.length) return new Set()
  const { data } = await sb.from('likes').select('entity_id')
    .eq('user_id', userId).eq('entity_type', kind).not('entity_legacy_id', 'is', null).in('entity_id', ids)
  return new Set((data || []).map((r: any) => r.entity_id))
}

// Rikiavimas: rikiuoti („Mėgstami", bucket=1) pirma jų tvarka; tada patiktukai
// pagal music.lt populiarumą (score) DESC — kol narys nesusidėjo savo tvarkos,
// rodom populiariausius pirma (ne pagal datą).
function favSort(rankIdx: Map<number, number>) {
  return (x: any, y: any) => {
    const rx = rankIdx.has(x.id), ry = rankIdx.has(y.id)
    if (rx && ry) return (rankIdx.get(x.id)! - rankIdx.get(y.id)!)
    if (rx) return -1
    if (ry) return 1
    return (Number(y.score || 0) - Number(x.score || 0))
  }
}

export async function getProfileFavoriteAlbums(username: string, limit = 12, userId?: string) {
  const sb = createAdminClient()
  const pool = Math.max(limit * 4, 240)
  const rankedIds = userId ? await rankedProfileIds(sb, 'album', userId, limit) : []
  const { ids: likedIds, likedAt } = await getProfileFavoriteEntities(username, 'album', pool)
  const ids = [...new Set([...rankedIds, ...likedIds])]
  if (!ids.length) return []
  const { data } = await sb
    .from('albums')
    .select('id, slug, title, cover_url:cover_image_url, score, artist_id, artists:artist_id(id, slug, name, cover_image_url)')
    .in('id', ids)
  const rankIdx = new Map(rankedIds.map((id, i) => [id, i]))
  const imported = await importedIdSet(sb, 'album', userId, ids)
  return (data || [])
    .map((a: any) => ({ ...a, liked_at: likedAt.get(a.id) ?? null, is_imported: imported.has(a.id) }))
    .sort(favSort(rankIdx))
    .slice(0, limit) as any[]
}

export async function getProfileFavoriteTracks(username: string, limit = 12, userId?: string) {
  const sb = createAdminClient()
  const pool = Math.max(limit * 4, 240)
  const rankedIds = userId ? await rankedProfileIds(sb, 'track', userId, limit) : []
  const { ids: likedIds, likedAt } = await getProfileFavoriteEntities(username, 'track', pool)
  const ids = [...new Set([...rankedIds, ...likedIds])]
  if (!ids.length) return []
  const { data } = await sb
    .from('tracks')
    .select('id, slug, title, cover_url, video_url, score, artist_id, artists:artist_id(id, slug, name, cover_image_url)')
    .in('id', ids)
  const rankIdx = new Map(rankedIds.map((id, i) => [id, i]))
  const imported = await importedIdSet(sb, 'track', userId, ids)
  return (data || [])
    .map((t: any) => ({ ...t, liked_at: likedAt.get(t.id) ?? null, is_imported: imported.has(t.id) }))
    .sort(favSort(rankIdx))
    .slice(0, limit) as any[]
}

// Pending count'ai — kiek dar nemigravotų likes (UI gali rodyti „dar X laukia").
// Vienas grupuotas RPC vietoj 6 atskirų ILIKE COUNT seq-scan'ų. Case-insensitive
// per lower() RPC viduje (legacy „Einaras13" vs lowercase profile.username).
export async function getProfileLikesCounts(username: string) {
  const sb = createAdminClient()
  const base: Record<'artist' | 'album' | 'track', { resolved: number; pending: number }> = {
    artist: { resolved: 0, pending: 0 },
    album: { resolved: 0, pending: 0 },
    track: { resolved: 0, pending: 0 },
  }
  const { data, error } = await sb.rpc('profile_likes_counts', { p_username: username })
  if (error) {
    console.warn('[getProfileLikesCounts] rpc', error.message)
    return base
  }
  for (const r of (data || []) as any[]) {
    const kind = r.entity_type as 'artist' | 'album' | 'track'
    if (base[kind]) base[kind] = { resolved: Number(r.resolved) || 0, pending: Number(r.pending) || 0 }
  }
  return base
}

// ── BLOGS ───────────────────────────────────────────────────
export async function getBlogBySlug(slug: string) {
  const sb = createAdminClient()
  // Bandymas su URL-decoded forma (jei kelias percent-encoded LT raidėms)
  let decoded = slug
  try { decoded = decodeURIComponent(slug) } catch {}

  // 1) exact slug match
  for (const cand of decoded !== slug ? [decoded, slug] : [slug]) {
    const { data } = await sb
      .from('blogs')
      .select('*, profiles:user_id(id, full_name, username, avatar_url)')
      .eq('slug', cand)
      .eq('is_active', true)
      .maybeSingle()
    if (data) return data
  }

  // 2) Fallback: legacy sluggify nuvalo LT raides — Rutonė → ruton-.
  //    Bandom rasti profile pagal username, tada blog by user_id.
  for (const cand of decoded !== slug ? [decoded, slug] : [slug]) {
    const { data: prof } = await sb
      .from('profiles')
      .select('id')
      .ilike('username', cand)
      .maybeSingle()
    if (!prof) continue
    const { data: blog } = await sb
      .from('blogs')
      .select('*, profiles:user_id(id, full_name, username, avatar_url)')
      .eq('user_id', prof.id)
      .eq('is_active', true)
      .maybeSingle()
    if (blog) return blog
  }
  return null
}

export async function getBlogByUserId(userId: string) {
  const sb = createAdminClient()
  const { data } = await sb.from('blogs').select('*').eq('user_id', userId).single()
  return data
}

export async function createBlog(userId: string, slug: string, title: string, description?: string) {
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('blogs')
    .insert({ user_id: userId, slug, title, description })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateBlog(blogId: string, updates: Record<string, any>) {
  const sb = createAdminClient()
  const { error } = await sb.from('blogs').update(updates).eq('id', blogId)
  if (error) throw error
}

export async function isBlogSlugTaken(slug: string, excludeId?: string) {
  const sb = createAdminClient()
  let q = sb.from('blogs').select('id', { count: 'exact', head: true }).eq('slug', slug)
  if (excludeId) q = q.neq('id', excludeId)
  const { count } = await q
  return (count || 0) > 0
}

// ── BLOG POSTS ──────────────────────────────────────────────
export async function getBlogPosts(blogId: string, limit = 20, offset = 0, postType?: string | null) {
  const sb = createAdminClient()
  let q = sb
    .from('blog_posts')
    .select('id, slug, title, summary, cover_image_url, published_at, reading_time_min, view_count, like_count, comment_count, post_type', { count: 'exact' })
    .eq('blog_id', blogId)
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .order('published_at', { ascending: false })
  if (postType && postType !== 'all') {
    q = q.eq('post_type', postType)
  }
  const { data, count } = await q.range(offset, offset + limit - 1)
  return { posts: data || [], total: count || 0 }
}

// V2 (2026-05-25): heavy UGC user'iams reikia per-type counts navigation tab'ams
// (article 510 / creation 31 / translation 8 / topas 12). Vienas RPC vietoj 4+1 query'ų.
export async function getBlogPostCountsByType(blogId: string) {
  const sb = createAdminClient()
  const types = ['article', 'creation', 'translation', 'topas', 'review', 'release', 'interview', 'event']
  const counts: Record<string, number> = { all: 0 }
  // Total
  const { count: total } = await sb
    .from('blog_posts')
    .select('id', { count: 'exact', head: true })
    .eq('blog_id', blogId)
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
  counts.all = total || 0
  // Per-type
  for (const t of types) {
    const { count } = await sb
      .from('blog_posts')
      .select('id', { count: 'exact', head: true })
      .eq('blog_id', blogId)
      .eq('status', 'published')
      .lte('published_at', new Date().toISOString())
      .eq('post_type', t)
    if ((count || 0) > 0) counts[t] = count || 0
  }
  return counts
}

export async function getAllUserPosts(userId: string) {
  const sb = createAdminClient()
  const { data } = await sb
    .from('blog_posts')
    .select('id, slug, title, summary, content, cover_image_url, post_type, rating, status, published_at, reading_time_min, view_count, like_count, comment_count, created_at, updated_at, blogs:blog_id(slug)')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  return data || []
}

export async function getPost(blogSlug: string, postSlug: string) {
  const sb = createAdminClient()

  // URL-decode dėl LT raidžių (Ruton%C4%97 → Rutonė)
  let decodedBlog = blogSlug
  let decodedPost = postSlug
  try { decodedBlog = decodeURIComponent(blogSlug) } catch {}
  try { decodedPost = decodeURIComponent(postSlug) } catch {}

  // 1) Try resolve blog: exact slug → fallback by author username
  const blogCands = decodedBlog !== blogSlug ? [decodedBlog, blogSlug] : [blogSlug]
  let blog: any = null
  for (const cand of blogCands) {
    const { data } = await sb
      .from('blogs')
      .select('id, slug, title, user_id, profiles:user_id(id, full_name, username, avatar_url, legacy_karma_points, joined_legacy_at)')
      .eq('slug', cand)
      .maybeSingle()
    if (data) { blog = data; break }
  }
  if (!blog) {
    // Legacy sluggify (Rutonė → ruton-) — lookup by username instead
    for (const cand of blogCands) {
      const { data: prof } = await sb
        .from('profiles')
        .select('id')
        .ilike('username', cand)
        .maybeSingle()
      if (!prof) continue
      const { data } = await sb
        .from('blogs')
        .select('id, slug, title, user_id, profiles:user_id(id, full_name, username, avatar_url, legacy_karma_points, joined_legacy_at)')
        .eq('user_id', prof.id)
        .maybeSingle()
      if (data) { blog = data; break }
    }
  }
  if (!blog) return null

  // 2) Post lookup by slug (try decoded + raw)
  const postCands = decodedPost !== postSlug ? [decodedPost, postSlug] : [postSlug]
  for (const cand of postCands) {
    const { data: post } = await sb
      .from('blog_posts')
      .select('*')
      .eq('blog_id', blog.id)
      .eq('slug', cand)
      .maybeSingle()
    if (post) return { ...post, blog }
  }
  return null
}

export async function getPostById(postId: string) {
  const sb = createAdminClient()
  const { data } = await sb.from('blog_posts').select('*, blogs:blog_id(slug, title)').eq('id', postId).single()
  return data
}

// Visi laukai, kuriuos editor'ius gali pateikti. Atskiriam nuo update versijos
// nes status/published_at handling skirtingas (insert visada pradeda nuo
// draft jeigu nepublikuoja iš karto).
export type PostUpsertFields = {
  title: string
  slug?: string
  content?: string | null
  summary?: string | null
  cover_image_url?: string | null
  status?: 'draft' | 'published'
  published_at?: string
  // Type discriminator + per-type laukai (visi nullable schemoje)
  post_type?: 'article' | 'review' | 'translation' | 'creation' | 'event' | 'topas'
  rating?: number | null
  target_artist_id?: number | null
  target_album_id?: number | null
  target_track_id?: number | null
  target_event_id?: string | null
  embed_url?: string | null
  embed_type?: string | null
  embed_thumbnail_url?: string | null
  embed_title?: string | null
  embed_html?: string | null
  tags?: string[]
  list_items?: any[]
  creation_subtype?: string | null
}

export async function createPost(blogId: string, userId: string, data: PostUpsertFields & { slug: string }) {
  const sb = createAdminClient()
  const { data: post, error } = await sb
    .from('blog_posts')
    .insert({
      blog_id: blogId,
      user_id: userId,
      ...data,
      published_at: data.status === 'published' ? (data.published_at || new Date().toISOString()) : data.published_at,
    })
    .select()
    .single()
  if (error) throw error
  return post
}

export async function updatePost(postId: string, userId: string, updates: Record<string, any>) {
  const sb = createAdminClient()
  const { error } = await sb.from('blog_posts').update(updates).eq('id', postId).eq('user_id', userId)
  if (error) throw error
}

export async function deletePost(postId: string, userId: string) {
  const sb = createAdminClient()
  const { error } = await sb.from('blog_posts').delete().eq('id', postId).eq('user_id', userId)
  if (error) throw error
}

export async function incrementPostViews(postId: string) {
  const sb = createAdminClient()
  try {
    await sb.rpc('increment_post_views', { post_id: postId })
  } catch {
    // Fallback: simple increment via raw update
    const { data } = await sb.from('blog_posts').select('view_count').eq('id', postId).single()
    if (data) {
      await sb.from('blog_posts').update({ view_count: (data.view_count || 0) + 1 }).eq('id', postId)
    }
  }
}

// ── POST RELATIONS ──────────────────────────────────────────
export async function getPostRelatedArtists(postId: string) {
  const sb = createAdminClient()
  const { data } = await sb
    .from('blog_post_artists')
    .select('artist_id, artists:artist_id(id, slug, name, cover_image_url)')
    .eq('post_id', postId)
  return (data || []).map((r: any) => r.artists).filter(Boolean)
}

/** Visi post'o music attachments — artists + albums + tracks per junction
 *  lenteles. Naudoja JOIN'inius su atitinkamų entity lentelių pagrindinėmis
 *  display kolonomis. Grąžina unified ordered list iš trijų rūšių, kad UI
 *  galėtų render'inti vientisą sidebar. Sąrašo eilė: artists, albums, tracks. */
export async function getPostMusicAttachments(postId: string) {
  const sb = createAdminClient()
  const [artistsRes, albumsRes, tracksRes] = await Promise.all([
    sb.from('blog_post_artists')
      .select('artist_id, artists:artist_id(id, slug, name, cover_image_url)')
      .eq('post_id', postId),
    sb.from('blog_post_albums')
      .select('album_id, albums:album_id(id, slug, title, cover_image_url, release_year, artist:artist_id(id, slug, name))')
      .eq('post_id', postId),
    sb.from('blog_post_tracks')
      .select('track_id, tracks:track_id(id, slug, title, cover_image_url, youtube_url, artist:artist_id(id, slug, name))')
      .eq('post_id', postId),
  ])
  return {
    artists: (artistsRes.data || []).map((r: any) => r.artists).filter(Boolean),
    albums: (albumsRes.data || []).map((r: any) => r.albums).filter(Boolean),
    tracks: (tracksRes.data || []).map((r: any) => r.tracks).filter(Boolean),
  }
}

export async function setPostRelatedArtists(postId: string, artistIds: number[]) {
  const sb = createAdminClient()
  await sb.from('blog_post_artists').delete().eq('post_id', postId)
  if (artistIds.length > 0) {
    await sb.from('blog_post_artists').insert(artistIds.map(id => ({ post_id: postId, artist_id: id })))
  }
}

// ── LIKES ───────────────────────────────────────────────────
export async function togglePostLike(postId: string, userId: string) {
  const sb = createAdminClient()
  const { data: existing } = await sb.from('blog_post_likes').select('user_id').eq('post_id', postId).eq('user_id', userId).single()
  
  if (existing) {
    await sb.from('blog_post_likes').delete().eq('post_id', postId).eq('user_id', userId)
    await sb.from('blog_posts').update({ like_count: sb.from('blog_post_likes').select('*', { count: 'exact', head: true }).eq('post_id', postId) }).eq('id', postId)
    return false
  } else {
    await sb.from('blog_post_likes').insert({ post_id: postId, user_id: userId })
    return true
  }
}

export async function hasUserLikedPost(postId: string, userId: string) {
  const sb = createAdminClient()
  const { count } = await sb.from('blog_post_likes').select('*', { count: 'exact', head: true }).eq('post_id', postId).eq('user_id', userId)
  return (count || 0) > 0
}

// ── COMMENTS ────────────────────────────────────────────────
// Blog post komentarai turi du source'us:
//   1. `blog_comments` — modern editor'iaus rašyti (post_id, user_id, content)
//   2. `comments` (canonical) — importuoti iš senos music.lt, link'inti per
//      blog_post_id FK su content_html/body laukais ir author_id.
// Šis helper'is sumerge'ina abu šaltinius ir grąžina unified shape'ą.
export async function getPostComments(postId: string) {
  const sb = createAdminClient()
  const [modernRes, legacyRes] = await Promise.all([
    sb.from('blog_comments')
      .select('id, content, created_at, profiles:user_id(id, full_name, username, avatar_url)')
      .eq('post_id', postId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true }),
    sb.from('comments')
      .select('id, body, created_at, like_count, music_attachments, profiles:author_id(id, full_name, username, avatar_url)')
      .eq('blog_post_id', postId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true }),
  ])
  const modern = (modernRes.data || []).map((c: any) => ({
    id: `m_${c.id}`,
    content: c.content,
    content_html: null,
    created_at: c.created_at,
    profiles: c.profiles,
    source: 'modern' as const,
    like_count: 0,
  }))
  const legacy = (legacyRes.data || []).map((c: any) => ({
    id: `l_${c.id}`,
    content: c.body || '',
    content_html: null,  // Po 2026-05-28c drop'o — visada NULL
    created_at: c.created_at,
    profiles: c.profiles,
    source: 'legacy' as const,
    like_count: c.like_count || 0,
    music_attachments: c.music_attachments,
  }))
  // Merge + sort by date asc
  const merged = [...modern, ...legacy].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )
  return merged
}

export async function addComment(postId: string, userId: string, content: string) {
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('blog_comments')
    .insert({ post_id: postId, user_id: userId, content })
    .select('id, content, created_at, profiles:user_id(id, full_name, username, avatar_url)')
    .single()
  if (error) throw error
  // Update denormalized count
  const { count } = await sb.from('blog_comments').select('*', { count: 'exact', head: true }).eq('post_id', postId).eq('is_deleted', false)
  await sb.from('blog_posts').update({ comment_count: count || 0 }).eq('id', postId)
  return data
}

// ── LATEST BLOG POSTS (for homepage) ────────────────────────
export async function getLatestBlogPosts(limit = 6) {
  const sb = createAdminClient()
  const { data } = await sb
    .from('blog_posts')
    .select('id, slug, title, summary, cover_image_url, post_type, rating, tags, published_at, reading_time_min, like_count, blogs:blog_id(slug, title, profiles:user_id(full_name, username, avatar_url))')
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .order('published_at', { ascending: false })
    .limit(limit)
  return data || []
}

/** Admine pažymėti įrašai (home_hero=true) — rodomi pradžios hero feede tarp naujienų. */
export async function getHomeHeroPosts(limit = 8) {
  const sb = createAdminClient()
  const { data } = await sb
    .from('blog_posts')
    .select('id, slug, title, summary, cover_image_url, post_type, editorial_type, published_at, blogs:blog_id(slug, profiles:user_id(full_name, username, avatar_url))')
    .eq('status', 'published')
    .eq('home_hero', true)
    .lte('published_at', new Date().toISOString())
    .order('published_at', { ascending: false })
    .limit(limit)
  return data || []
}

// ── GLOBAL FEED (su filtravimu) ─────────────────────────────
// Kviečiamas /blogas index'o (placeholder pakeitimas) ir kitur, kur reikia
// matyti visų autorių įrašus. Priimame post_type ir tag filtrus.
export async function getBlogFeed(opts: {
  limit?: number
  offset?: number
  postType?: string | null         // konkretus tipas arba null = visi
  tag?: string | null              // konkretus tag'as arba null = visi
  authorId?: string | null         // jei norim filtruoti pagal autorių
}) {
  const sb = createAdminClient()
  const limit = Math.min(opts.limit ?? 20, 50)
  const offset = opts.offset ?? 0

  let q = sb
    .from('blog_posts')
    .select(
      'id, slug, title, summary, content, cover_image_url, post_type, ' +
      'rating, target_artist_id, target_album_id, target_track_id, target_event_id, tags, ' +
      'published_at, reading_time_min, view_count, like_count, comment_count, ' +
      'blogs:blog_id(slug, title, profiles:user_id(id, full_name, username, avatar_url))',
      { count: 'exact' }
    )
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .order('published_at', { ascending: false })

  if (opts.postType) q = q.eq('post_type', opts.postType)
  if (opts.tag)      q = q.contains('tags', [opts.tag])
  if (opts.authorId) q = q.eq('user_id', opts.authorId)

  const { data, count } = await q.range(offset, offset + limit - 1)
  return { posts: data || [], total: count || 0 }
}

// ── POPULAR TAGS ────────────────────────────────────────────
// Lengvasvoris: imam paskutinius N publikuotus įrašus, suvedam tag'us į count'ą.
// Vėliau galima migruoti į matview jei darys reikia.
export async function getPopularTags(limit = 20) {
  const sb = createAdminClient()
  const { data } = await sb
    .from('blog_posts')
    .select('tags')
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .not('tags', 'eq', '{}')
    .limit(500)
  const counts = new Map<string, number>()
  for (const row of data || []) {
    for (const tag of (row.tags as string[]) || []) {
      counts.set(tag, (counts.get(tag) || 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }))
}

// ── TARGET INFO (review/translation/event) ──────────────────
// Pakraunam display info iš atitinkamų lentelių. Visos užklausos paraleliai.
export async function getReviewTargetInfo(opts: {
  artist_id?: number | null
  album_id?: number | null
  track_id?: number | null
  event_id?: string | null
}) {
  const sb = createAdminClient()
  const [artistRes, albumRes, trackRes, eventRes] = await Promise.all([
    opts.artist_id ? sb.from('artists').select('id, name, slug, cover_image_url').eq('id', opts.artist_id).maybeSingle() : Promise.resolve({ data: null }),
    opts.album_id  ? sb.from('albums').select('id, title, slug, cover_image_url, artist:artist_id(id, name, slug)').eq('id', opts.album_id).maybeSingle() : Promise.resolve({ data: null }),
    opts.track_id  ? sb.from('tracks').select('id, title, slug, cover_image_url, artist:artist_id(id, name, slug)').eq('id', opts.track_id).maybeSingle() : Promise.resolve({ data: null }),
    opts.event_id  ? sb.from('events').select('id, title, slug, start_date, city, cover_image_url').eq('id', opts.event_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  return {
    artist: artistRes.data,
    album: albumRes.data,
    track: trackRes.data,
    event: eventRes.data,
  }
}

// ── SEARCH ARTISTS (for editor) ─────────────────────────────
export async function searchArtistsForBlog(query: string, limit = 10) {
  const sb = createAdminClient()
  const { data } = await sb
    .from('artists')
    .select('id, slug, name, cover_image_url')
    .ilike('name', `%${query}%`)
    .limit(limit)
  return data || []
}
