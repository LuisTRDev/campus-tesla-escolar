/* Campus Virtual Tesla · Service worker: notificaciones push y modo sin conexión. */

const SHELL = 'campus-shell-v1'
const ASSETS = 'campus-assets-v1'
const MATERIALS = 'campus-materials-v1'
const KEEP = [SHELL, ASSETS, MATERIALS]
const MAX_MATERIALS = 60
// Archivos de la app: cada publicación trae nombres nuevos, así que se guardan
// los últimos (los de versiones viejas se van solos) para no llenar el celular.
const MAX_ASSETS = 150

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil((async () => {
  for (const name of await caches.keys()) if (!KEEP.includes(name)) await caches.delete(name)
  await self.clients.claim()
})()))

// Guarda una copia y deja como mucho MAX entradas (las más antiguas se van).
async function putLimited(cacheName, key, response, max) {
  const cache = await caches.open(cacheName)
  await cache.put(key, response)
  if (!max) return
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i])
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // Pantallas: primero la red (para ver la versión nueva); sin conexión, la última guardada.
  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req)
        if (res.ok) putLimited(SHELL, '/index.html', res.clone())
        return res
      } catch {
        return (await caches.match('/index.html')) || Response.error()
      }
    })())
    return
  }

  // Archivos de la app con hash: nunca cambian, se sirven desde la copia.
  if (url.origin === self.location.origin && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/images/') || url.pathname === '/theme-init.js')) {
    event.respondWith((async () => {
      const hit = await caches.match(req)
      if (hit) return hit
      const res = await fetch(req)
      if (res.ok) putLimited(ASSETS, req, res.clone(), MAX_ASSETS)
      return res
    })())
    return
  }

  // Materiales del curso ya abiertos (enlaces firmados): se guardan sin el token.
  if (url.pathname.includes('/storage/v1/object/sign/campus-materials/')) {
    const key = url.origin + url.pathname
    event.respondWith((async () => {
      try {
        const res = await fetch(req)
        if (res.ok && res.status === 200) putLimited(MATERIALS, key, res.clone(), MAX_MATERIALS)
        return res
      } catch {
        return (await caches.match(key)) || Response.error()
      }
    })())
  }
})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'Campus Tesla', body: event.data ? event.data.text() : '' }
  }
  const data = payload.data || {}
  const actions = []
  if (payload.kind === 'DIGEST' && data.share_text) {
    actions.push({ action: 'whatsapp', title: 'Compartir por WhatsApp' })
  }
  event.waitUntil(self.registration.showNotification(payload.title || 'Campus Tesla', {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag,
    renotify: !!payload.tag,
    lang: 'es-PE',
    actions,
    data: { url: payload.url || '/', share_text: data.share_text || null },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}

  if (event.action === 'whatsapp' && data.share_text) {
    event.waitUntil(self.clients.openWindow('https://wa.me/?text=' + encodeURIComponent(data.share_text)))
    return
  }

  const target = new URL(data.url || '/', self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.focus()
        if ('navigate' in client) return client.navigate(target)
        return
      }
    }
    return self.clients.openWindow(target)
  })())
})
