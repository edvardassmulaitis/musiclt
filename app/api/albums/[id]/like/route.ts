// app/api/albums/[id]/like/route.ts
//
// Album like toggle — mirrors /api/artists/[id]/like, just with
// entity_type='album'. Same source discriminators (auth / anon /
// legacy_scrape), same UNIQUE (entity_type, entity_id, user_username)
// dedupe rule. See artist version for full rationale.

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

async function getTotalCount(
  sb: ReturnType<typeof createAdminClient>,
  albumId: number,
): Promise<number> {
  const { count } = await sb
    .from('likes')
    .select('*', { count: 'exact', head: true })
    .eq('entity_type', 'album')
    .eq('entity_id', albumId)
  return count || 0
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const albumId = parseInt(id)
  if (isNaN(albumId)) return jsonErr('Blogas album id', 400)
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
        .eq('entity_type', 'album')
        .eq('entity_id', albumId)
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
        .eq('entity_type', 'album')
        .eq('entity_id', albumId)
        .eq('anon_id', anonId)
        .limit(1)
        .maybeSingle()
      liked = !!data
      anonymous = true
    }
  }

  const count = await getTotalCount(sb, albumId)
  return NextResponse.json({ liked, count, anonymous })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const albumId = parseInt(id)
  if (isNaN(albumId)) return jsonErr('Blogas album id', 400)

  const sb = createAdminClient()
  const session = await getServerSession(authOptions)

  if (session?.user?.email) {
    const profile = await resolveProfile(sb, session.user.email)
    if (!profile) {
      return jsonErr('Tavo profilis dar nesukurtas — atsijunk ir prisijunk iš naujo', 500)
    }

    const { data: existing } = await sb
      .from('likes')
      .select('id')
      .eq('entity_type', 'album')
      .eq('entity_id', albumId)
      .eq('user_id', profile.id)
      .limit(1)
      .maybeSingle()

    if (existing) {
      const { error } = await sb.from('likes').delete().eq('id', existing.id)
      if (error) return jsonErr(`Nepavyko pašalinti: ${error.message}`, 500)
    } else {
      const { error } = await sb.from('likes').insert({
        entity_type: 'album',
        entity_id: albumId,
        user_id: profile.id,
        user_username: profile.username,
        source: 'auth',
      })
      if (error) {
        if (error.code === '23505') {
          await sb.from('likes')
            .update({ user_id: profile.id, source: 'auth' })
            .eq('entity_type', 'album')
            .eq('entity_id', albumId)
            .eq('user_username', profile.username)
        } else {
          return jsonErr(`Nepavyko išsaugoti: ${error.message}`, 500)
        }
      }
    }

    const count = await getTotalCount(sb, albumId)
    return NextResponse.json({ liked: !existing, count, anonymous: false })
  }

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
    .eq('entity_type', 'album')
    .eq('entity_id', albumId)
    .eq('anon_id', anonId)
    .limit(1)
    .maybeSingle()

  let firstAnon = false
  if (existing) {
    const { error } = await sb.from('likes').delete().eq('id', existing.id)
    if (error) return jsonErr(`Nepavyko pašalinti (anon): ${error.message}`, 500)
  } else {
    const { error } = await sb.from('likes').insert({
      entity_type: 'album',
      entity_id: albumId,
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

  const count = await getTotalCount(sb, albumId)
  return NextResponse.json({
    liked: !existing,
    count,
    anonymous: true,
    firstAnon,
  })
}
