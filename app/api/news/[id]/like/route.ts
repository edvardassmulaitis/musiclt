// app/api/news/[id]/like/route.ts
//
// News article like toggle — entity_type='news', entity_id=news_id (discussions.id).
// Užtikrina vienodą like'ų sistemą su track/album/artist/comment per `likes` table.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { resolveAuthorId } from '@/lib/resolve-author'

/** Total like count naujienai — vienas SELECT iš unified `likes` lentelės. */
async function likeCount(sb: ReturnType<typeof createAdminClient>, newsId: number): Promise<number> {
  const { count } = await sb
    .from('likes')
    .select('*', { count: 'exact', head: true })
    .eq('entity_type', 'news')
    .eq('entity_id', newsId)
  return count || 0
}

// ── GET: grąžina { liked, count } dabartiniam žiūrovui (kaip track/artist) ──
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const newsId = parseInt(id)
  if (!newsId) return NextResponse.json({ error: 'Bad newsId' }, { status: 400 })

  const sb = createAdminClient()
  const count = await likeCount(sb, newsId)

  let liked = false
  const session = await getServerSession(authOptions)
  if (session?.user) {
    const userId = await resolveAuthorId(sb, session)
    if (userId) {
      const { data } = await sb
        .from('likes')
        .select('id')
        .eq('entity_type', 'news')
        .eq('entity_id', newsId)
        .eq('user_id', userId)
        .maybeSingle()
      liked = !!data
    }
  }
  return NextResponse.json({ liked, count }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })
  }

  const { id } = await params
  const newsId = parseInt(id)
  if (!newsId) return NextResponse.json({ error: 'Bad newsId' }, { status: 400 })

  const sb = createAdminClient()
  const userId = await resolveAuthorId(sb, session)
  if (!userId) return NextResponse.json({ error: 'Profilis nerastas' }, { status: 500 })

  // Toggle existing like
  const { data: existing } = await sb
    .from('likes')
    .select('id')
    .eq('entity_type', 'news')
    .eq('entity_id', newsId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) {
    await sb.from('likes').delete().eq('id', (existing as any).id)
    return NextResponse.json({ liked: false, count: await likeCount(sb, newsId) })
  }

  // Po 2026-05-28c slim-down: user_avatar_url, source DROP'inti.
  // Avatar fetch'inamas iš profiles JOIN'u per user_id.
  const { error } = await sb.from('likes').insert({
    entity_type: 'news',
    entity_id: newsId,
    user_id: userId,
    user_username: (session.user as any).name || session.user.email || 'user',
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ liked: true, count: await likeCount(sb, newsId) })
}
