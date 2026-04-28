// app/api/comments/likes/route.ts
//
// Per-comment like toggle. Schema: comment_likes(id, comment_id, user_id, weight, created_at).
// Auth users only — voter_ip / fingerprint columns no longer in schema, so anon
// liking is disabled for now (could come back via the unified `likes` table if
// we want to extend `entity_type='comment'` model end-to-end).

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveAuthorId } from '@/lib/resolve-author'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const commentId = parseInt(body.comment_id)
  if (!commentId) return NextResponse.json({ error: 'Blogas comment_id' }, { status: 400 })

  const sb = createAdminClient()
  const userIdVal = await resolveAuthorId(sb, session)
  if (!userIdVal) return NextResponse.json({ error: 'Profilis nerastas' }, { status: 500 })

  // Toggle: jei jau patiko — pašalinam; jei ne — įdedam.
  const { data: existing } = await sb
    .from('comment_likes')
    .select('id')
    .eq('comment_id', commentId)
    .eq('user_id', userIdVal)
    .maybeSingle()

  if (existing) {
    const { error } = await sb.from('comment_likes').delete().eq('id', existing.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // like_count atnaujinamas trigger'iu DB lygyje (jei sukonfigūruotas).
    return NextResponse.json({ liked: false })
  }

  const { error } = await sb.from('comment_likes').insert({
    comment_id: commentId,
    user_id: userIdVal,
    weight: 1,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ liked: true })
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  const { searchParams } = new URL(req.url)
  const commentIds = (searchParams.get('ids') || '').split(',').map(Number).filter(n => !isNaN(n))
  if (!commentIds.length || !session?.user?.id) {
    return NextResponse.json({ liked_ids: [] })
  }

  const sb = createAdminClient()
  const uid = await resolveAuthorId(sb, session)
  if (!uid) return NextResponse.json({ liked_ids: [] })

  const { data } = await sb
    .from('comment_likes')
    .select('comment_id')
    .eq('user_id', uid)
    .in('comment_id', commentIds)

  return NextResponse.json({ liked_ids: (data || []).map((l: any) => l.comment_id) })
}
