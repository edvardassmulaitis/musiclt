// app/api/artists/[id]/like/route.ts
// Toggle endpoint for artist likes (artist_likes: artist_id + user_id → profiles.id).
//
// IMPORTANT: we don't trust session.user.id directly — stale sessions from
// before the FK migration can still carry an id that doesn't exist in
// profiles. Instead we look up the profile by email on every request, which
// is always current.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

function jsonErr(msg: string, status = 500, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: msg, ...(extra || {}) }, { status })
}

/** Resolve the profiles.id row for the signed-in user from their email.
 *  Returns null if no profile row exists yet. */
async function resolveProfileId(
  sb: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<string | null> {
  const { data } = await sb.from('profiles').select('id').eq('email', email).maybeSingle()
  return data?.id || null
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

  const { count } = await sb
    .from('artist_likes')
    .select('*', { count: 'exact', head: true })
    .eq('artist_id', artistId)

  let liked = false
  if (session?.user?.email) {
    const profileId = await resolveProfileId(sb, session.user.email)
    if (profileId) {
      const { data } = await sb
        .from('artist_likes')
        .select('*')
        .eq('artist_id', artistId)
        .eq('user_id', profileId)
        .limit(1)
        .maybeSingle()
      liked = !!data
    }
  }

  return NextResponse.json({ liked, count: count || 0 })
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return jsonErr('Prisijunk, kad galėtum įdėti patinka', 401)
  }
  const { id } = await params
  const artistId = parseInt(id)
  if (isNaN(artistId)) return jsonErr('Blogas artist id', 400)

  const sb = createAdminClient()
  const profileId = await resolveProfileId(sb, session.user.email)
  if (!profileId) {
    return jsonErr('Tavo profilis dar nesukurtas — atsijunk ir prisijunk iš naujo', 500)
  }

  // Check existing
  const { data: existing, error: checkErr } = await sb
    .from('artist_likes')
    .select('*')
    .eq('artist_id', artistId)
    .eq('user_id', profileId)
    .limit(1)
    .maybeSingle()

  if (checkErr && checkErr.code !== 'PGRST116') {
    return jsonErr(`Nepavyko patikrinti: ${checkErr.message}`, 500, { sessionEmail: session.user.email })
  }

  if (existing) {
    const { error } = await sb.from('artist_likes')
      .delete()
      .eq('artist_id', artistId)
      .eq('user_id', profileId)
    if (error) return jsonErr(`Nepavyko pašalinti: ${error.message}`, 500)
  } else {
    const { error } = await sb.from('artist_likes')
      .insert({ artist_id: artistId, user_id: profileId })
    if (error) {
      return jsonErr(`Nepavyko išsaugoti: ${error.message}`, 500, {
        profileId,
        hint: 'Jei FK klaida — migracija artist_likes FK → profiles dar neatlikta arba nepritaikyta',
      })
    }
  }

  const { count } = await sb
    .from('artist_likes')
    .select('*', { count: 'exact', head: true })
    .eq('artist_id', artistId)

  return NextResponse.json({ liked: !existing, count: count || 0 })
}
