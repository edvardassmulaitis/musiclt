// app/api/discussions/[id]/like/route.ts
//
// Diskusijos (forum thread) „sekimas/patiktukas" — toggle + state. Senoji
// music.lt sistema temoms turėjo 👍 (discussions.like_count). Perkeliam: like'ai
// gyvena `likes` lentelėje su entity_type='thread' (kaip ir kitos temos),
// entity_id = legacy thread id (discussions.legacy_id), arba discussions.id jei
// legacy_id nėra (naujos auto-sukurtos temos). count = discussions.like_count
// baseline (legacy migruotas skaičius); client'as prideda optimistinį ±1.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { resolveAuthorId } from '@/lib/resolve-author'

async function entityKey(sb: any, discussionId: number): Promise<{ entityId: number; baseline: number } | null> {
  const { data } = await sb
    .from('discussions')
    .select('legacy_id, like_count')
    .eq('id', discussionId)
    .maybeSingle()
  if (!data) return null
  return {
    entityId: (data as any).legacy_id || discussionId,
    baseline: (data as any).like_count || 0,
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const did = parseInt(id)
  if (!did) return NextResponse.json({ error: 'Bad id' }, { status: 400 })
  const sb = createAdminClient()
  const key = await entityKey(sb, did)
  if (!key) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let liked = false
  const session = await getServerSession(authOptions)
  if (session?.user) {
    const userId = await resolveAuthorId(sb, session)
    if (userId) {
      const { data } = await sb
        .from('likes')
        .select('id')
        .eq('entity_type', 'thread')
        .eq('entity_id', key.entityId)
        .eq('user_id', userId)
        .maybeSingle()
      liked = !!data
    }
  }
  return NextResponse.json({ liked, count: key.baseline })
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
  const did = parseInt(id)
  if (!did) return NextResponse.json({ error: 'Bad id' }, { status: 400 })
  const sb = createAdminClient()
  const key = await entityKey(sb, did)
  if (!key) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const userId = await resolveAuthorId(sb, session)
  if (!userId) return NextResponse.json({ error: 'Profilis nerastas' }, { status: 500 })

  const { data: existing } = await sb
    .from('likes')
    .select('id')
    .eq('entity_type', 'thread')
    .eq('entity_id', key.entityId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) {
    await sb.from('likes').delete().eq('id', (existing as any).id)
    return NextResponse.json({ liked: false })
  }

  const { error } = await sb.from('likes').insert({
    entity_type: 'thread',
    entity_id: key.entityId,
    entity_legacy_id: key.entityId,
    user_id: userId,
    user_username: (session.user as any).name || session.user.email || 'user',
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ liked: true })
}
