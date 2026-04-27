// app/api/likes/[entity_type]/[entity_id]/route.ts
//
// Generic likes-listing endpoint. Grąžina sąrašą user'ių kurie palietė
// `entity_type` + `entity_id` kombinaciją. Naudojama:
//   - Comment ♥N modal'ui (entity_type='comment')
//   - Forum post ♥N modal'ui (entity_type='post')
//   - Track / album / artist likers modalams (entity_type='track' / 'album' / 'artist')
//
// Vienas endpoint, viena lentelė (`likes` post-unified-migration), viena
// modal'as visiems entity tipams.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

const ALLOWED_TYPES = new Set([
  'artist', 'album', 'track', 'event', 'thread', 'post', 'comment',
])

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ entity_type: string; entity_id: string }> }
) {
  const { entity_type, entity_id } = await params

  if (!ALLOWED_TYPES.has(entity_type)) {
    return NextResponse.json({ error: 'Invalid entity_type' }, { status: 400 })
  }
  const eid = parseInt(entity_id)
  if (isNaN(eid)) {
    return NextResponse.json({ error: 'Invalid entity_id' }, { status: 400 })
  }

  const sb = createAdminClient()
  const { data, count, error } = await sb
    .from('likes')
    .select('user_username, user_rank, user_avatar_url, source, created_at', { count: 'exact' })
    .eq('entity_type', entity_type)
    .eq('entity_id', eid)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({
    count: count || (data?.length ?? 0),
    users: data || [],
  })
}
