// app/api/artists/[id]/like/route.ts
//
// Artist like toggle. Two paths depending on auth:
//
//  - Signed-in user (NextAuth session): resolves profiles.id by email, writes
//    to artist_likes. FK: user_id → profiles.id. Weight = 1.
//
//  - Anonymous visitor: identified by an httpOnly UUID cookie (ml_anon_id),
//    writes to anon_artist_likes. Unique (artist_id, anon_id) so a device can
//    only like an artist once. Lower weight signal, but still counted so the
//    user gets immediate feedback. user_agent stored for abuse triage /
//    anon-trend analytics; no IPs persisted.
//
// Returned count = registered + anonymous combined. Client decides whether to
// surface a "sign-in to make it count more" nudge based on the `anonymous` flag.

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { randomUUID } from 'crypto'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

const ANON_COOKIE = 'ml_anon_id'
const ANON_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 year

function jsonErr(msg: string, status = 500, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: msg, ...(extra || {}) }, { status })
}

function isValidUuid(v: string | undefined | null): v is string {
  return !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

/** Read existing anon cookie (doesn't create). */
async function readAnonCookie(): Promise<string | null> {
  const store = await cookies()
  const v = store.get(ANON_COOKIE)?.value
  return isValidUuid(v) ? v : null
}

/** Resolve profiles.id from signed-in user's email. Null if not signed in or
 *  profile row missing. */
async function resolveProfileId(
  sb: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<string | null> {
  const { data } = await sb.from('profiles').select('id').eq('email', email).maybeSingle()
  return data?.id || null
}

/** Aggregate counts for an artist across both modern + anonymous tables. */
async function getTotalCount(
  sb: ReturnType<typeof createAdminClient>,
  artistId: number,
): Promise<number> {
  const [regular, anon] = await Promise.all([
    sb.from('artist_likes').select('*', { count: 'exact', head: true }).eq('artist_id', artistId),
    sb.from('anon_artist_likes').select('*', { count: 'exact', head: true }).eq('artist_id', artistId),
  ])
  return (regular.count || 0) + (anon.count || 0)
}

// ── GET: returns { liked, count, anonymous } for the current viewer ────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const artistId = parseInt(id)
  if (isNaN(artistId)) return jsonErr('Blogas artist id', 400)
  const sb = createAdminClient()
  const session = await getServerSession(authOptions)

  let liked = false
  let anonymous = false

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
  } else {
    const anonId = await readAnonCookie()
    if (anonId) {
      const { data } = await sb
        .from('anon_artist_likes')
        .select('id')
        .eq('artist_id', artistId)
        .eq('anon_id', anonId)
        .limit(1)
        .maybeSingle()
      liked = !!data
      anonymous = true
    }
  }

  const count = await getTotalCount(sb, artistId)
  return NextResponse.json({ liked, count, anonymous })
}

// ── POST: toggles like, returns { liked, count, anonymous, firstAnon? } ─

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const artistId = parseInt(id)
  if (isNaN(artistId)) return jsonErr('Blogas artist id', 400)

  const sb = createAdminClient()
  const session = await getServerSession(authOptions)

  // ── Signed-in branch ──
  if (session?.user?.email) {
    const profileId = await resolveProfileId(sb, session.user.email)
    if (!profileId) {
      return jsonErr('Tavo profilis dar nesukurtas — atsijunk ir prisijunk iš naujo', 500)
    }

    const { data: existing, error: checkErr } = await sb
      .from('artist_likes')
      .select('*')
      .eq('artist_id', artistId)
      .eq('user_id', profileId)
      .limit(1)
      .maybeSingle()
    if (checkErr && checkErr.code !== 'PGRST116') {
      return jsonErr(`Nepavyko patikrinti: ${checkErr.message}`, 500)
    }

    if (existing) {
      const { error } = await sb.from('artist_likes').delete().eq('artist_id', artistId).eq('user_id', profileId)
      if (error) return jsonErr(`Nepavyko pašalinti: ${error.message}`, 500)
    } else {
      const { error } = await sb.from('artist_likes').insert({ artist_id: artistId, user_id: profileId })
      if (error) return jsonErr(`Nepavyko išsaugoti: ${error.message}`, 500, { hint: 'Patikrink artist_likes FK į profiles' })
    }

    const count = await getTotalCount(sb, artistId)
    return NextResponse.json({ liked: !existing, count, anonymous: false })
  }

  // ── Anonymous branch — identify by cookie ──
  const store = await cookies()
  let anonId = store.get(ANON_COOKIE)?.value
  let cookieIsFresh = false
  if (!isValidUuid(anonId)) {
    anonId = randomUUID()
    cookieIsFresh = true
    store.set(ANON_COOKIE, anonId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: ANON_COOKIE_MAX_AGE,
      path: '/',
    })
  }

  const userAgent = req.headers.get('user-agent')?.slice(0, 500) || null

  const { data: existing, error: checkErr } = await sb
    .from('anon_artist_likes')
    .select('id')
    .eq('artist_id', artistId)
    .eq('anon_id', anonId)
    .limit(1)
    .maybeSingle()
  if (checkErr && checkErr.code !== 'PGRST116') {
    return jsonErr(`Nepavyko patikrinti (anon): ${checkErr.message}`, 500)
  }

  let firstAnon = false
  if (existing) {
    const { error } = await sb.from('anon_artist_likes').delete().eq('artist_id', artistId).eq('anon_id', anonId)
    if (error) return jsonErr(`Nepavyko pašalinti (anon): ${error.message}`, 500)
  } else {
    const { error } = await sb.from('anon_artist_likes').insert({
      artist_id: artistId,
      anon_id: anonId,
      user_agent: userAgent,
    })
    if (error) {
      // Unique violation means double-click raced — treat as success since row exists
      if (error.code !== '23505') {
        return jsonErr(`Nepavyko išsaugoti (anon): ${error.message}`, 500, {
          hint: 'Jei table nerasta — paleisk 20260424b_anon_artist_likes.sql',
        })
      }
    }
    // First-ever anon like from this device — we show a "you're not signed in" nudge once.
    firstAnon = cookieIsFresh
  }

  const count = await getTotalCount(sb, artistId)
  return NextResponse.json({
    liked: !existing,
    count,
    anonymous: true,
    firstAnon,
  })
}
