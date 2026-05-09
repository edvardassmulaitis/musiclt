// lib/ensure-blog.ts
import { getBlogByUserId, createBlog } from './supabase-blog'
import { getProfileById } from './supabase-blog'

export async function ensureUserBlog(userId: string) {
  let blog = await getBlogByUserId(userId)
  if (blog) return blog

  // Auto-create blog
  const profile = await getProfileById(userId)
  if (!profile) return null

  const slug = profile.username || profile.email?.split('@')[0] || userId.slice(0, 8)
  const title = (profile.full_name || profile.username || 'Mano') + ' blogas'

  try {
    blog = await createBlog(userId, slug, title)
  } catch {
    // Slug collision — add random suffix
    blog = await createBlog(userId, slug + Math.random().toString(36).slice(2, 6), title)
  }
  return blog
}
