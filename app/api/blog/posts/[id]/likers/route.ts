// app/api/blog/posts/[id]/likers/route.ts
//
// Returns list of users who liked this blog post + total count. Two source
// tables (per-system inconsistency from migration):
//   1. `likes` WHERE entity_type='blog_post' AND entity_legacy_id=<post.legacy_id>
//      — visi scraper'iu importuoti legacy like'ai (4Blackberry, Konditerijus etc.)
//   2. `blog_post_likes` (post_id UUID + user_id UUID) — modern likes per
//      togglePostLike(). Šiandien tuščia, bet užfiksuos naujus interaction'us.
// Dedup per (user_id || username) — kad migration overlap'as nepadvigubintų.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sb = createAdminClient()

  // 1. Resolve post → legacy_id (jei egzistuoja)
  const { data: post } = await sb
    .from('blog_posts')
    .select('legacy_id')
    .eq('id', id)
    .maybeSingle() as { data: any }
  const legacyId = post?.legacy_id ?? null

  // 2. Paraleliai: legacy + modern likers
  const [legacyRes, modernRes] = await Promise.all([
    legacyId
      ? sb.from('likes')
          .select('user_id, user_username, user_rank, created_at, profiles:user_id(id, username, full_name, avatar_url)')
          .eq('entity_type', 'blog_post')
          .eq('entity_legacy_id', legacyId)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as any[], error: null }),
    sb.from('blog_post_likes')
      .select('user_id, created_at, profiles:user_id(id, username, full_name, avatar_url)')
      .eq('post_id', id)
      .order('created_at', { ascending: false }),
  ])

  if (legacyRes.error) return NextResponse.json({ error: legacyRes.error.message }, { status: 500 })
  if (modernRes.error) return NextResponse.json({ error: modernRes.error.message }, { status: 500 })

  const users: any[] = []
  const seen = new Set<string>()
  const push = (row: any) => {
    const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    const username = (p?.username || row.user_username || '').toLowerCase()
    if (!username) return
    if (seen.has(username)) return
    seen.add(username)
    users.push({
      user_id: row.user_id || null,
      user_username: p?.username || row.user_username || null,
      user_full_name: p?.full_name || null,
      user_avatar_url: p?.avatar_url || null,
      created_at: row.created_at,
    })
  }
  for (const r of (modernRes.data || [])) push(r)
  for (const r of (legacyRes.data || [])) push(r)

  return NextResponse.json({ count: users.length, users })
}
