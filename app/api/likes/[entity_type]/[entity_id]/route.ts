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

  // Avatar fallback: artist/album/track scraping istoriškai nepagaudavo
  // user_avatar_url'ų (parse_like_list regex'as veikia comment listing'ams,
  // bet ne entity-rate;list page'ams). Comment likes scraping pagauna avatars.
  // Užpildom missing avatarus iš bet kurio kito likes row'o tos pačios
  // username'os su ne null avatar_url. Taip user'is mato avatarą bet kuriame
  // modal'e, jei jis kažkur scrap'inant buvo pagautas.
  const users = data || []
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
    count: count || users.length,
    users,
  })
}
