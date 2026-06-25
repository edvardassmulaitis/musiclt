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

  // Po 2026-05-28 architectural slim-down migracijos:
  //   • Drop'inta `user_avatar_url`, `user_rank`, `source` iš likes
  //   • Avatar/rank dabar fetch'inami JOIN'u į profiles per user_id
  //   • Ghost user'iai turi profile row'us (ensure_ghost_profile)
  // Per username fallback dingo — visi user'iai (ghost + modern) turi profile.

  const sb = createAdminClient()
  const { data, error } = await sb
    .from('likes')
    // NB: jokio count:'exact' — modal'as rodo users.length (limit 200), o
    // exact count nuskaitymas per 560k+ row likes lentelę kainavo brangiai.
    .select('user_username, user_id, created_at, profiles:user_id(avatar_url, rank)')
    .eq('entity_type', entity_type)
    .eq('entity_id', eid)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const mapLike = (l: any) => ({
    user_username: l.user_username,
    user_rank: l.profiles?.rank || null,
    user_avatar_url: l.profiles?.avatar_url || null,
    created_at: l.created_at,
  })

  let users: any[] = (data || []).map(mapLike)

  // Modern comment likes — atskira lentelė `comment_likes` (užregistruoti
  // user'iai). Sumerge'inam su scraped legacy likes.
  if (entity_type === 'comment') {
    const { data: modernLikes } = await sb
      .from('comment_likes')
      .select('user_id, created_at, profiles:user_id(username, full_name, avatar_url, rank)')
      .eq('comment_id', eid)
      .order('created_at', { ascending: false })
      .limit(200)
    const modernAsLikes = (modernLikes || []).map((l: any) => ({
      user_username: l.profiles?.username || l.profiles?.full_name || 'Vartotojas',
      user_rank: l.profiles?.rank || null,
      user_avatar_url: l.profiles?.avatar_url || null,
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

  // Avatar fallback per username profiles lookup — kai ghost user'is
  // turi profile row'ą, bet like'ai sukurti BEFORE jo user_id buvo set.
  const missing = users.filter(u => !u.user_avatar_url).map(u => u.user_username)
  if (missing.length > 0) {
    const { data: profileRows } = await sb
      .from('profiles')
      .select('username, avatar_url, rank')
      .in('username', missing)
      .not('avatar_url', 'is', null)
      .limit(500)
    const profMap = new Map<string, { avatar_url: string | null; rank: string | null }>()
    for (const r of profileRows || []) {
      if (r.username && !profMap.has(r.username)) {
        profMap.set(r.username, { avatar_url: r.avatar_url || null, rank: r.rank || null })
      }
    }
    for (const u of users) {
      if (!u.user_avatar_url && profMap.has(u.user_username)) {
        const p = profMap.get(u.user_username)!
        u.user_avatar_url = p.avatar_url
        if (!u.user_rank) u.user_rank = p.rank
      }
    }
  }

  // Aktyviausi / atpažįstami nariai viršuje: pirma su avataru (realūs aktyvūs
  // nariai), tada pagal rango prioritetą, galiausiai pagal šviežumą. Taip net kai
  // like'ų daug (limit 200) ir modalas kraunasi ilgėliau, naudingiausi nariai
  // matomi iškart viršuje.
  const rankPriority = (r: string | null): number => {
    if (!r) return 0
    const x = r.toLowerCase()
    if (x.includes('vip') || x.includes('legend') || x.includes('profesion') || x.includes('guru')) return 3
    if (x.includes('aktyv')) return 2
    if (x.includes('naujok') || x.includes('naujas')) return 1
    return 2
  }
  users.sort((a, b) => {
    const av = (b.user_avatar_url ? 1 : 0) - (a.user_avatar_url ? 1 : 0)
    if (av) return av
    const rp = rankPriority(b.user_rank) - rankPriority(a.user_rank)
    if (rp) return rp
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  })

  return NextResponse.json({
    count: users.length,
    users,
  })
}
