const CACHE = 'phaze-shell-v2'

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Never cache: API, websocket, uploads, or anything dynamic.
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/ws') ||
      url.pathname.startsWith('/uploads') || url.pathname.startsWith('/public')) return

  // HTML navigation: always network-first so deploys take effect immediately.
  // Fall back to cache only when offline.
  if (req.mode === 'navigate' || url.pathname.endsWith('.html') ||
      url.pathname === '/web/' || url.pathname === '/web') {
    event.respondWith(
      fetch(req).then((resp) => {
        if (resp.ok) {
          const copy = resp.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
        }
        return resp
      }).catch(() => caches.match(req).then((hit) => hit || caches.match('/web/index.html')))
    )
    return
  }

  // Hashed assets (JS/CSS with content hash in filename): cache-first, they never change.
  if (url.pathname.startsWith('/web/assets/')) {
    event.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit
        return fetch(req).then((resp) => {
          if (resp.ok) {
            const copy = resp.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return resp
        })
      })
    )
    return
  }

  // Everything else: network with cache fallback.
  event.respondWith(
    fetch(req).then((resp) => {
      if (resp.ok && resp.type === 'basic') {
        const copy = resp.clone()
        caches.open(CACHE).then((c) => c.put(req, copy))
      }
      return resp
    }).catch(() => caches.match(req).then((hit) => hit || Response.error()))
  )
})

// Where a tap should take you, carried as a query string the app reads on
// load (and as a message to a window that's already open).
function openTarget(data) {
  if ((data.kind === 'dm' || data.kind === 'missed_call' || !data.kind) && data.sender) {
    return { chat: data.sender }
  }
  if ((data.kind === 'channel' || data.kind === 'mention') && data.server_id) {
    return { space: data.server_id }
  }
  return {}
}

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = {} }
  const title = data.title || 'Phaze'
  const body = data.body || 'New message'
  // One notification per conversation, so two chats don't overwrite each other.
  const thread = data.channel_id ? `ch:${data.channel_id}`
    : data.convo_id ? `convo:${data.convo_id}`
    : data.sender ? `${data.kind || 'dm'}:${data.sender}`
    : 'phaze-msg'
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/web/favicon.svg',
      badge: '/web/favicon.svg',
      tag: thread,
      renotify: true,
      data: openTarget(data),
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data || {}
  const params = new URLSearchParams()
  if (target.chat) params.set('open_chat', target.chat)
  if (target.space) params.set('open_space', target.space)
  const url = '/web/' + (params.toString() ? `?${params}` : '')
  event.waitUntil((async () => {
    const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true })
    const open = wins.find((w) => new URL(w.url).pathname.startsWith('/web'))
    if (open) {
      await open.focus()
      open.postMessage({ type: 'phaze-open', ...target })
      return
    }
    await clients.openWindow(url)
  })())
})
