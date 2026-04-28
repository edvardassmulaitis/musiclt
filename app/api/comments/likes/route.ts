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
  const commentId = body.comment_id ? parseInt(body.comment_id) : null
  const legacyId = body.legacy_id ? parseInt(body.legacy_id) : null
  if (!commentId && !legacyId) {
    return NextResponse.json({ error: 'Reikia comment_id arba legacy_id' }, { status: 400 })
  }

  const sb = createAdminClient()
  const userIdVal = await resolveAuthorId(sb, session)
  if (!userIdVal) return NextResponse.json({ error: 'Profilis nerastas' }, { status: 500 })

  // ─── Legacy comment toggle ────────────────────────────────────────────
  // Old music.lt scraped comments don't live in modern `comments` table, so
  // we can't FK to them. Instead use the unified `likes` table with
  // entity_type='comment' + entity_id=legacy_id. Display count = imported
  // (entity_comments.like_count) + this user's modern toggle.
  if (legacyId) {
    const { data: existingLegacy } = await sb
      .from('likes')
      .select('id')
      .eq('entity_type', 'comment')
      .eq('entity_id', legacyId)
      .eq('user_id', userIdVal)
      .eq('source', 'modern')
      .maybeSingle()
    if (existingLegacy) {
      const { error } = await sb.from('likes').delete().eq('id', existingLegacy.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ liked: false })
    }
    const { error } = await sb.from('likes').insert({
      entity_type: 'comment',
      entity_id: legacyId,
      user_id: userIdVal,
      user_username: (session.user as any).name || (session.user as any).email || 'user',
      user_avatar_url: (session.user as any).image || null,
      source: 'modern',
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ liked: true })
  }

  // Below: modern comment_likes flow
  if (!commentId) return NextResponse.json({ error: 'Blogas comment_id' }, { status: 400 })

  // Block self-likes — backend enforcement (UI disables but never trust client).
  const { data: targetComment } = await sb
    .from('comments')
    .select('author_id')
    .eq('id', commentId)
    .maybeSingle()
  if (targetComment && targetComment.author_id === userIdVal) {
    return NextResponse.json({ error: 'Negalima palaikinti savo paties komentaro' }, { status: 403 })
  }

  // Toggle: jei jau patiko — pašalinam; jei ne — įdedam.
  const { data: existing } = await sb
    .from('comment_likes')
    .select('id')
    .eq('comment_id', commentId)
    .eq('user_id', userIdVal)
    .maybeSingle()

  // Recompute like_count from comment_likes after toggle. There's no DB
  // trigger keeping comments.like_count in sync with comment_likes
  // (verified live — like inserted, like_count stayed 0). Easiest fix:
  // SELECT COUNT(*) FROM comment_likes after the mutation and UPDATE
  // comments.like_count.
  const recomputeLikeCount = async () => {
    const { count } = await sb
      .from('comment_likes')
      .select('*', { count: 'exact', head: true })
      .eq('comment_id', commentId)
    await sb.from('comments').update({ like_count: count || 0 }).eq('id', commentId)
  }

  if (existing) {
    const { error } = await sb.from('comment_likes').delete().eq('id', existing.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await recomputeLikeCount()
    return NextResponse.json({ liked: false })
  }

  const { error } = await sb.from('comment_likes').insert({
    comment_id: commentId,
    user_id: userIdVal,
    weight: 1,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await recomputeLikeCount()
  return NextResponse.json({ liked: true })
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  const { searchParams } = new URL(req.url)
  const commentIds = (searchParams.get('ids') || '').split(',').map(Number).filter(n => !isNaN(n))
  const legacyIds = (searchParams.get('legacy_ids') || '').split(',').map(Number).filter(n => !isNaN(n))
  if ((commentIds.length === 0 && legacyIds.length === 0) || !session?.user?.id) {
    return NextResponse.json({ liked_ids: [], liked_legacy_ids: [] })
  }

  const sb = createAdminClient()
  const uid = await resolveAuthorId(sb, session)
  if (!uid) return NextResponse.json({ liked_ids: [], liked_legacy_ids: [] })

  const [modernRes, legacyRes] = await Promise.all([
    commentIds.length > 0
      ? sb.from('comment_likes').select('comment_id').eq('user_id', uid).in('comment_id', commentIds)
      : Promise.resolve({ data: [] as any[] }),
    legacyIds.length > 0
      ? sb.from('likes').select('entity_id').eq('user_id', uid).eq('entity_type', 'comment').in('entity_id', legacyIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  return NextResponse.json({
    liked_ids: (modernRes.data || []).map((l: any) => l.comment_id),
    liked_legacy_ids: (legacyRes.data || []).map((l: any) => l.entity_id),
  })
}
