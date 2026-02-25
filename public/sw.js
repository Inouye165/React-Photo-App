const CACHE_NAME = 'lumina-shell-v1'
const SHELL_ASSETS = ['/', '/index.html', '/manifest.json']

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.map((key) => (key === CACHE_NAME ? Promise.resolve() : caches.delete(key))))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== 'GET') return
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(request)
        const cache = await caches.open(CACHE_NAME)
        cache.put('/index.html', networkResponse.clone())
        return networkResponse
      } catch {
        const cached = await caches.match('/index.html')
        return cached || Response.error()
      }
    })())
    return
  }

  event.respondWith((async () => {
    const cached = await caches.match(request)
    if (cached) return cached

    try {
      const networkResponse = await fetch(request)
      if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/chess-hub/')) {
        const cache = await caches.open(CACHE_NAME)
        cache.put(request, networkResponse.clone())
      }
      return networkResponse
    } catch {
      return cached || Response.error()
    }
  })())
})
