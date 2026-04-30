// lib/push-client.ts
//
// Browser-side Web Push integration. Registruoja /sw.js service worker'į,
// prašo Notification permission, subscribe'ina į VAPID push service ir
// posts'ina subscription objektą į /api/push/subscribe.
//
// Naudojama iš PushNotificationToggle settings UI.

export type PushStatus =
  | 'unsupported'      // browser nepalaiko Notification/Push API
  | 'not-configured'   // server'is neturi VAPID public key (env vars)
  | 'denied'           // user'is atmetė permission
  | 'subscribed'       // įjungta + endpoint registered
  | 'unsubscribed'     // ne-įjungta (default permission), bet galima subscribe'inti

export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

async function fetchVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch('/api/push/vapid-public-key')
    const json = await res.json()
    return json.publicKey || null
  } catch {
    return null
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i)
  return out
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    const existing = await navigator.serviceWorker.getRegistration('/sw.js')
    if (existing) return existing
    return await navigator.serviceWorker.register('/sw.js')
  } catch (e) {
    console.warn('[push] sw register failed', e)
    return null
  }
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!isPushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await getRegistration()
  if (!reg) return 'unsupported'
  const sub = await reg.pushManager.getSubscription()
  if (sub) return 'subscribed'
  const key = await fetchVapidPublicKey()
  if (!key) return 'not-configured'
  return 'unsubscribed'
}

/** Įjungia push: prašo permission, subscribe'ina, registruoja server'yje. */
export async function enablePush(): Promise<{ ok: boolean; status: PushStatus; error?: string }> {
  if (!isPushSupported()) return { ok: false, status: 'unsupported' }
  const key = await fetchVapidPublicKey()
  if (!key) return { ok: false, status: 'not-configured', error: 'VAPID viešas raktas nesukonfigūruotas serveryje' }

  // Permission
  let perm = Notification.permission
  if (perm !== 'granted') {
    perm = await Notification.requestPermission()
  }
  if (perm !== 'granted') return { ok: false, status: 'denied' }

  const reg = await getRegistration()
  if (!reg) return { ok: false, status: 'unsupported' }

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      // Cast: TS DOM types ant naujesnių lib'ų reikalauja BufferSource su
      // ArrayBuffer, mūsų Uint8Array<ArrayBufferLike> tipažas ne tas pats
      // pavadinimas, bet runtime visiškai kompatibilus.
      applicationServerKey: urlBase64ToUint8Array(key) as unknown as BufferSource,
    })
  }

  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  })
  if (!res.ok) {
    return { ok: false, status: 'unsubscribed', error: `Server'is grąžino ${res.status}` }
  }
  return { ok: true, status: 'subscribed' }
}

/** Išjungia push: pašalina subscription'ą iš browser'io ir server'io. */
export async function disablePush(): Promise<{ ok: boolean }> {
  const reg = await getRegistration()
  if (!reg) return { ok: true }
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return { ok: true }
  const endpoint = sub.endpoint
  try {
    await sub.unsubscribe()
  } catch { /* ignore */ }
  try {
    await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    })
  } catch { /* ignore */ }
  return { ok: true }
}
