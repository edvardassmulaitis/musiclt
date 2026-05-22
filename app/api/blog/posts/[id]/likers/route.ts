// app/api/blog/posts/[id]/likers/route.ts
//
// Returns list of users who liked this blog post + total count. Used by
// the new BlogActionsBar client component to populate LikesModal and
// detect viewer's own like state. Mirrors `/api/likes/news/[id]` shape.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('blog_post_likes')
    .select('user_id, created_at, profiles:user_id(id, username, full_name, avatar_url)')
    .eq('post_id', id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const users = (data || []).map((row: any) => {
    const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    return {
      user_id: row.user_id,
      user_username: p?.username || null,
      user_full_name: p?.full_name || null,
      user_avatar_url: p?.avatar_url || null,
      created_at: row.created_at,
    }
  })

  return NextResponse.json({ count: users.length, users })
}
