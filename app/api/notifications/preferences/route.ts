// app/api/notifications/preferences/route.ts
//
// Per-user, per-type notification toggles.
//   GET    → grąžina visų user'io preferences (rows kur enabled=false jam ar
//            kurios buvo bet kada touched). Frontend'as derina su default'ais.
//   PATCH  → upsert {type, enabled}.
//
// Defensyvus prieš missing migration (notification_preferences lentelė).
// Jeigu lentelės nėra — GET grąžina tuščią array'ų, PATCH grąžina ok=true.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

function isMissingTable(msg: string | null | undefined) {
  return !!msg && /relation .* does not exist|does not exist/i.test(msg)
}

const ALLOWED_TYPES = new Set([
  'comment_reply', 'entity_comment',
  'comment_like', 'blog_like', 'blog_comment',
  'favorite_artist_track', 'daily_song_winner', 'system',
])

export async function GET() {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id
  if (!userId) {
    return NextResponse.json({ preferences: [], authenticated: false })
  }
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('notification_preferences')
    .select('type, enabled, updated_at')
    .eq('user_id', userId)
  if (error) {
    if (isMissingTable(error.message)) return NextResponse.json({ preferences: [] })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ preferences: data || [] })
}

/**
 * PATCH body:
 *   { type: 'comment_like', enabled: false }
 *   { items: [{type, enabled}, ...] }   — bulk
 */
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id
  if (!userId) return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const items: Array<{ type: string; enabled: boolean }> = Array.isArray(body.items)
    ? body.items
    : (body.type ? [{ type: body.type, enabled: !!body.enabled }] : [])

  if (items.length === 0) {
    return NextResponse.json({ error: 'Reikia type ir enabled' }, { status: 400 })
  }

  const sanitized = items
    .filter(it => ALLOWED_TYPES.has(it.type))
    .map(it => ({
      user_id: userId,
      type: it.type,
      enabled: !!it.enabled,
      updated_at: new Date().toISOString(),
    }))

  if (sanitized.length === 0) {
    return NextResponse.json({ error: 'Nė vieno galiojančio type' }, { status: 400 })
  }

  const sb = createAdminClient()
  const { error } = await sb
    .from('notification_preferences')
    .upsert(sanitized, { onConflict: 'user_id,type' })

  if (error) {
    if (isMissingTable(error.message)) return NextResponse.json({ ok: true, applied: 0 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, applied: sanitized.length })
}
