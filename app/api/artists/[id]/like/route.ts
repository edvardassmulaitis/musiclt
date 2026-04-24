// app/api/artists/[id]/like/route.ts
// Toggle endpoint for artist likes. Writes to artist_likes.
// Column name is uncertain in this deployment (user_id OR profile_id) so we
// probe once and cache. Both shapes are supported transparently.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

type UserCol = 'user_id' | 'profile_id'

/** Probe which column artist_likes uses for the user FK. Tries user_id first
 * and falls back to profile_id on a PostgREST "undefined column" error (42703).
 * The chosen column is cached process-wide so we only probe once per runtime. */
let cachedCol: UserCol | null = null
async function resolveUserCol(sb: ReturnType<typeof createAdminClient>): Promise<UserCol> {
  if (cachedCol) return cachedCol
  // Probe with a trivial head-count; column mismatch bubbles up as PostgREST
  // error code PGRST204 or 42703.
  const probe = await sb.from('artist_likes').select('user_id', { count: 'exact', head: true }).limit(1)
  if (!probe.error) {
    cachedCol = 'user_id'
  } else {
    cachedCol = 'profile_id'
  }
  return cachedCol
}

function jsonErr(msg: string, status = 500, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: msg, ...(extra || {}) }, { status })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const artistId = parseInt(id)
  if (isNaN(artistId)) return jsonErr('Blogas artist id', 400)
  const sb = createAdminClient()
  const session = await getServerSession(authOptions)
  const col = await resolveUserCol(sb)

  const { count } = await sb
    .from('artist_likes')
    .select('*', { count: 'exact', head: true })
    .eq('artist_id', artistId)

  let liked = false
  if (session?.user?.id) {
    const { data } = await sb
      .from('artist_likes')
      .select('*')
      .eq('artist_id', artistId)
      .eq(col, session.user.id)
      .limit(1)
      .maybeSingle()
    liked = !!data
  }

  return NextResponse.json({ liked, count: count || 0, col })
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return jsonErr('Prisijunk, kad galėtum įdėti patinka', 401)
  }
  const { id } = await params
  const artistId = parseInt(id)
  if (isNaN(artistId)) return jsonErr('Blogas artist id', 400)

  const userId = session.user.id
  const sb = createAdminClient()
  const col = await resolveUserCol(sb)

  // Check existing
  const { data: existing, error: checkErr } = await sb
    .from('artist_likes')
    .select('*')
    .eq('artist_id', artistId)
    .eq(col, userId)
    .limit(1)
    .maybeSingle()

  if (checkErr && checkErr.code !== 'PGRST116') {
    return jsonErr(`Nepavyko patikrinti: ${checkErr.message}`, 500, { col })
  }

  if (existing) {
    const { error } = await sb.from('artist_likes')
      .delete()
      .eq('artist_id', artistId)
      .eq(col, userId)
    if (error) return jsonErr(`Nepavyko pašalinti: ${error.message}`, 500, { col })
  } else {
    const payload: Record<string, any> = { artist_id: artistId }
    payload[col] = userId
    const { error } = await sb.from('artist_likes').insert(payload)
    if (error) {
      // If user_id was cached but insert says column missing, invalidate and retry once
      if (col === 'user_id' && /column.*does not exist/i.test(error.message)) {
        cachedCol = 'profile_id'
        const retry = await sb.from('artist_likes').insert({ artist_id: artistId, profile_id: userId })
        if (retry.error) return jsonErr(`Nepavyko išsaugoti: ${retry.error.message}`, 500, { col: 'profile_id' })
      } else {
        return jsonErr(`Nepavyko išsaugoti: ${error.message}`, 500, { col })
      }
    }
  }

  const { count } = await sb
    .from('artist_likes')
    .select('*', { count: 'exact', head: true })
    .eq('artist_id', artistId)

  return NextResponse.json({ liked: !existing, count: count || 0, col: cachedCol })
}
