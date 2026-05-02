// app/api/notifications/route.ts
//
// In-app notifications endpoint.
//   GET   /api/notifications?limit=20[&unread_only=1]   — list + unread count
//   PATCH /api/notifications                            — mark read (id arba all)
//   DELETE /api/notifications?id=<id>                   — atsisakyti vieno
//
// Defensyvus prieš missing migration: jei `notifications` lentelės dar nėra,
// grąžina tuščią sąrašą + count=0 (nesvaido 500'tų), kad header bell ikona
// veiktų net iki migracijos aplikavimo.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

function isMissingTable(msg: string | null | undefined) {
  return !!msg && /relation .* does not exist|does not exist/i.test(msg)
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id
  if (!userId) {
    return NextResponse.json({ notifications: [], unread_count: 0, authenticated: false })
  }

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
  const unreadOnly = searchParams.get('unread_only') === '1'

  const sb = createAdminClient()

  // Chat-related notifications (chat_message, chat_reaction, chat_thread_reply)
  // turi savo "kanalą" — MessagesBell unread badge ir /pokalbiai sąraše. Į
  // bendrą NotificationsBell list'ą jų netraukiam, kad neduplikatų.
  const CHAT_TYPES = ['chat_message', 'chat_reaction', 'chat_thread_reply']

  let query = sb
    .from('notifications')
    .select('id, type, actor_id, actor_username, actor_full_name, actor_avatar_url, entity_type, entity_id, url, title, snippet, data, read_at, created_at')
    .eq('user_id', userId)
    .not('type', 'in', `(${CHAT_TYPES.join(',')})`)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (unreadOnly) query = query.is('read_at', null)

  const { data, error } = await query
  if (error) {
    if (isMissingTable(error.message)) {
      return NextResponse.json({ notifications: [], unread_count: 0, authenticated: true })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Unread count — atskira užklausa, taip pat be chat tipų.
  const { count: unreadCount, error: countErr } = await sb
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('type', 'in', `(${CHAT_TYPES.join(',')})`)
    .is('read_at', null)

  return NextResponse.json({
    notifications: data || [],
    unread_count: countErr ? 0 : (unreadCount || 0),
    authenticated: true,
  })
}

/**
 * PATCH body:
 *   { id: number }       — pažymėti vieną kaip skaitytą
 *   { ids: number[] }    — pažymėti kelis
 *   { all: true }        — pažymėti visus user'io kaip skaitytus
 */
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id
  if (!userId) return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const sb = createAdminClient()
  const now = new Date().toISOString()

  let q = sb.from('notifications').update({ read_at: now }).eq('user_id', userId).is('read_at', null)

  if (body.all === true) {
    // pažymim visus
  } else if (Array.isArray(body.ids) && body.ids.length > 0) {
    q = q.in('id', body.ids.map(Number).filter((n: number) => !isNaN(n)))
  } else if (body.id) {
    q = q.eq('id', Number(body.id))
  } else {
    return NextResponse.json({ error: 'Pateik id, ids arba all' }, { status: 400 })
  }

  const { error } = await q
  if (error) {
    if (isMissingTable(error.message)) return NextResponse.json({ ok: true })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id
  if (!userId) return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Reikia ?id=' }, { status: 400 })

  const sb = createAdminClient()
  const { error } = await sb
    .from('notifications')
    .delete()
    .eq('user_id', userId)
    .eq('id', Number(id))

  if (error) {
    if (isMissingTable(error.message)) return NextResponse.json({ ok: true })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
