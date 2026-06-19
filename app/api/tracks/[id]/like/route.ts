// app/api/tracks/[id]/like/route.ts
//
// Track like toggle — mirrors /api/albums/[id]/like, tik entity_type='track'.
// Iki šiol track puslapio / modalo LikePill buvo TIK vizualus toggle
// (nepersistinamas) — dabar pilnas auth + anon flow kaip albumams.

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { randomUUID } from 'crypto'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-logger'

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

// SVARBU: pirmiausia naudojam session.user.id (== profiles.id), nes el. pašto
// paieška `.eq('email')` buvo case-sensitive IR lūždavo (maybeSingle) esant
// dublikatams → grąžindavo null → POST 500 → „like" atsispausdavo. ID paieška
// patikima; email lieka tik fallback (ilike + limit 1).
async function resolveProfile(
  sb: ReturnType<typeof createAdminClient>,
  session: any,
): Promise<{ id: string; username: string } | null> {
  const uid = session?.user?.id as string | undefined
  if (uid) {
    const { data } = await sb.from('profiles').select('id, username').eq('id', uid).maybeSingle()
    if (data?.id) return { id: data.id, username: data.username || `user_${String(data.id).slice(0, 8)}` }
  }
  const email = session?.user?.email as string | undefined
  if (email) {
    const { data } = await sb.from('profiles').select('id, username')
      .ilike('email', email.trim().toLowerCase()).order('created_at', { ascending: true }).limit(1).maybeSingle()
    if (data?.id) return { id: data.id, username: data.username || `user_${String(data.id).slice(0, 8)}` }
  }
  return null
}

async function getTotalCount(
  sb: ReturnType<typeof createAdminClient>,
  trackId: number,
): Promise<number> {
  const { count } = await sb
    .from('likes')
    .select('*', { count: 'exact', head: true })
    .eq('entity_type', 'track')
    .eq('entity_id', trackId)
  return count || 0
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const trackId = parseInt(id)
  if (isNaN(trackId)) return jsonErr('Blogas track id', 400)
  const sb = createAdminClient()
  const session = await getServerSession(authOptions)

  let liked = false
  let anonymous = false

  if (session?.user?.email) {
    const profile = await resolveProfile(sb, session)
    if (profile) {
      const { data } = await sb
        .from('likes')
        .select('id')
        .eq('entity_type', 'track')
        .eq('entity_id', trackId)
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
        .eq('entity_type', 'track')
        .eq('entity_id', trackId)
        .eq('anon_id', anonId)
        .limit(1)
        .maybeSingle()
      liked = !!data
      anonymous = true
    }
  }

  const count = await getTotalCount(sb, trackId)
  return NextResponse.json({ liked, count, anonymous })
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const trackId = parseInt(id)
  if (isNaN(trackId)) return jsonErr('Blogas track id', 400)

  const sb = createAdminClient()
  const session = await getServerSession(authOptions)

  if (session?.user?.email) {
    const profile = await resolveProfile(sb, session)
    if (!profile) {
      return jsonErr('Tavo profilis dar nesukurtas — atsijunk ir prisijunk iš naujo', 500)
    }

    const { data: existing } = await sb
      .from('likes')
      .select('id')
      .eq('entity_type', 'track')
      .eq('entity_id', trackId)
      .eq('user_id', profile.id)
      .limit(1)
      .maybeSingle()

    if (existing) {
      const { error } = await sb.from('likes').delete().eq('id', existing.id)
      if (error) return jsonErr(`Nepavyko pašalinti: ${error.message}`, 500)
    } else {
      const { error } = await sb.from('likes').insert({
        entity_type: 'track',
        entity_id: trackId,
        user_id: profile.id,
        user_username: profile.username,
      })
      if (error) {
        if (error.code === '23505') {
          await sb.from('likes')
            .update({ user_id: profile.id })
            .eq('entity_type', 'track')
            .eq('entity_id', trackId)
            .eq('user_username', profile.username)
        } else {
          return jsonErr(`Nepavyko išsaugoti: ${error.message}`, 500)
        }
      }
    }

    const count = await getTotalCount(sb, trackId)

    if (!existing) {
      try {
        const { data: track } = await sb
          .from('tracks')
          .select('title, slug, artist_id, artists:artist_id(slug, name, cover_image_url)')
          .eq('id', trackId)
          .maybeSingle() as { data: any }
        if (track) {
          const artistSlug = track.artists?.slug
          const url = artistSlug && track.slug
            ? `/dainos/${artistSlug}-${track.slug}-${trackId}`
            : `/dainos/${trackId}`
          await logActivity({
            event_type: 'track_like',
            user_id: profile.id,
            actor_name: session.user.name || profile.username,
            actor_avatar: session.user.image || null,
            entity_type: 'track',
            entity_id: trackId,
            entity_title: `${track.title}${track.artists?.name ? ' — ' + track.artists.name : ''}`,
            entity_url: url,
            entity_image: track.artists?.cover_image_url || null,
          })
        }
      } catch (e: any) {
        console.error('[activity-log] track_like failed:', e?.message || e)
      }
    }

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

  const { data: existing } = await sb
    .from('likes')
    .select('id')
    .eq('entity_type', 'track')
    .eq('entity_id', trackId)
    .eq('anon_id', anonId)
    .limit(1)
    .maybeSingle()

  let firstAnon = false
  if (existing) {
    const { error } = await sb.from('likes').delete().eq('id', existing.id)
    if (error) return jsonErr(`Nepavyko pašalinti (anon): ${error.message}`, 500)
  } else {
    const { error } = await sb.from('likes').insert({
      entity_type: 'track',
      entity_id: trackId,
      anon_id: anonId,
      user_username: `anon_${String(anonId).slice(0, 8)}`,
    })
    if (error && error.code !== '23505') {
      return jsonErr(`Nepavyko išsaugoti (anon): ${error.message}`, 500)
    }
    firstAnon = cookieIsFresh
  }

  const count = await getTotalCount(sb, trackId)
  return NextResponse.json({
    liked: !existing,
    count,
    anonymous: true,
    firstAnon,
  })
}
