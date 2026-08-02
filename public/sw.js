// Minimal service worker — only handles push delivery + notification taps.
// Deliberately NOT a full offline-caching Workbox setup; that's a separate
// concern this feature doesn't need.

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'RACS2', body: event.data ? event.data.text() : '' }
  }

  const title = data.title || 'RACS2'
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// Focuses an already-open tab on the right page if one exists, otherwise
// opens a new one — rather than always opening a fresh tab per notification.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        const clientUrl = new URL(client.url)
        if (clientUrl.pathname === url && 'focus' in client) {
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url)
      }
    })
  )
})
