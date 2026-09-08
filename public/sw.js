/**
 * What keeps the till on screen when the network is gone.
 *
 * Offline selling already worked — the menu is cached, the sale is priced on
 * the device and queued in IndexedDB. What did not work was staying in the
 * app. Every screen change in the App Router is a fetch: `router.push` asks
 * the server for the route's payload, and when that fails Next falls back to a
 * full document navigation. With no network and no service worker, the
 * browser answers that with its own error page, and the whole till — cart,
 * queue counter, banner and all — is replaced by a dinosaur. Reloading the tab
 * did the same thing. A cashier who pressed "Create invoice" on a disconnected
 * till watched the app disappear at the moment it was supposed to be proving
 * it could carry on.
 *
 * So this answers navigations from a cache when the network cannot, and the
 * app reboots out of that cache instead of vanishing.
 *
 * The one rule that matters more than any other: anything under /api is never
 * touched.
 * The whole offline path hangs off requests genuinely failing — `isOfflineError`
 * in api.js is what the till tests before it prices a sale locally. A cached
 * 200 from /api/menu would tell a disconnected till it was online, and it
 * would sit there waiting for a checkout that can never answer. Serving stale
 * data here would not degrade the feature, it would disable it.
 */

const VERSION = 'v1'
const SHELL = `cafe-pos-shell-${VERSION}`
const ASSETS = `cafe-pos-assets-${VERSION}`
const OURS = [SHELL, ASSETS]

const OFFLINE_PAGE = '/offline.html'

/**
 * Screens worth having before they are needed.
 *
 * `/invoices/__warm` is not a typo and not a real invoice. The invoice screen
 * is a client component that fetches its own sale, so the server renders the
 * same skeleton for every id — which is exactly what makes one cached copy
 * usable for all of them (see shellKey below). Asking for a made-up id gets
 * that skeleton without needing to know a real invoice number.
 */
const WARM = ['/orders', '/invoices', '/invoices/__warm']

/**
 * The cache key for a document.
 *
 * Most routes are their own key. A route may be *templated* — one cached copy
 * answering for every parameter value — only when the server's HTML is
 * identical whatever the parameter is. That holds for the invoice screen
 * because it renders a skeleton and lets the client fetch the sale, and it is
 * the whole reason a receipt for `inv-5183` can be shown on a till that has
 * never once loaded that URL.
 *
 * Do not add a route here whose server-rendered HTML depends on its id. It
 * would show one sale's data under another sale's address, which is a worse
 * failure than the error page this file exists to prevent.
 */
function shellKey(pathname) {
  if (/^\/invoices\/[^/]+\/?$/.test(pathname) && pathname !== '/invoices/') {
    return '/__shell/invoices/[invoiceId]'
  }
  return pathname.replace(/\/$/, '') || '/'
}

/** A route payload request rather than a document — Next's `?_rsc=` fetch. */
function isRscRequest(request, url) {
  return url.searchParams.has('_rsc') || request.headers.get('RSC') === '1'
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((cache) => cache.add(OFFLINE_PAGE))
      // A failed precache must not leave the worker unable to install; the
      // fallback page is the least important thing here.
      .catch(() => {})
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => !OURS.includes(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  )
})

/**
 * Messages from the page.
 *
 * `warm` is sent once somebody is signed in, and not before. Warming earlier
 * would fetch these screens without a session, follow the middleware redirect
 * to /login, and cache the login page under /orders — so a till that lost its
 * connection would "recover" onto a sign-in form it cannot submit. Hence the
 * redirect check below.
 *
 * `clear` is sent on sign-out, because these documents are one café's screens
 * wearing one café's branding and they should not outlive the session.
 */
self.addEventListener('message', (event) => {
  const type = event.data?.type
  if (type === 'warm') {
    event.waitUntil(warm())
  } else if (type === 'clear') {
    event.waitUntil(Promise.all(OURS.map((n) => caches.delete(n))))
  }
})

async function warm() {
  const cache = await caches.open(SHELL)
  await Promise.all(WARM.map(async (path) => {
    try {
      const res = await fetch(path, { credentials: 'same-origin' })
      if (!res.ok || res.redirected) return
      const html = await res.clone().text()
      await cache.put(shellKey(new URL(path, self.location.origin).pathname), res)
      await warmScripts(html)
    } catch {
      // Warming is opportunistic. Every one of these gets cached anyway the
      // first time somebody actually opens it.
    }
  }))
}

/**
 * The code a warmed screen needs, which nothing has yet asked for.
 *
 * A warmed page is one the till has never opened, so while its HTML is now
 * held, the scripts that HTML names have never been fetched — no browser has
 * rendered it. Offline that produces the worst of both worlds: the document is
 * served from cache, and then every script on it fails. The receipt screen is
 * exactly this case, and it is the screen the whole feature is for.
 *
 * Pulling them out of the markup rather than listing them, because the names
 * are content-hashed and change with every build. Anything already held is
 * skipped, so this costs one request per genuinely new file.
 */
async function warmScripts(html) {
  const cache = await caches.open(ASSETS)
  const paths = new Set(html.match(/\/_next\/static\/[^"'\\\s)]+/g) || [])
  await Promise.all([...paths].map(async (path) => {
    if (await cache.match(path)) return
    try {
      const res = await fetch(path, { credentials: 'same-origin' })
      if (res.ok) await cache.put(path, res)
    } catch {
      // One missing chunk is not worth abandoning the rest of the warm for.
    }
  }))
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // The line this worker must not cross. See the note at the top.
  if (url.pathname.startsWith('/api/')) return

  // Left to fail on purpose. Next answers a failed route-payload fetch with a
  // full document navigation, and the handler below turns that into a cached
  // screen. Serving a payload from cache here would instead hand the router a
  // tree built for whichever URL happened to be cached.
  if (isRscRequest(request, url)) return

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigate(request, url))
    return
  }

  // Content-hashed and immutable: the only copy that will ever exist under
  // this name is the one already held.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request))
    return
  }

  event.respondWith(networkFirstAsset(request))
})

/**
 * A screen change, or a reload.
 *
 * Network first, always — the server is the authority on what a screen says,
 * and a café that is online must never be shown yesterday's page. The cache is
 * only consulted once the network has actually failed.
 */
async function handleNavigate(request, url) {
  const key = shellKey(url.pathname)
  try {
    const res = await fetch(request)
    // Only a real page is worth keeping. A redirect to /login, a 404 or a 500
    // cached under this key would be served back for the rest of the outage.
    if (res.ok && !res.redirected && url.pathname !== '/login') {
      const cache = await caches.open(SHELL)
      void cache.put(key, res.clone())
    }
    return res
  } catch {
    const cache = await caches.open(SHELL)
    const hit = await cache.match(key)
    if (hit) return hit
    const fallback = await cache.match(OFFLINE_PAGE)
    if (fallback) return fallback
    return new Response('Offline.', { status: 503, headers: { 'Content-Type': 'text/plain' } })
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSETS)
  const hit = await cache.match(request)
  if (hit) return hit
  const res = await fetch(request)
  if (res.ok) void cache.put(request, res.clone())
  return res
}

async function networkFirstAsset(request) {
  const cache = await caches.open(ASSETS)
  try {
    const res = await fetch(request)
    if (res.ok) void cache.put(request, res.clone())
    return res
  } catch {
    const hit = await cache.match(request)
    if (hit) return hit
    throw new Error('offline')
  }
}
