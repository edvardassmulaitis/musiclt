// lib/ensure-blog.ts
//
// Užtikrina, kad konkretaus profilio user'is turi blogą. Jei dar nesukurtas,
// kuriam pagal username (arba email prefix kaip fallback). Anksčiau
// fetch'inom profile pats — dabar leidžiam caller'iui perduoti jau resolve'intą
// profilį, kad nebūtų DB drift problemų po wipe'ų.

import { getBlogByUserId, createBlog } from './supabase-blog'
import type { ResolvedProfile } from './profile-resolve'

export async function ensureUserBlog(profile: ResolvedProfile) {
  let blog = await getBlogByUserId(profile.id)
  if (blog) return blog

  const slug = (profile.username || profile.email?.split('@')[0] || profile.id.slice(0, 8))
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 40)
  const safeSlug = slug.length >= 3 ? slug : `user-${profile.id.slice(0, 6)}`
  const title = (profile.full_name || profile.username || 'Mano') + ' blogas'

  try {
    blog = await createBlog(profile.id, safeSlug, title)
  } catch {
    // Slug collision — random suffix
    const suffix = Math.random().toString(36).slice(2, 6)
    blog = await createBlog(profile.id, `${safeSlug}-${suffix}`, title)
  }
  return blog
}
