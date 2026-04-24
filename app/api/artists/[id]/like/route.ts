// app/api/artists/[id]/like/route.ts
// Toggle endpoint for artist likes. Writes to artist_likes (artist_id, user_id).
// Requires auth via next-auth session.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

/** GET — returns { liked, count } for the current viewer. `liked` is false for
 *  anonymous viewers; count is total modern likes from artist_likes. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const artistId = parseInt(id)
  if (isNaN(artistId)) {
    return NextResponse.json({ error: 'Blogas artist id' }, { status: 400 })
  }
  const sb = createAdminClient()
  const session = await getServerSession(authOptions)

  const { count } = await sb
    .from('artist_likes')
    .select('*', { count: 'exact', head: true })
    .eq('artist_id', artistId)

  let liked = false
  if (session?.user?.id) {
    const { data } = await sb
      .from('artist_likes')
      .select('id')
      .eq('artist_id', artistId)
      .eq('user_id', session.user.id)
      .maybeSingle()
    liked = !!data
  }

  return NextResponse.json({ liked, count: count || 0 })
}

/** POST — toggles like for the authenticated user. */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Prisijunk, kad galėtum įdėti patinka' }, { status: 401 })
  }
  const { id } = await params
  const artistId = parseInt(id)
  if (isNaN(artistId)) {
    return NextResponse.json({ error: 'Blogas artist id' }, { status: 400 })
  }

  const userId = session.user.id
  const sb = createAdminClient()

  const { data: existing } = await sb
    .from('artist_likes')
    .select('id')
    .eq('artist_id', artistId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) {
    await sb.from('artist_likes')
      .delete()
      .eq('artist_id', artistId)
      .eq('user_id', userId)
  } else {
    const { error: insErr } = await sb
      .from('artist_likes')
      .insert({ artist_id: artistId, user_id: userId })
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 })
    }
  }

  const { count } = await sb
    .from('artist_likes')
    .select('*', { count: 'exact', head: true })
    .eq('artist_id', artistId)

  return NextResponse.json({ liked: !existing, count: count || 0 })
}
