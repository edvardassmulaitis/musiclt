// app/api/tracks/[id]/drops/route.ts
//
// Track drops (emoji reactions): 🔥 fire / 🐐 goat / 😭 cry / 😬 yikes.
// Vienas reactor (auth user ARBA anon session) = 1 drop per track. Click
// kitos emoji = perjungia (delete + insert).
//
// Anonim'ams identity = HTTPOnly cookie `mlt_drop_fp` (UUID, set first time
// useris paliečia šitą endpoint'ą). Auth'iniams identity = profiles.id.
//
// GET — grąžina counts per emoji + viewer's selection.
// POST — body: { emoji: 'fire'|'goat'|'cry'|'yikes' | null }. null = ištrinti.

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveAuthorId } from '@/lib/resolve-author'

const VALID_EMOJIS = ['fire', 'goat', 'cry', 'yikes'] as const
type DropEmoji = (typeof VALID_EMOJIS)[number]
const FP_COOKIE = 'mlt_drop_fp'
const FP_MAX_AGE = 60 * 60 * 24 * 365 * 2  // 2 metai

/** Genuoja paprastą UUID v4 (be crypto.randomUUID dependency dėl SSR
 *  env stabilumo — vidiniame Math.random pakanka, mums nereikia
 *  cryptographically strong identity, tik stable session id). */
function genFp(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

async function resolveIdentity(): Promise<{
  userId: string | null
  fp: string | null
  setCookie: string | null
}> {
  const session = await getServerSession(authOptions)
  const sb = createAdminClient()
  const userId = await resolveAuthorId(sb, session)
  if (userId) {
    return { userId, fp: null, setCookie: null }
  }
  // Anon — get/set fingerprint cookie
  const cookieStore = await cookies()
  const existing = cookieStore.get(FP_COOKIE)?.value
  if (existing && /^[0-9a-f-]{20,}$/i.test(existing)) {
    return { userId: null, fp: existing, setCookie: null }
  }
  const fresh = genFp()
  return { userId: null, fp: fresh, setCookie: fresh }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const trackId = parseInt(id)
  if (isNaN(trackId)) {
    return NextResponse.json({ error: 'Invalid track id' }, { status: 400 })
  }
  const sb = createAdminClient()

  // Counts per emoji
  const { data: countsData, error: countsErr } = await sb
    .from('track_drops')
    .select('emoji')
    .eq('track_id', trackId)
  if (countsErr) {
    console.error('[drops GET]', countsErr.message)
    return NextResponse.json({
      counts: { fire: 0, goat: 0, cry: 0, yikes: 0 },
      viewer_emoji: null,
      total: 0,
    })
  }
  const counts: Record<DropEmoji, number> = { fire: 0, goat: 0, cry: 0, yikes: 0 }
  for (const r of countsData || []) {
    if (VALID_EMOJIS.includes(r.emoji as DropEmoji)) {
      counts[r.emoji as DropEmoji]++
    }
  }
  const total = counts.fire + counts.goat + counts.cry + counts.yikes

  // Viewer's selection
  const { userId, fp, setCookie } = await resolveIdentity()
  let viewerEmoji: DropEmoji | null = null
  if (userId) {
    const { data } = await sb
      .from('track_drops')
      .select('emoji')
      .eq('track_id', trackId)
      .eq('user_id', userId)
      .maybeSingle() as { data: { emoji: DropEmoji } | null }
    if (data?.emoji && VALID_EMOJIS.includes(data.emoji)) viewerEmoji = data.emoji
  } else if (fp) {
    const { data } = await sb
      .from('track_drops')
      .select('emoji')
      .eq('track_id', trackId)
      .eq('session_fp', fp)
      .is('user_id', null)
      .maybeSingle() as { data: { emoji: DropEmoji } | null }
    if (data?.emoji && VALID_EMOJIS.includes(data.emoji)) viewerEmoji = data.emoji
  }

  const res = NextResponse.json({ counts, viewer_emoji: viewerEmoji, total })
  if (setCookie) {
    res.cookies.set(FP_COOKIE, setCookie, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: FP_MAX_AGE,
      path: '/',
    })
  }
  return res
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const trackId = parseInt(id)
  if (isNaN(trackId)) {
    return NextResponse.json({ error: 'Invalid track id' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const requested = body?.emoji
  // Allow null (delete viewer's drop) or one of the valid emojis.
  if (requested !== null && !VALID_EMOJIS.includes(requested)) {
    return NextResponse.json({ error: 'Invalid emoji' }, { status: 400 })
  }

  const sb = createAdminClient()
  const { userId, fp, setCookie } = await resolveIdentity()

  // Find existing drop for this identity + track
  let existingId: number | null = null
  if (userId) {
    const { data } = await sb
      .from('track_drops')
      .select('id')
      .eq('track_id', trackId)
      .eq('user_id', userId)
      .maybeSingle() as { data: { id: number } | null }
    existingId = data?.id ?? null
  } else if (fp) {
    const { data } = await sb
      .from('track_drops')
      .select('id')
      .eq('track_id', trackId)
      .eq('session_fp', fp)
      .is('user_id', null)
      .maybeSingle() as { data: { id: number } | null }
    existingId = data?.id ?? null
  } else {
    return NextResponse.json({ error: 'No identity' }, { status: 500 })
  }

  // Logic:
  //  - requested === null  →  delete existing (toggle off)
  //  - existingId exists   →  update emoji (switch reaction)
  //  - else                →  insert new
  if (requested === null) {
    if (existingId) {
      await sb.from('track_drops').delete().eq('id', existingId)
    }
  } else if (existingId) {
    await sb.from('track_drops').update({ emoji: requested, created_at: new Date().toISOString() }).eq('id', existingId)
  } else {
    const insertRow: Record<string, unknown> = {
      track_id: trackId,
      emoji: requested,
    }
    if (userId) insertRow.user_id = userId
    else insertRow.session_fp = fp
    await sb.from('track_drops').insert(insertRow)
  }

  // Re-fetch counts so client gets up-to-date numbers in one round trip
  const { data: countsData } = await sb
    .from('track_drops')
    .select('emoji')
    .eq('track_id', trackId)
  const counts: Record<DropEmoji, number> = { fire: 0, goat: 0, cry: 0, yikes: 0 }
  for (const r of countsData || []) {
    if (VALID_EMOJIS.includes(r.emoji as DropEmoji)) {
      counts[r.emoji as DropEmoji]++
    }
  }
  const total = counts.fire + counts.goat + counts.cry + counts.yikes

  const res = NextResponse.json({
    counts,
    viewer_emoji: requested === null ? null : requested,
    total,
  })
  if (setCookie) {
    res.cookies.set(FP_COOKIE, setCookie, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: FP_MAX_AGE,
      path: '/',
    })
  }
  return res
}
