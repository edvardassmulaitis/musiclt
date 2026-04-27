// app/api/artists/[id]/like/route.ts
//
// Artist like toggle. Vieninga `likes` lentelė pakeitė atskiras
// artist_likes / anon_artist_likes / legacy_likes lenteles.
//
// Trys atvejai (vienoje lentelėje, atskiras `source` discriminator'iu):
//
//  - **Auth user** (NextAuth session): resolve'ina profiles.id, INSERT'ina
//    su user_id + user_username (denormalized snapshot). source='auth'.
//
//  - **Anonymous** (httpOnly UUID cookie ml_anon_id): INSERT'ina su anon_id
//    + pseudo username 'anon_<8chars>'. source='anon'.
//
//  - **Music.lt scrape** (legacy_scrape) — niekur čia nerašom; importuoja
//    scraper'is su user_id=NULL ir tikru music.lt username. source='legacy_scrape'.
//
// Dedupe per `UNIQUE (entity_type, entity_id, user_username)` — toks pat
// pavadinimas užregistravęsi user'is bus matched į ghost row pagal username
// ir merge'inamas (per ateities claim flow).

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { randomUUID } from 'crypto'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

const ANON_COOKIE = 'ml_anon_id'
const ANON_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

function jsonErr(msg: string, status = 500, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: msg, ...(extra || {}) }, { status })
}

function isValidUuid(v: string | undefined | null): v is string {
  return !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

async function readAnonCookie(): Promise<string | null> {
  const store = await cookies()
  const v = store.get(ANON_COOKIE)?.value
  return isValidUuid(v) ? v : null
}

async function resolveProfile(
  sb: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<{ id: string; username: string } | null> {
  const { data } = await sb.from('profiles').select('id, username').eq('email', email).maybeSingle()
  if (!data?.id) return null
  return { id: data.id, username: data.username || `user_${String(data.id).slice(0, 8)}` }
}

/** Total like count for an artist — single SELECT iš unified likes lentelės. */
async function getTotalCount(
  sb: ReturnType<typeof createAdminClient>,
  artistId: number,
): Promise<number> {
  const { count } = await sb
    .from('likes')
    .select('*', { count: 'exact', head: true })
    .eq('entity_type', 'artist')
    .eq('entity_id', artistId)
  return count || 0
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
    const profile = await resolveProfile(sb, session.user.email)
    if (profile) {
      const { data } = await sb
        .from('likes')
        .select('id')
        .eq('entity_type', 'artist')
        .eq('entity_id', artistId)
        .eq('user_id', profile.id)
        .limit(1)
        .maybeSingle()
      liked = !!data
    }
  } else {
    const anonId = await readAnonCookie()
    if (anonId) {
      const { data } = await sb
        .from('likes')
        .select('id')
        .eq('entity_type', 'artist')
        .eq('entity_id', artistId)
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

// ── POST: toggles like ────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const artistId = parseInt(id)
  if (isNaN(artistId)) return jsonErr('Blogas artist id', 400)

  const sb = createAdminClient()
  const session = await getServerSession(authOptions)

  // ── Auth branch ──
  if (session?.user?.email) {
    const profile = await resolveProfile(sb, session.user.email)
    if (!profile) {
      return jsonErr('Tavo profilis dar nesukurtas — atsijunk ir prisijunk iš naujo', 500)
    }

    const { data: existing } = await sb
      .from('likes')
      .select('id')
      .eq('entity_type', 'artist')
      .eq('entity_id', artistId)
      .eq('user_id', profile.id)
      .limit(1)
      .maybeSingle()

    if (existing) {
      const { error } = await sb.from('likes').delete().eq('id', existing.id)
      if (error) return jsonErr(`Nepavyko pašalinti: ${error.message}`, 500)
    } else {
      const { error } = await sb.from('likes').insert({
        entity_type: 'artist',
        entity_id: artistId,
        user_id: profile.id,
        user_username: profile.username,
        source: 'auth',
      })
      if (error) {
        // Username collision (e.g. ghost user su tuo pačiu username) → atnaujinam
        // existing eilutę su user_id (claim).
        if (error.code === '23505') {
          await sb.from('likes')
            .update({ user_id: profile.id, source: 'auth' })
            .eq('entity_type', 'artist')
            .eq('entity_id', artistId)
            .eq('user_username', profile.username)
        } else {
          return jsonErr(`Nepavyko išsaugoti: ${error.message}`, 500)
        }
      }
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

  const { data: existing } = await sb
    .from('likes')
    .select('id')
    .eq('entity_type', 'artist')
    .eq('entity_id', artistId)
    .eq('anon_id', anonId)
    .limit(1)
    .maybeSingle()

  let firstAnon = false
  if (existing) {
    const { error } = await sb.from('likes').delete().eq('id', existing.id)
    if (error) return jsonErr(`Nepavyko pašalinti (anon): ${error.message}`, 500)
  } else {
    const { error } = await sb.from('likes').insert({
      entity_type: 'artist',
      entity_id: artistId,
      anon_id: anonId,
      user_username: `anon_${String(anonId).slice(0, 8)}`,
      user_agent: userAgent,
      source: 'anon',
    })
    if (error && error.code !== '23505') {
      return jsonErr(`Nepavyko išsaugoti (anon): ${error.message}`, 500)
    }
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
