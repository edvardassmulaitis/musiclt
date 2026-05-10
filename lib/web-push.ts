// lib/web-push.ts
//
// Server-side Web Push helper. Naudojam web-push npm lib'ą su VAPID
// autentifikacija. Visi browser endpoint'ai (Chrome FCM, Firefox autopush,
// Safari APNs gateway) kalbasi tuo pačiu protokolu.
//
// Env vars (Vercel):
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY  — viešas, išsaugomas client'e
//   VAPID_PRIVATE_KEY             — slaptas, server only
//   VAPID_SUBJECT                 — mailto:admin@... arba https://musiclt.vercel.app
//
// Defensyvus dizainas: jeigu env vars nesukonfigūruoti — sendPushToUser
// silently grąžina 0 (loginimui), niekada netraukia exception'o. Taip
// galima saugiai deploy'inti kodą prieš sukonfigūruojant Vercel env vars.

import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase'

let vapidConfigured = false
let vapidConfigError: string | null = null

function ensureVapid(): boolean {
  if (vapidConfigured) return true
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@musiclt.vercel.app'
  if (!pub || !priv) {
    vapidConfigError = 'VAPID keys nenustatyti env vars\'uose'
    return false
  }
  try {
    webpush.setVapidDetails(subject, pub, priv)
    vapidConfigured = true
    return true
  } catch (e: any) {
    vapidConfigError = e?.message || String(e)
    return false
  }
}

export type PushPayload = {
  title: string
  body?: string
  url?: string
  icon?: string
  tag?: string                // jei pakartotinai siunčiam su tuo pačiu tag — browseris collapse'ina
  data?: Record<string, any>
}

/**
 * Send a web push to ALL of user's registered devices. Silently skips
 * if VAPID not configured; deletes stale subscriptions on 404/410 from
 * push service.
 *
 * Returns count of successful deliveries.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!ensureVapid()) {
    console.warn('[web-push] skipping send: ' + vapidConfigError)
    return 0
  }
  if (!userId) return 0

  const sb = createAdminClient()
  const { data: subs, error } = await sb
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (error) {
    if (/relation .* does not exist/i.test(error.message)) return 0
    console.error('[web-push] fetch subs failed:', error.message)
    return 0
  }
  if (!subs || subs.length === 0) return 0

  const json = JSON.stringify({
    title: payload.title,
    body: payload.body || '',
    url: payload.url || '/',
    icon: payload.icon || '/icon-192.png',
    tag: payload.tag,
    data: payload.data || {},
  })

  let success = 0
  await Promise.all(subs.map(async (s: any) => {
    const sub = {
      endpoint: s.endpoint,
      keys: { p256dh: s.p256dh, auth: s.auth },
    }
    try {
      await webpush.sendNotification(sub, json, { TTL: 60 * 60 * 24 })
      success++
    } catch (e: any) {
      const status = e?.statusCode
      // 404 = unsubscribed, 410 = expired — clean up stale row
      if (status === 404 || status === 410) {
        try {
          await sb.from('push_subscriptions').delete().eq('id', s.id)
        } catch { /* ignore */ }
      } else {
        console.warn('[web-push] send failed:', status, e?.body || e?.message || e)
      }
    }
  }))
  return success
}
