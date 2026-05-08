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
  'artist', 'album', 'track', 'event', 'thread', 'post', 'comment', 'news',
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

  // Modern comment likes — atskira lentelė `comment_likes` (užregistruoti
  // user'iai). Sumerge'inam su scraped legacy likes (kurie yra `likes` table'je
  // su entity_type='comment'). Be šito merge'o, naujai paspausti likes
  // (auth user'iai) modal'e nematysi — count'as kabo, bet sąrašas tuščias.
  let users: any[] = data || []
  if (entity_type === 'comment') {
    const { data: modernLikes } = await sb
      .from('comment_likes')
      .select('user_id, created_at, profiles:user_id(username, full_name, avatar_url)')
      .eq('comment_id', eid)
      .order('created_at', { ascending: false })
      .limit(200)
    const modernAsLikes = (modernLikes || []).map((l: any) => ({
      user_username: l.profiles?.username || l.profiles?.full_name || 'Vartotojas',
      user_rank: null,
      user_avatar_url: l.profiles?.avatar_url || null,
      source: 'modern',
      created_at: l.created_at,
    }))
    // Dedupe pagal username — modern likes turi prioritetą (su realiu profile)
    const seen = new Set<string>()
    const merged: any[] = []
    for (const u of [...modernAsLikes, ...users]) {
      const key = (u.user_username || '').toLowerCase()
      if (key && seen.has(key)) continue
      seen.add(key)
      merged.push(u)
    }
    users = merged
  }
  const missing = users.filter(u => !u.user_avatar_url).map(u => u.user_username)
  if (missing.length > 0) {
    const { data: avatarRows } = await sb
      .from('likes')
      .select('user_username, user_avatar_url')
      .in('user_username', missing)
      .not('user_avatar_url', 'is', null)
      .limit(2000)
    const avMap = new Map<string, string>()
    for (const r of avatarRows || []) {
      if (r.user_username && r.user_avatar_url && !avMap.has(r.user_username)) {
        avMap.set(r.user_username, r.user_avatar_url)
      }
    }
    for (const u of users) {
      if (!u.user_avatar_url && avMap.has(u.user_username)) {
        u.user_avatar_url = avMap.get(u.user_username)!
      }
    }
  }

  return NextResponse.json({
    count: users.length,
    users,
  })
}
