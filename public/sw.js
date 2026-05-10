// public/sw.js
//
// Service Worker, kuris klauso Web Push žinučių iš mūsų server'io ir
// rodo native browser notification'us. Užregistruojamas iš lib/push-client.ts
// per navigator.serviceWorker.register('/sw.js').
//
// Žinutės payload (siunčiamas iš lib/web-push.ts):
//   { title, body, url, icon, tag, data }

self.addEventListener('install', (event) => {
  // Aktyvinam iškart be laukimo, kad pirma push'ė pasiektų ASAP.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch (_e) {
    payload = { title: 'music.lt', body: event.data ? event.data.text() : '' }
  }

  const title = payload.title || 'music.lt'
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.tag || 'musiclt-notification',
    data: { url: payload.url || '/', ...(payload.data || {}) },
    // renotify: jeigu su tuo pačiu tag jau yra notification, nauja vis tiek
    // sukels skambutį/vibraciją (kitaip browseris tyliai pakeičia turinį).
    renotify: !!payload.tag,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil((async () => {
    // Jei jau yra atviras tab'as ant musiclt — focus'inam, navigate'inam.
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of allClients) {
      if (client.url && client.url.includes(self.location.origin)) {
        client.focus()
        if ('navigate' in client) {
          try { await client.navigate(url) } catch (_e) { /* ignore */ }
        }
        return
      }
    }
    // Antraip atidarom naują tab'ą.
    if (self.clients.openWindow) {
      await self.clients.openWindow(url)
    }
  })())
})
