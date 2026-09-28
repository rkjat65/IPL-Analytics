/* Crickrida service worker: installable app + offline reading.
 *
 * - Pages: network first, fall back to the last cached copy (or the
 *   dashboard shell) when offline.
 * - Hashed assets, fonts, icons: cache first (they never change).
 * - Public API data and player thumbnails: serve the cached copy instantly
 *   and refresh it in the background (stale-while-revalidate).
 * Admin, auth and social requests are never cached.
 */
// Bump whenever bundled analytics data or the API response shape changes so
// installed clients cannot keep showing names/stats from an older database.
const VERSION = 'v3-player-identities'
const STATIC = `crickrida-static-${VERSION}`
const PAGES = `crickrida-pages-${VERSION}`
const DATA = `crickrida-data-${VERSION}`
const SHELL = '/dashboard'
const MAX_DATA_ENTRIES = 300
const MAX_PAGE_ENTRIES = 60

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(PAGES).then(cache => cache.add(SHELL)).catch(() => {}))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([STATIC, PAGES, DATA])
    for (const key of await caches.keys()) {
      if (key.startsWith('crickrida-') && !keep.has(key)) await caches.delete(key)
    }
    await self.clients.claim()
  })())
})

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i])
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGES)
  try {
    const response = await fetch(request)
    if (response.ok) {
      cache.put(request, response.clone())
      trim(PAGES, MAX_PAGE_ENTRIES)
    }
    return response
  } catch {
    return (await cache.match(request)) || (await cache.match(SHELL)) || Response.error()
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  if (response.ok) cache.put(request, response.clone())
  return response
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(DATA)
  const hit = await cache.match(event.request)
  const refresh = fetch(event.request).then(response => {
    if (response.ok) {
      cache.put(event.request, response.clone())
      trim(DATA, MAX_DATA_ENTRIES)
    }
    return response
  })
  if (hit) {
    event.waitUntil(refresh.catch(() => {}))
    return hit
  }
  return refresh
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  const path = url.pathname

  if (path.startsWith('/api/auth') || path.startsWith('/api/social') || path.startsWith('/admin') || path === '/sw.js') return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request))
  } else if (path.startsWith('/assets/') || path.startsWith('/fonts/') || path.startsWith('/icons/')) {
    event.respondWith(cacheFirst(request))
  } else if (path.startsWith('/api/') && !path.startsWith('/api/og') && !path.startsWith('/api/quiz')) {
    event.respondWith(staleWhileRevalidate(event))
  }
})
