// app/api/push/subscribe/route.ts
//
// Web Push subscription registration:
//   POST   { subscription: PushSubscriptionJSON } — saugom user'iui
//   DELETE { endpoint }                          — pašalinam vieną device
//
// Browser flow:
//   1. user'is paspaudžia "Įjungti push" mygtuką
//   2. JS prašo Notification.requestPermission()
//   3. service worker pushManager.subscribe({applicationServerKey: VAPID_PUB})
//   4. POST'inam grąžintą subscription objektą čia
//
// Public key client'ui ateina per /api/push/vapid-public-key (atskira ruta).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

function isMissingTable(msg: string | null | undefined) {
  return !!msg && /relation .* does not exist|does not exist/i.test(msg)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id
  if (!userId) return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const sub = body.subscription
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return NextResponse.json({ error: 'Bloga subscription struktūra' }, { status: 400 })
  }

  const sb = createAdminClient()
  const ua = req.headers.get('user-agent')

  // Upsert pagal endpoint (UNIQUE) — jeigu user pakartotinai subscribe'ina,
  // refreshinam last_seen.
  const { error } = await sb
    .from('push_subscriptions')
    .upsert({
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      user_agent: ua,
      last_seen: new Date().toISOString(),
    }, { onConflict: 'endpoint' })

  if (error) {
    if (isMissingTable(error.message)) return NextResponse.json({ ok: true, persisted: false })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id
  if (!userId) return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const endpoint = body.endpoint
  if (!endpoint) return NextResponse.json({ error: 'Reikia endpoint' }, { status: 400 })

  const sb = createAdminClient()
  const { error } = await sb
    .from('push_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('endpoint', endpoint)
  if (error) {
    if (isMissingTable(error.message)) return NextResponse.json({ ok: true })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

// GET: ar šis endpoint jau registruotas šiam user'iui?
//   GET /api/push/subscribe?endpoint=... → { subscribed: bool }
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id
  if (!userId) return NextResponse.json({ subscribed: false })

  const { searchParams } = new URL(req.url)
  const endpoint = searchParams.get('endpoint')
  if (!endpoint) return NextResponse.json({ subscribed: false })

  const sb = createAdminClient()
  const { data, error } = await sb
    .from('push_subscriptions')
    .select('id')
    .eq('user_id', userId)
    .eq('endpoint', endpoint)
    .maybeSingle()
  if (error) return NextResponse.json({ subscribed: false })
  return NextResponse.json({ subscribed: !!data })
}
