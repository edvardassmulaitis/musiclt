// lib/supabase-blog.ts
import { createAdminClient } from './supabase'

// ── PROFILES ────────────────────────────────────────────────
export async function getProfileByUsername(username: string) {
  const sb = createAdminClient()
  const { data } = await sb
    .from('profiles')
    .select(`
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
      legacy_liked_track_count, legacy_music_meter
    `)
    .ilike('username', username)
    .single()
  return data
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
  const { data: picks } = await sb
    .from('daily_song_picks')
    .select('id, picked_on, comment, like_count, legacy_track_id, track_id')
    .eq('author_id', userId)
    .order('picked_on', { ascending: false })
    .limit(limit)
  const rows = (picks || []) as any[]
  if (!rows.length) return rows
  const trackIds = rows.map((r) => r.track_id).filter(Boolean) as number[]
  if (!trackIds.length) return rows.map((r) => ({ ...r, tracks: null }))
  const { data: tracks } = await sb
    .from('tracks')
    .select('id, slug, title, artist_id, artists:artist_id(id, slug, name, cover_image_url)')
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
  return rows.map((r) => ({ ...r, tracks: r.track_id ? trackMap.get(r.track_id) || null : null }))
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
  const { data } = await sb
    .from('tracks')
    .select('id, slug, title, artist_id, artists:artist_id(id, slug, name, cover_image_url)')
    .eq('id', trackId)
    .single()
  return data as any
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
  const { data } = await sb
    .from('profile_favorite_artists')
    .select('artist_id, sort_order, artists:artist_id(id, slug, name, cover_image_url)')
    .eq('user_id', userId)
    .order('sort_order')
  const artists = (data || []).map((r: any) => r.artists).filter(Boolean) as any[]
  if (!artists.length) return artists

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
  return artists.map((a) => ({ ...a, mainGenres: genreMap.get(a.id) || [] }))
}

// ── BLOGS ───────────────────────────────────────────────────
export async function getBlogBySlug(slug: string) {
  const sb = createAdminClient()
  const { data } = await sb
    .from('blogs')
    .select('*, profiles:user_id(id, full_name, username, avatar_url)')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()
  return data
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
export async function getBlogPosts(blogId: string, limit = 20, offset = 0) {
  const sb = createAdminClient()
  const { data, count } = await sb
    .from('blog_posts')
    .select('id, slug, title, summary, cover_image_url, published_at, reading_time_min, view_count, like_count, comment_count', { count: 'exact' })
    .eq('blog_id', blogId)
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .order('published_at', { ascending: false })
    .range(offset, offset + limit - 1)
  return { posts: data || [], total: count || 0 }
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
  // First get blog
  const { data: blog } = await sb.from('blogs').select('id, slug, title, user_id, profiles:user_id(id, full_name, username, avatar_url)').eq('slug', blogSlug).single()
  if (!blog) return null

  const { data: post } = await sb
    .from('blog_posts')
    .select('*')
    .eq('blog_id', blog.id)
    .eq('slug', postSlug)
    .single()
  if (!post) return null

  return { ...post, blog }
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
      .select('id, body, content_html, created_at, like_count, music_attachments, profiles:author_id(id, full_name, username, avatar_url)')
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
    content_html: c.content_html || null,
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
