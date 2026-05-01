// lib/supabase-blog.ts
import { createAdminClient } from './supabase'

// ── PROFILES ────────────────────────────────────────────────
export async function getProfileByUsername(username: string) {
  const sb = createAdminClient()
  const { data } = await sb
    .from('profiles')
    .select('id, email, full_name, username, avatar_url, bio, website, social_twitter, social_spotify, social_youtube, social_tiktok, is_public, cover_image_url, created_at')
    .ilike('username', username)
    .single()
  return data
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
export async function getProfileFavoriteArtists(userId: string) {
  const sb = createAdminClient()
  const { data } = await sb
    .from('profile_favorite_artists')
    .select('artist_id, sort_order, artists:artist_id(id, slug, name, cover_image_url)')
    .eq('user_id', userId)
    .order('sort_order')
  return (data || []).map((r: any) => r.artists).filter(Boolean)
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
    .select('id, slug, title, summary, cover_image_url, status, published_at, reading_time_min, view_count, like_count, comment_count, created_at, updated_at')
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
  post_type?: 'article' | 'quick' | 'review' | 'translation' | 'creation' | 'journal'
  rating?: number | null
  target_artist_id?: number | null
  target_album_id?: number | null
  target_track_id?: number | null
  original_url?: string | null
  original_author?: string | null
  original_lang?: string | null
  embed_url?: string | null
  embed_type?: string | null
  embed_thumbnail_url?: string | null
  embed_title?: string | null
  embed_html?: string | null
  tags?: string[]
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
export async function getPostComments(postId: string) {
  const sb = createAdminClient()
  const { data } = await sb
    .from('blog_comments')
    .select('id, content, created_at, profiles:user_id(id, full_name, username, avatar_url)')
    .eq('post_id', postId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
  return data || []
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
    .select('id, slug, title, summary, cover_image_url, post_type, embed_thumbnail_url, embed_type, embed_title, rating, tags, published_at, reading_time_min, like_count, blogs:blog_id(slug, title, profiles:user_id(full_name, username, avatar_url))')
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
      'embed_url, embed_thumbnail_url, embed_type, embed_title, ' +
      'rating, target_artist_id, target_album_id, target_track_id, tags, ' +
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

// ── REVIEW TARGET INFO ──────────────────────────────────────
// Pakraunam artist/album/track display info recenzijos puslapiui. Visi trys
// queries paraleliai — vienas tinka, kiti grąžina null.
export async function getReviewTargetInfo(opts: {
  artist_id?: number | null
  album_id?: number | null
  track_id?: number | null
}) {
  const sb = createAdminClient()
  const [artistRes, albumRes, trackRes] = await Promise.all([
    opts.artist_id ? sb.from('artists').select('id, name, slug, cover_image_url').eq('id', opts.artist_id).maybeSingle() : Promise.resolve({ data: null }),
    opts.album_id  ? sb.from('albums').select('id, title, slug, cover_image_url, artist:artist_id(id, name, slug)').eq('id', opts.album_id).maybeSingle() : Promise.resolve({ data: null }),
    opts.track_id  ? sb.from('tracks').select('id, title, slug, cover_image_url, artist:artist_id(id, name, slug)').eq('id', opts.track_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  return {
    artist: artistRes.data,
    album: albumRes.data,
    track: trackRes.data,
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
