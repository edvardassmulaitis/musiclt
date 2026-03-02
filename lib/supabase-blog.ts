// lib/supabase-blog.ts
import { createAdminClient } from './supabase'

// ── PROFILES ────────────────────────────────────────────────
export async function getProfileByUsername(username: string) {
  const sb = createAdminClient()
  const { data } = await sb
    .from('profiles')
    .select('id, email, full_name, username, avatar_url, bio, website, social_instagram, social_twitter, social_spotify, social_youtube, social_tiktok, is_public, cover_image_url, created_at')
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

export async function createPost(blogId: string, userId: string, data: { title: string; slug: string; content?: string; summary?: string; cover_image_url?: string; status?: string; published_at?: string }) {
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
    .select('id, slug, title, summary, cover_image_url, published_at, reading_time_min, like_count, blogs:blog_id(slug, title, profiles:user_id(full_name, username, avatar_url))')
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .order('published_at', { ascending: false })
    .limit(limit)
  return data || []
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
